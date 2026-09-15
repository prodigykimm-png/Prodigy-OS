"use strict";
// 원문에 같은 문구가 반복될 때 인용 게이트(고유 인용)를 어떻게 통과하는지 두 경로를 고정한다:
//  ① 컴파일 단계가 준 locator 범위가 그 인용을 특정하면 그 위치를 쓴다(공급된 근거 그대로).
//  ② 쓸 만한 범위가 없으면 문맥을 넓혀 고유 구간을 만든다. 둘 다 안 되면 정직하게 막는다.
const test = require("node:test");
const assert = require("node:assert/strict");
const fx = require("./fixtures/llmwiki_review_fixtures.js");

const REPEATED = "학군은 실거주 수요의 핵심이다.";
const SOURCE_PATH = fx.SOURCE_PATH;
const SOURCE = [
  "# 합성 반복 소스",
  "",
  "첫 번째 문단",
  REPEATED,
  "가격 상승 기대와는 별개로 본다.",
  "",
  "두 번째 문단",
  REPEATED,
  "유동인구가 많은 상권과는 다른 축이다.",
  "",
].join("\n");
const REVISION = fx.hash.sha256(SOURCE);

function repeatedQuoteItem(locator) {
  const citation = { source_id: fx.SOURCE_ID, source_path: SOURCE_PATH, locator, content_hash: REVISION, evidence_quote: REPEATED };
  return {
    review_id: "plan_compiled_synthetic_repeat",
    title: "합성 반복 인용 페이지",
    plan: true,
    plan_kind: "compiled_document",
    plan_page_id: "page_synthetic_repeat",
    compiled_kind: "topic_article",
    compiled_order: 1,
    plan_purpose: "합성 목적",
    document_body: `# 합성 반복 인용 페이지\n\n${REPEATED}\n`,
    compiled_sections: [{ heading: "합성 절", paragraphs: [{ text: REPEATED, claim_ids: ["claim_repeat"] }] }],
    grounded_claims: [{ claim_id: "claim_repeat", text: REPEATED, citations: [citation] }],
    related_knowledge: [],
    proposed_target: null,
  };
}

test("locator 범위가 인용을 특정하면 그 위치를 쓴다(인용문은 그대로)", async () => {
  const item = repeatedQuoteItem(`${SOURCE_PATH}#L4`);
  const harness = await fx.openReview({ item, files: { [SOURCE_PATH]: SOURCE } });
  const prepared = await harness.flow.prepare({ item, fields: fx.REVIEW_FIELDS, target_path: fx.LEGACY_PATH, target_revision: fx.LEGACY_REVISION });
  assert.equal(prepared.ok, true, `prepare: ${prepared.reason || ""} ${JSON.stringify((prepared.promotion_gaps || []).map(gap => gap.reason_code))}`);
  assert.equal(item.grounded_claims[0].citations[0].evidence_quote, REPEATED, "범위로 특정됐으면 인용문을 바꾸지 않는다");
});

test("쓸 만한 범위가 없으면 문맥을 넓혀 고유 구간으로 만든다", async () => {
  const item = repeatedQuoteItem(SOURCE_PATH);
  const harness = await fx.openReview({ item, files: { [SOURCE_PATH]: SOURCE } });
  const prepared = await harness.flow.prepare({ item, fields: fx.REVIEW_FIELDS, target_path: fx.LEGACY_PATH, target_revision: fx.LEGACY_REVISION });
  assert.equal(prepared.ok, true, `prepare: ${prepared.reason || ""}`);
  const widened = item.grounded_claims[0].citations[0].evidence_quote;
  assert.notEqual(widened, REPEATED, "반복 인용이 그대로 통과했다");
  const first = SOURCE.indexOf(widened);
  assert.ok(first >= 0, "확장 인용이 원문에 없다");
  assert.equal(SOURCE.indexOf(widened, first + 1), -1, "확장 후에도 고유하지 않다");
  assert.ok(widened.includes(REPEATED), "확장 인용은 원래 문구를 포함해야 한다");
});

test("범위 locator가 두 번째 등장을 가리키면 그 위치를 쓴다(확장 없음)", async () => {
  const second = SOURCE.indexOf(REPEATED, SOURCE.indexOf(REPEATED) + 1);
  const item = repeatedQuoteItem(`${SOURCE_PATH}#${second}-${second + 40}`);
  const harness = await fx.openReview({ item, files: { [SOURCE_PATH]: SOURCE } });
  const prepared = await harness.flow.prepare({ item, fields: fx.REVIEW_FIELDS, target_path: fx.LEGACY_PATH, target_revision: fx.LEGACY_REVISION });
  assert.equal(prepared.ok, true, `prepare: ${prepared.reason || ""}`);
  assert.equal(item.grounded_claims[0].citations[0].evidence_quote, REPEATED, "범위로 특정됐으면 인용을 넓히지 않는다");
});

test("locator가 어긋나면 첫 등장으로 물러서지 않고 실패한다(폐쇄)", async () => {
  // 두 등장(4행·8행) 뒤인 9행을 가리키는 locator → 의도 위치에서 인용을 찾을 수 없다.
  const item = repeatedQuoteItem(`${SOURCE_PATH}#L9`);
  const harness = await fx.openReview({ item, files: { [SOURCE_PATH]: SOURCE } });
  const prepared = await harness.flow.prepare({ item, fields: fx.REVIEW_FIELDS, target_path: fx.LEGACY_PATH, target_revision: fx.LEGACY_REVISION });
  assert.equal(prepared.ok, false, "어긋난 locator로 조용히 통과하면 안 된다");
  assert.equal(prepared.reason, "unique_evidence_quote_required", JSON.stringify(prepared));
  assert.equal(item.grounded_claims[0].citations[0].evidence_quote, REPEATED, "실패 시 인용을 바꾸지 않는다");
});
