#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const core = require("./auction-key-value-core.js");

function args(name) {
  return process.argv.reduce((values, value, index) => value === name && process.argv[index + 1] ? values.concat(process.argv[index + 1]) : values, []);
}
function arg(name, fallback = null) { return args(name)[0] || fallback; }
function writeJson(file, data) { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, JSON.stringify(data, null, 2) + "\n"); }
function writeCardSnapshot(file, snapshot) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `(function(root){\n  "use strict";\n  const snapshot = Object.freeze(${JSON.stringify(snapshot)});\n  root.AuctionKeyValueSnapshot = snapshot;\n  if (typeof module !== "undefined" && module.exports) module.exports = snapshot;\n})(typeof globalThis !== "undefined" ? globalThis : this);\n`);
}

function main() {
  const inputs = args("--input").map((file) => path.resolve(file));
  const normalizedSeeds = args("--seed-normalized").map((file) => path.resolve(file));
  if (!inputs.length && !normalizedSeeds.length) throw new Error("--input 또는 --seed-normalized가 하나 이상 필요합니다.");
  const output = path.resolve(arg("--output", "SYSTEM/CACHE/auction-key-value/all-regions-2025-09_2026-09"));
  const cardSnapshot = path.resolve(arg("--card-snapshot", "SYSTEM/Views/auction-key-value-snapshot.js"));
  const generatedAt = arg("--generated-at", new Date().toISOString());
  const sources = [];
  const imported = [];
  for (const seed of normalizedSeeds) {
    const rows = JSON.parse(fs.readFileSync(seed, "utf8"));
    if (!Array.isArray(rows)) throw new Error(`정규 레코드 배열이 아닙니다: ${seed}`);
    sources.push({ file: path.basename(seed).normalize("NFC"), kind: "normalized", records: rows });
    imported.push(...rows);
  }
  for (const input of inputs) {
    const sourceFile = path.basename(input).normalize("NFC");
    const rows = core.parseAuctCsv(fs.readFileSync(input, "utf8"), { sourceFile });
    sources.push({ file: sourceFile, kind: "csv", records: rows });
    imported.push(...rows);
  }
  const recordsById = new Map();
  for (const importedRecord of imported) {
    const region = core.parseRegion(importedRecord.parcel_address);
    const record = {
      ...importedRecord,
      property_type: core.canonicalPropertyType(importedRecord.property_type),
      region_sido: importedRecord.region_sido || region.sido,
      region_sigungu: importedRecord.region_sigungu || region.sigungu
    };
    if (!recordsById.has(record.record_id)) recordsById.set(record.record_id, Object.freeze(record));
  }
  const records = [...recordsById.values()];
  const auditRows = records.map((record) => ({ record_id: record.record_id, ...core.eligibility(record) }));
  const exclusions = auditRows.filter((row) => !row.eligible).reduce((acc, row) => { acc[row.reason] = (acc[row.reason] || 0) + 1; return acc; }, {});
  const snapshot = core.buildKeyValueSnapshot(records, { asOf: generatedAt, source: "AUCT CSV" });
  const groups = Object.values(snapshot.groups);
  const propertyTypes = records.reduce((counts, record) => {
    counts[record.property_type] = (counts[record.property_type] || 0) + 1;
    return counts;
  }, {});
  const audit = {
    schema_version: "auction-key-value-audit.v1",
    input: inputs.length === 1 && !normalizedSeeds.length ? path.basename(inputs[0]).normalize("NFC") : null,
    inputs: sources.map((source) => source.file),
    source_counts: Object.fromEntries(sources.map((source) => [source.file, source.records.length])),
    total_records: records.length,
    duplicates: imported.length - records.length,
    property_types: propertyTypes,
    legal_dong_parsed: records.filter((row) => row.legal_dong).length, eligible: auditRows.filter((row) => row.eligible).length,
    exclusions, groups: groups.length, usable_groups: groups.filter((group) => group.confidence === "usable").length,
    concentrated_groups: groups.filter((group) => group.confidence === "sample_concentrated").length,
    insufficient_groups: groups.filter((group) => group.confidence === "sample_insufficient").length,
    snapshot_hash: snapshot.content_hash
  };
  writeJson(path.join(output, "normalized.json"), records);
  writeJson(path.join(output, "snapshot.json"), snapshot);
  writeJson(path.join(output, "audit.json"), audit);
  writeCardSnapshot(cardSnapshot, snapshot);
  console.log(JSON.stringify(audit, null, 2));
}

try { main(); } catch (error) { console.error(error.stack || error.message); process.exit(1); }
