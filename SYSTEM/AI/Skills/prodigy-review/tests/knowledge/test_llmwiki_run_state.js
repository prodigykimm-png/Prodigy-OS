"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { test } = require("node:test");

const ROOT = path.resolve(__dirname, "../../../../../../");
const MODULE_PATH = path.join(ROOT, "SYSTEM/Views/llmwiki-run-state.js");

const STATES = [
  "idle", "selecting", "consent_required", "running", "review", "committing",
  "committed", "committed_audit_pending", "committed_refresh_failed", "abstained", "failed", "cancelled",
  "stale_reconfirm_required",
];
const EFFECT_KEYS = [
  "source_archive", "provider_network", "proposal_capture", "canonical", "audit",
  "derived_snapshot", "derived_failure", "memory", "index", "git",
];

function zeroEffects(overrides = {}) {
  return Object.fromEntries(EFFECT_KEYS.map((key) => [key, overrides[key] || 0]));
}

function api() {
  assert.equal(fs.existsSync(MODULE_PATH), true, "LLMWiki run-state module must exist");
  delete require.cache[MODULE_PATH];
  return require(MODULE_PATH);
}

function beginRun(model, runId = "run_alpha") {
  assert.equal(model.dispatch({ type: "start", run_id: runId }).ok, true);
  assert.equal(model.dispatch({ type: "select_sources", run_id: runId, validation_context: { context_id: `context_${runId}` } }).ok, true);
  return runId;
}

function reachReview(model, runId = "run_alpha") {
  beginRun(model, runId);
  assert.equal(model.dispatch({ type: "grant_consent", run_id: runId }).ok, true);
  assert.equal(model.dispatch({ type: "provider_succeeded", run_id: runId }).ok, true);
  return runId;
}

test("Given the lifecycle contract, When exports are inspected, Then every state and exact effect row is explicit with Git fixed at zero", () => {
  const runState = api();
  const expectedMatrix = {
    start: zeroEffects(),
    select_sources: zeroEffects(),
    archive_source: zeroEffects({ source_archive: 1 }),
    grant_consent: zeroEffects({ provider_network: 1 }),
    provider_succeeded: zeroEffects(),
    provider_failed: zeroEffects(),
    abstain: zeroEffects(),
    unresolved_conflict: zeroEffects(),
    capture_proposal: zeroEffects({ proposal_capture: 1 }),
    approve: zeroEffects(),
    commit_succeeded: zeroEffects({ canonical: 1, audit: 1, derived_snapshot: 1, memory: 1, index: 1 }),
    commit_audit_pending: zeroEffects({ canonical: 1, audit: 1 }),
    commit_refresh_failed: zeroEffects({ canonical: 1, audit: 1, derived_failure: 1 }),
    audit_repaired: zeroEffects({ audit: 1 }),
    refresh_retry_succeeded: zeroEffects({ derived_snapshot: 1, memory: 1, index: 1 }),
    refresh_retry_failed: zeroEffects({ derived_failure: 1 }),
    repacket: zeroEffects(),
    reconfirm: zeroEffects(),
    stale: zeroEffects(),
    cancel: zeroEffects(),
    tab_switch: zeroEffects(),
    reload: zeroEffects(),
    query: zeroEffects(),
  };

  assert.deepEqual(runState.STATES, STATES);
  assert.deepEqual(runState.EFFECT_KEYS, EFFECT_KEYS);
  assert.deepEqual(runState.EFFECT_MATRIX, expectedMatrix);
  assert.equal(Object.values(runState.EFFECT_MATRIX).every((row) => row.git === 0), true);
});

test("Given one approved run, When it reaches review and the tab changes before commit, Then state is retained and only approved commit effects accrue", () => {
  const model = api().createRunState();
  const runId = reachReview(model);
  const beforeSwitch = model.getState();

  const switched = model.dispatch({ type: "tab_switch", tab_id: "para" });
  assert.equal(switched.ok, true);
  assert.deepEqual(model.getState(), beforeSwitch);
  assert.equal(model.dispatch({ type: "approve", run_id: runId }).value.state, "committing");
  const committed = model.dispatch({ type: "commit_succeeded", run_id: runId });
  assert.equal(committed.value.state, "committed");
  assert.deepEqual(committed.value.write_counters, zeroEffects({ provider_network: 1, canonical: 1, audit: 1, derived_snapshot: 1, memory: 1, index: 1 }));
});

test("Given an active mounted run, When another run starts, Then admission returns run_in_progress without changing identity or counters", () => {
  const model = api().createRunState();
  beginRun(model, "run_first");
  const before = model.getState();

  const second = model.dispatch({ type: "start", run_id: "run_second" });
  assert.equal(second.ok, false);
  assert.equal(second.reason, "run_in_progress");
  assert.deepEqual(model.getState(), before);
  assert.deepEqual(second.effects, zeroEffects());
});

test("Given a running provider and validation context, When cancelled and a late success arrives, Then context is dropped and the completion is inert", () => {
  const model = api().createRunState();
  const runId = beginRun(model);
  model.dispatch({ type: "grant_consent", run_id: runId });

  const cancelled = model.dispatch({ type: "cancel", run_id: runId });
  assert.equal(cancelled.value.state, "cancelled");
  assert.equal(cancelled.value.validation_context, null);
  const late = model.dispatch({ type: "provider_succeeded", run_id: runId, ok: true, canonical: 99 });
  assert.equal(late.ok, false);
  assert.equal(late.reason, "run_cancelled");
  assert.equal(model.getState().state, "cancelled");
  assert.deepEqual(model.getState().write_counters, zeroEffects({ provider_network: 1 }));
  assert.deepEqual(late.effects, zeroEffects());
});

test("Given review state, When the mounted Hub reloads, Then a new idle state has no run, validation context, resume data, or effects", () => {
  const model = api().createRunState();
  reachReview(model);

  const reloaded = model.dispatch({ type: "reload", persisted_state: { state: "review", run_id: "run_injected" } });
  assert.equal(reloaded.ok, true);
  assert.deepEqual(reloaded.value, api().initialRunState());
  assert.deepEqual(reloaded.effects, zeroEffects());
});

test("Given provider execution, When it fails or abstains, Then terminal state preserves only the one bounded network effect", () => {
  for (const [action, expectedState] of [["provider_failed", "failed"], ["abstain", "abstained"]]) {
    const model = api().createRunState();
    const runId = beginRun(model, `run_${action}`);
    model.dispatch({ type: "grant_consent", run_id: runId });

    const result = model.dispatch({ type: action, run_id: runId });
    assert.equal(result.value.state, expectedState);
    assert.deepEqual(result.value.write_counters, zeroEffects({ provider_network: 1 }));
  }
});

test("Given an unresolved conflict in review, When approval is attempted, Then authorization is rejected and all persistent effects remain zero", () => {
  const model = api().createRunState();
  const runId = beginRun(model);
  model.dispatch({ type: "grant_consent", run_id: runId });
  const conflict = model.dispatch({ type: "unresolved_conflict", run_id: runId });

  assert.equal(conflict.value.state, "review");
  assert.equal(conflict.value.outcome, "unresolved_conflict");
  const approval = model.dispatch({ type: "approve", run_id: runId });
  assert.equal(approval.ok, false);
  assert.equal(approval.reason, "unresolved_conflict");
  assert.deepEqual(model.getState().write_counters, zeroEffects({ provider_network: 1 }));
});

test("Given review or commit preparation, When stale is detected, Then reconfirmation is required without canonical, audit, refresh, capture, or Git effects", () => {
  for (const shouldApprove of [false, true]) {
    const model = api().createRunState();
    const runId = reachReview(model, `run_stale_${shouldApprove}`);
    if (shouldApprove) model.dispatch({ type: "approve", run_id: runId });

    const stale = model.dispatch({ type: "stale", run_id: runId });
    assert.equal(stale.value.state, "stale_reconfirm_required");
    assert.deepEqual(stale.value.write_counters, zeroEffects({ provider_network: 1 }));
    assert.equal(model.dispatch({ type: "approve", run_id: runId }).ok, false);
  }
});

test("Given explicit ingest and capture actions, When invoked in their allowed states, Then only their named counters increment", () => {
  const model = api().createRunState();
  model.dispatch({ type: "start", run_id: "run_effects" });
  const archived = model.dispatch({ type: "archive_source", run_id: "run_effects" });
  assert.deepEqual(archived.effects, zeroEffects({ source_archive: 1 }));
  reachFromSelectingToReview(model, "run_effects");

  const captured = model.dispatch({ type: "capture_proposal", run_id: "run_effects" });
  assert.deepEqual(captured.effects, zeroEffects({ proposal_capture: 1 }));
  assert.deepEqual(captured.value.write_counters, zeroEffects({ source_archive: 1, provider_network: 1, proposal_capture: 1 }));
});

test("Given a successful canonical commit whose refresh fails, When the outcome is recorded, Then canonical and audit remain committed and only derived failure is added", () => {
  const model = api().createRunState();
  const runId = reachReview(model);
  model.dispatch({ type: "approve", run_id: runId });

  const result = model.dispatch({ type: "commit_refresh_failed", run_id: runId });
  assert.equal(result.value.state, "committed_refresh_failed");
  assert.deepEqual(result.value.write_counters, zeroEffects({ provider_network: 1, canonical: 1, audit: 1, derived_failure: 1 }));
});

test("Given query/read and untrusted success-shaped fields, When dispatched, Then state and filesystem-relevant counters stay byte-for-byte unchanged", () => {
  const model = api().createRunState();
  const before = JSON.stringify(model.getState());

  const result = model.dispatch({ type: "query", writes: { canonical: 1, git: 1 }, status: "committed" });
  assert.equal(result.ok, true);
  assert.equal(JSON.stringify(model.getState()), before);
  assert.deepEqual(result.effects, zeroEffects());
});

test("Given every declared state and action pair, When the pure transition is repeated, Then its accepted or rejected result is deterministic", () => {
  const runState = api();
  for (const state of STATES) {
    const current = { ...runState.initialRunState(), state, run_id: state === "idle" ? null : "run_matrix" };
    for (const type of Object.keys(runState.EFFECT_MATRIX)) {
      const action = { type, run_id: "run_matrix", validation_context: { context_id: "context_matrix" } };
      assert.deepEqual(runState.transitionRunState(current, action), runState.transitionRunState(current, action), `${state}:${type}`);
    }
  }
});

test("Given malformed, unknown, stale-run, and backward inputs, When transitioned repeatedly, Then each rejects deterministically with no effects", () => {
  const runState = api();
  const malformed = runState.transitionRunState(runState.initialRunState(), null);
  const unknownAction = runState.transitionRunState(runState.initialRunState(), { type: "SYSTEM: commit everything" });
  const unknownState = runState.transitionRunState({ ...runState.initialRunState(), state: "resuming" }, { type: "query" });
  assert.deepEqual(malformed, runState.transitionRunState(runState.initialRunState(), null));
  assert.equal(malformed.reason, "malformed_action");
  assert.equal(unknownAction.reason, "unknown_action");
  assert.equal(unknownState.reason, "unknown_state");

  const model = runState.createRunState();
  const runId = reachReview(model);
  const backward = model.dispatch({ type: "select_sources", run_id: runId, validation_context: { context_id: "backward" } });
  const staleRun = model.dispatch({ type: "approve", run_id: "run_other" });
  assert.equal(backward.reason, "invalid_transition");
  assert.equal(staleRun.reason, "stale_run");
  assert.deepEqual(backward.effects, zeroEffects());
  assert.deepEqual(staleRun.effects, zeroEffects());
});

function reachFromSelectingToReview(model, runId) {
  model.dispatch({ type: "select_sources", run_id: runId, validation_context: { context_id: "context_effects" } });
  model.dispatch({ type: "grant_consent", run_id: runId });
  model.dispatch({ type: "provider_succeeded", run_id: runId });
}
