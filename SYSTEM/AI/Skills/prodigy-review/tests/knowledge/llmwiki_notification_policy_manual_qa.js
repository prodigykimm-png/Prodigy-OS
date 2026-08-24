"use strict";

// Task 16 manual QA driver: imports the REAL production modules and proves the
// quiet notification policy with an injected clock. Mirrors the plan Task 16
// verification matrix exactly (first 1; duplicate 0; mute/ignore 0; snooze
// before 0 / after 1; changed revision 1; canonical writer 0).

const path = require("node:path");
const crypto = require("node:crypto");
const fs = require("node:fs");

const ROOT = path.resolve(__dirname, "../../../../../..");
const VIEW = (name) => require(path.join(ROOT, "SYSTEM/Views", name));
const SHA = (seed) => crypto.createHash("sha256").update(String(seed), "utf8").digest("hex");

function proposal(reason, revisions, status = "proposed") {
  return {
    proposal_id: `maintenance_${crypto.createHash("sha256").update(reason + JSON.stringify(revisions)).digest("hex").slice(0, 24)}`,
    kind: "knowledge_maintenance",
    type: reason,
    status,
    approval_state: status === "proposed" ? "requires_human_approval" : "resolved",
    auto_authorized: false,
    canonical_mutation: false,
    affected_canonical_ids: ["doc_a"],
    created_from: {
      snapshot_revision: SHA("snap"),
      source_revision: revisions[0],
      source_revisions: revisions,
      evidence_digest: SHA("evidence"),
    },
  };
}

function run() {
  const Policy = VIEW("llmwiki-notification-policy.js");
  let now = 1000;
  const calls = { canonical: 0, approval: 0, write: 0, notify: 0 };
  const policy = Policy.create({
    now: () => now,
    emit() { calls.notify += 1; },
    canonical() { calls.canonical += 1; },
    approval() { calls.approval += 1; },
    write() { calls.write += 1; },
  });

  const base = proposal("stale", [SHA("r1")]);
  const steps = [];

  function step(label, fn) {
    const out = fn();
    steps.push({ label, ...out });
    return out;
  }

  const first = step("first", () => policy.apply(base));
  const duplicate = step("duplicate", () => policy.apply(base));

  policy.mute("stale", [SHA("r1")]);
  const muted = step("mute", () => policy.apply(base));

  policy.ignore("orphan", [SHA("o1")]);
  const ignored = step("ignore", () => policy.apply(proposal("orphan", [SHA("o1")])));

  // snooze: first notify, then snooze; before expiry 0, advance clock, after expiry 1
  const snoozeTarget = proposal("contradiction", [SHA("c1")]);
  step("snooze-first", () => policy.apply(snoozeTarget));
  policy.snooze("contradiction", [SHA("c1")], now + 500);
  const snoozeBefore = step("snooze-before", () => policy.apply(snoozeTarget));
  now += 1000; // advance injected clock past expiry
  const snoozeAfter = step("snooze-after", () => policy.apply(snoozeTarget));

  const changed = proposal("stale", [SHA("r2")]);
  const changedDecision = step("changed-revision-first", () => policy.apply(changed));
  const changedDup = step("changed-revision-duplicate", () => policy.apply(changed));

  const metrics = {
    firstNotification: first.notify ? 1 : 0,
    duplicate: duplicate.notify ? 1 : 0,
    muteOrIgnore: (muted.notify || ignored.notify) ? 1 : 0,
    snoozeBefore: snoozeBefore.notify ? 1 : 0,
    snoozeAfter: snoozeAfter.notify ? 1 : 0,
    changedRevision: changedDecision.notify ? 1 : 0,
    changedRevisionDuplicate: changedDup.notify ? 1 : 0,
    canonicalWriterCalls: calls.canonical,
    approvalCalls: calls.approval,
    writeCalls: calls.write,
    totalEmits: calls.notify,
  };

  const ok =
    metrics.firstNotification === 1 &&
    metrics.duplicate === 0 &&
    metrics.muteOrIgnore === 0 &&
    metrics.snoozeBefore === 0 &&
    metrics.snoozeAfter === 1 &&
    metrics.changedRevision === 1 &&
    metrics.changedRevisionDuplicate === 0 &&
    metrics.canonicalWriterCalls === 0 &&
    metrics.approvalCalls === 0 &&
    metrics.writeCalls === 0;

  return {
    ok,
    schema_version: "task16-notification-policy-manual-driver-v1",
    module: "SYSTEM/Views/llmwiki-notification-policy.js",
    metrics,
    decisionSequence: steps.map((s) => ({ label: s.label, status: s.status, notify: s.notify, reason: s.reason })),
    injectableClock: { start: 1000, end: now, advancedBy: 1000, sleeps: 0 },
    scheduleDerivedViewArray: Array.isArray(policy.schedule()),
  };
}

const receipt = run();
const reportPath = path.join(ROOT, ".omo/evidence/prodigy-llmwiki-autonomous-knowledge-git/task-16");
fs.mkdirSync(reportPath, { recursive: true });
fs.writeFileSync(path.join(reportPath, "driver-metrics.json"), JSON.stringify(receipt, null, 2) + "\n");
console.log("TASK16_DRIVER " + JSON.stringify(receipt.metrics));
console.log(JSON.stringify({ ok: receipt.ok, driverMetrics: receipt.metrics }));
process.exit(receipt.ok ? 0 : 1);
