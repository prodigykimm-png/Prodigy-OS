"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { test } = require("node:test");
const { action, click, collectText, mountRoot, snapshot, walk } = require("./llmwiki_lifecycle_view_fixture.js");
const { buildPages, runHub } = require("./knowledge_hub_integration_harness.js");

const ROOT = path.resolve(__dirname, "../../../../../..");
const lifecycle = require(path.join(ROOT, "SYSTEM/Views/llmwiki-lifecycle-view.js"));
const HUB = fs.readFileSync(path.join(ROOT, "HUB/50 Knowledge.md"), "utf8");

function mount(overrides) {
  const dom = mountRoot();
  const calls = [];
  const view = lifecycle.mountLlmWikiLifecycleView({
    container: dom.root,
    snapshot: snapshot("idle", overrides),
    onAction(intent) { calls.push(intent); return { ok: true, status: intent.action }; },
  });
  return { ...dom, calls, view };
}

function product(operation, inbox = null) {
  return lifecycle.projectLifecycleSnapshot(snapshot("idle", { operation_run: operation, ...(inbox ? { inbox } : {}) }));
}

test("projects real inbox snapshots into one beginner lifecycle state and one typed primary action", () => {
  const matrix = [
    ["empty", "scan-inbox", "scan_inbox"], ["queued", "analyze-inbox", "analyze_inbox"],
    ["importing", "cancel-inbox", "cancel_inbox"], ["ignored", "scan-inbox", "scan_inbox"],
    ["private", "scan-inbox", "scan_inbox"], ["error", "retry-inbox", "retry_inbox"],
    ["cancelled", "retry-inbox", "retry_inbox"],
  ];
  for (const [state, control, intent] of matrix) {
    const subject = mount({ inbox: { state, source_id: "source_visible_fixture" } });
    const enabledPrimary = walk(subject.root, (node) => node.tag === "button" && !node.disabled && node.getAttribute("data-primary") === "true");
    assert.equal(enabledPrimary.length, 1, state);
    assert.equal(action(subject.root, control), enabledPrimary[0], state);
    click(enabledPrimary[0]);
    assert.equal(subject.calls[0].action, intent, state);
    assert.equal(typeof subject.calls[0].action, "string");
  }
});

test("projects operation progress, refresh and Git follow-up without mutating the committed canonical outcome", () => {
  assert.equal(product({ status: "provider_pending" }).productState, "inbox_importing");
  assert.equal(product({ status: "failed" }).productState, "inbox_error");
  const canonical = Object.freeze({ status: "committed", path: "ZETA/PERMANENT/지식.md" });
  const failedRefresh = product({ status: "committed", canonical_outcome: canonical, follow_up: { status: "failed", refresh: { status: "failed" }, git: { status: "pending" } } });
  assert.equal(failedRefresh.productState, "operation_refresh_failed");
  const failedGit = product({ status: "committed", canonical_outcome: canonical, follow_up: { status: "failed", refresh: { status: "succeeded" }, git: { status: "failed" } } });
  assert.equal(failedGit.productState, "git_failed");
  assert.strictEqual(canonical.status, "committed");

  const refresh = mount({ operation_run: { status: "committed", canonical_outcome: canonical, follow_up: failedRefresh.followUp } });
  click(action(refresh.root, "retry-operation-refresh"));
  assert.deepEqual(refresh.calls, [{ action: "retry_follow_up", follow_up: "refresh" }]);
  const git = mount({ operation_run: { status: "committed", canonical_outcome: canonical, follow_up: failedGit.followUp } });
  click(action(git.root, "retry-git"));
  assert.deepEqual(git.calls, [{ action: "retry_follow_up", follow_up: "git" }]);
});

test("renders one canonical Git follow-up message across unavailable, retry, and recovery updates", () => {
  const canonical = Object.freeze({ status: "committed", path: "ZETA/PERMANENT/지식.md" });
  const operation = (git) => ({ status: "committed", canonical_outcome: canonical, follow_up: { status: git.status === "succeeded" ? "complete" : "failed", refresh: { status: "succeeded" }, git } });
  const statusCount = (root) => walk(root, (node) => String(node.getAttribute && node.getAttribute("class") || "").includes("llmwiki-lifecycle__status")).length;
  const subject = mount({ operation_run: operation({ status: "failed", attempts: 1, reason: "GitUnavailable" }) });
  assert.match(collectText(subject.root), /Git 백업 보류/);
  assert.equal(statusCount(subject.root), 1);

  subject.view.update(snapshot("idle", { operation_run: operation({ status: "pending", attempts: 2, reason: "post_eligibility_required" }) }));
  assert.match(collectText(subject.root), /지식 반영 완료.*Git 백업 보류/);
  assert.equal(statusCount(subject.root), 1);

  subject.view.update(snapshot("idle", { operation_run: operation({ status: "failed", attempts: 2, reason: "git_snapshot_failed" }) }));
  assert.match(collectText(subject.root), /지식은 안전하게 반영됐지만 Git 백업이 보류되었습니다/);
  assert.equal(statusCount(subject.root), 1);

  subject.view.update(snapshot("committed", { operation_run: operation({ status: "succeeded", attempts: 3, reason: null }) }));
  assert.match(collectText(subject.root), /지식 반영 완료/);
  assert.equal(statusCount(subject.root), 1);
});

test("keeps approval-ready and blocking conflict queues separate and excludes conflicts from eligible batches", () => {
  const eligible = { packet_id: "packet_eligible", conflict: { blocking_conflict_ids: [] }, batch_eligible: true };
  const conflict = { packet_id: "packet_conflict", conflict: { blocking_conflict_ids: ["conflict_hidden"] }, batch_eligible: false };
  const projected = lifecycle.projectLifecycleSnapshot(snapshot("review", { risk_packets: [conflict, eligible] }));
  assert.deepEqual(projected.approvals.map((row) => row.packet_id), ["packet_eligible"]);
  assert.deepEqual(projected.conflicts.map((row) => row.packet_id), ["packet_conflict"]);
  assert.equal(projected.conflicts.some((row) => row.batch_eligible), false);
});

test("production Hub loads and owns inbox intake, cancellation, retry, Task14 review and operation recovery routes", () => {
  const manifest = require(path.join(ROOT, "SYSTEM/Views/prodigy-workspace-manifest.js")).get("knowledge").required;
  for (const name of ["llmwiki-source-registry.js", "llmwiki-source-adapters.js", "llmwiki-inbox-discovery-queue.js", "knowledge-fleeting-store.js", "knowledge-command-controller.js", "knowledge-explorer-detail-modal.js", "knowledge-explorer-controller.js"]) {
    const modulePath = `SYSTEM/Views/${name}`;
    assert.equal(manifest.filter((entry) => entry === modulePath).length, 1, modulePath);
  }
  assert.ok(manifest.indexOf("SYSTEM/Views/knowledge-command-controller.js") < manifest.indexOf("SYSTEM/Views/knowledge-explorer-detail-modal.js"));
  assert.ok(manifest.indexOf("SYSTEM/Views/knowledge-explorer-detail-modal.js") < manifest.indexOf("SYSTEM/Views/knowledge-explorer-controller.js"));
  assert.ok(manifest.indexOf("SYSTEM/Views/llmwiki-ui-recovery.js") < manifest.indexOf("SYSTEM/Views/llmwiki-ai-provider-transport.js"));
  const maintenanceModules = [
    "llmwiki-maintenance-service.js",
    "llmwiki-notification-policy.js",
    "llmwiki-maintenance-follower.js",
  ].map((name) => `SYSTEM/Views/${name}`);
  for (const modulePath of maintenanceModules) {
    assert.equal(manifest.filter((entry) => entry === modulePath).length, 1, modulePath);
  }
  assert.ok(manifest.indexOf(maintenanceModules[0]) < manifest.indexOf(maintenanceModules[1]));
  assert.ok(manifest.indexOf(maintenanceModules[1]) < manifest.indexOf(maintenanceModules[2]));
  assert.match(HUB, /LLMWikiInboxDiscoveryQueue\.createInboxDiscoveryQueue/);
  assert.match(HUB, /inboxDiscoveryQueue\.discover\(/);
  assert.match(HUB, /inboxSubscribers\.add\(applyInboxState\)/);
  assert.match(HUB, /inboxSubscribers\.delete\(applyInboxState\)/);
  assert.doesNotMatch(HUB, /refreshInboxDiscovery/);
  assert.doesNotMatch(HUB, /(?:const|let|function)\s+refreshInbox(?:Discovery)?\b/);
  assert.match(HUB, /runInboxBatch/);
  assert.match(HUB, /createBatchAnalyzer/);
  assert.match(HUB, /scanned_total/);
  assert.match(HUB, /openPreparedRiskReview/);
  assert.match(HUB, /mountKnowledgeReviewWorkbench/);
  assert.match(HUB, /retryOperationFollowUp/);
  assert.match(HUB, /recoverOperation/);
  assert.match(HUB, /LLMWikiMaintenanceFollower/);
  assert.doesNotMatch(HUB, /\bsetInterval\b|\bmaintenance_interval\b/);
  assert.doesNotMatch(HUB, /LLMWikiMaintenanceService\.(?:write|commit|approve)\b/);
});

test("default lifecycle DOM omits raw canonical and internal fields and has no nested scroll owner", () => {
  const subject = mount({ inbox: { state: "queued", source_id: "source_internal_opaque" }, document_id: "document_internal", row_revision: "revision_internal", provider_id: "provider_internal" });
  const visible = collectText(subject.root, { excludeDetails: true, excludeStyles: true });
  assert.doesNotMatch(visible, /source_internal_opaque|document_internal|revision_internal|provider_internal|after_bytes|frontmatter|schema|packet_hash/i);
  assert.equal(walk(subject.root, (node) => node.getAttribute && node.getAttribute("data-scroll-owner")).length, 0);
});

test("central Knowledge stylesheet is the only lifecycle and browse selector source and enforces responsive geometry", () => {
  const shared = fs.readFileSync(path.join(ROOT, "SYSTEM/Views/knowledge-styles.js"), "utf8");
  const lifecycleSource = fs.readFileSync(path.join(ROOT, "SYSTEM/Views/llmwiki-lifecycle-view.js"), "utf8");
  const browseSource = fs.readFileSync(path.join(ROOT, "SYSTEM/Views/llmwiki-wiki-surface.js"), "utf8");
  assert.match(shared, /\.llmwiki-lifecycle/);
  assert.match(shared, /\.llmwiki-wiki-surface/);
  assert.match(shared, /max-width:\s*\$\{compactMax\}px/);
  assert.match(shared, /min-block-size:\s*var\(--ke-touch-target/);
  assert.doesNotMatch(shared, /\.llmwiki-lifecycle(?:__[\w-]+)?\s*\{[^}]*overflow-(?:x|y):\s*(?:auto|scroll)/);
  assert.match(shared, /\.llmwiki-wiki-detail-modal__scroll\s*\{[^}]*overflow-y:\s*auto/);
  assert.match(shared, /\.knowledge-review-detail-modal__scroll\s*\{[^}]*overflow-y:\s*auto/);
  assert.doesNotMatch(lifecycleSource, /createEl\(container, "style"/);
  assert.doesNotMatch(browseSource, /function injectStyles|llmwiki-wiki-surface-styles/);
});

test("Knowledge retains exactly four tabs", () => {
  const tabs = require(path.join(ROOT, "SYSTEM/Views/knowledge-workspace-tabs.js")).TABS;
  assert.deepEqual(tabs.map((tab) => tab.id), ["zettelkasten", "para", "llmwiki", "llmwiki-browse"]);
});
