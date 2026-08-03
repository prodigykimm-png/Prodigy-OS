"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const test = require("node:test");

const ROOT = path.resolve(__dirname, "../../../../../..");
const CLI_PATH = path.join(ROOT, "SYSTEM/SCRIPTS/region-source-mois-collect.js");
const cli = require(CLI_PATH);

const BASE = Object.freeze({ period: "2026-05", published_at: "2026-06-20T00:00:00.000Z", registry: "expansion", ledger_root: "/tmp/prodigy-test-ledger" });

test("Given CLI arguments, When parsed, Then network and registry are explicit options", () => {
  const parsed = cli.parseArgs(["--period", "2026-05", "--published-at", "2026-06-20T00:00:00.000Z", "--allow-network", "--registry", "pilot", "--dry-run"]);
  assert.equal(parsed.period, "2026-05");
  assert.equal(parsed.allow_network, true);
  assert.equal(parsed.registry, "pilot");
  assert.equal(parsed.dry_run, true);
  assert.throws(() => cli.parseArgs(["--period", "2026-05", "--published-at", "2026-06-20T00:00:00.000Z", "--unknown"]), /알 수 없는 옵션/);
});

test("Given default CLI execution, When run is called without allow_network, Then the collector is not dispatched and writer is not called", async () => {
  let persistCalled = false;
  const result = await cli.run(BASE, {
    collect: async (options) => {
      assert.equal(options.allow_network, false);
      return { status: "network_opt_in_required", network_dispatched: false, request_count: 0, snapshots: [], raw_payload_hash: null, error: "opt-in" };
    },
    persist: () => { persistCalled = true; }
  });
  assert.equal(result.exit_code, 2);
  assert.equal(result.summary.persistence_status, "not_persisted");
  assert.equal(persistCalled, false);
});

test("Given a collected result, When CLI run is not dry-run, Then the selected registry and ledger root reach the writer", async () => {
  let received = null;
  const result = await cli.run(Object.assign({}, BASE, { allow_network: true }), {
    collect: async (options) => {
      assert.equal(options.geography_registry.regions.length, 83);
      return { status: "collected", network_dispatched: true, request_count: 1, snapshots: [{ snapshot_id: "snapshot" }], raw_payload_hash: "hash", parser_result: { rows: [1] }, error: null };
    },
    persist: (root, collected) => {
      received = { root, collected };
      return { status: "persisted", written_count: 1, existing_count: 0 };
    }
  });
  assert.equal(result.exit_code, 0);
  assert.equal(received.root, BASE.ledger_root);
  assert.equal(received.collected.status, "collected");
  assert.equal(result.summary.written_count, 1);
});

test("Given dry-run, When a collection succeeds, Then the writer is skipped", async () => {
  let persistCalled = false;
  const result = await cli.run(Object.assign({}, BASE, { allow_network: true, dry_run: true }), {
    collect: async () => ({ status: "collected", network_dispatched: true, request_count: 1, snapshots: [], raw_payload_hash: "hash", error: null }),
    persist: () => { persistCalled = true; return { status: "persisted", written_count: 1, existing_count: 0 }; }
  });
  assert.equal(result.exit_code, 0);
  assert.equal(result.summary.persistence_status, "not_persisted");
  assert.equal(persistCalled, false);
});

test("Given the executable CLI without opt-in, When invoked, Then it exits without creating the ledger root", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "prodigy-mois-cli-"));
  const ledgerRoot = path.join(root, "ledger");
  try {
    const result = spawnSync(process.execPath, [CLI_PATH, "--period", "2026-05", "--published-at", "2026-06-20T00:00:00.000Z", "--ledger-root", ledgerRoot], { cwd: ROOT, encoding: "utf8" });
    assert.equal(result.status, 2);
    const summary = JSON.parse(result.stdout.trim());
    assert.equal(summary.status, "network_opt_in_required");
    assert.equal(summary.network_dispatched, false);
    assert.equal(fs.existsSync(ledgerRoot), false);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

console.log("MOIS source CLI tests loaded");
