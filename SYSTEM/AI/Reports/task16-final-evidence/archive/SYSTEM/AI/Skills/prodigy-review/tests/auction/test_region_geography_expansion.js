"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");
const test = require("node:test");

const ROOT = path.resolve(__dirname, "../../../../../..");
const expansion = require(path.join(ROOT, "SYSTEM/SCRIPTS/region-geography-expansion-core.js"));
const moisBridge = require(path.join(ROOT, "SYSTEM/SCRIPTS/region-source-fixture-bridge-core.js"));

const FIXTURE_PATH = path.join(ROOT, "SYSTEM/AI/Skills/prodigy-review/tests/fixtures/region-intelligence/mois_jumin_statmonth_csv/2026-05-households.csv");
const FIXTURE_SHA256 = "576bf4419ddebd24da4b1c917269ed298f03bd6c413213c8b3e93599462d415a";

test("Given the frozen 83-region identity, When the expansion registry loads, Then Seoul, Gyeonggi, Incheon, and Busan are represented exactly", () => {
  const registry = expansion.loadRegistry();
  assert.equal(registry.regions.length, 83);
  assert.deepEqual(expansion.EXPECTED_GROUPS.map((group) => group.sido), ["부산광역시", "서울특별시", "경기도", "인천광역시"]);
  assert.equal(registry.digest_sha256, "663998ddf2f7b1b4d4242d52e5ea0fc99884c55230b3ceb3f555f07a101dab1b");
  assert.deepEqual(registry.byCode("41", "41110"), {
    region_key: "경기도-수원시",
    geography_level: "sigungu",
    code_system: "mois_sigungu",
    sido_code: "41",
    sigungu_code: "41110",
    name_at_release: "수원시",
    name_current: "수원시",
    effective_from: null,
    effective_to: null,
    mapping_status: "effective_date_pending"
  });
});

test("Given an expanded MOIS registry, When the verified fixture is bridged, Then all 83 identities receive either measures or an explicit missingness state", () => {
  const result = moisBridge.appendMoisFixtureSnapshots({ schema_version: 1, snapshots: [] }, {
    fixture_path: FIXTURE_PATH,
    expected_sha256: FIXTURE_SHA256,
    period: "2026-05",
    published_at: "2026-06-20T00:00:00.000Z",
    first_seen_at: "2026-08-03T00:00:00.000Z",
    collected_at: "2026-08-03T00:00:01.000Z",
    geography_registry: expansion.loadRegistry()
  });
  assert.equal(result.snapshots.length, 83);
  assert.equal(result.snapshots.filter((snapshot) => snapshot.missingness_code === "none").length, 79);
  assert.equal(result.snapshots.filter((snapshot) => snapshot.missingness_code === "not_available").length, 4);
  assert.equal(result.snapshots.find((snapshot) => snapshot.geography.sigungu_code === "41110").missingness_code, "none");
  assert.equal(result.snapshots.find((snapshot) => snapshot.geography.sigungu_code === "28125").missingness_code, "not_available");
});

test("Given a registry with a fabricated effective date, When validation runs, Then expansion is rejected", () => {
  const registry = expansion.loadRegistry().raw;
  registry.regions[0].effective_from = "2026-01-01";
  assert.ok(expansion.validateRegistry(registry).some((error) => error.includes("unverified effective date metadata")));
});

console.log("Region geography expansion tests loaded");
