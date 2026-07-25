"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const test = require("node:test");

const ROOT = path.resolve(__dirname, "../../../../../..");
const transitWriter = require(path.join(ROOT, "SYSTEM/SCRIPTS/region-transit-writer.js"));

function setupFixture(regionKey, stations) {
  const tmpdir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "tw-")));
  const crypto = require("crypto");
  const crosswalkDir = path.join(tmpdir, "SYSTEM", "CACHE", "region-transit");
  const rawDir = path.join(crosswalkDir, "raw", "incheon-metro", "line1");
  fs.mkdirSync(rawDir, { recursive: true });
  fs.mkdirSync(path.join(tmpdir, "SYSTEM", "CACHE", "region-transit-packages", regionKey), { recursive: true });
  fs.mkdirSync(path.join(tmpdir, "PARA", "RESOURCES", "Auction Regions"), { recursive: true });

  const stationEntries = [];
  for (const s of stations) {
    const rawContent = `<html><title>${s.name}</title></html>`;
    const rawFile = path.join(rawDir, s.no + ".html");
    fs.writeFileSync(rawFile, rawContent, "utf8");
    const rawSha = crypto.createHash("sha256").update(rawContent).digest("hex");
    stationEntries.push({
      name: s.name, no: s.no, rawSha,
      rawPath: path.relative(crosswalkDir, rawFile)
    });
  }

  const crosswalkData = {
    schema_version: 1, total_stations: stations.length, lines: ["인천1호선"],
    provider: "incheon-metro",
    stations: stationEntries.map(s => ({
      station_name: s.name, station_no: s.no, line_name: "인천1호선",
      official_address: "인천 검단구", region_key: regionKey,
      source_url: "https://www.ictr.or.kr/station/" + s.no,
      raw_sha256: s.rawSha, raw_path: s.rawPath
    }))
  };
  const crosswalkFile = path.join(crosswalkDir, "station-district-map.json");
  fs.writeFileSync(crosswalkFile, JSON.stringify(crosswalkData, null, 2), "utf8");
  const mapSha = crypto.createHash("sha256").update(JSON.stringify(crosswalkData, null, 2)).digest("hex");

  const hashes = { "station-district-map.json": mapSha };
  for (const s of stationEntries) {
    hashes[s.rawPath] = s.rawSha;
  }
  fs.writeFileSync(path.join(crosswalkDir, "hashes.json"), JSON.stringify({ hashes, updated_at: "2026-07-24" }, null, 2), "utf8");

  const objFile = path.join(tmpdir, "PARA", "RESOURCES", "Auction Regions", regionKey + ".md");
  fs.writeFileSync(objFile, [
    "---", "type: auction_region",
    "region_sido: " + regionKey.split("-")[0], "region_sigungu: " + regionKey.split("-")[1],
    "status: active", "updated: 2026-07-24", "---", "",
    "## 교통·생활", "",
    "<!-- AUTO:REGION_TRANSIT:START -->", "<!-- AUTO:REGION_TRANSIT:END -->", "",
    "<!-- AI:PENDING:TRANSPORT_LIFE:START -->", "<!-- AI:PENDING:TRANSPORT_LIFE:END -->", "",
    "## 리스크·주의", "",
    "<!-- AI:PENDING:RISKS:START -->", "<!-- AI:PENDING:RISKS:END -->"
  ].join("\n"), "utf8");

  const pkgFile = path.join(tmpdir, "SYSTEM", "CACHE", "region-transit-packages", regionKey, "incheon-metro_" + mapSha.slice(0, 12) + ".json");
  fs.writeFileSync(pkgFile, JSON.stringify({
    schema_version: 1, region_key: regionKey, provider: "incheon-metro",
    crosswalk_path: crosswalkFile, map_sha256: mapSha, created: "2026-07-24",
    stations: stationEntries.map(s => ({
      station_name: s.name, station_no: s.no, line_name: "인천1호선",
      raw_path: s.rawPath, raw_sha256: s.rawSha
    }))
  }, null, 2), "utf8");

  return { tmpdir, objFile, pkgFile };
}

test("dry-run reports package_planned", () => {
  const { tmpdir, objFile, pkgFile } = setupFixture("인천광역시-검단구", [
    { name: "검단호수공원역", no: "107" }, { name: "신검단중앙역", no: "108" }
  ]);
  try {
    const r = transitWriter.applyPackageFile({ vaultRoot: tmpdir, targetPath: objFile, packagePath: pkgFile, dryRun: true });
    assert.equal(r.changed, true);
    assert.equal(r.dry_run, true);
    assert.equal(r.reason, "package_planned");
    assert.equal(r.region_key, "인천광역시-검단구");
    assert.equal(r.stations_count, 2);
  } finally { fs.rmSync(tmpdir, { recursive: true, force: true }); }
});

test("second dry-run also reports package_planned (no actual write)", () => {
  const { tmpdir, objFile, pkgFile } = setupFixture("인천광역시-검단구", [{ name: "T", no: "1" }]);
  try {
    transitWriter.applyPackageFile({ vaultRoot: tmpdir, targetPath: objFile, packagePath: pkgFile, dryRun: true });
    const r = transitWriter.applyPackageFile({ vaultRoot: tmpdir, targetPath: objFile, packagePath: pkgFile, dryRun: true });
    assert.equal(r.changed, true);
    assert.equal(r.reason, "package_planned");
  } finally { fs.rmSync(tmpdir, { recursive: true, force: true }); }
});

test("rejects target without transit marker", () => {
  const { tmpdir, objFile, pkgFile } = setupFixture("인천광역시-검단구", [{ name: "T", no: "1" }]);
  try {
    fs.writeFileSync(objFile, "---\ntype: auction_region\n---\n\n## 교통·생활\n\n<!-- AI:PENDING:TRANSPORT_LIFE:START -->\n<!-- AI:PENDING:TRANSPORT_LIFE:END -->", "utf8");
    assert.throws(() => transitWriter.applyPackageFile({ vaultRoot: tmpdir, targetPath: objFile, packagePath: pkgFile, dryRun: true }), /정확히 1개/);
  } finally { fs.rmSync(tmpdir, { recursive: true, force: true }); }
});



test("--execute apply writes transit block, re-run is no-op", () => {
  const { tmpdir, objFile, pkgFile } = setupFixture("인천광역시-검단구", [
    { name: "검단호수공원역", no: "107" }
  ]);
  try {
    // First apply with --execute
    const r1 = transitWriter.applyPackageFile({ vaultRoot: tmpdir, targetPath: objFile, packagePath: pkgFile, execute: true, dryRun: false });
    assert.equal(r1.changed, true);
    assert.equal(r1.dry_run, false);
    assert.equal(r1.reason, "transit_applied");
    assert.equal(r1.stations_count, 1);

    // Verify file was actually written
    const content = fs.readFileSync(objFile, "utf8");
    assert.ok(content.includes("검단호수공원역"));
    assert.ok(content.includes("<!-- AUTO:REGION_TRANSIT:START -->"));
    assert.ok(content.includes("<!-- AUTO:REGION_TRANSIT:END -->"));

    // Re-run with same package — no-op
    const r2 = transitWriter.applyPackageFile({ vaultRoot: tmpdir, targetPath: objFile, packagePath: pkgFile, execute: true, dryRun: false });
    assert.equal(r2.changed, false);
    assert.equal(r2.reason, "same_package");
  } finally { fs.rmSync(tmpdir, { recursive: true, force: true }); }
});

test("--execute with wrong package file path rejects", () => {
  const { tmpdir, objFile, pkgFile } = setupFixture("인천광역시-검단구", [{ name: "T", no: "1" }]);
  try {
    const wrongFile = path.join(tmpdir, "nonexistent.json");
    assert.throws(() => transitWriter.applyPackageFile({ vaultRoot: tmpdir, targetPath: objFile, packagePath: wrongFile, execute: true, dryRun: false }), /존재/);
  } finally { fs.rmSync(tmpdir, { recursive: true, force: true }); }
});

test("empty --execute with no --execute is still dry-run", () => {
  const { tmpdir, objFile, pkgFile } = setupFixture("인천광역시-검단구", [{ name: "T", no: "1" }]);
  try {
    const r = transitWriter.applyPackageFile({ vaultRoot: tmpdir, targetPath: objFile, packagePath: pkgFile, dryRun: false, execute: false });
    assert.equal(r.dry_run, true);
    assert.equal(r.reason, "package_planned");
    // File should NOT be written
    const content = fs.readFileSync(objFile, "utf8");
    assert.ok(!content.includes("### 인천교통공사 확인 역"));
  } finally { fs.rmSync(tmpdir, { recursive: true, force: true }); }
});


test("atomic failure preserves original file", () => {
  const { tmpdir, objFile, pkgFile } = setupFixture("인천광역시-검단구", [{ name: "검단호수공원역", no: "107" }]);
  try {
    const originalHash = require("crypto").createHash("sha256").update(fs.readFileSync(objFile)).digest("hex");
    const objDir = path.dirname(objFile);
    // Make directory read-only so atomicWrite fails
    fs.chmodSync(objDir, 0o555);
    try {
      assert.throws(() => {
        transitWriter.applyPackageFile({ vaultRoot: tmpdir, targetPath: objFile, packagePath: pkgFile, execute: true, dryRun: false });
      }, /EACCES|EPERM|ENOENT/);
    } finally {
      fs.chmodSync(objDir, 0o755);
    }
    const afterHash = require("crypto").createHash("sha256").update(fs.readFileSync(objFile)).digest("hex");
    assert.equal(afterHash, originalHash, "원본 파일이 쓰기 실패 후에도 보존되어야 합니다.");
  } finally {
    fs.rmSync(tmpdir, { recursive: true, force: true });
  }
});
test("rejects target with wrong type", () => {
  const { tmpdir, objFile, pkgFile } = setupFixture("인천광역시-검단구", [{ name: "T", no: "1" }]);
  try {
    fs.writeFileSync(objFile, "---\ntype: auction_case\nregion_sido: 인천\nregion_sigungu: 검단구\n---\n\n<!-- AUTO:REGION_TRANSIT:START -->\n<!-- AUTO:REGION_TRANSIT:END -->\n\n<!-- AI:PENDING:TRANSPORT_LIFE:START -->\n<!-- AI:PENDING:TRANSPORT_LIFE:END -->", "utf8");
    assert.throws(() => transitWriter.applyPackageFile({ vaultRoot: tmpdir, targetPath: objFile, packagePath: pkgFile, dryRun: true }), /auction_region/);
  } finally { fs.rmSync(tmpdir, { recursive: true, force: true }); }
});