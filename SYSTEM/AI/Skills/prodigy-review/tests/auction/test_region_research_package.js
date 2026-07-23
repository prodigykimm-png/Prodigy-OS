"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "../../../../../..");
const pkgCore = require(path.join(ROOT, "SYSTEM/SCRIPTS/region-research-package-core.js"));
const apply = require(path.join(ROOT, "SYSTEM/SCRIPTS/region-research-apply.js"));
const TEMPLATE_PATH = path.join(ROOT, "SYSTEM/TEMPLATE/FORMAT/template_auction_region.md");

function templateNote(regionKey, sigungu) {
  const sido = "부산광역시";
  const title = sido + " " + sigungu;
  let c = fs.readFileSync(TEMPLATE_PATH, "utf8");
  c = c.replace(/<%\s*title\s*%>/g, title).replace(/<%\s*region_sido\s*%>/g, sido).replace(/<%\s*region_sigungu\s*%>/g, sigungu).replace(/<%\s*region_key\s*%>/g, regionKey).replace(/<%\s*date\s*%>/g, "2026-07-19");
  return c;
}

function validPackage(regionKey, overrides) {
  const base = {
    schema_version: 1,
    region_key: regionKey,
    researched_at: "2026-07-19",
    summary_pending: { text: "공식 자료 기반 한 줄 요약 후보", source_ids: ["S1", "S2"] },
    zones_pending: [
      { name: "남포·중앙 권역", character: "도심 상권 중심", caution: "상권 축소 범위 확인 필요", source_ids: ["S1"] },
      { name: "영도대교 인근", character: "관광·주거 혼재", caution: "교량 접근성 확인", source_ids: ["S2"] },
      { name: "충무복원권", character: "재개발 후보", caution: "정비 단계 확인", source_ids: ["S1"] }
    ],
    transport_life: [
      { fact: "부산교통공사 1호선 남포역이 공식 안내됨", source_ids: ["S1"] }
    ],
    risks: [
      { fact: "공식 재난 위험지도상 침수 영역 존재", kind: "official_fact", source_ids: ["S2"] },
      { fact: "AI 제안 권역 경계는 현장 확인 필요", kind: "ai_pending", source_ids: ["S1"] }
    ],
    site_visit: [
      { check: "남포역에서 실제 보행 시간 확인", reason: "지도상 거리와 실제 동선 차이", source_ids: ["S1"] }
    ],
    supply_pipeline: [
      { project_name: "공식 사업 후보", stage: "approved", units: 500, expected_month: "2028-08", source_ids: ["S1"] }
    ],
    sources: [
      { source_id: "S1", institution: "부산광역시", title: "부산도시철도 현황", url: "https://www.busan.go.kr/depart/ahrailroad01", accessed_at: "2026-07-19", source_type: "official_primary" },
      { source_id: "S2", institution: "부산광역시", title: "재난안전대책본부 침수위험지도", url: "https://www.busan.go.kr/safety/floodmap", accessed_at: "2026-07-19", source_type: "official_primary" }
    ],
    unresolved: ["주소별 침수 심도는 공식 자료만으로 확정 불가"],
    research_log: { scope: "공식 1차 출처 기반 사전조사", limitations: "사용자 현장 판단 미포함" }
  };
  return { ...base, ...overrides };
}

function mkCache(vault, regionKey, researchedAt, pkg) {
  const dir = path.join(vault, "SYSTEM/CACHE/region-research-packages", regionKey);
  fs.mkdirSync(dir, { recursive: true });
  const pkgPath = path.join(dir, researchedAt + ".json");
  fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2), "utf8");
  return pkgPath;
}

function main() {
  /* ============ validatePackage normal case ============ */
  const okPkg = validPackage("부산광역시-중구");
  assert.equal(pkgCore.validatePackage(okPkg), true);
  assert.match(pkgCore.renderAllBlocks(okPkg)["AI:PENDING:SUPPLY_PIPELINE"], /공식 사업 후보/);

  const outsidePipeline = validPackage("부산광역시-중구");
  outsidePipeline.supply_pipeline[0].expected_month = "2032-01";
  assert.throws(() => pkgCore.validatePackage(outsidePipeline), /25~60개월/);
  const duplicatePipeline = validPackage("부산광역시-중구");
  duplicatePipeline.supply_pipeline.push({ ...duplicatePipeline.supply_pipeline[0] });
  assert.throws(() => pkgCore.validatePackage(duplicatePipeline), /중복/);
  const unsupportedPipelineStage = validPackage("부산광역시-중구");
  unsupportedPipelineStage.supply_pipeline[0].stage = "rumor";
  assert.throws(() => pkgCore.validatePackage(unsupportedPipelineStage), /단계/);

  /* ============ source_id duplicate ============ */
  const dupSource = validPackage("부산광역시-중구");
  dupSource.sources.push({ ...dupSource.sources[0] });
  assert.throws(() => pkgCore.validatePackage(dupSource), /source_id 중복/);

  /* ============ non-existent source_id reference ============ */
  const badRef = validPackage("부산광역시-중구");
  badRef.summary_pending.source_ids = ["S99"];
  assert.throws(() => pkgCore.validatePackage(badRef), /존재하지 않는 source_id/);

  /* ============ http / search URL / empty URL ============ */
  const httpPkg = validPackage("부산광역시-중구");
  httpPkg.sources[0].url = "http://www.busan.go.kr/x";
  assert.throws(() => pkgCore.validatePackage(httpPkg), /https/);
  const searchPkg = validPackage("부산광역시-중구");
  searchPkg.sources[0].url = "https://www.google.com/search?q=부산";
  assert.throws(() => pkgCore.validatePackage(searchPkg), /검색 결과 URL/);
  const emptyPkg = validPackage("부산광역시-중구");
  emptyPkg.sources[0].url = "";
  assert.throws(() => pkgCore.validatePackage(emptyPkg), /URL이 비어/);

  /* ============ marker / HTML injection ============ */
  const injectPkg = validPackage("부산광역시-중구");
  injectPkg.summary_pending.text = "정상 <!-- AI:PENDING:SUMMARY:START --> 악의";
  assert.throws(() => pkgCore.validatePackage(injectPkg), /금지된 구조 문자열/);
  const scriptPkg = validPackage("부산광역시-중구");
  scriptPkg.zones_pending[0].name = "<script>alert(1)</script>";
  assert.throws(() => pkgCore.validatePackage(scriptPkg), /금지된 구조 문자열/);

  /* ============ wrong risk.kind ============ */
  const badKind = validPackage("부산광역시-중구");
  badKind.risks[0].kind = "human_verified";
  assert.throws(() => pkgCore.validatePackage(badKind), /kind가 허용값/);

  /* ============ schema_version mismatch ============ */
  const badSchema = validPackage("부산광역시-중구");
  badSchema.schema_version = 2;
  assert.throws(() => pkgCore.validatePackage(badSchema), /schema_version/);

  /* ============ zones_pending count 3-6 ============ */
  const twoZones = validPackage("부산광역시-중구");
  twoZones.zones_pending = [twoZones.zones_pending[0], twoZones.zones_pending[1]];
  assert.throws(() => pkgCore.validatePackage(twoZones), /3~6개/);

  /* ============ unused source rejected ============ */
  const unusedPkg = validPackage("부산광역시-중구");
  unusedPkg.sources.push({ source_id: "S3", institution: "기관", title: "사용안됨", url: "https://www.busan.go.kr/unused", accessed_at: "2026-07-19", source_type: "official_primary" });
  assert.throws(() => pkgCore.validatePackage(unusedPkg), /사용되지 않는 source/);

  /* ============ forbidden metrics/verification field ============ */
  const forbiddenPkg = validPackage("부산광역시-중구");
  forbiddenPkg.metrics = {};
  assert.throws(() => pkgCore.validatePackage(forbiddenPkg), /금지된 필드|알 수 없는 필드/);

  /* ============ strict schema: unknown top-level key ============ */
  const unknownTop = validPackage("부산광역시-중구");
  unknownTop.extra_field = true;
  assert.throws(() => pkgCore.validatePackage(unknownTop), /알 수 없는 필드/);

  /* ============ strict schema: unknown nested key ============ */
  const unknownNested = validPackage("부산광역시-중구");
  unknownNested.summary_pending.extra = "x";
  assert.throws(() => pkgCore.validatePackage(unknownNested), /알 수 없는 필드/);

  /* ============ strict schema: source unknown key ============ */
  const unknownSource = validPackage("부산광역시-중구");
  unknownSource.sources[0].extraKey = "x";
  assert.throws(() => pkgCore.validatePackage(unknownSource), /알 수 없는 필드/);

  /* ============ strict schema: research_log unknown key ============ */
  const unknownLog = validPackage("부산광역시-중구");
  unknownLog.research_log.extra = "x";
  assert.throws(() => pkgCore.validatePackage(unknownLog), /알 수 없는 필드/);

  /* ============ empty source_ids ============ */
  const emptySids = validPackage("부산광역시-중구");
  emptySids.summary_pending.source_ids = [];
  assert.throws(() => pkgCore.validatePackage(emptySids), /최소 1개/);

  /* ============ calendar date validation ============ */
  assert.throws(() => pkgCore.validateCalendarDate("2026-13-01", "test"), /존재하지 않는 월/);
  assert.throws(() => pkgCore.validateCalendarDate("2026-02-30", "test"), /존재하지 않는 날짜/);
  assert.throws(() => pkgCore.validateCalendarDate("2026-00-01", "test"), /존재하지 않는 월/);
  assert.throws(() => pkgCore.validateCalendarDate("2026-01-00", "test"), /존재하지 않는 날짜/);
  assert.equal(pkgCore.validateCalendarDate("2026-02-28", "test"), true);
  assert.equal(pkgCore.validateCalendarDate("2024-02-29", "test"), true); // leap year
  assert.throws(() => pkgCore.validateCalendarDate("2025-02-29", "test"), /존재하지 않는 날짜/); // non-leap

  /* ============ URL validation ============ */
  assert.throws(() => pkgCore.validateUrl("https://user:pass@example.com/x", "test"), /username\/password/);
  assert.throws(() => pkgCore.validateUrl("https://example.com/x y", "test"), /공백|angle-bracket/);
  assert.throws(() => pkgCore.validateUrl("https://example.com/\n", "test"), /개행|CR\b|LF|공백/);
  assert.throws(() => pkgCore.validateUrl("https://example.com/<x>", "test"), /angle-bracket/);
  assert.throws(() => pkgCore.validateUrl("https://www.busan.go.kr/bh금정gu", "test"), /ASCII|percent-encoded/);
  assert.equal(pkgCore.validateUrl("https://www.busan.go.kr/safe", "test"), true);
  // Regression: search-URL detector must match the `q` query KEY (anchored),
  // not the substring `q=` inside unrelated query keys like `lsiSeq=` or `land_seq=`.
  // Without this fix, legitimate government revision URLs are falsely rejected.
  assert.equal(pkgCore.validateUrl("https://www.law.go.kr/LSW/lsInfoP.do?lsiSeq=259479&viewCls=lsRvsDocInfoR", "test"), true);
  assert.equal(pkgCore.validateUrl("https://www.law.go.kr/LSW/lsInfoP.do?ancYnChk=&chrClsCd=010202&efYd=20260701&lsiSeq=286453&urlMode=lsInfoP", "test"), true);
  assert.equal(pkgCore.validateUrl("https://www.ih.co.kr/main/land/landDetail.do?land_seq=6&landDiv=1110", "test"), true);
  // Genuine `q` search-param must still be rejected (anchored on `?`, `&`, or `#`).
  assert.throws(() => pkgCore.validateUrl("https://example.com/?q=abc", "test"), /검색 결과 URL/);
  assert.throws(() => pkgCore.validateUrl("https://example.com/path?foo=1&q=bar", "test"), /검색 결과 URL/);
  assert.throws(() => pkgCore.validateUrl("https://example.com/path?x=1#q=frag", "test"), /검색 결과 URL/);
  assert.throws(() => pkgCore.validateUrl("https://example.com/path&a&q=b", "test"), /검색 결과 URL/);

  /* ============ Markdown escape: table cell | ============ */
  assert.equal(pkgCore.escapeTableCell("a|b"), "a\\|b");
  assert.equal(pkgCore.escapeTableCell("a\\b"), "a\\\\b");

  /* ============ Markdown escape: source title ============ */
  assert.throws(() => {
    const bad = validPackage("부산광역시-중구");
    bad.sources[0].title = "제목 ](https://evil.example";
    pkgCore.validatePackage(bad);
  }, /Markdown 링크 구조 파괴/);

  /* ============ zone cell | escape in rendered output ============ */
  const pipeZone = validPackage("부산광역시-중구");
  pipeZone.zones_pending[0].name = "권역1|분리";
  const rendered = pkgCore.renderZonesBlock(pipeZone);
  assert.ok(rendered.includes("권역1\\|분리"), "표 cell |가 escape되지 않음: " + rendered.match(/권역[^|]+/)?.[0]);

  /* ============ CR/LF rejection ============ */
  const crlfPkg = validPackage("부산광역시-중구");
  crlfPkg.summary_pending.text = "line1\nline2";
  assert.throws(() => pkgCore.validatePackage(crlfPkg), /CR\/LF/);

  /* ============ Vault 밖 /tmp package 거부 ============ */
  const vault = fs.mkdtempSync(path.join(os.tmpdir(), "rpkg1-"));
  try {
    const targetDir = path.join(vault, "PARA/RESOURCES/Auction Regions");
    fs.mkdirSync(targetDir, { recursive: true });
    const targetPath = path.join(targetDir, "부산광역시-중구.md");
    fs.writeFileSync(targetPath, templateNote("부산광역시-중구", "중구"), "utf8");
    // package outside vault: /tmp
    const outsidePkg = path.join(os.tmpdir(), "outside-test-" + Date.now() + ".json");
    fs.writeFileSync(outsidePkg, JSON.stringify(validPackage("부산광역시-중구"), null, 2), "utf8");
    assert.throws(() => apply.applyPackageFile({ vaultRoot: vault, targetPath, packagePath: outsidePkg, dryRun: true }), /Research package cache 폴더가 없습니다/);
    fs.unlinkSync(outsidePkg);
  } finally {
    fs.rmSync(vault, { recursive: true, force: true });
  }

  /* ============ canonical cache 안 package 허용 ============ */
  const vault2 = fs.mkdtempSync(path.join(os.tmpdir(), "rpkg2-"));
  try {
    const targetDir = path.join(vault2, "PARA/RESOURCES/Auction Regions");
    fs.mkdirSync(targetDir, { recursive: true });
    const targetPath = path.join(targetDir, "부산광역시-중구.md");
    fs.writeFileSync(targetPath, templateNote("부산광역시-중구", "중구"), "utf8");
    const pkgPath = mkCache(vault2, "부산광역시-중구", "2026-07-19", validPackage("부산광역시-중구"));
    const result = apply.applyPackageFile({ vaultRoot: vault2, targetPath, packagePath: pkgPath, dryRun: true });
    assert.equal(result.dry_run, true);
    assert.equal(result.changed, true);
  } finally {
    fs.rmSync(vault2, { recursive: true, force: true });
  }

  /* ============ region_key mismatch ============ */
  const vault3 = fs.mkdtempSync(path.join(os.tmpdir(), "rpkg3-"));
  try {
    const targetDir = path.join(vault3, "PARA/RESOURCES/Auction Regions");
    fs.mkdirSync(targetDir, { recursive: true });
    const targetPath = path.join(targetDir, "부산광역시-중구.md");
    fs.writeFileSync(targetPath, templateNote("부산광역시-중구", "중구"), "utf8");
    const pkgPath = mkCache(vault3, "부산광역시-서구", "2026-07-19", validPackage("부산광역시-서구"));
    assert.throws(() => apply.applyPackageFile({ vaultRoot: vault3, targetPath, packagePath: pkgPath, dryRun: true }), /region_key.*일치하지 않/);
  } finally {
    fs.rmSync(vault3, { recursive: true, force: true });
  }

  /* ============ marker missing ============ */
  const vault4 = fs.mkdtempSync(path.join(os.tmpdir(), "rpkg4-"));
  try {
    const targetDir = path.join(vault4, "PARA/RESOURCES/Auction Regions");
    fs.mkdirSync(targetDir, { recursive: true });
    const targetPath = path.join(targetDir, "부산광역시-중구.md");
    let broken = templateNote("부산광역시-중구", "중구");
    broken = broken.replace(/<!-- AI:PENDING:SUMMARY:START -->\n<!-- AI:PENDING:SUMMARY:END -->\n/, "");
    fs.writeFileSync(targetPath, broken, "utf8");
    const pkgPath = mkCache(vault4, "부산광역시-중구", "2026-07-19", validPackage("부산광역시-중구"));
    assert.throws(() => apply.applyPackageFile({ vaultRoot: vault4, targetPath, packagePath: pkgPath, dryRun: true }), /시작 마커가/);
  } finally {
    fs.rmSync(vault4, { recursive: true, force: true });
  }

  /* ============ marker duplicated ============ */
  const vault5 = fs.mkdtempSync(path.join(os.tmpdir(), "rpkg5-"));
  try {
    const targetDir = path.join(vault5, "PARA/RESOURCES/Auction Regions");
    fs.mkdirSync(targetDir, { recursive: true });
    const targetPath = path.join(targetDir, "부산광역시-중구.md");
    let dup = templateNote("부산광역시-중구", "중구");
    dup = dup.replace("<!-- AI:PENDING:SUMMARY:START -->", "<!-- AI:PENDING:SUMMARY:START -->\n<!-- AI:PENDING:SUMMARY:START -->\n");
    fs.writeFileSync(targetPath, dup, "utf8");
    const pkgPath = mkCache(vault5, "부산광역시-중구", "2026-07-19", validPackage("부산광역시-중구"));
    assert.throws(() => apply.applyPackageFile({ vaultRoot: vault5, targetPath, packagePath: pkgPath, dryRun: true }), /시작 마커가 2개/);
  } finally {
    fs.rmSync(vault5, { recursive: true, force: true });
  }

  /* ============ dry-run no change ============ */
  const vault6 = fs.mkdtempSync(path.join(os.tmpdir(), "rpkg6-"));
  try {
    const targetDir = path.join(vault6, "PARA/RESOURCES/Auction Regions");
    fs.mkdirSync(targetDir, { recursive: true });
    const targetPath = path.join(targetDir, "부산광역시-중구.md");
    const originalContent = templateNote("부산광역시-중구", "중구");
    fs.writeFileSync(targetPath, originalContent, "utf8");
    const pkgPath = mkCache(vault6, "부산광역시-중구", "2026-07-19", validPackage("부산광역시-중구"));
    const result = apply.applyPackageFile({ vaultRoot: vault6, targetPath, packagePath: pkgPath, dryRun: true });
    assert.equal(result.dry_run, true);
    assert.equal(result.changed, true);
    assert.equal(result.reason, "package_planned");
    assert.equal(fs.readFileSync(targetPath, "utf8"), originalContent);
  } finally {
    fs.rmSync(vault6, { recursive: true, force: true });
  }

  /* ============ actual apply ============ */
  const vault7 = fs.mkdtempSync(path.join(os.tmpdir(), "rpkg7-"));
  try {
    const targetDir = path.join(vault7, "PARA/RESOURCES/Auction Regions");
    fs.mkdirSync(targetDir, { recursive: true });
    const targetPath = path.join(targetDir, "부산광역시-중구.md");
    const originalContent = templateNote("부산광역시-중구", "중구");
    fs.writeFileSync(targetPath, originalContent, "utf8");
    const pkg = validPackage("부산광역시-중구");
    const pkgPath = mkCache(vault7, "부산광역시-중구", "2026-07-19", pkg);
    const result = apply.applyPackageFile({ vaultRoot: vault7, targetPath, packagePath: pkgPath });
    assert.equal(result.changed, true);
    assert.equal(result.dry_run, false);
    assert.equal(result.reason, "package_applied");

    const after = fs.readFileSync(targetPath, "utf8");
    // frontmatter preserved
    const fmBefore = originalContent.match(/^---\n[\s\S]*?\n---/)[0];
    const fmAfter = after.match(/^---\n[\s\S]*?\n---/)[0];
    assert.equal(fmBefore, fmAfter);

    // all 8 blocks populated
    for (const key of pkgCore.BLOCK_ORDER) {
      const startMarker = pkgCore.BLOCK_START_MARKERS[key];
      const endMarker = pkgCore.BLOCK_END_MARKERS[key];
      const s = after.indexOf(startMarker);
      const e = after.indexOf(endMarker);
      assert.ok(s >= 0, key + " start missing");
      assert.ok(e > s, key + " end missing or out of order");
      const body = after.slice(s + startMarker.length, e);
      assert.ok(body.trim() !== "", key + " body empty after apply");
    }

    // display preserved
    const dispBefore = originalContent.match(/<!-- PRODIGY_REGION_METRICS_DISPLAY[\s\S]*?<!--/)[0];
    const dispAfter = after.match(/<!-- PRODIGY_REGION_METRICS_DISPLAY[\s\S]*?<!--/)[0];
    assert.equal(dispBefore, dispAfter);

    // HUMAN markers preserved
    const humanBefore = (originalContent.match(/<!-- HUMAN[^>]*-->/g) || []).length;
    const humanAfter = (after.match(/<!-- HUMAN[^>]*-->/g) || []).length;
    assert.equal(humanBefore, humanAfter);

    // no .tmp leftover
    assert.equal(fs.readdirSync(path.dirname(targetPath)).some((n) => n.includes(".tmp-")), false);

    // idempotency
    const result2 = apply.applyPackageFile({ vaultRoot: vault7, targetPath, packagePath: pkgPath });
    assert.equal(result2.changed, false);
    assert.equal(result2.reason, "same_package");
    assert.equal(fs.readFileSync(targetPath, "utf8"), after);
  } finally {
    fs.rmSync(vault7, { recursive: true, force: true });
  }

  /* ============ existing content blocks rejected ============ */
  const vault8 = fs.mkdtempSync(path.join(os.tmpdir(), "rpkg8-"));
  try {
    const targetDir = path.join(vault8, "PARA/RESOURCES/Auction Regions");
    fs.mkdirSync(targetDir, { recursive: true });
    const targetPath = path.join(targetDir, "부산광역시-중구.md");
    let preFilled = templateNote("부산광역시-중구", "중구");
    preFilled = preFilled.replace("<!-- AI:PENDING:SUMMARY:START -->\n<!-- AI:PENDING:SUMMARY:END -->", "<!-- AI:PENDING:SUMMARY:START -->\n> 기존 요약\n<!-- AI:PENDING:SUMMARY:END -->");
    fs.writeFileSync(targetPath, preFilled, "utf8");
    const pkgPath = mkCache(vault8, "부산광역시-중구", "2026-07-19", validPackage("부산광역시-중구"));
    assert.throws(() => apply.applyPackageFile({ vaultRoot: vault8, targetPath, packagePath: pkgPath, dryRun: true }), /이미 채워져 있습니다/);
  } finally {
    fs.rmSync(vault8, { recursive: true, force: true });
  }

  /* ============ atomic write failure preserves original ============ */
  const vault9 = fs.mkdtempSync(path.join(os.tmpdir(), "rpkg9-"));
  try {
    const targetDir = path.join(vault9, "PARA/RESOURCES/Auction Regions");
    fs.mkdirSync(targetDir, { recursive: true });
    const targetPath = path.join(targetDir, "부산광역시-중구.md");
    const originalContent = templateNote("부산광역시-중구", "중구");
    fs.writeFileSync(targetPath, originalContent, "utf8");
    const pkgPath = mkCache(vault9, "부산광역시-중구", "2026-07-19", validPackage("부산광역시-중구"));
    fs.chmodSync(targetDir, 0o555);
    try {
      assert.throws(() => apply.applyPackageFile({ vaultRoot: vault9, targetPath, packagePath: pkgPath }), /rename|EACCES|EPERM|ENOENT/);
      assert.equal(fs.readFileSync(targetPath, "utf8"), originalContent);
    } finally {
      fs.chmodSync(targetDir, 0o755);
    }
  } finally {
    fs.rmSync(vault9, { recursive: true, force: true });
  }

  console.log("Region research package tests passed");
}

main();
