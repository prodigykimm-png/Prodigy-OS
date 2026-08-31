#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const core = require("./auction-key-value-core.js");

function arg(name, fallback = null) { const index = process.argv.indexOf(name); return index >= 0 ? process.argv[index + 1] : fallback; }
function writeJson(file, data) { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, JSON.stringify(data, null, 2) + "\n"); }
function writeCardSnapshot(file, snapshot) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `(function(root){\n  "use strict";\n  const snapshot = Object.freeze(${JSON.stringify(snapshot)});\n  root.AuctionKeyValueSnapshot = snapshot;\n  if (typeof module !== "undefined" && module.exports) module.exports = snapshot;\n})(typeof globalThis !== "undefined" ? globalThis : this);\n`);
}

function main() {
  const input = path.resolve(arg("--input"));
  const output = path.resolve(arg("--output", "SYSTEM/CACHE/auction-key-value/busan-officetel-2025-09_2026-08"));
  const cardSnapshot = path.resolve(arg("--card-snapshot", "SYSTEM/Views/auction-key-value-snapshot.js"));
  const generatedAt = arg("--generated-at", new Date().toISOString());
  const records = core.parseAuctCsv(fs.readFileSync(input, "utf8"), { sourceFile: path.basename(input) }).map((record) => {
    const [regionSido, regionSigungu] = record.parcel_address.split(/\s+/);
    return { ...record, region_sido: regionSido || null, region_sigungu: regionSigungu || null };
  });
  const auditRows = records.map((record) => ({ record_id: record.record_id, ...core.eligibility(record) }));
  const exclusions = auditRows.filter((row) => !row.eligible).reduce((acc, row) => { acc[row.reason] = (acc[row.reason] || 0) + 1; return acc; }, {});
  const snapshot = core.buildKeyValueSnapshot(records, { asOf: generatedAt, source: "AUCT CSV" });
  const groups = Object.values(snapshot.groups);
  const audit = {
    schema_version: "auction-key-value-audit.v1", input: path.basename(input), total_records: records.length,
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
