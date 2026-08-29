"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { test } = require("node:test");

const ROOT = path.resolve(__dirname, "../../../../../..");
const STORE_PATH = path.join(ROOT, "SYSTEM/Views/llmwiki-batch-job-store.js");
const PROCESS_HARNESS = path.join(ROOT, "SYSTEM/AI/Reports/task-13/manual-restart-harness.js");
const storeApi = require(STORE_PATH);
const analyzerApi = require(path.join(ROOT, "SYSTEM/Views/llmwiki-batch-analyzer.js"));
const { runHub } = require("./knowledge_hub_integration_harness.js");
const sha = (value) => crypto.createHash("sha256").update(String(value)).digest("hex");
const identity = (model = "model-a") => ({ provider_key: "openrouter", model, structured_mode: "json_schema", schema_id: "llmwiki_compact_v1", prompt_version: "p1", candidate_context_hash: sha("ctx") });
const sources = (body = "exact persisted source") => [{ source_id: "source_task13", revision_hash: sha(body) }];

test("Hub explicit retry preserves the frozen source set after partial progress", async () => {
  const calls = [];
  const runtime = await runHub({
    pages: [],
    extraFiles: { "INBOX/task13-a.md": "# A\\n", "INBOX/task13-b.md": "# B\\n" },
    llmWikiControllerOptions: {
      batchIdentity: { provider_key: "openrouter", model: "model-a", structured_mode: "json_schema", schema_id: "llmwiki_compact_v1", prompt_version: "p13" },
      batchProvider: async (request) => ({ ok: true, artifacts: request.chunks.map((chunk) => ({ chunk_key: chunk.key, outcome: "proposals", items: [] })) }),
    },
  });
  await runtime.window.KnowledgeExplorerHub.whenKnowledgeInboxSettled();
  const initial = await runtime.window.KnowledgeExplorerHub.dispatchLlmWikiAction({ action: "analyze_inbox" });
  assert.equal(initial.ok, true, initial.reason);
  await runtime.app.vault.modify(runtime.app.vault.getAbstractFileByPath("INBOX/task13-b.md"), "# B changed\\n");
  const sourceA = runtime.window.KnowledgeExplorerHub._llmWikiSession.inboxDiscoveryQueue.currentSources().find((source) => source.source_path.endsWith("task13-a.md"));
  const sourceB = runtime.window.KnowledgeExplorerHub._llmWikiSession.inboxDiscoveryQueue.currentSources().find((source) => source.source_path.endsWith("task13-b.md"));
  assert.ok(sourceA && sourceB);
  const hub = fs.readFileSync(path.join(ROOT, "HUB/50 Knowledge.md"), "utf8");
  assert.match(hub, /const sources = explicitRetry \? frozenBatch\.sources : frozenBatch\.sources\.filter/);
  assert.match(hub, /task13_explicit_retry: true/);
  assert.match(hub, /task13_retry_intent_id: retryIntentId/);
});

function child(dir, script) {
  const result = spawnSync(process.execPath, ["-e", script], { cwd: ROOT, encoding: "utf8", env: { ...process.env, TASK13_DIR: dir, TASK13_STORE: STORE_PATH } });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return JSON.parse(result.stdout);
}

test("true process A/B production harness proves restart, partial apply, stale recovery, and changed-identity retry", () => {
  const result = spawnSync(process.execPath, [PROCESS_HARNESS], { cwd: ROOT, encoding: "utf8", timeout: 20000 });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const receipt = JSON.parse(result.stdout);
  assert.equal(receipt.schema, "llmwiki_task13_two_process_production_v2");
  assert.notEqual(receipt.process_a.pid, receipt.process_b.pid);
  assert.deepEqual(receipt.process_b.before_approval, { proposals: 2, selected: 1, tab: "llmwiki", subscriber_count: 1, provider_calls_on_reopen: 0, canonical_writes_on_reopen: 0 });
  assert.equal(receipt.process_b.after_partial_apply.committed, 1);
  assert.deepEqual(receipt.process_b.after_partial_apply.committed_receipt_ids, [receipt.process_a.approval_receipt_id]);
  assert.equal(receipt.process_b.after_partial_apply.stale, 1);
  assert.equal(receipt.process_b.after_partial_apply.repacket, 0);
  assert.equal(receipt.process_b.after_partial_apply.repacket_failure_reason, "typed_repacket_failed");
  assert.equal(receipt.process_b.after_partial_apply.repacket_failure_durable_reason, "repacket_required");
  assert.equal(receipt.process_b.after_partial_apply.completed_after_repacket_failure, 1);
  assert.equal(receipt.process_b.after_partial_apply.duplicate_approval_extra_writes, 0);
  assert.equal(receipt.process_b.changed_identity_retry.provider_calls, 1);
  assert.equal(receipt.process_b.changed_identity_retry.child_count, 1);
  assert.equal(receipt.process_b.changed_identity_retry.frozen_model, "model-b");
});

test("process A running receipt restores in process B as outcome_unknown with provider/write zero", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "llmwiki-task13-process-"));
  try {
    const persisted = child(dir, `(async()=>{const api=require(process.env.TASK13_STORE),crypto=require('node:crypto'),sha=v=>crypto.createHash('sha256').update(String(v)).digest('hex'),store=api.createBatchJobStore({storage:api.createNodeStorage(process.env.TASK13_DIR)});await store.load();const key=api.requestKey({provider_key:'openrouter',model:'model-a',structured_mode:'json_schema',schema_id:'llmwiki_compact_v1',prompt_version:'p1',candidate_context_hash:sha('ctx')}),job=await store.createJob({request_key:key,sources:[{source_id:'source_task13',revision_hash:sha('exact persisted source')}],frozen_identity:{provider_key:'openrouter',model:'model-a',structured_mode:'json_schema',schema_id:'llmwiki_compact_v1',prompt_version:'p1',candidate_context_hash:sha('ctx')}});await store.setJobState(job.job_id,'running');console.log(JSON.stringify({job_id:job.job_id}));})().catch(e=>{console.error(e);process.exit(1)})`);
    const restored = child(dir, `(async()=>{const api=require(process.env.TASK13_STORE),store=api.createBatchJobStore({storage:api.createNodeStorage(process.env.TASK13_DIR)}),state=await store.load();console.log(JSON.stringify({status:state.jobs[${JSON.stringify(persisted.job_id)}].status,provider_calls:0,canonical_writes:0,source_writes:0}));})().catch(e=>{console.error(e);process.exit(1)})`);
    assert.deepEqual(restored, { status: "outcome_unknown", provider_calls: 0, canonical_writes: 0, source_writes: 0 });
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test("durable review snapshot round-trips selection, receipts, and partial outcomes without becoming a second authority", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "llmwiki-task13-review-"));
  try {
    const first = storeApi.createBatchJobStore({ storage: storeApi.createNodeStorage(dir) });
    await first.load();
    const key = storeApi.requestKey(identity());
    const job = await first.createJob({ request_key: key, sources: sources(), frozen_identity: identity() });
    await first.setJobState(job.job_id, "review_ready");
    const snapshot = {
      active_tab: "llmwiki", selected_batch_id: job.batch_id,
      review: { run_id: "run_task13_review", selected_operation_ids: ["operation_safe"], proposals: [{ operation_id: "operation_safe", packet_id: "packet_safe" }, { operation_id: "operation_stale", packet_id: "packet_stale" }] },
      operation_outcomes: [{ operation_id: "operation_safe", status: "committed", receipt_id: "receipt_safe" }, { operation_id: "operation_stale", status: "stale", action: "repacket" }],
    };
    await first.saveRecoverySnapshot(snapshot);
    const second = storeApi.createBatchJobStore({ storage: storeApi.createNodeStorage(dir) });
    await second.load();
    assert.deepEqual(second.getRecoverySnapshot(), snapshot);
    assert.equal(second.getJob(job.job_id).status, "review_ready");
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test("explicit retry creates one distinct frozen job per intent and duplicate intent is idempotent", async () => {
  const store = storeApi.createBatchJobStore({ storage: { files: new Map(), async exists(n){return this.files.has(n)}, async read(n){return this.files.get(n)}, async writeAtomic(n,v){this.files.set(n,v)}, async quarantine(){} } });
  await store.load();
  const oldKey = storeApi.requestKey(identity("model-a"));
  const old = await store.createJob({ request_key: oldKey, sources: sources(), frozen_identity: identity("model-a") });
  await store.setJobState(old.job_id, "outcome_unknown");
  const nextIdentity = identity("model-b");
  const request = { retry_parent_job_id: old.job_id, retry_intent_id: "retry_click_01", request_key: storeApi.requestKey(nextIdentity), sources: sources(), frozen_identity: nextIdentity };
  const [one, duplicate] = await Promise.all([store.claimExplicitRetry(request), store.claimExplicitRetry(request)]);
  assert.equal(one.job_id, duplicate.job_id);
  assert.notEqual(one.job_id, old.job_id);
  assert.equal(one.retry_parent_job_id, old.job_id);
  assert.equal(one.frozen_identity.model, "model-b");
  assert.equal(store.getJob(old.job_id).status, "outcome_unknown");
  assert.equal(Object.values((await store.load()).jobs).filter((job) => job.retry_parent_job_id === old.job_id).length, 1);
});

test("analyzer changed-identity retry links the exact-source parent and duplicate intent performs one provider request", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "llmwiki-task13-analyzer-"));
  try {
    const cacheRows = new Map();
    const coverageRows = new Set();
    const cache = {
      async lookup(manifest) {
        const hits = [], misses = [];
        for (const chunk of manifest.chunks) (cacheRows.has(chunk.text_hash) ? hits : misses).push(cacheRows.has(chunk.text_hash) ? { chunk, artifact: cacheRows.get(chunk.text_hash) } : { chunk });
        return { ok: true, hits, misses };
      },
      async put({ chunk, artifact }) { cacheRows.set(chunk.text_hash, artifact); return { ok: true }; },
    };
    const coverage = {
      async recordReceipt({ chunk }) { coverageRows.add(chunk.text_hash); return { ok: true }; },
      async status() { return { ok: true, complete: coverageRows.size > 0, exactCoverage: true }; },
    };
    let providerCalls = 0;
    let unknown = true;
    const provider = async (request) => {
      providerCalls += 1;
      if (unknown) return { ok: false, reason: "provider_outcome_unknown" };
      return { ok: true, artifacts: request.chunks.map((chunk) => ({ chunk_key: chunk.key, outcome: "proposals", items: [] })) };
    };
    const source = [{ source_id: "source_task13", source_path: "INBOX/task13.md", extracted_text: "# Restart\n\nExact persisted analyzer body." }];
    const firstStore = storeApi.createBatchJobStore({ storage: storeApi.createNodeStorage(dir) });
    const first = analyzerApi.createBatchAnalyzer({ jobStore: firstStore, provider, identity: { provider_key: "openrouter", model: "model-a", structured_mode: "json_schema", schema_id: "llmwiki_compact_v1", prompt_version: "p1" }, cache, coverage });
    const interrupted = await first.analyze({ sources: source });
    assert.equal(interrupted.ok, false);
    assert.equal(firstStore.getJob(interrupted.job_id || interrupted.batch_id)?.status, "outcome_unknown", JSON.stringify(interrupted));
    assert.equal(providerCalls, 1);

    const secondStore = storeApi.createBatchJobStore({ storage: storeApi.createNodeStorage(dir) });
    const second = analyzerApi.createBatchAnalyzer({ jobStore: secondStore, provider, identity: { provider_key: "openrouter", model: "model-b", structured_mode: "json_schema", schema_id: "llmwiki_compact_v1", prompt_version: "p1" }, cache, coverage });
    unknown = false;
    const [retry, duplicate] = await Promise.all([
      second.analyze({ sources: source, explicit_retry: true, retry_intent_id: "retry_double_click" }),
      second.analyze({ sources: source, explicit_retry: true, retry_intent_id: "retry_double_click" }),
    ]);
    assert.equal(retry.state, "review_ready", JSON.stringify(retry));
    assert.equal(duplicate.job_id, retry.job_id);
    assert.equal(providerCalls, 2, "model A interruption plus model B retry must make exactly two provider calls");
    assert.notEqual(retry.job_id, interrupted.job_id || interrupted.batch_id);
    const jobs = Object.values((await secondStore.load()).jobs);
    const child = jobs.find((job) => job.job_id === retry.job_id);
    assert.equal(child.retry_parent_job_id, interrupted.job_id || interrupted.batch_id);
    assert.equal(child.frozen_identity.model, "model-b");
    assert.equal(jobs.filter((job) => job.retry_parent_job_id === child.retry_parent_job_id).length, 1);
    assert.equal(secondStore.getJob(interrupted.job_id || interrupted.batch_id).status, "outcome_unknown", "the model A outcome remains preserved");
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test("new Hub module graph restores durable proposals and selection with provider0", async () => {
  const callsA = [];
  const provider = (calls) => async (request) => {
    calls.push(request);
    return { ok: true, artifacts: request.chunks.map((chunk) => ({ chunk_key: chunk.key, outcome: "proposals", items: [{ role: "source_summary", evidence_quote: chunk.text.trim().slice(0, 12), claims: ["durable proposal"], review_reasons: [], related_candidate_ids: [] }] })) };
  };
  const optionsA = { batchIdentity: { provider_key: "openrouter", model: "model-a", structured_mode: "json_schema", schema_id: "llmwiki_compact_v1", prompt_version: "p13" }, batchProvider: provider(callsA) };
  const first = await runHub({ pages: [], extraFiles: { "INBOX/Knowledge/task13-reopen.md": "# Durable\n\nExact process restart proposal body.\n" }, llmWikiControllerOptions: optionsA });
  await first.window.KnowledgeExplorerHub.whenKnowledgeInboxSettled();
  const analyzed = await first.window.KnowledgeExplorerHub.dispatchLlmWikiAction({ action: "analyze_inbox" });
  assert.equal(analyzed.ok, true, analyzed.reason);
  const packet = first.window.KnowledgeExplorerHub.llmWikiRunController.getSnapshot().risk_packets[0];
  await first.window.KnowledgeExplorerHub.dispatchLlmWikiAction({ action: "persist_review_selection", operation_ids: [packet.operation.operation_id] });
  const persisted = {};
  for (const file of first.app.vault.getFiles()) {
    if (["SYSTEM/CACHE/llmwiki/", "SYSTEM/PRIVATE/llmwiki-"].some((prefix) => file.path.startsWith(prefix))) persisted[file.path] = await first.app.vault.read(file);
  }
  persisted["INBOX/Knowledge/task13-reopen.md"] = "# Durable\n\nExact process restart proposal body.\n";

  const callsB = [];
  const second = await runHub({ pages: [], extraFiles: persisted, llmWikiControllerOptions: { ...optionsA, batchProvider: provider(callsB) } });
  await second.window.KnowledgeExplorerHub.whenKnowledgeInboxSettled();
  const restored = second.window.KnowledgeExplorerHub.llmWikiLifecycleSnapshot();
  assert.equal(callsB.length, 0, "new Hub graph must not call provider on restore");
  assert.equal(restored.status, "review");
  assert.equal(restored.risk_packets.length, 1);
  assert.deepEqual(Array.from(restored.durable_review_selection), [packet.operation.operation_id]);
  assert.equal(second.window.KnowledgeExplorerHub.tabs.getActiveTab(), "llmwiki");
  assert.equal(second.window.KnowledgeExplorerHub._llmWikiSession.inboxSubscribers.size, 1);
});

test("actual Hub stale approval persists only the affected operation and a fresh graph restores repacket with provider0/write0", async () => {
  const callsA = [];
  const provider = (calls) => async (request) => {
    calls.push(request);
    return { ok: true, artifacts: request.chunks.map((chunk) => ({ chunk_key: chunk.key, outcome: "proposals", items: [{ role: "source_summary", evidence_quote: chunk.text.trim().slice(0, 12), claims: ["durable proposal"], review_reasons: [], related_candidate_ids: [] }] })) };
  };
  const files = {
    "INBOX/Knowledge/task13-stale-a.md": "# Durable A\n\nExact stale proposal body A.\n",
    "INBOX/Knowledge/task13-stale-b.md": "# Durable B\n\nExact valid proposal body B.\n",
  };
  const options = { batchIdentity: { provider_key: "openrouter", model: "model-a", structured_mode: "json_schema", schema_id: "llmwiki_compact_v1", prompt_version: "p13" }, batchProvider: provider(callsA) };
  const first = await runHub({ pages: [], extraFiles: files, llmWikiControllerOptions: options });
  await first.window.KnowledgeExplorerHub.whenKnowledgeInboxSettled();
  assert.equal((await first.window.KnowledgeExplorerHub.dispatchLlmWikiAction({ action: "analyze_inbox" })).ok, true);
  const packets = first.window.KnowledgeExplorerHub.llmWikiRunController.getSnapshot().risk_packets;
  assert.equal(packets.length, 2);
  await first.app.vault.create(packets[0].operation.destination_ids[0], "concurrent target bytes\n");
  const stale = await first.window.KnowledgeExplorerHub.dispatchLlmWikiAction({ action: "approve_risk", run_id: packets[0].run_id, run_revision: packets[0].run_revision, packet_id: packets[0].packet_id });
  assert.equal(stale.results?.[0]?.reason, "create_target_exists", JSON.stringify(stale));

  const persisted = {};
  for (const file of first.app.vault.getFiles()) persisted[file.path] = await first.app.vault.read(file);
  const callsB = [];
  const second = await runHub({ pages: [], extraFiles: persisted, llmWikiControllerOptions: { ...options, batchProvider: provider(callsB) } });
  await second.window.KnowledgeExplorerHub.whenKnowledgeInboxSettled();
  const restored = second.window.KnowledgeExplorerHub.llmWikiLifecycleSnapshot();
  const staleOutcome = restored.durable_operation_outcomes.find((row) => row.operation_id === packets[0].operation.operation_id);
  const siblingOutcome = restored.durable_operation_outcomes.find((row) => row.operation_id === packets[1].operation.operation_id);
  assert.deepEqual(JSON.parse(JSON.stringify(staleOutcome)), { operation_id: packets[0].operation.operation_id, status: "stale", reason: "create_target_exists", reviewable: true });
  assert.equal(siblingOutcome.status, "review");
  assert.equal(restored.risk_packets.some((packet) => packet.operation.operation_id === packets[1].operation.operation_id), true);
  assert.equal(restored.durable_operation_outcomes.length, 2);
  assert.equal(callsB.length, 0, "fresh Hub graph must not call provider");
  assert.equal(second.app.vault.touched.some((row) => row[1]?.startsWith("ZETA/PERMANENT/")), false, "reopen must not write canonical state");
});
