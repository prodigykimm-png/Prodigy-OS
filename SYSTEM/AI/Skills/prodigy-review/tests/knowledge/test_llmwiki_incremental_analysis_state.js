"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");
const { test } = require("node:test");

const ROOT = path.resolve(__dirname, "../../../../../..");
const stateApi = require(path.join(ROOT, "SYSTEM/Views/llmwiki-incremental-analysis-state.js"));
const scopeApi = require(path.join(ROOT, "SYSTEM/Views/llmwiki-analysis-scope.js"));
const manifestApi = require(path.join(ROOT, "SYSTEM/Views/llmwiki-chunk-manifest.js"));
const coverageApi = require(path.join(ROOT, "SYSTEM/Views/llmwiki-chunk-coverage-store.js"));
const hash = require(path.join(ROOT, "SYSTEM/Views/llmwiki-hash.js"));

function createVault(seed = {}) {
  const files = { ...seed };
  const touched = [];
  return {
    files, touched,
    getAbstractFileByPath(filePath) { return Object.hasOwn(files, filePath) ? { path: filePath } : null; },
    async cachedRead(file) { return files[file.path]; },
    async createFolder(folderPath) { files[folderPath] = "__folder__"; },
    async create(filePath, text) { files[filePath] = text; touched.push(["create", filePath]); return { path: filePath }; },
    async modify(file, text) { files[file.path] = text; touched.push(["modify", file.path]); return file; },
  };
}

async function completedInput(text = "# Alpha\nbody\n") {
  const scope = scopeApi.createAnalysisScope({
    source_id: "source_incremental_alpha", source_path: "INBOX/alpha.md", content_hash: hash.sha256(text), source_text: text,
  });
  const manifest = manifestApi.createChunkManifest(scope);
  const coverage = coverageApi.createChunkCoverageStore({ vault: createVault() });
  for (const chunk of manifest.chunks) await coverage.recordReceipt({ manifest, scope, chunk, artifact: { result: chunk.semantic_id } });
  return { scope, manifest, coverage: await coverage.status(manifest, scope) };
}

test("v1 state is intentionally stale and contains no source bytes", async () => {
  const input = await completedInput();
  const legacy = JSON.stringify({
    schema_version: 1,
    completed: { [input.scope.source_id]: { source_path: input.scope.source_path, content_hash: input.scope.content_hash, analysis_contract_version: 1 } },
  });
  const vault = createVault({ [stateApi.DEFAULT_STATE_PATH]: legacy });
  const state = stateApi.createIncrementalAnalysisState({ vault });

  assert.equal(await state.isCompleted(input.scope), false);
  assert.equal(vault.touched.length, 0);
});

test("v2 completed coverage survives a restarted local state store", async () => {
  const input = await completedInput();
  const vault = createVault();
  const first = stateApi.createIncrementalAnalysisState({ vault });
  await first.markCompleted(input);
  assert.equal(await first.isCompleted(input.scope), true);

  const restarted = stateApi.createIncrementalAnalysisState({ vault });
  assert.equal(await restarted.isCompleted(input.scope), true);
  const persisted = vault.files[stateApi.DEFAULT_STATE_PATH];
  assert.ok(persisted);
  assert.doesNotMatch(persisted, /source_text|# Alpha|prompt|secret|Bearer/u);
  assert.equal(JSON.parse(persisted).schema_version, 2);
});

test("new source revision supersedes only its prior hash-bound completion", async () => {
  const original = await completedInput("# Alpha\nbody\n");
  const revised = await completedInput("# Alpha\nchanged body\n");
  const vault = createVault();
  const state = stateApi.createIncrementalAnalysisState({ vault });
  await state.markCompleted(original);
  await state.markCompleted(revised);
  assert.equal(await state.isCompleted(original.scope), false);
  assert.equal(await state.isCompleted(revised.scope), true);
});

test("forged serializable v2 state is stale instead of completed", async () => {
  const input = await completedInput();
  const vault = createVault();
  const first = stateApi.createIncrementalAnalysisState({ vault });
  await first.markCompleted(input);
  const forged = JSON.parse(vault.files[stateApi.DEFAULT_STATE_PATH]);
  forged.completed[input.scope.source_id].coverage.receipts[0].receipt_id = "coverage_forged";
  vault.files[stateApi.DEFAULT_STATE_PATH] = JSON.stringify(forged);
  assert.equal(await stateApi.createIncrementalAnalysisState({ vault }).isCompleted(input.scope), false);
});

test("corrupt v2 state fails open to fresh analysis", async () => {
  const input = await completedInput();
  const vault = createVault({ [stateApi.DEFAULT_STATE_PATH]: "{not-json" });
  const state = stateApi.createIncrementalAnalysisState({ vault });
  assert.equal(await state.isCompleted(input.scope), false);
  await state.markCompleted(input);
  assert.equal(await state.isCompleted(input.scope), true);
});

test("incomplete or malformed completion cannot write local state", async () => {
  const input = await completedInput();
  const vault = createVault();
  const state = stateApi.createIncrementalAnalysisState({ vault });
  await assert.rejects(state.markCompleted({ scope: input.scope, manifest: input.manifest, coverage: { receipts: [] } }), /incomplete_coverage/u);
  await assert.rejects(state.markCompleted({ scope: { ...input.scope, source_path: "../outside.md" }, manifest: input.manifest, coverage: input.coverage }), /invalid_analysis_scope/u);
  assert.equal(vault.touched.length, 0);
});
