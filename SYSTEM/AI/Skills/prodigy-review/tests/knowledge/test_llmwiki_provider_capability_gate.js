"use strict";

// Task 4: one global-provider capability and frozen-identity gate.
// Characterizes that LLM Wiki batch readiness resolves ONLY the global
// defaultProvider, ignores legacy aiProfiles.llmwiki.direct_provider_key,
// validates provider/model/auth/structured-output dialect locally,
// performs zero network probes, freezes run identity, and rejects drift.

const assert = require("node:assert/strict");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "../../../../../../");
const service = require(path.join(ROOT, "SYSTEM/Views/prodigy-config-service.js"));
const hash = require(path.join(ROOT, "SYSTEM/Views/llmwiki-hash.js"));
const gate = require(path.join(ROOT, "SYSTEM/Views/llmwiki-provider-capability.js"));

function createApp(secrets) {
  return {
    vault: {
      getAbstractFileByPath(filePath) {
        if (filePath !== service.CONFIG_PATH) return null;
        return { path: filePath };
      },
      async read(file) { return files[file.path]; },
      async createFolder() {},
      async create() {},
      async modify() {}
    },
    secretStorage: {
      async getSecret(secretId) { return secrets[secretId] || ""; },
      async setSecret(secretId, value) { secrets[secretId] = value; },
      async deleteSecret(secretId) { delete secrets[secretId]; }
    }
  };
}

let files = {};
function appWithConfig(configJson, secrets) {
  files = { [service.CONFIG_PATH]: typeof configJson === "string" ? configJson : JSON.stringify(configJson) };
  return createApp(secrets || {});
}

async function testOpenRouterReadyProducesFrozenIdentity() {
  const app = appWithConfig({
    defaultProvider: "openrouter",
    aiProfiles: { schema_version: 1, llmwiki: { direct_provider_key: "", omniroute_provider_key: "" } }
  }, { [service.SECRET_IDS.openrouter]: "or-key" });

  const config = await service.load(app);
  const ready = await gate.resolveBatchReadiness(app, config);

  assert.equal(ready.ok, true);
  assert.equal(ready.call_allowed, true);
  assert.equal(ready.network_calls, 0);
  const identity = ready.identity;
  assert.equal(identity.provider_key, "openrouter");
  assert.equal(identity.provider_name, "OpenRouter");
  assert.equal(identity.model, "openrouter/free");
  assert.equal(identity.mode, "direct");
  assert.equal(identity.structured_mode, "json-mode");
  assert.equal(identity.schema_dialect, "");
  assert.match(identity.profile_revision, /^[0-9a-f]{64}$/);
  // Frozen: mutation must not be possible.
  assert.throws(() => { identity.provider_key = "gemini"; });
  assert.equal(Object.isFrozen(identity), true);
}

async function testAntigravityExecReadyWithoutHttpSecret() {
  const app = appWithConfig({ defaultProvider: "antigravity" }, {});
  const config = await service.load(app);
  const ready = await gate.resolveBatchReadiness(app, config);
  assert.equal(ready.ok, true, ready.reason || "");
  assert.equal(ready.identity.provider_key, "antigravity");
  assert.equal(ready.identity.model, "gemini-3.6-flash-medium");
  assert.equal(ready.identity.structured_mode, "json-schema");
  assert.equal(ready.identity.mode, "direct");
  assert.equal(ready.network_calls, 0);
}

// Exec readiness identities must freeze the SAME computed profile_revision
// contract as assertIdentityMatches: identical exec config self-check passes,
// model/capability drift rejects. No secret values, zero network.
async function testExecIdentitySelfMatchAndDrift() {
  for (const [providerKey, patch] of [
    ["antigravity", null],
    ["codex", { providers: { codex: { model: "gpt-5-codex" } } }]
  ]) {
    const app = appWithConfig(Object.assign(
      { defaultProvider: providerKey },
      patch || {}
    ), {});
    const config = await service.load(app);
    const run = await gate.resolveBatchReadiness(app, config);
    assert.equal(run.ok, true, `${providerKey}: ${run.reason || ""}`);
    assert.match(run.identity.profile_revision, /^[0-9a-f]{64}$/, `${providerKey}: exec identity must freeze a computed profile_revision`);
    // Identical config self-check must pass.
    const selfCheck = gate.assertIdentityMatches(run.identity, config);
    assert.deepEqual(selfCheck.changed_fields, [], `${providerKey}: ${JSON.stringify(selfCheck)}`);
    assert.equal(selfCheck.ok, true, `${providerKey}: identical exec config must not be identity_drift`);
    assert.equal(selfCheck.network_calls, 0);
  }

  // Model drift on the frozen exec identity rejects.
  const app = appWithConfig({ defaultProvider: "antigravity" }, {});
  const config = await service.load(app);
  const run = await gate.resolveBatchReadiness(app, config);
  assert.equal(run.ok, true);
  const modelDrift = gate.assertIdentityMatches(run.identity, service.mergeConfig(config, {
    providers: { antigravity: { model: "gemini-3.1-pro-high" } }
  }));
  assert.equal(modelDrift.ok, false);
  assert.equal(modelDrift.code, "identity_drift");
  assert.deepEqual([...modelDrift.changed_fields].sort(), ["model", "profile_revision"]);
  assert.equal(modelDrift.network_calls, 0);

  // Capability drift on the frozen exec identity also rejects.
  const capDrift = gate.assertIdentityMatches(run.identity, service.mergeConfig(config, {
    providers: { antigravity: { capabilities: { structuredOutput: "json-prompt" } } }
  }));
  assert.equal(capDrift.ok, false);
  assert.equal(capDrift.code, "identity_drift");
  assert.ok([...capDrift.changed_fields].includes("structured_mode"));
  assert.ok([...capDrift.changed_fields].includes("schema_capability"));
  assert.ok([...capDrift.changed_fields].includes("profile_revision"));
  assert.equal(capDrift.network_calls, 0);
}

async function testGeminiSchemaNormalizationReadiness() {
  const app = appWithConfig({ defaultProvider: "gemini" }, { [service.SECRET_IDS.gemini]: "g-key" });
  const config = await service.load(app);
  const ready = await gate.resolveBatchReadiness(app, config);
  assert.equal(ready.ok, true);
  assert.equal(ready.identity.structured_mode, "json-schema");
  assert.equal(ready.identity.schema_dialect, "gemini");
  // The declared dialect must actually normalize an incompatible fixture schema.
  const normalized = gate.normalizeSchemaForIdentity(ready.identity, {
    type: "object",
    properties: {
      items: { type: "array", const: [], maxItems: 0, maxLength: 3000, exclusiveMinimum: 0 }
    }
  });
  assert.equal("exclusiveMinimum" in normalized.properties.items, false, "Gemini dialect must drop unsupported keys");
  assert.deepEqual(normalized.properties.items.enum, [[]]);
}

async function testJsonModeCompatibilityAccepted() {
  for (const key of ["groq", "openai-compatible"]) {
    const app = appWithConfig(
      key === "groq"
        ? { defaultProvider: "groq" }
        : { defaultProvider: "openai-compatible", providers: { "openai-compatible": { model: "gpt-4o-mini" } } },
      key === "groq" ? { [service.SECRET_IDS.groq]: "k" } : { [service.SECRET_IDS.openaiCompatible]: "k" }
    );
    const config = await service.load(app);
    const ready = await gate.resolveBatchReadiness(app, config);
    assert.equal(ready.ok, true, `${key}: ${ready.reason || ""}`);
    assert.equal(ready.identity.structured_mode, "json-mode");
    assert.equal(ready.network_calls, 0);
  }
}

async function testMissingSecretBlockedWithZeroNetworkCalls() {
  const app = appWithConfig({ defaultProvider: "openrouter" }, {});
  const config = await service.load(app);
  const ready = await gate.resolveBatchReadiness(app, config);
  assert.equal(ready.ok, false);
  assert.equal(ready.call_allowed, false);
  assert.equal(ready.code, "secret_missing");
  assert.equal(ready.network_calls, 0);
  assert.match(ready.reason, /openrouter/i);
}

async function testMalformedConfigBlockedWithZeroNetworkCalls() {
  const app = appWithConfig("{ not valid json", {});
  let blocked;
  try {
    await service.load(app);
    assert.fail("load must throw on malformed config");
  } catch (_error) {
    blocked = gate.resolveBatchReadinessFromError(_error);
  }
  assert.equal(blocked.ok, false);
  assert.equal(blocked.call_allowed, false);
  assert.equal(blocked.code, "config_invalid");
  assert.equal(blocked.network_calls, 0);
}

async function testLegacyOverrideConflictStillSelectsGlobalProvider() {
  const app = appWithConfig({
    defaultProvider: "gemini",
    aiProfiles: { schema_version: 1, llmwiki: { direct_provider_key: "groq", omniroute_provider_key: "" } }
  }, { [service.SECRET_IDS.gemini]: "g-key" });
  const config = await service.load(app);
  const ready = await gate.resolveBatchReadiness(app, config);
  assert.equal(ready.ok, true, ready.reason || "");
  assert.equal(ready.identity.provider_key, "gemini", "legacy feature-specific override must be ignored");
  assert.notEqual(ready.identity.provider_key, "groq");
  assert.equal(ready.network_calls, 0);
}

async function testProfileChangeMidRunIsRejectedAsDrift() {
  const app = appWithConfig({ defaultProvider: "gemini" }, { [service.SECRET_IDS.gemini]: "g-key" });
  const config = await service.load(app);
  const run = await gate.resolveBatchReadiness(app, config);
  assert.equal(run.ok, true);

  // Same config still matches.
  assert.equal(gate.assertIdentityMatches(run.identity, config).ok, true);

  const drifted = service.mergeConfig(config, {
    defaultProvider: "groq",
    aiProfiles: { schema_version: 1, llmwiki: { omniroute_provider_key: "openrouter" } }
  });
  const verdict = gate.assertIdentityMatches(run.identity, drifted);
  assert.equal(verdict.ok, false);
  assert.equal(verdict.call_allowed, false);
  assert.equal(verdict.code, "identity_drift");
  assert.ok(verdict.changed_fields.includes("provider_key"));
  assert.ok(verdict.changed_fields.includes("profile_revision"));
  assert.equal(verdict.network_calls, 0);

  // Model-only drift on the same provider also rejects.
  const modelDrift = service.mergeConfig(config, { providers: { gemini: { model: "gemini-3.1-pro" } } });
  const modelVerdict = gate.assertIdentityMatches(run.identity, modelDrift);
  assert.equal(modelVerdict.ok, false);
  assert.deepEqual([...modelVerdict.changed_fields].sort(), ["model", "profile_revision"]);
}

async function testIdentityBindsRoutingAndSecurityFields() {
  const app = appWithConfig({ defaultProvider: "openrouter" }, { [service.SECRET_IDS.openrouter]: "or-key" });
  const config = await service.load(app);
  const run = await gate.resolveBatchReadiness(app, config);
  assert.equal(run.ok, true);
  const identity = run.identity;
  // Routing/security fields are part of the frozen identity...
  assert.equal(identity.adapter, "openai-compatible");
  assert.equal(identity.base_url, "https://openrouter.ai/api/v1");
  assert.equal(identity.endpoint_path, "/chat/completions");
  assert.equal(identity.auth_mode, "bearer");
  assert.equal(identity.api_key_secret_id, service.SECRET_IDS.openrouter);
  assert.ok("api_key_header" in identity);
  // ...but never secret values.
  assert.equal(JSON.stringify(identity).includes("or-key"), false);

  const cases = [
    [{ openrouter: { model: "other/model" } }, "model"],
    [{ openrouter: { baseURL: "https://mirror.example.com/v1" } }, "base_url"],
    [{ openrouter: { endpointPath: "/v1/chat/completions" } }, "endpoint_path"],
    [{ openrouter: { authMode: "none" } }, "auth_mode"],
    [{ openrouter: { endpointURL: "https://mirror.example.com/v1/chat/completions" } }, "endpoint_url"],
    [{ openrouter: { capabilities: { structuredOutput: "json-prompt" } } }, "structured_mode"]
  ];
  for (const [patch, expectedField] of cases) {
    const drifted = service.mergeConfig(config, { providers: patch });
    const verdict = gate.assertIdentityMatches(identity, drifted);
    assert.equal(verdict.ok, false);
    assert.equal(verdict.call_allowed, false);
    assert.equal(verdict.code, "identity_drift");
    assert.equal(verdict.network_calls, 0);
    assert.ok([...verdict.changed_fields].includes(expectedField), `${expectedField}: ${JSON.stringify(verdict.changed_fields)}`);
    assert.ok([...verdict.changed_fields].includes("profile_revision"));
  }

  // Secret identifier rebinding (id only) also drifts.
  const rebound = service.mergeConfig(config, {
    aiProfiles: { schema_version: 1, llmwiki: { omniroute_provider_key: "" } }
  });
  rebound.providers.openrouter.apiKeySecret = service.SECRET_IDS.groq;
  const secretVerdict = gate.assertIdentityMatches(identity, rebound);
  assert.equal(secretVerdict.ok, false);
  assert.ok([...secretVerdict.changed_fields].includes("api_key_secret_id"));
  assert.equal(secretVerdict.network_calls, 0);
}

async function testMissingAndMalformedRoutingValuesStayLocal() {
  // Missing baseURL on a custom openai-compatible provider: frozen as empty string.
  const app = appWithConfig({
    defaultProvider: "lm-studio"
  }, {});
  const config = await service.load(app);
  const ready = await gate.resolveBatchReadiness(app, config);
  assert.equal(ready.ok, true, ready.reason || ""); // authMode none needs no secret
  assert.equal(ready.identity.base_url, "http://127.0.0.1:1234/v1");

  // Malformed structured-output capability: machine reason, zero calls.
  const broken = service.mergeConfig(service.DEFAULT_CONFIG, {
    defaultProvider: "groq",
    providers: { groq: { capabilities: { structuredOutput: "xml-schema" } } }
  });
  const blocked = await gate.resolveBatchReadiness(createApp({}), broken);
  assert.equal(blocked.ok, false);
  assert.equal(blocked.call_allowed, false);
  assert.equal(blocked.code, "structured_mode_unsupported");
  assert.equal(blocked.network_calls, 0);
}

async function testNoNetworkSurfaceExistsInGateModule() {
  // The gate must have no HTTP/fetch/request surface at all: a paid/network
  // probe is structurally impossible, not just unexercised.
  for (const key of Object.keys(gate)) {
    assert.equal(/fetch|http|request|probe|call/i.test(key) && key !== "resolveBatchReadiness" && key !== "resolveBatchReadinessFromError" && key !== "assertIdentityMatches", false, `unexpected network-ish export: ${key}`);
  }
  const source = require("node:fs").readFileSync(path.join(ROOT, "SYSTEM/Views/llmwiki-provider-capability.js"), "utf8");
  assert.equal(/\bfetch\s*\(|XMLHttpRequest|\.post\(|https?:\/\//.test(source), false, "gate source must contain no network surface");
}

(async () => {
  await testOpenRouterReadyProducesFrozenIdentity();
  await testAntigravityExecReadyWithoutHttpSecret();
  await testExecIdentitySelfMatchAndDrift();
  await testGeminiSchemaNormalizationReadiness();
  await testJsonModeCompatibilityAccepted();
  await testMissingSecretBlockedWithZeroNetworkCalls();
  await testMalformedConfigBlockedWithZeroNetworkCalls();
  await testLegacyOverrideConflictStillSelectsGlobalProvider();
  await testProfileChangeMidRunIsRejectedAsDrift();
  await testIdentityBindsRoutingAndSecurityFields();
  await testMissingAndMalformedRoutingValuesStayLocal();
  await testNoNetworkSurfaceExistsInGateModule();
  console.log("LLM Wiki provider capability gate tests passed.");
})().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});
