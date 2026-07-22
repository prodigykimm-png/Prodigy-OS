"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "../../../../../..");
const core = require(path.join(ROOT, "SYSTEM/Views/decision-packet-core.js"));

function packet(overrides) {
  return core.buildDecisionPacket({
    auction: {
      path: "PARA/PROJECTS/Auction/2026-001.md",
      title: "부산 금정구 물건",
      region_sido: "부산광역시",
      region_sigungu: "금정구",
      knowledge_topics: ["rights_analysis", "bidding"]
    },
    candidates: [],
    ...overrides
  });
}

function testKnowledgeRankingAndTieBreakers() {
  const candidates = [
    { path: "ZETA/b.md", type: "knowledge", title: "B", updated: "2026-07-10", connections: ["[[PARA/PROJECTS/Auction/2026-001.md]]"] },
    { path: "ZETA/a.md", type: "permanent_note", title: "A", updated: "2026-07-10", connections: ["[[PARA/PROJECTS/Auction/2026-001.md]]"] },
    { path: "ZETA/region-topic.md", type: "knowledge", title: "지역과 주제", updated: "2026-07-20", region_sido: "부산광역시", region_sigungu: "금정구", knowledge_topics: ["bidding"] },
    { path: "ZETA/topic.md", type: "knowledge", title: "주제", updated: "2026-07-21", knowledge_topics: ["rights_analysis"] },
    { path: "ZETA/none.md", type: "knowledge", title: "무관", updated: "2026-07-30" }
  ];

  const result = packet({ candidates });

  assert.deepEqual(result.knowledge.map((record) => [record.path, record.score]), [
    ["ZETA/region-topic.md", 130],
    ["ZETA/a.md", 100],
    ["ZETA/b.md", 100]
  ]);
  assert.equal(result.knowledge[0].matched.region, true);
  assert.equal(result.knowledge[0].matched.topic, true);

  const tieResult = packet({
    candidates: [
      { path: "ZETA/b.md", type: "knowledge", title: "동일", created: "2026-07-10", connections: ["[[PARA/PROJECTS/Auction/2026-001.md]]"] },
      { path: "ZETA/a.md", type: "knowledge", title: "동일", created: "2026-07-10", connections: ["[[PARA/PROJECTS/Auction/2026-001.md]]"] },
      { path: "ZETA/c.md", type: "knowledge", title: "가", created: "2026-07-10", connections: ["[[PARA/PROJECTS/Auction/2026-001.md]]"] }
    ]
  });
  assert.deepEqual(tieResult.knowledge.map((record) => record.path), ["ZETA/c.md", "ZETA/a.md", "ZETA/b.md"]);
}

function testCandidatesAndUnsupportedTypesAreExcluded() {
  const result = packet({
    candidates: [
      { path: "ZETA/candidate.md", type: "knowledge_candidate", title: "후보", knowledge_topics: ["bidding"] },
      { path: "ZETA/literature.md", type: "literature_note", title: "자료", knowledge_topics: ["bidding"] },
      { path: "ZETA/unsupported.md", type: "resource", title: "범용 자료", knowledge_topics: ["bidding"] },
      { path: "ZETA/valid.md", type: "knowledge", title: "검증", knowledge_topics: ["bidding"] }
    ]
  });

  assert.deepEqual(result.knowledge.map((record) => record.path), ["ZETA/valid.md"]);
  assert.equal(result.excluded_count, 3);
}

function testOnlyMatchingDedicatedRegionResourceIsSelected() {
  const result = packet({
    candidates: [
      { path: "PARA/RESOURCES/Auction Regions/부산광역시-금정구.md", type: "auction_region", title: "금정구", updated: "2026-07-19", region_sido: "부산광역시", region_sigungu: "금정구" },
      { path: "PARA/RESOURCES/Auction Regions/부산광역시-중구.md", type: "auction_region", title: "중구", updated: "2026-07-20", region_sido: "부산광역시", region_sigungu: "중구" },
      { path: "PARA/RESOURCES/generic.md", type: "resource", title: "금정구 일반 자료", updated: "2026-07-21", region_sido: "부산광역시", region_sigungu: "금정구" }
    ]
  });

  assert.equal(result.region_resource.path, "PARA/RESOURCES/Auction Regions/부산광역시-금정구.md");
  assert.equal(result.region_resource.type, "auction_region");
}

function testPriorDecisionCapAndStableOrder() {
  const result = packet({
    candidates: [
      { path: "PARA/Decisions/a.md", type: "decision", title: "가", updated: "2026-07-10", connections: ["[[PARA/PROJECTS/Auction/2026-001.md]]"] },
      { path: "PARA/Decisions/b.md", type: "decision", title: "나", updated: "2026-07-12", region_sido: "부산광역시", region_sigungu: "금정구" },
      { path: "PARA/Decisions/c.md", type: "decision", title: "다", updated: "2026-07-11", knowledge_topics: ["bidding"] },
      { path: "PARA/Decisions/d.md", type: "decision", title: "라", updated: "2026-07-30" }
    ]
  });

  assert.deepEqual(result.prior_decisions.map((record) => [record.path, record.score]), [
    ["PARA/Decisions/a.md", 100],
    ["PARA/Decisions/b.md", 80]
  ]);
  assert.equal(result.prior_decisions.length, 2);
}

function testMalformedInputIsSafeDeterministicAndImmutable() {
  const source = Object.freeze({
    property: Object.freeze({
      source_path: "PARA/PROJECTS/Auction/2026-002.md",
      title: "대구 물건",
      region_sido: "대구광역시",
      region_sigungu: "수성구",
      knowledge_topics: Object.freeze(["tax"])
    }),
    candidates: Object.freeze([
      null,
      7,
      Object.freeze({ path: "ZETA/valid.md", type: "knowledge", title: "세금", created: "2026-07-01", knowledge_topics: Object.freeze(["tax"]) }),
      Object.freeze({ type: "knowledge", title: "경로 없음" })
    ])
  });
  const before = JSON.stringify(source);

  const first = core.buildDecisionPacket(source);
  const second = core.rankDecisionPacket(source);

  assert.deepEqual(first, second);
  assert.equal(JSON.stringify(source), before);
  assert.deepEqual(first.knowledge.map((record) => record.path), ["ZETA/valid.md"]);
  assert.equal(first.warnings.some((warning) => warning.code === "malformed_record"), true);
  assert.equal(first.warnings.some((warning) => warning.code === "missing_path"), true);
  assert.equal(first.empty_state.knowledge, null);

  const empty = core.buildDecisionPacket(null);
  assert.equal(empty.empty_state.reason, "유효한 경매 또는 물건 맥락과 후보 기록이 없습니다.");
  assert.equal(empty.empty_state.knowledge.copy, "참조할 검증 지식이 없습니다.");
  assert.equal(empty.empty_state.region_resource.copy, "일치하는 지역 분석 자료가 없습니다.");
  assert.equal(empty.empty_state.prior_decisions.copy, "참조할 이전 결정이 없습니다.");
}

testKnowledgeRankingAndTieBreakers();
testCandidatesAndUnsupportedTypesAreExcluded();
testOnlyMatchingDedicatedRegionResourceIsSelected();
testPriorDecisionCapAndStableOrder();
testMalformedInputIsSafeDeterministicAndImmutable();
console.log("Decision packet core tests passed");
