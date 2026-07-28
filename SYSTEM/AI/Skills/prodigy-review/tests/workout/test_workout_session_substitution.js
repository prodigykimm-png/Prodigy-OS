"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "../../../../../..");
const core = require(path.join(ROOT, "SYSTEM/Views/workout-core.js"));
const modals = require(path.join(ROOT, "SYSTEM/Views/workout-modals.js"));

function draftSession() {
  return {
    schema_version: "prodigy-workout-session-v1",
    session_id: "draft-1",
    program_run_id: "run-1",
    program_id: "prog-1",
    program_day_id: "w1d1",
    status: "draft",
    exercise_results: [
      {
        exercise_id: "ex1",
        name: "Back Squat",
        target: "legs",
        prescribed_sets: [{ id: "s1", reps: "5", rpe: "7" }],
        set_results: [{ set_id: "s1", completed: false, weight: "", reps: "", rpe: "", notes: "" }],
        notes: "",
        completed: false,
      },
      {
        exercise_id: "ex2",
        name: "Bench Press",
        target: "chest",
        prescribed_sets: [{ id: "s2", reps: "8", rpe: "7" }],
        set_results: [{ set_id: "s2", completed: true, weight: "60", reps: "8", rpe: "7", notes: "" }],
        notes: "",
        completed: true,
      },
    ],
  };
}

test("buildSubstitutionDraft produces a frozen draft proposal", () => {
  const session = draftSession();
  const proposal = modals.buildSubstitutionDraft(session, "ex1", { name: "Hack Squat", target: "legs" });
  assert.equal(proposal.status, "draft");
  assert.equal(proposal.from.name, "Back Squat");
  assert.equal(proposal.to.name, "Hack Squat");
  assert.ok(Object.isFrozen(proposal));
});

test("buildSubstitutionDraft does not mutate the session", () => {
  const session = draftSession();
  modals.buildSubstitutionDraft(session, "ex1", { name: "Hack Squat" });
  assert.equal(session.exercise_results[0].name, "Back Squat");
});

test("applySubstitutionDraft returns a new session with replacement applied", () => {
  const session = draftSession();
  const proposal = modals.buildSubstitutionDraft(session, "ex1", { name: "Hack Squat", target: "legs" });
  const next = modals.applySubstitutionDraft(session, proposal);
  assert.notEqual(next, session);
  assert.equal(next.exercise_results[0].name, "Hack Squat");
  // Original untouched
  assert.equal(session.exercise_results[0].name, "Back Squat");
  // set_results preserved
  assert.equal(next.exercise_results[0].set_results.length, 1);
});

test("applySubstitutionDraft preserves completed set data on other exercises", () => {
  const session = draftSession();
  const proposal = modals.buildSubstitutionDraft(session, "ex1", { name: "Leg Press" });
  const next = modals.applySubstitutionDraft(session, proposal);
  assert.equal(next.exercise_results[1].name, "Bench Press");
  assert.equal(next.exercise_results[1].set_results[0].weight, "60");
});

test("completed session rejects substitution build", () => {
  const session = draftSession();
  session.status = "completed";
  assert.throws(
    () => modals.buildSubstitutionDraft(session, "ex1", { name: "Hack Squat" }),
    /완료된 세션/
  );
});

test("completed session rejects substitution apply", () => {
  const session = draftSession();
  const proposal = modals.buildSubstitutionDraft(session, "ex1", { name: "Hack Squat" });
  session.status = "completed";
  assert.throws(
    () => modals.applySubstitutionDraft(session, proposal),
    /완료된 세션/
  );
});

test("active (non-draft) session rejects substitution", () => {
  const session = draftSession();
  session.status = "active";
  assert.throws(
    () => modals.buildSubstitutionDraft(session, "ex1", { name: "Hack Squat" }),
    /초안 세션만/
  );
});

test("non-draft proposal cannot be applied", () => {
  const session = draftSession();
  const proposal = { ...modals.buildSubstitutionDraft(session, "ex1", { name: "Hack Squat" }), status: "applied" };
  assert.throws(
    () => modals.applySubstitutionDraft(session, proposal),
    /초안 대체안만/
  );
});

test("proposal from another session is rejected", () => {
  const session = draftSession();
  const other = draftSession();
  other.session_id = "draft-other";
  const proposal = modals.buildSubstitutionDraft(other, "ex1", { name: "Hack Squat" });
  assert.throws(
    () => modals.applySubstitutionDraft(session, proposal),
    /속하지 않습니다/
  );
});

test("empty replacement name rejected", () => {
  const session = draftSession();
  assert.throws(
    () => modals.buildSubstitutionDraft(session, "ex1", { name: "" }),
    /이름/
  );
});

test("unknown exercise id rejected", () => {
  const session = draftSession();
  assert.throws(
    () => modals.buildSubstitutionDraft(session, "nope", { name: "Hack Squat" }),
    /운동/
  );
});
