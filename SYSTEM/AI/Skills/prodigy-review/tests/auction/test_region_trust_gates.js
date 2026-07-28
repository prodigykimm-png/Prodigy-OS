/**
 * test_region_trust_gates.js
 *
 * Tests for region-trust-core.js:
 * - Four INDEPENDENT trust fields (freshness, verification, coverage, schema)
 * - Never aggregated into one opaque score
 * - Stale / mixed / stale-owner rejection cases
 */
"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const path = require("path");

const VAULT_ROOT = path.resolve(__dirname, "..", "..", "..", "..", "..", "..");
const core = require(path.join(VAULT_ROOT, "SYSTEM", "SCRIPTS", "region-trust-core.js"));

const DAY = 24 * 60 * 60 * 1000;

describe("region-trust-core", () => {
  describe("evaluateFreshness", () => {
    it("passes when within max age", () => {
      const r = core.evaluateFreshness({
        fetched_at: "2026-07-01T00:00:00Z",
        as_of: "2026-07-10T00:00:00Z",
        max_age_ms: 30 * DAY,
      });
      assert.equal(r.field, "freshness");
      assert.equal(r.ok, true);
      assert.equal(r.age_ms, 9 * DAY);
    });

    it("fails when stale", () => {
      const r = core.evaluateFreshness({
        fetched_at: "2026-01-01T00:00:00Z",
        as_of: "2026-07-01T00:00:00Z",
        max_age_ms: 30 * DAY,
      });
      assert.equal(r.ok, false);
      assert.equal(r.reason, "stale");
    });

    it("rejects future-dated evidence", () => {
      const r = core.evaluateFreshness({
        fetched_at: "2026-08-01T00:00:00Z",
        as_of: "2026-07-01T00:00:00Z",
        max_age_ms: 30 * DAY,
      });
      assert.equal(r.ok, false);
      assert.equal(r.reason, "future_dated");
    });
  });

  describe("evaluateVerification", () => {
    it("passes with human confirmation + approver + timestamp", () => {
      const r = core.evaluateVerification({
        human_confirmed: true,
        approver: "prodigy",
        confirmed_at: "2026-07-01T00:00:00Z",
      });
      assert.equal(r.field, "verification");
      assert.equal(r.ok, true);
    });

    it("fails when not confirmed", () => {
      const r = core.evaluateVerification({ human_confirmed: false, approver: null, confirmed_at: null });
      assert.equal(r.ok, false);
      assert.equal(r.reason, "not_confirmed");
    });

    it("rejects a stale owner even if confirmed", () => {
      const r = core.evaluateVerification({
        human_confirmed: true,
        approver: "prodigy",
        confirmed_at: "2026-07-01T00:00:00Z",
        owner_stale: true,
      });
      assert.equal(r.ok, false);
      assert.equal(r.reason, "stale_owner");
    });

    it("fails with missing approver", () => {
      const r = core.evaluateVerification({ human_confirmed: true, approver: "", confirmed_at: "2026-07-01T00:00:00Z" });
      assert.equal(r.ok, false);
      assert.equal(r.reason, "missing_approver");
    });
  });

  describe("evaluateCoverage", () => {
    it("passes when all codes matched and none quarantined", () => {
      const r = core.evaluateCoverage({ matched_codes: 83, total_codes: 83, quarantined_codes: 0 });
      assert.equal(r.field, "coverage");
      assert.equal(r.ok, true);
      assert.equal(r.ratio, 1);
    });

    it("fails when codes are quarantined", () => {
      const r = core.evaluateCoverage({ matched_codes: 80, total_codes: 83, quarantined_codes: 3 });
      assert.equal(r.ok, false);
      assert.equal(r.reason, "quarantined_codes");
    });

    it("fails when codes are unmatched", () => {
      const r = core.evaluateCoverage({ matched_codes: 80, total_codes: 83, quarantined_codes: 0 });
      assert.equal(r.ok, false);
      assert.equal(r.reason, "unmatched_codes");
    });

    it("fails with no codes", () => {
      const r = core.evaluateCoverage({ matched_codes: 0, total_codes: 0 });
      assert.equal(r.ok, false);
      assert.equal(r.reason, "no_codes");
    });
  });

  describe("evaluateSchema", () => {
    it("passes on exact parser version match", () => {
      const r = core.evaluateSchema({ parser_version: "1.0.0", registry_parser_version: "1.0.0" });
      assert.equal(r.field, "schema");
      assert.equal(r.ok, true);
    });

    it("fails on parser version mismatch", () => {
      const r = core.evaluateSchema({ parser_version: "0.9.0", registry_parser_version: "1.0.0" });
      assert.equal(r.ok, false);
      assert.equal(r.reason, "parser_version_mismatch");
    });
  });

  describe("buildTrustReport (no opaque score)", () => {
    function field(name, ok) {
      return { field: name, ok, reason: ok ? null : "x" };
    }

    it("reports all four fields independently", () => {
      const report = core.buildTrustReport({
        freshness: field("freshness", true),
        verification: field("verification", true),
        coverage: field("coverage", true),
        schema: field("schema", true),
      });
      assert.equal(report.freshness.ok, true);
      assert.equal(report.verification.ok, true);
      assert.equal(report.coverage.ok, true);
      assert.equal(report.schema.ok, true);
      assert.equal(report.all_ok, true);
    });

    it("mixed: stale freshness does not hide behind green composite", () => {
      const report = core.buildTrustReport({
        freshness: field("freshness", false), // stale
        verification: field("verification", true),
        coverage: field("coverage", true),
        schema: field("schema", true),
      });
      assert.equal(report.freshness.ok, false);
      assert.equal(report.all_ok, false);
      // The individual stale field is still visible, not masked.
      assert.equal(report.verification.ok, true);
    });

    it("never contains an aggregated numeric score field", () => {
      const report = core.buildTrustReport({
        freshness: field("freshness", true),
        verification: field("verification", true),
        coverage: field("coverage", true),
        schema: field("schema", true),
      });
      assert.doesNotThrow(() => core.assertNoAggregateScore(report));
      for (const forbidden of ["score", "trust_score", "composite", "aggregate", "overall_score"]) {
        assert.equal(Object.prototype.hasOwnProperty.call(report, forbidden), false);
      }
    });

    it("rejects a report missing a required field", () => {
      assert.throws(
        () => core.buildTrustReport({
          freshness: field("freshness", true),
          verification: field("verification", true),
          coverage: field("coverage", true),
          // schema missing
        }),
        /requires a "schema"/
      );
    });

    it("assertNoAggregateScore throws on an injected score", () => {
      assert.throws(() => core.assertNoAggregateScore({ score: 0.9 }), /aggregated field "score"/);
    });
  });
});
