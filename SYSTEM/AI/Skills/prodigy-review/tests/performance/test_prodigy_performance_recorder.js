"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const recorder = require("../../../../../Views/prodigy-performance-recorder.js");
const validator = require("../../../../../SCRIPTS/prodigy-performance-receipt-validator.js");

const SOURCE_SHA = "a".repeat(64);
const SETTINGS_SHA = "b".repeat(64);
const FINAL_SHA = "c".repeat(40);

function fixtureRecorder(options) {
  let tick = 10;
  const instance = recorder.createRecorder(Object.assign({
    clock: { now: () => tick },
    run_id: "run-test",
    correlation_id: "correlation-test",
    correlation_started_at_ms: 1700000000000,
    source_sha256: SOURCE_SHA,
    settings_sha256: SETTINGS_SHA,
    cold_warm: "cold"
  }, options));
  return {
    instance,
    advance(value) { tick = value; }
  };
}

test("canonical bytes sort object keys and hash without self-hash recursion", () => {
  assert.equal(Buffer.from(recorder.canonicalBytes({ b: 2, a: 1 })).toString("utf8"), "{\"a\":1,\"b\":2}");
  assert.equal(recorder.sha256("abc"), "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  const first = recorder.bindFinalGitSha({ schema_version: 1, run_id: "r", value: 2 }, FINAL_SHA);
  const second = recorder.bindFinalGitSha({ value: 2, run_id: "r", schema_version: 1 }, FINAL_SHA);
  assert.equal(first.receipt_sha256, second.receipt_sha256);
  assert.equal(recorder.verifyReceiptHash(first), true);
  assert.equal(first.receipt_sha256.length, 64);
});

test("recorder uses the monotonic control clock for durations", () => {
  const fixture = fixtureRecorder();
  fixture.instance.mark("hub_start");
  fixture.advance(12);
  const token = fixture.instance.start("module", { module_path: "SYSTEM/Views/example.js" });
  fixture.advance(19);
  const end = fixture.instance.end(token, { module_path: "SYSTEM/Views/example.js" });
  assert.equal(end.duration_ms, 7);
  fixture.instance.mark("shell_mounted");
  fixture.instance.mark("primary_action_ready");
  fixture.advance(25);
  fixture.instance.dispose();
  const receipt = fixture.instance.finalize({ final_git_sha: FINAL_SHA });
  assert.equal(receipt.duration_ms, 15);
  assert.equal(receipt.correlation_started_at_ms, 1700000000000);
  assert.equal(receipt.control_clock.name, "performance.now");
  assert.equal(recorder.verifyReceiptHash(receipt), true);
});

test("receipt contains bounded marks, redaction, attribution, and required lifecycle marks", () => {
  const fixture = fixtureRecorder({ external_start_status: "pending", icloud_status: "pending" });
  fixture.instance.mark("hub_start");
  fixture.instance.mark("shell_mounted");
  fixture.instance.mark("primary_action_ready");
  fixture.instance.dispose();
  const receipt = fixture.instance.finalize({ final_git_sha: FINAL_SHA });
  const result = validator.validateReceipt(receipt);
  assert.equal(result.ok, true, result.errors.join("; "));
  assert.deepEqual(receipt.missing_marks, []);
  assert.equal(receipt.physical_claim_status, "not_proven");
  assert.equal(receipt.physical_device_success, false);
  assert.equal(receipt.redaction.user_content_excluded, true);
  assert.equal(receipt.attribution.icloud_status, "pending");
});

test("unsafe module paths and user content fail closed", () => {
  assert.throws(() => recorder.createRecorder({ module_path: "../../secret.js" }), (cause) => cause && cause.code === "unsafe_module_path");
  const fixture = fixtureRecorder();
  assert.throws(() => fixture.instance.mark("hub_start", { content: "private note" }), (cause) => cause && cause.code === "user_content_forbidden");
  assert.throws(() => fixture.instance.mark("hub_start", { module_path: "/tmp/module.js" }), (cause) => cause && cause.code === "unsafe_module_path");
});

test("uninstrumented receipt is explicit and never claims physical success", () => {
  const fixture = fixtureRecorder({ mode: "uninstrumented", instrumented: false });
  fixture.instance.mark("hub_start");
  const receipt = fixture.instance.finalize({ final_git_sha: FINAL_SHA });
  assert.equal(receipt.mode, "uninstrumented");
  assert.equal(receipt.instrumented, false);
  assert.equal(receipt.attribution.product_status, "not_measured");
  assert.equal(receipt.physical_device_success, false);
  assert.equal(validator.validateReceipt(receipt).ok, true);
});
