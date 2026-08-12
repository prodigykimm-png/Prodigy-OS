"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "../../../../../..");
const core = require(path.join(ROOT, "SYSTEM/Views/weekly-filter-core.js"));

const SAMPLE_DAILY = `---
journal: personal daily
date: 2026-07-20
---
# 2026-07-20

## Evidence

### e01 · 85mm 거리 조절
<!-- evidence_id: daily-2026-07-20-e01 -->

Context: work

Experience:
85mm 가로 렌즈로 홀 연출을 촬영할 때 너무 앞에서 찍어 결과물이 초보자처럼 보임.

Change:
85mm 가로 전면 촬영 시 지나치게 가까이 다가가지 않고 적절한 촬영 거리를 유지한다.

### e02 · 원판 촬영 확인
<!-- evidence_id: daily-2026-07-20-e02 -->

Context: work

Experience:
원판 촬영 과정에서 헬퍼가 신부의 의상을 정리 중임에도 침착함을 잃고 부케를 던지게 지시할 뻔함.

Change:
촬영을 개시하거나 신호를 주기 전에 항상 침착하게 주변을 살피고 모든 정리가 끝났는지 다 확인한 후 이벤트를 진행함.
`;

const SAMPLE_DAILY_2 = `---
journal: personal daily
date: 2026-07-21
---
# 2026-07-21

## Evidence

### e01 · 85mm 거리 재확인
<!-- evidence_id: daily-2026-07-21-e01 -->

Context: work

Experience:
85mm 가로 촬영 시 너무 피사체와 가까운 전면 거리에서 촬영을 진행하여 원치 않는 초보적인 구도가 발생함.

Change:
85mm 가로 촬영 시 지나치게 가까이 다가가지 않고 적절한 촬영 거리를 유지한다.
`;

const SAMPLE_DAILY_3 = `---
journal: personal daily
date: 2026-07-22
---
# 2026-07-22

## Evidence

### e01 · 촬영 전 확인
<!-- evidence_id: daily-2026-07-22-e01 -->

Context: work

Experience:
촬영 시작 전에 스태프와 현장을 확인하지 않아 실수가 발생함.

Change:
촬영을 개시하거나 신호를 주기 전에 항상 침착하게 주변을 살피고 모든 정리가 끝났는지 다 확인한 후 이벤트를 진행함.
`;

const LEGACY_DAILY = `---
journal: personal daily
date: 2026-07-13
---
# 2026-07-13

## 성찰 (Reflection)
교육훈련비 협의를 한달을 넘게 끌다가 오늘에서야 시작했다.

## 변화 (Change)
바로 해결할 수 있는 일은 바로하자.

## 다음 실험 (Next Experiment)
회사에서 바로 처리할 수 있는 작은 일이 생긴다면 바로 시행하기.
`;

// --- parseDailyEvidenceBlocks ---

(function testParseEvidenceBlocks() {
  const blocks = core.parseDailyEvidenceBlocks(SAMPLE_DAILY, "2026-07-20");
  assert.equal(blocks.length, 2, "should parse 2 evidence blocks");
  assert.equal(blocks[0].evidence_id, "daily-2026-07-20-e01");
  assert.equal(blocks[0].context, "work");
  assert.ok(blocks[0].experience.includes("85mm"));
  assert.ok(blocks[0].change.includes("가까이 다가가지"));
  assert.equal(blocks[1].evidence_id, "daily-2026-07-20-e02");
  console.log("PASS: parseDailyEvidenceBlocks (multi-block)");
})();

(function testParseLegacy() {
  const blocks = core.parseDailyEvidenceBlocks(LEGACY_DAILY, "2026-07-13");
  assert.equal(blocks.length, 1, "legacy should produce 1 block");
  assert.equal(blocks[0].evidence_id, "daily-2026-07-13");
  assert.ok(blocks[0].experience.includes("교육훈련비"));
  assert.ok(blocks[0].change.includes("바로 해결"));
  assert.equal(blocks[0].legacy, true);
  console.log("PASS: parseDailyEvidenceBlocks (legacy)");
})();

// --- parseISOWeek ---

(function testParseISOWeek() {
  const p = core.parseISOWeek("2026-W30");
  assert.ok(p, "should parse 2026-W30");
  assert.equal(p.week, "2026-W30");
  assert.equal(core.formatDate(p.start), "2026-07-20");
  assert.equal(core.formatDate(p.end), "2026-07-26");
  console.log("PASS: parseISOWeek");
})();

(function testParseISOWeekInvalid() {
  assert.equal(core.parseISOWeek("invalid"), null);
  assert.equal(core.parseISOWeek("2026-W54"), null);
  assert.equal(core.parseISOWeek(""), null);
  console.log("PASS: parseISOWeek (invalid)");
})();

(function testCurrentISOWeek() {
  const d = new Date(Date.UTC(2026, 6, 22));
  const w = core.currentISOWeek(d);
  assert.equal(w, "2026-W30");
  console.log("PASS: currentISOWeek");
})();

(function testISOWeekForSelectedDate() {
  assert.equal(core.isoWeekForDate("2026-07-19"), "2026-W29", "Sunday belongs to the preceding ISO week");
  assert.equal(core.isoWeekForDate("2026-07-20"), "2026-W30", "Monday starts the next ISO week");
  assert.equal(core.isoWeekForDate("2026-02-30"), null, "invalid calendar dates are rejected");
  assert.equal(core.shiftISODate("2026-07-20", -7), "2026-07-13", "week navigation preserves local calendar dates");
  console.log("PASS: selected date maps to its ISO week");
})();

// --- detectPatterns: same-day duplicates must NOT form a pattern ---

(function testDetectPatternsSameDayNoPattern() {
  const items = core.parseDailyEvidenceBlocks(SAMPLE_DAILY, "2026-07-20");
  const patterns = core.detectPatterns(items);
  const sameDayPattern = patterns.find(function (p) {
    return p.evidence_refs.every(function (ref) { return ref.includes("2026-07-20"); });
  });
  assert.ok(!sameDayPattern, "same-day repeated change must NOT form a pattern");
  console.log("PASS: detectPatterns (same-day no pattern)");
})();

// --- detectPatterns: cross-day repeated change forms a pattern ---

(function testDetectPatternsCrossDay() {
  const items1 = core.parseDailyEvidenceBlocks(SAMPLE_DAILY, "2026-07-20");
  const items2 = core.parseDailyEvidenceBlocks(SAMPLE_DAILY_2, "2026-07-21");
  const all = items1.concat(items2);
  const patterns = core.detectPatterns(all);
  assert.ok(patterns.length >= 1, "cross-day repeated change should form a pattern");
  const behavioral = patterns.find(function (p) { return p.type === "behavioral_pattern"; });
  assert.ok(behavioral, "should be behavioral_pattern type");
  assert.ok(behavioral.day_count >= 2, "pattern should span 2+ days");
  console.log("PASS: detectPatterns (cross-day behavioral pattern)");
})();

// --- detectPatterns: no repeated context/object noise ---

(function testDetectPatternsNoContextNoise() {
  const items1 = core.parseDailyEvidenceBlocks(SAMPLE_DAILY, "2026-07-20");
  const items2 = core.parseDailyEvidenceBlocks(SAMPLE_DAILY_2, "2026-07-21");
  const all = items1.concat(items2);
  const patterns = core.detectPatterns(all);
  const contextPattern = patterns.find(function (p) { return p.type === "repeated_context"; });
  const objectPattern = patterns.find(function (p) { return p.type === "repeated_object"; });
  assert.ok(!contextPattern, "context tags must NOT form patterns");
  assert.ok(!objectPattern, "object links must NOT form patterns");
  console.log("PASS: detectPatterns (no context/object noise)");
})();

// --- detectPatterns: single item = no pattern ---

(function testDetectPatternsNoRepeat() {
  const items = core.parseDailyEvidenceBlocks(LEGACY_DAILY, "2026-07-13");
  const patterns = core.detectPatterns(items);
  assert.equal(patterns.length, 0, "single item should have no patterns");
  console.log("PASS: detectPatterns (no repeat)");
})();

// --- deduplication: near-duplicate changes merged ---

(function testDeduplication() {
  const items1 = core.parseDailyEvidenceBlocks(SAMPLE_DAILY, "2026-07-20");
  const items2 = core.parseDailyEvidenceBlocks(SAMPLE_DAILY_2, "2026-07-21");
  const items3 = core.parseDailyEvidenceBlocks(SAMPLE_DAILY_3, "2026-07-22");
  const all = items1.concat(items2).concat(items3);
  const period = core.parseISOWeek("2026-W30");
  const review = core.buildWeeklyReview(all, ["a.md", "b.md", "c.md"], period);
  const changeTexts = review.meaningful_changes.map(function (c) { return c.reason; });
  const sandalCount = changeTexts.filter(function (t) { return t.includes("샌들"); }).length;
  assert.ok(sandalCount <= 1, "near-duplicate sandal changes should be merged, got " + sandalCount);
  console.log("PASS: deduplication (near-duplicate merged)");
})();

// --- buildWeeklyReview v2 structure ---

(function testBuildWeeklyReviewV2() {
  const items1 = core.parseDailyEvidenceBlocks(SAMPLE_DAILY, "2026-07-20");
  const items2 = core.parseDailyEvidenceBlocks(SAMPLE_DAILY_2, "2026-07-21");
  const items3 = core.parseDailyEvidenceBlocks(SAMPLE_DAILY_3, "2026-07-22");
  const all = items1.concat(items2).concat(items3);
  const period = core.parseISOWeek("2026-W30");
  const review = core.buildWeeklyReview(all, ["a.md", "b.md", "c.md"], period);

  assert.equal(review.schema_version, "2.0");
  assert.equal(review.review_type, "learning");
  assert.ok(Array.isArray(review.key_learnings), "should have key_learnings array");
  assert.ok(review.findings.length >= 1, "should have cross-day patterns");
  assert.ok(review.meaningful_changes.length >= 1, "should have changes");
  assert.ok(typeof review.next_week_direction === "object", "next_week_direction should be object");
  assert.ok(Array.isArray(review.next_week_direction.continue_items), "should have continue_items");
  assert.ok(Array.isArray(review.next_week_direction.observe_items), "should have observe_items");
  assert.ok(Array.isArray(review.next_week_direction.increase_attention), "should have increase_attention");
  assert.ok(Array.isArray(review.next_week_direction.pending_items), "should have pending_items");
  console.log("PASS: buildWeeklyReview v2 structure");
})();

// --- buildWeeklyReview: insufficient data ---

(function testBuildWeeklyReviewInsufficient() {
  const items = core.parseDailyEvidenceBlocks(LEGACY_DAILY, "2026-07-13");
  const period = core.parseISOWeek("2026-W29");
  const review = core.buildWeeklyReview(items, ["a.md"], period);
  assert.ok(review.limitations.length >= 1, "should have limitations");
  assert.equal(review.suggested_principles.length, 0, "no patterns = no principles");
  assert.equal(review.key_learnings.length, 0, "no patterns = no key learnings");
  console.log("PASS: buildWeeklyReview (insufficient)");
})();

// --- buildWeeklyReview: 3-day pattern produces principle ---

(function testBuildWeeklyReviewPrinciple() {
  const items1 = core.parseDailyEvidenceBlocks(SAMPLE_DAILY, "2026-07-20");
  const items2 = core.parseDailyEvidenceBlocks(SAMPLE_DAILY_2, "2026-07-21");
  const items3 = core.parseDailyEvidenceBlocks(SAMPLE_DAILY_3, "2026-07-22");
  const all = items1.concat(items2).concat(items3);
  const period = core.parseISOWeek("2026-W30");
  const review = core.buildWeeklyReview(all, ["a.md", "b.md", "c.md"], period);
  assert.ok(review.suggested_principles.length >= 1, "3-day pattern should produce principle");
  assert.equal(review.suggested_principles[0].decision, "pending");
  assert.equal(review.suggested_principles[0].applied, false);
  assert.ok(review.key_learnings.length >= 1, "3-day pattern should produce key learning");
  console.log("PASS: buildWeeklyReview (3-day principle + learning)");
})();

// --- extractLinks ---

(function testExtractLinks() {
  const links = core.extractLinks("Hello [[최진웅]] and [[윤채연|채연]] world");
  assert.deepEqual(links, ["[[최진웅]]", "[[윤채연]]"]);
  console.log("PASS: extractLinks");
})();

// --- empty input ---

(function testEmptyInput() {
  const blocks = core.parseDailyEvidenceBlocks("", "2026-07-20");
  assert.equal(blocks.length, 0);
  const blocks2 = core.parseDailyEvidenceBlocks("---\n---\n# Empty\n", "2026-07-20");
  assert.equal(blocks2.length, 0);
  console.log("PASS: empty input handling");
})();

console.log("\nWeekly filter core v2 tests passed");
