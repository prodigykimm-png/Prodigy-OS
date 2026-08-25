"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");
const { test } = require("node:test");

const ROOT = path.resolve(__dirname, "../../../../../..");
const production = require(path.join(ROOT, "SYSTEM/Views/llmwiki-production-operation-provider.js"));
const aiProviderService = require(path.join(ROOT, "SYSTEM/Views/ai-provider-service.js"));

function semanticUnit(text, alias = "span_a") {
  return {
    temporary_span_alias: alias, start: 0, end: text.length, origin_hint: "source_extract", disposition: "propose",
    uncertainty: { level: "low", reasons: [] }, claims: [{ text, temporary_span_alias: alias }],
  };
}
function chunkResponse(key, text) { return { status: "ok", chunk_results: [{ key, semantic_units: [semanticUnit(text)] }] }; }
function chunkProvider(respond) {
  const calls = [];
  return {
    calls,
    provider: production.createChunkAnalysisProvider({
      config: {},
      configApi: { resolveAIProfileProviderKey: () => ({ ok: true, provider_mode: "direct", provider_key: "fixture", provider: {} }) },
      providerService: { requestStructuredJsonOnce: async (request) => { calls.push(request); return respond(request, calls.length); } },
    }),
  };
}
function chunks() { return [{ key: "chunk_alpha", text: "Alpha" }, { key: "chunk_beta", text: "Beta" }]; }
function chunkInput(overrides = {}) { return { outbound_allowed: true, run_id: "run_chunk_fixture", changed_chunks: chunks(), ...overrides }; }

test("chunk provider sends only changed keyed chunks and accepts locally bounded keyed units", async () => {
  const calls = [];
  const provider = production.createChunkAnalysisProvider({
    config: {},
    configApi: { resolveAIProfileProviderKey: () => ({ ok: true, provider_mode: "direct", provider_key: "fixture", provider: {} }) },
    providerService: {
      requestStructuredJsonOnce: async (request) => {
        calls.push(request);
        return {
          status: "ok",
          chunk_results: [
            { key: "chunk_alpha", semantic_units: [{ temporary_span_alias: "span_a", start: 0, end: 5, origin_hint: "source_extract", disposition: "propose", uncertainty: { level: "low", reasons: [] }, claims: [{ text: "Alpha", temporary_span_alias: "span_a" }] }] },
            { key: "chunk_beta", semantic_units: [{ temporary_span_alias: "span_b", start: 0, end: 4, origin_hint: "ai_interpretation", disposition: "hold", uncertainty: { level: "medium", reasons: ["context"] }, claims: [{ text: "Beta", temporary_span_alias: "span_b" }] }] },
          ],
        };
      },
    },
  });
  const result = await provider({
    outbound_allowed: true,
    run_id: "run_chunk_fixture",
    changed_chunks: [{ key: "chunk_alpha", text: "Alpha" }, { key: "chunk_beta", text: "Beta" }],
    canonical_relation_hints: [{ canonical_id: "canonical_alpha", summary: "local summary" }],
  });

  assert.equal(result.ok, true, JSON.stringify(result));
  assert.deepEqual(result.chunk_results.map((item) => item.key), ["chunk_alpha", "chunk_beta"]);
  assert.equal(result.accepted_chunk_count, 2);
  assert.equal(result.canonical_write_count, 0);
  const prompt = JSON.parse(calls[0].prompt);
  assert.deepEqual(prompt.changed_chunks.map((chunk) => chunk.key), ["chunk_alpha", "chunk_beta"]);
  assert.equal(Object.hasOwn(prompt, "canonical_proposal"), false);
  assert.equal(Object.hasOwn(prompt, "serialized_operation"), false);
});

test("partial response repairs only missing keys once and retains valid keyed results", async () => {
  const { provider, calls } = chunkProvider((_request, call) => call === 1
    ? chunkResponse("chunk_alpha", "Alpha")
    : chunkResponse("chunk_beta", "Beta"));
  const result = await provider(chunkInput());

  assert.equal(result.ok, true, JSON.stringify(result));
  assert.deepEqual(result.chunk_results.map((item) => item.key), ["chunk_alpha", "chunk_beta"]);
  assert.equal(result.resubmission_count, 1);
  assert.equal(calls.length, 2);
  assert.deepEqual(JSON.parse(calls[1].prompt).changed_chunks.map((chunk) => chunk.key), ["chunk_beta"]);
});

test("forged, duplicate, forbidden, or oversized responses are rejected after exactly one repair", async () => {
  const invalidResponses = [
    { status: "ok", chunk_results: [{ key: "forged_key", semantic_units: [] }] },
    { status: "ok", chunk_results: [chunkResponse("chunk_alpha", "Alpha").chunk_results[0], chunkResponse("chunk_alpha", "Alpha").chunk_results[0]] },
    { status: "ok", chunk_results: [{ key: "chunk_alpha", destination: "ZETA/PERMANENT/forged.md", semantic_units: [] }] },
    { status: "ok", chunk_results: [{ key: "chunk_alpha", semantic_units: Array.from({ length: production.MAX_UNITS_PER_CHUNK + 1 }, () => semanticUnit("Alpha")) }] },
    { status: "ok", chunk_results: [{ key: "chunk_alpha", semantic_units: [{ ...semanticUnit("Alpha"), claims: Array.from({ length: production.MAX_CLAIMS_PER_UNIT + 1 }, () => ({ text: "Alpha", temporary_span_alias: "span_a" })) }] }] },
    { status: "ok", chunk_results: [{ key: "chunk_alpha", semantic_units: [], padding: "x".repeat(production.MAX_PROVIDER_RESPONSE_BYTES) }] },
  ];
  for (const response of invalidResponses) {
    const { provider, calls } = chunkProvider(() => response);
    const result = await provider(chunkInput({ changed_chunks: [chunks()[0]] }));
    assert.equal(result.ok, false, JSON.stringify(result));
    assert.equal(result.reason, "invalid_chunk_response");
    assert.equal(result.accepted_chunk_count, 0);
    assert.equal(result.canonical_write_count, 0);
    assert.equal(calls.length, 2);
  }
});

test("batch limits and consent fail locally without a provider call", async () => {
  for (const input of [
    chunkInput({ outbound_allowed: false }),
    chunkInput({ changed_chunks: [...chunks(), { key: "chunk_gamma", text: "Gamma" }, { key: "chunk_delta", text: "Delta" }, { key: "chunk_extra", text: "Extra" }] }),
    chunkInput({ changed_chunks: [{ key: "chunk_alpha", text: "x".repeat(production.MAX_CHANGED_SOURCE_BYTES + 1) }] }),
    chunkInput({ external_research: 1 }),
    chunkInput({ local_canonical_summaries: Array.from({ length: production.MAX_RELATION_HINTS + 1 }, () => "summary") }),
  ]) {
    const { provider, calls } = chunkProvider(() => chunkResponse("chunk_alpha", "Alpha"));
    const result = await provider(input);
    assert.equal(result.ok, false, JSON.stringify(result));
    assert.equal(result.provider_call_count, 0);
    assert.equal(result.canonical_write_count, 0);
    assert.equal(calls.length, 0);
  }
});

test("semantic output is stable across provider account selection", async () => {
  const resultFor = async (providerKey) => production.createChunkAnalysisProvider({
    config: {},
    configApi: { resolveAIProfileProviderKey: () => ({ ok: true, provider_mode: "direct", provider_key: providerKey, provider: { account: providerKey } }) },
    providerService: { requestStructuredJsonOnce: async () => chunkResponse("chunk_alpha", "Alpha") },
  })(chunkInput({ changed_chunks: [chunks()[0]] }));
  assert.deepEqual(await resultFor("account_a"), await resultFor("account_b"));
});

test("real AIProviderService submits HTTP 429 once and maps its terminal quota state", async () => {
  let httpSubmissions = 0;
  const provider = production.createChunkAnalysisProvider({
    app: { requestUrl: async () => { httpSubmissions += 1; return { status: 429, text: "rate limited" }; } },
    config: {},
    configApi: {
      resolveAIProfileProviderKey: () => ({
        ok: true, provider_mode: "direct", provider_key: "http_fixture",
        provider: { adapter: "openai-compatible", authMode: "none", baseURL: "https://provider.invalid", model: "fixture" },
      }),
    },
    providerService: aiProviderService,
  });

  const result = await provider(chunkInput({ changed_chunks: [chunks()[0]] }));
  assert.equal(httpSubmissions, 1);
  assert.equal(result.reason, "provider_quota_exhausted");
  assert.equal(result.accepted_chunk_count, 0);
  assert.equal(result.resubmission_count, 0);
  assert.equal(result.canonical_write_count, 0);
  assert.equal(result.source_writes, 0);
});

test("real AIProviderService preserves thrown timeout identity as an outcome-unknown terminal state", async () => {
  let httpSubmissions = 0;
  const provider = production.createChunkAnalysisProvider({
    app: { requestUrl: async () => { httpSubmissions += 1; throw Object.assign(new Error("transport timeout"), { code: "ETIMEDOUT" }); } },
    config: {},
    configApi: {
      resolveAIProfileProviderKey: () => ({
        ok: true, provider_mode: "direct", provider_key: "http_fixture",
        provider: { adapter: "openai-compatible", authMode: "none", baseURL: "https://provider.invalid", model: "fixture" },
      }),
    },
    providerService: aiProviderService,
  });

  const result = await provider(chunkInput({ changed_chunks: [chunks()[0]] }));
  assert.equal(httpSubmissions, 1);
  assert.equal(result.reason, "provider_outcome_unknown");
  assert.equal(result.accepted_chunk_count, 0);
  assert.equal(result.resubmission_count, 0);
  assert.equal(result.canonical_write_count, 0);
  assert.equal(result.source_writes, 0);
});

test("real AIProviderService bounds a never-settling request and ignores its late result", async () => {
  let httpSubmissions = 0;
  let releaseTimeout;
  let resolveLateResponse;
  let observedTimeoutMs;
  let markRequestStarted;
  const requestStarted = new Promise((resolve) => { markRequestStarted = resolve; });
  const provider = production.createChunkAnalysisProvider({
    app: {
      requestUrl: async () => {
        httpSubmissions += 1;
        markRequestStarted();
        return new Promise((resolve) => { resolveLateResponse = resolve; });
      },
    },
    config: {},
    structuredTimeoutScheduler: (callback, timeoutMs) => {
      releaseTimeout = callback;
      observedTimeoutMs = timeoutMs;
      return () => {};
    },
    configApi: {
      resolveAIProfileProviderKey: () => ({
        ok: true, provider_mode: "direct", provider_key: "http_fixture",
        provider: { adapter: "openai-compatible", authMode: "none", baseURL: "https://provider.invalid", model: "fixture", structuredTimeoutMs: 17 },
      }),
    },
    providerService: aiProviderService,
  });

  const pending = provider(chunkInput({ changed_chunks: [chunks()[0]] }));
  await requestStarted;
  assert.equal(observedTimeoutMs, 17);
  assert.equal(typeof releaseTimeout, "function");
  releaseTimeout();
  const result = await pending;
  assert.equal(httpSubmissions, 1);
  assert.equal(result.reason, "provider_outcome_unknown");
  assert.equal(result.accepted_chunk_count, 0);
  assert.equal(result.resubmission_count, 0);
  assert.equal(result.canonical_write_count, 0);
  assert.equal(result.source_writes, 0);
  resolveLateResponse({ status: 200, json: { choices: [{ message: { content: JSON.stringify(chunkResponse("chunk_alpha", "Alpha")) } }] } });
  await Promise.resolve();
  assert.equal(result.reason, "provider_outcome_unknown");
  assert.equal(result.accepted_chunk_count, 0);
});

test("AIProviderService retains ordinary structured retry behavior outside Todo 7", async () => {
  let httpSubmissions = 0;
  const options = {
    app: { requestUrl: async () => { httpSubmissions += 1; return { status: 429, text: "rate limited" }; } },
    provider: { adapter: "openai-compatible", authMode: "none", baseURL: "https://provider.invalid", model: "fixture" },
    prompt: "fixture", schema: production.TYPED_SCHEMA, timeoutMs: 60000, sleep: async () => {},
  };
  await assert.rejects(aiProviderService.requestStructuredJsonOnce(options));
  assert.equal(httpSubmissions, 3);
});

test("auth, quota, outcome-unknown, and late abort never resubmit or return accepted results", async () => {
  for (const [error, reason] of [
    [Object.assign(new Error("auth"), { code: "ANTIGRAVITY_AUTH_REQUIRED" }), "provider_auth_required"],
    [Object.assign(new Error("quota"), { code: "ANTIGRAVITY_QUOTA_EXHAUSTED" }), "provider_quota_exhausted"],
    [Object.assign(new Error("timeout"), { code: "ETIMEDOUT" }), "provider_outcome_unknown"],
  ]) {
    const { provider, calls } = chunkProvider(() => { throw error; });
    const result = await provider(chunkInput());
    assert.equal(result.reason, reason);
    assert.equal(result.resubmission_count, 0);
    assert.equal(result.accepted_chunk_count, 0);
    assert.equal(calls.length, 1);
  }
  const controller = new AbortController();
  const { provider, calls } = chunkProvider(() => {
    controller.abort();
    return chunkResponse("chunk_alpha", "Alpha");
  });
  const aborted = await provider(chunkInput({ changed_chunks: [chunks()[0]] }), { signal: controller.signal });
  assert.equal(aborted.reason, "provider_aborted");
  assert.equal(aborted.accepted_chunk_count, 0);
  assert.equal(aborted.canonical_write_count, 0);
  assert.equal(calls.length, 1);
});
