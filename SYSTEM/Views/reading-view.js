(function (root) {
  "use strict";

  const RESPONSIVE_CSS = `
.reading-responsive-workspace{display:grid;grid-template-rows:auto minmax(0,1fr);gap:var(--ke-space-3,8px);min-block-size:0;min-inline-size:0;color:var(--text-normal)}
.reading-responsive-tabs[hidden],.reading-responsive-pane[hidden]{display:none}
.reading-responsive-grid{display:grid;grid-template-columns:minmax(min(18rem,100%),4fr) minmax(min(22rem,100%),6fr);gap:var(--ke-space-4,12px);min-block-size:0;min-inline-size:0}
.reading-responsive-workspace[data-reading-layout="compact"] .reading-responsive-grid,.reading-responsive-workspace[data-reading-layout="medium"] .reading-responsive-grid{grid-template-columns:minmax(0,1fr)}
.reading-responsive-pane{min-block-size:0;min-inline-size:0;overflow:auto;word-break:keep-all;overflow-wrap:anywhere}
.reading-responsive-pane:focus-visible{outline:2px solid var(--text-accent);outline-offset:2px}
.reading-responsive-workspace[data-reading-layout="compact"] .prodigy-adaptive-tab{min-block-size:var(--reading-touch-target)}
@media(prefers-reduced-motion:reduce){.reading-responsive-workspace *{transition:none!important;animation:none!important;transform:none!important}}
`;

  function resolveModule(globalName, relativePath) {
    if (root[globalName]) return root[globalName];
    if (typeof require === "function") {
      try { return require(relativePath); } catch (_error) { return null; }
    }
    return null;
  }

  function responsiveTokens() {
    const tokens = resolveModule("ProdigyTokens", "./design-tokens.js");
    if (!tokens || !tokens.BREAKPOINTS || !tokens.CONTROL_HEIGHTS) {
      throw new Error("독서 반응형 디자인 토큰을 불러오지 못했습니다.");
    }
    return tokens;
  }

  function layoutForWidth(logicalWidth) {
    const width = Number(logicalWidth);
    if (!Number.isFinite(width)) throw new Error("독서 작업면 logicalWidth가 필요합니다.");
    const breakpoints = responsiveTokens().BREAKPOINTS;
    if (width >= breakpoints.wide) return "wide";
    if (width >= breakpoints.medium) return "medium";
    return "compact";
  }

  function setAttribute(element, name, value) {
    if (element && typeof element.setAttr === "function") element.setAttr(name, value);
    else if (element && typeof element.setAttribute === "function") element.setAttribute(name, value);
  }

  function setHidden(element, hidden) {
    if (!element) return;
    element.hidden = hidden;
    if (hidden) setAttribute(element, "hidden", "");
    else if (typeof element.removeAttribute === "function") element.removeAttribute("hidden");
    else if (element.attr) delete element.attr.hidden;
  }

  function renderResponsiveWorkspace(container, options) {
    const opts = options || {};
    if (!container || typeof container.createEl !== "function") return null;
    const layout = layoutForWidth(opts.logicalWidth);
    const activePane = opts.activePane === "detail" ? "detail" : "list";
    const tokens = responsiveTokens();
    const controls = resolveModule("ProdigyAdaptiveControls", "./prodigy-adaptive-controls.js");
    if (!controls || typeof controls.AdaptiveTabs !== "function") {
      throw new Error("독서 반응형 탭을 불러오지 못했습니다.");
    }

    if (typeof container.empty === "function") container.empty();
    setAttribute(container, "data-reading-layout", layout);
    const style = container.createEl("style", { text: RESPONSIVE_CSS, attr: { "data-reading-responsive-style": "true" } });
    style.textContent = RESPONSIVE_CSS;
    const shell = container.createEl("section", {
      attr: {
        class: "reading-responsive-workspace",
        "data-reading-layout": layout,
        style: `--reading-touch-target:${tokens.CONTROL_HEIGHTS.touchTarget}px`
      }
    });
    const tabsHost = shell.createEl("div", { attr: { class: "reading-responsive-tabs" } });
    const grid = shell.createEl("div", { attr: { class: "reading-responsive-grid" } });
    const list = grid.createEl("section", {
      attr: { class: "reading-responsive-pane reading-responsive-list", "data-reading-pane": "list", tabindex: "-1", "aria-label": "독서 목록" }
    });
    const detail = grid.createEl("section", {
      attr: { class: "reading-responsive-pane reading-responsive-detail", "data-reading-pane": "detail", tabindex: "-1", "aria-label": "독서 상세" }
    });
    if (typeof opts.renderList === "function") opts.renderList(list, opts.model);
    if (typeof opts.renderDetail === "function") opts.renderDetail(detail, opts.model);

    const tabs = controls.AdaptiveTabs(tabsHost, {
      label: "독서 작업면",
      activeId: activePane,
      tabs: [
        { id: "list", label: "목록", panel: list },
        { id: "detail", label: "이어 읽기", panel: detail }
      ],
      onChange: opts.onPaneChange
    });
    const wide = layout === "wide";
    setHidden(tabsHost, wide);
    setHidden(list, !wide && activePane !== "list");
    setHidden(detail, !wide && activePane !== "detail");
    return { element: shell, grid, list, detail, tabs, layout };
  }

  function mountResponsiveWorkspace(options) {
    const opts = options || {};
    let logicalWidth = opts.logicalWidth;
    let activePane = opts.activePane === "detail" ? "detail" : "list";
    let model = opts.model;
    let rendered = null;
    const render = () => {
      rendered = renderResponsiveWorkspace(opts.container, {
        logicalWidth,
        activePane,
        model,
        renderList: opts.renderList,
        renderDetail: opts.renderDetail,
        onPaneChange(pane) {
          activePane = pane;
          if (typeof opts.onPaneChange === "function") opts.onPaneChange(pane);
        }
      });
      return rendered;
    };
    render();
    return Object.freeze({
      setLogicalWidth(value) {
        if (Number(value) === Number(logicalWidth)) return rendered;
        logicalWidth = value;
        return render();
      },
      selectPane(value) { activePane = value === "detail" ? "detail" : "list"; return render(); },
      setModel(value) { model = value; return render(); },
      getLayout() { return layoutForWidth(logicalWidth); },
      getActivePane() { return activePane; }
    });
  }

  function openPath(app, path) {
    if (!path) return;
    return app.workspace.openLinkText(String(path).replace(/\.md$/, ""), "", false);
  }

  function notify(message) {
    const Notice = root.Notice || (typeof window !== "undefined" && window.Notice);
    if (typeof Notice === "function") new Notice(message);
  }

  async function openKnowledgeExplorer(app) {
    const workspace = app && app.workspace;
    if (workspace && typeof workspace.openLinkText === "function") {
      try {
        await workspace.openLinkText("HUB/50 Knowledge", "", false);
        return true;
      } catch (_error) { /* recovery notice below */ }
    }
    notify("Knowledge Explorer를 열 수 없습니다. HUB/50 Knowledge.md에서 검토해 주세요.");
    return false;
  }

  function projectReadingCandidate(candidate) {
    const source = candidate || {};
    const sourceObjects = Array.isArray(source.source_objects) ? source.source_objects : [];
    const sourceSession = String(source.source_session || sourceObjects.find((value) => /Reading\/Sessions/i.test(String(value))) || sourceObjects[0] || "").trim();
    const suppliedQuality = source.evidence_quality && typeof source.evidence_quality === "object" ? source.evidence_quality.status : "";
    const qualityStatus = ["thin", "usable", "strong"].includes(suppliedQuality)
      ? suppliedQuality
      : source.confidence === "explicit" ? "usable" : ["inferred", "low"].includes(source.confidence) ? "thin" : "unavailable";
    const qualityLabels = { thin: "보완 필요", usable: "사용 가능", strong: "근거 충분", unavailable: "확인 불가" };
    const status = String(source.status || "").trim();
    return {
      title: String(source.title || "제목 없음").trim(),
      statement: String(source.statement || "").trim(),
      status,
      status_label: status === "saved" ? "저장됨" : "제안됨",
      source_session: sourceSession,
      quality: { available: qualityStatus !== "unavailable", status: qualityStatus, label: qualityLabels[qualityStatus] },
      review_target: "HUB/50 Knowledge.md",
      counts_as_knowledge: false
    };
  }

  function fieldInput(parent, label, key, state, options = {}) {
    if (label) {
      parent.createEl("label", {
        text: label,
        attr: { style: "display:block;font-weight:600;margin:10px 0 4px;font-size:0.86em;" }
      });
    }
    const isArea = options.rows && options.rows > 1;
    const input = parent.createEl(isArea ? "textarea" : "input", {
      attr: {
        type: isArea ? undefined : "text",
        rows: isArea ? String(options.rows) : undefined,
        placeholder: options.placeholder || "",
        style: "width:100%;padding:8px;border-radius:6px;border:1px solid var(--background-modifier-border);background:var(--background-primary);color:var(--text-normal);min-height:" + (isArea ? "72px" : "40px") + ";box-sizing:border-box;"
      }
    });
    input.value = state[key] || "";
    input.oninput = () => { state[key] = input.value; };
    return input;
  }

  function progressNumberOf(book, options) {
    const opts = options || {};
    const raw = opts.progress != null && opts.progress !== ""
      ? opts.progress
      : (book && book.progress);
    if (raw == null || raw === "") return null;
    const n = Number(String(raw).replace(/%/g, "").trim());
    return Number.isFinite(n) ? Math.min(100, Math.max(0, Math.round(n))) : null;
  }

  function buildSessionPayload(book, state, options) {
    const opts = options || {};
    const note = String(state.note || state.key_content || state.my_thought || "").trim();
    const progress = state.progress != null && state.progress !== ""
      ? state.progress
      : progressNumberOf(book, opts);
    return {
      date: root.ReadingCore.todayIsoDate(),
      note,
      key_content: note,
      my_thought: "",
      thinking_delta: String(state.thinking_delta || "").trim(),
      reading_range: String(state.reading_range || "").trim(),
      duration: String(state.duration || "").trim(),
      next_position: String(state.next_position || "").trim(),
      next_action: String(state.next_action || "").trim(),
      progress: progress == null ? "" : progress
    };
  }

  /**
   * Minimal session save — one memo is enough.
   * Used by openSessionModal and openQuickSession (same product path).
   */
  async function saveQuickSession(app, book, options, onSaved) {
    const opts = options || {};
    let note = opts.note != null ? String(opts.note) : "";
    if (!opts.skipPrompt && !note) {
      const promptLabel = `[${(book && (book.book_title || book.title)) || "책"}] 오늘 읽기`;
      const seed = (book && book.next_action) || opts.next_action || "";
      if (typeof window.obsidianPrompt === "function") {
        const input = await window.obsidianPrompt(promptLabel, "한 줄 메모:", seed);
        if (input === null) return null;
        note = String(input || "").trim();
      } else if (typeof window.prompt === "function") {
        const input = window.prompt("한 줄 메모:", seed);
        if (input === null) return null;
        note = String(input || "").trim();
      }
    }
    if (!note) {
      if (window.Notice) new Notice("한 줄 메모가 필요합니다.");
      return null;
    }
    const formValues = buildSessionPayload(book, {
      note,
      next_action: opts.next_action || (book && book.next_action) || "",
      progress: opts.progress,
      thinking_delta: opts.thinking_delta || "",
      duration: opts.duration || ""
    }, opts);
    const session = await root.ReadingStore.saveSession(app, book, formValues);
    if (window.Notice) new Notice("독서 세션을 저장했습니다.");
    if (onSaved) await onSaved(session);
    return session;
  }

  function openQuickSession(app, book, onSaved, options) {
    // Same minimal path as 오늘 읽기 — no separate form wall.
    return openSessionModal(app, book, onSaved, options || {});
  }

  /**
   * 오늘 읽기 — minimal by design.
   * Required: one memo. Optional: progress chip, next_action.
   * Advanced fields stay behind "더 보기".
   */
  function openSessionModal(app, book, onSaved, options) {
    const opts = options || {};
    const obsidianModule = root.obsidian || window.obsidian;
    const initialProgress = progressNumberOf(book, opts);
    const initial = {
      note: opts.note || "",
      next_action: opts.next_action || (book && book.next_action) || "",
      progress: initialProgress == null ? "" : String(initialProgress),
      thinking_delta: "",
      duration: "",
      next_position: "",
      reading_range: ""
    };

    if (!obsidianModule || !obsidianModule.Modal) {
      return saveQuickSession(app, book, {
        note: initial.note,
        next_action: initial.next_action,
        progress: initial.progress
      }, onSaved);
    }

    class SessionModal extends obsidianModule.Modal {
      constructor(appInstance) {
        super(appInstance);
        this.state = { ...initial };
      }
      onOpen() {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.createEl("h3", {
          text: `오늘 읽기 — ${book.book_title || book.title || "책"}`,
          attr: { style: "margin:0 0 6px;" }
        });
        contentEl.createEl("p", {
          text: "한 줄이면 충분합니다. 나머지는 필요할 때만.",
          attr: { style: "color:var(--text-muted);font-size:0.84em;margin:0 0 10px;" }
        });

        // Primary: one memo
        fieldInput(contentEl, "한 줄 메모", "note", this.state, {
          rows: 3,
          placeholder: "오늘 읽으며 남길 핵심 또는 생각"
        });

        // Optional progress — same discrete steps as card (no page fields)
        const progressWrap = contentEl.createEl("div", {
          attr: { style: "margin-top:12px;" }
        });
        progressWrap.createEl("div", {
          text: "진행 (선택)",
          attr: { style: "font-weight:600;font-size:0.86em;margin-bottom:6px;" }
        });
        const chipRow = progressWrap.createEl("div", {
          attr: { style: "display:flex;flex-wrap:wrap;gap:6px;" }
        });
        const steps = [25, 50, 75, 100];
        const paintChips = () => {
          chipRow.empty();
          const current = this.state.progress === "" || this.state.progress == null
            ? null
            : Number(this.state.progress);
          steps.forEach((step) => {
            const on = current === step;
            const chip = chipRow.createEl("button", {
              text: `${step}%`,
              attr: {
                type: "button",
                class: on ? "prodigy-btn prodigy-btn-primary" : "prodigy-btn",
                style: "min-height:28px;padding:2px 10px;font-size:0.78em;border-radius:999px;"
              }
            });
            chip.onclick = (e) => {
              if (e && e.preventDefault) e.preventDefault();
              this.state.progress = on ? "" : String(step);
              paintChips();
            };
          });
        };
        if (root.ProdigyUI) root.ProdigyUI.ensureStyles();
        paintChips();

        // Optional next_action — one line, often already on the book
        fieldInput(contentEl, "다음 행동 (선택)", "next_action", this.state, {
          placeholder: "다음에 할 일 한 줄"
        });

        // Advanced: rare fields, collapsed
        const details = contentEl.createEl("details", {
          attr: { style: "margin-top:12px;" }
        });
        details.createEl("summary", {
          text: "더 보기 (선택)",
          attr: {
            style: "cursor:pointer;font-size:0.82em;color:var(--text-muted);font-weight:600;"
          }
        });
        const advanced = details.createEl("div", {
          attr: { style: "margin-top:6px;" }
        });
        fieldInput(advanced, "생각의 변화", "thinking_delta", this.state, {
          rows: 2,
          placeholder: "읽기 전후 달라진 점"
        });
        const deltaBtn = root.ProdigyUI
          ? root.ProdigyUI.button(advanced, "Thinking Delta 초안 만들기")
          : advanced.createEl("button", { text: "Thinking Delta 초안 만들기", attr: { type: "button", class: "prodigy-btn", style: "margin-top:6px;font-size:0.82em;" } });
        deltaBtn.onclick = () => { deltaBtn.disabled = true; deltaBtn.textContent = "생성 중…"; this.requestThinkingDelta().finally(() => { deltaBtn.disabled = false; deltaBtn.textContent = "Thinking Delta 초안 만들기"; }); };
        deltaBtn.style.marginTop = "6px";
        deltaBtn.style.fontSize = "0.82em";
        fieldInput(advanced, "독서 시간", "duration", this.state, {
          placeholder: "예: 25m"
        });
        fieldInput(advanced, "읽은 범위", "reading_range", this.state, {
          placeholder: "비우면 자동 (오늘 읽기 / 진행 %)"
        });

        const actions = contentEl.createEl("div", {
          attr: { style: "display:flex;gap:8px;justify-content:flex-end;margin-top:14px;flex-wrap:wrap;" }
        });
        const cancel = root.ProdigyUI
          ? root.ProdigyUI.button(actions, "취소", { onClick: () => this.close() })
          : actions.createEl("button", { text: "취소", attr: { type: "button", class: "prodigy-btn" } });
        if (!root.ProdigyUI) cancel.onclick = () => this.close();
        const save = root.ProdigyUI
          ? root.ProdigyUI.button(actions, "저장", { primary: true })
          : actions.createEl("button", { text: "저장", attr: { type: "button", class: "prodigy-btn prodigy-btn-primary" } });
        save.onclick = async () => {
          const note = String(this.state.note || "").trim();
          if (!note) {
            if (window.Notice) new Notice("한 줄 메모가 필요합니다.");
            return;
          }
          save.disabled = true;
          try {
            const payload = buildSessionPayload(book, this.state, opts);
            const session = await root.ReadingStore.saveSession(app, book, payload);
            if (window.Notice) new Notice("독서 세션을 저장했습니다.");
            this.close();
            if (onSaved) await onSaved(session);
          } catch (error) {
            save.disabled = false;
            if (window.Notice) new Notice(error.message || String(error));
          }
        };
      }
      onClose() { this.contentEl.empty(); }
      async requestThinkingDelta() {
        if (!root.ReadingThinkingDeltaAI || typeof root.ReadingThinkingDeltaAI.generateThinkingDelta !== "function") {
          if (window.Notice) new Notice("Thinking Delta AI 모듈이 로드되지 않았습니다.");
          return;
        }
        var beforeText = "";
        var afterText = String(this.state.note || "").trim();
        if (root.ReadingChecklistStore && root.ReadingChecklistCore) {
          try {
            var store = root.ReadingChecklistStore.createChecklistStore(root.ReadingChecklistStore.createObsidianAdapter(app));
            var path = book.path || "";
            var state = await store.read(path);
            if (state && state.drafts) {
              beforeText = Object.values(state.drafts).filter(Boolean).join("\n");
            }
          } catch (_e) { /* no checklist data */ }
        }
        if (!afterText) afterText = String(this.state.thinking_delta || "").trim();
        try {
          var result = await root.ReadingThinkingDeltaAI.generateThinkingDelta({
            app: app,
            title: book.book_title || book.title || "",
            before: beforeText,
            after: afterText,
            sessionNotes: afterText
          });
          this.state.thinking_delta = result.before + "\n→ " + result.after + "\n이유: " + result.reason;
          var deltaField = this.contentEl.querySelector('[data-field="thinking_delta"]');
          if (deltaField) deltaField.value = this.state.thinking_delta;
          if (window.Notice) new Notice("Thinking Delta 초안이 생성되었습니다. 검토 후 저장하세요.");
        } catch (error) {
          if (error.code === "INSUFFICIENT_RECORDS") {
            if (window.Notice) new Notice("읽기 전 질문 답안(체크리스트)이나 세션 메모를 먼저 적어 주세요. Before와 After가 모두 있어야 Thinking Delta를 생성할 수 있습니다.");
          } else {
            if (window.Notice) new Notice(error.message || String(error));
          }
        }
      }
    }

    new SessionModal(app).open();
  }

  function openCandidateModal(app, session, onSaved) {
    const obsidianModule = root.obsidian || window.obsidian;
    const seed = root.ReadingCore.createKnowledgeCandidate(session, {});
    const state = {
      title: seed.title,
      statement: seed.statement,
      reason: ""
    };

    if (!obsidianModule || !obsidianModule.Modal) {
      const title = window.prompt("후보 제목", state.title);
      if (title === null) return null;
      const statement = window.prompt("지식 문장", state.statement);
      if (statement === null) return null;
      const reason = window.prompt("중요한 이유", "");
      if (reason === null) return null;
      return root.ReadingStore.saveCandidate(app, session, { title, statement, reason })
        .then(async (candidate) => { if (onSaved) await onSaved(candidate); return candidate; });
    }

    class CandidateModal extends obsidianModule.Modal {
      constructor(appInstance) {
        super(appInstance);
        this.state = { ...state };
      }
      onOpen() {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.createEl("h3", { text: "지식 후보 만들기" });
        contentEl.createEl("p", {
          text: "후보만 저장합니다. 승인·Knowledge 생성은 하지 않습니다.",
          attr: { style: "color:var(--text-muted);font-size:0.84em;" }
        });
        fieldInput(contentEl, "후보 제목", "title", this.state);
        fieldInput(contentEl, "지식 문장", "statement", this.state, { rows: 4 });
        fieldInput(contentEl, "중요한 이유", "reason", this.state, { rows: 3 });
        const actions = contentEl.createEl("div", {
          attr: { style: "display:flex;gap:8px;justify-content:flex-end;margin-top:14px;flex-wrap:wrap;" }
        });
        if (root.ProdigyUI) root.ProdigyUI.ensureStyles();
        const cancel = root.ProdigyUI
          ? root.ProdigyUI.button(actions, "취소", { onClick: () => this.close() })
          : actions.createEl("button", { text: "취소", attr: { type: "button", class: "prodigy-btn" } });
        if (!root.ProdigyUI) cancel.onclick = () => this.close();
        const save = root.ProdigyUI
          ? root.ProdigyUI.button(actions, "후보 저장", { primary: true })
          : actions.createEl("button", { text: "후보 저장", attr: { type: "button", class: "prodigy-btn prodigy-btn-primary" } });
        save.onclick = async () => {
          save.disabled = true;
          try {
            const candidate = await root.ReadingStore.saveCandidate(app, session, this.state);
            if (window.Notice) new Notice("지식 후보를 저장했습니다.");
            this.close();
            if (onSaved) await onSaved(candidate);
          } catch (error) {
            save.disabled = false;
            if (window.Notice) new Notice(error.message || String(error));
          }
        };
      }
      onClose() { this.contentEl.empty(); }
    }

    new CandidateModal(app).open();
  }

  function section(container, title) {
    const card = container.createEl("div", {
      attr: {
        class: "reading-loop-card",
        style: "border:1px solid var(--background-modifier-border);border-radius:8px;background:var(--background-secondary);padding:14px;margin:0 0 12px;"
      }
    });
    card.createEl("h2", { text: title, attr: { style: "margin:0 0 10px;font-size:1.05em;" } });
    return card;
  }

  function empty(parent, text) {
    parent.createEl("div", {
      text,
      attr: { style: "color:var(--text-muted);font-size:0.85em;font-style:italic;" }
    });
  }

  /**
   * Renders session history + knowledge candidates under the Reading books list.
   * Not a separate product concept — just recent execution records.
   */
  async function renderSessionHistory(app, container) {
    if (!app || !container || !root.ReadingCore || !root.ReadingStore) return;
    container.empty();
    if (root.ProdigyUI) root.ProdigyUI.ensureStyles();

    const style = container.createEl("style");
    style.textContent = `
.reading-session-history{max-width:980px;margin:0 auto 8px}
.reading-session-row{padding:12px 0;border-top:1px solid var(--background-modifier-border)}
.reading-session-row:first-of-type{border-top:0;padding-top:0}
.reading-session-meta{color:var(--text-muted);font-size:0.78em;display:flex;gap:8px;flex-wrap:wrap;margin-top:4px}
.reading-session-detail{font-size:0.86em;line-height:1.45;margin-top:5px;overflow-wrap:anywhere}
.reading-session-delta{margin-top:6px;padding:8px 10px;border-left:2px solid var(--text-accent);background:var(--background-primary);border-radius:0 6px 6px 0;font-size:0.86em;line-height:1.45}
`;
    const wrap = container.createEl("div", { attr: { class: "reading-session-history" } });

    const btn = (parent, text, options) => {
      if (root.ProdigyUI) return root.ProdigyUI.button(parent, text, options);
      const el = parent.createEl("button", {
        text,
        attr: {
          type: "button",
          class: [
            "prodigy-btn",
            options && options.primary ? "prodigy-btn-primary" : "",
            options && options.danger ? "prodigy-btn-danger" : ""
          ].filter(Boolean).join(" ")
        }
      });
      if (options && options.onClick) el.onclick = options.onClick;
      return el;
    };

    const refresh = () => renderSessionHistory(app, container);

    let sessions = [];
    let candidates = [];
    try {
      sessions = await root.ReadingStore.listSessions(app, 10);
      candidates = await root.ReadingStore.listCandidates(app, { status: "active" });
    } catch (error) {
      empty(wrap, `세션 기록을 불러오지 못했습니다: ${error.message || error}`);
      return;
    }

    // Recent sessions — thinking delta is shown inline, not as a separate system.
    const sessionCard = section(wrap, "최근 세션");
    if (!sessions.length) {
      empty(sessionCard, "아직 기록된 세션이 없습니다. 위 「읽는 중」에서 오늘 읽기를 남기면 여기에 쌓입니다.");
    } else {
      sessions.forEach((session) => {
        const row = sessionCard.createEl("div", { attr: { class: "reading-session-row" } });
        row.createEl("strong", { text: `${session.date || "날짜 없음"} · ${session.book_title || "책"}` });
        const meta = row.createEl("div", { attr: { class: "reading-session-meta" } });
        meta.createEl("span", { text: session.reading_range || "진행 기록 없음" });
        if (session.duration) meta.createEl("span", { text: String(session.duration) });
        if (session.key_content) {
          row.createEl("div", {
            text: session.key_content.slice(0, 160),
            attr: { class: "reading-session-detail" }
          });
        }
        if (session.my_thought) {
          row.createEl("div", {
            text: `생각: ${String(session.my_thought).slice(0, 160)}`,
            attr: { class: "reading-session-detail", style: "color:var(--text-muted);" }
          });
        }
        if (session.thinking_delta) {
          const delta = row.createEl("div", { attr: { class: "reading-session-delta" } });
          delta.createEl("div", {
            text: "생각의 변화",
            attr: { style: "font-size:0.72em;font-weight:700;color:var(--text-accent);margin-bottom:3px;" }
          });
          delta.createEl("div", { text: session.thinking_delta });
        }
        const actions = row.createEl("div", { attr: { class: "reading-loop-actions", style: "margin-top:8px;" } });
        btn(actions, "세션 열기", { onClick: () => openPath(app, session.path) });
        btn(actions, "지식 후보 만들기", {
          primary: true,
          onClick: () => openCandidateModal(app, session, refresh)
        });
      });
    }

    // Candidates are a compact reading projection. The shared Inbox owns review,
    // approval, rejection, and any Knowledge creation.
    const candidateCard = section(wrap, "지식 후보");
    if (!candidates.length) {
      empty(candidateCard, "아직 지식 후보가 없습니다. 세션에서 만들 수 있습니다.");
    } else {
      candidates.forEach((candidate) => {
        const projected = projectReadingCandidate(candidate);
        const row = candidateCard.createEl("div", { attr: { class: "reading-session-row" } });
        const titleRow = row.createEl("div", { attr: { style: "display:flex;gap:8px;align-items:center;flex-wrap:wrap;" } });
        titleRow.createEl("strong", { text: projected.title });
        titleRow.createEl("span", {
          text: projected.status_label,
          attr: { style: "font-size:0.72em;font-weight:700;color:var(--text-muted);background:var(--background-modifier-hover);padding:1px 6px;border-radius:999px;" }
        });
        row.createEl("div", { text: projected.statement, attr: { class: "reading-session-detail" } });
        const meta = row.createEl("div", { attr: { class: "reading-session-meta" } });
        meta.createEl("span", { text: projected.source_session ? `출처 세션: ${projected.source_session}` : "출처 세션을 확인할 수 없습니다." });
        meta.createEl("span", { text: `근거 품질: ${projected.quality.label}` });
        meta.createEl("span", { text: String(candidate.created || "").slice(0, 10) });
        const actions = row.createEl("div", { attr: { class: "reading-loop-actions", style: "margin-top:8px;" } });
        if (projected.source_session) {
          btn(actions, "세션 열기", {
            onClick: () => {
              const link = projected.source_session.replace(/^\[\[|\]\]$/g, "");
              openPath(app, link);
            }
          });
        }
        btn(actions, "Knowledge Explorer에서 검토", { primary: true, onClick: () => openKnowledgeExplorer(app) });
      });
    }
  }

  // Backward-compatible alias (old call sites / tests)
  const renderLearningLoop = renderSessionHistory;

  /**
   * Manual registration modal — zero network calls.
   * Converges on ReadingBookCreate.createManualReadingObject (single writer).
   */
  function openManualRegistrationModal(app, onCreated) {
    const obsidianModule = root.obsidian || window.obsidian;
    const formats = (root.ReadingBookCreate && root.ReadingBookCreate.READING_FORMATS) || ["book", "ebook", "paper", "document", "audiobook", "미분류"];
    const state = {
      title: "",
      author: "",
      reading_format: "book",
      identifier: "",
      publisher: "",
      publish_date: "",
      source_url: "",
      cover_url: "",
      category: "",
      language: "",
      connections: ""
    };

    if (!obsidianModule || !obsidianModule.Modal) {
      // Fallback: prompt-based
      const title = typeof window.prompt === "function" ? window.prompt("책 제목") : null;
      if (!title) return null;
      state.title = title;
      return root.ReadingBookCreate.createManualReadingObject(app, state).then(async (result) => {
        if (window.Notice) new Notice(`${result.title} 독서 기록을 만들었습니다.`);
        if (onCreated) await onCreated(result);
        return result;
      });
    }

    class ManualRegistrationModal extends obsidianModule.Modal {
      constructor(appInstance) {
        super(appInstance);
        this.state = { ...state };
      }
      onOpen() {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.addClass("reading-manual-registration-modal");
        contentEl.createEl("h3", { text: "수동 등록", attr: { style: "margin:0 0 6px;" } });
        contentEl.createEl("p", {
          text: "네트워크 없이 직접 정보를 입력하여 독서 기록을 만듭니다.",
          attr: { style: "color:var(--text-muted);font-size:0.84em;margin:0 0 12px;" }
        });

        const addField = (label, key, options = {}) => {
          fieldInput(contentEl, label, key, this.state, options);
        };

        addField("제목 *", "title", { placeholder: "책/자료 제목" });
        addField("저자", "author", { placeholder: "저자명" });

        // Format select
        contentEl.createEl("label", {
          text: "형식",
          attr: { style: "display:block;font-weight:600;margin:10px 0 4px;font-size:0.86em;" }
        });
        const select = contentEl.createEl("select", {
          attr: { style: "width:100%;padding:8px;border-radius:6px;border:1px solid var(--background-modifier-border);background:var(--background-primary);color:var(--text-normal);min-height:40px;box-sizing:border-box;" }
        });
        formats.forEach((fmt) => {
          const opt = select.createEl("option", { text: fmt, value: fmt });
          if (fmt === this.state.reading_format) opt.selected = true;
        });
        select.onchange = () => { this.state.reading_format = select.value; };

        addField("식별자 (ISBN/DOI 등)", "identifier", { placeholder: "예: 978-89-01-23456-7" });
        addField("출판사", "publisher", { placeholder: "출판사명" });
        addField("출판일", "publish_date", { placeholder: "YYYY-MM-DD" });
        addField("출처 URL", "source_url", { placeholder: "https://..." });
        addField("표지 URL", "cover_url", { placeholder: "https://..." });
        addField("카테고리", "category", { placeholder: "분류" });
        addField("연결", "connections", { placeholder: "[[연결 Object]]" });

        const errorEl = contentEl.createEl("p", {
          attr: { style: "color:var(--text-error);font-size:0.82em;margin:8px 0 0;display:none;" }
        });

        const actions = contentEl.createEl("div", {
          attr: { style: "display:flex;gap:8px;justify-content:flex-end;margin-top:14px;flex-wrap:wrap;" }
        });
        if (root.ProdigyUI) root.ProdigyUI.ensureStyles();
        const cancel = root.ProdigyUI
          ? root.ProdigyUI.button(actions, "취소", { onClick: () => this.close() })
          : actions.createEl("button", { text: "취소", attr: { type: "button", class: "prodigy-btn" } });
        if (!root.ProdigyUI) cancel.onclick = () => this.close();
        const save = root.ProdigyUI
          ? root.ProdigyUI.button(actions, "등록", { primary: true })
          : actions.createEl("button", { text: "등록", attr: { type: "button", class: "prodigy-btn prodigy-btn-primary" } });
        save.onclick = async () => {
          save.disabled = true;
          errorEl.style.display = "none";
          try {
            const result = await root.ReadingBookCreate.createManualReadingObject(app, this.state);
            if (window.Notice) new Notice(`${result.title} 독서 기록을 만들었습니다.`);
            this.close();
            if (onCreated) await onCreated(result);
          } catch (error) {
            save.disabled = false;
            errorEl.setText(error.message || String(error));
            errorEl.style.display = "block";
          }
        };
      }
      onClose() { this.contentEl.empty(); }
    }

    new ManualRegistrationModal(app).open();
  }

  const api = {
    layoutForWidth,
    renderResponsiveWorkspace,
    mountResponsiveWorkspace,
    openSessionModal,
    openQuickSession,
    saveQuickSession,
    openCandidateModal,
    openManualRegistrationModal,
    renderSessionHistory,
    renderLearningLoop,
    openPath,
    openKnowledgeExplorer,
    projectReadingCandidate
  };
  root.ReadingView = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
