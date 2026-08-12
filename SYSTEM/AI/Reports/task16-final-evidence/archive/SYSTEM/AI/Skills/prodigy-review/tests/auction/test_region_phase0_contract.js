"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");
const test = require("node:test");

const ROOT = path.resolve(__dirname, "../../../../../..");
const geography = require(path.join(ROOT, "SYSTEM/SCRIPTS/region-geography-registry-core.js"));
const matrix = require(path.join(ROOT, "SYSTEM/SCRIPTS/region-provider-support-matrix-core.js"));
const snapshot = require(path.join(ROOT, "SYSTEM/SCRIPTS/region-source-snapshot-core.js"));
const ledger = require(path.join(ROOT, "SYSTEM/SCRIPTS/region-source-ledger-core.js"));

function validSnapshot(overrides = {}) {
  return {
    schema_version: 1,
    snapshot_id: "snap-2026-05-11110-sale-aaaaaaaa",
    provider_id: "molit_apt_sale",
    source_dataset_id: "15126469",
    property_type: "apartment",
    geography: {
      level: "sigungu",
      code_system: "mois_sigungu",
      sido_code: "11",
      sigungu_code: "11110",
      name_at_release: "종로구",
      name_current: "종로구",
      effective_from: null,
      effective_to: null,
      mapping_status: "effective_date_pending"
    },
    reference_period: "2026-05",
    coverage_level: "sigungu",
    missingness_code: "none",
    valid_time: "2026-05-01",
    published_at: "2026-06-20T00:00:00.000Z",
    first_seen_at: "2026-08-03T00:00:00.000Z",
    collected_at: "2026-08-03T00:00:01.000Z",
    revision_type: "initial",
    methodology_version: "1.0.0",
    raw_path: "raw/molit-apt-sale.json",
    raw_payload_hash: "a".repeat(64),
    measures: {
      sale_volume_3m: { value: 12, unit: "건" }
    },
    ...overrides
  };
}

test("Given the Seoul and Busan pilot registry, When it is loaded, Then canonical sigungu identities are unique", () => {
  const result = geography.loadRegistry();
  assert.equal(result.regions.length, 41);
  assert.deepEqual(result.byCode("11", "11110"), {
    region_key: "서울특별시-종로구",
    geography_level: "sigungu",
    code_system: "mois_sigungu",
    sido_code: "11",
    sigungu_code: "11110",
    name_at_release: "종로구",
    name_current: "종로구",
    effective_from: null,
    effective_to: null,
    mapping_status: "effective_date_pending"
  });
  assert.equal(new Set(result.regions.map((item) => `${item.sido_code}:${item.sigungu_code}`)).size, 41);
});

test("Given a geography registry with duplicate codes, When it is validated, Then the registry fails closed", () => {
  const registry = geography.loadRegistry().raw;
  registry.regions.push({ ...registry.regions[0] });
  assert.throws(() => geography.validateRegistry(registry), /중복|duplicate/iu);
});

test("Given the Phase 0 support matrix, When readiness is inspected, Then only the verified MOIS pilot is projection-ready", () => {
  const result = matrix.loadMatrix();
  assert.deepEqual(matrix.validateMatrix(result), []);
  assert.equal(matrix.getProvider(result, "mois_jumin_statmonth_csv").projection_ready, true);
  assert.equal(matrix.getProvider(result, "molit_apt_sale").projection_ready, false);
  assert.equal(matrix.canDispatch(result, "molit_apt_sale"), false);
  assert.equal(matrix.canDispatch(result, "mois_jumin_statmonth_csv"), true);
});

test("Given a blocked provider promoted to ready, When the matrix is validated, Then promotion is rejected", () => {
  const matrixValue = structuredClone(matrix.loadMatrix());
  const row = matrixValue.providers.find((item) => item.provider_id === "molit_apt_sale");
  row.adapter_ready = true;
  row.fixture_ready = true;
  row.projection_ready = true;
  assert.ok(matrix.validateMatrix(matrixValue).some((error) => /molit_apt_sale.*ready|network|blocked/iu.test(error)));
});

test("Given an exact source snapshot, When it is built, Then all four times and provenance are retained", () => {
  const built = snapshot.buildSnapshot(validSnapshot());
  assert.equal(built.valid_time, "2026-05-01");
  assert.equal(built.published_at, "2026-06-20T00:00:00.000Z");
  assert.equal(built.first_seen_at, "2026-08-03T00:00:00.000Z");
  assert.equal(built.collected_at, "2026-08-03T00:00:01.000Z");
  assert.equal(built.missingness_code, "none");
  assert.equal(snapshot.projectionKey(built), "15126469|11110|apartment|2026-05");
});

test("Given a published-but-empty provider response, When it is normalized, Then no-data has a reason instead of zero", () => {
  const built = snapshot.buildSnapshot(validSnapshot({
    snapshot_id: "snap-2026-05-11110-sale-bbbbbbbb",
    missingness_code: "not_published",
    measures: {}
  }));
  assert.equal(built.missingness_code, "not_published");
  assert.equal(snapshot.isNoData(built), true);
  assert.throws(() => snapshot.buildSnapshot(validSnapshot({ missingness_code: "not_published", measures: { sale_volume_3m: { value: 0, unit: "건" } } })), /결측|값|missing/iu);
});

test("Given two generations for one projection key, When the raw ledger appends them, Then both remain and only the newest projects", () => {
  const older = snapshot.buildSnapshot(validSnapshot());
  const newer = snapshot.buildSnapshot({
    ...validSnapshot({ snapshot_id: "snap-2026-05-11110-sale-cccccccc", collected_at: "2026-08-04T00:00:01.000Z", raw_payload_hash: "b".repeat(64) })
  });
  const first = ledger.appendSnapshot({ schema_version: 1, snapshots: [] }, older);
  const second = ledger.appendSnapshot(first, newer);
  assert.equal(first.snapshots.length, 1);
  assert.equal(second.snapshots.length, 2);
  assert.equal(ledger.selectCurrentProjection(second)[0].snapshot_id, newer.snapshot_id);
});

test("Given the same snapshot id with different raw bytes, When it is appended, Then the ledger rejects replacement", () => {
  const original = snapshot.buildSnapshot(validSnapshot());
  const changed = snapshot.buildSnapshot(validSnapshot({ raw_payload_hash: "b".repeat(64) }));
  const state = ledger.appendSnapshot({ schema_version: 1, snapshots: [] }, original);
  assert.throws(() => ledger.appendSnapshot(state, changed), /충돌|collision|append/iu);
});

console.log("Region Phase 0 contract tests loaded");
