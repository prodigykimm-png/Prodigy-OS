(function (root) {
  "use strict";

  const core = root.LLMWikiOperationWriterCore
    || (typeof require === "function" ? require("./llmwiki-operation-writer-core.js") : null);
  const updateAuthority = root.LLMWikiUpdateAuthority
    || (typeof require === "function" ? require("./llmwiki-update-authority.js") : null);
  const canonicalV2Authority = root.LLMWikiCanonicalV2Authority
    || (typeof require === "function" ? require("./llmwiki-canonical-v2-authority.js") : null);
  const lifecycleAuthority = root.LLMWikiLifecycleMigrationAuthority
    || (typeof require === "function" ? require("./llmwiki-lifecycle-migration-authority.js") : null);
  const runtimeCore = () => root.LLMWikiOperationWriterCore || core;
  const runtimeUpdateAuthority = () => root.LLMWikiUpdateAuthority || updateAuthority;
  const runtimeCanonicalV2Authority = () => root.LLMWikiCanonicalV2Authority || canonicalV2Authority;
  const runtimeLifecycleAuthority = () => root.LLMWikiLifecycleMigrationAuthority || lifecycleAuthority;

  const api = Object.freeze({
    APPROVAL_VERSION: core.APPROVAL_VERSION,
    RECEIPT_VERSION: core.RECEIPT_VERSION,
    COMPENSATION_VERSION: core.COMPENSATION_VERSION,
    MAX_CANONICAL_BYTES: core.MAX_CANONICAL_BYTES,
    authorizeCanonicalUpdate: (...args) => runtimeUpdateAuthority().authorizeCanonicalUpdate(...args),
    authorizeCanonicalV2: (...args) => runtimeCanonicalV2Authority().authorizeCanonicalV2(...args),
    commitApprovedUpdate: (...args) => runtimeUpdateAuthority().commitApprovedUpdate(...args),
    commitApprovedCanonicalV2: (...args) => runtimeCanonicalV2Authority().commitApprovedCanonicalV2(...args),
    isUpdateApproval: (...args) => runtimeCore().isUpdateApproval(...args),
    isCanonicalV2Approval: (...args) => runtimeCore().isCanonicalV2Approval(...args),
    authorizeLifecycleMigration: (...args) => runtimeLifecycleAuthority().authorizeLifecycleMigration(...args),
    verifyLifecycleMigrationApproval: (...args) => runtimeLifecycleAuthority().verifyLifecycleMigrationApproval(...args),
    isLifecycleMigrationApproval: (...args) => runtimeCore().isLifecycleMigrationApproval(...args),
    isApprovalConsumed: (...args) => runtimeCore().isApprovalConsumed(...args),
    assertAtomicReplaceRequest: (...args) => runtimeCore().assertAtomicReplaceRequest(...args),
    assertRestoreRequest: (...args) => runtimeCore().assertRestoreRequest(...args),
  });
  root.LLMWikiOperationWriter = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
