"use strict";

/*
 * C1–C5 operating-contract smoke runner.
 *
 * This deliberately invokes direct Node suites one by one. Do not replace this
 * with a glob: the ordered contract and the one known region exclusion are part
 * of the baseline, not an incidental implementation detail.
 */

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const ROOT = path.resolve(__dirname, "../../../../../..");

const CONTRACTS = Object.freeze([
  Object.freeze({
    id: "C1",
    name: "Candidate lifecycle",
    suites: Object.freeze([
      "SYSTEM/AI/Skills/prodigy-review/tests/knowledge/test_knowledge_candidate_contract.js",
      "SYSTEM/AI/Skills/prodigy-review/tests/knowledge/test_knowledge_candidate_core.js",
      "SYSTEM/AI/Skills/prodigy-review/tests/knowledge/test_knowledge_candidate_store.js",
      "SYSTEM/AI/Skills/prodigy-review/tests/knowledge/test_knowledge_candidate_view.js"
    ])
  }),
  Object.freeze({
    id: "C2",
    name: "Evidence Quality",
    suites: Object.freeze([
      "SYSTEM/AI/Skills/prodigy-review/tests/journal/test_evidence_quality_core.js",
      "SYSTEM/AI/Skills/prodigy-review/tests/journal/test_daily_reflection_candidate_handoff.js"
    ])
  }),
  Object.freeze({
    id: "C3",
    name: "Decision Packet",
    suites: Object.freeze([
      "SYSTEM/AI/Skills/prodigy-review/tests/knowledge/test_decision_packet_core.js",
      "SYSTEM/AI/Skills/prodigy-review/tests/auction/test_auction_decision_packet.js"
    ])
  }),
  Object.freeze({
    id: "C4",
    name: "Auction operating loop",
    suites: Object.freeze([
      "SYSTEM/AI/Skills/prodigy-review/tests/auction/test_bid_calendar.js",
      "SYSTEM/AI/Skills/prodigy-review/tests/auction/test_auction_day.js"
    ])
  }),
  Object.freeze({
    id: "C5",
    name: "Reading learning loop",
    suites: Object.freeze([
      "SYSTEM/AI/Skills/prodigy-review/tests/reading/test_reading_learning_loop.js",
      "SYSTEM/AI/Skills/prodigy-review/tests/reading/test_reading_store_loop.js"
    ])
  })
]);

const KNOWN_REGION_BASELINE = Object.freeze({
  suite: "SYSTEM/AI/Skills/prodigy-review/tests/auction/test_auction_region.js",
  expectedFailure: /region_sigungu/,
  reason: ".opencode auction-brief is a discovery adapter, while the direct region test still expects the canonical contract inline."
});

function fail(message) {
  throw new Error(message);
}

function relativePath(value) {
  if (typeof value !== "string" || !value.startsWith("SYSTEM/")) fail(`Invalid direct suite path: ${String(value)}`);
  return value;
}

function suitePath(value) {
  return path.join(ROOT, relativePath(value));
}

function assertSuiteExists(value) {
  const absolute = suitePath(value);
  if (!fs.existsSync(absolute)) fail(`Missing required direct suite: ${value}`);
  if (!fs.statSync(absolute).isFile()) fail(`Required direct suite is not a file: ${value}`);
  return absolute;
}

function assertNotSkipped(output, suite) {
  // Direct suites must fail through Node's exit status. A TAP-style skip or an
  // explicit SKIP/TODO result is not evidence that this contract passed.
  if (/(?:^|\n)\s*(?:#\s*)?(?:skip(?:ped)?|todo)\b/im.test(output)) {
    fail(`Skipped direct suite is not allowed: ${suite}`);
  }
}

function assertPlan() {
  const ids = CONTRACTS.map((contract) => contract.id);
  assert.deepEqual(ids, ["C1", "C2", "C3", "C4", "C5"], "C1–C5 must remain ordered and complete");
  const seen = new Set();
  for (const contract of CONTRACTS) {
    if (!contract.name || !Array.isArray(contract.suites) || !contract.suites.length) {
      fail(`${contract.id} must declare one or more direct suites.`);
    }
    for (const suite of contract.suites) {
      if (seen.has(suite)) fail(`A direct suite may belong to only one C gate: ${suite}`);
      seen.add(suite);
      assertSuiteExists(suite);
    }
  }
  if (seen.has(KNOWN_REGION_BASELINE.suite)) fail("The known region baseline must be explicit, not silently included.");
  assertSuiteExists(KNOWN_REGION_BASELINE.suite);
}

function runNodeSuite(suite) {
  const result = spawnSync(process.execPath, [assertSuiteExists(suite)], {
    cwd: ROOT,
    encoding: "utf8"
  });
  if (result.error) fail(`Could not start ${suite}: ${result.error.message}`);
  const output = `${result.stdout || ""}${result.stderr || ""}`;
  process.stdout.write(output);
  if (result.status !== 0) fail(`Direct suite failed (${result.status}): ${suite}`);
  assertNotSkipped(output, suite);
}

function expectFailure(operation, expression) {
  assert.throws(operation, expression);
}

function runFailureGuards() {
  // These are deliberately failing-first checks. They prove a future edit cannot
  // turn a missing suite or an explicit skip into a green smoke result.
  expectFailure(() => assertSuiteExists("SYSTEM/AI/Skills/prodigy-review/tests/knowledge/__missing__.js"), /Missing required direct suite/);
  expectFailure(() => assertNotSkipped("# SKIP future direct test\n", "fixture"), /Skipped direct suite is not allowed/);
  console.log("Smoke failure guards passed (missing and skipped suites fail).");
}

function verifyKnownRegionBaseline() {
  const suite = KNOWN_REGION_BASELINE.suite;
  const result = spawnSync(process.execPath, [assertSuiteExists(suite)], {
    cwd: ROOT,
    encoding: "utf8"
  });
  if (result.error) fail(`Could not start known region baseline: ${result.error.message}`);
  const output = `${result.stdout || ""}${result.stderr || ""}`;
  process.stdout.write(output);
  if (result.status === 0) fail(`Known region baseline unexpectedly passed; remove its exclusion and update the operating contract: ${suite}`);
  if (!KNOWN_REGION_BASELINE.expectedFailure.test(output)) {
    fail(`Known region baseline failed for an unexpected reason; do not hide it: ${suite}`);
  }
  console.log(`Confirmed known region baseline failure: ${suite}`);
}

function main(args) {
  if (args.length === 1 && args[0] === "--help") {
    console.log("Usage: node run_knowledge_decision_loop_tests.js [--self-test | --verify-known-region-baseline]");
    return;
  }
  if (args.length > 1 || (args.length === 1 && args[0] !== "--self-test" && args[0] !== "--verify-known-region-baseline")) {
    fail("This smoke runner does not allow selecting or skipping C1–C5 suites.");
  }

  assertPlan();
  runFailureGuards();
  if (args[0] === "--self-test") return;
  if (args[0] === "--verify-known-region-baseline") {
    verifyKnownRegionBaseline();
    return;
  }

  console.log(`Known exclusion (not a pass): ${KNOWN_REGION_BASELINE.suite}`);
  console.log(`Reason: ${KNOWN_REGION_BASELINE.reason}`);
  for (const contract of CONTRACTS) {
    console.log(`\n${contract.id} — ${contract.name}`);
    contract.suites.forEach(runNodeSuite);
  }
  console.log("\nC1–C5 knowledge decision loop smoke passed.");
}

try {
  main(process.argv.slice(2));
} catch (error) {
  console.error(`Smoke failed: ${error.stack || error.message}`);
  process.exitCode = 1;
}
