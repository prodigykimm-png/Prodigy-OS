"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const ROOT = path.resolve(__dirname, "../../../../../..");
const popupCore = require(path.join(ROOT, "SYSTEM/Views/region-intelligence-popup-core.js"));
const popupView = require(path.join(ROOT, "SYSTEM/Views/region-intelligence-popup-view.js"));
const viewModel = require(path.join(ROOT, "SYSTEM/Views/region-decision-view-model.js"));

function regionNote() {
  return `---
type: auction_region
title: 부산광역시 사하구
region_sido: 부산광역시
region_sigungu: 사하구
status: active
updated: 2026-07-18
metrics_as_of: 2026-05-01
verification_status: unverified
housing_stock: 48544
sale_volume_3m: 435
sale_price_change_yoy: -0.99
jeonse_ratio: 69.97
households: 105378
source_as_of: 2026-07-19
---

# 부산광역시 사하구

## 한 줄 요약

<!-- HUMAN: summary -->
사하구는 부산 서남부 해안 지역이다.

## 교통·생활

<!-- AUTO:REGION_TRANSIT:START -->
### 인천교통공사 확인 역

- 인천1호선 · 검단호수공원역, 신검단중앙역, 아라역

원본: 인천교통공사 역별 상세 3건
<!-- AUTO:REGION_TRANSIT:END -->

## 시장·공급

<!-- AUTO:REGION_MARKET:START -->
<!-- AUTO:REGION_MARKET:END -->
`;
}

function makeVault() {
  const vault = fs.mkdtempSync(path.join(os.tmpdir(), "integ-"));
  const regionDir = path.join(vault, "PARA/RESOURCES/Auction Regions");
  fs.mkdirSync(regionDir, { recursive: true });
  fs.writeFileSync(path.join(regionDir, "부산광역시-사하구.md"), regionNote(), "utf8");
  return vault;
}

test("Auction card → Region popup → back retains context", () => {
  const vault = makeVault();
  const result = popupCore.openPopup(vault, "부산광역시-사하구");
  assert.equal(result.ok, true);
  assert.equal(result.state.regionKey, "부산광역시-사하구");
  assert.equal(result.state.readOnly, true);
  // Navigate tabs
  const s1 = popupCore.switchTab(result.state, 4);
  assert.equal(s1.activeTabIndex, 4);
  // "Back" — just switch back to 0
  const s2 = popupCore.switchTab(s1, 0);
  assert.equal(s2.activeTabIndex, 0);
  assert.equal(s2.regionKey, "부산광역시-사하구");
  fs.rmSync(vault, { recursive: true, force: true });
});

test("Region popup → source drilldown → back", () => {
  const vault = makeVault();
  const result = popupCore.openPopup(vault, "부산광역시-사하구");
  const drilldown = popupCore.getSourceDrilldown(result.state.projection, "housing_stock");
  assert.ok(drilldown);
  assert.equal(typeof drilldown.note, "string");
  fs.rmSync(vault, { recursive: true, force: true });
});

test("Region popup → site visit → creates note, not Object", () => {
  const vault = makeVault();
  const result = popupCore.openPopup(vault, "부산광역시-사하구");
  // Site visit tab is always available
  const siteTab = result.state.projection.tabs.find((t) => t.id === "site_visit");
  assert.equal(siteTab.available, true);
  assert.equal(siteTab.content.can_add, true);
  // Popup does NOT create the note itself — that's the workflow's job
  // Verify no new files were created
  const regionDir = path.join(vault, "PARA/RESOURCES/Auction Regions");
  const files = fs.readdirSync(regionDir);
  assert.equal(files.length, 1); // only the original
  fs.rmSync(vault, { recursive: true, force: true });
});

test("malformed Region → popup shows unavailable, no crash", () => {
  const vault = fs.mkdtempSync(path.join(os.tmpdir(), "integ-mal-"));
  const regionDir = path.join(vault, "PARA/RESOURCES/Auction Regions");
  fs.mkdirSync(regionDir, { recursive: true });
  fs.writeFileSync(path.join(regionDir, "부산광역시-테스트구.md"), "INVALID CONTENT NO FRONTMATTER\n", "utf8");
  const result = popupCore.openPopup(vault, "부산광역시-테스트구");
  assert.equal(result.ok, true); // opens but shows unavailable
  const coreTab = result.state.projection.tabs.find((t) => t.id === "core");
  assert.equal(coreTab.available, false);
  // Render doesn't crash
  const html = popupView.renderPopup(result.state);
  assert.match(html, /수집 데이터 없음/);
  fs.rmSync(vault, { recursive: true, force: true });
});

test("popup never mutates any file", () => {
  const vault = makeVault();
  const targetPath = path.join(vault, "PARA/RESOURCES/Auction Regions/부산광역시-사하구.md");
  const before = fs.readFileSync(targetPath);
  const shaBefore = crypto.createHash("sha256").update(before).digest("hex");

  // Full popup lifecycle
  const result = popupCore.openPopup(vault, "부산광역시-사하구");
  for (let i = 0; i < 7; i++) popupCore.switchTab(result.state, i);
  popupView.renderPopup(result.state);
  popupCore.getSourceDrilldown(result.state.projection, "housing_stock");

  const after = fs.readFileSync(targetPath);
  const shaAfter = crypto.createHash("sha256").update(after).digest("hex");
  assert.equal(shaBefore, shaAfter, "Region Object must not be mutated by popup");
  fs.rmSync(vault, { recursive: true, force: true });
});
