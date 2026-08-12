"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "../../../../../..");
const core = require(path.join(ROOT, "SYSTEM/SCRIPTS/region-metrics-core.js"));

function raw(data) {
  return Buffer.from(JSON.stringify({ DATA: [data], RESULT: { CODE: 0 } }), "utf8");
}

function main() {
  const volumeSeries = core.parseRoneSeries(
    raw({
      CATE1: "부산",
      CATE2: "금정구",
      COL_202605100001OD: "132",
      COL_202604100001OD: "125",
      COL_202603100001OD: "178"
    }),
    ["부산", "금정구"]
  );
  assert.deepEqual(volumeSeries, [
    { month: "202603", value: 178 },
    { month: "202604", value: 125 },
    { month: "202605", value: 132 }
  ]);
  assert.deepEqual(core.summarizeVolume(volumeSeries), {
    asOf: "202605",
    months: ["202603", "202604", "202605"],
    value: 435
  });

  const priceCurrent = core.parseRoneSeries(
    raw({ CATE1: "부산", CATE2: "동부산권", CATE3: "금정구", COL_202605100001OD: "99.47534" }),
    ["부산", "동부산권", "금정구"]
  )[0];
  const pricePrevious = core.parseRoneSeries(
    raw({ CATE1: "부산", CATE2: "동부산권", CATE3: "금정구", COL_202505100001OD: "100.42019" }),
    ["부산", "동부산권", "금정구"]
  )[0];
  assert.equal(core.calculateYoY(priceCurrent, pricePrevious), -0.940896);
  assert.equal(core.calculateTurnover(435, 48544), 0.03584377);

  const stock = core.parseStockCsv(
    "주소,단지종류,세대수\n부산광역시 금정구 A,1,100\n부산광역시 금정구 B,2,20\n서울특별시 C,1,50\n",
    "부산광역시 금정구"
  );
  assert.deepEqual(stock, { matchedRows: 1, totalRows: 3, unmatchedRows: 2, value: 100 });

  const supply = core.parseSupplyCsv(
    "입주예정월,지역,사업유형,주소,아파트명,세대수\n2026-06,부산,분양,부산광역시 금정구 A,A,415\n2027-02,부산,분양,부산광역시 금정구 B,B,994\n2028-01,부산,분양,부산광역시 금정구 C,C,10\n",
    "부산광역시 금정구",
    "2025-12"
  );
  assert.deepEqual(supply, {
    matchedRows: 3,
    totalRows: 3,
    sourceMonthMin: "2026-06",
    sourceMonthMax: "2028-01",
    observedHorizonMonths: 25,
    unavailableHorizons: [36, 48, 60],
    moveIn12m: 415,
    moveIn24m: 1409,
    moveIn36m: null,
    moveIn48m: null,
    moveIn60m: null
  });

  const observedZeroSupply = core.parseSupplyCsv(
    "입주예정월,지역,사업유형,주소,아파트명,세대수\n2026-12,부산,분양,부산광역시 해운대구 A,A,120\n",
    "부산광역시 금정구",
    "2025-12"
  );
  assert.equal(observedZeroSupply.moveIn12m, 0);
  assert.equal(observedZeroSupply.moveIn24m, null);
  assert.deepEqual(observedZeroSupply.unavailableHorizons, [24, 36, 48, 60]);

  const coveredSixtyMonths = core.parseSupplyCsv(
    "입주예정월,지역,사업유형,주소,아파트명,세대수\n2026-06,부산,분양,부산광역시 금정구 A,A,100\n2027-06,부산,분양,부산광역시 금정구 B,B,200\n2028-06,부산,분양,부산광역시 금정구 C,C,300\n2029-06,부산,분양,부산광역시 금정구 D,D,400\n2030-12,부산,분양,부산광역시 금정구 E,E,500\n",
    "부산광역시 금정구",
    "2025-12"
  );
  assert.equal(coveredSixtyMonths.moveIn12m, 100);
  assert.equal(coveredSixtyMonths.moveIn24m, 300);
  assert.equal(coveredSixtyMonths.moveIn36m, 600);
  assert.equal(coveredSixtyMonths.moveIn48m, 1000);
  assert.equal(coveredSixtyMonths.moveIn60m, 1500);
  assert.deepEqual(coveredSixtyMonths.unavailableHorizons, []);

  const households = core.parseHouseholdsCsv(
    '"행정구역","2026년05월_총인구수","2026년05월_세대수"\n"부산광역시 금정구 (2641000000)","205,000","105,000"\n',
    "부산광역시 금정구 (2641000000)",
    "202605"
  );
  assert.equal(households, 105000);
  assert.equal(core.sha256(Buffer.from("abc")), "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");

  console.log("Region metrics core tests passed");
}

main();
