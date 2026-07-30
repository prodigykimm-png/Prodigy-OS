(function (root) {
  "use strict";

  const STYLE_ID = "prodigy-adaptive-controls-styles";
  let tabSequence = 0;

  function ensureStyles() {
    if (typeof document === "undefined") return;
    let style = document.getElementById(STYLE_ID);
    if (!style) {
      style = document.createElement("style");
      style.id = STYLE_ID;
      document.head.appendChild(style);
    }
    style.textContent = `.prodigy-adaptive-tabs{display:flex;align-items:stretch;gap:var(--ke-space-2,4px);min-inline-size:0;overflow-x:auto}.prodigy-adaptive-tab{flex:0 0 auto;min-block-size:32px;border:1px solid var(--background-modifier-border);border-radius:var(--ke-radius-control,4px);background:var(--background-primary);color:var(--text-normal)}.prodigy-adaptive-tab[aria-selected=true]{border-color:var(--text-accent);background:var(--background-modifier-hover);color:var(--text-accent)}.prodigy-adaptive-tab:focus-visible,.prodigy-action-bar button:focus-visible,.prodigy-bottom-sheet button:focus-visible{outline:2px solid var(--text-accent);outline-offset:2px}.prodigy-action-bar{display:flex;align-items:center;gap:var(--ke-space-2,4px);min-block-size:52px;padding:var(--ke-space-2,4px);border-top:1px solid var(--background-modifier-border);background:var(--background-primary)}.prodigy-action-bar-primary,.prodigy-action-bar-secondary{display:flex;align-items:center;flex-wrap:wrap;gap:var(--ke-space-2,4px)}.prodigy-action-bar-more{display:none}.prodigy-bottom-sheet{position:fixed;inset:0;z-index:1000;display:grid;align-items:end}.prodigy-bottom-sheet[hidden]{display:none}.prodigy-bottom-sheet-backdrop{position:absolute;inset:0;border:0;background:var(--background-modifier-cover);cursor:default}.prodigy-bottom-sheet-panel{position:relative;display:grid;grid-template-rows:auto minmax(0,1fr);max-block-size:min(70vh, 560px);min-inline-size:0;padding:var(--ke-space-4,12px);border:1px solid var(--background-modifier-border);border-radius:var(--ke-radius-panel,8px) var(--ke-radius-panel,8px) 0 0;background:var(--background-primary);color:var(--text-normal)}.prodigy-bottom-sheet-header{display:flex;align-items:center;justify-content:space-between;gap:var(--ke-space-3,8px)}.prodigy-bottom-sheet-title{margin:0;font-size:var(--ke-type-title,1.05rem);word-break:keep-all;overflow-wrap:anywhere}.prodigy-bottom-sheet-body{min-block-size:0;overflow:auto;word-break:keep-all;overflow-wrap:anywhere}@media(max-width:767px){.prodigy-adaptive-tab,.prodigy-action-bar button,.prodigy-bottom-sheet button{min-block-size:44px}.prodigy-action-bar{position:sticky;inset-block-end:0;min-block-size:52px}.prodigy-action-bar-secondary{display:none}.prodigy-action-bar-more{display:inline-flex;margin-inline-start:auto}}@media(min-width:768px){.prodigy-bottom-sheet{align-items:center;justify-items:center}.prodigy-bottom-sheet-panel{inline-size:min(38%, 420px);border-radius:var(--ke-radius-panel,8px)}}@media(prefers-reduced-motion:reduce){.prodigy-adaptive-tabs *,.prodigy-action-bar *,.prodigy-bottom-sheet *{transition:none!important;animation:none!important;transform:none!important}}`;
  }

  function button(parent, action, className) {
    const control = parent.createEl("button", { text: action.label, attr: { type: "button", class: className || "prodigy-btn" } });
    control.disabled = !!action.disabled;
    control.onclick = function (event) { if (!control.disabled && typeof action.onClick === "function") return action.onClick(event); };
    return control;
  }

  function BottomSheet(parent, options) {
    ensureStyles();
    const opts = options || {};
    const sheet = parent.createEl("div", { attr: { class: "prodigy-bottom-sheet", role: "dialog", "aria-modal": "true", "aria-label": opts.title || "추가 작업", hidden: "" } });
    sheet.hidden = true;
    const backdrop = sheet.createEl("button", { attr: { type: "button", class: "prodigy-bottom-sheet-backdrop", "aria-label": "닫기", tabindex: "-1" } });
    const panel = sheet.createEl("section", { attr: { class: "prodigy-bottom-sheet-panel" } });
    const header = panel.createEl("header", { attr: { class: "prodigy-bottom-sheet-header" } });
    header.createEl("h2", { text: opts.title || "추가 작업", attr: { class: "prodigy-bottom-sheet-title" } });
    const closeButton = button(header, { label: "닫기" }, "prodigy-btn prodigy-bottom-sheet-close");
    const body = panel.createEl("div", { attr: { class: "prodigy-bottom-sheet-body" } });
    let focusReturn = null;
    function open(invoker) {
      focusReturn = invoker || (typeof document !== "undefined" ? document.activeElement : null);
      sheet.hidden = false;
      if (typeof sheet.removeAttribute === "function") sheet.removeAttribute("hidden");
      if (typeof closeButton.focus === "function") closeButton.focus();
      if (typeof opts.onOpen === "function") opts.onOpen();
    }
    function close() {
      sheet.hidden = true;
      if (typeof sheet.setAttribute === "function") sheet.setAttribute("hidden", "");
      if (focusReturn && typeof focusReturn.focus === "function") focusReturn.focus();
      if (typeof opts.onClose === "function") opts.onClose();
    }
    backdrop.onclick = close;
    closeButton.onclick = close;
    sheet.onkeydown = function (event) { if (event && event.key === "Escape") close(); };
    return { element: sheet, panel, body, open, close };
  }

  function AdaptiveActionBar(parent, options) {
    ensureStyles();
    const opts = options || {};
    const bar = parent.createEl("div", { attr: { class: "prodigy-action-bar", role: "toolbar", "aria-label": opts.label || "작업" } });
    const primary = bar.createEl("div", { attr: { class: "prodigy-action-bar-primary" } });
    (opts.actions || []).forEach((action) => button(primary, action));
    const secondaryActions = opts.secondaryActions || [];
    const secondary = bar.createEl("div", { attr: { class: "prodigy-action-bar-secondary" } });
    secondaryActions.forEach((action) => button(secondary, action));
    let sheet = null;
    if (secondaryActions.length) {
      sheet = BottomSheet(opts.sheetParent || parent, { title: opts.sheetTitle || "추가 작업" });
      secondaryActions.forEach((action) => button(sheet.body, action));
      const more = button(bar, { label: opts.moreLabel || "더 보기" }, "prodigy-btn prodigy-action-bar-more");
      more.onclick = function () { sheet.open(more); };
    }
    return { element: bar, primary, secondary, sheet };
  }

  function AdaptiveTabs(parent, options) {
    ensureStyles();
    const opts = options || {};
    const tabs = opts.tabs || [];
    const tablist = parent.createEl("div", { attr: { class: "prodigy-adaptive-tabs", role: "tablist", "aria-label": opts.label || "보기 선택" } });
    const sequence = ++tabSequence;
    const firstEnabled = tabs.find((tab) => !tab.disabled);
    let activeId = tabs.some((tab) => tab.id === opts.activeId && !tab.disabled) ? opts.activeId : (firstEnabled && firstEnabled.id) || "";
    const controls = tabs.map((tab, index) => {
      const control = tablist.createEl("button", { text: tab.label, attr: { type: "button", class: "prodigy-adaptive-tab", role: "tab", id: `prodigy-tab-${sequence}-${index}` } });
      control.disabled = !!tab.disabled;
      if (tab.panel) {
        const panelId = tab.panel.id || `prodigy-panel-${sequence}-${index}`;
        tab.panel.id = panelId;
        control.setAttribute("aria-controls", panelId);
        tab.panel.setAttribute("role", "tabpanel");
        tab.panel.setAttribute("aria-labelledby", `prodigy-tab-${sequence}-${index}`);
      }
      control.onclick = function () { select(tab.id, true); };
      control.onkeydown = function (event) {
        if (!event) return;
        const enabled = controls.filter((item) => !item.control.disabled);
        if (!enabled.length) return;
        const current = enabled.findIndex((item) => item.tab.id === tab.id);
        let next = -1;
        if (event.key === "ArrowRight") next = (current + 1) % enabled.length;
        if (event.key === "ArrowLeft") next = (current - 1 + enabled.length) % enabled.length;
        if (event.key === "Home") next = 0;
        if (event.key === "End") next = enabled.length - 1;
        if (next >= 0) { event.preventDefault(); select(enabled[next].tab.id, true); enabled[next].control.focus(); }
      };
      return { tab, control };
    });
    function select(id, notify) {
      if (!tabs.some((tab) => tab.id === id && !tab.disabled)) return activeId;
      activeId = id;
      controls.forEach(({ tab, control }) => {
        const active = tab.id === activeId;
        control.setAttribute("aria-selected", active ? "true" : "false");
        control.setAttribute("tabindex", active ? "0" : "-1");
        if (tab.panel) tab.panel.hidden = !active;
      });
      if (notify && typeof opts.onChange === "function") opts.onChange(activeId);
      return activeId;
    }
    select(activeId, false);
    return { element: tablist, select, getActiveTab: function () { return activeId; } };
  }

  const api = Object.freeze({ AdaptiveTabs, AdaptiveActionBar, BottomSheet });
  root.ProdigyAdaptiveControls = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
