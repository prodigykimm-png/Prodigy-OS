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

function freshTokens() {
  delete require.cache[require.resolve(TOKENS_PATH)];
  return require(TOKENS_PATH);
}

const EXPECTED_ACCENTS = Object.freeze({
  action: "#007aff",
  focus: "#007aff",
  onDark: "#0a84ff",
});

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

test("alpha identity, Action Blue trio, and Obsidian semantic fallbacks are exact", () => {
  const api = freshTokens();
  assert.equal(api.VERSION, "alpha");
  assert.equal(api.NAME, "Apple-design-analysis");
  assert.deepEqual(api.ACCENTS, EXPECTED_ACCENTS);
  assert.equal(new Set(Object.values(api.ACCENTS)).size, 2);
  assert.deepEqual(api.SEMANTIC_COLORS, {
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
    action: "#007aff",
    focus: "#007aff",
    actionOnDark: "#0a84ff",
    onAction: "#ffffff",
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

test("canonical spacing, radii, typography, controls, imagery, and breakpoint contracts are exact", () => {
  const api = freshTokens();
  assert.deepEqual(api.SPACE_SCALE, EXPECTED_SPACING);
  assert.deepEqual(api.RADII, EXPECTED_RADII);
  assert.deepEqual(api.RESPONSIVE_BREAKPOINTS, EXPECTED_RESPONSIVE);
  for (const [name, tuple] of Object.entries(TYPE_CASES)) assert.deepEqual(typographyTuple(api.TYPE_SCALE[name]), tuple, name);
  assert.deepEqual(api.SPACING, { xs: 2, sm: 4, md: 8, lg: 12, xl: 16 }, "untouched domain spacing compatibility");
  assert.deepEqual(api.CONTROL_HEIGHTS, { native: 44, input: 44, icon: 44, touchTarget: 44, workspaceBar: 64, actionBar: 52, mobileToolbar: 56 });
  assert.deepEqual(api.SHADOWS, { none: "none", sm: "none", md: "none", lg: "none", xl: "none", card: "none", overlay: "none", backdrop: "none", image: "rgba(0, 0, 0, 0.22) 3px 5px 30px 0" });
  assert.equal(api.BREAKPOINTS.medium, 768, "untouched domain layout compatibility");
  assert.equal(api.BREAKPOINTS.wide, 1024, "untouched domain layout compatibility");
});

test("alpha and color inputs fail closed and canonical colors emit valid bounded color-mix", () => {
  const api = freshTokens();
  for (const [alpha, percent] of [[0, "0%"], [0.25, "25%"], [1, "100%"], [-1, "0%"], [2, "100%"]]) {
    assert.equal(api.withAlpha(api.SEMANTIC_COLORS.action, alpha), `color-mix(in srgb, #007aff ${percent}, transparent)`);
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
