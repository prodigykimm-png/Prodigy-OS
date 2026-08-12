/**
 * test_region_snapshot_diff.js
 *
 * Tests for region-snapshot-diff.js:
 * - Same-period correction compares against prior accepted same-period generation
 * - New period compares against greatest accepted earlier period
 * - Raw-changed / normalized-equal => unchanged with raw_revision:true
 * - Missing baseline is NOT "no change"
 */
"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const path = require("path");

const VAULT_ROOT = path.resolve(__dirname, "..", "..", "..", "..", "..", "..");
const core = require(path.join(VAULT_ROOT, "SYSTEM", "SCRIPTS", "region-snapshot-diff.js"));

function acceptedGen(id, period, opts) {
  return Object.assign(
    { generation_id: id, period, accepted: true, fetched_at: "2026-01-01T00:00:00Z" },
    opts || {}
  );
}

describe("region-snapshot-diff", () => {
  describe("selectBaseline", () => {
    it("selects prior accepted same-period generation for a correction", () => {
      const accepted = [
        acceptedGen("jan-v1", "2026-01", { fetched_at: "2026-01-05T00:00:00Z" }),
        acceptedGen("jan-v2", "2026-01", { fetched_at: "2026-01-20T00:00:00Z" }),
        acceptedGen("feb-v1", "2026-02", { fetched_at: "2026-02-05T00:00:00Z" }),
      ];
      const candidate = { generation_id: "jan-v3", period: "2026-01" };
      const { kind, baseline } = core.selectBaseline(candidate, accepted);
      assert.equal(kind, "same_period_correction");
      // Greatest accepted same-period = latest fetched = jan-v2
      assert.equal(baseline.generation_id, "jan-v2");
    });

    it("selects greatest accepted earlier period for a new period", () => {
      const accepted = [
        acceptedGen("jan-v1", "2026-01"),
        acceptedGen("feb-v1", "2026-02"),
        acceptedGen("mar-v1", "2026-03"),
      ];
      const candidate = { generation_id: "apr-v1", period: "2026-04" };
      const { kind, baseline } = core.selectBaseline(candidate, accepted);
      assert.equal(kind, "earlier_period");
      assert.equal(baseline.generation_id, "mar-v1");
    });

    it("returns missing when no accepted baseline exists", () => {
      const candidate = { generation_id: "jan-v1", period: "2026-01" };
      const { kind, baseline } = core.selectBaseline(candidate, []);
      assert.equal(kind, "missing");
      assert.equal(baseline, null);
    });

    it("ignores non-accepted generations", () => {
      const accepted = [
        { generation_id: "jan-draft", period: "2026-01", accepted: false },
      ];
      const candidate = { generation_id: "feb-v1", period: "2026-02" };
      const { kind } = core.selectBaseline(candidate, accepted);
      assert.equal(kind, "missing");
    });
  });

  describe("diffSnapshots", () => {
    const rows = (arr) => arr;

    it("reports missing baseline as no_baseline, not 'no change'", () => {
      const diff = core.diffSnapshots({
        current: [{ household_code: "2611000000", households: 100 }],
        baseline: null,
        keyField: "household_code",
        currentRawHash: "a".repeat(64),
        baselineRawHash: null,
        currentNormalizedHash: "b".repeat(64),
        baselineNormalizedHash: null,
      });
      assert.equal(diff.baseline, "missing");
      assert.equal(diff.status, "no_baseline");
      assert.equal(diff.raw_changed, true);
      assert.equal(diff.normalized_equal, false);
    });

    it("raw-changed / normalized-equal => unchanged with raw_revision:true", () => {
      const cur = [{ household_code: "2611000000", households: 100 }];
      const base = [{ household_code: "2611000000", households: 100 }];
      const normHash = "c".repeat(64);
      const diff = core.diffSnapshots({
        current: cur,
        baseline: base,
        keyField: "household_code",
        currentRawHash: "a".repeat(64),
        baselineRawHash: "d".repeat(64), // raw differs
        currentNormalizedHash: normHash,
        baselineNormalizedHash: normHash, // normalized equal
      });
      assert.equal(diff.status, "unchanged");
      assert.equal(diff.raw_revision, true);
      assert.equal(diff.raw_changed, true);
      assert.equal(diff.normalized_equal, true);
    });

    it("detects added / removed / changed rows", () => {
      const base = [
        { household_code: "A", households: 10 },
        { household_code: "B", households: 20 },
      ];
      const cur = [
        { household_code: "B", households: 25 }, // changed
        { household_code: "C", households: 30 }, // added
      ];
      const diff = core.diffSnapshots({
        current: cur,
        baseline: base,
        keyField: "household_code",
        currentRawHash: "a".repeat(64),
        baselineRawHash: "b".repeat(64),
        currentNormalizedHash: "c".repeat(64),
        baselineNormalizedHash: "d".repeat(64),
      });
      assert.equal(diff.status, "changed");
      assert.equal(diff.added, 1);
      assert.equal(diff.removed, 1);
      assert.equal(diff.changed, 1);
    });

    it("treats null vs number as a real change (no zero coercion)", () => {
      const base = [{ household_code: "A", households: null }];
      const cur = [{ household_code: "A", households: 0 }];
      const diff = core.diffSnapshots({
        current: cur,
        baseline: base,
        keyField: "household_code",
        currentRawHash: "a".repeat(64),
        baselineRawHash: "b".repeat(64),
        currentNormalizedHash: "c".repeat(64),
        baselineNormalizedHash: "d".repeat(64),
      });
      assert.equal(diff.changed, 1);
      const change = diff.changes.find((c) => c.key === "A");
      const field = change.fields.find((f) => f.field === "households");
      assert.equal(field.baseline, null);
      assert.equal(field.current, 0);
    });
  });

  describe("diffGeneration (end-to-end baseline selection + diff)", () => {
    it("January -> February -> corrected January preserves both histories", () => {
      const janRows = [{ household_code: "A", households: 100 }];
      const febRows = [{ household_code: "A", households: 110 }];
      const janCorrRows = [{ household_code: "A", households: 105 }];

      const accepted = [
        {
          generation_id: "jan-v1",
          period: "2026-01",
          accepted: true,
          fetched_at: "2026-01-05T00:00:00Z",
          rows: janRows,
          raw_hash: "1".repeat(64),
          normalized_hash: "2".repeat(64),
        },
        {
          generation_id: "feb-v1",
          period: "2026-02",
          accepted: true,
          fetched_at: "2026-02-05T00:00:00Z",
          rows: febRows,
          raw_hash: "3".repeat(64),
          normalized_hash: "4".repeat(64),
        },
      ];

      // Corrected January compares against prior accepted same-period (jan-v1),
      // NOT against February.
      const result = core.diffGeneration({
        candidate: { generation_id: "jan-v2", period: "2026-01" },
        accepted,
        currentRows: janCorrRows,
        keyField: "household_code",
        currentRawHash: "5".repeat(64),
        currentNormalizedHash: "6".repeat(64),
      });

      assert.equal(result.baseline_kind, "same_period_correction");
      assert.equal(result.baseline_generation, "jan-v1");
      assert.equal(result.diff.status, "changed");
      const change = result.diff.changes.find((c) => c.key === "A");
      const field = change.fields.find((f) => f.field === "households");
      assert.equal(field.baseline, 100); // from jan-v1, not feb's 110
      assert.equal(field.current, 105);
    });
  });
});
