---
cssclasses:
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

// Dynamic script loader helper
const loadProdigyScript = async (path) => {
  const tFile = app.vault.getAbstractFileByPath(path);
  if (!tFile) throw new Error(`필수 스크립트 파일이 없습니다: ${path}`);
  const content = await app.vault.read(tFile);
  try {
    (new Function(content))();
  } catch (error) {
    const wrapped = error instanceof Error ? error : new Error(String(error));
    wrapped.prodigyLoadPath = path;
    throw wrapped;
  }
};

window.prodigyProjectReady = (async () => {
  await loadProdigyScript("SYSTEM/Views/design-tokens.js");
  await loadProdigyScript("SYSTEM/Views/workspace-registry.js");
  await loadProdigyScript("SYSTEM/Views/prodigy-workspace-state-store.js");
  await loadProdigyScript("SYSTEM/Views/prodigy-app-shell.js");
  await loadProdigyScript("SYSTEM/Views/prodigy-performance-recorder.js");
  await loadProdigyScript("SYSTEM/Views/prodigy-workspace-readiness.js");
  await loadProdigyScript("SYSTEM/Views/prodigy-performance-exporter.js");
  await loadProdigyScript("SYSTEM/Views/prodigy-workspace-measurement.js");
  await loadProdigyScript("SYSTEM/Views/prodigy-adaptive-controls.js");
  await loadProdigyScript("SYSTEM/Views/workspace-navigation.js");
  await loadProdigyScript("SYSTEM/Views/display-registry.js");
  await loadProdigyScript("SYSTEM/Views/prodigy-ui.js");
  await loadProdigyScript("SYSTEM/Views/object-lifecycle-core.js");
  await loadProdigyScript("SYSTEM/Views/object-lifecycle-view.js");
  await loadProdigyScript("SYSTEM/Views/object-engine-core.js");
  await loadProdigyScript("SYSTEM/Views/shared-dashboard.js");
  await loadProdigyScript("SYSTEM/Views/project-card.js");
  await loadProdigyScript("SYSTEM/Views/project-wizard-core.js");
  await loadProdigyScript("SYSTEM/Views/ai-provider-response.js");
  await loadProdigyScript("SYSTEM/Views/ai-provider-schema.js");
  await loadProdigyScript("SYSTEM/Views/ai-provider-error-policy.js");
  await loadProdigyScript("SYSTEM/Views/ai-provider-fallback.js");
  await loadProdigyScript("SYSTEM/Views/codex-exec-service.js");
  await loadProdigyScript("SYSTEM/Views/antigravity-exec-service.js");
  await loadProdigyScript("SYSTEM/Views/ai-provider-service.js");
  await loadProdigyScript("SYSTEM/Views/prodigy-config-service.js");
  await loadProdigyScript("SYSTEM/Views/project-workflow-draft-service.js");
  await loadProdigyScript("SYSTEM/Views/prodigy-settings-modal.js");
  await loadProdigyScript("SYSTEM/Views/project-todoist-adapter.js");
  await loadProdigyScript("SYSTEM/Views/project-wizard.js");
  window.renderResponsiveProjectSection = (options) => {
    if (!window.renderDashboardSection || !window.renderProjectCard) return false;
    const host = options.container;
    const explicitWidth = Number(options.logicalWidth);
    const measuredWidth = Number(host.clientWidth);
    const logicalWidth = Number.isFinite(explicitWidth)
      ? explicitWidth
      : Number.isFinite(measuredWidth) && measuredWidth > 0 ? measuredWidth : window.ProdigyTokens.BREAKPOINTS.wide;
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
  const projectShell = window.ProdigyWorkspaceNavigation.mount(container, { app, workspaceId: "project", title: "프로젝트" });
  window.__prodigyProjectPerformance = projectShell.performance;
  if (window.__prodigyProjectPerformance) window.__prodigyProjectPerformance.mark("data_scan_start", { scope: "project" });
})();

try {
  await window.prodigyProjectReady;
} catch (err) {
  if (window.ProdigyWorkspaceNavigation && window.ProdigyWorkspaceNavigation.renderLoaderError) {
    window.ProdigyWorkspaceNavigation.renderLoaderError(container, err, { title: "프로젝트" });
  } else {
    container.empty();
    container.createEl("p", { text: "프로젝트 워크스페이스를 불러오지 못했습니다.", attr: { role: "alert" } });
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
  : tokens.BREAKPOINTS.wide;
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
  attr: { style: "font-size:0.78em;font-weight:700;color:var(--text-muted);margin-right:4px;" }
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

  btn.addEventListener("click", (event) => {
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
  });
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
  Number.isFinite(lifecycleWidth) && lifecycleWidth > 0 ? lifecycleWidth : window.ProdigyTokens.BREAKPOINTS.wide
);
const fold = host.createEl("details", {
  attr: {
    class: "prodigy-lifecycle-fold",
    "data-density": lifecycleLayout.density,
    style: "border:1px solid var(--background-modifier-border);border-radius:8px;background:var(--background-secondary);padding:2px 10px 8px;margin:0 0 8px;"
  }
});
const summary = fold.createEl("summary", {
  text: "객체 라이프사이클 · 접힘 (상태 요약)",
  attr: {
    style: `font-weight:700;font-size:0.88em;color:var(--text-muted);cursor:pointer;min-height:${lifecycleLayout.density === "compact" ? lifecycleLayout.touchTarget : 36}px;display:flex;align-items:center;list-style:none;`
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
    attr: { style: "color:var(--text-muted);font-size:0.82em;" }
  });
}
```

# 오늘

```dataviewjs
await window.prodigyProjectReady;
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

const todayTokens = window.ProdigyTokens;
const todayWidth = Number(this.container.clientWidth);
const todayLayout = window.ProjectWizardCore.resolveProjectWorkspaceLayout(
  Number.isFinite(todayWidth) && todayWidth > 0 ? todayWidth : todayTokens.BREAKPOINTS.wide
);
const mainBox = this.container.createEl('div', {
  attr: {
    "data-density": todayLayout.density,
    style: `display:grid;grid-template-columns:repeat(${todayLayout.columns},minmax(0,1fr));gap:12px;margin-bottom:8px;min-inline-size:0;`
  }
});

const statsBox = mainBox.createEl('div', {
  attr: { style: `background:var(--background-secondary);border:1px solid var(--background-modifier-border);border-radius:10px;padding:12px;display:flex;flex-direction:column;gap:6px;box-shadow:${todayTokens.SHADOWS.lg};min-inline-size:0;` }
});
statsBox.createEl('div', { text: '오늘 현황', attr: { style: 'font-weight:bold;font-size:0.95em;color:var(--text-accent);border-bottom:1px solid var(--background-modifier-border);padding-bottom:4px;' } });

const addStatItem = (parent, label, count, color, isHighlight) => {
  const row = parent.createEl('div', { attr: { style: 'display:flex;justify-content:space-between;align-items:center;font-size:0.85em;' } });
  row.createEl('span', { text: label, attr: { style: 'color:var(--text-muted);' } });
  row.createEl('span', {
    text: `${count}건`,
    attr: {
      style: `font-weight:bold;color:${color};background:${isHighlight ? todayTokens.badgeBg(color) : 'transparent'};padding:${isHighlight ? '1px 6px' : '0'};border-radius:4px;`
    }
  });
};

addStatItem(statsBox, '오늘 마감', dueTodayCount, todayTokens.COLORS.error, dueTodayCount > 0);
addStatItem(statsBox, '다음 행동 없음', missingActionCount, todayTokens.COLORS.warning, missingActionCount > 0);
addStatItem(statsBox, '지연 프로젝트', blockedCount, todayTokens.COLORS.error, blockedCount > 0);

const actionBox = mainBox.createEl('div', {
  attr: { style: `background:var(--background-secondary);border:1px solid var(--background-modifier-border);border-radius:10px;padding:12px;display:flex;flex-direction:column;gap:6px;box-shadow:${todayTokens.SHADOWS.lg};min-inline-size:0;` }
});
actionBox.createEl('div', { text: '다음 행동', attr: { style: 'font-weight:bold;font-size:0.95em;color:var(--text-accent);border-bottom:1px solid var(--background-modifier-border);padding-bottom:4px;' } });

if (nextProj) {
  const linkRow = actionBox.createEl('div', { attr: { style: 'margin-top:2px;display:flex;align-items:center;gap:6px;flex-wrap:wrap;' } });
  const rawType = String(nextProj.project_type || "").trim().toLowerCase();
  const typeLabel = rawType === "business" ? "사업" : rawType === "work" ? "회사" : rawType === "personal" ? "개인" : "미분류";
  linkRow.createEl('span', {
    text: typeLabel,
    attr: { style: 'font-size:0.7em;font-weight:700;color:var(--text-muted);background:var(--background-modifier-hover);padding:1px 6px;border-radius:999px;' }
  });
  const linkSpan = linkRow.createEl('span', { attr: { style: 'font-size:0.9em;font-weight:bold;' } });
  dv.api.renderValue(nextProj.file.link, linkSpan, dv.component, nextProj.file.path, true);
  
  const actionText = (engineContinue && engineContinue.action)
    || nextProj.next_action
    || "지정된 액션이 없습니다.";
  actionBox.createEl('div', {
    text: actionText,
    attr: { style: `font-size:0.85em;color:var(--text-normal);background:var(--background-modifier-hover);padding:6px 8px;border-radius:6px;border-left:3px solid ${todayTokens.COLORS.error};margin-top:4px;overflow-wrap:anywhere;` }
  });
} else {
  actionBox.createEl('div', { text: '진행 중인 작업이 없습니다.', attr: { style: 'font-size:0.85em;color:var(--text-muted);text-align:center;margin-top:12px;' } });
}
  const projectPerformance = window.__prodigyProjectPerformance;
  if (projectPerformance) {
    projectPerformance.mark("data_scan_end", { scope: "project", status: "loaded" });
    projectPerformance.mark("projection_end", { scope: "project", status: "projected" });
    projectPerformance.mark("dom_render_end", { scope: "project", status: "rendered" });
    projectPerformance.markWorkspaceReady();
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
  Number.isFinite(workflowWidth) && workflowWidth > 0 ? workflowWidth : window.ProdigyTokens.BREAKPOINTS.wide
);
const pipelineBox = container.createEl('div', {
  attr: {
    "data-density": workflowLayout.density,
    style: `display:grid;grid-template-columns:repeat(${workflowLayout.columns},minmax(0,1fr));gap:8px;background:var(--background-secondary);padding:12px;border-radius:10px;border:1px solid var(--background-modifier-border);min-inline-size:0;`
  }
});

const statusStep = (status) => {
  const info = window.prodigyDisplay.statusInfo(status);
  const count = counts[status] || 0;
  const step = pipelineBox.createEl('div', {
    attr: { style: `display:flex;justify-content:space-between;align-items:center;gap:8px;background:var(--background-modifier-hover);border:1px solid ${info.color};border-radius:6px;padding:4px 8px;min-inline-size:0;min-block-size:${workflowLayout.density === "compact" ? workflowLayout.touchTarget : 32}px;box-shadow:${window.ProdigyTokens.SHADOWS.sm};` }
  });
  step.createEl('span', { text: info.label, attr: { style: 'font-size:0.75em;color:var(--text-muted);font-weight:bold;overflow-wrap:anywhere;' } });
  step.createEl('span', { text: String(count), attr: { style: `font-size: 1.1em; font-weight: bold; color: ${info.color};` } });
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
  this.container.empty();
  this.container.createEl("span", {
    text: "대시보드 리소스를 불러오는 중...",
    attr: { style: "color: var(--text-muted); font-size: 0.82em; font-style: italic; margin: 4px 0; display: block;" }
  });
  const t = setInterval(() => { if (run()) clearInterval(t); }, 100);
  setTimeout(() => clearInterval(t), 10000);
}
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
  this.container.empty();
  this.container.createEl("span", {
    text: "대시보드 리소스를 불러오는 중...",
    attr: { style: "color: var(--text-muted); font-size: 0.82em; font-style: italic; margin: 4px 0; display: block;" }
  });
  const t = setInterval(() => { if (run()) clearInterval(t); }, 100);
  setTimeout(() => clearInterval(t), 10000);
}
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
  this.container.empty();
  this.container.createEl("span", {
    text: "대시보드 리소스를 불러오는 중...",
    attr: { style: "color: var(--text-muted); font-size: 0.82em; font-style: italic; margin: 4px 0; display: block;" }
  });
  const t = setInterval(() => { if (run()) clearInterval(t); }, 100);
  setTimeout(() => clearInterval(t), 10000);
}
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
  this.container.empty();
  this.container.createEl("span", {
    text: "대시보드 리소스를 불러오는 중...",
    attr: { style: "color: var(--text-muted); font-size: 0.82em; font-style: italic; margin: 4px 0; display: block;" }
  });
  const t = setInterval(() => { if (run()) clearInterval(t); }, 100);
  setTimeout(() => clearInterval(t), 10000);
}
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
  this.container.empty();
  this.container.createEl("span", {
    text: "대시보드 리소스를 불러오는 중...",
    attr: { style: "color: var(--text-muted); font-size: 0.82em; font-style: italic; margin: 4px 0; display: block;" }
  });
  const t = setInterval(() => { if (run()) clearInterval(t); }, 100);
  setTimeout(() => clearInterval(t), 10000);
}
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
  this.container.empty();
  this.container.createEl("span", {
    text: "대시보드 리소스를 불러오는 중...",
    attr: { style: "color: var(--text-muted); font-size: 0.82em; font-style: italic; margin: 4px 0; display: block;" }
  });
  const t = setInterval(() => { if (run()) clearInterval(t); }, 100);
  setTimeout(() => clearInterval(t), 10000);
}
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
      summaryColor: "var(--text-muted)",
      sortField: "due_date",
      sortOrder: "desc"
    });
  }
  return false;
};
if (!run()) {
  this.container.empty();
  this.container.createEl("span", {
    text: "대시보드 리소스를 불러오는 중...",
    attr: { style: "color: var(--text-muted); font-size: 0.82em; font-style: italic; margin: 4px 0; display: block;" }
  });
  const t = setInterval(() => { if (run()) clearInterval(t); }, 100);
  setTimeout(() => clearInterval(t), 10000);
}
```
```
