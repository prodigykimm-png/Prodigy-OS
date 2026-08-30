"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { test } = require("node:test");

const ROOT = path.resolve(__dirname, "../../../../../..");
global.window = global.window || global;
const approval = require(path.join(ROOT, "SYSTEM/Views/llmwiki-approval-packet.js"));
const commit = require(path.join(ROOT, "SYSTEM/Views/llmwiki-deterministic-commit.js"));
const operationContract = require(path.join(ROOT, "SYSTEM/Views/llmwiki-operation-contract.js"));
const canonicalPacket = require(path.join(ROOT, "SYSTEM/Views/llmwiki-canonical-packet.js"));
const reviewCommit = require(path.join(ROOT, "SYSTEM/Views/llmwiki-approval-review-commit.js"));
const fixtures = require("./llmwiki_proposal_fixtures.js");
const { FakeElement, collectText } = require("./knowledge_explorer_view_fakes.js");
const { buildPages, firstElement, runHub } = require("./knowledge_hub_integration_harness.js");
const adapter = require(path.join(ROOT, "SYSTEM/Views/knowledge-explorer-hub-adapter.js"));
const review = require(path.join(ROOT, "SYSTEM/Views/llmwiki-approval-review-view.js"));
const HASH_SOURCE = fs.readFileSync(path.join(ROOT, "SYSTEM/Views/llmwiki-hash.js"), "utf8");
const DETERMINISTIC_COMMIT_SOURCE = fs.readFileSync(path.join(ROOT, "SYSTEM/Views/llmwiki-deterministic-commit.js"), "utf8");

function walk(node, predicate, hits = []) {
  if (!node) return hits;
  if (predicate(node)) hits.push(node);
  for (const child of node.children || []) walk(child, predicate, hits);
  return hits;
}

function control(root, action) {
  return walk(root, (node) => node.attr && node.attr["data-action"] === action)[0] || null;
}

function click(node) {
  assert.ok(node && typeof node.onclick === "function", "expected an actionable control");
  node.onclick({ preventDefault() {} });
}

async function packetFixture({ resolvedConflicts = false, conflictOnCreate = false, runId = "run_proposal_todo14_review" } = {}) {
  const result = await fixtures.proposalEnvelope({ run_id: runId }, (response) => {
    if (resolvedConflicts) response.proposal_bundle.proposals[3].conflicts[0].status = "disputed";
    if (conflictOnCreate) response.proposal_bundle.proposals[0].conflicts = [{
      conflict_id: "create_claim_conflict",
      status: "unresolved",
      claims: ["create claim A", "create claim B"],
      source_ids: ["source_related_alpha"],
    }];
  });
  assert.equal(result.ok, true, JSON.stringify(result));
  const built = approval.buildApprovalPacket(result.value);
  assert.equal(built.ok, true, JSON.stringify(built));
  return built.value;
}

function operation(packet, kind) {
  return packet.operations.find((item) => item.proposal_kind === kind);
}

function liveCommitAdapter() {
  const files = new Map();
  const receipts = new Map();
  const calls = [];
  const adapter = {
    readBytes(targetPath) { return files.has(targetPath) ? files.get(targetPath) : null; },
    readReceipt(nonce) { return receipts.has(nonce) ? JSON.parse(JSON.stringify(receipts.get(nonce))) : null; },
    commitExact(payload) {
      calls.push(JSON.parse(JSON.stringify(payload)));
      files.set(payload.target_path, payload.after_bytes);
      receipts.set(payload.nonce, JSON.parse(JSON.stringify(payload.audit)));
      return { ok: true, status: "committed" };
    },
  };
  return { adapter, files, receipts, calls };
}

function canonicalOperation(create) {
  const serialized = JSON.stringify({
    operation_id: create.operation_id,
    proposal_id: create.proposal_id,
    proposal_kind: "create",
    payload_hash: create.payload_hash,
  });
  const parsed = operationContract.parseCanonicalOperation(serialized);
  assert.equal(parsed.ok, true, JSON.stringify(parsed));
  assert.equal(operationContract.isCanonicalOperationRecord(parsed.value), true);
  assert.equal(operationContract.isCanonicalPacketOperationRecord(parsed.value), false);
  return { operation: parsed.value, serialized };
}

function canonicalRequest(approvalPacket, create, operationRecord) {
  const reviewed = create.reviewed_payload;
  const statement = reviewed.claims[0].text;
  return {
    run_id: approvalPacket.run_id,
    consent_hash: "c".repeat(64),
    operation: operationRecord,
    canonical_document: {
      title: reviewed.title,
      statement,
      knowledge_domain: "reading",
      knowledge_topics: [],
      application_trigger: "",
      application_contexts: [],
      connections: [],
      invalidation_conditions: [],
      summary: "",
      created: "2026-08-02T00:00:00.000Z",
      updated: "2026-08-02T00:00:00.000Z",
      body: `# ${reviewed.title}\n\n${statement}\n`,
    },
    source_citations: create.source_citations,
    expires_at: "2099-01-01T00:00:00.000Z",
    nonce: `nonce_review_${approvalPacket.packet_hash.slice(0, 24)}`,
  };
}

async function packetBoundCommitFixtures(packets) {
  const contexts = new Map();
  for (const approvalPacket of packets) {
    const create = operation(approvalPacket, "create");
    const canonical = canonicalOperation(create);
    const unbrandedControls = [
      ["raw", JSON.parse(canonical.serialized)],
      ["spread", { ...canonical.operation }],
      ["copied", Object.assign({}, canonical.operation)],
      ["unbranded", JSON.parse(JSON.stringify(canonical.operation))],
    ];
    for (const [name, operationRecord] of unbrandedControls) {
      const rejectedLive = liveCommitAdapter();
      const rejected = await canonicalPacket.assembleCanonicalPacket(
        canonicalRequest(approvalPacket, create, operationRecord),
        rejectedLive.adapter,
      );
      assert.equal(rejected.ok, false, name);
      assert.equal(rejected.reason, "serialized_operation_required", name);
      assert.equal(rejectedLive.calls.length, 0, `${name}: writerCalls`);
      assert.equal(rejectedLive.files.size, 0, `${name}: canonical writes`);
      assert.equal(rejectedLive.receipts.size, 0, `${name}: audit writes`);
    }

    const live = liveCommitAdapter();
    const assembled = await canonicalPacket.assembleCanonicalPacket(
      canonicalRequest(approvalPacket, create, canonical.operation),
      live.adapter,
    );
    assert.equal(assembled.ok, true, JSON.stringify(assembled));
    assert.equal(operationContract.isCanonicalPacketOperationRecord(assembled.value.operation), true);
    const packetOperation = assembled.value.operation;
    const authorized = reviewCommit.authorizeCanonicalPacket(assembled.value, {
      action: "approve_selected",
      selection_ids: [create.operation_id],
    });
    assert.equal(authorized.ok, true, JSON.stringify(authorized));
    assert.strictEqual(assembled.value.operation, packetOperation, "authorization must preserve the parser-owned packet operation brand");
    assert.equal(operationContract.isCanonicalPacketOperationRecord(assembled.value.operation), true);
    contexts.set(approvalPacket.packet_hash, { packet: assembled.value, authorization: authorized.value, live, operation: create });
  }
  return {
    contexts,
    build({ packet, authorizationResult }) {
      const context = contexts.get(packet.packet_hash);
      assert.ok(context, "approval packet must have one preassembled canonical packet fixture");
      assert.deepEqual(JSON.parse(JSON.stringify(authorizationResult.selection_set)), [context.operation.operation_id]);
      return reviewCommit.buildCommitRequest({
        packet: context.packet,
        authorization: context.authorization,
        adapter: context.live.adapter,
      });
    },
  };
}

test("Given a run-scoped packet, When the Hub review opens, Then Korean fields and final actions are observable", async () => {
  const packet = await packetFixture();
  const root = new FakeElement("section");
  const opened = [];
  const edited = [];
  const surface = review.mountLlmWikiApprovalReview({
    container: root,
    packet,
    approvalApi: approval,
    commitApi: commit,
    onOpenBeside: (locator) => opened.push(locator),
    onEditSource: (preview) => edited.push(preview),
    resolveSourcePreview: (item) => ({ ok: true, status: "current", match_status: "unique", source_path: String(item.locator).split("#")[0], evidence_quote: "합성 근거", context: "앞 문장\n합성 근거\n뒤 문장", position: { line: 4, ch: 2 } }),
    commitOptions: { preview: true },
  });
  const before = JSON.stringify(packet);

  assert.match(collectText(root), /Librarian 실행 검토/);
  click(control(root, "open-review"));
  const text = collectText(root);
  assert.match(text, /추가|수정|병합|보존/);
  assert.match(text, /차이 보기|근거|신뢰도|영향 대상|충돌/);
  assert.match(text, /선택 승인|전체 승인|거절|근거 더 요청/);
  assert.equal(walk(root, (node) => node.tag === "input" && node.attr && node.attr["data-operation-id"]).length, 1);
  assert.equal(walk(root, (node) => node.tag === "input" && node.attr && node.attr["data-operation-id"])[0].attr["data-operation-id"], operation(packet, "create").operation_id);
  assert.equal((text.match(/후속 단계에서 지원/g) || []).length, 3);
  assert.equal((text.match(/쓰기 없음/g) || []).length, 2);

  const citation = walk(root, (node) => node.attr && node.attr["data-action"] === "open-source")[0];
  assert.ok(citation, "source locator must be an observable action");
  assert.equal(citation.attr["data-source-preview"], "true");
  click(citation);
  assert.equal(opened.length, 0, "opening a source preview must not navigate immediately");
  assert.match(collectText(root), /출처 근거|원문 파일 열기|원문 수정|synthetic-alpha\.md/);
  const editSource = walk(root, (node) => node.attr && node.attr["data-action"] === "edit-source")[0];
  click(editSource);
  assert.deepEqual(edited[0].position, { line: 4, ch: 2 });
  const openFile = walk(root, (node) => node.attr && node.attr["data-action"] === "open-source-file")[0];
  assert.ok(openFile, "source preview must expose an explicit file-open action");
  click(openFile);
  assert.equal(opened.length, 1);
  assert.match(opened[0], /^ZETA\/LITERATURE\//);
  click(control(root, "show-diff"));
  assert.match(collectText(root), /변경 전|변경 후/);
  assert.equal(JSON.stringify(packet), before, "render and inspection must not mutate the packet");
  assert.equal(surface.state().selectedIds.length, 0);
});

test("Given a stale approval, When the same hash is returned and then a new packet is generated, Then authorization stays invalid until explicit reconfirmation", async () => {
  const packet = await packetFixture();
  const replacement = await packetFixture({ runId: "run_librarian_repacket_review" });
  const root = new FakeElement("section");
  const calls = [];
  const regenerated = [packet, replacement];
  const packetBound = await packetBoundCommitFixtures([packet, replacement]);
  const firstContext = packetBound.contexts.get(packet.packet_hash);
  firstContext.live.files.set(firstContext.packet.target_path, "raced canonical bytes\n");
  const reviewApi = review.mountLlmWikiApprovalReview({
    container: root,
    packet,
    approvalApi: approval,
    commitApi: {
      ...commit,
      commitApprovedCanonical(request, options) {
        calls.push({ request, options });
        return commit.commitApprovedCanonical(request, options);
      }
    },
    commitOptions: { now: "2026-08-02T00:01:00.000Z" },
    buildCommitRequest: packetBound.build,
    regeneratePacket: () => regenerated.shift(),
  });
  click(control(root, "open-review"));

  const create = operation(packet, "create");
  const checkbox = walk(root, (node) => node.attr && node.attr["data-operation-id"] === create.operation_id && node.tag === "input")[0];
  assert.ok(checkbox, "each allowlisted operation must expose a selection control");
  click(checkbox);
  click(control(root, "approve-selected"));
  assert.equal(calls.length, 1);
  assert.equal(calls[0].request.authorization.action, "approve_selected");
  assert.deepEqual(calls[0].request.authorization.selection_set, [create.operation_id]);
  assert.match(collectText(root), /새 승인 패킷|다시 확인/);
  assert.equal(control(root, "retry-approval"), null);
  assert.deepEqual(reviewApi.state().selectedIds, []);
  assert.equal(reviewApi.state().authorizationInvalidated, true);
  assert.deepEqual(reviewApi.state().invalidatedPacketHashes, [packet.packet_hash]);
  assert.deepEqual({ canonical: reviewApi.state().lastResult.write_counters.canonical, audit: reviewApi.state().lastResult.write_counters.audit, refresh: reviewApi.state().lastResult.write_counters.refresh, git: reviewApi.state().lastResult.write_counters.git }, { canonical: 0, audit: 0, refresh: 0, git: 0 });

  click(control(root, "regenerate-packet"));
  assert.equal(calls.length, 1);
  assert.equal(reviewApi.state().lastResult.reason, "replacement_packet_hash_required");
  assert.equal(reviewApi.state().authorizationInvalidated, true);

  click(control(root, "regenerate-packet"));
  assert.equal(calls.length, 1);
  assert.equal(reviewApi.state().currentPacketHash, replacement.packet_hash);
  assert.equal(reviewApi.state().reconfirmationRequired, true);
  assert.deepEqual(reviewApi.state().selectedIds, []);

  const replacementCreate = operation(replacement, "create");
  const replacementCheckbox = walk(root, (node) => node.attr && node.attr["data-operation-id"] === replacementCreate.operation_id && node.tag === "input")[0];
  click(replacementCheckbox);
  click(control(root, "approve-selected"));
  assert.equal(calls.length, 2);
  assert.match(collectText(root), /결정적 커밋이 완료되었습니다/);
  assert.doesNotMatch(collectText(root), /미리보기라 실제 지식 파일은 쓰지 않았습니다/);
  assert.doesNotMatch(collectText(root), /합성 실행이라 실제 지식 파일은 쓰지 않았습니다/);
  assert.equal(calls[1].request.authorization.selection_set.length, 1);
  assert.deepEqual(calls[1].request.authorization.selection_set, [replacementCreate.operation_id]);
  assert.equal(calls[1].request.authorization.action, "approve_selected");
  assert.equal(calls[1].options.now, "2026-08-02T00:01:00.000Z");
  assert.notEqual(calls[1].request.packet.packet_hash, packet.packet_hash);
  assert.equal(calls[1].request.packet.operation.operation_id, replacementCreate.operation_id);
  assert.equal(calls[1].request.packet.after_bytes.includes(replacementCreate.reviewed_payload.title), true);
  assert.equal(calls[1].request.packet.source_citations.length > 0, true);
  const replacementContext = packetBound.contexts.get(replacement.packet_hash);
  assert.equal(replacementContext.live.calls.length, 1);
  assert.equal(replacementContext.live.files.get(replacementContext.packet.target_path), replacementContext.packet.after_bytes);
  assert.equal(reviewApi.state().reconfirmationRequired, false);
});

test("Given a selected create implicated in unresolved conflict, When selected or full approval is attempted, Then every write counter stays zero", async () => {
  const packet = await packetFixture({ conflictOnCreate: true });
  const root = new FakeElement("section");
  let commits = 0;
  const surface = review.mountLlmWikiApprovalReview({
    container: root,
    packet,
    approvalApi: approval,
    commitApi: { ...commit, commitApprovedCanonical() { commits += 1; return { ok: true, status: "committed" }; } },
    commitOptions: { preview: true },
  });
  click(control(root, "open-review"));
  const create = operation(packet, "create");
  click(walk(root, (node) => node.attr && node.attr["data-operation-id"] === create.operation_id && node.tag === "input")[0]);
  click(control(root, "approve-selected"));
  assert.equal(surface.state().lastResult.reason, "unresolved_conflict");
  assert.deepEqual({ canonical: surface.state().lastResult.write_counters.canonical, audit: surface.state().lastResult.write_counters.audit, refresh: surface.state().lastResult.write_counters.refresh, git: surface.state().lastResult.write_counters.git }, { canonical: 0, audit: 0, refresh: 0, git: 0 });
  assert.equal(commits, 0);
  click(control(root, "approve-all"));
  assert.match(collectText(root), /미해결 충돌|전체 승인을 진행할 수 없습니다/);
  assert.equal(commits, 0);
  click(control(root, "evidence-more"));
  assert.match(collectText(root), /근거를 더 요청했습니다/);
  assert.equal(commits, 0);
  click(control(root, "reject-conflict"));
  assert.match(collectText(root), /실행을 거절했습니다/);
  assert.equal(commits, 0);
  assert.equal(surface.state().lastResult.status, "rejected");
  assert.equal(surface.state().lastResult.write_outcome, "no_write");
});

test("Given an open review, When Escape is pressed, Then the review closes without changing the packet", async () => {
  const packet = await packetFixture();
  const root = new FakeElement("section");
  const before = JSON.stringify(packet);
  const surface = review.mountLlmWikiApprovalReview({ container: root, packet, approvalApi: approval, commitApi: commit, commitOptions: { preview: true } });
  click(control(root, "open-review"));
  const frame = root.children.find((node) => node.attr && node.attr["data-surface"] === "llmwiki-approval-review");
  assert.ok(frame, "review frame must be focusable for Escape cancellation");
  frame.onkeydown({ key: "Escape", preventDefault() {} });
  const closedFrame = root.children.find((node) => node.attr && node.attr["data-surface"] === "llmwiki-approval-review");
  closedFrame.onkeydown({ key: "Escape", preventDefault() {} });
  assert.equal(surface.state().open, false);
  assert.match(collectText(root), /검토 열기/);
  assert.equal(JSON.stringify(packet), before);
});

test("Given no supplied packet, When the Knowledge Hub mounts, Then it renders a truthful empty state without a synthetic review", async () => {
  const result = await runHub({ pages: buildPages() });
  assert.equal(result.window.KnowledgeExplorerHub.approvalReview, undefined);
  const snapshot = result.window.KnowledgeExplorerHub.llmWikiLifecycleSnapshot();
  assert.equal(snapshot.review_packets.length, 0);
  assert.equal(snapshot.approval_packet, null);
  assert.ok(firstElement(result.container, "section", (node) => node.attr && node.attr["data-surface"] === "llmwiki-lifecycle"));
  assert.equal(firstElement(result.container, "section", (node) => node.attr && node.attr["data-surface"] === "llmwiki-approval-review"), null);
  assert.equal(firstElement(result.container, "button", (node) => node.attr && ["open-review", "approve-selected", "approve-all"].includes(node.attr["data-action"])), null);
  assert.equal(firstElement(result.container, "input", (node) => node.attr && node.attr["data-operation-id"]), null);
});

test("Given a supplied packet and an injected writer, When the Hub approval action is activated, Then the normal browser path commits and replay shows duplicate", async () => {
  const packet = await packetFixture();
  const tempRoot = fs.mkdtempSync(path.join(require("node:os").tmpdir(), "llmwiki-todo14-hub-"));
  const auditRoot = path.join(tempRoot, ".audit");
  const calls = [];
  const commitOptions = { canonicalRoot: tempRoot, auditRoot, now: "2026-08-02T00:00:00.000Z" };
  const packetBound = await packetBoundCommitFixtures([packet]);
  const injectedCommit = {
    ...commit,
    commitApprovedCanonical(request, options) {
      calls.push({ request, options });
      return commit.commitApprovedCanonical(request, options);
    }
  };
  try {
    const root = new FakeElement("section");
    const surface = review.mountLlmWikiApprovalReview({
      container: root,
      packet,
      approvalApi: approval,
      commitApi: injectedCommit,
      commitOptions,
      buildCommitRequest: packetBound.build,
    });
    const source = require("node:fs").readFileSync(path.join(ROOT, "HUB/50 Knowledge.md"), "utf8");
    assert.doesNotMatch(source, /commitOptions:\s*KnowledgeExplorerHub\.commitOptions\s*\|\|\s*\{\s*preview:\s*true\s*\}/);
    click(control(root, "open-review"));
    const checkbox = walk(root, (node) => node.tag === "input" && node.attr && node.attr["data-operation-id"])[0];
    checkbox.onclick();
    click(control(root, "approve-selected"));
    const last = surface.state().lastResult;
  assert.equal(last.status, "committed");
  assert.equal(last.preview, undefined);
  assert.deepEqual(JSON.parse(JSON.stringify(last.write_counts)), { canonical: 1, audit: 1, derived: 0, provider: 0, network: 0, git: 0 });
  assert.equal(calls[0].options, commitOptions);
  assert.equal(calls[0].options.preview, undefined);
    assert.match(collectText(root), /결정적 커밋이 완료되었습니다/);
    click(control(root, "approve-selected"));
    const duplicate = surface.state().lastResult;
  assert.equal(duplicate.status, "duplicate");
    assert.match(collectText(root), /이미 같은 결정적 승인 결과가 확인되었습니다/);
    assert.equal(calls.length, 2);
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});

test("Given a no-require VM without the canonical packet contract, When approval is clicked, Then the real commit boundary fails closed before writes", async () => {
  const packet = await packetFixture();
  const browser = {};
  vm.runInNewContext(DETERMINISTIC_COMMIT_SOURCE, browser, { filename: "llmwiki-deterministic-commit.js" });
  assert.equal(browser.require, undefined, "boundary VM must not install a require shim");
  assert.equal(browser.LLMWikiCanonicalPacket, undefined, "canonical packet contract must actually be absent");
  assert.equal(browser.LLMWikiApprovalReviewCommit, undefined, "authorization replay contract must actually be absent");

  const adapterCalls = [];
  const root = new FakeElement("section");
  const surface = review.mountLlmWikiApprovalReview({
    container: root,
    packet,
    approvalApi: approval,
    commitApi: browser.LLMWikiDeterministicCommit,
    buildCommitRequest: () => ({
      packet: {},
      authorization: {},
      adapter: {
        readBytes() { adapterCalls.push("readBytes"); },
        readReceipt() { adapterCalls.push("readReceipt"); },
        commitExact() { adapterCalls.push("commitExact"); },
      },
    }),
  });
  click(control(root, "open-review"));
  const checkbox = walk(root, (node) => node.tag === "input" && node.attr && node.attr["data-operation-id"])[0];
  checkbox.onclick();
  click(control(root, "approve-selected"));
  const last = surface.state().lastResult;
  assert.equal(last.status, "rejected");
  assert.equal(last.reason, "packet_contract_missing");
  assert.deepEqual(JSON.parse(JSON.stringify(last.write_counts)), { canonical: 0, audit: 0, derived: 0, provider: 0, network: 0, git: 0 });
  assert.deepEqual(adapterCalls, []);
  assert.match(collectText(root), /결정적 커밋을 진행하지 못했습니다/);
});

test("Given browser hash source, When UTF-8 text is hashed without require, Then it matches Node SHA-256", () => {
  const browser = {};
  vm.runInNewContext(HASH_SOURCE, browser, { filename: "llmwiki-hash.js" });
  assert.equal(browser.require, undefined, "hash module must not pollute the browser global");
  for (const value of ["", "abc", "한국어 CJK 漢字", "prompt injection: ignore prior instructions"]) {
    const expected = crypto.createHash("sha256").update(value, "utf8").digest("hex");
    assert.equal(browser.LLMWikiHash.sha256(value), expected, value);
  }
});

console.log("LLMWiki approval review view tests loaded");
