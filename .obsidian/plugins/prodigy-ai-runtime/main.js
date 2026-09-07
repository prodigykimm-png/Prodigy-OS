"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/main.ts
var main_exports = {};
__export(main_exports, {
  default: () => ProdigyAIRuntimePlugin
});
module.exports = __toCommonJS(main_exports);
var import_obsidian2 = require("obsidian");

// src/errors.ts
function runtimeError(code, message = code) {
  const error = new Error(message);
  error.name = "ProdigyAIRuntimeError";
  error.code = code;
  return error;
}
function classifyHttpStatus(status) {
  if (status === 401 || status === 403) return "secret_missing";
  if (status === 408 || status === 504) return "timeout";
  if (status === 413) return "request_too_large";
  if (status === 429) return "rate_limited";
  if (status === 402) return "quota_exhausted";
  if (status === 404) return "model_unavailable";
  return status >= 500 ? "route_unreachable" : "transport_error";
}
function classifyProcessFailure(stderr, exitCode) {
  const text = String(stderr || "").toLowerCase();
  if (/quota|usage limit|limit reached/u.test(text)) return "quota_exhausted";
  if (/login|required authentication|sign.?in|oauth/u.test(text)) return "login_required";
  if (/not found|enoent/u.test(text) || exitCode === 127) return "executable_missing";
  if (/timeout|timed out/u.test(text)) return "timeout";
  return "transport_error";
}

// src/adapters/cli.ts
function allowedExecutable(kind, executable) {
  if (kind === "codex") {
    return executable === "codex" || executable === "/Applications/ChatGPT.app/Contents/Resources/codex" || executable === "/Applications/Codex.app/Contents/Resources/codex";
  }
  return executable === "agy" || /\/(?:\.local\/bin|bin)\/agy$/u.test(executable);
}
function unwrapEnvelope(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  const envelope = value;
  if (envelope.event === "result" && envelope.result !== void 0) {
    return unwrapEnvelope(envelope.result);
  }
  if (envelope.structured_output !== void 0) return envelope.structured_output;
  if (typeof envelope.response === "string") return envelope.response;
  if (typeof envelope.output === "string") return envelope.output;
  return value;
}
function parseJson(text) {
  const raw = text.trim();
  if (!raw) throw runtimeError("malformed_transport_response");
  try {
    const unwrapped = unwrapEnvelope(JSON.parse(raw));
    return typeof unwrapped === "string" ? JSON.parse(unwrapped) : unwrapped;
  } catch (_error) {
    const lines = raw.split(/\r?\n/u).map((line) => line.trim()).filter(Boolean);
    for (let index = lines.length - 1; index >= 0; index -= 1) {
      try {
        const event = JSON.parse(lines[index] || "");
        const unwrapped = unwrapEnvelope(event);
        if (unwrapped !== event) return typeof unwrapped === "string" ? JSON.parse(unwrapped) : unwrapped;
        const item = event.item;
        const value = typeof item?.text === "string" ? item.text : typeof event.text === "string" ? event.text : "";
        if (value) return JSON.parse(value);
      } catch (_ignored) {
      }
    }
    throw runtimeError("malformed_transport_response");
  }
}
function chatText(text) {
  const raw = text.trim();
  if (!raw) throw runtimeError("malformed_transport_response");
  try {
    const unwrapped = unwrapEnvelope(JSON.parse(raw));
    if (typeof unwrapped === "string") return unwrapped.trim();
  } catch (_error) {
  }
  const lines = raw.split(/\r?\n/u).map((line) => line.trim()).filter(Boolean);
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    try {
      const event = JSON.parse(lines[index] || "");
      const unwrapped = unwrapEnvelope(event);
      if (typeof unwrapped === "string") return unwrapped.trim();
      const item = event.item;
      const value = typeof item?.text === "string" ? item.text : typeof event.text === "string" ? event.text : "";
      if (value) return value;
    } catch (_ignored) {
    }
  }
  return raw;
}
function antigravitySchema(value) {
  if (Array.isArray(value)) return value.map(antigravitySchema);
  if (!value || typeof value !== "object") return value;
  const source = value;
  const rewritten = Object.fromEntries(Object.entries(source).filter(([key]) => key !== "enum").map(([key, entry]) => [key, antigravitySchema(entry)]));
  if (Array.isArray(source.enum)) {
    rewritten.oneOf = source.enum.map((entry) => ({ const: antigravitySchema(entry) }));
  }
  return rewritten;
}
function createCliAdapter(config, dependencies) {
  if (!allowedExecutable(config.kind, config.executable)) throw runtimeError("configuration_missing", "unapproved_executable");
  const adapterProfile = {
    profile_id: config.profile_id,
    provider_key: config.provider_key,
    model: config.model,
    route_class: config.route_class,
    prompt_transport: "stdin",
    capabilities: ["structured-strict", "chat-text", "cancellable"],
    max_input_bytes: 262144,
    max_schema_bytes: 65536,
    max_output_bytes: 524288,
    certification_hash: config.certification_hash
  };
  async function call(request, signal, structured) {
    const cwd = await dependencies.createIsolatedDirectory(request.request_id);
    if (!cwd || /Mobile Documents|\/Dusk(?:\/|$)/u.test(cwd)) {
      await dependencies.removeIsolatedDirectory(cwd).catch(() => void 0);
      throw runtimeError("configuration_missing", "unsafe_cli_cwd");
    }
    const prompt = structured ? `${request.prompt}

Return exactly one JSON value matching this schema:
${JSON.stringify(request.schema)}` : request.prompt;
    const args = config.kind === "codex" ? [
      "exec",
      "--json",
      "--ephemeral",
      "--sandbox",
      "read-only",
      "--skip-git-repo-check",
      ...config.model && config.model !== "runtime-default" ? ["--model", config.model] : [],
      "-"
    ] : [
      "--input-format",
      "stream-json",
      "--output-format",
      "stream-json",
      "--model",
      config.model,
      ...structured ? ["--json-schema", JSON.stringify(antigravitySchema(request.schema))] : [],
      "--sandbox",
      "--disable-slash-commands"
    ];
    try {
      const result = await dependencies.runProcess({
        command: config.executable,
        args,
        cwd,
        input: config.kind === "codex" ? prompt : `${JSON.stringify({ event: "user", message: { content: prompt } })}
`,
        shell: false,
        signal,
        timeout_ms: request.consumer_manifest.timeout_ms
      });
      if (result.exit_code !== 0) throw runtimeError(classifyProcessFailure(result.stderr, result.exit_code));
      return { payload: structured ? parseJson(result.stdout) : { text: chatText(result.stdout) } };
    } finally {
      await dependencies.removeIsolatedDirectory(cwd);
    }
  }
  return {
    profile: adapterProfile,
    requestStructured: ({ request, signal }) => call(request, signal, true),
    requestChat: ({ request, signal }) => call(request, signal, false),
    async cancel() {
      return "cancel_requested";
    }
  };
}

// src/adapters/http.ts
function profile(config) {
  return {
    profile_id: config.profile_id,
    provider_key: config.provider_key,
    model: config.model,
    route_class: config.route_class,
    prompt_transport: "http-body",
    capabilities: ["structured-strict", "chat-text"],
    max_input_bytes: 262144,
    max_schema_bytes: 65536,
    max_output_bytes: 524288,
    certification_hash: config.certification_hash
  };
}
function validateEndpoint(raw, routeClass) {
  let url;
  try {
    url = new URL(raw);
  } catch (_error) {
    throw runtimeError("configuration_missing", "invalid_endpoint");
  }
  if (url.username || url.password || url.hash) throw runtimeError("configuration_missing", "unsafe_endpoint");
  const loopback = ["localhost", "127.0.0.1", "::1", "[::1]"].includes(url.hostname);
  const privateHost = /^10\./u.test(url.hostname) || /^192\.168\./u.test(url.hostname) || /^172\.(?:1[6-9]|2\d|3[01])\./u.test(url.hostname) || /^100\.(?:6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./u.test(url.hostname);
  if (url.hostname === "0.0.0.0" || routeClass === "local" && !loopback && !privateHost || routeClass !== "local" && url.protocol !== "https:") {
    throw runtimeError("configuration_missing", "unsafe_endpoint");
  }
  if (routeClass === "local" && !["http:", "https:"].includes(url.protocol)) throw runtimeError("configuration_missing", "unsafe_endpoint");
  return raw.replace(/\/+$/u, "");
}
async function secret(config, dependencies) {
  if (!config.api_key_secret_id) return "";
  const value = await dependencies.secrets.getSecret(config.api_key_secret_id);
  if (!value) throw runtimeError("secret_missing");
  return value;
}
function textFrom(value) {
  if (!value || typeof value !== "object") return "";
  const record2 = value;
  if (typeof record2.output_text === "string") return record2.output_text;
  if (typeof record2.text === "string") return record2.text;
  if (Array.isArray(record2.outputs)) {
    const texts = record2.outputs.map((entry) => entry && typeof entry === "object" ? entry.text : "").filter((entry) => typeof entry === "string");
    if (texts.length) return texts.join("\n");
  }
  if (Array.isArray(record2.choices) && record2.choices[0] && typeof record2.choices[0] === "object") {
    const message = record2.choices[0].message;
    if (message && typeof message === "object" && typeof message.content === "string") {
      return message.content;
    }
  }
  if (Array.isArray(record2.candidates) && record2.candidates[0] && typeof record2.candidates[0] === "object") {
    const content = record2.candidates[0].content;
    const parts = content?.parts;
    if (Array.isArray(parts)) return parts.map((part) => part && typeof part === "object" ? part.text : "").filter(Boolean).join("\n");
  }
  return "";
}
function structuredPayload(value) {
  const text = textFrom(value).trim();
  if (!text) throw runtimeError("malformed_transport_response");
  try {
    return JSON.parse(text);
  } catch (_error) {
    throw runtimeError("malformed_transport_response");
  }
}
async function execute(dependencies, input) {
  const response = await dependencies.http(input);
  if (!Number.isSafeInteger(response.status) || response.status < 200 || response.status >= 300) {
    throw runtimeError(classifyHttpStatus(response.status));
  }
  return response;
}
function createOpenAICompatibleAdapter(config, dependencies) {
  const baseUrl = validateEndpoint(config.base_url, config.route_class);
  const adapterProfile = profile(config);
  async function call(request, signal, structured) {
    const apiKey = await secret(config, dependencies);
    const body = {
      model: config.model,
      stream: false,
      messages: [
        ...structured ? [{ role: "system", content: "Return strict JSON only." }] : [],
        { role: "user", content: request.prompt }
      ]
    };
    if (structured) {
      body.response_format = {
        type: "json_schema",
        json_schema: { name: "prodigy_response", strict: true, schema: request.schema }
      };
    }
    const response = await execute(dependencies, {
      url: `${baseUrl}${config.endpoint_path || "/chat/completions"}`,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...apiKey ? { Authorization: `Bearer ${apiKey}` } : {}
      },
      body: JSON.stringify(body),
      signal
    });
    const raw = response.json ?? (() => {
      try {
        return JSON.parse(response.text || "");
      } catch (_error) {
        return null;
      }
    })();
    return { payload: structured ? structuredPayload(raw) : { text: textFrom(raw) } };
  }
  return {
    profile: adapterProfile,
    requestStructured: ({ request, signal }) => call(request, signal, true),
    requestChat: ({ request, signal }) => call(request, signal, false)
  };
}
function createGeminiAdapter(config, dependencies) {
  const endpoint2 = validateEndpoint(config.endpoint_url || "https://generativelanguage.googleapis.com/v1beta/interactions", config.route_class);
  const adapterProfile = profile(config);
  async function call(request, signal, structured) {
    const apiKey = await secret(config, dependencies);
    const response = await execute(dependencies, {
      url: endpoint2,
      method: "POST",
      headers: { "Content-Type": "application/json", ...apiKey ? { "x-goog-api-key": apiKey } : {} },
      body: JSON.stringify({
        model: config.model,
        input: request.prompt,
        ...structured ? { response_format: { type: "text", mime_type: "application/json", schema: request.schema } } : {}
      }),
      signal
    });
    const raw = response.json ?? (() => {
      try {
        return JSON.parse(response.text || "");
      } catch (_error) {
        return null;
      }
    })();
    return { payload: structured ? structuredPayload(raw) : { text: textFrom(raw) } };
  }
  return {
    profile: adapterProfile,
    requestStructured: ({ request, signal }) => call(request, signal, true),
    requestChat: ({ request, signal }) => call(request, signal, false)
  };
}

// src/adapters/relay.ts
function endpoint(value) {
  let url;
  try {
    url = new URL(value);
  } catch (_error) {
    throw runtimeError("configuration_missing", "invalid_relay_url");
  }
  if (url.protocol !== "https:" || !url.hostname.endsWith(".ts.net") || url.username || url.password || url.hash) {
    throw runtimeError("configuration_missing", "invalid_relay_url");
  }
  return value.replace(/\/+$/u, "");
}
function createRelayAdapter(config, dependencies) {
  const relayUrl = endpoint(config.relay_url);
  const profile2 = {
    profile_id: config.profile_id,
    provider_key: config.provider_key,
    model: config.model,
    route_class: "mobile-relay",
    prompt_transport: "http-body",
    capabilities: ["structured-strict", "chat-text"],
    max_input_bytes: 262144,
    max_schema_bytes: 65536,
    max_output_bytes: 524288,
    certification_hash: config.certification_hash
  };
  async function token() {
    const value = await dependencies.secrets.getSecret(config.relay_token_secret_id);
    if (!value) throw runtimeError("secret_missing");
    return value;
  }
  async function call(request, signal, kind) {
    const relayToken = await token();
    const headers = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${relayToken}`,
      Prefer: "respond-async"
    };
    let response = await dependencies.http({
      url: `${relayUrl}/request`,
      method: "POST",
      headers,
      body: JSON.stringify({
        protocol_version: "1.0.0",
        provider_id: config.provider_key,
        request_id: request.request_id,
        consumer_id: request.consumer_id,
        kind,
        model: config.model,
        deadline_ms: request.consumer_manifest.timeout_ms,
        prompt: request.prompt,
        ...kind === "structured" ? { schema: request.schema } : {}
      }),
      signal
    }).catch(() => {
      throw runtimeError("route_unreachable");
    });
    while (response.status === 202) {
      const running = response.json;
      if (running?.protocol_version !== "1.0.0" || running.request_id !== request.request_id || running.status !== "running") throw runtimeError("malformed_transport_response");
      if (signal.aborted) throw runtimeError("cancel_requested");
      response = await dependencies.http({
        url: `${relayUrl}/result/${request.request_id}`,
        method: "GET",
        headers: { Authorization: `Bearer ${relayToken}` },
        signal
      }).catch(() => {
        throw runtimeError("route_unreachable");
      });
    }
    if (response.status < 200 || response.status >= 300) throw runtimeError(classifyHttpStatus(response.status));
    const envelope = response.json;
    if (!envelope || typeof envelope !== "object" || Array.isArray(envelope)) throw runtimeError("malformed_transport_response");
    const value = envelope;
    if (value.protocol_version !== "1.0.0" || value.request_id !== request.request_id || value.status !== "completed") {
      throw runtimeError(String(value.error_code || "malformed_transport_response"));
    }
    return { payload: kind === "chat" && typeof value.payload === "string" ? { text: value.payload } : value.payload };
  }
  return {
    profile: profile2,
    requestStructured: ({ request, signal }) => call(request, signal, "structured"),
    requestChat: ({ request, signal }) => call(request, signal, "chat"),
    async cancel(requestId) {
      const relayToken = await token();
      const signal = new AbortController().signal;
      const response = await dependencies.http({
        url: `${relayUrl}/cancel`,
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${relayToken}` },
        body: JSON.stringify({ protocol_version: "1.0.0", request_id: requestId }),
        signal
      });
      if (response.status < 200 || response.status >= 300) return "outcome_unknown";
      const status = response.json?.status;
      return status === "cancelled_confirmed" || status === "cancel_requested" ? status : "outcome_unknown";
    }
  };
}

// node_modules/@noble/hashes/_u64.js
var fromNumH = (n) => n / 2 ** 32 | 0;
var fromNumL = (n) => n >>> 0;
function setU64FromNum(view, byteOffset, n, isLE) {
  const h = fromNumH(n);
  const l = fromNumL(n);
  view.setUint32(byteOffset, isLE ? l : h, isLE);
  view.setUint32(byteOffset + 4, isLE ? h : l, isLE);
}

// node_modules/@noble/hashes/utils.js
function isBytes(a) {
  return a instanceof Uint8Array || ArrayBuffer.isView(a) && a.constructor.name === "Uint8Array" && "BYTES_PER_ELEMENT" in a && a.BYTES_PER_ELEMENT === 1;
}
var atitle = (title) => title ? `"${title}" ` : "";
function anumber(n, title = "") {
  if (typeof n !== "number")
    throw new TypeError(atitle(title) + "expected number, got " + typeof n);
  if (!Number.isSafeInteger(n) || n < 0)
    throw new RangeError(atitle(title) + "expected integer >= 0, got " + n);
  return n;
}
function abytes(value, length, title = "") {
  if (isBytes(value) && (length === void 0 || value.length === length))
    return value;
  if (length !== void 0)
    anumber(length, "length");
  const bytes = isBytes(value);
  const ofLen = length !== void 0 ? ` of length ${length}` : "";
  const got = bytes ? `length=${value.length}` : `type=${typeof value}`;
  const message = atitle(title) + "expected Uint8Array" + ofLen + ", got " + got;
  if (!bytes)
    throw new TypeError(message);
  throw new RangeError(message);
}
var aobject = (value, label) => {
  if (value === null || typeof value !== "object" || Array.isArray(value))
    throw new TypeError((label === "object" ? "" : `"${label}" `) + "expected object, got type=" + typeof value);
};
var aopts = (value, label) => {
  aobject(value, label);
  const proto = Object.getPrototypeOf(value);
  if (proto !== Object.prototype && proto !== null)
    throw new TypeError(`"${label}" expected plain object`);
  if (Object.hasOwn(value, "__proto__"))
    throw new TypeError(`"${label}.__proto__" is not allowed`);
};
function aexists(instance, checkFinished = true) {
  if (instance.destroyed)
    throw new Error("hash was destroyed");
  if (checkFinished && instance.finished)
    throw new Error("digest() was already called");
}
function aoutput(out, instance) {
  abytes(out, void 0, "output");
  const min = instance.outputLen;
  if (!(out.length >= min)) {
    throw new RangeError('"output" expected length >= ' + min);
  }
}
function clean(...arrays) {
  for (let i = 0; i < arrays.length; i++) {
    arrays[i].fill(0);
  }
}
function createView(arr) {
  return new DataView(arr.buffer, arr.byteOffset, arr.byteLength);
}
function rotr(word, shift) {
  return word << 32 - shift | word >>> shift;
}
var hasHexBuiltin = /* @__PURE__ */ (() => (
  // @ts-ignore
  typeof Uint8Array.from([]).toHex === "function" && typeof Uint8Array.fromHex === "function"
))();
var hexes = /* @__PURE__ */ Array.from({ length: 256 }, (_, i) => i.toString(16).padStart(2, "0"));
function bytesToHex(bytes) {
  abytes(bytes);
  if (hasHexBuiltin)
    return bytes.toHex();
  let hex = "";
  for (let i = 0; i < bytes.length; i++) {
    hex += hexes[bytes[i]];
  }
  return hex;
}
function checkOpts(defaults, opts, title = "opts") {
  aopts(defaults, "defaults");
  if (opts !== void 0)
    aopts(opts, title);
  const merged = Object.assign(/* @__PURE__ */ Object.create(null), defaults, opts);
  return merged;
}
function createHasher(hashCons, info = {}) {
  if (typeof hashCons !== "function")
    throw new TypeError('"hashCons" expected function, got type=' + typeof hashCons);
  info = checkOpts({}, info, "info");
  const hashC = (msg, opts) => hashCons(opts).update(msg).digest();
  const tmp = hashCons(void 0);
  hashC.outputLen = tmp.outputLen;
  hashC.blockLen = tmp.blockLen;
  hashC.canXOF = tmp.canXOF;
  hashC.create = (opts) => hashCons(opts);
  Object.assign(hashC, info);
  return Object.freeze(hashC);
}
var oidNist = (suffix) => ({
  // Current NIST hashAlgs suffixes used here fit in one DER subidentifier octet.
  // Larger suffix values would need base-128 OID encoding and a different length byte.
  oid: Uint8Array.from([6, 9, 96, 134, 72, 1, 101, 3, 4, 2, suffix])
});

// node_modules/@noble/hashes/_md.js
function Chi(a, b, c) {
  return a & b ^ ~a & c;
}
function Maj(a, b, c) {
  return a & b ^ a & c ^ b & c;
}
var HashMD = class {
  blockLen;
  outputLen;
  canXOF = false;
  padOffset;
  isLE;
  // For partial updates less than block size
  buffer;
  view;
  finished = false;
  length = 0;
  pos = 0;
  destroyed = false;
  constructor(blockLen, outputLen, padOffset, isLE) {
    this.blockLen = blockLen;
    this.outputLen = outputLen;
    this.padOffset = padOffset;
    this.isLE = isLE;
    this.buffer = new Uint8Array(blockLen);
    this.view = createView(this.buffer);
  }
  update(data) {
    aexists(this);
    abytes(data);
    const { view, buffer, blockLen } = this;
    const len = data.length;
    let processed = false;
    for (let pos = 0; pos < len; ) {
      const take = Math.min(blockLen - this.pos, len - pos);
      if (take === blockLen) {
        const dataView = createView(data);
        for (; blockLen <= len - pos; pos += blockLen)
          this.process(dataView, pos);
        processed = true;
        continue;
      }
      buffer.set(pos === 0 && take === len ? data : data.subarray(pos, pos + take), this.pos);
      this.pos += take;
      pos += take;
      if (this.pos === blockLen) {
        this.process(view, 0);
        this.pos = 0;
        processed = true;
      }
    }
    this.length += data.length;
    if (processed)
      this.roundClean();
    return this;
  }
  digestInto(out) {
    aexists(this);
    aoutput(out, this);
    this.finished = true;
    const { buffer, view, blockLen, isLE } = this;
    let { pos } = this;
    buffer[pos++] = 128;
    buffer.fill(0, pos);
    if (this.padOffset > blockLen - pos) {
      this.process(view, 0);
      buffer.fill(0);
    }
    setU64FromNum(view, blockLen - 8, this.length * 8, isLE);
    this.process(view, 0);
    this.roundClean();
    const oview = out === buffer ? view : createView(out);
    const len = this.outputLen;
    const outLen = len / 4;
    const state = this.get();
    if (len % 4 || outLen > state.length)
      throw new Error("invalid outputLen");
    for (let i = 0; i < outLen; i++)
      oview.setUint32(4 * i, state[i], isLE);
  }
  digest() {
    const { buffer, outputLen } = this;
    this.digestInto(buffer);
    const res = buffer.slice(0, outputLen);
    this.destroy();
    return res;
  }
  _cloneIntoMeta(to) {
    const { buffer, length, finished, destroyed, pos } = this;
    to.destroyed = destroyed;
    to.finished = finished;
    to.length = length;
    to.pos = pos;
    if (pos)
      to.buffer.set(buffer);
    return to;
  }
  clone() {
    return this._cloneInto();
  }
};
var SHA256_IV = /* @__PURE__ */ Uint32Array.from([
  1779033703,
  3144134277,
  1013904242,
  2773480762,
  1359893119,
  2600822924,
  528734635,
  1541459225
]);

// node_modules/@noble/hashes/sha2.js
var SHA256_K = /* @__PURE__ */ Uint32Array.from([
  1116352408,
  1899447441,
  3049323471,
  3921009573,
  961987163,
  1508970993,
  2453635748,
  2870763221,
  3624381080,
  310598401,
  607225278,
  1426881987,
  1925078388,
  2162078206,
  2614888103,
  3248222580,
  3835390401,
  4022224774,
  264347078,
  604807628,
  770255983,
  1249150122,
  1555081692,
  1996064986,
  2554220882,
  2821834349,
  2952996808,
  3210313671,
  3336571891,
  3584528711,
  113926993,
  338241895,
  666307205,
  773529912,
  1294757372,
  1396182291,
  1695183700,
  1986661051,
  2177026350,
  2456956037,
  2730485921,
  2820302411,
  3259730800,
  3345764771,
  3516065817,
  3600352804,
  4094571909,
  275423344,
  430227734,
  506948616,
  659060556,
  883997877,
  958139571,
  1322822218,
  1537002063,
  1747873779,
  1955562222,
  2024104815,
  2227730452,
  2361852424,
  2428436474,
  2756734187,
  3204031479,
  3329325298
]);
var SHA256_W = /* @__PURE__ */ new Uint32Array(64);
var SHA2_32B = class extends HashMD {
  // We cannot use array here since array allows indexing by variable
  // which means optimizer/compiler cannot use registers.
  // Numeric initializers matter: starting the fields as `undefined` changes
  // V8's field representation and makes sha256 3x slower (measured).
  A = 0;
  B = 0;
  C = 0;
  D = 0;
  E = 0;
  F = 0;
  G = 0;
  H = 0;
  constructor(outputLen, IV) {
    super(64, outputLen, 8, false);
    this.A = IV[0] | 0;
    this.B = IV[1] | 0;
    this.C = IV[2] | 0;
    this.D = IV[3] | 0;
    this.E = IV[4] | 0;
    this.F = IV[5] | 0;
    this.G = IV[6] | 0;
    this.H = IV[7] | 0;
  }
  get() {
    const { A, B, C, D, E, F, G, H } = this;
    return [A, B, C, D, E, F, G, H];
  }
  // prettier-ignore
  set(A, B, C, D, E, F, G, H) {
    this.A = A | 0;
    this.B = B | 0;
    this.C = C | 0;
    this.D = D | 0;
    this.E = E | 0;
    this.F = F | 0;
    this.G = G | 0;
    this.H = H | 0;
  }
  _cloneInto(to) {
    (to ||= new this.constructor()).set(...this.get());
    return this._cloneIntoMeta(to);
  }
  process(view, offset) {
    for (let i = 0; i < 16; i++, offset += 4)
      SHA256_W[i] = view.getUint32(offset, false);
    for (let i = 16; i < 64; i++) {
      const W15 = SHA256_W[i - 15];
      const W2 = SHA256_W[i - 2];
      const s0 = rotr(W15, 7) ^ rotr(W15, 18) ^ W15 >>> 3;
      const s1 = rotr(W2, 17) ^ rotr(W2, 19) ^ W2 >>> 10;
      SHA256_W[i] = s1 + SHA256_W[i - 7] + s0 + SHA256_W[i - 16] | 0;
    }
    let { A, B, C, D, E, F, G, H } = this;
    for (let i = 0; i < 64; i++) {
      const sigma1 = rotr(E, 6) ^ rotr(E, 11) ^ rotr(E, 25);
      const T1 = H + sigma1 + Chi(E, F, G) + SHA256_K[i] + SHA256_W[i] | 0;
      const sigma0 = rotr(A, 2) ^ rotr(A, 13) ^ rotr(A, 22);
      const T2 = sigma0 + Maj(A, B, C) | 0;
      H = G;
      G = F;
      F = E;
      E = D + T1 | 0;
      D = C;
      C = B;
      B = A;
      A = T1 + T2 | 0;
    }
    A = A + this.A | 0;
    B = B + this.B | 0;
    C = C + this.C | 0;
    D = D + this.D | 0;
    E = E + this.E | 0;
    F = F + this.F | 0;
    G = G + this.G | 0;
    H = H + this.H | 0;
    this.set(A, B, C, D, E, F, G, H);
  }
  roundClean() {
    clean(SHA256_W);
  }
  destroy() {
    this.destroyed = true;
    this.set(0, 0, 0, 0, 0, 0, 0, 0);
    clean(this.buffer);
  }
};
var _SHA256 = class extends SHA2_32B {
  constructor() {
    super(32, SHA256_IV);
  }
};
var sha256 = /* @__PURE__ */ createHasher(
  () => new _SHA256(),
  /* @__PURE__ */ oidNist(1)
);

// src/config.ts
var RELAY_TOKEN_SECRET_ID = "prodigy-relay-token";
var EMPTY = {
  schema_version: 1,
  default_profile_id: null,
  profiles: [],
  bindings: {},
  grants: {},
  migrated_from_hash: null
};
function stable(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  const record2 = value;
  return `{${Object.keys(record2).sort().map((key) => `${JSON.stringify(key)}:${stable(record2[key])}`).join(",")}}`;
}
function hash(value) {
  return bytesToHex(sha256(new TextEncoder().encode(stable(value))));
}
function clone(value) {
  return JSON.parse(JSON.stringify(value));
}
function plain(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
function validConfig(value) {
  if (!plain(value) || value.schema_version !== 1 || !Array.isArray(value.profiles) || !plain(value.bindings) || !plain(value.grants)) return false;
  return value.profiles.every((profile2) => plain(profile2) && typeof profile2.profile_id === "string" && ["gemini", "openai-compatible", "codex-exec", "antigravity-exec"].includes(String(profile2.adapter)) && typeof profile2.model === "string" && (profile2.api_key_secret_id === null || typeof profile2.api_key_secret_id === "string") && (profile2.relay_token_secret_id === null || typeof profile2.relay_token_secret_id === "string") && (profile2.certification_hash === null || /^[0-9a-f]{64}$/u.test(String(profile2.certification_hash))));
}
function rejectSecretLikeFields(value, path = "") {
  if (Array.isArray(value)) return value.forEach((entry, index) => rejectSecretLikeFields(entry, `${path}[${index}]`));
  if (!plain(value)) return;
  for (const [key, entry] of Object.entries(value)) {
    const nextPath = path ? `${path}.${key}` : key;
    if (/^(?:apiKey|token|secret|password|authorization|headers|cookies?|rawSecret)$/iu.test(key) && !/(?:Secret|secret)(?:Id)?$/u.test(key)) {
      throw new Error(`secret_like_field:${nextPath}`);
    }
    rejectSecretLikeFields(entry, nextPath);
  }
}
function adapterKind(value) {
  const adapter = String(value || "");
  if (!["gemini", "openai-compatible", "codex-exec", "antigravity-exec"].includes(adapter)) {
    throw new Error("unsupported_adapter");
  }
  return adapter;
}
function createLocalStorageDeviceRouteStore(storage, key = "prodigy-ai-runtime:device-routes:v1") {
  function read() {
    try {
      const value = JSON.parse(storage.getItem(key) || "{}");
      return plain(value) ? value : {};
    } catch (_error) {
      return {};
    }
  }
  function write(value) {
    storage.setItem(key, JSON.stringify(value));
  }
  return {
    async get(profileId) {
      const value = read()[profileId];
      return value ? clone(value) : null;
    },
    async set(profileId, route) {
      const current = read();
      current[profileId] = clone(route);
      write(current);
    },
    async remove(profileId) {
      const current = read();
      delete current[profileId];
      write(current);
    }
  };
}
function createConfigStore(options) {
  let state = null;
  async function load() {
    const durable = await options.load();
    const loaded = validConfig(durable) ? clone(durable) : clone(EMPTY);
    const invalidatedProfiles = /* @__PURE__ */ new Set();
    const normalized = {
      ...loaded,
      profiles: loaded.profiles.map((profile2) => {
        if (profile2.adapter !== "codex-exec" && profile2.adapter !== "antigravity-exec") return profile2;
        const normalizedModel = profile2.adapter === "codex-exec" ? profile2.model || "runtime-default" : profile2.model;
        if (normalizedModel !== profile2.model) invalidatedProfiles.add(profile2.profile_id);
        return {
          ...profile2,
          model: normalizedModel,
          relay_token_secret_id: RELAY_TOKEN_SECRET_ID,
          certification_hash: normalizedModel !== profile2.model ? null : profile2.certification_hash
        };
      }),
      grants: Object.fromEntries(Object.entries(loaded.grants).filter(([, grant]) => !invalidatedProfiles.has(grant.profile_id)))
    };
    if (validConfig(durable) && stable(normalized) !== stable(loaded)) await options.save(clone(normalized));
    state = clone(normalized);
    return clone(state);
  }
  function current() {
    if (!state) throw new Error("config_not_loaded");
    return state;
  }
  async function refresh() {
    const durable = await options.load();
    if (validConfig(durable)) state = clone(durable);
    return current();
  }
  async function persist(next) {
    await options.save(clone(next));
    state = clone(next);
    return clone(state);
  }
  async function importLegacyConfig(raw) {
    if (!plain(raw)) throw new Error("invalid_legacy_config");
    rejectSecretLikeFields(raw);
    const providers = plain(raw.providers) ? raw.providers : {};
    const profiles = [];
    const routes = [];
    for (const [profileId, untyped] of Object.entries(providers)) {
      if (!plain(untyped)) throw new Error("invalid_legacy_provider");
      const adapter = adapterKind(untyped.adapter);
      profiles.push({
        profile_id: profileId,
        adapter,
        name: String(untyped.name || profileId),
        model: adapter === "codex-exec" ? String(untyped.model || "runtime-default") : String(untyped.model || ""),
        api_key_secret_id: typeof untyped.apiKeySecret === "string" ? untyped.apiKeySecret : null,
        relay_token_secret_id: adapter === "codex-exec" || adapter === "antigravity-exec" ? RELAY_TOKEN_SECRET_ID : typeof untyped.relayTokenSecret === "string" ? untyped.relayTokenSecret : null,
        certification_hash: null
      });
      const route = {};
      if (typeof untyped.baseURL === "string") route.base_url = untyped.baseURL;
      if (typeof untyped.endpointURL === "string") route.endpoint_url = untyped.endpointURL;
      if (typeof untyped.command === "string" && untyped.command) route.executable = untyped.command;
      if (typeof untyped.relayURL === "string") route.relay_url = untyped.relayURL;
      if (adapter === "gemini" && !route.endpoint_url) {
        route.endpoint_url = "https://generativelanguage.googleapis.com/v1beta/interactions";
      }
      if (adapter === "codex-exec" && !route.executable) route.executable = "codex";
      if (adapter === "antigravity-exec" && !route.executable) route.executable = "agy";
      if (Object.keys(route).length) routes.push([profileId, route]);
    }
    const defaultProfile = typeof raw.defaultProvider === "string" && profiles.some((profile2) => profile2.profile_id === raw.defaultProvider) ? raw.defaultProvider : profiles[0]?.profile_id ?? null;
    const next = {
      schema_version: 1,
      default_profile_id: defaultProfile,
      profiles,
      bindings: {},
      grants: {},
      migrated_from_hash: hash(raw)
    };
    await persist(next);
    for (const [profileId, route] of routes) await options.deviceRoutes.set(profileId, route);
    return { ok: true, config_hash: hash(next) };
  }
  async function setBinding(consumerId, profileId) {
    if (!/^[a-z]+(?:[._][a-z]+)+$/u.test(consumerId)) throw new Error("invalid_consumer_id");
    const latest = await refresh();
    if (!latest.profiles.some((profile2) => profile2.profile_id === profileId)) throw new Error("unknown_profile");
    if (latest.bindings[consumerId] === profileId) return;
    const grants = { ...latest.grants };
    delete grants[consumerId];
    await persist({ ...latest, bindings: { ...latest.bindings, [consumerId]: profileId }, grants });
  }
  async function setDefaultProfile(profileId) {
    const latest = await refresh();
    if (!latest.profiles.some((profile2) => profile2.profile_id === profileId)) throw new Error("unknown_profile");
    if (latest.default_profile_id === profileId) return;
    await persist({ ...latest, default_profile_id: profileId, grants: {} });
  }
  async function setAllBindings(profileId) {
    const latest = await refresh();
    if (!latest.profiles.some((profile2) => profile2.profile_id === profileId)) throw new Error("unknown_profile");
    const bindings = Object.fromEntries(Object.keys(latest.bindings).map((consumerId) => [consumerId, profileId]));
    if (latest.default_profile_id === profileId && stable(bindings) === stable(latest.bindings)) return;
    await persist({ ...latest, default_profile_id: profileId, bindings, grants: {} });
  }
  async function setCertification(profileId, certificationHash) {
    if (!/^[0-9a-f]{64}$/u.test(certificationHash)) throw new Error("invalid_certification_hash");
    const latest = await refresh();
    if (!latest.profiles.some((profile2) => profile2.profile_id === profileId)) throw new Error("unknown_profile");
    const route = await options.deviceRoutes.get(profileId);
    await options.deviceRoutes.set(profileId, { ...route || {}, certification_hash: certificationHash });
    await persist({
      ...latest,
      profiles: latest.profiles.map((profile2) => profile2.profile_id === profileId ? { ...profile2, certification_hash: null } : profile2),
      grants: Object.fromEntries(Object.entries(latest.grants).filter(([, grant]) => grant.profile_id !== profileId))
    });
  }
  async function setDeviceRoute(profileId, route) {
    const latest = await refresh();
    if (!latest.profiles.some((profile2) => profile2.profile_id === profileId)) throw new Error("unknown_profile");
    rejectSecretLikeFields(route);
    const { certification_hash: _certificationHash, ...uncertifiedRoute } = route;
    const currentRoute = await options.deviceRoutes.get(profileId);
    const { certification_hash: _currentCertification, ...currentUncertifiedRoute } = currentRoute || {};
    const normalizedRoute = Object.fromEntries(Object.entries(uncertifiedRoute).filter(([, value]) => value !== ""));
    if (stable(normalizedRoute) === stable(currentUncertifiedRoute)) return;
    await persist({
      ...latest,
      profiles: latest.profiles.map((profile2) => profile2.profile_id === profileId ? { ...profile2, certification_hash: null } : profile2),
      grants: Object.fromEntries(Object.entries(latest.grants).filter(([, grant]) => grant.profile_id !== profileId))
    });
    await options.deviceRoutes.set(profileId, clone(normalizedRoute));
  }
  async function setModel(profileId, model) {
    const value = model.trim();
    if (!value || value.length > 256) throw new Error("invalid_model");
    const latest = await refresh();
    const profile2 = latest.profiles.find((entry) => entry.profile_id === profileId);
    if (!profile2) throw new Error("unknown_profile");
    if (profile2.model === value) return;
    const route = await options.deviceRoutes.get(profileId);
    if (route) {
      const { certification_hash: _certificationHash, ...uncertifiedRoute } = route;
      await options.deviceRoutes.set(profileId, uncertifiedRoute);
    }
    await persist({
      ...latest,
      profiles: latest.profiles.map((profile3) => profile3.profile_id === profileId ? { ...profile3, model: value, certification_hash: null } : profile3),
      grants: Object.fromEntries(Object.entries(latest.grants).filter(([, grant]) => grant.profile_id !== profileId))
    });
  }
  async function getRuntimeConfiguration() {
    const profiles = await Promise.all(current().profiles.map(async (profile2) => {
      const local = await options.deviceRoutes.get(profile2.profile_id);
      const { certification_hash: localCertification, ...route } = local || {};
      return {
        ...clone(profile2),
        certification_hash: localCertification || profile2.certification_hash,
        device_route: Object.keys(route).length ? route : null
      };
    }));
    return {
      profiles,
      bindings: { ...current().bindings },
      grants: clone(current().grants),
      default_profile_id: current().default_profile_id,
      config_hash: hash(current())
    };
  }
  async function setGrant(consumerId, profileId, profileRevisionHash) {
    if (!/^[a-z]+(?:[._][a-z]+)+$/u.test(consumerId)) throw new Error("invalid_consumer_id");
    const latest = await refresh();
    if (!latest.profiles.some((profile2) => profile2.profile_id === profileId)) throw new Error("unknown_profile");
    if (!/^[0-9a-f]{64}$/u.test(profileRevisionHash)) throw new Error("invalid_profile_revision_hash");
    await persist({
      ...latest,
      grants: {
        ...latest.grants,
        [consumerId]: {
          profile_id: profileId,
          profile_revision_hash: profileRevisionHash,
          granted_at: (/* @__PURE__ */ new Date()).toISOString()
        }
      }
    });
  }
  async function exportLegacyConfig() {
    const providers = {};
    for (const profile2 of current().profiles) {
      const route = await options.deviceRoutes.get(profile2.profile_id);
      providers[profile2.profile_id] = {
        adapter: profile2.adapter,
        name: profile2.name,
        model: profile2.model,
        ...profile2.api_key_secret_id ? { apiKeySecret: profile2.api_key_secret_id } : {},
        ...profile2.relay_token_secret_id ? { relayTokenSecret: profile2.relay_token_secret_id } : {},
        ...route?.base_url ? { baseURL: route.base_url } : {},
        ...route?.endpoint_url ? { endpointURL: route.endpoint_url } : {},
        ...route?.executable ? { command: route.executable } : {},
        ...route?.relay_url ? { relayURL: route.relay_url } : {}
      };
    }
    return { defaultProvider: current().default_profile_id, providers };
  }
  return Object.freeze({
    exportLegacyConfig,
    getRuntimeConfiguration,
    importLegacyConfig,
    load,
    setBinding,
    setAllBindings,
    setCertification,
    setDefaultProfile,
    setDeviceRoute,
    setGrant,
    setModel
  });
}

// src/conformance.ts
var CORPUS_VERSION = "prodigy_ai_adapter_conformance_v1";
var CONFORMANCE_TIMEOUT_MS = 12e4;
var TRANSPORT_ERRORS = /* @__PURE__ */ new Set([
  "configuration_missing",
  "secret_missing",
  "executable_missing",
  "login_required",
  "route_unreachable",
  "rate_limited",
  "quota_exhausted",
  "model_unavailable",
  "schema_unsupported",
  "request_too_large",
  "output_too_large",
  "timeout",
  "cancel_requested",
  "transport_error",
  "malformed_transport_response"
]);
function stable2(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stable2).join(",")}]`;
  const record2 = value;
  return `{${Object.keys(record2).sort().map((key) => `${JSON.stringify(key)}:${stable2(record2[key])}`).join(",")}}`;
}
function hash2(value) {
  return bytesToHex(sha256(new TextEncoder().encode(stable2(value))));
}
function transportError(error) {
  const code = typeof error === "object" && error && "code" in error ? String(error.code) : "";
  return TRANSPORT_ERRORS.has(code) ? code : "transport_error";
}
function createConformanceRequestId(randomUUID = () => crypto.randomUUID()) {
  const value = `${randomUUID().replaceAll("-", "")}${randomUUID().replaceAll("-", "")}`.toLowerCase();
  if (!/^[0-9a-f]{64}$/u.test(value)) throw new Error("conformance_request_id_generation_failed");
  return value;
}
async function certifyAdapter(adapter, corpus) {
  let structuredError = "";
  const structured = await adapter.requestStructured({
    request: corpus.structuredRequest,
    signal: new AbortController().signal
  }).catch((error) => {
    structuredError = transportError(error);
    return null;
  });
  if (!structured || !structured.payload || typeof structured.payload !== "object" || structured.payload.sentinel !== "ok") {
    return {
      ok: false,
      error_code: structuredError || "structured_conformance_failed",
      details: {
        observed_type: structured === null ? "transport_failure" : Array.isArray(structured.payload) ? "array" : typeof structured.payload,
        observed_keys: structured && structured.payload && typeof structured.payload === "object" && !Array.isArray(structured.payload) ? Object.keys(structured.payload).sort() : []
      }
    };
  }
  const chat = await adapter.requestChat({
    request: corpus.chatRequest,
    signal: new AbortController().signal
  }).catch(() => null);
  if (!chat || !chat.payload || typeof chat.payload !== "object" || !String(chat.payload.text || "").includes("conformance sentinel")) {
    return { ok: false, error_code: "chat_conformance_failed" };
  }
  if (adapter.profile.capabilities.includes("cancellable")) {
    const cancellation = await adapter.cancel?.(corpus.chatRequest.request_id).catch(() => "outcome_unknown");
    if (cancellation !== "cancelled_confirmed" && cancellation !== "cancel_requested") {
      return { ok: false, error_code: "cancellation_conformance_failed" };
    }
  }
  const capabilities = [...adapter.profile.capabilities].sort();
  return {
    ok: true,
    certification_hash: hash2({
      corpus_version: CORPUS_VERSION,
      profile_id: adapter.profile.profile_id,
      provider_key: adapter.profile.provider_key,
      model: adapter.profile.model,
      route_class: adapter.profile.route_class,
      prompt_transport: adapter.profile.prompt_transport,
      capabilities
    }),
    capabilities,
    corpus_version: CORPUS_VERSION
  };
}

// src/diagnostics.ts
function createDiagnostics(limit = 100) {
  const entries = [];
  function record2(raw) {
    const receipt = raw.receipt;
    if (!receipt || typeof receipt !== "object" || Array.isArray(receipt)) return;
    const entry = Object.freeze({
      request_id: String(raw.request_id || ""),
      consumer_id: String(raw.consumer_id || ""),
      status: String(raw.status || ""),
      receipt: Object.freeze({ ...receipt })
    });
    entries.push(entry);
    while (entries.length > limit) entries.shift();
  }
  function list() {
    return entries.map((entry) => ({ ...entry, receipt: { ...entry.receipt } }));
  }
  function clear() {
    entries.length = 0;
  }
  return Object.freeze({ clear, list, record: record2 });
}

// src/desktop-process.ts
function nodeRequire() {
  const candidate = globalThis.require || globalThis.window?.require;
  if (typeof candidate !== "function") throw Object.assign(new Error("desktop_runtime_unavailable"), { code: "executable_missing" });
  return candidate;
}
async function createIsolatedDirectory(requestId) {
  const require2 = nodeRequire();
  const fs = require2("node:fs");
  const os = require2("node:os");
  const path = require2("node:path");
  const root = path.join(os.tmpdir(), "prodigy-ai-runtime");
  fs.mkdirSync(root, { recursive: true, mode: 448 });
  return fs.mkdtempSync(path.join(root, `${requestId.slice(0, 12)}-`));
}
async function removeIsolatedDirectory(directory) {
  if (!directory) return;
  const require2 = nodeRequire();
  const fs = require2("node:fs");
  fs.rmSync(directory, { recursive: true, force: true });
}
function runProcess(input) {
  const require2 = nodeRequire();
  const childProcess = require2("node:child_process");
  return new Promise((resolve, reject) => {
    const child = childProcess.spawn(input.command, input.args, {
      cwd: input.cwd,
      shell: false,
      stdio: ["pipe", "pipe", "pipe"],
      env: {
        HOME: typeof process !== "undefined" ? process.env.HOME : void 0,
        PATH: typeof process !== "undefined" ? process.env.PATH : void 0,
        LANG: typeof process !== "undefined" ? process.env.LANG : void 0
      }
    });
    let stdout = "";
    let stderr = "";
    let settled = false;
    const finish = (callback, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      input.signal.removeEventListener("abort", abort);
      callback(value);
    };
    const terminate = () => {
      try {
        child.kill("SIGTERM");
      } catch (_error) {
      }
    };
    const abort = () => {
      terminate();
      finish(reject, Object.assign(new Error("cancel_requested"), { code: "cancel_requested" }));
    };
    const timer = setTimeout(() => {
      terminate();
      finish(reject, Object.assign(new Error("timeout"), { code: "timeout" }));
    }, input.timeout_ms);
    input.signal.addEventListener("abort", abort, { once: true });
    child.stdout.on("data", (chunk) => {
      if (stdout.length < 1048576) stdout += String(chunk).slice(0, 1048576 - stdout.length);
    });
    child.stderr.on("data", (chunk) => {
      if (stderr.length < 8192) stderr += String(chunk).slice(0, 8192 - stderr.length);
    });
    child.once("error", (error) => finish(reject, error));
    child.once("close", (code) => finish(resolve, { exit_code: code, stdout, stderr }));
    child.stdin.end(input.input);
  });
}

// src/protocol.ts
var PLUGIN_ID = "prodigy-ai-runtime";
var RUNTIME_VERSION = "0.2.0";
var RUNTIME_BUILD = "pairing-async-v1";
var PROTOCOL_VERSION = "1.0.0";
var CONSUMER_MANIFEST_RANGE = ">=1 <2";
var PROTOCOL_DESCRIPTOR = Object.freeze({
  plugin_id: PLUGIN_ID,
  protocol_version: PROTOCOL_VERSION,
  consumer_manifest_version: 1,
  request_identity: ["consumer_id", "owner_session_id", "operation_id", "attempt_id"],
  request_fields: [
    "protocol_version",
    "consumer_id",
    "owner_session_id",
    "operation_id",
    "attempt_id",
    "request_id",
    "consumer_manifest",
    "prompt",
    "schema"
  ],
  manifest_fields: [
    "schema_version",
    "consumer_id",
    "contract_version",
    "capability",
    "sensitivity",
    "route_policy",
    "consent_cadence",
    "background_allowed",
    "max_input_bytes",
    "max_output_bytes",
    "max_schema_bytes",
    "timeout_ms"
  ],
  runtime_methods: [
    "getHandshake",
    "getStatus",
    "listProviders",
    "listModels",
    "resolveProvider",
    "getConsentRequirement",
    "grantConsumer",
    "requestStructured",
    "requestChat",
    "cancel",
    "getRequestStatus",
    "openSettings",
    "subscribeStatus"
  ],
  response_fields: ["protocol_version", "runtime_epoch", "request_id", "status", "payload", "receipt", "error_code"],
  response_statuses: ["completed", "failed", "cancelled_confirmed", "cancel_requested", "outcome_unknown"]
});
function stable3(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stable3).join(",")}]`;
  const record2 = value;
  return `{${Object.keys(record2).sort().map((key) => `${JSON.stringify(key)}:${stable3(record2[key])}`).join(",")}}`;
}
var PROTOCOL_HASH = bytesToHex(sha256(new TextEncoder().encode(stable3(PROTOCOL_DESCRIPTOR))));

// src/runtime.ts
var HASH = /^[0-9a-f]{64}$/u;
var ERROR_CODES = /* @__PURE__ */ new Set([
  "configuration_missing",
  "secret_missing",
  "executable_missing",
  "login_required",
  "route_unreachable",
  "rate_limited",
  "quota_exhausted",
  "model_unavailable",
  "schema_unsupported",
  "request_too_large",
  "output_too_large",
  "timeout",
  "cancelled_confirmed",
  "cancel_requested",
  "outcome_unknown",
  "transport_error",
  "malformed_transport_response",
  "runtime_unavailable",
  "protocol_mismatch",
  "capability_unavailable",
  "consent_required",
  "request_identity_conflict"
]);
function stable4(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stable4).join(",")}]`;
  const record2 = value;
  return `{${Object.keys(record2).sort().map((key) => `${JSON.stringify(key)}:${stable4(record2[key])}`).join(",")}}`;
}
function sha(value) {
  return bytesToHex(sha256(new TextEncoder().encode(value)));
}
function byteLength(value) {
  return new TextEncoder().encode(value).byteLength;
}
function jsonBytes(value) {
  return byteLength(stable4(value));
}
function clone2(value) {
  return JSON.parse(JSON.stringify(value));
}
function errorCode(error) {
  const code = typeof error === "object" && error && "code" in error ? String(error.code) : "";
  return ERROR_CODES.has(code) ? code : "transport_error";
}
function runtimeProfileHash(profile2) {
  return sha(stable4({
    profile_id: profile2.profile_id,
    provider_key: profile2.provider_key,
    model: profile2.model,
    route_class: profile2.route_class,
    prompt_transport: profile2.prompt_transport,
    capabilities: [...profile2.capabilities].sort(),
    certification_hash: profile2.certification_hash
  }));
}
function validManifest(manifest, consumerId) {
  return manifest?.schema_version === 1 && manifest.contract_version === 1 && manifest.consumer_id === consumerId && manifest.background_allowed === false && Number.isSafeInteger(manifest.max_input_bytes) && manifest.max_input_bytes > 0 && Number.isSafeInteger(manifest.max_output_bytes) && manifest.max_output_bytes > 0 && Number.isSafeInteger(manifest.max_schema_bytes) && manifest.max_schema_bytes > 0 && Number.isSafeInteger(manifest.timeout_ms) && manifest.timeout_ms > 0;
}
function createRuntime(options) {
  const adapters = [...options.adapters];
  const epoch = options.epoch;
  const now = options.now ?? Date.now;
  const log = options.log ?? (() => void 0);
  const inFlight = /* @__PURE__ */ new Map();
  const statuses = /* @__PURE__ */ new Map();
  const listeners = /* @__PURE__ */ new Set();
  const concurrency = Math.max(1, Math.floor(options.concurrency ?? 2));
  const waiting = [];
  let activeCount = 0;
  function emit(event) {
    const frozen = Object.freeze({ ...event });
    listeners.forEach((listener) => {
      try {
        listener(frozen);
      } catch (_error) {
      }
    });
  }
  function acquire(requestId) {
    if (activeCount < concurrency) {
      activeCount += 1;
      return Promise.resolve(0);
    }
    const queuedAt = now();
    emit({ request_id: requestId, status: "queued", queue_depth: waiting.length + 1 });
    return new Promise((resolve) => waiting.push({
      requestId,
      queuedAt,
      resolve: (queueMs) => resolve(queueMs)
    }));
  }
  function release() {
    activeCount = Math.max(0, activeCount - 1);
    const next = waiting.shift();
    if (!next) return;
    activeCount += 1;
    next.resolve(Math.max(0, now() - next.queuedAt));
  }
  function capabilities() {
    return [...new Set(adapters.flatMap((adapter) => adapter.profile.capabilities))].sort();
  }
  function getHandshake() {
    return Object.freeze({
      plugin_id: PLUGIN_ID,
      runtime_version: RUNTIME_VERSION,
      protocol_version: PROTOCOL_VERSION,
      consumer_manifest_range: CONSUMER_MANIFEST_RANGE,
      runtime_epoch: epoch,
      protocol_hash: PROTOCOL_HASH,
      capabilities: capabilities()
    });
  }
  function getStatus() {
    return Object.freeze({ status: "ready", adapters: adapters.length, in_flight: inFlight.size });
  }
  function listProviders() {
    return adapters.map(({ profile: profile2 }) => ({
      profile_id: profile2.profile_id,
      provider_key: profile2.provider_key,
      route_class: profile2.route_class,
      prompt_transport: profile2.prompt_transport,
      capabilities: [...profile2.capabilities],
      certification_hash: profile2.certification_hash
    }));
  }
  function listModels() {
    return adapters.map(({ profile: profile2 }) => ({
      profile_id: profile2.profile_id,
      model: profile2.model,
      capabilities: [...profile2.capabilities]
    }));
  }
  function resolveAdapter(manifest) {
    const configuredProfileId = options.bindings?.[manifest.consumer_id] ?? options.defaultProfileId;
    const candidates = adapters.filter(({ profile: profile2 }) => profile2.capabilities.includes(manifest.capability) && HASH.test(profile2.certification_hash) && (manifest.sensitivity === "internal" || profile2.prompt_transport !== "argv") && (!configuredProfileId || profile2.profile_id === configuredProfileId) && (manifest.route_policy !== "local-required" || profile2.route_class === "local"));
    if (configuredProfileId && candidates.length === 0) return null;
    if (manifest.route_policy === "local-preferred") {
      candidates.sort((left, right) => Number(right.profile.route_class === "local") - Number(left.profile.route_class === "local"));
    }
    return candidates[0] ?? null;
  }
  function resolveProvider(manifest) {
    const selected = resolveAdapter(manifest);
    if (!selected) return { status: "unavailable", error_code: "capability_unavailable", capability: manifest.capability };
    const grant = options.grants?.[manifest.consumer_id];
    const consentRequired = options.requireGrants === true && (!grant || grant.profile_id !== selected.profile.profile_id || grant.profile_revision_hash !== runtimeProfileHash(selected.profile));
    return consentRequired ? { status: "consent_required", profile_id: selected.profile.profile_id, capability: manifest.capability, route_class: selected.profile.route_class } : { status: "ready", profile_id: selected.profile.profile_id, capability: manifest.capability, route_class: selected.profile.route_class };
  }
  function validateRequest(request2, kind) {
    if (request2.protocol_version !== PROTOCOL_VERSION) return "protocol_mismatch";
    if (!HASH.test(request2.request_id) || !validManifest(request2.consumer_manifest, request2.consumer_id)) return "malformed_transport_response";
    if (!request2.owner_session_id || !request2.operation_id || !request2.attempt_id || typeof request2.prompt !== "string") return "malformed_transport_response";
    if (byteLength(request2.prompt) > request2.consumer_manifest.max_input_bytes) return "request_too_large";
    if (kind === "structured" && (!request2.schema || jsonBytes(request2.schema) > request2.consumer_manifest.max_schema_bytes)) return "request_too_large";
    return null;
  }
  function receipt(request2, profile2, startedAt, endedAt, code, providerRequestId = null, usage, queueMs = 0) {
    return {
      consumer_id: request2.consumer_id,
      attempt_id: request2.attempt_id,
      provider_profile_hash: runtimeProfileHash(profile2),
      provider_key: profile2.provider_key,
      model: profile2.model,
      route_class: profile2.route_class,
      capability: request2.consumer_manifest.capability,
      input_hash: sha(request2.prompt),
      input_bytes: byteLength(request2.prompt),
      schema_hash: request2.schema ? sha(stable4(request2.schema)) : null,
      started_at: new Date(startedAt).toISOString(),
      ended_at: new Date(endedAt).toISOString(),
      latency_ms: Math.max(0, endedAt - startedAt),
      error_code: code,
      provider_request_id: providerRequestId,
      usage_source: usage?.source ?? "unknown",
      input_tokens: usage?.input_tokens ?? null,
      output_tokens: usage?.output_tokens ?? null,
      cost: usage?.cost ?? null,
      queue_ms: queueMs,
      retry_count: 0
    };
  }
  function failed(request2, profile2, code, startedAt, queueMs = 0) {
    const endedAt = now();
    const result = {
      protocol_version: PROTOCOL_VERSION,
      runtime_epoch: epoch,
      request_id: request2.request_id,
      status: code === "cancelled_confirmed" ? "cancelled_confirmed" : code === "cancel_requested" ? "cancel_requested" : code === "outcome_unknown" ? "outcome_unknown" : "failed",
      error_code: code,
      receipt: receipt(request2, profile2, startedAt, endedAt, code, null, void 0, queueMs)
    };
    statuses.set(request2.request_id, { status: result.status, error_code: code });
    log({ request_id: request2.request_id, consumer_id: request2.consumer_id, status: result.status, receipt: result.receipt });
    emit({ request_id: request2.request_id, consumer_id: request2.consumer_id, status: result.status, error_code: code });
    return result;
  }
  function identityConflict(request2, profile2) {
    const timestamp = now();
    return {
      protocol_version: PROTOCOL_VERSION,
      runtime_epoch: epoch,
      request_id: request2.request_id,
      status: "failed",
      error_code: "request_identity_conflict",
      receipt: receipt(request2, profile2, timestamp, timestamp, "request_identity_conflict")
    };
  }
  function request(kind, raw) {
    let requestValue;
    try {
      requestValue = clone2(raw);
    } catch (_error) {
      const malformed = {
        protocol_version: PROTOCOL_VERSION,
        consumer_id: "",
        owner_session_id: "",
        operation_id: "",
        attempt_id: "",
        request_id: typeof raw?.request_id === "string" ? raw.request_id : "",
        consumer_manifest: {
          schema_version: 1,
          consumer_id: "",
          contract_version: 1,
          capability: "structured-strict",
          sensitivity: "private",
          route_policy: "local-required",
          consent_cadence: "explicit-action",
          background_allowed: false,
          max_input_bytes: 1,
          max_output_bytes: 1,
          max_schema_bytes: 1,
          timeout_ms: 1
        },
        prompt: ""
      };
      return Promise.resolve({
        protocol_version: PROTOCOL_VERSION,
        runtime_epoch: epoch,
        request_id: typeof raw?.request_id === "string" ? raw.request_id : "",
        status: "failed",
        error_code: "malformed_transport_response",
        receipt: receipt(malformed, {
          profile_id: "unresolved",
          provider_key: "unresolved",
          model: "unresolved",
          route_class: "local",
          prompt_transport: "stdin",
          capabilities: [],
          max_input_bytes: 0,
          max_schema_bytes: 0,
          max_output_bytes: 0,
          certification_hash: "0".repeat(64)
        }, now(), now(), "malformed_transport_response")
      });
    }
    const validation = validateRequest(requestValue, kind);
    const selected = resolveAdapter(requestValue.consumer_manifest);
    const fallbackProfile = selected?.profile ?? {
      profile_id: "unresolved",
      provider_key: "unresolved",
      model: "unresolved",
      route_class: "local",
      prompt_transport: "stdin",
      capabilities: [],
      max_input_bytes: 0,
      max_schema_bytes: 0,
      max_output_bytes: 0,
      certification_hash: "0".repeat(64)
    };
    if (validation) return Promise.resolve(failed(requestValue, fallbackProfile, validation, now()));
    if (!selected) return Promise.resolve(failed(requestValue, fallbackProfile, "capability_unavailable", now()));
    if (resolveProvider(requestValue.consumer_manifest).status === "consent_required") {
      return Promise.resolve(failed(requestValue, selected.profile, "consent_required", now()));
    }
    if (byteLength(requestValue.prompt) > selected.profile.max_input_bytes || requestValue.schema && jsonBytes(requestValue.schema) > selected.profile.max_schema_bytes) {
      return Promise.resolve(failed(requestValue, selected.profile, "request_too_large", now()));
    }
    const fingerprint = sha(stable4({ kind, request: requestValue }));
    const existing = inFlight.get(requestValue.request_id);
    if (existing) {
      return existing.fingerprint === fingerprint ? existing.promise : Promise.resolve(identityConflict(requestValue, selected.profile));
    }
    const controller = new AbortController();
    statuses.set(requestValue.request_id, { status: "outcome_unknown", error_code: null });
    const promise = (async () => {
      const queueMs = await acquire(requestValue.request_id);
      const startedAt = now();
      emit({ request_id: requestValue.request_id, consumer_id: requestValue.consumer_id, status: "running", queue_ms: queueMs });
      const record2 = inFlight.get(requestValue.request_id);
      if (controller.signal.aborted) {
        inFlight.delete(requestValue.request_id);
        release();
        return failed(requestValue, selected.profile, record2?.cancelReason === "timeout" ? "timeout" : "cancel_requested", startedAt, queueMs);
      }
      let timer = null;
      try {
        const adapterPromise = selected[kind === "structured" ? "requestStructured" : "requestChat"]({
          request: requestValue,
          signal: controller.signal
        });
        const deadline = new Promise((_resolve, reject) => {
          timer = setTimeout(() => {
            const current = inFlight.get(requestValue.request_id);
            if (current) current.cancelReason = "timeout";
            controller.abort();
            reject(Object.assign(new Error("timeout"), { code: "timeout" }));
          }, requestValue.consumer_manifest.timeout_ms);
        });
        const result = await Promise.race([adapterPromise, deadline]);
        if (jsonBytes(result.payload) > Math.min(requestValue.consumer_manifest.max_output_bytes, selected.profile.max_output_bytes)) {
          return failed(requestValue, selected.profile, "output_too_large", startedAt, queueMs);
        }
        const endedAt = now();
        const response = {
          protocol_version: PROTOCOL_VERSION,
          runtime_epoch: epoch,
          request_id: requestValue.request_id,
          status: "completed",
          payload: clone2(result.payload),
          receipt: receipt(requestValue, selected.profile, startedAt, endedAt, null, result.provider_request_id ?? null, result.usage, queueMs)
        };
        statuses.set(requestValue.request_id, { status: "completed", error_code: null });
        log({ request_id: requestValue.request_id, consumer_id: requestValue.consumer_id, status: response.status, receipt: response.receipt });
        emit({ request_id: requestValue.request_id, consumer_id: requestValue.consumer_id, status: "completed", queue_ms: queueMs });
        return response;
      } catch (error) {
        const reason = inFlight.get(requestValue.request_id)?.cancelReason;
        return failed(
          requestValue,
          selected.profile,
          reason === "timeout" ? "timeout" : controller.signal.aborted ? "cancel_requested" : errorCode(error),
          startedAt,
          queueMs
        );
      } finally {
        if (timer) clearTimeout(timer);
        inFlight.delete(requestValue.request_id);
        release();
      }
    })();
    inFlight.set(requestValue.request_id, { adapter: selected, controller, fingerprint, promise, cancelReason: null });
    return promise;
  }
  async function cancel(requestId) {
    const active = inFlight.get(requestId);
    if (!active) return { status: "outcome_unknown", request_id: requestId };
    active.cancelReason = "user";
    active.controller.abort();
    let status = "cancel_requested";
    try {
      if (active.adapter.cancel) status = await active.adapter.cancel(requestId);
    } catch (_error) {
      status = "outcome_unknown";
    }
    statuses.set(requestId, { status, error_code: status });
    emit({ request_id: requestId, status });
    return { status, request_id: requestId };
  }
  function getRequestStatus(requestId) {
    const status = statuses.get(requestId);
    return status ? { request_id: requestId, ...status } : { request_id: requestId, status: "outcome_unknown", error_code: null };
  }
  function openSettings() {
    return options.openSettings?.() ?? true;
  }
  function subscribeStatus(listener) {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }
  function dispose() {
    inFlight.forEach((entry) => {
      entry.cancelReason = "dispose";
      entry.controller.abort();
    });
    listeners.clear();
  }
  return Object.freeze({
    cancel,
    dispose,
    getHandshake,
    getRequestStatus,
    getStatus,
    listModels,
    listProviders,
    openSettings,
    requestChat: (value) => request("chat", value),
    requestStructured: (value) => request("structured", value),
    resolveProvider,
    subscribeStatus
  });
}

// src/relay-service.ts
function shell(value) {
  return `'${value.replaceAll("'", `'"'"'`)}'`;
}
function validate(config) {
  if (config.label !== "com.prodigy-ai.runtime-relay") throw new Error("invalid_relay_service_label");
  if (config.login_item_name !== "Prodigy AI Runtime Relay") throw new Error("invalid_relay_login_item");
  if (!/^[A-Za-z0-9._:-]{1,128}$/u.test(config.deployment_id)) throw new Error("invalid_relay_deployment_id");
  for (const [port, code] of [
    [config.port, "invalid_relay_port"],
    [config.admin_port, "invalid_relay_admin_port"]
  ]) {
    if (!Number.isSafeInteger(port) || port < 1 || port > 65535) throw new Error(code);
  }
  if (!config.node_path.startsWith("/") || !config.artifact_path.startsWith("/") || !config.antigravity_path.startsWith("/") || !config.home_path.startsWith("/") || !config.token_hash_path.startsWith(`${config.home_path}/`)) {
    throw new Error("unsafe_relay_service_path");
  }
}
function wrapper(config, pidPath, stopPath) {
  return [
    "#!/bin/zsh",
    "set -u",
    "umask 077",
    `PID_FILE=${shell(pidPath)}`,
    `STOP_FILE=${shell(stopPath)}`,
    `NODE=${shell(config.node_path)}`,
    `ARTIFACT=${shell(config.artifact_path)}`,
    "child_pid=",
    "cleanup() {",
    '  if [[ -n "${child_pid:-}" ]]; then /bin/kill -TERM "$child_pid" 2>/dev/null || true; fi',
    '  /bin/rm -f "$PID_FILE"',
    "}",
    "trap 'cleanup; exit 0' INT TERM",
    "trap cleanup EXIT",
    '/bin/rm -f "$STOP_FILE"',
    'print -r -- "$$" > "$PID_FILE"',
    'while [[ ! -e "$STOP_FILE" ]]; do',
    "  env \\",
    `    HOME=${shell(config.home_path)} \\`,
    "    PATH=/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin \\",
    "    LANG=en_US.UTF-8 \\",
    `    PRODIGY_RELAY_DEPLOYMENT_ID=${shell(config.deployment_id)} \\`,
    `    PRODIGY_RELAY_TOKEN_HASH_PATH=${shell(config.token_hash_path)} \\`,
    `    PRODIGY_RELAY_PORT=${config.port} \\`,
    `    PRODIGY_RELAY_ADMIN_PORT=${config.admin_port} \\`,
    `    PRODIGY_ANTIGRAVITY_EXECUTABLE=${shell(config.antigravity_path)} \\`,
    '    "$NODE" "$ARTIFACT" &',
    "  child_pid=$!",
    '  wait "$child_pid" || true',
    "  child_pid=",
    '  [[ -e "$STOP_FILE" ]] && break',
    "  /bin/sleep 2",
    "done",
    '/bin/rm -f "$PID_FILE" "$STOP_FILE"',
    ""
  ].join("\n");
}
function loginPlist(config, automationPath) {
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">',
    '<plist version="1.0">',
    "<dict>",
    "  <key>Label</key>",
    `  <string>${config.label}-terminal</string>`,
    "  <key>ProgramArguments</key>",
    "  <array>",
    "    <string>/usr/bin/open</string>",
    "    <string>-g</string>",
    `    <string>${automationPath.replaceAll("&", "&amp;").replaceAll("<", "&lt;")}</string>`,
    "  </array>",
    "  <key>RunAtLoad</key>",
    "  <true/>",
    "  <key>StandardOutPath</key>",
    "  <string>/dev/null</string>",
    "  <key>StandardErrorPath</key>",
    "  <string>/dev/null</string>",
    "</dict>",
    "</plist>",
    ""
  ].join("\n");
}
function createRelayServiceManager(config, dependencies) {
  validate(config);
  const root = `${config.home_path}/Library/Application Support/Prodigy AI Runtime`;
  const automationPath = `${root}/start-relay.command`;
  const pidPath = `${root}/relay-terminal.pid`;
  const stopPath = `${root}/relay-terminal.stop`;
  const loginItemPath = `${config.home_path}/Library/LaunchAgents/${config.label}-terminal.plist`;
  const loginDomain = `gui/${process.getuid?.() ?? 501}`;
  const loginService = `${loginDomain}/${config.label}-terminal`;
  async function managedPid() {
    const value = String(await dependencies.readText(pidPath) || "").trim();
    if (!/^\d{1,10}$/u.test(value)) return null;
    const pid = Number(value);
    return (await dependencies.run("/bin/kill", ["-0", String(pid)])).code === 0 ? pid : null;
  }
  async function status() {
    const entry = await dependencies.lstat(automationPath);
    const loginEntry = await dependencies.lstat(loginItemPath);
    const managed = await managedPid();
    const portOpen = await dependencies.isPortOpen(config.port);
    const state = managed && portOpen ? "running" : managed ? "starting" : portOpen ? "port_in_use" : entry.exists && loginEntry.exists ? "stopped" : "not_installed";
    return {
      supported: true,
      state,
      installed: entry.exists && loginEntry.exists,
      loaded: Boolean(managed),
      port_open: portOpen,
      port: config.port
    };
  }
  async function assertSafeFiles(includeWrapper = false) {
    for (const [path, code] of [
      [config.node_path, "unsafe_node_executable"],
      [config.artifact_path, "unsafe_relay_artifact"],
      ...includeWrapper ? [[automationPath, "unsafe_relay_wrapper"]] : []
    ]) {
      const entry = await dependencies.lstat(path);
      if (!entry.exists || !entry.file || entry.symlink) throw new Error(code);
    }
    const destination = await dependencies.lstat(automationPath);
    if (!includeWrapper && (destination.symlink || destination.exists && !destination.file)) {
      throw new Error("unsafe_relay_wrapper");
    }
    const loginDestination = await dependencies.lstat(loginItemPath);
    if (loginDestination.symlink || loginDestination.exists && !loginDestination.file) {
      throw new Error("unsafe_relay_login_item");
    }
  }
  async function start() {
    await assertSafeFiles(true);
    const before = await status();
    if (before.port_open && !before.loaded) throw new Error("relay_port_in_use");
    if (before.loaded) return before;
    await dependencies.remove(stopPath);
    await dependencies.remove(pidPath);
    const result = await dependencies.run("/usr/bin/open", ["-g", automationPath]);
    if (result.code !== 0) throw new Error("relay_terminal_start_failed");
    return status();
  }
  async function install() {
    await assertSafeFiles();
    const before = await status();
    if (before.port_open && !before.loaded) throw new Error("relay_port_in_use");
    const previous = await dependencies.readText(automationPath);
    const previousLogin = await dependencies.readText(loginItemPath);
    await dependencies.writeTextAtomic(automationPath, wrapper(config, pidPath, stopPath));
    await dependencies.writeTextAtomic(loginItemPath, loginPlist(config, automationPath));
    try {
      await dependencies.run("/bin/launchctl", ["bootout", loginService]);
      const result = await dependencies.run("/bin/launchctl", ["bootstrap", loginDomain, loginItemPath]);
      if (result.code !== 0) throw new Error("relay_login_item_registration_failed");
    } catch (error) {
      if (previous === null) await dependencies.remove(automationPath);
      else await dependencies.writeTextAtomic(automationPath, previous);
      if (previousLogin === null) await dependencies.remove(loginItemPath);
      else await dependencies.writeTextAtomic(loginItemPath, previousLogin);
      throw error;
    }
    return before.loaded ? status() : status();
  }
  async function stop() {
    const pid = await managedPid();
    if (pid) {
      await dependencies.writeTextAtomic(stopPath, "stop\n");
      const result = await dependencies.run("/bin/kill", ["-TERM", String(pid)]);
      if (result.code !== 0) throw new Error("relay_terminal_stop_failed");
    }
    return status();
  }
  async function remove() {
    await stop();
    await dependencies.run("/bin/launchctl", ["bootout", loginService]);
    for (const target of [automationPath, loginItemPath, pidPath, stopPath]) {
      const entry = await dependencies.lstat(target);
      if (entry.symlink || entry.exists && !entry.file) throw new Error("unsafe_relay_wrapper");
      if (entry.exists) await dependencies.remove(target);
    }
    return status();
  }
  return Object.freeze({ automationPath, loginItemPath, install, remove, start, status, stop });
}
function nodeRequire2() {
  const candidate = globalThis.require || globalThis.window?.require;
  if (typeof candidate !== "function") throw new Error("desktop_runtime_unavailable");
  return candidate;
}
function createMacRelayServiceManager(version) {
  const require2 = nodeRequire2();
  const childProcess = require2("node:child_process");
  const crypto2 = require2("node:crypto");
  const fs = require2("node:fs");
  const net = require2("node:net");
  const os = require2("node:os");
  const path = require2("node:path");
  const home = os.homedir();
  const nodeCandidate = ["/opt/homebrew/bin/node", "/usr/local/bin/node"].find((candidate) => fs.existsSync(candidate)) || "/opt/homebrew/bin/node";
  const config = {
    label: "com.prodigy-ai.runtime-relay",
    login_item_name: "Prodigy AI Runtime Relay",
    deployment_id: `macmini-prodigy-relay-v${version}`,
    port: 8788,
    admin_port: 8789,
    token_hash_path: path.join(home, "Library/Application Support/Prodigy AI Runtime/relay-token.sha256"),
    node_path: fs.realpathSync(nodeCandidate),
    artifact_path: path.join(home, "Developer/prodigy-ai-runtime/dist", `prodigy-ai-relay-server-${version}.mjs`),
    antigravity_path: path.join(home, ".local/bin/agy"),
    home_path: home
  };
  const dependencies = {
    async lstat(target) {
      try {
        const entry = fs.lstatSync(target);
        return { exists: true, file: entry.isFile(), symlink: entry.isSymbolicLink() };
      } catch (error) {
        if (error.code === "ENOENT") return { exists: false, file: false, symlink: false };
        throw error;
      }
    },
    async readText(target) {
      try {
        return fs.readFileSync(target, "utf8");
      } catch (error) {
        if (error.code === "ENOENT") return null;
        throw error;
      }
    },
    async writeTextAtomic(target, value) {
      fs.mkdirSync(path.dirname(target), { recursive: true, mode: 448 });
      const temporary = `${target}.${process.pid}.${crypto2.randomUUID()}.tmp`;
      try {
        const mode = target.endsWith(".command") ? 448 : 384;
        fs.writeFileSync(temporary, value, { encoding: "utf8", flag: "wx", mode });
        fs.renameSync(temporary, target);
        fs.chmodSync(target, mode);
      } finally {
        fs.rmSync(temporary, { force: true });
      }
    },
    async remove(target) {
      fs.rmSync(target, { force: true });
    },
    async run(command, args) {
      const result = childProcess.spawnSync(command, args, {
        encoding: "utf8",
        maxBuffer: 65536,
        stdio: ["ignore", "pipe", "pipe"],
        timeout: 5e3
      });
      return { code: result.status ?? 1 };
    },
    async isPortOpen(port) {
      return new Promise((resolve) => {
        const socket = net.createConnection({ host: "127.0.0.1", port });
        let settled = false;
        const finish = (value) => {
          if (settled) return;
          settled = true;
          socket.destroy();
          resolve(value);
        };
        socket.once("connect", () => finish(true));
        socket.once("error", () => finish(false));
        socket.setTimeout(500, () => finish(false));
      });
    }
  };
  return createRelayServiceManager(config, dependencies);
}

// src/model-discovery.ts
var MAX_RESPONSE_BYTES = 1048576;
var MAX_MODELS = 500;
function modelId(value) {
  const id = String(value || "").trim().replace(/^models\//u, "");
  if (!/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,199}$/u.test(id) || id.includes("..")) return null;
  return id;
}
function boundedModels(values) {
  return [...new Set(values.map(modelId).filter((value) => Boolean(value)))].sort().slice(0, MAX_MODELS);
}
function modelEndpoint(profile2) {
  const route = profile2.device_route;
  const raw = profile2.adapter === "gemini" ? route?.endpoint_url : route?.base_url;
  if (!raw) return null;
  let url;
  try {
    url = new URL(raw);
  } catch (_error) {
    return null;
  }
  const local = /^(?:localhost|127\.0\.0\.1|::1|10\.|192\.168\.|172\.(?:1[6-9]|2\d|3[01])\.|100\.(?:6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.)/u.test(url.hostname);
  if (url.protocol !== "https:" && !(url.protocol === "http:" && local)) return null;
  if (url.hostname === "0.0.0.0" || url.username || url.password) return null;
  if (profile2.adapter === "gemini") {
    url.pathname = "/v1beta/models";
    url.search = "";
    url.hash = "";
    return url.toString();
  }
  url.pathname = `${url.pathname.replace(/\/+$/u, "")}/models`;
  url.search = "";
  url.hash = "";
  return url.toString();
}
function parseProvider(profile2, text) {
  const parsed = JSON.parse(text);
  if (profile2.adapter === "gemini") {
    return boundedModels(Array.isArray(parsed.models) ? parsed.models.map((entry) => entry && typeof entry === "object" ? entry.name : null) : []);
  }
  return boundedModels(Array.isArray(parsed.data) ? parsed.data.map((entry) => entry && typeof entry === "object" ? entry.id : null) : []);
}
function parseAntigravity(text) {
  const clean2 = text.replace(/\x1b\[[0-9;]*m/gu, "");
  return boundedModels(clean2.split(/\r?\n/u).map((line) => line.trim().split(/\s+/u)[0]).filter((value) => /^(?:gemini|claude|gpt|runtime)[A-Za-z0-9._:/-]*\d[A-Za-z0-9._:/-]*$/iu.test(value || "")));
}
function relayModelsEndpoint(profile2) {
  if (profile2.adapter !== "antigravity-exec" || !profile2.device_route?.relay_url) return null;
  let url;
  try {
    url = new URL(profile2.device_route.relay_url);
  } catch (_error) {
    return null;
  }
  if (url.protocol !== "https:" || !url.hostname.endsWith(".ts.net") || url.username || url.password || url.search || url.hash) return null;
  url.pathname = `${url.pathname.replace(/\/+$/u, "")}/models/antigravity`;
  return url.toString();
}
function parseRelayModels(text) {
  const parsed = JSON.parse(text);
  if (parsed.protocol_version !== "1.0.0" || parsed.provider_id !== "antigravity" || !Array.isArray(parsed.models)) return [];
  return boundedModels(parsed.models);
}
async function discoverModels(profile2, dependencies) {
  if (profile2.adapter === "codex-exec") {
    return { ok: true, source: "preset", models: boundedModels([profile2.model || "runtime-default", "runtime-default"]) };
  }
  if (profile2.adapter === "antigravity-exec") {
    if (dependencies.platform === "mobile") {
      const url2 = relayModelsEndpoint(profile2);
      if (!url2 || !profile2.relay_token_secret_id) return { ok: false, error_code: "route_unavailable" };
      const token = await dependencies.secrets.getSecret(profile2.relay_token_secret_id);
      if (!token) return { ok: false, error_code: "secret_missing" };
      const response2 = await dependencies.http({
        url: url2,
        method: "GET",
        headers: { Accept: "application/json", Authorization: `Bearer ${token}` }
      }).catch(() => null);
      if (!response2) return { ok: false, error_code: "route_unreachable" };
      if (response2.status < 200 || response2.status >= 300) {
        return { ok: false, error_code: classifyHttpStatus(response2.status) };
      }
      if (new TextEncoder().encode(response2.text).byteLength > MAX_RESPONSE_BYTES) {
        return { ok: false, error_code: "model_list_too_large" };
      }
      try {
        const models2 = parseRelayModels(response2.text);
        return models2.length ? { ok: true, source: "provider", models: models2 } : { ok: false, error_code: "model_list_unavailable" };
      } catch (_error) {
        return { ok: false, error_code: "malformed_model_list" };
      }
    }
    const command = profile2.device_route?.executable || "agy";
    if (command !== "agy" && !/\/(?:\.local\/bin|bin)\/agy$/u.test(command)) {
      return { ok: false, error_code: "executable_missing" };
    }
    const result = await dependencies.runCli({ command, args: ["models"] }).catch(() => null);
    if (!result || result.exit_code !== 0) return { ok: false, error_code: "model_list_unavailable" };
    if (new TextEncoder().encode(result.stdout).byteLength > MAX_RESPONSE_BYTES) {
      return { ok: false, error_code: "model_list_too_large" };
    }
    const models = parseAntigravity(result.stdout);
    return models.length ? { ok: true, source: "provider", models } : { ok: false, error_code: "model_list_unavailable" };
  }
  const url = modelEndpoint(profile2);
  if (!url) return { ok: false, error_code: "route_unavailable" };
  const headers = { Accept: "application/json" };
  if (profile2.api_key_secret_id) {
    const secret2 = await dependencies.secrets.getSecret(profile2.api_key_secret_id);
    if (!secret2) return { ok: false, error_code: "secret_missing" };
    if (profile2.adapter === "gemini") headers["x-goog-api-key"] = secret2;
    else headers.Authorization = `Bearer ${secret2}`;
  }
  const response = await dependencies.http({ url, method: "GET", headers }).catch(() => null);
  if (!response) return { ok: false, error_code: "route_unreachable" };
  if (response.status < 200 || response.status >= 300) {
    return { ok: false, error_code: classifyHttpStatus(response.status) };
  }
  if (new TextEncoder().encode(response.text).byteLength > MAX_RESPONSE_BYTES) {
    return { ok: false, error_code: "model_list_too_large" };
  }
  try {
    const models = parseProvider(profile2, response.text);
    return models.length ? { ok: true, source: "provider", models } : { ok: false, error_code: "model_list_unavailable" };
  } catch (_error) {
    return { ok: false, error_code: "malformed_model_list" };
  }
}
async function saveProviderSecretAndRefreshModels(input, dependencies) {
  if (!input.profile_id || !input.secret_id || !input.value) throw new Error("secret_required");
  await dependencies.saveSecret(input.secret_id, input.value);
  return dependencies.discoverModels(input.profile_id);
}

// src/relay-pairing.ts
var SHARED_RELAY_SECRET_ID = "prodigy-relay-token";
var LEGACY_RELAY_SECRET_IDS = [
  "prodigy-codex-relay-token",
  "prodigy-antigravity-relay-token"
];
function relayEndpoint(value) {
  let url;
  try {
    url = new URL(value);
  } catch (_error) {
    return null;
  }
  if (url.protocol !== "https:" || !url.hostname.endsWith(".ts.net") || url.username || url.password || url.search || url.hash) return null;
  return value.replace(/\/+$/u, "");
}
function record(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : null;
}
async function completeRelayPairing(relayUrl, pairingCode, secretId, dependencies) {
  const endpoint2 = relayEndpoint(relayUrl);
  if (!endpoint2 || !secretId) return { ok: false, error_code: "route_unavailable" };
  if (!/^\d{6}$/u.test(pairingCode)) return { ok: false, error_code: "pairing_code_invalid" };
  const response = await dependencies.http({
    url: `${endpoint2}/pair/complete`,
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ pairing_code: pairingCode })
  }).catch(() => null);
  if (!response) return { ok: false, error_code: "route_unreachable" };
  const body = record(response.json);
  if (response.status !== 200) {
    const code = String(body?.error_code || "");
    return {
      ok: false,
      error_code: ["pairing_code_invalid", "pairing_unavailable"].includes(code) ? code : "pairing_failed"
    };
  }
  const token = String(body?.relay_token || "");
  if (body?.protocol_version !== "1.0.0" || body.status !== "paired" || new TextEncoder().encode(token).byteLength < 32) {
    return { ok: false, error_code: "malformed_pairing_response" };
  }
  await dependencies.secrets.setSecret(secretId, token);
  return { ok: true, status: "paired" };
}
async function checkRelayConnection(relayUrl, secretId, dependencies) {
  const endpoint2 = relayEndpoint(relayUrl);
  if (!endpoint2 || !secretId) return { ok: false, status: "unconfigured" };
  const token = await dependencies.secrets.getSecret(secretId);
  if (!token) return { ok: false, status: "disconnected" };
  const response = await dependencies.http({
    url: `${endpoint2}/receipt`,
    method: "GET",
    headers: { Authorization: `Bearer ${token}` }
  }).catch(() => null);
  const body = record(response?.json);
  if (response?.status === 200 && body?.protocol_version === "1.0.0") {
    return { ok: true, status: "connected" };
  }
  return { ok: false, status: response ? "disconnected" : "unreachable" };
}
async function disconnectRelay(secretId, dependencies) {
  if (!secretId) return { ok: false, error_code: "secret_id_missing" };
  await dependencies.secrets.setSecret(secretId, "");
  return { ok: true, status: "disconnected" };
}
async function migrateLegacyRelayToken(secrets) {
  if (await secrets.getSecret(SHARED_RELAY_SECRET_ID)) return false;
  for (const secretId of LEGACY_RELAY_SECRET_IDS) {
    const token = await secrets.getSecret(secretId);
    if (!token) continue;
    await secrets.setSecret(SHARED_RELAY_SECRET_ID, token);
    return true;
  }
  return false;
}
async function beginRelayPairing(dependencies) {
  const response = await dependencies.http({
    url: "http://127.0.0.1:8789/pair/start",
    method: "POST"
  }).catch(() => null);
  const body = record(response?.json);
  const code = String(body?.pairing_code || "");
  if (response?.status !== 200 || body?.status !== "pairing" || !/^\d{6}$/u.test(code) || body.expires_in_seconds !== 120) {
    return { ok: false, error_code: response ? "pairing_admin_failed" : "relay_unreachable" };
  }
  return {
    ok: true,
    status: "pairing",
    pairing_code: code,
    expires_in_seconds: 120
  };
}
async function revokeRelayPairing(dependencies) {
  const response = await dependencies.http({
    url: "http://127.0.0.1:8789/pair/revoke",
    method: "POST"
  }).catch(() => null);
  const body = record(response?.json);
  return response?.status === 200 && body?.status === "revoked" ? { ok: true, status: "revoked" } : { ok: false, error_code: response ? "pairing_admin_failed" : "relay_unreachable" };
}

// src/settings-routing.ts
function selectableSettingsProviders(profiles, providers) {
  const executable = new Set(providers.map((provider) => provider.profile_id));
  return profiles.filter((profile2) => Boolean(profile2.certification_hash) && executable.has(profile2.profile_id)).map((profile2) => ({
    profile_id: profile2.profile_id,
    label: `${profile2.name || profile2.profile_id} \xB7 ${profile2.model || "\uAE30\uBCF8 model"}`
  })).sort((left, right) => left.label.localeCompare(right.label));
}

// src/settings.ts
var import_obsidian = require("obsidian");
var ADAPTER_LABELS = {
  "antigravity-exec": "Antigravity CLI",
  "codex-exec": "Codex",
  "gemini": "Google Gemini",
  "openai-compatible": "OpenAI \uD638\uD658 API"
};
var ProdigyAIRuntimeSettingTab = class extends import_obsidian.PluginSettingTab {
  constructor(runtimePlugin) {
    super(runtimePlugin.app, runtimePlugin);
    this.runtimePlugin = runtimePlugin;
  }
  display() {
    this.containerEl.empty();
    this.containerEl.createEl("h2", { text: "Prodigy AI Runtime" });
    this.containerEl.createEl("p", {
      text: "Provider \uC5F0\uACB0 \uC815\uBCF4\uB294 \uC6A9\uB3C4\uBCC4\uB85C \uB098\uB258\uBA70, route\uC640 secret\uC740 \uD604\uC7AC \uAE30\uAE30\uC5D0\uB9CC \uC800\uC7A5\uB429\uB2C8\uB2E4."
    });
    this.containerEl.createEl("small", { text: `Build: ${RUNTIME_BUILD}` });
    this.containerEl.setAttribute("data-prodigy-runtime-build", RUNTIME_BUILD);
    this.containerEl.setAttribute("data-prodigy-settings-state", "loading");
    void this.render().then(() => {
      this.containerEl.setAttribute("data-prodigy-settings-state", "ready");
    }).catch(() => {
      this.containerEl.setAttribute("data-prodigy-settings-state", "failed");
      this.containerEl.createEl("p", { text: "\uC124\uC815\uC744 \uBD88\uB7EC\uC624\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4." });
    });
  }
  async render() {
    if (import_obsidian.Platform.isMacOS && !import_obsidian.Platform.isMobileApp) await this.renderRelayService();
    const profiles = await this.runtimePlugin.listSettingsProfiles();
    await this.renderRouting();
    this.containerEl.createEl("h3", { text: "Provider \uC124\uC815" });
    if (!profiles.length) {
      this.containerEl.createEl("p", { text: "\uC124\uC815\uB41C AI provider profile\uC774 \uC5C6\uC2B5\uB2C8\uB2E4." });
      return;
    }
    const certified = profiles.filter((profile2) => profile2.certification_hash).length;
    this.containerEl.createEl("p", {
      text: `${profiles.length}\uAC1C provider \xB7 \uD604\uC7AC \uAE30\uAE30 \uC778\uC99D ${certified}\uAC1C`
    });
    const mobilePairingProfileId = import_obsidian.Platform.isMobileApp ? profiles.find((profile2) => profile2.adapter === "codex-exec")?.profile_id || profiles.find((profile2) => profile2.adapter === "antigravity-exec")?.profile_id || null : null;
    for (const profile2 of profiles) {
      this.renderProfile(profile2, profile2.profile_id === mobilePairingProfileId);
    }
  }
  async renderRouting() {
    const routing = await this.runtimePlugin.getSettingsRouting();
    const section = this.containerEl.createDiv({ cls: "prodigy-ai-runtime-routing" });
    section.createEl("h3", { text: "\uC2E4\uD589 Provider \uC120\uD0DD" });
    section.createEl("p", {
      text: "\uC778\uC99D\uB410\uACE0 \uD604\uC7AC \uAE30\uAE30\uC5D0\uC11C \uC2E4\uD589 \uAC00\uB2A5\uD55C Provider\uB9CC \uD45C\uC2DC\uB429\uB2C8\uB2E4."
    });
    if (!routing.providers.length) {
      section.createEl("p", { text: "\uBA3C\uC800 \uC544\uB798 Provider \uCE74\uB4DC\uC5D0\uC11C Capability \uC778\uC99D\uC744 \uC644\uB8CC\uD558\uC138\uC694." });
      section.setAttribute("data-prodigy-routing-state", "unavailable");
      return;
    }
    section.setAttribute("data-prodigy-routing-state", "ready");
    let defaultDraft = routing.providers.some((provider) => provider.profile_id === routing.default_profile_id) ? String(routing.default_profile_id) : String(routing.providers[0]?.profile_id || "");
    new import_obsidian.Setting(section).setName("\uAE30\uBCF8 Provider").setDesc("\uC0C8 \uAE30\uB2A5\uC758 \uAE30\uBCF8\uAC12\uC785\uB2C8\uB2E4. \uC804\uCCB4 \uC801\uC6A9\uC740 \uD604\uC7AC \uBAA8\uB4E0 \uAE30\uB2A5\uB3C4 \uD568\uAED8 \uBCC0\uACBD\uD569\uB2C8\uB2E4.").addDropdown((dropdown) => {
      for (const provider of routing.providers) dropdown.addOption(provider.profile_id, provider.label);
      dropdown.setValue(defaultDraft);
      dropdown.onChange((value) => {
        defaultDraft = value;
      });
    }).addButton((button) => this.bindAction(button, "\uAE30\uBCF8\uAC12 \uC800\uC7A5", async () => {
      await this.runtimePlugin.setSettingsDefaultProfile(defaultDraft);
    })).addButton((button) => this.bindAction(button, "\uC804\uCCB4 \uC801\uC6A9", async () => {
      await this.runtimePlugin.setSettingsAllBindings(defaultDraft);
      section.setAttribute("data-prodigy-routing-consent", "reset");
    }));
    const details = section.createEl("details", { cls: "prodigy-ai-runtime-bindings" });
    details.createEl("summary", { text: `\uAE30\uB2A5\uBCC4 Provider \xB7 ${Object.keys(routing.bindings).length}\uAC1C` });
    details.createEl("p", {
      text: "Provider\uB97C \uBC14\uAFB8\uBA74 \uD574\uB2F9 \uAE30\uB2A5\uC740 \uB2E4\uC74C \uC2E4\uD589 \uB54C \uB2E4\uC2DC \uB3D9\uC758\uB97C \uC694\uCCAD\uD569\uB2C8\uB2E4."
    });
    for (const [consumerId, currentProfileId] of Object.entries(routing.bindings).sort(([left], [right]) => left.localeCompare(right))) {
      let draft = routing.providers.some((provider) => provider.profile_id === currentProfileId) ? currentProfileId : String(routing.providers[0]?.profile_id || "");
      const row = new import_obsidian.Setting(details).setName(consumerId).setDesc(`\uD604\uC7AC: ${currentProfileId}`);
      row.addDropdown((dropdown) => {
        for (const provider of routing.providers) dropdown.addOption(provider.profile_id, provider.label);
        dropdown.setValue(draft);
        dropdown.onChange((value) => {
          draft = value;
        });
      }).addButton((button) => this.bindAction(button, "\uBCC0\uACBD", async () => {
        await this.runtimePlugin.setSettingsBinding(consumerId, draft);
        row.setDesc(`\uD604\uC7AC: ${draft} \xB7 \uB2E4\uC74C \uC2E4\uD589 \uC2DC \uB2E4\uC2DC \uB3D9\uC758 \uD544\uC694`);
        row.settingEl.setAttribute("data-prodigy-binding-state", "saved");
      }));
    }
  }
  async renderRelayService() {
    const section = this.containerEl.createDiv({ cls: "prodigy-ai-runtime-relay-service" });
    section.createEl("h3", { text: "Mac Relay \xB7 Terminal \uC790\uB3D9\uC2E4\uD589" });
    section.createEl("p", {
      text: "iPhone \uC694\uCCAD\uC744 \uC774 Mac\uC758 Codex \uB610\uB294 Antigravity\uB85C \uC804\uB2EC\uD569\uB2C8\uB2E4. \uC804\uC6A9 Terminal \uCC3D\uC740 \uB2EB\uC9C0 \uB9D0\uACE0 \uCD5C\uC18C\uD654\uD574 \uB450\uC138\uC694."
    });
    const status = new import_obsidian.Setting(section).setName("\uD604\uC7AC \uC0C1\uD0DC");
    const refresh = async () => {
      try {
        const current = await this.runtimePlugin.getRelayServiceStatus();
        const label = current.state === "running" ? `\uC2E4\uD589 \uC911 \xB7 127.0.0.1:${current.port}` : current.state === "starting" ? "\uC2DC\uC791 \uC911" : current.state === "stopped" ? "\uB85C\uADF8\uC778 \uC790\uB3D9\uC2E4\uD589 \uC124\uCE58\uB428 \xB7 \uD604\uC7AC \uC911\uC9C0" : current.state === "port_in_use" ? "\uAD00\uB9AC\uB418\uC9C0 \uC54A\uB294 process\uAC00 Relay \uD3EC\uD2B8\uB97C \uC0AC\uC6A9 \uC911" : "\uC790\uB3D9\uC2E4\uD589 \uBBF8\uC124\uCE58";
        status.setDesc(label);
        status.settingEl.setAttribute("data-prodigy-relay-state", current.state);
        return current;
      } catch (_error) {
        status.setDesc("Relay \uC0C1\uD0DC \uD655\uC778 \uC2E4\uD328");
        status.settingEl.setAttribute("data-prodigy-relay-state", "unavailable");
        return { state: "unavailable" };
      }
    };
    status.addButton((button) => button.setButtonText("\uC0C8\uB85C\uACE0\uCE68").onClick(async () => {
      await refresh();
    }));
    await refresh();
    new import_obsidian.Setting(section).setName("\uB85C\uADF8\uC778 \uC2DC \uC790\uB3D9\uC2E4\uD589").setDesc("\uC804\uC6A9 command\uB97C macOS Login Items\uC5D0 \uB4F1\uB85D\uD558\uAC70\uB098 \uC81C\uAC70\uD569\uB2C8\uB2E4.").addButton((button) => this.bindAction(button, "\uC124\uCE58", () => this.runtimePlugin.installRelayService(), refresh)).addButton((button) => this.bindAction(button, "\uC81C\uAC70", () => this.runtimePlugin.removeRelayService(), refresh));
    new import_obsidian.Setting(section).setName("Relay process").setDesc("\uC804\uC6A9 Terminal \uCC3D\uC5D0\uC11C Relay\uB97C \uC2DC\uC791\uD558\uAC70\uB098 \uC548\uC804\uD558\uAC8C \uC911\uC9C0\uD569\uB2C8\uB2E4.").addButton((button) => this.bindAction(button, "\uC2DC\uC791", () => this.runtimePlugin.startRelayService(), refresh)).addButton((button) => this.bindAction(button, "\uC911\uC9C0", () => this.runtimePlugin.stopRelayService(), refresh));
    const pairing = new import_obsidian.Setting(section).setName("iPhone \uC5F0\uACB0").setDesc("6\uC790\uB9AC \uC77C\uD68C\uC6A9 \uCF54\uB4DC\uB294 2\uBD84 \uB3D9\uC548 \uC720\uD6A8\uD569\uB2C8\uB2E4.");
    pairing.addButton((button) => button.setButtonText("\uC5F0\uACB0 \uCF54\uB4DC \uBC1C\uAE09").onClick(async () => {
      button.setDisabled(true);
      const result = await this.runtimePlugin.beginSettingsRelayPairing();
      if (result.ok) {
        pairing.setDesc(`\uC5F0\uACB0 \uCF54\uB4DC: ${result.pairing_code} \xB7 2\uBD84 \uC548\uC5D0 iPhone\uC5D0 \uC785\uB825\uD558\uC138\uC694.`);
        pairing.settingEl.setAttribute("data-prodigy-pairing-state", "pairing");
        button.setButtonText("\uC0C8 \uCF54\uB4DC \uBC1C\uAE09");
      } else {
        pairing.setDesc(`\uCF54\uB4DC \uBC1C\uAE09 \uC2E4\uD328: ${result.error_code}`);
        pairing.settingEl.setAttribute("data-prodigy-pairing-state", "failed");
      }
      button.setDisabled(false);
    })).addButton((button) => button.setButtonText("\uBAA8\uB4E0 \uC5F0\uACB0 \uD574\uC81C").onClick(async () => {
      button.setDisabled(true);
      const result = await this.runtimePlugin.revokeSettingsRelayPairing();
      pairing.setDesc(result.ok ? "\uBAA8\uB4E0 iPhone \uC5F0\uACB0\uC774 \uD574\uC81C\uB410\uC2B5\uB2C8\uB2E4." : `\uC5F0\uACB0 \uD574\uC81C \uC2E4\uD328: ${result.error_code}`);
      pairing.settingEl.setAttribute("data-prodigy-pairing-state", result.ok ? "revoked" : "failed");
      button.setDisabled(false);
    }));
  }
  bindAction(button, label, run, refresh) {
    return button.setButtonText(label).onClick(async () => {
      button.setDisabled(true);
      try {
        await run();
        button.setButtonText("\uC644\uB8CC");
      } catch (_error) {
        button.setButtonText("\uC2E4\uD328");
      } finally {
        await refresh?.();
        button.setDisabled(false);
      }
    });
  }
  renderProfile(profile2, rendersMobilePairing) {
    const card = this.containerEl.createEl("details", { cls: "prodigy-ai-runtime-profile" });
    card.setAttribute("data-profile-id", profile2.profile_id);
    if (profile2.profile_id === "codex") card.open = true;
    const summary = card.createEl("summary");
    summary.createEl("strong", { text: profile2.name || profile2.profile_id });
    summary.createSpan({
      text: ` \xB7 ${profile2.certification_hash ? "\uC778\uC99D\uB428" : "\uC778\uC99D \uD544\uC694"}`,
      cls: profile2.certification_hash ? "mod-success" : "mod-warning"
    });
    const body = card.createDiv({ cls: "prodigy-ai-runtime-profile-body" });
    body.createEl("p", {
      text: `${ADAPTER_LABELS[profile2.adapter] || profile2.adapter} \xB7 ID: ${profile2.profile_id}`
    });
    let modelDraft = profile2.model || "";
    let updateModelInput = (_value) => void 0;
    new import_obsidian.Setting(body).setName("Model").setDesc("\uBCC0\uACBD\uD558\uBA74 \uD604\uC7AC \uAE30\uAE30\uC758 \uC778\uC99D\uACFC \uAD00\uB828 \uC0AC\uC6A9 \uC2B9\uC778\uC774 \uD574\uC81C\uB429\uB2C8\uB2E4.").addText((text) => {
      updateModelInput = (value) => {
        text.setValue(value);
      };
      text.setPlaceholder("Provider model ID").setValue(modelDraft).onChange((value) => {
        modelDraft = value;
      });
    }).addButton((button) => this.bindAction(button, "Model \uC800\uC7A5", async () => {
      await this.runtimePlugin.setSettingsModel(profile2.profile_id, modelDraft);
      card.setAttribute("data-profile-certification", "invalidated");
    }));
    const modelList = new import_obsidian.Setting(body).setName("Model \uBAA9\uB85D").setDesc("\uBC84\uD2BC\uC744 \uB20C\uB800\uC744 \uB54C\uB9CC Provider\uC5D0\uC11C \uBAA9\uB85D\uC744 \uAC00\uC838\uC635\uB2C8\uB2E4.");
    let updateModelOptions = (models) => {
      if (models[0]) {
        modelDraft = models[0];
        updateModelInput(modelDraft);
      }
    };
    modelList.addDropdown((dropdown) => {
      if (modelDraft) dropdown.addOption(modelDraft, modelDraft).setValue(modelDraft);
      updateModelOptions = (models) => {
        dropdown.selectEl.replaceChildren();
        for (const model of models) dropdown.addOption(model, model);
        const selected = models.includes(modelDraft) ? modelDraft : models[0] || "";
        if (selected) {
          dropdown.setValue(selected);
          modelDraft = selected;
          updateModelInput(selected);
        }
      };
      dropdown.onChange((value) => {
        modelDraft = value;
        updateModelInput(value);
      });
    }).addButton((button) => button.setButtonText("\uBAA9\uB85D \uBD88\uB7EC\uC624\uAE30").onClick(async () => {
      button.setDisabled(true);
      modelList.settingEl.setAttribute("data-prodigy-model-discovery-state", "loading");
      try {
        const result = await this.runtimePlugin.listSettingsModels(profile2.profile_id);
        applyModelDiscovery(result);
        button.setButtonText(result.ok ? "\uB2E4\uC2DC \uBD88\uB7EC\uC624\uAE30" : `\uC2E4\uD328: ${result.error_code}`);
      } finally {
        button.setDisabled(false);
      }
    }));
    const applyModelDiscovery = (result) => {
      if (!result.ok) {
        modelList.settingEl.setAttribute("data-prodigy-model-discovery-state", "failed");
        return;
      }
      updateModelOptions(result.models);
      modelList.settingEl.setAttribute("data-prodigy-model-discovery-state", "loaded");
      modelList.setDesc(`${result.models.length}\uAC1C model \xB7 ${result.source === "provider" ? "Provider \uC870\uD68C" : "\uC548\uC804\uD55C preset"}`);
    };
    const routeKey = profile2.adapter === "gemini" ? "endpoint_url" : profile2.adapter === "openai-compatible" ? "base_url" : import_obsidian.Platform.isMobileApp && (profile2.adapter === "codex-exec" || profile2.adapter === "antigravity-exec") ? "relay_url" : "executable";
    let routeDraft = String(profile2.device_route?.[routeKey] || "");
    new import_obsidian.Setting(body).setName("\uD604\uC7AC \uAE30\uAE30\uC758 Route").setDesc(`${routeKey} \xB7 \uBE44\uC6CC \uB450\uBA74 \uC9C0\uC6D0\uB418\uB294 \uAE30\uBCF8 \uACBD\uB85C\uB97C \uC0AC\uC6A9\uD569\uB2C8\uB2E4.`).addText((text) => text.setPlaceholder("\uAE30\uBCF8 \uACBD\uB85C \uC0AC\uC6A9").setValue(routeDraft).onChange((value) => {
      routeDraft = value;
    })).addButton((button) => this.bindAction(button, "Route \uC800\uC7A5", async () => {
      await this.runtimePlugin.setSettingsDeviceRoute(profile2.profile_id, {
        ...profile2.device_route || {},
        [routeKey]: routeDraft.trim()
      });
      card.setAttribute("data-profile-certification", "invalidated");
    }));
    if (rendersMobilePairing && profile2.relay_token_secret_id) {
      this.renderMobilePairing(body, profile2.profile_id);
    } else {
      const secretId = profile2.api_key_secret_id || (profile2.adapter === "codex-exec" ? null : profile2.relay_token_secret_id);
      if (secretId) this.renderSecret(body, profile2.profile_id, secretId, applyModelDiscovery);
    }
    new import_obsidian.Setting(body).setName("Capability \uC778\uC99D").setDesc("\uD604\uC7AC model\uACFC route\uC5D0 \uC2E4\uC81C conformance \uC694\uCCAD\uC744 \uC2E4\uD589\uD569\uB2C8\uB2E4.").addButton((button) => button.setButtonText("\uC778\uC99D \uC2E4\uD589").onClick(async () => {
      button.setDisabled(true);
      const result = await this.runtimePlugin.certifySettingsProfile(profile2.profile_id);
      button.setButtonText(result.ok ? "\uC778\uC99D \uC644\uB8CC" : `\uC2E4\uD328: ${result.error_code}`);
      card.setAttribute("data-profile-certification", result.ok ? "certified" : "failed");
      button.setDisabled(false);
    }));
  }
  renderSecret(container, profileId, secretId, applyModels) {
    let secretDraft = "";
    let clearSecretInput = () => void 0;
    new import_obsidian.Setting(container).setName("Secret").setDesc(`SecretStorage ID: ${secretId}`).addText((text) => {
      clearSecretInput = () => {
        text.setValue("");
      };
      text.inputEl.type = "password";
      text.setPlaceholder("\uBCC0\uACBD\uD560 \uB54C\uB9CC \uC0C8 \uAC12 \uC785\uB825");
      text.onChange((value) => {
        secretDraft = value;
      });
    }).addButton((button) => {
      button.buttonEl.setAttribute("data-prodigy-secret-state", "idle");
      button.setButtonText("Secret \uC800\uC7A5").onClick(async () => {
        if (!secretDraft) {
          button.buttonEl.setAttribute("data-prodigy-secret-state", "missing");
          button.setButtonText("\uAC12\uC744 \uC785\uB825\uD558\uC138\uC694");
          return;
        }
        button.setDisabled(true);
        try {
          const models = await this.runtimePlugin.saveSettingsSecret(profileId, secretId, secretDraft);
          secretDraft = "";
          clearSecretInput();
          applyModels(models);
          button.buttonEl.setAttribute("data-prodigy-secret-state", "saved");
          button.setButtonText(models.ok ? `\uC800\uC7A5 \uC644\uB8CC \xB7 ${models.models.length}\uAC1C model` : `\uC800\uC7A5 \uC644\uB8CC \xB7 \uBAA9\uB85D \uC2E4\uD328`);
        } catch (_error) {
          button.buttonEl.setAttribute("data-prodigy-secret-state", "failed");
          button.setButtonText("\uC800\uC7A5 \uC2E4\uD328");
        } finally {
          button.setDisabled(false);
        }
      });
    });
  }
  renderMobilePairing(container, profileId) {
    let codeDraft = "";
    const connection = new import_obsidian.Setting(container).setName("iPhone \uC5F0\uACB0").setDesc("\uD55C \uBC88 \uC5F0\uACB0\uD558\uBA74 \uC774 Mac\uC758 Codex\uC640 Antigravity\uB97C \uD568\uAED8 \uC0AC\uC6A9\uD560 \uC218 \uC788\uC2B5\uB2C8\uB2E4.");
    connection.addText((text) => {
      text.inputEl.inputMode = "numeric";
      text.inputEl.maxLength = 6;
      text.setPlaceholder("6\uC790\uB9AC \uCF54\uB4DC");
      text.onChange((value) => {
        codeDraft = value.replace(/\D/gu, "").slice(0, 6);
      });
    }).addButton((button) => button.setButtonText("\uC5F0\uACB0").onClick(async () => {
      button.setDisabled(true);
      const result = await this.runtimePlugin.completeSettingsRelayPairing(profileId, codeDraft);
      connection.setDesc(result.ok ? "Codex\uC640 Antigravity Relay\uAC00 \uD568\uAED8 \uC5F0\uACB0\uB410\uC2B5\uB2C8\uB2E4." : `\uC5F0\uACB0 \uC2E4\uD328: ${result.error_code}`);
      connection.settingEl.setAttribute("data-prodigy-pairing-state", result.ok ? "connected" : "failed");
      button.setDisabled(false);
    })).addButton((button) => button.setButtonText("\uC5F0\uACB0 \uD655\uC778").onClick(async () => {
      button.setDisabled(true);
      const result = await this.runtimePlugin.checkSettingsRelayConnection(profileId);
      connection.setDesc(result.status === "connected" ? "Relay\uC5D0 \uC5F0\uACB0\uB3FC \uC788\uC2B5\uB2C8\uB2E4." : `Relay \uC0C1\uD0DC: ${result.status}`);
      connection.settingEl.setAttribute("data-prodigy-pairing-state", result.status);
      button.setDisabled(false);
    })).addButton((button) => button.setButtonText("\uC5F0\uACB0 \uD574\uC81C").onClick(async () => {
      button.setDisabled(true);
      const result = await this.runtimePlugin.disconnectSettingsRelay(profileId);
      connection.setDesc(result.ok ? "\uC774 iPhone\uC758 Relay \uC5F0\uACB0\uC774 \uD574\uC81C\uB410\uC2B5\uB2C8\uB2E4." : `\uC5F0\uACB0 \uD574\uC81C \uC2E4\uD328: ${result.error_code}`);
      connection.settingEl.setAttribute("data-prodigy-pairing-state", result.ok ? "disconnected" : "failed");
      button.setDisabled(false);
    }));
  }
};

// src/main.ts
var ProdigyAIRuntimePlugin = class extends import_obsidian2.Plugin {
  api;
  runtime;
  config;
  relayService = null;
  diagnostics = createDiagnostics();
  async listSettingsProfiles() {
    return (await this.config.getRuntimeConfiguration()).profiles;
  }
  async setSettingsDeviceRoute(profileId, route) {
    await this.config.setDeviceRoute(profileId, route);
    await this.rebuildRuntime();
  }
  async setSettingsModel(profileId, model) {
    await this.config.setModel(profileId, model);
    await this.rebuildRuntime();
  }
  async listSettingsModels(profileId) {
    const configured = await this.config.getRuntimeConfiguration();
    const profile2 = configured.profiles.find((entry) => entry.profile_id === profileId);
    if (!profile2) return { ok: false, error_code: "unknown_profile" };
    return discoverModels(profile2, {
      platform: import_obsidian2.Platform.isMobileApp ? "mobile" : "desktop",
      secrets: {
        getSecret: async (id) => {
          const storage = this.app.secretStorage;
          return String(await storage?.getSecret(id) || "");
        }
      },
      http: async (input) => {
        const response = await (0, import_obsidian2.requestUrl)({
          url: input.url,
          method: input.method,
          headers: input.headers,
          throw: false
        });
        return { status: response.status, text: response.text };
      },
      runCli: async (input) => {
        const requestId = crypto.randomUUID().replaceAll("-", "");
        const cwd = await createIsolatedDirectory(requestId);
        try {
          return await runProcess({
            command: input.command,
            args: input.args,
            cwd,
            input: "",
            shell: false,
            signal: new AbortController().signal,
            timeout_ms: 3e4
          });
        } finally {
          await removeIsolatedDirectory(cwd);
        }
      }
    });
  }
  async getSettingsRouting() {
    const configured = await this.config.getRuntimeConfiguration();
    return {
      providers: selectableSettingsProviders(configured.profiles, this.runtime.listProviders()),
      default_profile_id: configured.default_profile_id,
      bindings: configured.bindings
    };
  }
  async setSettingsDefaultProfile(profileId) {
    await this.config.setDefaultProfile(profileId);
    await this.rebuildRuntime();
  }
  async setSettingsAllBindings(profileId) {
    await this.config.setAllBindings(profileId);
    await this.rebuildRuntime();
  }
  async setSettingsBinding(consumerId, profileId) {
    await this.config.setBinding(consumerId, profileId);
    await this.rebuildRuntime();
  }
  async saveSettingsSecret(profileId, secretId, value) {
    const storage = this.app.secretStorage;
    if (!storage) throw new Error("secret_storage_unavailable");
    return saveProviderSecretAndRefreshModels({
      profile_id: profileId,
      secret_id: secretId,
      value
    }, {
      saveSecret: async (id, secret2) => storage.setSecret(id, secret2),
      discoverModels: (id) => this.listSettingsModels(id)
    });
  }
  async certifySettingsProfile(profileId) {
    return this.api.certifyProfile(profileId);
  }
  async getRelayServiceStatus() {
    if (!this.relayService) return { supported: false, state: "unsupported" };
    return this.relayService.status();
  }
  async installRelayService() {
    if (!this.relayService) throw new Error("relay_service_unsupported");
    return this.relayService.install();
  }
  async startRelayService() {
    if (!this.relayService) throw new Error("relay_service_unsupported");
    return this.relayService.start();
  }
  async stopRelayService() {
    if (!this.relayService) throw new Error("relay_service_unsupported");
    return this.relayService.stop();
  }
  async removeRelayService() {
    if (!this.relayService) throw new Error("relay_service_unsupported");
    return this.relayService.remove();
  }
  pairingHttp = async (input) => {
    const response = await (0, import_obsidian2.requestUrl)({
      url: input.url,
      method: input.method,
      ...input.headers ? { headers: input.headers } : {},
      ...input.body !== void 0 ? { body: input.body } : {},
      throw: false
    });
    return { status: response.status, json: response.json };
  };
  pairingSecrets() {
    const storage = this.app.secretStorage;
    return {
      getSecret: async (id) => String(await storage?.getSecret(id) || ""),
      setSecret: async (id, value) => {
        if (!storage) throw new Error("secret_storage_unavailable");
        await storage.setSecret(id, value);
      }
    };
  }
  async beginSettingsRelayPairing() {
    if (!import_obsidian2.Platform.isMacOS || import_obsidian2.Platform.isMobileApp) {
      return { ok: false, error_code: "pairing_admin_unsupported" };
    }
    return beginRelayPairing({ http: this.pairingHttp });
  }
  async revokeSettingsRelayPairing() {
    if (!import_obsidian2.Platform.isMacOS || import_obsidian2.Platform.isMobileApp) {
      return { ok: false, error_code: "pairing_admin_unsupported" };
    }
    return revokeRelayPairing({ http: this.pairingHttp });
  }
  async pairingProfile(profileId) {
    const configured = await this.config.getRuntimeConfiguration();
    return configured.profiles.find((entry) => entry.profile_id === profileId) || null;
  }
  async completeSettingsRelayPairing(profileId, pairingCode) {
    const profile2 = await this.pairingProfile(profileId);
    if (!profile2 || !["codex-exec", "antigravity-exec"].includes(profile2.adapter) || !profile2.device_route?.relay_url) {
      return { ok: false, error_code: "route_unavailable" };
    }
    const result = await completeRelayPairing(
      profile2.device_route.relay_url,
      pairingCode,
      RELAY_TOKEN_SECRET_ID,
      { secrets: this.pairingSecrets(), http: this.pairingHttp }
    );
    if (!result.ok) return result;
    const configured = await this.config.getRuntimeConfiguration();
    for (const relayProfile of configured.profiles.filter((entry) => entry.adapter === "codex-exec" || entry.adapter === "antigravity-exec")) {
      await this.config.setDeviceRoute(relayProfile.profile_id, {
        ...relayProfile.device_route || {},
        relay_url: profile2.device_route.relay_url
      });
    }
    await this.rebuildRuntime();
    return result;
  }
  async checkSettingsRelayConnection(profileId) {
    const profile2 = await this.pairingProfile(profileId);
    if (!profile2 || !["codex-exec", "antigravity-exec"].includes(profile2.adapter) || !profile2.device_route?.relay_url) {
      return { ok: false, status: "unconfigured" };
    }
    return checkRelayConnection(
      profile2.device_route.relay_url,
      RELAY_TOKEN_SECRET_ID,
      { secrets: this.pairingSecrets(), http: this.pairingHttp }
    );
  }
  async disconnectSettingsRelay(profileId) {
    const profile2 = await this.pairingProfile(profileId);
    if (!profile2 || !["codex-exec", "antigravity-exec"].includes(profile2.adapter)) {
      return { ok: false, error_code: "route_unavailable" };
    }
    return disconnectRelay(RELAY_TOKEN_SECRET_ID, {
      secrets: this.pairingSecrets(),
      http: this.pairingHttp
    });
  }
  async buildAdapter(profile2, allowUncertified = false) {
    const secrets = {
      getSecret: async (id) => {
        const storage = this.app.secretStorage;
        return String(await storage?.getSecret(id) || "");
      }
    };
    const http = async (input) => {
      const response = await (0, import_obsidian2.requestUrl)({
        url: input.url,
        method: input.method,
        headers: input.headers,
        ...input.body !== void 0 ? { body: input.body } : {},
        throw: false
      });
      return { status: response.status, json: response.json, text: response.text };
    };
    const deviceRoute = profile2.device_route || (profile2.adapter === "gemini" ? { endpoint_url: "https://generativelanguage.googleapis.com/v1beta/interactions" } : profile2.adapter === "codex-exec" ? { executable: import_obsidian2.Platform.isMacOS ? "/Applications/ChatGPT.app/Contents/Resources/codex" : "codex" } : profile2.adapter === "antigravity-exec" ? { executable: "agy" } : null);
    if (!profile2.certification_hash && !allowUncertified || !deviceRoute) return null;
    const certificationHash = profile2.certification_hash || "0".repeat(64);
    const common = {
      profile_id: profile2.profile_id,
      provider_key: profile2.profile_id,
      model: profile2.model,
      certification_hash: certificationHash
    };
    if (profile2.adapter === "gemini") {
      return createGeminiAdapter({
        ...common,
        ...profile2.api_key_secret_id ? { api_key_secret_id: profile2.api_key_secret_id } : {},
        ...deviceRoute.endpoint_url ? { endpoint_url: deviceRoute.endpoint_url } : {},
        route_class: "external-http"
      }, { secrets, http });
    }
    if (profile2.adapter === "openai-compatible" && deviceRoute.base_url) {
      const routeClass = /^https?:\/\/(?:localhost|127\.0\.0\.1|\[::1\]|10\.|192\.168\.|172\.(?:1[6-9]|2\d|3[01])\.|100\.(?:6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.)/u.test(deviceRoute.base_url) ? "local" : "external-http";
      return createOpenAICompatibleAdapter({
        ...common,
        ...profile2.api_key_secret_id ? { api_key_secret_id: profile2.api_key_secret_id } : {},
        base_url: deviceRoute.base_url,
        route_class: routeClass
      }, { secrets, http });
    }
    if ((profile2.adapter === "codex-exec" || profile2.adapter === "antigravity-exec") && import_obsidian2.Platform.isMobileApp && deviceRoute.relay_url && profile2.relay_token_secret_id) {
      return createRelayAdapter({
        ...common,
        relay_url: deviceRoute.relay_url,
        relay_token_secret_id: profile2.relay_token_secret_id
      }, { secrets, http });
    }
    if (!import_obsidian2.Platform.isMobileApp && (profile2.adapter === "codex-exec" || profile2.adapter === "antigravity-exec") && deviceRoute.executable) {
      return createCliAdapter({
        ...common,
        kind: profile2.adapter === "codex-exec" ? "codex" : "antigravity",
        executable: deviceRoute.executable,
        route_class: "desktop-cli"
      }, { createIsolatedDirectory, removeIsolatedDirectory, runProcess });
    }
    return null;
  }
  async buildAdapters() {
    const configured = await this.config.getRuntimeConfiguration();
    const adapters = [];
    for (const profile2 of configured.profiles) {
      const adapter = await this.buildAdapter(profile2);
      if (adapter) adapters.push(adapter);
    }
    return {
      adapters,
      bindings: configured.bindings,
      grants: configured.grants,
      defaultProfileId: configured.default_profile_id
    };
  }
  async rebuildRuntime() {
    if (this.runtime) this.runtime.dispose();
    const built = await this.buildAdapters();
    this.runtime = createRuntime({
      adapters: built.adapters,
      bindings: built.bindings,
      grants: built.grants,
      requireGrants: true,
      defaultProfileId: built.defaultProfileId,
      epoch: crypto.randomUUID(),
      log: this.diagnostics.record,
      openSettings: () => {
        const setting = this.app.setting;
        setting.open();
        setting.openTabById(this.manifest.id);
        return true;
      }
    });
  }
  createPublicApi() {
    return Object.freeze({
      getHandshake: () => this.runtime.getHandshake(),
      getStatus: () => this.runtime.getStatus(),
      listProviders: () => this.runtime.listProviders(),
      listModels: () => this.runtime.listModels(),
      resolveProvider: (requirements) => this.runtime.resolveProvider(requirements),
      getConsentRequirement: (requirements) => this.runtime.resolveProvider(requirements),
      grantConsumer: async (requirements) => {
        const configured = await this.config.getRuntimeConfiguration();
        const profileId = configured.bindings[requirements.consumer_id] || configured.default_profile_id;
        const profile2 = configured.profiles.find((entry) => entry.profile_id === profileId);
        if (!profile2) return { status: "unavailable", error_code: "capability_unavailable" };
        const adapter = await this.buildAdapter(profile2);
        if (!adapter) return { status: "unavailable", error_code: "capability_unavailable" };
        await this.config.setGrant(requirements.consumer_id, profile2.profile_id, runtimeProfileHash(adapter.profile));
        await this.rebuildRuntime();
        return {
          status: "granted",
          consumer_id: requirements.consumer_id,
          profile_id: profile2.profile_id,
          route_class: adapter.profile.route_class
        };
      },
      requestStructured: (request) => this.runtime.requestStructured(request),
      requestChat: (request) => this.runtime.requestChat(request),
      cancel: (requestId) => this.runtime.cancel(requestId),
      getRequestStatus: (requestId) => this.runtime.getRequestStatus(requestId),
      openSettings: () => this.runtime.openSettings(),
      subscribeStatus: (listener) => this.runtime.subscribeStatus(listener),
      importLegacyConfig: async (snapshot) => {
        const result = await this.config.importLegacyConfig(snapshot);
        await this.rebuildRuntime();
        return result;
      },
      exportLegacyConfig: () => this.config.exportLegacyConfig(),
      setBinding: async (consumerId, profileId) => {
        await this.config.setBinding(consumerId, profileId);
        await this.rebuildRuntime();
        return true;
      },
      setDeviceRoute: async (profileId, route) => {
        await this.config.setDeviceRoute(profileId, route);
        await this.rebuildRuntime();
        return true;
      },
      certifyProfile: async (profileId) => {
        const configured = await this.config.getRuntimeConfiguration();
        const profile2 = configured.profiles.find((entry) => entry.profile_id === profileId);
        if (!profile2) return { ok: false, error_code: "unknown_profile" };
        const adapter = await this.buildAdapter(profile2, true);
        if (!adapter) return { ok: false, error_code: "route_unavailable" };
        const manifest = {
          schema_version: 1,
          consumer_id: "project.workflow_draft",
          contract_version: 1,
          capability: "structured-strict",
          sensitivity: "private",
          route_policy: "local-preferred",
          consent_cadence: "standing-grant-with-explicit-action",
          background_allowed: false,
          max_input_bytes: 65536,
          max_output_bytes: 131072,
          max_schema_bytes: 32768,
          timeout_ms: CONFORMANCE_TIMEOUT_MS
        };
        const base = {
          protocol_version: "1.0.0",
          consumer_id: manifest.consumer_id,
          owner_session_id: "plugin-conformance",
          attempt_id: "attempt-1",
          consumer_manifest: manifest,
          prompt: "Return the conformance sentinel."
        };
        const result = await certifyAdapter(adapter, {
          structuredRequest: {
            ...base,
            operation_id: "conformance-structured",
            request_id: createConformanceRequestId(),
            schema: { type: "object", required: ["sentinel"], properties: { sentinel: { const: "ok" } } }
          },
          chatRequest: {
            ...base,
            consumer_manifest: { ...manifest, capability: "chat-text" },
            operation_id: "conformance-chat",
            request_id: createConformanceRequestId(),
            prompt: "Reply with: conformance sentinel"
          }
        });
        if (result.ok) {
          await this.config.setCertification(profileId, result.certification_hash);
          await this.rebuildRuntime();
        }
        return result;
      },
      listDiagnostics: () => this.diagnostics.list(),
      clearDiagnostics: () => this.diagnostics.clear()
    });
  }
  async onload() {
    this.config = createConfigStore({
      load: () => this.loadData(),
      save: (value) => this.saveData(value),
      deviceRoutes: createLocalStorageDeviceRouteStore(window.localStorage)
    });
    await this.config.load();
    await migrateLegacyRelayToken(this.pairingSecrets());
    if (import_obsidian2.Platform.isMacOS && !import_obsidian2.Platform.isMobileApp) {
      this.relayService = createMacRelayServiceManager(this.manifest.version);
    }
    await this.rebuildRuntime();
    this.api = this.createPublicApi();
    this.addSettingTab(new ProdigyAIRuntimeSettingTab(this));
  }
  onunload() {
    this.runtime?.dispose();
  }
};
