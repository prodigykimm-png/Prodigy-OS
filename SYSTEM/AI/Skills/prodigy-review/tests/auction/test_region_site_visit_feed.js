"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const ROOT = path.resolve(__dirname, "../../../../../..");
const tokens = require(path.join(ROOT, "SYSTEM/Views/design-tokens.js"));
global.ProdigyTokens = tokens;
const viewModel = require(path.join(ROOT, "SYSTEM/Views/region-decision-view-model.js"));
global.RegionDecisionViewModel = viewModel;
const core = require(path.join(ROOT, "SYSTEM/Views/region-intelligence-popup-core.js"));
const view = require(path.join(ROOT, "SYSTEM/Views/region-intelligence-popup-view.js"));

function regionNote() {
  return [
    "---",
    "type: auction_region",
    "title: 부산광역시 부산진구",
    "region_sido: 부산광역시",
    "region_sigungu: 부산진구",
    "status: active",
    "updated: 2026-09-01",
    "metrics_as_of: 2026-08-01",
    "verification_status: verified",
    "---",
    "# 부산진구"
  ].join("\n");
}

function visit() {
  return {
    source_path: "PARA/PROJECTS/Auction/부산-2025타경2391_2.md",
    case_number: "2025타경2391(2)",
    status: "draft",
    visited_at: "2026-07-18",
    region_key: "부산광역시-부산진구",
    region_dong: "전포동",
    building_name: "목연정엠팰리스",
    summary_lines: ["사람이 거주하는 것 같음", "주차가 부족해 보임"],
    checked_count: 0,
    photo_count: 0,
    has_contact: true
  };
}

test("Region cases/visit projects structured Auction field notes and an accessible disclosure", () => {
  const vault = fs.mkdtempSync(path.join(os.tmpdir(), "region-site-visit-"));
  const dir = path.join(vault, "PARA/RESOURCES/Auction Regions");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "부산광역시-부산진구.md"), regionNote(), "utf8");

  const result = core.openPopup(vault, "부산광역시-부산진구", { siteVisits: [visit()] });
  assert.equal(result.ok, true);
  const cases = result.state.projection.tabs.find((tab) => tab.id === "cases_visit");
  const section = cases.content.sections.find((item) => item.id === "site_visit");
  assert.equal(section.label, "임장 1");
  assert.deepEqual(section.content.site_visits, [visit()]);

  const html = view.renderPopup({ ...result.state, activeTabIndex: 2 });
  assert.match(html, /<article class="region-visit-item"/);
  assert.match(html, /<details/);
  assert.match(html, /목연정엠팰리스/);
  assert.match(html, /전포동/);
  assert.match(html, /작성 중/);
  assert.match(html, /관리사무소 연락처 있음/);
  assert.match(html, /data-action="open-site-visit"/);
  assert.match(html, /aria-label="목연정엠팰리스 Auction 원본 열기"/);
  assert.doesNotMatch(html, /010|1234|5678/);
  fs.rmSync(vault, { recursive: true, force: true });
});

test("Region field-note feed uses semantic list structure and never a horizontal table", () => {
  const source = fs.readFileSync(path.join(ROOT, "SYSTEM/Views/region-intelligence-popup-view.js"), "utf8");
  assert.match(source, /region-visit-list/);
  assert.match(source, /<article/);
  assert.match(source, /<details/);
  assert.doesNotMatch(source, /region-visit-table/);
});

test("Region workspace treats the derived site-visit index as optional startup data", () => {
  const hub = fs.readFileSync(path.join(ROOT, "HUB/15 Region.md"), "utf8");
  const coreSource = fs.readFileSync(path.join(ROOT, "SYSTEM/Views/region-intelligence-popup-core.js"), "utf8");

  assert.match(hub, /OPTIONAL_FEATURE_PATHS[\s\S]*?auction-site-visit-index\.js/);
  assert.doesNotMatch(coreSource, /require\("\.\/auction-site-visit-index\.js"\)/);
});

test("Region workspace never trusts Dataview ambient require for node:path", () => {
  const hub = fs.readFileSync(path.join(ROOT, "HUB/15 Region.md"), "utf8");

  assert.doesNotMatch(hub, /const localRequire = typeof require === "function" \? require : fallbackRequire/);
  assert.match(hub, /moduleName === "node:path"[\s\S]*?fallbackRequire\(moduleName\)/);
});
