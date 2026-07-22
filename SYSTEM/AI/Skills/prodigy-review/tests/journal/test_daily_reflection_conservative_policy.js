"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "../../../../../..");
const reflection = require(path.join(ROOT, "SYSTEM/Views/daily-reflection-ai.js"));
const policy = require(path.join(ROOT, "SYSTEM/Views/daily-reflection-conservative-policy.js"));

function payload(blocks) {
  return {
    evidence_blocks: blocks,
    knowledge_candidates: [],
    resource_candidates: [],
    object_linking_suggestions: [],
    pre_routing_suggestions: [],
    uncertainties: []
  };
}

function normalize(rawPayload) {
  return reflection.normalizeProposal(rawPayload, { dateStr: "2026-07-22" });
}

function appWithFiles(files) {
  return {
    vault: { getMarkdownFiles: () => files },
    metadataCache: { getFileCache: () => ({ frontmatter: {} }) }
  };
}

function testTentativeAuctionAndOutcomeAttribution() {
  const proposal = normalize(payload([
    {
      title: "부산 과열과 두 물건 패찰 및 낙찰",
      context: "auction",
      experience: "부산 경매가 과열됐고 2025타경2391(1),(2) 두 개를 모두 패찰 (낙찰) 했다.",
      interpretation: "부산 경매 과열이 확실하다.",
      change: "",
      next_experiment: "인천, 경기, 서울 경매를 탐색한다.",
      related_objects: []
    }
  ]));
  proposal.object_linking_suggestions = [{ name: "2025타경2391", object_kind: "auction", source_evidence_ids: ["daily-2026-07-22-e01"], existence: "unknown" }];
  proposal.pre_routing_suggestions = [{ source_evidence_ids: ["daily-2026-07-22-e01"], path: ["auction", "인천", "경기", "서울"], confidence: "inferred" }];
  const raw = "2025타경2391(1),(2)는 나는 두 물건 모두 패찰했고, 타인이 둘 다 탈출구 1.5억을 넘는 가격에 낙찰받은 것 같다. 부산은 과열된 것 같다. 인천, 경기, 서울 쪽으로 눈을 돌리던가 방안을 찾아봐야겠다.";
  const out = policy.applyConservativeProposalPolicy(proposal, raw, appWithFiles([
    { path: "PARA/PROJECTS/Auction/부산-2025타경2391_1.md", basename: "부산-2025타경2391_1" },
    { path: "PARA/PROJECTS/Auction/부산-2025타경2391_2.md", basename: "부산-2025타경2391_2" }
  ]));
  assert.equal(out.evidence_blocks[0].title, "부산 과열과 두 물건 패찰 및 낙찰");
  assert.equal(out.evidence_blocks[0].experience, "부산 경매가 과열됐고 2025타경2391(1),(2) 두 개를 모두 패찰 (낙찰) 했다.");
  assert.equal(out.evidence_blocks[0].interpretation, "");
  assert.equal(out.evidence_blocks[0].next_experiment, "");
  assert.deepEqual(out.pre_routing_suggestions.map((item) => item.path), [["auction"]]);
  assert.deepEqual(out.object_linking_suggestions.filter((item) => item.object_kind === "auction").map((item) => item.name).sort(), ["부산-2025타경2391_1", "부산-2025타경2391_2"]);
}

function testEvidenceTitleAndExperienceAreImmutable() {
  const proposal = normalize(payload([
    {
      title: "생성된 짧은 제목",
      context: "auction",
      experience: "2025타경2391(1),(2)는 결과를 비교했다.",
      interpretation: "부산 경매 과열이 확실하다.",
      change: "",
      next_experiment: "인천 경매를 탐색한다.",
      related_objects: []
    }
  ]));
  const out = policy.applyConservativeProposalPolicy(
    proposal,
    "2025타경2391(1),(2)는 나는 두 물건 모두 패찰했고, 타인이 둘 다 탈출구 1.5억을 넘는 가격에 낙찰받은 것 같다. 부산은 과열된 것 같다. 인천, 경기, 서울 쪽으로 눈을 돌리던가 방안을 찾아봐야겠다.",
    {}
  );
  assert.equal(out.evidence_blocks[0].title, "생성된 짧은 제목");
  assert.equal(out.evidence_blocks[0].experience, "2025타경2391(1),(2)는 결과를 비교했다.");
  assert.equal(out.evidence_blocks[0].interpretation, "");
  assert.equal(out.evidence_blocks[0].next_experiment, "");
}

function testResourcePeopleAndSelfDirectiveBoundaries() {
  const proposal = normalize(payload([
    {
      title: "조효진과 이재모 피자 체험 및 투자 실패 공유",
      context: "personal",
      experience: "조효진과 이재모 피자를 먹고 김치볶음밥이 맛있었다.",
      interpretation: "",
      change: "부자가 되자",
      next_experiment: "",
      related_objects: []
    },
    {
      title: "보증금 반환 확인",
      context: "personal",
      experience: "보증금 归还 과정을 확인하지 못했다.",
      interpretation: "신중하지 못한 결정으로 큰 손실을 야기할 수 있음",
      change: "",
      next_experiment: "신중해지자",
      related_objects: []
    }
  ]));
  proposal.resource_candidates = [{ name: "이재모 피자", suggested_type: "resource", source_evidence_ids: ["daily-2026-07-22-e01"] }];
  proposal.object_linking_suggestions = [{ name: "이재모 피자", object_kind: "people", source_evidence_ids: ["daily-2026-07-22-e01"], existence: "unknown" }];
  proposal.knowledge_candidates = [{ label: "保증금 반환 시약에 대한 신중 체크리스트", source_evidence_ids: ["daily-2026-07-22-e02"], confidence: "inferred" }];
  const raw = [
    "조효진과 이재모 피자를 먹었고 김치볶음밥도 맛있었다.",
    "큰 금액의 보증금을 김민국에게 맡길 때 반환 절차와 책임자를 확인해야겠다고 느꼈다. 앞으로 신중해지자. 부자가 되자고 농담했다."
  ].join("\n");
  const out = policy.applyConservativeProposalPolicy(proposal, raw, appWithFiles([{ path: "PARA/RESOURCES/CONTACTS/조효진.md", basename: "조효진" }]));
  assert.equal(out.evidence_blocks[0].title, "조효진과 이재모 피자 체험 및 투자 실패 공유");
  assert.deepEqual(out.resource_candidates.map((item) => item.name), ["이재모 피자"]);
  assert.deepEqual(out.object_linking_suggestions.filter((item) => item.object_kind === "people").map((item) => item.name), ["조효진"]);
  assert.equal(out.evidence_blocks[0].change, "");
  assert.match(out.evidence_blocks[1].change, /신중해지자/);
  assert.equal(out.evidence_blocks[1].next_experiment, "");
  assert.deepEqual(out.knowledge_candidates, []);
}

function testMergedFoodInvestmentAndUncertainty() {
  const proposal = normalize(payload([
    {
      title: "시흥과 광주 투자 실패",
      context: "auction",
      experience: "시흥 1채와 광주 3채 모두 실패했다.",
      interpretation: "",
      change: "",
      next_experiment: "",
      related_objects: []
    }
  ]));
  proposal.uncertainties = ["부산 과열 여부", "신뢰도 문제 가능성"];
  const out = policy.applyConservativeProposalPolicy(proposal, "부산은 과열된 것 같다.\n시흥 1채 월세 80은 쏘쏘했고, 광주 3채는 실패했다.");
  assert.equal(out.evidence_blocks[0].experience, "시흥 1채와 광주 3채 모두 실패했다.");
  assert.deepEqual(out.uncertainties, ["부산 과열 여부"]);
}

function testGroundedKnowledgeSurvivesWithoutOperationalKeyword() {
  const proposal = normalize(payload([
    {
      title: "계약 책임 범위",
      context: "work",
      experience: "계약 책임 범위는 합의 문장에 남겨야 한다.",
      interpretation: "",
      change: "",
      next_experiment: "",
      related_objects: []
    }
  ]));
  proposal.knowledge_candidates = [
    {
      label: "계약 책임 범위는 합의 문장에 남겨야 한다.",
      source_evidence_ids: ["daily-2026-07-22-e01"],
      confidence: "explicit"
    },
    {
      label: "계약 책임 범위와 세금 리스크와 법률 자문은 합의 문장에 남긴다.",
      source_evidence_ids: ["daily-2026-07-22-e01"],
      confidence: "explicit"
    },
    {
      label: "契約 책임 범위는 합의 문장에 남겨야 한다.",
      source_evidence_ids: ["daily-2026-07-22-e01"],
      confidence: "explicit"
    }
  ];
  const out = policy.applyConservativeProposalPolicy(proposal, "계약 책임 범위는 합의 문장에 남겨야 한다.");
  assert.deepEqual(out.knowledge_candidates.map((item) => item.label), [
    "계약 책임 범위는 합의 문장에 남겨야 한다.",
    "계약 책임 범위와 세금 리스크와 법률 자문은 합의 문장에 남긴다."
  ]);
  assert.deepEqual(out.knowledge_candidates.map((item) => item.confidence), ["explicit", "low"]);
}

function main() {
  testTentativeAuctionAndOutcomeAttribution();
  testEvidenceTitleAndExperienceAreImmutable();
  testResourcePeopleAndSelfDirectiveBoundaries();
  testMergedFoodInvestmentAndUncertainty();
  testGroundedKnowledgeSurvivesWithoutOperationalKeyword();
  console.log("Daily reflection conservative policy tests passed");
}

if (require.main === module) {
  try { main(); } catch (error) {
    console.error(error.stack || error.message);
    process.exit(1);
  }
}

module.exports = { main };
