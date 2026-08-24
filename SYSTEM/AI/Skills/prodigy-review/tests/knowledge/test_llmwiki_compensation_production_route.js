"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const { test } = require("node:test");
const { buildPages, runHub } = require("./knowledge_hub_integration_harness.js");

const beforeBytes = "# 기존 지식\n\n원래 내용입니다.\n";
const canonicalProposal = Object.freeze({
  type: "knowledge", title: "기존 지식", statement: "승인 후 내용입니다.", knowledge_kind: "principle",
  knowledge_domain: "reading", knowledge_topics: [], application_trigger: "보상 경로를 검증할 때",
  application_contexts: ["reading"], connections: [], invalidation_conditions: [], summary: "승인 후 지식",
  created: "2026-08-21T00:00:00.000Z", updated: "2026-08-21T00:00:00.000Z", body: "# 기존 지식\n\n승인 후 내용입니다.\n",
});
const afterBytes = require("../../../../../Views/knowledge-candidate-store.js").renderCanonicalDocument(canonicalProposal);
const targetPath = "ZETA/PERMANENT/task17-production-update.md";
const sha256 = (value) => crypto.createHash("sha256").update(value, "utf8").digest("hex");

function updateProviderSource() {
  return `(function(root){root.AIProviderService=Object.freeze({async requestStructuredJsonOnce(request){const selected=JSON.parse(request.prompt).selected_source;return {status:"ok",serialized_operation:JSON.stringify({contract_version:"llmwiki_operation_contract_v1",operation_id:"operation_task17_production",kind:"update",destination_ids:["${targetPath}"],base_revisions:{"${targetPath}":"${sha256(beforeBytes)}"},before_bytes:{"${targetPath}":${JSON.stringify(beforeBytes)}},after_bytes:{"${targetPath}":${JSON.stringify(afterBytes)}},source_citations:[{source_id:selected.source_id,content_hash:selected.content_hash,source_url:null,locators:[selected.locator],source_archive_id:null,confidence:"explicit"}],conflicts:[],risk_tier:"low",effects:{deprecations:[],supersessions:[]}}),canonical_proposal:${JSON.stringify(canonicalProposal)},provider_confidence:.99,response_metadata:{response_id:"response_task17"}}}})})(globalThis);`;
}

async function mountedHub() {
  const result = await runHub({
    pages: buildPages(),
    extraFiles: {
      "INBOX/Knowledge/task17.md": "# Task 17 fixture\n\n근거입니다.\n",
      [targetPath]: beforeBytes,
      "SYSTEM/Views/ai-provider-service.js": updateProviderSource(),
    },
  });
  await result.window.KnowledgeExplorerHub.whenKnowledgeInboxSettled();
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
      "INBOX/Knowledge/task17-atomic.md": "# Task 17 atomic fixture\n",
      [alphaPath]: alphaAfter,
      [betaPath]: betaAfter,
      "SYSTEM/Views/ai-provider-service.js": updateProviderSource(),
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
