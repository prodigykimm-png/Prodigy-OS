(function (root) {
  "use strict";

  const ALLOWED_FACT_KINDS = Object.freeze([
    "관찰된 사실",
    "기간 변화",
    "비교 차이",
    "참고 사례",
    "상반된 근거",
    "확인 필요",
    "근거 부족"
  ]);
  const FORBIDDEN_LABELS = Object.freeze([
    "확인된 강점",
    "확인할 위험",
    "긍정적",
    "부정적",
    "유리",
    "불리",
    "우수",
    "열위",
    "투자 적합",
    "입찰 추천",
    "포기 추천",
    "종합 점수",
    "성공 확률",
    "적정 투찰가",
    "자동 순위"
  ]);
  const QUESTION_DEFS = Object.freeze([
    Object.freeze({ id: "transactions_price", label: "거래와 가격은 어떻게 움직였나?" }),
    Object.freeze({ id: "rental_demand", label: "임대 판단에 사용할 근거가 있는가?" }),
    Object.freeze({ id: "supply_life", label: "공급과 생활환경에서 확인할 사실은 무엇인가?" }),
    Object.freeze({ id: "auction_micro", label: "지역 경매 사례와 미시 입지는 무엇을 보여주는가?" })
  ]);

  function clean(value) {
    return value === undefined || value === null ? "" : String(value).trim();
  }

  function record(value) {
    return value && typeof value === "object" && !Array.isArray(value) ? value : {};
  }

  function deepFreeze(value) {
    if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
    Object.freeze(value);
    for (const item of Array.isArray(value) ? value : Object.values(value)) deepFreeze(item);
    return value;
  }

  function numericMetric(region, key) {
    const metric = record(record(region).metrics)[key];
    const value = record(metric).value;
    return typeof value === "number" && Number.isFinite(value) ? value : null;
  }

  function number(value, unit) {
    return `${value.toLocaleString("ko-KR", { maximumFractionDigits: 2 })}${unit || ""}`;
  }

  function provenance(region, extra) {
    const identity = record(record(region).identity);
    const source = record(record(region).provenance);
    return Object.freeze({
      scope: "시군구",
      region_key: clean(identity.region_key) || null,
      source_ref: clean(source.metrics_source) || clean(identity.path) || null,
      as_of: clean(source.metrics_as_of) || null,
      ...(extra || {})
    });
  }

  function fact(region, kind, text, key, extraProvenance) {
    return Object.freeze({
      kind,
      text,
      metric_key: key || null,
      provenance: provenance(region, extraProvenance)
    });
  }

  function metricFact(region, key, label, unit, kind) {
    const value = numericMetric(region, key);
    return value === null ? null : fact(region, kind || "관찰된 사실", `${label} ${number(value, unit)}`, key);
  }

  function compactFacts(items) {
    return Object.freeze(items.filter(Boolean).slice(0, 3));
  }

  function explicitConflicts(region, conflicts) {
    return (Array.isArray(conflicts) ? conflicts : [])
      .filter((item) => item && item.verified === true && clean(item.claim) && clean(item.detail))
      .map((item) => fact(region, "상반된 근거", `${clean(item.claim)} · ${clean(item.detail)}`, null, {
        source_refs: Object.freeze((Array.isArray(item.source_refs) ? item.source_refs : []).map(clean).filter(Boolean))
      }));
  }

  function transactionFacts(region, conflicts) {
    return compactFacts([
      ...explicitConflicts(region, conflicts),
      metricFact(region, "sale_volume_3m", "최근 3개월 거래량", "건"),
      metricFact(region, "sale_price_change_yoy", "매매가격 전년 동기 변화", "%", "기간 변화"),
      metricFact(region, "sale_turnover_rate", "거래 회전율", "")
    ]);
  }

  function rentalFacts(region) {
    return compactFacts([
      metricFact(region, "jeonse_ratio", "전세가율", "%"),
      metricFact(region, "households", "세대수", "세대"),
      metricFact(region, "household_change_yoy", "세대수 전년 동기 변화", "%", "기간 변화")
    ]);
  }

  function supplyFacts(region) {
    const transit = record(record(region).transit);
    const totalStations = Number(transit.totalStations);
    return compactFacts([
      metricFact(region, "move_in_12m", "12개월 입주물량", "세대"),
      metricFact(region, "move_in_24m", "24개월 입주물량", "세대"),
      transit.available && Number.isFinite(totalStations)
        ? fact(region, "관찰된 사실", `확인된 도시철도 역 ${number(totalStations, "개")}`, "transit", { source_ref: clean(record(region).identity && record(region).identity.path) || null })
        : null
    ]);
  }

  function auctionFacts(region, auction, outcome) {
    const result = record(outcome);
    const sampleCount = Number(result.sample_count);
    const dong = clean(record(auction).region_dong);
    return compactFacts([
      Number.isFinite(sampleCount) && sampleCount > 0
        ? fact(region, "참고 사례", `${clean(result.period_label) || "확인 기간"} 정규 경매 결과 ${number(sampleCount, "건")}`, "auction_outcomes", { source_ref: "정규 경매 결과" })
        : null,
      metricFact(region, "auction_bid_rate_6m", "최근 6개월 낙찰가율", "%"),
      dong
        ? fact(region, "확인 필요", `${dong}의 미시 입지는 시군구 자료와 별도로 확인합니다.`, "region_dong", { scope: "읍면동", as_of: null })
        : null
    ]);
  }

  function checksFor(region, auction, research) {
    const checks = [];
    const source = record(record(region).provenance);
    const state = clean(record(research).state);
    if (!clean(source.metrics_as_of)) checks.push({ kind: "missing_metrics_date", message: "지역 지표 기준일이 없습니다." });
    if (clean(source.verification_status) !== "verified") checks.push({ kind: "verification_pending", message: "검증 전 지역 자료가 있습니다." });
    if (!clean(source.metrics_source) && !clean(record(region).identity && record(region).identity.path)) checks.push({ kind: "missing_source", message: "지역 지표 출처가 부족합니다." });
    if (clean(record(auction).region_dong)) checks.push({ kind: "micro_location", message: "미시 입지 확인이 필요합니다." });
    if (state === "missing") checks.push({ kind: "research_missing", message: "부동산 조사 자료가 없습니다." });
    if (state === "stale") checks.push({ kind: "research_stale", message: "부동산 조사 자료가 오래되었습니다." });
    if (state === "failed") checks.push({ kind: "research_failed", message: "일부 부동산 조사를 완료하지 못했습니다." });
    if (state === "needs_identifier") checks.push({ kind: "research_identifier_required", message: "부동산 조사 식별 정보가 필요합니다." });
    if (state === "needs_selection") checks.push({ kind: "research_selection_required", message: "부동산 조사 대상을 선택해야 합니다." });
    return Object.freeze(checks.map((item) => Object.freeze(item)));
  }

  function unavailable(auction) {
    return deepFreeze({
      status: "unavailable",
      decision_authority: "human_required",
      identity: Object.freeze({ region_key: null, title: "지역 자료 없음", sido: null, sigungu: null }),
      trust: Object.freeze({ metrics_as_of: null, verification_status: null, source_as_of: null, source_ref: null }),
      questions: QUESTION_DEFS.map((definition) => Object.freeze({ ...definition, facts: Object.freeze([]) })),
      checks: Object.freeze([
        Object.freeze({ kind: "missing_region", message: "지역 자료가 없습니다." }),
        ...(clean(record(auction).region_dong) ? [Object.freeze({ kind: "micro_location", message: "미시 입지 확인이 필요합니다." })] : [])
      ])
    });
  }

  function projectRegionDecisionContext(input) {
    const source = record(input);
    const region = source.region && typeof source.region === "object" ? source.region : null;
    if (!region || !clean(record(region.identity).region_key)) return unavailable(source.auction);
    const identity = record(region.identity);
    const sourceProvenance = record(region.provenance);
    const factGroups = [
      transactionFacts(region, source.conflicts),
      rentalFacts(region),
      supplyFacts(region),
      auctionFacts(region, source.auction, source.outcome)
    ];
    return deepFreeze({
      status: "ready",
      decision_authority: "human_required",
      identity: {
        region_key: clean(identity.region_key),
        title: clean(identity.title) || [clean(identity.sido), clean(identity.sigungu)].filter(Boolean).join(" "),
        sido: clean(identity.sido) || null,
        sigungu: clean(identity.sigungu) || null
      },
      trust: {
        metrics_as_of: clean(sourceProvenance.metrics_as_of) || null,
        verification_status: clean(sourceProvenance.verification_status) || null,
        source_as_of: clean(sourceProvenance.source_as_of) || null,
        source_ref: clean(sourceProvenance.metrics_source) || clean(identity.path) || null
      },
      questions: QUESTION_DEFS.map((definition, index) => ({ ...definition, facts: factGroups[index] })),
      checks: checksFor(region, source.auction, source.research)
    });
  }

  const api = Object.freeze({
    ALLOWED_FACT_KINDS,
    FORBIDDEN_LABELS,
    QUESTION_DEFS,
    projectRegionDecisionContext
  });
  root.RegionDecisionContextCore = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
