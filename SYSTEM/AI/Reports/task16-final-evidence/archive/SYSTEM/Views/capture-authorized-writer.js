(function (root) {
  "use strict";
  if (root.CaptureAuthorizedWriter && root.CaptureAuthorizedWriter.writer_version === "capture_writer_v2") {
    if (typeof module !== "undefined" && module.exports) module.exports = root.CaptureAuthorizedWriter;
    return;
  }

  const consumedAuthorities = new WeakSet();
  const issuedWriteRequests = new WeakSet();
  const consumedWriteRequests = new WeakSet();
  const issuedRollbackRequests = new WeakSet();
  const consumedRollbackRequests = new WeakSet();
  const lockSymbol = typeof Symbol === "function" && Symbol.for ? Symbol.for("prodigy.capture.target-locks.v2") : "__prodigyCaptureTargetLocksV2";
  const targetLocks = root[lockSymbol] || new Map();
  if (!root[lockSymbol]) Object.defineProperty(root, lockSymbol, { value: targetLocks, configurable: false, enumerable: false, writable: false });

  function contract() { const value = root.CaptureStateContract || (typeof require === "function" ? require("./capture-state-contract.js") : null); if (!value) throw new Error("CaptureStateContract is unavailable."); return value; }
  function requireAdapter(adapter) { if (!adapter || typeof adapter.readRevision !== "function" || typeof adapter.writeCanonical !== "function" || typeof adapter.readCanonical !== "function") throw new Error("Capture writer requires readRevision, writeCanonical, and readCanonical adapters."); return adapter; }
  function now(adapter) { return String(adapter && typeof adapter.now === "function" ? adapter.now() : new Date().toISOString()); }
  function sameRevision(expected, actual) { if (expected === "absent") return actual == null || actual === "absent"; return String(actual || "").toLowerCase() === expected; }
  function terminal(record, type, reason, adapter) { return contract().systemTransition(record, { type, occurred_at: now(adapter), reason }); }
  function conflictResult(record, reason, adapter) { return { record: terminal(record, "mark_conflict", reason, adapter), receipt: null }; }
  function actualHash(snapshot) { if (typeof snapshot.bytes === "string") return contract().sha256(snapshot.bytes); if (Object.hasOwn(snapshot, "value")) return contract().sha256(contract().stable(snapshot.value)); return ""; }

  function assertCanonicalWriteRequest(request, currentRevision) {
    if (!request || !issuedWriteRequests.has(request)) throw Object.assign(new Error("Capture writer authority is required for canonical mutation."), { code: "capture_authority" });
    if (consumedWriteRequests.has(request)) throw Object.assign(new Error("Capture canonical write request was already consumed."), { code: "capture_consumed" });
    consumedWriteRequests.add(request);
    if (!sameRevision(request.expected_revision, currentRevision)) throw Object.assign(new Error("Canonical revision changed inside mutation boundary."), { code: "capture_conflict" });
    return true;
  }

  function assertCanonicalRollbackRequest(request, currentRevision) {
    if (!request || !issuedRollbackRequests.has(request)) throw Object.assign(new Error("Capture writer authority is required for canonical rollback."), { code: "capture_rollback_authority" });
    if (consumedRollbackRequests.has(request)) throw Object.assign(new Error("Capture canonical rollback request was already consumed."), { code: "capture_rollback_consumed" });
    consumedRollbackRequests.add(request);
    if (String(currentRevision || "").toLowerCase() !== request.written_revision) throw Object.assign(new Error("Canonical revision changed before rollback."), { code: "capture_rollback_conflict" });
    return true;
  }

  async function rollbackAfterFailedVerification(record, persisted, adapter, reason) {
    if (typeof adapter.rollbackCanonical !== "function") return conflictResult(record, reason + " Manual rollback is required.", adapter);
    const rollbackRequest = Object.freeze({
      operation: record.operation,
      proposal_id: record.proposal_id,
      target_path: record.target_path,
      payload_hash: record.payload_hash,
      written_revision: String(persisted.revision || "").toLowerCase(),
      restore_revision: record.rollback_identity.before_revision,
      rollback_identity: record.rollback_identity,
      authorization_id: record.authorization.authorization_id,
      session_id: record.authorization.session_id
    });
    issuedRollbackRequests.add(rollbackRequest);
    let rolledBack;
    try { rolledBack = await adapter.rollbackCanonical(rollbackRequest); }
    catch (error) { error.capture_record = terminal(record, "fail", reason + " Rollback failed: " + String(error.message || error), adapter); throw error; }
    if (!consumedRollbackRequests.has(rollbackRequest)) return conflictResult(record, reason + " Rollback adapter bypassed revision authority.", adapter);
    if (!rolledBack || rolledBack.path !== record.target_path || !sameRevision(record.rollback_identity.before_revision, rolledBack.revision)) return conflictResult(record, reason + " Rollback did not restore the approved prior revision.", adapter);
    const restored = await adapter.readRevision(record.target_path);
    if (!sameRevision(record.rollback_identity.before_revision, restored)) return conflictResult(record, reason + " Rollback reread did not match the approved prior revision.", adapter);
    return conflictResult(record, reason + " Authorized mutation rolled back.", adapter);
  }

  async function writeAuthorizedCapture(record, adapterInput) {
    const api = contract(); api.assertWriteAuthority(record); const adapter = requireAdapter(adapterInput);
    if (consumedAuthorities.has(record)) throw new Error("Capture write authorization was already consumed.");
    consumedAuthorities.add(record);
    const lockKey = record.target_path;
    const lockIdentity = `${record.proposal_id}:${record.payload_hash}`;
    if (targetLocks.has(lockKey)) return conflictResult(record, "Canonical target is locked by another Capture action.", adapter);
    targetLocks.set(lockKey, lockIdentity);
    try {
      let observed;
      try { observed = await adapter.readRevision(record.target_path); }
      catch (error) { error.capture_record = terminal(record, "fail", String(error.message || error), adapter); throw error; }
      if (!sameRevision(record.rollback_identity.before_revision, observed)) return { record: terminal(record, "mark_stale", "Canonical revision changed before write.", adapter), receipt: null };
      if (typeof adapter.detectConflict === "function") {
        const detected = await adapter.detectConflict({ proposal_id: record.proposal_id, target_path: record.target_path, payload_hash: record.payload_hash, observed_revision: observed });
        if (detected && detected.conflict) return conflictResult(record, String(detected.reason || "Canonical conflict."), adapter);
      }

      const confirmed = record;
      const request = Object.freeze({
        operation: confirmed.operation, proposal_id: confirmed.proposal_id, target_path: confirmed.target_path,
        payload_hash: confirmed.payload_hash, payload: confirmed.payload, expected_revision: confirmed.rollback_identity.before_revision,
        rollback_identity: confirmed.rollback_identity, approval_evidence: confirmed.approval_evidence,
        authorization_id: confirmed.authorization.authorization_id, session_id: confirmed.authorization.session_id
      });
      issuedWriteRequests.add(request);
      let persisted;
      try { persisted = await adapter.writeCanonical(request); }
      catch (error) {
        if (error && error.code === "capture_conflict") return conflictResult(confirmed, String(error.message || error), adapter);
        error.capture_record = terminal(confirmed, "fail", String(error && error.message || error), adapter); throw error;
      }
      if (!consumedWriteRequests.has(request)) return conflictResult(confirmed, "Canonical adapter bypassed expected_revision authority assertion.", adapter);
      if (!persisted || persisted.path !== confirmed.target_path) return conflictResult(confirmed, "Canonical adapter returned the wrong target path.", adapter);
      const returnedRevision = String(persisted.revision || "").toLowerCase();
      if (!/^[0-9a-f]{64}$/.test(returnedRevision)) return rollbackAfterFailedVerification(confirmed, persisted, adapter, "Canonical adapter returned an invalid revision.");

      let snapshot;
      try { snapshot = await adapter.readCanonical(confirmed.target_path); }
      catch (error) { return rollbackAfterFailedVerification(confirmed, persisted, adapter, "Canonical reread failed: " + String(error.message || error) + "."); }
      if (!snapshot || snapshot.path !== confirmed.target_path) return rollbackAfterFailedVerification(confirmed, persisted, adapter, "Canonical reread returned the wrong target path.");
      const rereadRevision = String(snapshot.revision || "").toLowerCase();
      const computedRevision = actualHash(snapshot);
      if (!HASH.test(rereadRevision) || rereadRevision !== returnedRevision || !computedRevision || computedRevision !== rereadRevision) return rollbackAfterFailedVerification(confirmed, persisted, adapter, "Canonical reread revision/hash mismatch.");

      const receipt = Object.freeze({
        contract_version: "capture_write_receipt_v3", receipt_id: `capture_receipt_${confirmed.authorization.authorization_id}`,
        proposal_id: confirmed.proposal_id, operation: confirmed.operation, target_path: confirmed.target_path,
        payload_hash: confirmed.payload_hash, written_revision: rereadRevision, written_at: now(adapter),
        authorization_id: confirmed.authorization.authorization_id, session_id: confirmed.authorization.session_id,
        approval_evidence: confirmed.approval_evidence, rollback_identity: confirmed.rollback_identity
      });
      const committed = api.writerTransition(confirmed, { type: "commit", receipt });
      return { record: committed, receipt: committed.write_receipt };
    } finally {
      if (targetLocks.get(lockKey) === lockIdentity) targetLocks.delete(lockKey);
    }
  }

  const HASH = /^[0-9a-f]{64}$/;
  const api = Object.freeze({ writer_version: "capture_writer_v2", writeAuthorizedCapture, assertCanonicalWriteRequest, assertCanonicalRollbackRequest });
  root.CaptureAuthorizedWriter = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
