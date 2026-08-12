"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "../../../../../..");

function load(rel) {
  return require(path.join(ROOT, rel));
}

function main() {
  const core = load("SYSTEM/Views/bid-calendar-core.js");
  const viewSource = fs.readFileSync(path.join(ROOT, "SYSTEM/Views/bid-calendar-view.js"), "utf8");
  const hub = require(path.join(ROOT, "SYSTEM/AI/Skills/prodigy-review/tests/shared/fixtures/workspace-manifest-v1.json")).entries.auction.required.join("\n") + "\n" + fs.readFileSync(path.join(ROOT, "HUB/10 Auction.md"), "utf8");
  const guide = fs.readFileSync(path.join(ROOT, "SYSTEM/docs/11_Operating_Guide.md"), "utf8");
  const template = fs.readFileSync(path.join(ROOT, "SYSTEM/TEMPLATE/FORMAT/template_auction_case.md"), "utf8");
  const registry = fs.readFileSync(path.join(ROOT, "SYSTEM/Views/display-registry.js"), "utf8");

  // --- Date parsing: date only, optional real time, never invent ---
  assert.equal(core.toIsoDate("2026-07-21 10:30"), "2026-07-21");
  assert.equal(core.toIsoDate("2026-07-21"), "2026-07-21");
  assert.equal(core.toTimePart("2026-07-21 10:30"), "10:30");
  assert.equal(core.toTimePart("2026-07-21"), "");
  assert.equal(core.toTimePart(""), "");
  assert.equal(core.toIsoDate(""), "");

  // --- Collect events from existing properties only ---
  const pages = [
    {
      type: "auction_case",
      status: "bidding",
      case_number: "2025타경1144",
      court: "인천지방법원",
      path: "PARA/PROJECTS/Auction/인천-2025타경1144.md",
      auction_datetime: "2026-07-21 10:00",
      site_visit_date: "2026-07-18",
      review_date: "",
      expected_bid: 150000000
    },
    {
      type: "auction_case",
      status: "bidding",
      case_number: "2025타경1201",
      court: "인천지방법원",
      file: { path: "PARA/PROJECTS/Auction/인천-2025타경1201.md", name: "인천-2025타경1201.md" },
      auction_datetime: "2026-07-21",
      site_visit_date: "",
      review_date: "",
      expected_bid: ""
    },
    {
      type: "auction_case",
      status: "reviewing",
      case_number: "2025타경893",
      court: "수원지방법원",
      path: "PARA/PROJECTS/Auction/수원-2025타경893.md",
      auction_datetime: "2026-07-10",
      site_visit_date: "2026-07-05",
      review_date: "2026-07-22",
      expected_bid: "2.1억"
    },
    {
      type: "auction_case",
      status: "watching",
      case_number: "no-dates",
      court: "서울중앙지방법원",
      path: "PARA/PROJECTS/Auction/none.md",
      auction_datetime: "",
      site_visit_date: "",
      review_date: ""
    }
  ];

  const events = core.collectEvents(pages);
  // bidding only: 1144 bid+site_visit, 1201 bid → 3 (reviewing/watching excluded)
  assert.equal(events.length, 3);
  assert.ok(events.every((e) => e.status === "bidding"));
  assert.ok(events.every((e) => ["bid", "site_visit", "review"].includes(e.type)));
  assert.ok(events.every((e) => e.date && /^\d{4}-\d{2}-\d{2}$/.test(e.date)));
  // Object without dates / non-bidding contributes nothing
  assert.equal(events.filter((e) => e.title === "no-dates").length, 0);
  assert.equal(events.filter((e) => e.title === "2025타경893").length, 0);

  // Multiple events on same date (2026-07-21: two bids)
  const dayEvents = core.eventsForDate(events, "2026-07-21");
  assert.ok(dayEvents.length >= 2);
  assert.ok(dayEvents.every((e) => e.type === "bid"));
  const todayBids = core.todayBidEvents(events, new Date("2026-07-21T12:00:00"));
  assert.equal(todayBids.length, 2);
  assert.ok(todayBids.every((e) => e.type === "bid" && e.status === "bidding"));
  assert.equal(core.todayBidEvents(events, new Date("2026-07-22T12:00:00")).length, 0);

  // Court grouping primary strategy
  const courts = core.groupByCourt(dayEvents);
  assert.equal(courts.length, 1);
  assert.equal(courts[0].court, "인천지방법원");
  assert.equal(courts[0].events.length, 2);

  // Month grid counts only numbers (no titles in cells)
  const grid = core.buildMonthGrid(2026, 6, events); // July = monthIndex 6
  const cell21 = grid.find((c) => c.date === "2026-07-21");
  assert.ok(cell21);
  assert.ok(cell21.count >= 2);
  assert.equal(Object.prototype.hasOwnProperty.call(cell21, "title"), false);

  // Weekly agenda: only events in selected week range
  const week = core.weekRange(new Date("2026-07-20T12:00:00"));
  assert.equal(week.start, "2026-07-20");
  assert.equal(week.end, "2026-07-26");
  const weekAgenda = core.buildAgenda(events, week.start, week.end);
  assert.ok(weekAgenda.total >= 1);
  assert.ok(weekAgenda.days.every((d) => d.date >= week.start && d.date <= week.end));
  // 2026-07-05 site visit is outside this week
  assert.equal(weekAgenda.days.some((d) => d.date === "2026-07-05"), false);

  // Monthly agenda for July (bidding only)
  const month = core.monthRange(2026, 6);
  const monthAgenda = core.buildAgenda(events, month.start, month.end);
  assert.equal(monthAgenda.total, 3);
  const julyCourts = monthAgenda.days.flatMap((d) => d.courts.map((c) => c.court));
  assert.ok(julyCourts.includes("인천지방법원"));
  assert.equal(julyCourts.includes("수원지방법원"), false);

  // Empty state data
  const emptyAgenda = core.buildAgenda([], "2026-07-01", "2026-07-31");
  assert.equal(emptyAgenda.total, 0);
  assert.equal(emptyAgenda.days.length, 0);

  // Missing optional fields still produce navigable events
  const missingOptional = dayEvents.find((e) => e.title === "2025타경1201");
  assert.ok(missingOptional);
  assert.equal(missingOptional.expected_bid, "");
  assert.equal(missingOptional.time, "");
  assert.ok(missingOptional.object_path.includes("2025타경1201"));

  // Navigation fields present
  assert.ok(events.every((e) => e.object_path || e.path));
  // Source page kept for Auction Card reuse
  assert.ok(events.every((e) => e.page));

  // View: empty copy + open object only (no edit)
  assert.match(viewSource, /예정된 입찰 일정이 없습니다/);
  assert.match(viewSource, /물건 열기/);
  assert.match(viewSource, /openLinkText/);
  assert.equal(viewSource.includes("processFrontMatter"), false);
  assert.equal(viewSource.includes("vault.modify"), false);
  assert.match(viewSource, /prodigyDisplay/);
  assert.match(viewSource, /min-height:\s*44px|min-height: 44px/);
  assert.match(viewSource, /agendaExpanded|is-collapsed|prodigy-bid-cal-agenda-toggle/);
  assert.match(viewSource, /max-height:\s*none/);
  assert.equal(/events\.slice\(0,\s*6\)/.test(viewSource), false);
  // Date popup reuses the real Auction Card renderer
  assert.match(viewSource, /renderAuctionCard/);
  assert.match(viewSource, /renderEventCard|prodigy-bid-cal-card-host/);
  assert.match(viewSource, /오늘 입찰 목록/);
  assert.match(viewSource, /todayBidEvents/);
  assert.match(viewSource, /오늘 예정된 입찰이 없습니다/);
  assert.equal(viewSource.includes("이 날 입찰 실행"), false);

  // Hub wiring
  assert.match(hub, /bid-calendar-core\.js/);
  assert.match(hub, /bid-calendar-view\.js/);
  assert.match(hub, /입찰 일정/);
  assert.match(hub, /BidCalendarView\.render/);

  // Operating Guide only (no new doc files required by this test)
  assert.match(guide, /Auction Bid Calendar/);
  assert.match(guide, /Time Navigation/);
  assert.match(guide, /Date Detail Popup/);
  assert.match(guide, /Agenda View/);
  assert.match(guide, /오늘 입찰 목록/);

  // No Property / template / Display Registry architecture changes
  assert.match(template, /auction_datetime:/);
  assert.match(template, /site_visit_date:/);
  assert.match(template, /review_date:/);
  // New property names must not appear
  assert.equal(template.includes("bid_calendar"), false);
  assert.equal(registry.includes("bid_calendar_event"), false);

  // Only three event types
  assert.deepEqual(
    core.EVENT_SPECS.map((s) => s.type),
    ["bid", "site_visit", "review"]
  );

  console.log("Bid calendar tests passed");
}

main();
