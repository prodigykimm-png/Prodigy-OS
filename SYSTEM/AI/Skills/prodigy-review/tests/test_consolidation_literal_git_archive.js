"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { randomUUID } = require("node:crypto");
const { spawnSync } = require("node:child_process");

const ROOT = path.resolve(__dirname, "../../../../..");
const projection = require(path.join(ROOT, "SYSTEM/CI/release-projection-authority.js"));
const {
  BASELINE,
  DERIVED_EVIDENCE_EXCLUSIONS,
  EXTERNAL_KNOWLEDGE_INBOX,
  NON_DELIVERY_EXCLUSIONS,
  ZERO_SHA256,
  assertFrozenUniverse,
  buildManifest,
  canonicalSelfSha256,
  deriveProjectedPaths: deriveCurrentProjectedPaths,
  freezeUniverse,
  projectedPathManifestSha256
} = projection;
const MANIFEST = projection.MANIFEST_RELATIVE;
const FORBIDDEN_TOP_LEVEL = new Set([".git", ".omo", ".gjc", ".codex", "DAILY", "PARA", "ZETA"]);

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function fileSha256(root, relativePath) {
  return sha256(fs.readFileSync(path.join(root, relativePath)));
}
function command(commandName, args, options = {}) {
  const result = spawnSync(commandName, args, { cwd: options.cwd || ROOT, encoding: "utf8", env: options.env || process.env });
  assert.equal(result.status, 0, `${commandName} ${args.join(" ")} failed:\n${result.stdout}\n${result.stderr}`);
  return result;
}

function deriveProjectedPaths() {
  return deriveCurrentProjectedPaths(ROOT);
}

function assertSafeRelativePath(relativePath) {
  assert.equal(typeof relativePath, "string", "projected path must be a string");
  assert.equal(path.isAbsolute(relativePath), false, `absolute projected path: ${relativePath}`);
  assert.equal(relativePath.includes("\\"), false, `non-canonical projected path: ${relativePath}`);
  const parts = relativePath.split("/");
  assert.equal(parts.includes(".."), false, `escaping projected path: ${relativePath}`);
  assert.equal(parts.includes(""), false, `empty projected path segment: ${relativePath}`);
  assert.equal(FORBIDDEN_TOP_LEVEL.has(parts[0]), false, `private/internal projected path: ${relativePath}`);
  assert.equal(parts.includes("PRIVATE"), false, `private projected path: ${relativePath}`);
  assert.equal(parts.includes("CACHE"), false, `runtime cache projected path: ${relativePath}`);
  assert.equal(parts.includes("__pycache__"), false, `bytecode projected path: ${relativePath}`);
  assert.equal(relativePath.endsWith(".pyc"), false, `bytecode projected path: ${relativePath}`);
}



function validateProjectionManifest(manifest, actualPaths, root) {
  assert.deepEqual(Object.keys(manifest.delivery).sort(), ["derived_delivery_evidence_exclusions", "head_inclusion", "mode", "non_delivery_exclusions", "projected_path_manifest_sha256", "projected_paths"]);
  assert.equal(manifest.delivery.mode, "projected_worktree");
  assert.equal(manifest.delivery.head_inclusion, "deferred_to_authorized_final_merge");
  assert.deepEqual(manifest.delivery.non_delivery_exclusions, NON_DELIVERY_EXCLUSIONS);
  assert.deepEqual(manifest.delivery.derived_delivery_evidence_exclusions, DERIVED_EVIDENCE_EXCLUSIONS);
  assert.equal(actualPaths.some((relativePath) => DERIVED_EVIDENCE_EXCLUSIONS.some((identity) => projection.matchesEvidenceIdentity(relativePath, identity))), false, "predeclared generated evidence roots must not enter the raw product projection");
  assert.match(manifest.delivery.projected_path_manifest_sha256, /^[a-f0-9]{64}$/u);

  const entries = manifest.delivery.projected_paths;
  assert.ok(Array.isArray(entries) && entries.length > 0, "projection manifest is empty");
  const paths = entries.map((entry) => entry.path);
  assert.deepEqual(paths, paths.slice().sort(), "projection paths must be sorted");
  assert.equal(new Set(paths).size, paths.length, "duplicate projected path");
  for (const entry of entries) {
    assert.deepEqual(Object.keys(entry).sort(), ["hash_mode", "path", "sha256"]);
    assertSafeRelativePath(entry.path);
    assert.match(entry.sha256, /^[a-f0-9]{64}$/u);
    assert.equal(entry.hash_mode, entry.path === MANIFEST ? "canonical_self" : "raw", `wrong hash mode: ${entry.path}`);
  }

  assert.deepEqual(paths, actualPaths.slice().sort(), "projection manifest path set differs from modified+untracked projection");
  for (const entry of entries) {
    const absolutePath = path.join(root, entry.path);
    assert.ok(fs.existsSync(absolutePath), `projected path is missing: ${entry.path}`);
    assert.equal(fs.lstatSync(absolutePath).isFile(), true, `projected path is not a regular file: ${entry.path}`);
    const actualSha = entry.hash_mode === "canonical_self" ? canonicalSelfSha256(manifest) : fileSha256(root, entry.path);
    assert.equal(entry.sha256, actualSha, `projected path byte mismatch: ${entry.path}`);
  }
  assert.equal(manifest.delivery.projected_path_manifest_sha256, projectedPathManifestSha256(entries), "projected path manifest digest mismatch");
  return entries;
}

function updateProjectionManifest() {
  const gitProbe = spawnSync("git", ["rev-parse", "--show-toplevel"], { cwd: ROOT, encoding: "utf8" });
  assert.equal(gitProbe.status, 0, "projection manifest update requires owning Git metadata");
  assert.equal(path.resolve(gitProbe.stdout.trim()), ROOT, "projection manifest update must run at its owning worktree");
  const frozen = freezeUniverse(ROOT);
  assert.ok(frozen.projectedPaths.includes(MANIFEST), "projection manifest is not part of the projected deliverable");
  for (const relativePath of frozen.projectedPaths) {
    assertSafeRelativePath(relativePath);
    assert.ok(fs.existsSync(path.join(ROOT, relativePath)), `deleted paths require an explicit delivery policy: ${relativePath}`);
  }

  const manifestPath = path.join(ROOT, MANIFEST);
  const current = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  const first = buildManifest(current, frozen);
  fs.writeFileSync(manifestPath, `${JSON.stringify(first, null, 2)}\n`);
  const secondUniverse = freezeUniverse(ROOT);
  assertFrozenUniverse(frozen, secondUniverse);
  const second = buildManifest(first, secondUniverse);
  assert.deepEqual(second, first, "projection manifest did not reach a two-pass fixed point");
  validateProjectionManifest(second, frozen.projectedPaths, ROOT);
  console.log(`Updated fixed-point projection manifest: paths=${frozen.projectedPaths.length}, digest=${second.delivery.projected_path_manifest_sha256}, passes=2`);
}

function copyProjectedPath(exportRoot, relativePath) {
  assertSafeRelativePath(relativePath);
  const source = path.join(ROOT, relativePath);
  const target = path.join(exportRoot, relativePath);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(source, target);
}

function fingerprint(root) {
  const hash = crypto.createHash("sha256");
  function walk(directory, prefix) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
      assertSafeRelativePath(relative);
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) walk(absolute, relative);
      else if (entry.isFile()) hash.update(relative).update("\0").update(fs.readFileSync(absolute)).update("\0");
      else assert.fail(`non-regular projected archive entry: ${relative}`);
    }
  }
  walk(root, "");
  return hash.digest("hex");
}

function assertMutationRejections(manifest, actualPaths) {
  const clone = () => JSON.parse(JSON.stringify(manifest));

  const extraExclusion = clone();
  extraExclusion.delivery.derived_delivery_evidence_exclusions.push({ path: "SYSTEM/AI/Reports/extra.json", reason: "post_projection_derived_receipt_self_reference" });
  assert.throws(() => validateProjectionManifest(extraExclusion, actualPaths, ROOT), /strictly deep-equal/u);

  const changedReason = clone();
  changedReason.delivery.derived_delivery_evidence_exclusions[0].reason = "other";
  assert.throws(() => validateProjectionManifest(changedReason, actualPaths, ROOT), /strictly deep-equal/u);

  const wildcardIdentity = clone();
  wildcardIdentity.delivery.derived_delivery_evidence_exclusions[1].path += "/**";
  assert.throws(() => validateProjectionManifest(wildcardIdentity, actualPaths, ROOT), /strictly deep-equal/u);
  assert.throws(() => projection.matchesEvidenceIdentity("SYSTEM/AI/Reports/task16-final-evidence/file", wildcardIdentity.delivery.derived_delivery_evidence_exclusions[1]), /must not be globs/u);
  assert.equal(projection.matchesEvidenceIdentity("SYSTEM/AI/Reports/task16-final-evidence-sibling/file", DERIVED_EVIDENCE_EXCLUSIONS[1]), false, "evidence-root identity must not widen to prefix siblings");

  const missing = clone();
  missing.delivery.projected_paths.pop();
  assert.throws(() => validateProjectionManifest(missing, actualPaths, ROOT), /path set differs/u);

  const extra = clone();
  extra.delivery.projected_paths.push({ path: "SYSTEM/extra-not-projected.js", sha256: ZERO_SHA256, hash_mode: "raw" });
  extra.delivery.projected_paths.sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
  assert.throws(() => validateProjectionManifest(extra, actualPaths, ROOT), /path set differs/u);

  const duplicate = clone();
  duplicate.delivery.projected_paths.push({ ...duplicate.delivery.projected_paths[0] });
  duplicate.delivery.projected_paths.sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
  assert.throws(() => validateProjectionManifest(duplicate, [...actualPaths, actualPaths[0]], ROOT), /duplicate projected path/u);

  const forbidden = clone();
  forbidden.delivery.projected_paths.push({ path: "SYSTEM/PRIVATE/secret.json", sha256: ZERO_SHA256, hash_mode: "raw" });
  forbidden.delivery.projected_paths.sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
  assert.throws(() => validateProjectionManifest(forbidden, [...actualPaths, "SYSTEM/PRIVATE/secret.json"], ROOT), /private projected path/u);

  const byteMismatch = clone();
  const raw = byteMismatch.delivery.projected_paths.find((entry) => entry.hash_mode === "raw");
  raw.sha256 = ZERO_SHA256;
  assert.throws(() => validateProjectionManifest(byteMismatch, actualPaths, ROOT), /byte mismatch/u);

  const frozen = freezeUniverse(ROOT);
  const added = structuredClone(frozen);
  added.projectedPaths.push("SYSTEM/added-after-freeze.js");
  assert.throws(() => assertFrozenUniverse(frozen, added), /path universe changed/u);
  const missingFrozen = structuredClone(frozen);
  missingFrozen.projectedPaths.pop();
  assert.throws(() => assertFrozenUniverse(frozen, missingFrozen), /path universe changed/u);
  const changed = structuredClone(frozen);
  const changedFile = changed.files.find((entry) => entry.sha256);
  changedFile.sha256 = ZERO_SHA256;
  assert.throws(() => assertFrozenUniverse(frozen, changed), /source bytes changed/u);
}

function runAudits(exportRoot, receiptRoot) {
  const runId = randomUUID();
  const fixtureRoot = "SYSTEM/CI/fixtures/consolidation";
  const common = ["--fixture-root", fixtureRoot, "--manifest", `${fixtureRoot}/fixture-manifest.json`, "--run-id", runId];
  command(process.execPath, ["SYSTEM/CI/validate-consolidation-fixtures.js", ...common.slice(0, 4)], { cwd: exportRoot });
  command(process.execPath, ["SYSTEM/SCRIPTS/prodigy-consolidation-plan-audit.js", ...common,
    "--plan", `${fixtureRoot}/plan.md`, "--ownership", `${fixtureRoot}/ownership-v1.json`, "--baseline", `${fixtureRoot}/baseline-v1.json`,
    "--output", path.join(receiptRoot, "final-F1/receipt.json")], { cwd: exportRoot });
  command(process.execPath, ["SYSTEM/SCRIPTS/prodigy-consolidation-security-audit.js", ...common,
    "--plan", `${fixtureRoot}/plan.md`, "--ownership", `${fixtureRoot}/ownership-v1.json`, "--baseline", `${fixtureRoot}/baseline-v1.json`,
    "--approval-root", `${fixtureRoot}/approval-root`, "--output", path.join(receiptRoot, "final-F2/receipt.json")], { cwd: exportRoot });
  command(process.execPath, ["SYSTEM/SCRIPTS/prodigy-consolidation-visual-receipt.js", ...common,
    "--output", path.join(receiptRoot, "final-F3/receipt.json")], { cwd: exportRoot });
  command(process.execPath, ["SYSTEM/SCRIPTS/prodigy-consolidation-final-audit.js", "--evidence-root", receiptRoot, "--run-id", runId,
    "--output", path.join(receiptRoot, "final-F4/receipt.json")], { cwd: exportRoot });
  for (const phase of ["F1", "F2", "F3", "F4"]) {
    const receipt = JSON.parse(fs.readFileSync(path.join(receiptRoot, `final-${phase}/receipt.json`), "utf8"));
    assert.equal(receipt.ok, true, `${phase} did not approve the projected archive`);
    assert.equal(receipt.run_id, runId);
    if (phase === "F1" || phase === "F2") assert.equal(receipt.ownership_source_mode, "archive");
  }
}

function runCleanCommittedRegression(entries) {
  if (process.env.PRODIGY_CLEAN_PROJECTION_REGRESSION === "1") return;
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "clean-projection-git-regression-"));
  try {
    command("git", ["clone", "--quiet", "--no-hardlinks", ROOT, temp], { cwd: path.dirname(temp) });
    command("git", ["checkout", "--quiet", BASELINE], { cwd: temp });
    for (const entry of entries) {
      const target = path.join(temp, entry.path); fs.mkdirSync(path.dirname(target), { recursive: true }); fs.copyFileSync(path.join(ROOT, entry.path), target);
    }
    command("git", ["add", "--", ...entries.map((entry) => entry.path)], { cwd: temp });
    command("git", ["-c", "user.name=Projection Test", "-c", "user.email=projection@example.invalid", "commit", "--quiet", "-m", "baseline plus projection"], { cwd: temp });
    const clean = command("git", ["status", "--porcelain"], { cwd: temp }); assert.equal(clean.stdout, "");
    const result = spawnSync(process.execPath, [path.join(temp, __filename.slice(ROOT.length + 1))], { cwd: temp, encoding: "utf8", env: { ...process.env, PRODIGY_CLEAN_PROJECTION_REGRESSION: "1" } });
    assert.equal(result.status, 0, `clean committed projection failed:\n${result.stdout}\n${result.stderr}`);
    assert.match(result.stdout, /Projected metadata-free archive passed/u);
  } finally { fs.rmSync(temp, { recursive: true, force: true }); }
}

function main() {
  if (process.argv[2] === "--update-projection-manifest") {
    assert.equal(process.argv.length, 3, "unknown projection update arguments");
    updateProjectionManifest();
    return;
  }
  assert.equal(process.argv.length, 2, "unknown archive-test arguments");

  const gitProbe = spawnSync("git", ["rev-parse", "--show-toplevel"], { cwd: ROOT, encoding: "utf8" });
  const gitMode = gitProbe.status === 0 && path.resolve(gitProbe.stdout.trim()) === ROOT;
  const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, MANIFEST), "utf8"));
  const actualPaths = gitMode ? deriveProjectedPaths() : manifest.delivery.projected_paths.map((entry) => entry.path);
  const entries = validateProjectionManifest(manifest, actualPaths, ROOT);
  if (gitMode) assertMutationRejections(manifest, actualPaths);

  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "consolidation-projected-archive-test-"));
  try {
    const exportRoot = path.join(temp, "export");
    const receiptRoot = path.join(temp, "receipts");
    if (gitMode) {
      const headArchive = path.join(temp, "head.tar");
      fs.mkdirSync(exportRoot);
      command("git", ["archive", "--format=tar", `--output=${headArchive}`, "HEAD"]);
      command("tar", ["-xf", headArchive, "-C", exportRoot]);
      for (const name of FORBIDDEN_TOP_LEVEL) fs.rmSync(path.join(exportRoot, name), { recursive: true, force: true });
      for (const relativePath of EXTERNAL_KNOWLEDGE_INBOX) fs.rmSync(path.join(exportRoot, relativePath), { force: true });
      fs.rmSync(path.join(exportRoot, "SYSTEM/PRIVATE"), { recursive: true, force: true });
      fs.rmSync(path.join(exportRoot, "SYSTEM/CACHE"), { recursive: true, force: true });
      for (const entry of entries) copyProjectedPath(exportRoot, entry.path);
    } else {
      fs.cpSync(ROOT, exportRoot, {
        recursive: true,
        filter: (source) => {
          const relative = path.relative(ROOT, source).split(path.sep).join("/");
          return !relative || !FORBIDDEN_TOP_LEVEL.has(relative.split("/")[0]);
        }
      });
    }

    assert.equal(fs.existsSync(path.join(exportRoot, ".git")), false);
    const exportedManifest = JSON.parse(fs.readFileSync(path.join(exportRoot, MANIFEST), "utf8"));
    validateProjectionManifest(exportedManifest, entries.map((entry) => entry.path), exportRoot);
    const before = fingerprint(exportRoot);
    runAudits(exportRoot, receiptRoot);
    const after = fingerprint(exportRoot);
    assert.equal(after, before, "projected archive bytes changed during verification");
    console.log(`Projected metadata-free archive passed: mode=${gitMode ? "manifest-overlay" : "archive-self-check"}, planned=${entries.length}, path_manifest_sha256=${manifest.delivery.projected_path_manifest_sha256}, archive_sha256=${before}, F1-F4=4/4.`);
    if (gitMode) runCleanCommittedRegression(entries);
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
}

main();
