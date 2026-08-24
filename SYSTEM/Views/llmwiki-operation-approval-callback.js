(function (root) {
  "use strict";

  function freeze(value) {
    if (Array.isArray(value)) return Object.freeze(value.map(freeze));
    if (!value || typeof value !== "object") return value;
    return Object.freeze(Object.fromEntries(Object.entries(value).map(([key, item]) => [key, freeze(item)])));
  }
  function create(options = {}) {
    const bindings = new WeakMap();
    const delivered = new WeakSet();
    const audited = new Set();
    const records = [];
    function bind(identity) {
      const original = freeze({
        run_id: identity.run_id,
        run_revision: identity.run_revision,
        operation_id: identity.operation_id,
        packet_identity: identity.packet_identity,
        approval_identity: identity.approval_identity,
      });
      const callbackIdentity = [original.run_id, original.run_revision, original.operation_id, original.packet_identity, original.approval_identity].join(":");
      const callback = freeze({ action: "approve", callback_identity: callbackIdentity, ...original });
      bindings.set(callback, { callback, original, run_token: identity.run_token, expected_approval_identity: identity.expected_approval_identity || null });
      return callback;
    }
    function inspect(callback) { return callback && bindings.get(callback) || null; }
    function markDelivered(callback) { delivered.add(callback); }
    function wasDelivered(callback) { return Boolean(callback && delivered.has(callback)); }
    function audit(callback, reason, currentIdentity) {
      const binding = inspect(callback);
      if (!binding) return null;
      if (audited.has(callback.callback_identity)) return records.find((record) => record.callback_identity === callback.callback_identity) || null;
      audited.add(callback.callback_identity);
      const record = freeze({
        audit_version: "llmwiki_approval_callback_audit_v1",
        result: "ignored",
        reason,
        callback_identity: callback.callback_identity,
        original_identity: binding.original,
        current_identity: freeze(currentIdentity),
        side_effects: { canonical: 0, ui: 0, refresh: 0, git: 0 },
      });
      records.push(record);
      if (typeof options.onAudit === "function") options.onAudit(record);
      return record;
    }
    function getAudits() { return freeze(records.slice()); }
    return Object.freeze({ bind, inspect, markDelivered, wasDelivered, audit, getAudits });
  }

  const api = Object.freeze({ create });
  root.LLMWikiOperationApprovalCallback = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
