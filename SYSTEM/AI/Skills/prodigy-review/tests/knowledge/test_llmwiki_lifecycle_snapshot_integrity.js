"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const path = require("node:path");
const { test } = require("node:test");

const ROOT = path.resolve(__dirname, "../../../../../..");
const adapterApi = require(path.join(ROOT, "SYSTEM/Views/llmwiki-lifecycle-migration-obsidian-adapter.js"));
const sha = (value) => crypto.createHash("sha256").update(value, "utf8").digest("hex");

const DECLARED = Object.freeze([
  "ZETA/PERMANENT/existing-canonical.md",
  "ZETA/CANDIDATES/existing-candidate.md",
  "ZETA/LITERATURE/existing-literature.md",
  "PARA/PROJECTS/existing-para.md",
]);
const IMMUTABLE = ".llmwiki-audit/immutable/existing-authority.json";
const PRIOR_STATE = ".llmwiki-audit/lifecycle/prior-committed-state.json";

function disposableVault(nonce) {
  const initial = Object.fromEntries([...DECLARED, IMMUTABLE, PRIOR_STATE].map((filePath, index) => [filePath, `before-${index}\n`]));
  const files = new Map(); const folders = new Set(["HUB", "SYSTEM", ".llmwiki-audit", ".llmwiki-audit/immutable", ".llmwiki-audit/lifecycle"]);
  const record = (filePath, bytes) => ({ path: filePath, bytes, extension: filePath.endsWith(".md") ? "md" : "json" });
  for (const [filePath, bytes] of Object.entries(initial)) files.set(filePath, record(filePath, bytes));
  const app = { vault: {
    getAbstractFileByPath(filePath) { return files.get(filePath) || (folders.has(filePath) ? { path: filePath, children: [] } : null); },
    getFiles() { return [...files.values()]; },
    async read(file) { return files.get(file.path).bytes; },
    async createFolder(folder) { folders.add(folder); },
    async create(filePath, bytes) { const file = record(filePath, bytes); files.set(filePath, file); return file; },
    async modify(file, bytes) { files.get(file.path).bytes = bytes; },
    async delete(file) { files.delete(file.path); },
  } };
  const statePath = `.llmwiki-audit/lifecycle/${nonce}.json`;
  return {
    app, files, initial, statePath,
    bytes: (filePath) => files.get(filePath)?.bytes ?? null,
    digest() { return sha(Object.entries(initial).map(([filePath, bytes]) => `${filePath}:${sha(bytes)}`).sort().join("\n")); },
    currentDigest() { return sha(Object.keys(initial).map((filePath) => `${filePath}:${sha(files.get(filePath)?.bytes || "")}`).sort().join("\n")); },
  };
}

for (const [index, requestedPath] of [...DECLARED, IMMUTABLE, PRIOR_STATE, "reservation"].entries()) {
  test(`snapshot failure preserves every byte at manifest index ${index}`, async () => {
    const nonce = `nonce_snapshot_index_${String(index).padStart(2, "0")}`;
    const state = disposableVault(nonce);
    const adapter = adapterApi.createProductionAdapter(state.app);
    const reserved = await adapter.reserve(nonce, "a".repeat(64), "b".repeat(64));
    assert.equal(reserved.status, "reserved");
    const failurePath = requestedPath === "reservation" ? state.statePath : requestedPath;
    const originalRead = state.app.vault.read; let injected = false;
    state.app.vault.read = async (file) => {
      if (!injected && file.path === failurePath) { injected = true; throw new Error("injected_snapshot_read_failure"); }
      return originalRead(file);
    };

    const failed = await adapter.snapshot(DECLARED);

    assert.equal(failed.ok, false);
    assert.equal(failed.snapshot.complete, false);
    assert.equal(failed.snapshot.entries[failurePath].state, "unknown");
    assert.equal(await adapter.abort(reserved.reservation).then((value) => value.status), "aborted");
    assert.equal(state.currentDigest(), state.digest());
    assert.equal(state.bytes(state.statePath), null);

    const retry = await adapter.reserve(nonce, "a".repeat(64), "b".repeat(64));
    const complete = await adapter.snapshot(DECLARED);
    assert.equal(retry.status, "reserved");
    assert.equal(complete.ok, true);
    assert.equal(complete.snapshot.complete, true);
    assert.equal(Object.values(complete.snapshot.entries).some((entry) => entry.state === "unknown"), false);
    assert.equal((await adapter.abort(retry.reservation)).status, "aborted");
    assert.equal(state.currentDigest(), state.digest());
  });
}

test("restore rejects an incomplete manifest before enumerating or deleting", async () => {
  const nonce = "nonce_incomplete_manifest_01";
  const state = disposableVault(nonce);
  const adapter = adapterApi.createProductionAdapter(state.app);
  const reserved = await adapter.reserve(nonce, "a".repeat(64), "b".repeat(64));
  let getFilesCalls = 0;
  const getFiles = state.app.vault.getFiles;
  state.app.vault.getFiles = () => { getFilesCalls += 1; return getFiles(); };

  const restored = await adapter.restore({ snapshot_version: "llmwiki_lifecycle_snapshot_v2", complete: false, declared_paths: [], audit_namespace: { complete: false, present_paths: [] }, entries: {} }, reserved.reservation);

  assert.equal(restored.reason, "incomplete_snapshot");
  assert.equal(getFilesCalls, 0);
  assert.equal(state.currentDigest(), state.digest());
  assert.equal((await adapter.abort(reserved.reservation)).status, "aborted");
});
