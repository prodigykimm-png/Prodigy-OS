"use strict";

const assert = require("node:assert/strict");
const core = require("./auction-key-value-core.js");

const csv = `물건종류,소재지,대지권,건물면적,낙찰가,매각기일\n오피스텔,"부산광역시 해운대구 우동 1, 테스트빌 2층 201호",3.2㎡,33.05785㎡,100000000,2026.08.01\n`;
const [record] = core.parseAuctCsv(csv, { sourceFile: "sample.csv" });
assert.equal(record.property_type, "오피스텔");
assert.equal(record.area_sqm, 33.05785);
assert.equal(record.price_won, 100000000);
assert.equal(record.won_per_pyeong, 10000000);
assert.equal(record.legal_dong, "우동");
assert.equal(record.building_key, "부산광역시 해운대구 우동 1|테스트빌");
assert.match(record.record_id, /^[a-f0-9]{64}$/);

assert.equal(core.eligibility({ ...record, won_per_pyeong: 100000 }).reason, "suspicious_unit_price");
assert.equal(core.eligibility(record).eligible, true);

const cases = [
  ["A", 900], ["A", 1000], ["A", 1100],
  ["B", 1200], ["B", 1300],
  ["C", 1400], ["C", 1500]
].map(([building, unit], index) => ({
  ...record,
  record_id: String(index),
  legal_dong: "우동",
  building_key: building,
  won_per_pyeong: unit * 10000,
  auction_date: `2026-0${(index % 8) + 1}-01`
}));
const snapshot = core.buildKeyValueSnapshot(cases, { asOf: "2026-08-31", source: "AUCT CSV" });
const key = snapshot.groups["부산광역시|해운대구|우동|오피스텔"];
assert.equal(key.case_count, 7);
assert.equal(key.building_count, 3);
assert.equal(key.key_value_won_per_pyeong, 12500000);
assert.equal(key.confidence, "usable");
assert.equal(key.period_start, "2026-01-01");
assert.equal(key.period_end, "2026-07-01");

const concentrated = core.buildKeyValueSnapshot(cases.filter((row) => row.building_key === "A"), { asOf: "2026-08-31", source: "AUCT CSV" });
assert.equal(concentrated.groups["부산광역시|해운대구|우동|오피스텔"].confidence, "sample_concentrated");

assert.deepEqual(core.comparePrice(90000000, 33.05785, 10000000), {
  won_per_pyeong: 9000000,
  ratio: 0.9,
  position: "키값 근접"
});
console.log("auction key value core tests: PASS");
