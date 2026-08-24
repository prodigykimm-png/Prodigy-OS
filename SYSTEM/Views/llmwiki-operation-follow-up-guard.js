(function (root) {
  "use strict";

  function freeze(value) {
    if (Array.isArray(value)) return Object.freeze(value.map(freeze));
    if (!value || typeof value !== "object") return value;
    return Object.freeze(Object.fromEntries(Object.entries(value).map(([key, item]) => [key, freeze(item)])));
  }
  function create(options = {}) {
    const audited = new Set();
    const records = [];
    function audit(identity, currentIdentity) {
      if (audited.has(identity.entry_identity)) return;
      audited.add(identity.entry_identity);
      const record = freeze({ audit_version: "llmwiki_follow_up_entry_audit_v1", result: "denied", reason: "follow_up_entry_stale", follow_up: identity.follow_up, entry_identity: identity.entry_identity, original_identity: identity.original_identity, current_identity: freeze(currentIdentity()), side_effects: { derived_write: 0, git: 0, ui: 0 } });
      records.push(record);
      if (typeof options.onAudit === "function") options.onAudit(record);
    }
    function entry(input) {
      const originalIdentity = freeze({ run_id: input.run_id, run_revision: input.run_revision, operation_id: input.operation_id, follow_up_identity: input.follow_up_identity });
      const identity = freeze({ follow_up: input.follow_up, entry_identity: [input.follow_up, input.follow_up_identity].join(":"), original_identity: originalIdentity });
      return freeze({
        follow_up: input.follow_up,
        entry_identity: identity.entry_identity,
        is_current() { return input.is_current(); },
        assert_current() {
          if (input.is_current()) return true;
          audit(identity, input.current_identity);
          throw Object.assign(new Error("follow_up_entry_stale"), { code: "follow_up_entry_stale" });
        },
      });
    }
    function getAudits() { return freeze(records.slice()); }
    return Object.freeze({ entry, getAudits });
  }

  const api = Object.freeze({ create });
  root.LLMWikiOperationFollowUpGuard = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
