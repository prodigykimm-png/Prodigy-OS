(function (root) {
  "use strict";

  const canonicalApi = root.LLMWikiCanonicalPacket
    || (typeof require === "function" ? require("./llmwiki-canonical-packet.js") : null);
  const claimApi = root.LLMWikiClaimProvenance
    || (typeof require === "function" ? require("./llmwiki-claim-provenance.js") : null);
  const promotionApi = root.LLMWikiPromotionContract
    || (typeof require === "function" ? require("./llmwiki-promotion-contract.js") : null);
  const compensationApi = root.LLMWikiCompensationService
    || (typeof require === "function" ? require("./llmwiki-compensation-service.js") : null);
  const core = root.LLMWikiOperationWriterCore
    || (typeof require === "function" ? require("./llmwiki-operation-writer-core.js") : null);

  function sameIds(left, right) {
    return Array.isArray(left) && Array.isArray(right)
      && left.length === right.length && left.slice().sort().every((value, index) => value === right.slice().sort()[index]);
  }
  function authorizable(packet) {
    return packet && packet.operation && packet.operation.proposal_kind === "create"
      && packet.operation.authorization_state === "authorizable";
  }
  function validateAuthority(input) {
    if (!core.plain(input) || core.proxy(input) || !core.safelyInspectable(input)) return core.reject("malformed_v2_authorization");
    const fields = new Set(["packet", "canonical_id", "claim_set", "promotion_input", "promotion_receipt"]);
    for (const key of Object.keys(input)) if (!fields.has(key)) return core.reject("unknown_v2_authorization_field", { field: key });
    if (!canonicalApi || !claimApi || !promotionApi) return core.reject("v2_authority_contract_missing");
    const verified = canonicalApi.verifyCanonicalPacket(input.packet);
    if (!verified.ok) return core.reject(verified.reason);
    if (!authorizable(input.packet)) return core.reject("canonical_v2_operation_not_authorizable");
    const document = core.v2Document(input.packet);
    if (!document || document.canonical_id !== input.canonical_id || !core.ID.test(input.canonical_id)) return core.reject("canonical_v2_document_required");
    const claims = claimApi.validateClaimSet(input.claim_set);
    if (!claims || claims.ok !== true || input.claim_set.status !== "accepted" || input.claim_set.claims.some((claim) => claim.status !== "accepted")) {
      return core.reject(claims && claims.reason || "accepted_claim_set_required");
    }
    if (document.claim_set_hash !== input.claim_set.claim_set_hash) return core.reject("claim_set_hash_mismatch");
    const sourceIds = input.claim_set.sources.map((source) => source.source_id);
    const documentSourceIds = (document.sources || []).map((source) => source.source_id);
    const citationSourceIds = input.packet.source_citations.map((source) => source.source_id);
    if (!sourceIds.length || !sameIds(sourceIds, documentSourceIds) || !sameIds(sourceIds, citationSourceIds)) return core.reject("canonical_source_binding_required");
    let expectedReceipt;
    try { expectedReceipt = promotionApi.evaluatePromotion(promotionApi.normalizePromotionInput(input.promotion_input)); }
    catch (_error) { return core.reject("promotion_receipt_invalid"); }
    if (!expectedReceipt.canonical_write_eligible || core.stable(expectedReceipt) !== core.stable(input.promotion_receipt)) return core.reject("promotion_receipt_invalid");
    const promotionReceiptHash = core.sha256(core.stable(input.promotion_receipt));
    if (document.promotion_receipt_hash !== promotionReceiptHash) return core.reject("promotion_receipt_hash_mismatch");
    return { document, authority: core.freeze({
      canonical_id: document.canonical_id,
      schema_version: 2,
      canonical_sha256: input.packet.after_sha256,
      claim_set_hash: input.claim_set.claim_set_hash,
      claim_set: core.clone(input.claim_set),
      promotion_receipt_hash: promotionReceiptHash,
      promotion_receipt: core.clone(input.promotion_receipt),
      sources: core.clone(document.sources),
      relations: core.clone(document.relations || []),
      ai_enrichment_status: document.ai_enrichment_status,
      status: document.status,
    }) };
  }
  function authorizeCanonicalV2(input) {
    const validated = validateAuthority(input);
    if (validated && validated.ok === false) return validated;
    const body = {
      authorization_version: "llmwiki_canonical_v2_authorization_v1",
      canonical_id: validated.document.canonical_id,
      packet_hash: input.packet.packet_hash,
      authority: validated.authority,
    };
    const approval = core.freeze({ ...body, authorization_hash: core.sha256(core.stable(body)) });
    core.brandCanonicalV2Approval(approval);
    return core.success(approval);
  }
  function auditFor(packet, authorization, committedAt) {
    return {
      audit_version: "llmwiki_packet_bound_commit_audit_v1",
      result: "committed",
      committed_at: committedAt,
      canonical_id: authorization.canonical_id,
      packet_hash: packet.packet_hash,
      authorization_hash: authorization.authorization_hash,
      operation_id: packet.operation.operation_id,
      target_path: packet.target_path,
      before_sha256: packet.before_sha256,
      after_sha256: packet.after_sha256,
      live_revision: packet.live_revision,
      nonce: packet.nonce,
      consent_hash: packet.consent_hash,
      source_ids: packet.source_citations.map((citation) => citation.source_id).sort(),
    };
  }
  function authorityReceipt(packet, authorization, audit, committedAt) {
    const finalAuditBytes = `${JSON.stringify(audit, null, 2)}\n`;
    return {
      run_id: packet.run_id,
      packet_id: packet.operation.operation_id,
      packet_hash: packet.packet_hash,
      policy_snapshot: { operation: packet.operation.proposal_kind, schema_version: 2 },
      source_revisions: Object.fromEntries(authorization.authority.claim_set.sources.map((source) => [source.source_id, source.source_revision])),
      committed_at: committedAt,
      writes: [{
        path: packet.target_path,
        before_bytes: packet.before_bytes,
        after_bytes: packet.after_bytes,
        before_sha256: packet.before_sha256,
        after_sha256: packet.after_sha256,
        before_revision: packet.before_bytes === "" ? null : packet.before_sha256,
        post_commit_revision: packet.after_sha256,
      }],
      write_outcome: "committed",
      refresh_outcome: "not_requested",
      git_outcome: "not_requested",
      resurfacing_bindings: [{
        canonical_id: authorization.canonical_id,
        path: packet.target_path,
        revision: packet.after_sha256,
        nonce: packet.nonce,
        final_audit_sha256: core.sha256(finalAuditBytes),
        packet_hash: packet.packet_hash,
        authorization_hash: authorization.authorization_hash,
      }],
      canonical_v2_authority: authorization.authority,
    };
  }
  async function commitApprovedCanonicalV2(request, options = {}) {
    if (!core.plain(request) || core.proxy(request)) return core.reject("malformed_v2_commit_request");
    if (Object.keys(request).some((key) => !["packet", "authorization", "adapter"].includes(key))) return core.reject("unknown_v2_commit_field");
    if (!core.isCanonicalV2Approval(request.authorization) || !core.plain(request.packet) || !core.plain(request.adapter)
      || typeof request.adapter.readBytes !== "function" || typeof request.adapter.readReceipt !== "function" || typeof request.adapter.commitExact !== "function") {
      return core.reject("branded_v2_authorization_required");
    }
    const approval = request.authorization;
    const packet = request.packet;
    const verified = canonicalApi.verifyCanonicalPacket(packet);
    if (!verified.ok) return core.reject(verified.reason);
    if (!authorizable(packet)) return core.reject("canonical_v2_operation_not_authorizable");
    if (approval.packet_hash !== packet.packet_hash) return core.reject("v2_authorization_payload_mismatch");
    if (core.isCanonicalV2ApprovalConsumed(approval)) return core.result("duplicate", { target_path: packet.target_path });
    const now = new Date(options.now || new Date());
    if (!Number.isFinite(now.getTime())) return core.reject("invalid_commit_time");
    if (now.getTime() > Date.parse(packet.expires_at)) return core.reject("approval_expired");
    let prior;
    try { prior = await request.adapter.readReceipt(packet.nonce); }
    catch (_error) { return core.reject("receipt_read_failed"); }
    if (prior !== null) {
      if (core.plain(prior) && prior.result === "committed" && prior.packet_hash === packet.packet_hash && prior.authorization_hash === approval.authorization_hash) {
        core.consumeCanonicalV2Approval(approval);
        return core.result("duplicate", { target_path: packet.target_path });
      }
      return core.reject("nonce_replay_conflict");
    }
    let live;
    try { live = await request.adapter.readBytes(packet.target_path); }
    catch (_error) { return core.reject("live_read_failed"); }
    const expectedLive = packet.operation.proposal_kind === "create" ? null : packet.before_bytes;
    if (live !== expectedLive) return core.reject("stale_before_write");
    const audit = auditFor(packet, approval, now.toISOString());
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
      nonce: packet.nonce,
      audit,
    };
    let committed;
    try { committed = await request.adapter.commitExact(mutation); }
    catch (_error) { return core.reject("canonical_write_failed"); }
    if (!committed || committed.status === "committed_audit_pending") {
      return core.result("committed_audit_pending", { reason: committed && committed.reason || "audit_finalize_failed", write_counts: committed && committed.write_counts || { ...core.ZERO_WRITES, canonical: 1, audit: 1 }, repair: committed && committed.repair });
    }
    if (committed.ok !== true || committed.status !== "committed") return core.reject(committed.reason || "canonical_write_failed", { write_counts: committed.write_counts || core.ZERO_WRITES });
    if (!compensationApi || typeof compensationApi.create !== "function" || typeof request.adapter.appendImmutableAudit !== "function") {
      return core.reject("immutable_audit_authority_unavailable", { write_counts: committed.write_counts || { ...core.ZERO_WRITES, canonical: 1, audit: 1 } });
    }
    const receipt = authorityReceipt(packet, approval, audit, now.toISOString());
    const recorded = await compensationApi.create({ adapter: request.adapter, now: () => now.toISOString() }).recordCompletedCommit({ original_receipt: receipt });
    if (!recorded.ok) return core.result("committed_authority_pending", { reason: recorded.reason || "immutable_audit_append_failed", write_counts: committed.write_counts || { ...core.ZERO_WRITES, canonical: 1, audit: 1 } });
    core.consumeCanonicalV2Approval(approval);
    return core.result("committed", {
      target_path: packet.target_path,
      approval_consumed: true,
      write_counts: { ...core.ZERO_WRITES, canonical: 1, audit: 2 },
      receipt: core.freeze({ canonical_id: approval.canonical_id, packet_hash: packet.packet_hash, authority_audit_hash: recorded.audit.audit_hash }),
    });
  }

  const api = Object.freeze({ authorizeCanonicalV2, commitApprovedCanonicalV2 });
  root.LLMWikiCanonicalV2Authority = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
