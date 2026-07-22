"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const ROOT = path.resolve(__dirname, "../../../../../..");
const data = (value) => JSON.parse(JSON.stringify(value));

function loadCore() {
  const source = fs.readFileSync(path.join(ROOT, "SYSTEM/Views/knowledge-candidate-core.js"), "utf8");
  const sandbox = { window: {} };
  vm.runInNewContext(source, sandbox, { filename: "knowledge-candidate-core.js" });
  return sandbox.window.KnowledgeCandidateCore;
}

function savedDailyCandidate() {
  return {
    candidate_id: "candidate-daily-001",
    title: "반복 독서는 회상 연습을 포함한다",
    statement: "반복 독서에서는 회상 연습을 함께 해야 이해가 오래 유지된다.",
    reason: "두 번의 독서 기록에서 회상 유무에 따른 차이가 확인되었다.",
    source_type: "daily_evidence",
    source_evidence_ids: ["daily-2026-07-20-e02", " daily-2026-07-20-e01 ", "daily-2026-07-20-e02"],
    source_objects: ["[[DAILY/2026-07-20]]", " [[DAILY/2026-07-20]] "],
    confidence: "explicit",
    suggested_domain: "reading",
    suggested_topics: [],
    approval_note: "",
    created: "2026-07-20T10:00:00+09:00",
    updated: "2026-07-20T10:00:00+09:00"
  };
}

function savedManualCandidate(overrides) {
  return {
    candidate_id: "candidate-manual-001",
    title: "설계 검토에서 회상한다",
    statement: "설계 검토에서는 먼저 회상한 뒤 근거를 확인한다.",
    reason: "직접 학습에서 반복해 확인한 흐름이다.",
    source_type: "manual_study",
    source_evidence_ids: [],
    source_objects: [],
    source_note: "2026-07-21 개인 설계 노트\n두 번째 검토에서 다시 확인했다.",
    application_trigger: "다음 설계 검토",
    application_contexts: ["reading", "coding/typescript", "reading"],
    confidence: "explicit",
    suggested_domain: "reading",
    suggested_topics: [],
    approval_note: "",
    created: "2026-07-21T10:00:00+09:00",
    updated: "2026-07-21T10:00:00+09:00",
    ...overrides
  };
}

function testNewDailyCandidateHasCanonicalImmutableShape(core) {
  // Given: a human-selected Daily Evidence candidate with list duplicates.
  const input = savedDailyCandidate();
  const before = JSON.stringify(input);

  // When: the pure core creates its canonical new-write shape.
  const candidate = core.createCandidate(input);

  // Then: it is saved, remains a candidate, and contains normalized provenance only.
  assert.equal(candidate.type, "knowledge_candidate");
  assert.equal(candidate.status, "saved");
  assert.equal(candidate.promoted_knowledge, "");
  assert.equal(candidate.promotion_target, "");
  assert.deepEqual(data(candidate.source_evidence_ids), ["daily-2026-07-20-e02", "daily-2026-07-20-e01"]);
  assert.deepEqual(data(candidate.source_objects), ["[[DAILY/2026-07-20]]"]);
  assert.equal(Object.isFrozen(candidate), true);
  assert.equal(Object.isFrozen(candidate.source_evidence_ids), true);
  assert.throws(() => candidate.source_evidence_ids.push("new"), (error) => error && error.name === "TypeError");
  assert.equal(JSON.stringify(input), before);
  assert.equal(core.isActive(candidate), true);
  assert.equal(core.isTerminal(candidate), false);
  assert.deepEqual(data(core.validateCandidate(candidate)), data(candidate));
  assert.throws(
    () => core.createCandidate({ ...input, promotion_target: "ZETA/PERMANENT/implicit.md" }),
    /does not promote/i
  );
}

function testLegacyReadingNormalizationAndStableIds(core) {
  // Given: a legacy Reading proposal with only its session provenance.
  const legacy = {
    type: "knowledge_candidate",
    title: "독서 후 회상",
    statement: "읽고 난 뒤 회상하면 이해가 오래 유지된다.",
    reason: "독서 세션의 직접 기록이다.",
    source_session_id: "session-book-001",
    source_session: "[[PARA/RESOURCES/Reading/Sessions/session-book-001]]",
    source_book: "테스트 책",
    created: "2026-07-20T10:00:00+09:00",
    updated: "2026-07-20T10:00:00+09:00"
  };

  // When: it is normalized twice without a caller-provided ID.
  const first = core.normalizeLegacyReadingCandidate(legacy);
  const second = core.normalizeLegacyReadingCandidate({ ...legacy });

  // Then: it retains the legacy proposed workflow and receives one deterministic ID.
  assert.equal(first.status, "proposed");
  assert.equal(first.source_type, "reading_session");
  assert.equal(first.confidence, "low");
  assert.deepEqual(data(first.source_evidence_ids), []);
  assert.deepEqual(data(first.source_objects), ["[[PARA/RESOURCES/Reading/Sessions/session-book-001]]"]);
  assert.equal(first.candidate_id, second.candidate_id);
  assert.match(first.candidate_id, /^candidate-/);
  assert.equal(core.transitionCandidate(first, "saved").status, "saved");
  assert.equal(core.transitionCandidate(first, "rejected").status, "rejected");
  assert.throws(() => core.transitionCandidate(first, "approved"), /cannot transition/i);
}

function testAuthoredCandidateProvenanceAndApplicationMetadata(core) {
  // Given: a direct-study Candidate with no Evidence/Object link and a topicless Domain.
  const input = savedManualCandidate();
  const before = JSON.stringify(input);

  // When: the core creates the canonical saved Candidate.
  const candidate = core.createCandidate(input);

  // Then: direct-study provenance and normalized application metadata survive without implying promotion.
  assert.equal(candidate.source_type, "manual_study");
  assert.deepEqual(data(candidate.source_evidence_ids), []);
  assert.deepEqual(data(candidate.source_objects), []);
  assert.equal(candidate.source_note, input.source_note);
  assert.equal(candidate.application_trigger, "다음 설계 검토");
  assert.deepEqual(data(candidate.application_contexts), ["reading", "coding/typescript"]);
  assert.equal(candidate.status, "saved");
  assert.equal(candidate.promoted_knowledge, "");
  assert.equal(Object.isFrozen(candidate.application_contexts), true);
  assert.equal(JSON.stringify(input), before);

  // Given: a study-material Candidate whose provenance must point at exactly one canonical source Object.
  const material = savedManualCandidate({
    source_type: "study_material",
    source_note: "자료에서 확인한 메모",
    source_objects: ["[[ZETA/LITERATURE/공식 문서]]"],
  });

  // When: it is normalized.
  const normalizedMaterial = core.createCandidate(material);

  // Then: its exact canonical source link is retained, while malformed and untrusted links fail at the boundary.
  assert.deepEqual(data(normalizedMaterial.source_objects), ["[[ZETA/LITERATURE/공식 문서]]"]);
  assert.deepEqual(data(core.createCandidate({ ...material, source_objects: ["[[ZETA/LITERATURE/공식 문서.md]]"] }).source_objects), ["[[ZETA/LITERATURE/공식 문서]]"]);
  assert.throws(() => core.createCandidate({ ...material, source_objects: [] }), /학습 자료 출처를 하나만 선택/);
  assert.throws(() => core.createCandidate({ ...material, source_objects: ["[[PARA/RESOURCES/not-literature]]"] }), /학습 자료 출처를 하나만 선택/);
  assert.throws(() => core.createCandidate({ ...material, source_objects: ["[[ZETA/LITERATURE/../escape]]"] }), /학습 자료 출처를 하나만 선택/);
  assert.throws(() => core.createCandidate({ ...input, source_note: "  " }), /직접 학습 출처 메모/);
  assert.throws(() => core.createCandidate({ ...input, application_contexts: ["reading/not_registered"] }), /유효하지 않은 적용 맥락/);
}

function testTransitionsAndRetrySafePromotion(core) {
  // Given: a saved Candidate that has not created a Knowledge Object.
  const coreCandidate = core.createCandidate(savedDailyCandidate());

  // When: promotion target is recorded before a writer creates Knowledge.
  const targeted = core.setPromotionTarget(coreCandidate, "ZETA/PERMANENT/반복 독서와 회상.md");

  // Then: it remains saved and no Knowledge is implied.
  assert.equal(targeted.status, "saved");
  assert.equal(targeted.type, "knowledge_candidate");
  assert.equal(targeted.promoted_knowledge, "");
  assert.equal(targeted.promotion_target, "ZETA/PERMANENT/반복 독서와 회상.md");
  assert.throws(() => core.transitionCandidate(coreCandidate, "approved"), /promoted_knowledge/i);
  assert.throws(
    () => core.finalizePromotion(targeted, "[[ZETA/PERMANENT/different]]"),
    /must match promotion_target/i
  );

  // When: a writer reports the created canonical Knowledge link.
  const approved = core.finalizePromotion(targeted, "[[ZETA/PERMANENT/반복 독서와 회상]]");

  // Then: finalization is approved and an identical retry is idempotent.
  assert.equal(approved.status, "approved");
  assert.equal(approved.promoted_knowledge, "[[ZETA/PERMANENT/반복 독서와 회상]]");
  assert.equal(approved.type, "knowledge_candidate");
  assert.equal(core.isActive(approved), false);
  assert.equal(core.isTerminal(approved), true);
  assert.deepEqual(data(core.finalizePromotion(approved, "[[ZETA/PERMANENT/반복 독서와 회상]]")), data(approved));
  assert.throws(() => core.finalizePromotion(approved, "[[ZETA/PERMANENT/different]]"), /different canonical Knowledge link/i);
}

function testInvalidStatesAndMalformedData(core) {
  // Given: an otherwise valid Candidate.
  const saved = core.createCandidate(savedDailyCandidate());

  // When/Then: malformed arrays, invalid taxonomy/status, and terminal transitions fail without mutation.
  assert.throws(() => core.createCandidate({ ...savedDailyCandidate(), source_evidence_ids: "daily-e01" }), /source_evidence_ids.*array/i);
  assert.throws(() => core.createCandidate({ ...savedDailyCandidate(), source_objects: "[[Daily]]" }), /source_objects.*array/i);
  assert.throws(() => core.createCandidate({ ...savedDailyCandidate(), confidence: "certain" }), /confidence/i);
  assert.throws(() => core.createCandidate({ ...savedDailyCandidate(), suggested_domain: "global_domain" }), /suggested_domain/i);
  assert.throws(() => core.createCandidate({ ...savedDailyCandidate(), suggested_domain: "reading", suggested_topics: ["react"] }), /suggested_topics/i);
  assert.throws(() => core.createCandidate({ ...savedDailyCandidate(), status: "active" }), /status/i);
  assert.throws(() => core.setPromotionTarget(saved, "../ZETA/PERMANENT/nope.md"), /promotion_target/i);
  assert.throws(() => core.finalizePromotion(saved, "[[ZETA/PERMANENT/missing-target]]"), /promotion target/i);
  assert.throws(
    () => core.validateCandidate({
      ...saved,
      status: "approved",
      promotion_target: "ZETA/PERMANENT/expected.md",
      promoted_knowledge: "[[ZETA/PERMANENT/different]]"
    }),
    /must match promotion_target/i
  );

  const rejected = core.transitionCandidate(saved, "rejected");
  assert.equal(rejected.status, "rejected");
  assert.equal(core.isTerminal(rejected), true);
  assert.throws(() => core.transitionCandidate(rejected, "saved"), /rejected.*terminal/i);
  assert.throws(() => core.transitionCandidate(rejected, "approved"), /rejected.*terminal/i);
  assert.throws(() => core.transitionCandidate(core.finalizePromotion(core.setPromotionTarget(saved, "ZETA/PERMANENT/a.md"), "[[ZETA/PERMANENT/a]]"), "rejected"), /approved.*terminal/i);
}

function main() {
  const core = loadCore();
  testNewDailyCandidateHasCanonicalImmutableShape(core);
  testLegacyReadingNormalizationAndStableIds(core);
  testAuthoredCandidateProvenanceAndApplicationMetadata(core);
  testTransitionsAndRetrySafePromotion(core);
  testInvalidStatesAndMalformedData(core);
  console.log("Knowledge candidate core tests passed");
}

main();
