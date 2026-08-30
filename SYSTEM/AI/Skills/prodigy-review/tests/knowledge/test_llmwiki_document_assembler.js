"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");
const test = require("node:test");

const ROOT = path.resolve(__dirname, "../../../../../..");
const assemblerApi = require(path.join(ROOT, "SYSTEM/Views/llmwiki-document-assembler.js"));

function source() {
  return {
    source_id: "source_album_workflow",
    source_path: "INBOX/앨범 작업 워크플로우.md",
    content_hash: "a".repeat(64),
  };
}

function item(role, claim, start, relatedCandidateIds = [], topic = "") {
  return {
    role,
    ...(topic ? { topic } : {}),
    evidence_quote: claim,
    claims: [{ text: claim }],
    review_reasons: [],
    related_candidate_ids: relatedCandidateIds,
    span: { start, end: start + claim.length, alias: `span_${start}` },
  };
}

function artifact(chunkKey, items) {
  return { chunk_key: chunkKey, outcome: "proposals", items };
}

test("multiple claims from one source become one coherent candidate document", () => {
  const assembler = assemblerApi.createDocumentAssembler();
  const result = assembler.assemble({
    source: source(),
    artifacts: [
      artifact("chunk_album_a", [
        item("reusable_claim", "앨범 작업 전에 보정본을 제외한 원본을 정리한다.", 10),
      ]),
      artifact("chunk_album_b", [
        item("reusable_claim", "커플 사진이 홀수이면 오른쪽 페이지부터 인트로를 시작한다.", 80),
        item("reusable_claim", "가로 퇴장 사진은 양면 파노라마로 배치할 수 있다.", 160),
      ]),
    ],
  });

  assert.equal(result.ok, true, result.reason);
  assert.equal(result.documents.length, 1);
  assert.equal(result.no_changes.length, 0);
  const [document] = result.documents;
  assert.equal(document.role, "reusable_claim");
  assert.equal(document.title, "앨범 작업 워크플로우");
  assert.equal(document.operation_hint, "create");
  assert.equal(document.claims.length, 3);
  assert.equal(document.citations.length, 3);
  assert.match(document.body, /^# 앨범 작업 워크플로우$/mu);
  assert.match(document.body, /^## 핵심 내용$/mu);
  assert.match(document.body, /^## 출처$/mu);
  assert.doesNotMatch(document.body, /^# 앨범 작업 전에 보정본/u);
  assert.notEqual(
    document.body.trim(),
    `# ${document.claims[0].text}\n\n- ${document.claims[0].text}`,
    "a document must not repeat one claim as both title and body",
  );
});

test("source summary and reusable claims become separate document classes, not item files", () => {
  const assembler = assemblerApi.createDocumentAssembler();
  const result = assembler.assemble({
    source: source(),
    artifacts: [artifact("chunk_album", [
      item("source_summary", "이 자료는 웨딩 앨범 편집 순서를 설명한다.", 0),
      item("source_summary", "사진 배치와 페이지 구성 규칙을 함께 다룬다.", 50),
      item("reusable_claim", "가로 퇴장 사진은 양면 파노라마로 배치할 수 있다.", 100),
    ])],
  });

  assert.equal(result.ok, true, result.reason);
  assert.equal(result.documents.length, 2);
  assert.deepEqual(
    result.documents.map((document) => document.role).sort(),
    ["reusable_claim", "source_summary"],
  );
  assert.equal(result.documents.filter((document) => document.role === "source_summary")[0].claims.length, 2);
});

test("one information-rich source becomes one sectioned source document plus coherent topic documents", () => {
  const assembler = assemblerApi.createDocumentAssembler();
  const result = assembler.assemble({
    source: {
      source_id: "source_investment_diary",
      source_path: "INBOX/투놀카페/투놀카페 - 투자일기.md",
      content_hash: "9".repeat(64),
    },
    artifacts: [
      artifact("chunk_investment_a", [
        item("source_summary", "이 기록은 지역 선정과 매수 시점 판단을 함께 다룬다.", 10, [], "투자 판단 개요"),
        item("reusable_claim", "사업 속도가 빠른 지역을 우선 검토한다.", 80, [], "재개발 진입 기준"),
        item("reusable_claim", "초기 투자금보다 추가 분담금 범위를 함께 확인한다.", 150, [], "재개발 진입 기준"),
      ]),
      artifact("chunk_investment_b", [
        item("source_summary", "실패 사례에서는 현금흐름과 과도한 낙찰가가 반복 위험으로 나타난다.", 230, [], "실패 사례"),
        item("reusable_claim", "낙찰가가 단기간에 급등하면 진입을 보류한다.", 320, [], "경매 낙찰가 위험"),
        item("reusable_claim", "임대수익이 이자를 감당하지 못하면 장기 보유하지 않는다.", 400, [], "경매 낙찰가 위험"),
      ]),
    ],
  });

  assert.equal(result.ok, true, result.reason);
  assert.equal(result.contract_version, "llmwiki_document_assembler_v2");
  assert.equal(result.documents.length, 3);
  const sourceDocument = result.documents.find((document) => document.role === "source_summary");
  const topicDocuments = result.documents.filter((document) => document.role === "reusable_claim");
  assert.equal(sourceDocument.title, "투놀카페 - 투자일기 자료 해설");
  assert.deepEqual(sourceDocument.sections.map((section) => section.heading), ["투자 판단 개요", "실패 사례"]);
  assert.match(sourceDocument.body, /^## 주제별 내용$/mu);
  assert.match(sourceDocument.body, /^### 투자 판단 개요$/mu);
  assert.match(sourceDocument.body, /^### 실패 사례$/mu);
  assert.match(sourceDocument.body, /^## 근거 발췌$/mu);
  assert.deepEqual(topicDocuments.map((document) => document.title).sort(), ["경매 낙찰가 위험", "재개발 진입 기준"]);
  assert.deepEqual(topicDocuments.map((document) => document.claims.length).sort(), [2, 2]);
  assert.equal(result.documents.reduce((count, document) => count + document.claims.length, 0), 6);
});

test("canonical coverage returns no_change and blocks duplicate create", () => {
  const claim = "가로 퇴장 사진은 양면 파노라마로 배치할 수 있다.";
  const assembler = assemblerApi.createDocumentAssembler({
    canonicalDocuments: [{
      document_id: "canonical_album_workflow",
      path: "ZETA/PERMANENT/웨딩 앨범 작업 워크플로우.md",
      title: "웨딩 앨범 작업 워크플로우 및 레이아웃 가이드",
      content: `# 웨딩 앨범 작업 워크플로우\n\n## 레이아웃\n\n- ${claim}\n`,
      revision: "b".repeat(64),
    }],
  });
  const result = assembler.assemble({
    source: source(),
    artifacts: [artifact("chunk_album", [item("reusable_claim", claim, 20)])],
  });

  assert.equal(result.ok, true, result.reason);
  assert.equal(result.documents.length, 0, "covered canonical knowledge must not create a new candidate");
  assert.equal(result.no_changes.length, 1);
  assert.equal(result.no_changes[0].operation_hint, "no_change");
  assert.equal(result.no_changes[0].matched_document_id, "canonical_album_workflow");
});

test("trusted related candidates choose one document-level update or merge", () => {
  const candidates = [
    {
      candidate_id: "cand_album",
      path: "ZETA/CANDIDATES/Album.md",
      title: "앨범 작업",
      before_bytes: "# 앨범 작업\n",
      revision: "c".repeat(64),
      content_hash: "d".repeat(64),
    },
    {
      candidate_id: "cand_layout",
      path: "ZETA/CANDIDATES/Layout.md",
      title: "앨범 레이아웃",
      before_bytes: "# 앨범 레이아웃\n",
      revision: "e".repeat(64),
      content_hash: "f".repeat(64),
    },
  ];
  const assembler = assemblerApi.createDocumentAssembler({ candidateDocuments: candidates });

  const update = assembler.assemble({
    source: source(),
    artifacts: [artifact("chunk_update", [
      item("reusable_claim", "원본을 먼저 정리한다.", 10, ["cand_album"]),
      item("reusable_claim", "홀수 사진은 오른쪽에서 시작한다.", 50, ["cand_album"]),
    ])],
  });
  assert.equal(update.documents.length, 1);
  assert.equal(update.documents[0].operation_hint, "update");
  assert.deepEqual(update.documents[0].matched_candidate_ids, ["cand_album"]);

  const merge = assembler.assemble({
    source: source(),
    artifacts: [artifact("chunk_merge", [
      item("reusable_claim", "원본 정리와 레이아웃 규칙을 하나의 절차로 관리한다.", 90, ["cand_album", "cand_layout"]),
    ])],
  });
  assert.equal(merge.documents.length, 1);
  assert.equal(merge.documents[0].operation_hint, "merge");
  assert.deepEqual(merge.documents[0].matched_candidate_ids, ["cand_album", "cand_layout"]);
});
