"use strict";

// Task 16 integration-repair manual driver: imports the REAL production modules
// (maintenance service, notification policy, maintenance follower) and drives
// the shipped scan->policy->surface seam with an injected deterministic clock.
// Writes an integration trace + manual metrics JSON under task-16/integration-repair/.

const path = require("node:path");
const crypto = require("node:crypto");
const fs = require("node:fs");

const ROOT = path.resolve(__dirname, "../../../../../..");
const VIEW = (name) => require(path.join(ROOT, "SYSTEM/Views", name));
const HASH = (value) => crypto.createHash("sha256").update(String(value), "utf8").digest("hex");

function staleSnapshot(revisionSuffix) {
  const sourceRevision = HASH(revisionSuffix ? `source-stale-v3:${revisionSuffix}` : "source-stale-v3");
  const document = { document_id: "knowledge_stale", canonical_revision: HASH("knowledge-stale-v1"), source_ids: ["source_stale"] };
  const trigger = {
    trigger_id: "trigger_stale", type: "stale", trigger_revision: HASH("trigger-stale-v1"),
    canonical_ids: ["knowledge_stale"], source_ids: ["source_stale"],
    source_snapshots: [{ source_id: "source_stale", source_revision: sourceRevision, extractor_revision: HASH("extractor-stale-v2") }],
    evidence_ids: ["evidence_stale"],
  };
  const snapshotRevision = HASH("maintenance-snapshot-v1");
  const lifecycle = { snapshot_revision: snapshotRevision, current_revision: snapshotRevision, canonical_documents: [document], triggers: [trigger], feedback: [] };
  const retrieval = { snapshot_revision: snapshotRevision, candidates: [{ document_id: "knowledge_stale", canonical_revision: document.canonical_revision }], denied_source_ids: [], hint_status: "advisory" };
  const citation = {
    citation_id: "citation_stale_0", source_id: "source_stale", source_revision: sourceRevision,
    extractor_revision: HASH("extractor-stale-v2"), source_span: { locator: "ZETA/LITERATURE/source_stale.md#L1", start: 0, end: 8 }, span_digest: HASH("evidence_stale:source_stale:0"),
  };
  const evidence = {
    snapshot_revision: snapshotRevision,
    records: [{
      evidence_id: "evidence_stale", evidence_revision: HASH("evidence_stale:v1"), canonical_ids: ["knowledge_stale"],
      source_ids: ["source_stale"], citations: [citation], claims: [{ claim_id: "claim_stale_0", citation_ids: ["citation_stale_0"] }], status: "accepted",
    }],
  };
  function brand(moduleName, fn, input) {
    const res = VIEW(moduleName)[fn](JSON.stringify(input));
    if (res.ok !== true) throw new Error(`${moduleName}.${fn} failed: ${JSON.stringify(res)}`);
    return res.value;
  }
  return {
    lifecycle: brand("llmwiki-knowledge-lifecycle.js", "createMaintenanceSnapshot", lifecycle),
    retrieval: brand("llmwiki-retrieval-service.js", "createMaintenanceRetrievalRecord", retrieval),
    evidence: brand("llmwiki-evidence-contract.js", "createMaintenanceEvidenceRecord", evidence),
  };
}

function run() {
  const Maintenance = VIEW("llmwiki-maintenance-service.js");
  const Policy = VIEW("llmwiki-notification-policy.js");
  const Follower = VIEW("llmwiki-maintenance-follower.js");
  const manifest = VIEW("prodigy-workspace-manifest.js");
  const required = manifest.get("knowledge").required;

  let now = 1000;
  let currentSnap = staleSnapshot();
  const surfaces = [];
  const hooks = { canonical: 0, approval: 0, write: 0 };
  const follower = Follower.create({
    maintenance: Maintenance, policyModule: Policy, clock: () => now,
    snapshots: () => currentSnap,
    surface: (notice) => surfaces.push(notice),
    canonical() { hooks.canonical += 1; }, approval() { hooks.approval += 1; }, write() { hooks.write += 1; },
  });
  const policy = follower.policy();
  const trace = [];

  function step(label) { const r = follower.tick(trace.length); trace.push({ label, notices: r.notices, status: r.status }) && r; return r; }

  step("first");                     // 1
  step("duplicate");                 // 0
  policy.mute("stale", [HASH("source-stale-v3")]); step("mute");  // 0
  currentSnap = staleSnapshot("ign"); policy.ignore("stale", [HASH("source-stale-v3:ign")]); step("ignore"); // 0
  currentSnap = staleSnapshot("snz"); step("snooze-first"); policy.snooze("stale", [HASH("source-stale-v3:snz")], now + 500); step("snooze-before"); now += 1000; step("snooze-after"); // 0 then 1
  currentSnap = staleSnapshot("chg"); step("changed-revision-first"); step("changed-revision-duplicate"); // 1 then 0

  const stepNotices = Object.fromEntries(trace.map((t, i) => [t.label, t.notices]));

  // schedule cleanup via injected scheduler
  let subscribed = 0, cancelled = 0;
  const scheduled = Follower.create({
    maintenance: Maintenance, policyModule: Policy, clock: () => now,
    snapshots: () => staleSnapshot(), surface: () => {},
    schedule: () => { subscribed += 1; return () => { cancelled += 1; }; },
  });
  scheduled.start(); scheduled.dispose();

  // defaultNoticeSurface renders a real badge (fake DOM host)
  const created = [];
  const fakeDoc = { createElement: (tag) => { const el = { tag, attrs: {}, textContent: "", setAttribute(n, v) { this.attrs[n] = v; } }; created.push(el); return el; } };
  const host = { ownerDocument: fakeDoc, querySelector: () => null, appendChild(c) { this.child = c; } };
  Follower.defaultNoticeSurface(host)({ reason: "stale", explanation: "explained" });

  const metrics = {
    firstNotification: stepNotices.first,
    duplicate: stepNotices.duplicate,
    muteOrIgnore: (stepNotices.mute + stepNotices.ignore),
    snoozeBefore: stepNotices["snooze-before"],
    snoozeAfter: stepNotices["snooze-after"],
    changedRevision: stepNotices["changed-revision-first"],
    changedRevisionDuplicate: stepNotices["changed-revision-duplicate"],
    canonicalWriterCalls: hooks.canonical,
    approvalCalls: hooks.approval,
    writeCalls: hooks.write,
    totalSurfaceNotices: surfaces.length,
  };

  return {
    ok:
      metrics.firstNotification === 1 && metrics.duplicate === 0 && metrics.muteOrIgnore === 0 &&
      metrics.snoozeBefore === 0 && metrics.snoozeAfter === 1 && metrics.changedRevision === 1 &&
      metrics.changedRevisionDuplicate === 0 && metrics.canonicalWriterCalls === 0 &&
      metrics.approvalCalls === 0 && metrics.writeCalls === 0,
    schema_version: "task16-integration-repair-manual-driver-v1",
    integration_trace: {
      call_path: "scheduled scan (llmwiki-maintenance-service.scanMaintenance) -> actionable proposal -> llmwiki-notification-policy.apply() -> emit dispatch to surface",
      manifest_registers: {
        maintenance_service: required.includes("SYSTEM/Views/llmwiki-maintenance-service.js"),
        notification_policy: required.includes("SYSTEM/Views/llmwiki-notification-policy.js"),
        follower: required.includes("SYSTEM/Views/llmwiki-maintenance-follower.js"),
      },
      step_notices: stepNotices,
      schedule_cleanup: { subscribed, cancelled, cancel_proven: subscribed === 1 && cancelled === 1 },
      default_surface_renders_badge: Boolean(host.child && created.length),
    },
    metrics,
  };
}

const receipt = run();
const base = path.join(ROOT, ".omo/evidence/prodigy-llmwiki-autonomous-knowledge-git/task-16/integration-repair");
fs.mkdirSync(base, { recursive: true });
fs.writeFileSync(path.join(base, "driver-metrics.json"), JSON.stringify(receipt, null, 2) + "\n");
console.log("TASK16_INTEGRATION_DRIVER " + JSON.stringify(receipt.metrics));
process.exit(receipt.ok ? 0 : 1);
