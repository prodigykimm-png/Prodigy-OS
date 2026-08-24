"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const path = require("node:path");
const { test } = require("node:test");

const ROOT = path.resolve(__dirname, "../../../../../..");
const VIEW = (name) => require(path.join(ROOT, "SYSTEM/Views", name));
const HASH = (value) => crypto.createHash("sha256").update(String(value), "utf8").digest("hex");

// Build ONE actionable "stale" maintenance trigger through the real branding
// modules (lifecycle / retrieval / evidence), exactly as the maintenance
// service consumes them. Changing `revisionSuffix` yields a different source
// revision so the notification policy treats it as a changed revision / fresh
// dedup key.
function staleSnapshot(revisionSuffix) {
  const sourceRevision = HASH(revisionSuffix ? `source-stale-v3:${revisionSuffix}` : "source-stale-v3");
  const document = { document_id: "knowledge_stale", canonical_revision: HASH("knowledge-stale-v1"), source_ids: ["source_stale"] };
  const trigger = {
    trigger_id: "trigger_stale",
    type: "stale",
    trigger_revision: HASH("trigger-stale-v1"),
    canonical_ids: ["knowledge_stale"],
    source_ids: ["source_stale"],
    source_snapshots: [{ source_id: "source_stale", source_revision: sourceRevision, extractor_revision: HASH("extractor-stale-v2") }],
    evidence_ids: ["evidence_stale"],
  };
  const snapshotRevision = HASH("maintenance-snapshot-v1");
  const lifecycle = {
    snapshot_revision: snapshotRevision,
    current_revision: snapshotRevision,
    canonical_documents: [document],
    triggers: [trigger],
    feedback: [],
  };
  const retrieval = {
    snapshot_revision: snapshotRevision,
    candidates: [{ document_id: "knowledge_stale", canonical_revision: document.canonical_revision }],
    denied_source_ids: [],
    hint_status: "advisory",
  };
  const citation = {
    citation_id: "citation_stale_0",
    source_id: "source_stale",
    source_revision: sourceRevision,
    extractor_revision: HASH("extractor-stale-v2"),
    source_span: { locator: "ZETA/LITERATURE/source_stale.md#L1", start: 0, end: 8 },
    span_digest: HASH("evidence_stale:source_stale:0"),
  };
  const evidence = {
    snapshot_revision: snapshotRevision,
    records: [{
      evidence_id: "evidence_stale",
      evidence_revision: HASH("evidence_stale:v1"),
      canonical_ids: ["knowledge_stale"],
      source_ids: ["source_stale"],
      citations: [citation],
      claims: [{ claim_id: "claim_stale_0", citation_ids: ["citation_stale_0"] }],
      status: "accepted",
    }],
  };
  function brand(moduleName, fn, input) {
    const res = VIEW(moduleName)[fn](JSON.stringify(input));
    assert.equal(res.ok, true, `${moduleName}.${fn} failed: ${JSON.stringify(res)}`);
    return res.value;
  }
  return {
    lifecycle: brand("llmwiki-knowledge-lifecycle.js", "createMaintenanceSnapshot", lifecycle),
    retrieval: brand("llmwiki-retrieval-service.js", "createMaintenanceRetrievalRecord", retrieval),
    evidence: brand("llmwiki-evidence-contract.js", "createMaintenanceEvidenceRecord", evidence),
  };
}

test("active maintenance scheduling is shipped: manifest loads the seam and scan->policy->surface drives the required metrics", () => {
  // (a) the production manifest registers the maintenance scan, notification
  //     policy, and follower in the real Knowledge module graph.
  const manifest = VIEW("prodigy-workspace-manifest.js");
  const required = manifest.get("knowledge").required;
  assert.ok(required.includes("SYSTEM/Views/llmwiki-maintenance-service.js"), "manifest must register maintenance-service");
  assert.ok(required.includes("SYSTEM/Views/llmwiki-notification-policy.js"), "manifest must register notification-policy");
  assert.ok(required.includes("SYSTEM/Views/llmwiki-maintenance-follower.js"), "manifest must register the maintenance follower seam");

  // (b) executable seam: real maintenance.scan -> real notificationPolicy.apply
  //     -> real surface dispatch, zero canonical/approval/write calls.
  const Maintenance = VIEW("llmwiki-maintenance-service.js");
  const Policy = VIEW("llmwiki-notification-policy.js");
  const Follower = VIEW("llmwiki-maintenance-follower.js");

  let now = 1000;
  let currentSnap = staleSnapshot();
  const dispatched = [];
  const hooks = { canonical: 0, approval: 0, write: 0 };
  const follower = Follower.create({
    maintenance: Maintenance,
    policyModule: Policy,
    clock: () => now,
    snapshots: () => currentSnap,
    surface: (notice) => dispatched.push(notice),
    canonical() { hooks.canonical += 1; },
    approval() { hooks.approval += 1; },
    write() { hooks.write += 1; },
  });
  const policy = follower.policy();

  // first actionable scan -> 1
  assert.equal(follower.tick(0).notices, 1, "first notification must be 1");
  assert.equal(dispatched.length, 1);

  // duplicate scan (same reason + source revision) -> 0
  assert.equal(follower.tick(1).notices, 0, "duplicate must not re-notify");
  assert.equal(dispatched.length, 1);

  // mute -> 0
  policy.mute("stale", [HASH("source-stale-v3")]);
  assert.equal(follower.tick(2).notices, 0, "muted must not notify");
  assert.equal(dispatched.length, 1);

  // ignore (fresh reason+revision that WOULD otherwise notify) -> 0
  currentSnap = staleSnapshot("ign");
  policy.ignore("stale", [HASH("source-stale-v3:ign")]);
  assert.equal(follower.tick(3).notices, 0, "ignored must not notify");
  assert.equal(dispatched.length, 1);

  // snooze before expiry -> 0, after injected-clock advance -> 1 (through seam)
  currentSnap = staleSnapshot("snz");
  const snoozeRev = HASH("source-stale-v3:snz");
  assert.equal(follower.tick(4).notices, 1, "snooze target first notifies once");
  assert.equal(dispatched.length, 2);
  policy.snooze("stale", [snoozeRev], now + 500);
  assert.equal(follower.tick(5).notices, 0, "snoozed before expiry must not notify");
  assert.equal(follower.tick(6).dispatches[0].status, "snoozed", "snooze-before outcome typed");
  now += 1000; // advance injected clock past the snooze expiry
  assert.equal(follower.tick(7).notices, 1, "snoozed must notify again after expiry");
  assert.equal(dispatched.length, 3, "snooze-after adds exactly one notice");

  // changed source revision for the same reason -> re-notify once
  currentSnap = staleSnapshot("chg");
  const beforeChanged = dispatched.length;
  assert.equal(follower.tick(8).notices, 1, "changed source revision must re-notify once");
  assert.equal(dispatched.length, beforeChanged + 1);
  assert.equal(follower.tick(9).notices, 0, "changed-revision duplicate must not re-notify");

  // canonical / approval / write hooks never reached across every dispatch
  assert.deepEqual(hooks, { canonical: 0, approval: 0, write: 0 });

  // schedule cleanup: start() subscribes and dispose() cancels
  let subscribed = 0, cancelled = 0;
  const scheduled = Follower.create({
    maintenance: Maintenance, policyModule: Policy, clock: () => now,
    snapshots: () => staleSnapshot(), surface: () => {},
    schedule: () => { subscribed += 1; return () => { cancelled += 1; }; },
  });
  scheduled.start();
  assert.equal(subscribed, 1, "start must subscribe the scheduler");
  scheduled.dispose();
  assert.equal(cancelled, 1, "dispose must cancel the scheduler subscription");
});

test("defaultNoticeSurface renders a real notice badge without writing canonical", () => {
  const Follower = VIEW("llmwiki-maintenance-follower.js");
  const created = [];
  const fakeDoc = {
    createElement(tag) { const el = { tag, attrs: {}, textContent: "", setAttribute(n, v) { this.attrs[n] = v; }, appendChild() {} }; created.push(el); return el; },
  };
  const host = {
    ownerDocument: fakeDoc,
    querySelector: () => null,
    appendChild(child) { this.child = child; },
  };
  const render = Follower.defaultNoticeSurface(host);
  render({ reason: "stale", explanation: "The bound evidence is no longer current." });
  assert.ok(host.child, "defaultNoticeSurface must append a notice badge to the host");
  assert.match(host.child.textContent, /stale/);
  assert.equal(host.child.attrs["data-maintenance-notice"], "", "notice badge must carry the surface marker");
});

test("malformed snapshot and malformed proposal inputs never emit through the seam", () => {
  const Maintenance = VIEW("llmwiki-maintenance-service.js");
  const Policy = VIEW("llmwiki-notification-policy.js");
  const Follower = VIEW("llmwiki-maintenance-follower.js");
  let emitted = 0;

  const broken = Follower.create({
    maintenance: Maintenance, policyModule: Policy, clock: () => 0,
    snapshots: () => ({ lifecycle: {}, retrieval: {}, evidence: null }),
    surface: () => { emitted += 1; },
  });
  const err = broken.tick(0);
  assert.equal(err.ok, false, JSON.stringify(err));
  assert.equal(err.status, "error", JSON.stringify(err));
  assert.equal(emitted, 0, "incomplete snapshot must not emit");

  const follower = Follower.create({
    maintenance: Maintenance, policyModule: Policy, clock: () => 0,
    snapshots: () => ({ lifecycle: {}, retrieval: {}, evidence: {} }),
    surface: () => { emitted += 1; },
  });
  const decision = follower.policy().apply({ type: "", source_revisions: [42] });
  assert.equal(decision.ok, false, JSON.stringify(decision));
  assert.equal(decision.status, "error", JSON.stringify(decision));
  assert.equal(decision.notify, false, JSON.stringify(decision));
  assert.equal(emitted, 0, "malformed input must not emit");
});
