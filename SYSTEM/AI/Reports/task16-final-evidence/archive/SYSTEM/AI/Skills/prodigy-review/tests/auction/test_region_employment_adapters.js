"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");
const test = require("node:test");

const ROOT = path.resolve(__dirname, "../../../../../..");
const establishments = require(path.join(ROOT, "SYSTEM/SCRIPTS/collectors/national-establishments.js"));
const kosisDisabled = require(path.join(ROOT, "SYSTEM/SCRIPTS/collectors/kosis-disabled.js"));

// --- National Establishments Tests ---

test("national-establishments: distinguishes establishments 개 vs employees 명", () => {
  const state = establishments.adapterState();
  assert.equal(state.units.establishments, "개");
  assert.equal(state.units.employees, "명");
  assert.notEqual(state.units.establishments, state.units.employees);
});

test("national-establishments: reports blocked_fixture with zero network", () => {
  const state = establishments.adapterState();
  assert.equal(state.provider, "national_establishments");
  assert.equal(state.status, "blocked_fixture");
  assert.equal(state.network_allowed, false);
  assert.equal(state.network_dispatched, false);
  assert.equal(state.request_count, 0);
  assert.equal(state.fixture_policy, "absent_blocked");
});

test("national-establishments: reports exact missing gate", () => {
  const state = establishments.adapterState();
  assert.ok(state.missing_gate.includes("columns"));
  assert.ok(state.missing_gate.includes("blocked coverage"));
});

test("national-establishments: collect returns null establishments and employees with zero network", () => {
  const result = establishments.collect();
  assert.equal(result.status, "blocked_fixture");
  assert.equal(result.network_dispatched, false);
  assert.equal(result.collected_at, null);
  assert.equal(result.establishments, null);
  assert.equal(result.employees, null);
});

test("national-establishments: dataset ID is 15087673", () => {
  const state = establishments.adapterState();
  assert.equal(state.dataset_id, "15087673");
});

// --- KOSIS Disabled Tests ---

test("kosis-disabled: reports disabled with no endpoint/table", () => {
  const state = kosisDisabled.adapterState();
  assert.equal(state.provider, "kosis_disabled");
  assert.equal(state.status, "disabled");
  assert.equal(state.registry_status, "disabled");
  assert.equal(state.endpoint, null);
  assert.equal(state.table_id, null);
});

test("kosis-disabled: zero network always", () => {
  const state = kosisDisabled.adapterState();
  assert.equal(state.network_allowed, false);
  assert.equal(state.network_dispatched, false);
  assert.equal(state.request_count, 0);
});

test("kosis-disabled: reports exact missing gate for enablement", () => {
  const state = kosisDisabled.adapterState();
  assert.ok(state.missing_gate.includes("table ID"));
  assert.ok(state.missing_gate.includes("reviewed plan amendment"));
});

test("kosis-disabled: collect returns disabled with zero network", () => {
  const result = kosisDisabled.collect();
  assert.equal(result.status, "disabled");
  assert.equal(result.network_dispatched, false);
  assert.equal(result.collected_at, null);
});
