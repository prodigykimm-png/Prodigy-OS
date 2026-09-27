"use strict";
// Golden-gate numeric failure must stay visible, name exact tokens and usable
// controls, survive reload, and regenerate under numeric constraints.
const assert = require("node:assert/strict");
const path = require("node:path");
const { test } = require("node:test");
const { action, click, collectText, mountRoot, snapshot, walk } = require("./llmwiki_lifecycle_view_fixture.js");

const ROOT = path.resolve(__dirname, "../../../../../..");
const lifecycle = require(path.join(ROOT, "SYSTEM/Views/llmwiki-lifecycle-view.js"));
const gate = require(path.join(ROOT, "SYSTEM/Views/llmwiki-golden-quality-gate.js"));
const inputApi = require(path.join(ROOT, "SYSTEM/Views/llmwiki-batch-provider-input.js"));
const batchProvider = require(path.join(ROOT, "SYSTEM/Views/llmwiki-batch-provider.js"));
const analyzerApi = require(path.join(ROOT, "SYSTEM/Views/llmwiki-batch-analyzer.js"));
const storeApi = require(path.join(ROOT, "SYSTEM/Views/llmwiki-batch-job-store.js"));
const opStore = require(path.join(ROOT, "SYSTEM/Views/prodigy-wiki-operation-store.js"));
const hash = require(path.join(ROOT, "SYSTEM/Views/llmwiki-hash.js"));

function mount(overrides) {
  const dom = mountRoot();
  const calls = [];
  const view = lifecycle.mountLlmWikiLifecycleView({
    container: dom.root,
    snapshot: snapshot("idle", overrides),
    onAction(intent) { calls.push(intent); return { ok: true, status: intent.action }; },
  });
  return { ...dom, calls, view };
}

const GATE_SOURCE = {
  selected: true, display_name: "투놀강의", source_path: "INBOX/투놀 8월 14일 강의.md",
  content_hash: "3".repeat(64), source_kind: "inbox",
};

function failedProdigyWiki(result) {
  return {
    status: "interrupted",
    source: { path: GATE_SOURCE.source_path, title: GATE_SOURCE.display_name, content_hash: GATE_SOURCE.content_hash, source_kind: "inbox" },
    range: null, stage: "gating", result,
    reason: "golden_gate_failed", resumable: false, operation_id: "a".repeat(64),
  };
}

const GATE_RESULT = {
  ok: false, status: "review_required", reason: "golden_gate_failed",
  issues: ["unsupported_numeric_token", "critical_token_missing"],
  metrics: { unsupported_numeric_tokens: ["70", "3"], missing_critical_tokens: ["2018년", "2019년"], critical_token_recall: 0.909 },
};

test("gate failure names exact tokens and both recovery controls, never the raw reason", () => {
  const subject = mount({});
  subject.view.update(snapshot("failed", {
    prodigy_wiki: failedProdigyWiki(GATE_RESULT),
    golden_wiki: { status: "failed", reason: "golden_gate_failed" },
    source_selection: GATE_SOURCE,
  }));
  const text = collectText(subject.root);
  for (const token of ["70", "3", "2018년", "2019년", "다시 정리하기", "다른 원문 선택", "정식 문서는 변경하지 않았습니다"]) {
    assert.ok(text.includes(token), `missing: ${token}`);
  }
  assert.ok(!text.includes("golden_gate_failed"), "raw reason must not leak");
  const retry = action(subject.root, "retry-prodigy-wiki");
  assert.ok(retry);
  assert.equal(retry.textContent, "다시 정리하기");
  assert.equal(retry.getAttribute("data-primary"), "true");
  assert.equal(action(subject.root, "reset-prodigy-source").textContent, "다른 원문 선택");
  click(retry);
  assert.deepEqual(subject.calls.at(-1), { action: "retry_prodigy_wiki", explicit_retry: true });
});

test("gate failure without issue detail keeps the generic terminal copy", () => {
  const subject = mount({});
  subject.view.update(snapshot("failed", {
    prodigy_wiki: failedProdigyWiki(null),
    golden_wiki: { status: "failed", reason: "golden_gate_failed" },
    source_selection: GATE_SOURCE,
  }));
  assert.ok(collectText(subject.root).includes("정리를 완료하지 못했습니다"));
  assert.ok(action(subject.root, "retry-prodigy-wiki"));
  assert.ok(action(subject.root, "reset-prodigy-source"));
});

test("provider input accepts a bounded fidelity instruction and rejects the rest", () => {
  const base = { outbound_allowed: true, chunks: [{ key: "chunk_01", text: "2018년 기록" }], candidate_ids: [] };
  const ok = inputApi.normalizeInput({ ...base, numeric_fidelity: "Must retain: 2018년." });
  assert.equal(ok.reason, undefined);
  assert.equal(ok.numericFidelity, "Must retain: 2018년.");
  const absent = inputApi.normalizeInput(base);
  assert.equal("numericFidelity" in absent, false);
  assert.equal(inputApi.normalizeInput({ ...base, numeric_fidelity: 42 }).reason, "numeric_fidelity_invalid");
  assert.equal(inputApi.normalizeInput({ ...base, numeric_fidelity: "" }).reason, "numeric_fidelity_invalid");
  assert.equal(inputApi.normalizeInput({ ...base, numeric_fidelity: "x".repeat(2049) }).reason, "numeric_fidelity_invalid");
});

function providerReturning(payload, onRequest = () => {}) {
  let calls = 0;
  const provider = batchProvider.createBatchAnalysisProvider({
    consumerRuntime: {
      requestStructured: async (options) => { calls += 1; onRequest(options, calls); return { payload }; },
    },
  });
  return { provider, callCount: () => calls };
}

const EXTRACT_RESPONSE = {
  status: "ok",
  results: [{ chunk_key: "chunk_01", outcome: "proposals", items: [
    { role: "source_summary", topic: "개요", evidence_key: "evidence_1", evidence_quote: "2018년 기록", claims: ["2018년에 기록했다."], review_reasons: [], related_candidate_ids: [] },
  ] }],
};

test("provider prompt carries the fidelity instruction only when supplied", async () => {
  const input = { outbound_allowed: true, run_id: "run_fidelity", chunks: [{ key: "chunk_01", text: "2018년 기록" }], candidate_ids: [] };
  let prompt;
  const { provider } = providerReturning(EXTRACT_RESPONSE, (options) => { prompt = JSON.parse(options.prompt); });
  const result = await provider({ ...input, numeric_fidelity: "Must retain: 2018년." });
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.equal(prompt.numeric_fidelity, "Must retain: 2018년.");
  prompt = null;
  const { provider: plain } = providerReturning(EXTRACT_RESPONSE, (options) => { prompt = JSON.parse(options.prompt); });
  assert.equal((await plain(input)).ok, true);
  assert.equal("numeric_fidelity" in prompt, false);
});

function analyzerVault(seed = {}) {
  const files = { ...seed };
  return {
    getAbstractFileByPath(p) { return Object.hasOwn(files, p) ? { path: p } : null; },
    async cachedRead(file) { return files[file.path]; },
    async createFolder(p) { files[p] = "__folder__"; },
    async create(p, text) { files[p] = text; },
    async modify(file, text) { files[file.path] = text; },
  };
}

function analyzerStorage() {
  const files = new Map();
  return {
    async exists(name) { return files.has(name); },
    async read(name) { return files.get(name); },
    async writeAtomic(name, text) { files.set(name, text); },
    async quarantine(name) { files.set(`${name}.quarantine`, ""); files.delete(name); },
  };
}

test("analyzer forwards the fidelity instruction to the provider boundary", async () => {
  const prompts = [];
  const provider = batchProvider.createBatchAnalysisProvider({
    consumerRuntime: { requestStructured: async (request) => {
      const envelope = JSON.parse(request.prompt);
      prompts.push(envelope);
      return { payload: { status: "ok", results: envelope.chunks.map((chunk) => ({
        chunk_key: chunk.key, outcome: "proposals",
        items: (chunk.evidence_candidates || []).map((candidate) => ({
          role: "source_summary", evidence_key: candidate.key, evidence_quote: candidate.text,
          claims: ["fidelity claim"], review_reasons: [], related_candidate_ids: [],
        })),
      })) } };
    } },
  });
  const analyzer = analyzerApi.createBatchAnalyzer({
    jobStore: storeApi.createBatchJobStore({ storage: analyzerStorage() }),
    provider,
    identity: { provider_key: "openrouter", model: "test/model-1", structured_mode: "json_schema", schema_id: "llmwiki_compact_v1", prompt_version: "p1" },
    vault: analyzerVault(),
    cachePath: "SYSTEM/PRIVATE/llmwiki-test-fidelity-cache.json",
    coveragePath: "SYSTEM/PRIVATE/llmwiki-test-fidelity-coverage.json",
  });
  const text = "2018년 기록이다. 다음 문장은 보조 설명이다.";
  const result = await analyzer.analyze({
    sources: [{ source_id: "src_fidelity", source_path: "INBOX/fidelity.md", extracted_text: text }],
    numeric_fidelity: "Must retain: 2018년.",
  });
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.ok(prompts.length > 0, "provider must be called");
  assert.equal(prompts[0].numeric_fidelity, "Must retain: 2018년.");
});

test("a corrected candidate passes the unchanged gate on numeric issues", () => {
  const source = "2018년 개관했고 2019년 확장했다. [[촬영 안내]]";
  const document = "2018년 개관했고 2019년 확장했다. [[촬영 안내]]";
  const evaluated = gate.evaluate({ source_text: source, source_path: "INBOX/투놀.md", document_text: document });
  assert.ok(!evaluated.issues.includes("unsupported_numeric_token"), JSON.stringify(evaluated.issues));
  assert.ok(!evaluated.issues.includes("critical_token_missing"), JSON.stringify(evaluated.issues));
});

function opStorage() {
  let bytes = null;
  return {
    async exists() { return bytes !== null; },
    async read() { return bytes; },
    async writeAtomic(_name, next) { bytes = next; },
    async quarantine() { bytes = null; },
  };
}

test("interrupted gate detail survives a store reload", async () => {
  const source = { path: "INBOX/투놀 8월 14일 강의.md", title: "투놀강의", source_kind: "inbox", content_hash: "3".repeat(64) };
  const storage = opStorage();
  const first = opStore.createStore({ storage, hash });
  await first.begin({ source, range: null, orchestrator_version: "llmwiki_golden_wiki_orchestrator_v1" });
  const detail = { issues: ["unsupported_numeric_token", "critical_token_missing"],
    metrics: { unsupported_numeric_tokens: ["70", "3"], missing_critical_tokens: ["2018년", "2019년"] } };
  await first.interrupt({ reason: "golden_gate_failed", stage: "gating", resumable: false, detail });
  const reloaded = opStore.createStore({ storage, hash });
  const operation = await reloaded.load();
  assert.equal(operation.reason, "golden_gate_failed");
  assert.deepEqual(operation.detail.issues, detail.issues);
  assert.deepEqual(operation.detail.metrics, detail.metrics);
});
