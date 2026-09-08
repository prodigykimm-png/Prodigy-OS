"use strict";

const assert = require("node:assert/strict");
const { test } = require("node:test");
const hash = require("../../../../../Views/llmwiki-hash.js");
const { runHub } = require("./knowledge_hub_integration_harness.js");

// Synthetic only. The source body must be checked before range slicing or provider dispatch.
const safeSection = "# Ordinary\nOAuth documentation and revenue 2026: 1234567890.\n";
const secret = "sk-test-NOTREAL01234567890123456789";
const body = `${safeSection}# Configuration\n${secret}\n`;
const sourcePath = "INBOX/API.md";
async function fixture(sourceBody = body, fixturePath = sourcePath) {
  let providerCalls = 0;
  const result = await runHub({
    pages: [],
    extraFiles: { [fixturePath]: sourceBody },
    llmWikiControllerOptions: {
      loadDynamicGoldenModules: true,
      batchProvider: async () => { providerCalls += 1; return { ok: false, reason: "synthetic_provider_sentinel" }; },
    },
  });
  const hub = result.window.KnowledgeExplorerHub;
  await hub.whenKnowledgeInboxSettled();
  return { result, hub, calls: () => providerCalls };
}

test("restored matching-hash source cannot bypass the actual Golden whole-source preflight", { timeout: 10000 }, async () => {
  const { hub, calls, result } = await fixture();
  const selected = hub._prodigyWikiController.dispatch({
    type: "select_source",
    source: { path: sourcePath, title: "API", source_kind: "inbox", content_hash: hash.sha256(body) },
  });
  assert.equal(selected.ok, true, "simulate a source retained from a pre-fix session");
  for (const scope of [null, { start: 0, end: safeSection.length }]) {
    const prepared = await hub.preflightGoldenWiki(scope);
    assert.equal(prepared.ok, false, "full source and safe-looking range of mixed-sensitive source must be held");
    assert.equal(prepared.reason, "source_privacy_blocked");
    assert.equal(prepared.provider_calls, 0);
    assert.equal(JSON.stringify(prepared).includes(secret), false);
  }
  assert.equal(calls(), 0);
  assert.equal(result.app.vault.touched.length, 0);
});

test("direct document planning rejects a mixed-sensitive whole source before scoped provider dispatch", { timeout: 10000 }, async () => {
  const { hub, calls, result } = await fixture();
  const response = await hub.runDocumentPlan(sourcePath, {
    expected_source_hash: hash.sha256(body),
    scope: { start: 0, end: safeSection.length },
  });
  assert.equal(response.ok, false);
  assert.equal(response.reason, "source_privacy_blocked");
  assert.equal(response.provider_calls, 0);
  assert.equal(calls(), 0, "a benign selected range must not bypass the whole-source hold");
  assert.equal(JSON.stringify(response).includes(secret), false);
  assert.equal(result.app.vault.touched.length, 0);
});

test("ordinary prose and numerics pass Golden preflight; missing boundary dependencies fail closed", { timeout: 10000 }, async () => {
  const { hub, calls, result } = await fixture(safeSection);
  hub._prodigyWikiController.dispatch({
    type: "select_source",
    source: { path: sourcePath, title: "API", source_kind: "inbox", content_hash: hash.sha256(safeSection) },
  });
  const before = result.app.vault.touched.map((row) => [...row]);
  assert.equal((await hub.preflightGoldenWiki()).ok, true);
  result.window.LLMWikiUserSourceSelector = undefined;
  const preflight = await hub.preflightGoldenWiki();
  assert.equal(preflight.ok, false);
  assert.equal(preflight.reason, "source_privacy_blocked");
  result.window.LLMWikiSensitiveContentPolicy = undefined;
  const planned = await hub.runDocumentPlan(sourcePath);
  assert.equal(planned.ok, false);
  assert.equal(planned.reason, "source_privacy_blocked");
  assert.equal(calls(), 0);
  assert.deepEqual(result.app.vault.touched, before);
});

test("private and People inputs stay blocked at both preflights despite outbound markers", { timeout: 10000 }, async () => {
  for (const [fixturePath, sourceBody] of [
    [sourcePath, `---\nprivacy: private\nllmwiki_outbound: true\n---\n${safeSection}`],
    [sourcePath, `---\ntype: person\nllmwiki_outbound: true\n---\n${safeSection}`],
    ["INBOX/People/API.md", `---\nllmwiki_outbound: true\n---\n${safeSection}`],
  ]) {
    const { hub, calls, result } = await fixture(sourceBody, fixturePath);
    const before = result.app.vault.touched.map((row) => [...row]);
    hub._prodigyWikiController.dispatch({
      type: "select_source",
      source: { path: fixturePath, title: "API", source_kind: "inbox", content_hash: hash.sha256(sourceBody) },
    });
    for (const response of [await hub.preflightGoldenWiki(), await hub.runDocumentPlan(fixturePath)]) {
      assert.equal(response.ok, false);
      assert.equal(response.reason, "source_privacy_blocked");
      assert.equal(response.provider_calls, 0);
    }
    assert.equal(calls(), 0);
    assert.deepEqual(result.app.vault.touched, before);
  }
});
