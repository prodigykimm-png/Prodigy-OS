"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const ROOT = path.resolve(__dirname, "../../../../../..");
const core = require(path.join(ROOT, "SYSTEM/SCRIPTS/real-estate-source-package-core.js"));
const collector = require(path.join(ROOT, "SYSTEM/SCRIPTS/real-estate-source-collect.js"));

function fixtureResult(provider) {
  const source = {
    court: "https://www.courtauction.go.kr",
    building: "https://apis.data.go.kr/1613000/BldRgstHubService/getBrTitleInfo",
    transactions: "https://k-skill-proxy.nomadamas.org/v1/real-estate",
    "official-price": "https://www.realtyprice.kr",
    "land-price": "https://www.realtyprice.kr/notice/gsindividual/search.htm"
  }[provider];
  if (provider === "court") return { status: "success", candidate: { case_number: "2026타경10001", court: "서울중앙지방법원", address: "서울특별시 강남구 역삼동 1-1", property_type: "아파트", appraisal_price: 900000000, minimum_bid: 720000000, auction_datetime: "2026-07-01" }, evidence: { schedule: [] }, raw: { items: [{ caseNumber: "2026타경10001" }] }, source_url: source };
  if (provider === "building") return { status: "success", candidate: { property_type: "공동주택" }, evidence: { records: [{ totArea: "84.99" }] }, raw: { items: [{ totArea: "84.99" }] }, source_url: source };
  if (provider === "transactions") return { status: "success", candidate: {}, evidence: { summary: { sample_count: 2 }, items: [] }, raw: { items: [], summary: { sample_count: 2 } }, source_url: source };
  if (provider === "official-price") return { status: "needs_selection", candidate: {}, evidence: {}, raw: { status: "needs_selection" }, warnings: ["동·호 선택 필요"], source_url: source };
  return { status: "failed", candidate: {}, evidence: {}, raw: { error: "upstream" }, warnings: ["상류 장애"], source_url: source, error: { code: "UPSTREAM_ERROR", message: "상류 장애" } };
}

function writeCase(vault) {
  const target = path.join(vault, "PARA/PROJECTS/Auction/case.md");
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, [
    "---", "type: auction_case", "case_number: 2026타경10001", "court: 서울중앙지방법원", "address: 서울특별시 강남구 역삼동 1-1", "region_sido: 서울특별시", "region_sigungu: 강남구", "region_dong: 역삼동", "property_type: 아파트", "appraisal_price: 800000000", "minimum_bid: 640000000", "---", "# Case", ""
  ].join("\n"), "utf8");
  return target;
}

test("Given a complete source package, When it is validated, Then only the contract fields are accepted", () => {
  const base = {
    package_id: "2026타경10001-1-20260801T000000000Z",
    case_key: "2026타경10001-1",
    observed_at: "2026-08-01T00:00:00.000Z",
    query_identity: { object_path: "PARA/PROJECTS/Auction/case.md", case_number: "2026타경10001" },
    collector: { k_skill_repository: "https://github.com/NomaDamas/k-skill", k_skill_commit: "06d017ac05317da31ab2c8d6a9accf4ad4db70ad", package_version: "1.0.0", selected_skills: core.PROVIDERS.slice() },
    providers: {}, candidate_patch: { minimum_bid: 640000000 }, evidence: {}, errors: []
  };
  for (const provider of core.PROVIDERS) base.providers[provider] = { status: "needs_identifier", source_url: "https://example.com/source", fetched_at: "2026-08-01T00:00:00.000Z", warnings: [] };
  assert.equal(core.buildPackage(base).schema_version, 1);
  const invalid = structuredClone(base);
  invalid.candidate_patch.status = "won";
  assert.throws(() => core.buildPackage(invalid), /허용되지 않은 필드/);
});

test("Given raw provider output, When a package is collected from fixtures, Then successful evidence and failed providers coexist", async () => {
  const vault = fs.mkdtempSync(path.join(os.tmpdir(), "prodigy-real-estate-") );
  const fixtures = fs.mkdtempSync(path.join(os.tmpdir(), "prodigy-real-estate-fixtures-") );
  try {
    const casePath = writeCase(vault);
    for (const provider of core.PROVIDERS) fs.writeFileSync(path.join(fixtures, collector.PROVIDER_FILES?.[provider] || ({ court: "court-auction.json", building: "building-register.json", transactions: "real-estate-transactions.json", "official-price": "housing-official-price.json", "land-price": "land-price.json" }[provider])), JSON.stringify(fixtureResult(provider)), "utf8");
    const result = await collector.collect({ vaultRoot: vault, casePath, fixtureDir: fixtures, providers: core.PROVIDERS.slice(), observedAt: "2026-08-01T00:00:00.000Z" });
    assert.match(result.package_path, /real-estate-source-packages/);
    assert.equal(result.package.candidate_patch.minimum_bid, 720000000);
    assert.equal(result.package.candidate_patch.region_sido, "서울특별시");
    assert.equal(result.package.candidate_patch.region_sigungu, "강남구");
    assert.equal(result.package.candidate_patch.region_dong, "역삼동");
    assert.equal(result.package.collector.package_version, "0.2.2");
    assert.equal(result.package.providers.court.status, "success");
    assert.equal(result.package.providers["official-price"].status, "needs_selection");
    assert.equal(result.package.providers["land-price"].status, "failed");
    const rawPath = path.join(path.dirname(result.package_path), result.package.providers.court.raw_path);
    const rawText = fs.readFileSync(rawPath, "utf8");
    assert.equal(core.verifyRawDigest(result.package.providers.court, rawText), true);
    assert.equal(core.verifyRawDigest(result.package.providers.court, `${rawText}tampered`), false);
  } finally {
    fs.rmSync(vault, { recursive: true, force: true });
    fs.rmSync(fixtures, { recursive: true, force: true });
  }
});

test("Given an address without region fields, When a provider is normalized, Then the three address regions are derived", () => {
  const normalized = collector.normalizeResult({ address: "부산광역시 해운대구 우동 10-1" }, { status: "success", candidate: { address: "부산광역시 해운대구 우동 10-1" } });
  assert.deepEqual(normalized.candidate, { address: "부산광역시 해운대구 우동 10-1", region_sido: "부산광역시", region_sigungu: "해운대구", region_dong: "우동" });
});

console.log("Real-estate source package tests loaded");
