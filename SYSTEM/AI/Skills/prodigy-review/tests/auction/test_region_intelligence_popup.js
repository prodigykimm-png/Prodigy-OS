"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const ROOT = path.resolve(__dirname, "../../../../../..");
const viewModel = require(path.join(ROOT, "SYSTEM/Views/region-decision-view-model.js"));
const popupCore = require(path.join(ROOT, "SYSTEM/Views/region-intelligence-popup-core.js"));

function regionNote(overrides = {}) {
  const fm = {
    type: "auction_region",
    title: "부산광역시 사하구",
    region_sido: "부산광역시",
    region_sigungu: "사하구",
    status: "active",
    updated: "2026-07-18",
    metrics_as_of: "2026-05-01",
    verification_status: "unverified",
    housing_stock: 48544,
    sale_volume_3m: 435,
    sale_price_change_yoy: -0.99,
    jeonse_ratio: 69.97,
    households: 105378,
    household_change_yoy: 0.48,
    move_in_12m: 415,
    move_in_24m: 1409,
    ...overrides
  };
  const lines = Object.entries(fm).map(([k, v]) => `${k}: ${v}`).join("\n");
  return `---\n${lines}\n---\n\n# 부산광역시 사하구\n\n## 한 줄 요약\n\n<!-- HUMAN: summary -->\n사하구는 부산 서남부 해안 지역이다.\n\n## 교통·생활\n\n<!-- AUTO:REGION_TRANSIT:START -->\n### 인천교통공사 확인 역\n\n- 인천1호선 · 검단호수공원역, 신검단중앙역, 아라역\n\n원본: 인천교통공사 역별 상세 3건\n<!-- AUTO:REGION_TRANSIT:END -->\n\n## 시장·공급\n\n<!-- AUTO:REGION_MARKET:START -->\n<!-- AUTO:REGION_MARKET:END -->\n`;
}

function emptyNote() {
  return `---\ntype: auction_region\ntitle: 테스트구\nregion_sido: 부산광역시\nregion_sigungu: 테스트구\nstatus: active\nupdated: 2026-07-18\nmetrics_as_of:\nverification_status: unverified\nhousing_stock:\nsale_volume_3m:\n---\n\n# 테스트구\n\n## 교통·생활\n\n<!-- AUTO:REGION_TRANSIT:START -->\n<!-- AUTO:REGION_TRANSIT:END -->\n`;
}

test("populated Region → all 7 tabs projected", () => {
  const { frontmatter, body } = popupCore.parseRegionNote(regionNote());
  const projection = viewModel.projectRegionPopup({ frontmatter, body, regionKey: "부산광역시-사하구" });
  assert.equal(projection.tabs.length, 7);
  assert.equal(projection.tabs[0].id, "core");
  assert.equal(projection.tabs[0].available, true);
  assert.equal(projection.tabs[0].content.housing_stock, 48544);
  assert.equal(projection.tabs[4].id, "transit_life");
  assert.equal(projection.tabs[4].available, true);
  assert.equal(projection.tabs[6].id, "site_visit");
  assert.equal(projection.tabs[6].available, true);
});

test("empty Region → tabs show unavailable reasons", () => {
  const { frontmatter, body } = popupCore.parseRegionNote(emptyNote());
  const projection = viewModel.projectRegionPopup({ frontmatter, body, regionKey: "부산광역시-테스트구" });
  assert.equal(projection.tabs[0].available, false);
  assert.equal(projection.tabs[0].unavailableReason, "수집 데이터 없음");
  assert.equal(projection.tabs[4].available, false);
  assert.equal(projection.tabs[4].unavailableReason, "확인된 도시철도 정보 없음");
});

test("stale metrics → freshness badge warns", () => {
  const { frontmatter, body } = popupCore.parseRegionNote(regionNote({ metrics_as_of: "2025-01-01" }));
  const projection = viewModel.projectRegionPopup({ frontmatter, body, regionKey: "부산광역시-사하구" }, new Date("2026-07-28"));
  assert.equal(projection.trustBadges.freshness.level, "stale");
  assert.match(projection.trustBadges.freshness.label, /재수집 필요/);
});

test("fresh metrics → freshness badge fresh", () => {
  const { frontmatter, body } = popupCore.parseRegionNote(regionNote());
  const projection = viewModel.projectRegionPopup({ frontmatter, body, regionKey: "부산광역시-사하구" }, new Date("2026-07-28"));
  assert.equal(projection.trustBadges.freshness.level, "fresh");
});

test("malformed transit → 정보 확인 불가", () => {
  const note = regionNote().replace(
    /<!-- AUTO:REGION_TRANSIT:START -->[\s\S]*?<!-- AUTO:REGION_TRANSIT:END -->/,
    "<!-- AUTO:REGION_TRANSIT:START -->\nINVALID CONTENT NO STATIONS\n<!-- AUTO:REGION_TRANSIT:END -->"
  );
  const { frontmatter, body } = popupCore.parseRegionNote(note);
  const projection = viewModel.projectRegionPopup({ frontmatter, body, regionKey: "부산광역시-사하구" });
  assert.equal(projection.tabs[4].available, false);
  assert.equal(projection.tabs[4].unavailableReason, "정보 확인 불가");
});

test("trust badges: 4 independent fields, never aggregated", () => {
  const { frontmatter, body } = popupCore.parseRegionNote(regionNote());
  const badges = viewModel.computeTrustBadges(frontmatter, body, new Date("2026-07-28"));
  assert.ok(badges.freshness);
  assert.ok(badges.verification);
  assert.ok(badges.coverage);
  assert.ok(badges.schema);
  // Each has independent level
  assert.equal(typeof badges.freshness.level, "string");
  assert.equal(typeof badges.verification.level, "string");
  assert.equal(typeof badges.coverage.level, "string");
  assert.equal(typeof badges.schema.level, "string");
  // No aggregate score
  assert.equal(badges.score, undefined);
  assert.equal(badges.aggregate, undefined);
});

test("tab navigation: focus persistence across switches", () => {
  const vault = fs.mkdtempSync(path.join(os.tmpdir(), "popup-nav-"));
  const regionDir = path.join(vault, "PARA/RESOURCES/Auction Regions");
  fs.mkdirSync(regionDir, { recursive: true });
  fs.writeFileSync(path.join(regionDir, "부산광역시-사하구.md"), regionNote(), "utf8");
  const result = popupCore.openPopup(vault, "부산광역시-사하구");
  assert.equal(result.ok, true);
  assert.equal(result.state.activeTabIndex, 0);
  const switched = popupCore.switchTab(result.state, 3);
  assert.equal(switched.activeTabIndex, 3);
  const back = popupCore.switchTab(switched, 0);
  assert.equal(back.activeTabIndex, 0);
  fs.rmSync(vault, { recursive: true, force: true });
});

test("openPopup with missing Region returns error", () => {
  const vault = fs.mkdtempSync(path.join(os.tmpdir(), "popup-miss-"));
  fs.mkdirSync(path.join(vault, "PARA/RESOURCES/Auction Regions"), { recursive: true });
  const result = popupCore.openPopup(vault, "존재하지않는구");
  assert.equal(result.ok, false);
  assert.match(result.error, /찾을 수 없습니다/);
  fs.rmSync(vault, { recursive: true, force: true });
});

test("zero write: popup never calls any writer/apply function", () => {
  const vault = fs.mkdtempSync(path.join(os.tmpdir(), "popup-write-"));
  const regionDir = path.join(vault, "PARA/RESOURCES/Auction Regions");
  fs.mkdirSync(regionDir, { recursive: true });
  const targetPath = path.join(regionDir, "부산광역시-사하구.md");
  const before = regionNote();
  fs.writeFileSync(targetPath, before, "utf8");
  const shaBefore = require("crypto").createHash("sha256").update(before).digest("hex");
  // Open popup, switch tabs, drill down
  const result = popupCore.openPopup(vault, "부산광역시-사하구");
  popupCore.switchTab(result.state, 4);
  popupCore.getSourceDrilldown(result.state.projection, "housing_stock");
  // Verify file unchanged
  const after = fs.readFileSync(targetPath, "utf8");
  const shaAfter = require("crypto").createHash("sha256").update(after).digest("hex");
  assert.equal(shaBefore, shaAfter);
  fs.rmSync(vault, { recursive: true, force: true });
});

test("verification badge reflects status", () => {
  const { frontmatter, body } = popupCore.parseRegionNote(regionNote({ verification_status: "verified" }));
  const badges = viewModel.computeTrustBadges(frontmatter, body);
  assert.equal(badges.verification.level, "verified");
  assert.equal(badges.verification.label, "사람 검증 완료");
});

test("schema badge: compliant with correct frontmatter", () => {
  const { frontmatter, body } = popupCore.parseRegionNote(regionNote());
  const badges = viewModel.computeTrustBadges(frontmatter, body);
  assert.equal(badges.schema.level, "compliant");
});

test("schema badge: noncompliant with missing fields", () => {
  const { frontmatter, body } = popupCore.parseRegionNote(emptyNote().replace("region_sigungu: 테스트구", "region_sigungu:"));
  const badges = viewModel.computeTrustBadges(frontmatter, body);
  assert.equal(badges.schema.level, "noncompliant");
});

test("transit projection: populated lines", () => {
  const { frontmatter, body } = popupCore.parseRegionNote(regionNote());
  const transit = viewModel.projectTransit(body);
  assert.equal(transit.available, true);
  assert.equal(transit.lines.length, 1);
  assert.equal(transit.lines[0].line_name, "인천1호선");
  assert.equal(transit.lines[0].count, 3);
});

test("transit projection: empty block", () => {
  const { frontmatter, body } = popupCore.parseRegionNote(emptyNote());
  const transit = viewModel.projectTransit(body);
  assert.equal(transit.available, false);
  assert.equal(transit.reason, "확인된 도시철도 정보 없음");
});

test("collection status projected", () => {
  const { frontmatter, body } = popupCore.parseRegionNote(regionNote({ source_as_of: "2026-07-19" }));
  const projection = viewModel.projectRegionPopup({ frontmatter, body, regionKey: "부산광역시-사하구" });
  assert.equal(projection.collectionStatus.last_collection, "2026-07-19");
});
