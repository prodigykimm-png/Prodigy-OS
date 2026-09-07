"use strict";
const assert = require("node:assert/strict");
const projection = require("./auction-key-value-projection.js");
const snapshot = {
  groups: {
    "부산광역시|해운대구|우동|오피스텔": { key_value_won_per_pyeong: 10000000, q1_won_per_pyeong: 9000000, q3_won_per_pyeong: 11000000, case_count: 12, building_count: 5, confidence: "usable", period_start: "2025-09-01", period_end: "2026-08-31" },
    "인천광역시|서구|가좌동|지식산업센터": { key_value_won_per_pyeong: 7000000, q1_won_per_pyeong: 6000000, q3_won_per_pyeong: 8000000, case_count: 8, building_count: 4, confidence: "usable", period_start: "2025-09-01", period_end: "2026-08-31" },
    "경기도|고양시 일산동구|장항동|오피스텔": { key_value_won_per_pyeong: 12000000, q1_won_per_pyeong: 11000000, q3_won_per_pyeong: 13000000, case_count: 9, building_count: 4, confidence: "usable", period_start: "2025-09-01", period_end: "2026-08-31" }
  },
  districts: {
    "부산광역시|해운대구|오피스텔": { key_value_won_per_pyeong: 8000000, q1_won_per_pyeong: 7000000, q3_won_per_pyeong: 9000000, case_count: 40, building_count: 18, confidence: "usable", period_start: "2025-09-01", period_end: "2026-08-31" },
    "인천광역시|서구|지식산업센터": { key_value_won_per_pyeong: 6500000, q1_won_per_pyeong: 5500000, q3_won_per_pyeong: 7500000, case_count: 20, building_count: 9, confidence: "usable", period_start: "2025-09-01", period_end: "2026-08-31" },
    "경기도|고양시 일산동구|오피스텔": { key_value_won_per_pyeong: 11000000, q1_won_per_pyeong: 10000000, q3_won_per_pyeong: 12000000, case_count: 30, building_count: 12, confidence: "usable", period_start: "2025-09-01", period_end: "2026-08-31" }
  }
};
const parsePrice = (value) => {
  if (value === undefined || value === null || String(value).trim() === "") return NaN;
  const raw = String(value).trim();
  if (/^\d+$/.test(raw) && Number(raw) >= 10000000) return Number(raw);
  if (/^\d+$/.test(raw)) return Number(raw) * 10000;
  return Number(raw);
};
const result = projection.project({ status: "watching", region_sido: "부산광역시", region_sigungu: "해운대구", region_dong: "우동", property_type: "오피스텔", exclusive_area: "33.05785㎡", expected_bid: 90000000 }, snapshot, { parsePrice });
assert.equal(result.available, true);
assert.equal(result.legal_dong, "우동");
assert.equal(result.area_sqm, 33.05785);
assert.equal(result.area_pyeong, 10);
assert.equal(result.key_value_total_won, 100000000);
assert.equal(result.primary_scope, "dong");
assert.equal(result.dong.key_value_total_won, 100000000);
assert.equal(result.district.key_value_total_won, 80000000);
assert.equal(result.district_difference_ratio, 0.25);
assert.equal(result.comparison.won_per_pyeong, 9000000);
assert.equal(result.comparison.ratio, 0.9);
assert.equal(result.comparison.price_key, "expected_bid");
assert.equal(result.comparison.position, "키값 근접");
const bidResult = projection.project({ status: "bidding", region_sido: "부산광역시", region_sigungu: "해운대구", region_dong: "우동", property_type: "오피스텔", exclusive_area: "33.05785㎡", expected_bid: 90000000, my_bid_price: 9500 }, snapshot, { parsePrice });
assert.equal(bidResult.comparison.price_key, "my_bid_price");
assert.equal(bidResult.comparison.price_won, 95000000);
const wonResult = projection.project({ status: "won", region_sido: "부산광역시", region_sigungu: "해운대구", region_dong: "우동", property_type: "오피스텔", exclusive_area: "33.05785㎡", expected_bid: 90000000, my_bid_price: 9500, winning_bid_price: 105000000 }, snapshot, { parsePrice });
assert.equal(wonResult.comparison.price_key, "winning_bid_price");
assert.equal(wonResult.comparison.price_won, 105000000);
const missingArea = projection.project({ status: "watching", region_sido: "부산광역시", region_sigungu: "해운대구", region_dong: "우동", property_type: "오피스텔", expected_bid: 90000000 }, snapshot, { parsePrice });
assert.equal(missingArea.available, true);
assert.equal(missingArea.area_pyeong, null);
assert.equal(missingArea.key_value_total_won, null);
assert.equal(missingArea.comparison, null);
const concentratedSnapshot = {
  groups: {
    "부산광역시|해운대구|우동|오피스텔": { ...snapshot.groups["부산광역시|해운대구|우동|오피스텔"], confidence: "sample_concentrated", building_count: 1 }
  },
  districts: snapshot.districts
};
const districtPrimary = projection.project({ status: "watching", region_sido: "부산광역시", region_sigungu: "해운대구", region_dong: "우동", property_type: "오피스텔", exclusive_area: "33.05785㎡", expected_bid: 90000000 }, concentratedSnapshot, { parsePrice });
assert.equal(districtPrimary.primary_scope, "district");
assert.equal(districtPrimary.key_value_total_won, 80000000);
const aliasedFactory = projection.project({
  region_sido: "인천",
  region_sigungu: "서구",
  region_dong: "가좌동",
  property_type: "아파트형공장",
  exclusive_area: "100㎡"
}, snapshot);
assert.equal(aliasedFactory.available, true);
assert.equal(aliasedFactory.property_type, "지식산업센터");
assert.equal(aliasedFactory.group_key, "인천광역시|서구|가좌동|지식산업센터");
const nestedRegion = projection.project({
  region_sido: "경기",
  region_sigungu: "고양시",
  region_dong: "일산동구 장항동",
  address: "경기도 고양시 일산동구 장항동 1762",
  property_type: "오피스텔",
  exclusive_area: "90㎡"
}, snapshot);
assert.equal(nestedRegion.available, true);
assert.equal(nestedRegion.legal_dong, "장항동");
assert.equal(nestedRegion.group_key, "경기도|고양시 일산동구|장항동|오피스텔");
const houseSnapshot = {
  groups: { "부산광역시|해운대구|우동|주택": { ...snapshot.groups["부산광역시|해운대구|우동|오피스텔"] } },
  districts: { "부산광역시|해운대구|주택": { ...snapshot.districts["부산광역시|해운대구|오피스텔"] } }
};
const houseResult = projection.project({ region_sido: "부산광역시", region_sigungu: "해운대구", region_dong: "우동", property_type: "단독주택", exclusive_area: "33.05785㎡" }, houseSnapshot);
assert.equal(houseResult.available, true);
assert.equal(houseResult.property_type, "주택");
assert.equal(houseResult.group_key, "부산광역시|해운대구|우동|주택");
assert.equal(projection.project({ region_sido: "부산광역시", region_sigungu: "해운대구", region_dong: "중동", property_type: "아파트" }, snapshot).available, false);
console.log("auction key value projection tests: PASS");
