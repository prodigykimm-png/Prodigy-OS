"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "../../../../../..");

function load(rel) {
  return require(path.join(ROOT, rel));
}

function main() {
  const core = load("SYSTEM/Views/auction-day-core.js");
  const viewSource = fs.readFileSync(path.join(ROOT, "SYSTEM/Views/auction-day-view.js"), "utf8");
  const hub = fs.readFileSync(path.join(ROOT, "HUB/10 Auction.md"), "utf8");
  const calView = fs.readFileSync(path.join(ROOT, "SYSTEM/Views/bid-calendar-view.js"), "utf8");
  const guide = fs.readFileSync(path.join(ROOT, "SYSTEM/docs/11_Operating_Guide.md"), "utf8");
  const template = fs.readFileSync(path.join(ROOT, "SYSTEM/TEMPLATE/FORMAT/template_auction_case.md"), "utf8");
  const registry = fs.readFileSync(path.join(ROOT, "SYSTEM/Views/display-registry.js"), "utf8");

  const pages = [
    {
      type: "auction_case",
      status: "bidding",
      case_number: "2025타경1144",
      court: "인천지방법원",
      file: { path: "PARA/PROJECTS/Auction/a.md", name: "a.md" },
      auction_datetime: "2026-07-21 10:00",
      minimum_bid: 100000000,
      expected_bid: 143000000,
      bid_deposit: 10000000,
      my_bid_price: "",
      address: "인천시 남동구, 테스트아파트"
    },
    {
      type: "auction_case",
      status: "bidding",
      case_number: "2025타경1201",
      court: "인천지방법원",
      path: "PARA/PROJECTS/Auction/b.md",
      auction_datetime: "2026-07-21",
      minimum_bid: 90000000,
      expected_bid: 120000000,
      bid_deposit: ""
    },
    {
      type: "auction_case",
      status: "bidding",
      case_number: "2025타경893",
      court: "수원지방법원",
      path: "PARA/PROJECTS/Auction/c.md",
      auction_datetime: "2026-07-21",
      expected_bid: 200000000
    },
    {
      type: "auction_case",
      status: "bidding",
      case_number: "other-day",
      court: "서울중앙지방법원",
      path: "PARA/PROJECTS/Auction/d.md",
      auction_datetime: "2026-07-22"
    },
    {
      type: "auction_case",
      status: "won",
      case_number: "already-won",
      court: "인천지방법원",
      path: "PARA/PROJECTS/Auction/e.md",
      auction_datetime: "2026-07-21"
    },
    {
      type: "auction_case",
      status: "watching",
      case_number: "still-watching",
      court: "수원지방법원",
      path: "PARA/PROJECTS/Auction/f.md",
      auction_datetime: "2026-07-21"
    }
  ];

  // Collect only target day + bidding status
  const day = core.collectDayAuctions(pages, "2026-07-21");
  assert.equal(day.length, 3);
  assert.ok(day.every((x) => x.status === "bidding"));
  assert.equal(day.some((x) => x.case_number === "other-day"), false);
  assert.equal(day.some((x) => x.case_number === "already-won"), false);
  assert.equal(day.some((x) => x.case_number === "still-watching"), false);

  // Court grouping
  const courts = core.groupByCourt(day);
  assert.equal(courts.length, 2);
  assert.equal(courts[0].court, "수원지방법원");
  assert.equal(courts[1].court, "인천지방법원");
  assert.equal(courts[1].count, 2);

  // Shared court prep checklist (temporary state, not object properties)
  let state = core.emptyDayState("2026-07-21");
  state = core.setCourtPrepItem(state, "인천지방법원", "identification", true);
  state = core.setCourtPrepItem(state, "인천지방법원", "seal", true);
  const prep = core.getCourtPrep(state, "인천지방법원");
  assert.equal(prep.identification, true);
  assert.equal(prep.seal, true);
  assert.equal(prep.deposit, false);
  // Second court starts empty (shared template, independent values)
  const prepSuwon = core.getCourtPrep(state, "수원지방법원");
  assert.equal(prepSuwon.identification, false);

  // Per-auction execution checks
  state = core.setAuctionCheckItem(state, "PARA/PROJECTS/Auction/a.md", "case_checked", true);
  const checks = core.getAuctionChecks(state, "PARA/PROJECTS/Auction/a.md");
  assert.equal(checks.case_checked, true);
  assert.equal(checks.final_bid_checked, false);

  // Decision kinds from existing status only
  assert.equal(core.decisionKind({ status: "bidding" }), "pending");
  assert.equal(core.decisionKind({ status: "bidding", my_bid_price: 140000000 }), "bid");
  assert.equal(core.decisionKind({ status: "skipped" }), "skip");

  // Outcomes limited to existing lifecycle statuses
  assert.deepEqual(core.RESULT_OUTCOMES.slice(), ["won", "lost", "skipped"]);
  assert.equal(core.isValidOutcome("won"), true);
  assert.equal(core.isValidOutcome("cancelled"), false);
  assert.equal(core.isValidOutcome("bidding"), false);

  // Final bid write uses my_bid_price only (mock processFrontMatter)
  const fmWrites = [];
  const mockApp = {
    vault: {
      getAbstractFileByPath: (p) => (p.endsWith(".md") ? { path: p } : null),
      read: async () => "---\nstatus: bidding\n---\n# Investment Decision\n\n---\n",
      modify: async () => {},
      create: async () => {},
      createFolder: async () => {}
    },
    fileManager: {
      processFrontMatter: async (file, fn) => {
        const fm = { status: "bidding", expected_bid: 143000000 };
        fn(fm);
        fmWrites.push(Object.assign({ path: file.path }, fm));
      }
    }
  };

  return Promise.resolve()
    .then(() => core.saveFinalBid(mockApp, "PARA/PROJECTS/Auction/a.md", "145000000"))
    .then((value) => {
      assert.equal(value, 145000000);
      assert.equal(fmWrites[0].my_bid_price, 145000000);
      assert.equal(fmWrites[0].expected_bid, 143000000); // never overwrite expected
    })
    .then(() => core.recordResult(mockApp, "PARA/PROJECTS/Auction/a.md", {
      outcome: "lost",
      finalBid: "145000000",
      winningPrice: "150000000",
      bidderCount: "7",
      memo: "경쟁 과열"
    }))
    .then((result) => {
      assert.equal(result.status, "lost");
      const last = fmWrites[fmWrites.length - 1];
      assert.equal(last.status, "lost");
      assert.equal(last.my_bid_price, 145000000);
      assert.equal(last.winning_bid_price, 150000000);
      assert.match(String(last.decision_reason), /경쟁 과열/);
      assert.match(String(last.decision_reason), /응찰 7명/);
    })
    .then(() => {
      // Empty model
      const empty = core.buildDayModel([], "2026-07-21");
      assert.equal(empty.total, 0);
      assert.equal(empty.courts.length, 0);

      // Review queue (post-result)
      const reviewPages = [
        { type: "auction_case", status: "won", path: "PARA/PROJECTS/Auction/w.md", case_number: "W-1", auction_datetime: "2026-07-20" },
        { type: "auction_case", status: "reviewing", path: "PARA/PROJECTS/Auction/r.md", case_number: "R-1", auction_datetime: "2026-07-19" },
        { type: "auction_case", status: "skipped", path: "PARA/PROJECTS/Auction/s.md", case_number: "S-1", auction_datetime: "2026-07-18" },
        { type: "auction_case", status: "bidding", path: "PARA/PROJECTS/Auction/b.md", case_number: "B-1", auction_datetime: "2026-07-21" },
        { type: "auction_case", status: "archived", path: "PARA/PROJECTS/Auction/a.md", case_number: "A-1" }
      ];
      const queue = core.buildReviewQueue(reviewPages);
      assert.equal(queue.length, 3);
      assert.equal(queue[0].stage, "pending_review");
      assert.equal(queue[0].status, "won");
      assert.ok(queue[0].reason);
      assert.equal(queue[0].next_status, "reviewing");
      assert.ok(queue.some((q) => q.stage === "in_progress"));
      assert.ok(queue.some((q) => q.stage === "pending_close"));
      assert.equal(queue.some((q) => q.status === "bidding"), false);
      assert.equal(queue.some((q) => q.status === "archived"), false);

      // View contracts
      assert.match(viewSource, /오늘 예정된 입찰이 없습니다/);
      assert.match(viewSource, /Preparation|법원|입찰가 확정|결과 기록|물건 열기/);
      assert.match(viewSource, /openForAuction|focusPath|is-focus|복기 시작/);
      assert.match(viewSource, /min-height:\s*40px/);
      assert.match(viewSource, /openLinkText/);
      assert.equal(viewSource.includes("processFrontMatter") || viewSource.includes("saveFinalBid") || viewSource.includes("recordResult"), true);
      assert.match(hub, /복기 대기|buildReviewQueue/);
      const cardSrc = fs.readFileSync(path.join(ROOT, "SYSTEM/Views/auction-card.js"), "utf8");
      assert.match(cardSrc, /입찰 실행|openForAuction/);

      // Hub loads scripts; entry is via Bid Calendar only
      assert.match(hub, /auction-day-core\.js/);
      assert.match(hub, /auction-day-view\.js/);
      assert.equal(hub.includes("오늘 입찰 실행"), false);
      assert.match(calView, /입찰 실행|AuctionDayView|openPanel/);

      // Operating Guide
      assert.match(guide, /Auction Day Runner/);
      assert.match(guide, /Bid Calendar/);
      assert.match(guide, /Auction Result/);

      // No property/template/display architecture changes for this feature
      assert.match(template, /my_bid_price:/);
      assert.match(template, /winning_bid_price:/);
      assert.equal(template.includes("auction_day_"), false);
      assert.equal(registry.includes("auction_day_outcome"), false);

      // Court prep item ids are execution-only (not top-level auction properties)
      core.COURT_PREP_ITEMS.forEach((item) => {
        const propLine = new RegExp(`^${item.id}:`, "m");
        assert.equal(propLine.test(template), false, `unexpected property ${item.id}`);
      });

      console.log("Auction day runner tests passed");
    });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
