(function (root) {
  "use strict";

  const planApi = root.LLMWikiLifecycleMigrationPlan || (typeof require === "function" ? require("./llmwiki-lifecycle-migration-plan.js") : null);
  const adapterApi = root.LLMWikiLifecycleMigrationObsidianAdapter || (typeof require === "function" ? require("./llmwiki-lifecycle-migration-obsidian-adapter.js") : null);
  const candidateStore = root.KnowledgeCandidateStore || (typeof require === "function" ? require("./knowledge-candidate-store.js") : null);
  const literatureStore = root.KnowledgeSourceStore || (typeof require === "function" ? require("./knowledge-source-store.js") : null);
  const writerApi = root.LLMWikiOperationWriter || (typeof require === "function" ? require("./llmwiki-operation-writer.js") : null);
  const obsidianApi = root.LLMWikiObsidianAdapter || (typeof require === "function" ? require("./llmwiki-obsidian-adapter.js") : null);
  const trustApi = root.LLMWikiCanonicalTrust || (typeof require === "function" ? require("./llmwiki-canonical-trust.js") : null);
  const mergeApi = root.LLMWikiMergeTransaction || (typeof require === "function" ? require("./llmwiki-merge-transaction.js") : null);

  function plain(value) { return Boolean(value) && typeof value === "object" && !Array.isArray(value); }
  function freeze(value) {
    if (Array.isArray(value)) return Object.freeze(value.map(freeze));
    if (!plain(value)) return value;
    return Object.freeze(Object.fromEntries(Object.entries(value).map(([key, child]) => [key, freeze(child)])));
  }
  function fail(reason, extras = {}) { return freeze({ ok: false, status: "rejected", reason, approval_consumed: false, ...extras }); }
  function exactStep(plan, kind) { return plan.steps.find((step) => step.kind === kind); }

  async function exactBytes(adapter, step) {
    return await adapter.readExact(step.target_path) === step.after_bytes;
  }

  async function applyCandidate(plan, data, adapter) {
    const step = exactStep(plan, "candidate");
    const saved = await candidateStore.saveCandidate(adapter.app, data.private_steps[0].candidate_input, { promotion_receipt: data.private_steps[0].promotion_receipt, now: data.private_steps[0].now });
    return saved.path === step.target_path && await exactBytes(adapter, step) ? null : "candidate_exact_bytes_mismatch";
  }

  async function applyLiterature(plan, data, adapter) {
    const step = exactStep(plan, "literature");
    const saved = await literatureStore.saveSource(adapter.app, data.private_steps[0].literature_input, { now: data.private_steps[0].now });
    return saved.path === step.target_path && await exactBytes(adapter, step) ? null : "literature_exact_bytes_mismatch";
  }

  async function applyPara(plan, data, adapter) {
    const step = exactStep(plan, "para");
    const privateStep = data.private_steps[0];
    const result = await privateStep.service.apply(adapter.app, { proposal: privateStep.proposal, approval: { object_type: privateStep.proposal.object_type, handoff_id: privateStep.proposal.handoff_id, decision: "approve" } });
    return result?.ok === true && result.status === "appended" && await exactBytes(adapter, step) ? null : "para_exact_bytes_mismatch";
  }

  async function applyCanonical(context) {
    const step = exactStep(context.plan, "canonical");
    const request = context.data.private_steps[0].request;
    const canonicalAdapter = obsidianApi.createObsidianAdapter(context.adapter.app);
    const committed = await writerApi.commitApprovedCanonicalV2({ packet: request.packet, authorization: request.authorization, adapter: canonicalAdapter }, context.options);
    if (!committed?.ok || committed.status !== "committed" || !await exactBytes(context.adapter, step)) return committed?.reason || "canonical_finalize_failed";
    const authorities = await canonicalAdapter.readFinalizedCanonicalAuthorities();
    const receipt = authorities.find((value) => {
      const binding = obsidianApi.finalizedCanonicalAuthorityData(value);
      return binding?.path === step.target_path && binding.revision === step.after_sha256;
    });
    if (!receipt || !obsidianApi.isFinalizedCanonicalAuthority(receipt)) return "canonical_finalize_failed";
    const authority = obsidianApi.finalizedCanonicalAuthorityData(receipt)?.canonical_v2_authority;
    const decision = trustApi.decideFinalized({ bytes: step.after_bytes, revision: step.after_sha256, receipt, source_revisions: Object.fromEntries((authority?.claim_set?.sources || []).map((source) => [source.source_id, source.source_revision])) });
    return trustApi.isVerified(decision) ? null : "todo13_authority_unverified";
  }

  async function applyMerge(context) {
    if (context.plan.merge_intent === "none") return null;
    const privateStep = context.data.private_steps.find((entry, index) => index > 0 && plain(entry.request) && mergeApi.isMergePacket(entry.request.packet));
    if (!privateStep) return "approved_merge_request_required";
    const committed = await mergeApi.commitApprovedMerge({ ...privateStep.request, adapter: obsidianApi.createObsidianAdapter(context.adapter.app) }, context.options);
    if (!committed?.ok || committed.status !== "committed" || committed.receipt.source_deletes !== 0) return committed?.reason || "merge_commit_failed";
    for (const step of context.plan.steps.filter((entry) => entry.kind === "merge")) if (!await exactBytes(context.adapter, step)) return "merge_exact_bytes_mismatch";
    return null;
  }

  async function abortBackupFailure(input) {
    const aborted = await input.adapter.abort(input.reservation);
    const clean = aborted?.ok === true;
    return fail("backup_failed", { compensation: freeze({ recovery_version: "llmwiki_lifecycle_recovery_v2", status: clean ? "not_needed" : "manual_restore_required", reason: "backup_failed", plan_digest: input.approval.packet.plan_digest, authorization_hash: input.approval.authorization_hash, reservation_aborted: clean, snapshot_status: "unknown" }) });
  }

  async function compensate(input) {
    const restored = await input.adapter.restore(input.snapshot, input.reservation);
    const aborted = await input.adapter.abort(input.reservation);
    const exact = restored?.ok === true && aborted?.ok === true;
    return fail(exact ? input.reason : "compensation_failed", { compensation: freeze({ recovery_version: "llmwiki_lifecycle_recovery_v2", status: exact ? "restored" : "manual_restore_required", reason: input.reason, plan_digest: input.approval.packet.plan_digest, authorization_hash: input.approval.authorization_hash, snapshot: input.snapshot }) });
  }

  async function execute(request = {}, options = {}) {
    if (!planApi.verifyPlan(request.plan) || !adapterApi.isProductionAdapter(request.adapter)
      || !writerApi.isLifecycleMigrationApproval(request.approval)) return fail("sealed_plan_production_adapter_and_approval_required");
    const verified = writerApi.verifyLifecycleMigrationApproval(request.approval, { plan: request.plan }, options);
    if (!verified.ok) return verified;
    const plan = request.plan;
    const adapter = request.adapter;
    const reserved = await adapter.reserve(request.approval.packet.nonce, plan.plan_digest, request.approval.authorization_hash);
    if (!reserved.ok) return fail(reserved.reason);
    if (reserved.status === "duplicate") return freeze({ ok: true, status: "duplicate", approval_consumed: true, receipt: reserved.receipt });
    const reservation = reserved.reservation;
    let captured;
    try { captured = await adapter.snapshot(plan.steps.map((step) => step.target_path)); }
    catch (_error) { return abortBackupFailure({ adapter, reservation, approval: request.approval }); }
    if (!captured?.ok || !captured.snapshot?.complete) return abortBackupFailure({ adapter, reservation, approval: request.approval });
    const snapshot = captured.snapshot;
    const data = planApi.authorityData(plan);
    let reason = null;
    try {
      switch (plan.disposition) {
        case "candidate_migrate": reason = await applyCandidate(plan, data, adapter); break;
        case "literature_reclassify": reason = await applyLiterature(plan, data, adapter); break;
        case "para_handoff": reason = await applyPara(plan, data, adapter); break;
        case "adopt_update":
          reason = await applyCanonical({ plan, data, adapter, options });
          if (!reason) reason = await applyMerge({ plan, data, adapter, options });
          break;
        case "hold_quarantine":
        case "legacy_unchanged":
        case "noop": break;
        default: reason = "unknown_disposition";
      }
    } catch (_error) { reason = "authority_write_failed"; }
    if (reason) return compensate({ adapter, snapshot, reservation, approval: request.approval, reason });
    const receipt = freeze({ receipt_version: "llmwiki_lifecycle_migration_receipt_v3", status: "committed", nonce: request.approval.packet.nonce, plan_digest: plan.plan_digest, authorization_hash: request.approval.authorization_hash, disposition: plan.disposition, operation: plan.operation, source_action: plan.source_action, finalization_intent: plan.finalization_intent, merge_intent: plan.merge_intent, target_paths: plan.steps.map((step) => step.target_path), writes: plan.steps.map((step) => ({ target_path: step.target_path, after_sha256: step.after_sha256 })), deletions: [] });
    const consumed = await adapter.commit(reservation, receipt);
    if (!consumed.ok) return compensate({ adapter, snapshot, reservation, approval: request.approval, reason: consumed.reason || "consumption_commit_failed" });
    return freeze({ ok: true, status: "committed", approval_consumed: true, receipt, write_counts: freeze({ canonical: plan.steps.length, audit: 1, derived: 0, provider: 0, network: 0, git: 0 }) });
  }

  const api = Object.freeze({ execute });
  root.LLMWikiLifecycleMigrationTransaction = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
