(function (root) {
  "use strict";

  const core = root.WorkoutCore || (typeof require === "function" ? require("./workout-core.js") : null);
  const storeApi = root.WorkoutStore || (typeof require === "function" ? require("./workout-store.js") : null);
  const importer = root.WorkoutImport || (typeof require === "function" ? require("./workout-import.js") : null);
  const ModalBase = root.obsidian && root.obsidian.Modal;
  let saveQueue = Promise.resolve();

  function notice(message) { const Notice = root.obsidian && root.obsidian.Notice ? root.obsidian.Notice : root.Notice; if (Notice) new Notice(message); }
  function today() { const date = new Date(); return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`; }
  function uniqueId(prefix) { return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`; }
  function createStore(app) { return storeApi.createWorkoutStore(storeApi.createObsidianAdapter(app)); }
  function button(parent, label, primary = false) { return parent.createEl("button", { text: label, attr: { type: "button", class: primary ? "mod-cta workout-button" : "workout-button" } }); }
  function section(parent, title, subtitle = "") { const area = parent.createDiv({ attr: { class: "workout-section" } }); area.createEl("h2", { text: title }); if (subtitle) area.createEl("p", { text: subtitle, attr: { class: "workout-section-copy" } }); return area; }
  function empty(parent, message) { parent.createEl("p", { text: message, attr: { class: "workout-empty" } }); }
  function statusLabel(status) { return ({ active: "진행 중", paused: "일시정지", completed: "완료", abandoned: "중단" })[status] || status; }

  async function loadState(app) {
    const store = createStore(app);
    const [programs, runs, sessions] = await Promise.all([store.listPrograms(), store.listRuns(), store.listSessions()]);
    const activeRun = runs.find((run) => run.status === "active") || null;
    const activeProgram = activeRun ? programs.find((program) => program.id === activeRun.program_id) || null : null;
    const draft = activeRun ? sessions.find((session) => session.program_run_id === activeRun.run_id && session.status === "draft") || null : null;
    return { store, programs, runs, sessions, activeRun, activeProgram, draft };
  }

  async function startProgram(app, program, state, refresh) {
    if (state.activeRun) return new RunConflictModal(app, program, state, refresh).open();
    const run = core.createProgramRun(program, state.runs, { run_id: uniqueId("run") });
    await state.store.saveRun(run);
    notice(`${program.title} 실행을 시작했습니다.`);
    await refresh();
  }

  async function setRunStatus(state, run, status, refresh) {
    await state.store.saveRun(core.transitionProgramRun(run, status));
    notice(`프로그램을 ${statusLabel(status)} 상태로 변경했습니다.`);
    await refresh();
  }

  async function startDay(state, dayId, refresh) {
    const warning = core.daySelectionWarning(state.activeProgram, state.sessions, state.activeRun.run_id, dayId);
    if (warning && root.confirm && !root.confirm(warning)) return;
    const session = core.createWorkoutSession(state.activeProgram, state.activeRun, dayId, { session_id: uniqueId("session"), date: today() });
    await state.store.saveSession(session);
    await refresh();
  }

  function previousText(previous) {
    if (!previous) return "이 실행에서 이전 기록 없음";
    return [previous.weight && `${previous.weight} kg`, previous.reps && `${previous.reps}회`, previous.rpe && `RPE ${previous.rpe}`].filter(Boolean).join(" · ");
  }

  function queueDraftSave(store, session) {
    saveQueue = saveQueue.then(() => store.saveSession(session)).catch((error) => { notice("운동 기록을 저장하지 못했습니다."); if (root.prodigyDebugMode === true) console.error(error); });
    return saveQueue;
  }

  function setInput(parent, label, value, options = {}) {
    const field = parent.createDiv({ attr: { class: "workout-field" } });
    field.createEl("label", { text: label });
    const input = field.createEl(options.multiline ? "textarea" : "input", { attr: { type: options.type || "text", inputmode: options.inputmode || "text", placeholder: options.placeholder || "" } });
    input.value = value || "";
    return input;
  }

  function renderSession(parent, state, refresh) {
    if (!state.draft) return;
    const session = state.draft;
    const area = section(parent, `${session.week}주차 ${session.day}일차`, "입력한 결과는 즉시 임시 저장됩니다.");
    const dayActions = area.createDiv({ attr: { class: "workout-inline-actions" } });
    button(dayActions, "운동 기록 닫기").onclick = () => notice("진행 중인 운동은 대시보드에서 계속 표시됩니다.");
    session.exercise_results.forEach((exercise) => {
      const card = area.createDiv({ attr: { class: "workout-exercise-card" } });
      const heading = card.createDiv({ attr: { class: "workout-exercise-heading" } });
      const identity = heading.createDiv();
      identity.createEl("h3", { text: exercise.name });
      const target = exercise.prescribed_sets.map((set) => [set.reps && `${set.reps}회`, set.rpe && `RPE ${set.rpe}`, set.target].filter(Boolean).join(" · ")).filter(Boolean).join(" / ");
      if (target) identity.createEl("p", { text: `목표 ${target}` });
      const previous = core.previousExerciseResult(state.sessions, session.program_run_id, exercise.exercise_id, session.session_id);
      heading.createEl("span", { text: `이전 ${previousText(previous)}`, attr: { class: "workout-previous" } });
      const sets = card.createDiv({ attr: { class: "workout-set-list" } });
      exercise.set_results.forEach((result, setIndex) => {
        const row = sets.createDiv({ attr: { class: "workout-set-row" } });
        const complete = row.createEl("input", { attr: { type: "checkbox", "aria-label": `${exercise.name} ${setIndex + 1}세트 완료` } });
        complete.checked = Boolean(result.completed);
        row.createEl("strong", { text: `${setIndex + 1}세트` });
        const fields = row.createDiv({ attr: { class: "workout-set-fields" } });
        const controls = [
          ["중량", "weight", "decimal", "kg"], ["횟수", "reps", "numeric", "회"], ["RPE", "rpe", "decimal", "RPE"],
        ].map(([label, key, inputmode, placeholder]) => ({ key, input: setInput(fields, label, result[key], { inputmode, placeholder }) }));
        const note = setInput(row, "메모", result.notes, { placeholder: "선택 사항" });
        const update = (patch) => {
          const next = core.updateSetResult(session, exercise.exercise_id, setIndex, patch);
          Object.assign(session, next);
          queueDraftSave(state.store, session);
        };
        complete.onchange = () => update({ completed: complete.checked });
        controls.forEach(({ key, input }) => { input.oninput = () => update({ [key]: input.value }); });
        note.oninput = () => update({ notes: note.value });
      });
    });
    const finish = button(area, "운동 완료", true);
    finish.onclick = async () => {
      finish.disabled = true;
      await saveQueue;
      const result = core.completeWorkoutSession(session, state.activeProgram, state.activeRun, state.sessions.filter((item) => item.session_id !== session.session_id));
      await state.store.saveSession(result.session);
      await state.store.saveRun(result.run);
      notice(result.run.status === "completed" ? "프로그램 실행을 완료했습니다." : "운동을 완료했습니다.");
      await refresh();
    };
  }

  function renderCurrent(parent, state, refresh) {
    const area = section(parent, "현재 프로그램", "완료된 세션을 기준으로 다음 순서를 제안합니다.");
    if (!state.activeRun || !state.activeProgram) {
      empty(area, "진행 중인 프로그램이 없습니다. 라이브러리에서 프로그램을 시작하세요.");
      return;
    }
    const summary = area.createDiv({ attr: { class: "workout-current" } });
    const identity = summary.createDiv();
    identity.createEl("h3", { text: state.activeProgram.title });
    identity.createEl("p", { text: `Run #${state.activeRun.run_number} · ${statusLabel(state.activeRun.status)}` });
    const actions = summary.createDiv({ attr: { class: "workout-inline-actions" } });
    button(actions, "일시정지").onclick = () => setRunStatus(state, state.activeRun, "paused", refresh);
    button(actions, "중단").onclick = () => setRunStatus(state, state.activeRun, "abandoned", refresh);
    if (state.draft) return;
    const chooser = area.createDiv({ attr: { class: "workout-day-chooser" } });
    const select = chooser.createEl("select", { attr: { "aria-label": "프로그램 Day 선택" } });
    state.activeProgram.days.forEach((day) => {
      const completed = state.sessions.some((session) => session.program_run_id === state.activeRun.run_id && session.program_day_id === day.id && session.status === "completed");
      const option = select.createEl("option", { text: `${day.week}주차 ${day.day}일차${completed ? " · 완료 기록 있음" : ""}`, value: day.id });
      option.value = day.id;
    });
    select.value = state.activeRun.suggested_day || state.activeProgram.days[0].id;
    button(chooser, "선택한 운동 시작", true).onclick = () => startDay(state, select.value, refresh);
  }

  function renderLibrary(parent, state, refresh) {
    const area = section(parent, "프로그램 라이브러리", "프로그램은 재사용되며 실행 기록과 분리됩니다.");
    if (!state.programs.length) return empty(area, "가져온 프로그램이 없습니다. Excel 프로그램을 먼저 가져오세요.");
    state.programs.forEach((program) => {
      const row = area.createDiv({ attr: { class: "workout-library-row" } });
      const copy = row.createDiv();
      copy.createEl("strong", { text: program.title });
      copy.createEl("span", { text: `${program.weeks}주 · ${program.days.length}회 · ${program.goal || "목표 미지정"}` });
      const history = state.runs.filter((run) => run.program_id === program.id);
      const actions = row.createDiv({ attr: { class: "workout-inline-actions" } });
      if (!state.activeRun || state.activeRun.program_id !== program.id) button(actions, history.length ? "다시 실행" : "프로그램 시작", true).onclick = () => startProgram(root.app, program, state, refresh);
      const paused = history.find((run) => run.status === "paused");
      if (paused && !state.activeRun) button(actions, "이어서 실행").onclick = async () => { await state.store.saveRun(core.transitionProgramRun(paused, "active")); await refresh(); };
      if (history.length) button(actions, "실행 기록").onclick = () => new ProgramHistoryModal(root.app, program, history).open();
    });
  }

  function renderHistory(parent, state) {
    const area = section(parent, "운동 기록", "완료된 프로그램 실행과 빠른 운동");
    const completedRuns = state.runs.filter((run) => ["completed", "abandoned"].includes(run.status)).sort((a, b) => String(b.completed_at).localeCompare(String(a.completed_at)));
    const quick = state.sessions.filter((session) => session.quick).sort((a, b) => String(b.date).localeCompare(String(a.date)));
    if (!completedRuns.length && !quick.length) return empty(area, "아직 완료된 운동 기록이 없습니다.");
    completedRuns.slice(0, 5).forEach((run) => { const row = area.createDiv({ attr: { class: "workout-history-row" } }); row.createEl("strong", { text: `${run.program_title} · Run #${run.run_number}` }); row.createEl("span", { text: `${statusLabel(run.status)} · ${(run.completed_at || run.started_at || "").slice(0, 10)}` }); });
    quick.slice(0, 5).forEach((session) => { const row = area.createDiv({ attr: { class: "workout-history-row" } }); row.createEl("strong", { text: session.title }); row.createEl("span", { text: [session.date, session.distance, session.duration].filter(Boolean).join(" · ") }); });
  }

  class RunConflictModal extends ModalBase {
    constructor(app, program, state, refresh) { super(app); this.program = program; this.state = state; this.refresh = refresh; }
    onOpen() {
      this.contentEl.addClass("workout-modal");
      this.contentEl.createEl("h2", { text: "진행 중인 프로그램 정리" });
      this.contentEl.createEl("p", { text: `${this.state.activeRun.program_title} 실행을 먼저 정리해야 합니다.` });
      const actions = this.contentEl.createDiv({ attr: { class: "workout-modal-actions" } });
      ["paused", "completed", "abandoned"].forEach((status) => { button(actions, ({ paused: "일시정지", completed: "완료", abandoned: "중단" })[status]).onclick = async () => { await this.state.store.saveRun(core.transitionProgramRun(this.state.activeRun, status)); this.close(); const latest = await loadState(this.app); await startProgram(this.app, this.program, latest, this.refresh); }; });
      button(actions, "취소").onclick = () => this.close();
    }
  }

  class QuickWorkoutModal extends ModalBase {
    constructor(app, refresh) { super(app); this.refresh = refresh; }
    onOpen() {
      this.contentEl.addClass("workout-modal");
      this.contentEl.createEl("h2", { text: "빠른 운동" });
      const title = setInput(this.contentEl, "운동 이름", "", { placeholder: "예: 러닝, 호텔 운동" });
      const grid = this.contentEl.createDiv({ attr: { class: "workout-modal-grid" } });
      const distance = setInput(grid, "거리", "", { placeholder: "예: 5 km" });
      const duration = setInput(grid, "시간", "", { placeholder: "예: 28:31" });
      const notes = setInput(this.contentEl, "메모", "", { multiline: true, placeholder: "선택 사항" });
      const actions = this.contentEl.createDiv({ attr: { class: "workout-modal-actions" } });
      button(actions, "취소").onclick = () => this.close();
      button(actions, "저장", true).onclick = async () => { try { const session = core.createQuickWorkout({ session_id: uniqueId("session"), title: title.value, distance: distance.value, duration: duration.value, notes: notes.value, date: today() }); session.status = "completed"; session.completed_at = new Date().toISOString(); await createStore(this.app).saveSession(session); this.close(); notice("빠른 운동을 저장했습니다."); await this.refresh(); } catch (error) { notice(error.message); } };
    }
  }

  class ProgramHistoryModal extends ModalBase {
    constructor(app, program, runs) { super(app); this.program = program; this.runs = runs; }
    onOpen() {
      this.contentEl.addClass("workout-modal");
      this.contentEl.createEl("h2", { text: `${this.program.title} 실행 기록` });
      [...this.runs].sort((a, b) => String(b.started_at).localeCompare(String(a.started_at))).forEach((run) => {
        const row = this.contentEl.createDiv({ attr: { class: "workout-history-row" } });
        row.createEl("strong", { text: `Run #${run.run_number}` });
        row.createEl("span", { text: `${statusLabel(run.status)} · ${(run.started_at || "").slice(0, 10)}` });
      });
      const actions = this.contentEl.createDiv({ attr: { class: "workout-modal-actions" } });
      button(actions, "닫기").onclick = () => this.close();
    }
  }

  class ImportProgramModal extends ModalBase {
    constructor(app, refresh) { super(app); this.refresh = refresh; this.result = null; }
    onOpen() {
      this.contentEl.addClass("workout-modal");
      this.contentEl.createEl("h2", { text: "프로그램 가져오기" });
      this.contentEl.createEl("p", { text: "Excel 내용을 먼저 미리보고 확인 후 저장합니다.", attr: { class: "workout-muted" } });
      const input = this.contentEl.createEl("input", { attr: { type: "file", accept: ".xlsx", "aria-label": "Excel 프로그램 선택" } });
      const preview = this.contentEl.createDiv({ attr: { class: "workout-import-preview" } });
      input.onchange = async () => {
        const file = input.files && input.files[0];
        if (!file) return;
        preview.empty(); preview.createEl("p", { text: "프로그램 구조를 확인하고 있습니다…" });
        try { this.result = await importer.inspectWorkbook(await file.arrayBuffer(), file.name); this.renderPreview(preview); } catch (error) { this.result = null; preview.empty(); preview.createEl("p", { text: "Excel 프로그램을 읽지 못했습니다.", attr: { class: "workout-error" } }); if (root.prodigyDebugMode === true) console.error(error); }
      };
    }
    renderPreview(parent) {
      parent.empty();
      const select = parent.createEl("select", { attr: { "aria-label": "프로그램 시트 선택" } });
      this.result.candidates.forEach((candidate, index) => { const option = select.createEl("option", { text: `${candidate.sheet_name} · ${candidate.weeks}주 ${candidate.days}회`, value: String(index) }); option.value = String(index); });
      const details = parent.createDiv({ attr: { class: "workout-import-details" } });
      const render = () => {
        details.empty(); const candidate = this.result.candidates[Number(select.value) || 0];
        details.createEl("h3", { text: candidate.title });
        details.createEl("p", { text: `${candidate.weeks}주 · ${candidate.days}일 · 운동 ${candidate.exercise_count}개 · 확인 필요 ${candidate.unknown_rows.length}행` });
        const outline = details.createEl("ul");
        candidate.outline.slice(0, 6).forEach((day) => {
          const visible = day.exercises.slice(0, 5);
          const remainder = day.exercises.length - visible.length;
          outline.createEl("li", { text: `${day.label}: ${visible.join(", ")}${remainder > 0 ? ` 외 ${remainder}개` : ""}` });
        });
      };
      select.onchange = render; render();
      const actions = parent.createDiv({ attr: { class: "workout-modal-actions" } });
      button(actions, "취소").onclick = () => this.close();
      button(actions, "프로그램 저장", true).onclick = async () => { const candidate = this.result.candidates[Number(select.value) || 0]; await createStore(this.app).saveProgram(candidate.program); this.close(); notice(`${candidate.title} 프로그램을 저장했습니다.`); await this.refresh(); };
    }
  }

  function injectStyles(container) {
    container.createEl("style", { text: `
.prodigy-workout-dashboard{max-width:920px;margin:0 auto;padding-bottom:48px}.workout-toolbar{display:flex;justify-content:flex-end;gap:8px;margin:8px 0 16px}.workout-button{min-height:40px;border-radius:6px;padding:6px 12px}.workout-section{padding:20px 0;border-bottom:1px solid var(--background-modifier-border)}.workout-section h2{margin:0;font-size:1.05em}.workout-section-copy,.workout-muted,.workout-empty{color:var(--text-muted);font-size:.82em;line-height:1.45;margin:4px 0 12px}.workout-current,.workout-library-row,.workout-history-row{display:flex;align-items:center;justify-content:space-between;gap:12px}.workout-current h3,.workout-exercise-heading h3{margin:0;font-size:1.12em}.workout-current p,.workout-exercise-heading p{margin:3px 0 0;color:var(--text-muted);font-size:.78em}.workout-inline-actions,.workout-modal-actions{display:flex;gap:8px;flex-wrap:wrap}.workout-day-chooser{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:8px;margin-top:16px}.workout-day-chooser select,.workout-modal select,.workout-modal input,.workout-modal textarea{width:100%;min-height:44px}.workout-exercise-card{margin-top:12px;padding:14px;border:1px solid var(--background-modifier-border);border-radius:8px;background:var(--background-secondary)}.workout-exercise-heading{display:flex;justify-content:space-between;gap:12px;align-items:start}.workout-previous{color:var(--text-muted);font-size:.74em;text-align:right}.workout-set-list{margin-top:12px}.workout-set-row{display:grid;grid-template-columns:44px 52px minmax(0,1fr);gap:8px;align-items:center;padding:10px 0;border-top:1px solid var(--background-modifier-border)}.workout-set-row>input{width:22px;height:22px;margin:auto}.workout-set-fields{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}.workout-field{display:flex;flex-direction:column;gap:3px}.workout-field label{font-size:.7em;color:var(--text-muted)}.workout-field input,.workout-field textarea{min-height:40px;width:100%;box-sizing:border-box}.workout-set-row>.workout-field{grid-column:3}.workout-library-row,.workout-history-row{padding:12px 0;border-top:1px solid var(--background-modifier-border)}.workout-library-row>div:first-child,.workout-history-row{display:flex;flex-direction:column;gap:3px}.workout-library-row span,.workout-history-row span{font-size:.78em;color:var(--text-muted)}.workout-modal{max-width:680px}.workout-modal-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}.workout-modal-actions{justify-content:flex-end;margin-top:16px}.workout-import-preview{margin-top:14px}.workout-import-details{max-height:42vh;overflow-y:auto;padding-right:4px}.workout-import-details li{margin-bottom:5px;line-height:1.4}.workout-error{color:var(--text-error)}
@media(max-width:600px){.prodigy-workout-dashboard{padding:0 4px 40px}.workout-toolbar,.workout-inline-actions,.workout-modal-actions{flex-direction:column}.workout-toolbar .workout-button,.workout-inline-actions .workout-button,.workout-modal-actions .workout-button{width:100%;min-height:44px}.workout-current,.workout-library-row,.workout-history-row,.workout-exercise-heading{align-items:stretch;flex-direction:column}.workout-day-chooser{grid-template-columns:1fr}.workout-day-chooser .workout-button{min-height:48px}.workout-section{padding:16px 0}.workout-exercise-card{padding:12px}.workout-previous{text-align:left}.workout-set-row{grid-template-columns:44px minmax(0,1fr)}.workout-set-row>strong{font-size:.82em}.workout-set-fields{grid-column:1/-1}.workout-set-row>.workout-field{grid-column:1/-1}.workout-field input{min-height:44px}.workout-modal-grid{grid-template-columns:1fr}}
` });
  }

  async function renderDashboard(app, container) {
    if (!core || !storeApi || !importer) throw new Error("Workout Workspace modules are unavailable.");
    root.app = app;
    container.empty(); container.addClass("prodigy-workout-dashboard"); injectStyles(container);
    const state = await loadState(app);
    const refresh = () => renderDashboard(app, container);
    const toolbar = container.createDiv({ attr: { class: "workout-toolbar" } });
    button(toolbar, "프로그램 가져오기").onclick = () => new ImportProgramModal(app, refresh).open();
    button(toolbar, "빠른 운동").onclick = () => new QuickWorkoutModal(app, refresh).open();
    renderCurrent(container, state, refresh);
    renderSession(container, state, refresh);
    renderLibrary(container, state, refresh);
    renderHistory(container, state);
  }

  const api = { ImportProgramModal, ProgramHistoryModal, QuickWorkoutModal, loadState, renderDashboard };
  root.WorkoutView = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
