"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const path = require("node:path");
const { test } = require("node:test");
const { collectText } = require("./knowledge_explorer_view_fakes.js");
const { firstElement, runHub } = require("./knowledge_hub_integration_harness.js");

const ROOT = path.resolve(__dirname, "../../../../../..");
const privacyBoundary = require(path.join(ROOT, "SYSTEM/Views/llmwiki-inbox-privacy-boundary.js"));

function actionButton(container, action) {
  return firstElement(container, "button", (node) => node.attr && node.attr["data-action"] === action);
}
function click(node) {
  assert.ok(node && typeof node.onclick === "function", "actual lifecycle action must be available");
  node.onclick({ preventDefault() {} });
}
function observer(callbackName) {
  const events = [];
  const waiters = new Set();
  return {
    events,
    [callbackName](event) {
      events.push(event);
      for (const waiter of [...waiters]) {
        if (!waiter.predicate(event)) continue;
        clearTimeout(waiter.timer);
        waiters.delete(waiter);
        waiter.resolve(event);
      }
    },
    waitFor(predicate, label) {
      const existing = events.find(predicate);
      if (existing) return Promise.resolve(existing);
      return new Promise((resolve, reject) => {
        const waiter = { predicate, resolve, timer: setTimeout(() => { waiters.delete(waiter); reject(new Error(`event timeout: ${label}`)); }, 2000) };
        waiters.add(waiter);
      });
    },
  };
}

test("strict privacy path parsing holds raw, encoded, double-encoded, separator, control, malformed, and overlong mutations", () => {
  const malformed = [
    "", "/INBOX/Knowledge/secret.md", "C:/INBOX/Knowledge/secret.md", "C:\\INBOX\\Knowledge\\secret.md",
    "INBOX/Knowledge/../secret.md", "INBOX/Knowledge/./secret.md", "INBOX//Knowledge/secret.md", "INBOX/Knowledge//secret.md",
    "INBOX/Knowledge\\secret.md", "INBOX/Knowledge/secret\u0000.md", "INBOX/Knowledge/secret\u001f.md", "INBOX/Knowledge/secret\u007f.md",
    "INBOX/Knowledge/secret?query.md", "INBOX/Knowledge/secret#fragment.md", "INBOX/Knowledge/%2e%2e/secret.md",
    "INBOX/Knowledge/.%2e/secret.md", "INBOX/Knowledge%2fsecret.md", "INBOX/Knowledge%5csecret.md",
    "INBOX/Knowledge/%252e%252e/secret.md", "INBOX/Knowledge%252fsecret.md", "INBOX/Knowledge/%00secret.md",
    "INBOX/Knowledge/%E0%A4%A.md", `INBOX/Knowledge/${"x".repeat(1024)}.md`,
  ];
  const valid = [
    ["INBOX/Knowledge/한국어 자료.md", {}, "knowledge_inbox"],
    ["INBOX/Knowledge/하위 폴더/자료 1.md", {}, "knowledge_inbox"],
    ["INBOX/Knowledge/v1.2 notes.md", {}, "knowledge_inbox"],
    ["INBOX/People/홍 길동.md", { type: "person", llmwiki_outbound: true }, "people_explicitly_permitted"],
  ];
  for (const sourcePath of malformed) {
    const decision = privacyBoundary.classifyInboxSource({ source_path: sourcePath, metadata: { llmwiki_outbound: true } });
    assert.deepEqual([decision.outbound_allowed, decision.route, decision.reason], [false, "hold", "malformed_inbox_path"], JSON.stringify(sourcePath));
  }
  for (const [sourcePath, metadata, reason] of valid) {
    const decision = privacyBoundary.classifyInboxSource({ source_path: sourcePath, metadata });
    assert.deepEqual([decision.outbound_allowed, decision.reason], [true, reason], sourcePath);
  }
});

test("Hub counts malformed Knowledge paths as held without reading, serializing, or dispatching them", async () => {
  const malformedPath = "INBOX/Knowledge/%252e%252e/secret.md";
  const transportCalls = [];
  const result = await runHub({
    pages: [],
    extraFiles: { [malformedPath]: "# must remain unread\n" },
    llmWikiControllerOptions: { inboxAnalysisTransport: async (work) => { transportCalls.push(work); return { ok: true }; } },
  });
  const settled = await result.window.KnowledgeExplorerHub.whenKnowledgeInboxSettled();
  assert.deepEqual({ state: settled.state, scanned_total: settled.scanned_total, eligible: settled.eligible, held: settled.held }, { state: "protected", scanned_total: 1, eligible: 0, held: 1 });
  assert.equal(result.app.vault.readPaths.includes(malformedPath), false);
  assert.equal(transportCalls.length, 0);
  assert.equal(result.app.vault.touched.length, 0);
});

for (const lateOutcome of ["resolve", "reject"]) test(`actual cancel settles before late transport ${lateOutcome} and a fresh scan succeeds`, async () => {
  const states = observer("onState");
  const actions = observer("onAction");
  const gates = [];
  const gateWaiters = [];
  const lateWaiters = [];
  let controlled = false;
  const waitForGate = (count) => gates.length >= count ? Promise.resolve() : new Promise((resolve) => gateWaiters.push({ count, resolve }));
  const waitForLate = (count) => gates.filter((gate) => gate.late).length >= count ? Promise.resolve() : new Promise((resolve) => lateWaiters.push({ count, resolve }));
  const sourcePath = `INBOX/Knowledge/cancel-${lateOutcome}.md`;
  const result = await runHub({
    pages: [],
    extraFiles: { [sourcePath]: "# cancellation fixture\n" },
    llmWikiControllerOptions: {
      onInboxState: states.onState,
      onLifecycleAction: actions.onAction,
      inboxAnalysisTransport: async () => {
        if (!controlled) return { ok: true };
        const gate = {};
        gates.push(gate);
        for (const waiter of [...gateWaiters]) if (gates.length >= waiter.count) { gateWaiters.splice(gateWaiters.indexOf(waiter), 1); waiter.resolve(); }
        return new Promise((resolve, reject) => { gate.resolve = resolve; gate.reject = reject; }).finally(() => {
          gate.late = true;
          for (const waiter of [...lateWaiters]) if (gates.filter((item) => item.late).length >= waiter.count) { lateWaiters.splice(lateWaiters.indexOf(waiter), 1); waiter.resolve(); }
        });
      },
    },
  });
  await result.window.KnowledgeExplorerHub.whenKnowledgeInboxSettled();
  await result.app.vault.modify(result.app.vault.getAbstractFileByPath(sourcePath), `# cancellation fixture\n${lateOutcome}\n`);
  controlled = true;

  click(actionButton(result.container, "scan-inbox"));
  await states.waitFor((state) => state.state === "analyzing", `${lateOutcome} analyzing`);
  await waitForGate(1);
  const rawHashAtCancel = crypto.createHash("sha256").update(await result.app.vault.cachedRead(result.app.vault.getAbstractFileByPath(sourcePath))).digest("hex");
  const durableArtifactsAtCancel = result.app.vault.touched.filter(([, filePath]) => filePath.startsWith("SYSTEM/PRIVATE/")).map((row) => [...row]);
  const controllerAtCancel = JSON.parse(JSON.stringify(result.window.KnowledgeExplorerHub.llmWikiRunController.getSnapshot()));
  const cancelledEvent = states.waitFor((state) => state.state === "cancelled", `${lateOutcome} cancelled`);
  click(actionButton(result.container, "cancel-inbox"));
  const cancelled = await cancelledEvent;
  const scanAction = await actions.waitFor((event) => event.intent.action === "scan_inbox", `${lateOutcome} scan settled on abort`);
  assert.deepEqual({ state: cancelled.state, processed: cancelled.processed, succeeded: cancelled.succeeded, failed: cancelled.failed }, { state: "cancelled", processed: 0, succeeded: 0, failed: 0 });
  assert.equal(scanAction.response.status, "cancelled");
  assert.match(collectText(result.container), /자료 분석을 취소했습니다/);

  if (lateOutcome === "resolve") gates[0].resolve({ ok: true });
  else gates[0].reject(new Error("late synthetic rejection"));
  await waitForLate(1);
  assert.equal(result.window.KnowledgeExplorerHub.llmWikiLifecycleSnapshot().inbox.state, "cancelled");
  assert.deepEqual(result.app.vault.touched.filter(([, filePath]) => filePath.startsWith("SYSTEM/PRIVATE/")).map((row) => [...row]), durableArtifactsAtCancel, "late transport cannot append durable artifacts or completion state");
  assert.equal(crypto.createHash("sha256").update(await result.app.vault.cachedRead(result.app.vault.getAbstractFileByPath(sourcePath))).digest("hex"), rawHashAtCancel);
  assert.deepEqual(JSON.parse(JSON.stringify(result.window.KnowledgeExplorerHub.llmWikiRunController.getSnapshot())), controllerAtCancel, "late transport cannot open or mutate review state");

  controlled = false;
  const freshComplete = states.waitFor((state) => state.state === "complete", `${lateOutcome} fresh complete`);
  click(actionButton(result.container, "scan-inbox"));
  const restarted = await freshComplete;
  assert.deepEqual({ processed: restarted.processed, succeeded: restarted.succeeded, failed: restarted.failed }, { processed: 1, succeeded: 1, failed: 0 });
  assert.ok(result.app.vault.touched.filter(([, filePath]) => filePath.startsWith("SYSTEM/PRIVATE/")).length >= durableArtifactsAtCancel.length, "fresh scan may retain or append only its own durable receipts");
});

test("cancel when no inbox scan is active fails closed as a typed no-op", async () => {
  const result = await runHub({ pages: [], extraFiles: { "INBOX/Private/held.md": "# held\n" } });
  await result.window.KnowledgeExplorerHub.whenKnowledgeInboxSettled();
  const response = await result.window.KnowledgeExplorerHub.dispatchLlmWikiAction({ action: "cancel_inbox" });
  assert.deepEqual(JSON.parse(JSON.stringify(response)), { ok: false, status: "protected", reason: "inbox_scan_not_active" });
  assert.equal(result.window.KnowledgeExplorerHub.llmWikiLifecycleSnapshot().inbox.state, "protected");
});
