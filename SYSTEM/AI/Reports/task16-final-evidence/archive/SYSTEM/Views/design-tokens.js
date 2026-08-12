/**
 * Prodigy OS shared Apple/Obsidian semantic design foundation.
 * Load before display-registry.js and every domain View.
 */
(function (root) {
  "use strict";

  const VERSION = "alpha";
  const NAME = "Apple-design-analysis";

  const ACCENTS = Object.freeze({
    action: "#0066cc",
    focus: "#0071e3",
    onDark: "#2997ff",
  });

  // Obsidian owns canvases, ink, borders, and status roles. The alpha values
  // from Apple_Design_Analysis_v1 are the documented no-theme fallbacks.
  const SEMANTIC_COLORS = Object.freeze({
    canvas: "var(--background-primary, #ffffff)",
    canvasParchment: "var(--background-secondary, #f5f5f7)",
    surfacePearl: "var(--background-primary-alt, #fafafc)",
    surfaceTile: "var(--background-secondary-alt, #272729)",
    surfaceBlack: "var(--background-primary, #000000)",
    hover: "var(--background-modifier-hover, #f0f0f0)",
    backdrop: "var(--background-modifier-cover, #1d1d1f)",
    border: "var(--background-modifier-border, #e0e0e0)",
    dividerSoft: "var(--background-modifier-border-hover, #f0f0f0)",
    ink: "var(--text-normal, #1d1d1f)",
    muted: "var(--text-muted, #7a7a7a)",
    bodyMutedOnDark: "var(--text-muted, #cccccc)",
    onDark: "var(--text-on-accent, #ffffff)",
    action: ACCENTS.action,
    focus: ACCENTS.focus,
    actionOnDark: ACCENTS.onDark,
    onAction: "#ffffff",
    success: "var(--text-success, var(--text-normal, #1d1d1f))",
    warning: "var(--text-warning, var(--text-normal, #1d1d1f))",
    error: "var(--text-error, var(--text-normal, #1d1d1f))",
  });

  // Legacy registry names are stable aliases, not a second palette.
  const COLORS = Object.freeze({
    success: SEMANTIC_COLORS.success,
    successDark: SEMANTIC_COLORS.success,
    error: SEMANTIC_COLORS.error,
    errorDark: SEMANTIC_COLORS.error,
    warning: SEMANTIC_COLORS.warning,
    warningDark: SEMANTIC_COLORS.warning,
    caution: SEMANTIC_COLORS.warning,
    info: SEMANTIC_COLORS.action,
    infoLight: SEMANTIC_COLORS.actionOnDark,
    accent: SEMANTIC_COLORS.action,
    accentAlt: SEMANTIC_COLORS.action,
    teal: SEMANTIC_COLORS.action,
    cyan: SEMANTIC_COLORS.action,
    pink: SEMANTIC_COLORS.action,
    neutral100: SEMANTIC_COLORS.canvasParchment,
    neutral200: SEMANTIC_COLORS.border,
    neutral300: SEMANTIC_COLORS.border,
    neutral400: SEMANTIC_COLORS.muted,
    neutral500: SEMANTIC_COLORS.muted,
    neutral600: SEMANTIC_COLORS.muted,
    neutral700: SEMANTIC_COLORS.muted,
    neutral800: SEMANTIC_COLORS.ink,
    neutral900: SEMANTIC_COLORS.ink,
    muted: SEMANTIC_COLORS.muted,
    stone: SEMANTIC_COLORS.muted,
    white: SEMANTIC_COLORS.onAction,
    black: SEMANTIC_COLORS.ink,
  });

  const SPACE_SCALE = Object.freeze({
    xxs: 4,
    xs: 8,
    sm: 12,
    md: 17,
    lg: 24,
    xl: 32,
    xxl: 48,
    section: 80,
  });

  // Compatibility for domain layout code awaiting Task 13A presentation migration.
  const SPACING = Object.freeze({ xs: 2, sm: 4, md: 8, lg: 12, xl: 16 });

  const RADII = Object.freeze({
    none: 0,
    xs: 5,
    sm: 8,
    md: 11,
    lg: 18,
    pill: 9999,
    full: 9999,
  });

  const DISPLAY_STACK = "SF Pro Display, system-ui, -apple-system, sans-serif";
  const TEXT_STACK = "SF Pro Text, system-ui, -apple-system, sans-serif";
  function type(fontFamily, fontSize, fontWeight, lineHeight, letterSpacing) {
    return Object.freeze({ fontFamily, fontSize, fontWeight, lineHeight, letterSpacing });
  }

  const TYPE_SCALE = Object.freeze({
    heroDisplay: type(DISPLAY_STACK, 56, 600, 1.07, -0.28),
    displayLg: type(DISPLAY_STACK, 40, 600, 1.1, 0),
    displayMd: type(TEXT_STACK, 34, 600, 1.47, -0.374),
    lead: type(DISPLAY_STACK, 28, 400, 1.14, 0.196),
    leadAiry: type(TEXT_STACK, 24, 300, 1.5, 0),
    tagline: type(DISPLAY_STACK, 21, 600, 1.19, 0.231),
    bodyStrong: type(TEXT_STACK, 17, 600, 1.24, -0.374),
    body: type(TEXT_STACK, 17, 400, 1.47, -0.374),
    denseLink: type(TEXT_STACK, 17, 400, 2.41, 0),
    caption: type(TEXT_STACK, 14, 400, 1.43, -0.224),
    captionStrong: type(TEXT_STACK, 14, 600, 1.29, -0.224),
    buttonLarge: type(TEXT_STACK, 18, 300, 1, 0),
    buttonUtility: type(TEXT_STACK, 14, 400, 1.29, -0.224),
    finePrint: type(TEXT_STACK, 12, 400, 1, -0.12),
    microLegal: type(TEXT_STACK, 10, 400, 1.3, -0.08),
    navLink: type(TEXT_STACK, 12, 400, 1, -0.12),
  });

  const TYPOGRAPHY = Object.freeze({
    chrome: "0.68rem",
    label: "0.72rem",
    body: "0.84rem",
    heading: "0.92rem",
    title: "1.05rem",
    bodyLeading: 1.45,
    controlLeading: 1.35,
  });

  const RESPONSIVE_BREAKPOINTS = Object.freeze({
    compactMax: 419,
    phoneMax: 640,
    tileMax: 735,
    collapsedNavMax: 833,
    utilityTwoColumnMax: 1023,
    smallDesktopMax: 1068,
    contentMax: 1440,
  });

  // medium/wide remain compatibility seams for untouched domain layout logic.
  // Shared alpha presentation uses RESPONSIVE_BREAKPOINTS exclusively.
  const BREAKPOINTS = Object.freeze({
    ...RESPONSIVE_BREAKPOINTS,
    medium: 768,
    wide: 1024,
  });

  const CONTROL_HEIGHTS = Object.freeze({
    native: 44,
    input: 44,
    icon: 44,
    touchTarget: 44,
    workspaceBar: 64,
    actionBar: 52,
    mobileToolbar: 56,
  });

  const SHADOWS = Object.freeze({
    none: "none",
    sm: "none",
    md: "none",
    lg: "none",
    xl: "none",
    card: "none",
    overlay: "none",
    backdrop: "none",
    image: "rgba(0, 0, 0, 0.22) 3px 5px 30px 0",
  });

  const CANONICAL_COLORS = new Set([
    ...Object.values(ACCENTS),
    ...Object.values(SEMANTIC_COLORS),
    ...Object.values(COLORS),
  ]);

  function withAlpha(color, alpha) {
    if (!CANONICAL_COLORS.has(color)) throw new TypeError("color must be a canonical Prodigy token");
    if (typeof alpha !== "number" || !Number.isFinite(alpha)) throw new TypeError("alpha must be a finite number");
    const amount = Math.max(0, Math.min(1, alpha)) * 100;
    return `color-mix(in srgb, ${color} ${amount}%, transparent)`;
  }

  function badgeBg(color) {
    return withAlpha(color, 0.1);
  }

  const api = Object.freeze({
    VERSION,
    NAME,
    ACCENTS,
    SEMANTIC_COLORS,
    COLORS,
    SPACE_SCALE,
    SPACING,
    RADII,
    TYPE_SCALE,
    TYPOGRAPHY,
    RESPONSIVE_BREAKPOINTS,
    BREAKPOINTS,
    CONTROL_HEIGHTS,
    SHADOWS,
    withAlpha,
    badgeBg,
  });

  root.ProdigyTokens = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
