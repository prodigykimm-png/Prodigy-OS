"use strict";

/**
 * Admin Code Adapter (FAIL-CLOSED STUB)
 *
 * Registry provider: admin_code
 * Registry status: blocked_fixture
 * Source: data.go.kr 15077871
 *
 * Intended scope: nationwide 10-digit codes and release/effective date.
 * No dispatch until reviewed request/response fixture exists.
 * Current four manifests stay canonical.
 */

const PROVIDER_ID = "admin_code";
const REGISTRY_STATUS = "blocked_fixture";
const DATASET_ID = "15077871";

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
    reason: "blocked_fixture: exact operation unapproved; current four manifests stay canonical",
    missing_gate: "no reviewed request/response fixture; current four manifests stay canonical",
    network_allowed: false,
    network_dispatched: false,
    request_count: 0,
    fixture_policy: "absent_blocked",
    code_format: "10-digit",
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
    error: "검토된 request/response fixture가 없습니다. 현재 4개 manifest가 canonical입니다. 네트워크 요청을 보내지 않았습니다.",
  });
}

module.exports = Object.freeze({
  PROVIDER_ID,
  REGISTRY_STATUS,
  DATASET_ID,
  adapterState,
  collect,
});
