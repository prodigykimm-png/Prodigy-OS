"use strict";

// P0: interrupt() must persist stage + timestamps so a failed run leaves a
// diagnosable record instead of a stale preflight snapshot. Failing-first.

const assert = require("node:assert/strict");
const path = require("node:path");
const { test } = require("node:test");

const ROOT = path.resolve(__dirname, "../../../../../..");
const storeApi = require(path.join(ROOT, "SYSTEM/Views/prodigy-wiki-operation-store.js"));
const hashApi = require(path.join(ROOT, "SYSTEM/Views/llmwiki-hash.js"));

function memoryStorage() {
  const files = new Map();
  return {
    async exists(name) { return files.has(name); },
    async read(name) { return files.get(name); },
    async writeAtomic(name, text) { files.set(name, text); },
    async quarantine(name) { files.set(`${name}.quarantine`, files.get(name)); },
  };
}

const IDENTITY = {
  source: { path: "INBOX/x.md", title: "X", content_hash: "a".repeat(64) },
  orchestrator_version: "v1",
};

test("interrupt persists stage and timestamps", async () => {
  const store = storeApi.createStore({ storage: memoryStorage(), hash: hashApi });
  await store.begin(IDENTITY);
  const before = store.getOperation();
  await store.interrupt({ reason: "invalid_page_plan_coverage", resumable: true, stage: "planning" });
  const after = store.getOperation();
  assert.equal(after.status, "interrupted");
  assert.equal(after.reason, "invalid_page_plan_coverage");
  assert.equal(after.stage, "planning");
  assert.ok(typeof after.updated_at === "string" && after.updated_at.length > 0);
  assert.ok(!before.updated_at || after.updated_at >= before.updated_at);
});

test("interrupt without stage keeps the prior stage", async () => {
  const store = storeApi.createStore({ storage: memoryStorage(), hash: hashApi });
  await store.begin(IDENTITY);
  await store.interrupt({ reason: "x", resumable: false, stage: "preflight" });
  await store.interrupt({ reason: "y", resumable: true });
  const op = store.getOperation();
  assert.equal(op.stage, "preflight");
  assert.equal(op.reason, "y");
});
