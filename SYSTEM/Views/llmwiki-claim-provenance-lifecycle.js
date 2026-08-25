(function (root) {
  "use strict";

  const core = root.LLMWikiClaimProvenanceCore || (typeof require === "function" ? require("./llmwiki-claim-provenance-core.js") : null);
  const graph = root.LLMWikiClaimProvenanceGraph || (typeof require === "function" ? require("./llmwiki-claim-provenance-graph.js") : null);
  const boundary = root.LLMWikiClaimProvenanceBoundary || (typeof require === "function" ? require("./llmwiki-claim-provenance-boundary.js") : null);
  const { ID, STATUSES, plain, trim, list, freeze, ok, fail, timestamp, hasCitedAncestry } = core;

  function transitionClaimSet(claimSet, authorization) {
    const validated = graph.validateClaimSet(claimSet);
    if (!validated.ok) return validated;
    if (!plain(authorization) || trim(authorization.claim_set_hash) !== claimSet.claim_set_hash) return fail("authorization.claim_set_hash", "claim_set_hash_mismatch");
    const status = trim(authorization.status);
    const authorizedBy = trim(authorization.authorized_by);
    const authorizedAt = timestamp(authorization.authorized_at);
    const ids = list(authorization.claim_ids).map(trim);
    if (!STATUSES.has(status) || status === "unreviewed" || !ID.test(authorizedBy) || !authorizedAt || ids.length === 0 || new Set(ids).size !== ids.length) return fail("authorization", "invalid_claim_authorization");
    const requested = new Set(ids);
    if ([...requested].some((id) => !claimSet.claims.some((claim) => claim.claim_id === id))) return fail("authorization.claim_ids", "unknown_claim_authorization");
    if (status === "accepted" && claimSet.claims.some((claim) => requested.has(claim.claim_id) && claim.origin === "ai_interpretation" && !hasCitedAncestry(claim.derived_from_claim_ids, claimSet.claims, claimSet.citations))) {
      return fail("authorization.claim_ids", "cited_derivation_ancestry_required");
    }
    const claims = claimSet.claims.map((claim) => {
      if (!requested.has(claim.claim_id)) return claim;
      if (claim.status !== "unreviewed" && !(status === "superseded" && claim.status === "accepted")) return null;
      return { ...claim, status, review: { authorized_by: authorizedBy, authorized_at: authorizedAt } };
    });
    if (claims.some((claim) => claim === null)) return fail("authorization.status", "invalid_claim_transition");
    const disputes = claimSet.disputes.map((dispute) => requested.has(dispute.correction_claim_id) ? { ...dispute, status } : dispute);
    return ok(freeze({ ...claimSet, claims, disputes, status: claims.every((claim) => claim.status === "accepted") ? "accepted" : claimSet.status }));
  }
  function assessClaimStaleness(claimSet, currentSnapshots) {
    const validated = graph.validateClaimSet(claimSet);
    if (!validated.ok) return validated;
    if (!plain(currentSnapshots)) return fail("current_source_snapshots", "invalid_current_source_snapshots");
    const stale = new Set();
    for (const citation of claimSet.citations) {
      const current = boundary.normalizeSnapshot(currentSnapshots[citation.source_id], `current_source_snapshots.${citation.source_id}`);
      if (!current.ok) return current;
      if (current.value.source_revision !== citation.source_revision || current.value.extractor_revision !== citation.extractor_revision || current.value.source_content_hash !== citation.source_content_hash) {
        claimSet.claims.filter((claim) => claim.citation_ids.includes(citation.citation_id)).forEach((claim) => stale.add(claim.claim_id));
      }
    }
    let changed = true;
    while (changed) {
      changed = false;
      for (const claim of claimSet.claims) {
        if (claim.derived_from_claim_ids.some((id) => stale.has(id)) && !stale.has(claim.claim_id)) { stale.add(claim.claim_id); changed = true; }
      }
    }
    const staleClaimIds = [...stale].sort();
    return ok(freeze({ status: staleClaimIds.length > 0 ? "stale" : "current", stale: staleClaimIds.length > 0, stale_claim_ids: staleClaimIds, current_claim_ids: claimSet.claims.map((claim) => claim.claim_id).filter((id) => !stale.has(id)).sort(), write_counters: { writer: 0, canonical: 0, maintenance: 0, git: 0 } }));
  }

  const api = Object.freeze({ transitionClaimSet, assessClaimStaleness });
  root.LLMWikiClaimProvenanceLifecycle = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
