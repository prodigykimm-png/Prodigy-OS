"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "../../../../../..");
const core = require(path.join(ROOT, "SYSTEM/Views/workout-core.js"));
const storeApi = require(path.join(ROOT, "SYSTEM/Views/workout-store.js"));
const importer = require(path.join(ROOT, "SYSTEM/Views/workout-import.js"));

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
  assert.throws(() => core.createProgramRun(source, [first], { run_id: "run-2" }), /active Program Run/);

  const paused = core.transitionProgramRun(first, "paused", "2026-07-18T09:00:00Z");
  const second = core.createProgramRun(source, [paused], { run_id: "run-2", started_at: "2026-07-18T10:00:00Z" });
  assert.equal(second.run_number, 2);
  assert.equal(first.status, "active", "transitions must not mutate history");
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
  assert.equal(quick.quick, true);

  const previous = {
    session_id: "s1", program_run_id: "run-1", status: "completed", completed_at: "2026-07-16T10:00:00Z",
    exercise_results: [{ exercise_id: "squat", name: "Squat", set_results: [{ weight: "100", reps: "5", rpe: "7", completed: true }] }],
  };
  assert.deepEqual(core.previousExerciseResult([previous], "run-1", "squat", "current"), { weight: "100", reps: "5", rpe: "7" });
  assert.equal(core.previousExerciseResult([previous], "other-run", "squat", "current"), null);
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

function testDashboardAndRegressionContracts() {
  const dashboard = fs.readFileSync(path.join(ROOT, "HUB/30 Workout.md"), "utf8");
  for (const label of ["현재 프로그램", "프로그램 라이브러리", "운동 기록"]) assert.ok(dashboard.includes(label));
  const view = fs.readFileSync(path.join(ROOT, "SYSTEM/Views/workout-view.js"), "utf8");
  for (const label of ["빠른 운동", "프로그램 가져오기", "운동 완료"]) assert.ok(view.includes(label));
  assert.equal(view.includes("app.vault.modify(file"), false, "source Workout Markdown must stay read-only");

  const readingTemplate = fs.readFileSync(path.join(ROOT, "SYSTEM/TEMPLATE/FORMAT/template_reading.md"), "utf8");
  for (const obsolete of ["current_page", "total_pages", "total_page"]) assert.equal(readingTemplate.includes(obsolete), false);
  const schema = fs.readFileSync(path.join(ROOT, "SYSTEM/Prodigy/Schema/Core_Property_Schema.md"), "utf8");
  assert.ok(schema.includes("workout"));
}

async function main() {
  testProgramAndRunDomain();
  testSuggestionAndManualDayRules();
  testSessionDraftAndCompletion();
  testQuickWorkoutAndPreviousResult();
  await testDerivedStore();
  testImportPreview();
  testDashboardAndRegressionContracts();
  console.log("Workout Program Runner tests passed");
}

main().catch((error) => { console.error(error.stack || error.message); process.exitCode = 1; });
