"use strict";
// 레거시 채택은 "기존 문서에 내용 추가"다: 원문 본문은 한 줄도 사라지면 안 된다.
// 라이브 볼트 상태에 의존하지 않도록 합성 픽스처만 사용한다.
const test = require("node:test");
const assert = require("node:assert/strict");
const { makeItem, openReview, store, LEGACY_PATH, LEGACY_BYTES, LEGACY_REVISION, LEGACY_TITLE, REVIEW_FIELDS } = require("./fixtures/llmwiki_review_fixtures.js");

async function prepareAdoption(item = makeItem()) {
  const harness = await openReview({ item });
  const result = await harness.flow.prepare({ item: harness.item, fields: REVIEW_FIELDS, target_path: LEGACY_PATH, target_revision: LEGACY_REVISION });
  assert.equal(result.ok, true, `prepare must succeed on a legacy target: ${JSON.stringify({ reason: result.reason, gaps: (result.promotion_gaps || []).map((gap) => gap.reason_code) })}`);
  return { after: String(result.value.after), harness };
}

test("레거시 채택은 원문 본문을 줄이지 않고 새 지식을 덧붙인다", async () => {
  const { after } = await prepareAdoption();
  const dropped = LEGACY_BYTES.split("---").pop().split("\n").map((line) => line.trimEnd()).filter((line) => line.trim()).filter((line) => !after.includes(line));
  assert.deepEqual(dropped, [], `원문에서 사라진 줄: ${JSON.stringify(dropped)}`);
  assert.ok(after.includes(`# ${LEGACY_TITLE}`), "원문 H1이 유지돼야 한다");
  assert.ok(after.includes("## 합성 절"), "새 지식이 추가돼야 한다");
  assert.ok(after.indexOf("## 기존 체크리스트") < after.indexOf("## 합성 절"), "새 절은 기존 절 뒤에 붙어야 한다");
});

test("레거시 채택은 원문 frontmatter의 저자 값을 버리지 않는다", async () => {
  const { after } = await prepareAdoption();
  const contexts = [].concat(store.parseFrontmatter(after).data.application_contexts || []);
  assert.ok(contexts.includes("합성 작업"), `원문 사용 맥락이 사라졌다: ${JSON.stringify(contexts)}`);
});
