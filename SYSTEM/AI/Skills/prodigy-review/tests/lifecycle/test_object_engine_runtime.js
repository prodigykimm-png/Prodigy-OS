"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "../../../../../..");

function load(rel) {
  return require(path.join(ROOT, rel));
}

function main() {
  try { load("SYSTEM/Views/object-lifecycle-core.js"); } catch (_e) { /* optional */ }
  const engine = load("SYSTEM/Views/object-engine-core.js");
  const launcher = load("SYSTEM/Views/workspace-launcher-core.js");
  load("SYSTEM/Views/morning-brief-context.js");
  const briefApi = require(path.join(ROOT, "SYSTEM/Views/morning-brief-context.js"));

  // Next Action passthrough — never invent
  const withNext = engine.evaluateObject({
    type: "project",
    status: "doing",
    path: "p.md",
    name: "P",
    next_action: "초안 작성"
  });
  assert.equal(withNext.next_action, "초안 작성");
  assert.equal(engine.getNextAction(withNext), "초안 작성");

  const noNext = engine.evaluateObject({
    type: "project",
    status: "doing",
    path: "p2.md",
    name: "P2",
    next_action: ""
  });
  assert.equal(noNext.next_action, null);
  assert.equal(engine.getNextAction(noNext), null);

  // Continue Target
  const cont = engine.getContinueTarget(withNext);
  assert.ok(cont);
  assert.equal(cont.workspace, "project");
  assert.equal(cont.dashboard_path, "HUB/40 Project.md");
  assert.equal(cont.object_path, "p.md");
  assert.equal(cont.action, "초안 작성");
  assert.ok(cont.reason);

  const completed = engine.evaluateObject({
    type: "project",
    status: "completed",
    path: "done.md",
    name: "Done"
  });
  assert.equal(engine.getContinueTarget(completed), null);

  // evaluateObject embeds continue_target
  assert.ok(withNext.continue_target);
  assert.equal(withNext.continue_target.action, "초안 작성");

  // Memoization session
  const session = engine.createRuntimeSession({});
  const a = session.evaluateObject({ type: "reading", status: "reading", path: "r.md", title: "Book", next_action: "읽기" });
  const b = session.evaluateObject({ type: "reading", status: "reading", path: "r.md", title: "Book", next_action: "읽기" });
  assert.equal(a, b);

  // Auction continue prefers next_action
  const auctions = engine.evaluateObjects([
    {
      type: "auction_case",
      status: "bidding",
      path: "a.md",
      name: "김포",
      next_action: "관리비 확인",
      site_visit_date: "x",
      auction_datetime: "2026-08-01"
    },
    {
      type: "auction_case",
      status: "bidding",
      path: "b.md",
      name: "오늘입찰",
      next_action: "",
      auction_datetime: "2026-07-17"
    }
  ]);
  const aSum = engine.buildWorkspaceSummary(auctions, "auction", {});
  assert.ok(aSum.continue_target);
  assert.ok(
    aSum.continue_target.action.includes("관리비") || aSum.title.includes("김포")
  );

  // Launcher cards carry continue_target
  const cards = launcher.buildLauncherCards({
    pkg: {
      context: {
        auctions: auctions.map((s) => s._norm ? s._norm.raw : { type: "auction_case", status: "bidding", path: s.source_path, name: s.title, next_action: s.next_action || "" }),
        reading: [{ type: "reading", status: "reading", path: "r.md", title: "Atomic Habits", progress: "1" }],
        projects: [{ type: "project", status: "doing", path: "p.md", name: "Proj", next_action: "초안" }]
      }
    },
    journalStatus: { status: "empty" },
    workoutSnapshot: { title: "W2D3", detail: "Leg" }
  });
  // rebuild auctions properly for launcher
  const cards2 = launcher.buildLauncherCards({
    pkg: {
      context: {
        auctions: [
          { type: "auction_case", status: "bidding", path: "a.md", name: "김포", next_action: "관리비 확인", site_visit_date: "x", auction_datetime: "2026-08-01" },
          { type: "auction_case", status: "bidding", path: "b.md", name: "오늘입찰", next_action: "", auction_datetime: "2026-07-17" }
        ],
        reading: [{ type: "reading", status: "reading", path: "r.md", title: "Atomic Habits", progress: "1" }],
        projects: [{ type: "project", status: "doing", path: "p.md", name: "Proj", next_action: "초안" }]
      }
    },
    journalStatus: { status: "empty" },
    workoutSnapshot: { title: "W2D3", detail: "Leg" }
  });
  assert.equal(cards2.length, 5);
  const ac = cards2.find((c) => c.id === "auction");
  assert.ok(ac.continue_target || ac.detail);

  // Morning brief context includes continue_by_workspace
  const brief = briefApi.buildMorningBriefContext({
    pkg: {
      local_date: "2026-07-17",
      context: {
        risks: [],
        todoist: {},
        projects: [{ type: "project", status: "doing", path: "p.md", name: "Proj", next_action: "" }],
        auctions: [{ type: "auction_case", status: "bidding", path: "a.md", name: "A", next_action: "확인" }],
        reading: []
      }
    },
    journalStatus: { status: "empty" }
  });
  assert.equal(brief.engine_ok, true);
  assert.ok(brief.continue_by_workspace);
  assert.ok(brief.continue_by_workspace.auction === null || typeof brief.continue_by_workspace.auction === "object");

  // Explainability
  assert.ok(withNext.health.reasons.length);
  assert.ok(withNext.attention.reasons.length);
  assert.ok(withNext.continue_target.reason);

  // No persistence APIs
  const src = fs.readFileSync(path.join(ROOT, "SYSTEM/Views/object-engine-core.js"), "utf8");
  assert.equal(src.includes("processFrontMatter"), false);
  assert.match(src, /getContinueTarget/);
  assert.match(src, /createRuntimeSession/);

  const guide = fs.readFileSync(path.join(ROOT, "SYSTEM/docs/11_Operating_Guide.md"), "utf8");
  assert.match(guide, /Continue Target|Object Engine Runtime/);

  console.log("Object engine runtime tests passed");
}

main();
