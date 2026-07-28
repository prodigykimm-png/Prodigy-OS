"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "../../../../../..");
const provider = require(path.join(ROOT, "SYSTEM/Views/ai-provider-service.js"));

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
  assert.equal(quotaCalls, 1);
}

async function testGroqFallbacksToOpenRouterOnlyForEligibleFailure() {
  const calls = [];
  const app = {
    secretStorage: {
      getSecret: async (name) => ({ "prodigy-groq-api-key": "groq-key", "prodigy-openrouter-api-key": "router-key" })[name] || ""
    },
    requestUrl: async (options) => {
      calls.push(options);
      if (calls.length === 1) return { status: 429, json: { error: { message: "rate limited" } } };
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
  assert.equal(calls.length, 2);
  assert.equal(calls[0].url, "https://api.groq.com/openai/v1/chat/completions");
  assert.equal(calls[0].headers.Authorization, "Bearer groq-key");
  assert.equal(calls[1].url, "https://openrouter.ai/api/v1/chat/completions");
  assert.equal(calls[1].headers.Authorization, "Bearer router-key");
  assert.equal(JSON.parse(calls[1].body).model, "openrouter/free");

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
  testResponseExtraction();
  testTailnetProviderUsesLocalUrlOnlyOnDesktop();
  await testRetriesAndErrors();
  await testGroqFallbacksToOpenRouterOnlyForEligibleFailure();
  await testLocalServerConnectionFailureHasActionableMessage();
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
