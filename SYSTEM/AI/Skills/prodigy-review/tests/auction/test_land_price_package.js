"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "../../../../../..");
const core = require(path.join(ROOT, "SYSTEM/SCRIPTS/land-price-package-core.js"));
const apply = require(path.join(ROOT, "SYSTEM/SCRIPTS/land-price-apply.js"));

function source() {
  return { institution: "부산광역시", title: "개별공시지가 안내", url: "https://www.busan.go.kr/depart/ahindividualprices", accessed_at: "2026-07-20", source_type: "official_primary" };
}

function casePackage() {
  return { schema_version: 1, scope: "case", target_id: "case-one", official_land_price_as_of: "2026-01-01", source: source(), land_parcel_id: "부산광역시 중구 중앙동 1가 1", official_land_price_per_sqm: 1230000, land_rights_area_sqm: 12.34 };
}

function regionPackage() {
  return { schema_version: 1, scope: "region", target_id: "부산광역시-중구", land_price_trend_as_of: "2026-01-01", source: source(), land_price_trend_yoy: 1.2, land_price_trend_scope: "부산광역시 중구 표준지 공시지가" };
}

function caseNote() {
  return ["---", "id: case-one", "type: auction_case", "land_parcel_id:", "official_land_price_per_sqm:", "official_land_price_as_of:", "official_land_price_source:", "land_rights_area_sqm:", "appraisal_price: 500000000", "market_sale_price: 550000000", "---", "# Case", ""].join("\n");
}

function regionNote() {
  return ["---", "type: auction_region", "region_sido: 부산광역시", "region_sigungu: 중구", "land_price_trend_yoy:", "land_price_trend_as_of:", "land_price_trend_scope:", "land_price_trend_source:", "---", "# Region", "", "<!-- AUTO:REGION_LAND_PRICE:START -->", "<!-- AUTO:REGION_LAND_PRICE:END -->", ""].join("\n");
}

function writePackage(vault, pkg) {
  const dir = path.join(vault, "SYSTEM/CACHE/land-price-packages", pkg.scope, pkg.target_id);
  fs.mkdirSync(dir, { recursive: true });
  const packagePath = path.join(dir, `${pkg.official_land_price_as_of ?? pkg.land_price_trend_as_of}.json`);
  fs.writeFileSync(packagePath, JSON.stringify(pkg, null, 2), "utf8");
  return packagePath;
}

function main() {
  assert.equal(core.validatePackage(casePackage()), true);
  assert.equal(core.validatePackage(regionPackage()), true);
  const invalidUrl = casePackage();
  invalidUrl.source.url = "http://example.com";
  assert.throws(() => core.validatePackage(invalidUrl), /https/);
  const invalidDate = casePackage();
  invalidDate.official_land_price_as_of = "2026-02-30";
  assert.throws(() => core.validatePackage(invalidDate), /실제 달력 날짜/);
  const structuralTitle = casePackage();
  structuralTitle.source.title = "[가짜 출처](https://example.com)";
  assert.throws(() => core.validatePackage(structuralTitle), /구조 문자/);
  const calculatedTotal = casePackage();
  calculatedTotal.official_land_price_total = 1;
  assert.throws(() => core.validatePackage(calculatedTotal), /알 수 없는 필드/);

  const vault = fs.mkdtempSync(path.join(os.tmpdir(), "land-price-"));
  try {
    const casePath = path.join(vault, "PARA/PROJECTS/Auction/case-one.md");
    const regionPath = path.join(vault, "PARA/RESOURCES/Auction Regions/부산광역시-중구.md");
    fs.mkdirSync(path.dirname(casePath), { recursive: true });
    fs.mkdirSync(path.dirname(regionPath), { recursive: true });
    fs.writeFileSync(casePath, caseNote(), "utf8");
    fs.writeFileSync(regionPath, regionNote(), "utf8");
    const casePackagePath = writePackage(vault, casePackage());
    const regionPackagePath = writePackage(vault, regionPackage());

    const caseDryRun = apply.applyPackageFile({ vaultRoot: vault, targetPath: casePath, packagePath: casePackagePath, dryRun: true });
    assert.equal(caseDryRun.reason, "package_planned");
    assert.equal(fs.readFileSync(casePath, "utf8"), caseNote());
    const caseApplied = apply.applyPackageFile({ vaultRoot: vault, targetPath: casePath, packagePath: casePackagePath });
    assert.equal(caseApplied.reason, "package_applied");
    const appliedCase = fs.readFileSync(casePath, "utf8");
    assert.match(appliedCase, /^official_land_price_per_sqm: 1230000$/m);
    assert.match(appliedCase, /^official_land_price_source: "https:\/\/www\.busan\.go\.kr\/depart\/ahindividualprices"$/m);
    assert.match(appliedCase, /^appraisal_price: 500000000$/m);
    assert.equal(apply.applyPackageFile({ vaultRoot: vault, targetPath: casePath, packagePath: casePackagePath }).reason, "same_package");

    const regionApplied = apply.applyPackageFile({ vaultRoot: vault, targetPath: regionPath, packagePath: regionPackagePath });
    assert.equal(regionApplied.reason, "package_applied");
    const appliedRegion = fs.readFileSync(regionPath, "utf8");
    assert.match(appliedRegion, /^land_price_trend_yoy: 1\.2$/m);
    assert.match(appliedRegion, /공시지가 변동률: 1\.20%/);
    assert.match(appliedRegion, /공시지가를 시세·감정가·낙찰가로 해석하지 않음/);
    assert.equal(apply.applyPackageFile({ vaultRoot: vault, targetPath: regionPath, packagePath: regionPackagePath }).reason, "same_package");

    assert.throws(() => apply.applyPackageFile({ vaultRoot: vault, targetPath: casePath, packagePath: regionPackagePath, dryRun: true }), /허용 경로|scope|target/);
  } finally {
    fs.rmSync(vault, { recursive: true, force: true });
  }
  console.log("Land price package tests passed");
}

main();
