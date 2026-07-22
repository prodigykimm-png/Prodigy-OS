"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "../../../../../..");
const core = require(path.join(ROOT, "SYSTEM/Views/evidence-quality-core.js"));

function main() {
  // Given: no meaningful experience
  // When: quality is evaluated
  // Then: the evidence is invalid regardless of other fields.
  const invalid = core.evaluateEvidenceQuality({
    context: "운동 전",
    experience: "   ",
    interpretation: "컨디션을 확인했다.",
    change: "워밍업을 늘린다.",
    next_experiment: "내일 5분 더 걷는다."
  });
  assert.equal(invalid.status, "invalid");
  assert.equal(invalid.label, "유효하지 않음");
  assert.deepEqual(invalid.reason_codes, ["missing_experience"]);
  assert.deepEqual(invalid.reasons, ["경험을 입력해 주세요."]);

  // Given: an experience and fewer than two independent signals
  // When: quality is evaluated
  // Then: it remains thin, including the user's short workout sentence.
  const thin = core.evaluateEvidenceQuality({
    title: "운동",
    related_objects: ["[[운동]]", "[[건강]]"],
    experience: "운동했다."
  });
  assert.equal(thin.status, "thin");
  assert.equal(thin.label, "보완 필요");
  assert.deepEqual(thin.reason_codes, [
    "missing_context",
    "missing_interpretation_or_change",
    "missing_next_experiment"
  ]);

  // Given: an experience and exactly two independent signals
  // When: quality is evaluated
  // Then: it is usable; interpretation and change count as one signal together.
  const usable = core.evaluateEvidenceQuality({
    context: "퇴근 뒤 피곤한 상태",
    experience: "운동복을 미리 꺼내두니 바로 운동을 시작해 끝냈다.",
    interpretation: "시작 장벽이 낮아졌다.",
    change: "운동복을 전날 준비한다.",
    next_experiment: ""
  });
  assert.equal(usable.status, "usable");
  assert.equal(usable.label, "사용 가능");
  assert.deepEqual(usable.reason_codes, ["missing_next_experiment"]);

  // Given: all three signals
  // When: quality is evaluated
  // Then: the condition/action/result example is strong.
  const source = {
    confidence: "inferred",
    context: "퇴근 후 피곤해 운동을 미루기 쉬운 조건",
    experience: "운동복을 미리 꺼내두고 바로 입어 운동을 끝냈다.",
    interpretation: "준비 행동이 시작 장벽을 낮춘다.",
    change: "운동복을 전날 의자에 둔다.",
    next_experiment: "이번 주 평일 3일 전날에 운동복을 둔다."
  };
  const snapshot = structuredClone(source);
  const strong = core.evaluateEvidenceQuality(source);
  assert.equal(strong.status, "strong");
  assert.equal(strong.label, "근거 충분");
  assert.deepEqual(strong.reason_codes, []);
  assert.deepEqual(source, snapshot);

  // Given: low-confidence and manual sources plus malformed fields
  // When: quality is evaluated
  // Then: source confidence is irrelevant and malformed values are safely blank.
  assert.equal(core.evaluateEvidenceQuality({
    confidence: "low", experience: "기록", context: ["배열"], interpretation: { text: "객체" }
  }).status, "thin");
  assert.equal(core.evaluateEvidenceQuality({
    source: "manual", experience: "기록", context: "맥락", next_experiment: "다음에 확인"
  }).status, "usable");
  assert.equal(core.evaluateEvidenceQuality(null).status, "invalid");

  // Given: each missing-signal combination around a real experience
  // When: quality is evaluated
  // Then: reason codes are deterministic and ordered by the three signals.
  const combinations = [
    [{}, ["missing_context", "missing_interpretation_or_change", "missing_next_experiment"]],
    [{ context: "맥락" }, ["missing_interpretation_or_change", "missing_next_experiment"]],
    [{ interpretation: "해석" }, ["missing_context", "missing_next_experiment"]],
    [{ change: "변화" }, ["missing_context", "missing_next_experiment"]],
    [{ next_experiment: "실험" }, ["missing_context", "missing_interpretation_or_change"]],
    [{ context: "맥락", interpretation: "해석" }, ["missing_next_experiment"]],
    [{ context: "맥락", next_experiment: "실험" }, ["missing_interpretation_or_change"]],
    [{ interpretation: "해석", next_experiment: "실험" }, ["missing_context"]]
  ];
  for (const [signals, expectedReasons] of combinations) {
    const result = core.evaluateEvidenceQuality({ experience: "경험", ...signals });
    assert.deepEqual(result.reason_codes, expectedReasons);
  }

  // Given: every promotion guard branch
  // When: a promotion is checked
  // Then: thin needs explicit human override and an approval note, while invalid never passes.
  assert.equal(core.checkPromotionEligibility(invalid, { override: true, approval_note: "승인" }).allowed, false);
  assert.equal(core.checkPromotionEligibility(thin, {}).allowed, false);
  assert.equal(core.checkPromotionEligibility(thin, { override: true, approval_note: "  " }).allowed, false);
  assert.equal(core.checkPromotionEligibility(thin, { override: "true", approval_note: "사용자 확인" }).allowed, false);
  assert.equal(core.checkPromotionEligibility(thin, { override: true, approval_note: "사용자 확인" }).allowed, true);
  assert.equal(core.checkPromotionEligibility(usable, {}).allowed, true);
  assert.equal(core.checkPromotionEligibility(strong, { override: false, approval_note: null }).allowed, true);
  assert.equal(core.checkPromotionEligibility({ status: "unexpected" }, { override: true, approval_note: "승인" }).allowed, false);

  // Given: source files that could persist frontmatter
  // When: they are inspected
  // Then: no evidence_quality property is written or declared.
  const persistenceSources = [
    "SYSTEM/Views/journal-store.js",
    "SYSTEM/TEMPLATE/FORMAT/template_daily_note.md"
  ];
  for (const relativePath of persistenceSources) {
    const sourceText = fs.readFileSync(path.join(ROOT, relativePath), "utf8");
    assert.doesNotMatch(sourceText, /(?:^|[\n\r])\s*evidence_quality\s*:/m);
  }

  console.log("Evidence quality core tests passed");
}

main();
