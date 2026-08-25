(function (root) {
  "use strict";

  const canonicalApi = root.LLMWikiCanonicalPacket
    || (typeof require === "function" ? require("./llmwiki-canonical-packet.js") : null);
  const core = root.LLMWikiOperationWriterCore
    || (typeof require === "function" ? require("./llmwiki-operation-writer-core.js") : null);
  const bridgeApi = root.LLMWikiFinalizedRevisionBridge
    || (typeof require === "function" ? require("./llmwiki-finalized-revision-bridge.js") : null);
  const APPROVAL_INPUT_FIELDS = new Set(["packet", "canonical_id", "evidence", "compensation_plan"]);
  const COMPENSATION_FIELDS = new Set(["strategy", "target_path", "before_sha256"]);

  function validateApprovalInput(input) {
    if (!core.plain(input) || core.proxy(input) || !core.safelyInspectable(input)) return core.reject("malformed_update_approval");
    for (const key of Object.keys(input)) if (!APPROVAL_INPUT_FIELDS.has(key)) return core.reject("unknown_approval_field", { field: key });
    if (!canonicalApi) return core.reject("canonical_packet_contract_missing");
    const verified = canonicalApi.verifyCanonicalPacket(input.packet);
    if (!verified.ok) return core.reject(verified.reason);
    if (input.packet.operation.proposal_kind !== "update") return core.reject("update_operation_required");
    if (!core.ID.test(input.canonical_id)) return core.reject("invalid_canonical_id");
    if (core.utf8Length(input.packet.before_bytes) > core.MAX_CANONICAL_BYTES || core.utf8Length(input.packet.after_bytes) > core.MAX_CANONICAL_BYTES) {
      return core.reject("canonical_bytes_too_large");
    }
    const evidence = input.evidence;
    if (!core.plain(evidence) || evidence.contract_version !== "llmwiki_evidence_contract_v1"
      || evidence.operation_id !== input.packet.operation.operation_id || evidence.approval_eligible !== true
      || evidence.stale !== false || !Array.isArray(evidence.claim_lineage) || evidence.claim_lineage.length === 0) {
      return core.reject("approval_eligible_evidence_required");
    }
    const plan = input.compensation_plan;
    if (!core.plain(plan)) return core.reject("compensation_plan_required");
    for (const key of Object.keys(plan)) if (!COMPENSATION_FIELDS.has(key)) return core.reject("invalid_compensation_plan");
    if (plan.strategy !== "restore_exact_before_bytes" || plan.target_path !== input.packet.target_path
      || plan.before_sha256 !== input.packet.before_sha256) return core.reject("invalid_compensation_plan");
    return null;
  }
  function authorizeCanonicalUpdate(input) {
    const invalid = validateApprovalInput(input);
    if (invalid) return invalid;
    const packet = input.packet;
    const evidence = core.clone(input.evidence);
    const compensationPlan = {
      strategy: "restore_exact_before_bytes",
      target_path: packet.target_path,
      before_bytes: packet.before_bytes,
      before_sha256: packet.before_sha256,
    };
    const body = {
      approval_version: core.APPROVAL_VERSION,
      canonical_id: input.canonical_id,
      target_path: packet.target_path,
      operation_id: packet.operation.operation_id,
      proposal_id: packet.operation.proposal_id,
      packet_hash: packet.packet_hash,
      base_revision: packet.live_revision,
      base_sha256: packet.before_sha256,
      before_bytes: packet.before_bytes,
      before_sha256: packet.before_sha256,
      after_bytes: packet.after_bytes,
      after_sha256: packet.after_sha256,
      evidence_contract_version: evidence.contract_version,
      evidence_hash: core.sha256(core.stable(evidence)),
      evidence,
      compensation_plan: compensationPlan,
      compensation_plan_hash: core.sha256(core.stable(compensationPlan)),
      expires_at: packet.expires_at,
      nonce: packet.nonce,
    };
    const approval = core.freeze({ ...body, authorization_hash: core.sha256(core.stable(body)) });
    core.brandUpdateApproval(approval);
    return core.success(approval);
  }
  function validateRequest(request) {
    if (!core.plain(request) || core.proxy(request) || !core.safelyInspectable(request)) return core.reject("malformed_request");
    for (const key of Object.keys(request)) if (!["packet", "authorization", "adapter"].includes(key)) return core.reject("unknown_request_field", { field: key });
    if (!core.plain(request.packet) || !core.isUpdateApproval(request.authorization)) return core.reject("branded_update_approval_required");
    if (!core.plain(request.adapter) || core.proxy(request.adapter)
      || typeof request.adapter.readCanonical !== "function"
      || typeof request.adapter.atomicReplace !== "function"
      || typeof request.adapter.restoreExact !== "function") return core.reject("update_adapter_required");
    const verified = canonicalApi.verifyCanonicalPacket(request.packet);
    if (!verified.ok) return core.reject(verified.reason);
    const packet = request.packet;
    const approval = request.authorization;
    if (packet.operation.proposal_kind !== "update" || approval.packet_hash !== packet.packet_hash
      || approval.target_path !== packet.target_path || approval.operation_id !== packet.operation.operation_id
      || approval.base_revision !== packet.live_revision || approval.before_bytes !== packet.before_bytes
      || approval.before_sha256 !== packet.before_sha256 || approval.after_bytes !== packet.after_bytes
      || approval.after_sha256 !== packet.after_sha256) return core.reject("update_approval_payload_mismatch");
    return null;
  }
  async function readSnapshot(adapter, targetPath) {
    let value;
    try { value = await adapter.readCanonical(targetPath); }
    catch (_error) { return core.reject("canonical_read_failed"); }
    if (typeof value === "string") return { path: targetPath, bytes: value };
    if (!core.plain(value) || value.path !== targetPath || typeof value.bytes !== "string") return core.reject("invalid_canonical_read_result");
    return { path: value.path, bytes: value.bytes, metadata: core.plain(value.metadata) ? core.clone(value.metadata) : null };
  }
  function preparedCompensation(packet, approval, preparedAt) {
    return core.freeze({
      compensation_version: core.COMPENSATION_VERSION,
      status: "prepared",
      prepared_at: preparedAt,
      canonical_id: approval.canonical_id,
      target_path: packet.target_path,
      restore_bytes: packet.before_bytes,
      restore_sha256: packet.before_sha256,
      replace_sha256: packet.after_sha256,
      packet_hash: packet.packet_hash,
      authorization_hash: approval.authorization_hash,
    });
  }
  function replaceRequest(packet, approval, compensation) {
    return core.issueReplaceRequest(core.freeze({
      target_path: packet.target_path,
      expected_before_bytes: packet.before_bytes,
      expected_before_sha256: packet.before_sha256,
      after_bytes: packet.after_bytes,
      after_sha256: packet.after_sha256,
      packet_hash: packet.packet_hash,
      authorization_hash: approval.authorization_hash,
      compensation,
    }));
  }
  function restoreRequest(packet, approval, compensation, currentBytes) {
    return core.issueRestoreRequest(core.freeze({
      target_path: packet.target_path,
      expected_written_bytes: currentBytes,
      expected_written_sha256: core.sha256(currentBytes),
      restore_bytes: packet.before_bytes,
      restore_sha256: packet.before_sha256,
      packet_hash: packet.packet_hash,
      authorization_hash: approval.authorization_hash,
      compensation,
    }));
  }
  async function compensate(packet, approval, adapter, compensation, reason, replaceWasAuthorized) {
    const current = await readSnapshot(adapter, packet.target_path);
    if (current.ok === false) return { ok: false, reason: "compensation_read_failed", receipt: core.freeze({ ...compensation, status: "manual_restore_required", failure_reason: reason }) };
    if (current.bytes === packet.before_bytes) return { ok: true, receipt: core.freeze({ ...compensation, status: "not_needed", failure_reason: reason }) };
    if (!replaceWasAuthorized) return { ok: false, reason: "compensation_target_mismatch", receipt: core.freeze({ ...compensation, status: "manual_restore_required", failure_reason: reason }) };
    const request = restoreRequest(packet, approval, compensation, current.bytes);
    try { await adapter.restoreExact(request); }
    catch (_error) { return { ok: false, reason: "compensation_restore_failed", receipt: core.freeze({ ...compensation, status: "manual_restore_required", failure_reason: reason }) }; }
    if (!core.restoreRequestConsumed(request)) return { ok: false, reason: "untrusted_compensation_writer", receipt: core.freeze({ ...compensation, status: "manual_restore_required", failure_reason: reason }) };
    const restored = await readSnapshot(adapter, packet.target_path);
    if (restored.ok === false || restored.bytes !== packet.before_bytes || core.sha256(restored.bytes) !== packet.before_sha256) {
      return { ok: false, reason: "compensation_verify_failed", receipt: core.freeze({ ...compensation, status: "manual_restore_required", failure_reason: reason }) };
    }
    return { ok: true, receipt: core.freeze({ ...compensation, status: "restored", restored_sha256: packet.before_sha256, failure_reason: reason }) };
  }
  async function commitApprovedUpdate(request, options = {}) {
    const invalid = validateRequest(request);
    if (invalid) return invalid;
    const packet = request.packet;
    const approval = request.authorization;
    const now = new Date(options.now || new Date());
    if (!Number.isFinite(now.getTime())) return core.reject("invalid_commit_time");
    if (now.getTime() > Date.parse(approval.expires_at)) return core.reject("approval_expired");
    if (core.isApprovalConsumed(approval)) return core.result("duplicate", { target_path: packet.target_path });
    if (!core.lockTarget(packet.target_path)) return core.reject("target_locked");
    try {
      if (core.isApprovalConsumed(approval)) return core.result("duplicate", { target_path: packet.target_path });
      const live = await readSnapshot(request.adapter, packet.target_path);
      if (live.ok === false) return live;
      if (live.bytes !== packet.before_bytes || core.sha256(live.bytes) !== packet.before_sha256) return core.reject("stale_before_write");
      const compensation = preparedCompensation(packet, approval, now.toISOString());
      const issued = replaceRequest(packet, approval, compensation);
      let replaceFailure = null;
      try { await request.adapter.atomicReplace(issued); }
      catch (error) { replaceFailure = error && error.code === "stale_before_write" ? "stale_before_write" : "atomic_replace_failed"; }
      if (!replaceFailure && !core.replaceRequestConsumed(issued)) replaceFailure = "untrusted_writer_result";
      const written = await readSnapshot(request.adapter, packet.target_path);
      const exactAfter = written.ok !== false && written.bytes === packet.after_bytes && core.sha256(written.bytes) === packet.after_sha256;
      if (replaceFailure || !exactAfter) {
        const reason = replaceFailure || "written_bytes_mismatch";
        const restored = await compensate(packet, approval, request.adapter, compensation, reason, core.replaceRequestConsumed(issued));
        return core.reject(restored.ok ? reason : restored.reason, { compensation: restored.receipt, compensation_prepared: true });
      }
      const bridged = await bridgeApi.bridgeFinalizedRevision(packet, approval, request.adapter, now.toISOString());
      if (bridged && bridged.ok === false) return bridged;
      core.consumeUpdateApproval(approval);
      const receipt = core.freeze({
        receipt_version: core.RECEIPT_VERSION,
        result: "committed",
        committed_at: now.toISOString(),
        canonical_id: approval.canonical_id,
        target_path: packet.target_path,
        packet_hash: packet.packet_hash,
        authorization_hash: approval.authorization_hash,
        base_revision: packet.live_revision,
        before_sha256: packet.before_sha256,
        after_sha256: packet.after_sha256,
        evidence_hash: approval.evidence_hash,
        compensation: core.freeze({ ...compensation, status: "prepared" }),
      });
      return core.result("committed", {
        write_counts: { ...core.ZERO_WRITES, canonical: 1 },
        approval_consumed: true,
        target_path: packet.target_path,
        receipt,
        compensation_prepared: true,
      });
    } finally { core.unlockTarget(packet.target_path); }
  }

  const api = Object.freeze({ authorizeCanonicalUpdate, commitApprovedUpdate });
  root.LLMWikiUpdateAuthority = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
