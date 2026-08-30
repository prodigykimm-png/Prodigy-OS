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
  const summaryPreview = firstElement(candidateGroup, "p", (node) => node.attr?.["data-review-summary-preview"] === "");
  assert.match(summaryPreview.text, /원본 파일을 먼저 정리한다/u);
  assert.match(summaryPreview.text, /홀수 사진은 오른쪽 페이지부터 시작한다/u);
  const open = firstElement(candidateGroup, "button", (node) => node.attr?.["data-action"] === "open-review-detail");
  open.onclick();
  const detailText = collectText(runtime.openedModals.at(-1).contentEl);
  assert.match(detailText, /INBOX\/앨범 작업 워크플로우\.md/u);
  assert.match(detailText, /요약 결과/u);
  assert.match(detailText, /생성 문서 전체/u);
  assert.match(detailText, /## 핵심 내용/u);
  assert.match(detailText, /분석 범위\s+완료/u);
});

test("rejecting an obsolete review run persists zero packets across restart", async () => {
  const calls = { calls: 0 };
  const sourcePath = "INBOX/obsolete-prefix-review.md";
  const runtime = await runHub({
    pages: [],
    extraFiles: { [sourcePath]: "# Obsolete\n\n이전 제한 분석으로 만든 검토 배치다.\n" },
    llmWikiControllerOptions: { batchIdentity: identity(), batchProvider: provider(calls) },
  });
  await runtime.window.KnowledgeExplorerHub.whenKnowledgeInboxSettled();
  assert.equal((await runtime.window.KnowledgeExplorerHub.dispatchLlmWikiAction({ action: "analyze_inbox" })).ok, true);
  const packet = runtime.window.KnowledgeExplorerHub.llmWikiLifecycleSnapshot().risk_packets[0];
  const rejected = await runtime.window.KnowledgeExplorerHub.dispatchLlmWikiAction({
    action: "reject_risk",
    packet_id: packet.packet_id,
    packet_hash: packet.packet_hash,
    packet_revision: packet.packet_revision,
    run_id: packet.run_id,
    run_revision: packet.run_revision,
  });
  assert.equal(rejected.ok, true, rejected.reason);
  assert.equal(rejected.status, "cancelled");
  assert.equal(runtime.window.KnowledgeExplorerHub.llmWikiLifecycleSnapshot().risk_packets.length, 0);
  assert.deepEqual(JSON.parse(JSON.stringify(rejected.write_counts)), { canonical: 0, audit: 0, refresh: 0, git: 0 });
  const statePath = "SYSTEM/CACHE/llmwiki/batch-job-state.json";
  const persistedState = JSON.parse(await runtime.app.vault.read(runtime.app.vault.getAbstractFileByPath(statePath)));
  assert.equal(persistedState.recovery.review.proposals.length, 0);
  assert.equal(persistedState.recovery.operation_outcomes.every((row) => row.status === "rejected"), true);

  const persisted = {};
  for (const file of runtime.app.vault.getFiles()) persisted[file.path] = await runtime.app.vault.read(file);
  const restartCalls = { calls: 0 };
  const restarted = await runHub({
    pages: [],
    extraFiles: persisted,
    llmWikiControllerOptions: {
      batchIdentity: identity(),
      batchProvider: async () => { restartCalls.calls += 1; throw new Error("provider_must_not_run"); },
    },
  });
  await restarted.window.KnowledgeExplorerHub.whenKnowledgeInboxSettled();
  assert.equal(restartCalls.calls, 0);
  assert.equal((restarted.window.KnowledgeExplorerHub.llmWikiLifecycleSnapshot().risk_packets || []).length, 0);
});

test("isolated document pilot covers content beyond 4 KiB without replacing the existing review", async () => {
  const seen = { modes: [], late: false };
  const sourcePath = "INBOX/투자 일기.md";
  const earlyQuote = "초반에는 사업 속도를 먼저 확인한다.";
  const lateQuote = "후반에는 현금흐름이 나쁘면 장기 보유를 피한다.";
  const sourceBytes = `# 투자 일기\n\n${earlyQuote}\n\n${"x".repeat(5000)}\n\n## 후반 판단\n\n${lateQuote}\n`;
  const batchProvider = async (request) => {
    seen.modes.push(request.mode);
    return {
      ok: true,
      artifacts: request.chunks.map((chunk) => {
        const items = [];
        if (chunk.text.includes(earlyQuote)) items.push({
          role: "source_summary", topic: "투자 판단 변화", evidence_quote: earlyQuote,
          claims: [{ text: "사업 속도를 초기 판단 기준으로 사용한다." }], review_reasons: [], related_candidate_ids: [],
          span: { start: chunk.text.indexOf(earlyQuote), end: chunk.text.indexOf(earlyQuote) + earlyQuote.length, alias: `span_${chunk.key}_early` },
        });
        if (chunk.text.includes(lateQuote)) {
          seen.late = true;
          items.push({
            role: "source_summary", topic: "투자 판단 변화", evidence_quote: lateQuote,
            claims: [{ text: "현금흐름이 나쁘면 장기 보유를 피한다." }], review_reasons: [], related_candidate_ids: [],
            span: { start: chunk.text.indexOf(lateQuote), end: chunk.text.indexOf(lateQuote) + lateQuote.length, alias: `span_${chunk.key}_late` },
          });
        }
        return { chunk_key: chunk.key, outcome: items.length ? "proposals" : "no_change", items };
      }),
    };
  };
  const runtime = await runHub({
    pages: [],
    extraFiles: { [sourcePath]: sourceBytes },
    llmWikiControllerOptions: { batchIdentity: identity(), batchProvider },
  });
  await runtime.window.KnowledgeExplorerHub.whenKnowledgeInboxSettled();
  const priorPackets = (runtime.window.KnowledgeExplorerHub.llmWikiLifecycleSnapshot().risk_packets || []).length;
  const analyzed = await runtime.window.KnowledgeExplorerHub.runDocumentPilot(sourcePath);

  assert.equal(analyzed.ok, true, analyzed.reason);
  assert.deepEqual(seen.modes, ["semantic"]);
  assert.equal(seen.late, true, "content after 4 KiB must reach the provider");
  assert.equal(analyzed.source_bytes, Buffer.byteLength(sourceBytes));
  assert.equal(analyzed.covered_bytes, analyzed.source_bytes);
  assert.ok(analyzed.chunk_count >= 1);
  assert.equal(analyzed.existing_review_writes, 0);
  assert.equal(analyzed.canonical_writes, 0);
  assert.equal((runtime.window.KnowledgeExplorerHub.llmWikiLifecycleSnapshot().risk_packets || []).length, priorPackets);
  const body = analyzed.documents[0].body;
  assert.match(body, /사업 속도를 초기 판단 기준으로 사용한다/u);
  assert.match(body, /현금흐름이 나쁘면 장기 보유를 피한다/u);
  assert.match(body, /^## 주제별 내용$/mu);
  assert.deepEqual(Array.from(analyzed.documents[0].sections, (section) => String(section.heading)), ["투자 판단 변화"]);
});

test("isolated document pilot resumes after the last completed pack", async () => {
  const sourcePath = "INBOX/대용량 투자 기록.md";
  const sourceBytes = `# 대용량 투자 기록\n\n${"a".repeat(26000)}\n`;
  let calls = 0;
  const chunkCalls = new Map();
  const batchProvider = async (request) => {
    calls += 1;
    if (calls === 2) return { ok: false, reason: "provider_unavailable", provider_call_count: 1, artifacts: [] };
    return {
      ok: true,
      provider_call_count: 1,
      artifacts: request.chunks.map((chunk) => {
        chunkCalls.set(chunk.key, (chunkCalls.get(chunk.key) || 0) + 1);
        return {
          chunk_key: chunk.key,
          outcome: "proposals",
          items: [{
            role: "source_summary", topic: "대용량 기록",
            evidence_quote: chunk.text.slice(0, Math.min(16, chunk.text.length)),
            claims: [{ text: `${chunk.key} 구간을 분석했다.` }],
            review_reasons: [], related_candidate_ids: [],
            span: { start: 0, end: Math.min(16, chunk.text.length), alias: `span_${chunk.key}` },
          }],
        };
      }),
    };
  };
  const runtime = await runHub({
    pages: [],
    extraFiles: { [sourcePath]: sourceBytes },
    llmWikiControllerOptions: { batchIdentity: identity(), batchProvider },
  });
  await runtime.window.KnowledgeExplorerHub.whenKnowledgeInboxSettled();
  const first = await runtime.window.KnowledgeExplorerHub.runDocumentPilot(sourcePath);
  const second = await runtime.window.KnowledgeExplorerHub.runDocumentPilot(sourcePath);

  assert.equal(first.ok, false);
  assert.equal(first.completed_packs, 1);
  assert.equal(second.ok, true, second.reason);
  assert.equal(calls, 3, "second intent must resume at the failed pack");
  assert.equal(Math.max(...chunkCalls.values()), 1, "completed chunks must not be requested again");
  assert.equal(second.covered_bytes, Buffer.byteLength(sourceBytes));
});

test("full-source workflow stops at page-plan triage, then compiles preview without replacing active review", async () => {
  const sourcePath = "INBOX/투자 계획.md";
  const sourceBytes = "# 투자 계획\n\n직영 공사는 비용을 줄인다.\n\n철골조는 공사 기간을 단축한다.\n";
  const calls = { calls: 0 };
  const articleCalls = { calls: 0 };
  const runtime = await runHub({
    pages: [],
    extraFiles: { [sourcePath]: sourceBytes },
    llmWikiControllerOptions: {
      batchIdentity: identity(),
      batchProvider: provider(calls),
      documentPagePlan: async (request) => {
        const claimIds = request.claims.map((claim) => claim.claim_id);
        return {
          source_guide: {
            overview: "직영 공사와 구조 선택을 설명하는 자료다.",
            sections: [{ heading: "건축 비용과 기간", summary: "비용 절감과 공기 단축을 함께 다룬다.", claim_ids: claimIds }],
            key_questions: ["어떤 공정에서 절감 효과가 큰가?"],
          },
          topic_pages: [{
            title: "직영 건축의 비용과 기간",
            purpose: "직영 공사와 철골조 선택 효과를 설명한다.",
            claim_ids: claimIds,
            target_candidate_ids: [],
          }],
          source_only_claim_ids: [],
        };
      },
      documentArticleCompiler: async (request) => {
        articleCalls.calls += 1;
        return {
          articles: request.pages.map((page) => ({
            page_id: page.page_id,
            sections: [{
              heading: "비용과 공기",
              paragraphs: [{ text: "직영 공사는 비용을 줄이고 철골조는 공사 기간을 단축한다.", claim_ids: page.claim_ids }],
            }],
          })),
        };
      },
    },
  });
  await runtime.window.KnowledgeExplorerHub.whenKnowledgeInboxSettled();
  const priorPackets = (runtime.window.KnowledgeExplorerHub.llmWikiLifecycleSnapshot().risk_packets || []).length;

  const planned = await runtime.window.KnowledgeExplorerHub.runDocumentPlan(sourcePath);
  assert.equal(planned.ok, true, planned.reason);
  assert.equal(planned.status, "pending_review");
  assert.equal(planned.source_bytes, Buffer.byteLength(sourceBytes));
  assert.equal(planned.covered_bytes, planned.source_bytes);
  assert.equal(planned.pages, 1);
  assert.equal(planned.source_sections, 1);
  assert.equal((runtime.window.KnowledgeExplorerHub.llmWikiLifecycleSnapshot().risk_packets || []).length, priorPackets);

  const planGroup = firstElement(runtime.container, "section", (node) => node.attr?.["data-review-group"] === "plan");
  assert.equal(firstElement(planGroup, "output", (node) => node.attr?.["data-review-counter"] === "plan").text, "2");
  assert.match(collectText(planGroup), /투자 계획 자료 안내/u);
  assert.match(collectText(planGroup), /직영 건축의 비용과 기간/u);
  assert.ok(firstElement(planGroup, "button", (node) => node.attr?.["data-action"] === "approve-page-plan"));

  const compiled = await runtime.window.KnowledgeExplorerHub.compileDocumentPlan();
  assert.equal(compiled.ok, true, compiled.reason);
  assert.equal(compiled.status, "compiled_preview");
  assert.equal(compiled.documents, 2);
  assert.equal(compiled.proposals, 2);
  assert.equal(compiled.existing_review_preserved, true);
  assert.equal((runtime.window.KnowledgeExplorerHub.llmWikiLifecycleSnapshot().risk_packets || []).length, priorPackets);
  assert.equal(compiled.canonical_writes, 0);
  assert.equal(articleCalls.calls, 1);
  const rerendered = await runtime.window.KnowledgeExplorerHub.rerenderDocumentPlan();
  assert.equal(rerendered.ok, true, rerendered.reason);
  assert.equal(articleCalls.calls, 1, "renderer-only refresh must not call the article provider");
  const compileSnapshot = runtime.window.KnowledgeExplorerHub.documentPlanCompileSnapshot();
  assert.match(compileSnapshot.documents.find((document) => document.document_kind === "source_guide").body, /## 자료 개요/u);
  assert.match(compileSnapshot.documents.find((document) => document.document_kind === "topic_article").body, /직영 공사는 비용을 줄이고/u);
  const state = JSON.parse(await runtime.app.vault.read(runtime.app.vault.getAbstractFileByPath("SYSTEM/CACHE/llmwiki/batch-job-state.json")));
  assert.equal(Object.keys(state.plans).length, 1);
  assert.equal(Object.values(state.plans)[0].status, "compiled");

  const persisted = {};
  for (const file of runtime.app.vault.getFiles()) persisted[file.path] = await runtime.app.vault.read(file);
  const restartCalls = { calls: 0 };
  const restarted = await runHub({
    pages: [],
    extraFiles: persisted,
    llmWikiControllerOptions: {
      batchIdentity: identity(),
      batchProvider: async () => { restartCalls.calls += 1; throw new Error("provider_must_not_run"); },
    },
  });
  await restarted.window.KnowledgeExplorerHub.whenKnowledgeInboxSettled();
  assert.equal(restartCalls.calls, 0);
  const restored = restarted.window.KnowledgeExplorerHub.documentPlanCompileSnapshot();
  assert.equal(restored.restored, true);
  assert.equal(restored.provider_calls, 0);
  assert.equal(restored.documents.length, 2);
  assert.equal(restored.proposals.length, 2);
  const activatedAfterRestart = await restarted.window.KnowledgeExplorerHub.activateDocumentPlanReview();
  assert.equal(activatedAfterRestart.ok, true, activatedAfterRestart.reason);
  assert.equal(activatedAfterRestart.packets, 2);
  assert.equal(restartCalls.calls, 0);
  const activatedPersisted = {};
  for (const file of restarted.app.vault.getFiles()) activatedPersisted[file.path] = await restarted.app.vault.read(file);
  const activatedRestartCalls = { calls: 0 };
  const activatedRestarted = await runHub({
    pages: [],
    extraFiles: activatedPersisted,
    llmWikiControllerOptions: {
      batchIdentity: identity(),
      batchProvider: async () => { activatedRestartCalls.calls += 1; throw new Error("provider_must_not_run"); },
    },
  });
  await activatedRestarted.window.KnowledgeExplorerHub.whenKnowledgeInboxSettled();
  assert.equal(activatedRestartCalls.calls, 0);
  const activatedPackets = activatedRestarted.window.KnowledgeExplorerHub.llmWikiLifecycleSnapshot().risk_packets || [];
  assert.equal(activatedPackets.length, 2);
  assert.equal(activatedRestarted.window.KnowledgeExplorerHub.lastDocumentRepacket.status, "not_required");
  const approvedAfterRestart = await activatedRestarted.window.KnowledgeExplorerHub.dispatchLlmWikiAction({
    action: "approve_risk_batch",
    selection_ids: activatedPackets.map((packet) => packet.packet_id),
  });
  assert.equal(approvedAfterRestart.ok, true, approvedAfterRestart.reason);
  assert.equal(approvedAfterRestart.write_counts.canonical, 2);
  const restoredPlanGroup = firstElement(restarted.container, "section", (node) => node.attr?.["data-review-group"] === "plan");
  assert.match(collectText(restoredPlanGroup), /직영 건축의 비용과 기간/u);
  const restoredPlan = restarted.window.KnowledgeExplorerHub.documentPlanSnapshot();
  const reopened = await restarted.window.KnowledgeExplorerHub.dispatchDocumentPlanAction({
    action: "reopen_plan",
    expected_plan_hash: restoredPlan.plan_hash,
  });
  assert.equal(reopened.ok, true, reopened.reason);
  assert.equal(reopened.snapshot.status, "pending_review");
  assert.equal(restartCalls.calls, 0);
});

test("source-only claims block source archive when compiled review activates", async () => {
  const sourcePath = "INBOX/투자 잔여 근거.md";
  const quotes = ["입지 기준을 확인한다.", "권리 기준을 확인한다.", "개인 금액 기준은 원문에 남긴다."];
  const sourceBytes = `# 투자 잔여 근거\n\n${quotes.join("\n\n")}\n`;
  const runtime = await runHub({
    pages: [],
    extraFiles: { [sourcePath]: sourceBytes },
    llmWikiControllerOptions: {
      batchIdentity: identity(),
      batchProvider: async (request) => ({
        ok: true,
        provider_call_count: 1,
        artifacts: request.chunks.map((chunk) => ({
          chunk_key: chunk.key,
          outcome: "proposals",
          items: quotes.map((quote, index) => ({
            role: "reusable_claim",
            topic: index < 2 ? "투자 확인" : "개인 기준",
            evidence_quote: quote,
            claims: [{ text: quote }],
            review_reasons: [],
            related_candidate_ids: [],
            span: {
              start: chunk.text.indexOf(quote),
              end: chunk.text.indexOf(quote) + quote.length,
              alias: `span_source_only_${index}`,
            },
          })),
        })),
      }),
      documentPagePlan: async (request) => ({
        source_guide: {
          overview: "투자 확인 기준과 개인 기록을 구분한다.",
          sections: [{ heading: "전체 근거", summary: "세 근거를 보존한다.", claim_ids: request.claims.map((claim) => claim.claim_id) }],
          key_questions: ["현재 기준과 일치하는가?"],
        },
        topic_pages: [{
          title: "투자 확인 기준",
          purpose: "입지와 권리 확인 기준을 함께 정리한다.",
          claim_ids: request.claims.slice(0, 2).map((claim) => claim.claim_id),
          target_candidate_ids: [],
        }],
        source_only_claim_ids: [request.claims[2].claim_id],
      }),
      documentArticleCompiler: async (request) => ({
        articles: request.pages.map((page) => ({
          page_id: page.page_id,
          sections: [{
            heading: "투자 확인",
            paragraphs: [{ text: "입지와 권리 기준을 함께 확인한다.", claim_ids: page.claim_ids }],
          }],
        })),
      }),
    },
  });
  await runtime.window.KnowledgeExplorerHub.whenKnowledgeInboxSettled();
  assert.equal((await runtime.window.KnowledgeExplorerHub.runDocumentPlan(sourcePath)).ok, true);
  assert.equal((await runtime.window.KnowledgeExplorerHub.compileDocumentPlan()).ok, true);
  const activated = await runtime.window.KnowledgeExplorerHub.activateDocumentPlanReview();
  assert.equal(activated.ok, true, activated.reason);
  const statePath = "SYSTEM/CACHE/llmwiki/batch-job-state.json";
  const state = JSON.parse(await runtime.app.vault.read(runtime.app.vault.getAbstractFileByPath(statePath)));
  assert.equal(state.recovery.approval_sources[0].unresolved_holds, 1);
  assert.equal(await runtime.app.vault.read(runtime.app.vault.getAbstractFileByPath(sourcePath)), sourceBytes);
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
  assert.equal(nextState.recovery.review.document_contract_version, "llmwiki_document_assembler_v2");
  assert.equal(nextState.recovery.review.proposals.length, 1);
  const restoredCandidateGroup = firstElement(second.container, "section", (node) => node.attr?.["data-review-group"] === "candidate");
  const restoredOpen = firstElement(restoredCandidateGroup, "button", (node) => node.attr?.["data-action"] === "open-review-detail");
  restoredOpen.onclick();
  const restoredDetail = collectText(second.openedModals.at(-1).contentEl);
  assert.match(restoredDetail, /요약 결과/u);
  assert.match(restoredDetail, /생성 문서 전체/u);
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
