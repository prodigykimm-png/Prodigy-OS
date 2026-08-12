"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const ROOT = path.resolve(__dirname, "../../../../../..");
const batch = require(path.join(ROOT, "SYSTEM/SCRIPTS/region-metrics-batch.js"));
const BUSAN_MANIFEST_PATH = path.join(ROOT, "SYSTEM/SCRIPTS/region-metrics-busan-manifest.json");

function fixtureManifest(sido, sigungu, lawdCode) {
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
      household_code: `${lawdCode.slice(0, 5)}00000`
    }]
  };
}

function fixtureRegistry() {
  return {
    schema_version: 1,
    manifests: [
      { sido: "부산광역시", manifest_path: "busan.json" },
      { sido: "서울특별시", manifest_path: "seoul.json" },
      { sido: "경기도", manifest_path: "gyeonggi.json" },
      { sido: "인천광역시", manifest_path: "incheon.json" }
    ]
  };
}

function fixtureManifestTexts() {
  return {
    "busan.json": fs.readFileSync(BUSAN_MANIFEST_PATH, "utf8"),
    "seoul.json": JSON.stringify(fixtureManifest("서울특별시", "중구", "11110000")),
    "gyeonggi.json": JSON.stringify(fixtureManifest("경기도", "수원시", "41110000")),
    "incheon.json": JSON.stringify(fixtureManifest("인천광역시", "계양구", "28245000"))
  };
}

function dryRunOptions(regionKey) {
  return {
    dryRun: true,
    execute: false,
    all: false,
    regionKey,
    manifest: BUSAN_MANIFEST_PATH,
    manifestSpecified: false,
    registry: batch.DEFAULT_REGISTRY_INDEX,
    sido: null
  };
}

test("Given the legacy default Busan manifest, When a dry-run plan selects Geumjeong, Then the existing plan remains compatible", () => {
  const legacyArgs = batch.parseArgs(["--manifest", BUSAN_MANIFEST_PATH, "--region-key", "부산광역시-금정구"]);
  const manifest = batch.loadManifest(BUSAN_MANIFEST_PATH);

  assert.equal(legacyArgs.manifest, BUSAN_MANIFEST_PATH);
  assert.equal(legacyArgs.manifestSpecified, true);
  assert.equal(legacyArgs.sido, null);
  assert.equal(legacyArgs.execute, false);
  const plan = batch.createDryRunPlan(manifest, dryRunOptions("부산광역시-금정구"));

  assert.equal(plan.mode, "dry-run");
  assert.equal(plan.selected_count, 1);
  assert.deepEqual(plan.jobs, [{
    region_key: "부산광역시-금정구",
    region_prefix: "부산광역시 금정구",
    lawd_code: "26410000",
    household_row: "부산광역시 금정구 (2641000000)",
    status: "planned"
  }]);
});

test("Given Seoul, Gyeonggi, and Incheon fixture manifests, When a province is selected from the registry, Then the dry-run derives the selected title and household code", () => {
  const registry = batch.loadRegistryFromTexts(JSON.stringify(fixtureRegistry()), fixtureManifestTexts());
  const cases = [
    ["서울특별시", "서울특별시-중구", "서울특별시 중구 (1111000000)"],
    ["경기도", "경기도-수원시", "경기도 수원시 (4111000000)"],
    ["인천광역시", "인천광역시-계양구", "인천광역시 계양구 (2824500000)"]
  ];

  for (const [sido, regionKey, expectedHouseholdRow] of cases) {
    const selected = batch.selectManifest(registry, { sido, manifestSpecified: false });
    const plan = batch.createDryRunPlan(selected.manifest, { ...dryRunOptions(regionKey), manifest: selected.manifest_path });

    assert.equal(plan.selected_count, 1);
    assert.equal(plan.jobs[0].region_key, regionKey);
    assert.equal(plan.jobs[0].household_row, expectedHouseholdRow);
    assert.equal(plan.jobs[0].status, "planned");
  }
});

test("Given malformed, unknown, or ambiguous registry selection, When a province is selected, Then it fails closed before any refresh runner can be reached", () => {
  const registry = batch.loadRegistryFromTexts(JSON.stringify(fixtureRegistry()), fixtureManifestTexts());

  assert.throws(
    () => batch.selectManifest(registry, { sido: "대전광역시", manifestSpecified: false }),
    /없는 sido/
  );
  assert.throws(
    () => batch.selectManifest({ manifests: [registry.manifests[1], registry.manifests[1]] }, { sido: "서울특별시", manifestSpecified: false }),
    /sido가 2개/
  );
  assert.throws(
    () => batch.loadRegistryFromTexts("{", {}),
    /index JSON 파싱 실패/
  );
  assert.throws(
    () => batch.validateOptions({ ...dryRunOptions("서울특별시-중구"), sido: "서울특별시", manifestSpecified: true }),
    /--sido와 --manifest/
  );
  assert.throws(
    () => batch.validateOptions({ ...dryRunOptions("서울특별시-중구"), registrySpecified: true }),
    /--registry에는 --sido/
  );
});

test("Given a zero-exit child without a valid snapshot receipt, When batch execution evaluates the result through a fake runner, Then it reports failure without aborting remaining regions", () => {
  const manifest = batch.loadManifest(BUSAN_MANIFEST_PATH);
  const region = manifest.regions.find((candidate) => candidate.region_key === "부산광역시-금정구");
  const executeOptions = {
    dryRun: false,
    execute: true,
    all: false,
    regionKey: region.region_key,
    manifest: BUSAN_MANIFEST_PATH,
    stockCsv: "/fixture/stock.csv",
    stockAsOf: "2025-09",
    supplyCsv: "/fixture/supply.csv",
    supplyBasis: "2025-12",
    output: "/fixture/output"
  };
  const cases = [
    ["empty stdout", "", /snapshot_dir 영수증 JSON/],
    ["malformed JSON", "not JSON", /snapshot_dir 영수증 JSON/],
    ["missing snapshot_dir", JSON.stringify({ ok: true }), /snapshot_dir/],
    ["empty snapshot_dir", JSON.stringify({ snapshot_dir: "   " }), /snapshot_dir/]
  ];

  for (const [_name, stdout, expectedError] of cases) {
    const fakeRunner = () => ({ status: 0, stdout, stderr: "" });

    const result = batch.runRefreshForRegion(region, executeOptions, fakeRunner);
    const summary = batch.runExecute(manifest, executeOptions, fakeRunner);

    assert.equal(result.status, "failed");
    assert.equal(result.snapshot_dir, null);
    assert.match(result.error, expectedError);
    assert.equal(summary.failed_count, 1);
    assert.equal(summary.aborted, false);
    assert.equal(summary.completed, 1);
  }
});

test("Given a zero-exit child with a nonempty snapshot receipt, When batch execution evaluates the fake result, Then it preserves the valid success path", () => {
  const manifest = batch.loadManifest(BUSAN_MANIFEST_PATH);
  const region = manifest.regions.find((candidate) => candidate.region_key === "부산광역시-금정구");
  const executeOptions = {
    dryRun: false,
    execute: true,
    all: false,
    regionKey: region.region_key,
    manifest: BUSAN_MANIFEST_PATH,
    stockCsv: "/fixture/stock.csv",
    stockAsOf: "2025-09",
    supplyCsv: "/fixture/supply.csv",
    supplyBasis: "2025-12",
    output: "/fixture/output"
  };
  const fakeRunner = () => ({ status: 0, stdout: JSON.stringify({ snapshot_dir: "/fixture/snapshot" }), stderr: "" });

  const result = batch.runRefreshForRegion(region, executeOptions, fakeRunner);
  const summary = batch.runExecute(manifest, executeOptions, fakeRunner);

  assert.equal(result.status, "success");
  assert.equal(result.snapshot_dir, "/fixture/snapshot");
  assert.equal(summary.failed_count, 0);
  assert.equal(summary.aborted, false);
});
