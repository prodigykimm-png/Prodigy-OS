"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { test } = require("node:test");

const ROOT = path.resolve(__dirname, "../../../../../..");

test("Auction AI consumers own no provider transport or profile resolver", () => {
  for (const name of [
    "auction-ai-decision-support.js",
    "auction-real-estate-research.js",
    "region-experience-ai.js",
  ]) {
    const source = fs.readFileSync(path.join(ROOT, "SYSTEM/Views", name), "utf8");
    assert.doesNotMatch(source, /AIProviderService|AuctionAiProviderResolver|ProjectWorkflowDraftService|loadProviderConfig|defaultProvider/u, name);
    assert.match(source, /ProdigyAIConsumerRuntime|prodigy-ai-consumer-runtime/u, name);
  }
});

test("Auction Research modal makes zero AI calls on render and exposes one explicit summary action", () => {
  const source = fs.readFileSync(path.join(ROOT, "SYSTEM/Views/auction-real-estate-research.js"), "utf8");
  assert.doesNotMatch(source, /void this\.loadAiSummary\(pkg\);[\s\S]*addSummary/u);
  assert.match(source, /text: this\.aiSummaryLoading \? "AI 요약 생성 중…" : "AI 요약 생성"/u);
  assert.match(source, /summarize\.onclick = \(\) =>/u);
  assert.match(source, /Modal을 여는 것만으로는 외부 전송하지 않습니다/u);
});

test("Auction workspace manifest loads client before all three migrated consumers", () => {
  const manifest = require(path.join(ROOT, "SYSTEM/Views/prodigy-workspace-manifest.js")).get("auction");
  const clientIndex = manifest.required.indexOf("SYSTEM/Views/prodigy-ai-client.js");
  assert.ok(clientIndex > manifest.required.indexOf("SYSTEM/Views/llmwiki-hash.js"));
  for (const consumer of [
    "SYSTEM/Views/auction-ai-decision-support.js",
    "SYSTEM/Views/auction-real-estate-research.js",
  ]) assert.ok(manifest.required.indexOf(consumer) > clientIndex, consumer);
  for (const legacy of [
    "SYSTEM/Views/ai-provider-service.js",
    "SYSTEM/Views/codex-exec-service.js",
    "SYSTEM/Views/antigravity-exec-service.js",
    "SYSTEM/Views/auction-ai-provider-resolver.js",
  ]) assert.equal(manifest.required.includes(legacy), false, legacy);
  const regionHub = fs.readFileSync(path.join(ROOT, "HUB/15 Region.md"), "utf8");
  assert.match(regionHub, /SYSTEM\/Views\/prodigy-ai-client\.js/u);
  assert.doesNotMatch(regionHub, /SYSTEM\/Views\/ai-provider-service\.js|SYSTEM\/Views\/region-experience-provider-endpoint-guard\.js/u);
});
