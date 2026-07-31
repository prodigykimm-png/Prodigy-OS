(function (root) {
  "use strict";

  function openSource(app, path) {
    return app.workspace.openLinkText(String(path || "").replace(/\.md$/i, ""), "", false);
  }

  /**
   * Open note in a side split (right of current leaf when possible).
   */
  async function openBeside(app, path) {
    if (!app || !path) return;
    const filePath = String(path);
    const linkText = filePath.replace(/\.md$/i, "");

    // Prefer explicit file open in a split leaf (most reliable "side" open).
    try {
      const file = app.vault && typeof app.vault.getAbstractFileByPath === "function"
        ? app.vault.getAbstractFileByPath(filePath)
        : null;
      if (file && app.workspace && typeof app.workspace.getLeaf === "function") {
        let leaf = null;
        try {
          leaf = app.workspace.getLeaf("split");
        } catch (_e) {
          leaf = null;
        }
        if (!leaf) {
          try {
            leaf = app.workspace.getLeaf(true);
          } catch (_e2) {
            leaf = null;
          }
        }
        if (leaf && typeof leaf.openFile === "function") {
          await leaf.openFile(file);
          return leaf;
        }
      }
    } catch (_err) {
      /* fall through */
    }

    // Fallback: openLinkText with split / new leaf
    if (app.workspace && typeof app.workspace.openLinkText === "function") {
      try {
        return await app.workspace.openLinkText(linkText, filePath, "split");
      } catch (_e3) {
        return app.workspace.openLinkText(linkText, filePath, true);
      }
    }
    return null;
  }

  function makeButton(parent, label, options) {
    const opts = options || {};
    if (root.ProdigyUI && root.ProdigyUI.button) {
      return root.ProdigyUI.button(parent, label, {
        primary: !!opts.primary,
        className: opts.className || ""
      });
    }
    return parent.createEl("button", {
      text: label,
      attr: {
        type: "button",
        class: [
          "prodigy-btn",
          opts.primary ? "prodigy-btn-primary" : "",
          opts.className || ""
        ].filter(Boolean).join(" ")
      }
    });
  }

  function render(options) {
    const { app, container, title, subtitle = "", actions = [], sections = [] } = options;
    container.empty();
    container.addClass("prodigy-list-workspace");
    if (root.ProdigyUI) root.ProdigyUI.ensureStyles();
    const style = container.createEl("style", { text: `
.prodigy-list-workspace{max-width:980px;margin:0 auto;padding:8px 8px 48px;font-size:var(--ke-type-body,.84rem);line-height:var(--ke-leading-body,1.45);letter-spacing:0}.workspace-list-header{display:flex;align-items:flex-end;justify-content:space-between;gap:var(--ke-space-5,16px);padding:8px 0 22px;border-bottom:1px solid var(--background-modifier-border)}.workspace-list-title h1{margin:0;font-size:var(--ke-type-title,1.05rem);line-height:var(--ke-leading-body,1.45);letter-spacing:0}.workspace-list-title p{margin:5px 0 0;color:var(--text-muted);font-size:var(--ke-type-body,.84rem);line-height:var(--ke-leading-body,1.45)}.workspace-list-actions{display:flex;gap:var(--ke-space-3,8px);flex-wrap:wrap}.workspace-list-section{padding:22px 0 6px}.workspace-list-section h2{font-size:var(--ke-type-heading,.92rem);line-height:var(--ke-leading-body,1.45);letter-spacing:0;margin:0 0 12px}.workspace-list-row{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:var(--ke-space-5,16px);align-items:center;padding:13px 0;border-top:1px solid var(--background-modifier-border)}.workspace-list-copy{min-width:0}.workspace-list-copy strong{display:block;overflow-wrap:anywhere}.workspace-list-name{display:inline;font-weight:700;overflow-wrap:anywhere;color:var(--text-accent);cursor:pointer;text-decoration:none;border-bottom:1px solid transparent}.workspace-list-name:hover{border-bottom-color:var(--text-accent)}.workspace-list-name:focus-visible{outline:2px solid var(--text-accent);outline-offset:2px;border-radius:2px}.workspace-list-meta{display:flex;gap:var(--ke-space-3,8px);flex-wrap:wrap;margin-top:var(--ke-space-2,4px);color:var(--text-muted);font-size:var(--ke-type-label,.72rem);line-height:var(--ke-leading-body,1.45)}.workspace-list-detail{margin-top:5px;color:var(--text-muted);font-size:var(--ke-type-body,.84rem);line-height:var(--ke-leading-body,1.45);overflow-wrap:anywhere}.workspace-list-empty{padding:18px 0;color:var(--text-muted);font-size:var(--ke-type-body,.84rem);line-height:var(--ke-leading-body,1.45)}.workspace-list-count{margin-left:6px;color:var(--text-muted);font-weight:500;font-size:var(--ke-type-label,.72rem);line-height:var(--ke-leading-control,1.35)}.workspace-list-row-actions{display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end;align-items:center}.workspace-list-actions button,.workspace-list-row-actions button{min-height:32px}@media(max-width:600px){.prodigy-list-workspace{padding:4px 4px 40px}.workspace-list-header{align-items:stretch;flex-direction:column}.workspace-list-actions{display:grid;grid-template-columns:1fr}.workspace-list-row{grid-template-columns:1fr;gap:10px}.workspace-list-row-actions{justify-self:stretch;display:grid;grid-template-columns:1fr 1fr;gap:6px}.workspace-list-title h1{font-size:var(--ke-type-title,1.05rem)}.workspace-list-actions button,.workspace-list-row-actions button{min-height:44px;font-size:var(--ke-type-label,.72rem);line-height:var(--ke-leading-control,1.35)}}
` });
    style.setAttr && style.setAttr("data-prodigy-workspace-style", "true");
    const header = container.createDiv({ attr: { class: "workspace-list-header" } });
    const heading = header.createDiv({ attr: { class: "workspace-list-title" } });
    heading.createEl("h1", { text: title });
    if (subtitle) heading.createEl("p", { text: subtitle });
    const actionRow = header.createDiv({ attr: { class: "workspace-list-actions" } });
    actions.forEach((action) => {
      const control = makeButton(actionRow, action.label, { primary: !!action.primary });
      control.onclick = () => action.onClick ? action.onClick() : openSource(app, action.path);
    });
    sections.forEach((section) => {
      const area = container.createDiv({ attr: { class: "workspace-list-section" } });
      const sectionTitle = area.createEl("h2", { text: section.title });
      sectionTitle.createEl("span", {
        text: String((section.items && section.items.length) || 0),
        attr: { class: "workspace-list-count" }
      });
      if (!section.items || !section.items.length) {
        area.createEl("p", { text: section.empty, attr: { class: "workspace-list-empty" } });
        return;
      }
      section.items.forEach((item) => {
        const row = area.createDiv({ attr: { class: "workspace-list-row" } });
        const copy = row.createDiv({ attr: { class: "workspace-list-copy" } });

        const openTitle = () => {
          if (typeof item.onTitleClick === "function") return item.onTitleClick(item);
          if (item.path) return openBeside(app, item.path);
          return null;
        };

        // Clickable title → open markdown beside (split). No separate "원본 열기" required.
        if (item.path || typeof item.onTitleClick === "function") {
          const nameEl = copy.createEl("a", {
            text: item.title,
            attr: {
              class: "workspace-list-name",
              href: "#",
              role: "link",
              title: "옆에 노트 열기"
            }
          });
          nameEl.onclick = (event) => {
            if (event && typeof event.preventDefault === "function") event.preventDefault();
            openTitle();
          };
          nameEl.onkeydown = (event) => {
            if (!event) return;
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              openTitle();
            }
          };
        } else {
          copy.createEl("strong", { text: item.title });
        }

        if (item.meta && item.meta.length) {
          const meta = copy.createDiv({ attr: { class: "workspace-list-meta" } });
          item.meta.filter(Boolean).forEach((value) => meta.createEl("span", { text: String(value) }));
        }
        if (item.detail) copy.createEl("div", { text: item.detail, attr: { class: "workspace-list-detail" } });

        // item.actions: optional action buttons only (no default "열기")
        // Pass actions: [] or omit for title-click-only rows.
        // Legacy: if actions is undefined, keep a single 열기 for older callers (Knowledge etc.)
        let itemActions;
        if (Array.isArray(item.actions)) {
          itemActions = item.actions;
        } else if (item.path) {
          itemActions = [{ label: "열기", path: item.path }];
        } else {
          itemActions = [];
        }

        if (itemActions.length) {
          const actionCell = row.createDiv({ attr: { class: "workspace-list-row-actions" } });
          itemActions.forEach((action) => {
            const control = makeButton(actionCell, action.label, {
              primary: !!action.primary,
              className: action.className || "workspace-list-open"
            });
            control.onclick = () => {
              if (typeof action.onClick === "function") return action.onClick(item);
              if (action.beside || action.openBeside) {
                return openBeside(app, action.path || item.path);
              }
              return openSource(app, action.path || item.path);
            };
          });
        }
      });
    });
  }

  const api = { openSource, openBeside, render, makeButton };
  root.ProdigyListWorkspace = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
