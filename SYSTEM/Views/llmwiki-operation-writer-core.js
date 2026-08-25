(function (root) {
  "use strict";

  const canonicalApi = root.LLMWikiCanonicalPacket
    || (typeof require === "function" ? require("./llmwiki-canonical-packet.js") : null);
  const knowledgeApi = root.KnowledgeCandidateStore
    || (typeof require === "function" ? require("./knowledge-candidate-store.js") : null);
  const nodeTypes = typeof require === "function" ? require("node:util").types : null;

  const APPROVAL_VERSION = "llmwiki_revision_bound_update_approval_v1";
  const RECEIPT_VERSION = "llmwiki_update_operation_receipt_v1";
  const COMPENSATION_VERSION = "llmwiki_exact_restore_compensation_v1";
  const MAX_CANONICAL_BYTES = 1024 * 1024;
  const ID = /^[a-z][a-z0-9_-]{2,127}$/u;
  const ZERO_WRITES = Object.freeze({ canonical: 0, audit: 0, derived: 0, provider: 0, network: 0, git: 0 });
  const UPDATE_APPROVALS = new WeakSet();
  const CONSUMED_APPROVALS = new WeakSet();
  const V2_APPROVALS = new WeakSet();
  const CONSUMED_V2_APPROVALS = new WeakSet();
  const LIFECYCLE_APPROVALS = new WeakSet();
  const REPLACE_REQUESTS = new WeakSet();
  const CONSUMED_REPLACE_REQUESTS = new WeakSet();
  const RESTORE_REQUESTS = new WeakSet();
  const CONSUMED_RESTORE_REQUESTS = new WeakSet();
  const targetLocks = new Set();

  function plain(value) {
    if (!value || typeof value !== "object" || Array.isArray(value)) return false;
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
  }
  function proxy(value) { return Boolean(nodeTypes && value && nodeTypes.isProxy(value)); }
  function stable(value) {
    if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
    if (!plain(value)) return JSON.stringify(value);
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stable(value[key])}`).join(",")}}`;
  }
  function clone(value) { return JSON.parse(JSON.stringify(value)); }
  function freeze(value) {
    if (Array.isArray(value)) return Object.freeze(value.map(freeze));
    if (!plain(value)) return value;
    return Object.freeze(Object.fromEntries(Object.entries(value).map(([key, child]) => [key, freeze(child)])));
  }
  function sha256(value) { return canonicalApi.sha256(String(value)); }
  function utf8Length(value) { return typeof Buffer === "function" ? Buffer.byteLength(value, "utf8") : new TextEncoder().encode(value).length; }
  function result(status, extras = {}) {
    return freeze({
      ok: status === "committed" || status === "duplicate",
      status,
      write_counts: ZERO_WRITES,
      approval_consumed: false,
      source_deletes: 0,
      git_calls: 0,
      ...extras,
    });
  }
  function reject(reason, extras = {}) { return result("rejected", { reason, ...extras }); }
  function success(value) { return Object.freeze({ ok: true, status: "authorized", value, write_counts: ZERO_WRITES }); }
  function safelyInspectable(value, limits = {}) {
    const maxNodes = limits.maxNodes || 4096;
    const maxDepth = limits.maxDepth || 32;
    const stack = [[value, 0]];
    const seen = new Set();
    let nodes = 0;
    try {
      while (stack.length) {
        const [current, depth] = stack.pop();
        nodes += 1;
        if (nodes > maxNodes || depth > maxDepth) return false;
        if (!current || typeof current !== "object") continue;
        if (proxy(current) || seen.has(current)) return false;
        seen.add(current);
        const prototype = Object.getPrototypeOf(current);
        if (Array.isArray(current)) {
          if (prototype !== Array.prototype || current.length > 2048) return false;
        } else if (prototype !== Object.prototype && prototype !== null) return false;
        const descriptors = Object.getOwnPropertyDescriptors(current);
        for (const key of Reflect.ownKeys(descriptors)) {
          if (typeof key !== "string") return false;
          const descriptor = descriptors[key];
          if (Object.hasOwn(descriptor, "get") || Object.hasOwn(descriptor, "set")) return false;
          if (key !== "length") stack.push([descriptor.value, depth + 1]);
        }
      }
      return true;
    } catch (_error) { return false; }
  }
  function v2Document(packet) {
    if (!canonicalApi || !packet || typeof packet.after_bytes !== "string") return null;
    try {
      const parsed = knowledgeApi && knowledgeApi.parseLifecycleDocument(packet.after_bytes);
      return parsed && parsed.schema_version === 2 && parsed.type === "knowledge" ? parsed : null;
    } catch (_error) { return null; }
  }
  function brandUpdateApproval(value) { UPDATE_APPROVALS.add(value); return value; }
  function isUpdateApproval(value) { return Boolean(value && UPDATE_APPROVALS.has(value)); }
  function isApprovalConsumed(value) { return Boolean(value && CONSUMED_APPROVALS.has(value)); }
  function consumeUpdateApproval(value) { CONSUMED_APPROVALS.add(value); }
  function brandCanonicalV2Approval(value) { V2_APPROVALS.add(value); return value; }
  function isCanonicalV2Approval(value) { return Boolean(value && V2_APPROVALS.has(value)); }
  function isCanonicalV2ApprovalConsumed(value) { return Boolean(value && CONSUMED_V2_APPROVALS.has(value)); }
  function consumeCanonicalV2Approval(value) { CONSUMED_V2_APPROVALS.add(value); }
  function brandLifecycleApproval(value) { LIFECYCLE_APPROVALS.add(value); return value; }
  function isLifecycleMigrationApproval(value) { return Boolean(value && LIFECYCLE_APPROVALS.has(value)); }
  function issueReplaceRequest(value) { REPLACE_REQUESTS.add(value); return value; }
  function replaceRequestConsumed(value) { return CONSUMED_REPLACE_REQUESTS.has(value); }
  function assertAtomicReplaceRequest(request, currentBytes) {
    if (!request || !REPLACE_REQUESTS.has(request) || CONSUMED_REPLACE_REQUESTS.has(request)) {
      const error = new Error("unbranded_atomic_replace_request"); error.code = "unbranded_atomic_replace_request"; throw error;
    }
    if (typeof currentBytes !== "string" || currentBytes !== request.expected_before_bytes || sha256(currentBytes) !== request.expected_before_sha256) {
      const error = new Error("stale_before_write"); error.code = "stale_before_write"; throw error;
    }
    CONSUMED_REPLACE_REQUESTS.add(request);
    return true;
  }
  function issueRestoreRequest(value) { RESTORE_REQUESTS.add(value); return value; }
  function restoreRequestConsumed(value) { return CONSUMED_RESTORE_REQUESTS.has(value); }
  function assertRestoreRequest(request, currentBytes) {
    if (!request || !RESTORE_REQUESTS.has(request) || CONSUMED_RESTORE_REQUESTS.has(request)) {
      const error = new Error("unbranded_restore_request"); error.code = "unbranded_restore_request"; throw error;
    }
    if (typeof currentBytes !== "string" || currentBytes !== request.expected_written_bytes || sha256(currentBytes) !== request.expected_written_sha256) {
      const error = new Error("restore_target_mismatch"); error.code = "restore_target_mismatch"; throw error;
    }
    CONSUMED_RESTORE_REQUESTS.add(request);
    return true;
  }
  function lockTarget(path) { if (targetLocks.has(path)) return false; targetLocks.add(path); return true; }
  function unlockTarget(path) { targetLocks.delete(path); }

  const api = Object.freeze({
    APPROVAL_VERSION, RECEIPT_VERSION, COMPENSATION_VERSION, MAX_CANONICAL_BYTES, ID, ZERO_WRITES,
    plain, proxy, stable, clone, freeze, sha256, utf8Length, result, reject, success, safelyInspectable, v2Document,
    brandUpdateApproval, isUpdateApproval, isApprovalConsumed, consumeUpdateApproval,
    brandCanonicalV2Approval, isCanonicalV2Approval, isCanonicalV2ApprovalConsumed, consumeCanonicalV2Approval,
    brandLifecycleApproval, isLifecycleMigrationApproval,
    issueReplaceRequest, replaceRequestConsumed, assertAtomicReplaceRequest,
    issueRestoreRequest, restoreRequestConsumed, assertRestoreRequest, lockTarget, unlockTarget,
  });
  root.LLMWikiOperationWriterCore = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
