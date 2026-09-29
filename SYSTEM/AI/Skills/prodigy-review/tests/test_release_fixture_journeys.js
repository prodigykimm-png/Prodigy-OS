"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const ROOT = path.resolve(__dirname, "../../../../..");
const HARNESS = path.join(ROOT, "SYSTEM/CI/release-fixture-harness.js");
const FIXTURES = path.join(ROOT, "SYSTEM/CI/fixtures/release-vault");
// 3542f31 retired the provider journey ("Provider 실행 코드를 vault에서 퇴역"): its vault
// implementation modules were deleted and must not be re-added, so the three provider
// fixture cases no longer exist. CASES names only the six live journeys.
const CASES = Object.freeze([
  "empty-vault", "minimal-valid-object", "invalid-property", "duplicate-object",
  "stale-source", "missing-optional-module"
]);
// Names the retired provider cases so the suite below can pin their absence instead of
// their behavior. These ids must stay out of CASES while the retirement stands.
const RETIRED_PROVIDER_CASES = Object.freeze(["provider-timeout", "provider-401", "provider-429"]);
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
// Old expectation case_count 9 counted the three retired provider cases, whose execution
// required SYSTEM/Views/ai-provider-error-policy.js, deleted in 3542f31. Correct value is 6.
assert.equal(integrity.case_count, 6);
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
// The old pins below asserted live error→retry→recovered behavior of the provider surface.
// That surface was retired in 3542f31, so asserting its behavior would require resurrecting
// the deleted provider modules. The correct pins state the retirement explicitly: the cases
// do not run, their fixture files are gone, the harness has no provider leg, and the trust
// anchor no longer lists them.
for (const id of RETIRED_PROVIDER_CASES) {
  assert.equal(byCase.has(id), false, `${id} must not run: the provider journey was retired in 3542f31`);
  assert.equal(fs.existsSync(path.join(FIXTURES, "cases", `${id}.json`)), false, `${id} fixture must stay deleted under the 3542f31 retirement`);
}
const harnessSource = fs.readFileSync(HARNESS, "utf8");
assert.doesNotMatch(harnessSource, /fixture\.kind === "provider"/u, "harness must not keep a provider leg for the retired journey");
// Matches require(...) specifically: the retirement comments in the harness name the deleted
// module intentionally (that naming is the required record of why the leg is gone), so a bare
// mention must not trip this pin — only an executable reference may.
assert.doesNotMatch(harnessSource, /require\([^)]*ai-provider-error-policy/u, "harness must not require the retired provider module");
const releaseManifest = JSON.parse(fs.readFileSync(path.join(FIXTURES, "fixture-manifest.json"), "utf8"));
assert.deepEqual(releaseManifest.fixtures.filter((entry) => entry.path.includes("provider")), [], "trust anchor must not list retired provider fixtures");
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
// Old expectation passed/total 9 counted the three retired provider cases (see case_count note).
assert.equal(all.fixture_cases.passed, 6);
assert.equal(all.fixture_cases.total, 6);
assert.equal(all.journeys.passed, 6);
assert.equal(all.journeys.total, 6);
assert.match(all.digest, /^[a-f0-9]{64}$/u);
assert.equal(all.cleanup.temp_vaults_remaining, 0);

console.log(`Release fixture journeys passed: cases=${CASES.length}/${CASES.length}, journeys=${JOURNEYS.length}/${JOURNEYS.length}, digest=${all.digest}.`);
