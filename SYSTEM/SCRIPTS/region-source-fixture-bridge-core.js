"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const mois = require("./collectors/mois-households.js");
const geography = require("./region-geography-registry-core.js");
const ledger = require("./region-source-ledger-core.js");
const snapshot = require("./region-source-snapshot-core.js");

const PROVIDER_ID = "mois_jumin_statmonth_csv";
const SOURCE_DATASET_ID = PROVIDER_ID;
const METHODOLOGY_VERSION = "1.0.0";
const DEFAULT_FIXTURE_PATH = path.resolve(__dirname, "../AI/Skills/prodigy-review/tests/fixtures/region-intelligence/mois_jumin_statmonth_csv/2026-05-households.csv");
const DEFAULT_FIXTURE_SHA256 = "576bf4419ddebd24da4b1c917269ed298f03bd6c413213c8b3e93599462d415a";
const MEASURE_FIELDS = Object.freeze([
  ["households", "households", "세대"],
  ["total_population", "total_population", "명"],
  ["pop_per_household", "pop_per_household", "명/세대"],
  ["male_population", "male_population", "명"],
  ["female_population", "female_population", "명"],
  ["sex_ratio", "sex_ratio", "%"]
]);

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function sha256(bytes) {
  return crypto.createHash("sha256").update(bytes).digest("hex");
}

function validatePeriod(period) {
  if (typeof period !== "string" || !/^\d{4}-(0[1-9]|1[0-2])$/u.test(period)) throw new Error("MOIS period는 YYYY-MM이어야 합니다.");
  return period;
}

function validateTimes(input) {
  for (const key of ["published_at", "first_seen_at", "collected_at"]) {
    if (typeof input[key] !== "string") throw new Error(`${key}가 필요합니다.`);
  }
}

function collectionToken(value) {
  return value.replace(/[^0-9]/gu, "").slice(0, 14);
}

function fixtureRawPath(fixturePath, rawPath) {
  const result = rawPath || `raw/${path.basename(fixturePath)}`;
  if (!result.startsWith("raw/") || result.includes("..") || result.startsWith("/")) throw new Error("MOIS raw_path가 raw/ 경계를 벗어났습니다.");
  return result;
}

function measuresFor(row) {
  const measures = {};
  for (const [field, key, unit] of MEASURE_FIELDS) {
    if (typeof row?.[field] === "number" && Number.isFinite(row[field])) measures[key] = { value: row[field], unit };
  }
  return measures;
}

function buildMoisSnapshots(input) {
  if (!isObject(input) || !isObject(input.parsed) || !Array.isArray(input.parsed.rows)) throw new Error("MOIS parsed 결과가 필요합니다.");
  const period = validatePeriod(input.period);
  validateTimes(input);
  if (typeof input.raw_payload_hash !== "string" || !/^[a-f0-9]{64}$/u.test(input.raw_payload_hash)) throw new Error("MOIS raw_payload_hash가 올바르지 않습니다.");
  const rawPath = fixtureRawPath("fixture.csv", input.raw_path);
  if (input.parsed.period !== period) throw new Error("MOIS parsed period와 요청 period가 다릅니다.");
  const regions = input.geography_registry?.regions || geography.loadRegistry().regions;
  const rowsBySigungu = new Map(input.parsed.rows.map((row) => [String(row.household_code).slice(0, 5), row]));
  return regions.map((region) => {
    const measures = measuresFor(rowsBySigungu.get(region.sigungu_code));
    const missingnessCode = Object.keys(measures).length > 0 ? "none" : "not_available";
    const geographyIdentity = {
      level: region.geography_level,
      code_system: region.code_system,
      sido_code: region.sido_code,
      sigungu_code: region.sigungu_code,
      name_at_release: region.name_at_release,
      name_current: region.name_current,
      effective_from: region.effective_from,
      effective_to: region.effective_to,
      mapping_status: region.mapping_status
    };
    return snapshot.buildSnapshot({
      schema_version: 1,
      snapshot_id: `mois-${period}-${region.sigungu_code}-${input.raw_payload_hash.slice(0, 12)}-${collectionToken(input.collected_at)}`,
      provider_id: PROVIDER_ID,
      source_dataset_id: SOURCE_DATASET_ID,
      property_type: "all",
      geography: geographyIdentity,
      reference_period: period,
      coverage_level: "sigungu",
      missingness_code: missingnessCode,
      valid_time: `${period}-01`,
      published_at: input.published_at,
      first_seen_at: input.first_seen_at,
      collected_at: input.collected_at,
      revision_type: input.revision_type || "initial",
      methodology_version: METHODOLOGY_VERSION,
      raw_path: rawPath,
      raw_payload_hash: input.raw_payload_hash,
      measures
    });
  });
}

function loadMoisFixtureSnapshots(options = {}) {
  const fixturePath = path.resolve(options.fixture_path || DEFAULT_FIXTURE_PATH);
  if (!fs.existsSync(fixturePath)) throw new Error(`MOIS fixture를 찾을 수 없습니다: ${fixturePath}`);
  const bytes = fs.readFileSync(fixturePath);
  const actualHash = sha256(bytes);
  const expectedHash = options.expected_sha256 || (fixturePath === DEFAULT_FIXTURE_PATH ? DEFAULT_FIXTURE_SHA256 : "");
  if (!/^[a-f0-9]{64}$/u.test(expectedHash)) throw new Error("MOIS fixture expected_sha256가 필요합니다.");
  if (actualHash !== expectedHash) throw new Error(`MOIS fixture hash mismatch: expected ${expectedHash}, got ${actualHash}`);
  const period = validatePeriod(options.period);
  const parsed = mois.loadFixture(fixturePath, period, expectedHash);
  const snapshots = buildMoisSnapshots({
    parsed,
    raw_payload_hash: actualHash,
    raw_path: options.raw_path || `raw/${path.basename(fixturePath)}`,
    period,
    published_at: options.published_at,
    first_seen_at: options.first_seen_at,
    collected_at: options.collected_at,
    revision_type: options.revision_type,
    geography_registry: options.geography_registry
  });
  return { provider_id: PROVIDER_ID, fixture_path: fixturePath, raw_payload_hash: actualHash, parser_result: parsed, snapshots };
}

function appendMoisFixtureSnapshots(ledgerState, options = {}) {
  let nextLedger = ledgerState;
  const loaded = loadMoisFixtureSnapshots(options);
  for (const item of loaded.snapshots) nextLedger = ledger.appendSnapshot(nextLedger, item);
  return Object.assign({}, loaded, { ledger: nextLedger });
}

module.exports = Object.freeze({
  DEFAULT_FIXTURE_PATH,
  DEFAULT_FIXTURE_SHA256,
  METHODOLOGY_VERSION,
  PROVIDER_ID,
  SOURCE_DATASET_ID,
  appendMoisFixtureSnapshots,
  buildMoisSnapshots,
  loadMoisFixtureSnapshots,
  sha256
});
