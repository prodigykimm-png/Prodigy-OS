"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { randomUUID } = require("node:crypto");
const { spawnSync } = require("node:child_process");

const ROOT = path.resolve(__dirname, "../../../../..");
const MANIFEST = "SYSTEM/CI/release-gate-manifest.json";
const BASELINE = "e82aebecee1ac0d3b12c288d147216ec6ec939d7";
const ZERO_SHA256 = "0".repeat(64);
const EXTERNAL_KNOWLEDGE_INBOX = Object.freeze([
  "SYSTEM/docs/Prodigy_Knowledge_Inbox_Execution_Scope_v1.json",
  "SYSTEM/docs/Prodigy_Knowledge_Inbox_Proposal_v1.md"
]);
const NON_DELIVERY_EXCLUSIONS = Object.freeze([
  ".git", ".omo", ".gjc", ".codex", "DAILY", "PARA", "ZETA",
  "SYSTEM/PRIVATE", "SYSTEM/CACHE", "**/__pycache__", "**/*.pyc",
  ...EXTERNAL_KNOWLEDGE_INBOX
]);
const FORBIDDEN_TOP_LEVEL = new Set([".git", ".omo", ".gjc", ".codex", "DAILY", "PARA", "ZETA"]);
const DERIVED_EVIDENCE_EXCLUSIONS = Object.freeze([
  { path: "SYSTEM/AI/Reports/task16-final-release-receipt.json", reason: "post_projection_derived_receipt_self_reference" },
  { path: "SYSTEM/AI/Reports/task16-final-evidence/**", reason: "post_projection_retained_authoritative_evidence" }
]);

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function fileSha256(root, relativePath) {
  return sha256(fs.readFileSync(path.join(root, relativePath)));
}
function countFiles(root, predicate) {
  let count = 0;
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const target = path.join(root, entry.name);
    if (entry.isDirectory()) count += countFiles(target, predicate);
    else if (entry.isFile() && predicate(entry.name)) count += 1;
  }
  return count;
}

function command(commandName, args, options = {}) {
  const result = spawnSync(commandName, args, { cwd: options.cwd || ROOT, encoding: "utf8", env: options.env || process.env });
  assert.equal(result.status, 0, `${commandName} ${args.join(" ")} failed:\n${result.stdout}\n${result.stderr}`);
  return result;
}

function gitPaths(args) {
  const result = spawnSync("git", args, { cwd: ROOT, encoding: "buffer" });
  assert.equal(result.status, 0, result.stderr.toString());
  return result.stdout.toString("utf8").split("\0").filter(Boolean);
}

function deriveTaskOwnedPaths() {
  command("git", ["cat-file", "-e", `${BASELINE}^{commit}`]);
  return [...new Set([
    ...gitPaths(["diff", "--name-only", "-z", BASELINE, "--"]),
    ...gitPaths(["ls-files", "--others", "--exclude-standard", "-z"])
  ])].filter((relativePath) => !EXTERNAL_KNOWLEDGE_INBOX.includes(relativePath)).sort();
}

function deriveProjectedPaths() {
  return deriveTaskOwnedPaths().filter((relativePath) => !DERIVED_EVIDENCE_EXCLUSIONS.some((entry) => entry.path.endsWith("/**") ? relativePath.startsWith(entry.path.slice(0, -2)) : relativePath === entry.path));
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

function normalizedSelfManifest(manifest) {
  const normalized = JSON.parse(JSON.stringify(manifest));
  normalized.delivery.projected_path_manifest_sha256 = ZERO_SHA256;
  const self = normalized.delivery.projected_paths.find((entry) => entry.path === MANIFEST);
  assert.ok(self, "projection manifest must own itself");
  self.sha256 = ZERO_SHA256;
  return normalized;
}

function canonicalSelfSha256(manifest) {
  return sha256(JSON.stringify(normalizedSelfManifest(manifest), null, 2) + "\n");
}

function projectedPathManifestSha256(entries) {
  return sha256(entries.map((entry) => `${entry.path}\0${entry.hash_mode}\0${entry.sha256}\n`).join(""));
}

function validateProjectionManifest(manifest, actualPaths, root) {
  assert.deepEqual(Object.keys(manifest.delivery).sort(), ["derived_delivery_evidence_exclusions", "head_inclusion", "mode", "non_delivery_exclusions", "projected_path_manifest_sha256", "projected_paths"]);
  assert.equal(manifest.delivery.mode, "projected_worktree");
  assert.equal(manifest.delivery.head_inclusion, "deferred_to_authorized_final_merge");
  assert.deepEqual(manifest.delivery.non_delivery_exclusions, NON_DELIVERY_EXCLUSIONS);
  assert.deepEqual(manifest.delivery.derived_delivery_evidence_exclusions, DERIVED_EVIDENCE_EXCLUSIONS);
  assert.equal(actualPaths.some((relativePath) => relativePath === DERIVED_EVIDENCE_EXCLUSIONS[0].path || relativePath.startsWith("SYSTEM/AI/Reports/task16-final-evidence/")), false, "derived evidence must not enter the raw product projection");
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
  const projectedPaths = deriveProjectedPaths();
  assert.ok(projectedPaths.includes(MANIFEST), "projection manifest is not part of the projected deliverable");
  for (const relativePath of projectedPaths) {
    assertSafeRelativePath(relativePath);
    assert.ok(fs.existsSync(path.join(ROOT, relativePath)), `deleted paths require an explicit delivery policy: ${relativePath}`);
  }

  const manifestPath = path.join(ROOT, MANIFEST);
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  const testsRoot = path.join(ROOT, "SYSTEM/AI/Skills/prodigy-review/tests");
  manifest.discovery = {
    view_syntax_files: countFiles(path.join(ROOT, "SYSTEM/Views"), (name) => name.endsWith(".js")),
    javascript_suite_files: countFiles(testsRoot, (name) => name.startsWith("test_") && name.endsWith(".js")),
    python_suite_files: countFiles(testsRoot, (name) => name.startsWith("test_") && name.endsWith(".py"))
  };
  manifest.total_commands = Object.values(manifest.fixed_commands).reduce((sum, value) => sum + value, 0) + Object.values(manifest.discovery).reduce((sum, value) => sum + value, 0);
  manifest.delivery = {
    mode: "projected_worktree",
    head_inclusion: "deferred_to_authorized_final_merge",
    non_delivery_exclusions: [...NON_DELIVERY_EXCLUSIONS],
    derived_delivery_evidence_exclusions: DERIVED_EVIDENCE_EXCLUSIONS.map((entry) => ({ ...entry })),
    projected_path_manifest_sha256: ZERO_SHA256,
    projected_paths: projectedPaths.map((relativePath) => ({
      path: relativePath,
      sha256: relativePath === MANIFEST ? ZERO_SHA256 : fileSha256(ROOT, relativePath),
      hash_mode: relativePath === MANIFEST ? "canonical_self" : "raw"
    }))
  };
  const self = manifest.delivery.projected_paths.find((entry) => entry.path === MANIFEST);
  self.sha256 = canonicalSelfSha256(manifest);
  manifest.delivery.projected_path_manifest_sha256 = projectedPathManifestSha256(manifest.delivery.projected_paths);
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
  validateProjectionManifest(manifest, projectedPaths, ROOT);
  console.log(`Updated projection manifest: paths=${projectedPaths.length}, digest=${manifest.delivery.projected_path_manifest_sha256}`);
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
