(function (root) {
  "use strict";

  /**
   * Reading Workspace view — progressive Thinking Decision sections.
   * Strategy Layer: Guide (before) · Checklist (during) · Reflection (after).
   * UI labels are Korean (display contract).
   */

  function coreApi() {
    return root.ReadingWorkspaceCore || null;
  }

  function labels() {
    const core = coreApi();
    return (core && core.LABELS) || {
      today: "오늘의 독서",
      continue: "이어 읽기",
      guide: "독서 질답",
      checklist: "독서 체크리스트",
      reflection: "성찰",
      review: "복기 대기",
      knowledge: "지식 후보",
      history: "기록",
      reason: "이유",
      progress: "진행",
      continueAction: "이어 읽기",
      strategy: "전략",
      strategyUnknown: "일반 독서",
      reflectionHint: "사용자 작성 · 최대 3개 질문",
      checklistHint: "읽는 중 확인 · 자동 완료 없음",
      guideHint: "읽기 전 · 주의할 점",
      untitled: "제목 없음",
      candidate: "후보"
    };
  }

  function emptyLine(container, text) {
    container.createEl("div", {
      text: text || "",
      attr: {
        style: "color:var(--text-muted);font-style:italic;font-size:0.88em;padding:4px 0;"
      }
    });
  }

  function reasonLine(container, reason) {
    if (!reason) return;
    const L = labels();
    const row = container.createEl("div", {
      attr: { style: "margin-top:6px;font-size:0.78em;color:var(--text-muted);line-height:1.4;" }
    });
    row.createEl("span", {
      text: L.reason,
      attr: { style: "font-weight:700;margin-right:6px;color:var(--text-faint);" }
    });
    row.createEl("span", { text: reason });
  }

  /** Always show which strategy generated prompts. */
  function strategyLine(container, section) {
    const L = labels();
    const label = (section && (section.strategy_label || section.strategy))
      || L.strategyUnknown;
    container.createEl("div", {
      text: `${L.strategy} · ${label}`,
      attr: { style: "font-size:0.8em;font-weight:650;color:var(--text-muted);margin-bottom:6px;" }
    });
  }

  function sectionBox(container, title) {
    const box = container.createEl("div", {
      attr: {
        class: "reading-ws-section",
        style: "margin:0 0 12px;padding:12px 14px;border-radius:10px;border:1px solid var(--background-modifier-border);background:var(--background-secondary);"
      }
    });
    if (title) {
      box.createEl("div", {
        text: title,
        attr: { style: "font-weight:800;font-size:0.88em;color:var(--text-accent);margin-bottom:8px;" }
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

  function renderToday(container, today, options) {
    const L = labels();
    const box = sectionBox(container, L.today);
    if (!today || today.empty) {
      emptyLine(box, (today && today.message) || (coreApi() && coreApi().EMPTY.today) || "진행 중인 독서가 없습니다.");
      return box;
    }
    const obj = today.object || {};
    box.createEl("div", {
      text: obj.title || L.untitled,
      attr: { style: "font-weight:700;font-size:1em;" }
    });
    if (obj.author) {
      box.createEl("div", {
        text: obj.author,
        attr: { style: "font-size:0.85em;color:var(--text-muted);margin-top:2px;" }
      });
    }
    if (obj.progress) {
      box.createEl("div", {
        text: `${L.progress} ${obj.progress}`,
        attr: { style: "font-size:0.82em;color:var(--text-muted);margin-top:4px;" }
      });
    }
    reasonLine(box, today.reason);
    const actions = box.createEl("div", {
      attr: { class: "prodigy-btn-row", style: "margin-top:10px;" }
    });
    makeButton(actions, obj.continue_action || L.continueAction, {
      primary: true,
      onClick: () => {
        if (obj.path && options && options.app) openPath(options.app, obj.path);
      }
    });
    return box;
  }

  function renderContinue(container, cont, options) {
    const L = labels();
    const box = sectionBox(container, L.continue);
    if (!cont || cont.empty) {
      emptyLine(box, (cont && cont.message) || "진행 중인 독서가 없습니다.");
      return box;
    }
    box.createEl("div", {
      text: cont.title || "독서",
      attr: { style: "font-weight:700;font-size:0.95em;" }
    });
    box.createEl("div", {
      text: cont.action || L.continueAction,
      attr: { style: "font-size:0.86em;color:var(--text-muted);margin-top:2px;" }
    });
    reasonLine(box, cont.reason);
    const actions = box.createEl("div", {
      attr: { class: "prodigy-btn-row", style: "margin-top:10px;" }
    });
    makeButton(actions, L.continueAction, {
      primary: true,
      onClick: () => {
        const path = cont.object_path || cont.dashboard_path;
        if (path && options && options.app) openPath(options.app, path);
      }
    });
    return box;
  }

  function renderGuide(container, guide, options) {
    const L = labels();
    const box = sectionBox(container, L.guide);
    if (!guide || guide.empty) {
      emptyLine(box, (guide && guide.message) || "진행 중인 독서가 없습니다.");
      return box;
    }
    strategyLine(box, guide);
    if (guide.purpose || L.guideHint) {
      box.createEl("div", {
        text: guide.purpose || L.guideHint,
        attr: { style: "font-size:0.78em;color:var(--text-muted);margin-bottom:6px;" }
      });
    }
    if (guide.title) {
      box.createEl("div", {
        text: guide.title,
        attr: { style: "font-weight:700;font-size:0.9em;margin-bottom:6px;" }
      });
    }
    const list = box.createEl("ul", {
      attr: { style: "margin:0 0 8px 1.1em;padding:0;font-size:0.88em;line-height:1.55;" }
    });
    (guide.prompts || []).forEach((p) => {
      list.createEl("li", { text: p.label || p });
    });
    reasonLine(box, guide.reason);
    if (guide.open_checklist && root.ReadingChecklistView && guide.object_path) {
      const actions = box.createEl("div", {
        attr: { class: "prodigy-btn-row", style: "margin-top:10px;" }
      });
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

  /**
   * During-reading checklist. Checkable in UI only — no auto-complete, no persistence required this sprint.
   */
  function renderChecklist(container, checklist) {
    const L = labels();
    const box = sectionBox(container, L.checklist);
    if (!checklist || checklist.empty) {
      emptyLine(box, (checklist && checklist.message) || "진행 중인 독서가 없습니다.");
      return box;
    }
    strategyLine(box, checklist);
    box.createEl("div", {
      text: checklist.purpose || L.checklistHint,
      attr: { style: "font-size:0.78em;color:var(--text-muted);margin-bottom:8px;" }
    });

    const list = box.createEl("div", {
      attr: {
        class: "reading-ws-checklist",
        style: "display:flex;flex-direction:column;gap:6px;"
      }
    });

    (checklist.items || []).forEach((item) => {
      const row = list.createEl("label", {
        attr: {
          style: "display:flex;align-items:flex-start;gap:8px;font-size:0.88em;line-height:1.45;cursor:pointer;"
        }
      });
      const input = row.createEl("input", {
        attr: {
          type: "checkbox",
          "data-checklist-id": item.id || "",
          style: "margin-top:3px;flex:0 0 auto;"
        }
      });
      // Display only — user may toggle; never auto-checked; no AI judgement
      input.checked = false;
      row.createEl("span", { text: item.label || "" });
    });

    reasonLine(box, checklist.reason);
    return box;
  }

  function renderReflection(container, reflection) {
    const L = labels();
    const box = sectionBox(container, L.reflection);
    if (!reflection || reflection.empty) {
      emptyLine(box, (reflection && reflection.message) || "진행 중인 독서가 없습니다.");
      return box;
    }
    strategyLine(box, reflection);
    box.createEl("div", {
      text: reflection.purpose || L.reflectionHint,
      attr: { style: "font-size:0.78em;color:var(--text-muted);margin-bottom:6px;" }
    });
    const list = box.createEl("ul", {
      attr: { style: "margin:0 0 6px 1.1em;padding:0;font-size:0.88em;line-height:1.55;" }
    });
    (reflection.prompts || []).slice(0, 3).forEach((p) => {
      list.createEl("li", { text: p.label || p });
    });
    reasonLine(box, reflection.reason);
    return box;
  }

  function renderWaitingReview(container, review, options) {
    const L = labels();
    const box = sectionBox(container, L.review);
    if (!review || review.empty) {
      emptyLine(box, (review && review.message) || "읽을 복기 대상이 없습니다.");
      return box;
    }
    (review.items || []).forEach((item) => {
      const row = box.createEl("div", {
        attr: {
          style: "padding:8px 0;border-bottom:1px solid var(--background-modifier-border);"
        }
      });
      const titleEl = row.createEl("div", {
        text: item.title || L.untitled,
        attr: { style: "font-weight:700;font-size:0.9em;cursor:pointer;" }
      });
      if (item.path && options && options.app) {
        titleEl.onclick = () => openPath(options.app, item.path);
      }
      reasonLine(row, item.reason);
    });
    if (review.reason) reasonLine(box, review.reason);
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
      emptyLine(box, (history && history.message) || "최근 완독 기록이 없습니다.");
      return box;
    }
    (history.items || []).forEach((item) => {
      const row = box.createEl("div", {
        attr: {
          style: "display:flex;flex-wrap:wrap;gap:6px 12px;align-items:baseline;padding:6px 0;border-bottom:1px solid var(--background-modifier-border);font-size:0.88em;"
        }
      });
      const titleEl = row.createEl("span", {
        text: item.title || L.untitled,
        attr: { style: "font-weight:650;cursor:pointer;" }
      });
      if (item.path && options && options.app) {
        titleEl.onclick = () => openPath(options.app, item.path);
      }
      if (item.author) {
        row.createEl("span", {
          text: item.author,
          attr: { style: "color:var(--text-muted);" }
        });
      }
      if (item.finished) {
        row.createEl("span", {
          text: item.finished,
          attr: { style: "color:var(--text-faint);font-size:0.9em;" }
        });
      }
    });
    return box;
  }

  function renderWorkspace(container, model, options) {
    if (!container) return null;
    const opts = options || {};
    const m = model || {};
    const want = opts.sections
      ? new Set(opts.sections)
      : null;

    const include = (key) => !want || want.has(key);

    if (root.ProdigyUI && root.ProdigyUI.ensureStyles) root.ProdigyUI.ensureStyles();

    if (include("today")) renderToday(container, m.today, opts);
    if (include("continue")) renderContinue(container, m.continue_reading, opts);
    if (include("guide")) renderGuide(container, m.reading_guide, opts);
    if (include("checklist")) renderChecklist(container, m.reading_checklist);
    if (include("reflection")) renderReflection(container, m.reflection);
    if (include("review")) renderWaitingReview(container, m.waiting_review, opts);
    if (include("knowledge")) renderKnowledgeCandidates(container, m.knowledge_candidates);
    if (include("history")) renderHistory(container, m.history, opts);

    return container;
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
    renderGuide,
    renderChecklist,
    renderReflection,
    renderWaitingReview,
    renderKnowledgeCandidates,
    renderHistory
  };

  root.ReadingWorkspaceView = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
