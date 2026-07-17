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
        .prodigy-home.home-wide .home-grid { grid-template-columns: repeat(12, 1fr); }
        .prodigy-home.home-wide .col-span-8 { grid-column: span 8; }
        .prodigy-home.home-wide .col-span-4 { grid-column: span 4; }
        .prodigy-home.home-wide .col-span-12 { grid-column: span 12; }
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
        .action-btn {
          min-height: 0;
          height: auto;
          font-size: 0.7em;
          padding: 1px 6px;
          border-radius: 4px;
          border: 1px solid var(--background-modifier-border);
          background: var(--background-primary);
          color: var(--text-normal);
          cursor: pointer;
          font-weight: 600;
          line-height: 1.15;
          transition: background-color 0.15s ease, border-color 0.15s ease, transform 0.15s ease;
        }
        .action-btn:hover {
          background: var(--background-modifier-hover);
        }
        .action-btn:active { transform: translateY(1px); }
        .action-btn:focus-visible { outline: 2px solid var(--text-accent); outline-offset: 2px; }
        .prodigy-home button.action-btn-primary {
          background: var(--interactive-accent) !important;
          color: var(--text-on-accent) !important;
          border-color: var(--interactive-accent) !important;
        }
        .prodigy-home button.action-btn-primary:hover {
          background: var(--interactive-accent-hover) !important;
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
    leftTitle.createEl("h2", { text: `☀️ 오늘의 운영 (${todayStr})`, attr: { style: "margin:0;" } });
    leftTitle.createEl("span", { text: `${pkg.day_of_week || ""} · ${greeting}`, attr: { style: "font-size: 0.85em; color: var(--text-muted);" } });

    const rightActions = titleRow.createEl("div", { attr: { class: "home-toolbar" } });
    
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

    // Main Grid Layout
    const grid = container.createEl("div", { attr: { class: "home-grid" } });

    // LEFT COLUMN (Brief, Principle, Focus, Risk, Continue)
    const leftCol = grid.createEl("div", { attr: { class: "col-span-8 home-column" } });
    const rightCol = grid.createEl("div", { attr: { class: "col-span-4 home-column" } });
    const focusMount = leftCol.createEl("div");

    // 1. Morning Brief Card
    const briefCard = leftCol.createEl("div", { attr: { class: `home-card ${isMorning ? "emphasis-primary" : "emphasis-secondary"}` } });
    const briefHead = briefCard.createEl("div", { attr: { class: "home-header" } });
    briefHead.createEl("span", { text: "✉️ 아침 브리핑" });
    const briefMode = result.brief_mode || result.principle?.source || "";
    if (briefMode === "rule_based" || briefMode === "fallback" || String(result.result_id || "").includes("rule-based") || String(result.result_id || "").includes("fallback")) {
      briefHead.createEl("span", {
        text: "규칙 기반",
        attr: { class: "badge badge-gray", style: "margin-left:auto;font-size:0.65em;" }
      });
    }
    briefCard.createEl("p", { 
      text: result.brief || "기본 우선순위 기준으로 정리했습니다.", 
      attr: { style: "font-size:0.92em; line-height: 1.6; color: var(--text-normal); margin: 0 0 10px 0; white-space: pre-wrap;" } 
    });

    // 1b. Yesterday recovery (change + next_experiment) — closes Daily Reflection → Morning Brief
    const yesterdayReview = (pkg.context && pkg.context.yesterday_review) || null;
    const yChange = yesterdayReview && String(yesterdayReview.change || "").trim();
    const yNext = yesterdayReview && String(yesterdayReview.next_experiment || "").trim();
    if (yChange || yNext) {
      const yBox = briefCard.createEl("div", {
        attr: {
          class: "home-yesterday-review",
          style: "margin: 8px 0 4px 0; padding: 8px 10px; border-radius: 6px; background: var(--background-primary); border: 1px solid var(--background-modifier-border); font-size: 0.84em; line-height: 1.45;"
        }
      });
      const yHead = yBox.createEl("div", {
        attr: { style: "display:flex; align-items:center; gap:8px; margin-bottom:6px;" }
      });
      yHead.createEl("strong", {
        text: `어제 회수 · ${yesterdayReview.date || ""}`,
        attr: { style: "color: var(--text-accent); font-size: 0.95em;" }
      });
      if (yChange) {
        const row = yBox.createEl("div", { attr: { style: "margin-top: 2px;" } });
        row.createEl("span", { text: "변화: ", attr: { style: "color: var(--text-muted);" } });
        row.createEl("span", { text: yChange });
      }
      if (yNext) {
        const row = yBox.createEl("div", { attr: { style: "margin-top: 2px;" } });
        row.createEl("span", { text: "다음 실험: ", attr: { style: "color: var(--text-muted);" } });
        row.createEl("span", { text: yNext });
      }
      const openYBtn = yBox.createEl("button", {
        text: "어제 저널 열기",
        attr: {
          class: "action-btn",
          style: "margin-top: 8px; font-size: 0.85em; padding: 4px 10px;"
        }
      });
      openYBtn.onclick = () => {
        const path = yesterdayReview.path || `DAILY/DAILY/${yesterdayReview.date}.md`;
        app.workspace.openLinkText(path, path, false);
      };
    }

    // 2. Today's Principle
    if (result.principle && result.principle.label) {
      const principleDiv = briefCard.createEl("div", {
        attr: { style: "background: var(--background-primary); border-left: 3px solid var(--text-accent); padding: 8px 12px; border-radius: 0 6px 6px 0; font-size: 0.88em; margin-top: 10px;" }
      });
      principleDiv.createEl("strong", { text: "오늘의 원칙: ", attr: { style: "color: var(--text-accent);" } });
      principleDiv.createEl("span", { text: result.principle.label });
      
      if (window.prodigyDebugMode) {
        const srcLabel = result.principle.source === "validated" ? "PRE 검증됨" : (result.principle.source === "suggested" ? "PRE 제안 (미승인)" : "기본 원칙");
        principleDiv.createEl("div", { 
          text: `[Debug Mode] Source: ${srcLabel} · ${result.principle.reason || ""}`, 
          attr: { style: "font-size: 0.78em; color: var(--text-muted); margin-top: 4px;" } 
        });
      }
    }

    // 3. Evening Only: Reflection Reminder Card (prominent Callout)
    if (isEvening) {
      const reflectionCard = leftCol.createEl("div", { 
        attr: { class: "home-card emphasis-primary", style: "border-left: 4px solid var(--text-accent);" } 
      });
      reflectionCard.createEl("div", { text: "🔁 Evening Reflection Reminder", attr: { class: "home-header" } });
      reflectionCard.createEl("p", {
        text: "오늘 하루 있었던 일을 성찰하고 배운 점을 데일리 저널에 기록하여 마감할 시간입니다.",
        attr: { style: "font-size: 0.9em; color: var(--text-normal); margin: 0 0 12px 0;" }
      });
      const openJournalBtn = reflectionCard.createEl("button", { 
        text: "오늘의 데일리 저널 작성하기", 
        attr: { class: "action-btn action-btn-primary", style: "font-size:0.85em; padding: 6px 12px;" } 
      });
      openJournalBtn.onclick = async () => {
        const dailyPath = `DAILY/DAILY/${todayStr}.md`;
        let file = app.vault.getAbstractFileByPath(dailyPath);
        if (!file) {
          const templateFile = app.vault.getAbstractFileByPath("SYSTEM/TEMPLATE/FORMAT/template_daily_note.md");
          let templateContent = "";
          if (templateFile) {
            templateContent = await app.vault.read(templateFile);
            templateContent = templateContent.replace(/{{date}}/g, todayStr).replace(/{{title}}/g, todayStr);
          }
          file = await app.vault.create(dailyPath, templateContent);
        }
        app.workspace.openLinkText(file.path, file.path, false);
      };
    }

    // Deterministic Focus Evidence Generator
    function getDeterministicEvidence(item, pkg) {
      const evidence = [];
      const sources = [];

      if (item.source_type === "auction") {
        sources.push("Auction Object");
        const auctions = (pkg.context && pkg.context.auctions) || [];
        const match = auctions.find(a => a.path === item.object_path);
        if (match) {
          if (match.auction_datetime) {
            const days = Math.round((new Date(match.auction_datetime) - new Date(pkg.local_date)) / 86400000);
            evidence.push(`입찰일까지 ${days}일 남음 (${match.auction_datetime})`);
          }
          if (!match.site_visit_date) {
            evidence.push("임장 정보 (현장 방문일) 누락 상태");
          } else {
            evidence.push(`현장 임장일: ${match.site_visit_date}`);
          }
        } else {
          evidence.push("경매 분석 데이터 참조");
        }
      } else if (item.source_type === "project") {
        sources.push("Project Object");
        const projects = (pkg.context && pkg.context.projects) || [];
        const match = projects.find(p => p.path === item.object_path);
        if (match) {
          if (match.due_date) {
            const days = Math.round((new Date(match.due_date) - new Date(pkg.local_date)) / 86400000);
            evidence.push(`마감일까지 ${days}일 남음 (${match.due_date})`);
          }
          if (match.workflow_summary) {
            evidence.push(`진행 상황: ${match.workflow_summary} 단계 완료`);
          }
          if (match.next_action) {
            evidence.push(`다음 행동 기입됨: ${match.next_action}`);
          }
        } else {
          evidence.push("프로젝트 관리 데이터 참조");
        }
      } else if (item.source_type === "health") {
        sources.push("Todoist", "Daily Reflection");
        const todoist = (pkg.context && pkg.context.todoist) || {};
        if (todoist.overdueCount > 0) {
          evidence.push(`Todoist 미완료 지연 태스크 ${todoist.overdueCount}건 존재`);
        }
        if (todoist.todayCount > 0) {
          evidence.push(`Todoist 오늘 마감 태스크 ${todoist.todayCount}건 존재`);
        }
        const reflections = (pkg.context && pkg.context.recent_reflections) || [];
        if (reflections.length > 0) {
          evidence.push("최근 3일 일일 성찰 기록 분석 완료");
        }
      } else if (item.source_type === "review") {
        sources.push("PRE Weekly Review", "Operation Reports");
        const issues = (pkg.context && pkg.context.review_inbox) || [];
        if (issues.length > 0) {
          evidence.push(`Review Inbox 필수 권기 이슈 ${issues.length}건 감지`);
        }
      } else if (item.source_type === "reading") {
        sources.push("Reading Object");
        const readings = (pkg.context && pkg.context.reading) || [];
        const match = readings.find(r => r.path === item.object_path);
        if (match) {
          evidence.push("현재 독서 중인 기록");
        } else {
          evidence.push("독서 활성 상태 확인");
        }
      }

      if (evidence.length === 0) {
        evidence.push("기본 시스템 조건 충족");
      }

      return { evidence, sources };
    }

    // 4. Today's Focus Card
    const focusCard = focusMount.createEl("div", { 
      attr: { class: `home-card ${isMorning || isAfternoon ? "emphasis-primary" : "emphasis-secondary"}` } 
    });

    if (!root.dismissedFocusIds) root.dismissedFocusIds = [];

    const renderFocusItems = () => {
      const baseFocus = (approvedFocus && Array.isArray(approvedFocus.focus))
        ? approvedFocus.focus
        : (result && Array.isArray(result.focus) ? result.focus : []);
      const rankedFocus = root.MorningContextCore.selectFocusItems
        ? root.MorningContextCore.selectFocusItems({
          pinnedFocus,
          focusItems: baseFocus,
          pkg,
          localDate: todayStr
        })
        : baseFocus;
      const rawFocus = rankedFocus.slice();
      const currentFocus = rawFocus.filter(item => item && !root.dismissedFocusIds.includes(item.id));
      const isApproved = !!approvedFocus;
      const isPinned = !!(pinnedFocus && pinnedFocus.focus && pinnedFocus.focus.id);

      focusCard.empty();
      
      const head = focusCard.createEl("div", { attr: { class: "home-header" } });
      head.createEl("span", { text: "🎯 오늘의 집중" });
      if (isPinned) {
        head.createEl("span", {
          text: "고정",
          attr: { class: "badge badge-high", style: "margin-left: auto; font-size: 0.65em;" }
        });
      } else if (isApproved) {
        head.createEl("span", { 
          text: "승인됨", 
          attr: { class: "badge badge-high", style: "margin-left: auto; font-size: 0.65em;" } 
        });
      } else {
        head.createEl("span", { 
          text: "검토안", 
          attr: { class: "badge badge-medium", style: "margin-left: auto; font-size: 0.65em;" } 
        });
      }

      if (currentFocus.length === 0) {
        focusCard.createEl("div", { 
          text: "오늘 해야 할 모든 Focus를 처리했거나 제외했습니다.", 
          attr: { style: "font-size:0.85em; color:var(--text-muted); font-style:italic;" } 
        });
        return;
      }

      const listDiv = focusCard.createEl("div", { attr: { class: "focus-list" } });

      currentFocus.forEach((item, index) => {
        const itemRow = listDiv.createEl("div", {
          attr: { class: "focus-row" }
        });

        const topRow = itemRow.createEl("div", { attr: { class: "focus-top" } });
        
        const titleSpan = topRow.createEl("div", { attr: { class: "focus-title" } });
        if (item.pinned) {
          titleSpan.createEl("span", { text: "📌", attr: { style: "font-size: 0.85em;" } });
        } else if (isApproved) {
          titleSpan.createEl("span", { text: "✅", attr: { style: "font-size: 0.85em;" } });
        } else {
          titleSpan.createEl("span", { text: `${index + 1}.`, attr: { style: "color: var(--text-muted); font-size: 0.85em;" } });
        }

        if (!isApproved && !item.pinned) {
          const editInp = topRow.createEl("input", {
            type: "text",
            value: item.label,
            attr: { class: "input-text" }
          });
          editInp.onchange = () => {
            item.label = editInp.value;
          };
        } else {
          if (item.object_path) {
            const linkA = titleSpan.createEl("a", {
              text: item.label,
              attr: { class: "internal-link", style: "cursor: pointer; text-decoration: underline; color: var(--text-accent);" }
            });
            linkA.onclick = (e) => {
              e.preventDefault();
              app.workspace.openLinkText(item.object_path, item.object_path, false);
            };
          } else {
            titleSpan.createEl("span", { text: item.label });
          }
        }

        const badgeClass = item.urgency === "high" ? "badge-high" : (item.urgency === "medium" ? "badge-medium" : "badge-low");
        topRow.createEl("span", { text: getSourceTypeLabel(item.source_type), attr: { class: `badge ${badgeClass}` } });
        if (item.source_type === "project") {
          const projects = (pkg.context && pkg.context.projects) || [];
          const match = projects.find((p) => p.path === item.object_path);
          const pType = match && match.project_type;
          const pLabel = pType === "business" ? "사업" : pType === "work" ? "회사" : pType === "personal" ? "개인" : "";
          if (pLabel) topRow.createEl("span", { text: pLabel, attr: { class: "badge badge-gray" } });
        }

        itemRow.createEl("div", { 
          text: item.reason, 
          attr: { class: "focus-reason" } 
        });

        // 1. Explainable Focus (Details / Summary)
        const explanation = getDeterministicEvidence(item, pkg);
        const details = itemRow.createEl("details", {
          attr: { class: "focus-details" }
        });
        details.createEl("summary", {
          text: "왜 추천되었나요?"
        });
        
        const detailsContent = details.createEl("div", {
          attr: { class: "focus-evidence" }
        });
        
        detailsContent.createEl("strong", { text: "근거", attr: { style: "color: var(--text-normal); font-size: 0.9em; margin-bottom: 2px;" } });
        explanation.evidence.forEach(ev => {
          detailsContent.createEl("div", { text: `✓ ${ev}` });
        });

        // 2. Interactive Trust Panel
        const trustDiv = detailsContent.createEl("div", {
          attr: { style: "border-top: 1px solid var(--background-modifier-border); padding-top: 6px; margin-top: 6px; font-size: 0.9em; display:flex; align-items:center; gap:6px; flex-wrap:wrap;" }
        });
        trustDiv.createEl("strong", { text: "근거 출처: ", attr: { style: "color: var(--text-normal);" } });
        
        explanation.sources.forEach(src => {
          const srcBtn = trustDiv.createEl("span", { 
            text: getEvidenceSourceLabel(src), 
            attr: { class: "badge badge-gray", style: "cursor:pointer; text-decoration:underline;" } 
          });
          srcBtn.onclick = () => {
            if (src.includes("Object") && item.object_path) {
              app.workspace.openLinkText(item.object_path, item.object_path, false);
            } else if (src === "Todoist") {
              window.open("todoist://");
            } else if (src.includes("Review") || src === "PRE") {
              const path = `SYSTEM/AI/Skills/prodigy-review/runs/${weekId}/weekly-workspace-view-${weekId}.md`;
              app.workspace.openLinkText(path, path, false);
            } else if (src === "Daily Reflection" && pkg.context.recent_reflections && pkg.context.recent_reflections[0]) {
              const path = pkg.context.recent_reflections[0].path;
              app.workspace.openLinkText(path, path, false);
            }
          };
        });

        // Action panel inside each card
        const btnRow = itemRow.createEl("div", { attr: { class: "focus-actions" } });

        if (item.object_path) {
          const openObjBtn = btnRow.createEl("button", { text: "원본 열기", attr: { class: "action-btn" } });
          openObjBtn.onclick = () => app.workspace.openLinkText(item.object_path, item.object_path, false);
        }

        // Open Dashboard button (Context -> Action -> Workspace)
        let dashPath = "";
        if (item.source_type === "auction") dashPath = "HUB/10 Auction.md";
        if (item.source_type === "project") dashPath = "HUB/40 Project.md";
        if (item.source_type === "reading") dashPath = "HUB/20 Reading.md";
        if (item.source_type === "workout") dashPath = "HUB/30 Workout.md";
        
        if (dashPath) {
          const openDashBtn = btnRow.createEl("button", { text: "작업 열기", attr: { class: "action-btn action-btn-primary" } });
          openDashBtn.onclick = () => app.workspace.openLinkText(dashPath, dashPath, false);
        }

        const pinBtn = btnRow.createEl("button", {
          text: item.pinned ? "고정 해제" : "오늘 고정",
          attr: { class: item.pinned ? "action-btn" : "action-btn action-btn-primary" }
        });
        pinBtn.onclick = async () => {
          try {
            if (item.pinned) {
              await root.MorningCache.clearPinnedFocus(app, todayStr);
              pinnedFocus = null;
              new Notice("Focus 고정을 해제했습니다.");
            } else {
              pinnedFocus = await root.MorningCache.savePinnedFocus(app, todayStr, item);
              new Notice(`'${item.label}'을(를) 오늘의 Focus로 고정했습니다.`);
            }
            renderFocusItems();
          } catch (error) {
            new Notice(error.message || String(error));
          }
        };

        const dismissBtn = btnRow.createEl("button", { text: "오늘 숨기기", attr: { class: "action-btn" } });
        dismissBtn.onclick = () => {
          root.dismissedFocusIds.push(item.id);
          new Notice(`'${item.label}' 항목을 오늘 하루 숨겼습니다.`);
          renderFocusItems();
        };

        if (!isApproved && !item.pinned) {
          const deleteLink = btnRow.createEl("button", { 
            text: "제외", 
            attr: { class: "action-btn", style: "color: var(--text-error);" } 
          });
          deleteLink.onclick = () => {
            const sourceList = (approvedFocus && Array.isArray(approvedFocus.focus))
              ? approvedFocus.focus
              : (result && Array.isArray(result.focus) ? result.focus : []);
            const idx = sourceList.findIndex((f) => f && f.id === item.id);
            if (idx >= 0) sourceList.splice(idx, 1);
            renderFocusItems();
          };
        }
      });

      const actionsDiv = focusCard.createEl("div", { attr: { class: "focus-footer" } });

      if (isPinned) {
        const clearPin = actionsDiv.createEl("button", { text: "고정 해제", attr: { class: "action-btn" } });
        clearPin.onclick = async () => {
          await root.MorningCache.clearPinnedFocus(app, todayStr);
          pinnedFocus = null;
          renderFocusItems();
        };
      }
      
      if (isApproved) {
        const revertBtn = actionsDiv.createEl("button", { text: "수정하기", attr: { class: "action-btn" } });
        revertBtn.onclick = async () => {
          await root.MorningCache.clearApprovedFocus(app, todayStr);
          approvedFocus = null;
          root.dismissedFocusIds = [];
          renderFocusItems();
        };
      } else {
        const addBtn = actionsDiv.createEl("button", { text: "집중 항목 추가", attr: { class: "action-btn" } });
        addBtn.onclick = () => {
          const sourceList = (result && Array.isArray(result.focus)) ? result.focus : [];
          if (sourceList.length >= 3) {
            new Notice("Focus 항목은 최대 3개까지만 등록할 수 있습니다.");
            return;
          }
          sourceList.push({
            id: `focus_manual_${Date.now()}`,
            label: "직접 기입한 목표",
            reason: "사용자가 수동으로 설정한 오늘의 주요 지향점입니다.",
            source_type: "health",
            urgency: "medium"
          });
          if (result) result.focus = sourceList;
          renderFocusItems();
        };

        const approveBtn = actionsDiv.createEl("button", { text: "승인", attr: { class: "action-btn action-btn-primary" } });
        approveBtn.onclick = async () => {
          const sourceList = (result && Array.isArray(result.focus)) ? result.focus : [];
          if (sourceList.length === 0 && !(pinnedFocus && pinnedFocus.focus)) {
            new Notice("최소 1개 이상의 Focus 항목이 필요합니다.");
            return;
          }
          let isEdited = false;
          sourceList.forEach((item, index) => {
            const original = (cached && cached.result && Array.isArray(cached.result.focus)) ? cached.result.focus[index] : null;
            if (!original || original.label !== item.label) isEdited = true;
          });
          
          approvedFocus = await root.MorningCache.saveApprovedFocus(app, todayStr, sourceList, isEdited);
          new Notice("오늘의 Focus가 승인되어 반영되었습니다!");
          renderFocusItems();
        };
      }
    };

    renderFocusItems();

    // 4a. Object Lifecycle attention summary (deterministic, never stored)
    const lifecycleCard = leftCol.createEl("div", {
      attr: { class: `home-card ${isMorning || isAfternoon ? "emphasis-primary" : "emphasis-secondary"}` }
    });
    try {
      if (root.ObjectLifecycleCore && root.ObjectLifecycleView) {
        const lifecycleObjects = [];
        const pushAll = (list) => {
          (list || []).forEach((item) => lifecycleObjects.push(item));
        };
        pushAll((pkg.context && pkg.context.projects) || []);
        pushAll((pkg.context && pkg.context.auctions) || []);
        pushAll((pkg.context && pkg.context.reading) || []);

        let journalSignal = null;
        if (root.JournalStore && root.JournalCore) {
          try {
            const review = await root.JournalStore.loadReview(app, todayStr);
            if (review && review.status !== "complete") {
              journalSignal = {
                missingReflection: true,
                reason: review.status === "empty"
                  ? "Reflection missing."
                  : "Journal review incomplete."
              };
            }
          } catch (_journalError) {
            journalSignal = null;
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
      } else {
        lifecycleCard.createEl("div", {
          text: "Object Lifecycle 모듈을 불러오지 못했습니다.",
          attr: { style: "font-size:0.85em;color:var(--text-muted);" }
        });
      }
    } catch (lifecycleError) {
      lifecycleCard.createEl("div", {
        text: "Object Lifecycle 요약을 표시하지 못했습니다.",
        attr: { style: "font-size:0.85em;color:var(--text-error);" }
      });
      if (window.prodigyDebugMode) {
        lifecycleCard.createEl("div", {
          text: String(lifecycleError.message || lifecycleError),
          attr: { style: "font-size:0.75em;color:var(--text-muted);" }
        });
      }
    }

    // 4b. Today's Actions — direct executable items (max 3) + journal/reading/workout/auction blocked
    const actionsCard = leftCol.createEl("div", {
      attr: { class: `home-card ${isMorning || isAfternoon ? "emphasis-primary" : "emphasis-secondary"}` }
    });
    actionsCard.createEl("div", { text: "⚡ 오늘의 행동", attr: { class: "home-header" } });

    const safeRenderRegion = (label, renderFn) => {
      try {
        return renderFn();
      } catch (error) {
        const err = actionsCard.createEl("div", {
          text: `${label} 영역을 표시하지 못했습니다.`,
          attr: { style: "font-size:0.82em;color:var(--text-error);margin:6px 0;" }
        });
        if (window.prodigyDebugMode) {
          err.createEl("div", { text: String(error.message || error), attr: { style: "font-size:0.75em;color:var(--text-muted);" } });
        }
        return null;
      }
    };

    safeRenderRegion("오늘의 행동", () => {
      const actionItems = [];
      const focusSource = root.MorningContextCore.selectFocusItems
        ? root.MorningContextCore.selectFocusItems({
          pinnedFocus,
          focusItems: (approvedFocus && Array.isArray(approvedFocus.focus))
            ? approvedFocus.focus
            : (Array.isArray(result.focus) ? result.focus : []),
          pkg,
          localDate: todayStr
        })
        : ((approvedFocus && Array.isArray(approvedFocus.focus))
          ? approvedFocus.focus
          : (Array.isArray(result.focus) ? result.focus : []));
      focusSource.slice(0, 3).forEach((item) => {
        if (!item) return;
        actionItems.push({
          label: item.label,
          detail: item.next_action || item.reason || "",
          path: item.object_path || "",
          workspace: item.source_type === "auction" ? "HUB/10 Auction.md"
            : item.source_type === "reading" ? "HUB/20 Reading.md"
            : item.source_type === "workout" ? "HUB/30 Workout.md"
            : item.source_type === "project" ? "HUB/40 Project.md"
            : "",
          badge: getSourceTypeLabel(item.source_type)
        });
      });

      // Ensure reading appears if active.
      const readings = (pkg.context && pkg.context.reading) || [];
      const activeReading = readings.find((item) => item.status === "reading");
      if (activeReading && !actionItems.some((item) => item.path === activeReading.path) && actionItems.length < 3) {
        actionItems.push({
          label: `${activeReading.name || activeReading.title || "읽는 중"} 오늘 읽기`,
          detail: activeReading.next_action || "Reading Session 기록",
          path: activeReading.path,
          workspace: "HUB/20 Reading.md",
          badge: "독서"
        });
      }

      if (!actionItems.length) {
        actionsCard.createEl("div", {
          text: "오늘 바로 실행할 항목이 없습니다. 워크스페이스에서 다음 행동을 설정하세요.",
          attr: { style: "font-size:0.85em;color:var(--text-muted);font-style:italic;" }
        });
      } else {
        actionItems.slice(0, 3).forEach((item) => {
          const row = actionsCard.createEl("div", {
            attr: { style: "padding:10px 0;border-top:1px solid var(--background-modifier-border);display:flex;flex-direction:column;gap:6px;" }
          });
          const top = row.createEl("div", { attr: { style: "display:flex;gap:8px;align-items:center;flex-wrap:wrap;" } });
          top.createEl("strong", { text: item.label, attr: { style: "overflow-wrap:anywhere;" } });
          top.createEl("span", { text: item.badge, attr: { class: "badge badge-gray" } });
          if (item.detail) {
            row.createEl("div", {
              text: item.detail,
              attr: { style: "font-size:0.82em;color:var(--text-muted);overflow-wrap:anywhere;" }
            });
          }
          const btns = row.createEl("div", { attr: { style: "display:flex;gap:8px;flex-wrap:wrap;" } });
          if (item.path) {
            const open = btns.createEl("button", { text: "바로 열기", attr: { class: "action-btn action-btn-primary" } });
            open.onclick = () => app.workspace.openLinkText(item.path, item.path, false);
          }
          if (item.workspace) {
            const dash = btns.createEl("button", { text: "Workspace", attr: { class: "action-btn" } });
            dash.onclick = () => app.workspace.openLinkText(item.workspace, item.workspace, false);
          }
        });
      }
    });

    safeRenderRegion("Journal Review", () => {
      const journalBox = actionsCard.createEl("div", {
        attr: { style: "margin-top:12px;padding-top:12px;border-top:1px solid var(--background-modifier-border);" }
      });
      journalBox.createEl("div", {
        text: "📝 Journal Review",
        attr: { style: "font-weight:700;margin-bottom:6px;" }
      });

      let statusLabel = "Review 미작성";
      let status = "empty";
      let fields = { reflection: "", change: "", next_experiment: "" };
      if (root.JournalCore && root.JournalStore) {
        // synchronous status from cache if available; async refresh below
        statusLabel = "상태 확인 중...";
      }
      const statusEl = journalBox.createEl("div", {
        text: statusLabel,
        attr: { style: "font-size:0.84em;color:var(--text-muted);margin-bottom:8px;" }
      });
      const jActions = journalBox.createEl("div", { attr: { style: "display:flex;gap:8px;flex-wrap:wrap;" } });
      const reviewBtn = jActions.createEl("button", { text: "2분 Review", attr: { class: "action-btn action-btn-primary" } });
      const openJournal = jActions.createEl("button", { text: "저널 Workspace", attr: { class: "action-btn" } });
      openJournal.onclick = () => app.workspace.openLinkText("HUB/70 Journal.md", "HUB/70 Journal.md", false);

      const refreshJournalStatus = async () => {
        if (!root.JournalStore) {
          statusEl.setText("Journal 모듈이 로드되지 않았습니다. 저널 Workspace를 이용하세요.");
          return;
        }
        const review = await root.JournalStore.loadReview(app, todayStr);
        status = review.status;
        fields = review.fields;
        statusLabel = status === "complete" ? "Review 완료" : status === "partial" ? "Review 작성 중" : "Review 미작성";
        statusEl.setText(statusLabel);
        reviewBtn.setText(status === "empty" ? "2분 Review" : "Review 수정");
      };
      refreshJournalStatus().catch(() => {
        statusEl.setText("Review 상태를 확인하지 못했습니다.");
      });

      reviewBtn.onclick = async () => {
        if (!root.JournalView || !root.JournalStore) {
          app.workspace.openLinkText("HUB/70 Journal.md", "HUB/70 Journal.md", false);
          return;
        }
        const review = await root.JournalStore.loadReview(app, todayStr);
        root.JournalView.openReviewModal(app, review.fields, async (values) => {
          await root.JournalStore.saveReview(app, todayStr, values);
          if (window.Notice) new Notice("오늘 Review를 저장했습니다.");
          await refreshJournalStatus();
        });
      };
    });

    safeRenderRegion("Reading 연결", () => {
      const readings = (pkg.context && pkg.context.reading) || [];
      const activeReading = readings.find((item) => item.status === "reading");
      if (!activeReading) return;
      const box = actionsCard.createEl("div", {
        attr: { style: "margin-top:12px;padding-top:12px;border-top:1px solid var(--background-modifier-border);" }
      });
      box.createEl("div", { text: "📚 오늘 읽기", attr: { style: "font-weight:700;margin-bottom:4px;" } });
      box.createEl("div", {
        text: activeReading.name || activeReading.title || "읽는 중",
        attr: { style: "font-size:0.9em;overflow-wrap:anywhere;" }
      });
      if (activeReading.progress != null) {
        box.createEl("div", {
          text: `진행: ${activeReading.progress}`,
          attr: { style: "font-size:0.8em;color:var(--text-muted);margin-top:2px;" }
        });
      }
      const row = box.createEl("div", { attr: { style: "display:flex;gap:8px;flex-wrap:wrap;margin-top:8px;" } });
      const openBook = row.createEl("button", { text: "책 열기", attr: { class: "action-btn" } });
      openBook.onclick = () => app.workspace.openLinkText(activeReading.path, activeReading.path, false);
      const openReading = row.createEl("button", { text: "오늘 읽기", attr: { class: "action-btn action-btn-primary" } });
      openReading.onclick = () => app.workspace.openLinkText("HUB/20 Reading.md", "HUB/20 Reading.md", false);
    });

    safeRenderRegion("Workout 연결", () => {
      const box = actionsCard.createEl("div", {
        attr: { style: "margin-top:12px;padding-top:12px;border-top:1px solid var(--background-modifier-border);" }
      });
      box.createEl("div", { text: "💪 Workout", attr: { style: "font-weight:700;margin-bottom:6px;" } });
      const start = box.createEl("button", { text: "오늘 운동 시작", attr: { class: "action-btn action-btn-primary" } });
      start.onclick = () => app.workspace.openLinkText("HUB/30 Workout.md", "HUB/30 Workout.md", false);
    });

    safeRenderRegion("Auction Blocked", () => {
      const auctions = (pkg.context && pkg.context.auctions) || [];
      const blocked = auctions.filter((item) => {
        const active = ["watching", "bidding", "reviewing"].includes(item.status);
        const missing = !item.next_action || item.next_action === "정보 없음";
        return active && missing;
      });
      if (!blocked.length) return;
      const box = actionsCard.createEl("div", {
        attr: { style: "margin-top:12px;padding-top:12px;border-top:1px solid var(--background-modifier-border);" }
      });
      box.createEl("div", {
        text: `⚠️ 다음 행동이 없는 경매 물건 ${blocked.length}건`,
        attr: { style: "font-weight:700;color:var(--text-error);margin-bottom:6px;" }
      });
      const open = box.createEl("button", { text: "경매 Workspace 열기", attr: { class: "action-btn" } });
      open.onclick = () => app.workspace.openLinkText("HUB/10 Auction.md", "HUB/10 Auction.md", false);
    });

    // 5. Today's Risk Card (with Explainable Risks)
    const risks = pkg.context.risks || [];
    if (risks.length > 0) {
      const riskCard = rightCol.createEl("div", { 
        attr: { class: `home-card emphasis-risk` } 
      });
      const rHead = riskCard.createEl("div", { attr: { class: "home-header", style: "color: var(--text-error);" } });
      rHead.createEl("span", { text: "⚠️ 오늘의 위험" });
      
      const rList = riskCard.createEl("div", { attr: { style: "display:flex; flex-direction:column; gap:8px;" } });
      risks.forEach((risk, rIdx) => {
        const rItem = rList.createEl("div", {
          attr: { style: "font-size: 0.85em; display:flex; flex-direction:column; gap:4px; padding: 10px 0; border-top: 1px solid var(--background-modifier-border);" }
        });
        
        const topRow = rItem.createEl("div", { attr: { style: "display:flex; justify-content:space-between; align-items:center;" } });
        topRow.createEl("strong", { text: risk.label, attr: { style: "color:var(--text-error);" } });
        
        const linkRow = topRow.createEl("div", { attr: { style: "display:flex; gap:6px; align-items:center;" } });
        
        if (risk.object_path) {
          const lnk = linkRow.createEl("button", { text: "원본 열기", attr: { class: "action-btn" } });
          lnk.onclick = () => app.workspace.openLinkText(risk.object_path, risk.object_path, false);
        }

        // Explainable Risk Expand Details
        const rDetails = rItem.createEl("details", {
          attr: { style: "margin-top: 4px; font-size: 0.85em; color: var(--text-muted);" }
        });
        rDetails.createEl("summary", {
          text: "[왜 리스크인가요?]",
          attr: { style: "cursor: pointer; color: var(--text-error); font-weight: bold; outline: none; margin-bottom: 2px;" }
        });
        
        const rDetailsContent = rDetails.createEl("div", {
          attr: { style: "background: var(--background-secondary); border-radius: 4px; padding: 6px; display: flex; flex-direction: column; gap: 2px; margin-top:4px;" }
        });
        
        if (Array.isArray(risk.evidence)) {
          risk.evidence.forEach(ev => {
            rDetailsContent.createEl("div", { text: `✓ ${ev}` });
          });
        }
        
        if (Array.isArray(risk.sources)) {
          const rSourcesDiv = rDetailsContent.createEl("div", {
            attr: { style: "border-top: 1px solid var(--background-modifier-border); padding-top: 4px; margin-top: 4px; font-size: 0.9em; display:flex; align-items:center; gap:4px;" }
          });
          rSourcesDiv.createEl("strong", { text: "출처: " });
          
          risk.sources.forEach(src => {
            const rSrcBtn = rSourcesDiv.createEl("span", { 
              text: getEvidenceSourceLabel(src), 
              attr: { class: "badge badge-gray", style: "cursor:pointer; text-decoration:underline;" } 
            });
            rSrcBtn.onclick = () => {
              if (src.includes("Object") && risk.object_path) {
                app.workspace.openLinkText(risk.object_path, risk.object_path, false);
              } else if (src === "Todoist") {
                window.open("todoist://");
              }
            };
          });
        }

        const riskReason = String(risk.reason || "").replace(/\s*\(site_visit_date\)/g, "");
        rItem.createEl("span", { text: riskReason, attr: { style: "color:var(--text-normal); font-size:0.95em; margin-top:4px;" } });
      });
    }

    // 6. Continue Candidates Card (Doing -> Has Next Action -> Recent Active -> Due Soon)
    const continueCard = leftCol.createEl("div", { 
      attr: { class: `home-card ${isAfternoon ? "emphasis-primary" : "emphasis-secondary"}` } 
    });
    continueCard.createEl("div", { text: "▶ 이어서 하기", attr: { class: "home-header" } });
    
    const candidates = pkg.context.continue_candidates || [];
    if (candidates.length > 0) {
      const cGrid = continueCard.createEl("div", { attr: { class: "continue-list" } });
      candidates.forEach(c => {
        const cBox = cGrid.createEl("div", {
          attr: { class: "continue-row" }
        });
        
        cBox.onclick = () => {
          app.workspace.openLinkText(c.path, c.path, false);
        };
        
        const leftMeta = cBox.createEl("div", { attr: { style: "display:flex; flex-direction:column; gap:2px; flex-grow:1; overflow:hidden;" } });
        
        const registryType = c.type === "auction" ? "auction_case" : c.type;
        const typeInfo = root.prodigyDisplay?.typeInfo ? root.prodigyDisplay.typeInfo(registryType) : { label: c.type, icon: "📝" };
        const labelRow = leftMeta.createEl("div", { attr: { style: "display:flex; align-items:center; gap:6px; flex-wrap:wrap;" } });
        labelRow.createEl("span", { text: `${typeInfo.icon} ${typeInfo.label}`, attr: { class: "badge badge-gray" } });

        if (c.type === "project" || c.type === "project_note" || c.type === "project_family") {
          const pType = String(c.project_type || "").toLowerCase();
          const pLabel = pType === "business" ? "사업"
            : pType === "work" ? "회사"
            : pType === "personal" ? "개인"
            : "미분류";
          labelRow.createEl("span", {
            text: pLabel,
            attr: { class: "badge badge-gray", style: "font-size:0.7em;" }
          });
        }
        
        if (c.due_date) {
          labelRow.createEl("span", { 
            text: `마감: ${c.due_date}`, 
            attr: { class: "badge badge-medium", style: "font-size:0.7em;" } 
          });
        }

        leftMeta.createEl("strong", { 
          text: c.name, 
          attr: { style: "font-size: 0.95em; color: var(--text-normal); overflow-wrap: anywhere; margin-top: 4px;" } 
        });

        if (c.next_action) {
          leftMeta.createEl("div", {
            text: `다음 행동: ${c.next_action}`,
            attr: { style: "font-size:0.8em; color:var(--text-accent); margin-top:2px; font-weight:500;" }
          });
        }

        const navBtn = cBox.createEl("button", { text: "열기", attr: { class: "action-btn" } });
        navBtn.onclick = (e) => {
          e.stopPropagation();
          app.workspace.openLinkText(c.path, c.path, false);
        };
      });
    } else {
      continueCard.createEl("span", { text: "최근 활성화된 실행 대상이 없습니다.", attr: { style: "font-size: 0.85em; color: var(--text-muted); font-style:italic;" } });
    }
    // 1. Execution Status Card (Todoist & Calendar)
    const execCard = rightCol.createEl("div", { 
      attr: { class: `home-card ${isAfternoon ? "emphasis-primary" : "emphasis-secondary"}` } 
    });
    execCard.createEl("div", { text: "📊 실행 현황", attr: { class: "home-header" } });
    
    const todoist = pkg.context.todoist || {};
    const eRow = execCard.createEl("div", { attr: { style: "display:flex; justify-content:space-around; align-items:center; margin-bottom:12px;" } });
    
    const buildStatBox = (parent, label, count, color) => {
      const box = parent.createEl("div", { attr: { style: "display:flex; flex-direction:column; align-items:center; gap:2px;" } });
      box.createEl("span", { text: label, attr: { style: "font-size:0.78em; color:var(--text-muted);" } });
      box.createEl("span", { text: String(count), attr: { style: `font-size: 1.6em; font-weight: bold; color: ${color};` } });
    };

    buildStatBox(eRow, "오늘 마감", todoist.todayCount || 0, "var(--text-accent)");
    buildStatBox(eRow, "지연", todoist.overdueCount || 0, "var(--text-error)");

    const todoBtn = execCard.createEl("button", { 
      text: "Todoist 실행 대기열 열기", 
      attr: { class: "action-btn", style: "width:100%; font-size: 0.8em; margin-top: 8px; text-align:center;" } 
    });
    todoBtn.onclick = () => window.open("todoist://");

    // 2. Review Inbox Card
    const issues = pkg.context.review_inbox || [];
    if (issues.length > 0) {
      const inboxCard = rightCol.createEl("div", { 
        attr: { class: `home-card ${isEvening ? "emphasis-primary" : "emphasis-secondary"}` } 
      });
      inboxCard.createEl("div", { text: "⚠️ 검토함", attr: { class: "home-header" } });
      const iList = inboxCard.createEl("ul", { attr: { style: "font-size: 0.82em; color: var(--text-normal); padding-left: 16px; margin: 0; display:flex; flex-direction:column; gap:6px;" } });
      issues.forEach(issue => {
        iList.createEl("li", { text: issue });
      });
    }

    // 3. Workspace Launcher (Clear, single navigation endpoints)
    const navCard = rightCol.createEl("div", { attr: { class: "home-card" } });
    navCard.createEl("div", { text: "🌐 워크스페이스", attr: { class: "home-header" } });
    const navGrid = navCard.createEl("div", { attr: { class: "workspace-list" } });

    const addLauncher = (parent, label, path, icon) => {
      const box = parent.createEl("div", {
        attr: { class: "workspace-row", role: "button", tabindex: "0" }
      });
      
      const left = box.createEl("div", { attr: { class: "workspace-label" } });
      left.createEl("span", { text: icon });
      left.createEl("strong", { text: label });

      box.createEl("span", { text: "›", attr: { class: "workspace-arrow", "aria-hidden": "true" } });
      
      box.onclick = () => {
        app.workspace.openLinkText(path, path, false);
      };
      box.onkeydown = (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          app.workspace.openLinkText(path, path, false);
        }
      };
    };

    addLauncher(navGrid, "경매", "HUB/10 Auction.md", "🏛");
    addLauncher(navGrid, "프로젝트", "HUB/40 Project.md", "📁");
    addLauncher(navGrid, "독서", "HUB/20 Reading.md", "📚");
    addLauncher(navGrid, "운동", "HUB/30 Workout.md", "🏋");
    addLauncher(navGrid, "저널", "HUB/70 Journal.md", "📅");
    addLauncher(navGrid, "사람", "HUB/60 Personal.md", "👤");
    addLauncher(navGrid, "지식", "HUB/50 Knowledge.md", "🧠");
    addLauncher(navGrid, "받은함", "HUB/Inbox.md", "📥");
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
