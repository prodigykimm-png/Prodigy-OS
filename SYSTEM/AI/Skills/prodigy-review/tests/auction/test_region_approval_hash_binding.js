"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const ROOT = path.resolve(__dirname, "../../../../../..");
const pkgCore = require(path.join(ROOT, "SYSTEM/SCRIPTS/region-approval-package-core.js"));
const claimCore = require(path.join(ROOT, "SYSTEM/SCRIPTS/region-approval-claim-core.js"));

function makeVault() {
  const vault = fs.mkdtempSync(path.join(os.tmpdir(), "approval-hb-"));
  const regionDir = path.join(vault, "PARA/RESOURCES/Auction Regions");
  fs.mkdirSync(regionDir, { recursive: true });
  const targetPath = path.join(regionDir, "부산광역시-사하구.md");
  fs.writeFileSync(targetPath, "---\ntype: auction_region\n---\n# test\n", "utf8");
  const cacheDir = path.join(vault, "SYSTEM/CACHE/region-metrics/부산광역시-사하구/run");
  fs.mkdirSync(cacheDir, { recursive: true });
  const domainInput = path.join(cacheDir, "snapshot.json");
  fs.writeFileSync(domainInput, '{"schema_version":1}\n', "utf8");
  return { vault, targetPath, domainInput };
}

test("createEnvelope produces valid UUIDv4 nonce and immutable file", () => {
  const { vault, domainInput } = makeVault();
  const approvalRoot = path.join(vault, "SYSTEM/CACHE/region-approvals");
  const renderedHash = crypto.createHash("sha256").update("rendered output").digest("hex");
  const result = pkgCore.createEnvelope({
    approvalRoot,
    writerId: "metrics",
    targetPath: "PARA/RESOURCES/Auction Regions/부산광역시-사하구.md",
    vaultRoot: vault,
    domainInputPath: "SYSTEM/CACHE/region-metrics/부산광역시-사하구/run/snapshot.json",
    renderedOutputHash: renderedHash
  });
  assert.match(result.nonce, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  assert.ok(fs.existsSync(result.envelopePath));
  assert.equal(result.envelope.ttl_minutes, 30);
  assert.equal(result.envelope.writer_id, "metrics");
  assert.equal(result.envelope.rendered_output_hash, renderedHash);
  assert.match(result.envelope.preimage_hash, /^[0-9a-f]{64}$/);
  assert.match(result.envelope.domain_input_hash, /^[0-9a-f]{64}$/);
  fs.rmSync(vault, { recursive: true, force: true });
});

test("createEnvelope rejects invalid writer_id", () => {
  const { vault } = makeVault();
  const approvalRoot = path.join(vault, "SYSTEM/CACHE/region-approvals");
  assert.throws(() => pkgCore.createEnvelope({
    approvalRoot, writerId: "generic", targetPath: "PARA/RESOURCES/Auction Regions/부산광역시-사하구.md",
    vaultRoot: vault, domainInputPath: "SYSTEM/CACHE/region-metrics/부산광역시-사하구/run/snapshot.json",
    renderedOutputHash: "a".repeat(64)
  }), /writer_id/);
  fs.rmSync(vault, { recursive: true, force: true });
});

test("createEnvelope rejects absolute targetPath", () => {
  const { vault } = makeVault();
  const approvalRoot = path.join(vault, "SYSTEM/CACHE/region-approvals");
  assert.throws(() => pkgCore.createEnvelope({
    approvalRoot, writerId: "metrics", targetPath: "/etc/passwd",
    vaultRoot: vault, domainInputPath: "SYSTEM/CACHE/region-metrics/부산광역시-사하구/run/snapshot.json",
    renderedOutputHash: "a".repeat(64)
  }), /상대 경로/);
  fs.rmSync(vault, { recursive: true, force: true });
});

test("createEnvelope rejects invalid renderedOutputHash", () => {
  const { vault } = makeVault();
  const approvalRoot = path.join(vault, "SYSTEM/CACHE/region-approvals");
  assert.throws(() => pkgCore.createEnvelope({
    approvalRoot, writerId: "metrics", targetPath: "PARA/RESOURCES/Auction Regions/부산광역시-사하구.md",
    vaultRoot: vault, domainInputPath: "SYSTEM/CACHE/region-metrics/부산광역시-사하구/run/snapshot.json",
    renderedOutputHash: "not-a-hash"
  }), /renderedOutputHash/);
  fs.rmSync(vault, { recursive: true, force: true });
});

test("validateEnvelope accepts valid envelope", () => {
  const { vault } = makeVault();
  const approvalRoot = path.join(vault, "SYSTEM/CACHE/region-approvals");
  const { nonce } = pkgCore.createEnvelope({
    approvalRoot, writerId: "transit", targetPath: "PARA/RESOURCES/Auction Regions/부산광역시-사하구.md",
    vaultRoot: vault, domainInputPath: "SYSTEM/CACHE/region-metrics/부산광역시-사하구/run/snapshot.json",
    renderedOutputHash: "b".repeat(64)
  });
  const result = pkgCore.validateEnvelope(approvalRoot, nonce);
  assert.equal(result.valid, true);
  assert.equal(result.envelope.writer_id, "transit");
  fs.rmSync(vault, { recursive: true, force: true });
});

test("validateEnvelope rejects expired envelope", () => {
  const { vault } = makeVault();
  const approvalRoot = path.join(vault, "SYSTEM/CACHE/region-approvals");
  const { nonce } = pkgCore.createEnvelope({
    approvalRoot, writerId: "metrics", targetPath: "PARA/RESOURCES/Auction Regions/부산광역시-사하구.md",
    vaultRoot: vault, domainInputPath: "SYSTEM/CACHE/region-metrics/부산광역시-사하구/run/snapshot.json",
    renderedOutputHash: "c".repeat(64)
  });
  const future = new Date(Date.now() + 31 * 60 * 1000);
  const result = pkgCore.validateEnvelope(approvalRoot, nonce, future);
  assert.equal(result.valid, false);
  assert.match(result.error, /만료/);
  fs.rmSync(vault, { recursive: true, force: true });
});

test("validateEnvelope rejects non-UUIDv4 nonce", () => {
  const { vault } = makeVault();
  const approvalRoot = path.join(vault, "SYSTEM/CACHE/region-approvals");
  fs.mkdirSync(approvalRoot, { recursive: true });
  const result = pkgCore.validateEnvelope(approvalRoot, "not-a-uuid");
  assert.equal(result.valid, false);
  assert.match(result.error, /UUIDv4/);
  fs.rmSync(vault, { recursive: true, force: true });
});

test("isExpired returns correct boolean", () => {
  const envelope = { created_at: "2026-07-28T10:00:00.000Z", ttl_minutes: 30 };
  assert.equal(pkgCore.isExpired(envelope, new Date("2026-07-28T10:29:00Z")), false);
  assert.equal(pkgCore.isExpired(envelope, new Date("2026-07-28T10:31:00Z")), true);
});

test("NFD 부평 target path: envelope uses NFC", () => {
  const vault = fs.mkdtempSync(path.join(os.tmpdir(), "approval-nfd-"));
  const regionDir = path.join(vault, "PARA/RESOURCES/Auction Regions");
  fs.mkdirSync(regionDir, { recursive: true });
  const nfdName = "인천광역시-부평구.md".normalize("NFD");
  fs.writeFileSync(path.join(regionDir, nfdName), "---\ntype: auction_region\n---\n", "utf8");
  const cacheDir = path.join(vault, "SYSTEM/CACHE/region-metrics/test/run");
  fs.mkdirSync(cacheDir, { recursive: true });
  fs.writeFileSync(path.join(cacheDir, "snapshot.json"), "{}", "utf8");
  const approvalRoot = path.join(vault, "SYSTEM/CACHE/region-approvals");
  const nfcRelPath = `PARA/RESOURCES/Auction Regions/${"인천광역시-부평구.md".normalize("NFC")}`;
  // The file on disk is NFD but we pass NFC path — createEnvelope resolves via vaultRoot
  // On macOS HFS+, the filesystem normalizes to NFD, so resolve finds it
  const { envelope } = pkgCore.createEnvelope({
    approvalRoot, writerId: "metrics",
    targetPath: nfcRelPath,
    vaultRoot: vault,
    domainInputPath: "SYSTEM/CACHE/region-metrics/test/run/snapshot.json",
    renderedOutputHash: "d".repeat(64)
  });
  assert.equal(envelope.target_path, nfcRelPath.normalize("NFC"));
  fs.rmSync(vault, { recursive: true, force: true });
});
