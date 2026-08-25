(function (root) {
  "use strict";

  const hashApi = root.LLMWikiHash || (typeof require === "function" ? require("./llmwiki-hash.js") : null);
  const scopeApi = root.LLMWikiAnalysisScope || (typeof require === "function" ? require("./llmwiki-analysis-scope.js") : null);
  const manifestApi = root.LLMWikiChunkManifest || (typeof require === "function" ? require("./llmwiki-chunk-manifest.js") : null);
  const cacheApi = root.LLMWikiAnalysisCache || (typeof require === "function" ? require("./llmwiki-analysis-cache.js") : null);
  const coverageApi = root.LLMWikiChunkCoverageStore || (typeof require === "function" ? require("./llmwiki-chunk-coverage-store.js") : null);

  const DEFAULT_PROPOSAL_PATH = "SYSTEM/PRIVATE/llmwiki-inbox-proposals.json";
  const MAX_BATCH_CHUNKS = 4;
  const MAX_BATCH_BYTES = 24 * 1024;

  function plain(value) { return Boolean(value) && typeof value === "object" && !Array.isArray(value); }
  function freeze(value) { if (Array.isArray(value)) return Object.freeze(value.map(freeze)); if (!plain(value)) return value; return Object.freeze(Object.fromEntries(Object.entries(value).map(([key, item]) => [key, freeze(item)]))); }
  function stable(value) { if (value === null || typeof value !== "object") return JSON.stringify(value); if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`; return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stable(value[key])}`).join(",")}}`; }
  function bytes(value) { return new TextEncoder().encode(value).byteLength; }
  function active(authority, request, signal) { return !(signal && signal.aborted) && (!authority || !request || authority.isActive(request)); }
  function fail(reason, extras = {}) { return freeze({ ok: false, reason, ...extras }); }
  function sourceId(scope, chunk, alias) { return `unit_${hashApi.sha256(stable({ scope_id: scope.scope_id, instance_id: chunk.instance_id, alias })).slice(0, 24)}`; }

  function createProposalStore(options = {}) {
    const vault = options.vault;
    const statePath = typeof options.statePath === "string" && options.statePath ? options.statePath : DEFAULT_PROPOSAL_PATH;
    if (!vault || ["getAbstractFileByPath", "create", "modify"].some(method => typeof vault[method] !== "function")) throw new TypeError("vault_required");
    let state = null;
    let corrupted = false;
    let queue = Promise.resolve();
    function empty() { return { proposal_version: 1, manifests: {} }; }
    function valid(value) { return plain(value) && value.proposal_version === 1 && plain(value.manifests); }
    async function load() {
      if (state || corrupted) return state;
      const file = vault.getAbstractFileByPath(statePath);
      if (!file) { state = empty(); return state; }
      try { state = JSON.parse(await (vault.cachedRead || vault.read).call(vault, file)); if (!valid(state)) corrupted = true; }
      catch (_error) { corrupted = true; }
      return state;
    }
    async function persist(next) {
      const text = `${JSON.stringify(next, null, 2)}\n`;
      try {
        const file = vault.getAbstractFileByPath(statePath);
        if (file) await vault.modify(file, text);
        else {
          const parent = statePath.split("/").slice(0, -1).join("/");
          if (parent && !vault.getAbstractFileByPath(parent) && typeof vault.createFolder === "function") await vault.createFolder(parent);
          await vault.create(statePath, text);
        }
      } catch (_error) { throw new Error("proposal_persist_failed"); }
    }
    async function record({ manifest, chunk, artifact, authority, request, signal }) {
      if (!manifest?.chunks?.some(item => item.instance_id === chunk?.instance_id) || !plain(artifact)) throw new TypeError("invalid_chunk_proposal");
      if (!active(authority, request, signal)) throw new Error("analysis_request_inactive");
      const task = queue.then(async () => {
        await load();
        if (corrupted) throw new Error("corrupt_proposals_quarantined");
        if (!active(authority, request, signal)) throw new Error("analysis_request_inactive");
        const current = state.manifests[manifest.manifest_id] || { chunks: {} };
        const next = { ...state, manifests: { ...state.manifests, [manifest.manifest_id]: { chunks: { ...current.chunks, [chunk.instance_id]: artifact } } } };
        await persist(next);
        state = next;
      });
      queue = task.catch(() => {});
      await task;
    }
    async function read(manifest) {
      await load();
      if (corrupted) return fail("corrupt_proposals_quarantined");
      const chunks = state.manifests[manifest.manifest_id]?.chunks || {};
      if (Object.keys(chunks).some(id => !manifest.chunks.some(chunk => chunk.instance_id === id))) return fail("corrupt_proposals_quarantined");
      return freeze({ ok: true, artifacts: manifest.chunks.filter(chunk => plain(chunks[chunk.instance_id])).map(chunk => chunks[chunk.instance_id]) });
    }
    return freeze({ record, read, statePath });
  }

  function normalizeArtifact(scope, chunk, result) {
    const units = result && Array.isArray(result.semantic_units) ? result.semantic_units : [];
    if (!Array.isArray(units)) return null;
    const aliases = new Set();
    const semantic_units = [];
    for (const unit of units) {
      if (!plain(unit) || typeof unit.temporary_span_alias !== "string" || aliases.has(unit.temporary_span_alias)
        || !Number.isSafeInteger(unit.start) || !Number.isSafeInteger(unit.end) || unit.start < 0 || unit.end <= unit.start || unit.end > chunk.text.length
        || !["source_extract", "ai_interpretation"].includes(unit.origin_hint) || !["propose", "hold", "no_change"].includes(unit.disposition)
        || !plain(unit.uncertainty) || !["low", "medium", "high"].includes(unit.uncertainty.level) || !Array.isArray(unit.uncertainty.reasons)
        || !Array.isArray(unit.claims)) return null;
      aliases.add(unit.temporary_span_alias);
      const claims = unit.claims.map(claim => plain(claim) && typeof claim.text === "string" && claim.text.trim() && claim.temporary_span_alias === unit.temporary_span_alias ? freeze({ text: claim.text.trim(), source_span: { start: chunk.start + unit.start, end: chunk.start + unit.end } }) : null);
      if (claims.some(item => !item)) return null;
      semantic_units.push(freeze({ unit_id: sourceId(scope, chunk, unit.temporary_span_alias), source_id: scope.source_id, source_span: freeze({ start: chunk.start + unit.start, end: chunk.start + unit.end }), origin_hint: unit.origin_hint, disposition: unit.disposition, uncertainty: freeze({ level: unit.uncertainty.level, reasons: [...unit.uncertainty.reasons] }), claims: freeze(claims) }));
    }
    return freeze({ artifact_version: "llmwiki_inbox_chunk_artifact_v1", scope_id: scope.scope_id, manifest_id: null, instance_id: chunk.instance_id, semantic_id: chunk.semantic_id, text_hash: chunk.text_hash, semantic_units });
  }
  function batchChunks(chunks) {
    const batches = [];
    let batch = [];
    let total = 0;
    for (const chunk of chunks) {
      const size = bytes(chunk.text);
      if (batch.length && (batch.length === MAX_BATCH_CHUNKS || total + size > MAX_BATCH_BYTES)) { batches.push(batch); batch = []; total = 0; }
      batch.push(chunk); total += size;
    }
    if (batch.length) batches.push(batch);
    return batches;
  }
  function resultMap(batch, response) {
    if (!response || response.ok !== true) return fail(response?.reason || "analysis_failed", { message: response?.message || "" });
    if (response.chunk_results === undefined) {
      if (Object.keys(response).some(key => key !== "ok")) return fail("invalid_chunk_response");
      return { ok: true, values: new Map(batch.map(chunk => [chunk.instance_id, { key: chunk.instance_id, semantic_units: [] }])) };
    }
    if (!Array.isArray(response.chunk_results)) return fail("invalid_chunk_response");
    const values = new Map();
    for (const item of response.chunk_results) {
      if (!plain(item) || typeof item.key !== "string" || values.has(item.key) || !batch.some(chunk => chunk.instance_id === item.key)) return fail("invalid_chunk_response");
      values.set(item.key, item);
    }
    if (values.size !== batch.length) return fail("invalid_chunk_response");
    return { ok: true, values };
  }

  function createInboxChunkOrchestrator(options = {}) {
    const cache = options.cache || cacheApi?.createAnalysisCache({ vault: options.vault });
    const coverage = options.coverage || coverageApi?.createChunkCoverageStore({ vault: options.vault });
    const proposals = options.proposals || createProposalStore({ vault: options.vault, statePath: options.proposalPath });
    if (!cache || !coverage || !proposals) throw new TypeError("chunk_persistence_required");
    async function analyze(input) {
      const scope = scopeApi.createAnalysisScope({ source_id: input.source_id, source_path: input.source_path, content_hash: input.content_hash, source_text: input.extracted_text, selection: input.selection });
      const manifest = manifestApi.createChunkManifest(scope);
      const lookup = await cache.lookup(manifest, scope);
      if (!lookup.ok) return fail(lookup.reason);
      const hits = input.force === true ? [] : lookup.hits;
      const misses = input.force === true ? manifest.chunks : lookup.misses;
      const persist = async (chunk, artifact, cacheEntry) => {
        if (!active(input.authority, input.request, input.signal)) throw new Error("analysis_request_inactive");
        if (!cacheEntry) await cache.put({ chunk, artifact, authority: input.authority, request: input.request });
        const bound = freeze({ ...artifact, manifest_id: manifest.manifest_id });
        await proposals.record({ manifest, chunk, artifact: bound, authority: input.authority, request: input.request, signal: input.signal });
        await coverage.recordReceipt({ manifest, scope, chunk, artifact: bound, authority: input.authority, request: input.request });
        if (typeof input.onProgress === "function") input.onProgress(await coverage.status(manifest, scope));
      };
      try {
        for (const hit of hits) await persist(hit.chunk, hit.artifact, true);
        for (const batch of batchChunks(misses)) {
          if (!active(input.authority, input.request, input.signal)) return fail("provider_aborted", { state: "cancelled" });
          let response;
          try { response = await input.provider(freeze({ source_id: input.source_id, source_path: input.source_path, snapshot: input.snapshot, extracted_text: input.extracted_text, changed_chunks: batch.map(chunk => freeze({ key: chunk.instance_id, text: chunk.text })), signal: input.signal })); }
          catch (_error) { return fail("analysis_failed"); }
          if (!active(input.authority, input.request, input.signal)) return fail("provider_aborted", { state: "cancelled" });
          const mapped = resultMap(batch, response);
          if (!mapped.ok) return mapped;
          for (const chunk of batch) {
            const artifact = normalizeArtifact(scope, chunk, mapped.values.get(chunk.instance_id));
            if (!artifact) return fail("invalid_chunk_response");
            await persist(chunk, artifact, false);
          }
        }
      } catch (error) {
        return fail(error?.message || "analysis_state_write_failed");
      }
      const status = await coverage.status(manifest, scope);
      if (!status.ok || !status.complete || !status.durable || !status.exactCoverage) return fail(status.reason || "incomplete_coverage");
      const stored = await proposals.read(manifest);
      if (!stored.ok) return stored;
      return freeze({ ok: true, state: "completed", scope, manifest, coverage: status, artifacts: stored.artifacts, cache_misses: misses.length, cache_hits: hits.length });
    }
    return freeze({ analyze, proposals, cache, coverage });
  }

  const api = freeze({ DEFAULT_PROPOSAL_PATH, MAX_BATCH_CHUNKS, MAX_BATCH_BYTES, createProposalStore, createInboxChunkOrchestrator });
  root.LLMWikiInboxChunkOrchestrator = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
