"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");
const test = require("node:test");

const ROOT = path.resolve(__dirname, "../../../../../..");
const core = require(path.join(ROOT, "SYSTEM/Views/region-decision-context-core.js"));

function metric(value, availability = value == null ? "자료 없음" : "관측값") {
  return { value, availability };
}

function region(overrides = {}) {
  return {
    identity: { region_key: "부산광역시-사하구", sido: "부산광역시", sigungu: "사하구", title: "부산광역시 사하구", path: "PARA/RESOURCES/Auction Regions/부산광역시-사하구.md" },
    metrics: {
      sale_volume_3m: metric(435), sale_price_change_yoy: metric(-0.99), sale_turnover_rate: metric(0.03),
      jeonse_ratio: metric(69.97), households: metric(105378), household_change_yoy: metric(0.48),
      move_in_12m: metric(415), move_in_24m: metric(1409), auction_bid_rate_6m: metric(null)
    },
    provenance: { metrics_as_of: "2026-05-01", source_as_of: "2026-07-19", metrics_source: "공식 지표", verification_status: "unverified" },
    transit: { available: true, totalStations: 3, lines: [{ line: "부산1호선", stations: ["A", "B", "C"] }] },
    research: { transport_life: "역 접근 경로를 확인했다.", site_visit: null },
    history: { snapshots: [] },
    ...overrides
  };
}

test("Given normalized Region evidence When decision context is projected Then four neutral question groups remain traceable and bounded", () => {
  const result = core.projectRegionDecisionContext({
    region: region(),
    auction: { region_dong: "다대동" },
    research: { state: "needs_selection", label: "대상 선택 필요", evidence_summary: "실거래 3건" },
    outcome: { sample_count: 2, period_label: "최근 6개월" }
  });

  assert.equal(result.status, "ready");
  assert.equal(result.identity.region_key, "부산광역시-사하구");
  assert.equal(result.questions.length, 4);
  assert.deepEqual(result.questions.map((item) => item.id), ["transactions_price", "rental_demand", "supply_life", "auction_micro"]);
  assert.ok(result.questions.every((item) => item.facts.length <= 3));
  assert.equal(result.trust.metrics_as_of, "2026-05-01");
  assert.equal(result.trust.verification_status, "unverified");
  assert.ok(result.checks.some((item) => item.kind === "verification_pending"));
  assert.ok(result.checks.some((item) => item.kind === "micro_location"));
  assert.ok(result.checks.some((item) => item.kind === "research_selection_required"));
  assert.ok(result.questions.flatMap((item) => item.facts).every((fact) => core.ALLOWED_FACT_KINDS.includes(fact.kind)));
  assert.ok(result.questions.flatMap((item) => item.facts).every((fact) => fact.provenance && fact.provenance.scope));

  const rendered = JSON.stringify(result);
  for (const forbidden of core.FORBIDDEN_LABELS) assert.doesNotMatch(rendered, new RegExp(forbidden, "u"));
  assert.equal(result.score, undefined);
  assert.equal(result.rank, undefined);
  assert.equal(result.recommendation, undefined);
});

test("Given missing Region data When decision context is projected Then it reports evidence shortage without inventing facts", () => {
  const result = core.projectRegionDecisionContext({ region: null, auction: { region_dong: "우동" } });

  assert.equal(result.status, "unavailable");
  assert.equal(result.questions.length, 4);
  assert.ok(result.questions.every((item) => item.facts.length === 0));
  assert.ok(result.checks.some((item) => item.kind === "missing_region"));
});

test("Given unrelated metrics move in different directions When projected Then they are not labeled as conflicting evidence", () => {
  const result = core.projectRegionDecisionContext({ region: region() });
  assert.equal(result.questions.flatMap((item) => item.facts).some((fact) => fact.kind === "상반된 근거"), false);
});

test("Given an explicit same-claim conflict When projected Then only that verified conflict is shown", () => {
  const result = core.projectRegionDecisionContext({
    region: region(),
    conflicts: [{ claim: "최근 3개월 거래량", detail: "공식 출처 두 곳의 동일 기준값이 다릅니다.", verified: true, source_refs: ["source-a", "source-b"] }]
  });
  const conflicts = result.questions.flatMap((item) => item.facts).filter((fact) => fact.kind === "상반된 근거");
  assert.equal(conflicts.length, 1);
  assert.match(conflicts[0].text, /동일 기준값/);
});
