(function (root) {
  "use strict";

  const core = root.WorkoutCore || (typeof require === "function" ? require("./workout-core.js") : null);
  const storeApi = root.WorkoutStore || (typeof require === "function" ? require("./workout-store.js") : null);
  const importer = root.WorkoutImport || (typeof require === "function" ? require("./workout-import.js") : null);
  const objects = root.WorkoutProgramObjects || (typeof require === "function" ? require("./workout-program-objects.js") : null);
  const exerciseLibrary = root.WorkoutExerciseLibrary || (typeof require === "function" ? require("./workout-exercise-library.js") : null);
  const analysis = root.WorkoutAnalysis || (typeof require === "function" ? require("./workout-analysis.js") : null);
  const modals = root.WorkoutModals || (typeof require === "function" ? require("./workout-modals.js") : null);
  const sessionFlow = root.WorkoutSessionFlow || (typeof require === "function" ? require("./workout-session-flow.js") : null);
  const sessionUI = root.WorkoutSessionUI || (typeof require === "function" ? require("./workout-session-ui.js") : null);
  const captureWriter = root.WorkoutCaptureWriter || (typeof require === "function" ? require("./workout-capture-writer.js") : null);
  const captureRuntime = root.CaptureActionRuntime || (typeof require === "function" ? require("./capture-action-runtime.js") : null);

  /**
   * Modal base must never be undefined — `class X extends undefined` aborts the whole
   * script load (Obsidian hub then shows “워크스페이스를 불러오지 못했습니다”).
   */
  class FallbackModal {
    constructor(app) {
      this.app = app;
      this.contentEl = {
        _nodes: [],
        empty() { this._nodes = []; if (this.el && this.el.empty) this.el.empty(); },
        addClass() {},
        createEl() { return { onclick: null, createEl() { return {}; }, createDiv() { return { createEl() { return {}; }, createDiv() { return {}; }, empty() {} }; }, empty() {}, textContent: "", value: "", oninput: null, onchange: null, checked: false, disabled: false, files: [], className: "", setAttribute() {}, getAttribute() { return ""; } }; },
        createDiv() { return this.createEl("div"); },
      };
    }
    open() { if (typeof this.onOpen === "function") this.onOpen(); }
    close() { if (typeof this.onClose === "function") this.onClose(); }
  }
  const ModalBase = (root.obsidian && root.obsidian.Modal)
    || (typeof root.Modal === "function" ? root.Modal : null)
    || FallbackModal;
  let saveQueue = Promise.resolve();
  const draftSaveStates = new Map();

  function notice(message) { const Notice = root.obsidian && root.obsidian.Notice ? root.obsidian.Notice : root.Notice; if (Notice) new Notice(message); }
  function today() { const date = new Date(); return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`; }
  function uniqueId(prefix) { return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`; }
  function createStore(app) { return storeApi.createWorkoutStore(storeApi.createObsidianAdapter(app)); }
  function button(parent, label, primary = false) { return parent.createEl("button", { text: label, attr: { type: "button", class: primary ? "prodigy-btn prodigy-btn-primary mod-cta workout-button" : "prodigy-btn workout-button" } }); }
  function section(parent, title, subtitle = "") { const area = parent.createDiv({ attr: { class: "workout-section prodigy-utility-card" } }); area.createEl("h2", { text: title }); if (subtitle) area.createEl("p", { text: subtitle, attr: { class: "workout-section-copy" } }); return area; }
  function empty(parent, message) { parent.createEl("p", { text: message, attr: { class: "workout-empty" } }); }
  function statusLabel(status) { return ({ active: "진행 중", paused: "일시정지", completed: "완료", abandoned: "중단" })[status] || status; }

  function clone(value) { return JSON.parse(JSON.stringify(value)); }
  function iconButton(parent, label, title) {
    const control = button(parent, label);
    control.setAttr && control.setAttr("aria-label", title);
    control.setAttr && control.setAttr("title", title);
    return control;
  }

  async function journalMetrics(app) {
    if (!app.vault.getMarkdownFiles || !app.metadataCache) return null;
    const date = today();
    const file = app.vault.getMarkdownFiles().find((item) => item.basename === date || item.path.includes(date));
    if (!file) return null;
    const frontmatter = (app.metadataCache.getFileCache(file) || {}).frontmatter || {};
    const first = (...keys) => keys.map((key) => frontmatter[key]).find((value) => value !== undefined && value !== null && String(value).trim() !== "");
    const values = {
      "체중": first("body_weight", "weight", "체중"),
      "수면": first("sleep", "sleep_hours", "수면"),
      "컨디션": first("condition", "컨디션"),
      "에너지": first("energy", "에너지"),
    };
    return Object.entries(values).filter(([, value]) => value !== undefined);
  }

  async function loadWorkoutNotes(app) {
    if (!app || !app.vault || !app.vault.getMarkdownFiles) return [];
    const folder = "PARA/PROJECTS/Workout/";
    return app.vault.getMarkdownFiles()
      .filter((file) => file && file.path && file.path.startsWith(folder) && !file.path.includes("/Exports/"))
      .map((file) => {
        const cache = app.metadataCache && app.metadataCache.getFileCache
          ? app.metadataCache.getFileCache(file)
          : null;
        const fm = (cache && cache.frontmatter) || {};
        const type = String(fm.type || "").trim();
        if (type && type !== "workout") return null;
        // Skip program notes
        if (type === "workout_program") return null;
        const status = String(fm.status || "").trim() || "planned";
        return {
          path: file.path,
          title: fm.title || file.basename,
          status,
          next_action: fm.next_action || "",
          workout_type: fm.workout_type || "",
          due_date: fm.due_date || "",
          priority: fm.priority,
          review_status: fm.review_status || ""
        };
      })
      .filter(Boolean)
      .filter((note) => ["doing", "planned", "active"].includes(String(note.status)))
      .sort((a, b) => String(a.due_date || "9999").localeCompare(String(b.due_date || "9999")));
  }

  async function loadState(app) {
    const store = createStore(app);
    const [cachedPrograms, objectPrograms, runs, sessions, workoutNotes] = await Promise.all([
      store.listPrograms(),
      objects.loadProgramObjects(app),
      store.listRuns(),
      store.listSessions(),
      loadWorkoutNotes(app)
    ]);
    const programsById = new Map(cachedPrograms.map((program) => [program.id, program]));
    objectPrograms.forEach((program) => programsById.set(program.id, program));
    const programs = [...programsById.values()].sort((left, right) => left.title.localeCompare(right.title, "ko"));
    const activeRun = runs.find((run) => run.status === "active") || null;
    const libraryProgram = activeRun ? programs.find((program) => program.id === activeRun.program_id) || null : null;
    // Version safety: Run snapshot wins over library edits
    const activeProgram = activeRun
      ? (core.programForRun(libraryProgram, activeRun) || libraryProgram)
      : null;
    const strengthDrafts = sessions
      .filter((session) => session && session.status === "draft" && core.normalizeSessionKind(session) !== "quick")
      .sort((left, right) => String(right.started_at || right.date).localeCompare(String(left.started_at || left.date)));
    const persistedDraft = strengthDrafts.find((session) => session.runner_active === true) || strengthDrafts[0] || null;
    const draftState = persistedDraft && draftSaveStates.get(persistedDraft.session_id);
    const draft = draftState && (draftState.dirty || draftState.pending || draftState.failed)
      ? draftState.session
      : persistedDraft;
    const effectiveSessions = draft && draftState && (draftState.dirty || draftState.pending || draftState.failed)
      ? sessions.map((session) => session.session_id === draft.session_id ? draft : session)
      : sessions;
    const base = {
      store, programs, runs, sessions: effectiveSessions, activeRun, activeProgram, libraryProgram, draft,
      metrics: await journalMetrics(app),
      workoutNotes
    };
    base.model = core.buildWorkspaceModel(base);
    try {
      root.__workoutWorkspaceModel = base.model;
    } catch (_e) { /* optional share */ }
    return base;
  }

  /** Popup only — never opens the note leaf. */
  function openExercisePopup(app, name, sessions) {
    const existing = objects.findExerciseFile(app, name);
    if (existing) {
      new ExerciseDetailModal(app, name, sessions || []).open();
      return true;
    }
    new CreateExerciseModal(app, name, sessions || []).open();
    return false;
  }

  /**
   * Open exercise markdown in ONE reusable side leaf.
   * Clicking another exercise's 「노트」 replaces the same pane (does not stack tabs).
   */
  async function openExerciseNoteSide(app, name) {
    const file = objects.findExerciseFile(app, name);
    if (!file) {
      notice("운동 노트가 없습니다. 이름 옆 팝업에서 만들 수 있습니다.");
      return false;
    }
    try {
      const ws = app.workspace;
      let leaf = null;

      // 1) Prefer the leaf we opened last (same side pane swaps file)
      if (root.__workoutNoteLeaf && !root.__workoutNoteLeaf.isDeferred) {
        try {
          const stillThere = ws.getLeavesOfType
            ? ws.getLeavesOfType("markdown").includes(root.__workoutNoteLeaf)
            : true;
          // If leaf was closed, parent/detach leaves no view
          if (stillThere && root.__workoutNoteLeaf.view) leaf = root.__workoutNoteLeaf;
        } catch (_e) {
          leaf = null;
        }
      }

      // 2) Right sidebar existing leaf
      if (!leaf && typeof ws.getRightLeaf === "function") {
        leaf = ws.getRightLeaf(false) || ws.getRightLeaf(true);
      }

      // 3) Split once if needed
      if (!leaf && typeof ws.getLeaf === "function") {
        leaf = ws.getLeaf("split");
      }

      if (leaf && typeof leaf.openFile === "function") {
        await leaf.openFile(file, { active: true });
        root.__workoutNoteLeaf = leaf;
        if (typeof ws.revealLeaf === "function") ws.revealLeaf(leaf);
        return true;
      }

      // Fallback
      if (typeof ws.openLinkText === "function") {
        await ws.openLinkText(file.path.replace(/\.md$/, ""), "", "split");
        return true;
      }
      notice("이 환경에서는 사이드 열기를 지원하지 않습니다.");
      return false;
    } catch (error) {
      notice(error.message || "노트를 열지 못했습니다.");
      return false;
    }
  }

  /** @deprecated use openExercisePopup / openExerciseNoteSide */
  async function openExerciseObject(app, name, sessions) {
    return openExercisePopup(app, name, sessions);
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
    await sessionFlow.startDraft(root.app, state, session, refresh);
  }

  function previousText(previous) {
    if (!previous) return "이 실행에서 이전 기록 없음";
    return [previous.weight && `${previous.weight} kg`, previous.reps && `${previous.reps}회`, previous.rpe && `RPE ${previous.rpe}`].filter(Boolean).join(" · ");
  }

  /** Derived PR line from sessions — not stored on Exercise Object. */
  function bestText(best) {
    if (!best) return "";
    return [best.weight && `${best.weight} kg`, best.reps && `${best.reps}회`, best.e1rm && `e1RM ${best.e1rm}`].filter(Boolean).join(" · ");
  }

  function recordStripText(previous, best) {
    const parts = [];
    if (previous && (previous.weight || previous.reps)) parts.push(`이전 ${previousText(previous)}`);
    else parts.push("이전 기록 없음");
    const b = bestText(best);
    if (b) parts.push(`최고 ${b}`);
    return parts.join(" · ");
  }

  /** Body-part filter chips for exercise pickers. Returns { get, set, el }. */
  function renderTargetFilter(parent, options = {}) {
    const targets = (objects && objects.EXERCISE_TARGETS) || [];
    const state = { value: options.initial || "" };
    const wrap = parent.createDiv({ attr: { class: "workout-target-filter" } });
    wrap.createEl("div", {
      text: options.label || "부위 (target)",
      attr: { class: "workout-muted", style: "margin-bottom:var(--ke-space-2);font-weight:650;" }
    });
    const row = wrap.createDiv({ attr: { class: "workout-target-chips" } });
    const paint = () => {
      row.empty();
      const all = row.createEl("button", {
        text: "전체",
        attr: {
          type: "button",
          class: !state.value ? "workout-button mod-cta workout-chip-btn" : "workout-button workout-chip-btn"
        }
      });
      all.onclick = () => { state.value = ""; paint(); if (options.onChange) options.onChange(state.value); };
      targets.forEach((t) => {
        const on = state.value === t.id;
        const chip = row.createEl("button", {
          text: `${t.label}`,
          attr: {
            type: "button",
            class: on ? "workout-button mod-cta workout-chip-btn" : "workout-button workout-chip-btn",
            title: t.id
          }
        });
        chip.onclick = () => {
          state.value = on ? "" : t.id;
          paint();
          if (options.onChange) options.onChange(state.value);
        };
      });
    };
    paint();
    return {
      get: () => state.value,
      set: (v) => { state.value = (objects.normalizeTarget && objects.normalizeTarget(v)) || ""; paint(); },
      el: wrap
    };
  }

  function fillExerciseDatalist(choicesEl, query, target, limit = 40) {
    if (!choicesEl) return;
    if (choicesEl.empty) choicesEl.empty();
    const hits = objects.searchExercises
      ? objects.searchExercises(root.app || {}, query, limit, {
        target: target || "",
        include_untargeted: true
      })
      : [];
    hits.forEach((item) => {
      const label = item.target
        ? `${item.name} · ${item.target_label || item.target}`
        : item.name;
      // option value stays the exercise name for clean selection
      const opt = choicesEl.createEl("option", { value: item.name });
      if (opt && label !== item.name) {
        try { opt.text = label; } catch (_e) { /* optional */ }
      }
    });
  }

  function draftSaveStateFor(session) {
    const sessionId = session && session.session_id;
    if (!sessionId) return null;
    let state = draftSaveStates.get(sessionId);
    if (!state) {
      state = {
        session,
        dirty: false,
        pending: false,
        failed: null,
        promise: null,
        version: 0,
      };
      draftSaveStates.set(sessionId, state);
    } else {
      state.session = session;
    }
    return state;
  }

  function enqueueDraftSave(store, session, snapshot, options = {}) {
    const state = draftSaveStateFor(session);
    if (!state) return Promise.reject(new Error("초안 세션 식별자가 없습니다."));
    state.dirty = true;
    state.pending = true;
    state.failed = null;
    const version = ++state.version;
    const payload = clone(snapshot || session);
    const run = saveQueue.then(() => store.saveSession(payload));
    state.promise = run;
    // A failed write must not poison the queue for later retries.
    saveQueue = run.catch(() => {});
    run.then(() => {
      if (state.version !== version) return;
      state.dirty = false;
      state.pending = false;
      state.failed = null;
    }).catch((error) => {
      if (state.version !== version) return;
      state.dirty = true;
      state.pending = false;
      state.failed = error;
      if (options.notify !== false) notice("운동 기록을 저장하지 못했습니다. 입력은 유지됩니다. 다시 시도하세요.");
      if (root.prodigyDebugMode === true) console.error(error);
    });
    return run;
  }

  function queueDraftSave(store, session) {
    return enqueueDraftSave(store, session, session);
  }

  function queueCompletedSave(store, draftSession, completedSession) {
    return enqueueDraftSave(store, draftSession, completedSession, { notify: false });
  }

  async function waitForDraftSave(session) {
    const state = draftSaveStateFor(session);
    if (!state || !state.promise) return state;
    try {
      await state.promise;
    } catch (_error) {
      // The state retains the failure so completion can gate and retry.
    }
    return state;
  }

  function markDraftSaveFailure(session, error) {
    const state = draftSaveStateFor(session);
    if (!state) return;
    state.dirty = true;
    state.pending = false;
    state.failed = error;
    state.promise = Promise.reject(error);
    state.promise.catch(() => {});
  }

  function setInput(parent, label, value, options = {}) {
    const field = parent.createDiv({ attr: { class: "workout-field" } });
    field.createEl("label", { text: label });
    const input = field.createEl(options.multiline ? "textarea" : "input", { attr: { type: options.type || "text", inputmode: options.inputmode || "text", placeholder: options.placeholder || "" } });
    input.value = value || "";
    return input;
  }

  function renderProgressBar(parent, progress) {
    if (!progress || !progress.total) return;
    const wrap = parent.createDiv({ attr: { class: "workout-progress" } });
    wrap.createEl("div", {
      text: `${progress.label}${progress.next_label ? ` · 다음 ${progress.next_label}` : ""}`,
      attr: { class: "workout-progress-label" }
    });
    const track = wrap.createDiv({ attr: { class: "workout-progress-track" } });
    track.createDiv({
      attr: {
        class: "workout-progress-fill",
        style: `width:${Math.min(100, Math.max(0, progress.percent))}%;`
      }
    });
  }

  function renderContinueStrip(parent, state, refresh) {
    const model = state.model || core.buildWorkspaceModel(state);
    const cont = model.continue_target;
    const box = parent.createDiv({ attr: { class: "workout-continue-strip" } });
    box.createEl("div", {
      text: "▶ 계속",
      attr: { class: "workout-continue-kicker" }
    });
    if (!cont || cont.empty) {
      box.createEl("div", {
        text: cont && cont.message ? cont.message : "진행 중인 프로그램이 없습니다.",
        attr: { class: "workout-empty" }
      });
      return;
    }
    const continueTitle = cont.kind === "resume_draft" && state.draft
      ? `${sessionFlow.kindLabel(state.draft)} · ${cont.title || "오늘 운동"}`
      : (cont.title || "오늘 운동");
    box.createEl("div", { text: continueTitle, attr: { class: "workout-continue-title" } });
    if (cont.detail) {
      box.createEl("div", { text: cont.detail, attr: { class: "workout-muted" } });
    }
    if (cont.progress_label) {
      box.createEl("div", {
        text: cont.progress_label,
        attr: { class: "workout-muted", style: "font-weight:700;" }
      });
    }
    if (cont.reason) {
      const r = box.createDiv({ attr: { class: "workout-continue-reason" } });
      r.createEl("span", { text: "이유 ", attr: { style: "font-weight:700;color:var(--ke-color-muted);" } });
      r.createEl("span", { text: cont.reason });
    }
    if (state.metrics && state.metrics.length) {
      const bits = state.metrics.map(([k, v]) => `${k} ${v}`).join(" · ");
      box.createEl("div", { text: bits, attr: { class: "workout-muted", style: "margin-top:var(--ke-space-2);" } });
    }
    const actions = box.createDiv({ attr: { class: "workout-inline-actions", style: "margin-top:var(--ke-space-3);" } });
    if (cont.kind === "resume_draft") {
      button(actions, "이어서 기록", true).onclick = () => {
        const el = parent.querySelector && parent.querySelector(".workout-session-live");
        if (el && el.scrollIntoView) el.scrollIntoView({ behavior: "smooth", block: "start" });
        else notice("아래 세션에서 이어서 기록하세요.");
      };
    } else if (cont.kind === "start_day" && cont.day_id) {
      button(actions, "오늘 운동 시작", true).onclick = () => startDay(state, cont.day_id, refresh);
    } else if (cont.kind === "run_done") {
      button(actions, "실행 완료", true).onclick = () => setRunStatus(state, state.activeRun, "completed", refresh);
    }
  }

  function renderDraftQueue(parent, state, refresh) {
    const drafts = (state.model && state.model.drafts) || core.listDraftSessions(state.sessions);
    if (!drafts.length) return;
    const area = section(parent, "미완료 세션", "초안을 이어 쓰거나 버립니다.");
    drafts.forEach((item) => {
      const row = area.createDiv({ attr: { class: "workout-history-row" } });
      const left = row.createDiv();
      left.createEl("strong", { text: item.label });
      left.createEl("span", {
        text: [item.program_title, item.date, item.reason].filter(Boolean).join(" · ")
      });
      const actions = row.createDiv({ attr: { class: "workout-inline-actions" } });
      const isActiveDraft = state.draft && state.draft.session_id === item.session_id;
      if (isActiveDraft) {
        button(actions, "기록 중").disabled = true;
      } else {
        button(actions, "이 초안 열기", true).onclick = async () => {
          await sessionFlow.activateDraft(state, item.session_id);
          await refresh();
        };
      }
      button(actions, "버리기").onclick = async () => {
        if (root.confirm && !root.confirm("이 초안 세션을 삭제할까요? 완료 기록은 건드리지 않습니다.")) return;
        try {
          await state.store.deleteDerived("sessions", item.session_id);
          notice("초안을 삭제했습니다.");
          await refresh();
        } catch (error) {
          notice(error.message || "초안 삭제에 실패했습니다.");
        }
      };
    });
  }

  function renderStaleQueue(parent, state, refresh) {
    const items = (state.model && state.model.stale_runs) || [];
    if (!items.length) return;
    const area = section(parent, "오래 방치", "최근 완료 세션이 없는 실행입니다.");
    items.forEach((item) => {
      const row = area.createDiv({ attr: { class: "workout-history-row" } });
      const left = row.createDiv();
      left.createEl("strong", { text: `${item.program_title} · 실행 #${item.run_number}` });
      left.createEl("span", { text: `${statusLabel(item.status)} · ${item.reason}` });
      const actions = row.createDiv({ attr: { class: "workout-inline-actions" } });
      if (item.status === "paused") {
        button(actions, "이어서 실행", true).onclick = async () => {
          if (state.activeRun) return notice("다른 실행이 진행 중입니다. 먼저 정리하세요.");
          const run = state.runs.find((r) => r.run_id === item.run_id);
          if (!run) return;
          await state.store.saveRun(core.transitionProgramRun(run, "active"));
          notice("실행을 재개했습니다.");
          await refresh();
        };
      }
      button(actions, "중단").onclick = async () => {
        const run = state.runs.find((r) => r.run_id === item.run_id);
        if (!run) return;
        await setRunStatus(state, run, "abandoned", refresh);
      };
    });
  }

  function startRestTimer(controller, bar, seconds) {
    controller.clearRestTimer();
    const timerEl = bar.querySelector(".workout-rest-timer");
    if (!timerEl || !controller.isActive()) return;
    let remaining = seconds;
    const endsAt = Date.now() + remaining * 1000;
    timerEl.hidden = false;
    const label = timerEl.querySelector(".workout-rest-label");
    const controls = timerEl.querySelector(".workout-rest-controls");

    function tick() {
      remaining = Math.max(0, Math.round((endsAt - Date.now()) / 1000));
      const m = Math.floor(remaining / 60);
      const s = remaining % 60;
      label.textContent = `${m}:${String(s).padStart(2, "0")}`;
      if (remaining <= 0) controller.clearRestTimer();
    }
    tick();
    controller.startRestTimer(tick, 1000);

    controls.empty();
    const minus = controls.createEl("button", { text: "-30초", attr: { class: "prodigy-btn workout-button workout-chip-btn prodigy-configurator-chip", type: "button" } });
    const plus = controls.createEl("button", { text: "+30초", attr: { class: "prodigy-btn workout-button workout-chip-btn prodigy-configurator-chip", type: "button" } });
    const skip = controls.createEl("button", { text: "건너뛰기", attr: { class: "prodigy-btn workout-button workout-chip-btn prodigy-configurator-chip", type: "button" } });
    minus.onclick = () => startRestTimer(controller, bar, Math.max(10, remaining - 30));
    plus.onclick = () => startRestTimer(controller, bar, remaining + 30);
    skip.onclick = () => { controller.clearRestTimer(); timerEl.hidden = true; };
  }

  function renderSession(parent, state, refresh, controller) {
    if (!state.draft) return;
    const session = state.draft;
    const area = section(parent, `${sessionFlow.kindLabel(session)} · ${core.dayLabel(session) || session.title || "오늘 세션"}`, "필수: 완료 체크 · 중량/횟수. 이전이 있으면 원탭 복제.");
    area.addClass && area.addClass("workout-session-live");
    area.addClass && area.addClass("prodigy-full-bleed");
    if (!area.classList || !area.classList.contains("workout-session-live")) {
      area.setAttribute && area.setAttribute("class", `${area.getAttribute("class") || ""} workout-session-live prodigy-full-bleed`.trim());
    }

    // ─── Sticky Session Bar ───────────────────────────────────────────
    const progress = core.sessionProgress(session);
    const nextSet = core.nextIncompleteSet(session);
    const stickyBar = area.createDiv({ attr: { class: "workout-session-bar" } });
    const barInfo = stickyBar.createDiv({ attr: { class: "workout-session-bar-info" } });
    barInfo.createEl("strong", { text: nextSet ? nextSet.exercise_name : "모든 세트 완료" });
    barInfo.createEl("span", { text: `${progress.done}/${progress.total} 세트`, attr: { class: "workout-muted" } });
    // Progress track
    const track = stickyBar.createDiv({ attr: { class: "workout-progress-track" } });
    const fill = track.createDiv({ attr: { class: "workout-progress-fill" } });
    if (fill.style) fill.style.width = progress.percent + "%";
    // Rest timer (hidden until triggered)
    const timerWrap = stickyBar.createDiv({ attr: { class: "workout-rest-timer", hidden: "" } });
    timerWrap.createEl("span", { text: "0:00", attr: { class: "workout-rest-label" } });
    timerWrap.createDiv({ attr: { class: "workout-rest-controls" } });
    // Next incomplete jump
    if (nextSet) {
      const jumpBtn = stickyBar.createEl("button", { text: "다음 세트 ↓", attr: { class: "workout-button workout-chip-btn workout-next-set-btn", type: "button" } });
      jumpBtn.onclick = () => {
        const cards = area.querySelectorAll ? area.querySelectorAll(".workout-exercise-card") : [];
        const exerciseIndex = (session.exercise_results || []).findIndex((e) => e.exercise_id === nextSet.exercise_id);
        if (exerciseIndex >= 0 && cards[exerciseIndex]) cards[exerciseIndex].scrollIntoView({ behavior: "smooth", block: "center" });
      };
    }

    const dayActions = area.createDiv({ attr: { class: "workout-inline-actions" } });
    const saveFeedback = area.createDiv({ attr: { class: "workout-draft-save-status", role: "status", "aria-live": "polite" } });
    const paintSaveFeedback = () => {
      const saveState = draftSaveStateFor(session);
      saveFeedback.empty();
      if (!saveState || (!saveState.dirty && !saveState.pending && !saveState.failed)) return;
      if (saveState.pending) {
        saveFeedback.createEl("span", { text: "입력 저장 중…", attr: { class: "workout-muted" } });
        return;
      }
      if (saveState.failed) {
        saveFeedback.createEl("span", { text: "저장하지 못했습니다. 입력은 유지됩니다.", attr: { class: "workout-error" } });
        const retry = saveFeedback.createEl("button", { text: "저장 다시 시도", attr: { class: "prodigy-btn workout-button workout-chip-btn prodigy-configurator-chip", type: "button" } });
        retry.onclick = async () => {
          const wasFocused = typeof document !== "undefined" && document.activeElement === retry;
          retry.disabled = true;
          retry.textContent = "저장 중…";
          try {
            await queueDraftSave(state.store, session);
            paintSaveFeedback();
            if (wasFocused) {
              const input = area.querySelector && area.querySelector(".workout-field input, .workout-field textarea");
              if (input && input.focus) input.focus();
            }
            notice("운동 기록을 저장했습니다.");
          } catch (_error) {
            paintSaveFeedback();
            if (wasFocused) {
              const nextRetry = saveFeedback.querySelector && saveFeedback.querySelector("button");
              if (nextRetry && nextRetry.focus) nextRetry.focus();
            }
          }
        };
        return;
      }
      saveFeedback.createEl("span", { text: "저장 대기 중…", attr: { class: "workout-muted" } });
    };
    paintSaveFeedback();
    const requestDraftSave = () => {
      const pending = queueDraftSave(state.store, session);
      paintSaveFeedback();
      pending.then(paintSaveFeedback).catch(paintSaveFeedback);
      return pending;
    };
    button(dayActions, "초안 버리기").onclick = async () => {
      if (root.confirm && !root.confirm("진행 중 초안을 삭제할까요?")) return;
      await saveQueue;
      try {
        await state.store.deleteDerived("sessions", session.session_id);
        notice("초안을 삭제했습니다.");
        await refresh();
      } catch (error) {
        notice(error.message || "삭제 실패");
      }
    };
    sessionUI.renderFreeDraftTools(area, { app: root.app, state, session, refresh });

    session.exercise_results.forEach((exercise) => sessionUI.renderExerciseCard(area, {
      app: root.app,
      state,
      session,
      exercise,
      refresh,
      stickyBar,
      requestDraftSave,
      startRestTimer: (bar, seconds) => startRestTimer(controller, bar, seconds),
      helpers: {
        openExercisePopup,
        openExerciseNoteSide,
        previousText,
        recordStripText,
        setInput,
      },
    }));

    const finish = button(area, "운동 완료", true);
    finish.onclick = async () => {
      finish.disabled = true;
      try {
        const saveState = await waitForDraftSave(session);
        paintSaveFeedback();
        if (saveState && (saveState.pending || saveState.failed || saveState.dirty)) {
          notice(saveState.pending
            ? "입력 저장이 끝날 때까지 완료할 수 없습니다."
            : "저장에 실패했습니다. 입력을 보존한 뒤 다시 시도하세요.");
          finish.disabled = false;
          return;
        }
        let note = "";
        if (typeof root.obsidianPrompt === "function") {
          const input = await root.obsidianPrompt("운동 완료", "한 줄 메모 (선택):", "");
          if (input === null) {
            finish.disabled = false;
            return;
          }
          note = String(input || "").trim();
        }
        if (note) {
          // attach to first exercise notes as session-level signal without new schema
          if (session.exercise_results && session.exercise_results[0]) {
            const existing = session.exercise_results[0].notes || "";
            session.exercise_results[0].notes = existing ? `${existing}\n[세션] ${note}` : `[세션] ${note}`;
          }
        }
        const result = core.completeWorkoutSession(
          session,
          state.activeProgram,
          state.activeRun,
          state.sessions.filter((item) => item.session_id !== session.session_id)
        );
        try {
          await queueCompletedSave(state.store, session, { ...result.session, runner_active: false });
        } catch (error) {
          markDraftSaveFailure(session, error);
          paintSaveFeedback();
          finish.disabled = false;
          notice(error.message || "완료 저장 실패. 입력을 유지했습니다.");
          return;
        }
        if (core.normalizeSessionKind(session) === "programmed") {
          await state.store.saveRun(result.run);
          const nextLabel = result.run.suggested_day && state.activeProgram
            ? core.dayLabel(state.activeProgram.days.find((d) => d.id === result.run.suggested_day) || {})
            : "";
          notice(result.run.status === "completed"
            ? "프로그램 실행을 완료했습니다."
            : (nextLabel ? `운동 완료 · 다음 ${nextLabel}` : "운동을 완료했습니다."));
        } else {
          notice("자유운동을 완료했습니다.");
        }
        await refresh();
      } catch (error) {
        finish.disabled = false;
        notice(error.message || "완료 실패");
      }
    };
  }

  function renderCurrent(parent, state, refresh) {
    const area = section(parent, "현재 프로그램", "완료 세션 기준 다음 Day 제안");
    if (!state.activeRun || !state.activeProgram) {
      empty(area, "진행 중인 프로그램이 없습니다. 시작 전에도 주차·요일 배정을 확인하고 편집할 수 있습니다.");
      sessionUI.renderScheduleAccess(area, state, (program) => new ProgramEditorModal(root.app, program, state, refresh).open());
      return;
    }
    const summary = area.createDiv({ attr: { class: "workout-current" } });
    const identity = summary.createDiv();
    identity.createEl("h3", { text: state.activeProgram.title });
    identity.createEl("p", { text: `실행 #${state.activeRun.run_number} · ${statusLabel(state.activeRun.status)}` });
    const progress = (state.model && state.model.progress) || core.runProgress(state.activeProgram, state.sessions, state.activeRun.run_id);
    renderProgressBar(identity, progress);
    const actions = summary.createDiv({ attr: { class: "workout-inline-actions" } });
    button(actions, "일시정지").onclick = () => setRunStatus(state, state.activeRun, "paused", refresh);
    button(actions, "중단").onclick = () => setRunStatus(state, state.activeRun, "abandoned", refresh);
    const chooser = area.createDiv({ attr: { class: "workout-day-chooser" } });
    const select = chooser.createEl("select", { attr: { "aria-label": "프로그램 Day 선택" } });
    state.activeProgram.days.forEach((day) => {
      const completed = state.sessions.some((session) => session.program_run_id === state.activeRun.run_id && session.program_day_id === day.id && session.status === "completed");
      select.createEl("option", {
        text: `${day.week}주차 ${day.day}일차${completed ? " · 완료" : ""}`,
        value: day.id
      });
    });
    select.value = progress.next_day_id || state.activeRun.suggested_day || state.activeProgram.days[0].id;
    button(chooser, "선택한 운동 시작", true).onclick = () => startDay(state, select.value, refresh);
  }

  function renderJournalMetrics(parent, metrics) {
    // Collapsed into continue strip when present — avoid empty section wall
    if (!metrics || !metrics.length) return;
  }

  function renderWorkoutNotes(parent, state) {
    const notes = state.workoutNotes || [];
    if (!notes.length) return;
    const area = section(parent, "오늘 계획 (Workout Object)", "Program Runner와 별도 · 일회 계획/복기 노트");
    notes.slice(0, 8).forEach((note) => {
      const row = area.createDiv({ attr: { class: "workout-history-row" } });
      const left = row.createDiv();
      left.createEl("strong", { text: note.title });
      left.createEl("span", {
        text: [note.workout_type, note.status, note.next_action, note.due_date && `기한 ${note.due_date}`].filter(Boolean).join(" · ")
      });
      const actions = row.createDiv({ attr: { class: "workout-inline-actions" } });
      button(actions, "노트 열기").onclick = () => {
        root.app.workspace.openLinkText(note.path.replace(/\.md$/, ""), "", false);
      };
    });
  }

  function programStatusLabel(program, history, activeRun) {
    if (activeRun && activeRun.program_id === program.id) return "진행 중";
    if (history.some((run) => run.status === "paused")) return "일시정지 있음";
    if (history.some((run) => run.status === "completed")) return "실행 이력 있음";
    return "대기";
  }

  function makePrescribedSets(count, reps, rpe) {
    const n = Math.max(1, Math.min(20, Number(count) || 1));
    const sets = [];
    for (let i = 0; i < n; i += 1) {
      sets.push({
        reps: String(reps || "").trim(),
        rpe: String(rpe || "").trim(),
        target: "",
        rest: ""
      });
    }
    return sets;
  }

  function appendExerciseToProgram(program, dayId, exerciseInput) {
    const next = clone(program);
    if (!Array.isArray(next.days) || !next.days.length) {
      next.days = [{
        id: `w1d1_${Date.now().toString(36)}`,
        week: 1,
        day: 1,
        label: "Week 1 Day 1",
        exercises: []
      }];
    }
    let day = next.days.find((d) => d.id === dayId) || next.days[0];
    if (!day) throw new Error("Day를 찾을 수 없습니다.");
    if (!Array.isArray(day.exercises)) day.exercises = [];
    const name = String(exerciseInput.name || "").trim();
    if (!name) throw new Error("운동 이름이 필요합니다.");
    day.exercises.push({
      id: `exercise_${core.stableHash(`${day.id}:${Date.now()}:${name}`)}`,
      name,
      target: String(exerciseInput.target || "").trim(),
      notes: String(exerciseInput.notes || "").trim(),
      prescribed_sets: makePrescribedSets(
        exerciseInput.set_count,
        exerciseInput.reps,
        exerciseInput.rpe
      )
    });
    return next;
  }

  async function persistProgram(app, state, program) {
    const normalized = core.normalizeProgram(program);
    const session = new Date().toISOString();
    let result = await captureWriter.saveProgram(
      app, state.store, objects, normalized,
      captureRuntime.humanConfirmation("workout-program-save", session),
      { locator: "WorkoutView:persistProgram:explicit-confirm" }
    );
    if (result.review_required) {
      const review = result.capture.record;
      const confirmation = await captureRuntime.requestReviewConfirmation(review, "workout-program-save");
      if (!confirmation) throw new Error("프로그램 저장을 취소했습니다.");
      result = await captureWriter.saveProgram(app, state.store, objects, normalized, confirmation, { locator: "WorkoutView:persistProgram:explicit-confirm", review });
    }
    if (!result.saved) throw new Error(`프로그램 저장이 중단되었습니다: ${result.capture.record.state}`);
    return result.saved;
  }

  modals.configureDependencies({
    makePrescribedSets,
    appendExerciseToProgram,
    persistProgram,
    openExercisePopup,
    openExerciseNoteSide,
    empty,
    iconButton,
    recordStripText,
    loadState,
    startProgram,
  });

  function renderLibrary(parent, state, refresh) {
    const area = section(parent, "프로그램 라이브러리", "운동 추가 · 시작 · 편집");
    if (!state.programs.length) {
      empty(area, "프로그램이 없습니다. 상단 「새 프로그램」또는 「프로그램 가져오기」로 시작하세요.");
      const createRow = area.createDiv({ attr: { class: "workout-inline-actions" } });
      button(createRow, "새 프로그램", true).onclick = () => new CreateProgramModal(root.app, state, refresh).open();
      button(createRow, "프로그램 가져오기").onclick = () => new ImportProgramModal(root.app, refresh).open();
      return;
    }
    state.programs.forEach((program) => {
      const row = area.createDiv({ attr: { class: "workout-library-row" } });
      const copy = row.createDiv();
      const history = state.runs.filter((run) => run.program_id === program.id);
      const exerciseCount = program.days.reduce((sum, day) => sum + (day.exercises || []).length, 0);
      copy.createEl("strong", { text: program.title });
      copy.createEl("span", {
        text: [
          program.goal || "목표 미지정",
          `${program.weeks}주`,
          `세션 ${program.days.length}회`,
          `운동 ${exerciseCount}개`,
          `Run ${history.length}회`,
          programStatusLabel(program, history, state.activeRun),
        ].join(" · ")
      });
      const actions = row.createDiv({ attr: { class: "workout-inline-actions" } });
      button(actions, "운동 추가", true).onclick = () => {
        new AddExerciseToProgramModal(root.app, program, state, refresh).open();
      };
      if (!state.activeRun || state.activeRun.program_id !== program.id) {
        button(actions, history.length ? "다시 시작" : "시작").onclick = () => startProgram(root.app, program, state, refresh);
      }
      const paused = history.find((run) => run.status === "paused");
      if (paused && !state.activeRun) {
        button(actions, "이어서 실행").onclick = async () => {
          await state.store.saveRun(core.transitionProgramRun(paused, "active"));
          notice("일시정지된 실행을 재개했습니다.");
          await refresh();
        };
      }
      button(actions, "편집").onclick = () => new ProgramEditorModal(root.app, program, state, refresh).open();
      const more = actions.createEl("details", { attr: { class: "workout-more-menu" } });
      more.createEl("summary", { text: "더 보기" });
      const moreBody = more.createDiv({ attr: { class: "workout-inline-actions", style: "margin-top:var(--ke-space-2);" } });
      button(moreBody, "이름 변경").onclick = () => new RenameProgramModal(root.app, program, state, refresh).open();
      button(moreBody, "복제").onclick = async () => {
        try {
          const stored = await objects.duplicateProgramObject(root.app, program);
          await state.store.saveProgram(stored);
          notice(`${stored.title}을(를) 복제했습니다.`);
          await refresh();
        } catch (error) { notice(error.message || "복제에 실패했습니다."); }
      };
      button(moreBody, "내보내기").onclick = async () => {
        try {
          const path = await objects.exportProgramObject(root.app, program);
          notice(`내보냄: ${path}`);
        } catch (error) { notice(error.message || "내보내기에 실패했습니다."); }
      };
      if (program.source_path) {
        button(moreBody, "노트 열기").onclick = () => root.app.workspace.openLinkText(program.source_path.replace(/\.md$/, ""), "", false);
      }
      if (history.length) {
        button(moreBody, "실행 기록").onclick = () => new ProgramHistoryModal(root.app, program, history).open();
      }
      button(moreBody, "삭제").onclick = async () => {
        if (state.activeRun && state.activeRun.program_id === program.id) return notice("진행 중인 프로그램은 삭제할 수 없습니다.");
        if (root.confirm && !root.confirm(`「${program.title}」 프로그램을 삭제할까요? 기존 Run 기록은 유지됩니다.`)) return;
        try {
          await objects.deleteProgramObject(root.app, program);
          if (state.store.deleteDerived) await state.store.deleteDerived("programs", program.id);
          notice("프로그램을 삭제했습니다.");
          await refresh();
        } catch (error) { notice(error.message || "삭제에 실패했습니다."); }
      };
    });
  }

  function renderHistory(parent, state) {
    const area = section(parent, "운동 기록", "완료 세션 타임라인 · 프로그램 · 자유운동 · 빠른 기록");
    const sessionCount = sessionUI.renderSessionHistory(area, state.sessions);
    const completedRuns = state.runs
      .filter((run) => ["completed", "abandoned"].includes(run.status))
      .sort((a, b) => String(b.completed_at || "").localeCompare(String(a.completed_at || "")));
    if (!sessionCount && !completedRuns.length) {
      return empty(area, "아직 완료된 운동 기록이 없습니다.");
    }
    if (completedRuns.length) {
      area.createEl("h3", { text: "프로그램 실행", attr: { style: "margin:var(--ke-space-3) 0 var(--ke-space-1);font-size:var(--ke-type-heading);line-height:var(--ke-leading-body);letter-spacing:0;" } });
      completedRuns.slice(0, 5).forEach((run) => {
        const row = area.createDiv({ attr: { class: "workout-history-row" } });
        row.createEl("strong", { text: `${run.program_title} · 실행 #${run.run_number}` });
        row.createEl("span", {
          text: `${statusLabel(run.status)} · ${(run.completed_at || run.started_at || "").slice(0, 10)}`
        });
      });
    }
  }

  // Modal classes extracted to workout-modals.js (P2-1)
  const M = root.WorkoutModals || {};
  const RunConflictModal = M.RunConflictModal;
  const QuickWorkoutModal = M.QuickWorkoutModal;
  const ProgramHistoryModal = M.ProgramHistoryModal;
  const RenameProgramModal = M.RenameProgramModal;
  const CreateExerciseModal = M.CreateExerciseModal;
  const ExerciseDetailModal = M.ExerciseDetailModal;
  const AddExerciseToProgramModal = M.AddExerciseToProgramModal;
  const CreateProgramModal = M.CreateProgramModal;
  const ProgramEditorModal = M.ProgramEditorModal;
  const ImportProgramModal = M.ImportProgramModal;

  function injectStyles(container) {
    container.createEl("style", { text: `
.prodigy-workout-dashboard{max-inline-size:100%;min-inline-size:0;padding-block-end:var(--ke-space-7);font-family:var(--ke-font-text);font-size:var(--ke-type-body);line-height:var(--ke-leading-body);word-break:keep-all;overflow-wrap:anywhere}
.prodigy-workout-dashboard *{box-sizing:border-box;min-inline-size:0}
.prodigy-workout-dashboard :is(button,input,select,textarea){min-inline-size:var(--ke-touch-target);min-block-size:var(--ke-touch-target);max-inline-size:100%;box-shadow:none!important}
.workout-toolbar,.workout-inline-actions,.workout-modal-actions,.workout-metrics,.workout-nutrition-actions,.workout-running-actions,.workout-rest-controls,.workout-target-chips{display:flex;align-items:center;flex-wrap:wrap;gap:var(--ke-space-2);min-inline-size:0;max-inline-size:100%}
.workout-toolbar,.workout-modal-actions{justify-content:flex-end;margin-block:var(--ke-space-3)}
.workout-button{font:inherit;white-space:normal;word-break:keep-all;overflow-wrap:anywhere}
.workout-button:active,.workout-health-tab:active,.workout-exercise-link:active{transform:scale(0.95)}
.workout-button:disabled,.workout-health-tab:disabled{opacity:var(--ke-opacity-disabled);cursor:not-allowed;transform:none}
.workout-button:focus-visible,.workout-health-tab:focus-visible,.workout-exercise-link:focus-visible,.workout-exercise-note-link:focus-visible,input:focus-visible,select:focus-visible,textarea:focus-visible{outline:var(--ke-focus-ring-width) solid var(--ke-color-accent);outline-offset:var(--ke-space-1)}
.workout-section{padding-block:var(--ke-space-5);border-block-end:var(--ke-border-width) solid var(--ke-color-border)}
.workout-section h2,.workout-section h3,.workout-start-path h3,.workout-running-latest h3{margin:0;font-family:var(--ke-font-display);font-size:var(--ke-type-heading);line-height:var(--ke-leading-control);font-weight:var(--ke-font-weight-strong)}
.workout-section-copy,.workout-muted,.workout-empty,.workout-previous,.workout-record-strip,.workout-error{font-size:var(--ke-type-label);line-height:var(--ke-leading-body);color:var(--ke-color-muted);overflow-wrap:anywhere}
.workout-error,[data-state="error"]{color:var(--ke-color-error)}
.workout-panel-loading,[data-state="loading"],[aria-busy="true"]{cursor:progress}
.workout-empty,[data-state="empty"]{color:var(--ke-color-muted)}
.workout-current,.workout-library-row,.workout-history-row,.workout-exercise-heading,.workout-running-history-row{display:flex;align-items:flex-start;justify-content:space-between;flex-wrap:wrap;gap:var(--ke-space-3)}
.workout-start-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,18rem),1fr));gap:var(--ke-space-3)}
.workout-start-path,.workout-exercise-card,.workout-running-latest,.workout-import-replace,.workout-exercise-body{padding:var(--ke-space-4);border:var(--ke-border-width) solid var(--ke-color-border);border-radius:var(--ke-radius-configurator);background:var(--ke-color-surface-secondary)}
.workout-session-live{inline-size:100%;margin-inline:0;padding-inline:var(--ke-space-4);scroll-margin-block-start:var(--ke-space-5)}
.workout-session-bar{position:sticky;inset-block-start:0;z-index:10;display:flex;align-items:center;flex-wrap:wrap;gap:var(--ke-space-3);padding:var(--ke-space-3);background:var(--ke-color-surface);border-block-end:var(--ke-border-width) solid var(--ke-color-border)}
.workout-session-bar-info{display:flex;align-items:baseline;gap:var(--ke-space-2);flex:1}
.workout-progress{margin-block-start:var(--ke-space-2)}
.workout-progress-track{block-size:var(--ke-space-2);border-radius:var(--ke-radius-pill);background:var(--ke-color-border)}
.workout-progress-fill{block-size:100%;border-radius:inherit;background:var(--ke-color-interactive)}
.workout-set-list,.workout-library-row,.workout-history-row,.workout-editor-day,.workout-editor-exercise,.workout-nutrition-meal{border-block-start:var(--ke-border-width) solid var(--ke-color-border)}
.workout-set-row{display:grid;grid-template-columns:var(--ke-touch-target) minmax(0,1fr);align-items:center;gap:var(--ke-space-2);padding-block:var(--ke-space-3)}
.workout-set-fields,.workout-set-fields-min,.workout-modal-grid,.workout-editor-meta{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,10rem),1fr));gap:var(--ke-space-2);grid-column:1/-1}
.workout-field{display:grid;gap:var(--ke-space-1)}
.workout-field label,.workout-nutrition-chip-label,.workout-running-stat-label{font-size:var(--ke-type-label);color:var(--ke-color-muted)}
.workout-field input,.workout-field textarea,.workout-modal input,.workout-modal select,.workout-modal textarea{inline-size:100%;min-block-size:var(--ke-touch-target)}
.workout-chip-btn,.workout-health-tab,.workout-nutrition-source-tag,.workout-running-legacy-tag,.workout-running-summary-tag{border-radius:var(--ke-radius-pill)}
.workout-health-tablist{display:flex;flex-wrap:wrap;gap:var(--ke-space-1);border-block-end:var(--ke-border-width) solid var(--ke-color-border)}
.workout-health-tab{min-block-size:var(--ke-touch-target);padding-inline:var(--ke-space-4);border:0;background:transparent;color:var(--ke-color-muted);font:inherit;cursor:pointer}
.workout-health-tab[aria-selected="true"],.workout-health-tab.is-active{color:var(--ke-color-interactive);border-block-end:var(--ke-focus-ring-width) solid var(--ke-color-interactive)}
.workout-nutrition-summary,.workout-running-stats,.workout-running-trend-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,8rem),1fr));gap:var(--ke-space-2)}
.workout-nutrition-chip,.workout-running-stat,.workout-running-trend-cell{display:grid;justify-items:center;gap:var(--ke-space-1);padding:var(--ke-space-3);background:var(--ke-color-surface-secondary);border-radius:var(--ke-radius-configurator)}
.workout-running-split-table,.workout-import-table{inline-size:100%;table-layout:fixed;border-collapse:collapse}
.workout-running-split-table th,.workout-running-split-table td,.workout-import-table th,.workout-import-table td{padding:var(--ke-space-2);border-block-end:var(--ke-border-width) solid var(--ke-color-border);text-align:start}
.workout-import-details,.workout-editor-days,.workout-exercise-body,.workout-replace-list{max-block-size:none;overflow:visible}
.workout-modal{max-inline-size:min(100%,42rem)}.workout-program-editor{max-inline-size:min(100%,55rem)}
.workout-day-chooser,.workout-editor-heading,.workout-editor-add{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:var(--ke-space-2)}
.workout-editor-set,.workout-editor-day-head{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,8rem),1fr));gap:var(--ke-space-2)}
.workout-exercise-link,.workout-exercise-note-link{min-block-size:var(--ke-touch-target);display:inline-flex;align-items:center;border:0;background:transparent;color:var(--ke-color-interactive);font:inherit;cursor:pointer}
.workout-rest-timer[hidden]{display:none}
.workout-rest-label{font-variant-numeric:tabular-nums;color:var(--ke-color-interactive);font-weight:var(--ke-font-weight-strong)}
.whr-compact .workout-section.prodigy-utility-card{padding-inline:var(--ke-space-2)}
.whr-compact .workout-start-path.prodigy-utility-card{padding:var(--ke-space-1)}
@media(forced-colors:active){.workout-progress-fill,.workout-health-tab[aria-selected="true"],.workout-health-tab.is-active{forced-color-adjust:auto}.workout-button:focus-visible,.workout-health-tab:focus-visible{outline-color:Highlight}}
@media(prefers-reduced-motion:reduce){.prodigy-workout-dashboard *{animation:none!important;transition:none!important;scroll-behavior:auto!important}.workout-button:active,.workout-health-tab:active,.workout-exercise-link:active{transform:none}}
` });
  }

  // ─── Workout v2: Analysis & Observation Section (Todo 10) ─────────────

  function renderAnalysisSection(parent, state) {
    if (!analysis) return;
    const completed = (state.sessions || []).filter((s) => s && s.status === "completed");
    if (!completed.length) return;
    const area = section(parent, "분석 (v2)", "볼륨 · PR · 근육 분포. 결정론적 계산.");

    // Multi-session volume summary
    const vol = analysis.multiSessionVolume(completed);
    const statsRow = area.createDiv({ attr: { class: "workout-metrics" } });
    const volMetric = statsRow.createDiv({ attr: { class: "workout-metric" } });
    volMetric.createEl("span", { text: "총 볼륨" });
    volMetric.createEl("strong", { text: `${Math.round(vol.total_volume).toLocaleString()} kg` });
    const sessMetric = statsRow.createDiv({ attr: { class: "workout-metric" } });
    sessMetric.createEl("span", { text: "완료 세션" });
    sessMetric.createEl("strong", { text: `${vol.session_count}` });

    // Top exercises by volume
    if (vol.by_exercise.length) {
      area.createEl("h3", { text: "운동별 볼륨", attr: { style: "margin:var(--ke-space-3) 0 var(--ke-space-2);font-size:var(--ke-type-heading);line-height:var(--ke-leading-body);letter-spacing:0;" } });
      vol.by_exercise.slice(0, 5).forEach((ex) => {
        const row = area.createDiv({ attr: { class: "workout-history-row" } });
        row.createEl("strong", { text: ex.name });
        row.createEl("span", { text: `${Math.round(ex.volume).toLocaleString()} kg · ${ex.sets}세트 · ${ex.sessions}회` });
      });
    }

    // Latest session muscle distribution
    const latest = completed.slice().sort((a, b) =>
      String(b.completed_at || b.date).localeCompare(String(a.completed_at || a.date))
    )[0];
    if (latest && exerciseLibrary) {
      const catalog = exerciseLibrary.createLibrary();
      const dist = analysis.sessionMuscleDistribution(latest, catalog);
      if (dist.length) {
        area.createEl("h3", { text: "최근 세션 근육 분포", attr: { style: "margin:var(--ke-space-3) 0 var(--ke-space-2);font-size:var(--ke-type-heading);line-height:var(--ke-leading-body);letter-spacing:0;" } });
        const distRow = area.createDiv({ attr: { class: "workout-metrics" } });
        dist.slice(0, 6).forEach((d) => {
          const chip = distRow.createDiv({ attr: { class: "workout-metric" } });
          chip.createEl("span", { text: d.label });
          chip.createEl("strong", { text: `${Math.round(d.ratio * 100)}%` });
        });
      }
    }
  }

  function renderObservationSection(parent, state, refresh) {
    const area = section(parent, "관측 기록 (v2)", "AI 대화 없이 직접 관측을 저장합니다. 자동 저장 없음.");
    const noteInput = area.createEl("textarea", {
      attr: { placeholder: "오늘 운동 관측을 적어 주세요. 예: 스쿼트 3세트에서 좌우 불균형 느껴짐", rows: "3", class: "workout-observation-input" }
    });
    const actions = area.createDiv({ attr: { class: "workout-inline-actions", style: "margin-top:var(--ke-space-2);" } });
    button(actions, "관측 저장", true).onclick = async () => {
      const text = String(noteInput.value || "").trim();
      if (!text) return notice("관측 내용을 입력해 주세요.");
      try {
        const obs = core.buildObservation(state.draft || null, text);
        // Explicit save through the store — the only write path.
        await state.store.saveSession({
          schema_version: "prodigy-workout-observation-v1",
          session_id: obs.observation_id,
          status: "observation",
          note: obs.note,
          kind: obs.kind,
          created_at: obs.created_at,
          linked_session_id: obs.session_id,
          exercise_results: [],
        });
        noteInput.value = "";
        notice("관측을 저장했습니다.");
        await refresh();
      } catch (error) {
        notice(error.message || "관측 저장에 실패했습니다.");
      }
    };
  }

  async function renderStrengthDashboard(app, container, state, refresh, controller) {
    const toolbar = container.createDiv({ attr: { class: "workout-toolbar" } });
    button(toolbar, "새 프로그램", true).onclick = () => new CreateProgramModal(app, state, refresh).open();
    button(toolbar, "프로그램 가져오기").onclick = () => new ImportProgramModal(app, refresh).open();
    sessionUI.renderEntryPaths(container, {
      app, state, refresh,
      startProgram: (program) => startProgram(app, program, state, refresh),
      quickLabel: "빠른 운동",
      resumeRunner: () => {
        const el = container.querySelector && container.querySelector(".workout-session-live");
        if (el && el.scrollIntoView) el.scrollIntoView({ behavior: "smooth", block: "start" });
      },
    });
    // Order: continue → session (if draft) → current → drafts/stale → WO notes → library → history
    renderContinueStrip(container, state, refresh);
    renderJournalMetrics(container, state.metrics);
    renderSession(container, state, refresh, controller);
    renderCurrent(container, state, refresh);
    renderDraftQueue(container, state, refresh);
    renderStaleQueue(container, state, refresh);
    renderWorkoutNotes(container, state);
    renderLibrary(container, state, refresh);
    renderHistory(container, state);
    renderAnalysisSection(container, state);
    renderObservationSection(container, state, refresh);
  }

  const controllersByContainer = new WeakMap();
  let latestController = null;

  function publishMountedController(controller, mountScope) {
    if (!controller) return controller;
    root.__prodigyWorkoutController = controller;
    if (mountScope && typeof mountScope.track === "function") {
      mountScope.track(() => {
        if (root.__prodigyWorkoutController === controller) delete root.__prodigyWorkoutController;
      });
    }
    return controller;
  }

  async function renderDashboard(app, container, options) {
    if (!core || !storeApi || !importer || !objects) throw new Error("Workout Workspace modules are unavailable.");
    const renderOptions = options || {};
    const previousController = controllersByContainer.get(container);
    if (previousController) previousController.dispose();
    const controller = sessionFlow.createViewController({
      mountScope: renderOptions.mountScope || root.__prodigyWorkoutMountScope,
      timerHost: root,
    });
    controllersByContainer.set(container, controller);
    latestController = controller;
    root.app = app;
    container.empty(); container.addClass("prodigy-workout-dashboard"); injectStyles(container);

    const optionalFailures = Array.isArray(renderOptions.optionalFailures) ? renderOptions.optionalFailures : [];
    const failurePaths = optionalFailures.map((failure) => String(failure && (failure.path || failure.summary) || failure).toLowerCase());
    const hasOptionalFailure = (...parts) => failurePaths.some((path) => parts.some((part) => path.includes(part)));
    const tabAvailability = Object.assign({}, renderOptions.tabAvailability || {});
    if (hasOptionalFailure("nutrition", "health-store", "health-core")) tabAvailability.nutrition = "식단 선택 모듈을 사용할 수 없습니다. 동기화 후 다시 시도하세요.";
    if (hasOptionalFailure("running", "health-store", "running-core", "running-projection")) tabAvailability.running = "러닝 선택 모듈을 사용할 수 없습니다. 동기화 후 다시 시도하세요.";

    const shell = root.WorkoutHealthShell;
    const nutritionView = root.WorkoutNutritionView;
    const runningView = root.WorkoutRunningView;

    if (!shell || !shell.renderShell) {
      const state = await loadState(app);
      if (!controller.isActive()) return controller;
      const refresh = () => renderDashboard(app, container, renderOptions);
      await renderStrengthDashboard(app, container, state, refresh, controller);
      if (!controller.isActive()) return controller;
      const healthStatus = container.createDiv({ attr: { class: "workout-panel-error", role: "status" } });
      healthStatus.createEl("h2", { text: "건강 탭" });
      healthStatus.createEl("p", { text: "건강 탭 쉘을 사용할 수 없습니다. 근력 기록은 계속 사용할 수 있습니다.", attr: { class: "workout-error" } });
      const retry = healthStatus.createEl("button", { text: "건강 탭 다시 시도", attr: { class: "prodigy-btn workout-button", type: "button" } });
      retry.onclick = () => {
        if (typeof renderOptions.onRetry === "function") renderOptions.onRetry("health-shell");
        else renderDashboard(app, container, renderOptions);
      };
      return controller;
    }

    const shellOptions = Object.assign({}, renderOptions, { tabAvailability });
    controller.replaceShell(shell.renderShell(container, {
      strength: async (panel) => {
        const state = await loadState(app);
        if (!controller.isActive()) return;
        const refresh = () => renderDashboard(app, container, renderOptions);
        await renderStrengthDashboard(app, panel, state, refresh, controller);
      },
      nutrition: nutritionView && !tabAvailability.nutrition ? (panel, context) => nutritionView.renderNutritionPanel(app, panel, context) : null,
      running: runningView && !tabAvailability.running ? (panel, context) => runningView.renderRunningPanel(app, panel, context) : null,
    }, shellOptions));
    return controller;
  }

  const api = {
    ImportProgramModal, ProgramEditorModal, ProgramHistoryModal, QuickWorkoutModal,
    RenameProgramModal, CreateExerciseModal, ExerciseDetailModal,
    AddExerciseToProgramModal, CreateProgramModal,
    journalMetrics, loadState, loadWorkoutNotes, openExerciseObject,
    openExercisePopup, openExerciseNoteSide, empty, iconButton, recordStripText, startProgram, renderDashboard,
    renderContinueStrip, renderDraftQueue, renderStaleQueue,
    makePrescribedSets, appendExerciseToProgram, persistProgram,
    queueDraftSave, waitForDraftSave, draftSaveStateFor, publishMountedController,
    openTab: (tabId) => { if (latestController) latestController.openTab(tabId); },
  };
  root.WorkoutView = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
