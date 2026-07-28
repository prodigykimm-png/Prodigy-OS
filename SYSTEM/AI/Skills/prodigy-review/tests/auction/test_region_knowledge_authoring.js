"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");
const test = require("node:test");

const ROOT = path.resolve(__dirname, "../../../../../..");
const validation = require(path.join(ROOT, "SYSTEM/Views/knowledge-authoring-validation.js"));
const candidateCore = require(path.join(ROOT, "SYSTEM/Views/knowledge-candidate-core.js"));

const REGION_A = "PARA/RESOURCES/Auction Regions/서울특별시-강남구";

// --- Region link authoring validation ---

test("regionLink accepts an exact canonical Region wikilink", () => {
  const result = validation.regionLink(`[[${REGION_A}]]`);
  assert.equal(result, `[[${REGION_A}]]`);
});

test("regionLink strips a trailing .md", () => {
  const result = validation.regionLink(`[[${REGION_A}.md]]`);
  assert.equal(result, `[[${REGION_A}]]`);
});

test("regionLink rejects a fuzzy district name", () => {
  assert.throws(() => validation.regionLink("[[강남구]]"), /Region wikilink/);
});

test("regionLink rejects a non-Region path", () => {
  assert.throws(() => validation.regionLink("[[ZETA/LITERATURE/article]]"), /Region wikilink/);
});

test("regionLink rejects body text and coordinates", () => {
  assert.throws(() => validation.regionLink("강남구 아파트"), /Region wikilink/);
  assert.throws(() => validation.regionLink("37.4979,127.0276"), /Region wikilink/);
});

test("regionLink rejects path traversal", () => {
  assert.throws(() => validation.regionLink("[[PARA/RESOURCES/Auction Regions/../../etc]]"), /Region wikilink/);
});

// --- extractRegionLinks ---

test("extractRegionLinks returns only exact Region links from connections", () => {
  const connections = [
    `[[${REGION_A}]]`,
    "[[ZETA/LITERATURE/article]]",
    "[[PARA/RESOURCES/Auction Regions/부산광역시-해운대구]]"
  ];
  const regions = validation.extractRegionLinks(connections);
  assert.equal(regions.length, 2);
  assert.ok(regions.includes(`[[${REGION_A}]]`));
  assert.ok(regions.includes("[[PARA/RESOURCES/Auction Regions/부산광역시-해운대구]]"));
});

// --- invalidation_conditions validation ---

test("invalidationConditions accepts a list of text", () => {
  const result = validation.invalidationConditions(["금리 5% 초과", "재개발 무산"]);
  assert.deepEqual(result, ["금리 5% 초과", "재개발 무산"]);
});

test("invalidationConditions rejects hostile markup", () => {
  assert.throws(() => validation.invalidationConditions(["[[injected]]"]), /safe text/);
});

test("invalidationConditions defaults to empty list", () => {
  assert.deepEqual(validation.invalidationConditions(undefined), []);
});

// --- Promotion preservation ---

function baseCandidate(overrides = {}) {
  return {
    type: "knowledge_candidate",
    status: "saved",
    title: "강남구 공급 논지",
    statement: "공급 부족이 지속된다.",
    reason: "인허가 감소",
    source_type: "manual_study",
    source_note: "2026-07 현장 학습",
    source_evidence_ids: [],
    source_objects: [],
    confidence: "explicit",
    suggested_domain: "real_estate",
    suggested_topics: ["bidding"],
    application_trigger: "입찰 시",
    application_contexts: ["real_estate/bidding"],
    approval_note: "",
    created: "2026-07-01T10:00",
    updated: "2026-07-01T10:00",
    ...overrides
  };
}

test("candidate core preserves connections and invalidation through promotion lifecycle", () => {
  // The candidate core's normalize/finalize round trip must not drop these fields.
  const candidate = candidateCore.createCandidate(baseCandidate());
  assert.equal(candidate.status, "saved");
  // application_trigger and application_contexts survive normalization
  assert.equal(candidate.application_trigger, "입찰 시");
  assert.deepEqual(candidate.application_contexts, ["real_estate/bidding"]);

  // Promotion target + finalize
  const withTarget = candidateCore.setPromotionTarget(candidate, "PARA/RESOURCES/Knowledge/강남구-공급.md");
  const finalized = candidateCore.finalizePromotion(withTarget, "[[PARA/RESOURCES/Knowledge/강남구-공급]]");
  assert.equal(finalized.status, "approved");
  // preserved fields remain intact after finalization
  assert.equal(finalized.application_trigger, "입찰 시");
  assert.deepEqual(finalized.application_contexts, ["real_estate/bidding"]);
});

test("promotion cannot be auto-triggered at creation", () => {
  assert.throws(() => candidateCore.createCandidate(baseCandidate({ status: "approved" })), /does not promote/);
  assert.throws(() => candidateCore.createCandidate(baseCandidate({ promotion_target: "x.md" })), /does not promote/);
});

test("approved candidate requires matching promotion_target and promoted_knowledge", () => {
  const candidate = candidateCore.createCandidate(baseCandidate());
  const withTarget = candidateCore.setPromotionTarget(candidate, "PARA/RESOURCES/Knowledge/강남구-공급.md");
  assert.throws(() => candidateCore.finalizePromotion(withTarget, "[[PARA/RESOURCES/Knowledge/다른-지식]]"), /must match/);
});
