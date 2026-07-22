"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const ROOT = path.resolve(__dirname, "../../../../../..");
const BUSAN_MANIFEST_PATH = path.join(ROOT, "SYSTEM/SCRIPTS/region-metrics-busan-manifest.json");
const INDEX_PATH = path.join(ROOT, "SYSTEM/SCRIPTS/region-metrics-manifest-index.json");
const CORE_PATH = path.join(ROOT, "SYSTEM/SCRIPTS/region-metrics-registry-core.js");
const registryCore = fs.existsSync(CORE_PATH) ? require(CORE_PATH) : {};

function fixtureManifest(sido, sigungu, lawdCode) {
  const householdCode = `${lawdCode.slice(0, 5)}00000`;
  return {
    schema_version: 1,
    sido,
    region_count: 1,
    regions: [{
      sigungu,
      region_key: `${sido}-${sigungu}`,
      title: `${sido} ${sigungu}`,
      region_prefix: `${sido} ${sigungu}`,
      lawd_code: lawdCode,
      household_code: householdCode
    }]
  };
}

function fixtureRegistry(entries) {
  return { schema_version: 1, manifests: entries };
}

function fixtureEntry(sido, manifestPath) {
  return { sido, manifest_path: manifestPath };
}

function allProvinceFixtures() {
  return {
    "busan.json": JSON.parse(fs.readFileSync(BUSAN_MANIFEST_PATH, "utf8")),
    "seoul.json": fixtureManifest("서울특별시", "중구", "11110000"),
    "gyeonggi.json": fixtureManifest("경기도", "수원시", "41110000"),
    "incheon.json": fixtureManifest("인천광역시", "계양구", "28245000")
  };
}

test("Given the checked-in Busan manifest, When it is characterized before registry work, Then its bytes and region contract remain unchanged", () => {
  const bytes = fs.readFileSync(BUSAN_MANIFEST_PATH);
  const manifest = JSON.parse(bytes.toString("utf8"));

  assert.equal(crypto.createHash("sha256").update(bytes).digest("hex"), "27043d72c7ddb5af8857a4ea8f5a29d3c8f1d6ee230e461c14cb4f2699e2c9ef");
  assert.equal(manifest.schema_version, 1);
  assert.equal(manifest.sido, "부산광역시");
  assert.equal(manifest.region_count, 16);
  assert.equal(manifest.regions.length, 16);
  assert.deepEqual(manifest.regions[0], {
    sigungu: "중구",
    region_key: "부산광역시-중구",
    title: "부산광역시 중구",
    region_prefix: "부산광역시 중구",
    lawd_code: "26110000",
    household_code: "2611000000"
  });
});

test("Given Busan plus Seoul, Gyeonggi, and Incheon fixture manifests, When the registry is validated, Then deterministic flattened region rows are returned", () => {
  const fixtures = allProvinceFixtures();
  const index = fixtureRegistry([
    fixtureEntry("부산광역시", "busan.json"),
    fixtureEntry("서울특별시", "seoul.json"),
    fixtureEntry("경기도", "gyeonggi.json"),
    fixtureEntry("인천광역시", "incheon.json")
  ]);

  const loaded = registryCore.validateRegistry(index, fixtures);

  assert.equal(loaded.manifests.length, 4);
  assert.equal(loaded.regions.length, 19);
  assert.deepEqual(loaded.regions.map((region) => region.region_key), [
    "부산광역시-중구", "부산광역시-서구", "부산광역시-동구", "부산광역시-영도구",
    "부산광역시-부산진구", "부산광역시-동래구", "부산광역시-남구", "부산광역시-북구",
    "부산광역시-해운대구", "부산광역시-사하구", "부산광역시-금정구", "부산광역시-강서구",
    "부산광역시-연제구", "부산광역시-수영구", "부산광역시-사상구", "부산광역시-기장군",
    "서울특별시-중구", "경기도-수원시", "인천광역시-계양구"
  ]);
});

test("Given the checked-in manifest index, When its sole Busan entry is loaded, Then the existing manifest remains the only production source", () => {
  const indexText = fs.readFileSync(INDEX_PATH, "utf8");
  const busanText = fs.readFileSync(BUSAN_MANIFEST_PATH, "utf8");
  const loaded = registryCore.loadRegistry(indexText, { "region-metrics-busan-manifest.json": busanText });

  assert.equal(loaded.schema_version, 1);
  assert.deepEqual(loaded.manifests.map((manifest) => manifest.sido), ["부산광역시"]);
  assert.equal(loaded.manifests[0].manifest_path, "region-metrics-busan-manifest.json");
  assert.equal(loaded.regions.length, 16);
});

test("Given malformed registry JSON, When the registry loader parses it, Then it rejects the boundary input", () => {
  assert.throws(() => registryCore.loadRegistry("{", {}), /index JSON 파싱 실패/);
});

test("Given an absolute or traversal manifest path, When the registry is validated, Then it rejects the path before loading a manifest", () => {
  const manifests = allProvinceFixtures();

  assert.throws(
    () => registryCore.validateRegistry(fixtureRegistry([fixtureEntry("부산광역시", "../busan.json")]), manifests),
    /상대 경로/
  );
  assert.throws(
    () => registryCore.validateRegistry(fixtureRegistry([fixtureEntry("부산광역시", "/busan.json")]), manifests),
    /상대 경로/
  );
});

test("Given duplicate sido entries, When the registry is validated, Then it fails closed", () => {
  const manifests = allProvinceFixtures();
  const index = fixtureRegistry([
    fixtureEntry("부산광역시", "busan.json"),
    fixtureEntry("부산광역시", "seoul.json")
  ]);

  assert.throws(() => registryCore.validateRegistry(index, manifests), /중복 sido/);
});

test("Given a duplicate region key across fixture manifests, When the registry is validated, Then the duplicate fixture is exercised and rejected", () => {
  const manifests = allProvinceFixtures();
  manifests["seoul.json"].regions[0] = {
    ...manifests["seoul.json"].regions[0],
    sigungu: "중구",
    region_key: "부산광역시-중구",
    title: "서울특별시 중구",
    region_prefix: "서울특별시 중구"
  };
  const index = fixtureRegistry([
    fixtureEntry("부산광역시", "busan.json"),
    fixtureEntry("서울특별시", "seoul.json")
  ]);

  assert.equal(manifests["seoul.json"].regions[0].region_key, "부산광역시-중구", "bad fixture must be exercised");
  assert.throws(() => registryCore.validateRegistry(index, manifests), /중복 region_key: 부산광역시-중구/);
});

test("Given title, prefix, code, and count mismatches, When the registry is validated, Then each manifest contract violation is rejected", () => {
  const cases = [
    ["title", (manifest) => ({ ...manifest, regions: [{ ...manifest.regions[0], title: "서울특별시 종로구" }] }), /title/],
    ["prefix", (manifest) => ({ ...manifest, regions: [{ ...manifest.regions[0], region_prefix: "서울 중구" }] }), /region_prefix/],
    ["lawd width", (manifest) => ({ ...manifest, regions: [{ ...manifest.regions[0], lawd_code: "1234" }] }), /8자리/],
    ["household width", (manifest) => ({ ...manifest, regions: [{ ...manifest.regions[0], household_code: "12345" }] }), /10자리/],
    ["code prefix", (manifest) => ({ ...manifest, regions: [{ ...manifest.regions[0], household_code: "2222200000" }] }), /앞 5자리/],
    ["region count", (manifest) => ({ ...manifest, region_count: 2 }), /region_count/]
  ];

  for (const [_name, mutate, expectedError] of cases) {
    const invalidManifest = mutate(fixtureManifest("서울특별시", "중구", "11110000"));
    const index = fixtureRegistry([fixtureEntry("서울특별시", "seoul.json")]);
    assert.throws(() => registryCore.validateRegistry(index, { "seoul.json": invalidManifest }), expectedError);
  }
});
