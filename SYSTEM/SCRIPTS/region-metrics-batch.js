#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const registryCore = require("./region-metrics-registry-core.js");
const cacheRoot = require("./region-cache-root.js");

const REFRESH_SCRIPT = path.resolve(__dirname, "region-metrics-refresh.js");
const DEFAULT_MANIFEST = path.resolve(__dirname, "region-metrics-busan-manifest.json");
const VAULT_ROOT = path.resolve(__dirname, "..", "..");
const SHARED_CACHE_DIR = path.join(VAULT_ROOT, cacheRoot.LEGACY_METRICS_REL, "_shared");
const DEFAULT_STOCK_AS_OF = "2025-09";
const DEFAULT_SUPPLY_BASIS = "2025-12";
const DEFAULT_REGISTRY_INDEX = path.resolve(__dirname, "region-metrics-manifest-index.json");

function parseArgs(argv) {
  const options = {
    manifest: DEFAULT_MANIFEST,
    dryRun: false,
    execute: false,
    all: false,
    regionKey: null,
    sido: null,
    registry: DEFAULT_REGISTRY_INDEX,
    registrySpecified: false,
    manifestSpecified: false
  };
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    if (key === "--dry-run") { options.dryRun = true; continue; }
    if (key === "--execute") { options.execute = true; continue; }
    if (key === "--all") { options.all = true; continue; }
    const value = argv[index + 1];
    if (value === undefined) throw new Error(`인자값이 없습니다: ${key}`);
    index += 1;
    if (key === "--manifest") { options.manifest = value; options.manifestSpecified = true; }
    else if (key === "--registry") { options.registry = value; options.registrySpecified = true; }
    else if (key === "--sido") options.sido = value;
    else if (key === "--region-key") options.regionKey = value;
    else if (key === "--stock-csv") options.stockCsv = value;
    else if (key === "--stock-as-of") options.stockAsOf = value;
    else if (key === "--supply-csv") options.supplyCsv = value;
    else if (key === "--supply-basis") options.supplyBasis = value;
    else if (key === "--output") options.output = value;
    else throw new Error(`지원하지 않는 인자입니다: ${key}`);
  }
  if (!options.dryRun && !options.execute) options.dryRun = true;
  return options;
}

function validateOptions(options) {
  const errors = [];
  if (options.dryRun && options.execute) errors.push("--dry-run과 --execute는 동시에 사용할 수 없습니다.");
  if (options.all && options.regionKey) errors.push("--all과 --region-key는 동시에 사용할 수 없습니다.");
  if (!options.all && !options.regionKey) errors.push("--all 또는 --region-key 중 하나만 지정해야 합니다.");
  if (options.sido && options.manifestSpecified) errors.push("--sido와 --manifest는 동시에 사용할 수 없습니다.");
  if (options.registrySpecified && !options.sido) errors.push("--registry에는 --sido가 필요합니다.");
  if (options.registrySpecified && options.manifestSpecified) errors.push("--registry와 --manifest는 동시에 사용할 수 없습니다.");
  if (options.regionKey && !options.all) {
    if (!/^.+-.+$/.test(options.regionKey)) errors.push("--region-key 형식이 올바르지 않습니다.");
  }
  if (options.execute) {
    if (!options.stockCsv) {
      const sharedStock = path.join(SHARED_CACHE_DIR, "housing-stock.csv");
      if (fs.existsSync(sharedStock)) options.stockCsv = sharedStock;
      else errors.push("--execute에는 --stock-csv가 필요합니다 (또는 _shared/housing-stock.csv 배치).");
    }
    if (!options.stockAsOf) options.stockAsOf = DEFAULT_STOCK_AS_OF;
    if (!options.supplyCsv) {
      const sharedSupply = path.join(SHARED_CACHE_DIR, "supply.csv");
      if (fs.existsSync(sharedSupply)) options.supplyCsv = sharedSupply;
      else errors.push("--execute에는 --supply-csv가 필요합니다 (또는 _shared/supply.csv 배치).");
    }
    if (!options.supplyBasis) options.supplyBasis = DEFAULT_SUPPLY_BASIS;
    if (!options.output) errors.push("--execute에는 --output이 필요합니다.");
  }
  if (options.stockAsOf && !/^\d{4}-\d{2}$/.test(options.stockAsOf)) errors.push("--stock-as-of는 YYYY-MM 형식이어야 합니다.");
  if (options.supplyBasis && !/^\d{4}-\d{2}$/.test(options.supplyBasis)) errors.push("--supply-basis는 YYYY-MM 형식이어야 합니다.");
  if (errors.length) throw new Error(errors.join(" "));
  return true;
}

function loadManifest(manifestPath) {
  if (!fs.existsSync(manifestPath)) throw new Error(`manifest 파일이 없습니다: ${manifestPath}`);
  let parsed;
  try { parsed = JSON.parse(fs.readFileSync(manifestPath, "utf8")); }
  catch (error) { throw new Error(`manifest JSON 파싱 실패: ${error.message}`); }
  validateManifest(parsed);
  return parsed;
}

function validateManifest(manifest) {
  const manifestPath = "selected-manifest.json";
  registryCore.validateRegistry({
    schema_version: registryCore.SUPPORTED_SCHEMA_VERSION,
    manifests: [{ sido: manifest?.sido, manifest_path: manifestPath }]
  }, { [manifestPath]: manifest });
  return true;
}

function loadRegistryFromTexts(indexJson, manifestJsonByPath) {
  return registryCore.loadRegistry(indexJson, manifestJsonByPath);
}

function loadRegistry(registryPath) {
  if (!fs.existsSync(registryPath)) throw new Error(`manifest index 파일이 없습니다: ${registryPath}`);
  const indexJson = fs.readFileSync(registryPath, "utf8");
  let index;
  try { index = JSON.parse(indexJson); }
  catch (_error) { return loadRegistryFromTexts(indexJson, {}); }
  if (!index || typeof index !== "object" || !Array.isArray(index.manifests)) {
    return loadRegistryFromTexts(indexJson, {});
  }
  const manifestJsonByPath = {};
  for (const entry of index.manifests) {
    if (!entry || typeof entry !== "object" || typeof entry.manifest_path !== "string") continue;
    const manifestPath = registryCore.validateManifestPath(entry.manifest_path);
    const resolved = path.resolve(path.dirname(registryPath), manifestPath);
    if (!fs.existsSync(resolved)) throw new Error(`registry manifest 파일이 없습니다: ${resolved}`);
    manifestJsonByPath[manifestPath] = fs.readFileSync(resolved, "utf8");
  }
  return loadRegistryFromTexts(indexJson, manifestJsonByPath);
}

function selectManifest(registry, options) {
  if (!registry || !Array.isArray(registry.manifests)) throw new Error("registry manifests가 배열이 아닙니다.");
  if (typeof options?.sido !== "string" || options.sido.length === 0) throw new Error("--sido가 없습니다.");
  const matches = registry.manifests.filter((manifest) => manifest.sido === options.sido);
  if (matches.length === 0) throw new Error(`registry에 없는 sido: ${options.sido}`);
  if (matches.length > 1) throw new Error(`registry에 sido가 ${matches.length}개 있습니다: ${options.sido}`);
  const manifest = matches[0];
  return Object.freeze({ manifest, manifest_path: manifest.manifest_path });
}

function resolveManifestSelection(options) {
  if (options.sido) {
    if (options.manifestSpecified) throw new Error("--sido와 --manifest는 동시에 사용할 수 없습니다.");
    return selectManifest(loadRegistry(options.registry), options);
  }
  const manifestPath = path.resolve(options.manifest);
  return Object.freeze({ manifest: loadManifest(manifestPath), manifest_path: manifestPath });
}

function selectRegions(manifest, options) {
  if (options.all) return manifest.regions.slice();
  if (!options.regionKey) throw new Error("--region-key가 없습니다.");
  const matches = manifest.regions.filter((r) => r.region_key === options.regionKey);
  if (matches.length === 0) throw new Error(`manifest에 없는 region_key: ${options.regionKey}`);
  if (matches.length > 1) throw new Error(`manifest에 region_key가 ${matches.length}개 있습니다: ${options.regionKey}`);
  return matches;
}

function householdRow(region) {
  return `${region.title} (${region.household_code})`;
}

function buildRefreshArgs(region, options) {
  if (!options.execute) return null;
  return [
    REFRESH_SCRIPT,
    "--region-key", region.region_key,
    "--region-prefix", region.region_prefix,
    ...(region.stock_region_prefix ? ["--stock-region-prefix", region.stock_region_prefix] : []),
    "--lawd-code", region.lawd_code,
    "--household-row", householdRow(region),
    "--stock-csv", options.stockCsv,
    "--stock-as-of", options.stockAsOf,
    "--supply-csv", options.supplyCsv,
    "--supply-basis", options.supplyBasis,
    "--output", options.output
  ];
}

function createDryRunPlan(manifest, options) {
  validateOptions(options);
  const selected = selectRegions(manifest, options);
  const jobs = selected.map((region) => ({
    region_key: region.region_key,
    region_prefix: region.region_prefix,
    lawd_code: region.lawd_code,
    household_row: householdRow(region),
    status: "planned"
  }));
  return {
    mode: "dry-run",
    manifest: path.resolve(options.manifest),
    selected_count: selected.length,
    valid: true,
    jobs
  };
}

function parseSnapshotReceipt(stdout) {
  if (typeof stdout !== "string" || stdout.trim() === "") {
    return { snapshotDir: null, error: "snapshot_dir 영수증 JSON이 비어 있습니다." };
  }
  let parsed;
  try { parsed = JSON.parse(stdout); }
  catch (_error) { return { snapshotDir: null, error: "snapshot_dir 영수증 JSON 파싱에 실패했습니다." }; }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return { snapshotDir: null, error: "snapshot_dir 영수증 JSON 객체가 아닙니다." };
  }
  if (typeof parsed.snapshot_dir !== "string" || parsed.snapshot_dir.trim() === "") {
    return { snapshotDir: null, error: "snapshot_dir 영수증의 snapshot_dir가 비어 있거나 문자열이 아닙니다." };
  }
  return { snapshotDir: parsed.snapshot_dir, error: null };
}

function runRefreshForRegion(region, options, runner) {
  const args = buildRefreshArgs(region, options);
  if (!args) throw new Error("buildRefreshArgs가 execute 모드에서 null을 반환했습니다.");
  const spawn = runner || defaultSpawn;
  const result = spawn(process.execPath, args, { encoding: "utf8" });
  const receipt = result.status === 0 ? parseSnapshotReceipt(result.stdout) : { snapshotDir: null, error: null };
  const succeeded = result.status === 0 && receipt.error === null;
  return {
    region_key: region.region_key,
    status: succeeded ? "success" : "failed",
    exit_code: result.status,
    snapshot_dir: receipt.snapshotDir,
    error: succeeded ? null : (receipt.error ?? (result.stderr || result.stdout || "unknown error").trim().split("\n")[0])
  };
}

function defaultSpawn(executable, args, spawnOptions) {
  return spawnSync(executable, args, spawnOptions);
}

function runExecute(manifest, options, runner) {
  validateOptions(options);
  const selected = selectRegions(manifest, options);
  const results = [];
  for (const region of selected) {
    const regionResult = runRefreshForRegion(region, options, runner);
    results.push(regionResult);
  }
  return {
    mode: "execute",
    manifest: path.resolve(options.manifest),
    selected_count: selected.length,
    completed: results.length,
    failed_count: results.filter((r) => r.status !== "success").length,
    jobs: results,
    aborted: false
  };
}

function writeCollectHistory(summary, options) {
  const historyPath = path.join(SHARED_CACHE_DIR, "last-collect.json");
  const existing = fs.existsSync(historyPath) ? JSON.parse(fs.readFileSync(historyPath, "utf8")) : { runs: [] };
  existing.last_run = {
    executed_at: new Date().toISOString(),
    sido: options.sido || null,
    selected: summary.selected_count,
    succeeded: summary.completed - summary.failed_count,
    failed: summary.failed_count,
    failed_regions: summary.jobs.filter((j) => j.status !== "success").map((j) => j.region_key)
  };
  existing.runs.push(existing.last_run);
  if (existing.runs.length > 50) existing.runs = existing.runs.slice(-50);
  fs.mkdirSync(SHARED_CACHE_DIR, { recursive: true });
  fs.writeFileSync(historyPath, `${JSON.stringify(existing, null, 2)}\n`);
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  validateOptions(options);
  const selected = resolveManifestSelection(options);
  const manifest = selected.manifest;
  const selectedOptions = { ...options, manifest: selected.manifest_path };
  if (options.execute) {
    const summary = runExecute(manifest, selectedOptions, defaultSpawn);
    writeCollectHistory(summary, options);
    process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
    if (summary.failed_count > 0) process.exitCode = 1;
    return;
  }
  const plan = createDryRunPlan(manifest, selectedOptions);
  process.stdout.write(`${JSON.stringify(plan, null, 2)}\n`);
}

if (require.main === module) {
  try { main(); }
  catch (error) {
    process.stderr.write(`${error.stack ?? error.message}\n`);
    process.exitCode = 1;
  }
}

module.exports = Object.freeze({
  parseArgs,
  validateOptions,
  loadManifest,
  validateManifest,
  loadRegistryFromTexts,
  loadRegistry,
  selectManifest,
  resolveManifestSelection,
  selectRegions,
  householdRow,
  buildRefreshArgs,
  createDryRunPlan,
  parseSnapshotReceipt,
  runRefreshForRegion,
  runExecute,
  DEFAULT_MANIFEST,
  DEFAULT_REGISTRY_INDEX,
  REFRESH_SCRIPT,
  SUPPORTED_SCHEMA_VERSION: registryCore.SUPPORTED_SCHEMA_VERSION
});
