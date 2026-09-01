(function (root) {
  "use strict";

  function clientFor(app, injected) {
    if (injected && typeof injected.resolveProvider === "function") return injected;
    const api = root.ProdigyAIClient || (typeof require === "function" ? require("./prodigy-ai-client.js") : null);
    return api && typeof api.createClient === "function" ? api.createClient({ app }) : null;
  }
  function unavailable(code, reason) {
    return { ok: false, call_allowed: false, code, field: "", reason: reason || "", network_calls: 0 };
  }
  function identity(client, resolution) {
    const status = client.getStatus();
    return Object.freeze({
      feature: "llmwiki-batch",
      provider_key: String(resolution.profile_id || ""),
      provider_name: String(resolution.profile_id || "AI Runtime"),
      model: "",
      mode: "runtime",
      adapter: "prodigy-ai-runtime",
      auth_mode: "plugin",
      base_url: "",
      endpoint_path: "",
      endpoint_url: "",
      api_key_header: "",
      api_key_secret_id: "",
      structured_mode: "json-schema",
      schema_dialect: "runtime-certified",
      schema_capability: "structured-strict",
      profile_revision: String(status.handshake && status.handshake.runtime_epoch || ""),
      protocol_hash: String(status.handshake && status.handshake.protocol_hash || ""),
      route_class: String(resolution.route_class || ""),
    });
  }
  function resolveBatchCapability(_legacyConfig, options = {}) {
    const client = clientFor(options.app, options.client);
    if (!client) return unavailable("runtime_unavailable", "AI Runtime client를 사용할 수 없습니다.");
    const status = client.getStatus();
    if (!status || status.ok !== true) return unavailable(status && status.error_code || "runtime_unavailable");
    const resolution = client.resolveProvider("wiki.batch_analysis");
    if (!resolution || !["ready", "consent_required"].includes(resolution.status)) {
      return unavailable(resolution && resolution.error_code || "capability_unavailable");
    }
    return {
      ok: true,
      call_allowed: resolution.status === "ready",
      network_calls: 0,
      provider_key: String(resolution.profile_id || ""),
      provider_name: String(resolution.profile_id || "AI Runtime"),
      adapter: "prodigy-ai-runtime",
      auth_mode: "plugin",
      base_url: "",
      endpoint_path: "",
      endpoint_url: "",
      api_key_header: "",
      api_key_secret_id: "",
      model: "",
      structured_mode: "json-schema",
      schema_dialect: "runtime-certified",
      consent_required: resolution.status === "consent_required",
      resolution,
    };
  }
  async function resolveBatchReadiness(app, _legacyConfig, options = {}) {
    const client = clientFor(app, options.client);
    const capability = resolveBatchCapability(null, { app, client });
    if (!capability.ok) return capability;
    if (capability.consent_required) return unavailable("consent_required", "AI Runtime route 동의가 필요합니다.");
    return { ok: true, call_allowed: true, network_calls: 0, identity: identity(client, capability.resolution) };
  }
  function resolveBatchReadinessFromError() {
    return unavailable("runtime_unavailable", "AI Runtime readiness를 확인하지 못했습니다.");
  }
  function assertIdentityMatches(frozenIdentity, _legacyConfig, options = {}) {
    const client = clientFor(options.app, options.client);
    if (!client) return { ok: false, call_allowed: false, code: "identity_drift", changed_fields: ["runtime"], network_calls: 0 };
    const resolution = client.resolveProvider("wiki.batch_analysis");
    if (!resolution || resolution.status !== "ready") {
      return { ok: false, call_allowed: false, code: "identity_drift", changed_fields: ["runtime"], network_calls: 0 };
    }
    const current = identity(client, resolution);
    const changed = Object.keys(current).filter((key) => key !== "feature" && current[key] !== frozenIdentity[key]);
    return changed.length
      ? { ok: false, call_allowed: false, code: "identity_drift", changed_fields: Object.freeze(changed.sort()), network_calls: 0 }
      : { ok: true, call_allowed: true, changed_fields: [], network_calls: 0 };
  }
  function normalizeSchemaForIdentity(_identity, schema) { return schema; }

  const api = Object.freeze({
    SUPPORTED_STRUCTURED_MODES: Object.freeze(["json-schema"]),
    resolveBatchCapability,
    resolveBatchReadiness,
    resolveBatchReadinessFromError,
    assertIdentityMatches,
    normalizeSchemaForIdentity,
  });
  root.LLMWikiProviderCapability = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
