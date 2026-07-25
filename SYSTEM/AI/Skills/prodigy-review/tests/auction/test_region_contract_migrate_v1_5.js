"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const test = require("node:test");

const ROOT = path.resolve(__dirname, "../../../../../..");
const migrate = require(path.join(ROOT, "SYSTEM/SCRIPTS/region-contract-migrate-v1_5.js"));

function fixtureRegionContent(regionKey, hasTransit = false, hasPopulated = false) {
  const [sido, sigungu] = regionKey.split("-");
  const transitBlock = hasTransit
    ? `<!-- AUTO:REGION_TRANSIT:START -->\n${hasPopulated ? "something" : ""}\n<!-- AUTO:REGION_TRANSIT:END -->\n\n`
    : "";
  return `---
type: auction_region
region_sido: ${sido}
region_sigungu: ${sigungu}
status: active
updated: 2026-07-24
---

## 교통·생활

${transitBlock}<!-- AI:PENDING:TRANSPORT_LIFE:START -->
<!-- AI:PENDING:TRANSPORT_LIFE:END -->

## 리스크·주의

<!-- AI:PENDING:RISKS:START -->
<!-- AI:PENDING:RISKS:END -->`;
}

test("Given a Region Object without AUTO:REGION_TRANSIT, When migrated, Then it inserts the empty marker", () => {
  const content = fixtureRegionContent("인천광역시-검단구");
  const result = migrate.migrateContent(content);
  assert.ok(result.includes("<!-- AUTO:REGION_TRANSIT:START -->"));
  assert.ok(result.includes("<!-- AUTO:REGION_TRANSIT:END -->"));
  assert.ok(result.includes("<!-- AI:PENDING:TRANSPORT_LIFE:START -->"));
  // Verify order: TRANSIT before TRANSPORT_LIFE
  assert.ok(result.indexOf("AUTO:REGION_TRANSIT:START") < result.indexOf("AI:PENDING:TRANSPORT_LIFE:START"));
  // Verify TRANSPORT_LIFE preserved
  assert.ok(result.includes("<!-- AI:PENDING:TRANSPORT_LIFE:END -->"));
});

test("Given a Region Object with empty AUTO:REGION_TRANSIT, When migrated again, Then it is no-op", () => {
  const content = fixtureRegionContent("인천광역시-검단구", true);
  const result = migrate.migrateContent(content);
  assert.ok(result.includes("<!-- AUTO:REGION_TRANSIT:START -->"));
  // Should be the same (idempotent)
  assert.equal(result, content);
});

test("Given a Region Object with populated AUTO:REGION_TRANSIT, When migrated, Then it rejects", () => {
  const content = fixtureRegionContent("인천광역시-검단구", true, true);
  assert.throws(() => migrate.migrateContent(content), /이미 채워져/);
});

test("Given a Region Object with duplicate transit markers, When migrated, Then it rejects", () => {
  const content = `---
type: auction_region
region_sido: 인천
region_sigungu: 검단구
---

## 교통·생활

<!-- AUTO:REGION_TRANSIT:START -->
<!-- AUTO:REGION_TRANSIT:END -->
<!-- AUTO:REGION_TRANSIT:START -->
<!-- AUTO:REGION_TRANSIT:END -->

<!-- AI:PENDING:TRANSPORT_LIFE:START -->
<!-- AI:PENDING:TRANSPORT_LIFE:END -->`;
  assert.throws(() => migrate.migrateContent(content), /마커가 2개|정확히 1개/);
});

test("Given a dry-run migration for all 4 manifests, When resolved, Then it returns correct counts", () => {
  // Use tmpdir fixture
  const tmpdir = fs.mkdtempSync(path.join(os.tmpdir(), "migrate-v1_5-"));
  try {
    const objDir = path.join(tmpdir, "PARA", "RESOURCES", "Auction Regions");
    fs.mkdirSync(objDir, { recursive: true });

    // Create fixture objects for 3 regions
    for (const key of ["서울특별시-종로구", "경기도-수원시", "인천광역시-검단구"]) {
      fs.writeFileSync(path.join(objDir, `${key}.md`), fixtureRegionContent(key), "utf8");
    }

    // Create minimal manifest
    const scriptsDir = path.join(tmpdir, "SYSTEM", "SCRIPTS");
    fs.mkdirSync(scriptsDir, { recursive: true });

    const busanManifest = {
      schema_version: 1,
      sido: "부산광역시",
      region_count: 0,
      regions: []
    };
    fs.writeFileSync(path.join(scriptsDir, "region-metrics-busan-manifest.json"), JSON.stringify(busanManifest), "utf8");

    const seoulManifest = {
      schema_version: 1,
      sido: "서울특별시",
      region_count: 1,
      regions: [{ sigungu: "종로구", region_key: "서울특별시-종로구", title: "서울특별시 종로구", region_prefix: "서울특별시 종로구", lawd_code: "11110000", household_code: "1111000000" }]
    };
    fs.writeFileSync(path.join(scriptsDir, "region-metrics-seoul-manifest.json"), JSON.stringify(seoulManifest), "utf8");

    const gyeonggiManifest = {
      schema_version: 1,
      sido: "경기도",
      region_count: 1,
      regions: [{ sigungu: "수원시", region_key: "경기도-수원시", title: "경기도 수원시", region_prefix: "경기도 수원시", lawd_code: "41110000", household_code: "4111000000" }]
    };
    fs.writeFileSync(path.join(scriptsDir, "region-metrics-gyeonggi-manifest.json"), JSON.stringify(gyeonggiManifest), "utf8");

    const incheonManifest = {
      schema_version: 1,
      sido: "인천광역시",
      region_count: 1,
      regions: [{ sigungu: "검단구", region_key: "인천광역시-검단구", title: "인천광역시 검단구", region_prefix: "인천광역시 검단구", lawd_code: "28290000", household_code: "2829000000" }]
    };
    fs.writeFileSync(path.join(scriptsDir, "region-metrics-incheon-manifest.json"), JSON.stringify(incheonManifest), "utf8");

    const index = {
      schema_version: 1,
      manifests: [
        { sido: "부산광역시", manifest_path: "region-metrics-busan-manifest.json" },
        { sido: "서울특별시", manifest_path: "region-metrics-seoul-manifest.json" },
        { sido: "경기도", manifest_path: "region-metrics-gyeonggi-manifest.json" },
        { sido: "인천광역시", manifest_path: "region-metrics-incheon-manifest.json" }
      ]
    };
    fs.writeFileSync(path.join(scriptsDir, "region-metrics-manifest-index.json"), JSON.stringify(index), "utf8");

    const result = migrate.migrateRegions({
      vaultRoot: tmpdir,
      execute: false
    });

    assert.equal(result.dry_run, true);
    assert.equal(result.migrated, 3);
    assert.equal(result.noop, 0);
    assert.equal(result.errors, 0);
    assert.equal(result.skipped, 0); // All 3 non-Busan regions found
    assert.equal(result.total, 3); // 3 non-Busan regions
  } finally {
    fs.rmSync(tmpdir, { recursive: true, force: true });
  }
});