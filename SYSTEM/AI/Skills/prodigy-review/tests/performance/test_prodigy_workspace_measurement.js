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

function testMilestoneVocabularyCompleteReceipt() {
  const session = measurement.createSession({ workspace_id: "milestones", clock: clock() });
  assert.deepEqual(measurement.MILESTONES, [
    "first_useful_paint",
    "first_actionable_control",
    "data_scan",
    "projection",
    "dom_render",
    "review_resume",
    "provider_wait",
    "recovery_complete"
  ]);
  const tokens = {};
  for (const name of measurement.MILESTONES) {
    assert.equal(measurement.isMilestone(name), true);
    tokens[name] = session.startMilestone(name, { status: "checking" });
    assert.ok(tokens[name], `start token for ${name}`);
  }
  for (const name of measurement.MILESTONES) {
    const ended = session.endMilestone(tokens[name], { status: "done" });
    assert.ok(ended, `end mark for ${name}`);
  }
  const finalized = session.finalize(receiptOptions());
  assert.equal(recorder.verifyReceiptHash(finalized), true);
  const states = session.milestoneStates(finalized);
  for (const name of measurement.MILESTONES) {
    assert.equal(states[name].state, "complete", name);
    assert.ok(states[name].start, `${name} start`);
    assert.ok(states[name].end, `${name} end`);
  }
  const proof = session.milestoneReceipt(finalized);
  assert.equal(proof.provider_calls, 0);
  const live = session.milestoneStates();
  for (const name of measurement.MILESTONES) {
    assert.equal(live[name].state, "complete", `live ${name}`);
  }
  assert.equal(session.startMilestone("not_a_milestone"), null);
  assert.equal(session.endMilestone("not_a_milestone"), null);
  assert.equal(session.milestoneState("not_a_milestone"), null);
  assert.equal(measurement.isMilestone("time_to_interactive"), false);
}

function testMilestoneMalformedInputs() {
  const session = measurement.createSession({ workspace_id: "milestones_malformed", clock: clock() });
  const token = session.startMilestone("provider_wait", { status: "waiting" });
  assert.ok(token);
  assert.equal(session.milestoneState("provider_wait").state, "started");

  const orphan = session.endMilestone("recovery_complete", { status: "done" });
  assert.ok(orphan);
  assert.equal(orphan.missing_start, true);
  assert.equal(session.milestoneState("recovery_complete").state, "started");

  const bad = session.endMilestone(token, { duration_ms: -5 });
  assert.equal(bad, null);
  assert.equal(session.milestoneState("provider_wait").state, "started");

  const absent = session.milestoneStates(null);
  for (const name of measurement.MILESTONES) {
    assert.equal(absent[name].state, "unavailable", name);
    assert.equal(absent[name].start, null);
    assert.equal(absent[name].end, null);
  }
  assert.equal(session.milestoneReceipt(null).provider_calls, 0);

  let now = 100;
  const regressing = measurement.createSession({ workspace_id: "milestones_clock", clock: { now: () => now } });
  const paintToken = regressing.startMilestone("first_useful_paint", {});
  assert.ok(paintToken);
  now = 50;
  assert.equal(regressing.endMilestone(paintToken, {}), null);
  assert.equal(regressing.milestoneState("first_useful_paint").state, "started");
}

function testMilestoneFreshSessionHasNoStaleState() {
  const first = measurement.createSession({ workspace_id: "milestones_stale_a", clock: clock() });
  const token = first.startMilestone("data_scan", { status: "scanning" });
  first.endMilestone(token, { status: "loaded" });
  assert.equal(first.milestoneState("data_scan").state, "complete");

  const second = measurement.createSession({ workspace_id: "milestones_stale_b", clock: clock() });
  for (const name of measurement.MILESTONES) {
    assert.equal(second.milestoneState(name).state, "missing", `fresh session ${name}`);
  }
  const reviewToken = second.startMilestone("review_resume", { status: "resuming" });
  second.endMilestone(reviewToken, { status: "resumed" });
  assert.equal(second.milestoneState("review_resume").state, "complete");
  assert.equal(second.milestoneState("data_scan").state, "missing");
  assert.equal(first.milestoneState("data_scan").state, "complete");
}

function testMilestoneLayerReportsFailure() {
  const session = measurement.createSession({ workspace_id: "milestones_failure", clock: clock() });
  session.fail(Object.assign(new Error("synthetic contract violation"), { code: "SYNTHETIC_CONTRACT_VIOLATION" }), {});
  const finalized = session.finalize(receiptOptions());
  assert.ok(finalized.failures.length >= 1);
  assert.ok(finalized.failures.some((entry) => entry.code === "SYNTHETIC_CONTRACT_VIOLATION"));
  assert.ok(finalized.marks.some((mark) => mark.phase === "error"));
}

function testMilestoneFailedEndIsNotComplete() {
  const session = measurement.createSession({ workspace_id: "milestones_terminal", clock: clock() });
  assert.equal(measurement.MILESTONE_STATES.FAILED, "failed");

  const failedToken = session.startMilestone("first_useful_paint", { status: "rendering" });
  assert.ok(failedToken);
  const failedEnd = session.endMilestone(failedToken, { status: "failed" });
  assert.ok(failedEnd);
  const failedState = session.milestoneState("first_useful_paint");
  assert.equal(failedState.state, "failed");
  assert.notEqual(failedState.state, "complete");
  assert.ok(failedState.start);
  assert.ok(failedState.end);

  const abortedToken = session.startMilestone("dom_render", { status: "rendering" });
  assert.ok(abortedToken);
  assert.ok(session.endMilestone(abortedToken, { status: "aborted" }));
  const abortedState = session.milestoneState("dom_render");
  assert.equal(abortedState.state, "failed");
  assert.notEqual(abortedState.state, "complete");

  const finalized = session.finalize(receiptOptions());
  assert.equal(recorder.verifyReceiptHash(finalized), true);
  const states = session.milestoneStates(finalized);
  assert.equal(states.first_useful_paint.state, "failed");
  assert.equal(states.dom_render.state, "failed");
  const proof = session.milestoneReceipt(finalized);
  assert.equal(proof.milestones.first_useful_paint.state, "failed");
  assert.equal(proof.milestones.dom_render.state, "failed");
  assert.equal(proof.provider_calls, 0);
}

testProductionCampaignLifecycle();
testFinalizationRequiresExplicitBinding();
testMilestoneVocabularyCompleteReceipt();
testMilestoneMalformedInputs();
testMilestoneFreshSessionHasNoStaleState();
testMilestoneLayerReportsFailure();
testMilestoneFailedEndIsNotComplete();
console.log("7/7 workspace measurement integration checks passed");
