(function (root) {
  "use strict";

  const hashApi = root.LLMWikiHash || (typeof require === "function" ? require("./llmwiki-hash.js") : null);
  const evidenceAnchor = root.LLMWikiEvidenceAnchor || (typeof require === "function" ? require("./llmwiki-evidence-anchor.js") : null);
  const evidenceCandidatesApi = root.LLMWikiEvidenceCandidates || (typeof require === "function" ? require("./llmwiki-evidence-candidates.js") : null);
  const inputApi = root.LLMWikiBatchProviderInput || (typeof require === "function" ? require("./llmwiki-batch-provider-input.js") : null), consumerRuntimeApi = root.ProdigyAIConsumerRuntime || (typeof require === "function" ? require("./prodigy-ai-consumer-runtime.js") : null);
  if (!inputApi || !evidenceCandidatesApi) throw new Error("LLMWiki batch provider dependencies are required.");

  const MAX_CHUNKS_PER_PACK = 4, MAX_ITEMS_PER_RESULT = 8, MAX_SEMANTIC_ITEMS_PER_RESULT = 64, MAX_CLAIMS = 8, MAX_REVIEW_REASONS = 4;
  const MAX_TOPIC_BYTES = 480, MAX_QUOTE_BYTES = 2048, MAX_CLAIM_BYTES = 1200, MAX_REASON_BYTES = 240;
  const MAX_RELATED_CANDIDATE_IDS = 8, MAX_CANDIDATE_ID_BYTES = 69;
  const MAX_RESPONSE_BYTES = 512 * 1024, CANDIDATE_ID_PATTERN = "^cand_[a-zA-Z0-9_-]{1,64}$", CANDIDATE_ID = new RegExp(CANDIDATE_ID_PATTERN, "u");
  const SEMANTIC_MODE = "semantic", SOURCE_ROUTING_MODE = "source_routing";
  const KEY_PATTERN = "^[a-z][a-z0-9_-]{2,127}$";
  const KEY = new RegExp(KEY_PATTERN, "u");
  const OUTCOMES = ["proposals", "hold", "no_change"];
  const ROLES = ["source_summary", "reusable_claim", "object_context", "hold"];
  const FORBIDDEN_FIELDS = new Set([
    "offset", "offsets", "start", "end", "alias", "temporary_span_alias", "span", "path", "paths",
    "operation", "operation_kind", "operation_id", "serialized_operation", "destination",
    "destination_id", "destination_ids", "write", "writes", "approval", "approved", "provider",
    "provider_key", "model", "secret", "api_key", "canonical_proposal", "canonical_bytes",
  ]);

  function plain(value) { return Boolean(value) && typeof value === "object" && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype; }
  function utf8Bytes(value) { return new TextEncoder().encode(value).byteLength; }
  function boundedString(value, maxBytes) {
    return typeof value === "string" && value.trim().length > 0 && utf8Bytes(value) <= maxBytes ? value : null;
  }

  // One provider-neutral semantic schema shared by every certified runtime adapter.
  const COMPACT_SCHEMA = Object.freeze({
    type: "object",
    additionalProperties: false,
    required: ["status", "results"],
    properties: {
      status: { const: "ok" },
      results: {
        type: "array",
        minItems: 1,
        maxItems: MAX_CHUNKS_PER_PACK,
        items: {
          type: "object",
          additionalProperties: false,
          required: ["chunk_key", "outcome", "items"],
          properties: {
            chunk_key: { type: "string", pattern: KEY_PATTERN },
            outcome: { type: "string", pattern: "^(proposals|hold|no_change)$" },
            items: {
              type: "array",
              maxItems: MAX_SEMANTIC_ITEMS_PER_RESULT,
              items: {
                type: "object",
                additionalProperties: false,
                required: ["role", "evidence_quote", "claims", "review_reasons", "related_candidate_ids"],
                properties: {
                  role: { type: "string", pattern: "^(source_summary|reusable_claim|object_context|hold)$" },
                  topic: { type: "string", minLength: 1, maxLength: 160 },
                  evidence_key: { type: "string", pattern: "^evidence_[1-9][0-9]{0,2}$" },
                  evidence_quote: { type: "string", minLength: 1 },
                  claims: { type: "array", maxItems: MAX_CLAIMS, items: { type: "string", minLength: 1 } },
                  review_reasons: { type: "array", maxItems: MAX_REVIEW_REASONS, items: { type: "string", minLength: 1 } },
                  related_candidate_ids: { type: "array", maxItems: MAX_RELATED_CANDIDATE_IDS, uniqueItems: true, items: { type: "string", maxLength: MAX_CANDIDATE_ID_BYTES, pattern: CANDIDATE_ID_PATTERN } },
                },
              },
            },
          },
        },
      },
    },
  });

  const anchorQuote = evidenceAnchor.anchorQuote, projectedAnchor = evidenceAnchor.projectedAnchor;
  // Chunk-key-bound strong alias: SHA-256 over chunk_key + exact span + quote + source text.
  function spanAlias(chunkKey, chunkText, anchor, quote) {
    if (!hashApi || typeof hashApi.sha256 !== "function") throw new Error("llmwiki_hash_unavailable");
    return `span_${hashApi.sha256(JSON.stringify([chunkKey, chunkText, anchor.start, anchor.end, quote]))}`;
  }

  function failure(reason, extras = {}) {
    return Object.freeze({ ok: false, reason, provider_call_count: 0, persisted_artifact_count: 0, automatic_retry_count: 0, automatic_repair_count: 0, artifacts: Object.freeze([]), ...extras });
  }

  function findForbidden(value, pathKey) {
    if (Array.isArray(value)) {
      for (let i = 0; i < value.length; i += 1) {
        const hit = findForbidden(value[i], pathKey);
        if (hit) return hit;
      }
      return null;
    }
    if (!plain(value)) return null;
    for (const key of Object.keys(value)) {
      if (FORBIDDEN_FIELDS.has(key)) return `${pathKey}${key}`;
      const hit = findForbidden(value[key], `${pathKey}${key}.`);
      if (hit) return hit;
    }
    return null;
  }

  function validateItem(rawItem, chunk, evidenceCandidates, candidateIds, errors) {
    if (!plain(rawItem)) { errors.reason = "invalid_item"; return null; }
    for (const key of Object.keys(rawItem)) {
      if (FORBIDDEN_FIELDS.has(key)) { errors.reason = "forbidden_authority"; return null; }
      if (!["role", "topic", "evidence_key", "evidence_quote", "claims", "review_reasons", "related_candidate_ids"].includes(key)) { errors.reason = "unknown_field"; return null; }
    }
    if (!ROLES.includes(rawItem.role)) { errors.reason = "invalid_item"; return null; }
    const topic = rawItem.topic === undefined ? "" : boundedString(rawItem.topic, MAX_TOPIC_BYTES);
    if (rawItem.topic !== undefined && topic === null) { errors.reason = "invalid_topic"; return null; }
    const quote = boundedString(rawItem.evidence_quote, MAX_QUOTE_BYTES);
    if (quote === null) { errors.reason = "invalid_evidence_quote"; return null; }
    const keyed = typeof rawItem.evidence_key === "string" ? evidenceCandidates.find((candidate) => candidate.key === rawItem.evidence_key) : null;
    if (rawItem.evidence_key !== undefined && !keyed) { errors.reason = "invalid_evidence_key"; return null; }
    let anchor = keyed ? { start: keyed.start, end: keyed.end } : anchorQuote(chunk.text, quote);
    let storedQuote = keyed ? keyed.text : quote;
    if (anchor === null) { if (chunk.text.indexOf(quote) !== -1) { errors.reason = "evidence_quote_not_unique"; return null; }
      const projected = projectedAnchor(chunk.text, quote); if (!projected.anchor) { errors.reason = projected.count ? "evidence_quote_not_unique" : "evidence_quote_not_found"; return null; }
      anchor = projected.anchor; storedQuote = chunk.text.slice(anchor.start, anchor.end); }
    if (!Array.isArray(rawItem.claims) || rawItem.claims.length > MAX_CLAIMS) { errors.reason = "invalid_claims"; return null; }
    const claims = [];
    for (const claim of rawItem.claims) { const value = boundedString(claim, MAX_CLAIM_BYTES); if (value === null) { errors.reason = "invalid_claims"; return null; } claims.push(Object.freeze({ text: value })); }
    if (!Array.isArray(rawItem.review_reasons) || rawItem.review_reasons.length > MAX_REVIEW_REASONS) { errors.reason = "invalid_review_reasons"; return null; }
    const reasons = [];
    for (const reason of rawItem.review_reasons) { const value = boundedString(reason, MAX_REASON_BYTES); if (value === null) { errors.reason = "invalid_review_reasons"; return null; } reasons.push(value); }
    if (!Array.isArray(rawItem.related_candidate_ids) || rawItem.related_candidate_ids.length > MAX_RELATED_CANDIDATE_IDS) { errors.reason = "invalid_related_candidates"; return null; }
    const related = [], relatedSeen = new Set();
    for (const id of rawItem.related_candidate_ids) { if (typeof id !== "string" || utf8Bytes(id) > MAX_CANDIDATE_ID_BYTES || !CANDIDATE_ID.test(id) || relatedSeen.has(id)) { errors.reason = "invalid_related_candidates"; return null; } if (!candidateIds.has(id)) { errors.reason = "candidate_id_not_allowed"; return null; } relatedSeen.add(id); related.push(id); }
    return Object.freeze({
      role: rawItem.role,
      ...(topic ? { topic } : {}),
      ...(keyed ? { evidence_key: keyed.key } : {}),
      evidence_quote: storedQuote,
      claims: Object.freeze(claims),
      review_reasons: Object.freeze(reasons),
      related_candidate_ids: Object.freeze(related),
      span: Object.freeze({ start: anchor.start, end: anchor.end, alias: spanAlias(chunk.key, chunk.text, anchor, storedQuote) }),
    });
  }

  function validateResponse(response, chunksByKey, semanticCandidatesByKey, candidateIds, mode) {
    const errors = { reason: "invalid_response" };
    if (!plain(response)) { return { reason: "malformed_json" }; }
    let responseBytes; try { responseBytes = utf8Bytes(JSON.stringify(response)); } catch (_) { return { reason: "malformed_json" }; } if (responseBytes > MAX_RESPONSE_BYTES) return { reason: "response_too_large", detail: responseBytes };
    const forbidden = findForbidden(response, "");
    if (forbidden) { return { reason: "forbidden_authority", detail: forbidden }; }
    for (const key of Object.keys(response)) {
      if (!["status", "results"].includes(key)) { return { reason: "unknown_field", detail: key }; }
    }
    if (response.status !== "ok") { return { reason: "status_not_ok" }; }
    if (!Array.isArray(response.results)) { return { reason: "missing_chunk_result" }; }
    const seen = new Set();
    const artifacts = [];
    for (const result of response.results) {
      if (!plain(result)) { return { reason: "invalid_result" }; }
      for (const key of Object.keys(result)) {
        if (!["chunk_key", "outcome", "items"].includes(key)) { return { reason: "unknown_field", detail: key }; }
      }
      const chunkKey = typeof result.chunk_key === "string" ? result.chunk_key : "";
      const chunk = chunksByKey.get(chunkKey);
      if (!KEY.test(chunkKey) || !chunk) { return { reason: "unknown_chunk_key", detail: chunkKey }; }
      if (seen.has(chunkKey)) { return { reason: "duplicate_chunk_result", detail: chunkKey }; }
      seen.add(chunkKey);
      if (!OUTCOMES.includes(result.outcome)) { return { reason: "invalid_outcome", detail: result.outcome }; }
      if (!Array.isArray(result.items) || result.items.length > (mode === SEMANTIC_MODE ? MAX_SEMANTIC_ITEMS_PER_RESULT : MAX_ITEMS_PER_RESULT)) return { reason: "invalid_items" };
      if (mode === SOURCE_ROUTING_MODE) {
        const expectedItems = result.outcome === "no_change" ? 0 : 1;
        if (result.items.length !== expectedItems) return { reason: "source_routing_item_count", detail: chunkKey };
        if (result.outcome === "hold" && result.items[0]?.role !== "hold") return { reason: "source_routing_hold_role", detail: chunkKey };
      }
      const evidenceCandidates = mode === SEMANTIC_MODE ? semanticCandidatesByKey.get(chunkKey) : evidenceCandidatesApi.create(chunk.text, { max_bytes: MAX_QUOTE_BYTES });
      const seenEvidenceKeys = new Set(), items = [];
      for (const rawItem of result.items) {
        if (mode === SEMANTIC_MODE) {
          const evidenceKey = rawItem?.evidence_key;
          if (typeof evidenceKey !== "string") return { reason: "semantic_candidate_key_missing" };
          if (!evidenceCandidates.some((candidate) => candidate.key === evidenceKey)) return { reason: "semantic_candidate_key_unknown", detail: evidenceKey };
          if (seenEvidenceKeys.has(evidenceKey)) return { reason: "semantic_candidate_key_duplicate", detail: evidenceKey }; seenEvidenceKeys.add(evidenceKey);
        }
        const item = validateItem(rawItem, chunk, evidenceCandidates, candidateIds, errors);
        if (!item) { return { reason: errors.reason }; }
        if (mode === SEMANTIC_MODE && result.outcome === "proposals" && item.claims.length === 0) return { reason: "proposal_without_supported_claim" };
        items.push(item);
      }
      if (mode === SEMANTIC_MODE && seenEvidenceKeys.size !== evidenceCandidates.length) return { reason: "semantic_candidate_key_missing", detail: chunkKey };
      artifacts.push(Object.freeze({ chunk_key: chunkKey, outcome: result.outcome, items: Object.freeze(items) }));
    }
    for (const key of chunksByKey.keys()) {
      if (!seen.has(key)) { return { reason: "missing_chunk_result", detail: key }; }
    }
    return { ok: true, artifacts };
  }

  function createBatchAnalysisProvider(options = {}) {
    const runtime = options.consumerRuntime || consumerRuntimeApi; if (!runtime || typeof runtime.requestStructured !== "function") return async () => failure("transport_unavailable");
    return async function batchAnalysisProvider(input, context = {}) {
      if (context.signal && context.signal.aborted) return failure("provider_aborted");
      const normalized = inputApi.normalizeInput(input);
      if (normalized.reason) return failure(normalized.reason);
      const routing = normalized.mode === SOURCE_ROUTING_MODE;
      const semanticCandidatesByKey = routing ? new Map() : new Map([...normalized.chunksByKey.values()].map((chunk) => [chunk.key, evidenceCandidatesApi.createSemantic(chunk.text, { max_bytes: MAX_QUOTE_BYTES })]));
      // Crowded-chunk fan-out: one manifest chunk may carry more semantic
      // candidates than a single provider result allows. Split it into
      // contiguous candidate groups (same cap) and fan out to one provider
      // call per group-pack, then merge artifacts back under the parent chunk
      // key with parent-relative spans. Uncrowded input (including routing and
      // question flows) takes the exact historical single-call path below.
      const crowdedParents = (!routing && !normalized.questionContext)
        ? [...normalized.chunksByKey.values()].filter((chunk) => (semanticCandidatesByKey.get(chunk.key) || []).length > MAX_SEMANTIC_ITEMS_PER_RESULT)
        : [];
      if (crowdedParents.length === 0) {
        if (!routing && [...semanticCandidatesByKey.values()].some((candidates) => candidates.length > MAX_SEMANTIC_ITEMS_PER_RESULT)) return failure("semantic_unit_limit_exceeded");
        const single = await runSingleCall([...normalized.chunksByKey.values()].map((chunk) => ({ key: chunk.key, text: chunk.text, ...(chunk.source_hint !== undefined ? { source_hint: chunk.source_hint } : {}) })), [...normalized.chunksByKey.keys()]);
        if (!single.ok) return failure(single.reason, { provider_call_count: single.calls, detail: single.detail });
        return Object.freeze({
          ok: true,
          provider_call_count: single.calls,
          persisted_artifact_count: single.artifacts.length,
          automatic_retry_count: 0,
          automatic_repair_count: 0,
          artifacts: Object.freeze(single.artifacts),
        });
      }
      const expanded = [];
      const usedKeys = new Set(normalized.chunksByKey.keys());
      for (const chunk of normalized.chunksByKey.values()) {
        const cands = semanticCandidatesByKey.get(chunk.key) || [];
        if (cands.length <= MAX_SEMANTIC_ITEMS_PER_RESULT) {
          expanded.push({ key: chunk.key, text: chunk.text, parentKey: null, offset: 0, candidates: cands });
          continue;
        }
        // Carried (never reparsed) candidates, grouped contiguously;
        // collision-free keys within the 128-char KEY contract.
        for (let i = 0; i < cands.length; i += MAX_SEMANTIC_ITEMS_PER_RESULT) {
          const group = cands.slice(i, i + MAX_SEMANTIC_ITEMS_PER_RESULT);
          const offset = group[0].start;
          let suffix = `__p${i / MAX_SEMANTIC_ITEMS_PER_RESULT}`;
          let guard = 0, key = chunk.key;
          while (guard < 1000) {
            const room = 128 - suffix.length;
            key = `${(chunk.key.length <= room ? chunk.key : chunk.key.slice(0, room))}${suffix}`;
            if (!usedKeys.has(key)) break;
            suffix = `${suffix}_${guard}`;
            guard += 1;
          }
          usedKeys.add(key);
          expanded.push({ key, text: chunk.text.slice(offset, group[group.length - 1].end), parentKey: chunk.key, offset,
            candidates: group.map((c) => ({ key: c.key, text: c.text, start: c.start - offset, end: c.end - offset })) });
        }
      }
      let providerCalls = 0;
      const mergedByParent = new Map();
      for (let i = 0; i < expanded.length; i += MAX_CHUNKS_PER_PACK) {
        if (context.signal && context.signal.aborted) return failure("provider_aborted", { provider_call_count: providerCalls });
        const pack = expanded.slice(i, i + MAX_CHUNKS_PER_PACK);
        const carried = new Map(pack.map((entry) => [entry.key, entry.candidates]));
        const single = await runSingleCall(pack.map((entry) => ({ key: entry.key, text: entry.text })), pack.map((entry) => entry.key), carried);
        providerCalls += single.calls;
        if (!single.ok) return failure(single.reason, { provider_call_count: providerCalls, detail: single.detail });
        for (const artifact of single.artifacts) {
          const entry = pack.find((item) => item.key === artifact.chunk_key);
          if (!entry || entry.parentKey === null) {
            mergedByParent.set(artifact.chunk_key, { passthrough: artifact });
            continue;
          }
          const bucket = mergedByParent.get(entry.parentKey) || { parts: [] };
          bucket.parts.push({ offset: entry.offset, artifact });
          mergedByParent.set(entry.parentKey, bucket);
        }
      }
      if (context.signal && context.signal.aborted) return failure("provider_aborted", { provider_call_count: providerCalls });
      const merged = [];
      for (const chunk of normalized.chunksByKey.values()) {
        const record = mergedByParent.get(chunk.key);
        if (record && record.passthrough) { merged.push(record.passthrough); continue; }
        const parts = (record && record.parts ? record.parts : []).slice().sort((a, b) => a.offset - b.offset);
        const outcomes = parts.map((part) => part.artifact.outcome);
        // Merge rule: unanimous wins; any hold contaminates to hold;
        // proposals + no_change (no hold) merges to proposals (coverage needs it).
        const outcome = outcomes.every((value) => value === outcomes[0]) ? outcomes[0]
          : outcomes.includes("hold") ? "hold"
          : "proposals";
        const items = [];
        for (const part of parts) {
          for (const item of part.artifact.items) {
            const anchor = { start: part.offset + item.span.start, end: part.offset + item.span.end };
            // Parent evidence_key preserved (no renumbering): keys stay stable
            // regardless of model return order; spans carry the truth.
            items.push(Object.freeze({
              ...item,
              span: Object.freeze({
                start: anchor.start,
                end: anchor.end,
                alias: spanAlias(chunk.key, chunk.text, anchor, item.evidence_quote),
              }),
            }));
          }
        }
        merged.push(Object.freeze({ chunk_key: chunk.key, outcome, items: Object.freeze(items) }));
      }
      return Object.freeze({
        ok: true,
        provider_call_count: providerCalls,
        persisted_artifact_count: merged.length,
        automatic_retry_count: 0,
        automatic_repair_count: 0,
        artifacts: Object.freeze(merged),
      });
      async function runSingleCall(entries, opKeys, candsOverride) {
        const chunksByKey = new Map(entries.map((entry) => [entry.key, Object.freeze({ key: entry.key, text: entry.text, ...(entry.source_hint !== undefined ? { source_hint: entry.source_hint } : {}) })]));
        const candsByKey = routing ? new Map() : (candsOverride || new Map([...chunksByKey.values()].map((chunk) => [chunk.key, evidenceCandidatesApi.createSemantic(chunk.text, { max_bytes: MAX_QUOTE_BYTES })])));
        const prompt = JSON.stringify({
          mode: normalized.mode,
        ...inputApi.questionPrompt(normalized),
        task: normalized.questionContext ? "Answer the question following question_task. Return the existing keyed evidence schema, with all relevant conditions and explicit review reasons for conflicts." : routing
          ? "Choose exactly one lifecycle route for each whole source: source_summary for raw reference material, reusable_claim only for one atomic reusable claim, object_context for mutable Object/PARA state, hold when ambiguous, or no_change only for an exact duplicate. Return one lifecycle route, not extracted subclaims. Evidence must be one exact unique quote from source text."
          : "Extract all durable information from every keyed source chunk. Return exactly one item for every supplied evidence candidate key; use each key exactly once. Each item must have one concise human-readable topic and claims supported by that candidate. Copy its evidence key into evidence_key and its text verbatim into evidence_quote. Use source_summary for source-bound context and reusable_claim for reusable knowledge. Do not collapse a rich chunk into one representative claim.",
        run_id: typeof input.run_id === "string" ? input.run_id : "",
        chunks: [...chunksByKey.values()].map((chunk) => ({
          key: chunk.key,
          text: chunk.text,
          ...(!routing ? { evidence_candidates: candsByKey.get(chunk.key).map((candidate) => ({ key: candidate.key, text: candidate.text })) } : {}),
          ...(routing ? { source_hint: chunk.source_hint } : {}),
        })),
        allowed_candidate_ids: [...normalized.candidateIds],
        limits: { max_items_per_result: routing ? 1 : MAX_SEMANTIC_ITEMS_PER_RESULT, max_claims: MAX_CLAIMS, offsets_or_paths_or_operations: "never" },
      });
      let response;
      try {
        const runtimeResponse = await runtime.requestStructured({
          app: options.app,
          client: options.client,
          consumerId: "wiki.batch_analysis",
          prompt,
          schema: COMPACT_SCHEMA,
          signal: context.signal,
          confirmConsent: context.confirmConsent,
          ownerSessionId: context.ownerSessionId || `wiki-batch-${input.run_id || "run"}`,
          operationId: context.operationId || `wiki-batch-${hashApi.sha256(`${input.run_id || "run"}:${normalized.mode}:${opKeys.join(":")}`)}`,
          attemptId: context.attemptId || "attempt-1"
        });
        response = runtimeResponse.payload;
      } catch (error) {
        if (context.signal && context.signal.aborted) return { ok: false, reason: "provider_aborted", calls: 1 };
        return { ok: false, reason: inputApi.mapTransportError(error), calls: 1 };
      }
      if (context.signal && context.signal.aborted) return { ok: false, reason: "provider_aborted", calls: 1 };
      const validated = validateResponse(response, chunksByKey, candsByKey, normalized.candidateIds, normalized.mode);
      if (!validated.ok) return { ok: false, reason: validated.reason, detail: validated.detail, calls: 1 };
      return { ok: true, artifacts: validated.artifacts, calls: 1 };
      }
    };
  }

  const api = Object.freeze({
    spanAlias,
    COMPACT_SCHEMA, MAX_CHUNKS_PER_PACK, MAX_ITEMS_PER_RESULT, MAX_SEMANTIC_ITEMS_PER_RESULT, MAX_CLAIMS, MAX_REVIEW_REASONS,
    MAX_RELATED_CANDIDATE_IDS, MAX_CANDIDATE_ID_BYTES, MAX_RESPONSE_BYTES,
    SEMANTIC_MODE, SOURCE_ROUTING_MODE, anchorQuote,
    createBatchAnalysisProvider, createCompactBatchProvider: createBatchAnalysisProvider,
  });
  root.LLMWikiBatchProvider = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
