(function (root) {
  "use strict";

  const DEFAULT_STATE_PATH = "SYSTEM/PRIVATE/llmwiki-incremental-analysis-state.json";
  const SCHEMA_VERSION = 1;
  const ANALYSIS_CONTRACT_VERSION = 1;
  const SOURCE_ID = /^[a-z][a-z0-9_-]{2,127}$/u;
  const CONTENT_HASH = /^[0-9a-f]{64}$/u;

  function plain(value) {
    return Boolean(value) && typeof value === "object" && !Array.isArray(value);
  }

  function normalizeRevision(input) {
    const sourceId = typeof input?.source_id === "string" ? input.source_id.trim() : "";
    const sourcePath = typeof input?.source_path === "string" ? input.source_path.trim() : "";
    const contentHash = typeof input?.content_hash === "string" ? input.content_hash.trim() : "";
    if (!SOURCE_ID.test(sourceId)
      || !sourcePath.startsWith("INBOX/")
      || sourcePath.includes("\\")
      || sourcePath.split("/").some((part) => !part || part === "." || part === "..")
      || !CONTENT_HASH.test(contentHash)) {
      throw new TypeError("invalid_analysis_revision");
    }
    return Object.freeze({ source_id: sourceId, source_path: sourcePath, content_hash: contentHash });
  }

  function emptyState() {
    return { schema_version: SCHEMA_VERSION, completed: {} };
  }

  function parseState(serialized) {
    let parsed;
    try { parsed = JSON.parse(serialized); }
    catch (_error) { return emptyState(); }
    if (!plain(parsed)
      || parsed.schema_version !== SCHEMA_VERSION
      || !plain(parsed.completed)) return emptyState();
    return {
      schema_version: SCHEMA_VERSION,
      completed: Object.fromEntries(
        Object.entries(parsed.completed)
          .filter(([sourceId, record]) => SOURCE_ID.test(sourceId) && plain(record))
          .map(([sourceId, record]) => [sourceId, {
            source_path: typeof record.source_path === "string" ? record.source_path : "",
            content_hash: typeof record.content_hash === "string" ? record.content_hash : "",
            analysis_contract_version: Number(record.analysis_contract_version || 0),
          }]),
      ),
    };
  }

  function serializeState(state) {
    const completed = Object.fromEntries(
      Object.entries(state.completed)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([sourceId, record]) => [sourceId, {
          source_path: record.source_path,
          content_hash: record.content_hash,
          analysis_contract_version: record.analysis_contract_version,
        }]),
    );
    return `${JSON.stringify({ schema_version: SCHEMA_VERSION, completed }, null, 2)}\n`;
  }

  function createIncrementalAnalysisState(options = {}) {
    const vault = options.vault;
    const statePath = typeof options.statePath === "string" && options.statePath.trim()
      ? options.statePath.trim() : DEFAULT_STATE_PATH;
    if (!vault
      || typeof vault.getAbstractFileByPath !== "function"
      || typeof vault.create !== "function"
      || typeof vault.modify !== "function") {
      throw new TypeError("vault_required");
    }

    let state = null;
    let writeQueue = Promise.resolve();

    async function load() {
      if (state) return state;
      const file = vault.getAbstractFileByPath(statePath);
      if (!file) {
        state = emptyState();
        return state;
      }
      try {
        const read = typeof vault.cachedRead === "function" ? vault.cachedRead.bind(vault) : vault.read.bind(vault);
        state = parseState(await read(file));
      } catch (_error) {
        state = emptyState();
      }
      return state;
    }

    async function persist() {
      const serialized = serializeState(state);
      const existing = vault.getAbstractFileByPath(statePath);
      if (existing) {
        await vault.modify(existing, serialized);
        return;
      }
      const parent = statePath.split("/").slice(0, -1).join("/");
      if (parent && !vault.getAbstractFileByPath(parent) && typeof vault.createFolder === "function") {
        await vault.createFolder(parent);
      }
      await vault.create(statePath, serialized);
    }

    async function isCompleted(input) {
      let revision;
      try { revision = normalizeRevision(input); }
      catch (_error) { return false; }
      const current = await load();
      const completed = current.completed[revision.source_id];
      return plain(completed)
        && completed.source_path === revision.source_path
        && completed.content_hash === revision.content_hash
        && completed.analysis_contract_version === ANALYSIS_CONTRACT_VERSION;
    }

    async function markCompleted(input) {
      const revision = normalizeRevision(input);
      writeQueue = writeQueue.then(async () => {
        const current = await load();
        current.completed[revision.source_id] = {
          source_path: revision.source_path,
          content_hash: revision.content_hash,
          analysis_contract_version: ANALYSIS_CONTRACT_VERSION,
        };
        await persist();
      });
      await writeQueue;
      return Object.freeze({ ok: true, ...revision });
    }

    return Object.freeze({ isCompleted, markCompleted });
  }

  const api = Object.freeze({
    DEFAULT_STATE_PATH,
    SCHEMA_VERSION,
    ANALYSIS_CONTRACT_VERSION,
    createIncrementalAnalysisState,
  });
  root.LLMWikiIncrementalAnalysisState = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
