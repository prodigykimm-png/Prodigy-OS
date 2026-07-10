---
cssclasses:
  - hide-properties_reading
card_region: 전체지역
card_type: 전체종류
---
# 🎯 Today

```js-engine
const file = app.workspace.getActiveFile();
if (!file) return;
if (!container) return;
container.empty();

const files = app.vault.getFiles().filter(f =>
  f.path.startsWith("PARA/PROJECTS/Auction/") && f.extension === "md"
);

// Define global render card function
window.renderAuctionCard = function(p, container) {
  const statusColors = {
    watching: '#888888',
    bidding: '#3b82f6',
    reviewing: '#f97316',
    won: '#22c55e',
    lost: '#ef4444',
    skipped: '#555555',
    archived: '#444444'
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
  
  // D-Day & Date
  const ddayContainer = header.createEl('div', { attr: { style: 'display: flex; align-items: center; gap: 6px;' } });
  
  const dtStr = p.auction_datetime;
  let ddayStr = "-";
  let isUrgent = false;
  if (dtStr) {
    const cleanDtStr = String(dtStr).replace('T', ' ');
    const parts = cleanDtStr.split(/[- :]/);
    if (parts.length >= 3) {
      const year = parseInt(parts[0]);
      const month = parseInt(parts[1]) - 1;
      const day = parseInt(parts[2]);
      const date1 = new Date(year, month, day);
      const now = new Date();
      const date2 = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const diffTime = date1 - date2;
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      
      if (diffDays === 0) {
        ddayStr = "D-Day";
        isUrgent = true;
      } else if (diffDays > 0) {
        ddayStr = "D-" + diffDays;
        if (diffDays <= 7) isUrgent = true;
      } else {
        ddayStr = "D+" + Math.abs(diffDays);
      }
    }
  }
  
  if (ddayStr !== "-") {
    ddayContainer.createEl('span', {
      text: ddayStr,
      attr: {
        style: `background: ${isUrgent ? 'var(--text-accent)' : 'var(--background-modifier-hover)'}; color: var(--text-normal); font-size: 0.72em; font-weight: bold; padding: 1px 4px; border-radius: 4px;`
      }
    });
  }
  
  if (p.auction_datetime) {
    ddayContainer.createEl('span', {
      text: String(p.auction_datetime).replace('T', ' '),
      attr: { style: 'font-size: 0.75em; color: var(--text-muted);' }
    });
  }
  
  // Address & Property Type
  const subHeader = card.createEl('div', {
    attr: { style: 'font-size: 0.8em; color: #aeaea2; display: flex; gap: 6px; align-items: center;' }
  });
  subHeader.createEl('span', { text: p.property_type || "-" });
  subHeader.createEl('span', { text: '·', attr: { style: 'color: #555;' } });
  
  const rawAddr = p.address || "-";
  const displayAddr = rawAddr.length > 32 ? rawAddr.slice(0, 30) + "..." : rawAddr;
  subHeader.createEl('span', { text: displayAddr, attr: { title: rawAddr } });
  
  // Prices Row
  const prices = card.createEl('div', {
    attr: { style: 'display: flex; gap: 12px; font-size: 0.8em; color: var(--text-normal); background: var(--background-modifier-hover); padding: 3px 6px; border-radius: 4px;' }
  });
  
  const toEok = (v) => {
    if (!v || v === "정보 없음") return "-";
    const num = Number(v);
    if (isNaN(num)) return v;
    return (num / 100000000).toFixed(2) + "억";
  };
  
  const minRateStr = (p.appraisal_price && p.minimum_bid && p.appraisal_price !== "정보 없음" && p.minimum_bid !== "정보 없음") 
    ? ` (${(Number(p.minimum_bid) / Number(p.appraisal_price) * 100).toFixed(0)}%)` 
    : "";
    
  prices.createEl('div', { html: `감정가: <strong style="color:var(--text-normal);">${toEok(p.appraisal_price)}</strong>` });
  prices.createEl('div', { html: `최저가: <strong style="color:var(--text-normal);">${toEok(p.minimum_bid)}${minRateStr}</strong>` });
  prices.createEl('div', { html: `예상가: <strong style="color:var(--text-accent);">${toEok(p.expected_bid)}</strong>` });
  
  // Recommendation & Next Action
  const detailRow = card.createEl('div', {
    attr: { style: 'display: flex; flex-direction: column; gap: 1px; font-size: 0.78em;' }
  });
  
  if (p.recommendation || p.recommend) {
    const level = p.recommendation || p.recommend_level || "보통";
    const note = p.recommend_note && p.recommend_note !== "정보 없음" ? ` · ${p.recommend_note}` : "";
    const icon = level === "강추" ? "🔥" : level === "추천" ? "👍" : "✨";
    detailRow.createEl('div', {
      html: `<span style="color:var(--text-accent); font-weight:bold;">${icon} 추천등급: ${level}</span>${note}`,
      attr: { style: 'color:var(--text-muted);' }
    });
  }
  
  detailRow.createEl('div', {
    html: `→ <strong style="color:var(--text-accent); font-weight:bold;">Next Action:</strong> ${p.next_action || "⚠️ 설정 필요"}`,
    attr: { style: 'color:var(--text-normal);' }
  });
  
  // Transition status buttons
  const getTransitionButtons = (currentStatus) => {
    const allTransitions = {
      watching: [
        { key: 'bidding', label: '⚖️ 입찰 예정', color: '#3b82f6' },
        { key: 'skipped', label: '❌ 입찰 포기', color: '#666' }
      ],
      bidding: [
        { key: 'won', label: '🏆 낙찰', color: '#22c55e' },
        { key: 'lost', label: '💔 패찰', color: '#ef4444' },
        { key: 'skipped', label: '❌ 입찰 포기', color: '#666' }
      ],
      reviewing: [
        { key: 'archived', label: '📦 보관', color: '#555' }
      ],
      won: [
        { key: 'reviewing', label: '🔄 복기', color: '#f97316' },
        { key: 'archived', label: '📦 보관', color: '#555' }
      ],
      lost: [
        { key: 'reviewing', label: '🔄 복기', color: '#f97316' },
        { key: 'archived', label: '📦 보관', color: '#555' }
      ],
      skipped: [
        { key: 'archived', label: '📦 보관', color: '#555' }
      ],
      archived: [] // No buttons
    };
    return allTransitions[currentStatus] || [];
  };
  
  const buttons = getTransitionButtons(p.status);
  
  if (buttons.length > 0) {
    const buttonContainer = card.createEl('div', {
      attr: { style: 'display: flex; gap: 4px; margin-top: 3px; flex-wrap: wrap; border-top: 1px solid var(--background-modifier-border); padding-top: 4px;' }
    });
    
    buttonContainer.createEl('span', {
      text: '상태 변경:',
      attr: { style: 'font-size: 0.72em; color: var(--text-muted); display: flex; align-items: center; margin-right: 4px;' }
    });
    
    buttons.forEach(opt => {
      const btn = buttonContainer.createEl('button', {
        text: opt.label,
        attr: {
          style: `font-size: 0.7em; padding: 1px 4px; border-radius: 3px; background: var(--background-modifier-hover); color: var(--text-normal); border: 1px solid ${opt.color}; cursor: pointer;`
        }
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

// Calculate counts and action stats
let ddayCount = 0;
let missingExpectedCount = 0;
let missingNextActionCount = 0;
const activeCases = [];

const now = new Date();
const todayStr = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

files.forEach(f => {
  const c = app.metadataCache.getFileCache(f);
  const fm = c?.frontmatter;
  if (fm?.type === "auction_case") {
    // 1. D-Day calculation
    if (["watching", "bidding", "reviewing"].includes(fm.status) && fm.auction_datetime) {
      const cleanStr = String(fm.auction_datetime).split(' ')[0].split('T')[0];
      if (cleanStr === todayStr) {
        ddayCount++;
      }
    }
    
    // 2. Expected bid missing
    if (["watching", "bidding"].includes(fm.status)) {
      const exp = fm.expected_bid;
      if (!exp || exp === "정보 없음" || String(exp).trim() === "") {
        missingExpectedCount++;
      }
    }
    
    // 3. Next action missing
    if (["watching", "bidding", "reviewing"].includes(fm.status)) {
      const act = fm.next_action;
      if (!act || act === "정보 없음" || String(act).trim() === "") {
        missingNextActionCount++;
      }
    }
    
    // Collect active for Next Action
    if (["watching", "bidding", "reviewing"].includes(fm.status)) {
      activeCases.push({ file: f, fm: fm });
    }
  }
});

// Find the single next action target (Bidding is priority, then earliest datetime)
activeCases.sort((a, b) => {
  if (a.fm.status === 'bidding' && b.fm.status !== 'bidding') return -1;
  if (a.fm.status !== 'bidding' && b.fm.status === 'bidding') return 1;
  
  const dtA = a.fm.auction_datetime ? new Date(a.fm.auction_datetime.replace('T', ' ')) : null;
  const dtB = b.fm.auction_datetime ? new Date(b.fm.auction_datetime.replace('T', ' ')) : null;
  
  if (dtA && dtB) return dtA - dtB;
  if (dtA) return -1;
  if (dtB) return 1;
  return 0;
});

const nextCase = activeCases[0];

// Render Today Card Layout
const mainBox = container.createEl('div', {
  attr: { style: 'display:grid;grid-template-columns: 1fr 1fr;gap:12px;margin-bottom:8px;' }
});

// Left Column: Stats Box
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

// Right Column: Next Action Box
const actionBox = mainBox.createEl('div', {
  attr: { style: 'background:var(--background-secondary);border:1px solid var(--background-modifier-border);border-radius:10px;padding:12px;display:flex;flex-direction:column;gap:6px;box-shadow: 0 4px 8px rgba(0,0,0,0.2);' }
});
actionBox.createEl('div', { text: '⚡ 다음 Action', attr: { style: 'font-weight:bold;font-size:0.95em;color:var(--text-accent);border-bottom:1px solid var(--background-modifier-border);padding-bottom:4px;' } });

if (nextCase) {
  const linkRow = actionBox.createEl('div', { attr: { style: 'margin-top:2px;' } });
  linkRow.createEl('span', { text: '→ ', attr: { style: 'color:#ef4444;font-weight:bold;' } });
  const linkEl = linkRow.createEl('a', {
    text: nextCase.file.name.replace('.md',''),
    attr: { class: 'internal-link', style: 'color:var(--text-accent);font-weight:bold;text-decoration:underline;cursor:pointer;font-size:0.9em;' }
  });
  linkEl.onclick = () => app.workspace.openLinkText(nextCase.file.name.replace('.md',''), nextCase.file.path);
  
  actionBox.createEl('div', {
    text: nextCase.fm.next_action || "지정된 액션이 없습니다.",
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
    attr: { style: `display: flex; flex-direction: column; align-items: center; background: var(--background-modifier-hover); border: 1px solid ${color}; border-radius: 6px; padding: 6px 12px; min-width: 80px; box-shadow: 0 2px 4px rgba(0,0,0,0.15);` }
  });
  step.createEl('span', { text: label, attr: { style: 'font-size: 0.8em; color: var(--text-muted); font-weight: bold;' } });
  step.createEl('span', { text: String(count), attr: { style: `font-size: 1.25em; font-weight: bold; color: ${color};` } });
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

makeSelect('지역 필터', 'card_region', ['전체지역', '서울', '경기', '인천', '부산'], fm.card_region);
makeSelect('종류 필터', 'card_type', ['전체종류', '오피스텔', '아파트', '상가', '지식산업센터'], fm.card_type);
```

---

## ⚖️ 입찰 예정

```dataviewjs
const thisFile = dv.pages('"HUB/10 Auction.md"')[0] || dv.current();
const filterRegion = thisFile.card_region || "전체지역";
const filterType = thisFile.card_type || "전체종류";

let pages = dv.pages('"PARA/PROJECTS/Auction"')
  .where(p => p.type === "auction_case" && p.status === "bidding");

if (filterRegion !== "전체지역") {
  pages = pages.where(p => (p.region_sido || "").includes(filterRegion));
}
if (filterType !== "전체종류") {
  pages = pages.where(p => (p.property_type || "").includes(filterType));
}

pages = pages.sort(p => p.auction_datetime || "", 'asc');

if (pages.length === 0) {
  dv.paragraph("<span style='color:var(--text-muted);font-style:italic;font-size:0.9em;'>해당 조건의 입찰 예정 물건이 없습니다.</span>");
} else {
  if (window.renderAuctionCard) {
    pages.forEach(p => window.renderAuctionCard(p, this.container));
  } else {
    dv.paragraph("로딩 중...");
  }
}
```

---

## 👀 검토 중

```dataviewjs
const thisFile = dv.pages('"HUB/10 Auction.md"')[0] || dv.current();
const filterRegion = thisFile.card_region || "전체지역";
const filterType = thisFile.card_type || "전체종류";

let pages = dv.pages('"PARA/PROJECTS/Auction"')
  .where(p => p.type === "auction_case" && p.status === "watching");

if (filterRegion !== "전체지역") {
  pages = pages.where(p => (p.region_sido || "").includes(filterRegion));
}
if (filterType !== "전체종류") {
  pages = pages.where(p => (p.property_type || "").includes(filterType));
}

pages = pages.sort(p => p.auction_datetime || "", 'asc');

if (pages.length === 0) {
  dv.paragraph("<span style='color:var(--text-muted);font-style:italic;font-size:0.9em;'>해당 조건의 검토 중인 물건이 없습니다.</span>");
} else {
  if (window.renderAuctionCard) {
    pages.forEach(p => window.renderAuctionCard(p, this.container));
  } else {
    dv.paragraph("로딩 중...");
  }
}
```

---

## 🔄 복기 중

```dataviewjs
const thisFile = dv.pages('"HUB/10 Auction.md"')[0] || dv.current();
const filterRegion = thisFile.card_region || "전체지역";
const filterType = thisFile.card_type || "전체종류";

let pages = dv.pages('"PARA/PROJECTS/Auction"')
  .where(p => p.type === "auction_case" && p.status === "reviewing");

if (filterRegion !== "전체지역") {
  pages = pages.where(p => (p.region_sido || "").includes(filterRegion));
}
if (filterType !== "전체종류") {
  pages = pages.where(p => (p.property_type || "").includes(filterType));
}

pages = pages.sort(p => p.auction_datetime || "", 'desc');

if (pages.length === 0) {
  dv.paragraph("<span style='color:var(--text-muted);font-style:italic;font-size:0.9em;'>해당 조건의 복기 중인 물건이 없습니다.</span>");
} else {
  if (window.renderAuctionCard) {
    pages.forEach(p => window.renderAuctionCard(p, this.container));
  } else {
    dv.paragraph("로딩 중...");
  }
}
```

---

## 🏆 낙찰

```dataviewjs
const thisFile = dv.pages('"HUB/10 Auction.md"')[0] || dv.current();
const filterRegion = thisFile.card_region || "전체지역";
const filterType = thisFile.card_type || "전체종류";

let pages = dv.pages('"PARA/PROJECTS/Auction"')
  .where(p => p.type === "auction_case" && p.status === "won");

if (filterRegion !== "전체지역") {
  pages = pages.where(p => (p.region_sido || "").includes(filterRegion));
}
if (filterType !== "전체종류") {
  pages = pages.where(p => (p.property_type || "").includes(filterType));
}

pages = pages.sort(p => p.auction_datetime || "", 'desc');

const details = this.container.createEl("details", {
  attr: { style: "margin-bottom:12px; background:var(--background-secondary); border:1px solid var(--background-modifier-border); border-radius:8px; padding:10px; width: 100%;" }
});
details.createEl("summary", {
  text: "🏆 낙찰 물건 목록",
  attr: { style: "font-weight:bold; cursor:pointer; color:#22c55e; font-size:1.1em;" }
});
const contentDiv = details.createEl("div", {
  attr: { style: "margin-top:10px;" }
});

if (pages.length === 0) {
  contentDiv.createEl("span", {
    text: "해당 조건의 낙찰 물건이 없습니다.",
    attr: { style: "color:var(--text-muted); font-style:italic; font-size:0.9em; display:block; margin: 4px 0;" }
  });
} else {
  if (window.renderAuctionCard) {
    pages.forEach(p => window.renderAuctionCard(p, contentDiv));
  } else {
    contentDiv.createEl("span", { text: "로딩 중..." });
  }
}
```

## 💔 패찰

```dataviewjs
const thisFile = dv.pages('"HUB/10 Auction.md"')[0] || dv.current();
const filterRegion = thisFile.card_region || "전체지역";
const filterType = thisFile.card_type || "전체종류";

let pages = dv.pages('"PARA/PROJECTS/Auction"')
  .where(p => p.type === "auction_case" && p.status === "lost");

if (filterRegion !== "전체지역") {
  pages = pages.where(p => (p.region_sido || "").includes(filterRegion));
}
if (filterType !== "전체종류") {
  pages = pages.where(p => (p.property_type || "").includes(filterType));
}

pages = pages.sort(p => p.auction_datetime || "", 'desc');

const details = this.container.createEl("details", {
  attr: { style: "margin-bottom:12px; background:var(--background-secondary); border:1px solid var(--background-modifier-border); border-radius:8px; padding:10px; width: 100%;" }
});
details.createEl("summary", {
  text: "💔 패찰 물건 목록",
  attr: { style: "font-weight:bold; cursor:pointer; color:#ef4444; font-size:1.1em;" }
});
const contentDiv = details.createEl("div", {
  attr: { style: "margin-top:10px;" }
});

if (pages.length === 0) {
  contentDiv.createEl("span", {
    text: "해당 조건의 패찰 물건이 없습니다.",
    attr: { style: "color:var(--text-muted); font-style:italic; font-size:0.9em; display:block; margin: 4px 0;" }
  });
} else {
  if (window.renderAuctionCard) {
    pages.forEach(p => window.renderAuctionCard(p, contentDiv));
  } else {
    contentDiv.createEl("span", { text: "로딩 중..." });
  }
}
```

## ❌ 입찰 포기

```dataviewjs
const thisFile = dv.pages('"HUB/10 Auction.md"')[0] || dv.current();
const filterRegion = thisFile.card_region || "전체지역";
const filterType = thisFile.card_type || "전체종류";

let pages = dv.pages('"PARA/PROJECTS/Auction"')
  .where(p => p.type === "auction_case" && p.status === "skipped");

if (filterRegion !== "전체지역") {
  pages = pages.where(p => (p.region_sido || "").includes(filterRegion));
}
if (filterType !== "전체종류") {
  pages = pages.where(p => (p.property_type || "").includes(filterType));
}

pages = pages.sort(p => p.auction_datetime || "", 'desc');

const details = this.container.createEl("details", {
  attr: { style: "margin-bottom:12px; background:var(--background-secondary); border:1px solid var(--background-modifier-border); border-radius:8px; padding:10px; width: 100%;" }
});
details.createEl("summary", {
  text: "❌ 입찰 포기 물건 목록",
  attr: { style: "font-weight:bold; cursor:pointer; color:#666; font-size:1.1em;" }
});
const contentDiv = details.createEl("div", {
  attr: { style: "margin-top:10px;" }
});

if (pages.length === 0) {
  contentDiv.createEl("span", {
    text: "해당 조건의 입찰 포기 물건이 없습니다.",
    attr: { style: "color:var(--text-muted); font-style:italic; font-size:0.9em; display:block; margin: 4px 0;" }
  });
} else {
  if (window.renderAuctionCard) {
    pages.forEach(p => window.renderAuctionCard(p, contentDiv));
  } else {
    contentDiv.createEl("span", { text: "로딩 중..." });
  }
}
```

## 📦 보관

```dataviewjs
const thisFile = dv.pages('"HUB/10 Auction.md"')[0] || dv.current();
const filterRegion = thisFile.card_region || "전체지역";
const filterType = thisFile.card_type || "전체종류";

let pages = dv.pages('"PARA/PROJECTS/Auction"')
  .where(p => p.type === "auction_case" && p.status === "archived");

if (filterRegion !== "전체지역") {
  pages = pages.where(p => (p.region_sido || "").includes(filterRegion));
}
if (filterType !== "전체종류") {
  pages = pages.where(p => (p.property_type || "").includes(filterType));
}

pages = pages.sort(p => p.auction_datetime || "", 'desc');

const details = this.container.createEl("details", {
  attr: { style: "margin-bottom:12px; background:var(--background-secondary); border:1px solid var(--background-modifier-border); border-radius:8px; padding:10px; width: 100%;" }
});
details.createEl("summary", {
  text: "📦 보관 물건 목록",
  attr: { style: "font-weight:bold; cursor:pointer; color:var(--text-muted); font-size:1.1em;" }
});
const contentDiv = details.createEl("div", {
  attr: { style: "margin-top:10px;" }
});

if (pages.length === 0) {
  contentDiv.createEl("span", {
    text: "해당 조건의 보관 물건이 없습니다.",
    attr: { style: "color:var(--text-muted); font-style:italic; font-size:0.9em; display:block; margin: 4px 0;" }
  });
} else {
  if (window.renderAuctionCard) {
    pages.forEach(p => window.renderAuctionCard(p, contentDiv));
  } else {
    contentDiv.createEl("span", { text: "로딩 중..." });
  }
}
```
