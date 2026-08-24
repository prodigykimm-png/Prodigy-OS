(function (root) {
  "use strict";

  const operationApi = root.LLMWikiOperationContract
    || (typeof require === "function" ? require("./llmwiki-operation-contract.js") : null);
  const hashApi = root.LLMWikiHash
    || (typeof require === "function" ? require("./llmwiki-hash.js") : null);

  const PACKET_VERSION = "llmwiki_merge_packet_v1";
  const APPROVAL_VERSION = "llmwiki_merge_authorization_v1";
  const RECEIPT_VERSION = "llmwiki_merge_transaction_receipt_v1";
  const RELATION_VERSION = "llmwiki_supersession_relation_v1";
  const COMPENSATION_VERSION = "llmwiki_merge_compensation_v1";
  const HASH = /^[0-9a-f]{64}$/u;
  const CANONICAL_PREFIX = "ZETA/PERMANENT/";
  const ZERO_WRITES = Object.freeze({ canonical: 0, audit: 0, derived: 0, provider: 0, network: 0, git: 0 });
  const PACKETS = new WeakSet();
  const AUTHORIZATIONS = new WeakSet();
  const REPLACE_REQUESTS = new WeakSet();
  const RESTORE_REQUESTS = new WeakSet();
  const AUDIT_REQUESTS = new WeakSet();
  const CONSUMED_REPLACES = new WeakSet();
  const CONSUMED_RESTORES = new WeakSet();
  const CONSUMED_AUTHORIZATIONS = new WeakMap();
  const locks = new Set();

  function plain(value) {
    if (!value || typeof value !== "object" || Array.isArray(value)) return false;
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
  }
  function clone(value) {
    if (operationApi?.isOperationRecord?.(value) || PACKETS.has(value) || AUTHORIZATIONS.has(value)) return value;
    if (Array.isArray(value)) return value.map(clone);
    if (!plain(value)) return value;
    return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, clone(child)]));
  }
  function freeze(value) {
    if (operationApi?.isOperationRecord?.(value) || PACKETS.has(value) || AUTHORIZATIONS.has(value)) return value;
    if (Array.isArray(value)) return Object.freeze(value.map(freeze));
    if (!plain(value)) return value;
    return Object.freeze(Object.fromEntries(Object.entries(value).map(([key, child]) => [key, freeze(child)])));
  }
  function stable(value) {
    if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
    if (!plain(value)) return JSON.stringify(value);
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stable(value[key])}`).join(",")}}`;
  }
  function sha256(value) { return hashApi && hashApi.sha256(String(value)); }
  function validPath(value) {
    if (typeof value !== "string" || value !== value.trim() || !value.startsWith(CANONICAL_PREFIX) || !value.endsWith(".md")) return false;
    if (value.startsWith("/") || /^[A-Za-z]:[\\/]/u.test(value) || /[\u0000-\u001f\u007f\\]/u.test(value)) return false;
    return value.split("/").every((part) => part && part !== "." && part !== "..");
  }
  function compare(left, right) { return left < right ? -1 : left > right ? 1 : 0; }
  function result(status, extras = {}) {
    return freeze({
      ok: status === "committed" || status === "duplicate" || status === "authorized" || status === "ready",
      status,
      write_counts: ZERO_WRITES,
      approval_consumed: false,
      source_deletes: 0,
      git_calls: 0,
      ...extras,
    });
  }
  function reject(reason, extras = {}) { return result("rejected", { reason, ...extras }); }
  function packetIdentity(packet) {
    return Object.fromEntries(Object.entries(packet)
      .filter(([key]) => key !== "packet_hash" && key !== "canonical_serialization")
      .map(([key, value]) => [key, clone(value)]));
  }
  function relationRecord(operationId, destinationPath, sourcePath) {
    return { relation_version: RELATION_VERSION, operation_id: operationId, destination_path: destinationPath, source_path: sourcePath, relation: "superseded_by" };
  }
  function relationBytes(beforeBytes, relation) {
    const separator = beforeBytes.endsWith("\n") ? "" : "\n";
    return `${beforeBytes}${separator}<!-- ${RELATION_VERSION} ${stable(relation)} -->\n`;
  }
  function parseSupersessionRelations(bytes) {
    if (typeof bytes !== "string") return [];
    const marker = `<!-- ${RELATION_VERSION} `;
    const rows = [];
    for (const line of bytes.split("\n")) {
      const start = line.indexOf(marker);
      if (start < 0 || !line.endsWith(" -->")) continue;
      try {
        const row = JSON.parse(line.slice(start + marker.length, -4));
        if (plain(row) && row.relation_version === RELATION_VERSION && row.relation === "superseded_by"
          && validPath(row.destination_path) && validPath(row.source_path)) rows.push(freeze(row));
      } catch (_error) { /* Non-contract comments remain opaque. */ }
    }
    return rows.sort((a, b) => compare(a.source_path, b.source_path));
  }
  function verifyEvidence(evidence, operationId) {
    return plain(evidence) && evidence.contract_version === "llmwiki_evidence_contract_v1"
      && evidence.operation_id === operationId && evidence.approval_eligible === true
      && evidence.stale === false && Array.isArray(evidence.claim_lineage) && evidence.claim_lineage.length > 0;
  }

  function assembleMergePacket(input) {
    if (!plain(input) || !operationApi?.isOperationRecord?.(input.operation)) return reject("branded_merge_operation_required");
    const operation = input.operation;
    if (operation.kind !== "merge") return reject("merge_operation_required");
    if (!hashApi || typeof hashApi.sha256 !== "function") return reject("hash_capability_unavailable");
    if (operation.destination_ids.length !== 1) return reject("single_merge_destination_required");
    const destinationPath = operation.destination_ids[0];
    const sourcePaths = operation.source_ids.slice().sort(compare);
    if (![destinationPath, ...sourcePaths].every(validPath)) return reject("invalid_canonical_path");
    if (!verifyEvidence(input.evidence, operation.operation_id)) return reject("approval_eligible_evidence_required");
    if (!plain(input.provenance) || !Array.isArray(input.provenance.source_snapshots)
      || input.provenance.source_snapshots.length !== sourcePaths.length) return reject("source_provenance_required");
    const provenanceIds = input.provenance.source_snapshots.map((row) => plain(row) && row.source_id).sort(compare);
    if (provenanceIds.some((id, index) => id !== sourcePaths[index])) return reject("source_provenance_mismatch");
    if (!plain(input.compensation_plan) || input.compensation_plan.strategy !== "restore_all_exact_before_state") return reject("invalid_compensation_plan");
    if (typeof input.expires_at !== "string" || !Number.isFinite(Date.parse(input.expires_at))) return reject("invalid_expiry");
    if (typeof input.nonce !== "string" || !/^[A-Za-z0-9_-]{16,128}$/u.test(input.nonce)) return reject("invalid_nonce");
    const supersessions = operation.effects.supersessions.slice().sort((a, b) => compare(a.destination_id, b.destination_id));
    if (operation.effects.deprecations.length !== 0 || supersessions.length !== sourcePaths.length) return reject("complete_supersession_set_required");
    for (let index = 0; index < sourcePaths.length; index += 1) {
      const sourcePath = sourcePaths[index];
      const effect = supersessions[index];
      if (effect.destination_id !== sourcePath || effect.replacement_id !== destinationPath) return reject("supersession_binding_mismatch");
    }
    const allPaths = [destinationPath, ...sourcePaths];
    for (const targetPath of allPaths) {
      if (typeof operation.before_bytes[targetPath] !== "string" || !HASH.test(operation.base_revisions[targetPath])
        || sha256(operation.before_bytes[targetPath]) !== operation.base_revisions[targetPath]) return reject("before_revision_mismatch", { target_path: targetPath });
    }
    if (typeof operation.after_bytes[destinationPath] !== "string") return reject("destination_after_bytes_required");
    const destination = {
      canonical_id: destinationPath,
      target_path: destinationPath,
      before_bytes: operation.before_bytes[destinationPath],
      before_sha256: operation.base_revisions[destinationPath],
      base_revision: operation.base_revisions[destinationPath],
      after_bytes: operation.after_bytes[destinationPath],
      after_sha256: sha256(operation.after_bytes[destinationPath]),
    };
    const sources = sourcePaths.map((sourcePath) => {
      const relation = relationRecord(operation.operation_id, destinationPath, sourcePath);
      const afterBytes = relationBytes(operation.before_bytes[sourcePath], relation);
      return {
        canonical_id: sourcePath,
        target_path: sourcePath,
        before_bytes: operation.before_bytes[sourcePath],
        before_sha256: operation.base_revisions[sourcePath],
        base_revision: operation.base_revisions[sourcePath],
        after_bytes: afterBytes,
        after_sha256: sha256(afterBytes),
        relation,
      };
    });
    const writes = [destination, ...sources].sort((a, b) => compare(a.target_path, b.target_path));
    const compensationPlan = {
      compensation_version: COMPENSATION_VERSION,
      strategy: "restore_all_exact_before_state",
      reverse_write_order: writes.map((row) => row.target_path).reverse(),
      entries: writes.map((row) => ({ target_path: row.target_path, restore_bytes: row.before_bytes, restore_sha256: row.before_sha256 })),
    };
    const normalizedCitations = operation.source_citations.slice().sort((a, b) => compare(a.source_id, b.source_id));
    const normalizedProvenance = clone(input.provenance);
    normalizedProvenance.source_snapshots.sort((a, b) => compare(a.source_id, b.source_id));
    const operationBinding = {
      contract_version: operation.contract_version,
      operation_id: operation.operation_id,
      kind: operation.kind,
      destination_ids: [destinationPath],
      source_ids: sourcePaths,
      base_revisions: clone(operation.base_revisions),
      before_bytes: clone(operation.before_bytes),
      after_bytes: clone(operation.after_bytes),
      source_citations: normalizedCitations,
      conflicts: operation.conflicts.slice().sort((a, b) => compare(a.conflict_id, b.conflict_id)),
      risk_tier: operation.risk_tier,
      effects: { deprecations: [], supersessions },
    };
    const body = {
      packet_version: PACKET_VERSION,
      operation_id: operation.operation_id,
      operation_contract_hash: sha256(stable(operationBinding)),
      destination,
      ordered_source_set: sourcePaths,
      sources,
      write_order: writes.map((row) => row.target_path),
      writes,
      source_citations: normalizedCitations,
      evidence: clone(input.evidence),
      evidence_hash: sha256(stable(input.evidence)),
      provenance: normalizedProvenance,
      provenance_hash: sha256(stable(normalizedProvenance)),
      compensation_plan: compensationPlan,
      compensation_plan_hash: sha256(stable(compensationPlan)),
      expires_at: input.expires_at,
      nonce: input.nonce,
      zero_effect_contract: { source_deletes: 0, git_calls: 0 },
    };
    const canonicalSerialization = stable(body);
    const packet = freeze({ ...body, packet_hash: sha256(canonicalSerialization), canonical_serialization: canonicalSerialization });
    PACKETS.add(packet);
    return result("ready", { value: packet });
  }

  function verifyMergePacket(packet) {
    if (!packet || !PACKETS.has(packet)) return reject("branded_merge_packet_required");
    const identity = packetIdentity(packet);
    if (packet.canonical_serialization !== stable(identity) || packet.packet_hash !== sha256(stable(identity))) return reject("merge_packet_tampered");
    if (packet.compensation_plan_hash !== sha256(stable(packet.compensation_plan))
      || packet.evidence_hash !== sha256(stable(packet.evidence)) || packet.provenance_hash !== sha256(stable(packet.provenance))) return reject("merge_packet_tampered");
    if (packet.write_order.join("\0") !== packet.writes.map((row) => row.target_path).join("\0")
      || packet.write_order.some((path, index, list) => index > 0 && compare(list[index - 1], path) >= 0)) return reject("merge_packet_tampered");
    return result("ready", { value: packet });
  }

  function authorizeMergePacket(packet, intent) {
    const verified = verifyMergePacket(packet);
    if (!verified.ok) return verified;
    if (!plain(intent) || Object.keys(intent).some((key) => !["action", "operation_id"].includes(key))
      || intent.action !== "approve_merge" || intent.operation_id !== packet.operation_id) return reject("merge_authorization_intent_mismatch");
    const body = {
      approval_version: APPROVAL_VERSION,
      action: "approve_merge",
      operation_id: packet.operation_id,
      packet_hash: packet.packet_hash,
      destination_path: packet.destination.target_path,
      ordered_source_set: packet.ordered_source_set.slice(),
      write_order: packet.write_order.slice(),
      before_revisions: Object.fromEntries(packet.writes.map((row) => [row.target_path, row.base_revision])),
      destination_after_sha256: packet.destination.after_sha256,
      evidence_hash: packet.evidence_hash,
      provenance_hash: packet.provenance_hash,
      compensation_plan_hash: packet.compensation_plan_hash,
      expires_at: packet.expires_at,
      nonce: packet.nonce,
    };
    const authorization = freeze({ ...body, authorization_hash: sha256(stable(body)) });
    AUTHORIZATIONS.add(authorization);
    return result("authorized", { value: authorization });
  }

  function validateAuthorization(packet, authorization) {
    if (!authorization || !AUTHORIZATIONS.has(authorization)) return reject("branded_merge_authorization_required");
    const body = Object.fromEntries(Object.entries(authorization)
      .filter(([key]) => key !== "authorization_hash").map(([key, value]) => [key, clone(value)]));
    if (authorization.authorization_hash !== sha256(stable(body)) || authorization.packet_hash !== packet.packet_hash
      || authorization.operation_id !== packet.operation_id || authorization.compensation_plan_hash !== packet.compensation_plan_hash
      || authorization.destination_after_sha256 !== packet.destination.after_sha256
      || authorization.ordered_source_set.join("\0") !== packet.ordered_source_set.join("\0")
      || authorization.write_order.join("\0") !== packet.write_order.join("\0")) return reject("merge_authorization_tampered");
    return null;
  }

  function issueReplace(packet, authorization, row, mode) {
    const request = freeze({
      target_path: row.target_path, expected_before_bytes: row.before_bytes, expected_before_sha256: row.before_sha256,
      expected_mode: mode, after_bytes: row.after_bytes, after_sha256: row.after_sha256,
      packet_hash: packet.packet_hash, authorization_hash: authorization.authorization_hash,
      compensation_plan_hash: packet.compensation_plan_hash,
    });
    REPLACE_REQUESTS.add(request);
    return request;
  }
  function assertAtomicReplaceRequest(request, current) {
    if (!request || !REPLACE_REQUESTS.has(request) || CONSUMED_REPLACES.has(request)) throw Object.assign(new Error("unbranded_merge_replace_request"), { code: "unbranded_merge_replace_request" });
    const bytes = typeof current === "string" ? current : current && current.bytes;
    const mode = typeof current === "string" ? request.expected_mode : current && current.metadata && current.metadata.mode;
    if (bytes !== request.expected_before_bytes || sha256(bytes) !== request.expected_before_sha256 || mode !== request.expected_mode) throw Object.assign(new Error("stale_before_write"), { code: "stale_before_write" });
    CONSUMED_REPLACES.add(request);
    return true;
  }
  function issueRestore(packet, authorization, row, currentBytes, mode) {
    const request = freeze({
      target_path: row.target_path, expected_written_bytes: currentBytes, expected_written_sha256: sha256(currentBytes),
      expected_mode: mode, restore_bytes: row.before_bytes, restore_sha256: row.before_sha256, restore_mode: mode,
      packet_hash: packet.packet_hash, authorization_hash: authorization.authorization_hash,
      compensation_plan_hash: packet.compensation_plan_hash,
    });
    RESTORE_REQUESTS.add(request);
    return request;
  }
  function assertRestoreRequest(request, current) {
    if (!request || !RESTORE_REQUESTS.has(request) || CONSUMED_RESTORES.has(request)) throw Object.assign(new Error("unbranded_merge_restore_request"), { code: "unbranded_merge_restore_request" });
    const bytes = typeof current === "string" ? current : current && current.bytes;
    if (bytes !== request.expected_written_bytes || sha256(bytes) !== request.expected_written_sha256) throw Object.assign(new Error("restore_target_mismatch"), { code: "restore_target_mismatch" });
    CONSUMED_RESTORES.add(request);
    return true;
  }
  function assertAuditRequest(request) {
    if (!request || !AUDIT_REQUESTS.has(request)) throw Object.assign(new Error("unbranded_merge_audit_request"), { code: "unbranded_merge_audit_request" });
    return true;
  }
  async function snapshot(adapter, targetPath) {
    try {
      const value = await adapter.readCanonical(targetPath);
      if (!plain(value) || value.path !== targetPath || typeof value.bytes !== "string" || !plain(value.metadata)
        || !Number.isSafeInteger(value.metadata.mode) || value.metadata.mode < 0 || value.metadata.mode > 0o777
        || value.metadata.symlink === true || value.metadata.contained !== true) return reject("unsafe_canonical_snapshot", { target_path: targetPath });
      return { path: targetPath, bytes: value.bytes, metadata: clone(value.metadata) };
    } catch (error) { return reject(error && error.code ? error.code : "canonical_read_failed", { target_path: targetPath }); }
  }
  async function recordFailure(adapter, packet, authorization, failure) {
    const audit = freeze({
      audit_version: "llmwiki_merge_failure_audit_v1", result: "failed", packet_hash: packet.packet_hash,
      authorization_hash: authorization.authorization_hash, operation_id: packet.operation_id, nonce: packet.nonce,
      reason: failure.reason, written_paths: failure.written_paths.slice(), restored_paths: failure.restored_paths.slice(),
      compensation_failures: failure.compensation_failures.slice(), mutation_events: failure.mutation_events.slice(), approval_consumed: false,
    });
    const request = freeze({ nonce: packet.nonce, packet_hash: packet.packet_hash, authorization_hash: authorization.authorization_hash, audit });
    AUDIT_REQUESTS.add(request);
    try {
      if (typeof adapter.recordMergeAudit !== "function") return { ok: false, audit, reason: "failure_audit_unavailable" };
      const saved = await adapter.recordMergeAudit(request);
      return saved && saved.ok === true ? { ok: true, audit } : { ok: false, audit, reason: "failure_audit_failed" };
    } catch (_error) { return { ok: false, audit, reason: "failure_audit_failed" }; }
  }

  async function commitApprovedMerge(request, options = {}) {
    if (!plain(request) || Object.keys(request).some((key) => !["packet", "authorization", "adapter"].includes(key))) return reject("malformed_merge_request");
    const packetCheck = verifyMergePacket(request.packet);
    if (!packetCheck.ok) return packetCheck;
    const authorizationError = validateAuthorization(request.packet, request.authorization);
    if (authorizationError) return authorizationError;
    const packet = request.packet;
    const authorization = request.authorization;
    const adapter = request.adapter;
    if (!plain(adapter) || ["readCanonical", "atomicReplace", "restoreExact", "recordMergeAudit"].some((name) => typeof adapter[name] !== "function")) return reject("merge_adapter_required");
    const now = new Date(options.now || new Date());
    if (!Number.isFinite(now.getTime())) return reject("invalid_commit_time");
    if (now.getTime() > Date.parse(packet.expires_at)) return reject("approval_expired");
    if (CONSUMED_AUTHORIZATIONS.has(authorization)) return result("duplicate", { receipt: CONSUMED_AUTHORIZATIONS.get(authorization) });
    const lockKey = packet.write_order.join("\0");
    if (locks.has(lockKey)) return reject("merge_locked");
    locks.add(lockKey);
    try {
      const preflight = new Map();
      for (const row of packet.writes) {
        const live = await snapshot(adapter, row.target_path);
        if (live.ok === false) return live;
        if (live.bytes !== row.before_bytes || sha256(live.bytes) !== row.before_sha256) return reject("stale_before_write", { target_path: row.target_path });
        preflight.set(row.target_path, live);
      }
      const written = [];
      const compensationCandidates = [];
      const mutationEvents = [];
      function mutationEvent(kind, targetPath, status) {
        mutationEvents.push(freeze({ sequence: mutationEvents.length + 1, kind, target_path: targetPath, status }));
      }
      let failureReason = null;
      let failurePath = null;
      for (const row of packet.writes) {
        const mode = preflight.get(row.target_path).metadata.mode;
        const replace = issueReplace(packet, authorization, row, mode);
        let replaceReturned = false;
        try { await adapter.atomicReplace(replace); replaceReturned = true; }
        catch (error) { failureReason = error && error.code === "stale_before_write" ? "stale_before_write" : "atomic_replace_failed"; failurePath = row.target_path; }
        const replaceAuthorized = CONSUMED_REPLACES.has(replace);
        if (replaceAuthorized) compensationCandidates.push({ row, mode, replaceReturned });
        if (replaceReturned) mutationEvent("write_succeeded", row.target_path, "replace_returned");
        const current = await snapshot(adapter, row.target_path);
        const changed = current.ok !== false && current.bytes !== row.before_bytes;
        if ((replaceReturned || changed) && !written.some((item) => item.row.target_path === row.target_path)) written.push({ row, mode });
        if (!failureReason && !replaceAuthorized) { failureReason = "untrusted_writer_result"; failurePath = row.target_path; }
        if (!failureReason && current.ok === false) { failureReason = "written_state_verification_failed"; failurePath = row.target_path; }
        if (!failureReason && (current.bytes !== row.after_bytes || sha256(current.bytes) !== row.after_sha256
          || current.metadata.mode !== mode)) { failureReason = "written_state_mismatch"; failurePath = row.target_path; }
        if (failureReason) break;
      }
      if (failureReason) {
        const restoredPaths = [];
        const compensationFailures = [];
        for (const item of compensationCandidates.slice().reverse()) {
          const current = await snapshot(adapter, item.row.target_path);
          if (current.ok === false) {
            compensationFailures.push({ target_path: item.row.target_path, reason: "compensation_read_failed" });
            mutationEvent("restore_failed", item.row.target_path, "compensation_read_failed");
            continue;
          }
          if (current.bytes === item.row.before_bytes && current.metadata.mode === item.mode) {
            if (item.replaceReturned) {
              restoredPaths.push(item.row.target_path);
              mutationEvent("restore_verified", item.row.target_path, "already_exact");
            } else mutationEvent("unchanged_verified", item.row.target_path, "already_exact");
            continue;
          }
          const restore = issueRestore(packet, authorization, item.row, current.bytes, item.mode);
          try { await adapter.restoreExact(restore); }
          catch (_error) {
            compensationFailures.push({ target_path: item.row.target_path, reason: "compensation_restore_failed" });
            mutationEvent("restore_failed", item.row.target_path, "compensation_restore_failed");
            continue;
          }
          const verified = await snapshot(adapter, item.row.target_path);
          if (!CONSUMED_RESTORES.has(restore) || verified.ok === false || verified.bytes !== item.row.before_bytes
            || sha256(verified.bytes) !== item.row.before_sha256 || verified.metadata.mode !== item.mode) {
            compensationFailures.push({ target_path: item.row.target_path, reason: "compensation_verify_failed" });
            mutationEvent("restore_failed", item.row.target_path, "compensation_verify_failed");
          } else {
            restoredPaths.push(item.row.target_path);
            mutationEvent("restore_verified", item.row.target_path, "exact_bytes_and_mode");
          }
        }
        const auditFailure = {
          reason: failureReason, failure_path: failurePath, written_paths: written.map((item) => item.row.target_path),
          restored_paths: restoredPaths, compensation_failures: compensationFailures, mutation_events: mutationEvents,
        };
        const audited = await recordFailure(adapter, packet, authorization, auditFailure);
        const compensationReasons = [...new Set(compensationFailures.map((failure) => failure.reason))];
        const reason = compensationFailures.length
          ? (compensationReasons.length === 1 ? compensationReasons[0] : "compensation_failed")
          : (audited.ok ? failureReason : audited.reason);
        return reject(reason, {
          original_reason: failureReason, failure_path: failurePath, compensation_status: compensationFailures.length ? "manual_restore_required" : "restored",
          compensation_failures: compensationFailures, affected_paths: compensationFailures.map((failure) => failure.target_path),
          mutation_events: mutationEvents, failure_audit: audited.audit,
          write_counts: { ...ZERO_WRITES, audit: audited.ok ? 1 : 0 },
        });
      }
      const receipt = freeze({
        receipt_version: RECEIPT_VERSION, result: "committed", committed_at: now.toISOString(), operation_id: packet.operation_id,
        packet_hash: packet.packet_hash, authorization_hash: authorization.authorization_hash, destination_path: packet.destination.target_path,
        ordered_source_set: packet.ordered_source_set.slice(), write_order: packet.write_order.slice(),
        relation_count: packet.sources.length, evidence_hash: packet.evidence_hash, provenance_hash: packet.provenance_hash,
        compensation_plan_hash: packet.compensation_plan_hash, source_deletes: 0, git_calls: 0,
      });
      CONSUMED_AUTHORIZATIONS.set(authorization, receipt);
      return result("committed", { approval_consumed: true, write_counts: { ...ZERO_WRITES, canonical: packet.writes.length }, receipt });
    } finally { locks.delete(lockKey); }
  }

  function isMergePacket(value) { return Boolean(value && PACKETS.has(value)); }
  function isMergeAuthorization(value) { return Boolean(value && AUTHORIZATIONS.has(value)); }
  function isApprovalConsumed(value) { return Boolean(value && CONSUMED_AUTHORIZATIONS.has(value)); }

  const api = Object.freeze({
    PACKET_VERSION, APPROVAL_VERSION, RECEIPT_VERSION, RELATION_VERSION, COMPENSATION_VERSION,
    assembleMergePacket, verifyMergePacket, authorizeMergePacket, commitApprovedMerge,
    parseSupersessionRelations, isMergePacket, isMergeAuthorization, isApprovalConsumed,
    assertAtomicReplaceRequest, assertRestoreRequest, assertAuditRequest, sha256, stable,
  });
  root.LLMWikiMergeTransaction = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
