#!/usr/bin/env node
"use strict";

/**
 * Quarantines invalid seoul-metro transit projections from Region Objects.
 *
 * Safety contract:
 * - dry-run by default; --execute is required to write.
 * - preflight validates ALL targets before any write occurs.
 * - backups are created for every target before mutation.
 * - atomic writes with fsync ensure crash safety.
 * - rollback restores all applied targets on any failure.
 * - only the content between the exactly-one AUTO:REGION_TRANSIT markers changes.
 * - only a block headed "### 서울교통공사 확인 역" is eligible.
 * - every original is saved under SYSTEM/CACHE/region-transit/quarantine before write.
 * - zero network dispatch.
 */

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const OBJECT_ROOT_REL = "PARA/RESOURCES/Auction Regions";
const BACKUP_ROOT_REL = "SYSTEM/CACHE/region-transit/quarantine";
const START = "<!-- AUTO:REGION_TRANSIT:START -->";
const END = "<!-- AUTO:REGION_TRANSIT:END -->";
const SEOUL_HEADING = "### 서울교통공사 확인 역";
const NETWORK_ALLOWED = false;

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function count(value, needle) {
  return value.split(needle).length - 1;
}

function atomicWrite(target, content) {
  const temp = `${target}.tmp-${process.pid}-${Date.now()}`;
  let fd;
  try {
    fd = fs.openSync(temp, "wx", fs.statSync(target).mode);
    fs.writeFileSync(fd, content, "utf8");
    fs.fsyncSync(fd);
    fs.closeSync(fd);
    fd = undefined;
    fs.renameSync(temp, target);
  } catch (error) {
    if (fd !== undefined) try { fs.closeSync(fd); } catch (_ignored) { /* no-op */ }
    if (fs.existsSync(temp)) try { fs.unlinkSync(temp); } catch (_ignored) { /* no-op */ }
    throw error;
  }
}

function quarantineContent(original) {
  if (count(original, START) !== 1 || count(original, END) !== 1) {
    throw new Error("AUTO:REGION_TRANSIT marker pair must occur exactly once");
  }
  const startIndex = original.indexOf(START) + START.length;
  const endIndex = original.indexOf(END);
  if (endIndex < startIndex) throw new Error("AUTO:REGION_TRANSIT marker order is invalid");
  const inner = original.slice(startIndex, endIndex);
  if (!inner.includes(SEOUL_HEADING)) throw new Error("not a seoul-metro transit block");
  const next = original.slice(0, startIndex) + "\n" + original.slice(endIndex);
  return { next, inner };
}

function parseArgs(argv) {
  const options = { vaultRoot: process.cwd(), execute: false };
  for (let i = 0; i < argv.length; i += 1) {
    const key = argv[i];
    if (key === "--execute") { options.execute = true; continue; }
    const value = argv[i + 1];
    if (key !== "--vault" || value === undefined) throw new Error(`unsupported argument: ${key}`);
    options.vaultRoot = value;
    i += 1;
  }
  return options;
}

function quarantine(options) {
  const vaultRoot = fs.realpathSync(path.resolve(options.vaultRoot));
  const objectRoot = path.join(vaultRoot, OBJECT_ROOT_REL);
  const backupRoot = path.join(vaultRoot, BACKUP_ROOT_REL);

  // Preflight: verify object root exists
  if (!fs.existsSync(objectRoot)) {
    return { dry_run: !options.execute ? true : false, total: 0, targets: [], note: "object root not found: " + OBJECT_ROOT_REL };
  }

  const candidates = fs.readdirSync(objectRoot)
    .filter((name) => name.endsWith(".md"))
    .map((name) => path.join(objectRoot, name));

  // Phase 1: Preflight — validate ALL targets before any write
  const preflight = [];
  for (const targetPath of candidates) {
    const original = fs.readFileSync(targetPath, "utf8");
    if (!original.includes(SEOUL_HEADING)) continue;
    const { next, inner } = quarantineContent(original);
    preflight.push({ targetPath, original, next, inner, original_sha256: sha256(original), next_sha256: sha256(next) });
  }

  if (!options.execute) {
    return {
      dry_run: true,
      network_dispatched: 0,
      total: preflight.length,
      targets: preflight.map((entry) => ({ file: path.basename(entry.targetPath), original_sha256: entry.original_sha256, next_sha256: entry.next_sha256 }))
    };
  }

  // Phase 2: Backup — save all originals before mutation
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const runRoot = path.join(backupRoot, stamp);
  fs.mkdirSync(runRoot, { recursive: true });

  for (const entry of preflight) {
    const backupPath = path.join(runRoot, path.basename(entry.targetPath));
    fs.writeFileSync(backupPath, entry.original, "utf8");
  }

  // Phase 3: Atomic writes with rollback
  const applied = [];
  try {
    for (const entry of preflight) {
      atomicWrite(entry.targetPath, entry.next);
      if (fs.readFileSync(entry.targetPath, "utf8") !== entry.next) throw new Error(`post-write verification failed: ${entry.targetPath}`);
      applied.push(entry);
    }
  } catch (error) {
    // Phase 4: Rollback on failure
    const rollbackFailures = [];
    for (const entry of applied.reverse()) {
      try { atomicWrite(entry.targetPath, entry.original); } catch (rollbackError) { rollbackFailures.push(`${path.basename(entry.targetPath)}: ${rollbackError.message}`); }
    }
    const rollback = rollbackFailures.length ? "rollback_partial" : "rollback_completed";
    throw new Error(`${error.message}; ${rollback}${rollbackFailures.length ? ` (${rollbackFailures.join("; ")})` : ""}`);
  }

  fs.writeFileSync(path.join(runRoot, "manifest.json"), JSON.stringify({
    created_at: new Date().toISOString(),
    reason: "서울·경기 transit crosswalk provenance quarantine",
    network_dispatched: 0,
    files: preflight.map((entry) => ({ file: path.basename(entry.targetPath), original_sha256: entry.original_sha256, next_sha256: entry.next_sha256 }))
  }, null, 2));
  return { dry_run: false, total: preflight.length, backup_path: path.relative(vaultRoot, runRoot), status: "quarantined", network_dispatched: 0 };
}

if (require.main === module) {
  try { process.stdout.write(`${JSON.stringify(quarantine(parseArgs(process.argv.slice(2)), null, 2))}\n`); }
  catch (error) { process.stderr.write(`${error.stack || error.message}\n`); process.exitCode = 1; }
}

module.exports = Object.freeze({ quarantineContent, quarantine, sha256, atomicWrite, NETWORK_ALLOWED });
