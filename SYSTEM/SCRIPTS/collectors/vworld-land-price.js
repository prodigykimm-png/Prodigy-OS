"use strict";

/**
 * VWorld Land Price Adapter (FAIL-CLOSED STUB)
 *
 * Registry providers: official_land_price_region, official_land_price_case
 * Registry status: blocked_fixture
 * Source: data.go.kr LINK 15123971 (region) / LINK 15124014 (case) → VWorld
 *
 * Intended scope:
 * - Region: parcel partition × year, KRW/m²
 * - Case: one Auction Case target/parcel × year, KRW/m²
 *
 * LINK is not a data.go.kr ServiceKey. Blocked until exact KEY/DOMAIN
 * request and response fixture is reviewed. No shared batch between
 * region and case scopes.
 */

const PROVIDER_ID_REGION = "official_land_price_region";
const PROVIDER_ID_CASE = "official_land_price_case";
const REGISTRY_STATUS = "blocked_fixture";
const LINK_REGION = "15123971";
const LINK_CASE = "15124014";
const UNIT = "KRW/m2";

/**
 * Adapter state for region scope — always blocked_fixture, zero network.
 */
function adapterStateRegion() {
  return Object.freeze({
    provider: PROVIDER_ID_REGION,
    registry_status: REGISTRY_STATUS,
    link_id: LINK_REGION,
    scope: "region",
    status: "blocked_fixture",
    reason: "blocked_fixture: exact linked VWorld operation unapproved; LINK is not data.go ServiceKey",
    missing_gate: "LINK is not data.go ServiceKey; no exact KEY/DOMAIN request and response fixture reviewed",
    network_allowed: false,
    network_dispatched: false,
    request_count: 0,
    fixture_policy: "absent_blocked",
    unit: UNIT,
  });
}

/**
 * Adapter state for case scope — always blocked_fixture, zero network.
 */
function adapterStateCase() {
  return Object.freeze({
    provider: PROVIDER_ID_CASE,
    registry_status: REGISTRY_STATUS,
    link_id: LINK_CASE,
    scope: "case",
    status: "blocked_fixture",
    reason: "blocked_fixture: exact linked VWorld operation unapproved; no shared batch",
    missing_gate: "no shared batch; no reviewed fixture exists for case-level land price",
    network_allowed: false,
    network_dispatched: false,
    request_count: 0,
    fixture_policy: "absent_blocked",
    unit: UNIT,
  });
}

/**
 * Attempt to collect region land price. Always blocked — zero network.
 */
function collectRegion() {
  const state = adapterStateRegion();
  return Object.freeze({
    ...state,
    collected_at: null,
    error: "LINK는 data.go.kr ServiceKey가 아닙니다. 검토된 KEY/DOMAIN fixture가 없습니다. 네트워크 요청을 보내지 않았습니다.",
  });
}

/**
 * Attempt to collect case land price. Always blocked — zero network.
 */
function collectCase() {
  const state = adapterStateCase();
  return Object.freeze({
    ...state,
    collected_at: null,
    error: "공유 배치 없음. 검토된 fixture가 없습니다. 네트워크 요청을 보내지 않았습니다.",
  });
}

module.exports = Object.freeze({
  PROVIDER_ID_REGION,
  PROVIDER_ID_CASE,
  REGISTRY_STATUS,
  LINK_REGION,
  LINK_CASE,
  UNIT,
  adapterStateRegion,
  adapterStateCase,
  collectRegion,
  collectCase,
});
