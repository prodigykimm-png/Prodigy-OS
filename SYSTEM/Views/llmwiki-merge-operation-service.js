(function (root) {
  "use strict";

  function create(dependencies = {}) {
    const operationApi = dependencies.operationApi;
    const mergeApi = dependencies.mergeApi;
    const commitApi = dependencies.commitApi;
    return Object.freeze({
      kind: "merge",
      async prepare(input) {
        if (!operationApi?.isOperationRecord?.(input.operation) || input.operation.kind !== "merge") return { ok: false, reason: "branded_merge_operation_required" };
        const context = input.context || {};
        const assembled = mergeApi.assembleMergePacket({ operation: input.operation, evidence: context.evidence, provenance: context.provenance, compensation_plan: context.compensation_plan, expires_at: context.expires_at, nonce: context.nonce });
        return assembled.ok ? { ok: true, status: "review", value: Object.freeze({ operation: input.operation, packet: assembled.value }) } : assembled;
      },
      async authorize(input) {
        return mergeApi.authorizeMergePacket(input.prepared.packet, { action: "approve_merge", operation_id: input.operation.operation_id });
      },
      async commit(input) {
        const source = input.context.adapter;
        const guarded = Object.fromEntries(["readCanonical", "atomicReplace", "restoreExact", "recordMergeAudit"].map((name) => [name, (...args) => {
          if (!input.is_current()) throw Object.assign(new Error("run_invalidated"), { code: "run_invalidated" });
          return source[name](...args);
        }]));
        return commitApi.commitApprovedCanonical({ packet: input.prepared.packet, authorization: input.authorization, adapter: guarded }, input.context.commit_options || {});
      },
    });
  }

  const api = Object.freeze({ create });
  root.LLMWikiMergeOperationService = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
