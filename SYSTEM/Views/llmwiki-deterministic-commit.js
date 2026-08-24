(function (root) {
  "use strict";

  const canonicalPacketApi = root.LLMWikiCanonicalPacket
    || (typeof require === "function" ? require("./llmwiki-canonical-packet.js") : null);
  const reviewCommitApi = root.LLMWikiApprovalReviewCommit
    || (typeof require === "function" ? require("./llmwiki-approval-review-commit.js") : null);
  const knowledgeApi = root.KnowledgeCandidateStore
    || (typeof require === "function" ? require("./knowledge-candidate-store.js") : null);
  const operationWriterApi = root.LLMWikiOperationWriter
    || (typeof require === "function" ? require("./llmwiki-operation-writer.js") : null);
  const mergeTransactionApi = root.LLMWikiMergeTransaction
    || (typeof require === "function" ? require("./llmwiki-merge-transaction.js") : null);

  const REQUEST_FIELDS = new Set(["packet", "authorization", "adapter"]);
  const REPAIR_REQUEST_FIELDS = new Set(["adapter", "repair"]);
  const ZERO_WRITES = Object.freeze({ canonical: 0, audit: 0, derived: 0, provider: 0, network: 0, git: 0 });

  function plain(value) { return Boolean(value) && typeof value === "object" && !Array.isArray(value); }
  function clone(value) { return JSON.parse(JSON.stringify(value)); }
  function stable(value) {
    if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
    if (!plain(value)) return JSON.stringify(value);
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stable(value[key])}`).join(",")}}`;
  }
  function same(left, right) { return stable(left) === stable(right); }
  function result(status, extras = {}) {
    return Object.freeze({ ok: status === "committed" || status === "duplicate" || status === "repaired", status, write_counts: ZERO_WRITES, ...extras });
  }
  function rejected(reason, extras = {}) { return result("rejected", { reason, ...extras }); }
  function promise(value) { return Boolean(value) && typeof value.then === "function"; }
  function settle(value, onValue, onError) {
    if (promise(value)) return value.then(onValue, onError);
    return onValue(value);
  }

  function validateShape(request) {
    if (!plain(request)) return rejected("malformed_request");
    for (const key of Object.keys(request)) if (!REQUEST_FIELDS.has(key)) return rejected("unknown_request_field", { field: key });
    if (!plain(request.packet)) return rejected("packet_required");
    if (!plain(request.authorization)) return rejected("authorization_required");
    if (!plain(request.adapter)) return rejected("adapter_required");
    for (const method of ["readBytes", "readReceipt", "commitExact"]) {
      if (typeof request.adapter[method] !== "function") return rejected("adapter_required", { field: `adapter.${method}` });
    }
    return null;
  }

  function packetIdentity(packet) {
    const identity = clone(packet);
    delete identity.packet_hash;
    delete identity.canonical_serialization;
    return identity;
  }

  function validatePacket(packet, authorization) {
    if (!canonicalPacketApi || !reviewCommitApi) return rejected("packet_contract_missing");
    const identity = packetIdentity(packet);
    const canonicalSerialization = stable(identity);
    if (packet.canonical_serialization !== canonicalSerialization
      || packet.packet_hash !== canonicalPacketApi.sha256(canonicalSerialization)
      || canonicalPacketApi.computePacketHash(packet) !== packet.packet_hash) {
      return rejected("packet_tampered");
    }
    if (authorization.packet_hash !== packet.packet_hash) return rejected("packet_payload_mismatch");
    const verified = canonicalPacketApi.verifyCanonicalPacket(packet);
    if (!verified.ok) return rejected(verified.reason === "packet_tampered" ? "packet_tampered" : "packet_payload_mismatch");
    return null;
  }

  function validateAuthorization(packet, authorization) {
    if (!plain(authorization.authorization) || !Array.isArray(authorization.selection_set)) {
      return rejected("authorization_replay_failed");
    }
    const replay = reviewCommitApi.authorizeCanonicalPacket(packet, {
      action: authorization.action,
      selection_ids: clone(authorization.selection_set),
    });
    if (!replay.ok) return rejected("authorization_replay_failed");
    const expected = replay.value;
    if (authorization.authorization_hash !== expected.authorization_hash
      || authorization.authorization.authorization_hash !== expected.authorization.authorization_hash) {
      return rejected("authorization_tampered");
    }
    if (!same(authorization.selection_set, expected.selection_set) || authorization.action !== expected.action) {
      return rejected("authorization_replay_failed");
    }
    if (!same(authorization.authorization.selected_payloads, expected.authorization.selected_payloads)) {
      return rejected("packet_payload_mismatch");
    }
    if (!same(authorization, expected)) return rejected("authorization_replay_failed");
    return null;
  }

  function receiptIdentity(packet, authorization) {
    return {
      packet_hash: packet.packet_hash,
      authorization_hash: authorization.authorization_hash,
      operation_id: packet.operation.operation_id,
      target_path: packet.target_path,
      before_sha256: packet.before_sha256,
      after_sha256: packet.after_sha256,
      live_revision: packet.live_revision,
      nonce: packet.nonce,
    };
  }

  function auditPayload(packet, authorization, committedAt) {
    return {
      audit_version: "llmwiki_packet_bound_commit_audit_v1",
      result: "committed",
      committed_at: committedAt,
      ...receiptIdentity(packet, authorization),
      consent_hash: packet.consent_hash,
      source_ids: packet.source_citations.map((citation) => citation.source_id).sort(),
    };
  }

  function replayResult(receipt, packet, authorization) {
    if (receipt === null) return null;
    if (!plain(receipt) || typeof receipt.committed_at !== "string" || Number.isNaN(Date.parse(receipt.committed_at))) {
      return rejected("malformed_commit_receipt");
    }
    const expected = auditPayload(packet, authorization, receipt.committed_at);
    if (!same(receipt, expected)) return result("conflict", { reason: "nonce_replay_conflict" });
    return result("duplicate", {
      audit: { hash: canonicalPacketApi.sha256(stable(receipt)), receipt: clone(receipt) },
    });
  }

  function readReceipt(adapter, nonce) {
    try {
      return adapter.readReceipt(nonce);
    } catch (_error) {
      return rejected("receipt_read_failed");
    }
  }

  function readLiveBytes(adapter, targetPath) {
    try {
      const bytes = adapter.readBytes(targetPath);
      if (promise(bytes)) return bytes.then(
        (resolved) => resolved === null || typeof resolved === "string" ? resolved : rejected("invalid_live_read_result"),
        () => rejected("live_read_failed"),
      );
      return bytes === null || typeof bytes === "string" ? bytes : rejected("invalid_live_read_result");
    } catch (_error) {
      return rejected("live_read_failed");
    }
  }

  function liveRevision(packet, liveBytes) {
    const beforeBytes = liveBytes === null ? "" : liveBytes;
    return canonicalPacketApi.sha256(stable({ before_sha256: canonicalPacketApi.sha256(beforeBytes), target_path: packet.target_path }));
  }

  function validateLive(packet, liveBytes) {
    const create = packet.operation.proposal_kind === "create";
    if ((create && liveBytes !== null) || (!create && liveBytes !== packet.before_bytes)) return rejected("target_revision_mismatch");
    const beforeBytes = liveBytes === null ? "" : liveBytes;
    if (beforeBytes !== packet.before_bytes
      || canonicalPacketApi.sha256(beforeBytes) !== packet.before_sha256
      || liveRevision(packet, liveBytes) !== packet.live_revision) {
      return rejected("target_revision_mismatch");
    }
    return null;
  }

  function exactMutation(request, now) {
    const audit = auditPayload(request.packet, request.authorization, now.toISOString());
    return {
      target_path: request.packet.target_path,
      before_bytes: request.packet.before_bytes,
      before_sha256: request.packet.before_sha256,
      after_bytes: request.packet.after_bytes,
      after_sha256: request.packet.after_sha256,
      allowed_properties: clone(request.packet.allowed_properties),
      source_citations: clone(request.packet.source_citations),
      live_revision: request.packet.live_revision,
      packet_hash: request.packet.packet_hash,
      authorization_hash: request.authorization.authorization_hash,
      operation_id: request.packet.operation.operation_id,
      nonce: request.packet.nonce,
      audit,
    };
  }

  function finishMutation(committed, request, mutation) {
    if (plain(committed) && committed.status === "committed_audit_pending") {
      return result("committed_audit_pending", {
        reason: committed.reason || "audit_finalize_failed",
        write_counts: plain(committed.write_counts) ? clone(committed.write_counts) : { ...ZERO_WRITES, canonical: 1, audit: 1 },
        target_path: request.packet.target_path,
        ...(plain(committed.repair) ? { repair: clone(committed.repair) } : {}),
      });
    }
    if (!plain(committed) || committed.ok !== true || committed.status !== "committed") {
      return rejected(plain(committed) && committed.reason ? committed.reason : "write_failed", {
        write_counts: plain(committed) && plain(committed.write_counts) ? clone(committed.write_counts) : ZERO_WRITES,
        ...(plain(committed) && committed.audit_status ? { audit_status: committed.audit_status } : {}),
      });
    }
    return result("committed", {
      write_counts: { ...ZERO_WRITES, canonical: 1, audit: 1 },
      target_path: request.packet.target_path,
      audit: { hash: canonicalPacketApi.sha256(stable(mutation.audit)), receipt: clone(mutation.audit) },
    });
  }

  function applyMutation(request, now) {
    const mutation = exactMutation(request, now);
    let committed;
    try { committed = request.adapter.commitExact(mutation); }
    catch (_error) { return rejected("write_failed"); }
    return settle(committed, (value) => finishMutation(value, request, mutation), () => rejected("write_failed"));
  }

  function afterLiveRead(liveBytes, request, now) {
    if (plain(liveBytes) && liveBytes.ok === false) return liveBytes;
    const stale = validateLive(request.packet, liveBytes);
    if (stale) return stale;
    return applyMutation(request, now);
  }

  function afterReceiptRead(receipt, request, now) {
    if (plain(receipt) && receipt.ok === false) return receipt;
    const replay = replayResult(receipt, request.packet, request.authorization);
    if (replay) return replay;
    const liveBytes = readLiveBytes(request.adapter, request.packet.target_path);
    return settle(liveBytes, (value) => afterLiveRead(value, request, now), () => rejected("live_read_failed"));
  }

  function commitApprovedCanonical(request, options = {}) {
    const mergeTransaction = root.LLMWikiMergeTransaction || mergeTransactionApi;
    if (plain(request) && mergeTransaction?.isMergeAuthorization?.(request.authorization)) {
      return mergeTransaction.commitApprovedMerge(request, options);
    }
    const updateWriter = root.LLMWikiOperationWriter || operationWriterApi;
    if (plain(request) && updateWriter?.isUpdateApproval?.(request.authorization)) {
      return updateWriter.commitApprovedUpdate(request, options);
    }
    const malformed = validateShape(request);
    if (malformed) return malformed;
    const packetInvalid = validatePacket(request.packet, request.authorization);
    if (packetInvalid) return packetInvalid;
    const authorizationInvalid = validateAuthorization(request.packet, request.authorization);
    if (authorizationInvalid) return authorizationInvalid;
    const now = new Date(options.now || new Date());
    if (!Number.isFinite(now.getTime())) return rejected("invalid_commit_time");
    if (now.getTime() > Date.parse(request.packet.expires_at)) return rejected("approval_expired");

    const receipt = readReceipt(request.adapter, request.packet.nonce);
    return settle(receipt, (value) => afterReceiptRead(value, request, now), () => rejected("receipt_read_failed"));
  }

  function repairedAudit(repair) {
    if (!plain(repair) || typeof repair.final_audit_bytes !== "string") return null;
    try {
      const receipt = JSON.parse(repair.final_audit_bytes);
      if (!plain(receipt) || receipt.result !== "committed") return null;
      return { hash: canonicalPacketApi.sha256(stable(receipt)), receipt: clone(receipt) };
    } catch (_error) {
      return null;
    }
  }

  function finishRepair(repaired, repair) {
    if (!plain(repaired)) return rejected("audit_repair_failed");
    if (repaired.status === "repaired" && repaired.ok === true) {
      const audit = repairedAudit(repair);
      if (!audit) return rejected("audit_repair_failed");
      return result("repaired", {
        write_counts: plain(repaired.write_counts) ? clone(repaired.write_counts) : { ...ZERO_WRITES, audit: 1 },
        target_path: repair.target_path,
        audit,
      });
    }
    if (repaired.status === "duplicate" && repaired.ok === true) return result("duplicate");
    return rejected(repaired.reason || "audit_repair_failed", {
      write_counts: plain(repaired.write_counts) ? clone(repaired.write_counts) : ZERO_WRITES,
    });
  }

  function repairCommittedAudit(request) {
    if (!plain(request)) return rejected("malformed_repair_request");
    for (const key of Object.keys(request)) if (!REPAIR_REQUEST_FIELDS.has(key)) return rejected("unknown_repair_request_field", { field: key });
    if (!plain(request.adapter) || typeof request.adapter.repairAudit !== "function" || !plain(request.repair)) {
      return rejected("repair_adapter_required");
    }
    let repaired;
    try { repaired = request.adapter.repairAudit(request.repair); }
    catch (_error) { return rejected("audit_repair_failed"); }
    return settle(repaired, (value) => finishRepair(value, request.repair), () => rejected("audit_repair_failed"));
  }

  const api = Object.freeze({
    commitApprovedCanonical,
    repairCommittedAudit,
    sha256: canonicalPacketApi && canonicalPacketApi.sha256,
    stable,
    canonicalKnowledgeDirectory: knowledgeApi && knowledgeApi.canonicalKnowledgeDirectory,
    renderCanonicalDocument: knowledgeApi && knowledgeApi.renderCanonicalDocument,
  });
  root.LLMWikiDeterministicCommit = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
