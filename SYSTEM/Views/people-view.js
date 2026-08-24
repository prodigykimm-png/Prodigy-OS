(function (root) {
  const T = root.ProdigyTokens || {}; const C = T.COLORS || {};
  "use strict";

  /**
   * People UX — create + quick property edit modal.
   * Human-context memory: only whitelist fields; body narrative stays in the Object note.
   */

  function notice(message, timeout) {
    if (typeof Notice !== "undefined") new Notice(message, timeout || 5000);
  }

  function peopleWorkspaceDependency(globalName, relativePath) {
    if (root[globalName]) return root[globalName];
    if (typeof require === "function") {
      try { return require(relativePath); } catch (_error) { /* required runtime check below */ }
    }
    throw new Error(`${globalName}를 불러오지 못했습니다.`);
  }

  /** Short-lived undo action for memo/event delete (DOM toast on workspace). */
  let _undoTimer = null;
  let _undoPayload = null;

  function clearUndoToast() {
    if (_undoTimer) {
      try { clearTimeout(_undoTimer); } catch (_e) { /* ignore */ }
      _undoTimer = null;
    }
    _undoPayload = null;
    if (typeof document !== "undefined") {
      const el = document.getElementById("ppw-undo-toast");
      if (el && el.parentNode) el.parentNode.removeChild(el);
    }
  }

  function showUndoToast(message, onUndo) {
    clearUndoToast();
    if (typeof document === "undefined") {
      notice(message);
      return;
    }
    ensureWorkspaceStyles();
    const toast = document.createElement("div");
    toast.id = "ppw-undo-toast";
    toast.className = "ppw-undo-toast";
    const text = document.createElement("span");
    text.textContent = message;
    const btnEl = document.createElement("button");
    btnEl.type = "button";
    btnEl.className = "ppw-undo-btn";
    btnEl.textContent = "실행 취소";
    btnEl.onclick = async () => {
      clearUndoToast();
      if (typeof onUndo === "function") {
        try { await onUndo(); } catch (err) {
          notice(err.message || String(err), 9000);
        }
      }
    };
    toast.appendChild(text);
    toast.appendChild(btnEl);
    document.body.appendChild(toast);
    _undoPayload = { onUndo };
    _undoTimer = setTimeout(() => clearUndoToast(), 10000);
  }

  function openPath(app, path) {
    if (!app || !path) return;
    return app.workspace.openLinkText(String(path).replace(/\.md$/, ""), "", false);
  }
  async function openKnowledgeReview(app, target) {
    const route = root.KnowledgeWorkspaceRoute;
    const item = target && typeof target === "object" ? target : null;
    const hub = root.KnowledgeExplorerHub || (root.KnowledgeExplorerHub = {});
    if (item && item.candidate_id) hub._pendingCandidateId = String(item.candidate_id);
    if (item && item.candidate_path) hub._pendingCandidatePath = String(item.candidate_path);
    if (route && typeof route.openReview === "function") {
      const result = await route.openReview(app);
      if (item && item.candidate_id && typeof setTimeout === "function") {
        setTimeout(() => focusKnowledgeCandidate(item.candidate_id), 200);
      }
      return result;
    }
    if (app && app.workspace && typeof app.workspace.openLinkText === "function") {
      try {
        await app.workspace.openLinkText("HUB/50 Knowledge", "", false);
        return true;
      } catch (_error) { /* recovery notice below */ }
    }
    if (item && item.candidate_path) return openBeside(app, item.candidate_path);
    notice("Knowledge 워크스페이스를 열 수 없습니다. HUB/50 Knowledge.md에서 검토해 주세요.");
    return false;
  }

  function contextRenderer() {
    return peopleWorkspaceDependency("PeopleContextRender", "./people-context-render.js");
  }
  function contextPath(value) { return contextRenderer().path(value); }
  function typedKnowledgeRow(item, source) { return contextRenderer().row(item, source); }
  function contextRowLabel(item) { return contextRenderer().label(item); }
  function applyContextMetadata(element, item) { return contextRenderer().applyMetadata(element, item); }

  function preferredScrollBehavior() {
    return typeof root.matchMedia === "function" && root.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth";
  }

  function focusKnowledgeCandidate(candidateId) {
    if (typeof document === "undefined" || !document.querySelector || !candidateId) return;
    const escaped = String(candidateId).replace(/["\\\\]/g, "\\\\$&");
    const card = document.querySelector(`[data-candidate-id="${escaped}"]`);
    if (!card) return;
    if (typeof card.scrollIntoView === "function") card.scrollIntoView({ behavior: preferredScrollBehavior(), block: "nearest" });
    const target = typeof card.querySelector === "function"
      ? card.querySelector("button, input, textarea, select")
      : null;
    if (target && typeof target.focus === "function") target.focus();
  }

  async function openKnowledgeContext(app, item) {
    const row = typedKnowledgeRow(item);
    if (!row) return null;
    if (row.context_kind === "candidate") return openKnowledgeReview(app, row);
    return openPath(app, row.review_target || row.path);
  }

  const PEOPLE_SIDE_LEAF_KEY = "__prodigyPeopleSideLeaf";

  function isLeafStillOpen(app, leaf) {
    if (!app || !leaf || !app.workspace) return false;
    try {
      const leaves = typeof app.workspace.getLeavesOfType === "function"
        ? app.workspace.getLeavesOfType("markdown")
        : [];
      if (leaves && leaves.includes && leaves.includes(leaf)) return true;
      // Fallback: walk root children if available
      if (typeof app.workspace.iterateAllLeaves === "function") {
        let found = false;
        app.workspace.iterateAllLeaves((l) => {
          if (l === leaf) found = true;
        });
        return found;
      }
    } catch (_e) {
      return false;
    }
    return false;
  }

  /**
   * Open a People note in one reusable side leaf.
   * Clicking another person reuses the same side pane (replaces the previous note)
   * instead of stacking more splits.
   */
  async function openBeside(app, path) {
    if (!app || !path) return null;
    const filePath = String(path);
    const link = filePath.replace(/\.md$/i, "");
    const file = app.vault && typeof app.vault.getAbstractFileByPath === "function"
      ? app.vault.getAbstractFileByPath(filePath)
      : null;

    const existing = root[PEOPLE_SIDE_LEAF_KEY] || (typeof window !== "undefined" ? window[PEOPLE_SIDE_LEAF_KEY] : null);
    const stillOpen = isLeafStillOpen(app, existing);

    try {
      if (stillOpen && existing) {
        if (typeof app.workspace.setActiveLeaf === "function") {
          try {
            app.workspace.setActiveLeaf(existing, { focus: true });
          } catch (_e) {
            try { app.workspace.setActiveLeaf(existing); } catch (_e2) { /* ignore */ }
          }
        }
        if (file && typeof existing.openFile === "function") {
          await existing.openFile(file);
          return existing;
        }
        // open in active (side) leaf without creating a new split
        if (typeof app.workspace.openLinkText === "function") {
          await app.workspace.openLinkText(link, filePath, false);
          return existing;
        }
      }

      // Create one side split and remember it
      let leaf = null;
      if (typeof app.workspace.getLeaf === "function") {
        try {
          leaf = app.workspace.getLeaf("split");
        } catch (_e) {
          try { leaf = app.workspace.getLeaf(true); } catch (_e2) { leaf = null; }
        }
      }
      if (leaf && file && typeof leaf.openFile === "function") {
        await leaf.openFile(file);
        root[PEOPLE_SIDE_LEAF_KEY] = leaf;
        if (typeof window !== "undefined") window[PEOPLE_SIDE_LEAF_KEY] = leaf;
        return leaf;
      }
      if (typeof app.workspace.openLinkText === "function") {
        await app.workspace.openLinkText(link, filePath, "split");
        const recent = typeof app.workspace.getMostRecentLeaf === "function"
          ? app.workspace.getMostRecentLeaf()
          : null;
        if (recent) {
          root[PEOPLE_SIDE_LEAF_KEY] = recent;
          if (typeof window !== "undefined") window[PEOPLE_SIDE_LEAF_KEY] = recent;
        }
        return recent;
      }
    } catch (_err) {
      /* fall through */
    }

    return openPath(app, path);
  }

  function fieldLabel(key) {
    // People-specific: relationship is a short category, not free narrative
    if (key === "relationship") return "구분";
    if (root.prodigyDisplay && typeof root.prodigyDisplay.property === "function") {
      return root.prodigyDisplay.property(key);
    }
    const fallback = {
      relationship: "구분",
      company: "소속",
      role: "역할",
      last_contact: "최근 연락",
      phone: "전화",
      email: "이메일"
    };
    return fallback[key] || key;
  }

  /**
   * Relationship property = short category chips (지인/회사/…).
   * Detail narrative stays in body `# 관계`.
   */
  function renderRelationshipPicker(parent, currentValue, onChange) {
    const core = root.PeopleCore;
    const types = (core && core.RELATIONSHIP_TYPES) || [
      "가족", "친구", "지인", "회사", "학교", "업무", "커뮤니티", "기타"
    ];
    const current = String(currentValue == null ? "" : currentValue).trim();
    const known = core && typeof core.isKnownRelationshipType === "function"
      ? core.isKnownRelationshipType(current)
      : types.indexOf(current) !== -1;

    const wrap = parent.createDiv({ attr: { class: "ppw-rel-picker" } });
    wrap.createEl("div", {
      text: "짧은 분류만 선택 · 상세 맥락은 아래 「관계」 본문에",
      attr: { class: "ppw-rel-hint" }
    });

    const chips = wrap.createDiv({ attr: { class: "ppw-rel-chips" } });
    let selected = known ? current : "";

    function paint() {
      chips.empty();
      // clear option
      const clearBtn = chips.createEl("button", {
        text: "없음",
        attr: {
          type: "button",
          class: "ppw-rel-chip prodigy-configurator-chip" + (selected ? "" : " is-active"),
          "aria-pressed": selected ? "false" : "true"
        }
      });
      clearBtn.onclick = () => {
        selected = "";
        paint();
        if (typeof onChange === "function") onChange("");
      };

      types.forEach((label) => {
        const btnEl = chips.createEl("button", {
          text: label,
          attr: {
            type: "button",
            class: "ppw-rel-chip prodigy-configurator-chip" + (selected === label ? " is-active" : ""),
            "aria-pressed": selected === label ? "true" : "false"
          }
        });
        btnEl.onclick = () => {
          selected = label;
          paint();
          if (typeof onChange === "function") onChange(label);
        };
      });
    }
    paint();

    // Legacy free-text (e.g. "13학번 동기") — show once so user can reclassify
    if (current && !known) {
      const legacy = wrap.createDiv({ attr: { class: "ppw-rel-legacy" } });
      legacy.createEl("span", {
        text: `이전 값: ${current}`,
        attr: { class: "ppw-rel-legacy-text" }
      });
      legacy.createEl("span", {
        text: " → 위 구분 중 하나를 고르고, 이 문장은 본문 「관계」로 옮기세요.",
        attr: { class: "ppw-rel-legacy-hint" }
      });
    }

    return wrap;
  }

  /**
   * Confirm then delete a People Object from the dashboard.
   * @returns {Promise<{ path: string }|null>}
   */
  async function openDeletePersonFlow(app, path, onDeleted) {
    const host = app || root.app || (typeof window !== "undefined" ? window.app : null);
    if (!host) {
      notice("Obsidian 앱 컨텍스트가 필요합니다.");
      return null;
    }
    if (!root.PeopleStore || !root.PeopleCore) {
      notice("People 모듈을 불러오지 못했습니다.");
      return null;
    }

    const filePath = String(path || "");
    const name = filePath.split("/").pop().replace(/\.md$/i, "") || "이 사람";

    if (!root.PeopleCore.isUnderPeopleFolder(filePath)) {
      notice("Contacts 폴더의 사람 노트만 삭제할 수 있습니다.");
      return null;
    }

    const Modal = root.obsidian && root.obsidian.Modal;
    if (!Modal) {
      const ok = typeof window !== "undefined" && window.confirm
        ? window.confirm(`「${name}」 사람 Object를 삭제할까요?\n휴지통으로 이동합니다.`)
        : false;
      if (!ok) return null;
      try {
        const result = await root.PeopleStore.deletePeople(host, filePath);
        notice(`삭제했습니다: ${name}`);
        if (typeof onDeleted === "function") await onDeleted(result);
        return result;
      } catch (error) {
        notice(error.message || String(error), 9000);
        return null;
      }
    }

    return new Promise((resolve) => {
      class PeopleDeleteModal extends Modal {
        constructor(appInstance) {
          super(appInstance);
          this.busy = false;
        }
        onOpen() {
          const { contentEl } = this;
          contentEl.empty();
          contentEl.addClass("ppw-modal-surface");
          contentEl.createEl("h2", {
            text: "사람 삭제",
            attr: { style: "margin:0 0 var(--ke-space-2);font-size:var(--ke-type-title);" }
          });
          contentEl.createEl("p", {
            text: `「${name}」 사람 Object를 삭제할까요?`,
            attr: { style: "font-size:var(--ke-type-label);margin:0 0 var(--ke-space-2);font-weight:700;" }
          });
          contentEl.createEl("p", {
            text: "노트 파일은 휴지통으로 이동합니다. Project·Journal 등 다른 Object에 남은 링크는 그대로 두며, 이 작업이 원본 사건 기록을 지우지는 않습니다.",
            attr: { style: "font-size:var(--ke-type-label);color:var(--ke-color-muted);margin:0 0 var(--ke-space-4);line-height:var(--ke-leading-body);" }
          });

          const footer = contentEl.createEl("div", {
            attr: { style: "display:flex;justify-content:flex-end;gap:var(--ke-space-2);flex-wrap:wrap;" }
          });
          const cancel = footer.createEl("button", { text: "취소", attr: { type: "button" } });
          cancel.onclick = () => {
            this.close();
            resolve(null);
          };
          this.deleteBtn = footer.createEl("button", {
            text: "삭제",
            attr: {
              type: "button",
              class: "mod-warning",
              style: "background:var(--ke-color-error);color:var(--ke-color-on-interactive);border-color:var(--ke-color-error);"
            }
          });
          this.deleteBtn.onclick = () => this.submit();
          this.statusEl = contentEl.createEl("div", {
            text: "",
            attr: { style: "margin-top:var(--ke-space-3);font-size:var(--ke-type-label);color:var(--ke-color-muted);" }
          });
        }
        async submit() {
          if (this.busy) return;
          this.busy = true;
          this.deleteBtn.disabled = true;
          this.statusEl.setText("삭제 중...");
          try {
            const result = await root.PeopleStore.deletePeople(this.app, filePath);
            notice(`삭제했습니다: ${name}`);
            if (typeof onDeleted === "function") {
              try { await onDeleted(result); } catch (_e) { /* ignore */ }
            }
            this.close();
            resolve(result);
          } catch (error) {
            this.statusEl.setText(error.message || String(error));
            this.statusEl.style.color = "var(--ke-color-error)";
            this.busy = false;
            this.deleteBtn.disabled = false;
          }
        }
        onClose() {
          this.contentEl.empty();
        }
      }
      new PeopleDeleteModal(host).open();
    });
  }

  /**
   * Open People Object as an editable relation popup.
   * Name click (and create flow) open this form. Raw note via 「원본 노트」 inside the popup.
   * Edits: whitelist properties + body sections → PeopleStore.savePeopleNote.
   */
  async function openPersonPreview(app, path, onChanged) {
    const host = app || root.app || (typeof window !== "undefined" ? window.app : null);
    if (!host) {
      notice("Obsidian 앱 컨텍스트가 필요합니다.");
      return null;
    }
    if (!root.PeopleStore || !root.PeopleCore) {
      notice("People 모듈을 불러오지 못했습니다.");
      return null;
    }

    let preview;
    try {
      preview = await root.PeopleStore.readPeopleNote(host, path);
    } catch (error) {
      notice(error.message || String(error), 9000);
      return null;
    }

    const Modal = root.obsidian && root.obsidian.Modal;
    if (!Modal) {
      // No modal — fall back to side open
      return openBeside(host, path);
    }

    if (root.ProdigyUI) root.ProdigyUI.ensureStyles();
    ensureWorkspaceStyles();

    const propFields = (root.PeopleCore.QUICK_EDIT_FIELDS || [
      "relationship", "company", "role", "last_contact", "phone", "email"
    ]).slice();
    // Primary narrative first; secondary reflection below
    const primarySections = ["관계", "핵심 상호작용", "메모"];
    const secondarySections = ["배운 점", "소통 방식", "나의 성찰"];
    const sectionTitles = (root.PeopleCore.EDITABLE_SECTIONS || primarySections.concat(secondarySections)).slice();
    const sectionPlaceholders = {
      "관계": "누구인지, 어떻게 만났는지, 현재 맥락 (구분이 아닌 상세)",
      "핵심 상호작용": "- [[YYYY-MM-DD]] 한 줄 요약",
      "메모": "- 오래 남을 사실·선호",
      "배운 점": "이 관계에서 배운 점",
      "소통 방식": "연락 채널·톤·주의점",
      "나의 성찰": "나에게 남긴 생각"
    };
    const sectionRows = {
      "관계": 5,
      "핵심 상호작용": 6,
      "메모": 5,
      "배운 점": 3,
      "소통 방식": 3,
      "나의 성찰": 3
    };

    function buildMetaLine(values) {
      const v = values || {};
      return [v.relationship, v.company, v.role].map((x) => String(x || "").trim()).filter(Boolean).join(" · ");
    }

    return new Promise((resolve) => {
      class PeoplePreviewModal extends Modal {
        constructor(appInstance, model) {
          super(appInstance);
          this.model = model;
          this.busy = false;
          this.propValues = Object.assign({}, (model && model.properties) || {});
          this.sectionValues = Object.create(null);
          this._hydrateSections(model);
        }
        _hydrateSections(model) {
          const byTitle = Object.create(null);
          ((model && model.sections) || []).forEach((s) => {
            if (s && s.title) byTitle[s.title] = s;
          });
          sectionTitles.forEach((title) => {
            const found = byTitle[title];
            // Prefer cleaned display text so template guidance is not re-saved
            const raw = found
              ? String(found.displayBody != null ? found.displayBody : found.body || "")
              : "";
            this.sectionValues[title] = raw;
          });
        }
        _linesFromSectionText(text) {
          return String(text || "")
            .replace(/\r\n/g, "\n")
            .split("\n")
            .map((l) => String(l || "").trim().replace(/^[-*•]\s+/, ""))
            .filter((l) => l && l !== "-" && !/^\*[^*].*\*$/.test(l));
        }
        _sectionTextFromLines(lines) {
          return (lines || []).map((l) => {
            const t = String(l || "").trim();
            if (!t) return "";
            return t.startsWith("-") ? t : `- ${t}`;
          }).filter(Boolean).join("\n");
        }
        _renderListSection(parent, title) {
          const block = parent.createDiv({ attr: { class: "ppw-edit-panel ppw-edit-list-panel prodigy-utility-card" } });
          block.createEl("div", { text: title, attr: { class: "ppw-edit-section-label" } });
          block.createEl("div", {
            text: title === "메모"
              ? "한 줄씩 추가·삭제 · 저장 시 노트에 반영"
              : "사건 인덱스 한 줄씩 · 저장 또는 「사건 추가」",
            attr: { class: "ppw-rel-hint" }
          });
          let lines = this._linesFromSectionText(this.sectionValues[title]);
          const listEl = block.createDiv({ attr: { class: "ppw-edit-line-list" } });

          const sync = () => {
            this.sectionValues[title] = this._sectionTextFromLines(lines);
          };

          const paintList = () => {
            listEl.empty();
            if (!lines.length) {
              listEl.createEl("div", {
                text: "아직 없습니다.",
                attr: { class: "ppw-edit-line-empty" }
              });
            } else {
              lines.forEach((line, idx) => {
                const row = listEl.createDiv({ attr: { class: "ppw-edit-line-row" } });
                row.createEl("div", { text: line, attr: { class: "ppw-edit-line-text" } });
                const del = row.createEl("button", {
                  text: "×",
                  attr: { type: "button", class: "ppw-memo-del", title: "삭제", "aria-label": `${title} 삭제` }
                });
                del.onclick = () => {
                  lines = lines.filter((_, i) => i !== idx);
                  sync();
                  paintList();
                };
              });
            }
          };
          paintList();

          const addRow = block.createDiv({ attr: { class: "ppw-edit-line-add" } });
          const input = addRow.createEl("input", {
            attr: {
              type: "text",
              class: "ppw-edit-input",
              placeholder: title === "메모" ? "새 메모 한 줄" : "[[YYYY-MM-DD]] 한 줄 요약"
            }
          });
          const addBtn = btn(addRow, "추가");
          const doAdd = () => {
            const v = String(input.value || "").trim();
            if (!v) return;
            lines.push(v.replace(/^[-*•]\s+/, ""));
            input.value = "";
            sync();
            paintList();
            input.focus();
          };
          addBtn.onclick = doAdd;
          input.onkeydown = (e) => {
            if (e && e.key === "Enter") {
              e.preventDefault();
              doAdd();
            }
          };
          return block;
        }
        _renderSectionBlock(parent, title) {
          if (title === "메모" || title === "핵심 상호작용") {
            return this._renderListSection(parent, title);
          }
          const block = parent.createDiv({ attr: { class: "ppw-edit-panel prodigy-utility-card" } });
          const lab = block.createEl("label", {
            text: title,
            attr: { class: "ppw-edit-section-label" }
          });
          lab.setAttribute("for", `ppw-sec-${title}`);
          const ta = block.createEl("textarea", {
            attr: {
              id: `ppw-sec-${title}`,
              class: "ppw-edit-textarea",
              rows: String(sectionRows[title] || 3),
              placeholder: sectionPlaceholders[title] || `${title} 내용`
            }
          });
          if (title === "관계") ta.addClass("ppw-edit-textarea-lead");
          ta.value = this.sectionValues[title] || "";
          ta.oninput = () => { this.sectionValues[title] = ta.value; };
          return ta;
        }
        onOpen() {
          const { contentEl, modalEl } = this;
          contentEl.empty();
          if (modalEl) {
            modalEl.addClass("ppw-modal");
            // Desktop-friendly size; mobile overrides via CSS
            modalEl.style.width = "";
            modalEl.style.maxWidth = "";
            modalEl.style.maxHeight = "";
          }
          contentEl.addClass("ppw-preview-modal");

          // Keyboard: Cmd/Ctrl+S save, Esc close
          if (this._keyHandler && modalEl) {
            modalEl.removeEventListener("keydown", this._keyHandler);
          }
          this._keyHandler = (e) => {
            if (!e) return;
            const mod = e.metaKey || e.ctrlKey;
            if (mod && (e.key === "s" || e.key === "S")) {
              e.preventDefault();
              e.stopPropagation();
              this.submit();
            } else if (e.key === "Escape") {
              // allow default modal close; ensure resolve
            }
          };
          if (modalEl) modalEl.addEventListener("keydown", this._keyHandler);

          const shell = contentEl.createDiv({ attr: { class: "ppw-preview-shell" } });

          // --- Header ---
          const head = shell.createDiv({ attr: { class: "ppw-preview-head" } });
          head.createEl("div", { text: "관계 맥락", attr: { class: "ppw-preview-kicker" } });

          const titleRow = head.createDiv({ attr: { class: "ppw-preview-title-row" } });
          const titleMain = titleRow.createDiv({ attr: { class: "ppw-preview-title-main" } });
          titleMain.createEl("h2", {
            text: this.model.name,
            attr: { class: "ppw-preview-title" }
          });
          if (this.model.is_legacy) {
            titleMain.createEl("span", { text: "레거시", attr: { class: "ppw-badge" } });
          }
          const previewTrash = titleRow.createEl("button", {
            text: "삭제",
            attr: {
              type: "button",
              class: "ppw-trash ppw-preview-trash",
              title: "이 사람 노트를 삭제(휴지통 이동)합니다.",
              "aria-label": `${this.model.name} 삭제`
            }
          });
          previewTrash.onclick = (e) => {
            if (e) {
              e.stopPropagation();
              e.preventDefault();
            }
            openDeletePersonFlow(this.app, this.model.path, async () => {
              if (typeof onChanged === "function") await onChanged();
              this.close();
              resolve({ deleted: true, path: this.model.path });
            });
          };

          this.metaEl = head.createEl("div", {
            text: buildMetaLine(this.propValues) || "구분·소속·역할을 채우면 여기에 표시됩니다.",
            attr: {
              class: "ppw-preview-meta" + (buildMetaLine(this.propValues) ? "" : " is-empty")
            }
          });
          const lastContact = String(this.propValues.last_contact || this.model.last_contact || "").trim();
          this.subEl = head.createEl("div", {
            text: lastContact ? `최근 연락 ${lastContact}` : "",
            attr: {
              class: "ppw-preview-sub",
              style: lastContact ? "" : "display:none;"
            }
          });

          // --- Scroll body ---
          const scroll = shell.createDiv({ attr: { class: "ppw-preview-scroll" } });

          // Properties panel
          const propsBlock = scroll.createDiv({ attr: { class: "ppw-edit-panel ppw-edit-props prodigy-utility-card" } });
          propsBlock.createEl("div", { text: "속성", attr: { class: "ppw-edit-panel-title" } });

          const syncMeta = () => {
            if (!this.metaEl) return;
            const line = buildMetaLine(this.propValues);
            this.metaEl.setText(line || "구분·소속·역할을 채우면 여기에 표시됩니다.");
            if (line) this.metaEl.removeClass("is-empty");
            else this.metaEl.addClass("is-empty");
          };

          // relationship = category chips (full width)
          const relField = propsBlock.createDiv({ attr: { class: "ppw-edit-field ppw-edit-field-full" } });
          relField.createEl("label", {
            text: fieldLabel("relationship"),
            attr: { class: "ppw-edit-label" }
          });
          const legacyRel = String(this.propValues.relationship || "").trim();
          const isKnown = root.PeopleCore && typeof root.PeopleCore.isKnownRelationshipType === "function"
            ? root.PeopleCore.isKnownRelationshipType(legacyRel)
            : false;
          if (legacyRel && !isKnown) {
            const helper = relField.createDiv({ attr: { class: "ppw-rel-legacy ppw-rel-helper" } });
            helper.createEl("div", {
              text: `이전 상세 값: ${legacyRel}`,
              attr: { class: "ppw-rel-legacy-text" }
            });
            helper.createEl("div", {
              text: "구분 칩으로 짧게 고르고, 상세는 본문 「관계」에 두세요.",
              attr: { class: "ppw-rel-legacy-hint" }
            });
            const moveBtn = btn(helper, "본문 관계로 옮기기");
            moveBtn.onclick = () => {
              const cur = String(this.sectionValues["관계"] || "").trim();
              const chunk = legacyRel.startsWith("-") ? legacyRel : `- ${legacyRel}`;
              this.sectionValues["관계"] = cur ? `${cur}\n${chunk}` : chunk;
              this.propValues.relationship = "";
              this.onOpen();
            };
          }
          renderRelationshipPicker(relField, this.propValues.relationship || "", (value) => {
            this.propValues.relationship = value;
            syncMeta();
          });

          const propsGrid = propsBlock.createDiv({ attr: { class: "ppw-edit-grid" } });
          propFields.forEach((key) => {
            if (key === "relationship") return; // chips above
            const wrap = propsGrid.createDiv({ attr: { class: "ppw-edit-field" } });
            wrap.createEl("label", {
              text: fieldLabel(key),
              attr: { class: "ppw-edit-label" }
            });
            const input = wrap.createEl("input", {
              attr: {
                type: key === "email" ? "email" : "text",
                class: "ppw-edit-input",
                placeholder: key === "last_contact" ? "YYYY-MM-DD" : fieldLabel(key),
                autocomplete: "off",
                spellcheck: key === "email" || key === "phone" ? "false" : "true"
              }
            });
            input.value = this.propValues[key] || "";
            input.oninput = () => {
              this.propValues[key] = input.value;
              if (key === "company" || key === "role") syncMeta();
              if (this.subEl && key === "last_contact") {
                const lc = String(input.value || "").trim();
                if (lc) {
                  this.subEl.setText(`최근 연락 ${lc}`);
                  this.subEl.style.display = "";
                } else {
                  this.subEl.setText("");
                  this.subEl.style.display = "none";
                }
              }
            };
          });

          // Primary sections
          const primaryWrap = scroll.createDiv({ attr: { class: "ppw-edit-group" } });
          primaryWrap.createEl("div", { text: "본문", attr: { class: "ppw-edit-group-title" } });
          primarySections.forEach((title) => {
            if (sectionTitles.indexOf(title) === -1) return;
            this._renderSectionBlock(primaryWrap, title);
          });

          // Secondary sections (collapsed visual weight)
          const secondaryWrap = scroll.createDiv({ attr: { class: "ppw-edit-group ppw-edit-group-secondary" } });
          secondaryWrap.createEl("div", { text: "성찰 · 소통", attr: { class: "ppw-edit-group-title" } });
          secondarySections.forEach((title) => {
            if (sectionTitles.indexOf(title) === -1) return;
            this._renderSectionBlock(secondaryWrap, title);
          });

          // --- Footer ---
          const footer = shell.createDiv({ attr: { class: "ppw-preview-footer" } });
          const left = footer.createDiv({ attr: { class: "ppw-preview-footer-left prodigy-btn-row" } });
          const mid = footer.createDiv({ attr: { class: "ppw-preview-footer-mid" } });
          const right = footer.createDiv({ attr: { class: "ppw-preview-footer-right prodigy-btn-row" } });

          this.statusEl = mid.createEl("div", {
            text: "",
            attr: { class: "ppw-edit-status" }
          });

          const refreshSelf = async () => {
            if (typeof onChanged === "function") await onChanged();
            try {
              this.model = await root.PeopleStore.readPeopleNote(this.app, this.model.path);
              this.propValues = Object.assign({}, this.model.properties || {});
              this._hydrateSections(this.model);
              this.busy = false;
              this.onOpen();
            } catch (_e) { /* ignore */ }
          };

          const eventBtn = btn(left, "사건 추가");
          eventBtn.onclick = () => openAddInteractionFlow(this.app, this.model.path, refreshSelf);

          const memoBtn = btn(left, "메모 추가");
          memoBtn.onclick = () => openAddMemoFlow(this.app, this.model.path, refreshSelf);

          const sideBtn = btn(left, "원본 노트");
          sideBtn.onclick = () => openBeside(this.app, this.model.path);

          const closeBtn = btn(right, "닫기");
          closeBtn.onclick = () => {
            this.close();
            resolve(this.model);
          };

          this.saveBtn = btn(right, "저장", { primary: true });
          this.saveBtn.onclick = () => this.submit();
          this.statusEl.setText("⌘/Ctrl+S 저장");
        }
        async submit() {
          if (this.busy) return;
          this.busy = true;
          // Snapshot so failed save keeps in-memory edits
          const snapshotProps = Object.assign({}, this.propValues);
          const snapshotSections = Object.assign({}, this.sectionValues);
          if (this.saveBtn) this.saveBtn.disabled = true;
          if (this.statusEl) {
            this.statusEl.setText("저장 중…");
            this.statusEl.style.color = "var(--ke-color-muted)";
          }
          try {
            const edits = {
              properties: snapshotProps,
              sections: snapshotSections
            };
            const result = await root.PeopleStore.savePeopleNote(
              this.app,
              this.model.path,
              edits
            );
            this.model = result;
            this.propValues = Object.assign({}, result.properties || {});
            this._hydrateSections(result);
            notice(`저장했습니다: ${result.name}`);
            if (typeof onChanged === "function") {
              try { await onChanged(result); } catch (_e) { /* ignore */ }
            }
            this.busy = false;
            this.onOpen();
            if (this.statusEl) {
              this.statusEl.setText("저장됨 · ⌘/Ctrl+S");
              this.statusEl.style.color = "var(--ke-color-muted)";
            }
          } catch (error) {
            // Restore draft values (do not wipe form)
            this.propValues = snapshotProps;
            this.sectionValues = snapshotSections;
            this.busy = false;
            if (this.saveBtn) this.saveBtn.disabled = false;
            if (this.statusEl) {
              this.statusEl.setText(`저장 실패: ${error.message || String(error)} · 입력은 유지됨`);
              this.statusEl.style.color = "var(--ke-color-error)";
            }
            notice(error.message || String(error), 9000);
          }
        }
        onClose() {
          if (this.modalEl && this._keyHandler) {
            try { this.modalEl.removeEventListener("keydown", this._keyHandler); } catch (_e) { /* ignore */ }
          }
          this._keyHandler = null;
          if (this.modalEl) {
            if (typeof this.modalEl.removeClass === "function") this.modalEl.removeClass("ppw-modal");
            else if (this.modalEl.classList) this.modalEl.classList.remove("ppw-modal");
          }
          this.contentEl.empty();
        }
      }
      new PeoplePreviewModal(host, preview).open();
    });
  }

  /**
   * Create a People Object, then open the relation popup for immediate edit.
   */
  async function createAndOpen(app, rawName, options) {
    if (!root.PeopleStore || !root.PeopleCore) {
      throw new Error("People 모듈을 불러오지 못했습니다.");
    }
    const captureRuntime = root.CaptureActionRuntime
      || (typeof require === "function" ? require("./capture-action-runtime.js") : null);
    if (!captureRuntime) throw new Error("Capture 승인 모듈을 불러오지 못했습니다.");
    const result = await root.PeopleStore.createPeopleWithCapture(
      app,
      rawName,
      options && options.human
        ? options.human
        : captureRuntime.humanConfirmation("people-create", new Date().toISOString()),
      options && options.captureReview
    );
    if (result.review_required) return result;
    notice(`사람 Object를 만들었습니다: ${result.name}`);
    try {
      await openPersonPreview(app, result.path);
    } catch (_e) {
      await openPath(app, result.path);
    }
    return result;
  }

  function promptName() {
    const value = typeof window !== "undefined" && window.prompt
      ? window.prompt("사람 이름", "")
      : "";
    return String(value == null ? "" : value).trim();
  }

  /**
   * Fast path: prompt → create → open.
   */
  async function openCreateFlow(app) {
    const host = app || root.app || (typeof window !== "undefined" ? window.app : null);
    if (!host) {
      notice("Obsidian 앱 컨텍스트가 필요합니다.");
      return null;
    }
    if (!root.PeopleStore || !root.PeopleCore) {
      notice("People 모듈을 불러오지 못했습니다. Personal Hub 스크립트 로드를 확인하세요.");
      return null;
    }

    const Modal = root.obsidian && root.obsidian.Modal;
    if (!Modal) {
      const name = promptName();
      if (!name) return null;
      const browserWindow = typeof window !== "undefined" ? window : root;
      if (typeof browserWindow.confirm !== "function" || !browserWindow.confirm(`「${name}」 사람 Object를 만들까요?`)) return null;
      try {
        return await createAndOpen(host, name);
      } catch (error) {
        notice(error.message || String(error), 9000);
        return null;
      }
    }

    return new Promise((resolve) => {
      class PeopleCreateModal extends Modal {
        constructor(appInstance) {
          super(appInstance);
          this.name = "";
          this.busy = false;
          this.scope = null;
        }
        onOpen() {
          const { contentEl } = this;
          contentEl.empty();
          contentEl.addClass("ppw-modal-surface");
          this.scope = root.ProdigyMountLifecycle && typeof root.ProdigyMountLifecycle.createMountScope === "function"
            ? root.ProdigyMountLifecycle.createMountScope(contentEl)
            : { track(fn) { (this._cleanups = this._cleanups || []).push(fn); }, dispose() { (this._cleanups || []).splice(0).reverse().forEach(fn => { try { fn(); } catch (_) {} }); } };
          if (root.CaptureActionRuntime && typeof root.CaptureActionRuntime.mountTrustedInteractions === "function") {
            root.CaptureActionRuntime.mountTrustedInteractions({
              root: contentEl,
              document: contentEl.ownerDocument || root.document || (typeof document !== "undefined" ? document : null),
              scope: this.scope,
              session_id: "people-create"
            });
          }
          contentEl.createEl("h2", { text: "사람 추가", attr: { style: "margin:0 0 var(--ke-space-2);font-size:var(--ke-type-title);" } });
          contentEl.createEl("p", {
            text: "이름만 입력하면 추가 후 관계 팝업이 열립니다.",
            attr: { style: "font-size:var(--ke-type-label);color:var(--ke-color-muted);margin:0 0 var(--ke-space-3);line-height:var(--ke-leading-body);" }
          });
          contentEl.createEl("label", {
            text: "이름",
            attr: { style: "display:block;font-size:var(--ke-type-label);font-weight:700;margin-bottom:var(--ke-space-1);" }
          });
          const input = contentEl.createEl("input", {
            attr: {
              type: "text",
              placeholder: "예: 홍길동",
              style: "width:100%;box-sizing:border-box;padding:var(--ke-space-2);border-radius:var(--ke-radius-control);border:var(--ke-border-width) solid var(--ke-color-border);background:var(--ke-color-surface);"
            }
          });
          input.value = this.name;
          input.oninput = () => { this.name = input.value; };
          input.onkeydown = (event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              this.submit();
            }
          };

          const footer = contentEl.createEl("div", {
            attr: { style: "display:flex;justify-content:flex-end;gap:var(--ke-space-2);margin-block-start:var(--ke-space-4);" }
          });
          const cancel = contentEl.ownerDocument
            ? footer.createEl("button", { text: "취소", attr: { type: "button" } })
            : footer.createEl("button", { text: "취소" });
          cancel.onclick = () => {
            this.close();
            resolve(null);
          };
          this.createBtn = footer.createEl("button", {
            text: "만들기",
            attr: { type: "button", class: "mod-cta" }
          });
          this.createBtn.onclick = () => this.submit();
          this.statusEl = contentEl.createEl("div", {
            text: "",
            attr: { style: "margin-top:var(--ke-space-3);font-size:var(--ke-type-label);color:var(--ke-color-muted);" }
          });
          setTimeout(() => input.focus(), 20);
        }
        async submit() {
          if (this.busy) return;
          const trimmed = String(this.name || "").trim();
          if (!trimmed) {
            this.statusEl.setText("이름을 입력해 주세요.");
            this.statusEl.style.color = "var(--ke-color-error)";
            return;
          }
          this.busy = true;
          this.createBtn.disabled = true;
          this.statusEl.setText("만드는 중...");
          this.statusEl.style.color = "var(--ke-color-muted)";
          try {
            const result = await createAndOpen(this.app, trimmed);
            if (result && result.review_required) {
              this.busy = false;
              const runtime = root.CaptureActionRuntime;
              const review = result.capture.record;
              runtime.renderReview(this.contentEl, review, {
                confirm: async () => {
                  try {
                    const committed = await createAndOpen(this.app, trimmed, {
                      captureReview: review,
                      human: runtime.humanConfirmation("people-create", review.approval_evidence.review.session_id)
                    });
                    this.close();
                    resolve(committed);
                  } catch (err) {
                    notice(err.message || String(err), 9000);
                  }
                },
                reject: () => {
                  runtime.decideHumanReview(review, runtime.humanConfirmation("people-create", review.approval_evidence.review.session_id), "people-create", "reject");
                  this.close();
                  resolve(null);
                },
                cancel: () => {
                  runtime.decideHumanReview(review, runtime.humanConfirmation("people-create", review.approval_evidence.review.session_id), "people-create", "cancel");
                  this.close();
                  resolve(null);
                }
              });
              return;
            }
            this.close(); resolve(result);
          } catch (error) {
            this.statusEl.setText(error.message || String(error));
            this.statusEl.style.color = "var(--ke-color-error)";
            this.busy = false;
            this.createBtn.disabled = false;
          }
        }
        onClose() {
          if (this.scope && typeof this.scope.dispose === "function") {
            this.scope.dispose();
          }
          this.contentEl.empty();
        }
      }
      new PeopleCreateModal(host).open();
    });
  }

  /**
   * Search People in an Obsidian Modal instead of the Dataview-owned page.
   * The modal input is not destroyed when Dataview refreshes the dashboard.
   */
  function openPeopleFinder(app, options) {
    const host = app || root.app || (typeof window !== "undefined" ? window.app : null);
    const opts = options || {};
    const core = root.PeopleCore;
    if (!host || !core) {
      notice("사람 찾기를 열 수 없습니다.");
      return null;
    }
    const Modal = root.obsidian && root.obsidian.Modal;
    if (!Modal) {
      notice("이 환경에서는 사람 찾기 창을 열 수 없습니다.");
      return null;
    }

    class PeopleFinderModal extends Modal {
      constructor(appInstance) {
        super(appInstance);
        this.query = "";
        this.composing = false;
        this.activeIndex = 0;
        this.matches = [];
        this.inputEl = null;
        this.resultsEl = null;
        this.previewEl = null;
      }

      buildMatches() {
        const rawPeople = Array.isArray(opts.rawPeople) ? opts.rawPeople : [];
        const sourcePages = Array.isArray(opts.sourcePages) ? opts.sourcePages : [];
        const model = core.buildPeopleWorkspaceModel(rawPeople, sourcePages, {
          query: this.query,
          filter: "all",
          sort: "name_asc",
          maxPreview: 0
        });
        this.matches = model.people || [];
      }

      paintResults() {
        this.buildMatches();
        if (this.activeIndex >= this.matches.length) this.activeIndex = 0;
        this.resultsEl.empty();
        this.resultsEl.createEl("div", {
          text: this.query
            ? `${this.matches.length}명 일치`
            : `전체 ${this.matches.length}명`,
          attr: { style: "font-size:var(--ke-type-label);color:var(--ke-color-muted);margin:0 0 var(--ke-space-2);" }
        });

        if (!this.matches.length) {
          this.resultsEl.createEl("div", {
            text: "일치하는 사람이 없습니다.",
            attr: { style: "padding:var(--ke-space-3);color:var(--ke-color-muted);border:var(--ke-border-width) solid var(--ke-color-border);border-radius:var(--ke-radius-control);" }
          });
          this.paintPreview();
          return;
        }

        this.matches.forEach((person, index) => {
          const meta = [person.relationship, person.company, person.role].filter(Boolean).join(" · ");
          const row = this.resultsEl.createEl("button", {
            attr: {
              type: "button",
              class: "ppw-finder-result" + (index === this.activeIndex ? " is-active" : ""),
              "aria-label": `${person.name} 열기`,
              style: "display:block;width:100%;text-align:left;padding:var(--ke-space-3) var(--ke-space-3);margin:0 0 var(--ke-space-2);border:var(--ke-border-width) solid var(--ke-color-border);border-radius:var(--ke-radius-control);background:var(--ke-color-surface);color:var(--ke-color-text);cursor:pointer;"
            }
          });
          row.createEl("strong", { text: person.name, attr: { style: "display:block;" } });
          if (meta) row.createEl("span", {
            text: meta,
            attr: { style: "display:block;margin-top:var(--ke-space-1);font-size:var(--ke-type-label);color:var(--ke-color-muted);" }
          });
          row.onclick = () => {
            this.activeIndex = index;
            this.paintResults();
          };
        });
        this.paintPreview();
      }

      paintPreview() {
        this.previewEl.empty();
        const person = this.matches[this.activeIndex];
        if (!person) {
          this.previewEl.createEl("div", {
            text: "왼쪽 목록에서 사람을 선택하면 관계와 최근 맥락을 확인할 수 있습니다.",
            attr: { style: "padding:var(--ke-space-4);color:var(--ke-color-muted);border:var(--ke-border-width) solid var(--ke-color-border);border-radius:var(--ke-radius-control);line-height:var(--ke-leading-body);" }
          });
          return;
        }

        const meta = [person.relationship, person.company, person.role].filter(Boolean).join(" · ");
        this.previewEl.createEl("h3", { text: person.name, attr: { style: "margin:0;font-size:var(--ke-type-title);" } });
        if (meta) this.previewEl.createEl("div", {
          text: meta,
          attr: { style: "margin:var(--ke-space-1) 0 var(--ke-space-3);font-size:var(--ke-type-label);color:var(--ke-color-muted);" }
        });

        const sections = typeof core.parsePeopleBodySections === "function"
          ? core.parsePeopleBodySections(person.body, { personName: person.name })
          : [];
        const relation = sections.find((section) => section.title === "관계");
        const relationText = relation && relation.displayBody ? relation.displayBody : "기록된 관계 설명이 없습니다.";
        const addSection = (title, lines, emptyText) => {
          const block = this.previewEl.createEl("section", {
            attr: { style: "margin-top:var(--ke-space-3);padding-top:var(--ke-space-3);border:var(--ke-border-width) solid var(--ke-color-border);" }
          });
          block.createEl("div", { text: title, attr: { style: "font-size:var(--ke-type-label);font-weight:700;color:var(--ke-color-muted);margin-bottom:var(--ke-space-1);" } });
          if (!lines.length) {
            block.createEl("div", { text: emptyText, attr: { style: "font-size:var(--ke-type-label);color:var(--ke-color-muted);" } });
            return;
          }
          lines.slice(0, 4).forEach((line) => block.createEl("div", {
            text: line,
            attr: { style: "font-size:var(--ke-type-label);line-height:var(--ke-leading-body);margin:var(--ke-space-1) 0;" }
          }));
        };
        addSection("관계", [relationText], "기록된 관계 설명이 없습니다.");
        addSection("핵심 상호작용", person.interaction_lines || [], "기록된 핵심 상호작용이 없습니다.");
        addSection("메모", person.memo_lines || [], "기록된 메모가 없습니다.");
        addSection(
          "최근 맥락",
          (person.linked_all || []).map((item) => item && item.title).filter(Boolean),
          "연결된 기록이 없습니다."
        );

        const actions = this.previewEl.createEl("div", { attr: { style: "margin-top:var(--ke-space-4);display:flex;justify-content:flex-end;" } });
        const openBtn = actions.createEl("button", { text: "관계 맥락 열기", attr: { type: "button", class: "mod-cta" } });
        openBtn.onclick = () => this.pick(person.path);
      }

      moveActive(step) {
        if (!this.matches.length) return;
        this.activeIndex = (this.activeIndex + step + this.matches.length) % this.matches.length;
        this.paintResults();
      }

      pick(path) {
        if (!path) return;
        this.close();
        setTimeout(() => {
          if (typeof opts.onPick === "function") opts.onPick(path);
        }, 0);
      }

      onOpen() {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.addClass("ppw-modal-surface");
        contentEl.createEl("h2", { text: "사람 찾기", attr: { style: "margin:0 0 var(--ke-space-2);font-size:var(--ke-type-title);" } });
        contentEl.createEl("p", {
          text: "이름, 구분, 소속, 역할, 메모를 찾습니다. 목록을 선택하면 관계와 최근 맥락을 바로 확인할 수 있습니다.",
          attr: { style: "margin:0 0 var(--ke-space-3);font-size:var(--ke-type-label);color:var(--ke-color-muted);line-height:var(--ke-leading-body);" }
        });
        this.inputEl = contentEl.createEl("input", {
          attr: {
            type: "text",
            placeholder: "이름 입력",
            "aria-label": "사람 찾기",
            style: "width:100%;box-sizing:border-box;padding:var(--ke-space-2) var(--ke-space-3);border-radius:var(--ke-radius-control);border:var(--ke-border-width) solid var(--ke-color-border);background:var(--ke-color-surface);"
          }
        });
        const layout = contentEl.createEl("div", {
          attr: {
            class: "ppw-finder-layout",
            style: "display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:var(--ke-space-3);margin-top:var(--ke-space-3);"
          }
        });
        this.resultsEl = layout.createEl("div", { attr: { style: "max-height:52vh;overflow:auto;" } });
        this.previewEl = layout.createEl("div", { attr: { style: "max-height:52vh;overflow:auto;padding:var(--ke-space-3);border:var(--ke-border-width) solid var(--ke-color-border);border-radius:var(--ke-radius-control);background:var(--ke-color-surface);" } });
        this.inputEl.oncompositionstart = () => { this.composing = true; };
        this.inputEl.oncompositionend = () => {
          this.composing = false;
          this.query = this.inputEl.value;
          this.activeIndex = 0;
          this.paintResults();
        };
        this.inputEl.oninput = () => {
          this.query = this.inputEl.value;
          if (this.composing) return;
          this.activeIndex = 0;
          this.paintResults();
        };
        this.inputEl.onkeydown = (event) => {
          if (event && (event.isComposing || event.keyCode === 229 || event.key === "Process")) return;
          if (event && event.key === "ArrowDown") {
            event.preventDefault();
            this.moveActive(1);
          } else if (event && event.key === "ArrowUp") {
            event.preventDefault();
            this.moveActive(-1);
          } else if (event && event.key === "Enter") {
            event.preventDefault();
            const active = this.matches[this.activeIndex] || this.matches[0];
            if (active) this.pick(active.path);
          }
        };
        this.paintResults();
        setTimeout(() => this.inputEl && this.inputEl.focus(), 20);
      }

      onClose() {
        this.contentEl.empty();
      }
    }

    const modal = new PeopleFinderModal(host);
    modal.open();
    return modal;
  }

  /**
   * @deprecated Use openPersonPreview — relation popup covers property + body edit.
   * Kept as a thin alias so older call sites still work.
   */
  async function openQuickEditFlow(app, path, onSaved) {
    return openPersonPreview(app, path, onSaved);
  }

  /**
   * Add a one-line interaction/event under # 핵심 상호작용 (like handwritten memos).
   * Index only — does not create a separate event Object or copy long bodies.
   */
  async function openAddInteractionFlow(app, path, onSaved) {
    const host = app || root.app || (typeof window !== "undefined" ? window.app : null);
    if (!host) {
      notice("Obsidian 앱 컨텍스트가 필요합니다.");
      return null;
    }
    if (!root.PeopleStore || !root.PeopleCore) {
      notice("People 모듈을 불러오지 못했습니다.");
      return null;
    }

    let title = String(path || "").split("/").pop().replace(/\.md$/i, "");
    try {
      const snap = await root.PeopleStore.readPeopleProperties(host, path);
      title = snap.title || title;
    } catch (_e) {
      /* path still usable */
    }

    const Modal = root.obsidian && root.obsidian.Modal;
    const today = root.PeopleCore.todayIso(new Date());

    if (!Modal) {
      const insight = typeof window !== "undefined" && window.prompt
        ? window.prompt("사건 한 줄 (예: 전태현 청모)", "")
        : "";
      if (!insight) return null;
      try {
        const result = await root.PeopleStore.appendKeyInteraction(host, path, {
          date: today,
          insight
        });
        notice("사건을 추가했습니다.");
        if (typeof onSaved === "function") await onSaved(result);
        return result;
      } catch (error) {
        notice(error.message || String(error), 9000);
        return null;
      }
    }

    return new Promise((resolve) => {
      class PeopleInteractionModal extends Modal {
        constructor(appInstance) {
          super(appInstance);
          this.date = today;
          this.source = `[[${today}]]`;
          this.insight = "";
          this.busy = false;
        }
        onOpen() {
          const { contentEl } = this;
          contentEl.empty();
          contentEl.addClass("ppw-modal-surface");
          contentEl.createEl("h2", {
            text: `사건 추가 · ${title}`,
            attr: { style: "margin:0 0 var(--ke-space-2);font-size:var(--ke-type-title);" }
          });
          contentEl.createEl("p", {
            text: "핵심 상호작용 인덱스에 한 줄만 남깁니다. 긴 내용은 Journal·Project 원본에 두고 링크하세요.",
            attr: { style: "font-size:var(--ke-type-label);color:var(--ke-color-muted);margin:0 0 var(--ke-space-3);line-height:var(--ke-leading-body);" }
          });

          const field = (label, value, onChange, placeholder) => {
            const wrap = contentEl.createEl("div", { attr: { style: "margin-bottom:var(--ke-space-3);" } });
            wrap.createEl("label", {
              text: label,
              attr: { style: "display:block;font-size:var(--ke-type-label);font-weight:700;margin-bottom:var(--ke-space-1);color:var(--ke-color-muted);" }
            });
            const input = wrap.createEl("input", {
              attr: {
                type: "text",
                placeholder: placeholder || "",
                style: "width:100%;box-sizing:border-box;padding:var(--ke-space-2);border-radius:var(--ke-radius-control);border:var(--ke-border-width) solid var(--ke-color-border);background:var(--ke-color-surface);"
              }
            });
            input.value = value || "";
            input.oninput = () => onChange(input.value);
            return input;
          };

          field("날짜", this.date, (v) => {
            this.date = v;
            if (!this.source || this.source === `[[${today}]]` || /^\[\[\d{4}-\d{2}-\d{2}\]\]$/.test(this.source)) {
              this.source = `[[${root.PeopleCore.normalizeIsoDate(v, new Date())}]]`;
              if (this.sourceInput) this.sourceInput.value = this.source;
            }
          }, "YYYY-MM-DD");

          this.sourceInput = field(
            "출처 링크 (선택)",
            this.source,
            (v) => { this.source = v; },
            "[[2026-07-16]] 또는 노트 제목"
          );

          const insightInput = field(
            "한 줄 내용",
            this.insight,
            (v) => { this.insight = v; },
            "예: 전태현 청모"
          );

          const footer = contentEl.createEl("div", {
            attr: { style: "display:flex;justify-content:flex-end;align-items:center;gap:var(--ke-space-2);margin-block-start:var(--ke-space-4);flex-wrap:wrap;" }
          });

          const cancel = footer.createEl("button", { text: "취소", attr: { type: "button" } });
          cancel.onclick = () => {
            this.close();
            resolve(null);
          };
          this.saveBtn = footer.createEl("button", {
            text: "추가",
            attr: { type: "button", class: "mod-cta" }
          });
          this.saveBtn.onclick = () => this.submit();

          this.statusEl = contentEl.createEl("div", {
            text: "저장 위치: # 핵심 상호작용 · last_contact 자동 갱신",
            attr: { style: "margin-top:var(--ke-space-3);font-size:var(--ke-type-label);color:var(--ke-color-muted);" }
          });
          setTimeout(() => insightInput.focus(), 20);
        }
        async submit() {
          if (this.busy) return;
          this.busy = true;
          this.saveBtn.disabled = true;
          this.statusEl.setText("추가 중...");
          this.statusEl.style.color = "var(--ke-color-muted)";
          try {
            const result = await root.PeopleStore.appendKeyInteraction(this.app, path, {
              date: this.date,
              source: this.source,
              insight: this.insight
            });
            notice(`사건을 추가했습니다: ${title}`);
            if (typeof onSaved === "function") {
              try { await onSaved(result); } catch (_e) { /* ignore */ }
            }
            this.close();
            resolve(result);
          } catch (error) {
            this.statusEl.setText(error.message || String(error));
            this.statusEl.style.color = "var(--ke-color-error)";
            this.busy = false;
            this.saveBtn.disabled = false;
          }
        }
        onClose() {
          this.contentEl.empty();
        }
      }
      new PeopleInteractionModal(host).open();
    });
  }

  /**
   * Confirm and remove one memo line under # 메모.
   * @param {object} app
   * @param {string} path
   * @param {{ text?: string, index?: number }} target
   * @param {function} [onRemoved]
   */
  async function openRemoveMemoFlow(app, path, target, onRemoved) {
    const host = app || root.app || (typeof window !== "undefined" ? window.app : null);
    if (!host) {
      notice("Obsidian 앱 컨텍스트가 필요합니다.");
      return null;
    }
    if (!root.PeopleStore || !root.PeopleCore) {
      notice("People 모듈을 불러오지 못했습니다.");
      return null;
    }

    const filePath = String(path || "");
    const name = filePath.split("/").pop().replace(/\.md$/i, "") || "이 사람";
    const preview = String(
      (target && (target.text || target.line)) || ""
    ).trim() || "(메모)";

    const Modal = root.obsidian && root.obsidian.Modal;
    if (!Modal) {
      const ok = typeof window !== "undefined" && window.confirm
        ? window.confirm(`메모를 삭제할까요?\n\n${preview}`)
        : true;
      if (!ok) return null;
      try {
        const result = await root.PeopleStore.removeMemo(host, filePath, target);
        notice("메모를 삭제했습니다.");
        if (typeof onRemoved === "function") await onRemoved(result);
        return result;
      } catch (error) {
        notice(error.message || String(error), 9000);
        return null;
      }
    }

    return new Promise((resolve) => {
      class PeopleRemoveMemoModal extends Modal {
        constructor(appInstance) {
          super(appInstance);
          this.busy = false;
        }
        onOpen() {
          const { contentEl } = this;
          contentEl.empty();
          contentEl.addClass("ppw-modal-surface");
          contentEl.createEl("h2", {
            text: "메모 삭제",
            attr: { style: "margin:0 0 var(--ke-space-2);font-size:var(--ke-type-title);" }
          });
          contentEl.createEl("p", {
            text: `「${name}」의 메모를 삭제할까요?`,
            attr: { style: "font-size:var(--ke-type-label);margin:0 0 var(--ke-space-2);font-weight:700;" }
          });
          contentEl.createEl("p", {
            text: preview,
            attr: {
              style: "font-size:var(--ke-type-label);margin:0 0 var(--ke-space-4);padding:var(--ke-space-2) var(--ke-space-3);border-radius:var(--ke-radius-control);background:var(--ke-color-surface-secondary);border:var(--ke-border-width) solid var(--ke-color-border);line-height:var(--ke-leading-body);overflow-wrap:anywhere;"
            }
          });
          const footer = contentEl.createEl("div", {
            attr: { style: "display:flex;justify-content:flex-end;gap:var(--ke-space-2);flex-wrap:wrap;" }
          });
          const cancel = footer.createEl("button", { text: "취소", attr: { type: "button" } });
          cancel.onclick = () => {
            this.close();
            resolve(null);
          };
          this.deleteBtn = footer.createEl("button", {
            text: "삭제",
            attr: {
              type: "button",
              class: "mod-warning",
              style: "background:var(--ke-color-error);color:var(--ke-color-on-interactive);border-color:var(--ke-color-error);"
            }
          });
          this.deleteBtn.onclick = () => this.submit();
          this.statusEl = contentEl.createEl("div", {
            text: "",
            attr: { style: "margin-top:var(--ke-space-3);font-size:var(--ke-type-label);color:var(--ke-color-muted);" }
          });
        }
        async submit() {
          if (this.busy) return;
          this.busy = true;
          this.deleteBtn.disabled = true;
          this.statusEl.setText("삭제 중…");
          try {
            const result = await root.PeopleStore.removeMemo(this.app, filePath, target);
            const removedText = (result && result.removed) || preview;
            if (typeof onRemoved === "function") {
              try { await onRemoved(result); } catch (_e) { /* ignore */ }
            }
            this.close();
            showUndoToast("메모를 삭제했습니다.", async () => {
              await root.PeopleStore.appendMemo(host, filePath, { text: removedText });
              notice("메모를 복구했습니다.");
              if (typeof onRemoved === "function") await onRemoved({ restored: true, path: filePath });
            });
            resolve(result);
          } catch (error) {
            this.statusEl.setText(error.message || String(error));
            this.statusEl.style.color = "var(--ke-color-error)";
            this.busy = false;
            this.deleteBtn.disabled = false;
          }
        }
        onClose() {
          this.contentEl.empty();
        }
      }
      new PeopleRemoveMemoModal(host).open();
    });
  }

  /**
   * Confirm and remove one interaction line under # 핵심 상호작용.
   */
  async function openRemoveInteractionFlow(app, path, target, onRemoved) {
    const host = app || root.app || (typeof window !== "undefined" ? window.app : null);
    if (!host) {
      notice("Obsidian 앱 컨텍스트가 필요합니다.");
      return null;
    }
    if (!root.PeopleStore || !root.PeopleCore) {
      notice("People 모듈을 불러오지 못했습니다.");
      return null;
    }

    const filePath = String(path || "");
    const name = filePath.split("/").pop().replace(/\.md$/i, "") || "이 사람";
    const preview = String((target && (target.text || target.line)) || "").trim() || "(사건)";

    const Modal = root.obsidian && root.obsidian.Modal;
    if (!Modal) {
      const ok = typeof window !== "undefined" && window.confirm
        ? window.confirm(`사건을 삭제할까요?\n\n${preview}`)
        : true;
      if (!ok) return null;
      try {
        const result = await root.PeopleStore.removeInteraction(host, filePath, target);
        notice("사건을 삭제했습니다.");
        if (typeof onRemoved === "function") await onRemoved(result);
        return result;
      } catch (error) {
        notice(error.message || String(error), 9000);
        return null;
      }
    }

    return new Promise((resolve) => {
      class PeopleRemoveInteractionModal extends Modal {
        constructor(appInstance) {
          super(appInstance);
          this.busy = false;
        }
        onOpen() {
          const { contentEl } = this;
          contentEl.empty();
          contentEl.addClass("ppw-modal-surface");
          contentEl.createEl("h2", {
            text: "사건 삭제",
            attr: { style: "margin:0 0 var(--ke-space-2);font-size:var(--ke-type-title);" }
          });
          contentEl.createEl("p", {
            text: `「${name}」의 사건을 삭제할까요?`,
            attr: { style: "font-size:var(--ke-type-label);margin:0 0 var(--ke-space-2);font-weight:700;" }
          });
          contentEl.createEl("p", {
            text: preview,
            attr: {
              style: "font-size:var(--ke-type-label);margin:0 0 var(--ke-space-4);padding:var(--ke-space-2) var(--ke-space-3);border-radius:var(--ke-radius-control);background:var(--ke-color-surface-secondary);border:var(--ke-border-width) solid var(--ke-color-border);line-height:var(--ke-leading-body);overflow-wrap:anywhere;"
            }
          });
          const footer = contentEl.createEl("div", {
            attr: { style: "display:flex;justify-content:flex-end;gap:var(--ke-space-2);flex-wrap:wrap;" }
          });
          const cancel = footer.createEl("button", { text: "취소", attr: { type: "button" } });
          cancel.onclick = () => {
            this.close();
            resolve(null);
          };
          this.deleteBtn = footer.createEl("button", {
            text: "삭제",
            attr: {
              type: "button",
              class: "mod-warning",
              style: "background:var(--ke-color-error);color:var(--ke-color-on-interactive);border-color:var(--ke-color-error);"
            }
          });
          this.deleteBtn.onclick = () => this.submit();
          this.statusEl = contentEl.createEl("div", {
            text: "",
            attr: { style: "margin-top:var(--ke-space-3);font-size:var(--ke-type-label);color:var(--ke-color-muted);" }
          });
        }
        async submit() {
          if (this.busy) return;
          this.busy = true;
          this.deleteBtn.disabled = true;
          this.statusEl.setText("삭제 중…");
          try {
            const result = await root.PeopleStore.removeInteraction(this.app, filePath, target);
            const removedText = (result && result.removed) || preview;
            if (typeof onRemoved === "function") {
              try { await onRemoved(result); } catch (_e) { /* ignore */ }
            }
            this.close();
            showUndoToast("사건을 삭제했습니다.", async () => {
              await root.PeopleStore.appendKeyInteraction(host, filePath, {}, {
                rawLine: removedText,
                updateLastContact: false
              });
              notice("사건을 복구했습니다.");
              if (typeof onRemoved === "function") await onRemoved({ restored: true, path: filePath });
            });
            resolve(result);
          } catch (error) {
            this.statusEl.setText(error.message || String(error));
            this.statusEl.style.color = "var(--ke-color-error)";
            this.busy = false;
            this.deleteBtn.disabled = false;
          }
        }
        onClose() {
          this.contentEl.empty();
        }
      }
      new PeopleRemoveInteractionModal(host).open();
    });
  }

  /**
   * Add a factual one-line note under # 메모 (not a dated interaction event).
   */
  async function openAddMemoFlow(app, path, onSaved) {
    const host = app || root.app || (typeof window !== "undefined" ? window.app : null);
    if (!host) {
      notice("Obsidian 앱 컨텍스트가 필요합니다.");
      return null;
    }
    if (!root.PeopleStore || !root.PeopleCore) {
      notice("People 모듈을 불러오지 못했습니다.");
      return null;
    }

    let title = String(path || "").split("/").pop().replace(/\.md$/i, "");
    try {
      const snap = await root.PeopleStore.readPeopleProperties(host, path);
      title = snap.title || title;
    } catch (_e) {
      /* path still usable */
    }

    const Modal = root.obsidian && root.obsidian.Modal;

    if (!Modal) {
      const text = typeof window !== "undefined" && window.prompt
        ? window.prompt("메모 (사실·장기 맥락)", "")
        : "";
      if (!text) return null;
      try {
        const result = await root.PeopleStore.appendMemo(host, path, { text });
        notice("메모를 추가했습니다.");
        if (typeof onSaved === "function") await onSaved(result);
        return result;
      } catch (error) {
        notice(error.message || String(error), 9000);
        return null;
      }
    }

    return new Promise((resolve) => {
      class PeopleMemoModal extends Modal {
        constructor(appInstance) {
          super(appInstance);
          this.text = "";
          this.busy = false;
        }
        onOpen() {
          const { contentEl } = this;
          contentEl.empty();
          contentEl.addClass("ppw-modal-surface");
          contentEl.createEl("h2", {
            text: `메모 추가 · ${title}`,
            attr: { style: "margin:0 0 var(--ke-space-2);font-size:var(--ke-type-title);" }
          });
          contentEl.createEl("p", {
            text: "사실 중심 장기 맥락을 # 메모에 남깁니다. 날짜 사건·상호작용 로그는 「사건 추가」를 쓰세요.",
            attr: { style: "font-size:var(--ke-type-label);color:var(--ke-color-muted);margin:0 0 var(--ke-space-3);line-height:var(--ke-leading-body);" }
          });

          contentEl.createEl("label", {
            text: "메모",
            attr: { style: "display:block;font-size:var(--ke-type-label);font-weight:700;margin-bottom:var(--ke-space-1);color:var(--ke-color-muted);" }
          });
          const area = contentEl.createEl("textarea", {
            attr: {
              rows: "4",
              placeholder: "예: 청모 모임에서 처음 만남 · 주말에만 연락 가능",
              style: "width:100%;box-sizing:border-box;padding:var(--ke-space-2);border-radius:var(--ke-radius-control);border:var(--ke-border-width) solid var(--ke-color-border);background:var(--ke-color-surface);min-height:88px;resize:vertical;"
            }
          });
          area.value = this.text;
          area.oninput = () => { this.text = area.value; };

          const footer = contentEl.createEl("div", {
            attr: { style: "display:flex;justify-content:flex-end;align-items:center;gap:var(--ke-space-2);margin-block-start:var(--ke-space-4);flex-wrap:wrap;" }
          });

          const cancel = footer.createEl("button", { text: "취소", attr: { type: "button" } });
          cancel.onclick = () => {
            this.close();
            resolve(null);
          };
          this.saveBtn = footer.createEl("button", {
            text: "추가",
            attr: { type: "button", class: "mod-cta" }
          });
          this.saveBtn.onclick = () => this.submit();

          this.statusEl = contentEl.createEl("div", {
            text: "저장 위치: # 메모 · last_contact는 바꾸지 않음",
            attr: { style: "margin-top:var(--ke-space-3);font-size:var(--ke-type-label);color:var(--ke-color-muted);" }
          });
          setTimeout(() => area.focus(), 20);
        }
        async submit() {
          if (this.busy) return;
          this.busy = true;
          this.saveBtn.disabled = true;
          this.statusEl.setText("추가 중...");
          this.statusEl.style.color = "var(--ke-color-muted)";
          try {
            const result = await root.PeopleStore.appendMemo(this.app, path, {
              text: this.text
            });
            notice(`메모를 추가했습니다: ${title}`);
            if (typeof onSaved === "function") {
              try { await onSaved(result); } catch (_e) { /* ignore */ }
            }
            this.close();
            resolve(result);
          } catch (error) {
            this.statusEl.setText(error.message || String(error));
            this.statusEl.style.color = "var(--ke-color-error)";
            this.busy = false;
            this.saveBtn.disabled = false;
          }
        }
        onClose() {
          this.contentEl.empty();
        }
      }
      new PeopleMemoModal(host).open();
    });
  }

  // CSS extracted to people-styles.js (P2-1)
  const WORKSPACE_STYLE_ID = "prodigy-people-workspace-styles";
  function ensureWorkspaceStyles() {
    const styles = root.PeopleStyles;
    if (styles && typeof styles.ensureWorkspaceStyles === "function") {
      return styles.ensureWorkspaceStyles();
    }
  }

  function peopleResponsiveContract() {
    let styles = root.PeopleStyles;
    if ((!styles || typeof styles.responsiveContract !== "function") && typeof require === "function") {
      try { styles = require("./people-styles.js"); } catch (_error) { styles = null; }
    }
    if (!styles || typeof styles.responsiveContract !== "function") {
      throw new Error("People 반응형 계약을 불러오지 못했습니다.");
    }
    return styles.responsiveContract();
  }

  function resolvePeoplePaneLayout(logicalWidth) {
    const width = Number(logicalWidth);
    if (!Number.isFinite(width) || width < 0) {
      throw new Error("People 작업면의 논리 너비가 필요합니다.");
    }
    const contract = peopleResponsiveContract();
    const tier = width >= contract.wideMin
      ? "wide"
      : (width >= contract.mediumMin ? "medium" : "compact");
    return Object.freeze({
      logicalWidth: width,
      tier,
      paneMode: tier === "wide" ? "two-pane" : "single-pane"
    });
  }

  function btn(parent, label, opts) {
    const o = opts || {};
    if (root.ProdigyUI && root.ProdigyUI.button) {
      return root.ProdigyUI.button(parent, label, {
        primary: !!o.primary,
        className: o.className || ""
      });
    }
    const el = parent.createEl("button", {
      text: label,
      attr: {
        type: "button",
        class: ["prodigy-btn", o.primary ? "prodigy-btn-primary" : "", o.className || ""].filter(Boolean).join(" ")
      }
    });
    return el;
  }

  /**
   * People Workspace surface inside Personal Hub.
   * options: { app, container, model, onRefresh, onOpenPerson, onOpenRecord }
   * model from PeopleCore.buildPeopleWorkspaceModel
   */
  function renderPeopleWorkspace(options) {
    const opts = options || {};
    const app = opts.app;
    const container = opts.container;
    const core = root.PeopleCore;
    if (!container || !core) return null;
    if (root.ProdigyUI) root.ProdigyUI.ensureStyles();
    ensureWorkspaceStyles();

    const state = {
      query: (opts.model && opts.model.query) || "",
      filter: (opts.model && opts.model.filter) || "all",
      sort: (opts.model && opts.model.sort) || opts.sort || "name_asc",
      expanded: Object.create(null),
      contextType: Object.create(null),
      focusPath: opts.focusPath || "",
      selectedPath: opts.selectedPath || ""
    };

    const hasExplicitLogicalWidth = Number.isFinite(Number(opts.logicalWidth));
    let layout = resolvePeoplePaneLayout(hasExplicitLogicalWidth
      ? Number(opts.logicalWidth)
      : Number(container.clientWidth || 0));

    function refreshAfterEdit(path) {
      state.focusPath = path || state.focusPath;
      if (typeof opts.onRefresh === "function") opts.onRefresh();
      else paint();
    }

    let destroyed = false;
    const workspaceModel = peopleWorkspaceDependency("PeopleWorkspaceModel", "./people-workspace-model.js").create({
      app,
      core,
      model: opts.model,
      rawPeople: opts.rawPeople,
      sourcePages: opts.sourcePages,
      allPeople: opts.allPeople,
      typedKnowledgeRow,
      onReadStateChange: (change) => {
        if (!destroyed) paint();
        if (typeof opts.onReadStateChange === "function") opts.onReadStateChange(change);
      }
    });
    const events = peopleWorkspaceDependency("PeopleWorkspaceEvents", "./people-workspace-events.js").create();
    let model = workspaceModel.getModel();
    let detailReturnFocus = null;
    let pendingDetailFocus = false;
    let listReturnScrollTop = 0;

    function rebuildModel() {
      model = workspaceModel.rebuild(state);
      return model;
    }

    async function hydratePeopleBodies() {
      return workspaceModel.hydrate();
    }

    async function retryPersonRead(path) {
      return workspaceModel.retry(path);
    }

    // Name click → editable relation popup (single entry point)
    function openPerson(path) {
      if (typeof opts.onOpenPerson === "function") return opts.onOpenPerson(path);
      return openPersonPreview(app, path, () => refreshAfterEdit(path));
    }

    function openRecord(path) {
      if (typeof opts.onOpenRecord === "function") return opts.onOpenRecord(path);
      return openBeside(app, path);
    }

    function selectedPerson() {
      return (model.people || []).find((person) => person.path === state.selectedPath) || null;
    }

    // ── Static shell: created once, never destroyed by paint() ──
    container.empty();
    container.addClass("prodigy-people-workspace");

    const header = container.createDiv({ attr: { class: "ppw-header" } });
    const heading = header.createDiv();
    heading.createEl("h1", { text: opts.title || "사람과 관계" });
    heading.createEl("p", {
      text: opts.subtitle || "중요한 사람을 찾고, 함께한 기록과 관계의 맥락을 이어갑니다."
    });
    const headerActions = header.createDiv({ attr: { style: "display:flex;gap:var(--ke-space-2);flex-wrap:wrap;" } });
    const addBtn = btn(headerActions, "사람 추가", { primary: true });
    events.property(addBtn, "onclick", async () => {
      await openCreateFlow(app);
      if (destroyed) return;
      if (typeof opts.onRefresh === "function") opts.onRefresh();
      else paint();
    });

    const finderBtn = btn(headerActions, "사람 찾기");
    events.property(finderBtn, "onclick", () => openPeopleFinder(app, {
      rawPeople: workspaceModel.getRawPeople(),
      sourcePages: workspaceModel.getSourcePages(),
      onPick: (path) => selectPerson(path)
    }));

    const masterDetail = container.createDiv({
      attr: {
        class: "ppw-master-detail",
        "data-pane-mode": layout.paneMode,
        "data-layout-tier": layout.tier
      }
    });
    const listPane = masterDetail.createEl("section", {
      attr: { class: "ppw-list-pane", "aria-label": "사람 목록" }
    });
    const detailPane = masterDetail.createEl("section", {
      attr: { class: "ppw-detail-pane prodigy-full-bleed", "aria-label": "사람 맥락" }
    });

    const toolbar = listPane.createDiv({ attr: { class: "ppw-toolbar" } });
    const searchInput = toolbar.createEl("input", {
      attr: {
        type: "search",
        class: "ppw-search",
        placeholder: "이름·소속·역할·메모 검색",
        "aria-label": "사람 검색"
      }
    });
    searchInput.value = state.query;
    let composing = false;
    events.property(searchInput, "oncompositionstart", () => { composing = true; });
    events.property(searchInput, "oncompositionend", () => {
      composing = false;
      state.query = String(searchInput.value || "");
      paint();
    });
    events.property(searchInput, "oninput", () => {
      if (composing) return;
      state.query = String(searchInput.value || "");
      paint();
    });

    // 구분 필터 (관계 Property 카테고리)
    const filterRow = toolbar.createDiv({ attr: { class: "ppw-toolbar-row" } });
    filterRow.createEl("span", { text: "구분", attr: { class: "ppw-toolbar-label" } });
    const filters = filterRow.createDiv({ attr: { class: "ppw-filters" } });
    (core.WORKSPACE_FILTERS || []).forEach((f) => {
      const chip = filters.createEl("button", {
        text: f.label,
        attr: {
          type: "button",
          class: "ppw-filter prodigy-configurator-chip" + (state.filter === f.id ? " is-active" : ""),
          "aria-pressed": state.filter === f.id ? "true" : "false"
        }
      });
      chip.onclick = () => {
        state.filter = f.id;
        syncFilterChips();
        paint();
      };
    });

    // 가나다 정렬
    const sortRow = toolbar.createDiv({ attr: { class: "ppw-toolbar-row" } });
    sortRow.createEl("span", { text: "정렬", attr: { class: "ppw-toolbar-label" } });
    const sorts = sortRow.createDiv({ attr: { class: "ppw-filters ppw-sorts" } });
    (core.WORKSPACE_SORTS || [
      { id: "name_asc", label: "가나다 ↑" },
      { id: "name_desc", label: "가나다 ↓" }
    ]).forEach((s) => {
      const chip = sorts.createEl("button", {
        text: s.label,
        attr: {
          type: "button",
          class: "ppw-filter ppw-sort prodigy-configurator-chip" + (state.sort === s.id ? " is-active" : ""),
          "aria-pressed": state.sort === s.id ? "true" : "false"
        }
      });
      chip.onclick = () => {
        state.sort = s.id;
        syncSortChips();
        paint();
      };
    });

    const count = toolbar.createEl("div", {
      text: "",
      attr: { class: "ppw-count" }
    });

    const list = listPane.createDiv({ attr: { class: "ppw-list" } });

    function attachPane(pane, before) {
      if (pane.parentElement === masterDetail || pane.parent === masterDetail) return;
      const anchor = before && (before.parentElement === masterDetail || before.parent === masterDetail) ? before : null;
      if (typeof masterDetail.insertBefore === "function") masterDetail.insertBefore(pane, anchor);
      else if (typeof masterDetail.appendChild === "function") masterDetail.appendChild(pane);
      pane.hidden = false;
    }

    function parkPane(pane) {
      pane.hidden = false;
      if (typeof pane.remove === "function") pane.remove();
    }

    function applyPaneVisibility() {
      masterDetail.setAttribute("data-pane-mode", layout.paneMode);
      masterDetail.setAttribute("data-layout-tier", layout.tier);
      if (layout.paneMode !== "single-pane") {
        attachPane(listPane, detailPane);
        attachPane(detailPane, null);
        return;
      }
      if (state.selectedPath) {
        parkPane(listPane);
        attachPane(detailPane, null);
      } else {
        attachPane(listPane, detailPane);
        parkPane(detailPane);
      }
    }

    function paintDetail(person) {
      detailPane.empty();
      if (!person) {
        detailPane.createEl("div", {
          text: "목록에서 사람을 선택하면 관계 맥락과 연결된 기록을 볼 수 있습니다.",
          attr: { class: "ppw-empty" }
        });
        return;
      }

      const head = detailPane.createDiv({ attr: { class: "ppw-detail-head" } });
      if (layout.paneMode === "single-pane") {
        const back = btn(head, "목록", { className: "ppw-detail-back" });
        back.onclick = () => {
          const returnTarget = detailReturnFocus;
          state.selectedPath = "";
          applyPaneVisibility();
          paintDetail(null);
          listPane.scrollTop = listReturnScrollTop;
          if (returnTarget && typeof returnTarget.focus === "function") returnTarget.focus();
          detailReturnFocus = null;
        };
      }
      const titleWrap = head.createDiv();
      const detailTitle = titleWrap.createEl("h2", { text: person.name, attr: { class: "ppw-detail-title", tabindex: "-1" } });
      if (person.meta_line) titleWrap.createEl("div", { text: person.meta_line, attr: { class: "ppw-meta" } });
      if (person.read_state && person.read_state.status === "loading") {
        detailPane.createEl("div", {
          text: `본문을 불러오는 중… 원본: ${person.path}`,
          attr: { class: "ppw-read-loading", role: "status", "aria-live": "polite" }
        });
      } else if (person.read_state && person.read_state.status === "error") {
        const error = detailPane.createDiv({ attr: { class: "ppw-read-error", role: "alert" } });
        error.createEl("span", { text: `본문을 읽지 못했습니다. 원본: ${person.path}` });
        const retry = btn(error, "다시 읽기");
        retry.setAttribute("aria-label", `${person.name} 본문 다시 읽기`);
        retry.onclick = () => { void retryPersonRead(person.path); };
      } else if (person.read_state && person.read_state.status === "empty") {
        detailPane.createEl("div", {
          text: `본문이 비어 있습니다. 원본: ${person.path}`,
          attr: { class: "ppw-read-empty" }
        });
      }

      const insightSection = detailPane.createEl("section", { attr: { class: "ppw-detail-section" } });
      insightSection.createEl("h3", { text: "핵심 상호작용" });
      const insights = person.interaction_lines || [];
      if (insights.length) {
        const lines = insightSection.createEl("ul", { attr: { class: "ppw-detail-lines" } });
        insights.forEach((line) => lines.createEl("li", { text: line }));
      } else {
        insightSection.createEl("div", {
          text: "큐레이션된 상호작용 통찰이 없습니다.",
          attr: { class: "ppw-related-empty" }
        });
      }

      const allLinked = person.linked_all || person.recent_context || [];
      const linkedKnowledge = allLinked
        .map((item) => typedKnowledgeRow(item) || item)
        .filter((item) => item.context_kind === "approved");
      const linkedCandidates = allLinked
        .map((item) => typedKnowledgeRow(item) || item)
        .filter((item) => item.context_kind === "candidate");
      const renderKnowledgeRows = (parent, items, label) => {
        items.forEach((item) => {
          const row = parent.createEl("button", {
            text: contextRowLabel(item),
            attr: {
              type: "button",
              class: "ppw-context-item",
              "aria-label": `${label}: ${item.title}`,
              style: "inline-size:100%;border:0;background:transparent;color:inherit;text-align:start;font:inherit;word-break:keep-all;overflow-wrap:anywhere;"
            }
          });
          applyContextMetadata(row, item);
          row.onclick = () => openKnowledgeContext(app, item);
          if (item.source_refs && item.source_refs.length) {
            row.createEl("span", {
              text: `출처: ${item.source_refs.join(", ")}`,
              attr: { class: "ppw-context-meta" }
            });
          }
        });
      };
      if (linkedKnowledge.length) {
        const knowledgeSection = detailPane.createEl("section", { attr: { class: "ppw-detail-section" } });
        knowledgeSection.createEl("h3", { text: "연결된 승인 지식" });
        renderKnowledgeRows(knowledgeSection, linkedKnowledge, "승인 지식 열기");
      }
      if (linkedCandidates.length) {
        const candidateSection = detailPane.createEl("section", { attr: { class: "ppw-detail-section" } });
        candidateSection.createEl("h3", { text: "연결된 지식 후보" });
        renderKnowledgeRows(candidateSection, linkedCandidates, "지식 후보 검토 열기");
        const review = btn(candidateSection, "검증 대기 열기", { primary: true });
        review.onclick = () => openKnowledgeReview(app, linkedCandidates[0]);
      }

      const contextSection = detailPane.createEl("section", { attr: { class: "ppw-detail-section" } });
      contextSection.createEl("h3", { text: "최근 맥락" });
      const context = contextSection.createDiv({ attr: { class: "ppw-detail-context" } });
      const linked = allLinked.filter((item) => !["knowledge", "knowledge_candidate", "literature_note"].includes(item.bucket));
      if (linked.length) {
        linked.forEach((item) => {
          const row = context.createEl("button", {
            text: `${item.title} · ${item.type_label || "기록"}`,
            attr: { type: "button", class: "ppw-context-item" }
          });
          row.onclick = () => openRecord(item.path);
        });
      } else {
        context.createEl("div", {
          text: "연결된 원본 기록이 없습니다.",
          attr: { class: "ppw-related-empty" }
        });
      }

      const actions = detailPane.createDiv({ attr: { class: "ppw-actions ppw-detail-actions" } });
      const edit = btn(actions, "관계 편집", { primary: true });
      edit.onclick = () => openPerson(person.path);
      const source = btn(actions, "원본 노트");
      source.onclick = () => openRecord(person.path);
      if (pendingDetailFocus && detailTitle && typeof detailTitle.focus === "function") {
        detailTitle.focus();
        pendingDetailFocus = false;
      }
    }

    function selectPerson(path, opener) {
      if (opener && typeof opener.focus === "function") {
        detailReturnFocus = opener;
        pendingDetailFocus = true;
        listReturnScrollTop = Number.isFinite(Number(listPane.scrollTop)) ? Number(listPane.scrollTop) : 0;
      }
      state.selectedPath = String(path || "");
      applyPaneVisibility();
      paintDetail(selectedPerson());
    }

    function syncFilterChips() {
      const chips = filters.querySelectorAll(".ppw-filter");
      (core.WORKSPACE_FILTERS || []).forEach((f, i) => {
        if (!chips[i]) return;
        const active = state.filter === f.id;
        chips[i].className = "ppw-filter prodigy-configurator-chip" + (active ? " is-active" : "");
        chips[i].setAttribute("aria-pressed", active ? "true" : "false");
      });
    }

    function syncSortChips() {
      const chips = sorts.querySelectorAll(".ppw-filter");
      (core.WORKSPACE_SORTS || [
        { id: "name_asc", label: "가나다 ↑" },
        { id: "name_desc", label: "가나다 ↓" }
      ]).forEach((s, i) => {
        if (!chips[i]) return;
        const active = state.sort === s.id;
        chips[i].className = "ppw-filter ppw-sort prodigy-configurator-chip" + (active ? " is-active" : "");
        chips[i].setAttribute("aria-pressed", active ? "true" : "false");
      });
    }

    // ── Dynamic paint: only rebuilds the card list, never touches search input ──
    function paint() {
      if (destroyed) return model;
      rebuildModel();

      if (state.selectedPath && !selectedPerson()) state.selectedPath = "";
      if (layout.paneMode === "two-pane" && !state.selectedPath && model.people && model.people.length) {
        state.selectedPath = model.people[0].path;
      }
      if (typeof opts.onStateChange === "function") {
        opts.onStateChange({
          query: state.query,
          filter: state.filter,
          sort: state.sort,
          selectedPath: state.selectedPath
        });
      }
      applyPaneVisibility();
      paintDetail(selectedPerson());

      // Update count text
      count.setText(model.empty
        ? ""
        : (model.no_match
          ? "일치하는 사람이 없습니다."
          : `${model.shown}명 표시 · 전체 ${model.total}명`));

      list.empty();

      if (model.empty) {
        const empty = list.createEl("div", { attr: { class: "ppw-empty" } });
        empty.createEl("div", { text: "등록된 사람이 없습니다." });
        empty.createEl("div", { text: "중요한 사람부터 한 명 추가해 보세요." });
        return model;
      }

      if (model.no_match) {
        list.createEl("div", {
          text: model.empty_hint || (core.emptyFilterHint
            ? core.emptyFilterHint(state.filter, state.query)
            : "일치하는 사람이 없습니다."),
          attr: { class: "ppw-empty" }
        });
        return model;
      }

      (model.people || []).forEach((person) => {
        const card = list.createDiv({
          attr: {
            class: `ppw-card prodigy-utility-card${person.path === state.selectedPath ? " is-selected" : ""}`,
            "data-path": person.path,
            "data-state": person.path === state.selectedPath ? "selected" : "idle",
            "aria-current": person.path === state.selectedPath ? "true" : "false"
          }
        });
        const top = card.createDiv({ attr: { class: "ppw-card-top" } });
        const left = top.createDiv({ attr: { class: "ppw-name-row" } });
        const nameEl = left.createEl("a", {
          text: person.name,
          attr: {
            class: "ppw-name",
            href: "#",
            title: "관계 맥락 열기 · 편집",
            tabindex: "0"
          }
        });
        nameEl.onclick = (e) => {
          if (e && e.preventDefault) e.preventDefault();
          selectPerson(person.path, nameEl);
        };
        nameEl.onkeydown = (e) => {
          if (e && (e.key === "Enter" || e.key === " ")) {
            e.preventDefault();
            selectPerson(person.path, nameEl);
          }
        };
        // Auction/Project card pattern: trash icon beside title
        const trashBtn = left.createEl("button", {
          text: "삭제",
          attr: {
            type: "button",
            class: "ppw-trash",
            title: "이 사람 노트를 삭제(휴지통 이동)합니다.",
            "aria-label": `${person.name} 삭제`
          }
        });
        trashBtn.onclick = (e) => {
          if (e) {
            e.stopPropagation();
            e.preventDefault();
          }
          openDeletePersonFlow(app, person.path, () => {
            if (typeof opts.onRefresh === "function") opts.onRefresh();
            else paint();
          });
        };
        if (person.is_legacy) {
          left.createEl("span", { text: "레거시", attr: { class: "ppw-badge" } });
        }

        if (person.meta_line) {
          card.createEl("div", { text: person.meta_line, attr: { class: "ppw-meta" } });
        }

        const cardModel = contextRenderer().card(person, state, core);
        card.createEl("div", { text: cardModel.subText, attr: { class: "ppw-sub" } });
        const readStatus = person.read_state && person.read_state.status;
        if (readStatus === "loading") {
          card.createEl("div", {
            text: `본문을 불러오는 중… 원본: ${person.path}`,
            attr: { class: "ppw-read-loading", role: "status", "aria-live": "polite" }
          });
        } else if (readStatus === "error") {
          const readError = card.createDiv({ attr: { class: "ppw-read-error", role: "alert" } });
          readError.createEl("span", {
            text: `본문을 읽지 못했습니다. 원본: ${person.path}`
          });
          const retry = btn(readError, "다시 읽기");
          retry.setAttribute("aria-label", `${person.name} 본문 다시 읽기`);
          retry.onclick = () => { void retryPersonRead(person.path); };
        } else if (readStatus === "empty") {
          card.createEl("div", {
            text: `본문이 비어 있습니다. 원본: ${person.path}`,
            attr: { class: "ppw-read-empty" }
          });
        }

        if (person.relationship_needs_classify) {
          card.createEl("div", {
            text: "구분이 자유 입력입니다 · 이름 클릭 후 칩으로 정리",
            attr: { class: "ppw-classify-hint" }
          });
        }

        if (person.search_match_hints && person.search_match_hints.length) {
          card.createEl("div", {
            text: `검색 일치: ${person.search_match_hints.join(" · ")}`,
            attr: { class: "ppw-search-hint" }
          });
        }

        // 사건: top 2 lines
        const eventLines = cardModel.eventLines;
        if (eventLines.length) {
          const eventBox = card.createDiv({ attr: { class: "ppw-memo ppw-events" } });
          const eventHead = eventBox.createDiv({ attr: { class: "ppw-memo-head" } });
          eventHead.createEl("div", { text: "사건", attr: { class: "ppw-memo-title" } });
          if (person.interaction_count > eventLines.length) {
            eventHead.createEl("span", {
              text: `+${person.interaction_count - eventLines.length}`,
              attr: { class: "ppw-memo-more" }
            });
          }
          const eventList = eventBox.createDiv({ attr: { class: "ppw-memo-list" } });
          eventLines.forEach((line, idx) => {
            const row = eventList.createDiv({ attr: { class: "ppw-memo-row" } });
            row.createEl("div", { text: line, attr: { class: "ppw-memo-line" } });
            const delBtn = row.createEl("button", {
              text: "×",
              attr: {
                type: "button",
                class: "ppw-memo-del",
                title: "이 사건 삭제",
                "aria-label": `사건 삭제: ${line}`
              }
            });
            delBtn.onclick = (e) => {
              if (e) {
                e.preventDefault();
                e.stopPropagation();
              }
              openRemoveInteractionFlow(app, person.path, { text: line, index: idx }, () => {
                refreshAfterEdit(person.path);
              });
            };
          });
        }

        // 메모: dashboard glance — top lines from # 메모
        const memoLines = cardModel.memoLines;
        if (memoLines.length) {
          const memoBox = card.createDiv({ attr: { class: "ppw-memo" } });
          const memoHead = memoBox.createDiv({ attr: { class: "ppw-memo-head" } });
          memoHead.createEl("div", { text: "메모", attr: { class: "ppw-memo-title" } });
          if (person.memo_count > memoLines.length) {
            memoHead.createEl("span", {
              text: `+${person.memo_count - memoLines.length}`,
              attr: { class: "ppw-memo-more", title: "이름 클릭 → 전체 메모" }
            });
          }
          const memoList = memoBox.createDiv({ attr: { class: "ppw-memo-list" } });
          memoLines.forEach((line, idx) => {
            const row = memoList.createDiv({ attr: { class: "ppw-memo-row" } });
            row.createEl("div", {
              text: line,
              attr: { class: "ppw-memo-line" }
            });
            const delBtn = row.createEl("button", {
              text: "×",
              attr: {
                type: "button",
                class: "ppw-memo-del",
                title: "이 메모 삭제",
                "aria-label": `메모 삭제: ${line}`
              }
            });
            delBtn.onclick = (e) => {
              if (e) {
                e.preventDefault();
                e.stopPropagation();
              }
              openRemoveMemoFlow(app, person.path, { text: line, index: idx }, () => {
                refreshAfterEdit(person.path);
              });
            };
          });
        }

        // 최근 맥락: top 3 always; expand + type filter for the rest
        const typeFilter = cardModel.typeFilter;
        const allLinkedRaw = cardModel.allLinkedRaw;
        const allLinked = cardModel.allLinked;
        const preview = cardModel.preview;
        const rest = cardModel.rest;
        const expanded = cardModel.expanded;

        const ctx = card.createDiv({ attr: { class: "ppw-context" } });
        const ctxHead = ctx.createDiv({ attr: { class: "ppw-context-head" } });
        ctxHead.createEl("div", { text: "최근 맥락", attr: { class: "ppw-context-title" } });
        if (allLinkedRaw.length) {
          ctxHead.createEl("span", {
            text: typeFilter === "all"
              ? `${allLinkedRaw.length}개`
              : `${allLinked.length}/${allLinkedRaw.length}`,
            attr: { class: "ppw-context-count" }
          });
        }

        if (allLinkedRaw.length > 1) {
          const typeRow = ctx.createDiv({ attr: { class: "ppw-context-types" } });
          (core.CONTEXT_TYPE_FILTERS || [{ id: "all", label: "전체" }]).forEach((tf) => {
            const chip = typeRow.createEl("button", {
              text: tf.label,
              attr: {
                type: "button",
                class: "ppw-ctx-type prodigy-configurator-chip" + (typeFilter === tf.id ? " is-active" : "")
              }
            });
            chip.onclick = (e) => {
              if (e) {
                e.preventDefault();
                e.stopPropagation();
              }
              state.contextType[person.path] = tf.id;
              state.expanded[person.path] = true;
              paint();
            };
          });
        }

        function appendContextRow(parent, item) {
          const typed = typedKnowledgeRow(item) || item;
          const row = parent.createEl("button", {
            text: contextRowLabel(typed),
            attr: {
              type: "button",
              class: "ppw-context-item",
              "aria-label": `${contextRowLabel(typed)} 열기`,
              style: "inline-size:100%;border:0;background:transparent;color:inherit;text-align:start;font:inherit;word-break:keep-all;overflow-wrap:anywhere;"
            }
          });
          applyContextMetadata(row, typed);
          row.onclick = () => openKnowledgeContext(app, typed);
          if (typed.source_refs && typed.source_refs.length) {
            row.createEl("span", {
              text: `출처: ${typed.source_refs.join(", ")}`,
              attr: { class: "ppw-context-meta" }
            });
          }
        }

        if (!allLinkedRaw.length) {
          ctx.createEl("div", {
            text: "아직 연결된 기록이 없습니다. Project나 Journal에서 이 사람을 링크하면 여기에 표시됩니다.",
            attr: { class: "ppw-related-empty" }
          });
        } else if (!allLinked.length) {
          ctx.createEl("div", {
            text: "이 유형의 연결 기록이 없습니다. 타입 칩을 「전체」로 바꿔 보세요.",
            attr: { class: "ppw-related-empty" }
          });
        } else {
          preview.forEach((item) => appendContextRow(ctx, item));
          if (expanded && rest.length) {
            const more = ctx.createDiv({ attr: { class: "ppw-context-more" } });
            rest.forEach((item) => appendContextRow(more, item));
          }
          if (rest.length) {
            const toggle = ctx.createEl("button", {
              text: expanded
                ? "접기"
                : `··· 나머지 ${rest.length}개`,
              attr: {
                type: "button",
                class: "ppw-context-toggle",
                "aria-expanded": expanded ? "true" : "false"
              }
            });
            toggle.onclick = (e) => {
              if (e) {
                e.preventDefault();
                e.stopPropagation();
              }
              state.expanded[person.path] = !expanded;
              paint();
            };
          }
        }

        const actions = card.createDiv({ attr: { class: "ppw-actions" } });

        const eventBtn = btn(actions, "사건 추가");
        eventBtn.onclick = () => openAddInteractionFlow(app, person.path, () => {
          refreshAfterEdit(person.path);
        });

        const memoBtn = btn(actions, "메모 추가");
        memoBtn.onclick = () => openAddMemoFlow(app, person.path, () => {
          refreshAfterEdit(person.path);
        });
      });

      // Scroll to focused card after add/delete
      if (state.focusPath) {
        const focusPath = state.focusPath;
        state.focusPath = "";
        events.timeout(() => {
          try {
            const el = container.querySelector(`.ppw-card[data-path="${typeof CSS !== "undefined" && CSS.escape ? CSS.escape(focusPath) : focusPath.replace(/"/g, '\\"')}"]`);
            if (el && typeof el.scrollIntoView === "function") {
              el.scrollIntoView({ block: "nearest", behavior: preferredScrollBehavior() });
              el.classList.add("ppw-card-flash");
              events.timeout(() => el.classList.remove("ppw-card-flash"), 1200);
            }
          } catch (_e) { /* ignore */ }
        }, 40);
      }

      return model;
    }

    paint();
    // Render the shell first; model notifications paint loading before each awaited read settles.
    const hydrationReady = hydratePeopleBodies().catch(() => false);

    let resizeObserver = null;
    if (!hasExplicitLogicalWidth && typeof root.ResizeObserver === "function") {
      resizeObserver = events.observe(root.ResizeObserver, container, (entries) => {
        const width = entries && entries[0] && entries[0].contentRect
          ? Number(entries[0].contentRect.width)
          : Number(container.clientWidth || 0);
        const next = resolvePeoplePaneLayout(width);
        if (next.tier === layout.tier) return;
        layout = next;
        paint();
      });
    }

    return {
      paint,
      selectPerson,
      setData: (nextRawPeople, nextSourcePages) => {
        workspaceModel.setData(nextRawPeople, nextSourcePages);
        paint();
      },
      getState: () => state,
      getModel: () => model,
      getLayout: () => layout,
      hydrationReady,
      retryPersonRead,
      destroy: () => {
        if (destroyed) return;
        destroyed = true;
        events.dispose();
        resizeObserver = null;
      }
    };
  }

  const api = {
    openPath,
    openBeside,
    openPersonPreview,
    createAndOpen,
    openCreateFlow,
    openPeopleFinder,
    openQuickEditFlow,
    openAddInteractionFlow,
    openAddMemoFlow,
    openRemoveMemoFlow,
    openRemoveInteractionFlow,
    openDeletePersonFlow,
    resolvePeoplePaneLayout,
    renderPeopleWorkspace,
    typedKnowledgeRow,
    openKnowledgeContext,
    ensureWorkspaceStyles
  };

  root.PeopleView = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
