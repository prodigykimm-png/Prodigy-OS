"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const ROOT = path.resolve(__dirname, "../../../../../..");
const ai = require(path.join(ROOT, "SYSTEM/Views/region-experience-ai.js"));

function validInput(overrides = {}) {
  return {
    experience_date: "2026-07-22",
    region_key: "부산광역시-부산진구",
    region: {
      type: "auction_region",
      region_key: "부산광역시-부산진구",
      region_sido: "부산광역시",
      region_sigungu: "부산진구",
      path: "PARA/RESOURCES/Auction Regions/부산광역시-부산진구.md",
      wiki_link: "[[PARA/RESOURCES/Auction Regions/부산광역시-부산진구]]",
    },
    category: "site_visit",
    epistemic_status: "direct_observation",
    direct_observation: "범천동 골목에서 차량 소음이 저녁에도 이어졌다.",
    subarea: "범천동",
    related_object_links: ["[[PARA/AUCTION/부산진구-사건]]"],
    ...overrides,
  };
}

function validPayload(overrides = {}) {
  return {
    evidence: {
      title: "저녁 차량 소음 관찰",
      interpretation: "평일 저녁에 한 번 더 확인한다.",
      change: "",
      next_experiment: "다음 현장 방문 때 같은 시간대를 확인한다.",
    },
    region_candidates: [{
      category: "site_visit",
      text: "범천동 골목의 저녁 차량 소음을 임장 시 다시 확인한다.",
      source_evidence_indexes: [0],
    }],
    knowledge_candidates: [],
    ...overrides,
  };
}

function fakeClient(handler) {
  return {
    async requestStructured(request) {
      const payload = await handler(request);
      return { ok: true, payload, receipt: { provider_key: "fake", model: "fake-model" } };
    },
  };
}

test("Region Experience sends one provider-neutral request and writes no vault bytes", async () => {
  const calls = [];
  let writes = 0;
  const app = { vault: {
    create: async () => { writes += 1; },
    modify: async () => { writes += 1; },
    process: async () => { writes += 1; },
  } };
  const result = await ai.generateProposal({
    app,
    input: validInput(),
    client: fakeClient(async (request) => { calls.push(request); return validPayload(); }),
  });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].consumer_id, "auction.region_experience");
  assert.match(calls[0].prompt, /신뢰할 수 없는 사용자 데이터/u);
  assert.equal(result.provider, "fake");
  assert.equal(result.model, "fake-model");
  assert.equal(result.region_candidates.length, 1);
  assert.equal(writes, 0);
});

test("stale prior input and malformed payload fail before any handoff write", async () => {
  let calls = 0;
  const prior = {
    input: validInput({ direct_observation: "이전 관찰" }),
    input_fingerprint: "stale",
    ...validPayload(),
  };
  await assert.rejects(ai.generateProposal({
    app: {},
    input: validInput(),
    previousProposal: prior,
    revisionRequest: "다시 정리",
    client: fakeClient(async () => { calls += 1; return validPayload(); }),
  }), /이전 AI 제안/u);
  assert.equal(calls, 0);

  await assert.rejects(ai.generateProposal({
    app: {},
    input: validInput(),
    client: fakeClient(async () => "not-an-object"),
  }), /proposal must be an object/u);
});

test("abort and runtime failures expose generic Korean recovery without raw transport text", async () => {
  const abortError = new Error("SECRET_RAW_TRANSPORT");
  abortError.name = "AbortError";
  await assert.rejects(ai.generateProposal({
    app: {},
    input: validInput(),
    client: { async requestStructured() { throw abortError; } },
  }), (error) => error.name === "AbortError"
    && error.message === "AI 요청이 취소되었습니다."
    && !error.message.includes("SECRET_RAW_TRANSPORT"));

  await assert.rejects(ai.generateProposal({
    app: {},
    input: validInput(),
    client: { async requestStructured() { const error = new Error("SECRET_RAW_TRANSPORT"); error.code = "route_unreachable"; throw error; } },
  }), (error) => error.code === "route_unreachable"
    && /AI Runtime 요청/u.test(error.message)
    && !error.message.includes("SECRET_RAW_TRANSPORT"));
});

test("Region Experience production owns no endpoint guard or provider profile", () => {
  const source = fs.readFileSync(path.join(ROOT, "SYSTEM/Views/region-experience-ai.js"), "utf8");
  assert.doesNotMatch(source, /AIProviderService|ProjectWorkflowDraftService|RegionExperienceProviderEndpointGuard|loadProviderConfig|defaultProvider/u);
});
