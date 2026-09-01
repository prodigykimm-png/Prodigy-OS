"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");
const test = require("node:test");

const ROOT = path.resolve(__dirname, "../../../../../..");
const detail = require(path.join(ROOT, "SYSTEM/Views/knowledge-explorer-detail-modal.js"));
const { FakeElement, collectText } = require("./knowledge_explorer_view_fakes.js");

function walk(node, predicate, hits = []) {
  if (!node) return hits;
  if (predicate(node)) hits.push(node);
  for (const child of node.children || []) walk(child, predicate, hits);
  return hits;
}

function groundedItem() {
  const citation = {
    number: 1,
    citation_id: "citation_a",
    source_id: "source_a",
    source_path: "INBOX/상가.md",
    locator: "INBOX/상가.md#120-150",
    content_hash: "a".repeat(64),
    evidence_quote: "상가 수익률을 알아야 예상 매도가격 계산 가능",
  };
  return {
    review_id: "plan_page_a",
    title: "입지와 상권",
    plan_purpose: "상권 지속성과 입지 조건을 판단한다.",
    review_state: "pending",
    grounded_claims: [
      { claim_id: "claim_a", text: "상가 수익률로 예상 매도가격을 검토한다.", citations: [citation] },
      { claim_id: "claim_b", text: "상권 분석을 개별 물건보다 먼저 수행한다.", citations: [{ ...citation }] },
    ],
    sources: [{ locator: citation.locator }],
    related_knowledge: [
      { title: "상권 분석 기본 원칙", path: "PARA/RESOURCES/Knowledge/상권 분석 기본 원칙.md", relation: "duplicate", covered_claim_count: 2 },
    ],
    coverage: { complete: true, status: "계획 claim coverage 완료" },
    document_body: "# 기계용 preview\n\n- 원시 claim",
  };
}

function compiledItem() {
  const first = {
    number: 1,
    citation_id: "citation_a",
    source_path: "INBOX/상가.md",
    locator: "INBOX/상가.md#120-150",
    evidence_quote: "첫 번째 근거",
  };
  const second = {
    number: 2,
    citation_id: "citation_b",
    source_path: "INBOX/상가.md",
    locator: "INBOX/상가.md#200-230",
    evidence_quote: "두 번째 근거",
  };
  return {
    review_id: "compiled_page_a",
    title: "입지와 상권",
    compiled_kind: "topic_article",
    plan_purpose: "상권 지속성과 입지 조건을 판단한다.",
    grounded_claims: [
      { claim_id: "claim_a", text: "첫 주장", citations: [first] },
      { claim_id: "claim_b", text: "두 번째 주장", citations: [second] },
    ],
    compiled_sections: [
      {
        heading: "가격 판단",
        paragraphs: [
          { text: "임대료와 수익률로 예상 가격을 계산한다.", claim_ids: ["claim_a"] },
          { text: "입지와 거래 조건을 함께 검토한다.", claim_ids: ["claim_a", "claim_b"] },
        ],
      },
    ],
    document_body: "# raw markdown must stay hidden",
    sources: [{ locator: first.locator }, { locator: second.locator }],
    coverage: { complete: true, status: "승인 계획 기반 compile 완료" },
  };
}

test("compiled reader renders structured paragraphs with exact claim citations", () => {
  const root = new FakeElement("section");
  const opened = [];
  detail.renderDetail(root, compiledItem(), {
    onOpenSource() {},
    onOpenCitation(citation) { opened.push(citation.citation_id); },
    onClose() {},
  });
  const text = collectText(root);
  assert.match(text, /이 문서가 다루는 것.*가격 판단.*임대료와 수익률로 예상 가격을 계산한다/su);
  assert.doesNotMatch(text, /raw markdown|핵심 내용|claim_a/u);
  const paragraphs = walk(root, (node) => node.attr && node.attr["data-compiled-paragraph"]);
  assert.equal(paragraphs.length, 2);
  const firstCitations = walk(paragraphs[0], (node) => node.attr && node.attr["data-action"] === "open-grounded-citation");
  const secondCitations = walk(paragraphs[1], (node) => node.attr && node.attr["data-action"] === "open-grounded-citation");
  assert.deepEqual(firstCitations.map((node) => node.text), ["[1]"]);
  assert.deepEqual(secondCitations.map((node) => node.text), ["[1]", "[2]"]);
  firstCitations[0].onclick({ preventDefault() {} });
  assert.deepEqual(opened, ["citation_a"]);
  const style = walk(root, (node) => node.tag === "style" && node.attr && node.attr.id === "llmwiki-result-reader-styles")[0];
  assert.ok(style);
  assert.match(style.text, /knowledge-review-detail-modal__citations[^}]*display:inline-flex/u);
  assert.match(style.text, /open-grounded-citation[^}]*inline-size:auto/u);
  assert.match(style.text, /@media\(max-width:640px\)/u);
});

test("compiled reader never invents evidence for an unmapped paragraph claim", () => {
  const root = new FakeElement("section");
  const item = compiledItem();
  item.compiled_sections[0].paragraphs.push({ text: "연결되지 않은 문장", claim_ids: ["claim_missing"] });
  detail.renderDetail(root, item, { onOpenSource() {}, onOpenCitation() {}, onClose() {} });
  const paragraph = walk(root, (node) => node.attr && node.attr["data-compiled-paragraph"] === "3")[0];
  assert.match(collectText(paragraph), /연결되지 않은 문장.*근거 연결 확인 필요/su);
  assert.equal(walk(paragraph, (node) => node.attr && node.attr["data-action"] === "open-grounded-citation").length, 0);
});

test("compiled source guide renders overview and structured sections", () => {
  const root = new FakeElement("section");
  const item = compiledItem();
  item.compiled_kind = "source_guide";
  item.wiki_result = { overview: "상가 판단 자료 전체를 안내한다." };
  item.compiled_sections = [
    { heading: "가격 판단", summary: "가격과 수익률 관련 근거를 모은다.", claim_ids: ["claim_a"] },
  ];
  detail.renderDetail(root, item, { onOpenSource() {}, onOpenCitation() {}, onClose() {} });
  const text = collectText(root);
  assert.match(text, /자료 개요.*상가 판단 자료 전체를 안내한다.*가격 판단.*가격과 수익률 관련 근거를 모은다.*\[1\]/su);
  assert.doesNotMatch(text, /raw markdown|핵심 내용/u);
  assert.equal(walk(root, (node) => node.attr && node.attr["data-guide-section"]).length, 1);
});

test("grounded detail reads as a document with inline citations", () => {
  const root = new FakeElement("section");
  const opened = [];
  const related = [];
  detail.renderDetail(root, groundedItem(), {
    onOpenSource() {},
    onOpenCitation(citation) { opened.push(citation); },
    onOpenRelated(target) { related.push(target); },
    onClose() {},
  });
  const text = collectText(root);
  assert.match(text, /이 문서가 다루는 것.*상권 지속성과 입지 조건을 판단한다/su);
  assert.match(text, /핵심 내용.*상가 수익률로 예상 매도가격을 검토한다/su);
  assert.equal((text.match(/\[근거 1\]/gu) || []).length, 2, "the same evidence keeps one stable citation number");
  assert.match(text, /출처.*상가\.md/su);
  assert.doesNotMatch(text, /상가\.md#120-150/u);
  assert.doesNotMatch(text, /기계용 preview|claim_a|기원|도출 경로|수정 충돌/u);
  const citations = walk(root, (node) => node.tag === "button" && node.attr && node.attr["data-action"] === "open-grounded-citation");
  assert.equal(citations.length, 2);
  citations[0].onclick({ preventDefault() {} });
  assert.equal(opened[0].evidence_quote, "상가 수익률을 알아야 예상 매도가격 계산 가능");
  const relatedButton = walk(root, (node) => node.tag === "button" && node.attr && node.attr["data-action"] === "open-related-knowledge")[0];
  assert.match(text, /관련 Knowledge.*상권 분석 기본 원칙.*기존 문서 보강 후보/su);
  relatedButton.onclick({ preventDefault() {} });
  assert.deepEqual(related, ["PARA/RESOURCES/Knowledge/상권 분석 기본 원칙.md"]);
});

test("source preview exposes exact evidence, context, and safe editing", () => {
  const root = new FakeElement("section");
  const actions = [];
  detail.renderSourcePreview(root, {
    ok: true,
    status: "current",
    match_status: "unique",
    source_path: "INBOX/상가.md",
    evidence_quote: "상가 수익률을 알아야 예상 매도가격 계산 가능",
    context: "앞 문장\n상가 수익률을 알아야 예상 매도가격 계산 가능\n뒤 문장",
    position: { line: 11, ch: 3 },
  }, {
    onOpenSource(preview) { actions.push(["open", preview.source_path]); },
    onEditSource(preview) { actions.push(["edit", preview.position]); },
    onClose() { actions.push(["close"]); },
  });
  const text = collectText(root);
  assert.match(text, /출처 근거/);
  assert.match(text, /현재 원문과 일치/);
  assert.match(text, /상가 수익률을 알아야 예상 매도가격 계산 가능/);
  assert.match(text, /앞 문장.*뒤 문장/su);
  const edit = walk(root, (node) => node.tag === "button" && node.text === "원문 수정")[0];
  const open = walk(root, (node) => node.tag === "button" && node.text === "원문 파일 열기")[0];
  assert.ok(edit);
  assert.ok(open);
  edit.onclick({ preventDefault() {} });
  open.onclick({ preventDefault() {} });
  assert.deepEqual(actions, [["edit", { line: 11, ch: 3 }], ["open", "INBOX/상가.md"]]);
});

test("source editing stays hidden when evidence position is ambiguous", () => {
  const root = new FakeElement("section");
  detail.renderSourcePreview(root, {
    ok: true,
    status: "current",
    match_status: "ambiguous",
    source_path: "INBOX/상가.md",
    evidence_quote: "중복 근거",
    context: "",
    position: null,
  }, { onOpenSource() {}, onEditSource() {}, onClose() {} });
  assert.equal(walk(root, (node) => node.tag === "button" && node.text === "원문 수정").length, 0);
});

test("stale source preview can open context but never offers exact source editing", () => {
  const root = new FakeElement("section");
  detail.renderSourcePreview(root, {
    ok: true,
    status: "stale",
    match_status: "unique",
    source_path: "INBOX/상가.md",
    evidence_quote: "옮겨진 근거",
    context: "옮겨진 근거",
    position: { line: 20, ch: 1 },
  }, { onOpenSource() {}, onEditSource() {}, onClose() {} });
  assert.equal(walk(root, (node) => node.tag === "button" && node.text === "원문 파일 열기").length, 1);
  assert.equal(walk(root, (node) => node.tag === "button" && node.text === "원문 수정").length, 0);
});
