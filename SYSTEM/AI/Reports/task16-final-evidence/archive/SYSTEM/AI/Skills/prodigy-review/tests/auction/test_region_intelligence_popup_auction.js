"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const ROOT = path.resolve(__dirname, "../../../../../..");
const regionCorePath = path.join(ROOT, "SYSTEM/Views/auction-region-core.js");
const popupCorePath = path.join(ROOT, "SYSTEM/Views/region-intelligence-popup-core.js");
const popupViewPath = path.join(ROOT, "SYSTEM/Views/region-intelligence-popup-view.js");

function loadPopupModules() {
  globalThis.AuctionRegionCore = require(regionCorePath);
  delete require.cache[require.resolve(popupCorePath)];
  delete require.cache[require.resolve(popupViewPath)];
  return {
    core: require(popupCorePath),
    view: require(popupViewPath)
  };
}

function regionNote() {
  return [
    "---",
    "type: auction_region",
    "title: 부산광역시 사하구",
    "region_sido: 부산광역시",
    "region_sigungu: 사하구",
    "metrics_as_of: 2026-07-01",
    "verification_status: verified",
    "---",
    "# 부산광역시 사하구",
    ""
  ].join("\n");
}

test("Given a Region popup and matching Dataview rows, When the popup is projected, Then the read-only connected auction tab preserves the adapter snapshot", () => {
  const { core } = loadPopupModules();
  const vault = fs.mkdtempSync(path.join(os.tmpdir(), "prodigy-region-popup-"));
  try {
    const regionDir = path.join(vault, "PARA/RESOURCES/Auction Regions");
    fs.mkdirSync(regionDir, { recursive: true });
    fs.writeFileSync(path.join(regionDir, "부산광역시-사하구.md"), regionNote(), "utf8");
    const result = core.openPopup(vault, "부산광역시-사하구", {
      now: new Date("2026-08-02T00:00:00.000Z"),
      auctionRows: [
        { file: { path: "PARA/PROJECTS/Auction/case.md" }, type: "auction_case", status: "watching", auction_datetime: "2026-08-10", minimum_bid: 100000000, address: "부산광역시 사하구 우동 1", region_sido: "부산광역시", region_sigungu: "사하구", region_dong: "우동" },
        { file: { path: "PARA/PROJECTS/Auction/other.md" }, type: "auction_case", status: "bidding", region_sido: "부산광역시", region_sigungu: "해운대구" }
      ]
    });
    assert.equal(result.ok, true);
    const group = result.state.projection.tabs.find((entry) => entry.id === "cases_visit");
    const section = group.content.sections.find((entry) => entry.id === "connected_auctions");
    assert.equal(section.available, true);
    assert.equal(section.content.status, "ready");
    assert.equal(section.content.count, 1);
    assert.equal(section.content.rows[0].path, "PARA/PROJECTS/Auction/case.md");
    assert.equal(result.state.readOnly, true);
  } finally {
    fs.rmSync(vault, { recursive: true, force: true });
  }
});

test("Given a popup with a connected auction snapshot, When it is rendered, Then the user-facing section exposes a row action without a note link", () => {
  const { view } = loadPopupModules();
  const html = view.renderPopup({
    projection: {
      title: "부산광역시 사하구",
      trustBadges: { freshness: { level: "fresh", label: "최신" }, verification: { level: "verified", label: "검증" }, coverage: { level: "full", label: "출처" }, schema: { level: "compliant", label: "적합" } },
      collectionHealth: null,
      tabs: [{ id: "cases_visit", label: "사례·임장", available: true, content: { sections: [{ id: "connected_auctions", label: "연결 경매", available: true, content: { status: "ready", freshness: { label: "기준 시각 있음" }, rows: [{ path: "PARA/PROJECTS/Auction/case.md", case_number: "2026타경1", status: "watching", auction_datetime: "2026-08-10", minimum_bid: 100000000, address: "부산광역시 사하구 우동 1", region_dong: "우동" }] } }] } }]
    },
    activeTabIndex: 0
  });
  assert.match(html, /연결 경매/);
  assert.match(html, /data-action="open-auction"/);
  assert.doesNotMatch(html, /지역 노트 열기/);
});

console.log("Region intelligence popup auction tests loaded");
