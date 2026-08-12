"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");
const test = require("node:test");

const ROOT = path.resolve(__dirname, "../../../../../..");
const popupView = require(path.join(ROOT, "SYSTEM/Views/region-intelligence-popup-view.js"));
const viewModel = require(path.join(ROOT, "SYSTEM/Views/region-decision-view-model.js"));
const tokens = require(path.join(ROOT, "SYSTEM/Views/design-tokens.js"));

function sampleProjection() {
  return viewModel.projectRegionPopup({
    frontmatter: {
      type: "auction_region", title: "부산광역시 사하구",
      region_sido: "부산광역시", region_sigungu: "사하구",
      metrics_as_of: "2026-05-01", verification_status: "unverified",
      housing_stock: 48544, sale_volume_3m: 435
    },
    body: { transit_block: { available: true, lines: [{ line_name: "인천1호선", stations: ["A", "B"], count: 2 }], malformed: false }, source_count: 3 },
    regionKey: "부산광역시-사하구"
  });
}

test("320px: no element exceeds viewport width", () => {
  const html = popupView.renderPopup({ projection: sampleProjection(), activeTabIndex: 0 });
  assert.match(html, /max-width:\s*100%/);
  assert.match(html, /overflow-x:\s*hidden/);
  // No fixed pixel widths > 320
  const fixedWidths = html.matchAll(/width:\s*(\d+)px/g);
  for (const m of fixedWidths) {
    assert.ok(parseInt(m[1]) <= 320, `Fixed width ${m[1]}px exceeds 320px`);
  }
  // CSS also constrains
  const css = popupView.popupStyles();
  assert.match(css, /max-width:\s*100vw/);
});

test("390px: no horizontal overflow", () => {
  const html = popupView.renderPopup({ projection: sampleProjection(), activeTabIndex: 0 });
  assert.match(html, /overflow-x:\s*hidden/);
  // CSS provides tab bar scroll
  const css = popupView.popupStyles();
  assert.match(css, /overflow-x:\s*auto/);
  assert.match(css, /-webkit-overflow-scrolling:\s*touch/);
});

test("touch targets: all buttons ≥ 44px", () => {
  const html = popupView.renderPopup({ projection: sampleProjection(), activeTabIndex: 0 });
  const buttons = html.matchAll(/<button[^>]*>/g);
  let count = 0;
  for (const btn of buttons) {
    count++;
    assert.match(btn[0], /min-height:\s*44px/, `Button missing 44px min-height: ${btn[0].slice(0, 80)}`);
  }
  assert.ok(count >= 2, "Should have at least close + tab buttons");
  // CSS also enforces
  const css = popupView.popupStyles();
  assert.match(css, /min-height:\s*44px/);
});

test("tab bar: scrollable on narrow", () => {
  // Tab bar scroll is in CSS, not inline HTML
  const css = popupView.popupStyles();
  assert.match(css, /\.region-popup-tabs\s*\{[^}]*overflow-x:\s*auto/);
  assert.match(css, /flex-shrink:\s*0/);
  // Tab bar HTML has correct role
  const tabs = sampleProjection().tabs;
  const tabBar = popupView.renderTabBar(tabs, 0);
  assert.match(tabBar, /role="tablist"/);
});

test("modal: full-screen compact, dialog desktop", () => {
  const html = popupView.renderPopup({ projection: sampleProjection(), activeTabIndex: 0 });
  assert.match(html, /role="dialog"/);
  assert.match(html, /aria-label/);
  // CSS handles responsive
  const css = popupView.popupStyles();
  assert.match(css, new RegExp(`@media\\s*\\(max-width:\\s*${tokens.RESPONSIVE_BREAKPOINTS.compactMax}px\\)`));
  assert.match(css, /width:\s*100vw/);
});

test("Korean labels: no raw English keys in rendered output", () => {
  const html = popupView.renderPopup({ projection: sampleProjection(), activeTabIndex: 0 });
  // Tab labels are Korean
  assert.match(html, /핵심/);
  assert.match(html, /변화/);
  assert.match(html, /교통·생활/);
  assert.match(html, /임장/);
  // Footer is Korean
  assert.match(html, /읽기 전용/);
  // Badge labels are Korean
  assert.match(html, /최신성/);
  assert.match(html, /검증/);
  assert.match(html, /스키마/);
});

test("empty transit: 확인된 도시철도 정보 없음", () => {
  const projection = viewModel.projectRegionPopup({
    frontmatter: { type: "auction_region", title: "테스트", region_sido: "부산광역시", region_sigungu: "테스트구" },
    body: { transit_block: { available: false, lines: [], malformed: false } },
    regionKey: "부산광역시-테스트구"
  });
  const html = popupView.renderPopup({ projection, activeTabIndex: 4 });
  assert.match(html, /확인된 도시철도 정보 없음/);
});

test("back navigation: context preserved in state", () => {
  const popupCore = require(path.join(ROOT, "SYSTEM/Views/region-intelligence-popup-core.js"));
  const state = { projection: sampleProjection(), activeTabIndex: 3, previousContext: null, readOnly: true, regionKey: "부산광역시-사하구" };
  const switched = popupCore.switchTab(state, 0);
  assert.equal(switched.regionKey, "부산광역시-사하구");
  assert.equal(switched.readOnly, true);
  assert.equal(switched.activeTabIndex, 0);
});
