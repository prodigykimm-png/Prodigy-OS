(function (root) {
  "use strict";

  function openSource(app, path) {
    return app.workspace.openLinkText(String(path || "").replace(/\.md$/, ""), "", false);
  }
  function render(options) {
    const { app, container, title, subtitle = "", actions = [], sections = [] } = options;
    container.empty();
    container.addClass("prodigy-list-workspace");
    if (root.ProdigyUI) root.ProdigyUI.ensureStyles();
    const style = container.createEl("style", { text: `
.prodigy-list-workspace{max-width:980px;margin:0 auto;padding:8px 8px 48px}.workspace-list-header{display:flex;align-items:flex-end;justify-content:space-between;gap:16px;padding:8px 0 22px;border-bottom:1px solid var(--background-modifier-border)}.workspace-list-title h1{margin:0;font-size:1.5em;letter-spacing:0}.workspace-list-title p{margin:5px 0 0;color:var(--text-muted);font-size:.84em;line-height:1.45}.workspace-list-actions{display:flex;gap:8px;flex-wrap:wrap}.workspace-list-section{padding:22px 0 6px}.workspace-list-section h2{font-size:1.02em;margin:0 0 12px}.workspace-list-row{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:16px;align-items:center;padding:13px 0;border-top:1px solid var(--background-modifier-border)}.workspace-list-copy{min-width:0}.workspace-list-copy strong{display:block;overflow-wrap:anywhere}.workspace-list-meta{display:flex;gap:8px;flex-wrap:wrap;margin-top:4px;color:var(--text-muted);font-size:.76em}.workspace-list-detail{margin-top:5px;color:var(--text-muted);font-size:.8em;line-height:1.45;overflow-wrap:anywhere}.workspace-list-empty{padding:18px 0;color:var(--text-muted);font-size:.84em}.workspace-list-count{margin-left:6px;color:var(--text-muted);font-weight:500;font-size:.78em}.workspace-list-actions button,.workspace-list-open{min-height:32px}@media(max-width:600px){.prodigy-list-workspace{padding:4px 4px 40px}.workspace-list-header{align-items:stretch;flex-direction:column}.workspace-list-actions{display:grid;grid-template-columns:1fr}.workspace-list-row{grid-template-columns:1fr;gap:10px}.workspace-list-open{justify-self:stretch}.workspace-list-title h1{font-size:1.3em}.workspace-list-actions button,.workspace-list-open{min-height:44px}}
` });
    style.setAttr && style.setAttr("data-prodigy-workspace-style", "true");
    const header = container.createDiv({ attr: { class: "workspace-list-header" } });
    const heading = header.createDiv({ attr: { class: "workspace-list-title" } });
    heading.createEl("h1", { text: title });
    if (subtitle) heading.createEl("p", { text: subtitle });
    const actionRow = header.createDiv({ attr: { class: "workspace-list-actions" } });
    actions.forEach((action) => {
      const control = root.ProdigyUI
        ? root.ProdigyUI.button(actionRow, action.label, { primary: !!action.primary })
        : actionRow.createEl("button", {
          text: action.label,
          attr: { type: "button", class: action.primary ? "prodigy-btn prodigy-btn-primary" : "prodigy-btn" }
        });
      control.onclick = () => action.onClick ? action.onClick() : openSource(app, action.path);
    });
    sections.forEach((section) => {
      const area = container.createDiv({ attr: { class: "workspace-list-section" } });
      const sectionTitle = area.createEl("h2", { text: section.title });
      sectionTitle.createEl("span", { text: String(section.items.length), attr: { class: "workspace-list-count" } });
      if (!section.items.length) {
        area.createEl("p", { text: section.empty, attr: { class: "workspace-list-empty" } });
        return;
      }
      section.items.forEach((item) => {
        const row = area.createDiv({ attr: { class: "workspace-list-row" } });
        const copy = row.createDiv({ attr: { class: "workspace-list-copy" } });
        copy.createEl("strong", { text: item.title });
        if (item.meta && item.meta.length) {
          const meta = copy.createDiv({ attr: { class: "workspace-list-meta" } });
          item.meta.filter(Boolean).forEach((value) => meta.createEl("span", { text: String(value) }));
        }
        if (item.detail) copy.createEl("div", { text: item.detail, attr: { class: "workspace-list-detail" } });
        const open = root.ProdigyUI
          ? root.ProdigyUI.button(row, "열기", { className: "workspace-list-open" })
          : row.createEl("button", { text: "열기", attr: { type: "button", class: "prodigy-btn workspace-list-open" } });
        open.onclick = () => openSource(app, item.path);
      });
    });
  }

  const api = { openSource, render };
  root.ProdigyListWorkspace = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
