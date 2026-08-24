(function (root) {
  "use strict";
  var STYLE_ID = "prodigy-project-styles";

  function ensureProjectStyles() {
    if (typeof document === "undefined") return;
    if (document.getElementById(STYLE_ID)) return;
    var T = root.ProdigyTokens || {};

    const TYPE_SCALE = T.TYPE_SCALE || {};
    const SPACE_SCALE = T.SPACE_SCALE || {};
    const RADII = T.RADII || {};
    const CONTROL_HEIGHTS = T.CONTROL_HEIGHTS || {};
    const SEMANTIC_COLORS = T.SEMANTIC_COLORS || {};

    const body = TYPE_SCALE.body || {};
    const caption = TYPE_SCALE.caption || {};
    const title = TYPE_SCALE.tagline || {};

    let styleEl = document.createElement("style");
    styleEl.id = STYLE_ID;
    styleEl.setAttribute("data-project-styles", "");
    document.head.appendChild(styleEl);

    styleEl.textContent = `
      .prodigy-project-wizard, .prodigy-project-type-manager, .prodigy-project-card {
        --ke-type-body: ${body.fontSize || 17}px;
        --ke-type-title: ${title.fontSize || 21}px;
        --ke-type-label: ${caption.fontSize || 14}px;
        --ke-leading-body: ${body.lineHeight || 1.47};
        --ke-leading-control: ${caption.lineHeight || 1.43};
        --ke-font-text: ${body.fontFamily || "system-ui, -apple-system, sans-serif"};
        --ke-space-1: ${SPACE_SCALE.xxs || 4}px;
        --ke-space-2: ${SPACE_SCALE.xs || 8}px;
        --ke-space-3: ${SPACE_SCALE.sm || 12}px;
        --ke-border-width: 1px;
        --ke-focus-ring-width: 2px;
        --ke-radius-control: ${RADII.sm || 8}px;
        --ke-radius-panel: ${RADII.md || 12}px;
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
        --ke-radius-pill: 9999px;
      }
      .prodigy-project-wizard, .prodigy-project-type-manager {
        inline-size: 100%;
        max-inline-size: 100%;
        min-inline-size: 0;
        color: var(--ke-color-text);
        font: 400 var(--ke-type-body)/var(--ke-leading-body) var(--ke-font-text);
        word-break: keep-all;
        overflow-wrap: anywhere;
      }
      .prodigy-project-wizard *, .prodigy-project-type-manager * {
        box-sizing: border-box;
        min-inline-size: 0;
      }

      /* Project Cards GPU Interactive Physics */
      .prodigy-project-card {
        padding: 16px;
        border: 1px solid var(--ke-color-border);
        border-radius: var(--ke-radius-panel);
        background: var(--ke-color-surface-secondary);
        margin-bottom: 12px;
        will-change: transform;
        transition: transform 0.2s cubic-bezier(0.16, 1, 0.3, 1), box-shadow 0.2s ease, border-color 0.15s ease;
      }
      .prodigy-project-card:hover {
        box-shadow: none;
        border-color: var(--ke-color-interactive);
      }

      .prodigy-project-wizard button, .prodigy-project-type-manager button,
      .prodigy-project-wizard input, .prodigy-project-wizard select,
      .prodigy-project-wizard textarea, .prodigy-project-type-manager input {
        min-inline-size: var(--ke-touch-target);
        min-block-size: var(--ke-touch-target);
        max-inline-size: 100%;
        box-shadow: none !important;
      }
      .prodigy-project-wizard button, .prodigy-project-type-manager button {
        border-radius: var(--ke-radius-control);
        white-space: normal;
        word-break: keep-all;
        overflow-wrap: anywhere;
        will-change: transform;
        transition: transform 0.15s cubic-bezier(0.16, 1, 0.3, 1), background-color 0.15s ease;
      }
      .prodigy-project-wizard button:active, .prodigy-project-type-manager button:active {
        transform: scale(0.95);
      }
      .prodigy-project-wizard button:focus-visible, .prodigy-project-type-manager button:focus-visible,
      .prodigy-project-wizard input:focus-visible, .prodigy-project-wizard select:focus-visible,
      .prodigy-project-wizard textarea:focus-visible {
        outline: var(--ke-focus-ring-width) solid var(--ke-color-accent);
        outline-offset: var(--ke-space-1);
      }
      .prodigy-project-wizard button:disabled {
        cursor: not-allowed !important;
        opacity: var(--ke-opacity-disabled);
        transform: none;
      }
      .prodigy-project-wizard .prodigy-type-name, .prodigy-project-wizard .prodigy-wizard-column {
        min-inline-size: 0;
        overflow-wrap: anywhere;
      }
      .prodigy-project-wizard .prodigy-date-grid > *, .prodigy-project-wizard .prodigy-date-stack input {
        min-inline-size: 0;
      }
      .prodigy-project-approval-bar {
        display: flex;
        justify-content: flex-end;
        gap: var(--ke-space-2);
        min-block-size: var(--ke-action-bar-height);
        margin-block-start: var(--ke-space-3);
        padding-block-start: var(--ke-space-3);
        border-block-start: var(--ke-border-width) solid var(--ke-color-border);
        flex-wrap: wrap;
        background: var(--ke-color-surface);
      }
      .prodigy-project-type-add {
        display: grid;
        grid-template-columns: minmax(0, 1fr) auto;
        gap: var(--ke-space-2);
        align-items: center;
      }
      .prodigy-project-wizard[data-density=compact] .prodigy-workflow-row,
      .prodigy-project-type-manager[data-density=compact] .prodigy-project-type-add,
      .prodigy-project-wizard[data-density=compact] .prodigy-project-approval-bar,
      .prodigy-project-type-manager[data-density=compact] .prodigy-project-approval-bar,
      .prodigy-project-wizard[data-density=compact] .prodigy-workflow-head {
        display: grid !important;
        grid-template-columns: minmax(0, 1fr) !important;
      }
      .prodigy-project-wizard[data-density=compact] .prodigy-workflow-index {
        text-align: start !important;
      }
      .prodigy-project-wizard[data-density=compact] .prodigy-workflow-controls {
        display: grid !important;
        grid-template-columns: repeat(auto-fit, minmax(var(--ke-touch-target), 1fr));
        inline-size: 100%;
      }
      .prodigy-project-wizard[data-density=compact] .prodigy-workflow-head-actions {
        display: flex;
        flex-wrap: wrap;
      }
      .prodigy-project-wizard input, .prodigy-project-wizard textarea,
      .prodigy-project-wizard select, .prodigy-project-type-manager input {
        inline-size: 100%;
        box-sizing: border-box;
        min-block-size: var(--ke-control-height);
        padding: var(--ke-space-2) var(--ke-space-3);
        border: var(--ke-border-width) solid var(--ke-color-border);
        border-radius: var(--ke-radius-control);
        background: var(--ke-color-surface);
        color: var(--ke-color-text);
        font: 400 var(--ke-type-body)/var(--ke-leading-body) var(--ke-font-text);
      }
      @media (prefers-reduced-motion: reduce) {
        .prodigy-project-wizard *, .prodigy-project-type-manager *, .prodigy-project-card {
          transition: none !important;
          animation: none !important;
          transform: none !important;
          will-change: auto !important;
        }
      }
      @media (forced-colors: active) {
        .prodigy-project-wizard button:focus-visible, .prodigy-project-type-manager button:focus-visible {
          outline-color: Highlight;
        }
        .prodigy-project-wizard [aria-pressed="true"] {
          border-width: var(--ke-focus-ring-width);
        }
      }
    `;
  }

  var api = Object.freeze({ ensureProjectStyles: ensureProjectStyles, STYLE_ID: STYLE_ID });
  root.ProjectStyles = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
