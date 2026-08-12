#!/usr/bin/env node
"use strict";

/** F4: fail-closed aggregation of one current release-gate receipt hierarchy. */

const fs = require("node:fs");
const path = require("node:path");
const { validRunId } = require("../CI/consolidation-fixture-contract.js");

const MAX_RECEIPT_AGE_MS = 24 * 60 * 60 * 1000;
const MAX_FUTURE_SKEW_MS = 5 * 60 * 1000;
const COMMON_HASH_KEYS = Object.freeze([
  "fixture_manifest_sha256",
  "plan_sha256",
  "ownership_sha256",
  "baseline_sha256",
  "source_inventory_sha256",
]);

function parseArgs(argv) {
  const options = {};
  for (let i = 0; i < argv.length; i += 1) {
    const key = argv[i];
    const value = argv[i + 1];
    if (!key.startsWith("--") || value === undefined) continue;
    i += 1;
    if (key === "--evidence-root") options.evidenceRoot = value;
    else if (key === "--run-id") options.runId = value;
    else if (key === "--output") options.outputPath = value;
  }
  return options;
}

function readReceipt(absPath) {
  let stat;
  try { stat = fs.lstatSync(absPath); }
  catch (_error) { return null; }
  if (!stat.isFile() || stat.isSymbolicLink()) return null;
  try { return JSON.parse(fs.readFileSync(absPath, "utf8")); }
  catch (_error) { return null; }
}

function validHashObject(value, keys) {
  return Boolean(value && keys.every((key) => /^[a-f0-9]{64}$/.test(value[key] || "")));
}

function validF1(receipt) {
  return Boolean(receipt && receipt.ok === true && validRunId(receipt.run_id) && validHashObject(receipt.input_hashes, COMMON_HASH_KEYS) &&
    receipt.plan_sha256 === receipt.input_hashes.plan_sha256 && ["git", "archive"].includes(receipt.ownership_source_mode) &&
    Number.isInteger(receipt.ownership_path_count) && receipt.ownership_path_count > 0 &&
    receipt.todo_count === 16 && receipt.todo_checked === 16 && receipt.final_count === 4 && receipt.final_checked === 4 &&
    receipt.dependency_ok === true && Array.isArray(receipt.errors) && receipt.errors.length === 0);
}

function validF2(receipt) {
  return Boolean(receipt && receipt.ok === true && validRunId(receipt.run_id) &&
    validHashObject(receipt.input_hashes, [...COMMON_HASH_KEYS, "approval_sha256"]) &&
    ["git", "archive"].includes(receipt.ownership_source_mode) && Number.isInteger(receipt.ownership_path_count) && receipt.ownership_path_count > 0 &&
    Number.isInteger(receipt.scanned_file_count) && receipt.scanned_file_count > 0 &&
    receipt.secret_hits === 0 && receipt.real_apply_count === 0 && receipt.unowned_cache_paths === 0 && receipt.dirty_preimage_mismatches === 0 &&
    Number.isInteger(receipt.approval_receipt_count) && receipt.approval_receipt_count > 0 &&
    receipt.lineage_checks && Object.values(receipt.lineage_checks).length === 3 && Object.values(receipt.lineage_checks).every((value) => value === true) &&
    receipt.approval_checks && Object.values(receipt.approval_checks).length === 3 && Object.values(receipt.approval_checks).every((value) => value === true) &&
    Array.isArray(receipt.errors) && receipt.errors.length === 0);
}

function validF3(receipt) {
  return Boolean(receipt && receipt.ok === true && validRunId(receipt.run_id) &&
    validHashObject(receipt.input_hashes, ["fixture_manifest_sha256", "source_inventory_sha256"]) && receipt.dom_tests_only === false &&
    Array.isArray(receipt.manual_checks) && receipt.manual_checks.length > 0 &&
    receipt.manual_checks.every((check) => check && typeof check.id === "string" && typeof check.surface === "string") &&
    Array.isArray(receipt.errors) && receipt.errors.length === 0);
}

function validateTimestamp(value, label, errors, now = Date.now()) {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) {
    errors.push(`receipt timestamp missing or malformed: ${label}`);
    return;
  }
  if (now - timestamp > MAX_RECEIPT_AGE_MS) errors.push(`receipt timestamp is stale: ${label}`);
  if (timestamp - now > MAX_FUTURE_SKEW_MS) errors.push(`receipt timestamp is in the future: ${label}`);
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const repoRoot = process.cwd();
  const evidenceRoot = path.resolve(repoRoot, options.evidenceRoot || "SYSTEM/CI/release-gate-output");
  const errors = [];
  if (!validRunId(options.runId)) errors.push("run ID missing or invalid");
  const receipts = {
    F1: readReceipt(path.join(evidenceRoot, "final-F1/receipt.json")),
    F2: readReceipt(path.join(evidenceRoot, "final-F2/receipt.json")),
    F3: readReceipt(path.join(evidenceRoot, "final-F3/receipt.json")),
  };
  const validators = { F1: validF1, F2: validF2, F3: validF3 };
  const checks = {};
  for (const [label, receipt] of Object.entries(receipts)) {
    checks[`${label.toLowerCase()}_receipt`] = validators[label](receipt);
    if (!validators[label](receipt)) errors.push(`${label} receipt missing or malformed`);
    if (receipt && receipt.run_id !== options.runId) errors.push(`receipt run ID mismatch: ${label}`);
  }
  if (receipts.F3 && !/^[a-f0-9]{64}$/.test(receipts.F3.input_hashes && receipts.F3.input_hashes.source_inventory_sha256 || "")) {
    errors.push("F3 source inventory hash missing or malformed");
  }

  if (receipts.F1 && receipts.F2 && receipts.F3) {
    for (const key of COMMON_HASH_KEYS) {
      if (receipts.F1.input_hashes && receipts.F2.input_hashes && receipts.F1.input_hashes[key] !== receipts.F2.input_hashes[key]) {
        errors.push(`cross-receipt input hash mismatch: ${key}`);
      }
    }
    const f1ManifestHash = receipts.F1.input_hashes && receipts.F1.input_hashes.fixture_manifest_sha256;
    const f3ManifestHash = receipts.F3.input_hashes && receipts.F3.input_hashes.fixture_manifest_sha256;
    if (f1ManifestHash !== f3ManifestHash) errors.push("cross-receipt input hash mismatch: fixture_manifest_sha256");
    const f1SourceInventoryHash = receipts.F1.input_hashes && receipts.F1.input_hashes.source_inventory_sha256;
    const f2SourceInventoryHash = receipts.F2.input_hashes && receipts.F2.input_hashes.source_inventory_sha256;
    const f3SourceInventoryHash = receipts.F3.input_hashes && receipts.F3.input_hashes.source_inventory_sha256;
    if (f1SourceInventoryHash !== f3SourceInventoryHash || f2SourceInventoryHash !== f3SourceInventoryHash) {
      errors.push("cross-receipt input hash mismatch: source_inventory_sha256");
    }
    validateTimestamp(receipts.F1.audited_at, "F1", errors);
    validateTimestamp(receipts.F2.audited_at, "F2", errors);
    validateTimestamp(receipts.F3.generated_at, "F3", errors);
  }

  const ok = errors.length === 0;
  const receipt = {
    ok,
    run_id: options.runId || null,
    input_hashes: receipts.F1 ? receipts.F1.input_hashes : null,
    checks,
    errors,
    note: "F3 시각 QA는 실제 Obsidian에서 사람이 최종 확인해야 합니다.",
    real_apply_count: receipts.F2 && Number.isInteger(receipts.F2.real_apply_count) ? receipts.F2.real_apply_count : null,
    secret_hits: receipts.F2 && Number.isInteger(receipts.F2.secret_hits) ? receipts.F2.secret_hits : null,
    aggregated_at: new Date().toISOString(),
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
  catch (error) { process.stderr.write(`final audit failed: ${error.message}\n`); process.exitCode = 1; }
}

module.exports = Object.freeze({ parseArgs, readReceipt, validF1, validF2, validF3, validateTimestamp });
