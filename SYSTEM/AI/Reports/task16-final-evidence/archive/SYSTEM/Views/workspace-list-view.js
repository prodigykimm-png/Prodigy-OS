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
.prodigy-list-workspace{max-inline-size:1068px;margin:0 auto;padding:var(--ke-space-3) var(--ke-space-3) var(--ke-space-7);font-size:var(--ke-type-body);line-height:var(--ke-leading-body);letter-spacing:0;overflow-wrap:anywhere;word-break:keep-all}.workspace-list-header{display:flex;align-items:flex-end;justify-content:space-between;gap:var(--ke-space-5);padding:var(--ke-space-3) 0 var(--ke-space-5);border-block-end:1px solid var(--ke-color-border,var(--background-modifier-border))}.workspace-list-title h1{margin:0;font-size:var(--ke-type-title);line-height:var(--ke-leading-body);letter-spacing:0}.workspace-list-title p{margin:var(--ke-space-2) 0 0;color:var(--ke-color-muted,var(--text-muted));font-size:var(--ke-type-body);line-height:var(--ke-leading-body)}.workspace-list-actions{display:flex;gap:var(--ke-space-3);flex-wrap:wrap}.workspace-list-section{padding:var(--ke-space-5) 0 var(--ke-space-2)}.workspace-list-section h2{font-size:var(--ke-type-heading);line-height:var(--ke-leading-body);letter-spacing:0;margin:0 0 var(--ke-space-3)}.workspace-list-row{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:var(--ke-space-5);align-items:center;padding:var(--ke-space-4) 0;border-block-start:1px solid var(--ke-color-border,var(--background-modifier-border))}.workspace-list-copy{min-inline-size:0}.workspace-list-copy strong{display:block;overflow-wrap:anywhere}.workspace-list-name{display:inline;font-weight:700;overflow-wrap:anywhere;color:var(--ke-color-interactive,var(--text-accent));cursor:pointer;text-decoration:none;border-block-end:1px solid transparent}.workspace-list-name:hover{border-block-end-color:currentColor}.workspace-list-name:focus-visible{outline:2px solid var(--ke-color-accent,var(--text-accent));outline-offset:2px;border-radius:var(--ke-radius-control)}.workspace-list-meta{display:flex;gap:var(--ke-space-3);flex-wrap:wrap;margin-block-start:var(--ke-space-2);color:var(--ke-color-muted,var(--text-muted));font-size:var(--ke-type-label);line-height:var(--ke-leading-body)}.workspace-list-detail{margin-block-start:var(--ke-space-2);color:var(--ke-color-muted,var(--text-muted));font-size:var(--ke-type-body);line-height:var(--ke-leading-body);overflow-wrap:anywhere}.workspace-list-empty{padding:var(--ke-space-5) 0;color:var(--ke-color-muted,var(--text-muted));font-size:var(--ke-type-body);line-height:var(--ke-leading-body)}.workspace-list-count{margin-inline-start:var(--ke-space-2);color:var(--ke-color-muted,var(--text-muted));font-weight:500;font-size:var(--ke-type-label);line-height:var(--ke-leading-control)}.workspace-list-row-actions{display:flex;gap:var(--ke-space-2);flex-wrap:wrap;justify-content:flex-end;align-items:center}.workspace-list-actions button,.workspace-list-row-actions button{min-block-size:var(--ke-touch-target)}@media(max-width:833px){.workspace-list-header{align-items:stretch;flex-direction:column}.workspace-list-actions{display:grid;grid-template-columns:1fr}.workspace-list-row{grid-template-columns:1fr;gap:var(--ke-space-3)}.workspace-list-row-actions{justify-self:stretch;display:grid;grid-template-columns:1fr 1fr;gap:var(--ke-space-2)}}@media(max-width:419px){.workspace-list-row-actions{grid-template-columns:1fr}}@media(forced-colors:active){.workspace-list-name:focus-visible{outline-color:Highlight}}@media(prefers-reduced-motion:reduce){.prodigy-list-workspace *{transition:none!important;animation:none!important;transform:none!important}}
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
