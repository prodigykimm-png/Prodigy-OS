"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { spawnSync } = require("node:child_process");

const ROOT = path.resolve(__dirname, "../../../../../..");
const validator = require(path.join(ROOT, "SYSTEM/SCRIPTS/prodigy-mobile-settings-change-validator.js"));
const report = require(path.join(ROOT, "SYSTEM/SCRIPTS/prodigy-mobile-settings-comparison-report.js"));
const schemaPath = path.join(ROOT, "SYSTEM/docs/Prodigy_Mobile_Settings_Change_v1.schema.json");
const baselinePath = path.join(ROOT, "SYSTEM/AI/Reports/prodigy-mobile-settings-baseline.json");

function hash(bytes) {
  return crypto.createHash("sha256").update(bytes).digest("hex");
}

function baseReceipt(root, targetPath, overrides = {}) {
  const external = path.join(root, "external-backups");
  fs.mkdirSync(external, { recursive: true });
  const bytes = Buffer.from(targetPath.endsWith("community-plugins.json") ? '["dataview"]\n' : '{"main":{"children":[]}}\n');
  const backupPath = path.join(external, `${targetPath.includes("community") ? "plugins" : "workspace"}.before`);
  fs.writeFileSync(backupPath, bytes);
  const preimage = hash(bytes);
  const configurationId = "cfg-wave3-synthetic";
  const campaignId = "campaign-wave3-synthetic";
  const community = targetPath.endsWith("community-plugins.json");
  const before = community
    ? { enabled_plugin_ids: ["dataview"] }
    : { tabs: [{ leaf_id: "leaf-a", file: "HUB/00 Home.md", type: "markdown" }] };
  const after = community
    ? { enabled_plugin_ids: ["dataview", "synthetic-plugin"] }
    : { tabs: [{ leaf_id: "leaf-a", file: "HUB/00 Home.md", type: "markdown", mode: "source" }] };
  const identity = community ? { plugin_id: "synthetic-plugin" } : { leaf_id: "leaf-a" };
  const jsonPointer = community ? "/1" : "/tabs/0/mode";
  const receipt = {
    schema_version: 1,
    receipt_type: "obsidian-settings-change",
    change_id: community ? "change-plugin-add" : "change-leaf-mode",
    target_path: targetPath,
    configuration_id: configurationId,
    campaign_id: campaignId,
    json_pointer: jsonPointer,
    structural_anchor: {
      kind: community ? "plugin" : "mobile_leaf",
      path: jsonPointer,
      identity: community ? "synthetic-plugin" : "leaf-a",
    },
    preimage_sha256: preimage,
    preimage_bytes: bytes.length,
    before,
    after,
    proposed_postimage_sha256: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    backup_path: backupPath,
    backup_sha256: preimage,
    backup_bytes: bytes.length,
    backup_read_back: {
      path: backupPath,
      sha256: preimage,
      bytes: bytes.length,
      matches_backup: true,
      verified: true,
    },
    identity,
    dependency: community ? "plugin-runtime" : "mobile-leaf-renderer",
    user_purpose: community ? "Measure an explicitly approved plugin startup variable." : "Measure one redacted mobile leaf setting variable.",
    approval: {
      approved: true,
      approved_by: "synthetic-reviewer",
      approved_at: "2026-08-10T00:00:00Z",
      evidence: "external synthetic approval receipt",
      change_id: community ? "change-plugin-add" : "change-leaf-mode",
      target_path: targetPath,
      preimage_sha256: preimage,
      proposed_postimage_sha256: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    },
    diff: {
      variable_count: 1,
      ambiguous: false,
      path: jsonPointer,
      changes: [{ path: jsonPointer, operation: community ? "add" : "replace", before: community ? null : "preview", after: community ? "synthetic-plugin" : "source" }],
    },
    rollback: {
      status: "verified",
      expected_sha256: preimage,
      actual_sha256: preimage,
      hash_equal: true,
      verified: true,
      configuration_id: configurationId,
      campaign_id: campaignId,
    },
    observed_impact: {
      configuration_id: configurationId,
      campaign_id: campaignId,
      physical_mobile_claimed: false,
      physical_mobile_status: "not_claimed",
      baseline: { phase: "baseline", duration_ms: 12 },
      settings: { phase: "settings", duration_ms: 8 },
      product: { phase: "product", duration_ms: 4, readiness: "observed" },
    },
  };
  return { ...receipt, ...overrides };
}

test("schema and read-only baseline captures both frozen sources without reading live Vault settings", () => {
  const schema = JSON.parse(fs.readFileSync(schemaPath, "utf8"));
  assert.equal(schema.additionalProperties, false);
  assert.deepEqual(schema.properties.target_path.enum, validator.FROZEN_SETTINGS_PATHS);
  const baseline = JSON.parse(fs.readFileSync(baselinePath, "utf8"));
  assert.equal(baseline.settings_mutated, false);
  assert.equal(baseline.targets.length, 2);
  for (const target of baseline.targets) {
    assert.match(target.sha256, /^[a-f0-9]{64}$/);
    assert.ok(Number.isInteger(target.bytes) && target.bytes > 0);
    assert.ok(target.redacted_structure);
  }
  assert.deepEqual(baseline.prior_baseline.targets.map((target) => target.sha256), [
    "5ed6c01c9cb60985b12dcfbce303b0e242799597cb803a762ee728c78328f72f",
    "1b6c2fde29018d8d967fda50c60d310eef6147fcc0a1d7184d3c57a857be25bf",
  ]);
  assert.equal(baseline.observed_drift.status, "unattributed_external_drift");
  assert.equal(baseline.observed_drift.settings_mutated_by_this_batch, false);
});

test("validator accepts deterministic external community-plugin fixture", () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "prodigy-mobile-settings-test-"));
  try {
    const receipt = baseReceipt(temp, ".obsidian/community-plugins.json");
    const result = validator.validateSettingsChange(receipt, { vaultRoot: path.join(temp, "vault") });
    assert.equal(result.ok, true, JSON.stringify(result.errors));
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
});

test("validator accepts one mobile leaf replacement while preserving tab identity", () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "prodigy-mobile-settings-test-"));
  try {
    const receipt = baseReceipt(temp, ".obsidian/workspace-mobile.json");
    const result = validator.validateSettingsChange(receipt, { vaultRoot: path.join(temp, "vault") });
    assert.equal(result.ok, true, JSON.stringify(result.errors));
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
});

test("validator fails closed for approval, multi-change, in-vault backup, and tab closure", () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "prodigy-mobile-settings-test-"));
  try {
    const valid = baseReceipt(temp, ".obsidian/workspace-mobile.json");
    const cases = [
      { name: "missing approval", value: { ...valid, approval: undefined }, code: "approval_required" },
      { name: "multi change", value: { ...valid, diff: { ...valid.diff, variable_count: 2, changes: [...valid.diff.changes, { path: "/tabs/0/file", operation: "replace", before: "a", after: "b" }] } }, code: "multi_variable_or_ambiguous_diff" },
      { name: "in-vault backup", value: { ...valid, backup_path: path.join(temp, "vault", ".obsidian", "backup"), backup_read_back: { ...valid.backup_read_back, path: path.join(temp, "vault", ".obsidian", "backup") } }, code: "backup_inside_vault" },
      { name: "tab closure", value: { ...valid, after: { tabs: [] } }, code: "tab_order_or_closure_changed" },
      { name: "mixed campaign", value: { ...valid, observed_impact: { ...valid.observed_impact, campaign_id: "campaign-other" } }, code: "mixed_campaign_id" },
      { name: "physical claim", value: { ...valid, observed_impact: { ...valid.observed_impact, physical_mobile_claimed: true } }, code: "physical_evidence_unclaimed" },
      { name: "secret", value: { ...valid, approval: { ...valid.approval, evidence: { token: "not-redacted" } } }, code: "unredacted_secret" },
    ];
    for (const item of cases) {
      const result = validator.validateSettingsChange(item.value, { vaultRoot: path.join(temp, "vault") });
      assert.equal(result.ok, false, item.name);
      assert.ok(result.errors.some((error) => error.code === item.code), `${item.name}: ${JSON.stringify(result.errors)}`);
    }
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
});

test("report keeps baseline, settings, and product attribution separate and unclaimed", () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "prodigy-mobile-settings-test-"));
  try {
    const receipts = [
      baseReceipt(temp, ".obsidian/community-plugins.json"),
      baseReceipt(temp, ".obsidian/workspace-mobile.json"),
    ];
    const result = report.buildComparisonReport(receipts, { vaultRoot: path.join(temp, "vault") });
    assert.equal(result.configuration_id, "cfg-wave3-synthetic");
    assert.equal(result.campaign_id, "campaign-wave3-synthetic");
    assert.equal(result.baseline_attribution.targets.length, 2);
    assert.equal(result.settings_attribution.change_count, 2);
    assert.equal(result.product_attribution.physical_mobile_claimed, false);
    assert.equal(result.physical_mobile_status, "not_claimed");
    assert.notEqual(result.baseline_attribution, result.settings_attribution);
    assert.notEqual(result.settings_attribution, result.product_attribution);
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
});

test("report CLI reads only external synthetic receipts", () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "prodigy-mobile-settings-cli-"));
  try {
    const receiptPath = path.join(temp, "receipt.json");
    const receipt = baseReceipt(temp, ".obsidian/community-plugins.json");
    fs.writeFileSync(receiptPath, JSON.stringify(receipt));
    const command = spawnSync(process.execPath, [path.join(ROOT, "SYSTEM/SCRIPTS/prodigy-mobile-settings-comparison-report.js"), receiptPath], { cwd: ROOT, encoding: "utf8" });
    assert.equal(command.status, 0, command.stderr);
    const output = JSON.parse(command.stdout);
    assert.equal(output.report_kind, "prodigy-mobile-settings-comparison");
    assert.equal(output.physical_mobile_claimed, false);
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
});
