/**
 * region-comparable-core.js
 *
 * Internal exact-region/property-type comparable rows and external
 * comparable availability projection.
 *
 * Internal comparables:
 *   - Exact region_key match
 *   - Exact mapped property type (via auction-learning-core normalization)
 *   - Area difference abs(candidate-target)/target <= 0.20
 *   - Valid durable outcome with result price
 *   - 12-month window (both endpoints inclusive)
 *   - Deduplication by canonical case identity
 *
 * External comparables:
 *   - Projected as unavailable until MOLIT receives a reviewed fixture
 *   - Never estimated
 *
 * Incheon code-era rule:
 *   - Based on transaction/result date (NOT fetch date)
 *   - Before 2026-07-01: successor district rows unavailable
 *     (제물포구, 영종구, 서해구, 검단구)
 *   - On/after 2026-07-01: successor codes are canonical
 *   - Seven unchanged Incheon districts remain eligible in both eras
 *
 * CommonJS. Pure functions; no filesystem access; no network.
 */
"use strict";

const path = require("path");

// Load auction-learning-core for property type normalization
const auctionCore = require(path.resolve(__dirname, "..", "Views", "auction-learning-core.js"));

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const AREA_DIFF_INTERNAL = 0.20;

// Incheon code-era cutoff date
const INCHEON_REFORM_DATE = "2026-07-01";

// Four successor district region_keys (unavailable before reform date)
const INCHEON_SUCCESSOR_REGIONS = Object.freeze([
  "인천광역시-제물포구",
  "인천광역시-영종구",
  "인천광역시-서해구",
  "인천광역시-검단구",
]);

const INCHEON_SUCCESSOR_SET = new Set(INCHEON_SUCCESSOR_REGIONS);

// Four successor household codes
const INCHEON_SUCCESSOR_CODES = Object.freeze([
  "2812500000",
  "2815500000",
  "2827500000",
  "2829000000",
]);

const INCHEON_SUCCESSOR_CODE_SET = new Set(INCHEON_SUCCESSOR_CODES);

// Seven unchanged Incheon districts (eligible in both eras)
const INCHEON_UNCHANGED_REGIONS = Object.freeze([
  "인천광역시-미추홀구",
  "인천광역시-연수구",
  "인천광역시-남동구",
  "인천광역시-부평구",
  "인천광역시-계양구",
  "인천광역시-강화군",
  "인천광역시-옹진군",
]);

// ---------------------------------------------------------------------------
// Date utilities (mirror auction-learning-core)
// ---------------------------------------------------------------------------

function nfc(s) {
  return typeof s === "string" ? s.normalize("NFC").trim() : "";
}

function parseIsoDate(iso) {
  if (typeof iso !== "string") return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return null;
  const y = parseInt(m[1], 10);
  const mo = parseInt(m[2], 10);
  const d = parseInt(m[3], 10);
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  return { y, m: mo, d };
}

function daysInMonth(y, m) {
  return new Date(y, m, 0).getDate();
}

function isoFromDate(y, m, d) {
  return `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function compareIsoDate(a, b) {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

function subtract12Months(isoDate) {
  const parsed = parseIsoDate(isoDate);
  if (!parsed) return null;
  const y = parsed.y - 1;
  const m = parsed.m;
  let d = parsed.d;
  const maxDay = daysInMonth(y, m);
  if (d > maxDay) d = maxDay;
  return isoFromDate(y, m, d);
}

function inWindow(dateIso, windowStart, asOf) {
  if (!dateIso || !windowStart || !asOf) return false;
  return compareIsoDate(dateIso, windowStart) >= 0 && compareIsoDate(dateIso, asOf) <= 0;
}

function extractDate(value) {
  const s = nfc(value);
  if (!s) return "";
  const match = /^(\d{4}-\d{2}-\d{2})/.exec(s);
  return match ? match[1] : "";
}

function toPositiveFinite(v) {
  if (typeof v === "number" && Number.isFinite(v) && v > 0) return v;
  if (typeof v === "string") {
    const n = Number(v);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Incheon code-era rule
// ---------------------------------------------------------------------------

/**
 * Determine if a region_key is eligible for comparables given a result date.
 * The code era is determined by the transaction/result date, NOT fetch date.
 *
 * @param {string} regionKey - NFC region_key
 * @param {string} resultDate - ISO date of the transaction/result
 * @returns {{ eligible: boolean, reason: string|null }}
 */
function incheonCodeEraEligibility(regionKey, resultDate) {
  const rk = nfc(regionKey);

  if (!INCHEON_SUCCESSOR_SET.has(rk)) {
    // Not a successor district — always eligible
    return { eligible: true, reason: null };
  }

  // Successor district: check result date against reform cutoff
  const rd = extractDate(resultDate);
  if (!rd) {
    return { eligible: false, reason: "missing_result_date" };
  }

  if (compareIsoDate(rd, INCHEON_REFORM_DATE) < 0) {
    return {
      eligible: false,
      reason: `incheon_code_era: successor district "${rk}" unavailable before ${INCHEON_REFORM_DATE}`,
    };
  }

  return { eligible: true, reason: null };
}

// ---------------------------------------------------------------------------
// Case identity and deduplication
// ---------------------------------------------------------------------------

/**
 * Group candidates by identity and exclude duplicates.
 * Returns { eligible: [...], excluded: [...] }.
 */
function uniqueEligibleCases(candidates) {
  const byId = new Map();
  const byPath = new Map();

  for (const c of candidates) {
    const id = nfc(c.id);
    const p = nfc(c.path || c.source_path || "");

    if (id) {
      if (!byId.has(id)) byId.set(id, []);
      byId.get(id).push(c);
    }
    if (p) {
      if (!byPath.has(p)) byPath.set(p, []);
      byPath.get(p).push(c);
    }
  }

  const excludedSet = new Set();
  const diagnostics = [];

  for (const [id, group] of byId) {
    if (group.length > 1) {
      group.forEach((c) => excludedSet.add(c));
      diagnostics.push({ type: "duplicate_id", id, count: group.length });
    }
  }

  for (const [p, group] of byPath) {
    if (group.length > 1) {
      group.forEach((c) => excludedSet.add(c));
      diagnostics.push({ type: "duplicate_path", path: p, count: group.length });
    }
  }

  const eligible = candidates.filter((c) => !excludedSet.has(c));
  const excluded = candidates.filter((c) => excludedSet.has(c));

  return { eligible, excluded, diagnostics };
}

// ---------------------------------------------------------------------------
// Internal comparables
// ---------------------------------------------------------------------------

/**
 * Find internal comparables for a target case.
 *
 * Rules:
 *   - Exact region_key (NFC)
 *   - Exact mapped property type (auction-learning-core normalization)
 *   - Area difference abs(candidate-target)/target <= 0.20
 *   - Valid outcome (won/lost/skipped) with positive winning_bid_price
 *   - Result date within 12-month window [as_of - 12m, as_of] inclusive
 *   - Incheon code-era rule applied per candidate result date
 *   - Deduplication by canonical identity
 *   - Sort: result date desc, area delta asc, ID code-point asc
 *
 * @param {object} target - { region_key, property_type, exclusive_area }
 * @param {Array} candidates - Array of case records
 * @param {object} options - { as_of: "YYYY-MM-DD" }
 * @returns {Array} Sorted comparable rows
 */
function internalComparables(target, candidates, options) {
  const opts = options || {};
  const asOf = nfc(opts.as_of);
  if (!asOf || !parseIsoDate(asOf)) return [];

  const windowStart = subtract12Months(asOf);
  if (!windowStart) return [];

  const targetRegion = nfc(target.region_key);
  const targetType = auctionCore.normalizePropertyType(target.property_type);
  const targetArea = toPositiveFinite(target.exclusive_area);

  if (!targetRegion || targetType === "unmapped" || targetArea === null) return [];

  const { eligible } = uniqueEligibleCases(Array.isArray(candidates) ? candidates : []);
  const results = [];

  for (const candidate of eligible) {
    // Must have valid outcome with winning price
    const outcome = nfc(candidate.auction_outcome).toLowerCase();
    if (["won", "lost", "skipped"].indexOf(outcome) === -1) continue;
    const winPrice = toPositiveFinite(candidate.winning_bid_price);
    if (winPrice === null) continue;

    // Result date in window
    const resultDate = extractDate(candidate.auction_result_date);
    if (!inWindow(resultDate, windowStart, asOf)) continue;

    // Exact region_key
    if (nfc(candidate.region_key) !== targetRegion) continue;

    // Exact mapped type
    if (auctionCore.normalizePropertyType(candidate.property_type) !== targetType) continue;

    // Area diff <= 0.20
    const candArea = toPositiveFinite(candidate.exclusive_area);
    if (candArea === null) continue;
    const areaDiff = Math.abs(candArea - targetArea) / targetArea;
    if (areaDiff > AREA_DIFF_INTERNAL) continue;

    // Incheon code-era rule
    const eraCheck = incheonCodeEraEligibility(candidate.region_key, resultDate);
    if (!eraCheck.eligible) continue;

    results.push({
      record: candidate,
      result_date: resultDate,
      area_delta: Math.abs(candArea - targetArea),
      id: nfc(candidate.id),
    });
  }

  return sortComparables(results);
}

// ---------------------------------------------------------------------------
// External comparables (MOLIT)
// ---------------------------------------------------------------------------

/**
 * External comparables projection.
 * Always unavailable until MOLIT receives a reviewed fixture.
 * Never estimated.
 *
 * @param {object} _target - Target case (unused while blocked)
 * @param {object} _options - Options (unused while blocked)
 * @returns {object} Unavailable projection
 */
function externalComparables(_target, _options) {
  return Object.freeze({
    available: false,
    label: "정보 확인 불가",
    rows: Object.freeze([]),
    estimated: false,
    reason: "molit_apt_sale and molit_apt_rent are blocked_fixture; no reviewed fixture exists",
    providers: Object.freeze(["molit_apt_sale", "molit_apt_rent"]),
  });
}

// ---------------------------------------------------------------------------
// Sorting
// ---------------------------------------------------------------------------

/**
 * Sort comparables: result/transaction date desc, absolute area delta asc,
 * canonical ID code-point asc.
 */
function sortComparables(items) {
  const sorted = items.slice();
  sorted.sort((a, b) => {
    // Date descending
    const dc = compareIsoDate(b.result_date, a.result_date);
    if (dc !== 0) return dc;
    // Area delta ascending
    const ad = a.area_delta - b.area_delta;
    if (ad !== 0) return ad;
    // ID code-point ascending
    if (a.id < b.id) return -1;
    if (a.id > b.id) return 1;
    return 0;
  });
  return sorted;
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

module.exports = {
  AREA_DIFF_INTERNAL,
  INCHEON_REFORM_DATE,
  INCHEON_SUCCESSOR_REGIONS,
  INCHEON_SUCCESSOR_CODES,
  INCHEON_UNCHANGED_REGIONS,
  nfc,
  parseIsoDate,
  daysInMonth,
  isoFromDate,
  compareIsoDate,
  subtract12Months,
  inWindow,
  extractDate,
  toPositiveFinite,
  incheonCodeEraEligibility,
  uniqueEligibleCases,
  internalComparables,
  externalComparables,
  sortComparables,
};
