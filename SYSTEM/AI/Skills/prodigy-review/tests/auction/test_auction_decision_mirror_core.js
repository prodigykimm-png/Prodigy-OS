"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");
const test = require("node:test");

const ROOT = path.resolve(__dirname, "../../../../../..");
const core = require(path.join(ROOT, "SYSTEM/Views/auction-decision-mirror-core.js"));

function currentAuction(overrides = {}) {
  return {
    id: "current-case",
    type: "auction_case",
    file: { path: "PARA/PROJECTS/Auction/current-case.md" },
    region_sido: "부산광역시",
    region_sigungu: "금정구",
    region_dong: "장전동",
    property_type: "아파트",
    decision_reason: "역세권과 실수요를 확인했다.",
    my_opinion: "권리관계 확인 후 입찰 여부를 정한다.",
    auction_note: "현장 소음 재확인",
    expected_bid: 240000000,
    my_bid_price: 245000000,
    ...overrides
  };
}

test("Given human judgement, When a decision mirror is projected, Then only populated human fields are preserved", () => {
  const result = core.projectDecisionMirror({
    regionKey: "부산광역시-금정구",
    auction: currentAuction({ auction_note: "" }),
    cases: []
  });

  assert.deepEqual(result.current_decision.reasons, [
    { key: "decision_reason", label: "결정 사유", value: "역세권과 실수요를 확인했다." },
    { key: "my_opinion", label: "내 판단", value: "권리관계 확인 후 입찰 여부를 정한다." }
  ]);
  assert.equal(result.current_decision.region_dong, "장전동");
  assert.equal(result.current_decision.expected_bid, 240000000);
  assert.equal(result.recommendation, undefined);
  assert.equal(result.score, undefined);
});
test("Given a canonical outcome, When a decision mirror is projected, Then bid rate uses winning price over appraisal price", () => {
  const result = core.projectDecisionMirror({
    regionKey: "부산광역시-금정구",
    auction: currentAuction(),
    cases: [{
      id: "past-case",
      type: "auction_case",
      file: { path: "PARA/PROJECTS/Auction/past-case.md" },
      region_sido: "부산광역시",
      region_sigungu: "금정구",
      region_dong: "구서동",
      property_type: "아파트",
      decision_reason: "실거주 수요",
      auction_outcome: "lost",
      auction_result_date: "2026-06-20",
      winning_bid_price: 850000000,
      appraisal_price: 1000000000
    }]
  });

  assert.equal(result.canonical_outcome_count, 1);
  assert.equal(result.outcomes[0].bid_rate_percent, 85);
  assert.equal(result.outcomes[0].decision_reason, "실거주 수요");
  assert.equal(result.bid_rate_summary.sample_count, 1);
  assert.equal(result.bid_rate_summary.average_percent, 85);
  assert.equal(result.bid_rate_summary.sample_state, "small");
});

test("Given lifecycle-only terminal cases, When a decision mirror is projected, Then they remain pending instead of becoming outcomes", () => {
  const result = core.projectDecisionMirror({
    regionKey: "부산광역시-금정구",
    auction: currentAuction(),
    cases: [
      { id: "legacy-won", type: "auction_case", region_sido: "부산광역시", region_sigungu: "금정구", status: "won", winning_bid_price: 300000000 },
      { id: "legacy-lost", type: "auction_case", region_sido: "부산광역시", region_sigungu: "금정구", status: "lost", winning_bid_price: 320000000 }
    ]
  });

  assert.equal(result.canonical_outcome_count, 0);
  assert.equal(result.legacy_pending_count, 2);
  assert.deepEqual(result.outcomes, []);
  assert.equal(result.empty_state, "정규 결과 기록이 없습니다.");
});

test("Given mixed regions and invalid tuples, When a decision mirror is projected, Then only exact-region valid tuples are included", () => {
  const result = core.projectDecisionMirror({
    regionKey: "부산광역시-금정구",
    auction: currentAuction(),
    cases: [
      { id: "other", type: "auction_case", region_sido: "부산광역시", region_sigungu: "동래구", auction_outcome: "won", auction_result_date: "2026-06-01", winning_bid_price: 1, appraisal_price: 2 },
      { id: "missing-date", type: "auction_case", region_sido: "부산광역시", region_sigungu: "금정구", auction_outcome: "won", winning_bid_price: 300000000, appraisal_price: 400000000 },
      { id: "skipped", type: "auction_case", region_sido: "부산광역시", region_sigungu: "금정구", auction_outcome: "skipped", auction_result_date: "2026-06-02" }
    ]
  });

  assert.equal(result.canonical_outcome_count, 1);
  assert.equal(result.outcomes[0].outcome, "skipped");
  assert.equal(result.bid_rate_summary.sample_count, 0);
  assert.equal(result.bid_rate_summary.average_percent, null);
});
