"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "../../../../../..");

function load(rel) {
  return require(path.join(ROOT, rel));
}

function main() {
  // Lifecycle optional for scoring
  try {
    load("SYSTEM/Views/display-registry.js");
  } catch (_e) { /* optional */ }
  try {
    load("SYSTEM/Views/object-lifecycle-core.js");
  } catch (_e) { /* optional */ }

  const core = load("SYSTEM/Views/workspace-launcher-core.js");
  const viewSource = fs.readFileSync(path.join(ROOT, "SYSTEM/Views/workspace-launcher-view.js"), "utf8");
  const homeSource = fs.readFileSync(path.join(ROOT, "SYSTEM/Views/home-view.js"), "utf8");
  const homeHub = fs.readFileSync(path.join(ROOT, "HUB/00 Home.md"), "utf8");
  const guide = fs.readFileSync(path.join(ROOT, "SYSTEM/docs/11_Operating_Guide.md"), "utf8");

  const pkg = {
    context: {
      auctions: [
        {
          name: "김포 오피스텔",
          status: "bidding",
          path: "PARA/PROJECTS/Auction/a.md",
          next_action: "관리비 확인",
          site_visit_date: "2026-07-10",
          expected_bid: 100,
          auction_datetime: "2026-08-01"
        },
        {
          name: "오늘 입찰 물건",
          status: "bidding",
          path: "PARA/PROJECTS/Auction/b.md",
          next_action: "",
          auction_datetime: "2026-07-17"
        }
      ],
      reading: [
        {
          title: "Atomic Habits",
          status: "reading",
          path: "PARA/PROJECTS/Reading/book.md",
          progress: "143",
          next_action: "오늘 10페이지"
        }
      ],
      projects: [
        {
          name: "Auction Calendar MVP",
          status: "doing",
          path: "PARA/PROJECTS/p.md",
          next_action: "Launcher 연결"
        },
        {
          name: "완료된 것",
          status: "completed",
          path: "PARA/PROJECTS/done.md"
        }
      ]
    }
  };

  const cards = core.buildLauncherCards({
    pkg,
    journalStatus: { status: "empty" },
    workoutSnapshot: {
      title: "Week 2 Day 3",
      contextLabel: "Today's Workout",
      detail: "Leg Day"
    }
  });

  assert.equal(cards.length, 5);
  assert.deepEqual(
    cards.map((c) => c.id),
    ["auction", "workout", "reading", "project", "personal"]
  );

  // Consistent fields
  cards.forEach((c) => {
    assert.ok(c.icon);
    assert.ok(c.name);
    assert.ok(c.path);
    assert.ok(c.actionVerb);
    assert.ok(c.contextLabel);
  });

  // Auction: prefer needs attention / next_action over "bid today" alone
  const auction = cards.find((c) => c.id === "auction");
  assert.equal(auction.empty, false);
  assert.match(auction.title, /김포|관리비|오피스텔|경매/);
  // Item with next_action should win over empty next_action even if other is "today"
  assert.ok(
    auction.title.includes("김포") || auction.detail.includes("관리비"),
    "auction should surface actionable investment item"
  );
  assert.equal(auction.actionVerb, "계속");
  assert.equal(auction.path, "HUB/10 Auction.md");

  const workout = cards.find((c) => c.id === "workout");
  assert.equal(workout.empty, false);
  assert.match(workout.title, /Week 2 Day 3/);
  assert.equal(workout.actionVerb, "시작");

  const reading = cards.find((c) => c.id === "reading");
  assert.equal(reading.empty, false);
  assert.match(reading.title, /Atomic Habits/);
  assert.equal(reading.actionVerb, "이어 읽기");

  const project = cards.find((c) => c.id === "project");
  assert.equal(project.empty, false);
  assert.match(project.title, /Auction Calendar/);
  assert.equal(project.actionVerb, "계속");
  // completed projects excluded from pick
  assert.equal(project.title.includes("완료"), false);

  const personal = cards.find((c) => c.id === "personal");
  assert.equal(personal.actionVerb, "열기");
  assert.match(personal.contextLabel + personal.title, /Reflection|Pending|성찰|대기/i);

  // Empty states
  const emptyCards = core.buildLauncherCards({
    pkg: { context: { auctions: [], reading: [], projects: [] } },
    journalStatus: { status: "complete" },
    workoutSnapshot: null
  });
  assert.equal(emptyCards.find((c) => c.id === "auction").empty, true);
  assert.equal(emptyCards.find((c) => c.id === "reading").empty, true);
  assert.equal(emptyCards.find((c) => c.id === "workout").empty, true);
  assert.match(emptyCards.find((c) => c.id === "reading").detail, /없/);

  // View: tokenized layout, navigation to workspace, and compact action affordances
  assert.match(viewSource, /prodigy-launcher-card/);
  assert.match(viewSource, /grid-template-columns:\s*repeat\(auto-fit/);
  assert.match(viewSource, /block-size:\s*100%/);
  assert.match(viewSource, /ProdigyUI\.button|prodigy-btn/);
  assert.match(viewSource, /openPath|ProdigyWorkspaceNavigation/);
  assert.match(viewSource, /card\.path/);
  assert.equal(viewSource.includes("processFrontMatter"), false);

  // Home wiring
  assert.match(homeSource, /WorkspaceLauncherCore|WorkspaceLauncherView/);
  assert.match(homeSource, /Workspace Launcher|워크스페이스 런처|launcherCards|home-launcher-mount/);
  assert.match(homeHub, /workspace-launcher-core\.js/);
  assert.match(homeHub, /workspace-launcher-view\.js/);

  // Operating Guide
  assert.match(guide, /Workspace Launcher/);
  assert.match(guide, /Morning Brief/);
  assert.match(guide, /Workspace Dashboard/);

  console.log("Workspace launcher tests passed");
}

main();
