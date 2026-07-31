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

  function notice(message) { const Notice = root.obsidian && root.obsidian.Notice ? root.obsidian.Notice : root.Notice; if (Notice) new Notice(message); }
  function today() { const date = new Date(); return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`; }
  function uniqueId(prefix) { return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`; }
  function createStore(app) { return storeApi.createWorkoutStore(storeApi.createObsidianAdapter(app)); }
  function button(parent, label, primary = false) { return parent.createEl("button", { text: label, attr: { type: "button", class: primary ? "mod-cta workout-button" : "workout-button" } }); }
  function section(parent, title, subtitle = "") { const area = parent.createDiv({ attr: { class: "workout-section" } }); area.createEl("h2", { text: title }); if (subtitle) area.createEl("p", { text: subtitle, attr: { class: "workout-section-copy" } }); return area; }
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
    // Sequential cache sync — avoid racing index.json writes on dashboard open
    for (const program of objectPrograms) {
      await store.saveProgram(program);
    }
    const activeRun = runs.find((run) => run.status === "active") || null;
    const libraryProgram = activeRun ? programs.find((program) => program.id === activeRun.program_id) || null : null;
    // Version safety: Run snapshot wins over library edits
    const activeProgram = activeRun
      ? (core.programForRun(libraryProgram, activeRun) || libraryProgram)
      : null;
    const strengthDrafts = sessions
      .filter((session) => session && session.status === "draft" && core.normalizeSessionKind(session) !== "quick")
      .sort((left, right) => String(right.started_at || right.date).localeCompare(String(left.started_at || left.date)));
    const draft = strengthDrafts.find((session) => session.runner_active === true) || strengthDrafts[0] || null;
    const base = {
      store, programs, runs, sessions, activeRun, activeProgram, libraryProgram, draft,
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
      attr: { class: "workout-muted", style: "margin-bottom:6px;font-weight:650;" }
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
      r.createEl("span", { text: "이유 ", attr: { style: "font-weight:700;color:var(--text-faint);" } });
      r.createEl("span", { text: cont.reason });
    }
    if (state.metrics && state.metrics.length) {
      const bits = state.metrics.map(([k, v]) => `${k} ${v}`).join(" · ");
      box.createEl("div", { text: bits, attr: { class: "workout-muted", style: "margin-top:6px;" } });
    }
    const actions = box.createDiv({ attr: { class: "workout-inline-actions", style: "margin-top:10px;" } });
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

  let restTimerInterval = null;

  function clearRestTimer() {
    if (restTimerInterval) { clearInterval(restTimerInterval); restTimerInterval = null; }
  }

  function startRestTimer(bar, seconds) {
    clearRestTimer();
    const timerEl = bar.querySelector(".workout-rest-timer");
    if (!timerEl) return;
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
      if (remaining <= 0) clearRestTimer();
    }
    tick();
    restTimerInterval = setInterval(tick, 1000);

    // Controls: -30, +30, skip
    controls.empty();
    const minus = controls.createEl("button", { text: "-30초", attr: { class: "workout-button workout-chip-btn", type: "button" } });
    const plus = controls.createEl("button", { text: "+30초", attr: { class: "workout-button workout-chip-btn", type: "button" } });
    const skip = controls.createEl("button", { text: "건너뛰기", attr: { class: "workout-button workout-chip-btn", type: "button" } });
    minus.onclick = () => { clearRestTimer(); startRestTimer(bar, Math.max(10, remaining - 30)); };
    plus.onclick = () => { clearRestTimer(); startRestTimer(bar, remaining + 30); };
    skip.onclick = () => { clearRestTimer(); timerEl.hidden = true; };
  }

  function renderSession(parent, state, refresh) {
    if (!state.draft) return;
    const session = state.draft;
    const area = section(parent, `${sessionFlow.kindLabel(session)} · ${core.dayLabel(session) || session.title || "오늘 세션"}`, "필수: 완료 체크 · 중량/횟수. 이전이 있으면 원탭 복제.");
    area.addClass && area.addClass("workout-session-live");
    if (!area.classList || !area.classList.contains("workout-session-live")) {
      area.setAttribute && area.setAttribute("class", `${area.getAttribute("class") || ""} workout-session-live`.trim());
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

    session.exercise_results.forEach((exercise) => {
      const card = area.createDiv({ attr: { class: "workout-exercise-card" } });
      const heading = card.createDiv({ attr: { class: "workout-exercise-heading" } });
      const identity = heading.createDiv();
      const titleRow = identity.createDiv({ attr: { class: "workout-exercise-title-row" } });
      const exerciseLink = titleRow.createEl("button", {
        text: exercise.name,
        attr: { type: "button", class: "workout-exercise-link", title: "팝업으로 보기" }
      });
      // Name → popup only
      exerciseLink.onclick = (e) => {
        if (e && e.preventDefault) e.preventDefault();
        openExercisePopup(root.app, exercise.name, state.sessions);
      };
      const meta = objects.getExerciseMeta
        ? objects.getExerciseMeta(root.app, exercise.name)
        : { exists: objects.exerciseObjectExists(root.app, exercise.name), cue: "", target: "" };
      // Small "노트" → open markdown in side pane
      const noteBtn = titleRow.createEl("button", {
        text: "노트",
        attr: {
          type: "button",
          class: "workout-exercise-note-link",
          title: meta.exists ? "사이드로 노트 열기" : "노트 없음 · 팝업에서 생성",
          "aria-label": `${exercise.name} 노트`
        }
      });
      noteBtn.onclick = async (e) => {
        if (e && e.preventDefault) e.preventDefault();
        if (e && e.stopPropagation) e.stopPropagation();
        if (!meta.exists) {
          openExercisePopup(root.app, exercise.name, state.sessions);
          return;
        }
        await openExerciseNoteSide(root.app, exercise.name);
      };
      if (meta.target) {
        titleRow.createEl("span", {
          text: meta.target,
          attr: { class: "workout-muted workout-exercise-target-tag" }
        });
      }
      const prescription = exercise.prescribed_sets.map((set) => [set.reps && `${set.reps}회`, set.rpe && `RPE ${set.rpe}`, set.rest && `휴식 ${set.rest}`, set.target].filter(Boolean).join(" · ")).filter(Boolean).join(" / ");
      if (prescription) identity.createEl("p", { text: `목표 ${prescription}` });
      // cue: one-line technique from Exercise Object property (not full body section)
      if (meta.cue) {
        identity.createEl("p", {
          text: `큐 · ${meta.cue}`,
          attr: { class: "workout-exercise-cue" }
        });
      }
      const previous = core.previousExerciseResult(state.sessions, session.program_run_id, exercise.exercise_id, session.session_id)
        || core.previousExerciseResultByName(state.sessions, exercise.name);
      const best = core.bestExerciseResult(state.sessions, exercise.name);
      const prevBox = heading.createDiv({ attr: { class: "workout-previous" } });
      prevBox.createEl("div", {
        text: recordStripText(previous, best),
        attr: { class: "workout-record-strip" }
      });
      if (previous && (previous.weight || previous.reps)) {
        const copyAll = button(prevBox, "전부 이전과 동일");
        copyAll.className = "workout-button workout-chip-btn";
        copyAll.onclick = async () => {
          const next = core.applyPreviousToExercise(session, exercise.exercise_id, previous);
          Object.assign(session, next);
          await queueDraftSave(state.store, session);
          notice(`${exercise.name}: 이전 기록 적용`);
          await refresh();
        };
      }
      sessionUI.renderExerciseActions(prevBox, { app: root.app, state, session, exercise, refresh });
      // Set add — top of exercise, one tap
      const setToolbar = card.createDiv({ attr: { class: "workout-set-toolbar" } });
      const addSetBtn = button(setToolbar, "세트 추가", true);
      addSetBtn.className = "workout-button mod-cta workout-chip-btn";
      addSetBtn.onclick = async (e) => {
        if (e && e.preventDefault) e.preventDefault();
        try {
          const next = core.addSetResult(session, exercise.exercise_id, { copy_last: true });
          Object.assign(session, next);
          await queueDraftSave(state.store, session);
          await refresh();
        } catch (error) {
          notice(error.message || "세트 추가 실패");
        }
      };
      const sets = card.createDiv({ attr: { class: "workout-set-list" } });
      exercise.set_results.forEach((result, setIndex) => {
        const row = sets.createDiv({ attr: { class: "workout-set-row workout-set-row-min" } });
        const complete = row.createEl("input", { attr: { type: "checkbox", "aria-label": `${exercise.name} ${setIndex + 1}세트 완료` } });
        complete.checked = Boolean(result.completed);
        row.createEl("strong", { text: `${setIndex + 1}` });
        const fields = row.createDiv({ attr: { class: "workout-set-fields workout-set-fields-min" } });
        const weight = setInput(fields, "kg", result.weight, { inputmode: "decimal", placeholder: "kg" });
        const reps = setInput(fields, "회", result.reps, { inputmode: "numeric", placeholder: "회" });
        const update = (patch) => {
          const next = core.updateSetResult(session, exercise.exercise_id, setIndex, patch);
          Object.assign(session, next);
          queueDraftSave(state.store, session);
        };
        complete.onchange = () => {
          update({ completed: complete.checked });
          if (complete.checked && stickyBar) {
            const prescribed = (exercise.prescribed_sets && exercise.prescribed_sets[setIndex]) || null;
            const restSec = core.resolveRestSeconds(prescribed);
            startRestTimer(stickyBar, restSec);
          }
        };
        weight.oninput = () => update({ weight: weight.value });
        reps.oninput = () => update({ reps: reps.value });
        if (previous && (previous.weight || previous.reps)) {
          const chip = row.createEl("button", {
            text: "이전",
            attr: { type: "button", class: "workout-button workout-chip-btn", title: previousText(previous) }
          });
          chip.onclick = (e) => {
            if (e && e.preventDefault) e.preventDefault();
            const next = core.applyPreviousToSet(session, exercise.exercise_id, setIndex, previous);
            Object.assign(session, next);
            weight.value = previous.weight || "";
            reps.value = previous.reps || "";
            queueDraftSave(state.store, session);
          };
        }
        // Immediate delete — one tap ×
        const removeBtn = row.createEl("button", {
          text: "×",
          attr: {
            type: "button",
            class: "workout-button workout-set-remove",
            "aria-label": `${exercise.name} ${setIndex + 1}세트 삭제`,
            title: "세트 삭제"
          }
        });
        removeBtn.onclick = async (e) => {
          if (e && e.preventDefault) e.preventDefault();
          if (e && e.stopPropagation) e.stopPropagation();
          try {
            const next = core.removeSetResult(session, exercise.exercise_id, setIndex);
            Object.assign(session, next);
            await queueDraftSave(state.store, session);
            await refresh();
          } catch (error) {
            notice(error.message || "세트 삭제 실패");
          }
        };
        // RPE / notes behind progressive disclosure
        const more = row.createEl("details", { attr: { class: "workout-set-more" } });
        more.createEl("summary", { text: "더" });
        const moreBody = more.createDiv({ attr: { class: "workout-set-fields" } });
        const rpe = setInput(moreBody, "RPE", result.rpe, { inputmode: "decimal", placeholder: "RPE" });
        const note = setInput(moreBody, "메모", result.notes, { placeholder: "선택" });
        rpe.oninput = () => update({ rpe: rpe.value });
        note.oninput = () => update({ notes: note.value });
      });
    });

    const finish = button(area, "운동 완료", true);
    finish.onclick = async () => {
      finish.disabled = true;
      await saveQueue;
      try {
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
        await state.store.saveSession({ ...result.session, runner_active: false });
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
    const stored = await objects.saveProgramObject(app, normalized);
    await state.store.saveProgram(stored);
    return stored;
  }

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
      const moreBody = more.createDiv({ attr: { class: "workout-inline-actions", style: "margin-top:6px;" } });
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
      area.createEl("h3", { text: "프로그램 실행", attr: { style: "margin:12px 0 4px;font-size:var(--ke-type-heading,.92rem);line-height:var(--ke-leading-body,1.45);letter-spacing:0;" } });
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
.prodigy-workout-dashboard{max-width:920px;margin:0 auto;padding-bottom:48px;font-size:var(--ke-type-body,.84rem);line-height:var(--ke-leading-body,1.45);letter-spacing:0}.workout-toolbar{display:flex;justify-content:flex-end;gap:var(--ke-space-3,8px);margin:8px 0 16px}.workout-button{min-height:40px;border-radius:6px;padding:var(--ke-space-2,4px) var(--ke-space-4,12px);font-size:var(--ke-type-label,.72rem);line-height:var(--ke-leading-control,1.35);letter-spacing:0}.workout-section{padding:20px 0;border-bottom:1px solid var(--background-modifier-border)}.workout-section h2{margin:0;font-size:var(--ke-type-title,1.05rem);line-height:var(--ke-leading-body,1.45);letter-spacing:0}.workout-section-copy,.workout-muted,.workout-empty{color:var(--text-muted);font-size:var(--ke-type-body,.84rem);line-height:var(--ke-leading-body,1.45);margin:4px 0 12px}.workout-current,.workout-library-row,.workout-history-row{display:flex;align-items:flex-start;justify-content:space-between;gap:12px}.workout-current h3,.workout-exercise-heading h3{margin:0;font-size:var(--ke-type-heading,.92rem);line-height:var(--ke-leading-body,1.45);letter-spacing:0}.workout-current p,.workout-exercise-heading p{margin:3px 0 0;color:var(--text-muted);font-size:var(--ke-type-label,.72rem);line-height:var(--ke-leading-body,1.45)}.workout-exercise-title-row{display:flex;flex-wrap:wrap;align-items:baseline;gap:6px 8px}.workout-start-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}.workout-start-path{display:flex;flex-direction:column;gap:8px;padding:12px;border:1px solid var(--background-modifier-border);border-radius:8px}.workout-start-path h3,.workout-start-path p{margin:0}.workout-start-path h3{font-size:var(--ke-type-heading,.92rem);line-height:var(--ke-leading-body,1.45);letter-spacing:0}.workout-start-path p{font-size:var(--ke-type-body,.84rem);line-height:var(--ke-leading-body,1.45)}.workout-start-path .workout-button{margin-top:auto}.workout-start-path select{width:100%;min-height:44px}
.workout-exercise-link{border:0;background:none;padding:0;color:var(--text-accent);font:inherit;font-weight:700;text-align:left;cursor:pointer}
.workout-exercise-note-link{border:0;background:none;padding:0;margin:0;color:var(--text-muted);font-size:var(--ke-type-label,.72rem);line-height:var(--ke-leading-control,1.35);font-weight:650;cursor:pointer;text-decoration:underline;text-underline-offset:2px;opacity:0.9}
.workout-exercise-note-link:hover{color:var(--text-accent)}
.workout-exercise-target-tag{font-size:var(--ke-type-chrome,.68rem);line-height:var(--ke-leading-control,1.35)}.workout-inline-actions,.workout-modal-actions{display:flex;gap:8px;flex-wrap:wrap}.workout-day-chooser{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:8px;margin-top:16px}.workout-day-chooser select,.workout-modal select,.workout-modal input,.workout-modal textarea{width:100%;min-height:44px}.workout-metrics{display:flex;gap:10px;flex-wrap:wrap}.workout-metric{display:flex;gap:7px;align-items:baseline;padding:8px 10px;background:var(--background-secondary);border-radius:6px}.workout-metric span{font-size:var(--ke-type-label,.72rem);line-height:var(--ke-leading-control,1.35);color:var(--text-muted)}.workout-exercise-card{margin-top:12px;padding:14px;border:1px solid var(--background-modifier-border);border-radius:8px;background:var(--background-secondary)}.workout-exercise-heading{display:flex;justify-content:space-between;gap:12px;align-items:start}.workout-previous{color:var(--text-muted);font-size:var(--ke-type-label,.72rem);line-height:var(--ke-leading-body,1.45);text-align:right}.workout-set-list{margin-top:12px}.workout-set-row{display:grid;grid-template-columns:44px 52px minmax(0,1fr);gap:8px;align-items:center;padding:10px 0;border-top:1px solid var(--background-modifier-border)}.workout-set-row>input{width:22px;height:22px;margin:auto}.workout-set-fields{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}.workout-field{display:flex;flex-direction:column;gap:3px}.workout-field label{font-size:var(--ke-type-chrome,.68rem);line-height:var(--ke-leading-control,1.35);color:var(--text-muted)}.workout-field input,.workout-field textarea{min-height:40px;width:100%;box-sizing:border-box}.workout-set-row>.workout-field{grid-column:3}.workout-library-row,.workout-history-row{padding:12px 0;border-top:1px solid var(--background-modifier-border)}.workout-library-row>div:first-child,.workout-history-row{display:flex;flex-direction:column;gap:3px;min-width:0;flex:1}.workout-library-row span,.workout-history-row span{font-size:var(--ke-type-label,.72rem);line-height:var(--ke-leading-body,1.45);color:var(--text-muted)}.workout-library-row .workout-inline-actions{flex:0 1 auto;max-width:100%}.workout-modal{max-width:680px}.workout-program-editor{max-width:880px}.workout-modal-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}.workout-modal-actions{justify-content:flex-end;margin-top:16px}.workout-import-preview{margin-top:14px}.workout-import-details,.workout-editor-days{max-height:58vh;overflow-y:auto;padding-right:4px}.workout-import-details li{margin-bottom:5px;line-height:var(--ke-leading-body,1.45)}.workout-editor-meta{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:12px}.workout-editor-errors{margin:8px 0}.workout-editor-day{padding:12px 0;border-top:1px solid var(--background-modifier-border)}.workout-editor-day h3{margin:0 0 8px;font-size:var(--ke-type-heading,.92rem);line-height:var(--ke-leading-body,1.45);letter-spacing:0}.workout-editor-day-head{display:grid;grid-template-columns:auto 1fr 1fr auto;gap:8px;align-items:end;margin-bottom:8px}.workout-editor-exercise{padding:10px 0;border-top:1px solid var(--background-modifier-border)}.workout-editor-heading{display:grid;grid-template-columns:minmax(180px,1fr) auto;gap:8px}.workout-editor-controls{display:flex;gap:4px;flex-wrap:wrap}.workout-editor-controls .workout-button{min-width:40px;padding:4px}.workout-editor-set{display:grid;grid-template-columns:52px repeat(4,minmax(70px,1fr)) 40px;gap:8px;align-items:end;margin-top:8px}.workout-editor-set>.workout-button{padding:4px}.workout-editor-add{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:8px;margin-top:10px}.workout-error{color:var(--text-error);font-size:var(--ke-type-body,.84rem);line-height:var(--ke-leading-body,1.45);margin:4px 0}
.workout-continue-strip{margin:0 0 12px;padding:12px;border-radius:10px;border:1px solid var(--background-modifier-border);background:var(--background-secondary)}
.workout-continue-kicker{font-weight:800;font-size:var(--ke-type-heading,.92rem);line-height:var(--ke-leading-body,1.45);letter-spacing:0;color:var(--text-accent);margin-bottom:4px}
.workout-continue-title{font-weight:700;font-size:var(--ke-type-heading,.92rem);line-height:var(--ke-leading-body,1.45);letter-spacing:0}
.workout-continue-reason{margin-top:6px;font-size:var(--ke-type-label,.72rem);line-height:var(--ke-leading-body,1.45);color:var(--text-muted)}
.workout-progress{margin-top:8px}
.workout-progress-label{font-size:var(--ke-type-label,.72rem);line-height:var(--ke-leading-control,1.35);color:var(--text-muted);font-weight:650;margin-bottom:4px}
.workout-progress-track{height:8px;border-radius:999px;background:var(--background-modifier-border);overflow:hidden}
.workout-progress-fill{height:100%;background:var(--text-accent);border-radius:999px}
.workout-set-toolbar{display:flex;justify-content:flex-end;gap:6px;margin:8px 0 0}
.workout-set-row-min{grid-template-columns:40px 28px minmax(0,1fr) auto auto auto;gap:6px;align-items:center}
.workout-set-fields-min{grid-template-columns:repeat(2,minmax(0,1fr));gap:6px}
.workout-chip-btn{min-height:32px!important;padding:var(--ke-space-1,2px) var(--ke-space-3,8px)!important;font-size:var(--ke-type-label,.72rem)!important;line-height:var(--ke-leading-control,1.35)!important;border-radius:999px!important}
.workout-set-remove{min-width:36px;min-height:36px!important;padding:0!important;font-size:1.15em!important;line-height:1;font-weight:700;color:var(--text-muted);border-radius:8px!important}
.workout-set-remove:hover{color:var(--text-error);background:color-mix(in srgb,var(--text-error) 12%,transparent)}
.workout-set-more{font-size:var(--ke-type-label,.72rem);line-height:var(--ke-leading-body,1.45);color:var(--text-muted)}
.workout-set-more summary{cursor:pointer;list-style:none;padding:2px 4px}
.workout-more-menu{font-size:var(--ke-type-body,.84rem);line-height:var(--ke-leading-body,1.45)}
.workout-more-menu summary{cursor:pointer;color:var(--text-muted);font-weight:600}
.workout-session-live{scroll-margin-top:12px}
.workout-target-filter{margin:8px 0 10px}
.workout-target-chips{display:flex;flex-wrap:wrap;gap:6px}
.workout-exercise-cue{margin:4px 0 0;font-size:var(--ke-type-body,.84rem);line-height:var(--ke-leading-body,1.45);color:var(--text-accent);font-weight:650}
.workout-record-strip{font-size:var(--ke-type-label,.72rem);line-height:var(--ke-leading-body,1.45);color:var(--text-muted)}
.workout-modal-exercise{max-width:min(720px,96vw)}
.workout-exercise-body-wrap{margin-top:14px}
.workout-exercise-body{margin-top:6px;max-height:min(48vh,420px);overflow:auto;padding:12px 14px;border:1px solid var(--background-modifier-border);border-radius:10px;background:var(--background-primary)}
.workout-exercise-body-md{font-size:var(--ke-type-body,.84rem);line-height:var(--ke-leading-body,1.45)}
.workout-exercise-body-md p{margin:0.4em 0}
.workout-exercise-body-md ul,.workout-exercise-body-md ol{margin:0.35em 0 0.5em;padding-left:1.25em}
.workout-exercise-body-section{margin:0 0 10px}
.workout-exercise-body-heading{margin:10px 0 4px;font-size:var(--ke-type-heading,.92rem);line-height:var(--ke-leading-body,1.45);letter-spacing:0;color:var(--text-accent)}
.workout-exercise-body-line{font-size:var(--ke-type-body,.84rem);line-height:var(--ke-leading-body,1.45);white-space:pre-wrap;overflow-wrap:anywhere}

.workout-session-bar{position:sticky;top:0;z-index:10;display:flex;flex-wrap:wrap;align-items:center;gap:8px 12px;padding:10px 14px;margin:0 -14px 12px;background:var(--background-primary);border-bottom:2px solid var(--background-modifier-border);border-radius:0 0 10px 10px}
.workout-health-tablist{display:flex;gap:4px;margin:0 0 16px;border-bottom:2px solid var(--background-modifier-border);padding-bottom:0}
.workout-health-tab{min-height:44px;padding:8px 16px;border:0;background:none;font-size:var(--ke-type-heading,.92rem);line-height:var(--ke-leading-control,1.35);letter-spacing:0;font-weight:650;color:var(--text-muted);cursor:pointer;border-bottom:2px solid transparent;margin-bottom:-2px;transition:color .15s,border-color .15s}
.workout-health-tab:hover{color:var(--text-normal)}
.workout-health-tab.is-active{color:var(--text-accent);border-bottom-color:var(--text-accent)}
.workout-health-tab:focus-visible{outline:2px solid var(--text-accent);outline-offset:-2px;border-radius:4px 4px 0 0}
.workout-health-panel{min-height:120px}
.workout-panel-error{padding:16px 0}
.workout-nutrition-date-nav{display:flex;align-items:center;gap:10px;margin-bottom:12px}
.workout-nav-btn{min-width:44px;min-height:44px;font-size:1.1em;padding:0}
.workout-nutrition-date-label{font-weight:700;font-size:var(--ke-type-heading,.92rem);line-height:var(--ke-leading-body,1.45);letter-spacing:0}
.workout-nutrition-today{font-size:var(--ke-type-label,.72rem);line-height:var(--ke-leading-control,1.35)}
.workout-nutrition-summary{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:8px}
.workout-nutrition-chip{display:flex;flex-direction:column;align-items:center;gap:2px;padding:10px 14px;background:var(--background-secondary);border-radius:8px;min-width:72px}
.workout-nutrition-chip-label{font-size:var(--ke-type-chrome,.68rem);line-height:var(--ke-leading-control,1.35);color:var(--text-muted);font-weight:650}
.workout-nutrition-chip-value{font-size:var(--ke-type-title,1.05rem);line-height:var(--ke-leading-body,1.45);font-weight:800}
.workout-nutrition-chip-unit{font-size:var(--ke-type-chrome,.68rem);line-height:var(--ke-leading-control,1.35);color:var(--text-muted)}
.workout-nutrition-avg{margin-bottom:14px}
.workout-nutrition-meals{margin-bottom:16px}
.workout-nutrition-meal{padding:10px 0;border-top:1px solid var(--background-modifier-border)}
.workout-nutrition-meal h3{margin:0 0 6px;font-size:var(--ke-type-heading,.92rem);line-height:var(--ke-leading-body,1.45);letter-spacing:0}
.workout-nutrition-empty-meal{font-size:var(--ke-type-body,.84rem);line-height:var(--ke-leading-body,1.45);margin:2px 0}
.workout-nutrition-list{list-style:none;padding:0;margin:0}
.workout-nutrition-list li{display:flex;flex-wrap:wrap;align-items:baseline;gap:4px 10px;padding:5px 0;border-top:1px solid var(--background-modifier-border)}
.workout-nutrition-food-name{font-weight:650;font-size:var(--ke-type-body,.84rem);line-height:var(--ke-leading-body,1.45)}
.workout-nutrition-food-detail{font-size:var(--ke-type-label,.72rem);line-height:var(--ke-leading-body,1.45)}
.workout-nutrition-source-tag{font-size:var(--ke-type-chrome,.68rem);line-height:var(--ke-leading-control,1.35);padding:var(--ke-space-1,2px) var(--ke-space-2,4px);border-radius:999px;background:var(--background-modifier-border);color:var(--text-muted)}
.workout-nutrition-actions,.workout-running-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:16px}
.workout-running-latest{padding:14px;border:1px solid var(--background-modifier-border);border-radius:10px;background:var(--background-secondary);margin-bottom:16px}
.workout-running-latest h3{margin:0 0 10px;font-size:var(--ke-type-heading,.92rem);line-height:var(--ke-leading-body,1.45);letter-spacing:0}
.workout-running-stats{display:flex;flex-wrap:wrap;gap:8px}
.workout-running-stat{display:flex;flex-direction:column;align-items:center;gap:2px;padding:8px 12px;background:var(--background-primary);border-radius:8px;min-width:68px}
.workout-running-stat-label{font-size:var(--ke-type-chrome,.68rem);line-height:var(--ke-leading-control,1.35);color:var(--text-muted);font-weight:650}
.workout-running-stat-value{font-size:var(--ke-type-title,1.05rem);line-height:var(--ke-leading-body,1.45);font-weight:800}
.workout-running-quality{font-size:var(--ke-type-label,.72rem);line-height:var(--ke-leading-body,1.45);font-style:italic}
.workout-running-splits{margin-bottom:16px}
.workout-running-splits h3,.workout-running-trends h3,.workout-running-history h3{margin:0 0 8px;font-size:var(--ke-type-heading,.92rem);line-height:var(--ke-leading-body,1.45);letter-spacing:0}
.workout-running-split-table{width:100%;border-collapse:collapse;font-size:var(--ke-type-body,.84rem);line-height:var(--ke-leading-body,1.45)}
.workout-running-split-table th,.workout-running-split-table td{padding:6px 8px;text-align:left;border-bottom:1px solid var(--background-modifier-border)}
.workout-running-split-table th{font-weight:700;font-size:var(--ke-type-label,.72rem);line-height:var(--ke-leading-control,1.35);color:var(--text-muted)}
.workout-running-trend-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(90px,1fr));gap:6px;margin-bottom:8px}
.workout-running-trend-cell{display:flex;flex-direction:column;align-items:center;gap:1px;padding:8px 6px;background:var(--background-secondary);border-radius:8px;font-size:var(--ke-type-body,.84rem);line-height:var(--ke-leading-body,1.45)}
.workout-running-avg-pace{font-size:var(--ke-type-body,.84rem);line-height:var(--ke-leading-body,1.45);font-weight:650}
.workout-running-history-row{display:flex;justify-content:space-between;align-items:center;gap:10px;padding:10px 0;border-top:1px solid var(--background-modifier-border)}
.workout-running-history-info{display:flex;flex-direction:column;gap:2px}
.workout-running-history-info strong{font-size:var(--ke-type-body,.84rem);line-height:var(--ke-leading-body,1.45)}
.workout-running-history-meta{display:flex;flex-direction:column;align-items:flex-end;gap:2px;font-size:var(--ke-type-label,.72rem);line-height:var(--ke-leading-body,1.45)}
.workout-running-legacy-tag,.workout-running-summary-tag{font-size:.9em;padding:1px 6px;border-radius:999px;background:var(--background-modifier-border);color:var(--text-muted)}
.workout-import-replace{margin:14px 0;padding:14px;border:1px solid var(--background-modifier-border);border-radius:10px;background:var(--background-secondary)}
.workout-import-replace h3{margin:0 0 4px;font-size:var(--ke-type-heading,.92rem);line-height:var(--ke-leading-body,1.45);letter-spacing:0}
.workout-replace-summary{display:flex;align-items:center;gap:8px;margin:8px 0}
.workout-replace-count{font-weight:700;font-size:var(--ke-type-body,.84rem);line-height:var(--ke-leading-body,1.45);color:var(--text-accent)}
.workout-replace-list{max-height:240px;overflow-y:auto}
.workout-replace-row{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:8px 0;border-top:1px solid var(--background-modifier-border)}
.workout-replace-label{display:flex;flex-direction:column;gap:1px;min-width:0;flex:1}
.workout-replace-label strong{font-size:.85em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.workout-replace-label span{font-size:var(--ke-type-label,.72rem);line-height:var(--ke-leading-body,1.45)}
.workout-replace-input{flex:0 0 180px}
.workout-replace-input input{width:100%;min-height:40px}
.workout-import-table{width:100%;border-collapse:collapse;font-size:var(--ke-type-body,.84rem);line-height:var(--ke-leading-body,1.45);margin:8px 0}
.workout-import-table th,.workout-import-table td{padding:5px 6px;text-align:left;border-bottom:1px solid var(--background-modifier-border)}
.workout-import-table th{font-weight:700;color:var(--text-muted)}
.workout-import-warnings{font-size:var(--ke-type-label,.72rem);line-height:var(--ke-leading-body,1.45);padding-left:1.2em;margin:6px 0}
@media(max-width:600px){.prodigy-workout-dashboard{padding:0 4px 40px}.workout-toolbar,.workout-inline-actions,.workout-modal-actions{flex-direction:column}.workout-toolbar .workout-button,.workout-inline-actions .workout-button,.workout-modal-actions .workout-button{width:100%;min-height:44px}.workout-start-grid{grid-template-columns:1fr}.workout-current,.workout-library-row,.workout-history-row,.workout-exercise-heading{align-items:stretch;flex-direction:column}.workout-day-chooser,.workout-editor-heading,.workout-editor-set,.workout-editor-add,.workout-editor-meta,.workout-editor-day-head{grid-template-columns:1fr}.workout-editor-controls{display:grid;grid-template-columns:repeat(3,1fr)}.workout-editor-controls .workout-button{min-height:44px}.workout-day-chooser .workout-button{min-height:48px}.workout-section{padding:16px 0}.workout-exercise-card{padding:12px}.workout-previous{text-align:left}.workout-set-row{grid-template-columns:40px minmax(0,1fr)}.workout-set-row-min{grid-template-columns:40px 24px minmax(0,1fr) auto}.workout-set-remove{min-width:44px;min-height:44px!important}.workout-set-row>strong{font-size:.82em}.workout-set-fields,.workout-set-fields-min{grid-column:1/-1}.workout-set-row>.workout-field{grid-column:1/-1}.workout-field input{min-height:44px}.workout-modal-grid{grid-template-columns:1fr}.workout-chip-btn{min-height:40px!important}.workout-session-bar{position:sticky;top:0;z-index:10;display:flex;flex-wrap:wrap;align-items:center;gap:8px 12px;padding:10px 14px;margin:0 -14px 12px;background:var(--background-primary);border-bottom:2px solid var(--background-modifier-border);border-radius:0 0 10px 10px}
.workout-session-bar-info{display:flex;align-items:baseline;gap:8px;min-width:0;flex:1}
.workout-session-bar-info strong{font-size:var(--ke-type-heading,.92rem);line-height:var(--ke-leading-control,1.35);letter-spacing:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.workout-session-bar .workout-progress-track{flex:0 0 80px;height:6px}
.workout-rest-timer{display:flex;align-items:center;gap:6px}
.workout-rest-timer[hidden]{display:none}
.workout-rest-label{font-size:1.1em;font-weight:800;font-variant-numeric:tabular-nums;color:var(--text-accent)}
.workout-rest-controls{display:flex;gap:4px}
.workout-next-set-btn{white-space:nowrap}
.workout-health-tablist{gap:0}.workout-health-tab{flex:1;padding:8px 6px;font-size:var(--ke-type-label,.72rem);line-height:var(--ke-leading-control,1.35);min-height:44px}.workout-nutrition-summary{gap:6px}.workout-nutrition-chip{min-width:60px;padding:8px 10px}.workout-nutrition-actions,.workout-running-actions{flex-direction:column}.workout-nutrition-actions .workout-button,.workout-running-actions .workout-button{width:100%;min-height:44px}.workout-running-stats{gap:6px}.workout-running-stat{min-width:56px;padding:6px 8px}.workout-running-trend-grid{grid-template-columns:repeat(3,1fr)}.workout-running-history-row{flex-direction:column;align-items:flex-start}.workout-running-history-meta{align-items:flex-start}}
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
      area.createEl("h3", { text: "운동별 볼륨", attr: { style: "margin:12px 0 6px;font-size:var(--ke-type-heading,.92rem);line-height:var(--ke-leading-body,1.45);letter-spacing:0;" } });
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
        area.createEl("h3", { text: "최근 세션 근육 분포", attr: { style: "margin:12px 0 6px;font-size:var(--ke-type-heading,.92rem);line-height:var(--ke-leading-body,1.45);letter-spacing:0;" } });
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
    const actions = area.createDiv({ attr: { class: "workout-inline-actions", style: "margin-top:8px;" } });
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

  async function renderStrengthDashboard(app, container, state, refresh) {
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
    renderSession(container, state, refresh);
    renderCurrent(container, state, refresh);
    renderDraftQueue(container, state, refresh);
    renderStaleQueue(container, state, refresh);
    renderWorkoutNotes(container, state);
    renderLibrary(container, state, refresh);
    renderHistory(container, state);
    renderAnalysisSection(container, state);
    renderObservationSection(container, state, refresh);
  }

  let shellController = null;

  async function renderDashboard(app, container, options) {
    if (!core || !storeApi || !importer || !objects) throw new Error("Workout Workspace modules are unavailable.");
    root.app = app;
    container.empty(); container.addClass("prodigy-workout-dashboard"); injectStyles(container);

    const shell = root.WorkoutHealthShell;
    const nutritionView = root.WorkoutNutritionView;
    const runningView = root.WorkoutRunningView;

    // If shell module is unavailable, fall back to strength-only
    if (!shell || !shell.renderShell) {
      const state = await loadState(app);
      const refresh = () => renderDashboard(app, container, options);
      await renderStrengthDashboard(app, container, state, refresh);
      return;
    }

    shellController = shell.renderShell(container, {
      strength: async (panel) => {
        const state = await loadState(app);
        const refresh = () => renderDashboard(app, container, options);
        await renderStrengthDashboard(app, panel, state, refresh);
      },
      nutrition: nutritionView ? (panel) => nutritionView.renderNutritionPanel(app, panel) : null,
      running: runningView ? (panel) => runningView.renderRunningPanel(app, panel) : null,
    }, options || {});
  }

  const api = {
    ImportProgramModal, ProgramEditorModal, ProgramHistoryModal, QuickWorkoutModal,
    RenameProgramModal, CreateExerciseModal, ExerciseDetailModal,
    AddExerciseToProgramModal, CreateProgramModal,
    journalMetrics, loadState, loadWorkoutNotes, openExerciseObject,
    openExercisePopup, openExerciseNoteSide, renderDashboard,
    renderContinueStrip, renderDraftQueue, renderStaleQueue,
    appendExerciseToProgram, persistProgram,
    openTab: (tabId) => { if (shellController) shellController.openTab(tabId); },
  };
  root.WorkoutView = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
