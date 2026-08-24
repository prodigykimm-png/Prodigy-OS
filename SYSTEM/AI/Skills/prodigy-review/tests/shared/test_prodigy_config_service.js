const assert = require("node:assert/strict");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "../../../../../../");
const service = require(path.join(ROOT, "SYSTEM/Views/prodigy-config-service.js"));

function createApp(files, secrets) {
  return {
    vault: {
      getAbstractFileByPath(filePath) {
        return Object.prototype.hasOwnProperty.call(files, filePath) ? { path: filePath } : null;
      },
      async read(file) { return files[file.path]; },
      async createFolder(folderPath) { files[folderPath] = "__folder__"; },
      async create(filePath, text) { files[filePath] = text; },
      async modify(file, text) { files[file.path] = text; }
    },
    secretStorage: {
      async getSecret(secretId) { return secrets[secretId] || ""; },
      async setSecret(secretId, value) { secrets[secretId] = value; },
      async deleteSecret(secretId) { delete secrets[secretId]; }
    }
  };
}

async function testLegacyConfigLoadsWithoutWriting() {
  const files = {
    "SYSTEM/PRIVATE/project-wizard.local.json": JSON.stringify({
      defaultProvider: "gemini",
      providers: { gemini: { model: "gemini-2.5-flash" } },
      workflowPresets: { Client: [{ label: "요구사항 확인" }] }
    })
  };
  const app = createApp(files, {});

  const config = await service.load(app);

  assert.equal(config.defaultProvider, "gemini");
  assert.equal(config.providers.gemini.model, "gemini-2.5-flash");
  assert.equal(config.workflowPresets.Client[0].label, "요구사항 확인");
  assert.equal(files[service.CONFIG_PATH], undefined);
}

async function testSaveWritesCanonicalConfigAndKeepsSecretsOut() {
  const files = {};
  const secrets = {};
  const app = createApp(files, secrets);

  const saved = await service.save(app, {
    defaultProvider: "mimo",
    config: { providers: { mimo: { model: "mimo-test" } } },
    secrets: {
      "prodigy-mimo-api-key": "mimo-secret",
      "prodigy-todoist-api-token": "todoist-secret",
      "prodigy-reb-openapi-key": "reb-secret"
    }
  });

  const text = files[service.CONFIG_PATH];
  assert.ok(text);
  assert.equal(saved.defaultProvider, "mimo");
  assert.equal(JSON.parse(text).providers.mimo.model, "mimo-test");
  assert.equal(text.includes("mimo-secret"), false);
  assert.equal(text.includes("todoist-secret"), false);
  assert.equal(secrets["prodigy-mimo-api-key"], "mimo-secret");
  assert.equal(secrets["prodigy-todoist-api-token"], "todoist-secret");
  assert.equal(secrets["prodigy-reb-openapi-key"], "reb-secret");
}

async function testCanonicalConfigBeatsLegacyAndOnlyDeletesRequestedSecret() {
  const files = {
    [service.CONFIG_PATH]: JSON.stringify({
      defaultProvider: "lm-studio",
      providers: { "lm-studio": { model: "new-model" } }
    }),
    "SYSTEM/PRIVATE/project-wizard.local.json": JSON.stringify({
      defaultProvider: "gemini",
      providers: { gemini: { model: "legacy-model" } }
    })
  };
  const secrets = {
    "prodigy-gemini-api-key": "keep-me",
    "prodigy-mimo-api-key": "remove-me",
    PRODIGY_MIMO_API_KEY: "legacy-remove-me"
  };
  const app = createApp(files, secrets);

  const config = await service.load(app);
  assert.equal(config.defaultProvider, "lm-studio");
  assert.equal(config.providers["lm-studio"].model, "new-model");

  await service.save(app, { deleteSecretIds: ["prodigy-mimo-api-key"] });
  assert.equal(secrets["prodigy-mimo-api-key"], undefined);
  assert.equal(secrets.PRODIGY_MIMO_API_KEY, undefined);
  assert.equal(secrets["prodigy-gemini-api-key"], "keep-me");
}

async function testLegacySecretCountsAsConfigured() {
  const app = createApp({}, { PRODIGY_GEMINI_API_KEY: "legacy-key" });
  assert.equal(await service.hasSecret(app, "prodigy-gemini-api-key"), true);
}

async function testFreeProviderDefaultsAndFallbackPersist() {
  const files = {};
  const app = createApp(files, {});
  const config = await service.save(app, {
    defaultProvider: "groq",
    fallbackProvider: "openrouter"
  });
  assert.equal(config.providers.groq.baseURL, "https://api.groq.com/openai/v1");
  assert.equal(config.providers.groq.model, "qwen/qwen3.6-27b");
  assert.equal(config.providers.openrouter.model, "openrouter/free");
  assert.equal(config.fallbackProvider, "openrouter");
  assert.equal(config.providers.groq.fallbackProvider, config.providers.openrouter);
  const stored = JSON.parse(files[service.CONFIG_PATH]);
  assert.equal(stored.fallbackProvider, "openrouter");
  assert.equal(Object.hasOwn(stored.providers.groq, "fallbackProvider"), false);
}

async function testAiProfileRoundTripAndResolver() {
  const files = {};
  const app = createApp(files, {});
  const saved = await service.save(app, {
    defaultProvider: "gemini",
    config: {
      aiProfiles: {
        schema_version: 1,
        llmwiki: { direct_provider_key: "groq", omniroute_provider_key: "openrouter" }
      }
    }
  });
  assert.deepEqual(saved.aiProfiles, {
    schema_version: 1,
    llmwiki: { direct_provider_key: "groq", omniroute_provider_key: "openrouter" }
  });
  const stored = JSON.parse(files[service.CONFIG_PATH]);
  assert.deepEqual(stored.aiProfiles, saved.aiProfiles);
  assert.equal(JSON.stringify(stored.aiProfiles).includes("api-key"), false);
  assert.equal(JSON.stringify(stored.aiProfiles).includes("fallback"), false);

  const loaded = await service.load(app);
  assert.deepEqual(loaded.aiProfiles, saved.aiProfiles);
  assert.equal(service.resolveAIProfileProviderKey(loaded, "llmwiki", "direct").provider_key, "groq");
  assert.equal(service.resolveAIProfileProviderKey(loaded, "llmwiki", "omniroute").provider_key, "openrouter");

  const defaulted = service.resolveAIProfileProviderKey(service.mergeConfig(service.DEFAULT_CONFIG, {
    defaultProvider: "gemini",
    aiProfiles: { schema_version: 1, llmwiki: { direct_provider_key: "", omniroute_provider_key: "" } }
  }), "llmwiki", "direct");
  assert.equal(defaulted.provider_key, "gemini");
  assert.equal(service.resolveAIProfileProviderKey(loaded, "llmwiki", "invalid").call_allowed, false);
  assert.equal(service.resolveAIProfileProviderKey(loaded, "llmwiki", "omniroute").provider_key !== "omniroute", true);

  const unavailable = service.resolveAIProfileProviderKey(service.mergeConfig(service.DEFAULT_CONFIG, {
    aiProfiles: { schema_version: 1, llmwiki: { direct_provider_key: "", omniroute_provider_key: "" } }
  }), "llmwiki", "omniroute");
  assert.equal(unavailable.ok, false);
  assert.equal(unavailable.call_allowed, false);
  assert.equal(unavailable.code, "provider_unavailable");
}

function testAiProfileRejectsUnknownShape() {
  assert.throws(() => service.mergeConfig(service.DEFAULT_CONFIG, {
    aiProfiles: { schema_version: 2, llmwiki: { direct_provider_key: "gemini", omniroute_provider_key: "" } }
  }), /schema_version/);
  assert.throws(() => service.mergeConfig(service.DEFAULT_CONFIG, {
    aiProfiles: { schema_version: 1, llmwiki: { provider_mode: "direct", provider_key: "gemini" } }
  }), /unknown fields/);
  assert.throws(() => service.mergeConfig(service.DEFAULT_CONFIG, {
    aiProfiles: { schema_version: 1, llmwiki: { direct_provider_key: "missing", omniroute_provider_key: "" } }
  }), /configured provider/);
}

async function testSecretIdsRemainValid() {
  Object.values(service.SECRET_IDS).forEach((secretId) => {
    assert.match(secretId, /^[a-z0-9-]{1,64}$/);
  });
}

function testCodexProviderUsesCliLoginWithoutSecret() {
  const provider = service.DEFAULT_CONFIG.providers.codex;
  assert.equal(provider.adapter, "codex-exec");
  assert.equal(provider.authMode, "codex-login");
  assert.equal(provider.apiKeySecret, undefined);
  assert.equal(provider.model, "");
  assert.equal(provider.sandbox, "read-only");
}

function testAntigravityProviderUsesCliLoginWithSelectableModel() {
  const provider = service.DEFAULT_CONFIG.providers.antigravity;
  assert.equal(provider.adapter, "antigravity-exec");
  assert.equal(provider.authMode, "antigravity-login");
  assert.equal(provider.apiKeySecret, undefined);
  assert.equal(provider.model, "gemini-3.6-flash-medium");
  assert.equal(provider.relayURL, "");
  assert.equal(provider.relayTokenSecret, service.SECRET_IDS.antigravityRelay);
  assert.equal(provider.structuredTimeoutMs, 120000, "Antigravity structured analysis must allow long-running reflection prompts");
  assert.ok(provider.models.some((item) => item.id === "claude-sonnet-4-6"));
  assert.equal(provider.sandbox, true);
}

function testExecProvidersStayFreeOfHttpOnlyDefaultKeys() {
  // Regression: applyProviderDefaults used to inject openai-compatible HTTP keys into
  // exec adapters, which the AIProviderService exec validation then rejects on every call.
  const httpOnly = ["baseURL", "endpointPath", "apiKeyHeader", "endpointURL", "apiKeySecret", "legacyApiKeySecret", "ttl", "maxTokens"];
  const merged = service.mergeConfig(service.DEFAULT_CONFIG, {
    aiProfiles: { schema_version: 1, llmwiki: { direct_provider_key: "antigravity", omniroute_provider_key: "" } },
    providers: { antigravity: { model: "gemini-3.6-flash-medium" } }
  });
  for (const key of httpOnly) assert.equal(key in merged.providers.antigravity, false, `antigravity must not carry ${key}`);
  const resolved = service.resolveAIProfileProviderKey(merged, "llmwiki", "direct");
  assert.equal(resolved.ok, true);
  for (const key of httpOnly) assert.equal(key in resolved.provider, false, `resolved llmwiki provider must not carry ${key}`);
  assert.equal(resolved.provider.model, "gemini-3.6-flash-medium");
  // Non-exec adapters keep their HTTP defaults.
  const withStudio = service.mergeConfig(service.DEFAULT_CONFIG, { providers: { "lm-studio": {} } });
  assert.equal("baseURL" in withStudio.providers["lm-studio"], true);
}

function testLlmWikiProviderOptionsComeFromCompatibleExistingSettings() {
  const config = service.mergeConfig(service.DEFAULT_CONFIG, {
    providers: {
      unsupported: { adapter: "custom-unsupported", name: "Unsupported", model: "fixture", capabilities: { structuredOutput: "json-schema" } },
      blankmodel: { adapter: "openai-compatible", name: "Blank Model", model: "", authMode: "bearer", capabilities: { structuredOutput: "json-schema" } },
    },
  });
  const options = service.listAIProfileProviderOptions(config, "llmwiki", "direct");
  const keys = options.map((option) => option.provider_key);
  for (const key of ["antigravity", "codex", "gemini", "lm-studio"]) assert.ok(keys.includes(key), key);
  assert.equal(keys.includes("unsupported"), false);
  assert.equal(keys.includes("blankmodel"), false);
  assert.equal(JSON.stringify(options).includes("apiKeySecret"), false);
}

(async () => {
  await testLegacyConfigLoadsWithoutWriting();
  await testSaveWritesCanonicalConfigAndKeepsSecretsOut();
  await testCanonicalConfigBeatsLegacyAndOnlyDeletesRequestedSecret();
  await testLegacySecretCountsAsConfigured();
  await testFreeProviderDefaultsAndFallbackPersist();
  await testAiProfileRoundTripAndResolver();
  testAiProfileRejectsUnknownShape();
  await testSecretIdsRemainValid();
  testCodexProviderUsesCliLoginWithoutSecret();
  testAntigravityProviderUsesCliLoginWithSelectableModel();
  testExecProvidersStayFreeOfHttpOnlyDefaultKeys();
  testLlmWikiProviderOptionsComeFromCompatibleExistingSettings();
  console.log("ProdigyConfigService tests passed.");
})().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});
