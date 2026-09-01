(function (root) {
  "use strict";

  const PLUGIN_ID = "prodigy-ai-runtime";
  const PROTOCOL_VERSION = "1.0.0";
  const PROTOCOL_DESCRIPTOR = freeze({
    plugin_id: PLUGIN_ID,
    protocol_version: PROTOCOL_VERSION,
    consumer_manifest_version: 1,
    request_identity: ["consumer_id", "owner_session_id", "operation_id", "attempt_id"],
    request_fields: [
      "protocol_version", "consumer_id", "owner_session_id", "operation_id", "attempt_id",
      "request_id", "consumer_manifest", "prompt", "schema",
    ],
    manifest_fields: [
      "schema_version", "consumer_id", "contract_version", "capability", "sensitivity",
      "route_policy", "consent_cadence", "background_allowed", "max_input_bytes",
      "max_output_bytes", "max_schema_bytes", "timeout_ms",
    ],
    runtime_methods: [
      "getHandshake", "getStatus", "listProviders", "listModels", "resolveProvider",
      "getConsentRequirement", "grantConsumer", "requestStructured", "requestChat",
      "cancel", "getRequestStatus", "openSettings", "subscribeStatus",
    ],
    response_fields: ["protocol_version", "runtime_epoch", "request_id", "status", "payload", "receipt", "error_code"],
    response_statuses: ["completed", "failed", "cancelled_confirmed", "cancel_requested", "outcome_unknown"],
  });
  const REQUEST_KEYS = new Set([
    "attempt_id", "consumer_id", "operation_id", "owner_session_id", "prompt", "schema", "signal",
  ]);
  const REQUIRED_RUNTIME_METHODS = freeze([...PROTOCOL_DESCRIPTOR.runtime_methods]);

  function dependency(name, relativePath) {
    if (root[name]) return root[name];
    if (typeof require === "function") return require(relativePath);
    throw new Error(`${name} must load before ProdigyAIClient.`);
  }
  function hashApi() { return dependency("LLMWikiHash", "./llmwiki-hash.js"); }
  function manifestApi() { return dependency("ProdigyAIConsumerManifests", "./prodigy-ai-consumer-manifests.js"); }
  function freeze(value) {
    if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
    Object.freeze(value);
    Object.values(value).forEach(freeze);
    return value;
  }
  function plain(value) { return Boolean(value) && typeof value === "object" && !Array.isArray(value); }
  function stable(value) {
    if (value === null || typeof value !== "object") return JSON.stringify(value);
    if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stable(value[key])}`).join(",")}}`;
  }
  function cloneProtocolValue(value, seen = new Set()) {
    if (value === null || typeof value === "string" || typeof value === "boolean") return value;
    if (typeof value === "number") {
      if (!Number.isFinite(value)) throw new TypeError("non_finite_protocol_number");
      return value;
    }
    if (!value || typeof value !== "object" || seen.has(value)) throw new TypeError("non_json_protocol_value");
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null && !Array.isArray(value)) throw new TypeError("non_plain_protocol_value");
    seen.add(value);
    let copy;
    if (Array.isArray(value)) {
      copy = value.map((entry) => cloneProtocolValue(entry, seen));
    } else {
      copy = {};
      for (const [key, entry] of Object.entries(value)) {
        if (entry === undefined || typeof entry === "function" || typeof entry === "symbol" || typeof entry === "bigint") {
          throw new TypeError("non_json_protocol_value");
        }
        copy[key] = cloneProtocolValue(entry, seen);
      }
    }
    seen.delete(value);
    return copy;
  }
  function safeProtocolValue(value) {
    try { return { ok: true, value: freeze(cloneProtocolValue(value)) }; } catch (_error) { return { ok: false }; }
  }
  function major(version) {
    const match = String(version || "").match(/^(\d+)\.\d+\.\d+(?:[-+].*)?$/u);
    return match ? Number(match[1]) : null;
  }
  function acceptsManifestV1(range) {
    const normalized = String(range || "").replace(/\s+/gu, " ").trim();
    return normalized === ">=1 <2" || normalized === ">=1.0.0 <2.0.0" || normalized === "1";
  }
  function bytes(value) {
    const text = typeof value === "string" ? value : stable(value);
    if (typeof Buffer !== "undefined") return Buffer.byteLength(text, "utf8");
    return new TextEncoder().encode(text).byteLength;
  }
  function failure(errorCode) {
    return freeze({ ok: false, status: "failed", error_code: errorCode, deterministic_available: true });
  }

  const PROTOCOL_HASH = hashApi().sha256(stable(PROTOCOL_DESCRIPTOR));

  function createClient(options = {}) {
    const app = options.app || null;
    const manifests = options.manifests || manifestApi();
    const runtimeResolver = typeof options.runtimeResolver === "function"
      ? options.runtimeResolver
      : () => app && app.plugins && typeof app.plugins.getPlugin === "function"
        ? app.plugins.getPlugin(PLUGIN_ID)
        : null;
    const inFlight = new Map();

    function discover() {
      let plugin;
      try { plugin = runtimeResolver(); } catch (_error) { return { ok: false, error_code: "runtime_unavailable" }; }
      if (!plugin) return { ok: false, error_code: "runtime_unavailable" };
      const api = plugin.api || plugin;
      if (!api || REQUIRED_RUNTIME_METHODS.some((method) => typeof api[method] !== "function")) {
        return { ok: false, error_code: "runtime_api_incomplete" };
      }
      let handshake;
      try { handshake = api.getHandshake(); } catch (_error) { return { ok: false, error_code: "runtime_unavailable" }; }
      const safeHandshake = safeProtocolValue(handshake);
      if (!safeHandshake.ok) return { ok: false, error_code: "invalid_handshake" };
      handshake = safeHandshake.value;
      if (!plain(handshake) || handshake.plugin_id !== PLUGIN_ID || typeof handshake.runtime_epoch !== "string" || !handshake.runtime_epoch) {
        return { ok: false, error_code: "invalid_handshake" };
      }
      if (major(handshake.protocol_version) !== major(PROTOCOL_VERSION)) return { ok: false, error_code: "protocol_mismatch" };
      if (handshake.protocol_hash !== PROTOCOL_HASH) return { ok: false, error_code: "protocol_hash_mismatch" };
      if (!acceptsManifestV1(handshake.consumer_manifest_range)) return { ok: false, error_code: "consumer_manifest_mismatch" };
      if (!Array.isArray(handshake.capabilities) || handshake.capabilities.some((entry) =>
        typeof entry !== "string" && (!plain(entry) || typeof entry.capability !== "string"))) {
        return { ok: false, error_code: "invalid_handshake" };
      }
      const capabilities = new Set(handshake.capabilities
        .map((entry) => typeof entry === "string" ? entry : entry.capability)
        .filter(Boolean));
      return { ok: true, plugin, api, handshake, capabilities };
    }

    function getStatus() {
      const runtime = discover();
      if (!runtime.ok) {
        if (runtime.error_code === "runtime_unavailable") {
          return freeze({ ok: false, status: "runtime_unavailable", deterministic_available: true });
        }
        return freeze({ ok: false, status: "incompatible", error_code: runtime.error_code, deterministic_available: true });
      }
      let runtimeStatus;
      try { runtimeStatus = runtime.api.getStatus(); } catch (_error) { return failure("runtime_unavailable"); }
      const safeStatus = safeProtocolValue(runtimeStatus);
      if (!safeStatus.ok) return failure("malformed_runtime_response");
      return freeze({ ok: true, status: "ready", runtime: safeStatus.value, handshake: runtime.handshake });
    }

    function validateInput(input, kind) {
      if (!plain(input)) return { ok: false, error_code: "invalid_request" };
      const unknown = Object.keys(input).filter((key) => !REQUEST_KEYS.has(key));
      if (unknown.length) return { ok: false, error_code: "unknown_request_field" };
      const manifest = manifests.get(input.consumer_id);
      if (!manifest) return { ok: false, error_code: "unknown_consumer" };
      const manifestValidation = manifests.validate(manifest);
      if (!manifestValidation.ok) return { ok: false, error_code: "invalid_consumer_manifest" };
      for (const key of ["consumer_id", "owner_session_id", "operation_id", "attempt_id", "prompt"]) {
        if (typeof input[key] !== "string" || !input[key].trim()) return { ok: false, error_code: "invalid_request_identity" };
      }
      if (kind === "structured" && !plain(input.schema)) return { ok: false, error_code: "schema_required" };
      try {
        if (bytes(input.prompt) > manifest.max_input_bytes || kind === "structured" && bytes(cloneProtocolValue(input.schema)) > manifest.max_schema_bytes) {
          return { ok: false, error_code: "request_too_large" };
        }
      } catch (_error) { return { ok: false, error_code: "invalid_request" }; }
      if (input.signal !== undefined && (!input.signal || typeof input.signal.addEventListener !== "function")) {
        return { ok: false, error_code: "invalid_abort_signal" };
      }
      return { ok: true, manifest };
    }

    function validateIdentity(input) {
      if (!plain(input)) return { ok: false, error_code: "invalid_request_identity" };
      for (const key of ["consumer_id", "owner_session_id", "operation_id", "attempt_id"]) {
        if (typeof input[key] !== "string" || !input[key].trim()) return { ok: false, error_code: "invalid_request_identity" };
      }
      const manifest = manifests.get(input.consumer_id);
      if (!manifest) return { ok: false, error_code: "unknown_consumer" };
      return { ok: true, manifest };
    }

    function requestId(input) {
      return hashApi().sha256(stable({
        consumer_id: input.consumer_id,
        owner_session_id: input.owner_session_id,
        operation_id: input.operation_id,
        attempt_id: input.attempt_id,
      }));
    }

    function buildRequest(input, manifest, kind) {
      return freeze({
        protocol_version: PROTOCOL_VERSION,
        consumer_id: input.consumer_id,
        owner_session_id: input.owner_session_id,
        operation_id: input.operation_id,
        attempt_id: input.attempt_id,
        request_id: requestId(input),
        consumer_manifest: cloneProtocolValue(manifest),
        prompt: input.prompt,
        ...(kind === "structured" ? { schema: cloneProtocolValue(input.schema) } : {}),
      });
    }

    function validateResponse(response, request, epoch, manifest) {
      if (!plain(response)) return failure("malformed_runtime_response");
      if (major(response.protocol_version) !== major(PROTOCOL_VERSION)) return failure("protocol_mismatch");
      if (response.runtime_epoch !== epoch) return failure("stale_runtime_epoch");
      if (response.request_id !== request.request_id) return failure("response_identity_mismatch");
      if (!PROTOCOL_DESCRIPTOR.response_statuses.includes(response.status)) return failure("malformed_runtime_response");
      if (response.status !== "completed") {
        const safeReceipt = response.receipt === undefined || response.receipt === null
          ? { ok: true, value: null }
          : safeProtocolValue(response.receipt);
        if (!safeReceipt.ok) return failure("malformed_runtime_response");
        return freeze({
          ok: false,
          status: response.status,
          error_code: String(response.error_code || response.status),
          receipt: safeReceipt.value,
          deterministic_available: true,
        });
      }
      if (!plain(response.receipt)
        || response.receipt.consumer_id !== request.consumer_id
        || response.receipt.attempt_id !== request.attempt_id) {
        return failure("response_receipt_mismatch");
      }
      const safePayload = safeProtocolValue(response.payload);
      const safeReceipt = safeProtocolValue(response.receipt);
      if (!safePayload.ok || !safeReceipt.ok) return failure("malformed_runtime_response");
      if (bytes(safePayload.value) > manifest.max_output_bytes) return failure("output_too_large");
      return freeze({
        ok: true,
        status: "completed",
        request_id: request.request_id,
        payload: safePayload.value,
        receipt: safeReceipt.value,
      });
    }

    function request(kind, input) {
      const valid = validateInput(input, kind);
      if (!valid.ok) return Promise.resolve(failure(valid.error_code));
      const runtime = discover();
      if (!runtime.ok) return Promise.resolve(failure(runtime.error_code));
      if (!runtime.capabilities.has(valid.manifest.capability)) return Promise.resolve(failure("capability_unavailable"));
      const built = buildRequest(input, valid.manifest, kind);
      const fingerprint = hashApi().sha256(stable({
        kind,
        manifest: built.consumer_manifest,
        prompt: built.prompt,
        schema: built.schema || null,
      }));
      const active = inFlight.get(built.request_id);
      if (active) return active.fingerprint === fingerprint
        ? active.promise
        : Promise.resolve(failure("request_identity_conflict"));

      const execute = (async () => {
        if (input.signal && input.signal.aborted) {
          try { runtime.api.cancel(built.request_id); } catch (_error) {}
          return failure("cancel_requested");
        }
        let abortHandler = null;
        if (input.signal) {
          abortHandler = () => { try { runtime.api.cancel(built.request_id); } catch (_error) {} };
          input.signal.addEventListener("abort", abortHandler, { once: true });
        }
        let response;
        try {
          response = await runtime.api[kind === "structured" ? "requestStructured" : "requestChat"](built);
        } catch (_error) {
          return failure("transport_error");
        } finally {
          if (input.signal && abortHandler && typeof input.signal.removeEventListener === "function") {
            input.signal.removeEventListener("abort", abortHandler);
          }
        }
        const current = discover();
        if (!current.ok) return failure(current.error_code);
        if (current.api !== runtime.api || current.handshake.runtime_epoch !== runtime.handshake.runtime_epoch) {
          return failure("stale_runtime_epoch");
        }
        return validateResponse(response, built, runtime.handshake.runtime_epoch, valid.manifest);
      })();
      const record = { fingerprint, promise: execute };
      inFlight.set(built.request_id, record);
      execute.finally(() => { if (inFlight.get(built.request_id) === record) inFlight.delete(built.request_id); });
      return execute;
    }

    function requestStructured(input) { return request("structured", input); }
    function requestChat(input) { return request("chat", input); }
    function cancel(input) {
      const valid = validateIdentity(input);
      if (!valid.ok) return failure(valid.error_code);
      const runtime = discover();
      if (!runtime.ok) return failure(runtime.error_code);
      try {
        const safe = safeProtocolValue(runtime.api.cancel(requestId(input)));
        return safe.ok ? safe.value : failure("malformed_runtime_response");
      } catch (_error) { return failure("runtime_unavailable"); }
    }
    function getRequestStatus(input) {
      const valid = validateIdentity(input);
      if (!valid.ok) return failure(valid.error_code);
      const runtime = discover();
      if (!runtime.ok) return failure(runtime.error_code);
      try {
        const safe = safeProtocolValue(runtime.api.getRequestStatus(requestId(input)));
        return safe.ok ? safe.value : failure("malformed_runtime_response");
      } catch (_error) { return failure("runtime_unavailable"); }
    }
    function callRuntimeValue(method, input) {
      const runtime = discover();
      if (!runtime.ok) return failure(runtime.error_code);
      try {
        const safe = safeProtocolValue(runtime.api[method](input));
        return safe.ok ? safe.value : failure("malformed_runtime_response");
      } catch (_error) { return failure("runtime_unavailable"); }
    }
    async function callRuntimeValueAsync(method, input) {
      const runtime = discover();
      if (!runtime.ok) return failure(runtime.error_code);
      try {
        const value = await runtime.api[method](input);
        const safe = safeProtocolValue(value);
        return safe.ok ? safe.value : failure("malformed_runtime_response");
      } catch (_error) { return failure("runtime_unavailable"); }
    }
    function listProviders() { return callRuntimeValue("listProviders"); }
    function listModels(query) {
      if (query !== undefined && !plain(query)) return failure("invalid_request");
      let safeQuery;
      try { safeQuery = query === undefined ? undefined : cloneProtocolValue(query); } catch (_error) { return failure("invalid_request"); }
      return callRuntimeValue("listModels", safeQuery);
    }
    function resolveProvider(consumerId) {
      const manifest = manifests.get(consumerId);
      if (!manifest) return failure("unknown_consumer");
      return callRuntimeValue("resolveProvider", cloneProtocolValue(manifest));
    }
    function getConsentRequirement(consumerId) {
      const manifest = manifests.get(consumerId);
      if (!manifest) return failure("unknown_consumer");
      return callRuntimeValue("getConsentRequirement", cloneProtocolValue(manifest));
    }
    function grantConsumer(consumerId) {
      const manifest = manifests.get(consumerId);
      if (!manifest) return Promise.resolve(failure("unknown_consumer"));
      return callRuntimeValueAsync("grantConsumer", cloneProtocolValue(manifest));
    }
    function openSettings() {
      const runtime = discover();
      if (!runtime.ok) return failure(runtime.error_code);
      try {
        const safe = safeProtocolValue(runtime.api.openSettings());
        return safe.ok ? safe.value : failure("malformed_runtime_response");
      } catch (_error) { return failure("runtime_unavailable"); }
    }
    function subscribeStatus(listener) {
      if (typeof listener !== "function") return () => {};
      const runtime = discover();
      if (!runtime.ok) return () => {};
      try {
        const unsubscribe = runtime.api.subscribeStatus((event) => {
          const safe = safeProtocolValue(event);
          listener(safe.ok ? safe.value : failure("malformed_runtime_response"));
        });
        return typeof unsubscribe === "function" ? unsubscribe : () => {};
      } catch (_error) { return () => {}; }
    }

    return freeze({
      cancel,
      getConsentRequirement,
      getRequestStatus,
      getStatus,
      grantConsumer,
      listModels,
      listProviders,
      openSettings,
      requestChat,
      requestId,
      requestStructured,
      resolveProvider,
      subscribeStatus,
    });
  }

  const api = freeze({
    PLUGIN_ID,
    PROTOCOL_DESCRIPTOR,
    PROTOCOL_HASH,
    PROTOCOL_VERSION,
    createClient,
  });
  root.ProdigyAIClient = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
