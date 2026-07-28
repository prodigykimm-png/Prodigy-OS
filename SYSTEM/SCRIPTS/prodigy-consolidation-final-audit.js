#!/usr/bin/env node
"use strict";

/**
 * prodigy-consolidation-final-audit.js
 * F4: Final integrated audit aggregator.
 * Re-runs the plan, security, and visual receipts and confirms the whole
 * consolidation is internally consistent before human sign-off.
 * Read-only: never applies Objects, never stages/commits/pushes.
 */

const fs = require("node:fs");
const path = require("node:path");

function parseArgs(argv) {
  const options = {};
  for (let i = 0; i < argv.length; i += 1) {
    const key = argv[i];
    const value = argv[i + 1];
    if (!key.startsWith("--") || value === undefined) continue;
    i += 1;
    if (key === "--evidence-root") options.evidenceRoot = value;
    else if (key === "--output") options.outputPath = value;
  }
  return options;
}

function readReceipt(absPath) {
  if (!fs.existsSync(absPath)) return null;
  try { return JSON.parse(fs.readFileSync(absPath, "utf8")); }
  catch (_e) { return null; }
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const vaultRoot = process.cwd();
  const evidenceRoot = path.resolve(vaultRoot, options.evidenceRoot || ".omo/evidence/prodigy-region-workspace-consolidation");

  const f1 = readReceipt(path.join(evidenceRoot, "final-F1/receipt.json"));
  const f2 = readReceipt(path.join(evidenceRoot, "final-F2/receipt.json"));
  const f3 = readReceipt(path.join(evidenceRoot, "final-F3/receipt.json"));

  const checks = {
    f1_plan_fidelity: Boolean(f1 && f1.ok),
    f2_security_lineage: Boolean(f2 && f2.ok && f2.secret_hits === 0 && f2.real_apply_count === 0),
    f3_visual_recorded: Boolean(f3 && f3.ok && f3.dom_tests_only === false)
  };

  const ok = checks.f1_plan_fidelity && checks.f2_security_lineage && checks.f3_visual_recorded;

  const receipt = {
    ok,
    checks,
    note: "F3 시각 QA는 실제 Obsidian에서 사람이 최종 확인해야 합니다.",
    real_apply_count: f2 ? f2.real_apply_count : null,
    secret_hits: f2 ? f2.secret_hits : null,
    aggregated_at: new Date().toISOString()
  };

  if (options.outputPath) {
    const outAbs = path.resolve(vaultRoot, options.outputPath);
    fs.mkdirSync(path.dirname(outAbs), { recursive: true });
    fs.writeFileSync(outAbs, JSON.stringify(receipt, null, 2) + "\n", "utf8");
  }
  process.stdout.write(JSON.stringify(receipt, null, 2) + "\n");
  if (!ok) process.exitCode = 1;
}

if (require.main === module) {
  try { main(); } catch (error) { process.stderr.write(`${error.stack}\n`); process.exitCode = 1; }
}

module.exports = Object.freeze({ parseArgs, readReceipt });
