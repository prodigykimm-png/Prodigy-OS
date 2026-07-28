/**
 * test_region_metrics_bundle.js
 *
 * Tests for region-metrics-bundle-core.js:
 * - Bundle join across MOIS / R-ONE / stock / supply
 * - Missing values stay null (never coerced to zero)
 * - Exact code matching against the 83-region manifest
 */
"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const path = require("path");

const VAULT_ROOT = path.resolve(__dirname, "..", "..", "..", "..", "..", "..");
const core = require(path.join(VAULT_ROOT, "SYSTEM", "SCRIPTS", "region-metrics-bundle-core.js"));

// 부산광역시-사하구: lawd 26380000, household 2638000000, sigungu5 26380
const REGION = "부산광역시-사하구";
const HOUSEHOLD_CODE = "2638000000";
const SIGUNGU5 = "26380";

describe("region-metrics-bundle-core", () => {
  describe("buildRegionIndex", () => {
    it("indexes all 83 regions by household/lawd/region_key", () => {
      const idx = core.buildRegionIndex();
      assert.equal(idx.byRegionKey.size, 83);
      assert.equal(idx.byHouseholdCode.size, 83);
      assert.equal(idx.byLawdCode.size, 83);
      const rec = idx.byRegionKey.get(REGION);
      assert.equal(rec.household_code, HOUSEHOLD_CODE);
      assert.equal(rec.lawd_code, "26380000");
    });
  });

  describe("buildMetricsBundle", () => {
    it("joins MOIS + R-ONE + stock + supply into one bundle", () => {
      const bundle = core.buildMetricsBundle({
        region_key: REGION,
        period: "2026-05",
        moisRows: [
          { household_code: HOUSEHOLD_CODE, households: 130000, total_population: 300000, pop_per_household: 2.3, male_population: 150000, female_population: 150000, sex_ratio: 100 },
        ],
        roneRows: [
          { sigungu_code: SIGUNGU5, price_index: 102.5, transaction_volume: 450, jeonse_ratio: 68.2 },
        ],
        stockRows: [
          { region_key: REGION, address_sigungu: REGION, units: 5000 },
          { region_key: REGION, address_sigungu: REGION, units: 3000 },
        ],
        supplyRows: [
          { region_key: REGION, address: REGION, units: 1200 },
        ],
      });
      assert.equal(bundle.region_key, REGION);
      assert.equal(bundle.households, 130000);
      assert.equal(bundle.price_index, 102.5);
      assert.equal(bundle.jeonse_ratio, 68.2);
      assert.equal(bundle.apartment_stock_units, 8000); // summed
      assert.equal(bundle.supply_units, 1200);
      assert.equal(bundle.sources.mois, "matched");
      assert.equal(bundle.sources.rone, "matched");
      assert.equal(bundle.sources.stock, "matched");
      assert.equal(bundle.sources.supply, "matched");
    });

    it("keeps missing source slots null, never zero", () => {
      const bundle = core.buildMetricsBundle({
        region_key: REGION,
        period: "2026-05",
        moisRows: [], // no MOIS match
        roneRows: [],
        stockRows: [],
        supplyRows: [],
      });
      assert.equal(bundle.households, null);
      assert.equal(bundle.total_population, null);
      assert.equal(bundle.price_index, null);
      assert.equal(bundle.jeonse_ratio, null);
      assert.equal(bundle.apartment_stock_units, null);
      assert.equal(bundle.supply_units, null);
      assert.equal(bundle.sources.mois, "missing");
      assert.equal(bundle.sources.rone, "missing");
      assert.equal(bundle.sources.stock, "missing");
      assert.equal(bundle.sources.supply, "missing");
    });

    it("does not match a different region's codes", () => {
      const bundle = core.buildMetricsBundle({
        region_key: REGION,
        period: "2026-05",
        moisRows: [
          { household_code: "1111000000", households: 999999 }, // 서울 종로구, not 사하구
        ],
        roneRows: [
          { sigungu_code: "11110", price_index: 200 }, // wrong sigungu
        ],
      });
      assert.equal(bundle.households, null);
      assert.equal(bundle.price_index, null);
    });

    it("preserves a genuine zero value (not coerced from missing)", () => {
      const bundle = core.buildMetricsBundle({
        region_key: REGION,
        period: "2026-05",
        moisRows: [
          { household_code: HOUSEHOLD_CODE, households: 0, total_population: null },
        ],
      });
      // A real 0 stays 0; a missing field stays null.
      assert.equal(bundle.households, 0);
      assert.equal(bundle.total_population, null);
    });

    it("rejects an invalid region_key", () => {
      assert.throws(
        () => core.buildMetricsBundle({ region_key: "nope", period: "2026-05" }),
        /not in 83-region manifest/
      );
    });
  });

  describe("matchByField", () => {
    it("returns null for no match", () => {
      assert.equal(core.matchByField([{ a: 1 }], "a", 2), null);
      assert.equal(core.matchByField(null, "a", 1), null);
    });
  });
});
