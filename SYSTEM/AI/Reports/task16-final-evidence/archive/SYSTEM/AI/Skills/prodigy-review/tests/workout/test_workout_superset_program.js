"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "../../../../../..");
const core = require(path.join(ROOT, "SYSTEM/Views/workout-core.js"));
const objects = require(path.join(ROOT, "SYSTEM/Views/workout-program-objects.js"));

function fixtureProgram() {
  return core.normalizeProgram({
    id: "ss-test",
    title: "Superset Test",
    source: "manual",
    days: [
      {
        id: "w1d1", week: 1, day: 1,
        exercises: [
          { id: "ex1", name: "Bench Press", prescribed_sets: [{ reps: "8", rpe: "7" }] },
          { id: "ex2", name: "Barbell Row", prescribed_sets: [{ reps: "8", rpe: "7" }] },
          { id: "ex3", name: "Overhead Press", prescribed_sets: [{ reps: "10", rpe: "7" }] },
          { id: "ex4", name: "Pull-Up", prescribed_sets: [{ reps: "6", rpe: "8" }] },
        ],
      },
    ],
  });
}

test("markSuperset groups consecutive exercises", () => {
  const program = fixtureProgram();
  const result = objects.markSuperset(program, "w1d1", [0, 1], "Push/Pull");
  const day = result.days[0];
  assert.ok(day.exercises[0].superset_group);
  assert.equal(day.exercises[0].superset_group, day.exercises[1].superset_group);
  assert.equal(day.exercises[0].superset_label, "Push/Pull");
  // Non-grouped exercises untouched
  assert.equal(day.exercises[2].superset_group, undefined);
  assert.equal(day.exercises[3].superset_group, undefined);
});

test("markSuperset is pure (does not mutate original)", () => {
  const program = fixtureProgram();
  objects.markSuperset(program, "w1d1", [0, 1]);
  assert.equal(program.days[0].exercises[0].superset_group, undefined);
});

test("markSuperset rejects fewer than 2 exercises", () => {
  const program = fixtureProgram();
  assert.throws(() => objects.markSuperset(program, "w1d1", [0]), /최소 2개/);
});

test("markSuperset rejects non-consecutive indices", () => {
  const program = fixtureProgram();
  assert.throws(() => objects.markSuperset(program, "w1d1", [0, 2]), /연속/);
});

test("markSuperset rejects unknown day", () => {
  const program = fixtureProgram();
  assert.throws(() => objects.markSuperset(program, "nope", [0, 1]), /Day/);
});

test("removeSuperset clears grouping", () => {
  const program = fixtureProgram();
  const grouped = objects.markSuperset(program, "w1d1", [0, 1]);
  const cleared = objects.removeSuperset(grouped, "w1d1", [0, 1]);
  assert.equal(cleared.days[0].exercises[0].superset_group, undefined);
  assert.equal(cleared.days[0].exercises[1].superset_group, undefined);
});

test("getSupersetGroups returns grouped exercises", () => {
  const program = fixtureProgram();
  const grouped = objects.markSuperset(program, "w1d1", [2, 3], "Shoulders/Back");
  const groups = objects.getSupersetGroups(grouped, "w1d1");
  assert.equal(groups.length, 1);
  assert.equal(groups[0].label, "Shoulders/Back");
  assert.equal(groups[0].exercises.length, 2);
  assert.equal(groups[0].exercises[0].name, "Overhead Press");
  assert.equal(groups[0].exercises[1].name, "Pull-Up");
});

test("replaceExerciseInDay preserves sets and position", () => {
  const program = fixtureProgram();
  const result = objects.replaceExerciseInDay(program, "w1d1", 0, { name: "Dumbbell Bench Press", target: "chest" });
  const ex = result.days[0].exercises[0];
  assert.equal(ex.name, "Dumbbell Bench Press");
  assert.equal(ex.target, "chest");
  assert.equal(ex.prescribed_sets[0].reps, "8");
  // Position preserved — still index 0, other exercises unchanged
  assert.equal(result.days[0].exercises[1].name, "Barbell Row");
});

test("replaceExerciseInDay is pure", () => {
  const program = fixtureProgram();
  objects.replaceExerciseInDay(program, "w1d1", 0, { name: "X" });
  assert.equal(program.days[0].exercises[0].name, "Bench Press");
});

test("replaceExerciseInDay rejects bad index", () => {
  const program = fixtureProgram();
  assert.throws(() => objects.replaceExerciseInDay(program, "w1d1", 99, { name: "X" }), /인덱스/);
  assert.throws(() => objects.replaceExerciseInDay(program, "w1d1", 0, { name: "" }), /이름/);
});

test("reorderExercises reorders by index array", () => {
  const program = fixtureProgram();
  const result = objects.reorderExercises(program, "w1d1", [3, 2, 1, 0]);
  assert.equal(result.days[0].exercises[0].name, "Pull-Up");
  assert.equal(result.days[0].exercises[1].name, "Overhead Press");
  assert.equal(result.days[0].exercises[2].name, "Barbell Row");
  assert.equal(result.days[0].exercises[3].name, "Bench Press");
});

test("reorderExercises rejects wrong length / duplicates", () => {
  const program = fixtureProgram();
  assert.throws(() => objects.reorderExercises(program, "w1d1", [0, 1]), /길이/);
  assert.throws(() => objects.reorderExercises(program, "w1d1", [0, 0, 1, 2]), /올바르지/);
});

test("superset survives normalize round trip (validation ok)", () => {
  const program = fixtureProgram();
  const grouped = objects.markSuperset(program, "w1d1", [0, 1]);
  const validation = core.validateProgram(grouped);
  assert.equal(validation.ok, true);
});
