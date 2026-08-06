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
  assert.ok(hub.indexOf('loadProdigyScript("SYSTEM/Views/real-estate-source-runtime.js")') < hub.indexOf('loadProdigyScript("SYSTEM/Views/auction-source-approval-writer.js")'));
  assert.match(hub, /loadProdigyScript\("SYSTEM\/Views\/auction-real-estate-research-core\.js"\)/u);
  assert.match(hub, /loadProdigyScript\("SYSTEM\/Views\/auction-real-estate-source-runner\.js"\)/u);
  assert.match(hub, /loadProdigyScript\("SYSTEM\/Views\/auction-real-estate-research\.js"\)/u);
  assert.match(hub, /loadProdigyScript\("SYSTEM\/Views\/auction-ai-provider-resolver\.js"\)/u);
  assert.ok(hub.indexOf('loadProdigyScript("SYSTEM/Views/auction-ai-provider-resolver.js")') < hub.indexOf('loadProdigyScript("SYSTEM/Views/auction-real-estate-research.js")'));
  assert.match(hub, /loadProdigyScript\("SYSTEM\/Views\/codex-exec-service\.js"\)/u);
  assert.match(hub, /loadProdigyScript\("SYSTEM\/Views\/antigravity-exec-service\.js"\)/u);
});

test("Given the research summary flow, When a provider is resolved, Then it delegates to the shared Auction resolver", () => {
  const research = fs.readFileSync(path.join(ROOT, "SYSTEM/Views/auction-real-estate-research.js"), "utf8");
  assert.match(research, /AuctionAiProviderResolver/u);
  assert.match(research, /resolveAuctionAiProvider/u);
  assert.doesNotMatch(research, /\[config\.defaultProvider,\s*"codex",\s*"antigravity"\]/u);
});

test("Given an Auction Object card, When research state is projected, Then the card keeps the investigation entry conditional and Korean", () => {
  assert.match(card, /p\.type === "auction_case"/u);
  assert.match(card, /researchActionForAuction/u);
  assert.match(card, /조사 자료/u);
  assert.match(card, /openForAuction\(app, p/u);
});

console.log("Auction real-estate wiring tests loaded");
