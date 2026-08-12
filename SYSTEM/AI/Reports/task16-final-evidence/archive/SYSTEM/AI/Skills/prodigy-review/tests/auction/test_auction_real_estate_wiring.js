"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const ROOT = path.resolve(__dirname, "../../../../../..");
const hub = fs.readFileSync(path.join(ROOT, "HUB/10 Auction.md"), "utf8");
const auctionRequired = require(path.join(ROOT, "SYSTEM/AI/Skills/prodigy-review/tests/shared/fixtures/workspace-manifest-v1.json")).entries.auction.required;
const card = fs.readFileSync(path.join(ROOT, "SYSTEM/Views/auction-card.js"), "utf8");

test("Given the Auction dashboard loader, When source modules are loaded, Then learning precedes outcome approval", () => {
  const index = (name) => auctionRequired.indexOf(`SYSTEM/Views/${name}`);
  assert.ok(index("auction-learning-core.js") < index("auction-outcome-writer.js"));
  assert.ok(index("real-estate-source-runtime.js") < index("auction-source-approval-writer.js"));
  ["auction-real-estate-research-core.js", "auction-real-estate-source-runner.js", "auction-real-estate-research.js", "auction-ai-provider-resolver.js", "codex-exec-service.js", "antigravity-exec-service.js"].forEach((name) => assert.ok(index(name) >= 0));
  assert.ok(index("auction-ai-provider-resolver.js") < index("auction-real-estate-research.js"));
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
