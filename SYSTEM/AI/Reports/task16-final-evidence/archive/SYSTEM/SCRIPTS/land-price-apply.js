#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const core = require("./land-price-package-core.js");

const CACHE_ROOT = "SYSTEM/CACHE/land-price-packages";
const REGION_MARKERS = Object.freeze({ start: "<!-- AUTO:REGION_LAND_PRICE:START -->", end: "<!-- AUTO:REGION_LAND_PRICE:END -->" });

function inside(root, target) {
  const relative = path.relative(root, target);
  return relative !== "" && !relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative);
}

function resolveExisting(vaultRoot, candidate, allowedRoot, label) {
  const resolved = path.resolve(vaultRoot, candidate);
  if (!fs.existsSync(resolved)) throw new Error(`${label}이 존재하지 않습니다: ${resolved}`);
  const realAllowed = fs.realpathSync(allowedRoot);
  const realResolved = fs.realpathSync(resolved);
  if (!inside(realAllowed, realResolved)) throw new Error(`${label}이 허용 경로 밖에 있습니다.`);
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
    if (descriptor !== undefined) try { fs.closeSync(descriptor); } catch (_closeError) { /* best effort */ }
    if (fs.existsSync(temporary)) try { fs.unlinkSync(temporary); } catch (_removeError) { /* best effort */ }
    throw error;
  }
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

function yamlValue(value) {
  if (typeof value === "number") return String(value);
  return /^[\p{L}\p{N}_.+%/-]+$/u.test(value) ? value : JSON.stringify(value);
}

function replaceScalar(block, key, value) {
  const pattern = new RegExp(`^${key}:.*$`, "gm");
  if ((block.match(pattern) ?? []).length !== 1) throw new Error(`Frontmatter ${key}는 정확히 1개여야 합니다.`);
  return block.replace(pattern, `${key}: ${yamlValue(value)}`);
}

function assertOne(content, marker) {
  if (content.split(marker).length - 1 !== 1) throw new Error(`${marker}는 정확히 1개여야 합니다.`);
}

function replaceRegionBlock(content, body) {
  assertOne(content, REGION_MARKERS.start);
  assertOne(content, REGION_MARKERS.end);
  const start = content.indexOf(REGION_MARKERS.start) + REGION_MARKERS.start.length;
  const end = content.indexOf(REGION_MARKERS.end, start);
  if (end < start) throw new Error("지가 marker 순서가 올바르지 않습니다.");
  return `${content.slice(0, start)}\n${body}\n${content.slice(end)}`;
}

function readPackage(packagePath) {
  try { return JSON.parse(fs.readFileSync(packagePath, "utf8")); } catch (error) { throw new Error(`지가 package JSON 파싱 실패: ${error.message}`); }
}

function renderCase(content, pkg) {
  const fm = frontmatter(content);
  if (scalar(fm.block, "type") !== "auction_case" || scalar(fm.block, "id") !== pkg.target_id) throw new Error("case target_id가 대상 Object와 일치하지 않습니다.");
  let block = fm.block;
  const values = {
    land_parcel_id: pkg.land_parcel_id,
    official_land_price_per_sqm: pkg.official_land_price_per_sqm,
    official_land_price_as_of: pkg.official_land_price_as_of,
    official_land_price_source: pkg.source.url,
    land_rights_area_sqm: pkg.land_rights_area_sqm
  };
  for (const [key, value] of Object.entries(values)) block = replaceScalar(block, key, value);
  return `---\n${block}\n---\n${content.slice(fm.end)}`;
}

function renderRegion(content, pkg) {
  const fm = frontmatter(content);
  if (scalar(fm.block, "type") !== "auction_region" || `${scalar(fm.block, "region_sido")}-${scalar(fm.block, "region_sigungu")}` !== pkg.target_id) throw new Error("region target_id가 대상 Object와 일치하지 않습니다.");
  let block = fm.block;
  const values = {
    land_price_trend_yoy: pkg.land_price_trend_yoy,
    land_price_trend_as_of: pkg.land_price_trend_as_of,
    land_price_trend_scope: pkg.land_price_trend_scope,
    land_price_trend_source: pkg.source.url
  };
  for (const [key, value] of Object.entries(values)) block = replaceScalar(block, key, value);
  return replaceRegionBlock(`---\n${block}\n---\n${content.slice(fm.end)}`, core.renderRegionBlock(pkg));
}

function applyPackageFile(options) {
  // --execute is REQUIRED for actual write; default is dry-run
  if (!options.execute) options.dryRun = true;

  const vaultRoot = fs.realpathSync(path.resolve(options.vaultRoot ?? process.cwd()));
  const packageRoot = path.join(vaultRoot, CACHE_ROOT);
  if (!fs.existsSync(packageRoot)) throw new Error("Land price package cache 폴더가 없습니다.");
  const packagePath = resolveExisting(vaultRoot, options.packagePath, packageRoot, "지가 package");
  const pkg = readPackage(packagePath);
  core.validatePackage(pkg);
  const targetRoot = path.join(vaultRoot, pkg.scope === "case" ? "PARA/PROJECTS/Auction" : "PARA/RESOURCES/Auction Regions");
  const targetPath = resolveExisting(vaultRoot, options.targetPath, targetRoot, "대상 Object");
  const original = fs.readFileSync(targetPath, "utf8");
  const rendered = pkg.scope === "case" ? renderCase(original, pkg) : renderRegion(original, pkg);
  const changed = rendered !== original;
  if (!options.dryRun && changed) atomicWrite(targetPath, rendered);
  return { changed, dry_run: Boolean(options.dryRun), reason: changed ? (options.dryRun ? "package_planned" : "package_applied") : "same_package", scope: pkg.scope, target_id: pkg.target_id, target_path: targetPath };
}

function parseArgs(argv) {
  const options = { vaultRoot: process.cwd(), dryRun: false, execute: false };
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    if (key === "--dry-run") { options.dryRun = true; continue; }
    if (key === "--execute") { options.execute = true; continue; }
    const value = argv[index + 1];
    if (!key?.startsWith("--") || value === undefined) throw new Error(`인자는 --key value 형식이어야 합니다: ${key}`);
    index += 1;
    if (key === "--vault") options.vaultRoot = value;
    else if (key === "--target") options.targetPath = value;
    else if (key === "--package") options.packagePath = value;
    else throw new Error(`지원하지 않는 인자입니다: ${key}`);
  }
  if (!options.targetPath || !options.packagePath) throw new Error("--target과 --package가 필요합니다.");
  return options;
}

if (require.main === module) {
  try { process.stdout.write(`${JSON.stringify(applyPackageFile(parseArgs(process.argv.slice(2))), null, 2)}\n`); }
  catch (error) { process.stderr.write(`${error.stack ?? error.message}\n`); process.exitCode = 1; }
}

module.exports = Object.freeze({ applyPackageFile, atomicWrite, parseArgs, renderCase, renderRegion, REGION_MARKERS });
