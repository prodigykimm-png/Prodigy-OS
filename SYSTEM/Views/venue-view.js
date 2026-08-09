(function (root) {
  "use strict";

  /**
   * Venue(장소) view — first-class UI matching the people experience.
   * Provides: list renderer, detail popup (preview), quick edit, delete,
   * and related-journal reverse links. Schema comes from PeopleCore; data
   * lives in VenueStore. People view functions are untouched.
   */

  function getCore() {
    return root.PeopleCore || (typeof require === "function" ? require("./people-core.js") : null);
  }
  function getStore() {
    return root.VenueStore || (typeof require === "function" ? require("./venue-store.js") : null);
  }

  function clean(value) {
    return String(value == null ? "" : value).trim();
  }

  function notice(message, timeout) {
    const Notice = root.Notice || (root.obsidian && root.obsidian.Notice);
    if (Notice) new Notice(String(message || ""), timeout || 5000);
  }

  function openPath(app, filePath) {
    const link = String(filePath || "").replace(/\.md$/i, "");
    if (app && app.workspace && typeof app.workspace.openLinkText === "function") {
      return app.workspace.openLinkText(link, "", false);
    }
    const file = app && app.vault && app.vault.getAbstractFileByPath(filePath);
    if (file && app.workspace && typeof app.workspace.getLeaf === "function") {
      return app.workspace.getLeaf(false).openFile(file);
    }
    return Promise.resolve();
  }

  function wikilinkToPath(link) {
    return String(link || "").replace(/^\[\[/, "").replace(/\]\]$/, "").split("|")[0].split("#")[0].trim();
  }

  /**
   * Reverse-index related journal links: scan DAILY/DAILY pages for outlinks /
   * connections that point at this venue. Bounded to the journal folder.
   */
  function collectRelatedJournals(app, venuePath) {
    const out = [];
    if (!app || !app.vault || typeof app.vault.getFiles !== "function") return out;
    const name = clean(venuePath).split("/").pop().replace(/\.md$/i, "");
    const files = app.vault.getFiles().filter((f) => /^DAILY\/DAILY\//.test(f.path) && /\.md$/i.test(f.path));
    files.forEach((f) => {
      let hit = false;
      try {
        const cache = app.metadataCache && typeof app.metadataCache.getFileCache === "function"
          ? app.metadataCache.getFileCache(f)
          : null;
        if (cache && cache.links) {
          hit = cache.links.some((l) => {
            const lp = clean(l && (l.path || l.link));
            return lp === name || lp.replace(/^DAILY\/DAILY\//, "") === name || lp.indexOf(name) !== -1;
          });
        }
        if (!hit && cache && cache.frontmatter && cache.frontmatter.connections) {
          const conns = Array.isArray(cache.frontmatter.connections)
            ? cache.frontmatter.connections
            : [cache.frontmatter.connections];
          hit = conns.some((c) => String(c || "").indexOf(name) !== -1);
        }
      } catch (_e) { /* skip */ }
      if (hit) out.push(f.path);
    });
    return out.sort();
  }

  function ensureVenueStyles() {
    if (typeof document === "undefined" || !document.getElementById("prodigy-venue-styles")) {
      const style = document.createElement("style");
      style.id = "prodigy-venue-styles";
      style.textContent = [
        ".ppv-venue-list{display:flex;flex-direction:column;gap:6px}",
        ".ppv-venue-row{display:flex;align-items:center;gap:10px;padding:10px 12px;border:1px solid var(--background-modifier-border);border-radius:8px;cursor:pointer}",
        ".ppv-venue-row:hover{background:var(--background-modifier-hover)}",
        ".ppv-venue-title{font-weight:700;font-size:.95em}",
        ".ppv-venue-meta{font-size:.78em;color:var(--text-muted)}",
        ".ppv-venue-actions{display:flex;gap:6px;margin-top:10px;padding-top:10px;border-top:1px solid var(--background-modifier-border)}",
        ".ppv-venue-chip{display:inline-block;padding:2px 8px;border-radius:10px;background:var(--background-modifier-hover);font-size:.76em;margin:2px 4px 0 0}",
        ".ppv-venue-section{margin:10px 0}",
        ".ppv-venue-section-label{font-size:.8em;font-weight:700;color:var(--text-muted);margin-bottom:4px}",
        ".ppv-venue-section-body{font-size:.9em;white-space:pre-wrap;color:var(--text-normal)}",
        ".ppv-venue-empty{color:var(--text-muted);font-size:.85em}"
      ].join("\n");
      document.head.appendChild(style);
    }
  }

  /**
   * Detail popup — properties + editable sections + connections + related journals.
   */
  async function openVenuePreview(app, path, onChanged) {
    const host = app || root.app || (typeof window !== "undefined" ? window.app : null);
    const store = getStore();
    const c = getCore();
    if (!host || !store || !c) {
      notice("Venue 모듈을 불러오지 못했습니다.");
      return null;
    }
    let model;
    try {
      model = await store.buildVenuePreviewModel(host, path);
    } catch (error) {
      notice(error.message || String(error), 9000);
      return null;
    }
    const Modal = root.obsidian && root.obsidian.Modal;
    if (!Modal) {
      await openPath(host, model.path);
      return model;
    }
    ensureVenueStyles();
    if (root.ProdigyUI) root.ProdigyUI.ensureStyles();

    const editableSections = ["소개", "방문 정보", "메모"];

    return new Promise((resolve) => {
      class VenuePreviewModal extends Modal {
        constructor(appInstance, m) {
          super(appInstance);
          this.model = m;
          this.busy = false;
          this.values = Object.assign({}, m.properties || {});
          this.sectionValues = Object.create(null);
          ((m.sections || []).forEach((s) => {
            this.sectionValues[s.title] = String(s.bodyText != null ? s.bodyText : "");
          }));
        }
        onOpen() {
          const { contentEl } = this;
          contentEl.empty();
          contentEl.addClass("prodigy-venue-preview");
          contentEl.createEl("h2", { text: this.model.title, attr: { style: "margin:0 0 4px;font-size:1.2em;" } });
          contentEl.createEl("div", {
            text: `type: venue · ${this.values.venue_category || "분류 없음"}`,
            attr: { style: "font-size:.8em;color:var(--text-muted);margin-bottom:10px;" }
          });

          // Properties
          const propsEl = contentEl.createDiv();
          this.renderPropertyRow(propsEl, "주소", this.values.address);
          this.renderPropertyRow(propsEl, "연결", this.values.connections);

          // Editable body sections
          editableSections.forEach((title) => {
            const raw = String(this.sectionValues[title] || "");
            const block = contentEl.createDiv({ attr: { class: "ppv-venue-section" } });
            block.createEl("div", { text: title, attr: { class: "ppv-venue-section-label" } });
            const ta = block.createEl("textarea", {
              text: raw,
              attr: {
                rows: title === "메모" ? 5 : 3,
                style: "width:100%;box-sizing:border-box;min-height:60px;padding:6px 8px;border:1px solid var(--background-modifier-border);border-radius:4px;background:var(--background-primary);color:var(--text-normal);font:inherit;"
              }
            });
            ta.oninput = () => { this.sectionValues[title] = ta.value; this.dirty = true; };
          });

          // Related journals (reverse links)
          const rel = contentEl.createDiv({ attr: { class: "ppv-venue-section" } });
          rel.createEl("div", { text: "관련 저널", attr: { class: "ppv-venue-section-label" } });
          const relList = rel.createDiv({ attr: { class: "ppv-venue-section-body" } });
          const journals = collectRelatedJournals(this.app, this.model.path);
          if (journals.length) {
            journals.forEach((jp) => {
              const row = relList.createDiv({ attr: { style: "margin:2px 0;" } });
              const btn = row.createEl("button", {
                text: jp.replace(/\.md$/i, ""),
                attr: { type: "button", style: "background:none;border:none;color:var(--text-accent);cursor:pointer;padding:0;text-align:left;" }
              });
              btn.onclick = () => openPath(this.app, jp);
            });
          } else {
            relList.createEl("div", { text: "연결된 저널이 없습니다.", attr: { class: "ppv-venue-empty" } });
          }

          // Footer actions
          const footer = contentEl.createDiv({ attr: { class: "ppv-venue-actions" } });
          const qe = footer.createEl("button", { text: "빠른 수정", attr: { type: "button" } });
          qe.onclick = () => {
            this.close();
            openVenueQuickEdit(this.app, this.model.path, (res) => {
              if (res && typeof onChanged === "function") onChanged(res);
            });
            resolve(this.model);
          };
          const del = footer.createEl("button", {
            text: "삭제",
            attr: { type: "button", style: "background:var(--text-error);color:var(--text-on-accent);border-color:var(--text-error);" }
          });
          del.onclick = () => {
            this.close();
            openDeleteVenueFlow(this.app, this.model.path, (res) => {
              if (res && typeof onChanged === "function") onChanged(res);
            });
            resolve(this.model);
          };
          const openNote = footer.createEl("button", { text: "원본 노트", attr: { type: "button" } });
          openNote.onclick = () => { this.close(); openPath(this.app, this.model.path); resolve(this.model); };
          const save = footer.createEl("button", { text: "저장", attr: { type: "button", class: "mod-cta" } });
          save.onclick = () => this.save();
          this.statusEl = contentEl.createEl("div", {
            text: "",
            attr: { style: "margin-top:8px;font-size:.8em;color:var(--text-muted);" }
          });
        }
        renderPropertyRow(parent, label, value) {
          const row = parent.createDiv({ attr: { style: "display:flex;gap:8px;font-size:.85em;margin:2px 0;" } });
          row.createEl("span", { text: `${label}:`, attr: { style: "color:var(--text-muted);min-width:44px;" } });
          row.createEl("span", { text: Array.isArray(value) ? value.join(" · ") : String(value || "—") });
        }
        async save() {
          if (this.busy) return;
          this.busy = true;
          this.statusEl.setText("저장 중...");
          try {
            const target = this.app;
            const store = getStore();
            // 1) quick-edit properties
            const propPatch = {};
            Object.keys(this.values).forEach((k) => {
              if (k === "venue_category" || k === "address") propPatch[k] = this.values[k];
            });
            if (Object.keys(propPatch).length) {
              await store.updateVenueProperties(target, this.model.path, propPatch);
            }
            // 2) editable body sections
            const content = await this.app.vault.read(this.app.vault.getAbstractFileByPath(this.model.path));
            let next = content;
            editableSections.forEach((title) => {
              const bodyText = String(this.sectionValues[title] || "").trim();
              next = replaceSectionBody(next, title, bodyText);
            });
            if (next !== content) {
              await this.app.vault.modify(this.app.vault.getAbstractFileByPath(this.model.path), next);
            }
            notice("장소를 저장했습니다.");
            if (typeof onChanged === "function") onChanged({ path: this.model.path });
            this.close();
            resolve(this.model);
          } catch (error) {
            this.statusEl.setText(error.message || String(error));
            this.statusEl.style.color = "var(--text-error)";
            this.busy = false;
          }
        }
        onClose() {
          if (this.contentEl && typeof this.contentEl.empty === "function") this.contentEl.empty();
        }
      }

      function replaceSectionBody(content, title, newBody) {
        const re = new RegExp(`(^## ${title}\\s*$)([\\s\\S]*?)(?=^## |$)`, "m");
        const block = newBody ? `\n${newBody}\n` : "\n";
        if (re.test(content)) return content.replace(re, `$1${block}`);
        return content;
      }

      new VenuePreviewModal(host, model).open();
    });
  }

  /**
   * Quick edit — venue_category / address / connections.
   */
  function openVenueQuickEdit(app, path, onSaved) {
    const host = app || root.app || (typeof window !== "undefined" ? window.app : null);
    const store = getStore();
    if (!host || !store) { notice("Venue 모듈을 불러오지 못했습니다."); return null; }
    const Modal = root.obsidian && root.obsidian.Modal;
    if (!Modal) { notice("Obsidian Modal을 사용할 수 없습니다."); return null; }

    store.readVenueProperties(host, path).then((props) => {
      return new Promise((resolve) => {
        class VenueQuickEditModal extends Modal {
          constructor(ai, p) {
            super(ai);
            this.props = p;
            this.busy = false;
            this.form = {
              venue_category: p.values.venue_category || "",
              address: p.values.address || "",
              connections: (p.values.connections || []).join(", ")
            };
          }
          onOpen() {
            const { contentEl } = this;
            contentEl.empty();
            contentEl.createEl("h2", { text: `장소 빠른 수정 — ${this.props.title}`, attr: { style: "margin:0 0 12px;font-size:1.1em;" } });
            const formEl = contentEl.createDiv({ attr: { style: "display:grid;gap:8px;" } });
            this.field(formEl, "분류", "venue_category", "예: cafe, gym", false);
            this.field(formEl, "주소", "address", "선택", false);
            this.field(formEl, "연결", "connections", "저널/지식 wikilink, 콤마 구분", false);
            const footer = contentEl.createDiv({ attr: { style: "display:flex;justify-content:flex-end;gap:8px;margin-top:12px;" } });
            footer.createEl("button", { text: "취소" }).onclick = () => { this.close(); resolve(null); };
            const save = footer.createEl("button", { text: "저장", cls: "mod-cta" });
            save.onclick = () => this.save();
            this.statusEl = contentEl.createEl("div", { text: "", attr: { style: "margin-top:8px;font-size:.8em;color:var(--text-muted);" } });
          }
          field(parent, label, key, placeholder, required) {
            const wrap = parent.createEl("label", { attr: { style: "display:grid;gap:3px;" } });
            wrap.createEl("span", { text: `${label}${required ? " (필수)" : ""}`, attr: { style: "font-size:.8em;font-weight:700;" } });
            const input = wrap.createEl("input", {
              attr: {
                value: this.form[key] || "",
                placeholder,
                style: "width:100%;box-sizing:border-box;min-height:34px;padding:6px 8px;border:1px solid var(--background-modifier-border);border-radius:4px;background:var(--background-primary);color:var(--text-normal);"
              }
            });
            input.oninput = () => { this.form[key] = input.value; };
          }
          async save() {
            if (this.busy) return;
            this.busy = true;
            this.statusEl.setText("저장 중...");
            try {
              const connections = String(this.form.connections || "")
                .split(",").map((x) => { const t = clean(x); return t ? `[[${t}]]` : ""; }).filter(Boolean);
              const patch = {
                venue_category: clean(this.form.venue_category),
                address: clean(this.form.address),
                connections
              };
              const result = await store.updateVenueProperties(host, path, patch);
              notice("장소를 수정했습니다.");
              if (typeof onSaved === "function") onSaved(result);
              this.close();
              resolve(result);
            } catch (error) {
              this.statusEl.setText(error.message || String(error));
              this.statusEl.style.color = "var(--text-error)";
              this.busy = false;
            }
          }
          onClose() { if (this.contentEl && typeof this.contentEl.empty === "function") this.contentEl.empty(); }
        }
        new VenueQuickEditModal(host, props).open();
      });
    });
  }

  /**
   * Delete venue (system trash).
   */
  function openDeleteVenueFlow(app, path, onDeleted) {
    const host = app || root.app || (typeof window !== "undefined" ? window.app : null);
    const store = getStore();
    if (!host || !store) { notice("Venue 모듈을 불러오지 못했습니다."); return null; }
    const name = String(path || "").split("/").pop().replace(/\.md$/i, "") || "이 장소";
    const Modal = root.obsidian && root.obsidian.Modal;
    if (!Modal) {
      const ok = typeof window !== "undefined" && window.confirm
        ? window.confirm(`「${name}」 장소 Object를 삭제할까요?\n휴지통으로 이동합니다.`)
        : false;
      if (!ok) return null;
      store.deleteVenue(host, path).then((r) => {
        notice(`삭제했습니다: ${name}`);
        if (typeof onDeleted === "function") onDeleted(r);
      }).catch((e) => notice(e.message || String(e), 9000));
      return null;
    }
    return new Promise((resolve) => {
      class VenueDeleteModal extends Modal {
        constructor(ai) { super(ai); this.busy = false; }
        onOpen() {
          const { contentEl } = this;
          contentEl.empty();
          contentEl.createEl("h2", { text: "장소 삭제", attr: { style: "margin:0 0 8px;font-size:1.15em;" } });
          contentEl.createEl("p", { text: `「${name}」 장소 Object를 삭제할까요?`, attr: { style: "font-size:.95em;margin:0 0 8px;font-weight:700;" } });
          contentEl.createEl("p", { text: "노트 파일은 휴지통으로 이동합니다.", attr: { style: "font-size:.82em;color:var(--text-muted);margin:0 0 14px;" } });
          const footer = contentEl.createDiv({ attr: { style: "display:flex;justify-content:flex-end;gap:8px;" } });
          footer.createEl("button", { text: "취소" }).onclick = () => { this.close(); resolve(null); };
          const del = footer.createEl("button", {
            text: "삭제",
            attr: { style: "background:var(--text-error);color:var(--text-on-accent);border-color:var(--text-error);" }
          });
          del.onclick = () => this.submit();
          this.statusEl = contentEl.createEl("div", { text: "", attr: { style: "margin-top:10px;font-size:.8em;color:var(--text-muted);" } });
        }
        async submit() {
          if (this.busy) return;
          this.busy = true;
          this.statusEl.setText("삭제 중...");
          try {
            const result = await store.deleteVenue(this.app, path);
            notice(`삭제했습니다: ${name}`);
            if (typeof onDeleted === "function") onDeleted(result);
            this.close();
            resolve(result);
          } catch (error) {
            this.statusEl.setText(error.message || String(error));
            this.statusEl.style.color = "var(--text-error)";
            this.busy = false;
          }
        }
        onClose() { if (this.contentEl && typeof this.contentEl.empty === "function") this.contentEl.empty(); }
      }
      new VenueDeleteModal(host).open();
    });
  }

  /**
   * Venue list renderer for the personal workspace "장소" tab.
   */
  function renderVenuesWorkspace(options) {
    const opts = options || {};
    const container = opts.container;
    const app = opts.app;
    const items = opts.items || [];
    if (!container) return null;
    ensureVenueStyles();
    container.empty();
    container.addClass("prodigy-people-workspace");
    container.addClass("ppv-venue-list");

    const header = container.createDiv({ attr: { style: "display:flex;justify-content:flex-end;margin:0 0 8px;" } });
    const addBtn = header.createEl("button", { text: "장소 추가", attr: { type: "button", class: "mod-cta" } });
    addBtn.onclick = async () => {
      if (root.VenueCreator && typeof root.VenueCreator.open === "function") {
        await root.VenueCreator.open(app);
        if (typeof opts.onRefresh === "function") opts.onRefresh();
      }
    };

    if (!items.length) {
      container.createDiv({ text: "등록된 장소가 없습니다. '장소 추가'로 추가하세요.", attr: { class: "ppv-venue-empty" } });
      return container;
    }

    items.forEach((item) => {
      const row = container.createDiv({ attr: { class: "ppv-venue-row" } });
      const info = row.createDiv({ attr: { style: "flex:1;min-width:0;" } });
      info.createDiv({ text: item.title, attr: { class: "ppv-venue-title" } });
      const metaBits = [];
      if (item.meta && item.meta.length) metaBits.push(item.meta.join(" · "));
      if (item.detail) metaBits.push(item.detail);
      if (metaBits.length) info.createDiv({ text: metaBits.join(" · "), attr: { class: "ppv-venue-meta" } });
      if (item.journalLinks && item.journalLinks.length) {
        info.createDiv({ text: `저널 ${item.journalLinks.length}`, attr: { class: "ppv-venue-meta" } });
      }
      row.onclick = () => {
        if (root.VenueView) root.VenueView.openVenuePreview(app, item.path, () => {
          if (typeof opts.onRefresh === "function") opts.onRefresh();
        });
      };
    });
    return container;
  }

  const api = Object.freeze({
    clean,
    ensureVenueStyles,
    collectRelatedJournals,
    openVenuePreview,
    openVenueQuickEdit,
    openDeleteVenueFlow,
    renderVenuesWorkspace
  });

  root.VenueView = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);