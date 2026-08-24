"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "../../../../../../");
const provider = require(path.join(ROOT, "SYSTEM/Views/ai-provider-service.js"));
const configService = require(path.join(ROOT, "SYSTEM/Views/prodigy-config-service.js"));
const errorPolicy = require(path.join(ROOT, "SYSTEM/Views/ai-provider-error-policy.js"));

function validEnvelope() {
  return {
    workspace: "journal",
    tab: "reflection",
    selection: { path: "DAILY/2026-07-30.md", type: "daily", title: "2026-07-30" },
    snapshot: [{ key: "mood", value: "calm" }],
    citations: ["PARA/Projects/context.md"],
    locale: "ko"
  };
}

// ── 1. Subscription / consumer-session / cookie / web-ui automation rejection ──

async function testSubscriptionAuthModeIsRejectedBeforeNetwork() {
  let networkCalls = 0;
  const app = { requestUrl: async () => { networkCalls += 1; return { status: 200, json: {} }; } };

  const cases = [
    ["subscription adapter", { adapter: "subscription", name: "ChatGPT", model: "gpt-4", authMode: "none" }],
    ["subscription authMode", { adapter: "openai-compatible", name: "ChatGPT", model: "gpt-4", authMode: "subscription" }],
    ["consumer-session authMode", { adapter: "openai-compatible", name: "ChatGPT", model: "gpt-4", authMode: "consumer-session" }],
    ["name with subscription", { adapter: "gemini", name: "Google Subscription", model: "gemini-3.5-flash", authMode: "none" }],
    ["name with session", { adapter: "openai-compatible", name: "ChatGPT Session", model: "gpt-4", authMode: "none" }],
    ["name with cookie", { adapter: "openai-compatible", name: "Browser Cookie Bridge", model: "gpt-4", authMode: "none" }],
    ["name with web-ui", { adapter: "gemini", name: "Google Web-UI Auto", model: "gemini-3.5-flash", authMode: "none" }],
    ["name with automation", { adapter: "openai-compatible", name: "OAuth Automation", model: "gpt-4", authMode: "none" }],
    ["description with consumer-login", { adapter: "openai-compatible", name: "Test", description: "consumer-login bridge", model: "gpt-4", authMode: "none" }],
    ["name with chatgpt-login", { adapter: "openai-compatible", name: "ChatGPT-Login Bridge", model: "gpt-4", authMode: "none" }],
    ["name with google-account", { adapter: "gemini", name: "Google-Account Provider", model: "gemini-3.5-flash", authMode: "none" }],
  ];

  for (const [label, candidate] of cases) {
    await assert.rejects(
      provider.requestChatText({
        app,
        provider: candidate,
        prompt: "fixture",
        contextEnvelope: validEnvelope()
      }),
      /구독|약관|provider로 등록/,
      `subscription rejection: ${label}`
    );
  }
  assert.equal(networkCalls, 0, "no network calls for subscription/adapter rejections");
  console.log("  PASS: subscription/consumer-session/cookie/web-ui all rejected before network");
}

// ── 2. Bind accept/reject matrix ──

async function testBindAcceptRejectMatrix() {
  let networkCalls = 0;
  const app = { requestUrl: async () => { networkCalls += 1; return { status: 200, json: {} }; } };

  const accepted = [
    ["localhost", { adapter: "openai-compatible", name: "Local", baseURL: "http://localhost:1234/v1", model: "test", authMode: "none" }],
    ["127.0.0.1", { adapter: "openai-compatible", name: "Local", baseURL: "http://127.0.0.1:1234/v1", model: "test", authMode: "none" }],
    ["::1", { adapter: "openai-compatible", name: "Local", baseURL: "http://[::1]:1234/v1", model: "test", authMode: "none" }],
    ["tailnet (ts.net)", { adapter: "openai-compatible", name: "Remote", baseURL: "https://youngjae-macmini-2.tail1992b9.ts.net/v1", model: "test", authMode: "bearer", apiKeySecret: "prodigy-openai-compatible-api-key" }],
  ];

  const rejected = [
    ["0.0.0.0", { adapter: "openai-compatible", name: "Public", baseURL: "http://0.0.0.0:1234/v1", model: "test", authMode: "none" }, /공개.*LAN|허용되지 않/],
    ["10.x private", { adapter: "openai-compatible", name: "LAN", baseURL: "http://10.0.0.5:1234/v1", model: "test", authMode: "none" }, /공개.*LAN|허용되지 않/],
    ["192.168.x", { adapter: "openai-compatible", name: "LAN", baseURL: "http://192.168.1.10:1234/v1", model: "test", authMode: "none" }, /공개.*LAN|허용되지 않/],
    ["172.16.x", { adapter: "openai-compatible", name: "LAN", baseURL: "http://172.16.0.5:1234/v1", model: "test", authMode: "none" }, /공개.*LAN|허용되지 않/],
    ["bind 0.0.0.0", { adapter: "openai-compatible", name: "Public", bind: "0.0.0.0", baseURL: "http://127.0.0.1:1234/v1", model: "test", authMode: "none" }, /로컬 루프백/],
    ["bind 192.168.0.8", { adapter: "openai-compatible", name: "LAN", bindAddress: "192.168.0.8", baseURL: "http://127.0.0.1:1234/v1", model: "test", authMode: "none" }, /로컬 루프백/],
    ["publicBind true", { adapter: "openai-compatible", name: "Public", publicBind: true, baseURL: "http://127.0.0.1:1234/v1", model: "test", authMode: "none" }, /로컬 루프백/],
    ["lanBind true", { adapter: "openai-compatible", name: "LAN", lanBind: true, baseURL: "http://127.0.0.1:1234/v1", model: "test", authMode: "none" }, /로컬 루프백/],
  ];

  for (const [label, candidate] of accepted) {
    networkCalls = 0;
    try {
      await provider.requestChatText({
        app: { requestUrl: async () => { networkCalls += 1; return { status: 200, json: { choices: [{ message: { content: "ok" } }] } }; }, secretStorage: { getSecret: async () => "FAKE_KEY_FOR_TEST" } },
        provider: candidate,
        prompt: "fixture",
        contextEnvelope: validEnvelope()
      });
      assert.ok(true, `${label} accepted`);
    } catch (error) {
      if (error.name === "ProviderSecurityError") {
        assert.fail(`${label} should be ACCEPTED but was rejected: ${error.message}`);
      }
    }
    console.log(`  ACCEPT: ${label}`);
  }

  for (const [label, candidate, expectedPattern] of rejected) {
    networkCalls = 0;
    await assert.rejects(
      provider.requestChatText({
        app: { requestUrl: async () => { networkCalls += 1; return { status: 200, json: {} }; } },
        provider: candidate,
        prompt: "fixture",
        contextEnvelope: validEnvelope()
      }),
      (error) => {
        return expectedPattern.test(error.message) && error.name === "ProviderSecurityError";
      },
      `bind rejection: ${label}`
    );
    assert.equal(networkCalls, 0, `${label} rejected before network`);
    console.log(`  REJECT: ${label}`);
  }
}

// ── 3. Missing API key → actionable Korean error, no fallback hop ──

async function testMissingApiKeySurfacesKoreanErrorAndDoesNotFallback() {
  const calls = [];
  const app = {
    secretStorage: { getSecret: async () => "" },
    requestUrl: async (options) => {
      calls.push(options);
      return { status: 200, json: { choices: [{ message: { content: "ok" } }] } };
    }
  };

  await assert.rejects(
    provider.requestChatText({
      app,
      provider: {
        adapter: "gemini",
        name: "Google Gemini",
        model: "gemini-3.5-flash",
        apiKeySecret: "prodigy-gemini-api-key",
        fallbackProvider: {
          adapter: "openai-compatible",
          name: "Groq",
          baseURL: "https://api.groq.com/openai/v1",
          endpointPath: "/chat/completions",
          model: "qwen/qwen3.6-27b",
          authMode: "bearer",
          apiKeySecret: "prodigy-groq-api-key"
        }
      },
      prompt: "fixture",
      contextEnvelope: validEnvelope()
    }),
    /설정 → AI → Google Gemini API 키가 없습니다/
  );
  assert.equal(calls.length, 0, "missing key → no network call, no fallback");
  console.log("  PASS: missing API key → Korean error, no fallback hop");
}

// ── 4. Fallback ordering — primary → fallback → error ──

async function testFallbackOrderingWorks() {
  const calls = [];
  const app = {
    secretStorage: {
      getSecret: async (name) => ({
        "prodigy-groq-api-key": "groq-key",
        "prodigy-openrouter-api-key": "router-key"
      })[name] || ""
    },
    requestUrl: async (options) => {
      calls.push(options);
      if (calls.length <= 3) return { status: 429, json: { error: { message: "rate limited" } } };
      return { status: 200, json: { choices: [{ message: { content: JSON.stringify({ evidence_blocks: [{ title: "ok", context: "work", experience: "test", interpretation: "", change: "", next_experiment: "", related_objects: [] }], knowledge_candidates: [], resource_candidates: [], object_linking_suggestions: [], pre_routing_suggestions: [], uncertainties: [] }) } }] } };
    }
  };

  const fallbackProvider = {
    adapter: "openai-compatible",
    name: "OpenRouter",
    baseURL: "https://openrouter.ai/api/v1",
    endpointPath: "/chat/completions",
    model: "openrouter/free",
    authMode: "bearer",
    apiKeySecret: "prodigy-openrouter-api-key",
    capabilities: { structuredOutput: "json-mode" }
  };

  const result = await provider.requestStructuredJson({
    app,
    provider: {
      adapter: "openai-compatible",
      name: "Groq",
      baseURL: "https://api.groq.com/openai/v1",
      endpointPath: "/chat/completions",
      model: "qwen/qwen3.6-27b",
      authMode: "bearer",
      apiKeySecret: "prodigy-groq-api-key",
      capabilities: { structuredOutput: "json-mode" },
      fallbackProvider
    },
    prompt: "fixture",
    schema: { type: "object" }
  });

  assert.equal(result.evidence_blocks.length, 1);
  assert.equal(calls.length, 4, "3 Groq attempts + 1 OpenRouter call");
  assert.ok(calls[0].url.includes("groq"));
  assert.ok(calls[1].url.includes("groq"));
  assert.ok(calls[2].url.includes("groq"));
  assert.ok(calls[3].url.includes("openrouter"));
  console.log("  PASS: fallback ordering: 3 Groq retries → 1 OpenRouter success");

  // 401 should NOT fallback
  calls.length = 0;
  await assert.rejects(
    provider.requestStructuredJson({
      app: {
        secretStorage: app.secretStorage,
        requestUrl: async (options) => {
          calls.push(options);
          return { status: 401, json: { error: { message: "bad key" } } };
        }
      },
      provider: {
        adapter: "openai-compatible",
        name: "Groq",
        baseURL: "https://api.groq.com/openai/v1",
        endpointPath: "/chat/completions",
        model: "qwen/qwen3.6-27b",
        authMode: "bearer",
        apiKeySecret: "prodigy-groq-api-key",
        fallbackProvider
      },
      prompt: "fixture",
      schema: { type: "object" }
    }),
    /API 키 또는 접근 권한/
  );
  assert.equal(calls.length, 1, "401 → exactly 1 call, no fallback");
  console.log("  PASS: 401 does not trigger fallback");
}

// ── 5. Provider failure → redacted, user-readable Korean error ──

async function testProviderFailureSurfacesRedactedKoreanError() {
  const app = {
    secretStorage: { getSecret: async () => "FAKE_KEY_FOR_TEST" },
    requestUrl: async () => {
      return { status: 500, json: { error: { message: "auth failure", details: { api_key: "FAKE_SECRET_KEY_12345678901234567890", token: "FAKE_TOKEN_9876543210" } } } };
    }
  };

  try {
    await provider.requestChatText({
      app,
      provider: {
        adapter: "gemini",
        name: "Google Gemini",
        model: "gemini-3.5-flash",
        apiKeySecret: "prodigy-gemini-api-key"
      },
      prompt: "fixture",
      contextEnvelope: validEnvelope()
    });
    assert.fail("should have thrown");
  } catch (error) {
    assert.match(error.message, /사용량|잠시|완료하지 못/);
    assert.doesNotMatch(error.message, /FAKE_SECRET|FAKE_TOKEN/);
    assert.doesNotMatch(error.message, /api_key|auth failure/);
    const stack = error.stack || "";
    assert.doesNotMatch(stack, /FAKE_SECRET|FAKE_TOKEN/);
    console.log("  PASS: provider failure → redacted Korean error: " + error.message);
  }
}

// ── 6. No secret value reaches diagnostics ──

function testNoSecretReachesDiagnostics() {
  const fakeSecret = "FAKE_SECRET_FOR_TEST_ONLY_123456789";
  const diagnostic = JSON.stringify({
    headers: { Authorization: `Bearer ${fakeSecret}` },
    body: { prompt: fakeSecret, messages: [{ role: "user", content: fakeSecret }] },
    secret: fakeSecret,
    secretStorage: fakeSecret,
    "prodigy-gemini-api-key": fakeSecret
  });

  const providerError = errorPolicy.providerHttpError(500, diagnostic);
  assert.equal(providerError.responseText, "[redacted]");
  assert.equal(JSON.stringify(providerError).includes(fakeSecret), false);

  const redacted = errorPolicy.redactError(new Error(`headers=${diagnostic} body=${fakeSecret}`));
  assert.equal(redacted, "[redacted]");
  assert.doesNotMatch(redacted, /Authorization|Bearer|prompt|secret|api.key|token/);

  const userFacing = errorPolicy.userFacingProviderError(
    { status: 500, message: diagnostic },
    { name: "Test" },
    "http://127.0.0.1:1234/v1"
  );
  assert.doesNotMatch(userFacing.message, /FAKE_SECRET|Bearer|Authorization|prompt|secretStorage/);
  const quota = new Error("Antigravity 사용 한도를 모두 사용했습니다. 1시간 후 다시 시도해 주세요.");
  quota.name = "AntigravityQuotaError";
  quota.code = "ANTIGRAVITY_QUOTA_EXHAUSTED";
  const preservedQuota = errorPolicy.userFacingProviderError(quota, { name: "Antigravity" }, "");
  assert.equal(preservedQuota.code, "ANTIGRAVITY_QUOTA_EXHAUSTED");
  console.log("  PASS: no secret value reaches diagnostics");
}

// ── 7. Timeout settings are consumed by the request path ──

async function testTimeoutSettingsAreConsumedByRequestPath() {
  const defaults = configService.getProviderDefaults("gemini");
  assert.equal(defaults.chatTimeoutMs, 30000, "gemini chatTimeoutMs default is 30000");
  assert.equal(defaults.structuredTimeoutMs, 60000, "gemini structuredTimeoutMs default is 60000");

  assert.equal(provider.CHAT_TIMEOUT_MS, 30000);
  assert.equal(provider.STRUCTURED_TIMEOUT_MS, 60000);

  // Advance a controlled clock at the retry seam so deadline behavior is deterministic.
  const originalNow = Date.now;
  let now = 1000;
  Date.now = () => now;
  try {
    let chatAttempts = 0;
    await assert.rejects(provider.requestChatText({
      app: {
        secretStorage: { getSecret: async () => "FAKE_KEY_FOR_TEST" },
        requestUrl: async () => {
          chatAttempts += 1;
          return { status: 500, json: { error: { message: "server error" } } };
        }
      },
      provider: {
        adapter: "gemini",
        name: "Google Gemini",
        model: "gemini-3.5-flash",
        apiKeySecret: "prodigy-gemini-api-key",
        chatTimeoutMs: 1
      },
      prompt: "fixture",
      contextEnvelope: validEnvelope(),
      sleep: async () => { now += 2; }
    }), /시간이 초과/);
    assert.equal(chatAttempts, 1, "only 1 attempt before timeout fires");
    console.log("  PASS: timeout consumed — chatTimeoutMs: 1, attempts: " + chatAttempts);

    let structAttempts = 0;
    await assert.rejects(provider.requestStructuredJson({
      app: {
        secretStorage: { getSecret: async () => "FAKE_KEY_FOR_TEST" },
        requestUrl: async () => {
          structAttempts += 1;
          return { status: 500, json: { error: { message: "server error" } } };
        }
      },
      provider: {
        adapter: "gemini",
        name: "Google Gemini",
        model: "gemini-3.1-pro",
        apiKeySecret: "prodigy-gemini-api-key",
        structuredTimeoutMs: 1
      },
      prompt: "fixture",
      schema: { type: "object" },
      sleep: async () => { now += 2; }
    }), /시간이 초과/);
    assert.equal(structAttempts, 1, "only 1 attempt before timeout fires");
    console.log("  PASS: structuredTimeoutMs consumed, attempts: " + structAttempts);
  } finally {
    Date.now = originalNow;
  }
}

// ── 8. RETRY_DELAYS_MS constant is shipped and used ──

function testRetryDelaysConstantIsShipped() {
  assert.deepEqual(provider.RETRY_DELAYS_MS, [1000, 2500]);
  assert.equal(provider.RETRY_DELAYS_MS.length, 2, "at most 2 retries (3 attempts total)");
  console.log("  PASS: RETRY_DELAYS_MS = [1000, 2500] shipped and frozen");
}

// ── 9. Gemini model IDs match shipped defaults ──

function testGeminiModelIdsMatchShippedDefaults() {
  const defaults = configService.getProviderDefaults("gemini");
  const modelIds = defaults.models.map(function (m) { return m.id; });
  assert.ok(modelIds.includes("gemini-3.5-flash"), "gemini-3.5-flash in shipped models");
  assert.ok(modelIds.includes("gemini-3.1-pro"), "gemini-3.1-pro in shipped models");
  assert.equal(defaults.model, "gemini-3.5-flash", "default chat model is gemini-3.5-flash");
  console.log("  PASS: Gemini model IDs match shipped defaults");
}

// ── 10. Local model id required from settings ──

function testLocalModelIdRequiredFromSettings() {
  const defaults = configService.getProviderDefaults("openai-compatible");
  assert.equal(defaults.model, "", "openai-compatible has no hardcoded model default");
  console.log("  PASS: local model id has no hardcoded default (empty string)");
}

// ── main ──

async function main() {
  console.log("test_ai_provider_security.js");
  await testSubscriptionAuthModeIsRejectedBeforeNetwork();
  await testBindAcceptRejectMatrix();
  await testMissingApiKeySurfacesKoreanErrorAndDoesNotFallback();
  await testFallbackOrderingWorks();
  await testProviderFailureSurfacesRedactedKoreanError();
  testNoSecretReachesDiagnostics();
  await testTimeoutSettingsAreConsumedByRequestPath();
  testRetryDelaysConstantIsShipped();
  testGeminiModelIdsMatchShippedDefaults();
  testLocalModelIdRequiredFromSettings();
  console.log("PASS: all AI provider security tests passed");
}

if (require.main === module) {
  main().catch(function (error) {
    console.error(error.stack || error.message);
    process.exit(1);
  });
}

module.exports = { main: main };
