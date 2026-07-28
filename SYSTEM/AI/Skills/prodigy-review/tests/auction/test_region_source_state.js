/**
 * test_region_source_state.js
 *
 * Tests for region-run-state-core.js:
 * - Deterministic bytes under input permutation
 * - Generation naming format
 * - Provider path rejection (separators, dot segments, unknown IDs)
 * - Lease/budget/selection state structures
 *
 * Uses isolated temp directories. Never touches real SYSTEM/CACHE.
 */
"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const path = require("path");

const VAULT_ROOT = path.resolve(__dirname, "..", "..", "..", "..", "..", "..");
const core = require(path.join(VAULT_ROOT, "SYSTEM", "SCRIPTS", "region-run-state-core.js"));

describe("region-run-state-core", () => {
  describe("generateRunId", () => {
    it("produces lowercase UUIDv4", () => {
      const id = core.generateRunId();
      assert.ok(core.isValidRunId(id), `Expected valid UUIDv4: ${id}`);
      assert.equal(id, id.toLowerCase());
    });

    it("rejects uppercase UUIDs", () => {
      assert.equal(core.isValidRunId("AAAAAAAA-BBBB-4CCC-8DDD-EEEEEEEEEEEE"), false);
    });

    it("rejects non-UUID strings", () => {
      assert.equal(core.isValidRunId("hello"), false);
      assert.equal(core.isValidRunId(""), false);
      assert.equal(core.isValidRunId(null), false);
    });
  });

  describe("generation directory naming", () => {
    it("builds {YYYY-MM}__{compact UTC}__{run_id}", () => {
      const fetchedAt = new Date("2026-05-15T03:22:11Z");
      const runId = "a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d";
      const name = core.buildGenerationDirName("2026-05", fetchedAt, runId);
      assert.equal(name, "2026-05__20260515T032211Z__a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d");
    });

    it("round-trips through parseGenerationDirName", () => {
      const fetchedAt = new Date("2026-01-01T00:00:00Z");
      const runId = "12345678-abcd-4ef0-9012-123456789abc";
      const name = core.buildGenerationDirName("2026-01", fetchedAt, runId);
      const parsed = core.parseGenerationDirName(name);
      assert.equal(parsed.period, "2026-01");
      assert.equal(parsed.fetchedAtCompact, "20260101T000000Z");
      assert.equal(parsed.runId, runId);
    });

    it("rejects invalid period format", () => {
      const runId = core.generateRunId();
      assert.throws(() => core.buildGenerationDirName("2026-13", new Date(), runId), /Invalid period/);
      assert.throws(() => core.buildGenerationDirName("202605", new Date(), runId), /Invalid period/);
    });

    it("rejects invalid run_id", () => {
      assert.throws(
        () => core.buildGenerationDirName("2026-05", new Date(), "not-a-uuid"),
        /Invalid run_id/
      );
    });
  });

  describe("provider path validation", () => {
    it("accepts all 32 closed registry IDs", () => {
      for (const id of core.CLOSED_PROVIDER_IDS) {
        assert.equal(core.validateProviderId(id), id);
      }
    });

    it("rejects path separators", () => {
      assert.throws(() => core.validateProviderId("mois/foo"), /path separator/);
      assert.throws(() => core.validateProviderId("mois\\foo"), /path separator/);
    });

    it("rejects dot segments", () => {
      assert.throws(() => core.validateProviderId("."), /dot segment/);
      assert.throws(() => core.validateProviderId(".."), /dot segment/);
    });

    it("rejects unknown provider IDs", () => {
      assert.throws(() => core.validateProviderId("unknown_provider"), /not in closed registry/);
    });

    it("rejects empty and null", () => {
      assert.throws(() => core.validateProviderId(""), /nonempty/);
      assert.throws(() => core.validateProviderId(null), /nonempty/);
    });
  });

  describe("deterministic canonical JSON", () => {
    it("produces identical bytes regardless of key insertion order", () => {
      const obj1 = { z: 1, a: 2, m: { y: 3, b: 4 } };
      const obj2 = { a: 2, m: { b: 4, y: 3 }, z: 1 };
      const json1 = core.canonicalJSON(obj1);
      const json2 = core.canonicalJSON(obj2);
      assert.equal(json1, json2);
    });

    it("produces identical SHA-256 under permutation", () => {
      const obj1 = { provider: "mois_jumin_statmonth_csv", period: "2026-05", rows: [1, 2] };
      const obj2 = { rows: [1, 2], period: "2026-05", provider: "mois_jumin_statmonth_csv" };
      const h1 = core.sha256hex(Buffer.from(core.canonicalJSON(obj1)));
      const h2 = core.sha256hex(Buffer.from(core.canonicalJSON(obj2)));
      assert.equal(h1, h2);
    });

    it("sorts nested object keys", () => {
      const result = core.sortKeys({ c: { z: 1, a: 2 }, b: [3, { y: 4, x: 5 }] });
      assert.deepEqual(Object.keys(result), ["b", "c"]);
      assert.deepEqual(Object.keys(result.c), ["a", "z"]);
      assert.deepEqual(Object.keys(result.b[1]), ["x", "y"]);
    });
  });

  describe("lease state", () => {
    it("creates a valid lease with fencing tuple", () => {
      const runId = core.generateRunId();
      const nonce = core.generateRunId();
      const lease = core.createLease("mois_jumin_statmonth_csv", runId, "owner-1", 0, nonce);
      assert.equal(lease.provider, "mois_jumin_statmonth_csv");
      assert.equal(lease.run_id, runId);
      assert.equal(lease.owner_token, "owner-1");
      assert.equal(lease.monotonic_generation, 0);
      assert.equal(lease.process_nonce, nonce);
      assert.equal(lease.state, "active");
    });

    it("renews lease extending expiry", () => {
      const runId = core.generateRunId();
      const nonce = core.generateRunId();
      const lease = core.createLease("reb_stock", runId, "owner-2", 1, nonce);
      const renewed = core.renewLease(lease);
      assert.ok(new Date(renewed.expires_at) >= new Date(lease.expires_at));
    });

    it("verifies fencing tuple", () => {
      const runId = core.generateRunId();
      const nonce = core.generateRunId();
      const lease = core.createLease("reb_stock", runId, "owner-3", 2, nonce);
      assert.ok(core.verifyFencingTuple(lease, "reb_stock", runId, "owner-3", 2, nonce));
      assert.equal(core.verifyFencingTuple(lease, "reb_stock", runId, "wrong", 2, nonce), false);
    });
  });

  describe("budget state", () => {
    it("reserves budget and enforces cap", () => {
      const runId = core.generateRunId();
      let budget = core.createBudgetState("mois_jumin_statmonth_csv", "2026-07-28", 10);
      budget = core.reserveBudget(budget, runId, 1, 1);
      assert.equal(budget.reserved, 1);
      budget = core.reserveBudget(budget, runId, 2, 9);
      assert.equal(budget.reserved, 10);
      assert.throws(() => core.reserveBudget(budget, runId, 3, 1), /Budget exhausted/);
    });

    it("replaying same identity is a no-op", () => {
      const runId = core.generateRunId();
      let budget = core.createBudgetState("reb_stock", "2026-07-28", 10);
      budget = core.reserveBudget(budget, runId, 1, 5);
      const budget2 = core.reserveBudget(budget, runId, 1, 5);
      assert.equal(budget2.reserved, 5); // unchanged
    });
  });

  describe("selection state", () => {
    it("creates a valid selection pointer", () => {
      const hash = "a".repeat(64);
      const sel = core.createSelectionState("mois_jumin_statmonth_csv", "2026-05__20260515T032211Z__a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d", hash);
      assert.equal(sel.provider, "mois_jumin_statmonth_csv");
      assert.equal(sel.selection_receipt_hash, hash);
    });

    it("rejects invalid receipt hash", () => {
      assert.throws(
        () => core.createSelectionState("reb_stock", "gen", "short"),
        /64 lowercase hex/
      );
    });
  });
});
