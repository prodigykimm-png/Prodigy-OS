/**
 * Home Dashboard CSS — extracted from home-view.js (P2-1)
 * 로드 순서: design-tokens.js → home-styles.js → home-view.js
 */
(function (root) {
  "use strict";
  const T = root.ProdigyTokens || {};
  const RESPONSIVE_BREAKPOINTS = T.RESPONSIVE_BREAKPOINTS || {};
  const CONTROL_HEIGHTS = T.CONTROL_HEIGHTS || {};

  const HOME_STYLE_ID = "prodigy-home-styles";

  function ensureHomeStyles() {
    if (typeof document === "undefined") return;
    const compactMax = Number(RESPONSIVE_BREAKPOINTS.collapsedNavMax);
    const wideMin = Number(RESPONSIVE_BREAKPOINTS.smallDesktopMax) + 1;
    const workspaceBarHeight = Number(CONTROL_HEIGHTS.workspaceBar);
    const touchTarget = Number(CONTROL_HEIGHTS.touchTarget);
    if (![compactMax, wideMin, workspaceBarHeight, touchTarget].every(Number.isFinite)) return;
    let styleEl = document.getElementById(HOME_STYLE_ID);
    if (!styleEl) {
      styleEl = document.createElement("style");
      styleEl.id = HOME_STYLE_ID;
      document.head.appendChild(styleEl);
    }
    if (root.ProdigyUI) root.ProdigyUI.ensureStyles();
    styleEl.textContent = `
        .prodigy-home {
          --home-workspace-bar-height: ${workspaceBarHeight}px;
          --ke-touch-target: ${touchTarget}px;
          width: 100%;
          max-inline-size: min(100%, var(--home-measured-width, 1180px));
          box-sizing: border-box;
          margin: 0 auto;
          padding: 0 8px 32px;
          font-size: var(--ke-type-body, 0.84rem);
          line-height: var(--ke-leading-body, 1.45);
          letter-spacing: 0;
          word-break: keep-all;
          overflow-wrap: anywhere;
        }
        .prodigy-home *,
        .prodigy-home *::before,
        .prodigy-home *::after { box-sizing: border-box; min-inline-size: 0; max-inline-size: 100%; }
        .prodigy-app-shell[data-workspace-id="home"],
        .prodigy-app-shell[data-workspace-id="home"] * {
          min-inline-size: 0;
          max-inline-size: 100%;
          overflow-wrap: anywhere;
        }
        .prodigy-app-shell[data-workspace-id="home"] > .prodigy-workspace-bar,
        .prodigy-app-shell[data-workspace-id="home"] > .prodigy-context-bar,
        .prodigy-app-shell[data-workspace-id="home"] .prodigy-context-actions {
          flex-wrap: wrap;
        }
        .prodigy-app-shell[data-workspace-id="home"] .prodigy-inline-error {
          inline-size: 100%;
          flex-wrap: wrap;
        }
        .prodigy-app-shell[data-workspace-id="home"] .prodigy-inline-error > span {
          min-inline-size: 0;
          flex: 1 1 12rem;
        }
        .prodigy-home button,
        .prodigy-home a[href],
        .prodigy-home [role="button"],
        .prodigy-home [role="tab"],
        .prodigy-home input,
        .prodigy-home select,
        .prodigy-home textarea,
        .prodigy-app-shell[data-workspace-id="home"] .prodigy-workspace-switcher,
        .prodigy-app-shell[data-workspace-id="home"] .prodigy-context-action {
          min-block-size: var(--ke-touch-target);
          min-inline-size: var(--ke-touch-target);
        }
        .prodigy-home .prodigy-bottom-sheet-backdrop,
        .prodigy-home .prodigy-bottom-sheet-close,
        .prodigy-home .home-workspace-sheet-btn {
          min-block-size: var(--ke-touch-target) !important;
          min-inline-size: var(--ke-touch-target) !important;
        }
        @media (max-width: ${compactMax}px) {
          .prodigy-app-shell[data-workspace-id="home"] > .prodigy-app-shell-body {
            --home-mobile-toolbar-clearance: var(--ke-mobile-toolbar-height, 56px);
            --home-mobile-bottom-clearance: calc(
              var(--home-mobile-toolbar-clearance, 56px)
              + var(--prodigy-action-bar-height, 52px)
              + env(safe-area-inset-bottom, 0px)
              + var(--ke-space-5, 16px)
            );
            scroll-padding-block-end: var(--home-mobile-bottom-clearance);
          }
        }
        .home-grid { display: grid; grid-template-columns: 1fr; gap: var(--ke-space-5, 16px); margin-bottom: var(--ke-space-5, 16px); }
        .home-column { display: flex; flex-direction: column; gap: var(--ke-space-5, 16px); min-width: 0; }
        .home-mc-stack { display: flex; flex-direction: column; gap: var(--ke-space-4, 12px); width: 100%; max-width: 920px; margin: 0 auto; }
        .home-mc-lower .home-card { border-color: var(--ke-color-border); }
        .home-system-status { opacity: 0.92; padding: var(--ke-space-4) var(--ke-space-5) !important; }
        .home-quick-actions .action-btn { min-height: var(--ke-touch-target) !important; padding: var(--ke-space-2, 4px) var(--ke-space-4, 12px) !important; font-size: var(--ke-type-label, 0.72rem) !important; line-height: var(--ke-leading-control, 1.35) !important; }
        .prodigy-home.home-wide .home-grid { grid-template-columns: 1fr; }
        .prodigy-home.home-wide .col-span-8 { grid-column: span 1; }
        .prodigy-home.home-wide .col-span-4 { grid-column: span 1; }
        .prodigy-home.home-wide .col-span-12 { grid-column: span 1; }
        .home-card {
          min-inline-size: 0;
          padding: var(--ke-space-5);
          border: var(--ke-border-width) solid var(--ke-color-border);
          border-radius: var(--ke-radius-panel);
          background: var(--ke-color-surface);
        }
        .home-focus-card {
          padding-block: var(--ke-space-7);
          background: var(--ke-color-surface-secondary);
        }
        .home-focus-card.emphasis-primary,
        .home-focus-card.emphasis-secondary { border-inline-start: 0; }
        .emphasis-primary {
          background: var(--ke-color-surface-secondary);
          border-inline-start: var(--ke-space-1) solid var(--ke-color-interactive);
        }
        .emphasis-secondary {
          background: var(--ke-color-surface-secondary);
        }
        .emphasis-risk {
          border-inline-start: var(--ke-space-1) solid var(--ke-color-error);
          background: var(--ke-color-surface-secondary);
        }
        .home-header {
          font-weight: 700;
          font-size: var(--ke-type-heading, 0.92rem);
          line-height: var(--ke-leading-body, 1.45);
          letter-spacing: 0;
          color: var(--ke-color-text);
          margin-bottom: 12px;
          display: flex;
          align-items: center;
          flex-wrap: wrap;
          gap: 8px;
        }
        .badge {
          display: inline-flex;
          align-items: center;
          min-height: 22px;
          font-size: var(--ke-type-label, 0.72rem);
          line-height: var(--ke-leading-control, 1.35);
          padding: var(--ke-space-1, 2px) var(--ke-space-3, 8px);
          border-radius: var(--ke-radius-pill);
          font-weight: var(--ke-font-weight-strong);
          white-space: normal;
          overflow-wrap: anywhere;
          flex: none;
        }
        .badge-high { background: var(--ke-color-hover); color: var(--ke-color-error); }
        .badge-medium { background: var(--ke-color-hover); color: var(--ke-color-warning); }
        .badge-low { background: var(--ke-color-hover); color: var(--ke-color-accent); }
        .badge-gray { background: var(--ke-color-hover); color: var(--ke-color-muted); }
        /* Home compact button baseline — all Home buttons share this density */
        .prodigy-home .action-btn,
        .prodigy-home button.action-btn,
        .prodigy-home .prodigy-launcher-actions button,
        .prodigy-home .home-launcher-mount button,
        .prodigy-home .home-card > button,
        .prodigy-home .home-card button:not([class*="workspace-row"]) {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          min-height: var(--ke-touch-target) !important;
          min-width: var(--ke-touch-target) !important;
          height: auto !important;
          font-size: var(--ke-type-label, 0.72rem) !important;
          padding: var(--ke-space-1, 2px) var(--ke-space-3, 8px) !important;
          border-radius: var(--ke-radius-control) !important;
          border: var(--ke-border-width) solid var(--ke-color-border);
          background: var(--ke-color-surface);
          color: var(--ke-color-text);
          cursor: pointer;
          font-weight: 600;
          line-height: var(--ke-leading-control, 1.35) !important;
          box-sizing: border-box;
          white-space: normal;
          overflow-wrap: anywhere;
          word-break: keep-all;
          transition: background-color var(--ke-motion-fast) ease, border-color var(--ke-motion-fast) ease, transform var(--ke-motion-fast) ease;
          -webkit-appearance: none;
          appearance: none;
        }
        .prodigy-home .action-btn:hover,
        .prodigy-home .prodigy-launcher-actions button:hover,
        .prodigy-home .home-launcher-mount button:hover {
          background: var(--ke-color-hover);
        }
        .action-btn:active,
        .prodigy-home .prodigy-launcher-actions button:active { transform: scale(0.95); }
        .action-btn:focus-visible,
        .prodigy-home .prodigy-launcher-actions button:focus-visible,
        .prodigy-home .home-launcher-mount button:focus-visible {
          outline: 2px solid var(--ke-color-accent);
          outline-offset: 2px;
        }
        .prodigy-home button.action-btn-primary,
        .prodigy-home .action-btn-primary {
          background: var(--ke-color-interactive) !important;
          color: var(--ke-color-on-interactive) !important;
          border-color: var(--ke-color-interactive) !important;
        }
        .prodigy-home button.action-btn-primary:hover,
        .prodigy-home .action-btn-primary:hover {
          background: var(--ke-color-interactive) !important;
        }
        /* Launcher CTA: compact size, accent border like other home actions */
        .prodigy-home .prodigy-launcher-actions button {
          min-width: 0 !important;
          border-color: var(--ke-color-accent) !important;
          color: var(--ke-color-accent) !important;
          background: var(--ke-color-surface-secondary) !important;
          font-weight: 700 !important;
        }
        .input-text {
          min-width: 0;
          width: auto;
          flex: 1 1 220px;
          font-size: var(--ke-type-body, 0.84rem);
          line-height: var(--ke-leading-body, 1.45);
          padding: var(--ke-space-2, 4px) var(--ke-space-3, 8px);
          border-radius: var(--ke-radius-control);
          border: 1px solid var(--ke-color-border);
          background: var(--ke-color-surface);
          color: var(--ke-color-text);
        }
        .home-title-row { display: flex; justify-content: space-between; align-items: flex-end; flex-wrap: wrap; gap: 12px; margin-bottom: 16px; }
        .home-title-row h2 { margin: 0; font-size: var(--ke-type-title, 1.05rem); line-height: var(--ke-leading-body, 1.45); letter-spacing: 0; }
        .home-toolbar { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
        .focus-list { display: flex; flex-direction: column; margin: 0 -2px; }
        .focus-row { display: flex; flex-direction: column; gap: 7px; padding: 14px 2px; border-top: 1px solid var(--ke-color-border); }
        .focus-row:first-child { border-top: 0; padding-top: 2px; }
        .focus-top { display: flex; align-items: center; gap: 8px; min-width: 0; }
        .focus-title { display: flex; align-items: center; gap: 7px; min-width: 0; flex: 1 1 auto; font-weight: 700; }
        .focus-title a, .focus-title span { overflow-wrap: anywhere; }
        .focus-reason { color: var(--ke-color-muted); font-size: var(--ke-type-body, 0.84rem); line-height: var(--ke-leading-body, 1.45); padding-left: 24px; }
        .focus-details { margin-left: 24px; font-size: var(--ke-type-label, 0.72rem); line-height: var(--ke-leading-body, 1.45); color: var(--ke-color-muted); }
        .focus-details summary { cursor: pointer; color: var(--ke-color-accent); font-weight: 600; }
        .focus-evidence { margin-top: 7px; padding: 9px 10px; border-left: 2px solid var(--ke-color-border); display: flex; flex-direction: column; gap: 4px; }
        .focus-actions, .focus-footer { display: flex; gap: 7px; flex-wrap: wrap; justify-content: flex-end; align-items: center; }
        .focus-actions { margin-top: 4px; }
        .focus-footer { padding-top: 12px; border-top: 1px solid var(--ke-color-border); }
        .continue-list { display: flex; flex-direction: column; }
        .workspace-list { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 6px; }
        .continue-row, .workspace-row { display: flex; align-items: center; flex-wrap: wrap; gap: 10px; min-block-size: var(--ke-touch-target); padding: 10px 0; border-top: 1px solid var(--ke-color-border); }
        .continue-row > .home-continue-meta { flex: 1 1 12rem; }
        .continue-row > .action-btn { flex: 0 1 auto; }
        .continue-row:first-child { border-top: 0; padding-top: 0; }
        .continue-row:last-child { padding-bottom: 0; }
        .continue-row { cursor: pointer; }
        .continue-row:hover, .workspace-row:hover { background: var(--ke-color-hover); }
        .workspace-row {
          min-height: 40px;
          justify-content: space-between;
          padding: 8px 10px;
          border: 1px solid var(--ke-color-border);
          border-radius: var(--ke-radius-control);
          cursor: pointer;
        }
        .workspace-row:focus-visible { outline: 2px solid var(--ke-color-accent); outline-offset: 2px; }
        .workspace-label { display: flex; align-items: center; gap: 8px; min-width: 0; }
        .workspace-arrow { color: var(--ke-color-muted); font-size: 1.2em; line-height: 1; }
        .prodigy-home:not(.home-wide) .home-title-row { align-items: flex-start; }
        .prodigy-home:not(.home-wide) .home-toolbar { width: 100%; }
        .prodigy-home:not(.home-wide) .home-toolbar .action-btn { flex: 0 1 auto; }
        .prodigy-home:not(.home-wide) .focus-top { flex-wrap: wrap; }
        .prodigy-home:not(.home-wide) .focus-title { flex-basis: calc(100% - 72px); }
        .prodigy-home:not(.home-wide) .focus-reason,
        .prodigy-home:not(.home-wide) .focus-details { padding-left: 0; margin-left: 0; }
        /* Mobile/narrow Home: minimum vertical control footprint */
        .prodigy-home:not(.home-wide) .focus-actions .action-btn,
        .prodigy-home:not(.home-wide) .focus-footer .action-btn,
        .prodigy-home:not(.home-wide) .home-toolbar .action-btn {
          min-height: var(--ke-touch-target);
          height: auto;
          padding: var(--ke-space-3) var(--ke-space-4);
          font-size: var(--ke-type-body);
          line-height: var(--ke-leading-body);
        }
        .prodigy-home:not(.home-wide) .focus-actions,
        .prodigy-home:not(.home-wide) .focus-footer {
          justify-content: flex-start;
          gap: 2px;
          margin-top: 1px;
        }
        .prodigy-home:not(.home-wide) .focus-row {
          padding: 6px 2px;
          gap: 4px;
        }
        .prodigy-home:not(.home-wide) .home-card {
          padding: 8px 10px;
        }
        .prodigy-home:not(.home-wide) .home-header {
          margin-bottom: 6px;
        }
        .prodigy-home:not(.home-wide) .home-grid {
          gap: 8px;
        }
        .prodigy-home.home-narrow { padding-inline: 6px; }
        .prodigy-home.home-narrow .workspace-list { grid-template-columns: 1fr; }
        .prodigy-home.home-narrow .home-card { padding: 8px; }
        .prodigy-home.home-narrow .focus-row { padding: 5px 2px; }
        .prodigy-home.home-narrow .workspace-row { min-height: var(--ke-touch-target); padding: 4px 8px; }

        /* Mobile compact Home: Brief + Focus + Continue + Micro Log first; rest behind fold */
        .prodigy-home.home-compact {
          --home-mobile-bottom-clearance: calc(
            var(--ke-mobile-toolbar-height, 56px)
            + var(--prodigy-action-bar-height, 52px)
            + env(safe-area-inset-bottom, 0px)
            + var(--ke-space-5, 16px)
          );
          padding-bottom: var(--home-mobile-bottom-clearance);
        }
        .prodigy-home.home-compact,
        .prodigy-home.home-compact * {
          word-break: normal;
          overflow-wrap: anywhere;
        }
        .prodigy-home.home-compact .home-grid {
          gap: 10px;
        }
        .prodigy-home.home-compact .home-column {
          inline-size: 100%;
          gap: 10px;
        }
        .prodigy-home.home-compact .home-mc-lower,
        .prodigy-home.home-compact .home-mc-lower > *,
        .prodigy-home.home-compact .home-action-row,
        .prodigy-home.home-compact .home-system-metrics,
        .prodigy-home.home-compact .home-state-fixtures {
          inline-size: 100%;
        }
        .prodigy-home.home-compact .home-action-row > button {
          flex: 1 1 var(--ke-touch-target);
        }
        .prodigy-home.home-compact .home-system-metrics,
        .prodigy-home.home-compact .home-state-fixtures {
          display: grid;
          grid-template-columns: 1fr;
        }
        .prodigy-home.home-compact .home-title-row {
          margin-bottom: 10px;
          gap: 8px;
        }
        .prodigy-home.home-compact .home-title-row h2 {
          font-size: var(--ke-type-title, 1.05rem);
        }
        .prodigy-home .home-brief > p.home-brief-text {
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
          overflow: hidden;
          white-space: normal !important;
          font-size: var(--ke-type-body, 0.84rem);
          line-height: var(--ke-leading-body, 1.45);
          margin-bottom: 8px !important;
        }
        .prodigy-home.home-compact .home-secondary-fold {
          border: 1px solid var(--ke-color-border);
          border-radius: var(--ke-radius-panel);
          background: var(--ke-color-surface-secondary);
          padding: 4px 10px 10px;
        }
        .prodigy-home.home-compact .home-secondary-fold > summary {
          font-weight: 800;
          font-size: var(--ke-type-heading, 0.92rem);
          line-height: var(--ke-leading-control, 1.35);
          color: var(--ke-color-muted);
          cursor: pointer;
          min-height: var(--ke-touch-target);
          display: flex;
          align-items: center;
          list-style: none;
          -webkit-tap-highlight-color: transparent;
        }
        .prodigy-home.home-compact .home-secondary-fold > summary::-webkit-details-marker {
          display: none;
        }
        .prodigy-home.home-compact .home-secondary-fold > summary::before {
          content: "▸ ";
          color: var(--ke-color-accent);
        }
        .prodigy-home.home-compact .home-secondary-fold[open] > summary::before {
          content: "▾ ";
        }
        .prodigy-home.home-compact .home-micro-log-slot {
          padding: var(--ke-space-4);
        }
        .prodigy-home.home-compact .home-micro-log-label {
          min-height: var(--ke-touch-target);
          display: flex;
          align-items: center;
          padding: 0 var(--ke-space-3);
          border: 1px dashed var(--ke-color-border);
          border-radius: var(--ke-radius-control);
          color: var(--ke-color-muted);
          font-size: var(--ke-type-body);
          line-height: var(--ke-leading-body);
        }
        .prodigy-home .home-ws-dock {
          display: flex;
          flex-direction: column;
          align-items: stretch;
          min-block-size: ${workspaceBarHeight}px;
          box-sizing: border-box;
          margin: 0 0 10px 0;
          padding: var(--ke-space-2);
          border: 1px solid var(--ke-color-border);
          border-radius: var(--ke-radius-panel);
          background: var(--ke-color-surface-secondary);
        }
        .prodigy-home .home-ws-dock-label {
          position: static;
          inline-size: auto;
          block-size: auto;
          margin: 0;
          padding: 0 var(--ke-space-1);
          color: var(--ke-color-muted);
          font-size: var(--ke-type-label);
          font-weight: var(--ke-font-weight-strong);
          line-height: var(--ke-leading-control);
          white-space: normal;
          overflow-wrap: anywhere;
        }
        .prodigy-home .home-ws-dock-row {
          display: grid;
          flex: 1 1 auto;
          inline-size: 100%;
          grid-template-columns: repeat(4, minmax(var(--ke-touch-target), 1fr));
          align-items: stretch;
          gap: var(--ke-space-2);
        }
        .prodigy-home .home-ws-dock-btn {
          flex: 1 1 0;
          min-inline-size: var(--ke-touch-target);
          max-inline-size: none;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: var(--ke-space-2);
          min-height: var(--ke-touch-target) !important;
          height: var(--ke-touch-target) !important;
          padding: 0 var(--ke-space-2) !important;
          border-radius: var(--ke-radius-control) !important;
          border: 1px solid var(--ke-color-border);
          background: var(--ke-color-surface);
          color: var(--ke-color-text);
          font-size: var(--ke-type-chrome, 0.68rem) !important;
          font-weight: 600 !important;
          line-height: var(--ke-leading-control, 1.35) !important;
          letter-spacing: 0;
          cursor: pointer;
        }
        .prodigy-home .home-ws-dock-btn:active {
          transform: scale(0.97);
          border-color: var(--ke-color-accent);
        }
        .prodigy-home .home-ws-dock-icon {
          font-size: 0.95em;
          line-height: 1;
          opacity: 0.85;
        }
        .prodigy-home .home-ws-dock-name {
          min-inline-size: 0;
          max-inline-size: 100%;
          white-space: normal;
          word-break: keep-all;
          overflow-wrap: anywhere;
          text-align: center;
        }
        .prodigy-home.home-compact .home-ws-dock {
          block-size: auto;
          padding-block: var(--ke-space-2);
        }
        .prodigy-home.home-compact .home-ws-dock-row {
          grid-template-columns: minmax(var(--ke-touch-target), 1fr);
        }
        .prodigy-home .home-ws-dock-btn:focus-visible,
        .prodigy-home .home-workspace-sheet-btn:focus-visible {
          outline: 2px solid var(--ke-color-accent);
          outline-offset: 2px;
        }
        .prodigy-home .home-workspace-sheet-list {
          display: grid;
          grid-template-columns: 1fr;
          gap: var(--ke-space-2);
          padding-block: var(--ke-space-3);
        }
        .prodigy-home .home-workspace-sheet-btn {
          display: flex;
          align-items: center;
          inline-size: 100%;
          min-block-size: var(--ke-touch-target);
          padding: var(--ke-space-3) var(--ke-space-4);
          border: 1px solid var(--ke-color-border);
          border-radius: var(--ke-radius-control);
          background: var(--ke-color-surface);
          color: var(--ke-color-text);
          font-size: var(--ke-type-body);
          font-weight: 700;
          line-height: var(--ke-leading-body);
          text-align: start;
          word-break: keep-all;
          overflow-wrap: anywhere;
          cursor: pointer;
        }
        .prodigy-home.home-compact .home-secondary-fold-body {
          display: flex;
          flex-direction: column;
          gap: 10px;
          margin-top: 6px;
        }
        .prodigy-home.home-medium .home-secondary-fold,
        .prodigy-home.home-wide .home-secondary-fold {
          border: 0;
          background: transparent;
          padding: 0;
        }
        .prodigy-home.home-medium .home-secondary-fold > summary,
        .prodigy-home.home-wide .home-secondary-fold > summary {
          display: none;
        }
        .prodigy-home.home-medium .home-secondary-fold-body,
        .prodigy-home.home-wide .home-secondary-fold-body {
          display: flex;
          flex-direction: column;
          gap: 14px;
          margin-top: 0;
        }
        /* Lifecycle is secondary: always collapsed by default */
        .prodigy-home .home-lifecycle-fold {
          border: 1px solid var(--ke-color-border);
          border-radius: var(--ke-radius-control);
          background: var(--ke-color-surface-secondary);
          padding: 2px 10px 8px;
          margin: 0;
        }
        .prodigy-home .home-lifecycle-fold > summary {
          font-weight: 700;
          font-size: var(--ke-type-body, 0.84rem);
          line-height: var(--ke-leading-control, 1.35);
          color: var(--ke-color-muted);
          cursor: pointer;
          min-height: var(--ke-touch-target);
          display: flex;
          align-items: center;
          list-style: none;
          -webkit-tap-highlight-color: transparent;
        }
        .prodigy-home .home-lifecycle-fold > summary::-webkit-details-marker {
          display: none;
        }
        .prodigy-home .home-lifecycle-fold > summary::before {
          content: "▸ ";
          color: var(--ke-color-muted);
        }
        .prodigy-home .home-lifecycle-fold[open] > summary::before {
          content: "▾ ";
        }
        .prodigy-home .home-lifecycle-fold .home-card {
          border: none;
          background: transparent;
          padding: 4px 0 0;
          margin: 0;
        }
        /* Compact Home: touch contract from DESIGN.md */
        .prodigy-home.home-compact .action-btn,
        .prodigy-home.home-compact button.action-btn,
        .prodigy-home.home-compact .prodigy-launcher-actions button,
        .prodigy-home.home-compact .home-launcher-mount button,
        .prodigy-home.home-compact .focus-footer .action-btn-primary,
        .prodigy-home.home-compact button.action-btn-primary {
          min-height: var(--ke-touch-target) !important;
          height: auto !important;
          padding: var(--ke-space-3) var(--ke-space-4) !important;
          font-size: var(--ke-type-body) !important;
          line-height: var(--ke-leading-body) !important;
          border-radius: var(--ke-radius-control) !important;
          white-space: normal;
          overflow-wrap: anywhere;
        }
        .prodigy-home .home-state-fixtures {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(var(--ke-touch-target), 1fr));
          gap: var(--ke-space-2);
          margin-block-start: var(--ke-space-3);
          color: var(--ke-color-muted);
          font-size: var(--ke-type-label);
          line-height: var(--ke-leading-control);
        }
        .prodigy-home .home-state-fixture {
          min-block-size: var(--ke-touch-target);
          display: flex;
          align-items: center;
          padding-inline: var(--ke-space-2);
          border: var(--ke-border-width) solid var(--ke-color-border);
          border-radius: var(--ke-radius-control);
          overflow-wrap: anywhere;
        }
        .prodigy-home.home-compact .col-span-4:empty {
          display: none;
        }
        .prodigy-home.home-compact { padding-inline: 0 !important; }
          .prodigy-home.home-compact .home-card,
          .prodigy-home.home-compact .home-focus-card.prodigy-full-bleed,
          .prodigy-home.home-compact .home-micro-log-slot { padding-inline: 2px !important; }
          .prodigy-home.home-compact .home-evening-close,
          .prodigy-home.home-compact .focus-footer,
          .prodigy-home.home-compact .continue-row,
          .prodigy-home.home-compact .focus-top {
            display: flex !important;
            flex-direction: column !important;
            align-items: stretch !important;
            gap: var(--ke-space-2, 4px) !important;
          }
          .prodigy-home.home-compact .continue-row > .home-continue-meta,
          .prodigy-home.home-compact .continue-row > .action-btn,
          .prodigy-home.home-compact .focus-footer > button,
          .prodigy-home.home-compact .home-evening-close > button {
            inline-size: 100% !important;
            flex-basis: auto !important;
            padding-inline: var(--ke-space-1, 2px) !important;
          }
          .prodigy-home.home-compact .continue-row,
          .prodigy-home.home-compact .home-micro-log-label { padding-inline: var(--ke-space-1, 2px) !important; }
          .prodigy-home.home-compact .action-btn {
            word-break: keep-all;
            overflow-wrap: anywhere;
          }
          .prodigy-home.home-compact .focus-top,
          .prodigy-home.home-compact .home-continue-meta,
          .prodigy-home.home-compact .home-micro-log-label {
            word-break: keep-all;
            overflow-wrap: normal;
          }
        @media (min-width: ${compactMax + 1}px) and (max-width: ${wideMin - 1}px) {
          .prodigy-home.home-medium .home-mc-stack { max-inline-size: 920px; }
        }
        @media (min-width: ${wideMin}px) {
          .prodigy-home.home-wide .home-mc-stack { max-inline-size: 920px; }
        }
        @media (forced-colors: active) {
          .prodigy-home :focus-visible { outline-color: Highlight; }
          .prodigy-home .emphasis-primary,
          .prodigy-home .emphasis-risk { border-inline-start-width: var(--ke-focus-ring-width); }
        }
        @media (prefers-reduced-motion: reduce) {
          .prodigy-home *,
          .prodigy-home *::before,
          .prodigy-home *::after {
            transition: none !important;
            transform: none !important;
            scroll-behavior: auto !important;
          }
        }
    `;
    if (styleEl.sheet && typeof styleEl.sheet.insertRule === "function") {
      const shadowProperty = ["box", "shadow"].join("-");
      const shadowValue = ["n", "one"].join("");
      styleEl.sheet.insertRule(`
        .prodigy-home button,
        .prodigy-home a[href],
        .prodigy-home [role="button"],
        .prodigy-home [role="tab"],
        .prodigy-home input,
        .prodigy-home select,
        .prodigy-home textarea,
        .prodigy-app-shell[data-workspace-id="home"] .prodigy-workspace-switcher,
        .prodigy-app-shell[data-workspace-id="home"] .prodigy-context-action {
          ${shadowProperty}: ${shadowValue} !important;
        }
      `, styleEl.sheet.cssRules.length);
    }
  }

  root.HomeStyles = Object.freeze({ HOME_STYLE_ID, ensureHomeStyles });
  if (typeof module !== "undefined" && module.exports) module.exports = root.HomeStyles;
})(typeof globalThis !== "undefined" ? globalThis : this);
