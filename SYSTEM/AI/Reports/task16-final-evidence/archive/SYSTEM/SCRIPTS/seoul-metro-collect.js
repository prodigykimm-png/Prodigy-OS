#!/usr/bin/env node
"use strict";

/**
 * 서울교통공사 역별 좌표 수집 스크립트 (candidate-only)
 *
 * STATUS: CANDIDATE — zero network dispatch in this plan.
 * All existing Seoul/KRIC/Korail material is preserved as candidate evidence only.
 * No candidate provider fetches or reaches Region inputs.
 *
 * Original implementation fetched from seoulmetro.co.kr and labeled all stations
 * as 서울교통공사 without operator verification. That approach is quarantined.
 * A future reviewed fixture must prove key placement, station set, exact address
 * and Region evidence before enablement.
 *
 * Contract: SYSTEM/docs/Region_Transit_Provider_Contract_v2.md
 */

const path = require("node:path");

const PROVIDER_ID = "seoul-metro";
const STATUS = "candidate";
const NETWORK_ALLOWED = false;
const MISSING_GATE = "Seoul OpenAPI StationAdresTelno key placement and response fixture not frozen; operator-separated validation required";

/**
 * Report current collection status.
 * @returns {object} status report
 */
function reportStatus() {
  return Object.freeze({
    provider_id: PROVIDER_ID,
    status: STATUS,
    network_allowed: NETWORK_ALLOWED,
    network_dispatched: 0,
    missing_gate: MISSING_GATE,
    note: "Existing raw material in SYSTEM/CACHE/region-transit/raw/seoul-metro/ is preserved as candidate evidence. No new collection until enablement gate passes."
  });
}

/**
 * Attempt collection — always fails closed.
 * @throws {Error} always — candidate providers cannot dispatch
 */
async function main() {
  throw new Error(
    "seoul-metro collection is quarantined (candidate status). " +
    "Missing gate: " + MISSING_GATE + ". " +
    "Existing material is preserved as candidate evidence only. " +
    "No candidate provider fetches or reaches Region inputs in this plan."
  );
}

if (require.main === module) {
  main().catch(function(e) { process.stderr.write(e.message + "\n"); process.exitCode = 1; });
}

module.exports = Object.freeze({ reportStatus, main, PROVIDER_ID, STATUS, NETWORK_ALLOWED, MISSING_GATE });
