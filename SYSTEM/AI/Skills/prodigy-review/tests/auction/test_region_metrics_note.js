"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const ROOT = path.resolve(__dirname, "../../../../../..");
const noteCore = require(path.join(ROOT, "SYSTEM/SCRIPTS/region-metrics-note-core.js"));
const apply = require(path.join(ROOT, "SYSTEM/SCRIPTS/region-metrics-apply.js"));

function snapshot(overrides = {}) {
  const metrics = {
    sale_volume_3m: { value: 435, unit: "건", as_of: "2026-05-01", provider: "reb_rone_public_table", source_id: "A_2024_00554", raw_hash: "a".repeat(64), verification: "unverified" },
    housing_stock: { value: 48544, unit: "호", as_of: "2025-09-01", provider: "reb_stock", source_id: "15106861", raw_hash: "b".repeat(64), verification: "unverified" },
    sale_turnover_rate: { value: 0.03584377, unit: "ratio", as_of: "2026-05-01", provider: "derived", source_id: "sale_volume_3m+housing_stock", raw_hash: "c".repeat(64), verification: "unverified" },
    sale_price_change_yoy: { value: -0.988757, unit: "%", as_of: "2026-05-01", provider: "reb_rone_public_table", source_id: "A_2024_00045", raw_hash: "d".repeat(64), verification: "unverified" },
    jeonse_ratio: { value: 69.96933, unit: "%", as_of: "2026-05-01", provider: "reb_rone_public_table", source_id: "A_2024_00073", raw_hash: "e".repeat(64), verification: "unverified" },
    move_in_12m: { value: 415, unit: "세대", as_of: "2025-12-01", provider: "reb_supply", source_id: "15111714", raw_hash: "f".repeat(64), verification: "unverified" },
    move_in_24m: { value: 1409, unit: "세대", as_of: "2025-12-01", provider: "reb_supply", source_id: "15111714", raw_hash: "1".repeat(64), verification: "unverified" },
    move_in_36m: { value: null, unit: "세대", as_of: "2025-12-01", provider: "reb_supply", source_id: "15111714", raw_hash: "1".repeat(64), verification: "unverified" },
    move_in_48m: { value: null, unit: "세대", as_of: "2025-12-01", provider: "reb_supply", source_id: "15111714", raw_hash: "1".repeat(64), verification: "unverified" },
    move_in_60m: { value: null, unit: "세대", as_of: "2025-12-01", provider: "reb_supply", source_id: "15111714", raw_hash: "1".repeat(64), verification: "unverified" },
    households: { value: 105378, unit: "세대", as_of: "2026-05-01", provider: "mois_jumin_statmonth_csv", source_id: "jumin_statmonth_csv", raw_hash: "2".repeat(64), verification: "unverified" },
    household_change_yoy: { value: 0.478661, unit: "%", as_of: "2026-05-01", provider: "mois_jumin_statmonth_csv", source_id: "jumin_statmonth_csv", raw_hash: "3".repeat(64), verification: "unverified" },
    auction_bid_rate_6m: { value: null, unit: "%", as_of: null, provider: "court_auction", source_id: null, raw_hash: null, verification: "n/a" }
  };
  return {
    schema_version: 1,
    snapshot_id: "2026-05-01_20260719T001058Z",
    region_key: "부산광역시-금정구",
    metrics_as_of: "2026-05-01",
    fetched_at: "2026-07-19T00:10:58.135Z",
    verification_status: "unverified",
    metrics,
    evidence: {
      volume_months: ["202603", "202604", "202605"],
      supply_coverage: {
        basis_month: "2025-12",
        source_month_min: "2026-06",
        source_month_max: "2028-01",
        matched_rows: 3,
        observed_horizon_months: 25,
        unavailable_horizons: [36, 48, 60]
      }
    },
    ...overrides
  };
}

function note() {
  return `---
type: auction_region
title: 부산광역시 금정구
region_sido: 부산광역시
region_sigungu: 금정구
status: active
updated: 2026-07-18
metrics_as_of:
metrics_scope: sigungu
metrics_source:
source_as_of:
verification_status: unverified
housing_stock_basis: reb_public_price_apartment_units
sale_price_change_basis: reb_apt_price_index_yoy
sale_volume_3m:
housing_stock:
sale_turnover_rate:
sale_price_change_yoy:
jeonse_ratio:
move_in_12m:
move_in_24m:
move_in_36m:
move_in_48m:
move_in_60m:
households:
household_change_yoy:
auction_bid_rate_6m:
cssclasses:
  - hide-properties_editing
---

# 부산광역시 금정구

## 한 줄 요약

<!-- HUMAN: summary — monthly adapter must not edit -->
이 문장은 보존한다.

## 시장 지표 스냅샷

<!-- PRODIGY_REGION_METRICS_DISPLAY: regenerated from frontmatter; do not hand-edit values -->
| 지표 | 값 | 단위 | 비고 |
|------|-----|------|------|
| 이전 표 | 1 | 값 | 교체 대상 |

## 지표 히스토리

<!-- PRODIGY_REGION_METRICS_HISTORY -->
> [!abstract]- 원본 지표 이력
> \`\`\`json
> {
>   "schema_version": 1,
>   "region_key": "부산광역시-금정구",
>   "snapshots": []
> }
> \`\`\`

## 권역 분단 (같은 구 안)

<!-- HUMAN:LOCKED -->
사용자 권역 메모를 보존한다.

## 시장·공급

<!-- AUTO:REGION_MARKET:START -->
<!-- AUTO:REGION_MARKET:END -->
`;
}

function main() {
  const rendered = noteCore.applySnapshotToNote(note(), snapshot(), { updatedDate: "2026-07-19" });
  assert.equal(rendered.changed, true);
  assert.match(rendered.content, /^metrics_as_of: 2026-05-01$/m);
  assert.match(rendered.content, /^metrics_source: region_metrics_v1_2_5$/m);
  assert.match(rendered.content, /^source_as_of: 2026-07-19$/m);
  assert.match(rendered.content, /^sale_volume_3m: 435$/m);
  assert.match(rendered.content, /^move_in_36m:$/m);
  assert.match(rendered.content, /^auction_bid_rate_6m:$/m);
  assert.match(rendered.content, /\| 매매 회전율 \| 3\.58 \| % \| 파생 vol×4\/stock · 표시 ×100 \|/);
  assert.match(rendered.content, /\| 매매가 변동 YoY \| -0\.99 \| % \|/);
  assert.match(rendered.content, /기준월 2026-05 · 자동 생성 · 사람 검증 전/);
  assert.match(rendered.content, /최근 공표 3개월 매매 거래량은 435건/);
  assert.match(rendered.content, /공시 아파트 재고는 48,544호/);
  assert.match(rendered.content, /입주 예정 물량은 12개월 415세대, 24개월 누적 1,409세대/);
  assert.match(rendered.content, /36개월 —, 48개월 —, 60개월 —/);
  assert.match(rendered.content, /> \[!abstract\]- 원본 지표 이력\n> \`\`\`json/);
  assert.match(rendered.content, /"snapshot_id": "2026-05-01_20260719T001058Z"/);
  assert.match(rendered.content, /"source_as_of": "2026-07-19"/);
  assert.match(rendered.content, /이 문장은 보존한다/);
  assert.match(rendered.content, /사용자 권역 메모를 보존한다/);

  const legacyHistory = note().replace(
    `> [!abstract]- 원본 지표 이력
> \`\`\`json
> {
>   "schema_version": 1,
>   "region_key": "부산광역시-금정구",
>   "snapshots": []
> }
> \`\`\``,
    `<details>
<summary>원본 지표 이력</summary>

\`\`\`json
{
  "schema_version": 1,
  "region_key": "부산광역시-금정구",
  "snapshots": []
}
\`\`\`
</details>`
  );
  const legacyRendered = noteCore.applySnapshotToNote(legacyHistory, snapshot(), { updatedDate: "2026-07-19" });
  assert.equal(legacyRendered.changed, true);
  assert.match(legacyRendered.content, /"snapshot_id": "2026-05-01_20260719T001058Z"/);

  const repeated = noteCore.applySnapshotToNote(rendered.content, snapshot(), { updatedDate: "2026-07-20" });
  assert.equal(repeated.changed, false);
  assert.equal(repeated.reason, "same_raw_snapshot");
  assert.equal(repeated.content, rendered.content);

  const humanVerified = rendered.content
    .replace(/^verification_status: unverified$/m, "verification_status: verified")
    .replace('"verification_status": "unverified"', '"verification_status": "verified"');
  const preservedApproval = noteCore.applySnapshotToNote(humanVerified, snapshot(), { updatedDate: "2026-07-20" });
  assert.equal(preservedApproval.changed, false);
  assert.match(preservedApproval.content, /^verification_status: verified$/m);

  const staleAuto = humanVerified.replace(
    /<!-- AUTO:REGION_MARKET:START -->[\s\S]*?<!-- AUTO:REGION_MARKET:END -->/,
    "<!-- AUTO:REGION_MARKET:START -->\n<!-- AUTO:REGION_MARKET:END -->"
  );
  const refreshedAuto = noteCore.applySnapshotToNote(staleAuto, snapshot(), { updatedDate: "2026-07-20" });
  assert.equal(refreshedAuto.changed, true);
  assert.equal(refreshedAuto.reason, "refreshed_auto_sections");
  assert.match(refreshedAuto.content, /^verification_status: verified$/m);
  assert.match(refreshedAuto.content, /최근 공표 3개월 매매 거래량은 435건/);

  const corrected = snapshot();
  corrected.metrics.sale_volume_3m.value = 436;
  corrected.metrics.sale_volume_3m.raw_hash = "4".repeat(64);
  const replaced = noteCore.applySnapshotToNote(rendered.content, corrected, { updatedDate: "2026-07-20" });
  assert.equal(replaced.reason, "replaced_snapshot");
  assert.equal((replaced.content.match(/"snapshot_id": "2026-05-01_20260719T001058Z"/g) ?? []).length, 1);
  assert.match(replaced.content, /^sale_volume_3m: 436$/m);

  assert.throws(
    () => noteCore.applySnapshotToNote(note(), snapshot({ region_key: "인천광역시-계양구" }), { updatedDate: "2026-07-19" }),
    /지역키/
  );
  const verified = snapshot();
  verified.verification_status = "verified";
  verified.metrics.sale_volume_3m.verification = "verified";
  assert.throws(() => noteCore.applySnapshotToNote(note(), verified, { updatedDate: "2026-07-19" }), /unverified/);
  const incomplete = snapshot();
  delete incomplete.metrics.jeonse_ratio;
  assert.throws(() => noteCore.applySnapshotToNote(note(), incomplete, { updatedDate: "2026-07-19" }), /필수 지표/);
  const wrongProvider = snapshot();
  wrongProvider.metrics.jeonse_ratio.provider = "reb_jeonse_ratio_file";
  assert.throws(() => noteCore.applySnapshotToNote(note(), wrongProvider, { updatedDate: "2026-07-19" }), /출처 계약/);
  assert.throws(() => noteCore.applySnapshotToNote(note().replace('"snapshots": []', '"snapshots": ['), snapshot(), { updatedDate: "2026-07-19" }), /히스토리 JSON/);
  const twoFences = note().replace("> \`\`\`\n\n## 권역", "> \`\`\`\n> \`\`\`json\n> {}\n> \`\`\`\n\n## 권역");
  assert.throws(() => noteCore.applySnapshotToNote(twoFences, snapshot(), { updatedDate: "2026-07-19" }), /정확히 1개/);

  const vault = fs.mkdtempSync(path.join(os.tmpdir(), "region-note-writer-"));
  try {
    const target = path.join(vault, "PARA/RESOURCES/Auction Regions/부산광역시-금정구.md");
    const snapshotPath = path.join(vault, "SYSTEM/CACHE/region-metrics/부산광역시-금정구/run/snapshot.json");
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.mkdirSync(path.dirname(snapshotPath), { recursive: true });
    fs.writeFileSync(target, note(), "utf8");
    fs.writeFileSync(snapshotPath, `${JSON.stringify(snapshot(), null, 2)}\n`, "utf8");
    const dryRun = apply.applySnapshotFile({ vaultRoot: vault, targetPath: target, snapshotPath, updatedDate: "2026-07-19", dryRun: true });
    assert.equal(dryRun.changed, true);
    assert.equal(dryRun.dry_run, true);
    assert.equal(fs.readFileSync(target, "utf8"), note());
    const result = apply.applySnapshotFile({ vaultRoot: vault, targetPath: target, snapshotPath, updatedDate: "2026-07-19", execute: true });
    assert.equal(result.changed, true);
    assert.match(fs.readFileSync(target, "utf8"), /^housing_stock: 48544$/m);
    assert.equal(fs.readdirSync(path.dirname(target)).some((name) => name.includes(".tmp-")), false);

    const beforeFailure = fs.readFileSync(target, "utf8");
    fs.writeFileSync(snapshotPath, "{broken", "utf8");
    assert.throws(() => apply.applySnapshotFile({ vaultRoot: vault, targetPath: target, snapshotPath, updatedDate: "2026-07-19", execute: true }), /스냅샷 JSON/);
    assert.equal(fs.readFileSync(target, "utf8"), beforeFailure);

    assert.deepEqual(
      apply.parseArgs(["--vault", vault, "--target", target, "--snapshot", snapshotPath, "--dry-run"]),
      { vaultRoot: vault, dryRun: true, execute: false, targetPath: target, snapshotPath }
    );
  } finally {
    fs.rmSync(vault, { recursive: true, force: true });
  }

  console.log("Region metrics note writer tests passed");
}

main();

test("Given a region note with populated AUTO:REGION_TRANSIT, When applySnapshotToNote is called, Then transit block is byte-for-byte preserved", () => {
  const s = snapshot();
  // Use the existing note() function which has all required markers, then inject transit block
  const baseNote = note();
  const transitInjection = "\n## 교통·생활\n\n<!-- AUTO:REGION_TRANSIT:START -->\n테스트 보존 내용\n<!-- AUTO:REGION_TRANSIT:END -->\n\n<!-- AI:PENDING:TRANSPORT_LIFE:START -->\n<!-- AI:PENDING:TRANSPORT_LIFE:END -->";
  const noteBody = baseNote + transitInjection;
  const result = noteCore.applySnapshotToNote(noteBody, s);
  assert.ok(result.content.includes("<!-- AUTO:REGION_TRANSIT:START -->"), "transit start marker must exist");
  assert.ok(result.content.includes("<!-- AUTO:REGION_TRANSIT:END -->"), "transit end marker must exist");
  const startIdx = result.content.indexOf("<!-- AUTO:REGION_TRANSIT:START -->");
  const endIdx = result.content.indexOf("<!-- AUTO:REGION_TRANSIT:END -->");
  const body = result.content.slice(startIdx + "<!-- AUTO:REGION_TRANSIT:START -->".length, endIdx).trim();
  assert.equal(body, "테스트 보존 내용", "transit block body must be byte-for-byte preserved");
});