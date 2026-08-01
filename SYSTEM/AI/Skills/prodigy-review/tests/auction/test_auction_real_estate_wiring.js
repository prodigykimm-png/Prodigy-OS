"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const ROOT = path.resolve(__dirname, "../../../../../..");
const hub = fs.readFileSync(path.join(ROOT, "HUB/10 Auction.md"), "utf8");
const card = fs.readFileSync(path.join(ROOT, "SYSTEM/Views/auction-card.js"), "utf8");

test("Given the Auction dashboard loader, When source modules are loaded, Then learning precedes outcome approval", () => {
  assert.ok(hub.indexOf('loadProdigyScript("SYSTEM/Views/auction-learning-core.js")') < hub.indexOf('loadProdigyScript("SYSTEM/Views/auction-outcome-writer.js")'));
  assert.match(hub, /loadProdigyScript\("SYSTEM\/Views\/auction-real-estate-research-core\.js"\)/u);
  assert.match(hub, /loadProdigyScript\("SYSTEM\/Views\/auction-real-estate-research\.js"\)/u);
});

test("Given an Auction Object card, When the research module is late, Then the entry button still renders and checks readiness on click", () => {
  assert.match(card, /p\.type === "auction_case"/u);
  assert.match(card, /부동산 조사 모듈이 아직 준비되지 않았습니다/u);
  assert.match(card, /openForAuction\(app, p/u);
});

console.log("Auction real-estate wiring tests loaded");
