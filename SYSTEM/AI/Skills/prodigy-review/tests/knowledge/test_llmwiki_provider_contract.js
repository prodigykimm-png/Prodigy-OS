"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "../../../../../..");
const contract = require(path.join(ROOT, "SYSTEM/Views/llmwiki-provider-contract.js"));
const HASH = "a".repeat(64);

function request(overrides = {}) {
  return {
    feature: "llmwiki",
    timeout_ms: 60000,
    retry_owner: "prodigy",
    request_metadata: { request_id: "request_contract_fixture" },
    source_scope: { allowed_source_ids: ["source_a"], allowed_locator_prefixes: ["ZETA/LITERATURE/"] },
    outbound_policy: {
      include_source_text: true,
      include_unselected_vault_data: false,
      include_credentials: false,
      include_cookies: false,
    },
    sources: [{
      source_id: "source_a",
      content_hash: HASH,
      locator: "ZETA/LITERATURE/a.md#p1",
      selected: true,
      sensitivity: "public",
      confidence: "explicit",
      outbound_text: "fixture",
    }],
    proposal_request: { run_id: "run_contract_fixture", instruction: "bounded proposal" },
    ...overrides,
  };
}

test("provider profile is runtime-owned while source scope remains consumer-owned", () => {
  const profile = contract.selectProviderProfile(request());
  assert.equal(profile.ok, true, JSON.stringify(profile));
  assert.equal(profile.value.provider_mode, "runtime");
  assert.equal(profile.value.provider_key, "runtime");
  assert.equal(profile.value.retry_owner, "prodigy");
  const normalized = contract.normalizeRequest(request(), profile.value);
  assert.equal(normalized.ok, true, JSON.stringify(normalized));
  assert.deepEqual(normalized.value.outbound_payload.sources.map((source) => source.source_id), ["source_a"]);
});

test("explicit provider selection and unknown metadata fail before transport", () => {
  assert.equal(contract.selectProviderProfile(request({ provider_mode: "omniroute" })).reason, "invalid_provider_mode");
  assert.equal(contract.selectProviderProfile(request({
    request_metadata: { request_id: "request_contract_fixture", provider_key: "injected" },
  })).reason, "unknown_request_metadata");
});

test("runtime failures expose safe normalized reasons only", async () => {
  const result = await contract.invokeProposalProvider(request(), {
    transport: async () => {
      throw Object.assign(new Error("raw provider secret fixture_provider_secret_marker"), { status: 429 });
    },
  });
  assert.equal(result.ok, false);
  assert.equal(result.reason, "provider_rate_limited");
  assert.equal(JSON.stringify(result).includes("fixture_provider_secret_marker"), false);
  assert.equal(result.writer_count, 0);
});
