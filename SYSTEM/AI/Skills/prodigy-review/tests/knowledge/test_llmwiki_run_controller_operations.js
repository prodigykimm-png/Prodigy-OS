"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");
const test = require("node:test");

const ROOT = path.resolve(__dirname, "../../../../../..");
const view = (name) => require(path.join(ROOT, "SYSTEM/Views", name));

function serializedOperation(kind, id = `operation_controller_${kind}`) {
  const target = `ZETA/PERMANENT/controller-${kind}.md`;
  const before = "before\n";
  const hash = view("llmwiki-hash.js").sha256(before);
  if (kind === "merge") {
    const sources = ["ZETA/PERMANENT/controller-merge-alpha.md", "ZETA/PERMANENT/controller-merge-beta.md"];
    const beforeBytes = { [target]: before, [sources[0]]: "alpha\n", [sources[1]]: "beta\n" };
    const revisions = Object.fromEntries(Object.entries(beforeBytes).map(([key, value]) => [key, view("llmwiki-hash.js").sha256(value)]));
    return JSON.stringify({
      contract_version: view("llmwiki-operation-contract.js").CONTRACT_VERSION, operation_id: id, kind, destination_ids: [target], source_ids: sources,
      base_revisions: revisions, before_bytes: beforeBytes, after_bytes: { [target]: "merged\n" },
      source_citations: sources.map((source, index) => ({ source_id: `source_controller_merge_${index}`, content_hash: String(index + 1).repeat(64), source_url: `https://example.com/${index}`, locators: [`ZETA/LITERATURE/merge-${index}.md#claim`], source_archive_id: null, confidence: "explicit" })),
      conflicts: [], risk_tier: "high", effects: { deprecations: [], supersessions: sources.map((source) => ({ destination_id: source, target_revision: revisions[source], before_bytes: beforeBytes[source], replacement_id: target, reason: "controller_merge" })) },
    });
  }
  const common = {
    contract_version: view("llmwiki-operation-contract.js").CONTRACT_VERSION,
    operation_id: id,
    kind,
    destination_ids: [target],
    base_revisions: kind === "create" ? {} : { [target]: hash },
    before_bytes: kind === "create" ? {} : { [target]: before },
    after_bytes: { [target]: kind === "noop" ? before : "after\n" },
    source_citations: [{ source_id: "source_controller_operation", content_hash: "a".repeat(64), source_url: "https://example.com/controller", locators: ["ZETA/LITERATURE/controller.md#claim"], source_archive_id: null, confidence: "explicit" }],
    conflicts: [],
    risk_tier: kind === "merge" ? "high" : kind === "update" ? "medium" : "low",
    effects: { deprecations: [], supersessions: [] },
  };
  return JSON.stringify(common);
}

function fakeService(kind, controls = {}) {
  return Object.freeze({
    kind,
    async prepare(input) {
      controls.prepare = (controls.prepare || 0) + 1;
      if (controls.prepareStarted) controls.prepareStarted.resolve();
      if (controls.prepareSignal) await controls.prepareSignal.promise;
      if (kind === "noop") return { ok: true, status: "no_change", audit: { result: "no_change", operation_id: input.operation.operation_id }, write_counts: { canonical: 0, audit: 0, refresh: 0, git: 0 } };
      return { ok: true, status: "review", value: { operation: input.operation } };
    },
    async authorize(input) { controls.authorize = (controls.authorize || 0) + 1; if (controls.approvalStarted) controls.approvalStarted.resolve(); if (controls.approvalSignal) await controls.approvalSignal.promise; return controls.authorizeResult || { ok: true, value: { operation_id: input.operation.operation_id, ...(input.intent.approval_identity ? { authorization_hash: input.intent.approval_identity } : {}) } }; },
    async commit(input) {
      controls.commit = (controls.commit || 0) + 1;
      if (controls.commitSignal) await controls.commitSignal.promise;
      if (typeof input.is_current === "function" && !input.is_current()) return { ok: false, status: "cancelled", reason: "cancelled_before_adapter" };
      controls.canonicalAdapter = (controls.canonicalAdapter || 0) + 1;
      return controls.commitResult || { ok: true, status: "committed", write_counts: { canonical: 1, audit: 1, refresh: 0, git: 0 }, receipt: { operation_id: input.operation.operation_id } };
    },
  });
}

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

function memoryOutcomeStore() {
  const values = new Map();
  return {
    async save(value) { values.set(value.run_id, JSON.parse(JSON.stringify(value))); },
    async load(runId) { return values.has(runId) ? JSON.parse(JSON.stringify(values.get(runId))) : null; },
    value(runId) { return values.get(runId) || null; },
  };
}

function controllerHarness(overrides = {}) {
  const controls = { create: {}, update: {}, merge: {}, noop: {} };
  const services = Object.fromEntries(Object.keys(controls).map((kind) => [kind, fakeService(kind, controls[kind])]));
  const ui = [];
  const provider = overrides.provider || (async (input) => ({ serialized_operation: input.serialized_operation }));
  const controller = view("llmwiki-run-controller.js").createRunController({
    operation_provider: provider,
    operation_services: services,
    operation_follow_ups: overrides.followUps || {},
    operation_outcome_store: overrides.outcomeStore,
    audit_operation_approval_callback: overrides.auditApproval,
    audit_operation_command: overrides.auditCommand,
    audit_operation_follow_up_entry: overrides.auditFollowUp,
    on_operation_state: (snapshot) => ui.push(snapshot.status),
  });
  return { controller, controls, ui };
}
function approveCurrent(controller) {
  const snapshot = controller.getOperationSnapshot();
  return controller.approveOperation({ action: "approve", run_id: snapshot.run_id, run_revision: snapshot.run_revision });
}

test("operation run state declares every kind and deterministic state/action transition", () => {
  const api = view("llmwiki-operation-run-state.js");
  assert.deepEqual(api.KINDS, ["create", "update", "merge", "noop"]);
  const actions = ["start", "provider_ready", "provider_failed", "approve", "authorization_ready", "authorization_failed", "commit_succeeded", "commit_failed", "stale", "cancel", "follow_up_changed", "cancel_follow_up", "recover", "unknown"];
  for (const state of api.STATES) {
    const current = { ...api.initialOperationRunState(), state, run_id: state === "idle" ? null : "run_matrix", run_revision: state === "idle" ? 0 : 1 };
    for (const type of actions) {
      const action = { type, run_id: "run_matrix", run_revision: 1, operation_kind: "update", operation_id: "operation_matrix", canonical_outcome: {}, follow_up: {}, run_revision_next: 2 };
      assert.deepEqual(api.transitionOperationRunState(current, action), api.transitionOperationRunState(current, action), `${state}:${type}`);
    }
  }
});

test("operation run identity and revision are monotonic and stale identities reject", () => {
  const state = view("llmwiki-operation-run-state.js").createOperationRunState();
  assert.equal(state.dispatch({ type: "start", run_id: "run_revision_one", run_revision: 1 }).ok, true);
  assert.equal(state.dispatch({ type: "provider_failed", run_id: "run_revision_one", run_revision: 1 }).ok, true);
  assert.equal(state.dispatch({ type: "start", run_id: "run_revision_replay", run_revision: 1 }).reason, "non_monotonic_run_revision");
  assert.equal(state.dispatch({ type: "start", run_id: "run_revision_two", run_revision: 2 }).ok, true);
  assert.equal(state.dispatch({ type: "provider_ready", run_id: "run_revision_one", run_revision: 1, operation_kind: "create", operation_id: "operation_stale" }).reason, "stale_run");
});

test("controller delegates typed update execution through the operation orchestrator", async () => {
  const { controller, controls } = controllerHarness();
  assert.equal(typeof controller.startOperation, "function");
  const started = await controller.startOperation({ run_id: "run_controller_update", serialized_operation: serializedOperation("update") });
  assert.equal(started.status, "review");
  const committed = await approveCurrent(controller);
  assert.equal(committed.status, "committed");
  assert.deepEqual({ prepare: controls.update.prepare, authorize: controls.update.authorize, commit: controls.update.commit }, { prepare: 1, authorize: 1, commit: 1 });
});

test("create, update, merge, and no-op use one exhaustive service interface", async () => {
  for (const kind of ["create", "update", "merge", "noop"]) {
    const { controller, controls } = controllerHarness();
    const runId = `run_all_operations_${kind}`;
    const started = await controller.startOperation({ run_id: runId, serialized_operation: serializedOperation(kind), context: {} });
    assert.equal(started.status, kind === "noop" ? "no_change" : "review", kind);
    if (kind === "noop") {
      assert.deepEqual(started.write_counts, { canonical: 0, audit: 0, refresh: 0, git: 0 });
      assert.deepEqual({ approval: controls.noop.authorize || 0, commit: controls.noop.commit || 0, adapter: controls.noop.canonicalAdapter || 0 }, { approval: 0, commit: 0, adapter: 0 });
    } else {
      const result = await approveCurrent(controller);
      assert.equal(result.status, "committed", kind);
      assert.equal(controls[kind].canonicalAdapter, 1, kind);
    }
  }
});

test("one active run rejects a second start and explicit replacement invalidates the old provider", async () => {
  const firstProvider = deferred();
  let calls = 0;
  const { controller, ui } = controllerHarness({ provider: async (input) => {
    calls += 1;
    return calls === 1 ? firstProvider.promise : { serialized_operation: input.serialized_operation };
  } });
  const first = controller.startOperation({ run_id: "run_active_first", serialized_operation: serializedOperation("update", "operation_active_first") });
  const rejected = await controller.startOperation({ run_id: "run_active_second", serialized_operation: serializedOperation("create", "operation_active_second") });
  assert.equal(rejected.reason, "run_in_progress");
  const replaced = await controller.startOperation({ run_id: "run_active_second", active_run_policy: "replace", serialized_operation: serializedOperation("create", "operation_active_second") });
  assert.equal(replaced.status, "review");
  const uiBeforeLate = ui.length;
  firstProvider.resolve({ serialized_operation: serializedOperation("update", "operation_active_first") });
  const late = await first;
  assert.equal(late.late_result_ignored, true);
  assert.equal(ui.length, uiBeforeLate);
  assert.equal(controller.getOperationSnapshot().run_id, "run_active_second");
  assert.equal(controller.getOperationSnapshot().counters.ignored_results, 1);
});

test("cancel while provider is pending aborts and makes the late provider result UI-inert", async () => {
  const provider = deferred();
  const { controller, ui, controls } = controllerHarness({ provider: () => provider.promise });
  const pending = controller.startOperation({ run_id: "run_cancel_provider", serialized_operation: serializedOperation("update") });
  const cancelled = await controller.cancelOperation({ action: "cancel" });
  assert.equal(cancelled.status, "cancelled");
  const uiAtCancel = ui.length;
  provider.resolve({ serialized_operation: serializedOperation("update") });
  const late = await pending;
  assert.equal(late.late_result_ignored, true);
  assert.equal(ui.length, uiAtCancel);
  assert.equal(controls.update.prepare || 0, 0);
  assert.equal(controls.update.canonicalAdapter || 0, 0);
});

test("cancel after provider readiness prevents approval and all canonical adapter calls", async () => {
  const { controller, controls } = controllerHarness();
  await controller.startOperation({ run_id: "run_cancel_review", serialized_operation: serializedOperation("merge") });
  assert.equal((await controller.cancelOperation({ action: "cancel" })).status, "cancelled");
  const approval = await approveCurrent(controller);
  assert.equal(approval.reason, "approval_not_available");
  assert.deepEqual({ approval: controls.merge.authorize || 0, commit: controls.merge.commit || 0, adapter: controls.merge.canonicalAdapter || 0 }, { approval: 0, commit: 0, adapter: 0 });
});

test("late packet preparation and approval callbacks are ignored before authorization or commit side effects", async () => {
  for (const phase of ["prepare", "approval"]) {
    const signal = deferred();
    const { controller, controls, ui } = controllerHarness();
    const started = deferred();
    controls.update[`${phase}Signal`] = signal;
    controls.update[`${phase}Started`] = started;
    const start = controller.startOperation({ run_id: `run_late_${phase}`, serialized_operation: serializedOperation("update") });
    let pending = start;
    if (phase === "approval") {
      await start;
      pending = approveCurrent(controller);
    }
    await started.promise;
    await controller.cancelOperation({ action: "cancel" });
    const uiAtCancel = ui.length;
    signal.resolve();
    const late = await pending;
    assert.equal(phase === "approval" ? late.approval_callback_ignored : late.late_result_ignored, true, phase);
    assert.equal(ui.length, uiAtCancel, phase);
    assert.equal(controls.update.commit || 0, 0, phase);
    assert.equal(controls.update.canonicalAdapter || 0, 0, phase);
  }
});

test("cancel during a pending commit ignores its callback and the guarded service never reaches its adapter", async () => {
  const signal = deferred();
  const { controller, controls, ui } = controllerHarness();
  controls.update.commitSignal = signal;
  await controller.startOperation({ run_id: "run_cancel_commit", serialized_operation: serializedOperation("update") });
  const pending = approveCurrent(controller);
  assert.equal((await controller.cancelOperation({ action: "cancel" })).status, "cancelled");
  const uiAtCancel = ui.length;
  signal.resolve();
  const late = await pending;
  assert.equal(late.approval_callback_ignored || late.late_result_ignored, true);
  assert.equal(ui.length, uiAtCancel);
  assert.equal(controls.update.canonicalAdapter || 0, 0);
  assert.equal(controller.getOperationSnapshot().counters.canonical, 0);
});

test("duplicate approval while committing is rejected and invokes commit once", async () => {
  const signal = deferred();
  const { controller, controls } = controllerHarness();
  controls.create.commitSignal = signal;
  await controller.startOperation({ run_id: "run_duplicate_callback", serialized_operation: serializedOperation("create") });
  const first = approveCurrent(controller);
  const duplicate = await approveCurrent(controller);
  assert.equal(duplicate.reason, "approval_not_available");
  signal.resolve();
  assert.equal((await first).status, "committed");
  assert.equal(controls.create.commit, 1);
  assert.equal(controls.create.canonicalAdapter, 1);
});

test("commit failure is terminal without a canonical success outcome", async () => {
  const { controller, controls } = controllerHarness();
  controls.update.commitResult = { ok: false, status: "rejected", reason: "synthetic_commit_failure", write_counts: { canonical: 0, audit: 0 } };
  await controller.startOperation({ run_id: "run_commit_failure", serialized_operation: serializedOperation("update") });
  const result = await approveCurrent(controller);
  assert.equal(result.status, "failed");
  assert.equal(result.reason, "synthetic_commit_failure");
  assert.equal(controller.getOperationSnapshot().canonical_outcome, null);
});

test("refresh and Git failures remain separate from immutable canonical success and retry without recommit", async () => {
  const attempts = { refresh: 0, git: 0 };
  const followUps = {
    async refresh() { attempts.refresh += 1; return attempts.refresh === 1 ? { ok: false, reason: "refresh_unavailable" } : { ok: true }; },
    async git() { attempts.git += 1; return attempts.git === 1 ? { ok: false, reason: "git_unavailable" } : { ok: true }; },
  };
  const { controller, controls } = controllerHarness({ followUps });
  await controller.startOperation({ run_id: "run_follow_up_failure", serialized_operation: serializedOperation("merge") });
  const committed = await approveCurrent(controller);
  assert.equal(committed.status, "committed");
  assert.equal(committed.canonical_outcome.status, "committed");
  assert.equal(committed.follow_up.status, "failed");
  assert.equal(committed.follow_up.refresh.status, "failed");
  assert.equal(committed.follow_up.git.status, "failed");
  await controller.retryOperationFollowUp({ action: "retry_follow_up", follow_up: "refresh" });
  const recovered = await controller.retryOperationFollowUp({ action: "retry_follow_up", follow_up: "git" });
  assert.equal(recovered.follow_up.status, "complete");
  assert.equal(controls.merge.commit, 1);
  assert.equal(controls.merge.canonicalAdapter, 1);
  assert.deepEqual(attempts, { refresh: 2, git: 2 });
});

test("cancel during refresh invalidates late refresh and Git callbacks while preserving canonical success", async () => {
  const refreshStarted = deferred();
  const refreshResult = deferred();
  let gitCalls = 0;
  const { controller, controls, ui } = controllerHarness({ followUps: {
    async refresh() { refreshStarted.resolve(); return refreshResult.promise; },
    async git() { gitCalls += 1; return { ok: true }; },
  } });
  await controller.startOperation({ run_id: "run_cancel_follow_up", serialized_operation: serializedOperation("update") });
  const approval = approveCurrent(controller);
  await refreshStarted.promise;
  const cancelled = await controller.cancelOperation({ action: "cancel" });
  assert.equal(cancelled.status, "committed");
  assert.equal(cancelled.reason, "follow_up_cancelled");
  assert.equal(cancelled.canonical_outcome.status, "committed");
  const uiAtCancel = ui.length;
  refreshResult.resolve({ ok: true });
  const late = await approval;
  assert.equal(late.late_result_ignored, true);
  assert.equal(ui.length, uiAtCancel);
  assert.equal(gitCalls, 0);
  assert.equal(controls.update.canonicalAdapter, 1);
  assert.equal(controller.getOperationSnapshot().counters.refresh, 0);
  assert.equal(controller.getOperationSnapshot().counters.git, 0);
});

test("recovery reconstructs committed and no-change outcomes without rerunning provider, approval, or commit", async () => {
  for (const status of ["committed", "no_change"]) {
    const { controller, controls, ui } = controllerHarness();
    const kind = status === "committed" ? "update" : "noop";
    const recovered = await controller.recoverOperation({ outcome: {
      outcome_version: "llmwiki_operation_run_outcome_v1", run_id: `run_recover_${kind}`, run_revision: 7,
      operation_kind: kind, operation_id: `operation_recover_${kind}`, status,
      canonical_outcome: status === "committed" ? { status: "committed", operation_kind: kind, operation_id: `operation_recover_${kind}`, receipt: {}, write_counts: { canonical: 1 } } : null,
      follow_up: { status: "complete", refresh: { status: "skipped", attempts: 0, reason: null }, git: { status: "skipped", attempts: 0, reason: null } },
    } });
    assert.equal(recovered.status, status);
    assert.equal(ui.length, 1);
    assert.deepEqual({ provider: recovered.counters.provider, approval: recovered.counters.approval, commit: recovered.counters.commit, adapter: controls[kind].canonicalAdapter || 0 }, { provider: 0, approval: 0, commit: 0, adapter: 0 });
  }
});

test("approval callback is privately bound to run, revision, operation, packet, and approval identity", async () => {
  const audits = [];
  const { controller, controls, ui } = controllerHarness({ auditApproval: (record) => audits.push(record) });
  await controller.startOperation({ run_id: "run_approval_bound_a", serialized_operation: serializedOperation("update", "operation_approval_bound_a") });
  const bound = controller.bindOperationApproval({ action: "approve", approval_identity: "approval_bound_a" });
  assert.equal(bound.ok, true);
  assert.equal(Object.isFrozen(bound.value), true);
  await controller.startOperation({ run_id: "run_approval_bound_b", active_run_policy: "replace", serialized_operation: serializedOperation("create", "operation_approval_bound_b") });
  const before = controller.getOperationSnapshot();
  const uiBefore = ui.length;
  const stale = await controller.approveOperation(bound.value);
  assert.equal(stale.reason, "stale_approval_callback");
  assert.equal(stale.approval_callback_ignored, true);
  assert.equal(ui.length, uiBefore);
  assert.deepEqual({ commit: controls.update.commit || 0, adapter: controls.update.canonicalAdapter || 0 }, { commit: 0, adapter: 0 });
  const after = controller.getOperationSnapshot();
  assert.deepEqual({ canonical: after.counters.canonical, refresh: after.counters.refresh, git: after.counters.git, ui: after.counters.ui }, { canonical: before.counters.canonical, refresh: before.counters.refresh, git: before.counters.git, ui: before.counters.ui });
  assert.equal(audits.length, 1);
  assert.deepEqual(audits[0].original_identity, { run_id: "run_approval_bound_a", run_revision: 1, operation_id: "operation_approval_bound_a", packet_identity: "operation_approval_bound_a", approval_identity: "approval_bound_a" });
  assert.deepEqual(audits[0].current_identity, { run_id: "run_approval_bound_b", run_revision: 2, operation_id: "operation_approval_bound_b", packet_identity: "operation_approval_bound_b" });
});

test("cancelled refresh and Git follow-up state persists and recovery cannot resurrect pending callbacks", async () => {
  for (const cancelledName of ["refresh", "git"]) {
    const store = memoryOutcomeStore();
    const started = deferred();
    const result = deferred();
    const calls = { refresh: 0, git: 0 };
    const followUps = {
      async refresh() { calls.refresh += 1; if (cancelledName === "refresh") { started.resolve(); return result.promise; } return { ok: true }; },
      async git() { calls.git += 1; started.resolve(); return result.promise; },
    };
    const { controller, controls } = controllerHarness({ followUps, outcomeStore: store });
    const runId = `run_persist_cancelled_${cancelledName}`;
    await controller.startOperation({ run_id: runId, serialized_operation: serializedOperation("update", `operation_persist_${cancelledName}`) });
    const approval = approveCurrent(controller);
    await started.promise;
    const cancelled = await controller.cancelOperation({ action: "cancel" });
    assert.equal(cancelled.follow_up.status, "cancelled");
    result.resolve({ ok: true });
    assert.equal((await approval).late_result_ignored, true);
    const durable = store.value(runId);
    assert.equal(durable.canonical_outcome.status, "committed");
    assert.equal(durable.follow_up.status, "cancelled");
    assert.equal(durable.follow_up[cancelledName].status, "cancelled");
    assert.equal([durable.follow_up.refresh.status, durable.follow_up.git.status].some((status) => ["pending", "running"].includes(status)), false);

    const recoveredHarness = controllerHarness({ followUps, outcomeStore: store });
    const recovered = await recoveredHarness.controller.recoverOperation({ run_id: runId });
    assert.equal(recovered.status, "committed");
    assert.equal(recovered.follow_up.status, "cancelled");
    assert.equal((await recoveredHarness.controller.retryOperationFollowUp({ action: "retry_follow_up", follow_up: cancelledName })).reason, "follow_up_retry_not_available");
    assert.equal(controls.update.commit, 1);
    assert.equal(controls.update.canonicalAdapter, 1);
  }
});

test("duplicate approval callback emits one deterministic audit and repeated delivery is side-effect free", async () => {
  const signal = deferred();
  const audits = [];
  const { controller, controls, ui } = controllerHarness({ auditApproval: (record) => audits.push(record) });
  controls.create.approvalSignal = signal;
  await controller.startOperation({ run_id: "run_duplicate_audit", serialized_operation: serializedOperation("create", "operation_duplicate_audit") });
  const bound = controller.bindOperationApproval({ action: "approve", approval_identity: "approval_duplicate_audit" }).value;
  const first = controller.approveOperation(bound);
  const uiBeforeDuplicates = ui.length;
  const firstDuplicate = await controller.approveOperation(bound);
  const secondDuplicate = await controller.approveOperation(bound);
  assert.equal(firstDuplicate.reason, "duplicate_approval_callback");
  assert.equal(secondDuplicate.reason, "duplicate_approval_callback");
  assert.equal(ui.length, uiBeforeDuplicates);
  assert.equal(audits.length, 1);
  assert.equal(controller.getOperationSnapshot().approval_callback_audits.length, 1);
  assert.equal(audits[0].callback_identity, bound.callback_identity);
  assert.deepEqual({ commit: controls.create.commit || 0, adapter: controls.create.canonicalAdapter || 0 }, { commit: 0, adapter: 0 });
  signal.resolve();
  assert.equal((await first).status, "committed");
  assert.equal(controls.create.commit, 1);
  assert.equal(controls.create.canonicalAdapter, 1);
});

test("refresh and Git adapter entry is identity-guarded after cancellation", async () => {
  for (const name of ["refresh", "git"]) {
    const entered = deferred();
    const proceed = deferred();
    const audits = [];
    let adapterCalls = 0;
    const followUps = {
      async refresh(input) {
        if (name !== "refresh") return { ok: true };
        entered.resolve(); await proceed.promise; input.guarded_entry.assert_current(); adapterCalls += 1; return { ok: true };
      },
      async git(input) {
        entered.resolve(); await proceed.promise; input.guarded_entry.assert_current(); adapterCalls += 1; return { ok: true };
      },
    };
    const { controller, ui } = controllerHarness({ followUps, auditFollowUp: (record) => audits.push(record) });
    await controller.startOperation({ run_id: `run_guard_follow_up_${name}`, serialized_operation: serializedOperation("update", `operation_guard_${name}`) });
    const approval = approveCurrent(controller);
    await entered.promise;
    await controller.cancelOperation({ action: "cancel" });
    const uiAtCancel = ui.length;
    proceed.resolve();
    assert.equal((await approval).late_result_ignored, true);
    assert.equal(adapterCalls, 0);
    assert.equal(ui.length, uiAtCancel);
    assert.equal(audits.length, 1);
    assert.equal(audits[0].follow_up, name);
    assert.equal(audits[0].reason, "follow_up_entry_stale");
  }
});

test("invalid cancel validates before token invalidation and leaves retry capability intact", async () => {
  let attempts = 0;
  const { controller } = controllerHarness({ followUps: { async refresh() { attempts += 1; return attempts === 1 ? { ok: false, reason: "retryable" } : { ok: true }; } } });
  await controller.startOperation({ run_id: "run_cancel_preflight", serialized_operation: serializedOperation("update", "operation_cancel_preflight") });
  await approveCurrent(controller);
  const before = controller.getOperationSnapshot();
  const rejected = await controller.cancelOperation({ action: "cancel", run_id: "run_cancel_preflight", run_revision: before.run_revision });
  assert.equal(rejected.reason, "invalid_transition");
  assert.deepEqual(controller.getOperationSnapshot().follow_up, before.follow_up);
  const retry = await controller.retryOperationFollowUp({ action: "retry_follow_up", follow_up: "refresh" });
  assert.equal(retry.follow_up.refresh.status, "succeeded");
  assert.equal(attempts, 2);
});

test("cancel and retry commands are privately identity-bound and stale or duplicate delivery audits once", async () => {
  const audits = [];
  const { controller, controls, ui } = controllerHarness({ auditCommand: (record) => audits.push(record), followUps: { async refresh() { return { ok: false, reason: "retryable" }; } } });
  await controller.startOperation({ run_id: "run_command_a", serialized_operation: serializedOperation("update", "operation_command_a") });
  const cancelA = controller.bindOperationCancel({ action: "cancel" }).value;
  await controller.startOperation({ run_id: "run_command_b", active_run_policy: "replace", serialized_operation: serializedOperation("create", "operation_command_b") });
  const uiBefore = ui.length;
  assert.equal((await controller.cancelOperation(cancelA)).reason, "stale_cancel_command");
  assert.equal((await controller.cancelOperation(cancelA)).reason, "duplicate_cancel_command");
  assert.equal(ui.length, uiBefore);
  assert.equal(controller.getOperationSnapshot().run_id, "run_command_b");
  assert.equal(controls.update.canonicalAdapter || 0, 0);

  await approveCurrent(controller);
  await controller.startOperation({ run_id: "run_command_retry_a", serialized_operation: serializedOperation("update", "operation_command_retry_a") });
  await approveCurrent(controller);
  const retryA = controller.bindOperationFollowUpRetry({ action: "retry_follow_up", follow_up: "refresh" }).value;
  await controller.startOperation({ run_id: "run_command_retry_b", serialized_operation: serializedOperation("noop", "operation_command_retry_b") });
  assert.equal((await controller.retryOperationFollowUp(retryA)).reason, "stale_retry_command");
  assert.equal((await controller.retryOperationFollowUp(retryA)).reason, "duplicate_retry_command");
  assert.equal(audits.length, 2);
  assert.deepEqual(audits.map((record) => record.reason), ["stale_cancel_command", "stale_retry_command"]);
});

test("serialized durable saves make cancelled follow-up win over an earlier suspended save", async () => {
  for (const name of ["refresh", "git"]) {
    const suspended = deferred();
    const release = deferred();
    const values = new Map();
    let saveCalls = 0;
    const suspendCall = name === "refresh" ? 2 : 3;
    const store = {
      async save(value) {
        saveCalls += 1;
        if (saveCalls === suspendCall) { suspended.resolve(); await release.promise; }
        values.set(value.run_id, JSON.parse(JSON.stringify(value)));
      },
      async load(runId) { return values.get(runId) || null; },
    };
    const followUps = { async refresh() { return { ok: name !== "refresh", reason: "refresh_failed" }; }, async git() { return { ok: false, reason: "git_failed" }; } };
    const { controller } = controllerHarness({ followUps, outcomeStore: store });
    const runId = `run_save_race_${name}`;
    await controller.startOperation({ run_id: runId, serialized_operation: serializedOperation("update", `operation_save_race_${name}`) });
    const approval = approveCurrent(controller);
    await suspended.promise;
    const cancellation = controller.cancelOperation({ action: "cancel" });
    release.resolve();
    assert.equal((await cancellation).follow_up.status, "cancelled");
    await approval;
    const durable = await store.load(runId);
    assert.equal(durable.follow_up.status, "cancelled");
    assert.equal(durable.outcome_revision >= 3, true);
    assert.equal([durable.follow_up.refresh.status, durable.follow_up.git.status].some((status) => ["pending", "running"].includes(status)), false);
    const recovered = controllerHarness({ followUps, outcomeStore: store });
    assert.equal((await recovered.controller.recoverOperation({ run_id: runId })).follow_up.status, "cancelled");
  }
});

test("raw stale approval intent cannot rebind to the replacement run and raw boundary is exact", async () => {
  const audits = [];
  const { controller, controls, ui } = controllerHarness({ auditApproval: (record) => audits.push(record) });
  await controller.startOperation({ run_id: "run_raw_stale_a", serialized_operation: serializedOperation("update", "operation_raw_stale_a") });
  const runA = controller.getOperationSnapshot();
  await controller.startOperation({ run_id: "run_raw_stale_b", active_run_policy: "replace", serialized_operation: serializedOperation("create", "operation_raw_stale_b") });
  const before = controller.getOperationSnapshot();
  const uiBefore = ui.length;
  const stale = await controller.approveOperation({ action: "approve", run_id: runA.run_id, run_revision: runA.run_revision });
  assert.equal(stale.reason, "stale_approval_callback");
  assert.equal(stale.approval_callback_ignored, true);
  assert.equal(audits.length, 1);
  assert.equal(ui.length, uiBefore);
  assert.equal(controller.getOperationSnapshot().state, "review");
  assert.deepEqual({ commit: controls.create.commit || 0, adapter: controls.create.canonicalAdapter || 0, canonical: controller.getOperationSnapshot().counters.canonical }, { commit: 0, adapter: 0, canonical: before.counters.canonical });

  const missing = await controller.approveOperation({ action: "approve" });
  assert.equal(missing.reason, "approval_run_identity_required");
  const mismatched = await controller.approveOperation({ action: "approve", run_id: before.run_id, run_revision: before.run_revision, operation_id: "operation_wrong", packet_identity: "packet_wrong" });
  assert.equal(mismatched.reason, "stale_approval_callback");
  assert.equal(controller.getOperationSnapshot().state, "review");

  const bound = controller.bindOperationApproval({ action: "approve" }).value;
  const copied = await controller.approveOperation({ ...bound });
  assert.equal(copied.reason, "unbranded_approval_callback");
  const current = await controller.approveOperation({ action: "approve", run_id: before.run_id, run_revision: before.run_revision });
  assert.equal(current.status, "committed");
  assert.equal(controls.create.canonicalAdapter, 1);
});

test("mismatched authorization terminalizes authorizing and invalidates the callback capability", async () => {
  const audits = [];
  const { controller, controls, ui } = controllerHarness({ auditApproval: (record) => audits.push(record) });
  controls.update.authorizeResult = { ok: true, value: { operation_id: "operation_terminal_mismatch", authorization_hash: "authorization_wrong" } };
  await controller.startOperation({ run_id: "run_authorization_mismatch", serialized_operation: serializedOperation("update", "operation_terminal_mismatch") });
  const bound = controller.bindOperationApproval({ action: "approve", approval_identity: "authorization_expected" }).value;
  const result = await controller.approveOperation(bound);
  assert.equal(result.reason, "mismatched_approval_identity");
  assert.equal(result.status, "failed");
  assert.equal(controller.getOperationSnapshot().state, "failed");
  assert.equal(controller.getOperationSnapshot().reason, "mismatched_approval_identity");
  assert.equal(ui.at(-1), "failed");
  assert.equal(audits.length, 1);
  assert.deepEqual({ commit: controls.update.commit || 0, adapter: controls.update.canonicalAdapter || 0, canonical: controller.getOperationSnapshot().counters.canonical }, { commit: 0, adapter: 0, canonical: 0 });
  assert.equal((await controller.approveOperation(bound)).reason, "duplicate_approval_callback");
  const recovered = await controller.startOperation({ run_id: "run_after_authorization_mismatch", serialized_operation: serializedOperation("noop", "operation_after_mismatch") });
  assert.equal(recovered.status, "no_change");
  assert.equal(recovered.run_revision > bound.run_revision, true);
});

test("stale commit result cannot become canonical success", async () => {
  const { controller, controls } = controllerHarness();
  controls.create.commitResult = { ok: false, status: "stale", reason: "stale_before_write", write_counts: { canonical: 0, audit: 0 } };
  await controller.startOperation({ run_id: "run_stale_commit", serialized_operation: serializedOperation("create") });
  const result = await approveCurrent(controller);
  assert.equal(result.status, "stale");
  assert.equal(controller.getOperationSnapshot().canonical_outcome, null);
});
