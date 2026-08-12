"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "../../../../../..");
const HOME_PATH = path.join(ROOT, "HUB/00 Home.md");
const SERVICE_PATH = path.join(ROOT, "SYSTEM/Views/ai-provider-service.js");
const RESPONSE_PATH = path.join(ROOT, "SYSTEM/Views/ai-provider-response.js");
const SCHEMA_PATH = path.join(ROOT, "SYSTEM/Views/ai-provider-schema.js");
const POLICY_PATH = path.join(ROOT, "SYSTEM/Views/ai-provider-error-policy.js");
const FALLBACK_PATH = path.join(ROOT, "SYSTEM/Views/ai-provider-fallback.js");

function saveGlobal(key) {
  return Object.getOwnPropertyDescriptor(globalThis, key);
}

function restoreGlobal(key, descriptor) {
  if (descriptor) Object.defineProperty(globalThis, key, descriptor);
  else delete globalThis[key];
}

function evaluateDataviewService() {
  const keys = ["AIProviderResponse", "AIProviderSchema", "AIProviderErrorPolicy", "AIProviderFallback", "AIProviderService", "module", "require"];
  const savedGlobals = new Map(keys.map((key) => [key, saveGlobal(key)]));
  try {
    keys.forEach((key) => delete globalThis[key]);
    new Function(fs.readFileSync(RESPONSE_PATH, "utf8"))();
    new Function(fs.readFileSync(SCHEMA_PATH, "utf8"))();
    new Function(fs.readFileSync(POLICY_PATH, "utf8"))();
    new Function(fs.readFileSync(FALLBACK_PATH, "utf8"))();
    new Function(fs.readFileSync(SERVICE_PATH, "utf8"))();
    return globalThis.AIProviderService;
  } finally {
    for (const [key, descriptor] of savedGlobals) restoreGlobal(key, descriptor);
  }
}

function assertHomeProviderDependencies() {
  const source = fs.readFileSync(HOME_PATH, "utf8");
  const loadOrder = require(path.join(ROOT, "SYSTEM/AI/Skills/prodigy-review/tests/shared/fixtures/workspace-manifest-v1.json")).entries.home.required;
  const serviceIndex = loadOrder.indexOf("SYSTEM/Views/ai-provider-service.js");
  assert.ok(serviceIndex >= 0, "Home must load AIProviderService.");
  [
    "SYSTEM/Views/ai-provider-response.js",
    "SYSTEM/Views/ai-provider-schema.js",
    "SYSTEM/Views/ai-provider-error-policy.js",
    "SYSTEM/Views/ai-provider-fallback.js"
  ].forEach((dependency) => {
    const dependencyIndex = loadOrder.indexOf(dependency);
    assert.ok(dependencyIndex >= 0 && dependencyIndex < serviceIndex, `Home must load ${dependency} before AIProviderService.`);
  });
  assert.doesNotMatch(
    source,
    /SYSTEM\/Views\/(?:daily-reflection-ai|journal-view)\.js/,
    "Home must not preload the Reflection or Journal workspace facades."
  );
}

function main() {
  assertHomeProviderDependencies();
  const api = evaluateDataviewService();
  assert.ok(api, "DataviewJS must expose AIProviderService without CommonJS require.");
  assert.equal(typeof api.requestChatText, "function");
  assert.equal(typeof api.requestStructuredJson, "function");
  console.log("AI provider Dataview runtime test passed");
}

main();
