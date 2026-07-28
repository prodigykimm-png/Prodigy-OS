"use strict";

/**
 * K-APT Basic Adapter (FAIL-CLOSED STUB)
 *
 * Registry provider: kapt_basic
 * Registry status: blocked_fixture
 * Source: data.go.kr API 15058453
 *
 * Intended scope: complex/address/unit facts; evidence enrichment only.
 *
 * HARD CONSTRAINT: K-APT CANNOT populate housing_stock. Apartment stock 호
 * comes only from reb_stock. No dispatch until reviewed fixture exists.
 */

const PROVIDER_ID = "kapt_basic";
const REGISTRY_STATUS = "blocked_fixture";
const DATASET_ID = "15058453";
const UNIT = "호";

/**
 * Adapter state — always blocked_fixture, zero network.
 * Reports the exact missing gate and the housing_stock prohibition.
 */
function adapterState() {
  return Object.freeze({
    provider: PROVIDER_ID,
    registry_status: REGISTRY_STATUS,
    dataset_id: DATASET_ID,
    status: "blocked_fixture",
    reason: "blocked_fixture: exact operation unapproved; cannot populate housing_stock",
    missing_gate: "no reviewed fixture exists; cannot populate housing_stock",
    populates_housing_stock: false,
    network_allowed: false,
    network_dispatched: false,
    request_count: 0,
    fixture_policy: "absent_blocked",
    unit: UNIT,
  });
}

/**
 * Attempt to collect. Always returns blocked state — zero network.
 * Never produces housing_stock.
 */
function collect() {
  const state = adapterState();
  return Object.freeze({
    ...state,
    collected_at: null,
    housing_stock: null,
    error: "검토된 fixture가 없습니다. housing_stock을 채울 수 없습니다. 네트워크 요청을 보내지 않았습니다.",
  });
}

module.exports = Object.freeze({
  PROVIDER_ID,
  REGISTRY_STATUS,
  DATASET_ID,
  UNIT,
  adapterState,
  collect,
});
