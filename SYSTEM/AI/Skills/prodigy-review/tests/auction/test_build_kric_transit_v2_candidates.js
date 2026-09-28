"use strict";

const assert = require("node:assert/strict");
const { sameStation, enforceQuarantineSchema, QUARANTINE_SCHEMA } = require("../../../../../SCRIPTS/build-kric-transit-v2-candidates.js");

const station = {
  station_code: "1", line_code: "A", station_name: "시험역", line_name: "시험선",
  operator: "시험기관", official_address: "서울특별시 종로구 시험로 1", lat: 37.57, lng: 126.98
};
assert.equal(sameStation(station, { ...station }), true);
assert.equal(sameStation(station, { ...station, station_name: "별칭역" }), false);

const quarantined = { status: QUARANTINE_SCHEMA.status, network_allowed: false, region_inputs_reachable: false };
assert.equal(enforceQuarantineSchema(quarantined), true);
assert.throws(() => enforceQuarantineSchema({ ...quarantined, network_allowed: true }), /network_allowed/);
assert.throws(() => enforceQuarantineSchema({ ...quarantined, region_inputs_reachable: true }), /region_inputs_reachable/);
assert.throws(() => enforceQuarantineSchema({ ...quarantined, status: "publishable" }), /status/);
for (const key of ["status", "network_allowed", "region_inputs_reachable"]) {
  const missing = { ...quarantined };
  delete missing[key];
  assert.throws(() => enforceQuarantineSchema(missing), new RegExp(key), "격리 필드가 빠져도 통과하면 안 된다");
}
console.log("KRIC transit v2 candidate builder tests passed");
