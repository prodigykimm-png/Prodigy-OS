(function (root) {
  "use strict";

  const BATCH_VERSION = "llmwiki_safe_batch_authorization_v1";
  const AUTHORIZATIONS = new WeakSet();
  const RECEIPTS = new WeakMap();
  const locks = new Set();

  function plain(value) { return Boolean(value) && typeof value === "object" && !Array.isArray(value); }
  function compare(left, right) { return left < right ? -1 : left > right ? 1 : 0; }
  function stable(value) {
    if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
    if (!plain(value)) return JSON.stringify(value);
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stable(value[key])}`).join(",")}}`;
  }
  function freeze(value) {
    if (AUTHORIZATIONS.has(value) || packetApi()?.isRiskApprovalPacket?.(value)) return value;
    if (Array.isArray(value)) return Object.freeze(value.map(freeze));
    if (!plain(value)) return value;
    return Object.freeze(Object.fromEntries(Object.entries(value).map(([key, item]) => [key, freeze(item)])));
  }
  function counts(values = {}) { return freeze({ canonical: Number(values.canonical || 0), audit: Number(values.audit || 0), refresh: 0, git: 0 }); }
  function result(ok, status, extras = {}) { return freeze({ ok, status, write_counts: counts(), ...extras }); }
  function reject(reason) { return result(false, "rejected", { reason }); }
  function packetApi() { return root.LLMWikiRiskApprovalPacket; }
  function hashApi() { return root.LLMWikiHash; }
  function writeSetApi() { return root.LLMWikiRiskWriteSet; }

  function packetCheck(packet) {
    const api = packetApi();
    if (!api || !api.isRiskApprovalPacket(packet)) return reject("branded_risk_packet_required");
    const verified = api.verifyRiskApprovalPacket(packet);
    if (!verified.ok) return reject(verified.reason === "packet_invalidated" ? "invalidated_batch_packet" : verified.reason);
    return null;
  }
  function canSelect(packet) {
    const invalid = packetCheck(packet);
    return !invalid && packet.batch_eligible === true && packet.risk.tier === "low" && packet.conflict.blocking_conflict_ids.length === 0 && packet.operation.kind !== "noop";
  }
  function snapshot(packet) {
    const paths = writeSetApi()?.packetPaths?.(packet, packetApi());
    if (!paths) throw new Error("risk_write_set_contract_required");
    return freeze({
      packet_id: packet.packet_id,
      packet_hash: packet.packet_hash,
      packet_revision: packet.packet_revision,
      run_id: packet.run_id,
      run_revision: packet.run_revision,
      operation_id: packet.operation.operation_id,
      operation_kind: packet.operation.kind,
      risk_tier: packet.risk.tier,
      risk_reasons: packet.risk.reasons,
      conflict_state: packet.conflict.state,
      blocking_conflict_ids: packet.conflict.blocking_conflict_ids,
      write_set: paths,
    });
  }

  function authorizeExactBatch(packets, selectionIds) {
    if (!Array.isArray(packets) || packets.length === 0 || !Array.isArray(selectionIds) || selectionIds.length === 0) return reject("batch_selection_required");
    for (const packet of packets) { const invalid = packetCheck(packet); if (invalid) return invalid; }
    const packetIds = packets.map((packet) => packet.packet_id);
    if (new Set(packetIds).size !== packetIds.length) return reject("duplicate_packet");
    if (new Set(selectionIds).size !== selectionIds.length) return reject("duplicate_selection");
    const canonicalIds = packetIds.slice().sort(compare);
    if (packets.some((packet) => !canSelect(packet))) return reject("ineligible_batch_packet");
    if (selectionIds.some((id, index) => id !== selectionIds.slice().sort(compare)[index])) return reject("selection_not_canonical_order");
    if (packetIds.some((id, index) => id !== canonicalIds[index])) return reject("packet_order_not_canonical");
    if (selectionIds.length !== canonicalIds.length || selectionIds.some((id, index) => id !== canonicalIds[index])) return reject("selection_set_mismatch");
    let writeSet;
    try { writeSet = writeSetApi()?.exactSet?.(packets, packetApi()); }
    catch (error) { return reject(error.message || "invalid_batch_write_set"); }
    if (!writeSet) return reject("risk_write_set_contract_required");
    const packetSnapshots = packets.map(snapshot);
    const body = { batch_version: BATCH_VERSION, selection_set: canonicalIds, packet_snapshots: packetSnapshots, allowed_write_set: writeSet.allowed_write_set, packet_write_sets: writeSet.packet_write_sets };
    const batchIdentity = `batch_${hashApi().sha256(stable(body)).slice(0, 24)}`;
    const authorization = freeze({ ...body, batch_identity: batchIdentity, authorization_hash: hashApi().sha256(stable({ ...body, batch_identity: batchIdentity })) });
    AUTHORIZATIONS.add(authorization);
    return result(true, "authorized", { value: authorization });
  }

  function validateCommit(packets, authorization, adapter) {
    if (!authorization || !AUTHORIZATIONS.has(authorization)) return reject("branded_batch_authorization_required");
    if (!Array.isArray(packets) || packets.length !== authorization.selection_set.length) return reject("selection_set_mismatch");
    for (const packet of packets) { const invalid = packetCheck(packet); if (invalid) return invalid; }
    const ids = packets.map((packet) => packet.packet_id);
    if (ids.some((id, index) => id !== authorization.selection_set[index])) return reject("packet_order_mismatch");
    const snapshots = packets.map(snapshot);
    if (stable(snapshots) !== stable(authorization.packet_snapshots)) return reject("packet_snapshot_mismatch");
    if (!plain(adapter) || ["preflight", "commit", "compensate", "auditBatch"].some((name) => typeof adapter[name] !== "function")) return reject("batch_adapter_required");
    return null;
  }

  async function audit(adapter, authorization, status, details) {
    const record = freeze({ audit_version: "llmwiki_safe_batch_audit_v1", batch_identity: authorization.batch_identity, authorization_hash: authorization.authorization_hash, exact_selection_set: authorization.selection_set, packet_snapshots: authorization.packet_snapshots, status, ...details });
    try {
      const audited = await adapter.auditBatch(record);
      return { ok: audited?.ok === true, record, reason: audited?.reason || (audited?.ok === true ? undefined : "batch_audit_failed") };
    }
    catch (error) { return { ok: false, record, reason: error.message || "batch_audit_failed" }; }
  }

  async function compensate(adapter, committed) {
    const restored = [];
    const failures = [];
    for (const row of committed.slice().reverse()) {
      try {
        const value = await adapter.compensate(row.packet, row.receipt);
        if (value?.ok === true) restored.push(row.packet.packet_id);
        else failures.push(row.packet.packet_id);
      } catch (_error) { failures.push(row.packet.packet_id); }
    }
    return { restored, failures };
  }

  function touchedReceipt(written, expected) {
    const actual = written?.receipt?.actual_touched_paths;
    if (!Array.isArray(actual)) return { ok: false, reason: "touched_path_receipt_required" };
    const canonical = [...new Set(actual)].sort(compare);
    if (canonical.length !== actual.length || !writeSetApi().samePaths(canonical, expected)) return { ok: false, reason: "unexpected_touched_path", actual: canonical };
    return { ok: true, actual: canonical };
  }

  async function commitExactBatch(request) {
    if (!plain(request) || Object.keys(request).some((key) => !["packets", "authorization", "adapter"].includes(key))) return reject("malformed_batch_request");
    const invalid = validateCommit(request.packets, request.authorization, request.adapter);
    if (invalid) return invalid;
    const authorization = request.authorization;
    if (RECEIPTS.has(authorization)) return result(true, "duplicate", { receipt: RECEIPTS.get(authorization) });
    if (locks.has(authorization.batch_identity)) return reject("batch_locked");
    locks.add(authorization.batch_identity);
    try {
      if (typeof request.adapter.beginExactSet === "function") {
        let begun;
        try { begun = await request.adapter.beginExactSet({ batch_identity: authorization.batch_identity, allowed_write_set: authorization.allowed_write_set, packet_write_sets: authorization.packet_write_sets }); }
        catch (_error) { return reject("write_set_boundary_failed"); }
        if (!begun?.ok) return reject(begun?.reason || "write_set_boundary_failed");
      }
      const preflight = [];
      for (const packet of request.packets) {
        let checked;
        try { checked = await request.adapter.preflight(packet); }
        catch (_error) { return reject("batch_preflight_failed"); }
        if (!checked || checked.ok !== true) return reject(checked?.reason || "batch_preflight_failed");
        preflight.push({ packet_id: packet.packet_id, snapshot: checked.snapshot || null });
      }
      const committed = [];
      for (const packet of request.packets) {
        let written;
        try { written = await request.adapter.commit(packet); }
        catch (_error) { written = { ok: false, reason: "batch_commit_failed" }; }
        const expectedPaths = authorization.packet_write_sets[packet.packet_id];
        const touched = written?.ok === true ? touchedReceipt(written, expectedPaths) : null;
        if (!written || written.ok !== true || !touched?.ok) {
          const reason = written?.ok === true ? touched.reason : written?.reason || "batch_commit_failed";
          const toRestore = written?.ok === true ? [...committed, { packet, receipt: written.receipt, write_counts: written.write_counts || {} }] : committed;
          const compensation = await compensate(request.adapter, toRestore);
          const netCanonical = compensation.failures.length ? toRestore.reduce((sum, row) => sum + Number(row.write_counts.canonical || 0), 0) : 0;
          const audited = await audit(request.adapter, authorization, "failed", { reason, committed_packet_ids: toRestore.map((row) => row.packet.packet_id), actual_touched_paths: touched?.actual || [], restored_packet_ids: compensation.restored, compensation_failures: compensation.failures, net_canonical_writes: netCanonical, preflight });
          return result(false, "failed", { reason, ...(audited.ok ? {} : { audit_reason: audited.reason }), full_success: false, compensation_status: compensation.failures.length ? "manual_restore_required" : "restored", compensation, failure_audit: audited.record, write_counts: counts({ canonical: netCanonical, audit: audited.ok ? 1 : 0 }) });
        }
        committed.push({ packet, receipt: written.receipt, write_counts: written.write_counts || {} });
      }
      const canonical = committed.reduce((sum, row) => sum + Number(row.write_counts.canonical || 0), 0);
      const itemAudits = committed.reduce((sum, row) => sum + Number(row.write_counts.audit || 0), 0);
      const audited = await audit(request.adapter, authorization, "committed", { committed_packet_ids: committed.map((row) => row.packet.packet_id), preflight, write_counts: { canonical, audit: itemAudits + 1 } });
      if (!audited.ok) {
        const compensation = await compensate(request.adapter, committed);
        const netCanonical = compensation.failures.length ? canonical : 0;
        return result(false, "failed", { reason: "batch_audit_failed", audit_reason: audited.reason, full_success: false, compensation_status: compensation.failures.length ? "manual_restore_required" : "restored", compensation, write_counts: counts({ canonical: netCanonical }) });
      }
      const actualTouchedPaths = committed.flatMap((row) => row.receipt.actual_touched_paths).sort(compare);
      const receipt = freeze({ receipt_version: "llmwiki_safe_batch_receipt_v1", status: "committed", batch_identity: authorization.batch_identity, authorization_hash: authorization.authorization_hash, exact_selection_set: authorization.selection_set, allowed_write_set: authorization.allowed_write_set, actual_touched_paths: actualTouchedPaths, path_boundary_verified: writeSetApi().samePaths(actualTouchedPaths, authorization.allowed_write_set), packet_snapshots: authorization.packet_snapshots, deterministic_order: authorization.selection_set, counters: { selected: request.packets.length, committed: request.packets.length, canonical_writes: canonical, audit_writes: itemAudits + 1 } });
      RECEIPTS.set(authorization, receipt);
      return result(true, "committed", { full_success: true, receipt, write_counts: counts({ canonical, audit: itemAudits + 1 }) });
    } finally {
      locks.delete(authorization.batch_identity);
      if (typeof request.adapter.resetBoundary === "function") request.adapter.resetBoundary();
    }
  }

  const api = Object.freeze({ BATCH_VERSION, canSelect, authorizeExactBatch, commitExactBatch });
  root.LLMWikiSafeBatchApproval = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
