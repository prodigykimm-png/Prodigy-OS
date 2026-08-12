"use strict";

/**
 * VWorld Admin Boundary Adapter (FAIL-CLOSED STUB)
 *
 * Registry provider: admin_boundary_vworld
 * Registry status: blocked_fixture
 * Source: VWorld WFS 1.1.0 lt_c_adsigg_info
 *
 * GET contract frozen in plan:
 *   SERVICE=WFS
 *   VERSION=1.1.0
 *   REQUEST=GetFeature
 *   TYPENAME=lt_c_adsigg_info
 *   OUTPUT=application/json
 *   SRSNAME=EPSG:4326
 *   MAXFEATURES=1000
 *
 * PAGE/BBOX absent. EPSG:4326 only.
 * No dispatch until reviewed total=count<1000 complete-code fixture exists.
 */

const PROVIDER_ID = "admin_boundary_vworld";
const REGISTRY_STATUS = "blocked_fixture";

/**
 * Frozen WFS GET query parameters (no PAGE, no BBOX).
 */
const WFS_QUERY = Object.freeze({
  SERVICE: "WFS",
  VERSION: "1.1.0",
  REQUEST: "GetFeature",
  TYPENAME: "lt_c_adsigg_info",
  OUTPUT: "application/json",
  SRSNAME: "EPSG:4326",
  MAXFEATURES: "1000",
});

const FORBIDDEN_PARAMS = Object.freeze(["PAGE", "BBOX"]);
const REQUIRED_CRS = "EPSG:4326";

/**
 * Validate that a query object matches the frozen contract.
 * Rejects PAGE/BBOX. Rejects non-EPSG:4326 CRS.
 */
function validateQuery(query) {
  const errors = [];
  if (!query || typeof query !== "object") {
    return ["query must be an object"];
  }

  // Check forbidden params
  for (const param of FORBIDDEN_PARAMS) {
    if (Object.prototype.hasOwnProperty.call(query, param)) {
      errors.push(`forbidden parameter: ${param}`);
    }
  }

  // Check required params
  for (const [key, value] of Object.entries(WFS_QUERY)) {
    if (!Object.prototype.hasOwnProperty.call(query, key)) {
      errors.push(`missing required parameter: ${key}`);
    } else if (query[key] !== value) {
      errors.push(`parameter ${key} must be "${value}", got "${query[key]}"`);
    }
  }

  // Check no extra params beyond frozen set + KEY + DOMAIN
  const allowed = new Set([...Object.keys(WFS_QUERY), "KEY", "DOMAIN"]);
  for (const key of Object.keys(query)) {
    if (!allowed.has(key)) {
      errors.push(`unexpected parameter: ${key}`);
    }
  }

  return errors;
}

/**
 * Adapter state — always blocked_fixture, zero network.
 * Reports the exact missing gate.
 */
function adapterState() {
  return Object.freeze({
    provider: PROVIDER_ID,
    registry_status: REGISTRY_STATUS,
    status: "blocked_fixture",
    reason: "blocked_fixture: exact KEY/DOMAIN unapproved; no reviewed complete-code fixture",
    missing_gate: "no reviewed total=count<1000 complete-code fixture exists; PAGE/BBOX absent",
    wfs_query: WFS_QUERY,
    forbidden_params: FORBIDDEN_PARAMS,
    required_crs: REQUIRED_CRS,
    network_allowed: false,
    network_dispatched: false,
    request_count: 0,
    fixture_policy: "absent_blocked",
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
    error: "검토된 complete-code fixture가 없습니다. PAGE/BBOX 없음. 네트워크 요청을 보내지 않았습니다.",
  });
}

module.exports = Object.freeze({
  PROVIDER_ID,
  REGISTRY_STATUS,
  WFS_QUERY,
  FORBIDDEN_PARAMS,
  REQUIRED_CRS,
  validateQuery,
  adapterState,
  collect,
});
