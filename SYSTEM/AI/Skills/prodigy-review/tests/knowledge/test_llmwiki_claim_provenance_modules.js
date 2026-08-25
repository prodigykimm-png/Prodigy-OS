"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const ROOT = path.resolve(__dirname, "../../../../../../");
const VIEWS = path.join(ROOT, "SYSTEM/Views");
const MODULES = Object.freeze([
  "llmwiki-claim-provenance-core.js",
  "llmwiki-claim-provenance-boundary.js",
  "llmwiki-claim-provenance-graph.js",
  "llmwiki-claim-provenance-lifecycle.js",
  "llmwiki-claim-provenance.js",
]);

function browserApi() {
  const browser = { console, URL, require: undefined, module: undefined, process: undefined, Buffer: undefined };
  browser.globalThis = browser;
  vm.createContext(browser);
  for (const moduleName of MODULES) vm.runInContext(fs.readFileSync(path.join(VIEWS, moduleName), "utf8"), browser, { filename: moduleName });
  return browser.LLMWikiClaimProvenance;
}

test("Given ordered internal modules, When the browser facade loads, Then it preserves the CommonJS contract", () => {
  // Given
  const commonJs = require(path.join(VIEWS, "llmwiki-claim-provenance.js"));
  const browser = browserApi();

  // When
  const browserKeys = Object.keys(browser);

  // Then
  assert.deepEqual(browserKeys, Object.keys(commonJs));
  for (const name of ["createClaimSet", "validateClaimSet", "transitionClaimSet", "assessClaimStaleness"]) assert.equal(typeof browser[name], "function");
  assert.equal(Object.isFrozen(browser), true);
  assert.equal(Object.isFrozen(browser.ORIGINS), true);
  assert.equal(Object.isFrozen(browser.STATUSES), true);
});
