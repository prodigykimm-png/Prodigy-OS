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
assert.throws(() => patch.validatePatch(validPatch({ summary_pending: { text: "문장", source_ids: ["S1"] } })), /사용되지 않는 source/);
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

  const second = path.join(cacheDir, "2026-09-29.json");
  fs.writeFileSync(second, JSON.stringify(validPatch({ summary_pending: { text: "다른 문장", source_ids: ["S1", "S2"] } }), null, 2), "utf8");
  assert.throws(() => patch.applySummaryPatch({ vaultRoot: vault, targetPath, patchPath: second, execute: true }), /fail-closed/);
  assert.equal(fs.readFileSync(targetPath, "utf8").includes("중구 정비사업 고시"), true);
} finally {
  fs.rmSync(vault, { recursive: true, force: true });
}

assert.deepEqual(patch.PATCH_BLOCKS, pkgCore.BLOCK_ORDER.filter((key) => key === "AI:PENDING:SUMMARY" || key === "AUTO:REGION_RESEARCH_SOURCES"));

console.log("region summary patch tests: PASS");
