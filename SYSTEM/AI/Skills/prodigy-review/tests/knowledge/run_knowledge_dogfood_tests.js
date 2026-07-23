"use strict";

// Read-only dogfooding validation (Todo 11). Runs the synthetic cohort through the
// pure contracts (state machine, reason formatter, body recorder) and proves the
// product guardrails: no auto-use, no terminal reopen, no approval while deferred,
// no personal-path leakage. It writes nothing under the real Vault.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "../../../../../..");
require(path.join(ROOT, "SYSTEM/Views/knowledge-explorer-registry.js"));
require(path.join(ROOT, "SYSTEM/Views/knowledge-candidate-core.js"));
const core = globalThis.KnowledgeCandidateCore;
const reasons = require(path.join(ROOT, "SYSTEM/Views/decision-packet-reasons.js"));
const bodyCore = require(path.join(ROOT, "SYSTEM/Views/knowledge-use-body-core.js"));
const fixtures = require(path.join(ROOT, "SYSTEM/AI/Skills/prodigy-review/tests/knowledge/knowledge_dogfood_fixtures.js"));

const DATE = "2026-07-23";
const PERSONAL_PATTERNS = [/DAILY\//, /PARA\/PROJECTS\/Auction\//, /PARA\/RESOURCES\/CONTACTS\//, /PARA\/People\//, /PARA\/RESOURCES\/Knowledge\/Candidates\//];
const OUTCOMES = ["proposed", "saved", "needs_more_evidence", "approved", "rejected"];
const SURFACES = ["auction", "reading", "workout"];

function baseCandidate(status) {
  return {
    type: "knowledge_candidate", candidate_id: "candidate-df", status, title: "합성 후보",
    statement: "합성 검증 문장", reason: "dogfood", source_type: "daily_evidence",
    source_evidence_ids: ["daily-synth-01"], source_objects: [], confidence: "explicit",
    suggested_domain: "coding", suggested_topics: [], approval_note: "",
    promotion_target: "", promoted_knowledge: "", created: "2026-07-23", updated: "2026-07-23"
  };
}

function auctionNote() { return "---\ntype: auction_case\n---\n# 요약\n- x\n# 판단 기록\n### 판단 변경 기록\n- y\n# 복기\n- z\n"; }
function readingNote() { return "---\ntype: reading\n---\n# 책\n## Review\n- r\n## Action Items\n- a\n"; }
function workoutNote() { return "---\ntype: workout_program\n---\n# 프로그램\n# 리뷰\n- w\n# 메모\n- m\n"; }

function testCohortShapeAndCoverage() {
  const cohort = fixtures.cohort;
  assert.ok(cohort.length >= 10 && cohort.length <= 20, "cohort must be 10-20 items");
  assert.equal(Object.isFrozen(cohort), true);
  const serialized = JSON.stringify(cohort);
  for (const pattern of PERSONAL_PATTERNS) assert.equal(pattern.test(serialized), false, "cohort must not contain personal paths");
  const outcomes = new Set(cohort.map((item) => item.outcome));
  const surfaces = new Set(cohort.map((item) => item.surface));
  for (const outcome of OUTCOMES) assert.ok(outcomes.has(outcome), `missing outcome ${outcome}`);
  for (const surface of SURFACES) assert.ok(surfaces.has(surface), `missing surface ${surface}`);
}

function testStateMachineGuardrails() {
  // Given: a saved candidate.
  const saved = core.createCandidate(baseCandidate("saved"));
  // When: it is deferred for more evidence.
  const deferred = core.transitionCandidate(saved, "needs_more_evidence");
  // Then: it stays active and non-terminal, but cannot be approved or promoted.
  assert.equal(core.isActive(deferred), true);
  assert.equal(core.isTerminal(deferred), false);
  assert.throws(() => core.transitionCandidate(deferred, "approved"), /needs_more_evidence/);
  assert.throws(() => core.setPromotionTarget(deferred, "ZETA/PERMANENT/x.md"), /needs_more_evidence/);
  // And: a finalized candidate is terminal and cannot be reopened.
  const targeted = core.setPromotionTarget(saved, "ZETA/PERMANENT/x.md");
  const approved = core.finalizePromotion(targeted, "[[ZETA/PERMANENT/x]]");
  assert.throws(() => core.transitionCandidate(approved, "rejected"), /terminal/);
  // And: candidates are never created directly in the remediation state (no auto path).
  assert.throws(() => core.createCandidate(baseCandidate("needs_more_evidence")), /saved/);
}

function testReasonProjectionPerSurface() {
  for (const item of fixtures.cohort) {
    let result;
    if (item.surface === "auction") result = reasons.auctionReasons(item.reason.matched, item.reason.topics);
    else if (item.surface === "reading") result = reasons.readingReasons(item.reason.labels, item.reason.evidence);
    else result = reasons.workoutReasons(item.reason.code);
    assert.ok(Array.isArray(result), `${item.id} reasons must be an array`);
    assert.equal(Object.isFrozen(result), true, `${item.id} reasons must be frozen`);
    assert.equal(result.some((label) => typeof label !== "string"), false, `${item.id} reasons must be strings`);
  }
}

function testBodyRecordingPerTarget() {
  const cases = [
    ["auction_case", auctionNote(), "# 판단 기록", "# 복기"],
    ["reading", readingNote(), "## Review", "## Action Items"],
    ["workout_program", workoutNote(), "# 리뷰", "# 메모"]
  ];
  for (const [type, note, open, close] of cases) {
    const result = bodyCore.recordKnowledgeUse(note, type, "synth.md", { date: DATE, context: "합성 판단 맥락", links: ["[[ZETA/PERMANENT/synth]]"] });
    assert.equal(result.status, "recorded");
    const at = result.content.indexOf("PRODIGY:KNOWLEDGE_USE");
    assert.ok(at > result.content.indexOf(open) && at < result.content.indexOf(close), `${type} block stays inside its section`);
  }
  // Missing target section fails without mutation.
  assert.throws(() => bodyCore.recordKnowledgeUse("---\ntype: auction_case\n---\n# 요약\n- only\n", "auction_case", "synth.md", { date: DATE, context: "맥락", links: ["[[ZETA/PERMANENT/synth]]"] }), /대상 섹션/);
}

function main() {
  testCohortShapeAndCoverage();
  testStateMachineGuardrails();
  testReasonProjectionPerSurface();
  testBodyRecordingPerTarget();
  const cohort = fixtures.cohort;
  const counts = OUTCOMES.map((outcome) => `${outcome}=${cohort.filter((item) => item.outcome === outcome).length}`).join(", ");
  console.log(`Knowledge dogfood validation passed: cohort ${cohort.length} (${counts}); auto-use 0, terminal-reopen 0, deferred-approval 0, personal-path 0.`);
}

try {
  main();
} catch (error) {
  console.error(`Knowledge dogfood validation failed: ${error.stack || error.message}`);
  process.exitCode = 1;
}
