"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "../../../../../..");
const provider = require(path.join(ROOT, "SYSTEM/Views/ai-provider-service.js"));
const contextEnvelopeApi = require(path.join(ROOT, "SYSTEM/Views/ai-context-envelope.js"));

function validPayload() {
  return {
    evidence_blocks: [{
      title: "테스트",
      context: "work",
      experience: "테스트 경험",
      interpretation: "",
      change: "",
      next_experiment: "",
      related_objects: []
    }],
    knowledge_candidates: [],
    resource_candidates: [],
    object_linking_suggestions: [],
    pre_routing_suggestions: [],
    uncertainties: []
  };
}

function geminiProvider() {
  return {
    adapter: "gemini",
    name: "Google Gemini",
    model: "gemini-3.5-flash",
    apiKeySecret: "prodigy-gemini-api-key"
  };
}

function validContextEnvelope() {
  return {
    workspace: "journal",
    tab: "reflection",
    selection: { path: "DAILY/2026-07-30.md", type: "daily", title: "2026-07-30" },
    snapshot: [{ key: "mood", value: "calm" }],
    citations: ["PARA/Projects/context.md"],
    locale: "ko"
  };
}

async function testGeminiStructuredRequest() {
  const calls = [];
  const app = {
    secretStorage: { getSecret: async (name) => name === "prodigy-gemini-api-key" ? "secret" : "" },
    requestUrl: async (options) => {
      calls.push(options);
      return { status: 200, json: { outputs: [{ type: "text", text: JSON.stringify(validPayload()) }] } };
    }
  };
  const result = await provider.requestStructuredJson({
    app,
    provider: { adapter: "gemini", model: "gemini-test", apiKeySecret: "prodigy-gemini-api-key" },
    prompt: "fixture",
    schema: { type: "object", properties: { existence: { type: "string", const: "unknown" } } }
  });
  assert.equal(result.evidence_blocks.length, 1);
  assert.equal(calls[0].url, provider.GEMINI_ENDPOINT);
  assert.equal(calls[0].headers["x-goog-api-key"], "secret");
  assert.deepEqual(JSON.parse(calls[0].body).response_format.schema.properties.existence, { type: "string", enum: ["unknown"] });
}

async function testLocalStructuredRequestNeedsNoSecretAndUsesTtl() {
  const calls = [];
  const app = {
    requestUrl: async (options) => {
      calls.push(options);
      return { status: 200, json: { choices: [{ message: { content: JSON.stringify(validPayload()) } }] } };
    }
  };
  const schema = {
    type: "object",
    additionalProperties: false,
    required: ["experience", "related_objects"],
    properties: {
      experience: { type: "string", maxLength: 2000 },
      related_objects: { type: "array", maxItems: 0, items: { type: "string" } }
    }
  };
  await provider.requestStructuredJson({
    app,
    provider: {
      adapter: "openai-compatible",
      name: "LM Studio",
      baseURL: "http://127.0.0.1:1234/v1",
      endpointPath: "/chat/completions",
      model: "qwen/qwen3.5-9b",
      authMode: "none",
      ttl: 120,
      maxTokens: 4096,
      reasoningEffort: "none",
      capabilities: { structuredOutput: "json-schema", strictStructuredOutput: true, schemaDialect: "lm-studio" }
    },
    prompt: "fixture",
    schema
  });
  const body = JSON.parse(calls[0].body);
  assert.equal(calls[0].url, "http://127.0.0.1:1234/v1/chat/completions");
  assert.equal("Authorization" in calls[0].headers, false);
  assert.equal(body.ttl, 120);
  assert.equal(body.max_tokens, 4096);
  assert.equal(body.reasoning_effort, "none");
  assert.equal(body.temperature, undefined);
  assert.deepEqual(body.response_format.json_schema.schema.properties.related_objects, { type: "array", enum: [[]] });

  await provider.requestStructuredJson({
    app,
    provider: {
      adapter: "openai-compatible",
      name: "LM Studio",
      baseURL: "http://127.0.0.1:1234/v1",
      endpointPath: "/chat/completions",
      model: "qwen/qwen3.5-9b",
      authMode: "none",
      capabilities: { structuredOutput: "json-schema", strictStructuredOutput: true, schemaDialect: "lm-studio", conservativeProposal: true }
    },
    prompt: "fixture",
    schema
  });
  assert.equal(JSON.parse(calls[1].body).temperature, 0);
  assert.equal(schema.properties.experience.maxLength, 2000);
  assert.equal(schema.properties.related_objects.maxItems, 0);
}

async function testCodexProviderUsesCliSessionWithoutApiKey() {
  const previous = global.CodexExecService;
  const calls = [];
  global.CodexExecService = {
    requestStructuredJson: async (options) => { calls.push(options); return validPayload(); }
  };
  try {
    const result = await provider.requestStructuredJson({
      app: { requestUrl: async () => { throw new Error("Codex provider must not use HTTP"); } },
      provider: { adapter: "codex-exec", name: "Codex 구독", authMode: "codex-login", model: "" },
      prompt: "fixture",
      schema: { type: "object" }
    });
    assert.equal(result.evidence_blocks.length, 1);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].provider.adapter, "codex-exec");
  } finally {
    global.CodexExecService = previous;
  }
}

async function testExecProvidersRejectUnapprovedExecutionSettingsBeforeDispatch() {
  const previousCodex = global.CodexExecService;
  const previousAntigravity = global.AntigravityExecService;
  let dispatches = 0;
  global.CodexExecService = { requestStructuredJson: async () => { dispatches += 1; return validPayload(); } };
  global.AntigravityExecService = { requestStructuredJson: async () => { dispatches += 1; return validPayload(); } };
  const attacks = [
    { adapter: "codex-exec", authMode: "codex-login", command: "/tmp/unapproved", sandbox: "read-only" },
    { adapter: "codex-exec", authMode: "codex-login", command: "codex", sandbox: "danger-full-access" },
    { adapter: "codex-exec", authMode: "codex-login", command: "codex", sandbox: "workspace-write" },
    { adapter: "codex-exec", authMode: "codex-login", command: "codex", sandbox: "read-only", executionMode: "unsafe" },
    { adapter: "antigravity-exec", authMode: "antigravity-login", command: "/tmp/unapproved", sandbox: true },
    { adapter: "antigravity-exec", authMode: "antigravity-login", command: "agy", sandbox: false },
    { adapter: "antigravity-exec", authMode: "antigravity-login", command: "agy", sandbox: true, allowTools: true }
  ];
  try {
    for (const candidate of attacks) {
      await assert.rejects(
        provider.requestStructuredJson({ app: {}, provider: candidate, prompt: "fixture", schema: { type: "object" } }),
        (error) => error && error.name === "ProviderSecurityError"
      );
    }
    assert.equal(dispatches, 0, "unsafe exec settings must fail before service dispatch");
  } finally {
    global.CodexExecService = previousCodex;
    global.AntigravityExecService = previousAntigravity;
  }
}

async function testOuterRequestSchemaRejectsUnknownOptionsBeforeEveryEntryPath() {
  const previousCodex = global.CodexExecService;
  const previousAntigravity = global.AntigravityExecService;
  const counters = { dispatch: 0, secretReads: 0, network: 0 };
  const app = {
    secretStorage: { getSecret: async () => { counters.secretReads += 1; return "stored-secret"; } },
    requestUrl: async () => { counters.network += 1; return { status: 200, json: {} }; }
  };
  global.CodexExecService = {
    requestStructuredJson: async () => { counters.dispatch += 1; return validPayload(); },
    requestChatText: async () => { counters.dispatch += 1; return "fixture"; }
  };
  global.AntigravityExecService = global.CodexExecService;
  const codexProvider = { adapter: "codex-exec", authMode: "codex-login", command: "codex", sandbox: "read-only" };
  const antigravityProvider = { adapter: "antigravity-exec", authMode: "antigravity-login", command: "agy", sandbox: true };
  const httpProvider = Object.assign(geminiProvider(), {
    fallbackProvider: { adapter: "openai-compatible", name: "Fallback", baseURL: "https://fallback.example/v1", model: "fixture", authMode: "none" }
  });
  const attacks = [
    () => provider.requestStructuredJson({ app, provider: httpProvider, prompt: "fixture", schema: { type: "object" }, executionMode: "unsafe" }),
    () => provider.requestStructuredJsonOnce({ app, provider: codexProvider, prompt: "fixture", schema: { type: "object" }, allowTools: true }),
    () => provider.requestChatText({ app, provider: antigravityProvider, prompt: "fixture", contextEnvelope: validContextEnvelope(), request: { executionMode: "unsafe" } }),
    () => provider.requestStructuredJson({ app, provider: codexProvider, prompt: "fixture", schema: { type: "object" }, timeoutMS: 1 }),
    () => provider.requestStructuredJson({ app, provider: codexProvider, prompt: "fixture", schema: { type: "object" }, unknownObject: { nested: true } }),
    () => provider.requestStructuredJson({ app, provider: codexProvider, prompt: "fixture", schema: { type: "object" }, unknownFunction() {} })
  ];
  try {
    for (const attack of attacks) {
      await assert.rejects(attack(), (error) => error && error.name === "ProviderSecurityError");
    }
    assert.deepEqual(counters, { dispatch: 0, secretReads: 0, network: 0 });
  } finally {
    global.CodexExecService = previousCodex;
    global.AntigravityExecService = previousAntigravity;
  }
}

async function testCodexRejectsInapplicableStructuredOptionsBeforeAllEffects() {
  const previousCodex = global.CodexExecService;
  const previousFallback = global.AIProviderFallback;
  const originalConsole = { log: console.log, warn: console.warn, error: console.error };
  const counters = { dispatch: 0, secretReads: 0, network: 0, fallback: 0, logs: 0 };
  const app = {
    secretStorage: { getSecret: async () => { counters.secretReads += 1; return "stored-secret"; } },
    requestUrl: async () => { counters.network += 1; return { status: 200, json: {} }; }
  };
  const codexProvider = { adapter: "codex-exec", authMode: "codex-login", command: "codex", sandbox: "read-only" };
  global.CodexExecService = {
    requestStructuredJson: async () => { counters.dispatch += 1; return validPayload(); }
  };
  global.AIProviderFallback = {
    requestWithFallback: async (options) => {
      counters.fallback += 1;
      return { payload: await options.request(options.provider), provider: options.provider, usedFallback: false };
    }
  };
  console.log = () => { counters.logs += 1; };
  console.warn = () => { counters.logs += 1; };
  console.error = () => { counters.logs += 1; };
  const attacks = [
    { sleep: async () => {} },
    { allowFormatDowngrade: false },
    { requestTag: "codex-inapplicable" }
  ];
  try {
    const errors = [];
    for (const attack of attacks) {
      try {
        await provider.requestStructuredJson(Object.assign({ app, provider: codexProvider, prompt: "fixture", schema: { type: "object" } }, attack));
        errors.push(null);
      } catch (error) {
        errors.push(error);
      }
    }
    assert.deepEqual(errors.map((error) => error && error.name), ["ProviderSecurityError", "ProviderSecurityError", "ProviderSecurityError"]);
    assert.deepEqual(counters, { dispatch: 0, secretReads: 0, network: 0, fallback: 0, logs: 0 });
  } finally {
    console.log = originalConsole.log;
    console.warn = originalConsole.warn;
    console.error = originalConsole.error;
    global.CodexExecService = previousCodex;
    global.AIProviderFallback = previousFallback;
  }
}

async function testAdapterApplicabilityRejectsAntigravityMalformedValuesAndFallbackTransitions() {
  const previousCodex = global.CodexExecService;
  const previousAntigravity = global.AntigravityExecService;
  const previousFallback = global.AIProviderFallback;
  const originalConsole = { log: console.log, warn: console.warn, error: console.error };
  const counters = { dispatch: 0, secretReads: 0, network: 0, fallback: 0, logs: 0 };
  const app = {
    secretStorage: { getSecret: async () => { counters.secretReads += 1; return "stored-secret"; } },
    requestUrl: async (options) => {
      counters.network += 1;
      const body = JSON.parse(options.body);
      return body.messages
        ? { status: 200, json: { choices: [{ message: { content: JSON.stringify(validPayload()) } }] } }
        : { status: 200, json: { outputs: [{ type: "text", text: JSON.stringify(validPayload()) }] } };
    }
  };
  const codexProvider = { adapter: "codex-exec", authMode: "codex-login", command: "codex", sandbox: "read-only" };
  const antigravityProvider = { adapter: "antigravity-exec", authMode: "antigravity-login", command: "agy", sandbox: true };
  const openAiProvider = { adapter: "openai-compatible", name: "Local", baseURL: "http://127.0.0.1:1234/v1", model: "fixture", authMode: "none" };
  global.CodexExecService = { requestStructuredJson: async () => { counters.dispatch += 1; return validPayload(); } };
  global.AntigravityExecService = global.CodexExecService;
  global.AIProviderFallback = {
    requestWithFallback: async (options) => {
      counters.fallback += 1;
      return { payload: await options.request(options.provider), provider: options.provider, usedFallback: false };
    }
  };
  console.log = () => { counters.logs += 1; };
  console.warn = () => { counters.logs += 1; };
  console.error = () => { counters.logs += 1; };
  const attacks = [
    Object.assign({ app, provider: antigravityProvider, prompt: "fixture", schema: { type: "object" } }, { sleep: async () => {} }),
    Object.assign({ app, provider: antigravityProvider, prompt: "fixture", schema: { type: "object" } }, { allowFormatDowngrade: false }),
    Object.assign({ app, provider: antigravityProvider, prompt: "fixture", schema: { type: "object" } }, { requestTag: "inapplicable" }),
    Object.assign({ app, provider: openAiProvider, prompt: "fixture", schema: { type: "object" } }, { sleep: "not-a-function" }),
    Object.assign({ app, provider: openAiProvider, prompt: "fixture", schema: { type: "object" } }, { allowFormatDowngrade: "false" }),
    Object.assign({ app, provider: openAiProvider, prompt: "fixture", schema: { type: "object" } }, { requestTag: { malformed: true } }),
    { app, provider: Object.assign({}, openAiProvider, { fallbackProvider: codexProvider }), prompt: "fixture", schema: { type: "object" }, requestTag: "http-only" },
    { app, provider: Object.assign({}, openAiProvider, { fallbackProvider: antigravityProvider }), prompt: "fixture", schema: { type: "object" }, sleep: async () => {} },
    { app, provider: Object.assign(geminiProvider(), { fallbackProvider: openAiProvider }), prompt: "fixture", schema: { type: "object" }, allowFormatDowngrade: false }
  ];
  try {
    const errors = [];
    for (const attack of attacks) {
      try {
        await provider.requestStructuredJson(attack);
        errors.push(null);
      } catch (error) {
        errors.push(error);
      }
    }
    assert.deepEqual(errors.map((error) => error && error.name), Array(attacks.length).fill("ProviderSecurityError"));
    assert.deepEqual(counters, { dispatch: 0, secretReads: 0, network: 0, fallback: 0, logs: 0 });
  } finally {
    console.log = originalConsole.log;
    console.warn = originalConsole.warn;
    console.error = originalConsole.error;
    global.CodexExecService = previousCodex;
    global.AntigravityExecService = previousAntigravity;
    global.AIProviderFallback = previousFallback;
  }
}

async function testAdapterRequestKindAcceptanceMatrix() {
  const previousCodex = global.CodexExecService;
  const previousAntigravity = global.AntigravityExecService;
  const previousFallback = global.AIProviderFallback;
  const calls = { http: 0, codex: 0, antigravity: 0 };
  const app = {
    secretStorage: { getSecret: async () => "http-secret" },
    requestUrl: async (options) => {
      calls.http += 1;
      const body = JSON.parse(options.body);
      if (body.messages) return { status: 200, json: { choices: [{ message: { content: JSON.stringify(validPayload()) } }] } };
      return { status: 200, json: { outputs: [{ type: "text", text: JSON.stringify(validPayload()) }] } };
    }
  };
  const codexProvider = { adapter: "codex-exec", authMode: "codex-login", command: "codex", sandbox: "read-only" };
  const antigravityProvider = { adapter: "antigravity-exec", authMode: "antigravity-login", command: "agy", sandbox: true };
  const openAiProvider = { adapter: "openai-compatible", name: "Local", baseURL: "http://127.0.0.1:1234/v1", model: "fixture", authMode: "none" };
  global.CodexExecService = {
    requestStructuredJson: async () => { calls.codex += 1; return validPayload(); },
    requestChatText: async () => { calls.codex += 1; return "codex"; }
  };
  global.AntigravityExecService = {
    requestStructuredJson: async () => { calls.antigravity += 1; return validPayload(); },
    requestChatText: async () => { calls.antigravity += 1; return "antigravity"; }
  };
  global.AIProviderFallback = null;
  try {
    await provider.requestStructuredJson({ app, provider: openAiProvider, prompt: "fixture", schema: { type: "object" }, sleep: async () => {}, allowFormatDowngrade: false, requestTag: "http-structured" });
    await provider.requestStructuredJson({ app, provider: geminiProvider(), prompt: "fixture", schema: { type: "object" }, sleep: async () => {}, requestTag: "gemini-structured" });
    await provider.requestChatText({ app, provider: openAiProvider, prompt: "fixture", contextEnvelope: validContextEnvelope(), sleep: async () => {} });
    await provider.requestStructuredJsonOnce({ app, provider: openAiProvider, prompt: "fixture", schema: { type: "object" }, sleep: async () => {}, providerKey: "openrouter", providerMode: "direct", requestMetadata: { request_id: "fixture" }, consent: { consent_hash: "a".repeat(64) } });

    await provider.requestStructuredJson({ app, provider: codexProvider, prompt: "fixture", schema: { type: "object" } });
    await provider.requestChatText({ app, provider: codexProvider, prompt: "fixture", contextEnvelope: validContextEnvelope() });
    await provider.requestStructuredJsonOnce({ app, provider: codexProvider, prompt: "fixture", schema: { type: "object" } });
    await provider.requestStructuredJson({ app, provider: antigravityProvider, prompt: "fixture", schema: { type: "object" } });
    await provider.requestChatText({ app, provider: antigravityProvider, prompt: "fixture", contextEnvelope: validContextEnvelope() });
    await provider.requestStructuredJsonOnce({ app, provider: antigravityProvider, prompt: "fixture", schema: { type: "object" } });

    assert.deepEqual(calls, { http: 4, codex: 3, antigravity: 3 });
  } finally {
    global.CodexExecService = previousCodex;
    global.AntigravityExecService = previousAntigravity;
    global.AIProviderFallback = previousFallback;
  }
}

async function testMalformedValuesAndWrongRequestKindsRejectBeforeEffects() {
  const previousCodex = global.CodexExecService;
  const previousAntigravity = global.AntigravityExecService;
  const counters = { dispatch: 0, secretReads: 0, network: 0 };
  const app = {
    secretStorage: { getSecret: async () => { counters.secretReads += 1; return "stored-secret"; } },
    requestUrl: async () => { counters.network += 1; return { status: 200, json: {} }; }
  };
  const openAiProvider = { adapter: "openai-compatible", name: "Local", baseURL: "http://127.0.0.1:1234/v1", model: "fixture", authMode: "none" };
  const codexProvider = { adapter: "codex-exec", authMode: "codex-login", command: "codex", sandbox: "read-only" };
  const antigravityProvider = { adapter: "antigravity-exec", authMode: "antigravity-login", command: "agy", sandbox: true };
  global.CodexExecService = {
    requestStructuredJson: async () => { counters.dispatch += 1; return validPayload(); },
    requestChatText: async () => { counters.dispatch += 1; return "fixture"; }
  };
  global.AntigravityExecService = global.CodexExecService;
  const attacks = [
    () => provider.requestChatText({ app, provider: openAiProvider, prompt: "fixture", contextEnvelope: validContextEnvelope(), sleep: "invalid" }),
    () => provider.requestStructuredJsonOnce({ app, provider: openAiProvider, prompt: "fixture", schema: { type: "object" }, providerMode: "invalid" }),
    () => provider.requestStructuredJsonOnce({ app, provider: openAiProvider, prompt: "fixture", schema: { type: "object" }, requestMetadata: [] }),
    () => provider.requestStructuredJson({ app, provider: openAiProvider, prompt: "fixture", schema: { type: "object" }, timeoutMs: 0 }),
    () => provider.requestChatText({ app, provider: codexProvider, prompt: "fixture", contextEnvelope: validContextEnvelope(), sleep: async () => {} }),
    () => provider.requestStructuredJsonOnce({ app, provider: codexProvider, prompt: "fixture", schema: { type: "object" }, providerKey: "codex" }),
    () => provider.requestStructuredJsonOnce({ app, provider: antigravityProvider, prompt: "fixture", schema: { type: "object" }, consent: {} })
  ];
  try {
    for (const attack of attacks) await assert.rejects(attack(), (error) => error && error.name === "ProviderSecurityError");
    assert.deepEqual(counters, { dispatch: 0, secretReads: 0, network: 0 });
  } finally {
    global.CodexExecService = previousCodex;
    global.AntigravityExecService = previousAntigravity;
  }
}

async function testOuterBoundaryRejectsRelayTokenWithoutSideEffectsOrDisclosure() {
  const previous = global.AntigravityExecService;
  const originalConsole = { log: console.log, warn: console.warn, error: console.error };
  const injectedSecret = "INJECTED_RELAY_SECRET_12345678901234567890";
  const providerConfig = {
    adapter: "antigravity-exec", name: "Antigravity 구독", authMode: "antigravity-login",
    command: "agy", model: "gemini-3.6-flash-medium", sandbox: true,
    relayURL: "https://fixture.ts.net/v1/antigravity"
  };
  const cases = ["", "different-stored-secret"];
  try {
    for (const storedToken of cases) {
      const counters = { dispatch: 0, secretReads: 0, network: 0 };
      const logs = [];
      global.AntigravityExecService = {
        requestStructuredJson: async () => { counters.dispatch += 1; return validPayload(); }
      };
      console.log = (...args) => { logs.push(args.join(" ")); };
      console.warn = (...args) => { logs.push(args.join(" ")); };
      console.error = (...args) => { logs.push(args.join(" ")); };
      let rejected;
      try {
        await provider.requestStructuredJsonOnce({
          app: {
            isMobile: true,
            secretStorage: { getSecret: async () => { counters.secretReads += 1; return storedToken; } },
            requestUrl: async () => { counters.network += 1; return { status: 200, json: {} }; }
          },
          provider: providerConfig,
          prompt: "fixture",
          schema: { type: "object" },
          relayToken: injectedSecret
        });
        assert.fail("public relayToken must reject");
      } catch (error) {
        rejected = error;
      }
      const surfaced = `${rejected && rejected.message}\n${rejected && rejected.stack || ""}\n${logs.join("\n")}`;
      assert.equal(rejected && rejected.name, "ProviderSecurityError");
      assert.equal(surfaced.includes(injectedSecret), false);
      assert.deepEqual(counters, { dispatch: 0, secretReads: 0, network: 0 });
    }
  } finally {
    console.log = originalConsole.log;
    console.warn = originalConsole.warn;
    console.error = originalConsole.error;
    global.AntigravityExecService = previous;
  }
}

async function testAntigravityProviderUsesCliSessionAndModelWithoutApiKey() {
  const previous = global.AntigravityExecService;
  const calls = [];
  global.AntigravityExecService = {
    requestStructuredJson: async (options) => { calls.push(options); return validPayload(); }
  };
  try {
    const result = await provider.requestStructuredJson({
      app: { requestUrl: async () => { throw new Error("Antigravity provider must not use HTTP"); } },
      provider: { adapter: "antigravity-exec", name: "Antigravity 구독", authMode: "antigravity-login", model: "gemini-3.6-flash-medium" },
      prompt: "fixture",
      schema: { type: "object" }
    });
    assert.equal(result.evidence_blocks.length, 1);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].provider.adapter, "antigravity-exec");
    assert.equal(calls[0].provider.model, "gemini-3.6-flash-medium");
  } finally {
    global.AntigravityExecService = previous;
  }
}

async function testChatTextRequestKeepsCitationsWithoutVaultWrites() {
  // Given: a validated contextual chat request and mutation-capable app fixture.
  const calls = [];
  let vaultWrites = 0;
  const app = {
    secretStorage: { getSecret: async () => "FAKE_GEMINI_KEY_FOR_TEST_ONLY" },
    vault: {
      create: async () => { vaultWrites += 1; },
      modify: async () => { vaultWrites += 1; },
      delete: async () => { vaultWrites += 1; }
    },
    requestUrl: async (options) => {
      calls.push(options);
      return { status: 200, json: { outputs: [{ type: "text", text: "선택한 자료를 요약했습니다." }] } };
    }
  };
  const contextEnvelope = {
    workspace: "journal",
    tab: "reflection",
    selection: { path: "DAILY/2026-07-30.md", type: "daily", title: "2026-07-30" },
    snapshot: [{ key: "mood", value: "calm" }],
    citations: ["PARA/Projects/context.md"],
    locale: "ko"
  };

  // When: the plain chat path is called beside the structured proposal path.
  const result = await provider.requestChatText({
    app,
    provider: geminiProvider(),
    prompt: "현재 화면만 요약해 줘.",
    contextEnvelope
  });

  // Then: only inert text and allow-listed citation paths return, with no Vault write.
  assert.deepEqual(result, { text: "선택한 자료를 요약했습니다.", citations: ["PARA/Projects/context.md"] });
  assert.equal(vaultWrites, 0);
  const body = JSON.parse(calls[0].body);
  const input = JSON.parse(body.input);
  assert.deepEqual(input.context, contextEnvelope);
  assert.equal(Object.hasOwn(input, "tools"), false);
}

async function testChatTextAcceptsBuilderTruncatedEnvelope() {
  // Given: the pure builder has already dropped oldest visible snapshot entries.
  const contextEnvelope = contextEnvelopeApi.buildContextEnvelope({
    workspace: "journal",
    tab: "reflection",
    selection: { path: "DAILY/2026-07-30.md", type: "daily", title: "2026-07-30" },
    snapshot: Array.from({ length: 20 }, (_, index) => ({ key: `visible-${index}`, value: "가".repeat(300) })),
    citations: ["PARA/Projects/context.md"],
    locale: "ko"
  });
  assert.equal(contextEnvelope.truncated, true);
  const calls = [];

  // When: the already-built ContextEnvelope reaches the chat transport.
  const result = await provider.requestChatText({
    app: {
      secretStorage: { getSecret: async () => "FAKE_GEMINI_KEY_FOR_TEST_ONLY" },
      requestUrl: async (options) => {
        calls.push(options);
        return { status: 200, json: { outputs: [{ type: "text", text: "완료" }] } };
      }
    },
    provider: geminiProvider(),
    prompt: "fixture",
    contextEnvelope
  });

  // Then: the transport preserves the builder's truncation marker and citations.
  assert.equal(JSON.parse(JSON.parse(calls[0].body).input).context.truncated, true);
  assert.deepEqual(result.citations, ["PARA/Projects/context.md"]);
}

async function testStructuredFormatRejectionStillFallsBackToPlainJsonMode() {
  // Given: an OpenAI-compatible provider that rejects json_schema once.
  const calls = [];
  const app = {
    requestUrl: async (options) => {
      calls.push(options);
      if (calls.length === 1) return { status: 400, json: { error: { message: "Invalid value for 'response_format': json_schema" } } };
      return { status: 200, json: { choices: [{ message: { content: JSON.stringify(validPayload()) } }] } };
    }
  };

  // When: the existing structured path handles the format rejection.
  const result = await provider.requestStructuredJson({
    app,
    provider: {
      adapter: "openai-compatible", name: "Local", baseURL: "http://127.0.0.1:1234/v1",
      model: "fixture", authMode: "none", capabilities: { structuredOutput: "json-schema" }
    },
    prompt: "fixture",
    schema: { type: "object" }
  });

  // Then: structured parsing remains intact and only the retry uses json_object.
  assert.equal(result.evidence_blocks.length, 1);
  assert.equal(JSON.parse(calls[0].body).response_format.type, "json_schema");
  assert.equal(JSON.parse(calls[1].body).response_format.type, "json_object");
}

function testResponseExtraction() {
  assert.equal(provider.extractJsonText({ choices: [{ message: { content: "", reasoning_content: '{"ok":true}' } }] }), '{"ok":true}');
  assert.deepEqual(provider.parseJsonPayload("prefix {\"ok\":true} suffix"), { ok: true });
}

function testTailnetProviderUsesLocalUrlOnlyOnDesktop() {
  const lmStudio = {
    baseURL: "https://youngjae-macmini-2.tail1992b9.ts.net/v1",
    localBaseURL: "http://127.0.0.1:1234/v1"
  };
  assert.equal(provider.resolveBaseURL(lmStudio, { isMobile: false }), "http://127.0.0.1:1234/v1");
  assert.equal(provider.resolveBaseURL(lmStudio, { isMobile: true }), "https://youngjae-macmini-2.tail1992b9.ts.net/v1");
}

async function testAntigravityRelaySecretErrorsStayRedactedThroughProviderBoundary() {
  const previous = global.AntigravityExecService;
  global.AntigravityExecService = require(path.join(ROOT, "SYSTEM/Views/antigravity-exec-service.js"));
  const secret = "SENSITIVE_TOKEN_12345678901234567890";
  try {
    await assert.rejects(provider.requestStructuredJsonOnce({
      app: {
        isMobile: true,
        secretStorage: { getSecret: async () => "relay-secret" },
        requestUrl: async () => ({ status: 502, json: { error: `Antigravity token ${secret}` } })
      },
      provider: {
        adapter: "antigravity-exec",
        name: "Antigravity 구독",
        authMode: "antigravity-login",
        command: "agy",
        model: "gemini-3.6-flash-medium",
        sandbox: true,
        relayURL: "https://fixture.ts.net/v1/antigravity"
      },
      prompt: "fixture",
      schema: { type: "object" }
    }), (error) => {
      const surfaced = `${error.message}\n${error.stack || ""}`;
      assert.equal(surfaced.includes(secret), false);
      assert.doesNotMatch(surfaced, /Antigravity token|SENSITIVE_TOKEN/u);
      assert.match(error.message, /Antigravity 중계.*HTTP 502/u);
      return true;
    });
  } finally {
    global.AntigravityExecService = previous;
  }
}

async function testMobileAntigravityRelayRequiresSecretStorageToken() {
  const providerConfig = {
    adapter: "antigravity-exec",
    authMode: "antigravity-login",
    relayURL: "https://youngjae-macmini-2.tail1992b9.ts.net:8443/v1/antigravity"
  };
  assert.equal(provider.isAllowedRelayURL(providerConfig.relayURL), true);
  assert.equal(provider.isAllowedRelayURL("http://192.168.1.2:8787/v1/antigravity"), false);
  assert.equal(await provider.isProviderConfigured({ isMobile: true, secretStorage: { getSecret: async () => "relay-secret" } }, Object.assign({}, providerConfig, { relayTokenSecret: "prodigy-antigravity-relay-token" })), true);
  assert.equal(await provider.isProviderConfigured({ isMobile: true, secretStorage: { getSecret: async () => "" } }, Object.assign({}, providerConfig, { relayTokenSecret: "prodigy-antigravity-relay-token" })), false);
}

async function testRetriesAndErrors() {
  const statuses = [500, 503, 200];
  const delays = [];
  let calls = 0;
  const app = {
    secretStorage: { getSecret: async () => "secret" },
    requestUrl: async () => {
      const status = statuses[calls++];
      if (status >= 400) return { status, json: { error: { message: "temporary high demand", code: "api_error" } } };
      return { status, json: { outputs: [{ type: "text", text: JSON.stringify(validPayload()) }] } };
    }
  };
  await provider.requestStructuredJson({ app, provider: geminiProvider(), prompt: "fixture", schema: { type: "object" }, sleep: async (ms) => { delays.push(ms); } });
  assert.equal(calls, 3);
  assert.deepEqual(delays, [1000, 2500]);

  let quotaCalls = 0;
  await assert.rejects(
    provider.requestStructuredJson({
      app: { secretStorage: { getSecret: async () => "secret" }, requestUrl: async () => { quotaCalls += 1; return { status: 429, json: { error: { message: "quota exceeded", status: "RESOURCE_EXHAUSTED" } } }; } },
      provider: geminiProvider(),
      prompt: "fixture",
      schema: { type: "object" }
    }),
    /사용 한도/
  );
  assert.equal(quotaCalls, 3);
}

async function testGroqFallbacksToOpenRouterOnlyForEligibleFailure() {
  const calls = [];
  const app = {
    secretStorage: {
      getSecret: async (name) => ({ "prodigy-groq-api-key": "groq-key", "prodigy-openrouter-api-key": "router-key" })[name] || ""
    },
    requestUrl: async (options) => {
      calls.push(options);
      if (calls.length <= 3) return { status: 429, json: { error: { message: "rate limited" } } };
      return { status: 200, json: { choices: [{ message: { content: JSON.stringify(validPayload()) } }] } };
    }
  };
  const fallbackProvider = {
    adapter: "openai-compatible", name: "OpenRouter", baseURL: "https://openrouter.ai/api/v1", endpointPath: "/chat/completions",
    model: "openrouter/free", authMode: "bearer", apiKeySecret: "prodigy-openrouter-api-key", capabilities: { structuredOutput: "json-mode" }
  };
  const result = await provider.requestStructuredJson({
    app,
    provider: {
      adapter: "openai-compatible", name: "Groq", baseURL: "https://api.groq.com/openai/v1", endpointPath: "/chat/completions",
      model: "qwen/qwen3.6-27b", authMode: "bearer", apiKeySecret: "prodigy-groq-api-key", capabilities: { structuredOutput: "json-mode" }, fallbackProvider
    },
    prompt: "fixture",
    schema: { type: "object" }
  });
  assert.equal(result.evidence_blocks.length, 1);
  assert.equal(calls.length, 4);
  assert.equal(calls[0].url, "https://api.groq.com/openai/v1/chat/completions");
  assert.equal(calls[0].headers.Authorization, "Bearer groq-key");
  assert.equal(calls[1].url, "https://api.groq.com/openai/v1/chat/completions");
  assert.equal(calls[2].url, "https://api.groq.com/openai/v1/chat/completions");
  assert.equal(calls[3].url, "https://openrouter.ai/api/v1/chat/completions");
  assert.equal(calls[3].headers.Authorization, "Bearer router-key");
  assert.equal(JSON.parse(calls[3].body).model, "openrouter/free");

  calls.length = 0;
  await assert.rejects(
    provider.requestStructuredJson({
      app: { secretStorage: app.secretStorage, requestUrl: async (options) => { calls.push(options); return { status: 401, json: { error: { message: "bad key" } } }; } },
      provider: {
        adapter: "openai-compatible", name: "Groq", baseURL: "https://api.groq.com/openai/v1", endpointPath: "/chat/completions",
        model: "qwen/qwen3.6-27b", authMode: "bearer", apiKeySecret: "prodigy-groq-api-key", fallbackProvider
      },
      prompt: "fixture",
      schema: { type: "object" }
    }),
    /API 키 또는 접근 권한/
  );
  assert.equal(calls.length, 1);
}

async function testLocalServerConnectionFailureHasActionableMessage() {
  await assert.rejects(
    provider.requestStructuredJson({
      app: { requestUrl: async () => { throw new Error("connect ECONNREFUSED 127.0.0.1:1234"); } },
      provider: {
        adapter: "openai-compatible",
        name: "LM Studio",
        baseURL: "http://127.0.0.1:1234/v1",
        endpointPath: "/chat/completions",
        model: "google/gemma-4-12b-qat",
        authMode: "none"
      },
      prompt: "fixture",
      schema: { type: "object" }
    }),
    (error) => {
      assert.match(error.message, /LM Studio 서버/);
      assert.doesNotMatch(error.message, /ECONNREFUSED|127\.0\.0\.1/);
      return true;
    }
  );
}

async function testStructuredRequestOnceDoesNotFallbackOrDowngrade() {
  const calls = [];
  const fallbackProvider = {
    adapter: "openai-compatible",
    name: "Fallback",
    baseURL: "https://fallback.example/v1",
    endpointPath: "/chat/completions",
    model: "fallback-model",
    authMode: "none"
  };
  const providerConfig = {
    adapter: "openai-compatible",
    name: "Primary",
    baseURL: "http://127.0.0.1:1234/v1",
    endpointPath: "/chat/completions",
    model: "primary-model",
    authMode: "none",
    capabilities: { structuredOutput: "json-schema" },
    fallbackProvider
  };
  await assert.rejects(
    provider.requestStructuredJsonOnce({
      app: {
        requestUrl: async (options) => {
          calls.push(options);
          return { status: 400, json: { error: { message: "Invalid value for response_format json_schema" } } };
        }
      },
      provider: providerConfig,
      prompt: "fixture",
      schema: { type: "object" }
    }),
    /AI 제공자 요청에 실패|AI 요청/
  );
  assert.equal(calls.length, 1);
  assert.equal(JSON.parse(calls[0].body).response_format.type, "json_schema");
}

async function testProjectWorkflowReusesSharedProvider() {
  const previousProvider = global.AIProviderService;
  const previousCore = global.ProjectWizardCore;
  const calls = [];
  global.ProjectWizardCore = { WORKFLOW_SCHEMA: { type: "object" }, validateProviderWorkflow: (payload) => ({ ok: true, errors: [], workflow: payload.workflow }) };
  global.AIProviderService = { requestStructuredJson: async (options) => { calls.push(options); return { workflow: [{ label: "공통 호출" }] }; } };
  const projectService = require(path.join(ROOT, "SYSTEM/Views/project-workflow-draft-service.js"));
  const result = await projectService.adapters.gemini({ app: {}, provider: { adapter: "gemini", model: "gemini-test" }, projectContext: { title: "테스트" }, baseWorkflow: [] });
  assert.equal(result.workflow[0].label, "공통 호출");
  assert.equal(calls[0].provider.model, "gemini-test");
  global.AIProviderService = previousProvider;
  global.ProjectWizardCore = previousCore;
}

async function main() {
  await testGeminiStructuredRequest();
  await testLocalStructuredRequestNeedsNoSecretAndUsesTtl();
  await testCodexProviderUsesCliSessionWithoutApiKey();
  await testExecProvidersRejectUnapprovedExecutionSettingsBeforeDispatch();
  await testOuterBoundaryRejectsRelayTokenWithoutSideEffectsOrDisclosure();
  await testOuterRequestSchemaRejectsUnknownOptionsBeforeEveryEntryPath();
  await testAdapterApplicabilityRejectsAntigravityMalformedValuesAndFallbackTransitions();
  await testCodexRejectsInapplicableStructuredOptionsBeforeAllEffects();
  await testAdapterRequestKindAcceptanceMatrix();
  await testMalformedValuesAndWrongRequestKindsRejectBeforeEffects();
  await testAntigravityProviderUsesCliSessionAndModelWithoutApiKey();
  await testChatTextRequestKeepsCitationsWithoutVaultWrites();
  await testChatTextAcceptsBuilderTruncatedEnvelope();
  await testStructuredFormatRejectionStillFallsBackToPlainJsonMode();
  testResponseExtraction();
  testTailnetProviderUsesLocalUrlOnlyOnDesktop();
  await testAntigravityRelaySecretErrorsStayRedactedThroughProviderBoundary();
  await testMobileAntigravityRelayRequiresSecretStorageToken();
  await testRetriesAndErrors();
  await testGroqFallbacksToOpenRouterOnlyForEligibleFailure();
  await testLocalServerConnectionFailureHasActionableMessage();
  await testStructuredRequestOnceDoesNotFallbackOrDowngrade();
  await testProjectWorkflowReusesSharedProvider();
  console.log("AI provider service tests passed");
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error.stack || error.message);
    process.exit(1);
  });
}

module.exports = { main };
