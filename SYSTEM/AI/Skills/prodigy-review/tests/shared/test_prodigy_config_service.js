const assert = require("node:assert/strict");
const path = require("node:path");

/*
 * NOTE (2026-09-29): this suite was rewritten for the retired provider layer, not relaxed.
 * Evidence the old provider expectations were stale:
 * - 3542f31 "Provider 실행 코드를 vault에서 퇴역" stripped SYSTEM/Views/prodigy-config-service.js
 *   to a workflowPresets-only store with secret-storage helpers (109 lines). Provider authority
 *   moved to the external prodigy-ai-runtime plugin (cutover/retirement/audit chain).
 * - The sibling retirement suite asserts the stripped source
 *   (doesNotMatch /defaultProvider|fallbackProvider|aiProfiles|providers|gemini|.../) and PASSES.
 * - The migration receipt records legacy_config_provider_fields_remaining: 0.
 * - Every remaining product caller uses only the presets/secrets API:
 *   project-wizard.js load() -> workflowPresets, save({config:{workflowPresets}}),
 *   region-collector-service.js REGION_SECRET_IDS.
 * Removed test functions exercised deleted symbols (resolveAIProfileProviderKey,
 * listAIProfileProviderOptions, DEFAULT_CONFIG.providers, applyProviderDefaults, hasSecret):
 * keeping them would pin an API the product deliberately no longer exports. The remaining
 * assertions keep full strength against the real API, including a pin that provider-shaped
 * keys are dropped rather than persisted (the retirement contract).
 */

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

  assert.deepEqual(config.workflowPresets.Client, [{ label: "요구사항 확인" }]);
  assert.equal(config.defaultProvider, undefined, "retired provider fields must not surface");
  assert.equal(config.providers, undefined, "retired provider fields must not surface");
  assert.equal(files[service.CONFIG_PATH], undefined);
}

async function testSaveWritesCanonicalConfigAndKeepsSecretsOut() {
  const files = {};
  const secrets = {};
  const app = createApp(files, secrets);

  const saved = await service.save(app, {
    config: { workflowPresets: { Client: [{ label: "요구사항 확인" }] } },
    secrets: {
      "prodigy-mimo-api-key": "mimo-secret",
      "prodigy-todoist-api-token": "todoist-secret",
      "prodigy-reb-openapi-key": "reb-secret"
    }
  });

  const text = files[service.CONFIG_PATH];
  assert.ok(text);
  assert.deepEqual(saved.workflowPresets.Client, [{ label: "요구사항 확인" }]);
  assert.deepEqual(JSON.parse(text).workflowPresets.Client, [{ label: "요구사항 확인" }]);
  assert.equal(text.includes("mimo-secret"), false);
  assert.equal(text.includes("todoist-secret"), false);
  assert.equal(secrets["prodigy-mimo-api-key"], "mimo-secret");
  assert.equal(secrets["prodigy-todoist-api-token"], "todoist-secret");
  assert.equal(secrets["prodigy-reb-openapi-key"], "reb-secret");
}

async function testCanonicalConfigBeatsLegacyAndOnlyDeletesRequestedSecret() {
  const files = {
    [service.CONFIG_PATH]: JSON.stringify({
      workflowPresets: { Client: [{ label: "새 프리셋" }] }
    }),
    "SYSTEM/PRIVATE/project-wizard.local.json": JSON.stringify({
      workflowPresets: { Client: [{ label: "구 프리셋" }] }
    })
  };
  const secrets = {
    "prodigy-gemini-api-key": "keep-me",
    "prodigy-mimo-api-key": "remove-me"
  };
  const app = createApp(files, secrets);

  const config = await service.load(app);
  assert.deepEqual(config.workflowPresets.Client, [{ label: "새 프리셋" }]);

  await service.save(app, { deleteSecretIds: ["prodigy-mimo-api-key"] });
  assert.equal(secrets["prodigy-mimo-api-key"], undefined);
  assert.equal(secrets["prodigy-gemini-api-key"], "keep-me");
}

async function testGetSecretPassesThroughSecretStorage() {
  const app = createApp({}, { PRODIGY_GEMINI_API_KEY: "legacy-key" });
  assert.equal(await service.getSecret(app, "PRODIGY_GEMINI_API_KEY"), "legacy-key");
  assert.equal(await service.getSecret(app, "prodigy-missing-secret"), "");
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
  await testGetSecretPassesThroughSecretStorage();
  await testSecretIdsRemainValid();
  console.log("ProdigyConfigService tests passed.");
})().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});
