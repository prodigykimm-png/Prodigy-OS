"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");
const { test } = require("node:test");

const ROOT = path.resolve(__dirname, "../../../../../..");
const hash = require(path.join(ROOT, "SYSTEM/Views/llmwiki-hash.js"));
const analyzerApi = require(path.join(ROOT, "SYSTEM/Views/llmwiki-batch-analyzer.js"));
const storeApi = require(path.join(ROOT, "SYSTEM/Views/llmwiki-batch-job-store.js"));

const CACHE_PATH = "SYSTEM/PRIVATE/llmwiki-test-cache.json";
const COVERAGE_PATH = "SYSTEM/PRIVATE/llmwiki-test-coverage.json";

test("Knowledge manifest loads semantic evidence before the analyzer that captures it", () => {
  const required = require(path.join(ROOT, "SYSTEM/Views/prodigy-workspace-manifest.js")).get("knowledge").required;
  assert.ok(required.indexOf("SYSTEM/Views/llmwiki-evidence-candidates.js") < required.indexOf("SYSTEM/Views/llmwiki-batch-analyzer.js"));
});

function vault(seed = {}) {
  const files = { ...seed };
  return {
    files,
    getAbstractFileByPath(p) { return Object.hasOwn(files, p) ? { path: p } : null; },
    async cachedRead(file) { return files[file.path]; },
    async createFolder(p) { files[p] = "__folder__"; },
    async create(p, text) { files[p] = text; },
    async modify(file, text) { files[file.path] = text; },
  };
}

function memoryStorage() {
  const files = new Map();
  return {
    files,
    async exists(name) { return files.has(name); },
    async read(name) { return files.get(name); },
    async writeAtomic(name, text) { files.set(name, text); },
    async quarantine(name) { files.set(`${name}.quarantine`, ""); files.delete(name); },
  };
}

function baseIdentity(overrides = {}) {
  return {
    provider_key: "openrouter",
    model: "test/model-1",
    structured_mode: "json_schema",
    schema_id: "llmwiki_compact_v1",
    prompt_version: "p1",
    ...overrides,
  };
}

function candidates(count) {
  return Array.from({ length: count }, (_, i) => ({ document_id: `doc_${i}`, canonical_revision: "a".repeat(64) }));
}

// Deterministic fake transport: parses the batch-provider prompt envelope and
// answers every chunk with one exact unique quote taken from its own text.
function fakeService(box) {
  const state = { calls: 0, requests: [] };
  return {
    state,
    requestStructuredJsonNoRetry: async (requestOptions) => {
      state.calls += 1;
      if (box.failOnCall && state.calls === box.failOnCall) throw new Error("provider boom");
      const envelope = JSON.parse(requestOptions.prompt);
      state.requests.push(envelope);
      return {
        status: "ok",
        results: envelope.chunks.map((chunk) => ({
          chunk_key: chunk.key,
          outcome: "proposals",
          items: envelope.mode === "semantic"
            ? chunk.evidence_candidates.map((candidate) => ({
              role: "source_summary",
              evidence_key: candidate.key,
              evidence_quote: candidate.text,
              claims: [box.claim || "bounded claim"],
              review_reasons: [],
              related_candidate_ids: [],
            }))
            : [{
              role: "source_summary",
              evidence_quote: chunk.text.slice(0, 8),
              claims: [box.claim || "bounded claim"],
              review_reasons: [],
              related_candidate_ids: [],
            }],
        })),
      };
    },
  };
}

function buildHarness() {
  const v = vault();
  const storage = memoryStorage();
  const box = {};
  const service = fakeService(box);
  const jobStore = storeApi.createBatchJobStore({ storage });
  const batchProvider = require(path.join(ROOT, "SYSTEM/Views/llmwiki-batch-provider.js"));
  function fresh(identityOverrides = {}) {
    const frozenIdentity = baseIdentity(identityOverrides);
    const provider = batchProvider.createBatchAnalysisProvider({
      consumerRuntime: {
        requestStructured: async (request) => ({ payload: await service.requestStructuredJsonNoRetry(request) }),
      },
    });
    return analyzerApi.createBatchAnalyzer({
      jobStore,
      provider,
      identity: frozenIdentity,
      vault: v,
      cachePath: CACHE_PATH,
      coveragePath: COVERAGE_PATH,
    });
  }
  return { v, storage, service, jobStore, box, analyzer: fresh(), fresh };
}

function source(id, text, analysisText) {
  return {
    source_id: id,
    source_path: `INBOX/${id}.md`,
    extracted_text: text,
    ...(analysisText === undefined ? {} : { analysis_text: analysisText }),
  };
}

function smallText(label, index) {
  return `${label} 문단 ${index}입니다. 지식 순환 원칙은 배치 실행이다.\n\n두 번째 문단은 보조 설명이다 ${index}.`;
}

test("identical text from two sources reaches review_ready with unique provider keys", async () => {
  const h = buildHarness();
  const sources = [source("src_one", smallText("동일", 1)), source("src_two", smallText("동일", 1))];
  const result = await h.analyzer.analyze({ sources });
  assert.equal(result.ok, true);
  assert.equal(result.state, "review_ready");
  assert.equal(result.metrics.cache_misses, 2);
  assert.equal(result.metrics.provider_calls, 1);
});

test("four small changed sources produce exactly one provider call", async () => {
  const h = buildHarness();
  const result = await h.analyzer.analyze({
    sources: ["b", "a", "d", "c"].map((id, i) => source(`src_${id}`, smallText("소스", i))),
    candidates: candidates(3),
  });
  assert.equal(result.ok, true);
  assert.equal(result.state, "review_ready");
  assert.equal(result.metrics.provider_calls, 1);
  assert.equal(result.metrics.cache_misses, 4);
  assert.equal(result.metrics.cache_hits, 0);
  assert.equal(result.metrics.pack_count, 1);
  assert.equal(result.metrics.fallback_attempts, 0);
  assert.equal(result.metrics.automatic_retries, 0);
  assert.equal(result.metrics.automatic_repairs, 0);
  assert.equal(result.metrics.canonical_writes, 0);
  assert.equal(result.metrics.source_writes, 0);
  assert.equal(result.metrics.audit_writes, 0);
  assert.equal(result.metrics.git_writes, 0);
  assert.ok(result.metrics.candidate_context_bytes <= 4 * 1024);
});

test("exact rerun with same hashes and request key makes zero provider calls", async () => {
  const h = buildHarness();
  const sources = [source("src_alpha", smallText("반복", 1)), source("src_beta", smallText("반복", 2))];
  const first = await h.analyzer.analyze({ sources });
  assert.equal(first.metrics.provider_calls, 1);
  const second = await h.fresh().analyze({ sources });
  assert.equal(second.ok, true);
  assert.equal(second.state, "review_ready");
  assert.equal(second.metrics.provider_calls, 0);
  assert.equal(second.metrics.cache_hits, 2);
  assert.equal(second.metrics.cache_misses, 0);
});

test("v1 cache intentionally misses once under v2 identity, then exact v2 replay is zero-call", async () => {
  const h = buildHarness();
  const sources = [source("src_identity", smallText("identity", 1))];
  const v1 = await h.fresh({ schema_id: "llmwiki_compact_v1", prompt_version: "llmwiki_batch_compact_v1" }).analyze({ sources });
  assert.equal(v1.ok, true, v1.reason);
  assert.equal(v1.metrics.provider_calls, 1);
  const v2 = await h.fresh({ schema_id: "llmwiki_compact_v2", prompt_version: "llmwiki_batch_compact_v2" }).analyze({ sources });
  assert.equal(v2.ok, true, v2.reason);
  assert.equal(v2.metrics.cache_hits, 0);
  assert.equal(v2.metrics.provider_calls, 1);
  const v2Replay = await h.fresh({ schema_id: "llmwiki_compact_v2", prompt_version: "llmwiki_batch_compact_v2" }).analyze({ sources });
  assert.equal(v2Replay.ok, true, v2Replay.reason);
  assert.equal(v2Replay.metrics.cache_hits, 1);
  assert.equal(v2Replay.metrics.provider_calls, 0);
  assert.equal(h.service.state.calls, 2);
});

test("semantic 65-unit input fans out through transport", async () => {
  const h = buildHarness();
  const sourceText = Array.from({ length: 65 }, (_, index) => `- unit ${index + 1}`).join("\n");
  const result = await h.analyzer.analyze({ sources: [source("src_limit", sourceText)] });
  assert.equal(result.ok, true, result.reason);
  assert.ok(h.service.state.calls >= 1);
  assert.equal(result.state, "review_ready");
});

test("explicit retry reuses exact repeated chunks while preserving parent history", async () => {
  const h = buildHarness();
  let section = "## 반복 구간\n";
  while (hash.utf8ByteLength(section) < 7 * 1024) section += "반복 근거는 같은 구간에서도 정확한 위치를 유지한다. ";
  const sources = [source("src_retry_generation", section.repeat(2))];
  const first = await h.analyzer.analyze({ sources });
  assert.equal(first.ok, true, first.reason);
  await h.jobStore.setJobState(first.job_id, "blocked");

  const retried = await h.fresh().analyze({
    sources,
    explicit_retry: true,
    retry_intent_id: "retry_generation_1",
  });

  assert.equal(retried.ok, true, retried.reason);
  assert.equal(retried.state, "review_ready");
  assert.equal(retried.metrics.provider_calls, 0);
  assert.equal(retried.metrics.cache_hits, 2);
  const replay = await h.fresh().analyze({ sources });
  assert.equal(replay.ok, true, replay.reason);
  assert.equal(replay.state, "blocked", "normal continue preserves the original parent outcome");
  assert.equal(replay.metrics.provider_calls, 0);
  const sameRetry = await h.fresh().analyze({ sources, explicit_retry: true, retry_intent_id: "retry_generation_1" });
  assert.equal(sameRetry.job_id, retried.job_id);
  assert.equal(sameRetry.state, "review_ready");
  assert.equal(sameRetry.metrics.provider_calls, 0);
});

test("explicit retry without a retryable parent falls back to fresh analysis", async () => {
  const h = buildHarness();
  const sources = [source("src_no_parent", smallText("부모없음", 1))];
  const retried = await h.fresh().analyze({ sources, explicit_retry: true, retry_intent_id: "retry_no_parent_1" });
  assert.equal(retried.ok, true, retried.reason || "threw");
  assert.equal(retried.state, "review_ready");
});

test("model, schema, prompt-version, context, or source change causes an intentional miss", async () => {
  const h = buildHarness();
  const sources = [source("src_delta", smallText("변경", 1))];
  await h.analyzer.analyze({ sources });

  const byModel = await h.fresh({ model: "test/model-2" }).analyze({ sources });
  assert.equal(byModel.ok, true, byModel.reason);
  assert.equal(byModel.metrics.cache_hits, 0);
  assert.equal(byModel.metrics.provider_calls, 1);
  const byModelRepeat = await h.fresh({ model: "test/model-2" }).analyze({ sources });
  assert.equal(byModelRepeat.ok, true, byModelRepeat.reason);
  assert.equal(byModelRepeat.metrics.cache_hits, 1);
  assert.equal(byModelRepeat.metrics.provider_calls, 0);

  const bySchema = await h.fresh({ schema_id: "llmwiki_compact_v2" }).analyze({ sources });
  assert.equal(bySchema.metrics.cache_hits, 0);

  const byPrompt = await h.fresh({ prompt_version: "p2" }).analyze({ sources });
  assert.equal(byPrompt.metrics.cache_hits, 0);

  const byContext = await h.fresh().analyze({ sources, candidates: candidates(4) });
  assert.equal(byContext.metrics.cache_hits, 0);

  const changed = [source("src_delta", `${smallText("변경", 1)}\n\n새로운 문단이 추가되었다.`)];
  const bySource = await h.fresh().analyze({ sources: changed });
  assert.equal(bySource.metrics.cache_hits, 0);
  assert.equal(bySource.metrics.provider_calls, 1);
});

function utf8Prefix(text, limit = 4 * 1024) {
  let prefix = "";
  for (const character of text) {
    if (hash.utf8ByteLength(prefix + character) > limit) break;
    prefix += character;
  }
  return prefix;
}

function bigBody(targetKiB) {
  let body = "";
  let i = 0;
  while (hash.utf8ByteLength(body) < targetKiB * 1024) {
    let section = `## 절 ${i}\n`;
    while (hash.utf8ByteLength(section) < 7 * 1024) {
      section += `관찰 ${i}: 배치 분석은 결정적으로 동작해야 한다. 재현 가능성이 핵심 계약이다. `;
    }
    body += `${section}\n\n`;
    i += 1;
  }
  return body;
}

test("100 KiB INBOX source uses one bounded exact-prefix routing chunk while retaining its full revision", async () => {
  const h = buildHarness();
  const extractedText = bigBody(100);
  const analysisText = utf8Prefix(extractedText);
  const sources = [source("src_big", extractedText, analysisText)];
  const first = await h.analyzer.analyze({ sources });
  assert.equal(first.ok, true);
  assert.equal(first.metrics.source_bytes, hash.utf8ByteLength(analysisText));
  assert.equal(first.metrics.pack_count, 1);
  assert.equal(first.metrics.provider_calls, 1);
  assert.equal(h.service.state.requests.length, 1);
  assert.equal(h.service.state.requests[0].mode, "source_routing");
  assert.equal(h.service.state.requests[0].chunks.length, 1);
  assert.equal(h.service.state.requests[0].chunks[0].text, analysisText);
  assert.equal(h.service.state.requests[0].chunks[0].source_hint, "INBOX/src_big.md");
  assert.ok(hash.utf8ByteLength(h.service.state.requests[0].chunks[0].text) <= 4 * 1024);
  assert.equal(h.jobStore.getJob(first.batch_id).sources.src_big, hash.sha256(extractedText));
  assert.equal(first.coverage_reports[0].complete, true);
  assert.equal(first.coverage_reports[0].exactCoverage, true);
  const second = await h.fresh().analyze({ sources });
  assert.equal(second.metrics.provider_calls, 0);
  assert.equal(second.metrics.cache_hits, 1);
  assert.deepEqual(second.manifest_digests, first.manifest_digests);
});

test("analysis_text rejects non-prefix, oversized, and split-surrogate excerpts", async () => {
  const h = buildHarness();
  const splitSource = `${"a".repeat(4093)}😀suffix`;
  for (const item of [
    source("src_prefix", "prefix body", "other"),
    source("src_large", "x".repeat(5000), "x".repeat(4097)),
    source("src_split", splitSource, `${"a".repeat(4093)}\ud83d`),
  ]) {
    const result = await h.analyzer.analyze({ sources: [item] });
    assert.equal(result.ok, false);
    assert.equal(result.reason, "invalid_analysis_text");
  }
  assert.equal(h.service.state.calls, 0);
});

test("sources without analysis_text retain full-text analysis", async () => {
  const h = buildHarness();
  const extractedText = bigBody(100);
  const result = await h.analyzer.analyze({ sources: [source("src_full", extractedText)] });
  assert.equal(result.ok, true);
  assert.equal(result.metrics.source_bytes, hash.utf8ByteLength(extractedText));
  assert.ok(h.service.state.requests[0].chunks.length > 1);
  assert.equal(h.service.state.requests[0].mode, "semantic");
  assert.equal(Object.hasOwn(h.service.state.requests[0].chunks[0], "source_hint"), false);
  assert.equal(h.jobStore.getJob(result.batch_id).sources.src_full, hash.sha256(extractedText));
});

test("pack 3 failure preserves packs 1-2 through restart and makes no fourth call", async () => {
  const h = buildHarness();
  const sources = [source("src_fail", bigBody(60))];
  h.box.failOnCall = 3;
  const failed = await h.analyzer.analyze({ sources });
  assert.equal(failed.ok, false);
  assert.equal(failed.reason, "provider_unavailable");
  assert.equal(failed.metrics.provider_calls, 3);
  assert.equal(failed.metrics.automatic_retries, 0);
  assert.equal(failed.metrics.automatic_repairs, 0);
  assert.equal(failed.preserved_pack_receipts.length, 2);
  const jobAfterFailure = await h.jobStore.load().then(() => h.jobStore.getJob(failed.batch_id));
  assert.equal(jobAfterFailure.status, "blocked");

  const restarted = await h.fresh().analyze({ sources });
  assert.equal(restarted.metrics.provider_calls, 0);
  assert.equal(restarted.state, "blocked");
  assert.ok(restarted.unresolved_pending.length > 0);
  const job = h.jobStore.getJob(failed.batch_id);
  assert.equal(job.sources["src_fail"], hash.sha256(sources[0].extracted_text));
});

test("candidate ranking is bounded at 8 and outbound projection at top 5 / 4 KiB", async () => {
  const h = buildHarness();
  const result = await h.analyzer.analyze({
    sources: [source("src_ctx", smallText("맥락", 1))],
    candidates: candidates(20),
  });
  assert.equal(result.ok, true);
  assert.ok(result.outbound_candidates.length <= 5);
  assert.ok(result.ranked_candidate_count <= 8);
  assert.ok(result.metrics.candidate_context_bytes <= 4 * 1024);
});

test("all-hits replay over a content-incomplete whole-source artifact misses once under the coverage-carrying identity and refuses review_ready with named keys", async () => {
  const h = buildHarness();
  const evidenceCandidatesApi = require(path.join(ROOT, "SYSTEM/Views/llmwiki-evidence-candidates.js"));
  const lines = [
    "첫 번째 단위 문장은 확실한 근거를 보존한다.",
    "두 번째 단위 문장은 정확한 가격을 보존한다.",
    "세 번째 단위 문장은 정확한 위치를 보존한다.",
    "네 번째 단위 문장은 계약 조건을 보존한다.",
    "다섯 번째 단위 문장은 승인 경계를 보존한다.",
    "여섯 번째 단위 문장은 공급 구조를 보존한다.",
    "일곱 번째 단위 문장은 완료 기준을 보존한다.",
  ];
  const text = lines.map((line) => `- ${line}`).join("\n");
  const sources = [source("src_units", text)];
  const realUnits = evidenceCandidatesApi.createSemantic(text);
  assert.equal(realUnits.length, 7, "fixture must yield seven chunk-candidate units");
  // A 12/12 whole-source plan: the seven units the artifact can cite plus five
  // planned units whose spans (leading list markers) the artifact never cites.
  const extraUnits = Array.from({ length: 5 }, (_, index) => ({ key: `evidence_${8 + index}`, start: index, end: index + 1 }));
  const wholeSourceUnits = [{
    source_id: "src_units",
    units: [
      ...realUnits.map((unit) => ({ key: unit.key, start: unit.start, end: unit.end })),
      ...extraUnits,
    ],
  }];

  // Run 1 stores a content-incomplete v2-keyed artifact (7 candidate units)
  // under the identity that carries no whole-source coverage lineage.
  const first = await h.analyzer.analyze({ sources });
  assert.equal(first.ok, true, first.reason);
  assert.equal(first.state, "review_ready");
  assert.equal(first.metrics.provider_calls, 1);
  assert.equal(first.replay_only, false);

  // Run 2: the same v2 identity plus a 12-unit whole-source plan. Before this
  // fix the stale 7/12 artifact replayed (all hits) into review_ready with zero
  // provider calls. Now the coverage-carrying request key misses once and the
  // uncovered units surface through that single normal miss-driven call as
  // semantic_candidate_key_missing with missing_semantic_keys[] — never
  // review_ready, and with no retry/repair/fallback loop.
  const second = await h.analyzer.analyze({ sources, whole_source_units: wholeSourceUnits });
  assert.equal(second.ok, false, "stale 7/12 replay must not complete");
  assert.equal(second.reason, "semantic_candidate_key_missing");
  assert.deepEqual(second.missing_semantic_keys, extraUnits.map((unit) => unit.key));
  assert.equal(second.state, "blocked");
  assert.equal(second.metrics.cache_hits, 0, "stale artifact misses under the coverage-carrying identity");
  assert.equal(second.metrics.cache_misses, 1);
  assert.equal(second.metrics.provider_calls, 1, "exactly one normal miss-driven call");
  assert.equal(second.replay_only, false);
  assert.equal(h.service.state.calls, 2, "two transport calls total: one fresh, one miss-driven");

  // The refusal is durable: the same plan re-runs short-circuit on the blocked
  // job with zero additional calls rather than spiraling.
  const third = await h.analyzer.analyze({ sources, whole_source_units: wholeSourceUnits });
  assert.equal(third.ok, true);
  assert.equal(third.state, "blocked");
  assert.equal(third.metrics.provider_calls, 0);
  assert.equal(h.service.state.calls, 2);

  // A corrected whole-source plan (the seven units the content actually covers)
  // gets its own coverage identity, misses once, and reaches review_ready — the
  // lineage is not a permanent blocker.
  const correctedUnits = [{
    source_id: "src_units",
    units: realUnits.map((unit) => ({ key: unit.key, start: unit.start, end: unit.end })),
  }];
  const fourth = await h.analyzer.analyze({ sources, whole_source_units: correctedUnits });
  assert.equal(fourth.ok, true, fourth.reason);
  assert.equal(fourth.state, "review_ready");
  assert.equal(fourth.metrics.provider_calls, 1);
  assert.equal(h.service.state.calls, 3);
  const fourthReplay = await h.analyzer.analyze({ sources, whole_source_units: correctedUnits });
  assert.equal(fourthReplay.ok, true, fourthReplay.reason);
  assert.equal(fourthReplay.state, "review_ready");
  assert.equal(fourthReplay.metrics.provider_calls, 0);
  assert.equal(fourthReplay.replay_only, true);
});

test("exact all-hits replay is flagged replay_only when whole-source coverage is complete", async () => {
  const h = buildHarness();
  const sources = [source("src_replay_flag", smallText("완전", 1))];
  const first = await h.analyzer.analyze({ sources });
  assert.equal(first.ok, true, first.reason);
  assert.equal(first.replay_only, false);
  const second = await h.analyzer.analyze({ sources });
  assert.equal(second.ok, true, second.reason);
  assert.equal(second.state, "review_ready");
  assert.equal(second.metrics.provider_calls, 0);
  assert.equal(second.metrics.cache_hits, 1);
  assert.equal(second.replay_only, true);
});

// ---- Task 6 queue legibility: shared/item/input scope, pending sources,
// visible action sets, no-fallback proof, and canonical queue summary. ----

function task6Analyzer(harness, provider) {
  return analyzerApi.createBatchAnalyzer({
    jobStore: harness.jobStore,
    provider,
    identity: baseIdentity(),
    vault: harness.v,
    cachePath: CACHE_PATH,
    coveragePath: COVERAGE_PATH,
  });
}

function task6SuccessProvider(harness) {
  const batchProvider = require(path.join(ROOT, "SYSTEM/Views/llmwiki-batch-provider.js"));
  return batchProvider.createBatchAnalysisProvider({
    consumerRuntime: {
      requestStructured: async (request) => ({ payload: await harness.service.requestStructuredJsonNoRetry(request) }),
    },
  });
}

test("shared auth failure is labeled shared with pending sources, owner actions, and no fallback", async () => {
  const h = buildHarness();
  let calls = 0;
  const analyzer = task6Analyzer(h, async () => { calls += 1; return { ok: false, reason: "provider_auth_required", provider_call_count: 1 }; });
  const sources = [source("src_a", smallText("공유", 1)), source("src_b", smallText("공유", 2))];
  const result = await analyzer.analyze({ sources });
  assert.equal(result.ok, false);
  assert.equal(result.reason, "provider_auth_required");
  assert.equal(result.state, "blocked");
  assert.equal(result.failure_scope, "shared");
  assert.equal(result.fallback_attempted, false);
  assert.deepEqual(result.pending_source_ids, ["src_a", "src_b"]);
  assert.deepEqual(result.recovery_actions.map((item) => item.label), ["AI 설정 열기", "다시 분석", "나중에"]);
  assert.deepEqual(result.recovery_actions.map((item) => item.action), ["open_ai_settings", "retry_analysis", "later"]);
  assert.equal(result.recovery_actions[0].primary, true);
  assert.equal(result.metrics.provider_calls, 1);
  assert.equal(result.metrics.automatic_retries, 0);
  assert.equal(result.metrics.fallback_attempts, 0);
  assert.equal(h.jobStore.getJob(result.job_id).status, "blocked");

  // Resume short-circuits on the blocked job with zero new provider calls.
  const resumed = await task6Analyzer(h, async () => { calls += 1; return { ok: true, provider_call_count: 1, artifacts: [] }; }).analyze({ sources });
  assert.equal(resumed.ok, true);
  assert.equal(resumed.state, "blocked");
  assert.equal(resumed.fallback_attempted, false);
  assert.deepEqual(resumed.pending_source_ids, ["src_a", "src_b"]);
  assert.deepEqual(resumed.recovery_actions.map((item) => item.label), ["AI 설정 열기", "다시 분석", "나중에"]);
  assert.equal(calls, 1);
});

test("item failure leaves unrelated items reviewable with item scope", async () => {
  const h = buildHarness();
  const success = task6SuccessProvider(h);
  let calls = 0;
  const analyzer = task6Analyzer(h, async (request, context) => {
    calls += 1;
    if (calls === 1) return { ok: false, reason: "response_too_large", provider_call_count: 1 };
    return success(request, context);
  });
  const result = await analyzer.analyze({
    sources: [source("src_one", smallText("개별", 1)), source("src_two", smallText("개별", 2))],
    independent_sources: true,
  });
  assert.equal(result.ok, true);
  assert.equal(result.state, "review_ready");
  assert.equal(result.failure_scope, "item");
  assert.equal(result.fallback_attempted, false);
  assert.equal(result.source_results.length, 2);
  assert.equal(result.source_results[0].ok, false);
  assert.equal(result.source_results[0].reason, "response_too_large");
  assert.equal(result.source_results[0].failure_scope, "item");
  assert.equal(result.source_results[1].ok, true);
  assert.equal(result.source_results[1].state, "review_ready");
  assert.equal("failure_scope" in result.source_results[1], false);
  assert.deepEqual(result.pending_source_ids, ["src_one"]);
  assert.deepEqual(result.remaining_source_ids, []);
  assert.equal(calls, 2);
});

test("shared failure in independent mode stops the queue and stays labeled shared", async () => {
  const h = buildHarness();
  let calls = 0;
  const analyzer = task6Analyzer(h, async () => { calls += 1; return { ok: false, reason: "provider_auth_required", provider_call_count: 1 }; });
  const result = await analyzer.analyze({
    sources: [source("src_one", smallText("공유", 1)), source("src_two", smallText("공유", 2))],
    independent_sources: true,
  });
  assert.equal(result.ok, false);
  assert.equal(result.state, "blocked");
  assert.equal(result.reason, "provider_auth_required");
  assert.equal(result.failure_scope, "shared");
  assert.equal(result.fallback_attempted, false);
  assert.equal(result.source_results.length, 1);
  assert.equal(result.source_results[0].failure_scope, "shared");
  assert.deepEqual(result.remaining_source_ids, ["src_two"]);
  assert.deepEqual(result.pending_source_ids, ["src_one", "src_two"]);
  assert.deepEqual(result.recovery_actions.map((item) => item.label), ["AI 설정 열기", "다시 분석", "나중에"]);
  assert.equal(calls, 1);
});

test("describeQueue distinguishes empty, pending, stopped, partial, and ready over canonical states", async () => {
  const storage = memoryStorage();
  const store = storeApi.createBatchJobStore({ storage });
  assert.equal((await store.describeQueue()).queue_state, "empty");
  const keyA = "a".repeat(64), keyB = "b".repeat(64);
  const jobA = await store.createJob({ request_key: keyA, sources: [{ source_id: "src_q1", revision_hash: keyA }] });
  const jobB = await store.createJob({ request_key: keyB, sources: [{ source_id: "src_q2", revision_hash: keyB }] });
  assert.equal((await store.describeQueue()).queue_state, "pending");

  await store.setJobState(jobB.job_id, "blocked", "provider_auth_required");
  const partial = await store.describeQueue();
  assert.equal(partial.queue_state, "some_failed");
  assert.deepEqual(partial.pending_job_ids, [jobA.job_id]);
  assert.deepEqual(partial.failed_job_ids, [jobB.job_id]);
  assert.deepEqual(partial.retryable_job_ids, [jobB.job_id]);
  assert.deepEqual(partial.resumable_job_ids, [jobA.job_id]);
  assert.equal(partial.jobs.find((row) => row.job_id === jobB.job_id).failure_reason, "provider_auth_required");
  assert.equal(partial.jobs.find((row) => row.job_id === jobA.job_id).retryable, false);

  // Restart recovery: a running job reloads as outcome_unknown with zero
  // provider calls and zero writes, and is both retryable and resumable.
  await store.setJobState(jobA.job_id, "running");
  const restarted = storeApi.createBatchJobStore({ storage });
  const unknown = await restarted.describeQueue();
  assert.deepEqual(unknown.unknown_job_ids, [jobA.job_id]);
  assert.deepEqual([...unknown.retryable_job_ids].sort(), [jobA.job_id, jobB.job_id].sort());
  assert.deepEqual(unknown.resumable_job_ids, [jobA.job_id]);
  assert.equal(unknown.queue_state, "all_stopped");

  await restarted.setJobState(jobA.job_id, "review_ready");
  await restarted.setJobState(jobB.job_id, "review_ready");
  const ready = await restarted.describeQueue();
  assert.equal(ready.queue_state, "review_ready");
  assert.deepEqual([...ready.ready_job_ids].sort(), [jobA.job_id, jobB.job_id].sort());
  assert.deepEqual(ready.retryable_job_ids, []);
});

test("concurrent explicit retries share one flight and count exactly once", async () => {
  const h = buildHarness();
  const success = task6SuccessProvider(h);
  let calls = 0;
  const shared = task6Analyzer(h, async (request, context) => { calls += 1; return success(request, context); });
  const sources = [source("src_once", smallText("일회", 1))];
  const [first, second] = await Promise.all([
    shared.analyze({ sources, explicit_retry: true, retry_intent_id: "intent_once_1" }),
    shared.analyze({ sources, explicit_retry: true, retry_intent_id: "intent_once_1" }),
  ]);
  assert.equal(first.ok, true, first.reason);
  assert.equal(first.job_id, second.job_id);
  assert.equal(first.explicit_retry, true);
  assert.equal(first.retry_intent_id, "intent_once_1");
  assert.equal(calls, 1);
});

test("malformed input yields typed states with input scope, never a throw", async () => {
  const h = buildHarness();
  const empty = await h.analyzer.analyze({ sources: [] });
  assert.equal(empty.ok, false);
  assert.equal(empty.reason, "invalid_batch_sources");
  assert.equal(empty.failure_scope, "input");
  assert.equal(empty.fallback_attempted, false);
  const badPath = await h.analyzer.analyze({ sources: [{ source_id: "src_bad", source_path: "PARA/x.md", extracted_text: "본문" }] });
  assert.equal(badPath.ok, false);
  assert.equal(badPath.reason, "invalid_source_path");
  assert.equal(badPath.failure_scope, "input");

  // A malformed persisted record is quarantined into a typed empty queue.
  const broken = memoryStorage();
  broken.files.set("batch-job-state.json", "{malformed");
  const recovered = storeApi.createBatchJobStore({ storage: broken });
  assert.equal((await recovered.describeQueue()).queue_state, "empty");
  assert.equal(broken.files.has("batch-job-state.json.quarantine"), true);
});

test("shared/item classifier covers the queue-wide stop set and nothing else", () => {
  assert.ok(analyzerApi.SHARED_FAILURE_REASONS.includes("provider_auth_required"));
  assert.ok(analyzerApi.SHARED_FAILURE_REASONS.includes("provider_quota_exhausted"));
  assert.ok(analyzerApi.SHARED_FAILURE_REASONS.includes("cancelled"));
  assert.equal(analyzerApi.SHARED_FAILURE_REASONS.includes("semantic_candidate_key_missing"), false);
  assert.equal(analyzerApi.SHARED_FAILURE_REASONS.includes("response_too_large"), false);
});
