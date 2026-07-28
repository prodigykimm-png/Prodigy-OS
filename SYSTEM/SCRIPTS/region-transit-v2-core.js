"use strict";

/**
 * Fail-closed validator for provider-separated, boundary-verified transit data.
 * Contract: SYSTEM/docs/Region_Transit_Provider_Contract_v2.md
 */

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const REQUIRED_STATION_KEYS = new Set([
  "station_code", "station_name", "line_name", "operator", "operator_evidence_url",
  "official_address", "station_evidence_url", "coordinate", "region_assignment",
  "raw_path", "raw_sha256"
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

function validateStation(station, vaultRoot, boundarySha) {
  if (!isObject(station)) throw new Error("station must be an object");
  for (const key of REQUIRED_STATION_KEYS) if (!(key in station)) throw new Error(`station missing ${key}`);
  for (const key of ["station_code", "station_name", "line_name", "operator", "official_address", "raw_path", "raw_sha256"]) nonEmpty(station[key], `station.${key}`);
  httpsUrl(station.operator_evidence_url, "station.operator_evidence_url");
  httpsUrl(station.station_evidence_url, "station.station_evidence_url");

  if (!isObject(station.coordinate)) throw new Error("station.coordinate must be an object");
  const { lat, lng, source_url: sourceUrl } = station.coordinate;
  if (!Number.isFinite(lat) || lat < 33 || lat > 39) throw new Error("station.coordinate.lat outside Korea bounds");
  if (!Number.isFinite(lng) || lng < 124 || lng > 132) throw new Error("station.coordinate.lng outside Korea bounds");
  httpsUrl(sourceUrl, "station.coordinate.source_url");

  if (!isObject(station.region_assignment)) throw new Error("station.region_assignment must be an object");
  nonEmpty(station.region_assignment.region_key, "station.region_assignment.region_key");
  const assignment = station.region_assignment;
  if (assignment.method === "official_address_admin_parse") {
    if (assignment.source_field !== "official_address") throw new Error("official address assignment must name official_address source field");
    if (!/^(서울특별시\s+[^\s]+구|경기도\s+[^\s]+(?:시|군))(?=\s|$)/u.test(station.official_address)) {
      throw new Error("official address does not directly identify a Seoul/Gyeonggi sigungu");
    }
  } else if (assignment.method === "point_in_polygon") {
    if (!/^\d{5}$/.test(String(assignment.sigungu_code))) throw new Error("point-in-polygon sigungu_code must be five digits");
    if (assignment.boundary_sha256 !== boundarySha) throw new Error("point-in-polygon boundary SHA mismatch");
  } else {
    throw new Error("region_assignment.method must be official_address_admin_parse or point_in_polygon");
  }

  const rawRoot = fs.realpathSync(path.join(vaultRoot, "SYSTEM/CACHE/region-transit/raw"));
  const rawPath = path.resolve(vaultRoot, "SYSTEM/CACHE/region-transit", station.raw_path);
  if (!fs.existsSync(rawPath)) throw new Error(`station raw missing: ${station.raw_path}`);
  const realRaw = fs.realpathSync(rawPath);
  if (!realRaw.startsWith(rawRoot + path.sep)) throw new Error("station raw outside allowed root");
  if (sha256(fs.readFileSync(realRaw)) !== station.raw_sha256) throw new Error(`station raw SHA mismatch: ${station.station_code}`);
}

function validateProviderMap(map, vaultRoot = process.cwd()) {
  if (!isObject(map)) throw new Error("provider map must be an object");
  if (map.schema_version !== 2) throw new Error("provider map schema_version must be 2");
  nonEmpty(map.provider_id, "provider_id");
  nonEmpty(map.operator, "operator");
  httpsUrl(map.operator_evidence_url, "operator_evidence_url");
  if (!isObject(map.assignment_policy)) throw new Error("assignment_policy must be an object");
  if (!["official_address_admin_parse", "point_in_polygon"].includes(map.assignment_policy.method)) throw new Error("assignment_policy.method is invalid");
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

  const keys = new Set();
  for (const station of map.stations) {
    validateStation(station, vaultRoot, boundarySha);
    const key = `${station.station_code}:${station.line_name}`;
    if (keys.has(key)) throw new Error(`duplicate station identity: ${key}`);
    keys.add(key);
  }
  return true;
}

module.exports = Object.freeze({ validateProviderMap, validateStation });
