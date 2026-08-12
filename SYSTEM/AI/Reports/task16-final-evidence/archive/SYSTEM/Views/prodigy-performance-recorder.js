(function (root, factory) {
  "use strict";
  const api = factory(root);
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root) root.ProdigyPerformanceRecorder = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (root) {
  "use strict";

  const SCHEMA_VERSION = 1;
  const RECEIPT_TYPE = "prodigy-performance-receipt";
  const CONTROL_CLOCK = "performance.now";
  const HASH_ALGORITHM = "sha256";
  const HASH_FIELDS = Object.freeze(["receipt_sha256", "canonical_sha256", "self_hash", "hash"]);
  const REQUIRED_MARKS = Object.freeze(["hub_start", "shell_mounted", "primary_action_ready"]);
  const DEFAULT_MODULE_ALLOWLIST = Object.freeze([
    "SYSTEM/Views/",
    "SYSTEM/SCRIPTS/",
    "SYSTEM/AI/Skills/"
  ]);
  const APPROVED_PHASES = Object.freeze([
    "hub_start",
    "module_start",
    "module_end",
    "shell_mounted",
    "data_scan",
    "data_scan_start",
    "data_scan_end",
    "data_read",
    "data_read_start",
    "data_read_end",
    "projection",
    "projection_start",
    "projection_end",
    "dom_render",
    "dom_render_start",
    "dom_render_end",
    "primary_action_ready",
    "optional_start",
    "optional_end",
    "error",
    "retry",
    "disposed"
  ]);
  const PHASE_SET = new Set(APPROVED_PHASES);
  const START_END = Object.freeze({
    module: ["module_start", "module_end"],
    data_scan: ["data_scan_start", "data_scan_end"],
    data_read: ["data_read_start", "data_read_end"],
    projection: ["projection_start", "projection_end"],
    dom_render: ["dom_render_start", "dom_render_end"],
    optional: ["optional_start", "optional_end"]
  });
  const MAX = Object.freeze({
    id: 128,
    workspace: 160,
    module: 240,
    reason: 240,
    code: 80,
    marks: 512,
    failures: 128,
    missing: 64,
    modules: 64
  });

  function error(code, message) {
    const value = new Error(message);
    value.code = code;
    return value;
  }

  function boundedString(value, field, limit, required) {
    if (value === undefined || value === null) {
      if (required) throw error("missing_" + field, field + " is required");
      return undefined;
    }
    if (typeof value !== "string") throw error("invalid_" + field, field + " must be a string");
    const text = value.trim();
    if (required && text.length === 0) throw error("invalid_" + field, field + " must not be empty");
    if (text.length > limit) throw error("oversized_" + field, field + " exceeds its bound");
    return text;
  }

  function safeRelativePath(value) {
    if (typeof value !== "string" || value.length === 0 || value.length > MAX.module) return false;
    if (value.indexOf("\\") !== -1 || value.indexOf("\u0000") !== -1) return false;
    if (value.startsWith("/") || value.startsWith("~") || /^[A-Za-z][A-Za-z0-9+.-]*:/.test(value)) return false;
    const parts = value.split("/");
    return parts.every((part) => part.length > 0 && part !== "." && part !== "..");
  }

  function allowlistedModulePath(value, allowlist) {
    if (!safeRelativePath(value)) return false;
    const list = Array.isArray(allowlist) && allowlist.length > 0 ? allowlist : DEFAULT_MODULE_ALLOWLIST;
    return list.some((entry) => {
      if (typeof entry === "string") return value === entry || value.startsWith(entry.endsWith("/") ? entry : entry + "/");
      return entry instanceof RegExp && entry.test(value);
    });
  }

  function modulePath(value, allowlist) {
    const text = boundedString(value, "module_path", MAX.module, true);
    if (!allowlistedModulePath(text, allowlist)) throw error("unsafe_module_path", "module_path is not allowlisted: " + text);
    return text;
  }

  function assertNoContentKey(key) {
    if (/^(?:content|body|note|user_?content|raw_?text|vault_?text|markdown)$/i.test(key)) {
      throw error("user_content_forbidden", "user or note content is not accepted");
    }
    if (key !== "secrets_removed" && /(?:token|secret|password|passwd|api[_-]?key|authorization|cookie|credential|private[_-]?key)/i.test(key)) {
      throw error("secret_forbidden", "secret-like metadata is not accepted");
    }
  }

  function finiteNumber(value, field, min) {
    if (typeof value !== "number" || !Number.isFinite(value) || (min !== undefined && value < min)) {
      throw error("invalid_" + field, field + " must be a finite number");
    }
    return value;
  }

  function utf8(value) {
    if (value instanceof Uint8Array) return value;
    if (typeof TextEncoder !== "undefined") return new TextEncoder().encode(String(value));
    const encoded = encodeURIComponent(String(value));
    const bytes = [];
    for (let i = 0; i < encoded.length; i += 1) {
      if (encoded[i] === "%") {
        bytes.push(Number.parseInt(encoded.slice(i + 1, i + 3), 16));
        i += 2;
      } else bytes.push(encoded.charCodeAt(i));
    }
    return Uint8Array.from(bytes);
  }

  function canonicalize(value, stack) {
    const seen = stack || new Set();
    if (value === null || typeof value === "string" || typeof value === "boolean") return value;
    if (typeof value === "number") {
      if (!Number.isFinite(value)) throw error("non_finite", "canonical values must be finite");
      return Object.is(value, -0) ? 0 : value;
    }
    if (typeof value === "bigint") return String(value);
    if (typeof value !== "object") throw error("non_json_value", "canonical values must be JSON-compatible");
    if (seen.has(value)) throw error("circular_value", "canonical value is circular");
    seen.add(value);
    let result;
    if (Array.isArray(value)) result = value.map((item) => canonicalize(item, seen));
    else {
      result = {};
      Object.keys(value).sort().forEach((key) => {
        assertNoContentKey(key);
        if (value[key] !== undefined) result[key] = canonicalize(value[key], seen);
      });
    }
    seen.delete(value);
    return result;
  }

  function canonicalBytes(value) {
    return utf8(JSON.stringify(canonicalize(value)));
  }

  function rotateRight(value, bits) { return (value >>> bits) | (value << (32 - bits)); }
  function choose(x, y, z) { return (x & y) ^ (~x & z); }
  function majority(x, y, z) { return (x & y) ^ (x & z) ^ (y & z); }
  function sigma0(x) { return rotateRight(x, 2) ^ rotateRight(x, 13) ^ rotateRight(x, 22); }
  function sigma1(x) { return rotateRight(x, 6) ^ rotateRight(x, 11) ^ rotateRight(x, 25); }
  function gamma0(x) { return rotateRight(x, 7) ^ rotateRight(x, 18) ^ (x >>> 3); }
  function gamma1(x) { return rotateRight(x, 17) ^ rotateRight(x, 19) ^ (x >>> 10); }

  const ROUND_CONSTANTS = Object.freeze([
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
  ]);
  const INITIAL_STATE = Object.freeze([0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19]);

  function sha256Bytes(input) {
    const bytes = input instanceof Uint8Array ? input : utf8(input);
    const bitLength = bytes.length * 8;
    const paddedLength = Math.ceil((bytes.length + 9) / 64) * 64;
    const padded = new Uint8Array(paddedLength);
    padded.set(bytes);
    padded[bytes.length] = 0x80;
    const view = new DataView(padded.buffer);
    view.setUint32(paddedLength - 8, Math.floor(bitLength / 0x100000000));
    view.setUint32(paddedLength - 4, bitLength >>> 0);
    const state = INITIAL_STATE.slice();
    const words = new Uint32Array(64);
    for (let offset = 0; offset < paddedLength; offset += 64) {
      for (let index = 0; index < 16; index += 1) words[index] = view.getUint32(offset + index * 4);
      for (let index = 16; index < 64; index += 1) words[index] = (gamma1(words[index - 2]) + words[index - 7] + gamma0(words[index - 15]) + words[index - 16]) >>> 0;
      let [a, b, c, d, e, f, g, h] = state;
      for (let index = 0; index < 64; index += 1) {
        const temp1 = (h + sigma1(e) + choose(e, f, g) + ROUND_CONSTANTS[index] + words[index]) >>> 0;
        const temp2 = (sigma0(a) + majority(a, b, c)) >>> 0;
        [h, g, f, e, d, c, b, a] = [g, f, e, (d + temp1) >>> 0, c, b, a, (temp1 + temp2) >>> 0];
      }
      state[0] = (state[0] + a) >>> 0;
      state[1] = (state[1] + b) >>> 0;
      state[2] = (state[2] + c) >>> 0;
      state[3] = (state[3] + d) >>> 0;
      state[4] = (state[4] + e) >>> 0;
      state[5] = (state[5] + f) >>> 0;
      state[6] = (state[6] + g) >>> 0;
      state[7] = (state[7] + h) >>> 0;
    }
    return state.map((word) => word.toString(16).padStart(8, "0")).join("");
  }

  function sha256(value) {
    // Node's implementation is preferred for byte fidelity; the synchronous fallback keeps the browser API usable.
    if (typeof require === "function") {
      try {
        const crypto = require("node:crypto");
        const bytes = value instanceof Uint8Array ? value : (value && typeof value === "object" ? canonicalBytes(value) : utf8(value));
        return crypto.createHash(HASH_ALGORITHM).update(Buffer.from(bytes)).digest("hex");
      } catch (_error) { /* browser or restricted require; use the local implementation */ }
    }
    return sha256Bytes(value && typeof value === "object" && !(value instanceof Uint8Array) ? canonicalBytes(value) : value);
  }

  function withoutHash(value) {
    if (!value || typeof value !== "object" || Array.isArray(value)) throw error("invalid_receipt", "receipt must be an object");
    const copy = {};
    Object.keys(value).forEach((key) => {
      if (!HASH_FIELDS.includes(key)) copy[key] = value[key];
    });
    return copy;
  }

  function hashReceipt(receipt) {
    return sha256(canonicalBytes(withoutHash(receipt)));
  }

  function validGitSha(value) {
    return typeof value === "string" && /^[0-9a-f]{40,64}$/.test(value);
  }

  function bindFinalGitSha(receipt, finalSha) {
    if (!validGitSha(finalSha)) throw error("invalid_final_git_sha", "final_git_sha must be 40-64 lowercase hexadecimal characters");
    const bound = withoutHash(receipt);
    bound.final_git_sha = finalSha;
    bound.receipt_sha256 = hashReceipt(bound);
    return bound;
  }

  function verifyReceiptHash(receipt) {
    return !!(receipt && typeof receipt.receipt_sha256 === "string" && /^[0-9a-f]{64}$/.test(receipt.receipt_sha256) && hashReceipt(receipt) === receipt.receipt_sha256);
  }

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function normalizePhase(value, ending) {
    const phase = boundedString(value, "phase", MAX.code, true);
    if (phase === "module" || phase === "data_scan" || phase === "data_read" || phase === "projection" || phase === "dom_render" || phase === "optional") {
      return START_END[phase][ending ? 1 : 0];
    }
    if (!PHASE_SET.has(phase)) throw error("invalid_phase", "phase is not approved: " + phase);
    return phase;
  }

  function phaseCategory(phase) {
    return phase.replace(/_(?:start|end)$/, "");
  }

  function dataFields(input, allowModulePaths) {
    const source = input && typeof input === "object" ? input : {};
    const out = {};
    const allowed = ["module_path", "scope", "status", "code", "attempt_id", "cached", "count", "bytes", "reason", "duration_ms", "missing_start"];
    Object.keys(source).forEach((key) => {
      assertNoContentKey(key);
      if (!allowed.includes(key)) return;
      if (key === "module_path") out[key] = modulePath(source[key], allowModulePaths);
      else if (key === "scope" || key === "status" || key === "code" || key === "attempt_id" || key === "reason") out[key] = boundedString(source[key], key, key === "reason" ? MAX.reason : MAX.code, false);
      else if (key === "cached") {
        if (typeof source[key] !== "boolean") throw error("invalid_cached", "cached must be boolean");
        out[key] = source[key];
      } else if (key === "count" || key === "bytes" || key === "duration_ms") out[key] = finiteNumber(source[key], key, 0);
      else if (key === "missing_start") out[key] = !!source[key];
    });
    return out;
  }

  function createRecorder(options) {
    const config = options && typeof options === "object" ? options : {};
    const performanceObject = config.performance || (root && root.performance);
    const now = config.clock && typeof config.clock.now === "function"
      ? () => finiteNumber(config.clock.now(), "clock", 0)
      : performanceObject && typeof performanceObject.now === "function"
        ? () => finiteNumber(performanceObject.now(), "clock", 0)
        : () => { throw error("missing_control_clock", "performance.now is required"); };
    const startedAt = now();
    const correlationStartedAtMs = config.correlation_started_at_ms === undefined ? Date.now() : finiteNumber(config.correlation_started_at_ms, "correlation_started_at_ms", 0);
    const instrumented = config.instrumented !== false && config.mode !== "uninstrumented";
    const mode = instrumented ? "instrumented" : "uninstrumented";
    const allowlist = Array.isArray(config.module_path_allowlist) ? config.module_path_allowlist.slice(0, MAX.modules) : DEFAULT_MODULE_ALLOWLIST.slice();
    const metadata = {
      run_id: boundedString(config.run_id === undefined ? "run" : config.run_id, "run_id", MAX.id, true),
      correlation_id: boundedString(config.correlation_id === undefined ? "correlation" : config.correlation_id, "correlation_id", MAX.id, true),
      mount_id: boundedString(config.mount_id, "mount_id", MAX.id, false),
      workspace_id: boundedString(config.workspace_id, "workspace_id", MAX.workspace, false),
      module_path: config.module_path === undefined ? undefined : modulePath(config.module_path, allowlist)
    };
    Object.keys(metadata).forEach((key) => { if (metadata[key] === undefined) delete metadata[key]; });
    const marks = [];
    const failures = [];
    const missing = [];
    const open = new Map();
    let sequence = 0;
    let disposed = false;
    let lastNow = startedAt;
    let finalized = null;

    function timestamp() {
      const value = now();
      if (value < lastNow) throw error("clock_regressed", "control clock moved backwards");
      lastNow = value;
      return value - startedAt;
    }

    function addMark(phaseValue, input, kind) {
      if (marks.length >= MAX.marks) throw error("mark_limit", "mark limit exceeded");
      const phase = normalizePhase(phaseValue, false);
      const fields = dataFields(input, allowlist);
      const at = timestamp();
      const mark = Object.assign({ sequence: sequence += 1, phase, kind: kind || "mark", at_ms: at }, fields);
      if (mark.duration_ms !== undefined) finiteNumber(mark.duration_ms, "duration_ms", 0);
      marks.push(mark);
      return clone(mark);
    }

    function start(phaseValue, input) {
      const phase = normalizePhase(phaseValue, false);
      const category = phaseCategory(phase);
      if (!START_END[category] || phase !== START_END[category][0]) throw error("invalid_start_phase", "start requires a paired phase");
      const fields = dataFields(input, allowlist);
      const mark = addMark(phase, fields, "start");
      const key = category + "\u0000" + (fields.module_path || "") + "\u0000" + (fields.scope || "");
      if (open.has(key) && !missing.includes(phase)) missing.push(phase);
      open.set(key, { category, phase, at_ms: mark.at_ms, sequence: mark.sequence });
      return Object.freeze({ key, category, sequence: mark.sequence });
    }

    function end(tokenOrPhase, input) {
      const source = input && typeof input === "object" ? input : {};
      let category;
      let token;
      if (tokenOrPhase && typeof tokenOrPhase === "object" && tokenOrPhase.key) {
        token = tokenOrPhase;
        category = token.category;
      } else {
        const phase = normalizePhase(tokenOrPhase, true);
        category = phaseCategory(phase);
      }
      if (!START_END[category]) throw error("invalid_end_phase", "end requires a paired phase");
      const fields = dataFields(source, allowlist);
      const key = token && token.key ? token.key : category + "\u0000" + (fields.module_path || "") + "\u0000" + (fields.scope || "");
      const started = open.get(key);
      const phase = START_END[category][1];
      const at = timestamp();
      if (!started) {
        if (!missing.includes(START_END[category][0])) missing.push(START_END[category][0]);
        if (marks.length >= MAX.marks) throw error("mark_limit", "mark limit exceeded");
        const mark = Object.assign({ sequence: sequence += 1, phase, kind: "end", at_ms: at, missing_start: true }, fields);
        marks.push(mark);
        return clone(mark);
      }
      open.delete(key);
      const mark = Object.assign({ sequence: sequence += 1, phase, kind: "end", at_ms: at, duration_ms: at - started.at_ms }, fields);
      marks.push(mark);
      return clone(mark);
    }

    function mark(phase, input) { return addMark(phase, input, "mark"); }

    function recordFailure(value, input) {
      const source = input && typeof input === "object" ? input : {};
      const message = value && value.message ? String(value.message) : String(value || "error");
      const code = source.code || (value && value.code) || "error";
      const safeCode = boundedString(code, "code", MAX.code, true);
      const failure = { code: safeCode, phase: source.phase && normalizePhase(source.phase, false), message: message.replace(/[\r\n]+/g, " ").slice(0, MAX.reason) };
      if (!failure.phase) delete failure.phase;
      failures.push(failure);
      if (failures.length > MAX.failures) throw error("failure_limit", "failure limit exceeded");
      addMark("error", { code: safeCode, reason: failure.message }, "failure");
      return clone(failure);
    }

    function retry(input) { return addMark("retry", dataFields(input, allowlist), "retry"); }

    function recordMissing(phaseValue) {
      const phase = normalizePhase(phaseValue, false);
      if (!missing.includes(phase)) missing.push(phase);
      return phase;
    }

    function completeMissing() {
      REQUIRED_MARKS.forEach((phase) => {
        if (!marks.some((item) => item.phase === phase) && !missing.includes(phase)) missing.push(phase);
      });
      START_END ? Array.from(open.values()).forEach((item) => {
        if (!missing.includes(item.phase)) missing.push(item.phase);
      }) : null;
      if (instrumented && marks.length > 0 && !marks.some((item) => item.phase === "disposed") && !missing.includes("disposed")) missing.push("disposed");
      return missing.slice();
    }

    function buildReceipt(extra) {
      const additions = extra && typeof extra === "object" ? extra : {};
      if (finalized) {
        if (additions.final_git_sha) {
          finalized = bindFinalGitSha(finalized, additions.final_git_sha);
        }
        return clone(finalized);
      }
      const at = timestamp();
      const coldWarm = additions.cold_warm === undefined ? config.cold_warm : additions.cold_warm;
      if (coldWarm !== "cold" && coldWarm !== "warm") throw error("missing_cold_warm", "cold_warm must be explicitly cold or warm");
      const receipt = {
        schema_version: SCHEMA_VERSION,
        receipt_type: RECEIPT_TYPE,
        run_id: metadata.run_id,
        correlation_id: metadata.correlation_id,
        correlation_started_at_ms: correlationStartedAtMs,
        control_clock: { name: CONTROL_CLOCK, monotonic: true, unit: "ms" },
        mode,
        instrumented,
        cold_warm: coldWarm,
        metadata: clone(metadata),
        marks: marks.map(clone),
        failures: failures.map(clone),
        missing_marks: completeMissing(),
        duration_ms: at,
        physical_claim_status: "not_proven",
        physical_device_success: false,
        redaction: { applied: true, user_content_excluded: true, secrets_removed: true },
        attribution: {
          external_start_status: additions.external_start_status || config.external_start_status || "not_measured",
          external_start_duration_ms: additions.external_start_duration_ms === undefined ? (config.external_start_duration_ms === undefined ? null : finiteNumber(config.external_start_duration_ms, "external_start_duration_ms", 0)) : finiteNumber(additions.external_start_duration_ms, "external_start_duration_ms", 0),
          icloud_status: additions.icloud_status || config.icloud_status || "not_measured",
          product_status: instrumented ? "measured" : "not_measured"
        }
      };
      ["source_sha256", "settings_sha256", "configuration_sha256", "final_git_sha", "campaign_id", "sample_id"].forEach((key) => {
        const value = additions[key] === undefined ? config[key] : additions[key];
        if (value !== undefined) receipt[key] = boundedString(value, key, key.endsWith("sha256") ? 64 : MAX.id, true);
      });
      if (additions.counts && typeof additions.counts === "object") {
        receipt.counts = {};
        ["scanned", "read", "projected", "rendered", "bytes"].forEach((key) => {
          if (additions.counts[key] !== undefined) receipt.counts[key] = finiteNumber(additions.counts[key], key, 0);
        });
      }
      if (additions.discarded !== undefined) receipt.discarded = !!additions.discarded;
      const wantedSha = additions.final_git_sha || config.final_git_sha;
      const bound = wantedSha ? bindFinalGitSha(receipt, wantedSha) : receipt;
      if (!wantedSha && (additions.hash === true || config.hash === true)) bound.receipt_sha256 = hashReceipt(bound);
      finalized = bound;
      return clone(bound);
    }

    function dispose(input) {
      if (!disposed) {
        disposed = true;
        addMark("disposed", input, "mark");
      }
      return buildReceipt(input);
    }

    function measure(phaseValue, operation, input) {
      const token = start(phaseValue, input);
      let result;
      try { result = operation(); } catch (cause) { recordFailure(cause, { phase: phaseCategory(token.category) }); end(token, input); throw cause; }
      if (result && typeof result.then === "function") {
        return result.then((value) => { end(token, input); return value; }, (cause) => { recordFailure(cause, { phase: phaseCategory(token.category) }); end(token, input); throw cause; });
      }
      end(token, input);
      return result;
    }

    return Object.freeze({
      mark,
      record: mark,
      start,
      startPhase: start,
      end,
      endPhase: end,
      measure,
      retry,
      recordRetry: retry,
      recordFailure,
      fail: recordFailure,
      recordMissing,
      dispose,
      finalize: buildReceipt,
      getReceipt: buildReceipt,
      toJSON: buildReceipt,
      get marks() { return marks.map(clone); },
      get failures() { return failures.map(clone); },
      get missing_marks() { return completeMissing(); }
    });
  }

  const api = Object.freeze({
    SCHEMA_VERSION,
    RECEIPT_TYPE,
    CONTROL_CLOCK,
    HASH_ALGORITHM,
    APPROVED_PHASES,
    PHASES: APPROVED_PHASES,
    REQUIRED_MARKS,
    DEFAULT_MODULE_ALLOWLIST,
    createRecorder,
    canonicalize,
    canonicalBytes,
    sha256,
    sha256Bytes,
    hashCanonical: (value) => sha256(canonicalBytes(value)),
    hashReceipt,
    bindFinalGitSha,
    bindFinalSha: bindFinalGitSha,
    verifyReceiptHash,
    safeRelativePath,
    allowlistedModulePath,
    isAllowedModulePath: allowlistedModulePath
  });
  return api;
});
