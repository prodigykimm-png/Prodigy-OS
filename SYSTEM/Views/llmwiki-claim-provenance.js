(function (root) {
  "use strict";

  const core = root.LLMWikiClaimProvenanceCore || (typeof require === "function" ? require("./llmwiki-claim-provenance-core.js") : null);
  const boundary = root.LLMWikiClaimProvenanceBoundary || (typeof require === "function" ? require("./llmwiki-claim-provenance-boundary.js") : null);
  const graph = root.LLMWikiClaimProvenanceGraph || (typeof require === "function" ? require("./llmwiki-claim-provenance-graph.js") : null);
  const lifecycle = root.LLMWikiClaimProvenanceLifecycle || (typeof require === "function" ? require("./llmwiki-claim-provenance-lifecycle.js") : null);

  function parse(value, field) {
    const parsed = core.parseBoundaryData(value);
    return parsed.ok ? parsed : core.fail(field, parsed.reason);
  }
  function createClaimSet(input) {
    const parsed = parse(input, "input");
    return parsed.ok ? boundary.createClaimSet(parsed.value) : parsed;
  }
  function validateClaimSet(claimSet) {
    const parsed = parse(claimSet, "claim_set");
    return parsed.ok ? graph.validateClaimSet(parsed.value) : parsed;
  }
  function transitionClaimSet(claimSet, authorization) {
    const parsedClaimSet = parse(claimSet, "claim_set");
    if (!parsedClaimSet.ok) return parsedClaimSet;
    const parsedAuthorization = parse(authorization, "authorization");
    return parsedAuthorization.ok ? lifecycle.transitionClaimSet(parsedClaimSet.value, parsedAuthorization.value) : parsedAuthorization;
  }
  function assessClaimStaleness(claimSet, currentSnapshots) {
    const parsedClaimSet = parse(claimSet, "claim_set");
    if (!parsedClaimSet.ok) return parsedClaimSet;
    const parsedSnapshots = parse(currentSnapshots, "current_source_snapshots");
    return parsedSnapshots.ok ? lifecycle.assessClaimStaleness(parsedClaimSet.value, parsedSnapshots.value) : parsedSnapshots;
  }

  const api = core.freeze({
    CONTRACT_VERSION: core.CONTRACT_VERSION,
    ORIGINS: [...core.ORIGINS].sort(),
    STATUSES: [...core.STATUSES].sort(),
    createClaimSet,
    validateClaimSet,
    transitionClaimSet,
    assessClaimStaleness,
  });
  root.LLMWikiClaimProvenance = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
