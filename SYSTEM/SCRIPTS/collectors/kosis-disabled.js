"use strict";

/**
 * KOSIS Disabled Adapter
 *
 * Registry provider: kosis_disabled
 * Registry status: disabled
 * Auth: optional prodigy-kosis-api-key
 *
 * No endpoint/table selected. Cannot enable until exact table ID,
 * dimensions, units and fixture are added through a reviewed plan amendment.
 * Zero network always.
 */

const PROVIDER_ID = "kosis_disabled";
const REGISTRY_STATUS = "disabled";

/**
 * Adapter state — always disabled, zero network.
 */
function adapterState() {
  return Object.freeze({
    provider: PROVIDER_ID,
    registry_status: REGISTRY_STATUS,
    status: "disabled",
    reason: "disabled: no endpoint/table selected",
    missing_gate: "cannot enable until exact table ID, dimensions, units and fixture are added through a reviewed plan amendment",
    network_allowed: false,
    network_dispatched: false,
    request_count: 0,
    fixture_policy: "absent_blocked",
    endpoint: null,
    table_id: null,
  });
}

/**
 * Attempt to collect. Always returns disabled state — zero network.
 */
function collect() {
  const state = adapterState();
  return Object.freeze({
    ...state,
    collected_at: null,
    error: "비활성 provider입니다. endpoint/table이 선택되지 않았습니다. 네트워크 요청을 보내지 않았습니다.",
  });
}

module.exports = Object.freeze({
  PROVIDER_ID,
  REGISTRY_STATUS,
  adapterState,
  collect,
});
