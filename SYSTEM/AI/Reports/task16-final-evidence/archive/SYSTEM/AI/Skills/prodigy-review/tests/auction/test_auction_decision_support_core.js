"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");
const test = require("node:test");

const ROOT = path.resolve(__dirname, "../../../../../..");
const core = require(path.join(ROOT, "SYSTEM/Views/auction-decision-support-core.js"));

const AS_OF = "2026-08-03T09:00:00.000Z";

function auction(overrides = {}) {
  return {
    id: "current-case",
    type: "auction_case",
    path: "PARA/PROJECTS/Auction/current-case.md",
    region_sido: "부산광역시",
    region_sigungu: "금정구",
    region_dong: "장전동",
    property_type: "아파트",
    appraisal_price: 1000000000,
    expected_bid: 820000000,
    my_bid_price: 800000000,
    ...overrides
  };
}

function result(id, overrides = {}) {
  return {
    id,
    type: "auction_case",
    path: `PARA/PROJECTS/Auction/${id}.md`,
    region_sido: "부산광역시",
    region_sigungu: "금정구",
    region_dong: "구서동",
    property_type: "아파트",
    appraisal_price: 1000000000,
    auction_outcome: "lost",
    auction_result_date: "2026-07-01",
    winning_bid_price: 850000000,
    my_bid_price: 820000000,
    ...overrides
  };
}

test("Given exact region and property type records, When a dataset is built, Then the current case is excluded and cohort identity is preserved", () => {
  const dataset = core.buildAuctionDecisionDataset({
    currentAuction: auction(),
    cases: [
      auction({ id: "current-case-duplicate", path: "PARA/PROJECTS/Auction/current-case.md", auction_outcome: "lost", auction_result_date: "2026-07-02", winning_bid_price: 860000000 }),
      result("same-type"),
      result("other-dong", { region_dong: "부곡동" }),
      result("other-type", { property_type: "오피스텔" }),
      result("other-region", { region_sigungu: "동래구" })
    ],
    generationStartedAt: AS_OF
  });

  assert.equal(dataset.analysis_as_of, AS_OF);
  assert.deepEqual(dataset.cohort, {
    region_sido: "부산광역시",
    region_sigungu: "금정구",
    property_type: "아파트"
  });
  assert.equal(dataset.records.some((record) => record.path.endsWith("current-case.md")), false);
  assert.equal(dataset.records.length, 4);
  assert.equal(dataset.warnings.length, 0);
});

test("Given lifecycle status without a canonical outcome, When a dataset is built, Then it is not promoted to a result", () => {
  const dataset = core.buildAuctionDecisionDataset({
    currentAuction: auction(),
    cases: [
      result("status-only", { auction_outcome: "", auction_result_date: "", winning_bid_price: 0, status: "won" }),
      result("missing-date", { auction_result_date: "", status: "lost" }),
      result("valid")
    ],
    generationStartedAt: AS_OF
  });

  const cohort = core.selectAuctionDecisionCohort(dataset);
  assert.equal(cohort.length, 1);
  assert.equal(cohort[0].id, "valid");
  assert.equal(dataset.diagnostics.some((item) => item.code === "non_canonical_outcome"), true);
});

test("Given won, lost, and skipped outcomes, When winning bid ratios are summarized, Then skipped and incomplete appraisal values are excluded", () => {
  const dataset = core.buildAuctionDecisionDataset({
    currentAuction: auction(),
    cases: [
      result("won", { auction_outcome: "won", winning_bid_price: 900000000, appraisal_price: 1000000000 }),
      result("lost-1", { winning_bid_price: 800000000, appraisal_price: 1000000000 }),
      result("lost-2", { winning_bid_price: 700000000, appraisal_price: 0 }),
      result("skipped", { auction_outcome: "skipped", winning_bid_price: 0 })
    ],
    generationStartedAt: AS_OF
  });

  const summary = core.summarizeWinningBidRatios(core.selectAuctionDecisionCohort(dataset));
  assert.equal(summary.sample_count, 2);
  assert.equal(summary.average_percent, 85);
  assert.equal(summary.median_percent, 85);
  assert.equal(summary.sample_state, "small");
  assert.equal(summary.excluded_count, 2);
});

test("Given personal lost bids, When bid gaps are summarized, Then only positive recorded bids enter the personal statistic", () => {
  const dataset = core.buildAuctionDecisionDataset({
    currentAuction: auction(),
    cases: [
      result("lost-with-bid", { my_bid_price: 800000000, winning_bid_price: 850000000 }),
      result("lost-without-bid", { my_bid_price: 0, winning_bid_price: 900000000 }),
      result("won", { auction_outcome: "won", my_bid_price: 700000000, winning_bid_price: 700000000 })
    ],
    generationStartedAt: AS_OF
  });

  const summary = core.summarizePersonalLostBidGaps(core.selectAuctionDecisionCohort(dataset));
  assert.equal(summary.sample_count, 1);
  assert.equal(summary.average_gap_won, 50000000);
  assert.equal(summary.average_gap_percent, 6.25);
  assert.equal(summary.excluded_count, 1);
});

test("Given five exact-cohort outcomes, When competition references are built, Then appraisal-scaled quartile references are available without a bid recommendation", () => {
  const records = [80, 85, 90, 95, 100].map((percent, index) => result(`rate-${index}`, {
    winning_bid_price: percent * 10000000,
    appraisal_price: 1000000000
  }));
  const dataset = core.buildAuctionDecisionDataset({ currentAuction: auction(), cases: records, generationStartedAt: AS_OF });
  const cohort = core.selectAuctionDecisionCohort(dataset);
  const summary = core.summarizeWinningBidRatios(cohort);
  const references = core.buildCompetitionReferences(summary, auction());

  assert.equal(references.status, "available");
  assert.equal(references.sample_count, 5);
  assert.equal(references.ratio_percentiles.q25, 85);
  assert.equal(references.ratio_percentiles.median, 90);
  assert.equal(references.ratio_percentiles.q75, 95);
  assert.deepEqual(references.appraisal_scaled_won, {
    q25: 850000000,
    median: 900000000,
    q75: 950000000
  });
  assert.equal(Object.hasOwn(references, "recommended_bid"), false);
});

test("Given fewer than five exact-cohort outcomes, When competition references are built, Then the UI receives an explicit insufficient-sample state", () => {
  const dataset = core.buildAuctionDecisionDataset({
    currentAuction: auction(),
    cases: [result("one"), result("two", { auction_result_date: "2026-07-02" })],
    generationStartedAt: AS_OF
  });
  const summary = core.summarizeWinningBidRatios(core.selectAuctionDecisionCohort(dataset));
  const references = core.buildCompetitionReferences(summary, auction());
  assert.equal(references.status, "insufficient_sample");
  assert.equal(references.appraisal_scaled_won, null);
});

test("Given a generated timestamp and no explicit historical cutoff, When a projection is built, Then analysis_as_of is current-session metadata only", () => {
  const projection = core.buildDecisionSupportProjection({
    currentAuction: auction(),
    cases: [result("one")],
    generationStartedAt: AS_OF
  });

  assert.equal(projection.analysis_as_of, AS_OF);
  assert.equal(projection.current_time_only, true);
  assert.equal(projection.recommendation, undefined);
  assert.equal(projection.suggested_bid, undefined);
  assert.equal(projection.warnings.includes("현재 시점의 누적 결과만 사용합니다."), true);
});

console.log("Auction decision support core tests loaded");
