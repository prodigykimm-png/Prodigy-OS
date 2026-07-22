#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");

const noteCore = require("./region-metrics-note-core.js");

function localDate() {
  const now = new Date();
  return [now.getFullYear(), String(now.getMonth() + 1).padStart(2, "0"), String(now.getDate()).padStart(2, "0")].join("-");
}

function inside(root, target) {
  const relative = path.relative(root, target);
  return relative !== "" && !relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative);
}

function resolveExisting(vaultRoot, candidate, allowedRoot, label) {
  const resolved = path.resolve(vaultRoot, candidate);
  if (!fs.existsSync(resolved)) throw new Error(`${label}이 존재하지 않습니다: ${resolved}`);
  const realAllowed = fs.realpathSync(allowedRoot);
  const realResolved = fs.realpathSync(resolved);
  if (!inside(realAllowed, realResolved)) throw new Error(`${label}이 허용 경로 밖에 있습니다: ${realResolved}`);
  return realResolved;
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
    if (descriptor !== undefined) {
      try { fs.closeSync(descriptor); } catch (_closeError) { /* best effort */ }
    }
    try { if (fs.existsSync(temporary)) fs.unlinkSync(temporary); } catch (_removeError) { /* best effort */ }
    throw error;
  }
}

function readSnapshot(snapshotPath) {
  try { return JSON.parse(fs.readFileSync(snapshotPath, "utf8")); }
  catch (error) { throw new Error(`스냅샷 JSON 파싱 실패: ${error.message}`); }
}

function applySnapshotFile(options) {
  const vaultRoot = fs.realpathSync(path.resolve(options.vaultRoot ?? process.cwd()));
  const targetRoot = path.join(vaultRoot, "PARA/RESOURCES/Auction Regions");
  const cacheRoot = path.join(vaultRoot, "SYSTEM/CACHE/region-metrics");
  if (!fs.existsSync(targetRoot)) throw new Error(`Region Object 폴더가 없습니다: ${targetRoot}`);
  if (!fs.existsSync(cacheRoot)) throw new Error(`Region metrics cache가 없습니다: ${cacheRoot}`);
  const targetPath = resolveExisting(vaultRoot, options.targetPath, targetRoot, "대상 Region Object");
  const snapshotPath = resolveExisting(vaultRoot, options.snapshotPath, cacheRoot, "스냅샷");
  if (path.extname(targetPath) !== ".md") throw new Error("대상 Region Object는 Markdown 파일이어야 합니다.");
  if (path.basename(snapshotPath) !== "snapshot.json") throw new Error("스냅샷 파일명은 snapshot.json이어야 합니다.");

  const original = fs.readFileSync(targetPath, "utf8");
  const snapshot = readSnapshot(snapshotPath);
  const rendered = noteCore.applySnapshotToNote(original, snapshot, { updatedDate: options.updatedDate ?? localDate() });
  if (rendered.changed && !options.dryRun) atomicWrite(targetPath, rendered.content);
  return {
    changed: rendered.changed,
    dry_run: Boolean(options.dryRun),
    reason: rendered.reason,
    region_key: snapshot.region_key,
    snapshot_id: snapshot.snapshot_id,
    target_path: targetPath
  };
}

function parseArgs(argv) {
  const options = { vaultRoot: process.cwd(), dryRun: false };
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    if (key === "--dry-run") { options.dryRun = true; continue; }
    const value = argv[index + 1];
    if (!key.startsWith("--") || value === undefined) throw new Error(`인자는 --key value 형식이어야 합니다: ${key}`);
    index += 1;
    if (key === "--vault") options.vaultRoot = value;
    else if (key === "--target") options.targetPath = value;
    else if (key === "--snapshot") options.snapshotPath = value;
    else if (key === "--updated-date") options.updatedDate = value;
    else throw new Error(`지원하지 않는 인자입니다: ${key}`);
  }
  if (!options.targetPath || !options.snapshotPath) throw new Error("--target과 --snapshot이 필요합니다.");
  if (options.updatedDate && !/^\d{4}-\d{2}-\d{2}$/.test(options.updatedDate)) throw new Error("--updated-date는 YYYY-MM-DD 형식이어야 합니다.");
  return options;
}

function main() {
  const result = applySnapshotFile(parseArgs(process.argv.slice(2)));
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

if (require.main === module) {
  try { main(); } catch (error) { process.stderr.write(`${error.stack ?? error.message}\n`); process.exitCode = 1; }
}

module.exports = Object.freeze({ applySnapshotFile, atomicWrite, parseArgs });
