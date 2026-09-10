"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");
const { test } = require("node:test");
const ROOT = path.resolve(__dirname, "../../../../../..");
const { runHub, firstElement } = require("./knowledge_hub_integration_harness.js");
const candidates = require(path.join(ROOT, "SYSTEM/Views/llmwiki-evidence-candidates.js"));
const analyzerApi = require(path.join(ROOT, "SYSTEM/Views/llmwiki-batch-analyzer.js"));
const controllerApi = require(path.join(ROOT, "SYSTEM/Views/prodigy-wiki-controller.js"));
const operationApi = require(path.join(ROOT, "SYSTEM/Views/prodigy-wiki-operation-store.js"));
const hash = require(path.join(ROOT, "SYSTEM/Views/llmwiki-hash.js"));
const SOURCE_PATH = "INBOX/unit-cap-fixture.md";
const identity = { provider_key: "fixture", model: "fixture", structured_mode: "json_schema", schema_id: "llmwiki_compact_v2", prompt_version: "fixture" };
function fixture(count) {
  return `# Fixture\n\n${Array.from({ length: count }, (_, i) => `${i + 1}. Evidence item ${i + 1}.`).join("\n")}\n`;
}
async function hubFor(source, extraFiles = {}) {
  let calls = 0;
  const runtime = await runHub({ pages: [], extraFiles: { ...extraFiles, [SOURCE_PATH]: source }, llmWikiControllerOptions: {
    loadDynamicGoldenModules: true,
    batchIdentity: identity,
    batchProvider: async () => { calls += 1; throw new Error("provider_not_expected"); },
  } });
  const hub = runtime.window.KnowledgeExplorerHub;
  await hub.whenKnowledgeInboxSettled();
  // Use the public Hub action surface, not a parallel test-only controller.
  const act = (action) => hub.dispatchLlmWikiAction(action);
  if (hub.prodigyWikiSnapshot().status === "idle") {
    const selected = await act({ action: "select_source", source_path: SOURCE_PATH });
    assert.equal(selected.ok, true, selected.reason);
  }
  return { runtime, hub, act, calls: () => calls };
}

test("over-cap Hub preflight requires a range with counts and no retry", async () => {
  const source = fixture(513);
  assert.equal(candidates.createSemantic(source).length, 513);
  const h = await hubFor(source);
  const result = await h.act({ action: "request_consent" });
  const state = h.hub.prodigyWikiSnapshot();
  console.log(JSON.stringify({ fixture: "over-cap", status: state.status, result_status: result.status, resumable: state.resumable, provider_calls: h.calls() }));
  assert.equal(state.status, "range_required");
  assert.equal(result.status, "scope_required");
  assert.equal(result.ok, false);
  assert.equal(state.resumable, false);
  assert.equal(controllerApi.deriveViewModel(state).primary_action, "select_range");
  assert.equal(state.result.source_units_total, 513);
  assert.equal(state.result.source_units_cap, 512);
  assert.equal(state.result.source_bytes, Buffer.byteLength(source));
  assert.equal(firstElement(h.runtime.container, "button", (el) => ["resume-prodigy-wiki", "retry-prodigy-wiki"].includes(el.attr["data-action"])), null);
  assert.ok(state.result.scopes.length > 0);
  const narrowed = await h.act({ action: "select_golden_scope", scope_id: state.result.scopes.find((scope) => scope.end - scope.start < source.length).scope_id });
  assert.equal(narrowed.ok, true);
  const consent = await h.act({ action: "request_consent" });
  assert.equal(consent.status, "consent_required");
  assert.equal(h.calls(), 0);
  assert.equal(await h.runtime.app.vault.cachedRead({ path: SOURCE_PATH }), source);
});

test("under-cap and exact-cap Hub preflight keep the consent flow", async () => {
  for (const count of [2, 512]) {
    const h = await hubFor(fixture(count));
    const result = await h.act({ action: "request_consent" });
    assert.equal(result.status, "consent_required");
    assert.equal(h.hub.prodigyWikiSnapshot().status, "consent_required");
    assert.equal(h.calls(), 0);
  }
});

test("analyzer rejects deterministic unit defects before jobs or providers", async () => {
  let calls = 0;
  const analyzer = analyzerApi.createBatchAnalyzer({ cache: {}, coverage: {}, jobStore: { createJob() { throw new Error("job_not_expected"); } }, provider: async () => { calls += 1; throw new Error("provider_not_expected"); }, identity });
  const source = fixture(513);
  const sources = [{ source_id: "source_fixture", source_path: SOURCE_PATH, extracted_text: source }];
  for (const units of [candidates.createSemantic(source), [], [{ key: "unit", start: -1, end: 1 }], [{ key: "unit", start: 0, end: source.length + 1 }], [{ key: "unit", start: 1, end: 1 }]]) {
    const result = await analyzer.analyze({ sources, whole_source_units: [{ source_id: "source_fixture", units }] });
    assert.equal(result.ok, false);
    assert.equal(result.status, "scope_required");
    assert.equal(result.reason, "invalid_whole_source_units");
    assert.equal(result.resumable, false);
    assert.equal(result.metrics.provider_calls, 0);
  }
  assert.equal(calls, 0);
  const boundary = analyzerApi.preflightWholeSourceUnits([{ source_id: "source_fixture", units: [{ key: "unit", start: 0, end: source.length }] }], sources);
  assert.equal(boundary.ok, true);
});

test("headingless oversized sources offer contiguous smaller ranges", async () => {
  const source = fixture(1025).replace("# Fixture\n\n", "");
  const h = await hubFor(source);
  await h.act({ action: "request_consent" });
  const scopes = h.hub.prodigyWikiSnapshot().result.scopes;
  assert.equal(scopes.length, 3);
  assert.equal(scopes[0].start, 0);
  assert.equal(scopes.at(-1).end, source.length);
  for (let i = 0; i < scopes.length; i++) {
    if (i) assert.equal(scopes[i - 1].end, scopes[i].start);
    const result = await h.hub.preflightGoldenWiki(scopes[i]);
    assert.equal(result.ok, true, result.reason);
    assert.ok(result.source_units_total <= 512);
  }
  assert.equal(h.calls(), 0);
});

test("empty preflight and malformed planning units route the Hub away from retry", async () => {
  const empty = await hubFor("# Fixture\n");
  const refused = await empty.act({ action: "request_consent" });
  assert.equal(refused.status, "scope_required");
  assert.equal(empty.hub.prodigyWikiSnapshot().status, "range_required");
  assert.equal(empty.calls(), 0);

  const h = await hubFor(fixture(2));
  const consent = await h.act({ action: "request_consent" });
  assert.equal(consent.status, "consent_required");
  // Fault at the real planning boundary after a valid preflight. The analyzer
  // must still reject the actual unit plan and the Hub must preserve its route.
  h.runtime.window.LLMWikiEvidenceCandidates = { ...h.runtime.window.LLMWikiEvidenceCandidates,
    createSemantic: () => [{ key: "unit", start: 0, end: 99999 }],
  };
  const result = await h.act({ action: "start_run" });
  assert.equal(result.status, "scope_required");
  assert.equal(h.hub.prodigyWikiSnapshot().status, "range_required");
  assert.equal(h.hub.prodigyWikiSnapshot().resumable, false);
  assert.equal(h.hub.prodigyWikiOperationSnapshot(), null);
  assert.equal(h.calls(), 0);
});

test("direct document planning and stale retry intents preserve the range refusal", async () => {
  const h = await hubFor(fixture(513));
  const planned = await h.hub.runDocumentPlan(SOURCE_PATH);
  assert.equal(planned.status, "scope_required");
  assert.equal(planned.ok, false);
  assert.equal(planned.source_units_total, 513);
  for (const action of ["resume_prodigy_wiki", "retry_prodigy_wiki"]) {
    const result = await h.act({ action });
    assert.equal(result.status, "scope_required");
    assert.equal(h.hub.prodigyWikiSnapshot().status, "range_required");
    assert.equal(h.hub.prodigyWikiSnapshot().resumable, false);
    assert.equal(h.hub.prodigyWikiOperationSnapshot(), null);
  }
  assert.equal(h.calls(), 0);
});

test("persisted pre-fix unit failures restore to range selection, not retry", async () => {
  const source = fixture(513);
  const files = new Map();
  const store = operationApi.createStore({ hash, storage: {
    exists: async (name) => files.has(name), read: async (name) => files.get(name),
    writeAtomic: async (name, bytes) => files.set(name, bytes),
    quarantine: async () => { throw new Error("quarantine_not_expected"); },
  } });
  await store.begin({ source: { path: SOURCE_PATH, title: "Fixture", content_hash: hash.sha256(source), source_kind: "inbox" }, range: null, orchestrator_version: "llmwiki_golden_wiki_orchestrator_v3" });
  await store.interrupt({ reason: "invalid_whole_source_units", resumable: true });
  const h = await hubFor(source, { [`SYSTEM/CACHE/llmwiki/${operationApi.STATE_FILE}`]: files.get(operationApi.STATE_FILE) });
  assert.equal(h.hub.prodigyWikiSnapshot().status, "range_required");
  assert.equal(h.hub.prodigyWikiSnapshot().result.source_units_total, 513);
  assert.equal(h.hub.prodigyWikiOperationSnapshot(), null);
  assert.equal(firstElement(h.runtime.container, "button", (el) => ["resume-prodigy-wiki", "retry-prodigy-wiki"].includes(el.attr["data-action"])), null);
  assert.equal(h.calls(), 0);
});

test("changed source revisions still require reselection before range preflight", async () => {
  const h = await hubFor(fixture(513));
  await h.runtime.app.vault.modify({ path: SOURCE_PATH }, fixture(514));
  const result = await h.act({ action: "request_consent" });
  assert.equal(result.reason, "source_revision_changed");
  assert.equal(h.hub.prodigyWikiSnapshot().status, "source_changed");
  assert.equal(h.calls(), 0);
});
