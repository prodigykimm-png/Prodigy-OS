/**
 * test_region_domain_inputs.js
 *
 * Tests for region-domain-input-core.js:
 * - Domain leaf materialization for metrics/transit/research/land-price
 * - Schema quarantine wraps invalid leaves
 * - Missing values stay null
 * - region_key must be in the 83-region manifest
 */
"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const path = require("path");

const VAULT_ROOT = path.resolve(__dirname, "..", "..", "..", "..", "..", "..");
const core = require(path.join(VAULT_ROOT, "SYSTEM", "SCRIPTS", "region-domain-input-core.js"));

const VALID_REGION = "부산광역시-사하구"; // in the 83-region manifest

describe("region-domain-input-core", () => {
  describe("domain set", () => {
    it("exposes exactly the four canonical domains", () => {
      assert.deepEqual(core.DOMAINS, ["metrics", "transit", "research", "land-price"]);
    });

    it("assertDomain rejects unknown domains", () => {
      assert.throws(() => core.assertDomain("universal"), /Invalid domain/);
      assert.doesNotThrow(() => core.assertDomain("metrics"));
    });
  });

  describe("region_key validation", () => {
    it("accepts a manifest region_key", () => {
      assert.equal(core.isValidRegionKey(VALID_REGION), true);
    });

    it("rejects unknown region_key", () => {
      assert.equal(core.isValidRegionKey("부산광역시-없는구"), false);
      assert.equal(core.isValidRegionKey(""), false);
    });
  });

  describe("buildMetricsLeaf", () => {
    it("materializes a metrics leaf with null for missing sources", () => {
      const leaf = core.buildMetricsLeaf({
        region_key: VALID_REGION,
        period: "2026-05",
        households: { households: 12345 },
        market: null,
        stock: null,
        supply: null,
        status: "normalized",
      });
      assert.equal(leaf.domain, "metrics");
      assert.equal(leaf.region_key, VALID_REGION);
      assert.deepEqual(leaf.households, { households: 12345 });
      assert.equal(leaf.market, null);
      assert.equal(leaf.stock, null);
      assert.equal(leaf.supply, null);
    });

    it("rejects an invalid region_key", () => {
      assert.throws(
        () => core.buildMetricsLeaf({ region_key: "nope", period: "2026-05" }),
        /not in 83-region manifest/
      );
    });
  });

  describe("materializeDomainInputs", () => {
    it("produces leaves only for provided domains", () => {
      const result = core.materializeDomainInputs({
        region_key: VALID_REGION,
        period: "2026-05",
        metricsData: { households: null, market: null, stock: null, supply: null },
        transitData: { stations: [] },
      });
      assert.ok(result.metrics);
      assert.ok(result.transit);
      assert.equal(result.research, undefined);
      assert.equal(result["land-price"], undefined);
      assert.equal(result.metrics.filename, `${VALID_REGION}.json`);
      assert.equal(result.metrics.content.domain, "metrics");
      assert.equal(result.transit.content.domain, "transit");
    });

    it("materializes all four domains when provided", () => {
      const result = core.materializeDomainInputs({
        region_key: VALID_REGION,
        period: "2026-05",
        metricsData: {},
        transitData: {},
        researchData: {},
        landPriceData: {},
      });
      assert.deepEqual(Object.keys(result).sort(), ["land-price", "metrics", "research", "transit"]);
    });
  });

  describe("schema quarantine", () => {
    it("wraps an invalid leaf in a quarantine envelope", () => {
      const q = core.quarantineLeaf("metrics", VALID_REGION, "schema_mismatch", { bad: true });
      assert.equal(q.quarantined, true);
      assert.equal(q.domain, "metrics");
      assert.equal(q.reason, "schema_mismatch");
      assert.deepEqual(q.raw_content, { bad: true });
    });

    it("rejects quarantine for unknown domain", () => {
      assert.throws(() => core.quarantineLeaf("universal", VALID_REGION, "x", {}), /Invalid domain/);
    });
  });
});
