/**
 * Prodigy OS shared Apple/Obsidian semantic design foundation.
 * Load before display-registry.js and every domain View.
 */
(function (root) {
  "use strict";

  const VERSION = "alpha";
  const NAME = "Apple-design-analysis";

  // Apple web Action Blue family. `action` and `focus` share the primary
  // #0071e3 (Apple web system blue); `link` is the body-link blue and
  // `onDark` is the dark-surface action/link blue. The former alpha aliases
  // (#007aff / #0a84ff) are retired so the two blue families never coexist.
  const ACCENTS = Object.freeze({
    action: "#0071e3", // primary and focus
    focus: "#0071e3",
    link: "#0066cc", // body link
    onDark: "#2997ff", // dark-surface action / link
  });

  // Obsidian owns canvases, ink, borders, and status roles. The alpha values
  // from Apple_Design_Analysis_v1 are the documented no-theme fallbacks.
  const SEMANTIC_COLORS = Object.freeze({
    canvas: "var(--background-primary, #ffffff)",
    canvasParchment: "var(--background-secondary, #f5f5f7)",
    surfacePearl: "var(--background-primary-alt, #fafafc)",
    surfaceTile: "var(--background-secondary-alt, #272729)",
    surfaceBlack: "var(--background-primary, #000000)",
    graphite: "#1d1d1f",
    hover: "var(--background-modifier-hover, #f0f0f0)",
    backdrop: "var(--background-modifier-cover, #1d1d1f)",
    border: "var(--background-modifier-border, #e0e0e0)",
    dividerSoft: "var(--background-modifier-border-hover, #f0f0f0)",
    ink: "var(--text-normal, #1d1d1f)",
    muted: "var(--text-muted, #7a7a7a)",
    bodyMutedOnDark: "var(--text-muted, #cccccc)",
    onDark: "var(--text-on-accent, #ffffff)",
    onDarkMuted: "#d2d2d7",
    separatorOnDark: "#424245",
    action: ACCENTS.action,
    focus: ACCENTS.focus,
    actionOnDark: ACCENTS.onDark,
    onAction: "#ffffff",
    // Auction Card 1px semantic boundary (light / dark).
    cardBoundaryLight: "#d2d2d7",
    cardBoundaryDark: "#424245",
    success: "var(--text-success, var(--text-normal, #1d1d1f))",
    warning: "var(--text-warning, var(--text-normal, #1d1d1f))",
    error: "var(--text-error, var(--text-normal, #1d1d1f))",
  });

  // Legacy registry names are stable aliases, not a second palette.
  // Auction Card boundary values are raw card chrome, not product accents.
  const CARD_BOUNDARY = Object.freeze({
    light: "#d2d2d7",
    dark: "#424245",
  });

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

  // Official Apple human-interface facts (separate from the Prodigy project
  // defaults below). iPhone/iPad base hit target is 44x44pt with an absolute
  // minimum of 28x28pt; macOS native controls are 28x28pt by default with a
  // 20x20pt absolute minimum. Apple requires safe-area respect and 200% text
  // enlargement (system text on iOS/iPadOS, browser zoom on macOS).
  const APPLE_SPEC = Object.freeze({
    phonePadHitTargetPt: 44,
    phonePadAbsoluteMinPt: 28,
    macNativeDefaultPt: 28,
    macAbsoluteMinPt: 20,
    textEnlargement: 2, // 200% text-enlargement support
  });

  // Prodigy project-default device metrics: one shared Apple-style hierarchy
  // projected per device family. Controls split a small visual box from the
  // non-overlapping 44px hit wrapper so Mac visuals stay 32/36px while their
  // hit targets remain 44px. Container tiers key off the measured
  // `.prodigy-app-shell-body` width, never window.innerWidth.
  const CONTAINER_TIERS = Object.freeze({
    compact: { min: 0, max: 640 },
    medium: { min: 641, max: 1068 },
    wide: { min: 1069 },
    contentMax: 1440,
  });

  const DEVICE_TABLE = Object.freeze({
    primaryCta: {
      phone: { visualHeight: 50, hitTarget: 50, fontSize: 17, fontWeight: 600, lineHeight: 1.24, paddingInline: 20, radius: 25 },
      pad: { visualHeight: 48, hitTarget: 48, fontSize: 17, fontWeight: 600, paddingInline: 20, radius: 24 },
      mac: { visualHeight: 44, hitTarget: 44, fontSize: 15, fontWeight: 600, paddingInline: 18, radius: 22 },
    },
    secondaryCta: {
      phone: { visualHeight: 44, hitTarget: 44, fontSize: 15, fontWeight: 600, paddingInline: 16, radius: 22 },
      pad: { visualHeight: 44, hitTarget: 44, fontSize: 15, fontWeight: 600, paddingInline: 16, radius: 22 },
      mac: { visualHeight: 36, hitTarget: 44, fontSize: 14, fontWeight: 600, paddingInline: 14, radius: 18 },
    },
    filterUtility: {
      phone: { visualHeight: 44, hitTarget: 44, fontSize: 15, fontWeight: 500, paddingInline: 16 },
      pad: { visualHeight: 44, hitTarget: 44, fontSize: 14, fontWeight: 500, paddingInline: 16 },
      mac: { visualHeight: 32, hitTarget: 44, fontSize: 13, fontWeight: 500, paddingInline: 12 },
    },
    iconControl: {
      phone: { visualSize: 44, hitSize: 44, glyphSize: 18 },
      pad: { visualSize: 44, hitSize: 44, glyphSize: 18 },
      mac: { visualSize: 32, hitSize: 44, glyphSize: 16 },
    },
    searchInput: {
      phone: { visualHeight: 48, hitTarget: 48, fontSize: 17, fontWeight: 400, paddingInline: 17 },
      pad: { visualHeight: 44, hitTarget: 44, fontSize: 17, fontWeight: 400, paddingInline: 17 },
      mac: { visualHeight: 36, hitTarget: 44, fontSize: 13, fontWeight: 400, paddingInline: 12 },
    },
    focus: {
      phone: { outlineWidth: 2, offset: 2 },
      pad: { outlineWidth: 2, offset: 2 },
      mac: { outlineWidth: 2, offset: 2 },
    },
    bodyMetadata: {
      phone: { bodyFontSize: 17, bodyWeight: 400, bodyLineHeight: 1.47, metadataFontSize: 14, metadataWeight: 400, metadataLineHeight: 1.43 },
      pad: { bodyFontSize: 17, bodyWeight: 400, bodyLineHeight: 1.47, metadataFontSize: 14, metadataWeight: 400, metadataLineHeight: 1.43 },
      mac: { bodyFontSize: 17, bodyWeight: 400, bodyLineHeight: 1.47, denseFontSize: 13, denseWeight: 400, denseLineHeight: 1.23, metadataMinFontSize: 12, metadataMaxFontSize: 13 },
    },
    hero: {
      phone: { fontSize: 34, fontWeight: 600, lineHeight: 1.12 },
      pad: { portrait: { fontSize: 40, fontWeight: 600, lineHeight: 1.1 }, landscape: { fontSize: 48, fontWeight: 600, lineHeight: 1.08 } },
      mac: { fontSize: 56, fontWeight: 600, lineHeight: 1.07 },
    },
    sectionCardTitle: {
      phone: { sectionFontSize: 28, cardFontSize: 21, fontWeight: 600 },
      pad: { sectionFontSize: 32, cardFontSize: 21, fontWeight: 600 },
      mac: { sectionFontSize: 40, cardFontSize: 24, fontWeight: 600 },
    },
    gutter: {
      phone: 20,
      pad: { portrait: 32, landscape: 48 },
      mac: { default: 48, atContentMax: 80 },
    },
    auctionCardGap: { phone: 12, pad: 17, mac: 17 },
  });

  // Korean/CJK chrome never uses negative tracking. Latin SF retains its own
  // native negative tracking; CJK roles are neutral and wrap naturally.
  const KOREAN_TYPE = Object.freeze({
    tracking: 0,
    wordBreak: "keep-all",
    overflowWrap: "anywhere",
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
    ...Object.values(CARD_BOUNDARY),
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
    CARD_BOUNDARY,
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
    CONTAINER_TIERS,
    DEVICE_TABLE,
    KOREAN_TYPE,
    APPLE_SPEC,
    SHADOWS,
    CANONICAL_COLORS,
    withAlpha,
    badgeBg,
  });

  // Shared accent tokens must resolve outside the App Shell too. The shell
  // defines --ke-* scoped to .prodigy-app-shell, so every other view fell back
  // to Obsidian's theme accent (--text-accent / --interactive-accent) and
  // rendered the user's theme color instead of the canonical Apple system blue.
  // Installing the accent family on :root makes one blue resolve in every view.
  function installSharedAccentTokens() {
    if (typeof document === "undefined" || !document.head || typeof document.createElement !== "function") return;
    const styleId = "prodigy-shared-accent-tokens";
    if (document.getElementById(styleId)) return;
    const style = document.createElement("style");
    style.id = styleId;
    style.textContent = [
      ":root{",
      "--ke-color-accent:" + ACCENTS.action + ";",
      "--ke-color-interactive:" + ACCENTS.action + ";",
      "--ke-color-interactive-dark:" + ACCENTS.onDark + ";",
      "--ke-color-on-interactive:" + SEMANTIC_COLORS.onAction + ";",
      "}"
    ].join("");
    document.head.appendChild(style);
  }
  installSharedAccentTokens();

  root.ProdigyTokens = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
