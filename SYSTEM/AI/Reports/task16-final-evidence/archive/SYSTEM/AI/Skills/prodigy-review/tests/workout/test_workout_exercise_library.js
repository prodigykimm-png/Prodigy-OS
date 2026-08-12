"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "../../../../../..");
const lib = require(path.join(ROOT, "SYSTEM/Views/workout-exercise-library.js"));

test("createLibrary returns sorted frozen catalog with seed entries", () => {
  const catalog = lib.createLibrary();
  assert.ok(catalog.length >= 30);
  assert.ok(Object.isFrozen(catalog));
  // Sorted by name
  for (let i = 1; i < catalog.length; i++) {
    assert.ok(catalog[i - 1].name.localeCompare(catalog[i].name, "ko") <= 0);
  }
});

test("search by name substring (case-insensitive)", () => {
  const catalog = lib.createLibrary();
  const results = lib.searchCatalog(catalog, "squat");
  assert.ok(results.length >= 3);
  assert.ok(results.every((r) => r.name.toLowerCase().includes("squat") || r.aliases.some((a) => a.toLowerCase().includes("squat"))));
});

test("search by Korean alias", () => {
  const catalog = lib.createLibrary();
  const results = lib.searchCatalog(catalog, "스쿼트");
  assert.ok(results.length >= 1);
  assert.ok(results.some((r) => r.name === "Back Squat"));
});

test("filter by muscle group", () => {
  const catalog = lib.createLibrary();
  const results = lib.searchCatalog(catalog, "", { muscle: "pectorals" });
  assert.ok(results.length >= 3);
  assert.ok(results.every((r) => r.muscles.includes("pectorals")));
});

test("filter by equipment", () => {
  const catalog = lib.createLibrary();
  const results = lib.searchCatalog(catalog, "", { equipment: "cable" });
  assert.ok(results.length >= 3);
  assert.ok(results.every((r) => r.equipment === "cable"));
});

test("combined search + filter", () => {
  const catalog = lib.createLibrary();
  const results = lib.searchCatalog(catalog, "row", { equipment: "cable" });
  assert.ok(results.length >= 1);
  assert.ok(results.every((r) => r.equipment === "cable"));
});

test("classifyExercise returns muscles and equipment", () => {
  const catalog = lib.createLibrary();
  const result = lib.classifyExercise(catalog, "Back Squat");
  assert.equal(result.found, true);
  assert.ok(result.muscles.includes("quadriceps"));
  assert.ok(result.muscles.includes("glutes"));
  assert.equal(result.equipment, "barbell");
});

test("classifyExercise by alias", () => {
  const catalog = lib.createLibrary();
  const result = lib.classifyExercise(catalog, "벤치프레스");
  assert.equal(result.found, true);
  assert.ok(result.muscles.includes("pectorals"));
});

test("classifyExercise unknown returns found:false", () => {
  const catalog = lib.createLibrary();
  const result = lib.classifyExercise(catalog, "Nonexistent Exercise");
  assert.equal(result.found, false);
  assert.deepEqual(result.muscles, []);
});

test("muscleDistribution counts across exercises", () => {
  const catalog = lib.createLibrary();
  const dist = lib.muscleDistribution(catalog, ["Back Squat", "Bench Press", "Barbell Row"]);
  assert.ok(dist.length >= 3);
  // Sorted by count desc
  for (let i = 1; i < dist.length; i++) {
    assert.ok(dist[i - 1].count >= dist[i].count);
  }
});

test("equipmentDistribution counts across exercises", () => {
  const catalog = lib.createLibrary();
  const dist = lib.equipmentDistribution(catalog, ["Back Squat", "Bench Press", "Dumbbell Curl"]);
  assert.ok(dist.some((d) => d.id === "barbell" && d.count === 2));
  assert.ok(dist.some((d) => d.id === "dumbbell" && d.count === 1));
});

test("custom entries override seed by name", () => {
  const catalog = lib.createLibrary([{ name: "Back Squat", muscles: ["quadriceps"], equipment: "smith", aliases: [] }]);
  const result = lib.classifyExercise(catalog, "Back Squat");
  assert.equal(result.equipment, "smith");
  assert.deepEqual(result.muscles, ["quadriceps"]);
});

test("limit parameter caps results", () => {
  const catalog = lib.createLibrary();
  const results = lib.searchCatalog(catalog, "", { limit: 5 });
  assert.equal(results.length, 5);
});
