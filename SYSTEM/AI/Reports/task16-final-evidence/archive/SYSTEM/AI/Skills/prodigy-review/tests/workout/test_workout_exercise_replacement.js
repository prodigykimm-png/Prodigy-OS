"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "../../../../../..");
const core = require(path.join(ROOT, "SYSTEM/Views/workout-core.js"));
const importer = require(path.join(ROOT, "SYSTEM/Views/workout-import.js"));
const objects = require(path.join(ROOT, "SYSTEM/Views/workout-program-objects.js"));

class FakeElement {
  constructor(tag = "div", options = {}) {
    this.tag = tag;
    this.children = [];
    this.attributes = {};
    this.style = {};
    this.text = options.text || "";
    this.value = "";
    Object.entries(options.attr || {}).forEach(([key, value]) => this.setAttribute(key, value));
  }
  addClass(value) { this.attributes.class = [this.attributes.class, value].filter(Boolean).join(" "); }
  createEl(tag, options = {}) { const child = new FakeElement(tag, options); child.parent = this; this.children.push(child); return child; }
  createDiv(options = {}) { return this.createEl("div", options); }
  empty() { this.children = []; this.text = ""; }
  setAttribute(key, value) { this.attributes[key] = String(value); if (key === "value") this.value = String(value); }
  findAll(predicate) {
    return [this, ...this.children.flatMap((child) => child.findAll(predicate))].filter(predicate);
  }
  find(predicate) { return this.findAll(predicate)[0]; }
}

global.document = { createElement: (tag) => new FakeElement(tag) };
const modals = require(path.join(ROOT, "SYSTEM/Views/workout-modals.js"));

function program() {
  const normalized = core.normalizeProgram({
    id: "base-one",
    title: "Base One",
    source: "fixture.xlsx",
    days: [
      { id: "w1d1", week: 1, day: 1, label: "Week 1 Day 1", exercises: [
        { id: "squat", name: "Squat", notes: "Keep stance", prescribed_sets: [{ id: "squat-set-1", reps: "5", rpe: "7", load: "100", target: "strength", rest: "90" }] },
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
  normalized.source_hash = "sha256:fixture-workbook";
  return normalized;
}

function fakeExerciseApp() {
  const exercises = [
    { name: "Hack Squat", target: "legs", category: "machine", aliases: ["핵 스쿼트"] },
    { name: "Front Squat", target: "legs", category: "barbell", aliases: ["프론트 스쿼트"] },
    { name: "Dumbbell Bench Press", target: "chest", category: "dumbbell", aliases: ["덤벨 벤치"] },
    { name: "Seated Row", target: "back", category: "machine", aliases: ["시티드 로우"] },
  ];
  const files = exercises.map((exercise) => ({
    basename: exercise.name,
    path: `PARA/RESOURCES/Workout/Exercises/${exercise.name}.md`,
  }));
  return {
    vault: { getMarkdownFiles: () => files },
    metadataCache: {
      getFileCache(file) {
        const exercise = exercises.find((item) => item.name === file.basename);
        return { frontmatter: exercise };
      },
    },
  };
}

function prescriptionContract(prog) {
  return {
    source_hash: prog.source_hash,
    days: prog.days.map((day) => ({
      id: day.id,
      week: day.week,
      day: day.day,
      label: day.label,
      order: day.order,
      exercises: day.exercises.map((exercise, exerciseOrder) => ({
        exercise_order: exerciseOrder,
        id: exercise.id,
        notes: exercise.notes,
        prescribed_sets: exercise.prescribed_sets,
        superset_group: exercise.superset_group,
        superset_label: exercise.superset_label,
      })),
    })),
  };
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
  const before = prescriptionContract(prog);
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
  assert.deepEqual(prescriptionContract(result.program), before);
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

function testUserOperableFilterReviewFlow() {
  // Given: an imported program with an unmatched source and a fake Exercise library.
  const source = program();
  const original = structuredClone(source);
  const app = fakeExerciseApp();
  const searchCatalog = (query, limit, options) => objects.searchExercises(app, query, limit, options);

  // When: the user opens candidates, filters by partial name and target, then chooses one.
  const review = importer.createExerciseReplacementReview(source, searchCatalog);
  const candidates = review.candidates("Squat", "", {});
  const narrowed = review.candidates("Squat", "front", { target: "legs" });
  const wrongTarget = review.candidates("Squat", "press", { target: "back", include_untargeted: false });
  review.select("Squat", narrowed[0]);

  // Then: the selected canonical exercise and preserved import details are previewed.
  assert.deepEqual(candidates.map((item) => item.name), ["Dumbbell Bench Press", "Front Squat", "Hack Squat", "Seated Row"]);
  assert.deepEqual(narrowed.map((item) => item.name), ["Front Squat"]);
  assert.deepEqual(wrongTarget, []);
  let preview = review.preview();
  assert.equal(preview.length, 1);
  assert.equal(preview[0].source_name, "Squat");
  assert.equal(preview[0].replacement.name, "Front Squat");
  assert.deepEqual(preview[0].affected_days.map((day) => day.id), ["w1d1", "w1d2", "w2d1"]);
  assert.equal(preview[0].prescriptions[0].exercise_id, "squat");
  assert.equal(preview[0].prescriptions[0].exercise_order, 0);
  assert.equal(preview[0].prescriptions[0].notes, "Keep stance");
  assert.equal(preview[0].prescriptions[0].prescribed_sets[0].rest, "90");

  // When: the user changes the selection before applying.
  review.select("Squat", candidates.find((item) => item.name === "Hack Squat"));
  preview = review.preview();
  const applied = review.apply();

  // Then: both preview and output use the changed choice; source input remains byte-for-byte equivalent.
  assert.equal(preview[0].replacement.name, "Hack Squat");
  assert.equal(applied.program.days[0].exercises[0].name, "Hack Squat");
  assert.deepEqual(prescriptionContract(applied.program), prescriptionContract(source));
  assert.deepEqual(source, original);

}

function testImportModalFilterIsVisibleAndInteractive() {
  // Given: the actual import modal rendered headlessly against a fake Exercise vault.
  const app = fakeExerciseApp();
  const source = program();
  const modal = new modals.ImportProgramModal(app, async () => {});
  modal.result = { candidates: [{
    title: source.title,
    sheet_name: "Program",
    weeks: source.weeks,
    days: source.days.length,
    exercise_count: source.days.reduce((sum, day) => sum + day.exercises.length, 0),
    unknown_rows: [],
    outline: source.days.map((day) => ({ label: day.label, exercises: day.exercises.map((exercise) => exercise.name) })),
    program: source,
  }] };
  const root = new FakeElement();
  modal.renderPreview(root);

  // When: the user types into Squat's visible search control.
  let filter = root.find((element) => element.attributes["aria-label"] === "Squat 대체 운동 필터");
  assert.ok(filter, "the import flow exposes a visible search input for each source exercise");
  assert.equal(filter.tag, "input");
  assert.equal(filter.attributes.type, "search");
  const target = root.find((element) => element.attributes["aria-label"] === "Squat 부위 필터");
  assert.ok(target, "the existing target filter axis is exposed");
  filter.value = "front";
  filter.oninput();

  // Then: only the matching canonical candidate remains and selecting it updates the preview.
  let choices = filter.parent.findAll((element) => element.tag === "button" && ["Front Squat", "Hack Squat", "Seated Row", "Dumbbell Bench Press"].includes(element.text));
  assert.deepEqual(choices.map((choice) => choice.text), ["Front Squat"]);
  choices[0].onclick();
  assert.ok(root.find((element) => element.text === "Squat → Front Squat"));
  assert.ok(root.find((element) => element.text.startsWith("영향 Day:")));
  assert.ok(root.find((element) => element.text.startsWith("보존되는 세트·횟수·RPE·휴식:")));

  // When: the user changes the filter and choice before saving.
  filter = root.find((element) => element.attributes["aria-label"] === "Squat 대체 운동 필터");
  filter.value = "hack";
  filter.oninput();
  choices = filter.parent.findAll((element) => element.tag === "button" && element.text === "Hack Squat");
  assert.equal(choices.length, 1);
  choices[0].onclick();

  // Then: the new choice replaces the old preview, while no writer was available or invoked.
  assert.ok(root.find((element) => element.text === "Squat → Hack Squat"));
  assert.equal(root.findAll((element) => element.text === "Squat → Front Squat").length, 0);
}

function main() {
  testUniqueSourceExercises();
  testApplyReplacements();
  testPreservesPrescription();
  testOriginalNotMutated();
  testEmptyMapping();
  testValidationAfterReplacement();
  testUserOperableFilterReviewFlow();
  testImportModalFilterIsVisibleAndInteractive();
  console.log("Workout Exercise Replacement tests passed");
}

main();
