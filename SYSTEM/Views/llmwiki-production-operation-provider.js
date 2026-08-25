(function (root) {
  "use strict";

  const MAX_CHANGED_CHUNKS = 4;
  const MAX_CHANGED_SOURCE_BYTES = 24 * 1024;
  const MAX_UNITS_PER_CHUNK = 8;
  const MAX_CLAIMS_PER_UNIT = 8;
  const MAX_RELATION_HINTS = 5;
  const MAX_PROVIDER_RESPONSE_BYTES = 96 * 1024;
  const KEY = /^[a-z][a-z0-9_-]{2,127}$/u;
  const SPAN_ALIAS = /^span_[a-z0-9_-]{1,64}$/u;
  const FORBIDDEN_PROVIDER_FIELDS = new Set([
    "destination", "destination_id", "destination_ids", "path", "operation", "operation_id",
    "serialized_operation", "canonical_proposal", "canonical_bytes", "after_bytes", "before_bytes",
    "markdown", "unit_id", "claim_id", "canonical_id",
  ]);
  const TYPED_SCHEMA = Object.freeze({
    $schema: "https://json-schema.org/draft/2020-12/schema",
    $id: "prodigy://llmwiki/chunk-analysis-response-v1",
    type: "object",
    additionalProperties: false,
    required: ["status", "chunk_results"],
    properties: {
      status: { const: "ok" },
      chunk_results: {
        type: "array", maxItems: MAX_CHANGED_CHUNKS,
        items: {
          type: "object", additionalProperties: false, required: ["key", "semantic_units"],
          properties: {
            key: { type: "string", pattern: "^[a-z][a-z0-9_-]{2,127}$" },
            semantic_units: { type: "array", maxItems: MAX_UNITS_PER_CHUNK },
          },
        },
      },
    },
  });

  function plain(value) { return Boolean(value) && typeof value === "object" && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype; }
  function trim(value) { return typeof value === "string" ? value.trim() : ""; }
  function utf8Bytes(value) { return new TextEncoder().encode(value).byteLength; }
  function failure(reason, extras = {}) {
    return Object.freeze({ ok: false, status: "provider_unavailable", reason, provider_call_count: 0, accepted_chunk_count: 0, canonical_write_count: 0, source_writes: 0, automatic_retry_count: 0, resubmission_count: 0, ...extras });
  }
  function success(chunkResults, extras = {}) {
    return Object.freeze({ ok: true, status: extras.status || "analyzed", chunk_results: Object.freeze(chunkResults), accepted_chunk_count: chunkResults.length, canonical_write_count: 0, source_writes: 0, automatic_retry_count: 0, ...extras });
  }
  function hasForbiddenAuthority(value) {
    if (Array.isArray(value)) return value.some(hasForbiddenAuthority);
    if (!plain(value)) return false;
    return Object.entries(value).some(([key, item]) => FORBIDDEN_PROVIDER_FIELDS.has(key) || hasForbiddenAuthority(item));
  }
  function normalizeChangedChunks(input) {
    const chunks = input && input.changed_chunks;
    if (!Array.isArray(chunks) || chunks.length === 0 || chunks.length > MAX_CHANGED_CHUNKS) return { ok: false, reason: "changed_chunk_batch_invalid" };
    const keys = new Set();
    const normalized = [];
    let sourceBytes = 0;
    for (const chunk of chunks) {
      if (!plain(chunk) || Object.keys(chunk).some(key => !["key", "text"].includes(key))) return { ok: false, reason: "changed_chunk_invalid" };
      const key = trim(chunk.key);
      if (!KEY.test(key) || keys.has(key) || typeof chunk.text !== "string" || !chunk.text) return { ok: false, reason: "changed_chunk_invalid" };
      keys.add(key);
      sourceBytes += utf8Bytes(chunk.text);
      normalized.push(Object.freeze({ key, text: chunk.text }));
    }
    if (sourceBytes > MAX_CHANGED_SOURCE_BYTES) return { ok: false, reason: "changed_chunk_batch_too_large" };
    return { ok: true, value: Object.freeze(normalized) };
  }
  function normalizeRelationHints(input) {
    const supplied = input && (input.local_canonical_summaries === undefined ? input.canonical_relation_hints : input.local_canonical_summaries);
    if (supplied === undefined) return { ok: true, value: Object.freeze([]) };
    if (!Array.isArray(supplied) || supplied.length > MAX_RELATION_HINTS) return { ok: false, reason: "canonical_relation_hints_invalid" };
    const summaries = [];
    for (const hint of supplied) {
      const summary = typeof hint === "string" ? trim(hint) : plain(hint) ? trim(hint.summary) : "";
      if (!summary || utf8Bytes(summary) > 1000) return { ok: false, reason: "canonical_relation_hints_invalid" };
      summaries.push(summary);
    }
    return { ok: true, value: Object.freeze(summaries) };
  }
  function validateUnit(unit, sourceText) {
    const allowed = new Set(["temporary_span_alias", "start", "end", "origin_hint", "disposition", "uncertainty", "claims", "relation_hint_indexes"]);
    if (!plain(unit) || Object.keys(unit).some(key => !allowed.has(key)) || !SPAN_ALIAS.test(trim(unit.temporary_span_alias))
      || !Number.isSafeInteger(unit.start) || !Number.isSafeInteger(unit.end) || unit.start < 0 || unit.end <= unit.start || unit.end > sourceText.length
      || !["source_extract", "ai_interpretation"].includes(trim(unit.origin_hint)) || !["propose", "hold", "no_change"].includes(trim(unit.disposition))
      || !plain(unit.uncertainty) || Object.keys(unit.uncertainty).some(key => !["level", "reasons"].includes(key))
      || !["low", "medium", "high"].includes(trim(unit.uncertainty.level)) || !Array.isArray(unit.uncertainty.reasons) || unit.uncertainty.reasons.length > 4
      || unit.uncertainty.reasons.some(reason => typeof reason !== "string" || !trim(reason) || utf8Bytes(reason) > 240)
      || !Array.isArray(unit.claims) || unit.claims.length > MAX_CLAIMS_PER_UNIT
      || (unit.relation_hint_indexes !== undefined && (!Array.isArray(unit.relation_hint_indexes) || unit.relation_hint_indexes.length > MAX_RELATION_HINTS || unit.relation_hint_indexes.some(index => !Number.isSafeInteger(index) || index < 0 || index >= MAX_RELATION_HINTS)))) return null;
    const alias = trim(unit.temporary_span_alias);
    const claims = [];
    for (const claim of unit.claims) {
      if (!plain(claim) || Object.keys(claim).some(key => !["text", "temporary_span_alias"].includes(key)) || typeof claim.text !== "string" || !trim(claim.text) || utf8Bytes(claim.text) > 1200 || trim(claim.temporary_span_alias) !== alias) return null;
      claims.push(Object.freeze({ text: trim(claim.text), temporary_span_alias: alias }));
    }
    return Object.freeze({ temporary_span_alias: alias, start: unit.start, end: unit.end, origin_hint: trim(unit.origin_hint), disposition: trim(unit.disposition), uncertainty: Object.freeze({ level: trim(unit.uncertainty.level), reasons: Object.freeze(unit.uncertainty.reasons.map(trim)) }), claims: Object.freeze(claims), relation_hint_indexes: Object.freeze(unit.relation_hint_indexes ? [...new Set(unit.relation_hint_indexes)] : []) });
  }
  function validateResponse(response, requested) {
    let serialized;
    try { serialized = JSON.stringify(response); } catch (_error) { return { ok: false }; }
    if (typeof serialized !== "string" || utf8Bytes(serialized) > MAX_PROVIDER_RESPONSE_BYTES || !plain(response) || hasForbiddenAuthority(response)
      || Object.keys(response).some(key => !["status", "chunk_results"].includes(key)) || response.status !== "ok" || !Array.isArray(response.chunk_results)) return { ok: false };
    const chunksByKey = new Map(requested.map(chunk => [chunk.key, chunk]));
    const received = new Set();
    const accepted = [];
    for (const result of response.chunk_results) {
      if (!plain(result) || Object.keys(result).some(key => !["key", "semantic_units"].includes(key)) || !KEY.test(trim(result.key)) || received.has(result.key) || !chunksByKey.has(result.key) || !Array.isArray(result.semantic_units) || result.semantic_units.length > MAX_UNITS_PER_CHUNK) return { ok: false };
      received.add(result.key);
      const aliases = new Set();
      const units = [];
      for (const rawUnit of result.semantic_units) {
        const unit = validateUnit(rawUnit, chunksByKey.get(result.key).text);
        if (!unit || aliases.has(unit.temporary_span_alias)) return { ok: false };
        aliases.add(unit.temporary_span_alias);
        units.push(unit);
      }
      accepted.push(Object.freeze({ key: result.key, semantic_units: Object.freeze(units) }));
    }
    return { ok: true, accepted: Object.freeze(accepted), missing: Object.freeze(requested.filter(chunk => !received.has(chunk.key))) };
  }
  function promptFor(input, chunks, hints, repair) {
    return JSON.stringify({
      task: "Analyze only changed keyed source chunks and return semantic data without writes, destination selection, or research.",
      run_id: trim(input.run_id),
      changed_chunks: chunks.map(chunk => ({ key: chunk.key, text: chunk.text })),
      local_canonical_summaries: hints,
      external_research: 0,
      limits: { max_units_per_chunk: MAX_UNITS_PER_CHUNK, max_claims_per_unit: MAX_CLAIMS_PER_UNIT, temporary_span_aliases_only: true },
      ...(repair ? { repair: { attempt: 1, missing_keys: chunks.map(chunk => chunk.key) } } : {}),
    });
  }
  function providerFailure(error, providerMode, calls) {
    if (error && error.name === "AbortError") return failure("provider_aborted", { provider_mode: providerMode, provider_call_count: calls });
    if (Number(error && error.status || 0) === 429) return failure("provider_quota_exhausted", { provider_mode: providerMode, provider_call_count: calls });
    if ([401, 403].includes(Number(error && error.status || 0))) return failure("provider_auth_required", { provider_mode: providerMode, provider_call_count: calls });
    if (error && error.code === "ANTIGRAVITY_AUTH_REQUIRED") return failure("provider_auth_required", { provider_mode: providerMode, provider_call_count: calls });
    if (error && error.code === "ANTIGRAVITY_SANDBOX_BLOCKED") return failure("provider_tool_blocked", { provider_mode: providerMode, provider_call_count: calls });
    if (error && error.code === "ANTIGRAVITY_QUOTA_EXHAUSTED") return failure("provider_quota_exhausted", { provider_mode: providerMode, provider_call_count: calls });
    if (error && ["ETIMEDOUT", "OUTCOME_UNKNOWN"].includes(error.code)) return failure("provider_outcome_unknown", { provider_mode: providerMode, provider_call_count: calls });
    return failure("provider_unavailable", { provider_mode: providerMode, provider_call_count: calls });
  }
  function createChunkAnalysisProvider(options = {}) {
    const configApi = options.configApi || root.ProdigyConfigService;
    const service = options.providerService || root.AIProviderService;
    const config = options.config;
    return async function chunkAnalysisProvider(input = {}, context = {}) {
      if (input.outbound_allowed !== true) return failure("outbound_consent_required");
      if (context.signal && context.signal.aborted) return failure("provider_aborted");
      if (input.external_research !== undefined && input.external_research !== 0) return failure("external_research_forbidden");
      const chunks = normalizeChangedChunks(input);
      if (!chunks.ok) return failure(chunks.reason);
      const hints = normalizeRelationHints(input);
      if (!hints.ok) return failure(hints.reason);
      if (!configApi || typeof configApi.resolveAIProfileProviderKey !== "function") return failure("configuration_unavailable");
      if (!service || (typeof service.requestStructuredJsonNoRetry !== "function" && typeof service.requestStructuredJsonOnce !== "function")) return failure("transport_unavailable");
      const mode = typeof options.getProviderMode === "function" ? options.getProviderMode() : "direct";
      const selected = configApi.resolveAIProfileProviderKey(typeof options.getConfig === "function" ? options.getConfig() : config, "llmwiki", mode);
      if (!selected || selected.ok !== true) return failure(selected && selected.code || "provider_unavailable", { provider_mode: mode });
      let calls = 0;
      async function request(batch, repair) {
        calls += 1;
        try {
          const requestStructuredJson = typeof service.requestStructuredJsonNoRetry === "function"
            ? service.requestStructuredJsonNoRetry.bind(service)
            : service.requestStructuredJsonOnce.bind(service);
          const requestOptions = { app: options.app, provider: selected.provider, prompt: promptFor(input, batch, hints.value, repair), schema: TYPED_SCHEMA, signal: context.signal, timeoutMs: Number(selected.provider && selected.provider.structuredTimeoutMs) || 60000 };
          if (typeof options.structuredTimeoutScheduler === "function" && typeof service.requestStructuredJsonNoRetry === "function") requestOptions.timeoutScheduler = options.structuredTimeoutScheduler;
          const response = await requestStructuredJson(requestOptions);
          return context.signal && context.signal.aborted ? { aborted: true } : validateResponse(response, batch);
        } catch (error) { return { failure: providerFailure(error, selected.provider_mode, calls) }; }
      }
      const first = await request(chunks.value, false);
      if (first.aborted) return failure("provider_aborted", { provider_mode: selected.provider_mode, provider_call_count: calls });
      if (first.failure) return first.failure;
      const accepted = first.ok ? [...first.accepted] : [];
      const missing = first.ok ? first.missing : chunks.value;
      if (missing.length === 0) return success(accepted, { provider_mode: selected.provider_mode, provider_call_count: calls, resubmission_count: 0 });
      const repaired = await request(missing, true);
      if (repaired.aborted) return failure("provider_aborted", { provider_mode: selected.provider_mode, provider_call_count: calls, resubmission_count: 1 });
      if (repaired.failure) return accepted.length ? success(accepted, { status: "partial", provider_mode: selected.provider_mode, provider_call_count: calls, resubmission_count: 1, missing_keys: missing.map(chunk => chunk.key), recovery_reason: repaired.failure.reason }) : failure(repaired.failure.reason, { provider_mode: selected.provider_mode, provider_call_count: calls, resubmission_count: 1 });
      if (!repaired.ok || repaired.missing.length > 0) return accepted.length ? success(accepted, { status: "partial", provider_mode: selected.provider_mode, provider_call_count: calls, resubmission_count: 1, missing_keys: missing.map(chunk => chunk.key), recovery_reason: "invalid_chunk_response" }) : failure("invalid_chunk_response", { provider_mode: selected.provider_mode, provider_call_count: calls, resubmission_count: 1 });
      return success([...accepted, ...repaired.accepted], { provider_mode: selected.provider_mode, provider_call_count: calls, resubmission_count: 1 });
    };
  }
  const api = Object.freeze({ TYPED_SCHEMA, MAX_CHANGED_CHUNKS, MAX_CHANGED_SOURCE_BYTES, MAX_UNITS_PER_CHUNK, MAX_CLAIMS_PER_UNIT, MAX_RELATION_HINTS, MAX_PROVIDER_RESPONSE_BYTES, createChunkAnalysisProvider, createProductionOperationProvider: createChunkAnalysisProvider });
  root.LLMWikiProductionOperationProvider = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
