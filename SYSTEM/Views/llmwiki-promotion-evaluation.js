(function (root) {
  "use strict";

  const normalization = root.LLMWikiPromotionNormalizationInternal
    || (typeof require === "function" ? require("./llmwiki-promotion-normalization.js") : null);
  if (!normalization) throw new Error("llmwiki_promotion_normalization_unavailable");
  const { plain, text, list, freeze, normalizePromotionInput, stable, parseEvidence, normalizedClaims } = normalization;

  function createPromotionEvaluator(config) {
    const { contractVersion, knowledgeKinds, gateDefinitions } = config;

    function gate(definition, state, reasonCodes, evidenceRefs) {
      return freeze({
        gate_id: definition.gate_id,
        phase: definition.phase,
        state,
        reason_codes: [...(reasonCodes || [])],
        evidence_refs: [...(evidenceRefs || [])]
      });
    }

    function notApplicable(definition) {
      return gate(definition, "not_applicable", [], []);
    }

    function evidenceById(parsed) {
      return new Map(parsed.entries.map((item) => [item.evidence_id, item]));
    }

    function evidenceGate(definition, parsed) {
      if (!parsed.ok) return gate(definition, "fail", [parsed.reason_code], parsed.evidence_refs);
      const refs = parsed.evidence_refs;
      if (refs.length === 0) return gate(definition, "fail", ["missing_evidence_refs"], []);
      const index = evidenceById(parsed);
      const thin = refs.filter((id) => index.get(id).strength === "thin");
      if (thin.length) return gate(definition, "fail", ["thin_evidence"], thin);
      const missingStrength = refs.filter((id) => !["sufficient", "strong"].includes(index.get(id).strength));
      if (missingStrength.length) return gate(definition, "fail", ["evidence_strength_required"], missingStrength);
      return gate(definition, "pass", [], refs);
    }

    function claimSupportGate(definition, claims, parsedEvidence) {
      if (!parsedEvidence.ok) return gate(definition, "fail", ["invalid_evidence_identity"], parsedEvidence.evidence_refs);
      const index = evidenceById(parsedEvidence);
      if (!claims.length || claims.some((claim) => !claim.claim_id || !claim.statement || !claim.evidence_refs.length
        || claim.evidence_refs.some((ref) => !index.has(ref)))) {
        return gate(definition, "fail", ["unsupported_claim"], []);
      }
      return gate(definition, "pass", [], [...new Set(claims.flatMap((claim) => claim.evidence_refs))]);
    }

    function aiClaimReviewGate(definition, claims) {
      const aiClaims = claims.filter((claim) => claim.origin.startsWith("ai_"));
      const rejected = aiClaims.filter((claim) => claim.review_status === "rejected");
      if (rejected.length) return gate(definition, "fail", ["rejected_ai_claim"], rejected.map((claim) => claim.claim_id));
      const pending = aiClaims.filter((claim) => claim.review_status !== "accepted");
      if (pending.length) return gate(definition, "fail", ["unreviewed_ai_claim"], pending.map((claim) => claim.claim_id));
      return gate(definition, "pass", [], aiClaims.map((claim) => claim.claim_id));
    }

    function hasTextList(value) {
      return list(value).some((item) => text(item));
    }

    function unitScopeGate(definition, unit) {
      if (text(unit.state) === "stale") return gate(definition, "fail", ["stale_state"], []);
      if (unit.classification === "epistemic") return gate(definition, "pass", [], []);
      if (unit.classification === "operational") return gate(definition, "fail", ["operational_unit"], []);
      if (unit.classification === "mixed") return gate(definition, "fail", ["mixed_unit"], []);
      return gate(definition, "fail", ["epistemic_unit_required"], []);
    }

    function relationGate(definition, unit) {
      const status = text(unit.relation_status);
      if (status === "resolved") return gate(definition, "pass", [], []);
      if (status === "duplicate") return gate(definition, "fail", ["unresolved_duplicate"], []);
      if (status === "conflict") return gate(definition, "fail", ["unresolved_conflict"], []);
      return gate(definition, "pending", ["unresolved_relation"], []);
    }

    function authorizationGate(definition, unit) {
      const status = text(unit.approval_status || "pending");
      if (status === "approved") return gate(definition, "pass", [], []);
      if (status === "rejected") return gate(definition, "fail", ["approval_rejected"], []);
      if (!status || status === "pending") return gate(definition, "pending", ["approval_required"], []);
      return gate(definition, "fail", ["invalid_approval_state"], []);
    }

    function kindGate(definition, unit) {
      switch (definition.gate_id) {
        case "claim_scope":
          return text(unit.claim_scope) ? gate(definition, "pass", [], []) : gate(definition, "fail", ["claim_scope_required"], []);
        case "principle_boundaries": {
          const boundaries = plain(unit.principle_boundaries) ? unit.principle_boundaries : {};
          const complete = hasTextList(boundaries.conditions) && hasTextList(boundaries.exclusions) && hasTextList(boundaries.invalidation_conditions);
          return complete ? gate(definition, "pass", [], []) : gate(definition, "fail", ["principle_boundaries_required"], []);
        }
        case "principle_rationale":
          return text(unit.principle_rationale) ? gate(definition, "pass", [], []) : gate(definition, "fail", ["principle_rationale_required"], []);
        case "procedure_preconditions":
          return hasTextList(unit.procedure_preconditions) ? gate(definition, "pass", [], []) : gate(definition, "fail", ["procedure_preconditions_required"], []);
        case "procedure_steps":
          return hasTextList(unit.procedure_steps) ? gate(definition, "pass", [], []) : gate(definition, "fail", ["procedure_steps_required"], []);
        case "procedure_outcome":
          return text(unit.procedure_outcome) ? gate(definition, "pass", [], []) : gate(definition, "fail", ["procedure_outcome_required"], []);
        case "concept_definition":
          return text(unit.concept_definition) ? gate(definition, "pass", [], []) : gate(definition, "fail", ["concept_definition_required"], []);
        case "concept_boundaries":
          return hasTextList(unit.concept_boundaries) ? gate(definition, "pass", [], []) : gate(definition, "fail", ["concept_boundaries_required"], []);
        default:
          return gate(definition, "fail", ["unknown_gate"], []);
      }
    }

    function gaps(gates) {
      return freeze(gates.flatMap((item) => item.state === "pass" || item.state === "not_applicable" ? []
        : item.reason_codes.map((reasonCode) => ({
          gate_id: item.gate_id,
          phase: item.phase,
          state: item.state,
          reason_code: reasonCode,
          evidence_refs: item.evidence_refs
        }))));
    }

    function receipt(kind, gates, inputBinding) {
      const promotionGaps = gaps(gates);
      const blockingContentGaps = freeze(promotionGaps.filter((item) => item.phase === "content" || item.phase === "relation"));
      const scope = gates.find((item) => item.gate_id === "unit_scope");
      const authorization = gates.find((item) => item.gate_id === "authorization");
      const terminal = authorization.reason_codes.includes("approval_rejected");
      const invalidAuthorization = authorization.reason_codes.includes("invalid_approval_state");
      const candidateEligible = scope.state === "pass" && blockingContentGaps.length > 0 && !terminal;
      const canonicalReviewEligible = scope.state === "pass" && blockingContentGaps.length === 0 && !terminal && !invalidAuthorization;
      const canonicalWriteEligible = canonicalReviewEligible && gates.every((item) => item.state === "pass" || item.state === "not_applicable");
      const disposition = terminal ? "rejected" : candidateEligible ? "candidate" : canonicalReviewEligible ? "canonical_review" : "blocked";
      return freeze({
        contract_version: contractVersion,
        input_binding: inputBinding,
        knowledge_kind: kind,
        trust_status: "unverified",
        disposition,
        terminal,
        candidate_eligible: candidateEligible,
        canonical_review_eligible: canonicalReviewEligible,
        canonical_write_eligible: canonicalWriteEligible,
        gates,
        promotion_gaps: promotionGaps,
        blocking_content_gaps: blockingContentGaps
      });
    }

    function malformedReceipt() {
      const malformedGate = gate({ gate_id: "input_shape", phase: "eligibility" }, "fail", ["malformed_input"], []);
      return freeze({
        contract_version: contractVersion,
        input_binding: "",
        knowledge_kind: "",
        trust_status: "unverified",
        disposition: "blocked",
        terminal: false,
        candidate_eligible: false,
        canonical_review_eligible: false,
        canonical_write_eligible: false,
        gates: [malformedGate],
        promotion_gaps: gaps([malformedGate]),
        blocking_content_gaps: []
      });
    }

    function evaluatePromotion(value) {
      let unit;
      try { unit = normalizePromotionInput(value); }
      catch (_error) { return malformedReceipt(); }
      if (!knowledgeKinds.includes(unit.knowledge_kind)) return malformedReceipt();
      const kind = unit.knowledge_kind;
      const parsedEvidence = parseEvidence(unit.evidence);
      const claims = normalizedClaims(unit);
      const gates = gateDefinitions.map((definition) => {
        if (definition.kinds && !definition.kinds.includes(kind)) return notApplicable(definition);
        switch (definition.gate_id) {
          case "unit_scope": return unitScopeGate(definition, unit);
          case "statement": return text(unit.title) && text(unit.statement)
            ? gate(definition, "pass", [], []) : gate(definition, "fail", ["statement_required"], []);
          case "evidence_refs": return evidenceGate(definition, parsedEvidence);
          case "claim_support": return claimSupportGate(definition, claims, parsedEvidence);
          case "ai_claim_review": return aiClaimReviewGate(definition, claims);
          case "relation_resolution": return relationGate(definition, unit);
          case "authorization": return authorizationGate(definition, unit);
          default: return kindGate(definition, unit);
        }
      });
      return receipt(kind, freeze(gates), stable(unit));
    }

    return Object.freeze({ evaluatePromotion });
  }

  const api = Object.freeze({ createPromotionEvaluator });
  root.LLMWikiPromotionEvaluationInternal = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
