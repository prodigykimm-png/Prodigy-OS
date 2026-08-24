/**
 * Region Styles — extracted from region-explorer-view.js & region-intelligence-popup-view.js
 */
(function (root) {
  "use strict";
  const T = root.ProdigyTokens || {};
  const RESPONSIVE_BREAKPOINTS = T.RESPONSIVE_BREAKPOINTS || T.BREAKPOINTS || {};
  const CONTROL_HEIGHTS = T.CONTROL_HEIGHTS || {};

  const REGION_STYLE_ID = "prodigy-region-styles";

  function ensureRegionStyles() {
    if (typeof document === "undefined") return;
    const TYPE_SCALE = T.TYPE_SCALE || {};
    const SPACE_SCALE = T.SPACE_SCALE || {};
    const RADII = T.RADII || {};
    const SEMANTIC_COLORS = T.SEMANTIC_COLORS || {};

    const compactMax = Number(RESPONSIVE_BREAKPOINTS.compactMax || (RESPONSIVE_BREAKPOINTS.medium ? RESPONSIVE_BREAKPOINTS.medium - 1 : 767));
    const touchTarget = Number(CONTROL_HEIGHTS.touchTarget || 44);

    let styleEl = document.getElementById(REGION_STYLE_ID);
    if (!styleEl) {
      styleEl = document.createElement("style");
      styleEl.id = REGION_STYLE_ID;
      document.head.appendChild(styleEl);
    }

    styleEl.textContent = `
.region-explorer-shell {
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
  --ke-color-error: ${SEMANTIC_COLORS.error || "var(--text-error)"};
  --ke-touch-target: ${CONTROL_HEIGHTS.touchTarget || 44}px;
}
.region-explorer-shell{container-type:inline-size;container-name:region-explorer;display:grid;gap:var(--ke-space-3);min-inline-size:0;color:var(--ke-color-text);font-size:var(--ke-type-body);line-height:var(--ke-leading-body)}
.region-explorer-head,.region-explorer-controls,.region-explorer-summary,.region-explorer-selection,.region-explorer-group-head,.region-explorer-row-meta{display:flex;gap:var(--ke-space-2);align-items:center;flex-wrap:wrap}
.region-explorer-head{justify-content:space-between}.region-explorer-head h2,.region-explorer-group h3{font-size:var(--ke-type-title);margin:0}

/* Glassmorphism Controls Toolbar */
.region-explorer-controls{
  padding:var(--ke-space-3);
  border:1px solid var(--ke-color-border);
  border-radius:var(--ke-radius-panel);
  background: var(--ke-color-surface-secondary);
  backdrop-filter: blur(16px) saturate(180%);
  -webkit-backdrop-filter: blur(16px) saturate(180%);
}
.region-explorer-control{display:grid;gap:var(--ke-space-1);min-inline-size:min(12rem,100%)}.region-explorer-control label,.region-explorer-meta{font-size:var(--ke-type-label);color:var(--ke-color-muted)}.region-explorer-control input,.region-explorer-control select,.region-explorer-button{min-block-size:${touchTarget}px;border:1px solid var(--ke-color-border);border-radius:var(--ke-radius-control);background:var(--ke-color-surface);color:var(--ke-color-text);padding-inline:var(--ke-space-3)}

/* GPU Accelerated Interactive Physics */
.region-explorer-button{
  cursor:pointer;min-inline-size:0;word-break:keep-all;overflow-wrap:anywhere;
  will-change: transform;
  transition: transform 0.15s cubic-bezier(0.16, 1, 0.3, 1), background-color 0.15s ease, border-color 0.15s ease;
}
.region-explorer-add-action{min-inline-size:min(12rem,100%)}
.region-explorer-button[data-selected="true"]{border-color:var(--ke-color-accent);color:var(--ke-color-accent);background:var(--ke-color-hover)}
.region-explorer-button:focus-visible,.region-explorer-control input:focus-visible,.region-explorer-control select:focus-visible,.region-source-command:focus-visible{outline:2px solid var(--ke-color-accent);outline-offset:2px}
.region-explorer-button:active{transform:scale(0.95)}

.region-source-command{flex:1 0 100%;inline-size:100%;min-inline-size:0;box-sizing:border-box;border:1px solid var(--ke-color-border);border-radius:var(--ke-radius-control);background:var(--ke-color-surface);color:var(--ke-color-text);padding:var(--ke-space-3);font-family:var(--font-monospace);font-size:var(--ke-type-label);line-height:var(--ke-leading-body);white-space:pre-wrap;overflow-wrap:anywhere;resize:vertical}.region-source-command-status{flex:1 0 100%;margin:0;color:var(--ke-color-muted);font-size:var(--ke-type-label);overflow-wrap:anywhere}.region-source-command-status.is-error{color:var(--ke-color-error)}
.region-source-evidence{color:var(--ke-color-accent);overflow-wrap:anywhere}
.region-explorer-scroll{min-block-size:0;min-inline-size:0;display:grid;align-content:start;gap:var(--ke-space-4);padding-inline-end:var(--ke-space-1)}.region-explorer-summary,.region-explorer-selection,.region-explorer-notice{padding:var(--ke-space-3);border-inline-start:2px solid var(--ke-color-border);background:var(--ke-color-surface-secondary)}.region-explorer-notice{border-color:var(--ke-color-error);color:var(--ke-color-error)}
.region-explorer-list{display:grid;gap:var(--ke-space-2)}

/* Region Cards GPU Animation */
.region-explorer-row{
  display:grid;grid-template-columns:minmax(0,1fr) auto;gap:var(--ke-space-3);padding:var(--ke-space-3);
  border:1px solid var(--ke-color-border);border-radius:var(--ke-radius-panel);
  background:var(--ke-color-surface);
  will-change: transform;
  transition: transform 0.2s cubic-bezier(0.16, 1, 0.3, 1), box-shadow 0.2s ease;
}
.region-explorer-row:hover {
  box-shadow:none;
}
.region-explorer-row-title,.region-explorer-cell-title{overflow-wrap:anywhere}.region-explorer-row-title{font-weight:600}.region-explorer-row-actions{display:flex;align-items:center;justify-content:flex-end;gap:var(--ke-space-2);flex-wrap:wrap}.region-explorer-diagnostics{margin:var(--ke-space-2) 0 0;color:var(--ke-color-error);overflow-wrap:anywhere}
.region-explorer-comparison{display:grid;gap:var(--ke-space-4)}.region-explorer-comparison-regions{display:grid;gap:var(--ke-space-2);padding:var(--ke-space-3);border:1px solid var(--ke-color-border);border-radius:var(--ke-radius-panel);background:var(--ke-color-surface-secondary)}.region-explorer-comparison-region{display:grid;gap:var(--ke-space-1);min-inline-size:0}.region-explorer-comparison-region strong,.region-explorer-comparison-region span{overflow-wrap:anywhere}.region-explorer-group{display:grid;gap:var(--ke-space-2);padding-block-start:var(--ke-space-3);border-block-start:1px solid var(--ke-color-border)}.region-explorer-metric-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(15rem,100%),1fr));gap:var(--ke-space-2)}.region-explorer-metric-card{display:grid;gap:var(--ke-space-2);padding:var(--ke-space-3);border:1px solid var(--ke-color-border);border-radius:var(--ke-radius-control);background:var(--ke-color-surface)}.region-explorer-values{display:grid;gap:var(--ke-space-2);min-inline-size:0}.region-explorer-comparison[data-comparison-layout="side-by-side"] .region-explorer-comparison-regions[data-columns="2"],.region-explorer-comparison[data-comparison-layout="side-by-side"] .region-explorer-values[data-columns="2"]{grid-template-columns:repeat(2,minmax(0,1fr))}.region-explorer-comparison[data-comparison-layout="side-by-side"] .region-explorer-comparison-regions[data-columns="3"],.region-explorer-comparison[data-comparison-layout="side-by-side"] .region-explorer-values[data-columns="3"]{grid-template-columns:repeat(3,minmax(0,1fr))}.region-explorer-comparison[data-comparison-layout="horizontal"]{overflow-x:auto;overscroll-behavior-inline:contain;padding-block-end:var(--ke-space-2)}.region-explorer-comparison[data-comparison-layout="horizontal"] .region-explorer-comparison-regions[data-columns="2"],.region-explorer-comparison[data-comparison-layout="horizontal"] .region-explorer-values[data-columns="2"]{grid-template-columns:repeat(2,minmax(13rem,1fr));min-inline-size:27rem}.region-explorer-comparison[data-comparison-layout="horizontal"] .region-explorer-comparison-regions[data-columns="3"],.region-explorer-comparison[data-comparison-layout="horizontal"] .region-explorer-values[data-columns="3"]{grid-template-columns:repeat(3,minmax(13rem,1fr));min-inline-size:41rem}.region-explorer-comparison[data-comparison-layout="horizontal"] .region-explorer-metric-grid{grid-template-columns:minmax(18rem,1fr);min-inline-size:18rem}.region-explorer-value{display:grid;gap:var(--ke-space-1);min-inline-size:0}.region-explorer-value strong{overflow-wrap:anywhere}.region-explorer-sparkline{inline-size:6rem;block-size:2rem;color:var(--ke-color-accent)}.region-explorer-empty{color:var(--ke-color-muted)}
.region-explorer-controls[data-control-layout="stacked"]{align-items:stretch}.region-explorer-controls[data-control-layout="stacked"] .region-explorer-control,.region-explorer-controls[data-control-layout="stacked"] .region-explorer-add-action{min-inline-size:100%;inline-size:100%}
@container region-explorer (max-width:${compactMax}px){.region-explorer-row{grid-template-columns:minmax(0,1fr)}.region-explorer-sparkline{inline-size:100%;max-inline-size:12rem}}

.region-intelligence-popup { max-width: 100vw; overflow-x: hidden; color: var(--text-normal); }
.region-popup-header { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.region-popup-title { margin: 0; font-size: 20px; letter-spacing: 0; }
.region-popup-tabs { display: flex; overflow-x: auto; -webkit-overflow-scrolling: touch; gap: 4px; padding: 4px 0; }
.region-popup-tab {
  flex-shrink: 0; min-height: ${touchTarget}px; min-width: ${touchTarget}px; padding: 8px 12px; border: none; background: var(--background-secondary); border-radius: 6px; cursor: pointer; font-size: 14px;
  will-change: transform; transition: transform 0.15s cubic-bezier(0.16, 1, 0.3, 1);
}
.region-popup-tab:active { transform: scale(0.95); }
.region-popup-tab.is-active { background: var(--ke-color-interactive, var(--interactive-accent)); color: var(--text-on-accent); }
.region-popup-close { min-height: ${touchTarget}px; min-width: ${touchTarget}px; cursor: pointer; }
.region-trust-badges { display: flex; flex-wrap: wrap; gap: 6px; padding: 8px 0; }
.region-trust-badge { padding: 4px 8px; border-radius: 4px; font-size: 12px; }
.region-collection-health { display: grid; grid-template-columns: minmax(140px, 1fr) minmax(160px, 1fr) minmax(180px, 1.2fr); gap: 8px 16px; padding: 10px 0; border-top: 1px solid var(--background-modifier-border); border-bottom: 1px solid var(--background-modifier-border); font-size: 12px; color: var(--text-muted); }
.region-collection-health > div { min-width: 0; overflow-wrap: anywhere; }
.region-collection-health strong { margin-left: 6px; color: var(--text-normal); }
.region-collection-health.is-attention > div:last-child { color: var(--text-warning); }
.region-health-label { color: var(--text-muted); }
.region-popup-panels { min-height: 220px; }
.region-popup-panel { padding: 12px 0 4px; }
.region-context-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
.region-context-question { min-width: 0; padding: 10px; border-inline-start: 2px solid var(--background-modifier-border); background: var(--background-secondary); }
.region-context-question h3, .region-context-checks h3 { margin: 0 0 8px; font-size: 14px; overflow-wrap: anywhere; }
.region-context-facts { display: grid; gap: 8px; margin: 0; padding: 0; list-style: none; }
.region-context-facts li { min-width: 0; overflow-wrap: anywhere; }
.region-context-facts span { display: block; color: var(--text-muted); font-size: 12px; }
.region-context-checks { margin-top: 12px; padding: 10px; background: var(--background-secondary); border-radius: 6px; }
.region-context-checks ul { margin: 0; padding-inline-start: 20px; }
.region-popup-sections { display: grid; gap: 8px; }
.region-popup-section { border-bottom: 1px solid var(--background-modifier-border); }
.region-popup-section summary { min-height: ${touchTarget}px; display: flex; align-items: center; cursor: pointer; font-weight: 600; overflow-wrap: anywhere; }
.region-popup-section summary:focus-visible { outline: 2px solid var(--ke-color-accent, var(--text-accent)); outline-offset: 2px; }
.region-popup-section-body { padding: 0 0 12px; min-width: 0; }
.region-popup-table { width: 100%; border-collapse: collapse; }
.region-popup-table th, .region-popup-table td { padding: 6px 8px; border-bottom: 1px solid var(--background-modifier-border); text-align: left; vertical-align: top; overflow-wrap: anywhere; }
.region-popup-table th { font-size: 12px; color: var(--text-muted); font-weight: 600; }
.region-popup-table caption { padding: 0 8px 8px; text-align: left; color: var(--text-muted); font-size: 12px; }
.region-metric-table th { width: 42%; }
.region-popup-subsection { margin-top: 18px; }
.region-popup-subsection h3, .region-knowledge-content h3 { margin: 0 0 8px; font-size: 15px; }
.region-supply-table { min-width: 520px; }
.region-comparable-list { display: grid; gap: 12px; }
.region-comparable-card { padding: 10px; border: 1px solid var(--background-modifier-border); border-radius: 6px; }
.region-comparable-card h4 { margin: 0 0 4px; font-size: 14px; }
.region-knowledge-content { display: grid; gap: 16px; }
.region-knowledge-content p { margin: 0; line-height: 1.5; overflow-wrap: anywhere; }
.region-knowledge-content ul { margin: 0; padding-inline-start: 20px; }
.region-popup-empty { padding: 16px; text-align: center; color: var(--text-muted); }
.region-auction-snapshot-meta, .region-auction-snapshot-warning { margin: 8px 0; color: var(--text-muted); font-size: 12px; }
.region-auction-snapshot-warning { color: var(--text-warning); }
.region-auction-table-wrap { width: 100%; overflow-x: auto; }
.region-auction-table { min-width: 640px; }
.region-auction-open { min-height: ${touchTarget}px; padding: 4px 0; border: 0; background: transparent; color: var(--ke-color-accent, var(--text-accent)); cursor: pointer; text-decoration: underline; text-underline-offset: 2px; font: inherit; }
.region-popup-footer { padding-top: 10px; font-size: 12px; color: var(--text-muted); }
.region-decision-outcome { display: grid; gap: 18px; }
.region-decision-outcome section { min-width: 0; }
.region-section-head { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; padding-bottom: 6px; border-bottom: 1px solid var(--background-modifier-border); }
.region-section-head h3 { margin: 0; font-size: 15px; letter-spacing: 0; }
.region-section-head span { color: var(--text-muted); font-size: 12px; text-align: right; }
.region-decision-row { display: grid; grid-template-columns: minmax(82px, 0.25fr) minmax(0, 1fr); gap: 12px; padding: 8px 0; border-bottom: 1px solid var(--background-modifier-border-hover); }
.region-decision-row span { color: var(--text-muted); font-size: 12px; }
.region-decision-row strong { font-weight: 500; overflow-wrap: anywhere; }
.region-decision-money { display: flex; flex-wrap: wrap; gap: 8px 18px; padding-top: 8px; font-size: 12px; color: var(--text-muted); }
.region-outcome-summary, .region-outcome-note { margin: 8px 0; color: var(--text-muted); font-size: 12px; }
.region-outcome-note { color: var(--text-warning); }
.region-outcome-table-wrap { width: 100%; overflow-x: auto; }
.region-outcome-table { min-width: 560px; }
@media (max-width: ${compactMax}px) {
  .region-intelligence-popup { width: 100vw; border-radius: 0; }
  .region-popup-title { font-size: 16px; }
  .region-context-grid { grid-template-columns: 1fr; }
  .region-collection-health { grid-template-columns: 1fr; gap: 4px; }
  .region-section-head { align-items: flex-start; flex-direction: column; gap: 4px; }
  .region-section-head span { text-align: left; }
  .region-decision-row { grid-template-columns: 1fr; gap: 3px; }
}

@media (prefers-reduced-motion: reduce) {
  .region-explorer-button, .region-explorer-row, .region-popup-tab {
    transition: none !important;
    animation: none !important;
    transform: none !important;
    will-change: auto !important;
  }
}

@media (forced-colors: active) {
  .region-explorer-button[data-selected="true"] {
    outline: 2px solid CanvasText;
  }
}
`;
  }

  root.RegionStyles = { ensureRegionStyles, STYLE_ID: REGION_STYLE_ID };
})(typeof window !== "undefined" ? window : globalThis);
