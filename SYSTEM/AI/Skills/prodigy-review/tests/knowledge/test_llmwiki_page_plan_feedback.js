"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");
const test = require("node:test");

const ROOT = path.resolve(__dirname, "../../../../../..");
const feedbackApi = require(path.join(ROOT, "SYSTEM/Views/llmwiki-page-plan-feedback.js"));
const hash = require(path.join(ROOT, "SYSTEM/Views/llmwiki-hash.js"));

function stable(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stable(value[key])}`).join(",")}}`;
}

function fixture() {
  const source = { source_id: "source_investment", source_path: "INBOX/투자일기.md", content_hash: "a".repeat(64) };
  const claims = [1, 2, 3].map((index) => ({
    claim_id: `claim_${String(index).repeat(24)}`,
    role: "reusable_claim",
    topic: index < 3 ? "토지 인허가" : "건축 비용",
    text: index === 1 ? "맹지라도 현황도로가 있으면 건축허가가 가능할 수 있다."
      : index === 2 ? "도시지역 농지는 개발 가능성을 함께 검토한다."
        : "직영 공사는 비용을 절감한다.",
    citation_ids: [`citation_${String(index).padStart(24, "0")}`],
    suggested_candidate_ids: [],
  }));
  const citations = claims.map((claim, index) => ({
    citation_id: claim.citation_ids[0],
    source_id: source.source_id,
    content_hash: source.content_hash,
    source_path: source.source_path,
    locators: [`${source.source_path}#${index * 10}-${index * 10 + 8}`],
    evidence_quote: `근거 ${index + 1}`,
    confidence: "explicit",
  }));
  const inventoryBody = { inventory_version: "llmwiki_claim_inventory_v3", source, claims, citations };
  const inventory = { ...inventoryBody, inventory_hash: hash.sha256(stable(inventoryBody)) };
  const planBody = {
    plan_version: "llmwiki_page_plan_v1",
    inventory_hash: inventory.inventory_hash,
    source,
    source_guide: {
      title: "투자일기 자료 안내",
      overview: "투자 기록",
      sections: [{ heading: "전체", summary: "전체 내용", claim_ids: claims.map((claim) => claim.claim_id) }],
      key_questions: [],
    },
    pages: [],
    source_only_claim_ids: claims.map((claim) => claim.claim_id),
    status: "pending_review",
    plan_revision: 1,
  };
  return { inventory, plan: { ...planBody, plan_hash: hash.sha256(stable(planBody)) }, claims };
}

test("source-only query returns exact cited claims without writing documents", () => {
  const { inventory, plan } = fixture();
  const result = feedbackApi.querySourceOnly({ inventory, plan, query: "맹지 도시지역 농지" });
  assert.equal(result.ok, true, result.reason);
  assert.equal(result.results.length, 2);
  assert.equal(result.results.every((row) => row.citations.length === 1), true);
  assert.equal(result.writer_count, 0);
});

test("trusted query results can be promoted back into a reviewable page plan", () => {
  const { inventory, plan, claims } = fixture();
  const promoted = feedbackApi.promoteQueryResult({
    inventory,
    plan,
    claim_ids: [claims[0].claim_id, claims[1].claim_id],
    title: "토지 인허가와 도시지역 농지 활용",
    purpose: "맹지와 농지의 개발 가능성을 함께 설명한다.",
  });
  assert.equal(promoted.ok, true, promoted.reason);
  assert.equal(promoted.value.pages.length, 1);
  assert.equal(promoted.value.pages[0].claim_ids.length, 2);
  assert.deepEqual(promoted.value.source_only_claim_ids, [claims[2].claim_id]);
  assert.equal(promoted.value.plan_revision, 2);
  assert.equal(promoted.value.status, "pending_review");
});

test("plan lint reports ambiguous merge authority without changing the plan", () => {
  const { inventory, plan, claims } = fixture();
  const riskyBody = {
    ...plan,
    pages: [{
      page_id: `page_${"9".repeat(24)}`,
      title: "중복 후보",
      purpose: "중복 후보를 병합한다.",
      claim_ids: [claims[0].claim_id, claims[1].claim_id],
      target_candidate_ids: ["cand_a", "cand_b"],
      operation_hint: "merge",
      evidence_count: 2,
      selected: true,
    }],
    source_only_claim_ids: [claims[2].claim_id],
    plan_revision: 2,
  };
  delete riskyBody.plan_hash;
  const risky = { ...riskyBody, plan_hash: hash.sha256(stable(riskyBody)) };
  const lint = feedbackApi.lintPlan({ inventory, plan: risky });
  assert.equal(lint.ok, true, lint.reason);
  assert.equal(lint.proposals.length, 1);
  assert.equal(lint.proposals[0].reason, "explicit_merge_destination_required");
  assert.equal(lint.writer_count, 0);
});
