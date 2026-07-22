"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const projection = require("../../../../../Views/region-explorer-projection.js");
const dataSource = require("../../../../../Views/region-explorer-data-source.js");

function createFakeVault(files) {
  const initial = new Map(files.map((file) => [file.path, file.body]));
  const reads = [];
  return {
    getMarkdownFiles() {
      return [...initial.keys()].map((path) => ({ path }));
    },
    async read(file) {
      reads.push(file.path);
      return initial.get(file.path);
    },
    snapshot() {
      return new Map(initial);
    },
    reads
  };
}

test("Given a fake vault When note bodies are read Then the fixture stays byte-identical", async () => {
  const vault = createFakeVault([{
    path: "PARA/RESOURCES/Auction Regions/\u110b\u1175\u11ab\u110e\u1165\u11ab\u1100\u116a\u11bc\u110b\u1167\u11a8\u1109\u1175-\u1107\u116e\u1111\u1167\u11bc\u1100\u116e.md",
    body: "---\ntype: auction_region\nregion_sido: \uc778\ucc9c\uad11\uc5ed\uc2dc\nregion_sigungu: \ubd80\ud3c9\uad6c\n---\n"
  }]);
  const before = vault.snapshot();

  await vault.read(vault.getMarkdownFiles()[0]);

  assert.deepEqual(vault.snapshot(), before);
  assert.equal(vault.reads.length, 1);
});

function regionNote({ sido, sigungu, title = `${sido} ${sigungu}`, metrics = {}, landPrice = {}, history, research = true }) {
  const metricLines = Object.entries({
    metrics_as_of: "2026-05-01", metrics_scope: "sigungu", metrics_source: "region_metrics_v1_2_5",
    source_as_of: "2026-07-19", verification_status: "unverified", sale_volume_3m: 120,
    housing_stock: 1000, sale_turnover_rate: 0.04, sale_price_change_yoy: -1.2, jeonse_ratio: 70,
    move_in_12m: 0, move_in_24m: 200, move_in_36m: "", move_in_48m: "", move_in_60m: "",
    households: 500, household_change_yoy: 0.3, ...metrics, ...landPrice
  }).map(([key, value]) => `${key}: ${value}`).join("\n");
  const payload = history === undefined ? {
    schema_version: 1, region_key: `${sido}-${sigungu}`,
    snapshots: [{ schema_version: 1, snapshot_id: "2026-05-01_fixture", region_key: `${sido}-${sigungu}`,
      metrics_as_of: "2026-05-01", source_as_of: "2026-07-19", verification_status: "unverified",
      metrics: { move_in_36m: { value: null }, sale_volume_3m: { value: 120 } },
      evidence: { supply_coverage: { observed_horizon_months: 24, unavailable_horizons: [36, 48, 60] } } }]
  } : history;
  const researchBlocks = research ? [
    ["AI:PENDING:SUMMARY", "요약 근거"], ["AI:PENDING:ZONES", "권역 근거"],
    ["AI:PENDING:SUPPLY_PIPELINE", "공급 근거"], ["AI:PENDING:TRANSPORT_LIFE", "교통 근거"],
    ["AI:PENDING:RISKS", "리스크 근거"], ["AI:PENDING:SITE_VISIT", "임장 근거"],
    ["AUTO:REGION_RESEARCH_SOURCES", "출처 근거"], ["AUTO:REGION_RESEARCH_LOG", "조사 로그"]
  ].map(([marker, body]) => `<!-- ${marker}:START -->\n${body}\n<!-- ${marker}:END -->`).join("\n") : "";
  return `---\ntype: auction_region\ntitle: ${title}\nregion_sido: ${sido}\nregion_sigungu: ${sigungu}\nupdated: 2026-07-20\n${metricLines}\n---\n\n<!-- PRODIGY_REGION_METRICS_HISTORY -->\n\`\`\`json\n${JSON.stringify(payload)}\n\`\`\`\n${researchBlocks}\n`;
}

test("Given four frontmatter Region Objects When the fake vault is projected Then metrics history evidence and land price remain distinct", async () => {
  const incheonPath = "PARA/RESOURCES/Auction Regions/\u110b\u1175\u11ab\u110e\u1165\u11ab\u1100\u116a\u11bc\u110b\u1167\u11a8\u1109\u1175-\u1107\u116e\u1111\u1167\u11bc\u1100\u116e.md";
  const files = [
    { path: "PARA/RESOURCES/Auction Regions/not-a-region.md", body: "---\ntype: auction_case\n---" },
    { path: "PARA/RESOURCES/Auction Regions/부산.md", body: regionNote({ sido: "부산광역시", sigungu: "북구" }) },
    { path: "PARA/RESOURCES/Auction Regions/서울.md", body: regionNote({ sido: "서울특별시", sigungu: "강북구" }) },
    { path: "PARA/RESOURCES/Auction Regions/경기.md", body: regionNote({ sido: "경기도", sigungu: "수원시" }) },
    { path: incheonPath, body: regionNote({ sido: "인천광역시", sigungu: "부평구", metrics: { move_in_12m: 0, move_in_36m: "" }, landPrice: { land_price_trend_yoy: 1.25, land_price_trend_as_of: "2026-01-01", land_price_trend_scope: "시군구", land_price_trend_source: "https://land.example" } }) }
  ];
  const vault = createFakeVault(files);
  const before = vault.snapshot();

  const result = await dataSource.loadRegionExplorer({ vault });

  assert.equal(result.rows.length, 4);
  const incheon = result.rows.find((row) => row.identity.region_key === "인천광역시-부평구");
  assert.equal(incheon.identity.path, incheonPath.normalize("NFC"));
  assert.equal(incheon.metrics.move_in_12m.value, 0);
  assert.equal(incheon.metrics.move_in_12m.availability, "관측값");
  assert.equal(incheon.metrics.move_in_36m.value, null);
  assert.equal(incheon.metrics.move_in_36m.availability, "관측 범위 부족");
  assert.equal(incheon.land_price.trend_yoy, 1.25);
  assert.equal(incheon.history.snapshots.length, 1);
  assert.equal(incheon.research.sources, "출처 근거");
  assert.equal(incheon.provenance.verification_status, "unverified");
  assert.equal(incheon.provenance.freshness.availability, "기준일 있음");
  assert.deepEqual(vault.snapshot(), before);
  assert.equal(Object.isFrozen(incheon), true);
});

test("Given malformed and duplicate Region notes When projected Then Korean diagnostics are row-level and recoverable", () => {
  const valid = regionNote({ sido: "부산광역시", sigungu: "북구" });
  const malformedHistory = regionNote({ sido: "서울특별시", sigungu: "강북구", history: "not-json" });
  const missingMarker = regionNote({ sido: "경기도", sigungu: "수원시", research: false });
  const missingFrontmatter = "# 알 수 없는 지역\n<!-- PRODIGY_REGION_METRICS_HISTORY -->";

  const result = projection.projectRegionSources([
    { path: "a.md", body: valid, metadata_available: false },
    { path: "b.md", body: valid, metadata_available: true },
    { path: "c.md", body: malformedHistory, metadata_available: true },
    { path: "d.md", body: missingMarker, metadata_available: true },
    { path: "e.md", body: missingFrontmatter, metadata_available: true }
  ]);

  assert.equal(result.rows.length, 4);
  const duplicate = result.rows.filter((row) => row.identity.region_key === "부산광역시-북구");
  assert.equal(duplicate.length, 2);
  assert(duplicate.every((row) => row.diagnostics.some((item) => item.code === "duplicate_region_key" && /중복/.test(item.message))));
  assert(result.rows.find((row) => row.identity.path === "a.md").diagnostics.some((item) => item.code === "dataview_metadata_unavailable"));
  assert(result.rows.find((row) => row.identity.path === "c.md").diagnostics.some((item) => item.code === "malformed_history" && /히스토리/.test(item.message)));
  assert(result.rows.find((row) => row.identity.path === "d.md").diagnostics.some((item) => item.code === "missing_marker" && /마커/.test(item.message)));
  assert(result.diagnostics.some((item) => item.path === "e.md" && item.code === "missing_frontmatter" && /Frontmatter/.test(item.message)));
  assert.equal(result.rows.find((row) => row.identity.path === "c.md").metrics.sale_volume_3m.value, 120);
});

test("Given malformed source input When projected Then the Explorer returns a Korean recoverable diagnostic", () => {
  const result = projection.projectRegionSources(null);

  assert.deepEqual(result.rows, []);
  assert.equal(result.diagnostics[0].code, "malformed_input");
  assert.match(result.diagnostics[0].message, /올바르지/);
});

test("Given conflicting duplicate type Frontmatter When projected Then the note is excluded before Region type routing", () => {
  const body = regionNote({ sido: "부산광역시", sigungu: "북구" })
    .replace("type: auction_region", "type: auction_case\ntype: auction_region");

  const result = projection.projectRegionSources([{ path: "conflicting-type.md", body }]);

  assert.deepEqual(result.rows, []);
  assert(result.diagnostics.some((item) => item.code === "invalid_frontmatter" && /type.*서로 다릅니다/.test(item.message)));
});

test("Given notes with registry identity but a wrong or missing type When projected Then neither becomes a valid Region row and each leaves Korean recovery coverage data", () => {
  const wrongType = "---\ntype: auction_case\nregion_sido: 부산광역시\nregion_sigungu: 중구\n---\n";
  const missingType = "---\nregion_sido: 부산광역시\nregion_sigungu: 서구\n---\n";

  const result = projection.projectRegionSources([
    { path: "wrong-type.md", body: wrongType },
    { path: "missing-type.md", body: missingType }
  ]);

  assert.deepEqual(result.rows, []);
  assert.deepEqual(result.excluded_region_keys, ["부산광역시-중구", "부산광역시-서구"]);
  assert(result.diagnostics.some((item) => item.path === "wrong-type.md" && /auction_region/.test(item.message)));
  assert(result.diagnostics.some((item) => item.path === "missing-type.md" && /type.*필요/.test(item.message)));
});

test("Given an identical duplicate title Frontmatter When projected Then the first value is retained and diagnosed", () => {
  const body = regionNote({ sido: "부산광역시", sigungu: "북구", title: "첫 제목" })
    .replace("title: 첫 제목", "title: 첫 제목\ntitle: 첫 제목");

  const result = projection.projectRegionSources([{ path: "duplicate-title.md", body }]);

  assert.equal(result.rows[0].identity.title, "첫 제목");
  assert(result.rows[0].diagnostics.some((item) => item.code === "duplicate_frontmatter" && /첫 값을 사용/.test(item.message)));
});
