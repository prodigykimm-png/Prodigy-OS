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
      rest: clean(set.rest),
    }));
  }

  function normalizeExercise(exercise, daySeed, index) {
    const name = clean(exercise && exercise.name);
    if (!name) throw new Error("Exercise name is required.");
    const id = clean(exercise.id) || machineId("exercise", `${daySeed}:${index}:${name}`);
    const normalized = {
      id,
      name,
      target: clean(exercise.target),
      notes: clean(exercise.notes),
      prescribed_sets: normalizeSets(exercise.prescribed_sets, `${daySeed}:${id}`),
    };
    // Preserve optional Workout v2 superset grouping (Todo 10).
    if (clean(exercise.superset_group)) normalized.superset_group = clean(exercise.superset_group);
    if (clean(exercise.superset_label)) normalized.superset_label = clean(exercise.superset_label);
    return normalized;
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
      duration: clean(input.duration), source_path: clean(input.source_path), weeks: Math.max(...days.map((day) => day.week)), days,
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

  /**
   * Snapshot Program structure for version safety.
   * Future edits to the library Program must not rewrite this snapshot.
   */
  function snapshotProgram(program) {
    const normalized = normalizeProgram(program);
    return clone({
      id: normalized.id,
      title: normalized.title,
      goal: normalized.goal,
      difficulty: normalized.difficulty,
      duration: normalized.duration,
      weeks: normalized.weeks,
      days: normalized.days,
      schema_version: normalized.schema_version,
    });
  }

  function programVersionToken(program) {
    const snap = snapshotProgram(program);
    return machineId("pv", `${snap.id}:${snap.title}:${snap.weeks}:${snap.days.map((d) => `${d.id}:${d.exercises.map((e) => e.id).join(",")}`).join("|")}`);
  }

  /** Prefer run.program_snapshot so active/historical Runs stay stable. */
  function programForRun(libraryProgram, run) {
    if (run && run.program_snapshot && Array.isArray(run.program_snapshot.days) && run.program_snapshot.days.length) {
      try {
        return normalizeProgram({
          ...run.program_snapshot,
          id: run.program_id || run.program_snapshot.id,
          title: run.program_title || run.program_snapshot.title,
          source_path: libraryProgram && libraryProgram.source_path,
        });
      } catch (_e) {
        // fall through
      }
    }
    return libraryProgram ? normalizeProgram(libraryProgram) : null;
  }

  function createProgramRun(program, existingRuns, options = {}) {
    if ((existingRuns || []).some((run) => run.status === "active")) throw new Error("An active Program Run must be paused, completed, or abandoned first.");
    const prior = (existingRuns || []).filter((run) => run.program_id === program.id);
    const startedAt = clean(options.started_at) || nowIso();
    const snap = snapshotProgram(program);
    return {
      schema_version: "prodigy-workout-run-v1",
      run_id: clean(options.run_id) || machineId("run", `${program.id}:${startedAt}:${prior.length + 1}`),
      program_id: program.id, program_title: program.title, run_number: prior.length + 1,
      status: "active", started_at: startedAt, completed_at: "", suggested_day: program.days[0].id,
      program_version: clean(options.program_version) || programVersionToken(program),
      program_snapshot: snap,
    };
  }

  function duplicateProgram(program, options = {}) {
    const source = normalizeProgram(program);
    const title = clean(options.title) || `${source.title} (복사)`;
    const next = clone(source);
    next.id = clean(options.id) || machineId("program", `${title}:${Date.now()}`);
    next.title = title;
    next.source_path = "";
    next.source = clean(options.source) || source.source || "duplicate";
    next.days = next.days.map((day, dayIndex) => {
      const dayId = clean(options.keep_day_ids) ? day.id : `w${day.week}d${day.day}_${stableHash(`${next.id}:${dayIndex}`)}`;
      return {
        ...day,
        id: dayId,
        exercises: day.exercises.map((exercise, exerciseIndex) => ({
          ...exercise,
          id: clean(options.keep_exercise_ids) ? exercise.id : machineId("exercise", `${dayId}:${exerciseIndex}:${exercise.name}:${next.id}`),
        })),
      };
    });
    return normalizeProgram(next);
  }

  /**
   * Friendly validation before save. Never silently repairs.
   * @returns {{ ok: boolean, errors: string[] }}
   */
  function validateProgram(input) {
    const errors = [];
    const title = clean(input && input.title);
    if (!title) errors.push("프로그램 이름이 비어 있습니다.");
    const days = Array.isArray(input && input.days) ? input.days : [];
    if (!days.length) errors.push("프로그램에 Day가 없습니다.");

    const dayKeys = new Map();
    days.forEach((day, index) => {
      const week = number(day && day.week);
      const sequence = number(day && day.day);
      if (week < 1) errors.push(`${index + 1}번째 Day의 주차가 올바르지 않습니다.`);
      if (sequence < 1) errors.push(`${index + 1}번째 Day의 일차가 올바르지 않습니다.`);
      const key = `${week}:${sequence}`;
      if (week >= 1 && sequence >= 1) {
        if (dayKeys.has(key)) errors.push(`${week}주차 ${sequence}일차가 중복됩니다.`);
        else dayKeys.set(key, true);
      }
      const exercises = Array.isArray(day && day.exercises) ? day.exercises : [];
      if (!exercises.length) errors.push(`${week || "?"}주차 ${sequence || "?"}일차에 운동이 없습니다.`);
      exercises.forEach((exercise, exerciseIndex) => {
        if (!clean(exercise && exercise.name)) {
          errors.push(`${week || "?"}주차 ${sequence || "?"}일차 ${exerciseIndex + 1}번째 운동 이름이 비어 있습니다.`);
        }
        const sets = Array.isArray(exercise && exercise.prescribed_sets) ? exercise.prescribed_sets : [];
        if (!sets.length) {
          errors.push(`${clean(exercise && exercise.name) || "운동"}에 세트가 없습니다.`);
        }
      });
    });

    return { ok: errors.length === 0, errors };
  }

  /** Epley: 1RM ≈ w * (1 + r/30). Needs weight + reps ≥ 1. */
  function estimate1RM(weight, reps) {
    const w = Number(String(weight == null ? "" : weight).replace(/[^\d.]/g, ""));
    const r = Number(String(reps == null ? "" : reps).replace(/[^\d.]/g, ""));
    if (!Number.isFinite(w) || w <= 0 || !Number.isFinite(r) || r < 1) return null;
    if (r === 1) return Math.round(w * 10) / 10;
    return Math.round(w * (1 + r / 30) * 10) / 10;
  }

  function completedSetsAcrossSessions(sessions, exerciseName) {
    const name = clean(exerciseName).toLocaleLowerCase("ko-KR");
    const rows = [];
    (sessions || []).filter((session) => session && session.status === "completed").forEach((session) => {
      (session.exercise_results || []).forEach((exercise) => {
        if (clean(exercise.name).toLocaleLowerCase("ko-KR") !== name && clean(exercise.exercise_id).toLocaleLowerCase("ko-KR") !== name) return;
        (exercise.set_results || []).forEach((set) => {
          if (!set.completed) return;
          if (!clean(set.weight) && !clean(set.reps) && !clean(set.rpe)) return;
          rows.push({
            date: clean(session.date || session.completed_at).slice(0, 10),
            completed_at: clean(session.completed_at),
            session_id: clean(session.session_id),
            weight: clean(set.weight),
            reps: clean(set.reps),
            rpe: clean(set.rpe),
            notes: clean(set.notes),
            e1rm: estimate1RM(set.weight, set.reps),
          });
        });
      });
    });
    rows.sort((a, b) => clean(b.completed_at || b.date).localeCompare(clean(a.completed_at || a.date)));
    return rows;
  }

  function exerciseHistory(sessions, exerciseName, limit = 10) {
    return completedSetsAcrossSessions(sessions, exerciseName).slice(0, Math.max(1, Math.min(Number(limit) || 10, 50)));
  }

  function bestExerciseResult(sessions, exerciseName) {
    const rows = completedSetsAcrossSessions(sessions, exerciseName);
    if (!rows.length) return null;
    return rows.slice().sort((a, b) => {
      const wa = Number(String(a.weight).replace(/[^\d.]/g, "")) || 0;
      const wb = Number(String(b.weight).replace(/[^\d.]/g, "")) || 0;
      if (wb !== wa) return wb - wa;
      const ra = Number(String(a.reps).replace(/[^\d.]/g, "")) || 0;
      const rb = Number(String(b.reps).replace(/[^\d.]/g, "")) || 0;
      return rb - ra;
    })[0];
  }

  function previousExerciseResultByName(sessions, exerciseName) {
    const rows = completedSetsAcrossSessions(sessions, exerciseName);
    return rows[0] || null;
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
    for (const key of allowed) {
      if (!Object.prototype.hasOwnProperty.call(patch || {}, key)) continue;
      exercise.set_results[setIndex][key] = key === "completed" ? Boolean(patch[key]) : clean(patch[key]);
    }
    exercise.completed = exercise.set_results.length > 0 && exercise.set_results.every((set) => set.completed);
    return next;
  }

  function recomputeExerciseCompleted(exercise) {
    if (!exercise) return;
    const sets = exercise.set_results || [];
    exercise.completed = sets.length > 0 && sets.every((set) => set.completed);
  }

  /**
   * Append one set to an exercise (session draft only).
   * Copies last set weight/reps as soft defaults when present — never auto-completes.
   */
  function addSetResult(session, exerciseId, options) {
    const opts = options || {};
    const next = clone(session);
    const exercise = (next.exercise_results || []).find((item) => item.exercise_id === exerciseId);
    if (!exercise) throw new Error("Exercise was not found.");
    if (!Array.isArray(exercise.set_results)) exercise.set_results = [];
    const last = exercise.set_results.length
      ? exercise.set_results[exercise.set_results.length - 1]
      : null;
    const prescribed = (exercise.prescribed_sets && exercise.prescribed_sets[0]) || { id: machineId("set", `${exerciseId}:extra`) };
    const blank = blankSetResult({
      id: machineId("set", `${exerciseId}:${exercise.set_results.length + 1}:${Date.now()}`)
    });
    // Soft carry: last logged numbers help drop sets; user can clear.
    if (opts.copy_last !== false && last) {
      blank.weight = clean(last.weight);
      blank.reps = clean(last.reps);
      // do not copy completed / rpe / notes by default
    } else if (opts.weight != null || opts.reps != null) {
      blank.weight = clean(opts.weight);
      blank.reps = clean(opts.reps);
      blank.rpe = clean(opts.rpe);
    } else if (prescribed && prescribed.reps) {
      blank.reps = clean(prescribed.reps);
    }
    exercise.set_results.push(blank);
    recomputeExerciseCompleted(exercise);
    return next;
  }

  /** Remove one set by index. Allows zero sets remaining. */
  function removeSetResult(session, exerciseId, setIndex) {
    const next = clone(session);
    const exercise = (next.exercise_results || []).find((item) => item.exercise_id === exerciseId);
    if (!exercise || !Array.isArray(exercise.set_results)) throw new Error("Set Result was not found.");
    const index = Number(setIndex);
    if (!Number.isInteger(index) || index < 0 || index >= exercise.set_results.length) {
      throw new Error("Set Result was not found.");
    }
    exercise.set_results.splice(index, 1);
    recomputeExerciseCompleted(exercise);
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

  function dayLabel(dayOrSession) {
    if (!dayOrSession) return "";
    if (dayOrSession.week != null && dayOrSession.day != null) {
      return `${dayOrSession.week}주차 ${dayOrSession.day}일차`;
    }
    return clean(dayOrSession.label);
  }

  /** Progress of a Program Run against program days (completed sessions only). */
  function runProgress(program, sessions, runId) {
    const days = (program && Array.isArray(program.days)) ? program.days : [];
    const total = days.length;
    const completed = completedDayIds(sessions, runId);
    let done = 0;
    days.forEach((day) => { if (completed.has(day.id)) done += 1; });
    const nextId = total ? suggestNextDay(program, sessions, runId) : "";
    const nextDay = days.find((day) => day.id === nextId) || null;
    return {
      total,
      completed: done,
      remaining: Math.max(0, total - done),
      ratio: total ? done / total : 0,
      percent: total ? Math.round((done / total) * 100) : 0,
      next_day_id: nextId || "",
      next_label: nextDay ? dayLabel(nextDay) : (done >= total && total > 0 ? "프로그램 완료" : ""),
      label: total ? `${done}/${total} Day` : "0/0 Day"
    };
  }

  function applyPreviousToSet(session, exerciseId, setIndex, previous) {
    if (!previous) return session;
    return updateSetResult(session, exerciseId, setIndex, {
      weight: clean(previous.weight),
      reps: clean(previous.reps),
      rpe: clean(previous.rpe)
    });
  }

  /** Fill all sets of an exercise from a previous result (no auto-complete). */
  function applyPreviousToExercise(session, exerciseId, previous) {
    if (!previous) return session;
    const exercise = (session.exercise_results || []).find((item) => item.exercise_id === exerciseId);
    if (!exercise) return session;
    let next = session;
    (exercise.set_results || []).forEach((_set, index) => {
      next = applyPreviousToSet(next, exerciseId, index, previous);
    });
    return next;
  }

  function listDraftSessions(sessions) {
    return (sessions || [])
      .filter((session) => session && session.status === "draft")
      .slice()
      .sort((a, b) => clean(b.started_at || b.date).localeCompare(clean(a.started_at || a.date)))
      .map((session) => ({
        session_id: clean(session.session_id),
        program_run_id: clean(session.program_run_id),
        program_title: clean(session.program_title),
        program_day_id: clean(session.program_day_id),
        label: dayLabel(session) || clean(session.title) || "초안 세션",
        date: clean(session.date).slice(0, 10),
        started_at: clean(session.started_at),
        quick: !!session.quick,
        reason: "미완료 세션 초안"
      }));
  }

  function daysBetweenIso(iso, now) {
    const text = clean(iso).slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return null;
    const then = new Date(`${text}T00:00:00`);
    const base = now instanceof Date ? now : new Date();
    if (Number.isNaN(then.getTime())) return null;
    return Math.floor((Date.UTC(base.getFullYear(), base.getMonth(), base.getDate()) - Date.UTC(then.getFullYear(), then.getMonth(), then.getDate())) / 86400000);
  }

  /**
   * Active/paused runs with no recent completed session.
   * Uses only stored dates — never invents last_contact-style guesses.
   */
  function listStaleRuns(runs, sessions, options) {
    const opts = options || {};
    const staleDays = Math.max(1, Number(opts.stale_days) || 7);
    const now = opts.now instanceof Date ? opts.now : new Date();
    const items = [];
    (runs || []).forEach((run) => {
      if (!run) return;
      const status = clean(run.status);
      if (status !== "active" && status !== "paused") return;
      const related = (sessions || []).filter((s) => s && s.program_run_id === run.run_id && s.status === "completed");
      related.sort((a, b) => clean(b.completed_at || b.date).localeCompare(clean(a.completed_at || a.date)));
      const last = related[0];
      const anchor = last
        ? clean(last.completed_at || last.date)
        : clean(run.started_at);
      const age = daysBetweenIso(anchor, now);
      if (age == null || age < staleDays) return;
      items.push({
        run_id: clean(run.run_id),
        program_id: clean(run.program_id),
        program_title: clean(run.program_title),
        status,
        run_number: run.run_number,
        age_days: age,
        last_activity: clean(anchor).slice(0, 10),
        reason: last
          ? `${age}일 동안 완료 세션 없음`
          : `시작 후 ${age}일 · 완료 세션 없음`
      });
    });
    items.sort((a, b) => (b.age_days || 0) - (a.age_days || 0));
    return items;
  }

  function sessionSetSummary(session) {
    let sets = 0;
    let done = 0;
    (session && session.exercise_results || []).forEach((ex) => {
      (ex.set_results || []).forEach((set) => {
        sets += 1;
        if (set.completed) done += 1;
      });
    });
    return { sets, done, label: sets ? `${done}/${sets} 세트` : "" };
  }

  function completedSessionTimeline(sessions, limit) {
    const max = Math.max(1, Math.min(Number(limit) || 12, 40));
    return (sessions || [])
      .filter((session) => session && session.status === "completed")
      .slice()
      .sort((a, b) => clean(b.completed_at || b.date).localeCompare(clean(a.completed_at || a.date)))
      .slice(0, max)
      .map((session) => {
        const summary = sessionSetSummary(session);
        return {
          session_id: clean(session.session_id),
          title: session.quick
            ? (clean(session.title) || "빠른 운동")
            : `${clean(session.program_title)} · ${dayLabel(session)}`,
          date: clean(session.completed_at || session.date).slice(0, 10),
          quick: !!session.quick,
          program_title: clean(session.program_title),
          label: dayLabel(session),
          sets_label: summary.label,
          distance: clean(session.distance),
          duration: clean(session.duration)
        };
      });
  }

  /**
   * Shared hub/dashboard model — one place for continue / progress / queues.
   * Does not recompute Object Engine lifecycle; only Workout execution state.
   */
  function buildWorkspaceModel(input) {
    const state = input || {};
    const program = state.activeProgram || null;
    const run = state.activeRun || null;
    const sessions = state.sessions || [];
    const draft = state.draft || null;
    const drafts = listDraftSessions(sessions);
    const progress = run && program
      ? runProgress(program, sessions, run.run_id)
      : { total: 0, completed: 0, remaining: 0, ratio: 0, percent: 0, next_day_id: "", next_label: "", label: "0/0 Day" };
    const stale = listStaleRuns(state.runs || [], sessions, state.staleOptions || {});
    const timeline = completedSessionTimeline(sessions, state.timelineLimit || 12);

    let cont = null;
    if (draft) {
      cont = {
        empty: false,
        kind: "resume_draft",
        title: clean(draft.program_title) || "진행 중 세션",
        action: "이어서 기록",
        detail: dayLabel(draft) || clean(draft.title) || "",
        reason: "미완료 세션 초안",
        day_id: clean(draft.program_day_id),
        session_id: clean(draft.session_id),
        progress_label: progress.label
      };
    } else if (run && program) {
      const dayId = progress.next_day_id || clean(run.suggested_day);
      const day = (program.days || []).find((d) => d.id === dayId) || null;
      cont = {
        empty: false,
        kind: day ? "start_day" : "run_done",
        title: clean(program.title) || clean(run.program_title),
        action: day ? "오늘 운동 시작" : "프로그램 완료 정리",
        detail: day ? dayLabel(day) : "모든 Day 완료",
        reason: day ? "제안된 다음 Program Day" : "실행 완료 가능",
        day_id: dayId || "",
        session_id: "",
        progress_label: progress.label
      };
    } else {
      cont = {
        empty: true,
        kind: "none",
        title: "",
        action: "",
        detail: "",
        reason: null,
        message: "진행 중인 프로그램이 없습니다."
      };
    }

    return Object.freeze({
      schema_version: "prodigy-workout-workspace-v1",
      continue_target: cont,
      progress,
      drafts,
      stale_runs: stale,
      timeline,
      active_run: run,
      active_program: program
    });
  }

  // ─── Session Focus Primitives (Todo 10) ─────────────────────────────

  /**
   * Find the next incomplete set across all exercises in a draft session.
   * Returns { exercise_id, set_index } or null if all complete.
   */
  function nextIncompleteSet(session) {
    for (const exercise of (session.exercise_results || [])) {
      for (let i = 0; i < (exercise.set_results || []).length; i++) {
        if (!exercise.set_results[i].completed) {
          return { exercise_id: exercise.exercise_id, set_index: i, exercise_name: exercise.name };
        }
      }
    }
    return null;
  }

  /**
   * Resolve rest seconds for a set: prescribed rest wins, else 90s default.
   * Prescribed rest formats: "90", "90s", "1:30", "2분"
   */
  function resolveRestSeconds(prescribedSet) {
    if (!prescribedSet) return 90;
    const raw = clean(prescribedSet.rest);
    if (!raw) return 90;
    // "1:30" format
    const colonMatch = raw.match(/^(\d+):(\d+)$/);
    if (colonMatch) return Number(colonMatch[1]) * 60 + Number(colonMatch[2]);
    // "2분" or "2min"
    const minMatch = raw.match(/^([\d.]+)\s*(?:분|min|m)$/i);
    if (minMatch) return Math.round(Number(minMatch[1]) * 60);
    // "90s" or "90" or "90초"
    const secMatch = raw.match(/^([\d.]+)\s*(?:초|s|sec)?$/i);
    if (secMatch) return Math.round(Number(secMatch[1]));
    return 90;
  }

  /**
   * Session progress: completed sets / total sets.
   */
  function sessionProgress(session) {
    let total = 0;
    let done = 0;
    for (const exercise of (session.exercise_results || [])) {
      for (const set of (exercise.set_results || [])) {
        total++;
        if (set.completed) done++;
      }
    }
    return { total, done, ratio: total ? done / total : 0, percent: total ? Math.round((done / total) * 100) : 0 };
  }

  // ─── Workout v2: Event-driven Rest Timer (Todo 10) ────────────────────
  // The timer is EVENT-DRIVEN: it records discrete lifecycle events
  // (start / adjust / pause / resume / complete / skip) and computes the
  // remaining time from wall-clock deltas on demand. It NEVER writes state
  // every second — the UI polls `remaining()` for display only.

  /**
   * Create an event-driven rest timer. No intervals, no per-second writes.
   * @param {object} [options]
   * @param {number} [options.default_seconds=90]
   * @param {function} [options.now] injectable clock for deterministic tests
   */
  function createRestTimer(options) {
    const opts = options || {};
    const nowFn = typeof opts.now === "function" ? opts.now : () => Date.now();
    const defaultSeconds = Math.max(1, Number(opts.default_seconds) || 90);
    let state = "idle"; // idle | running | paused | done
    let totalMs = 0;
    let startedAt = 0; // wall-clock ms when current running segment began
    let accumulatedMs = 0; // elapsed ms accumulated across paused segments
    let writeCount = 0; // counts discrete state-mutation events (NOT ticks)
    const events = [];

    function record(type, detail) {
      writeCount += 1;
      events.push(Object.freeze({ type, at: nowFn(), detail: detail || null }));
    }

    function elapsedMs() {
      if (state === "running") return accumulatedMs + (nowFn() - startedAt);
      return accumulatedMs;
    }

    return {
      get state() { return state; },
      /** Number of discrete state-mutation events (writes). Bounded by user actions, never by seconds. */
      get writeCount() { return writeCount; },
      get events() { return events.slice(); },
      get totalSeconds() { return Math.round(totalMs / 1000); },

      /** Begin a rest period. One write event. */
      start(seconds) {
        const secs = Math.max(1, Number(seconds) || defaultSeconds);
        totalMs = secs * 1000;
        accumulatedMs = 0;
        startedAt = nowFn();
        state = "running";
        record("start", { seconds: secs });
        return this;
      },

      /** Adjust remaining time by deltaSeconds (e.g. +30 / -30). One write event. */
      adjust(deltaSeconds) {
        if (state === "idle" || state === "done") return this;
        const deltaMs = (Number(deltaSeconds) || 0) * 1000;
        totalMs = Math.max(1000, totalMs + deltaMs);
        record("adjust", { delta_seconds: Number(deltaSeconds) || 0 });
        return this;
      },

      pause() {
        if (state !== "running") return this;
        accumulatedMs = elapsedMs();
        state = "paused";
        record("pause", null);
        return this;
      },

      resume() {
        if (state !== "paused") return this;
        startedAt = nowFn();
        state = "running";
        record("resume", null);
        return this;
      },

      /** User skips the rest. One write event. */
      skip() {
        if (state === "idle" || state === "done") return this;
        accumulatedMs = totalMs;
        state = "done";
        record("skip", null);
        return this;
      },

      /** Mark rest complete (naturally or by user). One write event. */
      complete() {
        if (state === "idle" || state === "done") return this;
        accumulatedMs = totalMs;
        state = "done";
        record("complete", null);
        return this;
      },

      reset() {
        state = "idle";
        totalMs = 0;
        accumulatedMs = 0;
        startedAt = 0;
        record("reset", null);
        return this;
      },

      /**
       * Remaining seconds, computed on demand from the clock.
       * READ-ONLY — does not count as a write and does not mutate state.
       */
      remaining() {
        if (state === "idle") return 0;
        if (state === "done") return 0;
        const ms = Math.max(0, totalMs - elapsedMs());
        return Math.ceil(ms / 1000);
      },

      /** True when the rest period has elapsed (display cue only). */
      isFinished() {
        if (state === "done") return true;
        if (state === "idle") return false;
        return elapsedMs() >= totalMs;
      },
    };
  }

  // ─── Workout v2: Six-turn Nonpersistent AI Interaction (Todo 10) ──────
  // The conversation lives ONLY in memory. It is never written to the store
  // or to any Object. Saving an insight requires an EXPLICIT saveObservation()
  // call — there is no auto-save path.

  const AI_MAX_TURNS = 6;

  /**
   * Create a bounded, nonpersistent AI conversation.
   * @param {object} [options]
   * @param {number} [options.max_turns=6]
   * @param {function} [options.responder] (messages, context) => string — pluggable
   *        reply source. Defaults to a deterministic local echo so tests run offline.
   */
  function createAiConversation(options) {
    const opts = options || {};
    const maxTurns = Math.max(1, Math.min(Number(opts.max_turns) || AI_MAX_TURNS, AI_MAX_TURNS));
    const responder = typeof opts.responder === "function"
      ? opts.responder
      : (messages) => `코치 응답 (${messages.length}번째 메시지)`;
    const messages = []; // { role: "user"|"assistant", text }
    let persisted = false;

    return {
      get maxTurns() { return maxTurns; },
      get turnsUsed() { return messages.filter((m) => m.role === "user").length; },
      get isExhausted() { return this.turnsUsed >= maxTurns; },
      get isPersisted() { return persisted; },
      get transcript() { return messages.slice(); },

      /**
       * Send a user turn and receive an assistant reply.
       * Rejects once the turn budget is exhausted. Never persists.
       */
      send(text) {
        const body = clean(text);
        if (!body) throw new Error("메시지를 입력해 주세요.");
        if (this.turnsUsed >= maxTurns) {
          throw new Error(`AI 대화는 최대 ${maxTurns}회까지 가능합니다. 관측 저장은 별도로 실행하세요.`);
        }
        messages.push({ role: "user", text: body });
        const reply = clean(responder(messages.slice(), opts.context));
        messages.push({ role: "assistant", text: reply });
        return reply;
      },

      /**
       * Explicitly mark that the user chose to persist an observation.
       * This is the ONLY persistence gate — it never fires automatically.
       * Returns the payload the caller should hand to the store writer.
       */
      buildObservation(extra) {
        return Object.freeze({
          kind: "ai_observation",
          turns_used: this.turnsUsed,
          transcript: messages.slice(),
          note: clean(extra && extra.note),
          created_at: clean(extra && extra.created_at) || nowIso(),
        });
      },

      /** Record that an explicit save happened (caller performs the real write). */
      markPersisted() { persisted = true; return this; },
    };
  }

  // ─── Workout v2: Explicit Observation Save (Todo 10) ──────────────────

  /**
   * Build an observation record for explicit save. Pure — returns a frozen
   * object; the caller decides whether/where to write it. There is no
   * auto-save: this only shapes the payload.
   */
  function buildObservation(session, note, options) {
    const opts = options || {};
    const text = clean(note);
    if (!text) throw new Error("관측 내용을 입력해 주세요.");
    return Object.freeze({
      schema_version: "prodigy-workout-observation-v1",
      observation_id: clean(opts.observation_id) || machineId("obs", `${session ? session.session_id : "quick"}:${text}:${nowIso()}`),
      session_id: session ? clean(session.session_id) : "",
      note: text,
      kind: clean(opts.kind) || "general",
      created_at: clean(opts.created_at) || nowIso(),
      explicit: true,
    });
  }

  /**
   * Guard: observations may only be attached to draft sessions or standalone.
   * Completed sessions and active runs are immutable here.
   */
  function assertObservationAllowed(session) {
    if (session && clean(session.status) === "completed") {
      throw new Error("완료된 세션에는 관측을 추가할 수 없습니다.");
    }
    return true;
  }

  const api = {
    RUN_STATUSES, clone, completeWorkoutSession, createProgramRun, createQuickWorkout, createWorkoutSession,
    daySelectionWarning, normalizeProgram, previousExerciseResult, previousExerciseResultByName,
    bestExerciseResult, exerciseHistory, estimate1RM, validateProgram, duplicateProgram,
    snapshotProgram, programVersionToken, programForRun, stableHash, suggestNextDay,
    transitionProgramRun, updateSetResult, addSetResult, removeSetResult,
    dayLabel, runProgress, applyPreviousToSet, applyPreviousToExercise,
    listDraftSessions, listStaleRuns, daysBetweenIso, sessionSetSummary,
    completedSessionTimeline, buildWorkspaceModel, completedDayIds,
    nextIncompleteSet, resolveRestSeconds, sessionProgress,
    createRestTimer, createAiConversation, buildObservation, assertObservationAllowed,
    AI_MAX_TURNS,
  };
  root.WorkoutCore = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
