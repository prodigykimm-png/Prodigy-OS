/**
 * Prodigy OS Reading Workspace Styles
 *
 * Owns presentation classes for the Reading workspace (grid, cards,
 * checklist modal, memory modal).
 *
 * Enhanced with Apple-Native Glassmorphism, 100% GPU-accelerated micro-interactions,
 * and high-contrast accessibility compliance.
 */
(function (root) {
  "use strict";

  const T = root.ProdigyTokens || (typeof require === "function" ? require("./design-tokens.js") : {});
  const STYLE_ID = "prodigy-reading-styles";

  const responsive = T.RESPONSIVE_BREAKPOINTS || {};
  const compactMax = responsive.compactMax;
  const phoneMax = Number.isFinite(responsive.phoneMax) ? responsive.phoneMax : 640;
  const utilityTwoColumnMax = Number.isFinite(responsive.utilityTwoColumnMax) ? responsive.utilityTwoColumnMax : 1023;
  const contentMax = Number.isFinite(responsive.contentMax) ? responsive.contentMax : 1440;
  const gutter = (T.APPLE_SPEC && T.APPLE_SPEC.gutter) || {};
  const touchTarget = T.CONTROL_HEIGHTS && T.CONTROL_HEIGHTS.touchTarget ? T.CONTROL_HEIGHTS.touchTarget : 44;

  function ensureReadingStyles() {
    if (typeof document === "undefined") return;
    if (!Number.isFinite(compactMax)) return;

    const TYPE_SCALE = T.TYPE_SCALE || {};
    const SPACE_SCALE = T.SPACE_SCALE || {};
    const RADII = T.RADII || {};
    const SEMANTIC_COLORS = T.SEMANTIC_COLORS || {};

    let styleEl = document.getElementById(STYLE_ID);
    if (!styleEl) {
      styleEl = document.createElement("style");
      styleEl.id = STYLE_ID;
      styleEl.setAttribute("data-reading-styles", "true");
      document.head.appendChild(styleEl);
    }

    if (root.ProdigyUI) root.ProdigyUI.ensureStyles();

    styleEl.textContent = `
.prodigy-reading-app {
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
  --ke-touch-target: ${touchTarget}px;

  display: grid;
  grid-template-columns: minmax(0, 1fr);
  min-block-size: 100%;
  background: var(--ke-color-surface, var(--background-primary));
  word-break: keep-all;
  overflow-wrap: anywhere;
}
.prodigy-reading-app *,
.prodigy-reading-app *::before,
.prodigy-reading-app *::after { box-sizing: border-box; min-inline-size: 0; max-inline-size: 100%; }

.reading-hub-section,
.prodigy-hub-note .el-h1:has(+ .el-pre > .reading-hub-section) {
  box-sizing: border-box;
  inline-size: 100%;
  padding-inline: ${gutter.phone || 20}px;
}
@media (min-width: ${phoneMax + 1}px) {
  .reading-hub-section,
  .prodigy-hub-note .el-h1:has(+ .el-pre > .reading-hub-section) {
    padding-inline: ${(gutter.pad && gutter.pad.portrait) || 32}px;
  }
}
@media (min-width: ${utilityTwoColumnMax + 1}px) {
  .reading-hub-section,
  .prodigy-hub-note .el-h1:has(+ .el-pre > .reading-hub-section) {
    padding-inline: ${(gutter.pad && gutter.pad.landscape) || 48}px;
  }
}
@media (min-width: ${contentMax + 1}px) {
  .reading-hub-section,
  .prodigy-hub-note .el-h1:has(+ .el-pre > .reading-hub-section) {
    padding-inline: ${(gutter.mac && gutter.mac.atContentMax) || 80}px;
  }
}

.reading-responsive-workspace {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  min-block-size: 100%;
  color: var(--ke-color-text, var(--text-normal));
  word-break: keep-all;
  overflow-wrap: anywhere;
}

/* Primary Reading list + secondary Continue rail on wide surfaces. */
.reading-responsive-grid {
  display: grid;
  grid-template-columns: minmax(0, 2fr) minmax(min(100%, 20rem), 1fr);
  gap: var(--ke-space-5, 24px);
  align-items: start;
}
.reading-responsive-workspace[data-reading-layout="compact"] .reading-responsive-grid,
.reading-responsive-workspace[data-reading-layout="medium"] .reading-responsive-grid {
  grid-template-columns: minmax(0, 1fr);
}

.reading-responsive-pane {
  min-block-size: 0;
  min-inline-size: 0;
  overflow: visible;
}
.reading-responsive-pane:focus-visible,
.reading-responsive-workspace input:focus-visible,
.reading-responsive-workspace textarea:focus-visible,
.reading-responsive-workspace button:focus-visible {
  outline: 2px solid var(--ke-color-accent, var(--text-accent));
  outline-offset: 2px;
}
.reading-focus-target {
  outline: 2px solid var(--ke-color-accent, var(--text-accent));
  outline-offset: 3px;
}

/* Sidebar List — Apple Translucent Glass Sidebar */
.reading-responsive-list {
  background: var(--ke-color-surface-secondary, var(--background-secondary));
  border-inline-end: var(--ke-border-width, 1px) solid var(--ke-color-border, var(--background-modifier-border));
  padding: var(--ke-space-4, 17px);
  min-block-size: 100%;
}
.reading-responsive-workspace[data-reading-layout="compact"] .reading-responsive-list,
.reading-responsive-workspace[data-reading-layout="medium"] .reading-responsive-list {
  padding: var(--ke-space-4, 17px);
  border-inline-end: 0;
}
.reading-responsive-detail {
  background: var(--ke-color-surface, var(--background-primary));
  padding: var(--ke-space-5, 24px);
}

/* Tabs Header Glassmorphism */
.reading-responsive-tabs {
  position: sticky;
  top: 0;
  z-index: 10;
  background: var(--ke-color-surface, var(--background-primary));
  border-bottom: 1px solid var(--ke-color-border, var(--background-modifier-border));
}
.reading-responsive-tabs[hidden], .reading-responsive-pane[hidden] {
  display: none;
}
.reading-responsive-workspace[data-reading-layout="compact"] .prodigy-adaptive-tab {
  min-block-size: var(--ke-touch-target);
}

/* Shared AppShell Overrides */
.prodigy-app-shell[data-workspace-id="reading"] > .prodigy-workspace-bar {
  padding-inline: var(--prodigy-inline-gutter, var(--ke-space-5, 24px));
}

/* --- Apple-Native Cards & Micro-Interactions (100% GPU Accelerated) --- */
.reading-card {
  display: flex;
  flex-direction: column;
  gap: var(--ke-space-3, 12px);
  background: var(--ke-color-surface-secondary, var(--background-secondary));
  border: 1px solid var(--ke-color-border, var(--background-modifier-border));
  border-radius: var(--ke-radius-panel, 12px);
  padding: var(--ke-space-4, 17px) var(--ke-space-5, 24px);
  margin-bottom: var(--ke-space-4, 17px);
  will-change: transform, box-shadow;
  transition: transform 0.2s cubic-bezier(0.16, 1, 0.3, 1),
              box-shadow 0.2s cubic-bezier(0.16, 1, 0.3, 1),
              border-color 0.15s ease;
}
.reading-card:hover {
  border-color: var(--ke-color-interactive, var(--text-accent));
}
.reading-card:active {
  transform: scale(0.95);
}
.reading-card.is-focus {
  border-inline-start: 4px solid var(--ke-color-accent, var(--text-accent));
  outline: none;
}

/* Hero Detail Card */
.reading-card-hero {
  padding: clamp(24px, 5vw, 32px);
  margin-bottom: var(--ke-space-5, 24px);
  background: var(--ke-color-surface, var(--background-primary));
  border: 1px solid var(--ke-color-border, var(--background-modifier-border));
  border-radius: var(--ke-radius-card, 16px);
  gap: 24px;
}
.reading-card-grid {
  align-items: center;
  gap: 6px;
  width: 100px;
  text-align: center;
  padding: 0;
  border: none;
  background: transparent;
}
.reading-card-hero-main {
  display: flex;
  gap: clamp(17px, 4vw, 40px);
  align-items: center;
  min-width: 0;
  flex-wrap: wrap;
}
.reading-card-cover { flex: 0 0 auto; }
.reading-card-meta {
  flex: 1 1 auto;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.reading-card-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

/* Touch Targets & Button GPU Physics */
.reading-card button,
.reading-card a,
.reading-responsive-workspace button,
.prodigy-reading-guide button,
.prodigy-related-memory button {
  min-block-size: var(--ke-touch-target);
  min-inline-size: var(--ke-touch-target);
  word-break: keep-all;
  border-radius: var(--ke-radius-control, 8px);
  will-change: transform;
  transition: transform 0.15s cubic-bezier(0.16, 1, 0.3, 1),
              background-color 0.15s ease,
              border-color 0.15s ease;
}
.reading-card button:active,
.reading-responsive-workspace button:active,
.prodigy-reading-guide button:active,
.prodigy-related-memory button:active {
  transform: scale(0.95);
}

/* Progress Bar Pill Capsule */
.reading-card progress,
.reading-responsive-workspace progress {
  inline-size: 100%;
  block-size: 8px;
  border-radius: var(--ke-radius-pill);
  accent-color: var(--ke-color-interactive, var(--text-accent));
  overflow: hidden;
}

/* Checklists & Memory Glass Modals */
.prodigy-reading-guide,
.prodigy-related-memory {
  max-width: 640px;
  word-break: keep-all;
  overflow-wrap: anywhere;
}
.reading-guide-tabs { display: flex; gap: 6px; flex-wrap: wrap; margin: 8px 0 10px; }
.reading-guide-tab {
  flex: 1 1 0;
  min-width: 88px;
  min-height: var(--ke-touch-target);
  border-radius: var(--ke-radius-control, 8px);
  font-weight: 700;
  font-size: .88em;
  will-change: transform;
  transition: transform 0.15s ease, border-color 0.15s ease;
}
.reading-guide-tab:active { transform: scale(0.97); }
.reading-guide-tab.is-active {
  outline: 2px solid var(--ke-color-accent, var(--text-accent));
  outline-offset: 0;
  background: var(--ke-color-hover, var(--background-modifier-hover));
}
.reading-guide-meta { font-size: .8em; font-weight: 700; color: var(--text-muted); margin-bottom: 8px; }
.reading-guide-body { max-height: 62vh; overflow-y: auto; overscroll-behavior: contain; padding-right: 2px; }
.reading-guide-phase-title {
  font-weight: 800;
  font-size: .92em;
  color: var(--ke-color-accent, var(--text-accent));
  margin: 0 0 4px;
}
.reading-guide-phase-q { font-size: .8em; color: var(--text-muted); margin: 0 0 12px; line-height: 1.4; }
.reading-guide-item { padding: 12px 0; border-bottom: 1px solid var(--ke-color-border, var(--background-modifier-border)); }
.reading-guide-question { font-size: .95em; font-weight: 650; line-height: 1.45; overflow-wrap: anywhere; }
.reading-guide-hint { color: var(--text-muted); font-size: .78em; line-height: 1.45; margin-top: 6px; }
.reading-guide-answer { margin-top: 8px; }
.reading-guide-answer textarea {
  box-sizing: border-box;
  width: 100%;
  min-height: 88px;
  max-height: 180px;
  resize: vertical;
  border-radius: var(--ke-radius-control, 8px);
  padding: 10px;
  font: inherit;
  line-height: 1.45;
}
.reading-guide-button { min-height: var(--ke-touch-target); border-radius: var(--ke-radius-control, 8px); }

/* Glassmorphic Modal Footer with Safe Area Support for iPhone */
.reading-guide-footer {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  margin-top: 14px;
  position: sticky;
  bottom: 0;
  background: var(--ke-color-surface, var(--background-primary));
  padding: 12px 0 max(12px, env(safe-area-inset-bottom));
  border-top: 1px solid var(--ke-color-border, var(--background-modifier-border));
}
.reading-guide-footer .reading-guide-save { flex: 1 1 100%; min-height: var(--ke-touch-target); font-weight: 700; }
.reading-guide-footer-secondary { display: flex; gap: 8px; flex-wrap: wrap; width: 100%; }

.prodigy-memory-body { max-height: 68vh; overflow-y: auto; padding-right: 2px; }
.prodigy-memory-list { display: flex; flex-direction: column; gap: 8px; }
.prodigy-memory-item {
  border: 1px solid var(--ke-color-border, var(--background-modifier-border));
  border-radius: var(--ke-radius-panel, 10px);
  padding: 14px;
  background: var(--ke-color-surface-secondary, var(--background-secondary));
  overflow-wrap: anywhere;
  will-change: transform;
  transition: transform 0.15s ease, box-shadow 0.15s ease;
}
.prodigy-memory-item:hover {
}
.prodigy-memory-labels, .prodigy-memory-actions { display: flex; gap: 6px; flex-wrap: wrap; }
.prodigy-memory-label { font-size: .76em; color: var(--ke-color-accent, var(--text-accent)); font-weight: 700; }
.prodigy-memory-button { min-height: var(--ke-touch-target); border-radius: var(--ke-radius-control, 8px); }
.prodigy-memory-explanation[hidden] { display: none; }

/* Session History */
.reading-session-history { max-width: 980px; margin: 0 auto 8px; }
.reading-session-row { padding: 12px 0; border-top: 1px solid var(--ke-color-border, var(--background-modifier-border)); }
.reading-session-row:first-of-type { border-top: 0; padding-top: 0; }
.reading-session-meta { color: var(--text-muted); font-size: 0.78em; display: flex; gap: 8px; flex-wrap: wrap; margin-top: 4px; }
.reading-session-detail { font-size: 0.86em; line-height: 1.45; margin-top: 5px; overflow-wrap: anywhere; }
.reading-session-delta {
  margin-top: 6px;
  padding: 8px 10px;
  border-left: 3px solid var(--ke-color-accent, var(--text-accent));
  background: var(--ke-color-surface, var(--background-primary));
  border-radius: 0 var(--ke-radius-control, 6px) var(--ke-radius-control, 6px) 0;
  font-size: 0.86em;
  line-height: 1.45;
}

/* Reduced Motion — Instant Accessibility Compliance */
@media (prefers-reduced-motion: reduce) {
  .prodigy-reading-app *, .reading-responsive-workspace *, .reading-card, .prodigy-memory-item, .reading-guide-tab {
    transition: none !important;
    animation: none !important;
    transform: none !important;
    will-change: auto !important;
  }
}

/* Mobile & iPhone Safe Area Overrides */
@media (max-width: ${compactMax}px) {
  .prodigy-reading-guide { padding-bottom: max(16px, env(safe-area-inset-bottom)); }
  .reading-guide-tabs { flex-direction: column; }
  .reading-guide-tab { width: 100%; }
  .reading-guide-body { max-height: 58vh; }
  .reading-guide-answer textarea { font-size: 16px; min-height: 100px; }
  .reading-guide-footer-secondary { flex-direction: column; }
  .reading-guide-footer-secondary .reading-guide-button { width: 100%; }

  .prodigy-memory-actions { flex-direction: column; }
  .prodigy-memory-button { width: 100%; }
  .prodigy-memory-body { max-height: 72vh; }
}

/* Forced Colors for High Contrast Mode */
@media (forced-colors: active) {
  .reading-responsive-list { border-right: 1px solid CanvasText; }
  .reading-guide-tab.is-active, .reading-card.is-focus { outline: 2px solid Highlight; }
}
`;
  }

  root.ReadingStyles = { ensureStyles: ensureReadingStyles, STYLE_ID };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = root.ReadingStyles;
  }
})(typeof window !== "undefined" ? window : globalThis);
