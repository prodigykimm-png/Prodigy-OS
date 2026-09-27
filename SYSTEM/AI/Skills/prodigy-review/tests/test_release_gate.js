"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const { spawnSync } = require("node:child_process");

const ROOT = path.resolve(__dirname, "../../../../..");
const projection = require(path.join(ROOT, "SYSTEM/CI/release-projection-authority.js"));
const RUNNER_RELATIVE = "SYSTEM/CI/run-release-gate.sh";
const RUNNER = path.join(ROOT, RUNNER_RELATIVE);
const MANIFEST_RELATIVE = projection.MANIFEST_RELATIVE;
const DERIVED_RECEIPT_RELATIVE = "SYSTEM/AI/Reports/task16-final-release-receipt.json";
const BASELINE = projection.BASELINE;
const DERIVED_EVIDENCE_EXCLUSIONS = projection.DERIVED_EVIDENCE_EXCLUSIONS;
const WORKFLOWS = [
  ".github/workflows/prodigy-full-tests.yml",
  ".github/workflows/prodigy-stability-smoke.yml"
];
const DOCS = ["README.md", "SYSTEM/docs/07_Implementation_Guide.md"];
const CANONICAL_COMMAND = `bash ${RUNNER_RELATIVE}`;
const REQUIRED_PROJECTED_DELIVERABLES = Object.freeze([
  RUNNER_RELATIVE,
  MANIFEST_RELATIVE,
  "SYSTEM/CI/recovery-proof-harness.js",
  "SYSTEM/CI/repository-data-backup.js",
  "SYSTEM/CI/task16-scrub-retained-artifacts.js",
  "SYSTEM/Views/region-experience-modal.js",
  "SYSTEM/AI/Skills/prodigy-review/tests/auction/test_region_experience_modal.js",
  "SYSTEM/AI/Skills/prodigy-review/tests/test_task15_recovery_proof.js",
  "SYSTEM/AI/Skills/prodigy-review/tests/test_release_gate.js",
  "SYSTEM/AI/Skills/prodigy-review/tests/test_consolidation_literal_git_archive.js",
  "SYSTEM/AI/Skills/prodigy-review/tests/people/fixtures/quickadd-people-v1.json"
]);

function read(relativePath) {
  const absolutePath = path.join(ROOT, relativePath);
  assert.ok(fs.existsSync(absolutePath), `Missing required file: ${relativePath}`);
  return fs.readFileSync(absolutePath, "utf8");
}

function assertManifestContainsRequiredDeliverables(projectedSet) {
  for (const relativePath of REQUIRED_PROJECTED_DELIVERABLES) {
    assert.ok(
      projectedSet.has(relativePath),
      `Delivery manifest missing required projected deliverable: ${relativePath}`
    );
  }
}

function gitReportedDeliveryPaths(root, deliveryBase, deliveryRef) {
  const resolve = (ref, code) => {
    const result = spawnSync("git", ["rev-parse", "--verify", "--quiet", `${ref}^{commit}`], { cwd: root, encoding: "utf8" });
    if (result.status !== 0) throw new Error(`${code}: cannot resolve ${ref}`);
    return result.stdout.trim();
  };
  const base = resolve(deliveryBase, "DELIVERY_BASE_UNRESOLVED");
  let ref = deliveryRef;
  if (!ref) {
    const symbolic = spawnSync("git", ["symbolic-ref", "--quiet", "--short", "HEAD"], { cwd: root, encoding: "utf8" });
    if (symbolic.status !== 0) throw new Error("DELIVERY_REF_DETACHED: explicit delivery ref is required");
    ref = symbolic.stdout.trim();
  }
  const delivery = resolve(ref, "DELIVERY_REF_UNRESOLVED");
  const result = spawnSync("git", ["diff", "--name-only", "-z", `${base}..${delivery}`], { cwd: root, encoding: "buffer" });
  assert.equal(result.status, 0, result.stderr.toString());
  const paths = result.stdout.toString("utf8").split("\0").filter(Boolean).sort();
  if (paths.length === 0) throw new Error(`DELIVERY_SCOPE_EMPTY: ${base}..${delivery}`);
  return paths;
}

function assertManifestMatchesGitDelivery(projectedSet, root, deliveryBase, deliveryRef) {
  const deliveredPaths = gitReportedDeliveryPaths(root, deliveryBase, deliveryRef);
  for (const relativePath of deliveredPaths) {
    assert.ok(
      projectedSet.has(relativePath),
      `Delivery manifest missing Git-delivered path: ${relativePath}`
    );
  }
  for (const relativePath of projectedSet) {
    assert.ok(fs.existsSync(path.join(root, relativePath)), `Delivery manifest invents nonexistent path: ${relativePath}`);
    assert.ok(deliveredPaths.includes(relativePath), `Delivery manifest invents non-delivery path: ${relativePath}`);
  }
}

function fixtureGit(root, args) {
  const result = spawnSync("git", args, { cwd: root, encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
}

function checkGitOwnedDeliveryFixture() {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "release-gate-git-scope-"));
  try {
    fixtureGit(temp, ["init", "--quiet"]);
    fixtureGit(temp, ["config", "user.email", "release-fixture@example.test"]);
    fixtureGit(temp, ["config", "user.name", "Release Fixture"]);
    fs.mkdirSync(path.join(temp, "SYSTEM/CI"), { recursive: true });
    fs.writeFileSync(path.join(temp, "SYSTEM/CI/release-gate-manifest.json"), "{}\n");
    fixtureGit(temp, ["add", "."]);
    fixtureGit(temp, ["commit", "--quiet", "-m", "fixture baseline"]);
    const baseline = fixtureGit(temp, ["rev-parse", "HEAD"]);
    const trackedDeliveredPath = "SYSTEM/CI/tracked-delivery.js";
    const untrackedResiduePath = ".llmwiki-audit/untracked-residue.json";
    fs.writeFileSync(path.join(temp, trackedDeliveredPath), "\"use strict\";\n");
    fixtureGit(temp, ["add", trackedDeliveredPath]);
    fixtureGit(temp, ["commit", "--quiet", "-m", "tracked delivery"]);
    const deliveryRef = fixtureGit(temp, ["symbolic-ref", "--short", "HEAD"]);
    fs.mkdirSync(path.join(temp, ".llmwiki-audit"), { recursive: true });
    fs.writeFileSync(path.join(temp, untrackedResiduePath), "{}\n");
    const gitScope = gitReportedDeliveryPaths(temp, baseline, deliveryRef);
    assert.deepEqual(
      gitScope,
      [trackedDeliveredPath],
      "Git delivery scope must exclude ordinary untracked residue"
    );
    assert.deepEqual(projection.deriveGitDeliveryPaths(temp, baseline, deliveryRef), gitScope, "authority must relay Git's exact delivery record");
    assert.doesNotThrow(() => assertManifestMatchesGitDelivery(new Set([trackedDeliveredPath]), temp, baseline, deliveryRef));
    assert.throws(
      () => assertManifestMatchesGitDelivery(new Set(), temp, baseline, deliveryRef),
      new RegExp(trackedDeliveredPath)
    );
    const originalProjectedPaths = projection.deriveProjectedPaths;
    projection.deriveProjectedPaths = () => [];
    try {
      assert.throws(
        () => assertManifestMatchesGitDelivery(new Set(), temp, baseline, deliveryRef),
        new RegExp(trackedDeliveredPath),
        "authority exclusions must not change Git-owned delivery accounting"
      );
    } finally {
      projection.deriveProjectedPaths = originalProjectedPaths;
    }
    assert.throws(
      () => assertManifestMatchesGitDelivery(new Set([trackedDeliveredPath, "SYSTEM/CI/invented-delivery.js"]), temp, baseline, deliveryRef),
      /Delivery manifest invents nonexistent path/u
    );
    assert.throws(() => gitReportedDeliveryPaths(temp, "missing-base", deliveryRef), /DELIVERY_BASE_UNRESOLVED/u);
    assert.throws(() => gitReportedDeliveryPaths(temp, baseline, baseline), /DELIVERY_SCOPE_EMPTY/u);
    fixtureGit(temp, ["checkout", "--quiet", "--detach", deliveryRef]);
    assert.throws(() => projection.deriveGitDeliveryPaths(temp, baseline), /DELIVERY_REF_DETACHED/u);
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
}

function checkLegacyFreezeUniverseCompatibility() {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "release-gate-legacy-freeze-"));
  try {
    fixtureGit(temp, ["init", "--quiet"]);
    fixtureGit(temp, ["config", "user.email", "legacy-freeze@example.test"]);
    fixtureGit(temp, ["config", "user.name", "Legacy Freeze Fixture"]);
    fs.mkdirSync(path.join(temp, "SYSTEM/CI"), { recursive: true });
    fs.mkdirSync(path.join(temp, "SYSTEM/Views"), { recursive: true });
    fs.mkdirSync(path.join(temp, "SYSTEM/AI/Skills/prodigy-review/tests"), { recursive: true });
    fs.writeFileSync(path.join(temp, MANIFEST_RELATIVE), "{}\n");
    fs.writeFileSync(path.join(temp, "SYSTEM/Views/legacy-view.js"), "\"use strict\";\n");
    fs.writeFileSync(path.join(temp, "SYSTEM/AI/Skills/prodigy-review/tests/test_legacy_freeze.js"), "\"use strict\";\n");
    fixtureGit(temp, ["add", "."]);
    fixtureGit(temp, ["commit", "--quiet", "-m", "legacy freeze baseline"]);
    const baseline = fixtureGit(temp, ["rev-parse", "HEAD"]);
    const projectedPath = "SYSTEM/CI/legacy-projected-path.js";
    fs.writeFileSync(path.join(temp, projectedPath), "\"use strict\";\n");
    const expectedPaths = projection.deriveProjectedPaths(temp, baseline);
    const first = projection.freezeUniverse(temp, baseline);
    const second = projection.freezeUniverse(temp, baseline);
    assert.equal(projection.freezeUniverse.length, 1, "freezeUniverse must retain its one-argument public signature");
    assert.deepEqual(first.projectedPaths, expectedPaths, "freezeUniverse(root) must preserve projected-worktree behavior");
    projection.assertFrozenUniverse(first, second);
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
}

function checkReleaseManifestContract() {
  const manifest = JSON.parse(read(MANIFEST_RELATIVE));
  assert.deepEqual(Object.keys(manifest).sort(), ["delivery", "discovery", "fixed_commands", "recorded_at", "schema_version", "toolchain", "total_commands"]);
  assert.equal(manifest.schema_version, 1);
  assert.deepEqual(Object.keys(manifest.delivery).sort(), ["derived_delivery_evidence_exclusions", "head_inclusion", "mode", "non_delivery_exclusions", "projected_path_manifest_sha256", "projected_paths"]);
  assert.equal(manifest.delivery.mode, "projected_worktree");
  assert.equal(manifest.delivery.head_inclusion, "deferred_to_authorized_final_merge");
  assert.deepEqual(manifest.delivery.non_delivery_exclusions, [".git", ".omo", ".gjc", ".codex", "DAILY", "PARA", "ZETA", "SYSTEM/PRIVATE", "SYSTEM/CACHE", "**/__pycache__", "**/*.pyc", "SYSTEM/docs/Prodigy_Knowledge_Inbox_Execution_Scope_v1.json", "SYSTEM/docs/Prodigy_Knowledge_Inbox_Proposal_v1.md"]);
  assert.deepEqual(manifest.delivery.derived_delivery_evidence_exclusions, DERIVED_EVIDENCE_EXCLUSIONS);
  assert.match(manifest.delivery.projected_path_manifest_sha256, /^[a-f0-9]{64}$/u);
  assert.ok(manifest.delivery.projected_paths.length > 0);
  assert.deepEqual(manifest.delivery.projected_paths.map((entry) => entry.path), manifest.delivery.projected_paths.map((entry) => entry.path).slice().sort());
  assert.equal(new Set(manifest.delivery.projected_paths.map((entry) => entry.path)).size, manifest.delivery.projected_paths.length);
  for (const entry of manifest.delivery.projected_paths) {
    assert.deepEqual(Object.keys(entry).sort(), ["hash_mode", "path", "sha256"]);
    assert.match(entry.sha256, /^[a-f0-9]{64}$/u);
    assert.ok(["raw", "canonical_self"].includes(entry.hash_mode));
  }
  const projectedSet = new Set(manifest.delivery.projected_paths.map((entry) => entry.path));
  assertManifestContainsRequiredDeliverables(projectedSet);
  const gitProbe = spawnSync("git", ["rev-parse", "--show-toplevel"], { cwd: ROOT, encoding: "utf8" });
  if (gitProbe.status === 0 && path.resolve(gitProbe.stdout.trim()) === ROOT) {
    const modified = spawnSync("git", ["diff", "--name-only", "-z", BASELINE, "--"], { cwd: ROOT, encoding: "buffer" });
    const untracked = spawnSync("git", ["ls-files", "--others", "--exclude-standard", "-z"], { cwd: ROOT, encoding: "buffer" });
    assert.equal(modified.status, 0, modified.stderr.toString());
    assert.equal(untracked.status, 0, untracked.stderr.toString());
    const changed = [...new Set(Buffer.concat([modified.stdout, untracked.stdout]).toString("utf8").split("\0").filter(Boolean))].sort();
    assert.equal(changed.includes(DERIVED_RECEIPT_RELATIVE), true, "derived receipt must exist as repository-owned delivery evidence");
    const actual = projection.deriveProjectedPaths(ROOT);
    assert.equal(projectedSet.has(DERIVED_RECEIPT_RELATIVE), false, "derived receipt must not enter the raw product projection");
    assert.equal(actual.some((relativePath) => DERIVED_EVIDENCE_EXCLUSIONS.some((identity) => projection.matchesEvidenceIdentity(relativePath, identity))), false, "predeclared evidence roots must stay outside the raw projection");
  }
  assert.equal(manifest.toolchain.node_required_major, 24);
  assert.match(manifest.toolchain.node_recorded, /^v24\.\d+\.\d+$/);
  assert.match(manifest.toolchain.uv_recorded, /^\d+\.\d+\.\d+$/);
  assert.match(manifest.toolchain.python_local_recorded, /^\d+\.\d+\.\d+$/);
  assert.equal(manifest.toolchain.python_ci, "3.12");
  assert.equal(manifest.toolchain.setup_uv_action, "astral-sh/setup-uv@v5");

  assert.deepEqual(
    Object.keys(manifest.discovery).sort(),
    ["javascript_suite_files", "python_suite_files", "view_syntax_files"],
    "Frozen release discovery must retain its complete schema"
  );
  for (const [name, count] of Object.entries(manifest.discovery)) {
    assert.ok(Number.isSafeInteger(count) && count > 0, `Frozen release discovery count must be positive: ${name}`);
  }
  const fixedCount = Object.values(manifest.fixed_commands).reduce((sum, value) => sum + value, 0);
  assert.equal(manifest.total_commands, fixedCount + Object.values(manifest.discovery).reduce((sum, value) => sum + value, 0));
}

function checkRunnerContract() {
  const source = read(RUNNER_RELATIVE);
  for (const required of [
    "SYSTEM/Views/*.js",
    "test_*.js",
    "test_*.py",
    "audit_property_contract.py",
    "run_stability_smoke_tests.js",
    "release-fixture-harness.js --all",
    "recovery-proof-harness.js --all",
    "repository-data-backup.js drill",
    "validate-consolidation-fixtures.js",
    "prodigy-consolidation-plan-audit.js",
    "prodigy-consolidation-security-audit.js",
    "prodigy-consolidation-visual-receipt.js",
    "prodigy-consolidation-final-audit.js"
  ]) {
    assert.ok(source.includes(required), `Release gate missing required command: ${required}`);
  }
  assert.doesNotMatch(
    source,
    /"\$@"\s*(?:\d?>|&>)\s*\/dev\/null/u,
    "Release gate must preserve executed command output"
  );
  assert.ok(source.includes("PYTHONDONTWRITEBYTECODE=1"), "Release gate must not dirty clean archives with Python bytecode");
  assert.ok(source.includes("release preflight failed"), "Release gate must expose a stable preflight failure");
  assert.ok(source.includes('PRODIGY_NODE_BIN') && source.includes('PRODIGY_UV_BIN'), "release gate must consume resolved absolute tool identities");
  assert.ok(source.indexOf('preflight_tool "Node 24"') < source.indexOf('RELEASE_GATE_RUN_ID='), "Node preflight must precede all gate accounting");
  assert.ok(source.indexOf('preflight_tool "uv"') < source.indexOf('RELEASE_GATE_RUN_ID='), "uv preflight must precede all gate accounting");
  assert.ok(source.includes('CONFINED_BIN="$RUNTIME_SANDBOX/bin"'), "portable commands must receive a generated confined bin");
  assert.match(source, /ln -s "\$NODE_TARGET" "\$CONFINED_BIN\/node"/u, "confined node must bind the resolved absolute identity");
  assert.match(source, /ln -s "\$UV_TARGET" "\$CONFINED_BIN\/uv"/u, "confined uv must bind the resolved absolute identity");
  assert.match(source, /export PATH="\$CONFINED_BIN:\/usr\/bin:\/bin:\/usr\/sbin:\/sbin"/u, "portable PATH must exclude inherited writable roots");
  const confinedValidation = source.indexOf("release toolchain preflight:");
  assert.ok(confinedValidation >= 0 && confinedValidation < source.indexOf('build_inventory "View"'), "the exact confined environment must validate both tools before discovery");
  assert.ok(source.includes("duplicate discovery entry"), "Release gate must reject duplicate inventory entries");
  assert.ok(source.includes("NOT_APPLICABLE") && source.includes("is_macos_real_capability"), "portable gate must account for unavailable macOS capability rows explicitly");
  for (const variable of ["HOME", "TMPDIR", "XDG_CACHE_HOME", "XDG_CONFIG_HOME", "npm_config_cache", "UV_CACHE_DIR"]) assert.ok(source.includes(`export ${variable}=`), `release sandbox must confine ${variable}`);
}

function makeFakeToolchain(root, failFind) {
  const bin = path.join(root, "bin");
  fs.mkdirSync(bin, { recursive: true });
  fs.writeFileSync(path.join(bin, "node"), '#!/usr/bin/env bash\nif [ "$1" = "--version" ]; then echo v24.19.0; elif [ "$1" = "-p" ]; then case "$2" in *randomUUID*) echo 00000000-0000-4000-8000-000000000008;; *) echo 24;; esac; fi\n');
  fs.writeFileSync(path.join(bin, "bun"), '#!/usr/bin/env bash\nif [ "$1" = "--version" ]; then echo 1.4.2; fi\n');
  fs.writeFileSync(path.join(bin, "uv"), "#!/usr/bin/env bash\necho 'uv 0.8.0'\nexit 0\n");
  if (failFind) fs.writeFileSync(path.join(bin, "find"), "#!/usr/bin/env bash\ncase \"$PATH\" in */runtime/bin:/usr/bin:/bin:/usr/sbin:/sbin) ;; *) echo unconfined-path >&2; exit 41;; esac\ncase \"$(command -v node):$(command -v uv)\" in */runtime/bin/node:*/runtime/bin/uv) ;; *) echo missing-confined-tools >&2; exit 41;; esac\ncase \"$HOME:$TMPDIR:$XDG_CACHE_HOME:$XDG_CONFIG_HOME:$npm_config_cache:$UV_CACHE_DIR\" in */runtime/home:*/runtime/tmp:*/runtime/xdg-cache:*/runtime/xdg-config:*/runtime/npm-cache:*/runtime/uv-cache) ;; *) echo unconfined-write-root >&2; exit 41;; esac\necho deterministic-find-failure >&2\nexit 42\n");
  for (const name of fs.readdirSync(bin)) fs.chmodSync(path.join(bin, name), 0o755);
  return bin;
}

function checkMissingToolFailsBeforeAccounting() {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "release-gate-tool-preflight-"));
  try {
    const bin = makeFakeToolchain(temp, false);
    fs.rmSync(path.join(bin, "uv"));
    const result = spawnSync("bash", [RUNNER], { cwd: ROOT, encoding: "utf8", env: { ...process.env, PATH: `${bin}:/usr/bin:/bin`, PRODIGY_NODE_BIN: path.join(bin, "node"), PRODIGY_UV_BIN: path.join(bin, "missing-uv") } });
    assert.notEqual(result.status, 0, "missing uv must fail");
    const output = `${result.stdout}\n${result.stderr}`;
    assert.match(output, /release preflight failed: uv executable unavailable/u);
    assert.match(output, /release preflight accounting: executed=0/u);
    assert.doesNotMatch(output, /Release gate:|=== \[/u, "missing tool must fail before partial gate accounting");
  } finally { fs.rmSync(temp, { recursive: true, force: true }); }
}

function checkFailClosedDiscovery() {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "release-gate-preflight-"));
  try {
    const missingRoot = path.join(temp, "missing-root");
    const copiedRunner = path.join(missingRoot, RUNNER_RELATIVE);
    fs.mkdirSync(path.dirname(copiedRunner), { recursive: true });
    fs.copyFileSync(RUNNER, copiedRunner);
    const missingBin = makeFakeToolchain(temp, false);
    const missing = spawnSync("bash", [copiedRunner], { cwd: missingRoot, encoding: "utf8", env: { ...process.env, PATH: `${missingBin}:${process.env.PATH}`, PRODIGY_NODE_BIN: path.join(missingBin, "node"), PRODIGY_UV_BIN: path.join(missingBin, "uv") } });
    assert.notEqual(missing.status, 0, "missing discovery roots must never produce GREEN");
    assert.match(`${missing.stdout}\n${missing.stderr}`, /release preflight failed.*SYSTEM\/Views/is);

    const failedFindBin = makeFakeToolchain(path.join(temp, "find-case"), true);
    const externalHome = path.join(temp, "external-home"); fs.mkdirSync(externalHome);
    const failedFind = spawnSync("bash", [RUNNER], { cwd: ROOT, encoding: "utf8", env: { ...process.env, HOME: externalHome, PATH: `${failedFindBin}:${process.env.PATH}`, PRODIGY_NODE_BIN: path.join(failedFindBin, "node"), PRODIGY_UV_BIN: path.join(failedFindBin, "uv"), PRODIGY_FIND_BIN: path.join(failedFindBin, "find") } });
    assert.notEqual(failedFind.status, 0, "failed find must never produce GREEN");
    assert.match(failedFind.stdout, /release toolchain preflight: node=v24\.19\.0 bun=1\.4\.2 uv=uv 0\.8\.0 environment=confined disposable_roots=6/u);
    assert.match(`${failedFind.stdout}\n${failedFind.stderr}`, /release preflight failed.*deterministic-find-failure/is);
    assert.deepEqual(fs.readdirSync(externalHome), [], "the exact portable environment must not write to external HOME");
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
}

function checkCurrentRunReceiptContract() {
  const source = read(RUNNER_RELATIVE);
  assert.ok(source.includes("SYSTEM/CI/fixtures/consolidation"), "Release gate must consume tracked consolidation fixtures");
  assert.ok(source.includes("randomUUID()"), "Release gate must generate a unique run ID");
  assert.ok(source.includes('RELEASE_GATE_ROOT="$(mktemp -d'), "Release gate must allocate a fresh task-owned root");
  assert.ok(source.includes('rm -rf "$RELEASE_GATE_ROOT"'), "Release gate must clean its task-owned root");
  assert.ok(source.includes('RELEASE_GATE_TEMP="$RELEASE_GATE_ROOT/$RELEASE_GATE_RUN_ID"'), "Release gate output must be nested under its run ID");
  assert.equal(source.split('--run-id "$RELEASE_GATE_RUN_ID"').length - 1, 4, "F1-F4 must receive the same run ID");
  assert.doesNotMatch(source, /\.omo|SYSTEM\/CACHE/, "Release gate must not consume ignored runtime paths");
  for (const phase of ["F1", "F2", "F3", "F4"]) {
    assert.ok(
      source.includes(`--output "$RELEASE_GATE_TEMP/final-${phase}/receipt.json"`),
      `${phase} receipt must be written into the current release-gate hierarchy`
    );
  }
  assert.ok(
    source.includes('--evidence-root "$RELEASE_GATE_TEMP"'),
    "F4 must consume the current release-gate temporary hierarchy"
  );
  assert.ok(
    !source.includes('--evidence-root "$CONSOLIDATION_EVIDENCE"'),
    "F4 must not consume potentially stale agent evidence"
  );
  assert.doesNotMatch(source, /PRODIGY_LAST_GATE_RESULT/u, "receipt must not trust an environment-supplied gate result");
  assert.ok(source.includes("last_gate_result: unverified_absent"), "receipt must label the absent owned record honestly");
}

function checkWorkflowContract() {
  for (const workflow of WORKFLOWS) {
    const source = read(workflow);
    assert.match(source, /node-version:\s*['"]24['"]/, `${workflow} must select Node 24`);
    assert.equal(
      source.split(CANONICAL_COMMAND).length - 1,
      1,
      `${workflow} must invoke the canonical release gate exactly once`
    );
    assert.ok(source.includes("python-version: '3.12'"), `${workflow} must preserve Python 3.12`);
    assert.ok(source.includes("astral-sh/setup-uv@v5"), `${workflow} must preserve setup-uv v5`);
    assert.match(source, /runs-on:\s*ubuntu-latest/u, `${workflow} is the explicitly portable CI lane`);
    assert.doesNotMatch(source, /TASK13A_REAL_OBSIDIAN|Aside\.app/u, `${workflow} must not claim unavailable real-Obsidian evidence`);
  }
}

function checkDocumentationContract() {
  for (const document of DOCS) {
    assert.ok(read(document).includes(CANONICAL_COMMAND), `${document} must document ${CANONICAL_COMMAND}`);
  }
}

function checkCliContract() {
  const help = spawnSync("bash", [RUNNER, "--help"], { cwd: ROOT, encoding: "utf8" });
  assert.equal(help.status, 0, help.stderr);
  assert.ok(help.stdout.includes(`Usage: ${CANONICAL_COMMAND}`), "Release gate help must show canonical usage");

  const external = fs.mkdtempSync(path.join(os.tmpdir(), "release-gate-external-home-"));
  const sandboxTest = spawnSync("bash", [RUNNER, "--sandbox-self-test"], { cwd: ROOT, encoding: "utf8", env: { ...process.env, HOME: external } });
  try {
    assert.equal(sandboxTest.status, 0, sandboxTest.stderr);
    assert.match(sandboxTest.stdout, /external_writes=0 disposable_roots=6/u);
    assert.deepEqual(fs.readdirSync(external), [], "sandbox self-test must not write to its external HOME");
  } finally { fs.rmSync(external, { recursive: true, force: true }); }

  const selfTest = spawnSync("bash", [RUNNER, "--self-test"], { cwd: ROOT, encoding: "utf8" });
  assert.notEqual(selfTest.status, 0, "Synthetic failing command must make the release gate fail");
  assert.ok(selfTest.stdout.includes("synthetic stdout"), "Synthetic stdout must be preserved");
  assert.ok(selfTest.stderr.includes("synthetic stderr"), "Synthetic stderr must be preserved");
  assert.ok(selfTest.stdout.includes("FAIL: synthetic-failure (exit 23)"), "Failure report must include label and exact child exit");

  const forgedResult = spawnSync("bash", [RUNNER, "--sandbox-self-test"], {
    cwd: ROOT,
    encoding: "utf8",
    env: { ...process.env, PRODIGY_LAST_GATE_RESULT: "FORGED-STALE-RESULT" }
  });
  assert.equal(forgedResult.status, 0, forgedResult.stderr);
  assert.match(forgedResult.stdout, /last_gate_result: unverified_absent/u);
  assert.doesNotMatch(forgedResult.stdout, /FORGED-STALE-RESULT/u);
}

function main() {
  checkGitOwnedDeliveryFixture();
  checkLegacyFreezeUniverseCompatibility();
  checkReleaseManifestContract();
  checkRunnerContract();
  checkCurrentRunReceiptContract();
  checkWorkflowContract();
  checkDocumentationContract();
  checkCliContract();
  checkMissingToolFailsBeforeAccounting();
  checkFailClosedDiscovery();
  console.log("Release gate contract passed: commands, CI, docs, failure propagation, and fail-closed discovery locked.");
}

try {
  main();
} catch (error) {
  console.error(`Release gate contract failed: ${error.stack || error.message}`);
  process.exitCode = 1;
}
