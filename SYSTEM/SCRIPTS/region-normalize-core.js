/**
 * region-normalize-core.js
 *
 * Typed normalization for Region Intelligence raw provider bytes.
 * Converts raw bytes into normalized rows with provider-specific schemas.
 *
 * Hard rules:
 *   - Rejects malformed codes (wrong length, non-numeric where numeric expected).
 *   - Rejects duplicate codes within one provider response.
 *   - Missing values stay null; they are NEVER coerced to zero.
 *   - Ambiguity becomes a blocked_* status, never an inferred fact.
 *
 * CommonJS. Pure functions; no filesystem access.
 */
"use strict";

// ---------------------------------------------------------------------------
// Code validation
// ---------------------------------------------------------------------------

/**
 * Validate a 10-digit administrative household code (MOIS).
 */
function isValidHouseholdCode(code) {
  return typeof code === "string" && /^\d{10}$/.test(code);
}

/**
 * Validate an 8-digit LAWD code.
 */
function isValidLawdCode(code) {
  return typeof code === "string" && /^\d{8}$/.test(code);
}

/**
 * Validate a 5-digit sigungu code (first 5 of LAWD).
 */
function isValidSigunguCode(code) {
  return typeof code === "string" && /^\d{5}$/.test(code);
}

// ---------------------------------------------------------------------------
// Numeric parsing (missing stays null)
// ---------------------------------------------------------------------------

/**
 * Parse a numeric field. Empty/missing/whitespace-only => null (never 0).
 * Strips thousands separators (commas) and surrounding whitespace.
 * Returns null for anything that is not a finite number.
 */
function parseNumeric(raw) {
  if (raw === null || raw === undefined) return null;
  const s = String(raw).trim();
  if (s === "") return null;
  const cleaned = s.replace(/,/g, "");
  if (cleaned === "") return null;
  const n = Number(cleaned);
  if (!Number.isFinite(n)) return null;
  return n;
}

/**
 * Parse a ratio/percentage field. Missing => null.
 */
function parseRatio(raw) {
  return parseNumeric(raw);
}

// ---------------------------------------------------------------------------
// Duplicate detection
// ---------------------------------------------------------------------------

function assertNoDuplicateCodes(codes, providerId) {
  const seen = new Set();
  for (const c of codes) {
    if (seen.has(c)) {
      throw new Error(`${providerId}: duplicate code "${c}" in normalized rows`);
    }
    seen.add(c);
  }
}

// ---------------------------------------------------------------------------
// MOIS normalization (households / population CSV)
// ---------------------------------------------------------------------------

/**
 * Normalize MOIS jumin CSV rows.
 *
 * @param {Array<object>} parsedRows - each row has:
 *   { code, total_population, households, pop_per_household, male, female, ratio }
 *   (already column-mapped by the adapter; values are raw strings/numbers)
 * @param {string} period - "YYYY-MM"
 * @returns {{ rows: Array, quarantined: Array, status: string }}
 */
function normalizeMOIS(parsedRows, period) {
  if (!Array.isArray(parsedRows)) {
    throw new Error("mois: parsedRows must be an array");
  }
  const rows = [];
  const quarantined = [];
  const codes = [];

  for (const r of parsedRows) {
    const code = typeof r.code === "string" ? r.code.trim() : r.code;
    if (!isValidHouseholdCode(code)) {
      // Predecessor / malformed codes are quarantined, not dropped silently
      // and never coerced.
      quarantined.push({ raw_code: r.code, reason: "malformed_code" });
      continue;
    }
    codes.push(code);
    rows.push({
      provider: "mois_jumin_statmonth_csv",
      period,
      household_code: code,
      total_population: parseNumeric(r.total_population),
      households: parseNumeric(r.households),
      pop_per_household: parseRatio(r.pop_per_household),
      male_population: parseNumeric(r.male),
      female_population: parseNumeric(r.female),
      sex_ratio: parseRatio(r.ratio),
    });
  }

  assertNoDuplicateCodes(codes, "mois_jumin_statmonth_csv");

  return {
    provider: "mois_jumin_statmonth_csv",
    period,
    rows,
    quarantined,
    status: rows.length > 0 ? "normalized" : "blocked_coverage",
  };
}

// ---------------------------------------------------------------------------
// R-ONE normalization (market index / volume / jeonse)
// ---------------------------------------------------------------------------

/**
 * Normalize R-ONE public table rows.
 * @param {Array<object>} parsedRows - each: { sigungu_code, month, price_index, transaction_volume, jeonse_ratio }
 */
function normalizeRONE(parsedRows, period) {
  if (!Array.isArray(parsedRows)) {
    throw new Error("r-one: parsedRows must be an array");
  }
  const rows = [];
  const quarantined = [];
  const codes = [];

  for (const r of parsedRows) {
    const code = typeof r.sigungu_code === "string" ? r.sigungu_code.trim() : r.sigungu_code;
    if (!isValidSigunguCode(code)) {
      quarantined.push({ raw_code: r.sigungu_code, reason: "malformed_sigungu_code" });
      continue;
    }
    codes.push(code);
    rows.push({
      provider: "reb_rone_public_table",
      period: r.month || period,
      sigungu_code: code,
      price_index: parseNumeric(r.price_index),
      transaction_volume: parseNumeric(r.transaction_volume),
      jeonse_ratio: parseRatio(r.jeonse_ratio),
    });
  }

  assertNoDuplicateCodes(codes, "reb_rone_public_table");

  return {
    provider: "reb_rone_public_table",
    period,
    rows,
    quarantined,
    status: rows.length > 0 ? "normalized" : "blocked_coverage",
  };
}

// ---------------------------------------------------------------------------
// Stock normalization (apartment stock by 단지)
// ---------------------------------------------------------------------------

/**
 * Normalize reb_stock seed rows.
 * Identity is 단지고유번호; 세대수 summed as apartment stock 호 by address sigungu.
 * @param {Array<object>} parsedRows - each: { complex_id, address_sigungu, 세대수 }
 */
function normalizeStock(parsedRows, releasePeriod) {
  if (!Array.isArray(parsedRows)) {
    throw new Error("stock: parsedRows must be an array");
  }
  const rows = [];
  const quarantined = [];
  const ids = [];

  for (const r of parsedRows) {
    const id = typeof r.complex_id === "string" ? r.complex_id.trim() : String(r.complex_id);
    if (!id || id === "") {
      quarantined.push({ raw_id: r.complex_id, reason: "missing_complex_id" });
      continue;
    }
    const sigungu = typeof r.address_sigungu === "string" ? r.address_sigungu.trim() : r.address_sigungu;
    if (!sigungu) {
      quarantined.push({ raw_id: id, reason: "missing_address_sigungu" });
      continue;
    }
    ids.push(id);
    rows.push({
      provider: "reb_stock",
      release: releasePeriod,
      complex_id: id,
      address_sigungu: sigungu,
      units: parseNumeric(r["세대수"] !== undefined ? r["세대수"] : r.units),
    });
  }

  assertNoDuplicateCodes(ids, "reb_stock");

  return {
    provider: "reb_stock",
    release: releasePeriod,
    rows,
    quarantined,
    status: rows.length > 0 ? "normalized" : "blocked_coverage",
  };
}

// ---------------------------------------------------------------------------
// Supply normalization (입주예정 by month/address)
// ---------------------------------------------------------------------------

/**
 * Normalize reb_supply seed rows.
 * @param {Array<object>} parsedRows - each: { 입주예정월, 주소, 세대수 }
 * Missing horizon stays null.
 */
function normalizeSupply(parsedRows, releasePeriod) {
  if (!Array.isArray(parsedRows)) {
    throw new Error("supply: parsedRows must be an array");
  }
  const rows = [];
  const quarantined = [];

  for (let i = 0; i < parsedRows.length; i++) {
    const r = parsedRows[i];
    const month = typeof r["입주예정월"] === "string" ? r["입주예정월"].trim() : r.move_in_month;
    const address = typeof r["주소"] === "string" ? r["주소"].trim() : r.address;
    if (!address) {
      quarantined.push({ index: i, reason: "missing_address" });
      continue;
    }
    rows.push({
      provider: "reb_supply",
      release: releasePeriod,
      move_in_month: month || null,
      address,
      units: parseNumeric(r["세대수"] !== undefined ? r["세대수"] : r.units),
    });
  }

  return {
    provider: "reb_supply",
    release: releasePeriod,
    rows,
    quarantined,
    status: rows.length > 0 ? "normalized" : "blocked_coverage",
  };
}

// ---------------------------------------------------------------------------
// Dispatch
// ---------------------------------------------------------------------------

const NORMALIZERS = {
  mois_jumin_statmonth_csv: normalizeMOIS,
  reb_rone_public_table: normalizeRONE,
  reb_stock: normalizeStock,
  reb_supply: normalizeSupply,
};

/**
 * Normalize raw parsed rows for a provider.
 * @param {string} providerId
 * @param {Array} parsedRows
 * @param {string} period
 */
function normalize(providerId, parsedRows, period) {
  const fn = NORMALIZERS[providerId];
  if (!fn) {
    return {
      provider: providerId,
      period,
      rows: [],
      quarantined: [],
      status: "blocked_schema",
      reason: "no_normalizer_for_provider",
    };
  }
  return fn(parsedRows, period);
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

module.exports = {
  isValidHouseholdCode,
  isValidLawdCode,
  isValidSigunguCode,
  parseNumeric,
  parseRatio,
  assertNoDuplicateCodes,
  normalizeMOIS,
  normalizeRONE,
  normalizeStock,
  normalizeSupply,
  normalize,
  NORMALIZERS,
};
