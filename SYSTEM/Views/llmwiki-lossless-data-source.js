(function (root) {
  "use strict";
  const ARTIFACT_PATH = "SYSTEM/CACHE/llmwiki/lossless-corpus-artifact.json";
  const SEMANTIC_PILOT_PATH = "SYSTEM/CACHE/llmwiki/house-building-wiki-pilot.json";
  function freeze(value) { if (!value || typeof value !== "object" || Object.isFrozen(value)) return value; Object.freeze(value); for (const child of Object.values(value)) freeze(child); return value; }
  function validResult(row) { return row && typeof row.source_path === "string" && row.corpus_index && Array.isArray(row.topics) && Array.isArray(row.details) && row.receipt; }
  function createDataSource(config) {
    if (!config?.vault || typeof config.vault.adapter?.read !== "function") throw new TypeError("vault_adapter_required");
    let cache = null;
    return freeze({
      async load() {
        if (cache) return cache;
        const parsed = JSON.parse(await config.vault.adapter.read(ARTIFACT_PATH));
        if (!parsed || !Array.isArray(parsed.results) || parsed.results.some((row) => !validResult(row))) throw new Error("invalid_lossless_artifact");
        cache = freeze(parsed.results);
        return cache;
      },
      async list() { return (await this.load()).map((row) => freeze({ source_path: row.source_path, claims: row.claims, topics: row.topic_pages, details: row.source_details, receipt_hash: row.receipt.receipt_hash })); },
      async get(sourcePath) { return (await this.load()).find((row) => row.source_path.normalize("NFC") === String(sourcePath).normalize("NFC")) || null; },
      async getSemanticPilot(sourcePath) {
        try {
          const pilot = JSON.parse(await config.vault.adapter.read(SEMANTIC_PILOT_PATH));
          return pilot?.source_path?.normalize("NFC") === String(sourcePath).normalize("NFC") && pilot.audit?.ok ? freeze(pilot) : null;
        } catch (_) { return null; }
      },
      invalidate() { cache = null; },
    });
  }
  const api = freeze({ ARTIFACT_PATH, SEMANTIC_PILOT_PATH, createDataSource });
  root.LLMWikiLosslessDataSource = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
