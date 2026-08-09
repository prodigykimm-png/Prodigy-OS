"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "../../../../../..");
const HOME_PATH = path.join(ROOT, "HUB/00 Home.md");
const SERVICE_PATH = path.join(ROOT, "SYSTEM/Views/ai-provider-service.js");
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
  const keys = ["AIProviderErrorPolicy", "AIProviderFallback", "AIProviderService", "module", "require"];
  const savedGlobals = new Map(keys.map((key) => [key, saveGlobal(key)]));
  try {
    keys.forEach((key) => delete globalThis[key]);
    new Function(fs.readFileSync(POLICY_PATH, "utf8"))();
    new Function(fs.readFileSync(FALLBACK_PATH, "utf8"))();
    globalThis.module = { exports: {} };
    globalThis.require = () => {
      throw new Error("Vault Dataview execution must not call Electron require().");
    };
    new Function(fs.readFileSync(SERVICE_PATH, "utf8"))();
    return globalThis.AIProviderService;
  } finally {
    for (const [key, descriptor] of savedGlobals) restoreGlobal(key, descriptor);
  }
}

function assertHomeProviderDependencies() {
  const source = fs.readFileSync(HOME_PATH, "utf8");
  const loadOrder = [...source.matchAll(/loadProdigyScript\("([^"]+)"\)/g)].map((match) => match[1]);
  const serviceIndex = loadOrder.indexOf("SYSTEM/Views/ai-provider-service.js");
  assert.ok(serviceIndex >= 0, "Home must load AIProviderService.");
  [
    "SYSTEM/Views/ai-provider-response.js",
    "SYSTEM/Views/ai-provider-schema.js",
    "SYSTEM/Views/ai-context-envelope.js",
    "SYSTEM/Views/ai-provider-error-policy.js",
    "SYSTEM/Views/ai-provider-fallback.js",
    "SYSTEM/Views/codex-exec-service.js",
    "SYSTEM/Views/antigravity-exec-service.js"
  ].forEach((dependency) => {
    const dependencyIndex = loadOrder.indexOf(dependency);
    assert.ok(dependencyIndex >= 0 && dependencyIndex < serviceIndex, `Home must load ${dependency} before AIProviderService.`);
  });
  const reflectionIndex = loadOrder.indexOf("SYSTEM/Views/daily-reflection-ai.js");
  assert.ok(reflectionIndex >= 0, "Home must load DailyReflectionAI.");
  [
    "SYSTEM/Views/evidence-quality-core.js",
    "SYSTEM/Views/daily-reflection-venue-policy.js",
    "SYSTEM/Views/daily-reflection-proposal-contract.js",
    "SYSTEM/Views/daily-reflection-object-links.js",
    "SYSTEM/Views/daily-reflection-knowledge-handoff.js",
    "SYSTEM/Views/daily-reflection-conservative-policy.js"
  ].forEach((dependency) => {
    const dependencyIndex = loadOrder.indexOf(dependency);
    assert.ok(dependencyIndex >= 0 && dependencyIndex < reflectionIndex, `Home must load ${dependency} before DailyReflectionAI.`);
  });
  const journalIndex = loadOrder.indexOf("SYSTEM/Views/journal-view.js");
  assert.ok(journalIndex >= 0, "Home must load JournalView.");
  [
    "SYSTEM/Views/place-candidate-store.js",
    "SYSTEM/Views/venue-creator.js",
    "SYSTEM/Views/daily-reflection-modal-styles.js",
    "SYSTEM/Views/daily-reflection-modal-state.js",
    "SYSTEM/Views/daily-reflection-proposal-input-view.js",
    "SYSTEM/Views/daily-reflection-proposal-candidates-view.js",
    "SYSTEM/Views/daily-reflection-evidence-review-view.js",
    "SYSTEM/Views/daily-reflection-candidate-handoff-view.js",
    "SYSTEM/Views/daily-reflection-post-save.js",
    "SYSTEM/Views/daily-reflection-modal.js",
    "SYSTEM/Views/journal-review-modal.js",
    "SYSTEM/Views/journal-evidence-block-modal.js",
    "SYSTEM/Views/journal-completion-action.js",
    "SYSTEM/Views/journal-dashboard-view.js"
  ].forEach((dependency) => {
    const dependencyIndex = loadOrder.indexOf(dependency);
    assert.ok(dependencyIndex >= 0 && dependencyIndex < journalIndex, `Home must load ${dependency} before JournalView.`);
  });
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
