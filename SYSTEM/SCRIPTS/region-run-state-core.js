/**
 * region-run-state-core.js
 *
 * Deterministic run/generation identity for Region Intelligence.
 * Provides run_id generation, generation directory naming, provider path
 * validation against the closed registry, and Vault-visible lease/budget/
 * selection state structures.
 *
 * CommonJS. Uses only Node.js built-in modules.
 */
"use strict";

const crypto = require("crypto");
const path = require("path");

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CLOSED_PROVIDER_IDS = [
  "mois_jumin_statmonth_csv",
  "reb_rone_public_table",
  "reb_stock",
  "molit_apt_sale",
  "molit_apt_rent",
  "reb_supply",
  "building_hub_housing_permit",
  "kapt_basic",
  "national_establishments",
  "kosis_disabled",
  "official_land_price_region",
  "official_land_price_case",
  "admin_code",
  "admin_boundary_vworld",
  "incheon-metro",
  "busan-metro",
  "seoul-metro",
  "metro9-stage1",
  "metro9-stage23",
  "korail-station-candidate",
  "kric-station-candidate",
  "arex",
  "shinbundang",
  "gimpo-goldline",
  "ui-sinseol",
  "sillim",
  "everline",
  "uijeongbu-lrt",
  "seohae-rail",
  "naver_candidate",
  "youtube_candidate",
  "instagram_manual",
];

const PROVIDER_ID_SET = new Set(CLOSED_PROVIDER_IDS);

// Lease duration: 10 minutes in ms
const LEASE_DURATION_MS = 10 * 60 * 1000;
// Heartbeat interval: 30 seconds
const HEARTBEAT_INTERVAL_MS = 30 * 1000;

// ---------------------------------------------------------------------------
// Run identity
// ---------------------------------------------------------------------------

/**
 * Generate a new UUIDv4 run_id (lowercase).
 */
function generateRunId() {
  return crypto.randomUUID().toLowerCase();
}

/**
 * Validate that a string is a lowercase UUIDv4.
 */
function isValidRunId(s) {
  return typeof s === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(s);
}

// ---------------------------------------------------------------------------
// Generation directory naming
// ---------------------------------------------------------------------------

/**
 * Format a Date as compact UTC: YYYYMMDDTHHMMSSZ
 */
function formatCompactUTC(date) {
  const y = date.getUTCFullYear().toString().padStart(4, "0");
  const m = (date.getUTCMonth() + 1).toString().padStart(2, "0");
  const d = date.getUTCDate().toString().padStart(2, "0");
  const h = date.getUTCHours().toString().padStart(2, "0");
  const min = date.getUTCMinutes().toString().padStart(2, "0");
  const sec = date.getUTCSeconds().toString().padStart(2, "0");
  return `${y}${m}${d}T${h}${min}${sec}Z`;
}

/**
 * Build a generation directory name:
 * {YYYY-MM}__{fetched_at compact UTC YYYYMMDDTHHMMSSZ}__{lowercase UUIDv4 run_id}
 *
 * @param {string} period - "YYYY-MM" canonical period
 * @param {Date} fetchedAt - fetch timestamp
 * @param {string} runId - lowercase UUIDv4
 * @returns {string} generation directory name
 */
function buildGenerationDirName(period, fetchedAt, runId) {
  if (!isValidPeriod(period)) {
    throw new Error(`Invalid period format: "${period}". Expected YYYY-MM.`);
  }
  if (!(fetchedAt instanceof Date) || isNaN(fetchedAt.getTime())) {
    throw new Error("fetchedAt must be a valid Date");
  }
  if (!isValidRunId(runId)) {
    throw new Error(`Invalid run_id: "${runId}". Must be lowercase UUIDv4.`);
  }
  return `${period}__${formatCompactUTC(fetchedAt)}__${runId}`;
}

/**
 * Parse a generation directory name back into components.
 * @returns {{ period: string, fetchedAtCompact: string, runId: string }}
 */
function parseGenerationDirName(dirName) {
  const parts = dirName.split("__");
  if (parts.length !== 3) {
    throw new Error(`Invalid generation directory name: "${dirName}"`);
  }
  const [period, fetchedAtCompact, runId] = parts;
  if (!isValidPeriod(period)) {
    throw new Error(`Invalid period in generation dir: "${period}"`);
  }
  if (!/^\d{8}T\d{6}Z$/.test(fetchedAtCompact)) {
    throw new Error(`Invalid fetched_at compact in generation dir: "${fetchedAtCompact}"`);
  }
  if (!isValidRunId(runId)) {
    throw new Error(`Invalid run_id in generation dir: "${runId}"`);
  }
  return { period, fetchedAtCompact, runId };
}

/**
 * Validate YYYY-MM period format (month 01-12).
 */
function isValidPeriod(s) {
  if (typeof s !== "string" || !/^\d{4}-\d{2}$/.test(s)) return false;
  const month = parseInt(s.slice(5, 7), 10);
  return month >= 1 && month <= 12;
}

// ---------------------------------------------------------------------------
// Provider path validation
// ---------------------------------------------------------------------------

/**
 * Validate a provider_id against the closed registry.
 * Rejects path separators, dot segments, and unknown IDs.
 *
 * @param {string} providerId
 * @returns {string} the validated provider_id
 * @throws {Error} if invalid
 */
function validateProviderId(providerId) {
  if (typeof providerId !== "string" || providerId.length === 0) {
    throw new Error("provider_id must be a nonempty string");
  }
  // Reject path separators
  if (providerId.includes("/") || providerId.includes("\\")) {
    throw new Error(`provider_id contains path separator: "${providerId}"`);
  }
  // Reject dot segments
  if (providerId === "." || providerId === ".." ||
      providerId.includes("./") || providerId.includes(".\\") ||
      providerId.includes("/.") || providerId.includes("\\.")) {
    throw new Error(`provider_id contains dot segment: "${providerId}"`);
  }
  // Reject null bytes
  if (providerId.includes("\0")) {
    throw new Error(`provider_id contains null byte`);
  }
  // Must be in closed registry
  if (!PROVIDER_ID_SET.has(providerId)) {
    throw new Error(`provider_id not in closed registry: "${providerId}"`);
  }
  return providerId;
}

/**
 * Build the provider cache root path (relative to vault root).
 * SYSTEM/CACHE/region-intelligence/providers/{provider_id}/
 */
function providerCacheRoot(providerId) {
  validateProviderId(providerId);
  return path.join("SYSTEM", "CACHE", "region-intelligence", "providers", providerId);
}

/**
 * Build the generation directory path (relative to vault root).
 */
function generationPath(providerId, dirName) {
  validateProviderId(providerId);
  // Validate dirName has no path traversal
  if (dirName.includes("/") || dirName.includes("\\") || dirName.includes("..")) {
    throw new Error(`Generation dir name contains path traversal: "${dirName}"`);
  }
  return path.join(providerCacheRoot(providerId), "generations", dirName);
}

// ---------------------------------------------------------------------------
// Lease state
// ---------------------------------------------------------------------------

/**
 * Create a new lease state object.
 * Fencing tuple: (provider, run_id, owner_token, monotonic_generation, process_nonce)
 */
function createLease(providerId, runId, ownerToken, monotonicGeneration, processNonce) {
  validateProviderId(providerId);
  if (!isValidRunId(runId)) throw new Error("Invalid run_id for lease");
  if (typeof ownerToken !== "string" || ownerToken.length === 0) {
    throw new Error("owner_token must be nonempty string");
  }
  if (!Number.isInteger(monotonicGeneration) || monotonicGeneration < 0) {
    throw new Error("monotonic_generation must be non-negative integer");
  }
  if (!isValidRunId(processNonce)) {
    throw new Error("process_nonce must be a UUIDv4");
  }
  const now = Date.now();
  return {
    provider: providerId,
    run_id: runId,
    owner_token: ownerToken,
    monotonic_generation: monotonicGeneration,
    process_nonce: processNonce,
    acquired_at: new Date(now).toISOString(),
    expires_at: new Date(now + LEASE_DURATION_MS).toISOString(),
    heartbeat_interval_ms: HEARTBEAT_INTERVAL_MS,
    state: "active",
  };
}

/**
 * Renew a lease (heartbeat). Returns new lease with extended expiry.
 */
function renewLease(lease) {
  if (!lease || lease.state !== "active") {
    throw new Error("Cannot renew non-active lease");
  }
  const now = Date.now();
  return {
    ...lease,
    expires_at: new Date(now + LEASE_DURATION_MS).toISOString(),
  };
}

/**
 * Check if a lease is expired.
 */
function isLeaseExpired(lease, nowMs) {
  const now = nowMs || Date.now();
  return new Date(lease.expires_at).getTime() <= now;
}

/**
 * Validate the full fencing tuple matches.
 */
function verifyFencingTuple(lease, provider, runId, ownerToken, monotonicGeneration, processNonce) {
  return (
    lease.provider === provider &&
    lease.run_id === runId &&
    lease.owner_token === ownerToken &&
    lease.monotonic_generation === monotonicGeneration &&
    lease.process_nonce === processNonce
  );
}

// ---------------------------------------------------------------------------
// Budget state
// ---------------------------------------------------------------------------

/**
 * Create a daily budget state for a provider.
 * Identity: (KST dispatch date, provider, run_id, attempt)
 */
function createBudgetState(providerId, kstDate, dailyCap) {
  validateProviderId(providerId);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(kstDate)) {
    throw new Error(`Invalid KST date: "${kstDate}"`);
  }
  if (!Number.isInteger(dailyCap) || dailyCap < 1) {
    throw new Error("dailyCap must be positive integer");
  }
  return {
    provider: providerId,
    kst_date: kstDate,
    daily_cap: dailyCap,
    reserved: 0,
    reservations: [],
  };
}

/**
 * Reserve budget for an attempt. Returns updated state or throws if unavailable.
 * Replaying the same identity is a no-op.
 */
function reserveBudget(budgetState, runId, attempt, cost) {
  if (!isValidRunId(runId)) throw new Error("Invalid run_id for budget reservation");
  if (!Number.isInteger(attempt) || attempt < 1) throw new Error("attempt must be >= 1");
  if (!Number.isInteger(cost) || cost < 1) throw new Error("cost must be >= 1");

  // Idempotency: same identity is no-op
  const identity = `${runId}:${attempt}`;
  const existing = budgetState.reservations.find((r) => r.identity === identity);
  if (existing) {
    return budgetState; // no-op replay
  }

  if (budgetState.reserved + cost > budgetState.daily_cap) {
    throw new Error(
      `Budget exhausted: reserved=${budgetState.reserved}, cost=${cost}, cap=${budgetState.daily_cap}`
    );
  }

  const updated = {
    ...budgetState,
    reserved: budgetState.reserved + cost,
    reservations: [
      ...budgetState.reservations,
      { identity, run_id: runId, attempt, cost, reserved_at: new Date().toISOString() },
    ],
  };
  return updated;
}

// ---------------------------------------------------------------------------
// Selection state
// ---------------------------------------------------------------------------

/**
 * Create a selection state (the mutable selected.json pointer content).
 * This is the ONLY mutable pointer in the provider cache.
 */
function createSelectionState(providerId, generationDirName, receiptHash, selectedAt) {
  validateProviderId(providerId);
  if (typeof generationDirName !== "string" || generationDirName.length === 0) {
    throw new Error("generationDirName must be nonempty");
  }
  if (!/^[0-9a-f]{64}$/.test(receiptHash)) {
    throw new Error("receiptHash must be 64 lowercase hex");
  }
  return {
    provider: providerId,
    generation: generationDirName,
    selection_receipt_hash: receiptHash,
    selected_at: selectedAt || new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Deterministic serialization
// ---------------------------------------------------------------------------

/**
 * Produce deterministic JSON bytes (sorted keys, no trailing newline).
 * Used for hashing and identity.
 */
function canonicalJSON(obj) {
  return JSON.stringify(sortKeys(obj));
}

function sortKeys(val) {
  if (val === null || typeof val !== "object") return val;
  if (Array.isArray(val)) return val.map(sortKeys);
  const sorted = {};
  for (const key of Object.keys(val).sort()) {
    sorted[key] = sortKeys(val[key]);
  }
  return sorted;
}

/**
 * SHA-256 hex of a Buffer or string.
 */
function sha256hex(data) {
  return crypto.createHash("sha256").update(data).digest("hex");
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

module.exports = {
  CLOSED_PROVIDER_IDS,
  PROVIDER_ID_SET,
  LEASE_DURATION_MS,
  HEARTBEAT_INTERVAL_MS,
  generateRunId,
  isValidRunId,
  formatCompactUTC,
  buildGenerationDirName,
  parseGenerationDirName,
  isValidPeriod,
  validateProviderId,
  providerCacheRoot,
  generationPath,
  createLease,
  renewLease,
  isLeaseExpired,
  verifyFencingTuple,
  createBudgetState,
  reserveBudget,
  createSelectionState,
  canonicalJSON,
  sortKeys,
  sha256hex,
};
