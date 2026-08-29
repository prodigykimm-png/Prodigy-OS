"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
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

// Task 11 repoint: the provider override speaks the single compact batch
// schema; analysis is an explicit user action (analyze_inbox), never a mount
// or scan side effect.
function providerServiceSource({ failFirst = false, invalidKind = false } = {}) {
  const extraField = invalidKind ? `,destination:"ZETA/PERMANENT/forged.md"` : "";
  return [
    "(function(root){root.__task15ProviderCalls=[];",
    "root.AIProviderService=Object.freeze({async requestStructuredJsonOnce(request){",
    "root.__task15ProviderCalls.push(request);",
    `if(${failFirst}&&root.__task15ProviderCalls.length<=1)return {status:"invalid"};`,
    "const prompt=JSON.parse(request.prompt);",
    "return {status:\"ok\",results:prompt.chunks.map((chunk)=>({chunk_key:chunk.key,outcome:\"proposals\",",
    `items:[{role:\"source_summary\",evidence_quote:chunk.text.trim().slice(0,6),claims:[\"실제 Hub 제품 지식\"],review_reasons:[],related_candidate_ids:[]${extraField}}]}))};`,
    "}})})(globalThis);",
  ].join("");
}

function allPhasesRolloutStorage() {
  const phases = ["create", "update", "merge", "maintenance", "git", "resurfacing"];
  const rolloutState = JSON.stringify({ version: "llmwiki_rollout_state_v1", enabled_phases: phases, gate_receipts: Object.fromEntries(phases.map((phase) => [phase, { available: true, status: "green", receipt_id: `task15-${phase}-gate` }])) });
  return { async load() { return rolloutState; }, async save() { return true; } };
}

async function productionHub(options = {}, llmWikiControllerOptions = {}) {
  const extraFiles = { "INBOX/Knowledge/task15.md": "# 제품 자료\\n\\n검토할 근거입니다.\\n", "SYSTEM/Views/ai-provider-service.js": providerServiceSource(options), ...(options.extraFiles || {}) };
  const rollout_storage = llmWikiControllerOptions.rollout_storage || allPhasesRolloutStorage();
  let inboxLocalIdentityIndex = llmWikiControllerOptions.inboxLocalIdentityIndex;
  if (typeof options.existingBytes === "string") {
    const hash = require(path.join(ROOT, "SYSTEM/Views/llmwiki-hash.js"));
    const scopeApi = require(path.join(ROOT, "SYSTEM/Views/llmwiki-analysis-scope.js"));
    const manifestApi = require(path.join(ROOT, "SYSTEM/Views/llmwiki-chunk-manifest.js"));
    const sourceText = extraFiles["INBOX/Knowledge/task15.md"];
    const sourcePath = "INBOX/Knowledge/task15.md";
    const sourceId = `source_${hash.sha256(sourcePath).slice(0, 24)}`;
    const contentHash = hash.sha256(sourceText);
    const scope = scopeApi.createAnalysisScope({ source_id: sourceId, source_path: sourcePath, content_hash: contentHash, source_text: sourceText });
    const chunk = manifestApi.createChunkManifest(scope).chunks[0];
    inboxLocalIdentityIndex = [{ identity_id: "knowledge_task15_existing", identity_key: `identity_${chunk.semantic_id.replace(/^semantic_/u, "")}`, content_hash: hash.sha256(options.existingBytes), revision: hash.sha256(options.existingBytes), path: "ZETA/PERMANENT/task15-production.md", before_bytes: options.existingBytes }];
  }
  const result = await runHub({ pages: buildPages(), extraFiles, llmWikiControllerOptions: { rollout_storage, inboxLocalIdentityIndex, ...llmWikiControllerOptions } });
  await result.window.KnowledgeExplorerHub.whenKnowledgeInboxSettled();
  // Task 11 contract: analysis is explicit and bounded.
  const analyzed = await result.window.KnowledgeExplorerHub.dispatchLlmWikiAction({ action: "analyze_inbox" });
  result.__analyzed = analyzed;
  return result;
}

test("P1 unavailable production provider fails visibly and typed without a network or key assumption", async () => {
  const result = await runHub({ pages: buildPages(), extraFiles: { "INBOX/Knowledge/unavailable.md": "# 로컬 자료", "SYSTEM/Views/ai-provider-service.js": "globalThis.AIProviderService=Object.freeze({});" } });
  const settled = await result.window.KnowledgeExplorerHub.whenKnowledgeInboxSettled();
  assert.equal(settled.state, "queued");
  const analyzed = await result.window.KnowledgeExplorerHub.dispatchLlmWikiAction({ action: "analyze_inbox" });
  assert.equal(analyzed.ok, false);
  assert.equal(analyzed.reason, "transport_unavailable");
  assert.equal(result.window.KnowledgeExplorerHub.llmWikiRunController.getOperationSnapshot().status, "idle");
  assert.equal(result.app.vault.touched.some((row) => String(row[1]).startsWith("ZETA/PERMANENT/")), false);
});

test("P1 provider authority fields fail before review and permanent writes", async () => {
  const result = await productionHub({ invalidKind: true });
  assert.equal(result.window.__task15ProviderCalls.length, 1);
  assert.notEqual(result.window.KnowledgeExplorerHub.llmWikiRunController.getSnapshot().status, "review");
  assert.equal(result.window.KnowledgeExplorerHub.llmWikiLifecycleSnapshot().inbox.reason, "forbidden_authority");
  assert.equal(result.app.vault.touched.some((row) => String(row[1]).startsWith("ZETA/PERMANENT/")), false);
});

test("P1 canonical batch provider reaches review without controller test options", async () => {
  assert.match(MANIFEST, /llmwiki-batch-provider\.js/);
  const result = await productionHub();
  assert.equal(result.window.__task15ProviderCalls.length, 1);
  assert.equal(result.window.KnowledgeExplorerHub.llmWikiRunController.getSnapshot().status, "review");
  assert.match(result.window.KnowledgeExplorerHub.llmWikiRunController.getOperationSnapshot().operation_id, /^operation_[0-9a-f]{24}$/u);
  assert.equal(result.app.vault.touched.some((row) => String(row[1]).startsWith("ZETA/PERMANENT/")), false);
});

test("P1 risk approval commits once through Task13 and persists exact follow-up truth", async () => {
  assert.match(RUNNER, /approvePreparedRisk/);
  assert.match(RISK, /commitRun/);
  const result = await productionHub();
  const hub = result.window.KnowledgeExplorerHub;
  const packet = hub.llmWikiRunController.getSnapshot().risk_packets[0];
  const targetPath = packet.operation.destination_ids[0];
  const approved = await hub.dispatchLlmWikiAction({ action: "approve_risk", run_id: packet.run_id, run_revision: packet.run_revision, packet_id: packet.packet_id });
  assert.equal(approved.status, "committed");
  const operation = hub.llmWikiRunController.getOperationSnapshot();
  assert.equal(operation.status, "committed");
  assert.equal(operation.canonical_outcome.operation_id, packet.operation.operation_id);
  const expectedInitialFollowUp = {
    status: "failed",
    refresh: { status: "succeeded", attempts: 1, reason: null },
    git: { status: "failed", attempts: 1, reason: "GitUnavailable" },
  };
  assert.deepEqual(JSON.parse(JSON.stringify(operation.follow_up)), expectedInitialFollowUp);
  assert.equal(result.app.vault.touched.filter((row) => row[0] === "create" && row[1] === targetPath).length, 1);
  const duplicate = await hub.dispatchLlmWikiAction({ action: "approve_risk", run_id: packet.run_id, run_revision: packet.run_revision, packet_id: packet.packet_id });
  assert.equal(duplicate.reason, "stale_risk_action");
  assert.equal(result.app.vault.touched.filter((row) => row[0] === "create" && row[1] === targetPath).length, 1);
  const retried = await hub.dispatchLlmWikiAction({ action: "retry_follow_up", follow_up: "git" });
  const expectedRetriedFollowUp = {
    status: "failed",
    refresh: { status: "succeeded", attempts: 1, reason: null },
    git: { status: "failed", attempts: 2, reason: "GitUnavailable" },
  };
  assert.deepEqual(JSON.parse(JSON.stringify(retried.follow_up)), expectedRetriedFollowUp);
  assert.equal(result.app.vault.touched.filter((row) => row[0] === "create" && row[1] === targetPath).length, 1, "Git retry must not repeat the canonical write");
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
  assert.equal(recovered.canonical_outcome.operation_id, packet.operation.operation_id);
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
  const existingBytes = "# 기존 제품 지식\n";
  // Task 11 repoint: PERMANENT updates are not minted by the batch core; the
  // typed update enters through the production risk-review API so the retained
  // compensation/git eligibility authorities stay under test.
  const { operation } = require("./llmwiki_real_product_fixtures.js");
  const targetPath = "ZETA/PERMANENT/task15-production.md";
  const afterBytes = "# 승인된 제품 지식\n";
  const result = await runHub({
    pages: buildPages(),
    extraFiles: { [targetPath]: existingBytes },
    llmWikiControllerOptions: { git_gateway: gateway, rollout_storage: allPhasesRolloutStorage() },
  });
  await result.window.KnowledgeExplorerHub.whenKnowledgeInboxSettled();
  const parsed = result.window.LLMWikiOperationContract.parseOperation(JSON.stringify(operation("update", "production", {
    operation_id: "operation_task15_production_update",
    destination_ids: [targetPath],
    base_revisions: { [targetPath]: require("node:crypto").createHash("sha256").update(existingBytes).digest("hex") },
    before_bytes: { [targetPath]: existingBytes },
    after_bytes: { [targetPath]: afterBytes },
    source_citations: [{ source_id: "source_task15", content_hash: require("node:crypto").createHash("sha256").update(existingBytes).digest("hex"), source_url: null, locators: ["INBOX/Knowledge/task15.md"], source_archive_id: null, confidence: "explicit" }],
  })));
  assert.equal(parsed.ok, true, JSON.stringify(parsed));
  const opened = result.window.KnowledgeExplorerHub.llmWikiRunController.openPreparedRiskReview({ run_id: "run_task15_production_update", proposals: [{ operation: parsed.value, title: "승인된 제품 지식" }] });
  assert.equal(opened.ok, true, JSON.stringify(opened));
  void existingBytes;
  const hub = result.window.KnowledgeExplorerHub;
  const packet = hub.llmWikiRunController.getSnapshot().risk_packets?.[0];
  assert.ok(packet, JSON.stringify(hub.llmWikiLifecycleSnapshot()));
  const approved = await hub.dispatchLlmWikiAction({ action: "approve_risk", run_id: packet.run_id, run_revision: packet.run_revision, packet_id: packet.packet_id });

  assert.equal(approved.status, "committed");
  assert.equal(approved.compensation.eligible, true, JSON.stringify(approved));
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
  assert.equal(hub.llmWikiLifecycleSnapshot().inbox.state, "blocked");
  assert.equal(result.window.__task15ProviderCalls.length, 1);
  // Explicit 다시 분석 re-enters the blocked job exactly once.
  const retry = await hub.dispatchLlmWikiAction({ action: "retry_inbox" });
  assert.equal(retry.status, "complete");
  assert.equal(result.window.__task15ProviderCalls.length, 2);
  assert.equal(hub.llmWikiRunController.getSnapshot().status, "review");
});

test("P1 retry lifecycle actions dispatch explicit retry runs without fallback", async () => {
  assert.match(HUB, /if \(intent\.action === "analyze_inbox"\) return runInboxBatch\(\);/);
  assert.match(HUB, /if \(\["retry_inbox", "retry_analysis"\]\.includes\(intent\.action\)\) return runInboxBatch\(\{ explicitRetry: true \}\);/);
  assert.doesNotMatch(HUB, /if \(intent\.action === "analyze_inbox"\)[\\s\\S]{0,120}force_reanalyze_inbox/);
  for (const action of ["retry_analysis", "retry_inbox"]) {
    const result = await productionHub({ failFirst: true });
    const retried = await result.window.KnowledgeExplorerHub.dispatchLlmWikiAction({ action });
    assert.equal(retried.ok, true, JSON.stringify(retried));
    assert.equal(result.window.__task15ProviderCalls.length, 2);
  }
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
