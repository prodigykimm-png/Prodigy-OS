"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");
const test = require("node:test");

const ROOT = path.resolve(__dirname, "../../../../../..");
const plannerApi = require(path.join(ROOT, "SYSTEM/Views/llmwiki-document-merge-planner.js"));
const hash = require(path.join(ROOT, "SYSTEM/Views/llmwiki-hash.js"));

function candidate(id, title, body) {
  return {
    candidate_id: id,
    path: `ZETA/CANDIDATES/${title}.md`,
    title,
    before_bytes: body,
    revision: hash.sha256(body),
    content_hash: hash.sha256(body),
  };
}

function document(matchedCandidateIds) {
  return {
    contract_version: "llmwiki_document_compiler_v1",
    document_kind: "topic_article",
    role: "reusable_claim",
    page_id: `page_${"1".repeat(24)}`,
    title: "직영 건축의 비용과 기간",
    purpose: "직영 공사와 철골조 선택의 효과를 설명한다.",
    sections: [{ heading: "비용과 공기", paragraphs: [{ text: "직영 공사는 비용을 줄인다.", claim_ids: [`claim_${"2".repeat(24)}`] }] }],
    paragraphs: [{ text: "직영 공사는 비용을 줄인다.", claim_ids: [`claim_${"2".repeat(24)}`] }],
    claims: [{ claim_id: `claim_${"2".repeat(24)}`, text: "직영 공사는 비용을 줄인다.", citation_ids: ["citation_1"] }],
    citations: [{ citation_id: "citation_1", locators: ["INBOX/투자일기.md#10-20"] }],
    matched_candidate_ids: matchedCandidateIds,
    related_candidate_ids: matchedCandidateIds,
    operation_hint: matchedCandidateIds.length > 1 ? "merge" : matchedCandidateIds.length === 1 ? "update" : "create",
    review_reasons: [],
    body: "# 직영 건축의 비용과 기간\n\n## 비용과 공기\n\n직영 공사는 비용을 줄인다.\n",
  };
}

test("candidate update replaces exactly one owned managed region", () => {
  const start = "<!-- llmwiki-managed:start page_111111111111111111111111 -->";
  const end = "<!-- llmwiki-managed:end page_111111111111111111111111 -->";
  const before = `# 기존 건축 문서\n\n수동 머리말\n\n${start}\n\n이전 자동 내용\n\n${end}\n\n수동 꼬리말\n`;
  const existing = candidate("cand_build", "기존 건축 문서", before);
  const result = plannerApi.planDocumentMutation({ document: document(["cand_build"]), candidate_documents: [existing] });
  assert.equal(result.ok, true, result.reason);
  assert.equal(result.value.kind, "update");
  assert.equal(result.value.after_bytes.startsWith(`# 기존 건축 문서\n\n수동 머리말\n\n${start}`), true);
  assert.equal(result.value.after_bytes.endsWith(`${end}\n\n수동 꼬리말\n`), true);
  assert.match(result.value.after_bytes, /직영 공사는 비용을 줄인다/u);
  assert.equal((result.value.after_bytes.match(/llmwiki-managed:start/gu) || []).length, 1);
});

test("candidate without an owned region is held instead of appended", () => {
  const before = "# 기존 건축 문서\n\n수동 문서\n";
  const result = plannerApi.planDocumentMutation({ document: document(["cand_build"]), candidate_documents: [candidate("cand_build", "기존 건축 문서", before)] });
  assert.equal(result.value.kind, "hold");
  assert.equal(result.value.reason, "managed_region_required");
  assert.equal(Object.hasOwn(result.value, "after_bytes"), false);
});

test("duplicate managed markers are held", () => {
  const marker = "<!-- llmwiki-managed:start page_111111111111111111111111 -->";
  const end = "<!-- llmwiki-managed:end page_111111111111111111111111 -->";
  const before = `# 문서\n${marker}\na\n${end}\n${marker}\nb\n${end}\n`;
  const result = plannerApi.planDocumentMutation({ document: document(["cand_build"]), candidate_documents: [candidate("cand_build", "기존 건축 문서", before)] });
  assert.equal(result.value.kind, "hold");
  assert.equal(result.value.reason, "managed_region_invalid");
});

test("ambiguous existing-candidate merge is held instead of overwriting multiple documents", () => {
  const first = candidate("cand_build", "기존 건축 문서", "# 기존 건축 문서\n");
  const second = candidate("cand_cost", "기존 비용 문서", "# 기존 비용 문서\n");
  const result = plannerApi.planDocumentMutation({
    document: document(["cand_build", "cand_cost"]),
    candidate_documents: [first, second],
  });

  assert.equal(result.ok, true, result.reason);
  assert.equal(result.value.kind, "hold");
  assert.equal(result.value.reason, "explicit_merge_destination_required");
  assert.deepEqual(result.value.candidate_ids, ["cand_build", "cand_cost"]);
  assert.equal(Object.hasOwn(result.value, "after_bytes"), false);
});
