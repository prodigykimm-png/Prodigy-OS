---
cssclasses:
  - hide-properties_reading
sort_completed_by: rating
filter_rating: 
---
```js-engine
const file = app.workspace.getActiveFile();
if (!file) return;
if (!container) return;
container.empty();

// Expose globals for external scripts
window.obsidian = obsidian;
window.app = app;
window.__prodigyMeasurementEntry = window.__prodigyMeasurementEntry && window.__prodigyMeasurementEntry.workspaceId === "reading"
  ? window.__prodigyMeasurementEntry
  : { workspaceId: "reading" };
const OPTIONAL_MEASUREMENT_PATHS = new Set([
  "SYSTEM/Views/prodigy-performance-recorder.js",
  "SYSTEM/Views/prodigy-workspace-readiness.js",
  "SYSTEM/Views/prodigy-performance-exporter.js",
  "SYSTEM/Views/prodigy-workspace-measurement.js"
]);
const recordMeasurementFailure = (path, error) => {
  const failure = {
    path,
    code: error && error.code ? String(error.code) : "measurement_load_failed",
    message: error && error.message ? String(error.message).slice(0, 240) : "measurement module unavailable"
  };
  window.__prodigyMeasurementLoadFailures = (window.__prodigyMeasurementLoadFailures || []).concat(failure);
  if (window.prodigyDebugMode === true && console && console.warn) console.warn("선택적 성능 측정 모듈 미로드:", failure);
};

// Dynamic script loader helper
const loadProdigyScript = async (path, options = {}) => {
  const optional = options.optional === true || OPTIONAL_MEASUREMENT_PATHS.has(path);
  try {
    const tFile = app.vault.getAbstractFileByPath(path);
    if (!tFile) {
      const missing = new Error(`필수 스크립트 파일이 없습니다: ${path}`);
      missing.code = "sync_pending";
      if (optional) {
        recordMeasurementFailure(path, missing);
        return null;
      }
      throw missing;
    }
    const content = await app.vault.read(tFile);
    const evaluate = () => (new Function(content))();
    const session = window.__prodigyMeasurementEntry && window.__prodigyMeasurementEntry.session;
    if (session && typeof session.measureModule === "function") return await session.measureModule(path, evaluate);
    return evaluate();
  } catch (error) {
    if (optional) {
      recordMeasurementFailure(path, error);
      return null;
    }
    const wrapped = error instanceof Error ? error : new Error(String(error));
    wrapped.prodigyLoadPath = path;
    throw wrapped;
  }
};
const ensureReadingHubStyles = () => {
  if (typeof document === "undefined" || !document.head) return;
  const styleId = "prodigy-reading-hub-adoption-styles";
  let style = document.getElementById(styleId);
  if (!style) {
    style = document.createElement("style");
    style.id = styleId;
    document.head.appendChild(style);
  }
  style.textContent = `
    .reading-hub-body,
    .reading-hub-section {
      min-inline-size: 0;
      word-break: keep-all;
      overflow-wrap: anywhere;
      color: var(--ke-color-text, var(--text-normal));
    }
    .reading-hub-body *,
    .reading-hub-section * {
      box-sizing: border-box;
      min-inline-size: 0;
    }
    .reading-hub-body {
      scroll-padding-block-end: var(--prodigy-mobile-toolbar-clearance, 0px);
    }
    .reading-hub-section > * {
      min-inline-size: 0;
      max-inline-size: 100%;
    }
    .reading-hub-empty,
    .reading-hub-error,
    .reading-hub-note {
      color: var(--ke-color-muted, var(--text-muted));
      font-size: var(--ke-type-body, .84rem);
      line-height: var(--ke-leading-body, 1.45);
      overflow-wrap: anywhere;
    }
    .reading-hub-empty {
      font-style: italic;
    }
    .reading-hub-error {
      color: var(--ke-color-error, var(--text-error));
    }
    .reading-continue-strip {
      margin-block-end: var(--ke-space-4, 12px);
      padding: var(--ke-space-4, 12px);
      border: var(--ke-border-width, 1px) solid var(--ke-color-border, var(--background-modifier-border));
      border-radius: var(--ke-radius-panel, 8px);
      background: var(--ke-color-surface-secondary, var(--background-secondary));
      min-inline-size: 0;
      overflow-wrap: anywhere;
    }
    .reading-continue-title {
      margin: 0 0 var(--ke-space-2, 4px);
      color: var(--ke-color-accent, var(--text-accent));
      font-size: var(--ke-type-title, 1.05rem);
      line-height: var(--ke-leading-body, 1.45);
    }
    .reading-continue-context {
      margin-block-start: var(--ke-space-2, 4px);
      color: var(--ke-color-muted, var(--text-muted));
      font-size: var(--ke-type-body, .84rem);
      line-height: var(--ke-leading-body, 1.45);
      overflow-wrap: anywhere;
    }
    .reading-continue-actions {
      margin-block-start: var(--ke-space-3, 8px);
    }
    .reading-continue-book-title {
      display: block;
      min-inline-size: 0;
      font-size: var(--ke-type-heading, .92rem);
      line-height: var(--ke-leading-body, 1.45);
      overflow-wrap: anywhere;
    }
    .reading-continue-detail {
      margin-block-start: var(--ke-space-2, 4px);
      line-height: var(--ke-leading-body, 1.45);
    }
    .reading-continue-detail-muted {
      color: var(--ke-color-muted, var(--text-muted));
      font-size: var(--ke-type-label, .72rem);
    }
    .reading-hub-action-row {
      display: flex;
      align-items: center;
      flex-wrap: wrap;
      gap: var(--ke-space-2, 4px);
      min-inline-size: 0;
    }
    .reading-card-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(min(100%, 15rem), 1fr));
      gap: var(--ke-space-4, 12px);
      margin-block-start: var(--ke-space-3, 8px);
      min-inline-size: 0;
    }
    .reading-filter-label {
      font-weight: 700;
      overflow-wrap: anywhere;
    }
    .reading-filter-container {
      display: flex;
      align-items: center;
      justify-content: flex-end;
      flex-wrap: wrap;
      gap: var(--ke-space-3, 8px);
      margin-block-end: var(--ke-space-3, 8px);
      min-inline-size: 0;
    }
    .reading-filter-control {
      display: inline-flex;
      align-items: center;
      gap: var(--ke-space-1, 2px);
      min-inline-size: 0;
      color: var(--ke-color-muted, var(--text-muted));
      font-size: var(--ke-type-label, .72rem);
    }
    .reading-filter-select {
      min-inline-size: 0;
      max-inline-size: 100%;
      padding: var(--ke-space-1, 2px) var(--ke-space-2, 4px);
      border: var(--ke-border-width, 1px) solid var(--ke-color-border, var(--background-modifier-border));
      border-radius: var(--ke-radius-control, 4px);
      background: var(--ke-color-surface, var(--background-primary));
      color: var(--ke-color-text, var(--text-normal));
      font: inherit;
      line-height: var(--ke-leading-control, 1.35);
    }
    .reading-filter-divider {
      color: var(--ke-color-border, var(--background-modifier-border));
      font-size: var(--ke-type-label, .72rem);
    }
    .reading-hub-body button:focus-visible,
    .reading-hub-section button:focus-visible,
    .reading-hub-section select:focus-visible {
      outline: 2px solid var(--ke-color-accent, var(--text-accent));
      outline-offset: 2px;
    }
    @media (max-width: 767px) {
      .reading-hub-body .prodigy-btn,
      .reading-hub-body .prodigy-action-bar button,
      .reading-hub-section button,
      .reading-hub-section select {
        min-block-size: var(--ke-touch-target, 44px);
        height: auto;
      }
      .reading-hub-section .reading-hub-action-row > * {
        flex: 1 1 12rem;
        max-inline-size: 100%;
      }
      .reading-filter-container {
        justify-content: flex-start;
      }
      .reading-filter-control {
        flex: 1 1 12rem;
      }
      .reading-filter-select {
        flex: 1 1 auto;
      }
    }
    @media (prefers-reduced-motion: reduce) {
      .reading-hub-body *,
      .reading-hub-section * {
        scroll-behavior: auto !important;
        transition: none !important;
        animation: none !important;
        transform: none !important;
      }
    }
  `;
};

let workspaceBody = container;
try {
  await loadProdigyScript("SYSTEM/Views/prodigy-performance-recorder.js", { optional: true });
  await loadProdigyScript("SYSTEM/Views/prodigy-workspace-readiness.js", { optional: true });
  await loadProdigyScript("SYSTEM/Views/prodigy-performance-exporter.js", { optional: true });
  await loadProdigyScript("SYSTEM/Views/prodigy-workspace-measurement.js", { optional: true });
  await loadProdigyScript("SYSTEM/Views/design-tokens.js");
  await loadProdigyScript("SYSTEM/Views/workspace-registry.js");
  await loadProdigyScript("SYSTEM/Views/prodigy-workspace-state-store.js");
  await loadProdigyScript("SYSTEM/Views/prodigy-app-shell.js");
  await loadProdigyScript("SYSTEM/Views/prodigy-adaptive-controls.js");
  await loadProdigyScript("SYSTEM/Views/workspace-navigation.js");
  await loadProdigyScript("SYSTEM/Views/knowledge-workspace-route.js");
  await loadProdigyScript("SYSTEM/Views/display-registry.js");
  await loadProdigyScript("SYSTEM/Views/prodigy-ui.js");
  await loadProdigyScript("SYSTEM/Views/object-lifecycle-core.js");
  await loadProdigyScript("SYSTEM/Views/object-lifecycle-view.js");
  await loadProdigyScript("SYSTEM/Views/object-engine-core.js");
  await loadProdigyScript("SYSTEM/Views/shared-dashboard.js");
  await loadProdigyScript("SYSTEM/Views/decision-packet-core.js");
  await loadProdigyScript("SYSTEM/Views/auction-decision-packet.js");
  await loadProdigyScript("SYSTEM/Views/decision-packet-reasons.js");
  await loadProdigyScript("SYSTEM/Views/reading-memory-core.js");
  await loadProdigyScript("SYSTEM/Views/reading-memory-retrieval.js");
  await loadProdigyScript("SYSTEM/Views/reading-memory-store.js");
  await loadProdigyScript("SYSTEM/Views/reading-memory-view.js");
  await loadProdigyScript("SYSTEM/Views/reading-decision-packet.js");
  await loadProdigyScript("SYSTEM/Views/knowledge-use-body-core.js");
  await loadProdigyScript("SYSTEM/Views/knowledge-use-body-store.js");
  await loadProdigyScript("SYSTEM/Views/knowledge-use-record-ui.js");
  await loadProdigyScript("SYSTEM/Views/reading-checklist-core.js");
  await loadProdigyScript("SYSTEM/Views/reading-checklist-store.js");
  await loadProdigyScript("SYSTEM/Views/reading-checklist-view.js");
  await loadProdigyScript("SYSTEM/Views/reading-question-ai.js");
  await loadProdigyScript("SYSTEM/Views/reading-thinking-delta-ai.js");
  await loadProdigyScript("SYSTEM/Views/knowledge-explorer-registry.js");
  await loadProdigyScript("SYSTEM/Views/knowledge-candidate-core.js");
  await loadProdigyScript("SYSTEM/Views/knowledge-candidate-store.js");
  await loadProdigyScript("SYSTEM/Views/reading-core.js");
  await loadProdigyScript("SYSTEM/Views/reading-store.js");
  await loadProdigyScript("SYSTEM/Views/reading-view.js");
  await loadProdigyScript("SYSTEM/Views/reading-book-create.js");
  await loadProdigyScript("SYSTEM/Views/reading-strategy-core.js");
  await loadProdigyScript("SYSTEM/Views/reading-workspace-core.js");
  await loadProdigyScript("SYSTEM/Views/reading-card.js");
  const readingShell = window.ProdigyWorkspaceNavigation.mount(container, { app, workspaceId: "reading", title: "독서" });
  const readingPerformance = readingShell.performance;
  const readingMeasurement = {
    performance: readingPerformance || null,
    dataScan: null,
    projection: null,
    domRender: null,
    dataScanFinished: false,
    projectionFinished: false,
    readinessMarked: false,
    shell: readingShell
  };
  window.__readingWorkspaceMeasurement = readingMeasurement;
  workspaceBody = readingShell.body;
  workspaceBody.classList.add("reading-hub-body");
  if (typeof workspaceBody.setAttr === "function") workspaceBody.setAttr("data-scroll-owner", "reading-workspace-body");
  else if (typeof workspaceBody.setAttribute === "function") workspaceBody.setAttribute("data-scroll-owner", "reading-workspace-body");
  ensureReadingHubStyles();
} catch (err) {
  if (window.ProdigyWorkspaceNavigation && window.ProdigyWorkspaceNavigation.renderLoaderError) {
    window.ProdigyWorkspaceNavigation.renderLoaderError(container, err, { title: "독서" });
  } else {
    container.empty();
    container.createEl("p", { text: "독서 워크스페이스를 불러오지 못했습니다.", attr: { role: "alert" } });
  }
  return;
}

// Create a complete Reading Object only after book metadata is available.
if (window.ProdigyUI) window.ProdigyUI.ensureStyles();
window.ProdigyAdaptiveControls.AdaptiveActionBar(workspaceBody, {
  label: "독서 등록",
  actions: [{
    label: "새 책 추가",
    onClick: () => window.ReadingBookCreate.open(app)
  }],
  secondaryActions: [{
    label: "수동 등록",
    onClick: () => {
      if (!window.ReadingView || !window.ReadingView.openManualRegistrationModal) return;
      window.ReadingView.openManualRegistrationModal(app, () => {
        try { delete window.__readingWorkspaceModel; } catch (_error) { window.__readingWorkspaceModel = null; }
      });
    }
  }],
  sheetParent: workspaceBody,
  sheetTitle: "독서 등록",
  moreLabel: "등록 방법"
});
  window.__readingWorkspacePerformance = readingPerformance;

```

# 읽는 중

```dataviewjs
// Card-first dashboard. Runtime + Strategy power the strip/actions — not a second UI wall.
const mapReading = (p) => Object.assign({}, p, {
  type: "reading",
  path: p.file.path,
  title: p.title || p.book_title || p.file.name,
  book_title: p.book_title || p.title || p.file.name,
  author: p.author,
  status: p.status,
  next_action: p.next_action,
  progress: p.progress,
  reading_strategy: p.reading_strategy,
  book_type: p.book_type,
  reading_type: p.reading_type,
  category: p.category,
  connections: p.connections,
  file: p.file,
  id: p.id,
  mtime: p.file && p.file.mtime,
  updated: p.updated
});

/** Single Runtime evaluate for the whole Reading hub (shared on window). */
const ensureRuntimeModel = (force) => {
  if (!force && window.__readingWorkspaceModel) return window.__readingWorkspaceModel;
  if (!window.ObjectEngine || !window.ReadingWorkspaceCore) return null;
  try {
    const all = dv.pages('"PARA/PROJECTS/Reading"').where(p => p.type === "reading").array().map(mapReading);
    const session = window.ObjectEngine.createRuntimeSession({});
    const build = window.ReadingWorkspaceCore.shareRuntimeModel
      || window.ReadingWorkspaceCore.buildWorkspaceModel;
    const model = build(all, { session });
    window.__readingWorkspaceModel = model;
    window.__readingRuntimeSession = session;
    return model;
  } catch (_e) {
    return null;
  }
};


const openContinueSession = (cont) => {
  if (!cont || !cont.object_path || !window.ReadingView || !window.ReadingCore) return;
  const page = dv.page(cont.object_path);
  const book = window.ReadingCore.normalizeBook(Object.assign({}, page || {}, {
    path: cont.object_path,
    title: cont.title,
    book_title: cont.title,
    next_action: cont.next_action,
    progress: cont.progress_number || cont.progress
  }));
  const open = window.ReadingView.openSessionModal || window.ReadingView.openQuickSession;
  open(app, book, () => {
    try { delete window.__readingWorkspaceModel; } catch (_e) { window.__readingWorkspaceModel = null; }
  }, { progress: cont.progress_number || cont.progress, next_action: cont.next_action });
};

const closeReadingPhase = (measurement, phase, status) => {
  const token = measurement && measurement[phase];
  if (measurement) measurement[phase] = null;
  const performance = measurement && measurement.performance;
  if (!performance || !token || typeof performance.end !== "function") return;
  performance.end(token, { scope: "reading", status });
};
const failReadingMeasurement = (measurement, error) => {
  closeReadingPhase(measurement, "dataScan", "failed");
  closeReadingPhase(measurement, "projection", "failed");
  closeReadingPhase(measurement, "domRender", "failed");
  const performance = measurement && measurement.performance;
  if (performance && typeof performance.fail === "function") {
    performance.fail(error, { phase: "error", scope: "reading" });
  }
};

const run = () => {
  this.container.classList.add("reading-hub-section");
  if (!window.renderReadingCard) return false;
  this.container.empty();

  const measurement = window.__readingWorkspaceMeasurement;
  const performance = measurement && measurement.performance;
  try {
    if (performance && measurement && !measurement.dataScanFinished && !measurement.dataScan) {
      measurement.dataScan = performance.start("data_scan", { scope: "reading" });
    }
  const model = ensureRuntimeModel();
  const pages = dv.pages('"PARA/PROJECTS/Reading"').where(p => p.type === "reading" && p.status === "reading");
    if (performance && measurement && !measurement.dataScanFinished) {
      closeReadingPhase(measurement, "dataScan", "loaded");
      measurement.dataScanFinished = true;
      measurement.projection = performance.start("projection", { scope: "reading" });
    }
  const renderList = (listPane) => {
    if (pages.length === 0) {
      listPane.createEl("span", {
        text: "진행 중인 독서가 없습니다.",
        attr: { class: "reading-hub-empty" }
      });
      return;
    }
    const items = pages.array ? pages.array() : [...pages];
    const focus = model && model.focus_path;
    items.sort((a, b) => {
      const firstPath = a.file && a.file.path;
      const secondPath = b.file && b.file.path;
      if (focus && firstPath === focus) return -1;
      if (focus && secondPath === focus) return 1;
      return 0;
    });
    items.forEach(p => window.renderReadingCard(p, listPane, "hero"));
  };

  const renderDetail = (detailPane) => {
    const cont = model && model.continue_reading;
    const today = model && model.today && model.today.object;
    const target = cont && !cont.empty ? cont : today ? {
      title: today.title,
      object_path: today.path,
      focus_path: today.path,
      next_action: today.next_action,
      progress: today.progress,
      progress_number: window.ReadingWorkspaceCore.progressNumber(today),
      action: today.continue_action,
      reason: model.today.reason
    } : null;
    const detail = detailPane.createEl("div", {
      attr: { class: "reading-continue-strip" }
    });
    detail.createEl("h2", {
      text: "이어 읽기",
      attr: { class: "reading-continue-title" }
    });
    if (!target) {
      detail.createEl("p", {
        text: "진행 중인 독서가 없습니다.",
        attr: { class: "reading-hub-empty" }
      });
      return;
    }
    detail.createEl("strong", { text: target.title || "현재 책", attr: { class: "reading-continue-book-title" } });
    const context = detail.createEl("div", { attr: { class: "reading-continue-context" } });
    context.createEl("span", { text: target.action || "이어 읽기" });
    if (target.progress) context.createEl("span", { text: ` · ${target.progress}` });
    if (target.next_action) detail.createEl("p", { text: `다음 · ${target.next_action}`, attr: { class: "reading-continue-detail" } });
    if (target.reason) detail.createEl("p", { text: `이유 · ${target.reason}`, attr: { class: "reading-continue-detail reading-continue-detail-muted" } });
    if (model.strategy && !model.strategy.empty && model.strategy.strategy_label) {
      detail.createEl("p", { text: `전략 · ${model.strategy.strategy_label}`, attr: { class: "reading-continue-detail reading-continue-detail-muted" } });
    }
    const actions = detail.createEl("div", { attr: { class: "prodigy-btn-row reading-continue-actions" } });
    const read = window.ProdigyUI.button(actions, "오늘 읽기", { primary: true });
    read.onclick = (event) => { if (event && event.preventDefault) event.preventDefault(); openContinueSession(target); };
    const focusButton = window.ProdigyUI.button(actions, "이 책 포커스");
    focusButton.onclick = (event) => {
      if (event && event.preventDefault) event.preventDefault();
      if (responsive && typeof responsive.focusCard === "function") {
        responsive.focusCard(target.focus_path || target.object_path, { opener: focusButton });
        return;
      }
      if (window.Notice) new window.Notice("독서 목록이 아직 준비되지 않았습니다. 잠시 후 다시 시도해 주세요.");
    };
    const knowledge = window.ProdigyUI.button(actions, "Knowledge Explorer에서 검토");
    knowledge.onclick = (event) => { if (event && event.preventDefault) event.preventDefault(); window.ReadingView.openKnowledgeExplorer(app); };
  };

    if (performance && measurement && !measurement.projectionFinished) {
      closeReadingPhase(measurement, "projection", "projected");
      measurement.projectionFinished = true;
    }
    if (performance && measurement && measurement.projectionFinished && !measurement.readinessMarked && !measurement.domRender) {
      measurement.domRender = performance.start("dom_render", { scope: "reading" });
    }
  const logicalWidth = Number(this.container.clientWidth) || window.ProdigyTokens.BREAKPOINTS.wide;
  const responsive = window.ReadingView.mountResponsiveWorkspace({
    container: this.container,
    model,
    logicalWidth,
    renderList,
    renderDetail
  });
  if (this.container.__readingResponsiveObserver) this.container.__readingResponsiveObserver.disconnect();
  if (typeof ResizeObserver === "function") {
    const observer = new ResizeObserver((entries) => {
      const width = entries[0] && entries[0].contentRect && entries[0].contentRect.width;
      if (Number.isFinite(width)) responsive.setLogicalWidth(width);
    });
    observer.observe(this.container);
    this.container.__readingResponsiveObserver = observer;
  }
    if (performance && measurement && !measurement.readinessMarked) {
      closeReadingPhase(measurement, "domRender", "rendered");
      if (measurement.shell && typeof measurement.shell.readinessSnapshot === "function") {
        const snapshot = measurement.shell.readinessSnapshot("reading", {
          status: "deterministic",
          settled: true,
          enabledAction: { id: "reading.open", enabled: true }
        });
        if (snapshot) {
          performance.markReady("reading", snapshot);
          measurement.readinessMarked = true;
        }
      }
    }
    return true;
  } catch (error) {
    failReadingMeasurement(measurement, error);
    throw error;
  }
};
if (!run()) {
  this.container.empty();
  this.container.createEl("span", { text: "로딩 중..." });
  const t = setInterval(() => { if (run()) clearInterval(t); }, 100);
  setTimeout(() => clearInterval(t), 10000);
}
```

---

## 최근 세션

```js-engine
if (!container) return;
container.classList.add("reading-hub-section");
container.empty();
window.obsidian = obsidian;
window.app = app;

const loadProdigyScript = async (path) => {
  const tFile = app.vault.getAbstractFileByPath(path);
  if (!tFile) return;
  const source = await app.vault.read(tFile);
  const evaluate = () => (new Function(source))();
  const session = window.__prodigyMeasurementEntry && window.__prodigyMeasurementEntry.session;
  if (session && typeof session.measureModule === "function") await session.measureModule(path, evaluate);
  else evaluate();
};

try {
  await loadProdigyScript("SYSTEM/Views/prodigy-ui.js");
  await loadProdigyScript("SYSTEM/Views/knowledge-explorer-registry.js");
  await loadProdigyScript("SYSTEM/Views/knowledge-candidate-core.js");
  await loadProdigyScript("SYSTEM/Views/knowledge-candidate-store.js");
  await loadProdigyScript("SYSTEM/Views/reading-core.js");
  await loadProdigyScript("SYSTEM/Views/reading-store.js");
  await loadProdigyScript("SYSTEM/Views/reading-view.js");
  const render = window.ReadingView?.renderSessionHistory || window.ReadingView?.renderLearningLoop;
  if (render) await render(app, container);
  else {
    container.createEl("span", {
      text: "최근 세션이 없습니다.",
      attr: { class: "reading-hub-empty" }
    });
  }
} catch (error) {
  container.createEl("p", {
    text: "세션 기록을 불러오지 못했습니다.",
    attr: { class: "reading-hub-error" }
  });
  if (window.prodigyDebugMode) {
    container.createEl("pre", { text: error.stack || error.message });
  }
}
```

---

## 읽기 대기

```dataviewjs
const run = () => {
  this.container.classList.add("reading-hub-section");
  if (window.renderReadingCard) {
    this.container.empty();
    const pages = dv.pages('"PARA/PROJECTS/Reading"').where(p => p.type === "reading" && p.status === "queue");
    if (pages.length === 0) {
      this.container.createEl("span", {
        text: "독서 대기열이 비어 있습니다.",
        attr: { class: "reading-hub-empty" }
      });
    } else {
      const grid = this.container.createEl("div", {
        attr: { class: "reading-card-grid" }
      });
      pages.forEach(p => window.renderReadingCard(p, grid, "grid"));
    }
    return true;
  }
  return false;
};
if (!run()) {
  this.container.empty();
  this.container.createEl("span", { text: "로딩 중..." });
  const t = setInterval(() => { if (run()) clearInterval(t); }, 100);
  setTimeout(() => clearInterval(t), 10000);
}
```

---

## 오래 방치

```dataviewjs
const run = () => {
  this.container.classList.add("reading-hub-section");
  if (!window.renderReadingCard) return false;
  this.container.empty();
  const model = window.__readingWorkspaceModel;
  const stale = model && model.stale_reading;
  if (stale && !stale.empty && stale.items && stale.items.length) {
    const paths = new Set(stale.items.map(i => i.path).filter(Boolean));
    const pages = dv.pages('"PARA/PROJECTS/Reading"')
      .where(p => p.type === "reading" && paths.has(p.file.path));
    if (pages.length === 0) {
      this.container.createEl("span", {
        text: "오래 방치된 독서가 없습니다.",
        attr: { class: "reading-hub-empty" }
      });
    } else {
      this.container.createEl("div", {
        text: "Runtime lifecycle · 오래 갱신되지 않은 읽는 중 책",
        attr: { class: "reading-hub-note" }
      });
      pages.forEach(p => window.renderReadingCard(p, this.container, "simple"));
    }
    return true;
  }
  this.container.createEl("span", {
    text: "오래 방치된 독서가 없습니다.",
    attr: { class: "reading-hub-empty" }
  });
  return true;
};
if (!run()) {
  this.container.empty();
  this.container.createEl("span", { text: "로딩 중..." });
  const t = setInterval(() => { if (run()) clearInterval(t); }, 100);
  setTimeout(() => clearInterval(t), 10000);
}
```

---

---

## 완독 임박

```dataviewjs
const run = () => {
  this.container.classList.add("reading-hub-section");
  if (!window.renderReadingCard) return false;
  this.container.empty();
  const model = window.__readingWorkspaceModel;
  const finish = model && model.finish_soon;
  if (finish && !finish.empty && finish.items && finish.items.length) {
    const paths = new Set(finish.items.map(i => i.path).filter(Boolean));
    const pages = dv.pages('"PARA/PROJECTS/Reading"')
      .where(p => p.type === "reading" && paths.has(p.file.path));
    if (pages.length === 0) {
      this.container.createEl("span", {
        text: "완독 임박 책이 없습니다.",
        attr: { class: "reading-hub-empty" }
      });
    } else {
      this.container.createEl("div", {
        text: "진행 75% 이상 · 상태 전환은 직접 결정",
        attr: { class: "reading-hub-note" }
      });
      pages.forEach(p => window.renderReadingCard(p, this.container, "simple"));
    }
    return true;
  }
  this.container.createEl("span", {
    text: "완독 임박 책이 없습니다.",
    attr: { class: "reading-hub-empty" }
  });
  return true;
};
if (!run()) {
  this.container.empty();
  this.container.createEl("span", { text: "로딩 중..." });
  const t = setInterval(() => { if (run()) clearInterval(t); }, 100);
  setTimeout(() => clearInterval(t), 10000);
}
```

---

---

## 복기 필요

```dataviewjs
const run = () => {
  this.container.classList.add("reading-hub-section");
  if (window.renderReadingCard) {
    this.container.empty();
    // Prefer Runtime-derived waiting list when preloaded; else status reviewing
    const model = window.__readingWorkspaceModel;
    if (model && model.waiting_review && !model.waiting_review.empty && model.waiting_review.items) {
      const paths = new Set(model.waiting_review.items.map(i => i.path).filter(Boolean));
      let pages = dv.pages('"PARA/PROJECTS/Reading"')
        .where(p => p.type === "reading" && paths.has(p.file.path));
      if (pages.length === 0) {
        pages = dv.pages('"PARA/PROJECTS/Reading"').where(p => p.type === "reading" && p.status === "reviewing");
      }
      if (pages.length === 0) {
        this.container.createEl("span", {
          text: "읽을 복기 대상이 없습니다.",
          attr: { class: "reading-hub-empty" }
        });
      } else {
        pages.forEach(p => window.renderReadingCard(p, this.container, "simple"));
      }
      return true;
    }
    const pages = dv.pages('"PARA/PROJECTS/Reading"').where(p => p.type === "reading" && p.status === "reviewing");
    if (pages.length === 0) {
      this.container.createEl("span", {
        text: "읽을 복기 대상이 없습니다.",
        attr: { class: "reading-hub-empty" }
      });
    } else {
      pages.forEach(p => window.renderReadingCard(p, this.container, "simple"));
    }
    return true;
  }
  return false;
};
if (!run()) {
  this.container.empty();
  this.container.createEl("span", { text: "로딩 중..." });
  const t = setInterval(() => { if (run()) clearInterval(t); }, 100);
  setTimeout(() => clearInterval(t), 10000);
}
```

---

---

# 최근 완독

```dataviewjs
const run = () => {
  this.container.classList.add("reading-hub-section");
  if (window.renderReadingCard) {
    this.container.empty();
    const current = dv.current();
    const sortBy = current.sort_completed_by || "date";
    const filterRating = Number(current.filter_rating);

    const filterContainer = this.container.createEl("div", {
      attr: { class: "reading-filter-container" }
    });

    const makeSelectInline = (parent, label, field, options, currentVal) => {
      const wrapper = parent.createEl('div', { attr: { class: "reading-filter-control" } });
      wrapper.createEl('span', { text: label, attr: { class: "reading-filter-label" } });
      
      const sel = wrapper.createEl('select', { 
        attr: { class: "reading-filter-select" }
      });
      
      options.forEach(o => {
        const opt = sel.createEl('option', { text: o.text, value: o.value });
        if (o.value === String(currentVal !== undefined && currentVal !== null ? currentVal : o.value)) {
          opt.selected = true;
        }
      });
      
      sel.onchange = async () => {
        const file = app.workspace.getActiveFile();
        if (file) {
          await app.fileManager.processFrontMatter(file, (fm) => {
            fm[field] = sel.value;
          });
        }
      };
    };

    makeSelectInline(filterContainer, '필터:', 'filter_rating', [
      { text: '전체', value: '' },
      { text: '5점', value: '5' },
      { text: '4점 이상', value: '4' },
      { text: '3점 이상', value: '3' }
    ], current.filter_rating);

    filterContainer.createEl('span', { text: '|', attr: { class: "reading-filter-divider" } });

    makeSelectInline(filterContainer, '정렬:', 'sort_completed_by', [
      { text: '최근 완독 순', value: 'date' },
      { text: '평점 높은 순', value: 'rating' }
    ], current.sort_completed_by);

    let pages = dv.pages('"PARA/PROJECTS/Reading"').where(p => p.type === "reading" && p.status === "completed");

    if (filterRating) {
      pages = pages.where(p => p.rating && Number(p.rating) >= filterRating);
    }

    if (sortBy === "rating") {
      pages = pages.sort(p => p.rating || 0, "desc");
    } else {
      pages = pages.sort(p => p.file.mtime, "desc");
    }

    if (pages.length === 0) {
      this.container.createEl("span", {
        text: "최근 완독 기록이 없습니다.",
        attr: { class: "reading-hub-empty" }
      });
    } else {
      pages.forEach(p => window.renderReadingCard(p, this.container, "simple"));
    }
    return true;
  }
  return false;
};
if (!run()) {
  this.container.empty();
  this.container.createEl("span", { text: "로딩 중..." });
  const t = setInterval(() => { if (run()) clearInterval(t); }, 100);
  setTimeout(() => clearInterval(t), 10000);
}
```

---


# 객체 라이프사이클

```dataviewjs
this.container.classList.add("reading-hub-section");
if (window.ObjectLifecycleCore && window.ObjectLifecycleView) {
  const pages = dv.pages('"PARA/PROJECTS/Reading"').where(p => p.type === "reading").array();
  const evaluation = window.ObjectLifecycleCore.evaluateCollection(pages);
  window.ObjectLifecycleView.renderWorkspaceSummary({
    container: this.container,
    counts: evaluation.counts,
    title: "독서 라이프사이클"
  });
} else {
  this.container.createEl("span", {
    text: "객체 라이프사이클 모듈을 불러오는 중...",
    attr: { class: "reading-hub-note" }
  });
}
```
