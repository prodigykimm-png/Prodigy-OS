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
  if (provider === "court") return { status: "success", candidate: { case_number: "2026타경10001", court: "서울중앙지방법원", address: "서울특별시 강남구 역삼동 1-1", property_type: "아파트", appraisal_price: 900000000, minimum_bid: 720000000, auction_datetime: "2026-07-01" }, evidence: { schedule: [] }, raw: { items: [{ caseNumber: "2026타경10001", courtCode: "B000001" }] }, source_url: source };
  if (provider === "building") return { status: "success", candidate: { property_type: "공동주택" }, evidence: { records: [{ totArea: "84.99" }] }, raw: { items: [{ totArea: "84.99" }] }, source_url: source };
  if (provider === "transactions") return { status: "success", candidate: {}, evidence: { summary: { sample_count: 2 }, items: [] }, raw: { items: [], summary: { sample_count: 2 } }, source_url: source };
  if (provider === "official-price") return { status: "needs_selection", candidate: {}, evidence: {}, raw: { status: "needs_selection" }, warnings: ["동·호 선택 필요"], source_url: source };
  return { status: "failed", candidate: {}, evidence: {}, raw: { error: "upstream" }, warnings: ["상류 장애"], source_url: source, error: { code: "UPSTREAM_ERROR", message: "상류 장애" } };
}

function writeCase(vault) {
  const target = path.join(vault, "PARA/PROJECTS/Auction/case.md");
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, [
    "---", "type: auction_case", "case_number: 2026타경10001", "court: 서울중앙지방법원", "court_code: B000001", "address: 서울특별시 강남구 역삼동 1-1", "region_sido: 서울특별시", "region_sigungu: 강남구", "region_dong: 역삼동", "property_type: 아파트", "appraisal_price: 800000000", "minimum_bid: 640000000", "---", "# Case", ""
  ].join("\n"), "utf8");
  return target;
}

test("Given the k-skill lock manifest, When it is read, Then exactly five selected skills and both file hashes are required", () => {
  const lockPath = path.join(ROOT, "SYSTEM/CONFIG/k-skill-real-estate-lock.json");
  const lock = collector.readLock(lockPath);
  assert.deepEqual(Object.keys(lock.selected_skills).sort(), core.SELECTED_SKILLS.slice().sort());
  for (const skill of core.SELECTED_SKILLS) {
    assert.match(lock.selected_skills[skill].skill_json_sha256, /^[a-f0-9]{64}$/u);
    assert.match(lock.selected_skills[skill].instruction_sha256, /^[a-f0-9]{64}$/u);
  }
  const invalidPath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "prodigy-k-skill-lock-")), "lock.json");
  try {
    const invalid = structuredClone(lock);
    delete invalid.selected_skills["real-estate-search"].instruction_sha256;
    fs.writeFileSync(invalidPath, JSON.stringify(invalid), "utf8");
    assert.throws(() => collector.readLock(invalidPath), /파일 해시가 잠겨 있지 않습니다/);
  } finally {
    fs.rmSync(path.dirname(invalidPath), { recursive: true, force: true });
  }
});

test("Given a 19-digit PNU in Auction frontmatter, When the collector reads it, Then identifier precision is preserved as a string", () => {
  const vault = fs.mkdtempSync(path.join(os.tmpdir(), "prodigy-real-estate-pnu-"));
  const target = path.join(vault, "case.md");
  try {
    fs.writeFileSync(target, "---\ntype: auction_case\ncase_number: 2026타경10001\npnu: 1168010100101230004\n---\n", "utf8");
    const record = collector.readAuctionObject(target);
    assert.equal(record.pnu, "1168010100101230004");
  } finally { fs.rmSync(vault, { recursive: true, force: true }); }
});

test("Given an empty Auction scalar, When the collector reads frontmatter, Then the next property name is not consumed as its value", () => {
  const vault = fs.mkdtempSync(path.join(os.tmpdir(), "prodigy-real-estate-empty-scalar-"));
  const target = path.join(vault, "case.md");
  try {
    fs.writeFileSync(target, "---\ntype: auction_case\ncase_number: 2025타경22459\nland_parcel_id:\nofficial_land_price_per_sqm:\n---\n", "utf8");
    const record = collector.readAuctionObject(target);
    assert.equal(record.land_parcel_id, undefined);
  } finally { fs.rmSync(vault, { recursive: true, force: true }); }
});

test("Given one official court item with legal-dong codes, When parcel identity is derived, Then PNU and address selectors are automatic", () => {
  const payload = {
    raw: { data: { dlt_rletCsDspslObjctLst: [{
      dspslObjctSeq: 1,
      rprsAdongSdCd: "26",
      rprsAdongSggCd: "230",
      rprsAdongEmdCd: "104",
      rprsAdongRiCd: "00",
      rprsLtnoAddr: "848-8",
      adongSdNm: "부산광역시",
      adongSggNm: "부산진구",
      adongEmdNm: "범천동",
      bldNm: "부산 범일 로얄팰리스 2차",
      bldDtlDts: " 8층801호"
    }] } }
  };
  assert.deepEqual(collector.deriveCourtParcelSelection({ item_number: "1" }, payload), {
    pnu: "2623010400108480008",
    lot_address: "부산광역시 부산진구 범천동 848-8",
    building_name: "부산 범일 로얄팰리스 2차",
    unit_number: "801",
    lawd_cd: "26230"
  });
  const normalized = collector.normalizeCourt({ case_number: "2025타경22459", court: "부산지방법원 본원" }, {
    found: true,
    caseInfo: { caseNumber: "20250130022459", userCaseNumber: "2025타경22459", courtName: "부산지방법원" },
    items: [{ caseNumber: "20250130022459", courtCode: "B000410", address: "부산광역시 부산진구 범천동 848-8" }]
  });
  assert.equal(normalized.candidate.case_number, "2025타경22459");
});

test("Given an official branch court response, When court facts are normalized, Then the mapped court keeps its branch name", () => {
  const normalized = collector.normalizeCourt({ court: "부산지방법원 동부지원" }, {
    found: true,
    caseInfo: {
      courtName: "부산지방법원",
      courtBranchName: "동부지원",
      userCaseNumber: "2025타경5352"
    },
    items: [{ address: "부산광역시 해운대구 우동 645-2" }]
  });
  assert.equal(normalized.candidate.court, "부산지방법원 동부지원");
});

test("Given an exact PNU, When land-price region discovery is unavailable, Then the direct parcel query returns an exact empty result", async () => {
  let captured;
  const land = {
    fetchGsiSearchList: async (query) => { captured = query; return []; },
    normalizeSearchResult: (row) => row,
    buildResponse: () => { throw new Error("empty history must not be built"); }
  };
  const payload = await collector.lookupLandPriceByIdentity({
    pnu: "2623010400108480008",
    parcel_query_address: "부산광역시 부산진구 범천동 848-8"
  }, land);
  assert.deepEqual(captured, { regCode: "26230", eubCode: "10400", san: false, bun1: "848", bun2: "8" });
  assert.equal(payload.pnu, "2623010400108480008");
  assert.equal(payload.address, "부산광역시 부산진구 범천동 848-8");
  assert.deepEqual(payload.history, []);
  assert.equal(payload.latest, null);
});

test("Given the 5352 parcel PNU, When land price is queried, Then the five-digit legal-dong suffix reaches realtyprice", async () => {
  let captured;
  const land = {
    fetchGsiSearchList: async (query) => { captured = query; return []; },
    normalizeSearchResult: (row) => row,
    buildResponse: () => { throw new Error("empty history must not be built"); }
  };
  await collector.lookupLandPriceByIdentity({
    pnu: "2635010500106450002",
    parcel_query_address: "부산광역시 해운대구 우동 645-2"
  }, land);
  assert.deepEqual(captured, { regCode: "26350", eubCode: "10500", san: false, bun1: "645", bun2: "2" });
});

test("Given proxy opt-in and an exact PNU, When the building route is selected, Then hosted proxy is used without a direct API key", () => {
  assert.equal(
    collector.buildingProxyUrl({ pnu: "2623010400108480008" }, "https://k-skill-proxy.nomadamas.org"),
    "https://k-skill-proxy.nomadamas.org/v1/building-register/title?pnu=2623010400108480008"
  );
});

test("Given a complete source package, When it is validated, Then only the contract fields are accepted", () => {
  const base = {
    package_id: "2026타경10001-1-20260801T000000000Z",
    case_key: "2026타경10001-1",
    observed_at: "2026-08-01T00:00:00.000Z",
    query_identity: { object_path: "PARA/PROJECTS/Auction/case.md", case_number: "2026타경10001", object_fingerprint: "a".repeat(64) },
    collector: { k_skill_repository: "https://github.com/NomaDamas/k-skill", k_skill_commit: "06d017ac05317da31ab2c8d6a9accf4ad4db70ad", package_version: "1.0.0", selected_skills: core.SELECTED_SKILLS.slice() },
    providers: {}, candidate_patch: { minimum_bid: 640000000 }, evidence: {}, errors: [], match_resolution: {
      schema_version: 1, normalized_input: {}, resolution_method: "fixture", selected_identity: {}, candidate_list: [], provider_query_identity: {}, query_fingerprint: "b".repeat(64), match_verified: false, evidence_refs: [], candidate_sources: { minimum_bid: ["court"] }, providers: {}
    }
  };
  for (const provider of core.PROVIDERS) {
    base.providers[provider] = { status: "needs_identifier", source_url: "https://example.com/source", fetched_at: "2026-08-01T00:00:00.000Z", warnings: [] };
    base.match_resolution.providers[provider] = { status: "needs_identifier", method: "not_run", query: {}, candidates: [], match_verified: false, reason: "not_run" };
  }
  base.providers.court.match_verified = true;
  base.match_resolution.providers.court = { status: "success", method: "exact", query: {}, candidates: [], match_verified: true, reason: "exact" };
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
    assert.equal(result.package.match_resolution.providers.court.status, "success");
    assert.equal(result.package.match_resolution.providers.court.match_verified, true);
    assert.equal(result.package.match_resolution.providers["official-price"].status, "needs_selection");
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

test("Given a candidate source from an unresolved provider, When the package is validated, Then candidate approval is rejected", () => {
  const base = {
    package_id: "case-1", case_key: "case-1", observed_at: "2026-08-01T00:00:00.000Z",
    query_identity: { object_path: "case.md", case_number: "2026타경10001", object_fingerprint: "a".repeat(64) },
    collector: { k_skill_repository: "https://github.com/NomaDamas/k-skill", k_skill_commit: "06d017ac05317da31ab2c8d6a9accf4ad4db70ad", package_version: "0.2.2", selected_skills: core.SELECTED_SKILLS.slice() },
    providers: {}, candidate_patch: { minimum_bid: 100 }, evidence: {}, errors: [], match_resolution: {
      schema_version: 1, normalized_input: {}, resolution_method: "fixture", selected_identity: {}, candidate_list: [], provider_query_identity: {}, query_fingerprint: "b".repeat(64), match_verified: false, evidence_refs: [], candidate_sources: { minimum_bid: ["court"] }, providers: {}
    }
  };
  for (const provider of core.PROVIDERS) {
    base.providers[provider] = { status: "needs_identifier", source_url: "https://example.com/source", fetched_at: "2026-08-01T00:00:00.000Z", warnings: [] };
    base.match_resolution.providers[provider] = { status: "needs_identifier", method: "not_run", query: {}, candidates: [], match_verified: false, reason: "not_run" };
  }
  assert.throws(() => core.buildPackage(base), /candidate.*매칭|match|source/iu);
});

test("Given malformed candidate values, When the package is normalized, Then structured or multiline values are rejected", () => {
  assert.throws(() => core.normalizePatch({ address: "서울특별시\n강남구" }), /한 줄/iu);
  assert.throws(() => core.normalizePatch({ minimum_bid: { value: 100 } }), /형식|숫자/iu);
});

test("Given an address without region fields, When a provider is normalized, Then the three address regions are derived", () => {
  const normalized = collector.normalizeResult({ address: "부산광역시 해운대구 우동 10-1" }, { status: "success", candidate: { address: "부산광역시 해운대구 우동 10-1" } });
  assert.deepEqual(normalized.candidate, { address: "부산광역시 해운대구 우동 10-1", region_sido: "부산광역시", region_sigungu: "해운대구", region_dong: "우동" });
});

console.log("Real-estate source package tests loaded");
