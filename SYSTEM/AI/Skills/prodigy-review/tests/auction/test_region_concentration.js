"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "../../../../../..");
const core = require(path.join(ROOT, "SYSTEM/Views/auction-learning-core.js"));

describe("AuctionLearningCore — concentration snapshot", () => {
  it("won enters acquired at winning_bid_price", () => {
    const records = [
      { id: "w1", path: "PARA/PROJECTS/Auction/w1.md", auction_outcome: "won", winning_bid_price: 300000000, region_key: "A", status: "archived" },
      { id: "w2", path: "PARA/PROJECTS/Auction/w2.md", auction_outcome: "won", winning_bid_price: 200000000, region_key: "B", status: "archived" },
      { id: "w3", path: "PARA/PROJECTS/Auction/w3.md", auction_outcome: "won", winning_bid_price: 100000000, region_key: "C", status: "archived" }
    ];
    const result = core.concentration(records);
    assert.equal(result.total_count, 3);
    assert.equal(result.total_value, 600000000);
    const regionA = result.regions.find(r => r.region_key === "A");
    assert.equal(regionA.count, 1);
    assert.equal(regionA.value, 300000000);
  });

  it("lost/skipped excluded from concentration", () => {
    const records = [
      { id: "w1", path: "PARA/PROJECTS/Auction/w1.md", auction_outcome: "won", winning_bid_price: 300000000, region_key: "A", status: "archived" },
      { id: "l1", path: "PARA/PROJECTS/Auction/l1.md", auction_outcome: "lost", winning_bid_price: 200000000, region_key: "A", status: "archived" },
      { id: "s1", path: "PARA/PROJECTS/Auction/s1.md", auction_outcome: "skipped", region_key: "A", status: "archived" }
    ];
    const result = core.concentration(records);
    assert.equal(result.total_count, 1);
    assert.equal(result.total_value, 300000000);
  });

  it("outcome-less watching/bidding enters active with value priority", () => {
    const records = [
      { id: "a1", path: "PARA/PROJECTS/Auction/a1.md", status: "watching", region_key: "A", my_bid_price: 150000000, expected_bid: 140000000, minimum_bid: 100000000 },
      { id: "a2", path: "PARA/PROJECTS/Auction/a2.md", status: "bidding", region_key: "B", expected_bid: 200000000, minimum_bid: 180000000 },
      { id: "a3", path: "PARA/PROJECTS/Auction/a3.md", status: "watching", region_key: "C", minimum_bid: 120000000 }
    ];
    const result = core.concentration(records);
    assert.equal(result.total_count, 3);
    // a1: my_bid_price first = 150M
    const regionA = result.regions.find(r => r.region_key === "A");
    assert.equal(regionA.value, 150000000);
    // a2: no my_bid, expected_bid = 200M
    const regionB = result.regions.find(r => r.region_key === "B");
    assert.equal(regionB.value, 200000000);
    // a3: only minimum_bid = 120M
    const regionC = result.regions.find(r => r.region_key === "C");
    assert.equal(regionC.value, 120000000);
  });

  it("active case without value still counts in count denominator", () => {
    const records = [
      { id: "a1", path: "PARA/PROJECTS/Auction/a1.md", status: "watching", region_key: "A" },
      { id: "a2", path: "PARA/PROJECTS/Auction/a2.md", status: "watching", region_key: "B", minimum_bid: 100000000 },
      { id: "a3", path: "PARA/PROJECTS/Auction/a3.md", status: "bidding", region_key: "C", expected_bid: 200000000 }
    ];
    const result = core.concentration(records);
    assert.equal(result.total_count, 3);
    // a1 has no value → not in value denominator
    assert.equal(result.total_value_eligible, 2);
    assert.equal(result.total_value, 300000000);
  });

  it("count/value shares computed independently by exact region", () => {
    const records = [
      { id: "a1", path: "PARA/PROJECTS/Auction/a1.md", auction_outcome: "won", winning_bid_price: 500000000, region_key: "A", status: "archived" },
      { id: "a2", path: "PARA/PROJECTS/Auction/a2.md", status: "watching", region_key: "B", minimum_bid: 100000000 },
      { id: "a3", path: "PARA/PROJECTS/Auction/a3.md", status: "bidding", region_key: "C", expected_bid: 100000000 }
    ];
    const result = core.concentration(records);
    const regionA = result.regions.find(r => r.region_key === "A");
    // Count share: 1/3
    assert.ok(Math.abs(regionA.count_share - 1 / 3) < 0.0001);
    // Value share: 500M / 700M
    assert.ok(Math.abs(regionA.value_share - 500000000 / 700000000) < 0.0001);
  });
});

describe("AuctionLearningCore — concentration warnings", () => {
  it("warns when count ≥ 3 and count share ≥ 0.50", () => {
    const records = [
      { id: "a1", path: "PARA/PROJECTS/Auction/a1.md", auction_outcome: "won", winning_bid_price: 100000000, region_key: "A", status: "archived" },
      { id: "a2", path: "PARA/PROJECTS/Auction/a2.md", auction_outcome: "won", winning_bid_price: 100000000, region_key: "A", status: "archived" },
      { id: "a3", path: "PARA/PROJECTS/Auction/a3.md", status: "watching", region_key: "B", minimum_bid: 100000000 }
    ];
    const result = core.concentration(records);
    assert.equal(result.total_count, 3);
    // A has 2/3 = 0.667 ≥ 0.50
    assert.ok(result.count_warnings.includes("A"));
    assert.ok(!result.count_warnings.includes("B"));
  });

  it("warns by value when value-eligible ≥ 3, total > 0, share ≥ 0.50", () => {
    const records = [
      { id: "a1", path: "PARA/PROJECTS/Auction/a1.md", auction_outcome: "won", winning_bid_price: 600000000, region_key: "A", status: "archived" },
      { id: "a2", path: "PARA/PROJECTS/Auction/a2.md", status: "watching", region_key: "B", minimum_bid: 100000000 },
      { id: "a3", path: "PARA/PROJECTS/Auction/a3.md", status: "bidding", region_key: "C", expected_bid: 100000000 }
    ];
    const result = core.concentration(records);
    assert.equal(result.total_value_eligible, 3);
    // A: 600M / 800M = 0.75 ≥ 0.50
    assert.ok(result.value_warnings.includes("A"));
  });

  it("no value warning when value-eligible < 3", () => {
    const records = [
      { id: "a1", path: "PARA/PROJECTS/Auction/a1.md", auction_outcome: "won", winning_bid_price: 600000000, region_key: "A", status: "archived" },
      { id: "a2", path: "PARA/PROJECTS/Auction/a2.md", status: "watching", region_key: "B" }
    ];
    const result = core.concentration(records);
    assert.equal(result.total_value_eligible, 1);
    assert.equal(result.value_warnings.length, 0);
    assert.equal(result.value_label, "표본 부족");
  });
});

describe("AuctionLearningCore — concentration ties and 표본 부족", () => {
  it("emits every tied region sorted by region_key code point", () => {
    const records = [
      { id: "a1", path: "PARA/PROJECTS/Auction/a1.md", auction_outcome: "won", winning_bid_price: 100000000, region_key: "B-region", status: "archived" },
      { id: "a2", path: "PARA/PROJECTS/Auction/a2.md", auction_outcome: "won", winning_bid_price: 100000000, region_key: "A-region", status: "archived" },
      { id: "a3", path: "PARA/PROJECTS/Auction/a3.md", status: "watching", region_key: "C-region", minimum_bid: 100000000 }
    ];
    const result = core.concentration(records);
    // All regions sorted by code point
    assert.equal(result.regions[0].region_key, "A-region");
    assert.equal(result.regions[1].region_key, "B-region");
    assert.equal(result.regions[2].region_key, "C-region");
    // Count shares: each 1/3 < 0.50 → no count warnings
    assert.equal(result.count_warnings.length, 0);
  });

  it("shows 표본 부족 when count < 3", () => {
    const records = [
      { id: "a1", path: "PARA/PROJECTS/Auction/a1.md", auction_outcome: "won", winning_bid_price: 100000000, region_key: "A", status: "archived" },
      { id: "a2", path: "PARA/PROJECTS/Auction/a2.md", status: "watching", region_key: "B", minimum_bid: 100000000 }
    ];
    const result = core.concentration(records);
    assert.equal(result.total_count, 2);
    assert.equal(result.count_available, false);
    assert.equal(result.count_label, "표본 부족");
  });

  it("shows 표본 부족 for value when total value is zero", () => {
    const records = [
      { id: "a1", path: "PARA/PROJECTS/Auction/a1.md", status: "watching", region_key: "A" },
      { id: "a2", path: "PARA/PROJECTS/Auction/a2.md", status: "watching", region_key: "B" },
      { id: "a3", path: "PARA/PROJECTS/Auction/a3.md", status: "bidding", region_key: "C" }
    ];
    const result = core.concentration(records);
    assert.equal(result.total_count, 3);
    assert.equal(result.total_value, 0);
    assert.equal(result.value_available, false);
    assert.equal(result.value_label, "표본 부족");
  });

  it("excludes duplicate-id cases from concentration", () => {
    const records = [
      { id: "dup", path: "PARA/PROJECTS/Auction/dup.md", auction_outcome: "won", winning_bid_price: 100000000, region_key: "A", status: "archived" },
      { id: "dup", path: "PARA/PROJECTS/Auction/dup2.md", auction_outcome: "won", winning_bid_price: 200000000, region_key: "A", status: "archived" },
      { id: "solo", path: "PARA/PROJECTS/Auction/solo.md", auction_outcome: "won", winning_bid_price: 300000000, region_key: "B", status: "archived" }
    ];
    const result = core.concentration(records);
    assert.equal(result.total_count, 1);
    assert.equal(result.total_value, 300000000);
  });

  it("excludes reviewing/archived without outcome from active", () => {
    const records = [
      { id: "r1", path: "PARA/PROJECTS/Auction/r1.md", status: "reviewing", region_key: "A", minimum_bid: 100000000 },
      { id: "r2", path: "PARA/PROJECTS/Auction/r2.md", status: "archived", region_key: "B", minimum_bid: 100000000 }
    ];
    const result = core.concentration(records);
    assert.equal(result.total_count, 0);
  });
});
