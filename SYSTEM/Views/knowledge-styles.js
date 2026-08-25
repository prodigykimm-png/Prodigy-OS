(function (root) {
  "use strict";

  const T = root.ProdigyTokens || (typeof require === "function" ? require("./design-tokens.js") : {});
  const RESPONSIVE_BREAKPOINTS = T.RESPONSIVE_BREAKPOINTS || {};
  const CONTROL_HEIGHTS = T.CONTROL_HEIGHTS || {};

  const STYLE_ID = "prodigy-knowledge-styles";

  function ensureStyles(explicitDocument) {
    const documentRef = explicitDocument || (typeof document !== "undefined" ? document : null);
    if (!documentRef || !documentRef.head || typeof documentRef.createElement !== "function") return;
    const compactMax = Number(RESPONSIVE_BREAKPOINTS.collapsedNavMax) || 833;
    const touchTarget = Number(CONTROL_HEIGHTS.touchTarget) || 44;

    let styleEl = documentRef.getElementById(STYLE_ID);
    if (!styleEl) {
      styleEl = documentRef.createElement("style");
      styleEl.id = STYLE_ID;
      styleEl.setAttribute("data-knowledge-styles", "");
      documentRef.head.appendChild(styleEl);
    }
    if (root.ProdigyUI && typeof root.ProdigyUI.ensureStyles === "function") {
      root.ProdigyUI.ensureStyles();
    }

    styleEl.textContent = `
      .knowledge-explorer-shell, .knowledge-para-section, .knowledge-para-workspace, .knowledge-para-results, .knowledge-para-results-layout, .knowledge-para-source-list, .knowledge-para-selected-detail, .knowledge-para-detail-pane {
        box-sizing: border-box; min-inline-size: 0; max-inline-size: 100%;
        font-family: var(--ke-font-text, inherit);
        font-size: var(--ke-type-body);
        line-height: var(--ke-leading-body);
        word-break: keep-all; overflow-wrap: anywhere;
      }
      .knowledge-para-role-description, .knowledge-para-boundary-cue, .knowledge-para-action-status, .knowledge-para-section p, .knowledge-para-section dt, .knowledge-para-section dd, .knowledge-para-section h2, .knowledge-para-section h3, .knowledge-para-section h4 {
        overflow-wrap: anywhere; word-break: keep-all;
      }
      .knowledge-para-actions {
        display: flex; flex-wrap: wrap; align-items: center; gap: var(--ke-space-2, 8px); min-inline-size: 0; max-inline-size: 100%;
      }
      button.knowledge-para-action-btn, button.knowledge-para-clear, button.knowledge-para-clear-no-match, button.knowledge-para-source-select {
        box-sizing: border-box; display: inline-flex; align-items: center; justify-content: center; min-inline-size: var(--ke-touch-target, ${touchTarget}px); min-block-size: var(--ke-touch-target, ${touchTarget}px); max-inline-size: 100%; box-shadow: none; white-space: normal; overflow-wrap: anywhere; word-break: keep-all;
        border: var(--ke-border-width, 1px) solid var(--ke-color-border, var(--background-modifier-border));
        border-radius: var(--ke-radius-control, 8px);
        background: var(--ke-color-surface, var(--background-primary));
        color: var(--ke-color-text, var(--text-normal));
        cursor: pointer;
        will-change: transform;
        transition: transform 0.15s cubic-bezier(0.16, 1, 0.3, 1), background-color 0.15s ease, border-color 0.15s ease;
      }
      button.knowledge-para-action-btn:active, button.knowledge-para-clear:active, button.knowledge-para-source-select:active {
  transform: scale(0.95);
      }
      .knowledge-para-action-status { flex: 1 1 100%; min-inline-size: 0; }
      .knowledge-para-controls {
        display: flex; flex-wrap: wrap; align-items: end; gap: var(--ke-space-2, 8px); min-inline-size: 0; max-inline-size: 100%;
      }
      .knowledge-para-control-label {
        display: flex; flex: 1 1 12rem; flex-direction: column; gap: var(--ke-space-2, 8px); min-inline-size: 0; max-inline-size: 100%; overflow-wrap: anywhere; word-break: keep-all;
      }
      input.knowledge-para-search, select.knowledge-para-source-filter, select.knowledge-para-sort {
        box-sizing: border-box; inline-size: 100%; min-inline-size: var(--ke-touch-target, ${touchTarget}px); min-block-size: var(--ke-touch-target, ${touchTarget}px); max-inline-size: 100%; box-shadow: none; font: inherit; white-space: normal; overflow-wrap: anywhere; word-break: keep-all;
        padding: var(--ke-space-2) var(--ke-space-3);
        border: var(--ke-border-width, 1px) solid var(--ke-color-border, var(--background-modifier-border));
        border-radius: var(--ke-radius-control, 8px);
        background: var(--ke-color-surface, var(--background-primary));
        color: var(--ke-color-text, var(--text-normal));
      }
      .knowledge-para-action-btn:focus-visible, .knowledge-para-search:focus-visible, .knowledge-para-source-filter:focus-visible, .knowledge-para-sort:focus-visible, .knowledge-para-clear:focus-visible, .knowledge-para-clear-no-match:focus-visible, .knowledge-para-source-select:focus-visible, .knowledge-para-open-link:focus-visible {
        outline: 2px solid var(--ke-color-accent, var(--text-accent)); outline-offset: 2px;
      }
      .knowledge-para-results-layout {
        display: grid; grid-template-columns: minmax(12rem, .7fr) minmax(0, 1.3fr); gap: var(--ke-space-4, 17px); inline-size: 100%;
      }
      .knowledge-para-source-list, .knowledge-para-selected-detail, .knowledge-para-detail-pane, .knowledge-para-source-row, .knowledge-para-source-detail, .knowledge-para-linked-knowledge, .knowledge-para-link-list, .knowledge-para-link-item {
        min-inline-size: 0; max-inline-size: 100%;
      }
      .knowledge-para-source-row, .knowledge-para-link-item {
        display: flex; flex-wrap: wrap; align-items: center; gap: var(--ke-space-2, 8px);
      }
      .knowledge-para-source-select { flex: 1 1 10rem; }
      .knowledge-para-source-metadata {
        display: grid; grid-template-columns: minmax(0, auto) minmax(0, 1fr); gap: var(--ke-space-2, 8px); min-inline-size: 0; max-inline-size: 100%;
      }
      .knowledge-para-source-metadata dt, .knowledge-para-source-metadata dd { min-inline-size: 0; margin: 0; }

      .knowledge-workspace-tabs-mount, .knowledge-workspace-panel-host, .knowledge-workspace-panel { box-sizing: border-box; inline-size: 100%; max-inline-size: 100%; min-inline-size: 0; min-block-size: 0; }
      .prodigy-app-shell[data-workspace-id="knowledge"] { container-name: knowledge-shell; container-type: inline-size; }

      /* Glassmorphism Knowledge Workspace Tabs */
      .knowledge-workspace-tabs {
        box-sizing: border-box; display: flex; flex-wrap: wrap; gap: var(--ke-space-2, 8px); inline-size: 100%; max-inline-size: 100%; min-inline-size: 0; margin-block-end: var(--ke-space-4, 17px); padding: 8px 12px;
  background: var(--ke-color-surface, var(--background-primary));
        border: 1px solid var(--ke-color-border, var(--background-modifier-border));
        border-radius: var(--ke-radius-panel, 12px);
      }
      button.knowledge-workspace-tab { box-sizing: border-box; display: inline-flex; align-items: center; justify-content: center; flex: 1 1 12rem; min-inline-size: 0; min-block-size: var(--ke-touch-target, ${touchTarget}px); height: auto; box-shadow: none; cursor: pointer; white-space: normal;
        border: var(--ke-border-width, 1px) solid var(--ke-color-border, var(--background-modifier-border));
        border-radius: var(--ke-radius-control, 8px);
        background: var(--ke-color-surface, var(--background-primary));
        color: var(--ke-color-text, var(--text-normal));
        will-change: transform;
        transition: transform 0.15s cubic-bezier(0.16, 1, 0.3, 1), background-color 0.15s ease;
      }
      .knowledge-workspace-tab-label--compact { display: none; }
      button.knowledge-workspace-tab:active { transform: scale(0.97); }
      .knowledge-workspace-tab:focus-visible { outline: 2px solid var(--ke-color-accent, var(--text-accent)); outline-offset: 2px; }
      .knowledge-workspace-tab[aria-selected="true"] { border-color: var(--ke-color-interactive, var(--text-accent)); color: var(--ke-color-interactive, var(--text-accent)); font-weight: 700; }
      .knowledge-workspace-tab-desc, .knowledge-workspace-tab-role { margin: 0; color: var(--text-muted); overflow-wrap: anywhere; word-break: keep-all; }
      .knowledge-workspace-tab-desc.prodigy-full-bleed { padding: var(--ke-space-1, 4px) var(--ke-space-4, 17px); }
      .knowledge-workspace-tab-role { font-weight: 600; }

      .llmwiki-lifecycle { display: grid; gap: var(--ke-space-4, 17px); inline-size: 100%; max-inline-size: 100%; min-inline-size: 0; min-block-size: 0; overflow-y: visible; color: var(--text-normal); }
      [data-surface="llmwiki-lifecycle"] { overflow-y: visible; }
      .llmwiki-lifecycle.prodigy-full-bleed { padding-block: var(--ke-space-5, 24px); }
      .llmwiki-lifecycle, .llmwiki-lifecycle * { box-sizing: border-box; }
      .llmwiki-lifecycle > * { max-inline-size: 100%; min-inline-size: 0; }
      .llmwiki-lifecycle header, .llmwiki-lifecycle section, .llmwiki-lifecycle article, .llmwiki-lifecycle details { display: grid; gap: var(--ke-space-2, 8px); min-inline-size: 0; }
      .llmwiki-lifecycle h2, .llmwiki-lifecycle h3, .llmwiki-lifecycle p, .llmwiki-lifecycle dl { margin: 0; word-break: keep-all; overflow-wrap: anywhere; }
      .llmwiki-lifecycle__source-name { font-weight: 600; }
      .llmwiki-lifecycle__muted { color: var(--text-muted); }
      .llmwiki-lifecycle__error { color: var(--text-error); }
      .llmwiki-lifecycle__actions { display: flex; flex-wrap: wrap; gap: var(--ke-space-2, 8px); min-inline-size: 0; }
      .llmwiki-lifecycle button, .llmwiki-lifecycle summary, .llmwiki-lifecycle input { font: inherit; }
      .llmwiki-lifecycle button, .llmwiki-lifecycle summary { min-block-size: var(--ke-touch-target, ${touchTarget}px); max-inline-size: 100%; white-space: normal; word-break: keep-all; overflow-wrap: anywhere; }
      .llmwiki-lifecycle summary { display: flex; align-items: center; cursor: pointer; }
      .llmwiki-lifecycle button {
        cursor: pointer;
        will-change: transform;
        transition: transform 0.15s cubic-bezier(0.16, 1, 0.3, 1);
      }
.llmwiki-lifecycle button:active { transform: scale(0.95); }
      .llmwiki-lifecycle button[data-primary="true"] { background: var(--ke-color-interactive, var(--text-accent)); border-color: var(--ke-color-interactive, var(--text-accent)); color: var(--ke-color-on-interactive, var(--text-on-accent)); }
      .llmwiki-lifecycle button:disabled, .llmwiki-lifecycle input:disabled { cursor: not-allowed; opacity: .5; transform: none; }
      .llmwiki-lifecycle button:focus-visible, .llmwiki-lifecycle summary:focus-visible, .llmwiki-lifecycle a:focus-visible, .llmwiki-lifecycle input:focus-visible { outline: 2px solid var(--ke-color-accent, var(--text-accent)); outline-offset: 2px; }
      .llmwiki-lifecycle__status { min-block-size: var(--ke-touch-target, ${touchTarget}px); padding: 12px; border-inline-start: 2px solid var(--ke-color-interactive, var(--text-accent)); word-break: keep-all; overflow-wrap: anywhere; border-radius: var(--ke-radius-control, 6px); }
      .llmwiki-lifecycle__status[data-state="error"] { border-inline-start-color: var(--text-error); color: var(--text-error); }
      .maintenance-notice[data-maintenance-notice] {
        box-sizing: border-box; display: inline-flex; align-items: flex-start; min-block-size: var(--ke-touch-target, ${touchTarget}px); max-inline-size: 100%; margin-block: 0; padding: 8px 12px; border-inline-start: 2px solid var(--ke-color-interactive, var(--text-accent)); color: var(--text-muted); font-weight: 500; word-break: keep-all; overflow-wrap: anywhere; border-radius: var(--ke-radius-control, 6px);
      }
      .maintenance-notice[data-maintenance-notice][hidden],
      .maintenance-notice[data-maintenance-notice][data-state="clear"] { display: none; }
.llmwiki-lifecycle__settings { display: grid; gap: var(--ke-space-3, 12px); }
.llmwiki-lifecycle__setting { display: flex; align-items: flex-start; gap: var(--ke-space-2, 8px); min-block-size: var(--ke-touch-target, ${touchTarget}px); min-inline-size: 0; }
.llmwiki-lifecycle__setting span { word-break: keep-all; overflow-wrap: anywhere; }
.llmwiki-lifecycle__provider { display: flex; align-items: center; justify-content: space-between; gap: var(--ke-space-3, 12px); min-inline-size: 0; }
.llmwiki-lifecycle__provider-label { display: flex; align-items: center; justify-content: space-between; gap: var(--ke-space-3, 12px); inline-size: 100%; min-inline-size: 0; }
.llmwiki-lifecycle__provider-label span { color: var(--text-muted); word-break: keep-all; }
.llmwiki-lifecycle__provider select { min-block-size: var(--ke-touch-target, ${touchTarget}px); max-inline-size: min(100%, 28rem); min-inline-size: 0; font: inherit; }
.llmwiki-lifecycle__provider select:focus-visible { outline: 2px solid var(--ke-color-accent, var(--text-accent)); outline-offset: 2px; }
.llmwiki-lifecycle__provider-error { margin: 0; color: var(--text-error); overflow-wrap: anywhere; }
      .llmwiki-lifecycle dl { display: grid; grid-template-columns: minmax(7rem, auto) minmax(0, 1fr); gap: 8px 12px; }
      .llmwiki-lifecycle dt { color: var(--text-muted); }
      .llmwiki-lifecycle dd { margin: 0; word-break: break-all; overflow-wrap: anywhere; }
      .llmwiki-lifecycle__results { display: grid; gap: var(--ke-space-2, 8px); list-style: none; margin: 0; padding: 0; }
      .llmwiki-lifecycle__results a { display: block; max-inline-size: 100%; color: var(--ke-color-interactive, var(--text-accent)); word-break: break-all; overflow-wrap: anywhere; }
      .llmwiki-lifecycle progress { inline-size: 100%; max-inline-size: 100%; accent-color: var(--ke-color-interactive, var(--text-accent)); border-radius: var(--ke-radius-pill, 999px); }
      .llmwiki-lifecycle__queue { padding: var(--ke-space-4, 17px); border: 1px solid var(--ke-color-border, var(--background-modifier-border)); border-radius: var(--ke-radius-panel, 12px); }
      .llmwiki-lifecycle__queue[data-queue="conflicts"] { border-inline-start: 3px solid var(--text-error); }
      .llmwiki-lifecycle__document-preview { white-space: pre-wrap; word-break: keep-all; overflow-wrap: anywhere; padding: var(--ke-space-3, 12px); background: var(--ke-color-surface-muted, var(--background-secondary)); border-radius: var(--ke-radius-control, 8px); }
      .llmwiki-approval-review { display: grid; gap: var(--ke-space-3, 12px); min-inline-size: 0; max-inline-size: 100%; color: var(--text-normal); }
      .llmwiki-approval-review, .llmwiki-approval-review * { box-sizing: border-box; min-inline-size: 0; }
      .llmwiki-approval-review header, .llmwiki-approval-review section, .llmwiki-approval-review article { display: grid; gap: var(--ke-space-2, 8px); }
      .llmwiki-approval-review h2, .llmwiki-approval-review h3, .llmwiki-approval-review h4, .llmwiki-approval-review h5, .llmwiki-approval-review p { margin: 0; overflow-wrap: anywhere; word-break: keep-all; }
      .llmwiki-approval-review dl { display: grid; grid-template-columns: minmax(6rem, auto) minmax(0, 1fr); gap: 8px 12px; margin: 0; }
      .llmwiki-approval-review dt, .llmwiki-approval-review__muted { color: var(--text-muted); }
      .llmwiki-approval-review dd { margin: 0; overflow-wrap: anywhere; word-break: keep-all; }
      .llmwiki-approval-review__actions, .llmwiki-approval-review__operation-head, .llmwiki-approval-review__source { display: flex; flex-wrap: wrap; align-items: center; gap: var(--ke-space-2, 8px); }
      .llmwiki-approval-review__operation-head { gap: var(--ke-space-3, 12px); }
      .llmwiki-approval-review button, .llmwiki-approval-review a { min-block-size: var(--ke-touch-target, ${touchTarget}px); max-inline-size: 100%; cursor: pointer; overflow-wrap: anywhere; word-break: keep-all; }
      .llmwiki-approval-review__operations { display: grid; gap: var(--ke-space-3, 12px); }
      .llmwiki-approval-review__operation { padding: var(--ke-space-3, 12px); }
      .llmwiki-approval-review__diff { border-top: 1px solid var(--background-modifier-border); padding-block-start: var(--ke-space-2, 8px); }
      .llmwiki-approval-review__selection-target { min-inline-size: var(--ke-touch-target, ${touchTarget}px); min-block-size: var(--ke-touch-target, ${touchTarget}px); padding: 8px; cursor: pointer; }
      .llmwiki-approval-review__selection-target input { inline-size: 18px; block-size: 18px; }
      .llmwiki-approval-review__conflict, .llmwiki-approval-review__notice[data-state="error"] { color: var(--text-error); }
      .llmwiki-wiki-surface, .llmwiki-wiki-surface * { box-sizing: border-box; }
      .llmwiki-wiki-surface { display: grid; gap: var(--ke-space-3, 12px); inline-size: 100%; max-inline-size: 100%; min-inline-size: 0; color: var(--text-normal); line-height: var(--ke-leading-body, 1.45); }
      .llmwiki-wiki-surface__header, .llmwiki-wiki-surface__controls, .llmwiki-wiki-surface__content { min-inline-size: 0; max-inline-size: 100%; }
      .llmwiki-wiki-surface__header h2, .llmwiki-wiki-surface__header p { margin: 0; overflow-wrap: anywhere; word-break: keep-all; }
      .llmwiki-wiki-surface__controls { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: var(--ke-space-2, 8px); align-items: end; }
      .llmwiki-wiki-surface__search, .llmwiki-wiki-surface__filters { display: flex; flex-wrap: wrap; gap: var(--ke-space-2, 8px); min-inline-size: 0; }
      .llmwiki-wiki-surface input, .llmwiki-wiki-surface select, .llmwiki-wiki-surface button { min-block-size: var(--ke-touch-target, ${touchTarget}px); max-inline-size: 100%; min-inline-size: 0; font: inherit; }
      .llmwiki-wiki-surface button { cursor: pointer; }
      .llmwiki-wiki-surface button:focus-visible, .llmwiki-wiki-surface input:focus-visible, .llmwiki-wiki-surface select:focus-visible { outline: 2px solid var(--ke-color-accent, var(--text-accent)); outline-offset: 2px; }
      .llmwiki-wiki-surface__content { display: grid; grid-template-columns: minmax(10rem, 14rem) minmax(0, 1fr); gap: var(--ke-space-3, 12px); }
      .llmwiki-wiki-surface__facet-rail, .llmwiki-wiki-surface__results { min-inline-size: 0; }
      .llmwiki-wiki-surface__facet-rail, .llmwiki-wiki-surface__facet-group, .llmwiki-wiki-surface__result-list { display: grid; align-content: start; gap: var(--ke-space-2, 8px); }
      .llmwiki-wiki-surface__facet-button, .llmwiki-wiki-surface__result { inline-size: 100%; text-align: start; }
      .llmwiki-wiki-surface__result-list { list-style: none; margin: 0; padding: 0; }
      .llmwiki-wiki-surface__result { display: grid; gap: 2px; padding: var(--ke-space-2, 8px); border: 1px solid transparent; background: var(--background-secondary); }
      .llmwiki-wiki-surface__result[aria-expanded="true"], .llmwiki-wiki-surface__facet-button[aria-pressed="true"] { border-color: var(--ke-color-accent, var(--text-accent)); }
      .llmwiki-wiki-surface__result-title { font-weight: 700; }
      .llmwiki-wiki-surface__result-title, .llmwiki-wiki-surface__result-meta, .llmwiki-wiki-surface__muted, .llmwiki-wiki-surface__body { min-inline-size: 0; overflow-wrap: anywhere; word-break: keep-all; }
      .llmwiki-wiki-surface__result-meta, .llmwiki-wiki-surface__muted { color: var(--text-muted); }
      .llmwiki-wiki-surface__body { white-space: pre-wrap; }
      .llmwiki-wiki-surface__status { padding: var(--ke-space-2, 8px); border-inline-start: 3px solid var(--ke-color-accent, var(--text-accent)); color: var(--text-muted); }
      .llmwiki-wiki-surface__status[data-state="error"], .llmwiki-wiki-surface__status[data-state="stale"] { border-inline-start-color: var(--text-error); color: var(--text-error); }
      .llmwiki-wiki-detail-modal {
        inline-size: min(52rem, calc(100vw - var(--ke-space-6, 32px)));
        max-inline-size: calc(100vw - var(--ke-space-6, 32px));
      }
      .llmwiki-wiki-detail-modal .modal-content.llmwiki-wiki-detail-modal__content {
        min-inline-size: 0; padding: 0; overflow: hidden;
        color: var(--text-normal); line-height: var(--ke-leading-body, 1.45);
      }
      .llmwiki-wiki-detail-modal__article {
        display: grid; grid-template-rows: auto minmax(0, 1fr) auto;
        max-block-size: 80vh; min-inline-size: 0;
      }
      .llmwiki-wiki-detail-modal__header {
        display: grid; gap: var(--ke-space-1, 4px); min-inline-size: 0;
        padding: var(--ke-space-5, 24px) var(--ke-space-7, 48px) var(--ke-space-4, 17px) var(--ke-space-5, 24px);
        border-block-end: 1px solid var(--ke-color-border, var(--background-modifier-border));
      }
      .llmwiki-wiki-detail-modal__header h2, .llmwiki-wiki-detail-modal__header p, .llmwiki-wiki-detail-modal__summary {
        margin: 0; min-inline-size: 0; word-break: keep-all; overflow-wrap: anywhere;
      }
      .llmwiki-wiki-detail-modal__header h2 { font-size: var(--ke-type-heading); line-height: var(--ke-leading-heading, 1.25); }
      .llmwiki-wiki-detail-modal__scroll {
        min-block-size: 0; min-inline-size: 0; overflow-y: auto; overflow-x: hidden;
        padding: var(--ke-space-5, 24px);
        overscroll-behavior: contain;
      }
      .llmwiki-wiki-detail-modal__summary {
        margin-block-end: var(--ke-space-4, 17px);
        padding-block-end: var(--ke-space-4, 17px);
        border-block-end: 1px solid var(--ke-color-border, var(--background-modifier-border));
        font-weight: 600;
      }
      .llmwiki-wiki-detail-modal__footer {
        display: flex; justify-content: flex-end; gap: var(--ke-space-2, 8px);
        padding: var(--ke-space-3, 12px) var(--ke-space-5, 24px);
        border-block-start: 1px solid var(--ke-color-border, var(--background-modifier-border));
        background: var(--ke-color-surface, var(--background-primary));
      }
      .llmwiki-wiki-detail-modal__footer button {
        min-block-size: var(--ke-touch-target, ${touchTarget}px); min-inline-size: var(--ke-touch-target, ${touchTarget}px);
        padding-inline: var(--ke-space-4, 17px); font: inherit; cursor: pointer;
      }
      .llmwiki-wiki-detail-modal__footer button:focus-visible { outline: 2px solid var(--ke-color-accent, var(--text-accent)); outline-offset: 2px; }
      .knowledge-review-workbench { display: grid; gap: var(--ke-space-3, 12px); min-inline-size: 0; color: var(--text-normal); }
      .knowledge-review-workbench__controls { display: flex; flex-wrap: wrap; gap: var(--ke-space-2, 8px); }
      .knowledge-review-workbench button, .knowledge-review-detail-modal button { min-block-size: var(--ke-touch-target, ${touchTarget}px); min-inline-size: var(--ke-touch-target, ${touchTarget}px); max-inline-size: 100%; font: inherit; word-break: keep-all; overflow-wrap: anywhere; }
      .knowledge-review-workbench button:focus-visible, .knowledge-review-detail-modal button:focus-visible { outline: 2px solid var(--ke-color-accent, var(--text-accent)); outline-offset: 2px; }
      .knowledge-review-workbench__group { display: grid; gap: var(--ke-space-2, 8px); min-inline-size: 0; padding-block: var(--ke-space-3, 12px); border-block-start: 1px solid var(--ke-color-border, var(--background-modifier-border)); }
      .knowledge-review-workbench__group h3 { margin: 0; font-size: var(--ke-type-heading); line-height: var(--ke-leading-heading, 1.25); }
      .knowledge-review-workbench__group output { color: var(--text-muted); }
      .knowledge-review-workbench__group article { display: flex; flex-wrap: wrap; align-items: center; gap: var(--ke-space-2, 8px); min-inline-size: 0; padding-block: var(--ke-space-2, 8px); border-block-start: 1px solid var(--ke-color-border, var(--background-modifier-border)); }
      .knowledge-review-workbench__group article strong, .knowledge-review-workbench__group article code { flex: 1 1 14rem; min-inline-size: 0; overflow-wrap: anywhere; word-break: keep-all; }
      .knowledge-review-workbench__group details { flex: 1 1 100%; min-inline-size: 0; }
      .knowledge-review-detail-modal__dialog {
        display: flex; flex-direction: column;
        inline-size: min(52rem, calc(100vw - var(--ke-space-6, 32px)));
        max-inline-size: calc(100vw - var(--ke-space-6, 32px));
        block-size: min(80vh, calc(100vh - var(--ke-space-6, 32px)));
        block-size: min(80dvh, calc(100dvh - var(--ke-space-6, 32px)));
        max-block-size: calc(100dvh - var(--ke-space-6, 32px));
        overflow: hidden;
      }
      .knowledge-review-detail-modal__dialog > .modal-close-button {
        position: absolute; inset-block-start: var(--ke-space-2, 8px); inset-inline-end: var(--ke-space-2, 8px); z-index: 1;
        min-block-size: var(--ke-touch-target, ${touchTarget}px); min-inline-size: var(--ke-touch-target, ${touchTarget}px);
      }
      .knowledge-review-detail-modal__dialog > .modal-content.knowledge-review-detail-modal__content {
        display: flex; flex: 1 1 auto; flex-direction: column;
        block-size: 100%; min-block-size: 0; padding: 0; overflow: hidden;
      }
      .knowledge-review-detail-modal__content > article {
        display: grid; grid-template-rows: auto minmax(0, 1fr) auto;
        block-size: 100%; min-block-size: 0; min-inline-size: 0;
      }
      .knowledge-review-detail-modal__content > article > header {
        min-inline-size: 0; padding: var(--ke-space-5, 24px) var(--ke-space-7, 48px) var(--ke-space-4, 17px) var(--ke-space-5, 24px);
        border-block-end: 1px solid var(--ke-color-border, var(--background-modifier-border));
      }
      .knowledge-review-detail-modal__content > article > header h2 { margin: 0; font-size: var(--ke-type-heading); line-height: var(--ke-leading-heading, 1.25); word-break: keep-all; overflow-wrap: anywhere; }
      .knowledge-review-detail-modal__scroll { min-block-size: 0; min-inline-size: 0; overflow-y: auto; overflow-x: hidden; overscroll-behavior: contain; padding: var(--ke-space-5, 24px); }
      .knowledge-review-detail-modal__scroll section { display: grid; grid-template-columns: minmax(0, 1fr); gap: var(--ke-space-2, 8px); min-inline-size: 0; padding-block-end: var(--ke-space-3, 12px); border-block-end: 1px solid var(--ke-color-border, var(--background-modifier-border)); }
      .knowledge-review-detail-modal__scroll button { inline-size: 100%; white-space: normal; text-align: start; }
      .knowledge-review-detail-modal__scroll ul { margin: 0; padding-inline-start: var(--ke-space-5, 24px); }
      .knowledge-review-detail-modal__scroll li { overflow-wrap: anywhere; word-break: keep-all; }
      .knowledge-review-detail-modal__content > article > footer { display: flex; justify-content: flex-end; padding: var(--ke-space-3, 12px) var(--ke-space-5, 24px); border-block-start: 1px solid var(--ke-color-border, var(--background-modifier-border)); background: var(--ke-color-surface, var(--background-primary)); }

      .knowledge-explorer-shell { display: grid; gap: var(--ke-space-4); }
      .knowledge-explorer-shell input, .knowledge-explorer-shell select, .knowledge-explorer-shell textarea {
        min-block-size: var(--ke-touch-target, ${touchTarget}px);
        padding: var(--ke-space-2) var(--ke-space-3);
        border: var(--ke-border-width, 1px) solid var(--ke-color-border, var(--background-modifier-border));
        border-radius: var(--ke-radius-control, 8px);
        background: var(--ke-color-surface, var(--background-primary));
        color: var(--ke-color-text, var(--text-normal));
        font: inherit;
      }
      .knowledge-explorer-shell button {
        min-block-size: var(--ke-touch-target, ${touchTarget}px);
        padding: var(--ke-space-2) var(--ke-space-3);
        border: var(--ke-border-width, 1px) solid var(--ke-color-border, var(--background-modifier-border));
        border-radius: var(--ke-radius-control, 8px);
        background: var(--ke-color-surface, var(--background-primary));
        color: var(--ke-color-text, var(--text-normal));
        cursor: pointer;
        will-change: transform;
        transition: transform 0.15s cubic-bezier(0.16, 1, 0.3, 1);
      }
.knowledge-explorer-shell button:active { transform: scale(0.95); }

      @media (max-width: ${compactMax}px) {
        .markdown-preview-view.prodigy-hub-note:has(.prodigy-app-shell[data-workspace-id="knowledge"]) .markdown-preview-sizer { box-sizing: border-box; inline-size: 100% !important; max-inline-size: none !important; margin-inline: 0 !important; padding: 4px !important; }
        .markdown-preview-view.prodigy-hub-note:has(.prodigy-app-shell[data-workspace-id="knowledge"]) .markdown-preview-section { inline-size: 100% !important; max-inline-size: none !important; }
        .knowledge-para-action-btn, .knowledge-para-control-label, button.knowledge-para-clear { flex-basis: 100%; inline-size: 100%; }
        .knowledge-para-results-layout { grid-template-columns: minmax(0, 1fr); }
        .knowledge-para-source-metadata { grid-template-columns: minmax(0, 1fr); }
        .knowledge-workspace-tabs { display: grid; grid-template-columns: minmax(0, 1fr); inline-size: 100%; }
        .knowledge-workspace-tab { inline-size: 100%; min-inline-size: 0; }
        .knowledge-workspace-tab-desc { display: none; }
        .llmwiki-lifecycle__actions button { flex: 1 1 100%; inline-size: 100%; }
        .llmwiki-lifecycle dl, .llmwiki-approval-review dl { grid-template-columns: minmax(0, 1fr); }
        .llmwiki-approval-review__decision-strip { position: sticky; inset-block-start: 0; z-index: 3; display: grid; grid-template-columns: repeat(auto-fit, minmax(min(10rem, 100%), 1fr)); padding-block: 4px; background: var(--background-primary); border-block-end: 1px solid var(--background-modifier-border); }
        .llmwiki-approval-review__decision-strip button { inline-size: 100%; }
        .llmwiki-approval-review__decision-strip button[data-primary="true"] { grid-column: 1 / -1; }
        .llmwiki-approval-review__decision-strip button:disabled { display: none; }
        .llmwiki-approval-review__operation { padding: var(--ke-space-2, 8px); }
        .llmwiki-wiki-surface__controls, .llmwiki-wiki-surface__content { grid-template-columns: minmax(0, 1fr); }
        .llmwiki-wiki-detail-modal { inline-size: calc(100vw - var(--ke-space-4, 17px)); max-inline-size: calc(100vw - var(--ke-space-4, 17px)); }
        .llmwiki-wiki-detail-modal__header, .llmwiki-wiki-detail-modal__scroll { padding: var(--ke-space-4, 17px); }
        .llmwiki-wiki-detail-modal__header { padding-inline-end: var(--ke-space-7, 48px); }
        .llmwiki-wiki-detail-modal__footer { padding: var(--ke-space-3, 12px) var(--ke-space-4, 17px); }
        .knowledge-review-detail-modal__dialog { inline-size: calc(100vw - var(--ke-space-4, 17px)); max-inline-size: calc(100vw - var(--ke-space-4, 17px)); }
        .knowledge-review-detail-modal__scroll { padding: var(--ke-space-4, 17px); }
        .knowledge-review-workbench__group article > button { flex: 1 1 100%; }
      }
      /* True 200% zoom (effective shell width ~128-220 CSS px) shrinks the
         shell far below the 419/640 compact tier intended. Reflow the bar and
         the four Knowledge tabs into single-column rows: every control
         keeps the 44px touch target, the Home label stays as text, and each
         tab retains its full CJK label without burying the active panel. */
      @container knowledge-shell (max-width: 220px) {
        .prodigy-app-shell[data-workspace-id="knowledge"] > .prodigy-workspace-bar {
          align-items: stretch; flex-direction: column; gap: 4px; padding-block: 4px;
        }
        .prodigy-app-shell[data-workspace-id="knowledge"] > .prodigy-workspace-bar > .prodigy-workspace-switcher {
          inline-size: 100%; min-inline-size: 0; min-block-size: var(--ke-touch-target, ${touchTarget}px);
        }
        .prodigy-app-shell[data-workspace-id="knowledge"] > .prodigy-workspace-bar > .prodigy-workspace-title {
          inline-size: 100%; min-inline-size: 0; margin: 0; text-align: start;
        }
        .prodigy-app-shell[data-workspace-id="knowledge"] > .prodigy-workspace-bar > .prodigy-context-bar-inline { margin-inline-start: 0; }
        .prodigy-app-shell[data-workspace-id="knowledge"] .prodigy-context-action {
          min-block-size: var(--ke-touch-target, ${touchTarget}px); min-inline-size: var(--ke-touch-target, ${touchTarget}px);
        }
        .prodigy-app-shell[data-workspace-id="knowledge"] .knowledge-workspace-tabs {
          display: grid; grid-template-columns: minmax(0, 1fr); gap: 6px; margin-block-end: 6px; padding: 6px;
        }
        .prodigy-app-shell[data-workspace-id="knowledge"] button.knowledge-workspace-tab {
          inline-size: 100%; min-inline-size: 0; min-block-size: var(--ke-touch-target, ${touchTarget}px); height: auto; padding-inline: var(--ke-space-1, 4px); white-space: normal;
        }
        .prodigy-app-shell[data-workspace-id="knowledge"] .knowledge-workspace-tab-label--compact { display: none; white-space: normal; }
        .prodigy-app-shell[data-workspace-id="knowledge"] .knowledge-workspace-tab-label--full {
          display: inline; white-space: normal; word-break: keep-all; overflow-wrap: normal; text-wrap: balance;
        }
        .prodigy-app-shell[data-workspace-id="knowledge"] .llmwiki-lifecycle { gap: 8px; }
        .prodigy-app-shell[data-workspace-id="knowledge"] .llmwiki-lifecycle.prodigy-full-bleed { padding-block: var(--ke-space-1, 4px); }
        .prodigy-app-shell[data-workspace-id="knowledge"] .llmwiki-lifecycle > header > h2,
        .prodigy-app-shell[data-workspace-id="knowledge"] .llmwiki-lifecycle__rollout > h3 { margin-block: 0; }
      }
      @media (max-width: 240px) {
        .llmwiki-lifecycle__queue { padding: 0; border: 0; }
        .llmwiki-lifecycle__queue > h3, .llmwiki-approval-review > header > p { display: none; }
        .llmwiki-approval-review, .llmwiki-lifecycle { gap: var(--ke-space-2, 8px); }
      }
      @media (forced-colors: active) {
        .knowledge-para-action-btn:focus-visible, .knowledge-para-search:focus-visible, .knowledge-para-source-filter:focus-visible, .knowledge-para-sort:focus-visible, .knowledge-para-clear:focus-visible, .knowledge-para-clear-no-match:focus-visible, .knowledge-para-source-select:focus-visible, .knowledge-para-open-link:focus-visible { outline-color: Highlight; }
        .knowledge-workspace-tab[aria-selected="true"] { border: 2px solid Highlight; } .knowledge-workspace-tab:focus-visible { outline-color: Highlight; }
        .llmwiki-lifecycle button[data-primary="true"] { border: 2px solid Highlight; }
        .llmwiki-lifecycle button:focus-visible, .llmwiki-lifecycle summary:focus-visible, .llmwiki-lifecycle a:focus-visible, .llmwiki-lifecycle input:focus-visible { outline-color: Highlight; }
      }
      @media (prefers-reduced-motion: reduce) {
        .knowledge-para-section *, button.knowledge-para-action-btn, button.knowledge-workspace-tab, .llmwiki-lifecycle button, .llmwiki-wiki-surface *, .llmwiki-wiki-detail-modal * {
          scroll-behavior: auto !important; transition: none !important; animation: none !important; transform: none !important; will-change: auto !important;
        }
      }
    `;
  }

  root.KnowledgeStyles = { ensureStyles, STYLE_ID };
  if (typeof module !== "undefined" && module.exports) module.exports = root.KnowledgeStyles;
})(typeof window !== "undefined" ? window : globalThis);
