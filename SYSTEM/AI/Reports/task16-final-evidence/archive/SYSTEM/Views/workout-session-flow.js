(function (root) {
  "use strict";

  const core = root.WorkoutCore || (typeof require === "function" ? require("./workout-core.js") : null);
  const objects = root.WorkoutProgramObjects || (typeof require === "function" ? require("./workout-program-objects.js") : null);
  const modals = root.WorkoutModals || (typeof require === "function" ? require("./workout-modals.js") : null);
  const WEEKDAYS = Object.freeze(["월", "화", "수", "목", "금", "토", "일"]);
  const KIND_LABELS = Object.freeze({ programmed: "프로그램", free: "자유운동", quick: "빠른 기록" });

  class FallbackModal {
    constructor(app) { this.app = app; this.contentEl = root.document ? root.document.createElement("div") : null; }
    open() { if (typeof this.onOpen === "function") this.onOpen(); }
    close() { if (typeof this.onClose === "function") this.onClose(); }
  }
  const ModalBase = root.obsidian && root.obsidian.Modal ? root.obsidian.Modal : FallbackModal;

  function clean(value) { return String(value == null ? "" : value).trim(); }
  function button(parent, label, primary = false) {
    return parent.createEl("button", { text: label, attr: { type: "button", class: primary ? "mod-cta workout-button" : "workout-button" } });
  }
  function kindLabel(session) { return KIND_LABELS[core.normalizeSessionKind(session)] || KIND_LABELS.quick; }
  function scheduleLabel(day) {
    const weekday = WEEKDAYS[Number(day && day.day) - 1];
    return `${Number(day && day.week) || 1}주차 ${weekday ? `${weekday}요일` : `${Number(day && day.day) || 1}일차`}`;
  }
  function assignProgramDay(program, dayId, week, weekday) {
    const next = core.clone(program);
    const day = (next.days || []).find((item) => item.id === dayId);
    const parsedWeek = Number(week);
    const parsedWeekday = Number(weekday);
    if (!day) throw new Error("Program Day를 찾을 수 없습니다.");
    if (!Number.isInteger(parsedWeek) || parsedWeek < 1) throw new Error("주차는 1 이상이어야 합니다.");
    if (!Number.isInteger(parsedWeekday) || parsedWeekday < 1 || parsedWeekday > 7) throw new Error("요일은 월요일부터 일요일 사이여야 합니다.");
    day.week = parsedWeek;
    day.day = parsedWeekday;
    day.label = scheduleLabel(day);
    return core.normalizeProgram(next);
  }
  function queryProgramDays(program, week, weekday) {
    return core.normalizeProgram(program).days.filter((day) => day.week === Number(week) && day.day === Number(weekday));
  }

  function freeExerciseResult(exercise, seed = "free") {
    const name = clean(exercise && exercise.name);
    if (!name) throw new Error("운동 이름이 필요합니다.");
    const exerciseId = clean(exercise.id) || `exercise_${core.stableHash(`${seed}:${name}`)}`;
    const setId = `set_${core.stableHash(`${exerciseId}:1`)}`;
    return {
      exercise_id: exerciseId,
      name,
      target: clean(exercise.target),
      prescribed_sets: [{ id: setId, reps: "", rpe: "", target: "", rest: "" }],
      set_results: [{ set_id: setId, completed: false, weight: "", reps: "", rpe: "", notes: "" }],
      notes: "",
      completed: false,
    };
  }
  function assertFreeDraft(session) {
    if (core.normalizeSessionKind(session) !== "free" || session.status !== "draft") throw new Error("자유운동 초안만 구성할 수 있습니다.");
  }
  function addFreeExercise(session, exercise) {
    assertFreeDraft(session);
    const next = core.clone(session);
    const result = freeExerciseResult(exercise, session.session_id);
    if (next.exercise_results.some((item) => item.exercise_id === result.exercise_id || item.name === result.name)) throw new Error("이미 추가한 운동입니다.");
    next.exercise_results.push(result);
    return next;
  }
  function removeFreeExercise(session, exerciseId) {
    assertFreeDraft(session);
    const next = core.clone(session);
    const index = next.exercise_results.findIndex((item) => item.exercise_id === exerciseId);
    if (index < 0) throw new Error("운동을 찾을 수 없습니다.");
    next.exercise_results.splice(index, 1);
    return next;
  }
  function moveFreeExercise(session, exerciseId, offset) {
    assertFreeDraft(session);
    const next = core.clone(session);
    const index = next.exercise_results.findIndex((item) => item.exercise_id === exerciseId);
    const target = index + Number(offset);
    if (index < 0) throw new Error("운동을 찾을 수 없습니다.");
    if (target < 0 || target >= next.exercise_results.length) return next;
    const [item] = next.exercise_results.splice(index, 1);
    next.exercise_results.splice(target, 0, item);
    return next;
  }

  function activeStrengthDraft(sessions, excludeId = "") {
    const drafts = (sessions || []).filter((session) => session && session.status === "draft"
      && core.normalizeSessionKind(session) !== "quick" && session.session_id !== excludeId);
    return drafts.find((session) => session.runner_active === true)
      || drafts.sort((left, right) => clean(right.started_at || right.date).localeCompare(clean(left.started_at || left.date)))[0]
      || null;
  }
  async function resolveDraftConflict(state, candidate, decision) {
    const current = activeStrengthDraft(state.sessions, candidate.session_id);
    if (!current) {
      const next = { ...candidate, runner_active: true };
      await state.store.saveSession(next);
      return { action: "started", session: next };
    }
    if (decision === "cancel") return { action: "cancelled", session: current };
    if (decision === "resume") return { action: "resumed", session: current };
    if (decision === "preserve") await state.store.saveSession({ ...current, runner_active: false });
    else if (decision === "discard") await state.store.deleteDerived("sessions", current.session_id);
    else return { action: "conflict", session: current };
    const next = { ...candidate, runner_active: true };
    await state.store.saveSession(next);
    return { action: "started", session: next };
  }
  async function activateDraft(state, sessionId) {
    const drafts = (state.sessions || []).filter((session) => session && session.status === "draft" && core.normalizeSessionKind(session) !== "quick");
    if (!drafts.some((session) => session.session_id === sessionId)) throw new Error("초안을 찾을 수 없습니다.");
    for (const draft of drafts) await state.store.saveSession({ ...draft, runner_active: draft.session_id === sessionId });
  }
  function recordSubstitution(before, after, exerciseId, changedAt = new Date().toISOString()) {
    const prior = (before.exercise_results || []).find((item) => item.exercise_id === exerciseId);
    const current = (after.exercise_results || []).find((item) => item.exercise_id === exerciseId);
    if (!prior || !current) throw new Error("교체 운동을 찾을 수 없습니다.");
    const next = core.clone(after);
    next.exercise_substitutions = [...(next.exercise_substitutions || []), {
      exercise_id: exerciseId,
      before: { name: clean(prior.name), target: clean(prior.target) },
      after: { name: clean(current.name), target: clean(current.target) },
      changed_at: changedAt,
    }];
    return next;
  }
  function substitutionText(session) {
    return (session.exercise_substitutions || []).map((item) => `${item.before.name} → ${item.after.name}`).join(" · ");
  }

  class DraftConflictModal extends ModalBase {
    constructor(app, state, candidate, refresh) { super(app); this.state = state; this.candidate = candidate; this.refresh = refresh; }
    onOpen() {
      this.contentEl.addClass("workout-modal");
      this.contentEl.createEl("h2", { text: "진행 중인 근력 세션" });
      this.contentEl.createEl("p", { text: "한 번에 하나의 세션만 기록할 수 있습니다. 기존 초안을 어떻게 처리할지 선택하세요." });
      const actions = this.contentEl.createDiv({ attr: { class: "workout-modal-actions" } });
      const choose = (decision) => async () => { await resolveDraftConflict(this.state, this.candidate, decision); this.close(); await this.refresh(); };
      button(actions, "기존 초안 이어하기", true).onclick = choose("resume");
      button(actions, "초안 보관 후 새로 시작").onclick = choose("preserve");
      button(actions, "초안 버리고 새로 시작").onclick = choose("discard");
      button(actions, "취소").onclick = choose("cancel");
    }
  }
  async function startDraft(app, state, candidate, refresh) {
    if (activeStrengthDraft(state.sessions, candidate.session_id)) return new DraftConflictModal(app, state, candidate, refresh).open();
    await resolveDraftConflict(state, candidate, "start");
    await refresh();
  }

  class FreeWorkoutModal extends ModalBase {
    constructor(app, state, refresh) { super(app); this.state = state; this.refresh = refresh; this.selected = []; }
    onOpen() {
      this.contentEl.addClass("workout-modal");
      this.contentEl.createEl("h2", { text: "자유운동 구성" });
      const title = this.contentEl.createEl("input", { attr: { type: "text", placeholder: "자유운동 이름", "aria-label": "자유운동 이름" } });
      const search = this.contentEl.createEl("input", { attr: { type: "search", placeholder: "운동 라이브러리 검색", "aria-label": "운동 검색" } });
      const results = this.contentEl.createDiv({ attr: { class: "workout-inline-actions" } });
      const selected = this.contentEl.createDiv();
      const paintSelected = () => {
        selected.empty();
        this.selected.forEach((exercise, index) => {
          const row = selected.createDiv({ attr: { class: "workout-history-row" } });
          row.createEl("strong", { text: exercise.name });
          const controls = row.createDiv({ attr: { class: "workout-inline-actions" } });
          button(controls, "위로").onclick = () => { if (index > 0) [this.selected[index - 1], this.selected[index]] = [this.selected[index], this.selected[index - 1]]; paintSelected(); };
          button(controls, "아래로").onclick = () => { if (index + 1 < this.selected.length) [this.selected[index + 1], this.selected[index]] = [this.selected[index], this.selected[index + 1]]; paintSelected(); };
          button(controls, "삭제").onclick = () => { this.selected.splice(index, 1); paintSelected(); };
        });
      };
      const paintResults = () => {
        results.empty();
        (objects.searchExercises ? objects.searchExercises(this.app, search.value, 8, {}) : []).forEach((exercise) => {
          button(results, `추가 · ${exercise.name}`).onclick = () => { if (!this.selected.some((item) => item.name === exercise.name)) this.selected.push(exercise); paintSelected(); };
        });
      };
      search.oninput = paintResults;
      paintResults();
      const actions = this.contentEl.createDiv({ attr: { class: "workout-modal-actions" } });
      button(actions, "취소").onclick = () => this.close();
      button(actions, "자유운동 시작", true).onclick = async () => {
        try {
          let session = core.createFreeWorkout({ title: title.value, session_id: `session_${Date.now().toString(36)}` });
          for (const exercise of this.selected) session = addFreeExercise(session, exercise);
          if (!session.exercise_results.length) throw new Error("운동을 하나 이상 추가해 주세요.");
          this.close();
          await startDraft(this.app, this.state, session, this.refresh);
        } catch (error) { const Notice = root.obsidian && root.obsidian.Notice; if (Notice) new Notice(error.message); }
      };
    }
  }

  function createViewController(options = {}) {
    const scope = options.mountScope && typeof options.mountScope.track === "function" ? options.mountScope : null;
    const timerHost = options.timerHost || root;
    let disposed = false;
    let shell = null;
    let timerId = null;

    function clearRestTimer() {
      if (timerId === null) return;
      if (scope && typeof scope.clearInterval === "function") scope.clearInterval(timerId);
      else if (timerHost && typeof timerHost.clearInterval === "function") timerHost.clearInterval(timerId);
      timerId = null;
    }

    function startRestTimer(callback, delay) {
      clearRestTimer();
      if (disposed || typeof callback !== "function") return null;
      const guarded = () => { if (!disposed) callback(); };
      timerId = scope && typeof scope.setInterval === "function"
        ? scope.setInterval(guarded, delay)
        : timerHost.setInterval(guarded, delay);
      return timerId;
    }

    function replaceShell(next) {
      if (shell && shell !== next && typeof shell.dispose === "function") shell.dispose();
      shell = next || null;
      if (disposed && shell && typeof shell.dispose === "function") {
        shell.dispose();
        shell = null;
      }
      return shell;
    }

    function dispose() {
      if (disposed) return false;
      disposed = true;
      clearRestTimer();
      if (shell && typeof shell.dispose === "function") shell.dispose();
      shell = null;
      return true;
    }

    const controller = {
      clearRestTimer,
      startRestTimer,
      replaceShell,
      dispose,
      isActive: () => !disposed,
      isDisposed: () => disposed,
      openTab: (tabId) => { if (!disposed && shell && typeof shell.openTab === "function") shell.openTab(tabId); },
    };
    if (scope) scope.track(dispose);
    return Object.freeze(controller);
  }

  const api = {
    WEEKDAYS, kindLabel, scheduleLabel, assignProgramDay, queryProgramDays,
    freeExerciseResult, addFreeExercise, removeFreeExercise, moveFreeExercise,
    activeStrengthDraft, resolveDraftConflict, activateDraft, recordSubstitution, substitutionText,
    DraftConflictModal, FreeWorkoutModal, startDraft, createViewController,
  };
  root.WorkoutSessionFlow = Object.freeze(api);
  if (typeof module !== "undefined" && module.exports) module.exports = root.WorkoutSessionFlow;
})(typeof globalThis !== "undefined" ? globalThis : this);
