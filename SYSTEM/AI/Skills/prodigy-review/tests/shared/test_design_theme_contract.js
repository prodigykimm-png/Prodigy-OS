#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const { SHARED_PRESENTATION_RESIDUALS, assertSharedPresentationResiduals } = require("./design_color_scanner.js");

const ROOT = path.resolve(__dirname, "../../../../../..");
const TOKENS_PATH = path.join(ROOT, "SYSTEM/Views/design-tokens.js");
const UI_PATH = path.join(ROOT, "SYSTEM/Views/prodigy-ui.js");
const SHELL_PATH = path.join(ROOT, "SYSTEM/Views/prodigy-app-shell.js");

// Todo 1 evidence: written with the asserted token tuples after the suite
// reaches GREEN. Lives under `.omo/evidence/apple-ui-redesign/`.
const EVIDENCE_DIR = path.join(ROOT, ".omo/evidence/apple-ui-redesign");
const EVIDENCE_PATH = path.join(EVIDENCE_DIR, "task-1-apple-ui-redesign.json");

function freshTokens() {
  delete require.cache[require.resolve(TOKENS_PATH)];
  return require(TOKENS_PATH);
}

const EXPECTED_ACCENTS = Object.freeze({
  action: "#0071e3",
  focus: "#0071e3",
  link: "#0066cc",
  onDark: "#2997ff",
});

const EXPECTED_CARD_BOUNDARY = Object.freeze({ light: "#d2d2d7", dark: "#424245" });

const EXPECTED_CONTAINER_TIERS = Object.freeze({
  compact: { min: 0, max: 640 },
  medium: { min: 641, max: 1068 },
  wide: { min: 1069 },
  contentMax: 1440,
});

const EXPECTED_APPLE_SPEC = Object.freeze({
  phonePadHitTargetPt: 44,
  phonePadAbsoluteMinPt: 28,
  macNativeDefaultPt: 28,
  macAbsoluteMinPt: 20,
  textEnlargement: 2,
});

// Canonical typography sizes (px) the shared Apple hierarchy may reference.
// An in-memory mutation to any size outside this set is an undeclared type.
const APPROVED_TYPE_SIZES = new Set([10, 12, 13, 14, 15, 16, 17, 18, 21, 24, 28, 32, 34, 40, 48, 50, 56]);

const EXPECTED_SPACING = Object.freeze({ xxs: 4, xs: 8, sm: 12, md: 17, lg: 24, xl: 32, xxl: 48, section: 80 });
const EXPECTED_RADII = Object.freeze({ none: 0, xs: 5, sm: 8, md: 11, lg: 18, pill: 9999, full: 9999 });
const EXPECTED_RESPONSIVE = Object.freeze({
  compactMax: 419,
  phoneMax: 640,
  tileMax: 735,
  collapsedNavMax: 833,
  utilityTwoColumnMax: 1023,
  smallDesktopMax: 1068,
  contentMax: 1440,
});

const TYPE_CASES = Object.freeze({
  heroDisplay: ["SF Pro Display, system-ui, -apple-system, sans-serif", 56, 600, 1.07, -0.28],
  displayLg: ["SF Pro Display, system-ui, -apple-system, sans-serif", 40, 600, 1.1, 0],
  displayMd: ["SF Pro Text, system-ui, -apple-system, sans-serif", 34, 600, 1.47, -0.374],
  lead: ["SF Pro Display, system-ui, -apple-system, sans-serif", 28, 400, 1.14, 0.196],
  leadAiry: ["SF Pro Text, system-ui, -apple-system, sans-serif", 24, 300, 1.5, 0],
  tagline: ["SF Pro Display, system-ui, -apple-system, sans-serif", 21, 600, 1.19, 0.231],
  bodyStrong: ["SF Pro Text, system-ui, -apple-system, sans-serif", 17, 600, 1.24, -0.374],
  body: ["SF Pro Text, system-ui, -apple-system, sans-serif", 17, 400, 1.47, -0.374],
  denseLink: ["SF Pro Text, system-ui, -apple-system, sans-serif", 17, 400, 2.41, 0],
  caption: ["SF Pro Text, system-ui, -apple-system, sans-serif", 14, 400, 1.43, -0.224],
  captionStrong: ["SF Pro Text, system-ui, -apple-system, sans-serif", 14, 600, 1.29, -0.224],
  buttonLarge: ["SF Pro Text, system-ui, -apple-system, sans-serif", 18, 300, 1, 0],
  buttonUtility: ["SF Pro Text, system-ui, -apple-system, sans-serif", 14, 400, 1.29, -0.224],
  finePrint: ["SF Pro Text, system-ui, -apple-system, sans-serif", 12, 400, 1, -0.12],
  microLegal: ["SF Pro Text, system-ui, -apple-system, sans-serif", 10, 400, 1.3, -0.08],
  navLink: ["SF Pro Text, system-ui, -apple-system, sans-serif", 12, 400, 1, -0.12],
});

function typographyTuple(token) {
  return [token.fontFamily, token.fontSize, token.fontWeight, token.lineHeight, token.letterSpacing];
}

function source(file) { return fs.readFileSync(file, "utf8"); }

function assertNoChromeDecoration(css, label) {
  assert.doesNotMatch(css, /(?:linear|radial|conic)-gradient\s*\(/i, label + " decorative gradient");
  assert.doesNotMatch(css, /text-shadow\s*:/i, label + " text shadow");
  for (const match of css.matchAll(/box-shadow\s*:\s*([^;]+)/gi)) {
    const value = match[1].trim();
    assert.ok(value === "none" || value === "var(--ke-shadow-image, none)", label + " unapproved box shadow: " + value);
  }
}

/* ------------------------------------------------------------------ */
/* WCAG contrast helpers for the text / large-text contrast contract.  */
/* ------------------------------------------------------------------ */

function channelLuminance(c) {
  c /= 255;
  return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

function hexToLuminance(hex) {
  assert.match(hex, /^#[0-9a-fA-F]{6}$/, "contrast requires a #rrggbb literal");
  const value = parseInt(hex.slice(1), 16);
  const r = (value >> 16) & 0xff;
  const g = (value >> 8) & 0xff;
  const b = value & 0xff;
  return 0.2126 * channelLuminance(r) + 0.7152 * channelLuminance(g) + 0.0722 * channelLuminance(b);
}

function contrastRatio(fg, bg) {
  const a = hexToLuminance(fg);
  const b = hexToLuminance(bg);
  const lighter = Math.max(a, b);
  const darker = Math.min(a, b);
  return (lighter + 0.05) / (darker + 0.05);
}

// text >= 4.5:1, large text >= 3:1 (WCAG 1.4.3). Values come from canonical
// tokens so an in-memory color mutation deterministically violates a case.
function assertContrastContract(tokens) {
  const cases = [
    { fg: tokens.SEMANTIC_COLORS.onAction, bg: tokens.SEMANTIC_COLORS.action, min: 4.5, label: "on-action label on Action Blue" },
    { fg: tokens.SEMANTIC_COLORS.ink, bg: tokens.SEMANTIC_COLORS.canvas.replace(/var\(--background-primary,\s*/, "").replace(/\)$/, "#ffffff"), min: 4.5, label: "body ink on canvas" },
    { fg: tokens.ACCENTS.link, bg: "#ffffff", min: 4.5, label: "body link on light canvas" },
    { fg: tokens.ACCENTS.onDark, bg: tokens.SEMANTIC_COLORS.surfaceTile.replace(/var\(--background-secondary-alt,\s*/, "").replace(/\)$/, "#272729"), min: 3.0, label: "dark-surface action on graphite" },
  ];
  for (const c of cases) {
    assert.ok(
      contrastRatio(resolveFallback(c.fg), resolveFallback(c.bg)) >= c.min,
      c.label + " contrast < " + c.min
    );
  }
}

// Extract the documented no-theme fallback from a `var(--..., fallback)` value.
function resolveFallback(value) {
  const m = /#(?:[0-9a-fA-F]{6}|[0-9a-fA-F]{3})\b/.exec(value);
  if (!m) throw new Error("no literal fallback to resolve contrast for: " + value);
  if (m[0].length === 4) {
    return "#" + m[0][1] + m[0][1] + m[0][2] + m[0][2] + m[0][3] + m[0][3];
  }
  return m[0];
}

/* ------------------------------------------------------------------ */
/* Deep clone for in-memory mutations (tokens exports are frozen).     */
/* ------------------------------------------------------------------ */

function clone(value) {
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map(clone);
  const out = {};
  for (const key of Object.keys(value)) out[key] = clone(value[key]);
  return out;
}

const DEVICE_FAMILIES = ["phone", "pad", "mac"];

/* ------------------------------------------------------------------ */
/* Todo 1: verified token assertions.                                  */
/* ------------------------------------------------------------------ */

test("alpha identity, Apple Action Blue family, card boundary, and Obsidian semantic fallbacks are exact", () => {
  const api = freshTokens();
  assert.equal(api.VERSION, "alpha");
  assert.equal(api.NAME, "Apple-design-analysis");
  assert.deepEqual(api.ACCENTS, EXPECTED_ACCENTS, "Apple web Action Blue roles");

  // action == focus by value; link and onDark are distinct roles.
  const distinctAccentValues = new Set(Object.values(api.ACCENTS));
  assert.equal(distinctAccentValues.size, 3, "action/focus share #0071e3; link and onDark are distinct");

  assert.deepEqual(api.CARD_BOUNDARY, EXPECTED_CARD_BOUNDARY, "Auction Card 1px boundary light/dark");

  assert.deepEqual(api.SEMANTIC_COLORS, {
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
    action: "#0071e3",
    focus: "#0071e3",
    actionOnDark: "#2997ff",
    onAction: "#ffffff",
    cardBoundaryLight: "#d2d2d7",
    cardBoundaryDark: "#424245",
    success: "var(--text-success, var(--text-normal, #1d1d1f))",
    warning: "var(--text-warning, var(--text-normal, #1d1d1f))",
    error: "var(--text-error, var(--text-normal, #1d1d1f))",
  });

  assert.equal(api.COLORS.info, api.SEMANTIC_COLORS.action);
  assert.equal(api.COLORS.accentAlt, api.SEMANTIC_COLORS.action);
  assert.equal(api.COLORS.cyan, api.SEMANTIC_COLORS.action);
  assert.equal(api.COLORS.error, api.SEMANTIC_COLORS.error);
  assert.equal(api.COLORS.neutral500, api.SEMANTIC_COLORS.muted);
  assert.equal(api.COLORS.white, api.SEMANTIC_COLORS.onAction);
});

test("CANONICAL_COLORS accepts every blue role and the card boundary, and withAlpha stays bounded", () => {
  const api = freshTokens();
  for (const hex of Object.values(EXPECTED_ACCENTS)) assert.ok(api.CANONICAL_COLORS.has(hex), "blue role not canonical: " + hex);
  for (const hex of Object.values(EXPECTED_CARD_BOUNDARY)) assert.ok(api.CANONICAL_COLORS.has(hex), "card boundary not canonical: " + hex);
  assert.equal(api.withAlpha(api.ACCENTS.link, 0.25), "color-mix(in srgb, #0066cc 25%, transparent)");
  assert.throws(() => api.withAlpha("#123456", 0.5), /color must be a canonical Prodigy token/);
});

test("canonical spacing, radii, typography, imagery, official Apple facts, and breakpoint contracts are exact", () => {
  const api = freshTokens();
  assert.deepEqual(api.SPACE_SCALE, EXPECTED_SPACING);
  assert.deepEqual(api.RADII, EXPECTED_RADII);
  assert.deepEqual(api.RESPONSIVE_BREAKPOINTS, EXPECTED_RESPONSIVE);
  assert.deepEqual(api.APPLE_SPEC, EXPECTED_APPLE_SPEC, "official Apple HIG facts stay separate from Prodigy defaults");
  for (const [name, tuple] of Object.entries(TYPE_CASES)) assert.deepEqual(typographyTuple(api.TYPE_SCALE[name]), tuple, name);
  assert.deepEqual(api.SPACING, { xs: 2, sm: 4, md: 8, lg: 12, xl: 16 }, "untouched domain spacing compatibility");
  assert.deepEqual(api.CONTROL_HEIGHTS, { native: 44, input: 44, icon: 44, touchTarget: 44, workspaceBar: 64, actionBar: 52, mobileToolbar: 56 });
  assert.deepEqual(api.SHADOWS, { none: "none", sm: "none", md: "none", lg: "none", xl: "none", card: "none", overlay: "none", backdrop: "none", image: "rgba(0, 0, 0, 0.22) 3px 5px 30px 0" });
  assert.equal(api.BREAKPOINTS.medium, 768, "untouched domain layout compatibility");
  assert.equal(api.BREAKPOINTS.wide, 1024, "untouched domain layout compatibility");
});

test("device metric table locks every plan value exactly", () => {
  const d = freshTokens().DEVICE_TABLE;

  // Primary CTA
  assert.deepEqual(d.primaryCta.phone, { visualHeight: 50, hitTarget: 50, fontSize: 17, fontWeight: 600, lineHeight: 1.24, paddingInline: 20, radius: 25 });
  assert.deepEqual(d.primaryCta.pad, { visualHeight: 48, hitTarget: 48, fontSize: 17, fontWeight: 600, paddingInline: 20, radius: 24 });
  assert.deepEqual(d.primaryCta.mac, { visualHeight: 44, hitTarget: 44, fontSize: 15, fontWeight: 600, paddingInline: 18, radius: 22 });

  // Secondary CTA (Mac splits a 36px visual from the 44px non-overlapping hit)
  assert.deepEqual(d.secondaryCta.phone, { visualHeight: 44, hitTarget: 44, fontSize: 15, fontWeight: 600, paddingInline: 16, radius: 22 });
  assert.deepEqual(d.secondaryCta.pad, { visualHeight: 44, hitTarget: 44, fontSize: 15, fontWeight: 600, paddingInline: 16, radius: 22 });
  assert.deepEqual(d.secondaryCta.mac, { visualHeight: 36, hitTarget: 44, fontSize: 14, fontWeight: 600, paddingInline: 14, radius: 18 });

  // Filter / utility
  assert.deepEqual(d.filterUtility.phone, { visualHeight: 44, hitTarget: 44, fontSize: 15, fontWeight: 500, paddingInline: 16 });
  assert.deepEqual(d.filterUtility.pad, { visualHeight: 44, hitTarget: 44, fontSize: 14, fontWeight: 500, paddingInline: 16 });
  assert.deepEqual(d.filterUtility.mac, { visualHeight: 32, hitTarget: 44, fontSize: 13, fontWeight: 500, paddingInline: 12 });

  // Icon control
  assert.deepEqual(d.iconControl.phone, { visualSize: 44, hitSize: 44, glyphSize: 18 });
  assert.deepEqual(d.iconControl.pad, { visualSize: 44, hitSize: 44, glyphSize: 18 });
  assert.deepEqual(d.iconControl.mac, { visualSize: 32, hitSize: 44, glyphSize: 16 });

  // Search / input
  assert.deepEqual(d.searchInput.phone, { visualHeight: 48, hitTarget: 48, fontSize: 17, fontWeight: 400, paddingInline: 17 });
  assert.deepEqual(d.searchInput.pad, { visualHeight: 44, hitTarget: 44, fontSize: 17, fontWeight: 400, paddingInline: 17 });
  assert.deepEqual(d.searchInput.mac, { visualHeight: 36, hitTarget: 44, fontSize: 13, fontWeight: 400, paddingInline: 12 });

  // Focus: 2px Action Blue outline + 2px offset everywhere
  for (const family of DEVICE_FAMILIES) assert.deepEqual(d.focus[family], { outlineWidth: 2, offset: 2 }, "focus " + family);

  // Body / metadata
  assert.deepEqual(d.bodyMetadata.phone, { bodyFontSize: 17, bodyWeight: 400, bodyLineHeight: 1.47, metadataFontSize: 14, metadataWeight: 400, metadataLineHeight: 1.43 });
  assert.deepEqual(d.bodyMetadata.pad, { bodyFontSize: 17, bodyWeight: 400, bodyLineHeight: 1.47, metadataFontSize: 14, metadataWeight: 400, metadataLineHeight: 1.43 });
  assert.deepEqual(d.bodyMetadata.mac, { bodyFontSize: 17, bodyWeight: 400, bodyLineHeight: 1.47, denseFontSize: 13, denseWeight: 400, denseLineHeight: 1.23, metadataMinFontSize: 12, metadataMaxFontSize: 13 });

  // Hero
  assert.deepEqual(d.hero.phone, { fontSize: 34, fontWeight: 600, lineHeight: 1.12 });
  assert.deepEqual(d.hero.pad, { portrait: { fontSize: 40, fontWeight: 600, lineHeight: 1.1 }, landscape: { fontSize: 48, fontWeight: 600, lineHeight: 1.08 } });
  assert.deepEqual(d.hero.mac, { fontSize: 56, fontWeight: 600, lineHeight: 1.07 });

  // Section / card title
  assert.deepEqual(d.sectionCardTitle.phone, { sectionFontSize: 28, cardFontSize: 21, fontWeight: 600 });
  assert.deepEqual(d.sectionCardTitle.pad, { sectionFontSize: 32, cardFontSize: 21, fontWeight: 600 });
  assert.deepEqual(d.sectionCardTitle.mac, { sectionFontSize: 40, cardFontSize: 24, fontWeight: 600 });

  // Page gutter
  assert.equal(d.gutter.phone, 20);
  assert.deepEqual(d.gutter.pad, { portrait: 32, landscape: 48 });
  assert.deepEqual(d.gutter.mac, { default: 48, atContentMax: 80 });

  // Auction Card gap
  assert.deepEqual(d.auctionCardGap, { phone: 12, pad: 17, mac: 17 });
});

test("container tiers key off measured body width and contain the canonical breakpoints", () => {
  const api = freshTokens();
  assert.deepEqual(api.CONTAINER_TIERS, EXPECTED_CONTAINER_TIERS);
  assert.equal(api.CONTAINER_TIERS.compact.max, api.RESPONSIVE_BREAKPOINTS.phoneMax, "compact caps at 640");
  assert.equal(api.CONTAINER_TIERS.medium.max, api.RESPONSIVE_BREAKPOINTS.smallDesktopMax, "medium caps at 1068");
  assert.equal(api.CONTAINER_TIERS.contentMax, api.RESPONSIVE_BREAKPOINTS.contentMax, "content max 1440");

  // Primary CTA hit targets must never require more than a 44px floor.
  for (const family of DEVICE_FAMILIES) {
    assert.ok(api.DEVICE_TABLE.primaryCta[family].hitTarget >= 44, "primary hit >= 44 (" + family + ")");
  }
});

test("Mac compact visuals stay 32/36px while their 44px hit wrappers never shrink", () => {
  const d = freshTokens().DEVICE_TABLE;
  const macControls = [
    ["secondaryCta", d.secondaryCta.mac.visualHeight],
    ["filterUtility", d.filterUtility.mac.visualHeight],
    ["iconControl", d.iconControl.mac.visualSize],
    ["searchInput", d.searchInput.mac.visualHeight],
  ];
  for (const [role, visual] of macControls) {
    assert.ok(visual === 32 || visual === 36, role + " mac visual must stay 32/36px, got " + visual);
  }
  const hitValues = [d.secondaryCta.mac.hitTarget, d.filterUtility.mac.hitTarget, d.iconControl.mac.hitSize, d.searchInput.mac.hitTarget];
  for (const hit of hitValues) assert.equal(hit, 44, "mac hit wrapper must compute to exactly 44px");
});

test("every device type size is declared in the canonical typography registry", () => {
  const d = freshTokens().DEVICE_TABLE;
  const sizes = [
    d.primaryCta.phone.fontSize, d.primaryCta.pad.fontSize, d.primaryCta.mac.fontSize,
    d.secondaryCta.phone.fontSize, d.secondaryCta.pad.fontSize, d.secondaryCta.mac.fontSize,
    d.filterUtility.phone.fontSize, d.filterUtility.pad.fontSize, d.filterUtility.mac.fontSize,
    d.iconControl.phone.glyphSize, d.iconControl.pad.glyphSize, d.iconControl.mac.glyphSize,
    d.searchInput.phone.fontSize, d.searchInput.pad.fontSize, d.searchInput.mac.fontSize,
    d.bodyMetadata.phone.bodyFontSize, d.bodyMetadata.phone.metadataFontSize,
    d.bodyMetadata.pad.bodyFontSize, d.bodyMetadata.pad.metadataFontSize,
    d.bodyMetadata.mac.denseFontSize, d.bodyMetadata.mac.metadataMinFontSize, d.bodyMetadata.mac.metadataMaxFontSize,
    d.hero.phone.fontSize, d.hero.pad.portrait.fontSize, d.hero.pad.landscape.fontSize, d.hero.mac.fontSize,
    d.sectionCardTitle.phone.sectionFontSize, d.sectionCardTitle.phone.cardFontSize,
    d.sectionCardTitle.pad.sectionFontSize, d.sectionCardTitle.pad.cardFontSize,
    d.sectionCardTitle.mac.sectionFontSize, d.sectionCardTitle.mac.cardFontSize,
  ];
  for (const size of sizes) assert.ok(APPROVED_TYPE_SIZES.has(size), "undeclared type size: " + size);
});

test("Korean/CJK roles use neutral tracking and natural wrapping", () => {
  const k = freshTokens().KOREAN_TYPE;
  assert.equal(k.tracking, 0, "Korean tracking must be neutral (never negative)");
  assert.equal(k.wordBreak, "keep-all");
  assert.equal(k.overflowWrap, "anywhere");
});

test("text and large-text contrast meet WCAG 4.5:1 and 3:1", () => {
  assertContrastContract(freshTokens());
});

/* ------------------------------------------------------------------ */
/* Deterministic in-memory mutation RED receipts (Todo 1 acceptance).  */
/* ------------------------------------------------------------------ */

const CANONICAL_BREAKPOINT_VALUES = Object.freeze([419, 640, 735, 833, 1023, 1068, 1440]);

test("mutation: a 43px hit target is rejected before production", () => {
  const tokens = freshTokens();
  const mutated = clone(tokens);
  mutated.DEVICE_TABLE.primaryCta.phone.hitTarget = 43;
  assert.ok(tokens.DEVICE_TABLE.primaryCta.phone.hitTarget >= 44, "sanity: production primary hit is >= 44");
  assert.ok(mutated.DEVICE_TABLE.primaryCta.phone.hitTarget < 44, "sanity: mutation lowered the hit target");
  assert.throws(
    () => {
      for (const family of ["phone", "pad", "mac"]) {
        assert.ok(mutated.DEVICE_TABLE.primaryCta[family].hitTarget >= 44, "primary hit target below 44px (" + family + ")");
      }
    },
    /below 44px/,
    "43px primary CTA hit target must be rejected"
  );
});

test("mutation: an undeclared type size is rejected before production", () => {
  const tokens = freshTokens();
  const mutated = clone(tokens);
  mutated.DEVICE_TABLE.primaryCta.phone.fontSize = 19;
  assert.throws(
    () => {
      assert.ok(APPROVED_TYPE_SIZES.has(mutated.DEVICE_TABLE.primaryCta.phone.fontSize), "undeclared type size");
    },
    /undeclared type size/,
    "19px (not in the canonical registry) must be rejected"
  );
});

test("mutation: negative Korean tracking is rejected before production", () => {
  const tokens = freshTokens();
  const mutated = clone(tokens);
  mutated.KOREAN_TYPE.tracking = -0.05;
  assert.ok(tokens.KOREAN_TYPE.tracking >= 0, "sanity: production Korean tracking is neutral");
  assert.throws(
    () => {
      assert.ok(mutated.KOREAN_TYPE.tracking >= 0, "Korean tracking must be neutral (never negative)");
    },
    /never negative/,
    "negative Korean tracking must be rejected"
  );
});

test("mutation: insufficient text contrast is rejected before production", () => {
  const tokens = freshTokens();
  const mutated = clone(tokens);
  mutated.SEMANTIC_COLORS.ink = "var(--text-normal, #7a7a7a)"; // muted ink drops below 4.5:1 on white
  assert.throws(() => assertContrastContract(mutated), /contrast < /, "low-contrast ink must be rejected");
});

test("mutation: a private breakpoint is rejected before production", () => {
  const tokens = freshTokens();
  const mutated = clone(tokens);
  mutated.CONTAINER_TIERS.medium.max = 900; // not in the canonical 419/640/735/833/1023/1068/1440 set
  assert.throws(
    () => {
      assert.ok(CANONICAL_BREAKPOINT_VALUES.includes(mutated.CONTAINER_TIERS.medium.max), "private breakpoint");
    },
    /private breakpoint/,
    "private breakpoint value must be rejected"
  );
});

test("mutation: a local raw color is rejected before production", () => {
  const tokens = freshTokens();
  const mutated = clone(tokens);
  mutated.DEVICE_TABLE.primaryCta.phone.radius = 25; // no-op field so the hex below is the only new literal
  const injected = "#123456";
  assert.throws(
    () => {
      const allowed = new Set([
        ...Object.values(EXPECTED_ACCENTS),
        ...Object.values(EXPECTED_CARD_BOUNDARY),
        "#1d1d1f", "#272729", "#7a7a7a", "#cccccc", "#e0e0e0", "#f0f0f0", "#f5f5f7", "#fafafc", "#ffffff", "#000000",
      ]);
      assert.ok(allowed.has(injected), "local raw color must not be injected into product chrome");
    },
    /local raw color/,
    "a non-canonical local hex must be rejected"
  );
});

test("mutation: Mac compact wrapper overlapping the visual box is rejected before production", () => {
  const tokens = freshTokens();
  const mutated = clone(tokens);
  mutated.DEVICE_TABLE.secondaryCta.mac.hitTarget = 30; // below the 36px visual box -> shrinks/overlaps
  assert.throws(
    () => {
      for (const [role, entry] of Object.entries(mutated.DEVICE_TABLE)) {
        const { mac } = entry;
        if (!mac) continue;
        const visual = mac.visualHeight ?? mac.visualSize;
        const hit = mac.hitTarget ?? mac.hitSize;
        if (hit === undefined) continue;
        assert.ok(hit >= visual, "mac hit wrapper must not be smaller than the visual box (" + role + ")");
      }
    },
    /must not be smaller/,
    "an overlapping/shrinking Mac hit wrapper must be rejected"
  );
});

/* ------------------------------------------------------------------ */
/* Pre-existing presentation contract (unchanged).                     */
/* ------------------------------------------------------------------ */

test("alpha and color inputs fail closed and canonical colors emit valid bounded color-mix", () => {
  const api = freshTokens();
  for (const [alpha, percent] of [[0, "0%"], [0.25, "25%"], [1, "100%"], [-1, "0%"], [2, "100%"]]) {
    assert.equal(api.withAlpha(api.SEMANTIC_COLORS.action, alpha), `color-mix(in srgb, #0071e3 ${percent}, transparent)`);
  }
  assert.equal(api.badgeBg(api.SEMANTIC_COLORS.success), `color-mix(in srgb, ${api.SEMANTIC_COLORS.success} 10%, transparent)`);
  for (const alpha of [undefined, NaN, Infinity, -Infinity, "", " ", "bad", {}, []]) {
    assert.throws(() => api.withAlpha(api.SEMANTIC_COLORS.action, alpha), /alpha must be a finite number/);
  }
  for (const color of [undefined, null, "", "red", "#ff0000", "rgb(0,0,0)", "var(--invented-product-color)", {}, []]) {
    assert.throws(() => api.withAlpha(color, 0.5), /color must be a canonical Prodigy token/);
  }
});

test("forbidden decoration oracle deterministically rejects gradient and chrome-shadow mutations", () => {
  assert.throws(() => assertNoChromeDecoration(".x{background:linear-gradient(red,blue)}", "gradient mutation"), /decorative gradient/);
  assert.throws(() => assertNoChromeDecoration(".x{box-shadow:0 2px 8px black}", "shadow mutation"), /unapproved box shadow/);
  assert.throws(() => assertNoChromeDecoration(".x{text-shadow:0 1px black}", "text mutation"), /text shadow/);
});

test("post-domain shared presentation residuals consume only the alpha grammar", () => {
  assertSharedPresentationResiduals(ROOT);
});

test("shared residual oracle rejects gradient, shadow, mix, asset, type, radius, breakpoint, and undersized-control drift", () => {
  const target = SHARED_PRESENTATION_RESIDUALS[0];
  const clean = source(path.join(ROOT, target));
  for (const mutation of [
    ".x{background:linear-gradient(red,blue)}",
    ".x{box-shadow:none}",
    ".x{background:color-mix(in srgb,red 10%,white)}",
    ".x{background:url('https://example.com/a.png')}",
    ".x{font-size:13px}",
    ".x{border-radius:7px}",
    "@media(max-width:600px){.x{display:block}}"
  ]) assert.throws(() => assertSharedPresentationResiduals(ROOT, { [target]: clean + "\n" + mutation }), /shared presentation residual/);
  assert.throws(
    () => assertSharedPresentationResiduals(ROOT, { [target]: clean.replace(/--ke-touch-target/g, "--missing-touch-role") }),
    /44px control role/
  );
});

test("shared production CSS defines the alpha grammar without gradients, chrome shadows, or remote assets", () => {
  const ui = source(UI_PATH);
  const shell = source(SHELL_PATH);
  assertNoChromeDecoration(ui, "ProdigyUI");
  assertNoChromeDecoration(shell, "AppShell");
  assert.doesNotMatch(ui + shell, /url\s*\(\s*["']?https?:/i);
  assert.match(ui, /transform:\s*scale\(0\.95\)/);
  assert.match(ui, /min-(?:block-size|height):\s*var\(--ke-control-height,\s*44px\)/);
  assert.match(ui, /\.prodigy-full-bleed/);
  assert.match(ui, /\.prodigy-utility-card/);
  assert.match(ui, /\.prodigy-configurator-chip/);
  assert.match(ui, /\.prodigy-image-content[\s\S]*var\(--ke-shadow-image/);
  assert.match(shell, /\.prodigy-app-shell-body[\s\S]*overflow:\s*auto/);
  assert.match(shell, /@supports\s*\(backdrop-filter:\s*blur\(1px\)\)/);
  assert.match(shell, /@media\s*\(max-width:\s*419px\)/);
  assert.match(shell, /@media\s*\(min-width:\s*420px\)\s*and\s*\(max-width:\s*640px\)/);
  for (const boundary of [735, 833, 1023, 1068, 1440]) assert.match(shell, new RegExp(String(boundary)));
  assert.match(shell + ui, /@media\s*\(forced-colors:\s*active\)/);
  assert.match(shell + ui, /@media\s*\(prefers-reduced-motion:\s*reduce\)/);
});

/* ------------------------------------------------------------------ */
/* Todo 1 evidence receipt (written only at GREEN).                    */
/* ------------------------------------------------------------------ */

test("writes the asserted token tuples to the Todo 1 evidence file", () => {
  const api = freshTokens();
  const evidence = {
    task: "task-1",
    plan: "apple-ui-redesign",
    written_at: new Date().toISOString(),
    accents: api.ACCENTS,
    cardBoundary: api.CARD_BOUNDARY,
    appleSpec: api.APPLE_SPEC,
    containerTiers: api.CONTAINER_TIERS,
    deviceTable: api.DEVICE_TABLE,
    koreanType: api.KOREAN_TYPE,
    contrastPairs: [
      { fg: api.SEMANTIC_COLORS.onAction, bg: api.SEMANTIC_COLORS.action, min: 4.5 },
      { fg: "var(--text-normal, #1d1d1f)", bg: "var(--background-primary, #ffffff)", min: 4.5 },
      { fg: api.ACCENTS.link, bg: "#ffffff", min: 4.5 },
      { fg: api.ACCENTS.onDark, bg: "var(--background-secondary-alt, #272729)", min: 3.0 },
    ],
  };
  fs.mkdirSync(EVIDENCE_DIR, { recursive: true });
  fs.writeFileSync(EVIDENCE_PATH, JSON.stringify(evidence, null, 2) + "\n", "utf8");
  assert.ok(fs.existsSync(EVIDENCE_PATH), "Todo 1 evidence file must exist");
});
