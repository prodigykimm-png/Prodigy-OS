"use strict";

const assert = require("node:assert/strict");
const os = require("node:os");
const { core, fs, path, reading, source, storeApi } = require("./reading_memory_test_fixtures.js");

async function testIncrementalStore() {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "prodigy-reading-memory-"));
  try {
    const adapter = storeApi.createNodeAdapter(tempRoot);
    const store = storeApi.createReadingMemoryStore(adapter);
    const first = reading({ title: "First", topics: "systems" }, "# First\n## Key Takeaways\n- One", "PARA/PROJECTS/Reading/First.md");
    const second = reading({ title: "Second", topics: "systems" }, "# Second", "PARA/PROJECTS/Reading/Second.md");
    for (const item of [first, second]) {
      const sourceFile = path.join(tempRoot, item.source_path);
      fs.mkdirSync(path.dirname(sourceFile), { recursive: true });
      fs.writeFileSync(sourceFile, item.content, "utf8");
    }
    let result = await storeApi.buildReadingMemory({ sources: [first, second], store });
    assert.deepEqual(result.counts, { created: 2, updated: 0, skipped: 0, removed: 0, failed: 0, ignored: 0 });
    result = await storeApi.buildReadingMemory({ sources: [first, second], store });
    assert.equal(result.counts.skipped, 2);
    const modified = { ...first, content: `${first.content}\n## 적용\n- Try it\n`, source_mtime: 2 };
    fs.writeFileSync(path.join(tempRoot, modified.source_path), modified.content, "utf8");
    result = await storeApi.buildReadingMemory({ sources: [modified, second], store });
    assert.equal(result.counts.updated, 1);
    assert.equal(result.counts.skipped, 1);
    result = await storeApi.buildReadingMemory({ sources: [modified], store });
    assert.equal(result.counts.removed, 1);
    assert.equal(await adapter.exists(store.entryPath(core.stableSourceId(second.source_path))), false);
    await adapter.write(store.entryPath(core.stableSourceId(modified.source_path)), "{ malformed");
    result = await storeApi.buildReadingMemory({ sources: [modified], store });
    assert.equal(result.counts.updated, 1);
    const recursive = source("SYSTEM/AI/Memory/reading/entries/recursive.md", "# recursive");
    result = await storeApi.buildReadingMemory({ sources: [modified, recursive], store });
    assert.equal(result.counts.ignored, 1);
    assert.equal(result.counts.skipped, 1);
    const index = JSON.parse(await adapter.read(store.indexPath));
    assert.deepEqual(index.entries.map((item) => item.source_path), [modified.source_path]);
    assert.equal(fs.readFileSync(path.join(tempRoot, modified.source_path), "utf8"), modified.content);

    assert.throws(() => store.removeEntry("../../PARA/PROJECTS/Reading/Victim"), /entry ID is invalid/);
    await adapter.write(store.indexPath, JSON.stringify({
      schema_version: core.SCHEMA_VERSION,
      entries: [{
        id: "../../PARA/PROJECTS/Reading/Victim",
        source_path: "PARA/PROJECTS/Reading/Victim.md",
        source_hash: "tampered",
      }],
    }));
    result = await storeApi.buildReadingMemory({ sources: [modified], store });
    assert.equal(result.counts.failed, 1);
    assert.match(result.failures[0].message, /Malformed Reading Memory index entry/);
    assert.deepEqual(result.index.entries.map((item) => item.source_path), [modified.source_path]);
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
}

async function testObsidianAdapterPersistence() {
  const files = new Map();
  const folders = new Set();
  const operations = [];
  let failNextReplace = false;
  const adapter = {
    exists: async (target) => files.has(target) || folders.has(target),
    read: async (target) => files.get(target),
    write: async (target, content) => { operations.push(["write", target]); files.set(target, content); },
    mkdir: async (target) => { folders.add(target); },
    remove: async (target) => { files.delete(target); },
    rename: async (from, to) => {
      if (failNextReplace && from.endsWith(".tmp")) {
        failNextReplace = false;
        throw new Error("simulated rename failure");
      }
      operations.push(["rename", from, to]);
      files.set(to, files.get(from));
      files.delete(from);
    },
  };
  const wrapped = storeApi.createObsidianAdapter({ vault: { adapter } });
  const store = storeApi.createReadingMemoryStore(wrapped);
  const item = reading({ title: "Obsidian" }, "# Obsidian", "PARA/PROJECTS/Reading/Obsidian.md");
  const result = await storeApi.buildReadingMemory({ sources: [item], store });
  assert.equal(result.counts.created, 1);
  assert.ok(files.has(store.indexPath));
  assert.ok(files.has(store.entryPath(core.stableSourceId(item.source_path))));
  assert.ok(operations.some(([operation, target]) => operation === "write" && target.endsWith(".tmp")));
  assert.ok(operations.some(([operation, from]) => operation === "rename" && from.endsWith(".tmp")));
  files.set("atomic.json", "old");
  failNextReplace = true;
  await assert.rejects(() => wrapped.atomicWrite("atomic.json", "new"), /simulated rename failure/);
  assert.equal(files.get("atomic.json"), "old");
  assert.equal(files.has("atomic.json.tmp"), false);
  assert.equal(files.has("atomic.json.backup"), false);
}

async function testFrontmatterOnlyChangeRebuildsEntry() {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "prodigy-reading-frontmatter-"));
  try {
    const store = storeApi.createReadingMemoryStore(storeApi.createNodeAdapter(tempRoot));
    const base = reading({}, "# Same body", "PARA/PROJECTS/Reading/Metadata.md");
    const first = { ...base, frontmatter: { title: "First title" } };
    const changed = { ...base, frontmatter: { title: "Changed title" } };
    let result = await storeApi.buildReadingMemory({ sources: [first], store });
    assert.equal(result.counts.created, 1);
    result = await storeApi.buildReadingMemory({ sources: [changed], store });
    assert.equal(result.counts.updated, 1);
    const entry = await store.readEntry(core.stableSourceId(base.source_path));
    assert.equal(entry.title, "Changed title");
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
}

async function testStoreReadErrorsAreNotTreatedAsMissingData() {
  const denied = new Error("permission denied");
  denied.code = "EACCES";
  const adapter = {
    exists: async () => true,
    read: async () => { throw denied; },
    write: async () => { throw new Error("write must not run"); },
    mkdir: async () => {},
    remove: async () => {},
    rename: null,
  };
  const store = storeApi.createReadingMemoryStore(adapter);
  await assert.rejects(() => store.readIndex(), /permission denied/);
}

async function runStoreCases() {
  await testIncrementalStore();
  await testObsidianAdapterPersistence();
  await testFrontmatterOnlyChangeRebuildsEntry();
  await testStoreReadErrorsAreNotTreatedAsMissingData();
}

module.exports = { runStoreCases };
