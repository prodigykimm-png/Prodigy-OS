(function (root) {
  "use strict";

  const hashApi = root.LLMWikiHash || (typeof require === "function" ? require("./llmwiki-hash.js") : null);
  const scopeApi = root.LLMWikiAnalysisScope || (typeof require === "function" ? require("./llmwiki-analysis-scope.js") : null);
  const manifestApi = root.LLMWikiChunkManifest || (typeof require === "function" ? require("./llmwiki-chunk-manifest.js") : null);
  const cacheApi = root.LLMWikiAnalysisCache || (typeof require === "function" ? require("./llmwiki-analysis-cache.js") : null);
  const coverageApi = root.LLMWikiChunkCoverageStore || (typeof require === "function" ? require("./llmwiki-chunk-coverage-store.js") : null);
  const storeApi = root.LLMWikiBatchJobStore || (typeof require === "function" ? require("./llmwiki-batch-job-store.js") : null);

  const ARTIFACT_VERSION = "llmwiki_batch_artifact_v1";
  const MAX_WHOLE_SOURCE_UNITS = 512;
  const SOURCE_ID = /^[a-z][a-z0-9_-]{2,127}$/u;
  const MAX_PACK_CHUNKS = 4;
  const MAX_PACK_BYTES = 24 * 1024;
  const MAX_RANKED_CANDIDATES = 8;
  const MAX_OUTBOUND_CANDIDATES = 5;
  const MAX_CANDIDATE_CONTEXT_BYTES = 4 * 1024;
  const MAX_ANALYSIS_TEXT_BYTES = 4 * 1024;
  const SEMANTIC_MODE = "semantic";
  const SOURCE_ROUTING_MODE = "source_routing";
  // Canonical fixed-prompt accounting: everything the provider prompt carries
  // that is independent of chunk text and run identity.
  const FIXED_PROMPT_ENVELOPE = Object.freeze({
    task: "Analyze the keyed source chunks and return only compact semantic results anchored by exact unique quotes.",
    limits: { max_items_per_result: 8, max_claims: 8, offsets_or_paths_or_operations: "never" },
  });
  const NO_CALL_STATES = Object.freeze(["blocked", "outcome_unknown", "resolved"]);

  function plain(value) { return Boolean(value) && typeof value === "object" && !Array.isArray(value); }
  function freeze(value) {
    if (Array.isArray(value)) return Object.freeze(value.map(freeze));
    if (!plain(value)) return value;
    return Object.freeze(Object.fromEntries(Object.entries(value).map(([key, child]) => [key, freeze(child)])));
  }
  function stable(value) {
    if (value === null || typeof value !== "object") return JSON.stringify(value);
    if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stable(value[key])}`).join(",")}}`;
  }
  function bytes(value) { return new TextEncoder().encode(value).length; }
  function sha(value) { return hashApi.sha256(value); }
  function zeroWrites() { return freeze({ canonical_writes: 0, source_writes: 0, audit_writes: 0, git_writes: 0 }); }

  function baseMetrics() {
    return {
      provider_calls: 0,
      pack_count: 0,
      source_bytes: 0,
      candidate_context_bytes: 0,
      fixed_prompt_bytes: 0,
      cache_hits: 0,
      cache_misses: 0,
      ...JSON.parse(JSON.stringify(zeroWrites())),
      fallback_attempts: 0,
      automatic_retries: 0,
      automatic_repairs: 0,
    };
  }

  function fail(reason, extras = {}) {
    return freeze({ ok: false, reason, metrics: baseMetrics(), preserved_pack_receipts: [], unresolved_pending: [], ...extras });
  }

  function validAnalysisText(extractedText, analysisText) {
    if (typeof analysisText !== "string" || analysisText.length === 0 || !extractedText.startsWith(analysisText)
      || bytes(analysisText) > MAX_ANALYSIS_TEXT_BYTES) return false;
    const end = analysisText.length;
    return !(end < extractedText.length && analysisText.charCodeAt(end - 1) >= 0xd800 && analysisText.charCodeAt(end - 1) <= 0xdbff
      && extractedText.charCodeAt(end) >= 0xdc00 && extractedText.charCodeAt(end) <= 0xdfff);
  }

  function analysisTextFor(source) { return source.analysis_text === undefined ? source.extracted_text : source.analysis_text; }
  function analysisModeFor(sources) {
    const routingCount = sources.filter((source) => source.analysis_text !== undefined).length;
    if (routingCount !== 0 && routingCount !== sources.length) throw new TypeError("mixed_analysis_mode");
    return routingCount === sources.length ? SOURCE_ROUTING_MODE : SEMANTIC_MODE;
  }

  function validateSources(sources) {
    if (!Array.isArray(sources) || sources.length === 0) throw new TypeError("invalid_batch_sources");
    const seen = new Set();
    for (const item of sources) {
      if (!plain(item) || !SOURCE_ID.test(item.source_id) || seen.has(item.source_id)) throw new TypeError("invalid_batch_sources");
      if (typeof item.source_path !== "string" || !["INBOX/", "ZETA/FLEETING/", "ZETA/LITERATURE/"].some((prefix) => item.source_path.startsWith(prefix))) throw new TypeError("invalid_source_path");
      if (typeof item.extracted_text !== "string" || item.extracted_text.length === 0) throw new TypeError("invalid_source_text");
      if (item.content_hash !== undefined && item.content_hash !== sha(item.extracted_text)) throw new TypeError("source_hash_mismatch");
      if (item.analysis_text !== undefined && !validAnalysisText(item.extracted_text, item.analysis_text)) throw new TypeError("invalid_analysis_text");
      seen.add(item.source_id);
    }
    return [...sources].sort((left, right) => left.source_id.localeCompare(right.source_id, "en"));
  }

  // Local ranking authority: at most 8 ranked rows; outbound projection keeps
  // only the top 5 serialized rows within a hard 4 KiB budget.
  function projectCandidates(candidates) {
    if (candidates !== undefined && !Array.isArray(candidates)) throw new TypeError("invalid_candidates");
    const rows = Array.isArray(candidates) ? candidates : [];
    if (rows.length > 5000) throw new TypeError("candidate_overflow");
    const ranked = [];
    const seen = new Set();
    for (const row of rows) {
      if (!plain(row) || typeof row.document_id !== "string" || row.document_id.length === 0 || seen.has(row.document_id)) continue;
      seen.add(row.document_id);
      ranked.push(freeze({ rank: ranked.length + 1, document_id: row.document_id, canonical_revision: typeof row.canonical_revision === "string" ? row.canonical_revision : "" }));
      if (ranked.length >= MAX_RANKED_CANDIDATES) break;
    }
    const outbound = [];
    let total = 0;
    for (const row of ranked.slice(0, MAX_OUTBOUND_CANDIDATES)) {
      const line = JSON.stringify({ document_id: row.document_id, canonical_revision: row.canonical_revision, candidate_id: candidateId(row.document_id) });
      if (total + bytes(line) > MAX_CANDIDATE_CONTEXT_BYTES) break;
      total += bytes(line);
      outbound.push(row);
    }
    return freeze({ ranked, outbound, outbound_bytes: total });
  }

  function candidateId(documentId) { return `cand_${sha(`candidate:${documentId}`).slice(0, 16)}`; }

  // Todo 4 replay lineage: the caller may supply the durable whole-source unit
  // plan (semantic keys plus source spans, as derived by createSemantic) that a
  // source must cover before review_ready may be claimed. Strict validation:
  // unknown sources, empty lists, and out-of-bounds spans are caller bugs.
  function validateWholeSourceUnits(raw, sortedSources) {
    if (raw === undefined) return [];
    if (!Array.isArray(raw)) throw new TypeError("invalid_whole_source_units");
    const byId = new Map(sortedSources.map((source) => [source.source_id, source]));
    const rows = [];
    const seenSource = new Set();
    for (const row of raw) {
      if (!plain(row) || typeof row.source_id !== "string" || !byId.has(row.source_id) || seenSource.has(row.source_id)) throw new TypeError("invalid_whole_source_units");
      seenSource.add(row.source_id);
      if (!Array.isArray(row.units) || row.units.length === 0 || row.units.length > MAX_WHOLE_SOURCE_UNITS) throw new TypeError("invalid_whole_source_units");
      const sourceLength = analysisTextFor(byId.get(row.source_id)).length;
      const units = row.units.map((unit) => {
        if (!plain(unit) || typeof unit.key !== "string" || unit.key.length === 0 || unit.key.length > 128
          || !Number.isSafeInteger(unit.start) || !Number.isSafeInteger(unit.end) || unit.start < 0 || unit.end <= unit.start || unit.end > sourceLength) throw new TypeError("invalid_whole_source_units");
        return freeze({ key: unit.key, start: unit.start, end: unit.end });
      });
      rows.push(freeze({ source_id: row.source_id, units }));
    }
    return rows;
  }

  // Durable whole-source unit coverage uses the exact-global-span rule of the
  // source coverage audit: a planned unit is covered only when some artifact
  // item's span, rebased to source global coordinates, exactly equals the
  // unit's span. Returns Map(source_id -> frozen missing unit key list).
  function auditUnitCoverage(artifactsBySource, wholeSourceUnits) {
    const missingBySource = new Map();
    for (const row of wholeSourceUnits) {
      const byInstance = artifactsBySource.get(row.source_id) || new Map();
      const missing = [];
      for (const unit of row.units) {
        let covered = false;
        for (const { chunk, artifact } of byInstance.values()) {
          if (covered || !Array.isArray(artifact.items)) continue;
          for (const item of artifact.items) {
            if (!item || !item.span || !Number.isSafeInteger(item.span.start) || !Number.isSafeInteger(item.span.end) || item.span.end <= item.span.start) continue;
            if (chunk.start + item.span.start === unit.start && chunk.start + item.span.end === unit.end) { covered = true; break; }
          }
        }
        if (!covered) missing.push(unit.key);
      }
      if (missing.length) missingBySource.set(row.source_id, Object.freeze(missing));
    }
    return missingBySource;
  }

  function createBatchAnalyzer(options = {}) {
    const jobStore = options.jobStore;
    if (!jobStore) throw new TypeError("job_store_required");
    if (!options.provider || typeof options.provider !== "function") throw new TypeError("provider_required");
    const identity = options.identity;
    if (!identity || ["provider_key", "model", "structured_mode", "schema_id", "prompt_version"].some((field) => typeof identity[field] !== "string" || !identity[field])) throw new TypeError("invalid_identity");
    const cache = options.cache || cacheApi.createAnalysisCache({ vault: options.vault, statePath: options.cachePath });
    const coverage = options.coverage || coverageApi.createChunkCoverageStore({ vault: options.vault, statePath: options.coveragePath });
    const retryFlights = new Map();

    async function analyze(input = {}) {
      if (input.explicit_retry === true && typeof input.retry_intent_id === "string" && input.retry_intent_id) {
        const existing = retryFlights.get(input.retry_intent_id);
        if (existing) return existing;
        const flight = analyzeInternal(input).finally(() => retryFlights.delete(input.retry_intent_id));
        retryFlights.set(input.retry_intent_id, flight);
        return flight;
      }
      return analyzeInternal(input);
    }

    async function analyzeInternal(input = {}) {
      const metrics = baseMetrics();
      let projection;
      try {
        const sortedSources = validateSources(input.sources);
        const mode = analysisModeFor(sortedSources);
        const wholeSourceUnits = validateWholeSourceUnits(input.whole_source_units, sortedSources);
        projection = projectCandidates(input.candidates);
        metrics.source_bytes = sortedSources.reduce((total, item) => total + bytes(analysisTextFor(item)), 0);
        metrics.candidate_context_bytes = projection.outbound_bytes;
        metrics.fixed_prompt_bytes = bytes(JSON.stringify(FIXED_PROMPT_ENVELOPE));

        const effectivePromptVersion = mode === SOURCE_ROUTING_MODE
          ? `${identity.prompt_version}:source_routing_v1`
          : identity.prompt_version;
        // Todo 4 replay lineage: the whole-source unit plan participates in the
        // request identity so cached artifacts carry coverage lineage. A run
        // whose plan (or absence of one) differs from the stored content's plan
        // misses once and goes through the normal single-call path instead of
        // replaying stale-but-v2-keyed artifacts.
        const coverageContext = wholeSourceUnits.length > 0 ? stable(wholeSourceUnits) : "";
        const candidateContextHash = sha(`${stable(projection.outbound)}${coverageContext ? `|units:${coverageContext}` : ""}`);
        const requestKey = storeApi.requestKey({
          provider_key: identity.provider_key,
          model: identity.model,
          structured_mode: identity.structured_mode,
          schema_id: identity.schema_id,
          prompt_version: effectivePromptVersion,
          candidate_context_hash: candidateContextHash,
        });
        const sourceRevisions = sortedSources.map((item) => ({ source_id: item.source_id, revision_hash: sha(item.extracted_text) }));
        const frozenIdentity = { ...identity, prompt_version: effectivePromptVersion, candidate_context_hash: candidateContextHash };
        let job;
        if (input.explicit_retry === true) {
          if (typeof input.retry_intent_id !== "string" || !input.retry_intent_id) throw new Error("retry_intent_required");
          const parent = await jobStore.findRetryParent(sourceRevisions);
          if (!parent) throw new Error("retry_not_available");
          job = await jobStore.claimExplicitRetry({ retry_parent_job_id: parent.job_id, retry_intent_id: input.retry_intent_id, request_key: requestKey, sources: sourceRevisions, frozen_identity: frozenIdentity });
          if (job.status !== "pending") return freeze({ ok: true, state: job.status, job_id: job.job_id, batch_id: job.batch_id, request_key: requestKey, metrics, preserved_pack_receipts: [], unresolved_pending: [], outbound_candidates: projection.outbound, ranked_candidate_count: projection.ranked.length, manifest_digests: [], coverage_reports: [], automatic_retries: 0, automatic_repairs: 0, fallback_attempts: 0 });
        } else {
          job = await jobStore.createJob({ request_key: requestKey, sources: sourceRevisions, frozen_identity: frozenIdentity });
          if (NO_CALL_STATES.includes(job.status)) {
            return freeze({
              ok: true, state: job.status, job_id: job.job_id,
              batch_id: job.batch_id, request_key: requestKey, metrics,
              preserved_pack_receipts: [], unresolved_pending: [job.job_id],
              outbound_candidates: projection.outbound, ranked_candidate_count: projection.ranked.length,
              manifest_digests: [], coverage_reports: [],
              automatic_retries: 0, automatic_repairs: 0, fallback_attempts: 0,
            });
          }
        }
        return await runPacks({ input, sortedSources, job, requestKey, projection, metrics, mode, wholeSourceUnits });
      } catch (error) {
        return fail(error?.message || "batch_analyze_failed", { metrics });
      }
    }

    async function runPacks({ input, sortedSources, job, requestKey, projection, metrics, mode, wholeSourceUnits = [] }) {
      const contexts = [];
      const manifestDigests = [];
      const misses = [];
      const artifactsBySource = new Map();
      try {
        for (const sourceRow of sortedSources) {
          const analysisText = analysisTextFor(sourceRow);
          const scope = scopeApi.createAnalysisScope({
            source_id: sourceRow.source_id,
            source_path: sourceRow.source_path,
            content_hash: sha(analysisText),
            source_text: analysisText,
          });
          const manifest = manifestApi.createChunkManifest(scope);
          manifestDigests.push(manifest.manifest_id);
          const lookup = await cache.lookup(manifest, scope, { request_key: requestKey });
          if (!lookup.ok) throw new Error(lookup.reason || "cache_lookup_failed");
          metrics.cache_hits += lookup.hits.length;
          metrics.cache_misses += lookup.misses.length;
          for (const miss of lookup.misses) misses.push({ manifest, scope, chunk: miss, source_path: sourceRow.source_path });
          // Task 11 cutover: cached chunks still need durable coverage receipts
          // under the current manifest, or partial-change resumes can never
          // reach exact coverage again.
          for (const hit of lookup.hits) {
            await coverage.recordReceipt({ manifest, scope, chunk: hit.chunk, artifact: hit.artifact });
            let byInstance = artifactsBySource.get(sourceRow.source_id);
            if (!byInstance) { byInstance = new Map(); artifactsBySource.set(sourceRow.source_id, byInstance); }
            byInstance.set(hit.chunk.instance_id, { chunk: hit.chunk, artifact: hit.artifact });
          }
          contexts.push({ manifest, scope });
        }

        const buildPacks = (entries) => {
          const built = [];
          let pack = [];
          let packBytes = 0;
          for (const miss of entries) {
            const size = bytes(miss.chunk.text);
            if (pack.length && (pack.length === MAX_PACK_CHUNKS || packBytes + size > MAX_PACK_BYTES)) { built.push(pack); pack = []; packBytes = 0; }
            pack.push(miss);
            packBytes += size;
          }
          if (pack.length) built.push(pack);
          return built;
        };
        let packs = buildPacks(misses);
        // Todo 4 replay lineage: an all-hits run is a pure replay of cached
        // artifacts. It must not claim review_ready from instance receipts
        // alone: durable whole-source unit coverage is required, and uncovered
        // units are surfaced as ordinary misses through the single normal
        // miss-driven call below (a cache miss is not a retry; no retry/repair/
        // fallback loop, no second pass).
        let replayOnly = packs.length === 0;
        if (replayOnly && mode === SEMANTIC_MODE && wholeSourceUnits.length > 0) {
          const missingBySource = auditUnitCoverage(artifactsBySource, wholeSourceUnits);
          if (missingBySource.size > 0) {
            for (const row of wholeSourceUnits) {
              if (!missingBySource.has(row.source_id)) continue;
              const context = contexts.find((item) => item.manifest.source_id === row.source_id);
              if (!context) throw new Error("whole_source_context_missing");
              for (const chunk of context.manifest.chunks) {
                misses.push({ manifest: context.manifest, scope: context.scope, chunk, source_path: context.manifest.source_path, unit_miss: true });
              }
            }
          }
        }
        packs = buildPacks(misses);
        replayOnly = packs.length === 0;
        metrics.pack_count = packs.length;
        if (packs.length > 0) await jobStore.setJobState(job.job_id, "running");

        const preserved = [];
        const candidateIds = projection.outbound.map((row) => candidateId(row.document_id));
        for (let index = 0; index < packs.length; index += 1) {
          const current = packs[index];
          const packId = storeApi.packId(job.job_id, current.map((miss) => miss.chunk.text_hash));
          if (await jobStore.lookupPackReceipt(packId, packHashFor(job.job_id, packId, []), requestKey)) {
            continue; // Durable receipt already present; never re-request this pack.
          }
          let response;
          try {
            response = await options.provider(freeze({
              outbound_allowed: true,
              run_id: job.job_id,
              mode,
              chunks: current.map((miss) => freeze({
                key: miss.chunk.instance_id,
                text: miss.chunk.text,
                ...(mode === SOURCE_ROUTING_MODE ? { source_hint: miss.source_path } : {}),
              })),
              candidate_ids: candidateIds,
            }), { signal: input.signal });
          } catch (_error) {
            response = { ok: false, reason: "provider_unavailable" };
          }
          metrics.provider_calls += Number.isSafeInteger(response.provider_call_count) ? response.provider_call_count : 1;
          // Task 11 bounded cancel: a late provider settlement after abort must
          // never append durable cache/coverage artifacts or open review state.
          if (input.signal && input.signal.aborted) {
            // An explicit local cancel has a known terminal receipt: keep the
            // work pending. Only an unreceipted process interruption becomes
            // outcome_unknown, and neither path auto-submits.
            await jobStore.setJobState(job.job_id, "pending");
            return freeze({
              ok: false,
              reason: "cancelled",
              job_id: job.job_id,
              batch_id: job.batch_id,
              request_key: requestKey,
              metrics,
              preserved_pack_receipts: preserved,
              failed_pack_index: index,
              unresolved_pending: packs.slice(index).flatMap((entry) => entry.map((miss) => miss.chunk.instance_id)),
              outbound_candidates: projection.outbound,
              ranked_candidate_count: projection.ranked.length,
              manifest_digests: manifestDigests,
              coverage_reports: [],
              automatic_retries: 0, automatic_repairs: 0, fallback_attempts: 0,
            });
          }
          if (!response.ok) {
            const interrupted = ["provider_outcome_unknown", "outcome_unknown"].includes(response.reason);
            await jobStore.setJobState(job.job_id, interrupted ? "outcome_unknown" : "blocked");
            return freeze({
              ok: false,
              reason: response.reason || "provider_unavailable",
              job_id: job.job_id,
              batch_id: job.batch_id,
              request_key: requestKey,
              metrics,
              preserved_pack_receipts: preserved,
              failed_pack_index: index,
              unresolved_pending: packs.slice(index).flatMap((entry) => entry.map((miss) => miss.chunk.instance_id)),
              outbound_candidates: projection.outbound,
              ranked_candidate_count: projection.ranked.length,
              manifest_digests: manifestDigests,
              coverage_reports: [],
              automatic_retries: 0, automatic_repairs: 0, fallback_attempts: 0,
            });
          }
          const artifactHashes = [];
          const artifactsByKey = new Map(response.artifacts.map((artifact) => [artifact.chunk_key, artifact]));
          for (const miss of current) {
            const result = artifactsByKey.get(miss.chunk.instance_id);
            if (!result) throw new Error("missing_chunk_artifact");
            const artifact = freeze({
              artifact_version: ARTIFACT_VERSION,
              source_id: miss.scope.source_id,
              manifest_id: miss.manifest.manifest_id,
              semantic_id: miss.chunk.semantic_id,
              instance_id: miss.chunk.instance_id,
              text_hash: miss.chunk.text_hash,
              outcome: result.outcome,
              items: result.items,
            });
            artifactHashes.push(sha(stable(artifact)));
            await cache.put({ chunk: miss.chunk, artifact, request_key: requestKey, ...(miss.unit_miss ? { retry_generation: 1 } : {}) });
            await coverage.recordReceipt({ manifest: miss.manifest, scope: miss.scope, chunk: miss.chunk, artifact });
            let byInstance = artifactsBySource.get(miss.scope.source_id);
            if (!byInstance) { byInstance = new Map(); artifactsBySource.set(miss.scope.source_id, byInstance); }
            byInstance.set(miss.chunk.instance_id, { chunk: miss.chunk, artifact });
          }
          const receipt = await jobStore.recordPackReceipt({
            job_id: job.job_id,
            pack_id: packId,
            pack_hash: packHashFor(job.job_id, packId, artifactHashes),
            artifact_hash: sha(stable(artifactHashes)),
          });
          preserved.push(receipt.pack_id);
        }

        const coverageReports = [];
        for (const context of contexts) {
          const status = await coverage.status(context.manifest, context.scope);
          if (!status.ok || !status.complete || !status.exactCoverage) throw new Error(status.reason || "incomplete_coverage");
          coverageReports.push(status);
        }
        // Todo 4 replay lineage final gate: whole-source unit coverage must be
        // durable before review_ready may be claimed. Missing units are
        // surfaced with the shared named-key contract (semantic_candidate_key_
        // missing + missing_semantic_keys[]); no further call is made here.
        if (mode === SEMANTIC_MODE && wholeSourceUnits.length > 0) {
          const missingBySource = auditUnitCoverage(artifactsBySource, wholeSourceUnits);
          if (missingBySource.size > 0) {
            const missingSemanticKeys = [];
            for (const row of wholeSourceUnits) {
              const keys = missingBySource.get(row.source_id);
              if (keys) missingSemanticKeys.push(...keys);
            }
            await jobStore.setJobState(job.job_id, "blocked");
            return freeze({
              ok: false,
              reason: "semantic_candidate_key_missing",
              state: "blocked",
              job_id: job.job_id,
              batch_id: job.batch_id,
              request_key: requestKey,
              replay_only: replayOnly,
              missing_semantic_keys: missingSemanticKeys,
              metrics,
              preserved_pack_receipts: preserved,
              unresolved_pending: [],
              outbound_candidates: projection.outbound,
              ranked_candidate_count: projection.ranked.length,
              manifest_digests: manifestDigests,
              coverage_reports: coverageReports,
              automatic_retries: 0, automatic_repairs: 0, fallback_attempts: 0,
            });
          }
        }
        await jobStore.setJobState(job.job_id, "review_ready");
        const retryParentJobId = job.retry_parent_job_id || job.parent_job_id;
        if (retryParentJobId) await jobStore.setJobState(retryParentJobId, "review_ready");
        return freeze({
          ok: true,
          state: "review_ready",
          job_id: job.job_id,
          batch_id: job.batch_id,
          request_key: requestKey,
          replay_only: replayOnly,
          metrics,
          preserved_pack_receipts: preserved,
          unresolved_pending: [],
          outbound_candidates: projection.outbound,
          ranked_candidate_count: projection.ranked.length,
          manifest_digests: manifestDigests,
          coverage_reports: coverageReports,
          automatic_retries: 0, automatic_repairs: 0, fallback_attempts: 0,
        });
      } catch (error) {
        try { await jobStore.setJobState(job.job_id, "blocked"); } catch (_ignored) { /* keep first failure reason */ }
        return fail(error?.message || "analysis_state_write_failed", {
          metrics,
          job_id: job.job_id,
          batch_id: job.batch_id,
          request_key: requestKey,
          manifest_digests: manifestDigests,
        });
      }
    }

    function packHashFor(batchId, packId, artifactHashes) {
      return sha(stable({ batch_id: batchId, pack_id: packId, artifact_hashes: [...artifactHashes].sort() }));
    }

    return freeze({ analyze });
  }

  const api = Object.freeze({
    ARTIFACT_VERSION,
    MAX_PACK_CHUNKS,
    MAX_PACK_BYTES,
    MAX_RANKED_CANDIDATES,
    MAX_OUTBOUND_CANDIDATES,
    MAX_CANDIDATE_CONTEXT_BYTES,
    SEMANTIC_MODE,
    SOURCE_ROUTING_MODE,
    MAX_ANALYSIS_TEXT_BYTES,
    FIXED_PROMPT_ENVELOPE,
    NO_CALL_STATES,
    candidateId,
    projectCandidates,
    createBatchAnalyzer,
  });
  root.LLMWikiBatchAnalyzer = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
