"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");
const { test } = require("node:test");

const ROOT = path.resolve(__dirname, "../../../../../..");
const service = require(path.join(ROOT, "SYSTEM/Views/llmwiki-incremental-analysis-state.js"));

const HASH_A = "a".repeat(64);
const HASH_B = "b".repeat(64);

function createVault(seed = {}) {
  const files = { ...seed };
  const touched = [];
  return {
    files,
    touched,
    getAbstractFileByPath(filePath) {
      return Object.prototype.hasOwnProperty.call(files, filePath) ? { path: filePath } : null;
    },
    async cachedRead(file) {
      return files[file.path];
    },
    async createFolder(folderPath) {
      files[folderPath] = "__folder__";
    },
    async create(filePath, text) {
      files[filePath] = text;
      touched.push(["create", filePath]);
      return { path: filePath };
    },
    async modify(file, text) {
      files[file.path] = text;
      touched.push(["modify", file.path]);
      return file;
    },
  };
}

test("completed content hashes survive a restarted local state store", async () => {
  const vault = createVault();
  const first = service.createIncrementalAnalysisState({ vault });
  const revision = {
    source_id: "source_incremental_alpha",
    source_path: "INBOX/alpha.md",
    content_hash: HASH_A,
  };

  assert.equal(await first.isCompleted(revision), false);
  await first.markCompleted(revision);
  assert.equal(await first.isCompleted(revision), true);

  const restarted = service.createIncrementalAnalysisState({ vault });
  assert.equal(await restarted.isCompleted(revision), true);
  assert.equal(await restarted.isCompleted({ ...revision, content_hash: HASH_B }), false);

  const persisted = vault.files[service.DEFAULT_STATE_PATH];
  assert.ok(persisted);
  assert.doesNotMatch(persisted, /source_text|prompt|secret|Bearer/u);
  assert.deepEqual(
    Object.keys(JSON.parse(persisted).completed.source_incremental_alpha).sort(),
    ["analysis_contract_version", "content_hash", "source_path"],
  );
});

test("corrupt or stale state fails open to one fresh analysis", async () => {
  const revision = {
    source_id: "source_incremental_beta",
    source_path: "INBOX/beta.md",
    content_hash: HASH_B,
  };
  const vault = createVault({
    [service.DEFAULT_STATE_PATH]: JSON.stringify({
      schema_version: service.SCHEMA_VERSION,
      completed: {
        source_incremental_beta: {
          source_path: revision.source_path,
          content_hash: revision.content_hash,
          analysis_contract_version: service.ANALYSIS_CONTRACT_VERSION - 1,
        },
      },
    }),
  });
  const state = service.createIncrementalAnalysisState({ vault });

  assert.equal(await state.isCompleted(revision), false);
  await state.markCompleted(revision);
  assert.equal(await state.isCompleted(revision), true);

  vault.files[service.DEFAULT_STATE_PATH] = "{not-json";
  const corrupt = service.createIncrementalAnalysisState({ vault });
  assert.equal(await corrupt.isCompleted(revision), false);
});

test("invalid revision identities are rejected before local state writes", async () => {
  const vault = createVault();
  const state = service.createIncrementalAnalysisState({ vault });

  await assert.rejects(
    state.markCompleted({
      source_id: "bad",
      source_path: "../outside.md",
      content_hash: "not-a-hash",
    }),
    /invalid_analysis_revision/u,
  );
  assert.equal(vault.touched.length, 0);
});
