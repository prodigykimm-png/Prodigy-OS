(function (root) {
  "use strict";

  const claimApi = root.LLMWikiClaimProvenance
    || (typeof require === "function" ? require("./llmwiki-claim-provenance.js") : null);
  const promotionApi = root.LLMWikiPromotionContract
    || (typeof require === "function" ? require("./llmwiki-promotion-contract.js") : null);
  const lifecyclePlanApi = root.LLMWikiLifecycleMigrationPlan
    || (typeof require === "function" ? require("./llmwiki-lifecycle-migration-plan.js") : null);
  const core = root.LLMWikiOperationWriterCore
    || (typeof require === "function" ? require("./llmwiki-operation-writer-core.js") : null);

  function authorizeLifecycleMigration(input) {
    if (!core.plain(input) || Object.keys(input).some((key) => !["plan", "claim_set", "promotion_input", "promotion_receipt", "expires_at", "nonce"].includes(key))
      || !lifecyclePlanApi?.verifyPlan?.(input.plan)) return core.reject("sealed_lifecycle_plan_required");
    const claims = claimApi?.validateClaimSet?.(input.claim_set);
    if (!claims?.ok || input.claim_set.status !== "accepted" || input.claim_set.claims.some((claim) => claim.status !== "accepted")) return core.reject("accepted_claim_set_required");
    let expected;
    try { expected = promotionApi.evaluatePromotion(promotionApi.normalizePromotionInput(input.promotion_input)); }
    catch (_error) { return core.reject("promotion_receipt_invalid"); }
    if (input.promotion_input.claim_set_hash !== input.claim_set.claim_set_hash || core.stable(expected) !== core.stable(input.promotion_receipt)) return core.reject("promotion_receipt_invalid");
    const eligible = input.plan.disposition === "candidate_migrate" ? expected.candidate_eligible : expected.canonical_write_eligible;
    if (!["hold_quarantine", "legacy_unchanged", "noop"].includes(input.plan.disposition) && !eligible) return core.reject("promotion_ineligible");
    if (typeof input.expires_at !== "string" || !Number.isFinite(Date.parse(input.expires_at))
      || typeof input.nonce !== "string" || !/^[A-Za-z0-9_-]{16,128}$/u.test(input.nonce)) return core.reject("invalid_lifecycle_expiry_or_nonce");
    const projection = lifecyclePlanApi.packetProjection(input.plan);
    const packet = core.freeze({
      packet_version: "llmwiki_lifecycle_migration_packet_v3",
      ...projection,
      inventory_digest: input.plan.inventory_digest,
      source_path: input.plan.source_path,
      source_revision: input.plan.source_revision,
      source_bytes: input.plan.source_bytes,
      source_sha256: input.plan.source_sha256,
      expires_at: input.expires_at,
      nonce: input.nonce,
      claim_set_hash: input.claim_set.claim_set_hash,
      promotion_receipt_hash: core.sha256(core.stable(expected)),
    });
    const body = { authorization_version: "llmwiki_lifecycle_migration_authorization_v3", packet, claim_set: core.clone(input.claim_set), promotion_receipt: core.clone(expected) };
    const approval = core.freeze({ ...body, authorization_hash: core.sha256(core.stable(body)) });
    core.brandLifecycleApproval(approval);
    return core.success(approval);
  }
  function verifyLifecycleMigrationApproval(approval, context = {}, options = {}) {
    if (!approval || !core.isLifecycleMigrationApproval(approval) || !lifecyclePlanApi.verifyPlan(context.plan)) return core.reject("branded_lifecycle_approval_required");
    const packet = approval.packet;
    const projection = lifecyclePlanApi.packetProjection(context.plan);
    if (packet.plan_digest !== context.plan.plan_digest || packet.inventory_digest !== context.plan.inventory_digest
      || packet.source_path !== context.plan.source_path || packet.source_revision !== context.plan.source_revision
      || packet.source_bytes !== context.plan.source_bytes || packet.source_sha256 !== context.plan.source_sha256
      || core.stable(projection) !== core.stable({ plan_digest: packet.plan_digest, disposition: packet.disposition, operation: packet.operation, source_action: packet.source_action, finalization_intent: packet.finalization_intent, merge_intent: packet.merge_intent, authority_methods: packet.authority_methods, target_paths: packet.target_paths, writes: packet.writes })) return core.reject("approval_plan_mismatch");
    const now = new Date(options.now || new Date());
    if (!Number.isFinite(now.getTime())) return core.reject("invalid_commit_time");
    if (now.getTime() > Date.parse(packet.expires_at)) return core.reject("approval_expired");
    if (approval.claim_set.claim_set_hash !== packet.claim_set_hash || core.sha256(core.stable(approval.promotion_receipt)) !== packet.promotion_receipt_hash) return core.reject("approval_authority_mismatch");
    return core.success(core.freeze({ nonce: packet.nonce, plan_digest: packet.plan_digest, authorization_hash: approval.authorization_hash }));
  }

  const api = Object.freeze({ authorizeLifecycleMigration, verifyLifecycleMigrationApproval });
  root.LLMWikiLifecycleMigrationAuthority = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
