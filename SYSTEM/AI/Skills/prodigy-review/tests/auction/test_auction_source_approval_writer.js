"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");
const test = require("node:test");

const ROOT = path.resolve(__dirname, "../../../../../..");
const writer = require(path.join(ROOT, "SYSTEM/Views/auction-source-approval-writer.js"));

function pkg() {
  return { candidate_patch: {
    case_number: "2026타경10001", court: "서울중앙지방법원", auction_datetime: "2026-07-01 10:00", address: "서울특별시 강남구 역삼동 1-1", minimum_bid: 640000000, auction_outcome: "won", auction_result_date: "2026-07-01", winning_bid_price: 700000000
  } };
}

test("Given a source candidate, When a safe fact is selected, Then the apply plan contains only that fact", () => {
  const plan = writer.buildApplyPlan(pkg(), ["address", "minimum_bid"], {}, { as_of: "2026-08-01" });
  assert.equal(plan.ok, true);
  assert.deepEqual(plan.fields, { address: "서울특별시 강남구 역삼동 1-1", minimum_bid: 640000000 });
  assert.equal(Object.hasOwn(plan.fields, "status"), false);
});

test("Given a source candidate, When a protected judgment field is selected, Then the plan rejects it", () => {
  assert.throws(() => writer.buildApplyPlan({ candidate_patch: { status: "won" } }, ["status"], {}, { as_of: "2026-08-01" }), /반영할 수 없는 필드/);
});

test("Given a valid official outcome, When the outcome tuple is selected, Then it validates without changing lifecycle status", () => {
  const plan = writer.buildApplyPlan(pkg(), ["auction_outcome", "auction_result_date", "winning_bid_price"], { status: "watching" }, { as_of: "2026-08-01" });
  assert.equal(plan.ok, true);
  assert.equal(plan.fields.auction_outcome, "won");
  assert.equal(plan.existing.status, "watching");
});

test("Given an existing outcome, When a new tuple is selected without confirmation, Then the plan pauses", () => {
  const plan = writer.buildApplyPlan(pkg(), ["auction_outcome", "auction_result_date", "winning_bid_price"], { auction_outcome: "lost", auction_result_date: "2026-06-01", winning_bid_price: 600000000 }, { as_of: "2026-08-01" });
  assert.equal(plan.ok, false);
  assert.equal(plan.confirmation_required, true);
});

console.log("Auction source approval writer tests loaded");

test("Given an Auction Object, When approved fields are written, Then status and judgment remain unchanged", async () => {
  const file = { path: "PARA/PROJECTS/Auction/case.md", fm: { status: "watching", decision_reason: "사람 판단", minimum_bid: 500000000 }, writes: 0 };
  const app = {
    vault: { getAbstractFileByPath: (candidate) => candidate === file.path ? file : null },
    metadataCache: { getFileCache: () => ({ frontmatter: Object.assign({}, file.fm) }) },
    fileManager: { processFrontMatter: async (_file, callback) => { callback(file.fm); file.writes += 1; } }
  };
  const result = await writer.writeApproved(app, file.path, pkg(), ["minimum_bid", "auction_outcome", "auction_result_date", "winning_bid_price"], { execute: true, as_of: "2026-08-01" });
  assert.equal(result.ok, true);
  assert.equal(file.fm.minimum_bid, 640000000);
  assert.equal(file.fm.winning_bid_price, 700000000);
  assert.equal(file.fm.status, "watching");
  assert.equal(file.fm.decision_reason, "사람 판단");
  assert.equal(file.writes, 1);
});
