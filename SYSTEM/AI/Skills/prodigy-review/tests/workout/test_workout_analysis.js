"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "../../../../../..");
const core = require(path.join(ROOT, "SYSTEM/Views/workout-core.js"));
const analysis = require(path.join(ROOT, "SYSTEM/Views/workout-analysis.js"));
const lib = require(path.join(ROOT, "SYSTEM/Views/workout-exercise-library.js"));

function completedSession(id, date, exercises) {
  return {
    session_id: id,
    status: "completed",
    date,
    completed_at: `${date}T10:00:00Z`,
    exercise_results: exercises,
  };
}

function exercise(name, sets) {
  return {
    exercise_id: name.toLowerCase().replace(/\s+/g, "_"),
    name,
    set_results: sets.map((s, i) => ({
      set_id: `s${i}`,
      completed: s.completed !== false,
      weight: String(s.weight || ""),
      reps: String(s.reps || ""),
      rpe: String(s.rpe || ""),
      notes: "",
    })),
  };
}

// ─── Volume ─────────────────────────────────────────────────────────────

test("sessionVolume computes weight × reps for completed sets only", () => {
  const session = completedSession("s1", "2026-07-28", [
    exercise("Back Squat", [
      { weight: 100, reps: 5 },
      { weight: 100, reps: 5 },
      { weight: 100, reps: 3, completed: false },
    ]),
  ]);
  const vol = analysis.sessionVolume(session);
  assert.equal(vol.total_volume, 1000); // 500 + 500, third set not counted
  assert.equal(vol.exercise_volumes[0].sets, 2);
});

test("sessionVolume handles empty session", () => {
  const vol = analysis.sessionVolume({ exercise_results: [] });
  assert.equal(vol.total_volume, 0);
  assert.equal(vol.exercise_volumes.length, 0);
});

test("multiSessionVolume aggregates across sessions", () => {
  const sessions = [
    completedSession("s1", "2026-07-26", [exercise("Back Squat", [{ weight: 100, reps: 5 }])]),
    completedSession("s2", "2026-07-28", [exercise("Back Squat", [{ weight: 110, reps: 5 }])]),
    { session_id: "draft", status: "draft", exercise_results: [] }, // excluded
  ];
  const vol = analysis.multiSessionVolume(sessions);
  assert.equal(vol.session_count, 2);
  assert.equal(vol.total_volume, 1050); // 500 + 550
  assert.equal(vol.by_exercise[0].name, "Back Squat");
  assert.equal(vol.by_exercise[0].sessions, 2);
  assert.equal(vol.by_date.length, 2);
});

// ─── PR Tracking ────────────────────────────────────────────────────────

test("exercisePRs finds max weight, e1rm, and volume", () => {
  const sessions = [
    completedSession("s1", "2026-07-20", [exercise("Bench Press", [{ weight: 60, reps: 8 }])]),
    completedSession("s2", "2026-07-25", [exercise("Bench Press", [{ weight: 70, reps: 5 }])]),
  ];
  const prs = analysis.exercisePRs(sessions, "Bench Press");
  assert.equal(prs.max_weight.weight, 70);
  assert.equal(prs.max_weight.date, "2026-07-25");
  assert.ok(prs.max_e1rm.e1rm > 0);
  assert.ok(prs.max_volume.volume > 0);
});

test("exercisePRs returns nulls for unknown exercise", () => {
  const prs = analysis.exercisePRs([], "Nonexistent");
  assert.equal(prs.max_weight, null);
  assert.equal(prs.max_e1rm, null);
  assert.equal(prs.max_volume, null);
});

test("detectNewPRs identifies new records in target session", () => {
  const prior = [
    completedSession("s1", "2026-07-20", [exercise("Back Squat", [{ weight: 100, reps: 5 }])]),
  ];
  const target = completedSession("s2", "2026-07-28", [
    exercise("Back Squat", [{ weight: 120, reps: 5 }]),
  ]);
  const all = [...prior, target];
  const prs = analysis.detectNewPRs(all, target);
  assert.ok(prs.length >= 1);
  assert.ok(prs.some((pr) => pr.exercise === "Back Squat" && pr.type === "max_weight" && pr.value === 120));
  assert.equal(prs[0].previous_value, 100);
});

test("detectNewPRs returns empty for non-completed session", () => {
  const draft = { session_id: "d1", status: "draft", exercise_results: [] };
  assert.deepEqual(analysis.detectNewPRs([], draft), []);
});

// ─── Muscle Distribution ────────────────────────────────────────────────

test("sessionMuscleDistribution uses exercise library classification", () => {
  const catalog = lib.createLibrary();
  const session = completedSession("s1", "2026-07-28", [
    exercise("Back Squat", [{ weight: 100, reps: 5 }, { weight: 100, reps: 5 }]),
    exercise("Bench Press", [{ weight: 60, reps: 8 }]),
  ]);
  const dist = analysis.sessionMuscleDistribution(session, catalog);
  assert.ok(dist.length >= 2);
  // Sorted by sets desc
  for (let i = 1; i < dist.length; i++) {
    assert.ok(dist[i - 1].sets >= dist[i].sets);
  }
  // Ratios sum to ~1
  const totalRatio = dist.reduce((sum, d) => sum + d.ratio, 0);
  assert.ok(Math.abs(totalRatio - 1) < 0.05);
});

// ─── Determinism ────────────────────────────────────────────────────────

test("analyzeSession is deterministic (same input → same output)", () => {
  const sessions = [
    completedSession("s1", "2026-07-20", [exercise("Back Squat", [{ weight: 100, reps: 5 }])]),
    completedSession("s2", "2026-07-28", [exercise("Back Squat", [{ weight: 110, reps: 5 }])]),
  ];
  const catalog = lib.createLibrary();
  const a = analysis.analyzeSession(sessions[1], sessions, catalog);
  const b = analysis.analyzeSession(sessions[1], sessions, catalog);
  assert.deepEqual(JSON.parse(JSON.stringify(a)), JSON.parse(JSON.stringify(b)));
});

test("analyzeSession returns frozen result", () => {
  const session = completedSession("s1", "2026-07-28", [
    exercise("Back Squat", [{ weight: 100, reps: 5 }]),
  ]);
  const result = analysis.analyzeSession(session, [session], lib.createLibrary());
  assert.ok(Object.isFrozen(result));
  assert.equal(result.session_id, "s1");
  assert.ok(result.total_sets >= 1);
});

// ─── Explicit AI Save ───────────────────────────────────────────────────

test("AI conversation is nonpersistent and bounded to 6 turns", () => {
  const convo = core.createAiConversation();
  assert.equal(convo.maxTurns, 6);
  assert.equal(convo.isPersisted, false);

  for (let i = 0; i < 6; i++) {
    const reply = convo.send(`메시지 ${i + 1}`);
    assert.ok(reply.length > 0);
  }
  assert.equal(convo.isExhausted, true);
  assert.throws(() => convo.send("7번째"), /최대 6회/);
  // Still not persisted — no auto-save
  assert.equal(convo.isPersisted, false);
});

test("AI observation requires explicit save", () => {
  const convo = core.createAiConversation();
  convo.send("오늘 컨디션 어때?");
  const obs = convo.buildObservation({ note: "좌우 불균형" });
  assert.equal(obs.kind, "ai_observation");
  assert.equal(obs.note, "좌우 불균형");
  assert.equal(convo.isPersisted, false);
  convo.markPersisted();
  assert.equal(convo.isPersisted, true);
});

test("buildObservation rejects empty note", () => {
  assert.throws(() => core.buildObservation(null, ""), /관측 내용/);
});

test("assertObservationAllowed rejects completed sessions", () => {
  assert.throws(
    () => core.assertObservationAllowed({ status: "completed" }),
    /완료된 세션/
  );
  assert.equal(core.assertObservationAllowed({ status: "draft" }), true);
  assert.equal(core.assertObservationAllowed(null), true);
});
