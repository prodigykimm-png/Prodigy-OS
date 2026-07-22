#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const registryCore = require("./region-metrics-registry-core.js");

const MANIFEST_REL = "SYSTEM/SCRIPTS/region-metrics-busan-manifest.json";
const REGISTRY_REL = "SYSTEM/SCRIPTS/region-metrics-manifest-index.json";
const OBJECT_ROOT_REL = "PARA/RESOURCES/Auction Regions";
const SUPPLY_START = "<!-- AI:PENDING:SUPPLY_PIPELINE:START -->";
const SUPPLY_END = "<!-- AI:PENDING:SUPPLY_PIPELINE:END -->";
const LAND_START = "<!-- AUTO:REGION_LAND_PRICE:START -->";
const LAND_END = "<!-- AUTO:REGION_LAND_PRICE:END -->";
const HISTORY_MARKER = "<!-- PRODIGY_REGION_METRICS_HISTORY -->";
const DISPLAY_MARKER = "<!-- PRODIGY_REGION_METRICS_DISPLAY: regenerated from frontmatter; do not hand-edit values -->";
const NEW_FRONTMATTER = Object.freeze([
  "move_in_36m:",
  "move_in_48m:",
  "move_in_60m:",
  "land_price_trend_yoy:",
  "land_price_trend_as_of:",
  "land_price_trend_scope:",
  "land_price_trend_source:"
]);
const NEW_DISPLAY_ROWS = Object.freeze([
  "| 입주 예정 36개월 | — | 세대 | 과거 snapshot 제공 범위 미상 |",
  "| 입주 예정 48개월 | — | 세대 | 과거 snapshot 제공 범위 미상 |",
  "| 입주 예정 60개월 | — | 세대 | 과거 snapshot 제공 범위 미상 |"
]);

function assertOne(content, token, label) {
  const count = content.split(token).length - 1;
  if (count !== 1) throw new Error(`${label}는 정확히 1개여야 합니다: ${count}`);
}

function frontmatter(content) {
  const match = content.match(/^---\n([\s\S]*?)\n---\n/);
  if (!match) throw new Error("YAML frontmatter를 찾을 수 없습니다.");
  return { block: match[1], end: match[0].length };
}

function yamlScalar(block, key) {
  const matches = [...block.matchAll(new RegExp(`^${key}:\\s*(.*?)\\s*$`, "gm"))];
  if (matches.length !== 1) throw new Error(`Frontmatter ${key}는 정확히 1개여야 합니다.`);
  return matches[0][1].replace(/^['"]|['"]$/g, "");
}

function insertFrontmatter(block) {
  for (const line of NEW_FRONTMATTER) {
    const key = line.slice(0, -1);
    const count = [...block.matchAll(new RegExp(`^${key}:`, "gm"))].length;
    if (count > 1) throw new Error(`Frontmatter ${key}가 중복됩니다.`);
  }
  const missing = NEW_FRONTMATTER.filter((line) => !new RegExp(`^${line.slice(0, -1)}:`, "m").test(block));
  if (missing.length === 0) return { block, changed: false };
  const anchor = /^households:.*$/m;
  if (!anchor.test(block)) throw new Error("Frontmatter households 삽입 위치를 찾을 수 없습니다.");
  return { block: block.replace(anchor, `${missing.join("\n")}\n$&`), changed: true };
}

function migrateHistory(content) {
  assertOne(content, HISTORY_MARKER, "지표 히스토리 마커");
  const markerAt = content.indexOf(HISTORY_MARKER);
  const nextHeading = content.indexOf("\n## ", markerAt + HISTORY_MARKER.length);
  const end = nextHeading === -1 ? content.length : nextHeading;
  const segment = content.slice(markerAt + HISTORY_MARKER.length, end);
  if (/^> \[!abstract\]- 원본 지표 이력/m.test(segment)) return { content, changed: false };
  const matches = [...segment.matchAll(/```json\n([\s\S]*?)\n```/g)];
  if (matches.length !== 1) throw new Error("기존 지표 히스토리 JSON 코드펜스는 정확히 1개여야 합니다.");
  try { JSON.parse(matches[0][1]); } catch (error) { throw new Error(`기존 지표 히스토리 JSON 파싱 실패: ${error.message}`); }
  const encoded = matches[0][1].split("\n").map((line) => `> ${line}`).join("\n");
  const replacement = `> [!abstract]- 원본 지표 이력\n> \`\`\`json\n${encoded}\n> \`\`\``;
  const start = markerAt + HISTORY_MARKER.length + matches[0].index;
  const finish = start + matches[0][0].length;
  return { content: `${content.slice(0, start)}\n${replacement}${content.slice(finish)}`, changed: true };
}

function migrateDisplay(content) {
  assertOne(content, DISPLAY_MARKER, "시장 지표 표시 마커");
  const markerAt = content.indexOf(DISPLAY_MARKER);
  const nextHeading = content.indexOf("\n## ", markerAt + DISPLAY_MARKER.length);
  if (nextHeading === -1) throw new Error("시장 지표 표 다음 섹션을 찾을 수 없습니다.");
  const segment = content.slice(markerAt, nextHeading);
  const existing = NEW_DISPLAY_ROWS.filter((row) => segment.includes(row.split(" | ")[1]));
  if (existing.length === NEW_DISPLAY_ROWS.length) return { content, changed: false };
  if (existing.length !== 0) throw new Error("36/48/60개월 표시 행이 부분적으로만 존재합니다.");
  const anchor = "| 세대수 |";
  const anchorAt = content.indexOf(anchor, markerAt);
  if (anchorAt < 0 || anchorAt >= nextHeading) throw new Error("시장 지표 표의 세대수 행을 찾을 수 없습니다.");
  return { content: `${content.slice(0, anchorAt)}${NEW_DISPLAY_ROWS.join("\n")}\n${content.slice(anchorAt)}`, changed: true };
}

function migrateSections(content) {
  const transportHeading = "## 교통·생활";
  assertOne(content, transportHeading, "교통·생활 heading");
  const transportAt = content.indexOf(transportHeading);
  let next = content;
  if (next.includes(SUPPLY_START) || next.includes(SUPPLY_END)) {
    assertOne(next, SUPPLY_START, "중장기 공급 시작 마커");
    assertOne(next, SUPPLY_END, "중장기 공급 종료 마커");
  } else {
    const marketEnd = "<!-- AUTO:REGION_MARKET:END -->";
    assertOne(next, marketEnd, "시장·공급 종료 마커");
    const afterMarket = next.indexOf(marketEnd) + marketEnd.length;
    next = `${next.slice(0, afterMarket)}\n\n## 중장기 공급 파이프라인\n\n${SUPPLY_START}\n${SUPPLY_END}${next.slice(afterMarket)}`;
  }
  if (next.includes(LAND_START) || next.includes(LAND_END)) {
    assertOne(next, LAND_START, "지가 시작 마커");
    assertOne(next, LAND_END, "지가 종료 마커");
  } else {
    const refreshedTransportAt = next.indexOf(transportHeading);
    if (refreshedTransportAt < 0) throw new Error("지가 기준 삽입 위치를 찾을 수 없습니다.");
    next = `${next.slice(0, refreshedTransportAt)}## 지가 기준\n\n${LAND_START}\n${LAND_END}\n\n${next.slice(refreshedTransportAt)}`;
  }
  return { content: next, changed: next !== content, transportAt };
}

function humanBlocks(content) {
  return content.match(/<!-- HUMAN(?:[:][A-Z]+)? -->[\s\S]*?(?=<!--|\n## |$)/g) ?? [];
}

function migrateContent(original, expectedRegionKey) {
  const eol = original.includes("\r\n") ? "\r\n" : "\n";
  let content = original.replace(/\r\n/g, "\n");
  const beforeHuman = humanBlocks(content);
  const fm = frontmatter(content);
  if (yamlScalar(fm.block, "type") !== "auction_region") throw new Error("대상 type은 auction_region이어야 합니다.");
  const regionKey = `${yamlScalar(fm.block, "region_sido")}-${yamlScalar(fm.block, "region_sigungu")}`;
  if (regionKey !== expectedRegionKey) throw new Error(`대상 지역키가 일치하지 않습니다: ${regionKey}`);
  const inserted = insertFrontmatter(fm.block);
  const contractLines = inserted.block.match(/^# Contract v[\d.]+.*$/gm) ?? [];
  if (contractLines.length !== 1) throw new Error("Contract version 주석은 정확히 1개여야 합니다.");
  content = `---\n${inserted.block.replace(/^# Contract v[\d.]+.*$/m, "# Contract v1.4.0 — SYSTEM/docs/Region_Property_Contract_v1.md")}\n---\n${content.slice(fm.end)}`;
  content = migrateDisplay(content).content;
  content = migrateHistory(content).content;
  content = migrateSections(content).content;
  if (JSON.stringify(beforeHuman) !== JSON.stringify(humanBlocks(content))) throw new Error("HUMAN 블록이 변경됐습니다.");
  return { content: eol === "\n" ? content : content.replace(/\n/g, eol), changed: content !== original.replace(/\r\n/g, "\n"), region_key: regionKey };
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

function inside(root, target) {
  const relative = path.relative(root, target);
  return relative !== "" && !relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative);
}

function validateManifest(manifest) {
  const manifestPath = "selected-manifest.json";
  registryCore.validateRegistry({
    schema_version: registryCore.SUPPORTED_SCHEMA_VERSION,
    manifests: [{ sido: manifest?.sido, manifest_path: manifestPath }]
  }, { [manifestPath]: manifest });
  return true;
}

function loadManifest(manifestPath) {
  let manifest;
  try { manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8")); }
  catch (error) { throw new Error(`manifest JSON 파싱 실패: ${error.message}`); }
  validateManifest(manifest);
  return manifest;
}

function loadRegistryFromTexts(indexJson, manifestJsonByPath) {
  return registryCore.loadRegistry(indexJson, manifestJsonByPath);
}

function resolveVaultFile(vaultRoot, candidate, label) {
  if (typeof candidate !== "string" || candidate.length === 0) throw new Error(`${label} 경로가 비어 있습니다.`);
  const resolved = path.resolve(vaultRoot, candidate);
  if (!inside(vaultRoot, resolved)) throw new Error(`${label} 경로가 vault 밖에 있습니다: ${candidate}`);
  return resolved;
}

function loadRegistry(vaultRoot, registryRelativePath) {
  const registryPath = resolveVaultFile(vaultRoot, registryRelativePath, "registry");
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
    const manifestRelativePath = registryCore.validateManifestPath(entry.manifest_path);
    const manifestPath = path.resolve(path.dirname(registryPath), manifestRelativePath);
    if (!inside(vaultRoot, manifestPath)) throw new Error(`registry manifest 경로가 vault 밖에 있습니다: ${manifestRelativePath}`);
    if (!fs.existsSync(manifestPath)) throw new Error(`registry manifest 파일이 없습니다: ${manifestPath}`);
    manifestJsonByPath[manifestRelativePath] = fs.readFileSync(manifestPath, "utf8");
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

function resolveManifestSelection(vaultRoot, options) {
  if (options.sido) {
    if (options.manifestSpecified) throw new Error("--sido와 --manifest는 동시에 사용할 수 없습니다.");
    return selectManifest(loadRegistry(vaultRoot, options.registry), options);
  }
  const manifestPath = resolveVaultFile(vaultRoot, options.manifest, "manifest");
  return Object.freeze({ manifest: loadManifest(manifestPath), manifest_path: manifestPath });
}

function selectRegions(manifest, options) {
  if (options.all) return manifest.regions.slice();
  const matches = manifest.regions.filter((region) => region.region_key === options.regionKey);
  if (matches.length === 0) throw new Error(`manifest에 없는 region_key: ${options.regionKey}`);
  if (matches.length > 1) throw new Error(`manifest에 region_key가 ${matches.length}개 있습니다: ${options.regionKey}`);
  return matches;
}

function migrateRegions(options) {
  const vaultRoot = fs.realpathSync(path.resolve(options.vaultRoot ?? process.cwd()));
  const selectedOptions = {
    ...options,
    all: Boolean(options.all),
    sido: options.sido ?? null,
    manifest: options.manifest ?? MANIFEST_REL,
    manifestSpecified: Boolean(options.manifestSpecified),
    registry: options.registry ?? REGISTRY_REL,
    registrySpecified: Boolean(options.registrySpecified)
  };
  const selected = resolveManifestSelection(vaultRoot, selectedOptions);
  const regions = selectRegions(selected.manifest, selectedOptions);
  const objectRoot = path.join(vaultRoot, OBJECT_ROOT_REL);
  const realRoot = fs.realpathSync(objectRoot);
  const results = regions.map((region) => {
    const candidate = path.join(objectRoot, `${region.region_key}.md`);
    const target = fs.realpathSync(candidate);
    if (!inside(realRoot, target)) throw new Error(`대상 Region Object가 허용 경로 밖에 있습니다: ${target}`);
    const original = fs.readFileSync(target, "utf8");
    const migrated = migrateContent(original, region.region_key);
    if (migrated.changed && selectedOptions.execute) atomicWrite(target, migrated.content);
    return { region_key: region.region_key, changed: migrated.changed, status: migrated.changed ? (selectedOptions.execute ? "migrated" : "planned") : "already_v1_4", target_path: target };
  });
  return { mode: selectedOptions.execute ? "execute" : "dry-run", manifest: selected.manifest_path, selected_count: results.length, changed_count: results.filter((result) => result.changed).length, results };
}

function parseArgs(argv) {
  const options = {
    vaultRoot: process.cwd(),
    execute: false,
    all: false,
    regionKey: null,
    sido: null,
    manifest: MANIFEST_REL,
    manifestSpecified: false,
    registry: REGISTRY_REL,
    registrySpecified: false,
    allBusan: false
  };
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    if (key === "--execute") { options.execute = true; continue; }
    if (key === "--all") { options.all = true; continue; }
    if (key === "--all-busan") { options.all = true; options.allBusan = true; continue; }
    const value = argv[index + 1];
    if (!key?.startsWith("--") || value === undefined) throw new Error(`인자는 --key value 형식이어야 합니다: ${key}`);
    index += 1;
    if (key === "--vault") options.vaultRoot = value;
    else if (key === "--registry") { options.registry = value; options.registrySpecified = true; }
    else if (key === "--sido") options.sido = value;
    else if (key === "--manifest") { options.manifest = value; options.manifestSpecified = true; }
    else if (key === "--region-key") options.regionKey = value;
    else throw new Error(`지원하지 않는 인자입니다: ${key}`);
  }
  if (options.allBusan && options.sido && options.sido !== "부산광역시") throw new Error("--all-busan은 부산광역시만 선택할 수 있습니다.");
  if (options.allBusan) options.sido = "부산광역시";
  if (options.all === Boolean(options.regionKey)) throw new Error("--all 또는 --region-key 중 정확히 하나가 필요합니다.");
  if (options.sido && options.manifestSpecified) throw new Error("--sido와 --manifest는 동시에 사용할 수 없습니다.");
  if (options.registrySpecified && !options.sido) throw new Error("--registry에는 --sido가 필요합니다.");
  if (options.registrySpecified && options.manifestSpecified) throw new Error("--registry와 --manifest는 동시에 사용할 수 없습니다.");
  if (options.regionKey && !/^.+-.+$/u.test(options.regionKey)) throw new Error("--region-key 형식이 올바르지 않습니다.");
  return options;
}

if (require.main === module) {
  try { process.stdout.write(`${JSON.stringify(migrateRegions(parseArgs(process.argv.slice(2))), null, 2)}\n`); }
  catch (error) { process.stderr.write(`${error.stack ?? error.message}\n`); process.exitCode = 1; }
}

module.exports = Object.freeze({
  migrateContent,
  migrateRegions,
  parseArgs,
  validateManifest,
  loadManifest,
  loadRegistryFromTexts,
  loadRegistry,
  selectManifest,
  resolveManifestSelection,
  selectRegions,
  MANIFEST_REL,
  REGISTRY_REL
});
