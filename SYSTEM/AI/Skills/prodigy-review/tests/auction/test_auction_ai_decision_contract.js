"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");
const test = require("node:test");

const ROOT = path.resolve(__dirname, "../../../../../..");
const dataCore = require(path.join(ROOT, "SYSTEM/Views/auction-decision-support-core.js"));
const aiCore = require(path.join(ROOT, "SYSTEM/Views/auction-ai-decision-support-core.js"));

const AS_OF = "2026-08-03T09:00:00.000Z";
const CURRENT_PATH = "PARA/PROJECTS/Auction/current.md";

function currentAuction() {
  return {
    id: "current",
    type: "auction_case",
    path: CURRENT_PATH,
    region_sido: "부산광역시",
    region_sigungu: "금정구",
    property_type: "아파트",
    appraisal_price: 1000000000
  };
}

function pastCase(id, percent) {
  return {
    id,
    type: "auction_case",
    path: `PARA/PROJECTS/Auction/${id}.md`,
    region_sido: "부산광역시",
    region_sigungu: "금정구",
    property_type: "아파트",
    appraisal_price: 1000000000,
    auction_outcome: "lost",
    auction_result_date: "2026-07-01",
    winning_bid_price: percent * 10000000,
    my_bid_price: 800000000
  };
}

function projection(includePersonalExcerpt = false) {
  const dataset = dataCore.buildAuctionDecisionDataset({
    currentAuction: currentAuction(),
    cases: [80, 85, 90, 95, 100].map((percent, index) => pastCase(`past-${index}`, percent)),
    generationStartedAt: AS_OF
  });
  const decision = dataCore.buildDecisionSupportProjection({ dataset, currentAuction: currentAuction() });
  return { decision, input: aiCore.buildAiDecisionSupportInput(decision, { includePersonalExcerpt }) };
}

test("Given a deterministic projection, When an AI input is built, Then only display facts and opaque source refs are included", () => {
  const { decision, input } = projection(false);
  assert.equal(input.schema_version, "auction-ai-decision-support.v1");
  assert.equal(input.analysis_as_of, AS_OF);
  assert.equal(input.personal_excerpt.included, false);
  assert.equal(input.personal_excerpt.data, null);
  assert.equal(input.citation_refs.some((item) => item.source_ref === CURRENT_PATH), true);
  assert.equal(input.citation_refs.length, 6);
  assert.equal(JSON.stringify(input).includes("추천 입찰가"), false);
  assert.equal(input.numeric_facts.includes("90"), true);
  assert.equal(decision.current_time_only, true);
});

test("Given a valid draft, When it cites known refs and exact numeric facts, Then strict validation accepts it", () => {
  const { input } = projection(false);
  const result = aiCore.validateAiDecisionSupportDraft({
    headline: "동일 표본의 결과 분포를 확인할 수 있습니다.",
    summary: "정확히 일치한 결과 5건의 중앙 낙찰가율은 90%입니다.",
    personal_context: null,
    evidence: [{ source_ref: input.citation_refs[1].source_ref, statement: "낙찰가율 90%의 결과가 확인됩니다." }],
    cautions: ["표본은 5건이며 자동 판단은 하지 않습니다."]
  }, input);
  assert.equal(result.ok, true);
  assert.equal(result.value.headline, "동일 표본의 결과 분포를 확인할 수 있습니다.");
});

test("Given an unknown citation ref, When an AI draft is validated, Then the draft is rejected", () => {
  const { input } = projection(false);
  const result = aiCore.validateAiDecisionSupportDraft({
    headline: "근거 확인",
    summary: "정확히 일치한 결과를 확인합니다.",
    personal_context: null,
    evidence: [{ source_ref: "PRIVATE/unknown.md", statement: "확인할 수 없는 근거입니다." }],
    cautions: []
  }, input);
  assert.equal(result.ok, false);
  assert.equal(result.errors.some((error) => error.code === "unknown_source_ref"), true);
});

test("Given an invented number or prescriptive language, When an AI draft is validated, Then it is rejected", () => {
  const { input } = projection(false);
  const inventedNumber = aiCore.validateAiDecisionSupportDraft({
    headline: "근거 확인",
    summary: "정확히 일치한 결과의 비율은 99%입니다.",
    personal_context: null,
    evidence: [],
    cautions: []
  }, input);
  assert.equal(inventedNumber.ok, false);
  assert.equal(inventedNumber.errors.some((error) => error.code === "unsupported_number"), true);

  const banned = aiCore.validateAiDecisionSupportDraft({
    headline: "추천 입찰가를 제시합니다.",
    summary: "이 물건은 낙찰 가능성이 높습니다.",
    personal_context: null,
    evidence: [],
    cautions: []
  }, input);
  assert.equal(banned.ok, false);
  assert.equal(banned.errors.some((error) => error.code === "banned_language"), true);
});

test("Given a personal excerpt opt-in, When the prompt is built, Then personal data is absent by default and included only after opt-in", () => {
  const withoutPersonal = projection(false).input;
  const withPersonal = projection(true).input;
  assert.equal(withoutPersonal.personal_excerpt.included, false);
  assert.equal(withPersonal.personal_excerpt.included, true);
  assert.ok(withPersonal.personal_excerpt.data);
  assert.match(aiCore.buildAiDecisionSupportPrompt(withoutPersonal), /개인 입찰 기록은 포함되지 않았다/u);
  assert.match(aiCore.buildAiDecisionSupportPrompt(withPersonal), /개인 입찰 기록이 사용자의 명시적 선택으로 포함되었다/u);
});

test("Given a draft with an extra field, When strict validation runs, Then schema drift is rejected", () => {
  const { input } = projection(false);
  const result = aiCore.validateAiDecisionSupportDraft({
    headline: "근거 확인",
    summary: "정확히 일치한 결과를 확인합니다.",
    personal_context: null,
    evidence: [],
    cautions: [],
    recommended_bid: 900000000
  }, input);
  assert.equal(result.ok, false);
  assert.equal(result.errors.some((error) => error.code === "unexpected_field"), true);
});

console.log("Auction AI decision contract tests loaded");
