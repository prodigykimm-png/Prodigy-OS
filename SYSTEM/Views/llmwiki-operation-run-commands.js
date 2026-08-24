(function (root) {
  "use strict";

  function create(options) {
    const bindings = options.bindings;
    function audit(command, reason) {
      const before = bindings.getAudits().length;
      const record = bindings.audit(command, reason, options.currentIdentity(command.follow_up));
      if (bindings.getAudits().length > before) options.incrementAudit();
      return options.output(false, { reason, command_ignored: true, audit: record });
    }
    function bindCancel(intent = {}) {
      if (intent.action !== "cancel") return options.output(false, { reason: "malformed_action" });
      const token = options.getToken();
      if (!token) return options.output(false, { reason: "cancel_not_available" });
      const current = options.currentIdentity();
      const command = bindings.bind({ action: "cancel", ...current, run_id: intent.run_id || current.run_id, run_revision: intent.run_revision === undefined ? current.run_revision : intent.run_revision, run_token: token });
      return Object.freeze({ ok: true, status: options.getState().state, value: command });
    }
    async function cancel(intent = {}) {
      if (intent.action !== "cancel") return options.output(false, { reason: "malformed_action" });
      const supplied = bindings.inspect(intent);
      const bound = supplied ? null : bindCancel(intent);
      if (!supplied && (!bound || !bound.ok)) return bound;
      const command = supplied ? intent : bound.value;
      const binding = bindings.inspect(command);
      if (bindings.wasDelivered(command)) return audit(command, "duplicate_cancel_command");
      const current = options.getState();
      if (!binding || !options.isCurrent(binding.run_token) || binding.original.run_id !== current.run_id || binding.original.run_revision !== current.run_revision) {
        bindings.markDelivered(command);
        return audit(command, "stale_cancel_command");
      }
      const followUp = options.pendingFollowUp() ? options.cancelledFollowUp() : null;
      const action = followUp
        ? { type: "cancel_follow_up", run_id: binding.original.run_id, run_revision: binding.original.run_revision, follow_up: followUp }
        : { type: "cancel", run_id: binding.original.run_id, run_revision: binding.original.run_revision };
      const checked = options.transition(current, action);
      if (!checked.ok) return options.output(false, { reason: checked.reason });
      bindings.markDelivered(command);
      options.invalidate("run_cancelled");
      options.dispatchRaw(action);
      options.clearRun();
      if (followUp) await options.persistCancelled(followUp);
      options.publish();
      return options.output(true, { reason: followUp ? "follow_up_cancelled" : "cancelled", canonical_outcome: options.getState().canonical_outcome, follow_up: options.getState().follow_up });
    }
    function bindRetryFollowUp(intent = {}) {
      if (intent.action !== "retry_follow_up" || !["refresh", "git"].includes(intent.follow_up)) return options.output(false, { reason: "malformed_action" });
      const token = options.getToken();
      const state = options.getState();
      const followUp = state.follow_up?.[intent.follow_up];
      const retryable = followUp && (followUp.status === "failed" || intent.follow_up === "git" && followUp.status === "pending");
      if (!token || state.state !== "committed" || !retryable) return options.output(false, { reason: "follow_up_retry_not_available" });
      const current = options.currentIdentity();
      const command = bindings.bind({ action: "retry_follow_up", ...current, run_id: intent.run_id || current.run_id, run_revision: intent.run_revision === undefined ? current.run_revision : intent.run_revision, follow_up: intent.follow_up, follow_up_identity: intent.follow_up_identity || options.followUpIdentity(intent.follow_up), run_token: token });
      return Object.freeze({ ok: true, status: state.state, value: command });
    }
    async function retryFollowUp(intent = {}) {
      if (intent.action !== "retry_follow_up" || !["refresh", "git"].includes(intent.follow_up)) return options.output(false, { reason: "malformed_action" });
      const supplied = bindings.inspect(intent);
      const bound = supplied ? null : bindRetryFollowUp(intent);
      if (!supplied && (!bound || !bound.ok)) return bound;
      const command = supplied ? intent : bound.value;
      const binding = bindings.inspect(command);
      if (bindings.wasDelivered(command)) return audit(command, "duplicate_retry_command");
      const state = options.getState();
      if (!binding || !options.isCurrent(binding.run_token) || binding.original.run_id !== state.run_id
        || binding.original.run_revision !== state.run_revision || binding.original.follow_up_identity !== options.followUpIdentity(intent.follow_up)) {
        bindings.markDelivered(command);
        return audit(command, "stale_retry_command");
      }
      bindings.markDelivered(command);
      return options.runFollowUps(binding.run_token, [intent.follow_up]);
    }
    return Object.freeze({ bindCancel, cancel, bindRetryFollowUp, retryFollowUp });
  }

  const api = Object.freeze({ create });
  root.LLMWikiOperationRunCommands = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
