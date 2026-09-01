"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const ROOT = path.resolve(__dirname, "../../../../../..");
const files = [
  "SYSTEM/Views/region-decision-view-model.js",
  "SYSTEM/Views/region-collection-health-core.js",
  "SYSTEM/Views/region-decision-context-core.js",
  "SYSTEM/Views/region-explorer-projection.js",
  "SYSTEM/Views/auction-decision-mirror-core.js",
  "SYSTEM/Views/auction-site-visit-index.js",
  "SYSTEM/Views/region-intelligence-popup-store.js",
  "SYSTEM/Views/region-intelligence-popup-core.js",
  "SYSTEM/Views/region-intelligence-popup-view.js"
];

const sandbox = {
  require(id) {
    if (id === "node:fs" || id === "node:path") return require(id);
    throw new Error(`JS Engine loader must not resolve relative module: ${id}`);
  }
};
sandbox.window = sandbox;
sandbox.globalThis = sandbox;
vm.createContext(sandbox);

for (const file of files) {
  const source = fs.readFileSync(path.join(ROOT, file), "utf8");
  new vm.Script(`(function () {\n${source}\n})();`, { filename: file }).runInContext(sandbox);
}

assert.equal(typeof sandbox.RegionDecisionViewModel?.projectRegionPopup, "function");
assert.equal(typeof sandbox.RegionCollectionHealthCore?.analyzeCollectionHealth, "function");
assert.equal(typeof sandbox.AuctionDecisionMirrorCore?.projectDecisionMirror, "function");
assert.equal(typeof sandbox.RegionIntelligencePopupCore?.openPopup, "function");
assert.equal(typeof sandbox.RegionIntelligencePopupView?.renderPopup, "function");

const mobileSandbox = {};
mobileSandbox.window = mobileSandbox;
mobileSandbox.globalThis = mobileSandbox;
vm.createContext(mobileSandbox);

for (const file of files) {
  const source = fs.readFileSync(path.join(ROOT, file), "utf8");
  new vm.Script(`(function () {\n${source}\n})();`, { filename: file }).runInContext(mobileSandbox);
}

assert.equal(typeof mobileSandbox.RegionDecisionViewModel?.projectRegionPopup, "function");
assert.equal(typeof mobileSandbox.RegionCollectionHealthCore?.analyzeCollectionHealth, "function");
assert.equal(typeof mobileSandbox.AuctionDecisionMirrorCore?.projectDecisionMirror, "function");
assert.equal(typeof mobileSandbox.RegionIntelligencePopupCore?.openPopup, "function");
assert.equal(typeof mobileSandbox.RegionIntelligencePopupView?.renderPopup, "function");
assert.equal(mobileSandbox.RegionIntelligencePopupCore.isAvailable, true);
assert.equal(typeof mobileSandbox.RegionIntelligencePopupCore.openPopupForApp, "function");

const auctionCard = fs.readFileSync(path.join(ROOT, "SYSTEM/Views/auction-card.js"), "utf8");
assert.doesNotMatch(auctionCard, /RegionIntelligencePopupCore\?\.isAvailable/);
assert.match(auctionCard, /await window\.AuctionRegionPacket\.openForAuction\(app, p,/);

const mobileRegionPath = "PARA/RESOURCES/Auction Regions/부산광역시-사하구.md";
const mobileRegionNote = [
  "---",
  "type: auction_region",
  "title: 부산광역시 사하구",
  "region_sido: 부산광역시",
  "region_sigungu: 사하구",
  "status: active",
  "updated: 2026-07-31",
  "metrics_as_of: 2026-07-01",
  "verification_status: verified",
  "housing_stock: 48544",
  "---",
  "",
  "# 부산광역시 사하구"
].join("\n");
const mobileFile = { path: mobileRegionPath, extension: "md" };
const mobileApp = {
  vault: {
    getAbstractFileByPath(filePath) { return filePath === mobileRegionPath ? mobileFile : null; },
    getFiles() { return [mobileFile]; },
    read(file) {
      assert.equal(file, mobileFile);
      return Promise.resolve(mobileRegionNote);
    },
    adapter: {}
  }
};

mobileSandbox.RegionIntelligencePopupCore.openPopupForApp(mobileApp, "부산광역시-사하구")
  .then((result) => {
    assert.equal(result.ok, true);
    assert.equal(result.state.regionKey, "부산광역시-사하구");
    assert.equal(Array.from(result.state.projection.tabs, (tab) => tab.id).join(","), "decision_context,region_evidence,cases_visit");
    const evidence = result.state.projection.tabs.find((tab) => tab.id === "region_evidence").content.sections;
    assert.equal(evidence.find((section) => section.id === "supply_jobs").content.housing_stock, 48544);
    console.log("auction popup JS Engine loader tests passed");
  })
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
