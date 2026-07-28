"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const ROOT = path.resolve(__dirname, "../../../../../..");
const rebStock = require(path.join(ROOT, "SYSTEM/SCRIPTS/collectors/reb-stock.js"));
const rebSupply = require(path.join(ROOT, "SYSTEM/SCRIPTS/collectors/reb-supply.js"));
const buildingHub = require(path.join(ROOT, "SYSTEM/SCRIPTS/collectors/building-hub-housing-permit.js"));
const kaptBasic = require(path.join(ROOT, "SYSTEM/SCRIPTS/collectors/kapt-basic.js"));
const vworldLand = require(path.join(ROOT, "SYSTEM/SCRIPTS/collectors/vworld-land-price.js"));
const adminCode = require(path.join(ROOT, "SYSTEM/SCRIPTS/collectors/admin-code.js"));

const STOCK_FIXTURE = path.join(ROOT, "SYSTEM/AI/Skills/prodigy-review/tests/fixtures/region-intelligence/reb_stock/2026-release.csv");
const SUPPLY_FIXTURE = path.join(ROOT, "SYSTEM/AI/Skills/prodigy-review/tests/fixtures/region-intelligence/reb_supply/2026-release.csv");

// --- REB Stock Tests ---

test("reb-stock: seed fixture groups by exact address sigungu and sums 세대수 as 호", () => {
  const csv = fs.readFileSync(STOCK_FIXTURE, "utf8");
  const result = rebStock.parseSeed(csv);

  // Must have groups
  const keys = Object.keys(result.groups);
  assert.ok(keys.length > 0, "should produce at least one sigungu group");

  // Every group has sigungu, stock_ho, complex_ids
  for (const key of keys) {
    const g = result.groups[key];
    assert.equal(typeof g.sigungu, "string");
    assert.ok(g.sigungu.length > 0);
    assert.equal(typeof g.stock_ho, "number");
    assert.ok(g.stock_ho > 0, `stock_ho should be positive for ${key}`);
    assert.ok(Array.isArray(g.complex_ids));
    assert.ok(g.complex_ids.length > 0);
  }

  // 서울특별시 종로구 should exist (first rows of fixture)
  assert.ok(result.groups["서울특별시 종로구"], "should have 서울특별시 종로구 group");
  assert.ok(result.groups["서울특별시 종로구"].stock_ho > 0);

  // total_rows should be positive
  assert.ok(result.total_rows > 0);
});

test("reb-stock: identity is 단지고유번호 — duplicates rejected", () => {
  const csv = [
    "단지고유번호,필지고유번호,주소,세대수",
    '"A001","P001","서울특별시 종로구 청운동 1",100',
    '"A001","P002","서울특별시 종로구 청운동 2",200',
  ].join("\n");

  const result = rebStock.parseSeed(csv);
  assert.ok(result.errors.some((e) => e.includes("duplicate")));
  assert.equal(result.total_rows, 1);
});

test("reb-stock: extractSigungu returns first two tokens", () => {
  assert.equal(rebStock.extractSigungu("서울특별시 종로구 청운동 1"), "서울특별시 종로구");
  assert.equal(rebStock.extractSigungu("부산광역시 사하구 괴정동 123"), "부산광역시 사하구");
  assert.equal(rebStock.extractSigungu("경기도 고양시 덕양구 용두동 827"), "경기도 고양시");
  assert.equal(rebStock.extractSigungu("one"), null);
  assert.equal(rebStock.extractSigungu(""), null);
  assert.equal(rebStock.extractSigungu(null), null);
});

test("reb-stock: adapter reports blocked_fixture and zero network", () => {
  const state = rebStock.adapterState();
  assert.equal(state.provider, "reb_stock");
  assert.equal(state.status, "blocked_fixture");
  assert.equal(state.network_allowed, false);
  assert.equal(state.network_dispatched, false);
  assert.equal(state.request_count, 0);
  assert.equal(state.fixture_policy, "parser_seed");
  assert.equal(state.unit, "호");
  assert.equal(state.identity_column, "단지고유번호");
});

test("reb-stock: collect returns blocked with zero network", () => {
  const result = rebStock.collect();
  assert.equal(result.status, "blocked_fixture");
  assert.equal(result.network_dispatched, false);
  assert.equal(result.collected_at, null);
});

// --- REB Supply Tests ---

test("reb-supply: seed fixture uses 입주예정월|주소|세대수 and computes horizons", () => {
  const csv = fs.readFileSync(SUPPLY_FIXTURE, "utf8");
  const result = rebSupply.parseSeed(csv, "2026-01");

  const keys = Object.keys(result.groups);
  assert.ok(keys.length > 0, "should produce at least one sigungu group");

  // Every group has coverage with horizon keys
  for (const key of keys) {
    const g = result.groups[key];
    assert.equal(typeof g.sigungu, "string");
    assert.ok(g.coverage, `group ${key} should have coverage`);
    for (const h of [12, 24, 36, 48, 60]) {
      const hKey = `${h}m`;
      assert.ok(hKey in g.coverage, `coverage should have ${hKey}`);
      // Value is either null or a positive number
      if (g.coverage[hKey] !== null) {
        assert.equal(typeof g.coverage[hKey], "number");
        assert.ok(g.coverage[hKey] > 0);
      }
    }
  }

  assert.ok(result.total_rows > 0);
});

test("reb-supply: missing horizon stays null", () => {
  // All rows far in the future beyond 60m from reference (72 months away)
  const csv = [
    "입주예정월,주소,세대수",
    "2032-01,서울특별시 종로구 청운동 1,100",
  ].join("\n");

  const result = rebSupply.parseSeed(csv, "2026-01");
  const g = result.groups["서울특별시 종로구"];
  assert.ok(g, "group should exist");
  // 60m from 2026-01 = up to 2031-01. 2032-01 is beyond all horizons
  assert.equal(g.coverage["12m"], null);
  assert.equal(g.coverage["24m"], null);
  assert.equal(g.coverage["36m"], null);
  assert.equal(g.coverage["48m"], null);
  assert.equal(g.coverage["60m"], null);
});

test("reb-supply: cumulative horizons are monotonically non-decreasing", () => {
  const csv = fs.readFileSync(SUPPLY_FIXTURE, "utf8");
  const result = rebSupply.parseSeed(csv, "2026-01");

  for (const key of Object.keys(result.groups)) {
    const g = result.groups[key];
    let prev = 0;
    for (const h of [12, 24, 36, 48, 60]) {
      const val = g.coverage[`${h}m`];
      if (val !== null) {
        assert.ok(val >= prev, `${key}: ${h}m (${val}) should be >= previous (${prev})`);
        prev = val;
      }
    }
  }
});

test("reb-supply: adapter reports blocked_fixture and zero network", () => {
  const state = rebSupply.adapterState();
  assert.equal(state.provider, "reb_supply");
  assert.equal(state.status, "blocked_fixture");
  assert.equal(state.network_allowed, false);
  assert.equal(state.network_dispatched, false);
  assert.equal(state.request_count, 0);
  assert.equal(state.unit, "세대");
});

// --- Building HUB Tests ---

test("building-hub: dataset ID is 15136560 NOT 15136267", () => {
  const state = buildingHub.adapterState();
  assert.equal(state.dataset_id, "15136560");
  assert.equal(state.forbidden_dataset_id, "15136267");
  assert.notEqual(state.dataset_id, "15136267");
});

test("building-hub: reports blocked_fixture with exact missing gate", () => {
  const state = buildingHub.adapterState();
  assert.equal(state.status, "blocked_fixture");
  assert.equal(state.network_allowed, false);
  assert.equal(state.network_dispatched, false);
  assert.ok(state.missing_gate.includes("15136267"));
  assert.ok(state.missing_gate.includes("forbidden"));
});

test("building-hub: collect returns blocked with zero network", () => {
  const result = buildingHub.collect();
  assert.equal(result.status, "blocked_fixture");
  assert.equal(result.network_dispatched, false);
  assert.equal(result.collected_at, null);
});

// --- K-APT Tests ---

test("kapt-basic: cannot populate housing_stock", () => {
  const state = kaptBasic.adapterState();
  assert.equal(state.populates_housing_stock, false);
  assert.ok(state.missing_gate.includes("housing_stock"));
});

test("kapt-basic: collect returns null housing_stock and zero network", () => {
  const result = kaptBasic.collect();
  assert.equal(result.housing_stock, null);
  assert.equal(result.network_dispatched, false);
  assert.equal(result.status, "blocked_fixture");
});

// --- VWorld Land Price Tests ---

test("vworld-land-price: LINK IDs are 15123971 and 15124014", () => {
  const regionState = vworldLand.adapterStateRegion();
  const caseState = vworldLand.adapterStateCase();
  assert.equal(regionState.link_id, "15123971");
  assert.equal(caseState.link_id, "15124014");
});

test("vworld-land-price: both scopes blocked with zero network", () => {
  const r = vworldLand.collectRegion();
  const c = vworldLand.collectCase();
  assert.equal(r.status, "blocked_fixture");
  assert.equal(r.network_dispatched, false);
  assert.equal(c.status, "blocked_fixture");
  assert.equal(c.network_dispatched, false);
});

// --- Admin Code Tests ---

test("admin-code: reports blocked_fixture with zero network", () => {
  const state = adminCode.adapterState();
  assert.equal(state.provider, "admin_code");
  assert.equal(state.status, "blocked_fixture");
  assert.equal(state.network_allowed, false);
  assert.equal(state.network_dispatched, false);
  assert.ok(state.missing_gate.includes("manifests"));
});

test("admin-code: collect returns blocked with zero network", () => {
  const result = adminCode.collect();
  assert.equal(result.status, "blocked_fixture");
  assert.equal(result.network_dispatched, false);
  assert.equal(result.collected_at, null);
});
