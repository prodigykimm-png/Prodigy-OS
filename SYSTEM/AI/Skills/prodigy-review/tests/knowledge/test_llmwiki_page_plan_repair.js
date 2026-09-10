"use strict";

// Failing-first proof for deterministic page-plan coverage repair:
// a structurally valid draft that drops/duplicates/unknowns claim ids must
// be repaired (review-visible buckets + audit) instead of failing with
// invalid_page_plan_coverage, which retry can never fix. Wholesale drops
// (>50%) and shape violations must still reject.

const assert = require("node:assert/strict");
const path = require("node:path");
const { test } = require("node:test");

const ROOT = path.resolve(__dirname, "../../../../../..");
const reducerApi = require(path.join(ROOT, "SYSTEM/Views/llmwiki-document-reducer.js"));

function makeInventory() {
  const claims = ["기록 일지", "체크리스트", "동선 계획", "장비 점검", "백업 절차", "공유 규칙"];
  const inventory = reducerApi.createClaimInventory({
    source: { source_id: "source_repair", source_path: "INBOX/repair.md", content_hash: "d".repeat(64) },
    documents: [{
      contract_version: "llmwiki_document_assembler_v2",
      role: "source_summary",
      title: "수리 기록",
      claims: claims.map((text) => ({ text })),
      citations: claims.map((_text, index) => ({
        source_id: "source_repair",
        content_hash: "d".repeat(64),
        source_path: "INBOX/repair.md",
        locators: [`INBOX/repair.md#${index * 10}-${index * 10 + 8}`],
        evidence_quote: `근거 ${index}`,
        confidence: "explicit",
      })),
      sections: [{ heading: "수리 기록", claims: claims.map((text) => ({ text })) }],
      review_reasons: [],
      matched_candidate_ids: ["cand_repair"],
      operation_hint: "create",
      body: "",
    }],
  });
  assert.equal(inventory.ok, true, inventory.reason);
  return inventory.value;
}

function plannerFor(draft) {
  return async () => draft;
}

function guideHolding(ids) {
  return {
    overview: "자료 전체 개요이다",
    sections: [{ heading: "전체 묶음", summary: "모든 근거를 한데 묶는다", claim_ids: [...ids] }],
    key_questions: [],
  };
}

test("dropped claims are repaired into source_only with audit", async () => {
  const inventory = makeInventory();
  const ids = inventory.claims.map((claim) => claim.claim_id);
  const draft = {
    source_guide: guideHolding(ids.slice(0, 4)),
    topic_pages: [{
      title: "정리 문서",
      purpose: "누락된 근거를 제외하고 정리한다",
      claim_ids: ids.slice(0, 3),
      target_candidate_ids: ["cand_repair"],
    }],
    source_only_claim_ids: [],
  };
  const planner = reducerApi.createPagePlanner({ allowedCandidateIds: ["cand_repair"], requestPlan: plannerFor(draft) });
  const result = await planner.plan({ inventory });
  assert.equal(result.ok, true, JSON.stringify(result).slice(0, 300));
  const value = result.value;
  assert.deepEqual([...value.source_only_claim_ids].sort(), [ids[3], ids[4], ids[5]].sort());
  assert.ok(value.coverage_repair, "repair audit must be present");
  assert.deepEqual([...value.coverage_repair.missing_partition_ids].sort(), [ids[3], ids[4], ids[5]].sort());
  assert.deepEqual(value.coverage_repair.unknown_ids, []);
});

test("duplicated and unknown ids are normalized, over-half drops reject", async () => {
  const inventory = makeInventory();
  const ids = inventory.claims.map((claim) => claim.claim_id);
  const dupDraft = {
    source_guide: guideHolding([...ids, "claim_unknown"]),
    topic_pages: [
      {
        title: "첫 문서",
        purpose: "앞부분을 정리한다",
        claim_ids: [ids[0], ids[1], ids[2]],
        target_candidate_ids: ["cand_repair"],
      },
      {
        title: "둘째 문서",
        purpose: "뒷부분을 정리하며 하나를 겹친다",
        claim_ids: [ids[2], ids[3], ids[4], ids[5]],
        target_candidate_ids: ["cand_repair"],
      },
    ],
    source_only_claim_ids: [],
  };
  const dupPlanner = reducerApi.createPagePlanner({ allowedCandidateIds: ["cand_repair"], requestPlan: plannerFor(dupDraft) });
  const dupResult = await dupPlanner.plan({ inventory });
  assert.equal(dupResult.ok, true, JSON.stringify(dupResult).slice(0, 300));
  assert.ok(dupResult.value.coverage_repair.unknown_ids.includes("claim_unknown"));
  const allIds = [
    ...dupResult.value.pages.flatMap((page) => page.claim_ids),
    ...dupResult.value.source_only_claim_ids,
  ];
  assert.equal(new Set(allIds).size, ids.length);

  const emptyDraft = {
    source_guide: guideHolding([ids[0]]),
    topic_pages: [{
      title: "빈 문서",
      purpose: "대부분 누락한다",
      claim_ids: [ids[0]],
      target_candidate_ids: ["cand_repair"],
    }],
    source_only_claim_ids: [],
  };
  const emptyPlanner = reducerApi.createPagePlanner({ allowedCandidateIds: ["cand_repair"], requestPlan: plannerFor(emptyDraft) });
  const emptyResult = await emptyPlanner.plan({ inventory });
  assert.equal(emptyResult.ok, false);
  assert.equal(emptyResult.reason, "invalid_page_plan_coverage");
});

test("gutted guide rejects and duplicate-only buckets are dropped", async () => {
  const inventory = makeInventory();
  const ids = inventory.claims.map((claim) => claim.claim_id);
  const gutDraft = {
    source_guide: guideHolding([ids[0]]),
    topic_pages: [{
      title: "전체 문서",
      purpose: "전부 담는다",
      claim_ids: ids,
      target_candidate_ids: ["cand_repair"],
    }],
    source_only_claim_ids: [],
  };
  const gutPlanner = reducerApi.createPagePlanner({ allowedCandidateIds: ["cand_repair"], requestPlan: plannerFor(gutDraft) });
  const gutResult = await gutPlanner.plan({ inventory });
  assert.equal(gutResult.ok, false);
  assert.equal(gutResult.reason, "invalid_page_plan_coverage");

  const dupBucketDraft = {
    source_guide: guideHolding(ids),
    topic_pages: [
      {
        title: "실체 문서",
        purpose: "전부를 담는다",
        claim_ids: ids,
        target_candidate_ids: ["cand_repair"],
      },
      {
        title: "껍데기 문서",
        purpose: "중복만 담는다",
        claim_ids: [ids[0], ids[1]],
        target_candidate_ids: ["cand_repair"],
      },
    ],
    source_only_claim_ids: [],
  };
  const dupPlanner = reducerApi.createPagePlanner({ allowedCandidateIds: ["cand_repair"], requestPlan: plannerFor(dupBucketDraft) });
  const dupResult = await dupPlanner.plan({ inventory });
  assert.equal(dupResult.ok, true, JSON.stringify(dupResult).slice(0, 300));
  assert.equal(dupResult.value.pages.length, 1);
  assert.equal(dupResult.value.pages[0].title, "실체 문서");
});

test("shape violations still reject without repair", async () => {
  const inventory = makeInventory();
  const ids = inventory.claims.map((claim) => claim.claim_id);
  const badDraft = {
    source_guide: guideHolding(ids),
    topic_pages: [{
      title: "나쁜 문서",
      purpose: "허용되지 않은 후보를 쓴다",
      claim_ids: ids,
      target_candidate_ids: ["cand_forged"],
    }],
    source_only_claim_ids: [],
  };
  const planner = reducerApi.createPagePlanner({ allowedCandidateIds: ["cand_repair"], requestPlan: plannerFor(badDraft) });
  const result = await planner.plan({ inventory });
  assert.equal(result.ok, false);
  assert.equal(result.reason, "invalid_page_plan_coverage");
  assert.equal(result.value, undefined);
});
