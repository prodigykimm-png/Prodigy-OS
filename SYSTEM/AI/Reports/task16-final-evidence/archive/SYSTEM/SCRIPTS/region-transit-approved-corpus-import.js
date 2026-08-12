"use strict";

/**
 * region-transit-approved-corpus-import.js
 *
 * Preserves the 22 grandfathered Incheon/Busan transit package hashes.
 * Verifies each package's SHA-256 against the plan's frozen baseline list.
 * Reports accepted_legacy status for each verified package.
 *
 * Safety:
 * - Read-only: never modifies package files
 * - Zero network dispatch
 * - Fails closed on any hash mismatch
 */

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

/**
 * The 22 grandfathered package baseline from the consolidation plan.
 * These are immutable inputs — future provider generations create new
 * hash-qualified packages rather than rewriting them.
 */
const GRANDFATHERED_BASELINE = Object.freeze([
  { path: "SYSTEM/CACHE/region-transit-packages/부산광역시-강서구/busan-metro_95edd6d6872f5.json", sha256: "4b2966956998e6d6ad18b3874736c6346c29c341c8dfd5d854c7eba9c8e9a623" },
  { path: "SYSTEM/CACHE/region-transit-packages/부산광역시-금정구/busan-metro_95edd6d6872f5.json", sha256: "7f5839acab818f18ad43c77b844cf82a39a905de66b8ee3b4cb56b47cd06403c" },
  { path: "SYSTEM/CACHE/region-transit-packages/부산광역시-기장군/busan-metro_95edd6d6872f5.json", sha256: "468ddabf53513f14c7ae44b045c3f161e1ad5ca05f5516886971bf7766ebd0c1" },
  { path: "SYSTEM/CACHE/region-transit-packages/부산광역시-남구/busan-metro_95edd6d6872f5.json", sha256: "09a89baa26aafb5c53c9855ddbf9c9790d813484729c0aa35209dc386463645e" },
  { path: "SYSTEM/CACHE/region-transit-packages/부산광역시-동구/busan-metro_95edd6d6872f5.json", sha256: "7ca3a98e640be123baeed58cc237ad8694d703f79dcc31e01ae009060989b8b6" },
  { path: "SYSTEM/CACHE/region-transit-packages/부산광역시-동래구/busan-metro_95edd6d6872f5.json", sha256: "352f51850decabcff3f4e450989fd035c6c6cf897c6445a9128be8bd38562e5e" },
  { path: "SYSTEM/CACHE/region-transit-packages/부산광역시-부산진구/busan-metro_95edd6d6872f5.json", sha256: "97b0da183adf2acc66a2d401c4676a79f07c1e94a1b3bb2eea10e8ef3a0b4b16" },
  { path: "SYSTEM/CACHE/region-transit-packages/부산광역시-북구/busan-metro_95edd6d6872f5.json", sha256: "076d76af36d95f212c0503aa540fc3aa6e7d9d810b0895cd09f25772d3af4cb1" },
  { path: "SYSTEM/CACHE/region-transit-packages/부산광역시-사상구/busan-metro_95edd6d6872f5.json", sha256: "c5cb2305691777afb1bd3036ba2676899a0dfdc78bbd5d42284cd6c373399d9b" },
  { path: "SYSTEM/CACHE/region-transit-packages/부산광역시-사하구/busan-metro_95edd6d6872f5.json", sha256: "1cfba70289a621fddbe29f16d8b4c61239901d84bdc99e9f692980489d09b0d8" },
  { path: "SYSTEM/CACHE/region-transit-packages/부산광역시-서구/busan-metro_95edd6d6872f5.json", sha256: "271339797bb21d0d113f57e04778176a25f8f79d52c489f2ca1df4e15f69558a" },
  { path: "SYSTEM/CACHE/region-transit-packages/부산광역시-수영구/busan-metro_95edd6d6872f5.json", sha256: "df5350eab115131295ca955132a545fffcfe2dc0495abdf22b3fde0c0bb5f20d" },
  { path: "SYSTEM/CACHE/region-transit-packages/부산광역시-연제구/busan-metro_95edd6d6872f5.json", sha256: "802aca342b59151d72297ed7c8e9feca2543bc523ec1f06dd212cd7bb7692644" },
  { path: "SYSTEM/CACHE/region-transit-packages/부산광역시-중구/busan-metro_95edd6d6872f5.json", sha256: "fa7d51ebcf1fcc9362ebe323f5c20d31dc15dcaa4ee90d03ab2f39f59a6142e0" },
  { path: "SYSTEM/CACHE/region-transit-packages/부산광역시-해운대구/busan-metro_95edd6d6872f5.json", sha256: "f8b8ed807cf9f0e69f25984f41070951ab63b3f591c82f9cc0f3b43988b183f2" },
  { path: "SYSTEM/CACHE/region-transit-packages/인천광역시-검단구/incheon-metro_95edd6d6872f5.json", sha256: "cca159a5af549462674535c05f8f1500a82c92b9aa3b1262d456d268035feebc" },
  { path: "SYSTEM/CACHE/region-transit-packages/인천광역시-계양구/incheon-metro_95edd6d6872f5.json", sha256: "fb887ffb1b6ecaa0285b2dcb3af2c31ce6a13ec2b4cc0bb2033370c657644d7c" },
  { path: "SYSTEM/CACHE/region-transit-packages/인천광역시-남동구/incheon-metro_95edd6d6872f5.json", sha256: "d0a3bbd10e982b94be62294968d4fbc543ed3f2bbb36fd048e25c95042f19e69" },
  { path: "SYSTEM/CACHE/region-transit-packages/인천광역시-미추홀구/incheon-metro_95edd6d6872f5.json", sha256: "d872fd37777328ae9a92b545362385ee611d69b4fbda8b9a04d53cbc4319f253" },
  { path: "SYSTEM/CACHE/region-transit-packages/인천광역시-부평구/incheon-metro_95edd6d6872f5.json", sha256: "d0696bbb09101fd3ffaec6c682ab652ca69d24d2d64da09d91a021de91ceea14" },
  { path: "SYSTEM/CACHE/region-transit-packages/인천광역시-서해구/incheon-metro_95edd6d6872f5.json", sha256: "08a7054e39832d1770273dc991b2d2eac0e04af07bc10c39cd62e121a3f5e46d" },
  { path: "SYSTEM/CACHE/region-transit-packages/인천광역시-연수구/incheon-metro_95edd6d6872f5.json", sha256: "97f91d37c06368a78a831b5d28c914baa2e46b8cf4a7413d69d708ffaf793196" }
]);

function sha256(buffer) {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

/**
 * Verify all 22 grandfathered packages against the frozen baseline.
 * @param {string} [vaultRoot] - Vault root path (defaults to cwd)
 * @returns {object} verification report
 */
function verifyApprovedCorpus(vaultRoot) {
  vaultRoot = vaultRoot || process.cwd();
  const results = [];
  let allValid = true;

  for (const entry of GRANDFATHERED_BASELINE) {
    const fullPath = path.resolve(vaultRoot, entry.path);
    const result = { path: entry.path, expected_sha256: entry.sha256 };

    if (!fs.existsSync(fullPath)) {
      result.status = "missing";
      result.ok = false;
      allValid = false;
      results.push(result);
      continue;
    }

    const content = fs.readFileSync(fullPath);
    const actualSha = sha256(content);
    result.actual_sha256 = actualSha;

    if (actualSha === entry.sha256) {
      result.status = "accepted_legacy";
      result.ok = true;
    } else {
      result.status = "hash_mismatch";
      result.ok = false;
      allValid = false;
    }
    results.push(result);
  }

  const busanCount = results.filter(function(r) { return r.path.includes("busan-metro"); }).length;
  const incheonCount = results.filter(function(r) { return r.path.includes("incheon-metro"); }).length;

  return {
    verified_at: new Date().toISOString(),
    vault_root: vaultRoot,
    total_packages: GRANDFATHERED_BASELINE.length,
    busan_packages: busanCount,
    incheon_packages: incheonCount,
    all_valid: allValid,
    network_dispatched: 0,
    packages: results
  };
}

/**
 * Extract the accepted station rows from verified packages.
 * Only accepted_legacy packages contribute rows to Region inputs.
 * @param {string} [vaultRoot]
 * @returns {object[]} accepted station rows
 */
function getAcceptedStationRows(vaultRoot) {
  vaultRoot = vaultRoot || process.cwd();
  const report = verifyApprovedCorpus(vaultRoot);
  if (!report.all_valid) throw new Error("cannot extract station rows: corpus verification failed");

  const rows = [];
  for (const entry of GRANDFATHERED_BASELINE) {
    const fullPath = path.resolve(vaultRoot, entry.path);
    const pkg = JSON.parse(fs.readFileSync(fullPath, "utf8"));
    for (const station of pkg.stations) {
      rows.push({
        region_key: pkg.region_key,
        provider: pkg.provider,
        station_name: station.station_name,
        station_no: station.station_no,
        line_name: station.line_name,
        raw_path: station.raw_path,
        raw_sha256: station.raw_sha256,
        package_sha256: entry.sha256
      });
    }
  }
  return rows;
}

if (require.main === module) {
  const vaultArg = process.argv.indexOf("--vault");
  const vaultRoot = vaultArg !== -1 ? process.argv[vaultArg + 1] : process.cwd();
  const report = verifyApprovedCorpus(vaultRoot);
  process.stdout.write(JSON.stringify(report, null, 2) + "\n");
  if (!report.all_valid) process.exitCode = 1;
}

module.exports = Object.freeze({
  GRANDFATHERED_BASELINE,
  verifyApprovedCorpus,
  getAcceptedStationRows
});
