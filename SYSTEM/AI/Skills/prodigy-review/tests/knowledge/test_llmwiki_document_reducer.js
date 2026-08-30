"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");
const test = require("node:test");

const ROOT = path.resolve(__dirname, "../../../../../..");
const reducerApi = require(path.join(ROOT, "SYSTEM/Views/llmwiki-document-reducer.js"));

function citation(index) {
  return {
    source_id: "source_investment",
    content_hash: "a".repeat(64),
    source_path: "INBOX/투놀카페/투놀카페 - 투자일기.md",
    locators: [`INBOX/투놀카페/투놀카페 - 투자일기.md#${index * 10}-${index * 10 + 8}`],
    evidence_quote: `근거 ${index}`,
    confidence: "explicit",
  };
}

function document(role, title, claims, citationOffset = 0, matchedCandidateIds = []) {
  return {
    contract_version: "llmwiki_document_assembler_v2",
    role,
    title,
    claims: claims.map((text) => ({ text })),
    citations: claims.map((_text, index) => citation(citationOffset + index + 1)),
    sections: [{ heading: title, claims: claims.map((text) => ({ text })) }],
    review_reasons: [],
    matched_candidate_ids: matchedCandidateIds,
    operation_hint: matchedCandidateIds.length ? "update" : "create",
    body: "",
  };
}

function documents() {
  return [
    document("source_summary", "투자일기 자료 해설", [
      "투자 기록은 건축과 토지 투자를 함께 다룬다.",
      "실패 사례에서 현금흐름 위험이 반복된다.",
    ]),
    document("reusable_claim", "철골조 공기 단축", [
      "철골조는 공사 기간을 단축한다.",
      "직영 공사는 공정별 비용을 줄인다.",
    ], 2),
    document("reusable_claim", "레버리지 위험", [
      "갭투자는 자기자본 투입을 줄인다.",
      "임대수익이 이자를 감당하지 못하면 장기 보유하지 않는다.",
    ], 4),
    document("reusable_claim", "서재 사다리", [
      "서재 사다리 제작 참고 사이트가 기록되어 있다.",
    ], 6),
  ];
}

test("claim inventory is atomic, source-grounded, and independent from draft documents", () => {
  const inventory = reducerApi.createClaimInventory({
    source: {
      source_id: "source_investment",
      source_path: "INBOX/투놀카페/투놀카페 - 투자일기.md",
      content_hash: "a".repeat(64),
    },
    documents: documents(),
  });

  assert.equal(inventory.ok, true, inventory.reason);
  assert.equal(inventory.value.claims.length, 7);
  assert.equal(new Set(inventory.value.claims.map((claim) => claim.claim_id)).size, 7);
  assert.equal(inventory.value.claims.every((claim) => claim.citation_ids.length > 0), true);
  assert.equal(inventory.value.citations.length, 7);
  assert.equal(inventory.value.claims.filter((claim) => claim.role === "source_summary").length, 2);
  assert.equal(inventory.value.claims.filter((claim) => claim.role === "reusable_claim").length, 5);
  assert.match(inventory.value.inventory_hash, /^[0-9a-f]{64}$/u);
});

test("page planner returns a concise source guide and reviewable page plan without compiling documents", async () => {
  const inventoryResult = reducerApi.createClaimInventory({
    source: {
      source_id: "source_investment",
      source_path: "INBOX/투놀카페/투놀카페 - 투자일기.md",
      content_hash: "a".repeat(64),
    },
    documents: documents(),
  });
  assert.equal(inventoryResult.ok, true, inventoryResult.reason);
  const inventory = inventoryResult.value;
  const planner = reducerApi.createPagePlanner({
    allowedCandidateIds: [],
    requestPlan: async (request) => {
      const sourceClaims = request.claims.filter((claim) => claim.role === "source_summary");
      const reusableClaims = request.claims.filter((claim) => claim.role === "reusable_claim");
      return {
        source_guide: {
          overview: "건축, 토지, 레버리지 판단을 장기간 기록한 투자 자료다.",
          sections: [
            {
              heading: "투자 기록 개요",
              summary: "건축과 토지 투자 판단을 함께 다룬다.",
              claim_ids: request.claims.slice(0, 4).map((claim) => claim.claim_id),
            },
            {
              heading: "레버리지와 참고 자료",
              summary: "현금흐름 위험과 단독 참고 정보를 구분한다.",
              claim_ids: request.claims.slice(4).map((claim) => claim.claim_id),
            },
          ],
          key_questions: ["어떤 조건에서 투자를 보류했는가?"],
        },
        topic_pages: [
          {
            title: "직영 건축의 비용과 기간",
            purpose: "구조 선택과 직영 공사의 비용 효과를 설명한다.",
            claim_ids: reusableClaims.slice(0, 2).map((claim) => claim.claim_id),
            target_candidate_ids: [],
          },
          {
            title: "레버리지 투자의 현금흐름 위험",
            purpose: "갭투자와 이자 부담의 관계를 설명한다.",
            claim_ids: reusableClaims.slice(2, 4).map((claim) => claim.claim_id),
            target_candidate_ids: [],
          },
        ],
        source_only_claim_ids: [reusableClaims[4].claim_id],
      };
    },
  });

  const result = await planner.plan({ inventory });

  assert.equal(result.ok, true, result.reason);
  assert.equal(result.value.status, "pending_review");
  assert.equal(result.value.source_guide.sections.length, 2);
  assert.equal(result.value.source_guide.key_questions.length, 1);
  assert.equal(result.value.pages.length, 2);
  assert.equal(result.value.pages.every((page) => page.claim_ids.length >= 2), true);
  assert.equal(result.value.pages.every((page) => page.operation_hint === "create"), true);
  assert.deepEqual(result.value.source_only_claim_ids, [inventory.claims.at(-1).claim_id]);
  assert.equal(Object.hasOwn(result.value.source_guide, "body"), false);
  assert.equal(Object.hasOwn(result.value.pages[0], "body"), false);
  assert.match(result.value.plan_hash, /^[0-9a-f]{64}$/u);
});

test("page planner rejects dropped, duplicated, or unallowlisted claim authority", async () => {
  const inventory = reducerApi.createClaimInventory({
    source: {
      source_id: "source_investment",
      source_path: "INBOX/투놀카페/투놀카페 - 투자일기.md",
      content_hash: "a".repeat(64),
    },
    documents: documents(),
  }).value;
  const reusable = inventory.claims.filter((claim) => claim.role === "reusable_claim");
  const planner = reducerApi.createPagePlanner({
    allowedCandidateIds: ["cand_allowed"],
    requestPlan: async () => ({
      source_guide: {
        overview: "잘못된 계획",
        sections: [{ heading: "누락", summary: "일부만 포함한다.", claim_ids: [inventory.claims[0].claim_id] }],
        key_questions: [],
      },
      topic_pages: [{
        title: "중복 계획",
        purpose: "같은 claim을 중복 사용한다.",
        claim_ids: [reusable[0].claim_id, reusable[0].claim_id],
        target_candidate_ids: ["cand_forged"],
      }],
      source_only_claim_ids: [],
    }),
  });

  const result = await planner.plan({ inventory });
  assert.equal(result.ok, false);
  assert.equal(result.reason, "invalid_page_plan_coverage");
});
