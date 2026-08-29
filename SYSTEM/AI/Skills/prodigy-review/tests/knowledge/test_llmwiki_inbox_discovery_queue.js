"use strict";

/*
 * Task 7 focused suite: local-only INBOX discovery queue.
 *
 * Pins the plan contract (.omo/plans/llmwiki-batch-core-simplification.md,
 * Detailed TODO item 7):
 *   - deterministic root-INBOX classification: pending | unchanged | held
 *     (eligibility aggregated in counters), keyed by stable source revision
 *   - pending snapshots written durably through the Task 3 batch job store
 *   - zero provider calls and zero canonical/source/git writes on discovery,
 *     modify, restart, and remount
 *   - protected/private/People/sensitive/malformed/mixed-ambiguous bodies are
 *     never projected outbound
 *   - a dirty Git worktree never blocks local discovery
 *   - files arriving during a frozen run belong to the next batch
 *
 * Assertions read machine states, machine reasons, hashes, and exact
 * counters. No prose, no sleeps, no provider imports.
 */

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { after, test } = require("node:test");

const ROOT = path.resolve(__dirname, "../../../../../..");
const queueApi = require(path.join(ROOT, "SYSTEM/Views/llmwiki-inbox-discovery-queue.js"));
const registryApi = require(path.join(ROOT, "SYSTEM/Views/llmwiki-source-registry.js"));
const storeApi = require(path.join(ROOT, "SYSTEM/Views/llmwiki-batch-job-store.js"));
const scopeApi = require(path.join(ROOT, "SYSTEM/Views/llmwiki-analysis-scope.js"));

function sha(value) { return crypto.createHash("sha256").update(value).digest("hex"); }

const disposableCacheDirs = new Set();
function tempCacheDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "llmwiki-discovery-"));
  disposableCacheDirs.add(dir);
  return dir;
}
after(() => {
  for (const dir of disposableCacheDirs) fs.rmSync(dir, { recursive: true, force: true });
  disposableCacheDirs.clear();
});

function durableJobStore(dir) {
  return storeApi.createBatchJobStore({ storage: storeApi.createNodeStorage(dir) });
}

function registry() {
  return registryApi.createSourceRegistry({
    extractors: [{ extractor_id: "extractor_markdown", extractor_version: "1.0.0", media_kinds: ["text/markdown"] }],
  });
}

function entry(sourcePath, body, metadata = {}) {
  return { source_path: sourcePath, source_text: body, metadata };
}

const BODY_A = "# 노트 A\n\n로컬 발견 큐 픽스처 본문입니다.\n";
const BODY_B = "# 노트 B\n\n두 번째 엘리직블 픽스처입니다.\n";

function makeQueue(dir) {
  return queueApi.createInboxDiscoveryQueue({ registry: registry(), jobStore: durableJobStore(dir) });
}

test("RED_DISCOVERY_CLASSIFIES_PENDING_HELD_UNCHANGED_BY_STABLE_REVISION", async () => {
  const dir = tempCacheDir();
  const queue = makeQueue(dir);
  const first = await queue.discover([
    entry("INBOX/note-a.md", BODY_A),
    entry("INBOX/Private/secret.md", "token=sk-aaaaaaaaaaaaaaaaaaaa"),
    entry("INBOX/People/contact.md", "local person note"),
  ]);
  assert.equal(first.ok, true, JSON.stringify(first));
  const byPath = new Map(first.entries.map((row) => [row.source_path, row]));
  assert.equal(byPath.get("INBOX/note-a.md").classification, "pending");
  assert.equal(byPath.get("INBOX/note-a.md").reason, "pending_snapshot_recorded");
  assert.equal(byPath.get("INBOX/Private/secret.md").classification, "held");
  assert.equal(byPath.get("INBOX/Private/secret.md").reason, "protected_source");
  assert.equal(byPath.get("INBOX/People/contact.md").classification, "held");
  assert.equal(byPath.get("INBOX/People/contact.md").reason, "people_local_only");
  assert.deepEqual(
    { discovered_total: first.counters.discovered_total, eligible_total: first.counters.eligible_total, held_total: first.counters.held_total, pending_total: first.counters.pending_total },
    { discovered_total: 3, eligible_total: 1, held_total: 2, pending_total: 1 },
  );

  // Deterministic replay of the same revision reclassifies as unchanged.
  const second = await queue.discover([entry("INBOX/note-a.md", BODY_A)]);
  assert.equal(second.entries[0].classification, "unchanged");
  assert.equal(second.entries[0].reason, "revision_already_recorded");
  assert.equal(second.counters.pending_total, 0);
  assert.equal(second.counters.unchanged_total, 1);

  // A byte change is a new stable revision and becomes pending again.
  const third = await queue.discover([entry("INBOX/note-a.md", `${BODY_A}\n수정\n`)]);
  assert.equal(third.entries[0].classification, "pending");
});

test("RED_CONTROL_CHARS_NORMALIZE_SOURCE_PROJECTION_AND_SCOPE_FIDELITY", async () => {
  const dir = tempCacheDir();
  const queue = makeQueue(dir);
  const raw = "# title\u0000\u0001\u001b\u007f\u0085\nbody";
  const normalized = raw.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/gu, "");
  const result = await queue.discover([entry("INBOX/control.md", raw)]);
  assert.equal(result.ok, true);
  const source = queue.currentSources()[0];
  assert.equal(source.extracted_text, normalized);
  assert.equal(source.content_hash, sha(normalized));
  assert.deepEqual(Buffer.from(source.source_bytes), Buffer.from(normalized, "utf8"));
  assert.doesNotThrow(() => scopeApi.createAnalysisScope({
    source_id: source.source_id, source_path: source.source_path,
    content_hash: source.content_hash, source_text: source.extracted_text,
  }));
});

test("RED_CONTROL_ONLY_SOURCE_IS_HELD_WITH_ENTRY_BODY_REQUIRED", async () => {
  const dir = tempCacheDir();
  const queue = makeQueue(dir);
  const result = await queue.discover([entry("INBOX/control-only.md", "\u0000\u0001\u001b\u007f\u0085")]);
  assert.equal(result.entries[0].classification, "held");
  assert.equal(result.entries[0].reason, "entry_body_required");
});

test("RED_ROOT_INBOX_README_IS_IGNORED_AS_A_CONTROL_DOCUMENT", async () => {
  const dir = tempCacheDir();
  const queue = makeQueue(dir);
  const result = await queue.discover([
    entry("INBOX/README.md", "# INBOX\n\n이 파일은 시스템 사용 안내문입니다.\n"),
  ]);
  assert.equal(result.ok, true);
  assert.deepEqual(result.entries, [{
    source_path: "INBOX/README.md",
    classification: "ignored",
    reason: "control_document",
  }]);
  assert.equal(result.counters.eligible_total, 0);
  assert.equal(result.counters.held_total, 0);
  assert.equal(result.counters.pending_total, 0);
  assert.equal(queue.currentSources().length, 0);
});

test("RED_PENDING_SNAPSHOTS_DURABLE_ACROSS_RESTART_AND_REMOUNT_WITH_ZERO_PROVIDER_CALLS", async () => {
  const dir = tempCacheDir();
  const queue = makeQueue(dir);
  const first = await queue.discover([
    entry("INBOX/note-a.md", BODY_A),
    entry("INBOX/note-b.md", BODY_B),
  ]);
  assert.match(String(first.snapshot_job_id), /^[0-9a-f]{64}$/u);
  const store = durableJobStore(dir);
  await store.load();
  const job = store.getJob(first.snapshot_job_id);
  assert.ok(job, "pending snapshot job must be durable in the Task 3 store");
  assert.equal(job.status, "pending");

  // Fresh queue + fresh store instance over the same durable directory:
  // restart/remount sees the same revisions as unchanged and calls nobody.
  const restarted = makeQueue(dir);
  const remount = await restarted.discover([
    entry("INBOX/note-a.md", BODY_A),
    entry("INBOX/note-b.md", BODY_B),
  ]);
  assert.deepEqual(remount.entries.map((row) => row.classification), ["unchanged", "unchanged"]);
  assert.equal(remount.counters.provider_calls, 0);
  assert.equal(first.counters.provider_calls, 0);
});

test("RED_DISCOVERY_RECORDS_ZERO_PROVIDER_AND_WRITE_COUNTERS_AND_IGNORES_DIRTY_WORKTREE", async () => {
  const dir = tempCacheDir();
  const queue = makeQueue(dir);
  const results = [];
  // mount, create, modify equivalents: identical discovery surface.
  results.push(await queue.discover([entry("INBOX/note-a.md", BODY_A)]));
  results.push(await queue.discover([entry("INBOX/note-a.md", BODY_A), entry("INBOX/new.md", BODY_B)], { dirty_worktree: true }));
  results.push(await queue.discover([entry("INBOX/note-a.md", `${BODY_A}changed\n`)], { dirty_worktree: true }));
  for (const result of results) {
    assert.deepEqual(
      {
        provider_calls: result.counters.provider_calls,
        pack_count: result.counters.pack_count,
        canonical_writes: result.counters.canonical_writes,
        source_writes: result.counters.source_writes,
        audit_writes: result.counters.audit_writes,
        git_writes: result.counters.git_writes,
        fallback_attempts: result.counters.fallback_attempts,
        automatic_retries: result.counters.automatic_retries,
        automatic_repairs: result.counters.automatic_repairs,
      },
      { provider_calls: 0, pack_count: 0, canonical_writes: 0, source_writes: 0, audit_writes: 0, git_writes: 0, fallback_attempts: 0, automatic_retries: 0, automatic_repairs: 0 },
      JSON.stringify(result),
    );
    assert.equal(result.ok, true);
  }
});

test("RED_HELD_BODIES_NEVER_ENTER_THE_OUTBOUND_PROJECTION", async () => {
  const dir = tempCacheDir();
  const queue = makeQueue(dir);
  const secretBody = "password=hunter2supersecret and token=sk-bbbbbbbbbbbbbbbbbbbb";
  const peopleBody = "개인 연락처 노트 본문 유출 금지 마커 people-marker-body";
  const result = await queue.discover([
    entry("INBOX/Private/vault.md", secretBody),
    entry("INBOX/People/person.md", peopleBody),
    entry("INBOX/leaked.md", "-----BEGIN RSA PRIVATE KEY-----\nabc\n-----END RSA PRIVATE KEY-----"),
    entry("INBOX/ambiguous.md", BODY_A, { private: true, llmwiki_outbound: "allow" }),
    entry("../escape.md", BODY_A),
  ]);
  const projected = JSON.stringify(result);
  assert.equal(projected.includes("hunter2supersecret"), false, "held secret body leaked into projection");
  assert.equal(projected.includes("people-marker-body"), false, "held People body leaked into projection");
  assert.equal(projected.includes("PRIVATE KEY"), false, "sensitive body leaked into projection");
  const byPath = new Map(result.entries.map((row) => [row.source_path, row]));
  assert.equal(byPath.get("INBOX/Private/vault.md").reason, "protected_source");
  assert.equal(byPath.get("INBOX/People/person.md").reason, "people_local_only");
  assert.equal(byPath.get("INBOX/leaked.md").reason, "sensitive_content");
  assert.equal(byPath.get("INBOX/ambiguous.md").reason, "mixed_ambiguous_classification");
  assert.equal(byPath.get("../escape.md").reason, "malformed_inbox_path");
  for (const row of result.entries) {
    assert.equal(Object.hasOwn(row, "source_text"), false);
    assert.equal(Object.hasOwn(row, "body"), false);
  }
});

test("RED_FILES_ARRIVING_DURING_A_FROZEN_RUN_BELONG_TO_THE_NEXT_BATCH", async () => {
  const dir = tempCacheDir();
  const queue = makeQueue(dir);
  await queue.discover([entry("INBOX/note-a.md", BODY_A)]);
  const frozen = await queue.freezeBatch();
  assert.equal(frozen.frozen, true);
  assert.match(frozen.batch_token, /^[0-9a-f]{64}$/u);
  assert.deepEqual(frozen.rows, [{ source_id: frozen.rows[0].source_id, revision_hash: sha(BODY_A.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/gu, "") ) }]);

  // Existing revision stays in the frozen batch; a brand-new file does not.
  const during = await queue.discover([entry("INBOX/note-a.md", BODY_A), entry("INBOX/late.md", BODY_B)]);
  const byPath = new Map(during.entries.map((row) => [row.source_path, row]));
  assert.equal(byPath.get("INBOX/note-a.md").batch_membership, "frozen_batch");
  assert.equal(byPath.get("INBOX/late.md").batch_membership, "next_batch");
});
