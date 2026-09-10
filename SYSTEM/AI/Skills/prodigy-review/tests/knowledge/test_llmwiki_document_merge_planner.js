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

test("managed region retains rendered sections and never embeds draft frontmatter", () => {
  const start = "<!-- llmwiki-managed:start page_111111111111111111111111 -->";
  const end = "<!-- llmwiki-managed:end page_111111111111111111111111 -->";
  const before = `# 기존 건축 문서\n\n수동 머리말\n\n${start}\n\n이전 자동 내용\n\n${end}\n\n수동 꼬리말\n`;
  const existing = candidate("cand_build", "기존 건축 문서", before);
  const drafted = document(["cand_build"]);
  drafted.body = `---\ntags:\n  - knowledge/general/reference\n---\n# 직영 건축의 비용과 기간\n\n## 비용과 공기\n\n직영 공사는 비용을 줄인다.\n`;
  const result = plannerApi.planDocumentMutation({ document: drafted, candidate_documents: [existing] });
  assert.equal(result.ok, true, result.reason);
  assert.equal(result.value.kind, "update");
  assert.equal(result.value.after_bytes.includes("tags:"), false);
  assert.equal(result.value.after_bytes.includes("knowledge/general/reference"), false);
  assert.match(result.value.after_bytes, /## 비용과 공기[\s\S]*직영 공사는 비용을 줄인다/u);
});
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

test("whole-body supplement replaces the managed body without duplicating it (characterization)", () => {
  const pageId = "page-task3";
  const start = `<!-- llmwiki-managed:start ${pageId} -->`;
  const end = `<!-- llmwiki-managed:end ${pageId} -->`;
  const before = `# Wiki A\n\n${start}\n\n## Wiki A\n\nAlpha body\n\n${end}`;
  const result = plannerApi.planDocumentMutation({
    document: {
      document_kind: "topic_article", page_id: pageId, title: "Wiki A",
      body: "# Wiki A\n\nAlpha body\n\nMaterial B new fact", matched_candidate_ids: ["cand-task3"],
    },
    candidate_documents: [candidate("cand-task3", "task3", before)],
  });
  assert.equal(result.ok, true);
  assert.equal(result.value.kind, "update");
  assert.equal(result.value.after_bytes, `# Wiki A\n\n${start}\n\n## Wiki A\n\nAlpha body\n\nMaterial B new fact\n\n${end}`);
  assert.equal(result.value.after_bytes.split("Alpha body").length - 1, 1);
});

test("supplement body survives stale sections, preserves user bytes and footers, and replays unchanged", () => {
  const drafted = document(["cand_build"]);
  const start = `<!-- llmwiki-managed:start ${drafted.page_id} -->`;
  const end = `<!-- llmwiki-managed:end ${drafted.page_id} -->`;
  const prefix = "---\r\nuser: keep\r\n---\r\n# USER_TITLE\r\n\r\nUSER_FIRST  \r\nUSER_SECOND\n\n";
  const suffix = "\n\nUSER_THIRD\t\nUSER_LAST  \r\n";
  const content = "Brand-new material B\n\n## 출처\n\n- SOURCE_B\n\n## 확인 필요\n\n- REVIEW_B";
  drafted.body = `---\ntags: [draft]\n---\n# ${drafted.title}\n\n${content}\n`;
  const before = `${prefix}${start}\n\nOLD_MANAGED\n\n${end}${suffix}`;
  const result = plannerApi.planDocumentMutation({ document: drafted, candidate_documents: [candidate("cand_build", "task8", before)] });
  assert.equal(result.ok, true);
  assert.equal(result.value.kind, "update");
  const after = result.value.after_bytes;
  assert.equal(after.includes("Brand-new material B"), true, "new body content must not be omitted when sections are stale");
  assert.equal(after, `${prefix}${start}\n\n## ${drafted.title}\n\n${content}\n\n${end}${suffix}`);
  for (const token of ["SOURCE_B", "REVIEW_B", "## 출처", "## 확인 필요"]) assert.equal(after.split(token).length - 1, 1);
  assert.equal(result.value.after_revision, hash.sha256(after));
  const replay = plannerApi.planDocumentMutation({ document: drafted, candidate_documents: [candidate("cand_build", "task8", after)] });
  assert.equal(replay.value.kind, "no_change");
  assert.equal(Object.hasOwn(replay.value, "after_bytes"), false);
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
