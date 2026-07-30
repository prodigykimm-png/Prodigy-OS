(function (root) {
  "use strict";

  const STYLE_ID = "prodigy-app-shell-styles";

  function ensureStyles() {
    if (typeof document === "undefined") return;
    let style = document.getElementById(STYLE_ID);
    if (!style) {
      style = document.createElement("style");
      style.id = STYLE_ID;
      document.head.appendChild(style);
    }
    style.textContent = `.prodigy-app-shell{--prodigy-workspace-bar-height:48px;--prodigy-action-bar-height:52px;--prodigy-touch-target:44px;display:grid;grid-template-rows:auto auto minmax(0,1fr);max-block-size:100dvb;min-block-size:0;min-inline-size:0;color:var(--text-normal)}.prodigy-workspace-bar{display:flex;align-items:center;gap:var(--ke-space-3,8px);min-block-size:var(--prodigy-workspace-bar-height);border-bottom:1px solid var(--background-modifier-border);min-inline-size:0}.prodigy-workspace-title{margin:0;min-inline-size:0;font-size:var(--ke-type-title,1.05rem);overflow-wrap:anywhere;word-break:keep-all}.prodigy-workspace-switcher{min-block-size:32px;max-inline-size:16rem;border:1px solid var(--background-modifier-border);border-radius:var(--ke-radius-control,4px);background:var(--background-primary);color:var(--text-normal)}.prodigy-workspace-switcher:focus-visible,.prodigy-context-action:focus-visible{outline:2px solid var(--text-accent);outline-offset:2px}.prodigy-context-bar{display:flex;align-items:center;justify-content:space-between;gap:var(--ke-space-3,8px);min-inline-size:0;padding-block:var(--ke-space-2,4px);color:var(--text-muted);font-size:var(--ke-type-label,.72rem);border-bottom:1px solid var(--background-modifier-border)}.prodigy-context-items,.prodigy-context-actions{display:flex;align-items:center;flex-wrap:wrap;gap:var(--ke-space-3,8px);min-inline-size:0}.prodigy-context-item{overflow-wrap:anywhere;word-break:keep-all}.prodigy-app-shell-body{min-block-size:0;min-inline-size:0;overflow:auto}@media(max-width:767px){.prodigy-workspace-bar{align-items:stretch;flex-direction:column;justify-content:center;padding-block:var(--ke-space-2,4px)}.prodigy-workspace-switcher{inline-size:100%;max-inline-size:none;min-block-size:var(--prodigy-touch-target)}.prodigy-context-bar{align-items:stretch;flex-direction:column}.prodigy-context-actions>*{min-block-size:var(--prodigy-touch-target)}}@media(min-width:768px){.prodigy-workspace-bar{flex-direction:row}}@media(min-width:1024px){.prodigy-app-shell{margin-inline:auto}}@media(prefers-reduced-motion:reduce){.prodigy-app-shell *{scroll-behavior:auto!important;transition:none!important;animation:none!important}}`;
  }

  function registry() {
    if (root.ProdigyWorkspaceRegistry) return root.ProdigyWorkspaceRegistry;
    if (typeof require === "function") {
      try { return require("./workspace-registry.js"); } catch (_error) { return null; }
    }
    return null;
  }

  async function openWorkspace(app, item) {
    if (!app || !item) return null;
    const path = item.path;
    if (app.workspace && typeof app.workspace.openLinkText === "function") {
      try { return await app.workspace.openLinkText(path.replace(/\.md$/i, ""), "", false); } catch (_error) { /* use leaf fallback */ }
    }
    const file = app.vault && typeof app.vault.getAbstractFileByPath === "function" ? app.vault.getAbstractFileByPath(path) : null;
    const leaf = app.workspace && typeof app.workspace.getLeaf === "function" ? app.workspace.getLeaf(false) : null;
    return file && leaf && typeof leaf.openFile === "function" ? leaf.openFile(file) : null;
  }

  function WorkspaceSwitcher(parent, options) {
    ensureStyles();
    const opts = options || {};
    const source = registry();
    const items = source && typeof source.items === "function" ? source.items() : [];
    const activeId = opts.activeId || (opts.stateStore && opts.stateStore.getActiveWorkspace()) || "";
    const select = parent.createEl("select", { attr: { class: "prodigy-workspace-switcher", "aria-label": "워크스페이스 선택" } });
    items.forEach((item) => {
      const attr = { value: item.id };
      if (item.id === activeId) attr.selected = "selected";
      select.createEl("option", { text: item.label, attr });
    });
    select.onchange = async function () {
      const item = source && typeof source.find === "function" ? source.find(select.value) : items.find((entry) => entry.id === select.value);
      if (!item) return null;
      if (opts.stateStore && typeof opts.stateStore.setActiveWorkspace === "function") opts.stateStore.setActiveWorkspace(item.id);
      if (typeof opts.onChange === "function") {
        try { return await opts.onChange(item); } catch (_error) { return openWorkspace(opts.app, item); }
      }
      return openWorkspace(opts.app, item);
    };
    return select;
  }

  function ContextBar(parent, options) {
    ensureStyles();
    const opts = options || {};
    const bar = parent.createEl("div", { attr: { class: "prodigy-context-bar", role: "region", "aria-label": opts.label || "현재 문맥" } });
    const items = bar.createEl("div", { attr: { class: "prodigy-context-items" } });
    (opts.items || []).forEach((item) => items.createEl("span", { text: typeof item === "string" ? item : item.label, attr: { class: "prodigy-context-item" } }));
    const actions = bar.createEl("div", { attr: { class: "prodigy-context-actions" } });
    (opts.actions || []).forEach((action) => {
      const button = actions.createEl("button", { text: action.label, attr: { type: "button", class: "prodigy-btn prodigy-context-action" } });
      button.onclick = action.onClick || null;
    });
    return bar;
  }

  function AppShell(container, options) {
    ensureStyles();
    const opts = options || {};
    if (opts.replace !== false && typeof container.empty === "function") container.empty();
    const shell = container.createEl("section", { attr: { class: "prodigy-app-shell", "data-workspace-id": opts.workspaceId || "" } });
    const workspaceBar = shell.createEl("header", { attr: { class: "prodigy-workspace-bar" } });
    const switcher = WorkspaceSwitcher(workspaceBar, { app: opts.app, activeId: opts.workspaceId, stateStore: opts.stateStore, onChange: opts.onWorkspaceChange });
    const title = workspaceBar.createEl("h1", { text: opts.title || "워크스페이스", attr: { class: "prodigy-workspace-title" } });
    const contextBar = ContextBar(shell, opts.context || {});
    const body = shell.createEl("main", { attr: { class: "prodigy-app-shell-body", tabindex: "-1" } });
    if (typeof opts.renderBody === "function") opts.renderBody(body);
    return { element: shell, workspaceBar, switcher, title, contextBar, body };
  }

  const api = Object.freeze({ AppShell, ContextBar, WorkspaceSwitcher });
  root.ProdigyAppShell = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
