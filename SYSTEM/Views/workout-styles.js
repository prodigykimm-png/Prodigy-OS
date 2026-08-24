(function (root) {
  "use strict";

  const T = root.ProdigyTokens || (typeof require === "function" ? require("./design-tokens.js") : {});
  const RESPONSIVE_BREAKPOINTS = T.RESPONSIVE_BREAKPOINTS || {};
  const CONTROL_HEIGHTS = T.CONTROL_HEIGHTS || {};

  const STYLE_ID = "prodigy-workout-styles";

  function ensureStyles() {
    if (typeof document === "undefined") return;
    const TYPE_SCALE = T.TYPE_SCALE || {};
    const SPACE_SCALE = T.SPACE_SCALE || {};
    const RADII = T.RADII || {};
    const SEMANTIC_COLORS = T.SEMANTIC_COLORS || {};

    const compactMax = Number(RESPONSIVE_BREAKPOINTS.collapsedNavMax) || 833;
    const touchTarget = Number(CONTROL_HEIGHTS.touchTarget) || 44;

    let styleEl = document.getElementById(STYLE_ID);
    if (!styleEl) {
      styleEl = document.createElement("style");
      styleEl.id = STYLE_ID;
      styleEl.setAttribute("data-workout-styles", "");
      document.head.appendChild(styleEl);
    }
    if (root.ProdigyUI && typeof root.ProdigyUI.ensureStyles === "function") {
      root.ProdigyUI.ensureStyles();
    }

    styleEl.textContent = `
      .workout-workspace {
        --ke-type-body: ${TYPE_SCALE.body?.fontSize || 17}px;
        --ke-leading-body: ${TYPE_SCALE.body?.lineHeight || 1.47};
        --ke-type-label: ${TYPE_SCALE.caption?.fontSize || 14}px;
        --ke-type-title: ${TYPE_SCALE.tagline?.fontSize || 21}px;
        --ke-font-text: ${TYPE_SCALE.body?.fontFamily || "system-ui, -apple-system, sans-serif"};
        --ke-space-1: ${SPACE_SCALE.xxs || 4}px;
        --ke-space-2: ${SPACE_SCALE.xs || 8}px;
        --ke-space-3: ${SPACE_SCALE.sm || 12}px;
        --ke-space-4: ${SPACE_SCALE.md || 17}px;
        --ke-space-5: ${SPACE_SCALE.lg || 24}px;
        --ke-border-width: 1px;
        --ke-focus-ring-width: 2px;
        --ke-radius-control: ${RADII.sm || 8}px;
        --ke-radius-panel: ${RADII.md || 12}px;
        --ke-radius-pill: 9999px;
        --ke-opacity-disabled: 0.6;
        --ke-color-surface: ${SEMANTIC_COLORS.canvas || "var(--background-primary)"};
        --ke-color-surface-secondary: ${SEMANTIC_COLORS.canvasParchment || "var(--background-secondary)"};
        --ke-color-border: ${SEMANTIC_COLORS.border || "var(--background-modifier-border)"};
        --ke-color-text: ${SEMANTIC_COLORS.ink || "var(--text-normal)"};
        --ke-color-muted: ${SEMANTIC_COLORS.muted || "var(--text-muted)"};
        --ke-color-accent: ${SEMANTIC_COLORS.focus || "var(--text-accent)"};
        --ke-color-interactive: ${SEMANTIC_COLORS.action || "var(--interactive-accent)"};
        --ke-color-on-interactive: ${SEMANTIC_COLORS.onAction || "var(--text-on-accent)"};
        --ke-control-height: ${CONTROL_HEIGHTS.native || 44}px;
        --ke-touch-target: ${CONTROL_HEIGHTS.touchTarget || 44}px;
        --ke-action-bar-height: ${CONTROL_HEIGHTS.actionBar || 52}px;
      }
      .workout-workspace, .workout-view, .workout-panel, .workout-session {
        box-sizing: border-box; min-inline-size: 0; max-inline-size: 100%;
        font-family: var(--ke-font-text, inherit);
        font-size: var(--ke-type-body);
        line-height: var(--ke-leading-body);
        word-break: keep-all; overflow-wrap: anywhere;
      }
      .workout-workspace * { box-sizing: border-box; min-inline-size: 0; }
      .workout-header {
        display: flex; align-items: flex-start; justify-content: space-between; flex-wrap: wrap; gap: var(--ke-space-3);
        padding-block: var(--ke-space-4); border-block-end: var(--ke-border-width) solid var(--ke-color-border);
      }
      .workout-header h1 { margin: 0; font-family: var(--ke-font-display); font-size: var(--ke-type-title); line-height: var(--ke-leading-control); font-weight: var(--ke-font-weight-strong); }
      .workout-header p { margin: 0; color: var(--ke-color-muted); font-size: var(--ke-type-label); line-height: var(--ke-leading-body); overflow-wrap: anywhere; }
      .workout-actions { display: flex; flex-wrap: wrap; gap: var(--ke-space-2); align-items: center; }

      /* GPU Accelerated Interactive Physics */
      .workout-btn, .workout-header button, .workout-actions button {
        min-block-size: var(--ke-touch-target, ${touchTarget}px);
        min-inline-size: var(--ke-touch-target, ${touchTarget}px);
        padding: var(--ke-space-2) var(--ke-space-3);
        border: var(--ke-border-width, 1px) solid var(--ke-color-border, var(--background-modifier-border));
        border-radius: var(--ke-radius-control, 8px);
        background: var(--ke-color-surface, var(--background-primary));
        color: var(--ke-color-text, var(--text-normal));
        font: inherit; cursor: pointer;
        will-change: transform;
        transition: transform 0.15s cubic-bezier(0.16, 1, 0.3, 1), background-color 0.15s ease, border-color 0.15s ease;
      }
      .workout-btn:hover { background: var(--ke-color-hover); }
.workout-btn:active, .workout-actions button:active, .workout-chip:active { transform: scale(0.95); }
      .workout-btn[data-primary="true"] {
        background: var(--ke-color-interactive);
        border-color: var(--ke-color-interactive);
        color: var(--ke-color-on-interactive);
      }
      .workout-input, .workout-select, .workout-textarea {
        inline-size: 100%;
        min-block-size: var(--ke-touch-target, ${touchTarget}px);
        padding: var(--ke-space-2) var(--ke-space-3);
        border: var(--ke-border-width, 1px) solid var(--ke-color-border, var(--background-modifier-border));
        border-radius: var(--ke-radius-control, 8px);
        background: var(--ke-color-surface, var(--background-primary));
        color: var(--ke-color-text, var(--text-normal));
        font: inherit; word-break: keep-all; overflow-wrap: anywhere;
      }

      /* Workout Exercise Cards GPU Animation */
      .workout-card {
        padding: var(--ke-space-4, 16px);
        border: var(--ke-border-width, 1px) solid var(--ke-color-border, var(--background-modifier-border));
        border-radius: var(--ke-radius-panel, 12px);
        background: var(--ke-color-surface-secondary, var(--background-secondary));
        display: grid; gap: var(--ke-space-2);
        will-change: transform;
        transition: transform 0.2s cubic-bezier(0.16, 1, 0.3, 1), box-shadow 0.2s ease;
      }
.workout-card:hover {
  box-shadow:none;
      }
      .workout-card[aria-current="true"], .workout-card[data-state="selected"] { border-color: var(--ke-color-interactive); }

      .workout-chip {
        display: inline-flex; align-items: center; min-block-size: var(--ke-touch-target, ${touchTarget}px);
        padding-inline: var(--ke-space-3); border: var(--ke-border-width, 1px) solid var(--ke-color-border, var(--background-modifier-border));
        border-radius: var(--ke-radius-pill); color: var(--ke-color-muted); background: var(--ke-color-surface);
        will-change: transform; transition: transform 0.15s cubic-bezier(0.16, 1, 0.3, 1);
      }
      .workout-chip.is-active { border-color: var(--ke-color-interactive); color: var(--ke-color-interactive); }
      .workout-grid { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: var(--ke-space-4); min-block-size: 0; }
      .workout-list { display: grid; gap: var(--ke-space-2); }
      .workout-detail-pane { padding-inline-start: var(--ke-space-4); border-inline-start: var(--ke-border-width) solid var(--ke-color-border); }

      .workout-btn:disabled, .workout-actions button:disabled, .workout-chip:disabled, .workout-input:disabled { opacity: var(--ke-opacity-disabled); cursor: not-allowed; transform: none; }
      .workout-btn:focus-visible, .workout-input:focus-visible, .workout-select:focus-visible, .workout-textarea:focus-visible, .workout-chip:focus-visible { outline: var(--ke-focus-ring-width) solid var(--ke-color-accent); outline-offset: var(--ke-space-1); }

      /* Sticky Session Bar Glassmorphism */
      .workout-session-bar {
        position: sticky;
        top: 0;
        z-index: 10;
        background: var(--ke-color-surface, var(--background-primary));
        padding: var(--ke-space-3);
        border-bottom: 1px solid var(--ke-color-border, var(--background-modifier-border));
        border-radius: var(--ke-radius-panel, 12px);
      }

      .prodigy-workout-dashboard{max-inline-size:100%;min-inline-size:0;padding-block-end:var(--ke-space-7);font-family:var(--ke-font-text);font-size:var(--ke-type-body);line-height:var(--ke-leading-body);word-break:keep-all;overflow-wrap:anywhere}
      .prodigy-workout-dashboard *{box-sizing:border-box;min-inline-size:0}
      .prodigy-workout-dashboard :is(button,input,select,textarea){min-inline-size:var(--ke-touch-target);min-block-size:var(--ke-touch-target);max-inline-size:100%;box-shadow:none!important}
      .workout-toolbar,.workout-inline-actions,.workout-modal-actions,.workout-metrics,.workout-nutrition-actions,.workout-running-actions,.workout-rest-controls,.workout-target-chips{display:flex;align-items:center;flex-wrap:wrap;gap:var(--ke-space-2);min-inline-size:0;max-inline-size:100%}
      .workout-toolbar,.workout-modal-actions{justify-content:flex-end;margin-block:var(--ke-space-3)}
      .workout-button{font:inherit;white-space:normal;word-break:keep-all;overflow-wrap:anywhere}
      .workout-button:active,.workout-health-tab:active,.workout-exercise-link:active{transform:scale(0.95)}
      .workout-button:disabled,.workout-health-tab:disabled{opacity:var(--ke-opacity-disabled);cursor:not-allowed;transform:none}
      .workout-button:focus-visible,.workout-health-tab:focus-visible,.workout-exercise-link:focus-visible,.workout-exercise-note-link:focus-visible,input:focus-visible,select:focus-visible,textarea:focus-visible{outline:var(--ke-focus-ring-width) solid var(--ke-color-accent);outline-offset:var(--ke-space-1)}
      .workout-section{padding-block:var(--ke-space-5);border-block-end:var(--ke-border-width) solid var(--ke-color-border)}
      .workout-section h2,.workout-section h3,.workout-start-path h3,.workout-running-latest h3{margin:0;font-family:var(--ke-font-display);font-size:var(--ke-type-heading);line-height:var(--ke-leading-control);font-weight:var(--ke-font-weight-strong)}
      .workout-section-copy,.workout-muted,.workout-empty,.workout-previous,.workout-record-strip,.workout-error{font-size:var(--ke-type-label);line-height:var(--ke-leading-body);color:var(--ke-color-muted);overflow-wrap:anywhere}
      .workout-error,[data-state="error"]{color:var(--ke-color-error)}
      .workout-panel-loading,[data-state="loading"],[aria-busy="true"]{cursor:progress}
      .workout-empty,[data-state="empty"]{color:var(--ke-color-muted)}
      .workout-current,.workout-library-row,.workout-history-row,.workout-exercise-heading,.workout-running-history-row{display:flex;align-items:flex-start;justify-content:space-between;flex-wrap:wrap;gap:var(--ke-space-3)}
      .workout-start-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,18rem),1fr));gap:var(--ke-space-3)}
      .workout-start-path,.workout-exercise-card,.workout-running-latest,.workout-import-replace,.workout-exercise-body{padding:var(--ke-space-4);border:var(--ke-border-width) solid var(--ke-color-border);border-radius:var(--ke-radius-configurator);background:var(--ke-color-surface-secondary)}
      .workout-session-live{inline-size:100%;margin-inline:0;padding-inline:var(--ke-space-4);scroll-margin-block-start:var(--ke-space-5)}
      .workout-session-bar-info{display:flex;align-items:baseline;gap:var(--ke-space-2);flex:1}
      .workout-progress{margin-block-start:var(--ke-space-2)}
      .workout-progress-track{block-size:var(--ke-space-2);border-radius:var(--ke-radius-pill);background:var(--ke-color-border)}
      .workout-progress-fill{block-size:100%;border-radius:inherit;background:var(--ke-color-interactive)}
      .workout-set-list,.workout-library-row,.workout-history-row,.workout-editor-day,.workout-editor-exercise,.workout-nutrition-meal{border-block-start:var(--ke-border-width) solid var(--ke-color-border)}
      .workout-set-row{display:grid;grid-template-columns:var(--ke-touch-target) minmax(0,1fr);align-items:center;gap:var(--ke-space-2);padding-block:var(--ke-space-3)}
      .workout-set-fields,.workout-set-fields-min,.workout-modal-grid,.workout-editor-meta{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,10rem),1fr));gap:var(--ke-space-2);grid-column:1/-1}
      .workout-field{display:grid;gap:var(--ke-space-1)}
      .workout-field label,.workout-nutrition-chip-label,.workout-running-stat-label{font-size:var(--ke-type-label);color:var(--ke-color-muted)}
      .workout-field input,.workout-field textarea,.workout-modal input,.workout-modal select,.workout-modal textarea{inline-size:100%;min-block-size:var(--ke-touch-target)}
      .workout-chip-btn,.workout-health-tab,.workout-nutrition-source-tag,.workout-running-legacy-tag,.workout-running-summary-tag{border-radius:var(--ke-radius-pill)}
      .workout-health-tablist{display:flex;flex-wrap:wrap;gap:var(--ke-space-1);border-block-end:var(--ke-border-width) solid var(--ke-color-border)}
      .workout-health-tab{min-block-size:var(--ke-touch-target);padding-inline:var(--ke-space-4);border:0;background:transparent;color:var(--ke-color-muted);font:inherit;cursor:pointer}
      .workout-health-tab[aria-selected="true"],.workout-health-tab.is-active{color:var(--ke-color-interactive);border-block-end:var(--ke-focus-ring-width) solid var(--ke-color-interactive)}
      .workout-nutrition-summary,.workout-running-stats,.workout-running-trend-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,8rem),1fr));gap:var(--ke-space-2)}
      .workout-nutrition-chip,.workout-running-stat,.workout-running-trend-cell{display:grid;justify-items:center;gap:var(--ke-space-1);padding:var(--ke-space-3);background:var(--ke-color-surface-secondary);border-radius:var(--ke-radius-configurator)}
      .workout-running-split-table,.workout-import-table{inline-size:100%;table-layout:fixed;border-collapse:collapse}
      .workout-running-split-table th,.workout-running-split-table td,.workout-import-table th,.workout-import-table td{padding:var(--ke-space-2);border-block-end:var(--ke-border-width) solid var(--ke-color-border);text-align:start}
      .workout-import-details,.workout-editor-days,.workout-exercise-body,.workout-replace-list{max-block-size:none;overflow:visible}
      .workout-modal{max-inline-size:min(100%,42rem)}.workout-program-editor{max-inline-size:min(100%,55rem)}
      .workout-day-chooser,.workout-editor-heading,.workout-editor-add{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:var(--ke-space-2)}
      .workout-editor-set,.workout-editor-day-head{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,8rem),1fr));gap:var(--ke-space-2)}
      .workout-exercise-link,.workout-exercise-note-link{min-block-size:var(--ke-touch-target);display:inline-flex;align-items:center;border:0;background:transparent;color:var(--ke-color-interactive);font:inherit;cursor:pointer}
      .workout-rest-timer[hidden]{display:none}
      .workout-rest-label{font-variant-numeric:tabular-nums;color:var(--ke-color-interactive);font-weight:var(--ke-font-weight-strong)}
      .whr-compact .workout-section.prodigy-utility-card{padding-inline:var(--ke-space-2)}
      .whr-compact .workout-start-path.prodigy-utility-card{padding:var(--ke-space-1)}

      @media(max-width:${compactMax}px){
        .workout-header { align-items: stretch; flex-direction: column; }
        .workout-grid { display: block; }
        .workout-detail-pane { padding-inline-start: 0; border-inline-start: 0; }
        .workout-actions button { flex: 1 1 100%; }
        .workout-session-bar { padding-bottom: max(12px, env(safe-area-inset-bottom)); }
      }
      @media(forced-colors:active){
        .workout-card[aria-current="true"], .workout-chip.is-active { forced-color-adjust: auto; border: 2px solid Highlight; }
        .workout-btn:focus-visible, .workout-input:focus-visible, .workout-select:focus-visible, .workout-textarea:focus-visible, .workout-chip:focus-visible { outline-color: Highlight; }
      }
      @media(prefers-reduced-motion:reduce){
        .workout-workspace *, .workout-btn, .workout-card, .workout-chip {
          animation: none !important; transition: none !important; scroll-behavior: auto !important; transform: none !important; will-change: auto !important;
        }
      }
    `;
  }

  root.WorkoutStyles = { ensureStyles, STYLE_ID };
  if (typeof module !== "undefined" && module.exports) module.exports = root.WorkoutStyles;
})(typeof window !== "undefined" ? window : globalThis);
