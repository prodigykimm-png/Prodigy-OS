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
        border-radius: var(--ke-radius-panel, 11px);
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
      .knowledge-workspace-tab-label__atomic-suffix { display: inline-block; margin-inline-start: .25em; white-space: nowrap; }
      button.knowledge-workspace-tab:active { transform: scale(0.97); }
      .knowledge-workspace-tab:focus-visible { outline: 2px solid var(--ke-color-accent, var(--text-accent)); outline-offset: 2px; }
      .knowledge-workspace-tab[aria-selected="true"] { border-color: var(--ke-color-interactive, var(--text-accent)); color: var(--ke-color-interactive, var(--text-accent)); font-weight: 700; }
      .knowledge-workspace-tab-desc, .knowledge-workspace-tab-role { margin: 0; color: var(--text-muted); overflow-wrap: anywhere; word-break: keep-all; }
      .knowledge-workspace-tab-desc.prodigy-full-bleed { padding: var(--ke-space-1, 4px) var(--ke-space-4, 17px); }
      .knowledge-workspace-tab-role { font-weight: 600; }

      .llmwiki-lifecycle { display: grid; align-content: start; gap: 0; inline-size: 100%; max-inline-size: 100%; min-inline-size: 0; min-block-size: 0; overflow-y: visible; color: var(--text-normal); text-align: start; }
      [data-surface="llmwiki-lifecycle"] { overflow-y: visible; }
      [data-surface="llmwiki-lifecycle"][data-pending-priority="emphasized"],
      [data-surface="llmwiki-lifecycle"][data-pending-priority="backlog"] {
        border-inline-start: var(--ke-border-width, 1px) solid var(--ke-color-interactive, var(--text-accent));
      }
      [data-surface="llmwiki-lifecycle"][data-pending-priority="backlog"] { border-inline-start-color: var(--ke-color-warning, var(--text-warning)); }
      .llmwiki-lifecycle.prodigy-full-bleed { padding-block: var(--ke-space-5, 24px); }
      .llmwiki-lifecycle, .llmwiki-lifecycle * { box-sizing: border-box; }
      .llmwiki-lifecycle > * { max-inline-size: 100%; min-inline-size: 0; padding: var(--ke-space-3, 12px) var(--ke-space-4, 17px); border-block-start: var(--ke-border-width, 1px) solid var(--ke-color-border, var(--background-modifier-border)); }
      .llmwiki-lifecycle > header { padding-block-start: 0; border-block-start: 0; }
      .llmwiki-lifecycle header, .llmwiki-lifecycle section, .llmwiki-lifecycle article, .llmwiki-lifecycle details { display: grid; gap: var(--ke-space-2, 8px); min-inline-size: 0; }
      .llmwiki-lifecycle h2, .llmwiki-lifecycle h3, .llmwiki-lifecycle p, .llmwiki-lifecycle dl { margin: 0; text-align: start; word-break: keep-all; overflow-wrap: anywhere; }
      .llmwiki-cjk-prose { min-inline-size: 0; max-inline-size: 100%; word-break: keep-all; text-wrap: pretty; overflow-wrap: anywhere; }
      [data-typography-role="intro"] { font-size: var(--ke-type-label); }
      .llmwiki-lifecycle__source-name { display: block; max-inline-size: 100%; font-weight: 600; white-space: normal; word-break: break-word; overflow-wrap: anywhere; }
      .llmwiki-lifecycle [data-selected-source-path] { display: block; max-inline-size: 100%; white-space: normal; word-break: break-word; overflow-wrap: anywhere; }
      .llmwiki-lifecycle__range-tree, .llmwiki-lifecycle__range-children { display: grid; gap: var(--ke-space-2, 8px); min-inline-size: 0; }
      .llmwiki-lifecycle__range-children { margin-inline-start: var(--ke-space-3, 12px); padding-inline-start: var(--ke-space-3, 12px); border-inline-start: var(--ke-border-width, 1px) solid var(--ke-color-border, var(--background-modifier-border)); }
      .llmwiki-lifecycle__range { padding: var(--ke-space-2, 8px); border: var(--ke-border-width, 1px) solid var(--ke-color-border, var(--background-modifier-border)); border-radius: var(--ke-radius-control, 8px); }
      .llmwiki-lifecycle__range > p { display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 2; overflow: hidden; }
      .llmwiki-lifecycle [data-range-search="true"] { min-block-size: var(--ke-touch-target, ${touchTarget}px); inline-size: 100%; }
      .llmwiki-lifecycle__muted { color: var(--text-muted); }
      .llmwiki-lifecycle__error { color: var(--text-error); }
      .llmwiki-lifecycle__actions { display: flex; flex-wrap: wrap; align-items: center; gap: var(--ke-space-2, 8px); min-inline-size: 0; }
      .knowledge-fleeting-summary > button.prodigy-btn { min-block-size: var(--ke-touch-target, 44px); min-height: var(--ke-touch-target, 44px); height: auto !important; box-shadow: none !important; }
      .llmwiki-lifecycle__fleeting .llmwiki-lifecycle__actions button { min-block-size: var(--ke-touch-target, 44px); min-height: var(--ke-touch-target, 44px); height: auto !important; box-shadow: none !important; }
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
      .llmwiki-lifecycle__status { min-block-size: var(--ke-touch-target, ${touchTarget}px); border-inline-start: 2px solid var(--ke-color-interactive, var(--text-accent)); word-break: keep-all; overflow-wrap: anywhere; border-radius: var(--ke-radius-control, 8px); }
      .llmwiki-lifecycle__status[data-state="error"] { border-inline-start-color: var(--text-error); color: var(--text-error); }
      [data-recovery-atomic-tail] { display: inline-block; white-space: nowrap; }
      .maintenance-notice[data-maintenance-notice] {
        box-sizing: border-box; display: inline-flex; align-items: flex-start; min-block-size: var(--ke-touch-target, ${touchTarget}px); max-inline-size: 100%; margin-block: 0; padding: 8px 12px; border-inline-start: 2px solid var(--ke-color-interactive, var(--text-accent)); color: var(--text-muted); font-weight: 500; word-break: keep-all; overflow-wrap: anywhere; border-radius: var(--ke-radius-control, 8px);
      }
      .maintenance-notice[data-maintenance-notice][hidden],
      .maintenance-notice[data-maintenance-notice][data-state="clear"] { display: none; }
.llmwiki-lifecycle__settings { display: grid; gap: var(--ke-space-3, 12px); }
.llmwiki-lifecycle__setting { display: flex; align-items: flex-start; gap: var(--ke-space-2, 8px); min-block-size: var(--ke-touch-target, ${touchTarget}px); min-inline-size: 0; }
.llmwiki-lifecycle__setting span { word-break: keep-all; overflow-wrap: anywhere; }
.llmwiki-lifecycle__provider { display: grid; gap: var(--ke-space-2, 8px); min-inline-size: 0; }
.llmwiki-lifecycle__provider-label { color: var(--text-muted); word-break: keep-all; }
.llmwiki-lifecycle__provider-current { display: flex; flex-wrap: wrap; align-items: baseline; gap: var(--ke-space-2, 8px); min-inline-size: 0; max-inline-size: 100%; word-break: keep-all; overflow-wrap: anywhere; }
.llmwiki-lifecycle__provider-detail { display: block; inline-size: 100%; min-inline-size: 0; max-inline-size: 100%; white-space: normal; word-break: normal; overflow-wrap: anywhere; }
.llmwiki-lifecycle__provider-detail .llmwiki-lifecycle__provider-separator { display: none; }
.llmwiki-lifecycle__provider-model { display: block; inline-size: 100%; font-size: var(--ke-type-label); line-height: var(--ke-leading-control); min-inline-size: 0; max-inline-size: 100%; white-space: normal; word-break: normal; overflow-wrap: anywhere; overflow: hidden; }
      .llmwiki-lifecycle__provider-model-line { display: block; white-space: nowrap; }
.llmwiki-lifecycle__provider-readiness { white-space: normal; word-break: normal; overflow-wrap: anywhere; }
.llmwiki-lifecycle__provider-separator { white-space: normal; }
.llmwiki-lifecycle__provider-error { margin: 0; color: var(--text-error); overflow-wrap: anywhere; }
      .llmwiki-lifecycle dl { display: grid; grid-template-columns: minmax(7rem, auto) minmax(0, 1fr); gap: 8px 12px; }
      .llmwiki-lifecycle dt { color: var(--text-muted); }
      .llmwiki-lifecycle dd { margin: 0; word-break: break-all; overflow-wrap: anywhere; }
      .llmwiki-lifecycle__batch-summary, .llmwiki-lifecycle__progress-track, .llmwiki-lifecycle__review-state { min-inline-size: 0; max-inline-size: 100%; }
      .llmwiki-lifecycle__metrics { display: flex; flex-wrap: wrap; gap: var(--ke-space-2, 8px) var(--ke-space-4, 17px); min-inline-size: 0; }
      .llmwiki-lifecycle__metric { min-inline-size: 0; font-size: var(--ke-type-label); line-height: var(--ke-leading-control); white-space: normal; word-break: keep-all; overflow-wrap: anywhere; }
      [data-backlog-label] { font-weight: 700; }
      .llmwiki-lifecycle__progress-track { display: grid; gap: var(--ke-space-2, 8px); }
      .llmwiki-lifecycle__progress-label { font-size: var(--ke-type-label); color: var(--text-muted); white-space: nowrap; }
      .llmwiki-lifecycle__protected > summary::before { content: "›"; display: inline-block; margin-inline-end: var(--ke-space-2, 8px); font-weight: 700; transform: rotate(0deg); }
      .llmwiki-lifecycle__protected[open] > summary::before { transform: rotate(90deg); }
      .llmwiki-lifecycle__protected-list { display: grid; gap: var(--ke-space-2, 8px); margin: 0; padding: 0; list-style: none; }
      .llmwiki-lifecycle__protected-list li { display: flex; flex-wrap: wrap; justify-content: space-between; gap: var(--ke-space-2, 8px); min-inline-size: 0; padding-block: var(--ke-space-2, 8px); border-block-start: var(--ke-border-width, 1px) solid var(--ke-color-border, var(--background-modifier-border)); }
      .llmwiki-lifecycle__protected-list strong, .llmwiki-lifecycle__protected-list span { min-inline-size: 0; word-break: keep-all; overflow-wrap: anywhere; }
      .llmwiki-lifecycle__results { display: grid; gap: var(--ke-space-2, 8px); list-style: none; margin: 0; padding: 0; }
      .llmwiki-lifecycle__results a { display: block; max-inline-size: 100%; color: var(--ke-color-interactive, var(--text-accent)); word-break: break-all; overflow-wrap: anywhere; }
      .llmwiki-lifecycle progress { inline-size: 100%; max-inline-size: 100%; accent-color: var(--ke-color-interactive, var(--text-accent)); border-radius: var(--ke-radius-pill, 999px); }
      .llmwiki-lifecycle__queue { padding: var(--ke-space-4, 17px); border: 1px solid var(--ke-color-border, var(--background-modifier-border)); border-radius: var(--ke-radius-panel, 11px); }
      .llmwiki-lifecycle__queue[data-queue="conflicts"] { border-inline-start: 3px solid var(--text-error); }
      .llmwiki-lifecycle__document-preview { white-space: pre-wrap; word-break: keep-all; overflow-wrap: anywhere; padding: var(--ke-space-3, 12px); background: var(--ke-color-surface-muted, var(--background-secondary)); border-radius: var(--ke-radius-control, 8px); }
      .llmwiki-approval-review { display: grid; gap: var(--ke-space-3, 12px); min-inline-size: 0; max-inline-size: 100%; color: var(--text-normal); }
      .llmwiki-approval-review, .llmwiki-approval-review * { box-sizing: border-box; min-inline-size: 0; }
      .llmwiki-approval-review header, .llmwiki-approval-review section, .llmwiki-approval-review article { display: grid; gap: var(--ke-space-2, 8px); }
      .llmwiki-approval-review h2, .llmwiki-approval-review h3, .llmwiki-approval-review h4, .llmwiki-approval-review h5, .llmwiki-approval-review p { margin: 0; overflow-wrap: anywhere; word-break: keep-all; }
      .llmwiki-approval-review dl { display: grid; grid-template-columns: minmax(6rem, auto) minmax(0, 1fr); gap: 8px 12px; margin: 0; }
      .llmwiki-approval-review dt, .llmwiki-approval-review__muted { color: var(--text-muted); }
      .llmwiki-approval-review dd { margin: 0; overflow-wrap: anywhere; word-break: keep-all; }
      .llmwiki-approval-review__risk-reasons { display: flex; flex-wrap: wrap; gap: var(--ke-space-1, 4px) var(--ke-space-3, 12px); min-inline-size: 0; max-inline-size: 100%; }
      .llmwiki-approval-review__risk-reasons [data-risk-reason] { min-inline-size: 0; word-break: keep-all; text-wrap: pretty; overflow-wrap: anywhere; }
      .llmwiki-approval-review__actions, .llmwiki-approval-review__operation-head, .llmwiki-approval-review__source { display: flex; flex-wrap: wrap; align-items: center; gap: var(--ke-space-2, 8px); }
      .llmwiki-approval-review__operation-head { gap: var(--ke-space-3, 12px); }
      .llmwiki-approval-review button, .llmwiki-approval-review a { min-block-size: var(--ke-touch-target, ${touchTarget}px); min-inline-size: var(--ke-touch-target, ${touchTarget}px); max-inline-size: 100%; cursor: pointer; overflow-wrap: anywhere; word-break: keep-all; }
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
      .knowledge-review-workbench__summary { display: grid; flex: 1 1 100%; gap: var(--ke-space-1, 4px); min-inline-size: 0; padding: var(--ke-space-2, 8px) var(--ke-space-3, 12px); background: var(--ke-color-surface-secondary, var(--background-secondary)); }
      .knowledge-review-workbench__summary-label { color: var(--ke-color-muted, var(--text-muted)); font-size: var(--ke-type-label, .72rem); font-weight: 600; }
      .knowledge-review-workbench__summary p { margin: 0; color: var(--ke-color-text, var(--text-normal)); line-height: var(--ke-leading-body, 1.45); overflow-wrap: anywhere; word-break: keep-all; }
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
      .knowledge-review-detail-modal__scroll pre { margin: 0; max-inline-size: 100%; padding: var(--ke-space-3, 12px); overflow-x: hidden; white-space: pre-wrap; overflow-wrap: anywhere; word-break: keep-all; background: var(--ke-color-surface-secondary, var(--background-secondary)); font-family: var(--font-monospace); }
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
      .llmwiki-approval-review__atomic-tail {
        white-space: nowrap;
      }

      .llmwiki-approval-review__operation dd.llmwiki-approval-review__prose {
        text-wrap: balance;
      }

      [data-surface="llmwiki-lifecycle"][data-state="review"].prodigy-full-bleed {
        padding-inline: var(--ke-space-1, 4px);
      }

      .llmwiki-lifecycle > .llmwiki-lifecycle__review,
      .llmwiki-lifecycle__review .llmwiki-lifecycle__queue {
        padding-inline: var(--ke-space-2, 8px);
      }

      .llmwiki-lifecycle__review .llmwiki-approval-review.prodigy-full-bleed {
        padding-inline: 0;
      }

        .markdown-preview-view.prodigy-hub-note:has(.prodigy-app-shell[data-workspace-id="knowledge"]) .markdown-preview-sizer { box-sizing: border-box; inline-size: 100% !important; max-inline-size: none !important; margin-inline: 0 !important; padding: 4px !important; }
        .markdown-preview-view.prodigy-hub-note:has(.prodigy-app-shell[data-workspace-id="knowledge"]) .markdown-preview-section { inline-size: 100% !important; max-inline-size: none !important; container-name: knowledge-host; container-type: inline-size; }
        .knowledge-para-action-btn, .knowledge-para-control-label, button.knowledge-para-clear { flex-basis: 100%; inline-size: 100%; }
        .knowledge-para-results-layout { grid-template-columns: minmax(0, 1fr); }
        .knowledge-para-source-metadata { grid-template-columns: minmax(0, 1fr); }
        .knowledge-workspace-tabs { display: grid; grid-template-columns: minmax(0, 1fr); inline-size: 100%; }
        .knowledge-workspace-tab { inline-size: 100%; min-inline-size: 0; }
        .knowledge-workspace-tab-desc { display: block; min-inline-size: 0; max-inline-size: 100%; font-size: var(--ke-type-label); line-height: var(--ke-leading-control); word-break: keep-all; overflow-wrap: anywhere; }
        .knowledge-workspace-tab-desc.prodigy-full-bleed { padding-block: var(--ke-border-width, 1px); padding-inline: var(--ke-space-1, 4px); }
        .knowledge-workspace-tab-role { min-inline-size: 0; font-size: var(--ke-type-label); line-height: var(--ke-leading-control); word-break: keep-all; overflow-wrap: anywhere; }
        .llmwiki-lifecycle__actions button { flex: 1 1 100%; inline-size: 100%; }
        .llmwiki-lifecycle dl, .llmwiki-approval-review dl { grid-template-columns: minmax(0, 1fr); }
        .llmwiki-approval-review__decision-strip { position: sticky; inset-block-start: 0; z-index: 3; display: grid; grid-template-columns: repeat(auto-fit, minmax(min(10rem, 100%), 1fr)); padding-block: 4px; background: var(--background-primary); border-block-end: 1px solid var(--background-modifier-border); }
        .llmwiki-approval-review__decision-strip button { inline-size: 100%; block-size: auto; height: auto; min-block-size: var(--ke-touch-target, 44px); }
        .llmwiki-approval-review__decision-strip button[data-primary="true"] { grid-column: 1 / -1; }
        .llmwiki-approval-review__disabled-reason { display: block; grid-column: 1 / -1; min-inline-size: 0; color: var(--ke-color-muted, var(--text-muted)); font-size: var(--ke-type-label); word-break: keep-all; overflow-wrap: anywhere; }
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
          display: grid; grid-template-columns: minmax(0, 1fr); gap: var(--ke-border-width, 1px); margin-block-end: 0; padding: var(--ke-border-width, 1px);
        }
        .prodigy-app-shell[data-workspace-id="knowledge"] button.knowledge-workspace-tab {
          inline-size: 100%; min-inline-size: 0; min-block-size: var(--ke-touch-target, ${touchTarget}px); height: auto; padding-inline: var(--ke-space-1, 4px); white-space: normal;
        }
        .prodigy-app-shell[data-workspace-id="knowledge"] .knowledge-workspace-tab-label--compact { display: none; white-space: normal; }
        .prodigy-app-shell[data-workspace-id="knowledge"] .knowledge-workspace-tab-label--full {
          display: inline; white-space: normal; word-break: keep-all; overflow-wrap: normal; text-wrap: balance;
        }
        .prodigy-app-shell[data-workspace-id="knowledge"] .llmwiki-lifecycle { gap: var(--ke-space-2, 8px); }
        .prodigy-app-shell[data-workspace-id="knowledge"] .llmwiki-lifecycle__actions button { block-size: auto; height: auto; }
        .prodigy-app-shell[data-workspace-id="knowledge"] .llmwiki-approval-review__operation dd { min-inline-size: 0; text-wrap: pretty; word-break: keep-all; overflow-wrap: anywhere; }
        .prodigy-app-shell[data-workspace-id="knowledge"] .llmwiki-approval-review__atomic-tail { white-space: normal; }
        .prodigy-app-shell[data-workspace-id="knowledge"] .llmwiki-lifecycle.prodigy-full-bleed { padding-block: var(--ke-space-1, 4px); }
        .prodigy-app-shell[data-workspace-id="knowledge"] .llmwiki-lifecycle__batch-summary { padding-block: 0; }
        .prodigy-app-shell[data-workspace-id="knowledge"] .llmwiki-lifecycle__metrics { gap: var(--ke-space-1, 4px) var(--ke-space-4, 17px); }
        .prodigy-app-shell[data-workspace-id="knowledge"] .llmwiki-lifecycle > header > h2,
        .prodigy-app-shell[data-workspace-id="knowledge"] .llmwiki-lifecycle__rollout > h3 { margin-block: 0; }
      }
      @container knowledge-host (max-width: 220px) {
        .prodigy-app-shell[data-workspace-id="knowledge"] {
          block-size: calc(50dvb - var(--header-height, 40px) - var(--prodigy-external-chrome-clearance) - var(--ke-space-5, 24px));
          max-block-size: calc(50dvb - var(--header-height, 40px) - var(--prodigy-external-chrome-clearance) - var(--ke-space-5, 24px));
        }
      }
      @media (max-width: 240px) {
        .llmwiki-lifecycle__queue { padding-inline: var(--ke-space-1, 4px); }
        .llmwiki-lifecycle__queue > h3, .llmwiki-approval-review > header > p { min-inline-size: 0; white-space: normal; word-break: keep-all; overflow-wrap: anywhere; }
        .llmwiki-approval-review, .llmwiki-lifecycle { gap: var(--ke-space-2, 8px); }
        .llmwiki-lifecycle__actions button { block-size: auto; height: auto; }
        .llmwiki-approval-review__operation dd { min-inline-size: 0; text-wrap: pretty; word-break: keep-all; overflow-wrap: anywhere; }
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
      /* Wiki-only bounded workspace. The reading pane and sidebar are sibling scroll owners. */
      .prodigy-app-shell[data-wiki-active="true"] { grid-template-rows: auto minmax(0, 1fr) !important; }
      .prodigy-app-shell[data-workspace-id="knowledge"][data-wiki-active="true"] > .prodigy-workspace-bar { --prodigy-inline-gutter:16px; min-height:52px; min-block-size:52px; padding:0 16px; flex-direction:row !important; align-items:center !important; gap:12px; }
      .prodigy-app-shell[data-wiki-active="true"] .prodigy-workspace-title { font:600 20px/1.3 var(--font-interface); }
      .prodigy-app-shell[data-wiki-active="true"] .prodigy-workspace-switcher { width:auto !important; max-width:100px !important; flex:0 1 auto !important; }
      .prodigy-app-shell[data-wiki-active="true"] .prodigy-context-bar { display:none; }
      .prodigy-app-shell[data-workspace-id="knowledge"][data-wiki-active="true"] > .prodigy-app-shell-body { --prodigy-inline-gutter:0px; overflow:hidden; padding:0; display:flex; min-height:0; }
      .prodigy-app-shell[data-wiki-active="true"] .knowledge-workspace-tabs-mount { display:flex; flex:1; min-height:0; }
      .wiki-workspace { display:grid; grid-template-rows:auto minmax(0,1fr) auto; flex:1; min-width:0; min-height:0; font:400 16px/1.55 var(--font-interface); }
      .wiki-workspace *, .wiki-toolbar-actions * { box-sizing:border-box; min-width:0; }
      .wiki-workspace [hidden], .wiki-toolbar-actions[hidden], .wiki-workspace[hidden], .knowledge-workspace-tabs[hidden], .knowledge-workspace-tab-desc[hidden], .knowledge-workspace-tab-role[hidden] { display:none !important; }
      .wiki-journey-row { min-height:40px; border-bottom:1px solid var(--background-modifier-border); }
      .wiki-journey { display:flex; justify-content:center; align-items:center; gap:12px; list-style:none; margin:0 !important; padding:4px 12px !important; min-height:40px; }
      .wiki-journey li { display:flex; gap:6px; align-items:center; color:var(--text-muted); margin:0; }
      .wiki-journey [aria-current="step"] { color:var(--text-normal); font-weight:600; }
      .wiki-step-number { width:24px; height:24px; display:inline-grid; place-items:center; border-radius:50%; }
      .wiki-journey [aria-current="step"] .wiki-step-number { background:var(--interactive-accent); color:var(--text-on-accent); }
      .wiki-step-arrow { margin-left:6px; color:var(--text-muted); }
      .wiki-workspace-middle { display:grid; grid-template-columns:224px minmax(0,1fr); min-height:0; }
      .wiki-sidebar { overflow-y:auto; padding:12px; border-right:1px solid var(--background-modifier-border); }
      .wiki-navigation, .wiki-proposal-list { display:grid; gap:4px; }
      .wiki-navigation { padding-bottom:12px; border-bottom:1px solid var(--background-modifier-border); }
      .wiki-navigation button, .wiki-proposal-list button { display:flex; flex-wrap:wrap; justify-content:space-between; text-align:left; border:0; border-radius:8px; background:transparent; }
      .wiki-proposal-list button { display:grid; justify-content:start; gap:2px; }
      .wiki-proposal-title { display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden; }
      .wiki-navigation [aria-current="page"], .wiki-proposal-list [aria-current="true"] { background:var(--background-modifier-hover); color:var(--text-accent); }
      .wiki-reading-pane { overflow-y:auto; overflow-x:hidden; min-height:0; padding:24px; }
      .wiki-reading-pane > .knowledge-workspace-panel-host { max-width:760px; margin:0; }
      .wiki-workspace .llmwiki-lifecycle { padding:0 !important; border:0; gap:12px; }
      .wiki-workspace .llmwiki-lifecycle > * { padding:0; border:0; }
      .wiki-workspace h2 { font-size:22px; font-weight:600; line-height:1.4; margin:0 0 12px; }
      .wiki-workspace p { margin:0 0 12px; }
      .wiki-workspace small, .wiki-workspace summary, .wiki-workspace .llmwiki-lifecycle__muted { font-size:13px; }
      .wiki-workspace .prodigy-utility-card, .wiki-workspace .prodigy-full-bleed, .wiki-workspace .llmwiki-lifecycle__status, .wiki-workspace .llmwiki-lifecycle__queue { border:0; border-radius:0; box-shadow:none; background:transparent; padding:0; }
      .wiki-workspace .llmwiki-lifecycle__status[data-state="error"]::before { content:"! "; font-weight:600; }
      .wiki-workspace button, .wiki-toolbar-actions button, .wiki-workspace summary, .wiki-toolbar-actions summary, .wiki-workspace input:not([type="checkbox"]):not([type="radio"]), .wiki-workspace select { min-height:44px; height:auto; max-width:100%; font:inherit; white-space:normal; overflow-wrap:anywhere; word-break:keep-all; border-radius:6px; box-shadow:none; transform:none !important; transition:none; }
      .wiki-workspace a { color:var(--text-normal); text-decoration:underline; }
      .wiki-workspace button[data-primary="true"] { background:var(--interactive-accent); color:var(--text-on-accent); }
      .wiki-workspace button:disabled { opacity:.5; cursor:not-allowed; }
      .wiki-workspace :is(button,input,select,textarea,summary):focus-visible { outline:2px solid var(--interactive-accent); outline-offset:2px; }
      .wiki-decision-bar { min-height:64px; display:flex; align-items:center; flex-wrap:wrap; gap:8px 16px; padding:8px 24px; border-top:1px solid var(--background-modifier-border); background:var(--background-primary); }
      .wiki-decision-bar > [data-decision-status], .wiki-decision-bar > label { flex:1 1 260px; }
      .wiki-decision-bar label { display:flex; align-items:center; gap:8px; margin:0; }
      .wiki-decision-bar [data-decision-actions] { display:flex; gap:8px; align-items:center; flex-wrap:wrap; }
      .wiki-toolbar-actions { margin-left:auto; display:flex; align-items:center; gap:8px; }
      .wiki-more-overlay { position:fixed; inset:0; z-index:60; display:grid; place-items:center; padding:24px; background:rgba(0,0,0,.28); }
      .wiki-more-overlay[hidden] { display:none; }
      .wiki-more-panel { width:min(560px, 94vw); max-height:82dvh; overflow-y:auto; display:grid; gap:10px; padding:18px; background:var(--background-primary); border:1px solid var(--background-modifier-border); border-radius:16px; box-shadow:0 24px 60px rgba(0,0,0,.28); }
      .wiki-more-header { display:flex; align-items:center; justify-content:space-between; gap:12px; }
      .wiki-more-title { margin:0; font-size:16px; font-weight:600; }
      .wiki-more-body { display:grid; gap:8px; }
      .wiki-more-body > button { display:grid; gap:2px; width:100%; text-align:left; padding:12px 14px; font-size:15px; border:1px solid transparent; border-radius:12px; background:transparent; }
      .wiki-more-body > button:hover { background:var(--background-modifier-hover); }
      .wiki-more-hint { font-size:12.5px; color:var(--text-muted); }
      .wiki-more-body > details { margin-top:6px; padding-top:10px; border-top:1px solid var(--background-modifier-border); }
      .wiki-more-body > details > summary { font-size:13px; color:var(--text-muted); }
      .wiki-proposal-selector, .wiki-library-label-narrow { display:none; }
      .wiki-document-body { line-height:1.55; overflow-wrap:anywhere; }
      .wiki-document-body p { white-space:pre-wrap; }
      .wiki-workspace pre { white-space:pre-wrap; overflow-wrap:anywhere; overflow:visible; max-height:none; }
      .wiki-storage-choices { display:flex; flex-wrap:wrap; gap:8px 20px; margin:0 0 16px; border:0; border-bottom:1px solid var(--background-modifier-border); padding:0 0 12px; }
      .wiki-storage-choices legend { font-size:13px; }
      .wiki-storage-choices label { display:flex; align-items:center; gap:8px; min-height:44px; }
      .wiki-storage-targets { flex-basis:100%; display:grid; gap:8px; }
      .wiki-storage-targets label { display:grid; }
      .wiki-review-fields { display:grid; gap:12px; }
      .wiki-review-fields fieldset { padding:12px 0; border:0; border-top:1px solid var(--background-modifier-border); display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:12px; }
      .wiki-review-fields label { display:flex; flex-direction:column; gap:4px; font-size:13px; }
      .wiki-review-fields :is(input,select,textarea) { width:100%; max-width:100%; }
      .wiki-review-fields textarea { min-height:80px; resize:vertical; }
      .wiki-workspace table { width:100%; table-layout:fixed; border-collapse:collapse; font-size:13px; }
      .wiki-workspace th, .wiki-workspace td { padding:8px; text-align:left; border-bottom:1px solid var(--background-modifier-border); white-space:pre-wrap; overflow-wrap:anywhere; }
      .wiki-view-switch { display:flex; gap:8px; padding-block:12px; }
      .wiki-diff-line { display:block; white-space:pre-wrap; overflow-wrap:anywhere; }
      ins.wiki-diff-line { text-decoration:none; border-left:2px solid var(--text-success); padding-left:8px; }
      del.wiki-diff-line { border-left:2px solid var(--text-error); padding-left:8px; }
      .wiki-workspace .llmwiki-wiki-surface__content { display:block; }
      .wiki-workspace .llmwiki-wiki-detail-modal__article { display:block; max-height:none; }
      .wiki-workspace .llmwiki-wiki-detail-modal__scroll { overflow:visible; padding:0; }
      .wiki-workspace .llmwiki-wiki-detail-modal__header, .wiki-workspace .llmwiki-wiki-detail-modal__footer { padding:12px 0; }
      .llmwiki-document-review > .wiki-decision-bar { position:sticky; bottom:0; z-index:1; }
      .wiki-workspace .llmwiki-lifecycle__actions [data-primary="true"] { min-height:44px; }
      .wiki-workspace .llmwiki-wiki-surface__result { background:transparent; border-bottom:1px solid var(--background-modifier-border); border-radius:0; }
      .wiki-source-excerpt { display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden; }
      @container knowledge-shell (width < 900px) {
        .wiki-workspace-middle { grid-template-columns:minmax(0,1fr); grid-template-rows:auto minmax(0,1fr); }
        .wiki-sidebar { overflow:visible; padding:0 8px; border-right:0; border-bottom:1px solid var(--background-modifier-border); }
        .wiki-navigation { display:flex; min-height:44px; gap:4px; padding:0; border:0; }
        .wiki-navigation button { flex:1; justify-content:center; font-size:13px; }
        .wiki-navigation [data-wiki-route="zettelkasten"], .wiki-navigation [data-wiki-route="para"], .wiki-proposal-list { display:none; }
        .wiki-proposal-selector, .wiki-library-label-narrow { display:block; }
        .wiki-library-label-full { display:none; }
        .wiki-selector-label { display:flex; flex-wrap:wrap; align-items:center; gap:8px; margin-bottom:12px; }
        .wiki-selector-label select { flex:1; }
        .wiki-reading-pane { padding:16px; }
        .wiki-decision-bar { padding:8px 16px; display:grid; grid-template-columns:minmax(0,1fr); }
        .wiki-decision-bar [data-decision-actions] { display:flex; flex-wrap:nowrap; }
        .wiki-decision-bar [data-primary="true"] { flex:1; }
        .wiki-storage-choices { flex-direction:column; }
        .wiki-review-fields fieldset { grid-template-columns:minmax(0,1fr); }
        .wiki-toolbar-actions { gap:4px; }
        .prodigy-app-shell[data-wiki-active="true"] > .prodigy-workspace-bar { flex-wrap:wrap; }
        .wiki-journey { gap:4px; font-size:13px; padding-inline:4px !important; }
        .wiki-journey li { gap:3px; }
        .wiki-step-arrow { margin-left:2px; }
        .wiki-step-number { width:20px; height:20px; }
      }
    `;
  }

  root.KnowledgeStyles = { ensureStyles, STYLE_ID };
  if (typeof module !== "undefined" && module.exports) module.exports = root.KnowledgeStyles;
})(typeof window !== "undefined" ? window : globalThis);
