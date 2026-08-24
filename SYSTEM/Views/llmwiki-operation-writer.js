(function (root) {
  "use strict";

  const canonicalApi = root.LLMWikiCanonicalPacket
    || (typeof require === "function" ? require("./llmwiki-canonical-packet.js") : null);
  const nodeTypes = typeof require === "function" ? require("node:util").types : null;

  const APPROVAL_VERSION = "llmwiki_revision_bound_update_approval_v1";
  const RECEIPT_VERSION = "llmwiki_update_operation_receipt_v1";
  const COMPENSATION_VERSION = "llmwiki_exact_restore_compensation_v1";
  const MAX_CANONICAL_BYTES = 1024 * 1024;
  const ID = /^[a-z][a-z0-9_-]{2,127}$/u;
  const HASH = /^[0-9a-f]{64}$/u;
  const ZERO_WRITES = Object.freeze({ canonical: 0, audit: 0, derived: 0, provider: 0, network: 0, git: 0 });
  const APPROVAL_INPUT_FIELDS = new Set(["packet", "canonical_id", "evidence", "compensation_plan"]);
  const COMPENSATION_FIELDS = new Set(["strategy", "target_path", "before_sha256"]);
  const UPDATE_APPROVALS = new WeakSet();
  const CONSUMED_APPROVALS = new WeakSet();
  const REPLACE_REQUESTS = new WeakSet();
  const CONSUMED_REPLACE_REQUESTS = new WeakSet();
  const RESTORE_REQUESTS = new WeakSet();
  const CONSUMED_RESTORE_REQUESTS = new WeakSet();
  const targetLocks = new Set();

  function plain(value) {
    if (!value || typeof value !== "object" || Array.isArray(value)) return false;
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
  }
  function proxy(value) { return Boolean(nodeTypes && value && nodeTypes.isProxy(value)); }
  function stable(value) {
    if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
    if (!plain(value)) return JSON.stringify(value);
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stable(value[key])}`).join(",")}}`;
  }
  function clone(value) { return JSON.parse(JSON.stringify(value)); }
  function freeze(value) {
    if (Array.isArray(value)) return Object.freeze(value.map(freeze));
    if (!plain(value)) return value;
    return Object.freeze(Object.fromEntries(Object.entries(value).map(([key, child]) => [key, freeze(child)])));
  }
  function sha256(value) { return canonicalApi.sha256(String(value)); }
  function utf8Length(value) { return typeof Buffer === "function" ? Buffer.byteLength(value, "utf8") : new TextEncoder().encode(value).length; }
  function result(status, extras = {}) {
    return freeze({
      ok: status === "committed" || status === "duplicate",
      status,
      write_counts: ZERO_WRITES,
      approval_consumed: false,
      source_deletes: 0,
      git_calls: 0,
      ...extras,
    });
  }
  function reject(reason, extras = {}) { return result("rejected", { reason, ...extras }); }
  function success(value) { return Object.freeze({ ok: true, status: "authorized", value, write_counts: ZERO_WRITES }); }

  function safelyInspectable(value, limits = {}) {
    const maxNodes = limits.maxNodes || 4096;
    const maxDepth = limits.maxDepth || 32;
    const stack = [[value, 0]];
    const seen = new Set();
    let nodes = 0;
    try {
      while (stack.length) {
        const [current, depth] = stack.pop();
        nodes += 1;
        if (nodes > maxNodes || depth > maxDepth) return false;
        if (!current || typeof current !== "object") continue;
        if (proxy(current) || seen.has(current)) return false;
        seen.add(current);
        const prototype = Object.getPrototypeOf(current);
        if (Array.isArray(current)) {
          if (prototype !== Array.prototype || current.length > 2048) return false;
        } else if (prototype !== Object.prototype && prototype !== null) return false;
        const descriptors = Object.getOwnPropertyDescriptors(current);
        for (const key of Reflect.ownKeys(descriptors)) {
          if (typeof key !== "string") return false;
          const descriptor = descriptors[key];
          if (Object.hasOwn(descriptor, "get") || Object.hasOwn(descriptor, "set")) return false;
          if (key !== "length") stack.push([descriptor.value, depth + 1]);
        }
      }
      return true;
    } catch (_error) { return false; }
  }

  function validateApprovalInput(input) {
    if (!plain(input) || proxy(input) || !safelyInspectable(input)) return reject("malformed_update_approval");
    for (const key of Object.keys(input)) if (!APPROVAL_INPUT_FIELDS.has(key)) return reject("unknown_approval_field", { field: key });
    if (!canonicalApi) return reject("canonical_packet_contract_missing");
    const verified = canonicalApi.verifyCanonicalPacket(input.packet);
    if (!verified.ok) return reject(verified.reason);
    if (input.packet.operation.proposal_kind !== "update") return reject("update_operation_required");
    if (!ID.test(input.canonical_id)) return reject("invalid_canonical_id");
    if (utf8Length(input.packet.before_bytes) > MAX_CANONICAL_BYTES || utf8Length(input.packet.after_bytes) > MAX_CANONICAL_BYTES) {
      return reject("canonical_bytes_too_large");
    }
    const evidence = input.evidence;
    if (!plain(evidence) || evidence.contract_version !== "llmwiki_evidence_contract_v1"
      || evidence.operation_id !== input.packet.operation.operation_id || evidence.approval_eligible !== true
      || evidence.stale !== false || !Array.isArray(evidence.claim_lineage) || evidence.claim_lineage.length === 0) {
      return reject("approval_eligible_evidence_required");
    }
    const plan = input.compensation_plan;
    if (!plain(plan)) return reject("compensation_plan_required");
    for (const key of Object.keys(plan)) if (!COMPENSATION_FIELDS.has(key)) return reject("invalid_compensation_plan");
    if (plan.strategy !== "restore_exact_before_bytes" || plan.target_path !== input.packet.target_path
      || plan.before_sha256 !== input.packet.before_sha256) return reject("invalid_compensation_plan");
    return null;
  }

  function authorizeCanonicalUpdate(input) {
    const invalid = validateApprovalInput(input);
    if (invalid) return invalid;
    const packet = input.packet;
    const evidence = clone(input.evidence);
    const compensationPlan = {
      strategy: "restore_exact_before_bytes",
      target_path: packet.target_path,
      before_bytes: packet.before_bytes,
      before_sha256: packet.before_sha256,
    };
    const body = {
      approval_version: APPROVAL_VERSION,
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
      evidence_hash: sha256(stable(evidence)),
      evidence,
      compensation_plan: compensationPlan,
      compensation_plan_hash: sha256(stable(compensationPlan)),
      expires_at: packet.expires_at,
      nonce: packet.nonce,
    };
    const approval = freeze({ ...body, authorization_hash: sha256(stable(body)) });
    UPDATE_APPROVALS.add(approval);
    return success(approval);
  }

  function isUpdateApproval(value) { return Boolean(value && UPDATE_APPROVALS.has(value)); }
  function isApprovalConsumed(value) { return Boolean(value && CONSUMED_APPROVALS.has(value)); }

  function validateRequest(request) {
    if (!plain(request) || proxy(request) || !safelyInspectable(request)) return reject("malformed_request");
    for (const key of Object.keys(request)) if (!["packet", "authorization", "adapter"].includes(key)) return reject("unknown_request_field", { field: key });
    if (!plain(request.packet) || !isUpdateApproval(request.authorization)) return reject("branded_update_approval_required");
    if (!plain(request.adapter) || proxy(request.adapter)
      || typeof request.adapter.readCanonical !== "function"
      || typeof request.adapter.atomicReplace !== "function"
      || typeof request.adapter.restoreExact !== "function") return reject("update_adapter_required");
    const verified = canonicalApi.verifyCanonicalPacket(request.packet);
    if (!verified.ok) return reject(verified.reason);
    const packet = request.packet;
    const approval = request.authorization;
    if (packet.operation.proposal_kind !== "update" || approval.packet_hash !== packet.packet_hash
      || approval.target_path !== packet.target_path || approval.operation_id !== packet.operation.operation_id
      || approval.base_revision !== packet.live_revision || approval.before_bytes !== packet.before_bytes
      || approval.before_sha256 !== packet.before_sha256 || approval.after_bytes !== packet.after_bytes
      || approval.after_sha256 !== packet.after_sha256) return reject("update_approval_payload_mismatch");
    return null;
  }

  async function readSnapshot(adapter, targetPath) {
    let value;
    try { value = await adapter.readCanonical(targetPath); }
    catch (_error) { return reject("canonical_read_failed"); }
    if (typeof value === "string") return { path: targetPath, bytes: value };
    if (!plain(value) || value.path !== targetPath || typeof value.bytes !== "string") return reject("invalid_canonical_read_result");
    return { path: value.path, bytes: value.bytes, metadata: plain(value.metadata) ? clone(value.metadata) : null };
  }

  function preparedCompensation(packet, approval, preparedAt) {
    return freeze({
      compensation_version: COMPENSATION_VERSION,
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

  function issueReplaceRequest(packet, approval, compensation) {
    const request = freeze({
      target_path: packet.target_path,
      expected_before_bytes: packet.before_bytes,
      expected_before_sha256: packet.before_sha256,
      after_bytes: packet.after_bytes,
      after_sha256: packet.after_sha256,
      packet_hash: packet.packet_hash,
      authorization_hash: approval.authorization_hash,
      compensation,
    });
    REPLACE_REQUESTS.add(request);
    return request;
  }

  function assertAtomicReplaceRequest(request, currentBytes) {
    if (!request || !REPLACE_REQUESTS.has(request) || CONSUMED_REPLACE_REQUESTS.has(request)) {
      const error = new Error("unbranded_atomic_replace_request"); error.code = "unbranded_atomic_replace_request"; throw error;
    }
    if (typeof currentBytes !== "string" || currentBytes !== request.expected_before_bytes
      || sha256(currentBytes) !== request.expected_before_sha256) {
      const error = new Error("stale_before_write"); error.code = "stale_before_write"; throw error;
    }
    CONSUMED_REPLACE_REQUESTS.add(request);
    return true;
  }

  function issueRestoreRequest(packet, approval, compensation, currentBytes) {
    const request = freeze({
      target_path: packet.target_path,
      expected_written_bytes: currentBytes,
      expected_written_sha256: sha256(currentBytes),
      restore_bytes: packet.before_bytes,
      restore_sha256: packet.before_sha256,
      packet_hash: packet.packet_hash,
      authorization_hash: approval.authorization_hash,
      compensation,
    });
    RESTORE_REQUESTS.add(request);
    return request;
  }

  function assertRestoreRequest(request, currentBytes) {
    if (!request || !RESTORE_REQUESTS.has(request) || CONSUMED_RESTORE_REQUESTS.has(request)) {
      const error = new Error("unbranded_restore_request"); error.code = "unbranded_restore_request"; throw error;
    }
    if (typeof currentBytes !== "string" || currentBytes !== request.expected_written_bytes
      || sha256(currentBytes) !== request.expected_written_sha256) {
      const error = new Error("restore_target_mismatch"); error.code = "restore_target_mismatch"; throw error;
    }
    CONSUMED_RESTORE_REQUESTS.add(request);
    return true;
  }

  async function compensate(packet, approval, adapter, compensation, reason, replaceWasAuthorized) {
    const current = await readSnapshot(adapter, packet.target_path);
    if (current.ok === false) return { ok: false, reason: "compensation_read_failed", receipt: freeze({ ...compensation, status: "manual_restore_required", failure_reason: reason }) };
    if (current.bytes === packet.before_bytes) return { ok: true, receipt: freeze({ ...compensation, status: "not_needed", failure_reason: reason }) };
    if (!replaceWasAuthorized) return { ok: false, reason: "compensation_target_mismatch", receipt: freeze({ ...compensation, status: "manual_restore_required", failure_reason: reason }) };
    const restoreRequest = issueRestoreRequest(packet, approval, compensation, current.bytes);
    try { await adapter.restoreExact(restoreRequest); }
    catch (_error) { return { ok: false, reason: "compensation_restore_failed", receipt: freeze({ ...compensation, status: "manual_restore_required", failure_reason: reason }) }; }
    if (!CONSUMED_RESTORE_REQUESTS.has(restoreRequest)) return { ok: false, reason: "untrusted_compensation_writer", receipt: freeze({ ...compensation, status: "manual_restore_required", failure_reason: reason }) };
    const restored = await readSnapshot(adapter, packet.target_path);
    if (restored.ok === false || restored.bytes !== packet.before_bytes || sha256(restored.bytes) !== packet.before_sha256) {
      return { ok: false, reason: "compensation_verify_failed", receipt: freeze({ ...compensation, status: "manual_restore_required", failure_reason: reason }) };
    }
    return { ok: true, receipt: freeze({ ...compensation, status: "restored", restored_sha256: packet.before_sha256, failure_reason: reason }) };
  }

  async function commitApprovedUpdate(request, options = {}) {
    const invalid = validateRequest(request);
    if (invalid) return invalid;
    const packet = request.packet;
    const approval = request.authorization;
    const now = new Date(options.now || new Date());
    if (!Number.isFinite(now.getTime())) return reject("invalid_commit_time");
    if (now.getTime() > Date.parse(approval.expires_at)) return reject("approval_expired");
    if (CONSUMED_APPROVALS.has(approval)) return result("duplicate", { target_path: packet.target_path });
    if (targetLocks.has(packet.target_path)) return reject("target_locked");
    targetLocks.add(packet.target_path);
    try {
      if (CONSUMED_APPROVALS.has(approval)) return result("duplicate", { target_path: packet.target_path });
      const live = await readSnapshot(request.adapter, packet.target_path);
      if (live.ok === false) return live;
      if (live.bytes !== packet.before_bytes || sha256(live.bytes) !== packet.before_sha256) return reject("stale_before_write");

      const compensation = preparedCompensation(packet, approval, now.toISOString());
      const replaceRequest = issueReplaceRequest(packet, approval, compensation);
      let replaceFailure = null;
      try { await request.adapter.atomicReplace(replaceRequest); }
      catch (error) { replaceFailure = error && error.code === "stale_before_write" ? "stale_before_write" : "atomic_replace_failed"; }
      if (!replaceFailure && !CONSUMED_REPLACE_REQUESTS.has(replaceRequest)) replaceFailure = "untrusted_writer_result";

      const written = await readSnapshot(request.adapter, packet.target_path);
      const exactAfter = written.ok !== false && written.bytes === packet.after_bytes && sha256(written.bytes) === packet.after_sha256;
      if (replaceFailure || !exactAfter) {
        const reason = replaceFailure || "written_bytes_mismatch";
        const restored = await compensate(packet, approval, request.adapter, compensation, reason, CONSUMED_REPLACE_REQUESTS.has(replaceRequest));
        return reject(restored.ok ? reason : restored.reason, {
          compensation: restored.receipt,
          compensation_prepared: true,
        });
      }

      CONSUMED_APPROVALS.add(approval);
      const receipt = freeze({
        receipt_version: RECEIPT_VERSION,
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
        compensation: freeze({ ...compensation, status: "prepared" }),
      });
      return result("committed", {
        write_counts: { ...ZERO_WRITES, canonical: 1 },
        approval_consumed: true,
        target_path: packet.target_path,
        receipt,
        compensation_prepared: true,
      });
    } finally { targetLocks.delete(packet.target_path); }
  }

  const api = Object.freeze({
    APPROVAL_VERSION,
    RECEIPT_VERSION,
    COMPENSATION_VERSION,
    MAX_CANONICAL_BYTES,
    authorizeCanonicalUpdate,
    commitApprovedUpdate,
    isUpdateApproval,
    isApprovalConsumed,
    assertAtomicReplaceRequest,
    assertRestoreRequest,
  });
  root.LLMWikiOperationWriter = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
