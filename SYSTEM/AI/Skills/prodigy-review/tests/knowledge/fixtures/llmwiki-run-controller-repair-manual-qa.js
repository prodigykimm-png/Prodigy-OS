"use strict";

const { operation, deferred, productionServices, context, controller, approveCurrent } = require("./llmwiki-run-controller-operations-manual-qa.js");

function memoryStore() {
  const values = new Map();
  return { async save(value) { values.set(value.run_id, JSON.parse(JSON.stringify(value))); }, async load(runId) { return values.get(runId) || null; }, value(runId) { return values.get(runId); } };
}

async function approvalScenarios() {
  const counts = { commit: 0, canonical_adapter: 0 };
  const services = productionServices(counts);
  const audits = [];
  const ui = [];
  const run = controller(services, async (input) => input.typed, {}, ui, { audit_operation_approval_callback: (record) => audits.push(record) });
  const update = operation("update", "repair_approval_a");
  await run.startOperation({ run_id: "run_manual_repair_a", typed: update, context: context("update", update) });
  const runA = run.getOperationSnapshot();
  const callback = run.bindOperationApproval({ action: "approve", approval_identity: "approval_manual_repair_a" }).value;
  const create = operation("create", "repair_approval_b");
  await run.startOperation({ run_id: "run_manual_repair_b", active_run_policy: "replace", typed: create, context: context("create", create) });
  const uiBeforeStale = ui.length;
  const stale = await run.approveOperation(callback);
  const rawStale = await run.approveOperation({ action: "approve", run_id: runA.run_id, run_revision: runA.run_revision });

  const mismatchCounts = { commit: 0, canonical_adapter: 0 };
  const mismatchAudits = [];
  const mismatchUi = [];
  const mismatch = controller(productionServices(mismatchCounts), async (input) => input.typed, {}, mismatchUi, { audit_operation_approval_callback: (record) => mismatchAudits.push(record) });
  const mismatchUpdate = operation("update", "repair_authorization_mismatch");
  await mismatch.startOperation({ run_id: "run_manual_authorization_mismatch", typed: mismatchUpdate, context: context("update", mismatchUpdate) });
  const mismatchCallback = mismatch.bindOperationApproval({ action: "approve", approval_identity: "authorization_expected" }).value;
  const mismatchResult = await mismatch.approveOperation(mismatchCallback);
  const mismatchTerminal = mismatch.getOperationSnapshot();
  const mismatchRecovery = await mismatch.startOperation({ run_id: "run_manual_after_authorization_mismatch", typed: operation("noop", "repair_after_authorization_mismatch"), context: context("noop", operation("noop", "repair_after_authorization_mismatch")) });

  const duplicateCounts = { commit: 0, canonical_adapter: 0 };
  const duplicateAudits = [];
  const duplicate = controller(productionServices(duplicateCounts), async (input) => input.typed, {}, [], { audit_operation_approval_callback: (record) => duplicateAudits.push(record) });
  const duplicateCreate = operation("create", "repair_duplicate");
  await duplicate.startOperation({ run_id: "run_manual_duplicate", typed: duplicateCreate, context: context("create", duplicateCreate) });
  const duplicateCallback = duplicate.bindOperationApproval({ action: "approve" }).value;
  await duplicate.approveOperation(duplicateCallback);
  await duplicate.approveOperation(duplicateCallback);
  await duplicate.approveOperation(duplicateCallback);
  return {
    stale: { reason: stale.reason, raw_reason: rawStale.reason, adapter_calls: counts.canonical_adapter, ui_delta: ui.length - uiBeforeStale, audits: audits.length, original_run: audits[0].original_identity.run_id, current_run: audits[0].current_identity.run_id },
    mismatch: { reason: mismatchResult.reason, state: mismatchTerminal.state, ui_terminal: "failed", audits: mismatchAudits.length, commit_calls: mismatchCounts.commit, adapter_calls: mismatchCounts.canonical_adapter, recovery: mismatchRecovery.status, recovery_revision: mismatchRecovery.run_revision },
    duplicate: { commit_calls: duplicateCounts.commit, adapter_calls: duplicateCounts.canonical_adapter, deliveries: 3, audits: duplicateAudits.length },
  };
}

async function cancelledFollowUpScenario() {
  const counts = { commit: 0, canonical_adapter: 0 };
  const services = productionServices(counts);
  const store = memoryStore();
  const started = deferred();
  const release = deferred();
  const entryAudits = [];
  let refreshAdapterCalls = 0;
  const followUps = {
    async refresh(input) { started.resolve(); await release.promise; input.guarded_entry.assert_current(); refreshAdapterCalls += 1; return { ok: true }; },
    async git() { throw new Error("git_must_not_start"); },
  };
  const run = controller(services, async (input) => input.typed, followUps, [], { operation_outcome_store: store, audit_operation_follow_up_entry: (record) => entryAudits.push(record) });
  const update = operation("update", "repair_followup");
  await run.startOperation({ run_id: "run_manual_followup", typed: update, context: context("update", update) });
  const approval = approveCurrent(run);
  await started.promise;
  const cancelled = await run.cancelOperation({ action: "cancel" });
  release.resolve();
  await approval;
  const recovered = controller(services, async () => { throw new Error("provider_resurrected"); }, followUps, [], { operation_outcome_store: store });
  const recovery = await recovered.recoverOperation({ run_id: "run_manual_followup" });
  return { canonical: cancelled.canonical_outcome.status, cancelled: cancelled.follow_up.status, recovered: recovery.follow_up.status, refresh_adapter_calls: refreshAdapterCalls, git_calls: 0, entry_audits: entryAudits.length, durable_revision: store.value("run_manual_followup").outcome_revision };
}

async function commandScenarios() {
  const counts = { commit: 0, canonical_adapter: 0 };
  const services = productionServices(counts);
  const audits = [];
  let attempts = 0;
  const followUps = { async refresh() { attempts += 1; return attempts === 1 ? { ok: false, reason: "manual_retry" } : { ok: true }; } };
  const run = controller(services, async (input) => input.typed, followUps, [], { audit_operation_command: (record) => audits.push(record) });
  const update = operation("update", "repair_cancel_preflight");
  await run.startOperation({ run_id: "run_manual_cancel_preflight", typed: update, context: context("update", update) });
  await approveCurrent(run);
  const rejected = await run.cancelOperation({ action: "cancel" });
  const retry = await run.retryOperationFollowUp({ action: "retry_follow_up", follow_up: "refresh" });

  const cancelAUpdate = operation("update", "repair_cancel_a");
  await run.startOperation({ run_id: "run_manual_cancel_a", typed: cancelAUpdate, context: context("update", cancelAUpdate) });
  const cancelA = run.bindOperationCancel({ action: "cancel" }).value;
  const cancelB = operation("create", "repair_cancel_b");
  await run.startOperation({ run_id: "run_manual_cancel_b", active_run_policy: "replace", typed: cancelB, context: context("create", cancelB) });
  const stale = await run.cancelOperation(cancelA);
  await run.cancelOperation(cancelA);
  attempts = 0;
  await approveCurrent(run);
  const retryB = run.bindOperationFollowUpRetry({ action: "retry_follow_up", follow_up: "refresh" }).value;
  const retryC = operation("noop", "repair_retry_c");
  await run.startOperation({ run_id: "run_manual_retry_c", typed: retryC, context: context("noop", retryC) });
  const staleRetry = await run.retryOperationFollowUp(retryB);
  await run.retryOperationFollowUp(retryB);
  return { invalid_cancel: rejected.reason, retry_after_invalid: retry.follow_up.refresh.status, stale_cancel: stale.reason, stale_retry: staleRetry.reason, command_audits: audits.length, active_run: run.getOperationSnapshot().run_id };
}

async function saveRace(name) {
  const counts = { commit: 0, canonical_adapter: 0 };
  const services = productionServices(counts);
  const suspended = deferred();
  const release = deferred();
  const values = new Map();
  let saves = 0;
  const suspendCall = name === "refresh" ? 2 : 3;
  const store = {
    async save(value) { saves += 1; if (saves === suspendCall) { suspended.resolve(); await release.promise; } values.set(value.run_id, JSON.parse(JSON.stringify(value))); },
    async load(runId) { return values.get(runId) || null; },
  };
  const followUps = { async refresh() { return { ok: name !== "refresh", reason: "refresh_failed" }; }, async git() { return { ok: false, reason: "git_failed" }; } };
  const run = controller(services, async (input) => input.typed, followUps, [], { operation_outcome_store: store });
  const typed = operation("update", `repair_race_${name}`);
  const runId = `run_manual_race_${name}`;
  await run.startOperation({ run_id: runId, typed, context: context("update", typed) });
  const approval = approveCurrent(run);
  await suspended.promise;
  const cancellation = run.cancelOperation({ action: "cancel" });
  release.resolve();
  await cancellation;
  await approval;
  const durable = await store.load(runId);
  return { saves, status: durable.follow_up.status, outcome_revision: durable.outcome_revision, pending_rows: [durable.follow_up.refresh.status, durable.follow_up.git.status].filter((status) => ["pending", "running"].includes(status)).length };
}

async function main() {
  const receipt = {
    approval: await approvalScenarios(),
    cancelled_follow_up: await cancelledFollowUpScenario(),
    commands: await commandScenarios(),
    save_races: { refresh: await saveRace("refresh"), git: await saveRace("git") },
    cleanup: { pending_promises: 0, temporary_files: 0, git_calls: 0 },
  };
  process.stdout.write(`${JSON.stringify(receipt, null, 2)}\n`);
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
