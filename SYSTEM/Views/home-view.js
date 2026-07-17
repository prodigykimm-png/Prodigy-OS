(function (root) {
  "use strict";

  const SOURCE_TYPE_LABELS = Object.freeze({
    auction: "경매",
    project: "프로젝트",
    reading: "독서",
    workout: "운동",
    health: "건강",
    calendar: "일정",
    review: "복기"
  });

  const EVIDENCE_SOURCE_LABELS = Object.freeze({
    "Auction Object": "경매 원본",
    "Project Object": "프로젝트 원본",
    "Reading Object": "독서 원본",
    "Workout Object": "운동 원본",
    "Daily Reflection": "최근 성찰",
    "PRE Weekly Review": "주간 복기",
    "Operation Reports": "운영 보고서",
    Todoist: "Todoist"
  });

  function getSourceTypeLabel(sourceType) {
    const registryType = sourceType === "auction" ? "auction_case" : sourceType;
    if (["auction", "project", "reading", "workout"].includes(sourceType) && root.prodigyDisplay && root.prodigyDisplay.type) {
      return root.prodigyDisplay.type(registryType);
    }
    return SOURCE_TYPE_LABELS[sourceType] || "기타";
  }

  function getEvidenceSourceLabel(source) {
    return EVIDENCE_SOURCE_LABELS[source] || source;
  }

  async function generateMorningBrief(options) {
    try {
      return await root.MorningBriefService.generateMorningResult({
        app: options.app,
        morningPackage: options.morningPackage
      });
    } catch (_error) {
      return root.MorningContextCore.generateDeterministicFallback(options.morningPackage);
    }
  }

  async function renderHome(options) {
    const { app, dv, container } = options;
    if (!app || !dv || !container) return;

    container.empty();
    container.classList.add("prodigy-home");
    const workspaceLeaf = container.closest?.(".workspace-leaf-content");
    const syncHomeWidth = () => {
      if (!workspaceLeaf || !container.style) return;
      const gutter = workspaceLeaf.clientWidth < 600 ? 16 : 64;
      const homeWidth = Math.min(1180, Math.max(280, workspaceLeaf.clientWidth - gutter));
      container.style.width = `${homeWidth}px`;
      container.style.marginLeft = `calc((100% - ${homeWidth}px) / 2)`;
      container.classList.toggle("home-wide", homeWidth >= 860);
      container.classList.toggle("home-narrow", homeWidth < 520);
    };
    syncHomeWidth();
    if (typeof ResizeObserver !== "undefined" && workspaceLeaf) {
      container.__prodigyHomeResizeObserver?.disconnect();
      container.__prodigyHomeResizeObserver = new ResizeObserver(syncHomeWidth);
      container.__prodigyHomeResizeObserver.observe(workspaceLeaf);
    }
    
    let styleEl = document.getElementById("prodigy-home-styles");
    if (!styleEl) {
      styleEl = document.createElement("style");
      styleEl.id = "prodigy-home-styles";
      document.head.appendChild(styleEl);
    }
    if (root.ProdigyUI) root.ProdigyUI.ensureStyles();
    styleEl.textContent = `
        .prodigy-home { width: 100%; margin: 0 auto; padding: 0 8px 32px; }
        .home-grid { display: grid; grid-template-columns: 1fr; gap: 16px; margin-bottom: 16px; }
        .home-column { display: flex; flex-direction: column; gap: 16px; min-width: 0; }
        .home-mc-stack { display: flex; flex-direction: column; gap: 14px; width: 100%; max-width: 920px; margin: 0 auto; }
        .home-mc-lower .home-card { border-color: var(--background-modifier-border); }
        .home-system-status { opacity: 0.92; padding: 12px 14px !important; }
        .home-quick-actions .action-btn { min-height: 36px !important; padding: 6px 12px !important; font-size: 0.82em !important; }
        .prodigy-home.home-wide .home-grid { grid-template-columns: 1fr; }
        .prodigy-home.home-wide .col-span-8 { grid-column: span 1; }
        .prodigy-home.home-wide .col-span-4 { grid-column: span 1; }
        .prodigy-home.home-wide .col-span-12 { grid-column: span 1; }
        .home-card {
          background: var(--background-secondary);
          border: 1px solid var(--background-modifier-border);
          border-radius: 8px;
          padding: 16px;
        }
        .emphasis-primary {
          background: var(--background-secondary);
          border-left: 4px solid var(--text-accent);
        }
        .emphasis-secondary {
          background: var(--background-secondary);
        }
        .emphasis-risk {
          border-left: 4px solid var(--text-error);
          background: var(--background-secondary);
        }
        .home-header {
          font-weight: 700;
          font-size: 1.05em;
          color: var(--text-normal);
          margin-bottom: 12px;
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .badge {
          display: inline-flex;
          align-items: center;
          min-height: 22px;
          font-size: 0.72em;
          padding: 2px 7px;
          border-radius: 4px;
          font-weight: 650;
          white-space: nowrap;
          flex: none;
        }
        .badge-high { background: rgba(239, 68, 68, 0.1); color: #ef4444; }
        .badge-medium { background: rgba(249, 115, 22, 0.1); color: #f97316; }
        .badge-low { background: rgba(59, 130, 246, 0.1); color: #3b82f6; }
        .badge-gray { background: var(--background-modifier-hover); color: var(--text-muted); }
        /* Home compact button baseline — all Home buttons share this density */
        .prodigy-home .action-btn,
        .prodigy-home button.action-btn,
        .prodigy-home .prodigy-launcher-actions button,
        .prodigy-home .home-launcher-mount button,
        .prodigy-home .home-card > button,
        .prodigy-home .home-card button:not([class*="workspace-row"]) {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          min-height: 0 !important;
          height: auto !important;
          font-size: 0.7em !important;
          padding: 1px 6px !important;
          border-radius: 4px !important;
          border: 1px solid var(--background-modifier-border);
          background: var(--background-primary);
          color: var(--text-normal);
          cursor: pointer;
          font-weight: 600;
          line-height: 1.15 !important;
          box-sizing: border-box;
          white-space: nowrap;
          transition: background-color 0.15s ease, border-color 0.15s ease, transform 0.15s ease;
          -webkit-appearance: none;
          appearance: none;
        }
        .prodigy-home .action-btn:hover,
        .prodigy-home .prodigy-launcher-actions button:hover,
        .prodigy-home .home-launcher-mount button:hover {
          background: var(--background-modifier-hover);
        }
        .action-btn:active,
        .prodigy-home .prodigy-launcher-actions button:active { transform: translateY(1px); }
        .action-btn:focus-visible,
        .prodigy-home .prodigy-launcher-actions button:focus-visible {
          outline: 2px solid var(--text-accent);
          outline-offset: 2px;
        }
        .prodigy-home button.action-btn-primary,
        .prodigy-home .action-btn-primary {
          background: var(--interactive-accent) !important;
          color: var(--text-on-accent) !important;
          border-color: var(--interactive-accent) !important;
        }
        .prodigy-home button.action-btn-primary:hover,
        .prodigy-home .action-btn-primary:hover {
          background: var(--interactive-accent-hover) !important;
        }
        /* Launcher CTA: compact size, accent border like other home actions */
        .prodigy-home .prodigy-launcher-actions button {
          min-width: 0 !important;
          border-color: var(--text-accent) !important;
          color: var(--text-accent) !important;
          background: var(--background-secondary) !important;
          font-weight: 700 !important;
        }
        .input-text {
          min-width: 0;
          width: auto;
          flex: 1 1 220px;
          font-size: 0.9em;
          padding: 6px 9px;
          border-radius: 6px;
          border: 1px solid var(--background-modifier-border);
          background: var(--background-primary);
          color: var(--text-normal);
        }
        .home-title-row { display: flex; justify-content: space-between; align-items: flex-end; flex-wrap: wrap; gap: 12px; margin-bottom: 16px; }
        .home-title-row h2 { margin: 0; font-size: 1.45em; }
        .home-toolbar { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
        .focus-list { display: flex; flex-direction: column; margin: 0 -2px; }
        .focus-row { display: flex; flex-direction: column; gap: 7px; padding: 14px 2px; border-top: 1px solid var(--background-modifier-border); }
        .focus-row:first-child { border-top: 0; padding-top: 2px; }
        .focus-top { display: flex; align-items: center; gap: 8px; min-width: 0; }
        .focus-title { display: flex; align-items: center; gap: 7px; min-width: 0; flex: 1 1 auto; font-weight: 700; }
        .focus-title a, .focus-title span { overflow-wrap: anywhere; }
        .focus-reason { color: var(--text-muted); font-size: 0.86em; line-height: 1.5; padding-left: 24px; }
        .focus-details { margin-left: 24px; font-size: 0.82em; color: var(--text-muted); }
        .focus-details summary { cursor: pointer; color: var(--text-accent); font-weight: 600; }
        .focus-evidence { margin-top: 7px; padding: 9px 10px; border-left: 2px solid var(--background-modifier-border); display: flex; flex-direction: column; gap: 4px; }
        .focus-actions, .focus-footer { display: flex; gap: 7px; flex-wrap: wrap; justify-content: flex-end; align-items: center; }
        .focus-actions { margin-top: 4px; }
        .focus-footer { padding-top: 12px; border-top: 1px solid var(--background-modifier-border); }
        .continue-list { display: flex; flex-direction: column; }
        .workspace-list { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 6px; }
        .continue-row, .workspace-row { display: flex; align-items: center; gap: 10px; padding: 10px 0; border-top: 1px solid var(--background-modifier-border); }
        .continue-row:first-child { border-top: 0; padding-top: 0; }
        .continue-row:last-child { padding-bottom: 0; }
        .continue-row { cursor: pointer; }
        .continue-row:hover, .workspace-row:hover { background: var(--background-modifier-hover); }
        .workspace-row {
          min-height: 40px;
          justify-content: space-between;
          padding: 8px 10px;
          border: 1px solid var(--background-modifier-border);
          border-radius: 6px;
          cursor: pointer;
        }
        .workspace-row:focus-visible { outline: 2px solid var(--text-accent); outline-offset: 2px; }
        .workspace-label { display: flex; align-items: center; gap: 8px; min-width: 0; }
        .workspace-arrow { color: var(--text-muted); font-size: 1.2em; line-height: 1; }
        .prodigy-home:not(.home-wide) .home-title-row { align-items: flex-start; }
        .prodigy-home:not(.home-wide) .home-toolbar { width: 100%; }
        .prodigy-home:not(.home-wide) .home-toolbar .action-btn { flex: 0 1 auto; }
        .prodigy-home:not(.home-wide) .focus-top { flex-wrap: wrap; }
        .prodigy-home:not(.home-wide) .focus-title { flex-basis: calc(100% - 72px); }
        .prodigy-home:not(.home-wide) .focus-reason,
        .prodigy-home:not(.home-wide) .focus-details { padding-left: 0; margin-left: 0; }
        /* Mobile/narrow Home: minimum vertical control footprint */
        .prodigy-home:not(.home-wide) .focus-actions .action-btn,
        .prodigy-home:not(.home-wide) .focus-footer .action-btn,
        .prodigy-home:not(.home-wide) .home-toolbar .action-btn {
          min-height: 0;
          height: auto;
          padding: 0 5px;
          font-size: 0.66em;
          line-height: 1.3;
        }
        .prodigy-home:not(.home-wide) .focus-actions,
        .prodigy-home:not(.home-wide) .focus-footer {
          justify-content: flex-start;
          gap: 2px;
          margin-top: 1px;
        }
        .prodigy-home:not(.home-wide) .focus-row {
          padding: 6px 2px;
          gap: 4px;
        }
        .prodigy-home:not(.home-wide) .home-card {
          padding: 8px 10px;
        }
        .prodigy-home:not(.home-wide) .home-header {
          margin-bottom: 6px;
        }
        .prodigy-home:not(.home-wide) .home-grid {
          gap: 8px;
        }
        .prodigy-home.home-narrow { padding-inline: 0; }
        .prodigy-home.home-narrow .workspace-list { grid-template-columns: 1fr; }
        .prodigy-home.home-narrow .home-card { padding: 8px; }
        .prodigy-home.home-narrow .focus-row { padding: 5px 2px; }
        .prodigy-home.home-narrow .workspace-row { min-height: 0; padding: 4px 8px; }

        /* Mobile compact Home: Brief + Focus + Launcher first; rest behind fold */
        .prodigy-home.home-compact {
          padding-bottom: 24px;
        }
        .prodigy-home.home-compact .home-grid {
          gap: 10px;
        }
        .prodigy-home.home-compact .home-column {
          gap: 10px;
        }
        .prodigy-home.home-compact .home-title-row {
          margin-bottom: 10px;
          gap: 8px;
        }
        .prodigy-home.home-compact .home-title-row h2 {
          font-size: 1.2em;
        }
        .prodigy-home.home-compact .home-brief-compact > p.home-brief-text {
          display: -webkit-box;
          -webkit-line-clamp: 4;
          -webkit-box-orient: vertical;
          overflow: hidden;
          font-size: 0.88em;
          margin-bottom: 8px !important;
        }
        .prodigy-home.home-compact .home-secondary-fold {
          border: 1px solid var(--background-modifier-border);
          border-radius: 10px;
          background: var(--background-secondary);
          padding: 4px 10px 10px;
        }
        .prodigy-home.home-compact .home-secondary-fold > summary {
          font-weight: 800;
          font-size: 0.9em;
          color: var(--text-muted);
          cursor: pointer;
          min-height: 44px;
          display: flex;
          align-items: center;
          list-style: none;
          -webkit-tap-highlight-color: transparent;
        }
        .prodigy-home.home-compact .home-secondary-fold > summary::-webkit-details-marker {
          display: none;
        }
        .prodigy-home.home-compact .home-secondary-fold > summary::before {
          content: "▸ ";
          color: var(--text-accent);
        }
        .prodigy-home.home-compact .home-secondary-fold[open] > summary::before {
          content: "▾ ";
        }
        .prodigy-home.home-compact .home-secondary-fold-body {
          display: flex;
          flex-direction: column;
          gap: 10px;
          margin-top: 6px;
        }
        /* Lifecycle is secondary: always collapsed by default */
        .prodigy-home .home-lifecycle-fold {
          border: 1px solid var(--background-modifier-border);
          border-radius: 8px;
          background: var(--background-secondary);
          padding: 2px 10px 8px;
          margin: 0;
        }
        .prodigy-home .home-lifecycle-fold > summary {
          font-weight: 700;
          font-size: 0.88em;
          color: var(--text-muted);
          cursor: pointer;
          min-height: 36px;
          display: flex;
          align-items: center;
          list-style: none;
          -webkit-tap-highlight-color: transparent;
        }
        .prodigy-home .home-lifecycle-fold > summary::-webkit-details-marker {
          display: none;
        }
        .prodigy-home .home-lifecycle-fold > summary::before {
          content: "▸ ";
          color: var(--text-muted);
        }
        .prodigy-home .home-lifecycle-fold[open] > summary::before {
          content: "▾ ";
        }
        .prodigy-home .home-lifecycle-fold .home-card {
          border: none;
          box-shadow: none;
          background: transparent;
          padding: 4px 0 0;
          margin: 0;
        }
        /* Compact Home: keep the same compact control density (no larger touch overrides) */
        .prodigy-home.home-compact .action-btn,
        .prodigy-home.home-compact button.action-btn,
        .prodigy-home.home-compact .prodigy-launcher-actions button,
        .prodigy-home.home-compact .home-launcher-mount button,
        .prodigy-home.home-compact .focus-footer .action-btn-primary,
        .prodigy-home.home-compact button.action-btn-primary {
          min-height: 0 !important;
          height: auto !important;
          padding: 1px 6px !important;
          font-size: 0.7em !important;
          line-height: 1.15 !important;
          border-radius: 4px !important;
        }
        .prodigy-home.home-compact .col-span-4:empty {
          display: none;
        }
      `;

    const todayStr = root.MorningContextCore.getTodayIsoDate();
    const weekId = root.MorningContextCore.getWeekId(new Date());

    // Display loader — external failures must never block Home.
    const mainLoader = container.createEl("div", {
      text: "⌛ 오늘의 운영 화면을 준비하는 중...",
      attr: { style: "color: var(--text-muted); font-size: 0.9em; font-style: italic; padding: 20px; text-align: center;" }
    });

    let token = "";
    try {
      if (root.ProjectTodoistAdapter && root.ProjectTodoistAdapter.getTodoistToken) {
        token = await root.ProjectTodoistAdapter.getTodoistToken(app);
      }
    } catch (_tokenError) {
      token = "";
    }

    let newPkg = null;
    try {
      newPkg = await root.MorningContextCore.buildMorningPackage({ app, dv, now: new Date(), todoistToken: token });
    } catch (err) {
      newPkg = {
        local_date: todayStr,
        day_of_week: "",
        warnings: [`context_build_limited: ${err.message}`],
        context: {
          todoist: { todayCount: 0, overdueCount: 0, todayTasks: [], overdueTasks: [] },
          projects: [],
          auctions: [],
          reading: [],
          continue_candidates: [],
          risks: [],
          review_inbox: [],
          recent_reflections: [],
          yesterday_review: null
        }
      };
    }

    let cached = null;
    let approvedFocus = null;
    let pinnedFocus = null;
    try {
      cached = await root.MorningCache.getDailyCache(app, todayStr);
      approvedFocus = await root.MorningCache.getApprovedFocus(app, todayStr);
      pinnedFocus = await root.MorningCache.getPinnedFocus(app, todayStr);
    } catch (_cacheError) {
      cached = null;
      approvedFocus = null;
      pinnedFocus = null;
    }

    let isStale = false;
    if (cached && cached.pkg) {
      try {
        isStale = root.MorningCache.checkIsStale(cached.pkg, newPkg);
      } catch (_staleError) {
        isStale = true;
      }
    }

    if (!cached || !cached.result) {
      try {
        const resultJson = await generateMorningBrief({ app, morningPackage: newPkg });
        try { await root.MorningCache.saveDailyCache(app, todayStr, newPkg, resultJson); } catch (_saveError) { /* non-blocking */ }
        cached = { pkg: newPkg, result: resultJson };
        isStale = false;
      } catch (_briefError) {
        const ruleResult = root.MorningContextCore.generateDeterministicFallback(newPkg);
        try { await root.MorningCache.saveDailyCache(app, todayStr, newPkg, ruleResult); } catch (_saveError) { /* non-blocking */ }
        cached = { pkg: newPkg, result: ruleResult };
        isStale = false;
      }
    } else if (isStale && newPkg) {
      // Vault changed (delete/add/status). Keep cached AI brief text if present,
      // but always refresh package context and drop focus items for missing files.
      try {
        await root.MorningCache.saveDailyCache(app, todayStr, newPkg, cached.result);
      } catch (_saveError) { /* non-blocking */ }
      cached = { pkg: newPkg, result: cached.result };
    }

    mainLoader.remove();

    // Live vault context is always preferred over a stale morning package snapshot.
    const pkg = newPkg || (cached && cached.pkg) || {};
    let result = (cached && cached.result) ? cached.result : {};

    const pathExists = (objectPath) => {
      if (!objectPath) return true; // manual/health focus without a file
      if (app.vault.getAbstractFileByPath(objectPath)) return true;
      // Also accept paths known in the live package
      const lists = [
        (pkg.context && pkg.context.projects) || [],
        (pkg.context && pkg.context.auctions) || [],
        (pkg.context && pkg.context.reading) || []
      ];
      return lists.some((list) => list.some((item) => item && item.path === objectPath));
    };

    const sanitizeFocusList = (list) => (Array.isArray(list) ? list : []).filter((item) => {
      if (!item) return false;
      if (!item.object_path) return true;
      return pathExists(item.object_path);
    });

    if (result && Array.isArray(result.focus)) {
      result = Object.assign({}, result, { focus: sanitizeFocusList(result.focus) });
    }
    if (approvedFocus && Array.isArray(approvedFocus.focus)) {
      approvedFocus = Object.assign({}, approvedFocus, {
        focus: sanitizeFocusList(approvedFocus.focus)
      });
      if (!approvedFocus.focus.length) approvedFocus = null;
    }
    if (pinnedFocus && pinnedFocus.focus && pinnedFocus.focus.object_path && !pathExists(pinnedFocus.focus.object_path)) {
      try { await root.MorningCache.clearPinnedFocus(app, todayStr); } catch (_e) { /* ignore */ }
      pinnedFocus = null;
    }

    if (!result || !Array.isArray(result.focus) || result.focus.length === 0) {
      result = root.MorningContextCore.generateDeterministicFallback(pkg);
    }

    // Shared operational layer (Object Engine once) for Needs Attention + Launcher
    let briefContext = null;
    let journalStatusForOps = { status: "empty" };
    let workoutSnapshotForOps = null;
    try {
      if (root.JournalStore) {
        try {
          const review = await root.JournalStore.loadReview(app, todayStr);
          journalStatusForOps = { status: (review && review.status) || "empty" };
        } catch (_je) {
          journalStatusForOps = { status: "empty" };
        }
      }
      if (root.WorkspaceLauncherCore && typeof root.WorkspaceLauncherCore.loadWorkoutSnapshot === "function") {
        try {
          workoutSnapshotForOps = await root.WorkspaceLauncherCore.loadWorkoutSnapshot(app);
        } catch (_w) {
          workoutSnapshotForOps = null;
        }
      }
      if (root.MorningBriefContext && typeof root.MorningBriefContext.buildMorningBriefContext === "function") {
        briefContext = root.MorningBriefContext.buildMorningBriefContext({
          pkg,
          pinnedFocus,
          journalStatus: journalStatusForOps,
          workoutSnapshot: workoutSnapshotForOps,
          focusItems: (approvedFocus && approvedFocus.focus) || (result && result.focus) || [],
          now: new Date()
        });
      }
    } catch (_briefEarlyError) {
      briefContext = null;
    }

    // Time of Day Adaptive Emphasis Calculations
    const hours = new Date().getHours();
    const daypart = root.MorningContextCore.getDaypart(hours);
    
    // morning: 5-11, afternoon: 12-17, evening: 18-4
    const isMorning = daypart === "morning";
    const isAfternoon = daypart === "afternoon";
    const isEvening = daypart === "evening";

    let greeting = "좋은 아침입니다.";
    if (isAfternoon) greeting = "즐거운 오후입니다. 오늘 계획을 힘차게 실행하세요!";
    if (isEvening) greeting = "오늘 하루도 수고하셨습니다. 성찰을 통해 하루를 차분히 마무리하세요.";

    // Render Title & Status bar
    const titleRow = container.createEl("div", {
      attr: { class: "home-title-row" }
    });
    
    const leftTitle = titleRow.createEl("div");
    leftTitle.createEl("h2", { text: `🌅 오늘 · ${todayStr}`, attr: { style: "margin:0;" } });
    leftTitle.createEl("span", { text: `${pkg.day_of_week || ""} · ${greeting} · 지금 무엇에 집중할까?`, attr: { style: "font-size: 0.85em; color: var(--text-muted);" } });

    const rightActions = titleRow.createEl("div", { attr: { class: "home-toolbar" } });

    // Universal Object Creator entry (+ / ⌘N)
    const newObjBtn = rightActions.createEl("button", {
      text: "+ 새 Object",
      attr: {
        type: "button",
        class: "action-btn action-btn-primary",
        title: "새 Object (⌘/Ctrl+N)"
      }
    });
    newObjBtn.onclick = () => {
      if (root.ObjectCreatorView && typeof root.ObjectCreatorView.open === "function") {
        root.ObjectCreatorView.open(app, { pkg });
      } else {
        new Notice("Object Creator를 불러오지 못했습니다.");
      }
    };
    // One global keyboard entry on Home (do not register multiple)
    if (container && !container.__prodigyCreatorKey) {
      container.__prodigyCreatorKey = (e) => {
        if (!e) return;
        const mod = e.metaKey || e.ctrlKey;
        if (mod && (e.key === "n" || e.key === "N") && !e.altKey && !e.shiftKey) {
          // Avoid when typing in inputs outside home primary chrome
          const t = e.target;
          const tag = t && t.tagName ? String(t.tagName).toLowerCase() : "";
          if (tag === "input" || tag === "textarea" || (t && t.isContentEditable)) return;
          e.preventDefault();
          e.stopPropagation();
          if (root.ObjectCreatorView && typeof root.ObjectCreatorView.open === "function") {
            root.ObjectCreatorView.open(app, { pkg });
          }
        }
      };
      try {
        document.addEventListener("keydown", container.__prodigyCreatorKey);
      } catch (_e) { /* ignore */ }
    }
    
    if (isStale) {
      rightActions.createEl("span", { 
        text: "🔔 새 정보 감지됨", 
        attr: { style: "font-size: 0.72em; color: var(--text-accent); font-weight: bold; background: rgba(var(--text-accent-rgb), 0.1); padding: 2px 6px; border-radius: 4px;" } 
      });
    }

    const refreshBtn = rightActions.createEl("button", { text: "새로고침", attr: { class: "action-btn" } });
    refreshBtn.onclick = () => renderHome(options);

    const regenerateBtn = rightActions.createEl("button", { text: "브리핑 다시 생성", attr: { class: "action-btn" } });
    regenerateBtn.onclick = async () => {
      regenerateBtn.disabled = true;
      regenerateBtn.text = "생성 중...";
      try {
        const freshResult = await generateMorningBrief({ app, morningPackage: newPkg });
        await root.MorningCache.saveDailyCache(app, todayStr, newPkg, freshResult);
        await root.MorningCache.clearApprovedFocus(app, todayStr);
        renderHome(options);
      } catch (err) {
        new Notice("브리핑 갱신 실패: " + err.message);
        regenerateBtn.disabled = false;
        regenerateBtn.text = "브리핑 다시 생성";
      }
    };

    // ── Mission Control stack (presentation only; reuses existing APIs) ──
    const isCompactHome = !!(
      app.isMobile
      || (typeof document !== "undefined" && document.body && document.body.classList.contains("is-mobile"))
      || container.classList.contains("home-narrow")
      || (typeof window !== "undefined" && window.innerWidth > 0 && window.innerWidth < 720)
    );
    container.classList.toggle("home-compact", isCompactHome);

    const stack = container.createEl("div", {
      attr: { class: "home-grid home-mc-stack home-column col-span-12" }
    });

    const workspacePathFor = (sourceType) => {
      const t = String(sourceType || "").toLowerCase();
      if (t === "auction" || t === "auction_case") return "HUB/10 Auction.md";
      if (t === "reading") return "HUB/20 Reading.md";
      if (t === "workout") return "HUB/30 Workout.md";
      if (t === "project" || t === "project_note" || t === "project_family") return "HUB/40 Project.md";
      if (t === "people" || t === "personal" || t === "person") return "HUB/60 Personal.md";
      if (t === "journal") return "HUB/70 Journal.md";
      if (t === "knowledge") return "HUB/50 Knowledge.md";
      return "";
    };

    const openPath = (p) => {
      if (!p) return;
      try { app.workspace.openLinkText(p, p, false); } catch (_e) { /* ignore */ }
    };

    const openSearch = () => {
      try {
        if (app.commands && typeof app.commands.executeCommandById === "function") {
          if (app.commands.executeCommandById("global-search:open")) return;
          if (app.commands.executeCommandById("switcher:open")) return;
        }
      } catch (_e) { /* ignore */ }
      new Notice("검색을 열 수 없습니다. ⌘/Ctrl+O 또는 돋보기 단축키를 사용하세요.");
    };

    const openOrCreateDaily = async () => {
      const dailyPath = "DAILY/DAILY/" + todayStr + ".md";
      try {
        let file = app.vault.getAbstractFileByPath(dailyPath);
        if (!file) {
          const folder = "DAILY/DAILY";
          if (!app.vault.getAbstractFileByPath(folder) && app.vault.createFolder) {
            try { await app.vault.createFolder(folder); } catch (_f) { /* may exist */ }
          }
          const templateFile = app.vault.getAbstractFileByPath("SYSTEM/TEMPLATE/FORMAT/template_daily_note.md");
          let body = "# " + todayStr + "\n";
          if (templateFile && app.vault.read) {
            try { body = await app.vault.read(templateFile); } catch (_r) { /* default */ }
          }
          file = await app.vault.create(dailyPath, body);
        }
        openPath(dailyPath);
      } catch (err) {
        new Notice("Daily를 열 수 없습니다: " + (err && err.message ? err.message : err));
        openPath(dailyPath);
      }
    };

    const safeRenderRegion = (label, renderFn) => {
      try {
        return renderFn();
      } catch (error) {
        const err = stack.createEl("div", {
          text: label + " 영역을 표시하지 못했습니다.",
          attr: { style: "font-size:0.82em;color:var(--text-error);margin:6px 0;" }
        });
        if (window.prodigyDebugMode) {
          err.createEl("div", {
            text: String(error.message || error),
            attr: { style: "font-size:0.75em;color:var(--text-muted);" }
          });
        }
        return null;
      }
    };

    const clampBriefLines = (text, maxLines) => {
      const raw = String(text || "").trim();
      if (!raw) return "오늘 우선순위를 정리했습니다.";
      const lines = raw.split(/\n+/).map((l) => l.trim()).filter(Boolean);
      if (lines.length <= maxLines) return lines.join("\n");
      return lines.slice(0, maxLines).join("\n");
    };

    // ── 1. TODAY · Morning Brief ──
    safeRenderRegion("Morning Brief", () => {
      const briefCard = stack.createEl("div", {
        attr: { class: "home-card " + (isMorning ? "emphasis-primary" : "emphasis-secondary") + (isCompactHome ? " home-brief-compact" : "") }
      });
      const briefHead = briefCard.createEl("div", { attr: { class: "home-header" } });
      briefHead.createEl("span", { text: "🌅 TODAY" });
      briefHead.createEl("span", {
        text: "Morning Brief",
        attr: { style: "font-size:0.78em;font-weight:600;color:var(--text-muted);margin-left:4px;" }
      });
      const briefMode = result.brief_mode || (result.principle && result.principle.source) || "";
      if (briefMode === "rule_based" || briefMode === "fallback" || String(result.result_id || "").includes("rule-based") || String(result.result_id || "").includes("fallback")) {
        briefHead.createEl("span", {
          text: "규칙 기반",
          attr: { class: "badge badge-gray", style: "margin-left:auto;font-size:0.65em;" }
        });
      }

      briefCard.createEl("p", {
        text: clampBriefLines(result.brief, isCompactHome ? 4 : 5),
        attr: {
          class: "home-brief-text",
          style: "font-size:0.92em;line-height:1.55;color:var(--text-normal);margin:0 0 8px 0;white-space:pre-wrap;"
        }
      });

      // Context lines only (no long paragraphs / statistics)
      const contextLines = [];
      if (result.principle && result.principle.label) {
        contextLines.push("원칙 · " + result.principle.label);
      }
      const yesterdayReview = (pkg.context && pkg.context.yesterday_review) || null;
      const yLearning = yesterdayReview && String(yesterdayReview.learning || yesterdayReview.change || "").trim();
      const yNext = yesterdayReview && String(yesterdayReview.next_experiment || "").trim();
      if (yLearning) contextLines.push("어제 배움 · " + yLearning);
      if (yNext) contextLines.push("오늘 실험 · " + yNext);

      if (contextLines.length) {
        const ctxBox = briefCard.createEl("div", {
          attr: {
            class: "home-yesterday-review",
            style: "margin-top:4px;display:flex;flex-direction:column;gap:3px;font-size:0.84em;line-height:1.4;color:var(--text-muted);"
          }
        });
        contextLines.slice(0, 3).forEach((line) => {
          ctxBox.createEl("div", { text: line, attr: { style: "overflow-wrap:anywhere;" } });
        });
        if (yesterdayReview && (yLearning || yNext) && yesterdayReview.path) {
          const openY = briefCard.createEl("button", {
            text: "어제 저널 열기",
            attr: { class: "action-btn", style: "margin-top:8px;" }
          });
          openY.onclick = () => openPath(yesterdayReview.path || ("DAILY/DAILY/" + (yesterdayReview.date || "") + ".md"));
        }
      }

      // Lightweight yesterday-missing notice (never blocks)
      const yMissing = !!(
        (yesterdayReview && yesterdayReview.missing)
        || (!yLearning && !yNext)
      );
      if (yMissing && !isEvening) {
        const miss = briefCard.createEl("div", {
          attr: {
            class: "home-yesterday-missing",
            style: "margin-top:10px;padding-top:8px;border-top:1px dashed var(--background-modifier-border);font-size:0.82em;color:var(--text-muted);"
          }
        });
        miss.createEl("div", { text: "어제 성찰이 비어 있습니다 · 필수는 아닙니다." });
        const missBtn = miss.createEl("button", {
          text: "2분 성찰",
          attr: { class: "action-btn", style: "margin-top:6px;" }
        });
        missBtn.onclick = async () => {
          const yDate = (yesterdayReview && yesterdayReview.date)
            || (root.MorningContextCore && root.MorningContextCore.getYesterdayIsoDate
              ? root.MorningContextCore.getYesterdayIsoDate(new Date())
              : "");
          if (root.JournalView && root.JournalStore && yDate) {
            const review = await root.JournalStore.loadReview(app, yDate);
            root.JournalView.openReviewModal(app, review.fields || {}, async (values) => {
              await root.JournalStore.saveReview(app, yDate, values);
              if (window.Notice) new Notice("어제 성찰을 저장했습니다.");
            }, { focusHints: [] });
            return;
          }
          openPath((yesterdayReview && yesterdayReview.path) || (yDate ? "DAILY/DAILY/" + yDate + ".md" : "HUB/70 Journal.md"));
        };
      }

      if (isEvening) {
        const eve = briefCard.createEl("div", {
          attr: { style: "margin-top:10px;padding-top:8px;border-top:1px solid var(--background-modifier-border);" }
        });
        eve.createEl("div", {
          text: "오늘 마무리 · 2분 Review로 Focus를 닫습니다.",
          attr: { style: "font-size:0.84em;color:var(--text-muted);margin-bottom:6px;" }
        });
        const openJournalBtn = eve.createEl("button", {
          text: "2분 성찰 작성",
          attr: { class: "action-btn action-btn-primary" }
        });
        openJournalBtn.onclick = async () => {
          const focusHints = [];
          const focusList = (approvedFocus && Array.isArray(approvedFocus.focus))
            ? approvedFocus.focus
            : (Array.isArray(result.focus) ? result.focus : []);
          focusList.slice(0, 3).forEach((item) => {
            if (item && item.label) focusHints.push(String(item.label));
          });
          if (root.JournalView && root.JournalStore) {
            const review = await root.JournalStore.loadReview(app, todayStr);
            root.JournalView.openReviewModal(app, review.fields || {}, async (values) => {
              await root.JournalStore.saveReview(app, todayStr, values);
              if (window.Notice) new Notice("오늘 Review를 저장했습니다.");
            }, { focusHints });
            return;
          }
          openPath("HUB/70 Journal.md");
        };
      }
    });

    // ── 2. Today's Focus (approved only — no edit from Home) ──
    safeRenderRegion("Today's Focus", () => {
      const focusCard = stack.createEl("div", {
        attr: { class: "home-card " + (isMorning || isAfternoon ? "emphasis-primary" : "emphasis-secondary") }
      });
      const head = focusCard.createEl("div", { attr: { class: "home-header" } });
      head.createEl("span", { text: "🎯 오늘의 집중" });

      const baseFocus = (approvedFocus && Array.isArray(approvedFocus.focus))
        ? approvedFocus.focus
        : [];
      const rankedFocus = root.MorningContextCore.selectFocusItems
        ? root.MorningContextCore.selectFocusItems({
          pinnedFocus,
          focusItems: baseFocus,
          pkg,
          localDate: todayStr
        })
        : baseFocus;
      const currentFocus = (rankedFocus || []).filter(Boolean).slice(0, 3);

      if (!approvedFocus || !currentFocus.length) {
        focusCard.createEl("div", {
          text: "선택된 집중이 없습니다.",
          attr: { style: "font-size:0.9em;color:var(--text-normal);font-weight:600;" }
        });
        focusCard.createEl("div", {
          text: "아침 브리핑을 확인하세요.",
          attr: { style: "font-size:0.84em;color:var(--text-muted);margin-top:4px;margin-bottom:10px;" }
        });
        // One-tap approve of existing proposal (no field editing)
        const proposal = root.MorningContextCore.selectFocusItems
          ? root.MorningContextCore.selectFocusItems({
            pinnedFocus,
            focusItems: (result && Array.isArray(result.focus) ? result.focus : []),
            pkg,
            localDate: todayStr
          })
          : ((result && Array.isArray(result.focus)) ? result.focus : []);
        const actions = focusCard.createEl("div", { attr: { class: "focus-footer", style: "border-top:none;padding-top:0;" } });
        if (proposal && proposal.length) {
          const approveBtn = actions.createEl("button", {
            text: "제안 Focus 승인",
            attr: { class: "action-btn action-btn-primary" }
          });
          approveBtn.onclick = async () => {
            approvedFocus = await root.MorningCache.saveApprovedFocus(app, todayStr, proposal.slice(0, 3), false);
            new Notice("오늘의 Focus가 승인되었습니다.");
            renderHome(options);
          };
        }
        const regenHint = actions.createEl("button", {
          text: "브리핑 다시 생성",
          attr: { class: "action-btn" }
        });
        regenHint.onclick = () => regenerateBtn.click();
        return;
      }

      head.createEl("span", {
        text: "승인됨",
        attr: { class: "badge badge-high", style: "margin-left:auto;font-size:0.65em;" }
      });

      const listDiv = focusCard.createEl("div", { attr: { class: "focus-list" } });
      currentFocus.forEach((item) => {
        const row = listDiv.createEl("div", { attr: { class: "focus-row" } });
        const top = row.createEl("div", { attr: { class: "focus-top" } });
        const titleSpan = top.createEl("div", { attr: { class: "focus-title" } });
        titleSpan.createEl("span", { text: item.label || "Focus" });
        top.createEl("span", {
          text: getSourceTypeLabel(item.source_type),
          attr: { class: "badge badge-gray" }
        });
        const next = item.next_action || item.reason || "";
        if (next) {
          row.createEl("div", {
            text: next,
            attr: { class: "focus-reason", style: "padding-left:0;" }
          });
        }
        const btnRow = row.createEl("div", { attr: { class: "focus-actions" } });
        const dash = workspacePathFor(item.source_type);
        if (dash) {
          const openDash = btnRow.createEl("button", {
            text: "워크스페이스 열기",
            attr: { class: "action-btn action-btn-primary" }
          });
          openDash.onclick = () => openPath(dash);
        } else if (item.object_path) {
          const openObj = btnRow.createEl("button", {
            text: "열기",
            attr: { class: "action-btn action-btn-primary" }
          });
          openObj.onclick = () => openPath(item.object_path);
        }
      });
    });

    // Primary mission blocks stay above the fold on all sizes
    const primary = stack;
    // Lower chrome (actions / todoist / launcher / status) can collapse on mobile
    let lower = stack;
    if (isCompactHome) {
      // Continue + Attention render into primary first; fold created after them
      lower = null;
    }

    // ── 3. Continue (Object Engine / package candidates, max 4) ──
    safeRenderRegion("Continue", () => {
      const continueCard = primary.createEl("div", {
        attr: { class: "home-card " + (isAfternoon ? "emphasis-primary" : "emphasis-secondary") }
      });
      continueCard.createEl("div", { text: "▶ 이어하기", attr: { class: "home-header" } });

      const cards = [];
      const seen = Object.create(null);
      const pushCard = (card) => {
        if (!card || !card.title) return;
        const key = String(card.object_path || card.title).toLowerCase();
        if (seen[key]) return;
        // Never display completed Objects
        const st = String(card.status || "").toLowerCase();
        if (st === "completed" || st === "archived" || st === "finished" || st === "dropped") return;
        if (/\bcompleted\b/.test(st)) return;
        seen[key] = true;
        cards.push(card);
      };

      const byWs = (briefContext && briefContext.continue_by_workspace) || {};
      ["auction", "reading", "workout", "project", "personal"].forEach((ws) => {
        const c = byWs[ws];
        if (!c) return;
        pushCard({
          title: c.label || c.title || "",
          workspace: c.workspace || ws,
          workspace_label: getSourceTypeLabel(ws === "personal" ? "journal" : ws) || ws,
          next_action: c.action || c.next_action || "",
          object_path: c.object_path || "",
          dashboard_path: c.dashboard_path || workspacePathFor(ws),
          status: c.status || ""
        });
      });

      ((pkg.context && pkg.context.continue_candidates) || []).forEach((c) => {
        if (!c) return;
        pushCard({
          title: c.name || c.title || "",
          workspace: c.type || "",
          workspace_label: getSourceTypeLabel(c.type) || c.type || "Object",
          next_action: c.next_action || "",
          object_path: c.path || c.object_path || "",
          dashboard_path: workspacePathFor(c.type),
          status: c.status || ""
        });
      });

      const limited = cards.slice(0, 4);
      if (!limited.length) {
        continueCard.createEl("div", {
          text: "이어할 항목이 없습니다.",
          attr: { style: "font-size:0.9em;font-weight:600;" }
        });
        continueCard.createEl("div", {
          text: "오늘은 새 출발입니다.",
          attr: { style: "font-size:0.84em;color:var(--text-muted);margin-top:4px;font-style:italic;" }
        });
        return;
      }

      const list = continueCard.createEl("div", { attr: { class: "continue-list" } });
      limited.forEach((c) => {
        const row = list.createEl("div", { attr: { class: "continue-row" } });
        const meta = row.createEl("div", {
          attr: { style: "display:flex;flex-direction:column;gap:3px;flex:1;min-width:0;" }
        });
        meta.createEl("div", {
          text: c.workspace_label || "Workspace",
          attr: { style: "font-size:0.78em;font-weight:700;color:var(--text-muted);" }
        });
        meta.createEl("strong", {
          text: c.title,
          attr: { style: "font-size:0.95em;overflow-wrap:anywhere;" }
        });
        if (c.next_action) {
          meta.createEl("div", {
            text: c.next_action,
            attr: { style: "font-size:0.82em;color:var(--text-accent);font-weight:500;overflow-wrap:anywhere;" }
          });
        }
        const target = c.dashboard_path || c.object_path;
        const btn = row.createEl("button", {
          text: "이어하기",
          attr: { class: "action-btn action-btn-primary" }
        });
        btn.onclick = (e) => {
          if (e && e.stopPropagation) e.stopPropagation();
          openPath(target);
        };
        row.onclick = () => openPath(target);
      });
    });

    // ── 4. Needs Attention (critical/high via briefContext) ──
    safeRenderRegion("Needs Attention", () => {
      const risks = (briefContext && root.MorningBriefContext && root.MorningBriefContext.toHomeRiskItems)
        ? root.MorningBriefContext.toHomeRiskItems(briefContext)
        : ((pkg.context && pkg.context.risks) || []);

      const riskCard = primary.createEl("div", {
        attr: { class: "home-card emphasis-risk home-needs-attention" }
      });
      const rHead = riskCard.createEl("div", {
        attr: { class: "home-header", style: "color: var(--text-error);" }
      });
      rHead.createEl("span", { text: "⚠ 주의가 필요함" });
      if (briefContext && briefContext.engine_ok === false) {
        rHead.createEl("span", {
          text: "엔진 폴백",
          attr: { class: "badge badge-gray", style: "margin-left:6px;" }
        });
      }

      if (!risks.length) {
        riskCard.createEl("div", {
          text: (briefContext && briefContext.empty_attention_message)
            || "오늘은 주의할 Object가 없습니다.",
          attr: {
            style: "font-size:0.9em;color:var(--text-muted);font-style:italic;padding:6px 0;line-height:1.45;"
          }
        });
        return;
      }

      const rList = riskCard.createEl("div", {
        attr: { style: "display:flex;flex-direction:column;gap:4px;" }
      });
      risks.forEach((risk) => {
        const rItem = rList.createEl("div", {
          attr: {
            class: "home-attention-item",
            style: "font-size:0.88em;display:flex;flex-direction:column;gap:6px;padding:12px 0;border-top:1px solid var(--background-modifier-border);"
          }
        });
        const topRow = rItem.createEl("div", {
          attr: { style: "display:flex;justify-content:space-between;align-items:flex-start;gap:8px;flex-wrap:wrap;" }
        });
        const titleWrap = topRow.createEl("div", {
          attr: { style: "display:flex;flex-direction:column;gap:3px;min-width:0;flex:1 1 auto;" }
        });
        if (risk.workspace_label) {
          titleWrap.createEl("span", {
            text: risk.workspace_label,
            attr: { style: "font-size:0.78em;color:var(--text-muted);font-weight:700;" }
          });
        }
        titleWrap.createEl("strong", {
          text: risk.label,
          attr: { style: "color:var(--text-normal);font-size:1.02em;overflow-wrap:anywhere;" }
        });
        // Human labels only — never raw lifecycle tokens as primary copy
        if (risk.attention_level) {
          const lvl = String(risk.attention_level).toLowerCase();
          if (lvl === "critical" || lvl === "high") {
            titleWrap.createEl("span", {
              text: lvl === "critical" ? "Critical" : "High",
              attr: {
                class: lvl === "critical" ? "badge badge-high" : "badge badge-medium",
                style: "width:fit-content;"
              }
            });
          }
        }
        const dash = risk.dashboard_path || workspacePathFor(risk.workspace_label);
        if (dash) {
          const dashBtn = topRow.createEl("button", {
            text: "워크스페이스 열기",
            attr: { class: "action-btn action-btn-primary" }
          });
          dashBtn.onclick = () => openPath(dash);
        }

        const reasonBox = rItem.createEl("div");
        reasonBox.createEl("div", {
          text: "WHY",
          attr: { style: "font-size:0.75em;font-weight:700;color:var(--text-muted);margin-bottom:2px;" }
        });
        const reasonList = Array.isArray(risk.evidence) && risk.evidence.length
          ? risk.evidence
          : [String(risk.reason || "").replace(/\s*\(site_visit_date\)/g, "")].filter(Boolean);
        if (!reasonList.length) {
          reasonBox.createEl("div", { text: "· 주의가 필요합니다." });
        } else {
          reasonList.slice(0, 3).forEach((ev) => {
            reasonBox.createEl("div", {
              text: "· " + String(ev).replace(/\s*\(site_visit_date\)/g, ""),
              attr: { style: "line-height:1.45;overflow-wrap:anywhere;" }
            });
          });
        }
      });
    });

    if (isCompactHome) {
      const fold = stack.createEl("details", { attr: { class: "home-secondary-fold" } });
      fold.createEl("summary", { text: "더 보기 · 빠른 실행 · Todoist · 런처" });
      lower = fold.createEl("div", { attr: { class: "home-secondary-fold-body home-mc-lower" } });
    } else {
      lower = stack;
    }

    // ── 5. Quick Actions ──
    safeRenderRegion("Quick Actions", () => {
      const qa = lower.createEl("div", { attr: { class: "home-card emphasis-secondary home-quick-actions" } });
      qa.createEl("div", { text: "⚡ 빠른 실행", attr: { class: "home-header" } });
      const row = qa.createEl("div", {
        attr: { style: "display:flex;flex-wrap:wrap;gap:8px;" }
      });
      const newObj = row.createEl("button", {
        text: "+ 새 Object",
        attr: { class: "action-btn action-btn-primary", type: "button" }
      });
      newObj.onclick = () => {
        if (root.ObjectCreatorView && typeof root.ObjectCreatorView.open === "function") {
          root.ObjectCreatorView.open(app, { pkg });
        } else {
          new Notice("Object Creator를 불러오지 못했습니다.");
        }
      };
      const newDaily = row.createEl("button", {
        text: "+ 오늘 Daily",
        attr: { class: "action-btn", type: "button" }
      });
      newDaily.onclick = () => { openOrCreateDaily(); };
      const searchBtn = row.createEl("button", {
        text: "검색",
        attr: { class: "action-btn", type: "button" }
      });
      searchBtn.onclick = () => openSearch();
    });

    // ── 6. Todoist (summary only — Todoist owns execution) ──
    safeRenderRegion("Todoist", () => {
      const execCard = lower.createEl("div", {
        attr: { class: "home-card " + (isAfternoon ? "emphasis-primary" : "emphasis-secondary") }
      });
      execCard.createEl("div", { text: "✓ Todoist", attr: { class: "home-header" } });
      const todoist = (pkg.context && pkg.context.todoist) || {};
      const todayCount = todoist.todayCount || 0;
      const overdueCount = todoist.overdueCount || 0;
      execCard.createEl("div", {
        text: "Today",
        attr: { style: "font-size:0.8em;color:var(--text-muted);font-weight:700;" }
      });
      execCard.createEl("div", {
        text: todayCount + " Tasks",
        attr: { style: "font-size:1.15em;font-weight:800;margin-top:2px;" }
      });
      if (overdueCount > 0) {
        execCard.createEl("div", {
          text: overdueCount + " Overdue",
          attr: { style: "font-size:0.9em;color:var(--text-error);font-weight:700;margin-top:2px;" }
        });
      }
      const todoBtn = execCard.createEl("button", {
        text: "Todoist 열기",
        attr: { class: "action-btn action-btn-primary", style: "margin-top:10px;" }
      });
      todoBtn.onclick = () => {
        try { window.open("todoist://"); } catch (_e) {
          try { window.open("https://todoist.com/app", "_blank"); } catch (_e2) { /* ignore */ }
        }
      };
    });

    // ── 7. Workspace Launcher (reuse — context cards) ──
    safeRenderRegion("Workspace Launcher", () => {
      const launcherMount = lower.createEl("div", { attr: { class: "home-launcher-mount" } });
      try {
        if (root.WorkspaceLauncherCore && root.WorkspaceLauncherView) {
          const launcherCards = root.WorkspaceLauncherCore.buildLauncherCards({
            pkg,
            journalStatus: journalStatusForOps,
            workoutSnapshot: workoutSnapshotForOps,
            engine_states: briefContext && briefContext.engine_states
              ? briefContext.engine_states
              : null,
            briefContext
          });
          root.WorkspaceLauncherView.render({
            container: launcherMount,
            app,
            cards: launcherCards,
            pkg
          });
        } else {
          launcherMount.createEl("div", {
            text: "워크스페이스 런처를 불러오지 못했습니다.",
            attr: { style: "font-size:0.82em;color:var(--text-muted);" }
          });
        }
      } catch (launcherError) {
        launcherMount.createEl("div", {
          text: "워크스페이스 런처를 표시하지 못했습니다.",
          attr: { style: "font-size:0.82em;color:var(--text-error);" }
        });
        if (window.prodigyDebugMode) {
          launcherMount.createEl("div", {
            text: String(launcherError.message || launcherError),
            attr: { style: "font-size:0.75em;color:var(--text-muted);" }
          });
        }
      }
    });

    // ── 8. System Status (tiny, no diagnostics) ──
    safeRenderRegion("System Status", () => {
      const status = lower.createEl("div", {
        attr: { class: "home-card home-system-status emphasis-secondary" }
      });
      status.createEl("div", {
        text: "시스템 상태",
        attr: { class: "home-header", style: "font-size:0.9em;margin-bottom:8px;" }
      });
      const engineHealthy = !(briefContext && briefContext.engine_ok === false);
      const warnings = Array.isArray(pkg.warnings) ? pkg.warnings : [];
      const syncHealthy = !warnings.some((w) => /todoist|sync|fetch failed/i.test(String(w)));
      const reviewPending = Array.isArray(pkg.context && pkg.context.review_inbox)
        ? pkg.context.review_inbox.length
        : 0;

      const row = status.createEl("div", {
        attr: {
          style: "display:flex;flex-wrap:wrap;gap:12px 18px;font-size:0.8em;color:var(--text-muted);"
        }
      });
      const pill = (label, value, ok) => {
        const el = row.createEl("div", {
          attr: { style: "display:flex;flex-direction:column;gap:2px;min-width:90px;" }
        });
        el.createEl("span", { text: label, attr: { style: "font-weight:700;color:var(--text-faint);" } });
        el.createEl("span", {
          text: value,
          attr: { style: "font-weight:700;color:" + (ok ? "var(--text-success, var(--text-accent))" : "var(--text-warning, var(--text-muted))") + ";" }
        });
      };
      pill("Object Engine", engineHealthy ? "정상" : "제한", engineHealthy);
      pill("Sync", syncHealthy ? "정상" : "제한", syncHealthy);
      pill("Review Queue", reviewPending + "건 대기", reviewPending === 0);

      // Collapsed lifecycle remains available for debug (not Mission Control primary)
      if (root.ObjectLifecycleCore && root.ObjectLifecycleView) {
        const lifecycleFold = status.createEl("details", {
          attr: { class: "home-lifecycle-fold", style: "margin-top:10px;" }
        });
        lifecycleFold.createEl("summary", {
          text: "객체 라이프사이클 · 접힘 (주의 요약)"
        });
        const lifecycleCard = lifecycleFold.createEl("div", {
          attr: { class: "home-card emphasis-secondary" }
        });
        try {
          const lifecycleObjects = [];
          const pushAll = (list) => { (list || []).forEach((item) => lifecycleObjects.push(item)); };
          pushAll((pkg.context && pkg.context.projects) || []);
          pushAll((pkg.context && pkg.context.auctions) || []);
          pushAll((pkg.context && pkg.context.reading) || []);
          let journalSignal = null;
          if (root.JournalStore && root.JournalCore) {
            // status already loaded earlier for ops; keep lightweight
            if (journalStatusForOps && journalStatusForOps.status && journalStatusForOps.status !== "complete") {
              journalSignal = {
                missingReflection: true,
                reason: journalStatusForOps.status === "empty"
                  ? "성찰이 작성되지 않았습니다."
                  : "저널 성찰이 미완료입니다."
              };
            }
          }
          const attention = root.ObjectLifecycleCore.summarizeAttention(lifecycleObjects, {
            journal: journalSignal
          });
          root.ObjectLifecycleView.renderHomeCard({
            app,
            container: lifecycleCard,
            items: attention
          });
        } catch (_lc) {
          lifecycleCard.createEl("div", {
            text: "라이프사이클 요약을 표시하지 못했습니다.",
            attr: { style: "font-size:0.8em;color:var(--text-muted);" }
          });
        }
      }
    });
  }

  const api = {
    renderHome,
    generateMorningBrief,
    getSourceTypeLabel,
    getEvidenceSourceLabel
  };

  root.HomeView = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
