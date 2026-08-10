"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "../../../../../..");
const exporter = require(path.join(ROOT, "SYSTEM/Views/prodigy-performance-exporter.js"));

const FINAL_SHA = "c".repeat(40);
const SOURCE_SHA = "a".repeat(64);
const SETTINGS_SHA = "b".repeat(64);

function receipt(overrides = {}) {
  return Object.assign({
    schema_version: 1,
    receipt_kind: "performance",
    run_id: "run_wave3_01",
    correlation_id: "campaign_wave3",
    campaign_id: "cold-01",
    source_sha256: SOURCE_SHA,
    settings_sha256: SETTINGS_SHA,
    final_git_sha: FINAL_SHA,
    clock: { kind: "independent_control_clock", monotonic: true },
    metadata: { module_path: "SYSTEM/Views/example.js" },
    marks: [
      { phase: "hub_start", kind: "mark", at_ms: 0 },
      { phase: "shell_mounted", kind: "mark", at_ms: 1 },
      { phase: "primary_action_ready", kind: "mark", at_ms: 2 }
    ],
    missing_marks: [],
    claims: { physical_mobile_claim: "not_proven" }
  }, overrides);
}

function externalContext() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "prodigy-wave3-export-"));
  const vault = fs.mkdtempSync(path.join(os.tmpdir(), "prodigy-wave3-vault-"));
  return { root, vault };
}

function cleanup(context) {
  fs.rmSync(context.root, { recursive: true, force: true });
  fs.rmSync(context.vault, { recursive: true, force: true });
}

function options(context, overrides = {}) {
  return Object.assign({
    destinationRoot: context.root,
    vaultRoot: context.vault,
    approved: true
  }, overrides);
}

function testPreviewIsRedactedAndDoesNotWrite() {
  const context = externalContext();
  try {
    const source = receipt({
      absolute_path: "/Users/example/Vault/HUB/00 Home.md",
      note_content: "private note text",
      api_token: "secret-value"
    });
    const preview = exporter.previewReceipt(source, options(context));
    assert.equal(preview.redacted, true);
    assert.equal(preview.destinationPath, path.join(context.root, FINAL_SHA, source.run_id, "receipt.json"));
    assert.equal(preview.receipt.metadata.module_path, "SYSTEM/Views/example.js", "allowlisted relative module paths remain usable");
    assert.equal(preview.receipt.absolute_path, "[REDACTED_PATH]");
    assert.equal(preview.receipt.note_content, "[REDACTED_CONTENT]");
    assert.equal(preview.receipt.api_token, "[REDACTED_SECRET]");
    assert.equal(JSON.stringify(preview).includes("secret-value"), false);
    assert.equal(fs.existsSync(context.root + "/" + FINAL_SHA), false, "preview never creates an export directory");
    assert.ok(preview.reasonCodes.includes("SECRET_PRESENT"), "secrets fail closed even though preview is redacted");
  } finally {
    cleanup(context);
  }
}

function testConfirmThenSaveUsesExternalFinalShaRunPath() {
  const context = externalContext();
  try {
    const source = receipt();
    const instance = exporter.createReceiptExporter(Object.assign({ receipt: source }, options(context)));
    assert.throws(() => instance.save(), (error) => error.code === "NOT_CONFIRMED");
    const confirmed = instance.confirm({ approved: true });
    assert.equal(confirmed.confirmed, true);
    assert.equal(confirmed.status, "confirmed");
    const saved = instance.save();
    assert.equal(saved.status, "saved");
    assert.equal(saved.path, path.join(context.root, FINAL_SHA, source.run_id, "receipt.json"));
    assert.equal(fs.existsSync(saved.path), true);
    const written = JSON.parse(fs.readFileSync(saved.path, "utf8"));
    assert.equal(written.run_id, source.run_id);
    assert.equal(written.final_git_sha, FINAL_SHA);
    assert.equal(written.physical_mobile_claim, undefined, "claim remains nested only in source receipt");
    assert.equal(instance.pendingReceipt(), null, "successful save consumes the pending receipt");
  } finally {
    cleanup(context);
  }
}

function testExplicitApprovalAndUnsafeDestinationsAreRefused() {
  const context = externalContext();
  try {
    const notApproved = exporter.createReceiptExporter({ receipt: receipt(), ...options(context, { approved: false }) });
    assert.throws(() => notApproved.confirm(), (error) => error.code === "UNAPPROVED_WRITE");

    const insideVault = exporter.createReceiptExporter({
      receipt: receipt(),
      destinationRoot: path.join(context.vault, "receipts"),
      vaultRoot: context.vault,
      approved: true
    });
    assert.throws(() => insideVault.confirm({ approved: true }), (error) => error.code === "DESTINATION_INSIDE_VAULT");

    const traversal = exporter.createReceiptExporter({
      receipt: receipt({ run_id: "../escape" }),
      ...options(context)
    });
    assert.throws(() => traversal.confirm({ approved: true }), (error) => ["INVALID_RUN_ID", "PATH_TRAVERSAL"].includes(error.code));

    const overwrite = exporter.createReceiptExporter({ receipt: receipt(), ...options(context) });
    overwrite.confirm({ approved: true });
    overwrite.save();
    const second = exporter.createReceiptExporter({ receipt: receipt(), ...options(context) });
    second.confirm({ approved: true });
    assert.throws(() => second.save(), (error) => error.code === "OVERWRITE_REFUSED");
  } finally {
    cleanup(context);
  }
}

function testFailureRetainsReceiptForRetry() {
  const context = externalContext();
  try {
    let attempts = 0;
    let written = null;
    const instance = exporter.createReceiptExporter({
      receipt: receipt({ run_id: "run_retry" }),
      ...options(context),
      mkdir() {},
      exists() { return false; },
      writeFile(target, body) {
        attempts += 1;
        if (attempts === 1) throw new Error("simulated external failure");
        written = { target, body };
      }
    });
    const original = instance.pendingReceipt();
    instance.confirm({ approved: true });
    assert.throws(() => instance.save(), (error) => error.code === "WRITE_FAILED");
    assert.equal(instance.state(), "failed");
    assert.equal(instance.pendingReceipt(), original, "failed export retains the in-memory receipt");
    const retried = instance.retry();
    assert.equal(retried.status, "saved");
    assert.equal(attempts, 2);
    assert.equal(written.target, path.join(context.root, FINAL_SHA, "run_retry", "receipt.json"));
    assert.equal(instance.pendingReceipt(), null);
  } finally {
    cleanup(context);
  }
}

function testHashesPhysicalClaimsAndSettingsChangesFailClosed() {
  const context = externalContext();
  try {
    const missingHash = exporter.previewReceipt(receipt({ settings_sha256: undefined }), options(context));
    assert.equal(missingHash.ready, false);
    assert.ok(missingHash.reasonCodes.includes("MISSING_SETTINGS_SHA"));

    const mixed = exporter.previewReceipt(receipt({ final_sha: "d".repeat(40) }), options(context));
    assert.ok(mixed.reasonCodes.includes("MIXED_SHA"));

    const physical = exporter.createReceiptExporter({
      receipt: receipt({ claims: { physical_device_success: true } }),
      ...options(context)
    });
    assert.throws(() => physical.confirm({ approved: true }), (error) => error.code === "UNSUPPORTED_PHYSICAL_CLAIM");

    const settings = exporter.createReceiptExporter({
      receipt: receipt({ settings_changed: true }),
      ...options(context)
    });
    assert.throws(() => settings.confirm({ approved: true }), (error) => error.code === "UNAPPROVED_SETTINGS_CHANGE");
  } finally {
    cleanup(context);
  }
}

function main() {
  const tests = [
    ["redacted preview", testPreviewIsRedactedAndDoesNotWrite],
    ["explicit confirm and external save", testConfirmThenSaveUsesExternalFinalShaRunPath],
    ["approval and unsafe destination refusal", testExplicitApprovalAndUnsafeDestinationsAreRefused],
    ["failure retention and retry", testFailureRetainsReceiptForRetry],
    ["hash and unsupported-claim fail closed", testHashesPhysicalClaimsAndSettingsChangesFailClosed]
  ];
  let failures = 0;
  for (const [name, fn] of tests) {
    try {
      fn();
      console.log(`PASS ${name}`);
    } catch (error) {
      failures += 1;
      console.error(`FAIL ${name}: ${error.message}`);
    }
  }
  console.log(`${tests.length - failures}/${tests.length} performance exporter checks passed`);
  if (failures) process.exitCode = 1;
}

main();
