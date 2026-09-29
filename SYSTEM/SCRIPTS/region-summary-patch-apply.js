#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");

const pkgCore = require("./region-research-package-core.js");

const ALLOWED_ROOT_REL = "PARA/RESOURCES/Auction Regions";
const PATCH_CACHE_REL = "SYSTEM/CACHE/region-summary-patches";
const SCHEMA_VERSION = 1;
const TOP_KEYS = new Set(["schema_version", "region_key", "patched_at", "summary_pending", "sources", "supply_pipeline", "supply_heading", "reference_month"]);
const SOURCE_KEYS = new Set(["source_id", "institution", "title", "url", "accessed_at", "source_type"]);
const PATCH_BLOCKS = Object.freeze(["AI:PENDING:SUMMARY", "AUTO:REGION_RESEARCH_SOURCES"]);
const SUPPLY_KEY = "AI:PENDING:SUPPLY_PIPELINE";
const SUPPLY_ITEM_KEYS = new Set(["project_name", "stage", "units", "expected_month", "source_ids", "kind"]);
const SUPPLY_STAGES = new Set(["planned", "approved", "under_construction", "scheduled"]);
const SUPPLY_KINDS = new Set(["분양", "임대", "분양임대", "조합", "분양조합", "분양임대조합"]);

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

  if (patch.summary_pending == null && patch.supply_pipeline === undefined) {
    throw new Error("summary_pending 또는 supply_pipeline 중 하나는 있어야 합니다.");
  }
  if (patch.summary_pending != null) {
    rejectUnknownKeys(patch.summary_pending, new Set(["text", "source_ids"]), "summary_pending");
    nonEmptyString(patch.summary_pending.text, "summary_pending.text");
  }
  if (patch.summary_pending !== undefined) {
    pkgCore.escapeProse(patch.summary_pending.text, "summary_pending.text");
    pkgCore.rejectJosaPlaceholders(patch.summary_pending.text, "summary_pending.text");
  }

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

  if (patch.supply_heading !== undefined) nonEmptyString(patch.supply_heading, "supply_heading");
  if (patch.reference_month !== undefined && !/^20\d{2}-\d{2}$/.test(patch.reference_month)) {
    throw new Error("reference_month는 YYYY-MM 형식이어야 합니다.");
  }
  if (patch.supply_pipeline !== undefined) validateSupplyPipeline(patch.supply_pipeline, patch.sources);
  if (patch.summary_pending != null) {
    if (!Array.isArray(patch.summary_pending.source_ids) || patch.summary_pending.source_ids.length < 1) {
      throw new Error("summary_pending.source_ids는 최소 1개 필요합니다.");
    }
    for (const id of patch.summary_pending.source_ids) {
      if (!seen.has(id)) throw new Error(`존재하지 않는 source_id를 참조했습니다: ${id}`);
      used.add(id);
    }
  }
  // 출처가 인용되는지는 apply 시점에 노트의 남은 블록까지 보고 판단한다.
  return true;
}

function validateSupplyPipeline(items, sources) {
  if (!Array.isArray(items)) throw new Error("supply_pipeline은 배열이어야 합니다.");
  const valid = new Set(sources.map((s) => s.source_id));
  const seen = new Set();
  items.forEach((item, index) => {
    rejectUnknownKeys(item, SUPPLY_ITEM_KEYS, `supply_pipeline[${index}]`);
    nonEmptyString(item.project_name, `supply_pipeline[${index}].project_name`);
    if (!SUPPLY_STAGES.has(item.stage)) throw new Error(`supply_pipeline[${index}].stage가 허용값이 아닙니다: ${item.stage}`);
    if (!Number.isInteger(item.units) || item.units <= 0) throw new Error(`supply_pipeline[${index}].units는 양의 정수여야 합니다.`);
    if (seen.has(item.project_name)) throw new Error(`supply_pipeline에 중복된 사업명이 있습니다: ${item.project_name}`);
    seen.add(item.project_name);
    if (!/^\d{4}-\d{2}$/.test(item.expected_month ?? "") || Number(String(item.expected_month).slice(5, 7)) < 1 || Number(String(item.expected_month).slice(5, 7)) > 12) {
      throw new Error(`supply_pipeline[${index}].expected_month는 YYYY-MM 형식이어야 합니다.`);
    }
    if (item.kind !== undefined && !SUPPLY_KINDS.has(item.kind)) {
      throw new Error(`supply_pipeline[${index}].kind는 공급 원본의 사업유형 값이어야 합니다: ${item.kind}`);
    }
    if (!Array.isArray(item.source_ids) || item.source_ids.length < 1) throw new Error(`supply_pipeline[${index}].source_ids는 최소 1개 필요합니다.`);
    for (const id of item.source_ids) if (!valid.has(id)) throw new Error(`존재하지 않는 source_id를 참조했습니다: ${id}`);
  });
  return true;
}

function renderSupplyBlock(patch) {
  if (patch.supply_pipeline === undefined || patch.supply_pipeline.length === 0) return null;
  const head = "| 입주까지 | 사업 | 구분 | 단계 | 세대수 | 입주예정월 | 근거 |\n|---|---|---|---|---:|---|---|";
  const referenceMonth = /^(20\d{2})-(\d{2})$/.exec(patch.reference_month || "");
  const referenceIndex = referenceMonth
    ? Number(referenceMonth[1]) * 12 + Number(referenceMonth[2])
    : (new Date().getFullYear() * 12 + new Date().getMonth() + 1);
  const rows = patch.supply_pipeline.map((item) => {
    const months = Math.round((Number(item.expected_month.slice(0, 4)) * 12 + Number(item.expected_month.slice(5, 7))) - referenceIndex);
    const bucket = months < 0 ? "이미 지난 예정월"
      : months <= 12 ? "12개월 이내" : months <= 24 ? "13~24개월" : months <= 36 ? "25~36개월" : months <= 60 ? "37~60개월" : "60개월 초과";
    const stage = { planned: "계획", approved: "승인", under_construction: "공사 중", scheduled: "입주예정월 공표(단계 미상)" }[item.stage];
    return `| ${bucket} | ${pkgCore.escapeTableCell(item.project_name)} | ${item.kind ?? ""} | ${stage} | ${item.units.toLocaleString("ko-KR")} | ${item.expected_month} | ${item.source_ids.map((id) => `[${id}]`).join("")} |`;
  });
  const heading = patch.supply_heading || "> **AI 제안 · 확인 필요:** 확정 입주물량과 분리된 공식 입주예정 자료 기반 사업 후보다. 물량과 입주예정월은 사업시행 계획 기준이므로 변동될 수 있다.";
  return `${heading}\n>\n> ${head}\n> ${rows.join("\n> ")}`;
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

function assertProtectedIntact(before, after, allowSupply = false) {
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
    if (allowSupply && re.source.includes("AI:PENDING:SUPPLY_PIPELINE")) continue;
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
  const citedElsewhere = new Set();
  for (const key of pkgCore.BLOCK_ORDER) {
    if (key === "AUTO:REGION_RESEARCH_SOURCES") continue;
    for (const match of blockBody(original, key).matchAll(/\[(S\d+)\]/g)) citedElsewhere.add(match[1]);
  }
  const summaryIds = new Set(patch.summary_pending == null ? [] : patch.summary_pending.source_ids);
  const supplyIds = new Set((patch.supply_pipeline || []).flatMap((row) => row.source_ids || []));
  for (const source of patch.sources) {
    if (summaryIds.has(source.source_id) || supplyIds.has(source.source_id)) continue;
    if (currentSourceIds.has(source.source_id) || citedElsewhere.has(source.source_id)) continue;
    throw new Error(`${source.source_id}는 새 출처인데 새 요약도 남은 블록도 인용하지 않습니다. 인용하거나 넣지 마세요.`);
  }
  for (const id of currentSourceIds) {
    if (!patch.sources.some((source) => source.source_id === id)) {
      throw new Error(`기존 출처 ${id}를 버립니다. 다른 블록이 인용 중이므로 유지하세요.`);
    }
  }
  const supplyBody = renderSupplyBlock(patch);
  const summaryBody = patch.summary_pending == null ? null : renderSummaryBlock(patch);
  const sourcesBody = renderSourcesBlock(patch);
  const writtenBlocks = [
    ...(summaryBody === null ? [] : ["AI:PENDING:SUMMARY"]),
    "AUTO:REGION_RESEARCH_SOURCES",
    ...(supplyBody === null ? [] : [SUPPLY_KEY])
  ];
  const untouched = pkgCore.BLOCK_ORDER.filter((key) => !writtenBlocks.includes(key));
  const untouchedBefore = Object.fromEntries(untouched.map((key) => [key, blockBody(original, key)]));
  const alreadyApplied = (summaryBody === null || blockBody(original, "AI:PENDING:SUMMARY").trim() === summaryBody.trim())
    && blockBody(original, "AUTO:REGION_RESEARCH_SOURCES").trim() === sourcesBody.trim()
    && (supplyBody === null || blockBody(original, SUPPLY_KEY).trim() === supplyBody.trim());

  if (!alreadyApplied) {
    for (const key of writtenBlocks) {
      if (blockBody(original, key).trim() !== "") {
        throw new Error(`${key} 블록이 이미 채워져 있습니다 (fail-closed). 먼저 기존 내용을 비운 뒤 적용하세요.`);
      }
    }
  }

  let next = original;
  if (!alreadyApplied) {
    next = replaceBlock(next, "AUTO:REGION_RESEARCH_SOURCES", sourcesBody);
    if (summaryBody !== null) next = replaceBlock(next, "AI:PENDING:SUMMARY", summaryBody);
    if (supplyBody !== null) next = replaceBlock(next, SUPPLY_KEY, supplyBody);
  }

  for (const key of untouched) {
    if (blockBody(next, key) !== untouchedBefore[key]) throw new Error(`보호 블록이 변경됐습니다: ${key}`);
  }
  assertProtectedIntact(original, next, writtenBlocks.includes(SUPPLY_KEY));

  const result = {
    changed: !alreadyApplied,
    reason: alreadyApplied ? "same_patch" : (options.dryRun ? "patch_planned" : "patch_applied"),
    region_key: patch.region_key,
    patched_at: patch.patched_at,
    sources_count: patch.sources.length,
    blocks: writtenBlocks.slice(),
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
  SUPPLY_KEY,
  validateSupplyPipeline,
  renderSupplyBlock,
  validatePatch,
  renderSummaryBlock,
  renderSourcesBlock,
  applySummaryPatch,
  parseArgs
});
