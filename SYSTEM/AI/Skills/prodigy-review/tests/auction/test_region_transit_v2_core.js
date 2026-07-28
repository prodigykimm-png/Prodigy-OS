"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { validateProviderMap } = require("../../../../../SCRIPTS/region-transit-v2-core.js");

const root = fs.mkdtempSync(path.join(os.tmpdir(), "prodigy-transit-v2-"));
const rawDir = path.join(root, "SYSTEM/CACHE/region-transit/raw/provider");
fs.mkdirSync(rawDir, { recursive: true });
const raw = Buffer.from("official station source");
const rawPath = path.join(rawDir, "station.json");
fs.writeFileSync(rawPath, raw);
const rawSha = crypto.createHash("sha256").update(raw).digest("hex");
const boundarySha = "a".repeat(64);

function validMap() {
  return {
    schema_version: 2,
    provider_id: "fixture-provider",
    operator: "Fixture Transit",
    operator_evidence_url: "https://example.org/operator",
    assignment_policy: { method: "official_address_admin_parse" },
    stations: [{
      station_code: "1", station_name: "시험역", line_name: "시험선", operator: "Fixture Transit",
      operator_evidence_url: "https://example.org/operator", official_address: "서울특별시 종로구 시험로 1",
      station_evidence_url: "https://example.org/station", coordinate: { lat: 37.57, lng: 126.98, source_url: "https://example.org/station" },
      region_assignment: { region_key: "서울특별시-종로구", method: "official_address_admin_parse", source_field: "official_address" },
      raw_path: "raw/provider/station.json", raw_sha256: rawSha
    }]
  };
}

assert.equal(validateProviderMap(validMap(), root), true);
const nearest = validMap();
nearest.stations[0].region_assignment.method = "nearest_center";
assert.throws(() => validateProviderMap(nearest, root), /region_assignment.method/);
const manual = validMap();
manual.stations[0].raw_sha256 = "b".repeat(64);
assert.throws(() => validateProviderMap(manual, root), /raw SHA mismatch/);
console.log("region transit v2 core tests passed");
