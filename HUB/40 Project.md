---
cssclasses:
  - hide-properties_reading
---
```js-engine
const file = app.workspace.getActiveFile();
if (!file) return;
if (!container) return;
container.empty();

// Dynamic script loader helper
const loadProdigyScript = async (path) => {
  const tFile = app.vault.getAbstractFileByPath(path);
  if (tFile) {
    const content = await app.vault.read(tFile);
    (new Function(content))();
  }
};

await loadProdigyScript("SYSTEM/Views/shared-dashboard.js");
await loadProdigyScript("SYSTEM/Views/project-card.js");
```

# 🎯 Today

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

const nextProj = activeProjects[0];

const mainBox = this.container.createEl('div', {
  attr: { style: 'display:grid;grid-template-columns: 1fr 1fr;gap:12px;margin-bottom:8px;' }
});

const statsBox = mainBox.createEl('div', {
  attr: { style: 'background:var(--background-secondary);border:1px solid var(--background-modifier-border);border-radius:10px;padding:12px;display:flex;flex-direction:column;gap:6px;box-shadow: 0 4px 8px rgba(0,0,0,0.1);' }
});
statsBox.createEl('div', { text: '🎯 Today 현황', attr: { style: 'font-weight:bold;font-size:0.95em;color:var(--text-accent);border-bottom:1px solid var(--background-modifier-border);padding-bottom:4px;' } });

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

addStatItem(statsBox, '🔥 Due Today', dueTodayCount, '#ef4444', dueTodayCount > 0);
addStatItem(statsBox, '⚠️ Next Action 없음', missingActionCount, '#f97316', missingActionCount > 0);
addStatItem(statsBox, '🚧 지연(Blocked) 프로젝트', blockedCount, '#ef4444', blockedCount > 0);

const actionBox = mainBox.createEl('div', {
  attr: { style: 'background:var(--background-secondary);border:1px solid var(--background-modifier-border);border-radius:10px;padding:12px;display:flex;flex-direction:column;gap:6px;box-shadow: 0 4px 8px rgba(0,0,0,0.1);' }
});
actionBox.createEl('div', { text: '⚡ 다음 Action', attr: { style: 'font-weight:bold;font-size:0.95em;color:var(--text-accent);border-bottom:1px solid var(--background-modifier-border);padding-bottom:4px;' } });

if (nextProj) {
  const linkRow = actionBox.createEl('div', { attr: { style: 'margin-top:2px;' } });
  linkRow.createEl('span', { text: '→ ', attr: { style: 'color:#ef4444;font-weight:bold;' } });
  
  const linkSpan = linkRow.createEl('span', { attr: { style: 'font-size:0.9em;font-weight:bold;' } });
  dv.api.renderValue(nextProj.file.link, linkSpan, dv.component, nextProj.file.path, true);
  
  actionBox.createEl('div', {
    text: nextProj.next_action || "지정된 액션이 없습니다.",
    attr: { style: 'font-size:0.85em;color:var(--text-normal);background:var(--background-modifier-hover);padding:6px 8px;border-radius:6px;border-left:3px solid #ef4444;margin-top:4px;' }
  });
} else {
  actionBox.createEl('div', { text: '진행 중인 프로젝트가 없습니다.', attr: { style: 'font-size:0.85em;color:var(--text-muted);text-align:center;margin-top:12px;' } });
}
```

---

# Workflow

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

const makeStep = (parent, label, count, color) => {
  const step = parent.createEl('div', {
    attr: { style: `display: flex; flex-direction: column; align-items: center; background: var(--background-modifier-hover); border: 1px solid ${color}; border-radius: 6px; padding: 4px 8px; min-width: 70px; box-shadow: 0 2px 4px rgba(0,0,0,0.15); flex-shrink: 0;` }
  });
  step.createEl('span', { text: label, attr: { style: 'font-size: 0.75em; color: var(--text-muted); font-weight: bold; white-space: nowrap;' } });
  step.createEl('span', { text: String(count), attr: { style: `font-size: 1.1em; font-weight: bold; color: ${color};` } });
  return step;
};

const makeArrow = (parent) => {
  parent.createEl('div', {
    text: '→',
    attr: { style: 'font-size: 1.2em; color: var(--text-muted); font-weight: bold;' }
  });
};

makeStep(pipelineBox, '💡 아이디어', counts.idea, '#a855f7');
makeArrow(pipelineBox);
makeStep(pipelineBox, '📋 기획', counts.planning, '#3b82f6');
makeArrow(pipelineBox);
makeStep(pipelineBox, '🚀 진행', counts.doing, '#22c55e');
makeArrow(pipelineBox);

// Split group container (vertical stack)
const splitGroup = pipelineBox.createEl('div', {
  attr: { style: 'display: flex; flex-direction: column; gap: 8px; align-items: flex-start;' }
});

// Row 1: Completed -> Reviewing -> Archived
const rowSuccess = splitGroup.createEl('div', {
  attr: { style: 'display: flex; align-items: center; gap: 8px;' }
});
makeStep(rowSuccess, '✅ 완료', counts.completed, '#06b6d4');
makeArrow(rowSuccess);
makeStep(rowSuccess, '🔄 복기', counts.reviewing, '#f97316');
makeArrow(rowSuccess);
makeStep(rowSuccess, '📦 보관', counts.archived, '#8e8e93');

// Row 2: Blocked step
const rowBlocked = splitGroup.createEl('div', {
  attr: { style: 'display: flex; align-items: center;' }
});
makeStep(rowBlocked, '🚧 지연', counts.blocked, '#ef4444');
```
---

## 🚀 Doing

```dataviewjs
if (window.renderDashboardSection) {
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
}
```

---

## 📋 Planning

```dataviewjs
if (window.renderDashboardSection) {
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
}
```

---

## 💡 Idea

```dataviewjs
if (window.renderDashboardSection) {
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
}
```

---

## 🚧 Blocked

```dataviewjs
if (window.renderDashboardSection) {
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
}
```

## ✅ Completed

```dataviewjs
if (window.renderDashboardSection) {
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
}
```

## 📝 Reviewing

```dataviewjs
if (window.renderDashboardSection) {
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
}
```

## 📦 Archived

```dataviewjs
if (window.renderDashboardSection) {
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
}
```
