"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "../../../../../..");
const core = require(path.join(ROOT, "SYSTEM/Views/workout-core.js"));
const importer = require(path.join(ROOT, "SYSTEM/Views/workout-import.js"));
const objects = require(path.join(ROOT, "SYSTEM/Views/workout-program-objects.js"));

function program() {
  return core.normalizeProgram({
    id: "failure-fixture",
    title: "Failure Fixture",
    source: "synthetic.xlsx",
    days: [{
      id: "w1d1",
      week: 1,
      day: 1,
      exercises: [
        { id: "squat", name: "Squat", prescribed_sets: [{ reps: "5", rpe: "7", rest: "90" }] },
        { id: "bench", name: "Bench Press", prescribed_sets: [{ reps: "8", rpe: "8", rest: "120" }] },
      ],
    }],
  });
}

function fakeWriters() {
  const writes = { vault: 0, store: 0 };
  const app = {
    vault: {
      getAbstractFileByPath: () => null,
      create: async () => { writes.vault += 1; return { path: "FAKE/Program.md" }; },
      modify: async () => { writes.vault += 1; },
    },
    metadataCache: {},
  };
  const store = { saveProgram: async () => { writes.store += 1; } };
  const writeProgram = async (next) => {
    const saved = await objects.saveProgramObject(app, next);
    await store.saveProgram(saved);
    return saved;
  };
  return { writes, writeProgram };
}

async function expectReviewFailure(mapping, message) {
  // Given: explicit fake Vault and JSON-store writers.
  const source = program();
  const before = structuredClone(source);
  const fake = fakeWriters();

  // When: an invalid replacement review is submitted.
  await assert.rejects(
    importer.commitExerciseReplacementReview(source, mapping, fake.writeProgram),
    message,
  );

  // Then: validation fails before either writer and the source remains untouched.
  assert.deepEqual(fake.writes, { vault: 0, store: 0 });
  assert.deepEqual(source, before);
}

async function main() {
  await expectReviewFailure(
    { "Unknown Exercise": { name: "Hack Squat", target: "legs" } },
    /Unknown Exercise.*원본 운동을 찾을 수 없습니다/,
  );
  await expectReviewFailure(
    [
      { source: "Squat", replacement: { name: "Hack Squat", target: "legs" } },
      { source: "Squat", replacement: { name: "Front Squat", target: "legs" } },
    ],
    /Squat.*중복 대체 선택/,
  );
  await expectReviewFailure(
    {
      "Squat": { name: "Bench Press", target: "chest" },
      "Bench Press": { name: "Squat", target: "legs" },
    },
    /순환 대체.*Squat.*Bench Press/,
  );

  // Cancelling is represented by closing the review without invoking commit.
  const fake = fakeWriters();
  const review = importer.createExerciseReplacementReview(program(), () => [{ name: "Hack Squat", target: "legs" }]);
  review.select("Squat", review.candidates("Squat", "hack", {})[0]);
  assert.equal(review.preview().length, 1);
  assert.deepEqual(fake.writes, { vault: 0, store: 0 });

  console.log("Workout Import Failure tests passed: unknown/duplicate/circular/cancel => zero writes");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
