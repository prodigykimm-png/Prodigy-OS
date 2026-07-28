"use strict";

/**
 * seohae-rail — zero-network typed provider adapter stub
 * Provider: seohae-rail
 * Operator: 서해철도(주)
 * Scope: 서해철도 operated stations only
 * Source: https://www.seohaerail.co.kr/
 *
 * Status: candidate (zero network dispatch)
 * Missing gate: Exact station detail/operator fixture required; line-map code alone forbidden
 *
 * This adapter performs NO network requests. It reports its candidate/blocked
 * status and the exact missing gate that must be satisfied before enablement.
 */

const PROVIDER_ID = "seohae-rail";
const OPERATOR = "서해철도(주)";
const SCOPE = "서해철도 operated stations only";
const SOURCE_URL = "https://www.seohaerail.co.kr/";
const STATUS = "candidate";
const NETWORK_ALLOWED = false;
const MISSING_GATE = "Exact station detail/operator fixture required; line-map code alone forbidden";

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
