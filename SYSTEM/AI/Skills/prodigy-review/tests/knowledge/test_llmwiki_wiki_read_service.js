"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "../../../../../..");
const registry = require(path.join(ROOT, "SYSTEM/Views/knowledge-explorer-registry.js"));
const adapter = require(path.join(ROOT, "SYSTEM/Views/llmwiki-wiki-read-adapter.js"));
const serviceApi = require(path.join(ROOT, "SYSTEM/Views/llmwiki-wiki-read-service.js"));

function input(revision = "collection-a") {
  return {
    registry,
    collection_revision: revision,
    assets: [{ path: "ZETA/PERMANENT/alpha.md", type: "knowledge", title: "Alpha", mtime: 10, updated: 10, frontmatter: { type: "knowledge", knowledge_domain: "coding", knowledge_topics: ["ai"] } }],
    candidates: [{ path: "PARA/RESOURCES/Knowledge/Candidates/pending.md", type: "knowledge_candidate", title: "Pending", statement: "Pending detail", suggested_domain: "coding", suggested_topics: ["ai"], status: "saved", mtime: 20, updated: 20 }],
  };
}

test("publishes only an agreeing two-pass snapshot and keeps trust rows separated", async () => {
  let calls = 0;
  const service = serviceApi.create({
    adapter,
    collectSnapshot: () => { calls += 1; return input(); },
    readBody: () => "unused",
  });
  const result = await service.publishSnapshot();
  assert.equal(result.ok, true);
  assert.equal(result.status, "published");
  assert.equal(result.published, true);
  assert.equal(calls, 2);
  assert.deepEqual(service.getSnapshot().counts, { verified: 1, legacy_verified: 0, literature: 0, pending: 1, total: 2 });
  assert.equal(service.getSnapshot().writer_count, 0);
  assert.equal(service.getSnapshot().provider_count, 0);
});

test("rejects mismatched publication metadata without exposing a current snapshot", async () => {
  let pass = 0;
  const service = serviceApi.create({
    adapter,
    collectSnapshot: () => input(pass++ === 0 ? "before" : "after"),
    readBody: () => { throw new Error("must not read"); },
  });
  const result = await service.publishSnapshot();
  assert.equal(result.status, "stale");
  assert.equal(result.published, false);
  assert.equal(service.getSnapshot(), null);
  assert.equal(result.writer_count, 0);
  assert.equal(result.provider_count, 0);
});

test("revalidates cached body reads and discards cached bytes after a revision change", async () => {
  let revision = "collection-a";
  let bodyReads = 0;
  const service = serviceApi.create({
    adapter,
    collectSnapshot: () => input(revision),
    readBody: ({ path: requestedPath }) => { bodyReads += 1; return `body:${requestedPath}`; },
  });
  const published = await service.publishSnapshot();
  const row = service.getSnapshot().rows.find((item) => item.path.endsWith("alpha.md"));
  const request = { path: row.path, snapshot_revision: published.snapshot_revision, row_revision: row.row_revision };

  const first = await service.hydrateBody(request);
  assert.equal(first.status, "ready");
  assert.equal(bodyReads, 1);
  assert.equal((await service.hydrateBody(request)).status, "ready");
  assert.equal(bodyReads, 1);

  revision = "collection-b";
  const stale = await service.hydrateBody(request);
  assert.equal(stale.status, "stale");
  assert.equal("body" in stale, false);
  assert.equal(bodyReads, 1);
});

test("fails closed for unsafe, unknown, and stale-row hydration requests", async () => {
  const service = serviceApi.create({ adapter, collectSnapshot: () => input(), readBody: () => "must not read" });
  const published = await service.publishSnapshot();
  const row = service.getSnapshot().rows[0];
  for (const request of [
    { path: "../secret.md", snapshot_revision: published.snapshot_revision, row_revision: row.row_revision },
    { path: "ZETA/PERMANENT/missing.md", snapshot_revision: published.snapshot_revision, row_revision: row.row_revision },
    { path: row.path, snapshot_revision: "b".repeat(64), row_revision: row.row_revision },
    { path: row.path, snapshot_revision: published.snapshot_revision, row_revision: "c".repeat(64) },
  ]) {
    const result = await service.hydrateBody(request);
    assert.equal(result.ok === false || result.status === "stale", true);
    assert.equal(result.writer_count, 0);
    assert.equal(result.provider_count, 0);
  }
});
