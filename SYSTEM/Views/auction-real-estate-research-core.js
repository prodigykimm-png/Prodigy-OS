(function (root) {
  "use strict";

  const PROVIDERS = Object.freeze(["court", "building", "transactions", "official-price", "land-price"]);
  const PROVIDER_LABELS = Object.freeze({ court: "법원경매", building: "건축물대장", transactions: "실거래가", "official-price": "공시가격", "land-price": "개별공시지가" });
  const FIELD_LABELS = Object.freeze({ case_number: "사건번호", court: "법원", auction_datetime: "매각기일", region_sido: "시·도", region_sigungu: "시·군·구", region_dong: "읍·면·동", address: "주소", property_type: "용도", appraisal_price: "감정가", minimum_bid: "최저매각가", auction_outcome: "경매 결과", auction_result_date: "결과일", winning_bid_price: "낙찰가" });
  const STATUS_LABELS = Object.freeze({ success: "조회 완료", empty: "자료 없음", failed: "조회 실패", needs_identifier: "식별자 필요", needs_selection: "선택 필요" });
  const MATCH_STATUS_LABELS = Object.freeze({ resolved: "매칭 확정", success: "매칭 확정", empty: "매칭 확정·자료 없음", needs_identifier: "식별 정보 필요", needs_selection: "대상 선택 필요", failed: "매칭 검증 실패", not_run: "실행 안 함" });
  const MATCH_METHOD_LABELS = Object.freeze({ fixture_contract: "고정 자료 계약 검증", fixture_identity_exact: "고정 자료 exact 식별", object_identifier: "Object 식별자", unique_court_name: "법원명 유일 일치", court_code_missing: "법원 코드 미확정", pnu: "PNU 일치", pnu_exact: "PNU 일치", pnu_required: "PNU 필요", region_comparison: "지역 비교 범위", region_code_exact: "지역 코드 일치", region_code_selection: "지역 코드 선택", apartment_unit: "공동주택 단지·동·호 일치", apartment_candidate_selection: "공동주택 단지 선택", apartment_unit_selection: "공동주택 동·호 선택", lot_address: "지번 주소 일치", pnu_or_lot: "PNU·지번 필지 일치", lot_required: "지번 필지 필요", proxy_opt_in_required: "프록시 허용 필요", collector: "수집기 검증" });
  const MATCH_REASON_LABELS = Object.freeze({ fixture_contract: "고정 자료로 계약 형식을 검증했습니다.", case_identity_exact: "사건번호와 법원 식별자가 일치합니다.", case_identity_mismatch: "사건번호 또는 법원 식별자가 다릅니다.", parcel_identity_exact: "필지 식별자가 일치합니다.", parcel_identity_mismatch: "필지 식별자가 다릅니다.", apartment_unit_exact: "공동주택 단지·동·호가 일치합니다.", apartment_unit_mismatch: "공동주택 단지·동·호가 다릅니다.", region_query_exact: "동일 지역·유형 비교 조회 범위입니다.", region_query_mismatch: "지역 비교 조회 조건이 다릅니다.", lot_identity_exact: "지번 필지가 일치합니다.", lot_identity_mismatch: "지번 필지가 다릅니다." });
  const LIFECYCLE_LABELS = Object.freeze({ watching: "관찰", bidding: "입찰 예정", won: "낙찰", lost: "패찰", skipped: "포기", reviewing: "복기", archived: "보관" });
  const FIELD_ORDER = Object.freeze(["case_number", "court", "auction_datetime", "region_sido", "region_sigungu", "region_dong", "address", "property_type", "appraisal_price", "minimum_bid", "auction_outcome", "auction_result_date", "winning_bid_price"]);
  const OVERVIEW_FIELDS = Object.freeze([
    { key: "case_number", label: "사건" },
    { key: "court", label: "법원" },
    { key: "property_type", label: "물건 용도" },
    { key: "address", label: "소재지" },
    { key: "auction_datetime", label: "매각기일" },
    { key: "status", label: "진행 상태" },
    { key: "appraisal_price", label: "감정가" },
    { key: "minimum_bid", label: "최저매각가" },
    { key: "winning_bid_price", label: "낙찰가" }
  ]);
  const AI_SUMMARY_SCHEMA = Object.freeze({
    type: "object",
    additionalProperties: false,
    properties: {
      summary: { type: "string" },
      key_points: { type: "array", items: { type: "string" } },
      cautions: { type: "array", items: { type: "string" } }
    },
    required: ["summary", "key_points", "cautions"]
  });

  function clean(value) { return value === undefined || value === null ? "" : String(value).trim(); }
  function caseKey(auction) { return `${clean(auction && auction.case_number)}-${clean(auction && auction.item_number) || "1"}`.replace(/[^\p{L}\p{N}._-]+/gu, "-").replace(/-+/g, "-").replace(/^-|-$/g, "").slice(0, 160); }
  function formatValue(key, value) {
    if (value === undefined || value === null || value === "") return "자료 없음";
    if (["appraisal_price", "minimum_bid", "winning_bid_price"].includes(key) && Number.isFinite(Number(value))) return `${Number(value).toLocaleString("ko-KR")}원`;
    if (["auction_datetime", "auction_result_date"].includes(key)) {
      const date = String(value).replace("T", " ").trim();
      return date.length >= 10 ? date.slice(0, 16).replace(/\s00:00$/u, "") : date;
    }
    return String(value);
  }
  function providerStatus(pkg, provider) { return pkg && pkg.providers && pkg.providers[provider] ? pkg.providers[provider].status : "failed"; }
  function providerMatch(pkg, provider) { return pkg?.match_resolution?.providers?.[provider] || null; }
  function matchStatusLabel(status) { return MATCH_STATUS_LABELS[status] || status || "확인 필요"; }
  function matchResolutionRows(pkg) {
    return PROVIDERS.map((provider) => {
      const match = providerMatch(pkg, provider) || {};
      const meta = pkg?.providers?.[provider] || {};
      const rawStatus = match.status || meta.status;
      const rawMethod = clean(match.method || meta.match_method);
      const rawReason = clean(match.reason || meta.match_reason);
      return { provider, label: providerLabel(provider), rawStatus, status: matchStatusLabel(rawStatus), method: MATCH_METHOD_LABELS[rawMethod] || rawMethod, reason: MATCH_REASON_LABELS[rawReason] || rawReason, scope: clean(match.scope || meta.match_scope), verified: match.match_verified === true || meta.match_verified === true, candidates: Array.isArray(match.candidates) ? match.candidates : [] };
    });
  }
  function matchBlockers(pkg) { return matchResolutionRows(pkg).filter((row) => !row.verified || ["needs_identifier", "needs_selection", "failed"].includes(row.rawStatus)); }
  function candidateFieldVerified(pkg, key) {
    const sources = pkg?.match_resolution?.candidate_sources?.[key];
    return Array.isArray(sources) && sources.some((provider) => pkg?.match_resolution?.providers?.[provider]?.match_verified === true);
  }
  function selectableFields(auction, pkg) {
    const patch = pkg && pkg.candidate_patch && typeof pkg.candidate_patch === "object" ? pkg.candidate_patch : {};
    return FIELD_ORDER.filter((key) => patch[key] !== undefined && patch[key] !== null && patch[key] !== "" && candidateFieldVerified(pkg, key)).map((key) => ({ key, label: FIELD_LABELS[key], current: auction && auction[key], proposed: patch[key], changed: String((auction && auction[key]) ?? "") !== String(patch[key]) })).filter((item) => item.changed);
  }
  function objectPathMatches(packagePath, auctionPath) {
    const left = clean(packagePath).replaceAll("\\", "/").replace(/^\/+|\/+$/gu, "");
    const right = clean(auctionPath).replaceAll("\\", "/").replace(/^\/+|\/+$/gu, "");
    return Boolean(left && right && left === right);
  }
  function isPackageForAuction(pkg, auction) { return Boolean(pkg && pkg.schema_version === 1 && pkg.case_key === caseKey(auction) && pkg.query_identity && objectPathMatches(pkg.query_identity.object_path, auction?.file?.path)); }
  function packageTimestamp(pkg) { const value = Date.parse(clean(pkg && pkg.observed_at)); return Number.isFinite(value) ? value : 0; }
  function statusLabel(status) { return STATUS_LABELS[status] || status || "확인 필요"; }
  function providerLabel(provider) { return PROVIDER_LABELS[provider] || provider; }
  function historyOf(pkg, key, legacyKey) {
    const direct = pkg?.evidence?.[key]?.history;
    const legacy = pkg?.evidence?.[legacyKey]?.history;
    return Array.isArray(direct) ? direct : Array.isArray(legacy) ? legacy : [];
  }
  function yearCount(history) { return new Set(history.map((item) => Number(item?.year)).filter(Number.isFinite)).size; }
  function formatWon(value) {
    const amount = Number(value);
    return Number.isFinite(amount) ? `${amount.toLocaleString("ko-KR")}원` : "";
  }
  function evidenceSummary(pkg) {
    const transactions = pkg?.evidence?.transactions?.summary?.sample_count;
    const building = pkg?.evidence?.building?.records?.length || (pkg?.evidence?.building?.record ? 1 : 0);
    const official = yearCount(historyOf(pkg, "official-price", "official_price"));
    const land = yearCount(historyOf(pkg, "land-price", "land_price"));
    const available = [transactions ? `실거래 ${transactions}건` : "", building ? `건축물대장 ${building}건` : "", official ? `공시가격 ${official}개 연도` : "", land ? `공시지가 ${land}개 연도` : ""].filter(Boolean);
    return available.length ? `확인된 외부 자료: ${available.join(" · ")}` : "확인된 외부 자료 없음";
  }
  function lifecycleLabel(status) { return LIFECYCLE_LABELS[status] || status || "확인 필요"; }
  function buildOverview(auction, pkg) {
    const candidate = pkg && pkg.candidate_patch && typeof pkg.candidate_patch === "object" ? pkg.candidate_patch : {};
    return OVERVIEW_FIELDS.map(({ key, label }) => {
      const hasCandidate = candidate[key] !== undefined && candidate[key] !== null && candidate[key] !== "" && candidateFieldVerified(pkg, key);
      const value = key === "status" ? lifecycleLabel(auction && auction[key]) : formatValue(key, hasCandidate ? candidate[key] : auction && auction[key]);
      return { key, label, value, source: hasCandidate ? "조사 후보" : "현재 기록" };
    });
  }
  function evidenceCards(pkg) {
    const transactions = pkg?.evidence?.transactions?.summary?.sample_count || 0;
    const building = pkg?.evidence?.building?.records?.length || (pkg?.evidence?.building?.record ? 1 : 0);
    const officialHistory = historyOf(pkg, "official-price", "official_price");
    const latestOfficialYear = officialHistory.reduce((latest, item) => Math.max(latest, Number(item?.year) || 0), 0);
    const latestOfficialPrices = [...new Set(officialHistory
      .filter((item) => Number(item?.year) === latestOfficialYear)
      .map((item) => Number(item?.price_won))
      .filter(Number.isFinite))]
      .sort((left, right) => left - right);
    const officialValue = latestOfficialPrices.length
      ? `${latestOfficialYear}년 ${latestOfficialPrices.map(formatWon).join(" · ")}${latestOfficialPrices.length > 1 ? ` (${latestOfficialPrices.length}건)` : ""}`
      : yearCount(officialHistory) ? `${yearCount(officialHistory)}개 연도` : "자료 없음";
    const landEvidence = pkg?.evidence?.["land-price"] || pkg?.evidence?.land_price || {};
    const landHistory = historyOf(pkg, "land-price", "land_price");
    const landLatest = landEvidence.latest || landHistory.reduce((latest, item) => Number(item?.year) > Number(latest?.year || 0) ? item : latest, null);
    const landAmount = formatWon(landLatest?.price_per_sqm);
    const landValue = landAmount ? `${landLatest.year}년 ${landAmount}/㎡` : yearCount(landHistory) ? `${yearCount(landHistory)}개 연도` : "자료 없음";
    return [
      { key: "transactions", label: "실거래 비교", value: transactions ? `${transactions}건` : "자료 없음" },
      { key: "building", label: "건축물대장", value: building ? `${building}건 확인` : "자료 없음" },
      { key: "official-price", label: "공시가격", value: officialValue },
      { key: "land-price", label: "개별공시지가", value: landValue }
    ].filter((item) => item.value !== "자료 없음");
  }
  function buildAiSummaryInput(auction, pkg) {
    return {
      scope: "경매 카드에 표시된 기본 정보가 아닌, 이번 조사에서 새로 확인된 외부 자료",
      case_context: { case_number: clean(auction && auction.case_number), region: [auction && auction.region_sido, auction && auction.region_sigungu, auction && auction.region_dong].map(clean).filter(Boolean).join(" ") },
      candidate_changes: selectableFields(auction, pkg).map((item) => ({ label: item.label, current: formatValue(item.key, item.current), proposed: formatValue(item.key, item.proposed) })),
      evidence: evidenceCards(pkg),
      provider_status: PROVIDERS.map((provider) => ({ provider: providerLabel(provider), status: statusLabel(providerStatus(pkg, provider)) })),
      warnings: Array.isArray(pkg?.errors) ? pkg.errors.map((error) => String(error && error.message || "확인 필요")).slice(0, 8) : []
    };
  }
  function normalizeAiSummary(payload) {
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
    const text = clean(payload.summary);
    const list = (value) => Array.isArray(value) ? value.map(clean).filter(Boolean).slice(0, 5) : [];
    if (!text) return null;
    return { summary: text, key_points: list(payload.key_points), cautions: list(payload.cautions) };
  }
  const api = Object.freeze({ AI_SUMMARY_SCHEMA, FIELD_LABELS, FIELD_ORDER, LIFECYCLE_LABELS, MATCH_METHOD_LABELS, MATCH_REASON_LABELS, MATCH_STATUS_LABELS, OVERVIEW_FIELDS, PROVIDERS, PROVIDER_LABELS, buildAiSummaryInput, buildOverview, candidateFieldVerified, caseKey, evidenceCards, evidenceSummary, formatValue, isPackageForAuction, lifecycleLabel, matchBlockers, matchResolutionRows, matchStatusLabel, normalizeAiSummary, objectPathMatches, packageTimestamp, providerLabel, providerMatch, providerStatus, selectableFields, statusLabel });
  root.AuctionRealEstateResearchCore = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
