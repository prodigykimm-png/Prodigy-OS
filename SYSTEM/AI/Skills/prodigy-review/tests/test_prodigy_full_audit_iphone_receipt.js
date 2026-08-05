"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const validator = require("../../../../SCRIPTS/prodigy-full-audit-iphone-receipt-validator.js");
const HEAD = "a".repeat(40);

function makeReceipt(overrides = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "prodigy-iphone-receipt-"));
  fs.writeFileSync(path.join(root, "iphone.png"), "redacted physical screenshot");
  fs.writeFileSync(path.join(root, "physical-receipt.json"), `${JSON.stringify({
    plan_slug: validator.PLAN_SLUG,
    audited_product_head_sha: HEAD,
    proof_type: "physical",
    device_model: "iPhone 15 Pro",
    orientation: "portrait",
    user_confirmation_timestamp: "2026-08-01T00:01:00+09:00",
    ios_version: "18.5",
    obsidian_version: "1.8.10",
    screenshot_file: "iphone.png",
    checks: Object.fromEntries(validator.REQUIRED_CHECKS.map((key) => [key, true])),
    ...overrides,
  }, null, 2)}\n`);
  return root;
}

test("valid physical iPhone receipt binds to the exact product HEAD", () => {
  const root = makeReceipt();
  try { assert.deepEqual(validator.validate({ plan: validator.PLAN_SLUG, expectedProductHead: HEAD, receiptDir: root }), { ok: true, status: "proven", errors: [] }); }
  finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test("missing receipt remains honestly not proven", () => {
  const result = validator.validate({ plan: validator.PLAN_SLUG, expectedProductHead: HEAD, receiptDir: path.join(os.tmpdir(), "missing-prodigy-receipt") });
  assert.equal(result.ok, false);
  assert.equal(result.status, "not_proven");
});

test("wrong HEAD, resized evidence, and incomplete clearance checks fail", () => {
  const root = makeReceipt({ audited_product_head_sha: "b".repeat(40), proof_type: "resized-desktop", checks: { micro_log_controls_visible: true } });
  try {
    const result = validator.validate({ plan: validator.PLAN_SLUG, expectedProductHead: HEAD, receiptDir: root });
    assert.equal(result.ok, false);
    assert.match(result.errors.join("\n"), /HEAD mismatch|proof_type|bottom_clearance_pass/);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
