"use strict";

(function attach(root) {
  const STATES = Object.freeze([
    "idle", "selecting", "consent_required", "running", "review", "committing",
    "committed", "committed_refresh_failed", "abstained", "failed", "cancelled",
    "stale_reconfirm_required",
  ]);
  const EFFECT_KEYS = Object.freeze([
    "source_archive", "provider_network", "proposal_capture", "canonical", "audit",
    "derived_snapshot", "derived_failure", "memory", "index", "git",
  ]);
  const ACTIVE_STATES = new Set([
    "selecting", "consent_required", "running", "review", "committing",
    "stale_reconfirm_required",
  ]);
  const ID = /^[a-z][a-z0-9_-]{2,127}$/;

  function effectRow(overrides) {
    const values = overrides || {};
    return Object.freeze(Object.fromEntries(EFFECT_KEYS.map((key) => [key, values[key] || 0])));
  }

  const EFFECT_MATRIX = Object.freeze({
    start: effectRow(),
    select_sources: effectRow(),
    archive_source: effectRow({ source_archive: 1 }),
    grant_consent: effectRow({ provider_network: 1 }),
    provider_succeeded: effectRow(),
    provider_failed: effectRow(),
    abstain: effectRow(),
    unresolved_conflict: effectRow(),
    capture_proposal: effectRow({ proposal_capture: 1 }),
    approve: effectRow(),
    commit_succeeded: effectRow({ canonical: 1, audit: 1, derived_snapshot: 1, memory: 1, index: 1 }),
    commit_refresh_failed: effectRow({ canonical: 1, audit: 1, derived_failure: 1 }),
    stale: effectRow(),
    cancel: effectRow(),
    tab_switch: effectRow(),
    reload: effectRow(),
    query: effectRow(),
  });

  function copyContext(value) {
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;
    return Object.freeze({ ...value });
  }

  function initialRunState() {
    return Object.freeze({
      state: "idle",
      run_id: null,
      validation_context: null,
      outcome: null,
      write_counters: effectRow(),
    });
  }

  function addEffects(counters, effects) {
    return Object.freeze(Object.fromEntries(EFFECT_KEYS.map((key) => [key, counters[key] + effects[key]])));
  }

  function accepted(current, actionType, changes) {
    const effects = EFFECT_MATRIX[actionType];
    const next = Object.freeze({
      state: changes.state === undefined ? current.state : changes.state,
      run_id: changes.run_id === undefined ? current.run_id : changes.run_id,
      validation_context: changes.validation_context === undefined ? current.validation_context : changes.validation_context,
      outcome: changes.outcome === undefined ? current.outcome : changes.outcome,
      write_counters: changes.reset === true ? effectRow() : addEffects(current.write_counters, effects),
    });
    return Object.freeze({ ok: true, value: next, effects });
  }

  function rejected(current, reason) {
    return Object.freeze({ ok: false, reason, state: current, effects: effectRow() });
  }

  function validSnapshot(current) {
    if (!current || typeof current !== "object" || Array.isArray(current)) return false;
    if (!current.write_counters || typeof current.write_counters !== "object") return false;
    return EFFECT_KEYS.every((key) => Number.isInteger(current.write_counters[key]) && current.write_counters[key] >= 0);
  }

  function transitionRunState(current, action) {
    if (!validSnapshot(current)) return rejected(initialRunState(), "malformed_state");
    if (!STATES.includes(current.state)) return rejected(current, "unknown_state");
    if (!action || typeof action !== "object" || Array.isArray(action) || typeof action.type !== "string") {
      return rejected(current, "malformed_action");
    }
    if (!Object.prototype.hasOwnProperty.call(EFFECT_MATRIX, action.type)) return rejected(current, "unknown_action");

    if (action.type === "reload") return accepted(current, "reload", { ...initialRunState(), reset: true });
    if (action.type === "tab_switch" || action.type === "query") return accepted(current, action.type, {});
    if (action.type === "start") {
      if (ACTIVE_STATES.has(current.state)) return rejected(current, "run_in_progress");
      if (typeof action.run_id !== "string" || !ID.test(action.run_id)) return rejected(current, "invalid_run_id");
      return accepted(current, "start", {
        state: "selecting", run_id: action.run_id, validation_context: null, outcome: null, reset: true,
      });
    }

    if (typeof action.run_id !== "string" || !ID.test(action.run_id)) return rejected(current, "invalid_run_id");
    if (action.run_id !== current.run_id) return rejected(current, "stale_run");
    if (current.state === "cancelled" && action.type === "provider_succeeded") return rejected(current, "run_cancelled");

    if (action.type === "cancel") {
      if (!ACTIVE_STATES.has(current.state)) return rejected(current, "invalid_transition");
      return accepted(current, "cancel", { state: "cancelled", validation_context: null, outcome: "cancelled" });
    }
    if (action.type === "archive_source") {
      if (current.state !== "selecting") return rejected(current, "invalid_transition");
      return accepted(current, "archive_source", {});
    }
    if (action.type === "select_sources") {
      const context = copyContext(action.validation_context);
      if (current.state !== "selecting") return rejected(current, "invalid_transition");
      if (!context || typeof context.context_id !== "string" || !ID.test(context.context_id)) return rejected(current, "invalid_validation_context");
      return accepted(current, "select_sources", { state: "consent_required", validation_context: context });
    }
    if (action.type === "grant_consent") {
      if (current.state !== "consent_required") return rejected(current, "invalid_transition");
      return accepted(current, "grant_consent", { state: "running" });
    }
    if (action.type === "provider_succeeded") {
      if (current.state !== "running") return rejected(current, "invalid_transition");
      return accepted(current, "provider_succeeded", { state: "review", outcome: "proposal_ready" });
    }
    if (action.type === "provider_failed") {
      if (current.state !== "running") return rejected(current, "invalid_transition");
      return accepted(current, "provider_failed", { state: "failed", outcome: "provider_failure" });
    }
    if (action.type === "abstain") {
      if (current.state !== "running" && current.state !== "review") return rejected(current, "invalid_transition");
      return accepted(current, "abstain", { state: "abstained", outcome: "abstained" });
    }
    if (action.type === "unresolved_conflict") {
      if (current.state !== "running" && current.state !== "review") return rejected(current, "invalid_transition");
      return accepted(current, "unresolved_conflict", { state: "review", outcome: "unresolved_conflict" });
    }
    if (action.type === "capture_proposal") {
      if (current.state !== "review" || current.outcome !== "proposal_ready") return rejected(current, current.outcome === "unresolved_conflict" ? "unresolved_conflict" : "invalid_transition");
      return accepted(current, "capture_proposal", {});
    }
    if (action.type === "approve") {
      if (current.state === "review" && current.outcome === "unresolved_conflict") return rejected(current, "unresolved_conflict");
      if (current.state !== "review" || current.outcome !== "proposal_ready") return rejected(current, "invalid_transition");
      return accepted(current, "approve", { state: "committing" });
    }
    if (action.type === "stale") {
      if (current.state !== "review" && current.state !== "committing") return rejected(current, "invalid_transition");
      return accepted(current, "stale", { state: "stale_reconfirm_required", outcome: "stale" });
    }
    if (action.type === "commit_succeeded" || action.type === "commit_refresh_failed") {
      if (current.state !== "committing") return rejected(current, "invalid_transition");
      const state = action.type === "commit_succeeded" ? "committed" : "committed_refresh_failed";
      return accepted(current, action.type, { state, outcome: state });
    }
    return rejected(current, "invalid_transition");
  }

  function createRunState() {
    let current = initialRunState();
    return Object.freeze({
      getState() { return current; },
      dispatch(action) {
        const result = transitionRunState(current, action);
        if (result.ok) current = result.value;
        return result;
      },
    });
  }

  const api = Object.freeze({ STATES, EFFECT_KEYS, EFFECT_MATRIX, initialRunState, transitionRunState, createRunState });
  root.LLMWikiRunState = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
