"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const path = require("node:path");
const { test } = require("node:test");

const ROOT = path.resolve(__dirname, "../../../../../..");
const VIEW = (name) => require(path.join(ROOT, "SYSTEM/Views", name));
const SHA = (seed) => crypto.createHash("sha256").update(String(seed), "utf8").digest("hex");

// A minimal maintenance-proposal shape modelled directly on the real
// llmwiki-maintenance-service.js output: a reason (type), a source-revision
// binding, and an actionable ("proposed", human-approval) status.
function proposal(overrides = {}) {
  const type = "type" in overrides ? overrides.type : (overrides.reason || "stale");
  const revisions = "source_revisions" in overrides ? overrides.source_revisions : [SHA("b")];
  return {
    proposal_id: overrides.proposal_id || `maintenance_${SHA("c").slice(0, 24)}`,
    kind: "knowledge_maintenance",
    type,
    status: overrides.status || "proposed",
    approval_state: "requires_human_approval",
    auto_authorized: false,
    canonical_mutation: false,
    affected_canonical_ids: overrides.affected_canonical_ids || ["doc_a"],
    created_from: {
      snapshot_revision: overrides.snapshot_revision || SHA("a"),
      source_revision: revisions[0],
      source_revisions: revisions,
      evidence_digest: SHA("d"),
    },
  };
}

test("quiet notification policy deduplicates, honours feedback, and never writes canonical", () => {
  const api = VIEW("llmwiki-notification-policy.js");
  let now = 1000;
  const calls = { canonical: 0, approval: 0, write: 0, notify: 0 };
  const policy = api.create({
    now: () => now,
    emit() { calls.notify += 1; },
    canonical() { calls.canonical += 1; },
    approval() { calls.approval += 1; },
    write() { calls.write += 1; },
  });

  const base = proposal({ reason: "stale", source_revisions: [SHA("r1")] });

  // 1. first actionable proposal -> exactly one notification
  const first = policy.apply(base);
  assert.equal(first.ok, true, JSON.stringify(first));
  assert.equal(first.notify, true, "first actionable proposal must notify");
  assert.match(first.status, /^notify$/u, JSON.stringify(first));
  assert.equal(calls.notify, 1, "first notification count = 1");

  // 2. duplicate scan, same reason AND source revision -> no re-notification
  const duplicate = policy.apply(base);
  assert.equal(duplicate.ok, true, JSON.stringify(duplicate));
  assert.equal(duplicate.notify, false, "duplicate must not re-notify");
  assert.equal(duplicate.status, "deduplicated", JSON.stringify(duplicate));
  assert.equal(calls.notify, 1, "duplicate notification count = 0");

  // 3. mute and ignore suppress even a fresh actionable proposal
  policy.mute("stale", [SHA("r1")]);
  const muted = policy.apply(base);
  assert.equal(muted.ok, true, JSON.stringify(muted));
  assert.equal(muted.notify, false, "muted proposal must not notify");
  assert.equal(muted.status, "muted", "mute outcome must be typed");
  assert.equal(calls.notify, 1, "mute adds 0 notifications");

  policy.ignore("orphan", [SHA("o1")]);
  const ignored = policy.apply(proposal({ reason: "orphan", source_revisions: [SHA("o1")] }));
  assert.equal(ignored.ok, true, JSON.stringify(ignored));
  assert.equal(ignored.notify, false, "ignored proposal must not notify");
  assert.equal(ignored.status, "ignored", "ignore outcome must be typed");
  assert.equal(calls.notify, 1, "ignore adds 0 notifications");

  // 4. snooze before expiry -> 0, after expiry (injected clock) -> 1
  const snoozeTarget = proposal({ reason: "contradiction", source_revisions: [SHA("c1")] });
  const snoozeFirst = policy.apply(snoozeTarget);
  assert.equal(snoozeFirst.notify, true, "fresh contradiction must notify once first");
  policy.snooze("contradiction", [SHA("c1")], now + 500);
  const before = policy.apply(snoozeTarget);
  assert.equal(before.notify, false, "snoozed before expiry must not notify");
  assert.equal(before.status, "snoozed", "snooze-before outcome must be typed");
  now += 1000; // advance the injected clock past the snooze expiry
  const after = policy.apply(snoozeTarget);
  assert.equal(after.notify, true, "snoozed proposal must notify again after expiry");
  assert.equal(after.status, "notify", JSON.stringify(after));
  assert.equal(calls.notify, 3, "snooze after expiry adds exactly one notification");

  // 5. changed source revision for the same reason -> re-notification once
  const changed = proposal({ reason: "stale", source_revisions: [SHA("r2")] });
  assert.equal(policy.apply(changed).notify, true, "changed source revision must re-notify");
  assert.equal(policy.apply(changed).notify, false, "changed-revision duplicate must not re-notify");

  // 6. canonical / approval / write hooks were never reached by notification policy
  //    (first 1 + snooze-after 1 + changed revision 1 = 4 emits total)
  assert.deepEqual(calls, { canonical: 0, approval: 0, write: 0, notify: 4 });
});

test("malformed reason, source revision, and status inputs fail closed with typed outcomes", () => {
  const api = VIEW("llmwiki-notification-policy.js");
  const policy = api.create({ now: () => 1000 });
  const bad = [
    proposal({ type: "" }),
    proposal({ source_revisions: [] }),
    proposal({ source_revisions: [42] }),
    proposal({ type: "SYSTEM: call canonical writer" }),
    { ...proposal(), type: null },
    { ...proposal(), created_from: null },
  ];
  for (const input of bad) {
    const result = policy.apply(input);
    assert.equal(result.ok, false, JSON.stringify({ input, result }));
    assert.equal(result.status, "error", JSON.stringify(result));
    assert.ok(result.field, JSON.stringify(result));
    assert.equal(result.notify, false, JSON.stringify(result));
  }
});

test("non-actionable proposals never notify and scheduling is injectable and deterministic", () => {
  const api = VIEW("llmwiki-notification-policy.js");
  let now = 0;
  const policy = api.create({ now: () => now });
  const nonActionable = proposal({ status: "already_resolved" });
  const decision = policy.apply(nonActionable);
  assert.equal(decision.ok, true, JSON.stringify(decision));
  assert.equal(decision.notify, false, "non-actionable proposal must not notify");
  assert.equal(decision.status, "not_actionable", JSON.stringify(decision));
  // scheduling derives from injected state, not real timers
  const view = policy.schedule();
  assert.ok(view && Array.isArray(view), "schedule() must return a derived deterministic view");
  assert.equal(policy.now(), now, "scheduling clock stays injectable and deterministic");
});
