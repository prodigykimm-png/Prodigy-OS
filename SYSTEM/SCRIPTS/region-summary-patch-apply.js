#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");

const pkgCore = require("./region-research-package-core.js");

const ALLOWED_ROOT_REL = "PARA/RESOURCES/Auction Regions";
const PATCH_CACHE_REL = "SYSTEM/CACHE/region-summary-patches";
const SCHEMA_VERSION = 1;
const TOP_KEYS = new Set(["schema_version", "region_key", "patched_at", "summary_pending", "sources"]);
const SOURCE_KEYS = new Set(["source_id", "institution", "title", "url", "accessed_at", "source_type"]);
const PATCH_BLOCKS = Object.freeze(["AI:PENDING:SUMMARY", "AUTO:REGION_RESEARCH_SOURCES"]);

function rejectUnknownKeys(value, allowed, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label}가 객체가 아닙니다.`);
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) throw new Error(`${label}에 알 수 없는 필드가 있습니다: ${key}`);
  }
  return true;
}

function nonEmptyString(value, label) {
  if (typeof value !== "string" || value.trim() === "") throw new Error(`${label}은(는) 비어 있지 않은 문자열이어야 합니다.`);
  if (/[\r\n]/.test(value)) throw new Error(`${label}은(는) 단일 행이어야 합니다.`);
  return true;
}

function validatePatch(patch) {
  rejectUnknownKeys(patch, TOP_KEYS, "patch");
  if (patch.schema_version !== SCHEMA_VERSION) throw new Error(`지원하지 않는 schema_version: ${patch.schema_version}`);
  nonEmptyString(patch.region_key, "region_key");
  if (!/^.+-.+$/.test(patch.region_key)) throw new Error("region_key 형식이 올바르지 않습니다.");
  pkgCore.validateCalendarDate(patch.patched_at, "patched_at");

  rejectUnknownKeys(patch.summary_pending, new Set(["text", "source_ids"]), "summary_pending");
  nonEmptyString(patch.summary_pending.text, "summary_pending.text");
  pkgCore.escapeProse(patch.summary_pending.text, "summary_pending.text");
  pkgCore.rejectJosaPlaceholders(patch.summary_pending.text, "summary_pending.text");

  if (!Array.isArray(patch.sources) || patch.sources.length < 1) throw new Error("sources는 최소 1개 필요합니다.");
  const seen = new Set();
  const used = new Set();
  patch.sources.forEach((source, index) => {
    rejectUnknownKeys(source, SOURCE_KEYS, `sources[${index}]`);
    nonEmptyString(source.source_id, `sources[${index}].source_id`);
    if (seen.has(source.source_id)) throw new Error(`source_id 중복: ${source.source_id}`);
    seen.add(source.source_id);
    pkgCore.escapeProse(source.institution, `sources[${index}].institution`);
    pkgCore.escapeProse(source.title, `sources[${index}].title`);
    pkgCore.validateCalendarDate(source.accessed_at, `sources[${index}].accessed_at`);
    pkgCore.validateUrl(source.url, `sources[${index}].url`);
    if (source.source_type !== "official_primary") throw new Error(`sources[${index}].source_type은 official_primary여야 합니다.`);
  });

  if (!Array.isArray(patch.summary_pending.source_ids) || patch.summary_pending.source_ids.length < 1) {
    throw new Error("summary_pending.source_ids는 최소 1개 필요합니다.");
  }
  for (const id of patch.summary_pending.source_ids) {
    if (!seen.has(id)) throw new Error(`존재하지 않는 source_id를 참조했습니다: ${id}`);
    used.add(id);
  }
  return true;
}

function renderSummaryBlock(patch) {
  return `> **AI 제안 · 확인 필요:** ${patch.summary_pending.text.replace(/\[S(\d+)\]/g, "[S$1]")} ${patch.summary_pending.source_ids.map((id) => `[${id}]`).join("")}`;
}

function renderSourcesBlock(patch) {
  return patch.sources
    .map((source) => `- **${source.source_id} · ${source.institution}** — ${source.title} · <${source.url}> · 조회 ${source.accessed_at}`)
    .join("\n");
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
    if (descriptor !== undefined) try { fs.closeSync(descriptor); } catch (_closeError) { }
    if (fs.existsSync(temporary)) try { fs.unlinkSync(temporary); } catch (_removeError) { }
    throw error;
  }
}

function replaceBlock(content, key, body) {
  const startMarker = pkgCore.BLOCK_START_MARKERS[key];
  const endMarker = pkgCore.BLOCK_END_MARKERS[key];
  const startIdx = content.indexOf(startMarker);
  const endIdx = content.indexOf(endMarker);
  if (startIdx < 0 || endIdx < 0) throw new Error(`${key} 마커가 없습니다.`);
  return `${content.slice(0, startIdx + startMarker.length)}\n${body}\n${content.slice(endIdx)}`;
}

function blockBody(content, key) {
  const startMarker = pkgCore.BLOCK_START_MARKERS[key];
  const endMarker = pkgCore.BLOCK_END_MARKERS[key];
  const startIdx = content.indexOf(startMarker);
  const endIdx = content.indexOf(endMarker);
  if (startIdx < 0 || endIdx < 0) throw new Error(`${key} 마커가 없습니다.`);
  return content.slice(startIdx + startMarker.length, endIdx);
}

function assertProtectedIntact(before, after) {
  const protectedRe = [
    /<!-- AI:PENDING:ZONES:START -->[\s\S]*?<!-- AI:PENDING:ZONES:END -->/,
    /<!-- AI:PENDING:TRANSPORT_LIFE:START -->[\s\S]*?<!-- AI:PENDING:TRANSPORT_LIFE:END -->/,
    /<!-- AI:PENDING:RISKS:START -->[\s\S]*?<!-- AI:PENDING:RISKS:END -->/,
    /<!-- AI:PENDING:SITE_VISIT:START -->[\s\S]*?<!-- AI:PENDING:SITE_VISIT:END -->/,
    /<!-- AI:PENDING:SUPPLY_PIPELINE:START -->[\s\S]*?<!-- AI:PENDING:SUPPLY_PIPELINE:END -->/,
    /<!-- AUTO:REGION_RESEARCH_LOG:START -->[\s\S]*?<!-- AUTO:REGION_RESEARCH_LOG:END -->/,
    /<!-- AUTO:REGION_TRANSIT:START -->[\s\S]*?<!-- AUTO:REGION_TRANSIT:END -->/,
    /<!-- PRODIGY_REGION_METRICS_DISPLAY:[\s\S]*?-->/,
    /<!-- PRODIGY_REGION_METRICS_HISTORY -->[\s\S]*?```[\s\S]*?```/,
    /^---\n[\s\S]*?\n---/
  ];
  for (const re of protectedRe) {
    const beforeMatch = before.match(re);
    const afterMatch = after.match(re);
    if (beforeMatch && afterMatch && beforeMatch[0] !== afterMatch[0]) {
      throw new Error(`보호 영역이 변경됐습니다: ${re.source.slice(0, 48)}`);
    }
  }
  return true;
}

function applySummaryPatch(options) {
  if (!options.execute) options.dryRun = true;
  const vaultRoot = fs.realpathSync(path.resolve(options.vaultRoot ?? process.cwd()));
  const targetRoot = path.join(vaultRoot, ALLOWED_ROOT_REL);
  if (!fs.existsSync(targetRoot)) throw new Error(`Region Object 폴더가 없습니다: ${targetRoot}`);
  const targetPath = resolveExisting(vaultRoot, options.targetPath, targetRoot, "대상 Region Object");
  const cacheRoot = path.join(vaultRoot, PATCH_CACHE_REL);
  if (!fs.existsSync(cacheRoot)) throw new Error(`Summary patch cache 폴더가 없습니다: ${cacheRoot}`);
  const patchPath = resolveExisting(vaultRoot, options.patchPath, cacheRoot, "summary patch");
  if (path.extname(targetPath) !== ".md") throw new Error("대상 Region Object는 Markdown 파일이어야 합니다.");

  const patch = JSON.parse(fs.readFileSync(patchPath, "utf8"));
  validatePatch(patch);
  if (path.basename(targetPath) !== `${patch.region_key}.md`) {
    throw new Error(`patch region_key(${patch.region_key})와 target 파일명이 일치하지 않습니다.`);
  }

  const original = fs.readFileSync(targetPath, "utf8");
  const currentSourceIds = new Set(
    [...blockBody(original, "AUTO:REGION_RESEARCH_SOURCES").matchAll(/^- \*\*(S\d+) ·/gm)].map((m) => m[1])
  );
  for (const source of patch.sources) {
    if (patch.summary_pending.source_ids.includes(source.source_id)) continue;
    if (!currentSourceIds.has(source.source_id)) {
      throw new Error(`${source.source_id}는 새 출처인데 새 요약이 인용하지 않습니다. 인용하거나 넣지 마세요.`);
    }
  }
  for (const id of currentSourceIds) {
    if (!patch.sources.some((source) => source.source_id === id)) {
      throw new Error(`기존 출처 ${id}를 버립니다. 다른 블록이 인용 중이므로 유지하세요.`);
    }
  }
  const untouched = pkgCore.BLOCK_ORDER.filter((key) => !PATCH_BLOCKS.includes(key));
  const untouchedBefore = Object.fromEntries(untouched.map((key) => [key, blockBody(original, key)]));

  const summaryBody = renderSummaryBlock(patch);
  const sourcesBody = renderSourcesBlock(patch);
  const alreadyApplied = blockBody(original, "AI:PENDING:SUMMARY").trim() === summaryBody.trim()
    && blockBody(original, "AUTO:REGION_RESEARCH_SOURCES").trim() === sourcesBody.trim();

  if (!alreadyApplied && blockBody(original, "AI:PENDING:SUMMARY").trim() !== "") {
    throw new Error("AI:PENDING:SUMMARY 블록이 이미 채워져 있습니다 (fail-closed). 먼저 기존 내용을 비운 뒤 적용하세요.");
  }

  let next = original;
  if (!alreadyApplied) {
    next = replaceBlock(next, "AUTO:REGION_RESEARCH_SOURCES", sourcesBody);
    next = replaceBlock(next, "AI:PENDING:SUMMARY", summaryBody);
  }

  for (const key of untouched) {
    if (blockBody(next, key) !== untouchedBefore[key]) throw new Error(`보호 블록이 변경됐습니다: ${key}`);
  }
  assertProtectedIntact(original, next);

  const result = {
    changed: !alreadyApplied,
    reason: alreadyApplied ? "same_patch" : (options.dryRun ? "patch_planned" : "patch_applied"),
    region_key: patch.region_key,
    patched_at: patch.patched_at,
    sources_count: patch.sources.length,
    blocks: PATCH_BLOCKS.slice(),
    target_path: targetPath
  };
  if (options.dryRun || alreadyApplied) return { ...result, dry_run: Boolean(options.dryRun) };
  atomicWrite(targetPath, next);
  return { ...result, dry_run: false };
}

function parseArgs(argv) {
  const options = { vaultRoot: process.cwd(), dryRun: false, execute: false };
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    if (key === "--dry-run") { options.dryRun = true; continue; }
    if (key === "--execute") { options.execute = true; continue; }
    const value = argv[index + 1];
    if (!key.startsWith("--") || value === undefined) throw new Error("인자는 --key value 형식이어야 합니다");
    index += 1;
    if (key === "--vault") options.vaultRoot = value;
    else if (key === "--target") options.targetPath = value;
    else if (key === "--patch") options.patchPath = value;
    else throw new Error(`지원하지 않는 인자입니다: ${key}`);
  }
  if (!options.targetPath || !options.patchPath) throw new Error("--target과 --patch가 필요합니다.");
  return options;
}

if (require.main === module) {
  try {
    process.stdout.write(`${JSON.stringify(applySummaryPatch(parseArgs(process.argv.slice(2))), null, 2)}\n`);
  } catch (error) {
    process.stderr.write(`${error.stack ?? error.message}\n`);
    process.exitCode = 1;
  }
}

module.exports = Object.freeze({
  PATCH_BLOCKS,
  validatePatch,
  renderSummaryBlock,
  renderSourcesBlock,
  applySummaryPatch,
  parseArgs
});
