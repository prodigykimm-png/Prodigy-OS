(function (root) {
  "use strict";

  const VERSION = "llmwiki_canonical_overlap_v1";
  const STOP = new Set(["가이드", "기준", "방법", "원칙", "웨딩", "스냅", "촬영", "위한", "대한", "한다", "있다", "사용"]);
  const WEDDING_ANCHORS = new Set(["포징", "디렉팅", "구도", "자세", "조명", "플래시", "신부대기실", "대기실", "가족", "원판", "앨범", "후보정", "렌즈", "본식", "버진로드", "하객"]);

  function freeze(value) {
    if (Array.isArray(value)) return Object.freeze(value.map(freeze));
    if (!value || typeof value !== "object") return value;
    return Object.freeze(Object.fromEntries(Object.entries(value).map(([key, child]) => [key, freeze(child)])));
  }
  function tokens(value) {
    return [...new Set(String(value || "").toLocaleLowerCase("ko-KR").match(/[가-힣a-z0-9]{2,}/gu) || [])]
      .filter((token) => !STOP.has(token));
  }
  function claimCoverage(claim, document) {
    const claimTokens = tokens(claim);
    if (claimTokens.length < 2) return 0;
    const documentTokens = new Set(tokens(document));
    const shared = claimTokens.filter((token) => documentTokens.has(token));
    if (shared.length < 2) return 0;
    return shared.length / claimTokens.length;
  }
  function classify(input) {
    if (!input || !Array.isArray(input.claims) || input.claims.length === 0 || !Array.isArray(input.canonical_documents)) {
      return freeze({ ok: false, reason: "invalid_overlap_input", writer_count: 0 });
    }
    const pageAnchors = tokens(input.page_title).filter((token) => WEDDING_ANCHORS.has(token));
    const rows = input.canonical_documents.map((document) => {
      const body = `${document.title || ""} ${document.content || document.searchable_text || ""}`;
      const coverages = input.claims.map((claim) => claimCoverage(claim.text || claim, body));
      const covered_claim_ids = input.claims.filter((_claim, index) => coverages[index] >= 0.34)
        .map((claim, index) => claim.claim_id || `claim_${index + 1}`);
      const documentAnchors = tokens(body).filter((token) => WEDDING_ANCHORS.has(token));
      const title_anchor_match = pageAnchors.some((token) => documentAnchors.includes(token));
      return {
        candidate_id: document.candidate_id,
        title: document.title || "",
        read_only: document.read_only === true,
        covered_claim_ids,
        coverage_count: covered_claim_ids.length,
        coverage_ratio: covered_claim_ids.length / input.claims.length,
        mean_token_coverage: coverages.reduce((sum, value) => sum + value, 0) / coverages.length,
        title_anchor_match,
      };
    }).filter((row) => row.coverage_count > 0 || row.title_anchor_match)
      .sort((left, right) => right.coverage_count - left.coverage_count
        || Number(right.title_anchor_match) - Number(left.title_anchor_match)
        || right.mean_token_coverage - left.mean_token_coverage
        || left.candidate_id.localeCompare(right.candidate_id, "en"));
    if (rows.length === 0) return freeze({ ok: true, relation: "new", status: "classified", candidates: [], evidence: [], writer_count: 0 });
    const best = rows[0];
    const second = rows[1];
    const tied = second && best.coverage_count === second.coverage_count
      && best.title_anchor_match === second.title_anchor_match
      && Math.abs(best.mean_token_coverage - second.mean_token_coverage) < 0.05;
    if (tied) return freeze({ ok: true, relation: "ambiguous", status: "hold", candidates: rows.slice(0, 3), evidence: rows.slice(0, 3), writer_count: 0 });
    const relation = best.coverage_count === input.claims.length ? "duplicate" : "compatible_new";
    return freeze({ ok: true, relation, status: "classified", candidates: [best], evidence: rows.slice(0, 3), writer_count: 0 });
  }

  const api = freeze({ VERSION, classify });
  root.LLMWikiCanonicalOverlap = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
