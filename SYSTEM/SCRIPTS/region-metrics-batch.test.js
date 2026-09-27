"use strict";

const assert = require("node:assert/strict");
const batch = require("./region-metrics-batch.js");

const base = {
  region_key: "광주광역시-동구",
  region_prefix: "광주광역시 동구",
  lawd_code: "12210000",
  household_code: "1221000000"
};
const options = {
  execute: true,
  stockCsv: "stock.csv",
  stockAsOf: "2025-09",
  supplyCsv: "supply.csv",
  supplyBasis: "2025-12",
  output: "out"
};

function valueAfter(args, flag) {
  return args[args.indexOf(flag) + 1];
}

const derived = batch.buildRefreshArgs({ ...base, title: "광주광역시 동구" }, options);
assert.equal(valueAfter(derived, "--household-row"), "광주광역시 동구 (1221000000)");

const overridden = batch.buildRefreshArgs({
  ...base,
  title: "광주광역시 동구",
  household_row_override: "전남광주통합특별시 동구 (1221000000)"
}, options);
assert.equal(valueAfter(overridden, "--household-row"), "전남광주통합특별시 동구 (1221000000)");

const withStockPrefix = batch.buildRefreshArgs({
  ...base,
  title: "세종특별자치시 세종시",
  stock_region_prefix: "세종특별자치시"
}, options);
assert.equal(valueAfter(withStockPrefix, "--stock-region-prefix"), "세종특별자치시");

assert.equal(batch.buildRefreshArgs({ ...base, title: "광주광역시 동구" }, { ...options, execute: false }), null);

console.log("region metrics batch tests: PASS");
