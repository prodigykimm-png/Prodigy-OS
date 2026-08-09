"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");

  const ROOT = path.resolve(__dirname, "../../../../../..");

function load(modulePath) {
  return require(path.join(ROOT, modulePath));
}

async function main() {
  const morning = load("SYSTEM/Views/morning-context-core.js");
  const journal = load("SYSTEM/Views/journal-core.js");

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

  const previousJournalCore = global.JournalCore;
  try {
    global.JournalCore = journal;
    const evidenceFields = morning.extractDailyReviewFields(`---
type: journal
date: 2026-08-02
change: -
next_experiment: -
---
# 2026-08-02
## Evidence
### e01 · 촬영 기록
<!-- evidence_id: daily-2026-08-02-e01 -->
Experience:
촬영 피드백을 정리했다.
Change:
촬영 전 침착함을 확인한다.
Next Experiment:
촬영 전 체크리스트를 읽는다.
`);
    assert.equal(evidenceFields.change, "촬영 전 침착함을 확인한다.");
    assert.equal(evidenceFields.next_experiment, "촬영 전 체크리스트를 읽는다.");
  } finally {
    if (previousJournalCore === undefined) delete global.JournalCore;
    else global.JournalCore = previousJournalCore;
  }

  const previousMorningCore = global.MorningContextCore;
  const previousBriefService = global.MorningBriefService;
  const homePath = path.join(ROOT, "SYSTEM/Views/home-view.js");
  try {
    global.MorningContextCore = morning;
    global.MorningBriefService = {
      generateMorningResult: async () => { throw new Error("network unavailable"); }
    };
    delete require.cache[require.resolve(homePath)];
    const home = require(homePath);
    const recovered = await home.generateMorningBrief({ app: {}, morningPackage: {
      local_date: "2026-07-17",
      warnings: ["Todoist fetch failed: network"],
      context: { todoist: { overdueCount: 0, todayCount: 0 }, auctions: [], projects: [], reading: [], review_inbox: [] }
    } });
    assert.equal(recovered.brief_mode, "rule_based", "Home keeps the daily loop usable when its provider fails");
    assert.match(recovered.brief, /규칙 기반/);
    assert.equal(home.getSourceTypeLabel("project"), "프로젝트");
    assert.equal(home.getEvidenceSourceLabel("Daily Reflection"), "최근 성찰");
  } finally {
    delete require.cache[require.resolve(homePath)];
    if (previousMorningCore === undefined) delete global.MorningContextCore;
    else global.MorningContextCore = previousMorningCore;
    if (previousBriefService === undefined) delete global.MorningBriefService;
    else global.MorningBriefService = previousBriefService;
  }
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

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});
