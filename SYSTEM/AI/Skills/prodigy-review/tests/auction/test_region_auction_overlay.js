"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const ROOT = path.resolve(__dirname, "../../../../../..");
global.ProdigyTokens = require(path.join(ROOT, "SYSTEM/Views/design-tokens.js"));
const regionCore = require(path.join(ROOT, "SYSTEM/Views/auction-region-core.js"));
const popupView = require(path.join(ROOT, "SYSTEM/Views/region-intelligence-popup-view.js"));

function auction(index, overrides = {}) {
  return {
    path: `PARA/PROJECTS/Auction/case-${index}.md`,
    case_number: `2026타경${1000 + index}`,
    status: index % 2 ? "bidding" : "watching",
    auction_datetime: `2026-09-${String((index % 28) + 1).padStart(2, "0")} 10:00`,
    appraisal_price: 200000000 + index,
    minimum_bid: 120000000 + index,
    property_type: index % 2 ? "오피스텔" : "아파트",
    address: `부산광역시 부산진구 테스트로 ${index}`,
    region_sido: "부산광역시",
    region_sigungu: "부산진구",
    region_dong: index % 2 ? "전포동" : "부전동",
    ...overrides
  };
}

test("Region Auction snapshot carries only lightweight card fields", () => {
  const snapshot = regionCore.getRegionAuctionSnapshot("부산광역시", "부산진구", [auction(1)]);
  const row = snapshot.rows[0];

  assert.equal(row.property_type, "오피스텔");
  assert.equal(row.appraisal_price, 200000001);
  assert.equal(row.minimum_bid, 120000001);
  assert.equal(row.path, "PARA/PROJECTS/Auction/case-1.md");
  assert.equal(row.photos, undefined);
  assert.equal(row.report, undefined);
});

test("Region Auction overlay renders at most twenty semantic projection cards", () => {
  const snapshot = regionCore.getRegionAuctionSnapshot(
    "부산광역시",
    "부산진구",
    Array.from({ length: 23 }, (_, index) => auction(index + 1))
  );
  const html = popupView.renderAuctionOverlay(snapshot);

  assert.match(html, /부산광역시 부산진구 경매 · 23건/);
  assert.equal((html.match(/<article class="region-auction-card"/g) || []).length, 20);
  assert.match(html, /최근 20건만 표시/);
  assert.match(html, /<ul class="region-auction-card-list" role="list">/);
  assert.match(html, /data-action="open-region-auction"/);
  assert.match(html, /data-action="open-region-auction-workspace"/);
  assert.doesNotMatch(html, /<table|<img|PRODIGY_SITE_VISIT_STATE/);
});

test("Region Auction overlay keeps dialog, focus, Escape, and mobile contracts", () => {
  const viewSource = fs.readFileSync(path.join(ROOT, "SYSTEM/Views/region-intelligence-popup-view.js"), "utf8");
  const styles = fs.readFileSync(path.join(ROOT, "SYSTEM/Views/region-styles.js"), "utf8");

  assert.equal(typeof popupView.openAuctionOverlay, "function");
  assert.match(viewSource, /region-auction-overlay-modal/);
  assert.match(viewSource, /aria-modal/);
  assert.match(viewSource, /trapOverlayFocus/);
  assert.match(viewSource, /event\.key === "Escape"/);
  assert.match(viewSource, /returnFocus/);
  assert.match(styles, /region-auction-card-list/);
  assert.match(styles, /min-height:\s*\$\{touchTarget\}px/);
  assert.match(styles, /region-auction-overlay[\s\S]*?align-items:\s*flex-end/);
});

test("Region row action opens the overlay and retains explicit full-workspace escape", () => {
  const hub = fs.readFileSync(path.join(ROOT, "HUB/15 Region.md"), "utf8");

  assert.match(hub, /openAuctionOverlay/);
  assert.match(hub, /openAuctionWorkspaceForRegion/);
  assert.match(hub, /onOpenAll/);
  assert.match(hub, /Auction 원본/);
});
