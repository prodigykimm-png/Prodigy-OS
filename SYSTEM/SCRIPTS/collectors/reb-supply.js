"use strict";

/**
 * REB Supply Parser (parser_seed — zero network)
 *
 * Registry provider: reb_supply
 * Registry status: blocked_fixture
 * Source: data.go.kr file 15111714
 * Fixture policy: parser_seed (network_allowed: false)
 *
 * Parses the offline seed CSV fixture. Uses 입주예정월, 주소, 세대수.
 * Groups by exact address sigungu and computes cumulative 12/24/36/48/60
 * month horizon 세대 counts from a reference month. Missing horizon stays null.
 *
 * Zero live requests until exact catalog→download fixture and redirect
 * rules are reviewed.
 */

const PROVIDER_ID = "reb_supply";
const REGISTRY_STATUS = "blocked_fixture";
const DATASET_ID = "15111714";
const UNIT = "세대";

const REQUIRED_COLUMNS = ["입주예정월", "주소", "세대수"];
const HORIZONS = [12, 24, 36, 48, 60];

/**
 * Extract sigungu key from a full Korean address string.
 * Address format: "경기도 고양시 덕양구 용두동 827-0" → "경기도 고양시"
 * Returns null if fewer than 2 tokens.
 */
function extractSigungu(address) {
  if (typeof address !== "string") return null;
  const trimmed = address.trim();
  if (!trimmed) return null;
  const tokens = trimmed.split(/\s+/);
  if (tokens.length < 2) return null;
  return tokens[0] + " " + tokens[1];
}

/**
 * Parse a minimal CSV line respecting double-quoted fields.
 */
function parseCsvLine(line) {
  const fields = [];
  let i = 0;
  const len = line.length;
  while (i <= len) {
    if (i === len) {
      fields.push("");
      break;
    }
    if (line[i] === '"') {
      let value = "";
      i++;
      while (i < len) {
        if (line[i] === '"') {
          if (i + 1 < len && line[i + 1] === '"') {
            value += '"';
            i += 2;
          } else {
            i++;
            break;
          }
        } else {
          value += line[i];
          i++;
        }
      }
      fields.push(value);
      if (i < len && line[i] === ",") i++;
    } else {
      let end = line.indexOf(",", i);
      if (end === -1) {
        fields.push(line.slice(i));
        break;
      } else {
        fields.push(line.slice(i, end));
        i = end + 1;
      }
    }
  }
  return fields;
}

/**
 * Compute months between two YYYY-MM strings.
 * Returns positive integer if `to` is after `from`, 0 if same, negative if before.
 */
function monthDiff(from, to) {
  const [fy, fm] = from.split("-").map(Number);
  const [ty, tm] = to.split("-").map(Number);
  return (ty - fy) * 12 + (tm - fm);
}

/**
 * Parse the REB supply seed CSV text.
 *
 * @param {string} csvText - Raw CSV content (UTF-8)
 * @param {string} referenceMonth - YYYY-MM reference point for horizon calculation
 * @returns {{ groups: Object, total_rows: number, errors: string[] }}
 */
function parseSeed(csvText, referenceMonth) {
  const errors = [];
  const text = csvText.replace(/^\uFEFF/, "");
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);

  if (lines.length === 0) {
    return { groups: {}, total_rows: 0, errors: ["empty CSV"] };
  }

  const header = parseCsvLine(lines[0]);
  const colIndex = {};
  for (const col of REQUIRED_COLUMNS) {
    const idx = header.indexOf(col);
    if (idx === -1) {
      errors.push(`missing required column: ${col}`);
    } else {
      colIndex[col] = idx;
    }
  }

  if (errors.length > 0) {
    return { groups: {}, total_rows: 0, errors };
  }

  if (!referenceMonth || !/^\d{4}-\d{2}$/.test(referenceMonth)) {
    errors.push("referenceMonth must be YYYY-MM format");
    return { groups: {}, total_rows: 0, errors };
  }

  const groups = {};
  let totalRows = 0;

  for (let i = 1; i < lines.length; i++) {
    const fields = parseCsvLine(lines[i]);
    const month = (fields[colIndex["입주예정월"]] || "").trim();
    const address = (fields[colIndex["주소"]] || "").trim();
    const rawHo = (fields[colIndex["세대수"]] || "").trim();

    if (!month || !/^\d{4}-\d{2}$/.test(month)) {
      errors.push(`row ${i + 1}: invalid 입주예정월 "${month}"`);
      continue;
    }

    const sigungu = extractSigungu(address);
    if (!sigungu) {
      errors.push(`row ${i + 1}: cannot extract sigungu from address "${address}"`);
      continue;
    }

    const ho = parseInt(rawHo, 10);
    if (!Number.isFinite(ho) || ho < 0) {
      errors.push(`row ${i + 1}: invalid 세대수 "${rawHo}"`);
      continue;
    }

    totalRows++;

    if (!groups[sigungu]) {
      groups[sigungu] = { sigungu, rows: [], coverage: {} };
    }
    groups[sigungu].rows.push({ month, ho });
  }

  // Compute cumulative horizons per group
  for (const key of Object.keys(groups)) {
    const g = groups[key];
    for (const horizon of HORIZONS) {
      let sum = 0;
      let hasData = false;
      for (const row of g.rows) {
        const diff = monthDiff(referenceMonth, row.month);
        if (diff >= 0 && diff <= horizon) {
          sum += row.ho;
          hasData = true;
        }
      }
      // Missing horizon stays null — if no rows fall within the window, null
      g.coverage[`${horizon}m`] = hasData ? sum : null;
    }
    // Remove raw rows from output to keep it clean
    delete g.rows;
  }

  return { groups, total_rows: totalRows, errors };
}

/**
 * Adapter state — always blocked_fixture, zero network.
 */
function adapterState() {
  return Object.freeze({
    provider: PROVIDER_ID,
    registry_status: REGISTRY_STATUS,
    dataset_id: DATASET_ID,
    status: "blocked_fixture",
    reason: "blocked_fixture: exact download endpoint/redirect contract not frozen",
    network_allowed: false,
    network_dispatched: false,
    request_count: 0,
    fixture_policy: "parser_seed",
    unit: UNIT,
    horizons: HORIZONS,
  });
}

/**
 * Attempt to collect. Always returns blocked state — zero network.
 */
function collect() {
  const state = adapterState();
  return Object.freeze({
    ...state,
    collected_at: null,
    error: "seed fixture는 parser 전용입니다. 네트워크 요청을 보내지 않았습니다.",
  });
}

module.exports = Object.freeze({
  PROVIDER_ID,
  REGISTRY_STATUS,
  DATASET_ID,
  UNIT,
  REQUIRED_COLUMNS,
  HORIZONS,
  extractSigungu,
  parseCsvLine,
  monthDiff,
  parseSeed,
  adapterState,
  collect,
});
