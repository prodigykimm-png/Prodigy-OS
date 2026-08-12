"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const measurement = require("../../../../../Views/prodigy-workspace-measurement.js");
const recorder = require("../../../../../Views/prodigy-performance-recorder.js");

const FINAL_SHA = "c".repeat(40);
const SOURCE_SHA = "a".repeat(64);
const SETTINGS_SHA = "b".repeat(64);

function clock() {
  let value = 0;
  return { now: () => { value += 1; return value; } };
}

function receiptOptions() {
  return {
    cold_warm: "warm",
    source_sha256: SOURCE_SHA,
    settings_sha256: SETTINGS_SHA,
    final_git_sha: FINAL_SHA,
    campaign_id: "campaign_measurement_test"
  };
}

function testProductionCampaignLifecycle() {
  const context = fs.mkdtempSync(path.join(os.tmpdir(), "prodigy-measurement-test-"));
  const vault = fs.mkdtempSync(path.join(os.tmpdir(), "prodigy-measurement-vault-"));
  try {
    const session = measurement.createSession({ workspace_id: "knowledge", clock: clock() });
    const controller = session.controller;
    assert.equal(session.available, true);
    assert.equal(controller.available, true);
    assert.equal(session.exporterAvailable, true);
    assert.strictEqual(globalThis.ProdigyPerformanceCampaign.get("knowledge"), controller);

    session.mark("shell_mounted", { scope: "knowledge", status: "mounted" });
    const scanToken = session.start("data_scan", { scope: "knowledge", status: "scanning" });
    session.end(scanToken, { scope: "knowledge", status: "loaded" });
    const projectionToken = session.start("projection", { scope: "knowledge", status: "projecting" });
    session.end(projectionToken, { scope: "knowledge", status: "projected" });
    const renderToken = session.start("dom_render", { scope: "knowledge", status: "rendering" });
    session.end(renderToken, { scope: "knowledge", status: "rendered" });
    const readiness = session.markReady("knowledge", {
      status: "deterministic",
      enabledAction: { id: "knowledge.open", enabled: true }
    });
    assert.equal(readiness.ready, true);
    assert.equal(readiness.action.exact, true);

    const options = receiptOptions();
    const finalized = controller.dispose(options);
    assert.ok(finalized);
    assert.equal(recorder.verifyReceiptHash(finalized), true);
    assert.strictEqual(controller.dispose(options), finalized, "session disposal is idempotent");

    let attempts = 0;
    const exporterOptions = {
      destinationRoot: context,
      vaultRoot: vault,
      approved: true,
      mkdir(target) { fs.mkdirSync(target, { recursive: true }); },
      exists() { return false; },
      writeFile(target, body) {
        attempts += 1;
        if (attempts === 1) throw new Error("simulated external failure");
        fs.writeFileSync(target, body, "utf8");
      }
    };
    const preview = controller.preview({ receiptOptions: options, exportOptions: exporterOptions });
    assert.ok(preview);
    assert.equal(preview.redacted, true);
    assert.equal(preview.ready, true);
    assert.equal(fs.existsSync(path.join(context, FINAL_SHA)), false, "preview must not write external receipt");

    const retainedExporter = controller.exporter;
    assert.ok(retainedExporter);
    assert.equal(controller.pendingReceipt() !== null, true);
    assert.throws(() => controller.save(), (error) => error.code === "NOT_CONFIRMED");
    controller.confirm({ approved: true });
    assert.throws(() => controller.save(), (error) => error.code === "WRITE_FAILED");
    assert.strictEqual(controller.exporter, retainedExporter, "failed save retains one exporter instance");
    const saved = controller.retry();
    assert.equal(saved.status, "saved");
    assert.strictEqual(controller.exporter, retainedExporter, "retry uses the retained exporter instance");
    assert.equal(controller.pendingReceipt(), null);
    assert.equal(fs.existsSync(saved.path), true);

    const receipt = controller.finalize(options);
    assert.equal(recorder.verifyReceiptHash(receipt), true);
    assert.ok(session.redactedPreview);
    assert.equal(session.redactedPreview.serializable, true);
    assert.deepEqual(receipt.marks.map((mark) => mark.phase), [
      "hub_start", "shell_mounted", "data_scan_start", "data_scan_end",
      "projection_start", "projection_end", "dom_render_start", "dom_render_end",
      "primary_action_ready", "disposed"
    ]);
  } finally {
    fs.rmSync(context, { recursive: true, force: true });
    fs.rmSync(vault, { recursive: true, force: true });
  }
}

function testFinalizationRequiresExplicitBinding() {
  const session = measurement.createSession({ workspace_id: "binding", clock: clock() });
  assert.throws(
    () => session.controller.finalize({ cold_warm: "warm" }),
    (error) => error.code === "missing_source_sha256"
  );
}

testProductionCampaignLifecycle();
testFinalizationRequiresExplicitBinding();
console.log("2/2 workspace measurement integration checks passed");
