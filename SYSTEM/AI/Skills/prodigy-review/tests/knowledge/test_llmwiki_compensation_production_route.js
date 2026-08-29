"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const { test } = require("node:test");
const { buildPages, runHub } = require("./knowledge_hub_integration_harness.js");

const beforeBytes = "# 기존 지식\n\n원래 내용입니다.\n";
const afterBytes = "# 승인 후 내용입니다.\n\n승인 후 내용입니다.\n";
const targetPath = "ZETA/PERMANENT/task17-production-update.md";
const sha256 = (value) => crypto.createHash("sha256").update(value, "utf8").digest("hex");

// Task 11 repoint: this route tests the retained approval -> commit ->
// compensation authority on the real Hub controller. Analysis is no longer
// automatic on mount and PERMANENT updates are not minted by the batch core,
// so the typed update proposal enters through the production risk-review API.
const { operation } = require("./llmwiki_real_product_fixtures.js");

function typedUpdateProposal() {
  const raw = operation("update", "production-update", {
    operation_id: "operation_task17_production_update",
    destination_ids: [targetPath],
    base_revisions: { [targetPath]: sha256(beforeBytes) },
    before_bytes: { [targetPath]: beforeBytes },
    after_bytes: { [targetPath]: afterBytes },
    source_citations: [{ source_id: "source_task17", content_hash: sha256(beforeBytes), source_url: null, locators: ["INBOX/Knowledge/task17.md"], source_archive_id: null, confidence: "explicit" }],
  });
  return raw;
}

async function mountedHub() {
  const result = await runHub({
    pages: buildPages(),
    extraFiles: {
      [targetPath]: beforeBytes,
    },
    llmWikiControllerOptions: {},
  });
  await result.window.KnowledgeExplorerHub.whenKnowledgeInboxSettled();
  const parsed = result.window.LLMWikiOperationContract.parseOperation(JSON.stringify(typedUpdateProposal()));
  assert.equal(parsed.ok, true, JSON.stringify(parsed));
  const opened = result.window.KnowledgeExplorerHub.llmWikiRunController.openPreparedRiskReview({
    run_id: "run_task17_compensation_route",
    proposals: [{ operation: parsed.value, title: "승인 후 내용입니다." }],
  });
  assert.equal(opened.ok, true, JSON.stringify(opened));
  return result;
}

test("real Hub route exposes one confirmed compensation action and consumes it after exact restoration", async () => {
  const result = await mountedHub();
  const hub = result.window.KnowledgeExplorerHub;
  const packet = hub.llmWikiRunController.getSnapshot().risk_packets[0];
  const committed = await hub.dispatchLlmWikiAction({ action: "approve_risk", run_id: packet.run_id, run_revision: packet.run_revision, packet_id: packet.packet_id });

  assert.equal(committed.status, "committed");
  assert.equal(result.app.vault.getAbstractFileByPath(targetPath) !== null, true);
  assert.equal(await result.app.vault.read(result.app.vault.getAbstractFileByPath(targetPath)), afterBytes);
  assert.ok(hub.llmWikiLifecycleSnapshot().compensation, JSON.stringify(committed.compensation));
  assert.equal(hub.llmWikiLifecycleSnapshot().compensation.eligible, true);
  assert.equal((await hub.dispatchLlmWikiAction({ action: "confirm_compensation" })).reason, "compensation_confirmation_required");

  assert.equal((await hub.dispatchLlmWikiAction({ action: "request_compensation" })).status, "compensation_confirmation_required");
  const restored = await hub.dispatchLlmWikiAction({ action: "confirm_compensation" });
  assert.equal(restored.status, "compensated");
  assert.equal(await result.app.vault.read(result.app.vault.getAbstractFileByPath(targetPath)), beforeBytes);
  assert.equal(hub.llmWikiLifecycleSnapshot().compensation.eligible, false);
  assert.equal(result.app.vault.touched.some((row) => String(row[1]).startsWith(".llmwiki-audit/immutable/")), true);
});

test("disposable production Hub driver restores a failed multi-file compensation and rejects restart truncation", async () => {
  const alphaPath = "ZETA/PERMANENT/task17-atomic-alpha.md";
  const betaPath = "ZETA/PERMANENT/task17-atomic-beta.md";
  const alphaBefore = "alpha before\n";
  const alphaAfter = "alpha after\n";
  const betaBefore = "beta before\n";
  const betaAfter = "beta after\n";
  const result = await runHub({
    pages: buildPages(),
    extraFiles: {
      [alphaPath]: alphaAfter,
      [betaPath]: betaAfter,
    },
  });
  const adapter = result.window.LLMWikiObsidianAdapter.createObsidianAdapter(result.app);
  const receipt = {
    run_id: "run_task17_atomic_production",
    packet_id: "packet_task17_atomic_production",
    packet_hash: sha256("task17 atomic production"),
    committed_at: "2026-08-20T00:00:00.000Z",
    policy_snapshot: { approval: "individual", operation_kind: "merge", risk_tier: "high" },
    source_revisions: {},
    writes: [
      [alphaPath, alphaBefore, alphaAfter],
      [betaPath, betaBefore, betaAfter],
    ].map(([pathName, before_bytes, after_bytes]) => ({
      path: pathName,
      before_bytes,
      before_sha256: sha256(before_bytes),
      before_revision: sha256(before_bytes),
      after_bytes,
      after_sha256: sha256(after_bytes),
      post_commit_revision: sha256(after_bytes),
    })),
    write_outcome: "committed",
    refresh_outcome: "succeeded",
    git_outcome: "not_requested",
  };
  let replacements = 0;
  const failingAdapter = {
    ...adapter,
    async replaceCompensationExact(request) {
      replacements += 1;
      if (replacements === 2) return { ok: false, reason: "forced_second_write_failure" };
      return adapter.replaceCompensationExact(request);
    },
  };
  const service = result.window.LLMWikiCompensationService.create({ adapter: failingAdapter });
  const action = { type: "compensate", action_id: "action_task17_atomic_production", confirmed_at: "2026-08-20T00:00:00.000Z" };
  const prepared = service.prepareCompensation({ original_receipt: receipt, user_action: action });
  const recorded = await service.recordPreparedCompensation({ prepared });
  const failed = await service.commitCompensation({ state: "compensation_committing", packet: prepared.packet, user_action: action });
  const restarted = result.window.LLMWikiCompensationService.create({ adapter });

  assert.equal(recorded.ok, true);
  assert.equal(failed.reason, "compensation_write_failed_restored");
  assert.equal(await result.app.vault.read(result.app.vault.getAbstractFileByPath(alphaPath)), alphaAfter);
  assert.equal(await result.app.vault.read(result.app.vault.getAbstractFileByPath(betaPath)), betaAfter);
  assert.equal((await restarted.validatePersistedAuditChain([recorded.audit, failed.audit])).ok, true);
  assert.equal((await restarted.validatePersistedAuditChain([recorded.audit])).reason, "immutable_audit_truncated");
  assert.equal((await restarted.recordPreparedCompensation({ prepared })).reason, "immutable_audit_replay");
});
