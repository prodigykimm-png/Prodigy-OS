/**
 * rone-market.js
 *
 * R-ONE public table parser adapter.
 * Registry status: blocked_coverage (parser regression only; zero network dispatch).
 *
 * Parses three fixture types for 부산 사하구:
 *   - price_current: price index
 *   - volume_window: transaction volume (multi-month)
 *   - jeonse_current: jeonse ratio
 *
 * These fixtures validate parsing only and do NOT remove the blocked_coverage
 * status. No new dispatch until Seoul/Gyeonggi/Incheon/Busan exact rows and
 * literal hashes are added by reviewed amendment.
 *
 * CommonJS. Uses only Node.js built-in modules.
 */
"use strict";

const fs = require("fs");
const crypto = require("crypto");

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PROVIDER_ID = "reb_rone_public_table";
const REGISTRY_STATUS = "blocked_coverage";

// Table IDs from the plan
const TABLE_IDS = Object.freeze({
  price: "A_2024_00554",
  volume: "A_2024_00045",
  jeonse: "A_2024_00073",
});

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
// R-ONE JSON response parsing
// ---------------------------------------------------------------------------

/**
 * Validate the R-ONE response envelope.
 * Expected shape: { DATA: [...], TOTAL: N, ETC: null, MESSAGE: null, RESULT: { CODE: 0, MESSAGE: null } }
 */
function validateEnvelope(json) {
  const errors = [];
  if (!json || typeof json !== "object") {
    errors.push("response must be a JSON object");
    return errors;
  }
  if (!Array.isArray(json.DATA)) {
    errors.push("response must have a DATA array");
  }
  if (typeof json.TOTAL !== "number") {
    errors.push("response must have a numeric TOTAL");
  }
  if (!json.RESULT || typeof json.RESULT !== "object") {
    errors.push("response must have a RESULT object");
  } else if (json.RESULT.CODE !== 0) {
    errors.push(`RESULT.CODE must be 0, got ${json.RESULT.CODE}`);
  }
  return errors;
}

/**
 * Extract month key from a COL_ column name.
 * Format: COL_YYYYMMDDHHMMSSOD -> YYYY-MM
 */
function extractMonthFromColKey(colKey) {
  const match = /^COL_(\d{4})(\d{2})\d+OD$/.exec(colKey);
  if (!match) return null;
  return `${match[1]}-${match[2]}`;
}

/**
 * Parse a price index fixture (single value).
 * @param {object} json - Parsed JSON response
 * @returns {object} Parsed result
 */
function parsePriceFixture(json) {
  const errors = validateEnvelope(json);
  if (errors.length > 0) {
    throw new Error(`rone price: ${errors.join("; ")}`);
  }

  const rows = [];
  for (const item of json.DATA) {
    const region = [item.CATE1, item.CATE2, item.CATE3].filter(Boolean).join(" ");
    // Find the COL_ value
    let value = null;
    let month = null;
    for (const key of Object.keys(item)) {
      if (key.startsWith("COL_")) {
        value = parseNumeric(item[key]);
        month = extractMonthFromColKey(key);
        break;
      }
    }
    rows.push({
      provider: PROVIDER_ID,
      table_id: TABLE_IDS.price,
      measure: "price_index",
      region_label: region,
      month,
      value,
      unit: "index",
    });
  }

  return Object.freeze({
    provider: PROVIDER_ID,
    table_id: TABLE_IDS.price,
    measure: "price_index",
    rows: Object.freeze(rows),
    status: "parsed",
    network_dispatched: false,
    request_count: 0,
  });
}

/**
 * Parse a volume fixture (multi-month window).
 * @param {object} json - Parsed JSON response
 * @returns {object} Parsed result
 */
function parseVolumeFixture(json) {
  const errors = validateEnvelope(json);
  if (errors.length > 0) {
    throw new Error(`rone volume: ${errors.join("; ")}`);
  }

  const rows = [];
  for (const item of json.DATA) {
    const region = [item.CATE1, item.CATE2].filter(Boolean).join(" ");
    // Multiple COL_ columns for different months
    for (const key of Object.keys(item)) {
      if (key.startsWith("COL_")) {
        const month = extractMonthFromColKey(key);
        const value = parseNumeric(item[key]);
        rows.push({
          provider: PROVIDER_ID,
          table_id: TABLE_IDS.volume,
          measure: "transaction_volume",
          region_label: region,
          month,
          value,
          unit: "건",
        });
      }
    }
  }

  return Object.freeze({
    provider: PROVIDER_ID,
    table_id: TABLE_IDS.volume,
    measure: "transaction_volume",
    rows: Object.freeze(rows),
    status: "parsed",
    network_dispatched: false,
    request_count: 0,
  });
}

/**
 * Parse a jeonse ratio fixture (single value).
 * @param {object} json - Parsed JSON response
 * @returns {object} Parsed result
 */
function parseJeonseFixture(json) {
  const errors = validateEnvelope(json);
  if (errors.length > 0) {
    throw new Error(`rone jeonse: ${errors.join("; ")}`);
  }

  const rows = [];
  for (const item of json.DATA) {
    const region = [item.CATE1, item.CATE2, item.CATE3].filter(Boolean).join(" ");
    let value = null;
    let month = null;
    for (const key of Object.keys(item)) {
      if (key.startsWith("COL_")) {
        value = parseNumeric(item[key]);
        month = extractMonthFromColKey(key);
        break;
      }
    }
    rows.push({
      provider: PROVIDER_ID,
      table_id: TABLE_IDS.jeonse,
      measure: "jeonse_ratio",
      region_label: region,
      month,
      value,
      unit: "%",
    });
  }

  return Object.freeze({
    provider: PROVIDER_ID,
    table_id: TABLE_IDS.jeonse,
    measure: "jeonse_ratio",
    rows: Object.freeze(rows),
    status: "parsed",
    network_dispatched: false,
    request_count: 0,
  });
}

/**
 * Load and parse a fixture file from disk.
 * @param {string} fixturePath - Absolute path to JSON fixture
 * @param {"price"|"volume"|"jeonse"} kind - Fixture type
 * @param {string} [expectedSha256] - Optional SHA-256 integrity check
 * @returns {object} Parsed result
 */
function loadFixture(fixturePath, kind, expectedSha256) {
  const buf = fs.readFileSync(fixturePath);

  if (expectedSha256) {
    const actual = crypto.createHash("sha256").update(buf).digest("hex");
    if (actual !== expectedSha256) {
      throw new Error(
        `rone: fixture hash mismatch for ${fixturePath}: expected ${expectedSha256}, got ${actual}`
      );
    }
  }

  const json = JSON.parse(buf.toString("utf8"));

  switch (kind) {
    case "price":
      return parsePriceFixture(json);
    case "volume":
      return parseVolumeFixture(json);
    case "jeonse":
      return parseJeonseFixture(json);
    default:
      throw new Error(`rone: unknown fixture kind "${kind}"`);
  }
}

/**
 * Adapter state report (zero-network, blocked_coverage).
 */
function adapterState() {
  return Object.freeze({
    provider: PROVIDER_ID,
    registry_status: REGISTRY_STATUS,
    status: "blocked_coverage",
    network_allowed: false,
    network_dispatched: false,
    request_count: 0,
    reason:
      "blocked_coverage: Seoul/Gyeonggi/Incheon/Busan exact rows and literal hashes not yet added by reviewed amendment. 부산 사하구 seed fixtures are parser regression only.",
  });
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

module.exports = {
  PROVIDER_ID,
  REGISTRY_STATUS,
  TABLE_IDS,
  parseNumeric,
  validateEnvelope,
  extractMonthFromColKey,
  parsePriceFixture,
  parseVolumeFixture,
  parseJeonseFixture,
  loadFixture,
  adapterState,
};
