"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "../../../../../..");
const reasons = require(path.join(ROOT, "SYSTEM/Views/decision-packet-reasons.js"));

function testAuctionReasonsProjectFixedOrderAndTopics() {
  // Given: an Auction match with every signal plus two matched topics.
  // When: the reason formatter projects it.
  const result = reasons.auctionReasons({ direct: true, region: true, topic: true }, ["bidding", "tax"]);
  // Then: labels appear in the locked direct/region/topic order with topics inlined.
  assert.deepEqual([...result], ["현재 대상과 직접 연결", "동일 지역", "공통 주제: bidding, tax"]);
  assert.equal(Object.isFrozen(result), true);
}

function testAuctionTopicWithoutTokensFallsBackToGenericLabel() {
  // Given: a topic match with no concrete topic tokens.
  // When: the reason formatter projects it.
  const result = reasons.auctionReasons({ topic: true }, []);
  // Then: the generic topic label is used and no score leaks in.
  assert.deepEqual([...result], ["공통 주제"]);
}

function testReadingReasonsDeduplicateLabelsAndAppendEvidence() {
  // Given: duplicate relation labels plus an evidence line.
  // When: the reason formatter projects them.
  const result = reasons.readingReasons(["관계A", "관계A", "관계B"], "증거 한 줄");
  // Then: duplicates collapse in order and the evidence line is appended last.
  assert.deepEqual([...result], ["관계A", "관계B", "증거 한 줄"]);
  assert.equal(Object.isFrozen(result), true);
}

function testWorkoutReasonsMapKnownCodes() {
  // Given: a known Workout reason code.
  // When: the reason formatter projects it.
  const result = reasons.workoutReasons("exercise");
  // Then: the mapped Korean label is returned as a frozen single-element array.
  assert.deepEqual([...result], ["같은 운동 종목"]);
  assert.equal(Object.isFrozen(result), true);
}

function testUnknownAndNullInputsStaySafe() {
  // Given: unknown codes and null inputs across all three surfaces.
  // When: the reason formatter projects them.
  // Then: it never throws and returns empty frozen arrays.
  assert.deepEqual([...reasons.workoutReasons("unknown")], []);
  assert.deepEqual([...reasons.workoutReasons(null)], []);
  assert.deepEqual([...reasons.auctionReasons(null, null)], []);
  assert.deepEqual([...reasons.readingReasons(null, null)], []);
  assert.equal(Object.isFrozen(reasons.workoutReasons("unknown")), true);
  assert.equal(Object.isFrozen(reasons.auctionReasons(null, null)), true);
  assert.equal(Object.isFrozen(reasons.readingReasons(null, null)), true);
}

function main() {
  testAuctionReasonsProjectFixedOrderAndTopics();
  testAuctionTopicWithoutTokensFallsBackToGenericLabel();
  testReadingReasonsDeduplicateLabelsAndAppendEvidence();
  testWorkoutReasonsMapKnownCodes();
  testUnknownAndNullInputsStaySafe();
  console.log("Decision packet reason tests passed");
}

main();
