(function (root) {
  "use strict";

  const normalization = root.LLMWikiPromotionNormalizationInternal
    || (typeof require === "function" ? require("./llmwiki-promotion-normalization.js") : null);
  const evaluation = root.LLMWikiPromotionEvaluationInternal
    || (typeof require === "function" ? require("./llmwiki-promotion-evaluation.js") : null);
  if (!normalization || !evaluation) throw new Error("llmwiki_promotion_dependencies_unavailable");
  const { plain, text, freeze, parsePromotionData, normalizePromotionInput, stable, parseEvidence } = normalization;

  const CONTRACT_VERSION = "llmwiki_promotion_contract_v1";
  const PROMOTION_DECISIONS = new WeakSet();
  const CANONICAL_APPROVALS = new WeakSet();
  const HASH = /^[0-9a-f]{64}$/u;
  const ID = /^[a-z][a-z0-9_-]{2,127}$/u;
  const OPERATIONS = new Set(["create", "update", "merge", "noop"]);
  const KNOWLEDGE_KINDS = Object.freeze(["claim", "principle", "procedure", "concept"]);
  const GATE_STATES = Object.freeze(["pass", "fail", "pending", "not_applicable"]);
  const LIFECYCLE_LABELS = Object.freeze({
    candidate: "보완 필요 후보",
    canonical_review: "정본 검토 대기",
    blocked: "승격 차단",
    rejected: "반려됨",
    unverified: "검증 전"
  });
  const GATE_DEFINITIONS = Object.freeze([
    Object.freeze({ gate_id: "unit_scope", phase: "eligibility", kinds: null }),
    Object.freeze({ gate_id: "statement", phase: "content", kinds: null }),
    Object.freeze({ gate_id: "evidence_refs", phase: "content", kinds: null }),
    Object.freeze({ gate_id: "claim_support", phase: "content", kinds: null }),
    Object.freeze({ gate_id: "ai_claim_review", phase: "authorization", kinds: null }),
    Object.freeze({ gate_id: "relation_resolution", phase: "relation", kinds: null }),
    Object.freeze({ gate_id: "authorization", phase: "authorization", kinds: null }),
    Object.freeze({ gate_id: "claim_scope", phase: "content", kinds: ["claim"] }),
    Object.freeze({ gate_id: "principle_boundaries", phase: "content", kinds: ["principle"] }),
    Object.freeze({ gate_id: "principle_rationale", phase: "content", kinds: ["principle"] }),
    Object.freeze({ gate_id: "procedure_preconditions", phase: "content", kinds: ["procedure"] }),
    Object.freeze({ gate_id: "procedure_steps", phase: "content", kinds: ["procedure"] }),
    Object.freeze({ gate_id: "procedure_outcome", phase: "content", kinds: ["procedure"] }),
    Object.freeze({ gate_id: "concept_definition", phase: "content", kinds: ["concept"] }),
    Object.freeze({ gate_id: "concept_boundaries", phase: "content", kinds: ["concept"] })
  ]);
  const evaluator = evaluation.createPromotionEvaluator({
    contractVersion: CONTRACT_VERSION,
    knowledgeKinds: KNOWLEDGE_KINDS,
    gateDefinitions: GATE_DEFINITIONS
  });

  function evaluatePromotion(value) {
    const decision = evaluator.evaluatePromotion(value);
    PROMOTION_DECISIONS.add(decision);
    return decision;
  }

  function receiptError(reason) {
    const error = new Error(`invalid_promotion_receipt:${reason}`);
    error.code = "invalid_promotion_receipt";
    return error;
  }

  function receiptProjection(value) {
    return {
      contract_version: value.contract_version,
      input_binding: value.input_binding,
      knowledge_kind: value.knowledge_kind,
      trust_status: value.trust_status,
      disposition: value.disposition,
      terminal: value.terminal,
      candidate_eligible: value.candidate_eligible,
      canonical_review_eligible: value.canonical_review_eligible,
      canonical_write_eligible: value.canonical_write_eligible,
      gates: value.gates,
      promotion_gaps: value.promotion_gaps,
      blocking_content_gaps: value.blocking_content_gaps
    };
  }

  function validateCandidateReceipt(value, promotionInput) {
    let receipt;
    let normalizedInput;
    try {
      receipt = parsePromotionData(value);
      normalizedInput = normalizePromotionInput(promotionInput);
    } catch (_error) { throw receiptError("promotion_input"); }
    if (!plain(receipt) || receipt.contract_version !== CONTRACT_VERSION) throw receiptError("contract_version");
    const expected = evaluatePromotion(normalizedInput);
    if (expected.disposition !== "candidate") throw receiptError("candidate_disposition");
    if (stable(receiptProjection(receipt)) !== stable(receiptProjection(expected))) throw receiptError("receipt_mismatch");
    return freeze({
      contract_version: CONTRACT_VERSION,
      promotion_input: normalizedInput,
      promotion_input_binding: expected.input_binding,
      promotion_receipt: expected,
      promotion_gaps: expected.promotion_gaps,
      blocking_content_gaps: expected.blocking_content_gaps
    });
  }

  function createCanonicalApprovalPacket(value) {
    const hashApi = root.LLMWikiHash || (typeof require === "function" ? require("./llmwiki-hash.js") : null);
    const claimApi = root.LLMWikiClaimProvenance || (typeof require === "function" ? require("./llmwiki-claim-provenance.js") : null);
    let input;
    try { input = parsePromotionData(value); }
    catch (_error) { throw receiptError("canonical_review_input"); }
    if (!plain(input)) throw receiptError("canonical_review_input");
    const receiptDescriptor = Object.getOwnPropertyDescriptor(value, "promotion_receipt");
    const brandedReceipt = receiptDescriptor && Object.hasOwn(receiptDescriptor, "value") ? receiptDescriptor.value : null;
    if (!ID.test(text(input.review_id)) || !text(input.review_revision)
      || !OPERATIONS.has(text(input.operation)) || !HASH.test(text(input.source_revision))
      || typeof input.source_bytes !== "string" || !hashApi || hashApi.sha256(input.source_bytes) !== input.source_revision
      || !plain(input.claim_set) || !claimApi || typeof claimApi.validateClaimSet !== "function") {
      throw receiptError("canonical_review_input");
    }
    const claims = claimApi.validateClaimSet(input.claim_set);
    if (!claims || claims.ok !== true || input.claim_set.status !== "accepted"
      || input.claim_set.claims.some((claim) => !plain(claim) || claim.status !== "accepted")) {
      throw receiptError("accepted_claim_set_required");
    }
    const promotionInput = normalizePromotionInput(input.promotion_input);
    if (promotionInput.claim_set_hash !== input.claim_set.claim_set_hash) throw receiptError("claim_set_mismatch");
    if (!PROMOTION_DECISIONS.has(brandedReceipt)) throw receiptError("branded_decision_required");
    const expected = evaluatePromotion(promotionInput);
    if (!expected.canonical_write_eligible || stable(expected) !== stable(brandedReceipt)) throw receiptError("receipt_mismatch");
    const packet = freeze({
      packet_version: "llmwiki_canonical_review_approval_v1",
      review_id: text(input.review_id), review_revision: text(input.review_revision), operation: text(input.operation),
      source_revision: input.source_revision, source_bytes: input.source_bytes,
      claim_set_hash: input.claim_set.claim_set_hash, claim_set: input.claim_set,
      promotion_input: promotionInput, promotion_receipt_hash: hashApi.sha256(stable(expected)), promotion_receipt: expected
    });
    CANONICAL_APPROVALS.add(packet);
    return packet;
  }

  function isCanonicalApprovalPacket(value) { return Boolean(value && CANONICAL_APPROVALS.has(value)); }

  const api = freeze({
    CONTRACT_VERSION, KNOWLEDGE_KINDS, GATE_STATES, GATE_DEFINITIONS, LIFECYCLE_LABELS,
    normalizePromotionInput, parseEvidence, evaluatePromotion, validateCandidateReceipt,
    createCanonicalApprovalPacket, isCanonicalApprovalPacket
  });
  root.LLMWikiPromotionContract = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
