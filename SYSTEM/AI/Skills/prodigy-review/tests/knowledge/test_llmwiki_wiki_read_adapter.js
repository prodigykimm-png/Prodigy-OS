"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "../../../../../..");
const registry = require(path.join(ROOT, "SYSTEM/Views/knowledge-explorer-registry.js"));
const adapter = require(path.join(ROOT, "SYSTEM/Views/llmwiki-wiki-read-adapter.js"));
const serviceApi = require(path.join(ROOT, "SYSTEM/Views/llmwiki-wiki-read-service.js"));
const { createTrustedFixture } = require("./fixtures/llmwiki-canonical-v2-trust-fixture.js");

function asset(pathName, type, mtime, domain = "coding", topics = ["ai"], extra = {}) {
  return {
    source_path: pathName,
    path: pathName,
    type,
    title: extra.title || pathName.split("/").pop().replace(/\.md$/iu, ""),
    mtime,
    updated: extra.updated || mtime,
    frontmatter: { type, knowledge_domain: domain, knowledge_topics: topics, ...(extra.frontmatter || {}) },
    file: { path: pathName, mtime },
    ...extra,
  };
}

function input(revision = "collection-a") {
  return {
    registry,
    collection_revision: revision,
    assets: [
      asset("ZETA/PERMANENT/zulu.md", "knowledge", 10, "coding", ["ai"]),
      asset("ZETA/PERMANENT/alpha.md", "knowledge", 30, "coding", ["ai"]),
      asset("ZETA/PERMANENT/legacy.md", "permanent_note", 25, "coding", ["ai"]),
      asset("ZETA/LITERATURE/lit.md", "literature_note", 40, "reading", [], { title: "Literature" }),
    ],
    candidates: [{
      type: "knowledge_candidate",
      path: "PARA/RESOURCES/Knowledge/Candidates/pending.md",
      title: "Pending",
      statement: "Pending statement",
      suggested_domain: "coding",
      suggested_topics: ["ai"],
      status: "saved",
      updated: 20,
      mtime: 20,
    }],
  };
}

function snapshot(revision) {
  return adapter.buildSnapshot(input(revision));
}

test("buildSnapshot is path-stable, hashed, frozen, and trust-separated", () => {
  const first = snapshot("collection-a");
  const reordered = adapter.buildSnapshot({ ...input("collection-a"), assets: [...input().assets].reverse() });

  assert.equal(first.ok, true);
  assert.equal(first.snapshot_revision, reordered.snapshot_revision);
  assert.deepEqual(first.rows.map((row) => row.path), [
    "PARA/RESOURCES/Knowledge/Candidates/pending.md",
    "ZETA/LITERATURE/lit.md",
    "ZETA/PERMANENT/alpha.md",
    "ZETA/PERMANENT/legacy.md",
    "ZETA/PERMANENT/zulu.md",
  ]);
  assert.deepEqual(first.counts, { verified: 0, legacy_review: 1, literature: 1, pending: 1, maintenance: 2, total: 5 });
  assert.deepEqual(Object.fromEntries(Object.entries(first.tiers).map(([key, rows]) => [key, rows.length])), {
    verified: 0, legacy_review: 1, literature: 1, pending: 1, maintenance: 2,
  });
  assert.match(first.snapshot_revision, /^[0-9a-f]{64}$/u);
  assert.equal(first.writer_count, 0);
  assert.equal(first.provider_count, 0);
  assert.equal(Object.isFrozen(first), true);
  assert.equal(Object.isFrozen(first.rows), true);
  assert.equal(Object.isFrozen(first.rows[0]), true);
  assert.ok(first.allowed_prefixes.includes("ZETA/PERMANENT/"));
  assert.ok(first.allowed_prefixes.includes("PARA/RESOURCES/Knowledge/Candidates/"));
});

test("browseRead defaults to verified, explicitly intersects literature/pending facets, and resets", () => {
  const current = snapshot();
  const defaultBrowse = adapter.browseRead({ snapshot: current, registry });
  assert.equal(defaultBrowse.ok, true);
  assert.deepEqual(defaultBrowse.rows.map((row) => row.trust), []);
  const legacy = adapter.browseRead({ snapshot: current, registry, mode: "legacy_review" });
  assert.deepEqual(legacy.rows.map((row) => row.trust), ["legacy_review"]);

  const literature = adapter.browseRead({ snapshot: current, registry, mode: "literature" });
  assert.deepEqual(literature.rows.map((row) => row.path), ["ZETA/LITERATURE/lit.md"]);
  const pending = adapter.browseRead({ snapshot: current, registry, mode: "pending", domain: "coding", topic: "ai" });
  assert.deepEqual(pending.rows.map((row) => row.path), ["PARA/RESOURCES/Knowledge/Candidates/pending.md"]);
  assert.equal(pending.counts.verified, 0);
  const reset = adapter.browseRead({ snapshot: current, registry, mode: "literature", reset: true });
  assert.equal(reset.mode, "verified");
  assert.deepEqual(reset.rows.map((row) => row.trust), []);
});

test("browseRead delegates only non-empty queries and rejects unsafe selections", () => {
  const current = snapshot();
  let queryCalls = 0;
  const queryRead = (request) => {
    queryCalls += 1;
    assert.equal(request.query, "alpha");
    return { ok: true, value: { status: "ok", results: [{ path: "ZETA/PERMANENT/legacy.md" }] } };
  };
  const blank = adapter.browseRead({ snapshot: current, registry, query: "", queryRead, writer: () => { throw new Error("writer"); }, provider: () => { throw new Error("provider"); } });
  assert.equal(blank.ok, true);
  assert.equal(queryCalls, 0);
  const searched = adapter.browseRead({ snapshot: current, registry, mode: "legacy_review", query: "alpha", queryRead });
  assert.equal(searched.ok, true);
  assert.equal(queryCalls, 1);
  assert.deepEqual(searched.rows.map((row) => row.path), ["ZETA/PERMANENT/legacy.md"]);
  for (const bad of [
    { path: "../secret.md" },
    { path: "/absolute.md" },
    { path: "ZETA/OTHER/nope.md" },
    { path: "ZETA/PERMANENT/unknown.md" },
  ]) {
    const result = adapter.browseRead({ snapshot: current, registry, ...bad });
    assert.equal(result.ok, false);
    assert.equal(result.writer_count, 0);
    assert.equal(result.provider_count, 0);
  }
});

test("finalized immutable audit produces exactly one verified browse row", async () => {
  const genuine = await createTrustedFixture();
  const current = adapter.buildSnapshot({ collection_revision: genuine.revision, assets: [genuine.row] });
  assert.equal(current.counts.verified, 1);
  assert.deepEqual(adapter.browseRead({ snapshot: current }).rows.map((row) => row.path), [genuine.path]);
});

test("service publishes on an agreeing two-pass revision and hydrates with cache and stale discard", async () => {
  let revision = "collection-a";
  let collectionCalls = 0;
  let bodyReads = 0;
  let body = "body alpha";
  const collectSnapshot = () => {
    collectionCalls += 1;
    return input(revision);
  };
  const service = serviceApi.create({
    collectSnapshot,
    readBody: ({ path: requestedPath }) => {
      bodyReads += 1;
      return requestedPath.endsWith("alpha.md") ? body : "";
    },
  });
  const published = await service.publishSnapshot();
  assert.equal(published.published, true);
  assert.equal(collectionCalls, 2);
  const row = service.getSnapshot().rows.find((item) => item.path.endsWith("alpha.md"));
  const request = { path: row.path, snapshot_revision: published.snapshot_revision, row_revision: row.row_revision };
  const ready = await service.hydrateBody(request);
  assert.equal(ready.status, "ready");
  assert.equal(ready.body, body);
  assert.equal(bodyReads, 1);
  assert.equal((await service.hydrateBody(request)).status, "ready");
  assert.equal(bodyReads, 1);

  service.clearCache();
  revision = "collection-b";
  const stale = await service.hydrateBody(request);
  assert.equal(stale.status, "stale");
  assert.equal("body" in stale, false);
  assert.equal(bodyReads, 1);
  const bad = await service.hydrateBody({ ...request, path: "../secret.md" });
  assert.equal(bad.ok, false);
  assert.equal(bodyReads, 1);
  assert.equal(service.clearCache().ok, true);

  let raceRevision = "race-a";
  let raceCalls = 0;
  let raceReads = 0;
  const raceService = serviceApi.create({
    collectSnapshot: () => {
      raceCalls += 1;
      return input(raceRevision);
    },
    readBody: () => {
      raceReads += 1;
      raceRevision = "race-b";
      return "must be discarded";
    },
  });
  const racePublished = await raceService.publishSnapshot();
  const raceRow = raceService.getSnapshot().rows.find((item) => item.path.endsWith("alpha.md"));
  const raceResult = await raceService.hydrateBody({
    path: raceRow.path,
    snapshot_revision: racePublished.snapshot_revision,
    row_revision: raceRow.row_revision,
  });
  assert.equal(raceResult.status, "stale");
  assert.equal("body" in raceResult, false);
  assert.equal(raceReads, 1);
  assert.equal(raceCalls, 4);
});

test("service refuses to publish mismatched metadata passes and never invokes body/provider writers", async () => {
  let pass = 0;
  const service = serviceApi.create({
    collectSnapshot: () => ({ ...input(pass++ === 0 ? "one" : "two") }),
    readBody: () => { throw new Error("must not read"); },
  });
  const result = await service.publishSnapshot();
  assert.equal(result.status, "stale");
  assert.equal(result.published, false);
  assert.equal(service.getSnapshot(), null);
  assert.equal(result.writer_count, 0);
  assert.equal(result.provider_count, 0);
});
