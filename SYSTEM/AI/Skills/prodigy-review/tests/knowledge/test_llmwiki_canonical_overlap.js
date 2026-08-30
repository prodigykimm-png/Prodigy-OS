"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");
const { test } = require("node:test");

const ROOT = path.resolve(__dirname, "../../../../../..");
const overlap = require(path.join(ROOT, "SYSTEM/Views/llmwiki-canonical-overlap.js"));

const claims = [
  { claim_id: "claim_pose", text: "신부는 어깨를 내리고 팔과 몸통 사이에 공간을 만들어 몸선을 정리한다." },
  { claim_id: "claim_gaze", text: "자연스러운 표정을 위해 시선을 먼저 유도한 뒤 고개 방향을 조정한다." },
];

test("wedding composition page anchors avoid duplicate create proposals", () => {
  const result = overlap.classify({
    page_title: "웨딩 스냅 구도 및 촬영 자세 기법",
    claims: [{ claim_id: "claim_composition", text: "부모님 인사 장면은 앉아서 촬영한다." }],
    canonical_documents: [{ candidate_id: "canonical_pose", title: "웨딩 스냅 포징 및 연출 구도 가이드",
      content: "인물의 자세와 구도를 정리한다.", read_only: true }],
  });
  assert.equal(result.ok, true);
  assert.equal(result.relation, "compatible_new");
  assert.equal(result.candidates[0].candidate_id, "canonical_pose");
});

test("wedding page title anchors recover canonical merge candidates", () => {
  const result = overlap.classify({
    page_title: "인물 구도 및 포징 디렉팅",
    claims: [{ claim_id: "claim_new_pose", text: "신부가 신랑 팔을 잡을 때 손이 과하게 드러나지 않도록 한다." }],
    canonical_documents: [{ candidate_id: "canonical_pose", title: "웨딩 스냅 포징 및 디렉팅 가이드",
      content: "부케와 몸선을 활용한 신부 포즈를 정리한다.", read_only: true }],
  });
  assert.equal(result.ok, true);
  assert.equal(result.relation, "compatible_new");
  assert.equal(result.candidates[0].candidate_id, "canonical_pose");
  assert.equal(result.evidence[0].title_anchor_match, true);
});

test("generic page titles do not create false canonical overlap", () => {
  const result = overlap.classify({
    page_title: "실무 가이드 및 관리 방법",
    claims: [{ claim_id: "claim_auction", text: "유치권 신고는 현황조사서와 점유 근거를 함께 확인해야 한다." }],
    canonical_documents: [{ candidate_id: "canonical_wedding", title: "웨딩 스냅 촬영 핵심 가이드",
      content: "신부대기실 촬영 동선을 정리한다.", read_only: true }],
  });
  assert.equal(result.ok, true);
  assert.equal(result.relation, "new");
});

test("all covered claims classify as duplicate", () => {
  const result = overlap.classify({ claims, canonical_documents: [{
    candidate_id: "canonical_pose", title: "웨딩 포징", read_only: true,
    content: "신부는 어깨를 내리고 팔과 몸통 사이에 공간을 만들어 몸선을 정리한다. 자연스러운 표정을 위해 시선을 먼저 유도한 뒤 고개 방향을 조정한다.",
  }] });
  assert.equal(result.ok, true);
  assert.equal(result.relation, "duplicate");
  assert.deepEqual(result.candidates[0].covered_claim_ids, ["claim_pose", "claim_gaze"]);
});

test("covered and novel claims classify as compatible update", () => {
  const result = overlap.classify({ claims, canonical_documents: [{
    candidate_id: "canonical_pose", title: "웨딩 포징", read_only: true,
    content: "신부는 어깨를 내리고 팔과 몸통 사이에 공간을 만들어 몸선을 정리한다.",
  }] });
  assert.equal(result.relation, "compatible_new");
  assert.deepEqual(result.candidates[0].covered_claim_ids, ["claim_pose"]);
});

test("equal canonical coverage remains a true ambiguity hold", () => {
  const result = overlap.classify({ claims: [claims[0]], canonical_documents: [
    { candidate_id: "canonical_a", title: "포징 A", read_only: true, content: claims[0].text },
    { candidate_id: "canonical_b", title: "포징 B", read_only: true, content: claims[0].text },
  ] });
  assert.equal(result.relation, "ambiguous");
  assert.equal(result.status, "hold");
  assert.equal(result.candidates.length, 2);
});

test("generic vocabulary alone does not create overlap", () => {
  const result = overlap.classify({ claims: [{ claim_id: "claim_camera", text: "카메라 ISO와 셔터속도를 예식장 조명에 맞춘다." }], canonical_documents: [{
    candidate_id: "canonical_property", title: "부동산 투자 가이드", read_only: true, content: "투자 방법과 분석 기준을 설명한다.",
  }] });
  assert.equal(result.relation, "new");
  assert.equal(result.candidates.length, 0);
});
