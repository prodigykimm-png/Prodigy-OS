"use strict";

/**
 * shinbundang — zero-network typed provider adapter stub
 * Provider: shinbundang
 * Operator: 네오트랜스(주)
 * Scope: 신분당선 stations
 * Source: https://www.shinbundang.co.kr/dxline/dxline6.jsp
 *
 * Status: candidate (zero network dispatch)
 * Missing gate: 대지위치 address and operator evidence required; detail fixture not frozen
 *
 * This adapter performs NO network requests. It reports its candidate/blocked
 * status and the exact missing gate that must be satisfied before enablement.
 */

const PROVIDER_ID = "shinbundang";
const OPERATOR = "네오트랜스(주)";
const SCOPE = "신분당선 stations";
const SOURCE_URL = "https://www.shinbundang.co.kr/dxline/dxline6.jsp";
const STATUS = "candidate";
const NETWORK_ALLOWED = false;
const MISSING_GATE = "대지위치 address and operator evidence required; detail fixture not frozen";

/**
 * Report adapter status without any network dispatch.
 * @returns {object} status report
 */
function reportStatus() {
  return Object.freeze({
    provider_id: PROVIDER_ID,
    operator: OPERATOR,
    scope: SCOPE,
    source_url: SOURCE_URL,
    status: STATUS,
    network_allowed: NETWORK_ALLOWED,
    network_dispatched: 0,
    missing_gate: MISSING_GATE,
    stations_collected: 0,
    stations_promoted: 0,
    region_inputs_reached: 0
  });
}

/**
 * Attempt collection — always fails closed for candidate adapters.
 * @throws {Error} always — candidate providers cannot dispatch
 */
function collect() {
  throw new Error(
    "provider '" + PROVIDER_ID + "' is candidate status with zero network allowed. " +
    "Missing gate: " + MISSING_GATE
  );
}

/**
 * Validate that this adapter has not been promoted or dispatched.
 * @param {object} [options]
 * @returns {boolean} true if adapter remains safely quarantined
 */
function verifyQuarantined(options) {
  const status = reportStatus();
  if (status.network_dispatched !== 0) throw new Error(PROVIDER_ID + " dispatched network");
  if (status.stations_promoted !== 0) throw new Error(PROVIDER_ID + " promoted stations");
  if (status.region_inputs_reached !== 0) throw new Error(PROVIDER_ID + " reached Region inputs");
  return true;
}

if (require.main === module) {
  process.stdout.write(JSON.stringify(reportStatus(), null, 2) + "\n");
}

module.exports = Object.freeze({
  PROVIDER_ID,
  OPERATOR,
  STATUS,
  NETWORK_ALLOWED,
  MISSING_GATE,
  reportStatus,
  collect,
  verifyQuarantined
});
