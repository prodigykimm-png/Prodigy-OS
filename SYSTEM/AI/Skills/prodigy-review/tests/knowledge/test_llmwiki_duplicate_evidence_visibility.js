"use strict";
// 중복이라고 말하면 무엇과 겹치는지 보여 줘야 한다: 상대 문서·문장·원문 보기, 그리고
// 원시 코드 대신 상대 문서를 밝힌 한국어 차단 문구. 합성 픽스처만 사용한다.
const test = require("node:test");
const assert = require("node:assert/strict");
const fx = require("./fixtures/llmwiki_review_fixtures.js");

function duplicateItem(reviewId, { withSentences = true } = {}) {
  const row = { title: fx.LEGACY_TITLE, path: fx.LEGACY_PATH, relation: "duplicate", covered_claim_count: 1 };
  if (withSentences) row.covered_claims = [fx.OVERLAP_SENTENCE];
  return fx.makeItem({ reviewId, related: [row] });
}

test("중복 추천이면 겹치는 문서와 문장을 검토 화면에서 볼 수 있다", async () => {
  const { modal, item } = await fx.openReview({ item: duplicateItem("plan_compiled_synthetic_dup_1") });
  assert.ok(fx.byAttr(modal.contentEl, "data-knowledge-overlap")[0], "겹치는 기존 지식 블록이 있어야 한다");
  const documents = fx.byAttr(modal.contentEl, "data-overlap-document");
  assert.equal(documents.length, 1);
  assert.equal(documents[0].attr["data-overlap-document"], fx.LEGACY_PATH);
  const sentences = fx.byAttr(modal.contentEl, "data-overlap-claim");
  assert.equal(sentences.length, 1);
  assert.equal(sentences[0].textContent, fx.OVERLAP_SENTENCE);
  assert.equal(fx.field(modal.contentEl, "relation_status").value, "duplicate", "겹치는 문서가 있으면 중복이 추천된다");
});

test("겹치는 문장이 없어도 상대 문서 원문을 열어 판단할 수 있다", async () => {
  const { modal } = await fx.openReview({ item: duplicateItem("plan_compiled_synthetic_dup_2", { withSentences: false }) });
  const button = fx.byAttr(modal.contentEl, "data-overlap-view")[0];
  assert.ok(button, "원문 보기 조작이 있어야 한다");
  const preview = fx.byAttr(modal.contentEl, "data-overlap-body")[0];
  assert.equal(preview.hidden, true, "처음에는 접혀 있어야 한다");
  await button.onclick();
  assert.equal(preview.hidden, false);
  assert.ok(preview.textContent.includes("# 합성 레거시 가이드"), preview.textContent.slice(0, 80));
});

test("중복으로 막힐 때 원시 코드 대신 상대 문서와 실제 조작을 알린다", async () => {
  const { modal } = await fx.openReview({ item: duplicateItem("plan_compiled_synthetic_dup_3") });
  const prepareButton = fx.byAction(modal.contentEl, "prepare-document-review");
  await prepareButton.onclick();
  const text = fx.statusText(modal.contentEl);
  assert.equal(text.includes("unresolved_duplicate"), false, `원시 코드가 노출됐다: ${text}`);
  assert.ok(text.includes(fx.LEGACY_TITLE), `상대 문서를 밝혀야 한다: ${text}`);
  const labels = ["review-later", "reject-document-review"].map((action) => {
    const button = fx.byAction(modal.contentEl, action);
    assert.ok(button, action + " 조작이 결정 바에 있어야 한다");
    return (button.textContent || "").trim();
  });
  assert.deepEqual(labels, ["보류", "반려"], "문구가 부르는 이름과 버튼 이름이 같아야 한다");
  assert.ok(text.includes("보류") && text.includes("반려"), text);
});

test("반려는 제안을 닫고 초안을 보존한다", async () => {
  const harness = await fx.openReview({ item: duplicateItem("plan_compiled_synthetic_dup_4") });
  const rejectButton = fx.byAction(harness.modal.contentEl, "reject-document-review");
  await rejectButton.onclick();
  const record = Object.values((await harness.jobStore.getPlanSnapshot(harness.jobId)).canonical_reviews || {})[0];
  assert.equal(record.status, "rejected");
  assert.equal(record.rejection.reason, "user_rejected");
  assert.ok(record.pending_draft, "반려해도 초안은 보존한다");
  const attempts = (harness.jobStore.getJob(harness.jobId).attempts || []).map((row) => row.observation);
  assert.ok(attempts.includes("user_rejected"), JSON.stringify(attempts.slice(-3)));
  assert.equal(harness.modal.closed, true, "반려하면 검토가 닫힌다");
});
