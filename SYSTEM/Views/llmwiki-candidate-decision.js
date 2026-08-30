(function (root) {
  "use strict";

  const CONTRACT_VERSION = "llmwiki_candidate_decision_v1";
  const RELATIONS = Object.freeze(["new", "duplicate", "compatible_new", "contradiction"]);
  const PRIORITY = Object.freeze({ canonical_id: 0, title_exact: 1, registered_alias: 2, lexical: 3 });
  const LEXICAL_THRESHOLD = 0.75;
  const LEXICAL_MARGIN = 0.05;

  function plain(value) { return Boolean(value) && typeof value === "object" && !Array.isArray(value); }
  function freeze(value) {
    if (Array.isArray(value)) return Object.freeze(value.map(freeze));
    if (!plain(value)) return value;
    return Object.freeze(Object.fromEntries(Object.entries(value).map(([key, child]) => [key, freeze(child)])));
  }
  function result(action, extras = {}) { return freeze({ ok: true, contract_version: CONTRACT_VERSION, action, ...extras, writer_count: 0 }); }
  function invalid(reason) { return freeze({ ok: false, contract_version: CONTRACT_VERSION, action: "hold", reason, writer_count: 0 }); }
  function validCandidate(candidate) {
    return plain(candidate) && typeof candidate.candidate_id === "string" && candidate.candidate_id.length > 0
      && Object.hasOwn(PRIORITY, candidate.identity_match)
      && Number.isFinite(candidate.lexical_score) && candidate.lexical_score >= 0 && candidate.lexical_score <= 1;
  }

  function selectCandidate(candidates) {
    if (!candidates.length) return { status: "empty" };
    const ranked = [...candidates].sort((left, right) => PRIORITY[left.identity_match] - PRIORITY[right.identity_match]
      || right.lexical_score - left.lexical_score || left.candidate_id.localeCompare(right.candidate_id, "en"));
    const bestPriority = PRIORITY[ranked[0].identity_match];
    const samePriority = ranked.filter((candidate) => PRIORITY[candidate.identity_match] === bestPriority);
    if (bestPriority < PRIORITY.lexical) {
      if (samePriority.length > 1) return { status: "hold", reason: "candidate_identity_ambiguous" };
      return { status: "selected", candidate: ranked[0] };
    }
    if (ranked[0].lexical_score < LEXICAL_THRESHOLD) return { status: "hold", reason: "candidate_threshold_insufficient" };
    if (ranked[1] && ranked[0].lexical_score - ranked[1].lexical_score < LEXICAL_MARGIN) return { status: "hold", reason: "candidate_margin_insufficient" };
    return { status: "selected", candidate: ranked[0] };
  }

  function decide(input) {
    if (!plain(input) || typeof input.page_identity !== "string" || !input.page_identity || !RELATIONS.includes(input.content_relation)
      || !Array.isArray(input.candidates) || input.candidates.some((candidate) => !validCandidate(candidate))) return invalid("invalid_candidate_decision_input");
    if (input.source_only_authority === true) {
      if (input.candidates.length) return invalid("source_only_candidate_conflict");
      return result("source_only", { status: "no_operation", reason: "source_only_authorized" });
    }
    const selection = selectCandidate(input.candidates);
    if (selection.status === "hold") return result("hold", { status: "quality_held", reason: selection.reason });
    if (input.content_relation === "new") {
      if (selection.status === "selected") return result("hold", { status: "quality_held", reason: "new_relation_has_candidate", candidate_id: selection.candidate.candidate_id });
      return result("create", { status: "committable", candidate_id: null });
    }
    if (selection.status !== "selected") return result("hold", { status: "quality_held", reason: "candidate_required" });
    const candidateId = selection.candidate.candidate_id;
    if (input.content_relation === "duplicate") return result("no_change", { status: "no_operation", candidate_id: candidateId });
    if (input.content_relation === "compatible_new") return result("update", { status: "committable", candidate_id: candidateId });
    return result("contradiction", { status: "quality_held", candidate_id: candidateId, reason: "candidate_contradiction" });
  }

  const api = freeze({ CONTRACT_VERSION, RELATIONS, LEXICAL_THRESHOLD, LEXICAL_MARGIN, decide });
  root.LLMWikiCandidateDecision = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
