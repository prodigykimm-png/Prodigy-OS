"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");
const test = require("node:test");

const ROOT = path.resolve(__dirname, "../../../../../..");
const writer = require(path.join(ROOT, "SYSTEM/Views/auction-source-approval-writer.js"));
const identity = require(path.join(ROOT, "SYSTEM/SCRIPTS/real-estate-source-identity-core.js"));
const packageCore = require(path.join(ROOT, "SYSTEM/SCRIPTS/real-estate-source-package-core.js"));

function currentFm(overrides) {
  return Object.assign({ case_number: "2026타경10001", court: "서울중앙지방법원", court_code: "B000001", address: "서울특별시 강남구 역삼동 1-1", region_sido: "서울특별시", region_sigungu: "강남구", region_dong: "역삼동", property_type: "아파트" }, overrides || {});
}
function pkg() {
  const candidate_patch = {
    case_number: "2026타경10001", court: "서울중앙지방법원", auction_datetime: "2026-07-01 10:00", address: "서울특별시 강남구 역삼동 1-1", minimum_bid: 640000000, auction_outcome: "won", auction_result_date: "2026-07-01", winning_bid_price: 700000000
  };
  const providers = Object.fromEntries(packageCore.PROVIDERS.map((provider) => [provider, { status: provider === "court" ? "success" : "needs_identifier", source_url: "https://example.com/source", fetched_at: "2026-08-01T00:00:00.000Z", raw_path: provider === "court" ? `raw/${provider}.json` : undefined, raw_sha256: provider === "court" ? "a".repeat(64) : undefined, warnings: [], match_verified: provider === "court" }]));
  const resolutionProviders = Object.fromEntries(packageCore.PROVIDERS.map((provider) => [provider, { status: provider === "court" ? "success" : "needs_identifier", method: provider === "court" ? "exact" : "not_run", query: {}, candidates: [], match_verified: provider === "court", reason: provider === "court" ? "exact" : "not_run" }]));
  const base = currentFm();
  return { schema_version: 1, package_id: "case-20260801", case_key: "2026타경10001-1", observed_at: "2026-08-01T00:00:00.000Z", query_identity: { object_path: "PARA/PROJECTS/Auction/case.md", object_fingerprint: identity.normalizeAuctionIdentity(base, {}).query_fingerprint, case_number: base.case_number }, collector: { k_skill_repository: "https://github.com/NomaDamas/k-skill", k_skill_commit: "06d017ac05317da31ab2c8d6a9accf4ad4db70ad", package_version: "0.2.2", selected_skills: packageCore.SELECTED_SKILLS.slice() }, providers, candidate_patch, evidence: {}, errors: [], match_resolution: { schema_version: 1, normalized_input: {}, resolution_method: "fixture", selected_identity: {}, candidate_list: [], provider_query_identity: {}, query_fingerprint: "b".repeat(64), match_verified: false, evidence_refs: [], candidate_sources: Object.fromEntries(Object.keys(candidate_patch).map((key) => [key, ["court"]])), providers: resolutionProviders } };
}

test("Given a source candidate, When a safe fact is selected, Then the apply plan contains only that fact", () => {
  const plan = writer.buildApplyPlan(pkg(), ["address", "minimum_bid"], currentFm(), { as_of: "2026-08-01", object_path: "PARA/PROJECTS/Auction/case.md" });
  assert.equal(plan.ok, true);
  assert.deepEqual(plan.fields, { address: "서울특별시 강남구 역삼동 1-1", minimum_bid: 640000000 });
  assert.equal(Object.hasOwn(plan.fields, "status"), false);
});

test("Given a source candidate, When a protected judgment field is selected, Then the plan rejects it", () => {
  assert.throws(() => writer.buildApplyPlan({ candidate_patch: { status: "won" } }, ["status"], {}, { as_of: "2026-08-01" }), /반영할 수 없는 필드/);
});

test("Given a valid official outcome, When the outcome tuple is selected, Then it validates without changing lifecycle status", () => {
  const plan = writer.buildApplyPlan(pkg(), ["auction_outcome", "auction_result_date", "winning_bid_price"], currentFm({ status: "watching" }), { as_of: "2026-08-01", object_path: "PARA/PROJECTS/Auction/case.md" });
  assert.equal(plan.ok, true);
  assert.equal(plan.fields.auction_outcome, "won");
  assert.equal(plan.existing.status, "watching");
});

test("Given an existing outcome, When a new tuple is selected without confirmation, Then the plan pauses", () => {
  const plan = writer.buildApplyPlan(pkg(), ["auction_outcome", "auction_result_date", "winning_bid_price"], currentFm({ auction_outcome: "lost", auction_result_date: "2026-06-01", winning_bid_price: 600000000 }), { as_of: "2026-08-01", object_path: "PARA/PROJECTS/Auction/case.md" });
  assert.equal(plan.ok, false);
  assert.equal(plan.confirmation_required, true);
});

test("Given a package for an older Auction Object, When approval starts, Then the fingerprint mismatch blocks the write", () => {
  const stale = pkg();
  stale.query_identity.object_fingerprint = "c".repeat(64);
  assert.throws(() => writer.buildApplyPlan(stale, ["minimum_bid"], currentFm(), { as_of: "2026-08-01", object_path: "PARA/PROJECTS/Auction/case.md" }), /fingerprint/iu);
});

test("Given a verified package with a different Object path, When approval starts, Then cross-object application is blocked", () => {
  assert.throws(() => writer.buildApplyPlan(pkg(), ["minimum_bid"], currentFm(), { as_of: "2026-08-01", object_path: "PARA/PROJECTS/Auction/other.md" }), /경로/iu);
});

console.log("Auction source approval writer tests loaded");

test("Given an Auction Object, When approved fields are written, Then status and judgment remain unchanged", async () => {
  const file = { path: "PARA/PROJECTS/Auction/case.md", fm: currentFm({ status: "watching", decision_reason: "사람 판단", minimum_bid: 500000000 }), writes: 0 };
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
