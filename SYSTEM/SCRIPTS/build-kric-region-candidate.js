#!/usr/bin/env node
"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

const VAULT = path.resolve(__dirname, "../..");
const XLSX_REL = "SYSTEM/CACHE/region-transit/raw/kric/urban-rail-stations-20260630.xlsx";
const OUT_REL = "SYSTEM/CACHE/region-transit/candidates/kric-urban-stations-national-candidate.json";
const MANIFEST_INDEX_REL = "SYSTEM/SCRIPTS/region-metrics-manifest-index.json";
const SOURCE_URL = "https://data.kric.go.kr/rips/M_01_01/detail.do?id=32";

function sha256(buffer) {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

function readXlsx() {
  const abs = path.join(VAULT, XLSX_REL);
  const shared = readZipEntry(abs, "xl/sharedStrings.xml");
  const sheet = readZipEntry(abs, "xl/worksheets/sheet1.xml");
  const strings = [...shared.matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) => {
    const parts = [...m[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((t) => t[1]);
    return parts.join("").replace(/<[^>]+>/g, "");
  });
  const value = (raw) => {
    const n = Number(raw.replace(/<[^>]+>/g, ""));
    return strings[n] ?? raw.replace(/<[^>]+>/g, "");
  };
  return [...sheet.matchAll(/<row[^>]*r="(\d+)"[^>]*>([\s\S]*?)<\/row>/g)].map((m) => {
    const cells = {};
    for (const cell of m[2].matchAll(/<c[^>]*r="([A-Z]+)\d+"[^>]*>([\s\S]*?)<\/c>/g)) {
      cells[cell[1]] = value(cell[2]);
    }
    return { row: Number(m[1]), cells };
  });
}

function readZipEntry(archiveAbs, entry) {
  const out = execFileSync("unzip", ["-p", archiveAbs, entry], { maxBuffer: 64 * 1024 * 1024 });
  return out.toString("utf8");
}

function loadRegions() {
  const index = JSON.parse(fs.readFileSync(path.join(VAULT, MANIFEST_INDEX_REL), "utf8"));
  const bySido = new Map();
  for (const entry of index.manifests) {
    const manifest = JSON.parse(fs.readFileSync(path.join(path.dirname(path.join(VAULT, MANIFEST_INDEX_REL)), entry.manifest_path), "utf8"));
    if (!bySido.has(manifest.sido)) bySido.set(manifest.sido, new Map());
    for (const region of manifest.regions) bySido.get(manifest.sido).set(region.sigungu, region.region_key);
  }
  return bySido;
}

function matchRegion(address, bySido) {
  if (typeof address !== "string") return null;
  const parts = address.replace(/\s+/g, " ").trim().split(" ");
  if (parts.length < 2) return null;
  const sidoToken = parts[0];
  let sido = null;
  for (const name of bySido.keys()) {
    const base = name.replace(/(특별자치)?(시|도)$/, "");
    if (name === sidoToken || base === sidoToken) { sido = name; break; }
  }
  if (!sido) return null;
  const map = bySido.get(sido);
  const sigungu = parts[1];
  if (!map || !map.has(sigungu)) return null;
  return map.get(sigungu);
}

const HANJA = /[\u4E00-\u9FFF]/;
const HANGUL = /[\uAC00-\uD7A3]/;
const LATIN = /[A-Za-z]/;
const PLACEHOLDER = /^[-–—\s.·]+$/;
const ADDRESS_LIKE = /\d+\s*\)|\d{3,}\s*[-–]\s*\d+/;
const MAX_NAME_LENGTH = 30;

function pickStationName(cells) {
  for (const col of ["B", "A"]) {
    const value = cells[col];
    if (typeof value === "string" && value.trim() !== "" && HANGUL.test(value) && !HANJA.test(value)) {
      return value.trim();
    }
  }
  return null;
}

function pickOperator(cells) {
  for (const col of ["I", "L"]) {
    const value = cells[col];
    if (typeof value === "string" && value.trim() !== "") return value.trim();
  }
  return null;
}

function pickLat(cells) {
  for (const col of ["J", "H"]) {
    const value = Number(cells[col]);
    if (Number.isFinite(value) && value >= 33 && value <= 39) return value;
  }
  return null;
}

function pickLng(cells) {
  for (const col of ["K", "M"]) {
    const value = Number(cells[col]);
    if (Number.isFinite(value) && value >= 124 && value <= 132) return value;
  }
  return null;
}

function build() {
  const abs = path.join(VAULT, XLSX_REL);
  const raw = fs.readFileSync(abs);
  const rawSha = sha256(raw);
  const bySido = loadRegions();
  const rows = readXlsx();

  const identity = new Map();
  const unresolved = [];
  let parsed = 0;
  let unmapped = 0;

  for (const { cells } of rows) {
    const name = pickStationName(cells);
    const address = cells.M;
    if (!name || !address) continue;
    parsed += 1;
    if (PLACEHOLDER.test(name) || name.length > MAX_NAME_LENGTH || ADDRESS_LIKE.test(name) || (HANJA.test(name) && LATIN.test(name))) {
      unresolved.push({ identity: `${cells.A}:${cells.C}`, reason: "unverified station name layout", row: { station_name: name, official_address: address } });
      continue;
    }
    const regionKey = matchRegion(address, bySido);
    if (!regionKey) { unmapped += 1; continue; }
    const lat = pickLat(cells);
    const lng = pickLng(cells);
    const operator = pickOperator(cells);
    if (lat === null || lng === null || !operator) { unmapped += 1; continue; }
    if (PLACEHOLDER.test(operator) || operator.trim().length < 2) {
      unresolved.push({ identity: `${cells.A}:${cells.C}`, reason: "placeholder operator", row: { station_name: name, operator, official_address: address } });
      continue;
    }
    const station = {
      station_code: cells.A,
      station_name: name,
      line_code: cells.C,
      line_name: cells.D,
      operator,
      official_address: address,
      lat,
      lng,
      data_as_of: cells.O,
      region_key_from_address: regionKey,
      match_status: "boundary_pending",
      source_url: SOURCE_URL,
      raw_path: "raw/kric/urban-rail-stations-20260630.xlsx",
      raw_sha256: rawSha
    };
    const key = `${station.station_code}:${station.line_code}`;
    const existing = identity.get(key);
    if (!existing) { identity.set(key, station); continue; }
    const same = existing.station_name === station.station_name
      && existing.official_address === station.official_address
      && existing.lat === station.lat && existing.lng === station.lng;
    if (same) continue;
    if (existing) identity.set(key, null);
    unresolved.push({ identity: key, reason: "conflicting official duplicate", stations: [existing, station] });
  }

  const stations = [...identity.values()].filter(Boolean);
  const regions = new Set(stations.map((s) => s.region_key_from_address));
  const bySidoCount = {};
  for (const station of stations) {
    const sido = station.region_key_from_address.split("-")[0];
    bySidoCount[sido] = (bySidoCount[sido] ?? 0) + 1;
  }

  const candidate = {
    schema_version: 1,
    status: "candidate_not_publishable",
    reason: "National rebuild of the KRIC urban-rail snapshot. Region assignment is address-derived and pending human review; no Region writer path is granted by this file.",
    provider: "kric-urban-stations-national",
    source_url: SOURCE_URL,
    source_file: XLSX_REL,
    raw_path: "raw/kric/urban-rail-stations-20260630.xlsx",
    raw_sha256: rawSha,
    generated_at: new Date().toISOString(),
    station_count: stations.length,
    region_count: regions.size,
    stations
  };

  const outAbs = path.join(VAULT, OUT_REL);
  fs.mkdirSync(path.dirname(outAbs), { recursive: true });
  fs.writeFileSync(outAbs, JSON.stringify(candidate, null, 2));

  return {
    output: OUT_REL,
    output_sha256: sha256(fs.readFileSync(outAbs)),
    raw_sha256: rawSha,
    parsed_rows: parsed,
    accepted_stations: stations.length,
    unmapped_rows: unmapped,
    covered_regions: regions.size,
    stations_by_sido: bySidoCount,
    unresolved
  };
}

if (require.main === module) {
  try { process.stdout.write(`${JSON.stringify(build(), null, 2)}\n`); }
  catch (error) { process.stderr.write(`${error.stack || error.message}\n`); process.exitCode = 1; }
}

module.exports = Object.freeze({ build, matchRegion, OUT_REL, XLSX_REL });
