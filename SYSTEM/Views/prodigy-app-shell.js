(function (root) {
  "use strict";

  const STYLE_ID = "prodigy-app-shell-styles";
  const ownerShells = new WeakMap();

  function shellOwner(container) {
    if (!container || typeof container.closest !== "function") return container;
    return container.closest(".workspace-leaf-content") || container;
  }

  // Container-driven tier (Todo 5): keyed exclusively off the MEASURED
  // .prodigy-app-shell-body width through the canonical CONTAINER_TIERS token.
  // compact <=640, medium 641-1068, wide >=1069. Never window.innerWidth, and
  // no private breakpoint — the token is the single source of truth.
  function tierForWidth(width, tiers) {
    const scheme = tiers || {};
    const compact = scheme.compact || {};
    const medium = scheme.medium || {};
    const compactMax = typeof compact.max === "number" ? compact.max : 640;
    const mediumMax = typeof medium.max === "number" ? medium.max : 1068;
    if (width <= compactMax) return "compact";
    if (width <= mediumMax) return "medium";
    return "wide";
  }

  function designTokens() {
    if (root.ProdigyTokens) return root.ProdigyTokens;
    if (typeof require === "function") {
      try { return require("./design-tokens.js"); } catch (_error) { return null; }
    }
    return null;
  }

  function shellVariables() {
    const tokens = designTokens() || {};
    const type = tokens.TYPE_SCALE || {};
    const space = tokens.SPACE_SCALE || {};
    const radii = tokens.RADII || {};
    const heights = tokens.CONTROL_HEIGHTS || {};
    const colors = tokens.SEMANTIC_COLORS || {};
    const shadows = tokens.SHADOWS || {};
    const body = type.body || {};
    const caption = type.caption || {};
    const title = type.tagline || {};
    return [
      "--ke-type-body:0.84rem",
      "--ke-type-title:1.05rem",
      "--ke-leading-body:1.45",
      `--ke-font-display:${(type.heroDisplay && type.heroDisplay.fontFamily) || "SF Pro Display, system-ui, -apple-system, sans-serif"}`,
      `--ke-type-display:${(type.heroDisplay && type.heroDisplay.fontSize) || 56}px`,
      `--ke-leading-display:${(type.heroDisplay && type.heroDisplay.lineHeight) || 1.07}`,
      `--ke-tracking-display:${(type.heroDisplay && type.heroDisplay.letterSpacing) || -0.28}px`,
      `--ke-font-text:${body.fontFamily || "SF Pro Text, system-ui, -apple-system, sans-serif"}`,
      `--ke-type-body:${body.fontSize || 17}px`,
      `--ke-type-title:${title.fontSize || 21}px`,
      `--ke-leading-body:${body.lineHeight || 1.47}`,
      `--ke-type-chrome:${caption.fontSize || 14}px`,
      `--ke-type-label:${caption.fontSize || 14}px`,
      `--ke-type-heading:${title.fontSize || 21}px`,
      `--ke-leading-control:${caption.lineHeight || 1.43}`,
      `--ke-space-1:${space.xxs || 4}px`,
      `--ke-space-2:${space.xs || 8}px`,
      `--ke-space-3:${space.sm || 12}px`,
      `--ke-space-4:${space.md || 17}px`,
      `--ke-space-5:${space.lg || 24}px`,
      `--ke-space-6:${space.xl || 32}px`,
      `--ke-space-7:${space.xxl || 48}px`,
      `--ke-space-section:${space.section || 80}px`,
      "--ke-border-width:1px",
      "--ke-focus-ring-width:2px",
      `--ke-radius-control:${radii.sm || 8}px`,
      `--ke-radius-panel:${radii.lg || 18}px`,
      `--ke-radius-configurator:${radii.md || 11}px`,
      `--ke-radius-pill:${radii.pill || 9999}px`,
      "--ke-font-weight-strong:600",
      "--ke-opacity-disabled:0.6",
      "--ke-motion-fast:150ms",
      `--ke-color-surface:${colors.canvas || "var(--background-primary)"}`,
      `--ke-color-surface-secondary:${colors.canvasParchment || "var(--background-secondary)"}`,
      `--ke-color-surface-pearl:${colors.surfacePearl || "var(--background-primary-alt)"}`,
      `--ke-color-dark:${colors.surfaceTile || "var(--background-secondary-alt)"}`,
    `--ke-color-graphite:${colors.graphite || "var(--text-normal)"}`,
      `--ke-color-hover:${colors.hover || "var(--background-modifier-hover)"}`,
      `--ke-color-backdrop:${colors.backdrop || "var(--background-modifier-cover)"}`,
      `--ke-color-border:${colors.border || "var(--background-modifier-border)"}`,
      `--ke-color-text:${colors.ink || "var(--text-normal)"}`,
      `--ke-color-muted:${colors.muted || "var(--text-muted)"}`,
      `--ke-color-accent:${colors.focus || "var(--text-accent)"}`,
      `--ke-color-interactive:${colors.action || "var(--interactive-accent)"}`,
      `--ke-color-interactive-dark:${colors.actionOnDark || "var(--text-accent)"}`,
      `--ke-color-on-interactive:${colors.onAction || "var(--text-on-accent)"}`,
      `--ke-color-on-dark:${colors.onDark || "var(--text-on-accent)"}`,
      `--ke-color-secondary-on-dark:${colors.onDarkMuted || "var(--text-muted)"}`,
      `--ke-color-separator-on-dark:${colors.separatorOnDark || "var(--background-modifier-border)"}`,
      `--ke-color-success:${colors.success || "var(--text-success)"}`,
      `--ke-color-warning:${colors.warning || "var(--text-warning)"}`,
      `--ke-color-error:${colors.error || "var(--text-error)"}`,
      `--ke-shadow-image:${shadows.image || "none"}`,
      `--ke-control-height:${heights.native || 44}px`,
      `--ke-touch-target:${heights.touchTarget || 44}px`,
      `--ke-workspace-bar-height:${heights.workspaceBar || 64}px`,
      `--ke-action-bar-height:${heights.actionBar || 52}px`,
      `--ke-mobile-toolbar-height:${heights.mobileToolbar || 56}px`,
    ].join(";");
  }

  function ensureStyles() {
    if (typeof document === "undefined") return;
    let style = document.getElementById(STYLE_ID);
    if (!style) {
      style = document.createElement("style");
      style.id = STYLE_ID;
      document.head.appendChild(style);
    }
    style.textContent = `
.prodigy-app-shell {
  --prodigy-workspace-bar-height: var(--ke-workspace-bar-height, 48px);
  --prodigy-action-bar-height: var(--ke-action-bar-height, 52px);
  --prodigy-touch-target: var(--ke-touch-target, 44px);
  --prodigy-safe-area-bottom: env(safe-area-inset-bottom, 0px);
  --prodigy-mobile-toolbar-clearance: 0px;
  display: grid;
  grid-template-rows: auto auto minmax(0, 1fr);
  max-block-size: 100dvb;
  min-block-size: 0;
  min-inline-size: 0;
  overflow: hidden;
  color: var(--ke-color-text, var(--text-normal));
  background: var(--ke-color-surface, var(--background-primary));
  font-family: var(--ke-font-text, system-ui, -apple-system, sans-serif);
  font-size: var(--ke-type-body, 17px);
  line-height: var(--ke-leading-body, 1.45);
  word-break: keep-all;
  overflow-wrap: anywhere;
}
.prodigy-app-shell[data-context-placement="inline"] {
  grid-template-rows: auto minmax(0, 1fr);
}
.prodigy-workspace-bar {
  display: flex;
  align-items: center;
  gap: var(--ke-space-3, 12px);
  min-block-size: var(--prodigy-workspace-bar-height);
  min-inline-size: 0;
  padding-inline: var(--ke-space-4, 17px);
  border-bottom: 1px solid var(--ke-color-border, var(--background-modifier-border));
  box-shadow: none;
}
.prodigy-workspace-title {
  margin: 0;
  min-inline-size: 0;
  font-size: var(--ke-type-body, 0.84rem);
  font-weight: 500;
  line-height: var(--ke-leading-body, 1.45);
  letter-spacing: 0;
  white-space: normal;
  overflow-wrap: anywhere;
  word-break: keep-all;
}
/* Quiet shell chrome: the workspace bar is a calm strip, never a competing
   64px hero header. The body PrimarySurface owns the hero title/message, so
   the bar title stays at chrome scale on every container tier. */
.prodigy-app-shell[data-tier="wide"] > .prodigy-workspace-bar {
  min-block-size: var(--ke-touch-target, 44px);
}
.prodigy-app-shell[data-tier="wide"] > .prodigy-workspace-bar .prodigy-workspace-title {
  font-weight: 600;
}
.prodigy-workspace-switcher {
  min-block-size: var(--ke-control-height, 44px);
  min-inline-size: var(--ke-control-height, 44px);
  max-inline-size: min(16rem, 100%);
  padding-inline: var(--ke-space-3, 8px);
  border: 1px solid var(--ke-color-border, var(--background-modifier-border));
  border-radius: var(--ke-radius-control, 8px);
  background: var(--ke-color-surface, var(--background-primary));
  color: var(--ke-color-text, var(--text-normal));
  font-size: var(--ke-type-label, .72rem);
  line-height: var(--ke-leading-control, 1.35);
  overflow-wrap: anywhere;
  box-sizing: border-box;
  box-shadow: none;
}
.prodigy-workspace-switcher:focus-visible,
.prodigy-context-action:focus-visible,
.prodigy-app-shell-body:focus-visible {
  outline: 2px solid var(--ke-color-accent, var(--text-accent));
  outline-offset: 2px;
}
.prodigy-context-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--ke-space-3, 8px);
  min-inline-size: 0;
  padding-block: var(--ke-space-2, 4px);
  color: var(--ke-color-muted, var(--text-muted));
  font-size: var(--ke-type-label, .72rem);
  line-height: var(--ke-leading-control, 1.35);
  border-bottom: 1px solid var(--ke-color-border, var(--background-modifier-border));
}
.prodigy-context-bar.prodigy-context-bar-inline {
  flex: 0 0 auto;
  margin-inline-start: auto;
  padding: 0;
  border-bottom: 0;
}
.prodigy-context-bar-inline .prodigy-context-items {
  display: none;
}
.prodigy-context-items,
.prodigy-context-actions {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--ke-space-3, 8px);
  min-inline-size: 0;
}
.prodigy-context-item {
  min-inline-size: 0;
  white-space: normal;
  overflow-wrap: anywhere;
  word-break: keep-all;
}
.prodigy-context-action {
  min-block-size: var(--ke-control-height, 44px);
  min-inline-size: var(--ke-control-height, 44px);
  max-inline-size: 100%;
  box-sizing: border-box;
  box-shadow: none;
  white-space: normal;
  overflow-wrap: anywhere;
  word-break: keep-all;
}
.prodigy-app-shell.prodigy-app-shell .prodigy-workspace-switcher,
.prodigy-app-shell.prodigy-app-shell .prodigy-context-action {
  box-shadow: none;
}
.prodigy-app-shell [aria-busy="true"],
.prodigy-app-shell [data-state="loading"] {
  border-width: var(--ke-focus-ring-width, 2px);
  border-style: dashed;
  cursor: progress;
}
.prodigy-app-shell [data-state="empty"] {
  border-style: dotted;
  color: var(--ke-color-muted, var(--text-muted));
}
.prodigy-app-shell [data-state="success"] {
  border-inline-start-width: calc(var(--ke-focus-ring-width, 2px) * 2);
  border-inline-start-style: solid;
  color: var(--ke-color-success, var(--text-success));
}
.prodigy-app-shell [data-state="warning"] {
  border-inline-start-width: calc(var(--ke-focus-ring-width, 2px) * 2);
  border-inline-start-style: dashed;
  color: var(--ke-color-warning, var(--text-warning));
}
.prodigy-app-shell [data-state="error"] {
  border-width: calc(var(--ke-border-width, 1px) * 3);
  border-style: double;
  color: var(--ke-color-error, var(--text-error));
}
.prodigy-app-shell [aria-selected="true"],
.prodigy-app-shell [aria-pressed="true"],
.prodigy-app-shell [data-state="selected"] {
  color: var(--ke-color-accent, var(--text-accent));
  border-color: var(--ke-color-accent, var(--text-accent));
  background: var(--ke-color-hover, var(--background-modifier-hover));
  outline: var(--ke-focus-ring-width, 2px) solid var(--ke-color-accent, var(--text-accent));
  outline-offset: 0;
}
/* Wide Mac native-app treatment: selection is a persistent tint, while the
   blue ring belongs exclusively to keyboard focus. */
.prodigy-app-shell[data-tier="wide"] [aria-selected="true"],
.prodigy-app-shell[data-tier="wide"] [aria-pressed="true"],
.prodigy-app-shell[data-tier="wide"] [data-state="selected"] {
  color: var(--ke-color-text, var(--text-normal));
  border-color: transparent;
  background: color-mix(in srgb, var(--ke-color-accent, var(--text-accent)) 12%, var(--ke-color-surface-secondary, var(--background-secondary)));
  outline: none;
}
.prodigy-app-shell[data-tier="wide"] [aria-selected="true"]:focus-visible,
.prodigy-app-shell[data-tier="wide"] [aria-pressed="true"]:focus-visible,
.prodigy-app-shell[data-tier="wide"] [data-state="selected"]:focus-visible {
  outline: var(--ke-focus-ring-width, 2px) solid var(--ke-color-accent, var(--text-accent));
  outline-offset: 2px;
}
.prodigy-app-shell .prodigy-context-action {
  border-color: transparent;
  background: transparent;
  color: var(--ke-color-accent, var(--text-accent));
  font-weight: 500;
}
.prodigy-app-shell .prodigy-context-action:hover {
  background: var(--ke-color-hover, var(--background-modifier-hover));
}
.prodigy-app-shell .prodigy-context-action:focus-visible {
  outline: var(--ke-focus-ring-width, 2px) solid var(--ke-color-accent, var(--text-accent));
  outline-offset: 2px;
}
.prodigy-app-shell :disabled,
.prodigy-app-shell [aria-disabled="true"],
.prodigy-app-shell [data-state="disabled"] {
  opacity: var(--ke-opacity-disabled, 0.6);
  cursor: not-allowed;
  transform: none;
}
.prodigy-app-shell-body {
  min-block-size: 0;
  min-inline-size: 0;
  overflow: auto;
  overflow-x: hidden;
  padding-block-end: var(--prodigy-mobile-toolbar-clearance, 0px);
  scroll-padding-block-end: var(--prodigy-mobile-toolbar-clearance, 0px);
  overscroll-behavior-block: contain;
  -webkit-overflow-scrolling: touch;
}
.prodigy-app-shell[data-workspace-id="journal"] {
  grid-template-rows: auto auto auto;
  max-block-size: none;
  overflow: visible;
}
.prodigy-app-shell[data-workspace-id="home"] {
  grid-template-rows: auto auto auto;
  max-block-size: none;
  overflow: visible;
}
.prodigy-app-shell[data-workspace-id="journal"] > .prodigy-app-shell-body {
  overflow: visible;
  overscroll-behavior-block: auto;
}
.prodigy-app-shell[data-workspace-id="home"] > .prodigy-app-shell-body {
  overflow: visible;
  overscroll-behavior-block: auto;
}
.prodigy-app-shell[data-workspace-id="journal"] > .prodigy-app-shell-body,
.prodigy-app-shell[data-workspace-id="home"] > .prodigy-app-shell-body {
  padding-block-end: 0;
  scroll-padding-block-end: 0;
}
.markdown-preview-view.prodigy-hub-note:has(
  .prodigy-app-shell:is(
    [data-workspace-id="journal"],
    [data-workspace-id="home"]
  )
) {
  overflow-y: auto !important;
}
.prodigy-app-shell[data-workspace-id="auction"]:not([data-tier="medium"]) {
  display: flex !important;
  flex-direction: column !important;
  height: calc(100vh - var(--header-height, 48px) - 20px) !important;
  max-height: calc(100vh - var(--header-height, 48px) - 20px) !important;
  overflow: hidden !important;
}
.prodigy-app-shell[data-workspace-id="auction"] > .prodigy-workspace-bar {
  flex: 0 0 auto !important;
}
.prodigy-app-shell[data-workspace-id="auction"] > .prodigy-context-bar {
  flex: 0 0 auto !important;
}
.prodigy-app-shell[data-workspace-id="auction"]:not([data-tier="medium"]) > .prodigy-app-shell-body {
  flex: 1 1 0% !important;
  min-height: 0 !important;
  max-height: 100% !important;
  overflow-y: auto !important;
  overflow-x: hidden !important;
  overscroll-behavior-y: contain !important;
  -webkit-overflow-scrolling: touch !important;
  scrollbar-width: thin;
  scrollbar-gutter: auto;
}
.prodigy-app-shell[data-tier="medium"][data-workspace-id="auction"] {
  max-block-size: none;
  overflow: visible;
}
.prodigy-app-shell[data-tier="medium"][data-workspace-id="auction"] > .prodigy-app-shell-body {
  overflow: visible;
  overscroll-behavior-block: auto;
}
.prodigy-app-shell[data-workspace-id="auction"] > .prodigy-app-shell-body::-webkit-scrollbar {
  width: 5px;
  height: 5px;
  background: transparent;
}
.prodigy-app-shell[data-workspace-id="auction"] > .prodigy-app-shell-body::-webkit-scrollbar-thumb {
  background: var(--ke-color-border, var(--background-modifier-border));
  border-radius: 9999px;
}
.prodigy-app-shell[data-workspace-id="auction"] > .prodigy-app-shell-body::-webkit-scrollbar-thumb:hover {
  background: var(--ke-color-muted, var(--text-muted));
}
.prodigy-app-shell:is([data-tier="compact"],[data-tier="medium"]):is(
  [data-workspace-id="workout"],
  [data-workspace-id="personal"],
  [data-workspace-id="region"]
) {
  grid-template-rows: auto auto auto;
  max-block-size: none;
  overflow: visible;
}
.prodigy-app-shell:is([data-tier="compact"],[data-tier="medium"]):is(
  [data-workspace-id="workout"],
  [data-workspace-id="personal"],
  [data-workspace-id="region"]
) > .prodigy-app-shell-body {
  overflow: visible;
  padding-block-end: 0;
  scroll-padding-block-end: 0;
  overscroll-behavior-block: auto;
}
/* Obsidian's status bar is external to the AppShell. Reserve its semantic
   height plus one spacing token so the final Knowledge action remains fully
   scrollable above native bottom chrome at every container tier. Runtime QA
   still measures the real status-bar rectangle rather than trusting this
   fallback metric. */
.prodigy-app-shell[data-workspace-id="knowledge"] {
  --prodigy-external-chrome-clearance: calc(
    var(--status-bar-height, var(--ke-touch-target, 44px))
    + var(--ke-space-3, 12px)
    + env(safe-area-inset-bottom, 0px)
  );
}
.prodigy-app-shell[data-workspace-id="knowledge"] {
  block-size: calc(100dvb - var(--header-height, 40px) - var(--prodigy-external-chrome-clearance) - var(--ke-space-5, 24px) - var(--ke-space-1, 4px));
  max-block-size: calc(100dvb - var(--header-height, 40px) - var(--prodigy-external-chrome-clearance) - var(--ke-space-5, 24px) - var(--ke-space-1, 4px));
  min-block-size: 0;
  overflow: hidden;
}
.prodigy-app-shell[data-workspace-id="knowledge"] > .prodigy-app-shell-body {
  min-block-size: 0;
  overflow-y: auto;
  overflow-x: hidden;
  overscroll-behavior-block: contain;
  padding-block-end: max(
    var(--prodigy-mobile-toolbar-clearance, 0px),
    var(--prodigy-external-chrome-clearance)
  );
  scroll-padding-block-end: max(
    var(--prodigy-mobile-toolbar-clearance, 0px),
    var(--prodigy-external-chrome-clearance)
  );
}
.prodigy-app-shell:is([data-tier="compact"],[data-tier="medium"])[data-workspace-id="knowledge"] {
  grid-template-rows: auto minmax(0, 1fr);
  margin-block-end: 0;
}
.prodigy-app-shell[data-tier="wide"]:is(
  [data-workspace-id="workout"],
  [data-workspace-id="personal"],
  [data-workspace-id="region"]
) {
  max-block-size: calc(100dvb - var(--header-height, 40px));
}
/* Knowledge is a bounded scroll-body-shell at every tier. Obsidian's note
   and leaf hosts contain it but never become competing document owners. */
.workspace-leaf-content:has(
  .prodigy-app-shell[data-workspace-id="knowledge"]
),
.markdown-preview-view.prodigy-hub-note:has(
  .prodigy-app-shell[data-workspace-id="knowledge"]
) {
  overflow-y: hidden !important;
  overflow-x: hidden !important;
}
.markdown-preview-view.prodigy-hub-note:has(
  .prodigy-app-shell[data-tier="wide"]:is(
    [data-workspace-id="workout"],
    [data-workspace-id="personal"],
    [data-workspace-id="region"]
  )
) {
  overflow-y: hidden;
}
@media (max-width: 833px) {
  .prodigy-app-shell {
    --prodigy-mobile-toolbar-clearance: calc(
      var(--ke-mobile-toolbar-height, 56px)
      + var(--prodigy-safe-area-bottom)
      + var(--ke-space-5, 16px)
    );
  }
  .prodigy-app-shell[data-workspace-id="home"] {
    grid-template-rows: auto auto auto;
    max-block-size: none;
    overflow: visible;
  }
  .prodigy-app-shell[data-workspace-id="home"] > .prodigy-app-shell-body {
    overflow: visible;
    padding-block-end: 0;
    scroll-padding-block-end: 0;
    overscroll-behavior-block: auto;
  }
}
.prodigy-app-shell[data-tier="compact"]:not([data-workspace-id="home"]):not([data-workspace-id="auction"]) > .prodigy-workspace-bar {
  align-items: stretch;
  flex-direction: column;
  justify-content: center;
  padding-block: var(--ke-space-2, 4px);
}
.prodigy-app-shell[data-tier="compact"]:not([data-workspace-id="home"]):not([data-workspace-id="auction"]) .prodigy-workspace-switcher {
  inline-size: 100%;
  max-inline-size: none;
  min-block-size: var(--prodigy-touch-target);
}
.prodigy-app-shell[data-tier="compact"]:not([data-workspace-id="home"]):not([data-workspace-id="auction"]) > .prodigy-context-bar {
  align-items: stretch;
  flex-direction: column;
}
.prodigy-app-shell[data-tier="compact"]:not([data-workspace-id="home"]):not([data-workspace-id="auction"]) .prodigy-context-actions > * {
  min-block-size: var(--prodigy-touch-target);
}
.prodigy-app-shell[data-tier="medium"]:not([data-workspace-id="home"]):not([data-workspace-id="auction"]) > .prodigy-workspace-bar {
  align-items: center;
  flex-direction: row;
  justify-content: flex-start;
  padding-block: 0;
}
.prodigy-app-shell[data-tier="medium"]:is([data-workspace-id="reading"],[data-workspace-id="project"]) {
  --prodigy-mobile-toolbar-clearance: 0px;
}
.prodigy-app-shell[data-tier="medium"]:not([data-workspace-id="home"]):not([data-workspace-id="auction"]) .prodigy-workspace-switcher {
  flex: 0 1 13rem;
  inline-size: auto;
  max-inline-size: min(13rem, 40%);
}
.prodigy-app-shell[data-tier="medium"]:not([data-workspace-id="home"]):not([data-workspace-id="auction"]) > .prodigy-context-bar {
  align-items: center;
  flex-direction: row;
}
@media (max-width: 419px) {
  .prodigy-app-shell { --prodigy-hero-size: 28px; }
  .prodigy-app-shell[data-workspace-id="auction"] > .prodigy-workspace-bar,
  .prodigy-app-shell[data-workspace-id="reading"] > .prodigy-workspace-bar {
    flex-direction: column;
    align-items: stretch;
    padding-inline: 4px;
  }
  .prodigy-context-bar { padding-inline: var(--ke-space-2, 8px); }
}
@media (min-width: 420px) and (max-width: 640px) {
  .prodigy-app-shell { --prodigy-hero-size: 34px; }
}
@media (min-width: 641px) and (max-width: 735px) {
  .prodigy-app-shell-body { --prodigy-tile-padding: var(--ke-space-7, 48px); }
}
@media (min-width: 736px) and (max-width: 833px) {
  .prodigy-workspace-title { max-inline-size: min(34rem, 70vw); }
}
@media (min-width: 834px) and (max-width: 1023px) {
  .prodigy-workspace-bar { flex-direction: row; }
  .prodigy-app-shell-body { --prodigy-utility-columns: 2; }
  .prodigy-context-action { min-block-size: var(--ke-control-height, 44px); }
}
@media (min-width: 1024px) and (max-width: 1068px) {
  .prodigy-app-shell { margin-inline: auto; padding-inline: var(--ke-space-4, 17px); }
}
@media (min-width: 1069px) and (max-width: 1440px) {
  .prodigy-app-shell { margin-inline: auto; --prodigy-utility-columns: 5; }
}
@media (min-width: 1441px) {
  .prodigy-app-shell { inline-size: 100%; max-inline-size: 1440px; margin-inline: auto; }
}
.prodigy-floating-bar {
  min-block-size: var(--ke-workspace-bar-height, 64px);
  padding: var(--ke-space-3, 12px) var(--ke-space-6, 32px);
  background: var(--ke-color-surface-secondary, var(--background-secondary));
  border: 1px solid var(--ke-color-border, var(--background-modifier-border));
  box-shadow: none;
}
@supports (backdrop-filter: blur(1px)) {
  .prodigy-floating-bar {
    background: var(--background-secondary);
    backdrop-filter: saturate(180%) blur(20px);
  }
}
@media (forced-colors: active) {
  .prodigy-app-shell [aria-selected="true"],
  .prodigy-app-shell [aria-pressed="true"],
  .prodigy-app-shell [data-state="selected"] {
    border-color: Highlight;
    outline-color: Highlight;
  }
  .prodigy-app-shell [aria-busy="true"],
  .prodigy-app-shell [data-state="loading"] {
    border-color: CanvasText;
  }
  .prodigy-app-shell [data-state="empty"] {
    border-color: GrayText;
  }
  .prodigy-app-shell [data-state="success"],
  .prodigy-app-shell [data-state="warning"],
  .prodigy-app-shell [data-state="error"] {
    border-color: CanvasText;
    color: CanvasText;
  }
  .prodigy-app-shell :disabled,
  .prodigy-app-shell [aria-disabled="true"],
  .prodigy-app-shell [data-state="disabled"] {
    color: GrayText;
  }
}
@media (prefers-reduced-motion: reduce) {
  .prodigy-app-shell *,
  .prodigy-app-shell-body {
    scroll-behavior: auto !important;
    transition: none !important;
    animation: none !important;
    transform: none !important;
  }
}`;
  }

  function registry() {
    if (root.ProdigyWorkspaceRegistry) return root.ProdigyWorkspaceRegistry;
    if (typeof require === "function") {
      try { return require("./workspace-registry.js"); } catch (_error) { return null; }
    }
    return null;
  }

  async function openWorkspace(app, item) {
    if (!app || !item) return null;
    const path = item.path;
    if (app.workspace && typeof app.workspace.openLinkText === "function") {
      try { return await app.workspace.openLinkText(path.replace(/\.md$/i, ""), "", false); } catch (_error) { /* use leaf fallback */ }
    }
    const file = app.vault && typeof app.vault.getAbstractFileByPath === "function" ? app.vault.getAbstractFileByPath(path) : null;
    const leaf = app.workspace && typeof app.workspace.getLeaf === "function" ? app.workspace.getLeaf(false) : null;
    return file && leaf && typeof leaf.openFile === "function" ? leaf.openFile(file) : null;
  }

  function WorkspaceSwitcher(parent, options) {
    ensureStyles();
    const opts = options || {};
    const source = registry();
    const activeId = opts.activeId || (opts.stateStore && opts.stateStore.getActiveWorkspace()) || "";
    const registeredItems = source && typeof source.items === "function" ? source.items() : [];
    const activeItem = source && typeof source.find === "function" ? source.find(activeId) : null;
    const items = activeItem && !registeredItems.some((item) => item.id === activeItem.id)
      ? [activeItem, ...registeredItems]
      : registeredItems;
    const select = parent.createEl("select", { attr: { class: "prodigy-workspace-switcher", "aria-label": "워크스페이스 선택" } });
    items.forEach((item) => {
      const attr = { value: item.id };
      if (item.id === activeId) attr.selected = "selected";
      select.createEl("option", { text: item.label, attr });
    });
    select.onchange = async function () {
      const item = source && typeof source.find === "function" ? source.find(select.value) : items.find((entry) => entry.id === select.value);
      if (!item) return null;
      if (opts.stateStore && typeof opts.stateStore.setActiveWorkspace === "function") opts.stateStore.setActiveWorkspace(item.id);
      if (typeof opts.onChange === "function") {
        try { return await opts.onChange(item); } catch (_error) { return openWorkspace(opts.app, item); }
      }
      return openWorkspace(opts.app, item);
    };
    return select;
  }

  function ContextBar(parent, options) {
    ensureStyles();
    const opts = options || {};
    const items = opts.items || [];
    const actions = opts.actions || [];
    // Quiet shell chrome: the ContextBar only exists when it has actual
    // content or a contextual action. An empty bar would add noise.
    if (items.length === 0 && actions.length === 0) return null;
    const bar = parent.createEl("div", { attr: { class: `prodigy-context-bar${opts.inline === true ? " prodigy-context-bar-inline" : ""}`, role: "region", "aria-label": opts.label || "현재 문맥" } });
    const itemsEl = bar.createEl("div", { attr: { class: "prodigy-context-items" } });
    items.forEach((item) => itemsEl.createEl("span", { text: typeof item === "string" ? item : item.label, attr: { class: "prodigy-context-item" } }));
    const actionsEl = bar.createEl("div", { attr: { class: "prodigy-context-actions" } });
    actions.forEach((action) => {
      const label = action.ariaLabel || action.label;
      const button = actionsEl.createEl("button", { text: action.label, attr: { type: "button", class: "prodigy-btn prodigy-context-action", "aria-label": label, title: label } });
      button.onclick = action.onClick || null;
    });
    return bar;
  }

  function AppShell(container, options) {
    ensureStyles();
    const opts = options || {};
    const owner = shellOwner(container);
    const prior = ownerShells.get(owner);
    if (prior) prior.dispose();
    if (opts.replace !== false && typeof container.empty === "function") container.empty();
    const contextOptions = opts.context || {};
    const contextItems = contextOptions.items || [];
    const contextActions = contextOptions.actions || [];
    const inlineContext = opts.workspaceId !== "home" && opts.workspaceId !== "auction" && contextItems.length === 0 && contextActions.length > 0;
    const shell = container.createEl("section", { attr: { class: "prodigy-app-shell", "data-workspace-id": opts.workspaceId || "", "data-context-placement": inlineContext ? "inline" : "stacked", style: shellVariables() } });
    const workspaceBar = shell.createEl("header", { attr: { class: "prodigy-workspace-bar" } });
    const switcher = WorkspaceSwitcher(workspaceBar, { app: opts.app, activeId: opts.workspaceId, stateStore: opts.stateStore, onChange: opts.onWorkspaceChange });
    const title = workspaceBar.createEl("h1", { text: opts.title || "워크스페이스", attr: { class: "prodigy-workspace-title" } });
    const contextBar = ContextBar(inlineContext ? workspaceBar : shell, { ...contextOptions, inline: inlineContext });
    const body = shell.createEl("main", { attr: { class: "prodigy-app-shell-body", tabindex: "-1" } });
    if (typeof opts.renderBody === "function") opts.renderBody(body);
    let disposed = false;
    let reconnectObserver = null;
    let sizeObserver = null;
    let resizeListener = null;
    const documentRef = container && container.ownerDocument;
    const view = documentRef && documentRef.defaultView || root;
    function ensureVisibleOwner() {
      if (disposed || container.isConnected === false || shell.isConnected) return;
      if (typeof container.appendChild === "function") container.appendChild(shell);
    }
    const Observer = view && view.MutationObserver;
    if (owner && typeof Observer === "function") {
      reconnectObserver = new Observer(function () {
        if (!disposed && shell.isConnected === false && container.isConnected !== false && typeof container.appendChild === "function") container.appendChild(shell);
      });
      try { reconnectObserver.observe(owner, { childList: true, subtree: true }); }
      catch (_error) { reconnectObserver = null; }
    }
    const SizeObserver = view && view.ResizeObserver;
    if (owner && typeof SizeObserver === "function") {
      sizeObserver = new SizeObserver(function () { ensureVisibleOwner(); });
      try { sizeObserver.observe(shell); }
      catch (_error) { sizeObserver = null; }
    }
    // Container-tier ownership: measure the BODY, never the outer viewport.
    // Changing the window resizes the leaf unless the container follows it, so
    // the tier is derived from the observed body width alone. ResizeObserver
    // fires once on observe and again on any real container resize.
    let observerTier = null;
    const tierScheme = (designTokens() || {}).CONTAINER_TIERS;
    if (owner && typeof SizeObserver === "function") {
      observerTier = new SizeObserver(function () {
        let width = 0;
        if (body && typeof body.getBoundingClientRect === "function") width = body.getBoundingClientRect().width;
        else if (body && typeof body.offsetWidth === "number") width = body.offsetWidth;
        const tier = tierForWidth(width, tierScheme);
        if (shell && typeof shell.getAttribute === "function" && typeof shell.setAttribute === "function" && shell.getAttribute("data-tier") !== tier) {
          shell.setAttribute("data-tier", tier);
        }
      });
      try { observerTier.observe(body); }
      catch (_error) { observerTier = null; }
    }
    if (view && typeof view.addEventListener === "function") {
      resizeListener = function () { ensureVisibleOwner(); };
      view.addEventListener("resize", resizeListener);
    }
    ensureVisibleOwner();
    const dispose = function () {
      if (disposed) return false;
      disposed = true;
      if (reconnectObserver) { reconnectObserver.disconnect(); reconnectObserver = null; }
      if (sizeObserver) { sizeObserver.disconnect(); sizeObserver = null; }
      if (observerTier) { observerTier.disconnect(); observerTier = null; }
      if (resizeListener && view && typeof view.removeEventListener === "function") { view.removeEventListener("resize", resizeListener); resizeListener = null; }
      switcher.onchange = null;
      if (contextBar && typeof contextBar.querySelectorAll === "function") {
        Array.from(contextBar.querySelectorAll("button")).forEach((button) => { button.onclick = null; });
      }
      if (ownerShells.get(owner) === mounted) ownerShells.delete(owner);
      if (typeof shell.remove === "function") shell.remove();
      else if (shell.parentElement && typeof shell.parentElement.removeChild === "function") shell.parentElement.removeChild(shell);
      return true;
    };
    const mounted = { element: shell, workspaceBar, switcher, title, contextBar, body, dispose };
    ownerShells.set(owner, mounted);
    return mounted;
  }

  const api = Object.freeze({ AppShell, ContextBar, WorkspaceSwitcher });
  root.ProdigyAppShell = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
