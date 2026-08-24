(function (root) {
  "use strict";

  function create(dependencies = {}) {
    const operationApi = dependencies.operationApi;
    return Object.freeze({
      kind: "noop",
      async prepare(input) {
        if (!operationApi?.isOperationRecord?.(input.operation) || input.operation.kind !== "noop") return { ok: false, reason: "branded_noop_operation_required" };
        return Object.freeze({
          ok: true,
          status: "no_change",
          audit: Object.freeze({ audit_version: "llmwiki_noop_run_audit_v1", result: "no_change", operation_id: input.operation.operation_id, reason: "canonical_bytes_identical" }),
          write_counts: Object.freeze({ canonical: 0, audit: 0, refresh: 0, git: 0 }),
        });
      },
      async authorize() { return { ok: false, reason: "noop_approval_forbidden" }; },
      async commit() { return { ok: false, reason: "noop_commit_forbidden" }; },
    });
  }

  const api = Object.freeze({ create });
  root.LLMWikiNoopOperationService = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
