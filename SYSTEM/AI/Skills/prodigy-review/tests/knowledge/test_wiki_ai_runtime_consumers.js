"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { test } = require("node:test");

const ROOT = path.resolve(__dirname, "../../../../../..");

test("Prodigy Wiki production owns no provider transport, config, or fallback", () => {
  for (const name of [
    "llmwiki-ai-provider-transport.js",
    "llmwiki-batch-provider.js",
    "llmwiki-provider-capability.js",
    "llmwiki-provider-contract.js",
    "llmwiki-run-controller.js",
  ]) {
    const source = fs.readFileSync(path.join(ROOT, "SYSTEM/Views", name), "utf8");
    assert.doesNotMatch(source, /AIProviderService|ProdigyConfigService|ProjectWorkflowDraftService|fallbackProvider|requestStructuredJsonOnce|requestStructuredJsonNoRetry/u, name);
  }
  const hub = fs.readFileSync(path.join(ROOT, "HUB/50 Knowledge.md"), "utf8");
  assert.doesNotMatch(hub, /AIProviderService|ProdigyConfigService|ProjectWorkflowDraftService|resolveAIProfileProviderKey/u);
  assert.match(hub, /ProdigyAIConsumerRuntime/u);
});

test("Knowledge manifest removes every legacy provider runtime dependency", () => {
  const manifest = require(path.join(ROOT, "SYSTEM/Views/prodigy-workspace-manifest.js")).get("knowledge");
  for (const legacy of [
    "SYSTEM/Views/ai-provider-service.js",
    "SYSTEM/Views/ai-provider-error-policy.js",
    "SYSTEM/Views/ai-provider-fallback.js",
    "SYSTEM/Views/codex-exec-service.js",
    "SYSTEM/Views/antigravity-exec-service.js",
    "SYSTEM/Views/prodigy-config-service.js",
    "SYSTEM/Views/project-workflow-draft-service.js",
  ]) assert.equal(manifest.required.includes(legacy), false, legacy);
});
