"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "../../../../../..");
const running = require(path.join(ROOT, "SYSTEM/Views/workout-running-core.js"));

function testNormalizeActivity() {
  const act = running.normalizeActivity({
    activity_id: "run_001",
    start_time: "2026-07-20T07:00:00+09:00",
    distance_m: 5000,
    elapsed_s: 1500,
    moving_s: 1400,
    elevation_gain_m: 45,
    avg_hr: 155,
    max_hr: 178,
    cadence: 172,
    calories_kcal: 380,
    rpe: 7,
    notes: "아침 조깅",
    source: "manual",
  });
  assert.equal(act.schema_version, "prodigy-run-activity-v1");
  assert.equal(act.activity_id, "run_001");
  assert.equal(act.distance_m, 5000);
  assert.equal(act.elapsed_s, 1500);
  assert.equal(act.moving_s, 1400);
  // Pace uses moving time: 1400 / 5 = 280 s/km
  assert.equal(act.pace_s_per_km, 280);
  assert.equal(act.elevation_gain_m, 45);
  assert.equal(act.avg_hr, 155);
  assert.equal(act.data_quality, "full");
}

function testPaceFallbackToElapsed() {
  const act = running.normalizeActivity({
    activity_id: "run_002",
    start_time: "2026-07-20T07:00:00+09:00",
    distance_m: 10000,
    elapsed_s: 3000,
    // no moving_s
  });
  // Pace uses elapsed: 3000 / 10 = 300 s/km
  assert.equal(act.pace_s_per_km, 300);
  assert.equal(act.moving_s, null);
}

function testInvalidActivity() {
  assert.throws(() => running.normalizeActivity({ start_time: "2026-07-20T07:00:00Z", distance_m: 5000, elapsed_s: 1500 }), /activity_id/);
  assert.throws(() => running.normalizeActivity({ activity_id: "x", start_time: "bad", distance_m: 5000, elapsed_s: 1500 }), /start_time/);
  assert.throws(() => running.normalizeActivity({ activity_id: "x", start_time: "2026-07-20T07:00:00Z", distance_m: -1, elapsed_s: 1500 }), /distance/);
  assert.throws(() => running.normalizeActivity({ activity_id: "x", start_time: "2026-07-20T07:00:00Z", distance_m: 5000, elapsed_s: 0 }), /elapsed/);
}

function testStripCoordinates() {
  const dirty = {
    activity_id: "run_gps",
    distance_m: 5000,
    latitude: 37.5665,
    longitude: 126.978,
    route: [[37.56, 126.97], [37.57, 126.98]],
    track: [{ lat: 37.56, lon: 126.97 }],
    nested: { coordinates: [1, 2, 3], position: "here", name: "keep" },
    splits: [{ distance_m: 1000, duration_s: 300, lat: 37.5 }],
  };
  const clean = running.stripCoordinates(dirty);
  assert.equal(clean.activity_id, "run_gps");
  assert.equal(clean.distance_m, 5000);
  assert.equal(clean.latitude, undefined);
  assert.equal(clean.longitude, undefined);
  assert.equal(clean.route, undefined);
  assert.equal(clean.track, undefined);
  assert.equal(clean.nested.coordinates, undefined);
  assert.equal(clean.nested.position, undefined);
  assert.equal(clean.nested.name, "keep");
  assert.equal(clean.splits[0].lat, undefined);
  assert.equal(clean.splits[0].distance_m, 1000);
}

function testNormalizeActivityStripsCoords() {
  const act = running.normalizeActivity({
    activity_id: "run_dirty",
    start_time: "2026-07-20T07:00:00+09:00",
    distance_m: 5000,
    elapsed_s: 1500,
    latitude: 37.5,
    longitude: 127.0,
    route: [[1, 2]],
  });
  assert.equal(act.latitude, undefined);
  assert.equal(act.longitude, undefined);
  assert.equal(act.route, undefined);
}

function testFormatHelpers() {
  assert.equal(running.formatPace(330), "5:30 /km");
  assert.equal(running.formatPace(280), "4:40 /km");
  assert.equal(running.formatPace(null), "—");
  assert.equal(running.formatDuration(3661), "1:01:01");
  assert.equal(running.formatDuration(1711), "28:31");
  assert.equal(running.formatDuration(0), "—");
  assert.equal(running.formatDistance(5000), "5.00 km");
  assert.equal(running.formatDistance(42195), "42.20 km");
  assert.equal(running.formatDistance(null), "—");
}

function testWeeklyTrends() {
  const activities = [
    { start_time: "2026-07-14T07:00:00Z", distance_m: 5000, elapsed_s: 1500 },
    { start_time: "2026-07-16T07:00:00Z", distance_m: 8000, elapsed_s: 2400 },
    { start_time: "2026-07-20T07:00:00Z", distance_m: 10000, elapsed_s: 3000 },
  ];
  const trends = running.weeklyTrends(activities, "2026-07-20", 2);
  assert.equal(trends.length, 2);
  // Week 1 (Jul 13-19): 5000 + 8000 = 13000
  assert.equal(trends[0].distance_m, 13000);
  assert.equal(trends[0].count, 2);
  // Week 2 (Jul 20-26): 10000
  assert.equal(trends[1].distance_m, 10000);
  assert.equal(trends[1].count, 1);
}

function testWeightedAveragePace() {
  const activities = [
    { start_time: "2026-07-18T07:00:00Z", distance_m: 5000, pace_s_per_km: 300 },
    { start_time: "2026-07-19T07:00:00Z", distance_m: 10000, pace_s_per_km: 330 },
    { start_time: "2026-06-01T07:00:00Z", distance_m: 5000, pace_s_per_km: 400 }, // too old
  ];
  const avg = running.weightedAveragePace(activities, "2026-07-20", 4);
  // (300*5000 + 330*10000) / 15000 = (1500000 + 3300000) / 15000 = 320
  assert.equal(avg, 320);

  // No valid activities
  assert.equal(running.weightedAveragePace([], "2026-07-20", 4), null);
}

function testLegacyQuickProjection() {
  const sessions = [
    { session_id: "s1", quick: true, status: "completed", title: "러닝", distance: "5 km", duration: "28:31", completed_at: "2026-07-15T08:00:00Z", date: "2026-07-15", notes: "한강" },
    { session_id: "s2", quick: true, status: "completed", title: "수영", distance: "", duration: "45:00", completed_at: "2026-07-16T08:00:00Z", date: "2026-07-16" },
    { session_id: "s3", quick: true, status: "draft", title: "미완료", distance: "3 km", duration: "15:00", date: "2026-07-17" },
    { session_id: "s4", session_kind: "free", quick: false, status: "completed", title: "러닝", distance: "9 km", duration: "45:00", completed_at: "2026-07-18T10:00:00Z", exercise_results: [{ exercise_id: "squat" }] },
    { session_id: "s5", session_kind: "quick", quick: false, status: "completed", title: "새 Quick", distance: "6 km", duration: "30:00", completed_at: "2026-07-19T07:00:00Z" },
    { session_id: "s6", session_kind: "programmed", status: "completed", title: "프로그램 러닝", completed_at: "2026-07-20T07:00:00Z", running_activity: { distance_m: 8000, elapsed_s: 2400, avg_hr: 150 } },
    { session_id: "s7", session_kind: "free", status: "completed", title: "자유 러닝", completed_at: "2026-07-21T07:00:00Z", running_activity: { distance_m: 10000, elapsed_s: 3000, calories_kcal: 700 } },
  ];
  const before = JSON.stringify(sessions);
  const projected = running.projectLegacyQuickSessions(sessions);
  assert.equal(projected.length, 5, "legacy/new quick and explicit running payloads project; free strength does not");
  assert.equal(projected[0].activity_id, "legacy_s1");
  assert.equal(projected[0].distance_m, 5000);
  assert.equal(projected[0].elapsed_s, 1711); // 28*60 + 31
  assert.equal(projected[0].data_quality, "summary_only");
  assert.equal(projected[0].source, "legacy_quick_session");
  assert.equal(projected[0]._read_only, true);
  assert.equal(projected[0]._legacy_title, "러닝");
  // Pace: 1711 / 5 = 342.2
  assert.equal(projected[0].pace_s_per_km, 342.2);

  assert.equal(projected[1].activity_id, "legacy_s2");
  assert.equal(projected[1].distance_m, null); // no distance
  assert.equal(projected[1].elapsed_s, 2700); // 45*60
  assert.equal(projected[1].pace_s_per_km, null);
  assert.equal(projected[2].activity_id, "legacy_s5");
  assert.equal(projected[3].activity_id, "legacy_s6");
  assert.equal(projected[3].source, "workout_session");
  assert.equal(projected[3].avg_hr, 150);
  assert.equal(projected[4].activity_id, "legacy_s7");
  assert.equal(projected[4].calories_kcal, 700);
  assert.ok(projected.every((row) => row._read_only === true));
  assert.ok(projected.every((row) => row.activity_id.startsWith("legacy_")));

  // Source sessions are NOT mutated
  assert.equal(JSON.stringify(sessions), before);
}

function testParseTcx() {
  const tcx = `<?xml version="1.0"?>
<TrainingCenterDatabase>
  <Activities>
    <Activity Sport="Running">
      <Id>2026-07-20T07:00:00Z</Id>
      <Lap StartTime="2026-07-20T07:00:00Z">
        <TotalTimeSeconds>1500.0</TotalTimeSeconds>
        <DistanceMeters>5000.0</DistanceMeters>
        <Calories>380</Calories>
        <AverageHeartRateBpm><Value>155</Value></AverageHeartRateBpm>
        <MaximumHeartRateBpm><Value>178</Value></MaximumHeartRateBpm>
        <Cadence>85</Cadence>
      </Lap>
    </Activity>
  </Activities>
</TrainingCenterDatabase>`;

  const result = running.parseTcx(tcx);
  assert.equal(result.errors.length, 0);
  assert.ok(result.activity);
  assert.equal(result.activity.distance_m, 5000);
  assert.equal(result.activity.elapsed_s, 1500);
  assert.equal(result.activity.calories_kcal, 380);
  assert.equal(result.activity.avg_hr, 155);
  assert.equal(result.activity.max_hr, 178);
  assert.equal(result.activity.source, "tcx");
  assert.equal(result.activity.splits.length, 1);
  assert.equal(result.activity.splits[0].distance_m, 5000);
}

function testParseTcxNonRun() {
  const tcx = `<TrainingCenterDatabase><Activities><Activity Sport="Biking"><Id>2026-07-20T07:00:00Z</Id><Lap><TotalTimeSeconds>3600</TotalTimeSeconds><DistanceMeters>30000</DistanceMeters></Lap></Activity></Activities></TrainingCenterDatabase>`;
  const result = running.parseTcx(tcx);
  assert.ok(result.errors.length > 0);
  assert.ok(result.errors[0].includes("러닝"));
  assert.equal(result.activity, null);
}

function testParseGpx() {
  const gpx = `<?xml version="1.0"?>
<gpx version="1.1">
  <trk>
    <name>Morning Run</name>
    <trkseg>
      <trkpt lat="37.5665" lon="126.9780"><ele>30</ele><time>2026-07-20T07:00:00Z</time></trkpt>
      <trkpt lat="37.5675" lon="126.9790"><ele>32</ele><time>2026-07-20T07:05:00Z</time></trkpt>
      <trkpt lat="37.5685" lon="126.9800"><ele>35</ele><time>2026-07-20T07:10:00Z</time></trkpt>
      <trkpt lat="37.5695" lon="126.9810"><ele>33</ele><time>2026-07-20T07:15:00Z</time></trkpt>
    </trkseg>
  </trk>
</gpx>`;

  const result = running.parseGpx(gpx);
  assert.equal(result.errors.length, 0);
  assert.ok(result.activity);
  assert.ok(result.activity.distance_m > 0);
  assert.equal(result.activity.elapsed_s, 900); // 15 min
  assert.equal(result.activity.source, "gpx");
  assert.ok(result.activity.elevation_gain_m > 0);
  // Coordinates must be stripped
  assert.equal(result.activity.latitude, undefined);
  assert.equal(result.activity.longitude, undefined);
}

function testParseGpxInvalid() {
  const result = running.parseGpx("<html>not gpx</html>");
  assert.ok(result.errors.length > 0);
  assert.equal(result.activity, null);
}

function testParseAppleHealthXml() {
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<HealthData>
  <HKWorkout activityType="HKWorkoutActivityTypeRunning" startDate="2026-07-15 07:00:00 +0900" duration="1800" totalDistance="6000" totalEnergyBurned="420"/>
  <HKWorkout activityType="HKWorkoutActivityTypeWalking" startDate="2026-07-16 08:00:00 +0900" duration="3600" totalDistance="4000"/>
  <HKWorkout activityType="HKWorkoutActivityTypeRunning" startDate="2026-07-18 06:30:00 +0900" duration="2400" totalDistance="8000" totalEnergyBurned="550"/>
</HealthData>`;

  const result = running.parseAppleHealthXml(xml);
  assert.equal(result.errors.length, 0);
  assert.equal(result.total_found, 2); // only running
  assert.equal(result.activities.length, 2);
  assert.equal(result.activities[0].distance_m, 6000);
  assert.equal(result.activities[0].elapsed_s, 1800);
  assert.equal(result.activities[0].calories_kcal, 420);
  assert.equal(result.activities[0].data_quality, "summary_only");
  assert.equal(result.activities[0].source, "apple_health");
  assert.equal(result.activities[0].splits.length, 0); // no splits fabricated
  assert.equal(result.activities[1].distance_m, 8000);
}

function testParseAppleHealthXmlNotHealth() {
  const result = running.parseAppleHealthXml("<html>not health data</html>");
  assert.ok(result.errors.length > 0);
  assert.equal(result.activities.length, 0);
}

function testRunImportReceipt() {
  const receipt = running.buildRunImportReceipt({
    import_id: "ri_001",
    source: "file",
    file_basename: "morning_run.fit",
    file_sha256: "def456",
    format: "fit",
    activity_count: 1,
    created_count: 1,
    warning_count: 0,
  });
  assert.equal(receipt.schema_version, "prodigy-run-import-v1");
  assert.equal(receipt.format, "fit");
  assert.ok(!receipt.raw_content);
}

function main() {
  testNormalizeActivity();
  testPaceFallbackToElapsed();
  testInvalidActivity();
  testStripCoordinates();
  testNormalizeActivityStripsCoords();
  testFormatHelpers();
  testWeeklyTrends();
  testWeightedAveragePace();
  testLegacyQuickProjection();
  testParseTcx();
  testParseTcxNonRun();
  testParseGpx();
  testParseGpxInvalid();
  testParseAppleHealthXml();
  testParseAppleHealthXmlNotHealth();
  testRunImportReceipt();
  console.log("Workout Running Core tests passed");
}

main();
