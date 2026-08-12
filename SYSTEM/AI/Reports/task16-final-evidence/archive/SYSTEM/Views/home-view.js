(function (root) {
  "use strict";

  const T = root.ProdigyTokens || {};
  const BREAKPOINTS = T.BREAKPOINTS || {};
  const RESPONSIVE_BREAKPOINTS = T.RESPONSIVE_BREAKPOINTS || {};
  const CONTROL_HEIGHTS = T.CONTROL_HEIGHTS || {};
  function ensureHomeAdoptionStyles() {
    if (typeof document === "undefined" || !document.head) return;
    const styleId = "prodigy-home-adoption-styles";
    let style = document.getElementById(styleId);
    if (!style) {
      style = document.createElement("style");
      style.id = styleId;
      document.head.appendChild(style);
    }
    style.textContent = `
      .prodigy-home[data-scroll-owner="home-workspace-body"] {
        min-inline-size: 0;
        word-break: keep-all;
        overflow-wrap: anywhere;
      }
      .prodigy-home .home-view-loading,
      .prodigy-home .home-region-error {
        min-inline-size: 0;
        color: var(--ke-color-muted);
        font-size: var(--ke-type-body, .84rem);
        line-height: var(--ke-leading-body, 1.45);
        overflow-wrap: anywhere;
      }
      .prodigy-home .home-view-loading {
        display: block;
        padding: var(--ke-space-5, 16px);
        text-align: center;
        font-style: italic;
      }
      .prodigy-home .home-title {
        margin: 0;
        min-inline-size: 0;
        font-size: var(--ke-type-title, 1.05rem);
        line-height: var(--ke-leading-body, 1.45);
        overflow-wrap: anywhere;
      }
      .prodigy-home .home-subtitle {
        display: block;
        min-inline-size: 0;
        margin-block-start: var(--ke-space-1, 2px);
        color: var(--ke-color-muted);
        font-size: var(--ke-type-body, .84rem);
        line-height: var(--ke-leading-body, 1.45);
        overflow-wrap: anywhere;
      }
      .prodigy-home .home-brief-kicker {
        margin-inline-start: var(--ke-space-1, 2px);
        color: var(--ke-color-muted);
        font-size: var(--ke-type-label, .72rem);
        font-weight: 600;
        line-height: var(--ke-leading-control, 1.35);
      }
      .prodigy-home .home-brief-text {
        margin: 0 0 var(--ke-space-3, 8px);
        white-space: pre-wrap;
      }
      .prodigy-home .home-brief-context {
        display: flex;
        flex-direction: column;
        gap: var(--ke-space-1, 2px);
        margin-block-start: var(--ke-space-1, 2px);
        font-size: var(--ke-type-body, .84rem);
      }
      .prodigy-home .home-brief-action {
        margin-block-start: var(--ke-space-3, 8px);
      }
      .prodigy-home .home-yesterday-missing,
      .prodigy-home .home-evening-close {
        margin-block-start: var(--ke-space-4, 12px);
        padding-block-start: var(--ke-space-3, 8px);
        border-block-start: var(--ke-border-width, 1px) solid var(--ke-color-border);
        color: var(--ke-color-muted);
        font-size: var(--ke-type-body, .84rem);
        line-height: var(--ke-leading-body, 1.45);
      }
      .prodigy-home .home-yesterday-missing {
        border-block-start-style: dashed;
      }
      .prodigy-home .home-brief-mode {
        margin-inline-start: auto;
      }
      .prodigy-home .home-evening-copy {
        margin-block-end: var(--ke-space-2, 4px);
      }
      .prodigy-home .home-stale-badge {
        margin-inline-start: auto;
        padding: var(--ke-space-1, 2px) var(--ke-space-2, 4px);
        border-radius: var(--ke-radius-control, 4px);
        background: var(--ke-color-hover);
        color: var(--ke-color-accent);
        font-size: var(--ke-type-label, .72rem);
        font-weight: 700;
        line-height: var(--ke-leading-control, 1.35);
        overflow-wrap: anywhere;
      }
      .prodigy-home .home-action-row {
        display: flex;
        align-items: center;
        flex-wrap: wrap;
        gap: var(--ke-space-2, 4px);
        min-inline-size: 0;
      }
      .prodigy-home .home-focus-suggestions-footer {
        border-block-start: 0;
        padding-block-start: 0;
      }
      .prodigy-home .home-focus-suggestion-title {
        color: var(--ke-color-text);
        font-size: var(--ke-type-body, .84rem);
        font-weight: 700;
        margin-block-end: var(--ke-space-2, 4px);
      }
      .prodigy-home .home-focus-suggestion-note {
        margin-block-end: var(--ke-space-3, 8px);
        color: var(--ke-color-muted);
        font-size: var(--ke-type-label, .72rem);
      }
      .prodigy-home .home-focus-reason {
        padding-inline-start: 0;
      }
      .prodigy-home .home-focus-empty-title {
        color: var(--ke-color-text);
        font-size: var(--ke-type-body, .84rem);
        font-weight: 600;
      }
      .prodigy-home .home-focus-empty-note {
        margin-block: var(--ke-space-1, 2px) var(--ke-space-4, 12px);
        color: var(--ke-color-muted);
        font-size: var(--ke-type-body, .84rem);
      }
      .prodigy-home .home-focus-approved {
        margin-inline-start: auto;
      }
      .prodigy-home .home-continue-empty-title {
        color: var(--ke-color-text);
        font-size: var(--ke-type-body, .84rem);
        font-weight: 600;
      }
      .prodigy-home .home-continue-empty-note {
        margin-block-start: var(--ke-space-1, 2px);
        color: var(--ke-color-muted);
        font-size: var(--ke-type-body, .84rem);
        font-style: italic;
      }
      .prodigy-home .home-continue-meta {
        display: flex;
        flex: 1 1 auto;
        flex-direction: column;
        gap: var(--ke-space-1, 2px);
        min-inline-size: 0;
      }
      .prodigy-home .home-continue-workspace {
        color: var(--ke-color-muted);
        font-size: var(--ke-type-label, .72rem);
        font-weight: 700;
      }
      .prodigy-home .home-continue-title {
        font-size: var(--ke-type-body, .84rem);
        overflow-wrap: anywhere;
      }
      .prodigy-home .home-continue-action {
        color: var(--ke-color-accent);
        font-size: var(--ke-type-body, .84rem);
        font-weight: 500;
        overflow-wrap: anywhere;
      }
      .prodigy-home .home-attention-workspace {
        color: var(--ke-color-muted);
        font-size: var(--ke-type-label, .72rem);
        font-weight: 700;
      }
      .prodigy-home .home-attention-title-text {
        color: var(--ke-color-text);
        font-size: var(--ke-type-body, .84rem);
        overflow-wrap: anywhere;
      }
      .prodigy-home .home-attention-badge {
        inline-size: fit-content;
      }
      .prodigy-home .home-attention-reason-label {
        margin-block-end: var(--ke-space-1, 2px);
        color: var(--ke-color-muted);
        font-size: var(--ke-type-label, .72rem);
        font-weight: 700;
      }
      .prodigy-home .home-attention-evidence {
        line-height: var(--ke-leading-body, 1.45);
        overflow-wrap: anywhere;
      }
      .prodigy-home .home-action-row > * {
        min-inline-size: 0;
        max-inline-size: 100%;
        overflow-wrap: anywhere;
      }
      .prodigy-home .home-todoist-label {
        color: var(--ke-color-muted);
        font-size: var(--ke-type-label, .72rem);
        font-weight: 700;
      }
      .prodigy-home .home-todoist-count {
        margin-block-start: var(--ke-space-1, 2px);
        font-size: var(--ke-type-title, 1.05rem);
        font-weight: 800;
      }
      .prodigy-home .home-todoist-overdue {
        margin-block-start: var(--ke-space-1, 2px);
        color: var(--ke-color-error);
        font-size: var(--ke-type-body, .84rem);
        font-weight: 700;
      }
      .prodigy-home .home-todoist-action {
        margin-block-start: var(--ke-space-3, 8px);
      }
      .prodigy-home .home-launcher-status,
      .prodigy-home .home-launcher-error,
      .prodigy-home .home-launcher-details,
      .prodigy-home .home-lifecycle-error {
        min-inline-size: 0;
        overflow-wrap: anywhere;
      }
      .prodigy-home .home-launcher-status {
        color: var(--ke-color-muted);
        font-size: var(--ke-type-label, .72rem);
      }
      .prodigy-home .home-launcher-error,
      .prodigy-home .home-lifecycle-error {
        color: var(--ke-color-error);
        font-size: var(--ke-type-label, .72rem);
      }
      .prodigy-home .home-launcher-details {
        color: var(--ke-color-muted);
        font-size: var(--ke-type-label, .72rem);
      }
      .prodigy-home .home-system-header {
        margin-block-end: var(--ke-space-2, 4px);
        font-size: var(--ke-type-body, .84rem);
      }
      .prodigy-home .home-weekly-draft {
        margin-block-end: var(--ke-space-3, 8px);
        padding: var(--ke-space-3, 8px) var(--ke-space-4, 12px);
        border: var(--ke-border-width, 1px) solid var(--ke-color-border);
        border-radius: var(--ke-radius-panel, 8px);
        background: var(--ke-color-surface);
        min-inline-size: 0;
      }
      .prodigy-home .home-weekly-draft-label {
        margin-block-end: var(--ke-space-1, 2px);
        color: var(--ke-color-accent);
        font-size: var(--ke-type-label, .72rem);
        font-weight: 700;
      }
      .prodigy-home .home-weekly-draft-copy {
        margin-block-end: var(--ke-space-2, 4px);
        color: var(--ke-color-muted);
        font-size: var(--ke-type-label, .72rem);
      }
      .prodigy-home .home-system-metrics {
        display: flex;
        flex-wrap: wrap;
        gap: var(--ke-space-4, 12px);
        color: var(--ke-color-muted);
        font-size: var(--ke-type-label, .72rem);
      }
      .prodigy-home .home-system-pill {
        display: flex;
        flex-direction: column;
        gap: var(--ke-space-1, 2px);
        min-inline-size: 5.5rem;
      }
      .prodigy-home .home-system-pill-label {
        color: var(--ke-color-muted);
        font-weight: 700;
      }
      .prodigy-home .home-system-pill-value {
        font-weight: 700;
      }
      .prodigy-home .home-system-pill-value.is-ok {
        color: var(--ke-color-success);
      }
      .prodigy-home .home-system-pill-value.is-warning {
        color: var(--ke-color-warning);
      }
      .prodigy-home .home-lifecycle-fold {
        margin-block-start: var(--ke-space-3, 8px);
      }
      .prodigy-home .home-attention-row {
        display: flex;
        flex-direction: column;
        gap: var(--ke-space-3, 8px);
        padding-block: var(--ke-space-4, 12px);
        border-block-start: var(--ke-border-width, 1px) solid var(--ke-color-border);
        font-size: var(--ke-type-body, .84rem);
      }
      .prodigy-home .home-attention-list {
        display: flex;
        flex-direction: column;
        gap: var(--ke-space-1, 2px);
      }
      .prodigy-home .home-attention-empty {
        padding-block: var(--ke-space-2, 4px);
        color: var(--ke-color-muted);
        font-size: var(--ke-type-body, .84rem);
        font-style: italic;
        line-height: var(--ke-leading-body, 1.45);
      }
      .prodigy-home .home-attention-header {
        color: var(--ke-color-error);
      }
      .prodigy-home .home-attention-fallback {
        margin-inline-start: var(--ke-space-2, 4px);
      }
      .prodigy-home .home-region-error {
        margin-block: var(--ke-space-2, 4px);
        color: var(--ke-color-error);
      }
      .prodigy-home .home-region-error-details {
        color: var(--ke-color-muted);
        font-size: var(--ke-type-label, .72rem);
      }
      .prodigy-home .home-brief-text {
        min-inline-size: 0;
        color: var(--ke-color-text);
        line-height: var(--ke-leading-body, 1.45);
        overflow-wrap: anywhere;
      }
      .prodigy-home .home-yesterday-review {
        color: var(--ke-color-muted);
        line-height: var(--ke-leading-body, 1.45);
      }
      .prodigy-home .home-yesterday-review > * {
        min-inline-size: 0;
        overflow-wrap: anywhere;
      }
      .prodigy-home .home-attention-top {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        flex-wrap: wrap;
        gap: var(--ke-space-3, 8px);
        min-inline-size: 0;
      }
      .prodigy-home .home-attention-top > * {
        min-inline-size: 0;
      }
      .prodigy-home .home-attention-title {
        display: flex;
        flex: 1 1 auto;
        flex-direction: column;
        gap: var(--ke-space-1, 2px);
        min-inline-size: 0;
      }
      .prodigy-home .home-attention-item {
        min-inline-size: 0;
        overflow-wrap: anywhere;
      }
      @media (max-width: ${Number(RESPONSIVE_BREAKPOINTS.collapsedNavMax)}px) {
        .prodigy-home button {
          min-block-size: var(--ke-touch-target, 44px);
          height: auto;
          padding: var(--ke-space-3, 8px) var(--ke-space-4, 12px);
          font-size: var(--ke-type-body, .84rem);
          line-height: var(--ke-leading-body, 1.45);
          white-space: normal;
        }
      }
      @media (prefers-reduced-motion: reduce) {
        .prodigy-home .home-action-row > *,
        .prodigy-home button,
        .prodigy-home summary {
          transition: none !important;
          animation: none !important;
          transform: none !important;
          scroll-behavior: auto !important;
        }
      }
    `;
  }

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

  async function loadOptionalProdigyScript(app, path, globalKey) {
    if (globalKey && root[globalKey]) return;
    const file = app && app.vault && app.vault.getAbstractFileByPath && app.vault.getAbstractFileByPath(path);
    if (!file) return;
    (new Function(await app.vault.read(file)))();
  }

  async function ensureProdigySettings(app) {
    await loadOptionalProdigyScript(app, "SYSTEM/Views/prodigy-config-service.js", "ProdigyConfigService");
    await loadOptionalProdigyScript(app, "SYSTEM/Views/prodigy-settings-modal.js", "ProdigySettingsModal");
  }

  function resolveViewModule(globalKey, relativePath) {
    if (root[globalKey]) return root[globalKey];
    if (typeof module !== "undefined" && module.exports && typeof require === "function") {
      return require(relativePath);
    }
    return null;
  }

  function disposeHome(container) {
    const controller = resolveViewModule("HomeController", "./home-controller.js");
    if (controller) controller.disposeHome(container);
  }

  // Closed sheet controls must not remain as zero-sized audit and keyboard targets.
  // The shared sheet still owns activation, Escape, and focus return while open.
  function createHomeAdaptiveControls(adaptiveControls) {
    if (!adaptiveControls || typeof adaptiveControls.BottomSheet !== "function") return adaptiveControls;
    return Object.assign({}, adaptiveControls, {
      BottomSheet(parent, options) {
        const sheet = adaptiveControls.BottomSheet(parent, options);
        if (!sheet || !sheet.element || typeof sheet.element.remove !== "function") return sheet;
        const baseOpen = sheet.open.bind(sheet);
        const baseClose = sheet.close.bind(sheet);
        const append = () => {
          if (sheet.element.parentElement || sheet.element.parent) return;
          if (typeof parent.appendChild === "function") parent.appendChild(sheet.element);
          else if (Array.isArray(parent.children)) {
            sheet.element.parent = parent;
            parent.children.push(sheet.element);
          }
        };
        const close = () => {
          baseClose();
          sheet.element.remove();
        };
        sheet.open = (invoker) => {
          append();
          baseOpen(invoker);
        };
        sheet.close = close;
        const controls = typeof sheet.element.querySelectorAll === "function"
          ? Array.from(sheet.element.querySelectorAll(".prodigy-bottom-sheet-backdrop,.prodigy-bottom-sheet-close"))
          : (typeof sheet.element.findAll === "function"
            ? sheet.element.findAll((element) => element.hasClass && (element.hasClass("prodigy-bottom-sheet-backdrop") || element.hasClass("prodigy-bottom-sheet-close")))
            : []);
        controls.forEach((control) => { control.onclick = close; });
        sheet.element.onkeydown = (event) => {
          if (!event || event.key !== "Escape") return;
          if (typeof event.preventDefault === "function") event.preventDefault();
          close();
        };
        sheet.element.remove();
        return sheet;
      }
    });
  }

  async function renderHome(options) {
    const { app, dv, container } = options;
    if (!app || !dv || !container) return;

    const homeModel = resolveViewModule("HomeModel", "./home-model.js");
    const homeController = resolveViewModule("HomeController", "./home-controller.js");
    const homeSections = resolveViewModule("HomeSections", "./home-sections.js");
    if (!homeModel || !homeController || !homeSections) throw new Error("Home modules are unavailable.");

    disposeHome(container);
    const lifecycle = {
      dispose() {
        if (container.__prodigyHomeLifecycle === lifecycle) disposeHome(container);
      }
    };
    container.__prodigyHomeLifecycle = lifecycle;

    try { await ensureProdigySettings(app); } catch (_settingsError) { /* Home remains usable without settings. */ }
    try {
      await loadOptionalProdigyScript(app, "SYSTEM/Views/workspace-registry.js", "ProdigyWorkspaceRegistry");
      await loadOptionalProdigyScript(app, "SYSTEM/Views/workspace-navigation.js", "ProdigyWorkspaceNavigation");
      await loadOptionalProdigyScript(app, "SYSTEM/Views/home-workspace-bar-core.js", "HomeWorkspaceBarCore");
      await loadOptionalProdigyScript(app, "SYSTEM/Views/prodigy-adaptive-controls.js", "ProdigyAdaptiveControls");
    } catch (_workspaceModuleError) { /* Home remains usable when optional loading is unavailable. */ }

    const workspaceRegistry = resolveViewModule("ProdigyWorkspaceRegistry", "./workspace-registry.js");
    const workspaceNavigation = resolveViewModule("ProdigyWorkspaceNavigation", "./workspace-navigation.js");
    const workspaceBarCore = resolveViewModule("HomeWorkspaceBarCore", "./home-workspace-bar-core.js");
    const adaptiveControls = createHomeAdaptiveControls(
      resolveViewModule("ProdigyAdaptiveControls", "./prodigy-adaptive-controls.js")
    );

    container.empty();
    container.classList.add("prodigy-home");
    if (typeof container.setAttr === "function") container.setAttr("data-scroll-owner", "home-workspace-body");
    else if (typeof container.setAttribute === "function") container.setAttribute("data-scroll-owner", "home-workspace-body");
    const workspaceLeaf = container.closest?.(".workspace-leaf-content");
    const getElementWidth = (element) => {
      try {
        if (!element) return 0;
        const rect = typeof element.getBoundingClientRect === "function" ? element.getBoundingClientRect() : null;
        return Math.floor((rect && rect.width) || element.clientWidth || 0);
      } catch (_widthError) {
        return 0;
      }
    };
    const getLogicalWidth = () => {
      const measured = getElementWidth(workspaceLeaf)
        || getElementWidth(container.parentElement)
        || getElementWidth(container)
        || (typeof window !== "undefined" && window.visualViewport ? Math.floor(window.visualViewport.width || 0) : 0)
        || (typeof document !== "undefined" ? getElementWidth(document.documentElement) : 0)
        || (typeof document !== "undefined" ? getElementWidth(document.body) : 0)
        || (typeof window !== "undefined" ? Math.floor(window.innerWidth || 0) : 0);
      const pageZoom = typeof document !== "undefined" && document.documentElement && document.documentElement.style
        ? Number.parseFloat(document.documentElement.style.zoom || "1")
        : 1;
      return Math.floor(measured / (Number.isFinite(pageZoom) && pageZoom > 0 ? pageZoom : 1));
    };
    const getHomeVariant = (logicalWidth) => homeModel.getHomeVariant(logicalWidth, !!(
      app.isMobile
      || (typeof document !== "undefined" && document.body && document.body.classList.contains("is-mobile"))
    ), BREAKPOINTS);
    let currentHomeVariant = "";
    const syncHomeWidth = () => {
      try {
        if (!container.style) return;
        const sourceWidth = getLogicalWidth();
        if (!sourceWidth) return;
        const variant = getHomeVariant(sourceWidth);
        const gutter = variant === "compact" ? 16 : 64;
        const homeWidth = Math.min(1180, Math.max(280, sourceWidth - gutter));
        container.style.width = "";
        container.style.marginLeft = "";
        if (typeof container.style.setProperty === "function") {
          container.style.setProperty("--home-measured-width", `${homeWidth}px`);
        }
        container.classList.toggle("home-compact", variant === "compact");
        container.classList.toggle("home-medium", variant === "medium");
        container.classList.toggle("home-wide", variant === "wide");
        container.classList.toggle("home-narrow", homeWidth < 520);
        if (variant !== currentHomeVariant) {
          currentHomeVariant = variant;
          if (typeof container.__prodigyHomeVariantChange === "function") {
            container.__prodigyHomeVariantChange(variant);
          }
        }
      } catch (_syncWidthError) {
        container.classList.toggle("home-compact", false);
        container.classList.toggle("home-medium", false);
        container.classList.toggle("home-wide", false);
      }
    };
    syncHomeWidth();
    if (typeof ResizeObserver !== "undefined" && workspaceLeaf) {
      container.__prodigyHomeResizeObserver = new ResizeObserver(syncHomeWidth);
      container.__prodigyHomeResizeObserver.observe(workspaceLeaf);
    }
    
    // CSS extracted to home-styles.js (P2-1)
    if (root.HomeStyles && typeof root.HomeStyles.ensureHomeStyles === "function") {
      root.HomeStyles.ensureHomeStyles();
    }
    ensureHomeAdoptionStyles();

    const todayStr = root.MorningContextCore.getTodayIsoDate();
    const weekId = root.MorningContextCore.getWeekId(new Date());

    // Display loader — external failures must never block Home.
    const mainLoader = container.createEl("div", {
      text: "오늘의 운영 화면을 준비하는 중...",
      attr: { class: "home-view-loading" }
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

    const sanitizeFocusList = (list) => homeModel.sanitizeFocusList(list, pathExists);

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
    leftTitle.createEl("h2", { text: `오늘 · ${todayStr}`, attr: { class: "home-title" } });
    leftTitle.createEl("span", { text: `${pkg.day_of_week || ""} · ${greeting} · 지금 무엇에 집중할까?`, attr: { class: "home-subtitle" } });

    const rightActions = titleRow.createEl("div", { attr: { class: "home-toolbar" } });

    const settingsBtn = rightActions.createEl("button", {
      attr: { type: "button", class: "action-btn home-settings-button", title: "Prodigy OS 설정", "aria-label": "Prodigy OS 설정" }
    });
    const setIcon = root.setIcon || (root.obsidian && root.obsidian.setIcon);
    if (typeof setIcon === "function") setIcon(settingsBtn, "settings");
    else settingsBtn.textContent = "설정";
    settingsBtn.onclick = async () => {
      try {
        await ensureProdigySettings(app);
        if (!root.ProdigySettingsModal || typeof root.ProdigySettingsModal.open !== "function") throw new Error("settings unavailable");
        root.ProdigySettingsModal.open(app);
      } catch (_error) {
        new Notice("Prodigy OS 설정을 열지 못했습니다.");
      }
    };

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
    try {
      homeController.bindCreatorShortcut({
        container,
        app,
        pkg,
        getCreator: () => root.ObjectCreatorView
      });
    } catch (_e) { /* ignore */ }
    
    if (isStale) {
      rightActions.createEl("span", { 
        text: "새 정보 감지됨",
        attr: { class: "home-stale-badge" }
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
    const stack = container.createEl("div", {
      attr: { class: "home-grid home-mc-stack home-column col-span-12" }
    });

    const workspacePathFor = (sourceType) => {
      const raw = String(sourceType || "").trim().toLowerCase();
      const aliases = {
        auction_case: "auction",
        project_note: "project",
        project_family: "project",
        people: "personal",
        person: "personal"
      };
      const workspaceId = aliases[raw] || raw;
      if (workspaceRegistry && typeof workspaceRegistry.pathFor === "function") {
        return workspaceRegistry.pathFor(workspaceId);
      }
      if (workspaceRegistry && typeof workspaceRegistry.find === "function") {
        const found = workspaceRegistry.find(workspaceId);
        return found ? found.path : "";
      }
      return "";
    };

    const openPath = homeController.createPathOpener({
      app,
      container: stack,
      navigation: workspaceNavigation,
      Notice: root.Notice
    });

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

    const safeRenderRegion = (label, render) => homeSections.safeRenderRegion({
      parent: stack,
      label,
      render,
      debug: !!window.prodigyDebugMode
    });

    const clampBriefLines = homeModel.clampBriefLines;

    safeRenderRegion("Workspace Shortcuts", () => {
      const dock = homeSections.renderWorkspaceDock({
        parent: stack,
        workspaceBarCore,
        registry: workspaceRegistry,
        selection: options.workspaceBarSelection,
        controlHeight: CONTROL_HEIGHTS.workspaceBar,
        adaptiveControls,
        openPath
      });
      if (!dock) return;
    });

    // ── 1. TODAY · Morning Brief ──
    safeRenderRegion("Morning Brief", () => {
      const briefCard = stack.createEl("div", {
        attr: { class: "home-card home-brief prodigy-utility-card " + (isMorning ? "emphasis-primary" : "emphasis-secondary") }
      });
      const briefHead = briefCard.createEl("div", { attr: { class: "home-header" } });
      briefHead.createEl("span", { text: "오늘" });
      briefHead.createEl("span", {
        text: "모닝 브리프",
        attr: { class: "home-brief-kicker" }
      });
      const briefMode = result.brief_mode || (result.principle && result.principle.source) || "";
      if (briefMode === "rule_based" || briefMode === "fallback" || String(result.result_id || "").includes("rule-based") || String(result.result_id || "").includes("fallback")) {
        briefHead.createEl("span", {
          text: "규칙 기반",
          attr: { class: "badge badge-gray home-brief-mode" }
        });
      }

      briefCard.createEl("p", {
        text: clampBriefLines(result.brief, 2),
        attr: {
          class: "home-brief-text"
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
          attr: { class: "home-yesterday-review home-brief-context" }
        });
        contextLines.slice(0, 3).forEach((line) => {
          ctxBox.createEl("div", { text: line, attr: { class: "home-brief-context-line" } });
        });
        if (yesterdayReview && (yLearning || yNext) && yesterdayReview.path) {
          const openY = briefCard.createEl("button", {
            text: "어제 저널 열기",
            attr: { class: "action-btn home-brief-action" }
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
          attr: { class: "home-yesterday-missing" }
        });
        miss.createEl("div", { text: "어제 성찰이 비어 있습니다 · 필수는 아닙니다." });
        const missBtn = miss.createEl("button", {
          text: "2분 성찰",
          attr: { class: "action-btn home-brief-action" }
        });
        missBtn.onclick = async () => {
          const yDate = (yesterdayReview && yesterdayReview.date)
            || (root.MorningContextCore && root.MorningContextCore.getYesterdayIsoDate
              ? root.MorningContextCore.getYesterdayIsoDate(new Date())
              : "");
          if (root.JournalReviewModal && root.JournalStore && yDate) {
            const review = await root.JournalStore.loadReview(app, yDate);
            root.JournalReviewModal.open(app, review.fields || {}, async (values) => {
              await root.JournalStore.saveReview(app, yDate, values);
              if (window.Notice) new Notice("어제 성찰을 저장했습니다.");
            }, { focusHints: [] });
            return;
          }
          openPath((yesterdayReview && yesterdayReview.path) || (yDate ? "DAILY/DAILY/" + yDate + ".md" : workspacePathFor("journal")));
        };
      }

      if (isEvening) {
        const eve = briefCard.createEl("div", {
          attr: { class: "home-evening-close" }
        });
        eve.createEl("div", {
          text: "오늘 마무리 · 2분 Review로 Focus를 닫습니다.",
          attr: { class: "home-evening-copy" }
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
          if (root.JournalReviewModal && root.JournalStore) {
            const review = await root.JournalStore.loadReview(app, todayStr);
            root.JournalReviewModal.open(app, review.fields || {}, async (values) => {
              await root.JournalStore.saveReview(app, todayStr, values);
              if (window.Notice) new Notice("오늘 Review를 저장했습니다.");
            }, { focusHints });
            return;
          }
          openPath(workspacePathFor("journal"));
        };
      }
    });

    // ── 2. Today's Focus (approved only — no edit from Home) ──
    const focusDisplayKeys = Object.create(null);

    const dedupeKeyFor = homeModel.dedupeKeyFor;

    const rememberFocusDisplayKey = (item) => {
      if (!item) return;
      const key = dedupeKeyFor(item.object_path, item.source_type, item.label || item.title);
      if (key) focusDisplayKeys[key] = true;
    };

    safeRenderRegion("Today's Focus", () => {
      const focusCard = stack.createEl("div", {
        attr: { class: "home-focus-card prodigy-full-bleed home-card " + (isMorning || isAfternoon ? "emphasis-primary" : "emphasis-secondary") }
      });
      const head = focusCard.createEl("div", { attr: { class: "home-header" } });
      head.createEl("span", { text: "오늘의 집중" });

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
        // Read-only suggestions on Home — no inline editing (Mission Control only)
        const proposal = root.MorningContextCore.selectFocusItems
          ? root.MorningContextCore.selectFocusItems({
            pinnedFocus,
            focusItems: (result && Array.isArray(result.focus) ? result.focus : []),
            pkg,
            localDate: todayStr
          })
          : ((result && Array.isArray(result.focus)) ? result.focus : []);
        const suggestions = (proposal || []).filter(Boolean).slice(0, 3);
        const actions = focusCard.createEl("div", {
          attr: { class: "focus-footer home-focus-suggestions-footer" }
        });

        if (suggestions.length) {
          focusCard.createEl("div", {
            text: "오늘의 집중 제안",
            attr: { class: "home-focus-suggestion-title" }
          });
          focusCard.createEl("div", {
            text: "읽기 전용 · 승인만 Home에서 합니다. 편집은 브리핑에서.",
            attr: { class: "home-focus-suggestion-note" }
          });
          const listDiv = focusCard.createEl("div", { attr: { class: "focus-list" } });
          suggestions.forEach((item, idx) => {
            rememberFocusDisplayKey(item);
            const row = listDiv.createEl("div", { attr: { class: "focus-row" } });
            const top = row.createEl("div", { attr: { class: "focus-top" } });
            top.createEl("div", {
              text: `${idx + 1}. ${item.label || "제안"}`,
              attr: { class: "focus-title" }
            });
            top.createEl("span", {
              text: getSourceTypeLabel(item.source_type),
              attr: { class: "badge badge-gray" }
            });
            const next = item.next_action || item.reason || "";
            if (next) {
              row.createEl("div", {
                text: next,
                attr: { class: "focus-reason home-focus-reason" }
              });
            }
          });
          const approveBtn = actions.createEl("button", {
            text: suggestions.length === 1 ? "이 제안 승인" : "첫 번째 제안 승인",
            attr: { class: "action-btn action-btn-primary" }
          });
          approveBtn.onclick = async () => {
            // Canonical approval: first suggestion as today's Focus (existing MorningCache API)
            const chosen = [suggestions[0]];
            approvedFocus = await root.MorningCache.saveApprovedFocus(app, todayStr, chosen, false);
            new Notice("오늘의 집중이 승인되었습니다.");
            renderHome(options);
          };
          if (suggestions.length > 1) {
            const approveAll = actions.createEl("button", {
              text: `상위 ${suggestions.length}개 승인`,
              attr: { class: "action-btn" }
            });
            approveAll.onclick = async () => {
              approvedFocus = await root.MorningCache.saveApprovedFocus(app, todayStr, suggestions, false);
              new Notice("오늘의 집중이 승인되었습니다.");
              renderHome(options);
            };
          }
        } else {
          focusCard.createEl("div", {
            text: "아직 제안된 집중 항목이 없습니다.",
            attr: { class: "home-focus-empty-title" }
          });
          focusCard.createEl("div", {
            text: "오늘의 기록이나 다음 행동을 먼저 추가하세요.",
            attr: { class: "home-focus-empty-note" }
          });
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
        attr: { class: "badge badge-high home-focus-approved" }
      });

      const listDiv = focusCard.createEl("div", { attr: { class: "focus-list" } });
      currentFocus.forEach((item) => {
        rememberFocusDisplayKey(item);
        const row = listDiv.createEl("div", { attr: { class: "focus-row" } });
        const top = row.createEl("div", { attr: { class: "focus-top" } });
        const titleSpan = top.createEl("div", { attr: { class: "focus-title" } });
        titleSpan.createEl("span", { text: item.label || "집중" });
        top.createEl("span", {
          text: getSourceTypeLabel(item.source_type),
          attr: { class: "badge badge-gray" }
        });
        const next = item.next_action || item.reason || "";
        if (next) {
          row.createEl("div", {
            text: next,
            attr: { class: "focus-reason home-focus-reason" }
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

    // ── 3. Continue (Object Engine / package candidates, max 4) ──
    safeRenderRegion("Continue", () => {
      const continueCards = homeModel.buildContinueCards({
        focusKeys: focusDisplayKeys,
        continueByWorkspace: (briefContext && briefContext.continue_by_workspace) || {},
        candidates: (pkg.context && pkg.context.continue_candidates) || [],
        workspacePathFor,
        getSourceTypeLabel
      });
      homeSections.renderContinueSection({
        parent: primary,
        cards: continueCards,
        isAfternoon,
        openPath
      });
    });

    safeRenderRegion("Micro Log", () => {
      homeSections.renderMicroLogSlot(stack);
    });
    const fold = stack.createEl("details", { attr: { class: "home-secondary-fold" } });
    fold.createEl("summary", { text: "더 보기 · 주의 · 빠른 실행 · 런처" });
    const lower = fold.createEl("div", { attr: { class: "home-secondary-fold-body home-mc-lower" } });
    let foldVariant = "";
    container.__prodigyHomeVariantChange = (variant) => {
      if (variant === foldVariant) return;
      foldVariant = variant;
      fold.open = variant !== "compact";
    };
    container.__prodigyHomeVariantChange(currentHomeVariant || getHomeVariant(getLogicalWidth()));

    // ── 4. Needs Attention (critical/high via briefContext) ──
    safeRenderRegion("Needs Attention", () => {
      let risks = (briefContext && root.MorningBriefContext && root.MorningBriefContext.toHomeRiskItems)
        ? root.MorningBriefContext.toHomeRiskItems(briefContext)
        : ((pkg.context && pkg.context.risks) || []);
      // Belt-and-suspenders: never show non-bidding auctions on Home attention
      const auctionStatusOk = (status) => {
        const eng = root.ObjectEngine || root.ObjectEngineCore;
        if (eng && typeof eng.isAuctionHomeAttentionStatus === "function") return eng.isAuctionHomeAttentionStatus(status);
        return String(status || "").toLowerCase() === "bidding";
      };
      risks = homeModel.filterAttentionRisks(risks, (pkg.context && pkg.context.auctions) || [], auctionStatusOk);

      const riskCard = lower.createEl("div", {
        attr: { class: "home-card prodigy-utility-card emphasis-risk home-needs-attention" }
      });
      const rHead = riskCard.createEl("div", {
        attr: { class: "home-header home-attention-header" }
      });
      rHead.createEl("span", { text: "주의가 필요함" });
      if (briefContext && briefContext.engine_ok === false) {
        rHead.createEl("span", {
          text: "엔진 폴백",
          attr: { class: "badge badge-gray home-attention-fallback" }
        });
      }

      if (!risks.length) {
        riskCard.createEl("div", {
          text: (briefContext && briefContext.empty_attention_message)
            || "오늘은 주의할 Object가 없습니다.",
          attr: { class: "home-attention-empty" }
        });
        return;
      }

      const rList = riskCard.createEl("div", {
        attr: { class: "home-attention-list" }
      });
      risks.forEach((risk) => {
        const rItem = rList.createEl("div", {
          attr: {
            class: "home-attention-item home-attention-row"
          }
        });
        const topRow = rItem.createEl("div", {
          attr: { class: "home-attention-top" }
        });
        const titleWrap = topRow.createEl("div", {
          attr: { class: "home-attention-title" }
        });
        if (risk.workspace_label) {
          titleWrap.createEl("span", {
            text: risk.workspace_label,
            attr: { class: "home-attention-workspace" }
          });
        }
        titleWrap.createEl("strong", {
          text: risk.label,
          attr: { class: "home-attention-title-text" }
        });
        // Human labels only — never raw lifecycle tokens as primary copy
        if (risk.attention_level) {
          const lvl = String(risk.attention_level).toLowerCase();
          if (lvl === "critical" || lvl === "high") {
            titleWrap.createEl("span", {
              text: lvl === "critical" ? "긴급" : "높음",
              attr: {
                class: lvl === "critical" ? "badge badge-high home-attention-badge" : "badge badge-medium home-attention-badge"
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
          text: "이유",
          attr: { class: "home-attention-reason-label" }
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
              attr: { class: "home-attention-evidence" }
            });
          });
        }
      });
    });

    // ── 5. Quick Actions ──
    safeRenderRegion("Quick Actions", () => {
      const qa = lower.createEl("div", { attr: { class: "home-card prodigy-utility-card emphasis-secondary home-quick-actions" } });
      qa.createEl("div", { text: "빠른 실행", attr: { class: "home-header" } });
      const row = qa.createEl("div", {
        attr: { class: "home-action-row" }
      });
      const newDaily = row.createEl("button", {
        text: "+ 오늘 Daily",
        attr: { class: "action-btn action-btn-primary", type: "button" }
      });
      newDaily.onclick = () => { openOrCreateDaily(); };
      const searchBtn = row.createEl("button", {
        text: "검색",
        attr: { class: "action-btn", type: "button" }
      });
      searchBtn.onclick = () => openSearch();
      const guideBtn = row.createEl("button", {
        text: "사용법",
        attr: { class: "action-btn", type: "button" }
      });
      guideBtn.onclick = () => {
        openPath("HUB/05 Guide.md");
      };
      const doctorBtn = row.createEl("button", {
        text: "상태 점검",
        attr: { class: "action-btn", type: "button" }
      });
      doctorBtn.onclick = () => {
        if (root.ProdigyDoctor && typeof root.ProdigyDoctor.renderDoctor === "function") {
          const leaf = app.workspace.getLeaf(true);
          if (leaf && leaf.view && leaf.view.contentEl) {
            root.ProdigyDoctor.renderDoctor(leaf.view.contentEl, app);
          }
        } else {
          new Notice("Prodigy Doctor를 불러오지 못했습니다.");
        }
      };
    });

    // ── 6. Todoist (summary only — Todoist owns execution) ──
    safeRenderRegion("Todoist", () => {
        const execCard = lower.createEl("div", {
          attr: { class: "home-card prodigy-utility-card " + (isAfternoon ? "emphasis-primary" : "emphasis-secondary") }
        });
        execCard.createEl("div", { text: "Todoist", attr: { class: "home-header" } });
        const todoist = (pkg.context && pkg.context.todoist) || {};
        const todayCount = todoist.todayCount || 0;
        const overdueCount = todoist.overdueCount || 0;
        execCard.createEl("div", {
          text: "오늘",
          attr: { class: "home-todoist-label" }
        });
        execCard.createEl("div", {
          text: todayCount + "개 업무",
          attr: { class: "home-todoist-count" }
        });
        if (overdueCount > 0) {
          execCard.createEl("div", {
            text: overdueCount + " Overdue",
            attr: { class: "home-todoist-overdue" }
          });
        }
        const todoBtn = execCard.createEl("button", {
          text: "Todoist 열기",
          attr: { class: "action-btn action-btn-primary home-todoist-action" }
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
            pkg,
            showCreator: false,
            hideEmptyCards: currentHomeVariant === "compact"
          });
          const embeddedStates = typeof launcherMount.querySelectorAll === "function"
            ? Array.from(launcherMount.querySelectorAll("[data-state]"))
            : (typeof launcherMount.findAll === "function"
              ? launcherMount.findAll((element) => element.attributes && element.attributes["data-state"])
              : []);
          embeddedStates.forEach((element) => {
            if (typeof element.removeAttribute === "function") element.removeAttribute("data-state");
          });
        } else {
          launcherMount.createEl("div", {
            text: "워크스페이스 런처를 불러오지 못했습니다.",
            attr: { class: "home-launcher-status" }
          });
        }
      } catch (launcherError) {
        launcherMount.createEl("div", {
          text: "워크스페이스 런처를 표시하지 못했습니다.",
          attr: { class: "home-launcher-error" }
        });
        if (window.prodigyDebugMode) {
          launcherMount.createEl("div", {
            text: String(launcherError.message || launcherError),
            attr: { class: "home-launcher-details" }
          });
        }
      }
    });

    // ── 8. System Status (tiny, no diagnostics) ──
    safeRenderRegion("System Status", () => {
      const status = lower.createEl("div", {
        attr: { class: "home-card prodigy-utility-card home-system-status emphasis-secondary" }
      });
      status.createEl("div", {
        text: "시스템 상태",
        attr: { class: "home-header home-system-header" }
      });
      const engineHealthy = !(briefContext && briefContext.engine_ok === false);
      const warnings = Array.isArray(pkg.warnings) ? pkg.warnings : [];
      const syncHealthy = !warnings.some((w) => /todoist|sync|fetch failed/i.test(String(w)));
      const reviewPending = Array.isArray(pkg.context && pkg.context.review_inbox)
        ? pkg.context.review_inbox.length
        : 0;

      // Primary PRE surface: Weekly Review draft only (internal reports stay collapsed)
      const weeklyDraftPath = (function resolveWeeklyDraftPath() {
        try {
          const runsRoot = "SYSTEM/AI/Skills/prodigy-review/runs";
          const rootFolder = app.vault.getAbstractFileByPath(runsRoot);
          if (!rootFolder || !rootFolder.children) return null;
          const weekFolders = rootFolder.children
            .filter((f) => f && f.children && /^\d{4}-W\d{2}$/.test(f.name))
            .map((f) => f.name)
            .sort()
            .reverse();
          for (const week of weekFolders) {
            const draft = `${runsRoot}/${week}/weekly-review-${week}-draft.md`;
            if (app.vault.getAbstractFileByPath(draft)) return draft;
          }
        } catch (_e) { /* ignore */ }
        return null;
      })();
      if (weeklyDraftPath) {
        const weekRow = status.createEl("div", {
          attr: { class: "home-weekly-draft" }
        });
        weekRow.createEl("div", {
          text: "주간 복기 (읽을 파일)",
          attr: { class: "home-weekly-draft-label" }
        });
        weekRow.createEl("div", {
          text: "Weekly Review 초안 · 내부 리포트와 구분",
          attr: { class: "home-weekly-draft-copy" }
        });
        const openDraft = weekRow.createEl("button", {
          text: "주간 복기 초안 열기",
          attr: { class: "action-btn action-btn-primary" }
        });
        openDraft.onclick = () => openPath(weeklyDraftPath);
      }

      const row = status.createEl("div", {
        attr: { class: "home-system-metrics" }
      });
      const pill = (label, value, ok) => {
        const el = row.createEl("div", {
          attr: { class: "home-system-pill" }
        });
        el.createEl("span", { text: label, attr: { class: "home-system-pill-label" } });
        el.createEl("span", {
          text: value,
          attr: { class: "home-system-pill-value " + (ok ? "is-ok" : "is-warning") }
        });
      };
      pill("Object Engine", engineHealthy ? "정상" : "제한", engineHealthy);
      pill("Sync", syncHealthy ? "정상" : "제한", syncHealthy);
      pill("Review Queue", reviewPending + "건 대기", reviewPending === 0);

      // Collapsed lifecycle remains available for debug (not Mission Control primary)
      if (root.ObjectLifecycleCore && root.ObjectLifecycleView) {
        const lifecycleFold = status.createEl("details", {
          attr: { class: "home-lifecycle-fold" }
        });
        lifecycleFold.createEl("summary", {
          text: "객체 라이프사이클 · 접힘 (주의 요약)"
        });
        const lifecycleCard = lifecycleFold.createEl("div", {
          attr: { class: "home-card prodigy-utility-card emphasis-secondary" }
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
            attr: { class: "home-lifecycle-error" }
          });
        }
      }
    });


    if (typeof fold.addEventListener === "function" && typeof lower.remove === "function") {
      const syncFoldBody = () => {
        if (fold.open) {
          if (!lower.parentElement) fold.appendChild(lower);
        } else if (lower.parentElement) {
          lower.remove();
        }
      };
      fold.addEventListener("toggle", syncFoldBody);
      syncFoldBody();
    }
    return lifecycle;
  }

  const api = {
    renderHome,
    disposeHome,
    generateMorningBrief,
    getSourceTypeLabel,
    getEvidenceSourceLabel
  };

  root.HomeView = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
