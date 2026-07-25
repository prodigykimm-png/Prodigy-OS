"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const state = require("../../../../../Views/region-explorer-state.js");

function row({ sido, sigungu, title = `${sido} ${sigungu}`, metricsAsOf = "2026-05-01", verification = "unverified", freshness = "기준일 있음", metrics = {}, landPrice = null, research = {} }) {
  return {
    identity: { region_key: `${sido}-${sigungu}`, sido, sigungu, title },
    metrics: Object.fromEntries(state.METRIC_KEYS.map((key) => [key, { value: Object.hasOwn(metrics, key) ? metrics[key] : 10 }])),
    provenance: { metrics_as_of: metricsAsOf, verification_status: verification, freshness: { availability: freshness } },
    land_price: landPrice,
    research
  };
}

const rows = [
  row({ sido: "부산광역시", sigungu: "중구", verification: "verified", metrics: { sale_volume_3m: 0, move_in_12m: 150 } }),
  row({ sido: "부산광역시", sigungu: "해운대구", verification: "partial", metrics: { sale_volume_3m: null, move_in_12m: null } }),
  row({ sido: "서울특별시", sigungu: "강북구", verification: "unverified", freshness: "기준일 없음", metrics: { sale_volume_3m: 20, move_in_12m: 50 } }),
  row({ sido: "인천광역시", sigungu: "부평구", verification: "unverified", metrics: { sale_volume_3m: 20, move_in_12m: 50 } })
];

test("Given projection rows When filters and normalized Korean search are applied Then only matching sido, verification, and freshness rows remain", () => {
  const before = JSON.stringify(rows);
  const initial = state.createState({ sido: "부산광역시", search: "\u1112\u1162\u110b\u116e\u11ab\u1103\u1162", verification: "partial", freshness: "기준일 있음" });

  const model = state.buildViewModel({ rows }, initial);

  assert.deepEqual(model.rows.map((item) => item.identity.region_key), ["부산광역시-해운대구"]);
  assert.equal(JSON.stringify(rows), before, "filtering must not mutate projection rows");
});

test("Given every permitted raw sort When equal values or nulls are sorted Then order is stable and null remains after available values", () => {
  for (const sortKey of state.SORT_KEYS) {
    const duplicateRows = rows.map((item) => ({ ...item, metrics: { ...item.metrics } }));
    if (sortKey === "name") duplicateRows.forEach((item) => { item.identity = { ...item.identity, title: "동일" }; });
    if (sortKey === "sido") duplicateRows.forEach((item) => { item.identity = { ...item.identity, sido: "동일" }; });
    if (sortKey === "metrics_as_of") duplicateRows.forEach((item) => { item.provenance = { ...item.provenance, metrics_as_of: "2026-05-01" }; });
    if (sortKey === "verification") duplicateRows.forEach((item) => { item.provenance = { ...item.provenance, verification_status: "partial" }; });
    if (state.METRIC_KEYS.includes(sortKey)) duplicateRows.forEach((item) => { item.metrics[sortKey] = { value: 7 }; });
    const model = state.buildViewModel({ rows: duplicateRows }, state.createState({ sort_key: sortKey, sort_direction: "asc" }));
    assert.deepEqual(model.rows.map((item) => item.identity.region_key), duplicateRows.map((item) => item.identity.region_key), `${sortKey} ties must keep projection order`);
  }

  const ascending = state.buildViewModel({ rows }, state.createState({ sort_key: "sale_volume_3m", sort_direction: "asc" }));
  const descending = state.buildViewModel({ rows }, state.createState({ sort_key: "sale_volume_3m", sort_direction: "desc" }));

  assert.deepEqual(ascending.rows.map((item) => item.metrics.sale_volume_3m.value), [0, 20, 20, null]);
  assert.deepEqual(descending.rows.map((item) => item.metrics.sale_volume_3m.value), [20, 20, 0, null]);
});

test("Given three selected region keys When a fourth distinct key is selected Then the selection is unchanged and a Korean limit message is returned", () => {
  let current = state.createState();
  for (const item of rows.slice(0, 3)) current = state.transition(current, { type: "select_region", region_key: item.identity.region_key }).state;
  const before = current.selected_region_keys.slice();

  const rejected = state.transition(current, { type: "select_region", region_key: rows[3].identity.region_key });
  const deselected = state.transition(current, { type: "deselect_region", region_key: rows[1].identity.region_key });

  assert.deepEqual(rejected.state.selected_region_keys, before);
  assert.match(rejected.message, /최대 3개/);
  assert.deepEqual(deselected.state.selected_region_keys, [rows[0].identity.region_key, rows[2].identity.region_key]);
});

test("Given independent state operations and malformed input When view models are built Then no stale filter leaks and malformed input is safely empty", () => {
  const busan = state.buildViewModel({ rows }, state.createState({ sido: "부산광역시" }));
  const independent = state.buildViewModel({ rows }, state.createState());

  assert.equal(busan.rows.length, 2);
  assert.equal(independent.rows.length, 4);
  assert.doesNotThrow(() => state.buildViewModel({ rows: null }, { search: 42, selected_region_keys: [null, "부산광역시-중구"] }));
  assert.deepEqual(state.buildViewModel(null, null).rows, []);
});

test("Given a comparison model When display groups are exposed Then fixed Korean groups exist without a derived score or rank", () => {
  const model = state.buildViewModel({ rows }, state.createState({ selected_region_keys: rows.slice(0, 3).map((item) => item.identity.region_key) }));

  assert.deepEqual(state.DISPLAY_GROUPS.map((group) => group.label), ["시장", "세대", "12~60개월 입주물량", "지가", "조사 근거", "도시철도"]);
  assert.equal(model.comparison.rows.length, 3);
  assert.doesNotMatch(JSON.stringify(model), /"(?:score|rank)"/i);
});
