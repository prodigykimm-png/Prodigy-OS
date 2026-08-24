"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");
const { test } = require("node:test");

const ROOT = path.resolve(__dirname, "../../../../../..");
const production = require(path.join(ROOT, "SYSTEM/Views/llmwiki-production-operation-provider.js"));

function providerThrowing(error, onRequest = () => {}) {
  return production.createProductionOperationProvider({
    app: {},
    config: {},
    configApi: {
      resolveAIProfileProviderKey: () => ({
        ok: true,
        provider_mode: "direct",
        provider_key: "antigravity",
        provider: { adapter: "antigravity-exec", name: "Antigravity" },
      }),
    },
    providerService: { requestStructuredJsonOnce: async (options) => { onRequest(options); throw error; } },
    classifier: { classifyProviderOperation: () => ({ ok: true, value: { status: "review", operation: {} } }) },
    getProviderMode: () => "direct",
  });
}

const INPUT = {
  action: "inbox_analysis",
  outbound_allowed: true,
  run_id: "run_fixture",
  extracted_text: "fixture",
  source_snapshot: {
    source: {
      source_id: "source_fixture",
      content_hash: "a".repeat(64),
      source_path: "INBOX/fixture.md",
    },
  },
};

test("operation provider preserves a safe Antigravity auth reason", async () => {
  const error = new Error("Antigravity Google 로그인이 필요합니다. 터미널에서 agy 로그인을 완료해 주세요.");
  error.code = "ANTIGRAVITY_AUTH_REQUIRED";
  let requestOptions;
  const result = await providerThrowing(error, (options) => { requestOptions = options; })(INPUT);
  assert.deepEqual(
    { ok: result.ok, status: result.status, reason: result.reason },
    { ok: false, status: "provider_unavailable", reason: "provider_auth_required" },
  );
  assert.match(result.message, /Antigravity Google 로그인이 필요합니다/u);
  for (const forbidden of ["providerKey", "providerMode", "requestMetadata", "consent"]) {
    assert.equal(forbidden in requestOptions, false, `operation provider must not escape ${forbidden} through the public AI service contract`);
  }
  const proposalSchema = requestOptions.schema.properties.canonical_proposal;
  assert.equal(proposalSchema.additionalProperties, false);
  assert.ok(proposalSchema.required.includes("knowledge_kind"));
  assert.ok(proposalSchema.required.includes("body"));
  const prompt = JSON.parse(requestOptions.prompt);
  assert.equal(prompt.serialized_operation_contract.contract_version, "llmwiki_operation_contract_v1");
  assert.match(prompt.canonical_bytes_rule.template, /^---\\ntype: knowledge/u);
});

test("operation provider distinguishes sandbox blocking without exposing diagnostics", async () => {
  const error = new Error("Antigravity가 프로젝트 도구 실행을 시도해 안전 모드에서 차단되었습니다.");
  error.code = "ANTIGRAVITY_SANDBOX_BLOCKED";
  const result = await providerThrowing(error)(INPUT);
  assert.equal(result.reason, "provider_tool_blocked");
  assert.match(result.message, /안전 모드에서 차단/u);
});

test("operation provider preserves quota exhaustion instead of reporting no connection", async () => {
  const error = new Error("Antigravity 사용 한도를 모두 사용했습니다. 1시간 49분 58초 후 다시 시도해 주세요.");
  error.code = "ANTIGRAVITY_QUOTA_EXHAUSTED";
  const result = await providerThrowing(error)(INPUT);
  assert.equal(result.reason, "provider_quota_exhausted");
  assert.match(result.message, /사용 한도/u);
});

test("operation provider deterministically binds after_bytes to the canonical serializer", async () => {
  const target = "ZETA/PERMANENT/fixture.md";
  let classifiedEnvelope;
  const provider = production.createProductionOperationProvider({
    app: {},
    config: {},
    configApi: {
      resolveAIProfileProviderKey: () => ({
        ok: true,
        provider_mode: "direct",
        provider_key: "antigravity",
        provider: { adapter: "antigravity-exec", name: "Antigravity" },
      }),
    },
    providerService: {
      requestStructuredJsonOnce: async () => ({
        status: "ok",
        serialized_operation: JSON.stringify({ destination_ids: [target], after_bytes: { [target]: "provider guessed bytes" } }),
        canonical_proposal: { title: "fixture", knowledge_domain: "reading", knowledge_topics: ["ai"] },
        provider_confidence: 0.9,
      }),
    },
    knowledgeKindApi: {
      parseProposal: () => ({ ok: true, approval_eligible: true, document: {} }),
      serializeProposal: () => "deterministic canonical bytes",
    },
    candidateCore: { TOPICS: { reading: [] } },
    classifier: {
      classifyProviderOperation: (serialized) => {
        classifiedEnvelope = JSON.parse(serialized);
        if (classifiedEnvelope.canonical_proposal.knowledge_topics.length !== 0) return { ok: false, reason: "unregistered_knowledge_topic" };
        const operation = JSON.parse(classifiedEnvelope.serialized_operation);
        if (operation.after_bytes[target] !== "deterministic canonical bytes") return { ok: false, reason: "canonical_proposal_destination_bytes_mismatch" };
        return { ok: true, value: { status: "review", operation } };
      },
    },
    getProviderMode: () => "direct",
  });
  const result = await provider(INPUT);
  assert.equal(result.ok, true);
  assert.equal(JSON.parse(classifiedEnvelope.serialized_operation).after_bytes[target], "deterministic canonical bytes");
});

test("operation provider resolves the newly saved provider only on the next analysis call", async () => {
  const target = "ZETA/PERMANENT/provider-switch.md";
  const providers = {
    antigravity: { adapter: "antigravity-exec", name: "Antigravity" },
    codex: { adapter: "codex-exec", name: "Codex" },
  };
  let activeConfig = { aiProfiles: { llmwiki: { direct_provider_key: "antigravity" } }, providers };
  const calls = [];
  const provider = production.createProductionOperationProvider({
    app: {},
    config: activeConfig,
    getConfig: () => activeConfig,
    configApi: {
      resolveAIProfileProviderKey(config) {
        const providerKey = config.aiProfiles.llmwiki.direct_provider_key;
        return { ok: true, provider_mode: "direct", provider_key: providerKey, provider: config.providers[providerKey] };
      },
    },
    providerService: {
      requestStructuredJsonOnce: async ({ provider: selected }) => {
        calls.push(selected.name);
        return {
          status: "ok",
          serialized_operation: JSON.stringify({ destination_ids: [target], after_bytes: { [target]: "provider bytes" } }),
          canonical_proposal: { title: "fixture" },
          provider_confidence: 0.9,
        };
      },
    },
    knowledgeKindApi: {
      parseProposal: () => ({ ok: true, approval_eligible: true, document: {} }),
      serializeProposal: () => "deterministic canonical bytes",
    },
    classifier: {
      classifyProviderOperation: (serialized) => ({ ok: true, value: { status: "review", operation: JSON.parse(JSON.parse(serialized).serialized_operation) } }),
    },
    getProviderMode: () => "direct",
  });

  assert.equal((await provider(INPUT)).ok, true);
  activeConfig = { aiProfiles: { llmwiki: { direct_provider_key: "codex" } }, providers };
  assert.equal((await provider(INPUT)).ok, true);
  assert.deepEqual(calls, ["Antigravity", "Codex"]);
});
