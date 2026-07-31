/**
 * Home Dashboard CSS — extracted from home-view.js (P2-1)
 * 로드 순서: design-tokens.js → home-styles.js → home-view.js
 */
(function (root) {
  "use strict";
  const T = root.ProdigyTokens || {};
  const BREAKPOINTS = T.BREAKPOINTS || {};
  const CONTROL_HEIGHTS = T.CONTROL_HEIGHTS || {};

  const HOME_STYLE_ID = "prodigy-home-styles";

  function ensureHomeStyles() {
    if (typeof document === "undefined") return;
    const medium = Number(BREAKPOINTS.medium);
    const wide = Number(BREAKPOINTS.wide);
    const workspaceBarHeight = Number(CONTROL_HEIGHTS.workspaceBar);
    const touchTarget = Number(CONTROL_HEIGHTS.touchTarget);
    if (![medium, wide, workspaceBarHeight, touchTarget].every(Number.isFinite)) return;
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
          overflow-x: hidden;
          margin: 0 auto;
          padding: 0 8px 32px;
          font-size: var(--ke-type-body, 0.84rem);
          line-height: var(--ke-leading-body, 1.45);
          letter-spacing: 0;
          word-break: keep-all;
          overflow-wrap: anywhere;
        }
        .prodigy-home * { min-inline-size: 0; }
        @media (max-width: ${medium - 1}px) {
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
        .home-mc-lower .home-card { border-color: var(--background-modifier-border); }
        .home-system-status { opacity: 0.92; padding: 12px 14px !important; }
        .home-quick-actions .action-btn { min-height: 36px !important; padding: var(--ke-space-2, 4px) var(--ke-space-4, 12px) !important; font-size: var(--ke-type-label, 0.72rem) !important; line-height: var(--ke-leading-control, 1.35) !important; }
        .prodigy-home.home-wide .home-grid { grid-template-columns: 1fr; }
        .prodigy-home.home-wide .col-span-8 { grid-column: span 1; }
        .prodigy-home.home-wide .col-span-4 { grid-column: span 1; }
        .prodigy-home.home-wide .col-span-12 { grid-column: span 1; }
        .home-card {
          background: var(--background-secondary);
          border: 1px solid var(--background-modifier-border);
          border-radius: 8px;
          padding: 16px;
        }
        .emphasis-primary {
          background: var(--background-secondary);
          border-left: 4px solid var(--text-accent);
        }
        .emphasis-secondary {
          background: var(--background-secondary);
        }
        .emphasis-risk {
          border-left: 4px solid var(--text-error);
          background: var(--background-secondary);
        }
        .home-header {
          font-weight: 700;
          font-size: var(--ke-type-heading, 0.92rem);
          line-height: var(--ke-leading-body, 1.45);
          letter-spacing: 0;
          color: var(--text-normal);
          margin-bottom: 12px;
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .badge {
          display: inline-flex;
          align-items: center;
          min-height: 22px;
          font-size: var(--ke-type-label, 0.72rem);
          line-height: var(--ke-leading-control, 1.35);
          padding: var(--ke-space-1, 2px) var(--ke-space-3, 8px);
          border-radius: 4px;
          font-weight: 650;
          white-space: nowrap;
          flex: none;
        }
        .badge-high { background: var(--background-modifier-hover); color: var(--text-error); }
        .badge-medium { background: var(--background-modifier-hover); color: var(--text-warning, var(--text-accent)); }
        .badge-low { background: var(--background-modifier-hover); color: var(--text-accent); }
        .badge-gray { background: var(--background-modifier-hover); color: var(--text-muted); }
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
          min-height: 0 !important;
          height: auto !important;
          font-size: var(--ke-type-label, 0.72rem) !important;
          padding: var(--ke-space-1, 2px) var(--ke-space-3, 8px) !important;
          border-radius: 4px !important;
          border: 1px solid var(--background-modifier-border);
          background: var(--background-primary);
          color: var(--text-normal);
          cursor: pointer;
          font-weight: 600;
          line-height: var(--ke-leading-control, 1.35) !important;
          box-sizing: border-box;
          white-space: nowrap;
          transition: background-color 0.15s ease, border-color 0.15s ease, transform 0.15s ease;
          -webkit-appearance: none;
          appearance: none;
        }
        .prodigy-home .action-btn:hover,
        .prodigy-home .prodigy-launcher-actions button:hover,
        .prodigy-home .home-launcher-mount button:hover {
          background: var(--background-modifier-hover);
        }
        .action-btn:active,
        .prodigy-home .prodigy-launcher-actions button:active { transform: translateY(1px); }
        .action-btn:focus-visible,
        .prodigy-home .prodigy-launcher-actions button:focus-visible,
        .prodigy-home .home-launcher-mount button:focus-visible {
          outline: 2px solid var(--text-accent);
          outline-offset: 2px;
        }
        .prodigy-home button.action-btn-primary,
        .prodigy-home .action-btn-primary {
          background: var(--interactive-accent) !important;
          color: var(--text-on-accent) !important;
          border-color: var(--interactive-accent) !important;
        }
        .prodigy-home button.action-btn-primary:hover,
        .prodigy-home .action-btn-primary:hover {
          background: var(--interactive-accent-hover) !important;
        }
        /* Launcher CTA: compact size, accent border like other home actions */
        .prodigy-home .prodigy-launcher-actions button {
          min-width: 0 !important;
          border-color: var(--text-accent) !important;
          color: var(--text-accent) !important;
          background: var(--background-secondary) !important;
          font-weight: 700 !important;
        }
        .input-text {
          min-width: 0;
          width: auto;
          flex: 1 1 220px;
          font-size: var(--ke-type-body, 0.84rem);
          line-height: var(--ke-leading-body, 1.45);
          padding: var(--ke-space-2, 4px) var(--ke-space-3, 8px);
          border-radius: 6px;
          border: 1px solid var(--background-modifier-border);
          background: var(--background-primary);
          color: var(--text-normal);
        }
        .home-title-row { display: flex; justify-content: space-between; align-items: flex-end; flex-wrap: wrap; gap: 12px; margin-bottom: 16px; }
        .home-title-row h2 { margin: 0; font-size: var(--ke-type-title, 1.05rem); line-height: var(--ke-leading-body, 1.45); letter-spacing: 0; }
        .home-toolbar { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
        .focus-list { display: flex; flex-direction: column; margin: 0 -2px; }
        .focus-row { display: flex; flex-direction: column; gap: 7px; padding: 14px 2px; border-top: 1px solid var(--background-modifier-border); }
        .focus-row:first-child { border-top: 0; padding-top: 2px; }
        .focus-top { display: flex; align-items: center; gap: 8px; min-width: 0; }
        .focus-title { display: flex; align-items: center; gap: 7px; min-width: 0; flex: 1 1 auto; font-weight: 700; }
        .focus-title a, .focus-title span { overflow-wrap: anywhere; }
        .focus-reason { color: var(--text-muted); font-size: var(--ke-type-body, 0.84rem); line-height: var(--ke-leading-body, 1.45); padding-left: 24px; }
        .focus-details { margin-left: 24px; font-size: var(--ke-type-label, 0.72rem); line-height: var(--ke-leading-body, 1.45); color: var(--text-muted); }
        .focus-details summary { cursor: pointer; color: var(--text-accent); font-weight: 600; }
        .focus-evidence { margin-top: 7px; padding: 9px 10px; border-left: 2px solid var(--background-modifier-border); display: flex; flex-direction: column; gap: 4px; }
        .focus-actions, .focus-footer { display: flex; gap: 7px; flex-wrap: wrap; justify-content: flex-end; align-items: center; }
        .focus-actions { margin-top: 4px; }
        .focus-footer { padding-top: 12px; border-top: 1px solid var(--background-modifier-border); }
        .continue-list { display: flex; flex-direction: column; }
        .workspace-list { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 6px; }
        .continue-row, .workspace-row { display: flex; align-items: center; gap: 10px; padding: 10px 0; border-top: 1px solid var(--background-modifier-border); }
        .continue-row:first-child { border-top: 0; padding-top: 0; }
        .continue-row:last-child { padding-bottom: 0; }
        .continue-row { cursor: pointer; }
        .continue-row:hover, .workspace-row:hover { background: var(--background-modifier-hover); }
        .workspace-row {
          min-height: 40px;
          justify-content: space-between;
          padding: 8px 10px;
          border: 1px solid var(--background-modifier-border);
          border-radius: 6px;
          cursor: pointer;
        }
        .workspace-row:focus-visible { outline: 2px solid var(--text-accent); outline-offset: 2px; }
        .workspace-label { display: flex; align-items: center; gap: 8px; min-width: 0; }
        .workspace-arrow { color: var(--text-muted); font-size: 1.2em; line-height: 1; }
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
          padding-bottom: var(--home-mobile-bottom-clearance);
        }
        .prodigy-home.home-compact .home-grid {
          gap: 10px;
        }
        .prodigy-home.home-compact .home-column {
          gap: 10px;
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
          border: 1px solid var(--background-modifier-border);
          border-radius: var(--ke-radius-panel);
          background: var(--background-secondary);
          padding: 4px 10px 10px;
        }
        .prodigy-home.home-compact .home-secondary-fold > summary {
          font-weight: 800;
          font-size: var(--ke-type-heading, 0.92rem);
          line-height: var(--ke-leading-control, 1.35);
          color: var(--text-muted);
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
          color: var(--text-accent);
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
          border: 1px dashed var(--background-modifier-border);
          border-radius: var(--ke-radius-control);
          color: var(--text-muted);
          font-size: var(--ke-type-body);
          line-height: var(--ke-leading-body);
        }
        .prodigy-home .home-ws-dock {
          display: flex;
          align-items: center;
          block-size: ${workspaceBarHeight}px;
          box-sizing: border-box;
          margin: 0 0 10px 0;
          padding: 0 var(--ke-space-2);
          border: 1px solid var(--background-modifier-border);
          border-radius: var(--ke-radius-panel);
          background: var(--background-secondary);
          overflow: hidden;
        }
        .prodigy-home .home-ws-dock-label {
          position: absolute;
          inline-size: 1px;
          block-size: 1px;
          margin: -1px;
          padding: 0;
          overflow: hidden;
          clip: rect(0 0 0 0);
          white-space: nowrap;
        }
        .prodigy-home .home-ws-dock-row {
          display: flex;
          flex: 1 1 auto;
          align-items: center;
          block-size: 100%;
          gap: var(--ke-space-2);
          flex-wrap: nowrap;
          overflow: hidden;
        }
        .prodigy-home .home-ws-dock-btn {
          flex: 1 1 0;
          min-inline-size: 0;
          max-inline-size: none;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: var(--ke-space-2);
          min-height: var(--ke-touch-target) !important;
          height: var(--ke-touch-target) !important;
          padding: 0 var(--ke-space-2) !important;
          border-radius: var(--ke-radius-control) !important;
          border: 1px solid var(--background-modifier-border);
          background: var(--background-primary);
          color: var(--text-normal);
          font-size: var(--ke-type-chrome, 0.68rem) !important;
          font-weight: 600 !important;
          line-height: var(--ke-leading-control, 1.35) !important;
          letter-spacing: 0;
          cursor: pointer;
        }
        .prodigy-home .home-ws-dock-btn:active {
          transform: scale(0.97);
          border-color: var(--text-accent);
        }
        .prodigy-home .home-ws-dock-icon {
          font-size: 0.95em;
          line-height: 1;
          opacity: 0.85;
        }
        .prodigy-home .home-ws-dock-name {
          min-inline-size: 0;
          max-width: 100%;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .prodigy-home .home-ws-dock-btn:focus-visible,
        .prodigy-home .home-workspace-sheet-btn:focus-visible {
          outline: 2px solid var(--text-accent);
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
          border: 1px solid var(--background-modifier-border);
          border-radius: var(--ke-radius-control);
          background: var(--background-primary);
          color: var(--text-normal);
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
          border: 1px solid var(--background-modifier-border);
          border-radius: 8px;
          background: var(--background-secondary);
          padding: 2px 10px 8px;
          margin: 0;
        }
        .prodigy-home .home-lifecycle-fold > summary {
          font-weight: 700;
          font-size: var(--ke-type-body, 0.84rem);
          line-height: var(--ke-leading-control, 1.35);
          color: var(--text-muted);
          cursor: pointer;
          min-height: 36px;
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
          color: var(--text-muted);
        }
        .prodigy-home .home-lifecycle-fold[open] > summary::before {
          content: "▾ ";
        }
        .prodigy-home .home-lifecycle-fold .home-card {
          border: none;
          box-shadow: none;
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
        .prodigy-home.home-compact .col-span-4:empty {
          display: none;
        }
        @media (min-width: ${medium}px) and (max-width: ${wide - 1}px) {
          .prodigy-home.home-medium .home-mc-stack { max-width: 920px; }
        }
        @media (min-width: ${wide}px) {
          .prodigy-home.home-wide .home-mc-stack { max-width: 920px; }
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
  }

  root.HomeStyles = Object.freeze({ HOME_STYLE_ID, ensureHomeStyles });
  if (typeof module !== "undefined" && module.exports) module.exports = root.HomeStyles;
})(typeof globalThis !== "undefined" ? globalThis : this);
