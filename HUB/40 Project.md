---
cssclasses:
  - prodigy-hub-note
  - hide-properties_reading
---
```js-engine
const file = app.workspace.getActiveFile();
if (!file) return;
if (!container) return;
container.empty();

// Expose globals for external scripts
window.obsidian = obsidian;
window.app = app;
window.__prodigyMeasurementEntry = window.__prodigyMeasurementEntry && window.__prodigyMeasurementEntry.workspaceId === "project"
  ? window.__prodigyMeasurementEntry
  : { workspaceId: "project" };
const loadWorkspaceBootstrap = async (path) => {
  const file = app.vault.getAbstractFileByPath(path);
  if (!file) throw new Error(`워크스페이스 부트스트랩 파일이 없습니다: ${path}`);
  (new Function(await app.vault.read(file)))();
};
if (!window.ProdigyWorkspaceManifest) await loadWorkspaceBootstrap("SYSTEM/Views/prodigy-workspace-manifest.js");
if (!window.ProdigyHubLoader) await loadWorkspaceBootstrap("SYSTEM/Views/prodigy-hub-loader.js");
const projectManifest = window.ProdigyWorkspaceManifest.get("project");
const projectLayoutParticipants = new Set();
window.prodigyProjectReady = window.ProdigyHubLoader.mountWorkspace(app, projectManifest, {
  container,
  renderers: { project: async (mountContext) => {
  window.__prodigyProjectMountScope = mountContext.scope;
  mountContext.scope.track(() => { if (window.__prodigyProjectMountScope === mountContext.scope) delete window.__prodigyProjectMountScope; });
  window.renderResponsiveProjectSection = (options) => {
    if (!window.renderDashboardSection || !window.renderProjectCard) return false;
    const host = options.container;
    const explicitWidth = Number(options.logicalWidth);
    const measuredWidth = Number(host.clientWidth);
    const logicalWidth = Number.isFinite(explicitWidth)
      ? explicitWidth
      : Number.isFinite(measuredWidth) && measuredWidth > 0 ? measuredWidth : window.ProdigyTokens.RESPONSIVE_BREAKPOINTS.smallDesktopMax;
    const layout = window.ProjectWizardCore.resolveProjectWorkspaceLayout(logicalWidth);
    host.empty();
    const list = host.createEl("div", {
      attr: {
        class: "prodigy-project-list",
        "data-density": layout.density,
        style: `display:grid;grid-template-columns:repeat(${options.isCollapsed ? 1 : layout.columns},minmax(0,1fr));gap:10px;min-inline-size:0;`
      }
    });
    window.renderDashboardSection(Object.assign({}, options, {
      type: "project",
      container: list,
      renderer: window.renderProjectCard
    }));
    return true;
  };
  const scopedProjectRenderer = window.renderResponsiveProjectSection;
  mountContext.scope.track(() => {
    if (window.renderResponsiveProjectSection === scopedProjectRenderer) delete window.renderResponsiveProjectSection;
    delete window.__prodigyProjectShell;
  });
  const projectShell = window.ProdigyWorkspaceNavigation.mount(container, { app, workspaceId: "project", title: "프로젝트", mountScope: mountContext.scope });
  projectShell.body.createEl("style", { text: '.prodigy-app-shell[data-workspace-id="project"]>.prodigy-workspace-bar{padding-inline:4px}' });
  const projectKnowledge = await window.ProjectContextAdapter.mountResurfacing({
    app,
    signal: mountContext.signal,
    container: projectShell.body
  });
  if (projectKnowledge && typeof projectKnowledge.dispose === "function") mountContext.scope.track(projectKnowledge.dispose);
  window.__prodigyProjectShell = projectShell;
  window.__prodigyProjectMeasurement = {
    performance: projectShell.performance,
    dataScanToken: null,
    projectionToken: null,
    domRenderToken: null,
    closed: { data_scan: false, projection: false, dom_render: false }
  };
  } }
});
window.__prodigyProjectLayoutAck = async (participant) => {
  const mounted = await window.prodigyProjectReady;
  if (!mounted || mounted.signal.aborted) throw new Error("프로젝트 마운트가 닫히지 않았습니다.");
  projectLayoutParticipants.add(String(participant));
  if (projectLayoutParticipants.size !== 7) return;
  const shell = window.__prodigyProjectShell && window.__prodigyProjectShell.element;
  if (!shell || typeof shell.dispatchEvent !== "function") throw new Error("프로젝트 레이아웃 소유자가 없습니다.");
  const emitSettled = () => shell.dispatchEvent(new CustomEvent("prodigy-project-layout-settled", { bubbles: true, detail: {
    workspaceId: "project",
    mountGeneration: mounted.mountGeneration,
    participants: [...projectLayoutParticipants].sort()
  } }));
  if (!shell.__prodigyProjectLayoutAcknowledger) {
    const acknowledge = (event) => {
      if (Number(event && event.detail && event.detail.mountGeneration) === mounted.mountGeneration) emitSettled();
    };
    shell.__prodigyProjectLayoutAcknowledger = acknowledge;
    shell.addEventListener("prodigy-project-layout-request", acknowledge);
    mounted.scope.track(() => shell.removeEventListener("prodigy-project-layout-request", acknowledge));
  }
  emitSettled();
};

try {
  await window.prodigyProjectReady;
} catch (err) {
  const preservesRequiredRecovery = window.ProdigyHubLoader && typeof window.ProdigyHubLoader.preserveRequiredRecovery === "function" && window.ProdigyHubLoader.preserveRequiredRecovery(err, container);
  if (!preservesRequiredRecovery) {
    if (window.ProdigyWorkspaceNavigation && window.ProdigyWorkspaceNavigation.renderLoaderError) {
      window.ProdigyWorkspaceNavigation.renderLoaderError(container, err, { title: "프로젝트" });
    } else {
      container.empty();
      container.createEl("p", { text: "프로젝트 워크스페이스를 불러오지 못했습니다.", attr: { role: "alert" } });
    }
  }
  return;
}
```

# 프로젝트 실행

```js-engine
if (!container) return;
container.empty();
await window.prodigyProjectReady;

const refreshProjectViews = () => {
  try {
    const dvPlugin = app.plugins?.plugins?.dataview;
    if (dvPlugin?.api?.index?.touch) dvPlugin.api.index.touch();
  } catch (_error) { /* ignore */ }
  try {
    app.workspace.trigger("dataview:refresh-views");
  } catch (_error) { /* ignore */ }
  try {
    if (app.commands?.executeCommandById) {
      app.commands.executeCommandById("dataview:dataview-force-refresh-views");
    }
  } catch (_error) { /* ignore */ }
};

const tokens = window.ProdigyTokens;
const measuredWidth = Number(container.clientWidth);
const logicalWidth = Number.isFinite(measuredWidth) && measuredWidth > 0
  ? measuredWidth
  : tokens.RESPONSIVE_BREAKPOINTS.smallDesktopMax;
const layout = window.ProjectWizardCore.resolveProjectWorkspaceLayout(logicalWidth);
container.setAttribute("data-density", layout.density);

const adaptiveBar = window.ProdigyAdaptiveControls.AdaptiveActionBar(container, {
  label: "프로젝트 실행 작업",
  actions: [{
    label: "+ 프로젝트 시작",
    onClick: () => {
      if (window.openProjectWizard) {
        window.openProjectWizard({ logicalWidth });
      } else {
        new Notice("프로젝트 시작 도구를 불러오지 못했습니다.", 9000);
      }
    }
  }],
  secondaryActions: [{ label: "새로 고침", onClick: refreshProjectViews }],
  sheetTitle: "프로젝트 보조 작업"
});
adaptiveBar.element.style.minBlockSize = `${layout.actionBarHeight}px`;
const launchButton = adaptiveBar.primary.querySelector("button");
if (launchButton) launchButton.classList.add("prodigy-btn-primary");

if (!window.prodigyProjectWorkspaceStateStore) {
  window.prodigyProjectWorkspaceStateStore = new window.ProdigyWorkspaceStateStore.WorkspaceStateStore({});
}
const storedProjectState = window.prodigyProjectWorkspaceStateStore.getWorkspaceState("project");
const storedProjectType = storedProjectState.filters && storedProjectState.filters.project_type;
if (window.prodigyProjectTypeFilter == null || window.prodigyProjectTypeFilter === "") {
  window.prodigyProjectTypeFilter = storedProjectType || "all";
}

const filterRow = container.createEl("div", {
  attr: {
    class: "prodigy-project-type-filter",
    style: `display:grid;grid-template-columns:${layout.density === "compact" ? "repeat(2,minmax(0,1fr))" : "repeat(6,max-content)"};gap:6px;align-items:center;margin:4px 0 12px;min-inline-size:0;`
  }
});
filterRow.createEl("span", {
  text: "유형",
  attr: { style: "font-size:var(--ke-type-label);font-weight:700;color:var(--ke-color-muted);margin-right:4px;" }
});

const filterOptions = [
  { key: "all", label: "전체" },
  { key: "business", label: "사업" },
  { key: "work", label: "회사" },
  { key: "personal", label: "개인" },
  { key: "uncategorized", label: "미분류" }
];
const filterButtons = [];

const styleFilterButton = (btn, active) => {
  btn.classList.toggle("is-active", !!active);
  btn.classList.add("prodigy-btn", "prodigy-btn-chip");
  btn.disabled = false;
  btn.style.pointerEvents = "auto";
  if (layout.density === "compact") {
    btn.style.minBlockSize = `${layout.touchTarget}px`;
    btn.style.minInlineSize = `${layout.touchTarget}px`;
  }
};

filterOptions.forEach((item) => {
  const btn = window.ProdigyUI
    ? window.ProdigyUI.button(filterRow, item.label, {
      chip: true,
      active: window.prodigyProjectTypeFilter === item.key
    })
    : filterRow.createEl("button", {
      text: item.label,
      attr: { type: "button", class: "prodigy-btn prodigy-btn-chip" }
    });
  styleFilterButton(btn, window.prodigyProjectTypeFilter === item.key);
  filterButtons.push({ key: item.key, btn });

  const onProjectTypeFilter = (event) => {
    event.preventDefault();
    event.stopPropagation();
    window.prodigyProjectTypeFilter = item.key;
    window.prodigyProjectWorkspaceStateStore.setWorkspaceState("project", {
      filters: { project_type: item.key },
      density: layout.density
    });
    filterButtons.forEach(({ key, btn: other }) => {
      styleFilterButton(other, key === item.key);
    });
    refreshProjectViews();
  };
  const projectScope = window.__prodigyProjectMountScope;
  if (projectScope && typeof projectScope.listen === "function") projectScope.listen(btn, "click", onProjectTypeFilter);
  else btn.addEventListener("click", onProjectTypeFilter);
});
```

# 객체 라이프사이클

```dataviewjs
// Collapsed by default — Today is the primary operating surface
const host = this.container;
host.empty();
await window.prodigyProjectReady;
const lifecycleWidth = Number(host.clientWidth);
const lifecycleLayout = window.ProjectWizardCore.resolveProjectWorkspaceLayout(
  Number.isFinite(lifecycleWidth) && lifecycleWidth > 0 ? lifecycleWidth : window.ProdigyTokens.RESPONSIVE_BREAKPOINTS.smallDesktopMax
);
const fold = host.createEl("details", {
  attr: {
    class: "prodigy-lifecycle-fold",
    "data-density": lifecycleLayout.density,
    style: "border:1px solid var(--ke-color-border);border-radius:var(--ke-radius-control);background:var(--ke-color-surface-secondary);padding:2px 10px 8px;margin:0 0 8px;"
  }
});
const summary = fold.createEl("summary", {
  text: "객체 라이프사이클 · 접힘 (상태 요약)",
  attr: {
    style: `font-weight:700;font-size:var(--ke-type-heading);color:var(--ke-color-muted);cursor:pointer;min-height:${lifecycleLayout.density === "compact" ? lifecycleLayout.touchTarget : 36}px;display:flex;align-items:center;list-style:none;`
  }
});
const body = fold.createEl("div", { attr: { style: "margin-top:6px;" } });

if (window.ObjectLifecycleCore && window.ObjectLifecycleView) {
  const pages = dv.pages('"PARA/PROJECTS"')
    .where(p => p.type === "project" || p.type === "project_note" || p.type === "project_family")
    .array();
  const evaluation = window.ObjectLifecycleCore.evaluateCollection(pages);
  window.ObjectLifecycleView.renderWorkspaceSummary({
    container: body,
    counts: evaluation.counts,
    title: "프로젝트 라이프사이클"
  });
} else {
  body.createEl("span", {
    text: "객체 라이프사이클 모듈을 불러오는 중...",
    attr: { style: "color:var(--ke-color-muted);font-size:var(--ke-type-body);" }
  });
}
```

# 오늘

```dataviewjs
await window.prodigyProjectReady;
const projectMeasurement = window.__prodigyProjectMeasurement;
const projectPerformance = projectMeasurement && projectMeasurement.performance;
const endProjectMeasurement = (phase, token, fields) => {
  if (!projectMeasurement || !projectPerformance || !token || projectMeasurement.closed[phase]) return;
  projectPerformance.end(token, fields);
  projectMeasurement.closed[phase] = true;
};
if (projectMeasurement && projectPerformance && !projectMeasurement.dataScanToken && !projectMeasurement.closed.data_scan) {
  projectMeasurement.dataScanToken = projectPerformance.start("data_scan", { scope: "project", status: "scanning" });
}
try {
const now = new Date();
const todayStr = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

const allProjects = dv.pages().where(p => p.type === "project");

let dueTodayCount = 0;
let missingActionCount = 0;
let blockedCount = 0;
const activeProjects = [];

allProjects.forEach(p => {
  const isCompletedOrArchived = ["completed", "reviewing", "archived"].includes(p.status);
  
  if (!isCompletedOrArchived) {
    activeProjects.push(p);
    
    if (p.due_date === todayStr) {
      dueTodayCount++;
    }
    
    if (!p.next_action || String(p.next_action).trim() === "" || p.next_action === "정보 없음") {
      missingActionCount++;
    }
    
    if (p.status === "blocked") {
      blockedCount++;
    }
  }
});
endProjectMeasurement("data_scan", projectMeasurement && projectMeasurement.dataScanToken, { scope: "project", status: "loaded" });
if (projectMeasurement && projectPerformance && !projectMeasurement.projectionToken && !projectMeasurement.closed.projection) {
  projectMeasurement.projectionToken = projectPerformance.start("projection", { scope: "project", status: "projecting" });
}

activeProjects.sort((a, b) => {
  const statusWeight = { doing: 1, planning: 2, idea: 3, blocked: 4 };
  const wA = statusWeight[a.status] || 99;
  const wB = statusWeight[b.status] || 99;
  if (wA !== wB) return wA - wB;
  
  const dtA = a.due_date ? new Date(a.due_date) : null;
  const dtB = b.due_date ? new Date(b.due_date) : null;
  if (dtA && dtB) return dtA - dtB;
  if (dtA) return -1;
  if (dtB) return 1;
  return 0;
});

// Prefer Object Engine primary project when available (same runtime as Launcher)
let nextProj = activeProjects[0];
let engineContinue = null;
try {
  if (window.ObjectEngine && window.ObjectEngine.evaluateObjects && window.ObjectEngine.selectPrimaryObject) {
    const states = window.ObjectEngine.evaluateObjects(activeProjects.array ? activeProjects.array() : activeProjects);
    const primary = window.ObjectEngine.selectPrimaryObject(states, "project");
    if (primary && primary.source_path) {
      const match = activeProjects.find(p => (p.file && p.file.path) === primary.source_path || p.path === primary.source_path);
      if (match) nextProj = match;
      engineContinue = primary.continue_target || (window.ObjectEngine.getContinueTarget && window.ObjectEngine.getContinueTarget(primary));
    }
  }
} catch (_e) {
  engineContinue = null;
}
endProjectMeasurement("projection", projectMeasurement && projectMeasurement.projectionToken, { scope: "project", status: "projected" });
if (projectMeasurement && projectPerformance && !projectMeasurement.domRenderToken && !projectMeasurement.closed.dom_render) {
  projectMeasurement.domRenderToken = projectPerformance.start("dom_render", { scope: "project", status: "rendering" });
}

const todayTokens = window.ProdigyTokens;
const todayWidth = Number(this.container.clientWidth);
const todayLayout = window.ProjectWizardCore.resolveProjectWorkspaceLayout(
  Number.isFinite(todayWidth) && todayWidth > 0 ? todayWidth : todayTokens.RESPONSIVE_BREAKPOINTS.smallDesktopMax
);
const mainBox = this.container.createEl('div', {
  attr: {
    class: "prodigy-project-today prodigy-full-bleed",
    "data-density": todayLayout.density,
    style: `display:grid;grid-template-columns:repeat(${todayLayout.columns},minmax(0,1fr));gap:var(--ke-space-4);min-inline-size:0;`
  }
});

const statsBox = mainBox.createEl('div', {
  attr: { class: "prodigy-project-today-stats prodigy-utility-card", style: `display:flex;flex-direction:column;gap:var(--ke-space-2);min-inline-size:0;` }
});
statsBox.createEl('div', { text: '오늘 현황', attr: { style: 'font-weight:bold;font-size:var(--ke-type-heading);color:var(--ke-color-accent);border-bottom:1px solid var(--ke-color-border);padding-bottom:4px;' } });

const addStatItem = (parent, label, count, color, isHighlight) => {
  const row = parent.createEl('div', { attr: { style: 'display:flex;justify-content:space-between;align-items:center;font-size:var(--ke-type-body);' } });
  row.createEl('span', { text: label, attr: { style: 'color:var(--ke-color-muted);' } });
  row.createEl('span', {
    text: `${count}건`,
    attr: {
      style: `font-weight:bold;color:${color};background:${isHighlight ? todayTokens.badgeBg(color) : 'transparent'};padding:${isHighlight ? '1px 6px' : '0'};border-radius:var(--ke-radius-control);`
    }
  });
};

addStatItem(statsBox, '오늘 마감', dueTodayCount, todayTokens.COLORS.error, dueTodayCount > 0);
addStatItem(statsBox, '다음 행동 없음', missingActionCount, todayTokens.COLORS.warning, missingActionCount > 0);
addStatItem(statsBox, '지연 프로젝트', blockedCount, todayTokens.COLORS.error, blockedCount > 0);

const actionBox = mainBox.createEl('div', {
  attr: { class: "prodigy-project-next-action prodigy-utility-card", style: `display:flex;flex-direction:column;gap:var(--ke-space-2);min-inline-size:0;` }
});
actionBox.createEl('div', { text: '다음 행동', attr: { style: 'font-weight:bold;font-size:var(--ke-type-heading);color:var(--ke-color-accent);border-bottom:1px solid var(--ke-color-border);padding-bottom:4px;' } });

if (nextProj) {
  const linkRow = actionBox.createEl('div', { attr: { style: 'margin-top:2px;display:flex;align-items:center;gap:6px;flex-wrap:wrap;' } });
  const rawType = String(nextProj.project_type || "").trim().toLowerCase();
  const typeLabel = rawType === "business" ? "사업" : rawType === "work" ? "회사" : rawType === "personal" ? "개인" : "미분류";
  linkRow.createEl('span', {
    text: typeLabel,
    attr: { style: 'font-size:var(--ke-type-chrome);font-weight:700;color:var(--ke-color-muted);background:var(--ke-color-hover);padding:1px 6px;border-radius:var(--ke-radius-pill);' }
  });
  const linkSpan = linkRow.createEl('span', { attr: { style: 'font-size:var(--ke-type-body);font-weight:bold;' } });
  dv.api.renderValue(nextProj.file.link, linkSpan, dv.component, nextProj.file.path, true);
  
  const actionText = (engineContinue && engineContinue.action)
    || nextProj.next_action
    || "지정된 액션이 없습니다.";
  actionBox.createEl('div', {
    text: actionText,
    attr: { style: `font-size:var(--ke-type-body);color:var(--ke-color-text);background:var(--ke-color-hover);padding:6px 8px;border-radius:var(--ke-radius-control);border-left:3px solid ${todayTokens.COLORS.error};margin-top:4px;overflow-wrap:anywhere;` }
  });
} else {
  actionBox.createEl('div', { text: '진행 중인 작업이 없습니다.', attr: { style: 'font-size:var(--ke-type-body);color:var(--ke-color-muted);text-align:center;margin-top:12px;' } });
}
endProjectMeasurement("dom_render", projectMeasurement && projectMeasurement.domRenderToken, { scope: "project", status: "rendered" });
const projectShell = window.__prodigyProjectShell;
const readinessSnapshot = projectShell && typeof projectShell.readinessSnapshot === "function"
  ? projectShell.readinessSnapshot("project", {
      status: "deterministic",
      settled: true,
      enabledAction: { id: "project.open", enabled: true }
    })
  : null;
if (projectPerformance && readinessSnapshot) projectPerformance.markReady("project", readinessSnapshot);
} catch (error) {
  endProjectMeasurement("data_scan", projectMeasurement && projectMeasurement.dataScanToken, { scope: "project", status: "failed" });
  endProjectMeasurement("projection", projectMeasurement && projectMeasurement.projectionToken, { scope: "project", status: "failed" });
  endProjectMeasurement("dom_render", projectMeasurement && projectMeasurement.domRenderToken, { scope: "project", status: "failed" });
  if (projectPerformance && typeof projectPerformance.fail === "function") {
    projectPerformance.fail(error, { phase: "error", scope: "project" });
  }
}
```

---

# 워크플로

```js-engine
const file = app.workspace.getActiveFile();
if (!file) return;
if (!container) return;
container.empty();
await window.prodigyProjectReady;

const allProjects = app.vault.getFiles().filter(f => {
  const c = app.metadataCache.getFileCache(f);
  return c?.frontmatter?.type === "project";
});

const counts = { idea: 0, planning: 0, doing: 0, blocked: 0, completed: 0, reviewing: 0, archived: 0 };

allProjects.forEach(f => {
  const c = app.metadataCache.getFileCache(f);
  const status = c?.frontmatter?.status || "idea";
  if (counts[status] !== undefined) {
    counts[status]++;
  }
});

const workflowWidth = Number(container.clientWidth);
const workflowLayout = window.ProjectWizardCore.resolveProjectWorkspaceLayout(
  Number.isFinite(workflowWidth) && workflowWidth > 0 ? workflowWidth : window.ProdigyTokens.RESPONSIVE_BREAKPOINTS.smallDesktopMax
);
const pipelineBox = container.createEl('div', {
  attr: {
    class: "prodigy-project-pipeline prodigy-utility-card",
    "data-density": workflowLayout.density,
    style: `display:grid;grid-template-columns:repeat(${workflowLayout.columns},minmax(0,1fr));gap:var(--ke-space-3);min-inline-size:0;`
  }
});

const statusStep = (status) => {
  const info = window.prodigyDisplay.statusInfo(status);
  const count = counts[status] || 0;
  const step = pipelineBox.createEl('div', {
    attr: { style: `display:flex;justify-content:space-between;align-items:center;gap:var(--ke-space-3);background:var(--ke-color-hover);border:var(--ke-border-width) solid ${info.color};border-radius:var(--ke-radius-control);padding:var(--ke-space-2) var(--ke-space-3);min-inline-size:0;min-block-size:${workflowLayout.density === "compact" ? "var(--ke-touch-target)" : "var(--ke-control-height)"};` }
  });
  step.createEl('span', { text: info.label, attr: { style: 'font-size:var(--ke-type-label);color:var(--ke-color-muted);font-weight:bold;overflow-wrap:anywhere;' } });
  step.createEl('span', { text: String(count), attr: { style: `font-size: var(--ke-type-title); font-weight: bold; color: ${info.color};` } });
  return step;
};

statusStep('idea');
statusStep('planning');
statusStep('doing');
statusStep('blocked');
statusStep('completed');
statusStep('reviewing');
statusStep('archived');
```
---

## 진행 중

```dataviewjs
const run = () => {
  if (window.renderResponsiveProjectSection) {
    return window.renderResponsiveProjectSection({
      dv: dv,
      status: "doing",
      container: this.container,
      logicalWidth: this.container.clientWidth,
      emptyMessage: "진행 중인 프로젝트가 없습니다.",
      sortField: "due_date",
      sortOrder: "asc"
    });
  }
  return false;
};
if (!run()) {
  await window.prodigyProjectReady;
  if (!run()) throw new Error("프로젝트 대시보드 렌더러가 준비되지 않았습니다.");
}
await window.__prodigyProjectLayoutAck("doing");
```

---

## 계획

```dataviewjs
const run = () => {
  if (window.renderResponsiveProjectSection) {
    return window.renderResponsiveProjectSection({
      dv: dv,
      status: "planning",
      container: this.container,
      logicalWidth: this.container.clientWidth,
      emptyMessage: "기획 중인 프로젝트가 없습니다.",
      sortField: "due_date",
      sortOrder: "asc"
    });
  }
  return false;
};
if (!run()) {
  await window.prodigyProjectReady;
  if (!run()) throw new Error("프로젝트 대시보드 렌더러가 준비되지 않았습니다.");
}
await window.__prodigyProjectLayoutAck("planning");
```

---

## 아이디어

```dataviewjs
const run = () => {
  if (window.renderResponsiveProjectSection) {
    return window.renderResponsiveProjectSection({
      dv: dv,
      status: "idea",
      container: this.container,
      logicalWidth: this.container.clientWidth,
      emptyMessage: "아이디어 단계의 프로젝트가 없습니다.",
      sortField: "due_date",
      sortOrder: "asc"
    });
  }
  return false;
};
if (!run()) {
  await window.prodigyProjectReady;
  if (!run()) throw new Error("프로젝트 대시보드 렌더러가 준비되지 않았습니다.");
}
await window.__prodigyProjectLayoutAck("idea");
```

---

## 지연

```dataviewjs
const run = () => {
  if (window.renderResponsiveProjectSection) {
    return window.renderResponsiveProjectSection({
      dv: dv,
      status: "blocked",
      container: this.container,
      logicalWidth: this.container.clientWidth,
      emptyMessage: "해당 조건의 지연된 프로젝트가 없습니다.",
      isCollapsed: true,
      summaryText: "지연된 프로젝트 목록",
      summaryColor: window.ProdigyTokens.COLORS.error,
      sortField: "due_date",
      sortOrder: "asc"
    });
  }
  return false;
};
if (!run()) {
  await window.prodigyProjectReady;
  if (!run()) throw new Error("프로젝트 대시보드 렌더러가 준비되지 않았습니다.");
}
await window.__prodigyProjectLayoutAck("blocked");
```

## 완료

```dataviewjs
const run = () => {
  if (window.renderResponsiveProjectSection) {
    return window.renderResponsiveProjectSection({
      dv: dv,
      status: "completed",
      container: this.container,
      logicalWidth: this.container.clientWidth,
      emptyMessage: "해당 조건의 완료된 프로젝트가 없습니다.",
      isCollapsed: true,
      summaryText: "완료된 프로젝트 목록",
      summaryColor: window.ProdigyTokens.COLORS.cyan,
      sortField: "due_date",
      sortOrder: "desc"
    });
  }
  return false;
};
if (!run()) {
  await window.prodigyProjectReady;
  if (!run()) throw new Error("프로젝트 대시보드 렌더러가 준비되지 않았습니다.");
}
await window.__prodigyProjectLayoutAck("completed");
```

## 복기 중

```dataviewjs
const run = () => {
  if (window.renderResponsiveProjectSection) {
    return window.renderResponsiveProjectSection({
      dv: dv,
      status: "reviewing",
      container: this.container,
      logicalWidth: this.container.clientWidth,
      emptyMessage: "해당 조건의 복기 중인 프로젝트가 없습니다.",
      isCollapsed: true,
      summaryText: "복기 중인 프로젝트 목록",
      summaryColor: window.ProdigyTokens.COLORS.warning,
      sortField: "due_date",
      sortOrder: "desc"
    });
  }
  return false;
};
if (!run()) {
  await window.prodigyProjectReady;
  if (!run()) throw new Error("프로젝트 대시보드 렌더러가 준비되지 않았습니다.");
}
await window.__prodigyProjectLayoutAck("reviewing");
```

## 보관

```dataviewjs
const run = () => {
  if (window.renderResponsiveProjectSection) {
    return window.renderResponsiveProjectSection({
      dv: dv,
      status: "archived",
      container: this.container,
      logicalWidth: this.container.clientWidth,
      emptyMessage: "해당 조건의 보관된 프로젝트가 없습니다.",
      isCollapsed: true,
      summaryText: "보관된 프로젝트 목록",
      summaryColor: "var(--ke-color-muted)",
      sortField: "due_date",
      sortOrder: "desc"
    });
  }
  return false;
};
if (!run()) {
  await window.prodigyProjectReady;
  if (!run()) throw new Error("프로젝트 대시보드 렌더러가 준비되지 않았습니다.");
}
await window.__prodigyProjectLayoutAck("archived");
```
```
