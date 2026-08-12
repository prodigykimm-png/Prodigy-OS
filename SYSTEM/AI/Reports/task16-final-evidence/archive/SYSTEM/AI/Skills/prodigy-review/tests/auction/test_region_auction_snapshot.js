"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const ROOT = path.resolve(__dirname, "../../../../../..");
const core = require(path.join(ROOT, "SYSTEM/Views/auction-region-core.js"));

test("Region snapshot keeps the existing Dataview query contract and filters by the same two fields", () => {
  const template = fs.readFileSync(path.join(ROOT, "SYSTEM/TEMPLATE/FORMAT/template_auction_region.md"), "utf8");
  assert.match(template, new RegExp(core.REGION_AUCTION_QUERY.table.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(template, new RegExp(core.REGION_AUCTION_QUERY.from.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  for (const clause of core.REGION_AUCTION_QUERY.where) assert.match(template, new RegExp(clause.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(template, new RegExp(core.REGION_AUCTION_QUERY.sort.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
});

test("Region snapshot projects only matching Dataview rows without mutating source rows", () => {
  const rows = [
    { path: "a.md", case_number: "A", region_sido: "서울", region_sigungu: "강남구", status: "watching", auction_datetime: "2026-08-10", minimum_bid: 100, address: "서울 강남구", region_dong: "역삼동" },
    { path: "b.md", case_number: "B", region_sido: "서울", region_sigungu: "서초구", status: "bidding" },
    { path: "c.md", case_number: "C", region_sido: "부산", region_sigungu: "강남구", status: "watching" },
    { file: { path: "d.md" }, case_number: "D", region_sido: "서울특별시", region_sigungu: "강남구", status: "bidding", auction_datetime: "2026-08-12", minimum_bid: 200 }
  ];
  const before = JSON.stringify(rows);
  const snapshot = core.getRegionAuctionSnapshot("서울시", "강남구", rows, { observedAt: "2026-08-02", now: "2026-08-02" });
  assert.equal(snapshot.status, "ready");
  assert.equal(snapshot.source, "dataview");
  assert.equal(snapshot.region_key, "서울특별시-강남구");
  assert.equal(snapshot.count, 2);
  assert.deepEqual(snapshot.rows.map((row) => row.case_number), ["A", "D"]);
  assert.deepEqual(snapshot.rows.map((row) => row.path), ["a.md", "d.md"]);
  assert.equal(snapshot.rows[0].address, "서울 강남구");
  assert.equal(snapshot.freshness.status, "fresh");
  assert.equal(JSON.stringify(rows), before);
});

test("Region snapshot exposes empty state when the Dataview result has no matching auction", () => {
  const snapshot = core.getRegionAuctionSnapshot("인천", "부평구", [{ region_sido: "인천", region_sigungu: "남동구" }]);
  assert.equal(snapshot.status, "empty");
  assert.equal(snapshot.count, 0);
  assert.deepEqual(snapshot.rows, []);
  assert.equal(snapshot.freshness.status, "unknown");
});

test("Region snapshot exposes stale state without changing the read-only rows", () => {
  const snapshot = core.getRegionAuctionSnapshot("서울", "강남구", [{ path: "a.md", region_sido: "서울", region_sigungu: "강남구", status: "watching" }], { observedAt: "2026-06-01", now: "2026-08-02", maxAgeDays: 30 });
  assert.equal(snapshot.status, "stale");
  assert.equal(snapshot.freshness.status, "stale");
  assert.equal(snapshot.count, 1);
  assert.equal(snapshot.rows[0].status, "watching");
});
