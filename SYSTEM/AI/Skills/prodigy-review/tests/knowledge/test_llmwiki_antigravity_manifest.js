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

test("Knowledge loads incremental analysis state before inbox autopilot", () => {
  const required = manifest.get("knowledge").required;
  const incremental = required.indexOf("SYSTEM/Views/llmwiki-incremental-analysis-state.js");
  const autopilot = required.indexOf("SYSTEM/Views/llmwiki-inbox-autopilot.js");
  assert.ok(incremental >= 0, "Knowledge loads persistent incremental analysis state");
  assert.ok(autopilot >= 0, "Knowledge loads inbox autopilot");
  assert.ok(incremental < autopilot, "incremental state must exist before the Hub starts automatic analysis");
  assert.equal(required.filter((item) => item === "SYSTEM/Views/llmwiki-incremental-analysis-state.js").length, 1);
});
