---
cssclasses:
  - hide-properties_reading
card_region: 전체지역
card_type: 오피스텔
---
```js-engine
const file = app.workspace.getActiveFile();
if (!file) return;
if (!container) return;
container.empty();

// Expose globals for external scripts
// Last reload: 2026-07-12T14:59:59
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
  await loadProdigyScript("SYSTEM/Views/shared-dashboard.js");
  await loadProdigyScript("SYSTEM/Views/auction-card.js");
  
  const codeStr = window.renderAuctionCard ? window.renderAuctionCard.toString() : "undefined";
  const hasFinanceRow = codeStr.includes("financeRow");
  new Notice(`[Debug] renderAuctionCard 로드완료. 코드길이: ${codeStr.length}, financeRow 존재: ${hasFinanceRow}`, 10000);
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

# 🎯 Today

```dataviewjs
// Calculate counts and action stats
let ddayCount = 0;
let missingExpectedCount = 0;
let missingNextActionCount = 0;
const activeCases = [];

const now = new Date();
const todayStr = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

const cases = dv.pages('"PARA/PROJECTS/Auction"').where(p => p.type === "auction_case");

cases.forEach(p => {
  if (["watching", "bidding", "reviewing"].includes(p.status) && p.auction_datetime) {
    const cleanStr = String(p.auction_datetime).split(' ')[0].split('T')[0];
    if (cleanStr === todayStr) {
      ddayCount++;
    }
  }
  
  if (["watching", "bidding"].includes(p.status)) {
    const exp = p.expected_bid;
    if (!exp || exp === "정보 없음" || String(exp).trim() === "") {
      missingExpectedCount++;
    }
  }
  
  if (["watching", "bidding", "reviewing"].includes(p.status)) {
    const act = p.next_action;
    if (!act || act === "정보 없음" || String(act).trim() === "") {
      missingNextActionCount++;
    }
  }
  
  if (["watching", "bidding", "reviewing"].includes(p.status)) {
    activeCases.push(p);
  }
});

activeCases.sort((a, b) => {
  if (a.status === 'bidding' && b.status !== 'bidding') return -1;
  if (a.status !== 'bidding' && b.status === 'bidding') return 1;
  
  const dtA = a.auction_datetime ? new Date(String(a.auction_datetime).replace('T', ' ')) : null;
  const dtB = b.auction_datetime ? new Date(String(b.auction_datetime).replace('T', ' ')) : null;
  
  if (dtA && dtB) return dtA - dtB;
  if (dtA) return -1;
  if (dtB) return 1;
  return 0;
});

const nextCase = activeCases[0];

const mainBox = this.container.createEl('div', {
  attr: { style: 'display:grid;grid-template-columns: 1fr 1fr;gap:12px;margin-bottom:8px;' }
});

const statsBox = mainBox.createEl('div', {
  attr: { style: 'background:var(--background-secondary);border:1px solid var(--background-modifier-border);border-radius:10px;padding:12px;display:flex;flex-direction:column;gap:6px;box-shadow: 0 4px 8px rgba(0,0,0,0.2);' }
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

addStatItem(statsBox, '🔥 D-Day', ddayCount, '#ef4444', ddayCount > 0);
addStatItem(statsBox, '⚠️ 예상입찰가 미작성', missingExpectedCount, '#eab308', missingExpectedCount > 0);
addStatItem(statsBox, '⚠️ Next Action 미작성', missingNextActionCount, '#f97316', missingNextActionCount > 0);

const actionBox = mainBox.createEl('div', {
  attr: { style: 'background:var(--background-secondary);border:1px solid var(--background-modifier-border);border-radius:10px;padding:12px;display:flex;flex-direction:column;gap:6px;box-shadow: 0 4px 8px rgba(0,0,0,0.2);' }
});
actionBox.createEl('div', { text: '⚡ 다음 Action', attr: { style: 'font-weight:bold;font-size:0.95em;color:var(--text-accent);border-bottom:1px solid var(--background-modifier-border);padding-bottom:4px;' } });

if (nextCase) {
  const linkRow = actionBox.createEl('div', { attr: { style: 'margin-top:2px;' } });
  linkRow.createEl('span', { text: '→ ', attr: { style: 'color:#ef4444;font-weight:bold;' } });
  
  const linkSpan = linkRow.createEl('span', { attr: { style: 'font-size:0.9em;font-weight:bold;' } });
  dv.api.renderValue(nextCase.file.link, linkSpan, dv.component, nextCase.file.path, true);
  
  actionBox.createEl('div', {
    text: nextCase.next_action || "지정된 액션이 없습니다.",
    attr: { style: 'font-size:0.85em;color:var(--text-normal);background:var(--background-modifier-hover);padding:6px 8px;border-radius:6px;border-left:3px solid #ef4444;margin-top:4px;' }
  });
} else {
  actionBox.createEl('div', { text: '진행 중인 사건이 없습니다.', attr: { style: 'font-size:0.85em;color:var(--text-muted);text-align:center;margin-top:12px;' } });
}
```

---

# Auction Workflow

```js-engine
const file = app.workspace.getActiveFile();
if (!file) return;
if (!container) return;
container.empty();

const files = app.vault.getFiles().filter(f =>
  f.path.startsWith("PARA/PROJECTS/Auction/") && f.extension === "md"
);

const counts = { watching: 0, bidding: 0, skipped: 0, won: 0, lost: 0, reviewing: 0, archived: 0 };

files.forEach(f => {
  const c = app.metadataCache.getFileCache(f);
  const fm = c?.frontmatter;
  if (fm?.type === "auction_case") {
    if (counts[fm.status] !== undefined) {
      counts[fm.status]++;
    }
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

const makeGroup = (parent) => {
  return parent.createEl('div', {
    attr: { style: 'display: flex; flex-direction: column; gap: 6px;' }
  });
};

const makeArrow = (parent) => {
  parent.createEl('div', {
    text: '→',
    attr: { style: 'font-size: 1.2em; color: var(--text-muted); font-weight: bold;' }
  });
};

makeStep(pipelineBox, '👀 검토', counts.watching, '#888');
makeArrow(pipelineBox);
makeStep(pipelineBox, '⚖️ 입찰', counts.bidding, '#3b82f6');
makeArrow(pipelineBox);

const grp1 = makeGroup(pipelineBox);
makeStep(grp1, '🏆 낙찰', counts.won, '#22c55e');
makeStep(grp1, '💔 패찰', counts.lost, '#ef4444');

makeArrow(pipelineBox);
makeStep(pipelineBox, '🔄 복기', counts.reviewing, '#f97316');
makeArrow(pipelineBox);

const grp2 = makeGroup(pipelineBox);
makeStep(grp2, '❌ 포기', counts.skipped, '#666');
makeStep(grp2, '📦 보관', counts.archived, '#555');
```

---

## ⚖️ 입찰 예정

```dataviewjs
if (window.renderDashboardSection) {
  window.renderDashboardSection({
    dv: dv,
    status: "bidding",
    type: "auction_case",
    container: this.container,
    renderer: window.renderAuctionCard,
    emptyMessage: "해당 조건의 입찰 예정 물건이 없습니다.",
    sortField: "auction_datetime",
    sortOrder: "asc"
  });
}
```

---

## 👀 검토 중

```dataviewjs
if (window.renderDashboardSection) {
  window.renderDashboardSection({
    dv: dv,
    status: "watching",
    type: "auction_case",
    container: this.container,
    renderer: window.renderAuctionCard,
    emptyMessage: "해당 조건의 검토 중인 물건이 없습니다.",
    sortField: "auction_datetime",
    sortOrder: "asc"
  });
}
```

---

## 🔄 복기 중

```dataviewjs
if (window.renderDashboardSection) {
  window.renderDashboardSection({
    dv: dv,
    status: "reviewing",
    type: "auction_case",
    container: this.container,
    renderer: window.renderAuctionCard,
    emptyMessage: "해당 조건의 복기 중인 물건이 없습니다.",
    sortField: "auction_datetime",
    sortOrder: "desc"
  });
}
```

---

## 🏆 낙찰

```dataviewjs
if (window.renderDashboardSection) {
  window.renderDashboardSection({
    dv: dv,
    status: "won",
    type: "auction_case",
    container: this.container,
    renderer: window.renderAuctionCard,
    emptyMessage: "해당 조건의 낙찰 물건이 없습니다.",
    isCollapsed: true,
    summaryText: "🏆 낙찰 물건 목록",
    summaryColor: "#22c55e",
    sortField: "auction_datetime",
    sortOrder: "desc"
  });
}
```

## 💔 패찰

```dataviewjs
if (window.renderDashboardSection) {
  window.renderDashboardSection({
    dv: dv,
    status: "lost",
    type: "auction_case",
    container: this.container,
    renderer: window.renderAuctionCard,
    emptyMessage: "해당 조건의 패찰 물건이 없습니다.",
    isCollapsed: true,
    summaryText: "💔 패찰 물건 목록",
    summaryColor: "#ef4444",
    sortField: "auction_datetime",
    sortOrder: "desc"
  });
}
```

## ❌ 입찰 포기

```dataviewjs
if (window.renderDashboardSection) {
  window.renderDashboardSection({
    dv: dv,
    status: "skipped",
    type: "auction_case",
    container: this.container,
    renderer: window.renderAuctionCard,
    emptyMessage: "해당 조건의 입찰 포기 물건이 없습니다.",
    isCollapsed: true,
    summaryText: "❌ 입찰 포기 물건 목록",
    summaryColor: "#666666",
    sortField: "auction_datetime",
    sortOrder: "desc"
  });
}
```

## 📦 보관

```dataviewjs
if (window.renderDashboardSection) {
  window.renderDashboardSection({
    dv: dv,
    status: "archived",
    type: "auction_case",
    container: this.container,
    renderer: window.renderAuctionCard,
    emptyMessage: "해당 조건의 보관 물건이 없습니다.",
    isCollapsed: true,
    summaryText: "📦 보관 물건 목록",
    summaryColor: "var(--text-muted)",
    sortField: "auction_datetime",
    sortOrder: "desc"
  });
}
```
