/**
 * molit-apt-sale.js
 *
 * MOLIT apartment sale transaction adapter (FAIL-CLOSED).
 * Registry status: blocked_fixture
 *
 * Zero network while blocked_fixture. Registry/request stubs only.
 * Reports exact missing transport/fixture gate.
 * No HTTP dispatch or parser implementation until exact official
 * request/response fixture is added through a reviewed contract amendment.
 *
 * External comparables remain "정보 확인 불가", never estimated.
 *
 * CommonJS. Uses only Node.js built-in modules.
 */
"use strict";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PROVIDER_ID = "molit_apt_sale";
const REGISTRY_STATUS = "blocked_fixture";
const DATASET_ID = "15126469";
const CANONICAL_SOURCE_URL = `https://www.data.go.kr/data/${DATASET_ID}/openapi.do`;

const TRANSPORT_MISSING_REASON =
  "blocked_fixture: exact operation path unapproved; no HTTP dispatch until reviewed fixture";

const FIXTURE_MISSING_REASON =
  "no official request/response fixture exists; external comparables remain 정보 확인 불가, never estimated";

// Intended scope (metadata only, never executed)
const INTENDED_SCOPE = Object.freeze({
  lawd_code: "first 5 digits",
  deal_ymd: "DEAL_YMD",
  measures: ["price KRW", "exclusive area m2", "date", "official ID"],
});

// ---------------------------------------------------------------------------
// Fail-closed stubs
// ---------------------------------------------------------------------------

/**
 * Attempt to build a request. Always fails closed.
 * @returns {object} Blocked receipt
 */
function buildRequest() {
  return Object.freeze({
    provider: PROVIDER_ID,
    status: "blocked_fixture",
    network_allowed: false,
    network_dispatched: false,
    request_count: 0,
    request: null,
    gate: Object.freeze({
      transport_missing: true,
      transport_missing_reason: TRANSPORT_MISSING_REASON,
      fixture_missing: true,
      fixture_missing_reason: FIXTURE_MISSING_REASON,
    }),
  });
}

/**
 * Attempt to dispatch a request. Always fails closed with zero network.
 * @returns {object} Blocked receipt
 */
function dispatch() {
  return Object.freeze({
    provider: PROVIDER_ID,
    status: "blocked_fixture",
    network_allowed: false,
    network_dispatched: false,
    request_count: 0,
    rows: Object.freeze([]),
    gate: Object.freeze({
      transport_missing: true,
      transport_missing_reason: TRANSPORT_MISSING_REASON,
      fixture_missing: true,
      fixture_missing_reason: FIXTURE_MISSING_REASON,
    }),
    error: "molit_apt_sale: dispatch forbidden while blocked_fixture; zero network",
  });
}

/**
 * Attempt to parse a response. Always fails closed.
 * @returns {object} Blocked receipt
 */
function parseResponse() {
  return Object.freeze({
    provider: PROVIDER_ID,
    status: "blocked_fixture",
    network_allowed: false,
    network_dispatched: false,
    request_count: 0,
    rows: Object.freeze([]),
    gate: Object.freeze({
      transport_missing: true,
      transport_missing_reason: TRANSPORT_MISSING_REASON,
      fixture_missing: true,
      fixture_missing_reason: FIXTURE_MISSING_REASON,
    }),
    error: "molit_apt_sale: parser not implemented while blocked_fixture",
  });
}

/**
 * External comparables availability.
 * Always unavailable; never estimated.
 */
function externalComparablesAvailable() {
  return Object.freeze({
    provider: PROVIDER_ID,
    available: false,
    label: "정보 확인 불가",
    reason: FIXTURE_MISSING_REASON,
    estimated: false,
  });
}

/**
 * Adapter state report.
 */
function adapterState() {
  return Object.freeze({
    provider: PROVIDER_ID,
    registry_status: REGISTRY_STATUS,
    dataset_id: DATASET_ID,
    canonical_source_url: CANONICAL_SOURCE_URL,
    status: "blocked_fixture",
    network_allowed: false,
    network_dispatched: false,
    request_count: 0,
    intended_scope: INTENDED_SCOPE,
    gate: Object.freeze({
      transport_missing: true,
      transport_missing_reason: TRANSPORT_MISSING_REASON,
      fixture_missing: true,
      fixture_missing_reason: FIXTURE_MISSING_REASON,
    }),
  });
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

module.exports = {
  PROVIDER_ID,
  REGISTRY_STATUS,
  DATASET_ID,
  CANONICAL_SOURCE_URL,
  TRANSPORT_MISSING_REASON,
  FIXTURE_MISSING_REASON,
  INTENDED_SCOPE,
  buildRequest,
  dispatch,
  parseResponse,
  externalComparablesAvailable,
  adapterState,
};
