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
  if (tFile) {
    const content = await app.vault.read(tFile);
    (new Function(content))();
  }
};

try {
  await loadProdigyScript("SYSTEM/Views/display-registry.js");
  await loadProdigyScript("SYSTEM/Views/prodigy-ui.js");
  await loadProdigyScript("SYSTEM/Views/workspace-navigation.js");
  await loadProdigyScript("SYSTEM/Views/object-lifecycle-core.js");
  await loadProdigyScript("SYSTEM/Views/object-lifecycle-view.js");
  await loadProdigyScript("SYSTEM/Views/object-engine-core.js");
  await loadProdigyScript("SYSTEM/Views/shared-dashboard.js");
  await loadProdigyScript("SYSTEM/Views/project-card.js");
  await loadProdigyScript("SYSTEM/Views/project-wizard-core.js");
  await loadProdigyScript("SYSTEM/Views/ai-provider-service.js");
  await loadProdigyScript("SYSTEM/Views/prodigy-config-service.js");
  await loadProdigyScript("SYSTEM/Views/project-workflow-draft-service.js");
  await loadProdigyScript("SYSTEM/Views/prodigy-settings-modal.js");
  await loadProdigyScript("SYSTEM/Views/project-todoist-adapter.js");
  await loadProdigyScript("SYSTEM/Views/project-wizard.js");
  window.ProdigyWorkspaceNavigation.mount(container, { app, title: "프로젝트" });
} catch (err) {
  container.empty();
  const errCard = container.createEl("div", {
    attr: { style: "background: rgba(239, 68, 68, 0.08); border: 1px solid rgba(239, 68, 68, 0.3); border-radius: 8px; padding: 16px; margin: 12px 0; color: #ef4444;" }
  });
  errCard.createEl("h4", { text: "⚠️ 대시보드 스크립트 로드 실패" });
  errCard.createEl("p", { 
    text: "공통 뷰 렌더러 파일을 읽어오는 중 에러가 발생했습니다. 자바스크립트 소스 코드나 경로를 확인해주세요.",
    attr: { style: "font-size: 0.85em; color: var(--text-normal);" }
  });
  
  const details = errCard.createEl("details", { attr: { style: "margin-top: 8px; cursor: pointer;" } });
  details.createEl("summary", { text: "에러 로그 자세히 보기", attr: { style: "font-size: 0.8em; font-weight: bold;" } });
  details.createEl("pre", { 
    text: err.stack || err.message, 
    attr: { style: "font-size: 0.75em; background: rgba(0,0,0,0.2); padding: 8px; border-radius: 4px; overflow-x: auto; margin-top: 4px;" } 
  });
  return;
}
```

# 프로젝트 실행

```js-engine
if (!container) return;
container.empty();

const actionBar = container.createEl("div", {
  attr: { style: "display:flex;flex-direction:column;gap:10px;margin:4px 0 12px;" }
});

const topRow = actionBar.createEl("div", {
  attr: { style: "display:flex;justify-content:flex-end;align-items:center;" }
});

if (window.ProdigyUI) window.ProdigyUI.ensureStyles();
const launchButton = window.ProdigyUI
  ? window.ProdigyUI.button(topRow, "+ 프로젝트 시작", { primary: true })
  : topRow.createEl("button", {
    text: "+ 프로젝트 시작",
    attr: { type: "button", class: "prodigy-btn prodigy-btn-primary" }
  });

launchButton.onclick = () => {
  if (window.openProjectWizard) {
    window.openProjectWizard();
  } else {
    new Notice("프로젝트 시작 도구를 불러오지 못했습니다.", 9000);
  }
};

if (window.prodigyProjectTypeFilter == null || window.prodigyProjectTypeFilter === "") {
  window.prodigyProjectTypeFilter = "all";
}

const filterRow = actionBar.createEl("div", {
  attr: {
    class: "prodigy-project-type-filter",
    style: "display:flex;flex-wrap:wrap;gap:6px;align-items:center;"
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
};

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
const fold = host.createEl("details", {
  attr: {
    class: "prodigy-lifecycle-fold",
    style: "border:1px solid var(--background-modifier-border);border-radius:8px;background:var(--background-secondary);padding:2px 10px 8px;margin:0 0 8px;"
  }
});
const summary = fold.createEl("summary", {
  text: "객체 라이프사이클 · 접힘 (상태 요약)",
  attr: {
    style: "font-weight:700;font-size:0.88em;color:var(--text-muted);cursor:pointer;min-height:36px;display:flex;align-items:center;list-style:none;"
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

# 🎯 오늘

```dataviewjs
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

const mainBox = this.container.createEl('div', {
  attr: { style: 'display:grid;grid-template-columns: 1fr 1fr;gap:12px;margin-bottom:8px;' }
});

const statsBox = mainBox.createEl('div', {
  attr: { style: 'background:var(--background-secondary);border:1px solid var(--background-modifier-border);border-radius:10px;padding:12px;display:flex;flex-direction:column;gap:6px;box-shadow: 0 4px 8px rgba(0,0,0,0.1);' }
});
statsBox.createEl('div', { text: '🎯 오늘 현황', attr: { style: 'font-weight:bold;font-size:0.95em;color:var(--text-accent);border-bottom:1px solid var(--background-modifier-border);padding-bottom:4px;' } });

const addStatItem = (parent, label, count, color, isHighlight) => {
  const row = parent.createEl('div', { attr: { style: 'display:flex;justify-content:space-between;align-items:center;font-size:0.85em;' } });
  row.createEl('span', { text: label, attr: { style: 'color:var(--text-muted);' } });
  row.createEl('span', {
    text: `${count}건`,
    attr: {
      style: `font-weight:bold;color:${color};background:${isHighlight ? color+'15' : 'transparent'};padding:${isHighlight ? '1px 6px' : '0'};border-radius:4px;`
    }
  });
};

addStatItem(statsBox, '오늘 마감', dueTodayCount, '#ef4444', dueTodayCount > 0);
addStatItem(statsBox, '다음 행동 없음', missingActionCount, '#f97316', missingActionCount > 0);
addStatItem(statsBox, '지연 프로젝트', blockedCount, '#ef4444', blockedCount > 0);

const actionBox = mainBox.createEl('div', {
  attr: { style: 'background:var(--background-secondary);border:1px solid var(--background-modifier-border);border-radius:10px;padding:12px;display:flex;flex-direction:column;gap:6px;box-shadow: 0 4px 8px rgba(0,0,0,0.1);' }
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
  linkRow.createEl('span', { text: '→ ', attr: { style: 'color:#ef4444;font-weight:bold;' } });
  
  const linkSpan = linkRow.createEl('span', { attr: { style: 'font-size:0.9em;font-weight:bold;' } });
  dv.api.renderValue(nextProj.file.link, linkSpan, dv.component, nextProj.file.path, true);
  
  const actionText = (engineContinue && engineContinue.action)
    || nextProj.next_action
    || "지정된 액션이 없습니다.";
  actionBox.createEl('div', {
    text: actionText,
    attr: { style: 'font-size:0.85em;color:var(--text-normal);background:var(--background-modifier-hover);padding:6px 8px;border-radius:6px;border-left:3px solid #ef4444;margin-top:4px;' }
  });
} else {
  actionBox.createEl('div', { text: '진행 중인 작업이 없습니다.', attr: { style: 'font-size:0.85em;color:var(--text-muted);text-align:center;margin-top:12px;' } });
}
```

---

# 워크플로

```js-engine
const file = app.workspace.getActiveFile();
if (!file) return;
if (!container) return;
container.empty();

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

const pipelineBox = container.createEl('div', {
  attr: { style: 'display: flex; gap: 8px; justify-content: space-around; align-items: center; background: var(--background-secondary); padding: 12px; border-radius: 10px; border: 1px solid var(--background-modifier-border); overflow-x: auto;' }
});

const statusStep = (status, parent = pipelineBox) => {
  const info = window.prodigyDisplay.statusInfo(status);
  const count = counts[status] || 0;
  const step = parent.createEl('div', {
    attr: { style: `display: flex; flex-direction: column; align-items: center; background: var(--background-modifier-hover); border: 1px solid ${info.color}; border-radius: 6px; padding: 4px 8px; min-width: 70px; box-shadow: 0 2px 4px rgba(0,0,0,0.15); flex-shrink: 0;` }
  });
  step.createEl('span', { text: info.label, attr: { style: 'font-size: 0.75em; color: var(--text-muted); font-weight: bold; white-space: nowrap;' } });
  step.createEl('span', { text: String(count), attr: { style: `font-size: 1.1em; font-weight: bold; color: ${info.color};` } });
  return step;
};

const makeArrow = (parent) => {
  parent.createEl('div', {
    text: '→',
    attr: { style: 'font-size: 1.2em; color: var(--text-muted); font-weight: bold;' }
  });
};

statusStep('idea');
makeArrow(pipelineBox);
statusStep('planning');
makeArrow(pipelineBox);
statusStep('doing');
makeArrow(pipelineBox);

// Split group container (vertical stack)
const splitGroup = pipelineBox.createEl('div', {
  attr: { style: 'display: flex; flex-direction: column; gap: 8px; align-items: flex-start;' }
});

// Row 1: Completed -> Reviewing -> Archived
const rowSuccess = splitGroup.createEl('div', {
  attr: { style: 'display: flex; align-items: center; gap: 8px;' }
});
statusStep('completed', rowSuccess);
makeArrow(rowSuccess);
statusStep('reviewing', rowSuccess);
makeArrow(rowSuccess);
statusStep('archived', rowSuccess);

// Row 2: Blocked step
const rowBlocked = splitGroup.createEl('div', {
  attr: { style: 'display: flex; align-items: center;' }
});
statusStep('blocked', rowBlocked);
```
---

## 🚀 진행 중

```dataviewjs
const run = () => {
  if (window.renderDashboardSection && window.renderProjectCard) {
    this.container.empty();
    window.renderDashboardSection({
      dv: dv,
      status: "doing",
      type: "project",
      container: this.container,
      renderer: window.renderProjectCard,
      emptyMessage: "진행 중인 프로젝트가 없습니다.",
      sortField: "due_date",
      sortOrder: "asc"
    });
    return true;
  }
  return false;
};
if (!run()) {
  this.container.empty();
  this.container.createEl("span", {
    text: "⌛ 대시보드 리소스를 불러오는 중...",
    attr: { style: "color: var(--text-muted); font-size: 0.82em; font-style: italic; margin: 4px 0; display: block;" }
  });
  const t = setInterval(() => { if (run()) clearInterval(t); }, 100);
  setTimeout(() => clearInterval(t), 10000);
}
```

---

## 📋 계획

```dataviewjs
const run = () => {
  if (window.renderDashboardSection && window.renderProjectCard) {
    this.container.empty();
    window.renderDashboardSection({
      dv: dv,
      status: "planning",
      type: "project",
      container: this.container,
      renderer: window.renderProjectCard,
      emptyMessage: "기획 중인 프로젝트가 없습니다.",
      sortField: "due_date",
      sortOrder: "asc"
    });
    return true;
  }
  return false;
};
if (!run()) {
  this.container.empty();
  this.container.createEl("span", {
    text: "⌛ 대시보드 리소스를 불러오는 중...",
    attr: { style: "color: var(--text-muted); font-size: 0.82em; font-style: italic; margin: 4px 0; display: block;" }
  });
  const t = setInterval(() => { if (run()) clearInterval(t); }, 100);
  setTimeout(() => clearInterval(t), 10000);
}
```

---

## 💡 아이디어

```dataviewjs
const run = () => {
  if (window.renderDashboardSection && window.renderProjectCard) {
    this.container.empty();
    window.renderDashboardSection({
      dv: dv,
      status: "idea",
      type: "project",
      container: this.container,
      renderer: window.renderProjectCard,
      emptyMessage: "아이디어 단계의 프로젝트가 없습니다.",
      sortField: "due_date",
      sortOrder: "asc"
    });
    return true;
  }
  return false;
};
if (!run()) {
  this.container.empty();
  this.container.createEl("span", {
    text: "⌛ 대시보드 리소스를 불러오는 중...",
    attr: { style: "color: var(--text-muted); font-size: 0.82em; font-style: italic; margin: 4px 0; display: block;" }
  });
  const t = setInterval(() => { if (run()) clearInterval(t); }, 100);
  setTimeout(() => clearInterval(t), 10000);
}
```

---

## 🚧 지연

```dataviewjs
const run = () => {
  if (window.renderDashboardSection && window.renderProjectCard) {
    this.container.empty();
    window.renderDashboardSection({
      dv: dv,
      status: "blocked",
      type: "project",
      container: this.container,
      renderer: window.renderProjectCard,
      emptyMessage: "해당 조건의 지연된 프로젝트가 없습니다.",
      isCollapsed: true,
      summaryText: "🚧 지연된 프로젝트 목록",
      summaryColor: "#ef4444",
      sortField: "due_date",
      sortOrder: "asc"
    });
    return true;
  }
  return false;
};
if (!run()) {
  this.container.empty();
  this.container.createEl("span", {
    text: "⌛ 대시보드 리소스를 불러오는 중...",
    attr: { style: "color: var(--text-muted); font-size: 0.82em; font-style: italic; margin: 4px 0; display: block;" }
  });
  const t = setInterval(() => { if (run()) clearInterval(t); }, 100);
  setTimeout(() => clearInterval(t), 10000);
}
```

## ✅ 완료

```dataviewjs
const run = () => {
  if (window.renderDashboardSection && window.renderProjectCard) {
    this.container.empty();
    window.renderDashboardSection({
      dv: dv,
      status: "completed",
      type: "project",
      container: this.container,
      renderer: window.renderProjectCard,
      emptyMessage: "해당 조건의 완료된 프로젝트가 없습니다.",
      isCollapsed: true,
      summaryText: "✅ 완료된 프로젝트 목록",
      summaryColor: "#06b6d4",
      sortField: "due_date",
      sortOrder: "desc"
    });
    return true;
  }
  return false;
};
if (!run()) {
  this.container.empty();
  this.container.createEl("span", {
    text: "⌛ 대시보드 리소스를 불러오는 중...",
    attr: { style: "color: var(--text-muted); font-size: 0.82em; font-style: italic; margin: 4px 0; display: block;" }
  });
  const t = setInterval(() => { if (run()) clearInterval(t); }, 100);
  setTimeout(() => clearInterval(t), 10000);
}
```

## 📝 복기 중

```dataviewjs
const run = () => {
  if (window.renderDashboardSection && window.renderProjectCard) {
    this.container.empty();
    window.renderDashboardSection({
      dv: dv,
      status: "reviewing",
      type: "project",
      container: this.container,
      renderer: window.renderProjectCard,
      emptyMessage: "해당 조건의 복기 중인 프로젝트가 없습니다.",
      isCollapsed: true,
      summaryText: "📝 복기 중인 프로젝트 목록",
      summaryColor: "#f97316",
      sortField: "due_date",
      sortOrder: "desc"
    });
    return true;
  }
  return false;
};
if (!run()) {
  this.container.empty();
  this.container.createEl("span", {
    text: "⌛ 대시보드 리소스를 불러오는 중...",
    attr: { style: "color: var(--text-muted); font-size: 0.82em; font-style: italic; margin: 4px 0; display: block;" }
  });
  const t = setInterval(() => { if (run()) clearInterval(t); }, 100);
  setTimeout(() => clearInterval(t), 10000);
}
```

## 📦 보관

```dataviewjs
const run = () => {
  if (window.renderDashboardSection && window.renderProjectCard) {
    this.container.empty();
    window.renderDashboardSection({
      dv: dv,
      status: "archived",
      type: "project",
      container: this.container,
      renderer: window.renderProjectCard,
      emptyMessage: "해당 조건의 보관된 프로젝트가 없습니다.",
      isCollapsed: true,
      summaryText: "📦 보관된 프로젝트 목록",
      summaryColor: "var(--text-muted)",
      sortField: "due_date",
      sortOrder: "desc"
    });
    return true;
  }
  return false;
};
if (!run()) {
  this.container.empty();
  this.container.createEl("span", {
    text: "⌛ 대시보드 리소스를 불러오는 중...",
    attr: { style: "color: var(--text-muted); font-size: 0.82em; font-style: italic; margin: 4px 0; display: block;" }
  });
  const t = setInterval(() => { if (run()) clearInterval(t); }, 100);
  setTimeout(() => clearInterval(t), 10000);
}
```
```
