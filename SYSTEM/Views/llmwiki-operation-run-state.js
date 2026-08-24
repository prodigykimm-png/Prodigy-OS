(function (root) {
  "use strict";

  const STATES = Object.freeze(["idle", "provider_pending", "review", "authorizing", "committing", "committed", "no_change", "stale", "failed", "cancelled"]);
  const KINDS = Object.freeze(["create", "update", "merge", "noop"]);
  const ACTIVE = new Set(["provider_pending", "review", "authorizing", "committing", "stale"]);
  const ID = /^[a-z][a-z0-9_-]{2,127}$/u;

  function freeze(value) {
    if (Array.isArray(value)) return Object.freeze(value.map(freeze));
    if (!value || typeof value !== "object") return value;
    return Object.freeze(Object.fromEntries(Object.entries(value).map(([key, item]) => [key, freeze(item)])));
  }
  function initialOperationRunState() {
    return freeze({ state: "idle", run_id: null, run_revision: 0, operation_kind: null, operation_id: null, canonical_outcome: null, follow_up: null, reason: null });
  }
  function accepted(value) { return freeze({ ok: true, value }); }
  function rejected(current, reason) { return freeze({ ok: false, reason, state: current }); }
  function next(current, changes) { return freeze({ ...current, ...changes }); }
  function valid(current) {
    return current && typeof current === "object" && STATES.includes(current.state)
      && Number.isSafeInteger(current.run_revision) && current.run_revision >= 0;
  }
  function recoverableFollowUp(outcome) {
    if (outcome.status === "no_change") return outcome.follow_up && outcome.follow_up.status === "complete";
    const value = outcome.follow_up;
    const terminal = new Set(["succeeded", "failed", "skipped", "cancelled"]);
    const gitRecoverable = terminal.has(value?.git?.status) || value?.git?.status === "pending";
    return outcome.canonical_outcome?.status === "committed" && value && ["complete", "failed", "cancelled", "pending"].includes(value.status)
      && terminal.has(value.refresh?.status) && gitRecoverable;
  }
  function transitionOperationRunState(current, action) {
    if (!valid(current)) return rejected(initialOperationRunState(), "malformed_state");
    if (!action || typeof action !== "object" || Array.isArray(action) || typeof action.type !== "string") return rejected(current, "malformed_action");
    if (action.type === "start") {
      if (ACTIVE.has(current.state)) return rejected(current, "run_in_progress");
      if (!ID.test(action.run_id || "")) return rejected(current, "invalid_run_id");
      if (!Number.isSafeInteger(action.run_revision) || action.run_revision <= current.run_revision) return rejected(current, "non_monotonic_run_revision");
      return accepted(next(current, { state: "provider_pending", run_id: action.run_id, run_revision: action.run_revision, operation_kind: null, operation_id: null, canonical_outcome: null, follow_up: null, reason: null }));
    }
    if (action.type === "recover") {
      const outcome = action.outcome;
      if (!outcome || !ID.test(outcome.run_id || "") || !KINDS.includes(outcome.operation_kind)
        || !Number.isSafeInteger(outcome.run_revision) || outcome.run_revision <= current.run_revision
        || !["committed", "no_change"].includes(outcome.status) || !recoverableFollowUp(outcome)) return rejected(current, "invalid_recovery_outcome");
      return accepted(next(current, { state: outcome.status, run_id: outcome.run_id, run_revision: outcome.run_revision, operation_kind: outcome.operation_kind, operation_id: outcome.operation_id, canonical_outcome: outcome.canonical_outcome || null, follow_up: outcome.follow_up || null, reason: null }));
    }
    if (!ID.test(action.run_id || "")) return rejected(current, "invalid_run_id");
    if (action.run_id !== current.run_id || action.run_revision !== current.run_revision) return rejected(current, "stale_run");
    if (action.type === "cancel") {
      if (!ACTIVE.has(current.state)) return rejected(current, "invalid_transition");
      return accepted(next(current, { state: "cancelled", reason: "cancelled", operation_id: current.operation_id }));
    }
    if (action.type === "provider_ready") {
      if (current.state !== "provider_pending" || !KINDS.includes(action.operation_kind) || !ID.test(action.operation_id || "")) return rejected(current, "invalid_transition");
      return accepted(next(current, { state: action.operation_kind === "noop" ? "no_change" : "review", operation_kind: action.operation_kind, operation_id: action.operation_id, reason: null }));
    }
    if (action.type === "provider_failed") {
      if (current.state !== "provider_pending") return rejected(current, "invalid_transition");
      return accepted(next(current, { state: "failed", reason: action.reason || "provider_failed" }));
    }
    if (action.type === "approve") return current.state === "review" ? accepted(next(current, { state: "authorizing" })) : rejected(current, "invalid_transition");
    if (action.type === "authorization_ready") return current.state === "authorizing" ? accepted(next(current, { state: "committing" })) : rejected(current, "invalid_transition");
    if (action.type === "authorization_failed") return current.state === "authorizing" ? accepted(next(current, { state: "failed", reason: action.reason || "authorization_failed" })) : rejected(current, "invalid_transition");
    if (action.type === "stale") return ["review", "authorizing", "committing"].includes(current.state) ? accepted(next(current, { state: "stale", reason: action.reason || "stale" })) : rejected(current, "invalid_transition");
    if (action.type === "commit_failed") return current.state === "committing" ? accepted(next(current, { state: "failed", reason: action.reason || "commit_failed" })) : rejected(current, "invalid_transition");
    if (action.type === "commit_succeeded") return current.state === "committing" ? accepted(next(current, { state: "committed", canonical_outcome: action.canonical_outcome, follow_up: action.follow_up || null, reason: null })) : rejected(current, "invalid_transition");
    if (action.type === "follow_up_changed") return current.state === "committed" ? accepted(next(current, { follow_up: action.follow_up })) : rejected(current, "invalid_transition");
    if (action.type === "cancel_follow_up") return current.state === "committed" ? accepted(next(current, { follow_up: action.follow_up, reason: "follow_up_cancelled" })) : rejected(current, "invalid_transition");
    return rejected(current, "unknown_action");
  }
  function createOperationRunState() {
    let current = initialOperationRunState();
    return Object.freeze({
      getState() { return current; },
      dispatch(action) { const result = transitionOperationRunState(current, action); if (result.ok) current = result.value; return result; },
    });
  }

  const api = Object.freeze({ STATES, KINDS, ACTIVE_STATES: Object.freeze([...ACTIVE]), initialOperationRunState, transitionOperationRunState, createOperationRunState });
  root.LLMWikiOperationRunState = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
