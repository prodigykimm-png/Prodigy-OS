"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { test } = require("node:test");

const ROOT = path.resolve(__dirname, "../../../../../..");
const PLUGIN_ROOT = path.join(os.homedir(), "Developer/prodigy-ai-runtime");
const receipt = require(path.join(ROOT, "SYSTEM/docs/Prodigy_AI_Runtime_Migration_Receipt_v1.json"));

const RETIRED = [
  "SYSTEM/Views/ai-context-envelope.js",
  "SYSTEM/Views/ai-inspector.js",
  "SYSTEM/Views/ai-provider-response.js",
  "SYSTEM/Views/ai-provider-schema.js",
  "SYSTEM/Views/ai-provider-error-policy.js",
  "SYSTEM/Views/ai-provider-fallback.js",
  "SYSTEM/Views/ai-provider-service.js",
  "SYSTEM/Views/codex-exec-service.js",
  "SYSTEM/Views/antigravity-exec-service.js",
  "SYSTEM/Views/auction-ai-provider-resolver.js",
  "SYSTEM/Views/region-experience-provider-endpoint-guard.js",
  "SYSTEM/Views/prodigy-settings-modal.js",
];

test("legacy provider runtime is absent and its configuration has one plugin authority", () => {
  RETIRED.forEach((relative) => assert.equal(fs.existsSync(path.join(ROOT, relative)), false, relative));
  const configSource = fs.readFileSync(path.join(ROOT, "SYSTEM/Views/prodigy-config-service.js"), "utf8");
  assert.doesNotMatch(configSource, /defaultProvider|fallbackProvider|aiProfiles|providers|gemini|openrouter|codex|antigravity/u);
  for (const relative of ["SYSTEM/PRIVATE/prodigy.local.json", "SYSTEM/PRIVATE/project-wizard.local.json"]) {
    const config = JSON.parse(fs.readFileSync(path.join(ROOT, relative), "utf8"));
    assert.deepEqual(Object.keys(config), ["workflowPresets"]);
  }
  assert.equal(receipt.legacy_config_provider_fields_remaining, 0);
  assert.equal(receipt.consumer_bindings, 14);
  assert.equal(receipt.secret_values_written, 0);
});

test("installed plugin owns all migrated profiles without persisting secret values", () => {
  const dataPath = path.join(ROOT, receipt.plugin_data_path);
  const data = JSON.parse(fs.readFileSync(dataPath, "utf8"));
  assert.equal(data.schema_version, 1);
  assert.equal(data.default_profile_id, receipt.default_profile_id);
  assert.deepEqual(data.profiles.map((profile) => profile.profile_id), receipt.profile_ids);
  assert.equal(Object.keys(data.bindings).length, 14);
  assert.deepEqual(data.grants, {});
  assert.equal(data.migrated_from_hash, receipt.migrated_from_hash);
  assert.equal(data.profiles.filter((profile) => profile.certification_hash).length, receipt.shared_certified_profiles);
  for (const [profileId, certificationHash] of Object.entries(receipt.shared_certifications)) {
    assert.equal(data.profiles.find((profile) => profile.profile_id === profileId)?.certification_hash, certificationHash);
  }
  assert.equal(data.profiles.find((profile) => profile.profile_id === "codex")?.certification_hash, null);
  assert.equal(Object.keys(receipt.device_local_certifications).length + receipt.shared_certified_profiles, receipt.certified_profiles);
  for (const certifications of Object.values(receipt.device_local_certifications)) {
    for (const certificationHash of Object.values(certifications)) {
      assert.match(certificationHash, /^[0-9a-f]{64}$/u);
    }
  }
  assert.deepEqual(receipt.mobile_relay_acceptance.acceptance_accounting, {
    provider_requests: 2,
    completed: 1,
    cancel_controls: 1,
    cancel_requested: 1,
    retries: 0,
    fallback_calls: 0,
    failed: 0,
    active: 0,
  });
  assert.doesNotMatch(JSON.stringify(data), /api_key_value|raw_secret|Bearer\s|sk-[A-Za-z0-9]/u);
  for (const relative of ["main.js", "manifest.json", "versions.json"]) {
    assert.equal(fs.existsSync(path.join(ROOT, ".obsidian/plugins/prodigy-ai-runtime", relative)), true, relative);
  }
});

test("external repository contains the replacement transport and conformance evidence", () => {
  for (const relative of [
    "src/runtime.ts",
    "src/adapters/http.ts",
    "src/adapters/cli.ts",
    "src/adapters/relay.ts",
    "src/config.ts",
    "tests/runtime.test.ts",
    "tests/adapters.test.ts",
    "tests/config.test.ts",
    "tests/conformance.test.ts",
  ]) assert.equal(fs.existsSync(path.join(PLUGIN_ROOT, relative)), true, relative);
  const production = [
    "SYSTEM/Views/prodigy-ai-client.js",
    "SYSTEM/Views/prodigy-ai-consumer-runtime.js",
    "SYSTEM/Views/project-workflow-draft-service.js",
    "SYSTEM/Views/reading-question-ai.js",
    "SYSTEM/Views/reading-thinking-delta-ai.js",
    "SYSTEM/Views/daily-reflection-ai.js",
    "SYSTEM/Views/weekly-filter-ai.js",
    "SYSTEM/Views/monthly-validation-ai.js",
    "SYSTEM/Views/auction-ai-decision-support.js",
    "SYSTEM/Views/auction-real-estate-research.js",
    "SYSTEM/Views/region-experience-ai.js",
    "SYSTEM/Views/knowledge-source-batch-service.js",
    "SYSTEM/Views/knowledge-explorer-brief-service.js",
    "SYSTEM/Views/llmwiki-batch-provider.js",
    "SYSTEM/Views/llmwiki-ai-runtime-transport.js",
    "HUB/50 Knowledge.md",
  ].map((relative) => fs.readFileSync(path.join(ROOT, relative), "utf8")).join("\n");
  assert.doesNotMatch(production, /requestUrl\(|fetch\(|child_process|spawn\(|execFile\(|requestStructuredJson(?:Once|NoRetry)?|requestChatText/u);
});
