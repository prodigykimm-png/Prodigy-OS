(function (root) {
  "use strict";

  const COMPACT_MAX = 767;
  const MEDIUM_MIN = 768;
  const MEDIUM_MAX = 1023;
  const WIDE_MIN = 1024;
  const TOUCH_TARGET = 44;
  const ACTION_BAR = 52;

  function resolveBreakpoint(width) {
    if (width === null || width === undefined || !Number.isFinite(width)) return "compact";
    if (width < MEDIUM_MIN) return "compact";
    if (width < WIDE_MIN) return "medium";
    return "wide";
  }

  function applyLayout(container, width) {
    const bp = resolveBreakpoint(width);
    container.classList.remove("whr-compact", "whr-medium", "whr-wide");
    container.classList.add("whr-" + bp);
    container.setAttribute("data-whr-width", String(width));
    container.setAttribute("data-whr-breakpoint", bp);
    return bp;
  }

  var RESPONSIVE_CSS = [
    ".whr-compact .workout-health-tablist{flex-wrap:nowrap;overflow-x:auto;-webkit-overflow-scrolling:touch}",
    ".whr-compact .workout-health-tab{min-height:" + TOUCH_TARGET + "px;padding:8px 12px;font-size:.85em;white-space:nowrap;flex-shrink:0}",
    ".whr-medium .workout-health-tab{min-height:" + TOUCH_TARGET + "px;padding:8px 16px;font-size:.9em;white-space:nowrap}",
    ".whr-wide .workout-health-tab{min-height:" + TOUCH_TARGET + "px;padding:8px 20px;font-size:.92em;white-space:nowrap}",
    ".whr-compact .workout-health-panel{padding:0 4px}",
    ".whr-medium .workout-health-panel{padding:0 8px}",
    ".whr-wide .workout-health-panel{padding:0 12px}",
    ".whr-compact .workout-nutrition-summary{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:6px}",
    ".whr-compact .workout-nutrition-chip{min-width:0;padding:8px 10px}",
    ".whr-medium .workout-nutrition-summary{display:flex;flex-wrap:wrap;gap:8px}",
    ".whr-wide .workout-nutrition-summary{display:flex;flex-wrap:wrap;gap:8px}",
    ".whr-compact .workout-nutrition-actions{flex-direction:column;gap:6px}",
    ".whr-compact .workout-nutrition-actions .workout-button{min-height:" + TOUCH_TARGET + "px;width:100%}",
    ".whr-medium .workout-nutrition-actions{flex-direction:row;flex-wrap:wrap;gap:8px}",
    ".whr-wide .workout-nutrition-actions{flex-direction:row;flex-wrap:wrap;gap:8px}",
    ".whr-compact .workout-nutrition-date-nav{gap:8px;justify-content:space-between}",
    ".whr-compact .workout-nav-btn{min-width:" + TOUCH_TARGET + "px;min-height:" + TOUCH_TARGET + "px}",
    ".whr-compact .workout-nutrition-list li{flex-direction:column;align-items:flex-start;gap:2px 6px}",
    ".whr-compact .workout-nutrition-food-name{font-size:.84em}",
    ".whr-compact .workout-nutrition-food-detail{font-size:.72em}",
    ".whr-compact .workout-running-stats{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:6px}",
    ".whr-compact .workout-running-stat{min-width:0;padding:8px 10px}",
    ".whr-medium .workout-running-stats{display:flex;flex-wrap:wrap;gap:8px}",
    ".whr-wide .workout-running-stats{display:flex;flex-wrap:wrap;gap:8px}",
    ".whr-compact .workout-running-actions{flex-direction:column;gap:6px}",
    ".whr-compact .workout-running-actions .workout-button{min-height:" + TOUCH_TARGET + "px;width:100%}",
    ".whr-medium .workout-running-actions{flex-direction:row;flex-wrap:wrap;gap:8px}",
    ".whr-wide .workout-running-actions{flex-direction:row;flex-wrap:wrap;gap:8px}",
    ".whr-compact .workout-running-split-table{font-size:.78em;width:100%}",
    ".whr-compact .workout-running-split-table th,.whr-compact .workout-running-split-table td{padding:4px 6px}",
    ".whr-compact .workout-running-history-row{flex-direction:column;gap:4px}",
    ".whr-compact .workout-running-history-info{flex-wrap:wrap}",
    ".whr-compact .workout-running-history-meta{flex-wrap:wrap}",
    ".whr-compact .workout-running-trend-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:6px}",
    ".whr-medium .workout-running-trend-grid{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:8px}",
    ".whr-wide .workout-running-trend-grid{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:8px}",
    ".whr-compact .workout-modal{max-width:96vw;padding:12px}",
    ".whr-compact .workout-modal-grid{grid-template-columns:1fr}",
    ".whr-compact .workout-modal-actions{flex-direction:column}",
    ".whr-compact .workout-modal-actions .workout-button{min-height:" + TOUCH_TARGET + "px;width:100%}",
    ".whr-compact .workout-import-table{font-size:.74em;width:100%}",
    ".whr-compact .workout-import-table th,.whr-compact .workout-import-table td{padding:3px 5px}",
    ".workout-ah-info{display:flex;flex-direction:column;gap:6px;padding:10px 12px;margin:8px 0;border-left:3px solid var(--text-accent);background:var(--background-secondary);border-radius:4px;font-size:.82em;line-height:1.45}",
    ".workout-ah-info-title{font-weight:700;font-size:.88em}",
    ".workout-ah-badges{display:flex;flex-wrap:wrap;gap:6px;margin-top:4px}",
    ".workout-ah-badge{display:inline-flex;align-items:center;gap:3px;padding:3px 8px;border-radius:12px;font-size:.74em;font-weight:650;background:var(--background-modifier-border);color:var(--text-muted)}",
    ".workout-ah-badge.is-warn{background:var(--text-warning);color:var(--background-primary)}",
    ".workout-ah-badge.is-info{background:var(--text-accent);color:var(--background-primary)}",
    ".workout-import-counts{display:flex;flex-wrap:wrap;gap:8px;margin:8px 0}",
    ".workout-import-count{display:flex;flex-direction:column;align-items:center;padding:6px 12px;background:var(--background-secondary);border-radius:6px;min-width:52px}",
    ".workout-import-count-value{font-size:1.2em;font-weight:800}",
    ".workout-import-count-label{font-size:.68em;color:var(--text-muted)}",
    ".whr-compact .workout-health-panels{overflow-x:hidden}",
    ".whr-compact .workout-running-split-table{display:block;overflow-x:auto;-webkit-overflow-scrolling:touch}",
    ".whr-compact .workout-running-history{overflow-x:hidden}",
  ].join("\n");

  function injectResponsiveCss(doc) {
    var d = doc || (typeof document !== "undefined" ? document : null);
    if (!d || d.getElementById("workout-health-responsive-css")) return;
    var style = d.createElement("style");
    style.id = "workout-health-responsive-css";
    style.textContent = RESPONSIVE_CSS;
    d.head.appendChild(style);
  }

  var api = Object.freeze({
    COMPACT_MAX: COMPACT_MAX,
    MEDIUM_MIN: MEDIUM_MIN,
    MEDIUM_MAX: MEDIUM_MAX,
    WIDE_MIN: WIDE_MIN,
    TOUCH_TARGET: TOUCH_TARGET,
    ACTION_BAR: ACTION_BAR,
    resolveBreakpoint: resolveBreakpoint,
    applyLayout: applyLayout,
    injectResponsiveCss: injectResponsiveCss,
    RESPONSIVE_CSS: RESPONSIVE_CSS,
  });

  root.WorkoutHealthResponsive = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
