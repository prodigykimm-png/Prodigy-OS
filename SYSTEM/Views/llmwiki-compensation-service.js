(function (root) {
  "use strict";

  const hashApi = root.LLMWikiHash
    || (typeof require === "function" ? require("./llmwiki-hash.js") : null);
  const AUDIT_VERSION = "llmwiki_immutable_compensation_audit_v1";
  const PACKET_VERSION = "llmwiki_compensation_packet_v1";
  const HASH = /^[0-9a-f]{64}$/u;
  // Task 11 cutover: lifecycle review destinations (Literature/Candidates)
  // join Permanent as canonical compensation surfaces, matching the
  // write-boundary policy and vault transaction adapter.
  const CANONICAL_PREFIXES = Object.freeze(["ZETA/PERMANENT/", "ZETA/LITERATURE/", "ZETA/CANDIDATES/"]);

  function plain(value) { return Boolean(value) && typeof value === "object" && !Array.isArray(value); }
  function clone(value) {
    if (Array.isArray(value)) return value.map(clone);
    if (!plain(value)) return value;
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, clone(item)]));
  }
  function freeze(value) {
    if (Array.isArray(value)) return Object.freeze(value.map(freeze));
    if (!plain(value)) return value;
    return Object.freeze(Object.fromEntries(Object.entries(value).map(([key, item]) => [key, freeze(item)])));
  }
  function stable(value) {
    if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
    if (!plain(value)) return JSON.stringify(value);
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stable(value[key])}`).join(",")}}`;
  }
  function sha256(value) {
    if (!hashApi || typeof hashApi.sha256 !== "function") throw new Error("sha256_runtime_unavailable");
    return hashApi.sha256(String(value));
  }
  function packetHash(packet) {
    const copy = clone(packet);
    delete copy.packet_hash;
    return sha256(stable(copy));
  }
  function auditHash(audit) {
    const copy = clone(audit);
    delete copy.audit_hash;
    return sha256(stable(copy));
  }
  function validPath(path) { return typeof path === "string" && CANONICAL_PREFIXES.some((prefix) => path.startsWith(prefix)) && !path.includes(".."); }
  function validAction(action) {
    return plain(action)
      && action.type === "compensate"
      && typeof action.action_id === "string" && action.action_id.length >= 8
      && typeof action.confirmed_at === "string" && Number.isFinite(Date.parse(action.confirmed_at));
  }
  function validWrite(write) {
    return plain(write)
      && validPath(write.path)
      && typeof write.before_bytes === "string" && typeof write.after_bytes === "string"
      && HASH.test(write.before_sha256) && HASH.test(write.after_sha256)
      && write.before_sha256 === sha256(write.before_bytes)
      && write.after_sha256 === sha256(write.after_bytes);
  }
  function validOriginalWrite(write) {
    return validWrite(write) && HASH.test(write.post_commit_revision);
  }
  function validCanonicalWrite(write) {
    return plain(write) && validPath(write.path)
      && typeof write.after_bytes === "string" && HASH.test(write.after_sha256)
      && write.after_sha256 === sha256(write.after_bytes)
      && write.post_commit_revision === write.after_sha256
      && (write.before_revision === null || typeof write.before_revision === "string")
      && (write.before_sha256 === null || HASH.test(write.before_sha256));
  }
  function validCompensationWrite(write) {
    return validWrite(write) && HASH.test(write.base_revision);
  }
  function validReceiptShape(receipt, validateWrite) {
    return plain(receipt)
      && typeof receipt.run_id === "string" && receipt.run_id.length > 2
      && typeof receipt.packet_id === "string" && receipt.packet_id.length > 2
      && HASH.test(receipt.packet_hash)
      && plain(receipt.policy_snapshot) && plain(receipt.source_revisions)
      && typeof receipt.committed_at === "string" && Number.isFinite(Date.parse(receipt.committed_at))
      && Array.isArray(receipt.writes) && receipt.writes.length > 0
      && receipt.writes.every(validateWrite);
  }
  function validCanonicalReceipt(receipt) { return validReceiptShape(receipt, validCanonicalWrite); }
  function validReceipt(receipt) {
    return validReceiptShape(receipt, (write) => validOriginalWrite(write) && typeof write.before_revision === "string");
  }
  function result(ok, value) { return freeze({ ok, ...value }); }
  function exactWrites(receipt) {
    return receipt.writes.map((write) => freeze({
      path: write.path,
      before_bytes: write.after_bytes,
      before_sha256: write.after_sha256,
      after_bytes: write.before_bytes,
      after_sha256: write.before_sha256,
      original_before_revision: write.before_revision,
      base_revision: write.post_commit_revision,
    }));
  }
  function create(options = {}) {
    const audits = [];
    const adapter = options.adapter || null;
    const now = typeof options.now === "function" ? options.now : () => new Date().toISOString();
    function getAudits() { return freeze(audits.slice()); }
    function validateAuditChain(entries) {
      if (!Array.isArray(entries)) return result(false, { reason: "audit_entries_required" });
      let previousHash = null;
      for (const [index, entry] of entries.entries()) {
        if (!plain(entry) || entry.audit_version !== AUDIT_VERSION || typeof entry.audit_id !== "string") {
          return result(false, { reason: "malformed_audit_entry" });
        }
        if (entry.previous_audit_hash !== previousHash) return result(false, { reason: "audit_parent_hash_mismatch" });
        if (entry.audit_count !== index + 1) return result(false, { reason: "audit_count_mismatch" });
        if (!HASH.test(entry.audit_hash) || entry.audit_hash !== auditHash(entry)) return result(false, { reason: "audit_hash_mismatch" });
        previousHash = entry.audit_hash;
      }
      return result(true, { head_hash: previousHash, length: entries.length });
    }
    function appendAudit(audit) {
      if (!plain(audit)) return result(false, { reason: "audit_required" });
      const previous_audit_hash = audits.length ? audits[audits.length - 1].audit_hash : null;
      if (audit.previous_audit_hash !== previous_audit_hash) return result(false, { reason: "audit_parent_hash_mismatch" });
      if (!HASH.test(audit.audit_hash) || audit.audit_hash !== auditHash(audit)) return result(false, { reason: "audit_hash_mismatch" });
      if (audits.some((entry) => entry.audit_hash === audit.audit_hash || entry.audit_id === audit.audit_id)) {
        return result(false, { reason: "immutable_audit_replay" });
      }
      const entry = freeze(clone(audit));
      audits.push(entry);
      return result(true, { entry });
    }
    async function durableContinuity() {
      if (!adapter || typeof adapter.readImmutableAuditContinuity !== "function") {
        return result(true, {
          head_hash: audits.length ? audits[audits.length - 1].audit_hash : null,
          count: audits.length,
          persistent: false,
        });
      }
      const continuity = await adapter.readImmutableAuditContinuity();
      if (!continuity || continuity.ok !== true) return result(false, { reason: continuity && continuity.reason || "immutable_audit_continuity_unavailable" });
      if ((continuity.head_hash !== null && !HASH.test(continuity.head_hash)) || !Number.isInteger(continuity.count) || continuity.count < 0) {
        return result(false, { reason: "immutable_audit_continuity_invalid" });
      }
      return result(true, { head_hash: continuity.head_hash, count: continuity.count, persistent: true });
    }
    function rebasedAudit(audit, continuity) {
      const entry = clone(audit);
      entry.previous_audit_hash = continuity.head_hash;
      entry.audit_count = continuity.count + 1;
      entry.audit_hash = auditHash(entry);
      return freeze(entry);
    }
    async function persistAudit(entry) {
      if (!adapter || typeof adapter.appendImmutableAudit !== "function") return result(true, { status: "memory_only" });
      const persisted = await adapter.appendImmutableAudit({
        audit_hash: entry.audit_hash,
        audit_id: entry.audit_id,
        audit_count: entry.audit_count,
        previous_audit_hash: entry.previous_audit_hash,
        audit_bytes: JSON.stringify(entry),
      });
      return persisted && persisted.ok === true
        ? result(true, { status: persisted.status || "appended" })
        : result(false, { reason: persisted && persisted.reason || "immutable_audit_append_failed" });
    }
    function buildAudit(fields) {
      const audit = {
        audit_version: AUDIT_VERSION,
        audit_id: `${fields.run_id}:${fields.action_id}:${audits.length + 1}`,
        previous_audit_hash: audits.length ? audits[audits.length - 1].audit_hash : null,
        audit_count: audits.length + 1,
        recorded_at: now(),
        ...clone(fields),
      };
      audit.audit_hash = auditHash(audit);
      return freeze(audit);
    }
    async function appendAndPersist(audit) {
      const continuity = await durableContinuity();
      if (!continuity.ok) return continuity;
      const entry = rebasedAudit(audit, continuity);
      if (!plain(entry) || entry.audit_version !== AUDIT_VERSION || typeof entry.audit_id !== "string"
        || !HASH.test(entry.audit_hash) || entry.audit_hash !== auditHash(entry)
        || audits.some((item) => item.audit_hash === entry.audit_hash || item.audit_id === entry.audit_id)) {
        return result(false, { reason: "immutable_audit_replay" });
      }
      const persisted = await persistAudit(entry);
      return persisted.ok
        ? (audits.push(entry), result(true, { status: "recorded", audit: entry }))
        : result(false, { reason: persisted.reason, audit: entry });
    }
    async function validatePersistedAuditChain(entries) {
      const local = validateAuditChain(entries);
      if (!local.ok) return local;
      const continuity = await durableContinuity();
      if (!continuity.ok) return continuity;
      if (entries.length !== continuity.count) return result(false, { reason: entries.length < continuity.count ? "immutable_audit_truncated" : "immutable_audit_count_mismatch" });
      if (local.head_hash !== continuity.head_hash) return result(false, { reason: "immutable_audit_head_mismatch" });
      if (!adapter || typeof adapter.readImmutableAudit !== "function") return result(true, { head_hash: local.head_hash, length: entries.length });
      for (const entry of entries) {
        const persisted = await adapter.readImmutableAudit(entry.audit_hash);
        if (typeof persisted !== "string") return result(false, { reason: "immutable_audit_record_missing" });
        let decoded;
        try { decoded = JSON.parse(persisted); }
        catch (_error) { return result(false, { reason: "immutable_audit_record_malformed" }); }
        if (!plain(decoded) || decoded.audit_hash !== entry.audit_hash || auditHash(decoded) !== entry.audit_hash) {
          return result(false, { reason: "immutable_audit_record_mismatch" });
        }
      }
      return result(true, { head_hash: local.head_hash, length: entries.length });
    }
    async function recordCompletedCommit({ original_receipt } = {}) {
      if (!validCanonicalReceipt(original_receipt)) return result(false, { reason: "valid_original_receipt_required" });
      const bindings = Array.isArray(original_receipt.resurfacing_bindings) ? original_receipt.resurfacing_bindings : [];
      if (bindings.some((binding) => !plain(binding) || typeof binding.canonical_id !== "string" || !validPath(binding.path)
        || !HASH.test(binding.revision) || typeof binding.nonce !== "string" || !HASH.test(binding.final_audit_sha256)
        || binding.packet_hash !== original_receipt.packet_hash || !HASH.test(binding.authorization_hash))) {
        return result(false, { reason: "invalid_resurfacing_binding" });
      }
      const audit = buildAudit({
        audit_type: "canonical_committed",
        run_id: original_receipt.run_id,
        packet_id: original_receipt.packet_id,
        packet_hash: original_receipt.packet_hash,
        policy_snapshot: clone(original_receipt.policy_snapshot),
        source_revisions: clone(original_receipt.source_revisions),
        canonical_before_revisions: Object.fromEntries(original_receipt.writes.map((write) => [write.path, write.before_revision])),
        canonical_post_commit_revisions: Object.fromEntries(original_receipt.writes.map((write) => [write.path, write.post_commit_revision])),
        exact_bytes: original_receipt.writes.map((write) => ({ path: write.path, before_sha256: write.before_sha256, after_sha256: write.after_sha256 })),
        user_action: { type: "approved_commit", action_id: original_receipt.packet_id, confirmed_at: original_receipt.committed_at },
        write_outcome: original_receipt.write_outcome,
        refresh_outcome: original_receipt.refresh_outcome,
        git_outcome: original_receipt.git_outcome,
        resurfacing_bindings: clone(bindings),
        ...(plain(original_receipt.canonical_v2_authority) ? { canonical_v2_authority: clone(original_receipt.canonical_v2_authority) } : {}),
      });
      return appendAndPersist(audit);
    }
    async function recordPreparedCompensation({ prepared } = {}) {
      if (!plain(prepared) || !plain(prepared.packet) || !plain(prepared.audit)
        || !validPacket(prepared.packet) || prepared.audit.audit_type !== "compensation_prepared") {
        return result(false, { reason: "valid_compensation_preparation_required" });
      }
      return appendAndPersist(prepared.audit);
    }
    async function recordCompensationOutcome({ packet, user_action, refresh_outcome, git_outcome } = {}) {
      if (!validPacket(packet) || !validAction(user_action) || typeof refresh_outcome !== "string" || typeof git_outcome !== "string") {
        return result(false, { reason: "valid_compensation_outcome_required" });
      }
      const audit = buildAudit({
        audit_type: "compensation_follow_up",
        run_id: packet.run_id,
        packet_id: packet.parent_packet_id,
        packet_hash: packet.parent_packet_hash,
        compensation_packet_hash: packet.packet_hash,
        policy_snapshot: clone(packet.policy_snapshot),
        source_revisions: clone(packet.source_revisions),
        canonical_before_revisions: Object.fromEntries(packet.writes.map((write) => [write.path, write.original_before_revision])),
        canonical_post_commit_revisions: Object.fromEntries(packet.writes.map((write) => [write.path, write.base_revision])),
        exact_bytes: packet.writes.map((write) => ({ path: write.path, before_sha256: write.before_sha256, after_sha256: write.after_sha256 })),
        user_action: clone(user_action),
        write_outcome: "compensated",
        refresh_outcome,
        git_outcome,
      });
      return appendAndPersist(audit);
    }
    function prepareCompensation({ original_receipt, user_action } = {}) {
      if (!validReceipt(original_receipt)) return result(false, { reason: "valid_original_receipt_required" });
      if (!validAction(user_action)) return result(false, { reason: "explicit_compensation_action_required" });
      const packet = {
        packet_version: PACKET_VERSION,
        packet_type: "compensation",
        packet_id: `compensation_${user_action.action_id}`,
        run_id: original_receipt.run_id,
        parent_packet_id: original_receipt.packet_id,
        parent_packet_hash: original_receipt.packet_hash,
        action_id: user_action.action_id,
        policy_snapshot: clone(original_receipt.policy_snapshot),
        source_revisions: clone(original_receipt.source_revisions),
        writes: exactWrites(original_receipt),
      };
      packet.packet_hash = packetHash(packet);
      const audit = buildAudit({
        audit_type: "compensation_prepared",
        run_id: original_receipt.run_id,
        packet_id: original_receipt.packet_id,
        packet_hash: original_receipt.packet_hash,
        compensation_packet_hash: packet.packet_hash,
        policy_snapshot: clone(original_receipt.policy_snapshot),
        source_revisions: clone(original_receipt.source_revisions),
        canonical_before_revisions: Object.fromEntries(original_receipt.writes.map((write) => [write.path, write.before_revision])),
        exact_bytes: packet.writes.map((write) => ({ path: write.path, before_sha256: write.before_sha256, after_sha256: write.after_sha256 })),
        user_action: clone(user_action),
        write_outcome: original_receipt.write_outcome,
        refresh_outcome: original_receipt.refresh_outcome,
        git_outcome: original_receipt.git_outcome,
      });
      return result(true, { packet: freeze(packet), audit });
    }
    function validPacket(packet) {
      return plain(packet)
        && packet.packet_version === PACKET_VERSION && packet.packet_type === "compensation"
        && typeof packet.run_id === "string" && typeof packet.action_id === "string"
        && HASH.test(packet.parent_packet_hash) && HASH.test(packet.packet_hash)
        && Array.isArray(packet.writes) && packet.writes.length > 0 && packet.writes.every(validCompensationWrite)
        && packet.packet_hash === packetHash(packet);
    }
    async function commitCompensation({ state, packet, user_action } = {}) {
      if (state !== "compensation_committing") return result(false, { reason: "compensation_committing_required" });
      if (!validPacket(packet)) return result(false, { reason: "valid_compensation_packet_required" });
      if (!validAction(user_action) || user_action.action_id !== packet.action_id) return result(false, { reason: "explicit_compensation_action_required" });
      if (!adapter || typeof adapter.readCanonical !== "function" || typeof adapter.replaceCompensationExact !== "function") {
        return result(false, { reason: "compensation_adapter_unavailable" });
      }
      for (const write of packet.writes) {
        const live = await adapter.readCanonical(write.path);
        if (!plain(live) || live.revision !== write.base_revision) return result(false, { reason: "stale_compensation_revision" });
        if (live.bytes !== write.before_bytes) return result(false, { reason: "stale_before_compensation" });
      }
      const completed = [];
      async function restoreCompleted(failureReason) {
        const targets = [];
        for (const completedWrite of completed.slice().reverse()) {
          const restored = await adapter.replaceCompensationExact({
            path: completedWrite.write.path,
            expected_bytes: completedWrite.write.after_bytes,
            expected_revision: completedWrite.revision,
            next_bytes: completedWrite.write.before_bytes,
          });
          targets.push({
            path: completedWrite.write.path,
            ok: restored && restored.ok === true,
            reason: restored && restored.ok === true ? null : restored && restored.reason || "compensation_restore_failed",
          });
        }
        const restored = targets.every((target) => target.ok);
        const restoration = freeze({ outcome: restored ? "restored" : "recovery_required", targets: freeze(targets) });
        const failureAudit = buildAudit({
          audit_type: restored ? "compensation_failed_restored" : "compensation_recovery_required",
          run_id: packet.run_id,
          packet_id: packet.parent_packet_id,
          packet_hash: packet.parent_packet_hash,
          compensation_packet_hash: packet.packet_hash,
          policy_snapshot: clone(packet.policy_snapshot),
          source_revisions: clone(packet.source_revisions),
          canonical_before_revisions: Object.fromEntries(packet.writes.map((write) => [write.path, write.original_before_revision])),
          exact_bytes: packet.writes.map((write) => ({ path: write.path, before_sha256: write.before_sha256, after_sha256: write.after_sha256 })),
          user_action: clone(user_action),
          write_outcome: restored ? "compensation_restored_after_failure" : "compensation_recovery_required",
          refresh_outcome: "not_requested",
          git_outcome: "not_requested",
          failure_reason: failureReason,
          restoration: clone(restoration),
        });
        const failureReceipt = await appendAndPersist(failureAudit);
        return result(false, {
          reason: restored ? "compensation_write_failed_restored" : "compensation_recovery_required",
          failure_reason: failureReason,
          restoration,
          audit: failureReceipt.ok ? failureReceipt.audit : null,
          audit_reason: failureReceipt.ok ? null : failureReceipt.reason,
        });
      }
      for (const write of packet.writes) {
        const writeResult = await adapter.replaceCompensationExact({
          path: write.path,
          expected_bytes: write.before_bytes,
          expected_revision: write.base_revision,
          next_bytes: write.after_bytes,
        });
        if (!writeResult || writeResult.ok !== true) return restoreCompleted(writeResult && writeResult.reason || "compensation_write_failed");
        if (!HASH.test(writeResult.revision) || writeResult.revision !== sha256(write.after_bytes)) {
          return restoreCompleted("compensation_write_verification_failed");
        }
        completed.push({ write, revision: writeResult.revision });
      }
      const audit = buildAudit({
        audit_type: "compensation_committed",
        run_id: packet.run_id,
        packet_id: packet.parent_packet_id,
        packet_hash: packet.parent_packet_hash,
        parent_packet_hash: packet.parent_packet_hash,
        compensation_packet_hash: packet.packet_hash,
        policy_snapshot: clone(packet.policy_snapshot),
        source_revisions: clone(packet.source_revisions),
        canonical_before_revisions: Object.fromEntries(packet.writes.map((write) => [write.path, write.original_before_revision])),
        exact_bytes: packet.writes.map((write) => ({ path: write.path, before_sha256: write.before_sha256, after_sha256: write.after_sha256 })),
        user_action: clone(user_action),
        write_outcome: "compensated",
        refresh_outcome: "not_requested",
        git_outcome: "not_requested",
      });
      const recorded = await appendAndPersist(audit);
      if (!recorded.ok) return restoreCompleted(recorded.reason);
      return result(true, { status: "compensated", write_counts: { canonical: packet.writes.length, audit: 1 }, audit: recorded.audit });
    }
    async function restorePartialOriginal({ state, original_receipt, written_paths } = {}) {
      if (state !== "committing") return result(false, { reason: "original_committing_required" });
      if (!validReceipt(original_receipt) || !Array.isArray(written_paths) || !adapter || typeof adapter.restoreExact !== "function") {
        return result(false, { reason: "valid_original_restore_required" });
      }
      const byPath = new Map(original_receipt.writes.map((write) => [write.path, write]));
      if (!written_paths.length || written_paths.some((filePath) => !byPath.has(filePath))) return result(false, { reason: "written_paths_invalid" });
      for (const filePath of written_paths) {
        const write = byPath.get(filePath);
        const restored = await adapter.restoreExact({ path: filePath, restore_bytes: write.before_bytes, restore_sha256: write.before_sha256 });
        if (!restored || restored.ok !== true) return result(false, { reason: restored && restored.reason || "partial_restore_failed" });
      }
      const audit = buildAudit({
        audit_type: "partial_original_restore",
        run_id: original_receipt.run_id,
        packet_id: original_receipt.packet_id,
        packet_hash: original_receipt.packet_hash,
        policy_snapshot: clone(original_receipt.policy_snapshot),
        source_revisions: clone(original_receipt.source_revisions),
        restored_paths: written_paths.slice(),
        product_change: false,
        write_outcome: "restored",
        refresh_outcome: "not_requested",
        git_outcome: "not_requested",
        action_id: "original_transaction_restore",
      });
      const appended = appendAudit(audit);
      if (!appended.ok) return result(false, { reason: appended.reason });
      const persisted = await persistAudit(appended.entry);
      return persisted.ok
        ? result(true, { status: "restored", audit: appended.entry })
        : result(true, { status: "restored_audit_pending", reason: persisted.reason, audit: appended.entry });
    }
    return freeze({
      prepareCompensation,
      recordCompletedCommit,
      recordPreparedCompensation,
      recordCompensationOutcome,
      commitCompensation,
      restorePartialOriginal,
      appendAudit,
      getAudits,
      validateAuditChain,
      validatePersistedAuditChain,
    });
  }

  const api = freeze({ AUDIT_VERSION, PACKET_VERSION, create, sha256, stable });
  root.LLMWikiCompensationService = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
