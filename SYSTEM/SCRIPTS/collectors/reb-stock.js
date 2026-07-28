"use strict";

/**
 * REB Stock Parser (parser_seed — zero network)
 *
 * Registry provider: reb_stock
 * Registry status: blocked_fixture
 * Source: data.go.kr file 15106861
 * Fixture policy: parser_seed (network_allowed: false)
 *
 * Parses the offline seed CSV fixture. Groups rows by exact address sigungu
 * (first two whitespace-delimited tokens of 주소) and sums 세대수 as
 * apartment stock 호. Identity column is 단지고유번호.
 *
 * Zero live requests until exact catalog→download fixture and redirect
 * rules are reviewed.
 */

const PROVIDER_ID = "reb_stock";
const REGISTRY_STATUS = "blocked_fixture";
const DATASET_ID = "15106861";
const UNIT = "호";
const IDENTITY_COLUMN = "단지고유번호";

const REQUIRED_COLUMNS = [
  "단지고유번호",
  "필지고유번호",
  "주소",
  "세대수",
];

/**
 * Extract sigungu key from a full Korean address string.
 * Address format: "서울특별시 종로구 청운동 1" → "서울특별시 종로구"
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
 * Returns an array of field strings.
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
      // Quoted field
      let value = "";
      i++; // skip opening quote
      while (i < len) {
        if (line[i] === '"') {
          if (i + 1 < len && line[i + 1] === '"') {
            value += '"';
            i += 2;
          } else {
            i++; // skip closing quote
            break;
          }
        } else {
          value += line[i];
          i++;
        }
      }
      fields.push(value);
      // skip comma after closing quote
      if (i < len && line[i] === ",") i++;
    } else {
      // Unquoted field
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
 * Parse the REB stock seed CSV text.
 *
 * @param {string} csvText - Raw CSV content (UTF-8, BOM stripped or present)
 * @returns {{ groups: Object<string, {sigungu: string, stock_ho: number, complex_ids: string[]}>, total_rows: number, errors: string[] }}
 */
function parseSeed(csvText) {
  const errors = [];
  const text = csvText.replace(/^\uFEFF/, "");
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);

  if (lines.length === 0) {
    return { groups: {}, total_rows: 0, errors: ["empty CSV"] };
  }

  const header = parseCsvLine(lines[0]);

  // Validate required columns exist
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

  const groups = {};
  const seenIds = new Set();
  let totalRows = 0;

  for (let i = 1; i < lines.length; i++) {
    const fields = parseCsvLine(lines[i]);
    const id = (fields[colIndex[IDENTITY_COLUMN]] || "").trim();
    const address = (fields[colIndex["주소"]] || "").trim();
    const rawHo = (fields[colIndex["세대수"]] || "").trim();

    if (!id) {
      errors.push(`row ${i + 1}: missing ${IDENTITY_COLUMN}`);
      continue;
    }
    if (seenIds.has(id)) {
      errors.push(`row ${i + 1}: duplicate ${IDENTITY_COLUMN} "${id}"`);
      continue;
    }
    seenIds.add(id);

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
      groups[sigungu] = { sigungu, stock_ho: 0, complex_ids: [] };
    }
    groups[sigungu].stock_ho += ho;
    groups[sigungu].complex_ids.push(id);
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
    identity_column: IDENTITY_COLUMN,
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
  IDENTITY_COLUMN,
  REQUIRED_COLUMNS,
  extractSigungu,
  parseCsvLine,
  parseSeed,
  adapterState,
  collect,
});
