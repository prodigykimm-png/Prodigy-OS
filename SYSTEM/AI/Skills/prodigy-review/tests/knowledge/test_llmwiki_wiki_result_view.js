"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");
const test = require("node:test");

const ROOT = path.resolve(__dirname, "../../../../../..");
const controller = require(path.join(ROOT, "SYSTEM/Views/knowledge-explorer-controller.js"));
const { FakeElement, collectText } = require("./knowledge_explorer_view_fakes.js");

function walk(node, predicate, hits = []) {
  if (!node) return hits;
  if (predicate(node)) hits.push(node);
  for (const child of node.children || []) walk(child, predicate, hits);
  return hits;
}

function item(overrides) {
  return {
    destination: "none",
    review_state: "pending",
    analysis_state: "complete",
    summary_points: [],
    promotion_gaps: [],
    plan: true,
    ...overrides,
  };
}

function mount(items) {
  const container = new FakeElement("section");
  const opened = [];
  const related = [];
  const renames = [];
  controller.mountKnowledgeReviewWorkbench({
    container,
    items,
    commands: { createKnowledgeCommandController() { return { execute() { return { ok: true }; } }; } },
    detailsApi: {},
    detail: { open(value) { opened.push(value.review_id); }, close() {} },
    onPlanApprove: () => ({ ok: true }),
    onPlanMerge: () => ({ ok: true }),
    onPlanToggle: () => ({ ok: true }),
    onPlanRename: (item, proposal) => { renames.push({ item, proposal }); return { ok: true }; },
    onOpenRelated: (target) => related.push(target),
  });
  return { container, opened, related, renames };
}

function fixture() {
  return [
    item({
      review_id: "plan_topic_b",
      plan_kind: "topic_page",
      plan_page_id: "page_b",
      plan_order: 2,
      plan_selected: true,
      title: "거래와 협상",
      plan_purpose: "거래 조건과 협상 실행을 검토한다.",
      plan_claim_count: 2,
      plan_taxonomy: "real-estate/transaction",
      operation: "create",
    }),
    item({
      review_id: "plan_guide_retail",
      plan_kind: "source_guide",
      title: "상가 자료 Wiki",
      wiki_result: {
        overview: "상가의 입지와 거래 조건을 판단하기 위한 자료다.",
        total_claims: 8,
        source_only_count: 1,
        possible_gap_count: 0,
        hold_count: 0,
        guide_sections: [{
          heading: "입지 판단",
          paragraphs: [{
            text: "18mm 광각 렌즈의 가장자리 왜곡을 확인한다.",
            claim_ids: ["claim_location"],
            citation_ids: ["citation_location"],
            citations: [{ citation_id: "citation_location", locators: ["INBOX/상가.md#10-20"] }],
          }, {
            text: "거래 조건을 원문 근거와 함께 검토한다.",
            claim_ids: ["claim_trade"],
            citation_ids: ["citation_trade"],
            citations: [{ citation_id: "citation_trade", locators: ["INBOX/상가.md#30-40"] }],
          }],
        }],
      },
    }),
    item({
      review_id: "plan_topic_a",
      plan_kind: "topic_page",
      plan_page_id: "page_a",
      plan_order: 1,
      plan_selected: true,
      title: "입지와 상권",
      plan_purpose: "상권 지속성과 입지 조건을 판단한다.",
      plan_claim_count: 2,
      plan_taxonomy: "real-estate/location",
      operation: "create",
    }),
  ];
}

test("plan group renders one readable Wiki result in source order", () => {
  const { container } = mount(fixture());
  const result = walk(container, (node) => node.attr && node.attr["data-surface"] === "llmwiki-wiki-result");
  assert.equal(result.length, 1);
  assert.equal(result[0].attr["data-result-stage"], "plan");
  const text = collectText(result[0]).replace(/\s+/g, " ").trim();
  assert.match(text, /상가 문서 계획 미리보기/);
  assert.match(text, /상가의 입지와 거래 조건을 판단하기 위한 자료다/);
  assert.match(text, /근거 문장 8개 · 예정 문서 2개 · 원문 전용 1건 · 누락 검토 0건 · 보류 0건/);
  assert.match(text, /추천 읽기 순서/);
  assert.ok(text.indexOf("입지와 상권") < text.indexOf("거래와 협상"), "plan_order must own the reading order");
  assert.match(text, /상권 지속성과 입지 조건을 판단한다/);
  assert.match(text, /근거 2개/);
  assert.doesNotMatch(text, /\bSource Guide\b|\bcreate\b|\bpending_review\b|real-estate\/location/u);
});

test("compiled rows replace page-plan cards with actual Wiki documents", () => {
  const planned = fixture().map((row) => ({ ...row, review_state: "approved" }));
  const compiled = [
    item({
      review_id: "compiled_guide",
      plan_kind: "compiled_document",
      compiled_kind: "source_guide",
      title: "상가 자료 안내",
      wiki_result: {
        overview: "상가 판단 자료에서 승인 계획에 따라 생성한 Wiki 결과다.",
        total_claims: 8,
        source_only_count: 1,
        possible_gap_count: 0,
        hold_count: 0,
        quality_status: "draft",
        quality_rewrite_count: 1,
        guide_sections: fixture().find((row) => row.plan_kind === "source_guide").wiki_result.guide_sections,
      },
      document_body: "# 상가 자료 안내",
    }),
    item({
      review_id: "compiled_a",
      plan_kind: "compiled_document",
      compiled_kind: "topic_article",
      compiled_order: 1,
      title: "입지와 상권",
      plan_purpose: "상권 지속성과 입지 조건을 판단한다.",
      plan_claim_count: 2,
      document_body: "# 입지와 상권",
    }),
    item({
      review_id: "compiled_b",
      plan_kind: "compiled_document",
      compiled_kind: "topic_article",
      compiled_order: 2,
      title: "거래와 협상",
      plan_purpose: "거래 조건과 협상 실행을 검토한다.",
      plan_claim_count: 2,
      document_body: "# 거래와 협상",
    }),
  ];
  const { container } = mount([...planned, ...compiled]);
  const result = walk(container, (node) => node.attr && node.attr["data-surface"] === "llmwiki-wiki-result")[0];
  const text = collectText(result).replace(/\s+/g, " ").trim();
  assert.equal(result.attr["data-result-stage"], "compiled");
  assert.match(text, /상가 Wiki 결과 미리보기/);
  assert.match(text, /근거 문장 8개 · 결과 문서 2개 · 원문 전용 1건/);
  const qualityStatus = walk(result, (node) => node.attr && node.attr["data-wiki-quality-status"] === "draft");
  assert.equal(qualityStatus.length, 1);
  const guideParagraphs = compiled[0].wiki_result.guide_sections.flatMap((section) => section.paragraphs);
  const projectedGuideParagraphs = walk(result, (node) => node.attr && node.attr["data-wiki-guide-paragraph"] === "");
  assert.equal(projectedGuideParagraphs.length, guideParagraphs.length);
  assert.deepEqual(
    projectedGuideParagraphs.map((node) => node.attr["data-wiki-guide-claim-ids"].split(" ")),
    guideParagraphs.map((paragraph) => paragraph.claim_ids),
  );
  assert.deepEqual(
    projectedGuideParagraphs.map((node) => node.attr["data-wiki-guide-citation-ids"].split(" ")),
    guideParagraphs.map((paragraph) => paragraph.citation_ids),
  );
  assert.deepEqual(
    projectedGuideParagraphs.map((node) => JSON.parse(node.attr["data-wiki-guide-citations"])),
    guideParagraphs.map((paragraph) => paragraph.citations),
  );
  assert.equal(walk(result, (node) => node.attr && node.attr["data-compiled-document"]).length, 2);
  assert.equal(walk(result, (node) => node.attr && node.attr["data-wiki-topic"]).length, 0);
  assert.equal(walk(container, (node) => node.attr && node.attr["data-action"] === "approve-page-plan").length, 0);
  assert.equal(walk(container, (node) => node.attr && node.attr["data-action"] === "merge-plan-pages").length, 0);
  const navigation = walk(result, (node) => node.tag === "button" && node.attr && node.attr["data-action"] === "jump-wiki-document");
  const cards = walk(result, (node) => node.attr && node.attr["data-compiled-document"]);
  assert.equal(navigation.length, 2);
  assert.equal(cards[0].attr.tabindex, "-1");
  navigation[0].onclick({ preventDefault() {} });
  assert.equal(cards[0].focused, true, "reading navigation must move focus to the matching result");
});

test("Wiki result keeps review controls without duplicating generic plan rows", () => {
  const { container, opened } = mount(fixture());
  const result = walk(container, (node) => node.attr && node.attr["data-surface"] === "llmwiki-wiki-result")[0];
  const detailButtons = walk(result, (node) => node.tag === "button" && node.attr && node.attr["data-action"] === "open-review-detail");
  const mergeChecks = walk(result, (node) => node.tag === "input" && node.attr && node.attr["data-action"] === "select-plan-merge");
  const genericRows = walk(container, (node) => node.attr && node.attr["data-review-plan"] === "true" && !node.attr["data-wiki-topic"]);
  assert.equal(detailButtons.length, 3, "guide and both drafts remain inspectable");
  assert.equal(mergeChecks.length, 2);
  assert.equal(genericRows.length, 0, "the readable result replaces generic plan rows");
  const extraActions = walk(result, (node) => node.tag === "details" && node.attr && node.attr["data-wiki-actions"]);
  assert.equal(extraActions.length, 2, "secondary plan operations stay collapsed per document");
  assert.equal(walk(extraActions[0], (node) => node.attr && node.attr["data-action"] === "select-plan-merge").length, 1);
  detailButtons[1].onclick();
  assert.equal(opened.length, 1);
});

test("plan mismatch renders one explicit recommended-title action", () => {
  const rows = fixture();
  const topic = rows.find((row) => row.plan_page_id === "page_b");
  topic.plan_lint_proposal = {
    proposal_id: "lint_title_page_b",
    page_id: "page_b",
    reason: "title_claim_boundary_mismatch",
    suggested_title: "거래와 협상",
    suggested_purpose: "거래와 협상 판단을 설명한다.",
  };
  const { container, renames } = mount(rows);
  const button = walk(container, (node) => node.tag === "button"
    && node.attr?.["data-action"] === "apply-plan-title-suggestion");

  assert.equal(button.length, 1);
  const approve = walk(container, (node) => node.tag === "button"
    && node.attr?.["data-action"] === "approve-page-plan")[0];
  assert.equal(approve.disabled, true);
  assert.equal(approve.text, "추천 제목 확인 후 문서 생성");
  button[0].onclick();
  assert.equal(renames.length, 1);
  assert.equal(renames[0].item.plan_page_id, "page_b");
  assert.equal(renames[0].proposal.suggested_title, "거래와 협상");
});

test("Wiki result ships a dedicated responsive visual hierarchy", () => {
  const { container } = mount(fixture());
  const style = walk(container, (node) => node.tag === "style" && node.attr && node.attr.id === "llmwiki-wiki-result-styles")[0];
  assert.ok(style);
  assert.match(style.text, /\[data-surface="llmwiki-wiki-result"\]\{[^}]*display:grid/u);
  assert.match(style.text, /\[data-wiki-document-map\][^{]*\{[^}]*grid-template-columns/u);
  assert.match(style.text, /@media\(max-width:833px\)/u);
  assert.match(style.text, /-webkit-line-clamp:3/u);
  assert.match(style.text, /font-size:clamp\(1\.5rem,6vw,2rem\)/u);
  assert.match(style.text, /\[data-wiki-reading-order\] button\{[^}]*-webkit-line-clamp:2/u);
  assert.match(style.text, /@media\(max-width:320px\)/u);
  assert.match(style.text, /:focus-visible/u);
});

test("empty plans render a source-only result without dead controls", () => {
  const { container } = mount([
    item({
      review_id: "plan_guide_personal",
      plan_kind: "source_guide",
      title: "개인 프로젝트 자료 Wiki",
      wiki_result: {
        overview: "재사용 문서 없이 원문에만 보존한다.",
        total_claims: 8,
        source_only_count: 8,
        possible_gap_count: 0,
        hold_count: 0,
      },
    }),
  ]);
  const text = collectText(container).replace(/\s+/g, " ").trim();
  assert.match(text, /예정 문서 0개 · 원문 전용 8건/);
  assert.doesNotMatch(text, /추천 읽기 순서|계획 승인 후 문서 생성|선택 문서 병합/);
});

test("excluded pages leave the reading order and remain recoverable", () => {
  const items = fixture();
  items[0] = { ...items[0], plan_selected: false };
  items[1] = { ...items[1], wiki_result: { ...items[1].wiki_result, hold_count: 1 } };
  const { container } = mount(items);
  const result = walk(container, (node) => node.attr && node.attr["data-surface"] === "llmwiki-wiki-result")[0];
  const orderText = collectText(walk(result, (node) => node.attr && node.attr["data-wiki-reading-order"] !== undefined)[0]);
  const held = walk(result, (node) => node.attr && node.attr["data-wiki-held-topics"] !== undefined)[0];
  assert.match(orderText, /입지와 상권/);
  assert.doesNotMatch(orderText, /거래와 협상/);
  assert.match(collectText(held), /계획에서 제외한 문서.*거래와 협상/su);
  assert.match(collectText(result), /예정 문서 1개 · 원문 전용 1건 · 누락 검토 0건 · 보류 1건/);
  assert.ok(walk(held, (node) => node.tag === "button" && node.text === "계획 포함").length === 1);
});

test("Wiki result shows only readable canonical relations", () => {
  const items = fixture();
  items[2] = {
    ...items[2],
    related_knowledge: [
      { title: "상권 분석 기본 원칙", path: "PARA/RESOURCES/Knowledge/상권 분석 기본 원칙.md", relation: "duplicate", covered_claim_count: 2 },
      { title: "경로 없는 후보", path: "", relation: "compatible_new", covered_claim_count: 1 },
      { title: "근거 없는 제목 후보", path: "ZETA/PERMANENT/근거 없는 제목 후보.md", relation: "compatible_new", covered_claim_count: 0 },
      { title: "두 번째 관련 문서", path: "ZETA/PERMANENT/두 번째 관련 문서.md", relation: "compatible_new", covered_claim_count: 1 },
      { title: "세 번째 관련 문서", path: "ZETA/PERMANENT/세 번째 관련 문서.md", relation: "compatible_new", covered_claim_count: 1 },
    ],
  };
  const { container, related } = mount(items);
  const result = walk(container, (node) => node.attr && node.attr["data-surface"] === "llmwiki-wiki-result")[0];
  const panel = walk(result, (node) => node.attr && node.attr["data-related-knowledge"] !== undefined)[0];
  const text = collectText(panel);
  assert.match(text, /관련 Knowledge.*상권 분석 기본 원칙.*기존 문서 보강 후보 · 관련 근거 2개/su);
  assert.doesNotMatch(text, /경로 없는 후보|근거 없는 제목 후보|candidate_|coverage_ratio/u);
  assert.match(text, /두 번째 관련 문서/u);
  assert.doesNotMatch(text, /세 번째 관련 문서/u);
  assert.equal(walk(panel, (node) => node.attr && node.attr["data-action"] === "open-related-knowledge").length, 2);
  const open = walk(panel, (node) => node.tag === "button" && node.attr && node.attr["data-action"] === "open-related-knowledge")[0];
  open.onclick({ preventDefault() {} });
  assert.deepEqual(related, ["PARA/RESOURCES/Knowledge/상권 분석 기본 원칙.md"]);
});
