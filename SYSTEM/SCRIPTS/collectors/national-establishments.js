"use strict";

/**
 * National Establishments Adapter (FAIL-CLOSED STUB)
 *
 * Registry provider: national_establishments
 * Registry status: blocked_fixture
 * Source: data.go.kr dataset 15087673
 *
 * Intended scope: sigungu-base-year establishments 개 and employees 명.
 * No dispatch until reviewed exact columns/code sample exists.
 * Jobs tab states blocked coverage.
 */

const PROVIDER_ID = "national_establishments";
const REGISTRY_STATUS = "blocked_fixture";
const DATASET_ID = "15087673";
const UNITS = Object.freeze({
  establishments: "개",
  employees: "명",
});

/**
 * Adapter state — always blocked_fixture, zero network.
 * Reports the exact missing gate.
 */
function adapterState() {
  return Object.freeze({
    provider: PROVIDER_ID,
    registry_status: REGISTRY_STATUS,
    dataset_id: DATASET_ID,
    status: "blocked_fixture",
    reason: "blocked_fixture: exact API/file route and auth placement unapproved",
    missing_gate: "no reviewed exact columns/code sample exists; jobs tab states blocked coverage",
    network_allowed: false,
    network_dispatched: false,
    request_count: 0,
    fixture_policy: "absent_blocked",
    units: UNITS,
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
    establishments: null,
    employees: null,
    error: "검토된 columns/code sample이 없습니다. 네트워크 요청을 보내지 않았습니다.",
  });
}

module.exports = Object.freeze({
  PROVIDER_ID,
  REGISTRY_STATUS,
  DATASET_ID,
  UNITS,
  adapterState,
  collect,
});
