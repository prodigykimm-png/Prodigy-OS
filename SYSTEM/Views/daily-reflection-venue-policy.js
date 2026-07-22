(function (root) {
  "use strict";

  const GENERAL_PLACE_MARKER = /(?:cafe|카페|restaurant|레스토랑|음식점|맛집|식당|retail|매장|상점|아울렛|마트|attraction|관광지|명소|accommodation|숙소|호텔|펜션|travel_spot|여행지)/iu;
  const WEDDING_MARKER = /(?:wedding|웨딩|결혼(?:식)?|예식|신랑|신부|부케)/iu;
  const SHOOTING_MARKER = /(?:shoot(?:ing)?|촬영|사진)/iu;
  const VENUE_LOCATION_MARKER = /(?:hall|홀|컨벤션|convention|studio|스튜디오|chapel|채플|예식장|ceremony)/iu;

  function clean(value) {
    return String(value == null ? "" : value).trim();
  }

  function isVenueEligibleCandidate(candidate, blocks) {
    if (!candidate || clean(candidate.suggested_type).toLowerCase() !== "venue") return false;
    const sourceIds = new Set(Array.isArray(candidate.source_evidence_ids) ? candidate.source_evidence_ids : []);
    const evidence = (Array.isArray(blocks) ? blocks : [])
      .filter((block) => sourceIds.has(block.evidence_id))
      .map((block) => [block.title, block.context, block.experience, block.interpretation, block.change, block.next_experiment].map(clean).join(" "))
      .join(" ");
    const description = `${clean(candidate.name)} ${evidence}`;
    return !GENERAL_PLACE_MARKER.test(description)
      && VENUE_LOCATION_MARKER.test(description)
      && WEDDING_MARKER.test(description)
      && SHOOTING_MARKER.test(description);
  }

  const api = { isVenueEligibleCandidate };
  root.DailyReflectionVenuePolicy = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
