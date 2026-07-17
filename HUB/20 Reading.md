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
  await loadProdigyScript("SYSTEM/Views/display-registry.js");
  await loadProdigyScript("SYSTEM/Views/prodigy-ui.js");
  await loadProdigyScript("SYSTEM/Views/object-lifecycle-core.js");
  await loadProdigyScript("SYSTEM/Views/object-lifecycle-view.js");
  await loadProdigyScript("SYSTEM/Views/object-engine-core.js");
  await loadProdigyScript("SYSTEM/Views/shared-dashboard.js");
  await loadProdigyScript("SYSTEM/Views/reading-memory-core.js");
  await loadProdigyScript("SYSTEM/Views/reading-memory-retrieval.js");
  await loadProdigyScript("SYSTEM/Views/reading-memory-store.js");
  await loadProdigyScript("SYSTEM/Views/reading-memory-view.js");
  await loadProdigyScript("SYSTEM/Views/reading-checklist-core.js");
  await loadProdigyScript("SYSTEM/Views/reading-checklist-store.js");
  await loadProdigyScript("SYSTEM/Views/reading-checklist-view.js");
  await loadProdigyScript("SYSTEM/Views/reading-core.js");
  await loadProdigyScript("SYSTEM/Views/reading-store.js");
  await loadProdigyScript("SYSTEM/Views/reading-view.js");
  await loadProdigyScript("SYSTEM/Views/reading-book-create.js");
  await loadProdigyScript("SYSTEM/Views/reading-strategy-core.js");
  await loadProdigyScript("SYSTEM/Views/reading-workspace-core.js");
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

// Create a complete Reading Object only after book metadata is available.
if (window.ProdigyUI) window.ProdigyUI.ensureStyles();
const toolbar = container.createEl("div", {
  attr: { class: "prodigy-btn-row", style: "margin-bottom:16px;" }
});
const btn = window.ProdigyUI
  ? window.ProdigyUI.button(toolbar, "＋ 새 책 추가", { primary: true })
  : toolbar.createEl("button", { text: "＋ 새 책 추가", attr: { type: "button", class: "prodigy-btn prodigy-btn-primary" } });
btn.onclick = (e) => {
  e.preventDefault();
  window.ReadingBookCreate.open(app);
};

```

# 📖 읽는 중

```dataviewjs
// Card-first dashboard. Runtime + Strategy power the strip/actions — not a second UI wall.
const mapReading = (p) => Object.assign({}, p, {
  type: "reading",
  path: p.file.path,
  title: p.title || p.book_title || p.file.name,
  book_title: p.book_title || p.title || p.file.name,
  author: p.author,
  status: p.status,
  next_action: p.next_action,
  progress: p.progress,
  current_page: p.current_page,
  total_page: p.total_page,
  reading_strategy: p.reading_strategy,
  book_type: p.book_type,
  reading_type: p.reading_type,
  category: p.category,
  connections: p.connections,
  file: p.file,
  id: p.id,
  mtime: p.file && p.file.mtime,
  updated: p.updated
});

/** Single Runtime evaluate for the whole Reading hub (shared on window). */
const ensureRuntimeModel = (force) => {
  if (!force && window.__readingWorkspaceModel) return window.__readingWorkspaceModel;
  if (!window.ObjectEngine || !window.ReadingWorkspaceCore) return null;
  try {
    const all = dv.pages('"PARA/PROJECTS/Reading"').where(p => p.type === "reading").array().map(mapReading);
    const session = window.ObjectEngine.createRuntimeSession({});
    const build = window.ReadingWorkspaceCore.shareRuntimeModel
      || window.ReadingWorkspaceCore.buildWorkspaceModel;
    const model = build(all, { session });
    window.__readingWorkspaceModel = model;
    window.__readingRuntimeSession = session;
    return model;
  } catch (_e) {
    return null;
  }
};

const scrollToReadingPath = (path) => {
  if (!path) return;
  const root = document;
  const el = root.querySelector && root.querySelector(`[data-reading-path="${CSS && CSS.escape ? CSS.escape(path) : path}"]`);
  if (el && el.scrollIntoView) {
    el.scrollIntoView({ behavior: "smooth", block: "center" });
  }
};

const openContinueSession = (cont) => {
  if (!cont || !cont.object_path || !window.ReadingView || !window.ReadingCore) return;
  const page = dv.page(cont.object_path);
  const book = window.ReadingCore.normalizeBook(Object.assign({}, page || {}, {
    path: cont.object_path,
    title: cont.title,
    book_title: cont.title,
    next_action: cont.next_action,
    progress: cont.progress_number || cont.progress
  }));
  const open = window.ReadingView.openSessionModal || window.ReadingView.openQuickSession;
  open(app, book, () => {
    try { delete window.__readingWorkspaceModel; } catch (_e) { window.__readingWorkspaceModel = null; }
  }, { progress: cont.progress_number || cont.progress, next_action: cont.next_action });
};

const run = () => {
  if (!window.renderReadingCard) return false;
  this.container.empty();

  // Compact Continue from Runtime (one strip — not full workspace render)
  const model = ensureRuntimeModel();
  const contBox = this.container.createEl("div", {
    attr: {
      class: "reading-continue-strip",
      style: "margin:0 0 12px;padding:10px 12px;border-radius:10px;border:1px solid var(--background-modifier-border);background:var(--background-secondary);"
    }
  });
  contBox.createEl("div", {
    text: "▶ 이어 읽기",
    attr: { style: "font-weight:800;font-size:0.88em;color:var(--text-accent);margin-bottom:4px;" }
  });

  const cont = model && model.continue_reading;
  if (cont && !cont.empty) {
    contBox.createEl("div", {
      text: cont.title || "현재 책",
      attr: { style: "font-weight:700;font-size:0.95em;" }
    });
    const actionLine = contBox.createEl("div", {
      attr: { style: "font-size:0.84em;color:var(--text-muted);margin-top:2px;" }
    });
    actionLine.createEl("span", { text: cont.action || "이어 읽기" });
    if (cont.progress) {
      actionLine.createEl("span", {
        text: ` · ${cont.progress}`,
        attr: { style: "font-weight:700;" }
      });
    }
    if (cont.next_action) {
      contBox.createEl("div", {
        text: `다음 · ${cont.next_action}`,
        attr: { style: "margin-top:4px;font-size:0.82em;font-weight:650;color:var(--text-normal);" }
      });
    }
    if (cont.reason) {
      const r = contBox.createEl("div", {
        attr: { style: "margin-top:6px;font-size:0.78em;color:var(--text-muted);" }
      });
      r.createEl("span", { text: "이유 ", attr: { style: "font-weight:700;color:var(--text-faint);margin-right:4px;" } });
      r.createEl("span", { text: cont.reason });
    }
    // Strategy chip for active book (power layer, not a full section)
    if (model.strategy && !model.strategy.empty && model.strategy.strategy_label) {
      contBox.createEl("div", {
        text: `전략 · ${model.strategy.strategy_label}`,
        attr: { style: "margin-top:6px;font-size:0.78em;font-weight:650;color:var(--text-muted);" }
      });
    }
    // Continue focus + single minimal session path (no form wall)
    const stripActions = contBox.createEl("div", {
      attr: { class: "prodigy-btn-row", style: "margin-top:10px;display:flex;flex-wrap:wrap;gap:6px;" }
    });
    const readBtn = window.ProdigyUI
      ? window.ProdigyUI.button(stripActions, "오늘 읽기", { primary: true })
      : stripActions.createEl("button", { text: "오늘 읽기", attr: { type: "button", class: "prodigy-btn prodigy-btn-primary" } });
    readBtn.onclick = (e) => {
      if (e && e.preventDefault) e.preventDefault();
      openContinueSession(cont);
    };
    const focusBtn = window.ProdigyUI
      ? window.ProdigyUI.button(stripActions, "이 책 포커스")
      : stripActions.createEl("button", { text: "이 책 포커스", attr: { type: "button", class: "prodigy-btn" } });
    focusBtn.onclick = (e) => {
      if (e && e.preventDefault) e.preventDefault();
      scrollToReadingPath(cont.focus_path || cont.object_path);
    };
  } else {
    contBox.createEl("div", {
      text: "진행 중인 독서가 없습니다.",
      attr: { style: "font-size:0.85em;color:var(--text-muted);font-style:italic;" }
    });
  }

  // Hero cards — primary visible surface (focus path highlighted via model)
  const pages = dv.pages('"PARA/PROJECTS/Reading"').where(p => p.type === "reading" && p.status === "reading");
  if (pages.length === 0) {
    this.container.createEl("span", {
      text: "진행 중인 독서가 없습니다.",
      attr: { style: "color:var(--text-muted); font-style:italic; font-size:0.9em;" }
    });
  } else {
    // Prefer Runtime focus first when multiple reading books
    const arr = pages.array ? pages.array() : [...pages];
    const focus = model && model.focus_path;
    arr.sort((a, b) => {
      const ap = a.file && a.file.path;
      const bp = b.file && b.file.path;
      if (focus && ap === focus) return -1;
      if (focus && bp === focus) return 1;
      return 0;
    });
    arr.forEach(p => window.renderReadingCard(p, this.container, "hero"));
  }
  return true;
};
if (!run()) {
  this.container.empty();
  this.container.createEl("span", { text: "로딩 중..." });
  const t = setInterval(() => { if (run()) clearInterval(t); }, 100);
  setTimeout(() => clearInterval(t), 10000);
}
```

---

## 최근 세션

```js-engine
if (!container) return;
container.empty();
window.obsidian = obsidian;
window.app = app;

const loadProdigyScript = async (path) => {
  const tFile = app.vault.getAbstractFileByPath(path);
  if (tFile) (new Function(await app.vault.read(tFile)))();
};

try {
  await loadProdigyScript("SYSTEM/Views/prodigy-ui.js");
  await loadProdigyScript("SYSTEM/Views/reading-core.js");
  await loadProdigyScript("SYSTEM/Views/reading-store.js");
  await loadProdigyScript("SYSTEM/Views/reading-view.js");
  const render = window.ReadingView?.renderSessionHistory || window.ReadingView?.renderLearningLoop;
  if (render) await render(app, container);
  else {
    container.createEl("span", {
      text: "최근 세션이 없습니다.",
      attr: { style: "color:var(--text-muted);font-style:italic;font-size:0.9em;" }
    });
  }
} catch (error) {
  container.createEl("p", {
    text: "세션 기록을 불러오지 못했습니다.",
    attr: { style: "color:var(--text-error);font-size:0.85em;" }
  });
  if (window.prodigyDebugMode) {
    container.createEl("pre", { text: error.stack || error.message });
  }
}
```

---

## 📚 읽기 대기

```dataviewjs
const run = () => {
  if (window.renderReadingCard) {
    this.container.empty();
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
      pages.forEach(p => window.renderReadingCard(p, grid, "grid"));
    }
    return true;
  }
  return false;
};
if (!run()) {
  this.container.empty();
  this.container.createEl("span", { text: "로딩 중..." });
  const t = setInterval(() => { if (run()) clearInterval(t); }, 100);
  setTimeout(() => clearInterval(t), 10000);
}
```

---

## ⏳ 오래 방치

```dataviewjs
const run = () => {
  if (!window.renderReadingCard) return false;
  this.container.empty();
  const model = window.__readingWorkspaceModel;
  const stale = model && model.stale_reading;
  if (stale && !stale.empty && stale.items && stale.items.length) {
    const paths = new Set(stale.items.map(i => i.path).filter(Boolean));
    const pages = dv.pages('"PARA/PROJECTS/Reading"')
      .where(p => p.type === "reading" && paths.has(p.file.path));
    if (pages.length === 0) {
      this.container.createEl("span", {
        text: "오래 방치된 독서가 없습니다.",
        attr: { style: "color:var(--text-muted); font-style:italic; font-size:0.9em;" }
      });
    } else {
      this.container.createEl("div", {
        text: "Runtime lifecycle · 오래 갱신되지 않은 읽는 중 책",
        attr: { style: "font-size:0.78em;color:var(--text-muted);margin-bottom:8px;" }
      });
      pages.forEach(p => window.renderReadingCard(p, this.container, "simple"));
    }
    return true;
  }
  this.container.createEl("span", {
    text: "오래 방치된 독서가 없습니다.",
    attr: { style: "color:var(--text-muted); font-style:italic; font-size:0.9em;" }
  });
  return true;
};
if (!run()) {
  this.container.empty();
  this.container.createEl("span", { text: "로딩 중..." });
  const t = setInterval(() => { if (run()) clearInterval(t); }, 100);
  setTimeout(() => clearInterval(t), 10000);
}
```

---

---

## 🏁 완독 임박

```dataviewjs
const run = () => {
  if (!window.renderReadingCard) return false;
  this.container.empty();
  const model = window.__readingWorkspaceModel;
  const finish = model && model.finish_soon;
  if (finish && !finish.empty && finish.items && finish.items.length) {
    const paths = new Set(finish.items.map(i => i.path).filter(Boolean));
    const pages = dv.pages('"PARA/PROJECTS/Reading"')
      .where(p => p.type === "reading" && paths.has(p.file.path));
    if (pages.length === 0) {
      this.container.createEl("span", {
        text: "완독 임박 책이 없습니다.",
        attr: { style: "color:var(--text-muted); font-style:italic; font-size:0.9em;" }
      });
    } else {
      this.container.createEl("div", {
        text: "진행 75% 이상 · 상태 전환은 직접 결정",
        attr: { style: "font-size:0.78em;color:var(--text-muted);margin-bottom:8px;" }
      });
      pages.forEach(p => window.renderReadingCard(p, this.container, "simple"));
    }
    return true;
  }
  this.container.createEl("span", {
    text: "완독 임박 책이 없습니다.",
    attr: { style: "color:var(--text-muted); font-style:italic; font-size:0.9em;" }
  });
  return true;
};
if (!run()) {
  this.container.empty();
  this.container.createEl("span", { text: "로딩 중..." });
  const t = setInterval(() => { if (run()) clearInterval(t); }, 100);
  setTimeout(() => clearInterval(t), 10000);
}
```

---

---

## 📝 복기 필요

```dataviewjs
const run = () => {
  if (window.renderReadingCard) {
    this.container.empty();
    // Prefer Runtime-derived waiting list when preloaded; else status reviewing
    const model = window.__readingWorkspaceModel;
    if (model && model.waiting_review && !model.waiting_review.empty && model.waiting_review.items) {
      const paths = new Set(model.waiting_review.items.map(i => i.path).filter(Boolean));
      let pages = dv.pages('"PARA/PROJECTS/Reading"')
        .where(p => p.type === "reading" && paths.has(p.file.path));
      if (pages.length === 0) {
        pages = dv.pages('"PARA/PROJECTS/Reading"').where(p => p.type === "reading" && p.status === "reviewing");
      }
      if (pages.length === 0) {
        this.container.createEl("span", {
          text: "읽을 복기 대상이 없습니다.",
          attr: { style: "color:var(--text-muted); font-style:italic; font-size:0.9em;" }
        });
      } else {
        pages.forEach(p => window.renderReadingCard(p, this.container, "simple"));
      }
      return true;
    }
    const pages = dv.pages('"PARA/PROJECTS/Reading"').where(p => p.type === "reading" && p.status === "reviewing");
    if (pages.length === 0) {
      this.container.createEl("span", {
        text: "읽을 복기 대상이 없습니다.",
        attr: { style: "color:var(--text-muted); font-style:italic; font-size:0.9em;" }
      });
    } else {
      pages.forEach(p => window.renderReadingCard(p, this.container, "simple"));
    }
    return true;
  }
  return false;
};
if (!run()) {
  this.container.empty();
  this.container.createEl("span", { text: "로딩 중..." });
  const t = setInterval(() => { if (run()) clearInterval(t); }, 100);
  setTimeout(() => clearInterval(t), 10000);
}
```

---

---

# ✅ 최근 완독

```dataviewjs
const run = () => {
  if (window.renderReadingCard) {
    this.container.empty();
    const current = dv.current();
    const sortBy = current.sort_completed_by || "date";
    const filterRating = Number(current.filter_rating);

    const filterContainer = this.container.createEl("div", {
      attr: { style: "display: flex; justify-content: flex-end; align-items: center; gap: 10px; margin-bottom: 8px;" }
    });

    const makeSelectInline = (parent, label, field, options, currentVal) => {
      const wrapper = parent.createEl('div', { attr: { style: 'display: flex; align-items: center; gap: 4px; font-size: 0.78em; color: var(--text-muted);' } });
      wrapper.createEl('span', { text: label, attr: { style: 'font-weight: bold;' } });
      
      const sel = wrapper.createEl('select', { 
        attr: { 
          style: 'font-size: 0.95em; padding: 1px 4px; border-radius: 4px; background: var(--background-modifier-hover); color: var(--text-normal); border: 1px solid var(--background-modifier-border); cursor: pointer;' 
        } 
      });
      
      options.forEach(o => {
        const opt = sel.createEl('option', { text: o.text, value: o.value });
        if (o.value === String(currentVal !== undefined && currentVal !== null ? currentVal : o.value)) {
          opt.selected = true;
        }
      });
      
      sel.onchange = async () => {
        const file = app.workspace.getActiveFile();
        if (file) {
          await app.fileManager.processFrontMatter(file, (fm) => {
            fm[field] = sel.value;
          });
        }
      };
    };

    makeSelectInline(filterContainer, '필터:', 'filter_rating', [
      { text: '전체', value: '' },
      { text: '⭐ 5점', value: '5' },
      { text: '⭐ 4점 이상', value: '4' },
      { text: '⭐ 3점 이상', value: '3' }
    ], current.filter_rating);

    filterContainer.createEl('span', { text: '|', attr: { style: 'color: var(--background-modifier-border); font-size: 0.8em;' } });

    makeSelectInline(filterContainer, '정렬:', 'sort_completed_by', [
      { text: '📅 최근 완독 순', value: 'date' },
      { text: '⭐ 평점 높은 순', value: 'rating' }
    ], current.sort_completed_by);

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
        text: "최근 완독 기록이 없습니다.",
        attr: { style: "color:var(--text-muted); font-style:italic; font-size:0.9em;" }
      });
    } else {
      pages.forEach(p => window.renderReadingCard(p, this.container, "simple"));
    }
    return true;
  }
  return false;
};
if (!run()) {
  this.container.empty();
  this.container.createEl("span", { text: "로딩 중..." });
  const t = setInterval(() => { if (run()) clearInterval(t); }, 100);
  setTimeout(() => clearInterval(t), 10000);
}
```

---


# 객체 라이프사이클

```dataviewjs
if (window.ObjectLifecycleCore && window.ObjectLifecycleView) {
  const pages = dv.pages('"PARA/PROJECTS/Reading"').where(p => p.type === "reading").array();
  const evaluation = window.ObjectLifecycleCore.evaluateCollection(pages);
  window.ObjectLifecycleView.renderWorkspaceSummary({
    container: this.container,
    counts: evaluation.counts,
    title: "독서 라이프사이클"
  });
} else {
  this.container.createEl("span", {
    text: "객체 라이프사이클 모듈을 불러오는 중...",
    attr: { style: "color:var(--text-muted);font-size:0.82em;" }
  });
}
```
