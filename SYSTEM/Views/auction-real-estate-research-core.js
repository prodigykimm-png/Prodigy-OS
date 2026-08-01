(function (root) {
  "use strict";

  const PROVIDERS = Object.freeze(["court", "building", "transactions", "official-price", "land-price"]);
  const PROVIDER_LABELS = Object.freeze({ court: "법원경매", building: "건축물대장", transactions: "실거래가", "official-price": "공시가격", "land-price": "개별공시지가" });
  const FIELD_LABELS = Object.freeze({ case_number: "사건번호", court: "법원", auction_datetime: "매각기일", region_sido: "시·도", region_sigungu: "시·군·구", region_dong: "읍·면·동", address: "주소", property_type: "용도", appraisal_price: "감정가", minimum_bid: "최저매각가", auction_outcome: "경매 결과", auction_result_date: "결과일", winning_bid_price: "낙찰가" });
  const STATUS_LABELS = Object.freeze({ success: "조회 완료", empty: "자료 없음", failed: "조회 실패", needs_identifier: "식별자 필요", needs_selection: "선택 필요" });
  const FIELD_ORDER = Object.freeze(["case_number", "court", "auction_datetime", "region_sido", "region_sigungu", "region_dong", "address", "property_type", "appraisal_price", "minimum_bid", "auction_outcome", "auction_result_date", "winning_bid_price"]);

  function clean(value) { return value === undefined || value === null ? "" : String(value).trim(); }
  function caseKey(auction) { return `${clean(auction && auction.case_number)}-${clean(auction && auction.item_number) || "1"}`.replace(/[^\p{L}\p{N}._-]+/gu, "-").replace(/-+/g, "-").replace(/^-|-$/g, "").slice(0, 160); }
  function formatValue(key, value) {
    if (value === undefined || value === null || value === "") return "자료 없음";
    if (["appraisal_price", "minimum_bid", "winning_bid_price"].includes(key) && Number.isFinite(Number(value))) return `${Number(value).toLocaleString("ko-KR")}원`;
    return String(value);
  }
  function providerStatus(pkg, provider) { return pkg && pkg.providers && pkg.providers[provider] ? pkg.providers[provider].status : "failed"; }
  function selectableFields(auction, pkg) {
    const patch = pkg && pkg.candidate_patch && typeof pkg.candidate_patch === "object" ? pkg.candidate_patch : {};
    return FIELD_ORDER.filter((key) => patch[key] !== undefined && patch[key] !== null && patch[key] !== "").map((key) => ({ key, label: FIELD_LABELS[key], current: auction && auction[key], proposed: patch[key], changed: String((auction && auction[key]) ?? "") !== String(patch[key]) }));
  }
  function isPackageForAuction(pkg, auction) { return Boolean(pkg && pkg.schema_version === 1 && pkg.case_key === caseKey(auction) && pkg.query_identity && pkg.query_identity.object_path === auction.file.path); }
  function packageTimestamp(pkg) { const value = Date.parse(clean(pkg && pkg.observed_at)); return Number.isFinite(value) ? value : 0; }
  function statusLabel(status) { return STATUS_LABELS[status] || status || "확인 필요"; }
  function providerLabel(provider) { return PROVIDER_LABELS[provider] || provider; }
  function evidenceSummary(pkg) {
    const transactions = pkg?.evidence?.transactions?.summary?.sample_count;
    const building = pkg?.evidence?.building?.records?.length;
    const official = pkg?.evidence?.["official-price"]?.history?.length;
    const land = pkg?.evidence?.["land-price"]?.history?.length;
    return [transactions ? `실거래 ${transactions}건` : "실거래 자료 없음", building ? `건축물대장 ${building}건` : "건축물대장 자료 없음", official ? `공시가격 ${official}개 연도` : "공시가격 자료 없음", land ? `공시지가 ${land}개 연도` : "공시지가 자료 없음"].join(" · ");
  }
  const api = Object.freeze({ FIELD_LABELS, FIELD_ORDER, PROVIDERS, PROVIDER_LABELS, caseKey, evidenceSummary, formatValue, isPackageForAuction, packageTimestamp, providerLabel, providerStatus, selectableFields, statusLabel });
  root.AuctionRealEstateResearchCore = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
