(function (root) {
  "use strict";
  const VERSION = "llmwiki_resurfacing_read_adapter_v2";
  const ROWS = new WeakSet();
  const OWNERS = new WeakMap();
  const ADAPTERS = new WeakSet();
  function fail(field, reason) { return Object.freeze({ ok: false, status: "error", field, reason, rows: Object.freeze([]), writer_count: 0 }); }
  function cancelled() { return Object.freeze({ ok: false, status: "cancelled", reason: "mount_cancelled", rows: Object.freeze([]), writer_count: 0 }); }
  function cloneData(value) { try { return JSON.parse(JSON.stringify(value || {})); } catch (_) { return {}; } }
  function dependencies() {
    const obsidian = root.LLMWikiObsidianAdapter || (typeof require === "function" ? require("./llmwiki-obsidian-adapter.js") : null);
    const lifecycle = root.LLMWikiKnowledgeLifecycle || (typeof require === "function" ? require("./llmwiki-knowledge-lifecycle.js") : null);
    const knowledge = root.KnowledgeCandidateStore || (typeof require === "function" ? require("./knowledge-candidate-store.js") : null);
    const claims = root.LLMWikiClaimProvenance || (typeof require === "function" ? require("./llmwiki-claim-provenance.js") : null);
    const trust = root.LLMWikiCanonicalTrust || (typeof require === "function" ? require("./llmwiki-canonical-trust.js") : null);
    return { obsidian, lifecycle, knowledge, claims, trust };
  }
  function trustedV2Canonical(bytes, binding, receipt, deps) {
    if (!deps.trust || typeof deps.trust.decideFinalized !== "function") return { ok: false };
    const sourceRevisions = binding.canonical_v2_authority && binding.canonical_v2_authority.claim_set && binding.canonical_v2_authority.claim_set.sources;
    const decision = deps.trust.decideFinalized({ receipt, bytes, revision: binding.revision, source_revisions: sourceRevisions });
    if (!deps.trust.isVerified(decision)) return { ok: false, decision };
    try { return { ok: true, document: deps.knowledge.parseLifecycleDocument(bytes), decision }; } catch (_) { return { ok: false, decision }; }
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
        const v2 = trustedV2Canonical(canonical.bytes, binding, authority, deps);
        if (!v2.ok) continue;
        const file = app.vault.getAbstractFileByPath(binding.path);
        const metadata = file && app.metadataCache && typeof app.metadataCache.getFileCache === "function" ? app.metadataCache.getFileCache(file) : null;
        const frontmatter = cloneData(metadata && metadata.frontmatter);
        if (frontmatter.canonical_id !== binding.canonical_id) continue;
        const claimSources = new Map(binding.canonical_v2_authority.claim_set.sources.map((source) => [source.source_id, source]));
        const sources = v2.document.sources.map((source) => ({ ...source, source_revision: claimSources.get(source.source_id).source_revision, locator: typeof source.locator === "string" ? source.locator : source.source_id }));
        const row = deps.trust.bindVerifiedRow(Object.freeze({ ...frontmatter, ...v2.document, sources, item_id: frontmatter.item_id || `item_${binding.canonical_id}`, canonical_id: binding.canonical_id, canonical_revision: binding.revision, canonical_bytes: canonical.bytes, path: binding.path, title: frontmatter.title || v2.document.title || file.basename, trust_tier: v2.decision.tier, trust_status: v2.decision.status, trust_receipt: authority }), v2.decision);
        ROWS.add(row); OWNERS.set(row, Object.freeze({ ...binding })); rows.push(row);
        lifecycleRows.push(deps.trust.bindVerifiedRow(Object.freeze({ document_id: binding.canonical_id, canonical_revision: binding.revision, source_ids: Array.isArray(row.sources) ? row.sources.map((source) => source.source_id) : [] }), v2.decision));
      }
      if (deps.lifecycle && rows.length) {
        const snapshotRevision = rows.map((row) => row.canonical_revision).sort().join("").slice(0, 64);
        const lifecycle = deps.lifecycle.createTrustedMaintenanceSnapshot({ snapshot_revision: snapshotRevision, canonical_documents: lifecycleRows, triggers: [], feedback: [] });
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
    const adapter = Object.freeze({ read, current, isTrustedRow, version: VERSION });
    ADAPTERS.add(adapter);
    return adapter;
  }
  const api = Object.freeze({ VERSION, create, isReadAdapter: (value) => Boolean(value) && ADAPTERS.has(value) });
  root.LLMWikiResurfacingReadAdapter = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
