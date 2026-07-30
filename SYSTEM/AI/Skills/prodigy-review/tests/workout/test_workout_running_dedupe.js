"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "../../../../../..");
const running = require(path.join(ROOT, "SYSTEM/Views/workout-running-core.js"));
const storeApi = require(path.join(ROOT, "SYSTEM/Views/workout-store.js"));
const healthApi = require(path.join(ROOT, "SYSTEM/Views/workout-health-store.js"));
const projectionPath = path.join(ROOT, "SYSTEM/Views/workout-running-projection.js");
const projection = fs.existsSync(projectionPath) ? require(projectionPath) : null;

function healthXml(records) {
  return `<?xml version="1.0"?><HealthData>${records.join("")}</HealthData>`;
}

function appleRun(startDate, duration, distance, calories) {
  return `<HKWorkout activityType="HKWorkoutActivityTypeRunning" startDate="${startDate}" duration="${duration}" totalDistance="${distance}" totalEnergyBurned="${calories}"/>`;
}

async function saveActivities(store, activities) {
  if (projection) return projection.saveActivities(store, activities);
  for (const activity of activities) {
    await store.save("runActivities", activity.activity_id, activity);
  }
  return activities.map((activity) => ({ created: true, duplicate: false, id: activity.activity_id }));
}

async function testIdempotentAndOverlappingAppleHealthImports() {
  const tempRoot = await fs.promises.mkdtemp(path.join(os.tmpdir(), "running-dedupe-"));
  try {
    const adapter = storeApi.createNodeAdapter(tempRoot);
    const store = healthApi.createHealthStore(adapter, "synthetic-health");
    const runA = appleRun("2026-07-10 06:00:00 +0900", "1500", "5000", "350");
    const runB = appleRun("2026-07-12 07:00:00 +0900", "1800", "6000", "420");
    const runC = appleRun("2026-07-14 08:00:00 +0900", "2100", "7000", "490");
    const firstWindow = running.parseAppleHealthXml(healthXml([runA, runB])).activities;
    const overlappingWindow = running.parseAppleHealthXml(healthXml([runB, runC])).activities;

    const first = await saveActivities(store, firstWindow);
    const repeated = await saveActivities(store, firstWindow);
    const overlap = await saveActivities(store, overlappingWindow);
    const stored = await store.list("runActivities");

    assert.equal(first.filter((item) => item.created).length, 2, "first import creates both real runs");
    assert.equal(repeated.filter((item) => item.duplicate).length, 2, "same source import reports both duplicates");
    assert.equal(overlap.filter((item) => item.created).length, 1, "overlap creates only the unseen run");
    assert.equal(overlap.filter((item) => item.duplicate).length, 1, "overlap reports the repeated run");
    assert.equal(stored.length, 3, "canonical store has one activity per real run");
    assert.equal(new Set(stored.map((item) => item.activity_id)).size, 3);
    assert.ok(stored.every((item) => item.activity_id === item.canonical_key), "persisted identity is deterministic");
  } finally {
    await fs.promises.rm(tempRoot, { recursive: true, force: true });
  }
}

function testCanonicalProjectionMergesFormatsWithoutDroppingFields() {
  assert.ok(projection, "canonical running projection module must exist");
  const apple = running.parseAppleHealthXml(healthXml([
    appleRun("2026-07-20 07:00:00 +0900", "1500", "5000", "380"),
  ])).activities[0];
  const tcx = running.parseTcx(`
    <TrainingCenterDatabase><Activity Sport="Running">
      <Id>2026-07-20T07:00:00+09:00</Id><Lap>
        <TotalTimeSeconds>1500</TotalTimeSeconds><DistanceMeters>5000</DistanceMeters>
        <AverageHeartRateBpm><Value>155</Value></AverageHeartRateBpm><Cadence>85</Cadence>
      </Lap>
    </Activity></TrainingCenterDatabase>
  `).activity;
  const legacySession = {
    session_id: "legacy-collision",
    session_kind: "quick",
    status: "completed",
    title: "겹치는 Quick 러닝",
    distance: "5 km",
    duration: "25:00",
    completed_at: "2026-07-20T07:00:00+09:00",
  };

  const first = projection.buildRunningModel([apple, tcx], [legacySession]);
  const second = projection.buildRunningModel([tcx, apple], [legacySession]);
  assert.equal(first.all.length, 1, "same logical run from imports and legacy projection projects once");
  assert.equal(JSON.stringify(first.all), JSON.stringify(second.all), "projection is input-order deterministic");

  const canonical = first.all[0];
  assert.equal(canonical.source, "tcx");
  assert.equal(canonical.avg_hr, 155);
  assert.equal(canonical.cadence, 85);
  assert.equal(canonical.calories_kcal, 380);
  assert.equal(canonical.distance_m, 5000);
  assert.equal(canonical.elapsed_s, 1500);
  assert.equal(canonical._read_only, undefined, "persisted activity wins an Apple Health/legacy collision");
  assert.deepEqual(canonical._source_refs.map((item) => item.source), ["apple_health", "legacy_quick_session", "tcx"]);
}

async function testModelRebuildIsByteStableAndReadOnly() {
  assert.ok(projection, "canonical running projection module must exist");
  const tempRoot = await fs.promises.mkdtemp(path.join(os.tmpdir(), "running-projection-"));
  try {
    const adapter = storeApi.createNodeAdapter(tempRoot);
    const store = healthApi.createHealthStore(adapter, "synthetic-health");
    const activity = running.normalizeActivity({
      activity_id: "manual_fixture",
      start_time: "2026-07-22T07:00:00+09:00",
      distance_m: 5000,
      elapsed_s: 1500,
      source: "manual",
    });
    await saveActivities(store, [activity]);
    const sessions = [{
      session_id: "quick-fixture",
      session_kind: "quick",
      quick: false,
      status: "completed",
      title: "빠른 러닝",
      distance: "6 km",
      duration: "30:00",
      completed_at: "2026-07-23T07:00:00+09:00",
    }];
    const indexPath = path.join(tempRoot, "synthetic-health/index.json");
    const before = await fs.promises.readFile(indexPath);
    const stored = await store.list("runActivities");
    const first = JSON.stringify(projection.buildRunningModel(stored, sessions).all);
    const second = JSON.stringify(projection.buildRunningModel(stored, sessions).all);
    const after = await fs.promises.readFile(indexPath);

    assert.equal(first, second, "rebuilding twice produces byte-equivalent rows");
    assert.deepEqual(after, before, "projection never writes a derived row to disk");
    assert.equal((await store.list("runActivities")).length, 1, "derived quick row stays out of health store");
  } finally {
    await fs.promises.rm(tempRoot, { recursive: true, force: true });
  }
}

async function main() {
  await testIdempotentAndOverlappingAppleHealthImports();
  testCanonicalProjectionMergesFormatsWithoutDroppingFields();
  await testModelRebuildIsByteStableAndReadOnly();
  console.log("Workout Running dedupe tests passed");
}

main().catch((error) => { console.error(error.stack || error.message); process.exitCode = 1; });
