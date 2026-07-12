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
  await loadProdigyScript("SYSTEM/Views/reading-card.js");
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

// Render "+ 새 책 추가" button
const btn = container.createEl('button', {
  text: '＋ 새 책 추가',
  attr: { style: 'font-size:0.8em; font-weight:bold; padding:5px 12px; border-radius:6px; background:var(--text-accent); color:#ffffff; border:none; cursor:pointer; margin-bottom:16px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);' }
});

btn.onclick = async (e) => {
  e.preventDefault();
  const folderPath = "PARA/PROJECTS/Reading";
  const folder = app.vault.getAbstractFileByPath(folderPath);
  if (!folder) {
    new Notice("Error: PARA/PROJECTS/Reading 폴더가 존재하지 않습니다.");
    return;
  }
  
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const hour = String(now.getHours()).padStart(2, '0');
  const min = String(now.getMinutes()).padStart(2, '0');
  
  let baseName = `새 책 ${year}-${month}-${day} ${hour}${min}`;
  let fileName = `${baseName}.md`;
  let filePath = `${folderPath}/${fileName}`;
  
  let counter = 1;
  while (app.vault.getAbstractFileByPath(filePath)) {
    fileName = `${baseName}_${counter}.md`;
    filePath = `${folderPath}/${fileName}`;
    counter++;
  }
  
  try {
    const newFile = await app.vault.create(filePath, "");
    new Notice(`새 책 노트가 생성되었습니다: ${fileName}`);
    const leaf = app.workspace.getLeaf(false);
    await leaf.openFile(newFile);
  } catch (err) {
    new Notice("파일 생성 중 오류가 발생했습니다: " + err.message);
  }
};
```

# 📖 Continue Reading

```dataviewjs
const pages = dv.pages('"PARA/PROJECTS/Reading"').where(p => p.type === "reading" && p.status === "reading");
if (pages.length === 0) {
  this.container.createEl("span", {
    text: "현재 읽는 중인 책이 없습니다.",
    attr: { style: "color:var(--text-muted); font-style:italic; font-size:0.9em;" }
  });
} else {
  if (window.renderReadingCard) {
    pages.forEach(p => window.renderReadingCard(p, this.container, "hero"));
  } else {
    this.container.createEl("span", { text: "로딩 중..." });
  }
}
```

---

# 📝 Review Needed

```dataviewjs
const pages = dv.pages('"PARA/PROJECTS/Reading"').where(p => p.type === "reading" && p.status === "reviewing");
if (pages.length === 0) {
  this.container.createEl("span", {
    text: "리뷰 대기 중인 책이 없습니다.",
    attr: { style: "color:var(--text-muted); font-style:italic; font-size:0.9em;" }
  });
} else {
  if (window.renderReadingCard) {
    pages.forEach(p => window.renderReadingCard(p, this.container, "simple"));
  } else {
    this.container.createEl("span", { text: "로딩 중..." });
  }
}
```

---

# 📚 Reading Queue

```dataviewjs
const pages = dv.pages('"PARA/PROJECTS/Reading"').where(p => p.type === "reading" && p.status === "queue");
if (pages.length === 0) {
  this.container.createEl("span", {
    text: "독서 대기열이 비어 있습니다.",
    attr: { style: "color:var(--text-muted); font-style:italic; font-size:0.9em;" }
  });
} else {
  const grid = this.container.createEl("div", {
    attr: { style: "display: flex; flex-wrap: wrap; gap: 16px; margin-top: 8px;" }
  });
  if (window.renderReadingCard) {
    pages.forEach(p => window.renderReadingCard(p, grid, "grid"));
  } else {
    this.container.createEl("span", { text: "로딩 중..." });
  }
}
```

# 🔍 Filter

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
  const row = container.createEl('div', { attr: { style: 'display:inline-flex;align-items:center;margin-right:12px;margin-bottom:8px;' } });
  row.createEl('span', { text: label + ' ', attr: { style: 'font-weight:bold;font-size:0.85em;margin-right:4px;' } });
  const sel = row.createEl('select', { attr: { style: 'font-size:0.85em;padding:2px 6px;border-radius:4px;background:var(--background-modifier-hover);color:var(--text-normal);border:1px solid var(--background-modifier-border);cursor:pointer;' } });
  options.forEach(o => {
    const val = o.value;
    const opt = sel.createEl('option', { text: o.text, value: val });
    if (val === String(current !== undefined ? current : o.value)) opt.selected = true;
  });
  sel.onchange = () => setFilter(field, sel.value);
  return sel;
};

makeSelect('평점 필터', 'filter_rating', [
  { text: '전체', value: '' },
  { text: '⭐ 5점', value: '5' },
  { text: '⭐ 4점 이상', value: '4' },
  { text: '⭐ 3점 이상', value: '3' }
], fm.filter_rating);

makeSelect('정렬 기준', 'sort_completed_by', [
  { text: '📅 최근 완독 순', value: 'date' },
  { text: '⭐ 평점 높은 순', value: 'rating' }
], fm.sort_completed_by);
```

---

# ✅ Recently Finished

```dataviewjs
const current = dv.current();
const sortBy = current.sort_completed_by || "date";
const sortLabel = sortBy === "rating" ? "⭐ 평점 높은 순" : "📅 최근 완독 순";

const filterRating = Number(current.filter_rating);
const filterLabel = filterRating ? `⭐ ${filterRating}.0점 이상` : "전체";

this.container.createEl("div", {
  text: `필터: ${filterLabel} | 정렬: ${sortLabel}`,
  attr: { style: "font-size: 0.78em; color: var(--text-muted); text-align: right; margin-bottom: 6px; font-style: italic;" }
});

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
    text: "조건에 맞는 완독 도서가 없습니다.",
    attr: { style: "color:var(--text-muted); font-style:italic; font-size:0.9em;" }
  });
} else {
  if (window.renderReadingCard) {
    pages.forEach(p => window.renderReadingCard(p, this.container, "simple"));
  } else {
    this.container.createEl("span", { text: "로딩 중..." });
  }
}
```

---

# 🧠 AI Workspace

> [!NOTE]
> AI 독서 추천 및 지식 연결 서비스 준비 중입니다.

<div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 12px; margin-top: 8px;">
  <div style="background: var(--background-secondary); border: 1px dashed var(--background-modifier-border); border-radius: 8px; padding: 12px; text-align: center; color: var(--text-muted);">
    <div style="font-weight: bold; color: var(--text-normal); font-size: 0.9em; margin-bottom: 4px;">🧠 Suggested Knowledge</div>
    <span style="font-size: 0.8em; font-style: italic;">연관 지식 추천 후보가 없습니다.</span>
  </div>
  <div style="background: var(--background-secondary); border: 1px dashed var(--background-modifier-border); border-radius: 8px; padding: 12px; text-align: center; color: var(--text-muted);">
    <div style="font-weight: bold; color: var(--text-normal); font-size: 0.9em; margin-bottom: 4px;">🎯 Suggested Projects</div>
    <span style="font-size: 0.8em; font-style: italic;">도서 기반 추천 실행 프로젝트가 없습니다.</span>
  </div>
  <div style="background: var(--background-secondary); border: 1px dashed var(--background-modifier-border); border-radius: 8px; padding: 12px; text-align: center; color: var(--text-muted);">
    <div style="font-weight: bold; color: var(--text-normal); font-size: 0.9em; margin-bottom: 4px;">📚 Suggested Related Books</div>
    <span style="font-size: 0.8em; font-style: italic;">연관 도서 추천 목록이 없습니다.</span>
  </div>
</div>
