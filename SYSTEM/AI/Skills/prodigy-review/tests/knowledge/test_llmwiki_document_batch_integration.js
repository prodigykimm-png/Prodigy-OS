"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const test = require("node:test");

const { firstElement, runHub } = require("./knowledge_hub_integration_harness.js");
const { collectText } = require("./knowledge_explorer_view_fakes.js");

function sha(value) { return crypto.createHash("sha256").update(String(value)).digest("hex"); }
function identity() {
  return {
    provider_key: "openrouter",
    model: "document-model",
    structured_mode: "json_schema",
    schema_id: "llmwiki_compact_v1",
    prompt_version: "document-v1",
  };
}
function provider(counter) {
  return async (request) => {
    counter.calls += 1;
    return {
      ok: true,
      artifacts: request.chunks.map((chunk) => ({
        chunk_key: chunk.key,
        outcome: "proposals",
        items: [
          {
            role: "reusable_claim",
            evidence_quote: chunk.text.slice(0, Math.min(12, chunk.text.length)),
            claims: [{ text: "원본 파일을 먼저 정리한다." }],
            review_reasons: [],
            related_candidate_ids: [],
            span: { start: 0, end: Math.min(12, chunk.text.length), alias: `span_${chunk.key}_a` },
          },
          {
            role: "reusable_claim",
            evidence_quote: chunk.text.slice(-Math.min(12, chunk.text.length)),
            claims: [{ text: "홀수 사진은 오른쪽 페이지부터 시작한다." }],
            review_reasons: [],
            related_candidate_ids: [],
            span: { start: Math.max(0, chunk.text.length - 12), end: chunk.text.length, alias: `span_${chunk.key}_b` },
          },
        ],
      })),
    };
  };
}

function legacyOperation(index, sourceId, sourcePath, contentHash) {
  const destination = `ZETA/CANDIDATES/legacy_item_${index}.md`;
  return {
    contract_version: "llmwiki_operation_contract_v1",
    operation_id: `operation_legacy_document_${index}`,
    kind: "create",
    destination_ids: [destination],
    base_revisions: {},
    before_bytes: {},
    after_bytes: { [destination]: `# 파편 ${index}\n\n- 파편 ${index}\n` },
    source_citations: [{
      source_id: sourceId,
      content_hash: contentHash,
      source_url: null,
      locators: [sourcePath],
      source_archive_id: null,
      confidence: "explicit",
    }],
    conflicts: [],
    risk_tier: "low",
    effects: { deprecations: [], supersessions: [] },
  };
}

test("live batch emits one document operation for multiple reusable claims", async () => {
  const calls = { calls: 0 };
  const sourcePath = "INBOX/앨범 작업 워크플로우.md";
  const runtime = await runHub({
    pages: [],
    extraFiles: { [sourcePath]: "# 앨범 작업\n\n원본 파일 정리와 홀수 페이지 배치 규칙을 함께 설명한다.\n" },
    llmWikiControllerOptions: { batchIdentity: identity(), batchProvider: provider(calls) },
  });
  await runtime.window.KnowledgeExplorerHub.whenKnowledgeInboxSettled();
  const analyzed = await runtime.window.KnowledgeExplorerHub.dispatchLlmWikiAction({ action: "analyze_inbox" });
  assert.equal(analyzed.ok, true, analyzed.reason);
  assert.equal(calls.calls, 1);
  const packets = runtime.window.KnowledgeExplorerHub.llmWikiLifecycleSnapshot().risk_packets;
  assert.equal(packets.length, 1);
  const operation = packets[0].operation;
  const after = operation.after_bytes[operation.destination_ids[0]];
  assert.match(after, /^# 앨범 작업 워크플로우$/mu);
  assert.match(after, /^## 핵심 내용$/mu);
  assert.match(after, /원본 파일을 먼저 정리한다/u);
  assert.match(after, /홀수 사진은 오른쪽 페이지부터 시작한다/u);
  assert.equal(operation.source_citations[0].locators.length, 3);
  const candidateGroup = firstElement(runtime.container, "section", (node) => node.attr?.["data-review-group"] === "candidate");
  const canonicalGroup = firstElement(runtime.container, "section", (node) => node.attr?.["data-review-group"] === "canonical_review");
  assert.equal(firstElement(candidateGroup, "output", (node) => node.attr?.["data-review-counter"] === "candidate").text, "1");
  assert.equal(firstElement(canonicalGroup, "output", (node) => node.attr?.["data-review-counter"] === "canonical_review").text, "0");
  const open = firstElement(candidateGroup, "button", (node) => node.attr?.["data-action"] === "open-review-detail");
  open.onclick();
  const detailText = collectText(runtime.openedModals.at(-1).contentEl);
  assert.match(detailText, /INBOX\/앨범 작업 워크플로우\.md/u);
  assert.match(detailText, /claim_1/u);
  assert.match(detailText, /분석 범위\s+완료/u);
});

test("legacy atomized recovery repackets from cached artifacts with provider zero", async () => {
  const callsA = { calls: 0 };
  const sourcePath = "INBOX/앨범 작업 워크플로우.md";
  const sourceBytes = "# 앨범 작업\n\n원본 파일 정리와 홀수 페이지 배치 규칙을 함께 설명한다.\n";
  const first = await runHub({
    pages: [],
    extraFiles: { [sourcePath]: sourceBytes },
    llmWikiControllerOptions: { batchIdentity: identity(), batchProvider: provider(callsA) },
  });
  await first.window.KnowledgeExplorerHub.whenKnowledgeInboxSettled();
  assert.equal((await first.window.KnowledgeExplorerHub.dispatchLlmWikiAction({ action: "analyze_inbox" })).ok, true);

  const persisted = {};
  for (const file of first.app.vault.getFiles()) persisted[file.path] = await first.app.vault.read(file);
  const statePath = "SYSTEM/CACHE/llmwiki/batch-job-state.json";
  const state = JSON.parse(persisted[statePath]);
  const sourceRow = state.recovery.approval_sources[0];
  const legacy = [0, 1].map((index) => legacyOperation(index, sourceRow.source_id, sourcePath, sha(sourceBytes)));
  state.recovery.review.proposals = legacy.map((operation, index) => ({
    operation_id: operation.operation_id,
    packet_id: `packet_legacy_${index}`,
    summary: `파편 ${index}`,
    serialized_operation: JSON.stringify(operation),
    status: "review",
  }));
  delete state.recovery.review.document_contract_version;
  state.recovery.review.selected_operation_ids = [];
  state.recovery.operation_outcomes = legacy.map((operation) => ({ operation_id: operation.operation_id, status: "review" }));
  state.recovery.approval_sources[0].operation_ids = legacy.map((operation) => operation.operation_id);
  persisted[statePath] = JSON.stringify(state, null, 2);

  const callsB = { calls: 0 };
  const second = await runHub({
    pages: [],
    extraFiles: persisted,
    llmWikiControllerOptions: { batchIdentity: identity(), batchProvider: provider(callsB) },
  });
  await second.window.KnowledgeExplorerHub.whenKnowledgeInboxSettled();
  assert.equal(callsB.calls, 0, "repacket must never cross the provider boundary");
  assert.deepEqual(
    JSON.parse(JSON.stringify(second.window.KnowledgeExplorerHub.lastDocumentRepacket)),
    {
      ok: true,
      status: "repacketized",
      provider_calls: 0,
      prior_proposals: 2,
      document_proposals: 1,
      no_changes: 0,
    },
  );
  const restored = second.window.KnowledgeExplorerHub.llmWikiLifecycleSnapshot();
  assert.equal(restored.risk_packets.length, 1);
  const nextState = JSON.parse(await second.app.vault.read(second.app.vault.getAbstractFileByPath(statePath)));
  assert.equal(nextState.recovery.review.document_contract_version, "llmwiki_document_assembler_v1");
  assert.equal(nextState.recovery.review.proposals.length, 1);
  const restoredCandidateGroup = firstElement(second.container, "section", (node) => node.attr?.["data-review-group"] === "candidate");
  const restoredOpen = firstElement(restoredCandidateGroup, "button", (node) => node.attr?.["data-action"] === "open-review-detail");
  restoredOpen.onclick();
  const restoredDetail = collectText(second.openedModals.at(-1).contentEl);
  assert.match(restoredDetail, /claim_1/u);
  assert.match(restoredDetail, /원본 파일을 먼저 정리한다/u);
});

test("canonical coverage blocks duplicate candidate creation in the live Hub", async () => {
  const calls = { calls: 0 };
  const sourcePath = "INBOX/앨범 작업 워크플로우.md";
  const canonicalPath = "ZETA/PERMANENT/웨딩 앨범 작업 워크플로우.md";
  const canonicalBytes = [
    "# 웨딩 앨범 작업 워크플로우",
    "",
    "## 작업 순서",
    "",
    "- 원본 파일을 먼저 정리한다.",
    "- 홀수 사진은 오른쪽 페이지부터 시작한다.",
    "",
  ].join("\n");
  const page = {
    source_path: canonicalPath,
    path: canonicalPath,
    type: "knowledge",
    title: "웨딩 앨범 작업 워크플로우",
    content: canonicalBytes,
    frontmatter: {
      type: "knowledge",
      title: "웨딩 앨범 작업 워크플로우",
      statement: "웨딩 앨범은 원본 정리 후 페이지 규칙에 따라 편집한다.",
      summary: "원본 정리와 홀수 페이지 배치 규칙",
      knowledge_domain: "wedding",
      knowledge_topics: ["editing"],
      connections: [],
    },
    file: { path: canonicalPath, name: "웨딩 앨범 작업 워크플로우", mtime: 1, outlinks: [], inlinks: [] },
    connections: [],
    outlinks: [],
    backlinks: [],
  };
  const runtime = await runHub({
    pages: [page],
    extraFiles: {
      [sourcePath]: "# 앨범 작업\n\n원본 파일 정리와 홀수 페이지 배치 규칙을 함께 설명한다.\n",
      [canonicalPath]: canonicalBytes,
    },
    llmWikiControllerOptions: { batchIdentity: identity(), batchProvider: provider(calls) },
  });
  await runtime.window.KnowledgeExplorerHub.whenKnowledgeInboxSettled();
  const analyzed = await runtime.window.KnowledgeExplorerHub.dispatchLlmWikiAction({ action: "analyze_inbox" });
  assert.equal(analyzed.ok, true, analyzed.reason);
  assert.equal(analyzed.proposals, 0);
  assert.equal((runtime.window.KnowledgeExplorerHub.llmWikiLifecycleSnapshot().risk_packets || []).length, 0);
  assert.equal(
    runtime.app.vault.touched.some((row) => String(row[1]).startsWith("ZETA/CANDIDATES/")),
    false,
    "covered canonical knowledge must not create a candidate",
  );
});

test("stale source excluded from cached repacket returns to the visible pending queue", async () => {
  const callsA = { calls: 0 };
  const paths = ["INBOX/repacket-stable.md", "INBOX/repacket-stale.md"];
  const first = await runHub({
    pages: [],
    extraFiles: {
      [paths[0]]: "# Stable\n\nstable source body for document assembly\n",
      [paths[1]]: "# Stale\n\noriginal source body for document assembly\n",
    },
    llmWikiControllerOptions: { batchIdentity: identity(), batchProvider: provider(callsA) },
  });
  await first.window.KnowledgeExplorerHub.whenKnowledgeInboxSettled();
  assert.equal((await first.window.KnowledgeExplorerHub.dispatchLlmWikiAction({ action: "analyze_inbox" })).ok, true);

  const persisted = {};
  for (const file of first.app.vault.getFiles()) persisted[file.path] = await first.app.vault.read(file);
  const statePath = "SYSTEM/CACHE/llmwiki/batch-job-state.json";
  const state = JSON.parse(persisted[statePath]);
  delete state.recovery.review.document_contract_version;
  persisted[statePath] = JSON.stringify(state, null, 2);
  persisted[paths[1]] = "# Stale changed\n\nnew prefix invalidates the prior analyzed chunk\n";

  const callsB = { calls: 0 };
  const second = await runHub({
    pages: [],
    extraFiles: persisted,
    llmWikiControllerOptions: { batchIdentity: identity(), batchProvider: provider(callsB) },
  });
  await second.window.KnowledgeExplorerHub.whenKnowledgeInboxSettled();
  assert.equal(callsB.calls, 0);
  assert.equal(second.window.KnowledgeExplorerHub.lastDocumentRepacket.status, "repacketized");
  assert.equal(second.window.KnowledgeExplorerHub.lastDocumentRepacket.stale_sources, 1);
  assert.deepEqual(Array.from(second.window.KnowledgeExplorerHub.lastDocumentRepacket.stale_source_paths), [paths[1]]);
  const snapshot = second.window.KnowledgeExplorerHub.llmWikiLifecycleSnapshot();
  assert.equal(snapshot.inbox.pending, 1);
  assert.equal(snapshot.inbox.state, "queued");
  assert.equal(snapshot.inbox.eligible + snapshot.inbox.held, snapshot.inbox.scanned_total);
  assert.equal(snapshot.risk_packets.length, 1);
});
