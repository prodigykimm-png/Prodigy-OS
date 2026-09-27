"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const ROOT = path.resolve(__dirname, "../../../../../..");
const EXPECTED = require("./fixtures/workspace-manifest-v1.json");

/*
 * Task 7 determination: the frozen fixture is STALE for the auction entry
 * and the live product registry is right. Evidence (kept under the Task 7
 * evidence dir):
 * - all seven required additions exist on disk; the eighth (optional
 *   auction-key-value-snapshot.js) is a gitignored generated artifact that
 *   may legitimately be absent, in which case the loader degrades instead
 *   of blocking (see the graceful-degradation case below);
 * - every required addition defines exactly one branded root global whose
 *   only in-registry consumers evaluate later (site-visit-index@23 ->
 *   region-intelligence-popup-core@37, dong-profile-core@34 ->
 *   auction-region-packet@35, dashboard-refresh@47/key-value-projection@48/
 *   key-value-detail@49/card-view-model@50/card-mutation@59 ->
 *   auction-card@60), and every cross-module read resolves to an earlier
 *   definer or a stable external (Obsidian/DOM), with all runtime access
 *   deferred inside function bodies behind typeof/window guards;
 * - none of the additions uses CommonJS require.
 * Positions below are therefore asserted EXACTLY: module position is
 * semantic (producer before consumer), not cosmetic.
 */
const AUCTION_REQUIRED_INSERTIONS = Object.freeze([
  Object.freeze({ index: 23, path: "SYSTEM/Views/auction-site-visit-index.js", global: "AuctionSiteVisitIndex", consumer: "SYSTEM/Views/region-intelligence-popup-core.js" }),
  Object.freeze({ index: 34, path: "SYSTEM/Views/auction-dong-profile-core.js", global: "AuctionDongProfileCore", consumer: "SYSTEM/Views/auction-region-packet.js" }),
  Object.freeze({ index: 47, path: "SYSTEM/Views/auction-dashboard-refresh.js", global: "AuctionDashboardRefresh", consumer: "SYSTEM/Views/auction-card.js" }),
  Object.freeze({ index: 48, path: "SYSTEM/Views/auction-key-value-projection.js", global: "AuctionKeyValueProjection", consumer: "SYSTEM/Views/auction-card.js" }),
  Object.freeze({ index: 49, path: "SYSTEM/Views/auction-key-value-detail.js", global: "AuctionKeyValueDetail", consumer: "SYSTEM/Views/auction-card.js" }),
  Object.freeze({ index: 50, path: "SYSTEM/Views/auction-card-view-model.js", global: "AuctionCardViewModel", consumer: "SYSTEM/Views/auction-card.js" }),
  Object.freeze({ index: 59, path: "SYSTEM/Views/auction-card-mutation.js", global: "AuctionCardMutation", consumer: "SYSTEM/Views/auction-card.js" }),
]);
const AUCTION_OPTIONAL_PREFIX = Object.freeze(["SYSTEM/Views/auction-key-value-snapshot.js"]);
/*
 * Same Task 7 determination for project: the frozen fixture predates
 * SYSTEM/Views/project-card-mutation.js, which exists on disk, defines
 * root.ProjectCardMutation, and is consumed later by project-card.js
 * (index 22) through deferred runtime access. Position 20 is
 * dependency-correct, so the expectation is updated here, not the product.
 */
const PROJECT_REQUIRED_INSERTIONS = Object.freeze([
  Object.freeze({ index: 20, path: "SYSTEM/Views/project-card-mutation.js", global: "ProjectCardMutation", consumer: "SYSTEM/Views/project-card.js" }),
]);

function withInsertions(frozen, insertions, optionalPrefix = []) {
  const required = [...frozen.required];
  for (const insertion of insertions) required.splice(insertion.index, 0, insertion.path);
  return { ...frozen, required, optional: [...optionalPrefix, ...frozen.optional] };
}

function expectedAuctionEntry() {
  return withInsertions(EXPECTED.entries.auction, AUCTION_REQUIRED_INSERTIONS, AUCTION_OPTIONAL_PREFIX);
}

function expectedProjectEntry() {
  return withInsertions(EXPECTED.entries.project, PROJECT_REQUIRED_INSERTIONS);
}

/*
 * Same Task 7 determination for knowledge, this time a pure reorder: the
 * frozen fixture loads llmwiki-document-canonical-review.js before
 * llmwiki-lifecycle-migration-flows.js, but canonical-review line 17 reads
 * LLMWikiLifecycleMigrationFlows at evaluation time with only a
 * require() fallback that does not exist in the browser closure. The live
 * registry loads migration-flows first (index 186) and canonical-review
 * plus manual-registry immediately after (187/188), which is the
 * dependency-correct side; the fixture is stale. The move is asserted at
 * exact positions.
 */
function expectedKnowledgeEntry() {
  const frozen = EXPECTED.entries.knowledge;
  const moved = [
    "SYSTEM/Views/llmwiki-document-canonical-review.js",
    "SYSTEM/Views/llmwiki-manual-registry.js",
  ];
  const required = frozen.required.filter((entry) => !moved.includes(entry));
  const anchor = "SYSTEM/Views/llmwiki-run-controller.js";
  const at = required.indexOf(anchor);
  assert.notEqual(at, -1, "run-controller anchor must remain in the knowledge manifest");
  required.splice(at, 0, ...moved);
  return { ...frozen, required };
}
const MANIFEST_PATH = path.join(ROOT, "SYSTEM/Views/prodigy-workspace-manifest.js");

function freshManifest() {
  delete require.cache[require.resolve(MANIFEST_PATH)];
  delete global.ProdigyWorkspaceManifest;
  return require(MANIFEST_PATH);
}

const OPERATION_CONTRACT = "SYSTEM/Views/llmwiki-operation-contract.js";
const KNOWLEDGE_KIND_CONTRACT = "SYSTEM/Views/llmwiki-knowledge-kind-contract.js";
const KNOWLEDGE_CANDIDATE_STORE = "SYSTEM/Views/knowledge-candidate-store.js";
const OPERATION_CLASSIFIER = "SYSTEM/Views/llmwiki-operation-classifier.js";
const UI_RECOVERY = "SYSTEM/Views/llmwiki-ui-recovery.js";
const UI_RECOVERY_CONSUMERS = Object.freeze([
  "SYSTEM/Views/llmwiki-ai-runtime-transport.js",
]);
const BATCH_APPROVAL_ADAPTER = "SYSTEM/Views/llmwiki-batch-approval-adapter.js";
const BATCH_APPROVAL_ADAPTER_DEPENDENCIES = Object.freeze([
  "SYSTEM/Views/llmwiki-hash.js",
  "SYSTEM/Views/llmwiki-operation-contract.js",
  "SYSTEM/Views/llmwiki-risk-approval-packet.js",
  "SYSTEM/Views/llmwiki-risk-write-set.js",
  "SYSTEM/Views/llmwiki-safe-batch-approval.js",
  "SYSTEM/Views/llmwiki-approval-review-commit.js",
  "SYSTEM/Views/llmwiki-operation-writer-core.js",
]);
const OPERATION_CONSUMERS = Object.freeze([
  "SYSTEM/Views/llmwiki-proposal-bundle.js",
  "SYSTEM/Views/llmwiki-provider-contract.js",
  "SYSTEM/Views/llmwiki-outbound-consent.js",
  "SYSTEM/Views/llmwiki-canonical-packet.js",
  "SYSTEM/Views/llmwiki-merge-transaction.js",
  "SYSTEM/Views/llmwiki-run-controller.js",
]);

function assertOperationContractOrder(required) {
  const contractIndexes = required.flatMap((entry, index) => entry === OPERATION_CONTRACT ? [index] : []);
  assert.deepEqual(contractIndexes.length, 1, "Knowledge manifest must load exactly one operation contract");
  for (const consumer of OPERATION_CONSUMERS) {
    const consumerIndex = required.indexOf(consumer);
    assert.notEqual(consumerIndex, -1, `${consumer} must remain in the Knowledge manifest`);
    assert.ok(contractIndexes[0] < consumerIndex, `${OPERATION_CONTRACT} must load before ${consumer}`);
  }
}

function assertKnowledgeKindContractOrder(required) {
  const indexes = required.flatMap((entry, index) => entry === KNOWLEDGE_KIND_CONTRACT ? [index] : []);
  assert.equal(indexes.length, 1, "Knowledge manifest must load exactly one knowledge-kind contract");
  assert.ok(required.indexOf(KNOWLEDGE_CANDIDATE_STORE) < indexes[0], "knowledge candidate store must load before knowledge-kind contract");
  assert.ok(indexes[0] < required.indexOf(OPERATION_CLASSIFIER), "knowledge-kind contract must load before operation classifier");
}

function assertUiRecoveryOrder(required) {
  const recoveryIndexes = required.flatMap((entry, index) => entry === UI_RECOVERY ? [index] : []);
  assert.equal(recoveryIndexes.length, 1, "Knowledge manifest must load exactly one UI recovery module");
  for (const consumer of UI_RECOVERY_CONSUMERS) {
    const consumerIndex = required.indexOf(consumer);
    assert.notEqual(consumerIndex, -1, `${consumer} must remain in the Knowledge manifest`);
    assert.ok(recoveryIndexes[0] < consumerIndex, `${UI_RECOVERY} must load before ${consumer}`);
  }
}

function assertBatchApprovalAdapterOrder(required) {
  const adapterIndexes = required.flatMap((entry, index) => entry === BATCH_APPROVAL_ADAPTER ? [index] : []);
  assert.equal(adapterIndexes.length, 1, "Knowledge manifest must load exactly one batch approval adapter");
  for (const dependency of BATCH_APPROVAL_ADAPTER_DEPENDENCIES) {
    const dependencyIndexes = required.flatMap((entry, index) => entry === dependency ? [index] : []);
    assert.equal(dependencyIndexes.length, 1, `${dependency} must remain exactly once in the Knowledge manifest`);
    assert.ok(dependencyIndexes[0] < adapterIndexes[0], `${dependency} must load before ${BATCH_APPROVAL_ADAPTER}`);
  }
}

function instantiateKnowledgeGraph(required) {
  assertOperationContractOrder(required);
  assertKnowledgeKindContractOrder(required);
  assertUiRecoveryOrder(required);
  assertBatchApprovalAdapterOrder(required);
  const browser = {
    console,
    URL,
    TextEncoder,
    TextDecoder,
    setTimeout,
    clearTimeout,
    require: undefined,
    Buffer: undefined,
    process: undefined,
    module: undefined,
  };
  browser.window = browser;
  browser.globalThis = browser;
  vm.createContext(browser);
  for (const relative of required) {
    vm.runInContext(fs.readFileSync(path.join(ROOT, relative), "utf8"), browser, { filename: relative });
  }
  return browser;
}

function exerciseBrandedMergeClosure(browser) {
  return vm.runInContext(`(() => {
    if (typeof require !== "undefined" || typeof Buffer !== "undefined" || typeof process !== "undefined") throw new Error("CommonJS capability leaked into browser closure");
    const destination = "ZETA/PERMANENT/manifest-destination.md";
    const sources = ["ZETA/PERMANENT/manifest-alpha.md", "ZETA/PERMANENT/manifest-beta.md"];
    const before = {
      [destination]: "destination before\\n",
      [sources[0]]: "alpha before\\n",
      [sources[1]]: "beta before\\n",
    };
    const revisions = Object.fromEntries([destination, ...sources].map((target) => [target, LLMWikiHash.sha256(before[target])]));
    const serialized = JSON.stringify({
      contract_version: LLMWikiOperationContract.CONTRACT_VERSION,
      operation_id: "operation_manifest_merge",
      kind: "merge",
      destination_ids: [destination],
      source_ids: sources,
      base_revisions: revisions,
      before_bytes: before,
      after_bytes: { [destination]: "destination after\\n" },
      source_citations: sources.map((source, index) => ({
        source_id: "manifest_evidence_" + (index + 1),
        content_hash: String(index + 1).repeat(64),
        source_url: "https://example.com/manifest/" + (index + 1),
        locators: ["ZETA/LITERATURE/manifest-" + (index + 1) + ".md#claim"],
        source_archive_id: null,
        confidence: "explicit",
      })),
      conflicts: [],
      risk_tier: "high",
      effects: { deprecations: [], supersessions: sources.map((source) => ({
        destination_id: source,
        target_revision: revisions[source],
        before_bytes: before[source],
        replacement_id: destination,
        reason: "manifest_closure_validation",
      })) },
    });
    const parsed = LLMWikiOperationContract.parseOperation(serialized);
    if (!parsed.ok || !LLMWikiOperationContract.isOperationRecord(parsed.value)) throw new Error("manifest operation brand unavailable");
    const assembled = LLMWikiMergeTransaction.assembleMergePacket({
      operation: parsed.value,
      evidence: { contract_version: "llmwiki_evidence_contract_v1", operation_id: parsed.value.operation_id, approval_eligible: true, stale: false, claim_lineage: [{ claim_id: "manifest_claim", citation_ids: ["manifest_citation"] }] },
      provenance: { source_snapshots: sources.map((source, index) => ({ source_id: source, source_revision: revisions[source], extractor_revision: String(index + 4).repeat(64) })) },
      compensation_plan: { strategy: "restore_all_exact_before_state" },
      expires_at: "2099-01-01T00:00:00.000Z",
      nonce: "nonce_manifest_merge_0001",
    });
    if (!assembled.ok || !LLMWikiMergeTransaction.isMergePacket(assembled.value)) throw new Error("manifest merge packet brand unavailable: " + JSON.stringify(assembled));
    const validated = LLMWikiMergeTransaction.verifyMergePacket(assembled.value);
    return { parsed: parsed.ok, operation_branded: LLMWikiOperationContract.isOperationRecord(parsed.value), packet_branded: LLMWikiMergeTransaction.isMergePacket(assembled.value), validation_status: validated.status, write_counts: validated.write_counts };
  })()`, browser);
}

test("the closed registry exactly matches the frozen pre-Task6 workspace contracts", () => {
  const api = freshManifest();
  assert.equal(EXPECTED.schema_version, 1);
  assert.deepEqual(api.all().map((entry) => entry.workspaceId), Object.keys(EXPECTED.entries));
  for (const [workspaceId, expected] of Object.entries(EXPECTED.entries)) {
    const actual = api.get(workspaceId);
    assert.deepEqual(Object.keys(actual), ["workspaceId", "host", "required", "optional", "renderer"]);
    // Auction carries the Task 7 verified additions (fixture is stale there); every other entry must match the freeze byte-for-byte.
    const effective = workspaceId === "auction" ? expectedAuctionEntry() : workspaceId === "project" ? expectedProjectEntry() : workspaceId === "knowledge" ? expectedKnowledgeEntry() : expected;
    assert.deepEqual(JSON.parse(JSON.stringify(actual)), effective, workspaceId);
    assert.equal(Object.isFrozen(actual), true);
    assert.equal(Object.isFrozen(actual.required), true);
    assert.equal(Object.isFrozen(actual.optional), true);
  }
});

function assertInsertionOrder(api, workspaceId, insertions) {
  const required = api.get(workspaceId).required;
  const indexOf = (modulePath) => required.indexOf(modulePath);
  for (const insertion of insertions) {
    assert.equal(indexOf(insertion.path), insertion.index, `${insertion.path} position is semantic`);
    const source = fs.readFileSync(path.join(ROOT, insertion.path), "utf8");
    assert.ok(!source.includes("require("), `${insertion.path} must not use CommonJS`);
    assert.ok(new RegExp(`root\\.${insertion.global}\\s*=`).test(source), `${insertion.path} defines root.${insertion.global}`);
    assert.ok(fs.existsSync(path.join(ROOT, insertion.path)), `${insertion.path} exists on disk`);
    const consumerIndex = indexOf(insertion.consumer);
    assert.notEqual(consumerIndex, -1, `${insertion.consumer} must remain in the auction manifest`);
    assert.ok(insertion.index < consumerIndex, `${insertion.path}@${insertion.index} must load before its consumer ${insertion.consumer}@${consumerIndex}`);
    const consumerSource = fs.readFileSync(path.join(ROOT, insertion.consumer), "utf8");
    assert.ok(consumerSource.includes(insertion.global), `${insertion.consumer} consumes ${insertion.global}`);
  }
}

test("Task 7 auction additions sit at dependency-correct positions without CommonJS", () => {
  assertInsertionOrder(freshManifest(), "auction", AUCTION_REQUIRED_INSERTIONS);
});

test("Task 7 project card-mutation addition sits at a dependency-correct position without CommonJS", () => {
  assertInsertionOrder(freshManifest(), "project", PROJECT_REQUIRED_INSERTIONS);
});

test("Task 7 knowledge canonical-review pair loads after its migration-flows dependency", () => {
  const api = freshManifest();
  const required = api.get("knowledge").required;
  const flows = required.indexOf("SYSTEM/Views/llmwiki-lifecycle-migration-flows.js");
  const review = required.indexOf("SYSTEM/Views/llmwiki-document-canonical-review.js");
  const registry = required.indexOf("SYSTEM/Views/llmwiki-manual-registry.js");
  assert.ok(flows !== -1 && review !== -1 && registry !== -1);
  assert.ok(flows < review && review < registry, "migration-flows -> canonical-review -> manual-registry");
  const source = fs.readFileSync(path.join(ROOT, "SYSTEM/Views/llmwiki-document-canonical-review.js"), "utf8");
  assert.ok(source.includes("LLMWikiLifecycleMigrationFlows"), "canonical-review reads the migration-flows global");
});

test("Task 7 missing optional snapshot degrades readiness instead of blocking it", () => {
  const loaderPath = path.join(ROOT, "SYSTEM/Views/prodigy-hub-loader.js");
  delete require.cache[require.resolve(loaderPath)];
  const loader = require(loaderPath);
  loader.resetLoaded();
  try {
    const api = freshManifest();
    const auction = api.get("auction");
    const files = {};
    for (const modulePath of auction.required.concat(auction.optional)) {
      if (modulePath === "SYSTEM/Views/auction-key-value-snapshot.js") continue;
      files[modulePath] = "";
    }
    const app = {
      vault: {
        getAbstractFileByPath: (modulePath) => Object.hasOwn(files, modulePath) ? { path: modulePath } : null,
        read: (file) => Promise.resolve(files[file.path])
      }
    };
    const result = loader.checkReadiness(app, "auction");
    assert.equal(result.results.auction.ready, true);
    assert.deepEqual(result.results.auction.degradedOptional, ["SYSTEM/Views/auction-key-value-snapshot.js"]);
  } finally {
    loader.resetLoaded();
  }
});

test("registry validation rejects clones, unknown identities, and renderer drift", () => {
  const api = freshManifest();
  const home = api.get("home");
  assert.throws(() => api.validate({ ...home }, { home() {} }), /identity/);
  assert.throws(() => api.validate(home, Object.create({ home() {} })), /renderer/);
  assert.throws(() => api.validate(home, { home: null }), /renderer/);
  assert.throws(() => api.get("region"), /unknown workspaceId/);
});

test("production Knowledge manifest loads the knowledge-kind contract exactly once in dependency order without CommonJS", () => {
  const required = freshManifest().get("knowledge").required;
  const browser = instantiateKnowledgeGraph(required);
  assert.equal(typeof browser.LLMWikiKnowledgeKindContract.parseProposal, "function");
  assert.equal(typeof browser.LLMWikiOperationClassifier.classifyProviderOperation, "function");
});

test("production Knowledge manifest closes the branded merge graph without CommonJS capabilities", () => {
  const required = freshManifest().get("knowledge").required;
  const browser = instantiateKnowledgeGraph(required);
  assert.deepEqual(JSON.parse(JSON.stringify(exerciseBrandedMergeClosure(browser))), {
    parsed: true,
    operation_branded: true,
    packet_branded: true,
    validation_status: "ready",
    write_counts: { canonical: 0, audit: 0, derived: 0, provider: 0, network: 0, git: 0 },
  });
});

test("production Knowledge manifest closes operation orchestration without require, Buffer, or load-order fallback", async () => {
  const browser = instantiateKnowledgeGraph(freshManifest().get("knowledge").required);
  const result = await vm.runInContext(`(() => {
    if (typeof require !== "undefined" || typeof Buffer !== "undefined") throw new Error("CommonJS capability leaked");
    const target = "ZETA/PERMANENT/manifest-noop.md";
    const before = "unchanged\\n";
    const operation = LLMWikiOperationContract.parseOperation(JSON.stringify({
      contract_version: LLMWikiOperationContract.CONTRACT_VERSION,
      operation_id: "operation_manifest_noop", kind: "noop", destination_ids: [target],
      base_revisions: { [target]: LLMWikiHash.sha256(before) }, before_bytes: { [target]: before }, after_bytes: { [target]: before },
      source_citations: [{ source_id: "source_manifest_noop", content_hash: "a".repeat(64), source_url: "https://example.com/noop", locators: ["ZETA/LITERATURE/noop.md#claim"], source_archive_id: null, confidence: "explicit" }],
      conflicts: [], risk_tier: "low", effects: { deprecations: [], supersessions: [] },
    })).value;
    const inert = (kind) => Object.freeze({ kind, prepare: async () => ({ ok: false }), authorize: async () => ({ ok: false }), commit: async () => ({ ok: false }) });
    const service = LLMWikiOperationRunService.createOperationRunService({
      stateApi: LLMWikiOperationRunState, operationApi: LLMWikiOperationContract,
      approvalCallbacks: LLMWikiOperationApprovalCallback.create(),
      commandBindings: LLMWikiOperationCommandBinding.create(),
      followUpGuard: LLMWikiOperationFollowUpGuard.create(),
      outcomePersistence: LLMWikiOperationOutcomePersistence.create(),
      runCommandsApi: LLMWikiOperationRunCommands,
      followUpRunnerApi: LLMWikiOperationFollowUpRunner,
      runApprovalApi: LLMWikiOperationRunApproval,
      services: { create: inert("create"), update: inert("update"), merge: inert("merge"), noop: LLMWikiNoopOperationService.create({ operationApi: LLMWikiOperationContract }) },
      provider: async () => operation,
    });
    return service.start({ run_id: "run_manifest_noop" });
  })()`, browser);
  assert.deepEqual(JSON.parse(JSON.stringify(result)), {
    ok: true, status: "no_change", run_id: "run_manifest_noop", run_revision: 1,
    audit: { audit_version: "llmwiki_noop_run_audit_v1", result: "no_change", operation_id: "operation_manifest_noop", reason: "canonical_bytes_identical" },
    write_counts: { canonical: 0, audit: 0, refresh: 0, git: 0 },
    counters: { provider: 1, prepare: 1, approval: 0, approval_callback_audit: 0, command_audit: 0, follow_up_entry_audit: 0, commit: 0, canonical: 0, audit: 0, refresh: 0, git: 0, ui: 0, ignored_results: 0 },
  });
});

test("Knowledge recovery omission and placement after a dependent fail before browser mount", () => {
  const required = [...freshManifest().get("knowledge").required];
  assertUiRecoveryOrder(required);

  const withoutRecovery = required.filter((entry) => entry !== UI_RECOVERY);
  assert.throws(() => instantiateKnowledgeGraph(withoutRecovery), /exactly one UI recovery module/);

  const lateRecovery = withoutRecovery.slice();
  lateRecovery.splice(lateRecovery.indexOf("SYSTEM/Views/llmwiki-ai-runtime-transport.js") + 1, 0, UI_RECOVERY);
  assert.throws(() => instantiateKnowledgeGraph(lateRecovery), /must load before SYSTEM\/Views\/llmwiki-ai-runtime-transport\.js/);
});

test("Knowledge knowledge-kind contract omission, duplication, and late placement are RED", () => {
  const required = [...freshManifest().get("knowledge").required];
  const without = required.filter((entry) => entry !== KNOWLEDGE_KIND_CONTRACT);
  assert.throws(() => instantiateKnowledgeGraph(without), /exactly one knowledge-kind contract/);
  assert.throws(() => instantiateKnowledgeGraph([...required, KNOWLEDGE_KIND_CONTRACT]), /exactly one knowledge-kind contract|duplicate/);
  const late = [...without];
  late.splice(late.indexOf(OPERATION_CLASSIFIER) + 1, 0, KNOWLEDGE_KIND_CONTRACT);
  assert.throws(() => instantiateKnowledgeGraph(late), /must load before operation classifier/);
});

test("Knowledge operation-contract omission and placement after a consumer are RED", () => {
  const required = [...freshManifest().get("knowledge").required];
  const withoutContract = required.filter((entry) => entry !== OPERATION_CONTRACT);
  assert.throws(() => instantiateKnowledgeGraph(withoutContract), /exactly one operation contract/);

  const lateContract = withoutContract.slice();
  lateContract.splice(lateContract.indexOf("SYSTEM/Views/llmwiki-merge-transaction.js") + 1, 0, OPERATION_CONTRACT);
  assert.throws(() => instantiateKnowledgeGraph(lateContract), /must load before SYSTEM\/Views\/llmwiki-proposal-bundle\.js/);
});

test("Knowledge batch approval adapter follows every captured retained dependency without CommonJS fallback", () => {
  const required = [...freshManifest().get("knowledge").required];
  assertBatchApprovalAdapterOrder(required);

  for (const dependency of BATCH_APPROVAL_ADAPTER_DEPENDENCIES) {
    const reordered = required.filter((entry) => entry !== dependency);
    reordered.splice(reordered.indexOf(BATCH_APPROVAL_ADAPTER) + 1, 0, dependency);
    assert.throws(() => assertBatchApprovalAdapterOrder(reordered), new RegExp(`${dependency.replace(/[.*+?^${}()|[\\]\\]/g, "\\$&")} must load before`));
  }
});
