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
const pkg = { schema_version: 1, case_key: "2026타경10001-1", query_identity: { object_path: auction.file.path }, candidate_patch: { address: "서울특별시 강남구 역삼동 1-2", minimum_bid: 640000000, status: "won" }, providers: { court: { status: "success" }, building: { status: "empty" } }, evidence: { transactions: { summary: { sample_count: 2 } }, building: { records: [{ id: 1 }] } } };

test("Given an auction and matching package, When fields are projected, Then protected fields are not selectable", () => {
  assert.equal(core.isPackageForAuction(pkg, auction), true);
  const fields = core.selectableFields(auction, pkg);
  assert.deepEqual(fields.map((item) => item.key), ["address", "minimum_bid", "status"].filter((key) => key !== "status"));
});

test("Given provider evidence, When summary is built, Then source coverage is visible", () => {
  assert.match(core.evidenceSummary(pkg), /실거래 2건/);
  assert.match(core.evidenceSummary(pkg), /건축물대장 1건/);
  assert.equal(core.statusLabel("needs_selection"), "선택 필요");
});

test("Given a package with raw evidence, When its files are verified, Then tampering blocks approval", async () => {
  const packagePath = "SYSTEM/CACHE/real-estate-source-packages/case/2026-08-01T00:00:00.000Z/package.json";
  const rawPath = "SYSTEM/CACHE/real-estate-source-packages/case/2026-08-01T00:00:00.000Z/raw/court-auction.json";
  const rawText = `${JSON.stringify({ caseNumber: "2026타경10001" })}\n`;
  const rawFile = { path: rawPath };
  const app = { vault: { getAbstractFileByPath: (candidate) => candidate === rawPath ? rawFile : null, read: async () => rawText } };
  const providers = Object.fromEntries(core.PROVIDERS.map((provider) => [provider, { status: provider === "court" ? "success" : "failed", raw_path: provider === "court" ? "raw/court-auction.json" : "", raw_sha256: provider === "court" ? require("node:crypto").createHash("sha256").update(rawText).digest("hex") : "" }]));
  const pkg = { schema_version: 1, package_id: "case-1", providers };
  assert.equal((await research.verifyRawFiles(app, packagePath, pkg)).ok, true);
  const tampered = Object.assign({}, pkg, { providers: Object.assign({}, providers, { court: Object.assign({}, providers.court, { raw_sha256: "0".repeat(64) }) }) });
  assert.equal((await research.verifyRawFiles(app, packagePath, tampered)).ok, false);
  const traversal = Object.assign({}, pkg, { providers: Object.assign({}, providers, { court: Object.assign({}, providers.court, { raw_path: "raw/../package.json" }) }) });
  assert.equal((await research.verifyRawFiles(app, packagePath, traversal)).ok, false);
});

console.log("Auction real-estate research core tests loaded");
