"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const ROOT = path.resolve(__dirname, "../../../../..");
const FIXTURE_ROOT = path.join(ROOT, "SYSTEM/CI/fixtures/consolidation");
const MANIFEST_PATH = path.join(FIXTURE_ROOT, "fixture-manifest.json");
const MANIFEST_VALIDATOR = path.join(ROOT, "SYSTEM/CI/validate-consolidation-fixtures.js");
const PLAN_AUDIT = path.join(ROOT, "SYSTEM/SCRIPTS/prodigy-consolidation-plan-audit.js");
const SECURITY_AUDIT = path.join(ROOT, "SYSTEM/SCRIPTS/prodigy-consolidation-security-audit.js");
const VISUAL_AUDIT = path.join(ROOT, "SYSTEM/SCRIPTS/prodigy-consolidation-visual-receipt.js");
const FINAL_AUDIT = path.join(ROOT, "SYSTEM/SCRIPTS/prodigy-consolidation-final-audit.js");
const RUN_ID = "00000000-0000-4000-8000-000000000001";
const EXPECTED_FIXTURES = [
  "approval-root/receipts/synthetic-not-applied.json",
  "baseline-v1.json",
  "frontend-design-state.md",
  "ownership-v1.json",
  "plan.md",
  "source-inventory-v1.json",
];

function sha256(file) {
  return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}

function run(script, args, cwd = ROOT) {
  return spawnSync(process.execPath, [script, ...args], { cwd, encoding: "utf8" });
}

function assertFailed(result, message) {
  assert.notEqual(result.status, 0, `${message}\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`);
}

function refreshManifest(fixtureRoot) {
  const manifestPath = path.join(fixtureRoot, "fixture-manifest.json");
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  for (const entry of manifest.fixtures) entry.sha256 = sha256(path.join(fixtureRoot, entry.path));
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
}

function auditArgs(fixtureRoot, outputRoot) {
  const common = [
    "--fixture-root", fixtureRoot,
    "--manifest", path.join(fixtureRoot, "fixture-manifest.json"),
    "--run-id", RUN_ID,
  ];
  return {
    f1: [...common, "--plan", path.join(fixtureRoot, "plan.md"), "--ownership", path.join(fixtureRoot, "ownership-v1.json"), "--baseline", path.join(fixtureRoot, "baseline-v1.json"), "--output", path.join(outputRoot, "final-F1/receipt.json")],
    f2: [...common, "--plan", path.join(fixtureRoot, "plan.md"), "--ownership", path.join(fixtureRoot, "ownership-v1.json"), "--baseline", path.join(fixtureRoot, "baseline-v1.json"), "--approval-root", path.join(fixtureRoot, "approval-root"), "--output", path.join(outputRoot, "final-F2/receipt.json")],
    f3: [...common, "--output", path.join(outputRoot, "final-F3/receipt.json")],
  };
}

function checkManifest() {
  const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, "utf8"));
  assert.equal(manifest.schema_version, 1);
  assert.deepEqual(manifest.fixtures.map((entry) => entry.path).sort(), EXPECTED_FIXTURES);
  for (const entry of manifest.fixtures) {
    assert.match(entry.sha256, /^[a-f0-9]{64}$/);
    assert.equal(sha256(path.join(FIXTURE_ROOT, entry.path)), entry.sha256, `SHA-256 drift: ${entry.path}`);
  }
  const validated = run(MANIFEST_VALIDATOR, ["--fixture-root", FIXTURE_ROOT, "--manifest", MANIFEST_PATH]);
  assert.equal(validated.status, 0, validated.stderr || validated.stdout);

  const forbidden = /(?:^|\/)(?:\.omo|SYSTEM\/CACHE|PARA)(?:\/|$)|\/Users\/|owner_token|\b20\d\d-\d\d-\d\dT/;
  for (const relativePath of EXPECTED_FIXTURES) {
    const repoRelative = path.relative(ROOT, path.join(FIXTURE_ROOT, relativePath));
    assert.ok(repoRelative.startsWith("SYSTEM/CI/"));
    const ignored = spawnSync("git", ["check-ignore", "-q", repoRelative], { cwd: ROOT, encoding: "utf8" });
    if (ignored.status === 128) {
      assert.equal(fs.existsSync(path.join(ROOT, ".git")), false, ignored.stderr);
      assert.ok(fs.existsSync(path.join(ROOT, repoRelative)), `${repoRelative} missing from metadata-free archive`);
    } else {
      assert.equal(ignored.status, 1, `${repoRelative} is ignored`);
    }
    assert.doesNotMatch(fs.readFileSync(path.join(FIXTURE_ROOT, relativePath), "utf8"), forbidden, `private/runtime data in ${relativePath}`);
  }
}

function checkHappyAudits() {
  const output = fs.mkdtempSync(path.join(os.tmpdir(), "consolidation-fixture-happy-"));
  try {
    const args = auditArgs(FIXTURE_ROOT, output);
    for (const [script, scriptArgs] of [[PLAN_AUDIT, args.f1], [SECURITY_AUDIT, args.f2], [VISUAL_AUDIT, args.f3]]) {
      const result = run(script, scriptArgs);
      assert.equal(result.status, 0, result.stderr || result.stdout);
    }
    const result = run(FINAL_AUDIT, ["--evidence-root", output, "--run-id", RUN_ID, "--output", path.join(output, "final-F4/receipt.json")]);
    assert.equal(result.status, 0, result.stderr || result.stdout);
  } finally {
    fs.rmSync(output, { recursive: true, force: true });
  }
}

function checkFailClosedInputs() {
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), "consolidation-fixture-fail-"));
  const fixtureRoot = path.join(parent, "fixtures");
  fs.cpSync(FIXTURE_ROOT, fixtureRoot, { recursive: true });
  try {
    const ownershipPath = path.join(fixtureRoot, "ownership-v1.json");
    fs.writeFileSync(ownershipPath, "{malformed\n");
    refreshManifest(fixtureRoot);
    assertFailed(run(PLAN_AUDIT, auditArgs(fixtureRoot, path.join(parent, "receipts")).f1), "F1 accepted malformed ownership");

    fs.copyFileSync(path.join(FIXTURE_ROOT, "ownership-v1.json"), ownershipPath);
    fs.writeFileSync(path.join(fixtureRoot, "baseline-v1.json"), "{}\n");
    refreshManifest(fixtureRoot);
    assertFailed(run(SECURITY_AUDIT, auditArgs(fixtureRoot, path.join(parent, "receipts")).f2), "F2 accepted malformed baseline shape");

    fs.copyFileSync(path.join(FIXTURE_ROOT, "baseline-v1.json"), path.join(fixtureRoot, "baseline-v1.json"));
    fs.writeFileSync(path.join(fixtureRoot, "approval-root/receipts/synthetic-not-applied.json"), "{malformed\n");
    refreshManifest(fixtureRoot);
    assertFailed(run(SECURITY_AUDIT, auditArgs(fixtureRoot, path.join(parent, "receipts")).f2), "F2 accepted malformed approval receipt");

    const evidence = path.join(parent, "stale-receipts");
    fs.mkdirSync(path.join(evidence, "final-F1"), { recursive: true });
    fs.writeFileSync(path.join(evidence, "final-F1/receipt.json"), JSON.stringify({ ok: true }) + "\n");
    assertFailed(run(FINAL_AUDIT, ["--evidence-root", evidence, "--run-id", RUN_ID]), "F4 accepted incomplete receipts");
  } finally {
    fs.rmSync(parent, { recursive: true, force: true });
  }
}

checkManifest();
checkHappyAudits();
checkFailClosedInputs();
console.log("Consolidation release fixtures passed: exact manifest, current-run hashes, and fail-closed audits locked.");
