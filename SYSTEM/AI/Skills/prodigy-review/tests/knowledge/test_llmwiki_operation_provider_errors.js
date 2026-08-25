"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");
const { test } = require("node:test");

const ROOT = path.resolve(__dirname, "../../../../../..");
const production = require(path.join(ROOT, "SYSTEM/Views/llmwiki-production-operation-provider.js"));
const INPUT = { outbound_allowed: true, run_id: "run_errors", changed_chunks: [{ key: "chunk_alpha", text: "Alpha" }] };

function providerThrowing(error, onRequest = () => {}) {
  return production.createProductionOperationProvider({
    app: {}, config: {}, getProviderMode: () => "direct",
    configApi: { resolveAIProfileProviderKey: () => ({ ok: true, provider_mode: "direct", provider_key: "fixture", provider: { adapter: "fixture" } }) },
    providerService: { requestStructuredJsonOnce: async (options) => { onRequest(options); throw error; } },
  });
}

test("chunk provider preserves typed auth and sandbox reasons without transport retry", async () => {
  for (const [error, reason] of [
    [Object.assign(new Error("auth required"), { code: "ANTIGRAVITY_AUTH_REQUIRED" }), "provider_auth_required"],
    [Object.assign(new Error("sandbox blocked"), { code: "ANTIGRAVITY_SANDBOX_BLOCKED" }), "provider_tool_blocked"],
  ]) {
    let request;
    const result = await providerThrowing(error, (options) => { request = options; })(INPUT);
    assert.equal(result.reason, reason);
    assert.equal(result.provider_call_count, 1);
    assert.equal(result.automatic_retry_count, 0);
    assert.equal(result.canonical_write_count, 0);
    for (const forbidden of ["providerKey", "providerMode", "requestMetadata", "consent"]) assert.equal(forbidden in request, false);
  }
});

test("chunk provider preserves quota and outcome-unknown as zero-write terminal states", async () => {
  for (const [error, reason] of [
    [Object.assign(new Error("quota"), { code: "ANTIGRAVITY_QUOTA_EXHAUSTED" }), "provider_quota_exhausted"],
    [Object.assign(new Error("timeout"), { code: "ETIMEDOUT" }), "provider_outcome_unknown"],
  ]) {
    const result = await providerThrowing(error)(INPUT);
    assert.equal(result.reason, reason);
    assert.equal(result.resubmission_count, 0);
    assert.equal(result.accepted_chunk_count, 0);
    assert.equal(result.source_writes, 0);
  }
});

test("chunk provider schema contains semantic results and excludes legacy write authority", () => {
  const schema = production.TYPED_SCHEMA;
  assert.deepEqual(schema.required, ["status", "chunk_results"]);
  assert.equal(Object.hasOwn(schema.properties, "canonical_proposal"), false);
  assert.equal(Object.hasOwn(schema.properties, "serialized_operation"), false);
  assert.equal(Object.hasOwn(schema.properties, "destination_ids"), false);
  assert.equal(schema.properties.chunk_results.maxItems, production.MAX_CHANGED_CHUNKS);
});
