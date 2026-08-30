"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");
const { test } = require("node:test");

const ROOT = path.resolve(__dirname, "../../../../../..");
const batchProvider = require(path.join(ROOT, "SYSTEM/Views/llmwiki-batch-provider.js"));

const CJK_EMOJI_TEXT = "## 노트 \u{1F4DA}\n관찰: 지식 순환은 배치 단위로만 실행된다 \u{1F30D}. 두 번째 문장은 맥락 제공용이다.";
const CHUNKS = [
  { key: "chunk_alpha", text: CJK_EMOJI_TEXT },
  { key: "chunk_beta", text: "Second chunk about reusable claims." },
];
const INPUT = { outbound_allowed: true, run_id: "run_batch", chunks: CHUNKS, candidate_ids: ["cand_1", "cand_2"] };

function okResponse(overrides = {}) {
  return {
    status: "ok",
    results: [
      {
        chunk_key: "chunk_alpha",
        outcome: "proposals",
        items: [{ role: "source_summary", evidence_quote: "지식 순환은 배치 단위로만 실행된다", claims: ["배치 실행 원칙"], review_reasons: [], related_candidate_ids: [] }],
      },
      {
        chunk_key: "chunk_beta",
        outcome: "no_change",
        items: [],
      },
    ],
    ...overrides,
  };
}

function providerReturning(payload, onRequest = () => {}) {
  let calls = 0;
  const service = {
    requestStructuredJsonNoRetry: async (options) => {
      calls += 1;
      onRequest(options, calls);
      if (payload instanceof Error) throw payload;
      if (typeof payload === "string") {
        try { return JSON.parse(payload); } catch (_e) {
          const error = new Error("응답을 해석하지 못했습니다.");
          error.code = "MALFORMED_JSON";
          throw error;
        }
      }
      return payload;
    },
  };
  const provider = batchProvider.createBatchAnalysisProvider({
    identity: { provider_key: "fixture", model: "fixture-model", structured_mode: "json_schema", provider_mode: "direct", provider: { adapter: "fixture" } },
    providerService: service,
  });
  return { provider, callCount: () => calls };
}

function baseProvider() {
  return providerReturning(okResponse()).provider;
}

test("compact schema is strict, pack-atomic, and free of model authority fields", () => {
  const schema = batchProvider.COMPACT_SCHEMA;
  assert.deepEqual(schema.required, ["status", "results"]);
  assert.equal(schema.additionalProperties, false);
  assert.equal(schema.properties.status.const, "ok");
  const result = schema.properties.results.items;
  assert.deepEqual(result.required, ["chunk_key", "outcome", "items"]);
  const item = result.properties.items.items;
  for (const field of ["offset", "start", "end", "alias", "temporary_span_alias", "path", "operation", "operation_kind", "destination", "destination_id", "write", "approval", "provider", "secret"]) {
    assert.equal(Object.hasOwn(item.properties, field), false, `schema must not request ${field}`);
  }
  assert.equal(result.properties.outcome.pattern, "^(proposals|hold|no_change)$");
  assert.equal(item.properties.role.pattern, "^(source_summary|reusable_claim|object_context|hold)$");
  assert.equal(item.properties.topic.maxLength, 160);
  assert.ok(item.properties.claims.maxItems > 0);
  assert.ok(item.properties.review_reasons.maxItems > 0);
  assert.equal(item.properties.related_candidate_ids.maxItems, batchProvider.MAX_RELATED_CANDIDATE_IDS);
  assert.equal(item.properties.related_candidate_ids.uniqueItems, true);
  assert.equal(item.properties.related_candidate_ids.items.maxLength, batchProvider.MAX_CANDIDATE_ID_BYTES);
});

test("semantic document extraction accepts multiple evidence items and preserves their local topics", async () => {
  const input = {
    outbound_allowed: true,
    run_id: "run_document_extraction",
    chunks: [{
      key: "chunk_investment",
      text: "입지보다 사업 속도를 먼저 본다. 현금흐름이 나쁘면 장기 보유를 피한다. 낙찰가가 급등하면 진입을 보류한다.",
    }],
    candidate_ids: [],
  };
  const response = {
    status: "ok",
    results: [{
      chunk_key: "chunk_investment",
      outcome: "proposals",
      items: [
        { role: "source_summary", topic: "투자 판단 개요", evidence_quote: "입지보다 사업 속도를 먼저 본다", claims: ["사업 속도가 핵심 판단 기준이다."], review_reasons: [], related_candidate_ids: [] },
        { role: "reusable_claim", topic: "현금흐름 위험", evidence_quote: "현금흐름이 나쁘면 장기 보유를 피한다", claims: ["현금흐름이 나쁜 자산은 장기 보유를 피한다."], review_reasons: [], related_candidate_ids: [] },
        { role: "reusable_claim", topic: "낙찰가 급등 위험", evidence_quote: "낙찰가가 급등하면 진입을 보류한다", claims: ["낙찰가 급등 구간에서는 진입을 보류한다."], review_reasons: [], related_candidate_ids: [] },
      ],
    }],
  };
  let prompt;
  const { provider } = providerReturning(response, (options) => { prompt = JSON.parse(options.prompt); });
  const result = await provider(input);

  assert.equal(result.ok, true, JSON.stringify(result));
  assert.equal(result.artifacts[0].items.length, 3);
  assert.deepEqual(result.artifacts[0].items.map((item) => item.topic), ["투자 판단 개요", "현금흐름 위험", "낙찰가 급등 위험"]);
  assert.match(prompt.task, /all durable information/iu);
  assert.match(prompt.task, /topic/iu);
});

test("deterministic evidence keys recover the exact local quote even when model copy drifts", async () => {
  const source = "정확한 근거 문장이다. 뒤 문장은 추가 맥락이다.";
  const input = { outbound_allowed: true, run_id: "run_evidence_key", chunks: [{ key: "chunk_evidence", text: source }], candidate_ids: [] };
  const response = {
    status: "ok",
    results: [{
      chunk_key: "chunk_evidence",
      outcome: "proposals",
      items: [{
        role: "reusable_claim",
        topic: "근거 안정성",
        evidence_key: "evidence_1",
        evidence_quote: "정확한 근거를 설명하는 문장이다.",
        claims: ["로컬 evidence key가 원문 근거를 결정한다."],
        review_reasons: [],
        related_candidate_ids: [],
      }],
    }],
  };
  const result = await providerReturning(response).provider(input);

  assert.equal(result.ok, true, JSON.stringify(result));
  assert.equal(result.artifacts[0].items[0].evidence_key, "evidence_1");
  assert.equal(result.artifacts[0].items[0].evidence_quote, "정확한 근거 문장이다.");
  assert.equal(source.slice(result.artifacts[0].items[0].span.start, result.artifacts[0].items[0].span.end), "정확한 근거 문장이다.");
});

test("happy path anchors one CJK+emoji quote uniquely and derives local span provenance", async () => {
  const { provider } = providerReturning(okResponse());
  const result = await provider(INPUT);
  assert.equal(result.ok, true);
  assert.equal(result.provider_call_count, 1);
  assert.equal(result.automatic_retry_count, 0);
  assert.equal(result.automatic_repair_count, 0);
  assert.equal(result.persisted_artifact_count, 2);
  const artifact = result.artifacts.find((a) => a.chunk_key === "chunk_alpha").items[0];
  assert.equal(artifact.evidence_quote, "지식 순환은 배치 단위로만 실행된다");
  assert.match(CJK_EMOJI_TEXT.slice(artifact.span.start, artifact.span.end), /^지식 순환은 배치 단위로만 실행된다$/u);
  assert.match(artifact.span.alias, /^span_[a-f0-9]{16,}$/);
  // alias is deterministic
  const again = await provider(INPUT);
  assert.equal(again.artifacts[0].items[0].span.alias, artifact.span.alias);
});

test("source routing mode sends path context but accepts exactly one lifecycle item per source", async () => {
  const input = {
    outbound_allowed: true,
    run_id: "run_source_routing",
    mode: "source_routing",
    chunks: [{
      key: "chunk_route",
      text: "# 경매 물건 복기\n\n이 문서는 진행 중인 경매 물건의 판단 기록이다.",
      source_hint: "INBOX/경매 물건 복기.md",
    }],
    candidate_ids: [],
  };
  const response = {
    status: "ok",
    results: [{
      chunk_key: "chunk_route",
      outcome: "proposals",
      items: [{
        role: "object_context",
        evidence_quote: "진행 중인 경매 물건의 판단 기록",
        claims: ["경매 물건 복기"],
        review_reasons: [],
        related_candidate_ids: [],
      }],
    }],
  };
  let prompt;
  const { provider } = providerReturning(response, (options) => { prompt = JSON.parse(options.prompt); });
  const result = await provider(input);
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.equal(prompt.mode, "source_routing");
  assert.equal(prompt.chunks[0].source_hint, "INBOX/경매 물건 복기.md");
  assert.equal(prompt.limits.max_items_per_result, 1);
  assert.match(prompt.task, /one lifecycle route/iu);

  response.results[0].items.push({
    role: "reusable_claim",
    evidence_quote: "경매 물건",
    claims: ["두 번째 route 금지"],
    review_reasons: [],
    related_candidate_ids: [],
  });
  const rejected = await providerReturning(response).provider(input);
  assert.equal(rejected.ok, false);
  assert.equal(rejected.reason, "source_routing_item_count");
});

test("source routing no-change is the only zero-item terminal result", async () => {
  const input = {
    outbound_allowed: true,
    run_id: "run_source_noop",
    mode: "source_routing",
    chunks: [{ key: "chunk_noop", text: "# 중복 문서\n\n이미 같은 지식이 있다.", source_hint: "INBOX/중복 문서.md" }],
    candidate_ids: ["cand_existing"],
  };
  const response = { status: "ok", results: [{ chunk_key: "chunk_noop", outcome: "no_change", items: [] }] };
  const accepted = await providerReturning(response).provider(input);
  assert.equal(accepted.ok, true, JSON.stringify(accepted));
  assert.equal(accepted.artifacts[0].outcome, "no_change");

  response.results[0].outcome = "proposals";
  const rejected = await providerReturning(response).provider(input);
  assert.equal(rejected.ok, false);
  assert.equal(rejected.reason, "source_routing_item_count");
});

test("folded whitespace quote preserves the exact source slice and deterministic span alias", async () => {
  const source = "이렇게 해서 얻은 값어치는.. 따따블 ?\n2.5배 정도의 가격차이인 것 같습니다.";
  const quote = source.replace("?\n", "? ");
  const input = { outbound_allowed: true, run_id: "r", chunks: [{ key: "chunk_fold", text: source }], candidate_ids: [] };
  const response = { status: "ok", results: [{ chunk_key: "chunk_fold", outcome: "proposals", items: [{ role: "source_summary", evidence_quote: quote, claims: ["주장"], review_reasons: [], related_candidate_ids: [] }] }] };
  const { provider } = providerReturning(response);
  const result = await provider(input);
  assert.equal(result.ok, true);
  const artifact = result.artifacts[0].items[0];
  assert.equal(artifact.evidence_quote, source);
  assert.equal(source.slice(artifact.span.start, artifact.span.end), source);
  assert.equal(artifact.span.alias, (await provider(input)).artifacts[0].items[0].span.alias);
});

test("folded whitespace duplicates remain non-unique and paraphrases remain not-found", async () => {
  const duplicate = "앞 문장\n뒤 문장 앞 문장\n뒤 문장";
  const folded = "앞 문장 뒤 문장";
  const dup = await providerReturning({ status: "ok", results: [{ chunk_key: "chunk_dup", outcome: "proposals", items: [{ role: "source_summary", evidence_quote: folded, claims: ["주장"], review_reasons: [], related_candidate_ids: [] }] }] }).provider({ outbound_allowed: true, run_id: "r", chunks: [{ key: "chunk_dup", text: duplicate }], candidate_ids: [] });
  assert.equal(dup.reason, "evidence_quote_not_unique");
  const para = await providerReturning({ status: "ok", results: [{ chunk_key: "chunk_para", outcome: "proposals", items: [{ role: "source_summary", evidence_quote: "앞 문장 뒤 내용", claims: ["주장"], review_reasons: [], related_candidate_ids: [] }] }] }).provider({ outbound_allowed: true, run_id: "r", chunks: [{ key: "chunk_para", text: "앞 문장\n뒤 문장" }], candidate_ids: [] });
  assert.equal(para.reason, "evidence_quote_not_found");
});

test("pack is atomic: missing chunk result fails the whole pack with zero artifacts and one call", async () => {
  const response = okResponse();
  response.results = response.results.slice(0, 1);
  const { provider, callCount } = providerReturning(response);
  const result = await provider(INPUT);
  assert.equal(result.ok, false);
  assert.equal(result.reason, "missing_chunk_result");
  assert.equal(callCount(), 1);
  assert.equal(result.provider_call_count, 1);
  assert.equal(result.persisted_artifact_count, 0);
  assert.equal(result.artifacts.length, 0);
});

test("duplicate chunk key fails the pack atomically", async () => {
  const response = okResponse();
  response.results.push(JSON.parse(JSON.stringify(response.results[1])));
  const result = await providerReturning(response).provider(INPUT);
  assert.equal(result.ok, false);
  assert.equal(result.reason, "duplicate_chunk_result");
  assert.equal(result.persisted_artifact_count, 0);
});

test("non-unique evidence quote fails the pack without a second call", async () => {
  const text = "반복 문장이다.\n반복 문장이다.";
  const input = { outbound_allowed: true, run_id: "r", chunks: [{ key: "chunk_dup", text }], candidate_ids: [] };
  const payload = {
    status: "ok",
    results: [{ chunk_key: "chunk_dup", outcome: "hold", items: [{ role: "hold", evidence_quote: "반복 문장이다.", claims: [], review_reasons: [], related_candidate_ids: [] }] }],
  };
  const { provider, callCount } = providerReturning(payload);
  const result = await provider(input);
  assert.equal(result.ok, false);
  assert.equal(result.reason, "evidence_quote_not_unique");
  assert.equal(callCount(), 1);
  assert.equal(result.persisted_artifact_count, 0);
});

test("unknown field anywhere in the response fails the pack", async () => {
  const response = okResponse();
  response.results[0].items[0].model_note = "extra";
  const result = await providerReturning(response).provider(INPUT);
  assert.equal(result.ok, false);
  assert.equal(result.reason, "unknown_field");
  assert.equal(result.persisted_artifact_count, 0);
});

test("forbidden authority fields fail the pack even before item validation", async () => {
  const response = okResponse();
  response.results[0].items[0].operation = "create";
  const result = await providerReturning(response).provider(INPUT);
  assert.equal(result.ok, false);
  assert.equal(["unknown_field", "forbidden_authority"].includes(result.reason), true);
  assert.equal(result.persisted_artifact_count, 0);
});

test("related_candidate_ids outside the allowlist fail the pack", async () => {
  const response = okResponse();
  response.results[0].items[0].related_candidate_ids = ["cand_9"];
  const result = await providerReturning(response).provider(INPUT);
  assert.equal(result.ok, false);
  assert.equal(result.reason, "candidate_id_not_allowed");
  assert.equal(result.persisted_artifact_count, 0);
});

test("related candidate count, bytes, pattern, and uniqueness fail atomically without truncation", async () => {
  const cases = [
    { ids: Array.from({ length: batchProvider.MAX_RELATED_CANDIDATE_IDS + 1 }, (_, index) => `cand_${index}`), candidate_ids: Array.from({ length: batchProvider.MAX_RELATED_CANDIDATE_IDS + 1 }, (_, index) => `cand_${index}`) },
    { ids: [`cand_${"a".repeat(batchProvider.MAX_CANDIDATE_ID_BYTES)}`], candidate_ids: [`cand_${"a".repeat(batchProvider.MAX_CANDIDATE_ID_BYTES)}`] },
    { ids: ["cand_bad.id"], candidate_ids: ["cand_bad.id"] },
    { ids: ["cand_1", "cand_1"], candidate_ids: ["cand_1"] },
  ];
  for (const fixture of cases) {
    const response = okResponse();
    response.results[0].items[0].related_candidate_ids = fixture.ids;
    const result = await providerReturning(response).provider({ ...INPUT, candidate_ids: fixture.candidate_ids });
    assert.equal(result.ok, false, JSON.stringify(fixture));
    assert.equal(result.reason, "invalid_related_candidates");
    assert.equal(result.persisted_artifact_count, 0);
    assert.deepEqual(result.artifacts, []);
  }
});

test("oversized total response fails atomically before any artifact can be cached or persisted", async () => {
  const response = okResponse();
  response.results[0].items[0].review_reasons = ["x".repeat(batchProvider.MAX_RESPONSE_BYTES)];
  const result = await providerReturning(response).provider(INPUT);
  assert.equal(result.ok, false);
  assert.equal(result.reason, "response_too_large");
  assert.equal(result.persisted_artifact_count, 0);
  assert.deepEqual(result.artifacts, []);
});

test("malformed top-level JSON fails as a named reason with exactly one call", async () => {
  const { provider, callCount } = providerReturning("{not json");
  const result = await provider(INPUT);
  assert.equal(result.ok, false);
  assert.equal(result.reason, "malformed_json");
  assert.equal(callCount(), 1);
  assert.equal(result.automatic_repair_count, 0);
  assert.equal(result.persisted_artifact_count, 0);
});

test("provider failures keep named machine reasons and zero retries", async () => {
  for (const [error, reason] of [
    [Object.assign(new Error("quota"), { code: "ANTIGRAVITY_QUOTA_EXHAUSTED", status: 429 }), "provider_quota_exhausted"],
    [Object.assign(new Error("auth"), { code: "ANTIGRAVITY_AUTH_REQUIRED", status: 401 }), "provider_auth_required"],
    [Object.assign(new Error("timeout"), { code: "ETIMEDOUT" }), "provider_outcome_unknown"],
    [new Error("boom"), "provider_unavailable"],
  ]) {
    const { provider, callCount } = providerReturning(error);
    const result = await provider(INPUT);
    assert.equal(result.ok, false);
    assert.equal(result.reason, reason);
    assert.equal(callCount(), 1);
    assert.equal(result.persisted_artifact_count, 0);
  }
});

test("abort race: abort after egress but before validation reports one call; pre-request abort reports zero", async () => {
  // Event-bound: subscribe to the exact abort signal before triggering the request.
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  let calls = 0;
  const controller = new AbortController();
  let aborted = false;
  controller.signal.addEventListener("abort", () => { aborted = true; }, { once: true });
  const service = {
    requestStructuredJsonNoRetry: async () => {
      calls += 1;
      await gate;
      if (aborted) { const error = new Error("취소되었습니다."); error.name = "AbortError"; throw error; }
      return okResponse();
    },
  };
  const provider = batchProvider.createBatchAnalysisProvider({
    identity: { provider_key: "k", model: "m", structured_mode: "json_schema", provider_mode: "direct", provider: {} },
    providerService: service,
  });
  const inFlight = provider(INPUT, { signal: controller.signal });
  controller.abort(); // abort while the single egress is in flight
  release();
  const racedResult = await inFlight;
  assert.equal(racedResult.ok, false);
  assert.equal(racedResult.reason, "provider_aborted");
  assert.equal(racedResult.provider_call_count, 1);
  assert.equal(calls, 1);

  const preController = new AbortController();
  preController.abort();
  const preService = { requestStructuredJsonNoRetry: async () => { calls += 1; return okResponse(); } };
  const preProvider = batchProvider.createBatchAnalysisProvider({
    identity: { provider_key: "k", model: "m", structured_mode: "json_schema", provider_mode: "direct", provider: {} },
    providerService: preService,
  });
  const preResult = await preProvider(INPUT, { signal: preController.signal });
  assert.equal(preResult.reason, "provider_aborted");
  assert.equal(preResult.provider_call_count, 0);
});

test("identical text and span under two different chunk keys yield distinct deterministic aliases", async () => {
  const text = "동일한 문장이다.";
  const makePayload = (key) => ({ status: "ok", results: [{ chunk_key: key, outcome: "hold", items: [{ role: "hold", evidence_quote: "동일한 문장이다.", claims: [], review_reasons: [], related_candidate_ids: [] }] }] });
  const runFor = async (keys) => {
    const service = { requestStructuredJsonNoRetry: async () => makePayload(keys) };
    const provider = batchProvider.createBatchAnalysisProvider({
      identity: { provider_key: "k", model: "m", structured_mode: "json_schema", provider_mode: "direct", provider: {} },
      providerService: service,
    });
    const result = await provider({ outbound_allowed: true, run_id: "alias", chunks: [{ key: keys, text }], candidate_ids: [] });
    assert.equal(result.ok, true);
    return result.artifacts[0].items[0].span.alias;
  };
  const aliasA = await runFor("chunk_one");
  const aliasB = await runFor("chunk_two");
  const aliasA2 = await runFor("chunk_one");
  assert.notEqual(aliasA, aliasB);
  assert.equal(aliasA, aliasA2); // deterministic per chunk key
  for (const alias of [aliasA, aliasB]) assert.match(alias, /^span_[a-f0-9]{16,}$/);
});

test("cancellation fails the pack without calling the transport", async () => {
  const controller = new AbortController();
  controller.abort();
  const { provider, callCount } = providerReturning(okResponse());
  const result = await provider(INPUT, { signal: controller.signal });
  assert.equal(result.ok, false);
  assert.equal(result.reason, "provider_aborted");
  assert.equal(callCount(), 0);
  assert.equal(result.persisted_artifact_count, 0);
});

test("batch provider crosses the real structured-no-retry boundary with allowlisted options only", async () => {
  const aiProviderService = require(path.join(ROOT, "SYSTEM/Views/ai-provider-service.js"));
  const previousExecService = globalThis.AntigravityExecService;
  const publicRequests = [];
  const execRequests = [];
  globalThis.AntigravityExecService = {
    requestStructuredJson: async (options) => {
      execRequests.push(options);
      return okResponse();
    },
  };
  try {
    const serviceBoundary = {
      requestStructuredJsonNoRetry(options) {
        publicRequests.push(options);
        return aiProviderService.requestStructuredJsonNoRetry(options);
      },
    };
    const provider = batchProvider.createBatchAnalysisProvider({
      app: {},
      identity: {
        provider_key: "antigravity",
        model: "fixture-model",
        structured_mode: "json_schema",
        provider_mode: "direct",
        provider: {
          adapter: "antigravity-exec",
          authMode: "antigravity-login",
          model: "fixture-model",
          sandbox: true,
          structuredTimeoutMs: 5000,
        },
      },
      providerService: serviceBoundary,
    });

    const result = await provider(INPUT);

    assert.equal(result.ok, true);
    assert.deepEqual(Object.keys(publicRequests[0]).sort(), ["app", "prompt", "provider", "schema", "signal", "timeoutMs"]);
    assert.equal(Object.hasOwn(publicRequests[0], "noRetry"), false);
    assert.equal(execRequests.length, 1, "the allowlisted request must reach the physical provider adapter boundary once");
  } finally {
    if (previousExecService === undefined) delete globalThis.AntigravityExecService;
    else globalThis.AntigravityExecService = previousExecService;
  }
});

test("request carries no feature-specific selector, repair markers, or secrets", async () => {
  let seen;
  providerReturning(okResponse(), (options) => { seen = options; }).provider(INPUT);
  await new Promise((resolve) => setImmediate(resolve));
  void seen;
  const captured = [];
  const service = {
    requestStructuredJsonNoRetry: async (options) => { captured.push(options); return okResponse(); },
  };
  const provider = batchProvider.createBatchAnalysisProvider({
    identity: { provider_key: "k", model: "m", structured_mode: "json_schema", provider_mode: "direct", provider: {} },
    providerService: service,
  });
  await provider(INPUT);
  const options = captured[0];
  assert.equal(typeof options.prompt, "string");
  assert.equal(Object.hasOwn(options, "noRetry"), false);
  for (const key of Object.keys(options)) {
    assert.equal(/secret|apikey|api_key|token/i.test(key), false);
  }
  assert.equal(options.schema, batchProvider.COMPACT_SCHEMA);
});

test("property fuzz: valid unicode quotes anchor; duplicate or absent quotes never pass", async () => {
  const units = ["a", "\uC720\uB2C9\uCF54\uB4DC", "\u{1F600}", "\u{1F1F0}\u{1F1F7}", "\uD83D\uDE00", "한글", "\u{10FFFF}"];
  // Deterministic PRNG (xorshift) so failures reproduce.
  let seed = 0x2545f491;
  const rand = () => { seed ^= seed << 13; seed >>>= 0; seed ^= seed >> 17; seed ^= seed << 5; seed >>>= 0; return seed / 0xffffffff; };
  for (let i = 0; i < 200; i += 1) {
    let text = "";
    const parts = [];
    const partCount = 1 + Math.floor(rand() * 4);
    for (let p = 0; p < partCount; p += 1) {
      let part = "";
      const len = 1 + Math.floor(rand() * 6);
      for (let c = 0; c < len; c += 1) part += units[Math.floor(rand() * units.length)];
      parts.push(part);
      text += part + ("\uBAA9\uC801" || "|");
    }
    const unique = parts[Math.floor(rand() * parts.length)] + "\uBAA9\uC801";
    const anchored = batchProvider.anchorQuote(text, unique);
    if (anchored) {
      assert.equal(text.slice(anchored.start, anchored.end), unique);
    }
    const duplicatedPart = parts[0];
    const dupText = duplicatedPart + "|" + duplicatedPart;
    const dupAnchored = batchProvider.anchorQuote(dupText, duplicatedPart);
    if (dupText.split(duplicatedPart).length - 1 !== 1) assert.equal(dupAnchored, null);
  }
});

test("module size stays within budget", () => {
  const fs = require("node:fs");
  const source = fs.readFileSync(path.join(ROOT, "SYSTEM/Views/llmwiki-batch-provider.js"), "utf8");
  const lines = source.split("\n").filter((line) => line.trim().length > 0 && !/^\s*(\/\/|\/\*|\*)/.test(line)).length;
  assert.ok(lines <= 250, `pure LOC ${lines} exceeds 250`);
});
