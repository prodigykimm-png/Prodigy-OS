(function (root) {
  "use strict";

  const METRIC_KEYS = Object.freeze([
    "sale_volume_3m", "housing_stock", "sale_turnover_rate", "sale_price_change_yoy", "jeonse_ratio",
    "move_in_12m", "move_in_24m", "move_in_36m", "move_in_48m", "move_in_60m",
    "households", "household_change_yoy", "auction_bid_rate_6m"
  ]);
  const SORT_KEYS = Object.freeze(["name", "sido", "metrics_as_of", "verification", "transit_available", ...METRIC_KEYS]);
  const VERIFICATION_FILTERS = Object.freeze(["all", "verified", "partial", "unverified"]);
  const FRESHNESS_FILTERS = Object.freeze(["all", "기준일 있음", "기준일 없음"]);
  const MAX_SELECTION = 3;
  const SELECTION_LIMIT_MESSAGE = "비교할 지역은 최대 3개까지 선택할 수 있습니다.";
  const DISPLAY_GROUPS = Object.freeze([
    Object.freeze({ label: "시장", fields: Object.freeze([
      Object.freeze({ key: "sale_volume_3m", label: "최근 3개월 거래량", source: "metrics" }),
      Object.freeze({ key: "housing_stock", label: "주택 재고", source: "metrics" }),
      Object.freeze({ key: "sale_turnover_rate", label: "거래 회전율", source: "metrics" }),
      Object.freeze({ key: "sale_price_change_yoy", label: "매매가격 증감률", source: "metrics" }),
      Object.freeze({ key: "jeonse_ratio", label: "전세가율", source: "metrics" }),
      Object.freeze({ key: "auction_bid_rate_6m", label: "최근 6개월 낙찰가율", source: "metrics" })
    ]) }),
    Object.freeze({ label: "세대", fields: Object.freeze([
      Object.freeze({ key: "households", label: "세대수", source: "metrics" }),
      Object.freeze({ key: "household_change_yoy", label: "세대수 증감률", source: "metrics" })
    ]) }),
    Object.freeze({ label: "12~60개월 입주물량", fields: Object.freeze([
      Object.freeze({ key: "move_in_12m", label: "12개월", source: "metrics" }),
      Object.freeze({ key: "move_in_24m", label: "24개월", source: "metrics" }),
      Object.freeze({ key: "move_in_36m", label: "36개월", source: "metrics" }),
      Object.freeze({ key: "move_in_48m", label: "48개월", source: "metrics" }),
      Object.freeze({ key: "move_in_60m", label: "60개월", source: "metrics" })
    ]) }),
    Object.freeze({ label: "지가", fields: Object.freeze([
      Object.freeze({ key: "trend_yoy", label: "지가 추세 증감률", source: "land_price" }),
      Object.freeze({ key: "as_of", label: "지가 기준일", source: "land_price" }),
      Object.freeze({ key: "scope", label: "지가 범위", source: "land_price" }),
      Object.freeze({ key: "source", label: "지가 출처", source: "land_price" })
    ]) }),
    Object.freeze({ label: "조사 근거", fields: Object.freeze([
      Object.freeze({ key: "summary", label: "요약", source: "research" }),
      Object.freeze({ key: "zones", label: "권역", source: "research" }),
      Object.freeze({ key: "supply_pipeline", label: "공급 계획", source: "research" }),
      Object.freeze({ key: "transport_life", label: "교통·생활", source: "research" }),
      Object.freeze({ key: "risks", label: "위험", source: "research" }),
      Object.freeze({ key: "site_visit", label: "임장", source: "research" }),
      Object.freeze({ key: "sources", label: "출처", source: "research" })
    ]) }),
    Object.freeze({ label: "도시철도", fields: Object.freeze([
      Object.freeze({ key: "transit_available", label: "확인된 도시철도", source: "transit" })
    ]) })
  ]);

  function text(value) { return typeof value === "string" ? value.trim() : ""; }
  function normalized(value) { return text(value).normalize("NFC"); }
  function array(value) { return Array.isArray(value) ? value : []; }
  function member(values, value, fallback) { return values.includes(value) ? value : fallback; }
  function distinctKeys(value) {
    const keys = [];
    for (const item of array(value)) {
      const key = normalized(item);
      if (key && !keys.includes(key) && keys.length < MAX_SELECTION) keys.push(key);
    }
    return keys;
  }
  function freezeState(value) {
    return Object.freeze({
      sido: normalized(value && value.sido) || null,
      search: normalized(value && value.search),
      verification: member(VERIFICATION_FILTERS, value && value.verification, "all"),
      freshness: member(FRESHNESS_FILTERS, value && value.freshness, "all"),
      sort_key: member(SORT_KEYS, value && value.sort_key, "name"),
      sort_direction: value && value.sort_direction === "desc" ? "desc" : "asc",
      selected_region_keys: Object.freeze(distinctKeys(value && value.selected_region_keys))
    });
  }
  function createState(overrides) { return freezeState(overrides || {}); }
  function update(state, patch) { return freezeState({ ...state, ...patch }); }

  function transition(currentState, action) {
    const state = createState(currentState);
    const event = action && typeof action === "object" ? action : {};
    if (event.type === "set_filters") return { state: update(state, event.filters && typeof event.filters === "object" ? event.filters : {}), message: null };
    if (event.type === "set_sort") return { state: update(state, { sort_key: event.sort_key, sort_direction: event.sort_direction }), message: null };
    if (event.type === "clear_selection") return { state: update(state, { selected_region_keys: [] }), message: null };
    const key = normalized(event.region_key);
    if (event.type === "deselect_region") return { state: update(state, { selected_region_keys: state.selected_region_keys.filter((item) => item !== key) }), message: null };
    if (event.type === "select_region") {
      if (!key || state.selected_region_keys.includes(key)) return { state, message: null };
      if (state.selected_region_keys.length === MAX_SELECTION) return { state, message: SELECTION_LIMIT_MESSAGE };
      return { state: update(state, { selected_region_keys: [...state.selected_region_keys, key] }), message: null };
    }
    return { state, message: null };
  }

  function sortValue(row, sortKey) {
    const identity = row && row.identity && typeof row.identity === "object" ? row.identity : {};
    const provenance = row && row.provenance && typeof row.provenance === "object" ? row.provenance : {};
    if (sortKey === "name") return normalized(identity.title) || null;
    if (sortKey === "sido") return normalized(identity.sido) || null;
    if (sortKey === "metrics_as_of") return text(provenance.metrics_as_of) || null;
    if (sortKey === "verification") return text(provenance.verification_status) || null;
    if (sortKey === "transit_available") {
      const transit = row && row.transit;
      if (!transit || !transit.available) return 0;
      return transit.totalStations || 0;
    }
    const metric = row && row.metrics && row.metrics[sortKey];
    return metric && typeof metric.value === "number" && Number.isFinite(metric.value) ? metric.value : null;
  }
  function compareValues(left, right, direction) {
    const leftMissing = left === null;
    const rightMissing = right === null;
    if (leftMissing || rightMissing) return leftMissing === rightMissing ? 0 : leftMissing ? 1 : -1;
    const compared = typeof left === "number" && typeof right === "number" ? left - right : String(left).localeCompare(String(right), "ko");
    return direction === "desc" ? -compared : compared;
  }
  function matches(row, state) {
    const identity = row && row.identity && typeof row.identity === "object" ? row.identity : {};
    const provenance = row && row.provenance && typeof row.provenance === "object" ? row.provenance : {};
    const freshness = provenance.freshness && typeof provenance.freshness === "object" ? provenance.freshness : {};
    const matchesSido = !state.sido || normalized(identity.sido) === state.sido;
    const haystack = `${normalized(identity.sido)} ${normalized(identity.sigungu)}`;
    const matchesSearch = !state.search || haystack.includes(state.search);
    const matchesVerification = state.verification === "all" || text(provenance.verification_status) === state.verification;
    const matchesFreshness = state.freshness === "all" || text(freshness.availability) === state.freshness;
    return matchesSido && matchesSearch && matchesVerification && matchesFreshness;
  }
  function projectedRows(projection) { return projection && Array.isArray(projection.rows) ? projection.rows.filter((row) => row && typeof row === "object") : []; }
  function rowsFor(projection, state) {
    return projectedRows(projection).map((row, index) => ({ row, index })).filter((item) => matches(item.row, state))
      .sort((left, right) => compareValues(sortValue(left.row, state.sort_key), sortValue(right.row, state.sort_key), state.sort_direction) || left.index - right.index)
      .map((item) => item.row);
  }
  function comparisonRows(rows, selectedKeys) {
    return selectedKeys.map((key) => rows.find((row) => row && row.identity && normalized(row.identity.region_key) === key)).filter(Boolean);
  }
  function buildViewModel(projection, currentState) {
    const state = createState(currentState);
    const rows = rowsFor(projection, state);
    const selectedRows = comparisonRows(projectedRows(projection), state.selected_region_keys);
    return Object.freeze({ state, rows: Object.freeze(rows), comparison: Object.freeze({ groups: DISPLAY_GROUPS, rows: Object.freeze(selectedRows) }) });
  }

  const api = Object.freeze({ DISPLAY_GROUPS, FRESHNESS_FILTERS, MAX_SELECTION, METRIC_KEYS, SELECTION_LIMIT_MESSAGE, SORT_KEYS, VERIFICATION_FILTERS, buildViewModel, createState, transition });
  root.RegionExplorerState = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
