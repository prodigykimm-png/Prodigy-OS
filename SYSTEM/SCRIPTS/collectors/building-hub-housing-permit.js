"use strict";

/**
 * Building HUB Housing Permit Adapter (FAIL-CLOSED STUB)
 *
 * Registry provider: building_hub_housing_permit
 * Registry status: blocked_fixture
 * Source: data.go.kr API 15136560
 *
 * IMPORTANT: Dataset ID is 15136560 (NOT 15136267 which is forbidden).
 *
 * Intended scope: sigungu-month housing permit units (호).
 * No network dispatch or parser implementation until reviewed literal
 * operation + fixture exists.
 */

const PROVIDER_ID = "building_hub_housing_permit";
const REGISTRY_STATUS = "blocked_fixture";
const DATASET_ID = "15136560";
const FORBIDDEN_DATASET_ID = "15136267";
const UNIT = "호";

/**
 * Adapter state — always blocked_fixture, zero network.
 * Reports the exact missing gate.
 */
function adapterState() {
  return Object.freeze({
    provider: PROVIDER_ID,
    registry_status: REGISTRY_STATUS,
    dataset_id: DATASET_ID,
    forbidden_dataset_id: FORBIDDEN_DATASET_ID,
    status: "blocked_fixture",
    reason: "blocked_fixture: exact operation/response field unapproved; 15136267 forbidden",
    missing_gate: "no reviewed literal operation+fixture exists; dataset 15136267 is forbidden",
    network_allowed: false,
    network_dispatched: false,
    request_count: 0,
    fixture_policy: "absent_blocked",
    unit: UNIT,
  });
}

/**
 * Attempt to collect. Always returns blocked state — zero network.
 */
function collect() {
  const state = adapterState();
  return Object.freeze({
    ...state,
    collected_at: null,
    error: "검토된 operation+fixture가 없습니다. 네트워크 요청을 보내지 않았습니다.",
  });
}

module.exports = Object.freeze({
  PROVIDER_ID,
  REGISTRY_STATUS,
  DATASET_ID,
  FORBIDDEN_DATASET_ID,
  UNIT,
  adapterState,
  collect,
});
