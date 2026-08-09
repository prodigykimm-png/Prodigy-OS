"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "../../../../../..");
const configService = require(path.join(ROOT, "SYSTEM/Views/prodigy-config-service.js"));
const contract = require(path.join(ROOT, "SYSTEM/Views/llmwiki-provider-contract.js"));

const HASH = "a".repeat(64);

function configFor(overrides = {}) {
  return configService.mergeConfig(configService.DEFAULT_CONFIG, {
    defaultProvider: "gemini",
    aiProfiles: {
      schema_version: 1,
      llmwiki: {
        direct_provider_key: overrides.direct_provider_key === undefined ? "groq" : overrides.direct_provider_key,
        omniroute_provider_key: overrides.omniroute_provider_key === undefined ? "openrouter" : overrides.omniroute_provider_key,
      },
    },
    providers: {
      groq: { adapter: "openai-compatible", model: "contract-fixture", authMode: "none" },
      openrouter: { adapter: "openai-compatible", model: "route-fixture", authMode: "none" },
    },
  });
}

function request(config, mode = "direct", providerKey) {
  const resolved = configService.resolveAIProfileProviderKey(config, "llmwiki", mode);
  const key = providerKey || (resolved.ok ? resolved.provider_key : "");
  return {
    feature: "llmwiki",
    provider_mode: mode,
    timeout_ms: 1000,
    retry_owner: mode === "omniroute" ? "gateway" : "prodigy",
    request_metadata: { request_id: "request_contract_fixture", provider_key: key },
    source_scope: { allowed_source_ids: ["source_a"], allowed_locator_prefixes: ["ZETA/LITERATURE/"] },
    outbound_policy: { include_source_text: true, include_unselected_vault_data: false, include_credentials: false, include_cookies: false },
    sources: [{ source_id: "source_a", content_hash: HASH, locator: "ZETA/LITERATURE/a.md#p1", selected: true, sensitivity: "public", confidence: "explicit", outbound_text: "fixture" }],
    proposal_request: { run_id: "run_contract_fixture", instruction: "bounded proposal" },
  };
}

test("provider selection resolves configured keys without label aliases", () => {
  const config = configFor();
  const direct = contract.selectProviderProfile(request(config, "direct"), { config });
  const omni = contract.selectProviderProfile(request(config, "omniroute"), { config });

  assert.equal(direct.ok, true, JSON.stringify(direct));
  assert.equal(direct.value.provider_key, "groq");
  assert.deepEqual(direct.value.provider, config.providers.groq);
  assert.equal(omni.ok, true, JSON.stringify(omni));
  assert.equal(omni.value.provider_key, "openrouter");
  assert.deepEqual(omni.value.provider, config.providers.openrouter);
});

test("missing or mismatched provider identity fails closed before transport", () => {
  const config = configFor({ omniroute_provider_key: "" });
  const missing = contract.selectProviderProfile(request(config, "omniroute"), { config });
  assert.equal(missing.ok, false);
  assert.equal(missing.reason, "provider_unavailable");

  const mismatch = contract.selectProviderProfile(request(configFor(), "direct", "openrouter"), { config: configFor() });
  assert.equal(mismatch.ok, false);
  assert.equal(mismatch.reason, "provider_identity_mismatch");
});

test("provider failures expose safe normalized reasons only", async () => {
  const config = configFor();
  const result = await contract.invokeProposalProvider(request(config), {
    config,
    transport: async () => { throw Object.assign(new Error("raw provider secret fixture_provider_secret_marker"), { status: 429 }); },
  });

  assert.equal(result.ok, false);
  assert.equal(result.reason, "provider_rate_limited");
  assert.equal(JSON.stringify(result).includes("sk_live"), false);
  assert.equal(result.writer_count, 0);
});
