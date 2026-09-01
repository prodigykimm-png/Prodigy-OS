"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { test } = require("node:test");

const ROOT = path.resolve(__dirname, "../../../../../..");
const cutover = require(path.join(ROOT, "SYSTEM/docs/Prodigy_AI_Consumer_Cutover_v1.json"));
const manifests = require(path.join(ROOT, "SYSTEM/Views/prodigy-ai-consumer-manifests.js"));
const workspaceManifest = require(path.join(ROOT, "SYSTEM/Views/prodigy-workspace-manifest.js"));
const LEGACY = /AIProviderService|AuctionAiProviderResolver|loadProviderConfig|requestStructuredJson(?:Once|NoRetry)?|requestChatText/u;

test("all fourteen active consumers use only Prodigy AI client boundaries", () => {
  assert.equal(cutover.schema_version, "prodigy_ai_consumer_cutover_v1");
  assert.equal(cutover.active_consumer_count, 14);
  const expected = manifests.list().map((entry) => entry.consumer_id);
  const actual = cutover.consumers.map((entry) => entry.consumer_id).sort((left, right) => left.localeCompare(right, "en"));
  assert.deepEqual(actual, expected);
  for (const consumer of cutover.consumers) {
    assert.ok(consumer.production.length > 0, consumer.consumer_id);
    assert.ok(consumer.evidence.length > 0, consumer.consumer_id);
    for (const relative of [...consumer.production, ...consumer.evidence]) {
      assert.equal(fs.existsSync(path.join(ROOT, relative)), true, `${consumer.consumer_id}: ${relative}`);
    }
    const source = consumer.production.map((relative) => fs.readFileSync(path.join(ROOT, relative), "utf8")).join("\n");
    assert.match(source, new RegExp(consumer.consumer_id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "u"), consumer.consumer_id);
    assert.doesNotMatch(source, LEGACY, consumer.consumer_id);
  }
});

test("no active workspace manifest loads the retired provider runtime", () => {
  const forbidden = new Set(cutover.legacy_runtime_modules_pending_retirement);
  for (const manifest of workspaceManifest.all()) {
    for (const dependency of [...manifest.required, ...manifest.optional]) {
      assert.equal(forbidden.has(dependency), false, `${manifest.workspaceId}: ${dependency}`);
    }
  }
  assert.deepEqual(cutover.rollback_contract, {
    runtime_absent_preserves_input: true,
    runtime_failure_preserves_input: true,
    completed_response_cache_owner: "consumer",
    plugin_completed_cache_allowed: false,
    legacy_transport_call_count: 0,
  });
});
