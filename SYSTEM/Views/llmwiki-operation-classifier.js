(function (root) {
  "use strict";

  const operationApi = root.LLMWikiOperationContract || (typeof require === "function" ? require("./llmwiki-operation-contract.js") : null);
  const providerSchemaApi = root.LLMWikiProviderResponseSchema || (typeof require === "function" ? require("./llmwiki-provider-response-schema.js") : null);
  const knowledgeKindApi = root.LLMWikiKnowledgeKindContract || (typeof require === "function" ? require("./llmwiki-knowledge-kind-contract.js") : null);

  const CLASSIFIER_VERSION = "llmwiki_operation_classifier_v1";
  const DEFAULT_CONFIDENCE_THRESHOLD = 0.8;
  const PROVIDER_RESPONSE_FIELDS = new Set(["status", "serialized_operation", "canonical_proposal", "provider_confidence", "response_metadata"]);
  const RESPONSE_METADATA_FIELDS = new Set(["response_id", "request_id", "provider_status", "latency_ms"]);
  const HASH = /^[0-9a-f]{64}$/u;

  function plain(value) {
    if (!value || typeof value !== "object" || Array.isArray(value)) return false;
    const prototype = Reflect.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
  }
  function trim(value) { return typeof value === "string" ? value.trim() : ""; }
  function freeze(value) {
    if (operationApi?.isOperationRecord?.(value)) return value;
    if (Array.isArray(value)) return Object.freeze(value.map(freeze));
    if (!plain(value)) return value;
    return Object.freeze(Object.fromEntries(Object.entries(value).map(([key, item]) => [key, freeze(item)])));
  }
  function ok(value) { return freeze({ ok: true, value }); }
  function fail(field, reason) { return freeze({ ok: false, field, reason, writer_count: 0, write_packet_count: 0 }); }

  function snapshotRecord(value, field) {
    if (!value || typeof value !== "object" || Array.isArray(value)) return fail(field, `malformed_${field}`);
    try {
      const prototype = Reflect.getPrototypeOf(value);
      if (prototype !== Object.prototype && prototype !== null) return fail(field, `malformed_${field}`);
      const result = Object.create(null);
      for (const key of Reflect.ownKeys(value)) {
        if (typeof key !== "string") return fail(field, `uninspectable_${field}`);
        const descriptor = Reflect.getOwnPropertyDescriptor(value, key);
        if (!descriptor || Object.hasOwn(descriptor, "get") || Object.hasOwn(descriptor, "set")) return fail(field, `uninspectable_${field}`);
        Object.defineProperty(result, key, { value: descriptor.value, enumerable: true, writable: true, configurable: true });
      }
      return result;
    } catch (_error) {
      return fail(field, `uninspectable_${field}`);
    }
  }

  function normalizeProviderResponse(input) {
    const decoded = providerSchemaApi?.parseTypedOperationResponse?.(input);
    if (!decoded) return fail("provider_response", "provider_response_schema_unavailable");
    if (decoded.ok !== true) return fail(decoded.field || "provider_response", decoded.reason || "malformed_provider_response");
    const response = decoded.value;
    if (!Object.hasOwn(response, "status")) return fail("provider_response", "malformed_provider_response");
    for (const key of Object.keys(response)) if (!PROVIDER_RESPONSE_FIELDS.has(key)) return fail(`provider_response.${key}`, "unknown_provider_response_field");
    if (!Object.hasOwn(response, "serialized_operation")) return fail("provider_response", "malformed_provider_response");
    if (response.status !== "ok") return fail("provider_response.status", "invalid_provider_response_status");
    if (typeof response.serialized_operation !== "string") return fail("provider_response.serialized_operation", "serialized_operation_required");
    if (!Object.hasOwn(response, "canonical_proposal")) return fail("canonical_proposal", "canonical_proposal_required");
    let metadata = {};
    if (response.response_metadata !== undefined) {
      metadata = snapshotRecord(response.response_metadata, "response_metadata");
      if (metadata.ok === false) return metadata;
      for (const [key, value] of Object.entries(metadata)) {
        if (!RESPONSE_METADATA_FIELDS.has(key)) return fail(`response_metadata.${key}`, "unknown_response_metadata_field");
        if (!["string", "number", "boolean"].includes(typeof value)) return fail(`response_metadata.${key}`, "invalid_response_metadata");
      }
    }
    return ok({
      serialized_operation: response.serialized_operation,
      canonical_proposal: response.canonical_proposal,
      provider_confidence_present: Object.hasOwn(response, "provider_confidence"),
      provider_confidence: response.provider_confidence,
      response_metadata: metadata,
    });
  }

  function providerConfidenceCheck(response, context) {
    const threshold = context.confidence_threshold === undefined ? DEFAULT_CONFIDENCE_THRESHOLD : context.confidence_threshold;
    if (typeof threshold !== "number" || !Number.isFinite(threshold) || threshold < 0 || threshold > 1) {
      return { passed: false, reason: "invalid_confidence_threshold", confidence: null, threshold: DEFAULT_CONFIDENCE_THRESHOLD };
    }
    if (response.provider_confidence_present !== true) {
      return { passed: false, reason: "missing_provider_confidence", confidence: null, threshold };
    }
    const confidence = response.provider_confidence;
    if (typeof confidence !== "number" || !Number.isFinite(confidence) || confidence < 0 || confidence > 1) {
      return { passed: false, reason: "invalid_provider_confidence", confidence: null, threshold };
    }
    if (confidence < threshold) return { passed: false, reason: "provider_confidence_below_threshold", confidence, threshold };
    return { passed: true, reason: "provider_confidence_accepted", confidence, threshold };
  }

  function selectedSourceMap(value) {
    if (!Array.isArray(value)) return null;
    const result = new Map();
    for (const item of value) {
      if (!plain(item)) return null;
      const sourceId = trim(item.source_id);
      const hash = trim(item.content_hash);
      const locator = trim(item.locator || (Array.isArray(item.locators) ? item.locators[0] : ""));
      if (!sourceId || !HASH.test(hash) || !locator || result.has(sourceId)) return null;
      result.set(sourceId, { content_hash: hash, locator });
    }
    return result;
  }

  function citationCheck(operation, context) {
    if (context.selected_sources === undefined) return { passed: true, reason: "selected_sources_not_supplied" };
    const selected = selectedSourceMap(context.selected_sources);
    if (!selected) return { passed: false, reason: "invalid_selected_sources" };
    for (const citation of operation.source_citations) {
      const source = selected.get(citation.source_id);
      if (!source || source.content_hash !== citation.content_hash || citation.locators.length !== 1 || citation.locators[0] !== source.locator) {
        return { passed: false, reason: "citation_not_selected_or_current" };
      }
    }
    return { passed: true, reason: "citations_current" };
  }

  function identityCheck(operation, context) {
    if (context.canonical_candidates === undefined) return { passed: true, reason: "identity_bound_by_operation" };
    if (!Array.isArray(context.canonical_candidates)) return { passed: false, reason: "invalid_canonical_candidates" };
    const candidates = new Map(context.canonical_candidates.filter(plain).map((item) => [trim(item.destination_id || item.document_id || item.path), item]));
    for (const destinationId of operation.destination_ids) {
      if (operation.kind === "create") {
        if (candidates.has(destinationId)) return { passed: false, reason: "create_identity_collision" };
        continue;
      }
      const candidate = candidates.get(destinationId);
      if (!candidate || trim(candidate.revision || candidate.current_revision) !== operation.base_revisions[destinationId]) {
        return { passed: false, reason: "exact_identity_not_found" };
      }
    }
    return { passed: true, reason: "exact_identity_current" };
  }

  function evidenceCheck(context) {
    if (context.evidence === undefined) return { passed: true, reason: "evidence_contract_not_supplied" };
    if (!plain(context.evidence)) return { passed: false, reason: "malformed_evidence_result" };
    if (context.evidence.stale === true) return { passed: false, reason: "stale_evidence" };
    if (context.evidence.approval_eligible !== true) return { passed: false, reason: "evidence_ineligible" };
    return { passed: true, reason: "evidence_eligible" };
  }

  function inferredKind(operation, context) {
    const currentBytes = plain(context.current_canonical_bytes) ? context.current_canonical_bytes : {};
    if (operation.destination_ids.every((id) => Object.hasOwn(currentBytes, id) && currentBytes[id] === operation.after_bytes[id])) return "noop";
    if (operation.kind === "merge" && operation.source_ids.length >= 2) return "merge";
    const revisions = plain(context.current_canonical_revisions) ? context.current_canonical_revisions : {};
    const destinationExists = operation.destination_ids.some((id) => Object.hasOwn(revisions, id));
    if (operation.kind === "create") return destinationExists ? "noop" : "create";
    if (operation.kind === "noop") return "noop";
    return operation.destination_ids.length === 1 ? "update" : operation.kind;
  }

  function checkerResult(operation, context) {
    let kind = inferredKind(operation, context);
    let reason = "deterministic_structure_match";
    if (typeof context.checker === "function") {
      try {
        const checked = context.checker(operation, freeze({
          current_canonical_revisions: context.current_canonical_revisions || {},
          canonical_candidates: context.canonical_candidates || [],
        }));
        if (!plain(checked) || !operationApi.OPERATION_KINDS.includes(trim(checked.kind))) return { kind: "", reason: "invalid_checker_result" };
        kind = trim(checked.kind);
        reason = trim(checked.reason) || "independent_checker_result";
      } catch (_error) {
        return { kind: "", reason: "checker_failed" };
      }
    }
    if (context.expected_operation !== undefined && operationApi.OPERATION_KINDS.includes(trim(context.expected_operation))) {
      return { kind: trim(context.expected_operation), reason: "trusted_expected_operation" };
    }
    return { kind, reason };
  }

  function classifyProviderOperation(responseInput, contextInput = {}) {
    const response = normalizeProviderResponse(responseInput);
    if (response.ok === false) return response;
    if (!knowledgeKindApi || typeof knowledgeKindApi.parseProposal !== "function" || typeof knowledgeKindApi.serializeProposal !== "function") {
      return fail("canonical_proposal", "knowledge_kind_contract_unavailable");
    }
    const proposal = knowledgeKindApi.parseProposal(response.value.canonical_proposal);
    if (!proposal || proposal.ok !== true) {
      const field = trim(proposal && proposal.field);
      return fail(field ? `canonical_proposal.${field}` : "canonical_proposal", trim(proposal && proposal.reason) || "invalid_canonical_proposal");
    }
    let proposalBytes;
    try { proposalBytes = knowledgeKindApi.serializeProposal(proposal); }
    catch (_error) { return fail("canonical_proposal", "canonical_proposal_serialization_failed"); }
    const context = plain(contextInput) ? contextInput : {};
    const responseId = trim(response.value.response_metadata.response_id);
    if (responseId && Array.isArray(context.seen_response_ids) && context.seen_response_ids.map(trim).includes(responseId)) {
      return fail("response_metadata.response_id", "provider_response_replay");
    }
    const parsed = operationApi?.parseOperation?.(response.value.serialized_operation);
    if (!parsed || parsed.ok !== true) return parsed ? freeze({ ...parsed, writer_count: 0, write_packet_count: 0 }) : fail("serialized_operation", "operation_contract_unavailable");
    const operation = parsed.value;
    if (operation.destination_ids.length !== 1) return fail("serialized_operation.destination_ids", "canonical_proposal_destination_ambiguous");
    const canonicalDestination = operation.destination_ids[0];
    if (operation.after_bytes[canonicalDestination] !== proposalBytes) {
      return fail(`serialized_operation.after_bytes.${canonicalDestination}`, "canonical_proposal_destination_bytes_mismatch");
    }
    const revision = operationApi.evaluateApprovalEligibility(operation, context.current_canonical_revisions);
    if (!revision || revision.ok !== true) return revision ? freeze({ ...revision, writer_count: 0, write_packet_count: 0 }) : fail("current_canonical_revisions", "revision_check_unavailable");
    const citations = citationCheck(operation, context);
    const identity = identityCheck(operation, context);
    const evidence = evidenceCheck(context);
    const checker = checkerResult(operation, context);
    const providerConfidence = providerConfidenceCheck(response.value, context);
    const lowCitationConfidence = operation.source_citations.some((item) => item.confidence === "low");
    const unresolvedConflict = operation.conflicts.some((item) => item.status === "unresolved" || item.status === "disputed");
    const checkerAgrees = checker.kind === operation.kind;
    const checks = [
      { check: "operation_contract", passed: true, reason: "serialized_operation_branded" },
      { check: "duplicate_noop_identity_merge", passed: checkerAgrees, reason: checker.reason, expected_kind: checker.kind || null, provider_kind: operation.kind },
      { check: "identity", ...identity },
      { check: "citations", ...citations },
      { check: "evidence", ...evidence },
      { check: "current_revisions", passed: revision.value.fresh === true, reason: revision.value.reason },
      { check: "conflicts", passed: !unresolvedConflict, reason: unresolvedConflict ? "unresolved_or_disputed_conflict" : "no_unresolved_conflict" },
      { check: "provider_confidence", ...providerConfidence },
      { check: "citation_confidence", passed: !lowCitationConfidence, reason: lowCitationConfidence ? "low_citation_confidence" : "citation_confidence_accepted" },
    ];
    const conflictReview = checks.some((item) => item.passed === false);
    const status = conflictReview ? "conflict_review" : operation.kind === "noop" ? "no_change" : "proposal_ready";
    return ok({
      classifier_version: CLASSIFIER_VERSION,
      status,
      operation_kind: operation.kind,
      deterministic_kind: checker.kind || null,
      operation,
      checks,
      conflict_reasons: checks.filter((item) => item.passed === false).map((item) => item.reason),
      approval_eligible: false,
      write_packet: null,
      write_packet_count: 0,
      writer_count: 0,
      provider_response_id: responseId || null,
      canonical_destination: canonicalDestination,
    });
  }

  function classifyOperation(input, context = {}) {
    if (operationApi?.isOperationRecord?.(input)) {
      const envelope = { status: "ok", serialized_operation: JSON.stringify(input), canonical_proposal: context.canonical_proposal };
      if (Object.hasOwn(context, "provider_confidence")) envelope.provider_confidence = context.provider_confidence;
      const classified = classifyProviderOperation(JSON.stringify(envelope), context);
      return classified.ok === true ? ok({ ...classified.value, operation: input }) : classified;
    }
    if (typeof input === "string") {
      const envelope = { status: "ok", serialized_operation: input, canonical_proposal: context.canonical_proposal };
      if (Object.hasOwn(context, "provider_confidence")) envelope.provider_confidence = context.provider_confidence;
      return classifyProviderOperation(JSON.stringify(envelope), context);
    }
    return classifyProviderOperation(input, context);
  }

  const api = freeze({ CLASSIFIER_VERSION, DEFAULT_CONFIDENCE_THRESHOLD, classifyProviderOperation, classifyOperation, parseProviderResponse: normalizeProviderResponse });
  root.LLMWikiOperationClassifier = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
