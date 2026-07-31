"use strict";

/**
 * test_region_transit_approved_corpus.js
 *
 * Covers: the 22 grandfathered baseline hashes are preserved, and only the
 * accepted Incheon/Busan station rows reach Region inputs.
 */

const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const {
  GRANDFATHERED_BASELINE,
  verifyApprovedCorpus,
  getAcceptedStationRows
} = require("../../../../../SCRIPTS/region-transit-approved-corpus-import.js");

const ORIGINAL_HASHES = GRANDFATHERED_BASELINE.map(function(entry) { return entry.sha256; });

function sha256(content) {
  return crypto.createHash("sha256").update(content).digest("hex");
}

function withSyntheticCorpus(run) {
  const vaultRoot = fs.mkdtempSync(path.join(os.tmpdir(), "prodigy-region-transit-corpus-"));
  try {
    GRANDFATHERED_BASELINE.forEach(function(entry) {
      const provider = entry.path.includes("incheon-metro") ? "incheon-metro" : "busan-metro";
      const regionKey = entry.path.split("/").at(-2);
      const content = Buffer.from(JSON.stringify({
        schema_version: 1,
        region_key: regionKey,
        provider,
        stations: [{
          station_name: `${regionKey}-역`,
          station_no: "001",
          line_name: provider === "incheon-metro" ? "인천선" : "부산선",
          raw_path: `raw/${provider}.json`,
          raw_sha256: sha256(Buffer.from(`${provider}:${regionKey}`, "utf8")),
        }],
      }), "utf8");
      const absolutePath = path.join(vaultRoot, entry.path);
      fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
      fs.writeFileSync(absolutePath, content);
      entry.sha256 = sha256(content);
    });
    return run(vaultRoot);
  } finally {
    GRANDFATHERED_BASELINE.forEach(function(entry, index) {
      entry.sha256 = ORIGINAL_HASHES[index];
    });
    fs.rmSync(vaultRoot, { recursive: true, force: true });
  }
}

test("exactly 22 grandfathered packages are frozen (15 Busan + 7 Incheon)", function() {
  assert.equal(GRANDFATHERED_BASELINE.length, 22);
  const busan = GRANDFATHERED_BASELINE.filter(function(e) { return e.path.includes("busan-metro"); });
  const incheon = GRANDFATHERED_BASELINE.filter(function(e) { return e.path.includes("incheon-metro"); });
  assert.equal(busan.length, 15);
  assert.equal(incheon.length, 7);
});

test("every baseline entry has a 64-hex SHA-256", function() {
  GRANDFATHERED_BASELINE.forEach(function(entry, index) {
    assert.match(entry.sha256, /^[a-f0-9]{64}$/);
    assert.equal(entry.sha256, ORIGINAL_HASHES[index]);
    assert.ok(entry.path.length > 0);
  });
});

test("all 22 packages verify against on-disk bytes with accepted_legacy status", function() {
  withSyntheticCorpus(function(vaultRoot) {
    const report = verifyApprovedCorpus(vaultRoot);
    assert.ok(report.vault_root.startsWith(os.tmpdir()));
    assert.ok(!report.vault_root.includes("Mobile Documents"));
    assert.equal(report.total_packages, 22);
    assert.equal(report.network_dispatched, 0);
    assert.equal(report.all_valid, true, "corpus verification must pass: " + JSON.stringify(report.packages.filter(function(p) { return !p.ok; })));
    for (const pkg of report.packages) {
      assert.equal(pkg.status, "accepted_legacy");
      assert.equal(pkg.ok, true);
    }
  });
});

test("accepted station rows come only from Incheon/Busan providers", function() {
  withSyntheticCorpus(function(vaultRoot) {
    const rows = getAcceptedStationRows(vaultRoot);
    assert.ok(rows.length > 0);
    for (const row of rows) {
      assert.ok(row.provider === "incheon-metro" || row.provider === "busan-metro", "unexpected provider: " + row.provider);
      assert.ok(row.region_key.startsWith("인천광역시-") || row.region_key.startsWith("부산광역시-"), "unexpected region: " + row.region_key);
      assert.match(row.package_sha256, /^[a-f0-9]{64}$/);
    }
  });
});

test("no Seoul/Gyeonggi/candidate provider reaches accepted rows", function() {
  withSyntheticCorpus(function(vaultRoot) {
    const rows = getAcceptedStationRows(vaultRoot);
    const providers = new Set(rows.map(function(r) { return r.provider; }));
    assert.ok(!providers.has("seoul-metro"));
    assert.ok(!providers.has("korail-station-candidate"));
    assert.ok(!providers.has("kric-station-candidate"));
    // Only the two accepted_legacy providers may appear.
    for (const p of providers) {
      assert.ok(p === "incheon-metro" || p === "busan-metro");
    }
  });
});

test("a missing synthetic package fails closed without reading another root", function() {
  withSyntheticCorpus(function(vaultRoot) {
    const entry = GRANDFATHERED_BASELINE[0];
    const absolutePath = path.join(vaultRoot, entry.path);
    fs.rmSync(absolutePath);
    const report = verifyApprovedCorpus(vaultRoot);
    const missing = report.packages.find(function(pkg) { return pkg.path === entry.path; });
    assert.equal(report.all_valid, false);
    assert.equal(missing.status, "missing");
    assert.equal(missing.ok, false);
    assert.throws(
      function() { getAcceptedStationRows(vaultRoot); },
      /corpus verification failed/
    );
  });
});
