"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { test } = require("node:test");

const ROOT = path.resolve(__dirname, "../../../../../..");
const VIEW_PATH = path.join(ROOT, "SYSTEM/Views/llmwiki-lifecycle-view.js");
const RECOVERY_PATH = path.join(ROOT, "SYSTEM/Views/llmwiki-ui-recovery.js");
const { action, click, mountRoot, serialize, snapshot, walk } = require("./llmwiki_lifecycle_view_fixture.js");

function mount(overrides = {}, status = "idle", options = {}) {
  delete require.cache[VIEW_PATH];
  const { root } = mountRoot();
  const calls = [];
  const view = require(VIEW_PATH).mountLlmWikiLifecycleView({
    container: root,
    snapshot: snapshot(status, overrides),
    onAction(intent) { calls.push(JSON.parse(JSON.stringify(intent))); return { ok: true }; },
    reviewView: options.reviewView,
  });
  return { root, calls, view };
}

function inbox(pending, overrides = {}) {
  return {
    state: pending > 0 ? "queued" : "up_to_date",
    scanned_total: pending,
    eligible: pending,
    held: 0,
    pending,
    unchanged: 0,
    processed: 0,
    succeeded: 0,
    failed: 0,
    provider_calls: 0,
    ...overrides,
  };
}

test("inbox source and focus order is heading, complete primary-first action cluster, then supporting copy", () => {
  for (const [pending, state, primaryAction] of [[3, "queued", "analyze-inbox"], [0, "empty", "scan-inbox"]]) {
    const subject = mount({
      provider_key: "openrouter",
      provider_readiness: { ready: true, code: "ready" },
      provider_options: [{ provider_key: "openrouter", name: "OpenRouter", model: "openrouter/free", configured: true }],
      inbox: inbox(pending, { state }),
    });
    const surface = subject.root.querySelector('[data-surface="llmwiki-lifecycle"]');
    const direct = surface.children;
    const headingIndex = direct.findIndex((node) => node.tag === "header");
    const actionsIndex = direct.findIndex((node) => node.attr?.class === "llmwiki-lifecycle__actions");
    const supportIndexes = direct.map((node, index) => ({ node, index })).filter(({ node }) =>
      node.attr?.role === "status" || /llmwiki-lifecycle__(?:provider|batch-summary|progress-track|review-state)/u.test(node.attr?.class || "")
    ).map(({ index }) => index);
    const actions = direct[actionsIndex].children.filter((node) => node.tag === "button");
    assert.equal(headingIndex, 0, state);
    assert.equal(actionsIndex, 1, state);
    assert.equal(actions[0].getAttribute("data-action"), primaryAction, state);
    assert.equal(actions[0].getAttribute("data-primary"), "true", state);
    assert.ok(supportIndexes.length > 0 && supportIndexes.every((index) => index > actionsIndex), state);
    assert.deepEqual(subject.calls, []);
  }
});

test("Knowledge projects pending 0/1/3/10 into exact machine priority without calling the provider", () => {
  const expected = [[0, "none"], [1, "subtle"], [3, "emphasized"], [10, "backlog"]];
  for (const [count, priority] of expected) {
    const subject = mount({ inbox: inbox(count) });
    const surface = subject.root.querySelector('[data-surface="llmwiki-lifecycle"]');
    assert.equal(surface.getAttribute("data-pending-count"), String(count));
    assert.equal(surface.getAttribute("data-pending-priority"), priority);
    assert.deepEqual(subject.calls, []);
    assert.equal(action(subject.root, "analyze-inbox") !== null, count >= 1);
  }
});

test("inherited provider/model/readiness and pack/review state are read-only and machine-addressable", () => {
  const subject = mount({
    provider_key: "openrouter",
    provider_readiness: { ready: false, code: "provider_auth_required" },
    provider_options: [{ provider_key: "openrouter", name: "OpenRouter", model: "openrouter/free", configured: false }],
    inbox: inbox(3, { state: "analyzing", pack_progress: { completed: 1, total: 4, current: 2 }, proposal_pending: 2 }),
    risk_packets: [{ packet_id: "packet_fixture" }],
  });
  const provider = subject.root.querySelector('[data-provider-inheritance="global"]');
  assert.equal(provider.getAttribute("data-provider-key"), "openrouter");
  assert.equal(provider.getAttribute("data-provider-model"), "openrouter/free");
  assert.equal(provider.getAttribute("data-provider-ready"), "false");
  assert.equal(provider.getAttribute("data-provider-readiness-code"), "provider_auth_required");
  assert.equal(subject.root.querySelector('[data-progress-kind="pack"]').getAttribute("data-pack-completed"), "1");
  assert.equal(subject.root.querySelector('[data-progress-kind="pack"]').getAttribute("data-pack-total"), "4");
  assert.equal(subject.root.querySelector('[data-review-state]').getAttribute("data-review-count"), "2");
  assert.equal(walk(subject.root, (node) => node.tag === "select" && node.getAttribute("data-provider-selector")).length, 0);
  assert.deepEqual(subject.calls, []);
});

test("protected disclosure exposes only filenames and typed local reasons", () => {
  const subject = mount({
    inbox: inbox(1, {
      scanned_total: 3,
      eligible: 1,
      held: 2,
      protected_items: [
        { filename: "비공개.md", reason: "protected_source", source_body: "NEVER_RENDER_SECRET_BODY" },
        { filename: "사람.md", reason: "people_local_only", source_body: "NEVER_RENDER_PEOPLE_BODY" },
      ],
    }),
  });
  const disclosure = subject.root.querySelector('[data-disclosure="protected-sources"]');
  assert.ok(disclosure);
  assert.equal(disclosure.getAttribute("data-protected-count"), "2");
  assert.match(disclosure.textContent + walk(disclosure, () => true).map((node) => node.text).join(" "), /비공개\.md/u);
  assert.doesNotMatch(serialize(disclosure), /NEVER_RENDER_SECRET_BODY|NEVER_RENDER_PEOPLE_BODY/u);
  assert.equal(action(subject.root, "override-protected"), null);
  assert.equal(action(subject.root, "send-protected"), null);
  assert.deepEqual(subject.calls, []);
});

test("strict recovery variants emit only contract intents with variant-specific CTA hierarchy", () => {
  delete require.cache[RECOVERY_PATH];
  const recovery = require(RECOVERY_PATH);
  const cases = {
    config: [["open_ai_settings", true], ["retry_analysis", false], ["later", false]],
    auth: [["open_ai_settings", true], ["retry_analysis", false], ["later", false]],
    quota: [["retry_analysis", true], ["open_ai_settings", false], ["later", false]],
    provider: [["open_ai_settings", true], ["retry_analysis", false], ["later", false]],
    outcome_unknown: [["retry_analysis", true], ["later", false]],
    stale: [["repacket", true], ["later", false]],
    repacket: [["repacket", true], ["later", false]],
    blocked: [["retry_analysis", true], ["later", false]],
  };
  const allowed = new Set(["open_ai_settings", "retry_analysis", "repacket", "later"]);
  for (const [variant, expected] of Object.entries(cases)) {
    const configured = recovery.recoveryActions(variant);
    assert.deepEqual(configured.map((item) => [item.action, item.primary === true]), expected, variant);
    assert.equal(configured.every((item) => allowed.has(item.action)), true, variant);
    const state = variant === "outcome_unknown" ? "outcome_unknown" : "blocked";
    const subject = mount({ inbox: inbox(3, { state, recovery_variant: variant, reason: variant }) }, "failed");
    const controls = walk(subject.root, (node) => node.getAttribute && node.getAttribute("data-recovery-action"));
    assert.deepEqual(controls.map((node) => [node.getAttribute("data-recovery-action"), node.getAttribute("data-primary") === "true"]), expected, variant);
  }
  assert.equal(recovery.reasonFor({ code: "unknown", message: "timeout timed out auth quota" }), "unknown");

  const emitted = [];
  for (const actionName of cases.quota.map(([actionName]) => actionName)) {
    const single = mount({ inbox: inbox(3, { state: "blocked", recovery_variant: "quota", reason: "provider_quota_exhausted" }) }, "failed");
    click(walk(single.root, (node) => node.getAttribute && node.getAttribute("data-recovery-action") === actionName)[0]);
    emitted.push(...single.calls.map((intent) => intent.action));
  }
  assert.deepEqual(emitted, ["retry_analysis", "open_ai_settings", "later"]);
});

test("production review+complete renders batch metadata and approval surface together", () => {
  const packet = { packet_hash: "c".repeat(64), operations: [] };
  const reviewView = {
    mountLlmWikiApprovalReview(options) {
      options.container.createEl("section", { text: "실제 제안 검토", attr: { "data-surface": "llmwiki-approval-review" } });
      return {};
    },
  };
  const subject = mount({
    inbox: inbox(3, { state: "complete", processed: 3, succeeded: 3, proposal_pending: 2, pack_progress: { completed: 2, total: 2, current: 2 } }),
    approval_packet: packet,
  }, "review", { reviewView });
  assert.equal(subject.root.querySelector('[data-state="review"]') !== null, true);
  assert.equal(subject.root.querySelector('[data-progress-kind="pack"]').getAttribute("data-pack-completed"), "2");
  assert.equal(subject.root.querySelector('[data-review-state="review_ready"]').getAttribute("data-review-count"), "2");
  assert.ok(subject.root.querySelector('[data-surface="llmwiki-approval-review"]'));
  assert.ok(subject.root.querySelector('[data-review-affordance="proposal-review"]'));
  assert.equal(action(subject.root, "scan-inbox"), null);
});

test("production failed+inbox recovery shapes prioritize typed variants and contract actions", () => {
  const cases = [
    ["auth", "blocked", "provider_auth_required", ["open_ai_settings", "retry_analysis", "later"]],
    ["quota", "blocked", "provider_quota_exhausted", ["retry_analysis", "open_ai_settings", "later"]],
    ["config", "blocked", "configuration_unavailable", ["open_ai_settings", "retry_analysis", "later"]],
    ["provider", "blocked", "provider_unavailable", ["open_ai_settings", "retry_analysis", "later"]],
    ["outcome_unknown", "outcome_unknown", "outcome_unknown", ["retry_analysis", "later"]],
    ["blocked", "blocked", "blocked", ["retry_analysis", "later"]],
  ];
  for (const [variant, state, reason, expectedActions] of cases) {
    const subject = mount({ inbox: inbox(3, { state, reason, recovery_variant: variant }) }, "failed");
    const surface = subject.root.querySelector('[data-surface="llmwiki-lifecycle"]');
    assert.equal(surface.getAttribute("data-state"), `inbox_${state}`, variant);
    const recovery = walk(subject.root, (node) => node.getAttribute && node.getAttribute("data-recovery-variant") === variant)
      .find((node) => walk(node, (child) => child.getAttribute && child.getAttribute("data-recovery-action")).length > 0);
    assert.ok(recovery, variant);
    assert.deepEqual(walk(recovery, (node) => node.getAttribute && node.getAttribute("data-recovery-action")).map((node) => node.getAttribute("data-recovery-action")), expectedActions, variant);
    assert.equal(action(subject.root, "select-source"), null, variant);
  }
});

test("recovery copy keeps the fixed system tail in one longest-match atomic span with a legal break", () => {
  for (const [state, variant] of [["blocked", "auth"], ["outcome_unknown", "outcome_unknown"]]) {
    const subject = mount({ inbox: inbox(3, { state, recovery_variant: variant, reason: variant }) }, "failed");
    const tails = walk(subject.root, (node) => node.getAttribute && node.getAttribute("data-recovery-atomic-tail"));
    assert.equal(tails.length, 1);
    assert.equal(tails[0].getAttribute("data-recovery-atomic-tail"), "pending-material-retained");
    assert.equal(tails[0].text, "대기 자료는 그대로 유지됩니다.");
    const status = subject.root.querySelector('[role="status"]');
    assert.equal(status.getAttribute("data-atomic-recovery-copy"), "true");
  }
  const lifecycle = fs.readFileSync(VIEW_PATH, "utf8");
  assert.match(lifecycle, /function splitRecoveryTail\(/u);
  assert.match(lifecycle, /sort\(\(left, right\) => right\.length - left\.length\)/u);
  const style = fs.readFileSync(path.join(ROOT, "SYSTEM/Views/knowledge-styles.js"), "utf8");
  assert.match(style, /\[data-recovery-atomic-tail\][^}]*white-space:\s*nowrap/su);
  assert.doesNotMatch(style, /llmwiki-lifecycle__status[^}]*white-space:\s*nowrap/su);
});

test("Task 12 screenshot harness mounts the real production approval review child", () => {
  const harness = fs.readFileSync(path.join(ROOT, "SYSTEM/AI/Reports/task-12/task12-state-harness.html"), "utf8");
  for (const moduleName of ["llmwiki-hash.js", "llmwiki-operation-contract.js", "llmwiki-risk-approval-packet.js", "llmwiki-safe-batch-approval.js", "llmwiki-risk-approval-review-view.js"]) {
    assert.match(harness, new RegExp(moduleName.replaceAll(".", "\\."), "u"), moduleName);
  }
  assert.doesNotMatch(harness, /reviewView:\s*\{\s*mountLlmWikiApprovalReview/u);
  assert.match(harness, /LLMWikiRiskApprovalPacket\.buildRiskApprovalPacket/u);
  assert.match(harness, /risk_packets:\s*reviewPackets/u);
  assert.match(harness, /data-surface="llmwiki-risk-approval-review"/u);
  assert.match(harness, /data-real-review-child/u);
  assert.match(harness, /name:\s*"config"[\s\S]*recovery_variant:\s*"config"[\s\S]*reason:\s*"configuration_unavailable"/u);
  assert.match(harness, /name:\s*"review-selected"[\s\S]*risk_packets:\s*reviewPackets/u);
  assert.match(harness, /firstProposal\.dispatchEvent\(new Event\("change"/u);
  assert.match(harness, /selected_count:\s*selectedReview\.querySelectorAll/u);
  assert.match(harness, /batch_approval_visible_unclipped:\s*visibleAndUnclipped/u);
  assert.match(harness, /typography_contract_violations/u);
  assert.match(harness, /risk_reason_separator_text_nodes/u);
  const capture = fs.readFileSync(path.join(ROOT, "SYSTEM/AI/Reports/task-12/capture-task12-state-harness.js"), "utf8");
  assert.match(capture, /const FOCUSED_STATES = \["review", "review-selected", "generic-blocked", "pending-3"\]/u);
  assert.match(capture, /for \(const state of FOCUSED_STATES\)/u);
  assert.match(harness, /interactive_target_metrics/u);
  assert.match(harness, /undersized_interactive_targets/u);
  assert.match(capture, /undersized_interactive_targets\.length/u);
  assert.match(capture, /interactive_target_metrics\.length/u);
});

test("progress tracks have visible completed/total labels and protected disclosure preserves native semantics", () => {
  const subject = mount({ inbox: inbox(3, { state: "analyzing", pack_progress: { completed: 1, total: 4, current: 2 }, protected_items: [{ filename: "보호.md", reason: "protected_source" }] }) });
  for (const track of walk(subject.root, (node) => node.getAttribute && node.getAttribute("data-progress-kind"))) {
    assert.ok(walk(track, (node) => node.getAttribute && node.getAttribute("data-progress-label") === "true").length, track.getAttribute("data-progress-kind"));
  }
  const disclosure = subject.root.querySelector('[data-disclosure="protected-sources"]');
  assert.equal(disclosure.tag, "details");
  assert.equal(walk(disclosure, (node) => node.tag === "summary").length, 1);
});

test("local and future mobile-remote display variants remain distinct without remote trigger controls", () => {
  const local = mount({ inbox: inbox(1), display_variant: "local" });
  assert.equal(local.root.querySelector('[data-surface="llmwiki-lifecycle"]').getAttribute("data-display-variant"), "local");
  const future = mount({ inbox: inbox(1), display_variant: "mobile_remote" });
  assert.equal(future.root.querySelector('[data-surface="llmwiki-lifecycle"]').getAttribute("data-display-variant"), "mobile_remote");
  assert.equal(walk(future.root, (node) => /remote|host|tailscale/u.test(node.getAttribute?.("data-intent-action") || "")).length, 0);
});

test("approval prose uses the generic Korean-safe typography primitive and structured risk reasons", () => {
  const style = fs.readFileSync(path.join(ROOT, "SYSTEM/Views/knowledge-styles.js"), "utf8");
  const review = fs.readFileSync(path.join(ROOT, "SYSTEM/Views/llmwiki-risk-approval-review-view.js"), "utf8");
  assert.match(style, /\.llmwiki-cjk-prose\s*\{[^}]*word-break:\s*keep-all[^}]*text-wrap:\s*pretty[^}]*overflow-wrap:\s*anywhere/su);
  for (const role of ["intro", "document-preview", "summary", "risk", "provenance"]) {
    assert.match(review, new RegExp(`data-typography-role["']?:\\s*["']${role}["']`, "u"), role);
  }
  assert.match(review, /data-risk-reasons/u);
  assert.match(review, /data-risk-reason/u);
  assert.doesNotMatch(review, /packet\.risk\.reasons[^;\n]*\.join\(/u);
  assert.match(style, /\[data-typography-role="intro"\]\s*\{[^}]*font-size:\s*var\(--ke-type-label\)/su);
  assert.match(style, /data-surface="llmwiki-lifecycle"\]\[data-state="review"\]\.prodigy-full-bleed\s*\{[^}]*padding-inline:\s*var\(--ke-space-1,\s*4px\)/su);
  assert.match(style, /\.llmwiki-approval-review__risk-reasons\s*\{[^}]*display:\s*flex[^}]*flex-wrap:\s*wrap[^}]*gap:/su);
  assert.doesNotMatch(style, /\.llmwiki-approval-review__risk-reasons[^}]*white-space:\s*nowrap/su);
});

test("Task 12 styling stays token-driven and preserves one scroll owner", () => {
  const style = fs.readFileSync(path.join(ROOT, "SYSTEM/Views/knowledge-styles.js"), "utf8");
  assert.match(style, /data-pending-priority="emphasized"/u);
  assert.match(style, /data-pending-priority="backlog"/u);
  assert.match(style, /data-backlog-label/u);
  assert.match(style, /llmwiki-lifecycle__metrics[^}]*min-inline-size:\s*0/su, "batch metric cluster must be allowed to shrink inside the lifecycle content box");
  assert.match(style, /llmwiki-lifecycle__metric[^}]*min-inline-size:\s*0[^}]*white-space:\s*normal[^}]*overflow-wrap:\s*anywhere/su, "batch labels must wrap rather than impose an intrinsic inline floor");
  assert.match(style, /llmwiki-lifecycle__protected\s*>\s*summary::before/u);
  assert.doesNotMatch(style, /llmwiki-lifecycle__status[^}]*border-radius:\s*var\(--ke-radius-control,\s*6px\)/su);
  assert.doesNotMatch(style, /llmwiki-lifecycle__queue[^}]*border-radius:\s*var\(--ke-radius-panel,\s*12px\)/su);
  assert.doesNotMatch(style, /overflow-x:\s*(auto|scroll)/u);
  assert.doesNotMatch(style, /#[0-9a-fA-F]{3,8}|rgb\s*\(/u);
  assert.match(style, /llmwiki-lifecycle\s*>\s*\.llmwiki-lifecycle__review\s*,[^{]*\{[^}]*padding-inline:\s*var\(--ke-space-2,\s*8px\)/su);
  assert.match(style, /llmwiki-lifecycle__review\s+\.llmwiki-lifecycle__queue\s*\{[^}]*padding-inline:\s*var\(--ke-space-2,\s*8px\)/su);
  assert.match(style, /llmwiki-lifecycle__review\s+\.llmwiki-approval-review\.prodigy-full-bleed\s*\{[^}]*padding-inline:\s*0/su);
  assert.match(style, /llmwiki-approval-review__operation\s+dd\.llmwiki-approval-review__prose\s*\{[^}]*text-wrap:\s*balance/su);
  assert.match(style, /llmwiki-approval-review__atomic-tail\s*\{[^}]*white-space:\s*nowrap/su);
  assert.doesNotMatch(style, /@media\s*\(max-width:\s*240px\)[\s\S]*?llmwiki-lifecycle__queue\s*>\s*h3[^}]*display:\s*none/su, "narrow review queue headings must remain visible");
  assert.doesNotMatch(style, /\.knowledge-workspace-tab-desc\s*\{[^}]*display:\s*none/su, "compact workspace descriptions must remain visible");
  assert.match(style, /\.knowledge-workspace-tab-desc\s*\{[^}]*min-inline-size:\s*0[^}]*word-break:\s*keep-all[^}]*overflow-wrap:\s*anywhere/su, "compact descriptions must wrap without an intrinsic floor");
  assert.doesNotMatch(style, /llmwiki-lifecycle\[data-state\^="inbox_"\][^}]*\border\s*:/su, "inbox hierarchy must come from source order rather than CSS order");
  assert.doesNotMatch(style, /\.llmwiki-lifecycle\[data-state\^="inbox_"\][^{]*\{[^}]*display:\s*none/su, "inbox zoom reflow must not hide lifecycle copy");
  assert.doesNotMatch(style, /\.llmwiki-approval-review__decision-strip\s+button:disabled\s*\{[^}]*display:\s*none/su, "unavailable review actions must retain native disabled rendering");
  const reviewView = fs.readFileSync(path.join(ROOT, "SYSTEM/Views/llmwiki-risk-approval-review-view.js"), "utf8");
  assert.match(reviewView, /data-disabled-reason-for/u, "disabled review controls must expose a visible reason");
  assert.match(reviewView, /aria-describedby/u, "disabled review controls must bind their reason accessibly");
  assert.doesNotMatch(style, /@media\s*\(max-width:\s*240px\)[\s\S]*?llmwiki-approval-review\s*>\s*header\s*>\s*p[^}]*display:\s*none/su, "narrow review intro copy must remain visible");
});

test("controller visual fixture releases lifecycle dispatch before its cancellable provider settles", () => {
  const fixture = fs.readFileSync(path.join(ROOT, "SYSTEM/AI/Skills/prodigy-review/tests/knowledge/llmwiki_controller_qa_fixture.js"), "utf8");
  assert.doesNotMatch(fixture, /const pending = controller\.startRun\(command\(true\)\);[\s\S]*?await pending;/u, "awaiting the delayed provider inside onAction deadlocks the next cancel intent");
  assert.match(fixture, /void pending\.then\(/u, "provider completion must be observed without retaining the lifecycle dispatch lock");
  assert.match(fixture, /window\.addEventListener\("task15-fixture-provider-started", finish\);[\s\S]*?const pending = controller\.startRun\(command\(true\)\);[\s\S]*?void providerStarted\.then\(\(\) => \{ settle\(snapshot\(\)\); renderReceipt\(\); \}\)/u, "running state must use an exact provider-start subscription armed before the trigger");
});

test("fleeting review action owns flat 44px component-scoped chrome", () => {
  const style = fs.readFileSync(path.join(ROOT, "SYSTEM/Views/knowledge-styles.js"), "utf8");
  for (const selector of ["\\.knowledge-fleeting-summary > button\\.prodigy-btn", "\\.llmwiki-lifecycle__fleeting \\.llmwiki-lifecycle__actions button"]) {
    assert.match(style, new RegExp(`${selector}\\s*\\{[^}]*min-block-size:\\s*var\\(--ke-touch-target,\\s*44px\\)[^}]*min-height:\\s*var\\(--ke-touch-target,\\s*44px\\)[^}]*height:\\s*auto\\s*!important[^}]*box-shadow:\\s*none\\s*!important`, "su"));
  }
  assert.doesNotMatch(style, /(?:^|[,{])\s*button\s*\{[^}]*box-shadow:\s*none\s*!important/msu, "Knowledge must not override every native button");
});

test("workspace tab separator suffixes are atomic semantic spans", () => {
  const tabsPath = path.join(ROOT, "SYSTEM/Views/knowledge-workspace-tabs.js");
  delete require.cache[tabsPath];
  const tabsApi = require(tabsPath);
  const { root } = mountRoot();
  tabsApi.mountTabs(root, { activeTab: "llmwiki" });
  for (const [id, suffix] of [["zettelkasten", "· 제텔카스텐"], ["llmwiki", "· LLM Wiki"]]) {
    const tab = walk(root, (node) => node.getAttribute?.("id") === `knowledge-tab-${id}`)[0];
    const atomic = walk(tab, (node) => node.getAttribute?.("data-tab-atomic-suffix") === "true");
    assert.equal(atomic.length, 1, id);
    assert.equal(atomic[0].text, suffix, id);
  }
  const style = fs.readFileSync(path.join(ROOT, "SYSTEM/Views/knowledge-styles.js"), "utf8");
  assert.match(style, /knowledge-workspace-tab-label__atomic-suffix\s*\{[^}]*display:\s*inline-block[^}]*white-space:\s*nowrap/su);
});

test("Knowledge AppShell body remains the sole bounded document scroll owner", () => {
  const shell = fs.readFileSync(path.join(ROOT, "SYSTEM/Views/prodigy-app-shell.js"), "utf8");
  assert.doesNotMatch(shell, /prodigy-app-shell:is\(\[data-tier="compact"\],\[data-tier="medium"\]\):is\([^)]*\[data-workspace-id="knowledge"\][^)]*\)\s*>\s*\.prodigy-app-shell-body\s*\{[^}]*overflow:\s*visible/su);
  assert.match(shell, /prodigy-app-shell\[data-workspace-id="knowledge"\]\s*>\s*\.prodigy-app-shell-body\s*\{[^}]*min-block-size:\s*0[^}]*overflow-y:\s*auto[^}]*overflow-x:\s*hidden/su);
  assert.match(shell, /markdown-preview-view\.prodigy-hub-note:has\([\s\S]*?prodigy-app-shell\[data-workspace-id="knowledge"\][\s\S]*?\)\s*\{[^}]*overflow-y:\s*hidden/su);
  assert.doesNotMatch(shell, /workspace-leaf-content:has\([\s\S]*?data-workspace-id="knowledge"[\s\S]*?\)\s*\{[^}]*overflow-y:\s*auto/su);
});
