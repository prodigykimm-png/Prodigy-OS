(function (root) {
  "use strict";

  const core = root.WorkoutCore || (typeof require === "function" ? require("./workout-core.js") : null);
  const storeApi = root.WorkoutStore || (typeof require === "function" ? require("./workout-store.js") : null);
  const importer = root.WorkoutImport || (typeof require === "function" ? require("./workout-import.js") : null);
  const objects = root.WorkoutProgramObjects || (typeof require === "function" ? require("./workout-program-objects.js") : null);

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
    const draft = activeRun
      ? sessions.find((session) => session.program_run_id === activeRun.run_id && session.status === "draft") || null
      : sessions.find((session) => session.status === "draft") || null;
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
    await state.store.saveSession(session);
    await refresh();
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
    box.createEl("div", { text: cont.title || "오늘 운동", attr: { class: "workout-continue-title" } });
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
      } else if (state.activeRun && item.program_run_id === state.activeRun.run_id) {
        button(actions, "이 초안 열기", true).onclick = async () => {
          // Prefer this draft by refreshing focus — already in state.sessions
          notice("해당 초안이 현재 실행에 연결되어 있습니다. 아래에서 이어서 기록하세요.");
          const el = parent.querySelector && parent.querySelector(".workout-session-live");
          if (el && el.scrollIntoView) el.scrollIntoView({ behavior: "smooth", block: "start" });
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

  function renderSession(parent, state, refresh) {
    if (!state.draft) return;
    const session = state.draft;
    const area = section(parent, `${core.dayLabel(session) || "오늘 세션"}`, "필수: 완료 체크 · 중량/횟수. 이전이 있으면 원탭 복제.");
    area.addClass && area.addClass("workout-session-live");
    if (!area.classList || !area.classList.contains("workout-session-live")) {
      area.setAttribute && area.setAttribute("class", `${area.getAttribute("class") || ""} workout-session-live`.trim());
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
        complete.onchange = () => update({ completed: complete.checked });
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
        await state.store.saveSession(result.session);
        await state.store.saveRun(result.run);
        const nextLabel = result.run.suggested_day && state.activeProgram
          ? core.dayLabel(state.activeProgram.days.find((d) => d.id === result.run.suggested_day) || {})
          : "";
        notice(result.run.status === "completed"
          ? "프로그램 실행을 완료했습니다."
          : (nextLabel ? `운동 완료 · 다음 ${nextLabel}` : "운동을 완료했습니다."));
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
      empty(area, "진행 중인 프로그램이 없습니다. 라이브러리에서 프로그램을 시작하세요.");
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
    if (state.draft) return;
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
    const area = section(parent, "운동 기록", "완료 세션 타임라인 · Run · 빠른 운동");
    const timeline = (state.model && state.model.timeline) || core.completedSessionTimeline(state.sessions, 12);
    const completedRuns = state.runs
      .filter((run) => ["completed", "abandoned"].includes(run.status))
      .sort((a, b) => String(b.completed_at || "").localeCompare(String(a.completed_at || "")));
    if (!timeline.length && !completedRuns.length) {
      return empty(area, "아직 완료된 운동 기록이 없습니다.");
    }
    if (timeline.length) {
      area.createEl("h3", { text: "최근 세션", attr: { style: "margin:8px 0 4px;font-size:0.92em;" } });
      timeline.forEach((item) => {
        const row = area.createDiv({ attr: { class: "workout-history-row" } });
        row.createEl("strong", { text: item.title });
        row.createEl("span", {
          text: [item.date, item.sets_label, item.distance, item.duration].filter(Boolean).join(" · ")
        });
      });
    }
    if (completedRuns.length) {
      area.createEl("h3", { text: "프로그램 실행", attr: { style: "margin:12px 0 4px;font-size:0.92em;" } });
      completedRuns.slice(0, 5).forEach((run) => {
        const row = area.createDiv({ attr: { class: "workout-history-row" } });
        row.createEl("strong", { text: `${run.program_title} · 실행 #${run.run_number}` });
        row.createEl("span", {
          text: `${statusLabel(run.status)} · ${(run.completed_at || run.started_at || "").slice(0, 10)}`
        });
      });
    }
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

  function injectStyles(container) {
    container.createEl("style", { text: `
.prodigy-workout-dashboard{max-width:920px;margin:0 auto;padding-bottom:48px}.workout-toolbar{display:flex;justify-content:flex-end;gap:8px;margin:8px 0 16px}.workout-button{min-height:40px;border-radius:6px;padding:6px 12px}.workout-section{padding:20px 0;border-bottom:1px solid var(--background-modifier-border)}.workout-section h2{margin:0;font-size:1.05em}.workout-section-copy,.workout-muted,.workout-empty{color:var(--text-muted);font-size:.82em;line-height:1.45;margin:4px 0 12px}.workout-current,.workout-library-row,.workout-history-row{display:flex;align-items:flex-start;justify-content:space-between;gap:12px}.workout-current h3,.workout-exercise-heading h3{margin:0;font-size:1.12em}.workout-current p,.workout-exercise-heading p{margin:3px 0 0;color:var(--text-muted);font-size:.78em}.workout-exercise-title-row{display:flex;flex-wrap:wrap;align-items:baseline;gap:6px 8px}
.workout-exercise-link{border:0;background:none;padding:0;color:var(--text-accent);font:inherit;font-weight:700;text-align:left;cursor:pointer}
.workout-exercise-note-link{border:0;background:none;padding:0;margin:0;color:var(--text-muted);font-size:0.72em;font-weight:650;cursor:pointer;text-decoration:underline;text-underline-offset:2px;opacity:0.9}
.workout-exercise-note-link:hover{color:var(--text-accent)}
.workout-exercise-target-tag{font-size:0.7em}.workout-inline-actions,.workout-modal-actions{display:flex;gap:8px;flex-wrap:wrap}.workout-day-chooser{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:8px;margin-top:16px}.workout-day-chooser select,.workout-modal select,.workout-modal input,.workout-modal textarea{width:100%;min-height:44px}.workout-metrics{display:flex;gap:10px;flex-wrap:wrap}.workout-metric{display:flex;gap:7px;align-items:baseline;padding:8px 10px;background:var(--background-secondary);border-radius:6px}.workout-metric span{font-size:.74em;color:var(--text-muted)}.workout-exercise-card{margin-top:12px;padding:14px;border:1px solid var(--background-modifier-border);border-radius:8px;background:var(--background-secondary)}.workout-exercise-heading{display:flex;justify-content:space-between;gap:12px;align-items:start}.workout-previous{color:var(--text-muted);font-size:.74em;text-align:right}.workout-set-list{margin-top:12px}.workout-set-row{display:grid;grid-template-columns:44px 52px minmax(0,1fr);gap:8px;align-items:center;padding:10px 0;border-top:1px solid var(--background-modifier-border)}.workout-set-row>input{width:22px;height:22px;margin:auto}.workout-set-fields{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}.workout-field{display:flex;flex-direction:column;gap:3px}.workout-field label{font-size:.7em;color:var(--text-muted)}.workout-field input,.workout-field textarea{min-height:40px;width:100%;box-sizing:border-box}.workout-set-row>.workout-field{grid-column:3}.workout-library-row,.workout-history-row{padding:12px 0;border-top:1px solid var(--background-modifier-border)}.workout-library-row>div:first-child,.workout-history-row{display:flex;flex-direction:column;gap:3px;min-width:0;flex:1}.workout-library-row span,.workout-history-row span{font-size:.78em;color:var(--text-muted)}.workout-library-row .workout-inline-actions{flex:0 1 auto;max-width:100%}.workout-modal{max-width:680px}.workout-program-editor{max-width:880px}.workout-modal-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}.workout-modal-actions{justify-content:flex-end;margin-top:16px}.workout-import-preview{margin-top:14px}.workout-import-details,.workout-editor-days{max-height:58vh;overflow-y:auto;padding-right:4px}.workout-import-details li{margin-bottom:5px;line-height:1.4}.workout-editor-meta{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:12px}.workout-editor-errors{margin:8px 0}.workout-editor-day{padding:12px 0;border-top:1px solid var(--background-modifier-border)}.workout-editor-day h3{margin:0 0 8px}.workout-editor-day-head{display:grid;grid-template-columns:auto 1fr 1fr auto;gap:8px;align-items:end;margin-bottom:8px}.workout-editor-exercise{padding:10px 0;border-top:1px solid var(--background-modifier-border)}.workout-editor-heading{display:grid;grid-template-columns:minmax(180px,1fr) auto;gap:8px}.workout-editor-controls{display:flex;gap:4px;flex-wrap:wrap}.workout-editor-controls .workout-button{min-width:40px;padding:4px}.workout-editor-set{display:grid;grid-template-columns:52px repeat(4,minmax(70px,1fr)) 40px;gap:8px;align-items:end;margin-top:8px}.workout-editor-set>.workout-button{padding:4px}.workout-editor-add{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:8px;margin-top:10px}.workout-error{color:var(--text-error);font-size:.84em;margin:4px 0}
.workout-continue-strip{margin:0 0 12px;padding:12px;border-radius:10px;border:1px solid var(--background-modifier-border);background:var(--background-secondary)}
.workout-continue-kicker{font-weight:800;font-size:.88em;color:var(--text-accent);margin-bottom:4px}
.workout-continue-title{font-weight:700;font-size:.95em}
.workout-continue-reason{margin-top:6px;font-size:.78em;color:var(--text-muted)}
.workout-progress{margin-top:8px}
.workout-progress-label{font-size:.78em;color:var(--text-muted);font-weight:650;margin-bottom:4px}
.workout-progress-track{height:8px;border-radius:999px;background:var(--background-modifier-border);overflow:hidden}
.workout-progress-fill{height:100%;background:var(--text-accent);border-radius:999px}
.workout-set-toolbar{display:flex;justify-content:flex-end;gap:6px;margin:8px 0 0}
.workout-set-row-min{grid-template-columns:40px 28px minmax(0,1fr) auto auto auto;gap:6px;align-items:center}
.workout-set-fields-min{grid-template-columns:repeat(2,minmax(0,1fr));gap:6px}
.workout-chip-btn{min-height:32px!important;padding:2px 8px!important;font-size:.72em!important;border-radius:999px!important}
.workout-set-remove{min-width:36px;min-height:36px!important;padding:0!important;font-size:1.15em!important;line-height:1;font-weight:700;color:var(--text-muted);border-radius:8px!important}
.workout-set-remove:hover{color:var(--text-error);background:color-mix(in srgb,var(--text-error) 12%,transparent)}
.workout-set-more{font-size:.75em;color:var(--text-muted)}
.workout-set-more summary{cursor:pointer;list-style:none;padding:2px 4px}
.workout-more-menu{font-size:.82em}
.workout-more-menu summary{cursor:pointer;color:var(--text-muted);font-weight:600}
.workout-session-live{scroll-margin-top:12px}
.workout-target-filter{margin:8px 0 10px}
.workout-target-chips{display:flex;flex-wrap:wrap;gap:6px}
.workout-exercise-cue{margin:4px 0 0;font-size:.8em;line-height:1.4;color:var(--text-accent);font-weight:650}
.workout-record-strip{font-size:.74em;line-height:1.4;color:var(--text-muted)}
.workout-modal-exercise{max-width:min(720px,96vw)}
.workout-exercise-body-wrap{margin-top:14px}
.workout-exercise-body{margin-top:6px;max-height:min(48vh,420px);overflow:auto;padding:12px 14px;border:1px solid var(--background-modifier-border);border-radius:10px;background:var(--background-primary)}
.workout-exercise-body-md{font-size:.92em;line-height:1.55}
.workout-exercise-body-md p{margin:0.4em 0}
.workout-exercise-body-md ul,.workout-exercise-body-md ol{margin:0.35em 0 0.5em;padding-left:1.25em}
.workout-exercise-body-section{margin:0 0 10px}
.workout-exercise-body-heading{margin:10px 0 4px;font-size:.92em;color:var(--text-accent)}
.workout-exercise-body-line{font-size:.88em;line-height:1.5;white-space:pre-wrap;overflow-wrap:anywhere}
@media(max-width:600px){.prodigy-workout-dashboard{padding:0 4px 40px}.workout-toolbar,.workout-inline-actions,.workout-modal-actions{flex-direction:column}.workout-toolbar .workout-button,.workout-inline-actions .workout-button,.workout-modal-actions .workout-button{width:100%;min-height:44px}.workout-current,.workout-library-row,.workout-history-row,.workout-exercise-heading{align-items:stretch;flex-direction:column}.workout-day-chooser,.workout-editor-heading,.workout-editor-set,.workout-editor-add,.workout-editor-meta,.workout-editor-day-head{grid-template-columns:1fr}.workout-editor-controls{display:grid;grid-template-columns:repeat(3,1fr)}.workout-editor-controls .workout-button{min-height:44px}.workout-day-chooser .workout-button{min-height:48px}.workout-section{padding:16px 0}.workout-exercise-card{padding:12px}.workout-previous{text-align:left}.workout-set-row{grid-template-columns:40px minmax(0,1fr)}.workout-set-row-min{grid-template-columns:40px 24px minmax(0,1fr) auto}.workout-set-remove{min-width:44px;min-height:44px!important}.workout-set-row>strong{font-size:.82em}.workout-set-fields,.workout-set-fields-min{grid-column:1/-1}.workout-set-row>.workout-field{grid-column:1/-1}.workout-field input{min-height:44px}.workout-modal-grid{grid-template-columns:1fr}.workout-chip-btn{min-height:40px!important}}
` });
  }

  async function renderDashboard(app, container) {
    if (!core || !storeApi || !importer || !objects) throw new Error("Workout Workspace modules are unavailable.");
    root.app = app;
    container.empty(); container.addClass("prodigy-workout-dashboard"); injectStyles(container);
    const state = await loadState(app);
    const refresh = () => renderDashboard(app, container);
    const toolbar = container.createDiv({ attr: { class: "workout-toolbar" } });
    button(toolbar, "새 프로그램", true).onclick = () => new CreateProgramModal(app, state, refresh).open();
    button(toolbar, "프로그램 가져오기").onclick = () => new ImportProgramModal(app, refresh).open();
    button(toolbar, "빠른 운동").onclick = () => new QuickWorkoutModal(app, refresh).open();
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
  }

  const api = {
    ImportProgramModal, ProgramEditorModal, ProgramHistoryModal, QuickWorkoutModal,
    RenameProgramModal, CreateExerciseModal, ExerciseDetailModal,
    AddExerciseToProgramModal, CreateProgramModal,
    journalMetrics, loadState, loadWorkoutNotes, openExerciseObject,
    openExercisePopup, openExerciseNoteSide, renderDashboard,
    renderContinueStrip, renderDraftQueue, renderStaleQueue,
    appendExerciseToProgram, persistProgram,
  };
  root.WorkoutView = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
