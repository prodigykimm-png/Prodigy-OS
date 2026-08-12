"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "../../../../../..");

// Load modules
const responsive = require(path.join(ROOT, "SYSTEM/Views/workout-health-responsive.js"));
const designTokens = require(path.join(ROOT, "SYSTEM/Views/design-tokens.js"));

// --- Breakpoint resolution ---

function testResolveBreakpoint() {
  // Shared Apple tiers: compact through 419, utility through 1023.
  assert.equal(responsive.resolveBreakpoint(320), "compact", "small phone width");
  assert.equal(responsive.resolveBreakpoint(390), "compact", "requested phone width");
  assert.equal(responsive.resolveBreakpoint(419), "compact", "canonical compact maximum");
  assert.equal(responsive.resolveBreakpoint(0), "compact", "zero width");
  assert.equal(responsive.resolveBreakpoint(null), "compact", "null width");
  assert.equal(responsive.resolveBreakpoint(undefined), "compact", "undefined width");

  assert.equal(responsive.resolveBreakpoint(420), "medium", "shared medium threshold");
  assert.equal(responsive.resolveBreakpoint(834), "medium", "requested tablet width");
  assert.equal(responsive.resolveBreakpoint(1023), "medium", "canonical utility maximum");

  assert.equal(responsive.resolveBreakpoint(1024), "wide", "wide threshold");
  assert.equal(responsive.resolveBreakpoint(1068), "wide", "requested small desktop width");
  assert.equal(responsive.resolveBreakpoint(1440), "wide", "requested content maximum");

  assert.equal(responsive.COMPACT_MAX, designTokens.RESPONSIVE_BREAKPOINTS.compactMax);
  assert.equal(responsive.MEDIUM_MIN, designTokens.RESPONSIVE_BREAKPOINTS.compactMax + 1);
  assert.equal(responsive.WIDE_MIN, designTokens.RESPONSIVE_BREAKPOINTS.utilityTwoColumnMax + 1);
  assert.equal(responsive.TOUCH_TARGET, designTokens.CONTROL_HEIGHTS.touchTarget, "TOUCH_TARGET matches touchTarget");
  assert.equal(responsive.ACTION_BAR, designTokens.CONTROL_HEIGHTS.actionBar, "ACTION_BAR matches actionBar");

  console.log("  resolve-breakpoint: PASS");
}

// --- Responsive CSS assertions ---

function testResponsiveCssContainsCanonicalValues() {
  const css = responsive.RESPONSIVE_CSS;

  // Touch targets are inherited from the shared role rather than re-declared.
  assert.ok(css.includes("min-block-size:var(--ke-touch-target)"), "CSS consumes shared touch target");

  // No raw color values
  assert.ok(!/#[0-9a-fA-F]{3,8}/.test(css), "CSS contains no raw hex colors");
  assert.ok(!/rgba\(/.test(css), "CSS contains no raw rgba()");
  assert.ok(!/hsla?\(/.test(css), "CSS contains no raw hsla()");

  // Breakpoint classes exist
  assert.ok(css.includes(".whr-compact"), "CSS has compact breakpoint");
  assert.ok(css.includes(".whr-medium"), "CSS has medium breakpoint");
  assert.ok(css.includes(".whr-wide"), "CSS has wide breakpoint");

  // Compact grids collapse from available space instead of forcing undersized columns.
  assert.ok(css.includes("grid-template-columns:repeat(auto-fit,minmax(min(100%,5rem),1fr))"), "compact tabs use an intrinsic wrapping grid");

  // Actions: compact = column, wide = row
  assert.ok(css.includes("flex-direction:column"), "compact actions are column");
  assert.ok(css.includes('.prodigy-app-shell[data-workspace-id="workout"]>.prodigy-workspace-bar{padding-inline:4px}'), "Workout returns workspace-title width");
  assert.ok(css.includes(".whr-compact .workout-start-path>.workout-button{padding-inline:var(--ke-space-1,2px)!important}"), "compact start actions retain two-glyph content width");

  // Compact content wraps in place; it must not conceal or delegate horizontal overflow.
  assert.ok(!/overflow(?:-x)?:\s*(?:hidden|clip|auto|scroll)/.test(css), "responsive surfaces do not hide overflow or create horizontal scroll owners");
  assert.ok(css.includes("overflow:visible"), "responsive panels leave overflow observable");
  assert.ok(css.includes("table-layout:fixed"), "compact tables fit their available inline size");

  // Apple Health UX badges
  assert.ok(css.includes(".workout-ah-badge"), "CSS has Apple Health badge styles");

  console.log("  responsive-css-canonical: PASS");
}

// --- Korean labels not clipped ---

function testKoreanLabelsNotClipped() {
  // The CSS must ensure Korean labels have enough space.
  // Tab labels: 근력, 식단, 러닝 — each must fit in a touch target.
  // Tabs retain two-axis targets and wrap CJK labels instead of clipping or scrolling.
  const css = responsive.RESPONSIVE_CSS;
  assert.ok(css.includes("white-space:normal"), "tab labels can wrap under CJK and zoom pressure");
  assert.ok(css.includes("word-break:keep-all"), "CJK phrase boundaries are preserved");
  assert.ok(css.includes("overflow-wrap:anywhere"), "long CJK and unbroken values can wrap");
  assert.ok(css.includes("min-inline-size:var(--ke-touch-target)"), "tabs retain a 44px inline target");

  console.log("  korean-labels: PASS");
}

// --- width-driven layout (no global viewport read) ---

function testWidthDrivenLayout() {
  // resolveBreakpoint takes explicit width, never reads viewport
  // The test: call with known widths, verify outputs
  const widths = [320, 390, 419, 420, 834, 1023, 1024, 1068, 1440];
  const expected = ["compact", "compact", "compact", "medium", "medium", "medium", "wide", "wide", "wide"];
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
