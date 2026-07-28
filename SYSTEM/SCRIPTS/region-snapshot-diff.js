/**
 * region-snapshot-diff.js
 *
 * Correction-aware snapshot diff for Region Intelligence.
 *
 * Baseline selection rules (from the Evidence lineage hard contract):
 *   - Same-period official correction compares against the prior ACCEPTED
 *     same-period generation.
 *   - A new period compares against the GREATEST accepted EARLIER period.
 *   - Raw-changed / normalized-equal => "unchanged" with raw_revision:true.
 *   - Missing baseline is NOT "no change"; it is reported as
 *     baseline:"missing" so downstream never infers stability.
 *
 * CommonJS. Pure functions; no filesystem access.
 */
"use strict";

const runState = require("./region-run-state-core.js");

// ---------------------------------------------------------------------------
// Baseline selection
// ---------------------------------------------------------------------------

/**
 * Select the baseline generation for a candidate generation.
 *
 * @param {object} candidate - { period, generation_id, ... }
 * @param {Array} accepted - accepted generations, each:
 *   { generation_id, period, accepted:true, fetched_at, official_revision_at? }
 * @returns {{ kind: "same_period_correction"|"earlier_period"|"missing", baseline: object|null }}
 */
function selectBaseline(candidate, accepted) {
  if (!candidate || typeof candidate.period !== "string") {
    throw new Error("candidate must have a period");
  }
  if (!Array.isArray(accepted)) {
    throw new Error("accepted must be an array");
  }
  const acceptedList = accepted.filter((g) => g.accepted === true);

  // 1) Same-period correction: prior accepted generation of the SAME period.
  const samePeriod = acceptedList
    .filter((g) => g.period === candidate.period)
    .sort((a, b) => compareAcceptedOrder(a, b));

  if (samePeriod.length > 0) {
    // Greatest accepted same-period generation (latest by order).
    return { kind: "same_period_correction", baseline: samePeriod[samePeriod.length - 1] };
  }

  // 2) New period: greatest accepted EARLIER period.
  const earlier = acceptedList
    .filter((g) => g.period < candidate.period)
    .sort((a, b) => {
      const pc = a.period < b.period ? -1 : a.period > b.period ? 1 : 0;
      if (pc !== 0) return pc;
      return compareAcceptedOrder(a, b);
    });

  if (earlier.length > 0) {
    return { kind: "earlier_period", baseline: earlier[earlier.length - 1] };
  }

  // 3) Missing baseline.
  return { kind: "missing", baseline: null };
}

/**
 * Ordering among accepted generations: by (official_revision_at||fetched_at),
 * then fetched_at, then generation_id code-point. Matches the plan's
 * duplicate-source fingerprint selection tuple.
 */
function compareAcceptedOrder(a, b) {
  const aRev = a.official_revision_at || a.fetched_at || "";
  const bRev = b.official_revision_at || b.fetched_at || "";
  if (aRev < bRev) return -1;
  if (aRev > bRev) return 1;
  const aF = a.fetched_at || "";
  const bF = b.fetched_at || "";
  if (aF < bF) return -1;
  if (aF > bF) return 1;
  const aId = a.generation_id || "";
  const bId = b.generation_id || "";
  if (aId < bId) return -1;
  if (aId > bId) return 1;
  return 0;
}

// ---------------------------------------------------------------------------
// Row-level diff
// ---------------------------------------------------------------------------

/**
 * Compare two normalized snapshots (arrays of rows keyed by a code field).
 *
 * @param {object} params
 * @param {Array} params.current - current normalized rows
 * @param {Array|null} params.baseline - baseline normalized rows (null if missing)
 * @param {string} params.keyField - identity field (e.g. "household_code")
 * @param {string} params.currentRawHash - sha256 of current raw bytes
 * @param {string|null} params.baselineRawHash - sha256 of baseline raw bytes
 * @param {string} params.currentNormalizedHash - sha256 of current normalized.json
 * @param {string|null} params.baselineNormalizedHash
 * @returns {object} diff document
 */
function diffSnapshots(params) {
  const {
    current,
    baseline,
    keyField,
    currentRawHash,
    baselineRawHash,
    currentNormalizedHash,
    baselineNormalizedHash,
  } = params;

  if (!Array.isArray(current)) {
    throw new Error("current must be an array of normalized rows");
  }
  if (!keyField || typeof keyField !== "string") {
    throw new Error("keyField is required");
  }

  const rawChanged = baselineRawHash === null || currentRawHash !== baselineRawHash;
  const normalizedEqual =
    baselineNormalizedHash !== null && currentNormalizedHash === baselineNormalizedHash;

  // Missing baseline: never "no change".
  if (baseline === null || baselineRawHash === null) {
    return {
      baseline: "missing",
      raw_changed: true,
      normalized_equal: false,
      raw_revision: false,
      status: "no_baseline",
      added: indexBy(current, keyField).size,
      removed: 0,
      changed: 0,
      unchanged: 0,
      changes: [],
    };
  }

  // Raw-changed / normalized-equal => unchanged with raw_revision:true.
  if (rawChanged && normalizedEqual) {
    return {
      baseline: "present",
      raw_changed: true,
      normalized_equal: true,
      raw_revision: true,
      status: "unchanged",
      added: 0,
      removed: 0,
      changed: 0,
      unchanged: indexBy(current, keyField).size,
      changes: [],
    };
  }

  // Full row diff.
  const curIdx = indexBy(current, keyField);
  const baseIdx = indexBy(baseline, keyField);

  let added = 0;
  let removed = 0;
  let changed = 0;
  let unchanged = 0;
  const changes = [];

  for (const [key, curRow] of curIdx) {
    if (!baseIdx.has(key)) {
      added++;
      changes.push({ key, kind: "added", current: curRow });
      continue;
    }
    const baseRow = baseIdx.get(key);
    const fieldChanges = diffRow(baseRow, curRow);
    if (fieldChanges.length === 0) {
      unchanged++;
    } else {
      changed++;
      changes.push({ key, kind: "changed", fields: fieldChanges });
    }
  }
  for (const key of baseIdx.keys()) {
    if (!curIdx.has(key)) {
      removed++;
      changes.push({ key, kind: "removed", baseline: baseIdx.get(key) });
    }
  }

  changes.sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));

  const anyChange = added > 0 || removed > 0 || changed > 0;

  return {
    baseline: "present",
    raw_changed: rawChanged,
    normalized_equal: normalizedEqual,
    raw_revision: rawChanged && normalizedEqual,
    status: anyChange ? "changed" : "unchanged",
    added,
    removed,
    changed,
    unchanged,
    changes,
  };
}

function indexBy(rows, keyField) {
  const map = new Map();
  for (const row of rows) {
    const key = row[keyField];
    if (key === undefined || key === null) {
      throw new Error(`row missing keyField "${keyField}"`);
    }
    if (map.has(key)) {
      throw new Error(`duplicate key in diff input: "${key}"`);
    }
    map.set(key, row);
  }
  return map;
}

/**
 * Field-level diff between two rows. Missing (null) is a real value and is
 * compared as such; null vs number is a change, never coerced.
 */
function diffRow(baseRow, curRow) {
  const keys = new Set([...Object.keys(baseRow), ...Object.keys(curRow)]);
  const out = [];
  for (const k of Array.from(keys).sort()) {
    const bv = baseRow[k];
    const cv = curRow[k];
    if (!valuesEqual(bv, cv)) {
      out.push({ field: k, baseline: bv === undefined ? null : bv, current: cv === undefined ? null : cv });
    }
  }
  return out;
}

function valuesEqual(a, b) {
  if (a === b) return true;
  // Treat undefined as null for comparison stability.
  const an = a === undefined ? null : a;
  const bn = b === undefined ? null : b;
  return an === bn;
}

// ---------------------------------------------------------------------------
// High-level diff for a candidate generation
// ---------------------------------------------------------------------------

/**
 * Build a diff document for a candidate generation against the accepted set.
 *
 * @param {object} params
 * @param {object} params.candidate - { period, generation_id }
 * @param {Array} params.accepted - accepted generations with normalized rows + hashes
 * @param {Array} params.currentRows - normalized rows of candidate
 * @param {string} params.keyField
 * @param {string} params.currentRawHash
 * @param {string} params.currentNormalizedHash
 */
function diffGeneration(params) {
  const { candidate, accepted, currentRows, keyField, currentRawHash, currentNormalizedHash } = params;
  const { kind, baseline } = selectBaseline(candidate, accepted);

  const diff = diffSnapshots({
    current: currentRows,
    baseline: baseline ? baseline.rows : null,
    keyField,
    currentRawHash,
    baselineRawHash: baseline ? baseline.raw_hash : null,
    currentNormalizedHash,
    baselineNormalizedHash: baseline ? baseline.normalized_hash : null,
  });

  return {
    candidate_generation: candidate.generation_id,
    candidate_period: candidate.period,
    baseline_kind: kind,
    baseline_generation: baseline ? baseline.generation_id : null,
    diff,
  };
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

module.exports = {
  selectBaseline,
  compareAcceptedOrder,
  diffSnapshots,
  diffRow,
  diffGeneration,
  indexBy,
};
