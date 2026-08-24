(function (root) {
  "use strict";
  const VERSION = "llmwiki_resurfacing_feedback_store_v2";
  const STORES = new WeakSet();
  function freeze(value) { if (Array.isArray(value)) return Object.freeze(value.map(freeze)); if (!value || typeof value !== "object") return value; return Object.freeze(Object.fromEntries(Object.entries(value).map(([key, child]) => [key, freeze(child)]))); }
  function unavailable() { return freeze({ ok: false, status: "error", reason: "atomic_feedback_store_required", attempted: 0, committed: 0, rolled_back: 0, residual: "none" }); }
  function corrupt() { return freeze({ ok: false, status: "recovery_required", reason: "feedback_recovery_required", attempted: 0, committed: 0, rolled_back: 0, residual: "preserved" }); }
  function decode(raw) {
    if (raw === null) return { ok: true, value: [] };
    try { const value = JSON.parse(raw); return Array.isArray(value) ? { ok: true, value } : { ok: false }; }
    catch (_) { return { ok: false }; }
  }
  function create(options = {}) {
    let storage, getItem, setItem, removeItem;
    try {
      storage = options.storage;
      getItem = storage && storage.getItem;
      setItem = storage && storage.setItem;
      removeItem = storage && storage.removeItem;
    } catch (_) { return null; }
    const key = typeof options.key === "string" && options.key ? options.key : "prodigy.llmwiki.resurfacing.feedback.v1";
    if (!storage || typeof getItem !== "function" || typeof setItem !== "function" || typeof removeItem !== "function") return null;
    function readRaw() { return getItem.call(storage, key); }
    function records() {
      let raw;
      try { raw = readRaw(); } catch (_) { return Object.freeze([]); }
      const parsed = decode(raw);
      return parsed.ok ? freeze(parsed.value) : Object.freeze([]);
    }
    function transact(row) {
      let before;
      try { before = readRaw(); } catch (_) { return unavailable(); }
      const parsed = decode(before);
      if (!parsed.ok) return corrupt();
      const next = parsed.value;
      const record = { feedback: row, ranking: { item_id: row.item_id, canonical_revision: row.canonical_revision, delta: row.ranking_delta }, evaluation: { action: row.action, workspace: row.workspace, canonical_id: row.canonical_id } };
      next.push(record);
      try {
        setItem.call(storage, key, JSON.stringify(next));
        return freeze({ ok: true, status: "committed", attempted: 1, committed: 1, rolled_back: 0, record });
      } catch (_) {
        let rolledBack = 0, residual = "unknown";
        try {
          if (before === null) removeItem.call(storage, key); else setItem.call(storage, key, before);
          rolledBack = 1; residual = "none";
        } catch (_) { /* recovery must be surfaced */ }
        return freeze({ ok: false, status: residual === "none" ? "rolled_back" : "recovery_required", reason: residual === "none" ? "feedback_store_failed" : "feedback_recovery_required", attempted: 1, committed: 0, rolled_back: rolledBack, residual });
      }
    }
    const store = Object.freeze({ transact, records, version: VERSION });
    STORES.add(store);
    return store;
  }
  function createDefault(host) {
    let storage;
    try { storage = host && host.localStorage; } catch (_) { return null; }
    return create({ storage });
  }
  function isAtomicStore(value) { return Boolean(value) && STORES.has(value); }
  const api = Object.freeze({ VERSION, create, createDefault, isAtomicStore });
  root.LLMWikiResurfacingFeedbackStore = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
