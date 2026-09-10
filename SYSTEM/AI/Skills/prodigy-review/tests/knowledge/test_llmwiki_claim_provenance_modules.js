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

test("browser claim validation hashes actual Korean evidence using the shared hash module without Node crypto", () => {
  const browser = { console, URL, require: undefined, module: undefined, process: undefined, Buffer: undefined };
  browser.globalThis = browser;
  vm.createContext(browser);
  for (const name of ["llmwiki-hash.js", ...MODULES]) vm.runInContext(fs.readFileSync(path.join(VIEWS, name), "utf8"), browser, { filename: name });
  const text = "해솔-842는 실내 모형에만 적용한다.";
  const commonHash = require(path.join(VIEWS, "llmwiki-hash.js")).sha256(text);
  assert.equal(browser.LLMWikiHash.sha256(text), commonHash);
  const input = { source_snapshots: [{ source_id: "source_browser_condition", source_kind: "immutable_source", source_revision: commonHash,
    extractor_revision: "b".repeat(64), source_text: text, source_content_hash: commonHash, provider_window: { start: 0, end: text.length } }],
    claims: [{ origin: "source_extract", text, citations: [{ source_id: "source_browser_condition", provider_span: { start: 0, end: text.length, span_digest: commonHash } }] }] };
  browser.fixtureInputJson = JSON.stringify(input);
  const created = vm.runInContext("LLMWikiClaimProvenance.createClaimSet(JSON.parse(fixtureInputJson))", browser);
  assert.equal(created.ok, true, JSON.stringify(created));
  assert.equal(browser.LLMWikiClaimProvenance.validateClaimSet(created.value).ok, true);
});
