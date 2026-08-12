(function (root) {
  "use strict";

  const core = root.WorkoutCore || (typeof require === "function" ? require("./workout-core.js") : null);
  const objects = root.WorkoutProgramObjects || (typeof require === "function" ? require("./workout-program-objects.js") : null);
  const modals = root.WorkoutModals || (typeof require === "function" ? require("./workout-modals.js") : null);
  const flow = root.WorkoutSessionFlow || (typeof require === "function" ? require("./workout-session-flow.js") : null);

  function button(parent, label, primary = false) {
    return parent.createEl("button", { text: label, attr: { type: "button", class: primary ? "prodigy-btn prodigy-btn-primary mod-cta workout-button" : "prodigy-btn workout-button" } });
  }
  function notice(message) {
    const Notice = root.obsidian && root.obsidian.Notice ? root.obsidian.Notice : root.Notice;
    if (Notice) new Notice(message);
  }
  function renderEntryPaths(parent, options) {
    const { app, state, refresh, startProgram, resumeRunner, quickLabel } = options;
    const area = parent.createDiv({ attr: { class: "workout-section prodigy-utility-card" } });
    area.createEl("h2", { text: "운동 시작" });
    area.createEl("p", { text: "프로그램 · 자유운동 · 빠른 기록", attr: { class: "workout-section-copy" } });
    const grid = area.createDiv({ attr: { class: "workout-start-grid" } });

    const programCard = grid.createDiv({ attr: { class: "workout-start-path prodigy-utility-card" } });
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

    const freeCard = grid.createDiv({ attr: { class: "workout-start-path prodigy-utility-card" } });
    freeCard.createEl("h3", { text: "자유운동" });
    freeCard.createEl("p", { text: "운동을 골라 세트 실행기로 기록", attr: { class: "workout-muted" } });
    button(freeCard, "자유운동 구성", true).onclick = () => new flow.FreeWorkoutModal(app, state, refresh).open();

    const quickCard = grid.createDiv({ attr: { class: "workout-start-path prodigy-utility-card" } });
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
    area.createEl("h3", { text: "최근 세션", attr: { style: "margin:var(--ke-space-2) 0 var(--ke-space-1);font-size:var(--ke-type-label);" } });
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

  function renderExerciseCard(parent, options) {
    const {
      app, state, session, exercise, refresh, helpers,
      requestDraftSave, startRestTimer, stickyBar,
    } = options;
    const card = parent.createDiv({ attr: { class: "workout-exercise-card prodigy-utility-card" } });
    const heading = card.createDiv({ attr: { class: "workout-exercise-heading" } });
    const identity = heading.createDiv();
    const titleRow = identity.createDiv({ attr: { class: "workout-exercise-title-row" } });
    const exerciseLink = titleRow.createEl("button", {
      text: exercise.name,
      attr: { type: "button", class: "workout-exercise-link", title: "팝업으로 보기" }
    });
    exerciseLink.onclick = (event) => {
      if (event && event.preventDefault) event.preventDefault();
      helpers.openExercisePopup(app, exercise.name, state.sessions);
    };
    const meta = objects.getExerciseMeta
      ? objects.getExerciseMeta(app, exercise.name)
      : { exists: objects.exerciseObjectExists(app, exercise.name), cue: "", target: "" };
    const noteButton = titleRow.createEl("button", {
      text: "노트",
      attr: {
        type: "button", class: "workout-exercise-note-link",
        title: meta.exists ? "사이드로 노트 열기" : "노트 없음 · 팝업에서 생성",
        "aria-label": `${exercise.name} 노트`
      }
    });
    noteButton.onclick = async (event) => {
      if (event && event.preventDefault) event.preventDefault();
      if (event && event.stopPropagation) event.stopPropagation();
      if (!meta.exists) return helpers.openExercisePopup(app, exercise.name, state.sessions);
      await helpers.openExerciseNoteSide(app, exercise.name);
    };
    if (meta.target) titleRow.createEl("span", { text: meta.target, attr: { class: "workout-muted workout-exercise-target-tag" } });
    const prescription = exercise.prescribed_sets
      .map((set) => [set.reps && `${set.reps}회`, set.rpe && `RPE ${set.rpe}`, set.rest && `휴식 ${set.rest}`, set.target].filter(Boolean).join(" · "))
      .filter(Boolean).join(" / ");
    if (prescription) identity.createEl("p", { text: `목표 ${prescription}` });
    if (meta.cue) identity.createEl("p", { text: `큐 · ${meta.cue}`, attr: { class: "workout-exercise-cue" } });

    const previous = core.previousExerciseResult(state.sessions, session.program_run_id, exercise.exercise_id, session.session_id)
      || core.previousExerciseResultByName(state.sessions, exercise.name);
    const best = core.bestExerciseResult(state.sessions, exercise.name);
    const previousBox = heading.createDiv({ attr: { class: "workout-previous" } });
    previousBox.createEl("div", { text: helpers.recordStripText(previous, best), attr: { class: "workout-record-strip" } });
    if (previous && (previous.weight || previous.reps)) {
      const copyAll = button(previousBox, "전부 이전과 동일");
      copyAll.className = "workout-button workout-chip-btn";
      copyAll.onclick = async () => {
        try {
          Object.assign(session, core.applyPreviousToExercise(session, exercise.exercise_id, previous));
          await requestDraftSave();
          notice(`${exercise.name}: 이전 기록 적용`);
          await refresh();
        } catch (error) { notice(error.message || "기록 적용 실패"); }
      };
    }
    renderExerciseActions(previousBox, { app, state, session, exercise, refresh });

    const setToolbar = card.createDiv({ attr: { class: "workout-set-toolbar" } });
    const addSet = button(setToolbar, "세트 추가", true);
    addSet.className = "workout-button mod-cta workout-chip-btn";
    addSet.onclick = async (event) => {
      if (event && event.preventDefault) event.preventDefault();
      try {
        Object.assign(session, core.addSetResult(session, exercise.exercise_id, { copy_last: true }));
        await requestDraftSave();
        await refresh();
      } catch (error) { notice(error.message || "세트 추가 실패"); }
    };

    const sets = card.createDiv({ attr: { class: "workout-set-list" } });
    exercise.set_results.forEach((result, setIndex) => {
      const row = sets.createDiv({ attr: { class: "workout-set-row workout-set-row-min" } });
      const complete = row.createEl("input", { attr: { type: "checkbox", "aria-label": `${exercise.name} ${setIndex + 1}세트 완료` } });
      complete.checked = Boolean(result.completed);
      row.createEl("strong", { text: `${setIndex + 1}` });
      const fields = row.createDiv({ attr: { class: "workout-set-fields workout-set-fields-min" } });
      const weight = helpers.setInput(fields, "kg", result.weight, { inputmode: "decimal", placeholder: "kg" });
      const reps = helpers.setInput(fields, "회", result.reps, { inputmode: "numeric", placeholder: "회" });
      const update = (patch) => {
        Object.assign(session, core.updateSetResult(session, exercise.exercise_id, setIndex, patch));
        requestDraftSave();
      };
      complete.onchange = () => {
        update({ completed: complete.checked });
        if (complete.checked && stickyBar) startRestTimer(stickyBar, core.resolveRestSeconds(exercise.prescribed_sets && exercise.prescribed_sets[setIndex]));
      };
      weight.oninput = () => update({ weight: weight.value });
      reps.oninput = () => update({ reps: reps.value });
      if (previous && (previous.weight || previous.reps)) {
        const copy = row.createEl("button", { text: "이전", attr: { type: "button", class: "prodigy-btn workout-button workout-chip-btn prodigy-configurator-chip", title: helpers.previousText(previous) } });
        copy.onclick = (event) => {
          if (event && event.preventDefault) event.preventDefault();
          Object.assign(session, core.applyPreviousToSet(session, exercise.exercise_id, setIndex, previous));
          weight.value = previous.weight || "";
          reps.value = previous.reps || "";
          requestDraftSave();
        };
      }
      const remove = row.createEl("button", {
        text: "×",
        attr: { type: "button", class: "prodigy-btn workout-button workout-set-remove", "aria-label": `${exercise.name} ${setIndex + 1}세트 삭제`, title: "세트 삭제" }
      });
      remove.onclick = async (event) => {
        if (event && event.preventDefault) event.preventDefault();
        if (event && event.stopPropagation) event.stopPropagation();
        try {
          Object.assign(session, core.removeSetResult(session, exercise.exercise_id, setIndex));
          await requestDraftSave();
          await refresh();
        } catch (error) { notice(error.message || "세트 삭제 실패"); }
      };
      const more = row.createEl("details", { attr: { class: "workout-set-more" } });
      more.createEl("summary", { text: "더" });
      const moreBody = more.createDiv({ attr: { class: "workout-set-fields" } });
      const rpe = helpers.setInput(moreBody, "RPE", result.rpe, { inputmode: "decimal", placeholder: "RPE" });
      const note = helpers.setInput(moreBody, "메모", result.notes, { placeholder: "선택" });
      rpe.oninput = () => update({ rpe: rpe.value });
      note.oninput = () => update({ notes: note.value });
    });
    return card;
  }

  root.WorkoutSessionUI = Object.freeze({ renderEntryPaths, renderScheduleAccess, renderFreeDraftTools, renderExerciseActions, renderSessionHistory, renderExerciseCard });
  if (typeof module !== "undefined" && module.exports) module.exports = root.WorkoutSessionUI;
})(typeof globalThis !== "undefined" ? globalThis : this);
