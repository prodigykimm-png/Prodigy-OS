"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const { buildPages, runHub } = require("./knowledge_hub_integration_harness.js");

const ROOT = path.resolve(__dirname, "../../../../../..");
const source = (name) => fs.readFileSync(path.join(ROOT, name), "utf8");
const HUB = source("HUB/50 Knowledge.md");
const CONTROLLER = source("SYSTEM/Views/llmwiki-run-controller.js");
const LIFECYCLE = source("SYSTEM/Views/llmwiki-lifecycle-view.js");

function operation(kind, suffix) {
  const target = `ZETA/CANDIDATES/${suffix}.md`;
  const before = `# ${suffix}\nold\n`;
  const revision = require("node:crypto").createHash("sha256").update(before).digest("hex");
  const raw = {
    contract_version: "llmwiki_operation_contract_v1",
    operation_id: `operation_${suffix}`,
    kind,
    destination_ids: [target],
    base_revisions: kind === "create" ? {} : { [target]: revision },
    before_bytes: kind === "create" ? {} : { [target]: before },
    after_bytes: { [target]: `# ${suffix}\nnew\n` },
    source_citations: [{ source_id: `source_${suffix}`, content_hash: "a".repeat(64), source_url: null, locators: [`INBOX/${suffix}.md`], source_archive_id: null, confidence: "explicit" }],
    conflicts: [],
    risk_tier: kind === "merge" ? "high" : kind === "create" ? "low" : "medium",
    effects: { deprecations: [], supersessions: [] },
    ...(kind === "merge" ? { source_ids: [`cand_${suffix}_a`, `cand_${suffix}_b`], base_revisions: { [target]: revision, [`cand_${suffix}_a`]: revision, [`cand_${suffix}_b`]: revision }, before_bytes: { [target]: before, [`cand_${suffix}_a`]: before, [`cand_${suffix}_b`]: before } } : {}),
  };
  return raw;
}

for (const [name, rollout_storage] of [
  ["absent", undefined],
  ["retired empty", { async load() { return JSON.stringify({ version: "llmwiki_rollout_state_v1", enabled_phases: [], gate_receipts: {} }); }, async save() { throw new Error("retired rollout state must not be written"); } }],
]) {
  test(`canonical create/update/merge review packets proceed with ${name} rollout state`, async () => {
    for (const kind of ["create", "update", "merge"]) {
      const result = await runHub({ pages: buildPages(), llmWikiControllerOptions: rollout_storage ? { rollout_storage } : {} });
      await result.window.KnowledgeExplorerHub.whenKnowledgeInboxSettled();
      const controller = result.window.KnowledgeExplorerHub.llmWikiRunController;
      const parsed = result.window.LLMWikiOperationContract.parseOperation(JSON.stringify(operation(kind, `${name.replace(/ /gu, "_")}_${kind}`)));
      assert.equal(parsed.ok, true, JSON.stringify(parsed));
      const opened = controller.openPreparedRiskReview({ run_id: `run_f3_${name.replace(/ /gu, "_")}_${kind}`, proposals: [{ operation: parsed.value, title: `${kind} review` }] });
      assert.equal(opened.ok, true, JSON.stringify(opened));
      assert.equal(controller.getSnapshot().risk_packets[0].operation.kind, kind);
    }
  });
}

test("production proposal and approval path has no retired rollout or migration delegation", () => {
  for (const text of [HUB, CONTROLLER, LIFECYCLE]) {
    assert.doesNotMatch(text, /enable_rollout_phase|enable-rollout-phase|operation_phase_unavailable/u);
  }
  assert.doesNotMatch(HUB, /rollout_storage|rolloutGateProvider|startMigrationDryRun|approveMigration/u);
  assert.doesNotMatch(CONTROLLER, /openPreparedRiskReview[\s\S]*gateRolloutPhase/u);
  assert.doesNotMatch(CONTROLLER, /dispatchRiskAction[\s\S]*gateRolloutPhase/u);
});

test("provider-free review_ready proposal reaches approval, audit, and byte-identical Processed once", async () => {
  const crypto = require("node:crypto");
  const sha = (value) => crypto.createHash("sha256").update(String(value)).digest("hex");
  const materializer = require(path.join(ROOT, "SYSTEM/Views/llmwiki-inbox-proposal-materializer.js")).createInboxProposalMaterializer();
  const batch = require(path.join(ROOT, "SYSTEM/Views/llmwiki-batch-approval-adapter.js"));
  const processed = require(path.join(ROOT, "SYSTEM/Views/llmwiki-processed-source-service.js"));
  const sourceBytes = "# F3 provider-free source\n\nreview ready\n";
  const sourceRow = { source_id: "source_f3_provider_free", source_path: "INBOX/f3-provider-free.md", content_hash: sha(sourceBytes) };
  const reviewReady = {
    state: "review_ready",
    provider_calls: 0,
    artifacts: [{ chunk_key: "chunk_f3_provider_free", outcome: "proposals", items: [{ role: "source_summary", evidence_quote: "review ready", claims: [{ text: "Provider-free F3 claim" }], review_reasons: [], related_candidate_ids: [] }] }],
  };
  const materialized = materializer.materialize({ source: sourceRow, artifacts: reviewReady.artifacts });
  assert.equal(materialized.ok, true, materialized.reason);
  const group = batch.groupProposalsBySource({ source: sourceRow, materializeResult: materialized }).value;
  const matrix = batch.preselectionMatrix(group).value;
  const selected = matrix.operations.filter((row) => row.selected).map((row) => row.operation_id);
  const authorization = batch.authorizeBatch(matrix, { user_action: batch.EXPLICIT_ACTION, selected_operation_ids: selected, run_id: "run_f3_provider_free" });
  assert.equal(authorization.ok, true, authorization.reason);

  const files = new Map([[sourceRow.source_path, sourceBytes]]);
  const touched = [];
  const vault = {
    readBytes(target) { return files.has(target) ? files.get(target) : null; },
    writeExact(target, bytes) { files.set(target, bytes); touched.push(["write", target]); return { ok: true }; },
    deleteExact(target) { if (!files.has(target)) return { ok: false, reason: "missing" }; files.delete(target); touched.push(["delete", target]); return { ok: true }; },
  };
  const applied = await batch.applyBatch({ group, selection: authorization.value, vault, now: "2026-08-27T00:00:00.000Z" });
  assert.equal(applied.ok, true, applied.reason);
  assert.deepEqual(applied.value.results.map((row) => row.status), ["committed"]);
  assert.equal(applied.value.write_counts.canonical, 1);
  assert.ok(applied.value.write_counts.audit >= 1);
  const eligibility = batch.archivalEligibility({ group, applyResult: applied.value });
  assert.equal(eligibility.eligible, true, eligibility.reasons.join(","));
  const archived = await processed.archiveProcessed({ source_path: sourceRow.source_path, expected_sha256: sourceRow.content_hash, vault, now: "2026-08-27T00:00:00.000Z" });
  assert.equal(archived.ok, true, archived.reason);
  assert.equal(files.get(archived.value.processed_path), sourceBytes);

  const touchedAfter = touched.length;
  const duplicate = await batch.applyBatch({ group, selection: authorization.value, vault, now: "2026-08-27T00:00:01.000Z" });
  assert.equal(duplicate.ok, true, duplicate.reason);
  assert.deepEqual(duplicate.value.results.map((row) => row.status), ["duplicate"]);
  assert.equal(duplicate.value.write_counts.canonical, 0);
  assert.equal(touched.length, touchedAfter);
  assert.equal(reviewReady.provider_calls, 0);
});

test("typed active gates remain fail closed without provider calls", async () => {
  const contract = require(path.join(ROOT, "SYSTEM/Views/llmwiki-operation-contract.js"));
  const unknown = operation("create", "unknown");
  unknown.kind = "delete";
  assert.equal(contract.parseOperation(JSON.stringify(unknown)).reason, "unknown_operation_kind");

  const batch = require(path.join(ROOT, "SYSTEM/Views/llmwiki-batch-approval-adapter.js"));
  assert.equal(batch.authorizeBatch({ operations: [] }, { selected_operation_ids: ["operation_unknown"] }).reason, "explicit_user_approval_required");
  assert.equal(batch.authorizeBatch({ operations: [] }, { user_action: batch.EXPLICIT_ACTION, selected_operation_ids: ["operation_unknown"] }).reason, "unknown_operation_selected");
});
