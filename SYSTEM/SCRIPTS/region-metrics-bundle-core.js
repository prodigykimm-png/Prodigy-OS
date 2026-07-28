/**
 * region-metrics-bundle-core.js
 *
 * Metrics bundle join for Region Intelligence.
 * Combines normalized MOIS (households/population), R-ONE (market),
 * reb_stock (apartment stock), and reb_supply (move-in supply) into a single
 * unified metrics bundle per Region.
 *
 * Hard rules:
 *   - Missing values stay null; they are NEVER coerced to zero.
 *   - A bundle is keyed by exact region_key (NFC) from the 83-region manifest.
 *   - Join is by exact code match; unmatched sources leave their slot null.
 *
 * CommonJS. Pure functions; no filesystem access.
 */
"use strict";

const domainCore = require("./region-domain-input-core.js");

// ---------------------------------------------------------------------------
// Code mapping helpers
// ---------------------------------------------------------------------------

/**
 * Build lookup maps from the 83-region manifest triples.
 * Returns { byHouseholdCode, byLawdCode, byRegionKey }.
 */
function buildRegionIndex() {
  const triples = require("./region-source-registry-core.js").REGION_TRIPLES;
  const byHouseholdCode = new Map();
  const byLawdCode = new Map();
  const byRegionKey = new Map();
  for (const [regionKey, lawdCode, householdCode] of triples) {
    const rec = { region_key: regionKey, lawd_code: lawdCode, household_code: householdCode };
    byHouseholdCode.set(householdCode, rec);
    byLawdCode.set(lawdCode, rec);
    byRegionKey.set(regionKey, rec);
  }
  return { byHouseholdCode, byLawdCode, byRegionKey };
}

// ---------------------------------------------------------------------------
// Bundle join
// ---------------------------------------------------------------------------

/**
 * Build a unified metrics bundle for one Region.
 *
 * @param {object} params
 * @param {string} params.region_key - exact NFC region key
 * @param {string} params.period - "YYYY-MM"
 * @param {Array} [params.moisRows] - normalized MOIS rows (household_code keyed)
 * @param {Array} [params.roneRows] - normalized R-ONE rows (sigungu_code keyed)
 * @param {Array} [params.stockRows] - normalized stock rows (address_sigungu)
 * @param {Array} [params.supplyRows] - normalized supply rows (address)
 * @returns {object} unified bundle
 */
function buildMetricsBundle(params) {
  const { region_key, period } = params;
  if (!domainCore.isValidRegionKey(region_key)) {
    throw new Error(`region_key not in 83-region manifest: "${region_key}"`);
  }
  const idx = buildRegionIndex();
  const rec = idx.byRegionKey.get(region_key);

  const mois = matchByField(params.moisRows, "household_code", rec.household_code);
  // R-ONE uses 5-digit sigungu code = first 5 of lawd_code.
  const sigungu5 = rec.lawd_code.slice(0, 5);
  const rone = matchByField(params.roneRows, "sigungu_code", sigungu5);

  const stock = aggregateStock(params.stockRows, region_key);
  const supply = aggregateSupply(params.supplyRows, region_key);

  return {
    region_key,
    period,
    lawd_code: rec.lawd_code,
    household_code: rec.household_code,
    households: mois ? mois.households : null,
    total_population: mois ? mois.total_population : null,
    pop_per_household: mois ? mois.pop_per_household : null,
    male_population: mois ? mois.male_population : null,
    female_population: mois ? mois.female_population : null,
    sex_ratio: mois ? mois.sex_ratio : null,
    price_index: rone ? rone.price_index : null,
    transaction_volume: rone ? rone.transaction_volume : null,
    jeonse_ratio: rone ? rone.jeonse_ratio : null,
    apartment_stock_units: stock,
    supply_units: supply,
    sources: {
      mois: mois ? "matched" : "missing",
      rone: rone ? "matched" : "missing",
      stock: stock === null ? "missing" : "matched",
      supply: supply === null ? "missing" : "matched",
    },
  };
}

/**
 * Match a single row by an exact field value. Returns the row or null.
 * Missing => null (never zero).
 */
function matchByField(rows, field, value) {
  if (!Array.isArray(rows)) return null;
  for (const r of rows) {
    if (r[field] === value) return r;
  }
  return null;
}

/**
 * Aggregate stock units for a Region. Sums units of rows whose
 * address_sigungu matches the region_key. Returns null if no rows / no units.
 */
function aggregateStock(stockRows, region_key) {
  if (!Array.isArray(stockRows) || stockRows.length === 0) return null;
  let sum = null;
  for (const r of stockRows) {
    if (r.region_key === region_key || r.address_sigungu === region_key) {
      if (typeof r.units === "number" && Number.isFinite(r.units)) {
        sum = (sum === null ? 0 : sum) + r.units;
      }
    }
  }
  return sum;
}

/**
 * Aggregate supply units for a Region. Sums units of rows whose
 * address maps to the region_key. Returns null if no rows / no units.
 */
function aggregateSupply(supplyRows, region_key) {
  if (!Array.isArray(supplyRows) || supplyRows.length === 0) return null;
  let sum = null;
  for (const r of supplyRows) {
    if (r.region_key === region_key || r.address === region_key) {
      if (typeof r.units === "number" && Number.isFinite(r.units)) {
        sum = (sum === null ? 0 : sum) + r.units;
      }
    }
  }
  return sum;
}

/**
 * Build bundles for many Regions. Returns a Map region_key -> bundle.
 */
function buildBundles(regionKeys, params) {
  const out = new Map();
  for (const rk of regionKeys) {
    out.set(rk, buildMetricsBundle({ ...params, region_key: rk }));
  }
  return out;
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

module.exports = {
  buildRegionIndex,
  buildMetricsBundle,
  matchByField,
  aggregateStock,
  aggregateSupply,
  buildBundles,
};
