(function (root) {
  "use strict";

  // Owner-designated manuals: local-only registry. Manuals are never
  // fragmented by routing; incoming overlapping content is suggested as an
  // update to the manual instead of a fragment create. No authority: the
  // registry only names paths; approval and write integrity stay downstream.
  const REGISTRY_PATH = "SYSTEM/CACHE/llmwiki/manual-registry.json";
  const MAX_MANUALS = 64;

  function plain(value) { return Boolean(value) && typeof value === "object" && !Array.isArray(value); }

  function normalizeEntries(value) {
    if (!Array.isArray(value)) return [];
    const seen = new Set();
    const out = [];
    for (const entry of value) {
      const path = typeof entry === "string" ? entry : entry && entry.path;
      if (typeof path !== "string" || !path.endsWith(".md") || path.includes("..")) continue;
      const cleaned = path.trim();
      if (!cleaned || seen.has(cleaned)) continue;
      seen.add(cleaned);
      out.push({ path: cleaned });
    }
    return out.slice(0, MAX_MANUALS);
  }

  async function loadRegistry(app) {
    try {
      const file = app && app.vault.getAbstractFileByPath(REGISTRY_PATH);
      if (!file || typeof app.vault.read !== "function") return [];
      return normalizeEntries(JSON.parse(await app.vault.read(file)));
    } catch (_error) { return []; }
  }

  async function saveRegistry(app, entries) {
    const clean = normalizeEntries(entries);
    const bytes = JSON.stringify(clean);
    const file = app.vault.getAbstractFileByPath(REGISTRY_PATH);
    if (file && typeof app.vault.modify === "function") await app.vault.modify(file, bytes);
    else if (!file && typeof app.vault.create === "function") await app.vault.create(REGISTRY_PATH, bytes);
    return clean;
  }

  function isManual(manuals, targetPath) {
    return (manuals || []).some(entry => entry && entry.path === targetPath);
  }

  // Overlap counterpart (duplicate/conflict row path) that names a manual wins
  // over a fresh create. Returns the manual path or "".
  function suggestManualTarget(manuals, relatedKnowledge) {
    if (!Array.isArray(relatedKnowledge)) return "";
    for (const row of relatedKnowledge) {
      if (!row || (row.relation !== "duplicate" && row.relation !== "conflict")) continue;
      if (typeof row.path === "string" && isManual(manuals, row.path)) return row.path;
    }
    return "";
  }

  const api = Object.freeze({ REGISTRY_PATH, MAX_MANUALS, normalizeEntries, loadRegistry, saveRegistry, isManual, suggestManualTarget });
  root.LLMWikiManualRegistry = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
