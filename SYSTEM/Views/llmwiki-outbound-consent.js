(function (root) {
  "use strict";

  const hashApi = root.LLMWikiHash || (typeof require === "function" ? require("./llmwiki-hash.js") : null);
  const providerApi = root.LLMWikiProviderContract || (typeof require === "function" ? require("./llmwiki-provider-contract.js") : null);
  const nodeCrypto = typeof require === "function" ? require("node:crypto") : null;
  const CONSENT_VERSION = "llmwiki_outbound_consent_v1";
  const ID = /^[a-z][a-z0-9_-]{2,127}$/u;
  const HASH = /^[0-9a-f]{64}$/u;
  const NONCE = /^[A-Za-z0-9_-]{16,128}$/u;
  const POLICY_KEYS = new Set(["include_source_text", "include_unselected_vault_data", "include_credentials", "include_cookies"]);
  const SECRET_KEYS = new Set(["api_key", "apikey", "authorization", "credential", "credentials", "cookie", "cookies", "password", "secret", "token", "access_token", "refresh_token"]);
  const ARTIFACT_KEYS = Object.freeze([
    "consent_hash", "consent_version", "issued_at", "nonce", "outbound_policy_hash", "outbound_text_hash",
    "provider_key", "provider_mode", "run_id", "selected_sources",
  ]);
  const WRITE_COUNTERS = Object.freeze({
    source_archive: 0,
    capture: 0,
    canonical: 0,
    audit: 0,
    derived_snapshot: 0,
    derived_failure: 0,
    candidate: 0,
    index: 0,
    memory: 0,
    feedback: 0,
    git: 0,
    validation_workspace: 0,
  });

  function plain(value) { return Boolean(value) && typeof value === "object" && !Array.isArray(value); }
  function trim(value) { return typeof value === "string" ? value.trim() : ""; }
  function freeze(value) {
    if (Array.isArray(value)) return Object.freeze(value.map(freeze));
    if (!plain(value)) return value;
    return Object.freeze(Object.fromEntries(Object.entries(value).map(([key, item]) => [key, freeze(item)])));
  }
  function stable(value) {
    if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
    if (!plain(value)) return JSON.stringify(value);
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stable(value[key])}`).join(",")}}`;
  }
  function fail(field, reason) {
    return freeze({ ok: false, field, reason, provider_network: 0, write_counters: WRITE_COUNTERS });
  }
  function ok(value) { return freeze({ ok: true, value }); }

  function sensitiveFieldPath(value, path = []) {
    if (Array.isArray(value)) {
      for (const [index, item] of value.entries()) {
        const nested = sensitiveFieldPath(item, [...path, String(index)]);
        if (nested) return nested;
      }
      return "";
    }
    if (!plain(value)) return "";
    for (const [key, item] of Object.entries(value)) {
      const normalizedKey = key.toLowerCase();
      const currentPath = [...path, key];
      const falsePolicyFlag = (normalizedKey === "include_credentials" || normalizedKey === "include_cookies") && item === false;
      if (!falsePolicyFlag && normalizedKey !== "provider_key" && SECRET_KEYS.has(normalizedKey)) return currentPath.join(".");
      const nested = sensitiveFieldPath(item, currentPath);
      if (nested) return nested;
    }
    return "";
  }

  function normalizePolicy(value) {
    if (value === undefined) value = {};
    if (!plain(value)) return fail("outbound_policy", "invalid_outbound_policy");
    for (const key of Object.keys(value)) if (!POLICY_KEYS.has(key)) return fail("outbound_policy", "unknown_outbound_policy_field");
    if (value.include_unselected_vault_data === true) return fail("outbound_policy.include_unselected_vault_data", "unselected_vault_data_forbidden");
    if (value.include_credentials === true) return fail("outbound_policy.include_credentials", "credentials_forbidden");
    if (value.include_cookies === true) return fail("outbound_policy.include_cookies", "cookies_forbidden");
    return ok({
      include_source_text: value.include_source_text === true,
      include_unselected_vault_data: false,
      include_credentials: false,
      include_cookies: false,
    });
  }

  function normalizeSources(value) {
    if (!Array.isArray(value) || value.length === 0) return fail("sources", "source_required");
    const selected = [];
    const ids = new Set();
    for (const [index, source] of value.entries()) {
      if (!plain(source)) return fail(`sources.${index}`, "malformed_source");
      const sourceId = trim(source.source_id);
      const contentHash = trim(source.content_hash);
      if (source.selected !== true) return fail(`sources.${index}.selected`, "source_not_selected");
      if (!ID.test(sourceId)) return fail(`sources.${index}.source_id`, "invalid_source_id");
      if (!HASH.test(contentHash)) return fail(`sources.${index}.content_hash`, "invalid_content_hash");
      if (ids.has(sourceId)) return fail(`sources.${index}.source_id`, "duplicate_source_id");
      ids.add(sourceId);
      selected.push({ source_id: sourceId, content_hash: contentHash, outbound_text: trim(source.outbound_text) });
    }
    selected.sort((left, right) => left.source_id.localeCompare(right.source_id) || left.content_hash.localeCompare(right.content_hash));
    return ok(selected);
  }

  function resolveProfile(request, options) {
    const selected = providerApi.selectProviderProfile(request, options);
    if (!selected || selected.ok !== true) return selected || fail("provider", "provider_contract_unavailable");
    if (selected.value.provider_mode === "omniroute" && selected.value.explicit_provider !== true) {
      return fail("provider_mode", "omniroute_not_selected_for_run");
    }
    return selected;
  }

  function bindingFor(request, options = {}) {
    if (!plain(request)) return fail("request", "malformed_request");
    const sensitivePath = sensitiveFieldPath(request);
    if (sensitivePath) {
      const reason = sensitivePath.endsWith("include_cookies") || sensitivePath.endsWith("cookies") || sensitivePath.endsWith("cookie") ? "cookies_forbidden" : "credentials_forbidden";
      return fail(sensitivePath, reason);
    }
    const profile = resolveProfile(request, options);
    if (!profile || profile.ok !== true) return profile;
    const runId = trim(request.proposal_request && request.proposal_request.run_id);
    if (!ID.test(runId)) return fail("proposal_request.run_id", "invalid_run_id");
    const policy = normalizePolicy(request.outbound_policy);
    if (policy.ok === false) return policy;
    const sources = normalizeSources(request.sources);
    if (sources.ok === false) return sources;
    const selectedSources = sources.value.map(({ source_id, content_hash }) => ({ source_id, content_hash }));
    const outboundTexts = sources.value.map(({ source_id, content_hash, outbound_text }) => ({ source_id, content_hash, outbound_text }));
    return ok({
      run_id: runId,
      provider_mode: profile.value.provider_mode,
      provider_key: profile.value.provider_key,
      selected_sources: selectedSources,
      outbound_policy_hash: hashApi.sha256(stable(policy.value)),
      outbound_text_hash: hashApi.sha256(stable(outboundTexts)),
      outbound_policy: policy.value,
    });
  }

  function validIssuedAt(value) {
    const issuedAt = trim(value);
    const milliseconds = Date.parse(issuedAt);
    return Number.isFinite(milliseconds) && new Date(milliseconds).toISOString() === issuedAt;
  }

  function generatedNonce(options) {
    if (options.nonce !== undefined) return trim(options.nonce);
    if (nodeCrypto && typeof nodeCrypto.randomUUID === "function") return nodeCrypto.randomUUID();
    if (root.crypto && typeof root.crypto.randomUUID === "function") return root.crypto.randomUUID();
    return "";
  }

  function createConsentArtifact(request, options = {}) {
    if (options.explicit_user_consent !== true) return fail("consent", "consent_required");
    const binding = bindingFor(request, options);
    if (binding.ok === false) return binding;
    const issuedAt = trim(options.issued_at) || new Date().toISOString();
    const nonce = generatedNonce(options);
    if (!validIssuedAt(issuedAt)) return fail("issued_at", "invalid_issued_at");
    if (!NONCE.test(nonce)) return fail("nonce", "invalid_nonce");
    const { outbound_policy: ignoredPolicy, ...boundFields } = binding.value;
    void ignoredPolicy;
    const artifact = freeze({ consent_version: CONSENT_VERSION, ...boundFields, issued_at: issuedAt, nonce });
    return ok({ ...artifact, consent_hash: hashApi.sha256(stable(artifact)) });
  }

  function structurallyValidArtifact(artifact) {
    if (!plain(artifact) || Object.keys(artifact).sort().join("\n") !== [...ARTIFACT_KEYS].sort().join("\n")) return false;
    if (artifact.consent_version !== CONSENT_VERSION || !ID.test(trim(artifact.run_id))) return false;
    if (!providerApi.PROVIDER_MODES.includes(trim(artifact.provider_mode)) || !ID.test(trim(artifact.provider_key))) return false;
    if (!HASH.test(trim(artifact.outbound_policy_hash)) || !HASH.test(trim(artifact.outbound_text_hash))) return false;
    if (!validIssuedAt(artifact.issued_at) || !NONCE.test(trim(artifact.nonce)) || !HASH.test(trim(artifact.consent_hash))) return false;
    if (!Array.isArray(artifact.selected_sources) || artifact.selected_sources.length === 0) return false;
    const ids = new Set();
    for (const source of artifact.selected_sources) {
      if (!plain(source) || Object.keys(source).sort().join("\n") !== "content_hash\nsource_id") return false;
      if (!ID.test(trim(source.source_id)) || !HASH.test(trim(source.content_hash)) || ids.has(source.source_id)) return false;
      ids.add(source.source_id);
    }
    const { consent_hash: consentHash, ...boundArtifact } = artifact;
    return hashApi.sha256(stable(boundArtifact)) === consentHash;
  }

  function validateConsentArtifact(artifact, request, options = {}) {
    if (!structurallyValidArtifact(artifact)) return fail("consent", "invalid_consent");
    const binding = bindingFor(request, options);
    if (binding.ok === false) return binding;
    const { outbound_policy: outboundPolicy, ...current } = binding.value;
    const expected = stable(current);
    const actual = stable({
      run_id: artifact.run_id,
      provider_mode: artifact.provider_mode,
      provider_key: artifact.provider_key,
      selected_sources: artifact.selected_sources,
      outbound_policy_hash: artifact.outbound_policy_hash,
      outbound_text_hash: artifact.outbound_text_hash,
    });
    if (actual !== expected) return fail("consent", "consent_mismatch");
    return ok({ artifact, outbound_policy: outboundPolicy });
  }

  async function invokeProposalProvider(request, options = {}) {
    if (!plain(options.consent)) return fail("consent", "consent_required");
    const consent = validateConsentArtifact(options.consent, request, options);
    if (consent.ok === false) return consent;
    if (typeof options.transport !== "function") return fail("transport", "transport_required");
    let providerNetwork = 0;
    const result = await providerApi.invokeProposalProvider({ ...request, outbound_policy: consent.value.outbound_policy }, {
      ...options,
      transport: async (normalized) => {
        providerNetwork += 1;
        return options.transport(normalized);
      },
    });
    return freeze({ ...result, provider_network: providerNetwork, write_counters: WRITE_COUNTERS });
  }

  const api = freeze({ CONSENT_VERSION, PERSISTENT_WRITE_COUNTERS: WRITE_COUNTERS, createConsentArtifact, validateConsentArtifact, invokeProposalProvider });
  root.LLMWikiOutboundConsent = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
