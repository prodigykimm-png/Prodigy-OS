"use strict";

const crypto = require("node:crypto");

const SQM_PER_PYEONG = 3.305785;

function clean(value) { return String(value ?? "").trim(); }
function number(value) {
  const match = clean(value).replaceAll(",", "").match(/-?\d+(?:\.\d+)?/);
  return match ? Number(match[0]) : null;
}
function round(value, digits = 6) { return Number(Number(value).toFixed(digits)); }
function sha256(value) { return crypto.createHash("sha256").update(value).digest("hex"); }
function csvRows(text) {
  const rows = []; let row = [], field = "", quoted = false;
  const input = String(text).replace(/^\uFEFF/, "");
  for (let i = 0; i < input.length; i += 1) {
    const char = input[i];
    if (quoted && char === '"' && input[i + 1] === '"') { field += '"'; i += 1; }
    else if (char === '"') quoted = !quoted;
    else if (!quoted && char === ",") { row.push(field); field = ""; }
    else if (!quoted && char === "\n") { row.push(field.replace(/\r$/, "")); rows.push(row); row = []; field = ""; }
    else field += char;
  }
  if (field || row.length) { row.push(field.replace(/\r$/, "")); rows.push(row); }
  return rows.filter((values) => values.some((value) => clean(value)));
}
function parseLegalDong(address) {
  const match = clean(address).match(/\s([^\s,]+(?:동\d*가|동|읍|면))\s/);
  return match ? match[1] : null;
}
function buildingKey(address) {
  const parts = clean(address).split(",").map(clean);
  const parcel = parts[0];
  const label = (parts[1] || "").replace(/\s+\d+층.*$/, "").replace(/\s+[가-힣A-Za-z]?\d+호.*$/, "").trim();
  return `${parcel}|${label}`;
}
function parseAuctCsv(text, options = {}) {
  const rows = csvRows(text); const headers = rows.shift().map(clean);
  const required = ["물건종류", "소재지", "건물면적", "낙찰가", "매각기일"];
  for (const key of required) if (!headers.includes(key)) throw new Error(`AUCT CSV 필수 열이 없습니다: ${key}`);
  return rows.map((values, index) => {
    const data = Object.fromEntries(headers.map((header, i) => [header, clean(values[i])]));
    const area = number(data.건물면적), price = number(data.낙찰가), date = data.매각기일.replaceAll(".", "-");
    if (!(area > 0) || !(price > 0) || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !data.소재지) throw new Error(`AUCT CSV ${index + 2}행이 올바르지 않습니다.`);
    const addressParts = data.소재지.split(",");
    const parcelAddress = clean(addressParts[0]);
    const recordIdentity = [data.물건종류, data.소재지, area, price, date].join("|");
    return Object.freeze({
      schema_version: "auction-key-record.v1", record_id: sha256(recordIdentity), property_type: data.물건종류,
      address: data.소재지, parcel_address: parcelAddress, legal_dong: parseLegalDong(parcelAddress), building_key: buildingKey(data.소재지),
      land_right_area_sqm: number(data.대지권), area_sqm: area, price_won: price, auction_date: date,
      won_per_pyeong: round(price / (area / SQM_PER_PYEONG), 0), source: "AUCT CSV", source_file: options.sourceFile || null
    });
  });
}
function eligibility(record) {
  if (!record || !(record.area_sqm > 0) || !(record.price_won > 0)) return { eligible: false, reason: "invalid_required_value" };
  if (record.property_type !== "오피스텔") return { eligible: false, reason: "unsupported_property_type" };
  if (record.won_per_pyeong < 1_000_000 || record.won_per_pyeong > 100_000_000) return { eligible: false, reason: "suspicious_unit_price" };
  if (!record.legal_dong) return { eligible: false, reason: "missing_legal_dong" };
  return { eligible: true, reason: null };
}
function quantile(values, q) {
  const sorted = [...values].sort((a, b) => a - b); if (!sorted.length) return null;
  const position = (sorted.length - 1) * q, lower = Math.floor(position), upper = Math.ceil(position);
  return round(sorted[lower] + (sorted[upper] - sorted[lower]) * (position - lower), 0);
}
function parseRegion(address) {
  const parts = clean(address).split(/\s+/);
  return { sido: parts[0] || null, sigungu: parts[1] || null };
}
function snapshotHash(snapshot) {
  const canonical = JSON.stringify({ schema_version: snapshot.schema_version, generated_at: snapshot.generated_at, groups: snapshot.groups, districts: snapshot.districts });
  return sha256(canonical);
}
function groupRecords(records, keyFor) {
  const grouped = new Map();
  for (const record of records) {
    const key = keyFor(record);
    if (!grouped.has(key)) grouped.set(key, []); grouped.get(key).push(record);
  }
  return grouped;
}
function summarizeGroups(grouped, options) {
  const groups = {};
  for (const [key, cases] of [...grouped.entries()].sort()) {
    const buildings = new Map();
    for (const record of cases) { if (!buildings.has(record.building_key)) buildings.set(record.building_key, []); buildings.get(record.building_key).push(record.won_per_pyeong); }
    const buildingMedians = [...buildings.values()].map((values) => quantile(values, 0.5));
    const dates = cases.map((record) => record.auction_date).sort();
    groups[key] = Object.freeze({
      key_value_won_per_pyeong: quantile(buildingMedians, 0.5), q1_won_per_pyeong: quantile(buildingMedians, 0.25),
      q3_won_per_pyeong: quantile(buildingMedians, 0.75), case_count: cases.length, building_count: buildings.size,
      confidence: cases.length >= 5 && buildings.size >= 3 ? "usable" : buildings.size < 3 ? "sample_concentrated" : "sample_insufficient",
      period_start: dates[0], period_end: dates.at(-1), source: options.source || "AUCT CSV"
    });
  }
  return groups;
}
function buildKeyValueSnapshot(records, options = {}) {
  const eligible = records.filter((record) => eligibility(record).eligible);
  const regionFor = (record) => ({
    sido: record.region_sido || parseRegion(record.parcel_address).sido,
    sigungu: record.region_sigungu || parseRegion(record.parcel_address).sigungu
  });
  const groups = summarizeGroups(groupRecords(eligible, (record) => {
    const region = regionFor(record);
    return [region.sido, region.sigungu, record.legal_dong, record.property_type].join("|");
  }), options);
  const districts = summarizeGroups(groupRecords(eligible, (record) => {
    const region = regionFor(record);
    return [region.sido, region.sigungu, record.property_type].join("|");
  }), options);
  const snapshot = { schema_version: "auction-key-value-snapshot.v1", generated_at: options.asOf || new Date().toISOString(), groups, districts };
  return Object.freeze({ ...snapshot, content_hash: snapshotHash(snapshot) });
}
function comparePrice(priceWon, areaSqm, keyValue) {
  if (!(priceWon > 0) || !(areaSqm > 0) || !(keyValue > 0)) return null;
  const unit = round(priceWon / (areaSqm / SQM_PER_PYEONG), 0), ratio = round(unit / keyValue, 4);
  return Object.freeze({ won_per_pyeong: unit, ratio, position: ratio < 0.9 ? "키값 하단" : ratio <= 1.1 ? "키값 근접" : "키값 상단" });
}

module.exports = Object.freeze({ SQM_PER_PYEONG, buildKeyValueSnapshot, comparePrice, eligibility, parseAuctCsv, parseLegalDong, quantile, sha256, snapshotHash });
