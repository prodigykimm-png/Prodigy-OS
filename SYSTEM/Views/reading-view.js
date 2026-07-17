(function (root) {
  "use strict";

  function openPath(app, path) {
    if (!path) return;
    return app.workspace.openLinkText(String(path).replace(/\.md$/, ""), "", false);
  }

  function fieldInput(parent, label, key, state, options = {}) {
    parent.createEl("label", {
      text: label,
      attr: { style: "display:block;font-weight:600;margin:10px 0 4px;font-size:0.86em;" }
    });
    const isArea = options.rows && options.rows > 1;
    const input = parent.createEl(isArea ? "textarea" : "input", {
      attr: {
        type: isArea ? undefined : "text",
        rows: isArea ? String(options.rows) : undefined,
        style: "width:100%;padding:8px;border-radius:6px;border:1px solid var(--background-modifier-border);background:var(--background-primary);color:var(--text-normal);min-height:" + (isArea ? "72px" : "40px") + ";box-sizing:border-box;"
      }
    });
    input.value = state[key] || "";
    input.oninput = () => { state[key] = input.value; };
    return input;
  }

  function openSessionModal(app, book, onSaved) {
    const obsidianModule = root.obsidian || window.obsidian;
    const initial = {
      date: root.ReadingCore.todayIsoDate(),
      reading_range: "",
      start_page: "",
      end_page: "",
      duration: "",
      key_content: "",
      my_thought: "",
      thinking_delta: "",
      next_position: "",
      next_action: ""
    };

    if (!obsidianModule || !obsidianModule.Modal) {
      initial.reading_range = window.prompt("읽은 범위", "") || "";
      initial.key_content = window.prompt("핵심 내용", "") || "";
      initial.my_thought = window.prompt("내 생각", "") || "";
      onSaved(initial);
      return;
    }

    class SessionModal extends obsidianModule.Modal {
      constructor(appInstance) {
        super(appInstance);
        this.state = { ...initial };
      }
      onOpen() {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.createEl("h3", { text: `오늘 읽기 — ${book.book_title || book.title || "책"}` });
        contentEl.createEl("p", {
          text: "한 화면에서 세션을 기록합니다. 생각의 변화와 다음 행동은 선택입니다.",
          attr: { style: "color:var(--text-muted);font-size:0.84em;margin:0 0 8px;" }
        });
        fieldInput(contentEl, "읽은 범위", "reading_range", this.state);
        fieldInput(contentEl, "시작 페이지", "start_page", this.state);
        fieldInput(contentEl, "종료 페이지", "end_page", this.state);
        fieldInput(contentEl, "독서 시간 (선택, 예: 32m)", "duration", this.state);
        fieldInput(contentEl, "핵심 내용", "key_content", this.state, { rows: 3 });
        fieldInput(contentEl, "내 생각", "my_thought", this.state, { rows: 3 });
        fieldInput(contentEl, "생각의 변화", "thinking_delta", this.state, { rows: 3 });
        fieldInput(contentEl, "다음 읽을 위치", "next_position", this.state);
        fieldInput(contentEl, "다음 행동", "next_action", this.state);

        const actions = contentEl.createEl("div", {
          attr: { style: "display:flex;gap:8px;justify-content:flex-end;margin-top:14px;flex-wrap:wrap;" }
        });
        if (root.ProdigyUI) root.ProdigyUI.ensureStyles();
        const cancel = root.ProdigyUI
          ? root.ProdigyUI.button(actions, "취소", { onClick: () => this.close() })
          : actions.createEl("button", { text: "취소", attr: { type: "button", class: "prodigy-btn" } });
        if (!root.ProdigyUI) cancel.onclick = () => this.close();
        const save = root.ProdigyUI
          ? root.ProdigyUI.button(actions, "세션 저장", { primary: true })
          : actions.createEl("button", { text: "세션 저장", attr: { type: "button", class: "prodigy-btn prodigy-btn-primary" } });
        save.onclick = async () => {
          save.disabled = true;
          try {
            const session = await root.ReadingStore.saveSession(app, book, this.state);
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
      state.title = window.prompt("후보 제목", state.title) || state.title;
      state.statement = window.prompt("지식 문장", state.statement) || state.statement;
      state.reason = window.prompt("중요한 이유", "") || "";
      onSaved(state);
      return;
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
        meta.createEl("span", { text: session.reading_range || `${session.start_page || "?"}–${session.end_page || "?"}` });
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

    // Candidates stay as a short follow-up list from sessions.
    const candidateCard = section(wrap, "지식 후보");
    if (!candidates.length) {
      empty(candidateCard, "아직 지식 후보가 없습니다. 세션에서 만들 수 있습니다.");
    } else {
      candidates.forEach((candidate) => {
        const row = candidateCard.createEl("div", { attr: { class: "reading-session-row" } });
        const titleRow = row.createEl("div", { attr: { style: "display:flex;gap:8px;align-items:center;flex-wrap:wrap;" } });
        titleRow.createEl("strong", { text: candidate.title || "제목 없음" });
        const statusLabel = candidate.status === "saved" ? "보관" : "제안";
        titleRow.createEl("span", {
          text: statusLabel,
          attr: { style: "font-size:0.72em;font-weight:700;color:var(--text-muted);background:var(--background-modifier-hover);padding:1px 6px;border-radius:999px;" }
        });
        row.createEl("div", { text: candidate.statement || "", attr: { class: "reading-session-detail" } });
        const meta = row.createEl("div", { attr: { class: "reading-session-meta" } });
        meta.createEl("span", { text: candidate.source_book || "" });
        meta.createEl("span", { text: String(candidate.created || "").slice(0, 10) });
        const actions = row.createEl("div", { attr: { class: "reading-loop-actions", style: "margin-top:8px;" } });
        if (candidate.source_session) {
          btn(actions, "세션 열기", {
            onClick: () => {
              const link = String(candidate.source_session).replace(/^\[\[|\]\]$/g, "");
              openPath(app, link);
            }
          });
        }
        if (candidate.status !== "saved") {
          btn(actions, "보관", {
            primary: true,
            onClick: async () => {
              try {
                await root.ReadingStore.saveCandidateAsKept(app, candidate.path);
                if (window.Notice) new Notice("지식 후보를 보관했습니다.");
                await refresh();
              } catch (error) {
                if (window.Notice) new Notice(error.message || String(error));
              }
            }
          });
        }
        btn(actions, "거절", {
          danger: true,
          onClick: async () => {
            try {
              await root.ReadingStore.rejectCandidate(app, candidate.path);
              if (window.Notice) new Notice("지식 후보를 거절했습니다.");
              await refresh();
            } catch (error) {
              if (window.Notice) new Notice(error.message || String(error));
            }
          }
        });
      });
    }
  }

  // Backward-compatible alias (old call sites / tests)
  const renderLearningLoop = renderSessionHistory;

  const api = {
    openSessionModal,
    openCandidateModal,
    renderSessionHistory,
    renderLearningLoop,
    openPath
  };
  root.ReadingView = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
