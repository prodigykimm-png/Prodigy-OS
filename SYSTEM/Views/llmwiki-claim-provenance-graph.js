(function (root) {
  "use strict";

  const core = root.LLMWikiClaimProvenanceCore || (typeof require === "function" ? require("./llmwiki-claim-provenance-core.js") : null);
  const { CONTRACT_VERSION, ID, HASH, ORIGINS, STATUSES, SOURCE_KINDS, plain, trim, stable, sha256, ok, fail, timestamp, validUrl, normalizeHumanJustification, hasCitedAncestry, claimPayload, claimSetSemantic } = core;

  function sortedUniqueIds(value) {
    return Array.isArray(value) && value.length === new Set(value).size && value.every((id) => ID.test(trim(id)))
      && value.every((id, index) => index === 0 || value[index - 1].localeCompare(id, "en") < 0);
  }
  function same(value, expected) { return stable(value) === stable(expected); }
  function validPublicSource(source) {
    if (!plain(source) || !ID.test(trim(source.source_id)) || !HASH.test(trim(source.source_revision)) || !HASH.test(trim(source.extractor_revision))
      || !HASH.test(trim(source.source_content_hash)) || !Number.isSafeInteger(source.source_length) || source.source_length < 0
      || !plain(source.provider_window) || !Number.isSafeInteger(source.provider_window.start) || !Number.isSafeInteger(source.provider_window.end)
      || source.provider_window.start < 0 || source.provider_window.end <= source.provider_window.start || source.provider_window.end > source.source_length
      || !SOURCE_KINDS.has(trim(source.source_kind))) return false;
    return trim(source.source_kind) !== "external_ingested_snapshot" || (Boolean(timestamp(source.ingested_at)) && Boolean(validUrl(source.source_url)));
  }
  function validCitation(citation, sources) {
    if (!plain(citation) || !ID.test(trim(citation.citation_id)) || !ID.test(trim(citation.source_id)) || !HASH.test(trim(citation.source_revision))
      || !HASH.test(trim(citation.extractor_revision)) || !HASH.test(trim(citation.source_content_hash)) || !HASH.test(trim(citation.span_digest))
      || !plain(citation.source_span) || !Number.isSafeInteger(citation.source_span.start) || !Number.isSafeInteger(citation.source_span.end)) return false;
    const source = sources.get(trim(citation.source_id));
    if (!source || citation.source_span.start < 0 || citation.source_span.end <= citation.source_span.start || citation.source_span.end > source.source_length
      || citation.source_revision !== source.source_revision || citation.extractor_revision !== source.extractor_revision || citation.source_content_hash !== source.source_content_hash) return false;
    const payload = { source_id: citation.source_id, source_revision: citation.source_revision, extractor_revision: citation.extractor_revision, source_content_hash: citation.source_content_hash, source_span: citation.source_span, span_digest: citation.span_digest };
    return citation.citation_id === `citation_${sha256(stable(payload)).slice(0, 24)}`;
  }
  function validClaimVariant(claim, boundCitations, sources) {
    switch (claim.origin) {
      case "source_extract": return claim.citation_ids.length > 0 && claim.derived_from_claim_ids.length === 0 && claim.human_justification === null && claim.dispute_target_claim_id === null;
      case "ai_research": return claim.citation_ids.length > 0 && claim.derived_from_claim_ids.length === 0 && claim.human_justification === null && claim.dispute_target_claim_id === null && boundCitations.every((citation) => sources.get(citation.source_id).source_kind === "external_ingested_snapshot");
      case "human_authored": { const human = claim.human_justification === null ? null : normalizeHumanJustification(claim.human_justification, "claim_set.claims.human_justification"); return claim.citation_ids.length === 0 && claim.derived_from_claim_ids.length === 0 && Boolean(human && human.ok) && claim.dispute_target_claim_id === null; }
      case "ai_interpretation": return claim.citation_ids.length === 0 && claim.derived_from_claim_ids.length > 0 && claim.human_justification === null && claim.dispute_target_claim_id === null;
      case "ai_correction": return claim.citation_ids.length === 0 && claim.derived_from_claim_ids.length > 0 && claim.human_justification === null && ID.test(trim(claim.dispute_target_claim_id));
      default: return false;
    }
  }
  function validateClaimSet(value) {
    if (!plain(value) || trim(value.contract_version) !== CONTRACT_VERSION || !HASH.test(trim(value.claim_set_hash)) || !Array.isArray(value.claims)
      || !Array.isArray(value.citations) || !Array.isArray(value.sources) || !Array.isArray(value.disputes) || !STATUSES.has(trim(value.status))) return fail("claim_set", "invalid_claim_set");
    if (sha256(stable(claimSetSemantic(value))) !== value.claim_set_hash) return fail("claim_set", "claim_set_hash_mismatch");
    const sources = new Map();
    for (const source of value.sources) {
      if (!validPublicSource(source) || sources.has(source.source_id)) return fail("claim_set.sources", "invalid_claim_set_graph");
      sources.set(source.source_id, source);
    }
    const citations = new Map();
    for (const citation of value.citations) {
      if (!validCitation(citation, sources) || citations.has(citation.citation_id)) return fail("claim_set.citations", "invalid_claim_set_graph");
      citations.set(citation.citation_id, citation);
    }
    const claims = new Map();
    for (const claim of value.claims) {
      if (!plain(claim) || !ID.test(trim(claim.claim_id)) || !ORIGINS.has(trim(claim.origin)) || !trim(claim.text)
        || !STATUSES.has(trim(claim.status)) || !sortedUniqueIds(claim.citation_ids) || !sortedUniqueIds(claim.derived_from_claim_ids)
        || claims.has(claim.claim_id)) return fail("claim_set.claims", "invalid_claim_set_graph");
      const boundCitations = claim.citation_ids.map((id) => citations.get(id));
      if (boundCitations.some((citation) => !citation) || !Array.isArray(claim.citations) || !same(claim.citations, boundCitations) || !validClaimVariant(claim, boundCitations, sources)) return fail("claim_set.claims", "invalid_claim_set_graph");
      claims.set(claim.claim_id, claim);
    }
    for (const claim of claims.values()) {
      if (claim.derived_from_claim_ids.some((id) => !claims.has(id) || !["source_extract", "human_authored", "ai_interpretation", "ai_research"].includes(claims.get(id).origin))) return fail("claim_set.claims", "invalid_derivation_reference");
    }
    const visiting = new Set();
    const visited = new Set();
    function visit(claimId) {
      if (visiting.has(claimId)) return true;
      if (visited.has(claimId)) return false;
      visiting.add(claimId);
      const cyclic = claims.get(claimId).derived_from_claim_ids.some(visit);
      visiting.delete(claimId);
      visited.add(claimId);
      return cyclic;
    }
    if ([...claims.keys()].some(visit)) return fail("claim_set.claims", "cyclic_derivation_graph");
    if ([...claims.values()].some((claim) => claim.claim_id !== `claim_${sha256(stable(claimPayload(claim))).slice(0, 24)}`)) return fail("claim_set.claims", "invalid_claim_set_graph");
    if ([...claims.values()].some((claim) => claim.origin === "ai_interpretation" && !hasCitedAncestry(claim.derived_from_claim_ids, [...claims.values()], citations))) return fail("claim_set.claims", "cited_derivation_ancestry_required");
    const disputes = new Map();
    for (const dispute of value.disputes) {
      if (!plain(dispute) || !ID.test(trim(dispute.dispute_id)) || !ID.test(trim(dispute.target_claim_id)) || !ID.test(trim(dispute.correction_claim_id)) || !STATUSES.has(trim(dispute.status))
        || dispute.dispute_id !== `dispute_${sha256(stable({ target_claim_id: dispute.target_claim_id, correction_claim_id: dispute.correction_claim_id })).slice(0, 24)}` || disputes.has(dispute.dispute_id)) return fail("claim_set.disputes", "invalid_claim_set_graph");
      const correction = claims.get(dispute.correction_claim_id);
      if (!correction || correction.origin !== "ai_correction" || correction.dispute_target_claim_id !== dispute.target_claim_id || correction.status !== dispute.status) return fail("claim_set.disputes", "invalid_claim_set_graph");
      disputes.set(dispute.dispute_id, dispute);
    }
    if ([...claims.values()].filter((claim) => claim.origin === "ai_correction").some((claim) => ![...disputes.values()].some((dispute) => dispute.correction_claim_id === claim.claim_id))) return fail("claim_set.disputes", "invalid_claim_set_graph");
    return ok(value);
  }

  const api = Object.freeze({ validateClaimSet });
  root.LLMWikiClaimProvenanceGraph = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
