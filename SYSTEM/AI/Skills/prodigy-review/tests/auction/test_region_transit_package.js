"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const test = require("node:test");

const ROOT = path.resolve(__dirname, "../../../../../..");
const pkgCore = require(path.join(ROOT, "SYSTEM/SCRIPTS/region-transit-package-core.js"));

function setupFixture(regionKey, stations) {
  const tmpdir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "tp-")));
  const crypto = require("crypto");
  const crosswalkDir = path.join(tmpdir, "SYSTEM", "CACHE", "region-transit");
  const rawDir = path.join(crosswalkDir, "raw", "incheon-metro", "line1");
  fs.mkdirSync(rawDir, { recursive: true });

  const stationEntries = [];
  for (const s of stations) {
    const rawContent = `<html><title>${s.name}</title><body>주소</body></html>`;
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
    hashes[path.relative(crosswalkDir, path.join(crosswalkDir, s.rawPath))] = s.rawSha;
  }
  fs.writeFileSync(path.join(crosswalkDir, "hashes.json"), JSON.stringify({ hashes, updated_at: "2026-07-24" }, null, 2), "utf8");

  return { tmpdir, crosswalkFile, mapSha, stationEntries };
}

function makePkg(regionKey, crosswalkFile, mapSha, stations) {
  return {
    schema_version: 1, region_key: regionKey, provider: "incheon-metro",
    crosswalk_path: crosswalkFile, map_sha256: mapSha, created: "2026-07-24",
    stations: stations.map(s => ({
      station_name: s.name, station_no: s.no, line_name: "인천1호선",
      raw_path: s.rawPath, raw_sha256: s.rawSha
    }))
  };
}

test("valid package passes", () => {
  const { tmpdir, crosswalkFile, mapSha, stationEntries } = setupFixture("인천광역시-검단구", [
    { name: "검단호수공원역", no: "107" }, { name: "신검단중앙역", no: "108" }
  ]);
  try {
    assert.equal(pkgCore.validatePackage(makePkg("인천광역시-검단구", crosswalkFile, mapSha, stationEntries), tmpdir), true);
  } finally { fs.rmSync(tmpdir, { recursive: true, force: true }); }
});

test("no hashes.json rejects", () => {
  const { tmpdir, crosswalkFile, mapSha, stationEntries } = setupFixture("인천광역시-검단구", [{ name: "T", no: "1" }]);
  try {
    fs.unlinkSync(path.join(tmpdir, "SYSTEM", "CACHE", "region-transit", "hashes.json"));
    assert.throws(() => pkgCore.validatePackage(makePkg("인천광역시-검단구", crosswalkFile, mapSha, stationEntries), tmpdir), /hashes.json이 없습니다/);
  } finally { fs.rmSync(tmpdir, { recursive: true, force: true }); }
});

test("wrong map hash in hashes.json rejects", () => {
  const { tmpdir, crosswalkFile, mapSha, stationEntries } = setupFixture("인천광역시-검단구", [{ name: "T", no: "1" }]);
  try {
    const hp = path.join(tmpdir, "SYSTEM", "CACHE", "region-transit", "hashes.json");
    const h = JSON.parse(fs.readFileSync(hp, "utf8"));
    h.hashes["station-district-map.json"] = "0".repeat(64);
    fs.writeFileSync(hp, JSON.stringify(h, null, 2), "utf8");
    assert.throws(() => pkgCore.validatePackage(makePkg("인천광역시-검단구", crosswalkFile, mapSha, stationEntries), tmpdir), /불일치/);
  } finally { fs.rmSync(tmpdir, { recursive: true, force: true }); }
});


test("wrong raw hash in hashes.json rejects", () => {
  const { tmpdir, crosswalkFile, mapSha, stationEntries } = setupFixture("인천광역시-검단구", [{ name: "T", no: "1" }]);
  try {
    const hp = path.join(tmpdir, "SYSTEM", "CACHE", "region-transit", "hashes.json");
    const h = JSON.parse(fs.readFileSync(hp, "utf8"));
    h.hashes[stationEntries[0].rawPath] = "0".repeat(64);
    fs.writeFileSync(hp, JSON.stringify(h, null, 2), "utf8");
    assert.throws(() => pkgCore.validatePackage(makePkg("인천광역시-검단구", crosswalkFile, mapSha, stationEntries), tmpdir), /불일치/);
  } finally { fs.rmSync(tmpdir, { recursive: true, force: true }); }
});

test("missing raw hash key in hashes.json rejects", () => {
  const { tmpdir, crosswalkFile, mapSha, stationEntries } = setupFixture("인천광역시-검단구", [{ name: "T", no: "1" }]);
  try {
    const hp = path.join(tmpdir, "SYSTEM", "CACHE", "region-transit", "hashes.json");
    const h = JSON.parse(fs.readFileSync(hp, "utf8"));
    delete h.hashes[stationEntries[0].rawPath];
    fs.writeFileSync(hp, JSON.stringify(h, null, 2), "utf8");
    assert.throws(() => pkgCore.validatePackage(makePkg("인천광역시-검단구", crosswalkFile, mapSha, stationEntries), tmpdir), /hash가 없습니다/);
  } finally { fs.rmSync(tmpdir, { recursive: true, force: true }); }
});

test("wrong crosswalk filename rejects", () => {
  const { tmpdir, crosswalkFile, mapSha, stationEntries } = setupFixture("인천광역시-검단구", [{ name: "T", no: "1" }]);
  try {
    const wrongFile = path.join(tmpdir, "SYSTEM", "CACHE", "region-transit", "wrong.json");
    fs.renameSync(crosswalkFile, wrongFile);
    assert.throws(() => pkgCore.validatePackage(makePkg("인천광역시-검단구", wrongFile, mapSha, stationEntries), tmpdir), /station-district-map.json/);
  } finally { fs.rmSync(tmpdir, { recursive: true, force: true }); }
});

test("empty stations rejects", () => {
  assert.throws(() => pkgCore.validatePackage({ schema_version: 1, region_key: "x", provider: "incheon-metro", crosswalk_path: "x", map_sha256: "x", created: "x", stations: [] }, process.cwd()), /비어 있습니다/);
});

test("duplicate station rejects", () => {
  assert.throws(() => pkgCore.validatePackage({
    schema_version: 1, region_key: "x", provider: "incheon-metro", crosswalk_path: "x", map_sha256: "x", created: "x",
    stations: [{ station_name: "A", station_no: "1", line_name: "L1", raw_path: "a", raw_sha256: "a" }, { station_name: "A", station_no: "1", line_name: "L1", raw_path: "b", raw_sha256: "b" }]
  }, process.cwd()), /중복/);
});

test("unsupported provider rejects", () => {
  assert.throws(() => pkgCore.validatePackage({ schema_version: 1, region_key: "x", provider: "seoul-metro", crosswalk_path: "x", map_sha256: "x", created: "x", stations: [{ station_name: "A", station_no: "1", line_name: "L1", raw_path: "a", raw_sha256: "a" }] }, process.cwd()), /지원하지 않는 provider/);
});

test("renderBody produces correct Markdown", () => {
  const { tmpdir, crosswalkFile, mapSha, stationEntries } = setupFixture("인천광역시-검단구", [
    { name: "검단호수공원역", no: "107" }, { name: "신검단중앙역", no: "108" }, { name: "아라역", no: "109" }
  ]);
  try {
    const body = pkgCore.renderBody(makePkg("인천광역시-검단구", crosswalkFile, mapSha, stationEntries));
    assert.ok(body.includes("인천1호선") && body.includes("검단호수공원역") && body.includes("신검단중앙역") && body.includes("아라역") && body.includes("crosswalk"));
  } finally { fs.rmSync(tmpdir, { recursive: true, force: true }); }
});

test("replaceTransitBlock preserves outer content", () => {
  const content = "## 교통·생활\n\n<!-- AUTO:REGION_TRANSIT:START -->\n<!-- AUTO:REGION_TRANSIT:END -->\n\n<!-- AI:PENDING:TRANSPORT_LIFE:START -->\n<!-- AI:PENDING:TRANSPORT_LIFE:END -->";
  const result = pkgCore.replaceTransitBlock(content, "body");
  assert.ok(result.includes("<!-- AUTO:REGION_TRANSIT:START -->") && result.includes("<!-- AUTO:REGION_TRANSIT:END -->") && result.includes("<!-- AI:PENDING:TRANSPORT_LIFE:START -->"));
});

test("transit marker after TRANSPORT_LIFE rejects", () => {
  const content = "<!-- AI:PENDING:TRANSPORT_LIFE:START -->\n<!-- AI:PENDING:TRANSPORT_LIFE:END -->\n<!-- AUTO:REGION_TRANSIT:START -->\n<!-- AUTO:REGION_TRANSIT:END -->";
  assert.throws(() => pkgCore.validateTransitMarker(content), /뒤에 있습니다/);
});

test("duplicate transit marker rejects", () => {
  assert.throws(() => pkgCore.validateTransitMarker("<!-- AUTO:REGION_TRANSIT:START -->\n<!-- AUTO:REGION_TRANSIT:END -->\n<!-- AUTO:REGION_TRANSIT:START -->\n<!-- AUTO:REGION_TRANSIT:END -->"), /정확히 1개/);
});

test("no transit marker rejects", () => {
  assert.throws(() => pkgCore.validateTransitMarker("## 교통·생활"), /정확히 1개/);
});