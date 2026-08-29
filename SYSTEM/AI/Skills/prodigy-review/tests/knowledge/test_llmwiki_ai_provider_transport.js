"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "../../../../../../");
const configService = require(path.join(ROOT, "SYSTEM/Views/prodigy-config-service.js"));
const transport = require(path.join(ROOT, "SYSTEM/Views/llmwiki-ai-provider-transport.js"));
const providerResponseSchema = require(path.join(ROOT, "SYSTEM/Views/llmwiki-provider-response-schema.js"));

const HASH = "a".repeat(64);

function configFor(profile = {}) {
  return configService.mergeConfig(configService.DEFAULT_CONFIG, {
    defaultProvider: "gemini",
    aiProfiles: {
      schema_version: 1,
      llmwiki: {
        direct_provider_key: profile.direct_provider_key === undefined ? "groq" : profile.direct_provider_key,
        omniroute_provider_key: profile.omniroute_provider_key === undefined ? "openrouter" : profile.omniroute_provider_key
      }
    },
    providers: {
      groq: { adapter: "openai-compatible", model: "groq-fixture", authMode: "none" },
      openrouter: { adapter: "openai-compatible", model: "route-fixture", authMode: "none" }
    }
  });
}

function normalized(config, mode = "direct", overrides = {}) {
  const selected = configService.resolveAIProfileProviderKey(config, "llmwiki", mode);
  const providerKey = overrides.provider_key || selected.provider_key;
  return {
    feature: "llmwiki",
    provider_mode: mode,
    provider_key: providerKey,
    timeout_ms: 4321,
    request_metadata: { request_id: "request_fixture", trace: "transport-test", provider_key: overrides.metadata_provider_key || providerKey },
    outbound_payload: {
      proposal_request: { run_id: "run_transport_fixture", instruction: "bounded proposal" },
      sources: [{ source_id: "source_a", content_hash: HASH, locator: "ZETA/LITERATURE/a.md#p1" }]
    },
    ...overrides
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
        source_citations: [{ source_id: "source_a", content_hash: HASH, locators: ["ZETA/LITERATURE/a.md#p1"], confidence: "explicit" }]
      }]
    },
    response_metadata: { provider_status: "ok", latency_ms: 4 }
  };
}

function validator(bundle) {
  return bundle && bundle.run_id === "run_transport_fixture" ? { ok: true, value: bundle } : { ok: false, reason: "invalid" };
}

async function testExactDirectAndOmniIdentity() {
  const config = configFor();
  const calls = [];
  const providerService = {
    async requestStructuredJsonOnce(options) {
      calls.push(options);
      return response();
    }
  };
  const signal = new AbortController().signal;
  const consent = { consent_hash: HASH, outbound_policy_hash: HASH, outbound_text_hash: HASH };
  const direct = await transport.requestProposal({ config, providerService, signal, consent, schema: providerResponseSchema, normalized: normalized(config, "direct"), validateProposalBundle: validator });
  const omni = await transport.requestProposal({ config, providerService, signal, consent, schema: providerResponseSchema, normalized: normalized(config, "omniroute"), validateProposalBundle: validator });

  assert.equal(direct.ok, true, JSON.stringify(direct));
  assert.equal(omni.ok, true, JSON.stringify(omni));
  assert.deepEqual(calls.map((item) => item.providerKey), ["gemini", "openrouter"]);
  assert.deepEqual(calls.map((item) => item.providerMode), ["direct", "omniroute"]);
  assert.deepEqual(calls[0].provider, config.providers.gemini);
  assert.deepEqual(calls[1].provider, config.providers.openrouter);
  assert.equal(calls[0].timeoutMs, 4321);
  assert.equal(calls[0].signal, signal);
  assert.equal(calls[0].requestMetadata.provider_key, "gemini");
  assert.equal(calls[1].requestMetadata.provider_key, "openrouter");
  assert.deepEqual(calls[0].consent, consent);
  assert.equal(calls[0].prompt.includes("api_key"), false);
  assert.equal(calls[0].prompt.includes("fallback"), false);
  assert.equal(direct.fallback_attempted, false);
  assert.equal(omni.fallback_attempted, false);
}

async function testIdentityMismatchIsNoCall() {
  const config = configFor();
  let calls = 0;
  const result = await transport.requestProposal({
    config,
    schema: providerResponseSchema,
    providerService: { async requestStructuredJsonOnce() { calls += 1; return response(); } },
    normalized: normalized(config, "direct", { provider_key: "openrouter", metadata_provider_key: "openrouter" }),
    validateProposalBundle: validator
  });
  assert.equal(result.ok, false);
  assert.equal(result.code, "provider_identity_mismatch");
  assert.equal(result.call_allowed, false);
  assert.equal(calls, 0);
}
async function testMissingSchemaIsNoCall() {
  const config = configFor();
  let calls = 0;
  const result = await transport.requestProposal({
    config,
    providerService: { async requestStructuredJsonOnce() { calls += 1; return response(); } },
    normalized: normalized(config),
    validateProposalBundle: validator,
  });
  assert.equal(result.ok, false);
  assert.equal(result.code, "response_schema_required");
  assert.equal(result.call_allowed, false);
  assert.equal(calls, 0);
}

async function testOmniMissingKeyIsNoCall() {
  const config = configFor({ omniroute_provider_key: "" });
  let calls = 0;
  const selected = configService.resolveAIProfileProviderKey(config, "llmwiki", "omniroute");
  assert.equal(selected.ok, false);
  assert.equal(selected.call_allowed, false);
  const result = await transport.requestProposal({
    config,
    providerService: { async requestStructuredJsonOnce() { calls += 1; return response(); } },
    schema: providerResponseSchema,
    normalized: normalized(config, "omniroute"),
    validateProposalBundle: validator
  });
  assert.equal(result.ok, false);
  assert.equal(calls, 0);
}

async function testStrictResponseAndSafeFailures() {
  const config = configFor();
  const base = { config, schema: providerResponseSchema, normalized: normalized(config), validateProposalBundle: validator };
  const wrongCitationHash = response();
  wrongCitationHash.proposal_bundle.proposals[0].source_citations[0].content_hash = "b".repeat(64);
  const wrongCitationLocator = response();
  wrongCitationLocator.proposal_bundle.proposals[0].source_citations[0].locators = ["ZETA/LITERATURE/other.md#p9"];
  for (const bad of [
    { ...response(), extra: "provider raw reason" },
    { ...response(), status: "approved" },
    { ...response(), proposal_bundle: { ...response().proposal_bundle, write_intent: { target: "canonical" } } },
    wrongCitationHash,
    wrongCitationLocator
  ]) {
    const result = await transport.requestProposal({ ...base, providerService: { async requestStructuredJsonOnce() { return bad; } } });
    assert.equal(result.ok, false, JSON.stringify(result));
    assert.equal(result.raw_payload_exposed, false);
  }
  const invalidBundle = await transport.requestProposal({ ...base, providerService: { async requestStructuredJsonOnce() { return response(); } }, validateProposalBundle: () => ({ ok: false }) });
  assert.equal(invalidBundle.code, "proposal_bundle_invalid");

  const raw = "provider raw reason fixture_provider_secret_marker";
  const rateLimited = await transport.requestProposal({ ...base, providerService: { async requestStructuredJsonOnce() { throw Object.assign(new Error(raw), { status: 429 }); } } });
  assert.equal(rateLimited.ok, false);
  assert.equal(rateLimited.code, "provider_rate_limited");
  assert.match(rateLimited.message, /사용량|잠시/);
  assert.equal(rateLimited.message.includes(raw), false);
  assert.equal(JSON.stringify(rateLimited).includes("sk_live"), false);

  const timedOut = await transport.requestProposal({ ...base, providerService: { async requestStructuredJsonOnce() { throw Object.assign(new Error(raw), { code: "ETIMEDOUT" }); } } });
  assert.equal(timedOut.code, "provider_timeout");
  assert.match(timedOut.message, /시간|초과/);

  const controller = new AbortController();
  controller.abort();
  const aborted = await transport.requestProposal({ ...base, signal: controller.signal, providerService: { async requestStructuredJsonOnce() { throw new Error("must not call"); } } });
  assert.equal(aborted.code, "provider_aborted");
}

(async () => {
  await testExactDirectAndOmniIdentity();
  await testIdentityMismatchIsNoCall();
  await testMissingSchemaIsNoCall();
  await testOmniMissingKeyIsNoCall();
  await testStrictResponseAndSafeFailures();
  console.log("LLMWiki AI provider transport tests passed.");
})().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});
