"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs");
const os = require("node:os");
const { test } = require("node:test");

const ROOT = path.resolve(__dirname, "../../../../../..");
const storeApi = require(path.join(ROOT, "SYSTEM/Views/llmwiki-batch-job-store.js"));
const hash = require(path.join(ROOT, "SYSTEM/Views/llmwiki-hash.js"));

function memoryStorage() {
  const files = new Map();
  const ops = [];
  return {
    files, ops,
    async exists(name) { return files.has(name); },
    async read(name) { return files.get(name); },
    async writeAtomic(name, text) { ops.push(["write", name]); files.set(name, text); },
    async quarantine(name, text) { ops.push(["quarantine", name]); files.set(`${name}.quarantine`, text); files.delete(name); },
  };
}

function identity(overrides = {}) {
  return {
    provider_key: "openrouter", model: "test/model-1", structured_mode: "json_schema",
    schema_id: "llmwiki_compact_v1", prompt_version: "p1", candidate_context_hash: hash.sha256("ctx"),
    ...overrides,
  };
}

function sources(list) {
  return list.map(([source_id, body]) => ({ source_id, revision_hash: hash.sha256(body) }));
}

test("batchId remains deterministic under valid row reordering", () => {
  const key = storeApi.requestKey(identity());
  const rows = [
    { source_id: "src_c", revision_hash: "c".repeat(64) },
    { source_id: "src_a", revision_hash: "a".repeat(64) },
    { source_id: "src_b", revision_hash: "b".repeat(64) },
  ];
  const canonical = storeApi.batchId(rows, key);
  for (const perm of [[rows[2], rows[0], rows[1]], [[rows[1]][0], rows[2], rows[0]], [rows[0], rows[1], rows[2]]]) {
    assert.equal(storeApi.batchId(perm, key), canonical);
  }
  // Distinct row sets still diverge.
  assert.notEqual(canonical, storeApi.batchId([...rows.slice(0, 2), { source_id: "src_b", revision_hash: "d".repeat(64) }], key));
});

test("all six states round-trip exactly", async () => {
  const storage = memoryStorage();
  const store = storeApi.createBatchJobStore({ storage });
  await store.load();
  for (const state of storeApi.STATES) {
    const job = await store.createJob({
      request_key: storeApi.requestKey(identity()),
      sources: sources([["src_a", `body-${state}`]]),
    });
    await store.setJobState(job.job_id, state);
    assert.equal(store.getJob(job.job_id).status, state);
  }
});

test("batch/run/pack ids are deterministic hashes of revisions plus request key", () => {
  const key = storeApi.requestKey(identity());
  const a = storeApi.batchId(sources([["src_a", "one"], ["src_b", "two"]]), key);
  const b = storeApi.batchId(sources([["src_b", "two"], ["src_a", "one"]]), key);
  const c = storeApi.batchId(sources([["src_a", "changed"]]), key);
  const d = storeApi.batchId(sources([["src_a", "one"], ["src_b", "two"]]), storeApi.requestKey(identity({ model: "other" })));
  assert.equal(a, b);
  assert.notEqual(a, c);
  assert.notEqual(a, d);
  assert.match(a, /^[0-9a-f]{64}$/u);
  const packA = storeApi.packId("job_x", ["h1", "h2"]);
  const packB = storeApi.packId("job_x", ["h2", "h1"]);
  assert.equal(packA, packB);
  assert.notEqual(packA, storeApi.packId("job_y", ["h1", "h2"]));
});

const VALID_ROW = { source_id: "src_a", revision_hash: "a".repeat(64) };

function batchIdRow(overrides = {}) { return { ...VALID_ROW, ...overrides }; }

test("batchId strictly validates every source row and fails closed with named errors", () => {
  const key = storeApi.requestKey(identity());
  const badLists = [
    null,
    [],
    [null],
    ["not-an-object"],
    [{ source_id: "src_a" }],
    [{ revision_hash: "a".repeat(64) }],
    [batchIdRow({ source_id: "" })],
    [batchIdRow({ source_id: 42 })],
    [batchIdRow({ revision_hash: "abc123" })],
    [batchIdRow({ revision_hash: "A".repeat(64) })],
    [batchIdRow({ revision_hash: `${"a".repeat(63)}g` })],
    [VALID_ROW, batchIdRow()],
  ];
  for (const bad of badLists) {
    assert.throws(() => storeApi.batchId(bad, key), /invalid_batch_sources|duplicate_source_id/u,
      JSON.stringify(bad)?.slice(0, 60) || String(bad));
  }
  // __proto__ as a source id must be rejected outright.
  assert.throws(() => storeApi.batchId([batchIdRow({ source_id: "__proto__" })], key), /invalid_batch_sources/u);
  // Duplicate ids fail even when hashes differ or match; conflicting duplicates are the dangerous case.
  assert.throws(
    () => storeApi.batchId([VALID_ROW, { source_id: "src_a", revision_hash: "b".repeat(64) }], key),
    /duplicate_source_id/u,
  );
});

test("duplicate job/pack submissions are idempotent; conflicting hashes fail closed", async () => {
  const store = storeApi.createBatchJobStore({ storage: memoryStorage() });
  await store.load();
  const input = { request_key: storeApi.requestKey(identity()), sources: sources([["src_a", "alpha"]]) };
  const first = await store.createJob(input);
  const second = await store.createJob(input);
  assert.equal(first.job_id, second.job_id);

  const packHash = hash.sha256("pack-bytes");
  await store.recordPackReceipt({ job_id: first.job_id, pack_id: storeApi.packId(first.job_id, ["c1"]), pack_hash: packHash });
  await store.recordPackReceipt({ job_id: first.job_id, pack_id: storeApi.packId(first.job_id, ["c1"]), pack_hash: packHash });

  // Tampered persisted record carrying this batch id with foreign content fails closed.
  const tamperedStorage = memoryStorage();
  tamperedStorage.files.set(storeApi.STATE_FILE, JSON.stringify({
    schema_version: 1,
    jobs: { [first.job_id]: { job_id: first.job_id, batch_id: first.job_id, request_key: input.request_key, status: "pending", sources: { src_a: hash.sha256("tampered") } } },
    packs: {}, legacy: [],
  }));
  const tamperedStore = storeApi.createBatchJobStore({ storage: tamperedStorage });
  await tamperedStore.load();
  await assert.rejects(() => tamperedStore.createJob(input), /batch_conflict/u);
  await assert.rejects(() => store.recordPackReceipt({ job_id: first.job_id, pack_id: storeApi.packId(first.job_id, ["c1"]), pack_hash: hash.sha256("other") }), /pack_conflict/u);
  await assert.rejects(() => store.setJobState(first.job_id, "not_a_state"), /invalid_state/u);
});

test("corrupt state file is quarantined and never touches canonical paths", async () => {
  const storage = memoryStorage();
  storage.files.set(storeApi.STATE_FILE, "{definitely not json");
  const store = storeApi.createBatchJobStore({ storage });
  const loaded = await store.load();
  assert.equal(Object.keys(loaded.jobs).length, 0);
  const quarantineOp = storage.ops.find(([kind]) => kind === "quarantine");
  assert.ok(quarantineOp, "corrupt file must be quarantined");
  assert.equal(storage.files.has(storeApi.STATE_FILE), false);
});

test("legacy completed proposals import without replaying provider or approval effects", async () => {
  const storage = memoryStorage();
  const providerCalls = { count: 0 };
  const store = storeApi.createBatchJobStore({ storage, counters: { provider_calls: providerCalls } });
  await store.load();
  const imported = await store.importLegacyCompleted([
    { proposal_id: "prop_1", review_state: "approved", proposal_hash: hash.sha256("p1") },
    { proposal_id: "prop_2", review_state: "pending_review", proposal_hash: hash.sha256("p2") },
  ]);
  assert.equal(imported.imported, 2);
  const again = await store.importLegacyCompleted([{ proposal_id: "prop_1", review_state: "approved", proposal_hash: hash.sha256("p1") }]);
  assert.equal(again.imported, 0);
  assert.equal(providerCalls.count, 0);
  const reloaded = await storeApi.createBatchJobStore({ storage, counters: { provider_calls: providerCalls } }).load();
  assert.equal(reloaded.legacy.length, 2);
});

test("old-schema receipts are historical and never hit new-schema lookups", async () => {
  const storage = memoryStorage();
  const store = storeApi.createBatchJobStore({ storage });
  await store.load();
  await store.importLegacyCompleted([{ proposal_id: "old_1", review_state: "approved", proposal_hash: "aaa", legacy_schema: true }]);
  const nextStore = storeApi.createBatchJobStore({ storage });
  const next = await nextStore.load();
  const historical = Object.values(next.packs).filter((pack) => pack.historical === true);
  assert.ok(historical.length >= 1);
  const hit = await nextStore.lookupPackReceipt(historical[0].pack_id, historical[0].pack_hash, storeApi.requestKey(identity()));
  assert.equal(hit, false, "historical receipts must not satisfy any new-schema request key");
  assert.equal(await nextStore.lookupPackReceipt("missing", "missing", "missing"), false);
});

test("restart maps running-without-receipt jobs to outcome_unknown with zero provider calls and zero writes", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "llmwiki-job-store-"));
  try {
    const providerCalls = { count: 0 };
    const firstStorage = storeApi.createNodeStorage(dir);
    const first = storeApi.createBatchJobStore({ storage: firstStorage, counters: { provider_calls: providerCalls } });
    await first.load();
    const job = await first.createJob({
      request_key: storeApi.requestKey(identity()),
      sources: sources([["src_a", "running-body"]]),
    });
    await first.setJobState(job.job_id, "running");

    const reloadOps = [];
    const second = storeApi.createBatchJobStore({
      storage: countingNodeStorage(dir, reloadOps),
      counters: { provider_calls: providerCalls },
    });
    const loaded = await second.load();
    assert.equal(loaded.jobs[job.job_id].status, "outcome_unknown");
    assert.equal(providerCalls.count, 0);
    assert.equal(reloadOps.length, 0, "reload must make zero storage writes");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("failed persistence rolls memory back to the last durable state", async () => {
  const files = new Map();
  let failNext = false;
  const storage = {
    exists: async (name) => files.has(name), read: async (name) => files.get(name),
    quarantine: async (name) => { files.set(`${name}.quarantine`, ""); },
    async writeAtomic(name, text) { if (failNext) throw new Error("disk_full"); files.set(name, text); },
  };
  const store = storeApi.createBatchJobStore({ storage });
  await store.load();
  const job = await store.createJob({ request_key: storeApi.requestKey(identity()), sources: sources([["src_a", "durable"]]) });
  failNext = true;
  await assert.rejects(() => store.setJobState(job.job_id, "running"), /disk_full/u);
  assert.equal(store.getJob(job.job_id).status, "pending", "memory must match disk after failed write");
});

function countingNodeStorage(dir, ops) {
  const base = storeApi.createNodeStorage(dir);
  return {
    exists: base.exists,
    read: base.read,
    quarantine: base.quarantine,
    async writeAtomic(name, text) { ops.push(["write", name]); return base.writeAtomic(name, text); },
  };
}

test("node storage persists atomically under gitignored SYSTEM/CACHE/llmwiki and survives reopen", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "llmwiki-job-store-node-"));
  try {
    const first = storeApi.createBatchJobStore({ storage: storeApi.createNodeStorage(dir) });
    await first.load();
    const job = await first.createJob({
      request_key: storeApi.requestKey(identity()),
      sources: sources([["src_a", "persist-me"]]),
    });
    await first.setJobState(job.job_id, "review_ready");

    const second = await storeApi.createBatchJobStore({ storage: storeApi.createNodeStorage(dir) }).load();
    assert.equal(second.jobs[job.job_id].status, "review_ready");
    assert.deepEqual(Object.keys(second.jobs[job.job_id].sources).sort(), ["src_a"]);
    assert.match(second.jobs[job.job_id].sources.src_a, /^[0-9a-f]{64}$/u);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("page-plan snapshot survives restart without provider replay", async () => {
  const storage = memoryStorage();
  const providerCalls = { count: 0 };
  const first = storeApi.createBatchJobStore({ storage, counters: { provider_calls: providerCalls } });
  await first.load();
  const job = await first.createJob({
    request_key: storeApi.requestKey(identity()),
    sources: sources([["src_investment", "investment-source"]]),
  });
  const sourceRevision = hash.sha256("investment-source");
  const snapshot = {
    job_id: job.job_id,
    source_id: "src_investment",
    source_revision: sourceRevision,
    inventory_hash: hash.sha256("inventory"),
    plan_hash: hash.sha256("plan"),
    plan_revision: 1,
    status: "pending_review",
    plan: {
      plan_version: "llmwiki_page_plan_v1",
      source: { source_id: "src_investment", source_path: "INBOX/투자일기.md", content_hash: sourceRevision },
      pages: [],
    },
  };
  const saved = await first.savePlanSnapshot(snapshot);
  assert.equal(saved.plan_hash, snapshot.plan_hash);

  const second = storeApi.createBatchJobStore({ storage, counters: { provider_calls: providerCalls } });
  await second.load();
  assert.deepEqual(second.getPlanSnapshot(job.job_id), snapshot);
  assert.equal(providerCalls.count, 0);
});

test("page-plan snapshot rejects stale source binding and non-monotonic revision", async () => {
  const store = storeApi.createBatchJobStore({ storage: memoryStorage() });
  await store.load();
  const job = await store.createJob({
    request_key: storeApi.requestKey(identity()),
    sources: sources([["src_investment", "investment-source"]]),
  });
  const base = {
    job_id: job.job_id,
    source_id: "src_investment",
    source_revision: hash.sha256("investment-source"),
    inventory_hash: hash.sha256("inventory"),
    plan_hash: hash.sha256("plan-1"),
    plan_revision: 1,
    status: "pending_review",
    plan: { plan_version: "llmwiki_page_plan_v1", pages: [] },
  };
  await store.savePlanSnapshot(base);
  await assert.rejects(() => store.savePlanSnapshot({ ...base, source_revision: hash.sha256("stale") }), /plan_source_revision_mismatch/u);
  await assert.rejects(() => store.savePlanSnapshot({ ...base, plan_hash: hash.sha256("same-revision") }), /plan_revision_not_monotonic/u);
});
