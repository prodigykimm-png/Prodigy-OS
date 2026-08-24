(function initOntologyProjection(root) {
  "use strict";

  const hashApi = (() => {
    if (root.LLMWikiHash && typeof root.LLMWikiHash.sha256 === "function") return root.LLMWikiHash;
    if (typeof require === "function") {
      try { return require("./llmwiki-hash.js"); } catch (_) { return null; }
    }
    return null;
  })();
  const PROJECTION_VERSION = "prodigy_ontology_projection_v1";
  const ID = /^[a-z][a-z0-9_-]{2,127}$/u;
  const HASH = /^[0-9a-f]{64}$/u;
  const SAFE_REF = /^[A-Za-z0-9][A-Za-z0-9._:/# -]{0,255}$/u;
  const CONFIDENCE = Object.freeze(["explicit", "inferred", "low"]);
  const ENTITY_KINDS = Object.freeze(["concept", "person", "place", "event", "object", "evidence"]);
  const LINK_RELATIONS = Object.freeze(["related_to", "supports", "contradicts", "supersedes", "references", "derived_from", "influences", "mentions"]);
  const FORBIDDEN_CANONICAL_TYPES = new Set(["llmwiki"]);
  const WRITE_COUNTERS = Object.freeze({
    canonical: 0,
    candidate: 0,
    index: 0,
    memory: 0,
    feedback: 0,
    git: 0,
    validation_workspace: 0,
    capture: 0,
  });

  function plain(value) {
    return Boolean(value) && typeof value === "object" && !Array.isArray(value);
  }

  function trim(value) {
    return typeof value === "string" ? value.trim() : "";
  }

  function list(value) {
    return Array.isArray(value) ? value : [];
  }

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
    if (!hashApi || typeof hashApi.sha256 !== "function") return "";
    try { return hashApi.sha256(String(value)); } catch (_) { return ""; }
  }

  function ok(value) {
    return freeze({ ok: true, value });
  }

  function fail(field, reason, extras = {}) {
    return freeze({ ok: false, field, reason, write_counters: zeroWriteCounters(), ...(plain(extras) ? extras : {}) });
  }

  function zeroWriteCounters() {
    return WRITE_COUNTERS;
  }

  function uniqSorted(values) {
    return [...new Set(list(values).map(trim).filter(Boolean))].sort();
  }

  function validId(value, field) {
    const id = trim(value);
    return ID.test(id) ? id : fail(field, `invalid_${field.split(".").pop()}`);
  }

  function validHash(value, field) {
    const hash = trim(value);
    return HASH.test(hash) ? hash : fail(field, `invalid_${field.split(".").pop()}`);
  }

  function safeLocator(value, field) {
    const locator = trim(value);
    if (!locator) return fail(field, "locator_required");
    if (
      locator.startsWith("/") ||
      locator.startsWith(".") ||
      locator.includes("\\") ||
      locator.includes("[[") ||
      locator.includes("]]") ||
      /(^|\/)\.\.?($|\/)/u.test(locator) ||
      /[\u0000-\u001f\u007f]/u.test(locator)
    ) return fail(field, "invalid_locator");
    return locator;
  }

  function safeRef(value, field) {
    const ref = trim(value);
    if (!SAFE_REF.test(ref)) return fail(field, `invalid_${field.split(".").pop()}`);
    if (ref.includes("[[") || ref.includes("]]") || ref.includes("\0") || /(^|\/)\.\.?($|\/)/u.test(ref)) {
      return fail(field, `invalid_${field.split(".").pop()}`);
    }
    return ref;
  }

  function validUrl(value, field) {
    const url = trim(value);
    if (!url) return null;
    try {
      const parsed = new URL(url);
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return fail(field, "invalid_source_url");
      return parsed.href;
    } catch (_error) {
      return fail(field, "invalid_source_url");
    }
  }

  function validSourceIds(value, sourceMap, field) {
    const ids = uniqSorted(value);
    if (ids.length === 0) return fail(field, "source_id_required");
    for (const id of ids) {
      if (!ID.test(id)) return fail(field, "invalid_source_id");
      if (!sourceMap.has(id)) return fail(field, "source_not_supplied", { source_id: id });
    }
    return ids;
  }

  function citationFor(source) {
    return freeze({
      source_id: source.source_id,
      content_hash: source.content_hash,
      locator: source.locator,
      ...(source.source_url ? { source_url: source.source_url } : {}),
    });
  }

  function citationsFor(sourceIds, sourceMap) {
    return sourceIds.map((sourceId) => citationFor(sourceMap.get(sourceId)));
  }

  function projectionId(prefix, payload) {
    return `${prefix}_${sha256(stable(payload)).slice(0, 24)}`;
  }

  function normalizeSources(input) {
    if (!Array.isArray(input.sources) || input.sources.length === 0) return fail("sources", "source_required");
    const sources = new Map();
    for (const [index, raw] of input.sources.entries()) {
      if (!plain(raw)) return fail(`sources.${index}`, "malformed_source");
      const sourceId = validId(raw.source_id, "source_id");
      if (plain(sourceId)) return sourceId;
      const contentHash = validHash(raw.content_hash, "content_hash");
      if (plain(contentHash)) return contentHash;
      const locator = safeLocator(raw.locator, "locator");
      if (plain(locator)) return locator;
      const sourceUrl = validUrl(raw.source_url, "source_url");
      if (plain(sourceUrl)) return sourceUrl;
      const normalized = freeze({ source_id: sourceId, content_hash: contentHash, locator, ...(sourceUrl ? { source_url: sourceUrl } : {}) });
      if (sources.has(sourceId) && stable(sources.get(sourceId)) !== stable(normalized)) return fail("sources", "duplicate_conflicting_source", { source_id: sourceId });
      sources.set(sourceId, normalized);
    }
    return sources;
  }

  function normalizeStableRecords(records, sourceMap, spec) {
    const output = new Map();
    for (const [index, raw] of list(records).entries()) {
      if (!plain(raw)) return fail(`${spec.field}.${index}`, `malformed_${spec.singular}`);
      const stableId = safeRef(raw[spec.idField], `${spec.field}.${index}.${spec.idField}`);
      if (plain(stableId)) return stableId;
      const canonicalType = trim(raw.canonical_type || raw.type);
      if (!canonicalType || FORBIDDEN_CANONICAL_TYPES.has(canonicalType)) return fail(`${spec.field}.${index}.canonical_type`, "invalid_canonical_type");
      const revision = validHash(raw.revision, `${spec.field}.${index}.revision`);
      if (plain(revision)) return revision;
      const currentRevision = raw.current_revision === undefined || raw.current_revision === null ? revision : validHash(raw.current_revision, `${spec.field}.${index}.current_revision`);
      if (plain(currentRevision)) return currentRevision;
      if (currentRevision !== revision) return fail(`${spec.field}.${index}.revision`, `stale_${spec.singular}_revision`, { [spec.idField]: stableId });
      const sourceIds = validSourceIds(raw.source_ids, sourceMap, `${spec.field}.${index}.source_ids`);
      if (plain(sourceIds)) return sourceIds;
      const normalized = freeze({
        stable_id: stableId,
        canonical_type: canonicalType,
        revision,
        title: trim(raw.title),
        source_ids: sourceIds,
      });
      if (output.has(stableId) && stable(output.get(stableId)) !== stable(normalized)) {
        return fail(spec.field, `duplicate_conflicting_${spec.singular}`, { [spec.idField]: stableId });
      }
      output.set(stableId, normalized);
    }
    return output;
  }

  function stableRefs(raw, objectMap, evidenceMap, field) {
    const refs = [];
    for (const objectId of uniqSorted(raw.object_ids)) {
      if (!objectMap.has(objectId)) return fail(field, "object_not_supplied", { object_id: objectId });
      refs.push({ kind: "object", id: objectId, revision: objectMap.get(objectId).revision });
    }
    for (const evidenceId of uniqSorted(raw.evidence_ids)) {
      if (!evidenceMap.has(evidenceId)) return fail(field, "evidence_not_supplied", { evidence_id: evidenceId });
      refs.push({ kind: "evidence", id: evidenceId, revision: evidenceMap.get(evidenceId).revision });
    }
    refs.sort((a, b) => `${a.kind}:${a.id}`.localeCompare(`${b.kind}:${b.id}`));
    return refs;
  }

  function nodePayload(kind, label, stableRefList, sourceIds, confidence, extra = {}) {
    return {
      kind,
      label,
      stable_refs: stableRefList,
      source_ids: sourceIds,
      confidence,
      ...extra,
    };
  }

  function makeNode(kind, label, stableRefList, sourceIds, sourceMap, confidence, extra = {}) {
    const payload = nodePayload(kind, label, stableRefList, sourceIds, confidence, extra.identity || {});
    return freeze({
      node_id: projectionId("onto_node", payload),
      node_type: "ontology_projection",
      kind,
      label,
      status: "proposed",
      confidence,
      stable_refs: stableRefList,
      provenance: {
        source_ids: sourceIds,
        citations: citationsFor(sourceIds, sourceMap),
      },
      ...(extra.role ? { role: extra.role } : {}),
    });
  }

  function addNode(nodes, node) {
    if (!nodes.has(node.node_id)) nodes.set(node.node_id, node);
    return node;
  }

  function makeEdge(relation, fromNode, toNode, sourceIds, sourceMap, confidence, status = "proposed", reason = "") {
    const payload = {
      relation,
      from_node_id: fromNode.node_id,
      to_node_id: toNode.node_id,
      source_ids: sourceIds,
      status,
      reason,
    };
    return freeze({
      edge_id: projectionId("onto_edge", payload),
      edge_type: "ontology_relation_projection",
      relation,
      from_node_id: fromNode.node_id,
      to_node_id: toNode.node_id,
      status,
      confidence,
      provenance: {
        source_ids: sourceIds,
        citations: citationsFor(sourceIds, sourceMap),
      },
      ...(reason ? { reason } : {}),
    });
  }

  function normalizeEntityNodes(input, objectMap, evidenceMap, sourceMap, nodes, aliases) {
    for (const [index, raw] of list(input.entities).entries()) {
      if (!plain(raw)) return fail(`entities.${index}`, "malformed_entity");
      const alias = raw.entity_id === undefined ? "" : validId(raw.entity_id, `entities.${index}.entity_id`);
      if (plain(alias)) return alias;
      const kind = trim(raw.kind || "concept");
      if (!ENTITY_KINDS.includes(kind)) return fail(`entities.${index}.kind`, "unsupported_entity_kind");
      const label = trim(raw.label);
      if (!label) return fail(`entities.${index}.label`, "label_required");
      const confidence = trim(raw.confidence || "low");
      if (!CONFIDENCE.includes(confidence)) return fail(`entities.${index}.confidence`, "invalid_confidence");
      if (["approved", "confirmed"].includes(trim(raw.status))) return fail(`entities.${index}.status`, "auto_confirmed_relationship_forbidden");
      const refs = stableRefs(raw, objectMap, evidenceMap, `entities.${index}`);
      if (plain(refs)) return refs;
      const sourceIds = validSourceIds(raw.source_ids, sourceMap, `entities.${index}.source_ids`);
      if (plain(sourceIds)) return sourceIds;
      const node = addNode(nodes, makeNode(kind, label, refs, sourceIds, sourceMap, confidence));
      if (alias) aliases.set(alias, node.node_id);
    }
    return null;
  }

  function seedStableNodes(objectMap, evidenceMap, sourceMap, nodes, aliases) {
    for (const [objectId, record] of objectMap.entries()) {
      const node = addNode(nodes, makeNode(
        "existing_object",
        record.title || objectId,
        [{ kind: "object", id: objectId, revision: record.revision }],
        record.source_ids,
        sourceMap,
        "explicit",
        { identity: { canonical_type: record.canonical_type } },
      ));
      aliases.set(objectId, node.node_id);
    }
    for (const [evidenceId, record] of evidenceMap.entries()) {
      const node = addNode(nodes, makeNode(
        "existing_evidence",
        record.title || evidenceId,
        [{ kind: "evidence", id: evidenceId, revision: record.revision }],
        record.source_ids,
        sourceMap,
        "explicit",
        { identity: { canonical_type: record.canonical_type } },
      ));
      aliases.set(evidenceId, node.node_id);
    }
  }

  function resolveNode(ref, aliases, nodes, field) {
    const key = trim(ref);
    const nodeId = aliases.get(key);
    if (!nodeId || !nodes.has(nodeId)) return fail(field, "projection_node_not_supplied", { ref: key });
    return nodes.get(nodeId);
  }

  function normalizeLinkEdges(input, sourceMap, nodes, aliases, edges) {
    for (const [index, raw] of list(input.links).entries()) {
      if (!plain(raw)) return fail(`links.${index}`, "malformed_link");
      const relation = trim(raw.relation);
      if (!LINK_RELATIONS.includes(relation)) return fail(`links.${index}.relation`, raw.inferred === true ? "unsupported_inferred_relation" : "unsupported_relation");
      if (["approved", "confirmed"].includes(trim(raw.status))) return fail(`links.${index}.status`, "auto_confirmed_relationship_forbidden");
      const from = resolveNode(raw.from, aliases, nodes, `links.${index}.from`);
      if (plain(from) && from.ok === false) return from;
      const to = resolveNode(raw.to, aliases, nodes, `links.${index}.to`);
      if (plain(to) && to.ok === false) return to;
      const sourceIds = validSourceIds(raw.source_ids, sourceMap, `links.${index}.source_ids`);
      if (plain(sourceIds)) return sourceIds;
      const confidence = trim(raw.confidence || (raw.ambiguous === true ? "low" : "inferred"));
      if (!CONFIDENCE.includes(confidence)) return fail(`links.${index}.confidence`, "invalid_confidence");
      const status = raw.ambiguous === true || trim(raw.status) === "unknown" ? "unknown" : "proposed";
      edges.push(makeEdge(relation, from, to, sourceIds, sourceMap, status === "unknown" ? "low" : confidence, status, trim(raw.reason || (status === "unknown" ? "ambiguous_relation" : ""))));
    }
    return null;
  }

  function normalizeDecisionLike(input, field, idField, kind, relation, objectMap, evidenceMap, sourceMap, nodes, aliases, edges) {
    for (const [index, raw] of list(input[field]).entries()) {
      if (!plain(raw)) return fail(`${field}.${index}`, `malformed_${kind}`);
      const alias = validId(raw[idField], `${field}.${index}.${idField}`);
      if (plain(alias)) return alias;
      const label = trim(raw.label);
      if (!label) return fail(`${field}.${index}.label`, "label_required");
      const confidence = trim(raw.confidence || "low");
      if (!CONFIDENCE.includes(confidence)) return fail(`${field}.${index}.confidence`, "invalid_confidence");
      const refs = stableRefs(raw, objectMap, evidenceMap, `${field}.${index}`);
      if (plain(refs)) return refs;
      if (refs.length === 0) return fail(`${field}.${index}`, "stable_ref_required");
      const sourceIds = validSourceIds(raw.source_ids, sourceMap, `${field}.${index}.source_ids`);
      if (plain(sourceIds)) return sourceIds;
      const node = addNode(nodes, makeNode(kind, label, refs, sourceIds, sourceMap, confidence, { role: kind }));
      aliases.set(alias, node.node_id);
      const target = resolveNode(refs[0].id, aliases, nodes, `${field}.${index}.target`);
      if (plain(target) && target.ok === false) return target;
      edges.push(makeEdge(relation, node, target, sourceIds, sourceMap, confidence, "proposed", ""));
    }
    return null;
  }

  function normalizeValidationContext(input) {
    const context = plain(input.validation_context) ? input.validation_context : {};
    return freeze({
      ...context,
      logical_scope: "run_scoped",
      persistence: "none",
      trust_state: "proposal_unverified",
      approval_state: "requires_human_approval",
    });
  }

  function buildProjection(input) {
    if (!plain(input)) return fail("input", "malformed_input");
    if (!hashApi || typeof hashApi.sha256 !== "function") return fail("hash", "hash_unavailable");
    const runId = validId(input.run_id, "run_id");
    if (plain(runId)) return runId;
    const sourceMap = normalizeSources(input);
    if (plain(sourceMap) && sourceMap.ok === false) return sourceMap;
    const objectMap = normalizeStableRecords(input.objects, sourceMap, { field: "objects", singular: "object", idField: "object_id" });
    if (plain(objectMap) && objectMap.ok === false) return objectMap;
    const evidenceMap = normalizeStableRecords(input.evidence, sourceMap, { field: "evidence", singular: "evidence", idField: "evidence_id" });
    if (plain(evidenceMap) && evidenceMap.ok === false) return evidenceMap;

    const nodes = new Map();
    const aliases = new Map();
    const edges = [];
    seedStableNodes(objectMap, evidenceMap, sourceMap, nodes, aliases);

    const entityFailure = normalizeEntityNodes(input, objectMap, evidenceMap, sourceMap, nodes, aliases);
    if (entityFailure) return entityFailure;
    const linkFailure = normalizeLinkEdges(input, sourceMap, nodes, aliases, edges);
    if (linkFailure) return linkFailure;
    const decisionFailure = normalizeDecisionLike(input, "decisions", "decision_id", "decision", "decides_for", objectMap, evidenceMap, sourceMap, nodes, aliases, edges);
    if (decisionFailure) return decisionFailure;
    const preferenceFailure = normalizeDecisionLike(input, "preferences", "preference_id", "preference", "prefers_over", objectMap, evidenceMap, sourceMap, nodes, aliases, edges);
    if (preferenceFailure) return preferenceFailure;

    const payload = {
      projection_version: PROJECTION_VERSION,
      run_id: runId,
      validation_context: normalizeValidationContext(input),
      status: "proposed",
      trust_state: "proposal_unverified",
      approval_state: "requires_human_approval",
      write_intent: { target: "none", persistence: "none" },
      nodes: [...nodes.values()].sort((a, b) => a.node_id.localeCompare(b.node_id)),
      edges: edges.sort((a, b) => a.edge_id.localeCompare(b.edge_id)),
      write_counters: zeroWriteCounters(),
    };
    return ok(freeze({ ...payload, canonical_serialization: stable(payload), projection_hash: sha256(stable(payload)) }));
  }

  function projectOntology(input, _options = {}) {
    return buildProjection(input);
  }

  function serializeProjection(projection) {
    return typeof projection?.canonical_serialization === "string" ? projection.canonical_serialization : stable(projection);
  }

  function hashProjection(projection) {
    return typeof projection?.projection_hash === "string" ? projection.projection_hash : sha256(serializeProjection(projection));
  }

  function canonicalRelationsForRetrieval(input) {
    const records = Array.isArray(input) ? input : list(input && input.canonical_relations);
    const relations = [];
    for (const raw of records) {
      if (!plain(raw) || trim(raw.status) !== "canonical") continue;
      const fromDocumentId = trim(raw.from_document_id || raw.document_id);
      const targetDocumentId = trim(raw.target_document_id || raw.to_document_id);
      const relation = trim(raw.relation);
      if (!fromDocumentId || !targetDocumentId || !LINK_RELATIONS.includes(relation)) continue;
      relations.push({ from_document_id: fromDocumentId, target_document_id: targetDocumentId, relation, status: "canonical" });
    }
    relations.sort((left, right) => `${left.from_document_id}:${left.relation}:${left.target_document_id}`
      .localeCompare(`${right.from_document_id}:${right.relation}:${right.target_document_id}`, "en"));
    return freeze(relations.filter((item, index) => index === 0 || stable(item) !== stable(relations[index - 1])));
  }

  const api = freeze({
    PROJECTION_VERSION,
    CONFIDENCE,
    ENTITY_KINDS,
    LINK_RELATIONS,
    projectOntology,
    serializeProjection,
    hashProjection,
    canonicalRelationsForRetrieval,
    zeroWriteCounters,
  });
  root.OntologyProjection = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
