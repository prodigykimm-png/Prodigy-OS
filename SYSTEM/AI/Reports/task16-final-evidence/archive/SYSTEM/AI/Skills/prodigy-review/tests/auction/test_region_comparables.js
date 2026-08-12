"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "../../../../../..");
const comp = require(path.join(ROOT, "SYSTEM/SCRIPTS/region-comparable-core.js"));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mkCase(overrides) {
  return Object.assign(
    {
      id: "case-1",
      path: "PARA/Auction/case-1.md",
      region_key: "부산광역시-사하구",
      property_type: "아파트",
      exclusive_area: 84.5,
      auction_outcome: "won",
      winning_bid_price: 250000000,
      auction_result_date: "2026-03-15",
    },
    overrides
  );
}

const TARGET = {
  region_key: "부산광역시-사하구",
  property_type: "아파트",
  exclusive_area: 84.5,
};

const AS_OF = "2026-07-01";

// ---------------------------------------------------------------------------
// Internal comparables — core rules
// ---------------------------------------------------------------------------

describe("region-comparable-core — internal comparables", () => {
  it("returns exact region/type/area/window match", () => {
    const candidates = [mkCase({ id: "c1", path: "p/c1.md" })];
    const rows = comp.internalComparables(TARGET, candidates, { as_of: AS_OF });
    assert.equal(rows.length, 1);
    assert.equal(rows[0].id, "c1");
    assert.equal(rows[0].result_date, "2026-03-15");
  });

  it("rejects different region_key", () => {
    const candidates = [mkCase({ id: "c1", path: "p/c1.md", region_key: "부산광역시-사상구" })];
    const rows = comp.internalComparables(TARGET, candidates, { as_of: AS_OF });
    assert.equal(rows.length, 0);
  });

  it("matches equivalent property type aliases (아파트 == apartment)", () => {
    const candidates = [mkCase({ id: "c1", path: "p/c1.md", property_type: "apartment" })];
    const rows = comp.internalComparables(TARGET, candidates, { as_of: AS_OF });
    assert.equal(rows.length, 1);
  });

  it("rejects different mapped property type", () => {
    const candidates = [mkCase({ id: "c1", path: "p/c1.md", property_type: "오피스텔" })];
    const rows = comp.internalComparables(TARGET, candidates, { as_of: AS_OF });
    assert.equal(rows.length, 0);
  });

  it("rejects unmapped property type on target", () => {
    const rows = comp.internalComparables(
      Object.assign({}, TARGET, { property_type: "공장" }),
      [mkCase({ id: "c1", path: "p/c1.md" })],
      { as_of: AS_OF }
    );
    assert.equal(rows.length, 0);
  });

  it("accepts area difference exactly at 0.20 boundary", () => {
    // target 84.5, candidate 84.5 * 1.20 = 101.4 -> diff exactly 0.20
    const candidates = [mkCase({ id: "c1", path: "p/c1.md", exclusive_area: 84.5 * 1.2 })];
    const rows = comp.internalComparables(TARGET, candidates, { as_of: AS_OF });
    assert.equal(rows.length, 1);
  });

  it("rejects area difference above 0.20", () => {
    const candidates = [mkCase({ id: "c1", path: "p/c1.md", exclusive_area: 84.5 * 1.21 })];
    const rows = comp.internalComparables(TARGET, candidates, { as_of: AS_OF });
    assert.equal(rows.length, 0);
  });

  it("rejects non-positive exclusive_area", () => {
    const rows = comp.internalComparables(
      Object.assign({}, TARGET, { exclusive_area: 0 }),
      [mkCase({ id: "c1", path: "p/c1.md" })],
      { as_of: AS_OF }
    );
    assert.equal(rows.length, 0);
  });

  it("requires valid outcome with positive winning price", () => {
    const noOutcome = mkCase({ id: "c1", path: "p/c1.md", auction_outcome: "" });
    const noPrice = mkCase({ id: "c2", path: "p/c2.md", winning_bid_price: 0 });
    const rows = comp.internalComparables(TARGET, [noOutcome, noPrice], { as_of: AS_OF });
    assert.equal(rows.length, 0);
  });

  it("accepts result date at window start (12 months inclusive)", () => {
    // as_of 2026-07-01 -> window start 2025-07-01
    const candidates = [mkCase({ id: "c1", path: "p/c1.md", auction_result_date: "2025-07-01" })];
    const rows = comp.internalComparables(TARGET, candidates, { as_of: AS_OF });
    assert.equal(rows.length, 1);
  });

  it("accepts result date at as_of (inclusive)", () => {
    const candidates = [mkCase({ id: "c1", path: "p/c1.md", auction_result_date: "2026-07-01" })];
    const rows = comp.internalComparables(TARGET, candidates, { as_of: AS_OF });
    assert.equal(rows.length, 1);
  });

  it("rejects result date before window start", () => {
    const candidates = [mkCase({ id: "c1", path: "p/c1.md", auction_result_date: "2025-06-30" })];
    const rows = comp.internalComparables(TARGET, candidates, { as_of: AS_OF });
    assert.equal(rows.length, 0);
  });

  it("rejects result date after as_of", () => {
    const candidates = [mkCase({ id: "c1", path: "p/c1.md", auction_result_date: "2026-07-02" })];
    const rows = comp.internalComparables(TARGET, candidates, { as_of: AS_OF });
    assert.equal(rows.length, 0);
  });

  it("clamps leap-day window start (2024-02-29 -> 2023-02-28)", () => {
    assert.equal(comp.subtract12Months("2024-02-29"), "2023-02-28");
  });

  it("returns empty without as_of", () => {
    const rows = comp.internalComparables(TARGET, [mkCase({ id: "c1", path: "p/c1.md" })], {});
    assert.equal(rows.length, 0);
  });
});

// ---------------------------------------------------------------------------
// Deduplication
// ---------------------------------------------------------------------------

describe("region-comparable-core — deduplication", () => {
  it("excludes duplicate ids", () => {
    const candidates = [
      mkCase({ id: "dup", path: "p/a.md" }),
      mkCase({ id: "dup", path: "p/b.md" }),
    ];
    const rows = comp.internalComparables(TARGET, candidates, { as_of: AS_OF });
    assert.equal(rows.length, 0);
  });

  it("excludes duplicate paths", () => {
    const candidates = [
      mkCase({ id: "a", path: "p/same.md" }),
      mkCase({ id: "b", path: "p/same.md" }),
    ];
    const rows = comp.internalComparables(TARGET, candidates, { as_of: AS_OF });
    assert.equal(rows.length, 0);
  });

  it("keeps unique eligible cases", () => {
    const candidates = [
      mkCase({ id: "a", path: "p/a.md" }),
      mkCase({ id: "b", path: "p/b.md" }),
    ];
    const rows = comp.internalComparables(TARGET, candidates, { as_of: AS_OF });
    assert.equal(rows.length, 2);
  });
});

// ---------------------------------------------------------------------------
// Sorting
// ---------------------------------------------------------------------------

describe("region-comparable-core — sorting", () => {
  it("sorts by date desc, area delta asc, id asc", () => {
    const candidates = [
      mkCase({ id: "z", path: "p/z.md", auction_result_date: "2026-01-01", exclusive_area: 84.5 }),
      mkCase({ id: "a", path: "p/a.md", auction_result_date: "2026-05-01", exclusive_area: 90 }),
      mkCase({ id: "m", path: "p/m.md", auction_result_date: "2026-05-01", exclusive_area: 84.5 }),
    ];
    const rows = comp.internalComparables(TARGET, candidates, { as_of: AS_OF });
    assert.equal(rows.length, 3);
    // 2026-05-01 rows first; among them area delta asc: m (0) before a (5.5)
    assert.equal(rows[0].id, "m");
    assert.equal(rows[1].id, "a");
    assert.equal(rows[2].id, "z");
  });
});

// ---------------------------------------------------------------------------
// Incheon code-era rule
// ---------------------------------------------------------------------------

describe("region-comparable-core — Incheon code-era rule", () => {
  const successorTarget = {
    region_key: "인천광역시-제물포구",
    property_type: "아파트",
    exclusive_area: 84.5,
  };

  it("successor district row unavailable before 2026-07-01", () => {
    const candidates = [
      mkCase({
        id: "c1",
        path: "p/c1.md",
        region_key: "인천광역시-제물포구",
        auction_result_date: "2026-06-30",
      }),
    ];
    const rows = comp.internalComparables(successorTarget, candidates, { as_of: "2026-07-15" });
    assert.equal(rows.length, 0);
  });

  it("successor district row available on/after 2026-07-01", () => {
    const candidates = [
      mkCase({
        id: "c1",
        path: "p/c1.md",
        region_key: "인천광역시-제물포구",
        auction_result_date: "2026-07-01",
      }),
    ];
    const rows = comp.internalComparables(successorTarget, candidates, { as_of: "2026-07-15" });
    assert.equal(rows.length, 1);
  });

  it("unchanged Incheon district eligible before reform date", () => {
    const unchangedTarget = {
      region_key: "인천광역시-미추홀구",
      property_type: "아파트",
      exclusive_area: 84.5,
    };
    const candidates = [
      mkCase({
        id: "c1",
        path: "p/c1.md",
        region_key: "인천광역시-미추홀구",
        auction_result_date: "2026-06-30",
      }),
    ];
    const rows = comp.internalComparables(unchangedTarget, candidates, { as_of: "2026-07-15" });
    assert.equal(rows.length, 1);
  });

  it("code era is chosen from result date, not as_of/fetch date", () => {
    // as_of is after reform, but the candidate result date is before reform:
    // a successor row must still be excluded because era comes from result date.
    const candidates = [
      mkCase({
        id: "c1",
        path: "p/c1.md",
        region_key: "인천광역시-검단구",
        auction_result_date: "2026-05-01",
      }),
    ];
    const rows = comp.internalComparables(
      { region_key: "인천광역시-검단구", property_type: "아파트", exclusive_area: 84.5 },
      candidates,
      { as_of: "2026-08-01" }
    );
    assert.equal(rows.length, 0);
  });

  it("incheonCodeEraEligibility reports successor unavailable before reform", () => {
    const check = comp.incheonCodeEraEligibility("인천광역시-서해구", "2026-06-30");
    assert.equal(check.eligible, false);
    assert.match(check.reason, /incheon_code_era/);
  });

  it("incheonCodeEraEligibility reports non-successor always eligible", () => {
    const check = comp.incheonCodeEraEligibility("부산광역시-사하구", "2020-01-01");
    assert.equal(check.eligible, true);
    assert.equal(check.reason, null);
  });

  it("lists exactly four successor regions and seven unchanged", () => {
    assert.equal(comp.INCHEON_SUCCESSOR_REGIONS.length, 4);
    assert.equal(comp.INCHEON_UNCHANGED_REGIONS.length, 7);
    assert.equal(comp.INCHEON_REFORM_DATE, "2026-07-01");
  });
});

// ---------------------------------------------------------------------------
// External comparables (MOLIT) — unavailable
// ---------------------------------------------------------------------------

describe("region-comparable-core — external comparables", () => {
  it("external comparables are unavailable", () => {
    const ext = comp.externalComparables(TARGET, { as_of: AS_OF });
    assert.equal(ext.available, false);
    assert.equal(ext.label, "정보 확인 불가");
    assert.equal(ext.estimated, false);
    assert.equal(ext.rows.length, 0);
    assert.ok(ext.providers.includes("molit_apt_sale"));
    assert.ok(ext.providers.includes("molit_apt_rent"));
  });

  it("never estimates a price", () => {
    const ext = comp.externalComparables(TARGET, { as_of: AS_OF });
    assert.equal(ext.estimated, false);
    const json = JSON.stringify(ext);
    assert.ok(!/estimate/i.test(json) || /"estimated":false/.test(json));
  });
});
