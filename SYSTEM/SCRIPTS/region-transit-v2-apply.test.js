"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "../..");
const v2apply = require(path.join(ROOT, "SYSTEM/SCRIPTS/region-transit-v2-apply.js"));

const noteTemplate = (regionKey, sido, sigungu) => {
  const blocks = [
    "AI:PENDING:SUMMARY", "AI:PENDING:ZONES", "AI:PENDING:RISKS", "AI:PENDING:SITE_VISIT",
    "AI:PENDING:SUPPLY_PIPELINE", "AUTO:REGION_RESEARCH_SOURCES", "AUTO:REGION_RESEARCH_LOG"
  ];
  const body = blocks
    .map((key) => `<!-- ${key}:START -->\n> ${key} 내용\n<!-- ${key}:END -->`)
    .join("\n\n");
  return [
    "---",
    "type: auction_region",
    `title: ${sido} ${sigungu}`,
    `region_sido: ${sido}`,
    `region_sigungu: ${sigungu}`,
    "status: active",
    "---",
    "",
    `## ${sido} ${sigungu}`,
    "",
    body,
    "",
    "## 교통·생활",
    "",
    "<!-- AI:PENDING:TRANSPORT_LIFE:START -->",
    "> 교통 내용",
    "<!-- AI:PENDING:TRANSPORT_LIFE:END -->",
    "",
    "<!-- AUTO:REGION_TRANSIT:START -->",
    "<!-- AUTO:REGION_TRANSIT:END -->",
    ""
  ].join("\n");
};

function makeVault() {
  const vault = fs.mkdtempSync(path.join(os.tmpdir(), "rtransitv2-"));
  const noteDir = path.join(vault, "PARA/RESOURCES/Auction Regions");
  fs.mkdirSync(noteDir, { recursive: true });
  fs.writeFileSync(path.join(noteDir, "서울특별시-강남구.md"), noteTemplate("서울특별시-강남구", "서울특별시", "강남구"), "utf8");

  const candidateDir = path.join(vault, "SYSTEM/CACHE/region-transit/candidates/v2");
  fs.mkdirSync(candidateDir, { recursive: true });
  const rawDir = path.join(vault, "SYSTEM/CACHE/region-transit/raw/kric");
  fs.mkdirSync(rawDir, { recursive: true });
  const rawFixture = "xlsx-fixture";
  fs.writeFileSync(path.join(rawDir, "urban-rail-stations-20260630.xlsx"), rawFixture, "utf8");
  const rawSha = require("node:crypto").createHash("sha256").update(Buffer.from(rawFixture, "utf8")).digest("hex");
  const crypto = require("node:crypto");
  const station = {
    station_code: "222",
    station_name: "강남",
    line_name: "2호선",
    operator: "서울교통공사",
    operator_evidence_url: "https://data.kric.go.kr/rips/M_01_01/detail.do?id=32",
    official_address: "서울특별시 강남구 강남대로 620-2",
    station_evidence_url: "https://data.kric.go.kr/rips/M_01_01/detail.do?id=32",
    coordinate: { lat: 37.497, lng: 127.027, source_url: "https://data.kric.go.kr/rips/M_01_01/detail.do?id=32" },
    region_assignment: { region_key: "서울특별시-강남구", method: "official_address_admin_parse", source_field: "official_address" },
    raw_path: "raw/kric/urban-rail-stations-20260630.xlsx",
    raw_sha256: rawSha,
    data_as_of: "2026-06-30 00:00:00"
  };
  const providerMap = {
    schema_version: 2,
    status: "candidate_not_publishable",
    network_allowed: false,
    region_inputs_reachable: false,
    provider_id: "kric-test",
    operator: "서울교통공사",
    operator_evidence_url: "https://data.kric.go.kr/rips/M_01_01/detail.do?id=32",
    assignment_policy: { method: "official_address_admin_parse" },
    source_snapshot_sha256: rawSha,
    source_snapshot_path: "SYSTEM/CACHE/region-transit/raw/kric/urban-rail-stations-20260630.xlsx",
    station_count: 1,
    stations: [station]
  };
  const providerPath = path.join(candidateDir, "kric-test.json");
  const providerRaw = JSON.stringify(providerMap, null, 2);
  fs.writeFileSync(providerPath, providerRaw, "utf8");
  const providerSha = crypto.createHash("sha256").update(Buffer.from(providerRaw, "utf8")).digest("hex");

  const manifest = {
    generated_at: "2026-09-29T00:00:00.000Z",
    status: "candidate_not_publishable",
    network_allowed: false,
    region_inputs_reachable: false,
    reason: "test",
    input: { path: "SYSTEM/CACHE/region-transit/candidates/v2/kric-urban-stations-seoul-gyeonggi-candidate.json", raw_sha256: rawSha },
    accepted_station_count: 1,
    unresolved: [],
    outputs: [{ provider_id: "kric-test", operator: "서울교통공사", station_count: 1, path: "SYSTEM/CACHE/region-transit/candidates/v2/kric-test.json", sha256: providerSha }]
  };
  const manifestRaw = JSON.stringify(manifest, null, 2);
  fs.writeFileSync(path.join(candidateDir, "manifest.json"), manifestRaw, "utf8");
  const manifestSha = crypto.createHash("sha256").update(Buffer.from(manifestRaw, "utf8")).digest("hex");

  const approvalDir = path.join(vault, "SYSTEM/CACHE/region-transit/approval");
  fs.mkdirSync(approvalDir, { recursive: true });
  const approvalPath = path.join(approvalDir, "kric-region-approval.json");
  const writeApproval = (overrides) => fs.writeFileSync(approvalPath, JSON.stringify({
    schema_version: 1,
    approved_at: "2026-09-29T00:00:00.000Z",
    approved_by: "test-owner",
    manifest_sha256: manifestSha,
    scope_note: "test",
    ...overrides
  }, null, 2), "utf8");

  return { vault, approvalPath, writeApproval, manifestSha, candidateDir };
}

{
  const { vault, approvalPath, writeApproval, manifestSha } = makeVault();
  try {
    const target = path.join(vault, "PARA/RESOURCES/Auction Regions/서울특별시-강남구.md");
    const before = fs.readFileSync(target, "utf8");

    writeApproval({ approved_by: "" });
    assert.throws(() => v2apply.applyRegions({ vaultRoot: vault, execute: true, regionKeys: ["서울특별시-강남구"] }), /approved_by/, "승인자 없는 봉투는 거절되어야 한다");
    assert.equal(fs.readFileSync(target, "utf8"), before, "거부된 실행이 노트를 바꾸었다");

    writeApproval({ manifest_sha256: "0".repeat(64) });
    assert.throws(() => v2apply.applyRegions({ vaultRoot: vault, execute: true, regionKeys: ["서울특별시-강남구"] }), /manifest 해시/, "해시가 다른 봉투는 거절되어야 한다");
    assert.equal(fs.readFileSync(target, "utf8"), before);

    writeApproval({});
    const result = v2apply.applyRegions({ vaultRoot: vault, execute: true, regionKeys: ["서울특별시-강남구"] });
    assert.equal(result.applied_regions, 1);
    assert.equal(result.covered_regions, 1);
    const after = fs.readFileSync(target, "utf8");
    assert.match(after, /KRIC 도시철도 공식 스냅샷 확인 역/);
    assert.match(after, /2호선 · 강남/);
    assert.match(after, /official_address_admin_parse/);
    assert.match(after, /<!-- AI:PENDING:ZONES:START -->\n> AI:PENDING:ZONES 내용\n<!-- AI:PENDING:ZONES:END -->/, "보호 블록이 바뀌었다");

    const replay = v2apply.applyRegions({ vaultRoot: vault, execute: true, regionKeys: ["서울특별시-강남구"] });
    assert.equal(replay.applied_regions, 0, "재실행은 no-op이어야 한다");

    const dry = v2apply.applyRegions({ vaultRoot: vault, dryRun: true, regionKeys: ["서울특별시-강남구"] });
    assert.equal(dry.applied_regions, 0);
    assert.equal(dry.results[0].status, "same");
  } finally {
    fs.rmSync(vault, { recursive: true, force: true });
  }
}

{
  const { vault, candidateDir, writeApproval } = makeVault();
  try {
    const providerPath = path.join(candidateDir, "kric-test.json");
    const map = JSON.parse(fs.readFileSync(providerPath, "utf8"));
    map.region_inputs_reachable = true;
    const crypto = require("node:crypto");
    const raw = JSON.stringify(map, null, 2);
    fs.writeFileSync(providerPath, raw, "utf8");
    const manifestPath = path.join(candidateDir, "manifest.json");
    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    manifest.outputs[0].sha256 = crypto.createHash("sha256").update(Buffer.from(raw, "utf8")).digest("hex");
    const manifestRaw = JSON.stringify(manifest, null, 2);
    fs.writeFileSync(manifestPath, manifestRaw, "utf8");
    writeApproval({ manifest_sha256: crypto.createHash("sha256").update(Buffer.from(manifestRaw, "utf8")).digest("hex") });

    const before = fs.readFileSync(path.join(vault, "PARA/RESOURCES/Auction Regions/서울특별시-강남구.md"), "utf8");
    assert.throws(() => v2apply.applyRegions({ vaultRoot: vault, execute: true, regionKeys: ["서울특별시-강남구"] }), /격리 표시/);
    assert.equal(fs.readFileSync(path.join(vault, "PARA/RESOURCES/Auction Regions/서울특별시-강남구.md"), "utf8"), before);
  } finally {
    fs.rmSync(vault, { recursive: true, force: true });
  }
}

console.log("region transit v2 apply tests passed");
