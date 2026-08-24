"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "../../../../../..");
const source = (file) => fs.readFileSync(path.join(ROOT, file), "utf8");
const HUB = source("HUB/50 Knowledge.md");
const MANIFEST = source("SYSTEM/Views/prodigy-workspace-manifest.js");
const RUNNER = source("SYSTEM/Views/llmwiki-operation-run-service.js");
const RISK = source("SYSTEM/Views/llmwiki-risk-review-controller.js");
const LEGACY = source("SYSTEM/Views/llmwiki-approval-review-view.js");
const STYLES = source("SYSTEM/Views/knowledge-styles.js");
const { buildPages, runHub } = require("./knowledge_hub_integration_harness.js");
const { mountRoot, serialize } = require("./llmwiki_lifecycle_view_fixture.js");

function providerServiceSource({ failFirst = false, conflict = false, existingBytes = null, invalidKind = false } = {}) {
  const existingRevision = existingBytes === null ? null : crypto.createHash("sha256").update(existingBytes, "utf8").digest("hex");
  return `(function(root){root.__task15ProviderCalls=[];root.AIProviderService=Object.freeze({async requestStructuredJsonOnce(request){root.__task15ProviderCalls.push(request);if(${failFirst}&&root.__task15ProviderCalls.length===1)return {status:"invalid"};const selected=JSON.parse(request.prompt).selected_source;const target="ZETA/PERMANENT/task15-production.md";const canonical_proposal={type:"knowledge",title:"승인된 제품 지식",statement:"실제 Hub 경로입니다.",knowledge_kind:${invalidKind ? "\"rumor\"" : "\"principle\""},knowledge_domain:"reading",knowledge_topics:[],application_trigger:"제품 지식을 검토할 때",application_contexts:["reading"],connections:[],invalidation_conditions:[],summary:"실제 Hub 제품 지식",created:"2026-08-21T00:00:00.000Z",updated:"2026-08-21T00:00:00.000Z",body:"# 승인된 제품 지식\\n\\n실제 Hub 경로입니다.\\n"};const after=root.KnowledgeCandidateStore.renderCanonicalDocument(canonical_proposal);return {status:"ok",serialized_operation:JSON.stringify({contract_version:"llmwiki_operation_contract_v1",operation_id:"operation_task15_production",kind:${existingBytes === null ? "\"create\"" : "\"update\""},destination_ids:[target],base_revisions:${existingBytes === null ? "{}" : `{[target]:${JSON.stringify(existingRevision)}}`},before_bytes:${existingBytes === null ? "{}" : `{[target]:${JSON.stringify(existingBytes)}}`},after_bytes:{[target]:after},source_citations:[{source_id:selected.source_id,content_hash:selected.content_hash,source_url:null,locators:[selected.locator],source_archive_id:null,confidence:"explicit"}],conflicts:${conflict ? "[{conflict_id:\"conflict_task15\",status:\"unresolved\",source_ids:[selected.source_id],summary:\"검토 필요\"}]" : "[]"},risk_tier:"low",effects:{deprecations:[],supersessions:[]}}),canonical_proposal,provider_confidence:.99,response_metadata:{response_id:"response_task15_"+root.__task15ProviderCalls.length}}}})})(globalThis);`;
}

async function productionHub(options = {}, llmWikiControllerOptions = {}) {
  const extraFiles = { "INBOX/Knowledge/task15.md": "# 제품 자료\\n\\n검토할 근거입니다.\\n", "SYSTEM/Views/ai-provider-service.js": providerServiceSource(options), ...(options.extraFiles || {}) };
  const result = await runHub({ pages: buildPages(), extraFiles, llmWikiControllerOptions });
  await result.window.KnowledgeExplorerHub.whenKnowledgeInboxSettled();
  return result;
}

test("P1 unavailable production provider fails visibly and typed without a network or key assumption", async () => {
  const result = await runHub({ pages: buildPages(), extraFiles: { "INBOX/Knowledge/unavailable.md": "# 로컬 자료", "SYSTEM/Views/ai-provider-service.js": "globalThis.AIProviderService=Object.freeze({});" } });
  const settled = await result.window.KnowledgeExplorerHub.whenKnowledgeInboxSettled();
  assert.equal(settled.state, "error");
  assert.equal(settled.reason, "transport_unavailable");
  assert.equal(result.window.KnowledgeExplorerHub.llmWikiRunController.getOperationSnapshot().status, "idle");
  assert.equal(result.app.vault.touched.some((row) => String(row[1]).startsWith("ZETA/PERMANENT/")), false);
});

test("P1 invalid canonical knowledge kind fails before review and permanent writes", async () => {
  const result = await productionHub({ invalidKind: true });
  assert.equal(result.window.__task15ProviderCalls.length, 1);
  assert.notEqual(result.window.KnowledgeExplorerHub.llmWikiRunController.getSnapshot().status, "review");
  assert.equal(result.window.KnowledgeExplorerHub.llmWikiLifecycleSnapshot().inbox.reason, "invalid_knowledge_kind");
  assert.equal(result.app.vault.touched.some((row) => String(row[1]).startsWith("ZETA/PERMANENT/")), false);
});

test("P1 default production operation provider reaches review without controller test options", async () => {
  assert.match(MANIFEST, /llmwiki-production-operation-provider\.js/);
  const result = await productionHub();
  assert.equal(result.window.__task15ProviderCalls.length, 1);
  assert.equal(result.window.KnowledgeExplorerHub.llmWikiRunController.getSnapshot().status, "review");
  assert.equal(result.window.KnowledgeExplorerHub.llmWikiRunController.getOperationSnapshot().operation_id, "operation_task15_production");
  assert.equal(result.app.vault.touched.some((row) => row[1] === "ZETA/PERMANENT/task15-production.md"), false);
});

test("P1 risk approval commits once through Task13 and persists exact follow-up truth", async () => {
  assert.match(RUNNER, /approvePreparedRisk/);
  assert.match(RISK, /commitRun/);
  const result = await productionHub();
  const hub = result.window.KnowledgeExplorerHub;
  const packet = hub.llmWikiRunController.getSnapshot().risk_packets[0];
  const approved = await hub.dispatchLlmWikiAction({ action: "approve_risk", run_id: packet.run_id, run_revision: packet.run_revision, packet_id: packet.packet_id });
  assert.equal(approved.status, "committed");
  const operation = hub.llmWikiRunController.getOperationSnapshot();
  assert.equal(operation.status, "committed");
  assert.equal(operation.canonical_outcome.operation_id, "operation_task15_production");
  const expectedInitialFollowUp = {
    status: "failed",
    refresh: { status: "succeeded", attempts: 1, reason: null },
    git: { status: "failed", attempts: 1, reason: "GitUnavailable" },
  };
  assert.deepEqual(JSON.parse(JSON.stringify(operation.follow_up)), expectedInitialFollowUp);
  assert.equal(result.app.vault.touched.filter((row) => row[0] === "create" && row[1] === "ZETA/PERMANENT/task15-production.md").length, 1);
  const duplicate = await hub.dispatchLlmWikiAction({ action: "approve_risk", run_id: packet.run_id, run_revision: packet.run_revision, packet_id: packet.packet_id });
  assert.equal(duplicate.reason, "stale_risk_action");
  assert.equal(result.app.vault.touched.filter((row) => row[0] === "create" && row[1] === "ZETA/PERMANENT/task15-production.md").length, 1);
  const retried = await hub.dispatchLlmWikiAction({ action: "retry_follow_up", follow_up: "git" });
  const expectedRetriedFollowUp = {
    status: "failed",
    refresh: { status: "succeeded", attempts: 1, reason: null },
    git: { status: "failed", attempts: 2, reason: "GitUnavailable" },
  };
  assert.deepEqual(JSON.parse(JSON.stringify(retried.follow_up)), expectedRetriedFollowUp);
  assert.equal(result.app.vault.touched.filter((row) => row[0] === "create" && row[1] === "ZETA/PERMANENT/task15-production.md").length, 1, "Git retry must not repeat the canonical write");
  assert.equal(result.app.vault.touched.some((row) => String(row[1]).includes("llmwiki-operation-outcomes/")), true);
  const persisted = JSON.parse(await result.app.vault.read(result.app.vault.getAbstractFileByPath(`SYSTEM/PRIVATE/llmwiki-operation-outcomes/${packet.run_id}.json`)));
  assert.equal(persisted.outcome_version, "llmwiki_operation_run_outcome_v1");
  assert.equal(persisted.status, "committed");
  assert.deepEqual(persisted.follow_up, expectedRetriedFollowUp);
  await result.app.vault.delete(result.app.vault.getAbstractFileByPath("INBOX/Knowledge/task15.md"));
  await hub.render({
    app: result.app,
    dv: result.window.dv,
    container: result.container,
    obsidian: result.window.obsidian,
    mountContext: { mountGeneration: 2, scope: { track: () => () => {}, dispose: () => true } },
  });
  assert.equal(hub.error, undefined);
  assert.notEqual(result.app.vault.getAbstractFileByPath(`SYSTEM/PRIVATE/llmwiki-operation-outcomes/${packet.run_id}.json`), null);
  assert.deepEqual(JSON.parse(await result.app.vault.read(result.app.vault.getAbstractFileByPath(`SYSTEM/PRIVATE/llmwiki-operation-outcomes/${packet.run_id}.json`))), persisted);
  const recovered = await hub.llmWikiRunController.recoverOperation({ run_id: packet.run_id });
  assert.equal(recovered.ok, true, JSON.stringify(recovered));
  assert.equal(recovered.canonical_outcome.operation_id, "operation_task15_production");
  assert.deepEqual(JSON.parse(JSON.stringify(recovered.follow_up)), expectedRetriedFollowUp);
});

test("P1 production available gateway snapshots only after immutable eligibility", async () => {
  const snapshots = [];
  const gateway = {
    async capability() { return { ok: true, status: "available" }; },
    async verifySafeSync() { return { ok: true, status: "clean" }; },
    async lookup() { return null; },
    async snapshot(input) {
      snapshots.push(input);
      return { ok: true, receipt: { commit_id: "task15-post-eligibility", paths: input.paths, pushed: false } };
    },
  };
  const existingBytes = "# 기존 제품 지식\\n";
  const result = await productionHub({
    existingBytes,
    extraFiles: { "ZETA/PERMANENT/task15-production.md": existingBytes },
  }, {
    git_gateway: gateway,
  });
  const hub = result.window.KnowledgeExplorerHub;
  const packet = hub.llmWikiRunController.getSnapshot().risk_packets[0];
  const approved = await hub.dispatchLlmWikiAction({ action: "approve_risk", run_id: packet.run_id, run_revision: packet.run_revision, packet_id: packet.packet_id });

  assert.equal(approved.status, "committed");
  assert.equal(approved.compensation.eligible, true);
  assert.equal(snapshots.length, 1);
  assert.deepEqual([...snapshots[0].paths], [
    "ZETA/PERMANENT/task15-production.md",
    `.llmwiki-audit/immutable/${approved.compensation.immutable_audit_hash}.json`,
    ".llmwiki-audit/immutable/head.json",
  ]);
  assert.equal(hub.llmWikiRunController.getOperationSnapshot().follow_up.git.status, "succeeded");
  assert.equal(result.app.vault.touched.some((row) => row[1] === snapshots[0].paths[1]), true);
  assert.equal(result.app.vault.touched.some((row) => row[1] === snapshots[0].paths[2]), true);
});

test("P1 trusted privacy boundary cannot be downgraded by caller labels", () => {
  const boundary = require(path.join(ROOT, "SYSTEM/Views/llmwiki-inbox-privacy-boundary.js"));
  assert.equal(boundary.classifyInboxSource({ source_path: "INBOX/Private/secret.md", privacy_class: "public", route_hint: "knowledge", metadata: { llmwiki_outbound: "allow" } }).outbound_allowed, false);
  assert.equal(boundary.classifyInboxSource({ source_path: "INBOX/People/person.md", privacy_class: "public", route_hint: "knowledge", metadata: {} }).outbound_allowed, false);
  const explicit = boundary.classifyInboxSource({ source_path: "INBOX/People/person.md", metadata: { llmwiki_outbound: "allow" } });
  assert.equal(explicit.outbound_allowed, true);
  assert.deepEqual(explicit.provider_eligibility, ["direct"]);
});

test("P1 Inbox privacy is derived locally and protected/People sources never call outbound", async () => {
  assert.match(MANIFEST, /llmwiki-inbox-privacy-boundary\.js/);
  for (const pathName of ["INBOX/People/person.md", "INBOX/Private/secret.md"]) {
    const result = await runHub({ pages: buildPages(), extraFiles: { [pathName]: "# 보호 자료", "SYSTEM/Views/ai-provider-service.js": providerServiceSource() } });
    const settled = await result.window.KnowledgeExplorerHub.whenKnowledgeInboxSettled();
    assert.equal(settled.state, "protected");
    assert.deepEqual({ eligible: settled.eligible, held: settled.held }, { eligible: 0, held: 1 });
    assert.equal(result.window.__task15ProviderCalls.length, 0);
    assert.equal(result.window.KnowledgeExplorerHub.llmWikiLifecycleSnapshot().inbox.state, "protected");
  }
});

test("P1 failed analysis retry executes the provider again instead of replaying false completion", async () => {
  const result = await productionHub({ failFirst: true });
  const hub = result.window.KnowledgeExplorerHub;
  assert.equal(hub.llmWikiLifecycleSnapshot().inbox.state, "error");
  assert.equal(result.window.__task15ProviderCalls.length, 1);
  const retry = await hub.dispatchLlmWikiAction({ action: "retry_inbox", source_id: hub.llmWikiLifecycleSnapshot().inbox.source_id });
  assert.equal(retry.status, "complete");
  assert.equal(retry.results[0].analysis_runs, 1);
  assert.equal(result.window.__task15ProviderCalls.length, 2);
  assert.equal(hub.llmWikiRunController.getSnapshot().status, "review");
});

test("P2 production Hub Chrome fixture executes the real composition", () => {
  assert.equal(fs.existsSync(path.join(ROOT, "SYSTEM/AI/Skills/prodigy-review/tests/knowledge/fixtures/llmwiki-production-hub-qa.html")), true);
  assert.equal(fs.existsSync(path.join(ROOT, "SYSTEM/AI/Skills/prodigy-review/tests/knowledge/fixtures/run-llmwiki-production-hub-chrome-qa.py")), true);
});

test("P2 lifecycle scene delegates vertical scrolling only to the App Shell", () => {
  assert.match(STYLES, /data-surface="llmwiki-lifecycle"[^}]*overflow-y:\s*visible/s);
  assert.match(HUB, /llmWikiProductionMeasurements/);
});

test("P2 production review selectors have one loaded stylesheet owner", () => {
  assert.doesNotMatch(MANIFEST, /llmwiki-approval-review-view\.js/);
  assert.match(STYLES, /\.llmwiki-approval-review/);
});

test("P2 Home and Auction current non-regression evidence runner exists", () => {
  assert.equal(fs.existsSync(path.join(ROOT, "SYSTEM/AI/Skills/prodigy-review/tests/knowledge/fixtures/run-task15-home-auction-nonregression.py")), true);
});

test("P3 legacy review is absent from production and fallback copy quarantines internal metadata", () => {
  assert.doesNotMatch(MANIFEST, /llmwiki-approval-review-view\.js/);
  assert.doesNotMatch(LEGACY, /createSyntheticApprovalPacket,/);
  assert.doesNotMatch(LEGACY, /field\(fields, "실행 ID"|field\(fields, "제공자"|item\.source_id.*item\.locator/);
});

test("P3 committed product DOM contains no packet, provider, revision, or source identities anywhere", () => {
  const lifecycle = require(path.join(ROOT, "SYSTEM/Views/llmwiki-lifecycle-view.js"));
  const dom = mountRoot();
  lifecycle.mountLlmWikiLifecycleView({
    container: dom.root,
    snapshot: {
      status: "committed", packet_hash: "a".repeat(64), revision: "revision_internal", provider_id: "provider_internal", source_id: "source_internal",
      operation_run: { status: "committed", canonical_outcome: { status: "committed" }, follow_up: { status: "complete", refresh: { status: "succeeded" }, git: { status: "succeeded" } } },
    },
    onAction() {},
  });
  assert.doesNotMatch(serialize(dom.root), /a{64}|revision_internal|provider_internal|source_internal|packet_hash|provider_id/);
});
