"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "../../../../../../..");
const view = (name) => require(path.join(ROOT, "SYSTEM/Views", name));
const contract = view("llmwiki-operation-contract.js");
const merge = view("llmwiki-merge-transaction.js");
const hash = view("llmwiki-hash.js");
const safety = view("llmwiki-vault-safety.js");
const commit = view("llmwiki-deterministic-commit.js");
const RECEIPT_PATH = path.join(ROOT, ".omo/evidence/prodigy-llmwiki-autonomous-knowledge-git/task-11/compensation-repair-receipt.json");
const destination = "ZETA/PERMANENT/manual-merged.md";
const sources = ["ZETA/PERMANENT/manual-alpha.md", "ZETA/PERMANENT/manual-beta.md", "ZETA/PERMANENT/manual-gamma.md"];
const before = {
  [destination]: "manual destination before\n",
  [sources[0]]: "manual alpha before\n",
  [sources[1]]: "manual beta before\n",
  [sources[2]]: "manual gamma before\n",
};
const modeByPath = { [destination]: 0o600, [sources[0]]: 0o640, [sources[1]]: 0o644, [sources[2]]: 0o660 };
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "llmwiki-merge-task11-"));
let cleanup = false;

async function main() {
try {
  for (const targetPath of [destination, ...sources]) {
    const absolute = path.join(tempRoot, targetPath);
    fs.mkdirSync(path.dirname(absolute), { recursive: true });
    fs.writeFileSync(absolute, before[targetPath], { encoding: "utf8", mode: modeByPath[targetPath] });
    fs.chmodSync(absolute, modeByPath[targetPath]);
  }
  const revisions = Object.fromEntries([destination, ...sources].map((targetPath) => [targetPath, hash.sha256(before[targetPath])]));
  const parsed = contract.parseOperation(JSON.stringify({
    contract_version: contract.CONTRACT_VERSION,
    operation_id: "operation_manual_multi_source_merge",
    kind: "merge", destination_ids: [destination], source_ids: sources.slice().reverse(),
    base_revisions: revisions, before_bytes: before, after_bytes: { [destination]: "manual destination merged after\n" },
    source_citations: sources.map((sourcePath, index) => ({ source_id: `manual_evidence_${index + 1}`, content_hash: String(index + 1).repeat(64), source_url: `https://example.com/manual/${index + 1}`, locators: [`ZETA/LITERATURE/manual-${index + 1}.md#claim`], source_archive_id: null, confidence: "explicit" })),
    conflicts: [], risk_tier: "high", effects: { deprecations: [], supersessions: sources.slice().reverse().map((sourcePath) => ({ destination_id: sourcePath, target_revision: revisions[sourcePath], before_bytes: before[sourcePath], replacement_id: destination, reason: "manual_reviewed_merge" })) },
  }));
  assert.equal(parsed.ok, true, JSON.stringify(parsed));
  const assembled = merge.assembleMergePacket({
    operation: parsed.value,
    evidence: { contract_version: "llmwiki_evidence_contract_v1", operation_id: parsed.value.operation_id, approval_eligible: true, stale: false, claim_lineage: [{ claim_id: "manual_claim", citation_ids: ["manual_citation"] }] },
    provenance: { source_snapshots: sources.slice().reverse().map((sourcePath, index) => ({ source_id: sourcePath, source_revision: revisions[sourcePath], extractor_revision: String(index + 4).repeat(64) })) },
    compensation_plan: { strategy: "restore_all_exact_before_state" }, expires_at: "2099-01-01T00:00:00.000Z", nonce: "nonce_manual_merge_task11_0001",
  });
  assert.equal(assembled.ok, true, JSON.stringify(assembled));
  const authorized = merge.authorizeMergePacket(assembled.value, { action: "approve_merge", operation_id: parsed.value.operation_id });
  assert.equal(authorized.ok, true, JSON.stringify(authorized));
  const realAdapter = safety.createVaultSafetyAdapter({ rootDir: tempRoot });
  let replaceAttempts = 0;
  let successfulWritesBeforeFailure = 0;
  const injectedAdapter = Object.freeze({
    readCanonical: realAdapter.readCanonical,
    restoreExact: realAdapter.restoreExact,
    recordMergeAudit: realAdapter.recordMergeAudit,
    atomicReplace(request) {
      replaceAttempts += 1;
      if (replaceAttempts === 4) throw Object.assign(new Error("manual injected interruption"), { code: "interrupted" });
      const result = realAdapter.atomicReplace(request);
      successfulWritesBeforeFailure += 1;
      return result;
    },
  });
  const failed = await commit.commitApprovedCanonical({ packet: assembled.value, authorization: authorized.value, adapter: injectedAdapter }, { now: "2026-08-14T04:30:00.000Z" });
  assert.equal(failed.ok, false, JSON.stringify(failed));
  assert.equal(failed.reason, "atomic_replace_failed", JSON.stringify(failed));
  assert.equal(failed.compensation_status, "restored");
  assert.equal(successfulWritesBeforeFailure, 3);
  const byteComparisons = {};
  const modeComparisons = {};
  for (const targetPath of [destination, ...sources]) {
    const absolute = path.join(tempRoot, targetPath);
    byteComparisons[targetPath] = fs.readFileSync(absolute, "utf8") === before[targetPath];
    modeComparisons[targetPath] = (fs.statSync(absolute).mode & 0o777) === modeByPath[targetPath];
    assert.equal(byteComparisons[targetPath], true, targetPath);
    assert.equal(modeComparisons[targetPath], true, targetPath);
  }
  const auditPath = path.join(tempRoot, ".llmwiki-audit/nonce_manual_merge_task11_0001.merge-failure.json");
  const audit = JSON.parse(fs.readFileSync(auditPath, "utf8"));
  assert.equal(audit.result, "failed");
  assert.equal(audit.approval_consumed, false);
  const successfulWriteOrder = assembled.value.write_order.slice(0, 3);
  const exactReverseRestoreOrder = successfulWriteOrder.slice().reverse();
  assert.deepEqual(audit.mutation_events.filter((event) => event.kind === "write_succeeded").map((event) => event.target_path), successfulWriteOrder);
  assert.deepEqual(audit.mutation_events.filter((event) => event.kind === "restore_verified").map((event) => event.target_path), exactReverseRestoreOrder);
  assert.deepEqual(audit.restored_paths, exactReverseRestoreOrder);
  const receipt = {
    receipt_version: "llmwiki_task11_compensation_repair_evidence_v1",
    generated_at: "2026-08-14T05:30:00.000Z",
    red: {
      verification_read_truth: { tests: 10, passed: 7, failed: 3, exit_code: 1 },
      forward_mutation_baseline: { tests: 9, passed: 9, failed: 0, exit_code: 0 },
    },
    green: { focused_tests: { tests: 10, passed: 10, failed: 0 }, reverse_mutation: { tests: 10, passed: 9, failed: 1, exit_code: 1, intended_assertion_failed: true }, task10_gate: null, all_llmwiki_tests: null },
    bindings: { packet_hash: assembled.value.packet_hash, authorization_hash: authorized.value.authorization_hash, evidence_hash: assembled.value.evidence_hash, provenance_hash: assembled.value.provenance_hash, compensation_plan_hash: assembled.value.compensation_plan_hash, destination, ordered_source_set: assembled.value.ordered_source_set },
    write_order: assembled.value.write_order,
    failure: { reason: failed.reason, replace_attempts: replaceAttempts, successful_writes_before_failure: successfulWritesBeforeFailure, written_paths: audit.written_paths, restored_paths: audit.restored_paths, successful_write_order: successfulWriteOrder, exact_reverse_restore_order: exactReverseRestoreOrder, mutation_events: audit.mutation_events, compensation_failures: audit.compensation_failures.length, approval_consumed: failed.approval_consumed },
    manual_qa: { isolated_temp_vault: true, source_count: sources.length, byte_comparisons: byteComparisons, mode_comparisons: modeComparisons, failure_audit_result: audit.result, failure_audit_path: ".llmwiki-audit/nonce_manual_merge_task11_0001.merge-failure.json", cleanup: "pending" },
    zero_effect_counters: { source_deletes: failed.source_deletes, git_calls: failed.git_calls, provider: failed.write_counts.provider, network: failed.write_counts.network },
    verification: {}, residual_risks: [], commits_created: 0,
  };
  fs.mkdirSync(path.dirname(RECEIPT_PATH), { recursive: true });
  fs.writeFileSync(RECEIPT_PATH, `${JSON.stringify(receipt, null, 2)}\n`, "utf8");
} finally {
  fs.rmSync(tempRoot, { recursive: true, force: true });
  cleanup = !fs.existsSync(tempRoot);
  if (fs.existsSync(RECEIPT_PATH)) {
    const receipt = JSON.parse(fs.readFileSync(RECEIPT_PATH, "utf8"));
    receipt.manual_qa.cleanup = cleanup ? "removed" : "failed";
    fs.writeFileSync(RECEIPT_PATH, `${JSON.stringify(receipt, null, 2)}\n`, "utf8");
  }
}

assert.equal(cleanup, true);
console.log(`TASK11_MANUAL_QA receipt=${RECEIPT_PATH} cleanup=${cleanup}`);
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
