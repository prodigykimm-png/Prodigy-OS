(function (root) {
  "use strict";

  const scopeApi = root.LLMWikiAnalysisScope || (typeof require === "function" ? require("./llmwiki-analysis-scope.js") : null);
  const manifestApi = root.LLMWikiChunkManifest || (typeof require === "function" ? require("./llmwiki-chunk-manifest.js") : null);
  const coverageApi = root.LLMWikiChunkCoverageStore || (typeof require === "function" ? require("./llmwiki-chunk-coverage-store.js") : null);
  const DEFAULT_STATE_PATH = "SYSTEM/PRIVATE/llmwiki-incremental-analysis-state.json";
  const SCHEMA_VERSION = 2;
  const ANALYSIS_CONTRACT_VERSION = 2;
  const SOURCE_ID = /^[a-z][a-z0-9_-]{2,127}$/u;
  const CONTENT_HASH = /^[0-9a-f]{64}$/u;

  function plain(value) { return Boolean(value) && typeof value === "object" && !Array.isArray(value); }
  function freeze(value) {
    if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
    Object.freeze(value);
    for (const child of Object.values(value)) freeze(child);
    return value;
  }
  function emptyState() { return { schema_version: SCHEMA_VERSION, completed: {} }; }
  function stable(value) { if (value === null || typeof value !== "object") return JSON.stringify(value); if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`; return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stable(value[key])}`).join(",")}}`; }
  function validStoredScope(scope) {
    return plain(scope) && typeof scope.scope_id === "string" && SOURCE_ID.test(scope.source_id)
      && typeof scope.source_path === "string" && scope.source_path.startsWith("INBOX/") && CONTENT_HASH.test(scope.content_hash)
      && Number.isSafeInteger(scope.start) && Number.isSafeInteger(scope.end) && scope.start >= 0 && scope.end >= scope.start && CONTENT_HASH.test(scope.text_hash);
  }
  function validRecord(record) {
    return plain(record) && validStoredScope(record.scope) && plain(record.manifest) && typeof record.manifest.manifest_id === "string"
      && record.manifest.scope_id === record.scope.scope_id && Array.isArray(record.manifest.chunks) && plain(record.coverage)
      && record.coverage.durable === true && record.coverage.exactCoverage === true && record.coverage.manifest_id === record.manifest.manifest_id
      && Array.isArray(record.coverage.receipts) && record.coverage.receipts.length === record.manifest.chunks.length;
  }
  function parseState(serialized) {
    let parsed;
    try { parsed = JSON.parse(serialized); } catch (_error) { return emptyState(); }
    if (!plain(parsed)) return emptyState();
    // v1 has no coverage receipts, so it intentionally becomes stale/fresh-analysis input.
    if (parsed.schema_version === 1) return emptyState();
    if (parsed.schema_version !== SCHEMA_VERSION || !plain(parsed.completed)) return emptyState();
    return {
      schema_version: SCHEMA_VERSION,
      completed: Object.fromEntries(Object.entries(parsed.completed).filter(([sourceId, record]) => SOURCE_ID.test(sourceId) && validRecord(record))),
    };
  }
  function serializeState(state) {
    return `${JSON.stringify({ schema_version: SCHEMA_VERSION, completed: Object.fromEntries(Object.entries(state.completed).sort(([a], [b]) => a.localeCompare(b))) }, null, 2)}\n`;
  }
  function scopeInput(value) {
    if (value && typeof value === "object" && value.scope) return value.scope;
    return value;
  }
  function createIncrementalAnalysisState(options = {}) {
    const vault = options.vault;
    const statePath = typeof options.statePath === "string" && options.statePath.trim() ? options.statePath.trim() : DEFAULT_STATE_PATH;
    if (!vault || ["getAbstractFileByPath", "create", "modify"].some(method => typeof vault[method] !== "function")) throw new TypeError("vault_required");
    let state = null;
    let writeQueue = Promise.resolve();
    async function load() {
      if (state) return state;
      const file = vault.getAbstractFileByPath(statePath);
      if (!file) { state = emptyState(); return state; }
      try {
        const read = typeof vault.cachedRead === "function" ? vault.cachedRead.bind(vault) : vault.read.bind(vault);
        state = parseState(await read(file));
      } catch (_error) { state = emptyState(); }
      return state;
    }
    async function persist(next) {
      const serialized = serializeState(next);
      try {
        const existing = vault.getAbstractFileByPath(statePath);
        if (existing) await vault.modify(existing, serialized);
        else {
          const parent = statePath.split("/").slice(0, -1).join("/");
          if (parent && !vault.getAbstractFileByPath(parent) && typeof vault.createFolder === "function") await vault.createFolder(parent);
          await vault.create(statePath, serialized);
        }
      } catch (_error) { throw new Error("analysis_state_write_failed"); }
    }
    async function isCompleted(input) {
      const scope = scopeInput(input);
      const valid = scopeApi?.validateAnalysisScope(scope);
      if (!valid?.ok) return false;
      const current = await load();
      const record = current.completed[scope.source_id];
      if (!validRecord(record) || record.scope.scope_id !== scope.scope_id || record.scope.content_hash !== scope.content_hash
        || record.scope.source_path !== scope.source_path || record.scope.text_hash !== scope.text_hash) return false;
      try {
        const expected = manifestApi.createChunkManifest(scope, { max_bytes: record.manifest.max_bytes });
        if (stable(record.scope) !== stable(scopeApi.serializableScope(scope)) || stable(record.manifest) !== stable(manifestApi.serializableManifest(expected, scope))) return false;
        return record.coverage.receipts.every(receipt => coverageApi?.validateCoverageReceipt(expected, expected.chunks.find(chunk => chunk.instance_id === receipt.instance_id), receipt));
      } catch (_error) { return false; }
    }
    async function markCompleted(input) {
      const scope = input?.scope;
      const manifest = input?.manifest;
      const coverage = input?.coverage;
      const validScope = scopeApi?.validateAnalysisScope(scope);
      const validManifest = manifestApi?.validateChunkManifest(manifest, scope);
      if (!validScope?.ok || !validManifest?.ok) throw new TypeError(!validScope?.ok ? validScope?.reason || "invalid_analysis_scope" : validManifest.reason);
      if (!plain(coverage) || coverage.durable !== true || coverage.exactCoverage !== true || coverage.complete !== true
        || coverage.manifest_id !== manifest.manifest_id || !Array.isArray(coverage.receipts) || coverage.receipts.length !== manifest.chunks.length) throw new TypeError("incomplete_coverage");
      const expected = new Set(manifest.chunks.map(chunk => chunk.instance_id));
      if (coverage.receipts.some(receipt => !plain(receipt) || receipt.manifest_id !== manifest.manifest_id || !expected.delete(receipt.instance_id) || !coverageApi?.validateCoverageReceipt(manifest, manifest.chunks.find(chunk => chunk.instance_id === receipt.instance_id), receipt)) || expected.size) throw new TypeError("invalid_coverage_receipts");
      const stored = freeze({ scope: scopeApi.serializableScope(scope), manifest: manifestApi.serializableManifest(manifest, scope), coverage: freeze({ durable: true, exactCoverage: true, manifest_id: manifest.manifest_id, receipts: coverage.receipts }) });
      writeQueue = writeQueue.then(async () => {
        const current = await load();
        const next = { ...current, completed: { ...current.completed, [scope.source_id]: stored } };
        await persist(next);
        state = next;
      });
      await writeQueue;
      return freeze({ ok: true, source_id: scope.source_id, scope_id: scope.scope_id, manifest_id: manifest.manifest_id });
    }
    return freeze({ isCompleted, markCompleted });
  }
  const api = Object.freeze({ DEFAULT_STATE_PATH, SCHEMA_VERSION, ANALYSIS_CONTRACT_VERSION, createIncrementalAnalysisState });
  root.LLMWikiIncrementalAnalysisState = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
