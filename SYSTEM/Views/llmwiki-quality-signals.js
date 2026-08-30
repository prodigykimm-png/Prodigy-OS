(function (root) {
  "use strict";
  const VERSION = "llmwiki_quality_signals_v1";
  const STOP = new Set(["한다", "있다", "없다", "위해", "대한", "통해", "경우", "것이다", "중요하다"]);
  function tokens(value) {
    return [...new Set(String(value || "").normalize("NFC").toLowerCase().split(/[^\p{L}\p{N}]+/u).map((word) => word.replace(/(?:은|는|이|가|을|를|에|의|와|과|도|로|으로|에서|에게|보다|마다|까지|부터)$/u, "")).filter((word) => word.length >= 2 && !STOP.has(word)))];
  }
  function covered(mapClaim, inventoryClaims) {
    const wanted = tokens(`${mapClaim.text || ""} ${mapClaim.evidence_quote || ""}`);
    if (wanted.length < 4) return true;
    return inventoryClaims.some((claim) => {
      const actual = new Set(tokens(claim.text));
      const overlap = wanted.filter((token) => actual.has(token)).length;
      return overlap / wanted.length >= 0.6;
    });
  }
  function audit(input = {}) {
    const mapClaims = Array.isArray(input.map_claims) ? input.map_claims : [];
    const inventoryClaims = Array.isArray(input.inventory_claims) ? input.inventory_claims : [];
    const possibleGaps = mapClaims.filter((claim) => !covered(claim, inventoryClaims)).map((claim) => Object.freeze({ map_claim_id: claim.claim_id, evidence_quote: claim.evidence_quote || "", text: claim.text || "", status: "possible_gap" }));
    return Object.freeze({ version: VERSION, status: "advisory", possible_gaps: Object.freeze(possibleGaps), blocks_approval: false });
  }
  function summarize(input = {}) {
    const claims = Array.isArray(input.inventory_claims) ? input.inventory_claims.length : 0;
    const pages = Array.isArray(input.pages) ? input.pages.length : 0;
    const sourceOnly = Array.isArray(input.source_only_claim_ids) ? input.source_only_claim_ids.length : 0;
    const gaps = Array.isArray(input.possible_gaps) ? input.possible_gaps.length : 0;
    const holds = Array.isArray(input.holds) ? input.holds.length : 0;
    return Object.freeze({ claims, drafts: pages, source_only: sourceOnly, possible_gaps: gaps, holds, text: `claims ${claims} · draft ${pages} · source-only ${sourceOnly} · 누락 후보 ${gaps} · hold ${holds}` });
  }
  const api = Object.freeze({ VERSION, tokens, audit, summarize });
  root.LLMWikiQualitySignals = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
