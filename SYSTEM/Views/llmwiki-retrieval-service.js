(function (root) {
  "use strict";

  const hashApi = (() => {
    if (root.LLMWikiHash && typeof root.LLMWikiHash.sha256 === "function") return root.LLMWikiHash;
    if (typeof require === "function") {
      try { return require("./llmwiki-hash.js"); } catch (_) { return null; }
    }
    return null;
  })();
  const RETRIEVAL_VERSION = "llmwiki_retrieval_v1";
  const MAX_QUERY_LENGTH = 1024;
  const MAX_SERIALIZED_OPTIONS = 4 * 1024 * 1024;
  const MAX_CANDIDATES = 50;
  const DEFAULT_CANDIDATES = 8;
  const MAX_INDEX_CANDIDATES = 5000;
  const MAX_HINTS = 1000;
  const HASH = /^[0-9a-f]{64}$/u;
  const REASON_ORDER = Object.freeze([
    "structured_field", "lexical_match", "canonical_relation", "embedding_hint", "graph_hint",
  ]);
  const RETRIEVAL_CONTRACTS = new WeakSet();
  const RETRIEVAL_INDEXES = new WeakSet();
  const RETRIEVAL_HINTS = new WeakSet();
  const MAINTENANCE_RECORDS = new WeakSet();

  function plain(value) { return Boolean(value) && typeof value === "object" && !Array.isArray(value); }
  function trim(value) { return typeof value === "string" ? value.trim().normalize("NFC") : ""; }
  function list(value) { return Array.isArray(value) ? value : []; }
  function freeze(value) {
    if (Array.isArray(value)) return Object.freeze(value.map(freeze));
    if (!plain(value)) return value;
    return Object.freeze(Object.fromEntries(Object.entries(value).map(([key, child]) => [key, freeze(child)])));
  }
  function stable(value) {
    if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
    if (!plain(value)) return JSON.stringify(value);
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stable(value[key])}`).join(",")}}`;
  }
  function sha256(value) {
    if (!hashApi || typeof hashApi.sha256 !== "function") return "";
    try { return hashApi.sha256(String(value)); } catch (_) { return ""; }
  }
  function failure(field, reason) {
    return freeze({ ok: false, status: "error", field, reason, writer_count: 0, provider_count: 0 });
  }
  function trustedModule(path, globalName) {
    if (typeof require === "function") {
      try { return require(path); } catch (_) { /* optional browser dependency */ }
    }
    try { return root[globalName] || null; } catch (_) { return null; }
  }
  function objectLike(value) {
    return Boolean(value) && (typeof value === "object" || typeof value === "function");
  }
  function createRetrievalContract(serialized) {
    if (objectLike(serialized) && RETRIEVAL_CONTRACTS.has(serialized)) return Object.freeze({ ok: true, value: serialized });
    if (typeof serialized !== "string") return failure("options", "serialized_options_required");
    if (!serialized || serialized.length > MAX_SERIALIZED_OPTIONS) return failure("options", "serialized_options_limit_exceeded");
    let parsed;
    try { parsed = JSON.parse(serialized); } catch (_) { return failure("options", "invalid_serialized_options"); }
    if (!plain(parsed)) return failure("options", "invalid_serialized_options");
    const contract = freeze(parsed);
    RETRIEVAL_CONTRACTS.add(contract);
    if (plain(contract.index)) RETRIEVAL_INDEXES.add(contract.index);
    if (Array.isArray(contract.embedding_hints)) RETRIEVAL_HINTS.add(contract.embedding_hints);
    if (Array.isArray(contract.graph_hints)) RETRIEVAL_HINTS.add(contract.graph_hints);
    return Object.freeze({ ok: true, value: contract });
  }
  function createMaintenanceRetrievalRecord(serialized) {
    if (objectLike(serialized) && MAINTENANCE_RECORDS.has(serialized)) return Object.freeze({ ok: true, value: serialized });
    if (typeof serialized !== "string") return failure("maintenance_retrieval", "serialized_record_required");
    if (!serialized || serialized.length > MAX_SERIALIZED_OPTIONS) return failure("maintenance_retrieval", "record_limit_exceeded");
    let input;
    try { input = JSON.parse(serialized); } catch (_) { return failure("maintenance_retrieval", "malformed_record"); }
    if (!plain(input) || !HASH.test(trim(input.snapshot_revision)) || !Array.isArray(input.candidates) || input.candidates.length > MAX_INDEX_CANDIDATES) {
      return failure("maintenance_retrieval", "malformed_record");
    }
    const candidates = [];
    const seen = new Set();
    for (const [index, item] of input.candidates.entries()) {
      if (!plain(item)) return failure(`maintenance_retrieval.candidates.${index}`, "malformed_candidate");
      const documentId = trim(item.document_id);
      const revision = trim(item.canonical_revision);
      if (!documentId || !HASH.test(revision) || seen.has(documentId)) return failure(`maintenance_retrieval.candidates.${index}`, "malformed_candidate");
      seen.add(documentId);
      candidates.push({ document_id: documentId, canonical_revision: revision });
    }
    if (input.denied_source_ids !== undefined && !Array.isArray(input.denied_source_ids)) return failure("maintenance_retrieval.denied_source_ids", "malformed_denied_sources");
    const hintStatus = trim(input.hint_status || "advisory").toLocaleLowerCase("en-US");
    if (!["advisory", "stale", "denied", "poisoned"].includes(hintStatus)) return failure("maintenance_retrieval.hint_status", "invalid_hint_status");
    const value = freeze({
      retrieval_version: RETRIEVAL_VERSION,
      snapshot_revision: trim(input.snapshot_revision),
      candidates: candidates.sort((a, b) => a.document_id.localeCompare(b.document_id, "en")),
      denied_source_ids: [...new Set(list(input.denied_source_ids).map(trim).filter(Boolean))].sort((a, b) => a.localeCompare(b, "en")),
      hint_status: hintStatus,
      hints_authoritative: false,
      writer_count: 0,
      provider_count: 0,
    });
    MAINTENANCE_RECORDS.add(value);
    return Object.freeze({ ok: true, value });
  }
  function isMaintenanceRetrievalRecord(value) {
    return objectLike(value) && MAINTENANCE_RECORDS.has(value);
  }
  function rowsFor(snapshot) {
    return Array.isArray(snapshot.rows) ? snapshot.rows : Array.isArray(snapshot.documents) ? snapshot.documents : [];
  }
  function sourceIds(row) {
    return [...new Set([
      ...list(row.source_ids).map(trim),
      ...list(row.citations).map((item) => trim(item && item.source_id)),
    ].filter(Boolean))].sort((a, b) => a.localeCompare(b, "en"));
  }
  function sourcePolicy(row) {
    const supplied = plain(row.source_policy) ? row.source_policy : {};
    return freeze({
      decision: trim(supplied.decision || "allowed").toLocaleLowerCase("en-US"),
      ...(trim(supplied.policy_id) ? { policy_id: trim(supplied.policy_id) } : {}),
      source_ids: sourceIds(row),
    });
  }
  function denied(row, deniedIds) {
    const policy = sourcePolicy(row);
    return policy.decision !== "allowed" || policy.source_ids.some((sourceId) => deniedIds.has(sourceId));
  }
  function terms(value) {
    return [...new Set(trim(value).toLocaleLowerCase("ko-KR").split(/[^\p{L}\p{N}_-]+/u).filter(Boolean))]
      .sort((a, b) => a.localeCompare(b, "en"));
  }
  function normalizeStructured(value) {
    if (value === undefined) return { domain: "", topics: [], types: [] };
    if (!plain(value)) return failure("structured", "invalid_structured_filter");
    if (value.topics !== undefined && !Array.isArray(value.topics)) return failure("structured.topics", "invalid_structured_topics");
    if (value.types !== undefined && !Array.isArray(value.types)) return failure("structured.types", "invalid_structured_types");
    return {
      domain: trim(value.domain),
      topics: [...new Set(list(value.topics).map(trim).filter(Boolean))].sort((a, b) => a.localeCompare(b, "en")),
      types: [...new Set(list(value.types).map(trim).filter(Boolean))].sort((a, b) => a.localeCompare(b, "en")),
    };
  }
  function structuredMatch(row, structured) {
    const domain = trim(row.domain || row.knowledge_domain);
    const rowTopics = list(row.topics || row.knowledge_topics).map(trim);
    return (!structured.domain || domain === structured.domain)
      && (structured.topics.length === 0 || structured.topics.every((topic) => rowTopics.includes(topic)))
      && (structured.types.length === 0 || structured.types.includes(trim(row.type)));
  }
  function normalizeHints(value, field) {
    if (value === undefined) return [];
    if (!Array.isArray(value) || !RETRIEVAL_HINTS.has(value)) return failure(field, `untrusted_${field}`);
    if (value.length > MAX_HINTS) return failure(field, `${field}_limit_exceeded`);
    const ids = new Set();
    for (const item of value) {
      const id = plain(item) ? trim(item.document_id || item.id) : "";
      if (id) ids.add(id);
    }
    return [...ids].sort((a, b) => a.localeCompare(b, "en"));
  }
  function indexMap(value) {
    if (value === undefined) return new Map();
    if (!plain(value) || !RETRIEVAL_INDEXES.has(value) || !Array.isArray(value.candidates)) return failure("index", "untrusted_index");
    if (value.candidates.length > MAX_INDEX_CANDIDATES) return failure("index.candidates", "index_limit_exceeded");
    const result = new Map();
    for (const item of value.candidates) {
      if (!plain(item)) continue;
      const id = trim(item.document_id || item.id);
      if (id && !result.has(id)) result.set(id, trim(item.canonical_revision || item.row_revision || item.revision));
    }
    return result;
  }
  function validateContract(contract, query, snapshot) {
    if (!objectLike(contract) || !RETRIEVAL_CONTRACTS.has(contract)) return failure("options", "untrusted_retrieval_contract");
    const maxCandidates = contract.max_candidates === undefined ? DEFAULT_CANDIDATES : contract.max_candidates;
    if (!Number.isInteger(maxCandidates) || maxCandidates < 1 || maxCandidates > MAX_CANDIDATES) return failure("max_candidates", "invalid_candidate_limit");
    if (!plain(snapshot) || !HASH.test(trim(snapshot.snapshot_revision)) || !Array.isArray(snapshot.rows || snapshot.documents)) return failure("snapshot", "invalid_snapshot");
    if (trim(contract.snapshot_revision) !== trim(snapshot.snapshot_revision)) return failure("snapshot_revision", "stale_snapshot");
    if (trim(snapshot.current_revision || snapshot.snapshot_revision) !== trim(snapshot.snapshot_revision)) return failure("snapshot", "stale_snapshot");
    const structured = normalizeStructured(contract.structured);
    if (structured.ok === false) return structured;
    const index = indexMap(contract.index);
    if (index.ok === false) return index;
    const embeddingHints = normalizeHints(contract.embedding_hints, "embedding_hints");
    if (embeddingHints.ok === false) return embeddingHints;
    const graphHints = normalizeHints(contract.graph_hints, "graph_hints");
    if (graphHints.ok === false) return graphHints;
    if (contract.denied_source_ids !== undefined && !Array.isArray(contract.denied_source_ids)) return failure("denied_source_ids", "invalid_denied_sources");
    return { query, contract, maxCandidates, structured, index, embeddingHints, graphHints };
  }
  function canonicalRelations(rows, ontologyProjection) {
    const raw = rows.flatMap((row) => list(row.relations).map((relation) => ({
      from_document_id: trim(row.document_id),
      target_document_id: trim(relation && relation.target_document_id),
      relation: trim(relation && relation.relation),
      status: trim(relation && relation.status),
    })));
    if (ontologyProjection && typeof ontologyProjection.canonicalRelationsForRetrieval === "function") {
      try { return ontologyProjection.canonicalRelationsForRetrieval(raw); } catch (_) { return []; }
    }
    return [];
  }
  function lexicalIds(queryReadOnly, query, snapshot) {
    if (!queryReadOnly || typeof queryReadOnly.queryRead !== "function") return null;
    let result;
    try {
      result = queryReadOnly.queryRead({ query, mode: "verified", scope: { types: ["knowledge", "permanent_note"] }, snapshot });
    } catch (_) {
      return failure("query", "query_read_failed");
    }
    if (!result || result.ok === false) return failure(result && result.field || "query", result && result.reason || "query_read_failed");
    const envelope = result.ok === true && plain(result.value) ? result.value : result;
    if (!plain(envelope) || !Array.isArray(envelope.results)) return failure("query", "invalid_query_result");
    if (envelope.status === "stale_snapshot") return failure("snapshot", "stale_snapshot");
    return new Set(envelope.results.map((item) => trim(item && item.document_id)).filter(Boolean));
  }

  function create(readService) {
    const readServiceApi = trustedModule("./llmwiki-wiki-read-service.js", "LLMWikiWikiReadService");
    const queryReadOnly = trustedModule("./llmwiki-query-readonly.js", "LLMWikiQueryReadOnly");
    const ontologyProjection = trustedModule("./llmwiki-ontology-projection.js", "OntologyProjection");
    const trustedReadService = Boolean(readServiceApi && typeof readServiceApi.isRetrievalReadService === "function"
      && readServiceApi.isRetrievalReadService(readService));

    async function retrieve(queryValue, serializedOptions) {
      if (typeof queryValue !== "string") return failure("query", "primitive_query_required");
      const query = trim(queryValue);
      if (!query) return failure("query", "empty_query");
      if (query.length > MAX_QUERY_LENGTH) return failure("query", "query_too_large");
      const built = createRetrievalContract(serializedOptions);
      if (built.ok === false) return built;
      if (!hashApi || typeof hashApi.sha256 !== "function") return failure("hash", "hash_unavailable");
      if (!trustedReadService) return failure("readService", "canonical_read_service_required");
      let snapshot;
      try { snapshot = readService.getRetrievalSnapshot(); } catch (_) { return failure("snapshot", "canonical_read_failed"); }
      if (!readServiceApi.isRetrievalSnapshot(snapshot)) return failure("snapshot", "untrusted_canonical_snapshot");
      const normalized = validateContract(built.value, query, snapshot);
      if (normalized.ok === false) return normalized;
      const lexical = lexicalIds(queryReadOnly, query, snapshot);
      if (lexical && lexical.ok === false) return lexical;
      const deniedIds = new Set(list(normalized.contract.denied_source_ids).map(trim).filter(Boolean));
      const rows = rowsFor(snapshot).filter((row) => plain(row) && ["knowledge", "permanent_note"].includes(trim(row.type)));
      const relations = canonicalRelations(rows, ontologyProjection);
      const relationIds = new Set(relations.flatMap((item) => [item.from_document_id, item.target_document_id]));
      const embeddingIds = new Set(normalized.embeddingHints);
      const graphIds = new Set(normalized.graphHints);
      const shortlist = [];
      for (const row of rows) {
        const documentId = trim(row.document_id);
        const canonicalRevision = trim(row.row_revision || row.revision);
        if (!documentId || !HASH.test(canonicalRevision) || denied(row, deniedIds)) continue;
        const reasons = [];
        const hasStructured = Boolean(normalized.structured.domain || normalized.structured.topics.length || normalized.structured.types.length);
        if (hasStructured && structuredMatch(row, normalized.structured)) reasons.push("structured_field");
        if (lexical && lexical.has(documentId)) reasons.push("lexical_match");
        if (relationIds.has(documentId)) reasons.push("canonical_relation");
        if (embeddingIds.has(documentId)) reasons.push("embedding_hint");
        if (graphIds.has(documentId)) reasons.push("graph_hint");
        if (reasons.length) shortlist.push({ row, documentId, canonicalRevision, reasons });
      }

      const rechecked = [];
      let staleRechecked = false;
      const readerCapability = readService.getRevalidationReaderCapability();
      for (const item of shortlist) {
        const indexedRevision = normalized.index.get(item.documentId) || item.canonicalRevision;
        let checked;
        try {
          const candidate = readService.createRevalidationCandidate(
            item.documentId,
            trim(item.row.path),
            trim(snapshot.snapshot_revision),
            indexedRevision,
          );
          checked = await readService.revalidateCandidate(candidate, readerCapability);
        } catch (_) {
          checked = null;
        }
        if (!readServiceApi.isRevalidatedCandidate(checked) || checked.ok !== true || !plain(checked.row)) continue;
        const row = checked.row;
        if (denied(row, deniedIds)) continue;
        const currentRevision = trim(checked.canonical_revision || row.row_revision || row.revision);
        if (!HASH.test(currentRevision)) continue;
        const wasStale = Boolean(indexedRevision) && indexedRevision !== currentRevision;
        staleRechecked = staleRechecked || wasStale || checked.stale_rechecked === true;
        const reasons = REASON_ORDER.filter((reason) => item.reasons.includes(reason));
        const score = reasons.reduce((total, reason) => total + ({ structured_field: 40, lexical_match: 30, canonical_relation: 20, embedding_hint: 5, graph_hint: 5 }[reason] || 0), 0);
        rechecked.push({ row, currentRevision, wasStale, reasons, score });
      }
      rechecked.sort((left, right) => right.score - left.score
        || trim(right.row.updated).localeCompare(trim(left.row.updated), "en")
        || trim(left.row.path).localeCompare(trim(right.row.path), "en")
        || trim(left.row.document_id).localeCompare(trim(right.row.document_id), "en"));
      const candidates = rechecked.slice(0, normalized.maxCandidates).map((item, index) => freeze({
        rank: index + 1,
        document_id: trim(item.row.document_id),
        path: trim(item.row.path),
        type: trim(item.row.type),
        title: trim(item.row.title),
        canonical_revision: item.currentRevision,
        snapshot_revision: trim(snapshot.snapshot_revision),
        source_policy: sourcePolicy(item.row),
        selection_reasons: item.reasons,
        stale_rechecked: item.wasStale,
      }));
      const identity = {
        version: RETRIEVAL_VERSION,
        query,
        snapshot_revision: trim(snapshot.snapshot_revision),
        candidates: candidates.map((item) => [item.document_id, item.canonical_revision, item.selection_reasons]),
      };
      return freeze({
        ok: true,
        status: candidates.length ? "ok" : "empty",
        retrieval_version: RETRIEVAL_VERSION,
        snapshot_revision: trim(snapshot.snapshot_revision),
        candidates,
        candidate_count: candidates.length,
        max_candidates: normalized.maxCandidates,
        stale_rechecked: staleRechecked,
        denied_count: 0,
        hints_authoritative: false,
        poisoned_hint_authoritative: false,
        writer_count: 0,
        provider_count: 0,
        order_key: sha256(stable(identity)),
      });
    }
    return Object.freeze({ retrieve });
  }

  async function retrieve(query, serializedOptions, readService) {
    return create(readService).retrieve(query, serializedOptions);
  }

  const api = Object.freeze({
    RETRIEVAL_VERSION,
    MAX_QUERY_LENGTH,
    MAX_SERIALIZED_OPTIONS,
    MAX_CANDIDATES,
    MAX_INDEX_CANDIDATES,
    MAX_HINTS,
    createRetrievalContract,
    createMaintenanceRetrievalRecord,
    isMaintenanceRetrievalRecord,
    create,
    retrieve,
  });
  root.LLMWikiRetrievalService = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
