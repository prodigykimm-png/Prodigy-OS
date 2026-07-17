(function (root) {
  "use strict";

  /**
   * Reading Workspace view — daily Thinking workflow.
   * Order: Today → Continue → Session → Quick Reflection → Waiting Review → Finished.
   * Reuses ReadingWorkspaceCore model; no engine/schema changes.
   */

  const STYLE_ID = "prodigy-reading-ws-styles";

  const CSS = `
.reading-ws-root{display:flex;flex-direction:column;gap:12px;max-width:920px;margin:0 auto 8px;}
.reading-ws-section{
  margin:0;padding:14px 14px;border-radius:12px;
  border:1px solid var(--background-modifier-border);background:var(--background-secondary);
}
.reading-ws-title{font-weight:800;font-size:0.9em;color:var(--text-accent);margin-bottom:10px;letter-spacing:0.01em;}
.reading-ws-empty{color:var(--text-muted);font-style:italic;font-size:0.9em;line-height:1.45;padding:4px 0;}
.reading-ws-book{font-weight:800;font-size:1.05em;color:var(--text-normal);overflow-wrap:anywhere;line-height:1.35;}
.reading-ws-meta{font-size:0.84em;color:var(--text-muted);margin-top:4px;line-height:1.45;overflow-wrap:anywhere;}
.reading-ws-meta strong{color:var(--text-normal);font-weight:650;}
.reading-ws-reason{margin-top:8px;font-size:0.78em;color:var(--text-muted);line-height:1.4;}
.reading-ws-reason b{font-weight:700;color:var(--text-faint);margin-right:6px;}
.reading-ws-actions{display:flex;flex-wrap:wrap;gap:8px;margin-top:12px;}
.reading-ws-actions button,
.reading-ws-root .prodigy-btn{
  min-height:44px !important;padding:8px 14px !important;font-size:0.88em !important;
  border-radius:8px !important;font-weight:700 !important;cursor:pointer;
}
.reading-ws-start{
  width:100%;min-height:52px !important;font-size:1em !important;font-weight:800 !important;
  margin-top:12px;
}
.reading-ws-list{display:flex;flex-direction:column;gap:0;}
.reading-ws-row{
  display:flex;flex-direction:column;gap:4px;padding:12px 0;
  border-top:1px solid var(--background-modifier-border);
}
.reading-ws-row:first-child{border-top:0;padding-top:2px;}
.reading-ws-row-actions{display:flex;flex-wrap:wrap;gap:8px;margin-top:8px;}
.reading-ws-prompts{margin:0 0 4px 1.1em;padding:0;font-size:0.9em;line-height:1.55;}
.reading-ws-prompts li{margin:4px 0;}
.reading-ws-primary{border-left:4px solid var(--text-accent);}
@media (max-width:520px){
  .reading-ws-section{padding:12px;}
  .reading-ws-actions button,.reading-ws-root .prodigy-btn{width:100%;}
  .reading-ws-start{min-height:54px !important;}
}
`;

  function ensureStyles() {
    if (typeof document === "undefined") return;
    let el = document.getElementById(STYLE_ID);
    if (!el) {
      el = document.createElement("style");
      el.id = STYLE_ID;
      document.head.appendChild(el);
    }
    el.textContent = CSS;
  }

  function coreApi() {
    return root.ReadingWorkspaceCore || null;
  }

  function labels() {
    const core = coreApi();
    return (core && core.LABELS) || {
      today: "Today's Reading",
      continue: "Continue Reading",
      session: "Reading Session",
      guide: "독서 질답",
      checklist: "독서 체크리스트",
      reflection: "Quick Reflection",
      review: "Waiting Review",
      knowledge: "지식 후보",
      history: "Finished Recently",
      reason: "이유",
      progress: "진행",
      continueAction: "Continue Reading",
      startReading: "Start Reading",
      openReview: "Open Review",
      strategy: "전략",
      strategyUnknown: "일반 독서",
      reflectionHint: "1분 이내 · 유용한 생각 하나",
      checklistHint: "읽는 중 확인 · 자동 완료 없음",
      guideHint: "읽기 전 · 주의할 점",
      untitled: "제목 없음",
      candidate: "후보",
      chapter: "Chapter",
      goal: "Goal",
      estimated: "Est.",
      lastOpened: "Last opened",
      nextAction: "다음"
    };
  }

  function emptyLine(container, text) {
    container.createEl("div", {
      text: text || "",
      attr: { class: "reading-ws-empty" }
    });
  }

  function reasonLine(container, reason) {
    if (!reason) return;
    const L = labels();
    const row = container.createEl("div", { attr: { class: "reading-ws-reason" } });
    row.createEl("b", { text: L.reason });
    row.createEl("span", { text: reason });
  }

  function strategyLine(container, section) {
    const L = labels();
    const label = (section && (section.strategy_label || section.strategy)) || L.strategyUnknown;
    container.createEl("div", {
      text: `${L.strategy} · ${label}`,
      attr: { style: "font-size:0.8em;font-weight:650;color:var(--text-muted);margin-bottom:6px;" }
    });
  }

  function sectionBox(container, title, options) {
    const opts = options || {};
    const box = container.createEl("div", {
      attr: {
        class: "reading-ws-section" + (opts.primary ? " reading-ws-primary" : "")
      }
    });
    if (title) {
      box.createEl("div", {
        text: title,
        attr: { class: "reading-ws-title" }
      });
    }
    return box;
  }

  function openPath(app, path) {
    if (!app || !path) return;
    try {
      app.workspace.openLinkText(path, "", false);
    } catch (_e) {
      /* ignore */
    }
  }

  function makeButton(parent, text, options) {
    const opts = options || {};
    if (root.ProdigyUI && root.ProdigyUI.button) {
      return root.ProdigyUI.button(parent, text, {
        primary: !!opts.primary,
        onClick: opts.onClick
      });
    }
    const btn = parent.createEl("button", {
      text,
      attr: {
        type: "button",
        class: opts.primary ? "prodigy-btn prodigy-btn-primary" : "prodigy-btn"
      }
    });
    if (opts.onClick) btn.onclick = opts.onClick;
    return btn;
  }

  function startSessionFor(options, payload) {
    const opts = options || {};
    const app = opts.app;
    const path = payload && (payload.object_path || payload.path);
    if (!path) return;
    if (typeof opts.onStartSession === "function") {
      opts.onStartSession(payload);
      return;
    }
    // Fallback: open book note
    openPath(app, path);
  }

  function renderToday(container, today, options) {
    const L = labels();
    const box = sectionBox(container, L.today, { primary: true });
    if (!today || today.empty) {
      emptyLine(box, (today && today.message) || (coreApi() && coreApi().EMPTY.today) || "다음 책을 고르세요.");
      return box;
    }
    const obj = today.object || {};
    box.createEl("div", {
      text: obj.title || L.untitled,
      attr: { class: "reading-ws-book" }
    });
    if (obj.author) {
      box.createEl("div", { text: obj.author, attr: { class: "reading-ws-meta" } });
    }
    const bits = [];
    if (obj.chapter || obj.next_action) bits.push(`${L.chapter} · ${obj.chapter || obj.next_action}`);
    if (obj.goal && obj.goal !== obj.chapter) bits.push(`${L.goal} · ${obj.goal}`);
    if (obj.estimated) bits.push(`${L.estimated} · ${obj.estimated}`);
    if (obj.progress) bits.push(`${L.progress} ${obj.progress}`);
    bits.forEach((line) => {
      box.createEl("div", { text: line, attr: { class: "reading-ws-meta" } });
    });
    reasonLine(box, today.reason);
    const actions = box.createEl("div", { attr: { class: "reading-ws-actions" } });
    makeButton(actions, obj.continue_action || L.continueAction, {
      primary: true,
      onClick: () => {
        startSessionFor(options, {
          object_path: obj.path,
          path: obj.path,
          title: obj.title,
          next_action: obj.next_action,
          progress: obj.progress
        });
      }
    });
    return box;
  }

  function renderContinue(container, cont, options) {
    const L = labels();
    const box = sectionBox(container, L.continue);
    // Prefer multi-book continue_list when present
    const list = cont && cont.items ? cont : null;
    const single = cont && cont.continue_target !== undefined ? cont : null;

    if (list && Array.isArray(list.items)) {
      if (list.empty || !list.items.length) {
        emptyLine(box, list.message || "다음 책을 고르세요.");
        return box;
      }
      const wrap = box.createEl("div", { attr: { class: "reading-ws-list" } });
      list.items.slice(0, 3).forEach((item) => {
        const row = wrap.createEl("div", { attr: { class: "reading-ws-row" } });
        row.createEl("div", {
          text: item.title || L.untitled,
          attr: { class: "reading-ws-book", style: "font-size:0.98em;" }
        });
        if (item.chapter || item.next_action) {
          row.createEl("div", {
            text: `${L.chapter} · ${item.chapter || item.next_action}`,
            attr: { class: "reading-ws-meta" }
          });
        }
        const metaBits = [];
        if (item.last_session || item.last_opened) {
          metaBits.push(`${L.lastOpened} · ${item.last_session || item.last_opened}`);
        }
        if (item.progress) metaBits.push(`${L.progress} ${item.progress}`);
        if (metaBits.length) {
          row.createEl("div", {
            text: metaBits.join(" · "),
            attr: { class: "reading-ws-meta" }
          });
        }
        const actions = row.createEl("div", { attr: { class: "reading-ws-row-actions" } });
        makeButton(actions, L.continueAction, {
          primary: true,
          onClick: () => {
            startSessionFor(options, {
              object_path: item.path,
              path: item.path,
              title: item.title,
              next_action: item.next_action,
              progress: item.progress_number != null ? item.progress_number : item.progress
            });
          }
        });
      });
      return box;
    }

    // Single continue_target card (legacy)
    if (!single || single.empty) {
      emptyLine(box, (single && single.message) || "다음 책을 고르세요.");
      return box;
    }
    box.createEl("div", {
      text: single.title || "독서",
      attr: { class: "reading-ws-book", style: "font-size:0.98em;" }
    });
    if (single.next_action) {
      box.createEl("div", {
        text: `${L.chapter} · ${single.next_action}`,
        attr: { class: "reading-ws-meta" }
      });
    }
    if (single.progress) {
      box.createEl("div", {
        text: `${L.progress} ${single.progress}`,
        attr: { class: "reading-ws-meta" }
      });
    }
    reasonLine(box, single.reason);
    const actions = box.createEl("div", { attr: { class: "reading-ws-actions" } });
    makeButton(actions, L.continueAction, {
      primary: true,
      onClick: () => {
        startSessionFor(options, {
          object_path: single.object_path || single.focus_path,
          path: single.object_path || single.focus_path,
          title: single.title,
          next_action: single.next_action,
          progress: single.progress_number != null ? single.progress_number : single.progress
        });
      }
    });
    return box;
  }

  function renderSession(container, sessionSurface, options) {
    const L = labels();
    const box = sectionBox(container, L.session, { primary: true });
    if (!sessionSurface || sessionSurface.empty) {
      emptyLine(box, (sessionSurface && sessionSurface.message) || "다음 책을 고르세요.");
      return box;
    }
    box.createEl("div", {
      text: sessionSurface.book || L.untitled,
      attr: { class: "reading-ws-book" }
    });
    if (sessionSurface.author) {
      box.createEl("div", { text: sessionSurface.author, attr: { class: "reading-ws-meta" } });
    }
    if (sessionSurface.chapter) {
      box.createEl("div", {
        text: `${L.chapter} · ${sessionSurface.chapter}`,
        attr: { class: "reading-ws-meta" }
      });
    }
    if (sessionSurface.session_goal) {
      box.createEl("div", {
        text: `${L.goal} · ${sessionSurface.session_goal}`,
        attr: { class: "reading-ws-meta" }
      });
    }
    if (sessionSurface.progress) {
      box.createEl("div", {
        text: `${L.progress} ${sessionSurface.progress}`,
        attr: { class: "reading-ws-meta" }
      });
    }
    // Large primary CTA — start immediately
    const start = box.createEl("button", {
      text: sessionSurface.primary_action || L.startReading,
      attr: {
        type: "button",
        class: "prodigy-btn prodigy-btn-primary reading-ws-start"
      }
    });
    start.onclick = () => {
      startSessionFor(options, {
        object_path: sessionSurface.object_path,
        path: sessionSurface.object_path,
        title: sessionSurface.book,
        next_action: sessionSurface.next_action || sessionSurface.session_goal,
        progress: sessionSurface.progress
      });
    };
    return box;
  }

  function renderGuide(container, guide, options) {
    const L = labels();
    const box = sectionBox(container, L.guide);
    if (!guide || guide.empty) {
      emptyLine(box, (guide && guide.message) || "다음 책을 고르세요.");
      return box;
    }
    strategyLine(box, guide);
    if (guide.purpose || L.guideHint) {
      box.createEl("div", {
        text: guide.purpose || L.guideHint,
        attr: { class: "reading-ws-meta", style: "margin-bottom:6px;" }
      });
    }
    if (guide.title) {
      box.createEl("div", {
        text: guide.title,
        attr: { style: "font-weight:700;font-size:0.9em;margin-bottom:6px;" }
      });
    }
    const list = box.createEl("ul", { attr: { class: "reading-ws-prompts" } });
    (guide.prompts || []).forEach((p) => {
      list.createEl("li", { text: p.label || p });
    });
    reasonLine(box, guide.reason);
    if (guide.open_checklist && root.ReadingChecklistView && guide.object_path) {
      const actions = box.createEl("div", { attr: { class: "reading-ws-actions" } });
      makeButton(actions, "독서 질답 열기", {
        onClick: () => {
          try {
            root.ReadingChecklistView.openForSource(options && options.app, {
              source_path: guide.object_path,
              book_title: guide.title,
              reading_strategy: guide.known ? guide.strategy : "",
              book_type: guide.known ? guide.strategy : ""
            });
          } catch (_e) {
            if (options && options.app) openPath(options.app, guide.object_path);
          }
        }
      });
    }
    return box;
  }

  function renderChecklist(container, checklist) {
    const L = labels();
    const box = sectionBox(container, L.checklist);
    if (!checklist || checklist.empty) {
      emptyLine(box, (checklist && checklist.message) || "다음 책을 고르세요.");
      return box;
    }
    strategyLine(box, checklist);
    box.createEl("div", {
      text: checklist.purpose || L.checklistHint,
      attr: { class: "reading-ws-meta", style: "margin-bottom:8px;" }
    });
    const list = box.createEl("div", {
      attr: { style: "display:flex;flex-direction:column;gap:8px;" }
    });
    (checklist.items || []).forEach((item) => {
      const row = list.createEl("label", {
        attr: {
          style: "display:flex;align-items:flex-start;gap:10px;font-size:0.9em;line-height:1.45;cursor:pointer;min-height:36px;"
        }
      });
      const input = row.createEl("input", {
        attr: {
          type: "checkbox",
          "data-checklist-id": item.id || "",
          style: "margin-top:4px;flex:0 0 auto;width:18px;height:18px;"
        }
      });
      input.checked = false;
      row.createEl("span", { text: item.label || "" });
    });
    reasonLine(box, checklist.reason);
    return box;
  }

  function renderReflection(container, reflection, options) {
    const L = labels();
    const box = sectionBox(container, L.reflection);
    if (!reflection || reflection.empty) {
      emptyLine(box, (reflection && reflection.message) || "다음 책을 고르세요.");
      return box;
    }
    box.createEl("div", {
      text: reflection.purpose || L.reflectionHint,
      attr: { class: "reading-ws-meta", style: "margin-bottom:8px;" }
    });
    const list = box.createEl("ul", { attr: { class: "reading-ws-prompts" } });
    (reflection.prompts || []).slice(0, 3).forEach((p) => {
      list.createEl("li", { text: p.label || p });
    });
    // One-tap into existing checklist reflection phase when available
    if (reflection.object_path && root.ReadingChecklistView) {
      const actions = box.createEl("div", { attr: { class: "reading-ws-actions" } });
      makeButton(actions, "1분 성찰 적기", {
        primary: true,
        onClick: () => {
          try {
            root.ReadingChecklistView.openForSource(options && options.app, {
              source_path: reflection.object_path,
              book_title: reflection.title || "",
              reading_strategy: reflection.known ? reflection.strategy : "",
              phase: "after"
            });
          } catch (_e) {
            if (options && options.app) openPath(options.app, reflection.object_path);
          }
        }
      });
    }
    reasonLine(box, reflection.reason);
    return box;
  }

  function renderWaitingReview(container, review, options) {
    const L = labels();
    const box = sectionBox(container, L.review);
    if (!review || review.empty) {
      emptyLine(box, (review && review.message) || "모두 복기했습니다.");
      return box;
    }
    (review.items || []).forEach((item) => {
      const row = box.createEl("div", { attr: { class: "reading-ws-row" } });
      row.createEl("div", {
        text: item.title || L.untitled,
        attr: { class: "reading-ws-book", style: "font-size:0.95em;" }
      });
      reasonLine(row, item.reason);
      const actions = row.createEl("div", { attr: { class: "reading-ws-row-actions" } });
      makeButton(actions, L.openReview, {
        primary: true,
        onClick: () => {
          if (typeof options.onOpenReview === "function") {
            options.onOpenReview(item);
            return;
          }
          if (item.path && options && options.app) openPath(options.app, item.path);
        }
      });
    });
    return box;
  }

  function renderKnowledgeCandidates(container, candidates) {
    const L = labels();
    const box = sectionBox(container, L.knowledge);
    if (!candidates || candidates.empty || !(candidates.items && candidates.items.length)) {
      emptyLine(box, (candidates && candidates.message) || "지식 후보가 없습니다.");
      return box;
    }
    (candidates.items || []).forEach((item) => {
      box.createEl("div", {
        text: item.title || item.statement || L.candidate,
        attr: { style: "font-size:0.88em;padding:4px 0;" }
      });
    });
    return box;
  }

  function renderHistory(container, history, options) {
    const L = labels();
    const box = sectionBox(container, L.history);
    if (!history || history.empty) {
      emptyLine(box, (history && history.message) || "독서 여정이 여기서 시작됩니다.");
      return box;
    }
    (history.items || []).forEach((item) => {
      const row = box.createEl("div", { attr: { class: "reading-ws-row" } });
      row.createEl("div", {
        text: item.title || L.untitled,
        attr: { class: "reading-ws-book", style: "font-size:0.95em;" }
      });
      if (item.finished) {
        row.createEl("div", {
          text: item.finished,
          attr: { class: "reading-ws-meta" }
        });
      }
      const actions = row.createEl("div", { attr: { class: "reading-ws-row-actions" } });
      makeButton(actions, L.openReview, {
        onClick: () => {
          if (item.path && options && options.app) openPath(options.app, item.path);
        }
      });
    });
    return box;
  }

  /**
   * Daily flow default sections.
   * Library stays in hub markdown; knowledge out of primary daily path.
   */
  function renderWorkspace(container, model, options) {
    if (!container) return null;
    ensureStyles();
    const opts = options || {};
    const m = model || {};
    const want = opts.sections ? new Set(opts.sections) : null;
    const include = (key) => !want || want.has(key);

    if (root.ProdigyUI && root.ProdigyUI.ensureStyles) root.ProdigyUI.ensureStyles();

    const rootEl = container.createEl("div", { attr: { class: "reading-ws-root" } });

    if (include("today")) renderToday(rootEl, m.today, opts);
    if (include("continue")) {
      // Prefer continue_list (max 3); fall back to single continue_reading
      const contPayload = m.continue_list && !m.continue_list.empty
        ? m.continue_list
        : m.continue_reading;
      renderContinue(rootEl, contPayload, opts);
    }
    if (include("session")) renderSession(rootEl, m.session_surface, opts);
    // Guide/checklist available when requested (not default daily wall)
    if (include("guide")) renderGuide(rootEl, m.reading_guide, opts);
    if (include("checklist")) renderChecklist(rootEl, m.reading_checklist);
    if (include("reflection")) renderReflection(rootEl, m.reflection, opts);
    if (include("review")) renderWaitingReview(rootEl, m.waiting_review, opts);
    if (include("knowledge")) renderKnowledgeCandidates(rootEl, m.knowledge_candidates);
    if (include("history") || include("finished")) {
      renderHistory(rootEl, m.finished_recently || m.history, opts);
    }

    return rootEl;
  }

  function renderFromPages(container, pages, options) {
    const core = coreApi();
    if (!core) {
      emptyLine(container, "독서 워크스페이스 모듈을 불러오지 못했습니다.");
      return null;
    }
    const model = core.buildWorkspaceModel(pages, options || {});
    renderWorkspace(container, model, options || {});
    return model;
  }

  const api = {
    renderWorkspace,
    renderFromPages,
    renderToday,
    renderContinue,
    renderSession,
    renderGuide,
    renderChecklist,
    renderReflection,
    renderWaitingReview,
    renderKnowledgeCandidates,
    renderHistory,
    ensureStyles
  };

  root.ReadingWorkspaceView = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
