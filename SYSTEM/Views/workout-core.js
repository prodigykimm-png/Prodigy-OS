(function (root) {
  "use strict";

  const RUN_STATUSES = new Set(["active", "paused", "completed", "abandoned"]);

  function clean(value) { return String(value == null ? "" : value).trim(); }
  function number(value) { const parsed = Number(value); return Number.isFinite(parsed) ? parsed : 0; }
  function clone(value) { return JSON.parse(JSON.stringify(value)); }
  function stableHash(value) {
    let hash = 2166136261;
    for (const char of String(value || "")) { hash ^= char.codePointAt(0); hash = Math.imul(hash, 16777619); }
    return (hash >>> 0).toString(36);
  }
  function machineId(prefix, seed) { return `${prefix}_${stableHash(seed)}`; }
  function nowIso() { return new Date().toISOString(); }

  function normalizeSets(sets, exerciseSeed) {
    const source = Array.isArray(sets) && sets.length ? sets : [{}];
    return source.map((set, index) => ({
      id: clean(set.id) || machineId("set", `${exerciseSeed}:${index + 1}`),
      set_number: index + 1,
      reps: clean(set.reps),
      rpe: clean(set.rpe).replace(/^@/, ""),
      load: clean(set.load),
      target: clean(set.target),
    }));
  }

  function normalizeExercise(exercise, daySeed, index) {
    const name = clean(exercise && exercise.name);
    if (!name) throw new Error("Exercise name is required.");
    const id = clean(exercise.id) || machineId("exercise", `${daySeed}:${index}:${name}`);
    return { id, name, target: clean(exercise.target), prescribed_sets: normalizeSets(exercise.prescribed_sets, `${daySeed}:${id}`) };
  }

  function normalizeDay(day, programSeed, index) {
    const week = number(day && day.week);
    const sequence = number(day && day.day);
    if (week < 1 || sequence < 1) throw new Error("Program Day requires week and day sequence.");
    const id = clean(day.id) || `w${week}d${sequence}`;
    const exercises = (Array.isArray(day.exercises) ? day.exercises : []).map((item, exerciseIndex) => normalizeExercise(item, `${programSeed}:${id}`, exerciseIndex));
    return { id, week, day: sequence, label: clean(day.label) || `Week ${week} Day ${sequence}`, exercises, order: index };
  }

  function normalizeProgram(input) {
    const title = clean(input && input.title);
    if (!title) throw new Error("Program title is required.");
    const id = clean(input.id) || machineId("program", `${title}:${clean(input.source)}`);
    const days = (Array.isArray(input.days) ? input.days : []).map((day, index) => normalizeDay(day, id, index));
    if (!days.length) throw new Error("Program requires at least one Program Day.");
    days.sort((left, right) => left.week - right.week || left.day - right.day || left.order - right.order);
    return {
      schema_version: "prodigy-workout-program-v1", id, title,
      creator: clean(input.creator), source: clean(input.source), goal: clean(input.goal), difficulty: clean(input.difficulty),
      duration: clean(input.duration), weeks: Math.max(...days.map((day) => day.week)), days,
    };
  }

  function completedDayIds(sessions, runId) {
    return new Set((sessions || []).filter((item) => item && item.program_run_id === runId && item.status === "completed").map((item) => clean(item.program_day_id)));
  }

  function suggestNextDay(program, sessions, runId) {
    const completed = completedDayIds(sessions, runId);
    const next = program.days.find((day) => !completed.has(day.id));
    return next ? next.id : "";
  }

  function createProgramRun(program, existingRuns, options = {}) {
    if ((existingRuns || []).some((run) => run.status === "active")) throw new Error("An active Program Run must be paused, completed, or abandoned first.");
    const prior = (existingRuns || []).filter((run) => run.program_id === program.id);
    const startedAt = clean(options.started_at) || nowIso();
    return {
      schema_version: "prodigy-workout-run-v1",
      run_id: clean(options.run_id) || machineId("run", `${program.id}:${startedAt}:${prior.length + 1}`),
      program_id: program.id, program_title: program.title, run_number: prior.length + 1,
      status: "active", started_at: startedAt, completed_at: "", suggested_day: program.days[0].id,
    };
  }

  function transitionProgramRun(run, status, at = nowIso()) {
    if (!RUN_STATUSES.has(status)) throw new Error("Unknown Program Run status.");
    const next = clone(run);
    next.status = status;
    next.completed_at = status === "completed" || status === "abandoned" ? clean(at) : "";
    return next;
  }

  function daySelectionWarning(program, sessions, runId, selectedDayId) {
    const suggested = suggestNextDay(program, sessions, runId);
    if (!suggested || suggested === selectedDayId) return "";
    const suggestedIndex = program.days.findIndex((day) => day.id === suggested);
    const selectedIndex = program.days.findIndex((day) => day.id === selectedDayId);
    if (selectedIndex <= suggestedIndex) return "";
    const pending = program.days[suggestedIndex];
    const selected = program.days[selectedIndex];
    return `${pending.week}주차 ${pending.day}일차가 아직 완료되지 않았습니다. ${selected.week}주차 ${selected.day}일차를 계속할까요?`;
  }

  function blankSetResult(prescribed) {
    return { set_id: prescribed.id, completed: false, weight: "", reps: "", rpe: "", notes: "" };
  }

  function createWorkoutSession(program, run, dayId, options = {}) {
    if (!run || run.program_id !== program.id) throw new Error("Program Run does not match Program.");
    const day = program.days.find((item) => item.id === dayId);
    if (!day) throw new Error("Program Day was not found.");
    const startedAt = clean(options.started_at) || nowIso();
    return {
      schema_version: "prodigy-workout-session-v1",
      session_id: clean(options.session_id) || machineId("session", `${run.run_id}:${day.id}:${startedAt}`),
      program_run_id: run.run_id, program_id: program.id, program_title: program.title,
      program_day_id: day.id, week: day.week, day: day.day, date: clean(options.date) || startedAt.slice(0, 10),
      started_at: startedAt, completed_at: "", status: "draft", quick: false,
      exercise_results: day.exercises.map((exercise) => ({
        exercise_id: exercise.id, name: exercise.name, target: exercise.target,
        prescribed_sets: clone(exercise.prescribed_sets), set_results: exercise.prescribed_sets.map(blankSetResult), notes: "", completed: false,
      })),
    };
  }

  function createQuickWorkout(options = {}) {
    const startedAt = clean(options.started_at) || nowIso();
    const title = clean(options.title);
    if (!title) throw new Error("Quick Workout title is required.");
    return {
      schema_version: "prodigy-workout-session-v1",
      session_id: clean(options.session_id) || machineId("session", `quick:${title}:${startedAt}`),
      program_run_id: null, program_id: null, program_title: "", program_day_id: null, week: null, day: null,
      date: clean(options.date) || startedAt.slice(0, 10), started_at: startedAt, completed_at: "", status: "draft", quick: true,
      title, distance: clean(options.distance), duration: clean(options.duration), notes: clean(options.notes), exercise_results: [],
    };
  }

  function updateSetResult(session, exerciseId, setIndex, patch) {
    const next = clone(session);
    const exercise = next.exercise_results.find((item) => item.exercise_id === exerciseId);
    if (!exercise || !exercise.set_results[setIndex]) throw new Error("Set Result was not found.");
    const allowed = ["completed", "weight", "reps", "rpe", "notes"];
    for (const key of allowed) if (Object.hasOwn(patch || {}, key)) exercise.set_results[setIndex][key] = key === "completed" ? Boolean(patch[key]) : clean(patch[key]);
    exercise.completed = exercise.set_results.length > 0 && exercise.set_results.every((set) => set.completed);
    return next;
  }

  function completeWorkoutSession(session, program, run, otherSessions, completedAt = nowIso()) {
    const completedSession = clone(session);
    completedSession.status = "completed";
    completedSession.completed_at = clean(completedAt);
    const sessions = [...(otherSessions || []), completedSession];
    const suggested = suggestNextDay(program, sessions, run.run_id);
    const nextRun = clone(run);
    nextRun.suggested_day = suggested;
    if (!suggested) { nextRun.status = "completed"; nextRun.completed_at = completedSession.completed_at; }
    return { session: completedSession, run: nextRun };
  }

  function previousExerciseResult(sessions, runId, exerciseId, currentSessionId) {
    const matches = (sessions || []).filter((session) => session.status === "completed" && session.program_run_id === runId && session.session_id !== currentSessionId)
      .sort((left, right) => clean(right.completed_at).localeCompare(clean(left.completed_at)));
    for (const session of matches) {
      const exercise = (session.exercise_results || []).find((item) => item.exercise_id === exerciseId);
      if (!exercise) continue;
      const set = [...(exercise.set_results || [])].reverse().find((item) => item.completed && (item.weight || item.reps || item.rpe));
      if (set) return { weight: clean(set.weight), reps: clean(set.reps), rpe: clean(set.rpe) };
    }
    return null;
  }

  const api = { RUN_STATUSES, clone, completeWorkoutSession, createProgramRun, createQuickWorkout, createWorkoutSession, daySelectionWarning, normalizeProgram, previousExerciseResult, stableHash, suggestNextDay, transitionProgramRun, updateSetResult };
  root.WorkoutCore = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
