"use strict";

/**
 * test_region_transit_v2_core.js
 *
 * Covers: provider/line/station uniqueness, raw/operator evidence, future
 * authoritative-set membership, exact Region assignment, and relocated-Vault
 * paths — all WITHOUT promoting any candidate provider.
 */

const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { validateProviderMap, validateStation } = require("../../../../../SCRIPTS/region-transit-v2-core.js");

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

// Build a relocated-Vault fixture so we prove vaultRoot is honored.
function makeVault() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "prodigy-transit-v2-"));
  const rawDir = path.join(root, "SYSTEM/CACHE/region-transit/raw/provider");
  fs.mkdirSync(rawDir, { recursive: true });
  const raw = Buffer.from("official station source");
  fs.writeFileSync(path.join(rawDir, "station.json"), raw);
  return { root, rawSha: sha256(raw) };
}

function validStation(rawSha, overrides) {
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

function validMap(rawSha, stations) {
  return {
    schema_version: 2,
    provider_id: "fixture-provider",
    operator: "Fixture Transit",
    operator_evidence_url: "https://example.org/operator",
    assignment_policy: { method: "official_address_admin_parse" },
    stations: stations || [validStation(rawSha)]
  };
}

test("valid provider map passes on a relocated Vault root", function() {
  const { root, rawSha } = makeVault();
  assert.equal(validateProviderMap(validMap(rawSha), root), true);
});

test("station uniqueness: duplicate station identity rejected", function() {
  const { root, rawSha } = makeVault();
  const dup = validMap(rawSha, [validStation(rawSha), validStation(rawSha)]);
  assert.throws(function() { validateProviderMap(dup, root); }, /duplicate station identity/);
});

test("line/station uniqueness: same code on different lines is allowed", function() {
  const { root, rawSha } = makeVault();
  const map = validMap(rawSha, [
    validStation(rawSha, { station_code: "1", line_name: "1호선" }),
    validStation(rawSha, { station_code: "1", line_name: "2호선" })
  ]);
  assert.equal(validateProviderMap(map, root), true);
});

test("operator mismatch between station and map is rejected", function() {
  const { root, rawSha } = makeVault();
  const map = validMap(rawSha, [validStation(rawSha, { operator: "다른공사" })]);
  assert.throws(function() { validateProviderMap(map, root); }, /operator mismatch/);
});

test("missing operator evidence URL is rejected", function() {
  const { root, rawSha } = makeVault();
  const st = validStation(rawSha);
  delete st.operator_evidence_url;
  assert.throws(function() { validateStation(st, root, null, {}); }, /operator_evidence_url/);
});

test("raw SHA mismatch is rejected", function() {
  const { root, rawSha } = makeVault();
  const map = validMap(rawSha, [validStation(rawSha, { raw_sha256: "b".repeat(64) })]);
  assert.throws(function() { validateProviderMap(map, root); }, /raw SHA mismatch/);
});

test("missing raw evidence file is rejected", function() {
  const { root, rawSha } = makeVault();
  const map = validMap(rawSha, [validStation(rawSha, { raw_path: "raw/provider/absent.json" })]);
  assert.throws(function() { validateProviderMap(map, root); }, /raw missing/);
});

test("forbidden nearest-centroid assignment is rejected", function() {
  const { root, rawSha } = makeVault();
  const map = validMap(rawSha, [validStation(rawSha, { region_assignment: { region_key: "서울특별시-종로구", method: "nearest_center" } })]);
  assert.throws(function() { validateProviderMap(map, root); }, /forbidden|region_assignment.method/);
});

test("coordinate-only guess assignment is rejected", function() {
  const { root, rawSha } = makeVault();
  const map = validMap(rawSha, [validStation(rawSha, { region_assignment: { region_key: "서울특별시-종로구", method: "coordinate_guess" } })]);
  assert.throws(function() { validateProviderMap(map, root); }, /forbidden|region_assignment.method/);
});

test("point_in_polygon requires exactly one polygon match", function() {
  const { root, rawSha } = makeVault();
  const boundarySha = "a".repeat(64);
  const map = {
    schema_version: 2,
    provider_id: "fixture-provider",
    operator: "Fixture Transit",
    operator_evidence_url: "https://example.org/operator",
    assignment_policy: { method: "point_in_polygon" },
    boundary: { source_url: "https://example.org/boundary", version: "2026", sha256: boundarySha, crs: "EPSG:4326" },
    stations: [validStation(rawSha, {
      region_assignment: { region_key: "서울특별시-종로구", method: "point_in_polygon", sigungu_code: "11110", boundary_sha256: boundarySha, polygon_match_count: 2 }
    })]
  };
  assert.throws(function() { validateProviderMap(map, root); }, /exactly one polygon/);
});

test("point_in_polygon with exactly one match passes", function() {
  const { root, rawSha } = makeVault();
  const boundarySha = "a".repeat(64);
  const map = {
    schema_version: 2,
    provider_id: "fixture-provider",
    operator: "Fixture Transit",
    operator_evidence_url: "https://example.org/operator",
    assignment_policy: { method: "point_in_polygon" },
    boundary: { source_url: "https://example.org/boundary", version: "2026", sha256: boundarySha, crs: "EPSG:4326" },
    stations: [validStation(rawSha, {
      region_assignment: { region_key: "서울특별시-종로구", method: "point_in_polygon", sigungu_code: "11110", boundary_sha256: boundarySha, polygon_match_count: 1 }
    })]
  };
  assert.equal(validateProviderMap(map, root), true);
});

test("future authoritative-set membership: non-member rejected", function() {
  const { root, rawSha } = makeVault();
  const authoritativeSet = new Set(["999:시험선"]);
  assert.throws(function() {
    validateProviderMap(validMap(rawSha), root, { authoritativeSet: authoritativeSet });
  }, /not in authoritative set/);
});

test("future authoritative-set membership: member passes", function() {
  const { root, rawSha } = makeVault();
  const authoritativeSet = new Set(["1:시험선"]);
  assert.equal(validateProviderMap(validMap(rawSha), root, { authoritativeSet: authoritativeSet }), true);
});

test("official address must identify a known metro sigungu", function() {
  const { root, rawSha } = makeVault();
  const map = validMap(rawSha, [validStation(rawSha, { official_address: "어딘가 먼 곳 1" })]);
  assert.throws(function() { validateProviderMap(map, root); }, /official address does not directly identify/);
});

test("no candidate is promoted by validation (returns boolean only)", function() {
  const { root, rawSha } = makeVault();
  const result = validateProviderMap(validMap(rawSha), root);
  assert.equal(result, true);
  assert.equal(typeof result, "boolean");
});
