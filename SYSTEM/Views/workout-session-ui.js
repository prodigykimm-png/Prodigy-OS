(function (root) {
  "use strict";

  const core = root.WorkoutCore || (typeof require === "function" ? require("./workout-core.js") : null);
  const objects = root.WorkoutProgramObjects || (typeof require === "function" ? require("./workout-program-objects.js") : null);
  const modals = root.WorkoutModals || (typeof require === "function" ? require("./workout-modals.js") : null);
  const flow = root.WorkoutSessionFlow || (typeof require === "function" ? require("./workout-session-flow.js") : null);

  function button(parent, label, primary = false) {
    return parent.createEl("button", { text: label, attr: { type: "button", class: primary ? "mod-cta workout-button" : "workout-button" } });
  }
  function notice(message) {
    const Notice = root.obsidian && root.obsidian.Notice ? root.obsidian.Notice : root.Notice;
    if (Notice) new Notice(message);
  }
  function renderEntryPaths(parent, options) {
    const { app, state, refresh, startProgram, resumeRunner, quickLabel } = options;
    const area = parent.createDiv({ attr: { class: "workout-section" } });
    area.createEl("h2", { text: "운동 시작" });
    area.createEl("p", { text: "프로그램 · 자유운동 · 빠른 기록", attr: { class: "workout-section-copy" } });
    const grid = area.createDiv({ attr: { class: "workout-start-grid" } });

    const programCard = grid.createDiv({ attr: { class: "workout-start-path" } });
    programCard.createEl("h3", { text: "프로그램" });
    if (state.activeRun) {
      programCard.createEl("p", { text: state.activeProgram ? state.activeProgram.title : state.activeRun.program_title, attr: { class: "workout-muted" } });
      button(programCard, "프로그램 이어하기", true).onclick = resumeRunner;
    } else if (state.programs.length) {
      const select = programCard.createEl("select", { attr: { "aria-label": "시작할 프로그램" } });
      state.programs.forEach((program) => select.createEl("option", { text: program.title, value: program.id }));
      button(programCard, "프로그램 시작", true).onclick = () => startProgram(state.programs.find((program) => program.id === select.value) || state.programs[0]);
    } else {
      programCard.createEl("p", { text: "먼저 프로그램을 추가하세요.", attr: { class: "workout-muted" } });
      button(programCard, "프로그램 시작").disabled = true;
    }

    const freeCard = grid.createDiv({ attr: { class: "workout-start-path" } });
    freeCard.createEl("h3", { text: "자유운동" });
    freeCard.createEl("p", { text: "운동을 골라 세트 실행기로 기록", attr: { class: "workout-muted" } });
    button(freeCard, "자유운동 구성", true).onclick = () => new flow.FreeWorkoutModal(app, state, refresh).open();

    const quickCard = grid.createDiv({ attr: { class: "workout-start-path" } });
    quickCard.createEl("h3", { text: quickLabel });
    quickCard.createEl("p", { text: "거리·시간·메모만 최소 기록", attr: { class: "workout-muted" } });
    button(quickCard, "빠른 기록", true).onclick = () => new modals.QuickWorkoutModal(app, refresh).open();
  }

  function renderScheduleAccess(area, state, openEditor) {
    if (!state.programs.length) {
      area.createEl("p", { text: "프로그램을 추가하면 주차·요일을 배정할 수 있습니다.", attr: { class: "workout-empty" } });
      return;
    }
    const chooser = area.createDiv({ attr: { class: "workout-day-chooser" } });
    const select = chooser.createEl("select", { attr: { "aria-label": "배정할 프로그램" } });
    state.programs.forEach((program) => select.createEl("option", { text: program.title, value: program.id }));
    const schedule = area.createEl("p", { attr: { class: "workout-muted" } });
    const paint = () => {
      const program = state.programs.find((item) => item.id === select.value) || state.programs[0];
      schedule.textContent = program.days.map(flow.scheduleLabel).join(" · ");
    };
    select.onchange = paint;
    paint();
    button(chooser, "주차·요일 배정", true).onclick = () => openEditor(state.programs.find((program) => program.id === select.value) || state.programs[0]);
  }

  function renderFreeDraftTools(parent, options) {
    const { app, state, session, refresh } = options;
    if (core.normalizeSessionKind(session) !== "free") return;
    const wrap = parent.createDiv({ attr: { class: "workout-day-chooser" } });
    const input = wrap.createEl("input", { attr: { type: "search", placeholder: "운동 라이브러리 검색·추가", "aria-label": "자유운동 운동 추가" } });
    const listId = `free-exercise-${session.session_id}`;
    const choices = wrap.createEl("datalist", { attr: { id: listId } });
    input.setAttribute && input.setAttribute("list", listId);
    const paint = () => {
      choices.empty();
      (objects.searchExercises ? objects.searchExercises(app, input.value, 20, {}) : []).forEach((exercise) => choices.createEl("option", { attr: { value: exercise.name } }));
    };
    input.oninput = paint;
    paint();
    button(wrap, "운동 추가", true).onclick = async () => {
      try {
        const found = (objects.searchExercises ? objects.searchExercises(app, input.value, 20, {}) : []).find((exercise) => exercise.name === String(input.value || "").trim());
        if (!found) throw new Error("라이브러리에서 운동을 선택해 주세요.");
        const next = flow.addFreeExercise(session, found);
        Object.assign(session, next);
        await state.store.saveSession(next);
        await refresh();
      } catch (error) { notice(error.message || "운동 추가 실패"); }
    };
  }

  function renderExerciseActions(parent, options) {
    const { app, state, session, exercise, refresh } = options;
    const actions = parent.createDiv({ attr: { class: "workout-inline-actions" } });
    button(actions, "운동 변경").onclick = () => new modals.SubstitutionModal(app, session, exercise.exercise_id, async (applied) => {
      const recorded = flow.recordSubstitution(session, applied, exercise.exercise_id);
      Object.assign(session, recorded);
      await state.store.saveSession(recorded);
      await refresh();
    }).open();
    if (core.normalizeSessionKind(session) !== "free") return;
    const index = session.exercise_results.findIndex((item) => item.exercise_id === exercise.exercise_id);
    const persist = async (next) => { Object.assign(session, next); await state.store.saveSession(next); await refresh(); };
    const up = button(actions, "위로");
    up.disabled = index <= 0;
    up.onclick = () => persist(flow.moveFreeExercise(session, exercise.exercise_id, -1));
    const down = button(actions, "아래로");
    down.disabled = index + 1 >= session.exercise_results.length;
    down.onclick = () => persist(flow.moveFreeExercise(session, exercise.exercise_id, 1));
    button(actions, "운동 삭제").onclick = () => persist(flow.removeFreeExercise(session, exercise.exercise_id));
  }

  function renderSessionHistory(area, sessions) {
    const timeline = (sessions || [])
      .filter((session) => session && session.status === "completed")
      .sort((left, right) => String(right.completed_at || right.date).localeCompare(String(left.completed_at || left.date)))
      .slice(0, 12);
    if (!timeline.length) return 0;
    area.createEl("h3", { text: "최근 세션", attr: { style: "margin:8px 0 4px;font-size:0.92em;" } });
    timeline.forEach((session) => {
      const row = area.createDiv({ attr: { class: "workout-history-row" } });
      const kind = core.normalizeSessionKind(session);
      const title = kind === "programmed" ? `${session.program_title} · ${core.dayLabel(session)}` : (session.title || flow.kindLabel(session));
      row.createEl("strong", { text: `${flow.kindLabel(session)} · ${title}` });
      row.createEl("span", {
        text: [String(session.completed_at || session.date).slice(0, 10), flow.substitutionText(session), session.distance, session.duration].filter(Boolean).join(" · ")
      });
    });
    return timeline.length;
  }

  root.WorkoutSessionUI = Object.freeze({ renderEntryPaths, renderScheduleAccess, renderFreeDraftTools, renderExerciseActions, renderSessionHistory });
  if (typeof module !== "undefined" && module.exports) module.exports = root.WorkoutSessionUI;
})(typeof globalThis !== "undefined" ? globalThis : this);
