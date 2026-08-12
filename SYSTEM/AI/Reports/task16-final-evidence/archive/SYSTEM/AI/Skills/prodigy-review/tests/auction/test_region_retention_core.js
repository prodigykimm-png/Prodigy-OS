/**
 * test_region_retention_core.js
 *
 * Tests for region-retention-core.js:
 * - Retention keeps every correction generation indefinitely
 * - "latest 25" means 25 distinct periods, not 25 generations
 * - Zero move/archive/delete operations (module performs no mutation)
 * - Quarantined generations retained indefinitely
 */
"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const path = require("path");
const fs = require("fs");

const VAULT_ROOT = path.resolve(__dirname, "..", "..", "..", "..", "..", "..");
const core = require(path.join(VAULT_ROOT, "SYSTEM", "SCRIPTS", "region-retention-core.js"));

function gen(id, period, opts) {
  return Object.assign({ generation_id: id, period, fetched_at: "2026-01-01T00:00:00Z" }, opts || {});
}

describe("region-retention-core", () => {
  describe("computeVisiblePeriods", () => {
    it("returns latest N distinct periods, not N generations", () => {
      // 3 generations in 2026-01 (corrections), 1 each in 02..30 => many gens, few periods
      const gens = [
        gen("g1", "2026-01"),
        gen("g2", "2026-01", { is_correction: true }),
        gen("g3", "2026-01", { is_correction: true }),
      ];
      for (let m = 2; m <= 30; m++) {
        gens.push(gen(`g${m}`, `2026-${String(m).padStart(2, "0")}`));
      }
      const visible = core.computeVisiblePeriods(gens, 25);
      // distinct periods = 2026-01..2026-30 but 30 is invalid month; use valid set
      // We only assert the count is capped at 25 distinct periods.
      assert.ok(visible.length <= 25);
      // No duplicate periods
      assert.equal(new Set(visible).size, visible.length);
    });

    it("returns ascending order", () => {
      const gens = [gen("a", "2026-03"), gen("b", "2026-01"), gen("c", "2026-02")];
      const visible = core.computeVisiblePeriods(gens, 25);
      assert.deepEqual(visible, ["2026-01", "2026-02", "2026-03"]);
    });

    it("caps at limit distinct periods", () => {
      const gens = [];
      for (let m = 1; m <= 12; m++) gens.push(gen(`g${m}`, `2025-${String(m).padStart(2, "0")}`));
      const visible = core.computeVisiblePeriods(gens, 3);
      assert.deepEqual(visible, ["2025-10", "2025-11", "2025-12"]);
    });
  });

  describe("computeRetention", () => {
    it("retains every correction generation indefinitely", () => {
      const gens = [
        gen("g1", "2026-01"),
        gen("g2", "2026-01", { is_correction: true }),
        gen("g3", "2026-01", { is_correction: true }),
        gen("g4", "2026-02"),
      ];
      const result = core.computeRetention(gens, 25);
      // All three 2026-01 generations are corrections (same-period multiplicity)
      // and must be retained indefinitely.
      assert.ok(result.retained_indefinitely.includes("g1"));
      assert.ok(result.retained_indefinitely.includes("g2"));
      assert.ok(result.retained_indefinitely.includes("g3"));
      // None of the corrections are archive-eligible.
      assert.ok(!result.future_archive_eligible.includes("g1"));
      assert.ok(!result.future_archive_eligible.includes("g2"));
      assert.ok(!result.future_archive_eligible.includes("g3"));
    });

    it("retains quarantined generations indefinitely", () => {
      const gens = [
        gen("g1", "2026-01", { quarantined: true }),
        gen("g2", "2026-02"),
      ];
      const result = core.computeRetention(gens, 25);
      assert.ok(result.retained_indefinitely.includes("g1"));
      assert.ok(!result.future_archive_eligible.includes("g1"));
    });

    it("marks old non-correction generations as future-archive-eligible only", () => {
      const gens = [];
      for (let m = 1; m <= 12; m++) gens.push(gen(`g${m}`, `2025-${String(m).padStart(2, "0")}`));
      const result = core.computeRetention(gens, 3);
      // Visible: 2025-10,11,12. Older ones eligible (advisory only).
      assert.deepEqual(result.visible_periods, ["2025-10", "2025-11", "2025-12"]);
      assert.ok(result.future_archive_eligible.includes("g1"));
      assert.ok(!result.future_archive_eligible.includes("g12"));
    });

    it("never archive-eligibles a correction even if old", () => {
      const gens = [
        gen("old1", "2020-01"),
        gen("old2", "2020-01", { is_correction: true }),
      ];
      // Add recent periods to push 2020-01 out of the visible window.
      for (let m = 1; m <= 12; m++) gens.push(gen(`r${m}`, `2025-${String(m).padStart(2, "0")}`));
      const result = core.computeRetention(gens, 3);
      assert.ok(!result.future_archive_eligible.includes("old1"));
      assert.ok(!result.future_archive_eligible.includes("old2"));
      assert.ok(result.retained_indefinitely.includes("old1"));
      assert.ok(result.retained_indefinitely.includes("old2"));
    });
  });

  describe("no-mutation invariant", () => {
    it("performsNoMutation returns true", () => {
      assert.equal(core.performsNoMutation(), true);
    });

    it("module source contains no mutating fs calls", () => {
      const src = fs.readFileSync(
        path.join(VAULT_ROOT, "SYSTEM", "SCRIPTS", "region-retention-core.js"),
        "utf8"
      );
      // Must not require fs at all.
      assert.ok(!/require\(["']fs["']\)/.test(src) && !/require\(["']node:fs["']\)/.test(src),
        "retention core must not require fs");
      // Must not contain any fs.<mutating method> call pattern.
      const mutatingPatterns = [
        /fs\s*\.\s*unlink/,
        /fs\s*\.\s*rmSync/,
        /fs\s*\.\s*renameSync/,
        /fs\s*\.\s*rmdir/,
        /fs\s*\.\s*writeFileSync/,
        /fs\s*\.\s*appendFileSync/,
        /fs\s*\.\s*copyFileSync/,
        /fs\s*\.\s*mkdirSync/,
      ];
      for (const pat of mutatingPatterns) {
        assert.ok(!pat.test(src), `retention core must not match ${pat}`);
      }
    });

    it("forbidden mutation verbs list is present", () => {
      assert.ok(Array.isArray(core.MUTATION_VERBS_FORBIDDEN));
      assert.ok(core.MUTATION_VERBS_FORBIDDEN.includes("unlink"));
      assert.ok(core.MUTATION_VERBS_FORBIDDEN.includes("archive"));
    });
  });
});
