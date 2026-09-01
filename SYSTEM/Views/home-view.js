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
      .prodigy-home .home-action-row {
        display: flex;
        align-items: center;
        flex-wrap: wrap;
        gap: var(--ke-space-2, 4px);
        min-inline-size: 0;
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
    const priorCaptureScope = container.__prodigyQuickCaptureScope;
    if (priorCaptureScope && typeof priorCaptureScope.dispose === "function") priorCaptureScope.dispose();
    delete container.__prodigyQuickCaptureScope;
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
    const parentScope = options.mountScope || null;
    const renderScope = {
      signal: parentScope && parentScope.signal ? parentScope.signal : { aborted: false },
      disposed: false,
      cleanups: [],
      track(fn) {
        if (typeof fn !== "function") return fn;
        if (!this.disposed) {
          this.cleanups.push(fn);
          if (parentScope && typeof parentScope.track === "function") parentScope.track(fn);
        }
        return fn;
      },
      dispose() {
        if (this.disposed) return false;
        this.disposed = true;
        this.cleanups.splice(0).reverse().forEach((fn) => { try { fn(); } catch (_cleanupError) { /* best-effort */ } });
        return true;
      }
    };
    container.__prodigyQuickCaptureScope = renderScope;
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
          container.style.setProperty(
            "--home-primary-cta-height",
            `${T.DEVICE_TABLE.primaryCta.phone.visualHeight}px`
          );
          container.style.setProperty(
            "--home-primary-cta-font-size",
            `${T.DEVICE_TABLE.primaryCta.phone.fontSize}px`
          );
          container.style.setProperty(
            "--home-primary-cta-padding-inline",
            `${T.DEVICE_TABLE.primaryCta.phone.paddingInline}px`
          );
          container.style.setProperty(
            "--home-primary-cta-radius",
            `${T.DEVICE_TABLE.primaryCta.phone.radius}px`
          );
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

    let approvedFocus = null;
    let pinnedFocus = null;
    try {
      approvedFocus = await root.MorningCache.getApprovedFocus(app, todayStr);
      pinnedFocus = await root.MorningCache.getPinnedFocus(app, todayStr);
    } catch (_cacheError) {
      approvedFocus = null;
      pinnedFocus = null;
    }

    mainLoader.remove();

    const pkg = newPkg || {};

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
          focusItems: (approvedFocus && approvedFocus.focus) || [],
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

    // Native macOS content header: title/context on the leading edge and
    // compact toolbar actions on the trailing edge.
    const titleRow = container.createEl("div", {
      attr: { class: "home-title-row home-native-header" }
    });
    
    const leftTitle = titleRow.createEl("div");
    leftTitle.createEl("p", { text: `${pkg.day_of_week || ""} · ${todayStr}`, attr: { class: "home-native-context" } });
    leftTitle.createEl("h2", { text: "오늘", attr: { class: "home-title" } });
    leftTitle.createEl("span", { text: greeting, attr: { class: "home-subtitle" } });

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
        class: "action-btn action-btn-primary home-toolbar-primary",
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
    
    const refreshBtn = rightActions.createEl("button", { text: "새로고침", attr: { class: "action-btn home-toolbar-utility" } });
    refreshBtn.onclick = () => renderHome(options);

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

    let workspaceDock = null;
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
      workspaceDock = dock;
    });

    // ── 1.5 Quick Capture (grouped row; trusted-interaction gated local writes) ──
    safeRenderRegion("Quick Capture", () => {
      const quickCaptureView = resolveViewModule("QuickCaptureView", "./quick-capture-view.js");
      if (!quickCaptureView || typeof quickCaptureView.mountQuickCapture !== "function") return;
      quickCaptureView.mountQuickCapture({
        app,
        container: stack,
        sessionId: "home-quick-capture",
        scope: renderScope,
        notify: (message) => new Notice(message)
      });
    });

    // ── 2. Ranked next-action deck from current deterministic state ──
    const homeActionQueue = resolveViewModule("HomeActionQueue", "./home-action-queue.js");
    const queueFocusBase = (approvedFocus && Array.isArray(approvedFocus.focus))
      ? approvedFocus.focus
      : [];
    const queueFocusItems = root.MorningContextCore.selectFocusItems
      ? root.MorningContextCore.selectFocusItems({
        pinnedFocus,
        focusItems: queueFocusBase,
        pkg,
        localDate: todayStr
      })
      : queueFocusBase;
    const queueFocusKeys = Object.create(null);
    (queueFocusItems || []).forEach((item) => {
      const key = homeModel.dedupeKeyFor(item && item.object_path, item && item.source_type, item && (item.label || item.title));
      if (key) queueFocusKeys[key] = true;
    });
    const queueContinueCards = homeModel.buildContinueCards({
      focusKeys: queueFocusKeys,
      continueByWorkspace: (briefContext && briefContext.continue_by_workspace) || {},
      candidates: (pkg.context && pkg.context.continue_candidates) || [],
      workspacePathFor,
      getSourceTypeLabel
    });
    let queueRisks = (briefContext && root.MorningBriefContext && root.MorningBriefContext.toHomeRiskItems)
      ? root.MorningBriefContext.toHomeRiskItems(briefContext)
      : ((pkg.context && pkg.context.risks) || []);
    const queueAuctionStatusOk = (status) => {
      const engine = root.ObjectEngine || root.ObjectEngineCore;
      if (engine && typeof engine.isAuctionHomeAttentionStatus === "function") return engine.isAuctionHomeAttentionStatus(status);
      return String(status || "").toLowerCase() === "bidding";
    };
    queueRisks = homeModel.filterAttentionRisks(queueRisks, (pkg.context && pkg.context.auctions) || [], queueAuctionStatusOk);
    const privateInboxPath = /(?:^|\/)(?:private|protected|sensitive|people|contacts?)(?:\/|$)/iu;
    const inboxCount = app.vault && typeof app.vault.getMarkdownFiles === "function"
      ? app.vault.getMarkdownFiles().filter((file) => file && typeof file.path === "string" && file.path.startsWith("INBOX/") && !privateInboxPath.test(file.path)).length
      : 0;
    let fleetingCount = 0;
    const fleetingReviewApi = root.KnowledgeFleetingReviewState;
    if (fleetingReviewApi && typeof fleetingReviewApi.createFleetingReviewState === "function") {
      try {
        const localReviewState = fleetingReviewApi.createFleetingReviewState({
          vault: app.vault,
          analyze: async () => ({ ok: false, reason: "knowledge_review_required", completed_block_ids: [], reviews: [] }),
        });
        const localReviewSnapshot = await localReviewState.refresh();
        fleetingCount = Number(localReviewSnapshot.pending_count) || 0;
      } catch (_error) { fleetingCount = 0; }
    }
    if (homeActionQueue && typeof homeActionQueue.buildActionQueue === "function" && typeof homeActionQueue.renderActionQueue === "function") {
      const queueActions = homeActionQueue.buildActionQueue({
        now: new Date(),
        pkg,
        attention: queueRisks,
        focusItems: queueFocusItems,
        focusApproved: Boolean(approvedFocus || pinnedFocus),
        continueCards: queueContinueCards,
        inboxCount,
        fleetingCount,
        journalStatus: journalStatusForOps.status,
        workspacePathFor
      });
      homeActionQueue.renderActionQueue({
        parent: stack,
        actions: queueActions,
        aiBacked: false,
        onAction: async (action) => {
          if (action.target_path) openPath(action.target_path);
        }
      });
    }

    // Secondary operational context stays collapsed by default.
    const legacyContext = stack.createEl("details", { attr: { class: "home-context-details" } });
    legacyContext.createEl("summary", { text: "상세 운영 정보" });
    const legacyBody = legacyContext.createEl("div", { attr: { class: "home-context-details-body" } });

    // Today's Focus remains human-approved only.
    const focusDisplayKeys = Object.create(null);

    const dedupeKeyFor = homeModel.dedupeKeyFor;

    const rememberFocusDisplayKey = (item) => {
      if (!item) return;
      const key = dedupeKeyFor(item.object_path, item.source_type, item.label || item.title);
      if (key) focusDisplayKeys[key] = true;
    };

    safeRenderRegion("Today's Focus", () => {
      const focusCard = legacyBody.createEl("div", {
        attr: { class: "home-focus-card home-card home-native-group " + (isMorning || isAfternoon ? "emphasis-primary" : "emphasis-secondary") }
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

      if (!currentFocus.length) {
        focusCard.createEl("div", {
          text: "승인된 집중 항목이 없습니다.",
          attr: { class: "home-focus-empty-title" }
        });
        focusCard.createEl("div", {
          text: "현재 상태에 따른 다음 행동은 위 목록에서 바로 확인할 수 있습니다.",
          attr: { class: "home-focus-empty-note" }
        });
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

      // ── One primary action for the approved Focus narrative ──
      // Actions on the primary object resolve to the workspace today, otherwise
      // to the object itself. This single CTA is the Focus→one action tail;
      // Continue/MicroLog/Disclosure follow it in the same narrative order.
      const primaryFocus = currentFocus[0];
      if (primaryFocus) {
        const ctaTarget = workspacePathFor(primaryFocus.source_type) || primaryFocus.object_path;
        if (ctaTarget) {
          const focusCta = focusCard.createEl("button", {
            attr: {
              type: "button",
              class: "action-btn action-btn-primary home-primary-cta",
              "aria-label": (primaryFocus.label || "오늘의 집중") + " 시작하기"
            }
          });
          focusCta.createEl("span", {
            text: "오늘의 집중 시작하기"
          });
          const ctaNext = primaryFocus.next_action || primaryFocus.reason || "";
          if (ctaNext) {
            focusCta.createEl("span", {
              text: ctaNext,
              attr: { class: "home-primary-cta-sub" }
            });
          }
          focusCta.onclick = () => openPath(ctaTarget);
        }
      }
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
        parent: legacyBody,
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
    const syncWorkspaceDockPosition = (variant) => {
      if (!workspaceDock || workspaceDock.parentElement !== stack) return;
      if (variant === "medium") {
        if (stack.lastElementChild !== workspaceDock) stack.appendChild(workspaceDock);
        return;
      }
      if (stack.firstElementChild !== workspaceDock) {
        stack.insertBefore(workspaceDock, stack.firstElementChild);
      }
    };
    container.__prodigyHomeVariantChange = (variant) => {
      if (variant !== foldVariant) {
        foldVariant = variant;
        fold.open = variant !== "compact";
      }
      syncWorkspaceDockPosition(variant);
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
    getSourceTypeLabel,
    getEvidenceSourceLabel
  };

  root.HomeView = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
