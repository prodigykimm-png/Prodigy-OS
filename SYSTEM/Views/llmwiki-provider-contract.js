(function (root) {
  "use strict";

  const proposalBundleApi = root.LLMWikiProposalBundle || (typeof require === "function" ? require("./llmwiki-proposal-bundle.js") : null);
  const operationApi = root.LLMWikiOperationContract || (typeof require === "function" ? require("./llmwiki-operation-contract.js") : null);
  const FEATURES = Object.freeze(["llmwiki"]);
  const PROVIDER_MODES = Object.freeze(["runtime", "direct"]);
  const RETRY_OWNERS = Object.freeze(["prodigy"]);
  const SENSITIVITY = Object.freeze(["public", "internal", "private"]);
  const CONFIDENCE = Object.freeze(["explicit", "inferred", "low"]);
  const RESPONSE_KEYS = new Set(["status", "proposal_bundle", "response_metadata"]);
  const REQUEST_METADATA_KEYS = new Set(["request_id", "trace", "profile_revision"]);
  const HASH = /^[0-9a-f]{64}$/u;

  function plain(value) { return Boolean(value) && typeof value === "object" && !Array.isArray(value); }
  function trim(value) { return typeof value === "string" ? value.trim() : ""; }
  function freeze(value) {
    if (operationApi?.isOperationRecord?.(value) || operationApi?.isCanonicalOperationRecord?.(value)) return value;
    if (Array.isArray(value)) return Object.freeze(value.map(freeze));
    if (!plain(value)) return value;
    return Object.freeze(Object.fromEntries(Object.entries(value).map(([key, item]) => [key, freeze(item)])));
  }
  function fail(field, reason, extras) {
    return freeze({ ok: false, field, reason, writer_count: 0, ...(plain(extras) ? extras : {}) });
  }
  function ok(value) { return freeze({ ok: true, value }); }
  function list(value) { return Array.isArray(value) ? value : []; }
  function uniq(values) { return [...new Set(values.map(trim).filter(Boolean))]; }

  function safeLocator(value) {
    const locator = trim(value);
    const pathPart = locator.split("#", 1)[0];
    const parts = pathPart.split("/");
    if (!locator || /[\u0000-\u001f\u007f]/u.test(locator) || locator.includes("\\") || locator.includes("[[") || locator.includes("]]")) return "";
    if (pathPart.startsWith("/") || /^[A-Za-z]:/u.test(pathPart) || parts.some((part) => part === "." || part === "..")) return "";
    return locator;
  }

  function normalizeMetadata(input) {
    if (input === undefined) return {};
    if (!plain(input)) return fail("request_metadata", "invalid_request_metadata");
    const result = {};
    for (const [key, value] of Object.entries(input)) {
      if (!REQUEST_METADATA_KEYS.has(key)) return fail("request_metadata", "unknown_request_metadata");
      result[key] = trim(value);
    }
    return result;
  }

  function normalizePolicy(policy) {
    if (!plain(policy)) return fail("outbound_policy", "invalid_outbound_policy");
    const includeSourceText = policy.include_source_text === true;
    if (policy.include_unselected_vault_data === true) return fail("outbound_policy.include_unselected_vault_data", "unselected_vault_data_forbidden");
    if (policy.include_credentials === true) return fail("outbound_policy.include_credentials", "credentials_forbidden");
    if (policy.include_cookies === true) return fail("outbound_policy.include_cookies", "cookies_forbidden");
    return freeze({
      include_source_text: includeSourceText,
      include_unselected_vault_data: false,
      include_credentials: false,
      include_cookies: false,
    });
  }

  function normalizeScope(scope) {
    if (!plain(scope)) return fail("source_scope", "invalid_source_scope");
    const allowedSourceIds = uniq(list(scope.allowed_source_ids));
    const allowedLocatorPrefixes = uniq(list(scope.allowed_locator_prefixes));
    if (allowedSourceIds.length === 0 || allowedLocatorPrefixes.length === 0) return fail("source_scope", "missing_allowlist");
    for (const prefix of allowedLocatorPrefixes) if (!safeLocator(`${prefix.replace(/\/?$/u, "/")}safe`)) return fail("source_scope.allowed_locator_prefixes", "invalid_locator_prefix");
    return freeze({
      allowed_source_ids: allowedSourceIds,
      allowed_locator_prefixes: allowedLocatorPrefixes,
      allow_private_sources: scope.allow_private_sources === true,
    });
  }

  function normalizeSource(source, scope, policy, index) {
    if (!plain(source)) return fail(`sources.${index}`, "malformed_source");
    const sourceId = trim(source.source_id);
    const contentHash = trim(source.content_hash);
    const locator = safeLocator(source.locator);
    const sensitivity = trim(source.sensitivity || "internal");
    const confidence = trim(source.confidence || "explicit");
    if (!sourceId) return fail(`sources.${index}.source_id`, "source_id_required");
    if (!HASH.test(contentHash)) return fail(`sources.${index}.content_hash`, "invalid_content_hash");
    if (!locator) return fail(`sources.${index}.locator`, "invalid_locator");
    if (!SENSITIVITY.includes(sensitivity)) return fail(`sources.${index}.sensitivity`, "invalid_sensitivity");
    if (!CONFIDENCE.includes(confidence)) return fail(`sources.${index}.confidence`, "invalid_confidence");
    if (source.selected !== true) return fail(`sources.${index}.selected`, "source_not_selected");
    if (!scope.allowed_source_ids.includes(sourceId)) return fail(`sources.${index}.source_id`, "source_not_allowed");
    if (!scope.allowed_locator_prefixes.some((prefix) => locator.startsWith(prefix))) return fail(`sources.${index}.locator`, "source_locator_not_allowed");
    if (sensitivity === "private" && scope.allow_private_sources !== true) return fail(`sources.${index}.sensitivity`, "private_source_forbidden");
    const normalized = {
      source_id: sourceId,
      content_hash: contentHash,
      locator,
      sensitivity,
      confidence,
    };
    const sourceUrl = trim(source.source_url);
    if (sourceUrl) normalized.source_url = sourceUrl;
    if (policy.include_source_text) normalized.text = trim(source.outbound_text);
    return freeze(normalized);
  }

  function normalizeSources(sources, scope, policy) {
    if (!Array.isArray(sources) || sources.length === 0) return fail("sources", "source_required");
    const normalized = [];
    for (const [index, source] of sources.entries()) {
      const item = normalizeSource(source, scope, policy, index);
      if (item.ok === false) return item;
      normalized.push(item);
    }
    return freeze(normalized);
  }

  function profileModeFor(request) {
    if (request.provider_mode !== undefined) return trim(request.provider_mode);
    return "runtime";
  }

  function selectProviderProfile(request, context = {}) {
    if (!plain(request)) return fail("request", "malformed_request");
    const feature = trim(request.feature);
    if (!FEATURES.includes(feature)) return fail("feature", "unsupported_feature");
    const providerMode = profileModeFor(request);
    if (!PROVIDER_MODES.includes(providerMode)) return fail("provider_mode", "invalid_provider_mode");
    const retryOwner = trim(request.retry_owner || "prodigy");
    if (!RETRY_OWNERS.includes(retryOwner)) return fail("retry_owner", "invalid_retry_owner");
    const timeoutMs = Number(request.timeout_ms);
    if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 120000) return fail("timeout_ms", "invalid_timeout");
    const requestMetadata = normalizeMetadata(request.request_metadata);
    if (requestMetadata.ok === false) return requestMetadata;
    return ok({
      feature,
      provider_mode: "runtime",
      provider_key: "runtime",
      explicit_provider: false,
      timeout_ms: timeoutMs,
      retry_owner: retryOwner,
      fallback_allowed: false,
      request_metadata: requestMetadata,
    });
  }

  function normalizedRequest(request, profile) {
    const scope = normalizeScope(request.source_scope);
    if (scope.ok === false) return scope;
    const policy = normalizePolicy(request.outbound_policy);
    if (policy.ok === false) return policy;
    const sources = normalizeSources(request.sources, scope, policy);
    if (sources.ok === false) return sources;
    if (!plain(request.proposal_request)) return fail("proposal_request", "invalid_proposal_request");
    return ok({
      feature: profile.feature,
      provider_mode: profile.provider_mode,
      provider_key: profile.provider_key,
      timeout_ms: profile.timeout_ms,
      retry_owner: profile.retry_owner,
      source_scope: scope,
      outbound_policy: policy,
      request_metadata: profile.request_metadata,
      outbound_payload: freeze({
        proposal_request: freeze({
          run_id: trim(request.proposal_request.run_id),
          validation_context: freeze(request.proposal_request.validation_context || {}),
          instruction: trim(request.proposal_request.instruction),
        }),
        sources,
      }),
    });
  }

  function sourceMap(normalized) {
    return new Map(normalized.outbound_payload.sources.map((source) => [source.source_id, source]));
  }

  function rejectInjectedResponse(response) {
    if (!plain(response)) return fail("response", "malformed_response");
    for (const key of Object.keys(response)) if (!RESPONSE_KEYS.has(key)) return fail("response", "unknown_response_field");
    if (trim(response.status) !== "ok") return fail("response.status", "invalid_response_status");
    return null;
  }

  function rejectRawWriteIntent(bundle) {
    for (const proposal of list(bundle && bundle.proposals)) {
      if (proposal && proposal.write_intent !== undefined) return fail("proposal_bundle.write_intent", "write_forbidden");
      for (const nested of [proposal && proposal.dispute, proposal && proposal.supersession]) {
        if (nested && nested.write_intent !== undefined) return fail("proposal_bundle.write_intent", "write_forbidden");
      }
    }
    return null;
  }

  function citationMatchesSelectedLocator(citation, selected) {
    const locators = Array.isArray(citation && citation.locators) ? citation.locators.map(trim) : [];
    return locators.length === 1 && locators[0] === selected.locator;
  }

  function normalizeResponse(response, normalized) {
    const injected = rejectInjectedResponse(response);
    if (injected) return injected;
    const rawWrite = rejectRawWriteIntent(response.proposal_bundle);
    if (rawWrite) return rawWrite;
    const bundleResult = proposalBundleApi.validateProposalBundle(response.proposal_bundle);
    if (!bundleResult || bundleResult.ok !== true) return fail(bundleResult && bundleResult.field || "proposal_bundle", bundleResult && bundleResult.reason || "invalid_proposal_bundle");
    const sourcesById = sourceMap(normalized);
    for (const proposal of bundleResult.value.proposals) {
      if (proposal.write_intent.target !== "none" || proposal.write_intent.persistence !== "none") return fail("proposal_bundle.write_intent", "write_forbidden");
      for (const citation of proposal.source_citations || []) {
        const selected = sourcesById.get(citation.source_id);
        if (!selected) return fail("proposal_bundle.source_citations", "citation_source_not_allowed");
        if (citation.content_hash !== selected.content_hash) return fail("proposal_bundle.source_citations.content_hash", "citation_hash_mismatch");
        if (!citationMatchesSelectedLocator(citation, selected)) return fail("proposal_bundle.source_citations.locator", "citation_locator_mismatch");
      }
    }
    return ok({
      provider_mode: normalized.provider_mode,
      feature: normalized.feature,
      proposal_envelope: bundleResult.value,
      trust_state: "proposal_unverified",
      approval_state: "requires_human_approval",
      retrieval_authority: "deterministic_llmwiki_core",
      provider_metadata: freeze({
        mode: normalized.provider_mode,
        feature: normalized.feature,
        response: freeze(response.response_metadata || {}),
        retry: {
          owner: normalized.retry_owner,
          timeout_ms: normalized.timeout_ms,
          fallback_allowed: false,
        },
      }),
      canonical_write_count: 0,
      candidate_write_count: 0,
      index_write_count: 0,
      memory_write_count: 0,
      feedback_write_count: 0,
    });
  }

  function providerFailure(error, normalized) {
    const status = Number(error && error.status || 0);
    const code = trim(error && error.code);
    const message = trim(error && error.message);
    let reason = "provider_unavailable";
    if (status === 429) reason = "provider_rate_limited";
    else if (code === "ETIMEDOUT" || /timeout|timed out/i.test(message)) reason = "provider_timeout";
    return fail("provider", reason, {
      provider_mode: normalized.provider_mode,
      fallback_attempted: false,
      status: status || undefined,
    });
  }

  async function invokeProposalProvider(request, options = {}) {
    const profileResult = selectProviderProfile(request, options);
    if (profileResult.ok === false) return profileResult;
    const normalizedResult = normalizedRequest(request, profileResult.value);
    if (normalizedResult.ok === false) return normalizedResult;
    const transport = options.transport;
    if (typeof transport !== "function") return fail("transport", "transport_required");
    try {
      const response = await transport(normalizedResult.value);
      return normalizeResponse(response, normalizedResult.value);
    } catch (error) {
      return providerFailure(error, normalizedResult.value);
    }
  }

  const api = freeze({
    FEATURES, PROVIDER_MODES, RETRY_OWNERS,
    selectProviderProfile, normalizeRequest: normalizedRequest, normalizeResponse, invokeProposalProvider,
  });
  root.LLMWikiProviderContract = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
