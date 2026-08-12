"use strict";

/*
 * Stability CI contract (Todo 9).
 *
 * Locks the CI workflow to the stability smoke runner and locks the runner's
 * manifest to the contracts this sprint owns. If someone removes the workflow,
 * drops the runner reference, deletes a required suite from SUITES, or empties
 * the Property-audit allowlist, this test fails so the safety net cannot be
 * silently turned off.
 */

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "../../../../..");
const WORKFLOW = path.join(ROOT, ".github", "workflows", "prodigy-stability-smoke.yml");
const RELEASE_GATE = path.join(ROOT, "SYSTEM", "CI", "run-release-gate.sh");
const RUNNER = path.join(ROOT, "SYSTEM", "AI", "Skills", "prodigy-review", "tests", "run_stability_smoke_tests.js");

function read(file) {
  if (!fs.existsSync(file)) {
    throw new Error(`Missing required file: ${path.relative(ROOT, file)}`);
  }
  return fs.readFileSync(file, "utf8");
}

function checkWorkflow() {
  const yaml = read(WORKFLOW);
  for (const trigger of ["push:", "pull_request:", "workflow_dispatch:"]) {
    assert.ok(yaml.includes(trigger), `Workflow missing trigger ${trigger}`);
  }
  for (const reference of [
    "actions/checkout",
    "setup-node",
    "node-version: '24'",
    "setup-uv",
    "bash SYSTEM/CI/run-release-gate.sh"
  ]) {
    assert.ok(yaml.includes(reference), `Workflow missing reference ${reference}`);
  }
  assert.ok(read(RELEASE_GATE).includes("run_stability_smoke_tests.js"), "Release gate lost stability smoke runner");
}

function checkRunnerManifest() {
  const src = read(RUNNER);
  for (const suite of [
    "test_knowledge_candidate_contract.js",
    "test_knowledge_candidate_core.js",
    "test_decision_packet_reasons.js",
    "test_knowledge_use_body_core.js",
    "test_knowledge_use_body_store.js",
    "test_daily_reflection_people_handoff.js",
    "test_home_interaction_lifecycle.js",
    "test_home_mobile_geometry.js",
    "test_people_refresh_loop.js",
    "run_knowledge_dogfood_tests.js",
    "test_task15_recovery_proof.js"
  ]) {
    assert.ok(src.includes(suite), `Smoke runner lost required suite ${suite}`);
  }
  for (const warning of ["region-experience-contract.js", "region-experience-handoff.js"]) {
    assert.ok(src.includes(warning), `Smoke runner lost known Property warning allowlist ${warning}`);
  }
  assert.ok(src.includes("runPropertyAudit"), "Smoke runner lost Property audit step");
  assert.ok(src.includes("runFailureGuards"), "Smoke runner lost failure guards");
}

function main() {
  checkWorkflow();
  checkRunnerManifest();
  console.log("Stability CI contract passed: workflow + runner manifest locked.");
}

try {
  main();
} catch (error) {
  console.error(`Stability CI contract failed: ${error.stack || error.message}`);
  process.exitCode = 1;
}
