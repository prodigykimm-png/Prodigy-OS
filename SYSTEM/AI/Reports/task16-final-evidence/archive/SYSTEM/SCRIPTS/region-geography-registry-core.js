"use strict";

const fs = require("node:fs");
const path = require("node:path");

const REGISTRY_PATH = path.join(__dirname, "region-geography-registry.json");
const EXPECTED_SIDO_COUNTS = { 서울특별시: 25, 부산광역시: 16 };
const MAPPING_STATUSES = new Set(["effective_date_pending", "verified", "retired"]);
const REGISTRY_KEYS = ["$schema", "schema_version", "registry_id", "code_system", "as_of", "regions"];
const GROUP_KEYS = ["sido", "sido_code", "effective_from", "effective_to", "mapping_status", "sigungu"];
const SIGUNGU_KEYS = ["name", "code"];

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isDateOrNull(value) {
  return value === null || (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/u.test(value));
}

function hasExactKeys(value, keys) {
  return isObject(value) && Object.keys(value).sort().join("\u0000") === [...keys].sort().join("\u0000");
}

function validateRegistry(registry) {
  const errors = [];
  if (!isObject(registry)) return ["geography registry must be an object"];
  if (!hasExactKeys(registry, REGISTRY_KEYS)) errors.push("geography registry contains unknown or missing keys");
  if (registry.schema_version !== 1) errors.push("schema_version must be 1");
  if (registry.registry_id !== "seoul-busan-sigungu") errors.push("unexpected registry_id");
  if (registry.code_system !== "mois_sigungu") errors.push("code_system must be mois_sigungu");
  if (typeof registry.as_of !== "string" || !/^\d{4}-\d{2}-\d{2}$/u.test(registry.as_of)) errors.push("as_of must be an ISO date");
  if (!Array.isArray(registry.regions)) return ["regions must be an array"];

  const seenSido = new Set();
  const seenSigungu = new Set();
  for (const group of registry.regions) {
    if (!isObject(group)) {
      errors.push("region group must be an object");
      continue;
    }
    if (!hasExactKeys(group, GROUP_KEYS)) errors.push(`region group contains unknown or missing keys: ${group.sido || "unknown"}`);
    if (seenSido.has(group.sido_code)) errors.push(`duplicate sido_code: ${group.sido_code}`);
    seenSido.add(group.sido_code);
    if (!Object.hasOwn(EXPECTED_SIDO_COUNTS, group.sido)) errors.push(`unsupported sido: ${group.sido}`);
    if (typeof group.sido_code !== "string" || !/^\d{2}$/u.test(group.sido_code)) errors.push(`invalid sido_code: ${group.sido_code}`);
    if (!isDateOrNull(group.effective_from) || !isDateOrNull(group.effective_to)) errors.push(`invalid effective date: ${group.sido}`);
    if (!MAPPING_STATUSES.has(group.mapping_status)) errors.push(`invalid mapping_status: ${group.mapping_status}`);
    if (!Array.isArray(group.sigungu)) {
      errors.push(`sigungu must be an array: ${group.sido}`);
      continue;
    }
    const expectedCount = EXPECTED_SIDO_COUNTS[group.sido];
    if (expectedCount !== undefined && group.sigungu.length !== expectedCount) errors.push(`${group.sido} must contain ${expectedCount} sigungu rows`);
    for (const item of group.sigungu) {
      if (!isObject(item) || typeof item.name !== "string" || typeof item.code !== "string") {
        errors.push(`invalid sigungu row in ${group.sido}`);
        continue;
      }
      if (!hasExactKeys(item, SIGUNGU_KEYS)) errors.push(`sigungu row contains unknown or missing keys: ${item.code}`);
      if (!/^\d{5}$/u.test(item.code) || !item.code.startsWith(group.sido_code)) errors.push(`invalid sigungu code: ${item.code}`);
      if (seenSigungu.has(item.code)) errors.push(`duplicate sigungu code: ${item.code}`);
      seenSigungu.add(item.code);
    }
  }
  if (registry.regions.length !== 2) errors.push("registry must contain Seoul and Busan only");
  if (seenSigungu.size !== 41) errors.push(`registry must contain 41 unique sigungu rows, got ${seenSigungu.size}`);
  if (errors.length > 0) throw new Error(errors.join("; "));
  return true;
}

function flattenRegions(registry) {
  return registry.regions.flatMap((group) => group.sigungu.map((item) => ({
    region_key: `${group.sido}-${item.name}`,
    geography_level: "sigungu",
    code_system: registry.code_system,
    sido_code: group.sido_code,
    sigungu_code: item.code,
    name_at_release: item.name,
    name_current: item.name,
    effective_from: group.effective_from,
    effective_to: group.effective_to,
    mapping_status: group.mapping_status
  })));
}

function loadRegistry(registryPath = REGISTRY_PATH) {
  const raw = JSON.parse(fs.readFileSync(registryPath, "utf8"));
  validateRegistry(raw);
  const regions = flattenRegions(raw);
  return {
    raw,
    regions,
    byCode(sidoCode, sigunguCode) {
      return regions.find((item) => item.sido_code === sidoCode && item.sigungu_code === sigunguCode) || null;
    }
  };
}

module.exports = { REGISTRY_PATH, EXPECTED_SIDO_COUNTS, flattenRegions, loadRegistry, validateRegistry };
