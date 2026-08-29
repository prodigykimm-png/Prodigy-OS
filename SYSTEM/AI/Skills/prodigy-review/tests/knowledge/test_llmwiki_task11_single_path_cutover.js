"use strict";

// Task 11 (llmwiki-batch-core-simplification): cutover of Hub and controller to
// the single queue/analyzer path. Focused failing-first reference + behavioral
// tests. Canonical boundary:
//   discovery queue -> durable job store -> explicit user-triggered
//   batch analyzer/provider -> materializer -> retained approval surface.

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { test } = require("node:test");
const { runHub } = require("./knowledge_hub_integration_harness.js");

const ROOT = path.resolve(__dirname, "../../../../../..");

function readProduction(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), "utf8");
}

// Deterministic compact-artifact fake standing in for the single provider
// request boundary: answers every chunk with one exact unique quote from its
// own text (compact schema: {chunk_key, outcome, items}).
function compactArtifacts(input) {
  return {
    ok: true,
    artifacts: input.chunks.map((chunk) => ({
      chunk_key: chunk.key,
      outcome: "proposals",
      items: [{
        role: "source_summary",
        evidence_quote: chunk.text.trim().slice(0, 12),
        claims: ["batch claim"],
        review_reasons: [],
        related_candidate_ids: [],
      }],
    })),
  };
}

const BATCH_IDENTITY = {
  provider_key: "openrouter",
  model: "test/model-1",
  structured_mode: "json_schema",
  schema_id: "llmwiki_compact_v1",
  prompt_version: "p11",
};

test("reference audit: exactly one batch analyzer construction and one provider request boundary in production", () => {
  const hub = readProduction("HUB/50 Knowledge.md");
  const controller = readProduction("SYSTEM/Views/llmwiki-run-controller.js");
  const production = `${hub}\n${controller}`;
  assert.equal((production.match(/createBatchAnalyzer\(/gu) || []).length, 1, "exactly one batch analyzer construction");
  assert.equal((production.match(/createBatchAnalysisProvider\(/gu) || []).length, 1, "exactly one provider request boundary");
  const forbidden = [
    ["runLibrarian", "librarian pipeline analysis path"],
    ["inboxAutopilot.dispatch", "legacy autopilot dispatch"],
    ["inboxAnalysisTransport", "legacy inbox analysis transport"],
    ["inbox_chunk_analysis", "legacy provider action"],
    ["fleetingAnalysisTransport", "legacy fleeting transport"],
    ["scanInbox({ force", "force reanalysis dispatch"],
  ];
  for (const [needle, label] of forbidden) {
    assert.ok(!production.includes(needle), `production must not reference ${label}: ${needle}`);
  }
});

test("mount shows pending without any provider call; explicit analyze enters the canonical batch once", async () => {
  const calls = [];
  const result = await runHub({
    pages: [],
    extraFiles: { "INBOX/Knowledge/batch-one.md": "# 배치 자료\n\n고유한 본문 내용입니다.\n" },
    llmWikiControllerOptions: {
      batchIdentity: BATCH_IDENTITY,
      batchProvider: async (input) => { calls.push(input); return compactArtifacts(input); },
    },
  });
  const settled = await result.window.KnowledgeExplorerHub.whenKnowledgeInboxSettled();
  assert.deepEqual(
    { state: settled.state, total: settled.total, pending: settled.pending },
    { state: "queued", total: 1, pending: 1 },
    "mount must present a quiet pending count",
  );
  assert.equal(calls.length, 0, "mount/file events never call the provider");

  const response = await result.window.KnowledgeExplorerHub.dispatchLlmWikiAction({ action: "analyze_inbox" });
  assert.equal(response.ok, true, response && response.reason);
  assert.equal(response.provider_calls, 1, "explicit analyze makes exactly the non-empty cache-miss pack calls");
  assert.equal(calls.length, 1);
  assert.ok(response.proposals >= 1, "batch produced reviewable proposals");
  const snapshot = JSON.parse(JSON.stringify(result.window.KnowledgeExplorerHub.llmWikiRunController.getSnapshot()));
  assert.equal(snapshot.status, "review");
  assert.ok((snapshot.risk_packets || []).length > 0, "batch proposals open on the retained approval surface");
  assert.equal(snapshot.counters.provider, calls.length, "controller counters record the provider boundary");
});

test("selected-source explicit run routes as a one-source batch through the same analyzer", async () => {
  const calls = [];
  const result = await runHub({
    pages: [],
    extraFiles: {
      "ZETA/LITERATURE/선택 자료.md": "---\nsource_id: source_selected_fixture\nsensitivity: public\nsource_url: https://example.com/selected\n---\n# 선택 자료\n\n선택 배치 본문 내용입니다.\n",
    },
    llmWikiControllerOptions: {
      batchIdentity: BATCH_IDENTITY,
      batchProvider: async (input) => { calls.push(input); return compactArtifacts(input); },
    },
  });
  await result.window.KnowledgeExplorerHub.whenKnowledgeInboxSettled();
  await result.window.KnowledgeExplorerHub.dispatchLlmWikiAction({ action: "select_source" });
  const option = (result.window.KnowledgeExplorerHub.llmWikiLifecycleSnapshot().source_options || [])[0];
  assert.ok(option, "literature source option available");
  await result.window.KnowledgeExplorerHub.dispatchLlmWikiAction({ action: "select_source", source_path: option.path });
  const started = await result.window.KnowledgeExplorerHub.dispatchLlmWikiAction({ action: "start_run", explicit_user_consent: true });
  assert.equal(started.ok, true, started && started.reason);
  assert.equal(calls.length, 1, "selected-source run crosses the same single provider boundary exactly once");
  const selectedSnapshot = JSON.parse(JSON.stringify(result.window.KnowledgeExplorerHub.llmWikiRunController.getSnapshot()));
  assert.equal(selectedSnapshot.status, "review");
  assert.ok((selectedSnapshot.risk_packets || []).length > 0);
});
