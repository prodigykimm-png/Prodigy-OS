"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "../..");
const pkgCore = require(path.join(ROOT, "SYSTEM/SCRIPTS/region-research-package-core.js"));
const patch = require(path.join(ROOT, "SYSTEM/SCRIPTS/region-summary-patch-apply.js"));
const TEMPLATE_PATH = path.join(ROOT, "SYSTEM/TEMPLATE/FORMAT/template_auction_region.md");

function templateNote(regionKey, sigungu) {
  const sido = "부산광역시";
  const title = `${sido} ${sigungu}`;
  return fs.readFileSync(TEMPLATE_PATH, "utf8")
    .replace(/<%\s*title\s*%>/g, title)
    .replace(/<%\s*region_sido\s*%>/g, sido)
    .replace(/<%\s*region_sigungu\s*%>/g, sigungu)
    .replace(/<%\s*region_key\s*%>/g, regionKey)
    .replace(/<%\s*date\s*%>/g, "2026-07-19");
}

function validPatch(overrides = {}) {
  return {
    schema_version: 1,
    region_key: "부산광역시-중구",
    patched_at: "2026-09-28",
    summary_pending: {
      text: "중구 정비사업 고시 제2025-123호가 공식 게시되어 있다",
      source_ids: ["S1", "S2"]
    },
    sources: [
      { source_id: "S1", institution: "행정안전부", title: "주민등록 인구통계 시스템 월별 통계", url: "https://jumin.mois.go.kr/statMonth.do", accessed_at: "2026-09-06", source_type: "official_primary" },
      { source_id: "S2", institution: "국토교통부 토지이음", title: "중구 정비구역 지정 고시", url: "https://www.eum.go.kr/web/gs/gv/gvGosiDet.jsp?seq=1", accessed_at: "2026-09-28", source_type: "official_primary" }
    ],
    ...overrides
  };
}

assert.equal(patch.validatePatch(validPatch()), true);

assert.throws(() => patch.validatePatch(validPatch({ schema_version: 2 })), /schema_version/);
assert.throws(() => patch.validatePatch(validPatch({ extra: 1 })), /알 수 없는 필드/);
assert.throws(() => patch.validatePatch(validPatch({ patched_at: "2026-02-30" })), /존재하지 않는 날짜/);
assert.throws(() => patch.validatePatch(validPatch({ summary_pending: { text: "x\ny", source_ids: ["S1", "S2"] } })), /단일 행/);
assert.throws(() => patch.validatePatch(validPatch({ summary_pending: { text: "중구은(는) 3개 동", source_ids: ["S1"] } })), /조사 오삽입/);
assert.throws(() => patch.validatePatch(validPatch({ summary_pending: { text: "문장", source_ids: ["S9"] } })), /존재하지 않는 source_id/);
assert.throws(() => patch.validatePatch(validPatch({ sources: [] })), /최소 1개/);
assert.throws(() => patch.validatePatch(validPatch({
  sources: [{ source_id: "S1", institution: "x", title: "t", url: "http://www.busan.go.kr/a", accessed_at: "2026-09-28", source_type: "official_primary" }]
})), /https/);
assert.throws(() => patch.validatePatch(validPatch({
  sources: [{ source_id: "S1", institution: "x", title: "t", url: "https://www.google.com/search?q=a", accessed_at: "2026-09-28", source_type: "official_primary" }]
})), /검색 결과 URL/);
assert.throws(() => patch.validatePatch(validPatch({
  sources: [
    { source_id: "S1", institution: "x", title: "t", url: "https://www.busan.go.kr/a", accessed_at: "2026-09-28", source_type: "official_primary" },
    { source_id: "S1", institution: "x", title: "t", url: "https://www.busan.go.kr/b", accessed_at: "2026-09-28", source_type: "official_primary" }
  ],
  summary_pending: { text: "문장", source_ids: ["S1"] }
})), /source_id 중복/);
assert.throws(() => patch.validatePatch(validPatch({
  sources: [{ source_id: "S1", institution: "x", title: "t", url: "https://www.busan.go.kr/a", accessed_at: "2026-09-28", source_type: "third_party" }]
})), /official_primary/);

const vault = fs.mkdtempSync(path.join(os.tmpdir(), "rsp-"));
try {
  const targetDir = path.join(vault, "PARA/RESOURCES/Auction Regions");
  fs.mkdirSync(targetDir, { recursive: true });
  const targetPath = path.join(targetDir, "부산광역시-중구.md");
  fs.writeFileSync(targetPath, templateNote("부산광역시-중구", "중구"), "utf8");
  const cacheDir = path.join(vault, "SYSTEM/CACHE/region-summary-patches/부산광역시-중구");
  fs.mkdirSync(cacheDir, { recursive: true });
  const patchPath = path.join(cacheDir, "2026-09-28.json");
  fs.writeFileSync(patchPath, JSON.stringify(validPatch(), null, 2), "utf8");

  const outside = path.join(os.tmpdir(), "outside-patch.json");
  fs.writeFileSync(outside, JSON.stringify(validPatch(), null, 2), "utf8");
  assert.throws(() => patch.applySummaryPatch({ vaultRoot: vault, targetPath, patchPath: outside, dryRun: true }), /허용 경로 밖에 있습니다/);

  const dry = patch.applySummaryPatch({ vaultRoot: vault, targetPath, patchPath, dryRun: true });
  assert.equal(dry.dry_run, true);
  assert.equal(dry.changed, true);
  assert.deepEqual(dry.blocks, ["AI:PENDING:SUMMARY", "AUTO:REGION_RESEARCH_SOURCES"]);

  const applied = patch.applySummaryPatch({ vaultRoot: vault, targetPath, patchPath, execute: true });
  assert.equal(applied.changed, true);
  const after = fs.readFileSync(targetPath, "utf8");
  assert.match(after, /중구 정비사업 고시 제2025-123호/);
  assert.match(after, /jumin\.mois\.go\.kr/);

  const replay = patch.applySummaryPatch({ vaultRoot: vault, targetPath, patchPath, execute: true });
  assert.equal(replay.changed, false);
  assert.equal(replay.reason, "same_patch");

  const dropping = path.join(cacheDir, "2026-09-30.json");
  fs.writeFileSync(dropping, JSON.stringify(validPatch({
    summary_pending: { text: "S2를 버리는 패치", source_ids: ["S2"] },
    sources: [validPatch().sources[1]]
  }), null, 2), "utf8");
  const beforeDrop = fs.readFileSync(targetPath, "utf8");
  assert.throws(() => patch.applySummaryPatch({ vaultRoot: vault, targetPath, patchPath: dropping, execute: true }), /기존 출처 S1를 버립니다/);
  assert.equal(fs.readFileSync(targetPath, "utf8"), beforeDrop, "거부된 패치가 노트를 바꾸었다");

  const uncited = path.join(cacheDir, "2026-10-01.json");
  const uncitedPkg = validPatch();
  uncitedPkg.sources.push({ source_id: "S3", institution: "부산광역시", title: "인용 안 하는 문서", url: "https://www.busan.go.kr/unused", accessed_at: "2026-09-28", source_type: "official_primary" });
  fs.writeFileSync(uncited, JSON.stringify(uncitedPkg, null, 2), "utf8");
  assert.throws(() => patch.applySummaryPatch({ vaultRoot: vault, targetPath, patchPath: uncited, execute: true }), /새 출처인데 새 요약도 남은 블록도 인용하지 않습니다/);

  const second = path.join(cacheDir, "2026-09-29.json");
  fs.writeFileSync(second, JSON.stringify(validPatch({ summary_pending: { text: "다른 문장", source_ids: ["S1", "S2"] } }), null, 2), "utf8");
  assert.throws(() => patch.applySummaryPatch({ vaultRoot: vault, targetPath, patchPath: second, execute: true }), /fail-closed/);
  assert.equal(fs.readFileSync(targetPath, "utf8").includes("중구 정비사업 고시"), true);
} finally {
  fs.rmSync(vault, { recursive: true, force: true });
}

assert.deepEqual(patch.PATCH_BLOCKS, pkgCore.BLOCK_ORDER.filter((key) => key === "AI:PENDING:SUMMARY" || key === "AUTO:REGION_RESEARCH_SOURCES"));

assert.throws(() => patch.validateSupplyPipeline([{ project_name: "A", stage: "rumor", units: 100, expected_month: "2028-06", source_ids: ["S1"] }], [{ source_id: "S1" }]), /stage/);
assert.throws(() => patch.validateSupplyPipeline([{ project_name: "A", stage: "planned", units: 0, expected_month: "2028-06", source_ids: ["S1"] }], [{ source_id: "S1" }]), /양의 정수/);
assert.throws(() => patch.validateSupplyPipeline([{ project_name: "A", stage: "planned", units: 100, expected_month: "2028-06", source_ids: ["S9"] }], [{ source_id: "S1" }]), /존재하지 않는 source_id/);
assert.throws(() => patch.validateSupplyPipeline([{ project_name: "A", stage: "planned", units: 100, expected_month: "2028-13", source_ids: ["S1"] }], [{ source_id: "S1" }]), /YYYY-MM 형식/);
assert.throws(() => patch.validateSupplyPipeline([{ project_name: "A", stage: "planned", units: 100, expected_month: "2028-06", source_ids: ["S1"], extra: 1 }], [{ source_id: "S1" }]), /알 수 없는 필드/);
assert.equal(patch.validateSupplyPipeline([{ project_name: "A", stage: "planned", units: 282, expected_month: "2028-06", source_ids: ["S1"] }], [{ source_id: "S1" }]), true);

const rendered = patch.renderSupplyBlock({
  supply_pipeline: [
    { project_name: "A", stage: "approved", units: 282, expected_month: "2028-06", source_ids: ["S1"] },
    { project_name: "B", stage: "planned", units: 500, expected_month: "2031-03", source_ids: ["S2"] }
  ]
});
assert.match(rendered, /\| 13~24개월 \| A \|  \| 승인 \| 282 \| 2028-06 \| \[S1\] \|/);
assert.match(rendered, /\| 37~60개월 \| B \|  \| 계획 \| 500 \| 2031-03 \| \[S2\] \|/);
assert.equal(patch.renderSupplyBlock({ supply_pipeline: [] }), null);

const vaultSupply = fs.mkdtempSync(path.join(os.tmpdir(), "rsp-supply-"));
try {
  const targetDir = path.join(vaultSupply, "PARA/RESOURCES/Auction Regions");
  fs.mkdirSync(targetDir, { recursive: true });
  const targetPath = path.join(targetDir, "부산광역시-중구.md");
  fs.writeFileSync(targetPath, templateNote("부산광역시-중구", "중구"), "utf8");
  const cacheDir = path.join(vaultSupply, "SYSTEM/CACHE/region-summary-patches/부산광역시-중구");
  fs.mkdirSync(cacheDir, { recursive: true });
  const patchPath = path.join(cacheDir, "2026-09-28.json");
  const withSupply = validPatch();
  withSupply.supply_pipeline = [{ project_name: "중구1구역", stage: "approved", units: 282, expected_month: "2028-06", source_ids: ["S2"] }];
  fs.writeFileSync(patchPath, JSON.stringify(withSupply, null, 2), "utf8");
  const res = patch.applySummaryPatch({ vaultRoot: vaultSupply, targetPath, patchPath, execute: true });
  assert.equal(res.changed, true);
  assert.deepEqual(res.blocks, ["AI:PENDING:SUMMARY", "AUTO:REGION_RESEARCH_SOURCES", "AI:PENDING:SUPPLY_PIPELINE"]);
  const after = fs.readFileSync(targetPath, "utf8");
  assert.match(after, /중구1구역/);
  assert.match(after, /282/);
  const zonesBefore = /<!-- AI:PENDING:ZONES:START -->[\s\S]*?<!-- AI:PENDING:ZONES:END -->/.exec(after)?.[0];
  assert.ok(zonesBefore, "보호 블록이 사라지지 않아야 한다");
  const replaySupply = patch.applySummaryPatch({ vaultRoot: vaultSupply, targetPath, patchPath, execute: true });
  assert.equal(replaySupply.changed, false);

  const second = path.join(cacheDir, "2026-09-29.json");
  const other = validPatch();
  other.summary_pending = { text: "다른 문장이라 SUMMARY이 달라진다", source_ids: ["S1", "S2"] };
  other.supply_pipeline = [{ project_name: "중구2구역", stage: "planned", units: 100, expected_month: "2029-01", source_ids: ["S2"] }];
  fs.writeFileSync(second, JSON.stringify(other, null, 2), "utf8");
  const withFilledSupply = fs.readFileSync(targetPath, "utf8")
    .replace(/(<!-- AI:PENDING:SUMMARY:START -->)[\s\S]*?(<!-- AI:PENDING:SUMMARY:END -->)/, "$1\n$2")
    .replace(/(<!-- AUTO:REGION_RESEARCH_SOURCES:START -->)[\s\S]*?(<!-- AUTO:REGION_RESEARCH_SOURCES:END -->)/, "$1\n$2");
  fs.writeFileSync(targetPath, withFilledSupply, "utf8");
  assert.throws(() => patch.applySummaryPatch({ vaultRoot: vaultSupply, targetPath, patchPath: second, execute: true }), /SUPPLY_PIPELINE 블록이 이미 채워져 있습니다/);
  assert.match(fs.readFileSync(targetPath, "utf8"), /중구1구역/);
} finally {
  fs.rmSync(vaultSupply, { recursive: true, force: true });
}


const supplyOnly = { ...validPatch() };
delete supplyOnly.summary_pending;
supplyOnly.supply_heading = "> **AI 제안 · 확인 필요:** 한국부동산원 입주예정 자료 기반.";
supplyOnly.reference_month = "2026-10";
supplyOnly.supply_pipeline = [{ project_name: "시험단지", stage: "scheduled", units: 120, expected_month: "2027-03", kind: "분양", source_ids: ["S1", "S2"] }];
assert.equal(patch.validatePatch(supplyOnly), true, "요약 없이 공급만 고치는 패치는 유효해야 한다");
const scheduled = patch.renderSupplyBlock(supplyOnly);
assert.match(scheduled, /시험단지/);
assert.match(scheduled, /입주예정월 공표\(단계 미상\)/, "단계 미상 표기가 있어야 한다");
assert.match(scheduled, /| 13~24개월 |/, "reference_month 기준으로 버킷이 잡혀야 한다");
assert.throws(() => patch.validatePatch({ ...supplyOnly, reference_month: "202610" }), /reference_month/);
assert.throws(() => patch.validatePatch({ ...supplyOnly, supply_pipeline: [{ ...supplyOnly.supply_pipeline[0], kind: "기타" }] }), /kind/);

console.log("region summary patch tests: PASS");
