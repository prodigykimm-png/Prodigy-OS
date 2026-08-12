"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const ROOT = path.resolve(__dirname, "../../../../../..");
const migrate = require(path.join(ROOT, "SYSTEM/SCRIPTS/region-contract-migrate-v1_4.js"));
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

function legacyRegion() {
  return `---
type: auction_region
region_sido: 부산광역시
region_sigungu: 동래구
# Contract v1.2.6 — SYSTEM/docs/Region_Property_Contract_v1.md
move_in_24m: 1430
households: 122574
---

# 부산광역시 동래구

## 시장 지표 스냅샷

<!-- PRODIGY_REGION_METRICS_DISPLAY: regenerated from frontmatter; do not hand-edit values -->
| 지표 | 값 | 단위 | 비고 |
|------|-----|------|------|
| 입주 예정 24개월 | 1,430 | 세대 | 기존 |
| 세대수 | 122,574 | 세대 | 기존 |

## 지표 히스토리

<!-- PRODIGY_REGION_METRICS_HISTORY -->
\`\`\`json
{
  "schema_version": 1,
  "region_key": "부산광역시-동래구",
  "snapshots": []
}
\`\`\`

## 시장·공급

<!-- AUTO:REGION_MARKET:START -->
자동 시장 문장
<!-- AUTO:REGION_MARKET:END -->

## 교통·생활

<!-- AI:PENDING:TRANSPORT_LIFE:START -->
<!-- AI:PENDING:TRANSPORT_LIFE:END -->
<!-- HUMAN -->
사람이 쓴 교통 메모
`;
}

test("Given legacy Busan note content, When its migration content is parsed, Then the transformation remains pure and idempotent", () => {
  const legacyArgs = migrate.parseArgs(["--all-busan"]);
  const migrated = migrate.migrateContent(legacyRegion(), "부산광역시-동래구");

  assert.equal(legacyArgs.all, true);
  assert.equal(legacyArgs.sido, "부산광역시");
  assert.equal(legacyArgs.execute, false);
  assert.equal(migrated.changed, true);
  assert.equal(migrated.region_key, "부산광역시-동래구");
  assert.match(migrated.content, /^move_in_36m:$/m);
  assert.match(migrated.content, /AI:PENDING:SUPPLY_PIPELINE:START/);
  assert.equal(migrate.migrateContent(migrated.content, "부산광역시-동래구").changed, false);
});

test("Given Seoul, Gyeonggi, and Incheon fixture manifests, When a migration selector resolves a province, Then it returns exactly the requested manifest region", () => {
  const registry = migrate.loadRegistryFromTexts(JSON.stringify(fixtureRegistry()), fixtureManifestTexts());
  const cases = [
    ["서울특별시", "서울특별시-중구"],
    ["경기도", "경기도-수원시"],
    ["인천광역시", "인천광역시-계양구"]
  ];

  for (const [sido, regionKey] of cases) {
    const selected = migrate.selectManifest(registry, { sido, manifestSpecified: false });
    const regions = migrate.selectRegions(selected.manifest, { all: false, regionKey });

    assert.deepEqual(regions.map((region) => region.region_key), [regionKey]);
  }
});

test("Given an unknown, ambiguous, or malformed selector, When migration selection is resolved, Then it refuses before a target Object is read or written", () => {
  const registry = migrate.loadRegistryFromTexts(JSON.stringify(fixtureRegistry()), fixtureManifestTexts());

  assert.throws(
    () => migrate.selectManifest(registry, { sido: "대전광역시", manifestSpecified: false }),
    /없는 sido/
  );
  assert.throws(
    () => migrate.selectManifest({ manifests: [registry.manifests[2], registry.manifests[2]] }, { sido: "경기도", manifestSpecified: false }),
    /sido가 2개/
  );
  assert.throws(
    () => migrate.selectRegions(registry.manifests[1], { all: false, regionKey: "서울특별시-종로구" }),
    /없는 region_key/
  );
  assert.throws(
    () => migrate.loadRegistryFromTexts("{", {}),
    /index JSON 파싱 실패/
  );
  assert.throws(
    () => migrate.parseArgs(["--registry", "fixture-index.json", "--all"]),
    /--registry에는 --sido/
  );
});
