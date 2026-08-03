"use strict";

const fs = require("node:fs");
const path = require("node:path");

const sourceRegistry = require("./region-source-registry-core.js");

const REGISTRY_PATH = path.join(__dirname, "region-geography-expansion.json");
const REGISTRY_KEYS = ["$schema", "schema_version", "registry_id", "code_system", "as_of", "regions"];
const GROUP_KEYS = ["sido", "sido_code", "effective_from", "effective_to", "mapping_status", "sigungu"];
const SIGUNGU_KEYS = ["name", "code"];
const EXPECTED_GROUPS = Object.freeze([
  Object.freeze({ sido: "부산광역시", sido_code: "26", count: 16 }),
  Object.freeze({ sido: "서울특별시", sido_code: "11", count: 25 }),
  Object.freeze({ sido: "경기도", sido_code: "41", count: 31 }),
  Object.freeze({ sido: "인천광역시", sido_code: "28", count: 11 })
]);

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function hasExactKeys(value, keys) {
  return isObject(value) && Object.keys(value).sort().join("\u0000") === [...keys].sort().join("\u0000");
}

function isDateOrNull(value) {
  return value === null || (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/u.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`)));
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

function digestFor(regions) {
  const triples = regions.map((region) => [region.region_key, `${region.sigungu_code}000`, `${region.sigungu_code}00000`]);
  return sourceRegistry.computeRegionDigest(triples);
}

function validateRegistry(registry) {
  const errors = [];
  if (!isObject(registry)) return ["geography expansion registry must be an object"];
  if (!hasExactKeys(registry, REGISTRY_KEYS)) errors.push("geography expansion registry contains unknown or missing keys");
  if (registry.schema_version !== 1) errors.push("schema_version must be 1");
  if (registry.registry_id !== "seoul-capital-busan-sigungu") errors.push("unexpected expansion registry_id");
  if (registry.code_system !== "mois_sigungu") errors.push("code_system must be mois_sigungu");
  if (typeof registry.as_of !== "string" || !/^\d{4}-\d{2}-\d{2}$/u.test(registry.as_of)) errors.push("as_of must be an ISO date");
  if (!Array.isArray(registry.regions) || registry.regions.length !== EXPECTED_GROUPS.length) return [...errors, "expansion registry must contain four region groups"];

  const seen = new Set();
  registry.regions.forEach((group, index) => {
    const expected = EXPECTED_GROUPS[index];
    if (!hasExactKeys(group, GROUP_KEYS)) errors.push(`region group contains unknown or missing keys: ${group.sido || "unknown"}`);
    if (group.sido !== expected.sido || group.sido_code !== expected.sido_code) errors.push(`unexpected region group at index ${index}`);
    if (!isDateOrNull(group.effective_from) || !isDateOrNull(group.effective_to)) errors.push(`invalid effective date: ${group.sido}`);
    if (group.effective_from !== null || group.effective_to !== null || group.mapping_status !== "effective_date_pending") errors.push(`unverified effective date metadata: ${group.sido}`);
    if (!Array.isArray(group.sigungu) || group.sigungu.length !== expected.count) {
      errors.push(`${group.sido} must contain ${expected.count} sigungu rows`);
      return;
    }
    for (const item of group.sigungu) {
      if (!isObject(item) || !hasExactKeys(item, SIGUNGU_KEYS)) {
        errors.push(`invalid sigungu row in ${group.sido}`);
        continue;
      }
      if (!/^\d{5}$/u.test(item.code) || !item.code.startsWith(group.sido_code)) errors.push(`invalid sigungu code: ${item.code}`);
      if (seen.has(item.code)) errors.push(`duplicate sigungu code: ${item.code}`);
      seen.add(item.code);
    }
  });
  if (seen.size !== 83) errors.push(`expansion registry must contain 83 unique sigungu rows, got ${seen.size}`);
  if (errors.length === 0 && digestFor(flattenRegions(registry)) !== sourceRegistry.EXPECTED_DIGEST_SHA256) errors.push("expansion registry identity digest differs from the frozen 83-region digest");
  return errors;
}

function loadRegistry(registryPath = REGISTRY_PATH) {
  const raw = JSON.parse(fs.readFileSync(registryPath, "utf8"));
  const errors = validateRegistry(raw);
  if (errors.length > 0) throw new Error(errors.join("; "));
  const regions = flattenRegions(raw);
  return {
    raw,
    regions,
    digest_sha256: digestFor(regions),
    byCode(sidoCode, sigunguCode) {
      return regions.find((item) => item.sido_code === sidoCode && item.sigungu_code === sigunguCode) || null;
    }
  };
}

module.exports = Object.freeze({
  EXPECTED_GROUPS,
  REGISTRY_PATH,
  digestFor,
  flattenRegions,
  loadRegistry,
  validateRegistry
});
