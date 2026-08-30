(function (root) {
  "use strict";

  const hashApi = root.LLMWikiHash || (typeof require === "function" ? require("./llmwiki-hash.js") : null);
  if (!hashApi || typeof hashApi.sha256 !== "function") throw new Error("LLMWikiHash is required.");

  const PLAN_VERSION = "llmwiki_document_mutation_plan_v1";

  function plain(value) { return Boolean(value) && typeof value === "object" && !Array.isArray(value); }
  function freeze(value) {
    if (Array.isArray(value)) return Object.freeze(value.map(freeze));
    if (!plain(value)) return value;
    return Object.freeze(Object.fromEntries(Object.entries(value).map(([key, child]) => [key, freeze(child)])));
  }
  function sha(value) { return hashApi.sha256(String(value)); }
  function validCandidate(candidate) {
    return plain(candidate) && typeof candidate.candidate_id === "string" && typeof candidate.path === "string"
      && candidate.path.startsWith("ZETA/CANDIDATES/") && candidate.path.endsWith(".md")
      && typeof candidate.before_bytes === "string" && /^[0-9a-f]{64}$/u.test(candidate.revision)
      && sha(candidate.before_bytes) === candidate.revision;
  }
  function compiledBody(document) {
    const lines = String(document.body || "").split("\n");
    if (/^# /u.test(lines[0] || "")) lines.shift();
    while (lines[0] === "") lines.shift();
    return lines.join("\n").trim();
  }

  function planDocumentMutation(input) {
    if (!plain(input) || !plain(input.document) || input.document.document_kind !== "topic_article"
      || typeof input.document.page_id !== "string" || typeof input.document.body !== "string"
      || !Array.isArray(input.document.matched_candidate_ids) || !Array.isArray(input.candidate_documents)
      || input.candidate_documents.some((candidate) => !validCandidate(candidate))) {
      return freeze({ ok: false, reason: "invalid_document_mutation_input" });
    }
    const ids = [...new Set(input.document.matched_candidate_ids)];
    const rows = ids.map((id) => input.candidate_documents.find((candidate) => candidate.candidate_id === id));
    if (rows.some((row) => !row)) return freeze({ ok: false, reason: "candidate_snapshot_required" });
    if (rows.length === 0) {
      return freeze({ ok: true, value: freeze({
        plan_version: PLAN_VERSION,
        kind: "create",
        page_id: input.document.page_id,
        title: input.document.title,
        after_bytes: input.document.body,
      }) });
    }
    if (rows.length > 1) {
      return freeze({ ok: true, value: freeze({
        plan_version: PLAN_VERSION,
        kind: "hold",
        reason: "explicit_merge_destination_required",
        page_id: input.document.page_id,
        candidate_ids: rows.map((row) => row.candidate_id),
        candidate_paths: rows.map((row) => row.path),
      }) });
    }
    const target = rows[0];
    const startMarker = `<!-- llmwiki-managed:start ${input.document.page_id} -->`;
    const endMarker = `<!-- llmwiki-managed:end ${input.document.page_id} -->`;
    const startMatches = target.before_bytes.split(startMarker).length - 1;
    const endMatches = target.before_bytes.split(endMarker).length - 1;
    if (startMatches === 0 && endMatches === 0) {
      return freeze({ ok: true, value: freeze({
        plan_version: PLAN_VERSION, kind: "hold", reason: "managed_region_required",
        page_id: input.document.page_id, target,
      }) });
    }
    const start = target.before_bytes.indexOf(startMarker);
    const end = target.before_bytes.indexOf(endMarker);
    if (startMatches !== 1 || endMatches !== 1 || start < 0 || end < start + startMarker.length) {
      return freeze({ ok: true, value: freeze({
        plan_version: PLAN_VERSION, kind: "hold", reason: "managed_region_invalid",
        page_id: input.document.page_id, target,
      }) });
    }
    const addition = compiledBody(input.document);
    const region = `${startMarker}\n\n## ${input.document.title}\n\n${addition}\n\n${endMarker}`;
    const afterBytes = `${target.before_bytes.slice(0, start)}${region}${target.before_bytes.slice(end + endMarker.length)}`;
    if (afterBytes === target.before_bytes) {
      return freeze({ ok: true, value: freeze({
        plan_version: PLAN_VERSION, kind: "no_change", reason: "managed_region_unchanged",
        page_id: input.document.page_id, target,
      }) });
    }
    return freeze({ ok: true, value: freeze({
      plan_version: PLAN_VERSION,
      kind: "update",
      page_id: input.document.page_id,
      target,
      before_bytes: target.before_bytes,
      before_revision: target.revision,
      after_bytes: afterBytes,
      after_revision: sha(afterBytes),
      managed_region: freeze({ start_marker: startMarker, end_marker: endMarker }),
    }) });
  }

  const api = freeze({ PLAN_VERSION, planDocumentMutation });
  root.LLMWikiDocumentMergePlanner = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
