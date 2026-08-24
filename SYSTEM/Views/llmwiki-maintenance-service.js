(function (root) {
  "use strict";

  const crypto = typeof require === "function" ? require("node:crypto") : null;
  const MAINTENANCE_VERSION = "llmwiki_maintenance_service_v1";
  const TYPE_ORDER = Object.freeze(["stale", "contradiction", "orphan", "changed_source", "superseded"]);
  const RISK = Object.freeze({ stale: "low", contradiction: "high", orphan: "medium", changed_source: "medium", superseded: "high" });
  const OPERATION = Object.freeze({ stale: "refresh_evidence", contradiction: "conflict_review", orphan: "attach_evidence", changed_source: "review_update", superseded: "review_supersession" });
  const EXPLANATION = Object.freeze({
    stale: "The bound evidence is no longer current for this canonical revision.",
    contradiction: "Current evidence contains incompatible support for the affected canonical knowledge.",
    orphan: "The canonical knowledge has no current source binding and needs evidence review.",
    changed_source: "A bound source revision changed after this canonical revision was established.",
    superseded: "A newer canonical candidate may supersede the affected prior knowledge.",
  });

  function plain(value) { return Boolean(value) && typeof value === "object" && !Array.isArray(value); }
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
    if (crypto) return crypto.createHash("sha256").update(String(value), "utf8").digest("hex");
    // Browser runtime (Obsidian renderer has no node:crypto): use the project's
    // own pure-JS synchronous SHA-256 (LLMWikiHash), which is header-loaded by
    // the manifest before this module.
    if (root.LLMWikiHash && typeof root.LLMWikiHash.sha256 === "function") return root.LLMWikiHash.sha256(String(value));
    throw new Error("crypto unavailable");
  }
  function counters() { return freeze({ writer: 0, approval: 0, canonical: 0, maintenance: 0, git: 0 }); }
  function fail(field, reason) {
    return freeze({ ok: false, status: "error", field, reason, new_count: 0, auto_authorization_count: 0, write_counters: counters() });
  }
  function trusted(path, globalName) {
    if (typeof require === "function") {
      try { return require(path); } catch (_) { /* optional browser dependency */ }
    }
    try { return root[globalName] || null; } catch (_) { return null; }
  }
  function feedbackKey(row) { return `${row.trigger_id}:${row.trigger_revision}`; }
  function proposalOrder(left, right) {
    return TYPE_ORDER.indexOf(left.type) - TYPE_ORDER.indexOf(right.type)
      || left.affected_canonical_ids.join("\0").localeCompare(right.affected_canonical_ids.join("\0"), "en")
      || left.bindings.source_snapshots.map((row) => `${row.source_id}:${row.source_revision}:${row.extractor_revision}`).join("\0")
        .localeCompare(right.bindings.source_snapshots.map((row) => `${row.source_id}:${row.source_revision}:${row.extractor_revision}`).join("\0"), "en")
      || stable(left.evidence).localeCompare(stable(right.evidence), "en")
      || left.created_from.evidence_digest.localeCompare(right.created_from.evidence_digest, "en")
      || left.proposal_id.localeCompare(right.proposal_id, "en");
  }

  function create(_capabilities = {}) {
    const lifecycleApi = trusted("./llmwiki-knowledge-lifecycle.js", "LLMWikiKnowledgeLifecycle");
    const retrievalApi = trusted("./llmwiki-retrieval-service.js", "LLMWikiRetrievalService");
    const evidenceApi = trusted("./llmwiki-evidence-contract.js", "LLMWikiEvidenceContract");
    const emitted = new Set();

    function scan(lifecycle, retrieval, evidence) {
      if (!lifecycleApi || typeof lifecycleApi.isMaintenanceSnapshot !== "function" || !lifecycleApi.isMaintenanceSnapshot(lifecycle)) {
        return fail("lifecycle", "branded_lifecycle_snapshot_required");
      }
      if (!retrievalApi || typeof retrievalApi.isMaintenanceRetrievalRecord !== "function" || !retrievalApi.isMaintenanceRetrievalRecord(retrieval)) {
        return fail("retrieval", "branded_retrieval_record_required");
      }
      if (!evidenceApi || typeof evidenceApi.isMaintenanceEvidenceRecord !== "function" || !evidenceApi.isMaintenanceEvidenceRecord(evidence)) {
        return fail("evidence", "branded_evidence_record_required");
      }
      if (lifecycle.snapshot_revision !== retrieval.snapshot_revision || lifecycle.snapshot_revision !== evidence.snapshot_revision) {
        return fail("snapshot_revision", "snapshot_revision_mismatch");
      }
      const documents = new Map(lifecycle.canonical_documents.map((row) => [row.document_id, row]));
      const candidates = new Map(retrieval.candidates.map((row) => [row.document_id, row]));
      const evidenceRecords = new Map(evidence.records.map((row) => [row.evidence_id, row]));
      const suppressed = new Set(lifecycle.feedback.map(feedbackKey));
      const proposals = [];
      const auditOutcomes = [];
      let newCount = 0;

      for (const type of TYPE_ORDER) {
        for (const trigger of lifecycle.triggers.filter((row) => row.type === type)) {
          if (suppressed.has(feedbackKey(trigger))) continue;
          const affected = [];
          for (const documentId of trigger.canonical_ids) {
            const document = documents.get(documentId);
            const candidate = candidates.get(documentId);
            if (!document || !candidate || candidate.canonical_revision !== document.canonical_revision) return fail("canonical_revision", "retrieval_revision_mismatch");
            affected.push({ document_id: document.document_id, canonical_revision: document.canonical_revision });
          }
          const sourceBindings = trigger.source_snapshots.map((row) => ({ ...row }));
          const bindingMap = new Map(sourceBindings.map((row) => [row.source_id, row]));
          const selectedEvidence = [];
          for (const evidenceId of trigger.evidence_ids) {
            const record = evidenceRecords.get(evidenceId);
            if (!record || !trigger.canonical_ids.every((id) => record.canonical_ids.includes(id))) return fail("evidence", "evidence_binding_mismatch");
            if (record.source_ids.join("\0") !== trigger.source_ids.join("\0")) return fail("evidence", "source_snapshot_binding_mismatch");
            for (const citation of record.citations) {
              const binding = bindingMap.get(citation.source_id);
              if (!binding || citation.source_revision !== binding.source_revision || citation.extractor_revision !== binding.extractor_revision) {
                return fail("evidence", "source_snapshot_binding_mismatch");
              }
            }
            if (sourceBindings.some((binding) => !record.citations.some((citation) => citation.source_id === binding.source_id
              && citation.source_revision === binding.source_revision && citation.extractor_revision === binding.extractor_revision))) {
              return fail("evidence", "source_snapshot_binding_mismatch");
            }
            selectedEvidence.push({
              evidence_id: record.evidence_id,
              evidence_revision: record.evidence_revision,
              status: record.status,
              source_ids: record.source_ids,
              citations: record.citations,
              claims: record.claims,
              authoritative: false,
            });
          }
          selectedEvidence.sort((a, b) => stable(a.citations).localeCompare(stable(b.citations), "en")
            || a.evidence_revision.localeCompare(b.evidence_revision, "en") || a.evidence_id.localeCompare(b.evidence_id, "en"));
          const evidenceDigest = sha256(stable(selectedEvidence));
          const createdFrom = {
            snapshot_revision: lifecycle.snapshot_revision,
            trigger_id: trigger.trigger_id,
            trigger_revision: trigger.trigger_revision,
            source_revision: sourceBindings[0] ? sourceBindings[0].source_revision : null,
            source_revisions: sourceBindings.map((row) => row.source_revision),
            extractor_revision: sourceBindings[0] ? sourceBindings[0].extractor_revision : null,
            extractor_revisions: sourceBindings.map((row) => row.extractor_revision),
            evidence_digest: evidenceDigest,
            retrieval_revision: retrieval.snapshot_revision,
          };
          const identity = {
            type,
            affected_canonical: affected,
            evidence: selectedEvidence,
            source_ids: trigger.source_ids,
            created_from: createdFrom,
          };
          const dedupeId = sha256(stable(identity));
          const proposalId = `maintenance_${dedupeId.slice(0, 24)}`;
          if (!emitted.has(dedupeId)) { emitted.add(dedupeId); newCount += 1; }
          proposals.push(freeze({
            proposal_id: proposalId,
            dedupe_id: dedupeId,
            kind: "knowledge_maintenance",
            type,
            status: "proposed",
            approval_state: "requires_human_approval",
            auto_authorized: false,
            canonical_mutation: false,
            affected_canonical: affected,
            affected_canonical_ids: affected.map((row) => row.document_id),
            affected_canonical_revisions: affected.map((row) => row.canonical_revision),
            evidence: selectedEvidence,
            bindings: { source_snapshots: sourceBindings },
            explanation: EXPLANATION[type],
            impact_scope: { canonical_ids: affected.map((row) => row.document_id), source_ids: [...trigger.source_ids], maximum_documents: affected.length },
            risk_tier: RISK[type],
            suggested_operation: OPERATION[type],
            created_from: createdFrom,
          }));
          auditOutcomes.push(freeze({
            outcome_id: `outcome_${sha256(stable({ proposal_id: proposalId, outcome: "no_op" })).slice(0, 24)}`,
            proposal_id: proposalId,
            outcome: "no_op",
            reason: type,
            source_revision: createdFrom.source_revision,
            source_revisions: createdFrom.source_revisions,
            extractor_revision: createdFrom.extractor_revision,
            extractor_revisions: createdFrom.extractor_revisions,
            evidence_digest: createdFrom.evidence_digest,
            persisted: false,
          }));
        }
      }
      proposals.sort(proposalOrder);
      const proposalIndexes = new Map(proposals.map((proposal, index) => [proposal.proposal_id, index]));
      auditOutcomes.sort((left, right) => proposalIndexes.get(left.proposal_id) - proposalIndexes.get(right.proposal_id));
      return freeze({
        ok: true,
        status: proposals.length ? "proposed" : "no_change",
        maintenance_version: MAINTENANCE_VERSION,
        snapshot_revision: lifecycle.snapshot_revision,
        proposals,
        proposal_count: proposals.length,
        new_count: newCount,
        audit_outcomes: auditOutcomes,
        hints_authoritative: false,
        auto_authorization_count: 0,
        writer_count: 0,
        approval_count: 0,
        git_count: 0,
        write_counters: counters(),
      });
    }

    return Object.freeze({ scan, scanMaintenance: scan });
  }

  function scanMaintenance(lifecycle, retrieval, evidence) {
    return create().scan(lifecycle, retrieval, evidence);
  }

  const api = freeze({ MAINTENANCE_VERSION, TYPE_ORDER, create, scanMaintenance });
  root.LLMWikiMaintenanceService = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
