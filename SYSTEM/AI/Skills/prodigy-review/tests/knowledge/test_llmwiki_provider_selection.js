"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { buildPages, runHub } = require("./knowledge_hub_integration_harness.js");

test("LLM Wiki inherits the global provider and rejects feature-specific overrides", async () => {
  let operationCalls = 0;
  const result = await runHub({
    pages: buildPages(),
    extraFiles: {
      "SYSTEM/PRIVATE/prodigy.local.json": JSON.stringify({
        defaultProvider: "codex",
        aiProfiles: {
          schema_version: 1,
          llmwiki: { direct_provider_key: "antigravity", omniroute_provider_key: "" },
        },
      }),
    },
    llmWikiControllerOptions: {
      operation_provider: async () => {
        operationCalls += 1;
        return { ok: false, reason: "unexpected_analysis" };
      },
    },
  });
  await result.window.KnowledgeExplorerHub.whenKnowledgeInboxSettled();

  const beforeTouches = result.app.vault.touched.length;
  const snapshot = result.window.KnowledgeExplorerHub.llmWikiLifecycleSnapshot();
  assert.equal(snapshot.provider_key, "codex");
  const changed = await result.window.KnowledgeExplorerHub.dispatchLlmWikiAction({
    action: "set_provider",
    provider_key: "antigravity",
  });

  assert.equal(changed.ok, false);
  assert.equal(changed.reason, "action_unavailable");
  assert.equal(operationCalls, 0);
  assert.equal(result.app.vault.touched.length, beforeTouches);
  const configFile = result.app.vault.getAbstractFileByPath("SYSTEM/PRIVATE/prodigy.local.json");
  const persisted = JSON.parse(await result.app.vault.read(configFile));
  assert.equal(persisted.defaultProvider, "codex");
  assert.equal(persisted.aiProfiles.llmwiki.direct_provider_key, "antigravity");
});

test("LLM Wiki rejects provider changes while an inbox analysis is active", async () => {
  let releaseAnalysis;
  let markStarted;
  const started = new Promise((resolve) => { markStarted = resolve; });
  const result = await runHub({
    pages: buildPages(),
    extraFiles: {
      "INBOX/활성 분석.md": "# 활성 분석\n\nprovider 변경 경합 테스트\n",
      "SYSTEM/PRIVATE/prodigy.local.json": JSON.stringify({
        aiProfiles: {
          schema_version: 1,
          llmwiki: { direct_provider_key: "antigravity", omniroute_provider_key: "" },
        },
      }),
    },
    llmWikiControllerOptions: {
      batchIdentity: {
        provider_key: "openrouter",
        model: "test/model-1",
        structured_mode: "json_schema",
        schema_id: "llmwiki_compact_v1",
        prompt_version: "p11-selection",
      },
      batchProvider: async () => {
        markStarted();
        return new Promise((resolve) => { releaseAnalysis = resolve; });
      },
    },
  });
  await result.window.KnowledgeExplorerHub.whenKnowledgeInboxSettled();
  // Subscribe before triggering: the batch provider gate marks the start.
  const analyzeDispatch = result.window.KnowledgeExplorerHub.dispatchLlmWikiAction({ action: "analyze_inbox" });
  await started;

  const changed = await result.window.KnowledgeExplorerHub.dispatchLlmWikiAction({
    action: "set_provider",
    provider_key: "codex",
  });

  assert.equal(changed.ok, false);
  assert.equal(changed.reason, "action_unavailable");
  const configFile = result.app.vault.getAbstractFileByPath("SYSTEM/PRIVATE/prodigy.local.json");
  const persisted = JSON.parse(await result.app.vault.read(configFile));
  assert.equal(persisted.aiProfiles.llmwiki.direct_provider_key, "antigravity");
  releaseAnalysis({ ok: true, artifacts: [] });
  await analyzeDispatch;
  await result.window.KnowledgeExplorerHub.whenKnowledgeInboxSettled();
});
