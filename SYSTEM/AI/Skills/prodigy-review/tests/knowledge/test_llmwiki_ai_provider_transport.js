"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");
const { test } = require("node:test");

const ROOT = path.resolve(__dirname, "../../../../../..");
const transport = require(path.join(ROOT, "SYSTEM/Views/llmwiki-ai-provider-transport.js"));
const schema = require(path.join(ROOT, "SYSTEM/Views/llmwiki-provider-response-schema.js"));
const HASH = "a".repeat(64);

function normalized() {
  return {
    feature: "llmwiki",
    timeout_ms: 60000,
    request_metadata: { request_id: "request_fixture", trace: "runtime-test" },
    outbound_payload: {
      proposal_request: { run_id: "run_transport_fixture", instruction: "bounded proposal" },
      sources: [{ source_id: "source_a", content_hash: HASH, locator: "ZETA/LITERATURE/a.md#p1" }],
    },
  };
}
function response() {
  return {
    status: "ok",
    proposal_bundle: {
      run_id: "run_transport_fixture",
      validation_context: { persistence: "none" },
      proposals: [{
        kind: "create",
        title: "bounded proposal",
        confidence: "explicit",
        source_citations: [{
          source_id: "source_a",
          content_hash: HASH,
          locators: ["ZETA/LITERATURE/a.md#p1"],
          confidence: "explicit",
        }],
      }],
    },
    response_metadata: { provider_status: "ok", latency_ms: 4 },
  };
}

test("Wiki transport sends one provider-neutral request after consent hashes validate", async () => {
  const calls = [];
  const result = await transport.requestProposal({
    schema,
    normalized: normalized(),
    consent: { consent_hash: HASH, outbound_policy_hash: HASH, outbound_text_hash: HASH },
    validateProposalBundle: () => ({ ok: true }),
    consumerRuntime: {
      async requestStructured(request) {
        calls.push(request);
        return { payload: response(), receipt: { provider_key: "fake", model: "fake-model" } };
      },
    },
  });
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.equal(calls.length, 1);
  assert.equal(calls[0].consumerId, "wiki.batch_analysis");
  assert.equal(calls[0].prompt.includes("api_key"), false);
  assert.equal(result.provider_key, "fake");
  assert.equal(result.fallback_attempted, false);
});

test("missing schema or malformed consent blocks before runtime", async () => {
  let calls = 0;
  const runtime = { async requestStructured() { calls += 1; return { payload: response() }; } };
  const missingSchema = await transport.requestProposal({ normalized: normalized(), consumerRuntime: runtime });
  assert.equal(missingSchema.code, "response_schema_required");
  const badConsent = await transport.requestProposal({
    schema,
    normalized: normalized(),
    consent: { consent_hash: "bad" },
    consumerRuntime: runtime,
  });
  assert.equal(badConsent.code, "consent_invalid");
  assert.equal(calls, 0);
});

test("runtime errors are mapped without raw payload or fallback", async () => {
  const error = Object.assign(new Error("SECRET_RAW"), { code: "route_unreachable" });
  const result = await transport.requestProposal({
    schema,
    normalized: normalized(),
    consumerRuntime: { async requestStructured() { throw error; } },
  });
  assert.equal(result.ok, false);
  assert.equal(result.raw_payload_exposed, false);
  assert.equal(result.fallback_attempted, false);
  assert.doesNotMatch(JSON.stringify(result), /SECRET_RAW/u);
});
