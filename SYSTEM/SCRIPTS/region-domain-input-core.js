/**
 * region-domain-input-core.js
 *
 * Per-domain input materialization for Region Intelligence.
 * Produces domain leaves under domain-inputs/{domain}/ for the four
 * canonical domains: metrics, transit, research, land-price.
 *
 * Each domain leaf is an immutable, hash-addressed artifact. Missing values
 * stay null; blocked/ambiguous inputs are quarantined, never coerced.
 *
 * CommonJS. Pure functions; no filesystem access.
 */
"use strict";

const runState = require("./region-run-state-core.js");

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DOMAINS = ["metrics", "transit", "research", "land-price"];
const DOMAIN_SET = new Set(DOMAINS);

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

function assertDomain(domain) {
  if (!DOMAIN_SET.has(domain)) {
    throw new Error(`Invalid domain "${domain}". Must be one of: ${DOMAINS.join(", ")}`);
  }
}

/**
 * Validate a region_key against the 83-region manifest.
 * Returns true if the key is in the closed set.
 */
function isValidRegionKey(regionKey) {
  if (typeof regionKey !== "string" || regionKey.length === 0) return false;
  return REGION_KEY_SET.has(regionKey);
}

const REGION_KEY_SET = new Set(
  runState.CLOSED_PROVIDER_IDS.length >= 0
    ? require("./region-source-registry-core.js").REGION_TRIPLES.map((t) => t[0])
    : []
);

// ---------------------------------------------------------------------------
// Domain leaf builders
// ---------------------------------------------------------------------------

/**
 * Build a metrics domain-input leaf for a single Region.
 *
 * @param {object} params
 * @param {string} params.region_key
 * @param {string} params.period - "YYYY-MM"
 * @param {object|null} params.households - normalized MOIS row or null
 * @param {object|null} params.market - normalized R-ONE row or null
 * @param {object|null} params.stock - aggregated stock row or null
 * @param {object|null} params.supply - aggregated supply row or null
 * @param {string} params.status - "normalized"|"blocked_schema"|"blocked_coverage"
 * @returns {object} domain leaf document
 */
function buildMetricsLeaf(params) {
  const { region_key, period, households, market, stock, supply, status } = params;
  if (!isValidRegionKey(region_key)) {
    throw new Error(`region_key not in 83-region manifest: "${region_key}"`);
  }
  return {
    domain: "metrics",
    region_key,
    period,
    households: households || null,
    market: market || null,
    stock: stock || null,
    supply: supply || null,
    status: status || "normalized",
  };
}

/**
 * Build a transit domain-input leaf for a single Region.
 *
 * @param {object} params
 * @param {string} params.region_key
 * @param {Array} params.stations - accepted station rows
 * @param {string} params.status
 */
function buildTransitLeaf(params) {
  const { region_key, stations, status } = params;
  if (!isValidRegionKey(region_key)) {
    throw new Error(`region_key not in 83-region manifest: "${region_key}"`);
  }
  return {
    domain: "transit",
    region_key,
    stations: Array.isArray(stations) ? stations : [],
    status: status || "normalized",
  };
}

/**
 * Build a research domain-input leaf for a single Region.
 *
 * @param {object} params
 * @param {string} params.region_key
 * @param {Array} params.comparables - exact comparable rows
 * @param {string} params.status
 */
function buildResearchLeaf(params) {
  const { region_key, comparables, status } = params;
  if (!isValidRegionKey(region_key)) {
    throw new Error(`region_key not in 83-region manifest: "${region_key}"`);
  }
  return {
    domain: "research",
    region_key,
    comparables: Array.isArray(comparables) ? comparables : [],
    status: status || "normalized",
  };
}

/**
 * Build a land-price domain-input leaf for a single Region.
 *
 * @param {object} params
 * @param {string} params.region_key
 * @param {Array} params.parcels - parcel price rows
 * @param {string} params.status
 */
function buildLandPriceLeaf(params) {
  const { region_key, parcels, status } = params;
  if (!isValidRegionKey(region_key)) {
    throw new Error(`region_key not in 83-region manifest: "${region_key}"`);
  }
  return {
    domain: "land-price",
    region_key,
    parcels: Array.isArray(parcels) ? parcels : [],
    status: status || "normalized",
  };
}

// ---------------------------------------------------------------------------
// Materialization
// ---------------------------------------------------------------------------

/**
 * Materialize all domain leaves for a generation.
 * Returns a map: domain -> { filename, content } ready for the cache writer.
 *
 * @param {object} params
 * @param {string} params.region_key
 * @param {string} params.period
 * @param {object} [params.metricsData]
 * @param {object} [params.transitData]
 * @param {object} [params.researchData]
 * @param {object} [params.landPriceData]
 * @returns {object} { [domain]: { filename, content } }
 */
function materializeDomainInputs(params) {
  const { region_key, period } = params;
  const result = {};

  if (params.metricsData) {
    const leaf = buildMetricsLeaf({ region_key, period, ...params.metricsData });
    result.metrics = {
      filename: `${region_key}.json`,
      content: leaf,
    };
  }

  if (params.transitData) {
    const leaf = buildTransitLeaf({ region_key, ...params.transitData });
    result.transit = {
      filename: `${region_key}.json`,
      content: leaf,
    };
  }

  if (params.researchData) {
    const leaf = buildResearchLeaf({ region_key, ...params.researchData });
    result.research = {
      filename: `${region_key}.json`,
      content: leaf,
    };
  }

  if (params.landPriceData) {
    const leaf = buildLandPriceLeaf({ region_key, ...params.landPriceData });
    result["land-price"] = {
      filename: `${region_key}.json`,
      content: leaf,
    };
  }

  return result;
}

/**
 * Schema quarantine: if a domain leaf fails schema validation, wrap it in
 * a quarantine envelope instead of writing it as a valid leaf.
 */
function quarantineLeaf(domain, regionKey, reason, rawContent) {
  assertDomain(domain);
  return {
    domain,
    region_key: regionKey,
    quarantined: true,
    reason,
    raw_content: rawContent,
  };
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

module.exports = {
  DOMAINS,
  DOMAIN_SET,
  REGION_KEY_SET,
  assertDomain,
  isValidRegionKey,
  buildMetricsLeaf,
  buildTransitLeaf,
  buildResearchLeaf,
  buildLandPriceLeaf,
  materializeDomainInputs,
  quarantineLeaf,
};
