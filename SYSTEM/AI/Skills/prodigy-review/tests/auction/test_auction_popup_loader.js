"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const ROOT = path.resolve(__dirname, "../../../../../..");
const files = [
  "SYSTEM/Views/region-decision-view-model.js",
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
assert.equal(typeof mobileSandbox.RegionIntelligencePopupCore?.openPopup, "function");
assert.equal(typeof mobileSandbox.RegionIntelligencePopupView?.renderPopup, "function");
assert.equal(mobileSandbox.RegionIntelligencePopupCore.isAvailable, false);

const auctionCard = fs.readFileSync(path.join(ROOT, "SYSTEM/Views/auction-card.js"), "utf8");
assert.match(auctionCard, /RegionIntelligencePopupCore\?\.isAvailable/);

console.log("auction popup JS Engine loader tests passed");
