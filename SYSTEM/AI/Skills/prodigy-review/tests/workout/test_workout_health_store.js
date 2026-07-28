"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "../../../../../..");
const storeApi = require(path.join(ROOT, "SYSTEM/Views/workout-store.js"));
const healthApi = require(path.join(ROOT, "SYSTEM/Views/workout-health-store.js"));

async function testBasicCrud() {
  const root = await fs.promises.mkdtemp(path.join(os.tmpdir(), "health-store-"));
  const adapter = storeApi.createNodeAdapter(root);
  const store = healthApi.createHealthStore(adapter);

  // Save and read a nutrition entry
  const entry = { entry_id: "ne_test_001", date: "2026-07-20", meal: "lunch", name: "닭가슴살", calories_kcal: 165 };
  await store.save("nutritionEntries", "ne_test_001", entry);
  const read = await store.read("nutritionEntries", "ne_test_001");
  assert.deepEqual(read, entry);

  // List
  const list = await store.list("nutritionEntries");
  assert.equal(list.length, 1);
  assert.equal(list[0].name, "닭가슴살");

  // Save a run activity
  const run = { activity_id: "run_test_001", start_time: "2026-07-20T07:00:00+09:00", distance_m: 5000, elapsed_s: 1500 };
  await store.save("runActivities", "run_test_001", run);
  const runRead = await store.read("runActivities", "run_test_001");
  assert.equal(runRead.distance_m, 5000);

  // Index has both kinds
  const index = await store.readIndex();
  assert.equal(index.schema_version, "prodigy-workout-health-index-v1");
  assert.ok(index.nutritionEntries.includes("ne_test_001"));
  assert.ok(index.runActivities.includes("run_test_001"));

  // Remove
  await store.remove("nutritionEntries", "ne_test_001");
  assert.equal(await store.read("nutritionEntries", "ne_test_001"), null);
  const afterRemove = await store.list("nutritionEntries");
  assert.equal(afterRemove.length, 0);
  // Run activities unaffected
  assert.equal((await store.list("runActivities")).length, 1);

  await fs.promises.rm(root, { recursive: true, force: true });
}

async function testInvalidIds() {
  const root = await fs.promises.mkdtemp(path.join(os.tmpdir(), "health-store-"));
  const adapter = storeApi.createNodeAdapter(root);
  const store = healthApi.createHealthStore(adapter);

  await assert.rejects(() => store.save("nutritionEntries", "../escape", {}), /identifier/);
  await assert.rejects(() => store.save("nutritionEntries", "", {}), /identifier/);
  await assert.rejects(() => store.save("unknownKind", "valid_id", {}), /Unknown kind/);
  assert.equal(fs.existsSync(path.join(root, "escape.json")), false);

  await fs.promises.rm(root, { recursive: true, force: true });
}

async function testConcurrentWrites() {
  const root = await fs.promises.mkdtemp(path.join(os.tmpdir(), "health-store-"));
  const adapter = storeApi.createNodeAdapter(root);
  const store = healthApi.createHealthStore(adapter);

  // Concurrent saves should serialize via write chain
  const promises = [];
  for (let i = 0; i < 10; i++) {
    promises.push(store.save("nutritionEntries", `ne_conc_${i}`, { entry_id: `ne_conc_${i}`, name: `item${i}` }));
  }
  await Promise.all(promises);

  const list = await store.list("nutritionEntries");
  assert.equal(list.length, 10);

  await fs.promises.rm(root, { recursive: true, force: true });
}

async function testUpsertImported() {
  const root = await fs.promises.mkdtemp(path.join(os.tmpdir(), "health-store-"));
  const adapter = storeApi.createNodeAdapter(root);
  const store = healthApi.createHealthStore(adapter);

  // First import
  const items = [
    { entry_id: "ne_imp_1", source: "fatsecret", source_key: "fs:2026-07-20:lunch:rice:300", name: "밥", calories_kcal: 300 },
    { entry_id: "ne_imp_2", source: "fatsecret", source_key: "fs:2026-07-20:dinner:chicken:200", name: "치킨", calories_kcal: 200 },
  ];
  const results1 = await store.upsertImported("nutritionEntries", items, "source", "source_key");
  assert.equal(results1[0].created, true);
  assert.equal(results1[1].created, true);

  // Re-import same: should update, not duplicate
  const items2 = [
    { entry_id: "ne_imp_1", source: "fatsecret", source_key: "fs:2026-07-20:lunch:rice:300", name: "밥 (수정)", calories_kcal: 310 },
  ];
  const results2 = await store.upsertImported("nutritionEntries", items2, "source", "source_key");
  assert.equal(results2[0].created, false);
  assert.equal(results2[0].id, "ne_imp_1");

  const list = await store.list("nutritionEntries");
  assert.equal(list.length, 2); // no duplicate
  const updated = list.find((e) => e.entry_id === "ne_imp_1");
  assert.equal(updated.name, "밥 (수정)");
  assert.equal(updated.calories_kcal, 310);

  await fs.promises.rm(root, { recursive: true, force: true });
}

async function testStrengthIndexUnchanged() {
  const root = await fs.promises.mkdtemp(path.join(os.tmpdir(), "health-store-"));
  const adapter = storeApi.createNodeAdapter(root);

  // Create a strength store and save something
  const strengthStore = storeApi.createWorkoutStore(adapter, "SYSTEM/AI/Memory/workout");
  await strengthStore.saveProgram({ id: "prog_1", title: "Test", days: [{ id: "d1", week: 1, day: 1, exercises: [{ name: "Squat", prescribed_sets: [{ reps: "5" }] }] }] });

  // Create health store and save something
  const healthStore = healthApi.createHealthStore(adapter);
  await healthStore.save("nutritionEntries", "ne_x", { entry_id: "ne_x", name: "test" });

  // Strength index must not contain health kinds
  const strengthIndex = await strengthStore.readIndex();
  assert.equal(strengthIndex.schema_version, "prodigy-workout-index-v1");
  assert.ok(!strengthIndex.nutritionEntries);
  assert.ok(!strengthIndex.runActivities);
  assert.ok(strengthIndex.programs.includes("prog_1"));

  // Health index must not contain strength kinds
  const healthIndex = await healthStore.readIndex();
  assert.equal(healthIndex.schema_version, "prodigy-workout-health-index-v1");
  assert.ok(!healthIndex.programs);
  assert.ok(!healthIndex.sessions);
  assert.ok(healthIndex.nutritionEntries.includes("ne_x"));

  await fs.promises.rm(root, { recursive: true, force: true });
}

async function main() {
  await testBasicCrud();
  await testInvalidIds();
  await testConcurrentWrites();
  await testUpsertImported();
  await testStrengthIndexUnchanged();
  console.log("Workout Health Store tests passed");
}

main().catch((error) => { console.error(error.stack || error.message); process.exitCode = 1; });
