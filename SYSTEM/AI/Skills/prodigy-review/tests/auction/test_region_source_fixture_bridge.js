"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");
const test = require("node:test");

const ROOT = path.resolve(__dirname, "../../../../../..");
const bridge = require(path.join(ROOT, "SYSTEM/SCRIPTS/region-source-fixture-bridge-core.js"));
const ledger = require(path.join(ROOT, "SYSTEM/SCRIPTS/region-source-ledger-core.js"));
const snapshot = require(path.join(ROOT, "SYSTEM/SCRIPTS/region-source-snapshot-core.js"));

const FIXTURE_PATH = path.join(ROOT, "SYSTEM/AI/Skills/prodigy-review/tests/fixtures/region-intelligence/mois_jumin_statmonth_csv/2026-05-households.csv");
const FIXTURE_SHA256 = "576bf4419ddebd24da4b1c917269ed298f03bd6c413213c8b3e93599462d415a";
const TIMES = {
  published_at: "2026-06-20T00:00:00.000Z",
  first_seen_at: "2026-08-03T00:00:00.000Z",
  collected_at: "2026-08-03T00:00:01.000Z"
};

function options(overrides = {}) {
  return {
    fixture_path: FIXTURE_PATH,
    expected_sha256: FIXTURE_SHA256,
    period: "2026-05",
    ...TIMES,
    ...overrides
  };
}

test("Given the verified MOIS fixture, When it is bridged, Then Seoul and Busan produce 41 source snapshots", () => {
  const result = bridge.loadMoisFixtureSnapshots(options());
  assert.equal(result.provider_id, "mois_jumin_statmonth_csv");
  assert.equal(result.raw_payload_hash, FIXTURE_SHA256);
  assert.equal(result.snapshots.length, 41);
  assert.equal(result.parser_result.network_dispatched, false);
  assert.equal(result.snapshots.find((item) => item.geography.sigungu_code === "11110").measures.households.value, 72567);
  assert.equal(snapshot.projectionKey(result.snapshots.find((item) => item.geography.sigungu_code === "11110")), "mois_jumin_statmonth_csv|11110|all|2026-05");
  assert.equal(result.snapshots.every((item) => !snapshot.isNoData(item)), true);
});

test("Given a tampered or incorrectly declared fixture, When it is bridged, Then the raw hash gate stops conversion", () => {
  assert.throws(() => bridge.loadMoisFixtureSnapshots(options({ expected_sha256: "0".repeat(64) })), /hash mismatch/iu);
});

test("Given a parsed period with one missing sigungu row, When snapshots are built, Then the missing row is explicit no-data", () => {
  const loaded = bridge.loadMoisFixtureSnapshots(options());
  const parsed = {
    ...loaded.parser_result,
    rows: loaded.parser_result.rows.filter((row) => row.household_code !== "1111000000")
  };
  const result = bridge.buildMoisSnapshots({
    parsed,
    raw_payload_hash: "a".repeat(64),
    raw_path: "raw/2026-05-households.csv",
    period: "2026-05",
    ...TIMES
  });
  const missing = result.find((item) => item.geography.sigungu_code === "11110");
  assert.equal(missing.missingness_code, "not_available");
  assert.equal(snapshot.isNoData(missing), true);
  assert.deepEqual(missing.measures, {});
});

test("Given the same fixture at two collection times, When it is appended, Then both generations remain and only the newest projects", () => {
  const first = bridge.appendMoisFixtureSnapshots({ schema_version: 1, snapshots: [] }, options());
  const second = bridge.appendMoisFixtureSnapshots(first.ledger, options({ collected_at: "2026-08-04T00:00:01.000Z" }));
  assert.equal(first.ledger.snapshots.length, 41);
  assert.equal(second.ledger.snapshots.length, 82);
  assert.equal(ledger.selectCurrentProjection(second.ledger).length, 41);
  assert.equal(ledger.selectCurrentProjection(second.ledger)[0].collected_at, "2026-08-04T00:00:01.000Z");
});

console.log("Region source fixture bridge tests loaded");
