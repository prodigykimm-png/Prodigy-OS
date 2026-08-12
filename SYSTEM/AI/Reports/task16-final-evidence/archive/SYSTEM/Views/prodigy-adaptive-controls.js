(function (root) {
  "use strict";

  const STYLE_ID = "prodigy-adaptive-controls-styles";
  let tabSequence = 0;
  let sheetSequence = 0;

  function ensureStyles() {
    if (typeof document === "undefined") return;
    let style = document.getElementById(STYLE_ID);
    if (!style) {
      style = document.createElement("style");
      style.id = STYLE_ID;
      document.head.appendChild(style);
    }
    style.textContent = `
.prodigy-adaptive-tabs {
  display: flex;
  align-items: stretch;
  flex-wrap: wrap;
  gap: var(--ke-space-2, 4px);
  max-inline-size: 100%;
  min-inline-size: 0;
  overflow: visible;
  word-break: keep-all;
  overflow-wrap: anywhere;
}
.prodigy-adaptive-tab {
  flex: 0 1 auto;
  min-block-size: var(--ke-touch-target, 44px);
  min-inline-size: min(var(--ke-touch-target, 44px), 100%);
  max-inline-size: 100%;
  padding: var(--ke-space-1, 2px) var(--ke-space-3, 8px);
  border: 1px solid var(--ke-color-border, var(--background-modifier-border));
  border-radius: var(--ke-radius-control, 4px);
  background: var(--ke-color-surface, var(--background-primary));
  color: var(--ke-color-text, var(--text-normal));
  font: inherit;
  line-height: var(--ke-leading-control, 1.35);
  white-space: normal;
  text-align: center;
  word-break: keep-all;
  overflow-wrap: anywhere;
  cursor: pointer;
  box-sizing: border-box;
  box-shadow: none;
  -webkit-appearance: none;
  appearance: none;
}
.prodigy-adaptive-tab[aria-selected="true"] {
  border-color: var(--ke-color-accent, var(--text-accent));
  background: var(--ke-color-hover, var(--background-modifier-hover));
  color: var(--ke-color-accent, var(--text-accent));
}
.prodigy-adaptive-tab:focus-visible,
.prodigy-action-bar button:focus-visible,
.prodigy-bottom-sheet button:focus-visible {
  outline: 2px solid var(--ke-color-accent, var(--text-accent));
  outline-offset: 2px;
}
.prodigy-action-bar {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--ke-space-2, 4px);
  min-block-size: var(--ke-action-bar-height, 52px);
  min-inline-size: 0;
  padding: var(--ke-space-2, 4px);
  padding-block-end: calc(var(--ke-space-2, 4px) + env(safe-area-inset-bottom, 0px));
  border-top: 1px solid var(--ke-color-border, var(--background-modifier-border));
  background: var(--ke-color-surface, var(--background-primary));
  color: var(--ke-color-text, var(--text-normal));
  box-sizing: border-box;
  overscroll-behavior: contain;
}
.prodigy-action-bar-primary,
.prodigy-action-bar-secondary {
  display: flex;
  align-items: center;
  flex: 1 1 auto;
  flex-wrap: wrap;
  gap: var(--ke-space-2, 4px);
  min-inline-size: 0;
}
.prodigy-action-bar-secondary {
  flex: 0 1 auto;
}
.prodigy-action-bar button {
  min-block-size: var(--ke-touch-target, 44px);
  min-inline-size: min(var(--ke-touch-target, 44px), 100%);
  max-inline-size: 100%;
  box-shadow: none;
  white-space: normal;
  word-break: keep-all;
  overflow-wrap: anywhere;
}
.prodigy-action-bar-more {
  display: none;
  margin-inline-start: auto;
}
.prodigy-bottom-sheet {
  --prodigy-safe-area-bottom: env(safe-area-inset-bottom, 0px);
  position: fixed;
  inset: 0;
  z-index: 1000;
  display: grid;
  align-items: end;
  min-inline-size: 0;
  max-inline-size: 100%;
  overscroll-behavior: contain;
  color: var(--ke-color-text, var(--text-normal));
}
.prodigy-bottom-sheet[hidden] {
  display: none;
}
.prodigy-bottom-sheet-backdrop {
  position: absolute;
  inset: 0;
  min-block-size: 0;
  min-inline-size: 0;
  border: 0;
  background: var(--ke-color-backdrop, var(--background-modifier-cover));
  cursor: default;
}
.prodigy-bottom-sheet-panel {
  position: relative;
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  inline-size: 100%;
  max-block-size: min(70vh, 560px);
  min-block-size: 0;
  min-inline-size: 0;
  padding: var(--ke-space-4, 12px);
  padding-block-end: calc(var(--ke-space-4, 12px) + var(--prodigy-safe-area-bottom));
  border: 1px solid var(--ke-color-border, var(--background-modifier-border));
  border-radius: var(--ke-radius-panel, 8px) var(--ke-radius-panel, 8px) 0 0;
  background: var(--ke-color-surface, var(--background-primary));
  color: var(--ke-color-text, var(--text-normal));
  box-sizing: border-box;
}
.prodigy-bottom-sheet-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--ke-space-3, 8px);
  min-inline-size: 0;
}
.prodigy-bottom-sheet-title {
  margin: 0;
  min-inline-size: 0;
  font-size: var(--ke-type-title, 1.05rem);
  line-height: var(--ke-leading-body, 1.45);
  white-space: normal;
  word-break: keep-all;
  overflow-wrap: anywhere;
}
.prodigy-bottom-sheet button {
  min-block-size: var(--ke-touch-target, 44px);
  min-inline-size: min(var(--ke-touch-target, 44px), 100%);
  max-inline-size: 100%;
  box-shadow: none;
}
.prodigy-adaptive-tab.prodigy-adaptive-tab,
.prodigy-action-bar.prodigy-action-bar button,
.prodigy-bottom-sheet.prodigy-bottom-sheet button {
  box-shadow: none;
}
.prodigy-bottom-sheet-close {
  flex: 0 0 auto;
}
.prodigy-bottom-sheet-body {
  min-block-size: 0;
  min-inline-size: 0;
  max-inline-size: 100%;
  overflow-y: auto;
  overscroll-behavior: contain;
  word-break: keep-all;
  overflow-wrap: anywhere;
}
@media (max-width: 767px) {
  .prodigy-adaptive-tab,
  .prodigy-action-bar button,
  .prodigy-bottom-sheet button {
    min-block-size: var(--ke-touch-target, 44px);
  }
  .prodigy-action-bar {
    position: sticky;
    inset-block-end: 0;
  }
  .prodigy-action-bar-secondary {
    display: none;
  }
  .prodigy-action-bar-more {
    display: inline-flex;
  }
}
@media (min-width: 768px) {
  .prodigy-bottom-sheet {
    align-items: center;
    justify-items: center;
  }
  .prodigy-bottom-sheet-panel {
    inline-size: min(38%, 420px);
    border-radius: var(--ke-radius-panel, 8px);
  }
}
@media (forced-colors: active) {
  .prodigy-adaptive-tab:focus-visible,
  .prodigy-action-bar button:focus-visible,
  .prodigy-bottom-sheet button:focus-visible {
    outline-color: Highlight;
  }
  .prodigy-adaptive-tab[aria-selected="true"] {
    border-color: Highlight;
    color: Highlight;
  }
}
@media (prefers-reduced-motion: reduce) {
  .prodigy-adaptive-tabs *,
  .prodigy-action-bar *,
  .prodigy-bottom-sheet * {
    scroll-behavior: auto !important;
    transition: none !important;
    animation: none !important;
    transform: none !important;
  }
}`;
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
    const titleId = `prodigy-sheet-title-${++sheetSequence}`;
    const sheet = parent.createEl("div", {
      attr: {
        class: "prodigy-bottom-sheet",
        id: `prodigy-bottom-sheet-${titleId}`,
        role: "dialog",
        "aria-modal": "true",
        "aria-label": opts.title || "추가 작업",
        "aria-labelledby": titleId,
        "aria-hidden": "true",
        hidden: ""
      }
    });
    sheet.id = `prodigy-bottom-sheet-${titleId}`;
    sheet.hidden = true;
    const backdrop = sheet.createEl("div", {
      attr: {
        class: "prodigy-bottom-sheet-backdrop",
        role: "presentation",
        "aria-hidden": "true"
      }
    });
    const panel = sheet.createEl("section", { attr: { class: "prodigy-bottom-sheet-panel" } });
    const header = panel.createEl("header", { attr: { class: "prodigy-bottom-sheet-header" } });
    header.createEl("h2", {
      text: opts.title || "추가 작업",
      attr: { class: "prodigy-bottom-sheet-title", id: titleId }
    });
    const closeButton = button(header, { label: "닫기" }, "prodigy-btn prodigy-bottom-sheet-close");
    const body = panel.createEl("div", { attr: { class: "prodigy-bottom-sheet-body" } });
    let focusReturn = null;
    function attachSheet() {
      if (sheet.parentNode || sheet.parent) return;
      if (typeof parent.appendChild === "function") parent.appendChild(sheet);
      else if (Array.isArray(parent.children)) {
        parent.children.push(sheet);
        sheet.parent = parent;
      }
    }
    function detachSheet() {
      if (typeof sheet.remove === "function") sheet.remove();
    }
    function open(invoker) {
      focusReturn = invoker || (typeof document !== "undefined" ? document.activeElement : null);
      attachSheet();
      sheet.hidden = false;
      if (typeof sheet.removeAttribute === "function") sheet.removeAttribute("hidden");
      if (typeof sheet.setAttribute === "function") sheet.setAttribute("aria-hidden", "false");
      if (typeof closeButton.focus === "function") closeButton.focus();
      if (typeof opts.onOpen === "function") opts.onOpen();
    }
    function close() {
      sheet.hidden = true;
      if (typeof sheet.setAttribute === "function") {
        sheet.setAttribute("hidden", "");
        sheet.setAttribute("aria-hidden", "true");
      }
      detachSheet();
      if (focusReturn && typeof focusReturn.focus === "function") focusReturn.focus();
      if (typeof opts.onClose === "function") opts.onClose();
    }
    backdrop.onclick = close;
    closeButton.onclick = close;
    sheet.onkeydown = function (event) {
      if (!event) return;
      if (event.key === "Escape") {
        if (typeof event.preventDefault === "function") event.preventDefault();
        close();
        return;
      }
      if (event.key !== "Tab" || typeof panel.querySelectorAll !== "function") return;
      const focusable = Array.from(panel.querySelectorAll("button:not(:disabled), [href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex=\"-1\"])"));
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = typeof document !== "undefined" ? document.activeElement : null;
      if (event.shiftKey && active === first) {
        if (typeof event.preventDefault === "function") event.preventDefault();
        if (typeof last.focus === "function") last.focus();
      } else if (!event.shiftKey && active === last) {
        if (typeof event.preventDefault === "function") event.preventDefault();
        if (typeof first.focus === "function") first.focus();
      }
    };
    detachSheet();
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
    let more = null;
    if (secondaryActions.length) {
      sheet = BottomSheet(opts.sheetParent || parent, {
        title: opts.sheetTitle || "추가 작업",
        onOpen: () => {
          if (more && typeof more.setAttribute === "function") more.setAttribute("aria-expanded", "true");
        },
        onClose: () => {
          if (more && typeof more.setAttribute === "function") more.setAttribute("aria-expanded", "false");
        }
      });
      secondaryActions.forEach((action) => button(sheet.body, action));
      more = button(bar, { label: opts.moreLabel || "더 보기" }, "prodigy-btn prodigy-action-bar-more");
      if (typeof more.setAttribute === "function") {
        more.setAttribute("aria-haspopup", "dialog");
        more.setAttribute("aria-expanded", "false");
        const sheetId = sheet.element && (sheet.element.id || (sheet.element.attributes && sheet.element.attributes.id));
        if (sheetId) more.setAttribute("aria-controls", sheetId);
      }
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
    const panelPlacements = new Map(tabs.filter((tab) => tab.panel).map((tab) => [tab.panel, {
      parent: tab.panel.parentElement || tab.panel.parent || null,
      next: tab.panel.nextSibling || null
    }]));
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
        if (next >= 0) { if (typeof event.preventDefault === "function") event.preventDefault(); select(enabled[next].tab.id, true); enabled[next].control.focus(); }
      };
      return { tab, control };
    });
    function attachPanel(panel) {
      const placement = panelPlacements.get(panel);
      if (!placement || !placement.parent || panel.parentElement || panel.parent) return;
      if (typeof placement.parent.insertBefore === "function") {
        const anchor = placement.next && placement.next.parentNode === placement.parent ? placement.next : null;
        placement.parent.insertBefore(panel, anchor);
      } else if (typeof placement.parent.appendChild === "function") placement.parent.appendChild(panel);
      else if (Array.isArray(placement.parent.children)) {
        placement.parent.children.push(panel);
        panel.parent = placement.parent;
      }
    }
    function detachPanel(panel) {
      if (typeof panel.remove === "function") panel.remove();
    }
    function applySelection() {
      controls.forEach(({ tab, control }) => {
        const active = tab.id === activeId;
        control.setAttribute("aria-selected", active ? "true" : "false");
        control.setAttribute("tabindex", active ? "0" : "-1");
        if (tab.panel) {
          if (active) attachPanel(tab.panel);
          tab.panel.hidden = !active;
          if (!active) detachPanel(tab.panel);
        }
      });
    }
    function select(id, notify) {
      if (!tabs.some((tab) => tab.id === id && !tab.disabled)) {
        applySelection();
        return activeId;
      }
      activeId = id;
      applySelection();
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
