(function (root) {
  "use strict";

  function create(dependencies = {}) {
    const operationApi = dependencies.operationApi;
    const reviewApi = dependencies.reviewApi;
    const commitApi = dependencies.commitApi;
    return Object.freeze({
      kind: "create",
      async prepare(input) {
        if (!operationApi?.isOperationRecord?.(input.operation) || input.operation.kind !== "create") return { ok: false, reason: "branded_create_operation_required" };
        const packet = input.context && input.context.packet;
        if (!packet || packet.operation?.proposal_kind !== "create") return { ok: false, reason: "create_packet_required" };
        return { ok: true, status: "review", value: Object.freeze({ operation: input.operation, packet }) };
      },
      async authorize(input) {
        const packet = input.prepared.packet;
        const intent = input.intent || {};
        return reviewApi.authorizeCanonicalPacket(packet, { action: intent.action === "approve_all" ? "approve_all" : "approve_selected", selection_ids: [packet.operation.operation_id] });
      },
      async commit(input) {
        const source = input.context.adapter;
        const guarded = Object.fromEntries(["readBytes", "readReceipt", "commitExact"].map((name) => [name, (...args) => {
          if (!input.is_current()) throw Object.assign(new Error("run_invalidated"), { code: "run_invalidated" });
          return source[name](...args);
        }]));
        return commitApi.commitApprovedCanonical({ packet: input.prepared.packet, authorization: input.authorization, adapter: guarded }, input.context.commit_options || {});
      },
    });
  }

  const api = Object.freeze({ create });
  root.LLMWikiCreateOperationService = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
