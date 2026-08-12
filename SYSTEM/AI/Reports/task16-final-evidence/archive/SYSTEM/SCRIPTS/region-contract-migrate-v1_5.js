#!/usr/bin/env node
"use strict";

/**
 * region-contract-migrate-v1_5.js
 * Adds AUTO:REGION_TRANSIT empty marker to all registered Region Objects.
 * Contract: SYSTEM/docs/Region_Property_Contract_v1.md §AUTO:REGION_TRANSIT
 *
 * dry-run only by default. --execute required for actual writes.
 * --all applies to all 4 manifests (83 regions).
 * --sido restricts to a single province.
 *
 * Safety: preflight all files before any write; rollback on failure.
 */

const fs = require("node:fs");
const path = require("node:path");
const registryCore = require("./region-metrics-registry-core.js");

const REGISTRY_REL = "SYSTEM/SCRIPTS/region-metrics-manifest-index.json";
const OBJECT_ROOT_REL = "PARA/RESOURCES/Auction Regions";
const TRANSIT_START = "<!-- AUTO:REGION_TRANSIT:START -->";
const TRANSIT_END = "<!-- AUTO:REGION_TRANSIT:END -->";
const TRANSPORT_START = "<!-- AI:PENDING:TRANSPORT_LIFE:START -->";

function inside(root, target) {
  const relative = path.relative(root, target);
  return relative !== "" && !relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative);
}

function atomicWrite(targetPath, content) {
  const temporary = `${targetPath}.tmp-${process.pid}-${Date.now()}`;
  let descriptor;
  try {
    descriptor = fs.openSync(temporary, "wx", fs.statSync(targetPath).mode);
    fs.writeFileSync(descriptor, content, "utf8");
    fs.fsyncSync(descriptor);
    fs.closeSync(descriptor);
    descriptor = undefined;
    fs.renameSync(temporary, targetPath);
  } catch (error) {
    if (descriptor !== undefined) try { fs.closeSync(descriptor); } catch (_e) { /* best effort */ }
    if (fs.existsSync(temporary)) try { fs.unlinkSync(temporary); } catch (_e) { /* best effort */ }
    throw error;
  }
}

function assertOne(content, marker, label) {
  const count = content.split(marker).length - 1;
  if (count !== 1) throw new Error(`${label} 마커가 ${count}개 있습니다 (1개여야 함).`);
}

function migrateContent(original) {
  if (original.includes(TRANSIT_START)) {
    assertOne(original, TRANSIT_START, "AUTO:REGION_TRANSIT:START");
    assertOne(original, TRANSIT_END, "AUTO:REGION_TRANSIT:END");
    const startIdx = original.indexOf(TRANSIT_START);
    const endIdx = original.indexOf(TRANSIT_END);
    const body = original.slice(startIdx + TRANSIT_START.length, endIdx).trim();
    if (body.length > 0) throw new Error("AUTO:REGION_TRANSIT 블록이 이미 채워져 있습니다.");
    return original;
  }
  assertOne(original, TRANSPORT_START, "AI:PENDING:TRANSPORT_LIFE:START");
  const insertAt = original.indexOf(TRANSPORT_START);
  const marker = `\n\n${TRANSIT_START}\n${TRANSIT_END}\n`;
  return original.slice(0, insertAt) + marker + original.slice(insertAt);
}

function migrateRegions(options) {
  const vaultRoot = fs.realpathSync(path.resolve(options.vaultRoot ?? process.cwd()));
  const objectRoot = path.join(vaultRoot, OBJECT_ROOT_REL);
  if (!fs.existsSync(objectRoot)) throw new Error(`Region Object 폴더가 없습니다: ${objectRoot}`);

  const registryPath = path.join(vaultRoot, REGISTRY_REL);
  const indexJson = fs.readFileSync(registryPath, "utf8");
  const index = JSON.parse(indexJson);

  const scriptsDir = path.join(vaultRoot, "SYSTEM/SCRIPTS");
  const manifestsByPath = {};
  for (const entry of index.manifests) {
    const manifestPath = path.join(scriptsDir, entry.manifest_path);
    manifestsByPath[entry.manifest_path] = fs.readFileSync(manifestPath, "utf8");
  }
  const registry = registryCore.loadRegistry(indexJson, manifestsByPath);

  let regions = registry.regions;
  if (options.sido) {
    regions = regions.filter(r => r.sido === options.sido);
  }

  // Phase 1: Preflight — validate all files before any write
  const preflight = [];
  const realObjectRoot = fs.realpathSync(objectRoot);
  let hasSkipped = false;

  for (const region of regions) {
    const nfcFile = region.region_key.normalize("NFC") + ".md";
    const nfdFile = region.region_key.normalize("NFD") + ".md";
    const nfcPath = path.join(objectRoot, nfcFile);
    const nfdPath = path.join(objectRoot, nfdFile);
    let targetPath;
    if (fs.existsSync(nfcPath)) targetPath = nfcPath;
    else if (fs.existsSync(nfdPath)) targetPath = nfdPath;
    else {
      preflight.push({ region_key: region.region_key, file: null, status: "skipped", reason: "Object not found" });
      hasSkipped = true;
      continue;
    }
    const realTarget = fs.realpathSync(targetPath);
    if (!inside(realObjectRoot, realTarget)) {
      preflight.push({ region_key: region.region_key, file: path.basename(targetPath), status: "skipped", reason: "Object outside allowed root" });
      hasSkipped = true;
      continue;
    }
    try {
      const original = fs.readFileSync(targetPath, "utf8");
      const migrated = migrateContent(original);
      preflight.push({
        region_key: region.region_key,
        file: path.basename(targetPath),
        targetPath,
        original,
        migrated,
        changed: migrated !== original,
        status: "ok"
      });
    } catch (error) {
      preflight.push({ region_key: region.region_key, file: path.basename(targetPath), status: "error", error: error.message });
    }
  }

  const preflightErrors = preflight.filter(r => r.status === "error" || r.status === "skipped");
  if (preflightErrors.length > 0) {
    return {
      dry_run: !options.execute,
      phase: "preflight_failed",
      total: regions.length,
      errors: preflightErrors.length,
      results: preflight.map(r => ({ region_key: r.region_key, file: r.file, status: r.status, error: r.error }))
    };
  }

  // Phase 2: Execute (only if --execute and no preflight errors)
  if (options.execute) {
    const written = [];
    for (const item of preflight) {
      if (item.status !== "ok" || !item.changed) continue;
      try {
        atomicWrite(item.targetPath, item.migrated);
        written.push(item.region_key);
      } catch (error) {
        let rollbackSuccess = true;
        const rollbackResults = [];
        for (const rolledBack of written) {
          const prev = preflight.find(p => p.region_key === rolledBack);
          if (prev) {
            try { atomicWrite(prev.targetPath, prev.original); rollbackResults.push({region_key: rolledBack, status: "reverted"}); }
            catch (_e) { rollbackSuccess = false; rollbackResults.push({region_key: rolledBack, status: "rollback_failed"}); }
          }
        }
        return {
          dry_run: false,
          phase: rollbackSuccess ? "rollback_completed" : "rollback_partial",
          total: regions.length,
          written_before_failure: written.length,
          failed_at: item.region_key,
          error: error.message,
          rollback_results: rollbackResults,
          results: preflight.map(p => ({
            region_key: p.region_key,
            file: p.file,
            status: p.region_key === item.region_key ? "failed" : written.includes(p.region_key) ? "rolled_back" : p.status
          }))
        };
      }
    }
  }

  return {
    dry_run: !options.execute,
    phase: "complete",
    execute: Boolean(options.execute),
    total: regions.length,
    migrated: preflight.filter(r => r.changed).length,
    noop: preflight.filter(r => r.status === "ok" && !r.changed).length,
    errors: 0,
    skipped: preflight.filter(r => r.status === "skipped").length,
    results: preflight.map(r => ({
      region_key: r.region_key,
      file: r.file,
      status: r.changed ? "migrated" : "noop",
      execute: Boolean(options.execute)
    }))
  };
}

function parseArgs(argv) {
  const options = { vaultRoot: process.cwd(), execute: false };
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    if (key === "--execute") { options.execute = true; continue; }
    if (key === "--all") { continue; }
    const value = argv[index + 1];
    if (!key.startsWith("--") || value === undefined) throw new Error(`인자는 --key value 형식이어야 합니다: ${key}`);
    index += 1;
    if (key === "--vault") options.vaultRoot = value;
    else if (key === "--sido") options.sido = value;
    /* --all handled above */
    else throw new Error(`지원하지 않는 인자입니다: ${key}`);
  }
  return options;
}

function main() {
  const result = migrateRegions(parseArgs(process.argv.slice(2)));
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

if (require.main === module) {
  try { main(); } catch (error) {
    process.stderr.write(`${error.stack ?? error.message}\n`);
    process.exitCode = 1;
  }
}

module.exports = Object.freeze({ migrateContent, migrateRegions, parseArgs });