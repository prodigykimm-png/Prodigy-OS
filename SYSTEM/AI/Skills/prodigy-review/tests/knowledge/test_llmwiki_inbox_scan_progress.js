"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");
const { test } = require("node:test");

const { collectText } = require("./knowledge_explorer_view_fakes.js");
const { firstElement, runHub } = require("./knowledge_hub_integration_harness.js");

const ROOT = path.resolve(__dirname, "../../../../../..");
const privacyBoundary = require(path.join(ROOT, "SYSTEM/Views/llmwiki-inbox-privacy-boundary.js"));
const incrementalState = require(path.join(ROOT, "SYSTEM/Views/llmwiki-incremental-analysis-state.js"));
const coverage = require(path.join(ROOT, "SYSTEM/Views/llmwiki-chunk-coverage-store.js"));

function syntheticProtectedRootFiles(count) {
  return Object.fromEntries(Array.from({ length: count }, (_, index) => [
    `INBOX/합성 보호 자료 ${String(index + 1).padStart(2, "0")}.md`,
    `---\nprivacy: private\n---\n# 합성 보호 자료 ${index + 1}\n\n보호 유지 테스트 본문입니다.\n`,
  ]));
}

function stateObserver() {
  const timeline = [];
  const waiters = new Set();
  const onState = (state) => {
    const copy = JSON.parse(JSON.stringify(state));
    timeline.push(copy);
    for (const waiter of [...waiters]) {
      if (!waiter.predicate(copy)) continue;
      clearTimeout(waiter.timer);
      waiters.delete(waiter);
      waiter.resolve(copy);
    }
  };
  const waitFor = (predicate, label) => {
    const existing = [...timeline].reverse().find(predicate);
    if (existing) return Promise.resolve(existing);
    return new Promise((resolve, reject) => {
      const waiter = {
        predicate,
        resolve,
        timer: setTimeout(() => {
          waiters.delete(waiter);
          reject(new Error(`event timeout: ${label}\n${JSON.stringify(timeline, null, 2)}`));
        }, 2000),
      };
      waiters.add(waiter);
    });
  };
  return { onState, timeline, waitFor };
}

function completionObserver() {
  let resolveAction;
  const promise = new Promise((resolve) => { resolveAction = resolve; });
  return {
    promise,
    onAction(event) {
      if (event.intent.action === "scan_inbox") resolveAction(event);
    },
  };
}

function scanButton(container) {
  return firstElement(container, "button", (node) => node.attr && node.attr["data-action"] === "scan-inbox");
}

function click(node) {
  assert.ok(node && typeof node.onclick === "function", "actual scan_inbox button must be actionable");
  node.onclick({ preventDefault() {} });
}

test("actual scan_inbox reports zero eligible and twenty-four protected root files with exact placement guidance", async () => {
  // Given: the current protection contract represented only by synthetic filenames.
  const completion = completionObserver();
  const transportCalls = [];
  const result = await runHub({
    pages: [],
    extraFiles: syntheticProtectedRootFiles(24),
    llmWikiControllerOptions: {
      inboxAnalysisTransport: async (work) => { transportCalls.push(work); return { ok: true }; },
      onLifecycleAction: completion.onAction,
    },
  });
  await result.window.KnowledgeExplorerHub.whenKnowledgeInboxSettled();

  // When: the real lifecycle button is keyboard-activated through its native click path.
  const button = scanButton(result.container);
  button.focus();
  click(button);
  await completion.promise;

  // Then: the terminal scene cannot look unchanged or busy, and no held bytes leave the Hub.
  const visible = collectText(result.container);
  assert.match(visible, /분석 대상 0개/);
  assert.match(visible, /보호 유지 24개/);
  assert.match(visible, /INBOX\/Private\//);
  assert.match(visible, /AI 분석 대상이 없습니다/);
  assert.equal(transportCalls.length, 0);
  assert.equal(result.app.vault.touched.length, 0);
  assert.equal(button.focused, true);
});

test("held INBOX source stays local while scan progress settles protected", async () => {
  const calls = [];
  const result = await runHub({
    pages: [],
    extraFiles: { "INBOX/Private/개인 자료.md": "# 개인 자료\n\n비공개 내용\n" },
    llmWikiControllerOptions: { inboxAnalysisTransport: async (work) => { calls.push(work); return { ok: true }; } },
  });
  const settled = await result.window.KnowledgeExplorerHub.whenKnowledgeInboxSettled();
  assert.deepEqual({ state: settled.state, eligible: settled.eligible, held: settled.held, processed: settled.processed }, {
    state: "protected", eligible: 0, held: 1, processed: 0,
  });
  assert.equal(calls.length, 0);
  assert.equal(result.app.vault.touched.length, 0);
});

test("provider auth failure tells the user how to restore Antigravity login", async () => {
  const completion = completionObserver();
  const result = await runHub({
    pages: [],
    extraFiles: { "INBOX/로그인 확인.md": "# 로그인 확인\n\n인증 경로 테스트\n" },
    llmWikiControllerOptions: {
      inboxAnalysisTransport: async () => ({ ok: false, reason: "provider_auth_required" }),
      onLifecycleAction: completion.onAction,
    },
  });
  await result.window.KnowledgeExplorerHub.whenKnowledgeInboxSettled();
  const button = scanButton(result.container);
  click(button);
  await completion.promise;
  const visible = collectText(result.container);
  assert.match(visible, /Antigravity Google 로그인이 필요합니다/u);
  assert.match(visible, /agy -p/u);
  assert.doesNotMatch(visible, /사용할 수 있는 AI 연결이 없습니다/u);
});

test("provider quota failure shows the reset time instead of no AI connection", async () => {
  const completion = completionObserver();
  const result = await runHub({
    pages: [],
    extraFiles: { "INBOX/한도 확인.md": "# 한도 확인\n\n한도 분류 테스트\n" },
    llmWikiControllerOptions: {
      inboxAnalysisTransport: async () => ({
        ok: false,
        reason: "provider_quota_exhausted",
        message: "Antigravity 사용 한도를 모두 사용했습니다. 1시간 49분 58초 후 다시 시도해 주세요.",
      }),
      onLifecycleAction: completion.onAction,
    },
  });
  await result.window.KnowledgeExplorerHub.whenKnowledgeInboxSettled();
  const button = scanButton(result.container);
  click(button);
  await completion.promise;
  const visible = collectText(result.container);
  assert.match(visible, /Antigravity 사용 한도/u);
  assert.match(visible, /1시간 49분 58초/u);
  assert.doesNotMatch(visible, /사용할 수 있는 AI 연결이 없습니다/u);
});

test("provider-wide quota failure stops the inbox batch after the first file", async () => {
  let calls = 0;
  const result = await runHub({
    pages: [],
    extraFiles: {
      "INBOX/한도 첫째.md": "# 한도 첫째\n",
      "INBOX/한도 둘째.md": "# 한도 둘째\n",
    },
    llmWikiControllerOptions: {
      inboxAnalysisTransport: async () => {
        calls += 1;
        return {
          ok: false,
          reason: "provider_quota_exhausted",
          message: "Antigravity 사용 한도를 모두 사용했습니다. 1시간 후 다시 시도해 주세요.",
        };
      },
    },
  });
  const settled = await result.window.KnowledgeExplorerHub.whenKnowledgeInboxSettled();
  assert.equal(calls, 1);
  assert.equal(settled.state, "error");
  assert.equal(settled.eligible, 2);
  assert.equal(settled.processed, 1);
  assert.equal(settled.failed, 1);
  assert.equal(settled.reason, "provider_quota_exhausted");
});

test("unexpected analysis exception stops the inbox batch after the first file", async () => {
  let calls = 0;
  const result = await runHub({
    pages: [],
    extraFiles: {
      "INBOX/내부 오류 첫째.md": "# 내부 오류 첫째\n",
      "INBOX/내부 오류 둘째.md": "# 내부 오류 둘째\n",
    },
    llmWikiControllerOptions: {
      inboxAnalysisTransport: async () => {
        calls += 1;
        throw new TypeError("synthetic analysis transport wiring failure");
      },
    },
  });
  const settled = await result.window.KnowledgeExplorerHub.whenKnowledgeInboxSettled();
  assert.equal(calls, 1);
  assert.equal(settled.state, "error");
  assert.equal(settled.eligible, 2);
  assert.equal(settled.processed, 1);
  assert.equal(settled.failed, 1);
  assert.equal(settled.reason, "analysis_failed");
});

test("default inbox analysis rejects a provider-selected operation envelope", async () => {
  let providerCalls = 0;
  const result = await runHub({
    pages: [],
    extraFiles: { "INBOX/배치 첫째.md": "# 배치 첫째\n", "INBOX/배치 둘째.md": "# 배치 둘째\n" },
    llmWikiControllerOptions: {
      operation_provider: async () => {
        providerCalls += 1;
        return { ok: true, serialized_operation: "{}" };
      },
    },
  });
  const settled = await result.window.KnowledgeExplorerHub.whenKnowledgeInboxSettled();
  assert.equal(providerCalls, 1);
  assert.equal(settled.state, "error");
  assert.equal(settled.reason, "invalid_chunk_response");
  assert.equal((result.window.KnowledgeExplorerHub.llmWikiRunController.getSnapshot().risk_packets || []).length, 0);
});

test("automatic scans persist completed revisions and only analyze changed files after restart", async () => {
  const inboxFiles = {
    "INBOX/증분 첫째.md": "# 증분 첫째\n",
    "INBOX/증분 둘째.md": "# 증분 둘째\n",
  };
  const firstCalls = [];
  const first = await runHub({
    pages: [],
    extraFiles: inboxFiles,
    llmWikiControllerOptions: {
      inboxAnalysisTransport: async (work) => {
        firstCalls.push(work.snapshot.source.source_path);
        return { ok: true };
      },
    },
  });
  const firstState = await first.window.KnowledgeExplorerHub.whenKnowledgeInboxSettled();
  const stateFile = first.app.vault.getAbstractFileByPath(incrementalState.DEFAULT_STATE_PATH);
  assert.ok(stateFile, "successful automatic analysis persists local revision state");
  const persisted = await first.app.vault.cachedRead(stateFile);
  assert.deepEqual(firstCalls, ["INBOX/증분 둘째.md", "INBOX/증분 첫째.md"]);
  assert.deepEqual(
    { state: firstState.state, pending: firstState.pending, unchanged: firstState.unchanged, processed: firstState.processed },
    { state: "complete", pending: 2, unchanged: 0, processed: 2 },
  );

  const repeatedCalls = [];
  const repeated = await runHub({
    pages: [],
    extraFiles: {
      ...inboxFiles,
      [incrementalState.DEFAULT_STATE_PATH]: persisted,
    },
    llmWikiControllerOptions: {
      inboxAnalysisTransport: async (work) => {
        repeatedCalls.push(work.snapshot.source.source_path);
        return { ok: true };
      },
    },
  });
  const repeatedState = await repeated.window.KnowledgeExplorerHub.whenKnowledgeInboxSettled();
  assert.equal(repeatedCalls.length, 0);
  assert.deepEqual(
    { state: repeatedState.state, pending: repeatedState.pending, unchanged: repeatedState.unchanged, processed: repeatedState.processed },
    { state: "up_to_date", pending: 0, unchanged: 2, processed: 0 },
  );

  const changedCalls = [];
  const changed = await runHub({
    pages: [],
    extraFiles: {
      ...inboxFiles,
      "INBOX/증분 둘째.md": "# 증분 둘째\n\n내용 변경\n",
      [incrementalState.DEFAULT_STATE_PATH]: persisted,
    },
    llmWikiControllerOptions: {
      inboxAnalysisTransport: async (work) => {
        changedCalls.push(work.snapshot.source.source_path);
        return { ok: true };
      },
    },
  });
  const changedState = await changed.window.KnowledgeExplorerHub.whenKnowledgeInboxSettled();
  assert.deepEqual(changedCalls, ["INBOX/증분 둘째.md"]);
  assert.deepEqual(
    { state: changedState.state, pending: changedState.pending, unchanged: changedState.unchanged, processed: changedState.processed },
    { state: "complete", pending: 1, unchanged: 1, processed: 1 },
  );
});

test("explicit full reanalysis bypasses the unchanged cache exactly once", async () => {
  const calls = [];
  const result = await runHub({
    pages: [],
    extraFiles: { "INBOX/전체 재분석.md": "# 전체 재분석\n" },
    llmWikiControllerOptions: {
      inboxAnalysisTransport: async (work) => {
        calls.push(work.snapshot.source.source_path);
        return { ok: true };
      },
    },
  });
  await result.window.KnowledgeExplorerHub.whenKnowledgeInboxSettled();
  assert.equal(calls.length, 1);

  const forced = await result.window.KnowledgeExplorerHub.dispatchLlmWikiAction({
    action: "force_reanalyze_inbox",
  });

  assert.equal(forced.ok, true);
  assert.equal(forced.status, "complete");
  assert.deepEqual(calls, ["INBOX/전체 재분석.md", "INBOX/전체 재분석.md"]);
  const forcedState = result.window.KnowledgeExplorerHub.llmWikiLifecycleSnapshot().inbox;
  assert.deepEqual(
    { pending: forcedState.pending, unchanged: forcedState.unchanged, processed: forcedState.processed },
    { pending: 1, unchanged: 0, processed: 1 },
  );
});

test("actual scan_inbox exposes queued and per-file progress through transport barriers, then keeps aggregate partial results", async () => {
  // Given: two eligible synthetic notes and one held note, with the initial mount scan completed locally.
  const observer = stateObserver();
  const completion = completionObserver();
  const gates = [];
  const gateWaiters = [];
  const waitForGate = (count) => gates.length >= count ? Promise.resolve() : new Promise((resolve) => gateWaiters.push({ count, resolve }));
  let controlled = false;
  const extraFiles = {
    "INBOX/Knowledge/가 합성.md": "# 가 합성\n\n첫 근거\n",
    "INBOX/Knowledge/나 합성.md": "# 나 합성\n\n둘째 근거\n",
    "INBOX/합성 보호.md": "---\nprivacy: private\n---\n# 합성 보호\n\n보호 근거\n",
  };
  const result = await runHub({
    pages: [],
    extraFiles,
    llmWikiControllerOptions: {
      onInboxState: observer.onState,
      onLifecycleAction: completion.onAction,
      inboxAnalysisTransport: async (work) => {
        if (!controlled) return { ok: true };
        return new Promise((resolve) => {
          gates.push({ path: work.snapshot.source.source_path, resolve });
          for (const waiter of [...gateWaiters]) if (gates.length >= waiter.count) { gateWaiters.splice(gateWaiters.indexOf(waiter), 1); waiter.resolve(); }
        });
      },
    },
  });
  await result.window.KnowledgeExplorerHub.whenKnowledgeInboxSettled();
  for (const [filePath, body] of Object.entries(extraFiles).filter(([filePath]) => filePath.startsWith("INBOX/Knowledge/"))) {
    await result.app.vault.modify(result.app.vault.getAbstractFileByPath(filePath), `${body}\n변경된 리비전\n`);
  }
  controlled = true;

  // When: the real action starts and each provider result is released by an observed event barrier.
  click(scanButton(result.container));
  const queued = await observer.waitFor((state) => state.state === "queued" && state.eligible === 2 && state.processed === 0, "0/2 queued");
  const firstActive = await observer.waitFor((state) => state.state === "analyzing" && state.processed === 0 && state.current_title === "가 합성.md", "first current file");
  await waitForGate(1);
  const activeScan = scanButton(result.container);
  const activeStatus = firstElement(result.container, "div", (node) => node.attr && node.attr.role === "status" && String(node.attr.class || "").includes("llmwiki-lifecycle__status"));
  assert.ok(activeScan && activeScan.disabled, "re-scan stays visibly disabled while analysis is active");
  assert.equal(activeStatus.attr["aria-live"], "polite");
  assert.equal(activeStatus.attr["aria-busy"], "true");
  assert.match(collectText(result.container), /1\/2 분석 중.*가 합성\.md/);
  assert.equal(gates.length, 1);
  gates[0].resolve({ ok: false, reason: "synthetic_provider_failure" });
  const secondActive = await observer.waitFor((state) => state.state === "analyzing" && state.processed === 1 && state.current_title === "나 합성.md", "second current file");
  await waitForGate(2);
  assert.equal(gates.length, 2);
  assert.match(collectText(result.container), /2\/2 분석 중.*나 합성\.md/);
  gates[1].resolve({ ok: true });
  const actionResult = await completion.promise;

  // Then: ordering and counts are deterministic, and final state is the aggregate rather than the last success.
  const terminal = observer.timeline.at(-1);
  assert.deepEqual(
    [queued.processed, firstActive.processed, secondActive.processed, terminal.processed],
    [0, 0, 1, 2],
  );
  assert.deepEqual(gates.map((gate) => gate.path), ["INBOX/Knowledge/가 합성.md", "INBOX/Knowledge/나 합성.md"]);
  assert.deepEqual(
    { scanned_total: terminal.scanned_total, eligible: terminal.eligible, held: terminal.held, processed: terminal.processed, succeeded: terminal.succeeded, failed: terminal.failed, state: terminal.state },
    { scanned_total: 3, eligible: 2, held: 1, processed: 2, succeeded: 1, failed: 1, state: "partial" },
  );
  assert.equal(actionResult.response.status, "partial");
  assert.match(collectText(result.container), /2\/2 분석 완료/);
  assert.match(collectText(result.container), /성공 1개.*실패 1개/);
  assert.ok(scanButton(result.container) && !scanButton(result.container).disabled, "final scene exposes re-scan");
  assert.equal(
    result.app.vault.touched.every(([kind, filePath]) => (
      (kind === "modify" && filePath.startsWith("INBOX/"))
      || [incrementalState.DEFAULT_STATE_PATH, coverage.DEFAULT_COVERAGE_PATH, "SYSTEM/PRIVATE/llmwiki-analysis-cache.json", "SYSTEM/PRIVATE/llmwiki-inbox-proposals.json"].includes(filePath)
    )),
    true,
    "only synthetic setup revisions and local durable analysis artifacts changed",
  );
});

test("plain root INBOX is eligible while protection markers, People rules and malformed paths still hold", async () => {
  // Given: the relaxed root-INBOX intake contract and every surviving privacy mutation.
  const matrix = [
    ["INBOX/일반 루트 자료.md", {}, true, "knowledge_inbox"],
    ["INBOX/루트 위장.md", { type: "knowledge", route_hint: "knowledge", llmwiki_outbound: true }, true, "knowledge_inbox"],
    ["INBOX/Private/사생활.md", { llmwiki_outbound: true }, false, "protected_source"],
    ["INBOX/Project/경로 위장.md", { type: "knowledge", llmwiki_outbound: "allow" }, true, "knowledge_inbox"],
    ["INBOX/Knowledge/비공개.md", { privacy: "private", llmwiki_outbound: true }, false, "protected_source"],
    ["INBOX/People/동의 없음.md", { type: "person" }, false, "people_local_only"],
    ["INBOX/People/명시 동의.md", { type: "person", llmwiki_outbound: true }, true, "people_explicitly_permitted"],
    ["INBOX/Knowledge/지식.md", { route_hint: "hold" }, true, "knowledge_inbox"],
  ];

  // When / Then: path authority wins over metadata except the pre-existing explicit People contract.
  for (const [sourcePath, metadata, outboundAllowed, reason] of matrix) {
    const decision = privacyBoundary.classifyInboxSource({ source_path: sourcePath, metadata });
    assert.equal(decision.outbound_allowed, outboundAllowed, sourcePath);
    assert.equal(decision.reason, reason, sourcePath);
  }
});

test("root inbox removes isolated control characters before analysis without mutating the source", async () => {
  const analyzedTexts = [];
  const result = await runHub({
    pages: [],
    extraFiles: {
      "INBOX/제어문자 자료.md": "# 제어문자 자료\n\n유효한 본문\u001d과 나머지 내용입니다.\n",
    },
    llmWikiControllerOptions: {
      inboxAnalysisTransport: async (work) => {
        analyzedTexts.push(work.extracted_text);
        return { ok: true };
      },
    },
  });
  const settled = await result.window.KnowledgeExplorerHub.whenKnowledgeInboxSettled();
  assert.equal(settled.state, "complete");
  assert.equal(settled.succeeded, 1);
  assert.equal(analyzedTexts.length, 1);
  assert.doesNotMatch(analyzedTexts[0], /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/u);
  assert.equal(result.app.vault.touched.some(([, filePath]) => filePath.startsWith("INBOX/")), false);
});

test("malformed and duplicate autopilot events cannot inflate aggregate progress or dispatch held bytes", async () => {
  // Given: an event-mutated autopilot that emits malformed and duplicate notifications to Hub subscribers.
  const productionSource = require("node:fs").readFileSync(path.join(ROOT, "SYSTEM/Views/llmwiki-inbox-autopilot.js"), "utf8");
  const wrapped = `${productionSource}\n;(()=>{\n  const create = globalThis.LLMWikiInboxAutopilot.createInboxAutopilot;\n  globalThis.LLMWikiInboxAutopilot = Object.freeze({\n    createInboxAutopilot(options) {\n      const real = create(options);\n      return Object.freeze({\n        standingPolicy: real.standingPolicy,\n        dispatch: real.dispatch,\n        cancel: real.cancel,\n        resume: real.resume,\n        subscribe(listener) {\n          const unsubscribe = real.subscribe(listener);\n          listener({ type: \"analysis_completed\", source_id: \"\" });\n          listener({ type: \"analysis_completed\", source_id: \"source_duplicate_fixture\" });\n          listener({ type: \"analysis_completed\", source_id: \"source_duplicate_fixture\" });\n          return unsubscribe;\n        },\n      });\n    },\n  });\n})();`;
  const observer = stateObserver();
  const completion = completionObserver();
  const transportCalls = [];
  const result = await runHub({
    pages: [],
    extraFiles: {
      ...syntheticProtectedRootFiles(2),
      "SYSTEM/Views/llmwiki-inbox-autopilot.js": wrapped,
    },
    llmWikiControllerOptions: {
      onInboxState: observer.onState,
      onLifecycleAction: completion.onAction,
      inboxAnalysisTransport: async (work) => { transportCalls.push(work); return { ok: true }; },
    },
  });
  await result.window.KnowledgeExplorerHub.whenKnowledgeInboxSettled();

  // When: the real scan action runs after the injected notifications.
  click(scanButton(result.container));
  await completion.promise;

  // Then: only file classification controls aggregate counters; injected events fail closed.
  const terminal = observer.timeline.at(-1);
  assert.deepEqual(
    { scanned_total: terminal.scanned_total, eligible: terminal.eligible, held: terminal.held, processed: terminal.processed, succeeded: terminal.succeeded, failed: terminal.failed },
    { scanned_total: 2, eligible: 0, held: 2, processed: 0, succeeded: 0, failed: 0 },
  );
  assert.equal(transportCalls.length, 0);
});
