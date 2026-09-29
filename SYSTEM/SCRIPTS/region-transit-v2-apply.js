#!/usr/bin/env node
"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const pkgCore = require("./region-transit-package-core.js");
const v2Core = require("./region-transit-v2-core.js");

const CANDIDATE_REL = "SYSTEM/CACHE/region-transit/candidates/v2";
const MANIFEST_FILE = "manifest.json";
const APPROVAL_REL = "SYSTEM/CACHE/region-transit/approval/kric-region-approval.json";
const ALLOWED_ROOT_REL = "PARA/RESOURCES/Auction Regions";
const REQUIRED_STATUS = "candidate_not_publishable";
const REQUIRED_ENVELOPE = ["approved_at", "approved_by", "manifest_sha256", "scope_note"];

function sha256(buffer) {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function atomicWrite(targetPath, content) {
  const temporary = `${targetPath}.tmp-${process.pid}-${Date.now()}`;
  const mode = fs.statSync(targetPath).mode;
  const descriptor = fs.openSync(temporary, "wx", mode);
  try {
    fs.writeFileSync(descriptor, content, "utf8");
    fs.fsyncSync(descriptor);
  } finally {
    fs.closeSync(descriptor);
  }
  fs.renameSync(temporary, targetPath);
}

function frontmatter(content) {
  const match = content.match(/^---\n([\s\S]*?)\n---(?:\n|$)/);
  if (!match) throw new Error("YAML Frontmatter를 찾을 수 없습니다.");
  return match[1];
}

function scalar(block, key) {
  const matches = [...block.matchAll(new RegExp(`^${key}:\\s*(.*?)\\s*$`, "gm"))];
  if (matches.length !== 1) throw new Error(`Frontmatter ${key}는 정확히 1개여야 합니다.`);
  return matches[0][1].replace(/^['"]|['"]$/g, "");
}

function resolveInside(vaultRoot, candidate, allowedRoot, label) {
  const resolved = path.resolve(vaultRoot, candidate);
  if (!fs.existsSync(resolved)) throw new Error(`${label}이 존재하지 않습니다: ${candidate}`);
  const realResolved = fs.realpathSync(resolved);
  const realAllowed = fs.realpathSync(path.resolve(vaultRoot, allowedRoot));
  if (realResolved !== realAllowed && !realResolved.startsWith(realAllowed + path.sep)) {
    throw new Error(`${label}이 허용 경로 밖에 있습니다: ${candidate}`);
  }
  return realResolved;
}

function readApproval(vaultRoot) {
  const approvalPath = resolveInside(vaultRoot, APPROVAL_REL, path.dirname(APPROVAL_REL), "승인 봉투");
  const approval = JSON.parse(fs.readFileSync(approvalPath, "utf8"));
  if (!isObject(approval)) throw new Error("승인 봉투가 객체가 아닙니다.");
  for (const key of REQUIRED_ENVELOPE) {
    if (typeof approval[key] !== "string" || approval[key].trim() === "") {
      throw new Error(`승인 봉투에 ${key}가 없습니다. 사람 승인이 있어야 반영할 수 있습니다.`);
    }
  }
  if (approval.schema_version !== 1) throw new Error(`지원하지 않는 승인 봉투 schema_version: ${approval.schema_version}`);

  const manifestPath = resolveInside(vaultRoot, path.join(CANDIDATE_REL, MANIFEST_FILE), CANDIDATE_REL, "후보 manifest");
  const manifestRaw = fs.readFileSync(manifestPath);
  const actual = sha256(manifestRaw);
  if (actual !== approval.manifest_sha256) {
    throw new Error(`후보 manifest 해시가 승인 봉투와 다릅니다. approval=${approval.manifest_sha256} actual=${actual}`);
  }
  const manifest = JSON.parse(manifestRaw.toString("utf8"));
  if (manifest.status !== REQUIRED_STATUS) throw new Error(`후보 manifest status가 ${REQUIRED_STATUS}가 아닙니다: ${manifest.status}`);
  if (manifest.region_inputs_reachable !== false) throw new Error("후보 manifest가 region_inputs_reachable=false를 선언해야 합니다.");
  return { approval, manifest, manifestPath };
}

function loadProviderMaps(vaultRoot, manifest) {
  const maps = [];
  for (const entry of manifest.outputs) {
    const mapPath = resolveInside(vaultRoot, entry.path, CANDIDATE_REL, "provider 맵");
    const raw = fs.readFileSync(mapPath);
    const map = JSON.parse(raw.toString("utf8"));
    if (map.status !== REQUIRED_STATUS) throw new Error(`${entry.provider_id} status가 ${REQUIRED_STATUS}가 아닙니다.`);
    if (map.network_allowed !== false || map.region_inputs_reachable !== false) {
      throw new Error(`${entry.provider_id}가 격리 표시를 유지하지 않습니다. 게시할 수 없습니다.`);
    }
    v2Core.validateProviderMap(map, vaultRoot);
    if (entry.sha256 && entry.sha256 !== sha256(raw)) {
      throw new Error(`${entry.provider_id} 해시가 manifest와 다릅니다.`);
    }
    maps.push({ providerId: map.provider_id, operator: map.operator, map, path: entry.path, sha256: sha256(raw) });
  }
  return maps;
}

function collectByRegion(providerMaps) {
  const byRegion = new Map();
  for (const entry of providerMaps) {
    for (const station of entry.map.stations) {
      const regionKey = station.region_assignment && station.region_assignment.region_key;
      if (typeof regionKey !== "string" || regionKey.trim() === "") continue;
      if (station.region_assignment.method !== "official_address_admin_parse") {
        throw new Error(`역 ${station.station_name}의 귀속 방법이 공식 주소 파싱이 아닙니다: ${station.region_assignment.method}`);
      }
      if (!byRegion.has(regionKey)) byRegion.set(regionKey, []);
      byRegion.get(regionKey).push({ station, provider: entry });
    }
  }
  return byRegion;
}

function renderTransitBody(regionKey, stations) {
  const byLine = new Map();
  const operators = new Set();
  for (const item of stations) {
    const line = item.station.line_name;
    if (!byLine.has(line)) byLine.set(line, []);
    byLine.get(line).push(item.station.station_name);
    operators.add(item.provider.operator);
  }
  const lines = [];
  lines.push("### KRIC 도시철도 공식 스냅샷 확인 역");
  lines.push("");
  for (const line of [...byLine.keys()].sort()) {
    const names = byLine.get(line).slice().sort()
      .map((n) => n.replace(/[\\|<>]/g, "")).join(", ");
    lines.push("- " + line + " · " + names);
  }
  lines.push("");
  lines.push("<!-- 공급 근거: KRIC 도시철도 공식 스냅샷(2026-06-30), 주소 행정분해 기반 귀속 -->");
  lines.push("> 귀속 방법 official_address_admin_parse · 역 " + stations.length + "개 · 지역 " + regionKey);
  lines.push("> 운영주체 " + [...operators].sort().join("·"));
  lines.push("> 출처 https://data.kric.go.kr/rips/M_01_01/detail.do?id=32 (법제처 국가법령정보센터가 아닌 국가철도공단 KRIC 데이터)");
  return lines.join("\n");
}

function replaceTransitBlock(content, body) {
  const start = content.indexOf(pkgCore.TRANSIT_MARKER.start);
  const end = content.indexOf(pkgCore.TRANSIT_MARKER.end);
  if (start < 0 || end < 0) throw new Error("AUTO:REGION_TRANSIT 마커가 없습니다.");
  return content.slice(0, start + pkgCore.TRANSIT_MARKER.start.length) + "\n" + body + "\n" + content.slice(end);
}

const PROTECTED_BLOCKS = [
  "AI:PENDING:SUMMARY", "AI:PENDING:ZONES", "AI:PENDING:TRANSPORT_LIFE", "AI:PENDING:RISKS",
  "AI:PENDING:SITE_VISIT", "AI:PENDING:SUPPLY_PIPELINE", "AUTO:REGION_RESEARCH_SOURCES", "AUTO:REGION_RESEARCH_LOG"
];

function blockBody(content, key) {
  const start = `<!-- ${key}:START -->`;
  const end = `<!-- ${key}:END -->`;
  const s = content.indexOf(start);
  const e = content.indexOf(end);
  if (s < 0 || e < 0) throw new Error(`${key} 마커가 없습니다.`);
  return content.slice(s + start.length, e);
}

function applyRegions(options) {
  const vaultRoot = fs.realpathSync(path.resolve(options.vaultRoot ?? process.cwd()));
  const { approval, manifest } = readApproval(vaultRoot);
  const providerMaps = loadProviderMaps(vaultRoot, manifest);
  const byRegion = collectByRegion(providerMaps);

  const requested = options.regionKeys && options.regionKeys.length > 0
    ? options.regionKeys
    : [...byRegion.keys()].sort();
  const allowedRoot = path.join(vaultRoot, ALLOWED_ROOT_REL);
  const results = [];
  for (const regionKey of requested) {
    const stations = byRegion.get(regionKey);
    const targetPath = path.join(allowedRoot, `${regionKey}.md`);
    if (!fs.existsSync(targetPath)) {
      results.push({ region_key: regionKey, status: "no_note", stations: 0 });
      continue;
    }
    if (!stations) {
      results.push({ region_key: regionKey, status: "not_in_candidate", stations: 0 });
      continue;
    }
    const original = fs.readFileSync(targetPath, "utf8");
    const currentTransit = blockBody(original, "AUTO:REGION_TRANSIT").trim();
    if (options.onlyEmpty && currentTransit !== "") {
      results.push({ region_key: regionKey, status: "skipped_existing_transit", stations: stations.length });
      continue;
    }
    const fm = frontmatter(original);
    if (scalar(fm, "type") !== "auction_region") {
      throw new Error(`${regionKey}의 type이 auction_region이 아닙니다.`);
    }
    const filenameKey = path.basename(targetPath, ".md");
    if (filenameKey !== regionKey) throw new Error(`${targetPath} 파일명이 region_key와 다릅니다.`);
    const protectedBefore = PROTECTED_BLOCKS.map((key) => blockBody(original, key));
    const body = renderTransitBody(regionKey, stations);
    const rendered = replaceTransitBlock(original, body);
    const protectedAfter = PROTECTED_BLOCKS.map((key) => blockBody(rendered, key));
    for (const [index, key] of PROTECTED_BLOCKS.entries()) {
      if (protectedBefore[index] !== protectedAfter[index]) throw new Error(`보호 블록 ${key}가 변경됐습니다.`);
    }
    const changed = currentTransit !== body.trim();
    if (changed && !options.dryRun) atomicWrite(targetPath, rendered);
    results.push({
      region_key: regionKey,
      status: changed ? (options.dryRun ? "planned" : "applied") : "same",
      stations: stations.length,
      operators: [...new Set(stations.map((s) => s.provider.operator))].sort(),
      target_path: targetPath
    });
  }
  return {
    schema_version: 1,
    approval: { approved_at: approval.approved_at, approved_by: approval.approved_by, manifest_sha256: approval.manifest_sha256.slice(0, 16) },
    provider_maps: providerMaps.length,
    candidate_stations: manifest.accepted_station_count,
    covered_regions: byRegion.size,
    applied_regions: results.filter((r) => r.status === "applied").length,
    skipped_existing_transit: results.filter((r) => r.status === "skipped_existing_transit").length,
    only_empty: Boolean(options.onlyEmpty),
    dry_run: Boolean(options.dryRun),
    results
  };
}

function parseArgs(argv) {
  const options = { vaultRoot: process.cwd(), dryRun: false, execute: false, regionKeys: [] };
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    if (key === "--dry-run") { options.dryRun = true; continue; }
    if (key === "--execute") { options.execute = true; continue; }
    if (key === "--regions") {
      const value = argv[index + 1];
      if (value === undefined) throw new Error("--regions 값이 없습니다.");
      options.regionKeys = value.split(",").map((v) => v.trim()).filter(Boolean);
      index += 1;
      continue;
    }
    if (key === "--only-empty") { options.onlyEmpty = true; continue; }
    if (key === "--vault") { options.vaultRoot = argv[index + 1]; index += 1; continue; }
    throw new Error(`지원하지 않는 인자입니다: ${key}`);
  }
  if (!options.dryRun && !options.execute) options.dryRun = true;
  return options;
}

if (require.main === module) {
  try { process.stdout.write(`${JSON.stringify(applyRegions(parseArgs(process.argv.slice(2))), null, 2)}\n`); }
  catch (error) { process.stderr.write(`${error.stack || error.message}\n`); process.exitCode = 1; }
}

module.exports = Object.freeze({ applyRegions, readApproval, loadProviderMaps, collectByRegion, renderTransitBody, replaceTransitBlock, APPROVAL_REL, CANDIDATE_REL });
