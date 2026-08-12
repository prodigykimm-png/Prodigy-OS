"use strict";

/*
 * Knowledge authoring smoke runner (Task 11).
 *
 * Enumerates every direct authoring/source/batch suite plus relevant
 * Candidate, Hub, Explorer, property, and workspace tests.
 * Missing suite or skip signal = failure. No glob, no selective run.
 */

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const ROOT = path.resolve(__dirname, "../../../../../..");

const SUITES = Object.freeze([
  "SYSTEM/AI/Skills/prodigy-review/tests/knowledge/test_knowledge_authoring_contract.js",
  "SYSTEM/AI/Skills/prodigy-review/tests/knowledge/test_knowledge_authoring_static_fixture.js",
  "SYSTEM/AI/Skills/prodigy-review/tests/knowledge/test_knowledge_authoring_core.js",
  "SYSTEM/AI/Skills/prodigy-review/tests/knowledge/test_knowledge_authoring_validation.js",
  "SYSTEM/AI/Skills/prodigy-review/tests/knowledge/test_knowledge_source_batch_policy.js",
  "SYSTEM/AI/Skills/prodigy-review/tests/knowledge/test_knowledge_candidate_store.js",
  "SYSTEM/AI/Skills/prodigy-review/tests/knowledge/test_knowledge_source_store.js",
  "SYSTEM/AI/Skills/prodigy-review/tests/knowledge/test_knowledge_source_fetch_service.js",
  "SYSTEM/AI/Skills/prodigy-review/tests/knowledge/test_knowledge_source_batch_service.js",
  "SYSTEM/AI/Skills/prodigy-review/tests/knowledge/test_knowledge_direct_authoring_view.js",
  "SYSTEM/AI/Skills/prodigy-review/tests/knowledge/test_knowledge_para_creator.js",
  "SYSTEM/AI/Skills/prodigy-review/tests/knowledge/test_venue_workspace.js",
  "SYSTEM/AI/Skills/prodigy-review/tests/knowledge/test_knowledge_source_authoring_view.js",
  "SYSTEM/AI/Skills/prodigy-review/tests/knowledge/test_knowledge_source_batch_view.js",
  "SYSTEM/AI/Skills/prodigy-review/tests/knowledge/test_knowledge_hub_integration.js",
  "SYSTEM/AI/Skills/prodigy-review/tests/knowledge/test_knowledge_candidate_view.js",
  "SYSTEM/AI/Skills/prodigy-review/tests/knowledge/test_knowledge_explorer_data_source.js",
  "SYSTEM/AI/Skills/prodigy-review/tests/knowledge/test_knowledge_explorer_view.js",
  "SYSTEM/AI/Skills/prodigy-review/tests/knowledge/test_knowledge_explorer_responsive.js",
  "SYSTEM/AI/Skills/prodigy-review/tests/workspace/test_workspace_consistency.js"
]);

const PROPERTY_AUDIT_CMD = "uv";
const PROPERTY_AUDIT_ARGS = [
  "run",
  "SYSTEM/AI/Skills/prodigy-property-contract/scripts/audit_property_contract.py",
  "--vault", ".", "--format", "text"
];

function runSuite(relativePath) {
  const absolutePath = path.join(ROOT, relativePath);
  if (!fs.existsSync(absolutePath)) {
    return { suite: relativePath, ok: false, reason: "MISSING_FILE" };
  }
  const result = spawnSync(process.execPath, [absolutePath], {
    cwd: ROOT, encoding: "utf8", timeout: 30000
  });
  if (result.error) {
    return { suite: relativePath, ok: false, reason: `SPAWN_ERROR: ${result.error.message}` };
  }
  const combined = (result.stdout || "") + (result.stderr || "");
  if (result.status !== 0) {
    return { suite: relativePath, ok: false, reason: `EXIT_${result.status}`, tail: combined.slice(-500) };
  }
  if (/skip|SKIP|\.skip\(/.test(combined) && !/no skip|0 skip/i.test(combined)) {
    return { suite: relativePath, ok: false, reason: "SKIP_SIGNAL_DETECTED", tail: combined.slice(-500) };
  }
  return { suite: relativePath, ok: true };
}

function runPropertyAudit() {
  const result = spawnSync(PROPERTY_AUDIT_CMD, PROPERTY_AUDIT_ARGS, {
    cwd: ROOT, encoding: "utf8", timeout: 30000
  });
  const combined = (result.stdout || "") + (result.stderr || "");
  if (result.status !== 0 || !/Property contract: PASS/.test(combined)) {
    return { ok: false, reason: `PROPERTY_AUDIT_FAILED (exit ${result.status})`, tail: combined.slice(-500) };
  }
  return { ok: true };
}

function main() {
  const failures = [];
  for (const suite of SUITES) {
    const result = runSuite(suite);
    if (!result.ok) {
      failures.push(result);
      process.stderr.write(`FAIL ${result.suite}: ${result.reason}\n`);
      if (result.tail) process.stderr.write(result.tail + "\n");
    } else {
      process.stdout.write(`PASS ${result.suite}\n`);
    }
  }
  const audit = runPropertyAudit();
  if (!audit.ok) {
    failures.push({ suite: "property-audit", ok: false, reason: audit.reason, tail: audit.tail });
    process.stderr.write(`FAIL property-audit: ${audit.reason}\n`);
  } else {
    process.stdout.write("PASS property-audit\n");
  }
  if (failures.length > 0) {
    process.stderr.write(`\n${failures.length} failure(s) in knowledge authoring smoke baseline.\n`);
    process.exit(1);
  }
  process.stdout.write(`\nKnowledge authoring smoke baseline: ${SUITES.length + 1} checks passed.\n`);
}

main();
