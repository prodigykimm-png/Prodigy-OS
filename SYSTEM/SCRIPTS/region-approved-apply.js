#!/usr/bin/env node
"use strict";

/**
 * region-approved-apply.js
 * Closed approval bridge — dispatches to existing domain writers after
 * verifying immutable envelope, exclusive claims, and hash bindings.
 * Contract: .omo/plans/prodigy-region-workspace-consolidation.md §Approval and writers
 *
 * Usage:
 *   node SYSTEM/SCRIPTS/region-approved-apply.js \
 *     --envelope SYSTEM/CACHE/region-approvals/envelopes/{nonce}.json \
 *     --nonce {nonce} --execute
 */

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { spawnSync } = require("node:child_process");
const claimCore = require("./region-approval-claim-core.js");
const pkgCore = require("./region-approval-package-core.js");
const targetIdentity = require("./region-target-identity-core.js");

const WRITER_ARGV_MAP = Object.freeze({
  metrics: (vaultRoot, target, domainInput, envelope) => [
    path.join(vaultRoot, "SYSTEM/SCRIPTS/region-metrics-apply.js"),
    "--vault", vaultRoot,
    "--target", target,
    "--snapshot", domainInput,
    "--updated-date", (envelope.parameters && envelope.parameters.updated_date) || new Date().toISOString().slice(0, 10),
    "--execute"
  ],
  research: (vaultRoot, target, domainInput) => [
    path.join(vaultRoot, "SYSTEM/SCRIPTS/region-research-apply.js"),
    "--vault", vaultRoot,
    "--target", target,
    "--package", domainInput,
    "--execute"
  ],
  transit: (vaultRoot, target, domainInput) => [
    path.join(vaultRoot, "SYSTEM/SCRIPTS/region-transit-writer.js"),
    "--vault", vaultRoot,
    "--target", target,
    "--package", domainInput,
    "--execute"
  ],
  land_price: (vaultRoot, target, domainInput) => [
    path.join(vaultRoot, "SYSTEM/SCRIPTS/land-price-apply.js"),
    "--vault", vaultRoot,
    "--target", target,
    "--package", domainInput,
    "--execute"
  ]
});

function sha256File(filePath) {
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

function assertInsideRoot(root, target, label) {
  const realRoot = fs.realpathSync(root);
  const realTarget = fs.realpathSync(target);
  const rel = path.relative(realRoot, realTarget);
  if (rel === "" || rel.startsWith("..") || path.isAbsolute(rel)) {
    throw new Error(`${label}이 허용 경로 밖에 있습니다: ${realTarget}`);
  }
  return realTarget;
}

function assertNoSymlink(filePath, label) {
  const stat = fs.lstatSync(filePath);
  if (stat.isSymbolicLink()) {
    throw new Error(`${label}은 심볼릭 링크일 수 없습니다: ${filePath}`);
  }
}

/**
 * Attempt crash reconciliation for a stale lock.
 * @returns {{ reconciled: boolean, status: string, receipt?: object }}
 */
function reconcileStaleLock(approvalRoot, vaultRoot, lock, envelope) {
  const targetAbsolute = path.resolve(vaultRoot, envelope.target_path);
  if (!fs.existsSync(targetAbsolute)) {
    return { reconciled: false, status: "blocked_runtime", reason: "대상 파일이 존재하지 않습니다." };
  }
  const currentHash = sha256File(targetAbsolute);

  if (currentHash === envelope.preimage_hash) {
    // (a) target equals preimage → writer never ran or failed before write
    const receipt = {
      schema_version: 1,
      nonce: envelope.nonce,
      status: "failed_before_write",
      reconciled: true,
      resolved_at: new Date().toISOString()
    };
    claimCore.writeReceipt(approvalRoot, envelope.nonce, receipt);
    claimCore.releaseTargetLock(approvalRoot, lock.target_key);
    return { reconciled: true, status: "failed_before_write", receipt };
  }

  if (currentHash === envelope.rendered_output_hash) {
    // (b) target equals rendered postimage → writer succeeded but bridge crashed
    const receipt = {
      schema_version: 1,
      nonce: envelope.nonce,
      status: "applied_reconciled",
      reconciled: true,
      resolved_at: new Date().toISOString()
    };
    claimCore.writeReceipt(approvalRoot, envelope.nonce, receipt);
    claimCore.releaseTargetLock(approvalRoot, lock.target_key);
    return { reconciled: true, status: "applied_reconciled", receipt };
  }

  // (c) neither → ambiguous, retain lock
  return { reconciled: false, status: "blocked_runtime", reason: "대상 파일이 preimage도 postimage도 아닙니다. 수동 확인 필요." };
}

/**
 * Main bridge execution.
 */
function executeBridge(options) {
  const vaultRoot = fs.realpathSync(path.resolve(options.vaultRoot || process.cwd()));
  const approvalRoot = path.join(vaultRoot, "SYSTEM/CACHE/region-approvals");

  // Validate envelope path is inside approval root
  const envelopePath = path.resolve(vaultRoot, options.envelopePath);
  assertInsideRoot(approvalRoot, envelopePath, "envelope");
  assertNoSymlink(envelopePath, "envelope");

  // Validate envelope
  const validation = pkgCore.validateEnvelope(approvalRoot, options.nonce);
  if (!validation.valid) {
    return { ok: false, status: "rejected", error: validation.error, dry_run: !options.execute };
  }
  const envelope = validation.envelope;

  // Verify envelope file hash matches nonce
  if (envelope.nonce !== options.nonce) {
    return { ok: false, status: "rejected", error: "nonce 불일치" };
  }

  const targetKeyHex = targetIdentity.targetKey(envelope.target_path);

  // Check for existing receipt (already applied)
  const existingReceipt = claimCore.readReceipt(approvalRoot, options.nonce);
  if (existingReceipt) {
    return { ok: true, status: "already_applied", receipt: existingReceipt, dry_run: !options.execute };
  }

  // Check for stale lock (crash reconciliation)
  const existingLock = claimCore.readLock(approvalRoot, targetKeyHex);
  if (existingLock) {
    if (existingLock.nonce === options.nonce) {
      // Our own stale lock — reconcile
      const reconciliation = reconcileStaleLock(approvalRoot, vaultRoot, existingLock, envelope);
      return { ok: reconciliation.reconciled, status: reconciliation.status, receipt: reconciliation.receipt, reason: reconciliation.reason, dry_run: !options.execute };
    }
    // Different nonce holds the lock — competing claim
    return { ok: false, status: "blocked_competing_lock", error: `다른 nonce가 대상 잠금을 보유 중입니다: ${existingLock.nonce}`, dry_run: !options.execute };
  }

  if (!options.execute) {
    return {
      ok: true,
      status: "dry_run",
      dry_run: true,
      envelope: { nonce: envelope.nonce, writer_id: envelope.writer_id, target_path: envelope.target_path },
      command: `node SYSTEM/SCRIPTS/region-approved-apply.js --envelope ${options.envelopePath} --nonce ${options.nonce} --execute`
    };
  }

  // === EXECUTE PATH ===
  const ownerToken = `bridge-${process.pid}-${Date.now()}`;
  const generation = 1;

  // Step 1: Acquire target lock (wx)
  const lockResult = claimCore.acquireTargetLock(approvalRoot, targetKeyHex, options.nonce, envelope.preimage_hash, ownerToken, generation);
  if (!lockResult.acquired) {
    return { ok: false, status: "blocked_lock_race", error: "대상 잠금 획득 실패 (경합)" };
  }

  // Step 2: Acquire nonce claim (wx)
  const claimResult = claimCore.acquireNonceClaim(approvalRoot, options.nonce, targetKeyHex, envelope.preimage_hash, ownerToken, generation);
  if (!claimResult.acquired) {
    // Release lock, claim failed
    claimCore.releaseTargetLock(approvalRoot, targetKeyHex);
    return { ok: false, status: "blocked_claim_race", error: "nonce claim 획득 실패 (이미 사용됨)" };
  }

  // Step 3: Verify preimage
  const targetAbsolute = path.resolve(vaultRoot, envelope.target_path);
  if (!fs.existsSync(targetAbsolute)) {
    claimCore.writeReceipt(approvalRoot, options.nonce, { schema_version: 1, nonce: options.nonce, status: "failed_preimage_missing", resolved_at: new Date().toISOString() });
    claimCore.releaseTargetLock(approvalRoot, targetKeyHex);
    return { ok: false, status: "failed_preimage_missing", error: "대상 파일이 존재하지 않습니다." };
  }
  const currentPreimage = sha256File(targetAbsolute);
  if (currentPreimage !== envelope.preimage_hash) {
    claimCore.writeReceipt(approvalRoot, options.nonce, { schema_version: 1, nonce: options.nonce, status: "failed_stale_preimage", resolved_at: new Date().toISOString() });
    claimCore.releaseTargetLock(approvalRoot, targetKeyHex);
    return { ok: false, status: "failed_stale_preimage", error: "preimage hash 불일치 — 대상이 변경되었습니다." };
  }

  // Step 4: Dispatch to writer
  const writerArgvFn = WRITER_ARGV_MAP[envelope.writer_id];
  if (!writerArgvFn) {
    claimCore.writeReceipt(approvalRoot, options.nonce, { schema_version: 1, nonce: options.nonce, status: "failed_unknown_writer", resolved_at: new Date().toISOString() });
    claimCore.releaseTargetLock(approvalRoot, targetKeyHex);
    return { ok: false, status: "failed_unknown_writer", error: `알 수 없는 writer_id: ${envelope.writer_id}` };
  }

  const domainInputAbsolute = path.resolve(vaultRoot, envelope.domain_input_path);
  const writerArgv = writerArgvFn(vaultRoot, envelope.target_path, envelope.domain_input_path, envelope);
  const scriptPath = writerArgv[0];

  // Assert script is inside SYSTEM/SCRIPTS/
  const scriptsRoot = path.join(vaultRoot, "SYSTEM/SCRIPTS");
  assertInsideRoot(scriptsRoot, scriptPath, "writer script");

  const child = spawnSync(process.execPath, writerArgv, { shell: false, cwd: vaultRoot, encoding: "utf8", timeout: 60000 });

  if (child.status !== 0) {
    const receipt = {
      schema_version: 1,
      nonce: options.nonce,
      status: "failed_writer_error",
      writer_exit_code: child.status,
      writer_stderr: (child.stderr || "").slice(0, 2000),
      resolved_at: new Date().toISOString()
    };
    claimCore.writeReceipt(approvalRoot, options.nonce, receipt);
    claimCore.releaseTargetLock(approvalRoot, targetKeyHex);
    return { ok: false, status: "failed_writer_error", error: `writer 종료 코드: ${child.status}`, receipt };
  }

  // Step 5: Verify postimage
  const postimageHash = sha256File(targetAbsolute);
  if (postimageHash !== envelope.rendered_output_hash) {
    const receipt = {
      schema_version: 1,
      nonce: options.nonce,
      status: "failed_postimage_mismatch",
      expected: envelope.rendered_output_hash,
      actual: postimageHash,
      resolved_at: new Date().toISOString()
    };
    claimCore.writeReceipt(approvalRoot, options.nonce, receipt);
    claimCore.releaseTargetLock(approvalRoot, targetKeyHex);
    return { ok: false, status: "failed_postimage_mismatch", error: "postimage hash 불일치", receipt };
  }

  // Step 6: Write terminal receipt
  const receipt = {
    schema_version: 1,
    nonce: options.nonce,
    status: "applied",
    writer_id: envelope.writer_id,
    target_path: envelope.target_path,
    postimage_hash: postimageHash,
    resolved_at: new Date().toISOString()
  };
  claimCore.writeReceipt(approvalRoot, options.nonce, receipt);

  // Step 7: Release target lock
  claimCore.releaseTargetLock(approvalRoot, targetKeyHex);

  return { ok: true, status: "applied", receipt };
}

function parseArgs(argv) {
  const options = { vaultRoot: process.cwd(), execute: false };
  for (let i = 0; i < argv.length; i += 1) {
    const key = argv[i];
    if (key === "--execute") { options.execute = true; continue; }
    if (key === "--dry-run") { options.execute = false; continue; }
    const value = argv[i + 1];
    if (!key.startsWith("--") || value === undefined) throw new Error(`인자는 --key value 형식이어야 합니다: ${key}`);
    i += 1;
    if (key === "--vault") options.vaultRoot = value;
    else if (key === "--envelope") options.envelopePath = value;
    else if (key === "--nonce") options.nonce = value;
    else throw new Error(`지원하지 않는 인자입니다: ${key}`);
  }
  if (!options.envelopePath) throw new Error("--envelope가 필요합니다.");
  if (!options.nonce) throw new Error("--nonce가 필요합니다.");
  return options;
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const result = executeBridge(options);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (!result.ok) process.exitCode = 1;
}

if (require.main === module) {
  try { main(); } catch (error) { process.stderr.write(`${error.stack ?? error.message}\n`); process.exitCode = 1; }
}

module.exports = Object.freeze({ executeBridge, parseArgs, reconcileStaleLock, WRITER_ARGV_MAP });
