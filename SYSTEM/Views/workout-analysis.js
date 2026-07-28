/**
 * Workout Analysis — deterministic volume, PR tracking, muscle group distribution.
 * Pure functions, no side effects. CommonJS. Part of Workout v2 (Todo 10).
 */
(function (root) {
  "use strict";

  const core = root.WorkoutCore || (typeof require === "function" ? require("./workout-core.js") : null);
  const library = root.WorkoutExerciseLibrary || (typeof require === "function" ? require("./workout-exercise-library.js") : null);

  function clean(value) { return String(value == null ? "" : value).trim(); }
  function parseNum(value) {
    const n = Number(String(value == null ? "" : value).replace(/[^\d.]/g, ""));
    return Number.isFinite(n) ? n : 0;
  }

  // ─── Volume Analysis ──────────────────────────────────────────────────

  /**
   * Compute total volume (weight × reps) for a single completed session.
   * Only counts sets where completed === true.
   * @returns {{ total_volume: number, exercise_volumes: Array<{name, volume, sets}> }}
   */
  function sessionVolume(session) {
    let totalVolume = 0;
    const exerciseVolumes = [];
    (session && session.exercise_results || []).forEach((exercise) => {
      let exVolume = 0;
      let exSets = 0;
      (exercise.set_results || []).forEach((set) => {
        if (!set.completed) return;
        const w = parseNum(set.weight);
        const r = parseNum(set.reps);
        const vol = w * r;
        exVolume += vol;
        exSets++;
      });
      totalVolume += exVolume;
      exerciseVolumes.push({
        name: clean(exercise.name),
        exercise_id: clean(exercise.exercise_id),
        volume: Math.round(exVolume * 10) / 10,
        sets: exSets,
      });
    });
    return {
      total_volume: Math.round(totalVolume * 10) / 10,
      exercise_volumes: exerciseVolumes,
    };
  }

  /**
   * Aggregate volume across multiple completed sessions.
   * @returns {{ total_volume: number, session_count: number, by_exercise: Array, by_date: Array }}
   */
  function multiSessionVolume(sessions) {
    const completed = (sessions || []).filter((s) => s && s.status === "completed");
    let totalVolume = 0;
    const exerciseMap = new Map();
    const byDate = [];

    completed.forEach((session) => {
      const vol = sessionVolume(session);
      totalVolume += vol.total_volume;
      byDate.push({
        session_id: clean(session.session_id),
        date: clean(session.completed_at || session.date).slice(0, 10),
        volume: vol.total_volume,
      });
      vol.exercise_volumes.forEach((ev) => {
        const key = ev.name.toLocaleLowerCase("ko-KR");
        if (!exerciseMap.has(key)) exerciseMap.set(key, { name: ev.name, volume: 0, sets: 0, sessions: 0 });
        const entry = exerciseMap.get(key);
        entry.volume += ev.volume;
        entry.sets += ev.sets;
        entry.sessions++;
      });
    });

    byDate.sort((a, b) => a.date.localeCompare(b.date));
    const byExercise = [...exerciseMap.values()]
      .map((e) => ({ ...e, volume: Math.round(e.volume * 10) / 10 }))
      .sort((a, b) => b.volume - a.volume || a.name.localeCompare(b.name, "ko"));

    return {
      total_volume: Math.round(totalVolume * 10) / 10,
      session_count: completed.length,
      by_exercise: byExercise,
      by_date: byDate,
    };
  }

  // ─── PR Tracking ──────────────────────────────────────────────────────

  /**
   * Find personal records across completed sessions for a given exercise.
   * PR types: max_weight (heaviest single set), max_e1rm (best estimated 1RM),
   * max_volume (highest session total volume for this exercise).
   * @returns {{ max_weight: object|null, max_e1rm: object|null, max_volume: object|null }}
   */
  function exercisePRs(sessions, exerciseName) {
    const target = clean(exerciseName).toLocaleLowerCase("ko-KR");
    let maxWeight = null;
    let maxE1rm = null;
    let maxVolume = null;

    (sessions || []).filter((s) => s && s.status === "completed").forEach((session) => {
      const date = clean(session.completed_at || session.date).slice(0, 10);
      const sessionId = clean(session.session_id);
      let sessionExVolume = 0;

      (session.exercise_results || []).forEach((exercise) => {
        if (clean(exercise.name).toLocaleLowerCase("ko-KR") !== target) return;
        (exercise.set_results || []).forEach((set) => {
          if (!set.completed) return;
          const w = parseNum(set.weight);
          const r = parseNum(set.reps);
          if (w <= 0 || r < 1) return;
          sessionExVolume += w * r;

          const e1rm = core ? core.estimate1RM(set.weight, set.reps) : null;
          const record = { weight: w, reps: r, e1rm, date, session_id: sessionId };

          if (!maxWeight || w > maxWeight.weight) maxWeight = record;
          if (e1rm != null && (!maxE1rm || e1rm > maxE1rm.e1rm)) maxE1rm = record;
        });
      });

      if (sessionExVolume > 0) {
        const volRecord = { volume: Math.round(sessionExVolume * 10) / 10, date, session_id: sessionId };
        if (!maxVolume || volRecord.volume > maxVolume.volume) maxVolume = volRecord;
      }
    });

    return { max_weight: maxWeight, max_e1rm: maxE1rm, max_volume: maxVolume };
  }

  /**
   * Detect new PRs in a session compared to all prior completed sessions.
   * @returns {Array<{exercise, type, value, previous_value, date}>}
   */
  function detectNewPRs(sessions, targetSession) {
    if (!targetSession || targetSession.status !== "completed") return [];
    const prior = (sessions || []).filter((s) =>
      s && s.status === "completed" && s.session_id !== targetSession.session_id
    );
    const prs = [];
    const date = clean(targetSession.completed_at || targetSession.date).slice(0, 10);

    (targetSession.exercise_results || []).forEach((exercise) => {
      const name = clean(exercise.name);
      if (!name) return;
      const priorPRs = exercisePRs(prior, name);

      let sessionMaxWeight = 0;
      let sessionMaxE1rm = 0;
      (exercise.set_results || []).forEach((set) => {
        if (!set.completed) return;
        const w = parseNum(set.weight);
        const r = parseNum(set.reps);
        if (w > sessionMaxWeight) sessionMaxWeight = w;
        const e1rm = core ? core.estimate1RM(set.weight, set.reps) : null;
        if (e1rm != null && e1rm > sessionMaxE1rm) sessionMaxE1rm = e1rm;
      });

      if (sessionMaxWeight > 0 && (!priorPRs.max_weight || sessionMaxWeight > priorPRs.max_weight.weight)) {
        prs.push({
          exercise: name, type: "max_weight", value: sessionMaxWeight,
          previous_value: priorPRs.max_weight ? priorPRs.max_weight.weight : null, date,
        });
      }
      if (sessionMaxE1rm > 0 && (!priorPRs.max_e1rm || sessionMaxE1rm > priorPRs.max_e1rm.e1rm)) {
        prs.push({
          exercise: name, type: "max_e1rm", value: sessionMaxE1rm,
          previous_value: priorPRs.max_e1rm ? priorPRs.max_e1rm.e1rm : null, date,
        });
      }
    });

    return prs;
  }

  // ─── Muscle Group Distribution ────────────────────────────────────────

  /**
   * Compute muscle group distribution for a session using the exercise library.
   * Weights by set count per exercise, then distributes across muscles.
   * @returns {Array<{id, label, sets, ratio}>}
   */
  function sessionMuscleDistribution(session, catalog) {
    const lib = catalog || (library ? library.createLibrary() : []);
    const counts = new Map();
    let totalSets = 0;

    (session && session.exercise_results || []).forEach((exercise) => {
      const completedSets = (exercise.set_results || []).filter((s) => s.completed).length;
      if (!completedSets) return;
      totalSets += completedSets;
      const classification = library ? library.classifyExercise(lib, exercise.name) : { muscles: [], found: false };
      const muscles = classification.muscles.length ? classification.muscles : ["other"];
      const share = completedSets / muscles.length;
      muscles.forEach((m) => {
        counts.set(m, (counts.get(m) || 0) + share);
      });
    });

    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([id, sets]) => {
        const group = library ? library.MUSCLE_GROUPS.find((g) => g.id === id) : null;
        return {
          id,
          label: group ? group.label : id,
          sets: Math.round(sets * 10) / 10,
          ratio: totalSets ? Math.round((sets / totalSets) * 100) / 100 : 0,
        };
      });
  }

  // ─── Full Session Analysis ────────────────────────────────────────────

  /**
   * Deterministic full analysis of a completed session.
   * Pure function — same input always produces same output.
   */
  function analyzeSession(session, allSessions, catalog) {
    if (!session) return null;
    const volume = sessionVolume(session);
    const muscleDist = sessionMuscleDistribution(session, catalog);
    const newPRs = session.status === "completed" ? detectNewPRs(allSessions || [], session) : [];

    return Object.freeze({
      session_id: clean(session.session_id),
      date: clean(session.completed_at || session.date).slice(0, 10),
      status: clean(session.status),
      volume,
      muscle_distribution: muscleDist,
      new_prs: newPRs,
      total_sets: volume.exercise_volumes.reduce((sum, ev) => sum + ev.sets, 0),
      exercise_count: volume.exercise_volumes.filter((ev) => ev.sets > 0).length,
    });
  }

  const api = {
    sessionVolume, multiSessionVolume,
    exercisePRs, detectNewPRs,
    sessionMuscleDistribution,
    analyzeSession,
  };
  root.WorkoutAnalysis = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
