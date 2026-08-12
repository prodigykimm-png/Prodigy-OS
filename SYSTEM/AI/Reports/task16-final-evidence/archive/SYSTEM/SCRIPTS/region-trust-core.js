/**
 * region-trust-core.js
 *
 * Four INDEPENDENT trust fields for Region Intelligence evidence.
 *
 *   - freshness:    age-based (is the evidence recent enough?)
 *   - verification: human-confirmed (has a person approved it?)
 *   - coverage:     code/Region match (do the codes map to the 83 Regions?)
 *   - schema:       parser version match (does the parser match the registry?)
 *
 * HARD RULE: these four fields are NEVER aggregated into one opaque score.
 * Each is reported separately so a stale-but-verified value is never hidden
 * behind a green composite, and a stale owner can never advance a pointer.
 *
 * CommonJS. Pure functions; no filesystem access.
 */
"use strict";

// ---------------------------------------------------------------------------
// Freshness
// ---------------------------------------------------------------------------

/**
 * Compute freshness from a fetched_at timestamp and a max age.
 *
 * @param {object} params
 * @param {string} params.fetched_at - ISO timestamp
 * @param {string} params.as_of - ISO timestamp (the render/check time)
 * @param {number} params.max_age_ms - maximum acceptable age in ms
 * @returns {{ field:"freshness", ok:boolean, age_ms:number, reason:string|null }}
 */
function evaluateFreshness(params) {
  const { fetched_at, as_of, max_age_ms } = params;
  const fetched = Date.parse(fetched_at);
  const now = Date.parse(as_of);
  if (Number.isNaN(fetched) || Number.isNaN(now)) {
    return { field: "freshness", ok: false, age_ms: null, reason: "invalid_timestamp" };
  }
  if (!Number.isFinite(max_age_ms) || max_age_ms < 0) {
    return { field: "freshness", ok: false, age_ms: null, reason: "invalid_max_age" };
  }
  const age = now - fetched;
  if (age < 0) {
    // Future-dated evidence is not fresh/trustworthy.
    return { field: "freshness", ok: false, age_ms: age, reason: "future_dated" };
  }
  const ok = age <= max_age_ms;
  return { field: "freshness", ok, age_ms: age, reason: ok ? null : "stale" };
}

// ---------------------------------------------------------------------------
// Verification
// ---------------------------------------------------------------------------

/**
 * Verification = human-confirmed. Requires an explicit approver identity and
 * a confirmed_at timestamp. A stale owner (owner whose lease/term expired)
 * cannot satisfy verification.
 *
 * @param {object} params
 * @param {boolean} params.human_confirmed
 * @param {string|null} params.approver - nonempty approver identity
 * @param {string|null} params.confirmed_at - ISO timestamp
 * @param {boolean} [params.owner_stale] - true if the confirming owner is stale
 * @returns {{ field:"verification", ok:boolean, reason:string|null }}
 */
function evaluateVerification(params) {
  const { human_confirmed, approver, confirmed_at, owner_stale } = params;
  if (owner_stale === true) {
    return { field: "verification", ok: false, reason: "stale_owner" };
  }
  if (human_confirmed !== true) {
    return { field: "verification", ok: false, reason: "not_confirmed" };
  }
  if (typeof approver !== "string" || approver.length === 0) {
    return { field: "verification", ok: false, reason: "missing_approver" };
  }
  if (typeof confirmed_at !== "string" || Number.isNaN(Date.parse(confirmed_at))) {
    return { field: "verification", ok: false, reason: "missing_confirmed_at" };
  }
  return { field: "verification", ok: true, reason: null };
}

// ---------------------------------------------------------------------------
// Coverage
// ---------------------------------------------------------------------------

/**
 * Coverage = code/Region match. Every normalized code must map to one of the
 * 83 canonical Regions; predecessor/unknown codes reduce coverage.
 *
 * @param {object} params
 * @param {number} params.matched_codes - count of codes mapping to a Region
 * @param {number} params.total_codes - total normalized codes
 * @param {number} [params.quarantined_codes] - count quarantined
 * @returns {{ field:"coverage", ok:boolean, ratio:number, reason:string|null }}
 */
function evaluateCoverage(params) {
  const { matched_codes, total_codes, quarantined_codes } = params;
  if (!Number.isInteger(total_codes) || total_codes < 0) {
    return { field: "coverage", ok: false, ratio: null, reason: "invalid_total" };
  }
  if (!Number.isInteger(matched_codes) || matched_codes < 0) {
    return { field: "coverage", ok: false, ratio: null, reason: "invalid_matched" };
  }
  if (matched_codes > total_codes) {
    return { field: "coverage", ok: false, ratio: null, reason: "matched_exceeds_total" };
  }
  if (total_codes === 0) {
    return { field: "coverage", ok: false, ratio: 0, reason: "no_codes" };
  }
  const ratio = matched_codes / total_codes;
  const quar = quarantined_codes || 0;
  // Coverage is ok only when every code matched and none were quarantined.
  const ok = matched_codes === total_codes && quar === 0;
  return {
    field: "coverage",
    ok,
    ratio,
    reason: ok ? null : quar > 0 ? "quarantined_codes" : "unmatched_codes",
  };
}

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

/**
 * Schema = parser version match. The parser version that produced the
 * normalized rows must equal the registry's declared parser_version.
 *
 * @param {object} params
 * @param {string} params.parser_version - version used to parse
 * @param {string} params.registry_parser_version - registry-declared version
 * @returns {{ field:"schema", ok:boolean, reason:string|null }}
 */
function evaluateSchema(params) {
  const { parser_version, registry_parser_version } = params;
  if (typeof parser_version !== "string" || parser_version.length === 0) {
    return { field: "schema", ok: false, reason: "missing_parser_version" };
  }
  if (typeof registry_parser_version !== "string" || registry_parser_version.length === 0) {
    return { field: "schema", ok: false, reason: "missing_registry_version" };
  }
  const ok = parser_version === registry_parser_version;
  return { field: "schema", ok, reason: ok ? null : "parser_version_mismatch" };
}

// ---------------------------------------------------------------------------
// Composite report (NOT a score)
// ---------------------------------------------------------------------------

/**
 * Produce the four independent trust fields as a report object.
 * This deliberately does NOT compute a combined numeric score.
 *
 * @param {object} fields - { freshness, verification, coverage, schema }
 * @returns {object} report with the four fields and an all_ok convenience flag
 */
function buildTrustReport(fields) {
  const required = ["freshness", "verification", "coverage", "schema"];
  for (const f of required) {
    if (!fields[f] || fields[f].field !== f) {
      throw new Error(`buildTrustReport requires a "${f}" evaluation result`);
    }
  }
  return {
    freshness: fields.freshness,
    verification: fields.verification,
    coverage: fields.coverage,
    schema: fields.schema,
    // Convenience boolean, but NEVER a numeric aggregation/score.
    all_ok:
      fields.freshness.ok &&
      fields.verification.ok &&
      fields.coverage.ok &&
      fields.schema.ok,
  };
}

/**
 * Guard: assert a trust report does not contain an aggregated score field.
 * Used by tests to enforce the "never one opaque score" contract.
 */
function assertNoAggregateScore(report) {
  const forbidden = ["score", "trust_score", "composite", "aggregate", "overall_score"];
  for (const key of forbidden) {
    if (Object.prototype.hasOwnProperty.call(report, key)) {
      throw new Error(`Trust report must not contain aggregated field "${key}"`);
    }
  }
  return true;
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

module.exports = {
  evaluateFreshness,
  evaluateVerification,
  evaluateCoverage,
  evaluateSchema,
  buildTrustReport,
  assertNoAggregateScore,
};
