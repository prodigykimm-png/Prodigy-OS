(function (root) {
  "use strict";

  const canonicalPacketApi = root.LLMWikiCanonicalPacket
    || (typeof require === "function" ? require("./llmwiki-canonical-packet.js") : null);

  const ZERO_WRITES = Object.freeze({ canonical: 0, audit: 0, derived: 0, provider: 0, network: 0, git: 0 });
  const INTENT_FIELDS = new Set(["action", "selection_ids"]);
  const RISK_AUTHORIZATIONS = new WeakSet();
  const RISK_RECEIPTS = new WeakMap();

  function plain(value) { return Boolean(value) && typeof value === "object" && !Array.isArray(value); }
  function clone(value) { return JSON.parse(JSON.stringify(value)); }
  function freeze(value) {
    if (RISK_AUTHORIZATIONS.has(value)) return value;
    if (Array.isArray(value)) return Object.freeze(value.map(freeze));
    if (!plain(value)) return value;
    return Object.freeze(Object.fromEntries(Object.entries(value).map(([key, item]) => [key, freeze(item)])));
  }
  function stable(value) {
    if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
    if (!plain(value)) return JSON.stringify(value);
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stable(value[key])}`).join(",")}}`;
  }
  function fail(field, reason) {
    return freeze({ ok: false, status: "rejected", field, reason, write_counts: ZERO_WRITES });
  }
  function success(value) {
    return freeze({ ok: true, status: "authorized", value, write_counts: ZERO_WRITES });
  }

  function selectedPayload(packet) {
    return {
      operation_id: packet.operation.operation_id,
      proposal_id: packet.operation.proposal_id,
      proposal_kind: packet.operation.proposal_kind,
      payload_hash: packet.operation.payload_hash,
      packet_hash: packet.packet_hash,
      target_path: packet.target_path,
      allowed_properties: clone(packet.allowed_properties),
      before_sha256: packet.before_sha256,
      after_sha256: packet.after_sha256,
      live_revision: packet.live_revision,
      expires_at: packet.expires_at,
      nonce: packet.nonce,
    };
  }

  function authorizeCanonicalPacket(packet, intent) {
    if (!canonicalPacketApi) return fail("packet", "canonical_packet_contract_missing");
    const verified = canonicalPacketApi.verifyCanonicalPacket(packet);
    if (!verified.ok) return fail("packet", verified.reason);
    if (!plain(intent)) return fail("authorization", "malformed_authorization_intent");
    for (const key of Object.keys(intent)) if (!INTENT_FIELDS.has(key)) return fail(`authorization.${key}`, "unknown_authorization_field");
    const action = intent.action;
    if (action !== "approve_selected" && action !== "approve_all") return fail("authorization.action", "authorization_action_required");
    if (packet.operation.proposal_kind !== "create" || packet.operation.authorization_state !== "authorizable") {
      return fail("packet.operation", "non_authorizable_operation");
    }
    const operationId = packet.operation.operation_id;
    const selection = action === "approve_all" ? [operationId] : clone(intent.selection_ids);
    if (!Array.isArray(selection) || selection.length !== 1 || selection[0] !== operationId) {
      return fail("authorization.selection_ids", "selection_mismatch");
    }
    const selectedPayloads = [selectedPayload(packet)];
    const authorizationBody = {
      action,
      packet_hash: packet.packet_hash,
      selection_set: selection,
      selected_payloads: selectedPayloads,
    };
    const authorizationHash = canonicalPacketApi.sha256(stable(authorizationBody));
    return success(freeze({
      action,
      status: "authorized",
      packet_hash: packet.packet_hash,
      selection_set: selection,
      reason: "approved_exact_canonical_packet",
      authorization_hash: authorizationHash,
      authorization: {
        authorization_hash: authorizationHash,
        selected_payloads: selectedPayloads,
      },
    }));
  }

  function riskSnapshot(packet) {
    const writeSet = root.LLMWikiRiskWriteSet;
    if (!writeSet) throw new Error("risk_write_set_contract_required");
    return {
      packet_id: packet.packet_id,
      packet_hash: packet.packet_hash,
      packet_revision: packet.packet_revision,
      run_id: packet.run_id,
      run_revision: packet.run_revision,
      operation_id: packet.operation.operation_id,
      operation_kind: packet.operation.kind,
      risk_tier: packet.risk.tier,
      risk_reasons: clone(packet.risk.reasons),
      conflict_state: packet.conflict.state,
      blocking_conflict_ids: clone(packet.conflict.blocking_conflict_ids),
      write_set: clone(writeSet.packetPaths(packet, root.LLMWikiRiskApprovalPacket)),
    };
  }

  function authorizeRiskPacket(packet, intent) {
    const packetApi = root.LLMWikiRiskApprovalPacket;
    if (!packetApi || !packetApi.isRiskApprovalPacket(packet)) return fail("packet", "branded_risk_packet_required");
    const verified = packetApi.verifyRiskApprovalPacket(packet);
    if (!verified.ok) return fail("packet", verified.reason);
    if (!plain(intent) || Object.keys(intent).some((key) => !["action", "packet_id"].includes(key)) || intent.action !== "approve" || intent.packet_id !== packet.packet_id) return fail("authorization", "risk_authorization_intent_mismatch");
    if (packet.approval_eligible !== true || packet.operation.kind === "noop" || packet.conflict.blocking_conflict_ids.length) return fail("packet", "risk_packet_not_approvable");
    const snapshot = riskSnapshot(packet);
    const body = { authorization_version: "llmwiki_risk_authorization_v1", action: "approve", packet_snapshot: snapshot };
    const authorization = freeze({ ...body, authorization_hash: root.LLMWikiHash.sha256(stable(body)) });
    RISK_AUTHORIZATIONS.add(authorization);
    return success(authorization);
  }

  async function commitRiskApproved(request) {
    if (!plain(request) || Object.keys(request).some((key) => !["packet", "authorization", "adapter"].includes(key))) return fail("request", "malformed_risk_commit_request");
    const packetApi = root.LLMWikiRiskApprovalPacket;
    if (!packetApi || !packetApi.isRiskApprovalPacket(request.packet)) return fail("packet", "branded_risk_packet_required");
    const verified = packetApi.verifyRiskApprovalPacket(request.packet);
    if (!verified.ok) return fail("packet", verified.reason);
    if (!request.authorization || !RISK_AUTHORIZATIONS.has(request.authorization)) return fail("authorization", "branded_risk_authorization_required");
    if (stable(riskSnapshot(request.packet)) !== stable(request.authorization.packet_snapshot)) return fail("authorization", "risk_packet_snapshot_mismatch");
    if (!plain(request.adapter) || typeof request.adapter.preflight !== "function" || typeof request.adapter.commit !== "function") return fail("adapter", "risk_commit_adapter_required");
    if (RISK_RECEIPTS.has(request.authorization)) return freeze({ ok: true, status: "duplicate", receipt: RISK_RECEIPTS.get(request.authorization), write_counts: ZERO_WRITES });
    if (typeof request.adapter.beginExactSet === "function") {
      let begun;
      try { begun = await request.adapter.beginExactSet({ batch_identity: request.authorization.authorization_hash, allowed_write_set: request.authorization.packet_snapshot.write_set, packet_write_sets: { [request.packet.packet_id]: request.authorization.packet_snapshot.write_set } }); }
      catch (_error) { return fail("adapter", "write_set_boundary_failed"); }
      if (!begun?.ok) return fail("adapter", begun?.reason || "write_set_boundary_failed");
    }
    let preflight;
    try { preflight = await request.adapter.preflight(request.packet); }
    catch (_error) { return fail("preflight", "risk_preflight_failed"); }
    if (!preflight || preflight.ok !== true) return fail("preflight", preflight && preflight.reason || "risk_preflight_failed");
    let committed;
    try { committed = await request.adapter.commit(request.packet, request.authorization); }
    catch (_error) { return fail("commit", "risk_commit_failed"); }
    if (!committed || committed.ok !== true || committed.status !== "committed") return fail("commit", committed && committed.reason || "risk_commit_failed");
    const touched = committed.receipt?.actual_touched_paths;
    const expected = request.authorization.packet_snapshot.write_set;
    const actual = Array.isArray(touched) ? [...new Set(touched)].sort() : null;
    if (!actual || !root.LLMWikiRiskWriteSet.samePaths(actual, expected)) {
      let restored = false;
      if (typeof request.adapter.compensate === "function") {
        try { restored = (await request.adapter.compensate(request.packet, committed.receipt))?.ok === true; }
        catch (_error) { restored = false; }
      }
      if (!restored) return fail("commit", "touched_path_compensation_failed");
      return fail("commit", actual ? "unexpected_touched_path" : "touched_path_receipt_required");
    }
    const receipt = freeze({ receipt_version: "llmwiki_risk_approval_receipt_v1", packet_snapshot: request.authorization.packet_snapshot, authorization_hash: request.authorization.authorization_hash, actual_touched_paths: actual, path_boundary_verified: true, writer_receipt: clone(committed.receipt) });
    RISK_RECEIPTS.set(request.authorization, receipt);
    return freeze({ ok: true, status: "committed", receipt, write_counts: clone(committed.write_counts || ZERO_WRITES) });
  }

  function buildCommitRequest({ packet, authorization, adapter } = {}) {
    return { packet, authorization, adapter };
  }

  const api = freeze({ authorizeCanonicalPacket, authorizeRiskPacket, commitRiskApproved, buildCommitRequest });
  root.LLMWikiApprovalReviewCommit = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
