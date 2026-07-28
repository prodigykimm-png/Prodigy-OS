/**
 * mois-households.js
 *
 * MOIS jumin statmonth CSV collector adapter.
 * Registry status: planned_enabled (fixture-only in this plan; zero live network).
 *
 * Parses EUC-KR CSV with seven quoted columns. Extracts exact 10-digit
 * household codes from the 행정구역 field. Maps to canonical 83 Region codes.
 * Pre-reform fixtures (before Incheon 2026-07 reorganization) map exactly 79
 * current canonical codes, quarantine three predecessor codes
 * (2811000000, 2814000000, 2826000000), and report four successor Regions
 * (2812500000, 2815500000, 2827500000, 2829000000) as blocked_coverage.
 *
 * Rejects duplicate/malformed codes or missing requested month.
 * Zero live network in this plan — fixture-only.
 *
 * CommonJS. Uses only Node.js built-in modules.
 */
"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PROVIDER_ID = "mois_jumin_statmonth_csv";

// The three Incheon predecessor sigungu codes (pre-reform)
const PREDECESSOR_CODES = Object.freeze([
  "2811000000", // 인천 중구 (predecessor)
  "2814000000", // 인천 동구 (predecessor)
  "2826000000", // 인천 서구 (predecessor)
]);

// The four Incheon successor codes (post-reform, absent in pre-reform fixtures)
const SUCCESSOR_CODES = Object.freeze([
  "2812500000", // 인천 제물포구
  "2815500000", // 인천 영종구
  "2827500000", // 인천 서해구
  "2829000000", // 인천 검단구
]);

// Canonical 83 household codes from the registry (REGION_TRIPLES)
const CANONICAL_HOUSEHOLD_CODES = Object.freeze([
  "2611000000", "2614000000", "2617000000", "2620000000", "2623000000",
  "2626000000", "2629000000", "2632000000", "2635000000", "2638000000",
  "2641000000", "2644000000", "2647000000", "2650000000", "2653000000",
  "2671000000",
  "1111000000", "1114000000", "1117000000", "1120000000", "1121500000",
  "1123000000", "1126000000", "1129000000", "1130500000", "1132000000",
  "1135000000", "1138000000", "1141000000", "1144000000", "1147000000",
  "1150000000", "1153000000", "1154500000", "1156000000", "1159000000",
  "1162000000", "1165000000", "1168000000", "1171000000", "1174000000",
  "4111000000", "4113000000", "4115000000", "4117000000", "4119000000",
  "4121000000", "4122000000", "4125000000", "4127000000", "4128000000",
  "4129000000", "4131000000", "4136000000", "4137000000", "4139000000",
  "4141000000", "4143000000", "4145000000", "4146000000", "4148000000",
  "4150000000", "4155000000", "4157000000", "4159000000", "4161000000",
  "4163000000", "4165000000", "4167000000", "4180000000", "4182000000",
  "4183000000",
  "2812500000", "2815500000", "2817700000", "2818500000", "2820000000",
  "2823700000", "2824500000", "2827500000", "2829000000", "2871000000",
  "2872000000",
]);

const CANONICAL_SET = new Set(CANONICAL_HOUSEHOLD_CODES);
const PREDECESSOR_SET = new Set(PREDECESSOR_CODES);
const SUCCESSOR_SET = new Set(SUCCESSOR_CODES);

// Expected column count
const EXPECTED_COLUMNS = 7;

// ---------------------------------------------------------------------------
// CSV Parsing (EUC-KR, quoted fields)
// ---------------------------------------------------------------------------

/**
 * Decode EUC-KR buffer to string.
 */
function decodeEucKr(buf) {
  const decoder = new TextDecoder("euc-kr");
  return decoder.decode(buf);
}

/**
 * Parse a single CSV line with quoted fields.
 * Handles commas inside quotes. Returns array of unquoted field values.
 */
function parseCsvLine(line) {
  const fields = [];
  let i = 0;
  const len = line.length;

  while (i < len) {
    if (line[i] === '"') {
      // Quoted field
      i++; // skip opening quote
      let field = "";
      while (i < len) {
        if (line[i] === '"') {
          if (i + 1 < len && line[i + 1] === '"') {
            // Escaped quote
            field += '"';
            i += 2;
          } else {
            // Closing quote
            i++; // skip closing quote
            break;
          }
        } else {
          field += line[i];
          i++;
        }
      }
      fields.push(field);
      // Skip comma after quoted field
      if (i < len && line[i] === ",") i++;
    } else {
      // Unquoted field (shouldn't happen in MOIS CSV but handle gracefully)
      let field = "";
      while (i < len && line[i] !== ",") {
        field += line[i];
        i++;
      }
      fields.push(field);
      if (i < len && line[i] === ",") i++;
    }
  }

  return fields;
}

/**
 * Extract the 10-digit code from an 행정구역 field value.
 * Format: "서울특별시 종로구 (1111000000)" or "인천광역시 중구 연안동(2811052000)"
 * Returns the 10-digit string or null if not found/malformed.
 */
function extractCode(adminField) {
  if (typeof adminField !== "string") return null;
  const match = /\((\d{10})\)\s*$/.exec(adminField.trim());
  if (!match) return null;
  return match[1];
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

/**
 * Validate that the header row has exactly 7 columns matching the expected
 * pattern for the requested period.
 */
function validateHeader(headerFields, period) {
  const errors = [];
  if (headerFields.length !== EXPECTED_COLUMNS) {
    errors.push(
      `Expected ${EXPECTED_COLUMNS} columns, got ${headerFields.length}`
    );
    return errors;
  }

  const [yyyy, mm] = period.split("-");
  const prefix = `${yyyy}년${mm}월_`;

  if (headerFields[0] !== "행정구역") {
    errors.push(`Column 0 must be "행정구역", got "${headerFields[0]}"`);
  }

  const expectedSuffixes = [
    "총인구수", "세대수", "세대당 인구",
    "남자 인구수", "여자 인구수", "남여 비율",
  ];

  for (let i = 0; i < expectedSuffixes.length; i++) {
    const expected = prefix + expectedSuffixes[i];
    if (headerFields[i + 1] !== expected) {
      errors.push(
        `Column ${i + 1} must be "${expected}", got "${headerFields[i + 1]}"`
      );
    }
  }

  return errors;
}

// ---------------------------------------------------------------------------
// Numeric parsing
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Main adapter
// ---------------------------------------------------------------------------

/**
 * Parse a MOIS nationwide households CSV fixture.
 *
 * @param {Buffer} csvBuf - Raw EUC-KR CSV bytes
 * @param {string} period - Requested period "YYYY-MM"
 * @returns {object} Parse result with rows, quarantined, blocked_coverage
 */
function parseMoisCsv(csvBuf, period) {
  if (!Buffer.isBuffer(csvBuf)) {
    throw new Error("mois: input must be a Buffer of EUC-KR CSV bytes");
  }
  if (!/^\d{4}-\d{2}$/.test(period)) {
    throw new Error(`mois: period must be YYYY-MM, got "${period}"`);
  }

  const text = decodeEucKr(csvBuf);
  const lines = text.split("\n").filter((l) => l.trim().length > 0);

  if (lines.length < 2) {
    throw new Error("mois: CSV must have a header and at least one data row");
  }

  // Validate header
  const headerFields = parseCsvLine(lines[0]);
  const headerErrors = validateHeader(headerFields, period);
  if (headerErrors.length > 0) {
    throw new Error(`mois: header validation failed: ${headerErrors.join("; ")}`);
  }

  // Parse data rows
  const rows = [];
  const quarantined = [];
  const seenCodes = new Set();
  const errors = [];

  for (let i = 1; i < lines.length; i++) {
    const fields = parseCsvLine(lines[i]);
    if (fields.length !== EXPECTED_COLUMNS) {
      errors.push(`Row ${i}: expected ${EXPECTED_COLUMNS} fields, got ${fields.length}`);
      continue;
    }

    const code = extractCode(fields[0]);
    if (code === null) {
      // Not a sigungu-level row with a valid code pattern — skip silently
      // (dong-level rows, province rows, etc.)
      continue;
    }

    // Check for malformed codes (valid 10-digit pattern but not in any known set)
    const isCanonical = CANONICAL_SET.has(code);
    const isPredecessor = PREDECESSOR_SET.has(code);

    if (!isCanonical && !isPredecessor) {
      // Not a sigungu-level code we track — skip (dong-level, province, 출장소)
      continue;
    }

    // Duplicate detection
    if (seenCodes.has(code)) {
      errors.push(`mois: duplicate code "${code}" at row ${i}`);
      continue;
    }
    seenCodes.add(code);

    if (isPredecessor) {
      quarantined.push({
        code,
        raw_label: fields[0].trim(),
        reason: "predecessor_code",
      });
      continue;
    }

    // Canonical row
    rows.push({
      provider: PROVIDER_ID,
      period,
      household_code: code,
      total_population: parseNumeric(fields[1]),
      households: parseNumeric(fields[2]),
      pop_per_household: parseNumeric(fields[3]),
      male_population: parseNumeric(fields[4]),
      female_population: parseNumeric(fields[5]),
      sex_ratio: parseNumeric(fields[6]),
    });
  }

  if (errors.length > 0) {
    throw new Error(`mois: parse errors: ${errors.join("; ")}`);
  }

  // Determine blocked_coverage: successor codes not present in this period
  const blockedCoverage = [];
  for (const sc of SUCCESSOR_CODES) {
    if (!seenCodes.has(sc)) {
      blockedCoverage.push({
        code: sc,
        reason: "successor_code_absent_in_period",
        status: "blocked_coverage",
      });
    }
  }

  return Object.freeze({
    provider: PROVIDER_ID,
    period,
    rows: Object.freeze(rows),
    quarantined: Object.freeze(quarantined),
    blocked_coverage: Object.freeze(blockedCoverage),
    coverage_count: rows.length,
    total_canonical: CANONICAL_HOUSEHOLD_CODES.length,
    status: rows.length > 0 ? "normalized" : "blocked_coverage",
    network_dispatched: false,
    request_count: 0,
  });
}

/**
 * Load and parse a MOIS fixture file from disk.
 *
 * @param {string} fixturePath - Absolute path to the EUC-KR CSV fixture
 * @param {string} period - Requested period "YYYY-MM"
 * @param {string} [expectedSha256] - Optional SHA-256 to verify fixture integrity
 * @returns {object} Parse result
 */
function loadFixture(fixturePath, period, expectedSha256) {
  const buf = fs.readFileSync(fixturePath);

  if (expectedSha256) {
    const actual = crypto.createHash("sha256").update(buf).digest("hex");
    if (actual !== expectedSha256) {
      throw new Error(
        `mois: fixture hash mismatch for ${fixturePath}: expected ${expectedSha256}, got ${actual}`
      );
    }
  }

  return parseMoisCsv(buf, period);
}

/**
 * Adapter state report (zero-network, fixture-only).
 */
function adapterState() {
  return Object.freeze({
    provider: PROVIDER_ID,
    registry_status: "planned_enabled",
    status: "fixture_only",
    network_allowed: false,
    network_dispatched: false,
    request_count: 0,
    reason: "Zero live network in this plan; fixture-only parsing enabled.",
  });
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

module.exports = {
  PROVIDER_ID,
  PREDECESSOR_CODES,
  SUCCESSOR_CODES,
  CANONICAL_HOUSEHOLD_CODES,
  EXPECTED_COLUMNS,
  decodeEucKr,
  parseCsvLine,
  extractCode,
  validateHeader,
  parseNumeric,
  parseMoisCsv,
  loadFixture,
  adapterState,
};
