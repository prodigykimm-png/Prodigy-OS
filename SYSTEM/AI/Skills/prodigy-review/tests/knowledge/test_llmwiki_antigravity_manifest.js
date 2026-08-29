"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");
const { test } = require("node:test");

const ROOT = path.resolve(__dirname, "../../../../../..");
const manifest = require(path.join(ROOT, "SYSTEM/Views/prodigy-workspace-manifest.js"));

test("Knowledge loads official exec services before AIProviderService", () => {
  const required = manifest.get("knowledge").required;
  const ai = required.indexOf("SYSTEM/Views/ai-provider-service.js");
  const antigravity = required.indexOf("SYSTEM/Views/antigravity-exec-service.js");
  const codex = required.indexOf("SYSTEM/Views/codex-exec-service.js");
  assert.ok(ai >= 0, "Knowledge loads AIProviderService");
  assert.ok(antigravity >= 0, "Knowledge loads AntigravityExecService");
  assert.ok(codex >= 0, "Knowledge loads CodexExecService");
  assert.ok(antigravity < ai, "AntigravityExecService must exist before AIProviderService resolves it");
  assert.ok(codex < ai, "CodexExecService must exist before AIProviderService resolves it");
  assert.equal(required.filter((item) => item === "SYSTEM/Views/antigravity-exec-service.js").length, 1);
  assert.equal(required.filter((item) => item === "SYSTEM/Views/codex-exec-service.js").length, 1);
});

test("Knowledge loads one durable batch core in dependency order", () => {
  const required = manifest.get("knowledge").required;
  const jobStore = required.indexOf("SYSTEM/Views/llmwiki-batch-job-store.js");
  const provider = required.indexOf("SYSTEM/Views/llmwiki-batch-provider.js");
  const analyzer = required.indexOf("SYSTEM/Views/llmwiki-batch-analyzer.js");
  const discovery = required.indexOf("SYSTEM/Views/llmwiki-inbox-discovery-queue.js");
  for (const modulePath of ["SYSTEM/Views/llmwiki-batch-job-store.js", "SYSTEM/Views/llmwiki-batch-provider.js", "SYSTEM/Views/llmwiki-batch-analyzer.js", "SYSTEM/Views/llmwiki-inbox-discovery-queue.js"]) {
    assert.equal(required.filter((item) => item === modulePath).length, 1, modulePath);
  }
  assert.ok(jobStore >= 0 && provider >= 0 && analyzer >= 0 && discovery >= 0);
  assert.ok(jobStore < analyzer);
});
