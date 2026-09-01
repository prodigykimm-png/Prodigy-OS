"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");
const { test } = require("node:test");

const ROOT = path.resolve(__dirname, "../../../../../..");
const hash = require(path.join(ROOT, "SYSTEM/Views/llmwiki-hash.js"));
const operationApi = require(path.join(ROOT, "SYSTEM/Views/prodigy-wiki-operation-store.js"));
const workbench = require(path.join(ROOT, "SYSTEM/Views/llmwiki-golden-preview-workbench.js"));

const SOURCE = Object.freeze({
  path: "INBOX/서울투자반.md",
  title: "서울투자반",
  source_kind: "inbox",
  content_hash: "8".repeat(64),
});
const RANGE = Object.freeze({
  scope_id: "heading_002",
  range_id: "heading_002",
  title: "첫 장",
  start: 100,
  end: 900,
});

function memoryStorage(initial = null) {
  let bytes = initial;
  let writes = 0;
  let quarantines = 0;
  let failNextWrite = false;
  return {
    async exists() { return bytes !== null; },
    async read() { return bytes; },
    async writeAtomic(_name, next) {
      if (failNextWrite) {
        failNextWrite = false;
        throw new Error("injected_write_failure");
      }
      writes += 1;
      bytes = next;
    },
    async quarantine() { quarantines += 1; bytes = null; },
    snapshot() { return { bytes, writes, quarantines }; },
    failOnce() { failNextWrite = true; },
  };
}

function operationInput(overrides = {}) {
  return {
    source: SOURCE,
    range: RANGE,
    orchestrator_version: "llmwiki_golden_wiki_orchestrator_v1",
    ...overrides,
  };
}

test("operation identity changes only with source range or orchestrator contract", () => {
  const base = operationApi.operationIdentity(operationInput(), hash);
  assert.equal(base, operationApi.operationIdentity(operationInput(), hash));
  assert.notEqual(base, operationApi.operationIdentity(operationInput({
    source: { ...SOURCE, content_hash: "9".repeat(64) },
  }), hash));
  assert.notEqual(base, operationApi.operationIdentity(operationInput({
    range: { ...RANGE, end: RANGE.end + 1 },
  }), hash));
  assert.notEqual(base, operationApi.operationIdentity(operationInput({
    orchestrator_version: "prodigy_wiki_orchestrator_v2",
  }), hash));
});

test("duplicate begin returns one durable running operation", async () => {
  const storage = memoryStorage();
  const store = operationApi.createStore({ storage, hash });
  const first = await store.begin(operationInput());
  const second = await store.begin(operationInput());
  assert.equal(first.status, "running");
  assert.equal(second.status, "duplicate");
  assert.equal(second.operation.operation_id, first.operation_id);
  assert.equal(storage.snapshot().writes, 1);
});

test("reload maps an unreceipted running operation to resumable interruption", async () => {
  const storage = memoryStorage();
  const firstStore = operationApi.createStore({ storage, hash });
  const running = await firstStore.begin(operationInput());
  const reloaded = operationApi.createStore({ storage, hash });
  const operation = await reloaded.load();
  assert.equal(operation.operation_id, running.operation_id);
  assert.equal(operation.status, "interrupted");
  assert.equal(operation.resumable, true);
  assert.equal(operation.reason, "app_reloaded_during_run");
});

test("restore assessment blocks a changed source revision", async () => {
  const storage = memoryStorage();
  const store = operationApi.createStore({ storage, hash });
  await store.begin(operationInput());
  await store.interrupt({ reason: "provider_timeout", resumable: true });
  const operation = await store.load();
  const restored = operationApi.assessRestore(operation, "7".repeat(64));
  assert.equal(restored.status, "source_changed");
  assert.equal(restored.reason, "source_revision_changed");
  assert.equal(restored.resumable, false);
});

test("failed durable write rolls memory back to the prior operation", async () => {
  const storage = memoryStorage();
  const store = operationApi.createStore({ storage, hash });
  await store.begin(operationInput());
  storage.failOnce();
  await assert.rejects(
    store.complete({ previews: [{ document_path: "SYSTEM/CACHE/llmwiki/결과.md" }] }),
    /injected_write_failure/,
  );
  assert.equal((await store.load()).status, "running");
});

test("partial preview artifacts never enter the review list", async () => {
  const documentPath = "SYSTEM/CACHE/llmwiki/부분 결과.md";
  const receiptPath = "SYSTEM/CACHE/llmwiki/부분 결과.receipt.json";
  const document = { path: documentPath };
  const receipt = { path: receiptPath };
  const vault = (files, bytes) => ({
    getFiles: () => files,
    getAbstractFileByPath: (pathValue) => files.find((file) => file.path === pathValue) || null,
    cachedRead: async (file) => bytes.get(file.path),
  });

  assert.deepEqual(
    await workbench.loadPreviews(vault([document], new Map([[documentPath, "# 부분 결과"]]))),
    [],
  );
  assert.deepEqual(
    await workbench.loadPreviews(vault([receipt], new Map([[receiptPath, "{}"]]))),
    [],
  );
});
