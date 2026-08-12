"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "../../../../../..");
const core = require(path.join(ROOT, "SYSTEM/Views/workout-core.js"));
const storeApi = require(path.join(ROOT, "SYSTEM/Views/workout-store.js"));
const importer = require(path.join(ROOT, "SYSTEM/Views/workout-import.js"));
const objects = require(path.join(ROOT, "SYSTEM/Views/workout-program-objects.js"));

function program() {
  return core.normalizeProgram({
    id: "base-one",
    title: "Base One",
    creator: "Coach",
    source: "fixture.xlsx",
    goal: "근비대",
    difficulty: "중급",
    days: [
      { id: "w1d1", week: 1, day: 1, label: "Week 1 Day 1", exercises: [{ id: "squat", name: "Squat", prescribed_sets: [{ reps: "5", rpe: "7" }] }] },
      { id: "w1d2", week: 1, day: 2, label: "Week 1 Day 2", exercises: [{ id: "bench", name: "Bench Press", prescribed_sets: [{ reps: "8", rpe: "7" }] }] },
      { id: "w2d1", week: 2, day: 1, label: "Week 2 Day 1", exercises: [{ id: "squat", name: "Squat", prescribed_sets: [{ reps: "6", rpe: "8" }] }] },
    ],
  });
}

function completedSession(runId, dayId, sessionId, completedAt) {
  return { session_id: sessionId, program_run_id: runId, program_day_id: dayId, status: "completed", completed_at: completedAt, exercise_results: [] };
}

function testProgramAndRunDomain() {
  const source = program();
  assert.equal(source.weeks, 2);
  assert.equal(source.days.length, 3);
  assert.equal(source.days[0].label, "Week 1 Day 1");

  const first = core.createProgramRun(source, [], { run_id: "run-1", started_at: "2026-07-17T09:00:00Z" });
  assert.equal(first.status, "active");
  assert.equal(first.suggested_day, "w1d1");
  assert.ok(first.program_snapshot);
  assert.equal(first.program_snapshot.days.length, 3);
  assert.ok(first.program_version);
  assert.throws(() => core.createProgramRun(source, [first], { run_id: "run-2" }), /active Program Run/);

  const paused = core.transitionProgramRun(first, "paused", "2026-07-18T09:00:00Z");
  const second = core.createProgramRun(source, [paused], { run_id: "run-2", started_at: "2026-07-18T10:00:00Z" });
  assert.equal(second.run_number, 2);
  assert.equal(first.status, "active", "transitions must not mutate history");

  // Version safety: library edit does not rewrite run snapshot
  const edited = core.clone(source);
  edited.days[0].exercises[0].name = "Front Squat";
  const frozen = core.programForRun(edited, first);
  assert.equal(frozen.days[0].exercises[0].name, "Squat");
}

function testValidateDuplicateAndPr() {
  const source = program();
  assert.equal(core.validateProgram(source).ok, true);
  const empty = core.validateProgram({ title: "X", days: [] });
  assert.equal(empty.ok, false);
  assert.ok(empty.errors.some((e) => /Day|day|세션|없습니다/i.test(e) || e.includes("Day")));

  const dupDays = core.clone(source);
  dupDays.days.push({ id: "dup", week: 1, day: 1, exercises: [{ name: "Row", prescribed_sets: [{ reps: "5" }] }] });
  assert.equal(core.validateProgram(dupDays).ok, false);

  const missingName = core.clone(source);
  missingName.days[0].exercises[0].name = "";
  assert.equal(core.validateProgram(missingName).ok, false);

  const copy = core.duplicateProgram(source, { title: "Base One (복사)" });
  assert.equal(copy.title, "Base One (복사)");
  assert.notEqual(copy.id, source.id);

  assert.equal(core.estimate1RM(100, 5), 116.7);
  assert.equal(core.estimate1RM("", 5), null);

  const sessions = [{
    session_id: "s1", status: "completed", date: "2026-07-16", completed_at: "2026-07-16T10:00:00Z",
    exercise_results: [{ exercise_id: "squat", name: "Squat", set_results: [
      { weight: "100", reps: "5", rpe: "7", completed: true },
      { weight: "110", reps: "3", rpe: "8", completed: true },
    ] }],
  }];
  const best = core.bestExerciseResult(sessions, "Squat");
  assert.equal(best.weight, "110");
  const hist = core.exerciseHistory(sessions, "Squat", 5);
  assert.ok(hist.length >= 2);
  assert.ok(core.previousExerciseResultByName(sessions, "Squat"));
}

function testSuggestionAndManualDayRules() {
  const source = program();
  const run = core.createProgramRun(source, [], { run_id: "run-1" });
  const sessions = [completedSession(run.run_id, "w1d1", "s1", "2026-07-17T10:00:00Z"), completedSession(run.run_id, "w2d1", "s2", "2026-07-18T10:00:00Z")];
  assert.equal(core.suggestNextDay(source, sessions, run.run_id), "w1d2");
  assert.match(core.daySelectionWarning(source, sessions, run.run_id, "w2d1"), /1주차 2일차/);
  assert.equal(core.daySelectionWarning(source, sessions, run.run_id, "w1d2"), "");

  const repeated = core.createWorkoutSession(source, run, "w1d1", { session_id: "repeat", date: "2026-07-20" });
  assert.equal(repeated.program_day_id, "w1d1");
  assert.notEqual(repeated.session_id, sessions[0].session_id);
}

function testSessionDraftAndCompletion() {
  const source = program();
  const run = core.createProgramRun(source, [], { run_id: "run-1" });
  const session = core.createWorkoutSession(source, run, "w1d1", { session_id: "session-1", date: "2026-07-17" });
  const updated = core.updateSetResult(session, "squat", 0, { completed: true, weight: "100", reps: "5", rpe: "7", notes: "안정적" });
  assert.equal(updated.exercise_results[0].set_results[0].weight, "100");
  assert.equal(session.exercise_results[0].set_results[0].weight, "", "draft updates must be immutable");

  const result = core.completeWorkoutSession(updated, source, run, [], "2026-07-17T11:00:00Z");
  assert.equal(result.session.status, "completed");
  assert.equal(result.run.suggested_day, "w1d2");

  const lastTwo = [
    result.session,
    completedSession(run.run_id, "w1d2", "session-2", "2026-07-18T11:00:00Z"),
  ];
  const last = core.createWorkoutSession(source, run, "w2d1", { session_id: "session-3" });
  const final = core.completeWorkoutSession(last, source, run, lastTwo, "2026-07-19T11:00:00Z");
  assert.equal(final.run.status, "completed");
  assert.equal(final.run.suggested_day, "");
}

function testQuickWorkoutAndPreviousResult() {
  const quick = core.createQuickWorkout({ session_id: "quick-1", title: "Running", date: "2026-07-17", distance: "5 km", duration: "28:31" });
  assert.equal(quick.program_run_id, null);
  assert.equal(quick.program_id, null);
  assert.equal(quick.program_day_id, null);
  assert.equal(quick.session_kind, "quick");
  assert.equal(quick.quick, true);

  const previous = {
    session_id: "s1", program_run_id: "run-1", status: "completed", completed_at: "2026-07-16T10:00:00Z",
    exercise_results: [{ exercise_id: "squat", name: "Squat", set_results: [{ weight: "100", reps: "5", rpe: "7", completed: true }] }],
  };
  assert.deepEqual(core.previousExerciseResult([previous], "run-1", "squat", "current"), { weight: "100", reps: "5", rpe: "7" });
  assert.equal(core.previousExerciseResult([previous], "other-run", "squat", "current"), null);
}

function testSessionKindCompatibilityAndWriters() {
  const cases = [
    { name: "valid explicit kind wins", input: { session_kind: "free", quick: true, program_run_id: "run-explicit", exercise_results: [] }, expected: "free" },
    { name: "valid explicit programmed wins", input: { session_kind: "programmed", quick: true }, expected: "programmed" },
    { name: "valid explicit quick wins", input: { session_kind: "quick", exercise_results: [{ exercise_id: "row" }] }, expected: "quick" },
    { name: "legacy quick flag wins over relation", input: { quick: true, program_run_id: "run-quick" }, expected: "quick" },
    { name: "legacy run relation", input: { program_run_id: "run-legacy" }, expected: "programmed" },
    { name: "legacy program relation", input: { program_id: "base-one" }, expected: "programmed" },
    { name: "legacy day relation", input: { program_day_id: "w1d1" }, expected: "programmed" },
    { name: "legacy structured results", input: { exercise_results: [{ exercise_id: "squat", set_results: [] }] }, expected: "free" },
    { name: "invalid explicit kind follows precedence", input: { session_kind: "other", quick: false, program_id: "base-one", exercise_results: [{ exercise_id: "squat" }] }, expected: "programmed" },
    { name: "invalid explicit kind reaches free", input: { session_kind: "other", exercise_results: [{ exercise_id: "squat" }] }, expected: "free" },
    { name: "safest legacy fallback", input: {}, expected: "quick" },
  ];

  for (const fixture of cases) {
    const before = JSON.stringify(fixture.input);
    assert.equal(core.normalizeSessionKind(fixture.input), fixture.expected, fixture.name);
    assert.equal(JSON.stringify(fixture.input), before, `${fixture.name} must not mutate its source`);
  }

  const source = program();
  const run = core.createProgramRun(source, [], { run_id: "run-kind" });
  const programmed = core.createWorkoutSession(source, run, "w1d1", { session_id: "programmed-kind" });
  assert.equal(programmed.session_kind, "programmed");
  assert.equal(programmed.quick, false);
  assert.equal(programmed.program_run_id, run.run_id);
  assert.equal(programmed.program_id, source.id);
  assert.equal(programmed.program_day_id, "w1d1");

  const exerciseResults = [{ exercise_id: "row", name: "Row", set_results: [{ completed: false, weight: "", reps: "", rpe: "", notes: "" }] }];
  const free = core.createFreeWorkout({ session_id: "free-kind", title: "자유운동", exercise_results: exerciseResults });
  assert.equal(free.session_kind, "free");
  assert.equal(free.quick, false);
  assert.equal(free.program_run_id, null);
  assert.equal(free.program_id, null);
  assert.equal(free.program_day_id, null);
  assert.deepEqual(free.exercise_results, exerciseResults);
  free.exercise_results[0].name = "Changed in writer output";
  assert.equal(exerciseResults[0].name, "Row", "free writer must not mutate or alias source results");
}

function testProgressDraftStaleContinueAndCopy() {
  const source = program();
  const run = core.createProgramRun(source, [], { run_id: "run-1", started_at: "2026-07-01T09:00:00Z" });
  const done = completedSession(run.run_id, "w1d1", "s1", "2026-07-02T10:00:00Z");
  const progress = core.runProgress(source, [done], run.run_id);
  assert.equal(progress.completed, 1);
  assert.equal(progress.total, 3);
  assert.equal(progress.next_day_id, "w1d2");
  assert.match(progress.label, /1\/3/);
  assert.match(progress.next_label, /1주차 2일차|Week 1 Day 2|2일차/);

  const draft = core.createWorkoutSession(source, run, "w1d2", { session_id: "draft-1", date: "2026-07-17" });
  const drafts = core.listDraftSessions([draft, done]);
  assert.equal(drafts.length, 1);
  assert.equal(drafts[0].session_id, "draft-1");

  const prev = { weight: "100", reps: "5", rpe: "7" };
  const filled = core.applyPreviousToExercise(draft, "bench", prev);
  assert.equal(filled.exercise_results[0].set_results[0].weight, "100");
  assert.equal(filled.exercise_results[0].set_results[0].completed, false);
  assert.equal(draft.exercise_results[0].set_results[0].weight, "", "copy must be immutable");

  const stale = core.listStaleRuns(
    [run],
    [done],
    { stale_days: 7, now: new Date("2026-07-17T12:00:00Z") }
  );
  assert.ok(stale.some((item) => item.run_id === "run-1"));
  assert.ok(stale[0].age_days >= 7);

  const model = core.buildWorkspaceModel({
    activeRun: run,
    activeProgram: source,
    sessions: [done, draft],
    runs: [run],
    draft
  });
  assert.equal(model.continue_target.empty, false);
  assert.equal(model.continue_target.kind, "resume_draft");
  assert.equal(model.progress.next_day_id, "w1d2");
  assert.ok(model.timeline);

  const modelStart = core.buildWorkspaceModel({
    activeRun: run,
    activeProgram: source,
    sessions: [done],
    runs: [run],
    draft: null
  });
  assert.equal(modelStart.continue_target.kind, "start_day");
  assert.match(modelStart.continue_target.action, /시작/);
}

function testAddRemoveSet() {
  const source = program();
  const run = core.createProgramRun(source, [], { run_id: "run-sets" });
  const session = core.createWorkoutSession(source, run, "w1d1", { session_id: "session-sets" });
  assert.equal(session.exercise_results[0].set_results.length, 1);

  const withWeight = core.updateSetResult(session, "squat", 0, { weight: "100", reps: "5" });
  const added = core.addSetResult(withWeight, "squat", { copy_last: true });
  assert.equal(added.exercise_results[0].set_results.length, 2);
  assert.equal(added.exercise_results[0].set_results[1].weight, "100");
  assert.equal(added.exercise_results[0].set_results[1].reps, "5");
  assert.equal(added.exercise_results[0].set_results[1].completed, false);
  assert.equal(withWeight.exercise_results[0].set_results.length, 1, "add must be immutable");

  const removed = core.removeSetResult(added, "squat", 0);
  assert.equal(removed.exercise_results[0].set_results.length, 1);
  assert.equal(removed.exercise_results[0].set_results[0].weight, "100");

  const empty = core.removeSetResult(removed, "squat", 0);
  assert.equal(empty.exercise_results[0].set_results.length, 0);
  assert.equal(empty.exercise_results[0].completed, false);

  const again = core.addSetResult(empty, "squat", { copy_last: true });
  assert.equal(again.exercise_results[0].set_results.length, 1);
}

async function testDerivedStore() {
  const root = await fs.promises.mkdtemp(path.join(os.tmpdir(), "workout-store-"));
  const adapter = storeApi.createNodeAdapter(root);
  const store = storeApi.createWorkoutStore(adapter, "SYSTEM/AI/Memory/workout");
  const source = program();
  const run = core.createProgramRun(source, [], { run_id: "run-1" });
  const session = core.createWorkoutSession(source, run, "w1d1", { session_id: "session-1" });
  await store.saveProgram(source);
  await store.saveRun(run);
  await store.saveSession(session);
  await store.saveSession(core.updateSetResult(session, "squat", 0, { weight: "90" }));
  assert.equal((await store.listPrograms()).length, 1);
  assert.equal((await store.listRuns()).length, 1);
  assert.equal((await store.readSession("session-1")).exercise_results[0].set_results[0].weight, "90");
  await assert.rejects(() => store.deleteDerived("sessions", "../source.md"), /identifier/);
  assert.equal(fs.existsSync(path.join(root, "source.md")), false);
}

function testImportPreview() {
  const rows = [
    { B: "W1D1", C: "Smith Machine Squat", D: "1", E: "3~6", F: "@7" },
    { D: "1", E: "8~12", F: "@7" },
    { C: "Notes" },
    { B: "W1D2", C: "Bench Press", D: "3", E: "8", F: "@8" },
  ];
  const preview = importer.previewProgramRows(rows, { title: "Base One", sheet_name: "프로그램" });
  assert.equal(preview.title, "Base One");
  assert.equal(preview.weeks, 1);
  assert.equal(preview.days, 2);
  assert.equal(preview.exercise_count, 2);
  assert.equal(preview.program.days[0].exercises[0].prescribed_sets.length, 2);
  assert.equal(preview.unknown_rows.length, 0);
  assert.throws(() => importer.previewProgramRows([{ A: "not a program" }], { title: "Broken" }), /Program Day/);
  assert.rejects(() => importer.inspectWorkbook(new Uint8Array([1, 2, 3]).buffer, "broken.xlsx"), /workbook/i);
}

function testProgramObjects() {
  const source = program();
  const note = objects.renderProgramNote(source, "2026-07-17");
  assert.match(note, /type: workout_program/);
  assert.match(note, /\[\[PARA\/RESOURCES\/Workout\/Exercises\/Squat\|Squat\]\]/);
  assert.match(note, /# 코칭 노트/);
  const parsed = objects.parseProgramSection(note, { id: source.id, title: source.title });
  assert.equal(parsed.days[0].exercises[0].name, "Squat");
  assert.equal(parsed.days[0].exercises[0].prescribed_sets[0].rpe, "7");
  const personalized = note.replace("# 코칭 노트\n\n- ", "# 코칭 노트\n\n- 무릎 궤적 확인");
  const edited = core.clone(source);
  edited.days[0].exercises[0].prescribed_sets[0].reps = "8";
  const replaced = objects.replaceProgramSection(personalized, edited);
  assert.match(replaced, /무릎 궤적 확인/);
  assert.equal(objects.parseProgramSection(replaced, { id: source.id, title: source.title }).days[0].exercises[0].prescribed_sets[0].reps, "8");
  const exercise = objects.renderExerciseNote("핵 스쿼트", "2026-07-17");
  for (const heading of ["# 설명", "# 주요 근육", "# 보조 근육", "# 테크닉", "# 흔한 실수", "# 대체 운동", "# 참고 영상", "# 팁", "# 메모", "# 개인 기록", "# 관련 운동"]) {
    assert.match(exercise, new RegExp(heading));
  }
  assert.match(exercise, /primary_muscles|equipment|aliases/);
}

async function testProgramObjectSourceOfTruth() {
  const source = program();
  const note = objects.renderProgramNote(source, "2026-07-17");
  const file = { path: `${objects.PROGRAM_FOLDER}/Base One.md`, basename: "Base One" };
  const app = {
    vault: { getMarkdownFiles: () => [file], read: async () => note },
    metadataCache: { getFileCache: () => ({ frontmatter: { type: "workout_program", id: source.id, title: source.title, goal: "근비대" } }) },
  };
  const loaded = await objects.loadProgramObjects(app);
  assert.equal(loaded.length, 1);
  assert.equal(loaded[0].source_path, file.path);
  assert.equal(loaded[0].days[1].exercises[0].name, "Bench Press");
}

function testDashboardAndRegressionContracts() {
  const dashboard = fs.readFileSync(path.join(ROOT, "HUB/30 Workout.md"), "utf8");
  assert.match(dashboard, /WorkoutView\.renderDashboard/);
  // Hub load order: workout-modals.js must load before workout-view.js
  assert.ok(dashboard.indexOf("workout-modals.js") < dashboard.indexOf("workout-view.js"), "Hub must load workout-modals.js before workout-view.js");
  // Labels live in the view (single render path), not as static hub headings
  const view = fs.readFileSync(path.join(ROOT, "SYSTEM/Views/workout-view.js"), "utf8");
  const sessionUi = fs.readFileSync(path.join(ROOT, "SYSTEM/Views/workout-session-ui.js"), "utf8");
  const viewSurface = `${view}\n${sessionUi}`;
  for (const label of [
    "빠른 운동", "프로그램 가져오기", "운동 완료", "편집", "복제", "내보내기",
    "현재 프로그램", "프로그램 라이브러리", "운동 기록", "Exercise Object",
    "이어서 기록", "오늘 운동 시작", "미완료 세션", "오래 방치", "전부 이전과 동일",
    "세트 추가", "workout-set-remove", "운동 추가", "새 프로그램"
  ]) {
    assert.ok(viewSurface.includes(label), label);
  }
  assert.match(viewSurface, /addSetResult|removeSetResult/);
  assert.match(view, /AddExerciseToProgramModal|CreateProgramModal|appendExerciseToProgram/);
  assert.match(view, /renderTargetFilter|부위 필터|target/);
  const objectsSrc = fs.readFileSync(path.join(ROOT, "SYSTEM/Views/workout-program-objects.js"), "utf8");
  assert.match(objectsSrc, /EXERCISE_TARGETS|normalizeTarget|target: legs|searchExercises/);
  const objects = require(path.join(ROOT, "SYSTEM/Views/workout-program-objects.js"));
  assert.equal(objects.normalizeTarget("하체"), "legs");
  assert.equal(objects.normalizeTarget("chest"), "chest");
  assert.equal(objects.targetLabel("back"), "등");
  assert.equal(objects.cleanCue("  a\nb  "), "a b");
  const noteWithCue = objects.renderExerciseNote("Cue Test", "2026-07-17", { target: "legs", cue: "힙 힌지" });
  assert.match(noteWithCue, /target: "legs"/);
  assert.match(noteWithCue, /cue: "힙 힌지"/);
  const exerciseTemplate = fs.readFileSync(path.join(ROOT, "SYSTEM/TEMPLATE/FORMAT/template_exercise.md"), "utf8");
  assert.match(exerciseTemplate, /^target:/m);
  assert.match(exerciseTemplate, /^cue:/m);
  assert.match(viewSurface, /workout-exercise-cue|recordStripText|setExerciseCue|getExerciseMeta/);
  // Modal extraction: paintExerciseNoteBody/stripNoteFrontmatter now live in workout-modals.js
  const modals = fs.readFileSync(path.join(ROOT, "SYSTEM/Views/workout-modals.js"), "utf8");
  assert.match(modals, /paintExerciseNoteBody|노트 본문|stripNoteFrontmatter/);
  assert.match(viewSurface, /openExercisePopup|openExerciseNoteSide|workout-exercise-note-link/);
  assert.equal(view.includes("app.vault.modify(file"), false, "source Workout Markdown must stay read-only via objects layer");
  assert.match(view, /programForRun|program_snapshot|validateProgram|duplicateProgramObject/);
  assert.match(view, /renderContinueStrip|buildWorkspaceModel|__workoutWorkspaceModel/);
  const coreSrc = fs.readFileSync(path.join(ROOT, "SYSTEM/Views/workout-core.js"), "utf8");
  assert.match(coreSrc, /runProgress|listDraftSessions|listStaleRuns|applyPreviousToExercise/);


  // Modal module exports: all extracted classes must be present
  const modalsModule = require(path.join(ROOT, "SYSTEM/Views/workout-modals.js"));
  for (const cls of [
    "RunConflictModal", "QuickWorkoutModal", "ProgramHistoryModal",
    "RenameProgramModal", "CreateExerciseModal", "ExerciseDetailModal",
    "AddExerciseToProgramModal", "CreateProgramModal",
    "ProgramEditorModal", "ImportProgramModal",
  ]) {
    assert.ok(modalsModule[cls], `WorkoutModals must export ${cls}`);
  }
  // View must consume modals via root.WorkoutModals, not contain class bodies
  assert.match(view, /root\.WorkoutModals/);
  assert.equal(view.includes("class RunConflictModal"), false, "modal classes must not be redefined in workout-view.js");
  assert.equal(view.includes("class ImportProgramModal"), false, "modal classes must not be redefined in workout-view.js");
  const readingTemplate = fs.readFileSync(path.join(ROOT, "SYSTEM/TEMPLATE/FORMAT/template_reading.md"), "utf8");
  for (const obsolete of ["current_page", "total_pages", "total_page"]) assert.equal(readingTemplate.includes(obsolete), false);
  const schema = fs.readFileSync(path.join(ROOT, "SYSTEM/Prodigy/Schema/Core_Property_Schema.md"), "utf8");
  assert.ok(schema.includes("workout"));

  const guide = fs.readFileSync(path.join(ROOT, "SYSTEM/docs/11_Operating_Guide.md"), "utf8");
  assert.match(guide, /프로그램 라이브러리|프로그램 편집기|Exercise Object/);
  assert.match(guide, /스냅샷|버전 안전/);
  assert.match(guide, /입력 최소화|오래 방치|이어서 기록/);
}

async function main() {
  testProgramAndRunDomain();
  testValidateDuplicateAndPr();
  testSuggestionAndManualDayRules();
  testSessionDraftAndCompletion();
  testQuickWorkoutAndPreviousResult();
  testSessionKindCompatibilityAndWriters();
  testProgressDraftStaleContinueAndCopy();
  testAddRemoveSet();
  await testDerivedStore();
  testImportPreview();
  testProgramObjects();
  await testProgramObjectSourceOfTruth();
  testDashboardAndRegressionContracts();
  console.log("Workout Program Runner tests passed");
}

main().catch((error) => { console.error(error.stack || error.message); process.exitCode = 1; });
