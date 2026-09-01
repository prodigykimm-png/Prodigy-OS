(function (root) {
  "use strict";

  if (!root.ProdigyAIConsumerRuntime && typeof require === "function") root.ProdigyAIConsumerRuntime = require("./prodigy-ai-consumer-runtime.js");
  if (!root.LLMWikiUIRecovery && typeof require === "function") root.LLMWikiUIRecovery = require("./llmwiki-ui-recovery.js");
  if (!root.LLMWikiProviderResponseSchema && typeof require === "function") root.LLMWikiProviderResponseSchema = require("./llmwiki-provider-response-schema.js");

  const RESPONSE_KEYS = new Set(["status", "proposal_bundle", "response_metadata"]);
  const METADATA_KEYS = new Set(["provider_status", "latency_ms", "request_id", "profile_revision"]);
  const REQUEST_METADATA_KEYS = new Set(["request_id", "trace", "profile_revision"]);
  const FORBIDDEN_PAYLOAD_KEYS = /(?:api[_-]?key|secret|cookie|password|authorization|bearer|config)/iu;

  function plain(value) { return Boolean(value) && typeof value === "object" && !Array.isArray(value); }
  const RESPONSE_SCHEMA_ID = "prodigy://llmwiki/provider-response-schema-v1";
  function validResponseSchema(schema) {
    if (!plain(schema) || schema.$id !== RESPONSE_SCHEMA_ID || schema.type !== "object" || schema.additionalProperties !== false) return false;
    const properties = plain(schema.properties) ? schema.properties : {};
    const required = Array.isArray(schema.required) ? new Set(schema.required) : new Set();
    const bundle = properties.proposal_bundle;
    return required.has("status")
      && required.has("proposal_bundle")
      && plain(properties.status)
      && properties.status.const === "ok"
      && plain(bundle)
      && bundle.$ref === "#/$defs/proposalBundle"
      && plain(schema.$defs)
      && plain(schema.$defs.proposalBundle)
      && schema.$defs.proposalBundle.additionalProperties === false;
  }
  function trim(value) { return typeof value === "string" ? value.trim() : ""; }
  function freeze(value) {
    if (Array.isArray(value)) return Object.freeze(value.map(freeze));
    if (!plain(value)) return value;
    return Object.freeze(Object.fromEntries(Object.entries(value).map(([key, item]) => [key, freeze(item)])));
  }
  function recoveryFor(input) {
    if (root.LLMWikiUIRecovery && typeof root.LLMWikiUIRecovery.mapRecovery === "function") return root.LLMWikiUIRecovery.mapRecovery(input);
    return { code: "unknown", copy: "LLMWiki 요청을 완료하지 못했습니다. 잠시 후 다시 시도해 주세요.", action: "retry_later" };
  }
  function failure(code, message, extra) {
    const mapped = message ? { code, copy: message, action: "retry" } : recoveryFor({ code });
    return freeze({ ok: false, call_allowed: false, code, message: mapped.copy, recovery: mapped, fallback_attempted: false, raw_payload_exposed: false, ...(plain(extra) ? extra : {}) });
  }
  function success(value) { return freeze({ ok: true, call_allowed: true, fallback_attempted: false, raw_payload_exposed: false, ...(plain(value) ? value : {}) }); }

  function safeRequestMetadata(value) {
    if (!plain(value)) return failure("request_metadata_invalid", "LLMWiki 요청 메타데이터를 확인하지 못했습니다.");
    const result = {};
    for (const [key, item] of Object.entries(value)) {
      if (!REQUEST_METADATA_KEYS.has(key) || typeof item !== "string") return failure("request_metadata_invalid", "LLMWiki 요청 메타데이터를 확인하지 못했습니다.");
      result[key] = item.trim();
    }
    return success({ request_metadata: result });
  }
  function safeConsentHashes(value) {
    if (value === undefined) return success({ consent: undefined });
    if (!plain(value)) return failure("consent_invalid", "LLMWiki 동의 정보를 확인하지 못했습니다.");
    const result = {};
    for (const key of ["consent_hash", "outbound_policy_hash", "outbound_text_hash"]) {
      if (value[key] !== undefined) {
        if (typeof value[key] !== "string" || !HASH.test(value[key].trim())) return failure("consent_invalid", "LLMWiki 동의 정보를 확인하지 못했습니다.");
        result[key] = value[key].trim();
      }
    }
    return success({ consent: result });
  }

  function containsForbiddenKey(value, seen = new Set()) {
    if (Array.isArray(value)) return value.some((item) => containsForbiddenKey(item, seen));
    if (!plain(value)) return false;
    if (seen.has(value)) return true;
    seen.add(value);
    return Object.entries(value).some(([key, item]) => FORBIDDEN_PAYLOAD_KEYS.test(key) || containsForbiddenKey(item, seen));
  }

  function resolveProfile(_config, normalized) {
    if (!plain(normalized)) return failure("normalized_request_invalid", "LLMWiki 요청 계약을 확인하지 못했습니다.");
    const metadata = safeRequestMetadata(normalized.request_metadata);
    if (!metadata.ok) return metadata;
    const timeoutMs = Number(normalized.timeout_ms);
    if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 120000) return failure("timeout_invalid", "LLMWiki AI 요청 시간을 확인하지 못했습니다.");
    if (!plain(normalized.outbound_payload) || containsForbiddenKey(normalized.outbound_payload)) return failure("outbound_payload_invalid", "LLMWiki 요청 자료를 안전하게 준비하지 못했습니다.");
    return success({ feature: trim(normalized.feature || "llmwiki"), provider_mode: "runtime", provider_key: "runtime", timeout_ms: timeoutMs, request_metadata: metadata.request_metadata, outbound_payload: normalized.outbound_payload });
  }

  const BUNDLE_KEYS = new Set(["bundle_version", "run_id", "validation_context", "status", "proposals", "canonical_serialization", "bundle_hash"]);
  const PROPOSAL_KEYS = new Set(["proposal_id", "kind", "title", "status", "confidence", "source_citations", "claims", "affected_targets", "target", "target_revision", "diff", "conflicts", "source_input_ids", "existing_target_ids", "dispute", "abstention_reason", "no_change_reason"]);
  const CITATION_KEYS = new Set(["source_id", "content_hash", "source_url", "locators", "source_archive_id", "confidence"]);
  const HASH = /^[0-9a-f]{64}$/u;

  function hasKey(value, key, seen = new Set()) {
    if (Array.isArray(value)) return value.some((item) => hasKey(item, key, seen));
    if (!plain(value)) return false;
    if (seen.has(value)) return false;
    seen.add(value);
    return Object.entries(value).some(([name, item]) => name === key || hasKey(item, key, seen));
  }

  function validateProposalBundleShape(bundle, outboundPayload) {
    if (!plain(bundle)) return failure("proposal_bundle_invalid");
    if (Object.keys(bundle).some((key) => !BUNDLE_KEYS.has(key))) return failure("proposal_bundle_invalid");
    if (!trim(bundle.run_id) || !plain(bundle.validation_context) || !Array.isArray(bundle.proposals) || bundle.proposals.length === 0) {
      return failure("proposal_bundle_invalid");
    }
    if (outboundPayload && outboundPayload.proposal_request && trim(outboundPayload.proposal_request.run_id) !== trim(bundle.run_id)) return failure("proposal_bundle_invalid");
    if (bundle.bundle_version !== undefined && bundle.bundle_version !== "llmwiki_proposal_bundle_v1") return failure("proposal_bundle_invalid");
    if (bundle.status !== undefined && !["proposed", "abstain", "no_change"].includes(bundle.status)) return failure("proposal_bundle_invalid");
    if (bundle.bundle_hash !== undefined && !HASH.test(trim(bundle.bundle_hash))) return failure("proposal_bundle_invalid");
    const sources = new Map(Array.isArray(outboundPayload && outboundPayload.sources)
      ? outboundPayload.sources.map((source) => [trim(source && source.source_id), source])
      : []);
    for (const proposal of bundle.proposals) {
      if (!plain(proposal) || Object.keys(proposal).some((key) => !PROPOSAL_KEYS.has(key))) return failure("proposal_bundle_invalid");
      if (!["create", "update", "merge", "dispute", "abstain", "no_change"].includes(trim(proposal.kind)) || typeof proposal.title !== "string" || !proposal.title.trim()) return failure("proposal_bundle_invalid");
      if (!["explicit", "inferred", "low"].includes(trim(proposal.confidence)) || !Array.isArray(proposal.source_citations) || proposal.source_citations.length === 0) return failure("proposal_bundle_invalid");
      for (const citation of proposal.source_citations) {
        if (!plain(citation) || Object.keys(citation).some((key) => !CITATION_KEYS.has(key))) return failure("proposal_bundle_invalid");
        if (!trim(citation.source_id) || !HASH.test(trim(citation.content_hash)) || !Array.isArray(citation.locators) || citation.locators.length === 0 || citation.locators.some((locator) => !trim(locator))) return failure("proposal_bundle_invalid");
        if (!["explicit", "inferred", "low"].includes(trim(citation.confidence))) return failure("proposal_bundle_invalid");
        if (sources.size > 0) {
          const selected = sources.get(trim(citation.source_id));
          const expectedLocator = trim(selected && (selected.locator || (Array.isArray(selected.locators) && selected.locators[0])));
          if (!selected || citation.content_hash !== trim(selected.content_hash) || citation.locators.length !== 1 || citation.locators[0] !== expectedLocator) return failure("proposal_bundle_invalid");
        }
      }
    }
    if (hasKey(bundle, "write_intent")) return failure("write_intent_forbidden");
    return { ok: true, value: bundle };
  }

  function validateResponse(response, validateProposalBundle, outboundPayload) {
    if (!plain(response)) return failure("response_malformed");
    const unknown = Object.keys(response).filter((key) => !RESPONSE_KEYS.has(key));
    if (unknown.length) return failure("response_unknown_field");
    if (response.status !== "ok" || !plain(response.proposal_bundle)) return failure("response_invalid");
    if (response.response_metadata !== undefined) {
      if (!plain(response.response_metadata)) return failure("response_metadata_invalid");
      for (const [key, value] of Object.entries(response.response_metadata)) {
        if (!METADATA_KEYS.has(key) || !["string", "number"].includes(typeof value)) return failure("response_metadata_invalid");
      }
    }
    const shape = validateProposalBundleShape(response.proposal_bundle, outboundPayload);
    if (!shape.ok) return shape;
    if (typeof validateProposalBundle === "function") {
      let result;
      try { result = validateProposalBundle(response.proposal_bundle, outboundPayload); } catch (_error) { return failure("proposal_bundle_invalid"); }
      if (!result || result.ok !== true) return failure("proposal_bundle_invalid");
    }
    const payload = { status: "ok", proposal_bundle: response.proposal_bundle };
    if (response.response_metadata !== undefined) payload.response_metadata = response.response_metadata;
    return success({ payload, response_metadata: response.response_metadata || {} });
  }

  function providerFailure(error, profile) {
    const value = error && typeof error === "object" ? error : {};
    const status = Number(value.status || 0);
    const code = value.name === "AbortError" ? "provider_aborted" : status === 429 ? "provider_rate_limited" : (value.code === "ETIMEDOUT" || /timeout|timed out/i.test(String(value.message || ""))) ? "provider_timeout" : "provider_unavailable";
    const mapped = recoveryFor({ code, status, name: value.name });
    return failure(mapped.code, mapped.copy, { provider_key: profile && profile.provider_key, provider_mode: profile && profile.provider_mode });
  }

  async function requestProposal(options) {
    const request = options || {};
    if (!validResponseSchema(request.schema)) return failure("response_schema_required", "LLMWiki 응답 형식 검증을 준비하지 못했습니다.");
    const normalized = request.normalized || request.normalizedRequest;
    const profile = resolveProfile(null, normalized);
    if (!profile.ok) return profile;
    const consent = safeConsentHashes(request.consent);
    if (!consent.ok) return consent;
    if (request.signal && request.signal.aborted) return failure("provider_aborted");
    const runtime = request.consumerRuntime || root.ProdigyAIConsumerRuntime;
    if (!runtime || typeof runtime.requestStructured !== "function") return failure("transport_unavailable");
    let response;
    let runtimeReceipt = null;
    try {
      const runtimeResponse = await runtime.requestStructured({
        app: request.app,
        client: request.client,
        consumerId: request.consumer_id || "wiki.batch_analysis",
        prompt: JSON.stringify(profile.outbound_payload),
        schema: request.schema,
        signal: request.signal,
        confirmConsent: request.confirmConsent,
        ownerSessionId: request.ownerSessionId,
        operationId: request.operationId,
        attemptId: request.attemptId
      });
      response = runtimeResponse.payload;
      runtimeReceipt = runtimeResponse.receipt;
    } catch (error) {
      return providerFailure(error, profile);
    }
    let normalizedResponse;
    try { normalizedResponse = validateResponse(response, request.validateProposalBundle, profile.outbound_payload); } catch (_error) { return failure("response_invalid"); }
    if (!normalizedResponse.ok) return normalizedResponse;
    return success({ feature: profile.feature, provider_mode: profile.provider_mode, provider_key: runtimeReceipt && runtimeReceipt.provider_key || "", payload: normalizedResponse.payload, response_metadata: normalizedResponse.response_metadata, runtime_receipt: runtimeReceipt });
  }

  const api = Object.freeze({ resolveProfile, validateProposalBundleShape, validateResponse, requestProposal });
  root.LLMWikiAIProviderTransport = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
