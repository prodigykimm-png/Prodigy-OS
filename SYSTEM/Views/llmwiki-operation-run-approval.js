(function (root) {
  "use strict";

  function clone(value) {
    if (Array.isArray(value)) return value.map(clone);
    if (!value || typeof value !== "object") return value;
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, clone(item)]));
  }
  function freeze(value) {
    if (Array.isArray(value)) return Object.freeze(value.map(freeze));
    if (!value || typeof value !== "object") return value;
    return Object.freeze(Object.fromEntries(Object.entries(value).map(([key, item]) => [key, freeze(item)])));
  }
  function create(options) {
    const callbacks = options.callbacks;
    function bind(intent = {}) {
      if (intent.action !== "approve") return options.output(false, { reason: "malformed_action" });
      const token = options.getToken();
      if (!token || options.getState().state !== "review") return options.output(false, { reason: "approval_not_available" });
      const current = options.currentIdentity();
      const identity = {
        run_id: intent.run_id || current.run_id,
        run_revision: intent.run_revision === undefined ? current.run_revision : intent.run_revision,
        operation_id: intent.operation_id || current.operation_id,
        packet_identity: intent.packet_identity || current.packet_identity,
      };
      const callback = callbacks.bind({ ...identity, approval_identity: intent.approval_identity || identity.packet_identity, expected_approval_identity: intent.approval_identity, run_token: token });
      return Object.freeze({ ok: true, status: "review", run_id: identity.run_id, run_revision: identity.run_revision, value: callback, counters: options.counters() });
    }
    function authorizationIdentity(value) { return value && (value.authorization_hash || value.operation_id || value.authorization?.authorization_hash) || null; }
    function terminalMismatch(callback, reason) {
      const audited = options.audit(callback, reason);
      options.dispatch("authorization_failed", { reason });
      options.invalidate("approval_mismatch");
      options.publish();
      return options.output(false, { reason, approval_callback_ignored: true, audit: audited.audit });
    }
    async function approve(intent = {}) {
      if (intent.action !== "approve") return options.output(false, { reason: "malformed_action" });
      const supplied = callbacks.inspect(intent);
      if (!supplied && Object.hasOwn(intent, "callback_identity")) return options.output(false, { reason: "unbranded_approval_callback" });
      if (!supplied && (typeof intent.run_id !== "string" || !Number.isSafeInteger(intent.run_revision))) return options.output(false, { reason: "approval_run_identity_required" });
      const bound = supplied ? null : bind(intent);
      if (!supplied && (!bound || !bound.ok)) return bound;
      const callback = supplied ? intent : bound.value;
      const binding = callbacks.inspect(callback);
      if (callbacks.wasDelivered(callback)) return options.audit(callback, "duplicate_approval_callback");
      const operation = options.getOperation();
      const state = options.getState();
      if (!binding || !options.isCurrent(binding.run_token) || state.state !== "review"
        || binding.original.run_id !== state.run_id || binding.original.run_revision !== state.run_revision
        || binding.original.operation_id !== operation?.operation_id || binding.original.packet_identity !== options.packetIdentity()) return options.audit(callback, "stale_approval_callback");
      callbacks.markDelivered(callback);
      const runToken = binding.run_token;
      const approved = options.dispatch("approve");
      if (!approved.ok) return options.output(false, { reason: approved.reason });
      options.publish();
      options.increment("approval");
      const service = options.getService();
      const authorized = await service.authorize({ operation, prepared: options.getPrepared(), context: options.getContext(), intent, signal: runToken.abort_controller && runToken.abort_controller.signal });
      if (!options.isCurrent(runToken)) return options.audit(callback, "stale_approval_callback");
      if (!authorized || authorized.ok !== true) return options.fail(authorized && authorized.reason || "authorization_failed", authorized && authorized.status === "stale" ? "stale" : "authorization_failed");
      if (binding.expected_approval_identity && authorizationIdentity(authorized.value) !== binding.expected_approval_identity) return terminalMismatch(callback, "mismatched_approval_identity");
      if (binding.original.packet_identity !== options.packetIdentity() || binding.original.operation_id !== operation.operation_id) return terminalMismatch(callback, "mismatched_approval_callback");
      options.dispatch("authorization_ready");
      options.publish();
      if (!options.isCurrent(runToken)) return options.ignored(runToken);
      options.increment("commit");
      const committed = await service.commit({ operation, prepared: options.getPrepared(), authorization: authorized.value, context: options.getContext(), signal: runToken.abort_controller && runToken.abort_controller.signal, is_current: () => options.isCurrent(runToken) });
      if (!options.isCurrent(runToken)) return options.ignored(runToken);
      options.addWrites(committed);
      if (!committed || committed.ok !== true || !["committed", "duplicate"].includes(committed.status)) return options.commitFailure(committed);
      const canonicalOutcome = freeze({ status: "committed", operation_kind: operation.kind, operation_id: operation.operation_id, receipt: clone(committed.receipt || null), write_counts: clone(committed.write_counts || {}) });
      const followUp = options.followUpSeed();
      options.dispatch("commit_succeeded", { canonical_outcome: canonicalOutcome, follow_up: followUp });
      const outcome = freeze({ outcome_version: "llmwiki_operation_run_outcome_v1", run_id: runToken.run_id, run_revision: runToken.run_revision, operation_kind: operation.kind, operation_id: operation.operation_id, status: "committed", canonical_outcome: canonicalOutcome, follow_up: followUp });
      if (!await options.save(runToken, outcome)) return options.ignored(runToken);
      options.publish();
      const followed = await options.runFollowUps(runToken);
      return followed.ok ? options.output(true, { canonical_outcome: options.getState().canonical_outcome, follow_up: options.getState().follow_up }) : followed;
    }
    return Object.freeze({ bind, approve });
  }

  const api = Object.freeze({ create });
  root.LLMWikiOperationRunApproval = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
