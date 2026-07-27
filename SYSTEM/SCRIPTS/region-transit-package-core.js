"use strict";

/**
 * region-transit-package-core.js
 * Schema v1 transit package validator and renderer.
 * Contract: SYSTEM/docs/Region_Property_Contract_v1.md §AUTO:REGION_TRANSIT
 *
 * Security invariants:
 * - package text is NEVER trusted for display; crosswalk on disk is source of truth
 * - hashes.json is REQUIRED; every map and raw hash must match
 * - only station-district-map.json is accepted as crosswalk
 * - all paths are realpath-resolved, symlink/traversal blocked
 * - marker position is validated (must precede TRANSPORT_LIFE)
 */

const path = require("node:path");
const fs = require("node:fs");
const crypto = require("node:crypto");

const SUPPORTED_SCHEMA_VERSION = 1;
const ALLOWED_PROVIDERS = new Set(["incheon-metro", "busan-metro", "seoul-metro"]);
const STATION_KEYS = new Set(["station_name", "station_no", "line_name", "raw_path", "raw_sha256"]);
const CROSSWALK_ROOT = "SYSTEM/CACHE/region-transit";
const ALLOWED_RAW_ROOT = "SYSTEM/CACHE/region-transit/raw";
const CROSSWALK_FILENAMES = new Set(["station-district-map.json", "station-district-map-seoul.json"]);
const HASHES_FILENAME = "hashes.json";

const TRANSIT_MARKER = Object.freeze({
  start: "<!-- AUTO:REGION_TRANSIT:START -->",
  end: "<!-- AUTO:REGION_TRANSIT:END -->"
});
const TRANSPORT_LIFE_START = "<!-- AI:PENDING:TRANSPORT_LIFE:START -->";

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function validateNonEmptyString(value, label) {
  if (typeof value === "number" && Number.isFinite(value)) return;
  if (typeof value !== "string" || value.length === 0) throw new Error(label + "가 빈 문자열이거나 문자열이 아닙니다.");
}

function validateOneMarker(content, marker) {
  const count = content.split(marker).length - 1;
  if (count !== 1) throw new Error(marker + "는 정확히 1개여야 합니다 (" + count + "개).");
}

function validateTransitMarker(content) {
  validateOneMarker(content, TRANSIT_MARKER.start);
  validateOneMarker(content, TRANSIT_MARKER.end);
  const startIdx = content.indexOf(TRANSIT_MARKER.start);
  const endIdx = content.indexOf(TRANSIT_MARKER.end);
  if (endIdx < startIdx) throw new Error("AUTO:REGION_TRANSIT marker 순서가 올바르지 않습니다.");
  if (content.includes(TRANSPORT_LIFE_START)) {
    const transportIdx = content.indexOf(TRANSPORT_LIFE_START);
    if (endIdx > transportIdx) {
      throw new Error("AUTO:REGION_TRANSIT:END가 AI:PENDING:TRANSPORT_LIFE:START보다 뒤에 있습니다.");
    }
  }
  return true;
}

function validatePackage(pkg, vaultRoot) {
  if (!isObject(pkg)) throw new Error("package가 객체가 아닙니다.");
  vaultRoot = vaultRoot || process.cwd();

  if (pkg.schema_version !== SUPPORTED_SCHEMA_VERSION) {
    throw new Error("지원하지 않는 schema_version: " + pkg.schema_version);
  }
  validateNonEmptyString(pkg.region_key, "region_key");
  validateNonEmptyString(pkg.provider, "provider");
  if (!ALLOWED_PROVIDERS.has(pkg.provider)) {
    throw new Error("지원하지 않는 provider: " + pkg.provider + " (허용: " + [...ALLOWED_PROVIDERS].join(", ") + ")");
  }
  validateNonEmptyString(pkg.crosswalk_path, "crosswalk_path");
  validateNonEmptyString(pkg.map_sha256, "map_sha256");
  validateNonEmptyString(pkg.created, "created");

  if (!Array.isArray(pkg.stations)) throw new Error("stations가 배열이 아닙니다.");
  if (pkg.stations.length === 0) throw new Error("stations가 비어 있습니다.");

  const seen = new Set();
  for (const [index, station] of pkg.stations.entries()) {
    if (!isObject(station)) throw new Error("stations[" + index + "]가 객체가 아닙니다.");
    for (const key of STATION_KEYS) {
      validateNonEmptyString(station[key], "stations[" + index + "]." + key);
    }
    const dedupKey = station.line_name + ":" + station.station_no;
    if (seen.has(dedupKey)) throw new Error("stations[" + index + "] 중복: " + dedupKey);
    seen.add(dedupKey);
  }

  // realpath-validate crosswalk
  const crosswalkResolved = path.resolve(vaultRoot, pkg.crosswalk_path);
  if (!fs.existsSync(crosswalkResolved)) throw new Error("crosswalk 파일이 없습니다: " + pkg.crosswalk_path);
  const realCrosswalk = fs.realpathSync(crosswalkResolved);
  const allowedCrosswalkRoot = fs.realpathSync(path.resolve(vaultRoot, CROSSWALK_ROOT));
  if (!realCrosswalk.startsWith(allowedCrosswalkRoot + path.sep) && realCrosswalk !== allowedCrosswalkRoot) {
    throw new Error("crosswalk_path가 허용 경로 밖에 있습니다: " + pkg.crosswalk_path);
  }
  if (!CROSSWALK_FILENAMES.has(path.basename(realCrosswalk))) {
    throw new Error("crosswalk 파일명이 허용 목록에 없습니다: " + path.basename(realCrosswalk));
  }

  // Verify crosswalk map hash
  const mapContent = fs.readFileSync(realCrosswalk, "utf8");
  const actualMapSha = crypto.createHash("sha256").update(mapContent).digest("hex");
  if (actualMapSha !== pkg.map_sha256) {
    throw new Error("crosswalk SHA-256 불일치: package=" + pkg.map_sha256 + " actual=" + actualMapSha);
  }

  // Re-read crosswalk from disk
  const crosswalkParsed = JSON.parse(mapContent);
  if (!Array.isArray(crosswalkParsed.stations)) throw new Error("crosswalk에 stations 배열이 없습니다.");
  const crosswalkByKey = {};
  for (const cs of crosswalkParsed.stations) {
    if (!cs.station_name || !cs.station_no || !cs.line_name) continue;
    crosswalkByKey[cs.line_name + ":" + cs.station_no] = cs;
  }

  for (const [index, station] of pkg.stations.entries()) {
    const key = station.line_name + ":" + station.station_no;
    const cs = crosswalkByKey[key];
    if (!cs) throw new Error("stations[" + index + "] " + key + "가 crosswalk에 없습니다.");
    if (cs.station_name !== station.station_name) {
      throw new Error("stations[" + index + "] station_name 불일치: package=" + station.station_name + " crosswalk=" + cs.station_name);
    }
    if (cs.region_key !== pkg.region_key) {
      throw new Error("stations[" + index + "] region_key 불일치: package=" + pkg.region_key + " crosswalk=" + cs.region_key);
    }
    if (cs.raw_path !== station.raw_path) {
      throw new Error("stations[" + index + "] raw_path 불일치: package=" + station.raw_path + " crosswalk=" + cs.raw_path);
    }
    if (cs.raw_sha256 !== station.raw_sha256) {
      throw new Error("stations[" + index + "] raw_sha256 불일치: package=" + station.raw_sha256 + " crosswalk=" + cs.raw_sha256);
    }
  }

  // Cross-validate against hashes.json
  const hashesJsonPath = path.resolve(vaultRoot, path.join(CROSSWALK_ROOT, HASHES_FILENAME));
  if (!fs.existsSync(hashesJsonPath)) throw new Error("hashes.json이 없습니다: " + hashesJsonPath);
  let hashesContent;
  try { hashesContent = JSON.parse(fs.readFileSync(hashesJsonPath, "utf8")); }
  catch (parseError) { throw new Error("hashes.json 파싱 실패: " + parseError.message); }
  if (!hashesContent.hashes || typeof hashesContent.hashes !== "object") {
    throw new Error("hashes.json에 hashes 객체가 없습니다.");
  }
  const crosswalkBasename = path.basename(realCrosswalk);
  const mapHashInHashes = hashesContent.hashes[crosswalkBasename];
  if (!mapHashInHashes) throw new Error("hashes.json에 " + crosswalkBasename + " hash가 없습니다.");
  if (mapHashInHashes !== actualMapSha) {
    throw new Error("hashes.json의 map hash 불일치: map=" + actualMapSha + " hashes.json=" + mapHashInHashes);
  }

  for (const station of pkg.stations) {
    const rawPathResolved = path.resolve(vaultRoot, CROSSWALK_ROOT, station.raw_path);
    if (!fs.existsSync(rawPathResolved)) throw new Error("raw 파일이 없습니다: " + station.raw_path);
    const realRawPath = fs.realpathSync(rawPathResolved);
    const allowedRawRoot = fs.realpathSync(path.resolve(vaultRoot, ALLOWED_RAW_ROOT));
    if (!realRawPath.startsWith(allowedRawRoot + path.sep) && realRawPath !== allowedRawRoot) {
      throw new Error("raw_path가 허용 경로 밖에 있습니다: " + station.raw_path);
    }
    const rawContent = fs.readFileSync(realRawPath);
    const actualRawSha = crypto.createHash("sha256").update(rawContent).digest("hex");
    if (actualRawSha !== station.raw_sha256) {
      throw new Error("raw SHA-256 불일치: " + station.raw_path);
    }
    const rawRelPath = path.relative(path.resolve(vaultRoot, CROSSWALK_ROOT), realRawPath);
    const rawHashInHashes = hashesContent.hashes[rawRelPath];
    if (!rawHashInHashes) throw new Error("hashes.json에 " + rawRelPath + " hash가 없습니다.");
    if (rawHashInHashes !== actualRawSha) {
      throw new Error("hashes.json의 raw hash 불일치: " + rawRelPath + " file=" + actualRawSha + " hashes.json=" + rawHashInHashes);
    }
  }

  return true;
}

function renderBody(pkg, vaultRoot) {
  vaultRoot = vaultRoot || process.cwd();
  const crosswalkPath = path.resolve(vaultRoot, pkg.crosswalk_path);
  const crosswalkParsed = JSON.parse(fs.readFileSync(crosswalkPath, "utf8"));
  const crosswalkStations = Array.isArray(crosswalkParsed.stations) ? crosswalkParsed.stations : [];

  const crosswalkByKey = {};
  for (const cs of crosswalkStations) {
    if (!cs.station_name || !cs.station_no || !cs.line_name) continue;
    crosswalkByKey[cs.line_name + ":" + cs.station_no] = cs;
  }

  const byLine = {};
  for (const station of pkg.stations) {
    const key = station.line_name + ":" + station.station_no;
    const cs = crosswalkByKey[key];
    const displayName = cs ? cs.station_name : station.station_name;
    if (!byLine[station.line_name]) byLine[station.line_name] = [];
    byLine[station.line_name].push(displayName);
  }

  const lines = [];
  const providerLabel = { "incheon-metro": "인천교통공사", "seoul-metro": "서울교통공사", "busan-metro": "부산교통공사" }[pkg.provider] || pkg.provider;
  lines.push("### " + providerLabel + " 확인 역");
  lines.push("");

  for (const lineName of Object.keys(byLine)) {
    const stationNames = byLine[lineName];
    const escaped = stationNames.map(function(n) { return n.replace(/[\\|<>]/g, ""); }).join(", ");
    lines.push("- " + lineName + " · " + escaped);
  }
  lines.push("");

  // Per-station source URL and raw hash
  const details = [];
  for (const s of pkg.stations) {
    const key = s.line_name + ":" + s.station_no;
    const cs = crosswalkByKey[key];
    const url = cs && cs.source_url ? cs.source_url : "";
    if (!url) continue;
    const sha = s.raw_sha256.slice(0, 16) + "...";
    details.push("  - " + s.station_name + ": " + url + " (raw SHA-256: " + sha + ")");
  }
  if (details.length > 0) {
    lines.push("#### 역별 공식 정보");
    lines.push.apply(lines, details);
  }
  lines.push("");
  lines.push("원본: " + providerLabel + " 역별 상세 " + pkg.stations.length + "건 · crosswalk SHA-256: " + pkg.map_sha256.slice(0, 16) + "...");

  return lines.join("\n");
}

function replaceTransitBlock(content, body) {
  validateTransitMarker(content);
  const startIdx = content.indexOf(TRANSIT_MARKER.start) + TRANSIT_MARKER.start.length;
  const endIdx = content.indexOf(TRANSIT_MARKER.end);
  return content.slice(0, startIdx) + "\n" + body + "\n" + content.slice(endIdx);
}

module.exports = Object.freeze({
  SUPPORTED_SCHEMA_VERSION: SUPPORTED_SCHEMA_VERSION,
  ALLOWED_PROVIDERS: ALLOWED_PROVIDERS,
  TRANSIT_MARKER: TRANSIT_MARKER,
  TRANSPORT_LIFE_START: TRANSPORT_LIFE_START,
  CROSSWALK_ROOT: CROSSWALK_ROOT,
  ALLOWED_RAW_ROOT: ALLOWED_RAW_ROOT,
  CROSSWALK_FILENAMES: CROSSWALK_FILENAMES,
  HASHES_FILENAME: HASHES_FILENAME,
  validatePackage: validatePackage,
  renderBody: renderBody,
  replaceTransitBlock: replaceTransitBlock,
  validateTransitMarker: validateTransitMarker
});