#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");

const pkgCore = require("./region-research-package-core.js");

const ALLOWED_ROOT_REL = "PARA/RESOURCES/Auction Regions";
const PACKAGE_CACHE_REL = "SYSTEM/CACHE/region-research-packages";

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
    const mode = fs.statSync(targetPath).mode;
    descriptor = fs.openSync(temporary, "wx", mode);
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

function readPackage(packagePath) {
  try { return JSON.parse(fs.readFileSync(packagePath, "utf8")); }
  catch (error) { throw new Error(`package JSON 파싱 실패: ${error.message}`); }
}

function assertBlockEmpty(content, key) {
  const startMarker = pkgCore.BLOCK_START_MARKERS[key];
  const endMarker = pkgCore.BLOCK_END_MARKERS[key];
  const startIdx = content.indexOf(startMarker);
  const endIdx = content.indexOf(endMarker);
  if (startIdx < 0) throw new Error(`${key} 시작 마커가 없습니다.`);
  if (endIdx < 0) throw new Error(`${key} 종료 마커가 없습니다.`);
  if (endIdx < startIdx) throw new Error(`${key} 마커 순서 오류.`);
  const body = content.slice(startIdx + startMarker.length, endIdx);
  if (body.trim() !== "") {
    throw new Error(`${key} 블록이 이미 채워져 있습니다 (fail-closed). 먼저 기존 내용을 비운 뒤 적용하세요.`);
  }
  return true;
}

function assertMarkerPairsUnique(content) {
  for (const key of pkgCore.BLOCK_ORDER) {
    const startMarker = pkgCore.BLOCK_START_MARKERS[key];
    const endMarker = pkgCore.BLOCK_END_MARKERS[key];
    const startCount = content.split(startMarker).length - 1;
    const endCount = content.split(endMarker).length - 1;
    if (startCount !== 1) throw new Error(`${key} 시작 마커가 ${startCount}개 있습니다 (1개여야 함).`);
    if (endCount !== 1) throw new Error(`${key} 종료 마커가 ${endCount}개 있습니다 (1개여야 함).`);
  }
  // forbid any protected marker appearing inside rendered bodies (defensive)
  return true;
}

function assertProtectedMarkersIntact(before, after) {
  // frontmatter, display, history, market, HUMAN blocks must be byte-for-byte preserved
  const frontmatterBefore = before.match(/^---\n[\s\S]*?\n---/)[0];
  const frontmatterAfter = after.match(/^---\n[\s\S]*?\n---/)[0];
  if (frontmatterBefore !== frontmatterAfter) throw new Error("frontmatter가 변경됐습니다.");
  const protectedMarkers = [
    "<!-- PRODIGY_REGION_METRICS_DISPLAY",
    "<!-- PRODIGY_REGION_METRICS_HISTORY -->",
    "<!-- AUTO:REGION_MARKET:START -->",
    "<!-- AUTO:REGION_MARKET:END -->",
    "<!-- AUTO:REGION_TRANSIT:START -->",
    "<!-- AUTO:REGION_TRANSIT:END -->",
    "<!-- HUMAN",
    "<!-- HUMAN:LOCKED -->",
    "<!-- HUMAN:OWNED -->"
  ];
  for (const marker of protectedMarkers) {
    const beforeCount = before.split(marker).length - 1;
    const afterCount = after.split(marker).length - 1;
    if (beforeCount !== afterCount) throw new Error(`보호 마커 개수가 변경됐습니다: ${marker} ${beforeCount}→${afterCount}`);
  }
  // HUMAN block bodies must be byte-for-byte preserved
  const humanBodiesBefore = (before.match(/<!-- HUMAN[^>]*-->[\s\S]*?(?=<!--|\n## |$)/g) || []);
  const humanBodiesAfter = (after.match(/<!-- HUMAN[^>]*-->[\s\S]*?(?=<!--|\n## |$)/g) || []);
  if (JSON.stringify(humanBodiesBefore) !== JSON.stringify(humanBodiesAfter)) {
    throw new Error("HUMAN 블록 본문이 변경됐습니다.");
  }
  // AUTO:REGION_MARKET block body must be byte-for-byte preserved
  const marketRe = /<!-- AUTO:REGION_MARKET:START -->[\s\S]*?<!-- AUTO:REGION_MARKET:END -->/;
  const marketBefore = before.match(marketRe);
  const marketAfter = after.match(marketRe);
  if (marketBefore && marketAfter && marketBefore[0] !== marketAfter[0]) {
    throw new Error("AUTO:REGION_MARKET 블록이 변경됐습니다.");
  }
  // AUTO:REGION_TRANSIT block body must be byte-for-byte preserved
  const transitRe = /<!-- AUTO:REGION_TRANSIT:START -->[\s\S]*?<!-- AUTO:REGION_TRANSIT:END -->/;
  const transitBefore = before.match(transitRe);
  const transitAfter = after.match(transitRe);
  if (transitBefore && transitAfter && transitBefore[0] !== transitAfter[0]) {
    throw new Error("AUTO:REGION_TRANSIT 블록이 변경됐습니다.");
  }
  // PRODIGY_REGION_METRICS_HISTORY body must be byte-for-byte preserved
  const historyRe = /<!-- PRODIGY_REGION_METRICS_HISTORY -->[\s\S]*?```[\s\S]*?```/;
  const historyBefore = before.match(historyRe);
  const historyAfter = after.match(historyRe);
  if (historyBefore && historyAfter && historyBefore[0] !== historyAfter[0]) {
    throw new Error("PRODIGY_REGION_METRICS_HISTORY 블록이 변경됐습니다.");
  }
  return true;
}

function replaceBlock(content, key, body) {
  const startMarker = pkgCore.BLOCK_START_MARKERS[key];
  const endMarker = pkgCore.BLOCK_END_MARKERS[key];
  const startIdx = content.indexOf(startMarker);
  const endIdx = content.indexOf(endMarker);
  if (startIdx < 0 || endIdx < 0) throw new Error(`${key} 마커가 없습니다.`);
  return `${content.slice(0, startIdx + startMarker.length)}\n${body}\n${content.slice(endIdx)}`;
}

function renderToContent(original, pkg, keys = pkgCore.BLOCK_ORDER) {
  const rendered = pkgCore.renderAllBlocks(pkg);
  let next = original;
  for (const key of keys) {
    next = replaceBlock(next, key, rendered[key]);
  }
  return next;
}

function blockBodies(content, keys) {
  const bodies = {};
  for (const key of keys) {
    const startMarker = pkgCore.BLOCK_START_MARKERS[key];
    const endMarker = pkgCore.BLOCK_END_MARKERS[key];
    const startIdx = content.indexOf(startMarker);
    const endIdx = content.indexOf(endMarker);
    bodies[key] = startIdx < 0 || endIdx < 0 ? null : content.slice(startIdx + startMarker.length, endIdx);
  }
  return bodies;
}

function selectBlocks(raw) {
  if (raw === undefined || raw === null) return pkgCore.BLOCK_ORDER.slice();
  const requested = String(raw).split(",").map((value) => value.trim()).filter(Boolean);
  if (requested.length === 0) throw new Error("--blocks에 최소 1개 블록이 필요합니다.");
  const seen = new Set();
  for (const key of requested) {
    if (!pkgCore.BLOCK_ORDER.includes(key)) {
      throw new Error(`--blocks에 없는 블록입니다: ${key} (허용: ${pkgCore.BLOCK_ORDER.join(", ")})`);
    }
    if (seen.has(key)) throw new Error(`--blocks에 중복된 블록이 있습니다: ${key}`);
    seen.add(key);
  }
  return pkgCore.BLOCK_ORDER.filter((key) => seen.has(key));
}

function contentBlockFingerprint(content, keys = pkgCore.BLOCK_ORDER) {
  const parts = [];
  for (const key of keys) {
    const startMarker = pkgCore.BLOCK_START_MARKERS[key];
    const endMarker = pkgCore.BLOCK_END_MARKERS[key];
    const startIdx = content.indexOf(startMarker);
    const endIdx = content.indexOf(endMarker);
    if (startIdx < 0 || endIdx < 0) { parts.push("\u0000"); continue; }
    parts.push(content.slice(startIdx + startMarker.length, endIdx));
  }
  return parts.join("\u0001");
}

function applyPackageFile(options) {
  // --execute is REQUIRED for actual write; default is dry-run
  if (!options.execute) options.dryRun = true;

  const vaultRoot = fs.realpathSync(path.resolve(options.vaultRoot ?? process.cwd()));
  const targetRoot = path.join(vaultRoot, ALLOWED_ROOT_REL);
  if (!fs.existsSync(targetRoot)) throw new Error(`Region Object 폴더가 없습니다: ${targetRoot}`);
  const targetPath = resolveExisting(vaultRoot, options.targetPath, targetRoot, "대상 Region Object");
  const packageCacheRoot = path.join(vaultRoot, PACKAGE_CACHE_REL);
  if (!fs.existsSync(packageCacheRoot)) throw new Error(`Research package cache 폴더가 없습니다: ${packageCacheRoot}`);
  const packagePath = resolveExisting(vaultRoot, options.packagePath, packageCacheRoot, "research package");
  if (path.extname(targetPath) !== ".md") throw new Error("대상 Region Object는 Markdown 파일이어야 합니다.");

  const original = fs.readFileSync(targetPath, "utf8");
  const pkg = readPackage(packagePath);
  pkgCore.validatePackage(pkg);

  // region_key must match target filename
  const expectedFilename = `${pkg.region_key}.md`;
  if (path.basename(targetPath) !== expectedFilename) {
    throw new Error(`package region_key(${pkg.region_key})와 target 파일명(${path.basename(targetPath)})이 일치하지 않습니다.`);
  }

  // verify all 7 marker pairs unique and ordered
  assertMarkerPairsUnique(original);

  const selectedBlocks = selectBlocks(options.blocks);
  const untouchedBlocks = pkgCore.BLOCK_ORDER.filter((key) => !selectedBlocks.includes(key));
  const untouchedBefore = blockBodies(original, untouchedBlocks);

  // 출처 블록은 모든 블록이 [S1] 형식으로 인용하므로 공유된다. 이를 건드리지 않는 부분 적용은
  // "새 패키지의 출처 집합이 지금 노트에 적힌 것과 동일할 때"에만 허용한다. 다르면 남아 있는
  // 블록의 [S1]이 다른 문서를 가리키게 되어 인용이 조용히 바뀐다.
  const sourcesKey = "AUTO:REGION_RESEARCH_SOURCES";
  if (!selectedBlocks.includes(sourcesKey)) {
    const renderedSources = pkgCore.renderAllBlocks(pkg)[sourcesKey];
    const currentSources = blockBodies(original, [sourcesKey])[sourcesKey];
    if (currentSources.trim() !== "" && currentSources.trim() !== renderedSources.trim()) {
      throw new Error(
        `${sourcesKey}를 선택하지 않았는데 패키지의 출처 집합이 다릅니다. ` +
        "남은 블록의 [S#] 인용이 다른 문자를 가리키게 되므로 함께 적용하거나, 기존 출처를 그대로 쓰는 패키지를 제출하세요."
      );
    }
  }

  // idempotency check first: if the rendered package body matches existing body byte-for-byte, no-op
  const probeRendered = renderToContent(original, pkg, selectedBlocks);
  const probeFingerprint = contentBlockFingerprint(probeRendered, selectedBlocks);
  const originalFingerprint = contentBlockFingerprint(original, selectedBlocks);
  const samePackage = probeFingerprint === originalFingerprint;

  if (!samePackage) {
    // fail-closed: every selected block must be empty before apply
    for (const key of selectedBlocks) {
      assertBlockEmpty(original, key);
    }
  }

  const rendered = probeRendered;

  // safety: re-check all 7 markers still unique, all protected markers preserved
  assertMarkerPairsUnique(rendered);
  assertProtectedMarkersIntact(original, rendered);
  const untouchedAfter = blockBodies(rendered, untouchedBlocks);
  for (const key of untouchedBlocks) {
    if (untouchedBefore[key] !== untouchedAfter[key]) {
      throw new Error(`선택하지 않은 ${key} 블록이 변경됐습니다.`);
    }
  }

  if (options.dryRun) {
    return {
      changed: !samePackage,
      dry_run: true,
      reason: samePackage ? "same_package" : "package_planned",
      region_key: pkg.region_key,
      researched_at: pkg.researched_at,
      sources_count: pkg.sources.length,
      blocks: selectedBlocks,
      target_path: targetPath
    };
  }

  if (samePackage) {
    return {
      changed: false,
      dry_run: false,
      reason: "same_package",
      region_key: pkg.region_key,
      researched_at: pkg.researched_at,
      sources_count: pkg.sources.length,
      blocks: selectedBlocks,
      target_path: targetPath
    };
  }

  atomicWrite(targetPath, rendered);
  return {
    changed: true,
    dry_run: false,
    reason: "package_applied",
    region_key: pkg.region_key,
    researched_at: pkg.researched_at,
    sources_count: pkg.sources.length,
    blocks: selectedBlocks,
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
    else if (key === "--blocks") options.blocks = value;
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

module.exports = Object.freeze({ applyPackageFile, atomicWrite, parseArgs, assertBlockEmpty, assertMarkerPairsUnique, assertProtectedMarkersIntact, renderToContent, contentBlockFingerprint, selectBlocks, blockBodies, ALLOWED_ROOT_REL, PACKAGE_CACHE_REL });
