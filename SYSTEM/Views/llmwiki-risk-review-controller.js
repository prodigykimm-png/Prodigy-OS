(function (root) {
  "use strict";

  const ZERO = Object.freeze({ canonical: 0, audit: 0, refresh: 0, git: 0 });

  function plain(value) { return Boolean(value) && typeof value === "object" && !Array.isArray(value); }
  function freeze(value) {
    if (root.LLMWikiRiskApprovalPacket?.isRiskApprovalPacket?.(value)) return value;
    if (Array.isArray(value)) return Object.freeze(value.map(freeze));
    if (!plain(value)) return value;
    return Object.freeze(Object.fromEntries(Object.entries(value).map(([key, item]) => [key, freeze(item)])));
  }
  function rejected(reason) { return freeze({ ok: false, status: "rejected", reason, write_counts: ZERO }); }

  function create(options = {}) {
    const packetApi = options.packetApi || root.LLMWikiRiskApprovalPacket;
    const reviewCommitApi = options.reviewCommitApi || root.LLMWikiApprovalReviewCommit;
    const batchApi = options.batchApi || root.LLMWikiSafeBatchApproval;
    const repacketApi = options.repacketApi || root.LLMWikiApprovalRepacketService;
    if (!packetApi || !reviewCommitApi || !batchApi || !repacketApi || !options.adapter || typeof options.invalidateRun !== "function" || typeof options.transform !== "function") throw new TypeError("risk_review_controller_dependencies_required");
    let state = freeze({ status: "idle", run_id: null, run_revision: 0, risk_packets: [] });
    const revisions = new Map();

    function publish(next) {
      state = freeze(next);
      if (typeof options.onStateChange === "function") options.onStateChange(state);
      return state;
    }
    function getSnapshot() { return state; }
    function currentPacket(intent) {
      if (state.status !== "review" || !plain(intent)) return null;
      return state.risk_packets.find((packet) => packet.packet_id === intent.packet_id && packet.run_id === intent.run_id && packet.run_revision === intent.run_revision) || null;
    }
    function open(input) {
      if (!plain(input) || !Array.isArray(input.packets) || input.packets.length === 0) return rejected("risk_packets_required");
      const packets = input.packets;
      for (const packet of packets) {
        const verified = packetApi.verifyRiskApprovalPacket(packet);
        if (!verified.ok) return rejected(verified.reason);
        const prior = revisions.get(packet.run_id) || 0;
        if (packet.run_revision < prior) return rejected("stale_risk_run_revision");
      }
      const first = packets[0];
      if (input.run_id !== first.run_id || input.run_revision !== first.run_revision) return rejected("risk_run_identity_mismatch");
      for (const packet of packets) revisions.set(packet.run_id, Math.max(revisions.get(packet.run_id) || 0, packet.run_revision));
      publish({ status: "review", run_id: first.run_id, run_revision: first.run_revision, approval_packet: first, risk_packets: packets });
      return freeze({ ok: true, status: "review", snapshot: state, write_counts: ZERO });
    }
    async function approve(intent) {
      const packet = currentPacket(intent);
      if (!packet || intent.action !== "approve_risk") return rejected("stale_risk_action");
      const authorization = reviewCommitApi.authorizeRiskPacket(packet, { action: "approve", packet_id: packet.packet_id });
      if (!authorization.ok) return authorization;
      const committed = typeof options.commitRun === "function"
        ? await options.commitRun({ packet, authorization: authorization.value })
        : await reviewCommitApi.commitRiskApproved({ packet, authorization: authorization.value, adapter: options.adapter });
      if (committed.ok && committed.status === "committed") publish({ status: "committed", run_id: packet.run_id, run_revision: packet.run_revision, risk_packets: [], receipt: committed.receipt, canonical_outcome: committed.canonical_outcome || null, follow_up: committed.follow_up || null });
      return committed;
    }
    async function approveBatch(intent) {
      if (state.status !== "review" || !plain(intent) || intent.action !== "approve_risk_batch" || !Array.isArray(intent.selection_ids)) return rejected("stale_risk_action");
      const selected = state.risk_packets.filter((packet) => intent.selection_ids.includes(packet.packet_id)).sort((a, b) => a.packet_id.localeCompare(b.packet_id));
      const ids = selected.map((packet) => packet.packet_id);
      if (ids.length !== intent.selection_ids.length || !ids.every((id, index) => id === intent.selection_ids[index])) return rejected("selection_set_mismatch");
      const authorization = batchApi.authorizeExactBatch(selected, ids);
      if (!authorization.ok) return authorization;
      const first = selected[0];
      const committed = typeof options.commitRun === "function"
        ? await options.commitRun({ packet: first, packets: selected, authorization: authorization.value, batch: true })
        : await batchApi.commitExactBatch({ packets: selected, authorization: authorization.value, adapter: options.adapter });
      if (committed.ok && committed.status === "committed") publish({ status: "committed", run_id: state.run_id, run_revision: state.run_revision, risk_packets: [], receipt: committed.receipt, canonical_outcome: committed.canonical_outcome || null, follow_up: committed.follow_up || null });
      return committed;
    }
    async function requestRevision(intent) {
      const packet = currentPacket(intent);
      if (!packet || intent.action !== "request_risk_revision") return rejected("stale_risk_action");
      const service = repacketApi.create({ packetApi, operationApi: options.operationApi || root.LLMWikiOperationContract, hashApi: options.hashApi || root.LLMWikiHash, transform: options.transform, invalidateRun: options.invalidateRun, activateReplacement: options.activateReplacement });
      const replaced = await service.requestRevision(packet, intent.guidance);
      if (!replaced.ok) return replaced;
      const next = replaced.value;
      const previous = revisions.get(next.run_id) || 0;
      if (next.run_revision <= previous) return rejected("non_monotonic_risk_revision");
      revisions.set(next.run_id, next.run_revision);
      const packets = state.risk_packets.map((item) => item === packet ? next : item);
      publish({ status: "review", run_id: next.run_id, run_revision: next.run_revision, approval_packet: next, risk_packets: packets, repacketed_from: packet.packet_id });
      return freeze({ ok: true, status: "review", packet: next, snapshot: state, write_counts: ZERO });
    }
    async function reject(intent) {
      const packet = currentPacket(intent);
      if (!packet || intent.action !== "reject_risk") return rejected("stale_risk_action");
      packetApi.invalidateRiskApprovalPacket(packet);
      const invalidated = await options.invalidateRun({ run_id: packet.run_id, run_revision: packet.run_revision, packet_id: packet.packet_id, packet_hash: packet.packet_hash, packet_revision: packet.packet_revision, operation_id: packet.operation.operation_id });
      if (invalidated?.ok === false) return rejected(invalidated.reason || "run_invalidation_failed");
      publish({ status: "cancelled", run_id: packet.run_id, run_revision: packet.run_revision, risk_packets: [] });
      return freeze({ ok: true, status: "cancelled", write_counts: ZERO });
    }
    function dispatch(intent) {
      if (intent?.action === "approve_risk") return approve(intent);
      if (intent?.action === "approve_risk_batch") return approveBatch(intent);
      if (intent?.action === "request_risk_revision") return requestRevision(intent);
      if (intent?.action === "reject_risk") return reject(intent);
      return Promise.resolve(rejected("unknown_risk_action"));
    }

    return Object.freeze({ open, approve, approveBatch, requestRevision, reject, dispatch, getSnapshot });
  }

  const api = Object.freeze({ create });
  root.LLMWikiRiskReviewController = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
