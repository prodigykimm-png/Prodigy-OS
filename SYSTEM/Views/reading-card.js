window.renderReadingCard = function(p, container, mode = "simple") {
  const T = (typeof ProdigyTokens !== "undefined" ? ProdigyTokens : (typeof globalThis !== "undefined" ? globalThis : this).ProdigyTokens) || {};
  const display = window.prodigyDisplay || {
    statusInfo: (status) => ({ label: status || "미지정" })
  };
  const statusInfo = display.statusInfo(p.status) || {};
  const statusLabel = statusInfo.label || p.status || "미지정";
  const titleOf = () => p.title || p.book_title || p.file.name;
  const pathOf = () => (p.file && p.file.path) || p.path || "";
  const ws = window.ReadingWorkspaceCore || null;
  const focusPath = (window.__readingWorkspaceModel && window.__readingWorkspaceModel.focus_path) || "";
  const isFocus = !!(focusPath && pathOf() && focusPath === pathOf());

  const checklistSource = () => ({
    source_path: pathOf(),
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
  const PROGRESS_STEPS = (ws && ws.PROGRESS_STEPS) || [25, 50, 75, 100];

  const normalizeProgress = (value) => {
    if (ws && typeof ws.normalizeProgressStep === "function") {
      return ws.normalizeProgressStep(value);
    }
    if (value === undefined || value === null || value === "") return null;
    const raw = String(value).replace(/%/g, "").trim();
    const n = Number(raw);
    if (!Number.isFinite(n)) return null;
    const clamped = Math.min(100, Math.max(0, Math.round(n)));
    if (clamped === 0) return null;
    if (PROGRESS_STEPS.includes(clamped)) return clamped;
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

  const asBook = () => {
    if (window.ReadingCore && typeof window.ReadingCore.normalizeBook === "function") {
      return window.ReadingCore.normalizeBook({
        ...p,
        path: pathOf(),
        file: p.file,
        book_title: p.title || p.book_title || (p.file && p.file.name)
      });
    }
    return {
      ...p,
      path: pathOf(),
      book_title: titleOf(),
      title: titleOf()
    };
  };

  const invalidateRuntime = () => {
    try { delete window.__readingWorkspaceModel; } catch (_e) { window.__readingWorkspaceModel = null; }
  };

  /**
   * Progress picker: 25 / 50 / 75 / 100%
   * Writes canonical `progress` only. No auto status change. No current_page.
   */
  const renderProgressPicker = (parentEl) => {
    if (p.status !== "reading" || !pathOf()) return;
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
            ? "min-height:44px;padding:8px 12px;font-size:0.75em;font-weight:700;border-radius:999px;"
            : "min-height:44px;padding:8px 12px;font-size:0.75em;border-radius:999px;opacity:0.9;"
        }
      });
      chip.onclick = async (e) => {
        if (e && e.preventDefault) e.preventDefault();
        if (e && e.stopPropagation) e.stopPropagation();
        const tFile = app.vault.getAbstractFileByPath(pathOf());
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
          invalidateRuntime();
          wrap.querySelectorAll("button[data-progress]").forEach((btn) => {
            const val = Number(btn.getAttribute("data-progress"));
            const on = val === step;
            btn.className = on
              ? "prodigy-btn prodigy-btn-primary reading-progress-chip"
              : "prodigy-btn reading-progress-chip";
            btn.style.minHeight = "44px";
            btn.style.padding = "8px 12px";
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

  /** next_action as primary context line (never invent). */
  const renderNextActionLine = (parentEl) => {
    const text = p.next_action != null ? String(p.next_action).trim() : "";
    if (!text) return;
    const row = parentEl.createEl("div", {
      attr: {
        class: "reading-next-action",
        style: "margin-top:4px;padding:6px 8px;border-radius:8px;background:var(--background-primary);border:1px solid var(--background-modifier-border);font-size:0.82em;line-height:1.4;"
      }
    });
    row.createEl("span", {
      text: "다음 ",
      attr: { style: "font-weight:800;color:var(--ke-color-accent, var(--text-accent));margin-right:4px;" }
    });
    row.createEl("span", { text });
  };

  /** Explicit connections only → people / note chips. */
  const renderPeopleChips = (parentEl) => {
    if (!ws || typeof ws.parseConnectionChips !== "function") return;
    const chips = ws.parseConnectionChips(p.connections, 5);
    if (!chips.length) return;
    const wrap = parentEl.createEl("div", {
      attr: {
        class: "reading-people-chips",
        style: "display:flex;flex-wrap:wrap;gap:4px;margin-top:6px;"
      }
    });
    chips.forEach((chip) => {
      const el = wrap.createEl("button", {
        text: chip.label,
        attr: {
          type: "button",
          class: "prodigy-btn reading-person-chip",
          style: "min-height:44px;padding:8px 12px;font-size:0.72em;border-radius:999px;"
        }
      });
      el.onclick = (e) => {
        if (e && e.preventDefault) e.preventDefault();
        if (e && e.stopPropagation) e.stopPropagation();
        const target = chip.path || chip.name;
        if (target) app.workspace.openLinkText(String(target).replace(/\.md$/i, ""), pathOf() || "", false);
      };
    });
  };

  /** Async Q&A progress strip (checklist state if present). */
  const renderQaProgress = (parentEl) => {
    if (p.status !== "reading" && p.status !== "reviewing") return;
    if (!pathOf() || !window.ReadingChecklistCore || !window.ReadingChecklistStore) return;
    const slot = parentEl.createEl("div", {
      attr: {
        class: "reading-qa-progress",
        style: "margin-top:4px;font-size:0.75em;color:var(--text-muted);min-height:1.1em;"
      }
    });
    (async () => {
      try {
        const source = checklistSource();
        const selection = window.ReadingChecklistCore.selectQuestions
          ? window.ReadingChecklistCore.selectQuestions(source)
          : null;
        const id = window.ReadingChecklistCore.stableSourceId(source);
        const adapter = window.ReadingChecklistStore.createObsidianAdapter(app);
        const store = window.ReadingChecklistStore.createChecklistStore(adapter);
        const state = await store.read(id);
        if (!state || !state.items) {
          slot.setText ? slot.setText("질답 · 아직 없음") : (slot.textContent = "질답 · 아직 없음");
          return;
        }
        const total = selection && selection.questions ? selection.questions.length : Object.keys(state.items).length;
        const summary = ws && typeof ws.summarizeChecklistProgress === "function"
          ? ws.summarizeChecklistProgress(state, total)
          : null;
        const label = summary && summary.label
          ? summary.label
          : `질답 ${Object.values(state.items).filter((v) => v === "checked" || v === "not_applicable").length}/${total}`;
        slot.setText ? slot.setText(label) : (slot.textContent = label);
      } catch (_e) {
        slot.empty && slot.empty();
      }
    })();
  };

  /** Lightweight memory preview from index / retrieval (no AI). */
  const renderMemoryPreview = (parentEl) => {
    if (!pathOf()) return;
    const slot = parentEl.createEl("div", {
      attr: {
        class: "reading-memory-preview",
        style: "margin-top:4px;font-size:0.75em;color:var(--text-faint);line-height:1.35;min-height:0;"
      }
    });
    (async () => {
      try {
        if (!window.ReadingMemoryStore || !window.ReadingMemoryCore) return;
        const adapter = window.ReadingMemoryStore.createObsidianAdapter(app);
        const store = window.ReadingMemoryStore.createReadingMemoryStore(adapter);
        const index = await store.readIndex();
        const entries = (index && Array.isArray(index.entries) ? index.entries : []).filter((e) => e && e.source_path);
        if (!entries.length) return;
        const selfPath = pathOf().replace(/\\/g, "/");
        const others = entries.filter((e) => e.source_path !== selfPath);
        if (!others.length) return;

        let line = "";
        if (window.ReadingMemoryRetrieval && typeof window.ReadingMemoryRetrieval.retrieveReadingMemoryCandidates === "function") {
          // Load a few entry bodies for retrieval when cheap
          const loaded = [];
          for (const meta of others.slice(0, 12)) {
            try {
              const full = await store.readEntry(meta.id);
              if (full) loaded.push(full);
            } catch (_e) { /* skip */ }
          }
          const selfMeta = entries.find((e) => e.source_path === selfPath);
          let query = selfMeta ? await store.readEntry(selfMeta.id) : null;
          if (!query) {
            query = {
              source_path: selfPath,
              title: titleOf(),
              author: p.author || "",
              topics: [],
              key_concepts: [],
              knowledge_links: [],
              explicit_links: [],
              core_claims: [],
              thinking_delta: ""
            };
          }
          const hits = window.ReadingMemoryRetrieval.retrieveReadingMemoryCandidates(query, loaded, 1);
          if (hits && hits[0]) {
            line = `기억 · ${hits[0].title}${hits[0].reason ? ` · ${hits[0].reason}` : ""}`;
          }
        }
        if (!line && p.author) {
          const sameAuthor = others.find((e) => {
            // title-only index: weak match by author in title is skipped; use loaded author if possible
            return false;
          });
          if (sameAuthor) line = `기억 · ${sameAuthor.title}`;
        }
        if (!line && others[0]) {
          // Soft presence cue only when index has other reading memories
          line = `관련 기억 ${others.length}권`;
        }
        if (line) {
          slot.setText ? slot.setText(line) : (slot.textContent = line);
        }
      } catch (_e) {
        /* optional strip */
      }
    })();
  };

  const renderChecklistButton = (parentEl) => {
    if ((p.status !== "reading" && p.status !== "reviewing") || !window.ReadingChecklistView || !pathOf()) return;
    makeBtn(parentEl, "독서 질답", {
      onClick: () => window.ReadingChecklistView.openForSource(app, checklistSource())
    });
  };

  const renderMemoryButton = (parentEl) => {
    if (!window.ReadingMemoryView || !pathOf()) return;
    makeBtn(parentEl, "관련 기억", {
      onClick: () => window.ReadingMemoryView.openForSource(app, pathOf())
    });
  };

  const renderDecisionPacket = (parentEl) => {
    if (p.status !== "reading" || !window.ReadingDecisionPacket) return;
    window.ReadingDecisionPacket.renderForReading(parentEl, { app, reading: { ...p, path: pathOf() } });
  };

  /** 오늘 읽기 — minimal modal (one memo). Single session path only. */
  const renderTodayReadButton = (parentEl) => {
    if (p.status !== "reading" || !window.ReadingView || !window.ReadingCore) return;
    makeBtn(parentEl, "오늘 읽기", {
      primary: true,
      onClick: () => {
        const book = asBook();
        const open = window.ReadingView.openSessionModal || window.ReadingView.openQuickSession;
        open(app, book, () => {
          invalidateRuntime();
        }, { progress: p.progress, next_action: p.next_action });
      }
    });
  };

  const renderGeneratedCoverFallback = (parentEl, size) => {
    const bookTitle = titleOf(), author = p.author || "저자 미상";
    const cover = parentEl.createEl('button', {
      attr: {
        class: 'reading-generated-cover',
        type: 'button',
        'aria-label': `${bookTitle} 표지 없음`,
        style: `${size}background:var(--background-secondary);border:1px solid var(--background-modifier-border);border-inline-start:3px solid var(--ke-color-accent, var(--text-accent));border-radius:var(--ke-radius-card,12px);display:flex;flex-direction:column;justify-content:space-between;padding:10px 8px;color:var(--text-normal);font-family:var(--font-interface);cursor:pointer;`
      }
    });
    cover.createEl('div', {
      text: bookTitle,
      attr: { style: 'font-size:0.75em;font-weight:700;line-height:1.2;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden;text-overflow:ellipsis;' }
    });
    cover.createEl('div', {
      text: author,
      attr: { style: 'font-size:var(--ke-type-chrome, 0.68rem);line-height:var(--ke-leading-control, 1.2);color:var(--text-muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;text-align:right;' }
    });
    cover.onclick = () => app.workspace.openLinkText(p.file ? p.file.name : titleOf(), pathOf());
  };

  const renderBookCover = (parentEl, modeOverride) => {
    const rawCover = p.cover_url || p.cover || p.cover_image || p.book_cover || p.image || p.banner || p.thumbnail || p.coverUrl || p.coverImage;
    let coverPath = "";
    if (rawCover) {
      if (typeof rawCover === "object") {
        coverPath = rawCover.path || rawCover.fileName || rawCover.link || String(rawCover);
      } else {
        coverPath = String(rawCover).trim();
      }
    }
    coverPath = coverPath.replace(/^\[\[/, "").replace(/\]\]$/, "").trim();

    const targetMode = modeOverride || mode;
    const size = targetMode === "hero"
      ? "inline-size:min(42vw,168px);block-size:min(60vw,240px);"
      : targetMode === "simple"
        ? "inline-size:64px;block-size:92px;flex:0 0 auto;"
        : "inline-size:90px;block-size:130px;";

    if (coverPath && coverPath !== "[object Object]") {
      let src = coverPath;
      if (!coverPath.startsWith("http://") && !coverPath.startsWith("https://") && !coverPath.startsWith("app://") && !coverPath.startsWith("data:")) {
        const file = app.metadataCache.getFirstLinkpathDest(coverPath, pathOf());
        if (file) {
          src = app.vault.getResourcePath(file);
        } else {
          const fileNameOnly = coverPath.split("/").pop();
          const altFile = app.metadataCache.getFirstLinkpathDest(fileNameOnly, pathOf());
          if (altFile) src = app.vault.getResourcePath(altFile);
        }
      }

      const img = parentEl.createEl('img', {
        attr: {
          src,
          alt: `${titleOf()} 표지`,
          role: 'button',
          tabindex: '0',
          referrerpolicy: 'no-referrer',
          style: `${size}object-fit:cover;border-radius:var(--ke-radius-card,12px);cursor:pointer;`
        }
      });
      const approvedImageShadow = T.SHADOWS && T.SHADOWS.image;
      if (img.style && approvedImageShadow) img.style.boxShadow = approvedImageShadow;

      img.onerror = () => {
        img.remove();
        renderGeneratedCoverFallback(parentEl, size);
      };

      const openCover = () => app.workspace.openLinkText(p.file ? p.file.name : titleOf(), pathOf());
      img.onclick = openCover;
      img.onkeydown = (event) => {
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        openCover();
      };
    } else {
      renderGeneratedCoverFallback(parentEl, size);
    }
  };

  // Helper to render next action button (status transition)
  const renderNextActionButton = (parentEl, currentStatus) => {
    const transitions = {
      queue: { key: 'reading', label: '📖 읽기 시작' },
      reading: { key: 'reviewing', label: '📝 복기 시작' },
      reviewing: { key: 'completed', label: '✅ 복기 완료' },
      completed: { key: 'archived', label: '📦 보관' }
    };
    
    const target = transitions[currentStatus];
    if (!target) return;
    
    const btn = makeBtn(parentEl, target.label, {
      primary: currentStatus === "queue" || currentStatus === "reading",
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
        const tFile = app.vault.getAbstractFileByPath(pathOf());
        if (tFile) {
          await app.fileManager.processFrontMatter(tFile, (fm) => {
            fm.status = target.key;
            if (rating) fm.rating = rating;
            if (keyTakeaway) fm.key_takeaway = keyTakeaway;
            if (target.key === "reading" && !fm.next_action) {
              fm.next_action = "이어 읽기";
            }
            fm.updated = new Date().toISOString().split("T")[0];
          });
          invalidateRuntime();
          new Notice("상태가 업데이트되었습니다.");
        }
      }
    });
  };
  
  const focusBorder = isFocus ? "2px solid var(--ke-color-accent, var(--text-accent))" : "1px solid var(--background-modifier-border)";

  if (mode === "hero") {
    // Cover + meta on top row; actions always full-width below so mobile never covers the image.
    const card = container.createEl('div', {
      attr: {
        class: 'reading-card reading-card-hero reading-card-content-hero' + (isFocus ? ' is-focus' : ''),
        'data-reading-path': pathOf(),
        'data-reading-status': p.status || '',
        tabindex: '-1',
        style: `border:${focusBorder};border-radius:var(--ke-radius-card,18px);padding:clamp(17px,4vw,32px);margin-bottom:17px;background:var(--background-primary);display:flex;flex-direction:column;gap:24px;${isFocus ? "outline:2px solid var(--ke-color-accent, var(--text-accent));outline-offset:3px;" : ""}`
      }
    });

    const main = card.createEl('div', {
      attr: {
        class: 'reading-card-hero-main',
        style: 'display:flex;gap:clamp(17px,4vw,40px);align-items:center;min-width:0;flex-wrap:wrap;'
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

    if (isFocus) {
      contentBox.createEl('div', {
        text: '▶ 이어 읽기 포커스',
        attr: { style: 'font-size:0.72em;font-weight:800;color:var(--ke-color-accent, var(--text-accent));' }
      });
    }

    const title = contentBox.createEl('a', {
      text: titleOf(),
      attr: {
        class: 'internal-link',
        style: 'font-weight: bold; font-size: 1.05em; color: var(--text-normal); text-decoration: none; cursor: pointer; overflow-wrap: anywhere;'
      }
    });
    title.onclick = () => app.workspace.openLinkText(p.file ? p.file.name : titleOf(), pathOf());

    contentBox.createEl('div', {
      text: p.author || "저자 미상",
      attr: { style: 'font-size:0.92em;color:var(--text-muted);' }
    });
    contentBox.createEl('div', {
      text: statusLabel,
      attr: { class: 'reading-card-status', style: 'font-size:0.75em;font-weight:700;color:var(--text-muted);' }
    });

    renderNextActionLine(contentBox);

    const strat = strategyChip();
    if (strat && strat.strategy_label) {
      contentBox.createEl('div', {
        text: `전략 · ${strat.strategy_label}`,
        attr: { style: 'font-size: 0.75em; font-weight: 650; color: var(--text-muted); margin-top: 2px;' }
      });
    }

    // Progress: 25/50/75/100 — secondary to action buttons
    renderProgressPicker(contentBox);
    renderQaProgress(contentBox);
    renderMemoryPreview(contentBox);
    renderPeopleChips(contentBox);

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
    renderDecisionPacket(actionBox);
    renderNextActionButton(actionBox, p.status);
    
  } else if (mode === "simple") {
    // Title/meta first, actions full-width below on narrow screens.
    const card = container.createEl('div', {
      attr: {
        class: 'reading-card reading-card-simple' + (isFocus ? ' is-focus' : ''),
        'data-reading-path': pathOf(),
        style: `border:1px solid var(--background-modifier-border);${isFocus ? 'border-inline-start:4px solid var(--ke-color-accent, var(--text-accent));' : ''}border-radius:var(--ke-radius-panel,12px);padding:14px 18px;margin-bottom:10px;background:var(--background-secondary);display:flex;flex-direction:column;gap:12px;`
      }
    });
    
    const topRow = card.createEl('div', {
      attr: { style: 'display: flex; gap: 14px; align-items: flex-start; min-width: 0;' }
    });

    const coverBox = topRow.createEl('div', {
      attr: { class: 'reading-card-cover', style: 'flex: 0 0 auto;' }
    });
    renderBookCover(coverBox, "simple");

    const left = topRow.createEl('div', { attr: { style: 'display: flex; flex-direction: column; gap: 2px; flex: 1; min-width: 0;' } });
    const title = left.createEl('a', {
      text: titleOf(),
      attr: {
        class: 'internal-link',
        style: 'font-weight: bold; font-size: 0.95em; color: var(--text-normal); text-decoration: none; cursor: pointer; overflow-wrap: anywhere;'
      }
    });
    title.onclick = () => app.workspace.openLinkText(p.file ? p.file.name : titleOf(), pathOf());
    
    const authorRow = left.createEl('div', {
      attr: { style: 'font-size: 0.78em; color: var(--text-muted); display: flex; align-items: center; gap: 6px; flex-wrap: wrap;' }
    });
    authorRow.createEl('span', { text: p.author || "저자 미상" });
    authorRow.createEl('span', { text: statusLabel, attr: { class: 'reading-card-status' } });
    if (p.rating) {
      authorRow.createEl('span', {
        text: `⭐ ${p.rating}.0`,
        attr: { style: 'color:var(--text-normal);font-weight:bold;' }
      });
    }
    const prog = normalizeProgress(p.progress);
    if (prog != null) {
      authorRow.createEl('span', {
        text: `${prog}%`,
        attr: { style: 'font-weight:700;color:var(--text-muted);' }
      });
    }

    renderNextActionLine(left);
    renderQaProgress(left);
    renderMemoryPreview(left);
    renderPeopleChips(left);
    
    const right = card.createEl('div', {
      attr: { class: 'prodigy-card-actions reading-card-actions', style: 'width:100%; justify-content:flex-start;' }
    });
    if (p.status === "reading") {
      renderTodayReadButton(right);
    }
    renderChecklistButton(right);
    renderMemoryButton(right);
    renderDecisionPacket(right);
    renderNextActionButton(right, p.status);
    
  } else if (mode === "grid") {
    // 📚 Reading Queue Grid Layout
    const gridItem = container.createEl('div', {
      attr: {
        class: 'reading-card reading-card-grid',
        'data-reading-path': pathOf(),
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
    title.onclick = () => app.workspace.openLinkText(p.file ? p.file.name : titleOf(), pathOf());
    
    const actionBox = gridItem.createEl('div', {
      attr: { class: 'prodigy-card-actions', style: 'flex-direction:column;margin-top:2px;width:100%;' }
    });
    // Queue → reading is the primary one-tap path
    renderNextActionButton(actionBox, p.status);
    renderChecklistButton(actionBox);
    renderMemoryButton(actionBox);
  }
};
