(function (root) {
  "use strict";

  const hashApi = root.LLMWikiHash || (typeof require === "function" ? require("./llmwiki-hash.js") : null);
  const manifestApi = root.LLMWikiChunkManifest || (typeof require === "function" ? require("./llmwiki-chunk-manifest.js") : null);
  const DEFAULT_CACHE_PATH = "SYSTEM/PRIVATE/llmwiki-analysis-cache.json";
  const CACHE_VERSION = 1;
  const MAX_RETRY_GENERATION = 2;

  function freeze(value) {
    if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
    Object.freeze(value);
    for (const child of Object.values(value)) freeze(child);
    return value;
  }
  function plain(value) { return Boolean(value) && typeof value === "object" && !Array.isArray(value); }
  function stable(value) {
    if (value === null || typeof value !== "object") return JSON.stringify(value);
    if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stable(value[key])}`).join(",")}}`;
  }
  function empty() { return { cache_version: CACHE_VERSION, entries: {} }; }
  function parse(text) {
    try {
      const value = JSON.parse(text);
      if (!plain(value) || value.cache_version !== CACHE_VERSION || !plain(value.entries)) return null;
      for (const [semanticId, entries] of Object.entries(value.entries)) {
        if (!/^semantic_[0-9a-f]{24}$/u.test(semanticId) || !Array.isArray(entries) || entries.some(entry => !plain(entry) || !plain(entry.artifact) || entry.semantic_id !== semanticId || typeof entry.instance_id !== "string" || entry.artifact_hash !== hashApi.sha256(stable(entry.artifact)) || !Number.isSafeInteger(entry.retry_generation) || entry.retry_generation < 0 || entry.retry_generation > MAX_RETRY_GENERATION)) return null;
      }
      return value;
    } catch (_error) { return null; }
  }
  function quarantined(reason) { return freeze({ ok: false, state: "quarantined", reason, hits: [], misses: [] }); }
  function active(input) { return !input?.authority && !input?.request || Boolean(input?.authority && typeof input.authority.isActive === "function" && input.authority.isActive(input.request)); }
  function createAnalysisCache(options = {}) {
    const vault = options.vault;
    const statePath = typeof options.statePath === "string" && options.statePath.trim() ? options.statePath.trim() : DEFAULT_CACHE_PATH;
    if (!vault || ["getAbstractFileByPath", "create", "modify"].some(method => typeof vault[method] !== "function")) throw new TypeError("vault_required");
    let state = null;
    let corrupt = false;
    let queue = Promise.resolve();
    async function load() {
      if (state || corrupt) return state;
      const file = vault.getAbstractFileByPath(statePath);
      if (!file) { state = empty(); return state; }
      try {
        const read = typeof vault.cachedRead === "function" ? vault.cachedRead.bind(vault) : vault.read.bind(vault);
        state = parse(await read(file));
        if (!state) corrupt = true;
      } catch (_error) { corrupt = true; }
      return state;
    }
    async function persist(next) {
      try {
        const file = vault.getAbstractFileByPath(statePath);
        const text = `${JSON.stringify(next, null, 2)}\n`;
        if (file) await vault.modify(file, text);
        else {
          const parent = statePath.split("/").slice(0, -1).join("/");
          if (parent && !vault.getAbstractFileByPath(parent) && typeof vault.createFolder === "function") await vault.createFolder(parent);
          await vault.create(statePath, text);
        }
      } catch (_error) { throw new Error("cache_persist_failed"); }
    }
    async function put(input) {
      const { chunk, artifact } = input || {};
      const retryGeneration = input?.retry_generation === undefined ? 0 : input.retry_generation;
      if (!chunk || !/^semantic_[0-9a-f]{24}$/u.test(chunk.semantic_id) || !/^instance_[0-9a-f]{24}$/u.test(chunk.instance_id) || !plain(artifact)) throw new TypeError("invalid_cache_entry");
      if (!Number.isSafeInteger(retryGeneration) || retryGeneration < 0 || retryGeneration > MAX_RETRY_GENERATION) throw new TypeError("retry_generation_exhausted");
      if (!active(input)) throw new Error("analysis_request_inactive");
      const entry = freeze({ semantic_id: chunk.semantic_id, instance_id: chunk.instance_id, text_hash: chunk.text_hash, retry_generation: retryGeneration, artifact_hash: hashApi.sha256(stable(artifact)), artifact });
      const task = queue.then(async () => {
        await load();
        if (corrupt) throw new Error("corrupt_cache_quarantined");
        if (!active(input)) throw new Error("analysis_request_inactive");
        const prior = (state.entries[entry.semantic_id] || []).find(item => item.instance_id === entry.instance_id);
        if (prior && entry.retry_generation < prior.retry_generation) return freeze({ ok: true, state: "ignored_stale", entry: prior });
        if (prior && entry.retry_generation === prior.retry_generation) {
          if (entry.artifact_hash !== prior.artifact_hash) throw new Error("retry_generation_conflict");
          return freeze({ ok: true, state: "replayed", entry: prior });
        }
        const withoutSameInstance = (state.entries[entry.semantic_id] || []).filter(item => item.instance_id !== entry.instance_id);
        const next = { ...state, entries: { ...state.entries, [entry.semantic_id]: [...withoutSameInstance, entry] } };
        await persist(next);
        state = next;
        return freeze({ ok: true, state: "stored", entry });
      });
      queue = task.catch(() => {});
      return task;
    }
    async function lookup(manifest, scope) {
      const valid = manifestApi.validateChunkManifest(manifest, scope);
      if (!valid.ok) return quarantined(valid.reason);
      await load();
      if (corrupt) return quarantined("corrupt_cache_quarantined");
      const queried = new Map();
      for (const chunk of manifest.chunks) queried.set(chunk.semantic_id, (queried.get(chunk.semantic_id) || 0) + 1);
      const ambiguous = manifest.chunks.some(chunk => queried.get(chunk.semantic_id) > 1 || (state.entries[chunk.semantic_id] || []).length > 1);
      if (ambiguous) return freeze({ ok: false, state: "rejected", reason: "ambiguous_duplicate_continuity", hits: [], misses: manifest.chunks });
      const hits = [];
      const misses = [];
      for (const chunk of manifest.chunks) {
        const entry = state.entries[chunk.semantic_id]?.[0];
        if (entry && entry.text_hash === chunk.text_hash) hits.push(freeze({ chunk, artifact: entry.artifact, cache_entry_id: entry.instance_id }));
        else misses.push(chunk);
      }
      return freeze({ ok: true, hits, misses });
    }
    return freeze({ put, lookup });
  }

  const api = Object.freeze({ DEFAULT_CACHE_PATH, CACHE_VERSION, MAX_RETRY_GENERATION, createAnalysisCache });
  root.LLMWikiAnalysisCache = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
