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

function testProductionSessionCapturesReadinessAndExportPreview() {
  const context = fs.mkdtempSync(path.join(os.tmpdir(), "prodigy-measurement-test-"));
  const vault = fs.mkdtempSync(path.join(os.tmpdir(), "prodigy-measurement-vault-"));
  try {
    const session = measurement.createSession({ workspace_id: "knowledge", clock: clock() });
    assert.equal(session.available, true);
    assert.equal(session.exporterAvailable, true);
    session.mark("shell_mounted", { scope: "knowledge", status: "mounted" });
    session.mark("data_scan_start", { scope: "knowledge" });
    session.mark("data_scan_end", { scope: "knowledge", status: "loaded" });
    session.mark("projection", { scope: "knowledge", status: "projected" });
    session.mark("dom_render", { scope: "knowledge", status: "rendered" });
    const readiness = session.markWorkspaceReady();
    assert.equal(readiness.ready, true);
    assert.equal(readiness.action.exact, true);

    const preview = session.previewExport({
      receiptOptions: {
        cold_warm: "warm",
        source_sha256: SOURCE_SHA,
        settings_sha256: SETTINGS_SHA,
        final_git_sha: FINAL_SHA,
        campaign_id: "campaign_measurement_test"
      },
      exportOptions: { destinationRoot: context, vaultRoot: vault, approved: true }
    });
    assert.ok(preview);
    assert.equal(preview.redacted, true);
    assert.equal(preview.destinationPath.startsWith(context), true);
    assert.equal(fs.existsSync(context + "/" + FINAL_SHA), false, "preview must not write external receipt");

    const receipt = session.finalize({ cold_warm: "warm", source_sha256: SOURCE_SHA, settings_sha256: SETTINGS_SHA, final_git_sha: FINAL_SHA, campaign_id: "campaign_measurement_test" });
    assert.equal(recorder.verifyReceiptHash(receipt), true);
    assert.ok(session.redactedPreview);
    assert.equal(session.redactedPreview.serializable, true);
    assert.deepEqual(receipt.marks.map((mark) => mark.phase), [
      "hub_start", "shell_mounted", "data_scan_start", "data_scan_end", "projection_start", "dom_render_start", "primary_action_ready"
    ]);
  } finally {
    fs.rmSync(context, { recursive: true, force: true });
    fs.rmSync(vault, { recursive: true, force: true });
  }
}

testProductionSessionCapturesReadinessAndExportPreview();
console.log("1/1 workspace measurement integration check passed");
