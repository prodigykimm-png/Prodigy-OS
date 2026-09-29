#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");

const VAULT = path.resolve(__dirname, "../..");
const SUPPLY_REL = "SYSTEM/CACHE/region-metrics/_shared/supply.csv";
const MANIFEST_INDEX_REL = "SYSTEM/SCRIPTS/region-metrics-manifest-index.json";
const PATCH_DIR_REL = "SYSTEM/CACHE/region-summary-patches";
const SOURCE_ID = "S-REB-SUPPLY";
const SOURCE_URL = "https://www.reb.or.kr/r-ia/";
const SOURCE_INSTITUTION = "한국부동산원";
const PATCHED_AT = "2026-09-29";
const HEADING = "> **AI 제안 · 확인 필요:** 한국부동산원 입주예정 자료에 공식 공표된 사업이다(원본 15111714, 2026-01~2027-12 기준). 세대수와 입주예정월은 사업시행 계획이므로 변동될 수 있고, 자료에 단계 정보가 없어 기재하지 않는다. 확정 입주물량과는 별개다.";

function parseCsvLine(line) {
  const cells = [];
  let current = "";
  let quoted = false;
  for (const char of line) {
    if (char === '"') { quoted = !quoted; continue; }
    if (char === "," && !quoted) { cells.push(current); current = ""; continue; }
    current += char;
  }
  cells.push(current);
  return cells.map((value) => value.trim());
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

function toUnits(raw) {
  const value = Number(String(raw).replace(/[^\d]/g, ""));
  return Number.isInteger(value) && value > 0 ? value : null;
}

function build() {
  const bySido = loadRegions();
  const lines = fs.readFileSync(path.join(VAULT, SUPPLY_REL), "utf8").split("\n").filter((line) => line.trim() !== "");
  const header = parseCsvLine(lines[0]);
  const column = Object.fromEntries(header.map((name, index) => [name, index]));

  const perRegion = new Map();
  const skipped = { region: 0, units: 0, month: 0, duplicate: 0 };
  for (const line of lines.slice(1)) {
    const cells = parseCsvLine(line);
    const month = cells[column["입주예정월"]];
    const kind = cells[column["사업유형"]];
    const address = cells[column["주소"]];
    const name = cells[column["아파트명"]];
    const units = toUnits(cells[column["세대수"]]);
    const parts = String(address).replace(/\s+/g, " ").trim().split(" ");
    const key = bySido.has(parts[0]) ? bySido.get(parts[0]).get(parts[1] ?? "") : null;
    if (!key) { skipped.region += 1; continue; }
    if (!units) { skipped.units += 1; continue; }
    if (!/^20\d{2}-\d{2}$/.test(month ?? "")) { skipped.month += 1; continue; }
    if (!name) { skipped.duplicate += 1; continue; }
    if (!perRegion.has(key)) perRegion.set(key, new Map());
    const rowKey = `${name}|${month}`;
    if (perRegion.get(key).has(rowKey)) { skipped.duplicate += 1; continue; }
    perRegion.get(key).set(rowKey, {
      project_name: name,
      stage: "scheduled",
      units,
      expected_month: month,
      ...(kind ? { kind } : {}),
      source_ids: [SOURCE_ID]
    });
  }

  const written = [];
  for (const [regionKey, rowsByKey] of perRegion) {
    const items = [...rowsByKey.values()].sort((a, b) => a.expected_month.localeCompare(b.expected_month));
    const patch = {
      schema_version: 1,
      region_key: regionKey,
      patched_at: PATCHED_AT,
      sources: [{
        source_id: SOURCE_ID,
        source_type: "official_primary",
        institution: SOURCE_INSTITUTION,
        title: "입주예정 자료(입주예정월·세대수), 원본 15111714",
        url: SOURCE_URL,
        accessed_at: PATCHED_AT
      }],
      supply_heading: HEADING,
      reference_month: "2026-10",
      supply_pipeline: items
    };
    const target = path.join(VAULT, PATCH_DIR_REL, regionKey, `${PATCHED_AT}-supply.json`);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, JSON.stringify(patch, null, 2));
    written.push({ region_key: regionKey, rows: items.length });
  }
  return { source: SUPPLY_REL, regions: written.length, rows: written.reduce((a, w) => a + w.rows, 0), skipped, written };
}

if (require.main === module) {
  try {
    const result = build();
    process.stdout.write(`${JSON.stringify({ ...result, written: undefined, sample: result.written.slice(0, 5) }, null, 2)}\n`);
  } catch (error) {
    process.stderr.write(`${error.stack || error.message}\n`);
    process.exitCode = 1;
  }
}

module.exports = Object.freeze({ build, parseCsvLine, HEADING, SOURCE_ID, PATCHED_AT });
