"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");
const test = require("node:test");

const ROOT = path.resolve(__dirname, "../../../../../..");
const FIXTURE_BASE = path.join(ROOT, "SYSTEM/AI/Skills/prodigy-review/tests/fixtures/region-intelligence/reb_rone_public_table");
const bridge = require(path.join(ROOT, "SYSTEM/SCRIPTS/region-source-rone-fixture-bridge-core.js"));
const gate = require(path.join(ROOT, "SYSTEM/SCRIPTS/region-source-projection-gate-core.js"));

const TIMES = Object.freeze({
  published_at: "2026-06-20T00:00:00.000Z",
  first_seen_at: "2026-08-03T00:00:00.000Z",
  collected_at: "2026-08-03T00:00:01.000Z"
});

const FIXTURES = Object.freeze({
  price: { file: "2026-05-price-sahagu.json", sha256: "40dd9f8fdb6b955f664b8367f3afb91309de930d28f5277eaba66b6236478842" },
  jeonse: { file: "2026-05-jeonse-sahagu.json", sha256: "21953cc9241445b13ad7d06d5dce81c1c60942fd6ad87d274bc37b77f39f97fd" },
  volume: { file: "2026-03_05-volume-sahagu.json", sha256: "485a5f75a2d076992465ab7115514e2b08b31e597fa6663896e335aca69998a0" }
});

function options(kind, overrides = {}) {
  const fixture = FIXTURES[kind];
  return Object.assign({
    kind,
    fixture_path: path.join(FIXTURE_BASE, fixture.file),
    expected_sha256: fixture.sha256,
    ...TIMES
  }, overrides);
}

test("Given the verified R-ONE fixtures, When bridged, Then rows become exact Saha-gu source snapshots", () => {
  let ledger = { schema_version: 1, snapshots: [] };
  const price = bridge.appendRoneFixtureSnapshots(ledger, options("price"));
  ledger = price.ledger;
  const jeonse = bridge.appendRoneFixtureSnapshots(ledger, options("jeonse"));
  ledger = jeonse.ledger;
  const volume = bridge.appendRoneFixtureSnapshots(ledger, options("volume"));
  ledger = volume.ledger;

  assert.equal(price.snapshots.length, 1);
  assert.equal(jeonse.snapshots.length, 1);
  assert.equal(volume.snapshots.length, 3);
  assert.equal(volume.unmatched.length, 0);
  assert.equal(price.coverage.target_region_count, 83);
  assert.equal(price.coverage.matched_region_count, 1);
  assert.equal(price.coverage.complete, false);
  assert.equal(price.coverage.missing_region_keys.length, 82);
  assert.equal(ledger.snapshots.length, 5);
  for (const snapshot of ledger.snapshots) {
    assert.equal(snapshot.provider_id, "reb_rone_public_table");
    assert.equal(snapshot.geography.sido_code, "26");
    assert.equal(snapshot.geography.sigungu_code, "26380");
    assert.equal(snapshot.geography.name_current, "사하구");
    assert.equal(snapshot.raw_path.startsWith("raw/"), true);
    assert.match(snapshot.raw_payload_hash, /^[a-f0-9]{64}$/u);
  }
  assert.equal(price.snapshots[0].measures.price_index.value, 99.57008);
  assert.equal(jeonse.snapshots[0].measures.jeonse_ratio.value, 76.05634);
  assert.equal(volume.snapshots[0].measures.transaction_volume.unit, "건");
});

test("Given the expansion registry, When an exact nationwide label is supplied, Then the bridge resolves it without changing the pilot data", () => {
  const expansion = require(path.join(ROOT, "SYSTEM/SCRIPTS/region-geography-expansion-core.js")).loadRegistry();
  const resolved = bridge.resolveRegionLabel("경기도 수원시", expansion);
  assert.equal(resolved.status, "resolved");
  assert.equal(resolved.region.region_key, "경기도-수원시");
});

test("Given R-ONE raw snapshots, When the readiness gate runs, Then blocked provider data never reaches Region projection", () => {
  const result = bridge.appendRoneFixtureSnapshots({ schema_version: 1, snapshots: [] }, options("price"));
  const projection = gate.selectReadyProjection(result.ledger);
  assert.equal(projection.length, 0);
});

test("Given the same raw fixture at a later collection time, When appended, Then a new generation is retained", () => {
  const first = bridge.appendRoneFixtureSnapshots({ schema_version: 1, snapshots: [] }, options("price"));
  const second = bridge.appendRoneFixtureSnapshots(first.ledger, options("price", { collected_at: "2026-08-04T00:00:01.000Z" }));
  assert.equal(second.ledger.snapshots.length, 2);
  assert.equal(second.ledger.snapshots[0].snapshot_id === second.ledger.snapshots[1].snapshot_id, false);
  assert.equal(gate.selectReadyProjection(second.ledger).length, 0);
});

test("Given a changed fixture, When the bridge verifies the raw bytes, Then it stops before parsing", () => {
  assert.throws(() => bridge.appendRoneFixtureSnapshots({ schema_version: 1, snapshots: [] }, options("price", { expected_sha256: "0".repeat(64) })), /hash mismatch/);
});

test("Given an R-ONE row without an exact sido and sigungu token pair, When mapped, Then it is returned as an explicit unmatched warning", () => {
  const loaded = bridge.loadRoneFixture(options("price"));
  const built = bridge.buildRoneSnapshots({
    options: loaded.options,
    rawSha256: loaded.rawSha256,
    parsed: { rows: [{ region_label: "서부산권 사하구", month: "2026-05", measure: "price_index", value: 99, unit: "index" }] }
  });
  assert.equal(built.snapshots.length, 0);
  assert.deepEqual(built.unmatched[0], {
    region_label: "서부산권 사하구",
    status: "needs_selection",
    reason: "sido_sigungu_label_unresolved",
    month: "2026-05",
    measure: "price_index"
  });
});

console.log("R-ONE fixture bridge tests loaded");
