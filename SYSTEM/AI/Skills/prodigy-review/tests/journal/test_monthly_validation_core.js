(function () {
  "use strict";
  var assert = require("assert");
  var path = require("path");
  var ROOT = path.resolve(__dirname, "../../../../../..");
  var core = require(path.join(ROOT, "SYSTEM/Views/monthly-validation-core.js"));

  // --- parseFrontmatter ---
  (function testParseFrontmatter() {
    var fm = core.parseFrontmatter("---\njournal: weekly\nstatus: completed\n---\nbody");
    assert.equal(fm.journal, "weekly");
    assert.equal(fm.status, "completed");
    console.log("PASS: parseFrontmatter");
  })();

  // --- parseSuggestedPrinciples ---
  (function testParseSuggestedPrinciples() {
    var body = "## Suggested Principles\n\n- [ ] 침착한 사전 확인이 촬영 품질을 높인다.\n  - 상태: pending\n  - Evidence: daily-2026-07-20-e01, daily-2026-07-21-e02\n\n- [x] 결심한 일을 미루지 않는다.\n  - 상태: pending\n  - Evidence: daily-2026-07-21-e01\n\n## Next Week Direction\n";
    var principles = core.parseSuggestedPrinciples(body);
    assert.equal(principles.length, 2);
    assert.equal(principles[0].title, "침착한 사전 확인이 촬영 품질을 높인다.");
    assert.equal(principles[0].status, "pending");
    assert.deepEqual(principles[0].evidence_refs, ["daily-2026-07-20-e01", "daily-2026-07-21-e02"]);
    assert.equal(principles[1].status, "pending"); // 상태 line overrides checkbox
    console.log("PASS: parseSuggestedPrinciples");
  })();

  // --- parseWeeklyNote ---
  (function testParseWeeklyNote() {
    var content = "---\njournal: weekly\njournal-start-date: 2026-07-14\njournal-end-date: 2026-07-20\njournal-section: week\ntype: journal\nstatus: completed\n---\n# 2026-W29\n\n## Suggested Principles\n\n- [ ] 침착한 사전 확인\n  - 상태: pending\n  - Evidence: daily-2026-07-15-e01\n";
    var note = core.parseWeeklyNote(content, "DAILY/WEEKLY/2026-W29.md");
    assert.ok(note);
    assert.equal(note.week, "2026-W29");
    assert.equal(note.start, "2026-07-14");
    assert.equal(note.principles.length, 1);
    console.log("PASS: parseWeeklyNote");
  })();

  (function testParseWeeklyNoteLegacy() {
    var content = "---\njournal: weekly\njournal-start-date: 2026-07-14\njournal-end-date: 2026-07-20\njournal-section: week\n---\n# 2026-W29\n\n## Suggested Principles\n\n- [ ] 원칙 A\n  - 상태: pending\n  - Evidence: ev1\n";
    var note = core.parseWeeklyNote(content, "DAILY/WEEKLY/2026-W29.md");
    assert.ok(note, "legacy weekly without type: journal should still parse");
    console.log("PASS: parseWeeklyNote legacy");
  })();

  (function testParseWeeklyNoteRejectNonWeekly() {
    var content = "---\njournal: personal daily\n---\n# 2026-07-20\n";
    var note = core.parseWeeklyNote(content, "DAILY/DAILY/2026-07-20.md");
    assert.equal(note, null);
    console.log("PASS: parseWeeklyNote rejects non-weekly");
  })();

  // --- collectPrinciples ---
  (function testCollectPrinciples() {
    var notes = [
      { path: "a.md", week: "2026-W29", start: "2026-07-14", end: "2026-07-20", principles: [
        { title: "침착한 사전 확인", status: "pending", evidence_refs: ["ev1"] }
      ]},
      { path: "b.md", week: "2026-W30", start: "2026-07-21", end: "2026-07-27", principles: [
        { title: "침착한 사전 확인", status: "pending", evidence_refs: ["ev2"] }
      ]}
    ];
    var principles = core.collectPrinciples(notes);
    assert.equal(principles.length, 1);
    assert.equal(principles[0].week_count, 2);
    assert.equal(principles[0].eligible, true);
    assert.deepEqual(principles[0].evidence_refs, ["ev1", "ev2"]);
    console.log("PASS: collectPrinciples cross-week merge");
  })();

  (function testCollectPrinciplesSingleWeek() {
    var notes = [
      { path: "a.md", week: "2026-W29", start: "2026-07-14", end: "2026-07-20", principles: [
        { title: "단일 원칙", status: "pending", evidence_refs: ["ev1"] }
      ]}
    ];
    var principles = core.collectPrinciples(notes);
    assert.equal(principles.length, 1);
    assert.equal(principles[0].eligible, false);
    console.log("PASS: collectPrinciples single week not eligible");
  })();

  // --- checkReadiness ---
  (function testCheckReadinessNotReady() {
    var notes = [
      { path: "a.md", week: "2026-W29", start: "2026-07-14", end: "2026-07-20", principles: [] }
    ];
    var r = core.checkReadiness(notes);
    assert.equal(r.ready, false);
    assert.ok(r.reason.indexOf("최소 2개") !== -1);
    console.log("PASS: checkReadiness not ready (1 weekly)");
  })();

  (function testCheckReadinessReady() {
    var notes = [
      { path: "a.md", week: "2026-W29", start: "2026-07-14", end: "2026-07-20", principles: [
        { title: "원칙 A", status: "pending", evidence_refs: ["ev1"] }
      ]},
      { path: "b.md", week: "2026-W30", start: "2026-07-21", end: "2026-07-27", principles: [
        { title: "원칙 A", status: "pending", evidence_refs: ["ev2"] }
      ]}
    ];
    var r = core.checkReadiness(notes);
    assert.equal(r.ready, true);
    assert.equal(r.eligible_principles, 1);
    console.log("PASS: checkReadiness ready");
  })();

  // --- buildMonthlyNoteContent ---
  (function testBuildMonthlyNoteContent() {
    var model = {
      month: "2026-07",
      readiness: { ready: true, weekly_count: 2, eligible_principles: 1, total_principles: 1, reason: "" },
      principles: [{ title: "침착한 사전 확인", week_count: 2, weeks: ["2026-W29", "2026-W30"], evidence_refs: ["ev1", "ev2"], eligible: true }],
      weekly_paths: ["DAILY/WEEKLY/2026-W29.md", "DAILY/WEEKLY/2026-W30.md"]
    };
    var decisions = {
      summary: "7월 검증 요약",
      p0: { action: "validated", knowledge_statement: "촬영 전 침착한 확인이 품질을 높인다.", validation_reason: "2주 반복 확인" },
      next_direction: "침착한 확인 유지"
    };
    var content = core.buildMonthlyNoteContent(model, decisions);
    assert.ok(content.indexOf("type: journal") !== -1);
    assert.ok(content.indexOf("status: completed") !== -1);
    assert.ok(content.indexOf("침착한 사전 확인") !== -1);
    assert.ok(content.indexOf("validated") !== -1);
    assert.ok(content.indexOf("촬영 전 침착한 확인이 품질을 높인다.") !== -1);
    assert.ok(content.indexOf("2026-W29") !== -1);
    console.log("PASS: buildMonthlyNoteContent");
  })();

  (function testBuildMonthlyNoteContentRejected() {
    var model = {
      month: "2026-07",
      readiness: { ready: true, weekly_count: 2, eligible_principles: 1, total_principles: 1, reason: "" },
      principles: [{ title: "약한 원칙", week_count: 2, weeks: ["2026-W29", "2026-W30"], evidence_refs: ["ev1"], eligible: true }],
      weekly_paths: ["a.md", "b.md"]
    };
    var decisions = { p0: { action: "rejected", reason: "근거 불충분" } };
    var content = core.buildMonthlyNoteContent(model, decisions);
    assert.ok(content.indexOf("rejected") !== -1);
    assert.ok(content.indexOf("근거 불충분") !== -1);
    console.log("PASS: buildMonthlyNoteContent rejected");
  })();

  console.log("\nMonthly validation core tests passed");
})();
