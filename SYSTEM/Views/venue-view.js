(function (root) {
  "use strict";

  /**
   * Venue(장소) view — first-class UI matching the people experience.
   * Provides: list renderer, detail popup (preview), quick edit, delete,
   * and related-journal reverse links. VenueStore owns reads/writes; this view
   * renders only the read model and preserves existing action callbacks.
   */

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
  function venueKnowledgeRow(item) {
    if (root.PeopleView && typeof root.PeopleView.typedKnowledgeRow === "function") {
      return root.PeopleView.typedKnowledgeRow(item);
    }
    const raw = item && typeof item === "object" ? item : { path: item };
    const path = wikilinkToPath(raw.path || raw.candidate_path || raw.approved_path);
    if (!path) return null;
    const type = String(raw.bucket || raw.type || "").toLowerCase();
    const candidatePath = raw.candidate_path || (type === "knowledge_candidate" || /knowledge[\\/]candidates/i.test(path) ? path : "");
    const approvedPath = raw.approved_path || (type === "knowledge" || type === "permanent_note" || /zeta[\\/]permanent/i.test(path) ? path : "");
    const kind = candidatePath ? "candidate" : approvedPath ? "approved" : "source";
    return Object.assign({}, raw, {
      path,
      title: String(raw.title || path.split("/").pop().replace(/\.md$/i, "")),
      context_kind: kind,
      source_path: raw.source_path || (kind === "source" ? path : ""),
      candidate_path: candidatePath,
      approved_path: approvedPath,
      status: String(raw.status || ""),
      quality: String(raw.quality || ""),
      source_refs: Array.isArray(raw.source_refs) ? raw.source_refs.slice() : [],
      candidate_id: String(raw.candidate_id || ""),
      review_target: candidatePath || approvedPath || path
    });
  }

  function applyVenueKnowledgeMetadata(element, item) {
    if (!element || !item || typeof element.setAttribute !== "function") return;
    const attrs = {
      "data-context-kind": item.context_kind || "source",
      "data-source-path": item.source_path || "",
      "data-candidate-path": item.candidate_path || "",
      "data-approved-path": item.approved_path || "",
      "data-status": item.status || "",
      "data-quality": item.quality || "",
      "data-candidate-id": item.candidate_id || "",
      "data-review-target": item.review_target || item.path || ""
    };
    Object.keys(attrs).forEach((key) => {
      if (attrs[key]) element.setAttribute(key, attrs[key]);
    });
  }

  async function openVenueKnowledgeContext(app, item) {
    const row = venueKnowledgeRow(item);
    if (!row) return null;
    if (root.PeopleView && typeof root.PeopleView.openKnowledgeContext === "function") {
      return root.PeopleView.openKnowledgeContext(app, row);
    }
    if (row.context_kind === "candidate") {
      const hub = root.KnowledgeExplorerHub || (root.KnowledgeExplorerHub = {});
      if (row.candidate_id) hub._pendingCandidateId = row.candidate_id;
      const route = root.KnowledgeWorkspaceRoute;
      if (route && typeof route.openReview === "function") return route.openReview(app);
    }
    return openPath(app, row.review_target || row.path);
  }

  /**
   * Reverse-index related journal links: scan DAILY/DAILY pages for outlinks /
   * connections that point at this venue. Bounded to the journal folder.
   */
  function collectRelatedJournals(app, venuePath) {
    const out = [];
    if (!app || !app.vault || typeof app.vault.getFiles !== "function") return out;
    const venueTarget = clean(venuePath).replace(/\\/g, "/").replace(/\.md$/i, "");
    const venueName = venueTarget.split("/").pop();
    const sameVenueTarget = (value) => {
      const target = wikilinkToPath(value).replace(/\\/g, "/").replace(/\.md$/i, "").replace(/^\/+/, "");
      if (!target) return false;
      return target === venueTarget || (!target.includes("/") && target === venueName);
    };
    const files = app.vault.getFiles().filter((f) => /^DAILY\/DAILY\//.test(f.path) && /\.md$/i.test(f.path));
    files.forEach((f) => {
      let hit = false;
      try {
        const cache = app.metadataCache && typeof app.metadataCache.getFileCache === "function"
          ? app.metadataCache.getFileCache(f)
          : null;
        if (cache && cache.links) {
          hit = cache.links.some((l) => sameVenueTarget(l && (l.path || l.link)));
        }
        if (!hit && cache && cache.frontmatter && cache.frontmatter.connections) {
          const conns = Array.isArray(cache.frontmatter.connections)
            ? cache.frontmatter.connections
            : [cache.frontmatter.connections];
          hit = conns.some((c) => sameVenueTarget(c));
        }
      } catch (_e) { /* skip */ }
      if (hit) out.push(f.path);
    });
    return out.sort();
  }

  function ensureVenueStyles() {
    if (typeof document === "undefined" || !document.createElement || !document.head || typeof document.head.appendChild !== "function") return;
    if (typeof document.getElementById !== "function" || !document.getElementById("prodigy-venue-styles")) {
      const style = document.createElement("style");
      style.id = "prodigy-venue-styles";
      style.textContent = [
        ".ppv-venue-list{display:flex;flex-direction:column;gap:var(--ke-space-2,4px);min-inline-size:0}",
        ".ppv-venue-row{display:flex;align-items:center;gap:var(--ke-space-3,8px);padding:var(--ke-space-3,8px) var(--ke-space-4,12px);border:1px solid var(--background-modifier-border);border-radius:var(--ke-radius-panel,8px);cursor:pointer;min-block-size:var(--ke-touch-target,44px);min-inline-size:0;overflow-wrap:anywhere}",
        ".ppv-venue-row:hover{background:var(--background-modifier-hover)}",
        ".ppv-venue-title{font-weight:700;font-size:var(--ke-type-body,.84rem);overflow-wrap:anywhere}",
        ".ppv-venue-meta{font-size:var(--ke-type-label,.72rem);color:var(--text-muted);overflow-wrap:anywhere}",
        ".ppv-venue-actions{display:flex;gap:var(--ke-space-2,4px);margin-block-start:var(--ke-space-3,8px);padding-block-start:var(--ke-space-3,8px);border-block-start:1px solid var(--background-modifier-border);flex-wrap:wrap}",
        ".ppv-venue-chip{display:inline-block;padding:var(--ke-space-1,2px) var(--ke-space-2,4px);border-radius:999px;background:var(--background-modifier-hover);font-size:var(--ke-type-chrome,.68rem);margin:var(--ke-space-1,2px) var(--ke-space-2,4px) 0 0;overflow-wrap:anywhere}",
        ".ppv-venue-section{margin-block:var(--ke-space-3,8px);min-inline-size:0}",
        ".ppv-venue-section-label{font-size:var(--ke-type-label,.72rem);font-weight:700;color:var(--text-muted);margin-block-end:var(--ke-space-1,2px);overflow-wrap:anywhere}",
        ".ppv-venue-section-body{font-size:var(--ke-type-body,.84rem);white-space:pre-wrap;color:var(--text-normal);overflow-wrap:anywhere;word-break:keep-all}",
        ".ppv-venue-empty{color:var(--text-muted);font-size:var(--ke-type-label,.72rem);overflow-wrap:anywhere}",
        ".ppv-venue-workspace{display:flex;flex-direction:column;gap:var(--ke-space-3,8px);min-inline-size:0;word-break:keep-all;overflow-wrap:anywhere}",
        ".ppv-venue-header{display:flex;align-items:flex-start;justify-content:space-between;gap:var(--ke-space-3,8px);flex-wrap:wrap;min-inline-size:0}",
        ".ppv-venue-header h1{margin:0;font-size:var(--ke-type-title,1.05rem);overflow-wrap:anywhere}",
        ".ppv-venue-header p{margin:var(--ke-space-1,2px) 0 0;color:var(--text-muted);font-size:var(--ke-type-body,.84rem);overflow-wrap:anywhere}",
        ".ppv-venue-toolbar{display:grid;gap:var(--ke-space-2,4px);padding:var(--ke-space-3,8px);border:1px solid var(--background-modifier-border);border-radius:var(--ke-radius-panel,8px);background:var(--background-secondary);min-inline-size:0}",
        ".ppv-venue-toolbar-row{display:flex;align-items:center;gap:var(--ke-space-2,4px);flex-wrap:wrap;min-inline-size:0}",
        ".ppv-venue-toolbar-label{min-inline-size:50px;color:var(--text-muted);font-size:var(--ke-type-label,.72rem);font-weight:700;word-break:keep-all}",
        ".ppv-venue-search,.ppv-venue-select{box-sizing:border-box;min-block-size:var(--ke-touch-target,44px);padding-inline:var(--ke-space-3,8px);border:1px solid var(--background-modifier-border);border-radius:var(--ke-radius-control,4px);background:var(--background-primary);color:var(--text-normal);font:inherit;min-inline-size:0}",
        ".ppv-venue-search{flex:1;min-inline-size:10rem}",
        ".ppv-venue-count{color:var(--text-muted);font-size:var(--ke-type-label,.72rem);overflow-wrap:anywhere}",
        ".ppv-venue-master-detail{display:grid;grid-template-columns:minmax(240px,.9fr) minmax(300px,1.1fr);gap:var(--ke-space-3,8px);min-block-size:0;min-inline-size:0;overflow:visible}",
        ".ppv-venue-list-pane,.ppv-venue-detail-pane{min-inline-size:0;min-block-size:0;overflow:visible;word-break:keep-all;overflow-wrap:anywhere}",
        ".ppv-venue-list-pane{display:flex;flex-direction:column;gap:var(--ke-space-2,4px);padding-inline-end:var(--ke-space-1,2px)}",
        ".ppv-venue-card{padding:var(--ke-space-3,8px) var(--ke-space-4,12px);border:1px solid var(--background-modifier-border);border-radius:var(--ke-radius-panel,8px);background:var(--background-primary);cursor:pointer;min-inline-size:0;overflow-wrap:anywhere}",
        ".ppv-venue-card:hover,.ppv-venue-card.is-selected{background:var(--background-modifier-hover);border-color:var(--text-accent)}",
        ".ppv-venue-card:focus-visible{outline:2px solid var(--text-accent);outline-offset:2px}",
        ".ppv-venue-card-top{display:flex;align-items:flex-start;justify-content:space-between;gap:var(--ke-space-2,4px);min-inline-size:0;flex-wrap:wrap}",
        ".ppv-venue-card-title{font-weight:700;font-size:var(--ke-type-body,.84rem);overflow-wrap:anywhere;min-inline-size:0}",
        ".ppv-venue-card-meta{margin-block-start:var(--ke-space-1,2px);color:var(--text-muted);font-size:var(--ke-type-label,.72rem);overflow-wrap:anywhere}",
        ".ppv-venue-card-sub{margin-block-start:var(--ke-space-2,4px);color:var(--text-muted);font-size:var(--ke-type-chrome,.68rem);overflow-wrap:anywhere}",
        ".ppv-venue-detail-pane{padding:var(--ke-space-4,12px);border:1px solid var(--background-modifier-border);border-radius:var(--ke-radius-panel,8px);background:var(--background-primary)}",
        ".ppv-venue-detail-head{display:flex;align-items:flex-start;gap:var(--ke-space-2,4px);margin-block-end:var(--ke-space-3,8px);min-inline-size:0}",
        ".ppv-venue-detail-head h2{margin:0;font-size:var(--ke-type-title,1.05rem);overflow-wrap:anywhere}",
        ".ppv-venue-detail-back{display:none}",
        ".ppv-venue-detail-section{margin-block:var(--ke-space-3,8px);min-inline-size:0}",
        ".ppv-venue-detail-section h3{margin:0 0 var(--ke-space-1,2px);font-size:var(--ke-type-label,.72rem);color:var(--text-muted);overflow-wrap:anywhere}",
        ".ppv-venue-detail-body{white-space:pre-wrap;font-size:var(--ke-type-body,.84rem);overflow-wrap:anywhere;word-break:keep-all}",
        ".ppv-venue-detail-link{display:block;width:100%;min-block-size:var(--ke-touch-target,44px);padding:var(--ke-space-2,4px) 0;border:0;background:none;color:var(--text-accent);cursor:pointer;text-align:start;font:inherit;overflow-wrap:anywhere;word-break:keep-all}",
        ".ppv-venue-detail-link:hover{text-decoration:underline}",
        ".ppv-venue-detail-link:focus-visible,.ppv-venue-detail-actions button:focus-visible,.ppv-venue-detail-back:focus-visible{outline:2px solid var(--text-accent);outline-offset:2px}",
        ".ppv-venue-detail-actions{display:flex;gap:var(--ke-space-2,4px);flex-wrap:wrap;margin-block-start:var(--ke-space-4,12px);padding-block-start:var(--ke-space-3,8px);border-block-start:1px solid var(--background-modifier-border)}",
        ".ppv-venue-detail-actions button,.ppv-venue-detail-back{min-block-size:var(--ke-touch-target,44px);word-break:keep-all;overflow-wrap:anywhere}",
        ".ppv-venue-search:focus-visible,.ppv-venue-select:focus-visible,.ppv-venue-card:focus-visible,.ppv-venue-detail-link:focus-visible,.ppv-venue-detail-actions button:focus-visible,.ppv-venue-detail-back:focus-visible{outline:2px solid var(--ke-color-accent,var(--text-accent));outline-offset:2px}",
        ".ppv-venue-card{min-block-size:var(--ke-touch-target,44px)}",
        ".prodigy-venue-preview,.prodigy-venue-modal{min-inline-size:0;word-break:keep-all;overflow-wrap:anywhere;color:var(--ke-color-text,var(--text-normal));font-size:var(--ke-type-body,.84rem);line-height:var(--ke-leading-body,1.45)}",
        ".prodigy-venue-preview{max-block-size:min(82vh,760px);overflow:auto;overscroll-behavior:contain}",
        ".prodigy-venue-preview input,.prodigy-venue-preview select,.prodigy-venue-preview textarea,.prodigy-venue-modal input,.prodigy-venue-modal select,.prodigy-venue-modal textarea{box-sizing:border-box;inline-size:100%;min-block-size:var(--ke-touch-target,44px);padding:var(--ke-space-2,4px) var(--ke-space-3,8px);border:1px solid var(--ke-color-border,var(--background-modifier-border));border-radius:var(--ke-radius-control,4px);background:var(--ke-color-surface,var(--background-primary));color:var(--ke-color-text,var(--text-normal));font:inherit;line-height:var(--ke-leading-body,1.45);word-break:keep-all;overflow-wrap:anywhere}",
        ".prodigy-venue-preview textarea{min-block-size:60px;resize:vertical;white-space:pre-wrap}",
        ".prodigy-venue-preview button,.prodigy-venue-modal button{box-sizing:border-box;min-block-size:var(--ke-touch-target,44px);padding:var(--ke-space-2,4px) var(--ke-space-3,8px);word-break:keep-all;overflow-wrap:anywhere}",
        ".prodigy-venue-preview input:focus-visible,.prodigy-venue-preview select:focus-visible,.prodigy-venue-preview textarea:focus-visible,.prodigy-venue-modal input:focus-visible,.prodigy-venue-modal select:focus-visible,.prodigy-venue-modal textarea:focus-visible{outline:2px solid var(--ke-color-accent,var(--text-accent));outline-offset:2px}",
        "@media(prefers-reduced-motion:reduce){.ppv-venue-workspace *,.prodigy-venue-preview *,.prodigy-venue-modal *{transition:none!important;animation:none!important;scroll-behavior:auto!important}}",
        "@media(max-width:760px){.ppv-venue-master-detail{display:block}.ppv-venue-master-detail[data-selected=\"true\"] .ppv-venue-list-pane{display:none}.ppv-venue-master-detail[data-selected=\"false\"] .ppv-venue-detail-pane{display:none}.ppv-venue-detail-back{display:inline-flex}}"
      ].join("\n");
      document.head.appendChild(style);
    }
  }

  /**
   * Detail popup — properties + editable sections + connections + related journals.
   */
  async function openVenuePreview(app, path, onChanged, options) {
    const host = app || root.app || (typeof window !== "undefined" ? window.app : null);
    const store = getStore();
    if (!host || !store) {
      notice("Venue 모듈을 불러오지 못했습니다.");
      return null;
    }
    let model;
    try {
      model = await store.buildVenuePreviewModel(host, path, options || {});
    } catch (error) {
      notice(error.message || String(error), 9000);
      return null;
    }
    const Modal = root.obsidian && root.obsidian.Modal;
    if (!Modal) {
      await openPath(host, model.path);
      return model;
    }
    if (root.ProdigyUI && typeof root.ProdigyUI.ensureStyles === "function") root.ProdigyUI.ensureStyles();
    ensureVenueStyles();

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

          // Existing body sections remain visible. Only the original three
          // sections are editable; dynamic/link sections stay read-only.
          const renderedSections = Object.create(null);
          const renderBodySection = (title, raw, editable) => {
            const block = contentEl.createDiv({ attr: { class: "ppv-venue-section" } });
            block.createEl("div", { text: title, attr: { class: "ppv-venue-section-label" } });
            renderedSections[title] = true;
            if (editable) {
              const ta = block.createEl("textarea", {
                text: raw,
                attr: {
                  rows: title === "메모" ? 5 : 3,
                  "aria-label": `${title} 편집`,
                  style: "width:100%;box-sizing:border-box;min-height:60px;padding:6px 8px;border:1px solid var(--background-modifier-border);border-radius:4px;background:var(--background-primary);color:var(--text-normal);font:inherit;"
                }
              });
              ta.oninput = () => { this.sectionValues[title] = ta.value; this.dirty = true; };
            } else {
              block.createEl("div", {
                text: raw || "기록된 내용이 없습니다.",
                attr: { class: "ppv-venue-section-body" }
              });
            }
          };
          (this.model.sections || []).forEach((section) => {
            const title = String(section.title || "").trim();
            if (!title) return;
            renderBodySection(
              title,
              String(this.sectionValues[title] || ""),
              editableSections.indexOf(title) !== -1
            );
          });
          // Preserve the old editable slots when a legacy note omitted a
          // required heading, without adding or changing note fields.
          editableSections.forEach((title) => {
            if (!renderedSections[title]) renderBodySection(title, String(this.sectionValues[title] || ""), true);
          });

          // Related journals (reverse links)
          const rel = contentEl.createDiv({ attr: { class: "ppv-venue-section" } });
          rel.createEl("div", { text: "관련 저널 역링크", attr: { class: "ppv-venue-section-label" } });
          const relList = rel.createDiv({ attr: { class: "ppv-venue-section-body" } });
          const journals = Array.isArray(this.model.relatedJournals)
            ? this.model.relatedJournals
            : collectRelatedJournals(this.app, this.model.path);
          if (journals.length) {
            journals.forEach((jp) => {
              const row = relList.createDiv({ attr: { style: "margin:2px 0;" } });
              const btn = row.createEl("button", {
                text: jp.replace(/\.md$/i, ""),
                attr: { type: "button", class: "ppv-venue-detail-link", "aria-label": `${jp.replace(/\.md$/i, "")} 열기` }
              });
              btn.onclick = (event) => {
                if (event && event.preventDefault) event.preventDefault();
                if (event && event.stopPropagation) event.stopPropagation();
                openPath(this.app, jp);
              };
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
          const row = parent.createDiv({ attr: { style: "display:flex;gap:var(--ke-space-2,4px);font-size:.85em;margin:2px 0;" } });
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
            contentEl.addClass("prodigy-venue-modal");
            contentEl.createEl("h2", { text: `장소 빠른 수정 — ${this.props.title}`, attr: { style: "margin:0 0 12px;font-size:1.1em;" } });
            const formEl = contentEl.createDiv({ attr: { style: "display:grid;gap:var(--ke-space-2,4px);" } });
            this.field(formEl, "분류", "venue_category", "예: cafe, gym", false);
            this.field(formEl, "주소", "address", "선택", false);
            this.field(formEl, "연결", "connections", "저널/지식 wikilink, 콤마 구분", false);
            const footer = contentEl.createDiv({ attr: { style: "display:flex;justify-content:flex-end;gap:var(--ke-space-2,4px);margin-block-start:var(--ke-space-4,12px);" } });
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
                style: "width:100%;box-sizing:border-box;min-height:var(--ke-touch-target,44px);padding:var(--ke-space-2,4px) var(--ke-space-3,8px);border:1px solid var(--ke-color-border,var(--background-modifier-border));border-radius:var(--ke-radius-control,4px);background:var(--ke-color-surface,var(--background-primary));color:var(--ke-color-text,var(--text-normal));font:inherit;line-height:var(--ke-leading-body,1.45);word-break:keep-all;overflow-wrap:anywhere;"
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
          contentEl.addClass("prodigy-venue-modal");
          contentEl.createEl("h2", { text: "장소 삭제", attr: { style: "margin:0 0 8px;font-size:1.15em;" } });
          contentEl.createEl("p", { text: `「${name}」 장소 Object를 삭제할까요?`, attr: { style: "font-size:.95em;margin:0 0 8px;font-weight:700;" } });
          contentEl.createEl("p", { text: "노트 파일은 휴지통으로 이동합니다.", attr: { style: "font-size:.82em;color:var(--text-muted);margin:0 0 14px;" } });
          const footer = contentEl.createDiv({ attr: { style: "display:flex;justify-content:flex-end;gap:var(--ke-space-2,4px);" } });
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
    const store = getStore();
    if (!container || !store) return null;
    if (root.ProdigyUI && typeof root.ProdigyUI.ensureStyles === "function") root.ProdigyUI.ensureStyles();
    ensureVenueStyles();

    let rawItems = Array.isArray(opts.items) ? opts.items.slice() : [];
    const initialModel = opts.model || store.buildVenueWorkspaceModel(rawItems, {});
    const state = {
      query: clean(initialModel.query),
      category: clean(initialModel.category || "all") || "all",
      connection: clean(initialModel.connection || "all") || "all",
      journal: clean(initialModel.journal || "all") || "all",
      sort: clean(initialModel.sort || "name_asc") || "name_asc",
      selectedPath: clean(opts.selectedPath)
    };
    let model = initialModel;
    let layoutNarrow = Number(container.clientWidth || 0) <= 760;
    let resizeObserver = null;
    const readState = Object.create(null);

    function knowledgeRowsForVenue(venue) {
      const raw = venue && (venue.knowledge_context || venue.knowledge_rows || venue.connections);
      const values = Array.isArray(raw) ? raw : raw ? [raw] : [];
      return values.map((item) => venueKnowledgeRow(item)).filter(Boolean);
    }

    function enrichVenueModel(nextModel) {
      const venues = (nextModel.venues || []).map((venue) => Object.assign({}, venue, {
        read_state: readState[clean(venue.path)] || null,
        knowledge_rows: knowledgeRowsForVenue(venue)
      }));
      return Object.assign({}, nextModel, { venues });
    }

    function button(parent, label, options) {
      const o = options || {};
      if (root.ProdigyUI && typeof root.ProdigyUI.button === "function") {
        const shared = root.ProdigyUI.button(parent, label, {
          primary: !!o.primary,
          className: o.className || ""
        });
        if (o.ariaLabel && shared && typeof shared.setAttribute === "function") {
          shared.setAttribute("aria-label", o.ariaLabel);
        }
        return shared;
      }
      const classes = [o.className || "", o.primary ? "mod-cta" : ""].filter(Boolean).join(" ");
      return parent.createEl("button", {
        text: label,
        attr: Object.assign(
          { type: "button", class: classes },
          o.ariaLabel ? { "aria-label": o.ariaLabel } : {}
        )
      });
    }

    function setElementAttribute(element, name, value) {
      if (!element) return;
      if (typeof element.setAttr === "function") element.setAttr(name, value);
      else if (typeof element.setAttribute === "function") element.setAttribute(name, value);
    }
    function runSafely(handler, event) {
      if (event && event.preventDefault) event.preventDefault();
      if (event && event.stopPropagation) event.stopPropagation();
      try {
        const result = handler();
        if (result && typeof result.catch === "function") {
          result.catch((error) => notice(error && (error.message || String(error)), 9000));
        }
        return result;
      } catch (error) {
        notice(error && (error.message || String(error)), 9000);
        return null;
      }
    }

    function selectedVenue() {
      return (model.venues || []).find((venue) => venue.path === state.selectedPath) || null;
    }

    function rebuildModel() {
      model = enrichVenueModel(store.buildVenueWorkspaceModel(rawItems, {
        query: state.query,
        category: state.category,
        connection: state.connection,
        journal: state.journal,
        sort: state.sort
      }));
      return model;
    }

    function refreshAfterEdit(path) {
      if (path) state.selectedPath = path;
      if (typeof opts.onRefresh === "function") return opts.onRefresh();
      return paint();
    }
    async function readVenueBody(item) {
      const path = clean(item && item.path);
      if (!path || !app || !app.vault) return false;
      readState[path] = { status: "loading", error: "" };
      try {
        const af = typeof app.vault.getAbstractFileByPath === "function"
          ? app.vault.getAbstractFileByPath(path)
          : null;
        if (!af) throw new Error("장소 노트를 찾을 수 없습니다.");
        const text = typeof app.vault.cachedRead === "function"
          ? await app.vault.cachedRead(af)
          : await app.vault.read(af);
        item.body = String(text == null ? "" : text);
        readState[path] = {
          status: item.body.length ? "success" : "empty",
          error: ""
        };
        return true;
      } catch (error) {
        readState[path] = {
          status: "error",
          error: String(error && (error.message || error) || "본문을 읽지 못했습니다.")
        };
        return false;
      }
    }

    async function hydrateVenueBodies() {
      let changed = false;
      for (let i = 0; i < rawItems.length; i += 1) {
        const item = rawItems[i];
        if (!item || !item.path) continue;
        const path = clean(item.path);
        const hasBody = String(item.body || "").length > 0;
        if (hasBody && !readState[path]) {
          readState[path] = { status: "success", error: "" };
          continue;
        }
        const before = readState[path] && readState[path].status;
        await readVenueBody(item);
        const after = readState[path] && readState[path].status;
        if (before !== after || after === "success") changed = true;
      }
      return changed;
    }

    async function retryVenueRead(path) {
      const item = rawItems.find((entry) => clean(entry && entry.path) === clean(path));
      if (!item) return false;
      const result = await readVenueBody(item);
      paint();
      return result;
    }

    // Static shell — setData/paint only replace list/detail contents, so
    // repeated Dataview refreshes never create duplicate writers or controls.
    container.empty();
    container.addClass("prodigy-people-workspace");
    container.addClass("ppv-venue-workspace");

    const header = container.createDiv({ attr: { class: "ppv-venue-header" } });
    const heading = header.createDiv();
    heading.createEl("h1", { text: opts.title || "장소" });
    heading.createEl("p", {
      text: opts.subtitle || "반복 방문하는 장소의 정보와 연결된 기록을 한곳에서 이어갑니다."
    });
    const headerActions = header.createDiv({ attr: { style: "display:flex;gap:var(--ke-space-2,4px);flex-wrap:wrap;" } });
    const addBtn = button(headerActions, "장소 추가", { primary: true });
    addBtn.onclick = () => runSafely(async () => {
      if (root.VenueCreator && typeof root.VenueCreator.open === "function") {
        await root.VenueCreator.open(app);
        return refreshAfterEdit("");
      }
      notice("장소 생성기를 불러오지 못했습니다.", 9000);
      return null;
    });

    const toolbar = container.createDiv({ attr: { class: "ppv-venue-toolbar" } });
    const searchRow = toolbar.createDiv({ attr: { class: "ppv-venue-toolbar-row" } });
    const searchInput = searchRow.createEl("input", {
      attr: {
        type: "search",
        class: "ppv-venue-search",
        placeholder: "이름·분류·주소·본문·연결 검색",
        "aria-label": "장소 검색"
      }
    });
    searchInput.value = state.query;
    let composing = false;
    searchInput.oncompositionstart = () => { composing = true; };
    searchInput.oncompositionend = () => {
      composing = false;
      state.query = String(searchInput.value || "");
      paint();
    };
    searchInput.oninput = () => {
      if (composing) return;
      state.query = String(searchInput.value || "");
      paint();
    };

    function createSelectRow(label, ariaLabel, className) {
      const row = toolbar.createDiv({ attr: { class: "ppv-venue-toolbar-row" } });
      row.createEl("span", { text: label, attr: { class: "ppv-venue-toolbar-label" } });
      const select = row.createEl("select", {
        attr: { class: className || "ppv-venue-select", "aria-label": ariaLabel }
      });
      return select;
    }

    const categorySelect = createSelectRow("분류", "장소 분류 필터");
    const connectionSelect = createSelectRow("연결", "장소 연결 상태 필터");
    const journalSelect = createSelectRow("저널", "장소 저널 상태 필터");
    const sortSelect = createSelectRow("정렬", "장소 정렬");

    function fillSelect(select, entries, value) {
      if (typeof select.empty === "function") select.empty();
      else while (select.firstChild) select.removeChild(select.firstChild);
      (entries || []).forEach((entry) => {
        const option = select.createEl("option", {
          text: entry.label,
          attr: { value: entry.id }
        });
        if (String(entry.id) === String(value)) option.selected = true;
      });
      if (select.options && select.options.length && !Array.from(select.options).some((option) => option.value === String(value))) {
        select.value = String(entries && entries.length ? entries[0].id : "");
      }
    }

    categorySelect.onchange = () => {
      state.category = String(categorySelect.value || "all");
      paint();
    };
    connectionSelect.onchange = () => {
      state.connection = String(connectionSelect.value || "all");
      paint();
    };
    journalSelect.onchange = () => {
      state.journal = String(journalSelect.value || "all");
      paint();
    };
    sortSelect.onchange = () => {
      state.sort = String(sortSelect.value || "name_asc");
      paint();
    };

    const count = toolbar.createEl("div", {
      text: "",
      attr: { class: "ppv-venue-count", "aria-live": "polite" }
    });
    const masterDetail = container.createDiv({
      attr: {
        class: "ppv-venue-master-detail",
        "data-selected": "false"
      }
    });
    const listPane = masterDetail.createEl("section", {
      attr: { class: "ppv-venue-list-pane", "aria-label": "장소 목록" }
    });
    const detailPane = masterDetail.createEl("section", {
      attr: { class: "ppv-venue-detail-pane", "aria-label": "장소 상세" }
    });

    function applyPaneVisibility() {
      setElementAttribute(masterDetail, "data-selected", state.selectedPath ? "true" : "false");
      setElementAttribute(masterDetail, "data-layout-narrow", layoutNarrow ? "true" : "false");
      setElementAttribute(masterDetail, "data-scroll-owner", "workspace");
      setElementAttribute(listPane, "data-scroll-owner", "workspace");
      setElementAttribute(detailPane, "data-scroll-owner", "workspace");
      if (layoutNarrow) {
        listPane.hidden = !!state.selectedPath;
        detailPane.hidden = !state.selectedPath;
      } else {
        listPane.hidden = false;
        detailPane.hidden = false;
      }
    }

    function selectVenue(path) {
      state.selectedPath = clean(path);
      applyPaneVisibility();
      paint();
    }

    function openPreview(venue) {
      if (!venue) return null;
      return openVenuePreview(app, venue.path, (result) => refreshAfterEdit(result && result.path || venue.path), {
        relatedJournals: venue.journalLinks || []
      });
    }

    function paintDetail(venue) {
      detailPane.empty();
      if (!venue) {
        detailPane.createEl("div", {
          text: model.empty
            ? "장소를 추가하면 주소·본문·연결된 기록을 이곳에서 확인할 수 있습니다."
            : "목록에서 장소를 선택하면 주소·본문과 연결된 기록을 확인할 수 있습니다.",
          attr: { class: "ppv-venue-empty" }
        });
        return;
      }

      const head = detailPane.createDiv({ attr: { class: "ppv-venue-detail-head" } });
      const back = button(head, "목록", { className: "ppv-venue-detail-back", ariaLabel: "장소 목록으로 돌아가기" });
      back.onclick = (event) => runSafely(() => {
        state.selectedPath = "";
        applyPaneVisibility();
        paint();
      }, event);
      const titleWrap = head.createDiv();
      titleWrap.createEl("h2", { text: venue.title });
      const meta = [venue.venue_category || "분류 없음", venue.address || "주소 없음"];
      titleWrap.createEl("div", { text: meta.join(" · "), attr: { class: "ppv-venue-meta" } });
      const readStatus = venue.read_state && venue.read_state.status;
      if (readStatus === "error") {
        const readError = detailPane.createDiv({ attr: { class: "ppv-venue-read-error", role: "alert" } });
        readError.createEl("span", { text: `본문을 읽지 못했습니다. 원본: ${venue.path}` });
        const retry = button(readError, "다시 읽기", { ariaLabel: `${venue.title} 본문 다시 읽기` });
        retry.onclick = (event) => runSafely(() => retryVenueRead(venue.path), event);
      } else if (readStatus === "empty") {
        detailPane.createEl("div", {
          text: `본문이 비어 있습니다. 원본: ${venue.path}`,
          attr: { class: "ppv-venue-empty" }
        });
      }

      const properties = detailPane.createEl("section", { attr: { class: "ppv-venue-detail-section" } });
      properties.createEl("h3", { text: "기본 정보" });
      properties.createEl("div", { text: `분류: ${venue.venue_category || "미분류"}`, attr: { class: "ppv-venue-detail-body" } });
      properties.createEl("div", { text: `주소: ${venue.address || "기록된 주소가 없습니다."}`, attr: { class: "ppv-venue-detail-body" } });

      (venue.sections || []).forEach((section) => {
        const block = detailPane.createEl("section", { attr: { class: "ppv-venue-detail-section" } });
        block.createEl("h3", { text: section.title });
        block.createEl("div", {
          text: section.bodyText || "기록된 내용이 없습니다.",
          attr: { class: "ppv-venue-detail-body" }
        });
      });

      const connections = detailPane.createEl("section", { attr: { class: "ppv-venue-detail-section" } });
      connections.createEl("h3", { text: "연결된 Object" });
      if (venue.connections && venue.connections.length) {
        venue.connections.forEach((connection) => {
          const target = wikilinkToPath(connection);
          const linkBtn = button(connections, connection, { className: "ppv-venue-detail-link", ariaLabel: `${connection} 열기` });
          linkBtn.onclick = (event) => runSafely(() => openPath(app, target || connection), event);
        });
      } else if (venue.connection_text) {
        connections.createEl("div", { text: venue.connection_text, attr: { class: "ppv-venue-detail-body" } });
      } else {
        connections.createEl("div", { text: "연결된 Object가 없습니다.", attr: { class: "ppv-venue-empty" } });
      }
      const knowledgeRows = (venue.knowledge_rows || []).filter((item) => item && item.path);
      if (knowledgeRows.length) {
        const knowledge = detailPane.createEl("section", { attr: { class: "ppv-venue-detail-section" } });
        knowledge.createEl("h3", { text: "지식 맥락" });
        knowledgeRows.forEach((item) => {
          const kindLabel = item.context_kind === "candidate"
            ? "검증 대기"
            : item.context_kind === "approved" ? "승인 지식" : "출처";
          const meta = [kindLabel, item.status, item.quality].filter(Boolean).join(" · ");
          const label = `${item.title || item.path}${meta ? ` · ${meta}` : ""}`;
          const linkBtn = button(knowledge, label, {
            className: "ppv-venue-detail-link",
            ariaLabel: `${label} 열기`
          });
          applyVenueKnowledgeMetadata(linkBtn, item);
          linkBtn.onclick = (event) => runSafely(() => openVenueKnowledgeContext(app, item), event);
          if (item.source_refs && item.source_refs.length) {
            knowledge.createEl("div", {
              text: `출처: ${item.source_refs.join(", ")}`,
              attr: { class: "ppv-venue-empty" }
            });
          }
        });
      }

      const journals = detailPane.createEl("section", { attr: { class: "ppv-venue-detail-section" } });
      journals.createEl("h3", { text: "관련 저널" });
      if (venue.journalLinks && venue.journalLinks.length) {
        venue.journalLinks.forEach((journalPath) => {
          const linkBtn = button(journals, journalPath.replace(/\.md$/i, ""), {
            className: "ppv-venue-detail-link",
            ariaLabel: `${journalPath.replace(/\.md$/i, "")} 열기`
          });
          linkBtn.onclick = (event) => runSafely(() => openPath(app, journalPath), event);
        });
      } else {
        journals.createEl("div", { text: "연결된 저널이 없습니다.", attr: { class: "ppv-venue-empty" } });
      }

      const actions = detailPane.createDiv({ attr: { class: "ppv-venue-detail-actions" } });
      const edit = button(actions, "편집", { primary: true });
      edit.onclick = (event) => runSafely(() => openVenueQuickEdit(app, venue.path, (result) => {
        refreshAfterEdit(result && result.path || venue.path);
      }), event);
      const preview = button(actions, "미리보기/편집");
      preview.onclick = (event) => runSafely(() => openPreview(venue), event);
      const original = button(actions, "원본 노트");
      original.onclick = (event) => runSafely(() => openPath(app, venue.path), event);
      const remove = button(actions, "삭제");
      remove.onclick = (event) => runSafely(() => openDeleteVenueFlow(app, venue.path, () => {
        state.selectedPath = "";
        refreshAfterEdit("");
      }), event);
    }

    function paint() {
      rebuildModel();
      let visible = model.venues || [];
      let resetState = false;
      if (state.category !== "all" && !(model.category_filters || []).some((entry) => entry.id === state.category)) {
        state.category = "all";
        resetState = true;
      }
      if (!(model.connection_filters || []).some((entry) => entry.id === state.connection)) {
        state.connection = "all";
        resetState = true;
      }
      if (!(model.journal_filters || []).some((entry) => entry.id === state.journal)) {
        state.journal = "all";
        resetState = true;
      }
      if (!(model.sorts || []).some((entry) => entry.id === state.sort)) {
        state.sort = "name_asc";
        resetState = true;
      }
      if (resetState) {
        rebuildModel();
        visible = model.venues || [];
      }
      if (state.selectedPath && !selectedVenue()) state.selectedPath = "";
      const hasMeasuredWidth = Number(container.clientWidth || 0) > 0;
      if (!state.selectedPath && visible.length && !layoutNarrow && hasMeasuredWidth) state.selectedPath = visible[0].path;
      fillSelect(categorySelect, model.category_filters || [], state.category);
      fillSelect(connectionSelect, model.connection_filters || [], state.connection);
      fillSelect(journalSelect, model.journal_filters || [], state.journal);
      fillSelect(sortSelect, model.sorts || [], state.sort);
      searchInput.value = state.query;
      count.setText(model.empty
        ? ""
        : (model.no_match
          ? "일치하는 장소가 없습니다."
          : `${model.shown}곳 표시 · 전체 ${model.total}곳`));
      if (typeof opts.onStateChange === "function") {
        opts.onStateChange({
          query: state.query,
          category: state.category,
          connection: state.connection,
          journal: state.journal,
          sort: state.sort,
          selectedPath: state.selectedPath
        });
      }
      applyPaneVisibility();
      paintDetail(selectedVenue());
      listPane.empty();

      if (model.empty) {
        listPane.createEl("div", {
          text: "등록된 장소가 없습니다. '장소 추가'로 추가하세요.",
          attr: { class: "ppv-venue-empty" }
        });
        return model;
      }
      if (model.no_match) {
        listPane.createEl("div", {
          text: model.empty_hint || "일치하는 장소가 없습니다.",
          attr: { class: "ppv-venue-empty" }
        });
        return model;
      }

      visible.forEach((venue) => {
        const card = listPane.createEl("article", {
          attr: {
            class: `ppv-venue-card${venue.path === state.selectedPath ? " is-selected" : ""}`,
            tabindex: "0",
            role: "button",
            "aria-label": `${venue.title} 상세 보기`
          }
        });
        const top = card.createDiv({ attr: { class: "ppv-venue-card-top" } });
        top.createEl("div", { text: venue.title, attr: { class: "ppv-venue-card-title" } });
        if (venue.venue_category) top.createEl("span", { text: venue.venue_category, attr: { class: "ppv-venue-chip" } });
        if (venue.address) card.createEl("div", { text: venue.address, attr: { class: "ppv-venue-card-meta" } });
        const sub = [];
        if (venue.updated) sub.push(`수정 ${String(venue.updated).slice(0, 10)}`);
        sub.push(venue.has_connections || venue.connection_text ? `연결 ${venue.connections.length || 1}` : "연결 없음");
        sub.push(venue.journalLinks.length ? `저널 ${venue.journalLinks.length}` : "저널 없음");
        card.createEl("div", { text: sub.join(" · "), attr: { class: "ppv-venue-card-sub" } });
        const readStatus = venue.read_state && venue.read_state.status;
        if (readStatus === "error") {
          const error = card.createDiv({ attr: { class: "ppv-venue-empty", role: "alert" } });
          error.createEl("span", { text: `본문 읽기 실패 · 원본: ${venue.path}` });
          const retry = button(error, "다시 읽기", { ariaLabel: `${venue.title} 본문 다시 읽기` });
          retry.onclick = (event) => runSafely(() => retryVenueRead(venue.path), event);
        } else if (readStatus === "empty") {
          card.createEl("div", {
            text: `본문 비어 있음 · 원본: ${venue.path}`,
            attr: { class: "ppv-venue-empty" }
          });
        }
        card.onclick = (event) => runSafely(() => selectVenue(venue.path), event);
        card.onkeydown = (event) => {
          if (event && (event.key === "Enter" || event.key === " ")) {
            runSafely(() => selectVenue(venue.path), event);
          }
        };
      });
      return model;
    }

    paint();
    hydrateVenueBodies().then((changed) => {
      if (changed) paint();
    }).catch(() => { /* preserve per-item read state */ });
    if (typeof root.ResizeObserver === "function") {
      resizeObserver = new root.ResizeObserver((entries) => {
        const width = entries && entries[0] && entries[0].contentRect
          ? Number(entries[0].contentRect.width)
          : Number(container.clientWidth || 0);
        const nextNarrow = Number.isFinite(width) && width > 0 ? width <= 760 : layoutNarrow;
        if (nextNarrow === layoutNarrow) return;
        layoutNarrow = nextNarrow;
        paint();
      });
      resizeObserver.observe(container);
    }

    return {
      paint,
      selectVenue,
      setData: (nextItems) => {
        rawItems = Array.isArray(nextItems) ? nextItems.slice() : [];
        paint();
        hydrateVenueBodies().then((changed) => {
          if (changed) paint();
        }).catch(() => { /* preserve per-item read state */ });
      },
      getState: () => Object.assign({}, state),
      getModel: () => model,
      destroy: () => { if (resizeObserver) resizeObserver.disconnect(); }
    };
  }

  const api = Object.freeze({
    clean,
    ensureVenueStyles,
    collectRelatedJournals,
    openVenuePreview,
    openVenueQuickEdit,
    openDeleteVenueFlow,
    venueKnowledgeRow,
    openVenueKnowledgeContext,
    renderVenuesWorkspace
  });

  root.VenueView = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);