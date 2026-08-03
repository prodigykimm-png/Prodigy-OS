"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const ledgerCore = require("./region-source-ledger-core.js");
const snapshotCore = require("./region-source-snapshot-core.js");

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function resolveInside(root, relativePath) {
  const base = path.resolve(root);
  const target = path.resolve(base, relativePath);
  if (target !== base && !target.startsWith(`${base}${path.sep}`)) throw new Error("ledger path escapes its configured root");
  return target;
}

function atomicWrite(filePath, bytes) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const temporary = path.join(path.dirname(filePath), `.${path.basename(filePath)}.${process.pid}.${crypto.randomBytes(6).toString("hex")}.tmp`);
  try {
    fs.writeFileSync(temporary, bytes, { flag: "wx" });
    fs.renameSync(temporary, filePath);
  } catch (error) {
    if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
    throw error;
  }
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeSnapshot(root, snapshot, rawPayload) {
  snapshotCore.validateSnapshot(snapshot);
  if (!Buffer.isBuffer(rawPayload)) throw new Error("source ledger raw payload must be a Buffer");
  const actualHash = sha256(rawPayload);
  if (actualHash !== snapshot.raw_payload_hash) throw new Error(`raw payload hash mismatch for ${snapshot.snapshot_id}`);

  const snapshotDirectory = resolveInside(root, path.join(snapshot.provider_id, snapshot.source_dataset_id, snapshot.snapshot_id));
  const snapshotFile = resolveInside(snapshotDirectory, "snapshot.json");
  let snapshotCreated = false;
  if (fs.existsSync(snapshotFile)) {
    const existing = readJson(snapshotFile);
    if (ledgerCore.snapshotFingerprint(existing) !== ledgerCore.snapshotFingerprint(snapshot)) throw new Error(`snapshot_id collision: existing ledger differs (${snapshot.snapshot_id})`);
  } else {
    atomicWrite(snapshotFile, Buffer.from(`${JSON.stringify(snapshot, null, 2)}\n`, "utf8"));
    snapshotCreated = true;
  }

  const rawFile = resolveInside(snapshotDirectory, snapshot.raw_path);
  let rawCreated = false;
  if (fs.existsSync(rawFile)) {
    if (sha256(fs.readFileSync(rawFile)) !== snapshot.raw_payload_hash) throw new Error(`raw file collision: existing bytes differ (${snapshot.snapshot_id})`);
  } else {
    atomicWrite(rawFile, rawPayload);
    rawCreated = true;
  }
  return Object.freeze({ snapshot_id: snapshot.snapshot_id, snapshot_created: snapshotCreated, raw_created: rawCreated, snapshot_path: snapshotFile, raw_path: rawFile });
}

function persistCollectedResult(root, result) {
  if (!result || result.status !== "collected") return Object.freeze({ status: "not_persisted", reason: result?.status || "missing_result", written_count: 0, existing_count: 0, entries: [] });
  if (!Array.isArray(result.snapshots) || !Buffer.isBuffer(result.raw_payload)) throw new Error("collected source result needs snapshots and raw_payload");
  const entries = result.snapshots.map((snapshot) => writeSnapshot(root, snapshot, result.raw_payload));
  return Object.freeze({
    status: "persisted",
    written_count: entries.filter((entry) => entry.snapshot_created || entry.raw_created).length,
    existing_count: entries.filter((entry) => !entry.snapshot_created && !entry.raw_created).length,
    entries
  });
}

module.exports = Object.freeze({
  atomicWrite,
  persistCollectedResult,
  resolveInside,
  sha256,
  writeSnapshot
});
