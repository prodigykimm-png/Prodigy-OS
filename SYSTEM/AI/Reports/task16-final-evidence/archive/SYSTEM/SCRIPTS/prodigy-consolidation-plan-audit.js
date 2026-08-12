#!/usr/bin/env node
"use strict";

/** F1: fail-closed plan, ownership, and clean-checkout baseline audit. */

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
    else if (key === "--run-id") options.runId = value;
    else if (key === "--output") options.outputPath = value;
  }
  return options;
}

function validateBaseline(baseline, errors) {
  if (!baseline || baseline.schema_version !== 1 || baseline.baseline_id !== "clean-checkout-v1") {
    errors.push("baseline shape invalid");
    return false;
  }
  for (const field of ["dirty_tracked", "untracked", "cache_membership", "region_objects"]) {
    if (!Array.isArray(baseline[field])) errors.push(`baseline ${field} invalid`);
  }
  const counts = baseline.manifest_counts;
  if (!counts || counts.busan !== 16 || counts.seoul !== 25 || counts.gyeonggi !== 31 || counts.incheon !== 11 || counts.total !== 83) {
    errors.push("baseline manifest counts invalid");
  }
  return errors.length === 0;
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

  const planContent = validated ? fs.readFileSync(validated.entries.get("plan.md").absolutePath, "utf8") : "";
  const todoChecked = (planContent.match(/^- \[x\] \d+\./gm) || []).length;
  const todoUnchecked = (planContent.match(/^- \[ \] \d+\./gm) || []).length;
  const finalChecked = (planContent.match(/^- \[x\] F\d+\./gm) || []).length;
  const finalUnchecked = (planContent.match(/^- \[ \] F\d+\./gm) || []).length;
  const todoCount = todoChecked + todoUnchecked;
  const finalCount = finalChecked + finalUnchecked;
  if (validated && (todoCount !== 16 || todoChecked !== 16)) errors.push("plan todo inventory invalid");
  if (validated && (finalCount !== 4 || finalChecked !== 4)) errors.push("plan final inventory invalid");
  const dependencyOk = validated ? /## Dependency waves/.test(planContent) && /Wave G: Todo 15 after all prior Todos/.test(planContent) : false;
  if (validated && !dependencyOk) errors.push("plan dependency waves invalid");
  if (validated) validateBaseline(validated.baseline, errors);

  const inputHashes = validated ? {
    fixture_manifest_sha256: validated.hashes.fixture_manifest_sha256,
    plan_sha256: validated.hashes.plan_sha256,
    ownership_sha256: validated.hashes.ownership_sha256,
    baseline_sha256: validated.hashes.baseline_sha256,
    source_inventory_sha256: validated.hashes.source_inventory_sha256,
  } : null;
  const ok = errors.length === 0;
  const receipt = {
    ok,
    run_id: options.runId || null,
    input_hashes: inputHashes,
    plan_sha256: inputHashes ? inputHashes.plan_sha256 : null,
    ownership_path_count: validated ? validated.ownedPaths.length : 0,
    ownership_source_mode: validated ? validated.sourceMode : null,
    todo_count: todoCount,
    todo_checked: todoChecked,
    final_count: finalCount,
    final_checked: finalChecked,
    dependency_ok: dependencyOk,
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
  catch (error) { process.stderr.write(`plan audit failed: ${error.message}\n`); process.exitCode = 1; }
}

module.exports = Object.freeze({ parseArgs, validateBaseline });
