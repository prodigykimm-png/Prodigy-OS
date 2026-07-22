"use strict";

const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { resolve } = require("node:path");
const test = require("node:test");
const contract = require("../../../../../Views/region-experience-contract.js");

const VAULT_ROOT = resolve(__dirname, "../../../../../../");
const REGION_CONTRACT_DOC = resolve(VAULT_ROOT, "SYSTEM/docs/Region_Property_Contract_v1.md");
const OPERATING_GUIDE_DOC = resolve(VAULT_ROOT, "SYSTEM/docs/11_Operating_Guide.md");

function validInput(overrides) {
  return {
    experience_date: "2026-07-22",
    region_key: "부산광역시-부산진구",
    region: {
      type: "auction_region",
      region_key: "부산광역시-부산진구",
      region_sido: "부산광역시",
      region_sigungu: "부산진구",
      path: "PARA/RESOURCES/Auction Regions/부산광역시-부산진구.md",
      wiki_link: "[[PARA/RESOURCES/Auction Regions/부산광역시-부산진구]]"
    },
    category: "site_visit",
    epistemic_status: "direct_observation",
    direct_observation: "범천동 골목에서 차량 소음이 저녁에도 이어졌다.",
    subarea: "범천동",
    related_object_links: ["[[PARA/AUCTION/부산진구-사건]]"],
    ...overrides
  };
}

function validProposal(overrides) {
  return {
    evidence: {
      title: "저녁 차량 소음 관찰",
      interpretation: "소음 시간대를 다시 확인한다.",
      change: "",
      next_experiment: "평일 저녁에 한 번 더 확인한다."
    },
    region_candidates: [{
      category: "site_visit",
      text: "범천동 골목의 저녁 차량 소음을 임장 시 다시 확인한다.",
      source_evidence_indexes: [0]
    }],
    knowledge_candidates: [],
    ...overrides
  };
}

test("Given a valid 부산광역시-부산진구 direct observation When input and proposal are normalized Then auction Evidence and the mapped site_visit candidate preserve the observation", () => {
  const input = validInput();
  const proposal = validProposal();
  const inputBefore = JSON.stringify(input);
  const proposalBefore = JSON.stringify(proposal);

  const normalizedInput = contract.normalizeInput(input);
  const normalized = contract.normalizeProposal(proposal, normalizedInput);

  assert.equal(normalizedInput.region_key, "부산광역시-부산진구");
  assert.equal(normalized.evidence_blocks.length, 1);
  assert.deepEqual(normalized.evidence_blocks[0], {
    evidence_id: "region-experience-0",
    title: "저녁 차량 소음 관찰",
    context: "auction",
    related_objects: ["[[PARA/AUCTION/부산진구-사건]]"],
    experience: input.direct_observation,
    interpretation: "소음 시간대를 다시 확인한다.",
    change: "",
    next_experiment: "평일 저녁에 한 번 더 확인한다.",
    epistemic_status: "direct_observation",
    review_status: "ready",
    inference_notice: ""
  });
  assert.deepEqual(normalized.region_candidates, [{
    category: "site_visit",
    section: "임장 포인트",
    text: "범천동 골목의 저녁 차량 소음을 임장 시 다시 확인한다.",
    source_evidence_ids: ["region-experience-0"],
    epistemic_status: "direct_observation",
    review_status: "ready",
    inference_notice: ""
  }]);
  assert.equal(JSON.stringify(input), inputBefore, "input must remain caller-owned and unchanged");
  assert.equal(JSON.stringify(proposal), proposalBefore, "provider payload must remain caller-owned and unchanged");
  assert.throws(() => { normalized.evidence_blocks.push({}); }, TypeError);
});

test("Given a user inference When normalized Then its original text is retained verbatim and every output consumer receives a pending Korean notice", () => {
  const input = contract.normalizeInput(validInput({
    category: "risk",
    epistemic_status: "user_inference",
    direct_observation: "나는 이 골목의 야간 보행이 불안할 것이라고 본다."
  }));
  const normalized = contract.normalizeProposal(validProposal({
    region_candidates: [{ category: "risk", text: "야간 보행 환경을 현장에서 다시 확인한다.", source_evidence_indexes: [0] }]
  }), input);

  assert.equal(normalized.evidence_blocks[0].experience, "나는 이 골목의 야간 보행이 불안할 것이라고 본다.");
  assert.equal(normalized.evidence_blocks[0].inference_notice, "사용자 해석 · 확인 필요");
  assert.equal(normalized.region_candidates[0].inference_notice, "사용자 해석 · 확인 필요");
  assert.equal(normalized.region_candidates[0].section, "리스크·주의");
});

test("Given every allowed category When a proposal is normalized Then only the frozen Region human section mapping is emitted", () => {
  const expected = {
    transport_life: "교통·생활",
    supply_observation: "임장 포인트",
    risk: "리스크·주의",
    site_visit: "임장 포인트"
  };

  for (const [category, section] of Object.entries(expected)) {
    const input = contract.normalizeInput(validInput({ category }));
    const normalized = contract.normalizeProposal(validProposal({
      region_candidates: [{ category, text: category === "supply_observation" ? input.direct_observation : "사람이 확인한 현장 메모다.", source_evidence_indexes: [0] }]
    }), input);
    assert.equal(normalized.region_candidates[0].section, section, category);
  }
});

test("Given supply_observation and provider-authored enrichment When the proposal is normalized Then it fails closed instead of turning user field observation into Region prose", () => {
  const input = contract.normalizeInput(validInput({
    category: "supply_observation",
    direct_observation: "현장에서 공사 차량 출입과 공사 안내 현수막을 보았다."
  }));
  const providerProposal = validProposal({
    region_candidates: [{
      category: "supply_observation",
      text: "공사 차량 출입과 공사 안내 현수막을 보았으므로 향후 공급 영향을 확인한다.",
      source_evidence_indexes: [0]
    }]
  });

  assert.throws(() => contract.normalizeProposal(providerProposal, input), /supply_observation.*direct_observation|direct_observation.*supply_observation/i);
});

test("Given supply_observation and the exact normalized user field observation When the proposal is normalized Then the Region candidate retains that text verbatim", () => {
  const directObservation = "현장에서 공사 차량 출입과 공사 안내 현수막을 보았다.";
  const input = contract.normalizeInput(validInput({ category: "supply_observation", direct_observation: directObservation }));
  const normalized = contract.normalizeProposal(validProposal({
    region_candidates: [{ category: "supply_observation", text: directObservation, source_evidence_indexes: [0] }]
  }), input);

  assert.equal(normalized.region_candidates[0].text, directObservation);
});

test("Given the Region Experience documentation When its intake provenance and Dataview trust boundaries are reviewed Then the contract remains explicit", () => {
  const regionContract = readFileSync(REGION_CONTRACT_DOC, "utf8");
  const operatingGuide = readFileSync(OPERATING_GUIDE_DOC, "utf8");

  for (const document of [regionContract, operatingGuide]) {
    assert.match(document, /새 소유 marker 또는 template block marker/);
    assert.match(document, /REGION_EXPERIENCE_PROVENANCE/);
    assert.match(document, /idempotency/);
    assert.match(document, /writer 소유권/);
    assert.match(document, /research\/metrics writer.*입력|research\/metrics writer가 읽거나 소비하는 입력/);
    assert.match(document, /direct_observation.*verbatim|verbatim.*direct_observation/);
    assert.match(document, /AI\/provider.*요약·해석·추론·보강/);
    assert.match(document, /Dataview Hub.*SYSTEM\/Views/);
    assert.match(document, /신뢰하지 않는 vault sync origin.*실행/);
  }
});

test("Given malformed date, Region identity, enum, or an unknown key When input is normalized Then it rejects before any persistence boundary", () => {
  assert.throws(() => contract.normalizeInput(validInput({ experience_date: "2026-02-30" })), /experience_date/);
  assert.throws(() => contract.normalizeInput(validInput({ region_key: "부산광역시 부산진구" })), /region_key/);
  assert.throws(() => contract.normalizeInput(validInput({ category: "market_score" })), /category/);
  assert.throws(() => contract.normalizeInput(validInput({ epistemic_status: "ai_inference" })), /epistemic_status/);
  assert.throws(() => contract.normalizeInput(validInput({ generated_score: 99 })), /unknown keys/);
  assert.throws(() => contract.normalizeInput(validInput({ region: { ...validInput().region, type: "auction_case" } })), /region.type/);
  assert.throws(() => contract.normalizeInput(validInput({ region: { ...validInput().region, region_key: "부산광역시-해운대구" } })), /region_key/);
});

test("Given Markdown, HTML, a protected marker, or a code fence When safe prose is normalized Then the proposal is rejected", () => {
  const input = contract.normalizeInput(validInput());

  for (const unsafe of ["# heading", "<script>alert(1)</script>", "<!-- AI:PENDING:RISKS -->", "```json\n{}\n```", "[[PARA/RESOURCES/Auction Regions/overwrite]]"]) {
    assert.throws(() => contract.normalizeProposal(validProposal({ evidence: { ...validProposal().evidence, title: unsafe } }), input), /unsafe/);
  }
});

test("Given multiline, marker-like, HTML-like, or unsafe-path related links When input is normalized Then it rejects the Daily Markdown injection before any proposal boundary", () => {
  const unsafeLinks = [
    "[[PARA/AUCTION/사건]]\n<!-- AI:PENDING:RISKS -->",
    "[[PARA/AUCTION/사건\r<!-- HUMAN -->]]",
    "[[PARA/AUCTION/<!-- HUMAN -->]]",
    "[[PARA/AUCTION/../overwrite]]",
    "[[PARA//AUCTION/사건]]",
    "[[PARA/AUCTION/사건#heading]]"
  ];

  for (const link of unsafeLinks) {
    assert.throws(() => contract.normalizeInput(validInput({ related_object_links: [link] })), /related_object_links|canonical|unsafe/i, link);
  }
});

test("Given Unicode control or line-separator characters in a related wikilink When input is normalized Then it rejects the non-single-line target", () => {
  const unsafeLinks = ["\u0085", "\u2028", "\u2029", "\u200B", "\u2060"].map((character) => `[[PARA/AUCTION/사건${character}overwrite]]`);

  for (const link of unsafeLinks) {
    assert.throws(() => contract.normalizeInput(validInput({ related_object_links: [link] })), /related_object_links|canonical|unsafe/i, JSON.stringify(link));
  }
});

test("Given no source Evidence, an out-of-range source index, or source-less Knowledge candidate text When a proposal is normalized Then it is rejected", () => {
  const input = contract.normalizeInput(validInput());

  assert.throws(() => contract.normalizeProposal(validProposal({ region_candidates: [{ category: "site_visit", text: "현장 메모", source_evidence_indexes: [] }] }), input), /source evidence/);
  assert.throws(() => contract.normalizeProposal(validProposal({ region_candidates: [{ category: "site_visit", text: "현장 메모", source_evidence_indexes: [1] }] }), input), /source evidence/);
  assert.throws(() => contract.normalizeProposal(validProposal({ knowledge_candidates: [{ title: "관찰 원칙", statement: "확인한다.", reason: "현장 메모", source_evidence_indexes: [], confidence: "low" }] }), input), /source evidence/);
});

test("Given AI numeric or official-supply fields When a proposal is normalized Then it rejects the injection without accepting a partially normalized result", () => {
  const input = contract.normalizeInput(validInput());

  assert.throws(() => contract.normalizeProposal(validProposal({ move_in_60m: 500 }), input), /unknown keys|forbidden/);
  assert.throws(() => contract.normalizeProposal(validProposal({ region_candidates: [{ category: "supply_observation", text: "공사장 출입구를 관찰했다.", source_evidence_indexes: [0], official_supply: 500 }] }), input), /unknown keys|forbidden/);
  assert.throws(() => contract.normalizeProposal(validProposal({ evidence: { ...validProposal().evidence, supply_pipeline: "2028년 500세대" } }), input), /unknown keys|forbidden/);
});

test("Given provider-authored official-supply claims in every Evidence field When normalized Then they are rejected while the identical human observation remains verbatim", () => {
  const claims = [
    "공식 공급 500세대 입주 예정으로 보인다.",
    "입주 예정: 500세대",
    "입주 예정: 오백 세대"
  ];
  const fields = ["title", "interpretation", "change", "next_experiment"];
  const ordinaryHumanInput = contract.normalizeInput(validInput({ direct_observation: claims[0] }));
  const humanProposal = contract.normalizeProposal(validProposal(), ordinaryHumanInput);

  assert.equal(humanProposal.evidence_blocks[0].experience, claims[0], "human-provided observation must remain verbatim");
  for (const field of fields) {
    for (const claim of claims) {
      assert.throws(() => contract.normalizeProposal(validProposal({ evidence: { ...validProposal().evidence, [field]: claim } }), contract.normalizeInput(validInput())), /AI-created official-supply or numeric/);
    }
  }
  assert.throws(() => contract.normalizeProposal(validProposal({
    evidence: { ...validProposal().evidence, title: `${"현장 관찰 ".repeat(30)}${claims[0]}` }
  }), contract.normalizeInput(validInput())), /AI-created official-supply or numeric/, "a claim hidden beyond the title display limit must still reject");
});

test("Given repeated normalization calls When one consumer mutates neither result nor inputs Then no stale state crosses calls", () => {
  const input = contract.normalizeInput(validInput());
  const first = contract.normalizeProposal(validProposal(), input);
  const transportInput = contract.normalizeInput(validInput({ category: "transport_life" }));
  const second = contract.normalizeProposal(validProposal({
    region_candidates: [{ category: "transport_life", text: "버스 배차를 다시 확인한다.", source_evidence_indexes: [0] }]
  }), transportInput);

  assert.notEqual(first, second);
  assert.equal(first.region_candidates[0].section, "임장 포인트");
  assert.equal(second.region_candidates[0].section, "교통·생활");
  assert.deepEqual(first.region_candidates[0].source_evidence_ids, ["region-experience-0"]);
});
