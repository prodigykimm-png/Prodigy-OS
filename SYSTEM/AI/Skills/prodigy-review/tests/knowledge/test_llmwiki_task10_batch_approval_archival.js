"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");
const test = require("node:test");
const crypto = require("node:crypto");

const ROOT = path.resolve(__dirname, "../../../../../..");
const materializerApi = require(path.join(ROOT, "SYSTEM/Views/llmwiki-inbox-proposal-materializer.js"));
let batchApi;
let processedApi;

function sha256(value) { return crypto.createHash("sha256").update(String(value)).digest("hex"); }

function loadTargets() {
  batchApi = require(path.join(ROOT, "SYSTEM/Views/llmwiki-batch-approval-adapter.js"));
  processedApi = require(path.join(ROOT, "SYSTEM/Views/llmwiki-processed-source-service.js"));
}

// ---------------------------------------------------------------------------
// Deterministic fixtures built through the real Task 9 materializer.
// ---------------------------------------------------------------------------

function item(role, extra = {}) {
  return {
    role,
    evidence_quote: extra.evidence_quote || `deterministic local quote ${(aliasCounter += 1)}`,
    claims: extra.claims === undefined ? [{ text: `A reusable deterministic claim ${(aliasCounter += 1)}` }] : extra.claims,
    review_reasons: extra.review_reasons || [],
    related_candidate_ids: extra.related_candidate_ids || [],
    span: { start: 8, end: 8 + (extra.evidence_quote || "deterministic local quote").length, alias: `span_${aliasCounter += 1}` },
    ...(extra.raw || {}),
  };
}
let aliasCounter = 0;
function artifact(chunkKey, outcome, items) {
  return { chunk_key: chunkKey, outcome, items };
}
const SOURCE_BYTES = "# task10 source\n\nbody kept byte identical\n";

function candidateRow(candidateId, targetPath, before) {
  return { candidate_id: candidateId, content_hash: sha256(before), revision: sha256(before), path: targetPath, before_bytes: before };
}
function relatedRow(extra = {}) {
  return candidateRow("cand_existing", extra.path || "ZETA/CANDIDATES/existing.md", extra.before || "# Existing\n\n- old claim\n");
}
function threeProposalArtifacts() {
  return [
    artifact("chunk_lit", "proposals", [item("source_summary", { claims: [{ text: "Source argues deterministic intake" }] })]),
    artifact("chunk_create", "proposals", [item("reusable_claim")]),
    artifact("chunk_update", "proposals", [item("reusable_claim", { related_candidate_ids: ["cand_existing"] })]),
  ];
}
function materialize(artifacts, options = {}) {
  const m = materializerApi.createInboxProposalMaterializer({
    allowedCandidateIds: options.allowedCandidateIds === undefined ? ["cand_existing"] : options.allowedCandidateIds,
    relatedCandidates: options.relatedCandidates === undefined ? [relatedRow()] : options.relatedCandidates,
    localObjectRoutes: [],
  });
  const result = m.materialize({
    source: {
      source_id: "source_task10_01",
      source_path: options.source_path || "INBOX/Knowledge/task10.md",
      content_hash: sha256(options.source_bytes || SOURCE_BYTES),
    },
    artifacts,
  });
  assert.equal(result.ok, true, result && result.reason);
  return result;
}
function sourceFor(source_path = "INBOX/Knowledge/task10.md") {
  return { source_id: "source_task10_01", source_path, content_hash: sha256(SOURCE_BYTES) };
}
function groupOf(artifacts, options = {}) {
  return batchApi.groupProposalsBySource({ source: sourceFor(options.source_path), materializeResult: materialize(artifacts, options) }).value;
}
function matrixOf(group, options = {}) {
  const matrix = batchApi.preselectionMatrix(group, { allowedCandidateIds: options.allowedCandidateIds || ["cand_existing"], relatedCandidates: options.relatedCandidates || [relatedRow()] });
  assert.equal(matrix.ok, true, matrix && matrix.reason);
  return matrix.value;
}

// ---------------------------------------------------------------------------
// In-memory exact-write vault with fault injection for both modules.
// ---------------------------------------------------------------------------

function memoryVault(initialFiles = {}, faults = {}) {
  const files = new Map(Object.entries(initialFiles));
  const touched = [];
  let writes = 0;       // canonical writes only; audit-prefix writes excluded
  let totalWrites = 0;  // every physical writeExact, used for fault placement
  let deletes = 0;
  let corruptNextReadback = faults.corruptNextReadback === true;
  const failWriteAt = faults.failWriteAt || 0;
  return {
    counts: {
      get writes() { return writes; },
      get deletes() { return deletes; },
      reads: 0,
    },
    touched,
    files,
    readBytes(p) {
      this.counts.reads += 1;
      if (!files.has(p)) return null;
      if (corruptNextReadback && p.startsWith("INBOX/Processed/")) {
        corruptNextReadback = false;
        return `${files.get(p)}corrupted`;
      }
      return files.get(p);
    },
    writeExact(p, bytes) {
      totalWrites += 1;
      if (failWriteAt && totalWrites >= failWriteAt) throw new Error("injected_write_fault");
      touched.push(p);
      if (!p.startsWith(AUDIT_PREFIX)) writes += 1;
      files.set(p, bytes);
      return { ok: true };
    },
    deleteExact(p) {
      if (!files.has(p)) return { ok: false, reason: "missing" };
      deletes += 1;
      touched.push(p);
      files.delete(p);
      return { ok: true };
    },
    exists(p) { return files.has(p); },
  };
}

const AUDIT_PREFIX = ".llmwiki-audit/";

// ---------------------------------------------------------------------------
// Grouping / selection / degraded-intent boundary (Task 10 core matrix)
// ---------------------------------------------------------------------------

test("grouping: Task9 proposals group by source with holds and drafts carried", () => {
  loadTargets();
  const result = materialize(threeProposalArtifacts());
  const holds = [...result.holds, { hold_id: "hold_x", reason: "weak_provenance_hold", unit_id: "u", selected: false }];
  const group = batchApi.groupProposalsBySource({
    source: sourceFor(),
    materializeResult: { ...result, holds },
  });
  assert.equal(group.ok, true, group && group.reason);
  assert.equal(group.value.source_id, "source_task10_01");
  assert.equal(group.value.proposals.length, 3);
  assert.equal(group.value.holds.length, 1);
});

test("selection matrix: only safe creates preselected; updates/merges/conflicts unselected", () => {
  loadTargets();
  const matrix = matrixOf(groupOf(threeProposalArtifacts()));
  const selected = matrix.operations.filter((op) => op.selected === true);
  const unselected = matrix.operations.filter((op) => op.selected !== true);
  assert.equal(selected.length, 2);
  for (const op of selected) {
    assert.equal(op.operation.kind, "create");
    assert.equal(op.operation.risk_tier, "low");
    assert.equal(op.reason, "safe_create_preselected");
  }
  assert.equal(unselected.length, 1);
  assert.equal(unselected[0].operation.kind, "update");
  assert.equal(unselected[0].reason, "risky_operation_requires_explicit_review");
});

test("merge and conflict classes are never preselected; total resolution failure fails closed", () => {
  loadTargets();
  const group = batchApi.groupProposalsBySource({
    source: sourceFor("INBOX/two.md"),
    materializeResult: materialize(
      [
        artifact("chunk_merge", "proposals", [item("reusable_claim", { related_candidate_ids: ["cand_a", "cand_b"] })]),
        artifact("chunk_conflict", "proposals", [item("reusable_claim", { related_candidate_ids: ["cand_a"], review_reasons: ["contradicts existing row"] })]),
      ],
      { allowedCandidateIds: ["cand_a", "cand_b"], relatedCandidates: [
        candidateRow("cand_a", "ZETA/CANDIDATES/a.md", "# A\n"),
        candidateRow("cand_b", "ZETA/CANDIDATES/b.md", "# B\n"),
      ] },
    ),
  }).value;
  const matrix = batchApi.preselectionMatrix(group, { allowedCandidateIds: ["cand_a", "cand_b"], relatedCandidates: [] });
  assert.equal(matrix.ok, false, "missing rows for allowlisted ids must fail closed");
});

test("allowlisted candidate id without a local row cannot become a preselected create", () => {
  loadTargets();
  const result = materialize(
    [artifact("chunk_degraded", "proposals", [item("reusable_claim", { related_candidate_ids: ["cand_gone"] })])],
    { allowedCandidateIds: ["cand_existing", "cand_gone"], relatedCandidates: [relatedRow()] },
  );
  const degraded = result.proposals.find((p) => p.class === "create" && p.unit_id.startsWith("document_"));
  assert.ok(degraded, "fixture must produce the degraded create shape");
  const group = batchApi.groupProposalsBySource({ source: sourceFor(), materializeResult: result }).value;
  const matrix = batchApi.preselectionMatrix(group, {
    allowedCandidateIds: ["cand_existing", "cand_gone"],
    relatedCandidates: [relatedRow()],
  });
  assert.equal(matrix.ok, true, matrix && matrix.reason);
  const degradedEntry = matrix.value.operations.find((op) => op.unit_id === degraded.unit_id);
  assert.equal(degradedEntry.selected, false, "degraded create must not be preselected");
  assert.equal(degradedEntry.reason, "unresolved_related_candidate_hold");
  assert.deepEqual(matrix.value.unresolved_related_candidate_ids.sort(), ["cand_gone"]);
});

// ---------------------------------------------------------------------------
// B1: authorization delegated to the retained branded authorities
// ---------------------------------------------------------------------------

test("authorizeBatch rejects automatic actions and empty selections (no auto approval)", () => {
  loadTargets();
  const matrix = matrixOf(groupOf(threeProposalArtifacts()));
  const bad = batchApi.authorizeBatch(matrix, { selected_operation_ids: [], user_action: "automatic" });
  assert.equal(bad.ok, false);
  assert.equal(bad.reason, "explicit_user_approval_required");
  const none = batchApi.authorizeBatch(matrix, { selected_operation_ids: [], user_action: "explicit_user_approval" });
  assert.equal(none.ok, false);
  assert.equal(none.reason, "selection_required");
});

test("ORIGINAL-authorized: approve two of three -> two canonical writes once through retained chain with real audit writes", async () => {
  loadTargets();
  const group = groupOf(threeProposalArtifacts());
  const matrix = matrixOf(group);
  const vault = memoryVault({
    "ZETA/CANDIDATES/existing.md": "# Existing\n\n- old claim\n",
    "INBOX/Knowledge/task10.md": SOURCE_BYTES,
  });

  const approved = batchApi.authorizeBatch(matrix, {
    selected_operation_ids: matrix.operations.filter((op) => op.selected).map((op) => op.operation_id),
    user_action: "explicit_user_approval",
    run_id: "run_task10_batch",
  });
  assert.equal(approved.ok, true, approved && approved.reason);
  // Authorization is branded by the retained safe-batch authority.
  assert.equal(approved.value.batch_authorization.authorization_hash.length, 64);

  const applied = await batchApi.applyBatch({ group, selection: approved.value, vault, now: "2026-08-26T12:00:00Z" });
  assert.equal(applied.ok, true, applied && applied.reason);
  const committed = applied.value.results.filter((r) => r.status === "committed");
  assert.equal(committed.length, 2);
  assert.equal(vault.counts.writes, 2, "exactly two canonical writes");

  // Real audit receipts exist per committed operation plus one batch record.
  assert.ok(applied.value.write_counts.audit >= 3, `audit writes ${applied.value.write_counts.audit}`);
  for (const row of committed) {
    const auditBytes = vault.files.get(`${AUDIT_PREFIX}${row.operation_id}.json`);
    assert.ok(auditBytes, `missing audit receipt for ${row.operation_id}`);
    const auditRecord = JSON.parse(auditBytes);
    assert.equal(auditRecord.result, "committed");
    assert.equal(auditRecord.batch_identity, approved.value.batch_authorization.batch_identity);
  }
  assert.ok(vault.files.get(`${AUDIT_PREFIX}${approved.value.batch_authorization.batch_identity}.json`).includes("committed"));

  // Third operation untouched and still reviewable.
  assert.equal(vault.files.get("ZETA/CANDIDATES/existing.md"), "# Existing\n\n- old claim\n");
  assert.equal(applied.value.results.some((r) => r.status === "stale"), false);

  // Source remains in INBOX until fully resolved.
  assert.equal(batchApi.archivalEligibility({ group, applyResult: applied.value }).eligible, false);
  assert.equal(vault.exists("INBOX/Knowledge/task10.md"), true);
  assert.equal(processedApi.processedTargetPath("INBOX/Knowledge/task10.md", { now: "2026-08-26T00:00:00Z" }),
    "INBOX/Processed/2026-08/task10.md");
});

test("explicitly selected risky update flows through retained risk commit, not the custom writer", async () => {
  loadTargets();
  const group = groupOf(threeProposalArtifacts());
  const matrix = matrixOf(group);
  const updateOp = matrix.operations.find((op) => !op.selected);
  const vault = memoryVault({ "ZETA/CANDIDATES/existing.md": "# Existing\n\n- old claim\n" });

  const approved = batchApi.authorizeBatch(matrix, {
    selected_operation_ids: matrix.operations.map((op) => op.operation_id),
    user_action: "explicit_user_approval",
    run_id: "run_task10_risky",
  });
  assert.equal(approved.ok, true, approved && approved.reason);
  assert.ok(approved.value.risk_authorizations[updateOp.operation_id], "risky operation carries retained risk authorization");

  const applied = await batchApi.applyBatch({ group, selection: approved.value, vault, now: "2026-08-26T12:00:00Z" });
  assert.equal(applied.ok, true, applied && applied.reason);
  assert.equal(applied.value.results.every((r) => r.status === "committed"), true);
  assert.equal(vault.files.get("ZETA/CANDIDATES/existing.md"),
    group.proposals.find((p) => p.class === "update").operation.after_bytes["ZETA/CANDIDATES/existing.md"]);
  assert.ok(applied.value.write_counts.audit >= 4);
});

// ---------------------------------------------------------------------------
// B2: full-operation binding; tampered group rejected before any write
// ---------------------------------------------------------------------------

test("TAMPERED-group: mutated after-bytes are rejected before zero writes", async () => {
  loadTargets();
  const group = groupOf(threeProposalArtifacts());
  const matrix = matrixOf(group);
  const approved = batchApi.authorizeBatch(matrix, {
    selected_operation_ids: matrix.operations.filter((op) => op.selected).map((op) => op.operation_id),
    user_action: "explicit_user_approval",
    run_id: "run_task10_tamper",
  });
  assert.equal(approved.ok, true);

  // Attacker mutates the group payload after authorization.
  const tamperedProposals = group.proposals.map((proposal) => proposal.operation.destination_ids[0].startsWith("ZETA/LITERATURE/")
    ? { ...proposal, operation: { ...proposal.operation, after_bytes: { [proposal.operation.destination_ids[0]]: "# injected bytes\n" } } }
    : proposal);
  const tamperedGroup = { ...group, proposals: tamperedProposals };

  const vault = memoryVault({});
  const applied = await batchApi.applyBatch({ group: tamperedGroup, selection: approved.value, vault, now: "2026-08-26T12:00:00Z" });
  assert.equal(applied.ok, false);
  assert.equal(applied.reason, "tampered_group_payload");
  assert.equal(vault.counts.writes, 0, "rejected before any write");
  assert.equal(vault.touched.length, 0);

  // ORIGINAL group still applies cleanly against the same authorization.
  const cleanVault = memoryVault({});
  const original = await batchApi.applyBatch({ group, selection: approved.value, vault: cleanVault, now: "2026-08-26T12:00:00Z" });
  assert.equal(original.ok, true, original && original.reason);
  assert.equal(original.value.results.every((r) => r.status === "committed"), true);
});

// ---------------------------------------------------------------------------
// Independent stale handling
// ---------------------------------------------------------------------------

test("one stale operation does not block unrelated approved operations and stays reviewable", async () => {
  loadTargets();
  const group = groupOf(threeProposalArtifacts());
  const matrix = matrixOf(group);
  const updateOp = matrix.operations.find((op) => !op.selected);
  const drifted = "# Drifted by another writer\n";
  const vault = memoryVault({ "ZETA/CANDIDATES/existing.md": drifted });

  const all = batchApi.authorizeBatch(matrix, {
    selected_operation_ids: matrix.operations.map((op) => op.operation_id),
    user_action: "explicit_user_approval",
    run_id: "run_task10_stale",
  });
  const applied = await batchApi.applyBatch({ group, selection: all.value, vault, now: "2026-08-26T12:00:00Z" });
  assert.equal(applied.ok, true, "batch still succeeds overall");
  const stale = applied.value.results.find((r) => r.operation_id === updateOp.operation_id);
  assert.equal(stale.status, "stale");
  assert.equal(stale.reviewable, true);
  assert.equal(applied.value.results.filter((r) => r.status === "committed").length, 2, "others unaffected");
  assert.equal(vault.counts.deletes, 0);
  assert.equal(vault.counts.writes, 2);
  // Stale destination was never written.
  assert.equal(vault.files.get("ZETA/CANDIDATES/existing.md"), drifted);
});

test("stale create collision fails independently leaving existing bytes intact", async () => {
  loadTargets();
  const group = batchApi.groupProposalsBySource({
    source: sourceFor("INBOX/three.md"),
    materializeResult: materialize([artifact("chunk_lit", "proposals", [item("source_summary")])], { source_path: "INBOX/three.md" }),
  }).value;
  const matrix = batchApi.preselectionMatrix(group, { allowedCandidateIds: [], relatedCandidates: [] }).value;
  const litPath = group.proposals[0].operation.destination_ids[0];
  const vault = memoryVault({ [litPath]: "already here" });
  const approval = batchApi.authorizeBatch(matrix, {
    selected_operation_ids: matrix.operations.map((op) => op.operation_id),
    user_action: "explicit_user_approval",
    run_id: "run_task10_collision",
  });
  const applied = await batchApi.applyBatch({ group, selection: approval.value, vault, now: "2026-08-26T12:00:00Z" });
  assert.equal(applied.value.results[0].status, "stale");
  assert.equal(vault.files.get(litPath), "already here");
});

// ---------------------------------------------------------------------------
// Archival eligibility gates
// ---------------------------------------------------------------------------

test("all-no-change, full-defer and partial unresolved sources never archive", async () => {
  loadTargets();
  const noopGroup = batchApi.groupProposalsBySource({
    source: sourceFor("INBOX/nochange.md"),
    materializeResult: materialize([artifact("chunk_nc", "no_change", [])], { source_path: "INBOX/nochange.md" }),
  }).value;
  assert.equal(noopGroup.proposals.length, 0);
  assert.equal(batchApi.archivalEligibility({ group: noopGroup, applyResult: null }).eligible, false);

  const deferGroup = groupOf(threeProposalArtifacts());
  assert.equal(batchApi.archivalEligibility({ group: deferGroup, applyResult: null }).eligible, false);

  const matrix = matrixOf(deferGroup);
  const vault = memoryVault({ "ZETA/CANDIDATES/existing.md": "# Drifted\n" });
  const approval = batchApi.authorizeBatch(matrix, {
    selected_operation_ids: matrix.operations.map((op) => op.operation_id),
    user_action: "explicit_user_approval",
    run_id: "run_task10_partial",
  });
  const applied = await batchApi.applyBatch({ group: deferGroup, selection: approval.value, vault, now: "2026-08-26T12:00:00Z" });
  assert.equal(applied.value.results.some((r) => r.status === "stale"), true);
  assert.equal(batchApi.archivalEligibility({ group: deferGroup, applyResult: applied.value }).eligible, false);
});

test("hold-bearing source stays in INBOX even when every proposal commits", () => {
  loadTargets();
  const result = materialize([
    artifact("chunk_lit", "proposals", [item("source_summary")]),
    artifact("chunk_hold", "hold", [item("reusable_claim", { claims: [] })]),
  ]);
  const group = batchApi.groupProposalsBySource({
    source: sourceFor("INBOX/six.md"),
    materializeResult: result,
  }).value;
  assert.ok(group.holds.length >= 1);
  const matrix = batchApi.preselectionMatrix(group, { allowedCandidateIds: [], relatedCandidates: [] }).value;
  const fakeApplied = { results: matrix.operations.map((op) => ({ operation_id: op.operation_id, status: "committed" })) };
  assert.equal(batchApi.archivalEligibility({ group, applyResult: fakeApplied }).eligible, false);
});

// ---------------------------------------------------------------------------
// Idempotency
// ---------------------------------------------------------------------------

test("duplicate replay is idempotent: zero additional canonical writes", async () => {
  loadTargets();
  const group = groupOf(threeProposalArtifacts());
  const matrix = matrixOf(group);
  const approval = batchApi.authorizeBatch(matrix, {
    selected_operation_ids: matrix.operations.filter((op) => op.selected).map((op) => op.operation_id),
    user_action: "explicit_user_approval",
    run_id: "run_task10_replay",
  });
  const vault = memoryVault({});
  await batchApi.applyBatch({ group, selection: approval.value, vault, now: "2026-08-26T12:00:00Z" });
  const writesAfterFirst = vault.counts.writes;
  assert.equal(writesAfterFirst, 2);
  const replay = await batchApi.applyBatch({ group, selection: approval.value, vault, now: "2026-08-26T12:00:00Z" });
  assert.equal(replay.ok, true);
  assert.equal(replay.value.results.every((r) => r.status === "duplicate"), true);
  assert.equal(vault.counts.writes, writesAfterFirst, "no double write");
});

// ---------------------------------------------------------------------------
// B3 fault cases
// ---------------------------------------------------------------------------

test("partial-write fault preserves batch audit failure observability", async () => {
  const safeBatchPath = path.join(ROOT, "SYSTEM/Views/llmwiki-safe-batch-approval.js");
  const adapterPath = path.join(ROOT, "SYSTEM/Views/llmwiki-batch-approval-adapter.js");
  const realSafeBatch = require(safeBatchPath);
  const previousSafeBatch = globalThis.LLMWikiSafeBatchApproval;
  globalThis.LLMWikiSafeBatchApproval = {
    ...realSafeBatch,
    commitExactBatch: async () => ({
      ok: false, status: "failed", reason: "batch_audit_failed",
      audit_reason: "audit_write_probe_failed", compensation_status: "restored",
      write_counts: { canonical: 0, audit: 2, refresh: 0, git: 0 },
    }),
  };
  delete require.cache[require.resolve(adapterPath)];
  loadTargets();
  const group = groupOf(threeProposalArtifacts());
  const matrix = matrixOf(group);
  const approval = batchApi.authorizeBatch(matrix, {
    selected_operation_ids: matrix.operations.filter((op) => op.selected).map((op) => op.operation_id),
    user_action: "explicit_user_approval",
    run_id: "run_task10_fault",
  });
  const applied = await batchApi.applyBatch({ group, selection: approval.value, vault: memoryVault(), now: "2026-08-26T12:00:00Z" });
  globalThis.LLMWikiSafeBatchApproval = previousSafeBatch;
  delete require.cache[require.resolve(adapterPath)];
  loadTargets();
  assert.equal(applied.ok, true, "failure surfaces inside an ok envelope");
  const failed = applied.value.results.find((r) => r.status === "failed");
  assert.ok(failed, JSON.stringify(applied.value.results));
  assert.equal(failed.audit_reason, "audit_write_probe_failed");
  assert.equal(failed.reason, "batch_audit_failed");
  assert.equal(failed.status, "failed");
  assert.equal(failed.compensation_status, "restored");
});

test("B3: processed post-write readback mismatch quarantines bad destination, source stays retryable", async () => {
  loadTargets();
  const vault = memoryVault({ "INBOX/Knowledge/task10.md": SOURCE_BYTES }, { corruptNextReadback: true });
  const archive = await processedApi.archiveProcessed({
    source_path: "INBOX/Knowledge/task10.md",
    expected_sha256: sha256(SOURCE_BYTES),
    vault,
    now: "2026-08-26T12:00:00Z",
  });
  assert.equal(archive.ok, false);
  assert.equal(archive.reason, "processed_write_verification_failed");
  assert.equal(archive.quarantined, true, "bad destination removed so nothing stray remains");
  assert.equal(vault.files.has("INBOX/Processed/2026-08/task10.md"), false, "no corrupted archive left behind");
  assert.equal(vault.files.get("INBOX/Knowledge/task10.md"), SOURCE_BYTES, "source preserved for retry");

  // Retry on honest readback completes the exact move.
  const archiveRetry = await processedApi.archiveProcessed({
    source_path: "INBOX/Knowledge/task10.md",
    expected_sha256: sha256(SOURCE_BYTES),
    vault,
    now: "2026-08-26T12:00:00Z",
  });
  assert.equal(archiveRetry.ok, true, archiveRetry && archiveRetry.reason);
  assert.equal(archiveRetry.value.status, "archived");
  assert.equal(vault.files.get("INBOX/Processed/2026-08/task10.md"), SOURCE_BYTES, "byte-identical");
  assert.equal(vault.files.has("INBOX/Knowledge/task10.md"), false);
});

// ---------------------------------------------------------------------------
// Processed move contract
// ---------------------------------------------------------------------------

test("changed-before-archive is blocked and proposal state preserved", async () => {
  loadTargets();
  const changed = `${SOURCE_BYTES}drift\n`;
  const vault = memoryVault({ "INBOX/Knowledge/task10.md": changed });
  const archive = await processedApi.archiveProcessed({
    source_path: "INBOX/Knowledge/task10.md",
    expected_sha256: sha256(SOURCE_BYTES),
    vault,
    now: "2026-08-26T12:00:00Z",
  });
  assert.equal(archive.ok, false);
  assert.equal(archive.reason, "source_changed_before_archive");
  assert.equal(vault.files.get("INBOX/Knowledge/task10.md"), changed);
  assert.equal(vault.counts.writes, 0);
  assert.equal(vault.counts.deletes, 0);
});

test("existing Processed destination fails closed", async () => {
  loadTargets();
  const vault = memoryVault({
    "INBOX/Knowledge/task10.md": SOURCE_BYTES,
    "INBOX/Processed/2026-08/task10.md": "previous archive",
  });
  const archive = await processedApi.archiveProcessed({
    source_path: "INBOX/Knowledge/task10.md",
    expected_sha256: sha256(SOURCE_BYTES),
    vault,
    now: "2026-08-26T12:00:00Z",
  });
  assert.equal(archive.ok, false);
  assert.equal(archive.reason, "processed_destination_exists");
  assert.equal(vault.files.get("INBOX/Knowledge/task10.md"), SOURCE_BYTES);
  assert.equal(vault.files.get("INBOX/Processed/2026-08/task10.md"), "previous archive");
});

test("full resolution then exact byte-identical move touching only expected paths", async () => {
  loadTargets();
  const group = groupOf(threeProposalArtifacts());
  const matrix = matrixOf(group);
  const vault = memoryVault({
    "ZETA/CANDIDATES/existing.md": "# Existing\n\n- old claim\n",
    "INBOX/Knowledge/task10.md": SOURCE_BYTES,
  });
  const all = batchApi.authorizeBatch(matrix, {
    selected_operation_ids: matrix.operations.map((op) => op.operation_id),
    user_action: "explicit_user_approval",
    run_id: "run_task10_archive",
  });
  const applied = await batchApi.applyBatch({ group, selection: all.value, vault, now: "2026-08-26T12:00:00Z" });
  assert.equal(applied.ok, true, applied && applied.reason);
  const eligibility = batchApi.archivalEligibility({ group, applyResult: applied.value });
  assert.equal(eligibility.eligible, true, JSON.stringify(eligibility));

  const touchedBeforeMove = [...vault.touched];
  const archive = await processedApi.archiveProcessed({
    source_path: "INBOX/Knowledge/task10.md",
    expected_sha256: sha256(SOURCE_BYTES),
    vault,
    now: "2026-08-26T12:00:00Z",
  });
  assert.equal(archive.ok, true, archive && archive.reason);
  assert.equal(archive.value.status, "archived");
  assert.equal(archive.value.processed_path, "INBOX/Processed/2026-08/task10.md");
  assert.equal(vault.files.get("INBOX/Processed/2026-08/task10.md"), SOURCE_BYTES, "byte-identical");
  assert.equal(vault.files.has("INBOX/Knowledge/task10.md"), false, "source moved out of INBOX");
  assert.deepEqual([...new Set(vault.touched.slice(touchedBeforeMove.length))].sort(),
    ["INBOX/Knowledge/task10.md", "INBOX/Processed/2026-08/task10.md"]);
});

test("source count requires processed identity and source absence or observed source path", () => {
  const deriveSourceCount = ({ processedExists, processedBytes, sourceBytes, sourceExists, observedPaths }) =>
    processedExists && Buffer.compare(Buffer.from(processedBytes), Buffer.from(sourceBytes)) === 0 &&
      (sourceExists === false || [...new Set(observedPaths)].includes("INBOX/Knowledge/task10.md")) ? 1 : 0;
  const sourceBytes = Buffer.from(SOURCE_BYTES);
  assert.equal(deriveSourceCount({ processedExists: true, processedBytes: sourceBytes, sourceBytes, sourceExists: false, observedPaths: [] }), 1);
  assert.equal(deriveSourceCount({ processedExists: true, processedBytes: sourceBytes, sourceBytes, sourceExists: true, observedPaths: ["INBOX/Knowledge/task10.md"] }), 1);
  assert.equal(deriveSourceCount({ processedExists: true, processedBytes: sourceBytes, sourceBytes, sourceExists: true, observedPaths: ["INBOX/Processed/2026-08/task10.md"] }), 0);
  assert.equal(deriveSourceCount({ processedExists: false, processedBytes: sourceBytes, sourceBytes, sourceExists: true, observedPaths: ["INBOX/Knowledge/task10.md"] }), 0);
});

test("archived replay is idempotent duplicate", async () => {
  loadTargets();
  const vault = memoryVault({ "INBOX/Processed/2026-08/task10.md": SOURCE_BYTES });
  const archive = await processedApi.archiveProcessed({
    source_path: "INBOX/Knowledge/task10.md",
    expected_sha256: sha256(SOURCE_BYTES),
    vault,
    now: "2026-08-26T12:00:00Z",
  });
  assert.equal(archive.ok, true);
  assert.equal(archive.value.status, "duplicate");
  assert.equal(vault.counts.writes, 0);
});
