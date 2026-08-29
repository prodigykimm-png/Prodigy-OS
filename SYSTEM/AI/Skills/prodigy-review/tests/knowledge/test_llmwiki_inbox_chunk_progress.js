"use strict";

// Task 11 repoint: INBOX chunk progress is bounded by the single canonical
// batch core. The provider override speaks the compact batch schema; analysis
// is an explicit user action (analyze_inbox); per-chunk artifacts persist to
// the durable cache/coverage stores before progress settles, and only changed
// headings re-enter the provider boundary.

const assert = require("node:assert/strict");
const path = require("node:path");
const { test } = require("node:test");
const { runHub } = require("./knowledge_hub_integration_harness.js");

const ROOT = path.resolve(__dirname, "../../../../../..");
const coverage = require(path.join(ROOT, "SYSTEM/Views/llmwiki-chunk-coverage-store.js"));
const manifestApi = require(path.join(ROOT, "SYSTEM/Views/llmwiki-chunk-manifest.js"));
const scopeApi = require(path.join(ROOT, "SYSTEM/Views/llmwiki-analysis-scope.js"));
const hashApi = require(path.join(ROOT, "SYSTEM/Views/llmwiki-hash.js"));
const storeApi = require(path.join(ROOT, "SYSTEM/Views/llmwiki-batch-job-store.js"));

const BATCH_IDENTITY = {
  provider_key: "openrouter",
  model: "test/model-1",
  structured_mode: "json_schema",
  schema_id: "llmwiki_compact_v1",
  prompt_version: "p11-progress",
};

function memoryStorage() {
  const files = new Map();
  return {
    async exists(name) { return files.has(name); },
    async read(name) { return files.get(name); },
    async writeAtomic(name, text) { files.set(name, text); },
    async quarantine(name) { files.delete(name); },
  };
}

function source(headings) {
  return headings.map(([heading, text]) => `# ${heading}\n\n${text}\n`).join("\n");
}

function compactArtifacts(input) {
  return {
    ok: true,
    artifacts: input.chunks.map((chunk) => ({
      chunk_key: chunk.key,
      outcome: "proposals",
      items: [{
        role: "source_summary",
        evidence_quote: chunk.text.trim().slice(0, 12),
        claims: ["fixture claim"],
        review_reasons: [],
        related_candidate_ids: [],
      }],
    })),
  };
}

async function readPersisted(hub, filePaths) {
  return Object.fromEntries(await Promise.all(filePaths.map(async (filePath) => [
    filePath,
    await hub.app.vault.cachedRead(hub.app.vault.getAbstractFileByPath(filePath)),
  ])));
}

test("real INBOX batch persists each chunk before progress and resumes only changed headings", async () => {
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
      batchIdentity: BATCH_IDENTITY,
      batchProvider: async (input) => { firstCalls.push(input); return compactArtifacts(input); },
    },
  });
  const queued = await first.window.KnowledgeExplorerHub.whenKnowledgeInboxSettled();
  assert.equal(queued.state, "queued");
  const analyzed = await first.window.KnowledgeExplorerHub.dispatchLlmWikiAction({ action: "analyze_inbox" });
  assert.equal(analyzed.ok, true, analyzed && analyzed.reason);
  assert.equal(analyzed.provider_calls, 1);
  assert.equal(firstCalls.length, 1);
  assert.equal(firstCalls[0].chunks.length, 1);
  assert.equal(hashApi.utf8ByteLength(firstCalls[0].chunks[0].text), 4 * 1024);
  assert.equal(firstCalls[0].chunks[0].text, raw.slice(0, firstCalls[0].chunks[0].text.length));
  assert.ok(hashApi.utf8ByteLength(raw.slice(0, firstCalls[0].chunks[0].text.length + 1)) > 4 * 1024);
  assert.equal(first.window.KnowledgeExplorerHub.llmWikiLifecycleSnapshot().inbox.state, "complete");
  const persisted = await readPersisted(first, [
    coverage.DEFAULT_COVERAGE_PATH,
    "SYSTEM/PRIVATE/llmwiki-analysis-cache.json",
    `SYSTEM/CACHE/llmwiki/${storeApi.STATE_FILE}`,
  ]);
  assert.deepEqual(first.app.vault.touched.filter((row) => row[1] === coverage.DEFAULT_COVERAGE_PATH).map((row) => row[0]), ["create"]);

  const resumedCalls = [];
  const resumed = await runHub({
    pages: [],
    extraFiles: { "INBOX/Knowledge/여러 제목.md": raw, ...persisted },
    llmWikiControllerOptions: {
      batchIdentity: BATCH_IDENTITY,
      batchProvider: async (input) => { resumedCalls.push(input); return compactArtifacts(input); },
    },
  });
  const resumedSettled = await resumed.window.KnowledgeExplorerHub.whenKnowledgeInboxSettled();
  assert.equal(resumedSettled.state, "up_to_date");
  assert.equal(resumedCalls.length, 0);

  const changedCalls = [];
  const changed = await runHub({
    pages: [],
    extraFiles: { "INBOX/Knowledge/여러 제목.md": source([["첫째", "a".repeat(7000)], ["둘째", "수정 ".repeat(1700)], ["셋째", "c".repeat(7000)]]), ...persisted },
    llmWikiControllerOptions: {
      batchIdentity: BATCH_IDENTITY,
      batchProvider: async (input) => { changedCalls.push(input); return compactArtifacts(input); },
    },
  });
  const changedQueued = await changed.window.KnowledgeExplorerHub.whenKnowledgeInboxSettled();
  assert.equal(changedQueued.state, "queued");
  const changedAnalyzed = await changed.window.KnowledgeExplorerHub.dispatchLlmWikiAction({ action: "analyze_inbox" });
  assert.equal(changedAnalyzed.ok, true, changedAnalyzed && changedAnalyzed.reason);
  assert.equal(changedCalls.length, 0, "unchanged routing excerpts reuse the routing cache despite a new full source revision");
});

test("real Hub resolves a local PARA object route through one explicit batch without canonical writes", async () => {
  const sourceText = "# Object handoff\n\nLocal operational context.\n";
  const crypto = require("node:crypto");
  const contentHash = hashApi.sha256(sourceText);
  const sourceId = `source_${hashApi.sha256("INBOX/Knowledge/object-handoff.md").slice(0, 24)}`;
  const scope = scopeApi.createAnalysisScope({ source_id: sourceId, source_path: "INBOX/Knowledge/object-handoff.md", content_hash: contentHash, source_text: sourceText });
  const semanticId = manifestApi.createChunkManifest(scope).chunks[0].semantic_id;
  const objectBytes = "---\ntype: project\n---\n## ✍️ 메모 및 진행 상황\n";
  let providerCalls = 0;
  const localObjectIndex = [{ object_id: "project_alpha", object_type: "project", path: "PARA/PROJECTS/Alpha.md", revision: crypto.createHash("sha256").update(objectBytes).digest("hex"), bytes: objectBytes }];
  const localObjectRoutes = [{ semantic_id: semanticId, object_type: "project", object_id: "project_alpha", slot: "progress_note" }];
  const result = await runHub({
    pages: [],
    extraFiles: { "INBOX/Knowledge/object-handoff.md": sourceText },
    llmWikiControllerOptions: {
      inboxLocalObjectIndex: localObjectIndex,
      inboxLocalObjectRoutes: localObjectRoutes,
      batchIdentity: BATCH_IDENTITY,
      batchProvider: async (input) => {
        providerCalls += 1;
        return { ok: true, artifacts: input.chunks.map((chunk) => ({
          chunk_key: chunk.key,
          outcome: "proposals",
          items: [{
            role: "object_context",
            evidence_quote: chunk.text.trim().slice(0, 12),
            claims: ["progress note for project alpha"],
            review_reasons: [],
            related_candidate_ids: [],
          }],
        })) };
      },
    },
  });
  await result.window.KnowledgeExplorerHub.whenKnowledgeInboxSettled();
  const analyzed = await result.window.KnowledgeExplorerHub.dispatchLlmWikiAction({ action: "analyze_inbox" });
  assert.equal(analyzed.ok, true, analyzed && analyzed.reason);
  assert.equal(providerCalls, 1);
  assert.equal(result.window.KnowledgeExplorerHub.llmWikiLifecycleSnapshot().inbox.state, "complete");
  assert.equal(result.app.vault.touched.some(([, filePath]) => filePath.startsWith("PARA/") || filePath.startsWith("ZETA/PERMANENT/")), false);

  const persisted = await readPersisted(result, [
    coverage.DEFAULT_COVERAGE_PATH,
    "SYSTEM/PRIVATE/llmwiki-analysis-cache.json",
    `SYSTEM/CACHE/llmwiki/${storeApi.STATE_FILE}`,
  ]);
  const resumedCalls = [];
  const resumed = await runHub({
    pages: [],
    extraFiles: { "INBOX/Knowledge/object-handoff.md": sourceText, ...persisted },
    llmWikiControllerOptions: {
      inboxLocalObjectIndex: localObjectIndex,
      inboxLocalObjectRoutes: localObjectRoutes,
      batchIdentity: BATCH_IDENTITY,
      batchProvider: async (input) => { resumedCalls.push(input); return compactArtifacts(input); },
    },
  });
  const resumedSettled = await resumed.window.KnowledgeExplorerHub.whenKnowledgeInboxSettled();
  assert.equal(resumedSettled.state, "up_to_date", resumedSettled.reason);
  assert.equal(resumedCalls.length, 0, "provider replay after durable coverage is forbidden");
});

test("real Hub blocks an operational route whose local Object identity cannot resolve", async () => {
  const sourceText = "# Invalid object\n\nBlocked local route.\n";
  const contentHash = hashApi.sha256(sourceText);
  const sourceId = `source_${hashApi.sha256("INBOX/Knowledge/invalid-object.md").slice(0, 24)}`;
  const scope = scopeApi.createAnalysisScope({ source_id: sourceId, source_path: "INBOX/Knowledge/invalid-object.md", content_hash: contentHash, source_text: sourceText });
  const semanticId = manifestApi.createChunkManifest(scope).chunks[0].semantic_id;
  const result = await runHub({
    pages: [],
    extraFiles: { "INBOX/Knowledge/invalid-object.md": sourceText },
    llmWikiControllerOptions: {
      inboxLocalObjectRoutes: [{ semantic_id: semanticId, object_type: "project", object_id: "project_missing", slot: "progress_note" }],
      batchIdentity: BATCH_IDENTITY,
      batchProvider: async (input) => ({ ok: true, artifacts: input.chunks.map((chunk) => ({
        chunk_key: chunk.key,
        outcome: "proposals",
        items: [{
          role: "object_context",
          evidence_quote: chunk.text.trim().slice(0, 12),
          claims: ["blocked route claim"],
          review_reasons: [],
          related_candidate_ids: [],
        }],
      })) }),
    },
  });
  await result.window.KnowledgeExplorerHub.whenKnowledgeInboxSettled();
  const analyzed = await result.window.KnowledgeExplorerHub.dispatchLlmWikiAction({ action: "analyze_inbox" });
  assert.equal(analyzed.ok, false);
  const settled = result.window.KnowledgeExplorerHub.llmWikiLifecycleSnapshot().inbox;
  assert.equal(settled.state, "blocked");
  assert.equal(settled.reason, "unknown_object");
  assert.equal(result.app.vault.touched.some(([, filePath]) => filePath.startsWith("PARA/")), false);
});


test("Hub retry preserves frozen full revisions while routing one bounded excerpt per source", async () => {
  const files = {
    "INBOX/Knowledge/retry-alpha.md": `# Alpha\n\n${"a".repeat(100 * 1024)}`,
    "INBOX/Knowledge/retry-beta.md": `# Beta\n\n${"b".repeat(100 * 1024)}`,
  };
  const jobStore = storeApi.createBatchJobStore({ storage: memoryStorage() });
  const calls = [];
  const hub = await runHub({
    pages: [],
    extraFiles: files,
    llmWikiControllerOptions: {
      batchIdentity: BATCH_IDENTITY,
      batchJobStore: jobStore,
      batchProvider: async (input) => {
        calls.push(input);
        return calls.length === 1 ? { ok: false, reason: "provider_unavailable" } : compactArtifacts(input);
      },
    },
  });
  await hub.window.KnowledgeExplorerHub.whenKnowledgeInboxSettled();
  const first = await hub.window.KnowledgeExplorerHub.dispatchLlmWikiAction({ action: "analyze_inbox" });
  assert.equal(first.ok, false);
  const retried = await hub.window.KnowledgeExplorerHub.dispatchLlmWikiAction({ action: "retry_inbox" });
  assert.equal(retried.ok, true, retried && retried.reason);
  assert.equal(calls.length, 2);
  assert.equal(calls[1].chunks.length, 2);
  const expectedExcerpts = Object.values(files).map((text) => text.slice(0, 4 * 1024)).sort();
  assert.deepEqual(Array.from(calls[1].chunks, (chunk) => chunk.text).sort(), expectedExcerpts);
  for (const chunk of calls[1].chunks) assert.ok(hashApi.utf8ByteLength(chunk.text) <= 4 * 1024);
  const jobs = Object.values((await jobStore.load()).jobs);
  const retryJob = jobs.find((job) => job.job_id === retried.job_id);
  assert.deepEqual(Object.keys(retryJob.sources).sort(), Object.keys(files).map((filePath) => `source_${hashApi.sha256(filePath).slice(0, 24)}`).sort());
  for (const [filePath, extractedText] of Object.entries(files)) {
    const sourceId = `source_${hashApi.sha256(filePath).slice(0, 24)}`;
    assert.equal(retryJob.sources[sourceId], hashApi.sha256(extractedText));
  }
});

test("provider-free real INBOX routing benchmark bounds 30 sources to 30 chunks and eight calls", async (t) => {
  const files = Object.fromEntries(Array.from({ length: 30 }, (_, index) => [
    `INBOX/Knowledge/benchmark-${String(index).padStart(2, "0")}.md`,
    `# Benchmark ${index}\n\n${String(index).repeat(6000)}`,
  ]));
  const calls = [];
  const hub = await runHub({
    pages: [],
    extraFiles: files,
    llmWikiControllerOptions: {
      batchIdentity: BATCH_IDENTITY,
      batchProvider: async (input) => { calls.push(input); return compactArtifacts(input); },
    },
  });
  await hub.window.KnowledgeExplorerHub.whenKnowledgeInboxSettled();
  const result = await hub.window.KnowledgeExplorerHub.dispatchLlmWikiAction({ action: "analyze_inbox" });
  assert.equal(result.ok, true, result && result.reason);
  const chunks = calls.flatMap((call) => call.chunks);
  const outboundBytes = chunks.reduce((total, chunk) => total + hashApi.utf8ByteLength(chunk.text), 0);
  assert.equal(chunks.length, 30);
  assert.equal(calls.length, 8);
  assert.ok(chunks.every((chunk) => hashApi.utf8ByteLength(chunk.text) <= 4 * 1024));
  t.diagnostic(`30 source routing benchmark: ${outboundBytes} outbound UTF-8 bytes across ${calls.length} provider-free calls`);
});


test("Hub materialization retains the full source hash while evidence stays in the routing excerpt", async () => {
  const extractedText = `# Full revision authority\n\n${"e".repeat(10 * 1024)}`;
  const analysisText = extractedText.slice(0, 4 * 1024);
  const hub = await runHub({
    pages: [],
    llmWikiControllerOptions: {
      batchIdentity: BATCH_IDENTITY,
      batchProvider: async (input) => compactArtifacts(input),
    },
  });
  const sourceId = "src_materialized";
  const outcome = await hub.window.KnowledgeExplorerHub._llmWikiSession.bindings.runCanonicalBatch({
    sources: [{ source_id: sourceId, source_path: "INBOX/Knowledge/materialized.md", extracted_text: extractedText, analysis_text: analysisText }],
  });
  assert.equal(outcome.ok, true, outcome && outcome.reason);
  const group = outcome.source_groups[0];
  assert.equal(group.content_hash, hashApi.sha256(extractedText));
  const citation = group.proposals[0].operation.source_citations[0];
  assert.equal(citation.content_hash, hashApi.sha256(extractedText));
  assert.ok(extractedText.includes(analysisText.trim().slice(0, 12)));
});
