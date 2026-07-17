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
  load("SYSTEM/Views/object-engine-core.js");
  const ctxApi = load("SYSTEM/Views/morning-brief-context.js");
  const homeSource = fs.readFileSync(path.join(ROOT, "SYSTEM/Views/home-view.js"), "utf8");
  const homeHub = fs.readFileSync(path.join(ROOT, "HUB/00 Home.md"), "utf8");
  const guide = fs.readFileSync(path.join(ROOT, "SYSTEM/docs/11_Operating_Guide.md"), "utf8");

  const pkg = {
    local_date: "2026-07-17",
    context: {
      todoist: { todayCount: 2, overdueCount: 1 },
      risks: [
        {
          label: "입찰 전 임장 근거 부족",
          reason: "현장 방문일이 비어 있습니다.",
          object_path: "PARA/PROJECTS/Auction/a.md",
          evidence: ["현장 임장 미지정"],
          sources: ["Auction Object"]
        }
      ],
      projects: [
        {
          type: "project",
          status: "doing",
          path: "PARA/PROJECTS/need.md",
          name: "3차 운송예산 편성",
          next_action: "",
          due_date: "2026-07-17"
        }
      ],
      auctions: [
        {
          type: "auction_case",
          status: "bidding",
          path: "PARA/PROJECTS/Auction/a.md",
          name: "김포 오피스텔",
          next_action: "관리비 확인",
          site_visit_date: "",
          auction_datetime: "2026-07-20"
        }
      ],
      reading: [
        {
          type: "reading",
          status: "reading",
          path: "PARA/PROJECTS/Reading/b.md",
          title: "Atomic Habits",
          progress: "143",
          next_action: "오늘 읽기"
        }
      ]
    }
  };

  const brief = ctxApi.buildMorningBriefContext({
    pkg,
    pinnedFocus: {
      focus: { id: "pin1", label: "고정 Focus", reason: "사람 고정", object_path: "PARA/PROJECTS/need.md" }
    },
    journalStatus: { status: "empty" },
    now: new Date("2026-07-17T10:00:00")
  });

  assert.equal(brief.schema_version, "morning-brief-context-v1");
  assert.equal(brief.engine_ok, true);
  assert.ok(Array.isArray(brief.pinned_focus));
  assert.equal(brief.pinned_focus.length, 1);
  assert.deepEqual(brief.display_order, [
    "morning_brief",
    "todays_focus",
    "continue",
    "needs_attention",
    "quick_actions",
    "todoist",
    "workspace_launcher",
    "system_status"
  ]);
  assert.ok(brief.today);
  assert.equal(brief.today.due_today.todoist_today, 2);
  assert.ok(Array.isArray(brief.engine_states));
  assert.ok(brief.engine_states.length >= 1);

  // Only critical/high in attention items
  brief.attention.items.forEach((item) => {
    assert.ok(item.level === "critical" || item.level === "high");
    assert.ok(item.reasons && item.reasons.length >= 1);
    assert.ok(item.title);
  });

  // De-dup: auction path appears in package risk + engine → one item, merged reasons
  const auctionItems = brief.attention.items.filter((i) =>
    String(i.object_path).includes("Auction/a.md") || String(i.title).includes("김포") || String(i.title).includes("임장")
  );
  assert.ok(auctionItems.length >= 1);
  // at most one item for same path
  const byPath = brief.attention.items.filter((i) => i.object_path === "PARA/PROJECTS/Auction/a.md");
  assert.ok(byPath.length <= 1);
  if (byPath[0]) {
    assert.ok(byPath[0].reasons.length >= 1);
  }

  // Project missing next_action should surface
  assert.ok(
    brief.attention.items.some((i) =>
      String(i.title).includes("운송") || String(i.object_path).includes("need.md")
    )
  );

  // Home risk mapping
  const homeRisks = ctxApi.toHomeRiskItems(brief);
  assert.ok(homeRisks.length >= 1);
  homeRisks.forEach((r) => {
    assert.ok(r.label);
    assert.ok(r.reason);
  });

  // Empty attention
  const emptyBrief = ctxApi.buildMorningBriefContext({
    pkg: { local_date: "2026-07-17", context: { projects: [], auctions: [], reading: [], risks: [], todoist: {} } },
    journalStatus: { status: "complete" }
  });
  assert.equal(emptyBrief.attention.empty, true);
  assert.match(emptyBrief.empty_attention_message, /주의가 필요한 (Object|객체)가 없습니다/);

  // Merge helper unit
  const merged = ctxApi.mergeAttentionItems([
    {
      id: "p",
      title: "A",
      level: "high",
      reasons: ["Due today"],
      object_path: "x.md",
      workspace: "project",
      workspace_label: "Project",
      dashboard_path: "HUB/40 Project.md"
    },
    {
      id: "p2",
      title: "A",
      level: "critical",
      reasons: ["Missing next_action"],
      object_path: "x.md",
      workspace: "project",
      workspace_label: "Project",
      dashboard_path: "HUB/40 Project.md"
    }
  ]);
  assert.equal(merged.length, 1);
  assert.equal(merged[0].level, "critical");
  assert.ok(merged[0].reasons.includes("Due today"));
  assert.ok(merged[0].reasons.includes("Missing next_action"));

  // Fallback: without engine, package risks still usable via helper
  const onlyRisk = ctxApi.attentionFromPackageRisk(pkg.context.risks[0], 0);
  assert.equal(onlyRisk.level, "high");
  assert.ok(onlyRisk.reasons.length);

  // Engine failure degrades: package risks still surface, Home does not require engine
  const engine = load("SYSTEM/Views/object-engine-core.js");
  const originalEval = engine.evaluateObjects;
  const originalSession = engine.createRuntimeSession;
  engine.evaluateObjects = () => { throw new Error("simulated engine failure"); };
  engine.createRuntimeSession = () => {
    throw new Error("simulated engine failure");
  };
  try {
    const failed = ctxApi.buildMorningBriefContext({
      pkg,
      now: new Date("2026-07-17T10:00:00")
    });
    assert.equal(failed.engine_ok, false);
    assert.ok(failed.engine_error);
    assert.ok(failed.attention.items.length >= 1); // package risk remains
    failed.attention.items.forEach((item) => {
      assert.ok(item.reasons && item.reasons.length >= 1);
    });
  } finally {
    engine.evaluateObjects = originalEval;
    engine.createRuntimeSession = originalSession;
  }

  // Launcher + Brief share engine_states (no second evaluate when states provided)
  const launcher = load("SYSTEM/Views/workspace-launcher-core.js");
  let evalCount = 0;
  const countedEval = engine.evaluateObjects;
  engine.evaluateObjects = function () {
    evalCount += 1;
    return countedEval.apply(this, arguments);
  };
  try {
    // Force path that uses evaluateObjects (session may wrap it; also count session evals)
    const originalSession2 = engine.createRuntimeSession;
    engine.createRuntimeSession = function (ctx) {
      const session = originalSession2.call(this, ctx);
      const inner = session.evaluateObjects.bind(session);
      session.evaluateObjects = function (list) {
        evalCount += 1;
        return inner(list);
      };
      return session;
    };
    try {
      const shared = ctxApi.buildMorningBriefContext({
        pkg,
        now: new Date("2026-07-17T10:00:00")
      });
      const afterBrief = evalCount;
      const cards = launcher.buildLauncherCards({
        pkg,
        journalStatus: { status: "empty" },
        engine_states: shared.engine_states
      });
      assert.equal(evalCount, afterBrief); // no additional evaluateObjects
      assert.equal(cards.length, 5);
      assert.ok(cards.some((c) => c.id === "project" || c.id === "auction"));
    } finally {
      engine.createRuntimeSession = originalSession2;
    }
  } finally {
    engine.evaluateObjects = countedEval;
  }

  // Wiring
  assert.match(homeHub, /morning-brief-context\.js/);
  assert.match(homeSource, /MorningBriefContext|buildMorningBriefContext|toHomeRiskItems/);
  assert.match(homeSource, /engine_states|주의가 필요함|Needs Attention|home-needs-attention/);
  assert.match(homeSource, /journalStatusForOps|workoutSnapshotForOps/);
  assert.match(guide, /Morning Brief Context|Morning Package/);
  assert.match(guide, /Object Engine/);

  // Source safety — adapter never mutates Objects
  const src = fs.readFileSync(path.join(ROOT, "SYSTEM/Views/morning-brief-context.js"), "utf8");
  assert.equal(src.includes("processFrontMatter"), false);
  assert.equal(src.includes("vault.modify"), false);

  // No new schema surface in adapter
  assert.equal(src.includes("type: people"), false);

  console.log("Morning brief context tests passed");
}

main();
