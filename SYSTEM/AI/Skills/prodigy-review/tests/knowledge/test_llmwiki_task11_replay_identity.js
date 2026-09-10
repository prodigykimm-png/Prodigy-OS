"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");
const { test } = require("node:test");
const ROOT = path.resolve(__dirname, "../../../../../..");
const load = name => require(path.join(ROOT, `SYSTEM/Views/llmwiki-${name}.js`));
const hash = load("hash");
const jobs = load("batch-job-store");
const coverageApi = load("chunk-coverage-store");
const cacheApi = load("analysis-cache");
const scopeApi = load("analysis-scope");
const manifestApi = load("chunk-manifest");
const analyzerApi = load("batch-analyzer");
const fields = ["provider_key", "model", "structured_mode", "schema_id", "prompt_version", "candidate_context_hash"];
const identity = { provider_key: "provider", model: "model", structured_mode: "schema", schema_id: "schema-id", prompt_version: "prompt-v1", candidate_context_hash: hash.sha256("wiki context") };

function memory() {
  const files = new Map();
  const writes = [];
  const storage = {
    exists: async name => files.has(name), read: async name => files.get(name),
    writeAtomic: async (name, text) => { writes.push(name); files.set(name, text); },
    quarantine: async name => { throw new Error(`unexpected quarantine: ${name}`); },
  };
  const vault = {
    getAbstractFileByPath: name => files.has(name) ? { path: name } : null,
    cachedRead: async file => files.get(file.path),
    createFolder: async () => {},
    create: async (name, text) => { writes.push(name); files.set(name, text); },
    modify: async (file, text) => { writes.push(file.path); files.set(file.path, text); },
  };
  return { files, writes, storage, vault };
}
function source(text) { return { source_id: "source_task11", source_path: "INBOX/task11.md", extracted_text: text }; }
function scoped(text) {
  return scopeApi.createAnalysisScope({ ...source(text), source_text: text, content_hash: hash.sha256(text) });
}
function harness() {
  const m = memory();
  const requests = [];
  const fresh = () => analyzerApi.createBatchAnalyzer({
    jobStore: jobs.createBatchJobStore({ storage: m.storage }), vault: m.vault, identity,
    // Offline fixture only; no transport or network is constructed.
    provider: async request => {
      requests.push(request);
      return { ok: true, provider_call_count: 0, artifacts: request.chunks.map(chunk => ({ chunk_key: chunk.key, outcome: "proposals", items: [{ claim: chunk.text }] })) };
    },
  });
  return { ...m, requests, fresh };
}

test("task-6 proven delimiter-boundary collision is eliminated without rekeying safe tuples", () => {
  const a = { ...identity, model: "model|json", structured_mode: "schema" };
  const b = { ...identity, model: "model", structured_mode: "json|schema" };
  const keyA = jobs.requestKey(a), keyB = jobs.requestKey(b);
  console.log(JSON.stringify({ probe: "task-6", keyA, keyB, collision: keyA === keyB, provider_calls: 0 }));
  assert.notEqual(keyA, keyB);
  assert.equal(jobs.requestKey(identity), hash.sha256(fields.map(field => identity[field]).join("|")));
  // Every neighboring boundary has the same proven delimiter-serialization shape.
  for (let index = 0; index < fields.length - 1; index += 1) {
    const left = { ...identity, [fields[index]]: `${identity[fields[index]]}|x` };
    const right = { ...identity, [fields[index + 1]]: `x|${identity[fields[index + 1]]}` };
    assert.notEqual(jobs.requestKey(left), jobs.requestKey(right));
  }
  const variants = ["x|y", "x\\u007cy", " x|y", "x|y ", "e\u0301|y", "\u00e9|y", "x|y\n", 'x|"y', "x|\\y"];
  assert.equal(new Set(variants.map(model => jobs.requestKey({ ...identity, model }))).size, variants.length);
  for (const field of fields) assert.notEqual(jobs.requestKey(identity), jobs.requestKey({ ...identity, [field]: `${identity[field]} ` }));
  assert.equal(jobs.requestKey(identity), jobs.requestKey({ ...identity, run_id: "new-run", timestamp: 1, mtime: 2 }));
});

test("exact analyzer replay after restart has zero checkpoint writes and zero new artifacts", async () => {
  const h = harness();
  const sources = [source("# Alpha\nfirst.\n\n# Beta\nsecond.\n")];
  const first = await h.fresh().analyze({ sources });
  assert.equal(first.ok, true, first.reason);
  assert.equal(h.requests.length, 1);
  const before = new Map(h.files), writeCount = h.writes.length;
  const second = await h.fresh().analyze({ sources: sources.map(row => ({ ...row, mtime: 987, timestamp: 654 })), run_id: "another-run" });
  assert.equal(second.ok, true, second.reason);
  const cost = { provider_calls: second.metrics.provider_calls, mock_provider_calls: h.requests.length - 1,
    new_proposals: second.preserved_pack_receipts.length, checkpoint_writes: h.writes.length - writeCount,
    canonical_writes: h.writes.slice(writeCount).filter(name => name.startsWith("ZETA/")).length };
  console.log(JSON.stringify({ probe: "replay-cost", ...cost }));
  assert.deepEqual(cost, { provider_calls: 0, mock_provider_calls: 0, new_proposals: 0, checkpoint_writes: 0, canonical_writes: 0 });
  assert.equal(second.replay_only, true);
  assert.deepEqual(h.files, before);
});

test("changed material processes only exact uncovered chunks, then replay adds no second write", async () => {
  const h = harness();
  const original = "# Alpha\nfirst.\n\n# Beta\nsecond.\n";
  const changed = "# Alpha\nfirst changed.\n\n# Beta\nsecond.\n";
  assert.equal((await h.fresh().analyze({ sources: [source(original)] })).ok, true);
  const oldManifest = manifestApi.createChunkManifest(scoped(original));
  const nextManifest = manifestApi.createChunkManifest(scoped(changed));
  const missing = nextManifest.chunks.filter(chunk => !oldManifest.chunks.some(old => old.instance_id === chunk.instance_id));
  const result = await h.fresh().analyze({ sources: [source(changed)] });
  assert.equal(result.ok, true, result.reason);
  assert.deepEqual(h.requests.slice(1).flatMap(request => request.chunks.map(chunk => chunk.key)), missing.map(chunk => chunk.instance_id));
  assert.equal(result.metrics.cache_hits, 1);
  assert.equal(result.metrics.cache_misses, 1);
  assert.equal(result.coverage_reports[0].complete, true);
  const before = h.writes.length;
  const replay = await h.fresh().analyze({ sources: [source(changed)] });
  console.log(JSON.stringify({ probe: "changed-material", uncovered_chunks: missing.length, processed_chunks: result.metrics.cache_misses, replay_checkpoint_writes: h.writes.length - before }));
  assert.equal(replay.ok, true, replay.reason);
  assert.equal(h.requests.length, 2);
  assert.equal(h.writes.length, before);
});

test("partial coverage receipts replay across repeated interruptions without a second write", async () => {
  const m = memory();
  const scope = scoped("# Alpha\nfirst.\n\n# Beta\nsecond.\n");
  const manifest = manifestApi.createChunkManifest(scope);
  assert.equal(manifest.chunks.length, 2);
  for (let index = 0; index < manifest.chunks.length; index += 1) {
    const input = { manifest, scope, chunk: manifest.chunks[index], artifact: { result: index } };
    await coverageApi.createChunkCoverageStore({ vault: m.vault }).recordReceipt(input);
    const before = m.writes.length;
    for (let interruption = 0; interruption < 3; interruption += 1) {
      const restarted = coverageApi.createChunkCoverageStore({ vault: m.vault });
      await restarted.recordReceipt(input);
      assert.equal((await restarted.status(manifest, scope)).complete, index === manifest.chunks.length - 1);
    }
    console.log(JSON.stringify({ probe: "partial-replay", covered_chunks: index + 1, replay_checkpoint_writes: m.writes.length - before }));
    assert.equal(m.writes.length, before);
  }
  // Concurrent same-store duplicates are serialized and cost one durable write.
  const changed = { manifest, scope, chunk: manifest.chunks[0], artifact: { result: "changed" } };
  const sameStore = coverageApi.createChunkCoverageStore({ vault: m.vault });
  const before = m.writes.length;
  await Promise.all([sameStore.recordReceipt(changed), sameStore.recordReceipt(changed)]);
  assert.equal(m.writes.length - before, 1);
});

test("job and plan replay retain durable review state, while stale plan mutation still rejects", async () => {
  const m = memory();
  const store = jobs.createBatchJobStore({ storage: m.storage });
  const input = { request_key: jobs.requestKey(identity), sources: [{ source_id: "source_task11", revision_hash: hash.sha256("source") }] };
  const job = await store.createJob(input);
  const snapshot = { job_id: job.job_id, source_id: "source_task11", source_revision: input.sources[0].revision_hash,
    inventory_hash: hash.sha256("inventory"), plan_hash: hash.sha256("plan"), plan_revision: 1, status: "pending_review", plan: { plan_version: "v1" }, canonical_reviews: { page: { status: "resolved", rationale: "retained" } } };
  const saved = await store.savePlanSnapshot(snapshot);
  await store.setJobState(job.job_id, "review_ready");
  const before = m.writes.length;
  await Promise.all([store.createJob(input), store.createJob(input)]);
  await store.savePlanSnapshot(saved);
  await store.setJobState(job.job_id, "review_ready");
  await assert.rejects(store.setPlanStatus(job.job_id, hash.sha256("stale"), "approved"), /stale_plan_snapshot/u);
  assert.deepEqual(store.getPlanSnapshot(job.job_id), saved);
  assert.equal(m.writes.length, before);
});

test("cache retains exact whitespace and Unicode differences despite shared semantic labels", async () => {
  const m = memory();
  const cache = cacheApi.createAnalysisCache({ vault: m.vault });
  const original = scoped("# Cafe\n\u00e9\n");
  const manifest = manifestApi.createChunkManifest(original);
  await cache.put({ chunk: manifest.chunks[0], artifact: { result: "original" }, request_key: jobs.requestKey(identity) });
  for (const text of ["# Cafe\ne\u0301\n", "# Cafe\n\u00e9\n "]) {
    const next = scoped(text);
    const result = await cache.lookup(manifestApi.createChunkManifest(next), next, { request_key: jobs.requestKey(identity) });
    assert.equal(result.hits.length, 0);
    assert.equal(result.misses.length, 1);
  }
});
