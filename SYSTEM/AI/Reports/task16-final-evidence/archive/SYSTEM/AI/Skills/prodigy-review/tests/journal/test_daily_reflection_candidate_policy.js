"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "../../../../../..");
const reflection = require(path.join(ROOT, "SYSTEM/Views/daily-reflection-ai.js"));

function proposalWithCandidate(candidate, experience) {
  return {
    evidence_blocks: [{
      title: "장소 방문",
      context: "work",
      experience,
      interpretation: "",
      change: "",
      next_experiment: "",
      related_objects: []
    }],
    knowledge_candidates: [],
    resource_candidates: [candidate],
    object_linking_suggestions: [],
    pre_routing_suggestions: [],
    uncertainties: []
  };
}

function testCandidateTypeRejectsUnsupportedPlace() {
  // Given: a resource candidate with the retired generic place discriminator.
  const payload = proposalWithCandidate({
    name: "성수 카페",
    suggested_type: "place",
    source_evidence_indexes: [0]
  }, "성수 카페에서 커피를 마셨다.");

  // When/Then: the proposal boundary rejects it before any write can happen.
  assert.throws(
    () => reflection.normalizeProposal(payload, { dateStr: "2026-07-20" }),
    /suggested_type must be resource or venue/i
  );
}

function testWeddingShootingVenueIsEligible() {
  // Given: an explicit wedding shooting hall candidate.
  const payload = proposalWithCandidate({
    name: "아펠가모 웨딩홀",
    suggested_type: "venue",
    source_evidence_indexes: [0]
  }, "아펠가모 웨딩홀에서 결혼식 촬영을 진행했다.");

  // When: the AI response crosses the normalizer boundary.
  const normalized = reflection.normalizeProposal(payload, { dateStr: "2026-07-20" });

  // Then: the Venue handoff policy accepts only this explicitly evidenced case.
  assert.equal(
    reflection.isVenueEligibleCandidate(normalized.resource_candidates[0], normalized.evidence_blocks),
    true
  );
}

function testObservedWeddingHallEvidenceIsEligible() {
  // Given: a named ceremony hall and an explicitly wedding-specific shooting context.
  const payload = proposalWithCandidate({
    name: "국민연금 컨벤션홀",
    suggested_type: "venue",
    source_evidence_indexes: [0]
  }, "국민연금 컨벤션홀 촬영에서 원판을 진행할 때 헬퍼가 신부 옷을 정리 중인데 부케를 던지게 할 뻔했다.");

  // When: the proposal is normalized before any confirmation or local handoff.
  const normalized = reflection.normalizeProposal(payload, { dateStr: "2026-07-20" });

  // Then: the hall remains an eligible Venue proposal; it has not created anything.
  assert.equal(normalized.resource_candidates[0].suggested_type, "venue");
  assert.equal(
    reflection.isVenueEligibleCandidate(normalized.resource_candidates[0], normalized.evidence_blocks),
    true
  );
}

function testCafeRemainsGeneralPlaceResource() {
  // Given: a café proposed as a general-place candidate.
  const payload = proposalWithCandidate({
    name: "성수 카페",
    suggested_type: "resource",
    source_evidence_indexes: [0]
  }, "성수 카페에서 커피를 마셨다.");

  // When: the AI response crosses the normalizer boundary.
  const normalized = reflection.normalizeProposal(payload, { dateStr: "2026-07-20" });

  // Then: it remains a capture candidate and cannot receive the Venue handoff.
  assert.equal(normalized.resource_candidates[0].suggested_type, "resource");
  assert.equal(
    reflection.isVenueEligibleCandidate(normalized.resource_candidates[0], normalized.evidence_blocks),
    false
  );
}

function testCafeCannotBecomeVenue() {
  // Given: a general-place cafe candidate mislabeled as a Venue.
  const payload = proposalWithCandidate({
    name: "성수 카페",
    suggested_type: "venue",
    source_evidence_indexes: [0]
  }, "성수 카페에서 커피를 마셨다.");

  // When/Then: the normalizer rejects the invalid Wedding Venue handoff.
  assert.throws(
    () => reflection.normalizeProposal(payload, { dateStr: "2026-07-20" }),
    /wedding shooting venue/i
  );
}

testCandidateTypeRejectsUnsupportedPlace();
testWeddingShootingVenueIsEligible();
testObservedWeddingHallEvidenceIsEligible();
testCafeRemainsGeneralPlaceResource();
testCafeCannotBecomeVenue();
console.log("Daily reflection candidate policy tests passed");
