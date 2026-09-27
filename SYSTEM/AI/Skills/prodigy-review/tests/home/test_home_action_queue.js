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

// ── Single canonical next action (Home first-paint contract) ──

class FakeNode {
  constructor(tag, options = {}) {
    this.tagName = String(tag).toUpperCase();
    this.children = [];
    this.attributes = {};
    this.textContent = options.text || "";
    this.onclick = null;
    if (options.attr) {
      for (const [key, value] of Object.entries(options.attr)) this.attributes[key] = String(value);
    }
  }
  createEl(tag, options = {}) {
    const child = new FakeNode(tag, options);
    this.children.push(child);
    return child;
  }
  findAll(predicate, found = []) {
    if (predicate(this)) found.push(this);
    for (const child of this.children) child.findAll(predicate, found);
    return found;
  }
}

function urgentFixture() {
  return {
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
    inboxCount: 3,
    journalStatus: "empty",
    workspacePathFor: pathFor,
  };
}

function nextActionShells(root) {
  return root.findAll((el) => el.attributes["data-home-next-action"] === "true");
}

test("first paint selects exactly one canonical next action", () => {
  const actions = queue.buildActionQueue(urgentFixture());
  assert.ok(actions.length > 1, "projection still ranks several candidates");
  const selected = queue.selectNextAction(actions);
  assert.equal(selected.title, "2026타경1");
  assert.match(selected.reason, /D-1/);
  assert.ok(selected.target_path, "canonical action has a target");
  assert.ok(selected.action_label, "canonical action has a follow-up action");
  assert.ok(selected.workspace, "canonical action names a workspace");
});

test("re-render with different inputs selects a different action (no stale cache)", () => {
  const first = queue.selectNextAction(queue.buildActionQueue(urgentFixture()));
  const second = queue.selectNextAction(queue.buildActionQueue({
    now: new Date("2026-08-24T21:00:00+09:00"),
    pkg: { local_date: "2026-08-24", context: { auctions: [] } },
    journalStatus: "empty",
    workspacePathFor: pathFor,
  }));
  assert.equal(first.title, "2026타경1");
  assert.equal(second.kind, "journal");
  assert.notEqual(first.title, second.title);
});

test("rendered next action is exactly one element with reason, target and action", () => {
  const parent = new FakeNode("div");
  const actions = queue.buildActionQueue(urgentFixture());
  const activated = [];
  queue.renderNextAction({
    parent,
    action: queue.selectNextAction(actions),
    aiBacked: false,
    onAction: (action) => activated.push(action),
  });
  const shells = nextActionShells(parent);
  assert.equal(shells.length, 1, "exactly one [data-home-next-action]");
  assert.equal(shells[0].attributes["data-state"], "ready");
  const reason = shells[0].findAll((el) => el.attributes["data-next-action-reason"]);
  assert.equal(reason.length, 1);
  assert.ok(reason[0].textContent, "reason is non-empty");
  const buttons = shells[0].findAll((el) => el.tagName === "BUTTON");
  assert.equal(buttons.length, 1, "one follow-up control, no second queue");
  assert.ok(buttons[0].textContent, "action label is non-empty");
  assert.ok(buttons[0].attributes["data-next-action-target"], "target is non-empty");
  assert.ok(buttons[0].attributes["aria-label"].includes("·"), "control names title and action");
  buttons[0].onclick();
  assert.equal(activated.length, 1, "the single control is live, not dead");
  assert.equal(activated[0].title, "2026타경1");
});

test("two competing actions cannot pass as one (misleading success is rejected)", () => {
  const actions = queue.buildActionQueue(urgentFixture());
  assert.ok(actions.length >= 2, "fixture really has competing candidates");
  assert.throws(() => queue.assertSingleNextAction(actions), /exactly one/,
    "an array of competing actions is rejected, not silently passed");
  const parent = new FakeNode("div");
  assert.throws(() => queue.renderNextAction({ parent, action: actions.slice(0, 2) }), /exactly one/,
    "rendering two competing actions fails instead of painting both");
  assert.equal(nextActionShells(parent).length, 0, "failed render leaves no half-painted shell");
});

test("malformed, missing, and empty queues yield typed states with recovery", () => {
  for (const input of [
    { actions: undefined, expect: "empty", label: "missing queue" },
    { actions: [], expect: "empty", label: "empty queue" },
    { actions: [{ title: "", reason: "", action_label: "" }], expect: "empty", label: "malformed record" },
    { actions: [{ title: "깨진 항목", reason: "", action_label: "", target_path: "" }], expect: "empty", label: "reasonless record" },
  ]) {
    const typed = queue.nextActionStateFor(input);
    assert.equal(typed.state, input.expect, input.label);
    const parent = new FakeNode("div");
    let recovered = 0;
    queue.renderNextAction({
      parent,
      actions: input.actions,
      onAction: () => {},
      onRecovery: () => { recovered += 1; },
    });
    const shells = nextActionShells(parent);
    assert.equal(shells.length, 1, `${input.label}: still exactly one shell`);
    assert.equal(shells[0].attributes["data-state"], "empty", `${input.label}: typed empty state`);
    const buttons = shells[0].findAll((el) => el.tagName === "BUTTON");
    assert.equal(buttons.length, 1, `${input.label}: a visible recovery path`);
    assert.ok(buttons[0].textContent, `${input.label}: recovery control is labeled`);
    buttons[0].onclick();
    assert.equal(recovered, 1, `${input.label}: recovery control is live`);
  }
});

test("loading and error states keep one shell and a live recovery control", () => {
  const loadingParent = new FakeNode("div");
  let refreshed = 0;
  queue.renderNextAction({ parent: loadingParent, loading: true, onRecovery: () => { refreshed += 1; } });
  const loadingShells = nextActionShells(loadingParent);
  assert.equal(loadingShells.length, 1);
  assert.equal(loadingShells[0].attributes["data-state"], "loading");
  const loadingButtons = loadingShells[0].findAll((el) => el.tagName === "BUTTON");
  assert.equal(loadingButtons.length, 1, "loading keeps a recovery path");
  loadingButtons[0].onclick();
  assert.equal(refreshed, 1, "loading recovery is live");

  const errorParent = new FakeNode("div");
  let retried = 0;
  queue.renderNextAction({
    parent: errorParent,
    error: new Error("morning brief unavailable"),
    onRecovery: () => { retried += 1; },
  });
  const errorShells = nextActionShells(errorParent);
  assert.equal(errorShells.length, 1);
  assert.equal(errorShells[0].attributes["data-state"], "error");
  const errorButtons = errorShells[0].findAll((el) => el.tagName === "BUTTON");
  assert.equal(errorButtons.length, 1, "error keeps a recovery path");
  errorButtons[0].onclick();
  assert.equal(retried, 1, "error recovery is live");
});
