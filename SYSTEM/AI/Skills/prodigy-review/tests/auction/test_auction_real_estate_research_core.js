"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");
const test = require("node:test");

const ROOT = path.resolve(__dirname, "../../../../../..");
const core = require(path.join(ROOT, "SYSTEM/Views/auction-real-estate-research-core.js"));
globalThis.crypto ||= require("node:crypto").webcrypto;
globalThis.AuctionRealEstateResearchCore = core;
const research = require(path.join(ROOT, "SYSTEM/Views/auction-real-estate-research.js"));

const auction = { case_number: "2026타경10001", item_number: 1, address: "서울특별시 강남구 역삼동 1-1", file: { path: "PARA/PROJECTS/Auction/case.md" } };
const pkg = { schema_version: 1, case_key: "2026타경10001-1", query_identity: { object_path: auction.file.path }, candidate_patch: { address: "서울특별시 강남구 역삼동 1-2", minimum_bid: 640000000, status: "won" }, providers: Object.fromEntries(core.PROVIDERS.map((provider) => [provider, { status: provider === "court" ? "success" : "empty", match_verified: provider === "court" }])), match_resolution: { providers: Object.fromEntries(core.PROVIDERS.map((provider) => [provider, { status: provider === "court" ? "success" : "empty", method: provider === "court" ? "exact" : "not_run", match_verified: provider === "court", reason: provider === "court" ? "exact" : "not_run" }])), candidate_sources: { address: ["court"], minimum_bid: ["court"] } }, evidence: { transactions: { summary: { sample_count: 2 } }, building: { records: [{ id: 1 }] } } };

const matchedPkg = Object.assign({}, pkg, {
  match_resolution: {
    providers: Object.fromEntries(core.PROVIDERS.map((provider) => [provider, { status: provider === "transactions" ? "resolved" : "success", method: "fixture_contract", match_verified: provider !== "land-price", scope: provider === "transactions" ? "region" : "parcel", reason: provider === "land-price" ? "lot_identity_mismatch" : "exact" }]))
  }
});
function packageForRaw(rawText, packageId = "case-1") {
  const digest = require("node:crypto").createHash("sha256").update(rawText).digest("hex");
  const providers = Object.fromEntries(core.PROVIDERS.map((provider) => [provider, provider === "court" ? { status: "success", source_url: "https://example.com/source", fetched_at: "2026-08-01T00:00:00.000Z", raw_path: "raw/court-auction.json", raw_sha256: digest, warnings: [], match_verified: true } : { status: "failed", warnings: [], match_verified: false }]));
  const resolutionProviders = Object.fromEntries(core.PROVIDERS.map((provider) => [provider, { status: provider === "court" ? "success" : "failed", method: provider === "court" ? "exact" : "not_run", query: {}, candidates: [], match_verified: provider === "court", reason: provider === "court" ? "exact" : "not_run" }]));
  return { schema_version: 1, package_id: packageId, case_key: "2026타경10001-1", observed_at: "2026-08-01T00:00:00.000Z", query_identity: { object_path: auction.file.path, object_fingerprint: "a".repeat(64), case_number: auction.case_number }, collector: { k_skill_repository: "https://github.com/NomaDamas/k-skill", k_skill_commit: "06d017ac05317da31ab2c8d6a9accf4ad4db70ad", package_version: "0.2.2", selected_skills: ["court-auction-notice-search", "building-register-search", "real-estate-search", "housing-official-price", "gongsijiga-search"] }, providers, candidate_patch: {}, evidence: {}, errors: [], match_resolution: { schema_version: 1, normalized_input: {}, resolution_method: "test", selected_identity: {}, candidate_list: [], provider_query_identity: {}, query_fingerprint: "b".repeat(64), match_verified: false, evidence_refs: [], candidate_sources: {}, providers: resolutionProviders } };
}

test("Given an auction and matching package, When fields are projected, Then protected fields are not selectable", () => {
  assert.equal(core.isPackageForAuction(pkg, auction), true);
  assert.equal(core.isPackageForAuction(Object.assign({}, pkg, { query_identity: { object_path: "/vault/Dusk/PARA/PROJECTS/Auction/case.md" } }), auction), false);
  const fields = core.selectableFields(auction, pkg);
  assert.deepEqual(fields.map((item) => item.key), ["address", "minimum_bid", "status"].filter((key) => key !== "status"));
});

test("Given provider evidence, When summary is built, Then source coverage is visible", () => {
  assert.match(core.evidenceSummary(pkg), /실거래 2건/);
  assert.match(core.evidenceSummary(pkg), /건축물대장 1건/);
  assert.equal(core.statusLabel("needs_selection"), "선택 필요");
  assert.deepEqual(core.evidenceCards({ evidence: {} }), []);
});

test("Given official price histories, When evidence cards are projected, Then latest amounts are visible instead of counts only", () => {
  const cards = core.evidenceCards({
    evidence: {
      "official-price": {
        history: [
          { year: 2018, price_won: 34800000 },
          { year: 2018, price_won: 174000000 },
          { year: 2017, price_won: 31700000 }
        ]
      },
      "land-price": {
        latest: { year: 2026, price_per_sqm: 1729000 },
        history: [{ year: 2026, price_per_sqm: 1729000 }]
      }
    }
  });
  const official = cards.find((card) => card.key === "official-price");
  const land = cards.find((card) => card.key === "land-price");
  assert.match(official.value, /2018년/u);
  assert.match(official.value, /34,800,000원/u);
  assert.match(official.value, /174,000,000원/u);
  assert.match(land.value, /2026년/u);
  assert.match(land.value, /1,729,000원\/㎡/u);
});

test("Given provider match resolution, When match rows are projected, Then unresolved identity is visible as a blocker", () => {
  const rows = core.matchResolutionRows(matchedPkg);
  assert.equal(rows.find((row) => row.provider === "court").status, "매칭 확정");
  assert.equal(rows.find((row) => row.provider === "transactions").scope, "region");
  assert.deepEqual(core.matchBlockers(matchedPkg).map((row) => row.provider), ["land-price"]);
});

test("Given an unchanged candidate field, When selectable fields are projected, Then only changed facts are shown", () => {
  const unchanged = Object.assign({}, auction, { region_sido: "서울특별시", region_sigungu: "강남구" });
  const packageWithUnchanged = Object.assign({}, pkg, { candidate_patch: Object.assign({}, pkg.candidate_patch, { region_sido: "서울특별시", region_sigungu: "서초구" }) });
  assert.deepEqual(core.selectableFields(unchanged, packageWithUnchanged).map((item) => item.key), ["address", "minimum_bid"]);
});

test("Given an Auction package, When the friendly projection is built, Then the UI receives Korean labels instead of property keys", () => {
  const overview = core.buildOverview(auction, pkg);
  assert.equal(overview.find((item) => item.key === "minimum_bid").label, "최저매각가");
  assert.equal(overview.find((item) => item.key === "minimum_bid").value, "640,000,000원");
  assert.equal(core.lifecycleLabel("watching"), "관찰");
  const input = core.buildAiSummaryInput(auction, pkg);
  assert.equal(JSON.stringify(input).includes("minimum_bid"), false);
  assert.deepEqual(core.normalizeAiSummary({ summary: "확인된 사실입니다.", key_points: ["주소 확인"], cautions: ["원문 확인"] }), {
    summary: "확인된 사실입니다.", key_points: ["주소 확인"], cautions: ["원문 확인"]
  });
});

test("Given a selection containing shell metacharacters, When the desktop command is copied, Then each value is POSIX-quoted", () => {
  assert.equal(research.shellQuote("Apt 'A; echo 위험").includes("'\"'\"'"), true);
});

test("Given a package with raw evidence, When its files are verified, Then tampering blocks approval", async () => {
  const packagePath = "SYSTEM/CACHE/real-estate-source-packages/case/2026-08-01T00:00:00.000Z/package.json";
  const rawPath = "SYSTEM/CACHE/real-estate-source-packages/case/2026-08-01T00:00:00.000Z/raw/court-auction.json";
  const rawText = `${JSON.stringify({ caseNumber: "2026타경10001" })}\n`;
  const rawFile = { path: rawPath };
  const app = { vault: { getAbstractFileByPath: (candidate) => candidate === rawPath ? rawFile : null, read: async () => rawText } };
  const pkg = packageForRaw(rawText);
  assert.equal((await research.verifyRawFiles(app, packagePath, pkg)).ok, true);
  const tampered = Object.assign({}, pkg, { providers: Object.assign({}, pkg.providers, { court: Object.assign({}, pkg.providers.court, { raw_sha256: "0".repeat(64) }) }) });
  assert.equal((await research.verifyRawFiles(app, packagePath, tampered)).ok, false);
  const traversal = Object.assign({}, pkg, { providers: Object.assign({}, pkg.providers, { court: Object.assign({}, pkg.providers.court, { raw_path: "raw/../package.json" }) }) });
  assert.equal((await research.verifyRawFiles(app, packagePath, traversal)).ok, false);
});

test("Given a package hash captured before approval, When the package file changes, Then approval verification blocks the stale package", async () => {
  const packagePath = "SYSTEM/CACHE/real-estate-source-packages/case/2026-08-01T00:00:00.000Z/package.json";
  const rawPath = "SYSTEM/CACHE/real-estate-source-packages/case/2026-08-01T00:00:00.000Z/raw/court-auction.json";
  const rawText = `${JSON.stringify({ caseNumber: "2026타경10001" })}\n`;
  const packageText = `${JSON.stringify({ schema_version: 1, package_id: "case-1" })}\n`;
  const packageFile = { path: packagePath };
  const rawFile = { path: rawPath };
  const pkg = packageForRaw(rawText);
  const packageHash = require("node:crypto").createHash("sha256").update(packageText).digest("hex");
  const app = { vault: { getAbstractFileByPath: (candidate) => candidate === packagePath ? packageFile : candidate === rawPath ? rawFile : null, read: async (file) => file === packageFile ? packageText : rawText } };
  assert.equal((await research.verifyRawFiles(app, packagePath, pkg, packageHash)).ok, true);
  const changedApp = { vault: { getAbstractFileByPath: (candidate) => candidate === packagePath ? packageFile : candidate === rawPath ? rawFile : null, read: async (file) => file === packageFile ? `${packageText}changed` : rawText } };
  assert.equal((await research.verifyRawFiles(changedApp, packagePath, pkg, packageHash)).ok, false);
});

test("Given a package written by the desktop collector, When the Vault index has not refreshed, Then the adapter still exposes the latest package", async () => {
  const packagePath = "SYSTEM/CACHE/real-estate-source-packages/2026타경10001-1/2026-08-02T00:00:00.000Z/package.json";
  const packageText = JSON.stringify({ schema_version: 1, package_id: "case-2", case_key: "2026타경10001-1", observed_at: "2026-08-02T00:00:00.000Z", query_identity: { object_path: "PARA/PROJECTS/Auction/case.md" } });
  const auctionForAdapter = { case_number: "2026타경10001", item_number: 1, file: { path: "PARA/PROJECTS/Auction/case.md" } };
  const app = { vault: {
    getFiles: () => [],
    adapter: {
      list: async (path) => path === "SYSTEM/CACHE/real-estate-source-packages/2026타경10001-1" ? { files: [], folders: ["SYSTEM/CACHE/real-estate-source-packages/2026타경10001-1/2026-08-02T00:00:00.000Z"] } : { files: [packagePath], folders: [] },
      read: async (path) => { assert.equal(path, packagePath); return packageText; }
    }
  } };
  const result = await research.readLatestPackage(app, auctionForAdapter);
  assert.equal(result.path, packagePath);
  assert.equal(result.pkg.package_id, "case-2");
});

test("Given several Auction cards, When their research state is read, Then package discovery is shared instead of scanning per card", async () => {
  const auctions = [
    { case_number: "2026타경10001", item_number: 1, file: { path: "PARA/PROJECTS/Auction/case-1.md" } },
    { case_number: "2026타경10002", item_number: 1, file: { path: "PARA/PROJECTS/Auction/case-2.md" } }
  ];
  const packagePaths = auctions.map((item, index) => `SYSTEM/CACHE/real-estate-source-packages/${item.case_number}-1/2026-08-0${index + 1}T00:00:00.000Z/package.json`);
  const files = packagePaths.map((path) => ({ path }));
  const packageText = new Map(auctions.map((item, index) => [packagePaths[index], JSON.stringify({
    schema_version: 1,
    package_id: `case-${index + 1}`,
    case_key: `${item.case_number}-1`,
    observed_at: `2026-08-0${index + 1}T00:00:00.000Z`,
    query_identity: { object_path: item.file.path }
  })]));
  let getFilesCalls = 0;
  let adapterListCalls = 0;
  const app = { vault: {
    getFiles() { getFilesCalls += 1; return files; },
    getAbstractFileByPath: (candidate) => files.find((file) => file.path === candidate) || null,
    read: async (file) => packageText.get(file.path),
    adapter: {
      list: async () => { adapterListCalls += 1; return { files: [], folders: [] }; }
    }
  } };

  const results = await Promise.all(auctions.map((item) => research.readLatestPackage(app, item)));
  assert.deepEqual(results.map((result) => result.pkg.package_id), ["case-1", "case-2"]);
  assert.equal(getFilesCalls, 1, "Vault package paths are indexed once for all cards");
  assert.equal(adapterListCalls, 1, "adapter fallback discovery is shared once for all cards");

  research.invalidatePackageIndex(app);
  await research.readLatestPackage(app, auctions[0]);
  assert.equal(getFilesCalls, 2, "explicit invalidation rebuilds the shared package index");
  assert.equal(adapterListCalls, 2);
});

test("Given the collector returns an absolute package path, When the Vault adapter reads it directly, Then the package is available before indexing", async () => {
  const packagePath = "SYSTEM/CACHE/real-estate-source-packages/2026타경10001-1/2026-08-02T00:00:00.000Z/package.json";
  const absolutePath = `/vault/Dusk/${packagePath}`;
  const packageText = JSON.stringify({ schema_version: 1, package_id: "case-absolute", case_key: "2026타경10001-1", observed_at: "2026-08-02T00:00:00.000Z", query_identity: { object_path: "PARA/PROJECTS/Auction/case.md" } });
  const app = { vault: { adapter: { basePath: "/vault/Dusk", read: async (path) => { assert.equal(path, packagePath); return packageText; }, list: async () => ({ files: [], folders: [] }) }, getFiles: () => [] } };
  const result = await research.readLatestPackage(app, auction, absolutePath);
  assert.equal(result.path, packagePath);
  assert.equal(result.pkg.package_id, "case-absolute");
});

console.log("Auction real-estate research core tests loaded");
