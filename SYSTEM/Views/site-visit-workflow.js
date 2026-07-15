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
      try {
        await this.persist();
      } catch (_) {
        this.close();
        return;
      }
      this.render();
    }

    async persist() {
      const nextSave = this.saveChain.catch(() => {}).then(() => workflow().saveState(this.file, this.state));
      this.saveChain = nextSave;
      try {
        await nextSave;
        window.prodigySiteVisitStateByPath = window.prodigySiteVisitStateByPath || {};
        window.prodigySiteVisitStateByPath[this.file.path] = this.state;
        window.dispatchEvent(new CustomEvent("prodigy-site-visit-updated", { detail: { path: this.file.path, state: this.state } }));
      } catch (error) {
        notify(`현장 방문 저장 실패: ${error.message}`);
        throw error;
      }
    }

    render() {
      this.contentEl.empty();
      this.sectionEls = {};
      this.contentEl.createEl("h2", { text: "현장 방문 체크리스트" });
      this.contentEl.createEl("p", { text: objectSubtitle(this.page), attr: { style: "color: var(--text-muted); margin-top: -8px;" } });
      const progress = workflow().progress(this.state);
      this.contentEl.createEl("div", { text: `${progress.done} / ${progress.total} 완료`, attr: { style: "font-weight: 700; color: var(--text-accent); margin-bottom: 10px;" } });
      const progressEl = this.contentEl.createEl("div", { attr: { style: "height: 6px; background: var(--background-modifier-border); border-radius: 3px; margin-bottom: 16px; overflow: hidden;" } });
      progressEl.createEl("div", { attr: { style: `height: 100%; width: ${progress.total ? (progress.done / progress.total) * 100 : 0}%; background: var(--text-accent); transition: width 160ms ease;` } });
      const navigation = this.contentEl.createEl("div", { attr: { style: "display: flex; gap: 6px; flex-wrap: wrap; margin-bottom: 12px;" } });
      this.button(navigation, "현장 방문 열기", () => this.openObjectSection(["현장 방문", "임장", "Site Visit", "Site Visit Report"]));
      this.button(navigation, "사진 열기", () => this.scrollToPopupSection("photos"));
      this.button(navigation, "예상 밖 발견 열기", () => this.scrollToPopupSection("unexpected"));
      this.renderChecklist("공통 현장 체크리스트", workflow().commonItems);
      const type = workflow().normalizeType(this.page.property_type);
      this.renderChecklist("물건 유형별 체크리스트", workflow().specificItems[type]);
      this.renderTextArea("짧은 현장 메모", "한 줄씩 짧게 기록하세요.", "notes");
      this.renderTextArea("예상 밖 발견", "예상하지 못한 관찰을 기록하세요.", "unexpected");
      this.renderPhotos();
      const footer = this.contentEl.createEl("div", { attr: { style: "display: flex; gap: 8px; justify-content: flex-end; margin-top: 18px; flex-wrap: wrap;" } });
      this.button(footer, "저장 후 닫기", () => this.saveAndClose());
      this.button(footer, "현장 방문 완료", () => this.finish(), true);
    }

    renderChecklist(title, items) {
      const section = this.contentEl.createEl("div", { attr: { style: "margin: 14px 0;" } });
      section.createEl("h3", { text: title, attr: { style: "font-size: 1em; margin-bottom: 6px;" } });
      if (!items.length) {
        section.createEl("p", { text: "물건 유형이 지정되지 않아 공통 항목만 표시합니다.", attr: { style: "color: var(--text-muted); font-size: 0.85em; margin: 6px 0;" } });
        return;
      }
      for (const label of items) {
        const row = section.createEl("div", { attr: { style: "display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 6px 0; border-bottom: 1px solid var(--background-modifier-border);" } });
        row.createEl("span", { text: workflow().labelFor(label), attr: { style: "font-size: 0.9em;" } });
        const controls = row.createEl("div", { attr: { style: "display: flex; gap: 4px; flex-shrink: 0;" } });
        [["unchecked", "미확인"], ["checked", "확인"], ["na", "해당 없음"]].forEach(([value, text]) => {
          const button = this.button(controls, text, async () => {
            this.captureText();
            this.state.checklist[label] = value;
            try {
              await this.persist();
              this.render();
            } catch (_) {}
          }, this.state.checklist[label] === value);
          button.setAttr("aria-label", `${workflow().labelFor(label)}: ${text}`);
        });
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

    renderTextArea(title, placeholder, key) {
      const section = this.contentEl.createEl("div", { attr: { style: "margin-top: 14px;" } });
      if (key === "unexpected") this.sectionEls.unexpected = section;
      section.createEl("h3", { text: title, attr: { style: "font-size: 1em; margin-bottom: 6px;" } });
      const input = section.createEl("textarea", { attr: { placeholder, rows: "3", style: "width: 100%; resize: vertical;" } });
      input.value = (this.state[key] || []).join("\n");
      input.oninput = () => { this.state[key] = input.value.split("\n").map((value) => value.trim()).filter(Boolean); };
      if (key === "notes") this.noteInput = input;
      if (key === "unexpected") this.unexpectedInput = input;
    }

    renderPhotos() {
      const section = this.contentEl.createEl("div", { attr: { style: "margin-top: 14px;" } });
      this.sectionEls.photos = section;
      section.createEl("h3", { text: "사진", attr: { style: "font-size: 1em; margin-bottom: 6px;" } });
      const input = section.createEl("input", { attr: { type: "file", accept: "image/*", multiple: "true" } });
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
      const button = parent.createEl("button", { text, attr: { style: `padding: 5px 8px; border-radius: 5px; border: 1px solid ${primary ? "var(--text-accent)" : "var(--background-modifier-border)"}; background: ${primary ? "var(--text-accent)" : "var(--background-secondary)"}; color: ${primary ? "var(--text-on-accent, white)" : "var(--text-normal)"}; cursor: pointer; font-size: 0.8em;` } });
      button.onclick = onClick;
      return button;
    }

    async finish() {
      this.state.notes = String(this.noteInput?.value || "").split("\n").map((value) => value.trim()).filter(Boolean);
      this.state.unexpected = String(this.unexpectedInput?.value || "").split("\n").map((value) => value.trim()).filter(Boolean);
      if (!workflow().isComplete(this.state)) { notify("미확인 항목을 모두 확인하거나 해당 없음으로 표시해주세요."); return; }
      this.state.finishedAt = new Date().toISOString();
      const labels = Object.fromEntries([...workflow().commonItems, ...Object.values(workflow().specificItems).flat()].map((value) => [value, workflow().labelFor(value)]));
      const report = workflow().buildReport(this.state, labels, today());
      const completeSave = this.saveChain.catch(() => {}).then(async () => {
        const content = await app.vault.read(this.file);
        await app.vault.modify(this.file, workflow().completeVisitInContent(content, this.state, report));
      });
      this.saveChain = completeSave;
      try {
        await completeSave;
      } catch (error) {
        notify(`현장 방문 완료 저장 실패: ${error.message}`);
        return;
      }
      window.prodigySiteVisitStateByPath = window.prodigySiteVisitStateByPath || {};
      window.prodigySiteVisitStateByPath[this.file.path] = this.state;
      window.dispatchEvent(new CustomEvent("prodigy-site-visit-updated", { detail: { path: this.file.path, state: this.state } }));
      notify("현장 방문 요약이 현장 방문 섹션에 저장되었습니다.");
      this.close();
    }

    captureText() {
      this.state.notes = String(this.noteInput?.value || "").split("\n").map((value) => value.trim()).filter(Boolean);
      this.state.unexpected = String(this.unexpectedInput?.value || "").split("\n").map((value) => value.trim()).filter(Boolean);
    }

    onClose() { this.contentEl.empty(); }
  }

  window.openAuctionSiteVisit = (page) => new SiteVisitModal(window.app, page).open();
  window.prodigySiteVisitStateByPath = window.prodigySiteVisitStateByPath || {};
  window.prodigySiteVisitReady = Promise.all(app.vault.getFiles().filter((file) => file.path.startsWith("PARA/PROJECTS/Auction/") && file.extension === "md").map(async (file) => {
    try {
      const storedState = workflow().readState(await app.vault.read(file));
      if (storedState) {
        const propertyType = app.metadataCache.getFileCache(file)?.frontmatter?.property_type;
        const currentState = workflow().reconcileState(storedState, propertyType);
        window.prodigySiteVisitStateByPath[file.path] = currentState;
        window.dispatchEvent(new CustomEvent("prodigy-site-visit-updated", { detail: { path: file.path, state: currentState } }));
      }
    } catch (_) { return null; }
    return file.path;
  }));
})();
