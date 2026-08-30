#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const crypto = require("node:crypto");

const noteCore = require("./region-metrics-note-core.js");
const batch = require("./region-metrics-batch.js");

const COLLECT_ALL = path.resolve(__dirname, "region-metrics-collect-all.js");
const CACHE_ROOT = path.resolve(__dirname, "../CACHE/region-metrics");
const NOTE_ROOT = "PARA/RESOURCES/Auction Regions";

function loadRegions() {
  const registry = batch.loadRegistry(batch.DEFAULT_REGISTRY_INDEX);
  if (registry.regions.length !== 83) throw new Error(`주기지표 대상은 정확히 83개여야 합니다: ${registry.regions.length}`);
  return registry.regions;
}

function latestSnapshotPath(cacheRoot, regionKey) {
  const regionDir = path.join(cacheRoot, regionKey);
  if (!fs.existsSync(regionDir)) throw new Error(`지역 스냅샷 폴더가 없습니다: ${regionKey}`);
  const candidates = fs.readdirSync(regionDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(regionDir, entry.name, "snapshot.json"))
    .filter((candidate) => fs.existsSync(candidate))
    .sort();
  if (!candidates.length) throw new Error(`지역 스냅샷이 없습니다: ${regionKey}`);
  return candidates.at(-1);
}

function readJson(filePath, label) {
  try { return JSON.parse(fs.readFileSync(filePath, "utf8")); }
  catch (error) { throw new Error(`${label} JSON 파싱 실패: ${error.message}`); }
}

function buildApplyPlan(options = {}) {
  const vaultRoot = fs.realpathSync(path.resolve(options.vaultRoot || process.cwd()));
  const cacheRoot = path.resolve(options.cacheRoot || CACHE_ROOT);
  const regions = options.regions || loadRegions();
  const updatedDate = options.updatedDate || new Date().toISOString().slice(0, 10);
  const plan = regions.map((region) => {
    const snapshotPath = latestSnapshotPath(cacheRoot, region.region_key);
    const snapshot = readJson(snapshotPath, `${region.region_key} 스냅샷`);
    if (snapshot.region_key !== region.region_key) throw new Error(`스냅샷 지역키 불일치: ${snapshot.region_key} != ${region.region_key}`);
    noteCore.validateSnapshot(snapshot);
    const notePath = path.join(vaultRoot, NOTE_ROOT, `${region.region_key}.md`);
    if (!fs.existsSync(notePath)) throw new Error(`지역노트가 없습니다: ${region.region_key}`);
    const original = fs.readFileSync(notePath, "utf8");
    const rendered = noteCore.applySnapshotToNote(original, snapshot, { updatedDate });
    return Object.freeze({
      region_key: region.region_key,
      note_path: notePath,
      snapshot_path: snapshotPath,
      snapshot_id: snapshot.snapshot_id,
      metrics_as_of: snapshot.metrics_as_of,
      changed: rendered.changed,
      reason: rendered.reason,
      content: rendered.content
    });
  });
  return Object.freeze(plan);
}

function atomicWrite(targetPath, content) {
  const temporary = `${targetPath}.tmp-${process.pid}-${Date.now()}`;
  const mode = fs.statSync(targetPath).mode;
  let descriptor;
  try {
    descriptor = fs.openSync(temporary, "wx", mode);
    fs.writeFileSync(descriptor, content, "utf8");
    fs.fsyncSync(descriptor);
    fs.closeSync(descriptor);
    descriptor = undefined;
    fs.renameSync(temporary, targetPath);
  } catch (error) {
    if (descriptor !== undefined) try { fs.closeSync(descriptor); } catch (_error) { /* best effort */ }
    try { if (fs.existsSync(temporary)) fs.unlinkSync(temporary); } catch (_error) { /* best effort */ }
    throw error;
  }
}

function applyPlan(plan, execute) {
  if (execute) for (const item of plan) if (item.changed) atomicWrite(item.note_path, item.content);
  return {
    selected: plan.length,
    changed: plan.filter((item) => item.changed).length,
    unchanged: plan.filter((item) => !item.changed).length,
    executed: Boolean(execute),
    regions: plan.map(({ content: _content, ...item }) => item)
  };
}

function runCollector(runner = spawnSync) {
  const result = runner(process.execPath, [COLLECT_ALL, "--execute"], { encoding: "utf8", timeout: 30 * 60 * 1000 });
  if (result.status !== 0) throw new Error(`전 지역 수집 실패; 노트 반영을 중단합니다.\n${result.stderr || result.stdout || "출력 없음"}`);
  const receipt = readReceipt(result.stdout);
  if (receipt.total_succeeded !== 83 || receipt.total_failed !== 0) {
    throw new Error(`전 지역 수집 영수증이 완전하지 않습니다: success=${receipt.total_succeeded}, failed=${receipt.total_failed}`);
  }
  return receipt;
}

function readReceipt(text) {
  let receipt;
  try { receipt = JSON.parse(text); } catch (error) { throw new Error(`수집 영수증 JSON 파싱 실패: ${error.message}`); }
  if (!receipt || receipt.mode !== "execute") throw new Error("수집 영수증은 execute 모드여야 합니다.");
  return receipt;
}

function receiptFor(planResult, collection) {
  const payload = {
    schema_version: 1,
    executed_at: new Date().toISOString(),
    collection,
    apply: planResult
  };
  return Object.freeze({ ...payload, sha256: crypto.createHash("sha256").update(JSON.stringify(payload)).digest("hex") });
}

function parseArgs(argv) {
  const options = { execute: false, collect: true, vaultRoot: process.cwd(), receiptPath: path.join(CACHE_ROOT, "_shared", "last-pipeline.json") };
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    if (key === "--execute") { options.execute = true; continue; }
    if (key === "--dry-run") { options.execute = false; continue; }
    if (key === "--skip-collect") { options.collect = false; continue; }
    const value = argv[++index];
    if (value === undefined) throw new Error(`인자값이 없습니다: ${key}`);
    if (key === "--vault") options.vaultRoot = value;
    else if (key === "--receipt") options.receiptPath = value;
    else throw new Error(`지원하지 않는 인자입니다: ${key}`);
  }
  return options;
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const collection = options.collect ? runCollector() : { mode: "skipped", reason: "explicit_skip_collect" };
  const plan = buildApplyPlan(options);
  const applied = applyPlan(plan, options.execute);
  const receipt = receiptFor(applied, collection);
  if (options.execute) {
    fs.mkdirSync(path.dirname(options.receiptPath), { recursive: true });
    fs.writeFileSync(options.receiptPath, `${JSON.stringify(receipt, null, 2)}\n`, "utf8");
  }
  process.stdout.write(`${JSON.stringify(receipt, null, 2)}\n`);
}

if (require.main === module) {
  try { main(); } catch (error) { process.stderr.write(`${error.stack || error.message}\n`); process.exitCode = 1; }
}

module.exports = Object.freeze({ applyPlan, buildApplyPlan, latestSnapshotPath, loadRegions, parseArgs, readReceipt, receiptFor, runCollector });
