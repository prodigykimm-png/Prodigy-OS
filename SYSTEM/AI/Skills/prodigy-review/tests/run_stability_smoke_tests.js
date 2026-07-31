"use strict";

/*
 * Stability smoke runner (Todo 3).
 *
 * One explicit, ordered manifest of the contracts this sprint touches. No glob,
 * no selective run, no date-sensitive writers, no provider network calls. A missing
 * suite, a skip/TODO signal, or a new Property-audit warning is a hard failure so a
 * future edit cannot silently turn a broken contract green.
 */

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const ROOT = path.resolve(__dirname, "../../../../..");

const SUITES = Object.freeze([
  "SYSTEM/AI/Skills/prodigy-review/tests/knowledge/test_knowledge_candidate_contract.js",
  "SYSTEM/AI/Skills/prodigy-review/tests/knowledge/test_knowledge_candidate_core.js",
  "SYSTEM/AI/Skills/prodigy-review/tests/knowledge/test_knowledge_candidate_store.js",
  "SYSTEM/AI/Skills/prodigy-review/tests/knowledge/test_knowledge_candidate_view.js",
  "SYSTEM/AI/Skills/prodigy-review/tests/knowledge/test_knowledge_registry.js",
  "SYSTEM/AI/Skills/prodigy-review/tests/knowledge/test_knowledge_authoring_core.js",
  "SYSTEM/AI/Skills/prodigy-review/tests/knowledge/test_knowledge_explorer_core.js",
  "SYSTEM/AI/Skills/prodigy-review/tests/knowledge/test_decision_packet_core.js",
  "SYSTEM/AI/Skills/prodigy-review/tests/knowledge/test_decision_packet_reasons.js",
  "SYSTEM/AI/Skills/prodigy-review/tests/knowledge/test_knowledge_use_body_core.js",
  "SYSTEM/AI/Skills/prodigy-review/tests/knowledge/test_knowledge_use_body_store.js",
  "SYSTEM/AI/Skills/prodigy-review/tests/knowledge/test_knowledge_use_record_ui.js",
  "SYSTEM/AI/Skills/prodigy-review/tests/knowledge/test_knowledge_stability_docs.js",
  "SYSTEM/AI/Skills/prodigy-review/tests/journal/test_daily_reflection_candidate_policy.js",
  "SYSTEM/AI/Skills/prodigy-review/tests/journal/test_daily_reflection_people_handoff.js",
  "SYSTEM/AI/Skills/prodigy-review/tests/reading/test_reading_candidate_lifecycle.js",
  "SYSTEM/AI/Skills/prodigy-review/tests/reading/test_reading_store_loop.js",
  "SYSTEM/AI/Skills/prodigy-review/tests/workout/test_workout_decision_packet.js",
  "SYSTEM/AI/Skills/prodigy-review/tests/auction/test_auction_day.js",
  "SYSTEM/AI/Skills/prodigy-review/tests/home/run_js_tests.js",
  "SYSTEM/AI/Skills/prodigy-review/tests/home/test_home_interaction_lifecycle.js",
  "SYSTEM/AI/Skills/prodigy-review/tests/home/test_home_mobile_geometry.js",
  "SYSTEM/AI/Skills/prodigy-review/tests/people/test_people_refresh_loop.js",
  "SYSTEM/AI/Skills/prodigy-review/tests/knowledge/run_knowledge_dogfood_tests.js",
  "SYSTEM/AI/Skills/prodigy-review/tests/test_stability_ci_contract.js"
]);

// Pre-existing Property-audit warnings that are allowed to remain. A warning whose
// path is NOT in this list is a regression and fails the run. A listed warning that
// disappears is fine (the baseline may only shrink).
// 2026-07-27: region-experience-contract.js, region-experience-handoff.js 경고 해결됨 (EVIDENCE_CONTEXT 상수 추출)
const KNOWN_PROPERTY_WARNINGS = Object.freeze([]);

const PROPERTY_AUDIT_CMD = "uv";
const PROPERTY_AUDIT_ARGS = Object.freeze([
  "run",
  "SYSTEM/AI/Skills/prodigy-property-contract/scripts/audit_property_contract.py",
  "--vault", ".", "--format", "text"
]);

function fail(message) {
  throw new Error(message);
}

function relativePath(value) {
  if (typeof value !== "string" || !value.startsWith("SYSTEM/")) fail(`Invalid suite path: ${String(value)}`);
  return value;
}

function suitePath(value) {
  return path.join(ROOT, relativePath(value));
}

function assertSuiteExists(value) {
  const absolute = suitePath(value);
  if (!fs.existsSync(absolute)) fail(`Missing required smoke suite: ${value}`);
  if (!fs.statSync(absolute).isFile()) fail(`Required smoke suite is not a file: ${value}`);
  return absolute;
}

function assertNotSkipped(output, suite) {
  const skipSignal = output.split("\n").some((line) => {
    const trimmed = line.trim();
    if (/^#\s*(?:skipped|todo)\s+0$/i.test(trimmed)) return false;
    return /^(?:#\s*)?(?:skip(?:ped)?|todo)\b/i.test(trimmed);
  });
  if (skipSignal) {
    fail(`Skipped smoke suite is not allowed: ${suite}`);
  }
}

function runSuite(suite) {
  const result = spawnSync(process.execPath, [assertSuiteExists(suite)], { cwd: ROOT, encoding: "utf8", timeout: 120000 });
  if (result.error) fail(`Could not start ${suite}: ${result.error.message}`);
  const output = `${result.stdout || ""}${result.stderr || ""}`;
  process.stdout.write(output);
  if (result.status !== 0) fail(`Smoke suite failed (${result.status}): ${suite}`);
  assertNotSkipped(output, suite);
}

function auditWarningPaths(output) {
  return output.split("\n")
    .map((line) => line.trim())
    .filter((line) => /^WARNING\b/.test(line))
    .map((line) => line.replace(/^WARNING\s+\S+\s+/, "").split(":")[0].trim());
}

function checkAuditOutput(output, status) {
  if (status !== 0) fail(`Property audit exited non-zero (${status}).`);
  const warnings = auditWarningPaths(output);
  const unexpected = warnings.filter((warningPath) => !KNOWN_PROPERTY_WARNINGS.some((known) => warningPath.includes(known)));
  if (unexpected.length) fail(`Unexpected Property-audit warning(s): ${unexpected.join(", ")}`);
}

function runPropertyAudit() {
  const result = spawnSync(PROPERTY_AUDIT_CMD, PROPERTY_AUDIT_ARGS.map((arg) => arg), { cwd: ROOT, encoding: "utf8", timeout: 60000 });
  if (result.error) fail(`Could not start Property audit: ${result.error.message}`);
  const output = `${result.stdout || ""}${result.stderr || ""}`;
  process.stdout.write(output);
  checkAuditOutput(output, result.status);
}

function assertPlan() {
  const seen = new Set();
  for (const suite of SUITES) {
    if (seen.has(suite)) fail(`Duplicate smoke suite: ${suite}`);
    seen.add(suite);
    assertSuiteExists(suite);
  }
}

function runFailureGuards() {
  // These deliberately failing checks prove a missing suite, a skip signal, or an
  // unexpected audit warning can never pass the smoke run.
  assert.throws(() => assertSuiteExists("SYSTEM/AI/Skills/prodigy-review/tests/knowledge/__missing__.js"), /Missing required smoke suite/);
  assert.throws(() => assertNotSkipped("# SKIP future test\n", "fixture"), /Skipped smoke suite/);
  assert.throws(() => checkAuditOutput("WARNING raw_property_label SYSTEM/Views/some-new-file.js: auction\n", 0), /Unexpected Property-audit warning/);
  // A shrinking baseline (known warning gone) must stay green.
  checkAuditOutput("Property contract: 0 issue(s)\n", 0);
  console.log("Smoke failure guards passed (missing/skip/unexpected-warning fail; shrinking baseline passes).");
}

function main(args) {
  if (args.length === 1 && args[0] === "--help") {
    console.log("Usage: node run_stability_smoke_tests.js [--self-test]");
    return;
  }
  if (args.length > 1 || (args.length === 1 && args[0] !== "--self-test")) {
    fail("This smoke runner does not allow selecting or skipping suites.");
  }

  assertPlan();
  runFailureGuards();
  if (args[0] === "--self-test") return;

  for (const suite of SUITES) runSuite(suite);
  runPropertyAudit();
  console.log(`\nStability smoke passed: ${SUITES.length} suites + Property baseline.`);
}

try {
  main(process.argv.slice(2));
} catch (error) {
  console.error(`Stability smoke failed: ${error.stack || error.message}`);
  process.exitCode = 1;
}
