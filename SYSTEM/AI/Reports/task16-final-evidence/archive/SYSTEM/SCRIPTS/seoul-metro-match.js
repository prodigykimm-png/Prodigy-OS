#!/usr/bin/env node
"use strict";

/**
 * 서울교통공사 좌표 후보 → 행정구역 매칭 (candidate-only, quarantined)
 *
 * STATUS: CANDIDATE — this script is permanently quarantined in its original form.
 * The original implementation used nearest-centroid district matching which is
 * FORBIDDEN by the v2 contract. It must never produce Region inputs.
 *
 * Existing Seoul/KRIC/Korail material is preserved as candidate evidence only.
 * No candidate provider fetches or reaches Region inputs in this plan.
 *
 * Future replacement: official 시군구 경계 GeoJSON 기반 point-in-polygon importer
 * with exactly-one-polygon validation, after the enablement gate passes.
 *
 * Contract: SYSTEM/docs/Region_Transit_Provider_Contract_v2.md
 */

const PROVIDER_ID = "seoul-metro";
const STATUS = "candidate_quarantined";
const NETWORK_ALLOWED = false;
const FORBIDDEN_METHOD = "nearest_centroid";
const MISSING_GATE = "Official boundary GeoJSON point-in-polygon importer not yet implemented; nearest-centroid matching is permanently forbidden";

/**
 * Report current matching status.
 * @returns {object} status report
 */
function reportStatus() {
  return Object.freeze({
    provider_id: PROVIDER_ID,
    status: STATUS,
    network_allowed: NETWORK_ALLOWED,
    network_dispatched: 0,
    forbidden_method: FORBIDDEN_METHOD,
    missing_gate: MISSING_GATE,
    note: "Original nearest-centroid matching is permanently forbidden. Existing material preserved as candidate evidence only."
  });
}

/**
 * Attempt matching — always fails closed.
 * @throws {Error} always — quarantined
 */
function main() {
  throw new Error(
    "서울·경기 후보 crosswalk는 격리 상태입니다. " +
    "시군구 중심점 최근접 매칭(nearest-centroid)은 영구 금지입니다. " +
    "공식 행정경계 GeoJSON 기반 point-in-polygon importer가 준비되기 전에는 실행할 수 없습니다. " +
    "Missing gate: " + MISSING_GATE
  );
}

if (require.main === module) {
  try { main(); } catch (e) { process.stderr.write(e.message + "\n"); process.exitCode = 1; }
}

module.exports = Object.freeze({ reportStatus, main, PROVIDER_ID, STATUS, NETWORK_ALLOWED, FORBIDDEN_METHOD, MISSING_GATE });
