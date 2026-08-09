"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "../../../../../..");
const contract = require(path.join(ROOT, "SYSTEM/Views/daily-reflection-proposal-contract.js"));

const evidence = [
  {
    title: "촬영 거리",
    context: "work",
    experience: "85mm 촬영에서 너무 가까이 섰다.",
    interpretation: "거리 판단이 필요하다.",
    change: "",
    next_experiment: "다음 촬영에서 먼저 확인한다.",
    related_objects: [],
  },
];

function basePayload(candidate) {
  return {
    evidence_blocks: evidence,
    knowledge_candidates: [candidate],
    resource_candidates: [],
    object_linking_suggestions: [],
    pre_routing_suggestions: [],
    uncertainties: [],
  };
}

function testNewShapeNormalizesAndRoundTrips() {
  const schema = JSON.parse(fs.readFileSync(path.join(ROOT, "SYSTEM/AI/Skills/prodigy-daily-reflection/references/response-schema.json"), "utf8"));
  const branches = schema.properties.knowledge_candidates.items.oneOf;
  assert.equal(branches.length, 2);
  assert.deepEqual(branches[0].required, ["title", "detail", "source_evidence_indexes", "confidence"]);
  assert.deepEqual(branches[1].required, ["label", "source_evidence_indexes", "confidence"]);
  const normalized = contract.normalizeProposal(basePayload({
    title: "촬영 거리",
    detail: "85mm 촬영은 피사체와 거리를 먼저 확인한다.",
    source_evidence_indexes: [0],
    confidence: "explicit",
    suggested_domain: "wedding",
    suggested_topics: ["shooting"],
  }), { dateStr: "2026-08-08" });

  assert.deepEqual(normalized.knowledge_candidates[0], {
    title: "촬영 거리",
    detail: "85mm 촬영은 피사체와 거리를 먼저 확인한다.",
    suggested_domain: "wedding",
    suggested_topics: ["shooting"],
    source_evidence_ids: ["daily-2026-08-08-e01"],
    confidence: "explicit",
  });

  const provider = contract.providerProposal(normalized);
  assert.deepEqual(provider.knowledge_candidates[0], {
    title: "촬영 거리",
    detail: "85mm 촬영은 피사체와 거리를 먼저 확인한다.",
    suggested_domain: "wedding",
    suggested_topics: ["shooting"],
    source_evidence_indexes: [0],
    confidence: "explicit",
  });
}

function testLegacyShapeRemainsReadable() {
  const normalized = contract.normalizeProposal(basePayload({
    label: "85mm 촬영 전 거리를 먼저 확인한다.",
    source_evidence_indexes: [0],
    confidence: "inferred",
    suggested_domain: "wedding",
    suggested_topics: ["shooting"],
  }), { dateStr: "2026-08-08" });

  assert.equal(normalized.knowledge_candidates[0].label, "85mm 촬영 전 거리를 먼저 확인한다.");
  assert.equal("title" in normalized.knowledge_candidates[0], false);
  assert.deepEqual(contract.providerProposal(normalized).knowledge_candidates[0], {
    label: "85mm 촬영 전 거리를 먼저 확인한다.",
    suggested_domain: "wedding",
    suggested_topics: ["shooting"],
    source_evidence_indexes: [0],
    confidence: "inferred",
  });
}

function testDuplicateAndTaxonomyPairsFailClosed() {
  assert.throws(
    () => contract.normalizeProposal(basePayload({
      title: "반복 원칙",
      detail: "반복 원칙",
      source_evidence_indexes: [0],
      confidence: "low",
    }), { dateStr: "2026-08-08" }),
    /distinct/,
  );

  assert.throws(
    () => contract.normalizeProposal(basePayload({
      title: "분류 원칙",
      detail: "도메인 없이 주제를 보낼 수 없다.",
      source_evidence_indexes: [0],
      confidence: "low",
      suggested_topics: ["shooting"],
    }), { dateStr: "2026-08-08" }),
    /domain/,
  );

  const sanitized = contract.sanitizeProviderPayload({
    evidence_blocks: evidence,
    knowledge_candidates: [
      { title: "유효 후보", detail: "출처가 있는 새 후보", source_evidence_indexes: [0], confidence: "explicit" },
      { title: "중복 후보", detail: "중복 후보", source_evidence_indexes: [0], confidence: "explicit" },
      { title: "잘못된 분류", detail: "등록되지 않은 주제", source_evidence_indexes: [0], confidence: "explicit", suggested_topics: ["shooting"] },
      { label: "기존 후보", source_evidence_indexes: [0], confidence: "low" },
    ],
  });

  assert.deepEqual(sanitized.knowledge_candidates.map((item) => item.title || item.label), ["유효 후보", "기존 후보"]);
}

testNewShapeNormalizesAndRoundTrips();
testLegacyShapeRemainsReadable();
testDuplicateAndTaxonomyPairsFailClosed();
console.log("Daily reflection candidate shape tests passed");
