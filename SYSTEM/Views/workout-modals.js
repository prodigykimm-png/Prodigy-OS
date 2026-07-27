/**
 * Workout Modal Classes — extracted from workout-view.js (P2-1)
 * 로드 순서: workout-core/store/import/objects → workout-modals.js → workout-view.js
 * workout-view.js에서 WorkoutModals로 접근.
 */
(function (root) {
  "use strict";
  const core = root.WorkoutCore || (typeof require === "function" ? require("./workout-core.js") : null);
  const storeApi = root.WorkoutStore || (typeof require === "function" ? require("./workout-store.js") : null);
  const importer = root.WorkoutImport || (typeof require === "function" ? require("./workout-import.js") : null);
  const objects = root.WorkoutProgramObjects || (typeof require === "function" ? require("./workout-program-objects.js") : null);

  class FallbackModal {
    constructor(app) { this.app = app; this.contentEl = document.createElement("div"); }
    open() { if (typeof this.onOpen === "function") this.onOpen(); }
    close() { if (typeof this.onClose === "function") this.onClose(); }
  }
  const ModalBase = (root.obsidian && root.obsidian.Modal) ? root.obsidian.Modal : FallbackModal;

  function notice(message) { const Notice = root.obsidian && root.obsidian.Notice ? root.obsidian.Notice : root.Notice; if (Notice) new Notice(message); }
  function today() { const date = new Date(); return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`; }
  function uniqueId(prefix) { return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`; }
  function createStore(app) { return storeApi.createWorkoutStore(storeApi.createObsidianAdapter(app)); }
  function button(parent, label, primary = false) { return parent.createEl("button", { text: label, attr: { type: "button", class: primary ? "mod-cta workout-button" : "workout-button" } }); }
  function clone(value) { return JSON.parse(JSON.stringify(value)); }
  function statusLabel(status) { return ({ active: "진행 중", paused: "일시정지", completed: "완료", abandoned: "중단" })[status] || status; }

  function setInput(parent, label, value, options = {}) {
    const wrap = parent.createDiv({ attr: { class: "workout-field" } });
    wrap.createEl("label", { text: label });
    const input = wrap.createEl("input", { attr: { type: options.type || "text", value: value != null ? value : "", placeholder: options.placeholder || "" } });
    if (options.list) input.setAttribute("list", options.list);
    return input;
  }

  function fillExerciseDatalist(choicesEl, query, target, limit = 40) {
    if (!choicesEl || !core) return;
    const names = core.exerciseNames ? core.exerciseNames() : [];
    const filtered = query ? names.filter((n) => n.toLowerCase().includes(query.toLowerCase())) : names;
    choicesEl.innerHTML = "";
    filtered.slice(0, limit).forEach((n) => choicesEl.createEl("option", { attr: { value: n } }));
  }

  function renderTargetFilter(parent, options = {}) {
    if (!core) return null;
    const wrap = parent.createDiv({ attr: { class: "workout-target-filter" } });
    const select = wrap.createEl("select", { attr: { class: "workout-select" } });
    select.createEl("option", { text: "전체 부위", attr: { value: "" } });
    (core.MUSCLE_GROUPS || []).forEach((g) => select.createEl("option", { text: g, attr: { value: g } }));
    if (options.onChange) select.onchange = () => options.onChange(select.value);
    return select;
  }

  function renderProgressBar(parent, progress) {
    const bar = parent.createDiv({ attr: { class: "workout-progress" } });
    const fill = bar.createDiv({ attr: { class: "workout-progress-fill" } });
    fill.style.width = Math.min(100, Math.round(progress * 100)) + "%";
    bar.createEl("span", { text: Math.round(progress * 100) + "%", attr: { class: "workout-progress-label" } });
    return bar;
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
        row.createEl("strong", { text: `실행 #${run.run_number}` });
        row.createEl("span", { text: `${statusLabel(run.status)} · ${(run.started_at || "").slice(0, 10)}` });
      });
      const actions = this.contentEl.createDiv({ attr: { class: "workout-modal-actions" } });
      button(actions, "닫기").onclick = () => this.close();
    }
  }

  class RenameProgramModal extends ModalBase {
    constructor(app, program, state, refresh) { super(app); this.program = program; this.state = state; this.refresh = refresh; }
    onOpen() {
      this.contentEl.addClass("workout-modal");
      this.contentEl.createEl("h2", { text: "프로그램 이름 변경" });
      const title = setInput(this.contentEl, "새 이름", this.program.title);
      const actions = this.contentEl.createDiv({ attr: { class: "workout-modal-actions" } });
      button(actions, "취소").onclick = () => this.close();
      button(actions, "저장", true).onclick = async () => {
        try {
          const stored = await objects.renameProgramObject(this.app, this.program, title.value);
          await this.state.store.saveProgram(stored);
          this.close();
          notice("이름을 변경했습니다.");
          await this.refresh();
        } catch (error) { notice(error.message || "이름 변경에 실패했습니다."); }
      };
    }
  }

  class CreateExerciseModal extends ModalBase {
    constructor(app, name, sessions) { super(app); this.name = name; this.sessions = sessions || []; }
    onOpen() {
      this.contentEl.addClass("workout-modal");
      this.contentEl.createEl("h2", { text: "운동 노트 만들기" });
      this.contentEl.createEl("p", {
        text: `「${this.name}」 Exercise Object. target + cue(한 줄)만 최소 입력.`,
        attr: { class: "workout-muted" }
      });
      const suggested = objects.suggestTargetFromName
        ? objects.suggestTargetFromName(this.name)
        : "";
      const targetFilter = renderTargetFilter(this.contentEl, {
        label: "부위 target",
        initial: suggested
      });
      const cueInput = setInput(this.contentEl, "큐 (한 줄 테크닉)", "", {
        placeholder: "예: 무릎이 발끝 밖으로 나가지 않게"
      });
      const actions = this.contentEl.createDiv({ attr: { class: "workout-modal-actions" } });
      button(actions, "취소").onclick = () => this.close();
      button(actions, "운동 종목 객체 만들기", true).onclick = async () => {
        try {
          const target = targetFilter.get() || suggested || "other";
          const cue = String(cueInput.value || "").trim();
          await objects.createExerciseObject(this.app, this.name, { target, cue });
          this.close();
          notice(`운동 노트 생성 · target: ${target}`);
          // Popup only after create — side note is optional via 「노트」
          new ExerciseDetailModal(this.app, this.name, this.sessions).open();
        } catch (error) { notice(error.message || "생성에 실패했습니다."); }
      };
    }
  }

  function stripNoteFrontmatter(text) {
    const src = String(text || "");
    if (!src.startsWith("---")) return src;
    const end = src.indexOf("\n---", 3);
    if (end < 0) return src;
    let rest = src.slice(end + 4);
    if (rest.startsWith("\r\n")) rest = rest.slice(2);
    else if (rest.startsWith("\n")) rest = rest.slice(1);
    return rest;
  }

  /** Paint exercise note body into a container (markdown when available). */
  async function paintExerciseNoteBody(app, parent, name) {
    parent.empty();
    const file = objects.findExerciseFile(app, name);
    if (!file) {
      empty(parent, "운동 노트가 없습니다. 노트를 만들면 본문이 여기에 표시됩니다.");
      return;
    }
    let source = "";
    try {
      source = await app.vault.read(file);
    } catch (error) {
      empty(parent, error.message || "본문을 읽지 못했습니다.");
      return;
    }
    const body = stripNoteFrontmatter(source).trim();
    if (!body) {
      empty(parent, "본문이 비어 있습니다. 노트에 테크닉·팁 등을 적어 두세요.");
      return;
    }

    const host = parent.createDiv({ attr: { class: "workout-exercise-body-md" } });
    const MarkdownRenderer = root.obsidian && root.obsidian.MarkdownRenderer;
    const path = file.path || "";

    // Obsidian: render full markdown preview
    if (MarkdownRenderer) {
      try {
        if (typeof MarkdownRenderer.render === "function") {
          await MarkdownRenderer.render(app, body, host, path, this || null);
          return;
        }
        if (typeof MarkdownRenderer.renderMarkdown === "function") {
          MarkdownRenderer.renderMarkdown(body, host, path, this || null);
          return;
        }
      } catch (_e) {
        host.empty && host.empty();
      }
    }

    // Fallback: readable plain sections (headings preserved)
    const lines = body.split(/\r?\n/);
    let block = host.createDiv({ attr: { class: "workout-exercise-body-section" } });
    lines.forEach((line) => {
      const heading = line.match(/^(#{1,3})\s+(.*)$/);
      if (heading) {
        block = host.createDiv({ attr: { class: "workout-exercise-body-section" } });
        block.createEl("h4", {
          text: heading[2].trim(),
          attr: { class: "workout-exercise-body-heading" }
        });
        return;
      }
      if (!line.trim()) {
        block.createEl("div", { attr: { style: "height:0.45em;" } });
        return;
      }
      block.createEl("div", {
        text: line,
        attr: { class: "workout-exercise-body-line" }
      });
    });
  }

  class ExerciseDetailModal extends ModalBase {
    constructor(app, name, sessions) { super(app); this.name = name; this.sessions = sessions || []; }
    onOpen() {
      this.contentEl.addClass("workout-modal");
      this.contentEl.addClass("workout-modal-exercise");
      this.contentEl.createEl("h2", { text: this.name });
      const previous = core.previousExerciseResultByName(this.sessions, this.name);
      const best = core.bestExerciseResult(this.sessions, this.name);
      const meta = objects.getExerciseMeta
        ? objects.getExerciseMeta(this.app, this.name)
        : { target: "", cue: "" };
      const currentTarget = meta.target || "";
      const pr = this.contentEl.createDiv({ attr: { class: "workout-import-details" } });
      pr.createEl("h3", { text: "부위 · 큐 · 기록" });
      pr.createEl("p", {
        text: currentTarget
          ? `target: ${currentTarget} (${objects.targetLabel ? objects.targetLabel(currentTarget) : currentTarget})`
          : "target: (미설정)"
      });
      const targetFilter = renderTargetFilter(this.contentEl, {
        label: "target 변경",
        initial: currentTarget || (objects.suggestTargetFromName ? objects.suggestTargetFromName(this.name) : "")
      });
      button(this.contentEl, "target 저장").onclick = async () => {
        try {
          const next = targetFilter.get();
          if (!next) return notice("부위를 선택해 주세요.");
          await objects.setExerciseTarget(this.app, this.name, next);
          notice(`target → ${next}`);
        } catch (error) {
          notice(error.message || "target 저장 실패");
        }
      };
      const cueInput = setInput(this.contentEl, "큐 (한 줄 · 대시보드 표시)", meta.cue || "", {
        placeholder: "예: 힙 힌지 유지 · 바 경로 수직"
      });
      button(this.contentEl, "큐 저장").onclick = async () => {
        try {
          const cue = String(cueInput.value || "").trim();
          await objects.setExerciseCue(this.app, this.name, cue);
          notice(cue ? "큐를 저장했습니다." : "큐를 비웠습니다.");
        } catch (error) {
          notice(error.message || "큐 저장 실패");
        }
      };
      pr.createEl("p", {
        text: recordStripText(previous, best),
        attr: { style: "margin-top:10px;" }
      });
      if (best && best.e1rm) pr.createEl("p", { text: `추정 1RM: ${best.e1rm}` });

      // Full note body (technique, tips, etc.)
      const bodySection = this.contentEl.createDiv({ attr: { class: "workout-exercise-body-wrap" } });
      bodySection.createEl("h3", { text: "노트 본문" });
      const bodyHost = bodySection.createDiv({ attr: { class: "workout-exercise-body" } });
      empty(bodyHost, "본문을 불러오는 중…");
      paintExerciseNoteBody.call(this, this.app, bodyHost, this.name).catch((error) => {
        bodyHost.empty && bodyHost.empty();
        empty(bodyHost, error.message || "본문을 불러오지 못했습니다.");
      });

      const history = core.exerciseHistory(this.sessions, this.name, 12);
      this.contentEl.createEl("h3", { text: "최근 세션" });
      if (!history.length) empty(this.contentEl, "완료된 기록이 없습니다.");
      else {
        history.forEach((row) => {
          const line = this.contentEl.createDiv({ attr: { class: "workout-history-row" } });
          line.createEl("strong", { text: row.date || "날짜 없음" });
          line.createEl("span", {
            text: [row.weight && `${row.weight} kg`, row.reps && `${row.reps}회`, row.rpe && `RPE ${row.rpe}`, row.e1rm && `e1RM ${row.e1rm}`].filter(Boolean).join(" · ")
          });
        });
      }
      const actions = this.contentEl.createDiv({ attr: { class: "workout-modal-actions" } });
      if (objects.exerciseObjectExists(this.app, this.name)) {
        button(actions, "노트 (사이드)").onclick = async () => {
          await openExerciseNoteSide(this.app, this.name);
        };
        button(actions, "본문 새로고침").onclick = async () => {
          empty(bodyHost, "본문을 불러오는 중…");
          try {
            await paintExerciseNoteBody.call(this, this.app, bodyHost, this.name);
          } catch (error) {
            bodyHost.empty && bodyHost.empty();
            empty(bodyHost, error.message || "본문을 불러오지 못했습니다.");
          }
        };
      }
      button(actions, "닫기").onclick = () => this.close();
    }
  }

  class AddExerciseToProgramModal extends ModalBase {
    constructor(app, program, state, refresh) {
      super(app);
      this.program = clone(program);
      this.state = state;
      this.refresh = refresh;
    }
    onOpen() {
      this.contentEl.addClass("workout-modal");
      this.contentEl.createEl("h2", { text: `운동 추가 — ${this.program.title}` });
      this.contentEl.createEl("p", {
        text: "라이브러리 프로그램에 바로 저장됩니다. 진행 중 Run 스냅샷은 바꾸지 않습니다.",
        attr: { class: "workout-muted" }
      });

      if (!Array.isArray(this.program.days) || !this.program.days.length) {
        this.program.days = [{
          id: `w1d1_${Date.now().toString(36)}`,
          week: 1,
          day: 1,
          label: "Week 1 Day 1",
          exercises: []
        }];
      }

      const dayField = this.contentEl.createDiv({ attr: { class: "workout-field" } });
      dayField.createEl("label", { text: "Day" });
      const daySelect = dayField.createEl("select", { attr: { "aria-label": "Day 선택" } });
      this.program.days.forEach((day) => {
        const count = (day.exercises || []).length;
        daySelect.createEl("option", {
          text: `${day.week}주차 ${day.day}일차 · 운동 ${count}개`,
          value: day.id
        });
      });
      daySelect.value = this.program.days[0].id;

      const listId = `add-ex-catalog-${Date.now().toString(36)}`;
      const choices = this.contentEl.createEl("datalist", { attr: { id: listId } });
      let nameInput = null;
      let targetFilter = null;
      const fillChoices = (query) => {
        fillExerciseDatalist(choices, query, targetFilter ? targetFilter.get() : "", 40);
      };
      root.app = this.app;
      targetFilter = renderTargetFilter(this.contentEl, {
        label: "부위 필터 (target)",
        onChange: () => fillChoices(nameInput ? nameInput.value : "")
      });
      nameInput = setInput(this.contentEl, "운동 이름", "", {
        placeholder: "예: 스쿼트, 벤치프레스 (부위 필터 적용)"
      });
      nameInput.setAttribute && nameInput.setAttribute("list", listId);
      if (nameInput.attr) nameInput.attr.list = listId;
      fillChoices("");
      nameInput.oninput = () => fillChoices(nameInput.value);
      const name = nameInput;

      const grid = this.contentEl.createDiv({ attr: { class: "workout-modal-grid" } });
      const setCount = setInput(grid, "세트 수", "3", { inputmode: "numeric", placeholder: "3" });
      const reps = setInput(grid, "횟수", "8", { placeholder: "예: 8 또는 6~8" });
      const rpe = setInput(grid, "RPE", "7", { placeholder: "예: 7" });
      const notes = setInput(this.contentEl, "메모 (선택)", "", { placeholder: "큐 한 줄" });
      const makeNote = this.contentEl.createEl("label", {
        attr: { style: "display:flex;align-items:center;gap:8px;margin-top:10px;font-size:0.86em;" }
      });
      const makeNoteCheck = makeNote.createEl("input", { attr: { type: "checkbox" } });
      makeNoteCheck.checked = true;
      makeNote.createEl("span", { text: "운동 노트 없으면 만들고 target 저장" });

      const actions = this.contentEl.createDiv({ attr: { class: "workout-modal-actions" } });
      button(actions, "취소").onclick = () => this.close();
      const save = button(actions, "운동 추가", true);
      const doSave = async () => {
        const exerciseName = String(name.value || "").trim();
        if (!exerciseName) return notice("운동 이름을 입력해 주세요.");
        save.disabled = true;
        try {
          const target = targetFilter.get();
          if (makeNoteCheck.checked && objects.createExerciseObject) {
            await objects.createExerciseObject(this.app, exerciseName, {
              target: target || objects.suggestTargetFromName(exerciseName) || ""
            });
          }
          const next = appendExerciseToProgram(this.program, daySelect.value, {
            name: exerciseName,
            set_count: setCount.value,
            reps: reps.value,
            rpe: rpe.value,
            notes: notes.value
          });
          await persistProgram(this.app, this.state, next);
          this.close();
          notice(target
            ? `「${exerciseName}」 추가 (${target})`
            : `「${exerciseName}」을(를) 프로그램에 추가했습니다.`);
          await this.refresh();
        } catch (error) {
          save.disabled = false;
          notice(error.message || "운동 추가에 실패했습니다.");
        }
      };
      save.onclick = doSave;
      name.onkeydown = (ev) => {
        if (ev && (ev.key === "Enter" || ev.keyCode === 13)) {
          if (ev.preventDefault) ev.preventDefault();
          doSave();
        }
      };
    }
  }

  class CreateProgramModal extends ModalBase {
    constructor(app, state, refresh) {
      super(app);
      this.state = state;
      this.refresh = refresh;
    }
    onOpen() {
      this.contentEl.addClass("workout-modal");
      this.contentEl.createEl("h2", { text: "새 프로그램" });
      this.contentEl.createEl("p", {
        text: "이름과 첫 운동만 있으면 됩니다. 나중에 라이브러리에서 운동을 더 추가하세요.",
        attr: { class: "workout-muted" }
      });
      const title = setInput(this.contentEl, "프로그램 이름", "", { placeholder: "예: Base One, 홈트 A" });
      const goal = setInput(this.contentEl, "목표 (선택)", "", { placeholder: "예: 근비대" });
      const firstExercise = setInput(this.contentEl, "첫 운동", "", { placeholder: "예: 스쿼트" });
      const grid = this.contentEl.createDiv({ attr: { class: "workout-modal-grid" } });
      const setCount = setInput(grid, "세트 수", "3", { inputmode: "numeric" });
      const reps = setInput(grid, "횟수", "8", {});
      const rpe = setInput(grid, "RPE", "7", {});
      const actions = this.contentEl.createDiv({ attr: { class: "workout-modal-actions" } });
      button(actions, "취소").onclick = () => this.close();
      const save = button(actions, "만들기", true);
      save.onclick = async () => {
        const programTitle = String(title.value || "").trim();
        const exerciseName = String(firstExercise.value || "").trim();
        if (!programTitle) return notice("프로그램 이름을 입력해 주세요.");
        if (!exerciseName) return notice("첫 운동 이름을 입력해 주세요.");
        save.disabled = true;
        try {
          const draft = {
            id: uniqueId("program").replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 24) || `program_${Date.now().toString(36)}`,
            title: programTitle,
            goal: String(goal.value || "").trim(),
            source: "manual",
            days: [{
              id: "w1d1",
              week: 1,
              day: 1,
              label: "Week 1 Day 1",
              exercises: [{
                name: exerciseName,
                prescribed_sets: makePrescribedSets(setCount.value, reps.value, rpe.value)
              }]
            }]
          };
          const stored = await persistProgram(this.app, this.state, draft);
          this.close();
          notice(`「${stored.title}」 프로그램을 만들었습니다.`);
          await this.refresh();
        } catch (error) {
          save.disabled = false;
          notice(error.message || "프로그램 생성에 실패했습니다.");
        }
      };
    }
  }

  class ProgramEditorModal extends ModalBase {
    constructor(app, program, state, refresh) {
      super(app);
      this.program = clone(program);
      this.state = state;
      this.refresh = refresh;
      this.catalog = objects.listExerciseCatalog(app);
    }
    onOpen() {
      this.contentEl.addClass("workout-modal");
      this.contentEl.addClass("workout-program-editor");
      this.contentEl.createEl("h2", { text: "프로그램 편집" });
      this.contentEl.createEl("p", {
        text: "저장은 라이브러리 프로그램에만 반영됩니다. 이미 시작된 실행은 시작 시점 스냅샷을 유지합니다.",
        attr: { class: "workout-muted" }
      });
      this.meta = this.contentEl.createDiv({ attr: { class: "workout-editor-meta" } });
      this.titleInput = setInput(this.meta, "프로그램 이름", this.program.title);
      this.titleInput.oninput = () => { this.program.title = this.titleInput.value; };
      this.goalInput = setInput(this.meta, "목표", this.program.goal || "", { placeholder: "예: 근비대, 근력" });
      this.goalInput.oninput = () => { this.program.goal = this.goalInput.value; };
      this.errorBox = this.contentEl.createDiv({ attr: { class: "workout-editor-errors" } });
      this.editor = this.contentEl.createDiv({ attr: { class: "workout-editor-days" } });
      this.renderDays();
      const dayAdd = this.contentEl.createDiv({ attr: { class: "workout-inline-actions", style: "margin-top:8px;" } });
      button(dayAdd, "일차 추가").onclick = () => {
        const week = this.program.days.length ? Math.max(...this.program.days.map((d) => Number(d.week) || 1)) : 1;
        const dayNum = (this.program.days.filter((d) => Number(d.week) === week).length || 0) + 1;
        this.program.days.push({
          id: `w${week}d${dayNum}_${Date.now().toString(36)}`,
          week,
          day: dayNum,
          label: `Week ${week} Day ${dayNum}`,
          exercises: [],
        });
        this.renderDays();
      };
      const actions = this.contentEl.createDiv({ attr: { class: "workout-modal-actions" } });
      button(actions, "취소").onclick = () => this.close();
      const save = button(actions, "변경 저장", true);
      save.onclick = async () => {
        this.program.title = this.titleInput.value;
        this.program.goal = this.goalInput.value;
        const validation = core.validateProgram(this.program);
        this.errorBox.empty();
        if (!validation.ok) {
          validation.errors.forEach((msg) => this.errorBox.createEl("p", { text: msg, attr: { class: "workout-error" } }));
          return notice("저장 전에 오류를 수정해 주세요.");
        }
        save.disabled = true;
        try {
          await persistProgram(this.app, this.state, this.program);
          this.close();
          notice("프로그램을 저장했습니다. (진행 중 Run은 영향 없음)");
          await this.refresh();
        } catch (error) {
          save.disabled = false;
          notice(error.message || "프로그램을 저장하지 못했습니다.");
        }
      };
    }
    renderDays() {
      this.editor.empty();
      this.program.days.forEach((day, dayIndex) => {
        const block = this.editor.createDiv({ attr: { class: "workout-editor-day" } });
        const head = block.createDiv({ attr: { class: "workout-editor-day-head" } });
        head.createEl("h3", { text: `Day ${dayIndex + 1}` });
        const weekInput = setInput(head, "주차", String(day.week || 1), { inputmode: "numeric" });
        weekInput.oninput = () => { day.week = Number(weekInput.value) || 1; };
        const dayInput = setInput(head, "일차", String(day.day || 1), { inputmode: "numeric" });
        dayInput.oninput = () => { day.day = Number(dayInput.value) || 1; };
        iconButton(head, "×", "Day 삭제").onclick = () => {
          if (this.program.days.length <= 1) return notice("최소 하나의 Day가 필요합니다.");
          this.program.days.splice(dayIndex, 1);
          this.renderDays();
        };
        day.exercises.forEach((exercise, index) => this.renderExercise(block, day, exercise, index));
        const add = block.createDiv({ attr: { class: "workout-editor-add" } });
        if (!this._dayTarget) this._dayTarget = Object.create(null);
        if (this._dayTarget[day.id] == null) this._dayTarget[day.id] = "";
        const listId = `workout-exercises-${day.id}`;
        const choices = add.createEl("datalist", { attr: { id: listId } });
        let name = null;
        const fillChoices = (query) => {
          root.app = this.app;
          fillExerciseDatalist(choices, query, this._dayTarget[day.id] || "", 30);
        };
        renderTargetFilter(add, {
          label: "부위 필터",
          initial: this._dayTarget[day.id],
          onChange: (v) => {
            this._dayTarget[day.id] = v;
            fillChoices(name ? name.value : "");
          }
        });
        name = add.createEl("input", {
          attr: {
            type: "text",
            placeholder: "운동 이름 검색 또는 입력 후 Enter",
            "aria-label": "추가할 운동 이름",
            list: listId,
          }
        });
        fillChoices("");
        name.oninput = () => fillChoices(name.value);
        const addExercise = () => {
          const value = String(name.value || "").trim();
          if (!value) return notice("운동 이름을 입력해 주세요.");
          day.exercises.push({
            id: `exercise_${core.stableHash(`${day.id}:${Date.now()}:${value}`)}`,
            name: value,
            target: "",
            notes: "",
            prescribed_sets: [{ reps: "8", rpe: "7", target: "", rest: "" }],
          });
          name.value = "";
          this.renderDays();
        };
        name.onkeydown = (ev) => {
          if (ev && (ev.key === "Enter" || ev.keyCode === 13)) {
            if (ev.preventDefault) ev.preventDefault();
            addExercise();
          }
        };
        button(add, "운동 추가", true).onclick = addExercise;
      });
    }
    renderExercise(parent, day, exercise, index) {
      const card = parent.createDiv({ attr: { class: "workout-editor-exercise" } });
      const heading = card.createDiv({ attr: { class: "workout-editor-heading" } });
      const name = heading.createEl("input", { attr: { type: "text", "aria-label": "운동 이름" } });
      name.value = exercise.name;
      name.oninput = () => { exercise.name = name.value; };
      const controls = heading.createDiv({ attr: { class: "workout-editor-controls" } });
      iconButton(controls, "↑", "위로 이동").onclick = () => {
        if (index > 0) {
          [day.exercises[index - 1], day.exercises[index]] = [day.exercises[index], day.exercises[index - 1]];
          this.renderDays();
        }
      };
      iconButton(controls, "↓", "아래로 이동").onclick = () => {
        if (index < day.exercises.length - 1) {
          [day.exercises[index + 1], day.exercises[index]] = [day.exercises[index], day.exercises[index + 1]];
          this.renderDays();
        }
      };
      iconButton(controls, "⧉", "운동 복제").onclick = () => {
        const copy = clone(exercise);
        copy.id = `exercise_${core.stableHash(`${day.id}:${Date.now()}:${copy.name}`)}`;
        day.exercises.splice(index + 1, 0, copy);
        this.renderDays();
      };
      iconButton(controls, "×", "운동 삭제").onclick = () => {
        day.exercises.splice(index, 1);
        this.renderDays();
      };
      if (objects.exerciseObjectExists(this.app, exercise.name)) {
        button(controls, "팝업").onclick = () => openExercisePopup(this.app, exercise.name, this.state.sessions);
        button(controls, "노트").onclick = () => openExerciseNoteSide(this.app, exercise.name);
      } else {
        button(controls, "노트 만들기").onclick = () => openExercisePopup(this.app, exercise.name, this.state.sessions);
      }
      const note = setInput(card, "운동 메모", exercise.notes || "", { placeholder: "선택 사항" });
      note.oninput = () => { exercise.notes = note.value; };
      const sets = card.createDiv({ attr: { class: "workout-editor-sets" } });
      exercise.prescribed_sets.forEach((set, setIndex) => {
        const row = sets.createDiv({ attr: { class: "workout-editor-set" } });
        row.createEl("strong", { text: `${setIndex + 1}세트` });
        [["횟수", "reps"], ["RPE", "rpe"], ["목표", "target"], ["휴식", "rest"]].forEach(([label, key]) => {
          const input = setInput(row, label, set[key], { placeholder: label });
          input.oninput = () => { set[key] = input.value; };
        });
        iconButton(row, "×", "세트 삭제").onclick = () => {
          if (exercise.prescribed_sets.length > 1) {
            exercise.prescribed_sets.splice(setIndex, 1);
            this.renderDays();
          }
        };
      });
      button(card, "세트 추가").onclick = () => {
        exercise.prescribed_sets.push({ reps: "", rpe: "", target: "", rest: "" });
        this.renderDays();
      };
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
      button(actions, "프로그램 저장", true).onclick = async () => {
        try {
          const candidate = this.result.candidates[Number(select.value) || 0];
          const program = await objects.saveProgramObject(this.app, candidate.program);
          await createStore(this.app).saveProgram(program);
          this.close();
          notice(`${candidate.title} 프로그램을 저장했습니다.`);
          await this.refresh();
        } catch (error) {
          notice(error.message || "저장에 실패했습니다.");
        }
      };
    }
  }

  root.WorkoutModals = Object.freeze({
    RunConflictModal, QuickWorkoutModal, ProgramHistoryModal,
    RenameProgramModal, CreateExerciseModal, ExerciseDetailModal,
    AddExerciseToProgramModal, CreateProgramModal,
    ProgramEditorModal, ImportProgramModal,
  });
  if (typeof module !== "undefined" && module.exports) module.exports = root.WorkoutModals;
})(typeof globalThis !== "undefined" ? globalThis : this);
