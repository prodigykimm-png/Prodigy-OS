"use strict";

const assert = require("node:assert/strict");
const { test } = require("node:test");
const { runHub } = require("./knowledge_hub_integration_harness.js");

async function analyzedHub() {
  const provider = async (request) => ({
    ok: true,
    artifacts: request.chunks.map((chunk) => ({ chunk_key: chunk.key, outcome: "proposals", items: [{ role: "source_summary", evidence_quote: chunk.text.trim().slice(0, 12), claims: ["persist ack proposal"], review_reasons: [], related_candidate_ids: [] }] })),
  });
  const options = { batchIdentity: { provider_key: "openrouter", model: "model-a", structured_mode: "json_schema", schema_id: "llmwiki_compact_v1", prompt_version: "p_persist_ack" }, batchProvider: provider };
  const hub = await runHub({ pages: [], extraFiles: { "INBOX/Knowledge/persist-ack-source.md": "# Persist Ack\n\nExact persist review selection lifecycle ack body.\n" }, llmWikiControllerOptions: options });
  await hub.window.KnowledgeExplorerHub.whenKnowledgeInboxSettled();
  const analyzed = await hub.window.KnowledgeExplorerHub.dispatchLlmWikiAction({ action: "analyze_inbox" });
  assert.equal(analyzed.ok, true, analyzed.reason);
  return hub;
}

test("persist_review_selection with valid operation_ids saves durable snapshot and pushes the selection into the mounted lifecycle view", async () => {
  const hub = await analyzedHub();
  const Hub = hub.window.KnowledgeExplorerHub;
  const packet = Hub.llmWikiRunController.getSnapshot().risk_packets[0];
  const operationId = packet.operation.operation_id;

  assert.deepEqual(Array.from(Hub.llmWikiLifecycle.getSnapshot().durable_review_selection || []), [], "view has no persisted selection before dispatch");

  const response = await Hub.dispatchLlmWikiAction({ action: "persist_review_selection", operation_ids: [operationId] });

  assert.equal(response.ok, true);
  assert.equal(response.status, "review");
  assert.equal(response.provider_calls, 0);
  assert.deepEqual(JSON.parse(JSON.stringify(response.write_counts)), { canonical: 0, audit: 0, refresh: 0, git: 0 });

  const viewSnapshot = Hub.llmWikiLifecycle.getSnapshot();
  assert.deepEqual(Array.from(viewSnapshot.durable_review_selection), [operationId], "mounted lifecycle view must receive the persisted selection via update()");

  const derivedSnapshot = Hub.llmWikiLifecycleSnapshot();
  assert.deepEqual(Array.from(derivedSnapshot.durable_review_selection), [operationId]);
});

test("persist_review_selection with an invalid intent is rejected and leaves the mounted lifecycle view snapshot unchanged", async () => {
  const hub = await analyzedHub();
  const Hub = hub.window.KnowledgeExplorerHub;
  const viewSnapshotBefore = Hub.llmWikiLifecycle.getSnapshot();

  const response = await Hub.dispatchLlmWikiAction({ action: "persist_review_selection", operation_ids: "not-an-array" });

  assert.equal(response.ok, false);
  assert.equal(response.status, "rejected");
  assert.equal(response.reason, "review_selection_unavailable");
  assert.equal(Hub.llmWikiLifecycle.getSnapshot(), viewSnapshotBefore, "an invalid persist_review_selection intent must not push a new snapshot into the view");
});
