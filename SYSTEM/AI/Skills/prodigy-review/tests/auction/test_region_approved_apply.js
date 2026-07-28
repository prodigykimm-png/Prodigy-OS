"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const ROOT = path.resolve(__dirname, "../../../../../..");
const bridge = require(path.join(ROOT, "SYSTEM/SCRIPTS/region-approved-apply.js"));
const packageCore = require(path.join(ROOT, "SYSTEM/SCRIPTS/region-approval-package-core.js"));
const claimCore = require(path.join(ROOT, "SYSTEM/SCRIPTS/region-approval-claim-core.js"));
const identity = require(path.join(ROOT, "SYSTEM/SCRIPTS/region-target-identity-core.js"));
const landApply = require(path.join(ROOT, "SYSTEM/SCRIPTS/land-price-apply.js"));

const APPROVALS_REL = "SYSTEM/CACHE/region-approvals";

/**
 * Copy required writer scripts into a fixture vault so spawnSync can find them.
 */
function copyScriptsIntoVault(vault) {
  const scriptsDir = path.join(vault, "SYSTEM/SCRIPTS");
  fs.mkdirSync(scriptsDir, { recursive: true });
  const needed = ["land-price-apply.js", "land-price-package-core.js"];
  for (const name of needed) {
    fs.copyFileSync(path.join(ROOT, "SYSTEM/SCRIPTS", name), path.join(scriptsDir, name));
  }
}

function sha(content) {
  return crypto.createHash("sha256").update(content, "utf8").digest("hex");
}
function shaFile(p) {
  return crypto.createHash("sha256").update(fs.readFileSync(p)).digest("hex");
}

function regionPackage() {
  return {
    schema_version: 1,
    scope: "region",
    target_id: "부산광역시-중구",
    land_price_trend_as_of: "2026-01-01",
    source: { institution: "부산광역시", title: "개별공시지가 안내", url: "https://www.busan.go.kr/depart/ahindividualprices", accessed_at: "2026-07-20", source_type: "official_primary" },
    land_price_trend_yoy: 1.2,
    land_price_trend_scope: "부산광역시 중구 표준지 공시지가"
  };
}

function regionNote() {
  return [
    "---", "type: auction_region", "region_sido: 부산광역시", "region_sigungu: 중구",
    "land_price_trend_yoy:", "land_price_trend_as_of:", "land_price_trend_scope:", "land_price_trend_source:",
    "---", "# Region", "",
    "<!-- AUTO:REGION_LAND_PRICE:START -->", "<!-- AUTO:REGION_LAND_PRICE:END -->", ""
  ].join("\n");
}

/**
 * Build a fixture vault with a land-price region target + package, and an approval envelope.
 * Uses the current createEnvelope API (generates nonce, computes hashes from files).
 */
function setupVault() {
  const vault = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "bridge-")));
  const approvalRoot = path.join(vault, APPROVALS_REL);
  claimCore.ensureDirs(approvalRoot);
  copyScriptsIntoVault(vault);

  const targetRel = "PARA/RESOURCES/Auction Regions/부산광역시-중구.md";
  const targetAbs = path.join(vault, targetRel);
  fs.mkdirSync(path.dirname(targetAbs), { recursive: true });
  const noteContent = regionNote();
  fs.writeFileSync(targetAbs, noteContent, "utf8");

  const pkg = regionPackage();
  const pkgRel = "SYSTEM/CACHE/land-price-packages/region/부산광역시-중구/2026-01-01.json";
  const pkgAbs = path.join(vault, pkgRel);
  fs.mkdirSync(path.dirname(pkgAbs), { recursive: true });
  fs.writeFileSync(pkgAbs, JSON.stringify(pkg, null, 2), "utf8");

  const preimageHash = shaFile(targetAbs);
  // rendered output = what the writer will produce
  const rendered = landApply.renderRegion(noteContent, pkg);
  const renderedOutputHash = sha(rendered);

  const { nonce, envelope, envelopePath } = packageCore.createEnvelope({
    approvalRoot,
    writerId: "land_price",
    targetPath: targetRel,
    vaultRoot: vault,
    domainInputPath: pkgRel,
    renderedOutputHash
  });

  // envelopeRelPath for bridge (relative to vault)
  const envelopeRelPath = path.relative(vault, envelopePath);

  return { vault, approvalRoot, targetRel, targetAbs, pkgAbs, pkgRel, nonce, envelope, envelopePath, envelopeRelPath, preimageHash, renderedOutputHash, rendered };
}

test("dry-run without --execute reports plan and writes nothing", () => {
  const ctx = setupVault();
  try {
    const before = fs.readFileSync(ctx.targetAbs, "utf8");
    const result = bridge.executeBridge({ vaultRoot: ctx.vault, envelopePath: ctx.envelopeRelPath, nonce: ctx.nonce, execute: false });
    assert.equal(result.ok, true);
    assert.equal(result.status, "dry_run");
    assert.equal(result.dry_run, true);
    assert.equal(fs.readFileSync(ctx.targetAbs, "utf8"), before, "dry-run은 파일을 변경하면 안 됩니다.");
    assert.equal(claimCore.readReceipt(ctx.approvalRoot, ctx.nonce), null);
  } finally {
    fs.rmSync(ctx.vault, { recursive: true, force: true });
  }
});

test("execute with valid envelope dispatches writer, verifies postimage, writes receipt", () => {
  const ctx = setupVault();
  try {
    const result = bridge.executeBridge({ vaultRoot: ctx.vault, envelopePath: ctx.envelopeRelPath, nonce: ctx.nonce, execute: true });
    assert.equal(result.ok, true);
    assert.equal(result.status, "applied");
    // target file now equals rendered output
    assert.equal(fs.readFileSync(ctx.targetAbs, "utf8"), ctx.rendered);
    assert.equal(shaFile(ctx.targetAbs), ctx.renderedOutputHash);
    // receipt written and immutable
    const receipt = claimCore.readReceipt(ctx.approvalRoot, ctx.nonce);
    assert.equal(receipt.status, "applied");
    assert.equal(receipt.postimage_hash, ctx.renderedOutputHash);
    // claim written
    const claim = claimCore.readClaim(ctx.approvalRoot, ctx.nonce);
    assert.equal(claim.nonce, ctx.nonce);
    // lock released
    assert.equal(claimCore.readLock(ctx.approvalRoot, ctx.envelope.target_key), null);
  } finally {
    fs.rmSync(ctx.vault, { recursive: true, force: true });
  }
});

test("re-run after apply is idempotent (already_applied)", () => {
  const ctx = setupVault();
  try {
    bridge.executeBridge({ vaultRoot: ctx.vault, envelopePath: ctx.envelopeRelPath, nonce: ctx.nonce, execute: true });
    const result2 = bridge.executeBridge({ vaultRoot: ctx.vault, envelopePath: ctx.envelopeRelPath, nonce: ctx.nonce, execute: true });
    assert.equal(result2.ok, true);
    assert.equal(result2.status, "already_applied");
  } finally {
    fs.rmSync(ctx.vault, { recursive: true, force: true });
  }
});

test("two nonces racing one target: second fails closed while lock held", () => {
  const ctx = setupVault();
  try {
    // Simulate nonce1 holding the target lock (in-flight)
    const lockResult = claimCore.acquireTargetLock(ctx.approvalRoot, ctx.envelope.target_key, ctx.nonce, ctx.preimageHash, "owner-1", 0);
    assert.equal(lockResult.acquired, true);
    // A second, different nonce targets the same region
    const pkg = regionPackage();
    const rendered = landApply.renderRegion(regionNote(), pkg);
    const { nonce: nonce2, envelopePath: env2Path } = packageCore.createEnvelope({
      approvalRoot: ctx.approvalRoot,
      writerId: "land_price",
      targetPath: ctx.targetRel,
      vaultRoot: ctx.vault,
      domainInputPath: ctx.pkgRel,
      renderedOutputHash: sha(rendered)
    });
    const env2RelPath = path.relative(ctx.vault, env2Path);
    const result = bridge.executeBridge({ vaultRoot: ctx.vault, envelopePath: env2RelPath, nonce: nonce2, execute: true });
    assert.equal(result.ok, false);
    assert.match(result.status, /blocked_competing_lock/);
    // lock still held by nonce1 (fail closed, no clobber)
    assert.ok(claimCore.readLock(ctx.approvalRoot, ctx.envelope.target_key));
  } finally {
    fs.rmSync(ctx.vault, { recursive: true, force: true });
  }
});

test("independent targets both succeed", () => {
  const ctxA = setupVault();
  try {
    const vaultB = ctxA.vault;
    const approvalRoot = ctxA.approvalRoot;
    const targetRelB = "PARA/RESOURCES/Auction Regions/부산광역시-서구.md";
    const targetAbsB = path.join(vaultB, targetRelB);
    const noteB = regionNote().replace(/부산광역시-중구/g, "부산광역시-서구").replace("region_sigungu: 중구", "region_sigungu: 서구");
    fs.writeFileSync(targetAbsB, noteB, "utf8");
    const pkgB = { ...regionPackage(), target_id: "부산광역시-서구" };
    const pkgRelB = "SYSTEM/CACHE/land-price-packages/region/부산광역시-서구/2026-01-01.json";
    const pkgAbsB = path.join(vaultB, pkgRelB);
    fs.mkdirSync(path.dirname(pkgAbsB), { recursive: true });
    fs.writeFileSync(pkgAbsB, JSON.stringify(pkgB, null, 2), "utf8");
    const renderedB = landApply.renderRegion(noteB, pkgB);
    const { nonce: nonceB, envelopePath: envBPath } = packageCore.createEnvelope({
      approvalRoot,
      writerId: "land_price",
      targetPath: targetRelB,
      vaultRoot: vaultB,
      domainInputPath: pkgRelB,
      renderedOutputHash: sha(renderedB)
    });
    const envBRelPath = path.relative(vaultB, envBPath);

    // Apply A
    const rA = bridge.executeBridge({ vaultRoot: ctxA.vault, envelopePath: ctxA.envelopeRelPath, nonce: ctxA.nonce, execute: true });
    assert.equal(rA.ok, true);
    assert.equal(rA.status, "applied");
    // Apply B
    const rB = bridge.executeBridge({ vaultRoot: vaultB, envelopePath: envBRelPath, nonce: nonceB, execute: true });
    assert.equal(rB.ok, true);
    assert.equal(rB.status, "applied");
    assert.equal(fs.readFileSync(targetAbsB, "utf8"), renderedB);
  } finally {
    fs.rmSync(ctxA.vault, { recursive: true, force: true });
  }
});

test("crash reconciliation: target == preimage → failed_before_write, lock released", () => {
  const ctx = setupVault();
  try {
    // Simulate a crashed run: lock + claim exist for this nonce, target untouched (== preimage)
    claimCore.acquireTargetLock(ctx.approvalRoot, ctx.envelope.target_key, ctx.nonce, ctx.preimageHash, "crashed-owner", 0);
    claimCore.acquireNonceClaim(ctx.approvalRoot, ctx.nonce, ctx.envelope.target_key, ctx.preimageHash, "crashed-owner", 0);
    const result = bridge.executeBridge({ vaultRoot: ctx.vault, envelopePath: ctx.envelopeRelPath, nonce: ctx.nonce, execute: true });
    assert.equal(result.status, "failed_before_write");
    const receipt = claimCore.readReceipt(ctx.approvalRoot, ctx.nonce);
    assert.equal(receipt.status, "failed_before_write");
    assert.equal(claimCore.readLock(ctx.approvalRoot, ctx.envelope.target_key), null, "lock must be released");
  } finally {
    fs.rmSync(ctx.vault, { recursive: true, force: true });
  }
});

test("crash reconciliation: target == postimage → applied_reconciled, lock released", () => {
  const ctx = setupVault();
  try {
    // Simulate crash AFTER write: target already equals rendered postimage
    fs.writeFileSync(ctx.targetAbs, ctx.rendered, "utf8");
    claimCore.acquireTargetLock(ctx.approvalRoot, ctx.envelope.target_key, ctx.nonce, ctx.preimageHash, "crashed-owner", 0);
    claimCore.acquireNonceClaim(ctx.approvalRoot, ctx.nonce, ctx.envelope.target_key, ctx.preimageHash, "crashed-owner", 0);
    const result = bridge.executeBridge({ vaultRoot: ctx.vault, envelopePath: ctx.envelopeRelPath, nonce: ctx.nonce, execute: true });
    assert.equal(result.status, "applied_reconciled");
    const receipt = claimCore.readReceipt(ctx.approvalRoot, ctx.nonce);
    assert.equal(receipt.status, "applied_reconciled");
    assert.equal(claimCore.readLock(ctx.approvalRoot, ctx.envelope.target_key), null, "lock must be released");
  } finally {
    fs.rmSync(ctx.vault, { recursive: true, force: true });
  }
});

test("crash reconciliation: target == neither → blocked_runtime, lock RETAINED", () => {
  const ctx = setupVault();
  try {
    // Simulate ambiguous crash: target has unexpected content
    fs.writeFileSync(ctx.targetAbs, regionNote() + "\n예기치 않은 외부 수정\n", "utf8");
    claimCore.acquireTargetLock(ctx.approvalRoot, ctx.envelope.target_key, ctx.nonce, ctx.preimageHash, "crashed-owner", 0);
    claimCore.acquireNonceClaim(ctx.approvalRoot, ctx.nonce, ctx.envelope.target_key, ctx.preimageHash, "crashed-owner", 0);
    const result = bridge.executeBridge({ vaultRoot: ctx.vault, envelopePath: ctx.envelopeRelPath, nonce: ctx.nonce, execute: true });
    assert.equal(result.status, "blocked_runtime");
    assert.ok(claimCore.readLock(ctx.approvalRoot, ctx.envelope.target_key), "lock must be RETAINED on ambiguous state");
  } finally {
    fs.rmSync(ctx.vault, { recursive: true, force: true });
  }
});

test("expired envelope is rejected", () => {
  const ctx = setupVault();
  try {
    const future = new Date(Date.now() + 31 * 60 * 1000);
    const validation = packageCore.validateEnvelope(ctx.approvalRoot, ctx.nonce, future);
    assert.equal(validation.valid, false);
    assert.match(validation.error, /만료/);
  } finally {
    fs.rmSync(ctx.vault, { recursive: true, force: true });
  }
});

test("stale preimage is rejected", () => {
  const ctx = setupVault();
  try {
    // Modify target file after envelope creation → preimage mismatch
    fs.writeFileSync(ctx.targetAbs, regionNote() + "\n외부 수정\n", "utf8");
    const result = bridge.executeBridge({ vaultRoot: ctx.vault, envelopePath: ctx.envelopeRelPath, nonce: ctx.nonce, execute: true });
    assert.equal(result.ok, false);
    assert.equal(result.status, "failed_stale_preimage");
    // lock released after failure
    assert.equal(claimCore.readLock(ctx.approvalRoot, ctx.envelope.target_key), null);
  } finally {
    fs.rmSync(ctx.vault, { recursive: true, force: true });
  }
});

test("target_key is derived from target_path and verified", () => {
  const ctx = setupVault();
  try {
    assert.equal(ctx.envelope.target_key, identity.targetKey(ctx.targetRel));
  } finally {
    fs.rmSync(ctx.vault, { recursive: true, force: true });
  }
});

test("parseArgs requires --envelope and --nonce", () => {
  assert.throws(() => bridge.parseArgs(["--nonce", "x"]), /--envelope/);
  assert.throws(() => bridge.parseArgs(["--envelope", "x"]), /--nonce/);
  const opts = bridge.parseArgs(["--envelope", "e.json", "--nonce", "n", "--execute", "--vault", "/v"]);
  assert.equal(opts.envelopePath, "e.json");
  assert.equal(opts.nonce, "n");
  assert.equal(opts.execute, true);
  assert.equal(opts.vaultRoot, "/v");
});
