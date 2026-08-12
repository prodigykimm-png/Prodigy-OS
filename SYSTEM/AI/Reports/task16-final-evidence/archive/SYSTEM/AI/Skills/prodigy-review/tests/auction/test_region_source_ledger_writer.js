"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const ROOT = path.resolve(__dirname, "../../../../../..");
const live = require(path.join(ROOT, "SYSTEM/SCRIPTS/region-source-mois-live-core.js"));
const expansion = require(path.join(ROOT, "SYSTEM/SCRIPTS/region-geography-expansion-core.js"));
const writer = require(path.join(ROOT, "SYSTEM/SCRIPTS/region-source-ledger-writer-core.js"));

const FIXTURE_PATH = path.join(ROOT, "SYSTEM/AI/Skills/prodigy-review/tests/fixtures/region-intelligence/mois_jumin_statmonth_csv/2026-05-households.csv");
const FIXTURE_BYTES = fs.readFileSync(FIXTURE_PATH);
const TIMES = Object.freeze({
  published_at: "2026-06-20T00:00:00.000Z",
  first_seen_at: "2026-08-03T00:00:00.000Z",
  collected_at: "2026-08-03T00:00:01.000Z"
});

function collect(overrides = {}) {
  return live.collectMoisOfficial(Object.assign({
    period: "2026-05",
    allow_network: true,
    request: async () => ({ statusCode: 200, headers: {}, body: FIXTURE_BYTES }),
    geography_registry: expansion.loadRegistry()
  }, TIMES, overrides));
}

test("Given a collected MOIS result, When the ledger writer persists it, Then snapshot and raw files are created under the bounded root", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "prodigy-region-ledger-"));
  try {
    const result = await collect();
    const persisted = writer.persistCollectedResult(root, result);
    assert.equal(persisted.status, "persisted");
    assert.equal(persisted.written_count, 83);
    const first = persisted.entries[0];
    assert.equal(fs.existsSync(first.snapshot_path), true);
    assert.equal(fs.existsSync(first.raw_path), true);
    const snapshot = JSON.parse(fs.readFileSync(first.snapshot_path, "utf8"));
    assert.equal(snapshot.snapshot_id, first.snapshot_id);
    assert.equal(writer.sha256(fs.readFileSync(first.raw_path)), snapshot.raw_payload_hash);
    assert.equal(path.relative(root, first.snapshot_path).startsWith(".."), false);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("Given the same collected generation, When persistence runs twice, Then the second run is an idempotent no-op", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "prodigy-region-ledger-"));
  try {
    const result = await collect();
    assert.equal(writer.persistCollectedResult(root, result).written_count, 83);
    const second = writer.persistCollectedResult(root, result);
    assert.equal(second.written_count, 0);
    assert.equal(second.existing_count, 83);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("Given the same raw period collected at a later time, When persistence runs, Then the new generation is added without replacing the old one", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "prodigy-region-ledger-"));
  try {
    const first = await collect();
    const second = await collect({ collected_at: "2026-08-04T00:00:01.000Z" });
    writer.persistCollectedResult(root, first);
    const persisted = writer.persistCollectedResult(root, second);
    assert.equal(persisted.written_count, 83);
    const snapshotDirectories = [];
    for (const dataset of fs.readdirSync(path.join(root, "mois_jumin_statmonth_csv"))) {
      snapshotDirectories.push(...fs.readdirSync(path.join(root, "mois_jumin_statmonth_csv", dataset)));
    }
    assert.equal(snapshotDirectories.length, 166);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("Given an existing raw file with altered bytes, When persistence runs, Then it refuses replacement", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "prodigy-region-ledger-"));
  try {
    const result = await collect();
    const persisted = writer.persistCollectedResult(root, result);
    fs.writeFileSync(persisted.entries[0].raw_path, Buffer.from("tampered", "utf8"));
    assert.throws(() => writer.persistCollectedResult(root, result), /raw file collision/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("Given a failed provider result, When persistence runs, Then no source ledger files are created", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "prodigy-region-ledger-"));
  try {
    const result = writer.persistCollectedResult(root, { status: "failed", snapshots: [], raw_payload: Buffer.from("failure") });
    assert.deepEqual(result, { status: "not_persisted", reason: "failed", written_count: 0, existing_count: 0, entries: [] });
    assert.deepEqual(fs.readdirSync(root), []);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

console.log("Region source ledger writer tests loaded");
