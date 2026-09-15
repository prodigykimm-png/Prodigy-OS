"use strict";
// 산출물 검증기: 각 검사가 이름 있는 코드로 잡히는지 고정한다.
// 픽스처는 검증기 임계값(문장 20자·6토큰, 문서 120토큰)을 넘도록 구성한다.
const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const fx = require("./fixtures/llmwiki_review_fixtures.js");
const validator = require(path.join(fx.V, "llmwiki-produced-document-validator.js"));

const FN = "\\\\n";
const clean = [
  "---",
  'type: "knowledge"',
  'schema_version: 2',
  'statement: "청약 자격은 무주택 여부로 판단한다"',
  "---",
  "# 합성 문서",
  "",
  "무주택 여부는 청약 자격 판단의 기준이 되며 세대 구성과 보유 자산을 함께 확인해야 한다. [원문](INBOX/%EC%84%9C%EC%9A%B8%ED%88%AC%EC%9E%90%EB%B0%98.md#합성%20헤딩)",
  "",
  "## 사용자 검토 범위",
  "- 적용 조건: 청약 자격을 판단할 때",
  "- 재검토 조건: 규정이 바뀌면 재검토한다.",
  "",
].join("\n");

test("정상 문서는 지적이 없다", () => {
  const report = validator.auditDocuments({ documents: [{ path: "a.md", content: clean }], sources: {} });
  assert.equal(report.ok, true, JSON.stringify(report.findings));
});

test("원시 인용 프래그먼트를 잡는다", () => {
  const bad = clean.replace("#합성%20헤딩", "#L12");
  const report = validator.auditDocuments({ documents: [{ path: "b.md", content: bad }], sources: {} });
  assert.ok(report.counts.raw_citation_fragment >= 1, JSON.stringify(report.counts));
});

test("닫히지 않은 따옴표를 잡는다", () => {
  const bad = clean.replace('statement: "청약 자격은 무주택 여부로 판단한다"', 'statement: "청약 자격은 무주택 여부로 판단한다');
  const report = validator.auditDocuments({ documents: [{ path: "c.md", content: bad }], sources: {} });
  assert.ok(report.counts.frontmatter_invalid >= 1, JSON.stringify(report.counts));
});

test("정상 다중행 스칼라는 오탐하지 않는다", () => {
  const good = clean.replace('statement: "청약 자격은 무주택 여부로 판단한다"', `statement: "첫 문장입니다.${FN}둘째 문장입니다."`);
  const report = validator.auditDocuments({ documents: [{ path: "c2.md", content: good }], sources: {} });
  assert.equal(report.counts.frontmatter_invalid, undefined, JSON.stringify(report.counts));
});

test("statement 중복 문장을 잡는다", () => {
  const bad = clean.replace(
    'statement: "청약 자격은 무주택 여부로 판단한다"',
    `statement: "청약 자격은 무주택 여부로 판단한다.${FN}청약 자격은 무주택 여부로 판단한다."`,
  );
  const report = validator.auditDocuments({ documents: [{ path: "d.md", content: bad }], sources: {} });
  assert.ok(report.counts.statement_duplicate >= 1, JSON.stringify(report.counts));
});

test("검토 범위 누락을 잡는다", () => {
  const bad = clean.replace("- 재검토 조건: 규정이 바뀌면 재검토한다.\n", "");
  const report = validator.auditDocuments({ documents: [{ path: "e.md", content: bad }], sources: {} });
  assert.ok(report.counts.scope_incomplete >= 1, JSON.stringify(report.counts));
});

test("검토 범위는 v2 정본 지식에만 요구하고 Literature와 Fleeting에는 요구하지 않는다", () => {
  const literature = '---\nschema_version: 2\ntype: literature_note\nsource_id: source_fixture\nstatement: "닫히지 않은 값\n---\n# 자료 안내\n';
  const fleeting = '---\nschema_version: 2\ntype: fleeting_note\nfleeting_id: fleeting_fixture\nstatement: "닫히지 않은 값\n---\n# 임시 생각\n';
  const report = validator.auditDocuments({
    documents: [
      { path: "ZETA/LITERATURE/source.md", content: literature },
      { path: "ZETA/FLEETING/thought.md", content: fleeting },
    ],
    sources: {},
  });
  assert.equal(report.ok, true, JSON.stringify(report.findings));
  assert.deepEqual(report.findings, []);
});

test("본문 중복 문장을 잡는다", () => {
  const sentence = "무주택 여부는 청약 자격 판단의 기준이 되며 세대 구성과 보유 자산을 함께 확인해야 한다.";
  const bad = clean.replace(sentence, `${sentence} ${sentence}`);
  const report = validator.auditDocuments({ documents: [{ path: "f.md", content: bad }], sources: {} });
  assert.ok(report.counts.body_duplicate_claim >= 1, JSON.stringify(report.counts));
});

test("원문에 없는 인용을 잡는다", () => {
  const report = validator.auditDocuments({ documents: [{ path: "g.md", content: clean, citations: ["원문에 없는 문구"] }], sources: { "INBOX/x.md": "다른 내용" } });
  assert.ok(report.counts.citation_missing >= 1, JSON.stringify(report.counts));
});

test("문서 간 근접 중복을 잡는다", () => {
  const long = Array.from({ length: 30 }, (_, index) => `세대 구성과 보유 자산을 확인하는 절차 ${index} 단계에서는 서류와 등기 상태를 함께 점검해야 한다.`).join("\n");
  const one = clean.replace("무주택 여부는 청약 자격 판단의 기준이 되며 세대 구성과 보유 자산을 함께 확인해야 한다.", long);
  const two = one.replace("# 합성 문서", "# 합성 문서 2");
  const report = validator.auditDocuments({ documents: [{ path: "h1.md", content: one }, { path: "h2.md", content: two }], sources: {} });
  assert.ok(report.counts.near_duplicate_document >= 1, JSON.stringify(report.counts));
});
