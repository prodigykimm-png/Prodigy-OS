"use strict";

/*
 * Knowledge stability sprint convergence runner (Todo 12).
 *
 * Runs the full stability smoke suite (which includes all sprint contracts,
 * dogfood, CI contract, and docs contract) as a single entry point. This is
 * the "everything passes" gate for the sprint.
 *
 * Usage: node run_knowledge_stability_sprint_tests.js
 */

const { spawnSync } = require("node:child_process");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "../../../../..");
const SMOKE = path.join(ROOT, "SYSTEM/AI/Skills/prodigy-review/tests/run_stability_smoke_tests.js");

function run(label, file, args) {
  console.log(`\n=== ${label} ===\n`);
  const result = spawnSync(process.execPath, [file, ...(args || [])], {
    cwd: ROOT,
    encoding: "utf8",
    timeout: 180000,
    stdio: "inherit"
  });
  if (result.error) {
    console.error(`${label} could not start: ${result.error.message}`);
    process.exitCode = 1;
    return false;
  }
  if (result.status !== 0) {
    console.error(`${label} failed with exit code ${result.status}`);
    process.exitCode = 1;
    return false;
  }
  return true;
}

function main() {
  const ok = run("Stability Smoke (all contracts + dogfood + CI + docs)", SMOKE, []);
  if (ok) {
    console.log("\n✓ Knowledge stability sprint convergence: ALL GREEN");
  } else {
    console.error("\n✗ Knowledge stability sprint convergence: FAILED");
  }
}

main();
