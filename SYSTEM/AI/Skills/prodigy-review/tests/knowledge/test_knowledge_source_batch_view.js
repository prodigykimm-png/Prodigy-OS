"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { ROOT, allText, field, button, deferred, titleFor, validInput, mount, prepareAndInterpret } = require("./knowledge_source_batch_view_fixture.js");
const { testUrlEditAfterPrepareInvalidatesPreparedSnapshotBeforeAnyRetrieval, testSavePendingBlocksAiProviderUntilAllRowsSettle } = require("./test_knowledge_source_batch_view_preflight_race.js");

function testKoreanDomStateAndInputBoundsAreSafeBeforeRetrieval() {
  const fixture = mount();
  assert.match(allText(fixture.root), /문헌노트 묶음/);
  assert.ok(field(fixture.root, "urls_text"));
  assert.equal(field(fixture.root, "urls_text").attr["aria-label"], "문헌노트 URL 목록");
  assert.equal(field(fixture.root, "source_kind").value, "article");
  assert.ok(button(fixture.root, "공개 자료 가져오기"));
  assert.match(allText(fixture.root), /한 줄에 하나씩, 최대 20개/);
  assert.equal(fixture.controller.prepare(), true);
  assert.equal(fixture.controller.rows().length, 2);
  fixture.mounted.render();
  assert.match(allText(fixture.root), /queued|대기/);
  assert.match(allText(fixture.root), /재사용 가능한 지식으로 남기기/);

  const invalid = mount({ initialValues: validInput({ urls_text: "file:///private/a" }) });
  assert.equal(invalid.controller.prepare(), false);
  assert.equal(invalid.retrievalCalls.length, 0);
  assert.match(invalid.controller.state().error, /HTTP\(S\)|URL/);
  const oversized = mount({ initialValues: validInput({ urls_text: Array.from({ length: 21 }, (_, index) => `https://news.example.test/${index}`).join("\n") }) });
  assert.equal(oversized.controller.prepare(), false);
  assert.equal(oversized.retrievalCalls.length, 0);
  assert.match(oversized.controller.state().error, /20/);
}

async function testExplicitRetrievalFallbackAndOneAiBatchCall() {
  let retrieval = 0;
  const fixture = mount({ retrievalService: {
    async retrieveArticle(item, options) {
      retrieval += 1;
      if (item.source_url.endsWith("/b")) return { item_id: item.item_id, status: "fallback_required" };
      options.onRetrieved("가져온 공개 기사 본문입니다.", { title: "가져온 기사", publisher: "신문" });
      return { item_id: item.item_id, status: "retrieved", title: "가져온 기사", publisher: "신문" };
    }
  } });
  prepareAndInterpret(fixture);
  assert.equal(fixture.providerCalls.length, 0, "open/paste/prepare never invokes AI");
  assert.equal(await fixture.controller.retrieve(), true);
  assert.equal(retrieval, 2, "retrieval follows only explicit button action");
  assert.deepEqual(fixture.controller.rows().map((row) => row.status), ["retrieved", "fallback"]);
  assert.equal(fixture.controller.canSummarize(), false, "fallback requires user text");
  const fallback = fixture.controller.rows()[1];
  fixture.controller.updateRow(fallback.item_id, { fallback_text: "사용자가 제공한 차단 기사 메모입니다.", source_title: "차단 기사" });
  assert.equal(fixture.controller.canSummarize(), true);
  assert.equal(await fixture.controller.summarize(), true);
  assert.equal(fixture.providerCalls.length, 1);
  assert.equal(await fixture.controller.summarize(), false, "active batch sends one provider request only");
  const first = fixture.controller.rows()[0];
  fixture.controller.updateRow(first.item_id, { ai_summary: "사람이 고친 AI 요약", ai_uncertainty: "편집한 불확실성" });
  assert.equal(fixture.controller.rows()[0].ai_summary, "사람이 고친 AI 요약");
  assert.equal(Object.hasOwn(fixture.controller.rows()[0], "retrieved_text"), false, "raw retrieved content never reaches DOM state");
}

async function testSaveNeedsHumanInterpretationAndCandidateIsExplicitExactAndRetrySafe() {
  let candidateFails = true;
  const fixture = mount({ createCandidate: async (candidate) => {
    fixture.candidateWrites.push(candidate);
    if (candidateFails) { candidateFails = false; throw new Error("candidate rejected"); }
    return { candidate_id: "candidate-ok" };
  } });
  prepareAndInterpret(fixture);
  await fixture.controller.retrieve();
  await fixture.controller.summarize();
  const first = fixture.controller.rows()[0];
  fixture.controller.updateRow(first.item_id, { create_candidate: true, my_interpretation: "" });
  fixture.controller.updateRow(fixture.controller.rows()[1].item_id, { my_interpretation: "" });
  assert.equal(await fixture.controller.saveSelected(), false);
  assert.equal(fixture.sourceWrites.length, 0, "missing human one-line blocks all source writes");
  fixture.controller.updateRow(first.item_id, { my_interpretation: "첫 번째 사람이 확인한 해석" });
  fixture.controller.updateRow(fixture.controller.rows()[1].item_id, { my_interpretation: "두 번째 사람이 확인한 해석" });
  assert.equal(await fixture.controller.saveSelected(), false, "Candidate failure is recoverable after source success");
  assert.equal(fixture.sourceWrites.length, 2, "each selected source saves once");
  assert.equal(fixture.candidateWrites.length, 1);
  assert.deepEqual(fixture.candidateWrites[0].source_objects, [`[[ZETA/LITERATURE/${fixture.sourceWrites[0].source_title}]]`]);
  assert.equal(fixture.controller.rows()[0].source.status, "saved");
  assert.match(fixture.controller.rows()[0].candidate_error, /후보/);
  assert.equal(await fixture.controller.retryCandidate(first.item_id), true);
  assert.equal(fixture.sourceWrites.length, 2, "candidate retry never duplicates source note");
  assert.equal(fixture.candidateWrites.length, 2);
  assert.equal(fixture.controller.rows()[0].candidate.candidate_id, "candidate-ok");
}

async function testPartialFailureRetryCancelStaleAndDoubleClickPreserveDraft() {
  const pending = deferred();
  let calls = 0;
  const fixture = mount({ retrievalService: {
    retrieveArticle(item, options) {
      calls += 1;
      if (calls === 1) return pending.promise;
      options.onRetrieved("재개된 공개 기사 본문입니다.", { title: titleFor(item) });
      return Promise.resolve({ item_id: item.item_id, status: "retrieved", title: titleFor(item) });
    }
  } });
  prepareAndInterpret(fixture);
  const retrieve = fixture.controller.retrieve();
  assert.equal(await fixture.controller.retrieve(), false, "double-click does not duplicate retrieval");
  fixture.controller.cancelActive();
  pending.resolve({ item_id: fixture.controller.rows()[0].item_id, status: "retrieved", title: "stale" });
  assert.equal(await retrieve, false);
  assert.equal(fixture.controller.rows()[0].status, "cancelled");
  assert.equal(fixture.controller.rows()[0].my_interpretation, "사람의 한 줄 해석 1", "cancel preserves user values");
  assert.equal(await fixture.controller.retrieve(), true, "explicit resume starts a fresh service request");
  assert.equal(calls, 3);

  const sourceFiles = ["knowledge-source-batch-state.js", "knowledge-source-batch-controller.js", "knowledge-source-batch-render.js", "knowledge-source-batch-view.js"];
  const source = sourceFiles.map((name) => fs.readFileSync(path.join(ROOT, "SYSTEM/Views", name), "utf8")).join("\n");
  assert.doesNotMatch(source, /\bfetch\s*\(|requestUrl|\bVault\b|provider\.complete|openai/i);
  assert.match(fs.readFileSync(path.join(ROOT, "SYSTEM/Views/knowledge-source-batch-controller.js"), "utf8"), /AbortController/);
}

async function testProviderFailureKeepsEditableValuesForOneExplicitRetry() {
  let calls = 0;
  const fixture = mount({ batchService: {
    async summarizeSuppliedText(items) {
      calls += 1;
      if (calls === 1) return { status: "provider_error", items: [] };
      return { status: "ai", items: items.map((item) => ({ item_id: item.item_id, summary: `${item.item_id} 재시도 요약`, uncertainties: ["확인 필요"] })) };
    },
    cancelCurrent() {}
  } });
  prepareAndInterpret(fixture);
  await fixture.controller.retrieve();
  const before = fixture.controller.rows()[0].my_interpretation;
  assert.equal(await fixture.controller.summarize(), false);
  assert.equal(fixture.controller.canSummarize(), true, "provider failure permits one new explicit retry");
  assert.equal(fixture.controller.rows()[0].my_interpretation, before);
  assert.equal(await fixture.controller.summarize(), true);
  assert.equal(calls, 2);
}

async function testPartialSourceFailureRetriesOnlyTheUnsavedRow() {
  const attempts = [];
  const fixture = mount({ sourceStore: {
    async saveSource(_app, source) {
      attempts.push(source.source_title);
      if (attempts.length === 1) throw new Error("first row collision");
      return { link: `[[ZETA/LITERATURE/${source.source_title}]]`, source_id: source.source_id };
    }
  } });
  prepareAndInterpret(fixture);
  await fixture.controller.retrieve();
  await fixture.controller.summarize();
  assert.equal(await fixture.controller.saveSelected(), false);
  assert.equal(fixture.controller.rows()[1].source.status, "saved");
  assert.equal(await fixture.controller.saveSelected(), true);
  assert.equal(attempts.filter((title) => title === fixture.controller.rows()[1].source.link.replace(/^\[\[ZETA\/LITERATURE\//, "").replace(/\]\]$/, "")).length, 1, "saved row is not written again on partial retry");
}

function testResponsiveFocusEscapeAndNoRawContentRendering() {
  const fixture = mount();
  assert.equal(field(fixture.root, "urls_text").focused, true, "first interactive field receives focus");
  prepareAndInterpret(fixture);
  fixture.mounted.render();
  assert.match(allText(fixture.root), /긴 한글|대기/);
  let prevented = false;
  fixture.mounted.onKeydown({ key: "Escape", preventDefault() { prevented = true; } });
  assert.equal(prevented, true);
  assert.equal(fixture.controller.state().closed, false, "first Escape keeps dirty batch safe");
  fixture.mounted.onKeydown({ key: "Escape", preventDefault() {} });
  assert.equal(fixture.controller.state().closed, true);
  assert.equal(fixture.root.children.length, 0, "close clears fake DOM");
}

async function main() {
  testKoreanDomStateAndInputBoundsAreSafeBeforeRetrieval();
  await testExplicitRetrievalFallbackAndOneAiBatchCall();
  await testUrlEditAfterPrepareInvalidatesPreparedSnapshotBeforeAnyRetrieval();
  await testSavePendingBlocksAiProviderUntilAllRowsSettle();
  await testSaveNeedsHumanInterpretationAndCandidateIsExplicitExactAndRetrySafe();
  await testPartialFailureRetryCancelStaleAndDoubleClickPreserveDraft();
  await testProviderFailureKeepsEditableValuesForOneExplicitRetry();
  await testPartialSourceFailureRetriesOnlyTheUnsavedRow();
  testResponsiveFocusEscapeAndNoRawContentRendering();
  console.log("Knowledge source batch view tests passed");
}

main().catch((error) => { console.error(error.stack || error.message); process.exitCode = 1; });
