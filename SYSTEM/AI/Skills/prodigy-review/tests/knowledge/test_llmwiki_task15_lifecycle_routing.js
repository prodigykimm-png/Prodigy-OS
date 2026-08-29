"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");
const { test } = require("node:test");

const ROOT = path.resolve(__dirname, "../../../../../..");
const manifest = require(path.join(ROOT, "SYSTEM/Views/prodigy-workspace-manifest.js"));

const LIFECYCLE_MODULES = Object.freeze([
  "SYSTEM/Views/llmwiki-claim-provenance.js",
  "SYSTEM/Views/llmwiki-analysis-scope.js",
  "SYSTEM/Views/llmwiki-chunk-manifest.js",
  "SYSTEM/Views/llmwiki-chunk-coverage-store.js",
  "SYSTEM/Views/llmwiki-analysis-cache.js",
  "SYSTEM/Views/llmwiki-batch-job-store.js",
  "SYSTEM/Views/llmwiki-batch-provider.js",
  "SYSTEM/Views/llmwiki-batch-analyzer.js",
  "SYSTEM/Views/llmwiki-inbox-discovery-queue.js",
  "SYSTEM/Views/llmwiki-identity-resolution.js",
  "SYSTEM/Views/llmwiki-lifecycle-routing-contract.js",
  "SYSTEM/Views/llmwiki-object-handoff-contract.js",
  "SYSTEM/Views/llmwiki-inbox-proposal-materializer.js",
  "SYSTEM/Views/llmwiki-sensitive-content-policy.js",
  "SYSTEM/Views/llmwiki-promotion-contract.js",
  "SYSTEM/Views/knowledge-fleeting-store.js",
  "SYSTEM/Views/knowledge-fleeting-review-state.js",
  "SYSTEM/Views/llmwiki-canonical-trust.js",
  "SYSTEM/Views/llmwiki-lifecycle-migration.js",
  "SYSTEM/Views/llmwiki-lifecycle-migration-plan.js",
  "SYSTEM/Views/llmwiki-lifecycle-migration-obsidian-adapter.js",
  "SYSTEM/Views/llmwiki-lifecycle-migration-transaction.js",
  "SYSTEM/Views/llmwiki-lifecycle-migration-flows.js",
]);

function memoryVault(initial = {}) {
  const files = new Map(Object.entries(initial));
  const writes = [];
  const file = (filePath) => ({ path: filePath, extension: filePath.endsWith(".md") ? "md" : "json" });
  return {
    files,
    writes,
    getAbstractFileByPath(filePath) { return files.has(filePath) ? file(filePath) : null; },
    getMarkdownFiles() { return [...files.keys()].filter((filePath) => filePath.endsWith(".md")).map(file); },
    async read(entry) { return files.get(entry.path); },
    async cachedRead(entry) { return files.get(entry.path); },
    async createFolder() {},
    async create(filePath, bytes) { files.set(filePath, bytes); writes.push(["create", filePath]); return file(filePath); },
    async modify(entry, bytes) { files.set(entry.path, bytes); writes.push(["modify", entry.path]); },
  };
}

function fleetingBytes(blocks) {
  return blocks.map(({ id, text }) => `<!-- fleeting-block-id: ${id} -->\n## 생각 저장\n\n${text}\n`).join("\n");
}

test("production Knowledge manifest loads Todo 1-14 lifecycle modules once before consumers", () => {
  const required = manifest.get("knowledge").required;
  for (const modulePath of LIFECYCLE_MODULES) {
    assert.equal(required.filter((entry) => entry === modulePath).length, 1, modulePath);
    assert.equal(required.some((entry) => entry.includes(" 2.")), false);
  }
  assert.ok(required.indexOf("SYSTEM/Views/knowledge-fleeting-store.js") < required.indexOf("SYSTEM/Views/quick-capture-view.js"));
  assert.ok(required.indexOf("SYSTEM/Views/llmwiki-canonical-trust.js") < required.indexOf("SYSTEM/Views/llmwiki-query-readonly.js"));
  assert.ok(required.indexOf("SYSTEM/Views/llmwiki-lifecycle-migration-flows.js") < required.indexOf("SYSTEM/Views/llmwiki-run-controller.js"));
});

test("Home loads the local Fleeting writer before quick capture", () => {
  const required = manifest.get("home").required;
  const store = "SYSTEM/Views/knowledge-fleeting-store.js";
  const capture = "SYSTEM/Views/quick-capture-view.js";
  assert.equal(required.filter((entry) => entry === store).length, 1);
  assert.ok(required.indexOf(store) < required.indexOf(capture));
});

test("Home action queue routes pending Fleeting work to Knowledge without analyzing it", () => {
  const queue = require(path.join(ROOT, "SYSTEM/Views/home-action-queue.js"));
  const actions = queue.buildActionQueue({
    now: new Date("2026-08-25T12:00:00.000Z"),
    pkg: { context: {} },
    fleetingCount: 3,
    journalStatus: "complete",
    workspacePathFor: (workspace) => workspace === "knowledge" ? "HUB/50 Knowledge.md" : "",
  });
  const fleeting = actions.find((action) => action.kind === "fleeting");
  assert.ok(fleeting);
  assert.equal(fleeting.workspace, "knowledge");
  assert.equal(fleeting.target_path, "HUB/50 Knowledge.md");
});

test("analysis scope admits only INBOX and explicit Fleeting sources", () => {
  const crypto = require("node:crypto");
  const scope = require(path.join(ROOT, "SYSTEM/Views/llmwiki-analysis-scope.js"));
  const text = "# 생각 저장\n\n검토할 생각";
  const content_hash = crypto.createHash("sha256").update(text).digest("hex");
  assert.equal(scope.createAnalysisScope({ source_id: "source_fleeting_test", source_path: "ZETA/FLEETING/2026-08-25.md", content_hash, source_text: text }).source_path, "ZETA/FLEETING/2026-08-25.md");
  assert.throws(() => scope.createAnalysisScope({ source_id: "source_permanent_test", source_path: "ZETA/PERMANENT/forbidden.md", content_hash, source_text: text }), /invalid_analysis_scope/u);
});

test("Fleeting review is provider-free until explicit review and persists only completed blocks", async () => {
  const review = require(path.join(ROOT, "SYSTEM/Views/knowledge-fleeting-review-state.js"));
  const sourcePath = "ZETA/FLEETING/2026-08-25.md";
  const vault = memoryVault({ [sourcePath]: fleetingBytes([
    { id: "fleeting-first", text: "첫 번째 생각" },
    { id: "fleeting-second", text: "두 번째 생각" },
  ]) });
  const calls = [];
  const service = review.createFleetingReviewState({
    vault,
    analyze: async ({ blocks }) => {
      calls.push(blocks.map((block) => block.block_id));
      return { ok: false, reason: "provider_unavailable", completed_block_ids: [blocks[0].block_id], reviews: [] };
    },
  });

  const pending = await service.refresh();
  assert.equal(pending.pending_count, 2);
  assert.equal(calls.length, 0);

  const partial = await service.reviewNew();
  assert.equal(partial.status, "partial");
  assert.deepEqual(calls, [["fleeting-first", "fleeting-second"]]);
  assert.equal(partial.pending_count, 1);

  const reloadedCalls = [];
  const reloaded = review.createFleetingReviewState({
    vault,
    analyze: async ({ blocks }) => { reloadedCalls.push(blocks); return { ok: true, completed_block_ids: blocks.map((block) => block.block_id), reviews: [] }; },
  });
  assert.equal((await reloaded.refresh()).pending_count, 1);
  assert.equal(reloadedCalls.length, 0);
});

test("Fleeting duplicate activation shares one run and late cancellation performs no state write", async () => {
  const review = require(path.join(ROOT, "SYSTEM/Views/knowledge-fleeting-review-state.js"));
  const vault = memoryVault({ "ZETA/FLEETING/2026-08-25.md": fleetingBytes([{ id: "fleeting-cancel", text: "취소할 생각" }]) });
  let resolveAnalysis;
  let resolveCalled;
  let calls = 0;
  const called = new Promise((resolve) => { resolveCalled = resolve; });
  const analysis = new Promise((resolve) => { resolveAnalysis = resolve; });
  const service = review.createFleetingReviewState({ vault, analyze: async () => { calls += 1; resolveCalled(); return analysis; } });
  const first = service.reviewNew();
  const duplicate = service.reviewNew();
  assert.equal(first, duplicate);
  await called;
  assert.equal(calls, 1);
  const cancelled = service.cancel();
  assert.equal(cancelled.status, "cancelled");
  resolveAnalysis({ ok: true, completed_block_ids: ["fleeting-cancel"], reviews: [] });
  assert.equal((await first).status, "cancelled");
  assert.equal(vault.writes.length, 0);
  assert.equal((await service.refresh()).pending_count, 1);
});

test("real Knowledge analyzes Fleeting only after the user action and restores review without provider replay", async () => {
  const { runHub } = require("./knowledge_hub_integration_harness.js");
  const sourcePath = "ZETA/FLEETING/2026-08-25.md";
  const sourceBytes = fleetingBytes([{ id: "fleeting-real-review", text: "명시적으로 정리할 생각" }]);
  const rolloutState = JSON.stringify({ version: "llmwiki_rollout_state_v1", enabled_phases: ["create"], gate_receipts: { create: { available: true, status: "green", receipt_id: "task15-fleeting-create" } } });
  const rollout_storage = { async load() { return rolloutState; }, async save() { return true; } };
  let providerCalls = 0;
  const result = await runHub({
    pages: [],
    extraFiles: { [sourcePath]: sourceBytes },
    llmWikiControllerOptions: {
      rollout_storage,
      batchIdentity: {
        provider_key: "openrouter",
        model: "test/model-1",
        structured_mode: "json_schema",
        schema_id: "llmwiki_compact_v1",
        prompt_version: "p11-fleeting",
      },
      batchProvider: async (input) => {
        providerCalls += 1;
        return { ok: true, artifacts: input.chunks.map((chunk) => ({
          chunk_key: chunk.key,
          outcome: "proposals",
          items: [{
            role: "source_summary",
            evidence_quote: chunk.text.trim().slice(0, 12),
            claims: ["명시적 Fleeting 검토"],
            review_reasons: [],
            related_candidate_ids: [],
          }],
        })) };
      },
    },
  });
  assert.equal(typeof result.window.KnowledgeExplorerHub.whenKnowledgeInboxSettled, "function", String(result.window.KnowledgeExplorerHub.error && result.window.KnowledgeExplorerHub.error.stack || "mount failed"));
  await result.window.KnowledgeExplorerHub.whenKnowledgeInboxSettled();
  assert.equal(result.window.KnowledgeExplorerHub.llmWikiLifecycleSnapshot().fleeting.pending_count, 1);
  assert.equal(providerCalls, 0);

  const reviewed = await result.window.KnowledgeExplorerHub.dispatchLlmWikiAction({ action: "review_fleeting" });
  assert.equal(reviewed.status, "complete", JSON.stringify(reviewed));
  assert.equal(providerCalls, 1);
  assert.equal(result.window.KnowledgeExplorerHub.llmWikiLifecycleSnapshot().fleeting.pending_count, 0);
  assert.ok(result.window.KnowledgeExplorerHub.llmWikiRunController.getSnapshot().risk_packets.length > 0);
  assert.equal(result.app.vault.touched.some(([, filePath]) => filePath.startsWith("ZETA/PERMANENT/")), false);

  const statePath = require(path.join(ROOT, "SYSTEM/Views/knowledge-fleeting-review-state.js")).DEFAULT_STATE_PATH;
  const persistedState = await result.app.vault.cachedRead(result.app.vault.getAbstractFileByPath(statePath));
  let replayCalls = 0;
  const reloaded = await runHub({
    pages: [],
    extraFiles: { [sourcePath]: sourceBytes, [statePath]: persistedState },
    llmWikiControllerOptions: {
      rollout_storage,
      batchIdentity: {
        provider_key: "openrouter",
        model: "test/model-1",
        structured_mode: "json_schema",
        schema_id: "llmwiki_compact_v1",
        prompt_version: "p11-fleeting",
      },
      batchProvider: async () => { replayCalls += 1; return { ok: false, reason: "provider_replay_forbidden" }; },
    },
  });
  assert.equal(typeof reloaded.window.KnowledgeExplorerHub.whenKnowledgeInboxSettled, "function", String(reloaded.window.KnowledgeExplorerHub.error && reloaded.window.KnowledgeExplorerHub.error.stack || "reload mount failed"));
  await reloaded.window.KnowledgeExplorerHub.whenKnowledgeInboxSettled();
  assert.equal(reloaded.window.KnowledgeExplorerHub.llmWikiLifecycleSnapshot().fleeting.pending_count, 0);
  assert.equal(replayCalls, 0);
  assert.ok(reloaded.window.KnowledgeExplorerHub.llmWikiRunController.getSnapshot().risk_packets.length > 0);
});

test("corrupt Fleeting state fails closed and explicit repair stays provider-free", async () => {
  const review = require(path.join(ROOT, "SYSTEM/Views/knowledge-fleeting-review-state.js"));
  const statePath = review.DEFAULT_STATE_PATH;
  const vault = memoryVault({
    "ZETA/FLEETING/2026-08-25.md": fleetingBytes([{ id: "fleeting-repair", text: "복구할 생각" }]),
    [statePath]: "{broken",
  });
  let calls = 0;
  const service = review.createFleetingReviewState({ vault, analyze: async () => { calls += 1; return { ok: true, completed_block_ids: [], reviews: [] }; } });
  const blocked = await service.refresh();
  assert.equal(blocked.status, "blocked");
  assert.equal(blocked.reason, "corrupt_fleeting_review_state");
  assert.equal(calls, 0);
  const repaired = await service.repair();
  assert.equal(repaired.status, "idle");
  assert.equal(repaired.pending_count, 1);
  assert.equal(calls, 0);
});
