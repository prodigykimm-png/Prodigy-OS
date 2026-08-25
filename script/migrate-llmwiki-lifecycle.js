#!/usr/bin/env node
"use strict";

const path = require("node:path");
const migration = require(path.join(__dirname, "..", "SYSTEM", "Views", "llmwiki-lifecycle-migration.js"));
const flows = require(path.join(__dirname, "..", "SYSTEM", "Views", "llmwiki-lifecycle-migration-flows.js"));

function fail(reason) {
  process.stdout.write(`${JSON.stringify({ ok: false, reason, zero_writes: true })}\n`);
  process.exit(2);
}

const KNOWN_FLAGS = new Set(["--vault-path", "--inventory", "--dry-run"]);
const seen = new Map();
for (let index = 2; index < process.argv.length; index += 1) {
  const flag = process.argv[index];
  if (!KNOWN_FLAGS.has(flag)) fail("unknown_flag");
  if (seen.has(flag)) fail("ambiguous_flag");
  seen.set(flag, flag === "--vault-path" ? process.argv[++index] : true);
  if (flag === "--vault-path" && !seen.get(flag)) fail("vault_path_required");
}
if (!seen.has("--vault-path")) fail("vault_path_required");
const inventoryFlag = seen.has("--inventory");
const dryRunFlag = seen.has("--dry-run");
if (inventoryFlag !== dryRunFlag) fail("incomplete_mode");

const inventory = migration.buildInventory({ vault_root: path.resolve(seen.get("--vault-path")) });
if (!inventory.ok) {
  process.stdout.write(`${JSON.stringify({ ok: false, reason: inventory.reason, detail: inventory.path || null, zero_writes: true })}\n`);
  process.exit(2);
}

const BOUND_SNAPSHOT = Object.freeze({ knowledge: 24, candidate: 3, literature: 4 });
const bound = flows.compareWithBoundSnapshot(inventory, BOUND_SNAPSHOT);

process.stdout.write(`${JSON.stringify({
  ok: true,
  mode: "inventory_dry_run",
  inventory_digest: inventory.digest,
  total_items: inventory.total_items,
  counts: inventory.counts,
  items: inventory.items.map((item) => ({
    path: item.path,
    lifecycle_class: item.lifecycle_class,
    disposition: item.disposition,
    quarantine_reason: item.quarantine_reason,
    bytes: item.bytes,
    revision: item.revision,
    mtime_ms: item.mtime_ms,
    sha256: item.sha256,
  })),
  zero_writes: true,
  bound_snapshot: { expected_counts: BOUND_SNAPSHOT, status: bound.ok ? "matched" : "inventory_drift", observed_counts: bound.observed_counts || inventory.counts },
})}\n`);
