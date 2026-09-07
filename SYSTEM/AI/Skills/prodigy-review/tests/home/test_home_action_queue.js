"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");
const { test } = require("node:test");

const ROOT = path.resolve(__dirname, "../../../../../..");
const queue = require(path.join(ROOT, "SYSTEM/Views/home-action-queue.js"));

const pathFor = (workspace) => ({
  auction: "HUB/10 Auction.md",
  reading: "HUB/20 Reading.md",
  project: "HUB/40 Project.md",
  journal: "HUB/70 Journal.md",
  knowledge: "HUB/50 Knowledge.md",
  workout: "HUB/30 Workout.md",
})[workspace] || "";

test("ranks real urgent state above AI focus and operational follow-ups", () => {
  const actions = queue.buildActionQueue({
    now: new Date("2026-08-24T09:00:00+09:00"),
    pkg: {
      local_date: "2026-08-24",
      context: {
        auctions: [{
          status: "bidding",
          auction_datetime: "2026-08-25",
          case_number: "2026타경1",
          address: "서울시 강서구",
          path: "PARA/PROJECTS/Auction/2026타경1.md",
        }],
      },
    },
    attention: [{
      label: "프로젝트 마감 확인",
      attention_level: "critical",
      reason: "오늘 결정이 필요합니다.",
      object_path: "PARA/PROJECTS/Project/긴급.md",
      dashboard_path: "HUB/40 Project.md",
      workspace_label: "프로젝트",
    }],
    focusItems: [{
      label: "독서 20쪽",
      source_type: "reading",
      next_action: "Atomic Habits 20쪽 읽기",
      object_path: "PARA/PROJECTS/Reading/book.md",
    }],
    focusApproved: true,
    continueCards: [{
      title: "러닝 세션",
      workspace: "workout",
      status: "running",
      next_action: "5km 기록 마무리",
      dashboard_path: "HUB/30 Workout.md",
    }],
    inboxCount: 3,
    journalStatus: "empty",
    workspacePathFor: pathFor,
  });

  assert.deepEqual(actions.map((item) => item.kind), [
    "auction",
    "attention",
    "approved_focus",
    "inbox",
    "continue",
  ]);
  assert.equal(actions[0].title, "2026타경1");
  assert.match(actions[0].reason, /D-1/);
  assert.equal(actions[2].action_label, "시작하기");
  assert.equal(actions[3].title, "INBOX 3개 검토");
  assert.equal(actions.length, 5);
});

test("dedupes the same object and hides generic continue rows", () => {
  const actions = queue.buildActionQueue({
    now: new Date("2026-08-24T09:00:00+09:00"),
    pkg: { local_date: "2026-08-24", context: { auctions: [] } },
    attention: [{
      label: "동일 Object",
      attention_level: "high",
      reason: "확인 필요",
      object_path: "PARA/PROJECTS/Project/same.md",
      dashboard_path: "HUB/40 Project.md",
    }],
    focusItems: [{
      label: "동일 Object",
      source_type: "project",
      next_action: "다음 행동",
      object_path: "PARA/PROJECTS/Project/same.md",
    }],
    continueCards: [
      { title: "관심 물건", workspace: "auction", status: "watching", next_action: "", dashboard_path: "HUB/10 Auction.md" },
      { title: "실행 중", workspace: "project", status: "doing", next_action: "보고서 마무리", dashboard_path: "HUB/40 Project.md" },
    ],
    workspacePathFor: pathFor,
  });

  assert.equal(actions.filter((item) => item.object_path === "PARA/PROJECTS/Project/same.md").length, 1);
  assert.equal(actions.some((item) => item.title === "관심 물건"), false);
  assert.equal(actions.some((item) => item.title === "실행 중"), true);
});

test("Knowledge INBOX enters Home only at the three-item action threshold", () => {
  for (const inboxCount of [0, 1, 2]) {
    const actions = queue.buildActionQueue({
      now: new Date("2026-08-24T09:00:00+09:00"),
      pkg: { local_date: "2026-08-24", context: { auctions: [] } },
      inboxCount,
      journalStatus: "complete",
      workspacePathFor: pathFor,
    });
    assert.equal(actions.some((item) => item.kind === "inbox"), false, `count ${inboxCount}`);
  }
  for (const inboxCount of [3, 10]) {
    const actions = queue.buildActionQueue({
      now: new Date("2026-08-24T09:00:00+09:00"),
      pkg: { local_date: "2026-08-24", context: { auctions: [] } },
      inboxCount,
      journalStatus: "complete",
      workspacePathFor: pathFor,
    });
    const inbox = actions.find((item) => item.kind === "inbox");
    assert.ok(inbox, `count ${inboxCount}`);
    assert.equal(inbox.pending_count, inboxCount);
    assert.equal(inbox.pending_priority, inboxCount >= 10 ? "backlog" : "emphasized");
  }
});

test("Knowledge pending action survives a crowded top-five deterministically", () => {
  const attention = Array.from({ length: 6 }, (_, index) => ({
    label: `긴급 ${index + 1}`,
    attention_level: "critical",
    reason: "오늘 확인",
    object_path: `PARA/PROJECTS/Project/urgent-${index + 1}.md`,
    dashboard_path: "HUB/40 Project.md",
    workspace_label: "프로젝트",
  }));
  for (const inboxCount of [3, 10]) {
    const actions = queue.buildActionQueue({
      now: new Date("2026-08-24T09:00:00+09:00"),
      pkg: { local_date: "2026-08-24", context: { auctions: [] } },
      attention,
      inboxCount,
      journalStatus: "complete",
      workspacePathFor: pathFor,
    });
    assert.equal(actions.length, 5);
    assert.equal(actions.filter((item) => item.kind === "inbox").length, 1, `count ${inboxCount}`);
    assert.equal(actions[4].kind, "inbox", `count ${inboxCount}`);
    assert.deepEqual(actions.slice(0, 4).map((item) => item.title), ["긴급 1", "긴급 2", "긴급 3", "긴급 4"]);
  }
});

test("journal becomes a real action and proposals stay approval actions", () => {
  const actions = queue.buildActionQueue({
    now: new Date("2026-08-24T21:00:00+09:00"),
    pkg: { local_date: "2026-08-24", context: { auctions: [] } },
    focusItems: [{ label: "정리 제안", source_type: "project", reason: "AI가 제안함" }],
    focusApproved: false,
    journalStatus: "empty",
    inboxCount: 1,
    workspacePathFor: pathFor,
  });

  assert.equal(actions[0].kind, "journal");
  assert.equal(actions[0].action_label, "2분 성찰");
  const proposal = actions.find((item) => item.kind === "focus_proposal");
  assert.ok(proposal);
  assert.equal(proposal.action_label, "집중으로 승인");
  assert.equal(proposal.reason, "AI가 제안함");
});
