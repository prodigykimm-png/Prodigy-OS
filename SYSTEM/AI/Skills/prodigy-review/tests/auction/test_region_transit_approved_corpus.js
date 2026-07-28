"use strict";

/**
 * test_region_transit_approved_corpus.js
 *
 * Covers: the 22 grandfathered baseline hashes are preserved, and only the
 * accepted Incheon/Busan station rows reach Region inputs.
 */

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const {
  GRANDFATHERED_BASELINE,
  verifyApprovedCorpus,
  getAcceptedStationRows
} = require("../../../../../SCRIPTS/region-transit-approved-corpus-import.js");

// Vault root is five levels up from this test file.
const VAULT_ROOT = path.resolve(__dirname, "../../../../../..");

test("exactly 22 grandfathered packages are frozen (15 Busan + 7 Incheon)", function() {
  assert.equal(GRANDFATHERED_BASELINE.length, 22);
  const busan = GRANDFATHERED_BASELINE.filter(function(e) { return e.path.includes("busan-metro"); });
  const incheon = GRANDFATHERED_BASELINE.filter(function(e) { return e.path.includes("incheon-metro"); });
  assert.equal(busan.length, 15);
  assert.equal(incheon.length, 7);
});

test("every baseline entry has a 64-hex SHA-256", function() {
  for (const entry of GRANDFATHERED_BASELINE) {
    assert.match(entry.sha256, /^[a-f0-9]{64}$/);
    assert.ok(entry.path.length > 0);
  }
});

test("all 22 packages verify against on-disk bytes with accepted_legacy status", function() {
  const report = verifyApprovedCorpus(VAULT_ROOT);
  assert.equal(report.total_packages, 22);
  assert.equal(report.network_dispatched, 0);
  assert.equal(report.all_valid, true, "corpus verification must pass: " + JSON.stringify(report.packages.filter(function(p) { return !p.ok; })));
  for (const pkg of report.packages) {
    assert.equal(pkg.status, "accepted_legacy");
    assert.equal(pkg.ok, true);
  }
});

test("accepted station rows come only from Incheon/Busan providers", function() {
  const rows = getAcceptedStationRows(VAULT_ROOT);
  assert.ok(rows.length > 0);
  for (const row of rows) {
    assert.ok(row.provider === "incheon-metro" || row.provider === "busan-metro", "unexpected provider: " + row.provider);
    assert.ok(row.region_key.startsWith("인천광역시-") || row.region_key.startsWith("부산광역시-"), "unexpected region: " + row.region_key);
    assert.match(row.package_sha256, /^[a-f0-9]{64}$/);
  }
});

test("no Seoul/Gyeonggi/candidate provider reaches accepted rows", function() {
  const rows = getAcceptedStationRows(VAULT_ROOT);
  const providers = new Set(rows.map(function(r) { return r.provider; }));
  assert.ok(!providers.has("seoul-metro"));
  assert.ok(!providers.has("korail-station-candidate"));
  assert.ok(!providers.has("kric-station-candidate"));
  // Only the two accepted_legacy providers may appear.
  for (const p of providers) {
    assert.ok(p === "incheon-metro" || p === "busan-metro");
  }
});
