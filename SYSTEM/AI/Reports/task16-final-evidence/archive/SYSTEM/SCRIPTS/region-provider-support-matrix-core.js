"use strict";

const fs = require("node:fs");
const path = require("node:path");

const MATRIX_PATH = path.join(__dirname, "region-provider-support-matrix.json");
const STATUS_VALUES = new Set(["pilot_ready", "blocked_coverage", "blocked_fixture", "disabled"]);
const MATRIX_KEYS = ["$schema", "schema_version", "matrix_id", "as_of", "providers"];
const PROVIDER_KEYS = [
  "provider_id", "provider_contract_id", "source_kind", "source_url", "official_available", "adapter_ready",
  "fixture_ready", "network_allowed", "projection_ready", "status", "geography_levels", "property_types", "blocked_reason"
];

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function hasExactKeys(value, keys) {
  return isObject(value) && Object.keys(value).sort().join("\u0000") === [...keys].sort().join("\u0000");
}

function loadMatrix(matrixPath = MATRIX_PATH) {
  const matrix = JSON.parse(fs.readFileSync(matrixPath, "utf8"));
  const errors = validateMatrix(matrix);
  if (errors.length > 0) throw new Error(errors.join("; "));
  return matrix;
}

function validateMatrix(matrix) {
  const errors = [];
  if (!isObject(matrix)) return ["support matrix must be an object"];
  if (!hasExactKeys(matrix, MATRIX_KEYS)) errors.push("support matrix contains unknown or missing keys");
  if (matrix.schema_version !== 1) errors.push("schema_version must be 1");
  if (typeof matrix.matrix_id !== "string") errors.push("matrix_id must be a string");
  if (typeof matrix.as_of !== "string" || !/^\d{4}-\d{2}-\d{2}$/u.test(matrix.as_of)) errors.push("as_of must be an ISO date");
  if (!Array.isArray(matrix.providers)) return ["providers must be an array"];

  const ids = new Set();
  for (const row of matrix.providers) {
    if (!isObject(row)) {
      errors.push("provider row must be an object");
      continue;
    }
    const id = row.provider_id;
    if (!hasExactKeys(row, PROVIDER_KEYS)) errors.push(`${id || "unknown provider"} contains unknown or missing keys`);
    if (typeof id !== "string" || !/^[a-z0-9][a-z0-9_-]{2,63}$/u.test(id)) errors.push("provider_id must be ASCII snake_case");
    if (ids.has(id)) errors.push(`duplicate provider_id: ${id}`);
    ids.add(id);
    if (row.source_kind !== "official") errors.push(`${id} must use an official source_kind`);
    if (typeof row.source_url !== "string" || !row.source_url.startsWith("https://")) errors.push(`${id} source_url must be HTTPS`);
    for (const field of ["official_available", "adapter_ready", "fixture_ready", "network_allowed", "projection_ready"]) {
      if (typeof row[field] !== "boolean") errors.push(`${id} ${field} must be boolean`);
    }
    if (!STATUS_VALUES.has(row.status)) errors.push(`${id} has an unknown status`);
    if (!Array.isArray(row.geography_levels) || row.geography_levels.length === 0) errors.push(`${id} needs geography_levels`);
    if (!Array.isArray(row.property_types) || row.property_types.length === 0) errors.push(`${id} needs property_types`);
    if (row.network_allowed && !row.official_available) errors.push(`${id} cannot dispatch a non-official source`);
    if (row.projection_ready && !(row.official_available && row.adapter_ready && row.fixture_ready && row.network_allowed)) errors.push(`${id} cannot be projection-ready while readiness or network is blocked`);
    if (row.status === "pilot_ready" && !row.projection_ready) errors.push(`${id} pilot_ready requires projection_ready`);
    if (row.status !== "pilot_ready" && row.projection_ready) errors.push(`${id} blocked status cannot be projection-ready`);
    if (row.projection_ready && row.blocked_reason !== null) errors.push(`${id} ready provider must not have blocked_reason`);
    if (!row.projection_ready && (typeof row.blocked_reason !== "string" || row.blocked_reason.trim() === "")) errors.push(`${id} blocked provider needs blocked_reason`);
    if (row.provider_contract_id !== null && typeof row.provider_contract_id !== "string") errors.push(`${id} provider_contract_id must be a string or null`);
  }
  return errors;
}

function getProvider(matrix, providerId) {
  const row = matrix.providers.find((item) => item.provider_id === providerId);
  if (!row) throw new Error(`unknown provider_id: ${providerId}`);
  return row;
}

function canDispatch(matrix, providerId) {
  const row = getProvider(matrix, providerId);
  return row.official_available && row.adapter_ready && row.fixture_ready && row.network_allowed && row.projection_ready;
}

module.exports = { MATRIX_PATH, canDispatch, getProvider, loadMatrix, validateMatrix };
