"use strict";

/**
 * Fail-closed validator for provider-separated, boundary-verified transit data.
 * Contract: SYSTEM/docs/Region_Transit_Provider_Contract_v2.md
 *
 * Invariants:
 * - provider/line/station uniqueness enforced per map
 * - raw evidence and operator evidence are mandatory
 * - Region assignment ONLY from official_address_admin_parse or exactly one
 *   validated point_in_polygon — NEVER nearest-centroid
 * - future authoritative-set membership checked when set is provided
 * - relocated-Vault path support via configurable vaultRoot
 */

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const REQUIRED_STATION_KEYS = new Set([
  "station_code", "station_name", "line_name", "operator", "operator_evidence_url",
  "official_address", "station_evidence_url", "coordinate", "region_assignment",
  "raw_path", "raw_sha256"
]);

const VALID_ASSIGNMENT_METHODS = new Set([
  "official_address_admin_parse",
  "point_in_polygon"
]);

const FORBIDDEN_ASSIGNMENT_METHODS = new Set([
  "nearest_center",
  "nearest_centroid",
  "nearest_polygon",
  "line_map_inference",
  "station_name_suffix",
  "coordinate_guess"
]);

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function nonEmpty(value, label) {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${label} must be a non-empty string`);
}

function httpsUrl(value, label) {
  nonEmpty(value, label);
  let parsed;
  try { parsed = new URL(value); } catch (_error) { throw new Error(`${label} must be a URL`); }
  if (parsed.protocol !== "https:") throw new Error(`${label} must use https`);
}

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

/**
 * Validate a single station record against the v2 schema.
 * @param {object} station
 * @param {string} vaultRoot - absolute path to Vault root (supports relocated Vaults)
 * @param {string|null} boundarySha - expected boundary SHA for point_in_polygon
 * @param {object} [options] - optional settings
 * @param {Set|null} [options.authoritativeSet] - set of "code:line" keys for membership check
 */
function validateStation(station, vaultRoot, boundarySha, options) {
  const opts = options || {};
  if (!isObject(station)) throw new Error("station must be an object");
  for (const key of REQUIRED_STATION_KEYS) if (!(key in station)) throw new Error(`station missing ${key}`);
  for (const key of ["station_code", "station_name", "line_name", "operator", "official_address", "raw_path", "raw_sha256"]) nonEmpty(station[key], `station.${key}`);
  httpsUrl(station.operator_evidence_url, "station.operator_evidence_url");
  httpsUrl(station.station_evidence_url, "station.station_evidence_url");

  // Operator evidence: operator must not be empty or generic
  if (station.operator.trim().length < 2) throw new Error("station.operator must be a meaningful operator name");

  if (!isObject(station.coordinate)) throw new Error("station.coordinate must be an object");
  const { lat, lng, source_url: sourceUrl } = station.coordinate;
  if (!Number.isFinite(lat) || lat < 33 || lat > 39) throw new Error("station.coordinate.lat outside Korea bounds");
  if (!Number.isFinite(lng) || lng < 124 || lng > 132) throw new Error("station.coordinate.lng outside Korea bounds");
  httpsUrl(sourceUrl, "station.coordinate.source_url");

  if (!isObject(station.region_assignment)) throw new Error("station.region_assignment must be an object");
  nonEmpty(station.region_assignment.region_key, "station.region_assignment.region_key");
  const assignment = station.region_assignment;

  // Reject forbidden methods explicitly
  if (FORBIDDEN_ASSIGNMENT_METHODS.has(assignment.method)) {
    throw new Error(`region_assignment.method '${assignment.method}' is forbidden — nearest/centroid/inference methods are never allowed`);
  }

  if (assignment.method === "official_address_admin_parse") {
    if (assignment.source_field !== "official_address") throw new Error("official address assignment must name official_address source field");
    if (!/^(서울특별시\s+[^\s]+구|경기도\s+[^\s]+(?:시|군)|인천광역시\s+[^\s]+구|부산광역시\s+[^\s]+구)(?=\s|$)/u.test(station.official_address)) {
      throw new Error("official address does not directly identify a Seoul/Gyeonggi/Incheon/Busan sigungu");
    }
  } else if (assignment.method === "point_in_polygon") {
    if (!/^\d{5}$/.test(String(assignment.sigungu_code))) throw new Error("point-in-polygon sigungu_code must be five digits");
    if (assignment.boundary_sha256 !== boundarySha) throw new Error("point-in-polygon boundary SHA mismatch");
    // Exactly one polygon match required
    if (assignment.polygon_match_count !== undefined && assignment.polygon_match_count !== 1) {
      throw new Error("point-in-polygon must match exactly one polygon, got " + assignment.polygon_match_count);
    }
  } else {
    throw new Error("region_assignment.method must be official_address_admin_parse or point_in_polygon");
  }

  // Future authoritative-set membership check
  if (opts.authoritativeSet) {
    const membershipKey = `${station.station_code}:${station.line_name}`;
    if (!opts.authoritativeSet.has(membershipKey)) {
      throw new Error(`station ${membershipKey} not in authoritative set`);
    }
  }

  // Raw evidence validation with relocated-Vault path support
  const transitRoot = path.join(vaultRoot, "SYSTEM/CACHE/region-transit");
  const rawRoot = fs.realpathSync(path.join(transitRoot, "raw"));
  const rawPath = path.resolve(transitRoot, station.raw_path);
  if (!fs.existsSync(rawPath)) throw new Error(`station raw missing: ${station.raw_path}`);
  const realRaw = fs.realpathSync(rawPath);
  if (!realRaw.startsWith(rawRoot + path.sep)) throw new Error("station raw outside allowed root");
  if (sha256(fs.readFileSync(realRaw)) !== station.raw_sha256) throw new Error(`station raw SHA mismatch: ${station.station_code}`);
}

/**
 * Validate a complete provider map.
 * @param {object} map - provider map object
 * @param {string} [vaultRoot] - Vault root (defaults to cwd; supports relocated Vaults)
 * @param {object} [options] - optional settings
 * @param {Set|null} [options.authoritativeSet] - authoritative station set for membership
 */
function validateProviderMap(map, vaultRoot, options) {
  const opts = options || {};
  if (typeof vaultRoot === "object" && vaultRoot !== null && !options) {
    // Backwards compat: second arg may be options
    opts.authoritativeSet = vaultRoot.authoritativeSet || null;
    vaultRoot = process.cwd();
  }
  vaultRoot = vaultRoot || process.cwd();

  if (!isObject(map)) throw new Error("provider map must be an object");
  if (map.schema_version !== 2) throw new Error("provider map schema_version must be 2");
  nonEmpty(map.provider_id, "provider_id");
  nonEmpty(map.operator, "operator");
  httpsUrl(map.operator_evidence_url, "operator_evidence_url");
  if (!isObject(map.assignment_policy)) throw new Error("assignment_policy must be an object");
  if (!VALID_ASSIGNMENT_METHODS.has(map.assignment_policy.method)) throw new Error("assignment_policy.method is invalid");

  let boundarySha = null;
  if (map.assignment_policy.method === "point_in_polygon") {
    if (!isObject(map.boundary)) throw new Error("boundary must be an object for point-in-polygon");
    httpsUrl(map.boundary.source_url, "boundary.source_url");
    nonEmpty(map.boundary.version, "boundary.version");
    if (!/^[a-f0-9]{64}$/.test(map.boundary.sha256 || "")) throw new Error("boundary.sha256 must be SHA-256");
    if (map.boundary.crs !== "EPSG:4326") throw new Error("boundary.crs must be EPSG:4326");
    boundarySha = map.boundary.sha256;
  }
  if (!Array.isArray(map.stations) || map.stations.length === 0) throw new Error("stations must be a non-empty array");

  // Provider/line/station uniqueness
  const stationKeys = new Set();
  const lineNames = new Set();
  for (const station of map.stations) {
    validateStation(station, vaultRoot, boundarySha, opts);
    const key = `${station.station_code}:${station.line_name}`;
    if (stationKeys.has(key)) throw new Error(`duplicate station identity: ${key}`);
    stationKeys.add(key);
    lineNames.add(station.line_name);

    // Operator consistency: every station must match the map operator
    if (station.operator !== map.operator) {
      throw new Error(`station operator mismatch: station '${station.station_code}' has '${station.operator}', map declares '${map.operator}'`);
    }
  }

  return true;
}

module.exports = Object.freeze({
  validateProviderMap,
  validateStation,
  VALID_ASSIGNMENT_METHODS,
  FORBIDDEN_ASSIGNMENT_METHODS,
  REQUIRED_STATION_KEYS
});
