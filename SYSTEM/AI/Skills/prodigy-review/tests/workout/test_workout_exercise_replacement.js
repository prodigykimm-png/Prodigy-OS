"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "../../../../../..");
const core = require(path.join(ROOT, "SYSTEM/Views/workout-core.js"));
const importer = require(path.join(ROOT, "SYSTEM/Views/workout-import.js"));

function program() {
  return core.normalizeProgram({
    id: "base-one",
    title: "Base One",
    source: "fixture.xlsx",
    days: [
      { id: "w1d1", week: 1, day: 1, label: "Week 1 Day 1", exercises: [
        { id: "squat", name: "Squat", prescribed_sets: [{ reps: "5", rpe: "7", rest: "90" }] },
        { id: "bench", name: "Bench Press", prescribed_sets: [{ reps: "8", rpe: "7" }] },
      ]},
      { id: "w1d2", week: 1, day: 2, label: "Week 1 Day 2", exercises: [
        { id: "squat2", name: "Squat", prescribed_sets: [{ reps: "6", rpe: "8" }] },
        { id: "row", name: "Barbell Row", prescribed_sets: [{ reps: "10", rpe: "7" }] },
      ]},
      { id: "w2d1", week: 2, day: 1, label: "Week 2 Day 1", exercises: [
        { id: "squat3", name: "Squat", prescribed_sets: [{ reps: "3", rpe: "9" }] },
        { id: "ohp", name: "Overhead Press", prescribed_sets: [{ reps: "8", rpe: "7" }] },
      ]},
    ],
  });
}

function testUniqueSourceExercises() {
  const prog = program();
  const unique = importer.uniqueSourceExercises(prog);
  // Squat appears 3 times, Bench Press 1, Barbell Row 1, Overhead Press 1
  assert.equal(unique.length, 4);
  const squat = unique.find((e) => e.name === "Squat");
  assert.ok(squat);
  assert.equal(squat.occurrences, 3);
  const bench = unique.find((e) => e.name === "Bench Press");
  assert.equal(bench.occurrences, 1);
  // Sorted by name
  assert.equal(unique[0].name, "Barbell Row");
}

function testApplyReplacements() {
  const prog = program();
  const mapping = {
    "Squat": { name: "Hack Squat", target: "legs" },
    "Bench Press": { name: "Dumbbell Bench Press", target: "chest" },
  };
  const result = importer.applyExerciseReplacements(prog, mapping);
  assert.equal(result.replaced_count, 4); // 3 squats + 1 bench

  // All squats replaced
  result.program.days.forEach((day) => {
    day.exercises.forEach((ex) => {
      if (ex.id.startsWith("squat")) {
        assert.equal(ex.name, "Hack Squat");
        assert.equal(ex.target, "legs");
      }
    });
  });

  // Bench replaced
  const bench = result.program.days[0].exercises.find((e) => e.id === "bench");
  assert.equal(bench.name, "Dumbbell Bench Press");
  assert.equal(bench.target, "chest");

  // Row and OHP untouched
  const row = result.program.days[1].exercises.find((e) => e.id === "row");
  assert.equal(row.name, "Barbell Row");
  const ohp = result.program.days[2].exercises.find((e) => e.id === "ohp");
  assert.equal(ohp.name, "Overhead Press");
}

function testPreservesPrescription() {
  const prog = program();
  const mapping = { "Squat": { name: "Leg Press", target: "legs" } };
  const result = importer.applyExerciseReplacements(prog, mapping);

  // Sets/reps/RPE/rest preserved
  const w1d1Squat = result.program.days[0].exercises[0];
  assert.equal(w1d1Squat.name, "Leg Press");
  assert.equal(w1d1Squat.prescribed_sets[0].reps, "5");
  assert.equal(w1d1Squat.prescribed_sets[0].rpe, "7");
  assert.equal(w1d1Squat.prescribed_sets[0].rest, "90");

  const w2d1Squat = result.program.days[2].exercises[0];
  assert.equal(w2d1Squat.prescribed_sets[0].reps, "3");
  assert.equal(w2d1Squat.prescribed_sets[0].rpe, "9");
}

function testOriginalNotMutated() {
  const prog = program();
  const mapping = { "Squat": { name: "Front Squat", target: "legs" } };
  importer.applyExerciseReplacements(prog, mapping);
  // Original must be unchanged
  assert.equal(prog.days[0].exercises[0].name, "Squat");
  assert.equal(prog.days[2].exercises[0].name, "Squat");
}

function testEmptyMapping() {
  const prog = program();
  const result = importer.applyExerciseReplacements(prog, {});
  assert.equal(result.replaced_count, 0);
  assert.equal(result.program.days[0].exercises[0].name, "Squat");
}

function testValidationAfterReplacement() {
  const prog = program();
  const mapping = { "Squat": { name: "Hack Squat", target: "legs" } };
  const result = importer.applyExerciseReplacements(prog, mapping);
  const validation = core.validateProgram(result.program);
  assert.equal(validation.ok, true);
}

function main() {
  testUniqueSourceExercises();
  testApplyReplacements();
  testPreservesPrescription();
  testOriginalNotMutated();
  testEmptyMapping();
  testValidationAfterReplacement();
  console.log("Workout Exercise Replacement tests passed");
}

main();
