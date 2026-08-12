#!/usr/bin/env node
"use strict";

/**
 * region-transit-writer.js
 * version 2 — dry-run default, --execute required for actual write
 * Deterministic AUTO:REGION_TRANSIT writer backed by hash-verified crosswalk.
 * Contract: SYSTEM/docs/Region_Property_Contract_v1.md §AUTO:REGION_TRANSIT
 */

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const pkgCore = require("./region-transit-package-core.js");

const ALLOWED_ROOT_REL = "PARA/RESOURCES/Auction Regions";
const PACKAGE_CACHE_REL = "SYSTEM/CACHE/region-transit-packages";
const CROSSWALK_ROOT = "SYSTEM/CACHE/region-transit";

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
    const mode = fs.statSync(targetPath).mode;
    descriptor = fs.openSync(temporary, "wx", mode);
    fs.writeFileSync(descriptor, content, "utf8");
    fs.fsyncSync(descriptor);
    fs.closeSync(descriptor);
    descriptor = undefined;
    fs.renameSync(temporary, targetPath);
  } catch (error) {
    if (descriptor !== undefined) {
      try { fs.closeSync(descriptor); } catch (_e) { /* best effort */ }
    }
    try { if (fs.existsSync(temporary)) fs.unlinkSync(temporary); } catch (_e) { /* best effort */ }
    throw error;
  }
}

function readPackage(packagePath) {
  try { return JSON.parse(fs.readFileSync(packagePath, "utf8")); }
  catch (error) { throw new Error(`transit package JSON 파싱 실패: ${error.message}`); }
}

function frontmatter(content) {
  const match = content.match(/^---\n([\s\S]*?)\n---(?:\n|$)/);
  if (!match) throw new Error("YAML Frontmatter를 찾을 수 없습니다.");
  return { block: match[1], end: match[0].length };
}

function scalar(block, key) {
  const matches = [...block.matchAll(new RegExp(`^${key}:\\s*(.*?)\\s*$`, "gm"))];
  if (matches.length !== 1) throw new Error(`Frontmatter ${key}는 정확히 1개여야 합니다.`);
  return matches[0][1].replace(/^['"]|['"]$/g, "");
}

function assertOne(content, marker, label) {
  const count = content.split(marker).length - 1;
  if (count !== 1) throw new Error(`${label} 마커가 ${count}개 있습니다 (1개여야 함).`);
}

function applyPackageFile(options) {
  // --execute is REQUIRED for actual write; default is dry-run
  if (!options.execute) options.dryRun = true;

  const vaultRoot = fs.realpathSync(path.resolve(options.vaultRoot ?? process.cwd()));
  const targetRoot = path.join(vaultRoot, ALLOWED_ROOT_REL);
  if (!fs.existsSync(targetRoot)) throw new Error(`Region Object 폴더가 없습니다: ${targetRoot}`);
  const targetPath = resolveExisting(vaultRoot, options.targetPath, targetRoot, "대상 Region Object");
  const packageCacheRoot = path.join(vaultRoot, PACKAGE_CACHE_REL);
  if (!fs.existsSync(packageCacheRoot)) throw new Error(`Transit package cache 폴더가 없습니다: ${packageCacheRoot}`);
  const packagePath = resolveExisting(vaultRoot, options.packagePath, packageCacheRoot, "transit package");
  if (path.extname(targetPath) !== ".md") throw new Error("대상 Region Object는 Markdown 파일이어야 합니다.");

  const original = fs.readFileSync(targetPath, "utf8");
  const pkg = readPackage(packagePath);
  pkgCore.validatePackage(pkg, vaultRoot);

  // region_key must match target filename
  const expectedFilename = `${pkg.region_key}.md`;
  if (path.basename(targetPath) !== expectedFilename) {
    throw new Error(`package region_key(${pkg.region_key})와 target 파일명(${path.basename(targetPath)})이 일치하지 않습니다.`);
  }

  // type must be auction_region
  const fm = frontmatter(original);
  if (scalar(fm.block, "type") !== "auction_region") {
    throw new Error("대상 Object의 type이 auction_region이 아닙니다.");
  }

  // Validate marker structure
  pkgCore.validateTransitMarker(original);

  // Render body (re-reads from crosswalk, does NOT trust package text)
  const body = pkgCore.renderBody(pkg, vaultRoot);

  // Check idempotency — compare current body with rendered body
  const currentBody = original.slice(
    original.indexOf(pkgCore.TRANSIT_MARKER.start) + pkgCore.TRANSIT_MARKER.start.length,
    original.indexOf(pkgCore.TRANSIT_MARKER.end)
  ).trim();
  const samePackage = currentBody === body;

  if (options.dryRun) {
    return {
      changed: !samePackage,
      dry_run: true,
      reason: samePackage ? "same_package" : "package_planned",
      region_key: pkg.region_key,
      provider: pkg.provider,
      stations_count: pkg.stations.length,
      map_sha256: pkg.map_sha256.slice(0, 16),
      target_path: targetPath,
      note: "Use --execute to apply"
    };
  }

  if (!options.execute) {
    throw new Error("--execute가 필요합니다. dry-run 기본값입니다.");
  }

  if (samePackage) {
    return {
      changed: false,
      dry_run: false,
      reason: "same_package",
      region_key: pkg.region_key,
      provider: pkg.provider,
      stations_count: pkg.stations.length,
      target_path: targetPath
    };
  }

  const rendered = pkgCore.replaceTransitBlock(original, body);
  atomicWrite(targetPath, rendered);
  return {
    changed: true,
    dry_run: false,
    reason: "transit_applied",
    region_key: pkg.region_key,
    provider: pkg.provider,
    stations_count: pkg.stations.length,
    target_path: targetPath
  };
}

function parseArgs(argv) {
  const options = { vaultRoot: process.cwd(), dryRun: false, execute: false };
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    if (key === "--dry-run") { options.dryRun = true; continue; }
    if (key === "--execute") { options.execute = true; continue; }
    const value = argv[index + 1];
    if (!key.startsWith("--") || value === undefined) throw new Error(`인자는 --key value 형식이어야 합니다: ${key}`);
    index += 1;
    if (key === "--vault") options.vaultRoot = value;
    else if (key === "--target") options.targetPath = value;
    else if (key === "--package") options.packagePath = value;
    else throw new Error(`지원하지 않는 인자입니다: ${key}`);
  }
  if (!options.targetPath || !options.packagePath) throw new Error("--target과 --package가 필요합니다.");
  return options;
}

function main() {
  const result = applyPackageFile(parseArgs(process.argv.slice(2)));
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

if (require.main === module) {
  try { main(); } catch (error) {
    process.stderr.write(`${error.stack ?? error.message}\n`);
    process.exitCode = 1;
  }
}

module.exports = Object.freeze({
  applyPackageFile, atomicWrite, parseArgs,
  ALLOWED_ROOT_REL, PACKAGE_CACHE_REL, CROSSWALK_ROOT
});