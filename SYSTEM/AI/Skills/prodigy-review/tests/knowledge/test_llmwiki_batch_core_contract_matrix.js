"use strict";

/*
 * Task 2 green structural suite: the historical regression matrix and golden
 * receipt contract must be machine-readable, complete, and internally
 * consistent. This suite asserts contract DATA only; behavioral reds live in
 * test_llmwiki_batch_core_golden_receipt.js (intentionally failing until the
 * batch core implementation task turns them green).
 */

const assert = require("node:assert/strict");
const { test } = require("node:test");
const fs = require("node:fs");
const path = require("node:path");
const contract = require("./llmwiki_batch_core_receipt_contract.js");

const ROOT = path.resolve(__dirname, "../../../../../..");

test("historical regression matrix covers every plan incident exactly once", () => {
  const ids = contract.incidentIds();
  assert.equal(ids.length, 14);
  assert.equal(new Set(ids).size, 14, "incident ids must be unique");
  for (let index = 0; index < ids.length; index += 1) {
    assert.equal(ids[index], `H${String(index + 1).padStart(2, "0")}`);
  }
  for (const row of contract.HISTORICAL_INCIDENTS) {
    assert.equal(typeof row.incident, "string");
    assert.match(row.objective_assertion, /^(remount_|provider_|unconfigured_|schema_|same_|automatic_|no_second|quota_|mount_|blocked_|provider_calls|one_batch|inbox_roles|assertions_)/u);
    assert.ok(Number.isInteger(row.owning_task) && row.owning_task >= 4 && row.owning_task <= 14, row.id);
    assert.match(row.regression_suite, /^test_[a-z0-9_]+\.js$/u);
    const suitePath = path.join(__dirname, row.regression_suite);
    assert.equal(fs.existsSync(suitePath), true, `${row.id} references missing suite ${row.regression_suite}`);
  }
});

test("required counter set matches the plan verbatim as machine keys", () => {
  assert.deepEqual([...contract.REQUIRED_COUNTERS], [
    "provider_calls",
    "pack_count",
    "source_bytes",
    "candidate_context_bytes",
    "fixed_prompt_bytes",
    "cache_hits",
    "cache_misses",
    "canonical_writes",
    "source_writes",
    "audit_writes",
    "git_writes",
    "fallback_attempts",
    "automatic_retries",
    "automatic_repairs",
  ]);
  for (const counter of contract.ZERO_ON_GOLDEN_PATH) {
    assert.ok(contract.REQUIRED_COUNTERS.includes(counter));
  }
});

test("golden state sequence is the locked single-run lifecycle", () => {
  assert.deepEqual([...contract.GOLDEN_STATE_SEQUENCE], [
    "pending",
    "running",
    "review_ready",
    "approved",
    "committed",
    "processed",
  ]);
});

test("every receipt invariant names only defined adversarial classes", () => {
  const classIds = new Set(contract.ADVERSARIAL_CLASSES.map((row) => row.class_id));
  assert.deepEqual([...classIds].sort(), [
    "cancel_resume",
    "dirty_worktree",
    "flaky_tests",
    "malformed_input",
    "misleading_success_output",
    "prompt_injection",
    "stale_state",
  ]);
  const invariantIds = new Set(contract.GOLDEN_RECEIPT_INVARIANTS.map((row) => row.id));
  for (const invariant of contract.GOLDEN_RECEIPT_INVARIANTS) {
    assert.ok(invariantIds.size > 0);
    for (const rejected of invariant.rejects) {
      assert.ok(classIds.has(rejected), `${invariant.id} rejects unknown class ${rejected}`);
    }
  }
  for (const adversarial of contract.ADVERSARIAL_CLASSES) {
    for (const invariantId of adversarial.rejected_by) {
      assert.ok(invariantIds.has(invariantId), `${adversarial.class_id} cites unknown invariant ${invariantId}`);
    }
  }
});

test("plan file still contains the incident list this matrix pins", () => {
  const plan = fs.readFileSync(path.join(ROOT, contract.PLAN_PATH), "utf8");
  const section = plan.indexOf("Historical failures this plan must close");
  assert.ok(section > 0);
  const numbered = [...plan.slice(section).matchAll(/^(\d+)\. /gmu)].length;
  assert.ok(numbered >= 14, `expected at least 14 numbered incidents, found ${numbered}`);
});
