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
  assert.match(html, /카드 상세 보기/);
  assert.match(html, /data-action="open-region-auction-workspace"/);
  assert.doesNotMatch(html, /Auction 원본 열기/);
  assert.doesNotMatch(html, /<table|<img|PRODIGY_SITE_VISIT_STATE/);
});

test("Region Auction card detail shows projected evidence and callable management contact", () => {
  const row = {
    ...regionCore.getRegionAuctionSnapshot("부산광역시", "부산진구", [auction(1)]).rows[0],
    decision_reason: "주차 위험 확인",
    site_visit: {
      status: "recorded",
      summary_lines: ["주차가 부족해 보임"],
      management_contact: { name: "관리소장 이종면", phone: "010-3557-4261", note: "평일 연락" }
    }
  };
  const html = popupView.renderAuctionDetail(row);

  assert.match(html, /경매 카드 상세/);
  assert.match(html, /주차 위험 확인/);
  assert.match(html, /주차가 부족해 보임/);
  assert.match(html, /관리소장 이종면/);
  assert.match(html, /010-3557-4261/);
  assert.match(html, /href="tel:01035574261"/);
  assert.match(html, /data-action="copy-management-contact"/);
  assert.match(html, /목록으로/);
  assert.match(html, /Markdown 원문 열기/);
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
  assert.match(viewSource, /listScrollTop/);
  assert.match(viewSource, /renderAuctionDetail/);
  assert.match(styles, /region-auction-card-list/);
  assert.match(styles, /min-height:\s*\$\{touchTarget\}px/);
  assert.match(styles, /region-auction-overlay[\s\S]*?align-items:\s*flex-end/);
});

test("Region row action opens the overlay and retains explicit full-workspace escape", () => {
  const hub = fs.readFileSync(path.join(ROOT, "HUB/15 Region.md"), "utf8");

  assert.match(hub, /openAuctionOverlay/);
  assert.match(hub, /openAuctionWorkspaceForRegion/);
  assert.match(hub, /onOpenAll/);
  assert.match(hub, /AuctionSiteVisitIndex[\s\S]*?readIndex/);
  assert.match(hub, /onCopyContact/);
  assert.match(hub, /Markdown 원문/);
});
