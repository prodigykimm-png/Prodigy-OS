"use strict";

const assert = require("node:assert/strict");
const { test } = require("node:test");
const { buildPages, runHub, remountHub } = require("./knowledge_hub_integration_harness.js");

const INBOX_PATH = "INBOX/batch-golden-fixture.md";
const INBOX_SOURCE = "# 배치 코어 골든 픽스처\n\n단일 클릭 계약을 고정하기 위한 로컬 픽스처 본문입니다.\n";
const IDENTITY = Object.freeze({
  provider_key: "openrouter",
  model: "test/model-golden",
  structured_mode: "json_schema",
  schema_id: "llmwiki_compact_v1",
  prompt_version: "task14-golden",
});

function compactArtifacts(input) {
  return {
    ok: true,
    artifacts: input.chunks.map((chunk) => ({
      chunk_key: chunk.key,
      outcome: "proposals",
      items: [{
        role: "source_summary",
        evidence_quote: chunk.text.trim().slice(0, 12),
        claims: ["명시적 배치 분석 근거"],
        review_reasons: [],
        related_candidate_ids: [],
      }],
    })),
  };
}

test("golden real Hub path reaches byte-identical Processed and is duplicate/restart safe", async () => {
  const providerCalls = [];
  let releaseProvider;
  const providerReleased = new Promise((resolve) => { releaseProvider = resolve; });
  let observeProvider;
  const providerObserved = new Promise((resolve) => { observeProvider = resolve; });
  const result = await runHub({
    pages: buildPages(),
    extraFiles: { [INBOX_PATH]: INBOX_SOURCE },
    llmWikiControllerOptions: {
      batchIdentity: IDENTITY,
      batchProvider: async (input) => {
        providerCalls.push(input);
        observeProvider();
        await providerReleased;
        return compactArtifacts(input);
      },
    },
  });
  const hub = result.window.KnowledgeExplorerHub;
  const pending = await hub.whenKnowledgeInboxSettled();
  assert.deepEqual({ state: pending.state, pending: pending.pending }, { state: "queued", pending: 1 });
  assert.equal(providerCalls.length, 0, "mount discovery is provider-free");

  const firstClick = hub.dispatchLlmWikiAction({ action: "analyze_inbox" });
  await providerObserved;
  const duplicateClick = hub.dispatchLlmWikiAction({ action: "analyze_inbox" });
  assert.equal(providerCalls.length, 1, "duplicate click creates no second request");
  releaseProvider();
  const [analyzed, duplicateAnalyzed] = await Promise.all([firstClick, duplicateClick]);
  assert.equal(analyzed.ok, true, analyzed.reason);
  assert.equal(duplicateAnalyzed.ok, true, duplicateAnalyzed.reason);
  assert.equal(duplicateAnalyzed.run_id, analyzed.run_id);
  assert.equal(duplicateAnalyzed.job_id, analyzed.job_id);
  assert.equal(providerCalls.length, 1);

  const review = hub.llmWikiRunController.getSnapshot();
  assert.equal(review.status, "review");
  assert.equal(review.risk_packets.length, 1);
  const packet = review.risk_packets[0];
  const intent = { action: "approve_risk", run_id: packet.run_id, run_revision: packet.run_revision, packet_id: packet.packet_id };
  const approved = await hub.dispatchLlmWikiAction(intent);
  assert.equal(approved.ok, true, approved.reason);
  assert.equal(approved.status, "processed");
  assert.equal(providerCalls.length, 1, "approval never calls the provider");
  const processedPath = [...result.app.vault.touched].find((row) => row[0] === "create" && /^INBOX\/Processed\/\d{4}-\d{2}\/batch-golden-fixture\.md$/u.test(row[1]))?.[1];
  assert.ok(processedPath, JSON.stringify(result.app.vault.touched));
  assert.equal(await result.app.vault.read(processedPath), INBOX_SOURCE, "Processed bytes are identical");
  assert.equal(result.app.vault.getAbstractFileByPath(INBOX_PATH), null);
  assert.ok(result.app.vault.touched.some((row) => String(row[1]).startsWith("ZETA/LITERATURE/")), "approved canonical write exists");
  assert.ok(result.app.vault.touched.some((row) => String(row[1]).startsWith(".llmwiki-audit/")), "audit receipt exists");

  const touchedAfterApproval = result.app.vault.touched.length;
  const duplicateApproval = await hub.dispatchLlmWikiAction(intent);
  assert.equal(duplicateApproval.ok, true, duplicateApproval.reason);
  assert.equal(duplicateApproval.status, "duplicate");
  assert.equal(result.app.vault.touched.length, touchedAfterApproval, "duplicate approval writes and moves zero");
  assert.equal(providerCalls.length, 1);

  const remounted = await remountHub(result.runtime);
  assert.equal(providerCalls.length, 1, "restart/remount performs no provider call");
  assert.equal(await remounted.app.vault.read(processedPath), INBOX_SOURCE);
  assert.equal(remounted.window.KnowledgeExplorerHub.llmWikiLifecycleSnapshot().durable_operation_outcomes[0].status, "committed");
});

test("real Hub batch approval commits fresh siblings, preserves stale partial source, and restores outcomes", async () => {
  let providerCalls = 0;
  const result = await runHub({
    pages: buildPages(),
    extraFiles: { "INBOX/partial-stale.md": "# Partial stale\n\nTwo independent proposals.\n" },
    llmWikiControllerOptions: {
      batchIdentity: IDENTITY,
      batchProvider: async (input) => {
        providerCalls += 1;
        return { ok: true, artifacts: input.chunks.map((chunk) => ({
          chunk_key: chunk.key,
          outcome: "proposals",
          items: [
            { role: "source_summary", evidence_quote: chunk.text.slice(0, 8), claims: ["literature row"], review_reasons: [], related_candidate_ids: [] },
            { role: "reusable_claim", evidence_quote: chunk.text.slice(9, 20), claims: ["candidate row"], review_reasons: [], related_candidate_ids: [] },
          ],
        })) };
      },
    },
  });
  const hub = result.window.KnowledgeExplorerHub;
  await hub.whenKnowledgeInboxSettled();
  const analyzed = await hub.dispatchLlmWikiAction({ action: "analyze_inbox" });
  assert.equal(analyzed.ok, true, analyzed.reason);
  const packets = hub.llmWikiRunController.getSnapshot().risk_packets;
  assert.equal(packets.length, 2);
  const stalePath = packets[0].operation.destination_ids[0];
  await result.app.vault.create(stalePath, "concurrent writer\n");
  const approved = await hub.dispatchLlmWikiAction({ action: "approve_risk_batch", selection_ids: packets.map((packet) => packet.packet_id) });
  assert.equal(approved.ok, true, approved.reason);
  assert.equal(approved.status, "review");
  assert.equal(approved.results.filter((row) => row.status === "stale").length, 1);
  assert.equal(approved.results.filter((row) => row.status === "committed").length, 1);
  assert.ok(result.app.vault.getAbstractFileByPath("INBOX/partial-stale.md"), "partial source remains in INBOX");
  assert.equal(providerCalls, 1);

  const restored = await remountHub(result.runtime);
  assert.equal(providerCalls, 1);
  assert.deepEqual(Array.from(restored.window.KnowledgeExplorerHub.llmWikiLifecycleSnapshot().durable_operation_outcomes, (row) => row.status).sort(), ["committed", "stale"]);
  assert.ok(restored.app.vault.getAbstractFileByPath("INBOX/partial-stale.md"));
});
