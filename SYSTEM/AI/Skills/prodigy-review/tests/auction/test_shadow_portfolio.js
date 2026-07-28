"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "../../../../../..");
const core = require(path.join(ROOT, "SYSTEM/Views/auction-learning-core.js"));

describe("AuctionLearningCore — shadow portfolio membership", () => {
  const records = [
    {
      id: "lost-1",
      path: "PARA/PROJECTS/Auction/lost-1.md",
      auction_outcome: "lost",
      auction_result_date: "2026-05-01",
      winning_bid_price: 300000000,
      region_key: "부산광역시-사하구"
    },
    {
      id: "skipped-1",
      path: "PARA/PROJECTS/Auction/skipped-1.md",
      auction_outcome: "skipped",
      auction_result_date: "2026-04-15",
      winning_bid_price: 250000000,
      region_key: "부산광역시-사하구"
    },
    {
      id: "won-1",
      path: "PARA/PROJECTS/Auction/won-1.md",
      auction_outcome: "won",
      auction_result_date: "2026-03-01",
      winning_bid_price: 400000000,
      region_key: "부산광역시-사하구"
    },
    {
      id: "lost-noprice",
      path: "PARA/PROJECTS/Auction/lost-noprice.md",
      auction_outcome: "lost",
      auction_result_date: "2026-02-01",
      region_key: "부산광역시-사하구"
    },
    {
      id: "watching-1",
      path: "PARA/PROJECTS/Auction/watching-1.md",
      status: "watching",
      region_key: "부산광역시-사하구"
    }
  ];

  it("includes only validated lost|skipped with real winning price", () => {
    const shadow = core.shadowPortfolio(records, { as_of: "2026-07-01" });
    // lost-1 ✓, skipped-1 ✓; won-1 excluded; lost-noprice excluded (no price); watching excluded
    assert.equal(shadow.count, 2);
    const ids = shadow.entries.map(e => e.id);
    assert.ok(ids.includes("lost-1"));
    assert.ok(ids.includes("skipped-1"));
    assert.ok(!ids.includes("won-1"));
    assert.ok(!ids.includes("lost-noprice"));
    assert.ok(!ids.includes("watching-1"));
  });

  it("reports observed missed-opportunity price (no invented valuation)", () => {
    const shadow = core.shadowPortfolio(records, { as_of: "2026-07-01" });
    const lost1 = shadow.entries.find(e => e.id === "lost-1");
    assert.equal(lost1.winning_bid_price, 300000000);
    // No current_valuation or estimated field
    assert.equal(lost1.current_valuation, undefined);
    assert.equal(lost1.estimated_value, undefined);
  });

  it("sorts entries by result_date desc then id code point", () => {
    const shadow = core.shadowPortfolio(records, { as_of: "2026-07-01" });
    // lost-1 (2026-05-01) before skipped-1 (2026-04-15)
    assert.equal(shadow.entries[0].id, "lost-1");
    assert.equal(shadow.entries[1].id, "skipped-1");
  });

  it("excludes skipped without winning price", () => {
    const skippedNoPrice = [
      {
        id: "skipped-np",
        path: "PARA/PROJECTS/Auction/skipped-np.md",
        auction_outcome: "skipped",
        auction_result_date: "2026-05-01",
        region_key: "A"
      }
    ];
    const shadow = core.shadowPortfolio(skippedNoPrice, { as_of: "2026-07-01" });
    assert.equal(shadow.count, 0);
  });

  it("requires valid result date", () => {
    const badDate = [
      {
        id: "bad-date",
        path: "PARA/PROJECTS/Auction/bad-date.md",
        auction_outcome: "lost",
        auction_result_date: "not-a-date",
        winning_bid_price: 100000000,
        region_key: "A"
      }
    ];
    const shadow = core.shadowPortfolio(badDate, { as_of: "2026-07-01" });
    assert.equal(shadow.count, 0);
  });

  it("requires explicit as_of", () => {
    const shadow = core.shadowPortfolio(records, {});
    assert.equal(shadow.count, 0);
    assert.deepEqual(shadow.entries, []);
  });
});

describe("AuctionLearningCore — shadow portfolio count/value denominators", () => {
  it("counts entries and sums total_value from winning prices", () => {
    const records = [
      { id: "a", path: "PARA/PROJECTS/Auction/a.md", auction_outcome: "lost", auction_result_date: "2026-05-01", winning_bid_price: 100000000, region_key: "A" },
      { id: "b", path: "PARA/PROJECTS/Auction/b.md", auction_outcome: "skipped", auction_result_date: "2026-04-01", winning_bid_price: 200000000, region_key: "B" },
      { id: "c", path: "PARA/PROJECTS/Auction/c.md", auction_outcome: "lost", auction_result_date: "2026-03-01", winning_bid_price: 300000000, region_key: "C" }
    ];
    const shadow = core.shadowPortfolio(records, { as_of: "2026-07-01" });
    assert.equal(shadow.count, 3);
    assert.equal(shadow.total_value, 600000000);
  });

  it("empty portfolio has zero count and value", () => {
    const shadow = core.shadowPortfolio([], { as_of: "2026-07-01" });
    assert.equal(shadow.count, 0);
    assert.equal(shadow.total_value, 0);
  });

  it("excludes duplicate-id cases from denominators", () => {
    const records = [
      { id: "dup", path: "PARA/PROJECTS/Auction/dup.md", auction_outcome: "lost", auction_result_date: "2026-05-01", winning_bid_price: 100000000, region_key: "A" },
      { id: "dup", path: "PARA/PROJECTS/Auction/dup2.md", auction_outcome: "lost", auction_result_date: "2026-04-01", winning_bid_price: 200000000, region_key: "A" },
      { id: "solo", path: "PARA/PROJECTS/Auction/solo.md", auction_outcome: "lost", auction_result_date: "2026-03-01", winning_bid_price: 300000000, region_key: "A" }
    ];
    const shadow = core.shadowPortfolio(records, { as_of: "2026-07-01" });
    assert.equal(shadow.count, 1);
    assert.equal(shadow.total_value, 300000000);
  });
});
