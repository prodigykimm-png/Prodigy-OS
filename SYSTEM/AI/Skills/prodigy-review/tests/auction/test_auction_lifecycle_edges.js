"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const ROOT = path.resolve(__dirname, "../../../../../..");
const projection = require(path.join(ROOT, "SYSTEM/Views/auction-card-price-projection.js"));
const learning = require(path.join(ROOT, "SYSTEM/Views/auction-learning-core.js"));
const writer = require(path.join(ROOT, "SYSTEM/Views/auction-source-approval-writer.js"));
const identity = require(path.join(ROOT, "SYSTEM/SCRIPTS/real-estate-source-identity-core.js"));
const packageCore = require(path.join(ROOT, "SYSTEM/SCRIPTS/real-estate-source-package-core.js"));

test("Ended watching without an official result keeps lifecycle and does not invent a winning price", () => {
  const record = { status: "watching", auction_datetime: "2026-07-01", minimum_bid: 100000000, expected_bid: 130000000 };
  const prices = projection.project(record, { isEnded: true });
  assert.equal(prices.right.key, "winning_bid_price");
  assert.equal(prices.right.value, null);
  assert.equal(learning.outcomeDisplayLabel(record), "");
  assert.equal(record.status, "watching");
});

test("A stored price without the official outcome tuple is displayed as a price only", () => {
  const record = { status: "watching", auction_datetime: "2026-07-01", winning_bid_price: 125000000 };
  const prices = projection.project(record, { isEnded: true });
  assert.equal(prices.right.value, 125000000);
  assert.equal(learning.outcomeDisplayLabel(record), "");
  assert.equal(record.status, "watching");
});

test("Approved official outcome writes the tuple and leaves lifecycle status untouched", () => {
  const current = { case_number: "2026타경10001", court: "서울중앙지방법원", court_code: "B000001", address: "서울특별시 강남구 역삼동 1-1", property_type: "아파트", status: "watching" };
  const candidate_patch = { auction_outcome: "won", auction_result_date: "2026-07-02", winning_bid_price: 125000000 };
  const providers = Object.fromEntries(packageCore.PROVIDERS.map((provider) => [provider, { status: provider === "court" ? "success" : "needs_identifier", source_url: "https://example.com/source", fetched_at: "2026-08-01T00:00:00.000Z", raw_path: provider === "court" ? "raw/court.json" : undefined, raw_sha256: provider === "court" ? "a".repeat(64) : undefined, warnings: [], match_verified: provider === "court" }]));
  const resolutionProviders = Object.fromEntries(packageCore.PROVIDERS.map((provider) => [provider, { status: provider === "court" ? "success" : "needs_identifier", method: provider === "court" ? "exact" : "not_run", query: {}, candidates: [], match_verified: provider === "court", reason: provider === "court" ? "exact" : "not_run" }]));
  const pkg = { schema_version: 1, package_id: "case-1", case_key: "2026타경10001-1", observed_at: "2026-08-01T00:00:00.000Z", query_identity: { object_path: "PARA/PROJECTS/Auction/case.md", object_fingerprint: identity.normalizeAuctionIdentity(current, {}).query_fingerprint, case_number: current.case_number }, collector: { k_skill_repository: "https://github.com/NomaDamas/k-skill", k_skill_commit: "06d017ac05317da31ab2c8d6a9accf4ad4db70ad", package_version: "0.2.2", selected_skills: packageCore.SELECTED_SKILLS.slice() }, providers, candidate_patch, evidence: {}, errors: [], match_resolution: { schema_version: 1, normalized_input: {}, resolution_method: "test", selected_identity: {}, candidate_list: [], provider_query_identity: {}, query_fingerprint: "b".repeat(64), match_verified: false, evidence_refs: [], candidate_sources: { auction_outcome: ["court"], auction_result_date: ["court"], winning_bid_price: ["court"] }, providers: resolutionProviders } };
  const plan = writer.buildApplyPlan(pkg, ["auction_outcome", "auction_result_date", "winning_bid_price"], current, { as_of: "2026-08-02", object_path: "PARA/PROJECTS/Auction/case.md" });
  assert.equal(plan.ok, true);
  assert.deepEqual(plan.fields, { auction_outcome: "won", auction_result_date: "2026-07-02", winning_bid_price: 125000000 });
  assert.equal(plan.fields.status, undefined);
  assert.equal(writer.PROTECTED_KEYS.includes("status"), true);
});

test("Lifecycle enum does not grow outcome-like postponed or withdrawn statuses", () => {
  const card = fs.readFileSync(path.join(ROOT, "SYSTEM/Views/auction-card.js"), "utf8");
  assert.doesNotMatch(card, /status\s*===\s*["'](?:postponed|withdrawn)["']/);
  assert.deepEqual(learning.OUTCOMES, ["won", "lost", "skipped"]);
});
