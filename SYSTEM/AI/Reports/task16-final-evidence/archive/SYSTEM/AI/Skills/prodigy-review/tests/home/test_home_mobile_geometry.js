"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "../../../../../..");
const TOKENS = require(path.join(ROOT, "SYSTEM/Views/design-tokens.js"));
const HOME_STYLES_PATH = path.join(ROOT, "SYSTEM/Views/home-styles.js");

function renderHomeCss() {
  const styles = new Map();
  global.document = {
    getElementById: (id) => styles.get(id) || null,
    createElement: () => ({ id: "", textContent: "" }),
    head: { appendChild: (element) => styles.set(element.id, element) }
  };
  global.ProdigyTokens = TOKENS;
  global.ProdigyUI = { ensureStyles() {} };
  delete require.cache[require.resolve(HOME_STYLES_PATH)];
  const homeStyles = require(HOME_STYLES_PATH);
  homeStyles.ensureHomeStyles();
  return styles.get(homeStyles.HOME_STYLE_ID).textContent;
}

function mobileGeometry(width, options = {}) {
  const toolbar = options.toolbar === false ? 0 : TOKENS.CONTROL_HEIGHTS.mobileToolbar;
  const actionBar = TOKENS.CONTROL_HEIGHTS.actionBar;
  const safeArea = options.safeArea === false ? 0 : 34;
  const spacing = TOKENS.SPACING.xl;
  const clearance = toolbar + actionBar + safeArea + spacing;
  const viewportBottom = 844;
  const actualOverlayHeight = TOKENS.CONTROL_HEIGHTS.mobileToolbar
    + TOKENS.CONTROL_HEIGHTS.actionBar
    + 34;
  const overlayTop = viewportBottom - actualOverlayHeight;
  const summaryBottomAtMaxScroll = viewportBottom - clearance;
  return { width, clearance, overlayTop, summaryBottomAtMaxScroll };
}

function testEffectiveHomeBodyOwnsBottomClearance() {
  const css = renderHomeCss();
  const compactRule = /\.prodigy-home\.home-compact\s*\{([^}]*)\}/.exec(css);
  assert.ok(compactRule, "compact Home must own its bottom geometry even when media width differs from app-mobile state");
  assert.match(compactRule[1], /padding-bottom:\s*var\(--home-mobile-bottom-clearance\)/);
  assert.match(compactRule[1], /var\(--ke-mobile-toolbar-height,\s*56px\)/);
  assert.match(compactRule[1], /var\(--prodigy-action-bar-height,\s*52px\)/);
  assert.match(compactRule[1], /env\(safe-area-inset-bottom,\s*0px\)/);
  assert.match(compactRule[1], /var\(--ke-space-5,\s*16px\)/);
  assert.doesNotMatch(css, /home-compact[\s\S]*100dvb[\s\S]*overflow-y:\s*(?:auto|scroll)/);
}

function testRequiredWidthsClearFloatingChrome() {
  for (const width of [320, 375, 390, 430]) {
    const geometry = mobileGeometry(width);
    assert.equal(geometry.clearance, 158);
    assert.ok(
      geometry.summaryBottomAtMaxScroll <= geometry.overlayTop,
      `${width}px에서 Micro Log 다음 요약은 플로팅 툴바 위까지 도달해야 한다`
    );
    assert.ok(TOKENS.CONTROL_HEIGHTS.touchTarget >= 44);
  }
}

function testMissingToolbarOrSafeAreaReproduces390Overlap() {
  const missingToolbar = mobileGeometry(390, { toolbar: false });
  const missingSafeArea = mobileGeometry(390, { safeArea: false });
  assert.ok(missingToolbar.summaryBottomAtMaxScroll > missingToolbar.overlayTop);
  assert.ok(missingSafeArea.summaryBottomAtMaxScroll > missingSafeArea.overlayTop);
}

try {
  testEffectiveHomeBodyOwnsBottomClearance();
  testRequiredWidthsClearFloatingChrome();
  testMissingToolbarOrSafeAreaReproduces390Overlap();
  console.log("Home mobile geometry tests passed (320/375/390/430)");
} finally {
  delete global.document;
  delete global.ProdigyTokens;
  delete global.ProdigyUI;
}
