"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "../../../../../..");
const fitParser = require(path.join(ROOT, "SYSTEM/Views/workout-fit-parser.js"));
const running = require(path.join(ROOT, "SYSTEM/Views/workout-running-core.js"));

function testFitTimeConversion() {
  // FIT epoch: 1989-12-31T00:00:00Z = 631065600000 ms
  // 0 seconds from FIT epoch
  const iso0 = fitParser.fitTimeToIso(0);
  assert.ok(iso0.startsWith("1989-12-31"));

  // 1 billion seconds from FIT epoch ≈ 2021-09-09
  const iso1b = fitParser.fitTimeToIso(1000000000);
  assert.ok(iso1b.startsWith("2021-"));

  // Invalid
  assert.equal(fitParser.fitTimeToIso(0xFFFFFFFF), null);
  assert.equal(fitParser.fitTimeToIso(null), null);
}

function testSemicirclesConversion() {
  // 2^31 semicircles = 180 degrees
  const deg = fitParser.semicirclesToDegrees(Math.pow(2, 31));
  assert.ok(Math.abs(deg - 180) < 0.001);

  // Negative
  const neg = fitParser.semicirclesToDegrees(-Math.pow(2, 31));
  assert.ok(Math.abs(neg - (-180)) < 0.001);

  // Zero
  assert.equal(fitParser.semicirclesToDegrees(0), 0);
}

function testParseInvalidBuffer() {
  // Too small
  const tiny = new ArrayBuffer(4);
  const r1 = fitParser.parseFit(tiny);
  assert.ok(r1.errors.length > 0);
  assert.ok(r1.errors[0].includes("작"));

  // Wrong magic
  const wrong = new ArrayBuffer(20);
  const wrongView = new DataView(wrong);
  wrongView.setUint8(0, 14); // header size
  wrongView.setUint8(1, 0x20); // protocol
  wrongView.setUint32(4, 0, true); // data size
  // bytes 8-11: not ".FIT"
  const wrongBytes = new Uint8Array(wrong);
  wrongBytes[8] = 88; wrongBytes[9] = 88; wrongBytes[10] = 88; wrongBytes[11] = 88;
  const r2 = fitParser.parseFit(wrong);
  assert.ok(r2.errors.length > 0);
  assert.ok(r2.errors[0].includes("FIT"));
}

function testFitToRunActivityNoSession() {
  const result = fitParser.fitToRunActivity({ sessions: [], laps: [], records: [], errors: [], warnings: [] }, {});
  assert.equal(result.activity, null);
  assert.ok(result.errors.length > 0);
}

function testFitToRunActivityNonRunning() {
  const result = fitParser.fitToRunActivity({
    sessions: [{ sport: 2, total_distance_m: 30000, total_elapsed_time: 3600 }],
    laps: [], records: [], errors: [], warnings: [],
  }, {});
  assert.equal(result.activity, null);
  assert.ok(result.errors[0].includes("러닝"));
}

function testFitToRunActivityValid() {
  const result = fitParser.fitToRunActivity({
    sessions: [{
      sport: 1,
      start_time: "2026-07-20T07:00:00.000Z",
      total_distance_m: 5000,
      total_elapsed_time: 1500,
      total_timer_time: 1400,
      total_calories: 380,
      avg_hr: 155,
      max_hr: 178,
      avg_cadence: 85,
      total_ascent: 45,
    }],
    laps: [
      { total_distance_m: 1000, total_timer_time: 280, avg_hr: 150 },
      { total_distance_m: 1000, total_timer_time: 275, avg_hr: 155 },
      { total_distance_m: 1000, total_timer_time: 285, avg_hr: 158 },
      { total_distance_m: 1000, total_timer_time: 290, avg_hr: 160 },
      { total_distance_m: 1000, total_timer_time: 270, avg_hr: 165 },
    ],
    records: [],
    errors: [],
    warnings: [],
  }, {});

  assert.ok(result.activity);
  assert.equal(result.activity.distance_m, 5000);
  assert.equal(result.activity.elapsed_s, 1500);
  assert.equal(result.activity.moving_s, 1400);
  assert.equal(result.activity.calories_kcal, 380);
  assert.equal(result.activity.avg_hr, 155);
  assert.equal(result.activity.max_hr, 178);
  assert.equal(result.activity.elevation_gain_m, 45);
  assert.equal(result.activity.source, "fit");
  assert.equal(result.activity.data_quality, "full");
  assert.equal(result.activity.splits.length, 5);
  assert.equal(result.activity.splits[0].distance_m, 1000);
  assert.equal(result.activity.splits[0].duration_s, 280);
  // Pace uses moving time: 1400 / 5 = 280
  assert.equal(result.activity.pace_s_per_km, 280);
  // No coordinates
  assert.equal(result.activity.latitude, undefined);
  assert.equal(result.activity.longitude, undefined);
}

function testFitToRunActivityMissingDistance() {
  const result = fitParser.fitToRunActivity({
    sessions: [{ sport: 1, start_time: "2026-07-20T07:00:00Z", total_distance_m: null, total_elapsed_time: 1500 }],
    laps: [], records: [], errors: [], warnings: [],
  }, {});
  assert.equal(result.activity, null);
  assert.ok(result.errors.length > 0);
}

function main() {
  testFitTimeConversion();
  testSemicirclesConversion();
  testParseInvalidBuffer();
  testFitToRunActivityNoSession();
  testFitToRunActivityNonRunning();
  testFitToRunActivityValid();
  testFitToRunActivityMissingDistance();
  console.log("Workout FIT Parser tests passed");
}

main();
