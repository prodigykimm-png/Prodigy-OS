---
cssclasses:
  - hide-properties_reading
card_category: 전체
card_status: 전체
---
# 🎯 Today

```js-engine
const file = app.workspace.getActiveFile();
if (!file) return;
if (!container) return;
container.empty();

// Define global project card renderer
window.renderProjectCard = function(p, container) {
  const statusColors = {
    idea: '#a855f7',
    planning: '#3b82f6',
    doing: '#22c55e',
    blocked: '#ef4444',
    completed: '#06b6d4',
    reviewing: '#f97316',
    archived: '#8e8e93'
  };
  const color = statusColors[p.status] || '#555';
  
  const card = container.createEl('div', {
    attr: {
      style: `border: 1px solid var(--background-modifier-border); border-left: 4px solid ${color}; border-radius: 6px; padding: 8px 10px; margin-bottom: 8px; background: var(--background-secondary); display: flex; flex-direction: column; gap: 4px; box-shadow: 0 2px 4px rgba(0,0,0,0.08);`
    }
  });
  
  // Header
  const header = card.createEl('div', {
    attr: { style: 'display: flex; justify-content: space-between; align-items: center;' }
  });
  const title = header.createEl('a', {
    text: p.file.name,
    attr: {
      class: 'internal-link',
      style: 'font-weight: bold; font-size: 0.95em; color: var(--text-normal); text-decoration: none; cursor: pointer;'
    }
  });
  title.onclick = () => app.workspace.openLinkText(p.file.name, p.file.path);
  
  // Priority Badge
  const rightHeader = header.createEl('div', { attr: { style: 'display: flex; align-items: center; gap: 6px;' } });
  const priColor = p.priority === '높음' ? '#ef4444' : p.priority === '낮음' ? '#8e8e93' : 'var(--text-accent)';
  rightHeader.createEl('span', {
    text: p.priority || '보통',
    attr: { style: `font-size: 0.72em; font-weight: bold; color: ${priColor}; background: ${priColor}15; padding: 1px 4px; border-radius: 4px;` }
  });
  
  // Category & Dates
  const subHeader = card.createEl('div', {
    attr: { style: 'font-size: 0.8em; color: var(--text-muted); display: flex; gap: 6px; align-items: center;' }
  });
  subHeader.createEl('span', { text: p.category || "미지정" });
  if (p.due_date) {
    subHeader.createEl('span', { text: '·', attr: { style: 'color: var(--text-muted);' } });
    subHeader.createEl('span', { text: `마감일: ${p.due_date}` });
  }
  
  // Next Action
  const actionRow = card.createEl('div', {
    attr: { style: 'font-size: 0.85em; color: var(--text-normal); margin-top: 2px;' }
  });
  actionRow.createEl('strong', { text: '→ Next Action: ', attr: { style: 'color: var(--text-accent);' } });
  actionRow.createEl('span', { text: p.next_action || "⚠️ 설정 필요" });
  
  // Buttons
  const getTransitions = (currentStatus) => {
    const trans = {
      idea: [{ key: 'planning', label: '📋 기획', color: 'var(--text-accent)' }],
      planning: [
        { key: 'doing', label: '🚀 진행', color: '#22c55e' },
        { key: 'blocked', label: '🚧 지연', color: '#ef4444' }
      ],
      doing: [
        { key: 'completed', label: '✅ 완료', color: '#06b6d4' },
        { key: 'blocked', label: '🚧 지연', color: '#ef4444' }
      ],
      blocked: [
        { key: 'doing', label: '🚀 진행', color: '#22c55e' },
        { key: 'planning', label: '📋 기획', color: 'var(--text-accent)' }
      ],
      completed: [{ key: 'reviewing', label: '🔄 복기', color: '#f97316' }],
      reviewing: [{ key: 'archived', label: '📦 보관', color: '#555' }],
      archived: []
    };
    return trans[currentStatus] || [];
  };
  
  const buttons = getTransitions(p.status || 'idea');
  if (buttons.length > 0) {
    const btnBox = card.createEl('div', {
      attr: { style: 'display: flex; gap: 4px; margin-top: 4px; flex-wrap: wrap; border-top: 1px solid var(--background-modifier-border); padding-top: 4px;' }
    });
    btnBox.createEl('span', { text: '상태 변경:', attr: { style: 'font-size: 0.72em; color: var(--text-muted); display: flex; align-items: center; margin-right: 4px;' } });
    buttons.forEach(opt => {
      const btn = btnBox.createEl('button', {
        text: opt.label,
        attr: { style: `font-size: 0.7em; padding: 1px 4px; border-radius: 3px; background: var(--background-modifier-hover); color: var(--text-normal); border: 1px solid ${opt.color}; cursor: pointer;` }
      });
      btn.onclick = async (e) => {
        e.preventDefault();
        btn.disabled = true;
        btn.style.opacity = '0.5';
        const tFile = app.vault.getAbstractFileByPath(p.file.path);
        if (tFile) {
          await app.fileManager.processFrontMatter(tFile, (fm) => {
            fm.status = opt.key;
            fm.updated = new Date().toISOString().split('T')[0];
          });
        }
      };
    });
  }
};
```

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
    
    // Due today
    if (p.due_date === todayStr) {
      dueTodayCount++;
    }
    
    // Missing next action
    if (!p.next_action || String(p.next_action).trim() === "" || p.next_action === "정보 없음") {
      missingActionCount++;
    }
    
    // Blocked
    if (p.status === "blocked") {
      blockedCount++;
    }
  }
});

// Sort active projects for Next Action Target
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

// Render Today Card
const mainBox = this.container.createEl('div', {
  attr: { style: 'display:grid;grid-template-columns: 1fr 1fr;gap:12px;margin-bottom:8px;' }
});

// Left Column: Stats Box
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

// Right Column: Next Action Box
const actionBox = mainBox.createEl('div', {
  attr: { style: 'background:var(--background-secondary);border:1px solid var(--background-modifier-border);border-radius:10px;padding:12px;display:flex;flex-direction:column;gap:6px;box-shadow: 0 4px 8px rgba(0,0,0,0.1);' }
});
actionBox.createEl('div', { text: '⚡ 다음 Action', attr: { style: 'font-weight:bold;font-size:0.95em;color:var(--text-accent);border-bottom:1px solid var(--background-modifier-border);padding-bottom:4px;' } });

if (nextProj) {
  const linkRow = actionBox.createEl('div', { attr: { style: 'margin-top:2px;' } });
  linkRow.createEl('span', { text: '→ ', attr: { style: 'color:#ef4444;font-weight:bold;' } });
  const linkEl = linkRow.createEl('a', {
    text: nextProj.file.name,
    attr: { class: 'internal-link', style: 'color:var(--text-accent);font-weight:bold;text-decoration:underline;cursor:pointer;font-size:0.9em;' }
  });
  linkEl.onclick = () => app.workspace.openLinkText(nextProj.file.name, nextProj.file.path);
  
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
    attr: { style: `display: flex; flex-direction: column; align-items: center; background: var(--background-modifier-hover); border: 1px solid ${color}; border-radius: 6px; padding: 6px 12px; min-width: 80px; box-shadow: 0 2px 4px rgba(0,0,0,0.15);` }
  });
  step.createEl('span', { text: label, attr: { style: 'font-size: 0.8em; color: var(--text-muted); font-weight: bold;' } });
  step.createEl('span', { text: String(count), attr: { style: `font-size: 1.25em; font-weight: bold; color: ${color};` } });
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
makeStep(pipelineBox, '📋 기획중', counts.planning, '#3b82f6');
makeArrow(pipelineBox);
makeStep(pipelineBox, '🚀 진행중', counts.doing, '#22c55e');
makeArrow(pipelineBox);
makeStep(pipelineBox, '🚧 지연됨', counts.blocked, '#ef4444');
makeArrow(pipelineBox);
makeStep(pipelineBox, '✅ 완료됨', counts.completed, '#06b6d4');
makeArrow(pipelineBox);
makeStep(pipelineBox, '🔄 복기중', counts.reviewing, '#f97316');
makeArrow(pipelineBox);
makeStep(pipelineBox, '📦 보관됨', counts.archived, '#8e8e93');
```

---

# Filter

```js-engine
const file = app.workspace.getActiveFile();
if (!file) return;
if (!container) return;
container.empty();

const cache = app.metadataCache.getFileCache(file);
const fm = cache?.frontmatter ?? {};

const setFilter = async (field, value) => {
  await app.fileManager.processFrontMatter(file, (fm) => { fm[field] = value; });
};

// Dynamic Categories
const files = app.vault.getFiles();
const categoriesSet = new Set(["전체"]);
files.forEach(f => {
  const c = app.metadataCache.getFileCache(f);
  if (c?.frontmatter?.type === "project" && c?.frontmatter?.category) {
    categoriesSet.add(c.frontmatter.category);
  }
});
const categories = Array.from(categoriesSet);

const statuses = ["전체", "idea", "planning", "doing", "blocked", "completed", "reviewing", "archived"];

const makeSelect = (label, field, options, current) => {
  const row = container.createEl('div', { attr: { style: 'display:inline-flex;align-items:center;margin-right:12px;' } });
  row.createEl('span', { text: label + ' ', attr: { style: 'font-weight:bold;font-size:0.85em;margin-right:4px;' } });
  const sel = row.createEl('select', { attr: { style: 'font-size:0.85em;padding:2px 6px;border-radius:4px;background:var(--background-modifier-hover);color:var(--text-normal);border:1px solid var(--background-modifier-border);' } });
  options.forEach(o => {
    const opt = sel.createEl('option', { text: o, value: o });
    if (o === (current || options[0])) opt.selected = true;
  });
  sel.onchange = () => setFilter(field, sel.value);
  return sel;
};

makeSelect('카테고리 필터', 'card_category', categories, fm.card_category);
makeSelect('상태 필터', 'card_status', statuses, fm.card_status);
```

---

## 🚀 Doing

```dataviewjs
const thisFile = dv.pages('"HUB/40 Project.md"')[0] || dv.current();
const filterCategory = thisFile.card_category || "전체";
const filterStatus = thisFile.card_status || "전체";

if (filterStatus === "전체" || filterStatus === "doing") {
  let pages = dv.pages().where(p => p.type === "project" && p.status === "doing");
  if (filterCategory !== "전체") pages = pages.where(p => p.category === filterCategory);
  pages = pages.sort(p => p.due_date || "", 'asc');

  if (pages.length === 0) {
    dv.paragraph("<span style='color:var(--text-muted);font-style:italic;font-size:0.9em;'>진행 중인 프로젝트가 없습니다.</span>");
  } else {
    if (window.renderProjectCard) {
      pages.forEach(p => window.renderProjectCard(p, this.container));
    } else {
      dv.paragraph("로딩 중...");
    }
  }
}
```

---

## 📋 Planning

```dataviewjs
const thisFile = dv.pages('"HUB/40 Project.md"')[0] || dv.current();
const filterCategory = thisFile.card_category || "전체";
const filterStatus = thisFile.card_status || "전체";

if (filterStatus === "전체" || filterStatus === "planning") {
  let pages = dv.pages().where(p => p.type === "project" && p.status === "planning");
  if (filterCategory !== "전체") pages = pages.where(p => p.category === filterCategory);
  pages = pages.sort(p => p.due_date || "", 'asc');

  if (pages.length === 0) {
    dv.paragraph("<span style='color:var(--text-muted);font-style:italic;font-size:0.9em;'>기획 중인 프로젝트가 없습니다.</span>");
  } else {
    if (window.renderProjectCard) {
      pages.forEach(p => window.renderProjectCard(p, this.container));
    } else {
      dv.paragraph("로딩 중...");
    }
  }
}
```

---

## 💡 Idea

```dataviewjs
const thisFile = dv.pages('"HUB/40 Project.md"')[0] || dv.current();
const filterCategory = thisFile.card_category || "전체";
const filterStatus = thisFile.card_status || "전체";

if (filterStatus === "전체" || filterStatus === "idea") {
  let pages = dv.pages().where(p => p.type === "project" && p.status === "idea");
  if (filterCategory !== "전체") pages = pages.where(p => p.category === filterCategory);
  pages = pages.sort(p => p.due_date || "", 'asc');

  if (pages.length === 0) {
    dv.paragraph("<span style='color:var(--text-muted);font-style:italic;font-size:0.9em;'>아이디어 단계의 프로젝트가 없습니다.</span>");
  } else {
    if (window.renderProjectCard) {
      pages.forEach(p => window.renderProjectCard(p, this.container));
    } else {
      dv.paragraph("로딩 중...");
    }
  }
}
```

---

## 🚧 Blocked

```dataviewjs
const thisFile = dv.pages('"HUB/40 Project.md"')[0] || dv.current();
const filterCategory = thisFile.card_category || "전체";
const filterStatus = thisFile.card_status || "전체";

if (filterStatus === "전체" || filterStatus === "blocked") {
  let pages = dv.pages().where(p => p.type === "project" && p.status === "blocked");
  if (filterCategory !== "전체") pages = pages.where(p => p.category === filterCategory);
  pages = pages.sort(p => p.due_date || "", 'asc');

  const details = this.container.createEl("details", {
    attr: { style: "margin-bottom:12px; background:var(--background-secondary); border:1px solid var(--background-modifier-border); border-radius:8px; padding:10px; width: 100%;" }
  });
  details.createEl("summary", {
    text: "🚧 지연된 프로젝트 목록",
    attr: { style: "font-weight:bold; cursor:pointer; color:#ef4444; font-size:1.1em;" }
  });
  const contentDiv = details.createEl("div", {
    attr: { style: "margin-top:10px;" }
  });

  if (pages.length === 0) {
    contentDiv.createEl("span", {
      text: "해당 조건의 지연된 프로젝트가 없습니다.",
      attr: { style: "color:var(--text-muted); font-style:italic; font-size:0.9em; display:block; margin: 4px 0;" }
    });
  } else {
    if (window.renderProjectCard) {
      pages.forEach(p => window.renderProjectCard(p, contentDiv));
    } else {
      contentDiv.createEl("span", { text: "로딩 중..." });
    }
  }
}
```

## ✅ Completed

```dataviewjs
const thisFile = dv.pages('"HUB/40 Project.md"')[0] || dv.current();
const filterCategory = thisFile.card_category || "전체";
const filterStatus = thisFile.card_status || "전체";

if (filterStatus === "전체" || filterStatus === "completed") {
  let pages = dv.pages().where(p => p.type === "project" && p.status === "completed");
  if (filterCategory !== "전체") pages = pages.where(p => p.category === filterCategory);
  pages = pages.sort(p => p.due_date || "", 'desc');

  const details = this.container.createEl("details", {
    attr: { style: "margin-bottom:12px; background:var(--background-secondary); border:1px solid var(--background-modifier-border); border-radius:8px; padding:10px; width: 100%;" }
  });
  details.createEl("summary", {
    text: "✅ 완료된 프로젝트 목록",
    attr: { style: "font-weight:bold; cursor:pointer; color:#06b6d4; font-size:1.1em;" }
  });
  const contentDiv = details.createEl("div", {
    attr: { style: "margin-top:10px;" }
  });

  if (pages.length === 0) {
    contentDiv.createEl("span", {
      text: "해당 조건의 완료된 프로젝트가 없습니다.",
      attr: { style: "color:var(--text-muted); font-style:italic; font-size:0.9em; display:block; margin: 4px 0;" }
    });
  } else {
    if (window.renderProjectCard) {
      pages.forEach(p => window.renderProjectCard(p, contentDiv));
    } else {
      contentDiv.createEl("span", { text: "로딩 중..." });
    }
  }
}
```

## 📝 Reviewing

```dataviewjs
const thisFile = dv.pages('"HUB/40 Project.md"')[0] || dv.current();
const filterCategory = thisFile.card_category || "전체";
const filterStatus = thisFile.card_status || "전체";

if (filterStatus === "전체" || filterStatus === "reviewing") {
  let pages = dv.pages().where(p => p.type === "project" && p.status === "reviewing");
  if (filterCategory !== "전체") pages = pages.where(p => p.category === filterCategory);
  pages = pages.sort(p => p.due_date || "", 'desc');

  const details = this.container.createEl("details", {
    attr: { style: "margin-bottom:12px; background:var(--background-secondary); border:1px solid var(--background-modifier-border); border-radius:8px; padding:10px; width: 100%;" }
  });
  details.createEl("summary", {
    text: "📝 복기 중인 프로젝트 목록",
    attr: { style: "font-weight:bold; cursor:pointer; color:#f97316; font-size:1.1em;" }
  });
  const contentDiv = details.createEl("div", {
    attr: { style: "margin-top:10px;" }
  });

  if (pages.length === 0) {
    contentDiv.createEl("span", {
      text: "해당 조건의 복기 중인 프로젝트가 없습니다.",
      attr: { style: "color:var(--text-muted); font-style:italic; font-size:0.9em; display:block; margin: 4px 0;" }
    });
  } else {
    if (window.renderProjectCard) {
      pages.forEach(p => window.renderProjectCard(p, contentDiv));
    } else {
      contentDiv.createEl("span", { text: "로딩 중..." });
    }
  }
}
```

## 📦 Archived

```dataviewjs
const thisFile = dv.pages('"HUB/40 Project.md"')[0] || dv.current();
const filterCategory = thisFile.card_category || "전체";
const filterStatus = thisFile.card_status || "전체";

if (filterStatus === "전체" || filterStatus === "archived") {
  let pages = dv.pages().where(p => p.type === "project" && p.status === "archived");
  if (filterCategory !== "전체") pages = pages.where(p => p.category === filterCategory);
  pages = pages.sort(p => p.due_date || "", 'desc');

  const details = this.container.createEl("details", {
    attr: { style: "margin-bottom:12px; background:var(--background-secondary); border:1px solid var(--background-modifier-border); border-radius:8px; padding:10px; width: 100%;" }
  });
  details.createEl("summary", {
    text: "📦 보관된 프로젝트 목록",
    attr: { style: "font-weight:bold; cursor:pointer; color:var(--text-muted); font-size:1.1em;" }
  });
  const contentDiv = details.createEl("div", {
    attr: { style: "margin-top:10px;" }
  });

  if (pages.length === 0) {
    contentDiv.createEl("span", {
      text: "해당 조건의 보관된 프로젝트가 없습니다.",
      attr: { style: "color:var(--text-muted); font-style:italic; font-size:0.9em; display:block; margin: 4px 0;" }
    });
  } else {
    if (window.renderProjectCard) {
      pages.forEach(p => window.renderProjectCard(p, contentDiv));
    } else {
      contentDiv.createEl("span", { text: "로딩 중..." });
    }
  }
}
```
