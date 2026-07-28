"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "../../../../../..");
const FIXTURE_BASE = path.join(
  ROOT,
  "SYSTEM/AI/Skills/prodigy-review/tests/fixtures/region-intelligence"
);

const mois = require(path.join(ROOT, "SYSTEM/SCRIPTS/collectors/mois-households.js"));
const rone = require(path.join(ROOT, "SYSTEM/SCRIPTS/collectors/rone-market.js"));
const molitSale = require(path.join(ROOT, "SYSTEM/SCRIPTS/collectors/molit-apt-sale.js"));
const molitRent = require(path.join(ROOT, "SYSTEM/SCRIPTS/collectors/molit-apt-rent.js"));

// ---------------------------------------------------------------------------
// MOIS household adapter
// ---------------------------------------------------------------------------

describe("MOIS households adapter — pre-reform fixture 2026-05", () => {
  const fixturePath = path.join(FIXTURE_BASE, "mois_jumin_statmonth_csv/2026-05-households.csv");
  const expectedSha = "576bf4419ddebd24da4b1c917269ed298f03bd6c413213c8b3e93599462d415a";
  const result = mois.loadFixture(fixturePath, "2026-05", expectedSha);

  it("maps exactly 79 current canonical codes", () => {
    assert.equal(result.coverage_count, 79);
    assert.equal(result.total_canonical, 83);
    assert.equal(result.rows.length, 79);
  });

  it("quarantines exactly three predecessor codes", () => {
    assert.equal(result.quarantined.length, 3);
    const codes = result.quarantined.map((q) => q.code).sort();
    assert.deepEqual(codes, ["2811000000", "2814000000", "2826000000"]);
    for (const q of result.quarantined) {
      assert.equal(q.reason, "predecessor_code");
    }
  });

  it("reports four successor Regions as blocked_coverage", () => {
    assert.equal(result.blocked_coverage.length, 4);
    const codes = result.blocked_coverage.map((b) => b.code).sort();
    assert.deepEqual(codes, ["2812500000", "2815500000", "2827500000", "2829000000"]);
    for (const b of result.blocked_coverage) {
      assert.equal(b.status, "blocked_coverage");
      assert.equal(b.reason, "successor_code_absent_in_period");
    }
  });

  it("has status normalized", () => {
    assert.equal(result.status, "normalized");
  });

  it("dispatches zero network", () => {
    assert.equal(result.network_dispatched, false);
    assert.equal(result.request_count, 0);
  });

  it("rows have valid structure", () => {
    for (const row of result.rows) {
      assert.equal(row.provider, "mois_jumin_statmonth_csv");
      assert.equal(row.period, "2026-05");
      assert.match(row.household_code, /^\d{10}$/);
      assert.equal(typeof row.households, "number");
      assert.ok(row.households > 0);
    }
  });

  it("부산 사하구 row has expected values", () => {
    const saha = result.rows.find((r) => r.household_code === "2638000000");
    assert.ok(saha, "사하구 row must exist");
    assert.equal(saha.total_population, 282633);
    assert.equal(saha.households, 139237);
  });
});

describe("MOIS households adapter — pre-reform fixture 2025-05", () => {
  const fixturePath = path.join(FIXTURE_BASE, "mois_jumin_statmonth_csv/2025-05-households.csv");
  const expectedSha = "e451385dddfb976ed6687a5750e23a8a70d51cd291c841eae0606950e8104ead";
  const result = mois.loadFixture(fixturePath, "2025-05", expectedSha);

  it("maps exactly 79 current canonical codes", () => {
    assert.equal(result.coverage_count, 79);
  });

  it("quarantines exactly three predecessor codes", () => {
    assert.equal(result.quarantined.length, 3);
  });

  it("reports four successor Regions as blocked_coverage", () => {
    assert.equal(result.blocked_coverage.length, 4);
  });
});

describe("MOIS households adapter — validation", () => {
  it("rejects invalid period format", () => {
    assert.throws(() => mois.parseMoisCsv(Buffer.from("x"), "2026/05"), /YYYY-MM/);
  });

  it("rejects non-Buffer input", () => {
    assert.throws(() => mois.parseMoisCsv("not a buffer", "2026-05"), /Buffer/);
  });

  it("rejects fixture hash mismatch", () => {
    const fixturePath = path.join(FIXTURE_BASE, "mois_jumin_statmonth_csv/2026-05-households.csv");
    assert.throws(
      () => mois.loadFixture(fixturePath, "2026-05", "0000000000000000000000000000000000000000000000000000000000000000"),
      /hash mismatch/
    );
  });

  it("rejects CSV with wrong header columns", () => {
    const decoder = new TextDecoder("euc-kr");
    // Create a minimal EUC-KR CSV with wrong header
    const encoder = new TextEncoder();
    // We can't easily encode EUC-KR, so test with a valid-shaped but wrong-column buffer
    const badCsv = Buffer.from('"wrong","header"\n"a","b"\n', "utf8");
    assert.throws(() => mois.parseMoisCsv(badCsv, "2026-05"), /header validation failed/);
  });

  it("adapterState reports fixture_only with zero network", () => {
    const state = mois.adapterState();
    assert.equal(state.provider, "mois_jumin_statmonth_csv");
    assert.equal(state.status, "fixture_only");
    assert.equal(state.network_allowed, false);
    assert.equal(state.network_dispatched, false);
    assert.equal(state.request_count, 0);
  });
});

// ---------------------------------------------------------------------------
// R-ONE market adapter
// ---------------------------------------------------------------------------

describe("R-ONE market adapter — parser fixtures", () => {
  const base = path.join(FIXTURE_BASE, "reb_rone_public_table");

  it("price fixture parses correctly", () => {
    const result = rone.loadFixture(
      path.join(base, "2026-05-price-sahagu.json"),
      "price",
      "40dd9f8fdb6b955f664b8367f3afb91309de930d28f5277eaba66b6236478842"
    );
    assert.equal(result.status, "parsed");
    assert.equal(result.measure, "price_index");
    assert.equal(result.table_id, "A_2024_00554");
    assert.equal(result.rows.length, 1);
    assert.equal(result.rows[0].value, 99.57008);
    assert.equal(result.rows[0].month, "2026-05");
    assert.equal(result.rows[0].unit, "index");
    assert.equal(result.network_dispatched, false);
  });

  it("volume fixture parses correctly (multi-month window)", () => {
    const result = rone.loadFixture(
      path.join(base, "2026-03_05-volume-sahagu.json"),
      "volume",
      "485a5f75a2d076992465ab7115514e2b08b31e597fa6663896e335aca69998a0"
    );
    assert.equal(result.status, "parsed");
    assert.equal(result.measure, "transaction_volume");
    assert.equal(result.table_id, "A_2024_00045");
    assert.equal(result.rows.length, 3);
    // Sorted by month descending in fixture
    const months = result.rows.map((r) => r.month);
    assert.deepEqual(months, ["2026-05", "2026-04", "2026-03"]);
    const values = result.rows.map((r) => r.value);
    assert.deepEqual(values, [219, 274, 315]);
    assert.equal(result.network_dispatched, false);
  });

  it("jeonse fixture parses correctly", () => {
    const result = rone.loadFixture(
      path.join(base, "2026-05-jeonse-sahagu.json"),
      "jeonse",
      "21953cc9241445b13ad7d06d5dce81c1c60942fd6ad87d274bc37b77f39f97fd"
    );
    assert.equal(result.status, "parsed");
    assert.equal(result.measure, "jeonse_ratio");
    assert.equal(result.table_id, "A_2024_00073");
    assert.equal(result.rows.length, 1);
    assert.equal(result.rows[0].value, 76.05634);
    assert.equal(result.rows[0].month, "2026-05");
    assert.equal(result.rows[0].unit, "%");
    assert.equal(result.network_dispatched, false);
  });

  it("does not change blocked_coverage status", () => {
    const state = rone.adapterState();
    assert.equal(state.status, "blocked_coverage");
    assert.equal(state.network_allowed, false);
    assert.equal(state.network_dispatched, false);
    assert.equal(state.request_count, 0);
  });

  it("rejects fixture hash mismatch", () => {
    assert.throws(
      () =>
        rone.loadFixture(
          path.join(base, "2026-05-price-sahagu.json"),
          "price",
          "0000000000000000000000000000000000000000000000000000000000000000"
        ),
      /hash mismatch/
    );
  });

  it("rejects unknown fixture kind", () => {
    assert.throws(
      () => rone.loadFixture(path.join(base, "2026-05-price-sahagu.json"), "unknown"),
      /unknown fixture kind/
    );
  });

  it("rejects invalid envelope", () => {
    assert.throws(() => rone.parsePriceFixture({ DATA: "not array" }), /DATA array/);
    assert.throws(() => rone.parsePriceFixture({ DATA: [], RESULT: { CODE: 1 } }), /RESULT.CODE/);
  });
});

// ---------------------------------------------------------------------------
// MOLIT sale adapter (fail-closed)
// ---------------------------------------------------------------------------

describe("MOLIT apt sale adapter — fail-closed", () => {
  it("adapterState reports blocked_fixture with zero network", () => {
    const state = molitSale.adapterState();
    assert.equal(state.provider, "molit_apt_sale");
    assert.equal(state.registry_status, "blocked_fixture");
    assert.equal(state.status, "blocked_fixture");
    assert.equal(state.network_allowed, false);
    assert.equal(state.network_dispatched, false);
    assert.equal(state.request_count, 0);
    assert.equal(state.gate.transport_missing, true);
    assert.equal(state.gate.fixture_missing, true);
  });

  it("buildRequest returns blocked receipt with null request", () => {
    const receipt = molitSale.buildRequest();
    assert.equal(receipt.status, "blocked_fixture");
    assert.equal(receipt.request, null);
    assert.equal(receipt.network_dispatched, false);
    assert.ok(receipt.gate.transport_missing_reason.length > 0);
    assert.ok(receipt.gate.fixture_missing_reason.length > 0);
  });

  it("dispatch returns zero network and empty rows", () => {
    const receipt = molitSale.dispatch();
    assert.equal(receipt.network_dispatched, false);
    assert.equal(receipt.request_count, 0);
    assert.equal(receipt.rows.length, 0);
    assert.ok(receipt.error.includes("forbidden"));
  });

  it("parseResponse returns zero network and empty rows", () => {
    const receipt = molitSale.parseResponse();
    assert.equal(receipt.network_dispatched, false);
    assert.equal(receipt.rows.length, 0);
    assert.ok(receipt.error.includes("not implemented"));
  });

  it("external comparables unavailable and never estimated", () => {
    const ext = molitSale.externalComparablesAvailable();
    assert.equal(ext.available, false);
    assert.equal(ext.label, "정보 확인 불가");
    assert.equal(ext.estimated, false);
  });

  it("does not leak ServiceKey", () => {
    const json = JSON.stringify(molitSale.adapterState());
    assert.ok(!json.includes("ServiceKey="));
    assert.ok(!/[A-Za-z0-9+/]{20,}={0,2}/.test(json.replace(/https?:\/\/[^\s"]+/g, "")));
  });
});

// ---------------------------------------------------------------------------
// MOLIT rent adapter (fail-closed)
// ---------------------------------------------------------------------------

describe("MOLIT apt rent adapter — fail-closed", () => {
  it("adapterState reports blocked_fixture with zero network", () => {
    const state = molitRent.adapterState();
    assert.equal(state.provider, "molit_apt_rent");
    assert.equal(state.registry_status, "blocked_fixture");
    assert.equal(state.status, "blocked_fixture");
    assert.equal(state.network_allowed, false);
    assert.equal(state.network_dispatched, false);
    assert.equal(state.request_count, 0);
  });

  it("dispatch returns zero network and empty rows", () => {
    const receipt = molitRent.dispatch();
    assert.equal(receipt.network_dispatched, false);
    assert.equal(receipt.request_count, 0);
    assert.equal(receipt.rows.length, 0);
  });

  it("external comparables unavailable and never estimated", () => {
    const ext = molitRent.externalComparablesAvailable();
    assert.equal(ext.available, false);
    assert.equal(ext.label, "정보 확인 불가");
    assert.equal(ext.estimated, false);
  });

  it("does not leak ServiceKey", () => {
    const json = JSON.stringify(molitRent.adapterState());
    assert.ok(!json.includes("ServiceKey="));
  });
});
