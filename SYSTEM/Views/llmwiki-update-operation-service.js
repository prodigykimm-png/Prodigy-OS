(function (root) {
  "use strict";

  function create(dependencies = {}) {
    const operationApi = dependencies.operationApi;
    const writerApi = dependencies.writerApi;
    const commitApi = dependencies.commitApi;
    return Object.freeze({
      kind: "update",
      async prepare(input) {
        if (!operationApi?.isOperationRecord?.(input.operation) || input.operation.kind !== "update") return { ok: false, reason: "branded_update_operation_required" };
        const context = input.context || {};
        if (!context.packet || context.packet.operation?.proposal_kind !== "update") return { ok: false, reason: "update_packet_required" };
        return { ok: true, status: "review", value: Object.freeze({ operation: input.operation, packet: context.packet }) };
      },
      async authorize(input) {
        const context = input.context || {};
        return writerApi.authorizeCanonicalUpdate({ packet: input.prepared.packet, canonical_id: context.canonical_id, evidence: context.evidence, compensation_plan: context.compensation_plan });
      },
      async commit(input) {
        const source = input.context.adapter;
        const guarded = Object.fromEntries(["readCanonical", "atomicReplace", "restoreExact"].map((name) => [name, (...args) => {
          if (!input.is_current()) throw Object.assign(new Error("run_invalidated"), { code: "run_invalidated" });
          return source[name](...args);
        }]));
        return commitApi.commitApprovedCanonical({ packet: input.prepared.packet, authorization: input.authorization, adapter: guarded }, input.context.commit_options || {});
      },
    });
  }

  const api = Object.freeze({ create });
  root.LLMWikiUpdateOperationService = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
