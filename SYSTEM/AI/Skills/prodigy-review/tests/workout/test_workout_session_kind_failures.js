"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "../../../../../..");
const core = require(path.join(ROOT, "SYSTEM/Views/workout-core.js"));

function hash(value) {
  return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function program() {
  return core.normalizeProgram({
    id: "kind-program",
    title: "Kind Program",
    days: [{ id: "w1d1", week: 1, day: 1, exercises: [{ id: "squat", name: "Squat", prescribed_sets: [{ reps: "5" }] }] }],
  });
}

function testFreeAndQuickCompletionPreserveRunBytes() {
  const source = program();
  const run = core.createProgramRun(source, [], { run_id: "run-byte-proof", started_at: "2026-07-30T09:00:00Z" });
  const before = hash(run);
  const free = core.createFreeWorkout({
    session_id: "free-complete",
    title: "자유운동",
    exercise_results: [{ exercise_id: "row", name: "Row", set_results: [{ completed: true, weight: "60", reps: "8", rpe: "7", notes: "" }] }],
  });
  const freeResult = core.completeWorkoutSession(free, source, run, [], "2026-07-30T10:00:00Z");
  assert.equal(freeResult.session.status, "completed");
  assert.equal(hash(freeResult.run), before);
  assert.equal(hash(run), before);

  const quick = core.createQuickWorkout({ session_id: "quick-complete", title: "걷기" });
  const quickResult = core.completeWorkoutSession(quick, source, run, [], "2026-07-30T11:00:00Z");
  assert.equal(quickResult.session.status, "completed");
  assert.equal(hash(quickResult.run), before);
  assert.equal(hash(run), before);
  console.log(`RUN-HASH-BEFORE ${before}`);
  console.log(`RUN-HASH-AFTER-FREE ${hash(freeResult.run)}`);
  console.log(`RUN-HASH-AFTER-QUICK ${hash(quickResult.run)}`);
}

function testMalformedFreeCompletionIsRejectedWithoutMutation() {
  const source = program();
  const run = core.createProgramRun(source, [], { run_id: "run-malformed", started_at: "2026-07-30T09:00:00Z" });
  const malformed = {
    schema_version: "prodigy-workout-session-v1",
    session_id: "free-malformed",
    session_kind: "free",
    quick: false,
    program_run_id: null,
    program_id: null,
    program_day_id: null,
    status: "draft",
    exercise_results: [],
  };
  const sessionBefore = hash(malformed);
  const runBefore = hash(run);

  assert.throws(
    () => core.completeWorkoutSession(malformed, source, run, [], "2026-07-30T12:00:00Z"),
    /자유운동/
  );
  assert.equal(hash(malformed), sessionBefore);
  assert.equal(hash(run), runBefore);

  const invalid = { ...malformed, session_id: "free-invalid", exercise_results: [null] };
  const invalidBefore = hash(invalid);
  assert.throws(
    () => core.completeWorkoutSession(invalid, source, run, [], "2026-07-30T12:00:00Z"),
    /자유운동/
  );
  assert.equal(hash(invalid), invalidBefore);
  assert.equal(hash(run), runBefore);
}

function main() {
  testFreeAndQuickCompletionPreserveRunBytes();
  testMalformedFreeCompletionIsRejectedWithoutMutation();
  console.log("Workout session-kind failure tests passed");
}

main();
