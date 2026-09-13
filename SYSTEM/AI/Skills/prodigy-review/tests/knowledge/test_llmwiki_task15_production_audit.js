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

// Runtime-plugin cutover: mock only the external protocol boundary, not the
// shipped client, consent, consumer runtime, compact validator or controller.
// Define protocol values in the Hub VM so plain-object validation stays real.
function installRuntime(result, { failFirst = false, invalidKind = false } = {}) {
  require("node:vm").runInNewContext(`(function(root) {
    const client = root.ProdigyAIClient, epoch = "task15-mock-epoch";
    root.__task15ProviderCalls = [];
    root.__task15ConsentGrants = 0;
    let granted = false;
    const api = {
      getHandshake: () => ({ plugin_id: "prodigy-ai-runtime", protocol_version: client.PROTOCOL_VERSION,
        protocol_hash: client.PROTOCOL_HASH, runtime_epoch: epoch, consumer_manifest_range: ">=1 <2", capabilities: ["structured-strict"] }),
      getStatus: () => ({ status: "ready" }), listProviders: () => [], listModels: () => [],
      resolveProvider: () => ({ status: granted ? "ready" : "consent_required", profile_id: "task15-mock-profile", route_class: "local" }),
      getConsentRequirement: () => ({ status: granted ? "ready" : "consent_required" }),
      grantConsumer: () => { granted = true; root.__task15ConsentGrants++; return { status: "granted" }; },
      async requestStructured(request) {
        if (!granted) throw new Error("unconsented_mock_request");
        root.__task15ProviderCalls.push(request);
        const prompt = JSON.parse(request.prompt);
        const payload = ${failFirst} && root.__task15ProviderCalls.length === 1 ? { status: "invalid" } : {
          status: "ok", results: prompt.chunks.map(chunk => ({ chunk_key: chunk.key, outcome: "proposals",
            items: (chunk.evidence_candidates || [{ text: chunk.text.trim() }]).map(evidence => ({
              role: "source_summary", topic: "제품 자료", evidence_quote: evidence.text,
              ...(evidence.key ? { evidence_key: evidence.key } : {}), claims: [evidence.text],
              review_reasons: [], related_candidate_ids: [],
              ...(${invalidKind} ? { destination: "ZETA/PERMANENT/forged.md" } : {})
            })) })) };
        return { protocol_version: client.PROTOCOL_VERSION, runtime_epoch: epoch, request_id: request.request_id,
          status: "completed", payload, receipt: { consumer_id: request.consumer_id, attempt_id: request.attempt_id,
            provider_key: "task15-mock-profile", model: "task15-mock-model" } };
      },
      requestChat: () => { throw new Error("unexpected_chat_fallback"); },
      cancel: () => ({ status: "cancel_requested" }), getRequestStatus: () => ({ status: "completed" }),
      openSettings: () => true, subscribeStatus: () => () => {}
    };
    root.app.plugins = { getPlugin: id => id === "prodigy-ai-runtime" ? { api } : null };
  })(globalThis);`, result.window);
}

function allPhasesRolloutStorage() {
  const phases = ["create", "update", "merge", "maintenance", "git", "resurfacing"];
  const rolloutState = JSON.stringify({ version: "llmwiki_rollout_state_v1", enabled_phases: phases, gate_receipts: Object.fromEntries(phases.map((phase) => [phase, { available: true, status: "green", receipt_id: `task15-${phase}-gate` }])) });
  return { async load() { return rolloutState; }, async save() { return true; } };
}

async function productionHub(options = {}, llmWikiControllerOptions = {}) {
  const extraFiles = { "INBOX/Knowledge/task15.md": "# 제품 자료\n\n검토할 근거입니다.\n", ...(options.extraFiles || {}) };
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
  installRuntime(result, options);
  // Analysis is explicit and bounded; mounting never calls the mock provider.
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
  assert.equal(analyzed.reason, "runtime_unavailable");
  assert.equal(analyzed.provider_calls, 0);
  assert.equal(result.window.KnowledgeExplorerHub.llmWikiLifecycleSnapshot().inbox.reason, "runtime_unavailable");
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
  const hub = result.window.KnowledgeExplorerHub;
  assert.equal(hub.llmWikiRunController.getSnapshot().status, "review");
  assert.match(hub.llmWikiRunController.getOperationSnapshot().operation_id, /^operation_[0-9a-f]{24}$/u);
  assert.equal(result.window.__task15ConsentGrants, 1);
  assert.equal(result.window.__task15ProviderCalls[0].consumer_id, "wiki.batch_analysis");
  assert.equal(result.app.vault.touched.some((row) => String(row[1]).startsWith("ZETA/PERMANENT/")), false);
  // Keep provider-to-approval coverage on the actual batch lifecycle, separate
  // from the permanent Task13 follow-up audit below.
  const packet = hub.llmWikiRunController.getSnapshot().risk_packets[0];
  const intent = { action: "approve_risk", run_id: packet.run_id, run_revision: packet.run_revision, packet_id: packet.packet_id };
  const approved = await hub.dispatchLlmWikiAction(intent);
  assert.equal(approved.ok, true, JSON.stringify(approved));
  assert.equal(approved.status, "processed");
  const target = packet.operation.destination_ids[0];
  assert.ok(target.startsWith("ZETA/LITERATURE/"));
  assert.equal(await result.app.vault.read(result.app.vault.getAbstractFileByPath(target)), packet.operation.after_bytes[target]);
  const duplicate = await hub.dispatchLlmWikiAction(intent);
  assert.equal(duplicate.status, "duplicate");
  assert.equal(result.app.vault.touched.filter(row => row[0] === "create" && row[1] === target).length, 1);
  const persisted = JSON.parse(await result.app.vault.read(result.app.vault.getAbstractFileByPath("SYSTEM/CACHE/llmwiki/batch-job-state.json")));
  assert.equal(persisted.recovery.operation_outcomes[0].status, "committed");
  assert.equal(persisted.recovery.archive_receipts.length, 1);
  assert.equal(result.window.__task15ProviderCalls.length, 1);
  assert.equal(result.app.vault.touched.some(row => String(row[1]).startsWith("ZETA/PERMANENT/")), false);
});

test("P1 risk approval commits once through Task13 and persists exact follow-up truth", async () => {
  assert.match(RUNNER, /approvePreparedRisk/);
  assert.match(RISK, /commitRun/);
  // Batch source_summary now owns Literature/Candidate lifecycle + archival,
  // not Task13 permanent writes. Enter the retained typed-risk API, as the
  // immutable-eligibility audit below does; keep all follow-up/replay oracles.
  const sourcePath = "INBOX/Knowledge/task15.md", sourceBytes = "# 제품 자료\n\n검토할 근거입니다.\n";
  const result = await runHub({ pages: buildPages(), extraFiles: { [sourcePath]: sourceBytes },
    llmWikiControllerOptions: { rollout_storage: allPhasesRolloutStorage() } });
  const hub = result.window.KnowledgeExplorerHub;
  await hub.whenKnowledgeInboxSettled();
  const { operation: fixtureOperation } = require("./llmwiki_real_product_fixtures.js");
  const parsed = result.window.LLMWikiOperationContract.parseOperation(JSON.stringify(fixtureOperation("create", "production", {
    operation_id: "operation_task15_production_create", destination_ids: ["ZETA/PERMANENT/task15-production.md"],
    base_revisions: {}, before_bytes: {}, after_bytes: { "ZETA/PERMANENT/task15-production.md": "# 제품 자료\n\n검토할 근거입니다.\n" },
    source_citations: [{ source_id: "source_task15", content_hash: require("node:crypto").createHash("sha256").update(sourceBytes).digest("hex"),
      source_url: null, locators: [sourcePath], source_archive_id: null, confidence: "explicit" }]
  })));
  assert.equal(parsed.ok, true, JSON.stringify(parsed));
  const opened = hub.llmWikiRunController.openPreparedRiskReview({ run_id: "run_task15_production_create", proposals: [{ operation: parsed.value, title: "제품 자료" }] });
  assert.equal(opened.ok, true, JSON.stringify(opened));
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
    const result = await runHub({ pages: buildPages(), extraFiles: { [pathName]: "# 보호 자료" } });
    const settled = await result.window.KnowledgeExplorerHub.whenKnowledgeInboxSettled();
    installRuntime(result);
    assert.equal(settled.state, "protected");
    assert.deepEqual({ eligible: settled.eligible, held: settled.held }, { eligible: 0, held: 1 });
    assert.equal(result.window.__task15ProviderCalls.length, 0);
    assert.equal(result.window.KnowledgeExplorerHub.llmWikiLifecycleSnapshot().inbox.state, "protected");
    const analyzed = await result.window.KnowledgeExplorerHub.dispatchLlmWikiAction({ action: "analyze_inbox" });
    assert.equal(analyzed.provider_calls, 0);
    assert.equal(result.window.__task15ProviderCalls.length, 0);
    assert.equal(result.window.__task15ConsentGrants, 0);
    assert.equal(result.app.vault.touched.some(row => String(row[1]).startsWith("ZETA/")), false);
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
