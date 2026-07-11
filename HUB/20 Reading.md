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
await loadProdigyScript("SYSTEM/Views/reading-card.js");
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
const pages = dv.pages('"PARA/PROJECTS/Reading"').where(p => p.type === "reading" && p.status === "finished" && p.review_status === "pending");
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
const pages = dv.pages('"PARA/PROJECTS/Reading"').where(p => p.type === "reading" && p.status === "to_read");
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

---

# ✅ Recently Finished

```dataviewjs
const pages = dv.pages('"PARA/PROJECTS/Reading"').where(p => p.type === "reading" && p.status === "finished").sort(p => p.finish_date || p.file.mtime, "desc");
if (pages.length === 0) {
  this.container.createEl("span", {
    text: "최근 완독한 책이 없습니다.",
    attr: { style: "color:var(--text-muted); font-style:italic; font-size:0.9em;" }
  });
} else {
  const grid = this.container.createEl("div", {
    attr: { style: "display: flex; flex-wrap: wrap; gap: 12px; margin-top: 8px;" }
  });
  if (window.renderReadingCard) {
    pages.forEach(p => window.renderReadingCard(p, grid, "cover_only"));
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
