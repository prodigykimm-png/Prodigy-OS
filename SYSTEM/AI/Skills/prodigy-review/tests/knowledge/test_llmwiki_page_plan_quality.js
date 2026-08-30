"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");
const test = require("node:test");

const ROOT = path.resolve(__dirname, "../../../../../..");
const quality = require(path.join(ROOT, "SYSTEM/Views/llmwiki-page-plan-quality.js"));

function claim(index) {
  return { claim_id: `claim_${index.toString(16).padStart(24, "0")}`, role: "reusable_claim", text: `claim ${index}`, citation_ids: [`citation_${index}`] };
}
function page(index, title, count, target = []) {
  return {
    page_id: `page_${index.toString(16).padStart(24, "0")}`, title, purpose: `${title} 절차를 설명한다.`,
    claim_ids: Array.from({ length: count }, (_x, offset) => claim(index * 10 + offset).claim_id),
    target_candidate_ids: target, operation_hint: target.length ? "update" : "create", evidence_count: count, selected: true,
  };
}
function fixture(pages, reusableClaims) {
  const claims = Array.from({ length: reusableClaims }, (_x, index) => claim(index + 1));
  const plan = {
    plan_version: "llmwiki_page_plan_v1", inventory_hash: "a".repeat(64),
    source: { source_id: "source_quality", source_path: "INBOX/quality.md", content_hash: "b".repeat(64) },
    source_guide: { title: "Guide", overview: "overview", sections: [], key_questions: [] },
    pages, source_only_claim_ids: [], status: "pending_review", plan_revision: 1, plan_hash: "c".repeat(64),
  };
  return { inventory: { inventory_version: "llmwiki_claim_inventory_v1", claims, citations: [] }, plan };
}

test("adaptive budget preserves investment density and rejects song fragmentation", () => {
  assert.equal(quality.adaptivePageBudget(60), 13);
  assert.equal(quality.adaptivePageBudget(39), 9);
  const investment = quality.evaluate(fixture(Array.from({ length: 13 }, (_x, index) => page(index + 1, `투자 문서 ${index + 1}`, 4)), 60));
  assert.equal(investment.status, "pass");
  const songPages = [
    page(1, "부동산 명도 협상", 2), page(2, "점유이전금지가처분", 2),
    page(3, "강제집행 및 보관집행", 4), page(4, "부당이득금 반환청구", 2),
    ...Array.from({ length: 7 }, (_x, index) => page(index + 5, `독립 문서 ${index + 1}`, 4)),
  ];
  const song = quality.evaluate(fixture(songPages, 39));
  assert.equal(song.status, "revision_required");
  assert.equal(song.findings.some((finding) => finding.code === "fragmented_workflow"), true);
  assert.equal(song.findings.some((finding) => finding.code === "page_budget_exceeded"), true);
  const revised = quality.revise({ ...fixture(songPages, 39), candidates: [] });
  assert.equal(revised.ok, true);
  assert.equal(revised.value.pages.length, 8);
  assert.equal(revised.after.status, "pass");
});

test("weak candidate update rejects while duplicate and contradiction stay explicit", () => {
  const assigned = page(1, "유치권 검증 및 인도명령", 4, ["cand_rights"]);
  const base = fixture([assigned], 4);
  base.inventory.claims = assigned.claim_ids.map((claimId, index) => ({
    claim_id: claimId, role: "reusable_claim", text: `유치권 claim ${index + 1}`, citation_ids: [`citation_${index + 1}`],
  }));
  const weak = quality.evaluate({ ...base, candidates: [{ candidate_id: "cand_rights", title: "취득세와 증여세", purpose: "세금을 설명한다.", body: "증여세" }] });
  assert.equal(weak.findings.some((finding) => finding.code === "weak_candidate_update"), true);
  const duplicateClaim = base.inventory.claims.find((row) => row.claim_id === assigned.claim_ids[0]);
  duplicateClaim.text = "유치권 확인이 필요하다.";
  const duplicateBody = base.inventory.claims.map((row) => row.text).join("\n");
  const duplicate = quality.evaluate({ ...base, candidates: [{ candidate_id: "cand_rights", title: assigned.title, purpose: assigned.purpose, body: duplicateBody }] });
  assert.equal(duplicate.findings.some((finding) => finding.code === "candidate_duplicate"), true);
  duplicateClaim.text = "유치권 확인이 필요하다.";
  const contradiction = quality.evaluate({ ...base, candidates: [{ candidate_id: "cand_rights", title: assigned.title, purpose: assigned.purpose, body: "유치권 확인이 불필요하다." }] });
  assert.equal(contradiction.findings.some((finding) => finding.code === "candidate_contradiction"), true);
});
