(function (root) {
  "use strict";

  const core = root.LLMWikiOperationWriterCore
    || (typeof require === "function" ? require("./llmwiki-operation-writer-core.js") : null);
  const compensationApi = root.LLMWikiCompensationService
    || (typeof require === "function" ? require("./llmwiki-compensation-service.js") : null);
  const obsidianApi = root.LLMWikiObsidianAdapter
    || (typeof require === "function" ? require("./llmwiki-obsidian-adapter.js") : null);
  const BRIDGE_ADAPTER_METHODS = ["readFinalizedCanonicalAuthorities", "prepareAudit", "finalizeAudit", "appendImmutableAudit", "readImmutableAuditContinuity"];

  function bridgePending(packet, reason, extras = {}) {
    return core.result("committed_authority_pending", {
      reason,
      write_counts: { ...core.ZERO_WRITES, canonical: 1, audit: 1 },
      target_path: packet.target_path,
      ...extras,
    });
  }
  async function bridgeFinalizedRevision(packet, approval, adapter, committedAt) {
    if (!compensationApi || typeof compensationApi.create !== "function"
      || !obsidianApi || typeof obsidianApi.finalizedCanonicalAuthorityData !== "function"
      || typeof obsidianApi.auditPath !== "function"
      || BRIDGE_ADAPTER_METHODS.some((name) => typeof adapter[name] !== "function")) return null;
    let authorities;
    try { authorities = await adapter.readFinalizedCanonicalAuthorities(); }
    catch (_error) { return null; }
    const priorData = (Array.isArray(authorities) ? authorities : [])
      .map((receipt) => obsidianApi.finalizedCanonicalAuthorityData(receipt))
      .find((data) => data && data.canonical_id === approval.canonical_id && core.plain(data.canonical_v2_authority));
    if (!priorData) return null;
    const document = core.v2Document(packet);
    if (!document || document.canonical_id !== approval.canonical_id || document.status !== "active") return null;
    const nonce = `upd_${approval.authorization_hash.slice(0, 32)}`;
    const audit = {
      audit_version: "llmwiki_packet_bound_commit_audit_v1",
      result: "committed",
      committed_at: committedAt,
      canonical_id: approval.canonical_id,
      packet_hash: packet.packet_hash,
      authorization_hash: approval.authorization_hash,
      operation_id: packet.operation.operation_id,
      target_path: packet.target_path,
      before_sha256: packet.before_sha256,
      after_sha256: packet.after_sha256,
      live_revision: packet.live_revision,
      nonce,
      consent_hash: packet.consent_hash,
      source_ids: packet.source_citations.map((citation) => citation.source_id).sort(),
    };
    const mutation = {
      target_path: packet.target_path,
      before_bytes: packet.before_bytes,
      before_sha256: packet.before_sha256,
      after_bytes: packet.after_bytes,
      after_sha256: packet.after_sha256,
      allowed_properties: core.clone(packet.allowed_properties),
      source_citations: core.clone(packet.source_citations),
      live_revision: packet.live_revision,
      packet_hash: packet.packet_hash,
      authorization_hash: approval.authorization_hash,
      operation_id: packet.operation.operation_id,
      nonce,
      audit,
    };
    const finalAuditBytes = `${JSON.stringify(audit, null, 2)}\n`;
    let prepared;
    try { prepared = await adapter.prepareAudit(mutation); }
    catch (_error) { return bridgePending(packet, "authority_audit_prepare_failed"); }
    if (!prepared || prepared.ok !== true) return bridgePending(packet, "authority_audit_prepare_failed");
    const repair = {
      audit_path: obsidianApi.auditPath(nonce),
      target_path: packet.target_path,
      canonical_bytes: packet.after_bytes,
      prepared_audit_bytes: prepared.bytes,
      final_audit_bytes: finalAuditBytes,
    };
    let finalized;
    try { finalized = await adapter.finalizeAudit(prepared, finalAuditBytes); }
    catch (_error) { return bridgePending(packet, "authority_audit_finalize_failed", { repair }); }
    if (!finalized || finalized.ok !== true) return bridgePending(packet, "authority_audit_finalize_failed", { repair });
    const authority = core.freeze({
      ...core.clone(priorData.canonical_v2_authority),
      canonical_sha256: packet.after_sha256,
      status: document.status,
    });
    const originalReceipt = {
      run_id: packet.run_id,
      packet_id: packet.operation.operation_id,
      packet_hash: packet.packet_hash,
      policy_snapshot: { operation: packet.operation.proposal_kind, schema_version: 2 },
      source_revisions: Object.fromEntries(authority.claim_set.sources.map((source) => [source.source_id, source.source_revision])),
      committed_at: committedAt,
      writes: [{
        path: packet.target_path,
        before_bytes: packet.before_bytes,
        after_bytes: packet.after_bytes,
        before_sha256: packet.before_sha256,
        after_sha256: packet.after_sha256,
        before_revision: packet.before_sha256,
        post_commit_revision: packet.after_sha256,
      }],
      write_outcome: "committed",
      refresh_outcome: "not_requested",
      git_outcome: "not_requested",
      resurfacing_bindings: [{
        canonical_id: approval.canonical_id,
        path: packet.target_path,
        revision: packet.after_sha256,
        nonce,
        final_audit_sha256: core.sha256(finalAuditBytes),
        packet_hash: packet.packet_hash,
        authorization_hash: approval.authorization_hash,
      }],
      canonical_v2_authority: authority,
    };
    const recorded = await compensationApi.create({ adapter, now: () => committedAt }).recordCompletedCommit({ original_receipt: originalReceipt });
    if (!recorded || recorded.ok !== true) return bridgePending(packet, recorded && recorded.reason || "immutable_audit_append_failed");
    return { ok: true };
  }

  const api = Object.freeze({ bridgeFinalizedRevision });
  root.LLMWikiFinalizedRevisionBridge = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
