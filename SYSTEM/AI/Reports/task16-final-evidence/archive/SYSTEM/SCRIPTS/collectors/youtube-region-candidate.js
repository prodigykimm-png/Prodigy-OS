"use strict";

/**
 * YouTube Region Candidate Adapter (DISABLED)
 *
 * Registry status: disabled
 * Auth: YouTube Data API key (query parameter)
 * Policy: no key means blocked_auth with zero network; never canonical metric.
 * Candidate-only gate — results are metadata candidates, not verified data.
 * Quota-unit budget applies when eventually enabled.
 */

const PROVIDER_ID = "youtube_candidate";
const REGISTRY_STATUS = "disabled";

function adapterState(credentials) {
  const apiKey = typeof credentials === "object" && credentials !== null
    ? String(credentials.apiKey || "").trim()
    : typeof credentials === "string"
      ? credentials.trim()
      : "";

  if (!apiKey) {
    return Object.freeze({
      provider: PROVIDER_ID,
      registry_status: REGISTRY_STATUS,
      status: "blocked_auth",
      reason: "YouTube Data API key is required.",
      network_allowed: false,
      network_dispatched: false,
      request_count: 0,
      canonical_metric: false,
      candidates: []
    });
  }

  // Even with valid credentials, the provider is disabled by registry policy.
  return Object.freeze({
    provider: PROVIDER_ID,
    registry_status: REGISTRY_STATUS,
    status: "disabled",
    reason: "Provider is disabled in the source registry. Enablement requires a reviewed plan amendment.",
    network_allowed: false,
    network_dispatched: false,
    request_count: 0,
    canonical_metric: false,
    candidates: []
  });
}

/**
 * Attempt to collect candidates. Always returns blocked state — zero network.
 */
function collect(_regionKey, _query, credentials) {
  const state = adapterState(credentials);
  return Object.freeze({
    ...state,
    collected_at: null,
    error: state.status === "blocked_auth"
      ? "API 키가 없습니다. 네트워크 요청을 보내지 않았습니다."
      : "비활성 provider입니다. 네트워크 요청을 보내지 않았습니다."
  });
}

module.exports = Object.freeze({
  PROVIDER_ID,
  REGISTRY_STATUS,
  adapterState,
  collect
});
