"use strict";

const crypto = require("node:crypto");
const snapshotContract = require("./region-source-snapshot-core.js");

const SCHEMA_VERSION = 1;
const LEDGER_KEYS = ["schema_version", "snapshots"];

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function hasExactKeys(value, keys) {
  return isObject(value) && Object.keys(value).sort().join("\u0000") === [...keys].sort().join("\u0000");
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (isObject(value)) return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
  return JSON.stringify(value);
}

function snapshotFingerprint(snapshot) {
  snapshotContract.validateSnapshot(snapshot);
  return crypto.createHash("sha256").update(canonicalJson(snapshot), "utf8").digest("hex");
}

function validateLedger(ledger) {
  if (!hasExactKeys(ledger, LEDGER_KEYS) || ledger.schema_version !== SCHEMA_VERSION || !Array.isArray(ledger.snapshots)) throw new Error("source ledger must contain schema_version 1 and snapshots");
  const seen = new Set();
  for (const item of ledger.snapshots) {
    snapshotContract.validateSnapshot(item);
    if (seen.has(item.snapshot_id)) throw new Error(`duplicate snapshot_id in ledger: ${item.snapshot_id}`);
    seen.add(item.snapshot_id);
  }
  return true;
}

function appendSnapshot(ledger, snapshot) {
  validateLedger(ledger);
  const next = snapshotContract.buildSnapshot(snapshot);
  const existing = ledger.snapshots.find((item) => item.snapshot_id === next.snapshot_id);
  if (existing) {
    if (snapshotFingerprint(existing) !== snapshotFingerprint(next)) throw new Error(`snapshot_id collision: append-only ledger refuses replacement (${next.snapshot_id})`);
    return clone(ledger);
  }
  return { schema_version: SCHEMA_VERSION, snapshots: [...clone(ledger.snapshots), next] };
}

function selectCurrentProjection(ledger) {
  validateLedger(ledger);
  const current = new Map();
  for (const item of ledger.snapshots) {
    const key = snapshotContract.projectionKey(item);
    const existing = current.get(key);
    if (!existing || item.collected_at > existing.collected_at || (item.collected_at === existing.collected_at && item.snapshot_id > existing.snapshot_id)) current.set(key, item);
  }
  return [...current.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([, item]) => clone(item));
}

module.exports = { SCHEMA_VERSION, appendSnapshot, canonicalJson, selectCurrentProjection, snapshotFingerprint, validateLedger };
