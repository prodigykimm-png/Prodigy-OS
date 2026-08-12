"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const ROOT = path.resolve(__dirname, "../../../../..");
const HARNESS = path.join(ROOT, "SYSTEM/CI/release-fixture-harness.js");
const FIXTURES = path.join(ROOT, "SYSTEM/CI/fixtures/release-vault");
const CASES = Object.freeze([
  "empty-vault", "minimal-valid-object", "invalid-property", "duplicate-object",
  "stale-source", "missing-optional-module", "provider-timeout", "provider-401", "provider-429"
]);
const JOURNEYS = Object.freeze(["project", "people", "reading", "home", "journal", "workout"]);

function run(args) {
  return spawnSync(process.execPath, [HARNESS, ...args], { cwd: ROOT, encoding: "utf8" });
}

function parse(result) {
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return JSON.parse(result.stdout);
}

assert.ok(fs.existsSync(HARNESS), "tracked release fixture harness is required");
assert.ok(fs.existsSync(path.join(FIXTURES, "fixture-manifest.json")), "tracked release fixture manifest is required");

const integrity = parse(run(["--fixtures"]));
assert.equal(integrity.ok, true);
assert.deepEqual(integrity.case_ids, CASES);
assert.equal(integrity.case_count, 9);
assert.deepEqual(integrity.suite_ids, JOURNEYS, "explicit suite registry must contain every independent journey");
assert.equal(integrity.private_path_hits, 0);
assert.equal(integrity.absolute_path_hits, 0);
const byCase = new Map(integrity.results.map((entry) => [entry.id, entry]));
assert.equal(byCase.get("empty-vault").objects, 0, "successful empty read is distinct from read failure");
assert.deepEqual(byCase.get("empty-vault").rejected_read.states, ["failure", "recovery"]);
assert.equal(byCase.get("empty-vault").rejected_read.surfaced_as_empty, false);
assert.equal(byCase.get("empty-vault").rejected_read.recovered_objects, 0);
assert.equal(byCase.get("duplicate-object").production_seam, "WorkoutRunningProjection.saveActivities");
assert.equal(byCase.get("duplicate-object").first_execution_created, 1);
assert.equal(byCase.get("duplicate-object").second_execution_created, 0);
assert.equal(byCase.get("duplicate-object").second_execution_write_count, 0);
assert.equal(byCase.get("duplicate-object").second_execution_manifest_unchanged, true);
assert.equal(byCase.get("invalid-property").production_audit, "audit_property_contract.py");
assert.equal(byCase.get("invalid-property").audit_exit_status, 1, "invalid Property must use the distinct audit-failure exit status");
assert.equal(byCase.get("invalid-property").audit_error_count, 1, "invalid Property must surface exactly one production audit error");
assert.equal(byCase.get("invalid-property").code, "missing_property_label");
assert.equal(byCase.get("invalid-property").property, "private_owner");
assert.equal(byCase.get("invalid-property").write_attempts, 0);
assert.equal(byCase.get("invalid-property").write_count, 0);
assert.equal(byCase.get("invalid-property").manifest_unchanged, true);
assert.equal(byCase.get("stale-source").winner_mtime, 20);
assert.equal(byCase.get("missing-optional-module").required_surface, "available");
assert.equal(byCase.get("missing-optional-module").optional_surface, "unavailable");
for (const id of ["provider-timeout", "provider-401", "provider-429"]) {
  assert.deepEqual(byCase.get(id).journey_states, ["entry", "loading", "error", "retry", "recovered", "home_return"]);
  assert.equal(byCase.get(id).retry_available, true);
  assert.equal(byCase.get(id).recovered, true);
  assert.equal(byCase.get(id).write_count, 0);
}
const fixtureBytes = fs.readdirSync(path.join(FIXTURES, "cases")).sort().map((name) => fs.readFileSync(path.join(FIXTURES, "cases", name), "utf8")).join("\n")
  + fs.readFileSync(path.join(FIXTURES, "fixture-manifest.json"), "utf8")
  + fs.readFileSync(path.join(FIXTURES, "suite-registry.json"), "utf8");
assert.doesNotMatch(fixtureBytes, /\/Users\/|SYSTEM\/(?:PRIVATE|CACHE)|\.obsidian/u, "journey fixture bytes must not contain private paths");

for (const journey of JOURNEYS) {
  const receipt = parse(run(["--journey", journey]));
  assert.equal(receipt.ok, true, `${journey} journey failed`);
  assert.equal(receipt.journey, journey);
  assert.deepEqual(receipt.steps, ["entry", "primary_action", "save_or_no_write", "failure", "recovery", "home_return"]);
  assert.equal(receipt.failure.no_write, true);
  assert.equal(receipt.recovery.authorized_change_count, 1);
  assert.equal(receipt.home_return.path, receipt.home_return.registry_path);
  assert.equal(receipt.home_return.opened_target, receipt.home_return.registry_path);
  assert.equal(receipt.home_return.focus_after, receipt.home_return.registry_path);
  assert.equal(receipt.home_return.focus_before, receipt.entry.path);
  assert.equal(receipt.home_return.wrong_target_rejected, true);
  assert.equal(receipt.cleanup.temp_vault_deleted, true);
  assert.doesNotMatch(JSON.stringify(receipt), /\/Users\/|SYSTEM\/PRIVATE|SYSTEM\/CACHE|\.obsidian/u);
}

const all = parse(run(["--all"]));
assert.equal(all.ok, true);
assert.equal(all.fixture_cases.passed, 9);
assert.equal(all.fixture_cases.total, 9);
assert.equal(all.journeys.passed, 6);
assert.equal(all.journeys.total, 6);
assert.match(all.digest, /^[a-f0-9]{64}$/u);
assert.equal(all.cleanup.temp_vaults_remaining, 0);

console.log(`Release fixture journeys passed: cases=${CASES.length}/${CASES.length}, journeys=${JOURNEYS.length}/${JOURNEYS.length}, digest=${all.digest}.`);
