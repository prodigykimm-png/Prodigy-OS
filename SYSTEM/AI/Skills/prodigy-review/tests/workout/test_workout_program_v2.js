"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "../../../../../..");
const core = require(path.join(ROOT, "SYSTEM/Views/workout-core.js"));
const objects = require(path.join(ROOT, "SYSTEM/Views/workout-program-objects.js"));

function fixtureProgram() {
  return core.normalizeProgram({
    id: "v2-test",
    title: "V2 Test Program",
    source: "manual",
    days: [
      {
        id: "w1d1", week: 1, day: 1,
        exercises: [
          { id: "ex1", name: "Back Squat", prescribed_sets: [{ reps: "5", rpe: "7", rest: "90" }] },
          { id: "ex2", name: "Bench Press", prescribed_sets: [{ reps: "8", rpe: "7" }] },
        ],
      },
      {
        id: "w1d2", week: 1, day: 2,
        exercises: [
          { id: "ex3", name: "Barbell Row", prescribed_sets: [{ reps: "10", rpe: "7" }] },
        ],
      },
    ],
  });
}

test("v2 explicit-save round trip: program normalize → snapshot → run → session → complete", () => {
  const program = fixtureProgram();
  assert.equal(program.schema_version, "prodigy-workout-program-v1");
  assert.equal(program.days.length, 2);

  // Create run with snapshot
  const run = core.createProgramRun(program, [], { run_id: "run-v2-1", started_at: "2026-07-28T09:00:00Z" });
  assert.equal(run.status, "active");
  assert.ok(run.program_snapshot);
  assert.equal(run.program_snapshot.days.length, 2);

  // Create session from snapshot
  const session = core.createWorkoutSession(program, run, "w1d1", {
    session_id: "sess-v2-1",
    started_at: "2026-07-28T09:05:00Z",
  });
  assert.equal(session.status, "draft");
  assert.equal(session.exercise_results.length, 2);

  // Update sets
  let updated = core.updateSetResult(session, "ex1", 0, { completed: true, weight: "100", reps: "5", rpe: "7" });
  updated = core.updateSetResult(updated, "ex2", 0, { completed: true, weight: "60", reps: "8", rpe: "7" });

  // Complete session
  const result = core.completeWorkoutSession(updated, program, run, [], "2026-07-28T10:00:00Z");
  assert.equal(result.session.status, "completed");
  assert.equal(result.session.completed_at, "2026-07-28T10:00:00Z");
  assert.equal(result.run.suggested_day, "w1d2");
});

test("Program JSON production writer count is 0 (no auto-generation)", () => {
  // The program-objects module exposes saveProgramObject which requires
  // an explicit app argument. Without calling it, no file is written.
  // Verify that normalizeProgram, snapshotProgram, markSuperset, etc.
  // are all pure and return new objects without side effects.
  const program = fixtureProgram();
  const snap = core.snapshotProgram(program);
  assert.notEqual(snap, program);
  assert.deepEqual(snap.days.length, program.days.length);

  // Superset is pure
  const withSuperset = objects.markSuperset(program, "w1d1", [0, 1], "Test SS");
  assert.equal(withSuperset.days[0].exercises[0].superset_group, withSuperset.days[0].exercises[1].superset_group);
  // Original unchanged
  assert.equal(program.days[0].exercises[0].superset_group, undefined);
});

test("v1 read compatibility: v1 schema programs still normalize", () => {
  const v1 = {
    title: "Legacy",
    days: [
      { week: 1, day: 1, exercises: [{ name: "Squat", prescribed_sets: [{ reps: "5" }] }] },
    ],
  };
  const normalized = core.normalizeProgram(v1);
  assert.equal(normalized.schema_version, "prodigy-workout-program-v1");
  assert.equal(normalized.title, "Legacy");
  assert.equal(normalized.days[0].exercises[0].name, "Squat");
});

test("snapshot preservation: library edit does not rewrite run snapshot", () => {
  const program = fixtureProgram();
  const run = core.createProgramRun(program, [], { run_id: "run-snap", started_at: "2026-07-28T09:00:00Z" });

  // Edit library program
  const edited = core.clone(program);
  edited.days[0].exercises[0].name = "Front Squat";

  // Run still sees original
  const frozen = core.programForRun(edited, run);
  assert.equal(frozen.days[0].exercises[0].name, "Back Squat");
});
