(function (root) {
  "use strict";

  const core = root.LLMWikiClaimProvenanceCore || (typeof require === "function" ? require("./llmwiki-claim-provenance-core.js") : null);
  const { ID, HASH, ORIGINS, SOURCE_KINDS, plain, trim, list, stable, freeze, sha256, ok, fail, timestamp, validUrl, ownForbiddenId, hasUnpairedSurrogate, utf16Boundary, normalizeHumanJustification, hasCitedAncestry, claimSetSemantic } = core;
  function graphApi() { return root.LLMWikiClaimProvenanceGraph || (typeof require === "function" ? require("./llmwiki-claim-provenance-graph.js") : null); }

  function normalizeSnapshot(value, field) {
    if (!plain(value)) return fail(field, "malformed_source_snapshot");
    const sourceId = trim(value.source_id);
    const sourceRevision = trim(value.source_revision);
    const extractorRevision = trim(value.extractor_revision);
    const text = typeof value.source_text === "string" ? value.source_text : null;
    const declaredHash = trim(value.source_content_hash);
    const kind = trim(value.source_kind || "immutable_source");
    if (!ID.test(sourceId)) return fail(`${field}.source_id`, "invalid_source_id");
    if (!HASH.test(sourceRevision) || !HASH.test(extractorRevision)) return fail(field, "invalid_source_revision");
    if (text === null) return fail(`${field}.source_content_hash`, "source_content_hash_mismatch");
    if (hasUnpairedSurrogate(text)) return fail(`${field}.source_text`, "invalid_utf16_source_text");
    if (!HASH.test(declaredHash) || sha256(text) !== declaredHash) return fail(`${field}.source_content_hash`, "source_content_hash_mismatch");
    if (!SOURCE_KINDS.has(kind)) return fail(`${field}.source_kind`, "invalid_source_kind");
    const window = plain(value.provider_window) ? value.provider_window : null;
    if (!window || !Number.isSafeInteger(window.start) || !Number.isSafeInteger(window.end) || window.start < 0 || window.end <= window.start || window.end > text.length || !utf16Boundary(text, window.start) || !utf16Boundary(text, window.end)) {
      return fail(`${field}.provider_window`, "invalid_provider_window");
    }
    let external = null;
    if (kind === "external_ingested_snapshot") {
      const ingestedAt = timestamp(value.ingested_at);
      const sourceUrl = validUrl(value.source_url);
      if (!ingestedAt || !sourceUrl) return fail(field, "external_snapshot_required");
      external = { ingested_at: ingestedAt, source_url: sourceUrl };
    }
    return ok({
      source_id: sourceId, source_revision: sourceRevision, extractor_revision: extractorRevision,
      source_content_hash: declaredHash, source_length: text.length, provider_window: { start: window.start, end: window.end },
      source_kind: kind, ...external,
    });
  }
  function normalizeSnapshots(values) {
    if (!Array.isArray(values)) return fail("source_snapshots", "source_snapshots_required");
    const snapshots = new Map();
    for (const [index, value] of values.entries()) {
      const normalized = normalizeSnapshot(value, `source_snapshots.${index}`);
      if (!normalized.ok) return normalized;
      if (snapshots.has(normalized.value.source_id)) return fail(`source_snapshots.${index}.source_id`, "duplicate_source_snapshot");
      snapshots.set(normalized.value.source_id, { ...normalized.value, source_text: value.source_text });
    }
    return ok(snapshots);
  }
  function citationFromProvider(value, snapshots, field) {
    if (!plain(value) || ownForbiddenId(value)) return fail(field, "provider_id_forbidden");
    const sourceId = trim(value.source_id);
    const snapshot = snapshots.get(sourceId);
    if (!snapshot) return fail(`${field}.source_id`, "unknown_source_snapshot");
    const span = plain(value.provider_span) ? value.provider_span : null;
    if (!span || !Number.isSafeInteger(span.start) || !Number.isSafeInteger(span.end) || span.start < 0 || span.end <= span.start || span.end > snapshot.provider_window.end - snapshot.provider_window.start) {
      return fail(`${field}.provider_span`, "invalid_provider_span");
    }
    const digest = trim(span.span_digest);
    const start = snapshot.provider_window.start + span.start;
    const end = snapshot.provider_window.start + span.end;
    if (!utf16Boundary(snapshot.source_text, start) || !utf16Boundary(snapshot.source_text, end)) return fail(`${field}.provider_span`, "invalid_utf16_span_boundary");
    const substring = snapshot.source_text.slice(start, end);
    if (!HASH.test(digest) || sha256(substring) !== digest) return fail(`${field}.provider_span.span_digest`, "span_digest_mismatch");
    const payload = { source_id: sourceId, source_revision: snapshot.source_revision, extractor_revision: snapshot.extractor_revision, source_content_hash: snapshot.source_content_hash, source_span: { start, end }, span_digest: digest };
    return ok({ citation_id: `citation_${sha256(stable(payload)).slice(0, 24)}`, ...payload });
  }
  function normalizeCitations(values, snapshots, field) {
    if (!Array.isArray(values) || values.length === 0) return fail(field, "citation_required");
    const citations = new Map();
    for (const [index, value] of values.entries()) {
      const citation = citationFromProvider(value, snapshots, `${field}.${index}`);
      if (!citation.ok) return citation;
      if (citations.has(citation.value.citation_id)) return fail(`${field}.${index}`, "duplicate_citation");
      citations.set(citation.value.citation_id, citation.value);
    }
    return ok([...citations.values()].sort((left, right) => left.citation_id.localeCompare(right.citation_id, "en")));
  }
  function derivationIds(value, claims, field) {
    const indices = list(value.derivation_indices);
    if (indices.length === 0 || indices.some((index) => !Number.isSafeInteger(index) || index < 0 || index >= claims.length)) return fail(field, "derivation_claim_required");
    const ids = [...new Set(indices.map((index) => claims[index].claim_id))].sort();
    if (ids.length !== indices.length) return fail(field, "duplicate_derivation_claim");
    return ok(ids);
  }
  function createClaimSet(input) {
    if (!plain(input) || !Array.isArray(input.claims) || input.claims.length === 0) return fail("input", "malformed_input");
    const snapshots = normalizeSnapshots(input.source_snapshots);
    if (!snapshots.ok) return snapshots;
    const knownClaimIds = list(input.known_claim_ids);
    if (knownClaimIds.some((id) => !ID.test(trim(id))) || new Set(knownClaimIds).size !== knownClaimIds.length) return fail("known_claim_ids", "invalid_known_claim_ids");
    const claims = [];
    const citations = new Map();
    const disputes = [];
    for (const [index, raw] of input.claims.entries()) {
      if (!plain(raw)) return fail(`claims.${index}`, "malformed_claim");
      if (ownForbiddenId(raw)) return fail(`claims.${index}`, "provider_id_forbidden");
      const origin = trim(raw.origin);
      const text = trim(raw.text);
      if (!ORIGINS.has(origin)) return fail(`claims.${index}.origin`, "invalid_claim_origin");
      if (!text) return fail(`claims.${index}.text`, "claim_text_required");
      if (origin === "ai_research" && Object.hasOwn(raw, "source_url")) return fail(`claims.${index}.source_url`, "bare_url_research_forbidden");
      let claimCitations = [];
      let derivedFrom = [];
      let justification = null;
      let disputeTarget = null;
      switch (origin) {
        case "source_extract":
        case "ai_research": { const normalized = normalizeCitations(raw.citations, snapshots.value, `claims.${index}.citations`); if (!normalized.ok) return normalized; claimCitations = normalized.value; break; }
        case "human_authored": { const normalized = normalizeHumanJustification(raw.human_justification, `claims.${index}.human_justification`); if (!normalized.ok) return normalized; justification = normalized.value; if (raw.citations !== undefined && list(raw.citations).length > 0) return fail(`claims.${index}.citations`, "human_citation_not_supported"); break; }
        case "ai_interpretation":
        case "ai_correction": { if (raw.citations !== undefined && list(raw.citations).length > 0) return fail(`claims.${index}.citations`, "direct_ai_citation_forbidden"); const normalized = derivationIds(raw, claims, `claims.${index}.derivation_indices`); if (!normalized.ok) return normalized; derivedFrom = normalized.value; break; }
        default: return fail(`claims.${index}.origin`, "invalid_claim_origin");
      }
      if (origin === "ai_research" && claimCitations.some((citation) => snapshots.value.get(citation.source_id).source_kind !== "external_ingested_snapshot")) return fail(`claims.${index}.citations`, "external_snapshot_required");
      if (origin === "ai_interpretation" && !hasCitedAncestry(derivedFrom, claims, citations)) return fail(`claims.${index}.derivation_indices`, "cited_derivation_ancestry_required");
      if (origin === "ai_correction") {
        const disputeIndex = raw.disputes_claim_index;
        if (!Number.isSafeInteger(disputeIndex) || disputeIndex < 0 || disputeIndex >= knownClaimIds.length) return fail(`claims.${index}.disputes_claim_index`, "dispute_target_required");
        disputeTarget = trim(knownClaimIds[disputeIndex]);
      }
      const citationIds = claimCitations.map((citation) => citation.citation_id);
      const payload = { origin, text, citation_ids: citationIds, derived_from_claim_ids: derivedFrom, human_justification: justification, dispute_target_claim_id: disputeTarget };
      const claim = { claim_id: `claim_${sha256(stable(payload)).slice(0, 24)}`, ...payload, citations: claimCitations, status: "unreviewed" };
      if (claims.some((item) => item.claim_id === claim.claim_id)) return fail(`claims.${index}`, "duplicate_claim");
      claims.push(claim);
      claimCitations.forEach((citation) => citations.set(citation.citation_id, citation));
      if (disputeTarget) disputes.push({ dispute_id: `dispute_${sha256(stable({ target_claim_id: disputeTarget, correction_claim_id: claim.claim_id })).slice(0, 24)}`, target_claim_id: disputeTarget, correction_claim_id: claim.claim_id, status: "unreviewed" });
    }
    const claimSet = freeze({
      contract_version: core.CONTRACT_VERSION,
      sources: [...snapshots.value.values()].map(({ source_text, ...snapshot }) => snapshot).sort((left, right) => left.source_id.localeCompare(right.source_id, "en")),
      claims, citations: [...citations.values()].sort((left, right) => left.citation_id.localeCompare(right.citation_id, "en")),
      disputes: disputes.slice().sort((left, right) => left.dispute_id.localeCompare(right.dispute_id, "en")),
      status: "unreviewed", source_data_untrusted: true, write_counters: { writer: 0, canonical: 0, maintenance: 0, git: 0 },
    });
    const withHash = freeze({ ...claimSet, claim_set_hash: sha256(stable(claimSetSemantic(claimSet))) });
    const graph = graphApi().validateClaimSet(withHash);
    return graph.ok ? ok(withHash) : graph;
  }

  const api = Object.freeze({ normalizeSnapshot, createClaimSet });
  root.LLMWikiClaimProvenanceBoundary = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
