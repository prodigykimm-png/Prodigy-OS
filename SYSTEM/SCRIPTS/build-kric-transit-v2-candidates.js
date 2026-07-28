#!/usr/bin/env node
"use strict";

/**
 * Builds provider-separated v2 candidate maps from the official KRIC snapshot.
 * The output remains candidate-only: it has no Region Object writer path.
 *
 * Safety:
 * - only official-address-derived region assignments are emitted;
 * - byte-identical duplicate station identities collapse to one;
 * - conflicting identities are excluded and recorded as unresolved;
 * - no prior crosswalk/map is read or reused.
 */

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { validateProviderMap } = require("./region-transit-v2-core.js");

const CANDIDATE_REL = "SYSTEM/CACHE/region-transit/candidates/kric-urban-stations-seoul-gyeonggi-candidate.json";
const OUT_REL = "SYSTEM/CACHE/region-transit/candidates/v2";
const KRIC_URL = "https://data.kric.go.kr/rips/M_01_01/detail.do?id=32";

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function slug(value) {
  return crypto.createHash("sha256").update(value).digest("hex").slice(0, 16);
}

function sameStation(left, right) {
  return left.station_name === right.station_name
    && left.line_name === right.line_name
    && left.operator === right.operator
    && left.official_address === right.official_address
    && left.lat === right.lat
    && left.lng === right.lng;
}

function toV2(station) {
  return {
    station_code: station.station_code,
    station_name: station.station_name,
    line_name: station.line_name,
    operator: station.operator,
    operator_evidence_url: KRIC_URL,
    official_address: station.official_address,
    station_evidence_url: KRIC_URL,
    coordinate: { lat: station.lat, lng: station.lng, source_url: KRIC_URL },
    region_assignment: {
      region_key: station.region_key_from_address,
      method: "official_address_admin_parse",
      source_field: "official_address"
    },
    raw_path: station.raw_path,
    raw_sha256: station.raw_sha256
  };
}

function build(vaultRoot = process.cwd()) {
  const root = fs.realpathSync(path.resolve(vaultRoot));
  const input = JSON.parse(fs.readFileSync(path.join(root, CANDIDATE_REL), "utf8"));
  if (input.status !== "candidate_not_publishable") throw new Error("expected a KRIC candidate snapshot");

  const identity = new Map();
  const unresolved = [];
  for (const station of input.stations) {
    const key = `${station.station_code}:${station.line_code}`;
    const existing = identity.get(key);
    if (!existing) { identity.set(key, station); continue; }
    if (sameStation(existing, station)) continue;
    identity.set(key, null);
    unresolved.push({ identity: key, reason: "conflicting official duplicate", stations: [existing, station] });
  }

  const groups = new Map();
  for (const station of identity.values()) {
    if (!station) continue;
    if (!groups.has(station.operator)) groups.set(station.operator, []);
    groups.get(station.operator).push(toV2(station));
  }

  const outRoot = path.join(root, OUT_REL);
  fs.mkdirSync(outRoot, { recursive: true });
  const outputs = [];
  for (const [operator, stations] of groups) {
    const map = {
      schema_version: 2,
      status: "candidate_not_publishable",
      provider_id: `kric-${slug(operator)}`,
      operator,
      operator_evidence_url: KRIC_URL,
      assignment_policy: { method: "official_address_admin_parse" },
      source_snapshot_sha256: input.raw_sha256,
      source_snapshot_path: input.raw_path,
      station_count: stations.length,
      stations
    };
    validateProviderMap(map, root);
    const outputPath = path.join(outRoot, `${map.provider_id}.json`);
    fs.writeFileSync(outputPath, JSON.stringify(map, null, 2));
    outputs.push({ provider_id: map.provider_id, operator, station_count: stations.length, path: path.relative(root, outputPath), sha256: sha256(fs.readFileSync(outputPath)) });
  }

  const manifest = {
    generated_at: new Date().toISOString(),
    status: "candidate_not_publishable",
    reason: "Provider-specific official source cross-check and writer v2 approval are still required.",
    input: { path: CANDIDATE_REL, raw_sha256: input.raw_sha256 },
    accepted_station_count: [...identity.values()].filter(Boolean).length,
    unresolved,
    outputs
  };
  fs.writeFileSync(path.join(outRoot, "manifest.json"), JSON.stringify(manifest, null, 2));
  return manifest;
}

if (require.main === module) {
  try { process.stdout.write(`${JSON.stringify(build(), null, 2)}\n`); }
  catch (error) { process.stderr.write(`${error.stack || error.message}\n`); process.exitCode = 1; }
}

module.exports = Object.freeze({ build, sameStation });
