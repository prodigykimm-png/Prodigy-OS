"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "../../../../../../..");
const view = (name) => require(path.join(ROOT, "SYSTEM/Views", name));
const fixture = require("./llmwiki-update-operation-v1.json");
const RECEIPT_PATH = path.join(ROOT, ".omo/evidence/prodigy-llmwiki-autonomous-knowledge-git/task-10/update-operation-receipt.json");
const sha256 = (value) => crypto.createHash("sha256").update(String(value), "utf8").digest("hex");
const stable = (value) => Array.isArray(value) ? `[${value.map(stable).join(",")}]` : value && typeof value === "object" ? `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stable(value[key])}`).join(",")}}` : JSON.stringify(value);
const root = fs.mkdtempSync(path.join(os.tmpdir(), "llmwiki-update-manual-qa-"));
const target = path.join(root, fixture.target_path);
const source = path.join(root, "ZETA/LITERATURE/update-bound.md");

async function main() {
  const store = view("knowledge-candidate-store.js");
  const operationContract = view("llmwiki-operation-contract.js");
  const canonical = view("llmwiki-canonical-packet.js");
  const evidenceApi = view("llmwiki-evidence-contract.js");
  const writer = view("llmwiki-operation-writer.js");
  const commit = view("llmwiki-deterministic-commit.js");
  const safetyApi = view("llmwiki-vault-safety.js");
  const before = store.renderCanonicalDocument(fixture.before_document);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.mkdirSync(path.dirname(source), { recursive: true });
  fs.writeFileSync(target, before, "utf8");
  fs.writeFileSync(source, "preserved source\n", "utf8");
  const safety = safetyApi.createVaultSafetyAdapter({ rootDir: root });
  const operationId = "operation_manual_update";
  const typedOperation = operationContract.parseOperation(JSON.stringify({
    contract_version: operationContract.CONTRACT_VERSION,
    operation_id: operationId,
    kind: "update",
    destination_ids: [fixture.canonical_id],
    base_revisions: { [fixture.canonical_id]: sha256(before) },
    before_bytes: { [fixture.canonical_id]: before },
    after_bytes: { [fixture.canonical_id]: "inert manual fixture bytes; canonical payload is separately hash-bound" },
    source_citations: [{ source_id: "source_manual_update", content_hash: "b".repeat(64), source_url: "https://example.com/update", locators: ["ZETA/LITERATURE/update-bound.md#claim"], source_archive_id: null, confidence: "explicit" }],
    conflicts: [],
    risk_tier: "medium",
    effects: { deprecations: [], supersessions: [] },
  }));
  assert.equal(typedOperation.ok, true, JSON.stringify(typedOperation));
  assert.equal(operationContract.isOperationRecord(typedOperation.value), true);
  const canonicalOperation = operationContract.parseCanonicalOperation(JSON.stringify({
    operation_id: typedOperation.value.operation_id,
    proposal_id: "proposal_manual_update",
    proposal_kind: typedOperation.value.kind,
    payload_hash: sha256(stable(fixture.after_document)),
  }));
  assert.equal(canonicalOperation.ok, true, JSON.stringify(canonicalOperation));
  assert.equal(operationContract.isCanonicalOperationRecord(canonicalOperation.value), true);
  const request = {
    run_id: "run_manual_update", consent_hash: "a".repeat(64), target_path: fixture.target_path,
    operation: canonicalOperation.value,
    canonical_document: fixture.after_document,
    source_citations: [{ source_id: "source_manual_update", content_hash: "b".repeat(64), locators: ["ZETA/LITERATURE/update-bound.md#claim"], source_url: "https://example.com/update", source_archive_id: null, confidence: "explicit" }],
    expires_at: "2099-01-01T00:00:00.000Z", nonce: "nonce_manual_update_0001",
  };
  const assembled = await canonical.assembleCanonicalPacket(request, { readBytes: (relative) => safety.readCanonical(relative).bytes });
  if (!assembled.ok) throw new Error(JSON.stringify(assembled));
  const evidence = evidenceApi.evaluateEvidence({
    operation_id: operationId,
    claims: [{ claim_id: "claim_manual_update", text: "Reviewed", changed: true, citation_ids: ["citation_manual_update"] }],
    citations: [{ citation_id: "citation_manual_update", source_id: "source_manual_update", source_span: { locator: "ZETA/LITERATURE/update-bound.md#claim", start: 0, end: 8 }, source_length: 8, source_content_hash: "b".repeat(64), extractor_revision: "c".repeat(64) }],
    verification: { verified_at: "2026-08-14T00:00:00.000Z", owner: { owner_id: "reviewer_manual", owner_type: "human" }, validity_conditions: ["current"], invalidation_conditions: ["withdrawn"], stale_triggers: [] },
    current_source_snapshots: { source_manual_update: { source_length: 8, content_hash: "b".repeat(64), extractor_revision: "c".repeat(64) } }, triggered_conditions: [],
  });
  const authorize = () => writer.authorizeCanonicalUpdate({
    packet: assembled.value, canonical_id: fixture.canonical_id, evidence: evidence.value,
    compensation_plan: { strategy: "restore_exact_before_bytes", target_path: fixture.target_path, before_sha256: assembled.value.before_sha256 },
  }).value;

  const approval = authorize();
  const success = await commit.commitApprovedCanonical({ packet: assembled.value, authorization: approval, adapter: safety }, { now: "2026-08-14T02:00:00.000Z" });
  const replay = await commit.commitApprovedCanonical({ packet: assembled.value, authorization: approval, adapter: safety }, { now: "2026-08-14T02:01:00.000Z" });
  const successBytesMatch = success.status === "committed" && fs.readFileSync(target, "utf8") === assembled.value.after_bytes
    && success.receipt.after_sha256 === assembled.value.after_sha256;

  fs.writeFileSync(target, "external stale edit\n", "utf8");
  const staleApproval = authorize();
  const stale = await writer.commitApprovedUpdate({ packet: assembled.value, authorization: staleApproval, adapter: safety }, { now: "2026-08-14T02:02:00.000Z" });
  let pathEscapeWrites = 0;
  try { safety.readCanonical("ZETA/PERMANENT/../escape.md"); pathEscapeWrites = 1; } catch (_error) {}
  fs.writeFileSync(target, before, "utf8");

  let memoryBytes = before;
  let reads = 0;
  const failedApproval = authorize();
  const failedAdapter = {
    readCanonical(relative) { reads += 1; return { path: relative, bytes: reads === 2 ? "misleading verify bytes\n" : memoryBytes }; },
    atomicReplace(update) { writer.assertAtomicReplaceRequest(update, memoryBytes); memoryBytes = update.after_bytes; return { ok: true, status: "committed" }; },
    restoreExact(restore) { writer.assertRestoreRequest(restore, memoryBytes); memoryBytes = restore.restore_bytes; return { ok: true, status: "restored" }; },
  };
  const failed = await writer.commitApprovedUpdate({ packet: assembled.value, authorization: failedApproval, adapter: failedAdapter }, { now: "2026-08-14T02:03:00.000Z" });

  const receipt = {
    successBytesMatch,
    replayWrites: replay.write_counts.canonical,
    staleWrites: stale.write_counts.canonical,
    pathEscapeWrites,
    failedVerifyWrites: memoryBytes === before ? 0 : 1,
    approvalConsumedOnSuccess: writer.isApprovalConsumed(approval),
    approvalConsumedOnPrewriteFailure: writer.isApprovalConsumed(staleApproval),
    sourceDeletes: fs.existsSync(source) ? 0 : 1,
    gitCalls: success.git_calls + replay.git_calls + stale.git_calls + failed.git_calls,
    compensationPrepared: success.compensation_prepared === true && failed.compensation_prepared === true && failed.compensation.status === "restored",
  };
  assert.deepEqual(receipt, {
    successBytesMatch: true,
    replayWrites: 0,
    staleWrites: 0,
    pathEscapeWrites: 0,
    failedVerifyWrites: 0,
    approvalConsumedOnSuccess: true,
    approvalConsumedOnPrewriteFailure: false,
    sourceDeletes: 0,
    gitCalls: 0,
    compensationPrepared: true,
  });
  fs.mkdirSync(path.dirname(RECEIPT_PATH), { recursive: true });
  fs.writeFileSync(RECEIPT_PATH, `${JSON.stringify(receipt, null, 2)}\n`, "utf8");
  return receipt;
}

main().then((receipt) => {
  fs.rmSync(root, { recursive: true, force: true });
  process.stdout.write(`${JSON.stringify(receipt, null, 2)}\n`);
}, (error) => {
  fs.rmSync(root, { recursive: true, force: true });
  console.error(error);
  process.exitCode = 1;
});
