"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { test } = require("node:test");

const ROOT = path.resolve(__dirname, "../../../../../..");
const config = require(path.join(ROOT, "SYSTEM/Views/prodigy-config-service.js"));

test("workspace config preserves presets and strips every AI provider field", async () => {
  const files = new Map([["SYSTEM/PRIVATE/project-wizard.local.json", JSON.stringify({
    defaultProvider: "gemini",
    fallbackProvider: "openrouter",
    providers: { gemini: { model: "legacy" } },
    aiProfiles: { llmwiki: { direct_provider_key: "gemini" } },
    workflowPresets: { Company: [{ label: "검증" }] },
  })]]);
  const app = { vault: {
    getAbstractFileByPath(filePath) { return files.has(filePath) ? { path: filePath } : null; },
    async read(file) { return files.get(file.path); },
  } };
  const loaded = await config.load(app);
  assert.deepEqual(loaded, { workflowPresets: { Company: [{ label: "검증" }] } });
  assert.doesNotMatch(JSON.stringify(loaded), /provider|model|aiProfiles/u);
  assert.deepEqual(Object.keys(config.DEFAULT_CONFIG), ["workflowPresets"]);
});

test("new workspace settings owns only integration secrets and links AI settings by machine action", () => {
  const source = fs.readFileSync(path.join(ROOT, "SYSTEM/Views/prodigy-workspace-settings-modal.js"), "utf8");
  assert.doesNotMatch(source, /defaultProvider|fallbackProvider|providers|aiProfiles|API 키 모델|structuredOutput/u);
  assert.match(source, /data-settings-action": "open-ai-runtime"/u);
  assert.match(source, /ProdigyAIClient/u);
  const legacy = [
    "SYSTEM/Views/prodigy-settings-modal.js",
    "SYSTEM/Views/ai-provider-service.js",
    "SYSTEM/Views/codex-exec-service.js",
    "SYSTEM/Views/antigravity-exec-service.js",
  ];
  legacy.forEach((relative) => assert.equal(fs.existsSync(path.join(ROOT, relative)), false, relative));
});
