"use strict";

function terminalActionReceipt(input = {}) {
  const state = input.state || {};
  const operation = state.operation_run || {};
  const migration = state.migration || {};
  const resurfacing = state.resurfacing || {};
  const lastAction = input.lastAction || {};
  const counters = input.counters || {};
  const before = input.before || {};
  const action = String(input.action || "");
  const expectedAction = String(input.expectedAction || "");
  const domText = String(input.domText || "");
  if (!lastAction.intent || lastAction.intent.action !== expectedAction) return null;

  const delta = (name) => Number(counters[name] || 0) - Number(before[name] || 0);
  const exact = (expected) => Object.entries(expected).every(([name, value]) => delta(name) === value);
  const followUpSucceeded = (followUp) => followUp && followUp.status === "complete"
    && followUp.refresh && followUp.refresh.status === "succeeded"
    && followUp.git && followUp.git.status === "succeeded";
  let terminal = false;
  let resultingState = "unknown";

  if (expectedAction === "approve_risk") {
    terminal = operation.status === "committed" && followUpSucceeded(operation.follow_up)
      && exact({ canonicalWrites: 1, auditWrites: 1, refreshCalls: 1, gitCalls: 1, gitCommits: 1, compensations: 0 })
      && /지식 반영 완료/u.test(domText) && !/Git 백업 보류/u.test(domText);
    resultingState = "committed";
  } else if (expectedAction === "reject_risk") {
    terminal = state.status === "cancelled" && exact({ canonicalWrites: 0, auditWrites: 0, gitCommits: 0 });
    resultingState = "cancelled";
  } else if (expectedAction === "approve_migration") {
    const receiptFollowUp = migration.receipt && migration.receipt.follow_up;
    if (action === "migration_noop_approve") {
      terminal = migration.status === "no_change" && exact({ canonicalWrites: 0, auditWrites: 1, gitCalls: 0, gitCommits: 0 });
      resultingState = "no_change";
    } else if (action === "migration_stale_approve") {
      terminal = migration.status === "stale" && migration.receipt && migration.receipt.reason === "target_revision_mismatch"
        && exact({ canonicalWrites: 0, auditWrites: 0, gitCalls: 0, gitCommits: 0 });
      resultingState = "stale";
    } else if (action === "migration_refresh_approve") {
      terminal = migration.status === "refresh_failed" && receiptFollowUp && receiptFollowUp.refresh.status === "failed"
        && receiptFollowUp.git.status === "succeeded" && exact({ canonicalWrites: 1, auditWrites: 1, refreshCalls: 1, gitCalls: 1, gitCommits: 1 });
      resultingState = "refresh_failed";
    } else if (action === "migration_git_approve") {
      terminal = migration.status === "git_backup_pending" && receiptFollowUp && receiptFollowUp.refresh.status === "succeeded"
        && receiptFollowUp.git.status === "failed" && exact({ canonicalWrites: 1, auditWrites: 1, gitCalls: 1, gitCommits: 0 });
      resultingState = "git_backup_pending";
    } else if (action === "migration_partial_approve") {
      terminal = ["commit_failed_restored", "compensation_required"].includes(migration.status)
        && migration.receipt && migration.receipt.ok === false
        && exact({ canonicalWrites: 1, auditWrites: 0, gitCalls: 0, gitCommits: 0, compensations: 1 });
      resultingState = migration.status;
    } else {
      terminal = migration.status === "committed" && receiptFollowUp
        && receiptFollowUp.refresh.status === "succeeded" && receiptFollowUp.git.status === "succeeded"
        && exact({ canonicalWrites: 1, auditWrites: 1, gitCalls: 1, gitCommits: 1 });
      resultingState = "committed";
    }
  } else if (expectedAction === "retry_migration_refresh") {
    terminal = migration.status === "committed" && migration.refresh_retry === "succeeded"
      && exact({ canonicalWrites: 0, auditWrites: 0, refreshCalls: 1, gitCalls: 0, gitCommits: 0 });
    resultingState = "committed";
  } else if (expectedAction === "retry_migration_git") {
    terminal = migration.status === "committed" && migration.git_retry === "succeeded"
      && exact({ canonicalWrites: 0, auditWrites: 0, gitCalls: 1, gitCommits: 1 });
    resultingState = "committed";
  } else if (expectedAction === "migration_recovery") {
    terminal = migration.status === "recovery_presented" && exact({ canonicalWrites: 0, auditWrites: 0, gitCommits: 0 });
    resultingState = "recovery_presented";
  } else if (expectedAction === "resurfacing_feedback") {
    terminal = resurfacing.status === "feedback_recorded" && exact({ canonicalWrites: 0, auditWrites: 0, gitCommits: 0 });
    resultingState = "feedback_recorded";
  } else if (expectedAction === "request_risk_revision") {
    terminal = operation.status === "review" && Array.isArray(state.risk_packets) && state.risk_packets.length > 0
      && exact({ canonicalWrites: 0, auditWrites: 0, gitCommits: 0 });
    resultingState = "review";
  }
  if (!terminal) return null;
  return {
    resulting_state: resultingState,
    writer_counts: {
      canonical: Number(counters.canonicalWrites || 0),
      audit: Number(counters.auditWrites || 0),
      git: Number(counters.gitCommits || 0),
      git_calls: Number(counters.gitCalls || 0),
      refresh: Number(counters.refreshCalls || 0),
      compensations: Number(counters.compensations || 0),
    },
    deltas: {
      canonical: delta("canonicalWrites"), audit: delta("auditWrites"), git: delta("gitCommits"),
      git_calls: delta("gitCalls"), refresh: delta("refreshCalls"), compensations: delta("compensations"),
    },
  };
}

module.exports = { terminalActionReceipt };
