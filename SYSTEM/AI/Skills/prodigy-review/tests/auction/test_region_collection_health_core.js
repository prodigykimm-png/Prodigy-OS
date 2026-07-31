"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");
const test = require("node:test");

const ROOT = path.resolve(__dirname, "../../../../../..");
const core = require(path.join(ROOT, "SYSTEM/Views/region-collection-health-core.js"));

test("Given manifest and snapshots, When health is analyzed, Then coverage and missing regions stay exact", () => {
  const result = core.analyzeCollectionHealth({
    expectedRegionKeys: ["부산광역시-금정구", "부산광역시-동래구", "인천광역시-검단구"],
    snapshots: [
      { region_key: "부산광역시-금정구", metrics_as_of: "2026-06-01", fetched_at: "2026-07-01T01:00:00Z" },
      { region_key: "부산광역시-동래구", metrics_as_of: "2026-06-01", fetched_at: "2026-07-01T02:00:00Z" }
    ],
    now: new Date("2026-07-31T00:00:00Z")
  });

  assert.equal(result.expected_count, 3);
  assert.equal(result.covered_count, 2);
  assert.equal(result.coverage_percent, 66.7);
  assert.deepEqual(result.missing_region_keys, ["인천광역시-검단구"]);
  assert.equal(result.status, "attention");
});
test("Given repeated runs for one metrics month, When health is analyzed, Then duplicate month runs are surfaced without inflating coverage", () => {
  const result = core.analyzeCollectionHealth({
    expectedRegionKeys: ["부산광역시-금정구"],
    snapshots: [
      { region_key: "부산광역시-금정구", metrics_as_of: "2026-05-01", fetched_at: "2026-07-18T01:00:00Z" },
      { region_key: "부산광역시-금정구", metrics_as_of: "2026-05-01", fetched_at: "2026-07-28T01:00:00Z" },
      { region_key: "부산광역시-금정구", metrics_as_of: "2026-06-01", fetched_at: "2026-07-29T01:00:00Z" }
    ],
    now: new Date("2026-07-31T00:00:00Z")
  });

  assert.equal(result.covered_count, 1);
  assert.equal(result.snapshot_count, 3);
  assert.deepEqual(result.duplicate_months, [{
    region_key: "부산광역시-금정구",
    metrics_month: "2026-05",
    run_count: 2
  }]);
});

test("Given aging and stale latest snapshots, When health is analyzed, Then each region receives one freshness state", () => {
  const result = core.analyzeCollectionHealth({
    expectedRegionKeys: ["서울특별시-강남구", "서울특별시-도봉구", "서울특별시-중구"],
    snapshots: [
      { region_key: "서울특별시-강남구", metrics_as_of: "2026-07-01", fetched_at: "2026-07-02T00:00:00Z" },
      { region_key: "서울특별시-도봉구", metrics_as_of: "2026-04-01", fetched_at: "2026-04-02T00:00:00Z" },
      { region_key: "서울특별시-중구", metrics_as_of: "2025-12-01", fetched_at: "2025-12-02T00:00:00Z" }
    ],
    now: new Date("2026-07-31T00:00:00Z")
  });

  assert.equal(result.fresh_count, 1);
  assert.equal(result.aging_count, 1);
  assert.equal(result.stale_count, 1);
  assert.deepEqual(result.stale_region_keys, ["서울특별시-중구"]);
});

test("Given a selected region, When health is analyzed, Then its latest month and run count are projected", () => {
  const result = core.analyzeCollectionHealth({
    expectedRegionKeys: ["부산광역시-사하구"],
    selectedRegionKey: "부산광역시-사하구",
    snapshots: [
      { region_key: "부산광역시-사하구", metrics_as_of: "2026-05-01", fetched_at: "2026-07-19T00:00:00Z" },
      { region_key: "부산광역시-사하구", metrics_as_of: "2026-05-01", fetched_at: "2026-07-28T00:00:00Z" }
    ],
    now: new Date("2026-07-31T00:00:00Z")
  });

  assert.deepEqual(result.selected_region, {
    region_key: "부산광역시-사하구",
    covered: true,
    latest_metrics_as_of: "2026-05-01",
    latest_fetched_at: "2026-07-28T00:00:00Z",
    freshness: "aging",
    age_days: 91,
    snapshot_count: 2
  });
});
