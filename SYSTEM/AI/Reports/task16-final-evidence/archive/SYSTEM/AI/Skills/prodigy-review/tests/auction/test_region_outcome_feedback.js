"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "../../../../../..");
const core = require(path.join(ROOT, "SYSTEM/Views/auction-learning-core.js"));

describe("AuctionLearningCore — outcome validation", () => {
  it("accepts won with positive winning_bid_price and valid date", () => {
    const result = core.validateOutcome({
      auction_outcome: "won",
      auction_result_date: "2026-03-15",
      winning_bid_price: 250000000,
      auction_datetime: "2026-03-15 10:00"
    }, { as_of: "2026-07-01" });
    assert.equal(result.valid, true);
    assert.equal(result.outcome, "won");
    assert.equal(result.result_date, "2026-03-15");
    assert.equal(result.winning_bid_price, 250000000);
  });

  it("accepts lost with positive winning_bid_price", () => {
    const result = core.validateOutcome({
      auction_outcome: "lost",
      auction_result_date: "2026-04-01",
      winning_bid_price: 180000000,
      auction_datetime: "2026-04-01 10:00"
    }, { as_of: "2026-07-01" });
    assert.equal(result.valid, true);
    assert.equal(result.outcome, "lost");
  });

  it("accepts skipped without winning_bid_price", () => {
    const result = core.validateOutcome({
      auction_outcome: "skipped",
      auction_result_date: "2026-05-10",
      auction_datetime: "2026-05-10 10:00"
    }, { as_of: "2026-07-01" });
    assert.equal(result.valid, true);
    assert.equal(result.outcome, "skipped");
    assert.equal(result.winning_bid_price, null);
  });

  it("rejects won without winning_bid_price", () => {
    const result = core.validateOutcome({
      auction_outcome: "won",
      auction_result_date: "2026-03-15",
      auction_datetime: "2026-03-15 10:00"
    }, { as_of: "2026-07-01" });
    assert.equal(result.valid, false);
    assert.ok(result.errors.some(e => e.includes("winning_bid_price")));
  });

  it("rejects lost with zero winning_bid_price", () => {
    const result = core.validateOutcome({
      auction_outcome: "lost",
      auction_result_date: "2026-03-15",
      winning_bid_price: 0,
      auction_datetime: "2026-03-15 10:00"
    }, { as_of: "2026-07-01" });
    assert.equal(result.valid, false);
  });

  it("rejects future result_date (after as_of)", () => {
    const result = core.validateOutcome({
      auction_outcome: "won",
      auction_result_date: "2026-08-01",
      winning_bid_price: 100000000,
      auction_datetime: "2026-08-01 10:00"
    }, { as_of: "2026-07-01" });
    assert.equal(result.valid, false);
    assert.ok(result.errors.some(e => e.includes("future")));
  });

  it("rejects result_date before auction_datetime", () => {
    const result = core.validateOutcome({
      auction_outcome: "won",
      auction_result_date: "2026-03-14",
      winning_bid_price: 100000000,
      auction_datetime: "2026-03-15 10:00"
    }, { as_of: "2026-07-01" });
    assert.equal(result.valid, false);
    assert.ok(result.errors.some(e => e.includes("on or after")));
  });

  it("rejects invalid calendar date (Feb 30)", () => {
    const result = core.validateOutcome({
      auction_outcome: "won",
      auction_result_date: "2026-02-30",
      winning_bid_price: 100000000,
      auction_datetime: "2026-02-28 10:00"
    }, { as_of: "2026-07-01" });
    assert.equal(result.valid, false);
  });

  it("rejects invalid outcome enum", () => {
    const result = core.validateOutcome({
      auction_outcome: "pending",
      auction_result_date: "2026-03-15"
    }, { as_of: "2026-07-01" });
    assert.equal(result.valid, false);
  });
});

describe("AuctionLearningCore — feedback errors", () => {
  it("computes signed error vs expected (positive = below winning)", () => {
    const fb = core.computeFeedback({
      winning_bid_price: 300000000,
      expected_bid: 250000000
    });
    assert.equal(fb.error_vs_expected, 50000000);
    assert.equal(fb.error_vs_expected_pct, 16.67);
  });

  it("computes signed error vs my_bid", () => {
    const fb = core.computeFeedback({
      winning_bid_price: 300000000,
      my_bid_price: 280000000
    });
    assert.equal(fb.error_vs_my_bid, 20000000);
    assert.equal(fb.error_vs_my_bid_pct, 6.67);
  });

  it("negative error means local value was above winning", () => {
    const fb = core.computeFeedback({
      winning_bid_price: 200000000,
      expected_bid: 250000000
    });
    assert.equal(fb.error_vs_expected, -50000000);
    assert.equal(fb.error_vs_expected_pct, -25);
  });

  it("rounds KRW to 1 won", () => {
    const fb = core.computeFeedback({
      winning_bid_price: 100000001,
      expected_bid: 99999999
    });
    assert.equal(fb.error_vs_expected, 2);
  });

  it("rounds percentage to 2 decimals", () => {
    const fb = core.computeFeedback({
      winning_bid_price: 300000000,
      expected_bid: 290000000
    });
    // (300M - 290M) / 300M * 100 = 3.333...
    assert.equal(fb.error_vs_expected_pct, 3.33);
  });

  it("returns null for missing denominator", () => {
    const fb = core.computeFeedback({
      winning_bid_price: 300000000
    });
    assert.equal(fb.error_vs_expected, null);
    assert.equal(fb.error_vs_expected_pct, null);
    assert.equal(fb.error_vs_my_bid, null);
    assert.equal(fb.error_vs_my_bid_pct, null);
  });

  it("returns null when winning_bid_price is zero", () => {
    const fb = core.computeFeedback({
      winning_bid_price: 0,
      expected_bid: 250000000
    });
    assert.equal(fb.error_vs_expected, null);
  });
});

describe("AuctionLearningCore — 12-month window", () => {
  it("subtracts 12 months normally", () => {
    assert.equal(core.subtract12Months("2026-07-15"), "2025-07-15");
  });

  it("clamps leap day Feb 29 to Feb 28", () => {
    assert.equal(core.subtract12Months("2024-02-29"), "2023-02-28");
  });

  it("both endpoints inclusive", () => {
    assert.equal(core.inWindow("2025-07-15", "2025-07-15", "2026-07-15"), true);
    assert.equal(core.inWindow("2026-07-15", "2025-07-15", "2026-07-15"), true);
    assert.equal(core.inWindow("2025-07-14", "2025-07-15", "2026-07-15"), false);
    assert.equal(core.inWindow("2026-07-16", "2025-07-15", "2026-07-15"), false);
  });
});

describe("AuctionLearningCore — property type normalization", () => {
  it("maps Korean aliases", () => {
    assert.equal(core.normalizePropertyType("아파트"), "apartment");
    assert.equal(core.normalizePropertyType("오피스텔"), "officetel");
    assert.equal(core.normalizePropertyType("다세대"), "multi_family");
    assert.equal(core.normalizePropertyType("빌라"), "multi_family");
    assert.equal(core.normalizePropertyType("단독주택"), "single_family");
    assert.equal(core.normalizePropertyType("상가"), "commercial");
    assert.equal(core.normalizePropertyType("토지"), "land");
  });

  it("maps English canonical names", () => {
    assert.equal(core.normalizePropertyType("apartment"), "apartment");
    assert.equal(core.normalizePropertyType("Apartment"), "apartment");
    assert.equal(core.normalizePropertyType("MULTI_FAMILY"), "multi_family");
  });

  it("trims and NFC normalizes", () => {
    assert.equal(core.normalizePropertyType("  아파트  "), "apartment");
  });

  it("returns unmapped for unknown types", () => {
    assert.equal(core.normalizePropertyType("공장"), "unmapped");
    assert.equal(core.normalizePropertyType("warehouse"), "unmapped");
    assert.equal(core.normalizePropertyType(""), "unmapped");
  });
});

describe("AuctionLearningCore — internal comparables", () => {
  const target = {
    id: "target-case",
    path: "PARA/PROJECTS/Auction/target-case.md",
    region_key: "부산광역시-사하구",
    property_type: "아파트",
    exclusive_area: 84.5
  };

  const candidates = [
    {
      id: "comp-1",
      path: "PARA/PROJECTS/Auction/comp-1.md",
      region_key: "부산광역시-사하구",
      property_type: "아파트",
      exclusive_area: 84.0,
      auction_outcome: "won",
      auction_result_date: "2026-03-10",
      winning_bid_price: 250000000
    },
    {
      id: "comp-2",
      path: "PARA/PROJECTS/Auction/comp-2.md",
      region_key: "부산광역시-사하구",
      property_type: "아파트",
      exclusive_area: 100.0,
      auction_outcome: "lost",
      auction_result_date: "2026-04-01",
      winning_bid_price: 300000000
    },
    {
      id: "comp-3",
      path: "PARA/PROJECTS/Auction/comp-3.md",
      region_key: "서울특별시-강남구",
      property_type: "아파트",
      exclusive_area: 84.0,
      auction_outcome: "won",
      auction_result_date: "2026-05-01",
      winning_bid_price: 900000000
    },
    {
      id: "comp-4",
      path: "PARA/PROJECTS/Auction/comp-4.md",
      region_key: "부산광역시-사하구",
      property_type: "오피스텔",
      exclusive_area: 84.0,
      auction_outcome: "won",
      auction_result_date: "2026-05-01",
      winning_bid_price: 150000000
    },
    {
      id: "comp-5",
      path: "PARA/PROJECTS/Auction/comp-5.md",
      region_key: "부산광역시-사하구",
      property_type: "아파트",
      exclusive_area: 84.0,
      auction_outcome: "won",
      auction_result_date: "2024-01-01",
      winning_bid_price: 200000000
    }
  ];

  it("selects exact region, type, area within 20%, valid outcome, in window", () => {
    const results = core.internalComparables(target, candidates, { as_of: "2026-07-01" });
    // comp-1: same region, same type, area diff 0.5/84.5 = 0.006 ≤ 0.20, in window ✓
    // comp-2: area diff 15.5/84.5 = 0.183 ≤ 0.20, in window ✓
    // comp-3: different region ✗
    // comp-4: different type ✗
    // comp-5: outside 12-month window ✗
    assert.equal(results.length, 2);
    // Sorted by date desc: comp-2 (2026-04-01) before comp-1 (2026-03-10)
    assert.equal(results[0].id, "comp-2");
    assert.equal(results[1].id, "comp-1");
  });

  it("excludes candidates without valid outcome", () => {
    const noOutcome = [{
      id: "no-outcome",
      path: "PARA/PROJECTS/Auction/no-outcome.md",
      region_key: "부산광역시-사하구",
      property_type: "아파트",
      exclusive_area: 84.0,
      status: "bidding"
    }];
    const results = core.internalComparables(target, noOutcome, { as_of: "2026-07-01" });
    assert.equal(results.length, 0);
  });

  it("requires positive exclusive_area on target and candidate", () => {
    const badTarget = { ...target, exclusive_area: 0 };
    const results = core.internalComparables(badTarget, candidates, { as_of: "2026-07-01" });
    assert.equal(results.length, 0);
  });
});

describe("AuctionLearningCore — external comparables", () => {
  const target = {
    property_type: "apartment",
    lawd_code: "26380",
    exclusive_area: 84.5
  };

  const transactions = [
    { id: "tx-1", lawd_code: "26380", exclusive_area: 84.0, transaction_date: "2026-05-15", deal_amount: 280000000 },
    { id: "tx-2", lawd_code: "26380", exclusive_area: 92.0, transaction_date: "2026-04-01", deal_amount: 310000000 },
    { id: "tx-3", lawd_code: "26380", exclusive_area: 84.0, transaction_date: "2024-01-01", deal_amount: 240000000 },
    { id: "tx-4", lawd_code: "11110", exclusive_area: 84.0, transaction_date: "2026-06-01", deal_amount: 500000000 }
  ];

  it("apartment-only, exact lawd, area ratio ≤ 0.10, in window", () => {
    const results = core.externalComparables(target, transactions, { as_of: "2026-07-01" });
    // tx-1: area ratio 0.5/84.5 = 0.006 ≤ 0.10 ✓
    // tx-2: area ratio 7.5/84.5 = 0.089 ≤ 0.10 ✓
    // tx-3: outside window ✗
    // tx-4: different lawd ✗
    assert.equal(results.length, 2);
    assert.equal(results[0].id, "tx-1");
    assert.equal(results[1].id, "tx-2");
  });

  it("rejects non-apartment targets", () => {
    const officetelTarget = { ...target, property_type: "officetel" };
    const results = core.externalComparables(officetelTarget, transactions, { as_of: "2026-07-01" });
    assert.equal(results.length, 0);
  });
});

describe("AuctionLearningCore — case identity and deduplication", () => {
  it("validates id equals filename stem", () => {
    const identity = core.caseIdentity({ id: "my-case", path: "PARA/PROJECTS/Auction/my-case.md" });
    assert.equal(identity.valid, true);
  });

  it("rejects mismatched id and stem", () => {
    const identity = core.caseIdentity({ id: "wrong-id", path: "PARA/PROJECTS/Auction/my-case.md" });
    assert.equal(identity.valid, false);
  });

  it("NFC normalizes id and stem", () => {
    // Use NFC form
    const nfcId = "테스트".normalize("NFC");
    const identity = core.caseIdentity({ id: nfcId, path: `PARA/PROJECTS/Auction/${nfcId}.md` });
    assert.equal(identity.valid, true);
  });

  it("excludes duplicate id groups", () => {
    const records = [
      { id: "dup", path: "PARA/PROJECTS/Auction/dup.md", region_key: "A" },
      { id: "dup", path: "PARA/PROJECTS/Auction/dup2.md", region_key: "B" },
      { id: "unique", path: "PARA/PROJECTS/Auction/unique.md", region_key: "C" }
    ];
    const { eligible, excluded } = core.uniqueEligibleCases(records);
    assert.equal(eligible.length, 1);
    assert.equal(eligible[0].id, "unique");
    assert.equal(excluded.length, 2);
  });

  it("excludes duplicate path groups", () => {
    const records = [
      { id: "same", path: "PARA/PROJECTS/Auction/same.md" },
      { id: "same", path: "PARA/PROJECTS/Auction/same.md" },
      { id: "other", path: "PARA/PROJECTS/Auction/other.md" }
    ];
    const { eligible } = core.uniqueEligibleCases(records);
    assert.equal(eligible.length, 1);
    assert.equal(eligible[0].id, "other");
  });

  it("excludes id/stem mismatch", () => {
    const records = [
      { id: "wrong", path: "PARA/PROJECTS/Auction/correct.md" },
      { id: "right", path: "PARA/PROJECTS/Auction/right.md" }
    ];
    const { eligible } = core.uniqueEligibleCases(records);
    assert.equal(eligible.length, 1);
    assert.equal(eligible[0].id, "right");
  });
});

describe("AuctionLearningCore — external duplicate fingerprints", () => {
  it("selects greatest tuple", () => {
    const rows = [
      { official_revision_at: "2026-01-01", fetched_at: "2026-01-02", generation_id: "g1" },
      { official_revision_at: "2026-03-01", fetched_at: "2026-03-02", generation_id: "g2" },
      { official_revision_at: "2026-02-01", fetched_at: "2026-02-02", generation_id: "g3" }
    ];
    const winner = core.selectExternalGeneration(rows);
    assert.equal(winner.generation_id, "g2");
  });

  it("falls back to fetched_at when official_revision_at missing", () => {
    const rows = [
      { fetched_at: "2026-01-01", generation_id: "g1" },
      { fetched_at: "2026-05-01", generation_id: "g2" }
    ];
    const winner = core.selectExternalGeneration(rows);
    assert.equal(winner.generation_id, "g2");
  });

  it("excludes exact ties", () => {
    const rows = [
      { official_revision_at: "2026-03-01", fetched_at: "2026-03-02", generation_id: "g1" },
      { official_revision_at: "2026-03-01", fetched_at: "2026-03-02", generation_id: "g1" }
    ];
    const winner = core.selectExternalGeneration(rows);
    assert.equal(winner, null);
  });
});

describe("AuctionLearningCore — status independence", () => {
  it("outcomeDisplayLabel returns outcome when canonical outcome exists", () => {
    assert.equal(core.outcomeDisplayLabel({ auction_outcome: "won", status: "archived" }), "won");
  });

  it("outcomeDisplayLabel returns 결과 입력 대기 for legacy status-only", () => {
    assert.equal(core.outcomeDisplayLabel({ status: "won" }), "결과 입력 대기");
    assert.equal(core.outcomeDisplayLabel({ status: "lost" }), "결과 입력 대기");
    assert.equal(core.outcomeDisplayLabel({ status: "skipped" }), "결과 입력 대기");
  });

  it("outcomeDisplayLabel returns empty for non-terminal status", () => {
    assert.equal(core.outcomeDisplayLabel({ status: "watching" }), "");
    assert.equal(core.outcomeDisplayLabel({ status: "bidding" }), "");
  });
});

describe("AuctionLearningCore — sort comparables", () => {
  it("sorts by date desc, area delta asc, id code-point asc", () => {
    const items = [
      { result_date: "2026-01-01", area_delta: 5, id: "b" },
      { result_date: "2026-03-01", area_delta: 2, id: "a" },
      { result_date: "2026-03-01", area_delta: 1, id: "c" },
      { result_date: "2026-03-01", area_delta: 1, id: "a" }
    ];
    const sorted = core.sortComparables(items);
    assert.equal(sorted[0].id, "a"); // date 03-01, delta 1, id a
    assert.equal(sorted[1].id, "c"); // date 03-01, delta 1, id c
    assert.equal(sorted[2].id, "a"); // date 03-01, delta 2
    assert.equal(sorted[3].id, "b"); // date 01-01
  });
});
