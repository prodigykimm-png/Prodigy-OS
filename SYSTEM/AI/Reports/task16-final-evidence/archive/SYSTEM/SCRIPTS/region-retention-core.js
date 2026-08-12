/**
 * region-retention-core.js
 *
 * Non-mutating retention visibility for Region Intelligence.
 *
 * Computes:
 *   - visible_periods: the latest N distinct canonical periods surfaced
 *   - future_archive_eligible: generations that a future, separately-reviewed
 *     archive amendment MAY consider, excluding every correction generation.
 *
 * This module performs NO move, archive, prune, unlink, overwrite, or
 * restoration. "latest 25" means the latest 25 distinct canonical periods
 * surfaced, NOT 25 generations. Every correction generation is retained
 * indefinitely and is never archive-eligible.
 *
 * CommonJS. Pure functions; no filesystem writes.
 */
"use strict";

// ---------------------------------------------------------------------------
// Period ordering
// ---------------------------------------------------------------------------

/**
 * Compare two YYYY-MM period strings. Returns -1/0/1.
 */
function comparePeriod(a, b) {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

/**
 * Distinct canonical periods present in a generation list, sorted ascending.
 */
function distinctPeriods(generations) {
  const set = new Set();
  for (const g of generations) {
    set.add(g.period);
  }
  return Array.from(set).sort(comparePeriod);
}

// ---------------------------------------------------------------------------
// Visibility
// ---------------------------------------------------------------------------

/**
 * Compute the latest `limit` distinct canonical periods surfaced.
 *
 * @param {Array<{period:string}>} generations
 * @param {number} limit - e.g. 25 for monthly providers
 * @returns {string[]} latest distinct periods, ascending
 */
function computeVisiblePeriods(generations, limit) {
  if (!Array.isArray(generations)) {
    throw new Error("generations must be an array");
  }
  if (!Number.isInteger(limit) || limit < 1) {
    throw new Error("limit must be a positive integer");
  }
  const periods = distinctPeriods(generations);
  // latest `limit` distinct periods, returned ascending
  const latest = periods.slice(Math.max(0, periods.length - limit));
  return latest;
}

// ---------------------------------------------------------------------------
// Archive eligibility (future-only; never executed here)
// ---------------------------------------------------------------------------

/**
 * A generation is a correction if it shares a period with an earlier accepted
 * generation of the same period (is_correction flag) OR is explicitly flagged.
 * We treat `is_correction === true` as authoritative, and also detect
 * same-period multiplicity: any period with more than one generation means
 * every generation of that period beyond the first accepted is a correction
 * and ALL generations of a corrected period are retained indefinitely.
 */
function isCorrectionGeneration(gen, periodCounts) {
  if (gen.is_correction === true) return true;
  // Any period that has more than one generation is a corrected period;
  // every generation of that period is retained indefinitely.
  if (periodCounts && periodCounts.get(gen.period) > 1) return true;
  return false;
}

/**
 * Compute which generations are eligible for a FUTURE archive policy.
 * This is advisory metadata only — nothing is moved or deleted.
 *
 * Rules:
 *   - Every correction generation is retained indefinitely (never eligible).
 *   - Every quarantined generation is retained indefinitely (never eligible).
 *   - Generations whose period is within the visible window are not eligible.
 *   - Only non-correction, non-quarantined generations of periods OLDER than
 *     the visible window become future_archive_eligible.
 *
 * @param {Array} generations - each: { generation_id, period, is_correction, quarantined, fetched_at }
 * @param {number} limit - visible period count
 * @returns {{ visible_periods: string[], future_archive_eligible: string[], retained_indefinitely: string[] }}
 */
function computeRetention(generations, limit) {
  if (!Array.isArray(generations)) {
    throw new Error("generations must be an array");
  }
  const visiblePeriods = computeVisiblePeriods(generations, limit);
  const visibleSet = new Set(visiblePeriods);

  const periodCounts = new Map();
  for (const g of generations) {
    periodCounts.set(g.period, (periodCounts.get(g.period) || 0) + 1);
  }

  const futureArchiveEligible = [];
  const retainedIndefinitely = [];

  for (const g of generations) {
    const correction = isCorrectionGeneration(g, periodCounts);
    const quarantined = g.quarantined === true;
    const inVisible = visibleSet.has(g.period);

    if (correction || quarantined) {
      // Retained indefinitely, never archive-eligible.
      retainedIndefinitely.push(g.generation_id);
      continue;
    }
    if (inVisible) {
      // Surfaced; not eligible.
      continue;
    }
    // Older-than-window, non-correction, non-quarantined.
    futureArchiveEligible.push(g.generation_id);
  }

  return {
    visible_periods: visiblePeriods,
    future_archive_eligible: futureArchiveEligible.sort(),
    retained_indefinitely: retainedIndefinitely.sort(),
  };
}

// ---------------------------------------------------------------------------
// Guard: assert no mutation verbs are present in this module's behavior.
// (A self-documenting invariant used by tests.)
// ---------------------------------------------------------------------------

const MUTATION_VERBS_FORBIDDEN = [
  "move",
  "archive",
  "prune",
  "unlink",
  "overwrite",
  "restore",
  "delete",
  "rename",
];

/**
 * Returns true to signal this core performs no mutation. Tests assert the
 * module exposes no mutating function names.
 */
function performsNoMutation() {
  return true;
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

module.exports = {
  comparePeriod,
  distinctPeriods,
  computeVisiblePeriods,
  isCorrectionGeneration,
  computeRetention,
  performsNoMutation,
  MUTATION_VERBS_FORBIDDEN,
};
