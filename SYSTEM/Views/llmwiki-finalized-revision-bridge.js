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
  async function bridgeFinalizedRevision(packet, approval, adapter, committedAt, options = {}) {
    if (!compensationApi || typeof compensationApi.create !== "function"
      || !obsidianApi || typeof obsidianApi.finalizedCanonicalAuthorityData !== "function"
      || typeof obsidianApi.auditPath !== "function"
      || BRIDGE_ADAPTER_METHODS.some((name) => typeof adapter[name] !== "function")) return null;
    if (typeof adapter.repairImmutableAuditHead === "function" && !options.prepareOnly) {
      const repaired = await adapter.repairImmutableAuditHead({ packet_hash: packet.packet_hash, authorization_hash: approval.authorization_hash,
        target_path: packet.target_path, revision: packet.after_sha256 });
      if (!repaired.ok) return bridgePending(packet, repaired.reason);
    }
    let authorities;
    try { authorities = await adapter.readFinalizedCanonicalAuthorities(); }
    catch (_error) { return null; }
    const priorData = (Array.isArray(authorities) ? authorities : [])
      .map((receipt) => obsidianApi.finalizedCanonicalAuthorityData(receipt))
      .find((data) => data && data.canonical_id === approval.canonical_id && core.plain(data.canonical_v2_authority));
    const creating = packet.operation.proposal_kind === "create";
    const approvedAuthority = approval.canonical_v2_authority || approval.authority;
    if (!priorData && (!creating || !approvedAuthority)) return null;
    if (priorData && priorData.packet_hash === packet.packet_hash && priorData.authorization_hash === approval.authorization_hash
      && priorData.revision === packet.after_sha256) {
      if (options.prepareOnly || await adapter.readBytes(packet.target_path) !== packet.after_bytes) return bridgePending(packet, "stale_before_write");
      return { ok: true };
    }
    if (priorData && priorData.revision !== packet.before_sha256) return bridgePending(packet, "canonical_revision_mismatch");
    const document = core.v2Document(packet);
    if (!document || document.canonical_id !== approval.canonical_id || document.status !== "active") return null;
    const nonce = creating ? packet.nonce : `upd_${approval.authorization_hash.slice(0, 32)}`;
    let existing = null;
    if (typeof adapter.readReceipt === "function") {
      try { existing = await adapter.readReceipt(nonce); }
      catch (_) { return bridgePending(packet, "authority_audit_read_failed"); }
    }
    if (existing) {
      if (existing.packet_hash !== packet.packet_hash || existing.authorization_hash !== approval.authorization_hash
        || existing.after_sha256 !== packet.after_sha256 || existing.before_sha256 !== packet.before_sha256
        || existing.target_path !== packet.target_path || !["prepared", "committed"].includes(existing.result)) return bridgePending(packet, "nonce_replay_conflict");
      if (options.prepareOnly && existing.result === "committed") return bridgePending(packet, "stale_before_write");
      committedAt = existing.committed_at || existing.prepared_at;
    }
    const authority = core.freeze(approvedAuthority || {
      ...core.clone(priorData.canonical_v2_authority), canonical_sha256: packet.after_sha256, status: document.status,
    });
    if (["claim_set_hash", "promotion_receipt_hash", "sources", "relations", "ai_enrichment_status", "status"]
      .some(key => core.stable(key === "relations" ? authority[key] || [] : authority[key]) !== core.stable(key === "relations" ? document[key] || [] : document[key]))) return bridgePending(packet, "v2_authorization_payload_mismatch");
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
    if (existing?.result === "committed" && core.stable(existing) !== core.stable(audit)) return bridgePending(packet, "authority_audit_mismatch");
    let prepared;
    try {
      prepared = existing?.result === "committed" ? { ok: true, file: { path: obsidianApi.auditPath(nonce) }, bytes: finalAuditBytes }
        : await adapter.prepareAudit(mutation);
    }
    catch (_error) { return bridgePending(packet, "authority_audit_prepare_failed"); }
    if (!prepared || prepared.ok !== true) return bridgePending(packet, "authority_audit_prepare_failed");
    if (options.prepareOnly) return { ok: true };
    const repair = {
      audit_path: obsidianApi.auditPath(nonce),
      target_path: packet.target_path,
      canonical_bytes: packet.after_bytes,
      prepared_audit_bytes: prepared.bytes,
      final_audit_bytes: finalAuditBytes,
    };
    let finalized;
    try {
      finalized = existing && existing.result === "committed" ? { ok: true }
        : existing && typeof adapter.repairAudit === "function" ? await adapter.repairAudit(repair)
        : await adapter.finalizeAudit(prepared, finalAuditBytes);
    }
    catch (_error) { return bridgePending(packet, "authority_audit_finalize_failed", { repair }); }
    if (!finalized || finalized.ok !== true) return bridgePending(packet, "authority_audit_finalize_failed", { repair });
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
    let recorded;
    try { recorded = await compensationApi.create({ adapter, now: () => committedAt }).recordCompletedCommit({ original_receipt: originalReceipt }); }
    catch (_) { return bridgePending(packet, "immutable_audit_append_failed"); }
    if (!recorded || recorded.ok !== true) return bridgePending(packet, recorded && recorded.reason || "immutable_audit_append_failed");
    const trust = root.LLMWikiCanonicalTrust || (typeof require === "function" ? require("./llmwiki-canonical-trust.js") : null);
    try {
      const live = await adapter.readCanonical(packet.target_path);
      const receipts = await adapter.readFinalizedCanonicalAuthorities();
      const receipt = receipts.find(value => {
        const data = obsidianApi.finalizedCanonicalAuthorityData(value);
        return data && data.canonical_id === approval.canonical_id && data.revision === packet.after_sha256;
      });
      if (!receipt || !trust || !trust.isVerified(trust.decideFinalized({ bytes: live.bytes, revision: core.sha256(live.bytes), receipt,
        source_revisions: Object.fromEntries(authority.claim_set.sources.map(source => [source.source_id, source.source_revision])) }))) return bridgePending(packet, "canonical_readback_failed");
    } catch (_) { return bridgePending(packet, "canonical_readback_failed"); }
    return { ok: true };
  }

  const api = Object.freeze({ bridgeFinalizedRevision });
  root.LLMWikiFinalizedRevisionBridge = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
