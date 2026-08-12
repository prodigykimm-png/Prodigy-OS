"use strict";

const path = require("node:path");

const SUPPORTED_SCHEMA_VERSION = 1;
const REQUIRED_REGION_FIELDS = ["sigungu", "region_key", "title", "region_prefix", "lawd_code", "household_code"];

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function parseJson(text, label) {
  if (typeof text !== "string") throw new Error(`${label} JSON이 문자열이 아닙니다.`);
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error(`${label} JSON 파싱 실패: ${error.message}`);
  }
}

function validateManifestPath(manifestPath) {
  if (typeof manifestPath !== "string" || manifestPath.length === 0) {
    throw new Error("manifest_path가 빈 문자열이거나 문자열이 아닙니다.");
  }
  const hasTraversal = manifestPath.split(/[\\/]/u).some((segment) => segment === "." || segment === "..");
  if (path.posix.isAbsolute(manifestPath) || path.win32.isAbsolute(manifestPath) || /^[A-Za-z]:/u.test(manifestPath) || hasTraversal) {
    throw new Error(`manifest_path는 traversal 없는 상대 경로여야 합니다: ${manifestPath}`);
  }
  return manifestPath;
}

function validateManifestHeader(manifest, expectedSido, manifestPath) {
  if (!isObject(manifest)) throw new Error(`manifest가 객체가 아닙니다: ${manifestPath}`);
  if (manifest.schema_version !== SUPPORTED_SCHEMA_VERSION) {
    throw new Error(`지원하지 않는 manifest schema_version: ${manifest.schema_version} (지원: ${SUPPORTED_SCHEMA_VERSION})`);
  }
  if (typeof manifest.sido !== "string" || manifest.sido.length === 0) {
    throw new Error(`manifest.sido가 빈 문자열이거나 문자열이 아닙니다: ${manifestPath}`);
  }
  if (manifest.sido !== expectedSido) {
    throw new Error(`index sido와 manifest sido가 일치하지 않습니다: ${expectedSido} != ${manifest.sido}`);
  }
  if (!Array.isArray(manifest.regions)) throw new Error(`manifest.regions가 배열이 아닙니다: ${manifestPath}`);
  if (!Number.isInteger(manifest.region_count) || manifest.region_count !== manifest.regions.length) {
    throw new Error(`region_count(${manifest.region_count})와 regions.length(${manifest.regions.length})가 일치하지 않습니다: ${manifestPath}`);
  }
}

function validateRegionStructure(region, index, manifestPath) {
  if (!isObject(region)) throw new Error(`regions[${index}]가 객체가 아닙니다: ${manifestPath}`);
  for (const field of REQUIRED_REGION_FIELDS) {
    if (typeof region[field] !== "string" || region[field].length === 0) {
      throw new Error(`regions[${index}] 필드가 잘못됐습니다: ${field}`);
    }
  }
  if (!/^\d{8}$/u.test(region.lawd_code)) {
    throw new Error(`lawd_code가 8자리 숫자가 아닙니다: ${region.region_key} = ${region.lawd_code}`);
  }
  if (!/^\d{10}$/u.test(region.household_code)) {
    throw new Error(`household_code가 10자리 숫자가 아닙니다: ${region.region_key} = ${region.household_code}`);
  }
  if (region.lawd_code.slice(0, 5) !== region.household_code.slice(0, 5)) {
    throw new Error(`household_code 앞 5자리가 lawd_code와 일치하지 않습니다: ${region.region_key}`);
  }
}

function validateRegionIdentity(region, sido) {
  if (region.region_key !== `${sido}-${region.sigungu}`) {
    throw new Error(`region_key와 sido/sigungu가 일치하지 않습니다: ${region.region_key}`);
  }
  if (region.title !== `${sido} ${region.sigungu}`) {
    throw new Error(`title이 sido/sigungu 형식과 다릅니다: ${region.region_key}`);
  }
  if (region.region_prefix !== region.title) {
    throw new Error(`region_prefix가 title과 일치하지 않습니다: ${region.region_key}`);
  }
}

function validateRegistry(index, manifestsByPath) {
  if (!isObject(index)) throw new Error("manifest index가 객체가 아닙니다.");
  if (index.schema_version !== SUPPORTED_SCHEMA_VERSION) {
    throw new Error(`지원하지 않는 manifest index schema_version: ${index.schema_version} (지원: ${SUPPORTED_SCHEMA_VERSION})`);
  }
  if (!Array.isArray(index.manifests)) throw new Error("manifest index manifests가 배열이 아닙니다.");
  if (!isObject(manifestsByPath)) throw new Error("manifestsByPath가 객체가 아닙니다.");

  const seenSido = new Set();
  const loadedManifests = [];
  const regionRecords = [];

  for (const [entryIndex, entry] of index.manifests.entries()) {
    if (!isObject(entry)) throw new Error(`manifests[${entryIndex}]가 객체가 아닙니다.`);
    if (typeof entry.sido !== "string" || entry.sido.length === 0) {
      throw new Error(`manifests[${entryIndex}].sido가 빈 문자열이거나 문자열이 아닙니다.`);
    }
    if (seenSido.has(entry.sido)) throw new Error(`중복 sido: ${entry.sido}`);
    seenSido.add(entry.sido);

    const manifestPath = validateManifestPath(entry.manifest_path);
    if (!Object.hasOwn(manifestsByPath, manifestPath)) throw new Error(`manifest가 제공되지 않았습니다: ${manifestPath}`);
    const manifest = manifestsByPath[manifestPath];
    validateManifestHeader(manifest, entry.sido, manifestPath);

    const manifestRegions = [];
    for (const [regionIndex, region] of manifest.regions.entries()) {
      validateRegionStructure(region, regionIndex, manifestPath);
      const record = Object.freeze({ ...region, sido: entry.sido, manifest_path: manifestPath });
      manifestRegions.push(record);
      regionRecords.push(record);
    }
    loadedManifests.push(Object.freeze({
      sido: entry.sido,
      manifest_path: manifestPath,
      region_count: manifest.region_count,
      regions: Object.freeze(manifestRegions)
    }));
  }

  const seenRegionKeys = new Set();
  for (const region of regionRecords) {
    if (seenRegionKeys.has(region.region_key)) throw new Error(`중복 region_key: ${region.region_key}`);
    seenRegionKeys.add(region.region_key);
  }
  for (const region of regionRecords) validateRegionIdentity(region, region.sido);

  return Object.freeze({
    schema_version: index.schema_version,
    manifests: Object.freeze(loadedManifests),
    regions: Object.freeze(regionRecords)
  });
}

function loadRegistry(indexJson, manifestJsonByPath) {
  const index = parseJson(indexJson, "manifest index");
  if (!isObject(index) || !Array.isArray(index.manifests)) return validateRegistry(index, {});
  if (!isObject(manifestJsonByPath)) throw new Error("manifestJsonByPath가 객체가 아닙니다.");

  const manifestsByPath = {};
  for (const entry of index.manifests) {
    if (!isObject(entry) || typeof entry.manifest_path !== "string") continue;
    if (!Object.hasOwn(manifestJsonByPath, entry.manifest_path)) continue;
    manifestsByPath[entry.manifest_path] = parseJson(manifestJsonByPath[entry.manifest_path], `manifest ${entry.manifest_path}`);
  }
  return validateRegistry(index, manifestsByPath);
}

module.exports = Object.freeze({
  SUPPORTED_SCHEMA_VERSION,
  loadRegistry,
  validateManifestPath,
  validateRegistry
});
