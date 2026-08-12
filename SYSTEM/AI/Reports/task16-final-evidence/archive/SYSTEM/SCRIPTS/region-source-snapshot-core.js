"use strict";

const SNAPSHOT_KEYS = [
  "schema_version", "snapshot_id", "provider_id", "source_dataset_id", "property_type", "geography",
  "reference_period", "coverage_level", "missingness_code", "valid_time", "published_at", "first_seen_at",
  "collected_at", "revision_type", "methodology_version", "raw_path", "raw_payload_hash", "measures"
];
const GEOGRAPHY_KEYS = [
  "level", "code_system", "sido_code", "sigungu_code", "name_at_release", "name_current",
  "effective_from", "effective_to", "mapping_status"
];
const COVERAGE_LEVELS = new Set(["national", "sido", "sigungu", "eup_myeon_dong", "life_zone", "case", "unknown"]);
const MISSINGNESS_CODES = new Set(["none", "not_published", "not_applicable", "sample_suppressed", "not_available", "geo_aggregated", "revised_pending"]);
const REVISION_TYPES = new Set(["initial", "correction", "cancellation", "republication"]);

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function hasExactKeys(value, keys) {
  return isObject(value) && Object.keys(value).sort().join("\u0000") === [...keys].sort().join("\u0000");
}

function isDate(value) {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/u.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`));
}

function isTimestamp(value) {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(value) && !Number.isNaN(Date.parse(value));
}

function isDateOrTimestamp(value) {
  return isDate(value) || isTimestamp(value);
}

function validateGeography(geography, coverageLevel) {
  if (!hasExactKeys(geography, GEOGRAPHY_KEYS)) throw new Error("geography keys are not an exact contract");
  if (!COVERAGE_LEVELS.has(geography.level) || geography.level !== coverageLevel) throw new Error("coverage_level and geography.level must match");
  if (typeof geography.code_system !== "string" || geography.code_system.length === 0) throw new Error("geography code_system is required");
  if (geography.sido_code !== null && (typeof geography.sido_code !== "string" || !/^\d{2}$/u.test(geography.sido_code))) throw new Error("invalid geography sido_code");
  if (geography.sigungu_code !== null && (typeof geography.sigungu_code !== "string" || !/^\d{5}$/u.test(geography.sigungu_code))) throw new Error("invalid geography sigungu_code");
  if (geography.sigungu_code !== null && geography.sido_code !== null && !geography.sigungu_code.startsWith(geography.sido_code)) throw new Error("sigungu_code does not belong to sido_code");
  if (coverageLevel === "national" && (geography.sido_code !== null || geography.sigungu_code !== null)) throw new Error("national geography cannot carry a local code");
  if (["sigungu", "eup_myeon_dong", "case"].includes(coverageLevel) && (geography.sido_code === null || geography.sigungu_code === null)) throw new Error("case or sigungu geography needs both codes");
  if (typeof geography.name_at_release !== "string" || geography.name_at_release.trim() === "") throw new Error("name_at_release is required");
  if (typeof geography.name_current !== "string" || geography.name_current.trim() === "") throw new Error("name_current is required");
  if (geography.effective_from !== null && !isDate(geography.effective_from)) throw new Error("invalid effective_from");
  if (geography.effective_to !== null && !isDate(geography.effective_to)) throw new Error("invalid effective_to");
  if (geography.effective_from && geography.effective_to && geography.effective_from > geography.effective_to) throw new Error("effective date range is reversed");
  if (!["effective_date_pending", "verified", "retired"].includes(geography.mapping_status)) throw new Error("invalid mapping_status");
}

function validateMeasures(measures, missingnessCode) {
  if (!isObject(measures)) throw new Error("measures must be an object");
  const entries = Object.entries(measures);
  if (missingnessCode === "none" && entries.length === 0) throw new Error("missingness none requires at least one measure");
  for (const [key, measure] of entries) {
    if (!/^[a-z][a-z0-9_]{1,63}$/u.test(key) || !isObject(measure) || !Object.hasOwn(measure, "value") || !Object.hasOwn(measure, "unit") || Object.keys(measure).length !== 2) throw new Error(`invalid measure: ${key}`);
    if (typeof measure.unit !== "string" || measure.unit.trim() === "") throw new Error(`measure unit is required: ${key}`);
    if (measure.value !== null && (typeof measure.value !== "number" || !Number.isFinite(measure.value))) throw new Error(`measure value must be finite: ${key}`);
    if (missingnessCode === "none" && measure.value === null) throw new Error(`missingness none cannot contain null measure: ${key}`);
    if (missingnessCode !== "none" && measure.value !== null) throw new Error(`missingness ${missingnessCode} cannot contain a numeric measure: ${key}`);
  }
}

function validateSnapshot(input) {
  if (!hasExactKeys(input, SNAPSHOT_KEYS)) throw new Error("snapshot keys are not an exact contract");
  if (input.schema_version !== 1) throw new Error("snapshot schema_version must be 1");
  if (typeof input.snapshot_id !== "string" || !/^[a-z0-9][a-z0-9._-]{3,127}$/u.test(input.snapshot_id)) throw new Error("invalid snapshot_id");
  if (typeof input.provider_id !== "string" || !/^[a-z0-9][a-z0-9_-]{2,63}$/u.test(input.provider_id)) throw new Error("invalid provider_id");
  if (typeof input.source_dataset_id !== "string" || input.source_dataset_id.trim() === "") throw new Error("source_dataset_id is required");
  if (typeof input.property_type !== "string" || !/^[a-z][a-z0-9_]{1,63}$/u.test(input.property_type)) throw new Error("invalid property_type");
  if (!/^\d{4}-(0[1-9]|1[0-2])$/u.test(input.reference_period)) throw new Error("invalid reference_period");
  if (!COVERAGE_LEVELS.has(input.coverage_level)) throw new Error("invalid coverage_level");
  if (!MISSINGNESS_CODES.has(input.missingness_code)) throw new Error("invalid missingness_code");
  if (!isDateOrTimestamp(input.valid_time)) throw new Error("invalid valid_time");
  if (!isTimestamp(input.published_at) || !isTimestamp(input.first_seen_at) || !isTimestamp(input.collected_at)) throw new Error("all provenance timestamps must be UTC milliseconds");
  if (Date.parse(input.collected_at) < Date.parse(input.first_seen_at)) throw new Error("collected_at cannot precede first_seen_at");
  if (!REVISION_TYPES.has(input.revision_type)) throw new Error("invalid revision_type");
  if (typeof input.methodology_version !== "string" || input.methodology_version.trim() === "") throw new Error("methodology_version is required");
  if (typeof input.raw_path !== "string" || !input.raw_path.startsWith("raw/") || input.raw_path.includes("..")) throw new Error("raw_path must stay below raw/");
  if (typeof input.raw_payload_hash !== "string" || !/^[a-f0-9]{64}$/u.test(input.raw_payload_hash)) throw new Error("raw_payload_hash must be lowercase SHA-256");
  validateGeography(input.geography, input.coverage_level);
  validateMeasures(input.measures, input.missingness_code);
  return true;
}

function buildSnapshot(input) {
  const snapshot = clone(input);
  validateSnapshot(snapshot);
  return snapshot;
}

function isNoData(snapshot) {
  return snapshot.missingness_code !== "none" || Object.keys(snapshot.measures).length === 0;
}

function projectionKey(snapshot) {
  const geographyCode = snapshot.geography.sigungu_code || snapshot.geography.sido_code || "national";
  return `${snapshot.source_dataset_id}|${geographyCode}|${snapshot.property_type}|${snapshot.reference_period}`;
}

module.exports = { buildSnapshot, isNoData, projectionKey, validateSnapshot };
