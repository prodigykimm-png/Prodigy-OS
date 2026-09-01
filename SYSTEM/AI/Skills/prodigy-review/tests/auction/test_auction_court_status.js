"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const ROOT = path.resolve(__dirname, "../../../../../..");
const MODULE_PATH = path.join(ROOT, "SYSTEM/Views/auction-court-status.js");

test("court status contract separates official procedure from lifecycle and personal outcome", () => {
  const court = require(MODULE_PATH);

  assert.deepEqual(court.VALID_STATUSES, [
    "scheduled",
    "failed",
    "changed",
    "suspended",
    "withdrawn",
    "sold",
    "unknown"
  ]);
  assert.equal(court.normalize("유찰"), "failed");
  assert.equal(court.normalize("취하"), "withdrawn");
  assert.equal(court.normalize("not-a-status"), "unknown");
});

test("court status projection never infers 종료 from a past date", () => {
  const court = require(MODULE_PATH);
  const now = "2026-09-01";

  assert.deepEqual(court.project({ courtStatus: "scheduled", auctionDatetime: "2026-09-05", now }), {
    status: "scheduled",
    label: "09/05 (D-4)",
    compact_label: "D-4",
    date: "2026-09-05",
    is_urgent: false,
    is_today: false,
    is_past: false
  });
  assert.equal(court.project({ courtStatus: "", auctionDatetime: "2026-08-20", now }).label, "결과 미확인");
  assert.equal(court.project({ courtStatus: "failed", auctionDatetime: "2026-09-05", now }).label, "유찰 · 다음 기일 D-4");
  assert.equal(court.project({ courtStatus: "changed", auctionDatetime: "2026-09-05", now }).label, "변경 · 새 기일 D-4");
  assert.equal(court.project({ courtStatus: "suspended", auctionDatetime: "2026-09-05", now }).label, "정지");
  assert.equal(court.project({ courtStatus: "withdrawn", auctionDatetime: "2026-08-20", now }).label, "취하");
});

test("schema, template, loader, and card consume the same court status fields", () => {
  const schema = fs.readFileSync(path.join(ROOT, "SYSTEM/Prodigy/Schema/Auction_Case_Schema.md"), "utf8");
  const template = fs.readFileSync(path.join(ROOT, "SYSTEM/TEMPLATE/FORMAT/template_auction_case.md"), "utf8");
  const manifest = fs.readFileSync(path.join(ROOT, "SYSTEM/Views/prodigy-workspace-manifest.js"), "utf8");
  const card = fs.readFileSync(path.join(ROOT, "SYSTEM/Views/auction-card.js"), "utf8");
  const displayRegistry = fs.readFileSync(path.join(ROOT, "SYSTEM/Views/display-registry.js"), "utf8");

  for (const property of ["court_status", "court_status_as_of", "court_status_note"]) {
    assert.ok(schema.includes(`\`${property}\``));
    assert.match(template, new RegExp(`^${property}:`, "m"));
    assert.match(displayRegistry, new RegExp(`${property}:`));
  }
  assert.match(schema, /scheduled[\s\S]*failed[\s\S]*changed[\s\S]*suspended[\s\S]*withdrawn[\s\S]*sold[\s\S]*unknown/);
  assert.ok(manifest.indexOf("auction-court-status.js") < manifest.indexOf("auction-card.js"));
  assert.match(card, /AuctionCourtStatus\.project/);
  assert.doesNotMatch(card, /ddayStr = "종료"/);
});
