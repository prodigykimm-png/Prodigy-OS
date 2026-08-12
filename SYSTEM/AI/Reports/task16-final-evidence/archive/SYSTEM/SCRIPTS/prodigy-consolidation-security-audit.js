#!/usr/bin/env node
"use strict";

/** F2: fail-closed security, lineage, ownership, and no-apply audit. */

const fs = require("node:fs");
const path = require("node:path");
const {
  validRunId,
  validateAuditInputs,
} = require("../CI/consolidation-fixture-contract.js");

function parseArgs(argv) {
  const options = {};
  for (let i = 0; i < argv.length; i += 1) {
    const key = argv[i];
    const value = argv[i + 1];
    if (!key.startsWith("--") || value === undefined) continue;
    i += 1;
    if (key === "--fixture-root") options.fixtureRoot = value;
    else if (key === "--manifest") options.manifestPath = value;
    else if (key === "--plan") options.planPath = value;
    else if (key === "--ownership") options.ownershipPath = value;
    else if (key === "--baseline") options.baselinePath = value;
    else if (key === "--approval-root") options.approvalRoot = value;
    else if (key === "--run-id") options.runId = value;
    else if (key === "--output") options.outputPath = value;
  }
  return options;
}

const SECRET_PATTERNS = [
  /sk-[A-Za-z0-9]{20,}/g,
  /ghp_[A-Za-z0-9]{20,}/g,
  /xox[bpras]-[A-Za-z0-9\-]{10,}/g,
  /AKIA[A-Z0-9]{16}/g,
];
const SECRET_ID_ALLOWLIST = /^prodigy-[a-z0-9-]+$/;
const RECEIPT_STATUSES = new Set([
  "not_applied", "dry_run", "already_applied", "applied", "applied_reconciled",
  "blocked_claim_race", "blocked_competing_lock", "blocked_lock_race", "blocked_runtime",
  "failed_before_write", "failed_postimage_mismatch", "failed_preimage_missing",
  "failed_stale_preimage", "failed_unknown_writer", "failed_writer_error", "rejected",
]);
const REQUIRED_OWNERSHIP = Object.freeze([
  "SYSTEM/SCRIPTS/region-run-state-core.js",
  "SYSTEM/SCRIPTS/region-approval-claim-core.js",
  "SYSTEM/SCRIPTS/region-target-identity-core.js",
  "SYSTEM/SCRIPTS/region-approved-apply.js",
]);

function scanFileForSecrets(filePath) {
  const hits = [];
  const content = fs.readFileSync(filePath, "utf8");
  for (const pattern of SECRET_PATTERNS) {
    pattern.lastIndex = 0;
    let match;
    while ((match = pattern.exec(content)) !== null) {
      if (!SECRET_ID_ALLOWLIST.test(match[0])) hits.push({ file: filePath, pattern: pattern.source.slice(0, 30), index: match.index });
    }
  }
  return hits;
}

function walkRequiredJsRoot(repoRoot, relativeRoot, errors) {
  const absoluteRoot = path.join(repoRoot, ...relativeRoot.split("/"));
  let rootStat;
  try { rootStat = fs.lstatSync(absoluteRoot); }
  catch (error) {
    if (error.code === "ENOENT") errors.push(`required scan root missing: ${relativeRoot}`);
    else errors.push(`required scan root unreadable: ${relativeRoot}: ${error.message}`);
    return [];
  }
  if (!rootStat.isDirectory() || rootStat.isSymbolicLink()) {
    errors.push(`required scan root is not a real directory: ${relativeRoot}`);
    return [];
  }
  const files = [];
  function walk(directory) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
      const absolutePath = path.join(directory, entry.name);
      const stat = fs.lstatSync(absolutePath);
      if (stat.isSymbolicLink()) {
        errors.push(`security scan entry is a symlink: ${path.relative(repoRoot, absolutePath)}`);
      } else if (stat.isDirectory()) {
        walk(absolutePath);
      } else if (stat.isFile() && absolutePath.endsWith(".js")) {
        files.push(absolutePath);
      }
    }
  }
  walk(absoluteRoot);
  if (files.length === 0) errors.push(`required scan root has no JavaScript files: ${relativeRoot}`);
  return files;
}

function sourceCheck(repoRoot, relativePath, predicates) {
  try {
    const source = fs.readFileSync(path.join(repoRoot, ...relativePath.split("/")), "utf8");
    return predicates.every((predicate) => predicate.test(source));
  } catch (_error) {
    return false;
  }
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const repoRoot = process.cwd();
  const fixtureRoot = path.resolve(repoRoot, options.fixtureRoot || "SYSTEM/CI/fixtures/consolidation");
  const errors = [];
  let validated = null;
  if (!validRunId(options.runId)) errors.push("run ID missing or invalid");
  try {
    validated = validateAuditInputs({
      fixtureRoot,
      manifestPath: path.resolve(repoRoot, options.manifestPath || path.join(fixtureRoot, "fixture-manifest.json")),
      planPath: path.resolve(repoRoot, options.planPath || path.join(fixtureRoot, "plan.md")),
      ownershipPath: path.resolve(repoRoot, options.ownershipPath || path.join(fixtureRoot, "ownership-v1.json")),
      baselinePath: path.resolve(repoRoot, options.baselinePath || path.join(fixtureRoot, "baseline-v1.json")),
      repoRoot,
    });
  } catch (error) {
    errors.push(error.message);
  }

  const jsFiles = [
    ...walkRequiredJsRoot(repoRoot, "SYSTEM/SCRIPTS", errors),
    ...walkRequiredJsRoot(repoRoot, "SYSTEM/Views", errors),
  ];
  const secretHits = jsFiles.flatMap(scanFileForSecrets);

  const ownedPaths = new Set(validated ? validated.ownedPaths : []);
  for (const requiredPath of REQUIRED_OWNERSHIP) {
    if (validated && !ownedPaths.has(requiredPath)) errors.push(`required security path is not owned: ${requiredPath}`);
  }

  const lineageChecks = {
    no_stale_pointer: validated ? sourceCheck(repoRoot, "SYSTEM/SCRIPTS/region-run-state-core.js", [/createSelectionState/, /receiptHash/, /selected_at/]) : false,
    no_fuzzy_region: validated ? sourceCheck(repoRoot, "SYSTEM/SCRIPTS/region-target-identity-core.js", [/\.normalize\("NFC"\)/, /startsWith\("\.\."\)/]) : false,
    no_hidden_migration: Boolean(validated && validated.baseline.dirty_tracked.length === 0 && validated.baseline.untracked.length === 0 &&
      [...ownedPaths].every((entry) => !entry.startsWith("PARA/"))),
  };
  if (validated && !Object.values(lineageChecks).every(Boolean)) errors.push("lineage source check failed");

  const approvalChecks = {
    exclusive_claim: validated ? sourceCheck(repoRoot, "SYSTEM/SCRIPTS/region-approval-claim-core.js", [/fs\.openSync\(filePath, "wx"/, /acquireNonceClaim/, /acquireTargetLock/]) : false,
    wx_fsync: validated ? sourceCheck(repoRoot, "SYSTEM/SCRIPTS/region-approval-claim-core.js", [/fs\.fsyncSync\(fd\)/, /fsyncDir\(path\.dirname\(filePath\)\)/]) : false,
    crash_reconcile: validated ? sourceCheck(repoRoot, "SYSTEM/SCRIPTS/region-approved-apply.js", [/function reconcileStaleLock/, /applied_reconciled/, /failed_before_write/]) : false,
  };
  if (validated && !Object.values(approvalChecks).every(Boolean)) errors.push("approval durability check failed");

  let realApplyCount = 0;
  let approvalReceiptCount = 0;
  const approvalRoot = path.resolve(repoRoot, options.approvalRoot || path.join(fixtureRoot, "approval-root"));
  if (validated) {
    const manifestedApproval = path.dirname(path.dirname(validated.entries.get("approval-root/receipts/synthetic-not-applied.json").absolutePath));
    if (fs.realpathSync(approvalRoot) !== fs.realpathSync(manifestedApproval)) errors.push("approval root is not the manifested fixture");
  }
  const receiptsDir = path.join(approvalRoot, "receipts");
  if (!fs.existsSync(receiptsDir) || !fs.lstatSync(receiptsDir).isDirectory() || fs.lstatSync(receiptsDir).isSymbolicLink()) {
    errors.push("approval receipts directory missing or invalid");
  } else {
    const receiptFiles = fs.readdirSync(receiptsDir).filter((entry) => entry.endsWith(".json")).sort();
    if (receiptFiles.length === 0) errors.push("approval receipts missing");
    for (const file of receiptFiles) {
      const receiptPath = path.join(receiptsDir, file);
      const stat = fs.lstatSync(receiptPath);
      if (!stat.isFile() || stat.isSymbolicLink()) { errors.push(`approval receipt is not a regular file: ${file}`); continue; }
      approvalReceiptCount += 1;
      let receipt;
      try { receipt = JSON.parse(fs.readFileSync(receiptPath, "utf8")); }
      catch (error) { errors.push(`approval receipt ${file} parse error: ${error.message}`); continue; }
      if (!receipt || !RECEIPT_STATUSES.has(receipt.status)) { errors.push(`approval receipt ${file} shape invalid`); continue; }
      if (receipt.status === "applied" || receipt.status === "applied_reconciled") realApplyCount += 1;
    }
  }

  const genericWriterPresent = fs.existsSync(path.join(repoRoot, "SYSTEM/SCRIPTS/region-generic-writer.js"));
  const unownedCachePaths = validated && Array.isArray(validated.baseline.cache_membership) ? validated.baseline.cache_membership.length : null;
  const dirtyPreimageMismatches = validated && Array.isArray(validated.baseline.dirty_tracked) ? validated.baseline.dirty_tracked.length : null;
  if (unownedCachePaths !== 0) errors.push("clean baseline contains cache membership");
  if (dirtyPreimageMismatches !== 0) errors.push("clean baseline contains dirty preimages");

  const inputHashes = validated ? {
    fixture_manifest_sha256: validated.hashes.fixture_manifest_sha256,
    plan_sha256: validated.hashes.plan_sha256,
    ownership_sha256: validated.hashes.ownership_sha256,
    baseline_sha256: validated.hashes.baseline_sha256,
    approval_sha256: validated.hashes.approval_sha256,
    source_inventory_sha256: validated.hashes.source_inventory_sha256,
  } : null;
  const ok = errors.length === 0 && secretHits.length === 0 && realApplyCount === 0 && !genericWriterPresent &&
    Object.values(lineageChecks).every(Boolean) && Object.values(approvalChecks).every(Boolean);
  const receipt = {
    ok,
    run_id: options.runId || null,
    input_hashes: inputHashes,
    ownership_path_count: validated ? validated.ownedPaths.length : 0,
    ownership_source_mode: validated ? validated.sourceMode : null,
    scanned_file_count: jsFiles.length,
    secret_hits: secretHits.length,
    secret_details: secretHits.slice(0, 10).map((hit) => ({ ...hit, file: path.relative(repoRoot, hit.file) })),
    real_apply_count: realApplyCount,
    approval_receipt_count: approvalReceiptCount,
    generic_writer_present: genericWriterPresent,
    unowned_cache_paths: unownedCachePaths,
    dirty_preimage_mismatches: dirtyPreimageMismatches,
    lineage_checks: lineageChecks,
    approval_checks: approvalChecks,
    errors,
    audited_at: new Date().toISOString(),
  };

  if (options.outputPath) {
    const outputPath = path.resolve(repoRoot, options.outputPath);
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, JSON.stringify(receipt, null, 2) + "\n");
  }
  process.stdout.write(JSON.stringify(receipt, null, 2) + "\n");
  if (!ok) process.exitCode = 1;
}

if (require.main === module) {
  try { main(); }
  catch (error) { process.stderr.write(`security audit failed: ${error.message}\n`); process.exitCode = 1; }
}

module.exports = Object.freeze({ parseArgs, scanFileForSecrets, walkRequiredJsRoot });
