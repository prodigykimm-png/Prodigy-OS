"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "../../../../../..");
global.window = {};
require(path.join(ROOT, "SYSTEM/Views/display-registry.js"));
const registry = require(path.join(ROOT, "SYSTEM/Views/knowledge-explorer-registry.js"));
const core = require(path.join(ROOT, "SYSTEM/Views/knowledge-explorer-core.js"));
const dataSourceApi = require(path.join(ROOT, "SYSTEM/Views/knowledge-explorer-data-source.js"));

function page(sourcePath, type, mtime, extras = {}) {
  return {
    source_path: sourcePath,
    type,
    title: extras.title || sourcePath.split("/").pop().replace(/\.md$/i, ""),
    frontmatter: {
      type,
      title: extras.title || sourcePath.split("/").pop().replace(/\.md$/i, ""),
      knowledge_domain: extras.domain || "coding",
      knowledge_topics: extras.topics || ["ai"],
      connections: extras.connections || []
    },
    file: {
      path: sourcePath,
      mtime,
      outlinks: extras.outlinks || [],
      inlinks: extras.inlinks || []
    },
    outlinks: extras.outlinks || [],
    backlinks: extras.backlinks || []
  };
}

function createReader() {
  let reads = 0;
  let failure = null;
  const pending = [];
  const readBody = (asset) => {
    reads += 1;
    if (failure) return Promise.reject(failure);
    return new Promise((resolve) => pending.push(() => resolve(`body:${asset.path}:${asset.mtime}`)));
  };
  return {
    readBody,
    get reads() { return reads; },
    failNext(error) { failure = error; },
    clearFailure() { failure = null; },
    resolveNext() {
      const next = pending.shift();
      assert.ok(next, "expected a pending read");
      next();
    }
  };
}

function testMetadataIndexDoesNotReadBodiesAndFiltersCandidates() {
  // Given: many valid metadata pages plus a Candidate, capture, template, malformed record, and unrelated Object.
  const reader = createReader();
  const source = dataSourceApi.createKnowledgeExplorerDataSource({ registry, readBody: reader.readBody });
  const pages = [
    ...Array.from({ length: 40 }, (_, index) => page(`ZETA/Knowledge/${index}.md`, "knowledge", index + 1, { outlinks: [`[[ZETA/Knowledge/${(index + 1) % 40}.md]]`] })),
    page("ZETA/Legacy.md", "permanent_note", 42),
    page("PARA/References/Book.md", "literature_note", 43),
    page("SYSTEM/TEMPLATE/FORMAT/template_knowledge.md", "knowledge", 44),
    page("PARA/RESOURCES/Knowledge/Candidates/Candidate.md", "knowledge_candidate", 45),
    page("ZETA/FLEETING/Capture.md", "fleeting_note", 46),
    page("PARA/Projects/Project.md", "project", 47),
    {
      source_path: "ZETA/Coding/Direct-Metadata.md",
      type: "knowledge",
      title: "Direct Metadata",
      knowledge_domain: "coding",
      knowledge_topics: ["ai"],
      file: { path: "ZETA/Coding/Direct-Metadata.md", mtime: 48, outlinks: ["[[ZETA/Knowledge/0.md]]"] }
    },
    { source_path: "ZETA/Broken.md", type: "", frontmatter: null, file: { path: "ZETA/Broken.md", mtime: 48 } },
    null
  ];
  pages[0].content = "This body must not enter the metadata index.";
  const before = JSON.stringify(pages);

  // When: the metadata-only index is constructed.
  const index = source.index(pages);

  // Then: no body loader runs; accepted assets are deterministic and Candidate/template records cannot affect Knowledge counts.
  assert.equal(reader.reads, 0);
  assert.equal(index.assets.length, 43);
  assert.equal(index.assets.some((asset) => asset.path.includes("Candidate") || asset.path.includes("template_")), false);
  assert.equal(index.assets.some((asset) => asset.type === "knowledge_candidate" || asset.type === "fleeting_note" || asset.type === "project"), false);
  assert.deepEqual(index.assets.find((asset) => asset.path === "ZETA/Knowledge/0.md").file.outlinks, ["[[ZETA/Knowledge/1.md]]"]);
  assert.equal("content" in index.assets.find((asset) => asset.path === "ZETA/Knowledge/0.md"), false);
  assert.deepEqual(index.assets.find((asset) => asset.path === "ZETA/Coding/Direct-Metadata.md").frontmatter.knowledge_topics, ["ai"]);
  assert.equal(core.projectKnowledgeExplorer(index.assets, registry).totals.knowledge, 42);
  assert.equal(JSON.stringify(pages), before);
  assert.equal(Object.isFrozen(index), true);
  assert.equal(Object.isFrozen(index.assets), true);
  assert.equal(Object.isFrozen(index.assets[0]), true);
  assert.throws(() => { index.assets[0].title = "changed"; }, TypeError);
}

async function testHydrationCachesByExactSchemaPathAndMtime() {
  // Given: one indexed asset and a deferred body loader.
  const reader = createReader();
  const source = dataSourceApi.createKnowledgeExplorerDataSource({ registry, schemaVersion: 7, readBody: reader.readBody });
  const asset = source.index([page("ZETA/Coding/Cache.md", "knowledge", 10)]).assets[0];

  // When: the same selection is requested concurrently.
  const first = source.hydrate(asset);
  const second = source.hydrate(asset);

  // Then: both requests share exactly one body read and immutable success projection.
  assert.equal(reader.reads, 1);
  reader.resolveNext();
  const [firstResult, secondResult] = await Promise.all([first, second]);
  assert.deepEqual(firstResult, secondResult);
  assert.equal(firstResult.status, "ready");
  assert.equal(firstResult.cache_key, "7:ZETA/Coding/Cache.md:10");
  assert.equal(Object.isFrozen(firstResult), true);
  assert.throws(() => { firstResult.body = "changed"; }, TypeError);

  // And when: it is selected repeatedly with the same identity, then with a changed mtime and schema version.
  await source.hydrate(asset);
  assert.equal(reader.reads, 1);
  const changedMtime = { ...asset, mtime: 11, source_mtime: 11, file: { ...asset.file, mtime: 11 } };
  const changed = source.hydrate(changedMtime);
  assert.equal(reader.reads, 2);
  reader.resolveNext();
  assert.equal((await changed).cache_key, "7:ZETA/Coding/Cache.md:11");
  const newerSchema = dataSourceApi.createKnowledgeExplorerDataSource({ registry, schemaVersion: 8, readBody: reader.readBody });
  const schemaChanged = newerSchema.hydrate(changedMtime);
  assert.equal(reader.reads, 3);
  reader.resolveNext();
  assert.equal((await schemaChanged).cache_key, "8:ZETA/Coding/Cache.md:11");
}

async function testRejectedReadIsRecoverableAndRetryable() {
  // Given: an indexed asset whose first body read rejects.
  const reader = createReader();
  const source = dataSourceApi.createKnowledgeExplorerDataSource({ registry, readBody: reader.readBody });
  const asset = source.index([page("ZETA/Coding/Retry.md", "knowledge", 20)]).assets[0];
  reader.failNext(new Error("temporary vault failure"));

  // When: hydration handles the failure.
  const failed = await source.hydrate(asset);

  // Then: the caller gets a stable recoverable result, not a poisoned cache entry.
  assert.equal(failed.status, "error");
  assert.equal(failed.path, "ZETA/Coding/Retry.md");
  assert.equal(Object.isFrozen(failed), true);
  assert.equal(reader.reads, 1);

  // And when: the reader recovers and the same selection is retried.
  reader.clearFailure();
  const retried = source.hydrate(asset);
  assert.equal(reader.reads, 2);
  reader.resolveNext();

  // Then: retry performs a fresh read and returns the body.
  assert.equal((await retried).status, "ready");
}

async function testOneThousandAssetReadBudget() {
  // Given: one thousand valid metadata records and a reader whose requests remain observable.
  const reader = createReader();
  const source = dataSourceApi.createKnowledgeExplorerDataSource({ registry, schemaVersion: 19, readBody: reader.readBody });
  const assets = source.index(Array.from({ length: 1000 }, (_, index) => page(
    `ZETA/Coding/Scale-${String(index).padStart(4, "0")}.md`,
    "knowledge",
    index + 1,
    { outlinks: index ? [`[[ZETA/Coding/Scale-${String(index - 1).padStart(4, "0")}.md]]`] : [] }
  ))).assets;
  const selected = assets[500];

  // When: the Explorer builds its index without a user detail request.
  assert.equal(assets.length, 1000);
  assert.equal(reader.reads, 0, "metadata projection must make zero body reads");

  // Then when: one selected asset is requested twice while still in flight.
  const first = source.hydrate(selected);
  const concurrent = source.hydrate(selected);

  // Then: only the selected asset has a single shared reader request.
  assert.equal(reader.reads, 1);
  reader.resolveNext();
  const [firstResult, concurrentResult] = await Promise.all([first, concurrent]);
  assert.equal(firstResult.path, selected.path);
  assert.deepEqual(firstResult, concurrentResult);
  await source.hydrate(selected);
  assert.equal(reader.reads, 1, "a stable selected asset must reuse its in-memory result");

  // And when: the selected file mtime changes, then the source schema changes.
  const changedMtime = { ...selected, mtime: selected.mtime + 1, source_mtime: selected.source_mtime + 1, file: { ...selected.file, mtime: selected.file.mtime + 1 } };
  const mtimeResult = source.hydrate(changedMtime);
  assert.equal(reader.reads, 2);
  reader.resolveNext();
  assert.equal((await mtimeResult).mtime, changedMtime.mtime);
  const newerSchema = dataSourceApi.createKnowledgeExplorerDataSource({ registry, schemaVersion: 20, readBody: reader.readBody });
  const schemaResult = newerSchema.hydrate(changedMtime);
  assert.equal(reader.reads, 3);
  reader.resolveNext();
  assert.equal((await schemaResult).cache_key, `20:${selected.path}:${changedMtime.mtime}`);

  // And when: a selected hydration fails before a retry.
  const retrySource = dataSourceApi.createKnowledgeExplorerDataSource({ registry, readBody: reader.readBody });
  reader.failNext(new Error("temporary selected read"));
  const failed = await retrySource.hydrate(selected);
  assert.equal(failed.status, "error");
  assert.equal(reader.reads, 4);
  reader.clearFailure();
  const retried = retrySource.hydrate(selected);
  assert.equal(reader.reads, 5, "a failed selected request must not poison retry");
  reader.resolveNext();
  assert.equal((await retried).status, "ready");
}

async function main() {
  testMetadataIndexDoesNotReadBodiesAndFiltersCandidates();
  await testHydrationCachesByExactSchemaPathAndMtime();
  await testRejectedReadIsRecoverableAndRetryable();
  await testOneThousandAssetReadBudget();
  console.log("Knowledge Explorer data-source tests passed");
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
