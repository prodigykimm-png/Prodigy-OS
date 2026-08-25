(function (root) {
  "use strict";

  const knowledgeStore = root.KnowledgeCandidateStore
    || (typeof require === "function" ? require("./knowledge-candidate-store.js") : null);

  if (!knowledgeStore) throw new Error("KnowledgeCandidateStore is required.");

  const CONTRACT_VERSION = "llmwiki_knowledge_kind_contract_v1";
  const CORPUS_REVISION = "llmwiki_knowledge_kind_corpus_v1";
  const KNOWLEDGE_KINDS = Object.freeze(["claim", "principle", "procedure", "concept"]);
  const KIND_SET = new Set(KNOWLEDGE_KINDS);
  const MAX_DOCUMENT_BYTES = 1024 * 1024;
  const BRANDED_PROPOSALS = new WeakSet();
  const PROPOSAL_FIELDS = new Set([
    "application_contexts", "application_trigger", "body", "connections", "created", "invalidation_conditions",
    "knowledge_domain", "knowledge_kind", "knowledge_topics", "statement", "summary", "title", "type", "updated",
    "schema_version", "canonical_id", "status", "sources", "relations", "claim_set_hash", "promotion_receipt_hash", "ai_enrichment_status",
  ]);
  const REQUIRED_TEXT_FIELDS = Object.freeze([
    "title", "statement", "knowledge_domain", "application_trigger", "summary", "created", "updated", "body",
  ]);
  const REQUIRED_LIST_FIELDS = Object.freeze([
    "knowledge_topics", "application_contexts", "connections", "invalidation_conditions",
  ]);

  function plain(value) { return Boolean(value) && typeof value === "object" && !Array.isArray(value); }
  function clone(value) { return JSON.parse(JSON.stringify(value)); }
  function freeze(value) {
    if (Array.isArray(value)) return Object.freeze(value.map(freeze));
    if (!plain(value)) return value;
    return Object.freeze(Object.fromEntries(Object.entries(value).map(([key, item]) => [key, freeze(item)])));
  }
  function byteLength(value) {
    let serialized;
    try { serialized = JSON.stringify(value); }
    catch (_error) { throw new TypeError("document_must_be_serializable"); }
    return new TextEncoder().encode(serialized).length;
  }
  function assertRevision(options) {
    const revision = options && options.fixture_revision;
    if (revision !== undefined && revision !== CORPUS_REVISION) throw new Error("stale_fixture_revision");
  }
  function normalizedKind(value, allowMissing) {
    if (value === undefined && allowMissing) return "unclassified";
    if (value === "unclassified" || KIND_SET.has(value)) return value;
    throw new Error("invalid_knowledge_kind");
  }

  function parseDocument(value, options) {
    assertRevision(options);
    if (!plain(value)) throw new TypeError("document_must_be_plain_object");
    if (byteLength(value) > MAX_DOCUMENT_BYTES) throw new RangeError("document_too_large");
    const document = clone(value);
    const knowledgeKind = normalizedKind(document.knowledge_kind, true);
    return freeze({
      contract_version: CONTRACT_VERSION,
      knowledge_kind: knowledgeKind,
      classification: knowledgeKind === "unclassified" ? "unclassified" : "classified",
      explicit_unclassified: knowledgeKind === "unclassified",
      document,
    });
  }

  function serializeDocument(value) {
    if (!plain(value) || value.contract_version !== CONTRACT_VERSION || !plain(value.document)) {
      throw new TypeError("parsed_document_required");
    }
    normalizedKind(value.knowledge_kind, false);
    return clone(value.document);
  }

  function rejected(reason, field) {
    return freeze({ ok: false, status: "rejected", approval_eligible: false, reason, field: field || null });
  }

  function proposalShapeIssue(value) {
    if (!plain(value)) return rejected("proposal_must_be_plain_object", "proposal");
    if (byteLength(value) > MAX_DOCUMENT_BYTES) return rejected("proposal_too_large", "proposal");
    for (const key of Object.keys(value)) if (!PROPOSAL_FIELDS.has(key)) return rejected("unknown_proposal_field", key);
    if (value.knowledge_kind === undefined) return rejected("knowledge_kind_required", "knowledge_kind");
    let kind;
    try { kind = normalizedKind(value.knowledge_kind, false); }
    catch (_error) { return rejected("invalid_knowledge_kind", "knowledge_kind"); }
    if (kind === "unclassified") return rejected("unclassified_not_approval_eligible", "knowledge_kind");
    if (value.type !== undefined && value.type !== "knowledge") return rejected("canonical_type_required", "type");
    const v2 = value.schema_version !== undefined;
    if (v2 && value.schema_version !== 2) return rejected("unknown_schema_version", "schema_version");
    for (const field of REQUIRED_TEXT_FIELDS) {
      if (field === "summary" && v2 && value[field] === undefined) continue;
      if (typeof value[field] !== "string") return rejected("invalid_proposal_text", field);
    }
    for (const field of REQUIRED_LIST_FIELDS) {
      if (!Array.isArray(value[field]) || value[field].some((item) => typeof item !== "string")) {
        return rejected("invalid_proposal_list", field);
      }
    }
    if (v2) {
      try { knowledgeStore.validateLifecycleDocument({ ...value, type: "knowledge" }); }
      catch (error) { return rejected(error.code || "invalid_lifecycle_document", "proposal"); }
    }
    try { knowledgeStore.renderCanonicalDocument(value); }
    catch (error) { return rejected(error.code || error.message || "invalid_canonical_document", "proposal"); }
    return null;
  }

  function parseProposal(value) {
    const issue = proposalShapeIssue(value);
    if (issue) return issue;
    const parsed = freeze({
      ok: true,
      status: "typed",
      approval_eligible: true,
      contract_version: CONTRACT_VERSION,
      knowledge_kind: value.knowledge_kind,
      document: clone(value),
    });
    BRANDED_PROPOSALS.add(parsed);
    return parsed;
  }

  function serializeProposal(value) {
    if (!plain(value) || !BRANDED_PROPOSALS.has(value) || value.ok !== true || value.approval_eligible !== true || !plain(value.document)) {
      throw new TypeError("approval_eligible_proposal_required");
    }
    return knowledgeStore.renderCanonicalDocument(value.document);
  }

  const api = freeze({
    CONTRACT_VERSION, CORPUS_REVISION, KNOWLEDGE_KINDS, MAX_DOCUMENT_BYTES,
    parseDocument, serializeDocument, parseProposal, serializeProposal,
  });
  root.LLMWikiKnowledgeKindContract = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
