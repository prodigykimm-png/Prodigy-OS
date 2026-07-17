"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "../../../../../..");

function load(rel) {
  return require(path.join(ROOT, rel));
}

function main() {
  try { load("SYSTEM/Views/display-registry.js"); } catch (_e) { /* optional */ }
  try { load("SYSTEM/Views/object-lifecycle-core.js"); } catch (_e) { /* optional */ }
  const engine = load("SYSTEM/Views/object-engine-core.js");
  const launcher = load("SYSTEM/Views/workspace-launcher-core.js");
  const homeHub = fs.readFileSync(path.join(ROOT, "HUB/00 Home.md"), "utf8");
  const guide = fs.readFileSync(path.join(ROOT, "SYSTEM/docs/11_Operating_Guide.md"), "utf8");

  // --- Normalization ---
  const norm = engine.normalizeObject({
    type: "project",
    status: "doing",
    path: "PARA/PROJECTS/p.md",
    name: "3차 운송예산 편성",
    next_action: "다음 행동 설정",
    due_date: "2026-08-01"
  });
  assert.equal(norm.object_type, "project");
  assert.equal(norm.workspace_key, "project");
  assert.equal(norm.has_next_action, true);
  assert.equal(norm.source_path, "PARA/PROJECTS/p.md");

  const missing = engine.normalizeObject({ type: "project", status: "doing" });
  assert.ok(missing.warnings.some((w) => /path|경로/i.test(w)));

  // --- Lifecycle / Health / Attention / Primary (project needs_action) ---
  const projNeed = engine.evaluateObject({
    type: "project",
    status: "doing",
    path: "PARA/PROJECTS/need.md",
    name: "Need Action",
    next_action: ""
  });
  assert.equal(projNeed.schema_version, "prodigy-object-state-v1");
  assert.equal(projNeed.health.state, "needs_action");
  assert.ok(projNeed.health.reasons.length >= 1);
  assert.equal(projNeed.attention.level, "high");
  assert.ok(projNeed.attention.reasons.length >= 1);
  assert.equal(projNeed.primary_action.verb, "계속");
  assert.match(projNeed.primary_action.label, /다음 행동/);
  assert.ok(projNeed.primary_action.reason);

  const projOk = engine.evaluateObject({
    type: "project",
    status: "doing",
    path: "PARA/PROJECTS/ok.md",
    name: "OK",
    next_action: "문서 작성"
  });
  assert.ok(["healthy", "needs_action"].includes(projOk.health.state));
  assert.equal(projOk.primary_action.label, "문서 작성");

  const projDone = engine.evaluateObject({
    type: "project",
    status: "completed",
    path: "PARA/PROJECTS/done.md",
    name: "Done"
  });
  assert.equal(projDone.health.state, "completed");
  assert.equal(projDone.attention.level, "none");

  // --- Auction: next_action beats bid-date-only ---
  const auctions = engine.evaluateObjects([
    {
      type: "auction_case",
      status: "bidding",
      name: "김포 오피스텔",
      path: "PARA/PROJECTS/Auction/a.md",
      next_action: "관리비 확인",
      site_visit_date: "2026-07-10",
      auction_datetime: "2026-08-01"
    },
    {
      type: "auction_case",
      status: "bidding",
      name: "오늘 입찰 물건",
      path: "PARA/PROJECTS/Auction/b.md",
      next_action: "",
      auction_datetime: "2026-07-17"
    }
  ]);
  const primaryAuction = engine.selectPrimaryObject(auctions, "auction");
  assert.ok(primaryAuction);
  assert.ok(primaryAuction.title.includes("김포") || primaryAuction.primary_action.label.includes("관리비"));

  // --- Reading ---
  const reading = engine.evaluateObject({
    type: "reading",
    status: "reading",
    title: "Atomic Habits",
    path: "PARA/PROJECTS/Reading/b.md",
    progress: "143",
    next_action: "오늘 10페이지"
  });
  assert.equal(reading.workspace_key, "reading");
  assert.equal(reading.primary_action.verb, "이어 읽기");

  // --- Personal virtual via summary ---
  const personalPending = engine.buildWorkspaceSummary([], "personal", {
    journalStatus: { status: "empty" }
  });
  assert.equal(personalPending.empty, false);
  assert.equal(personalPending.actionVerb, "열기");
  assert.match(personalPending.title + personalPending.detail, /Pending|Review|성찰|2분|대기/i);

  const personalDone = engine.buildWorkspaceSummary([], "personal", {
    journalStatus: { status: "complete" }
  });
  assert.match(personalDone.title, /완료/);

  // --- Workout empty / active ---
  const workoutEmpty = engine.buildWorkspaceSummary([], "workout", { workoutSnapshot: null });
  assert.equal(workoutEmpty.empty, true);
  const workoutActive = engine.buildWorkspaceSummary([], "workout", {
    workoutSnapshot: { title: "Week 2 Day 3", contextLabel: "Today's Workout", detail: "Leg Day" }
  });
  assert.equal(workoutActive.empty, false);
  assert.equal(workoutActive.actionVerb, "시작");
  assert.match(workoutActive.title, /Week 2 Day 3/);

  // --- Empty auction ---
  const auctionEmpty = engine.buildWorkspaceSummary([], "auction", {});
  assert.equal(auctionEmpty.empty, true);
  assert.equal(auctionEmpty.actionVerb, "둘러보기");

  // --- Malformed does not throw ---
  const bad = engine.evaluateObject(null);
  assert.ok(bad.health);
  assert.ok(bad.attention);

  // --- Launcher integration (engine path) ---
  const cards = launcher.buildLauncherCards({
    pkg: {
      context: {
        auctions: [
          {
            type: "auction_case",
            name: "김포 오피스텔",
            status: "bidding",
            path: "PARA/PROJECTS/Auction/a.md",
            next_action: "관리비 확인",
            site_visit_date: "2026-07-10",
            auction_datetime: "2026-08-01"
          },
          {
            type: "auction_case",
            name: "오늘 입찰 물건",
            status: "bidding",
            path: "PARA/PROJECTS/Auction/b.md",
            next_action: "",
            auction_datetime: "2026-07-17"
          }
        ],
        reading: [{ type: "reading", title: "Atomic Habits", status: "reading", path: "r.md", progress: "143" }],
        projects: [
          { type: "project", name: "Auction Calendar MVP", status: "doing", path: "p.md", next_action: "Launcher 연결" },
          { type: "project", name: "완료된 것", status: "completed", path: "d.md" }
        ]
      }
    },
    journalStatus: { status: "empty" },
    workoutSnapshot: { title: "Week 2 Day 3", detail: "Leg Day" }
  });

  assert.equal(cards.length, 5);
  assert.deepEqual(cards.map((c) => c.id), ["auction", "workout", "reading", "project", "personal"]);
  assert.equal(cards.find((c) => c.id === "auction").actionVerb, "계속");
  assert.ok(
    cards.find((c) => c.id === "auction").title.includes("김포")
    || cards.find((c) => c.id === "auction").detail.includes("관리비")
  );
  assert.equal(cards.find((c) => c.id === "reading").actionVerb, "이어 읽기");
  assert.equal(cards.find((c) => c.id === "project").actionVerb, "계속");
  assert.equal(cards.find((c) => c.id === "workout").actionVerb, "시작");
  assert.equal(cards.find((c) => c.id === "personal").actionVerb, "열기");

  // Wiring
  assert.match(homeHub, /object-engine-core\.js/);
  assert.match(guide, /Object Engine/);
  assert.match(guide, /Derived state is not stored in YAML|YAML/);

  // No YAML property invention in engine source
  const engineSrc = fs.readFileSync(path.join(ROOT, "SYSTEM/Views/object-engine-core.js"), "utf8");
  assert.equal(engineSrc.includes("processFrontMatter"), false);
  assert.equal(engineSrc.includes("vault.modify"), false);

  console.log("Object engine tests passed");
}

main();
