(function () {
  const workflow = () => window.prodigySiteVisit;
  const display = () => window.prodigyDisplay;
  const notify = (message) => new Notice(message);
  const MAX_PHOTOS = 50;
  const MAX_UPLOAD_BYTES = 100 * 1024 * 1024;
  const today = () => {
    const date = new Date();
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  };
  const safeName = (value) => String(value || "case").replace(/[^\w가-힣-]+/g, "-").replace(/^-+|-+$/g, "") || "case";
  const objectSubtitle = (page) => `${display().property("case_number")}: ${page.case_number || page.file.name} · ${display().property("property_type")}: ${page.property_type || "미지정"}`;
  const indexStore = () => window.AuctionSiteVisitIndex;

  const hasImageSignature = (bytes, type) => {
    const startsWith = (...signature) => signature.every((value, index) => bytes[index] === value);
    if (type === "image/jpeg") return startsWith(0xff, 0xd8, 0xff);
    if (type === "image/png") return startsWith(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a);
    if (type === "image/gif") return String.fromCharCode(...bytes.slice(0, 6)) === "GIF87a" || String.fromCharCode(...bytes.slice(0, 6)) === "GIF89a";
    if (type === "image/webp") return String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" && String.fromCharCode(...bytes.slice(8, 12)) === "WEBP";
    if (type === "image/heic" || type === "image/heif") {
      const brand = String.fromCharCode(...bytes.slice(8, 12));
      return String.fromCharCode(...bytes.slice(4, 8)) === "ftyp" && ["heic", "heix", "hevc", "hevx", "mif1", "msf1"].includes(brand);
    }
    return false;
  };

  const ensureFolder = async (path) => {
    let current = "";
    for (const part of path.split("/")) {
      current = current ? `${current}/${part}` : part;
      if (!app.vault.getAbstractFileByPath(current)) await app.vault.createFolder(current);
    }
  };

  const savePhoto = async (sourcePath, photo) => {
    const folder = `PARA/PROJECTS/Auction/_site-visit/${safeName(sourcePath.split("/").pop().replace(/\.md$/i, ""))}`;
    await ensureFolder(folder);
    const extensions = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif", "image/heic": "heic", "image/heif": "heif" };
    const extension = extensions[photo.type];
    if (!extension) throw new Error("지원하지 않는 이미지 형식입니다.");
    if (photo.size > 20 * 1024 * 1024) throw new Error("사진은 20MB 이하만 추가할 수 있습니다.");
    const buffer = await photo.arrayBuffer();
    if (!hasImageSignature(new Uint8Array(buffer), photo.type)) throw new Error("이미지 파일 내용이 올바르지 않습니다.");
    const base = `${Date.now()}-${safeName(photo.name.replace(/\.[^.]+$/, ""))}`;
    let target = `${folder}/${base}.${extension}`;
    let suffix = 1;
    while (app.vault.getAbstractFileByPath(target)) target = `${folder}/${base}-${suffix++}.${extension}`;
    await app.vault.createBinary(target, buffer);
    return target;
  };

  class SiteVisitModal extends window.obsidian.Modal {
    constructor(appInstance, page) {
      super(appInstance);
      this.page = page;
      this.file = app.vault.getAbstractFileByPath(page.file.path);
      this.dashboardLeaf = app.workspace.getMostRecentLeaf();
      this.state = null;
      this.saveChain = Promise.resolve();
      this.noteInput = null;
      this.unexpectedInput = null;
      this.managementNameInput = null;
      this.managementPhoneInput = null;
      this.managementNoteInput = null;
      this.progressEl = null;
    }

    async onOpen() {
      this.contentEl.empty();
      this.contentEl.addClass("prodigy-site-visit-modal");
      this.contentEl.createEl("h2", { text: "현장 방문 체크리스트" });
      this.contentEl.createEl("p", { text: objectSubtitle(this.page), attr: { style: "color: var(--text-muted); margin-top: -8px;" } });
      try {
        this.state = await workflow().readFileState(this.file, this.page.property_type);
      } catch (error) {
        notify(error.message);
        this.close();
        return;
      }
      this.render();
    }

    async syncIndex() {
      const store = indexStore();
      if (!store || typeof store.syncRecord !== "function") return null;
      try {
        return await store.syncRecord(this.app, this.page, this.state, this.file && this.file.stat || {});
      } catch (error) {
        notify(`지역 현장 기록 인덱스 갱신 실패: ${error.message}`);
        return null;
      }
    }

    async persist() {
      const nextSave = this.saveChain.catch(() => {}).then(() => workflow().saveState(this.file, this.state));
      this.saveChain = nextSave;
      try {
        await nextSave;
        const record = await this.syncIndex();
        window.prodigySiteVisitStateByPath = window.prodigySiteVisitStateByPath || {};
        window.prodigySiteVisitStateByPath[this.file.path] = this.state;
        window.prodigySiteVisitSummaryByPath = window.prodigySiteVisitSummaryByPath || {};
        if (record) window.prodigySiteVisitSummaryByPath[this.file.path] = record;
        else delete window.prodigySiteVisitSummaryByPath[this.file.path];
        window.dispatchEvent(new CustomEvent("prodigy-site-visit-updated", { detail: { path: this.file.path, state: this.state, record } }));
      } catch (error) {
        notify(`현장 방문 저장 실패: ${error.message}`);
        throw error;
      }
    }

    render() {
      this.contentEl.empty();
      this.sectionEls = {};
      this.contentEl.createEl("h2", { text: "현장 기록" });
      this.contentEl.createEl("p", { text: objectSubtitle(this.page), attr: { style: "color: var(--text-muted); margin-top: -8px;" } });
      this.renderTextArea("현장에서 확인한 내용", "본 것과 들은 것을 한 줄씩 가볍게 기록하세요.", "notes");
      this.renderManagementContact();
      const progress = workflow().progress(this.state);
      this.contentEl.createEl("div", {
        text: `확인한 항목 ${progress.done}개 · 체크하지 않은 항목은 미평가로 남습니다.`,
        attr: { role: "status", "aria-live": "polite", style: "color: var(--text-muted); margin: 10px 0;" }
      });
      const navigation = this.contentEl.createEl("div", { attr: { style: "display: flex; gap: 6px; flex-wrap: wrap; margin-bottom: 12px;" } });
      this.button(navigation, "현장 방문 열기", () => this.openObjectSection(["현장 방문", "임장", "Site Visit", "Site Visit Report"]));
      this.button(navigation, "사진 열기", () => this.scrollToPopupSection("photos"));
      this.button(navigation, "예상 밖 발견 열기", () => this.scrollToPopupSection("unexpected"));
      const type = workflow().normalizeType(this.page.property_type);
      const priorityItems = workflow().priorityItemsFor(this.page.property_type);
      const allItems = [...workflow().commonItems, ...(workflow().specificItems[type] || [])];
      const additionalItems = allItems.filter((item) => !priorityItems.includes(item));
      this.renderChecklist(`${this.page.property_type || "물건"} 우선 확인`, priorityItems, true);
      this.renderChecklist("추가 확인 항목", additionalItems, false);
      this.renderTextArea("예상 밖 발견", "예상하지 못한 관찰을 기록하세요.", "unexpected");
      this.renderPhotos();
      const footer = this.contentEl.createEl("div", { attr: { style: "display: flex; gap: 8px; justify-content: flex-end; margin-top: 18px; flex-wrap: wrap;" } });
      this.button(footer, "작성 중 저장", () => this.saveAndClose());
      this.button(footer, "현장 기록 저장", () => this.finish(), true);
    }

    renderChecklist(title, items, open) {
      const section = this.contentEl.createEl("details", { attr: { style: "margin: 14px 0;" } });
      section.open = Boolean(open);
      section.createEl("summary", { text: title, attr: { style: "font-size: 1em; font-weight: 700; min-height: 44px; cursor: pointer;" } });
      if (!items.length) {
        section.createEl("p", { text: "물건 유형이 지정되지 않아 공통 항목만 표시합니다.", attr: { style: "color: var(--text-muted); font-size: 0.85em; margin: 6px 0;" } });
        return;
      }
      if (!this.state.checklistNotes || typeof this.state.checklistNotes !== "object") {
        this.state.checklistNotes = {};
      }
      const ratings = [
        ["unset", "미평가"],
        ["high", "상"],
        ["medium", "중"],
        ["low", "하"],
        ["na", "관계없음"]
      ];
      for (const label of items) {
        const block = section.createEl("fieldset", {
          attr: {
            style: "padding: 8px 0; border: 0; border-bottom: 1px solid var(--background-modifier-border); margin: 0;"
          }
        });
        block.createEl("legend", {
          text: workflow().labelFor(label),
          attr: { style: "font-size: 0.9em; font-weight: 650; padding: 0;" }
        });
        const controls = block.createEl("div", {
          attr: {
            style: "display: grid; grid-template-columns: repeat(auto-fit, minmax(72px, 1fr)); gap: 4px; margin-top: 6px;"
          }
        });
        const current = workflow().normalizeRating
          ? workflow().normalizeRating(this.state.checklist[label])
          : this.state.checklist[label];
        ratings.forEach(([value, text]) => {
          const option = controls.createEl("label", {
            attr: { style: "display:flex;align-items:center;justify-content:center;gap:6px;min-height:44px;border:1px solid var(--background-modifier-border);border-radius:8px;cursor:pointer;" }
          });
          const input = option.createEl("input", {
            attr: {
              type: "radio",
              name: `site-visit-${safeName(this.file.path)}-${safeName(label)}`,
              value,
              "aria-label": `${workflow().labelFor(label)}: ${text}`
            }
          });
          input.checked = current === value;
          input.onchange = async () => {
            if (!input.checked) return;
            this.captureText();
            this.state.checklist[label] = value;
            try { await this.persist(); } catch (_) {}
          };
          option.createEl("span", { text });
        });
        const memoLabel = block.createEl("label", {
          text: `${workflow().labelFor(label)} 메모`,
          attr: { style: "display:block;margin-top:6px;font-size:0.78em;color:var(--text-muted);" }
        });
        const memo = memoLabel.createEl("input", {
          attr: {
            type: "text",
            placeholder: "한 줄 메모 (선택)",
            "aria-label": `${workflow().labelFor(label)} 한 줄 메모`,
            style: "width: 100%; margin-top: 6px; padding: 6px 8px; border-radius: 6px; border: 1px solid var(--background-modifier-border); background: var(--background-primary); color: var(--text-normal); font-size: 0.84em; box-sizing: border-box;"
          }
        });
        memo.value = String((this.state.checklistNotes && this.state.checklistNotes[label]) || "");
        memo.oninput = () => {
          if (!this.state.checklistNotes) this.state.checklistNotes = {};
          this.state.checklistNotes[label] = memo.value;
        };
        memo.onblur = async () => {
          this.captureText();
          if (!this.state.checklistNotes) this.state.checklistNotes = {};
          this.state.checklistNotes[label] = String(memo.value || "").trim();
          try { await this.persist(); } catch (_) {}
        };
      }
    }

    async openObjectSection(candidates) {
      const content = await this.app.vault.read(this.file);
      const availableHeadings = new Set(
        content.split("\n")
          .map((line) => line.match(/^#{1,6}\s+(.+?)\s*$/)?.[1])
          .filter(Boolean)
      );
      const heading = candidates.find((candidate) => availableHeadings.has(candidate));
      if (!heading) {
        notify("이동할 섹션을 찾지 못했습니다.");
        return;
      }
      const dashboardLeaf = this.dashboardLeaf;
      if (!dashboardLeaf) {
        await this.app.workspace.openLinkText(`${this.file.basename}#${heading}`, this.file.path, "split");
        return;
      }
      const rightLeaf = this.app.workspace.createLeafBySplit(dashboardLeaf, "vertical", false);
      await rightLeaf.openFile(this.file, { active: true });
      this.app.workspace.setActiveLeaf(rightLeaf, { focus: true });
      await this.app.workspace.openLinkText(`${this.file.basename}#${heading}`, this.file.path, false);
      this.close();
    }

    scrollToPopupSection(key) {
      const section = this.sectionEls[key];
      if (!section) {
        notify("팝업 안에서 이동할 영역을 찾지 못했습니다.");
        return;
      }
      section.scrollIntoView({ behavior: "smooth", block: "start" });
      if (key === "unexpected") this.unexpectedInput?.focus();
    }

    async saveAndClose() {
      this.state.notes = String(this.noteInput?.value || "").split("\n").map((value) => value.trim()).filter(Boolean);
      this.state.unexpected = String(this.unexpectedInput?.value || "").split("\n").map((value) => value.trim()).filter(Boolean);
      await this.persist();
      notify("현장 방문 진행 내용이 저장되었습니다.");
      this.close();
    }

    renderManagementContact() {
      const contact = workflow().normalizeManagementContact(this.state.managementContact);
      const section = this.contentEl.createEl("section", { attr: { style: "margin-top: 14px;" } });
      section.createEl("h3", { text: "관리사무소 연락처", attr: { style: "font-size: 1em; margin-bottom: 6px;" } });
      const fields = [
        ["name", "담당자·역할", "예: 관리소장 이종면", "text"],
        ["phone", "전화번호", "예: 051-000-0000", "tel"],
        ["note", "연락 메모", "예: 평일 연락", "text"]
      ];
      fields.forEach(([key, labelText, placeholder, type]) => {
        const label = section.createEl("label", { text: labelText, attr: { style: "display:block;margin-top:6px;font-size:0.82em;color:var(--text-muted);" } });
        const input = label.createEl("input", {
          attr: {
            type,
            placeholder,
            "aria-label": `관리사무소 ${labelText}`,
            style: "display:block;width:100%;min-height:44px;margin-top:4px;padding:6px 8px;box-sizing:border-box;"
          }
        });
        input.value = contact[key] || "";
        if (key === "name") this.managementNameInput = input;
        if (key === "phone") this.managementPhoneInput = input;
        if (key === "note") this.managementNoteInput = input;
      });
    }

    renderTextArea(title, placeholder, key) {
      const section = this.contentEl.createEl("div", { attr: { style: "margin-top: 14px;" } });
      if (key === "unexpected") this.sectionEls.unexpected = section;
      section.createEl("h3", { text: title, attr: { style: "font-size: 1em; margin-bottom: 6px;" } });
      const input = section.createEl("textarea", { attr: { placeholder, rows: "3", "aria-label": title, style: "width: 100%; resize: vertical;" } });
      input.value = (this.state[key] || []).join("\n");
      input.oninput = () => { this.state[key] = input.value.split("\n").map((value) => value.trim()).filter(Boolean); };
      if (key === "notes") this.noteInput = input;
      if (key === "unexpected") this.unexpectedInput = input;
    }

    renderPhotos() {
      const section = this.contentEl.createEl("div", { attr: { style: "margin-top: 14px;" } });
      this.sectionEls.photos = section;
      section.createEl("h3", { text: "사진", attr: { style: "font-size: 1em; margin-bottom: 6px;" } });
      const input = section.createEl("input", { attr: { type: "file", accept: "image/*", multiple: "true", "aria-label": "현장 사진 추가" } });
      input.onchange = async () => {
        this.captureText();
        const selected = Array.from(input.files || []);
        if (this.state.photos.length + selected.length > MAX_PHOTOS) {
          notify(`사진은 현장 방문당 최대 ${MAX_PHOTOS}개까지 추가할 수 있습니다.`);
          return;
        }
        if (selected.reduce((total, photo) => total + photo.size, 0) > MAX_UPLOAD_BYTES) {
          notify("한 번에 추가하는 사진은 합계 100MB 이하여야 합니다.");
          return;
        }
        const savedPaths = [];
        for (const photo of selected) {
          try {
            const path = await savePhoto(this.page.file.path, photo);
            this.state.photos.push(path);
            savedPaths.push(path);
          }
          catch (error) { notify(`사진 저장 실패: ${error.message}`); }
        }
        try {
          await this.persist();
          this.render();
        } catch (_) {
          this.state.photos = this.state.photos.filter((path) => !savedPaths.includes(path));
          for (const path of savedPaths) {
            const savedFile = app.vault.getAbstractFileByPath(path);
            if (savedFile) {
              try { await app.vault.delete(savedFile, true); } catch (_) {}
            }
          }
        }
      };
      if (this.state.photos.length) section.createEl("p", { text: `사진 ${this.state.photos.length}개가 추가되었습니다.`, attr: { style: "color: var(--text-muted); font-size: 0.85em;" } });
    }

    button(parent, text, onClick, primary = false) {
      const button = parent.createEl("button", { text, attr: { style: `padding: 5px 8px; border-radius: 5px; border: 1px solid ${primary ? "var(--ke-color-accent, var(--text-accent))" : "var(--background-modifier-border)"}; background: ${primary ? "var(--ke-color-accent, var(--text-accent))" : "var(--background-secondary)"}; color: ${primary ? "var(--text-on-accent, white)" : "var(--text-normal)"}; cursor: pointer; font-size: 0.8em;` } });
      button.onclick = onClick;
      return button;
    }

    async finish() {
      this.state.notes = String(this.noteInput?.value || "").split("\n").map((value) => value.trim()).filter(Boolean);
      this.state.unexpected = String(this.unexpectedInput?.value || "").split("\n").map((value) => value.trim()).filter(Boolean);
      if (!workflow().hasMeaningfulEvidence(this.state)) {
        notify("메모, 확인 항목, 사진 중 하나 이상을 기록해주세요.");
        return;
      }
      this.state.finishedAt = new Date().toISOString();
      const labels = Object.fromEntries([...workflow().commonItems, ...Object.values(workflow().specificItems).flat()].map((value) => [value, workflow().labelFor(value)]));
      const report = workflow().buildReport(this.state, labels, today());
      const completeSave = this.saveChain.catch(() => {}).then(async () => {
        const content = await app.vault.read(this.file);
        await app.vault.modify(this.file, workflow().completeVisitInContent(content, this.state, report));
        return this.syncIndex();
      });
      this.saveChain = completeSave;
      try {
        const record = await completeSave;
        window.prodigySiteVisitSummaryByPath = window.prodigySiteVisitSummaryByPath || {};
        if (record) window.prodigySiteVisitSummaryByPath[this.file.path] = record;
      } catch (error) {
        notify(`현장 방문 완료 저장 실패: ${error.message}`);
        return;
      }
      window.prodigySiteVisitStateByPath = window.prodigySiteVisitStateByPath || {};
      window.prodigySiteVisitStateByPath[this.file.path] = this.state;
      window.dispatchEvent(new CustomEvent("prodigy-site-visit-updated", {
        detail: { path: this.file.path, state: this.state, record: window.prodigySiteVisitSummaryByPath?.[this.file.path] || null }
      }));
      notify("현장 방문 요약이 현장 방문 섹션에 저장되었습니다.");
      this.close();
    }

    captureText() {
      this.state.notes = String(this.noteInput?.value || "").split("\n").map((value) => value.trim()).filter(Boolean);
      this.state.unexpected = String(this.unexpectedInput?.value || "").split("\n").map((value) => value.trim()).filter(Boolean);
      this.state.managementContact = workflow().normalizeManagementContact({
        name: this.managementNameInput?.value,
        phone: this.managementPhoneInput?.value,
        note: this.managementNoteInput?.value
      });
      // Per-item memos are bound on the live inputs; ensure object exists
      if (!this.state.checklistNotes || typeof this.state.checklistNotes !== "object") {
        this.state.checklistNotes = {};
      }
    }

    onClose() { this.contentEl.empty(); }
  }

  window.openAuctionSiteVisit = (page) => new SiteVisitModal(window.app, page).open();
  window.prodigySiteVisitStateByPath = window.prodigySiteVisitStateByPath || {};
  window.prodigySiteVisitSummaryByPath = window.prodigySiteVisitSummaryByPath || {};
  const initialIndex = window.AuctionSiteVisitIndex;
  window.prodigySiteVisitReady = initialIndex && typeof initialIndex.readIndex === "function"
    ? initialIndex.readIndex(app).then((index) => {
        window.prodigySiteVisitSummaryByPath = { ...(index.records || {}) };
        return Object.keys(window.prodigySiteVisitSummaryByPath);
      }).catch((error) => {
        console.error("Auction site visit index load failed:", error);
        return [];
      })
    : Promise.resolve([]);
})();
