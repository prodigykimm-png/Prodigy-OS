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

(async () => {
  await testLegacyConfigLoadsWithoutWriting();
  await testSaveWritesCanonicalConfigAndKeepsSecretsOut();
  await testCanonicalConfigBeatsLegacyAndOnlyDeletesRequestedSecret();
  await testLegacySecretCountsAsConfigured();
  await testFreeProviderDefaultsAndFallbackPersist();
  await testAiProfileRoundTripAndResolver();
  testAiProfileRejectsUnknownShape();
  await testSecretIdsRemainValid();
  console.log("ProdigyConfigService tests passed.");
})().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});
