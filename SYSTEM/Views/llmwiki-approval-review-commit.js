(function (root) {
  "use strict";

  const canonicalPacketApi = root.LLMWikiCanonicalPacket
    || (typeof require === "function" ? require("./llmwiki-canonical-packet.js") : null);

  const ZERO_WRITES = Object.freeze({ canonical: 0, audit: 0, derived: 0, provider: 0, network: 0, git: 0 });
  const INTENT_FIELDS = new Set(["action", "selection_ids"]);

  function plain(value) { return Boolean(value) && typeof value === "object" && !Array.isArray(value); }
  function clone(value) { return JSON.parse(JSON.stringify(value)); }
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

  function buildCommitRequest({ packet, authorization, adapter } = {}) {
    return { packet, authorization, adapter };
  }

  const api = freeze({ authorizeCanonicalPacket, buildCommitRequest });
  root.LLMWikiApprovalReviewCommit = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
