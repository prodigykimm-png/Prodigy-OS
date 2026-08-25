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

  const api = Object.freeze({
    APPROVAL_VERSION: core.APPROVAL_VERSION,
    RECEIPT_VERSION: core.RECEIPT_VERSION,
    COMPENSATION_VERSION: core.COMPENSATION_VERSION,
    MAX_CANONICAL_BYTES: core.MAX_CANONICAL_BYTES,
    authorizeCanonicalUpdate: updateAuthority.authorizeCanonicalUpdate,
    authorizeCanonicalV2: canonicalV2Authority.authorizeCanonicalV2,
    commitApprovedUpdate: updateAuthority.commitApprovedUpdate,
    commitApprovedCanonicalV2: canonicalV2Authority.commitApprovedCanonicalV2,
    isUpdateApproval: core.isUpdateApproval,
    isCanonicalV2Approval: core.isCanonicalV2Approval,
    authorizeLifecycleMigration: lifecycleAuthority.authorizeLifecycleMigration,
    verifyLifecycleMigrationApproval: lifecycleAuthority.verifyLifecycleMigrationApproval,
    isLifecycleMigrationApproval: core.isLifecycleMigrationApproval,
    isApprovalConsumed: core.isApprovalConsumed,
    assertAtomicReplaceRequest: core.assertAtomicReplaceRequest,
    assertRestoreRequest: core.assertRestoreRequest,
  });
  root.LLMWikiOperationWriter = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
