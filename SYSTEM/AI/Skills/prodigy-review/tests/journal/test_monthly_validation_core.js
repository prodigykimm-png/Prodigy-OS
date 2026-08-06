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

  (function testParseWeeklyNoteRejectsUncompletedJournal() {
    var content = "---\njournal: weekly\njournal-start-date: 2026-07-14\njournal-end-date: 2026-07-20\njournal-section: week\ntype: journal\nstatus: draft\n---\n# 2026-W29\n\n## Suggested Principles\n\n- [ ] 아직 작성 중인 원칙\n  - 상태: pending\n  - Evidence: ev1\n";
    var note = core.parseWeeklyNote(content, "DAILY/WEEKLY/2026-W29.md");
    assert.equal(note, null, "Monthly must only collect completed Weekly reviews");
    console.log("PASS: parseWeeklyNote rejects uncompleted journal");
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

  (function testMonthlyQuestionOnlyModeDoesNotBlockUsableWeekly() {
    var notes = [
      { path: "a.md", week: "2026-W29", start: "2026-07-14", end: "2026-07-20", principles: [] },
      { path: "b.md", week: "2026-W30", start: "2026-07-21", end: "2026-07-27", principles: [{ title: "다른 원칙", evidence_refs: ["ev1"] }] },
      { path: "c.md", week: "2026-W31", start: "2026-07-28", end: "2026-08-03", principles: [{ title: "또 다른 원칙", evidence_refs: ["ev2"] }] }
    ];
    var model = core.buildValidationModel(notes, "2026-07");
    var mode = core.deriveMonthlyReviewMode({ weeklyNotes: notes, readiness: model.readiness });
    assert.equal(mode.mode, "question_only");
    assert.equal(mode.can_save_new, true);
    assert.equal(mode.can_validate_principles, false);
    console.log("PASS: Monthly question-only mode keeps sparse input usable");
  })();

  (function testMonthlyBlockedModeRequiresNoWeekly() {
    var mode = core.deriveMonthlyReviewMode({ weeklyNotes: [], readiness: core.checkReadiness([]) });
    assert.equal(mode.mode, "blocked");
    assert.equal(mode.can_save_new, false);
    console.log("PASS: Monthly blocked mode requires usable Weekly");
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

  (function testMonthlyPartialWriterAndClassifier() {
    var model = {
      month: "2026-07",
      readiness: { ready: false, weekly_count: 3, eligible_principles: 0, total_principles: 2, reason: "반복 Principle이 아직 없습니다." },
      principles: [{ title: "관찰 원칙", weeks: ["2026-W30"], evidence_refs: ["ev1"], eligible: false }],
      weekly_paths: ["a.md", "b.md", "c.md"]
    };
    var markdown = core.buildMonthlyNoteContent(model, { summary: "관찰 요약", next_direction: "다음 달 질문" });
    assert.match(markdown, /^status: draft$/m);
    var parsed = core.parseMonthlyNoteContent(markdown);
    assert.equal(core.classifyMonthlyRecord(parsed), "partial");
    assert.equal(parsed.summary, "관찰 요약");
    console.log("PASS: Monthly partial writer/parser classification");
  })();

  (function testBuildMonthlyNoteContentUsesActualMonthEnd() {
    var baseModel = {
      readiness: { ready: true, weekly_count: 2, eligible_principles: 1, total_principles: 1, reason: "" },
      principles: [],
      weekly_paths: []
    };
    assert.ok(core.buildMonthlyNoteContent(Object.assign({}, baseModel, { month: "2024-02" }), {}).indexOf("journal-end-date: 2024-02-29") !== -1);
    assert.ok(core.buildMonthlyNoteContent(Object.assign({}, baseModel, { month: "2026-04" }), {}).indexOf("journal-end-date: 2026-04-30") !== -1);
    assert.ok(core.buildMonthlyNoteContent(Object.assign({}, baseModel, { month: "2026-12" }), {}).indexOf("journal-end-date: 2026-12-31") !== -1);
    console.log("PASS: buildMonthlyNoteContent actual month end");
  })();

  (function testMonthlyWriterParserRoundTrip() {
    var model = {
      month: "2026-07",
      readiness: { ready: true, weekly_count: 4, eligible_principles: 4, total_principles: 4, reason: "" },
      principles: [
        { title: "검증된 원칙", weeks: ["2026-W27", "2026-W28"], evidence_refs: ["ev-1"], eligible: true },
        { title: "반려된 원칙", weeks: ["2026-W27", "2026-W29"], evidence_refs: ["ev-2"], eligible: true },
        { title: "보류된 원칙", weeks: ["2026-W28", "2026-W29"], evidence_refs: ["ev-3"], eligible: true },
        { title: "대기 원칙", weeks: ["2026-W30", "2026-W31"], evidence_refs: ["ev-4"], eligible: true }
      ],
      weekly_paths: ["DAILY/WEEKLY/2026-W27.md", "DAILY/WEEKLY/2026-W28.md"]
    };
    var markdown = core.buildMonthlyNoteContent(model, {
      summary: "월간 요약",
      p0: { action: "validated", knowledge_statement: "검증된 지식", validation_reason: "반복 근거" },
      p1: { action: "rejected", reason: "반례가 많음" },
      p2: { action: "deferred", reason: "추가 관찰 필요" },
      p3: { action: "pending" },
      next_direction: "다음 달 방향"
    });
    var parsed = core.parseMonthlyNoteContent(markdown);
    assert.equal(parsed.format, "canonical");
    assert.equal(parsed.summary, "월간 요약");
    assert.deepEqual(parsed.reviewed_weekly_paths, model.weekly_paths);
    assert.deepEqual(parsed.principles.map(function (p) { return p.decision; }), ["validated", "rejected", "deferred", "pending"]);
    assert.equal(parsed.principles[0].knowledge_statement, "검증된 지식");
    assert.equal(parsed.principles[0].reason, "반복 근거");
    assert.equal(parsed.principles[1].reason, "반례가 많음");
    assert.equal(parsed.principles[2].reason, "추가 관찰 필요");
    assert.equal(parsed.next_direction, "다음 달 방향");
    console.log("PASS: monthly writer/parser round trip");
  })();

  (function testMonthlyParserDoesNotGuessLegacyMarkdown() {
    var parsed = core.parseMonthlyNoteContent("# 2026-07 Monthly\n\n## Summary\n\n사람이 쓴 임의 기록");
    assert.equal(parsed.format, "legacy_or_unrecognized");
    assert.equal(parsed.summary, "");
    assert.deepEqual(parsed.principles, []);
    console.log("PASS: monthly parser rejects unrecognized markdown");
  })();

  (function testBuildMonthlyAIContextEligibleOnly() {
    var model = {
      month: "2026-07",
      readiness: { weekly_count: 3, eligible_principles: 1 },
      principles: [
        { title: "먼저 확인하기", weeks: ["2026-W27", "2026-W28"], evidence_refs: ["daily-2026-07-01-e01", "daily-2026-06-30-e01"], eligible: true },
        { title: "한 주 원칙", weeks: ["2026-W29"], evidence_refs: ["daily-2026-07-02-e01"], eligible: false }
      ]
    };
    var context = core.buildMonthlyAIContext(model, [
      { evidence_id: "daily-2026-07-01-e01", date: "2026-07-01", context: "업무", experience: "경험", interpretation: "해석", change: "변화", next_experiment: "실험" }
    ], { excluded_ref_counts: [{ principle_ref: "monthly-2026-07-p001", excluded_ref_count: 1 }] });
    assert.equal(context.schema_version, "1.0");
    assert.deepEqual(context.principles.map(function (p) { return p.principle_ref; }), ["monthly-2026-07-p001"]);
    assert.deepEqual(context.principles[0].supporting_evidence_refs, ["daily-2026-07-01-e01"]);
    assert.equal(context.evidence.length, 1);
    assert.equal(context.coverage_warnings[0].excluded_ref_count, 1);
    console.log("PASS: monthly AI context eligible-only projection");
  })();

  console.log("\nMonthly validation core tests passed");
})();
