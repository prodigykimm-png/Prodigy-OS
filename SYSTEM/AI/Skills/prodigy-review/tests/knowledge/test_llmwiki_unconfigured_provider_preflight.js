"use strict";

const assert = require("node:assert/strict");
const { buildPages, runHub } = require("./knowledge_hub_integration_harness.js");

async function main() {
  const sourcePath = "ZETA/LITERATURE/unconfigured-provider.md";
  const result = await runHub({
    pages: buildPages(),
    extraFiles: {
      "SYSTEM/PRIVATE/prodigy.local.json": JSON.stringify({
        defaultProvider: "openrouter",
        aiProfiles: {
          schema_version: 1,
          llmwiki: {
            direct_provider_key: "antigravity",
            omniroute_provider_key: "",
          },
        },
      }),
      [sourcePath]: `---
type: "literature_note"
source_kind: "public"
source_id: "source_unconfigured_provider"
source_url: "https://example.com/unconfigured-provider"
source_title: "설정되지 않은 제공자 경계"
---
# 설정되지 않은 제공자 경계

AI 자격증명이 없는 제공자로는 검토를 시작하지 않습니다.
`,
    },
  });
  const hub = result.window.KnowledgeExplorerHub;
  hub.tabs.select("llmwiki");

  const choices = await hub.dispatchLlmWikiAction({ action: "select_source" });
  assert.equal(choices.ok, true);
  const selected = await hub.dispatchLlmWikiAction({ action: "select_source", source_path: sourcePath });
  assert.equal(selected.ok, true);

  const snapshot = hub.llmWikiLifecycleSnapshot();
  const configured = snapshot.provider_options.find((option) => option.provider_key === "openrouter");
  assert.equal(configured.configured, false);

  const consent = await hub.dispatchLlmWikiAction({ action: "request_consent" });
  assert.deepEqual(
    { ok: consent.ok, status: consent.status, reason: consent.reason },
    { ok: false, status: "failed", reason: "provider_selection_unavailable" },
  );
  assert.equal(Boolean(hub.llmWikiSelectedRunCommand), false);
  console.log("LLM Wiki unconfigured provider preflight test passed");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
