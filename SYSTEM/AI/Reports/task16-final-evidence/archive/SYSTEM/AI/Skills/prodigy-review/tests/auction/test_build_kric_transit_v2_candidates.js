"use strict";

const assert = require("node:assert/strict");
const { sameStation } = require("../../../../../SCRIPTS/build-kric-transit-v2-candidates.js");

const station = {
  station_code: "1", line_code: "A", station_name: "시험역", line_name: "시험선",
  operator: "시험기관", official_address: "서울특별시 종로구 시험로 1", lat: 37.57, lng: 126.98
};
assert.equal(sameStation(station, { ...station }), true);
assert.equal(sameStation(station, { ...station, station_name: "별칭역" }), false);
console.log("KRIC transit v2 candidate builder tests passed");
