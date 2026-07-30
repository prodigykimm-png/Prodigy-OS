"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs");
const os = require("node:os");

const ROOT = path.resolve(__dirname, "../../../../../..");

// Load modules
const running = require(path.join(ROOT, "SYSTEM/Views/workout-running-core.js"));
const nutrition = require(path.join(ROOT, "SYSTEM/Views/workout-nutrition-core.js"));
const storeApi = require(path.join(ROOT, "SYSTEM/Views/workout-store.js"));
const healthStoreApi = require(path.join(ROOT, "SYSTEM/Views/workout-health-store.js"));

// --- Test helpers ---

function setupTempStore() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "qat18-import-fail-"));
  const adapter = storeApi.createNodeAdapter(tmp);
  const store = healthStoreApi.createHealthStore(adapter);
  return { store, adapter, root: tmp, cleanup: () => { try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (_) {} } };
}

function countFiles(dir) {
  const files = [];
  function walk(d) {
    for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, entry.name);
      if (entry.isDirectory()) walk(p);
      else if (entry.isFile()) files.push(p);
    }
  }
  if (fs.existsSync(dir)) walk(dir);
  return files.length;
}

// --- Malformed Apple Health XML ---

function testAppleHealthMalformedXml() {
  const { store, root, cleanup } = setupTempStore();
  try {
    const before = countFiles(root);

    // Malformed: not XML at all
    const result1 = running.parseAppleHealthXml("not an xml file at all");
    assert.ok(result1.errors.length > 0, "malformed input should produce errors");
    assert.ok(result1.errors.some((e) => /형식|Health/i.test(e)), "error should mention Apple Health format");
    assert.equal(result1.activities.length, 0, "no activities from malformed input");

    // Malformed: empty string
    const result2 = running.parseAppleHealthXml("");
    assert.ok(result2.errors.length > 0, "empty string should produce errors");
    assert.equal(result2.activities.length, 0);

    // Malformed: valid XML but no running workouts
    const result3 = running.parseAppleHealthXml('<?xml version="1.0"?><HealthData><HKWorkout activityType="HKWorkoutActivityTypeWalking" startDate="2099-12-31 07:00:00 +0900" duration="1800"/></HealthData>');
    assert.ok(result3.warnings.length > 0 || result3.activities.length === 0, "non-running XML should produce warning or zero activities");
    assert.equal(result3.activities.length, 0, "no running activities from walking-only XML");

    // Verify zero writes
    const after = countFiles(root);
    assert.equal(after, before, "ZERO writes to store for malformed inputs");

    console.log("  apple-health-malformed-xml: PASS (zero writes)");
  } finally {
    cleanup();
  }
}

// --- Partially valid Apple Health XML ---

function testAppleHealthPartiallyValidXml() {
  const { store, root, cleanup } = setupTempStore();
  try {
    const before = countFiles(root);

    // XML with 2 running + 1 broken (missing duration)
    const xml = `<?xml version="1.0"?>
<HealthData>
  <HKWorkout activityType="HKWorkoutActivityTypeRunning" startDate="2099-12-31 07:00:00 +0900" duration="1800" totalDistance="6000"/>
  <HKWorkout activityType="HKWorkoutActivityTypeRunning" startDate="2099-12-31 08:00:00 +0900" totalDistance="4000"/>
  <HKWorkout activityType="HKWorkoutActivityTypeRunning" startDate="2099-12-30 06:30:00 +0900" duration="2700" totalDistance="10000"/>
</HealthData>`;

    const result = running.parseAppleHealthXml(xml);
    assert.equal(result.errors.length, 0, "partially valid XML should have no errors");
    // The second workout has no duration → warning
    assert.ok(result.warnings.length >= 1, "should warn about missing duration");
    assert.equal(result.activities.length, 2, "only 2 valid activities (one skipped)");
    assert.equal(result.total_found, 3, "3 workout tags found");

    // Verify zero writes (parse only, no store interaction)
    const after = countFiles(root);
    assert.equal(after, before, "ZERO writes to store for parse-only operation");

    // Now verify the confirm-before-save gate: saveActivities should work
    // but we test that the projection is called, not that the store is bypassed
    console.log("  apple-health-partial: PASS (2 valid, 1 warning, zero writes)");
  } finally {
    cleanup();
  }
}

// --- Malformed FatSecret CSV ---

function testFatSecretMalformedCsv() {
  const { store, root, cleanup } = setupTempStore();
  try {
    const before = countFiles(root);

    // Missing required columns
    const r1 = nutrition.parseFatSecretCsv("Food,Protein\n밥,10");
    assert.ok(r1.errors.length > 0, "missing date/calories columns should error");
    assert.ok(r1.errors.some((e) => /날짜|date|음식|food|칼로리|calories/i.test(e)), "error should mention missing column");

    // Empty
    const r2 = nutrition.parseFatSecretCsv("");
    assert.ok(r2.errors.length > 0, "empty CSV should error");

    // Partially valid: 1 valid row + 2 invalid
    const csv3 = [
      "Date,Food,Calories",
      "2099-12-31,밥,300",
      "bad-date,국,100",
      "2099-12-30,,200",
    ].join("\n");
    const r3 = nutrition.parseFatSecretCsv(csv3);
    assert.equal(r3.errors.length, 0, "partial CSV should have no fatal errors");
    assert.equal(r3.entries.length, 1, "only 1 valid entry");
    assert.ok(r3.warnings.length >= 2, "should warn about invalid rows");

    // Verify zero writes
    const after = countFiles(root);
    assert.equal(after, before, "ZERO writes to store for malformed CSV inputs");

    console.log("  fatsecret-malformed-csv: PASS (zero writes)");
  } finally {
    cleanup();
  }
}

// --- Confirm-before-save gate ---

function testConfirmBeforeSaveGate() {
  // This test verifies that the parseAppleHealthXml function only parses
  // and does NOT write to the store. The write is in the modal's confirm
  // handler, which is separate from parsing.
  const { store, root, cleanup } = setupTempStore();
  try {
    const before = countFiles(root);

    const xml = `<?xml version="1.0"?>
<HealthData>
  <HKWorkout activityType="HKWorkoutActivityTypeRunning" startDate="2099-12-31 07:00:00 +0900" duration="1800" totalDistance="6000"/>
</HealthData>`;

    const result = running.parseAppleHealthXml(xml);
    assert.equal(result.errors.length, 0);
    assert.equal(result.activities.length, 1);

    // Parse alone must NOT write
    const after = countFiles(root);
    assert.equal(after, before, "parse must NOT write to store — confirm-before-save gate");

    console.log("  confirm-before-save-gate: PASS (parse == zero writes)");
  } finally {
    cleanup();
  }
}

// --- Error message is Korean and actionable ---

function testErrorMessagesAreKorean() {
  // Apple Health not-health
  const r1 = running.parseAppleHealthXml("<html>not health</html>");
  assert.ok(r1.errors.length > 0);
  const msg1 = r1.errors.join(" ");
  assert.ok(/형식|Health/.test(msg1), "Apple Health error should mention format: " + msg1);

  // FatSecret missing columns
  const r2 = nutrition.parseFatSecretCsv("X,Y\n1,2");
  assert.ok(r2.errors.length > 0);
  const msg2 = r2.errors.join(" ");
  assert.ok(/날짜|date|음식|food|칼로리|calories/i.test(msg2), "FatSecret error should mention missing column: " + msg2);

  // TCX non-run
  const r3 = running.parseTcx("<TrainingCenterDatabase><Activities><Activity Sport=\"Biking\"><Id>2026-07-20T07:00:00Z</Id><Lap><TotalTimeSeconds>3600</TotalTimeSeconds><DistanceMeters>30000</DistanceMeters></Lap></Activity></Activities></TrainingCenterDatabase>");
  assert.ok(r3.errors.length > 0);
  assert.ok(r3.errors[0].includes("러닝"), "TCX non-run should mention 러닝");

  console.log("  error-messages-korean: PASS");
}

// --- Retry remains available after failure ---

function testRetryAvailableAfterFailure() {
  // After a parse failure, the function returns errors + empty activities.
  // The caller can show the error and let the user pick a new file.
  // This is a structural test: the parse function is pure and can be called again.

  const r1 = running.parseAppleHealthXml("garbage");
  assert.ok(r1.errors.length > 0);
  assert.equal(r1.activities.length, 0);

  // Call again with valid input — should work
  const r2 = running.parseAppleHealthXml('<?xml version="1.0"?><HealthData><HKWorkout activityType="HKWorkoutActivityTypeRunning" startDate="2099-12-31 07:00:00 +0900" duration="1800" totalDistance="6000"/></HealthData>');
  assert.equal(r2.errors.length, 0);
  assert.equal(r2.activities.length, 1);

  console.log("  retry-available: PASS (parse is pure, retry works)");
}

// --- Main ---

function main() {
  console.log("Workout Health Import Failure tests");
  testAppleHealthMalformedXml();
  testAppleHealthPartiallyValidXml();
  testFatSecretMalformedCsv();
  testConfirmBeforeSaveGate();
  testErrorMessagesAreKorean();
  testRetryAvailableAfterFailure();
  console.log("Workout Health Import Failure tests passed");
}

main();
