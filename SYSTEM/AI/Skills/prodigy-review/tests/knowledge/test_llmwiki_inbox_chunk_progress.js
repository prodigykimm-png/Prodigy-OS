"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");
const { test } = require("node:test");
const { runHub } = require("./knowledge_hub_integration_harness.js");

const ROOT = path.resolve(__dirname, "../../../../../..");
const incremental = require(path.join(ROOT, "SYSTEM/Views/llmwiki-incremental-analysis-state.js"));
const coverage = require(path.join(ROOT, "SYSTEM/Views/llmwiki-chunk-coverage-store.js"));

function source(headings) {
  return headings.map(([heading, text]) => `# ${heading}\n\n${text}\n`).join("\n");
}

function semanticResponse(work) {
  return {
    ok: true,
    chunk_results: work.changed_chunks.map((chunk) => ({
      key: chunk.key,
      semantic_units: [{
        temporary_span_alias: "span_fixture",
        start: 0,
        end: Math.min(chunk.text.length, 12),
        origin_hint: "source_extract",
        disposition: "propose",
        uncertainty: { level: "low", reasons: [] },
        claims: [{ text: "fixture claim", temporary_span_alias: "span_fixture" }],
      }],
    })),
  };
}

test("real INBOX scan persists each chunk before progress and resumes only changed headings", async () => {
  const firstCalls = [];
  const raw = source([
    ["첫째", "a".repeat(7000)],
    ["둘째", "b".repeat(7000)],
    ["셋째", "c".repeat(7000)],
  ]);
  const first = await runHub({
    pages: [],
    extraFiles: { "INBOX/Knowledge/여러 제목.md": raw },
    llmWikiControllerOptions: {
      inboxAnalysisTransport: async (work) => { firstCalls.push(work); return semanticResponse(work); },
    },
  });
  const settled = await first.window.KnowledgeExplorerHub.whenKnowledgeInboxSettled();
  assert.equal(settled.state, "complete");
  assert.equal(firstCalls.length, 1);
  assert.ok(firstCalls[0].changed_chunks.length >= 3);
  const persisted = Object.fromEntries(await Promise.all([
    incremental.DEFAULT_STATE_PATH,
    coverage.DEFAULT_COVERAGE_PATH,
    "SYSTEM/PRIVATE/llmwiki-analysis-cache.json",
    "SYSTEM/PRIVATE/llmwiki-inbox-proposals.json",
  ].map(async (filePath) => [filePath, await first.app.vault.cachedRead(first.app.vault.getAbstractFileByPath(filePath))])));
  assert.deepEqual(first.app.vault.touched.filter((row) => row[1] === coverage.DEFAULT_COVERAGE_PATH).map((row) => row[0]), ["create", "modify", "modify"]);

  const resumedCalls = [];
  const resumed = await runHub({
    pages: [],
    extraFiles: { "INBOX/Knowledge/여러 제목.md": raw, ...persisted },
    llmWikiControllerOptions: { inboxAnalysisTransport: async (work) => { resumedCalls.push(work); return semanticResponse(work); } },
  });
  assert.equal((await resumed.window.KnowledgeExplorerHub.whenKnowledgeInboxSettled()).state, "complete");
  assert.equal(resumedCalls.length, 0);
  assert.ok((resumed.window.KnowledgeExplorerHub.llmWikiRunController.getSnapshot().risk_packets || []).length > 0, "restart reopens locally materialized review proposals without provider replay");

  const changedCalls = [];
  const changed = await runHub({
    pages: [],
    extraFiles: { "INBOX/Knowledge/여러 제목.md": source([["첫째", "a".repeat(7000)], ["둘째", "수정 ".repeat(1700)], ["셋째", "c".repeat(7000)]]), ...persisted },
    llmWikiControllerOptions: { inboxAnalysisTransport: async (work) => { changedCalls.push(work); return semanticResponse(work); } },
  });
  const changedSettled = await changed.window.KnowledgeExplorerHub.whenKnowledgeInboxSettled();
  assert.equal(changedCalls.length, 1);
  assert.equal(changedCalls[0].changed_chunks.length, 1);
  assert.deepEqual({ pending: changedSettled.proposal_pending, complete: changedSettled.proposal_complete, blocked: changedSettled.proposal_blocked }, { pending: 1, complete: 1, blocked: 0 });

  let corruptCalls = 0;
  const corrupt = await runHub({
    pages: [],
    extraFiles: { "INBOX/Knowledge/여러 제목.md": raw, ...persisted, "SYSTEM/PRIVATE/llmwiki-inbox-proposals.json": "{ corrupt" },
    llmWikiControllerOptions: { inboxAnalysisTransport: async (work) => { corruptCalls += 1; return semanticResponse(work); } },
  });
  const corruptState = await corrupt.window.KnowledgeExplorerHub.whenKnowledgeInboxSettled();
  assert.deepEqual({ state: corruptState.state, reason: corruptState.reason, blocked: corruptState.proposal_blocked }, { state: "blocked", reason: "corrupt_proposals_quarantined", blocked: 1 });
  assert.equal(corruptCalls, 0);
  assert.equal(await corrupt.app.vault.cachedRead(corrupt.app.vault.getAbstractFileByPath("INBOX/Knowledge/여러 제목.md")), raw);
});

test("real Hub routes a locally resolved PARA unit to one typed review handoff without writes", async () => {
  const sourceText = "# Object handoff\n\nLocal operational context.\n";
  const crypto = require("node:crypto");
  const semanticId = `semantic_${crypto.createHash("sha256").update(sourceText.trim()).digest("hex").slice(0, 24)}`;
  const objectBytes = "---\ntype: project\n---\n## ✍️ 메모 및 진행 상황\n";
  let providerCalls = 0;
  const result = await runHub({
    pages: [],
    extraFiles: { "INBOX/Knowledge/object-handoff.md": sourceText },
    llmWikiControllerOptions: {
      inboxLocalObjectIndex: [{ object_id: "project_alpha", object_type: "project", path: "PARA/PROJECTS/Alpha.md", revision: crypto.createHash("sha256").update(objectBytes).digest("hex"), bytes: objectBytes }],
      inboxLocalObjectRoutes: [{ semantic_id: semanticId, object_type: "project", object_id: "project_alpha", slot: "progress_note" }],
      inboxAnalysisTransport: async (work) => {
        providerCalls += 1;
        return { ok: true, chunk_results: work.changed_chunks.map((chunk) => ({ key: chunk.key, semantic_units: [{ temporary_span_alias: "span_object", start: 0, end: 12, origin_hint: "source_extract", disposition: "propose", uncertainty: { level: "low", reasons: [] }, claims: [{ text: "Local operational context", temporary_span_alias: "span_object" }] }] })) };
      },
    },
  });
  const settled = await result.window.KnowledgeExplorerHub.whenKnowledgeInboxSettled();
  assert.equal(providerCalls, 1);
  assert.equal(settled.state, "complete");
  assert.equal(settled.object_review_proposals.length, 1);
  assert.deepEqual({ object_type: settled.object_review_proposals[0].object_type, object_id: settled.object_review_proposals[0].object_id, slot: settled.object_review_proposals[0].target.slot }, { object_type: "project", object_id: "project_alpha", slot: "progress_note" });
  assert.equal(result.app.vault.touched.some(([, filePath]) => filePath.startsWith("PARA/") || filePath.startsWith("ZETA/PERMANENT/")), false);

  const persisted = Object.fromEntries(await Promise.all([
    incremental.DEFAULT_STATE_PATH, coverage.DEFAULT_COVERAGE_PATH,
    "SYSTEM/PRIVATE/llmwiki-analysis-cache.json", "SYSTEM/PRIVATE/llmwiki-inbox-proposals.json",
  ].map(async (filePath) => [filePath, await result.app.vault.cachedRead(result.app.vault.getAbstractFileByPath(filePath))])));
  const resumed = await runHub({
    pages: [], extraFiles: { "INBOX/Knowledge/object-handoff.md": sourceText, ...persisted },
    llmWikiControllerOptions: {
      inboxLocalObjectIndex: [{ object_id: "project_alpha", object_type: "project", path: "PARA/PROJECTS/Alpha.md", revision: crypto.createHash("sha256").update(objectBytes).digest("hex"), bytes: objectBytes }],
      inboxLocalObjectRoutes: [{ semantic_id: semanticId, object_type: "project", object_id: "project_alpha", slot: "progress_note" }],
      inboxAnalysisTransport: async () => { throw new Error("provider replay is forbidden"); },
    },
  });
  const resumedState = await resumed.window.KnowledgeExplorerHub.whenKnowledgeInboxSettled();
  assert.equal(resumedState.state, "complete", resumedState.reason);
  assert.equal(resumedState.object_review_proposals.length, 1);
});

test("real Hub blocks an operational route whose local Object identity cannot resolve", async () => {
  const sourceText = "# Invalid object\n\nBlocked local route.\n";
  const crypto = require("node:crypto");
  const semanticId = `semantic_${crypto.createHash("sha256").update(sourceText.trim()).digest("hex").slice(0, 24)}`;
  const result = await runHub({
    pages: [], extraFiles: { "INBOX/Knowledge/invalid-object.md": sourceText },
    llmWikiControllerOptions: {
      inboxLocalObjectRoutes: [{ semantic_id: semanticId, object_type: "project", object_id: "project_missing", slot: "progress_note" }],
      inboxAnalysisTransport: async (work) => ({ ok: true, chunk_results: work.changed_chunks.map((chunk) => ({ key: chunk.key, semantic_units: [{ temporary_span_alias: "span_invalid", start: 0, end: 12, origin_hint: "source_extract", disposition: "propose", uncertainty: { level: "low", reasons: [] }, claims: [{ text: "Blocked local route", temporary_span_alias: "span_invalid" }] }] })) }),
    },
  });
  const settled = await result.window.KnowledgeExplorerHub.whenKnowledgeInboxSettled();
  assert.equal(settled.state, "blocked");
  assert.equal(settled.reason, "local_materialization_blocked");
  assert.equal(settled.object_review_proposals.length, 0);
  assert.equal(result.app.vault.touched.some(([, filePath]) => filePath.startsWith("PARA/")), false);
});
