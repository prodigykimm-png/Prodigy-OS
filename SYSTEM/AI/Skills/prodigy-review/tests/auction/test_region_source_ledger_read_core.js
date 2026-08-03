"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const ROOT = path.resolve(__dirname, "../../../../../..");
const bridge = require(path.join(ROOT, "SYSTEM/SCRIPTS/region-source-fixture-bridge-core.js"));
const expansion = require(path.join(ROOT, "SYSTEM/SCRIPTS/region-geography-expansion-core.js"));
const matrix = require(path.join(ROOT, "SYSTEM/SCRIPTS/region-provider-support-matrix-core.js")).loadMatrix();
const snapshot = require(path.join(ROOT, "SYSTEM/SCRIPTS/region-source-snapshot-core.js"));
const reader = require(path.join(ROOT, "SYSTEM/SCRIPTS/region-source-ledger-read-core.js"));

const TIMES = Object.freeze({
  period: "2026-05",
  published_at: "2026-06-20T00:00:00.000Z",
  first_seen_at: "2026-08-03T00:00:00.000Z",
  collected_at: "2026-08-03T00:00:01.000Z"
});
const FIXTURE = path.join(ROOT, "SYSTEM/AI/Skills/prodigy-review/tests/fixtures/region-intelligence/mois_jumin_statmonth_csv/2026-05-households.csv");
const RAW = fs.readFileSync(FIXTURE);

function rawHash(value) { return crypto.createHash("sha256").update(value).digest("hex"); }

function entryFor(sourceSnapshot, providerDirectory = sourceSnapshot.provider_id, rawBytes = RAW) {
  const snapshotPath = `SYSTEM/CACHE/region-source-ledger/${providerDirectory}/${sourceSnapshot.source_dataset_id}/${sourceSnapshot.snapshot_id}/snapshot.json`;
  return {
    snapshot: { path: snapshotPath, body: JSON.stringify(sourceSnapshot) },
    raw: { path: reader.rawPath(snapshotPath, sourceSnapshot.raw_path), body: rawBytes }
  };
}

function fixtureSnapshot() {
  const loaded = bridge.loadMoisFixtureSnapshots(TIMES);
  return loaded.snapshots.find((item) => item.geography.sigungu_code === "26350");
}

function blockedSnapshot() {
  const base = fixtureSnapshot();
  const raw = Buffer.from("blocked-source", "utf8");
  return snapshot.buildSnapshot({
    ...base,
    snapshot_id: "molit-apt-sale-2026-05-26350-blocked",
    provider_id: "molit_apt_sale",
    source_dataset_id: "15126469",
    property_type: "apartment",
    raw_path: "raw/blocked.csv",
    raw_payload_hash: rawHash(raw),
    measures: { sale_volume_3m: { value: 2, unit: "건" } }
  });
}

test("Given a persisted MOIS snapshot and raw payload, When the ledger is read, Then verified source evidence is connected to the matching Region", async () => {
  const readyEntry = entryFor(fixtureSnapshot());
  const parsed = reader.parseSnapshotEntries([readyEntry.snapshot]);
  const model = await reader.buildReadModel({
    records: parsed.records,
    errors: parsed.errors,
    raw_entries: [readyEntry.raw],
    support_matrix: matrix,
    region_registry: expansion.loadRegistry().regions
  });

  assert.equal(model.status, "ready");
  assert.equal(model.ready_count, 1);
  assert.equal(model.invalid_count, 0);
  assert.equal(model.evidence_by_region["부산광역시-해운대구"][0].reference_period, "2026-05");
  assert.equal(model.evidence_by_region["부산광역시-해운대구"][0].status, "verified");
});

test("Given a blocked provider snapshot, When the ledger is read, Then verified data remains visible only as blocked and never becomes Region evidence", async () => {
  const blocked = blockedSnapshot();
  const entry = entryFor(blocked, blocked.provider_id, Buffer.from("blocked-source", "utf8"));
  const parsed = reader.parseSnapshotEntries([entry.snapshot]);
  const model = await reader.buildReadModel({
    records: parsed.records,
    errors: parsed.errors,
    raw_entries: [entry.raw],
    support_matrix: matrix,
    region_registry: expansion.loadRegistry().regions
  });

  assert.equal(model.status, "blocked");
  assert.equal(model.ready_count, 0);
  assert.equal(model.blocked_count, 1);
  assert.deepEqual(model.evidence_by_region, {});
});

test("Given a newer blocked provider generation beside ready MOIS data, When readiness is summarized, Then the displayed period comes from ready data only", async () => {
  const readyEntry = entryFor(fixtureSnapshot());
  const blocked = blockedSnapshot();
  const newerBlocked = snapshot.buildSnapshot({ ...blocked, snapshot_id: "molit-apt-sale-2026-07-26350-blocked", reference_period: "2026-07", valid_time: "2026-07-01", collected_at: "2026-08-03T00:00:02.000Z" });
  const blockedEntry = entryFor(newerBlocked, newerBlocked.provider_id, Buffer.from("blocked-source", "utf8"));
  const parsed = reader.parseSnapshotEntries([readyEntry.snapshot, blockedEntry.snapshot]);
  const model = await reader.buildReadModel({
    records: parsed.records,
    errors: parsed.errors,
    raw_entries: [readyEntry.raw, blockedEntry.raw],
    support_matrix: matrix,
    region_registry: expansion.loadRegistry().regions
  });

  assert.equal(model.status, "ready");
  assert.equal(model.latest_reference_period, "2026-05");
  assert.equal(model.ready_count, 1);
  assert.equal(model.blocked_count, 1);
});

test("Given a tampered raw payload, When the ledger is read, Then the source is rejected before Region evidence is built", async () => {
  const entry = entryFor(fixtureSnapshot(), "mois_jumin_statmonth_csv", Buffer.from("tampered", "utf8"));
  const parsed = reader.parseSnapshotEntries([entry.snapshot]);
  const model = await reader.buildReadModel({
    records: parsed.records,
    errors: parsed.errors,
    raw_entries: [entry.raw],
    support_matrix: matrix,
    region_registry: expansion.loadRegistry().regions
  });

  assert.equal(model.ready_count, 0);
  assert.equal(model.invalid_count, 1);
  assert.equal(model.errors[0].code, "raw_hash_mismatch");
  assert.deepEqual(model.evidence_by_region, {});
});

console.log("Region source ledger read tests loaded");
