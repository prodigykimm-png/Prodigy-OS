#!/usr/bin/env node
"use strict";

const { describe, it, before } = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "../../../../..");
const FIXTURE_ROOT = path.join(ROOT, "SYSTEM", "CI", "fixtures", "consolidation");
const BASELINE_PATH = path.join(FIXTURE_ROOT, "baseline-v1.json");
const OWNERSHIP_PATH = path.join(FIXTURE_ROOT, "ownership-v1.json");
const PLAN_PATH = path.join(FIXTURE_ROOT, "plan.md");

let baseline;
let ownership;

describe("clean-checkout consolidation baseline", () => {
  before(() => {
    baseline = JSON.parse(fs.readFileSync(BASELINE_PATH, "utf8"));
    ownership = JSON.parse(fs.readFileSync(OWNERSHIP_PATH, "utf8"));
  });

  it("is a versioned, sanitized release baseline", () => {
    assert.equal(baseline.schema_version, 1);
    assert.equal(baseline.baseline_id, "clean-checkout-v1");
    for (const field of ["dirty_tracked", "untracked", "cache_membership", "region_objects"]) {
      assert.deepEqual(baseline[field], [], `${field} must not migrate local Vault data`);
    }
    assert.equal("generated_at" in baseline, false);
    assert.equal("vault_root" in baseline, false);
    assert.equal("head" in baseline, false);
  });

  it("preserves the canonical 83-region manifest counts without Region objects", () => {
    assert.deepEqual(baseline.manifest_counts, {
      busan: 16,
      seoul: 25,
      gyeonggi: 31,
      incheon: 11,
      total: 83,
    });
    assert.equal(
      baseline.manifest_counts.busan + baseline.manifest_counts.seoul +
        baseline.manifest_counts.gyeonggi + baseline.manifest_counts.incheon,
      83,
    );
  });
});

describe("sanitized consolidation ownership", () => {
  it("owns every Todo and final with a nonempty tracked-source inventory", () => {
    assert.equal(ownership.schema_version, 1);
    for (let index = 0; index < 16; index += 1) {
      assert.ok(Array.isArray(ownership.todos[String(index)]));
      assert.ok(ownership.todos[String(index)].length > 0);
    }
    for (const final of ["F1", "F2", "F3", "F4"]) {
      assert.ok(Array.isArray(ownership.finals[final]));
      assert.ok(ownership.finals[final].length > 0);
    }
  });

  it("is SHA-256 bound to the tracked plan", () => {
    const actual = crypto.createHash("sha256").update(fs.readFileSync(PLAN_PATH)).digest("hex");
    assert.equal(ownership.plan_sha256, actual);
  });

  it("contains no ignored runtime or agent-evidence ownership", () => {
    const paths = Object.values(ownership.todos).flat().concat(Object.values(ownership.finals).flat());
    assert.equal(paths.some((entry) => entry.startsWith(".omo/") || entry.startsWith("SYSTEM/CACHE/") || entry.startsWith("PARA/")), false);
  });
});
