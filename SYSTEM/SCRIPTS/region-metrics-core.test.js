"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const { TextDecoder } = require("node:util");
const core = require("./region-metrics-core.js");

const fixturePath = "SYSTEM/AI/Skills/prodigy-review/tests/fixtures/region-intelligence/mois_jumin_statmonth_csv/2026-05-households.csv";
const text = new TextDecoder("euc-kr").decode(fs.readFileSync(fixturePath));
const population = core.parseMoisPopulationCsv(text, "서울특별시  (1100000000)", "202605");

assert.deepEqual(population, {
  total_population: 9295082,
  households: 4523540,
  male_population: 4475263,
  female_population: 4819819
});
assert.equal(core.parseHouseholdsCsv(text, "서울특별시  (1100000000)", "202605"), 4523540);
assert.throws(() => core.parseMoisPopulationCsv(text, "없는 지역", "202605"), /정확히 1개/);

assert.deepEqual(core.calculatePopulationChange(
  { month: "202605", total_population: 9295082, households: 4523540 },
  { month: "202505", total_population: 9350000, households: 4500000 }
), {
  population_change_count: -54918,
  population_change_yoy: -0.587358,
  household_change_count: 23540,
  household_change_yoy: 0.523111
});
assert.equal(core.classifyDemographicSignal({ population_change_yoy: 0.2, household_change_yoy: 0.3 }), "인구·가구 확대");
assert.equal(core.classifyDemographicSignal({ population_change_yoy: -0.2, household_change_yoy: 0.3 }), "가구 분화");
assert.equal(core.classifyDemographicSignal({ population_change_yoy: -0.2, household_change_yoy: -0.3 }), "동반 축소");
assert.equal(core.classifyDemographicSignal({ population_change_yoy: 0.05, household_change_yoy: -0.05 }), "정체");
assert.equal(core.classifyDemographicSignal({ population_change_yoy: null, household_change_yoy: 0.2 }), "자료 부족");
assert.throws(() => core.calculatePopulationChange(
  { month: "202605", total_population: 1, households: 1 },
  { month: "202504", total_population: 1, households: 1 }
), /정확한 전년 동월/);

console.log("region metrics core tests: PASS");
