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
    function bind(input) {
      const original = freeze({ run_id: input.run_id, run_revision: input.run_revision, operation_id: input.operation_id, follow_up: input.follow_up || null, follow_up_identity: input.follow_up_identity || null });
      const commandIdentity = [input.action, original.run_id, original.run_revision, original.operation_id, original.follow_up || "none", original.follow_up_identity || "none"].join(":");
      const command = freeze({ action: input.action, command_identity: commandIdentity, ...original });
      bindings.set(command, { command, original, run_token: input.run_token });
      return command;
    }
    function inspect(command) { return command && bindings.get(command) || null; }
    function markDelivered(command) { delivered.add(command); }
    function wasDelivered(command) { return Boolean(command && delivered.has(command)); }
    function audit(command, reason, currentIdentity) {
      const binding = inspect(command);
      if (!binding) return null;
      if (audited.has(command.command_identity)) return records.find((record) => record.command_identity === command.command_identity) || null;
      audited.add(command.command_identity);
      const record = freeze({ audit_version: "llmwiki_operation_command_audit_v1", result: "ignored", reason, command_identity: command.command_identity, original_identity: binding.original, current_identity: freeze(currentIdentity), side_effects: { token: 0, state: 0, adapter: 0, store: 0, ui: 0 } });
      records.push(record);
      if (typeof options.onAudit === "function") options.onAudit(record);
      return record;
    }
    function getAudits() { return freeze(records.slice()); }
    return Object.freeze({ bind, inspect, markDelivered, wasDelivered, audit, getAudits });
  }

  const api = Object.freeze({ create });
  root.LLMWikiOperationCommandBinding = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
