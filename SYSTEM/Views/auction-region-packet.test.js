"use strict";

const assert = require("node:assert/strict");
const packet = require("./auction-region-packet.js");

const zones = `
> **AI 권역 후보 · 확인 필요:** 공식 행정동·교통·생활권 기반 후보.

| 후보 권역 | 성격 후보 | 주의 · 확인 필요 |
|---|---|---|
| 보수·부평·광복 권역 | 보수동, 부평동, 광복동 일대. 1호선 남포역·자갈치역 위치 | 주소별 확인 필요 |
| 남포·영주 권역 | 남포동, 영주1·2동 일대. 1호선 남포역·자갈치역 위치 | 정비사업 단계별 현장 확인 필요 |
`;

assert.deepEqual(packet.projectDongZone("남포동", zones), {
  dong: "남포동",
  zone: "남포·영주 권역",
  character: "남포동, 영주1·2동 일대. 1호선 남포역·자갈치역 위치",
  caution: "정비사업 단계별 현장 확인 필요"
});
assert.equal(packet.projectDongZone("영주동", zones).zone, "남포·영주 권역");
assert.equal(packet.projectDongZone("중앙동", zones), null);
assert.equal(packet.projectDongZone("", zones), null);

const periodic = packet.periodicLayerData({
  region: {
    identity: { path: "PARA/RESOURCES/Auction Regions/부산광역시-북구.md" },
    provenance: { metrics_as_of: "2026-05-01", source_as_of: "2026-07-28", verification_status: "unverified" },
    metrics: {
      total_population: { value: 430000 }, male_population: { value: 210000 }, female_population: { value: 220000 },
      population_change_count: { value: -1200 }, population_change_yoy: { value: -0.278358 },
      household_change_count: { value: 320 }, demographic_signal: { value: "가구 분화" },
      households: { value: 122144 }, housing_stock: { value: 91053 }, sale_volume_3m: { value: 882 },
      sale_price_change_yoy: { value: -0.009485 }, move_in_24m: { value: 0 }
    },
    transit: { available: true, lines: [{ line: "2호선", stations: ["구명", "구남"] }] },
    research: { supply_pipeline: "정비사업 단계는 기준일별 갱신", risks: "공급 현황 확인" }
  }
});
assert.equal(periodic.metrics_as_of, "2026-05-01");
assert.equal(periodic.source_as_of, "2026-07-28");
assert.equal(periodic.metrics.length, 15);
assert.equal(periodic.metrics.find((metric) => metric.key === "total_population").value, 430000);
assert.equal(periodic.metrics.find((metric) => metric.key === "population_change_count").value, -1200);
assert.equal(periodic.demographic_signal, "가구 분화");
assert.deepEqual(periodic.metric_groups.map((group) => ({ key: group.key, cadence: group.cadence })), [
  { key: "demography", cadence: "월간" },
  { key: "stock", cadence: "연간·공식 파일 개정 시" },
  { key: "supply", cadence: "반기·공식 파일 개정 시" },
  { key: "market", cadence: "실험적 월간·일부 지역 결측" }
]);
assert.equal(periodic.metric_groups.find((group) => group.key === "demography").metrics.some((metric) => metric.key === "male_population"), false);
assert.equal(periodic.metric_groups.find((group) => group.key === "demography").metrics.some((metric) => metric.key === "female_population"), false);
assert.equal(periodic.metric_groups.find((group) => group.key === "supply").metrics.some((metric) => metric.key === "move_in_36m"), false);
assert.equal(periodic.metrics.find((metric) => metric.key === "households").value, 122144);
assert.equal(periodic.metrics.find((metric) => metric.key === "housing_stock").value, 91053);
assert.deepEqual(periodic.transit_lines, [{ line: "2호선", stations: ["구명", "구남"] }]);
assert.equal(periodic.development_supply.length, 1);
assert.equal(periodic.structural_risks.length, 1);
assert.equal(periodic.history_location, "PARA/RESOURCES/Auction Regions/부산광역시-북구.md");

console.log("auction-region-packet dong zone tests: PASS");
