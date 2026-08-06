(function (root) {
  "use strict";

  const crypto = typeof require === "function" ? require("node:crypto") : null;
  const QUERY_VERSION = "llmwiki_query_read_v1";
  const MODES = Object.freeze(["verified", "literature", "candidate", "proposal", "all"]);
  const TYPES = Object.freeze(["knowledge", "permanent_note", "literature_note", "knowledge_candidate"]);
  const TYPE_MODE = Object.freeze({
    knowledge: "verified",
    permanent_note: "verified",
    literature_note: "literature",
    knowledge_candidate: "candidate",
  });
  const TRUST = Object.freeze({
    knowledge: "verified",
    permanent_note: "legacy_verified",
    literature_note: "supporting_material",
    knowledge_candidate: "pending_candidate",
    proposal: "proposal_unverified",
  });
  const TYPE_RANK = Object.freeze({ knowledge: 0, permanent_note: 1, literature_note: 2, knowledge_candidate: 3, proposal: 4 });
  const HASH = /^[0-9a-f]{64}$/u;

  function plain(value) { return Boolean(value) && typeof value === "object" && !Array.isArray(value); }
  function trim(value) { return typeof value === "string" ? value.trim() : ""; }
  function freeze(value) {
    if (Array.isArray(value)) return Object.freeze(value.map(freeze));
    if (!plain(value)) return value;
    return Object.freeze(Object.fromEntries(Object.entries(value).map(([key, item]) => [key, freeze(item)])));
  }
  function stable(value) {
    if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
    if (!plain(value)) return JSON.stringify(value);
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stable(value[key])}`).join(",")}}`;
  }
  function sha256(value) {
    if (!crypto) throw new Error("crypto unavailable");
    return crypto.createHash("sha256").update(String(value), "utf8").digest("hex");
  }
  function failure(field, reason) { return freeze({ ok: false, field, reason, writer_count: 0 }); }
  function safePath(value) {
    const path = trim(value).replace(/\\/gu, "/");
    if (!path || path.startsWith("/") || /^[A-Za-z]:/u.test(path) || path.includes("[[") || path.includes("]]")) return null;
    return path.split("/").some((part) => part === "." || part === "..") ? null : path;
  }
  function safeLocator(value) {
    const locator = trim(value);
    const pathPart = locator.split("#", 1)[0];
    return locator && !/[\u0000-\u001f\u007f]/u.test(locator) && safePath(pathPart) ? locator : null;
  }
  function list(value) { return Array.isArray(value) ? value : []; }
  function uniqSorted(values) {
    return [...new Set(values.map(trim).filter(Boolean))].sort((a, b) => a.localeCompare(b, "en"));
  }
  function normalizeTerms(query) {
    return uniqSorted(trim(query).normalize("NFC").toLocaleLowerCase("ko-KR").split(/[^\p{L}\p{N}_-]+/u));
  }
  function normalizeScope(scope, mode) {
    if (!plain(scope)) return failure("scope", "invalid_scope");
    const paths = scope.paths === undefined ? [] : list(scope.paths).map(safePath);
    if (paths.some((item) => item === null)) return failure("scope.paths", "invalid_scope_path");
    const rawTypes = scope.types === undefined ? defaultTypes(mode) : list(scope.types).map(trim);
    if ((mode !== "proposal" && rawTypes.length === 0) || rawTypes.some((type) => !TYPES.includes(type))) return failure("scope.types", "invalid_scope_type");
    const proposalIds = scope.proposal_ids === undefined ? [] : uniqSorted(list(scope.proposal_ids));
    return freeze({ paths: uniqSorted(paths), types: uniqSorted(rawTypes), proposal_ids: proposalIds });
  }
  function defaultTypes(mode) {
    if (mode === "verified") return ["knowledge", "permanent_note"];
    if (mode === "literature") return ["literature_note"];
    if (mode === "candidate") return ["knowledge_candidate"];
    if (mode === "proposal") return [];
    return [...TYPES];
  }
  function normalizeSnapshot(snapshot) {
    if (!plain(snapshot) || !HASH.test(trim(snapshot.snapshot_revision)) || !Array.isArray(snapshot.documents)) {
      return failure("snapshot", "invalid_snapshot");
    }
    const current = trim(snapshot.current_revision || snapshot.snapshot_revision);
    if (!HASH.test(current)) return failure("snapshot.current_revision", "invalid_snapshot");
    return { snapshot_revision: trim(snapshot.snapshot_revision), current_revision: current, documents: snapshot.documents, proposals: list(snapshot.proposals), unavailable_source_ids: uniqSorted(list(snapshot.unavailable_source_ids)), conflicts: list(snapshot.conflicts) };
  }
  function citationsFor(row) {
    const result = [];
    for (const [index, item] of list(row.citations).entries()) {
      if (!plain(item)) return failure(`citations.${index}`, "malformed_citation");
      const sourceId = trim(item.source_id);
      const locator = safeLocator(item.locator);
      if (!sourceId || !locator) return failure(`citations.${index}.locator`, "invalid_locator");
      result.push({ source_id: sourceId, locator });
    }
    result.sort((a, b) => `${a.source_id}:${a.locator}`.localeCompare(`${b.source_id}:${b.locator}`, "en"));
    return result;
  }
  function sourceIdsFor(row, citations) {
    return uniqSorted([...list(row.source_ids), ...citations.map((item) => item.source_id)]);
  }
  function textFor(row) {
    return [row.title, row.statement, row.body, row.summary].map(trim).join("\n").toLocaleLowerCase("ko-KR");
  }
  function score(row, terms) {
    const title = trim(row.title).toLocaleLowerCase("ko-KR");
    const text = textFor(row);
    let total = 0;
    for (const term of terms) {
      if (!term) continue;
      if (title.includes(term)) total += 4;
      const matches = text.split(term).length - 1;
      total += matches;
    }
    return total;
  }
  function inScope(row, scope, mode) {
    const type = trim(row.type);
    const path = safePath(row.path || "");
    if (!type || !path || !scope.types.includes(type)) return false;
    if (mode !== "all" && TYPE_MODE[type] !== mode) return false;
    return scope.paths.length === 0 || scope.paths.some((prefix) => path.startsWith(prefix));
  }
  function proposalInScope(row, scope, mode) {
    if (mode !== "proposal" && mode !== "all") return false;
    const id = trim(row.proposal_id);
    return id && (scope.proposal_ids.length === 0 || scope.proposal_ids.includes(id));
  }
  function resultFrom(row, context, rank) {
    const proposal = context.kind === "proposal";
    const type = proposal ? "proposal" : trim(row.type);
    const citations = citationsFor(row);
    if (citations.ok === false) return citations;
    const sourceIds = sourceIdsFor(row, citations);
    const identity = stable({ snapshot: context.snapshot_revision, mode: context.mode, query: context.query, id: proposal ? row.proposal_id : row.document_id, path: row.path || "", citations });
    return freeze({
      result_id: `result_${sha256(identity).slice(0, 24)}`,
      rank,
      document_id: proposal ? trim(row.proposal_id) : trim(row.document_id),
      type,
      mode: proposal ? "proposal" : TYPE_MODE[type],
      trust_status: proposal ? TRUST.proposal : TRUST[type],
      canonical: type === "knowledge" || type === "permanent_note",
      status: proposal ? trim(row.status || "proposed") : trim(row.status || "active"),
      title: trim(row.title),
      statement: trim(row.statement),
      path: trim(row.path),
      source_ids: sourceIds,
      citations,
    });
  }
  function rankedRows(rows, terms) {
    return rows.map((row, index) => ({ row, index, score: score(row, terms) }))
      .filter((item) => item.score > 0 || terms.length === 0)
      .sort((a, b) => TYPE_RANK[trim(a.row.type) || "proposal"] - TYPE_RANK[trim(b.row.type) || "proposal"]
        || b.score - a.score
        || trim(b.row.updated).localeCompare(trim(a.row.updated), "en")
        || trim(a.row.path || a.row.proposal_id).localeCompare(trim(b.row.path || b.row.proposal_id), "en"));
  }
  function statusFor(mode, results, snapshot) {
    const sources = new Set(results.flatMap((item) => item.source_ids));
    if (snapshot.unavailable_source_ids.some((id) => sources.has(id))) return "unavailable_source";
    if (snapshot.conflicts.length && results.some((result) => result.trust_status === "verified" || result.trust_status === "legacy_verified")) return "conflict";
    if (mode === "proposal" && results.length > 1) return "ambiguous_proposal";
    if (results.length === 0) return mode === "verified" ? "no_verified_answer" : "empty";
    return "ok";
  }
  function envelope(input, scope, snapshot, results, status) {
    const base = {
      query_version: QUERY_VERSION,
      snapshot_revision: snapshot.snapshot_revision,
      scope,
      mode: input.mode,
      query: trim(input.query),
      status,
      writer_count: 0,
      results,
      state: {
        stale: status === "stale_snapshot",
        unavailable: status === "unavailable_source",
        conflict: status === "conflict",
      },
    };
    return freeze({ ...base, envelope_hash: sha256(stable(base)) });
  }
  function queryRead(input) {
    if (!plain(input)) return failure("query", "malformed_query");
    const query = trim(input.query);
    if (!query) return failure("query", "empty_query");
    const mode = trim(input.mode || "verified");
    if (!MODES.includes(mode)) return failure("mode", "unknown_mode");
    const scope = normalizeScope(input.scope, mode);
    if (scope.ok === false) return scope;
    const snapshot = normalizeSnapshot(input.snapshot);
    if (snapshot.ok === false) return snapshot;
    if (snapshot.snapshot_revision !== snapshot.current_revision) {
      return { ok: true, value: envelope({ query, mode }, scope, snapshot, [], "stale_snapshot") };
    }
    const terms = normalizeTerms(query);
    const docs = rankedRows(snapshot.documents.filter((row) => inScope(row, scope, mode)), terms);
    const proposals = rankedRows(snapshot.proposals.filter((row) => proposalInScope(row, scope, mode)), terms);
    const rows = [];
    for (const [index, item] of [...docs, ...proposals].entries()) {
      const result = resultFrom(item.row, { snapshot_revision: snapshot.snapshot_revision, mode, query, kind: item.row.proposal_id ? "proposal" : "document" }, index + 1);
      if (result.ok === false) return result;
      rows.push(result);
    }
    return { ok: true, value: envelope({ query, mode }, scope, snapshot, rows, statusFor(mode, rows, snapshot)) };
  }
  function serializeEnvelope(value) { return stable(value); }

  const api = freeze({ QUERY_VERSION, MODES, queryRead, serializeEnvelope });
  root.LLMWikiQueryReadOnly = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
