(function (root) {
  "use strict";

  function tokens() {
    if (root.ProdigyTokens) return root.ProdigyTokens;
    if (typeof require === "function") return require("./design-tokens.js");
    throw new Error("Workout responsive design tokens are required");
  }

  const design = tokens();
  const responsive = design.RESPONSIVE_BREAKPOINTS;
  const controls = design.CONTROL_HEIGHTS;
  const COMPACT_MAX = responsive.compactMax;
  const MEDIUM_MIN = COMPACT_MAX + 1;
  const MEDIUM_MAX = responsive.utilityTwoColumnMax;
  const WIDE_MIN = MEDIUM_MAX + 1;
  const TOUCH_TARGET = controls.touchTarget;
  const ACTION_BAR = controls.actionBar;

  function resolveBreakpoint(width) {
    if (!Number.isFinite(width) || width < MEDIUM_MIN) return "compact";
    if (width < WIDE_MIN) return "medium";
    return "wide";
  }

  function applyLayout(container, width) {
    const breakpoint = resolveBreakpoint(width);
    container.classList.remove("whr-compact", "whr-medium", "whr-wide");
    container.classList.add(`whr-${breakpoint}`);
    container.setAttribute("data-whr-width", String(width));
    container.setAttribute("data-whr-breakpoint", breakpoint);
    return breakpoint;
  }

  const RESPONSIVE_CSS = [
    ".workout-health-panels{min-inline-size:0;max-inline-size:100%;overflow:visible;word-break:keep-all;overflow-wrap:anywhere}",
    ".workout-health-tablist{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,7rem),1fr));min-inline-size:0}",
    ".workout-health-tab{min-inline-size:var(--ke-touch-target);min-block-size:var(--ke-touch-target);max-inline-size:100%;white-space:normal;word-break:keep-all;overflow-wrap:anywhere;box-shadow:none!important}",
    ".whr-compact .workout-health-tablist{grid-template-columns:repeat(auto-fit,minmax(min(100%,5rem),1fr))}",
    ".whr-compact .workout-health-tab{inline-size:100%}",
    ".prodigy-app-shell[data-workspace-id=\"workout\"]>.prodigy-workspace-bar{padding-inline:4px}",
    ".whr-compact .workout-start-path>.workout-button{padding-inline:var(--ke-space-1,2px)!important}",
    ".whr-compact .workout-nutrition-actions,.whr-compact .workout-running-actions,.whr-compact .workout-modal-actions{align-items:stretch;flex-direction:column}",
    ".whr-compact .workout-nutrition-actions .workout-button,.whr-compact .workout-running-actions .workout-button,.whr-compact .workout-modal-actions .workout-button{inline-size:100%;min-block-size:var(--ke-touch-target)}",
    ".whr-compact .workout-running-history-row,.whr-compact .workout-nutrition-list li{align-items:flex-start;flex-direction:column}",
    ".whr-compact .workout-running-split-table{inline-size:100%;table-layout:fixed}",
    ".whr-medium .workout-running-trend-grid,.whr-wide .workout-running-trend-grid{grid-template-columns:repeat(auto-fit,minmax(min(100%,7rem),1fr))}",
    ".workout-running-split-table th,.workout-running-split-table td{min-inline-size:0;white-space:normal;word-break:keep-all;overflow-wrap:anywhere}",
    ".workout-ah-info{display:grid;gap:var(--ke-space-2);padding:var(--ke-space-3);margin-block:var(--ke-space-2);border-inline-start:var(--ke-focus-ring-width) solid var(--ke-color-interactive);background:var(--ke-color-surface-secondary);border-radius:var(--ke-radius-configurator);font-size:var(--ke-type-label);line-height:var(--ke-leading-body)}",
    ".workout-ah-badges,.workout-import-counts{display:flex;flex-wrap:wrap;gap:var(--ke-space-2)}",
    ".workout-ah-badge{display:inline-flex;align-items:center;min-block-size:var(--ke-touch-target);padding-inline:var(--ke-space-3);border:var(--ke-border-width) solid var(--ke-color-border);border-radius:var(--ke-radius-pill);color:var(--ke-color-muted)}",
    ".workout-ah-badge.is-info{border-color:var(--ke-color-interactive);color:var(--ke-color-interactive)}",
    ".workout-ah-badge.is-warn{border-color:var(--ke-color-warning);color:var(--ke-color-warning)}",
    ".workout-import-count{display:grid;justify-items:center;padding:var(--ke-space-3);background:var(--ke-color-surface-secondary);border-radius:var(--ke-radius-configurator)}",
    ".workout-health-tab:active,.workout-ah-badge:active{transform:scale(0.95)}",
    ".workout-health-tab:disabled{opacity:var(--ke-opacity-disabled);cursor:not-allowed;transform:none}",
    ".workout-health-tab:focus-visible{outline:var(--ke-focus-ring-width) solid var(--ke-color-accent);outline-offset:var(--ke-space-1)}",
    "@media(forced-colors:active){.workout-health-tab:focus-visible{outline-color:Highlight}.workout-ah-badge{forced-color-adjust:auto}}",
    "@media(prefers-reduced-motion:reduce){.workout-health-panels *{animation:none!important;transition:none!important;scroll-behavior:auto!important}.workout-health-tab:active,.workout-ah-badge:active{transform:none}}",
  ].join("\n");

  function injectResponsiveCss(doc) {
    const target = doc || (typeof document !== "undefined" ? document : null);
    if (!target || target.getElementById("workout-health-responsive-css")) return;
    const style = target.createElement("style");
    style.id = "workout-health-responsive-css";
    style.textContent = RESPONSIVE_CSS;
    target.head.appendChild(style);
  }

  const api = Object.freeze({
    COMPACT_MAX, MEDIUM_MIN, MEDIUM_MAX, WIDE_MIN, TOUCH_TARGET, ACTION_BAR,
    resolveBreakpoint, applyLayout, injectResponsiveCss, RESPONSIVE_CSS,
  });
  root.WorkoutHealthResponsive = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
