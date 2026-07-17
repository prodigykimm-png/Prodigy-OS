"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "../../../../../..");

function load(modulePath) {
  return require(path.join(ROOT, modulePath));
}

function main() {
  const morning = load("SYSTEM/Views/morning-context-core.js");
  const homeSource = fs.readFileSync(path.join(ROOT, "SYSTEM/Views/home-view.js"), "utf8");
  const homeHub = fs.readFileSync(path.join(ROOT, "HUB/00 Home.md"), "utf8");

  assert.equal(morning.resolveRecommendLevel({ recommend_level: "강추", recommendation: "보통" }), "강추");
  assert.equal(morning.resolveRecommendLevel({ recommendation: "보통" }), "보통");

  const rule = morning.generateDeterministicFallback({
    local_date: "2026-07-17",
    warnings: ["Todoist fetch failed: network"],
    context: {
      todoist: { overdueCount: 0, todayCount: 0 },
      auctions: [{
        name: "테스트경매",
        status: "bidding",
        auction_datetime: "2026-07-20",
        path: "PARA/PROJECTS/Auction/test.md",
        next_action: ""
      }],
      projects: [],
      reading: [{ name: "책", status: "reading", path: "PARA/PROJECTS/Reading/book.md" }],
      review_inbox: [],
      yesterday_review: {
        date: "2026-07-16",
        path: "DAILY/DAILY/2026-07-16.md",
        found: true,
        meaningful: true,
        missing: false,
        learning: "집중 시간을 보호했다",
        change: "집중 시간을 보호했다",
        next_experiment: "오전에 가장 중요한 일 먼저"
      }
    }
  });

  assert.match(rule.brief, /규칙 기반/);
  assert.match(rule.brief, /어제 배움|오늘 실험|이어갑니다/);
  assert.equal(rule.brief.includes("Fallback"), false);
  assert.equal(rule.brief.includes("실패"), false);

  const useful = morning.selectUsefulYesterdayReview({
    date: "2026-07-16",
    path: "DAILY/DAILY/2026-07-16.md",
    reflection: "긴 성찰 본문은 변화 필드가 없을 때만 쓴다",
    change: "핵심 변화",
    next_experiment: "다음 실험"
  });
  assert.equal(useful.learning, "핵심 변화");
  assert.equal(useful.meaningful, true);
  assert.equal(useful.missing, false);

  const emptyY = morning.selectUsefulYesterdayReview({
    date: "2026-07-16",
    path: "x",
    reflection: "",
    change: "",
    next_experiment: ""
  });
  assert.equal(emptyY.missing, true);
  assert.equal(emptyY.meaningful, false);
  assert.ok(Array.isArray(rule.focus));
  assert.ok(rule.focus.length >= 1);
  assert.ok(rule.focus.length <= 3);
  assert.equal(rule.brief_mode, "rule_based");
  assert.ok(rule.attention.some((item) => /실행 연동 제한|Todoist/.test(item.reason + item.label)));

  const yFields = morning.extractDailyReviewFields(`---
change: frontmatter 변화
next_experiment: frontmatter 실험
---
# day
## 성찰 (Reflection)
본문 성찰
`);
  assert.equal(yFields.change, "frontmatter 변화");
  assert.equal(yFields.next_experiment, "frontmatter 실험");
  assert.equal(yFields.reflection, "본문 성찰");

  assert.match(homeSource, /외부 failures must never block Home|external failures must never block Home/i);
  // Mission Control surfaces (Korean product labels)
  assert.match(homeSource, /지금 무엇에 집중할까|home-mc-stack|Mission Control/);
  assert.match(homeSource, /오늘의 집중|제안 Focus 승인/);
  assert.match(homeSource, /이어할 항목이 없습니다|오늘은 새 출발|이어하기/);
  assert.match(homeSource, /주의가 필요함|home-needs-attention|오늘은 주의할 Object가 없습니다/);
  assert.match(homeSource, /빠른 실행|새 Object|오늘 Daily|검색/);
  assert.match(homeSource, /Todoist 열기|Todoist/);
  assert.match(homeSource, /시스템 상태|Object Engine|Review Queue/);
  assert.match(homeSource, /2분 (Review|성찰)/);
  assert.match(homeSource, /engine_states|buildMorningBriefContext/);
  assert.match(homeSource, /safeRenderRegion/);
  assert.match(homeSource, /selectFocusItems/);
  assert.match(homeSource, /sanitizeFocusList|pathExists/);
  assert.match(homeSource, /Live vault context is always preferred/);
  assert.match(homeSource, /어제 배움|yesterday_review/);
  assert.match(homeSource, /어제 (Reflection|성찰)이 비어|home-yesterday-missing|yMissing/);
  assert.match(homeSource, /focusHints/);
  assert.match(homeSource, /home-compact|isCompactHome|home-secondary-fold/);
  assert.match(homeSource, /home-lifecycle-fold|객체 라이프사이클 · 접힘|Object Lifecycle · 접힘/);
  assert.match(homeSource, /approved only|제안 Focus 승인|선택된 집중이 없습니다/);
  assert.match(homeHub, /journal-core\.js/);
  assert.match(homeHub, /journal-view\.js/);

  const journalView = fs.readFileSync(path.join(ROOT, "SYSTEM/Views/journal-view.js"), "utf8");
  assert.match(journalView, /focusHints/);
  assert.match(journalView, /오늘 Focus를 마쳤나요/);

  // Focus selection priority: pinned > due today > priority > rule order
  const selected = morning.selectFocusItems({
    localDate: "2026-07-17",
    pinnedFocus: {
      focus: {
        id: "pin1",
        label: "고정 항목",
        source_type: "project",
        urgency: "low"
      }
    },
    focusItems: [
      { id: "b", label: "낮은 우선순위", source_type: "project", object_path: "p-low", urgency: "low" },
      { id: "a", label: "오늘 마감", source_type: "project", object_path: "p-due", urgency: "medium" },
      { id: "c", label: "규칙 기본", source_type: "health", urgency: "high" }
    ],
    pkg: {
      context: {
        projects: [
          { path: "p-due", due_date: "2026-07-17", priority: 4 },
          { path: "p-low", due_date: "2026-08-01", priority: 1 }
        ]
      }
    }
  });
  assert.equal(selected[0].id, "pin1");
  assert.equal(selected[0].pinned, true);
  assert.equal(selected[1].id, "a");
  assert.ok(selected.length <= 3);

  console.log("Daily loop home tests passed");
}

main();
