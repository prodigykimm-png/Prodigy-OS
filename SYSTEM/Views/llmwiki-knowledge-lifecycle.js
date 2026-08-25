(function (root) {
  "use strict";

  const LIFECYCLE_VERSION = "llmwiki_knowledge_lifecycle_v1";
  const MAX_SERIALIZED_INPUT = 4 * 1024 * 1024;
  const MAX_DOCUMENTS = 500;
  const MAX_TRIGGERS = 500;
  const HASH = /^[0-9a-f]{64}$/u;
  const ID = /^[a-z][a-z0-9_-]{2,127}$/u;
  const TYPES = new Set(["stale", "contradiction", "orphan", "changed_source", "superseded"]);
  const FEEDBACK = new Set(["ignored", "denied", "rejected"]);
  const SNAPSHOTS = new WeakSet();
  const TRUSTED_INPUTS = new WeakSet();

  function plain(value) { return Boolean(value) && typeof value === "object" && !Array.isArray(value); }
  function trim(value) { return typeof value === "string" ? value.trim().normalize("NFC") : ""; }
  function list(value) { return Array.isArray(value) ? value : []; }
  function freeze(value) {
    if (Array.isArray(value)) return Object.freeze(value.map(freeze));
    if (!plain(value)) return value;
    return Object.freeze(Object.fromEntries(Object.entries(value).map(([key, child]) => [key, freeze(child)])));
  }
  function counters() { return freeze({ writer: 0, approval: 0, canonical: 0, maintenance: 0, git: 0 }); }
  function fail(field, reason) { return freeze({ ok: false, status: "error", field, reason, write_counters: counters() }); }
  function ids(value, field, allowEmpty) {
    if (!Array.isArray(value)) return fail(field, "invalid_id_list");
    const result = [...new Set(value.map(trim))].sort((a, b) => a.localeCompare(b, "en"));
    if ((!allowEmpty && result.length === 0) || result.length !== value.length || result.some((id) => !ID.test(id))) return fail(field, "invalid_id_list");
    return result;
  }
  function sourceSnapshots(value, sourceIds, field) {
    if (!Array.isArray(value)) return fail(field, "source_snapshots_required");
    const result = [];
    const seen = new Set();
    for (const [index, row] of value.entries()) {
      if (!plain(row) || !ID.test(trim(row.source_id)) || !HASH.test(trim(row.source_revision)) || !HASH.test(trim(row.extractor_revision)) || seen.has(trim(row.source_id))) {
        return fail(`${field}.${index}`, "invalid_source_snapshot");
      }
      seen.add(trim(row.source_id));
      result.push({ source_id: trim(row.source_id), source_revision: trim(row.source_revision), extractor_revision: trim(row.extractor_revision) });
    }
    result.sort((a, b) => a.source_id.localeCompare(b.source_id, "en") || a.source_revision.localeCompare(b.source_revision, "en") || a.extractor_revision.localeCompare(b.extractor_revision, "en"));
    if (result.map((row) => row.source_id).join("\0") !== sourceIds.join("\0")) return fail(field, "source_snapshot_id_mismatch");
    return result;
  }
  function triggerOrder(left, right) {
    return [...TYPES].indexOf(left.type) - [...TYPES].indexOf(right.type)
      || left.canonical_ids.join("\0").localeCompare(right.canonical_ids.join("\0"), "en")
      || left.source_snapshots.map((row) => `${row.source_id}:${row.source_revision}`).join("\0").localeCompare(right.source_snapshots.map((row) => `${row.source_id}:${row.source_revision}`).join("\0"), "en")
      || left.evidence_ids.join("\0").localeCompare(right.evidence_ids.join("\0"), "en")
      || left.trigger_id.localeCompare(right.trigger_id, "en");
  }
  function parse(serialized) {
    if (plain(serialized) && TRUSTED_INPUTS.has(serialized)) return serialized;
    if (typeof serialized !== "string") return fail("snapshot", "serialized_snapshot_required");
    if (!serialized || serialized.length > MAX_SERIALIZED_INPUT) return fail("snapshot", "snapshot_size_limit_exceeded");
    try {
      const value = JSON.parse(serialized);
      return plain(value) ? value : fail("snapshot", "malformed_snapshot");
    } catch (_) { return fail("snapshot", "malformed_snapshot"); }
  }

  function createMaintenanceSnapshot(serialized) {
    if (serialized && typeof serialized === "object" && SNAPSHOTS.has(serialized)) return Object.freeze({ ok: true, value: serialized });
    const input = parse(serialized);
    if (input.ok === false) return input;
    const snapshotRevision = trim(input.snapshot_revision);
    if (!HASH.test(snapshotRevision) || trim(input.current_revision || snapshotRevision) !== snapshotRevision) return fail("snapshot_revision", "stale_or_invalid_snapshot");
    if (!Array.isArray(input.canonical_documents) || input.canonical_documents.length > MAX_DOCUMENTS) return fail("canonical_documents", "document_limit_exceeded");
    if (!Array.isArray(input.triggers) || input.triggers.length > MAX_TRIGGERS) return fail("triggers", "trigger_limit_exceeded");
    const documents = [];
    const documentMap = new Map();
    for (const [index, row] of input.canonical_documents.entries()) {
      if (!plain(row) || !ID.test(trim(row.document_id)) || !HASH.test(trim(row.canonical_revision))) return fail(`canonical_documents.${index}`, "invalid_canonical_document");
      const trust = root.LLMWikiCanonicalTrust || (typeof require === "function" ? require("./llmwiki-canonical-trust.js") : null);
      if (!trust || typeof trust.isVerifiedRow !== "function" || !trust.isVerifiedRow(row)) return fail(`canonical_documents.${index}`, "canonical_trust_required");
      const sourceIds = ids(row.source_ids, `canonical_documents.${index}.source_ids`, true);
      if (sourceIds.ok === false) return sourceIds;
      if (documentMap.has(trim(row.document_id))) return fail(`canonical_documents.${index}.document_id`, "duplicate_canonical_document");
      const document = { document_id: trim(row.document_id), canonical_revision: trim(row.canonical_revision), source_ids: sourceIds };
      documentMap.set(document.document_id, document);
      documents.push(document);
    }
    const triggers = [];
    const triggerMap = new Map();
    for (const [index, row] of input.triggers.entries()) {
      if (!plain(row) || !ID.test(trim(row.trigger_id)) || !TYPES.has(trim(row.type)) || !HASH.test(trim(row.trigger_revision))) return fail(`triggers.${index}`, "invalid_trigger");
      const canonicalIds = ids(row.canonical_ids, `triggers.${index}.canonical_ids`, false);
      const sourceIds = ids(row.source_ids, `triggers.${index}.source_ids`, true);
      const evidenceIds = ids(row.evidence_ids, `triggers.${index}.evidence_ids`, false);
      if (canonicalIds.ok === false) return canonicalIds;
      if (sourceIds.ok === false) return sourceIds;
      if (evidenceIds.ok === false) return evidenceIds;
      if (canonicalIds.some((id) => !documentMap.has(id))) return fail(`triggers.${index}.canonical_ids`, "unknown_canonical_document");
      const identity = `${trim(row.trigger_id)}:${trim(row.trigger_revision)}`;
      const prior = triggerMap.get(identity);
      if (prior) return fail(`triggers.${index}`, prior.type === trim(row.type) ? "duplicate_trigger" : "conflicting_trigger");
      const snapshots = sourceSnapshots(row.source_snapshots, sourceIds, `triggers.${index}.source_snapshots`);
      if (snapshots.ok === false) return snapshots;
      const trigger = { trigger_id: trim(row.trigger_id), type: trim(row.type), trigger_revision: trim(row.trigger_revision), canonical_ids: canonicalIds, source_ids: sourceIds, source_snapshots: snapshots, evidence_ids: evidenceIds };
      triggerMap.set(identity, trigger);
      triggers.push(trigger);
    }
    const feedback = [];
    if (input.feedback !== undefined && !Array.isArray(input.feedback)) return fail("feedback", "invalid_feedback");
    for (const [index, row] of list(input.feedback).entries()) {
      if (!plain(row) || !ID.test(trim(row.trigger_id)) || !HASH.test(trim(row.trigger_revision)) || !FEEDBACK.has(trim(row.decision))) return fail(`feedback.${index}`, "invalid_feedback");
      feedback.push({ trigger_id: trim(row.trigger_id), trigger_revision: trim(row.trigger_revision), decision: trim(row.decision) });
    }
    documents.sort((a, b) => a.document_id.localeCompare(b.document_id, "en") || a.canonical_revision.localeCompare(b.canonical_revision, "en"));
    triggers.sort(triggerOrder);
    feedback.sort((a, b) => a.trigger_id.localeCompare(b.trigger_id, "en") || a.trigger_revision.localeCompare(b.trigger_revision, "en"));
    const value = freeze({ lifecycle_version: LIFECYCLE_VERSION, snapshot_revision: snapshotRevision, canonical_documents: documents, triggers, feedback });
    SNAPSHOTS.add(value);
    return Object.freeze({ ok: true, value });
  }

  function createTrustedMaintenanceSnapshot(input) {
    if (!plain(input) || !Array.isArray(input.canonical_documents)) return fail("snapshot", "trusted_snapshot_required");
    const trust = root.LLMWikiCanonicalTrust || (typeof require === "function" ? require("./llmwiki-canonical-trust.js") : null);
    if (!trust || typeof trust.isVerifiedRow !== "function" || input.canonical_documents.some((row) => !trust.isVerifiedRow(row))) return fail("canonical_documents", "canonical_trust_required");
    TRUSTED_INPUTS.add(input);
    return createMaintenanceSnapshot(input);
  }

  function isMaintenanceSnapshot(value) {
    return Boolean(value) && (typeof value === "object" || typeof value === "function") && SNAPSHOTS.has(value);
  }

  const api = freeze({ LIFECYCLE_VERSION, MAX_SERIALIZED_INPUT, MAX_DOCUMENTS, MAX_TRIGGERS, createMaintenanceSnapshot, createTrustedMaintenanceSnapshot, isMaintenanceSnapshot });
  root.LLMWikiKnowledgeLifecycle = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
