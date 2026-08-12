"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "../../../../../..");
const core = require(path.join(ROOT, "SYSTEM/Views/object-lifecycle-core.js"));

function main() {
  const now = new Date("2026-07-17T12:00:00");

  // --- Existing behavior preserved ---
  const missingAction = core.getLifecycle({
    type: "project",
    status: "doing",
    next_action: "",
    updated: "2026-07-10"
  }, { now });
  assert.equal(missingAction.state, "needs_action");
  assert.equal(missingAction.reason, "다음 행동이 없습니다.");

  const reviewPending = core.getLifecycle({
    type: "auction_case",
    status: "reviewing",
    next_action: "복기 작성",
    updated: "2026-07-16"
  }, { now });
  assert.equal(reviewPending.state, "needs_review");
  assert.equal(reviewPending.reason, "복기가 대기 중입니다.");

  const reviewStatus = core.getLifecycle({
    type: "project",
    status: "doing",
    next_action: "자료 정리",
    review_status: "pending",
    updated: "2026-07-16"
  }, { now });
  assert.equal(reviewStatus.state, "needs_review");
  assert.equal(reviewStatus.reason, "복기가 대기 중입니다.");

  const completed = core.getLifecycle({
    type: "reading",
    status: "completed",
    next_action: "",
    updated: "2025-01-01"
  }, { now });
  assert.equal(completed.state, "completed");
  assert.equal(completed.reason, "종료 상태입니다.");

  const finished = core.getLifecycle({
    type: "reading",
    status: "finished",
    updated: "2025-01-01"
  }, { now });
  assert.equal(finished.state, "completed");

  const healthy = core.getLifecycle({
    type: "project",
    status: "doing",
    next_action: "초안 작성",
    updated: "2026-07-15"
  }, { now });
  assert.equal(healthy.state, "healthy");
  assert.equal(healthy.reason, "라이프사이클 경고 없음.");

  const stale = core.getLifecycle({
    type: "project",
    status: "doing",
    next_action: "후속 연락",
    updated: "2026-05-01"
  }, { now });
  assert.equal(stale.state, "stale");
  assert.match(stale.reason, /\d+일 동안 갱신되지 않았습니다/);

  // Lifecycle must never write fields onto the source object.
  const source = { type: "project", status: "doing", next_action: "A", updated: "2026-07-15" };
  const snapshot = JSON.stringify(source);
  core.getLifecycle(source, { now });
  assert.equal(JSON.stringify(source), snapshot);

  // --- Goal 1: Rule Registry ---
  assert.ok(core.ObjectLifecycleRules);
  assert.equal(core.ObjectLifecycleRules.defaults.stale_days, 30);
  assert.equal(core.ObjectLifecycleRules.defaults.review_warning_days, 0);
  assert.ok(core.ObjectLifecycleRules.workspace);
  assert.deepEqual(core.getConfig({}), { stale_days: 30, review_warning_days: 0 });
  // Workspace override fallback (empty override → defaults)
  assert.deepEqual(core.getConfig({ workspaceKey: "auction" }), { stale_days: 30, review_warning_days: 0 });
  assert.deepEqual(core.getConfig({ workspaceKey: "reading" }), { stale_days: 30, review_warning_days: 0 });
  // Call-site override still wins
  assert.equal(core.getConfig({ workspaceKey: "project", config: { stale_days: 10 } }).stale_days, 10);

  // Future override shape accepted without changing current defaults.
  const withFutureOverride = core.getConfig({
    workspaceKey: "auction",
    config: {}
  });
  assert.equal(withFutureOverride.stale_days, 30);

  // --- Goal 2: Terminal Registry ---
  assert.equal(core.isTerminal("completed"), true);
  assert.equal(core.isTerminal("archived"), true);
  assert.equal(core.isTerminal("finished"), true);
  assert.equal(core.isTerminal("cancelled"), true);
  assert.equal(core.isTerminal("abandoned"), true);
  assert.equal(core.isTerminal("doing"), false);
  assert.equal(core.isCompletedStatus("finished"), true);

  // --- Goal 3: Review hook ---
  // Unknown completeness + terminal status → remains completed (no guessing)
  const finishedUnknownReview = core.getLifecycle({
    type: "reading",
    status: "finished",
    updated: "2026-07-01"
  }, { now });
  assert.equal(finishedUnknownReview.state, "completed");

  // Explicit review incomplete + terminal primary work → needs_review
  const finishedReviewPending = core.getLifecycle({
    type: "reading",
    status: "finished",
    review_status: "pending",
    updated: "2026-07-01"
  }, { now });
  assert.equal(finishedReviewPending.state, "needs_review");
  assert.equal(finishedReviewPending.reason, "복기가 대기 중입니다.");

  // Custom reviewCompleteness hook
  const hookResult = core.getLifecycle({
    type: "project",
    status: "completed",
    next_action: "",
    updated: "2026-07-01"
  }, {
    now,
    reviewCompleteness: () => ({ known: true, complete: false, reason: "복기가 대기 중입니다." })
  });
  assert.equal(hookResult.state, "needs_review");
  assert.equal(hookResult.reason, "복기가 대기 중입니다.");

  // Hook that returns unknown must not invent needs_review
  const hookUnknown = core.getLifecycle({
    type: "project",
    status: "completed",
    updated: "2026-07-01"
  }, {
    now,
    reviewCompleteness: () => ({ known: false })
  });
  assert.equal(hookUnknown.state, "completed");

  // --- Goal 4: Reason API shape ---
  for (const sample of [missingAction, healthy, completed, stale, reviewPending]) {
    assert.equal(typeof sample.state, "string");
    assert.equal(typeof sample.reason, "string");
    assert.ok(Array.isArray(sample.warnings));
    assert.ok(sample.reason.length > 0);
  }
  assert.equal(core.REASONS.missing_next_action, "다음 행동이 없습니다.");
  assert.equal(core.REASONS.terminal_status, "종료 상태입니다.");
  assert.equal(core.REASONS.no_warnings, "라이프사이클 경고 없음.");

  const attention = core.summarizeAttention([
    { type: "project", status: "doing", next_action: "", path: "a.md", name: "P1", updated: "2026-07-10" },
    { type: "auction_case", status: "reviewing", next_action: "복기", path: "b.md", name: "A1", updated: "2026-07-10" },
    { type: "reading", status: "reading", next_action: "이어서 읽기", path: "c.md", name: "R1", updated: "2026-04-01" },
    { type: "project", status: "completed", path: "d.md", name: "Done", updated: "2026-01-01" }
  ], {
    now,
    journal: { missingReflection: true, reason: "성찰이 작성되지 않았습니다." }
  });

  assert.ok(attention.some((item) => item.state === "needs_action" && item.workspace === "project"));
  assert.ok(attention.some((item) => item.state === "needs_review" && item.workspace === "auction"));
  assert.ok(attention.some((item) => item.state === "stale" && item.workspace === "reading"));
  assert.ok(attention.some((item) => item.workspace === "journal"));
  assert.equal(attention.some((item) => item.state === "completed"), false);
  // Goal 5: Home can show reason without extra logic
  const projectAttention = attention.find((item) => item.workspace === "project" && item.state === "needs_action");
  assert.equal(projectAttention.reason, "다음 행동이 없습니다.");

  const evaluation = core.evaluateCollection([
    { type: "project", status: "doing", next_action: "A", updated: "2026-07-15" },
    { type: "project", status: "doing", next_action: "", updated: "2026-07-15" },
    { type: "project", status: "completed", updated: "2026-07-15" }
  ], { now });
  assert.equal(evaluation.counts.healthy, 1);
  assert.equal(evaluation.counts.needs_action, 1);
  assert.equal(evaluation.counts.completed, 1);

  const registry = fs.readFileSync(path.join(ROOT, "SYSTEM/Views/display-registry.js"), "utf8");
  assert.match(registry, /lifecycle:/);
  assert.match(registry, /needs_action/);
  assert.match(registry, /다음 행동 필요/);

  const home = fs.readFileSync(path.join(ROOT, "SYSTEM/Views/home-view.js"), "utf8");
  assert.match(home, /ObjectLifecycle/);
  assert.match(home, /summarizeAttention/);

  const guide = fs.readFileSync(path.join(ROOT, "SYSTEM/docs/11_Operating_Guide.md"), "utf8");
  assert.match(guide, /Lifecycle Rule Registry/);
  assert.match(guide, /Lifecycle Reason/);
  assert.match(guide, /Workspace Overrides|Workspace overrides/i);

  const projectTemplate = fs.readFileSync(path.join(ROOT, "SYSTEM/TEMPLATE/FORMAT/template_project.md"), "utf8");
  assert.equal(projectTemplate.includes("lifecycle:"), false);

  console.log("Object lifecycle tests passed");
}

main();
