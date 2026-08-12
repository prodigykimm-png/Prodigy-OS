"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const ROOT = path.resolve(__dirname, "../../../../..");
const FIXTURE_SOURCE = path.join(ROOT, "SYSTEM/CI/fixtures/consolidation");
const VALIDATOR = path.join(ROOT, "SYSTEM/CI/validate-consolidation-fixtures.js");
const F1 = path.join(ROOT, "SYSTEM/SCRIPTS/prodigy-consolidation-plan-audit.js");
const F2 = path.join(ROOT, "SYSTEM/SCRIPTS/prodigy-consolidation-security-audit.js");
const F3 = path.join(ROOT, "SYSTEM/SCRIPTS/prodigy-consolidation-visual-receipt.js");
const F4 = path.join(ROOT, "SYSTEM/SCRIPTS/prodigy-consolidation-final-audit.js");
const RUN_ID = "00000000-0000-4000-8000-000000000042";

function sha256(file) {
  return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}

function run(script, args, cwd = ROOT, timeout = 10000) {
  return spawnSync(process.execPath, [script, ...args], { cwd, encoding: "utf8", timeout });
}

function runGit(args, cwd) {
  const result = spawnSync("git", args, { cwd, encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
}

function assertFailsWith(result, pattern, label) {
  assert.notEqual(result.status, 0, `${label} unexpectedly passed`);
  assert.match(`${result.stdout}\n${result.stderr}`, pattern, `${label} did not return a stable diagnostic`);
}

function copyFixtureRoot(parent) {
  const root = path.join(parent, "SYSTEM/CI/fixtures/consolidation");
  fs.mkdirSync(path.dirname(root), { recursive: true });
  fs.cpSync(FIXTURE_SOURCE, root, { recursive: true, dereference: false });
  return root;
}

function refreshManifest(fixtureRoot) {
  const manifestPath = path.join(fixtureRoot, "fixture-manifest.json");
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  for (const entry of manifest.fixtures) entry.sha256 = sha256(path.join(fixtureRoot, entry.path));
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
}

function addTrustedSource(fixtureRoot, repoRoot, relativePath) {
  const inventoryPath = path.join(fixtureRoot, "source-inventory-v1.json");
  const inventory = JSON.parse(fs.readFileSync(inventoryPath, "utf8"));
  inventory.sources.push({ path: relativePath, type: "regular-file", sha256: sha256(path.join(repoRoot, relativePath)) });
  fs.writeFileSync(inventoryPath, JSON.stringify(inventory, null, 2) + "\n");
  refreshManifest(fixtureRoot);
}

function refreshTrustedSource(fixtureRoot, repoRoot, relativePath) {
  const inventoryPath = path.join(fixtureRoot, "source-inventory-v1.json");
  const inventory = JSON.parse(fs.readFileSync(inventoryPath, "utf8"));
  inventory.sources.find((entry) => entry.path === relativePath).sha256 = sha256(path.join(repoRoot, relativePath));
  fs.writeFileSync(inventoryPath, JSON.stringify(inventory, null, 2) + "\n");
  refreshManifest(fixtureRoot);
}

function createRepoSandbox() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "consolidation-adversarial-repo-"));
  const fixtureRoot = copyFixtureRoot(root);
  const ownership = JSON.parse(fs.readFileSync(path.join(fixtureRoot, "ownership-v1.json"), "utf8"));
  for (const relativePath of new Set(Object.values(ownership.todos).flat().concat(Object.values(ownership.finals).flat()))) {
    const source = path.join(ROOT, relativePath);
    const destination = path.join(root, relativePath);
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.copyFileSync(source, destination);
  }
  for (const scanRoot of ["SYSTEM/SCRIPTS", "SYSTEM/Views"]) {
    fs.cpSync(path.join(ROOT, scanRoot), path.join(root, scanRoot), { recursive: true, force: true });
  }
  runGit(["init", "-q"], root);
  runGit(["add", "-A"], root);
  return { root, fixtureRoot };
}

function auditArgs(fixtureRoot, outputRoot) {
  return {
    f1: [
      "--fixture-root", fixtureRoot,
      "--manifest", path.join(fixtureRoot, "fixture-manifest.json"),
      "--plan", path.join(fixtureRoot, "plan.md"),
      "--ownership", path.join(fixtureRoot, "ownership-v1.json"),
      "--baseline", path.join(fixtureRoot, "baseline-v1.json"),
      "--run-id", RUN_ID,
      "--output", path.join(outputRoot, "final-F1/receipt.json"),
    ],
    f2: [
      "--fixture-root", fixtureRoot,
      "--manifest", path.join(fixtureRoot, "fixture-manifest.json"),
      "--plan", path.join(fixtureRoot, "plan.md"),
      "--ownership", path.join(fixtureRoot, "ownership-v1.json"),
      "--baseline", path.join(fixtureRoot, "baseline-v1.json"),
      "--approval-root", path.join(fixtureRoot, "approval-root"),
      "--run-id", RUN_ID,
      "--output", path.join(outputRoot, "final-F2/receipt.json"),
    ],
    f3: [
      "--fixture-root", fixtureRoot,
      "--manifest", path.join(fixtureRoot, "fixture-manifest.json"),
      "--run-id", RUN_ID,
      "--output", path.join(outputRoot, "final-F3/receipt.json"),
    ],
  };
}

function checkManifestFilesystemBypasses() {
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), "consolidation-manifest-attacks-"));
  try {
    let fixtureRoot = copyFixtureRoot(path.join(parent, "extra"));
    fs.writeFileSync(path.join(fixtureRoot, "unlisted.txt"), "bypass\n");
    assertFailsWith(run(VALIDATOR, ["--fixture-root", fixtureRoot, "--manifest", path.join(fixtureRoot, "fixture-manifest.json")]), /fixture inventory mismatch/, "unlisted fixture file");

    fixtureRoot = copyFixtureRoot(path.join(parent, "missing"));
    fs.rmSync(path.join(fixtureRoot, "frontend-design-state.md"));
    assertFailsWith(run(VALIDATOR, ["--fixture-root", fixtureRoot, "--manifest", path.join(fixtureRoot, "fixture-manifest.json")]), /fixture entry missing/, "missing listed fixture file");

    fixtureRoot = copyFixtureRoot(path.join(parent, "symlink"));
    const plan = path.join(fixtureRoot, "plan.md");
    const outsidePlan = path.join(parent, "outside-plan.md");
    fs.copyFileSync(plan, outsidePlan);
    fs.rmSync(plan);
    fs.symlinkSync(outsidePlan, plan);
    assertFailsWith(run(VALIDATOR, ["--fixture-root", fixtureRoot, "--manifest", path.join(fixtureRoot, "fixture-manifest.json")]), /fixture entry is not a regular file/, "listed symlink fixture");

    fixtureRoot = copyFixtureRoot(path.join(parent, "escape"));
    const approvalRoot = path.join(fixtureRoot, "approval-root");
    const outsideApproval = path.join(parent, "outside-approval");
    fs.renameSync(approvalRoot, outsideApproval);
    fs.symlinkSync(outsideApproval, approvalRoot);
    assertFailsWith(run(VALIDATOR, ["--fixture-root", fixtureRoot, "--manifest", path.join(fixtureRoot, "fixture-manifest.json")]), /fixture directory is not a real directory|fixture entry is not a regular file|fixture entry realpath escapes root/, "realpath escape fixture directory");

    fixtureRoot = copyFixtureRoot(path.join(parent, "fifo"));
    const state = path.join(fixtureRoot, "frontend-design-state.md");
    fs.rmSync(state);
    assert.equal(spawnSync("mkfifo", [state]).status, 0);
    assertFailsWith(run(VALIDATOR, ["--fixture-root", fixtureRoot, "--manifest", path.join(fixtureRoot, "fixture-manifest.json")], ROOT, 2000), /fixture entry is not a regular file/, "listed FIFO fixture");
  } finally {
    fs.rmSync(parent, { recursive: true, force: true });
  }
}

function checkOwnershipBypasses() {
  const sandbox = createRepoSandbox();
  try {
    const ownershipPath = path.join(sandbox.fixtureRoot, "ownership-v1.json");
    const output = path.join(sandbox.root, "receipts");
    for (const attack of [
      { path: "SYSTEM/SCRIPTS/../SCRIPTS/prodigy-consolidation-baseline.js", error: /ownership path is not normalized/ },
      { path: "<task-temp>/absolute-owned.js", error: /ownership path is not repository-relative/ },
      { path: "README.md", error: /ownership path is outside fixture-owned source roots/ },
      { path: "SYSTEM/SCRIPTS/untracked-owned.js", error: /trusted source inventory path is not tracked/ },
      { path: "SYSTEM/SCRIPTS/missing-owned.js", error: /ownership path missing/ },
    ]) {
      fs.copyFileSync(path.join(FIXTURE_SOURCE, "source-inventory-v1.json"), path.join(sandbox.fixtureRoot, "source-inventory-v1.json"));
      fs.copyFileSync(path.join(FIXTURE_SOURCE, "fixture-manifest.json"), path.join(sandbox.fixtureRoot, "fixture-manifest.json"));
      const ownership = JSON.parse(fs.readFileSync(path.join(FIXTURE_SOURCE, "ownership-v1.json"), "utf8"));
      ownership.todos["0"].push(attack.path);
      fs.writeFileSync(ownershipPath, JSON.stringify(ownership, null, 2) + "\n");
      if (attack.path === "SYSTEM/SCRIPTS/untracked-owned.js") {
        fs.writeFileSync(path.join(sandbox.root, attack.path), "module.exports = {};\n");
        addTrustedSource(sandbox.fixtureRoot, sandbox.root, attack.path);
      } else {
        refreshManifest(sandbox.fixtureRoot);
      }
      const args = auditArgs(sandbox.fixtureRoot, output).f1;
      assertFailsWith(run(F1, args, sandbox.root), attack.error, `ownership path ${attack.path}`);
    }

    const ownership = JSON.parse(fs.readFileSync(path.join(FIXTURE_SOURCE, "ownership-v1.json"), "utf8"));
    const symlinkPath = "SYSTEM/SCRIPTS/tracked-owned-link.js";
    ownership.todos["0"].push(symlinkPath);
    fs.writeFileSync(ownershipPath, JSON.stringify(ownership, null, 2) + "\n");
    fs.symlinkSync(path.join(sandbox.root, "SYSTEM/SCRIPTS/prodigy-consolidation-baseline.js"), path.join(sandbox.root, symlinkPath));
    runGit(["add", symlinkPath], sandbox.root);
    addTrustedSource(sandbox.fixtureRoot, sandbox.root, symlinkPath);
    assertFailsWith(run(F1, auditArgs(sandbox.fixtureRoot, output).f1, sandbox.root), /trusted source inventory path is not a regular file/, "tracked ownership symlink");
  } finally {
    fs.rmSync(sandbox.root, { recursive: true, force: true });
  }
}

function checkTrustedSourceInventoryBypasses() {
  const attacks = [
    {
      label: "missing trusted source",
      mutate(inventory) { inventory.sources.shift(); },
      error: /ownership path missing from trusted source inventory|trusted source inventory has missing or extra paths/,
    },
    {
      label: "duplicate trusted source",
      mutate(inventory) { inventory.sources.push({ ...inventory.sources[0] }); },
      error: /trusted source inventory path duplicated/,
    },
    {
      label: "absolute trusted source",
      mutate(inventory) { inventory.sources[0].path = "<task-temp>/absolute-source.js"; },
      error: /trusted source inventory path is not repository-relative/,
    },
    {
      label: "traversal trusted source",
      mutate(inventory) { inventory.sources[0].path = "SYSTEM/SCRIPTS/../SCRIPTS/source.js"; },
      error: /trusted source inventory path is not normalized/,
    },
  ];
  for (const attack of attacks) {
    const sandbox = createRepoSandbox();
    try {
      const inventoryPath = path.join(sandbox.fixtureRoot, "source-inventory-v1.json");
      const inventory = JSON.parse(fs.readFileSync(inventoryPath, "utf8"));
      attack.mutate(inventory);
      fs.writeFileSync(inventoryPath, JSON.stringify(inventory, null, 2) + "\n");
      refreshManifest(sandbox.fixtureRoot);
      assertFailsWith(run(F1, auditArgs(sandbox.fixtureRoot, path.join(sandbox.root, "receipts")).f1, sandbox.root), attack.error, attack.label);
    } finally {
      fs.rmSync(sandbox.root, { recursive: true, force: true });
    }
  }

  const extra = createRepoSandbox();
  try {
    addTrustedSource(extra.fixtureRoot, extra.root, "SYSTEM/SCRIPTS/prodigy-contract-audit.js");
    assertFailsWith(run(F1, auditArgs(extra.fixtureRoot, path.join(extra.root, "receipts")).f1, extra.root), /trusted source inventory has missing or extra paths/, "extra trusted source");
  } finally {
    fs.rmSync(extra.root, { recursive: true, force: true });
  }

  const drift = createRepoSandbox();
  try {
    const sourcePath = path.join(drift.root, "SYSTEM/SCRIPTS/region-run-state-core.js");
    fs.appendFileSync(sourcePath, "// tampered\n");
    assertFailsWith(run(F1, auditArgs(drift.fixtureRoot, path.join(drift.root, "receipts")).f1, drift.root), /trusted source inventory SHA-256 mismatch/, "trusted source byte drift");
  } finally {
    fs.rmSync(drift.root, { recursive: true, force: true });
  }

  const nonRegular = createRepoSandbox();
  try {
    const sourcePath = path.join(nonRegular.root, "SYSTEM/SCRIPTS/region-run-state-core.js");
    fs.rmSync(sourcePath);
    assert.equal(spawnSync("mkfifo", [sourcePath]).status, 0);
    assertFailsWith(run(F1, auditArgs(nonRegular.fixtureRoot, path.join(nonRegular.root, "receipts")).f1, nonRegular.root, 2000), /trusted source inventory path is not a regular file/, "trusted source FIFO");
  } finally {
    fs.rmSync(nonRegular.root, { recursive: true, force: true });
  }
}

function checkF2Bypasses() {
  for (const missingRoot of ["SYSTEM/SCRIPTS", "SYSTEM/Views"]) {
    const sandbox = createRepoSandbox();
    try {
      const output = path.join(sandbox.root, "receipts");
      fs.rmSync(path.join(sandbox.root, missingRoot), { recursive: true, force: true });
      assertFailsWith(run(F2, auditArgs(sandbox.fixtureRoot, output).f2, sandbox.root), new RegExp(`required scan root missing: ${missingRoot}`), `missing security scan root ${missingRoot}`);
    } finally {
      fs.rmSync(sandbox.root, { recursive: true, force: true });
    }
  }

  const invalidOwnership = createRepoSandbox();
  try {
    const ownershipPath = path.join(invalidOwnership.fixtureRoot, "ownership-v1.json");
    const ownership = JSON.parse(fs.readFileSync(ownershipPath, "utf8"));
    ownership.todos["0"].push("SYSTEM/SCRIPTS/untracked-f2-owned.js");
    fs.writeFileSync(ownershipPath, JSON.stringify(ownership, null, 2) + "\n");
    fs.writeFileSync(path.join(invalidOwnership.root, "SYSTEM/SCRIPTS/untracked-f2-owned.js"), "module.exports = {};\n");
    addTrustedSource(invalidOwnership.fixtureRoot, invalidOwnership.root, "SYSTEM/SCRIPTS/untracked-f2-owned.js");
    assertFailsWith(run(F2, auditArgs(invalidOwnership.fixtureRoot, path.join(invalidOwnership.root, "receipts")).f2, invalidOwnership.root), /trusted source inventory path is not tracked/, "F2 ownership bypass");
  } finally {
    fs.rmSync(invalidOwnership.root, { recursive: true, force: true });
  }

  const tampered = createRepoSandbox();
  try {
    const claimPath = path.join(tampered.root, "SYSTEM/SCRIPTS/region-approval-claim-core.js");
    fs.writeFileSync(claimPath, fs.readFileSync(claimPath, "utf8").replaceAll("fs.fsyncSync", "fs.notDurableSync"));
    refreshTrustedSource(tampered.fixtureRoot, tampered.root, "SYSTEM/SCRIPTS/region-approval-claim-core.js");
    assertFailsWith(run(F2, auditArgs(tampered.fixtureRoot, path.join(tampered.root, "receipts")).f2, tampered.root), /approval durability check failed/, "hard-coded approval success fields");
  } finally {
    fs.rmSync(tampered.root, { recursive: true, force: true });
  }

  const lineageTampered = createRepoSandbox();
  try {
    const identityPath = path.join(lineageTampered.root, "SYSTEM/SCRIPTS/region-target-identity-core.js");
    fs.writeFileSync(identityPath, fs.readFileSync(identityPath, "utf8").replaceAll('.normalize("NFC")', '.normalize("NFD")'));
    refreshTrustedSource(lineageTampered.fixtureRoot, lineageTampered.root, "SYSTEM/SCRIPTS/region-target-identity-core.js");
    assertFailsWith(run(F2, auditArgs(lineageTampered.fixtureRoot, path.join(lineageTampered.root, "receipts")).f2, lineageTampered.root), /lineage source check failed/, "hard-coded lineage success fields");
  } finally {
    fs.rmSync(lineageTampered.root, { recursive: true, force: true });
  }
}

function checkRunBindingBypasses() {
  const sandbox = createRepoSandbox();
  try {
    const output = path.join(sandbox.root, "receipts");
    const args = auditArgs(sandbox.fixtureRoot, output);
    for (const [script, scriptArgs] of [[F1, args.f1], [F2, args.f2], [F3, args.f3]]) {
      const result = run(script, scriptArgs, sandbox.root);
      assert.equal(result.status, 0, result.stderr || result.stdout);
    }
    let result = run(F4, ["--evidence-root", output, "--run-id", RUN_ID, "--output", path.join(output, "final-F4/receipt.json")], sandbox.root);
    assert.equal(result.status, 0, result.stderr || result.stdout);

    const f3Path = path.join(output, "final-F3/receipt.json");
    const f3 = JSON.parse(fs.readFileSync(f3Path, "utf8"));
    assert.equal("source_inventory_sha256" in f3.input_hashes, true, "F3 did not bind the trusted source inventory");
    const sourceInventoryHash = f3.input_hashes.source_inventory_sha256;
    delete f3.input_hashes.source_inventory_sha256;
    fs.writeFileSync(f3Path, JSON.stringify(f3, null, 2) + "\n");
    assertFailsWith(run(F4, ["--evidence-root", output, "--run-id", RUN_ID], sandbox.root), /F3 source inventory hash missing or malformed/, "missing F3 source-inventory hash");

    f3.input_hashes.source_inventory_sha256 = "a".repeat(64);
    fs.writeFileSync(f3Path, JSON.stringify(f3, null, 2) + "\n");
    assertFailsWith(run(F4, ["--evidence-root", output, "--run-id", RUN_ID], sandbox.root), /cross-receipt input hash mismatch: source_inventory_sha256/, "conflicting F3 source-inventory hash");

    f3.input_hashes.source_inventory_sha256 = sourceInventoryHash;
    f3.run_id = "00000000-0000-4000-8000-000000000099";
    fs.writeFileSync(f3Path, JSON.stringify(f3, null, 2) + "\n");
    assertFailsWith(run(F4, ["--evidence-root", output, "--run-id", RUN_ID], sandbox.root), /receipt run ID mismatch/, "cross-run receipt substitution");

    f3.run_id = RUN_ID;
    const manifestHash = f3.input_hashes.fixture_manifest_sha256;
    f3.input_hashes.fixture_manifest_sha256 = "a".repeat(64);
    fs.writeFileSync(f3Path, JSON.stringify(f3, null, 2) + "\n");
    assertFailsWith(run(F4, ["--evidence-root", output, "--run-id", RUN_ID], sandbox.root), /cross-receipt input hash mismatch/, "cross-input receipt substitution");

    f3.input_hashes.fixture_manifest_sha256 = manifestHash;
    f3.generated_at = "2000-01-01T00:00:00.000Z";
    fs.writeFileSync(f3Path, JSON.stringify(f3, null, 2) + "\n");
    assertFailsWith(run(F4, ["--evidence-root", output, "--run-id", RUN_ID], sandbox.root), /receipt timestamp is stale/, "year-2000 receipt substitution");
  } finally {
    fs.rmSync(sandbox.root, { recursive: true, force: true });
  }
}

checkManifestFilesystemBypasses();
checkOwnershipBypasses();
checkTrustedSourceInventoryBypasses();
checkF2Bypasses();
checkRunBindingBypasses();
console.log("Consolidation adversarial tests passed: filesystem, ownership, scan-root, actual-check, and stale-receipt bypasses rejected.");
