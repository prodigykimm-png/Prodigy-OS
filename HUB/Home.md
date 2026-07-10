---
cssclasses:
  - hide-properties_editing
  - hide-properties_reading
---
# ☀️ Welcome to Prodigy OS

> **AI Assisted Personal Operating System**
> 오늘 할 일을 확인하고 필요한 Dashboard로 즉시 이동하는 네비게이션 허브입니다.

---

# 🎯 Today

```dataviewjs
const auctionCount = dv.pages('"PARA/PROJECTS/Auction"').where(p => p.type === "auction_case" && p.status === "bidding").length;
const readingCount = dv.pages('"PARA/PROJECTS/Reading"').where(p => p.type === "reading" && p.status === "reading").length;
const workoutCount = dv.pages('"PARA/PROJECTS/Workout"').where(p => p.type === "workout" && p.status === "doing").length;
const projectCount = dv.pages('"PARA/PROJECTS"').where(p => p.type === "project_family" && (p.Status === "2 In Progress" || p.Status === "1 To Do" || p.Status === "3 Testing")).length;

const grid = this.container.createEl('div', {
  attr: { style: 'display:grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin-bottom: 12px;' }
});

const addStat = (parent, title, subtitle, count, unit, color) => {
  const box = parent.createEl('div', {
    attr: { style: 'background:var(--background-secondary); border:1px solid var(--background-modifier-border); border-radius:8px; padding:10px; display:flex; flex-direction:column; align-items:center; gap:2px; box-shadow: 0 2px 4px rgba(0,0,0,0.15);' }
  });
  box.createEl('span', { text: title, attr: { style: 'font-weight:bold; font-size:0.9em; color:var(--text-normal);' } });
  box.createEl('span', { text: subtitle, attr: { style: 'font-size:0.75em; color:var(--text-muted);' } });
  box.createEl('span', { text: `${count}${unit}`, attr: { style: `font-size:1.4em; font-weight:bold; color:${color}; margin-top:2px;` } });
};

addStat(grid, '🏛 Auction', '입찰 예정', auctionCount, '건', '#3b82f6');
addStat(grid, '📚 Reading', '오늘 읽을 책', readingCount, '권', '#22c55e');
addStat(grid, '💪 Workout', '오늘 운동', workoutCount, '건', '#ef4444');
addStat(grid, '📁 Project', '진행 중', projectCount, '개', '#f97316');
```

---

# 🔍 Quick Navigation

```dataviewjs
const auctionCount = dv.pages('"PARA/PROJECTS/Auction"').where(p => p.type === "auction_case" && p.status === "bidding").length;
const readingCount = dv.pages('"PARA/PROJECTS/Reading"').where(p => p.type === "reading" && p.status === "reading").length;
const workoutCount = dv.pages('"PARA/PROJECTS/Workout"').where(p => p.type === "workout" && p.status === "doing").length;
const projectCount = dv.pages('"PARA/PROJECTS"').where(p => p.type === "project_family" && (p.Status === "2 In Progress" || p.Status === "1 To Do" || p.Status === "3 Testing")).length;

const navContainer = this.container.createEl('div', {
  attr: { style: 'display:flex; flex-direction:column; gap:8px; margin-bottom:12px;' }
});

const addNavLink = (parent, title, subtext, path, color) => {
  const row = parent.createEl('div', {
    attr: { style: 'display:flex; justify-content:space-between; align-items:center; background:var(--background-secondary); border:1px solid var(--background-modifier-border); border-left: 4px solid ' + color + '; border-radius:6px; padding:8px 12px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);' }
  });
  
  const left = row.createEl('div', { attr: { style: 'display:flex; flex-direction:column; gap:1px;' } });
  left.createEl('strong', { text: title, attr: { style: 'color:var(--text-normal); font-size:0.9em;' } });
  left.createEl('span', { text: subtext, attr: { style: 'font-size:0.75em; color:var(--text-muted);' } });
  
  const right = row.createEl('a', {
    text: '→ Open',
    attr: {
      class: 'internal-link',
      style: `font-size:0.8em; font-weight:bold; color:${color}; text-decoration:none; cursor:pointer; background:var(--background-modifier-hover); padding:3px 8px; border-radius:4px; transition: background 0.2s;`
    }
  });
  
  right.onclick = () => app.workspace.openLinkText(path, path);
};

addNavLink(navContainer, '📥 Inbox', '임시 저장 및 빠른 캡처 대기 공간', 'HUB/Inbox.md', '#eab308');
addNavLink(navContainer, '🏛 Auction Dashboard', `현재 입찰 예정 ${auctionCount}건`, 'HUB/Auction_Dashboard.md', '#3b82f6');
addNavLink(navContainer, '📚 Reading Dashboard', `오늘 읽을 책 ${readingCount}권`, 'PARA/PROJECTS/Reading', '#22c55e');
addNavLink(navContainer, '💪 Workout Dashboard', `오늘 운동 ${workoutCount}건`, 'PARA/PROJECTS/Workout', '#ef4444');
addNavLink(navContainer, '📁 Project Dashboard', `진행중 ${projectCount}개`, 'PARA/PROJECTS', '#f97316');
addNavLink(navContainer, '🧠 Knowledge Dashboard', '지식 허브 및 연구 자료', 'ZETA', '#a855f7');
```

---

# 🕒 Recent Objects

```dataviewjs
let recentPages = dv.pages()
  .where(p => p.type && p.type !== "fleeting_note" && !p.file.path.startsWith("SYSTEM/") && !p.file.path.startsWith("HUB/"))
  .sort(p => p.file.mtime, 'desc')
  .limit(7);

const listContainer = this.container.createEl('div', {
  attr: { style: 'background:var(--background-secondary); border:1px solid var(--background-modifier-border); border-radius:8px; padding:10px; display:flex; flex-direction:column; gap:6px;' }
});

recentPages.forEach(p => {
  const row = listContainer.createEl('div', {
    attr: { style: 'display:flex; justify-content:space-between; align-items:center; font-size:0.82em; padding:4px 6px; border-bottom:1px solid var(--background-modifier-border);' }
  });
  
  const linkEl = row.createEl('a', {
    text: p.file.name,
    attr: { class: 'internal-link', style: 'color:var(--text-accent); font-weight:bold; cursor:pointer; text-decoration:none;' }
  });
  linkEl.onclick = () => app.workspace.openLinkText(p.file.name, p.file.path);
  
  const typeBadge = row.createEl('span', {
    text: String(p.type).toUpperCase(),
    attr: { style: 'font-size:0.7em; background:var(--background-modifier-hover); color:var(--text-muted); padding:1px 5px; border-radius:3px;' }
  });
});
```
