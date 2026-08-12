"use strict";

/**
 * test_region_transit_provider_adapters.js
 *
 * Covers: every Seoul/Korail/private provider row remains candidate/quarantined
 * with zero network, operator mismatch rejection, missing address/raw rejection,
 * multiple polygons rejection, and coordinate-only guess stays quarantined.
 */

const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { validateProviderMap } = require("../../../../../SCRIPTS/region-transit-v2-core.js");

const ADAPTER_DIR = path.resolve(__dirname, "../../../../../SCRIPTS/collectors");

const EXPECTED_ADAPTERS = [
  "seoul-metro-stations.js",
  "metro9-stage1.js",
  "metro9-stage23.js",
  "kric-stations.js",
  "korail-stations.js",
  "arex-stations.js",
  "shinbundang-stations.js",
  "gimpo-goldline-stations.js",
  "ui-sinseol-stations.js",
  "sillim-stations.js",
  "everline-stations.js",
  "uijeongbu-lrt-stations.js",
  "seohae-rail-stations.js"
];

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function makeVault() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "prodigy-adapter-test-"));
  const rawDir = path.join(root, "SYSTEM/CACHE/region-transit/raw/provider");
  fs.mkdirSync(rawDir, { recursive: true });
  const raw = Buffer.from("official station source");
  fs.writeFileSync(path.join(rawDir, "station.json"), raw);
  return { root, rawSha: sha256(raw) };
}

function station(rawSha, overrides) {
  return Object.assign({
    station_code: "1",
    station_name: "시험역",
    line_name: "시험선",
    operator: "Fixture Transit",
    operator_evidence_url: "https://example.org/operator",
    official_address: "서울특별시 종로구 시험로 1",
    station_evidence_url: "https://example.org/station",
    coordinate: { lat: 37.57, lng: 126.98, source_url: "https://example.org/station" },
    region_assignment: { region_key: "서울특별시-종로구", method: "official_address_admin_parse", source_field: "official_address" },
    raw_path: "raw/provider/station.json",
    raw_sha256: rawSha
  }, overrides || {});
}

test("all 13 provider adapters exist", function() {
  for (const file of EXPECTED_ADAPTERS) {
    assert.ok(fs.existsSync(path.join(ADAPTER_DIR, file)), "missing adapter: " + file);
  }
});

test("every adapter reports candidate status with zero network and a missing gate", function() {
  for (const file of EXPECTED_ADAPTERS) {
    const adapter = require(path.join(ADAPTER_DIR, file));
    const status = adapter.reportStatus();
    assert.equal(status.status, "candidate", file + " status");
    assert.equal(status.network_allowed, false, file + " network_allowed");
    assert.equal(status.network_dispatched, 0, file + " network_dispatched");
    assert.equal(status.stations_promoted, 0, file + " stations_promoted");
    assert.equal(status.region_inputs_reached, 0, file + " region_inputs_reached");
    assert.ok(typeof status.missing_gate === "string" && status.missing_gate.length > 0, file + " missing_gate");
  }
});

test("every adapter collect() fails closed (zero network dispatch)", function() {
  for (const file of EXPECTED_ADAPTERS) {
    const adapter = require(path.join(ADAPTER_DIR, file));
    assert.throws(function() { adapter.collect(); }, /candidate|quarantined|Missing gate/i, file + " collect must throw");
  }
});

test("every adapter verifies quarantined with no promotion or Region reach", function() {
  for (const file of EXPECTED_ADAPTERS) {
    const adapter = require(path.join(ADAPTER_DIR, file));
    assert.equal(adapter.verifyQuarantined(), true, file + " verifyQuarantined");
  }
});

test("operator mismatch rejection at the v2 core", function() {
  const { root, rawSha } = makeVault();
  const map = {
    schema_version: 2,
    provider_id: "seoul-metro",
    operator: "서울교통공사",
    operator_evidence_url: "https://example.org/operator",
    assignment_policy: { method: "official_address_admin_parse" },
    stations: [station(rawSha, { operator: "한국철도공사" })]
  };
  assert.throws(function() { validateProviderMap(map, root); }, /operator mismatch/);
});

test("missing official address is rejected", function() {
  const { root, rawSha } = makeVault();
  const st = station(rawSha);
  st.official_address = "";
  const map = {
    schema_version: 2,
    provider_id: "p",
    operator: "Fixture Transit",
    operator_evidence_url: "https://example.org/operator",
    assignment_policy: { method: "official_address_admin_parse" },
    stations: [st]
  };
  assert.throws(function() { validateProviderMap(map, root); }, /official_address/);
});

test("missing raw evidence is rejected", function() {
  const { root, rawSha } = makeVault();
  const map = {
    schema_version: 2,
    provider_id: "p",
    operator: "Fixture Transit",
    operator_evidence_url: "https://example.org/operator",
    assignment_policy: { method: "official_address_admin_parse" },
    stations: [station(rawSha, { raw_path: "raw/provider/absent.json" })]
  };
  assert.throws(function() { validateProviderMap(map, root); }, /raw missing/);
});

test("multiple polygon matches are rejected", function() {
  const { root, rawSha } = makeVault();
  const boundarySha = "c".repeat(64);
  const map = {
    schema_version: 2,
    provider_id: "p",
    operator: "Fixture Transit",
    operator_evidence_url: "https://example.org/operator",
    assignment_policy: { method: "point_in_polygon" },
    boundary: { source_url: "https://example.org/boundary", version: "2026", sha256: boundarySha, crs: "EPSG:4326" },
    stations: [station(rawSha, {
      region_assignment: { region_key: "서울특별시-종로구", method: "point_in_polygon", sigungu_code: "11110", boundary_sha256: boundarySha, polygon_match_count: 3 }
    })]
  };
  assert.throws(function() { validateProviderMap(map, root); }, /exactly one polygon/);
});

test("coordinate-only guess stays quarantined (rejected by core)", function() {
  const { root, rawSha } = makeVault();
  const map = {
    schema_version: 2,
    provider_id: "p",
    operator: "Fixture Transit",
    operator_evidence_url: "https://example.org/operator",
    assignment_policy: { method: "official_address_admin_parse" },
    stations: [station(rawSha, { region_assignment: { region_key: "서울특별시-종로구", method: "coordinate_guess" } })]
  };
  assert.throws(function() { validateProviderMap(map, root); }, /forbidden|region_assignment.method/);
});
