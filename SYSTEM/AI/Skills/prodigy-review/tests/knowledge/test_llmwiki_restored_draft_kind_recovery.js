"use strict";
// 저장된 초안이 그 문서 내용으로 채울 수 없는 종류(원칙)를 재생하면 변경안 확인이 영원히 막힌다.
// 합성 픽스처만 사용하고, 초안은 실제 검토 화면 경로로 저장한다.
const test = require("node:test");
const assert = require("node:assert/strict");
const fx = require("./fixtures/llmwiki_review_fixtures.js");

test("저장된 초안의 종류가 내용으로 충족되지 않으면 다시 계산되고 초안은 보존된다", async () => {
  const item = fx.makeItem({ reviewId: "plan_compiled_synthetic_draft" });
  const first = await fx.openReview({ item });
  const kindInput = fx.field(first.modal.contentEl, "knowledge_kind");
  kindInput.value = "principle";
  await kindInput.oninput();
  first.modal.close();
  const stored = Object.values((await first.jobStore.getPlanSnapshot(first.jobId)).canonical_reviews || {})[0];
  assert.ok(stored?.pending_draft, "초안이 저장되어야 한다");
  assert.equal(stored.pending_draft.fields.knowledge_kind, "principle", "초안에 저장된 종류가 있어야 한다");

  const second = await fx.restoreAgain(first);
  const kind = fx.field(second.modal.contentEl, "knowledge_kind").value;
  assert.notEqual(kind, "principle", "내용으로 채울 수 없는 종류는 다시 계산되어야 한다");
  const notice = fx.byAttr(second.modal.contentEl, "data-kind-recalculated")[0];
  assert.ok(notice, "재계산 사실을 화면에 알려야 한다");
  assert.equal(notice.attr["data-kind-recalculated"], "principle");
});

test("새 compiled 페이지는 내용으로 채울 수 있는 종류로 열린다", async () => {
  const item = fx.makeItem({ reviewId: "plan_compiled_synthetic_fresh" });
  const harness = await fx.openReview({ item });
  const kind = fx.field(harness.modal.contentEl, "knowledge_kind").value;
  const available = { ...fx.reviewModule.analysisDefaults(item), ...{ conditions: fx.CLAIM_ONE } };
  assert.ok(fx.reviewModule.kindContentSatisfiable(kind, available), `추천 종류가 내용으로 충족돼야 한다: ${kind}`);
  assert.equal(fx.byAttr(harness.modal.contentEl, "data-kind-content-requirement").length, 0, "빈 내용으로 막히면 안 된다");
  const prepared = await harness.flow.prepare({ item, fields: { ...fx.REVIEW_FIELDS, knowledge_kind: kind }, target_path: fx.LEGACY_PATH, target_revision: fx.LEGACY_REVISION });
  assert.notEqual(prepared.reason, "promotion_review_required", `종류 내용 게이트로 막히면 안 된다: ${JSON.stringify(prepared.promotion_gaps || [])}`);
});

test("저장된 내용으로 충족되는 종류는 덮어쓰지 않는다", async () => {
  const item = fx.makeItem({ reviewId: "plan_compiled_synthetic_draft_2" });
  const first = await fx.openReview({ item });
  const kindInput = fx.field(first.modal.contentEl, "knowledge_kind");
  kindInput.value = "claim";
  await kindInput.oninput();
  first.modal.close();
  const second = await fx.restoreAgain(first);
  assert.equal(fx.field(second.modal.contentEl, "knowledge_kind").value, "claim", "충족되는 저장 종류는 소유자 결정으로 유지한다");
});
