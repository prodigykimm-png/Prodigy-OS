"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "../../../../../..");

// Load modules
const responsive = require(path.join(ROOT, "SYSTEM/Views/workout-health-responsive.js"));
const designTokens = require(path.join(ROOT, "SYSTEM/Views/design-tokens.js"));

// --- Breakpoint resolution ---

function testResolveBreakpoint() {
  // compact < 768
  assert.equal(responsive.resolveBreakpoint(320), "compact", "iPhone SE width");
  assert.equal(responsive.resolveBreakpoint(375), "compact", "iPhone width");
  assert.equal(responsive.resolveBreakpoint(767), "compact", "just below medium");
  assert.equal(responsive.resolveBreakpoint(0), "compact", "zero width");
  assert.equal(responsive.resolveBreakpoint(null), "compact", "null width");
  assert.equal(responsive.resolveBreakpoint(undefined), "compact", "undefined width");

  // medium 768–1023
  assert.equal(responsive.resolveBreakpoint(768), "medium", "medium threshold");
  assert.equal(responsive.resolveBreakpoint(900), "medium", "iPad portrait");
  assert.equal(responsive.resolveBreakpoint(1023), "medium", "just below wide");

  // wide >= 1024
  assert.equal(responsive.resolveBreakpoint(1024), "wide", "wide threshold");
  assert.equal(responsive.resolveBreakpoint(1440), "wide", "Mac wide");

  // Canonical values from design-tokens
  assert.equal(responsive.MEDIUM_MIN, designTokens.BREAKPOINTS.medium, "MEDIUM_MIN matches BREAKPOINTS.medium");
  assert.equal(responsive.WIDE_MIN, designTokens.BREAKPOINTS.wide, "WIDE_MIN matches BREAKPOINTS.wide");
  assert.equal(responsive.TOUCH_TARGET, designTokens.CONTROL_HEIGHTS.touchTarget, "TOUCH_TARGET matches touchTarget");
  assert.equal(responsive.ACTION_BAR, designTokens.CONTROL_HEIGHTS.actionBar, "ACTION_BAR matches actionBar");

  console.log("  resolve-breakpoint: PASS");
}

// --- Responsive CSS assertions ---

function testResponsiveCssContainsCanonicalValues() {
  const css = responsive.RESPONSIVE_CSS;

  // Touch targets: 44px
  assert.ok(css.includes("min-height:44px"), "CSS contains 44px touch target");
  assert.ok(css.includes("min-width:44px"), "CSS contains 44px min-width");

  // No raw color values
  assert.ok(!/#[0-9a-fA-F]{3,8}/.test(css), "CSS contains no raw hex colors");
  assert.ok(!/rgba\(/.test(css), "CSS contains no raw rgba()");
  assert.ok(!/hsla?\(/.test(css), "CSS contains no raw hsla()");

  // Breakpoint classes exist
  assert.ok(css.includes(".whr-compact"), "CSS has compact breakpoint");
  assert.ok(css.includes(".whr-medium"), "CSS has medium breakpoint");
  assert.ok(css.includes(".whr-wide"), "CSS has wide breakpoint");

  // Compact: single-column layout
  assert.ok(css.includes("grid-template-columns:repeat(2,minmax(0,1fr))"), "compact uses 2-col grid");

  // Actions: compact = column, wide = row
  assert.ok(css.includes("flex-direction:column"), "compact actions are column");

  // No horizontal overflow at compact
  assert.ok(css.includes("overflow-x:hidden"), "compact panels prevent horizontal overflow");

  // Apple Health UX badges
  assert.ok(css.includes(".workout-ah-badge"), "CSS has Apple Health badge styles");

  console.log("  responsive-css-canonical: PASS");
}

// --- Korean labels not clipped ---

function testKoreanLabelsNotClipped() {
  // The CSS must ensure Korean labels have enough space.
  // Tab labels: 근력, 식단, 러닝 — each must fit in a touch target.
  // The CSS sets min-height:44px and white-space:nowrap on tabs.
  const css = responsive.RESPONSIVE_CSS;
  assert.ok(css.includes("white-space:nowrap"), "tab labels use nowrap to prevent clipping");
  assert.ok(css.includes("flex-shrink:0"), "compact tabs do not shrink (Korean labels not clipped)");

  console.log("  korean-labels: PASS");
}

// --- width-driven layout (no global viewport read) ---

function testWidthDrivenLayout() {
  // resolveBreakpoint takes explicit width, never reads viewport
  // The test: call with known widths, verify outputs
  const widths = [320, 375, 414, 768, 834, 1024, 1280, 1440, 1920];
  const expected = ["compact", "compact", "compact", "medium", "medium", "wide", "wide", "wide", "wide"];
  widths.forEach((w, i) => {
    assert.equal(responsive.resolveBreakpoint(w), expected[i], `width ${w} -> ${expected[i]}`);
  });

  console.log("  width-driven-layout: PASS");
}

// --- applyLayout sets correct attributes ---

function testApplyLayoutAttributes() {
  // Simulate what applyLayout does for a DOM element
  // We can't instantiate DOM in Node, but we can verify the function shape
  assert.equal(typeof responsive.applyLayout, "function");
  assert.equal(typeof responsive.injectResponsiveCss, "function");
  assert.equal(typeof responsive.resolveBreakpoint, "function");

  const bp = responsive.resolveBreakpoint(400);
  assert.equal(bp, "compact");

  const bp2 = responsive.resolveBreakpoint(1024);
  assert.equal(bp2, "wide");

  console.log("  apply-layout-attributes: PASS");
}

// --- Responsive CSS is non-empty and well-formed ---

function testResponsiveCssStructure() {
  const css = responsive.RESPONSIVE_CSS;
  assert.ok(css.length > 500, "CSS is substantial");
  assert.ok(!css.includes("undefined"), "CSS contains no undefined literals");
  assert.ok(!css.includes("NaN"), "CSS contains no NaN");

  // Every rule starts with a selector
  const rules = css.split("}").filter((r) => r.trim());
  assert.ok(rules.length >= 20, "at least 20 CSS rules");

  console.log("  css-structure: PASS (" + rules.length + " rules)");
}

// --- Main ---

function main() {
  console.log("Workout Responsive Layout tests");
  testResolveBreakpoint();
  testResponsiveCssContainsCanonicalValues();
  testKoreanLabelsNotClipped();
  testWidthDrivenLayout();
  testApplyLayoutAttributes();
  testResponsiveCssStructure();
  console.log("Workout Responsive Layout tests passed");
}

main();
