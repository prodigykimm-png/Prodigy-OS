"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "../../../../../..");
const BRIEF_GLOBALS = [
  "KnowledgeExplorerBriefCore",
  "KnowledgeExplorerBriefPolicy",
  "KnowledgeExplorerBriefRuntime",
  "KnowledgeExplorerBriefService"
];
const HELPER_MODULES = [
  "SYSTEM/Views/knowledge-explorer-brief-core.js",
  "SYSTEM/Views/knowledge-explorer-brief-policy.js",
  "SYSTEM/Views/knowledge-explorer-brief-service.js"
];
const FACADE_MODULE = "SYSTEM/Views/knowledge-explorer-brief.js";

function saveGlobal(key) {
  return Object.getOwnPropertyDescriptor(globalThis, key);
}

function restoreGlobal(key, descriptor) {
  if (descriptor) Object.defineProperty(globalThis, key, descriptor);
  else delete globalThis[key];
}

function evaluateDataviewScriptsWithoutRequire() {
  const savedGlobals = new Map([...BRIEF_GLOBALS, "module", "require"].map((key) => [key, saveGlobal(key)]));
  try {
    for (const key of BRIEF_GLOBALS) delete globalThis[key];
    globalThis.module = { exports: {} };
    delete globalThis.require;

    for (const modulePath of HELPER_MODULES) {
      new Function(fs.readFileSync(path.join(ROOT, modulePath), "utf8"))();
    }
    new Function(fs.readFileSync(path.join(ROOT, FACADE_MODULE), "utf8"))();

    return { api: globalThis.KnowledgeExplorerBriefService, exports: globalThis.module.exports };
  } finally {
    for (const [key, descriptor] of savedGlobals) restoreGlobal(key, descriptor);
  }
}

function main() {
  const { api, exports } = evaluateDataviewScriptsWithoutRequire();
  assert.ok(api, "DataviewJS global loader must expose KnowledgeExplorerBriefService without CommonJS require.");
  assert.equal(typeof api.createKnowledgeExplorerBriefService, "function");
  assert.equal(typeof api.buildDeterministicBrief, "function");
  assert.equal(typeof api.normalizeBriefSummary, "function");
  assert.equal(exports, api, "Node module.exports must retain the public Brief facade API when globals are preloaded.");
  console.log("Knowledge Explorer Brief Dataview runtime test passed");
}

main();
