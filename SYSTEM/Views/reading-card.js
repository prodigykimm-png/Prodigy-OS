window.renderReadingCard = function(p, container, mode = "simple") {
  const display = window.prodigyDisplay || {
    statusInfo: () => ({ color: 'var(--text-accent)' })
  };
  const color = display.statusInfo(p.status).color;
  const titleOf = () => p.title || p.book_title || p.file.name;

  const checklistSource = () => ({
    source_path: p.file.path,
    id: p.id || "",
    title: p.title || "",
    book_title: p.book_title || "",
    reading_strategy: p.reading_strategy || "",
    book_type: p.book_type || "",
    reading_type: p.reading_type || "",
    category: p.category || "",
    genre: p.genre || "",
    tag: p.tag || "",
    tags: p.tags || [],
  });

  /** Strategy Layer — explainability chip only (no UI wall). Explicit fields; generic if unknown. */
  const strategyChip = () => {
    if (!window.ReadingStrategyCore || typeof window.ReadingStrategyCore.resolveStrategy !== "function") return null;
    try {
      return window.ReadingStrategyCore.resolveStrategy({
        reading_strategy: p.reading_strategy,
        book_type: p.book_type,
        reading_type: p.reading_type
      });
    } catch (_e) {
      return null;
    }
  };

  if (window.ProdigyUI) window.ProdigyUI.ensureStyles();

  /** Discrete progress only. current_page is discarded — do not read or write it.
   * 0% is omitted: empty/null progress already means unread. */
  const PROGRESS_STEPS = [25, 50, 75, 100];

  const normalizeProgress = (value) => {
    if (value === undefined || value === null || value === "") return null;
    const raw = String(value).replace(/%/g, "").trim();
    const n = Number(raw);
    if (!Number.isFinite(n)) return null;
    const clamped = Math.min(100, Math.max(0, Math.round(n)));
    if (clamped === 0) return null; // unread — no chip selected
    if (PROGRESS_STEPS.includes(clamped)) return clamped;
    // snap to nearest step for display highlight
    return PROGRESS_STEPS.reduce((best, step) =>
      Math.abs(step - clamped) < Math.abs(best - clamped) ? step : best
    , PROGRESS_STEPS[0]);
  };

  const makeBtn = (parentEl, text, options) => {
    if (window.ProdigyUI && window.ProdigyUI.button) {
      return window.ProdigyUI.button(parentEl, text, options);
    }
    const btn = parentEl.createEl("button", {
      text,
      attr: { type: "button", class: options && options.primary ? "prodigy-btn prodigy-btn-primary" : "prodigy-btn" }
    });
    if (options && options.onClick) btn.onclick = options.onClick;
    return btn;
  };

  /**
   * Progress picker: 25 / 50 / 75 / 100%
   * Writes canonical `progress` only. No auto status change. No current_page.
   * Empty progress = unread (no need for 0% chip).
   */
  const renderProgressPicker = (parentEl) => {
    if (p.status !== "reading" || !p.file || !p.file.path) return;
    const current = normalizeProgress(p.progress);

    const wrap = parentEl.createEl("div", {
      attr: {
        class: "reading-progress-picker",
        style: "display:flex;flex-wrap:wrap;align-items:center;gap:6px;margin-top:6px;"
      }
    });
    wrap.createEl("span", {
      text: "진행",
      attr: { style: "font-size:0.75em;font-weight:700;color:var(--text-muted);margin-right:2px;" }
    });

    PROGRESS_STEPS.forEach((step) => {
      const selected = current === step;
      const chip = wrap.createEl("button", {
        text: `${step}%`,
        attr: {
          type: "button",
          class: selected ? "prodigy-btn prodigy-btn-primary reading-progress-chip" : "prodigy-btn reading-progress-chip",
          "data-progress": String(step),
          style: selected
            ? "min-height:28px;padding:2px 8px;font-size:0.75em;font-weight:700;border-radius:999px;"
            : "min-height:28px;padding:2px 8px;font-size:0.75em;border-radius:999px;opacity:0.9;"
        }
      });
      chip.onclick = async (e) => {
        if (e && e.preventDefault) e.preventDefault();
        if (e && e.stopPropagation) e.stopPropagation();
        const tFile = app.vault.getAbstractFileByPath(p.file.path);
        if (!tFile || !app.fileManager || !app.fileManager.processFrontMatter) {
          if (window.Notice) new Notice("진행도를 저장할 수 없습니다.");
          return;
        }
        try {
          await app.fileManager.processFrontMatter(tFile, (fm) => {
            fm.progress = step;
            if (Object.prototype.hasOwnProperty.call(fm, "current_page")) {
              delete fm.current_page;
            }
            fm.updated = new Date().toISOString().slice(0, 10);
          });
          p.progress = step;
          // Refresh chip styles without full re-render
          wrap.querySelectorAll("button[data-progress]").forEach((btn) => {
            const val = Number(btn.getAttribute("data-progress"));
            const on = val === step;
            btn.className = on
              ? "prodigy-btn prodigy-btn-primary reading-progress-chip"
              : "prodigy-btn reading-progress-chip";
            btn.style.minHeight = "28px";
            btn.style.padding = "2px 8px";
            btn.style.fontSize = "0.75em";
            btn.style.borderRadius = "999px";
            btn.style.fontWeight = on ? "700" : "";
            btn.style.opacity = on ? "1" : "0.9";
          });
          if (window.Notice) new Notice(`진행 ${step}%`);
        } catch (err) {
          if (window.Notice) new Notice("진행도 저장에 실패했습니다.");
          if (window.prodigyDebugMode) console.error(err);
        }
      };
    });
  };

  const renderChecklistButton = (parentEl) => {
    if (p.status !== "reading" || !window.ReadingChecklistView || !p.file || !p.file.path) return;
    makeBtn(parentEl, "독서 질답", {
      onClick: () => window.ReadingChecklistView.openForSource(app, checklistSource())
    });
  };

  const renderMemoryButton = (parentEl) => {
    if (!window.ReadingMemoryView || !p.file || !p.file.path) return;
    makeBtn(parentEl, "관련 기억", {
      onClick: () => window.ReadingMemoryView.openForSource(app, p.file.path)
    });
  };

  const renderTodayReadButton = (parentEl) => {
    if (p.status !== "reading" || !window.ReadingView || !window.ReadingCore) return;
    makeBtn(parentEl, "오늘 읽기", {
      primary: true,
      onClick: () => {
        const book = window.ReadingCore.normalizeBook({
          ...p,
          path: p.file.path,
          file: p.file,
          book_title: p.title || p.book_title || p.file.name
        });
        window.ReadingView.openSessionModal(app, book, () => {
          if (window.Notice) new Notice("독서 세션이 저장되었습니다. 워크스페이스를 새로고침하면 목록에 반영됩니다.");
        });
      }
    });
  };
  
  // Helper to render book cover
  const renderBookCover = (parentEl) => {
    const coverPath = p.cover || p.cover_image || p.cover_url || p.book_cover || p.image;
    if (coverPath) {
      let src = coverPath;
      if (!coverPath.startsWith("http://") && !coverPath.startsWith("https://") && !coverPath.startsWith("app://")) {
        const file = app.metadataCache.getFirstLinkpathDest(coverPath, p.file.path);
        if (file) {
          src = app.vault.getResourcePath(file);
        }
      }
      const img = parentEl.createEl('img', {
        attr: {
          src: src,
          referrerpolicy: 'no-referrer',
          style: 'width: 90px; height: 130px; object-fit: cover; border-radius: 4px; box-shadow: 0 4px 6px rgba(0,0,0,0.15); cursor: pointer;'
        }
      });
      img.onclick = () => app.workspace.openLinkText(p.file.name, p.file.path);
    } else {
      const bookTitle = titleOf();
      const author = p.author || "저자 미상";
      
      let hash = 0;
      for (let i = 0; i < bookTitle.length; i++) {
        hash = bookTitle.charCodeAt(i) + ((hash << 5) - hash);
      }
      const hue = Math.abs(hash % 360);
      const colorBg = `hsl(${hue}, 55%, 38%)`;
      const colorBgLight = `hsl(${hue}, 55%, 22%)`;
      
      const cover = parentEl.createEl('div', {
        attr: {
          style: `width: 90px; height: 130px; background: linear-gradient(135deg, ${colorBg} 0%, ${colorBgLight} 100%); border-radius: 4px; display: flex; flex-direction: column; justify-content: space-between; padding: 10px 8px; box-shadow: 0 4px 6px rgba(0,0,0,0.15); color: #ffffff; font-family: sans-serif; cursor: pointer; border-left: 3px solid rgba(255,255,255,0.3);`
        }
      });
      
      cover.createEl('div', {
        text: bookTitle,
        attr: {
          style: 'font-size: 0.8em; font-weight: bold; line-height: 1.2; display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; text-overflow: ellipsis;'
        }
      });
      
      cover.createEl('div', {
        text: author,
        attr: {
          style: 'font-size: 0.62em; opacity: 0.85; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; text-align: right;'
        }
      });
      
      cover.onclick = () => app.workspace.openLinkText(p.file.name, p.file.path);
    }
  };

  // Helper to render next action button
  const renderNextActionButton = (parentEl, currentStatus) => {
    const transitions = {
      queue: { key: 'reading', label: '📖 읽기 시작', color: '#22c55e' },
      reading: { key: 'reviewing', label: '📝 복기 시작', color: '#f97316' },
      reviewing: { key: 'completed', label: '✅ 복기 완료', color: '#06b6d4' },
      completed: { key: 'archived', label: '📦 보관', color: '#8e8e93' }
    };
    
    const target = transitions[currentStatus];
    if (!target) return;
    
    const btn = makeBtn(parentEl, target.label, {
      onClick: async () => {
        let rating = p.rating || "";
        let keyTakeaway = p.key_takeaway || "";

        if (target.key === "completed") {
          const inputRating = await window.obsidianPrompt(`[${titleOf()}] 완독 기록`, "평점을 입력해주세요 (1 ~ 5):", String(rating));
          if (inputRating === null) return;
          rating = Math.min(5, Math.max(1, Number(inputRating) || 5));

          const inputTakeaway = await window.obsidianPrompt(`[${titleOf()}] 완독 기록`, "핵심 한 줄 요약(Key Takeaway)을 기록해주세요:", keyTakeaway);
          if (inputTakeaway === null) return;
          keyTakeaway = inputTakeaway.trim();
        }

        btn.disabled = true;
        const tFile = app.vault.getAbstractFileByPath(p.file.path);
        if (tFile) {
          await app.fileManager.processFrontMatter(tFile, (fm) => {
            fm.status = target.key;
            if (rating) fm.rating = rating;
            if (keyTakeaway) fm.key_takeaway = keyTakeaway;
            fm.updated = new Date().toISOString().split("T")[0];
          });
          new Notice("상태가 업데이트되었습니다.");
        }
      }
    });
  };
  
  if (mode === "hero") {
    // Cover + meta on top row; actions always full-width below so mobile never covers the image.
    const card = container.createEl('div', {
      attr: {
        class: 'reading-card reading-card-hero',
        style: 'border: 1px solid var(--background-modifier-border); border-radius: 10px; padding: 12px; margin-bottom: 12px; background: var(--background-secondary); display: flex; flex-direction: column; gap: 12px; box-shadow: 0 4px 8px rgba(0,0,0,0.06);'
      }
    });

    const main = card.createEl('div', {
      attr: {
        class: 'reading-card-hero-main',
        style: 'display: flex; gap: 14px; align-items: flex-start; min-width: 0;'
      }
    });

    const coverBox = main.createEl('div', {
      attr: { class: 'reading-card-cover', style: 'flex: 0 0 auto;' }
    });
    renderBookCover(coverBox);

    const contentBox = main.createEl('div', {
      attr: {
        class: 'reading-card-meta',
        style: 'flex: 1 1 auto; min-width: 0; display: flex; flex-direction: column; gap: 4px;'
      }
    });

    const title = contentBox.createEl('a', {
      text: titleOf(),
      attr: {
        class: 'internal-link',
        style: 'font-weight: bold; font-size: 1.05em; color: var(--text-normal); text-decoration: none; cursor: pointer; overflow-wrap: anywhere;'
      }
    });
    title.onclick = () => app.workspace.openLinkText(p.file.name, p.file.path);

    contentBox.createEl('div', {
      text: p.author || "저자 미상",
      attr: { style: 'font-size: 0.8em; color: var(--text-muted);' }
    });

    const strat = strategyChip();
    if (strat && strat.strategy_label) {
      contentBox.createEl('div', {
        text: `전략 · ${strat.strategy_label}`,
        attr: { style: 'font-size: 0.75em; font-weight: 650; color: var(--text-muted); margin-top: 2px;' }
      });
    }

    // Progress: 0/25/50/75/100 — secondary to action buttons
    renderProgressPicker(contentBox);

    // Light reflection cue (after-reading prompts live on the Object; no auto answers)
    if (p.status === "reading" && window.ReadingStrategyCore && typeof window.ReadingStrategyCore.buildReflection === "function") {
      try {
        const key = strat && strat.strategy ? strat.strategy : "generic";
        const refl = window.ReadingStrategyCore.buildReflection(key);
        if (refl && refl.prompts && refl.prompts[0]) {
          contentBox.createEl('div', {
            text: `성찰 · ${refl.prompts[0].label}`,
            attr: { style: 'font-size: 0.72em; color: var(--text-faint); margin-top: 4px; line-height: 1.35;' }
          });
        }
      } catch (_e) { /* optional */ }
    }

    const actionBox = card.createEl('div', {
      attr: {
        class: 'prodigy-card-actions reading-card-actions',
        style: 'width: 100%; justify-content: flex-start;'
      }
    });
    renderTodayReadButton(actionBox);
    renderChecklistButton(actionBox);
    renderMemoryButton(actionBox);
    renderNextActionButton(actionBox, p.status);
    
  } else if (mode === "simple") {
    // Title/meta first, actions full-width below on narrow screens.
    const card = container.createEl('div', {
      attr: {
        class: 'reading-card reading-card-simple',
        style: `border: 1px solid var(--background-modifier-border); border-left: 4px solid ${color}; border-radius: 6px; padding: 10px 12px; margin-bottom: 8px; background: var(--background-secondary); display: flex; flex-direction: column; gap: 10px; box-shadow: 0 2px 4px rgba(0,0,0,0.06);`
      }
    });
    
    const left = card.createEl('div', { attr: { style: 'display: flex; flex-direction: column; gap: 2px; min-width: 0;' } });
    const title = left.createEl('a', {
      text: titleOf(),
      attr: {
        class: 'internal-link',
        style: 'font-weight: bold; font-size: 0.9em; color: var(--text-normal); text-decoration: none; cursor: pointer; overflow-wrap: anywhere;'
      }
    });
    title.onclick = () => app.workspace.openLinkText(p.file.name, p.file.path);
    
    const authorRow = left.createEl('div', {
      attr: { style: 'font-size: 0.78em; color: var(--text-muted); display: flex; align-items: center; gap: 6px; flex-wrap: wrap;' }
    });
    authorRow.createEl('span', { text: p.author || "저자 미상" });
    if (p.rating) {
      authorRow.createEl('span', {
        text: `⭐ ${p.rating}.0`,
        attr: { style: 'color: #eab308; font-weight: bold;' }
      });
    }
    
    const right = card.createEl('div', {
      attr: { class: 'prodigy-card-actions reading-card-actions', style: 'width:100%; justify-content:flex-start;' }
    });
    renderChecklistButton(right);
    renderMemoryButton(right);
    renderNextActionButton(right, p.status);
    
  } else if (mode === "grid") {
    // 📚 Reading Queue Grid Layout
    const gridItem = container.createEl('div', {
      attr: {
        style: 'display: flex; flex-direction: column; align-items: center; gap: 6px; width: 100px; text-align: center;'
      }
    });
    
    renderBookCover(gridItem);
    
    const title = gridItem.createEl('a', {
      text: titleOf(),
      attr: {
        class: 'internal-link',
        style: 'font-weight: bold; font-size: 0.78em; color: var(--text-normal); text-decoration: none; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; height: 2.4em; line-height: 1.2; width: 100%; cursor: pointer;'
      }
    });
    title.onclick = () => app.workspace.openLinkText(p.file.name, p.file.path);
    
    const actionBox = gridItem.createEl('div', {
      attr: { class: 'prodigy-card-actions', style: 'flex-direction:column;margin-top:2px;width:100%;' }
    });
    renderChecklistButton(actionBox);
    renderMemoryButton(actionBox);
    renderNextActionButton(actionBox, p.status);
  }
};
