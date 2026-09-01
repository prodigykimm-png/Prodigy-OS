(function (root) {
  "use strict";

  const hashApi = root.LLMWikiHash
    || (typeof require === "function" ? require("./llmwiki-hash.js") : null);
  const artifactApi = root.ProdigyWikiArtifactContract
    || (typeof require === "function" ? require("./prodigy-wiki-artifact-contract.js") : null);
  if (!hashApi || typeof hashApi.sha256 !== "function" || !artifactApi) {
    throw new Error("Prodigy Wiki index dependencies are required.");
  }

  const VERSION = "prodigy_wiki_index_v1";
  const MODES = Object.freeze(["current", "stale", "history", "all"]);

  function plain(value) {
    return Boolean(value) && typeof value === "object" && !Array.isArray(value);
  }
  function stable(value) {
    if (value === null || typeof value !== "object") return JSON.stringify(value);
    if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stable(value[key])}`).join(",")}}`;
  }
  function freeze(value) {
    if (Array.isArray(value)) return Object.freeze(value.map(freeze));
    if (!plain(value)) return value;
    return Object.freeze(Object.fromEntries(
      Object.entries(value).map(([key, child]) => [key, freeze(child)]),
    ));
  }
  function clean(value) {
    return typeof value === "string" ? value.trim().replace(/\s+/gu, " ") : "";
  }
  function tokens(values) {
    return [...new Set((Array.isArray(values) ? values : [])
      .map((value) => clean(value).normalize("NFC").toLowerCase())
      .filter(Boolean))].sort((left, right) => left.localeCompare(right, "en"));
  }
  function rowCompare(left, right) {
    return left.title.localeCompare(right.title, "ko")
      || left.source_path.localeCompare(right.source_path, "ko")
      || left.artifact_id.localeCompare(right.artifact_id, "en");
  }
  function validEntry(entry) {
    return plain(entry)
      && /^prodigy_artifact_[0-9a-f]{24}$/u.test(entry.artifact_id || "")
      && entry.trust_tier === "prodigy_reviewed"
      && entry.canonical_published === false
      && typeof entry.document_path === "string"
      && entry.document_path.startsWith(`${artifactApi.REVIEWED_ROOT}/`)
      && !entry.document_path.startsWith("PARA/RESOURCES/Knowledge/")
      && typeof entry.source_path === "string"
      && typeof entry.source_revision === "string"
      && ["current", "superseded"].includes(entry.status)
      && plain(entry.navigation_manifest);
  }
  function projectRow(entry, sourceRevisions) {
    const tags = tokens(entry.navigation_manifest.tags);
    const headings = [...new Set((entry.navigation_manifest.sections || [])
      .map((section) => clean(section && section.heading))
      .filter(Boolean))].sort((left, right) => left.localeCompare(right, "ko"));
    const indexTerms = tags.length ? tags : headings.map((heading) => heading.normalize("NFC").toLowerCase());
    const observedRevision = clean(sourceRevisions[entry.source_path]);
    const lifecycle = entry.status === "superseded"
      ? "history"
      : observedRevision === entry.source_revision ? "current" : "stale";
    const sourceTitle = entry.source_path.split("/").pop().replace(/\.md$/u, "");
    return {
      artifact_id: entry.artifact_id,
      artifact_receipt_hash: entry.artifact_receipt_hash,
      document_path: entry.document_path,
      document_hash: entry.document_hash,
      document_kind: entry.document_kind,
      title: clean(entry.title),
      purpose: clean(entry.navigation_manifest.purpose),
      source_id: entry.source_id,
      source_path: entry.source_path,
      source_title: sourceTitle,
      source_revision: entry.source_revision,
      observed_source_revision: observedRevision,
      scope: entry.scope,
      reviewed_at: entry.reviewed_at,
      trust_tier: "prodigy_reviewed",
      canonical_published: false,
      lifecycle,
      tags,
      headings,
      index_terms: indexTerms,
      navigation_manifest: entry.navigation_manifest,
      source_outline: entry.source_outline,
      search_text: [
        entry.title,
        entry.navigation_manifest.purpose,
        sourceTitle,
        entry.source_path,
        ...tags,
        ...headings,
      ].map(clean).join(" ").normalize("NFC").toLowerCase(),
    };
  }
  function projectReviewedIndex(snapshot, options = {}) {
    const sourceRevisions = plain(options.source_revisions) ? options.source_revisions : {};
    const rows = (plain(snapshot) && Array.isArray(snapshot.entries) ? snapshot.entries : [])
      .filter(validEntry)
      .map((entry) => projectRow(entry, sourceRevisions))
      .sort(rowCompare);
    const byTerm = new Map();
    for (const row of rows.filter((entry) => entry.lifecycle !== "history")) {
      for (const term of row.index_terms) {
        if (!byTerm.has(term)) byTerm.set(term, []);
        byTerm.get(term).push(row.artifact_id);
      }
    }
    const groups = [...byTerm.entries()]
      .sort(([left], [right]) => left.localeCompare(right, "en"))
      .map(([term, artifactIds]) => freeze({ term, artifact_ids: artifactIds }));
    const related = new Map(rows.map((row) => [row.artifact_id, []]));
    for (const row of rows) {
      const rowTerms = new Set(row.index_terms);
      for (const candidate of rows) {
        if (candidate.artifact_id === row.artifact_id
          || !candidate.index_terms.some((term) => rowTerms.has(term))) continue;
        related.get(row.artifact_id).push(candidate.artifact_id);
      }
      related.get(row.artifact_id).sort((left, right) => left.localeCompare(right, "en"));
    }
    const projectedRows = rows.map((row) => freeze({
      ...row,
      related_artifact_ids: related.get(row.artifact_id),
    }));
    const counts = {
      current: projectedRows.filter((row) => row.lifecycle === "current").length,
      stale: projectedRows.filter((row) => row.lifecycle === "stale").length,
      history: projectedRows.filter((row) => row.lifecycle === "history").length,
      total: projectedRows.length,
    };
    const revisionBody = projectedRows.map((row) => ({
      artifact_id: row.artifact_id,
      artifact_receipt_hash: row.artifact_receipt_hash,
      lifecycle: row.lifecycle,
      observed_source_revision: row.observed_source_revision,
      index_terms: row.index_terms,
    }));
    return freeze({
      index_version: VERSION,
      index_revision: hashApi.sha256(stable(revisionBody)),
      rows: projectedRows,
      groups,
      counts,
      provider_count: 0,
      writer_count: 0,
    });
  }
  function queryReviewedIndex(index, input = {}) {
    if (!plain(index) || index.index_version !== VERSION || !Array.isArray(index.rows)) {
      return freeze({ ok: false, reason: "invalid_reviewed_index", rows: [], provider_count: 0, writer_count: 0 });
    }
    const mode = MODES.includes(input.mode) ? input.mode : "current";
    const query = clean(input.query).normalize("NFC").toLowerCase();
    const term = clean(input.term).normalize("NFC").toLowerCase();
    const rows = index.rows.filter((row) => {
      if (mode !== "all" && row.lifecycle !== mode) return false;
      if (term && !row.index_terms.includes(term)) return false;
      if (query && !row.search_text.includes(query)) return false;
      return true;
    });
    return freeze({
      ok: true,
      status: rows.length ? "ready" : "empty",
      mode,
      query,
      term,
      rows,
      total: rows.length,
      provider_count: 0,
      writer_count: 0,
    });
  }

  const api = freeze({
    VERSION,
    MODES,
    projectReviewedIndex,
    queryReviewedIndex,
  });
  root.ProdigyWikiIndex = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
