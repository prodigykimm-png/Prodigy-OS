"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "../../../../../..");
const core = require(path.join(ROOT, "SYSTEM/Views/knowledge-use-body-core.js"));

const DATE = "2026-07-23";

function auctionNote() {
  return [
    "---",
    "type: auction_case",
    "status: bidding",
    "my_bid_price: 123000000",
    "---",
    "",
    "# 요약",
    "",
    "- 기존 요약 본문",
    "",
    "# 판단 기록",
    "",
    "### 판단 변경 기록",
    "",
    "- 날짜: 2026-07-22",
    "",
    "# 복기",
    "",
    "- 기존 복기 본문",
    ""
  ].join("\n");
}

function frontmatterSlice(content) {
  return content.slice(0, content.indexOf("---", 3) + 3);
}

function testRecordsIntoExistingAuctionSectionAndPreservesFrontmatter() {
  // Given: an auction note with exactly one target section and unrelated body.
  const before = auctionNote();

  // When: the user records two verified Knowledge links with a one-line basis.
  const result = core.recordKnowledgeUse(before, "auction_case", "PARA/PROJECTS/Auction/x.md", {
    date: DATE, context: "출구가 우선이라 입찰가를 낮춘다.", links: ["[[ZETA/PERMANENT/출구가 우선 판단]]", "[[ZETA/PERMANENT/관리비 체납 반영 원칙]]"]
  });

  // Then: a single block is appended inside the section, frontmatter is byte-identical, and unrelated body survives.
  assert.equal(result.status, "recorded");
  assert.match(result.content, /<!-- PRODIGY:KNOWLEDGE_USE:[a-z0-9]+ -->/);
  assert.match(result.content, /### 2026-07-23 · 판단 근거/);
  assert.match(result.content, /- 판단: 출구가 우선이라 입찰가를 낮춘다\./);
  assert.match(result.content, /- 사용한 Knowledge:\n  - \[\[ZETA\/PERMANENT\/출구가 우선 판단\]\]\n  - \[\[ZETA\/PERMANENT\/관리비 체납 반영 원칙\]\]/);
  assert.equal(frontmatterSlice(result.content), frontmatterSlice(before));
  assert.match(result.content, /# 복기[\s\S]*- 기존 복기 본문/);
  const sectionStart = result.content.indexOf("# 판단 기록");
  const reviewStart = result.content.indexOf("# 복기");
  assert.ok(result.content.indexOf("PRODIGY:KNOWLEDGE_USE") > sectionStart && result.content.indexOf("PRODIGY:KNOWLEDGE_USE") < reviewStart, "block stays inside the target section");
}

function testExactRepeatIsIdempotentButDifferentContextRecordsAgain() {
  // Given: a recorded note.
  const input = { date: DATE, context: "출구가 우선", links: ["[[ZETA/PERMANENT/a]]"] };
  const first = core.recordKnowledgeUse(auctionNote(), "auction_case", "p.md", input);

  // When: the identical submission repeats.
  const repeat = core.recordKnowledgeUse(first.content, "auction_case", "p.md", input);

  // Then: it is a no-op with already_recorded and unchanged content.
  assert.equal(repeat.status, "already_recorded");
  assert.equal(repeat.content, first.content);

  // But a different basis for the same link produces a second block.
  const other = core.recordKnowledgeUse(first.content, "auction_case", "p.md", { date: DATE, context: "다른 판단 맥락", links: ["[[ZETA/PERMANENT/a]]"] });
  assert.equal(other.status, "recorded");
  assert.equal((other.content.match(/PRODIGY:KNOWLEDGE_USE/g) || []).length, 2);
}

function testMissingOrDuplicateSectionFailsWithoutMutation() {
  // Given: notes with zero or two target headings.
  const noSection = "---\ntype: auction_case\n---\n# 요약\n- 본문\n";
  const dupSection = auctionNote() + "\n# 판단 기록\n- 또 다른\n";

  // When/Then: both reject and the input string is not returned as a mutated value.
  const input = { date: DATE, context: "맥락", links: ["[[ZETA/PERMANENT/a]]"] };
  assert.throws(() => core.recordKnowledgeUse(noSection, "auction_case", "p.md", input), /대상 섹션/);
  assert.throws(() => core.recordKnowledgeUse(dupSection, "auction_case", "p.md", input), /대상 섹션/);
}

function testInvalidInputsRejectBeforeAnyChange() {
  const note = auctionNote();
  const good = { date: DATE, context: "맥락", links: ["[[ZETA/PERMANENT/a]]"] };
  assert.throws(() => core.recordKnowledgeUse(note, "auction_case", "p.md", { ...good, links: [] }), /선택/);
  assert.throws(() => core.recordKnowledgeUse(note, "auction_case", "p.md", { ...good, context: "   " }), /맥락/);
  assert.throws(() => core.recordKnowledgeUse(note, "auction_case", "p.md", { ...good, date: "not-a-date" }), /날짜/);
  assert.throws(() => core.recordKnowledgeUse(note, "auction_case", "p.md", { ...good, links: ["https://example.com/a"] }), /내부 경로/);
  assert.throws(() => core.recordKnowledgeUse(note, "auction_case", "p.md", { ...good, links: ["[[ZETA/PERMANENT/a|별칭]]"] }), /형식/);
  assert.throws(() => core.recordKnowledgeUse(note, "auction_case", "p.md", { ...good, links: ["[[../escape]]"] }), /안전/);
  assert.throws(() => core.recordKnowledgeUse(note, "unknown_type", "p.md", good), /Object 유형/);
}

function testReadingAndWorkoutTargetsResolve() {
  // Given: reading and workout notes with their single target sections.
  const reading = "---\ntype: reading\n---\n# 책\n## Review\n- 기존 리뷰\n## Action Items\n- 행동\n";
  const workout = "---\ntype: workout_program\n---\n# 프로그램\n# 리뷰\n- 기존 리뷰\n# 메모\n- 메모\n";
  const input = { date: DATE, context: "맥락", links: ["[[ZETA/PERMANENT/a]]"] };

  // When/Then: each records into its own section without leaking into the next one.
  const r = core.recordKnowledgeUse(reading, "reading", "r.md", input);
  assert.equal(r.status, "recorded");
  assert.ok(r.content.indexOf("PRODIGY:KNOWLEDGE_USE") > r.content.indexOf("## Review") && r.content.indexOf("PRODIGY:KNOWLEDGE_USE") < r.content.indexOf("## Action Items"));
  const w = core.recordKnowledgeUse(workout, "workout_program", "w.md", input);
  assert.equal(w.status, "recorded");
  assert.ok(w.content.indexOf("PRODIGY:KNOWLEDGE_USE") > w.content.indexOf("# 리뷰") && w.content.indexOf("PRODIGY:KNOWLEDGE_USE") < w.content.indexOf("# 메모"));
}

function main() {
  testRecordsIntoExistingAuctionSectionAndPreservesFrontmatter();
  testExactRepeatIsIdempotentButDifferentContextRecordsAgain();
  testMissingOrDuplicateSectionFailsWithoutMutation();
  testInvalidInputsRejectBeforeAnyChange();
  testReadingAndWorkoutTargetsResolve();
  console.log("Knowledge use body core tests passed");
}

main();
