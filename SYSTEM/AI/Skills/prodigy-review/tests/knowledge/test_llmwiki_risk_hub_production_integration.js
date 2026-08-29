"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const ROOT = path.resolve(__dirname, "../../../../../..");
const HUB_PATH = path.join(ROOT, "HUB/50 Knowledge.md");
const hash = require(path.join(ROOT, "SYSTEM/Views/llmwiki-hash.js"));
const operationApi = require(path.join(ROOT, "SYSTEM/Views/llmwiki-operation-contract.js"));
const { buildPages, firstElement, runHub } = require("./knowledge_hub_integration_harness.js");
const { collectText } = require("./knowledge_explorer_view_fakes.js");

const SOURCE_PATH = "ZETA/LITERATURE/risk-hub-source.md";
const SOURCE_ID = "source_risk_hub";
const SOURCE_URL = "https://example.com/risk-hub";
const SOURCE_BODY = "# 실제 Hub 출처\n\n검증된 자료에서 영구 지식을 만듭니다.";
const SOURCE_HASH = hash.sha256(SOURCE_BODY);
const BATCH_IDENTITY = Object.freeze({
  provider_key: "openrouter",
  model: "test/model-risk-hub",
  structured_mode: "json_schema",
  schema_id: "llmwiki_compact_v1",
  prompt_version: "task11-risk-hub",
});
const SOURCE_DOCUMENT = `---\ntype: "literature_note"\nsource_kind: "public"\nsource_id: "${SOURCE_ID}"\nsource_url: "${SOURCE_URL}"\nsource_title: "실제 Hub 출처"\n---\n${SOURCE_BODY}\n`;

function compactArtifacts(input, count) {
  assert.equal(Object.isFrozen(BATCH_IDENTITY), true);
  assert.equal(Array.isArray(input.chunks), true);
  return {
    ok: true,
    artifacts: input.chunks.map((chunk, chunkIndex) => ({
      chunk_key: chunk.key,
      outcome: "proposals",
      items: chunkIndex === 0 ? Array.from({ length: count }, (_, index) => ({
        role: index === 0 ? "source_summary" : "reusable_claim",
        evidence_quote: chunk.text.trim().slice(0, 12),
        claims: [`Hub risk write ${index + 1}`],
        review_reasons: [],
        related_candidate_ids: [],
      })) : [],
    })),
  };
}
function button(root, action) { return firstElement(root, "button", (node) => node.attr?.["data-action"] === action); }
function checkboxes(root) {
  const hits = [];
  (function walk(node) { if (node?.tag === "input" && node.attr?.type === "checkbox") hits.push(node); for (const child of node?.children || []) walk(child); })(root);
  return hits;
}
function click(control) { assert.equal(typeof control?.onclick, "function"); control.onclick({ preventDefault() {} }); }
function gitGateway(failures = 0) {
  const calls = { capability: 0, verify: 0, lookup: 0, snapshot: 0 };
  const operations = new Map();
  return {
    calls,
    register(values) { for (const operation of values) operations.set(operation.destination_ids[0], operation); },
    async capability() { calls.capability += 1; return { ok: true, status: "available" }; },
    async verifySafeSync() { calls.verify += 1; return { ok: true, status: "safe" }; },
    async lookup() { calls.lookup += 1; return null; },
    async snapshot(input) {
      calls.snapshot += 1;
      assert.equal(input.push, false);
      assert.equal(input.paths.length, 3);
      assert.match(input.paths[0], /^ZETA\/(?:LITERATURE|CANDIDATES)\//u);
      assert.equal(input.paths[1], `.llmwiki-audit/immutable/${input.immutable_audit_hash}.json`);
      assert.equal(input.paths[2], ".llmwiki-audit/immutable/head.json");
      const operation = operations.get(input.paths[0]);
      assert.ok(operation, `missing canonical packet for ${input.paths[0]}`);
      assert.equal(input.expected_hashes[input.paths[0]], hash.sha256(operation.after_bytes[input.paths[0]]));
      if (calls.snapshot <= failures) return { ok: false, reason: "git_snapshot_failed" };
      return { ok: true, receipt: { commit_id: `local-${calls.snapshot}`, paths: input.paths, pushed: false } };
    },
  };
}
async function mount(count, extras = {}) {
  const providerCalls = [];
  const operationStates = [];
  const operationWaiters = new Set();
  const actionWaiters = new Set();
  const result = await runHub({
    pages: buildPages(),
    extraFiles: { [SOURCE_PATH]: SOURCE_DOCUMENT },
    llmWikiControllerOptions: {
      batchIdentity: BATCH_IDENTITY,
      batchProvider: async (input) => { providerCalls.push(input); return compactArtifacts(input, count); },
      risk_repacket_transform: async ({ operation: value }) => value,
      requestRevisionGuidance: async () => "출처 설명을 더 명확하게 바꿔줘",
      onLifecycleAction: (event) => { for (const waiter of [...actionWaiters]) if (waiter.action === event.intent.action) { actionWaiters.delete(waiter); clearTimeout(waiter.timeout); waiter.resolve(event); } },
      on_operation_state: (state) => {
        operationStates.push({ status: state.status, revision: state.run_revision });
        for (const waiter of [...operationWaiters]) if (waiter.predicate(state)) { operationWaiters.delete(waiter); clearTimeout(waiter.timeout); waiter.resolve(state); }
      },
      ...extras,
    },
  });
  result.window.KnowledgeExplorerHub.tabs.select("llmwiki");
  const gateway = result.window.KnowledgeExplorerHub.dispatchLlmWikiAction;
  assert.equal(typeof gateway, "function");
  assert.equal((await gateway({ action: "select_source" })).status, "selecting");
  assert.equal((await gateway({ action: "select_source", source_path: SOURCE_PATH })).ok, true);
  assert.equal((await gateway({ action: "request_consent" })).status, "consent_required");
  assert.equal(providerCalls.length, 0, "consent preparation must not call the provider");
  const started = await gateway({ action: "start_run", provider_mode: "direct" });
  assert.equal(started.status, "review", JSON.stringify(started));
  assert.equal(providerCalls.length, 1, "explicit Analyze must make one canonical batch-provider call");
  const snapshot = result.window.KnowledgeExplorerHub.llmWikiRunController.getSnapshot();
  assert.equal(result.window.KnowledgeExplorerHub.llmWikiRunController.getOperationSnapshot().status, "review");
  assert.equal(snapshot.risk_packets.length, count);
  if (snapshot.risk_packets.length > 1) {
    const sortedPackets = [...snapshot.risk_packets].sort((left, right) => left.packet_id.localeCompare(right.packet_id));
    const authorization = result.window.LLMWikiSafeBatchApproval.authorizeExactBatch(sortedPackets, sortedPackets.map((packet) => packet.packet_id));
    assert.equal(authorization.ok, true, JSON.stringify(authorization));
  }
  const operations = snapshot.risk_packets.map((packet) => {
    const parsed = operationApi.parseOperation(JSON.stringify(packet.operation));
    assert.equal(parsed.ok, true, JSON.stringify(parsed));
    assert.equal(parsed.value.kind, "create");
    assert.match(parsed.value.destination_ids[0], /^ZETA\/(?:LITERATURE|CANDIDATES)\//u);
    assert.equal(parsed.value.source_citations[0].source_id, SOURCE_ID);
    assert.equal(parsed.value.source_citations[0].content_hash, SOURCE_HASH);
    return parsed.value;
  });
  if (typeof extras.git_gateway?.register === "function") extras.git_gateway.register(operations);
  assert.match(collectText(result.container), /지식 변경 검토|위험|수정 요청/);
  const bundle = { runId: snapshot.run_id, operations };
  return { ...result, bundle, providerCalls, operationStates,
    waitOperation(predicate) { return new Promise((resolve, reject) => { const waiter = { predicate, resolve, timeout: null }; waiter.timeout = setTimeout(() => { operationWaiters.delete(waiter); reject(new Error("operation state event timeout")); }, 2000); operationWaiters.add(waiter); }); },
    waitAction(action) { return new Promise((resolve, reject) => { const waiter = { action, resolve, timeout: null }; waiter.timeout = setTimeout(() => { actionWaiters.delete(waiter); reject(new Error(`lifecycle ${action} event timeout`)); }, 2000); actionWaiters.add(waiter); }); },
  };
}

test("production Hub contains every risk route and invokes openRiskReview through typed startup", () => {
  const hub = fs.readFileSync(HUB_PATH, "utf8");
  for (const action of ["approve_risk", "reject_risk", "approve_risk_batch", "request_risk_revision"]) assert.match(hub, new RegExp(`\\"${action}\\"`));
  assert.match(hub, /dispatchRiskAction\(intent\)/);
  assert.match(hub, /enable_risk_review:\s*true/);
  const controller = fs.readFileSync(path.join(ROOT, "SYSTEM/Views/llmwiki-run-controller.js"), "utf8");
  assert.match(controller, /openPreparedRiskReview\([\s\S]*return openRiskReview\(/);
});

test("actual Hub startup reaches risk review and approve preserves Task13 outcome while writing once", async () => {
  const subject = await mount(1);
  const target = subject.bundle.operations[0].destination_ids[0];
  const created = new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("canonical create event timeout")), 2000);
    const ref = subject.app.vault.on("create", (file) => { if (file.path === target) { clearTimeout(timeout); subject.app.vault.offref(ref); resolve(file); } });
  });
  const completed = subject.waitAction("approve_risk");
  click(button(subject.container, "approve"));
  await Promise.all([created, completed]);
  const last = subject.window.KnowledgeExplorerHub.lastLlmWikiAction;
  assert.equal(last.intent.action, "approve_risk");
  assert.notEqual(last.response.reason, "action_unavailable");
  assert.equal(last.response.status, "committed");
  assert.equal(subject.providerCalls.length, 1, "approval must not make an extra provider call");
  assert.equal(subject.window.KnowledgeExplorerHub.llmWikiRunController.getOperationSnapshot().status, "committed");
  const lifecycleSnapshot = subject.window.KnowledgeExplorerHub.llmWikiLifecycle.getSnapshot();
  assert.equal(lifecycleSnapshot.operation_run.status, "committed");
  assert.equal(lifecycleSnapshot.operation_run.follow_up.git.status, "failed");
  assert.equal(lifecycleSnapshot.operation_run.follow_up.git.attempts, 1);
  assert.equal(lifecycleSnapshot.operation_run.follow_up.git.reason, "GitUnavailable");
  assert.equal(await subject.app.vault.read(subject.app.vault.getAbstractFileByPath(target)), subject.bundle.operations[0].after_bytes[target]);
  assert.match(collectText(subject.container), /Git을 사용할 수 없어 기록을 보류했습니다|지식은 안전하게 반영됐지만 Git 기록에 실패했습니다|지식 반영 완료/);
  const stale = await subject.window.KnowledgeExplorerHub.dispatchLlmWikiAction({ action: "approve_risk", run_id: subject.bundle.runId, run_revision: 1, packet_id: "packet_stale" });
  assert.equal(stale.reason, "stale_risk_action");
});

test("approved production Hub create records canonical audit and Git while compensation stays ineligible", async () => {
  const gateway = gitGateway();
  let refreshCalls = 0;
  const subject = await mount(1, {
    git_gateway: gateway,
    operation_follow_ups: {
      async refresh() { refreshCalls += 1; return { ok: true }; },
      async git() { return { ok: false, reason: "trusted_receipt_required" }; },
    },
  });
  const packet = subject.window.KnowledgeExplorerHub.llmWikiRunController.getSnapshot().risk_packets[0];
  const committed = await subject.window.KnowledgeExplorerHub.dispatchLlmWikiAction({ action: "approve_risk", run_id: packet.run_id, run_revision: packet.run_revision, packet_id: packet.packet_id });
  const operation = subject.window.KnowledgeExplorerHub.llmWikiRunController.getOperationSnapshot();

  assert.equal(committed.status, "committed");
  assert.deepEqual({ canonical: operation.counters.canonical, audit: operation.counters.audit, refresh: operation.counters.refresh, git: operation.counters.git }, { canonical: 1, audit: 1, refresh: 1, git: 1 });
  assert.equal(refreshCalls, 1);
  assert.equal(gateway.calls.snapshot, 1);
  assert.equal(committed.follow_up.status, "complete");
  assert.deepEqual(JSON.parse(JSON.stringify(committed.follow_up)), { status: "complete", refresh: { status: "succeeded", attempts: 1, reason: null }, git: { status: "succeeded", attempts: 1, reason: null } });
  assert.deepEqual(JSON.parse(JSON.stringify(committed.compensation)), { eligible: false, reason: "compensation_receipt_ineligible" });
  assert.equal(subject.app.vault.touched.filter((row) => row[0] === "create" && row[1] === packet.operation.destination_ids[0]).length, 1);
  assert.equal(subject.app.vault.touched.filter((row) => String(row[1]).startsWith(".llmwiki-audit/immutable/")).length >= 2, true);
});

test("production Hub retries failed create Git exactly once without repeating canonical audit or refresh", async () => {
  const gateway = gitGateway(1);
  let refreshCalls = 0;
  const subject = await mount(1, {
    git_gateway: gateway,
    operation_follow_ups: {
      async refresh() { refreshCalls += 1; return { ok: true }; },
      async git() { return { ok: false, reason: "trusted_receipt_required" }; },
    },
  });
  const packet = subject.window.KnowledgeExplorerHub.llmWikiRunController.getSnapshot().risk_packets[0];
  const committed = await subject.window.KnowledgeExplorerHub.dispatchLlmWikiAction({ action: "approve_risk", run_id: packet.run_id, run_revision: packet.run_revision, packet_id: packet.packet_id });
  const beforeRetry = subject.window.KnowledgeExplorerHub.llmWikiRunController.getOperationSnapshot();
  assert.equal(committed.follow_up.git.status, "failed");
  assert.equal(gateway.calls.snapshot, 1);

  const retried = await subject.window.KnowledgeExplorerHub.dispatchLlmWikiAction({ action: "retry_follow_up", follow_up: "git" });
  const afterRetry = subject.window.KnowledgeExplorerHub.llmWikiRunController.getOperationSnapshot();
  assert.deepEqual({ canonical: afterRetry.counters.canonical, audit: afterRetry.counters.audit, refresh: afterRetry.counters.refresh }, { canonical: beforeRetry.counters.canonical, audit: beforeRetry.counters.audit, refresh: beforeRetry.counters.refresh });
  assert.equal(refreshCalls, 1);
  assert.equal(gateway.calls.snapshot, 2);
  assert.equal(afterRetry.counters.git, 2);
  assert.deepEqual(JSON.parse(JSON.stringify(retried.follow_up)), { status: "complete", refresh: { status: "succeeded", attempts: 1, reason: null }, git: { status: "succeeded", attempts: 2, reason: null } });
  assert.deepEqual(JSON.parse(JSON.stringify(committed.compensation)), { eligible: false, reason: "compensation_receipt_ineligible" });
  assert.equal(subject.app.vault.touched.filter((row) => row[0] === "create" && row[1] === packet.operation.destination_ids[0]).length, 1);
});

test("actual Hub revision and reject buttons route without action_unavailable and stale actions stay inert", async () => {
  const revised = await mount(1);
  const controller = revised.window.KnowledgeExplorerHub.llmWikiRunController;
  const oldPacket = controller.getSnapshot().risk_packets[0];
  const revisionEvent = revised.waitOperation((state) => state.status === "review" && state.run_revision > oldPacket.run_revision);
  const revisionCompleted = revised.waitAction("request_risk_revision");
  click(button(revised.container, "request-revision"));
  const next = await revisionEvent;
  await revisionCompleted;
  assert.equal(next.run_revision, 2);
  await Promise.resolve();
  assert.equal(revised.window.KnowledgeExplorerHub.lastLlmWikiAction.intent.action, "request_risk_revision");
  assert.notEqual(revised.window.KnowledgeExplorerHub.lastLlmWikiAction.response.reason, "action_unavailable");
  const old = await revised.window.KnowledgeExplorerHub.dispatchLlmWikiAction({ action: "approve_risk", run_id: oldPacket.run_id, run_revision: oldPacket.run_revision, packet_id: oldPacket.packet_id });
  assert.equal(old.reason, "stale_risk_action");
  assert.equal(revised.app.vault.touched.some((row) => row[1]?.startsWith("ZETA/PERMANENT/")), false);

  const rejected = await mount(1);
  const rejectCompleted = rejected.waitAction("reject_risk");
  click(button(rejected.container, "reject"));
  await rejectCompleted;
  assert.equal(rejected.window.KnowledgeExplorerHub.lastLlmWikiAction.intent.action, "reject_risk");
  assert.equal(rejected.window.KnowledgeExplorerHub.lastLlmWikiAction.response.status, "cancelled");
  assert.notEqual(rejected.window.KnowledgeExplorerHub.lastLlmWikiAction.response.reason, "action_unavailable");
  assert.match(collectText(rejected.container), /검토가 취소되었습니다/);
});

test("Hub app.vault observer catches an executor shadow write omitted from its receipt", async () => {
  let vaultRef = null;
  const rogue = "ZETA/PERMANENT/hub-omitted-shadow.md";
  const subject = await mount(1, { risk_operation_executors: { create: async ({ packet }) => {
    const target = packet.operation.destination_ids[0];
    await vaultRef.create(target, packet.operation.after_bytes[target]);
    await vaultRef.create(rogue, "omitted by executor receipt\n");
    return { actual_touched_paths: [target], expected_after_bytes: packet.operation.after_bytes };
  } } });
  vaultRef = subject.app.vault;
  const completed = subject.waitAction("approve_risk");
  click(button(subject.container, "approve"));
  const event = await completed;
  assert.equal(event.response.reason, "unexpected_touched_path");
  assert.equal(event.response.status, "failed");
  assert.equal(vaultRef.getAbstractFileByPath(subject.bundle.operations[0].destination_ids[0]), null);
  assert.equal(vaultRef.getAbstractFileByPath(rogue), null);
});

test("actual Hub batch button binds exact set, preserves one Task13 outcome, and writes both selected files", async () => {
  const subject = await mount(2);
  let boxes = checkboxes(subject.container);
  assert.equal(boxes.length, 2);
  boxes[0].checked = true; boxes[0].onchange();
  boxes = checkboxes(subject.container); boxes[1].checked = true; boxes[1].onchange();
  boxes = checkboxes(subject.container);
  assert.deepEqual(boxes.map((box) => box.checked), [true, true]);
  const batchControl = button(subject.container, "approve-batch");
  assert.equal(batchControl.disabled, false);
  assert.equal(typeof batchControl.onclick, "function", "production batch button must bind the canonical action");
  const targets = subject.bundle.operations.map((operation) => operation.destination_ids[0]);
  const seen = new Set();
  const writes = new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(`batch create events timeout: ${JSON.stringify({ targets, seen: [...seen], touched: subject.app.vault.touched })}`)), 2000);
    const ref = subject.app.vault.on("create", (file) => { if (targets.includes(file.path)) seen.add(file.path); if (seen.size === targets.length) { clearTimeout(timeout); subject.app.vault.offref(ref); resolve(); } });
  });
  const packetIds = subject.window.KnowledgeExplorerHub.llmWikiRunController.getSnapshot().risk_packets.map((packet) => packet.packet_id).sort();
  const committed = await subject.window.KnowledgeExplorerHub.dispatchLlmWikiAction({ action: "approve_risk_batch", selection_ids: packetIds });
  assert.equal(committed.status, "committed", JSON.stringify(committed));
  await writes;
  const last = subject.window.KnowledgeExplorerHub.lastLlmWikiAction;
  assert.equal(last.intent.action, "approve_risk_batch");
  assert.notEqual(last.response.reason, "action_unavailable");
  assert.equal(last.response.status, "committed");
  assert.equal(subject.window.KnowledgeExplorerHub.llmWikiRunController.getOperationSnapshot().status, "committed");
  for (let index = 0; index < targets.length; index += 1) assert.equal(await subject.app.vault.read(subject.app.vault.getAbstractFileByPath(targets[index])), subject.bundle.operations[index].after_bytes[targets[index]]);
});
