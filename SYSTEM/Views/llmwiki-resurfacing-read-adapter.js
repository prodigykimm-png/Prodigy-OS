(function (root) {
  "use strict";
  const VERSION = "llmwiki_resurfacing_read_adapter_v2";
  const ROWS = new WeakSet();
  const OWNERS = new WeakMap();
  function fail(field, reason) { return Object.freeze({ ok: false, status: "error", field, reason, rows: Object.freeze([]), writer_count: 0 }); }
  function cancelled() { return Object.freeze({ ok: false, status: "cancelled", reason: "mount_cancelled", rows: Object.freeze([]), writer_count: 0 }); }
  function cloneData(value) { try { return JSON.parse(JSON.stringify(value || {})); } catch (_) { return {}; } }
  function dependencies() {
    const obsidian = root.LLMWikiObsidianAdapter || (typeof require === "function" ? require("./llmwiki-obsidian-adapter.js") : null);
    const lifecycle = root.LLMWikiKnowledgeLifecycle || (typeof require === "function" ? require("./llmwiki-knowledge-lifecycle.js") : null);
    return { obsidian, lifecycle };
  }
  function create() {
    let currentApp = null;
    function isTrustedRow(value) { return Boolean(value) && ROWS.has(value) && OWNERS.has(value); }
    async function read({ app, signal } = {}) {
      if (signal && signal.aborted) return cancelled();
      const deps = dependencies();
      const resolved = deps.obsidian && deps.obsidian.resolveObsidianAdapter(app);
      if (!resolved || !resolved.ok || typeof resolved.adapter.readFinalizedCanonicalAuthorities !== "function") return fail("app", "trusted_audit_reader_required");
      currentApp = app;
      const authorities = await resolved.adapter.readFinalizedCanonicalAuthorities();
      if (signal && signal.aborted) return cancelled();
      const rows = [];
      const lifecycleRows = [];
      for (const authority of authorities) {
        if (!deps.obsidian.isFinalizedCanonicalAuthority(authority)) continue;
        const binding = deps.obsidian.finalizedCanonicalAuthorityData(authority);
        const canonical = await resolved.adapter.readCanonical(binding.path);
        if (signal && signal.aborted) return cancelled();
        if (!canonical || canonical.revision !== binding.revision) continue;
        const file = app.vault.getAbstractFileByPath(binding.path);
        const metadata = file && app.metadataCache && typeof app.metadataCache.getFileCache === "function" ? app.metadataCache.getFileCache(file) : null;
        const frontmatter = cloneData(metadata && metadata.frontmatter);
        if (frontmatter.canonical_id !== binding.canonical_id) continue;
        const row = Object.freeze({ ...frontmatter, item_id: frontmatter.item_id || `item_${binding.canonical_id}`, canonical_id: binding.canonical_id, canonical_revision: binding.revision, path: binding.path, title: frontmatter.title || file.basename, trust_receipt: authority });
        ROWS.add(row); OWNERS.set(row, Object.freeze({ ...binding })); rows.push(row);
        lifecycleRows.push({ document_id: binding.canonical_id, canonical_revision: binding.revision, source_ids: Array.isArray(row.sources) ? row.sources.map((source) => source.source_id) : [] });
      }
      if (deps.lifecycle && rows.length) {
        const snapshotRevision = rows.map((row) => row.canonical_revision).sort().join("").slice(0, 64);
        const lifecycle = deps.lifecycle.createMaintenanceSnapshot(JSON.stringify({ snapshot_revision: snapshotRevision, canonical_documents: lifecycleRows, triggers: [], feedback: [] }));
        if (!lifecycle.ok) return fail("lifecycle", lifecycle.reason);
      }
      return Object.freeze({ ok: true, status: rows.length ? "trusted" : "empty", rows: Object.freeze(rows), writer_count: 0 });
    }
    async function current({ canonical_id, path, signal } = {}) {
      if (signal && signal.aborted) return cancelled();
      if (!currentApp) return fail("app", "current_app_unavailable");
      const deps = dependencies();
      const resolved = deps.obsidian.resolveObsidianAdapter(currentApp);
      if (!resolved.ok) return fail("app", "trusted_audit_reader_required");
      let canonical;
      try { canonical = await resolved.adapter.readCanonical(path); } catch (_) { return Object.freeze({ ok: false, status: "missing", reason: "canonical_missing" }); }
      if (signal && signal.aborted) return cancelled();
      const file = currentApp.vault.getAbstractFileByPath(path);
      const metadata = file && currentApp.metadataCache && currentApp.metadataCache.getFileCache(file);
      const frontmatter = cloneData(metadata && metadata.frontmatter);
      if (frontmatter.canonical_id !== canonical_id) return Object.freeze({ ok: false, status: "missing", reason: "canonical_identity_changed" });
      return Object.freeze({ ok: true, canonical_id, path, revision: canonical.revision });
    }
    return Object.freeze({ read, current, isTrustedRow, version: VERSION });
  }
  const api = Object.freeze({ VERSION, create });
  root.LLMWikiResurfacingReadAdapter = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
