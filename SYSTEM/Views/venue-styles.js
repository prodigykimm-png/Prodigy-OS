(function (root) {
  "use strict";
  const T = root.ProdigyTokens || {};
  const RESPONSIVE_BREAKPOINTS = T.RESPONSIVE_BREAKPOINTS || {};
  const CONTROL_HEIGHTS = T.CONTROL_HEIGHTS || {};

  const STYLE_ID = "prodigy-venue-styles";

  function ensureVenueStyles() {
    if (typeof document === "undefined") return;
    const TYPE_SCALE = T.TYPE_SCALE || {};
    const SPACE_SCALE = T.SPACE_SCALE || {};
    const RADII = T.RADII || {};
    const SEMANTIC_COLORS = T.SEMANTIC_COLORS || {};

    const singlePaneMax = Number(RESPONSIVE_BREAKPOINTS.utilityTwoColumnMax) || 768;

    let styleEl = document.getElementById(STYLE_ID);
    if (!styleEl) {
      styleEl = document.createElement("style");
      styleEl.id = STYLE_ID;
      styleEl.setAttribute("data-venue-styles", "");
      document.head.appendChild(styleEl);
    }
    if (root.ProdigyUI) root.ProdigyUI.ensureStyles();

    styleEl.textContent = `
.ppv-venue-workspace {
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
  --ke-color-hover: ${SEMANTIC_COLORS.hover || "var(--background-modifier-hover)"};
  --ke-touch-target: ${CONTROL_HEIGHTS.touchTarget || 44}px;
}
.ppv-venue-workspace, .prodigy-venue-preview, .prodigy-venue-modal {
  display: grid;
  gap: var(--ke-space-3);
  min-inline-size: 0;
  font-family: var(--ke-font-text);
  font-size: var(--ke-type-body);
  line-height: var(--ke-leading-body);
  word-break: keep-all;
  overflow-wrap: anywhere;
}
.ppv-venue-workspace *, .prodigy-venue-preview *, .prodigy-venue-modal * {
  box-sizing: border-box;
  min-inline-size: 0;
}
.ppv-venue-header, .ppv-venue-toolbar-row, .ppv-venue-card-top, .ppv-venue-detail-head, .ppv-venue-detail-actions, .ppv-venue-actions {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: var(--ke-space-2);
}
.ppv-venue-header h1, .ppv-venue-detail-head h2 {
  margin: 0;
  font-family: var(--ke-font-display);
  font-size: var(--ke-type-title);
  line-height: var(--ke-leading-control);
}
.ppv-venue-header p, .ppv-venue-meta, .ppv-venue-card-meta, .ppv-venue-card-sub, .ppv-venue-empty, .ppv-venue-count, .ppv-venue-section-label {
  margin: 0;
  color: var(--ke-color-muted);
  font-size: var(--ke-type-label);
  line-height: var(--ke-leading-body);
  overflow-wrap: anywhere;
}

/* Glassmorphism Toolbar */
.ppv-venue-toolbar {
  padding: var(--ke-space-3);
  border: var(--ke-border-width) solid var(--ke-color-border);
  border-radius: var(--ke-radius-panel, 12px);
  background: var(--ke-color-surface-secondary);
  backdrop-filter: blur(16px) saturate(180%);
  -webkit-backdrop-filter: blur(16px) saturate(180%);
}
.ppv-venue-detail-pane {
  padding: var(--ke-space-3);
  border: var(--ke-border-width) solid var(--ke-color-border);
  border-radius: var(--ke-radius-panel, 12px);
  background: var(--ke-color-surface-secondary);
}
.ppv-venue-toolbar, .ppv-venue-list-pane {
  display: grid;
  gap: var(--ke-space-2);
}
.ppv-venue-search.ppv-venue-search, .ppv-venue-select.ppv-venue-select, .prodigy-venue-preview input, .prodigy-venue-preview select, .prodigy-venue-preview textarea, .prodigy-venue-modal input, .prodigy-venue-modal select, .prodigy-venue-modal textarea {
  inline-size: 100%;
  min-block-size: var(--ke-touch-target);
  padding: var(--ke-space-2) var(--ke-space-3);
  border: var(--ke-border-width) solid var(--ke-color-border);
  border-radius: var(--ke-radius-control);
  box-shadow:none;
  background: var(--ke-color-surface);
  color: var(--ke-color-text);
  font: inherit;
  word-break: keep-all;
  overflow-wrap: anywhere;
}
.ppv-venue-search { flex: 1; }
.ppv-venue-select { flex: 1 1 10rem; inline-size: auto; max-inline-size: 100%; }
.ppv-venue-toolbar-label { min-inline-size: var(--ke-space-7); color: var(--ke-color-muted); font-size: var(--ke-type-label); }
.ppv-venue-master-detail {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: var(--ke-space-4);
  min-block-size: 0;
}

/* Venue Cards GPU Physics */
.ppv-venue-card {
  min-block-size: var(--ke-touch-target); cursor: pointer;
  padding: var(--ke-space-3);
  border: var(--ke-border-width) solid var(--ke-color-border);
  border-radius: var(--ke-radius-panel, 12px);
  background: var(--ke-color-surface-secondary);
  will-change: transform;
  transition: transform 0.2s cubic-bezier(0.16, 1, 0.3, 1), box-shadow 0.2s ease, border-color 0.15s ease;
}
.ppv-venue-card:hover {
  transform: translateY(-1px);
  box-shadow:none;
  background: var(--ke-color-hover);
}
.ppv-venue-card[aria-current="true"], .ppv-venue-card[data-state="selected"] { border-color: var(--ke-color-interactive); }
.ppv-venue-chip {
  display: inline-flex;
  align-items: center;
  min-block-size: var(--ke-touch-target);
  padding-inline: var(--ke-space-3);
  border: var(--ke-border-width) solid var(--ke-color-border);
  border-radius: var(--ke-radius-pill);
  color: var(--ke-color-muted);
}
.ppv-venue-detail-back { display: inline-flex; }
.ppv-venue-detail-section, .ppv-venue-section { padding-block: var(--ke-space-3); border-block-end: var(--ke-border-width) solid var(--ke-color-border); }
.ppv-venue-detail-body, .ppv-venue-section-body { white-space: pre-wrap; overflow-wrap: anywhere; word-break: keep-all; }
.ppv-venue-detail-link {
  display: block;
  inline-size: 100%;
  min-block-size: var(--ke-touch-target);
  padding: var(--ke-space-2);
  border: 0;
  background: transparent;
  color: var(--ke-color-interactive);
  cursor: pointer;
  text-align: start;
  font: inherit;
  word-break: keep-all;
  overflow-wrap: anywhere;
}
.ppv-venue-detail-actions, .ppv-venue-actions { padding-block-start: var(--ke-space-3); border-block-start: var(--ke-border-width) solid var(--ke-color-border); }
.prodigy-venue-preview { max-block-size: 82vh; overflow: auto; overscroll-behavior: contain; }
.prodigy-venue-preview textarea { resize: vertical; white-space: pre-wrap; }
.ppv-venue-card:active, .ppv-venue-detail-link:active, .ppv-venue-detail-actions button:active, .ppv-venue-actions button:active { transform: scale(0.95); }
.ppv-venue-card:disabled, .ppv-venue-detail-link:disabled, .ppv-venue-detail-actions button:disabled, .ppv-venue-actions button:disabled { opacity: var(--ke-opacity-disabled); cursor: not-allowed; transform: none; }
.ppv-venue-search:focus-visible, .ppv-venue-select:focus-visible, .ppv-venue-card:focus-visible, .ppv-venue-detail-link:focus-visible, .ppv-venue-detail-actions button:focus-visible, .ppv-venue-detail-back:focus-visible, .prodigy-venue-preview input:focus-visible, .prodigy-venue-preview textarea:focus-visible { outline: var(--ke-focus-ring-width) solid var(--ke-color-accent); outline-offset: var(--ke-space-1); }
@media (max-width: ${singlePaneMax}px) {
  .ppv-venue-toolbar-row { display: grid; grid-template-columns: minmax(0, 1fr); }
  .ppv-venue-master-detail { display: block; }
}
@media (forced-colors: active) {
  .ppv-venue-card[aria-current="true"], .ppv-venue-card[data-state="selected"] { forced-color-adjust: auto; }
  .ppv-venue-card:focus-visible { outline-color: Highlight; }
}
@media (prefers-reduced-motion: reduce) {
  .ppv-venue-workspace *, .prodigy-venue-preview *, .prodigy-venue-modal *, .ppv-venue-card { animation: none !important; transition: none !important; scroll-behavior: auto !important; transform: none !important; will-change: auto !important; }
  .ppv-venue-card:active, .ppv-venue-detail-link:active, .ppv-venue-detail-actions button:active { transform: none; }
}
    `;
  }

  root.VenueStyles = { ensureVenueStyles, STYLE_ID };
})(typeof window !== "undefined" ? window : globalThis);
