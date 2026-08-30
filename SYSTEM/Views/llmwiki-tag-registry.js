(function (root) {
  "use strict";

  const REGISTRY_VERSION = "llmwiki_tag_registry_v1";
  const ENTRIES = Object.freeze([
    "knowledge/real-estate/rights",
    "knowledge/real-estate/enforcement",
    "knowledge/real-estate/finance",
    "knowledge/real-estate/construction",
    "knowledge/real-estate/land",
    "knowledge/real-estate/location",
    "knowledge/real-estate/interior",
    "knowledge/real-estate/transaction",
    "knowledge/real-estate/tax",
    "knowledge/real-estate/source-guide",
    "knowledge/wedding/planning",
    "knowledge/photography/wedding-snap",
    "knowledge/workflow/procedure",
    "knowledge/general/reference",
  ]);
  const ENTRY_SET = new Set(ENTRIES);
  const CLUSTER_TO_TAG = Object.freeze(Object.fromEntries(ENTRIES.map((tag) => [tag.replace(/^knowledge\//u, ""), tag])));

  function plain(value) { return Boolean(value) && typeof value === "object" && !Array.isArray(value); }
  function freeze(value) {
    if (Array.isArray(value)) return Object.freeze(value.map(freeze));
    if (!plain(value)) return value;
    return Object.freeze(Object.fromEntries(Object.entries(value).map(([key, child]) => [key, freeze(child)])));
  }
  function rootBranch(tag) { return tag.split("/").slice(0, 2).join("/"); }
  function validate(value) {
    if (!Array.isArray(value) || value.length === 0) return freeze({ ok: false, status: "hold", reason: "primary_tag_required", writer_count: 0 });
    if (value.length > 2) return freeze({ ok: false, status: "hold", reason: "tag_limit_exceeded", writer_count: 0 });
    if (new Set(value).size !== value.length) return freeze({ ok: false, status: "hold", reason: "duplicate_tag", writer_count: 0 });
    if (value.some((tag) => typeof tag !== "string" || !ENTRY_SET.has(tag))) return freeze({ ok: false, status: "hold", reason: "tag_not_registered", writer_count: 0 });
    if (value.length === 2 && rootBranch(value[0]) === rootBranch(value[1])) return freeze({ ok: false, status: "hold", reason: "secondary_tag_not_cross_domain", writer_count: 0 });
    return freeze({ ok: true, status: "resolved", registry_version: REGISTRY_VERSION, tags: [...value], writer_count: 0 });
  }
  function resolve(input) {
    if (!plain(input) || typeof input.primary_cluster !== "string") return freeze({ ok: false, status: "hold", reason: "primary_cluster_required", writer_count: 0 });
    const primary = CLUSTER_TO_TAG[input.primary_cluster];
    if (!primary) return freeze({ ok: false, status: "hold", reason: "tag_cluster_unknown", writer_count: 0 });
    if (!input.secondary_cluster) return validate([primary]);
    if (input.cross_domain !== true) return freeze({ ok: false, status: "hold", reason: "secondary_tag_requires_cross_domain", writer_count: 0 });
    const secondary = CLUSTER_TO_TAG[input.secondary_cluster];
    if (!secondary) return freeze({ ok: false, status: "hold", reason: "tag_cluster_unknown", writer_count: 0 });
    return validate([primary, secondary]);
  }

  const api = freeze({ REGISTRY_VERSION, ENTRIES, resolve, validate });
  root.LLMWikiTagRegistry = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
