"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");
const test = require("node:test");

const ROOT = path.resolve(__dirname, "../../../../../..");
const bridge = require(path.join(ROOT, "SYSTEM/SCRIPTS/region-source-fixture-bridge-core.js"));
const ledger = require(path.join(ROOT, "SYSTEM/SCRIPTS/region-source-ledger-core.js"));
const snapshot = require(path.join(ROOT, "SYSTEM/SCRIPTS/region-source-snapshot-core.js"));
const projection = require(path.join(ROOT, "SYSTEM/SCRIPTS/region-source-projection-gate-core.js"));

test("Given a ready MOIS source and a blocked transaction source, When projection is selected, Then only ready data reaches Region", () => {
  const loaded = bridge.loadMoisFixtureSnapshots({
    period: "2026-05",
    published_at: "2026-06-20T00:00:00.000Z",
    first_seen_at: "2026-08-03T00:00:00.000Z",
    collected_at: "2026-08-03T00:00:01.000Z"
  });
  let state = { schema_version: 1, snapshots: loaded.snapshots };
  const blocked = snapshot.buildSnapshot({
    schema_version: 1,
    snapshot_id: "molit-2026-05-11110-aaaaaaaa-20260803000001",
    provider_id: "molit_apt_sale",
    source_dataset_id: "15126469",
    property_type: "apartment",
    geography: loaded.snapshots[0].geography,
    reference_period: "2026-05",
    coverage_level: "sigungu",
    missingness_code: "none",
    valid_time: "2026-05-01",
    published_at: "2026-06-20T00:00:00.000Z",
    first_seen_at: "2026-08-03T00:00:00.000Z",
    collected_at: "2026-08-03T00:00:01.000Z",
    revision_type: "initial",
    methodology_version: "1.0.0",
    raw_path: "raw/molit-apt-sale.json",
    raw_payload_hash: "a".repeat(64),
    measures: { sale_volume_3m: { value: 12, unit: "건" } }
  });
  state = ledger.appendSnapshot(state, blocked);
  assert.equal(ledger.selectCurrentProjection(state).length, 42);
  const ready = projection.selectReadyProjection(state);
  assert.equal(ready.length, 41);
  assert.equal(new Set(ready.map((item) => item.provider_id)).size, 1);
  assert.equal(ready[0].provider_id, "mois_jumin_statmonth_csv");
});

test("Given an invalid support matrix, When the projection gate runs, Then it fails closed", () => {
  const matrix = require(path.join(ROOT, "SYSTEM/SCRIPTS/region-provider-support-matrix-core.js")).loadMatrix();
  const invalid = structuredClone(matrix);
  invalid.providers[0].projection_ready = false;
  invalid.providers[0].status = "pilot_ready";
  assert.throws(() => projection.selectReadyProjection({ schema_version: 1, snapshots: [] }, invalid), /support matrix|ready|projection/iu);
});

console.log("Region source projection gate tests loaded");
