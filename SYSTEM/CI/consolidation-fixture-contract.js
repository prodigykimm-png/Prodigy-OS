"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const MANIFEST_NAME = "fixture-manifest.json";
const REQUIRED_INPUTS = Object.freeze({
  plan: "plan.md",
  ownership: "ownership-v1.json",
  baseline: "baseline-v1.json",
  approval: "approval-root/receipts/synthetic-not-applied.json",
  design_state: "frontend-design-state.md",
  source_inventory: "source-inventory-v1.json",
});
const OWNED_SOURCE_ROOTS = Object.freeze(["SYSTEM/SCRIPTS/", "SYSTEM/Views/", "SYSTEM/docs/"]);

function sha256Bytes(bytes) {
  return crypto.createHash("sha256").update(bytes).digest("hex");
}

function sha256File(filePath) {
  return sha256Bytes(fs.readFileSync(filePath));
}

function normalizedRelative(value, label = "path") {
  if (typeof value !== "string" || value.length === 0 || value.includes("\\") || path.posix.isAbsolute(value)) {
    throw new Error(`${label} is not repository-relative: ${String(value)}`);
  }
  const normalized = path.posix.normalize(value);
  if (normalized !== value || normalized === "." || normalized.startsWith("../") || value !== value.normalize("NFC")) {
    throw new Error(`${label} is not normalized: ${value}`);
  }
  return value;
}

function assertRegularFile(filePath, label) {
  let stat;
  try { stat = fs.lstatSync(filePath); }
  catch (error) {
    if (error.code === "ENOENT") throw new Error(`${label} missing: ${filePath}`);
    throw error;
  }
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error(`${label} is not a regular file: ${filePath}`);
  return stat;
}

function assertInsideRoot(realRoot, candidatePath, label) {
  const realCandidate = fs.realpathSync(candidatePath);
  if (realCandidate !== realRoot && !realCandidate.startsWith(`${realRoot}${path.sep}`)) {
    throw new Error(`${label} realpath escapes root: ${candidatePath}`);
  }
  return realCandidate;
}

function walkFixture(root, current, files) {
  for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
    const absolutePath = path.join(current, entry.name);
    const relativePath = path.relative(root, absolutePath).split(path.sep).join("/");
    const stat = fs.lstatSync(absolutePath);
    if (stat.isSymbolicLink()) {
      const kind = entry.isDirectory() ? "directory" : "entry";
      throw new Error(`fixture ${kind} is not a regular file: ${relativePath}`);
    }
    if (stat.isDirectory()) {
      walkFixture(root, absolutePath, files);
    } else if (stat.isFile()) {
      if (relativePath !== MANIFEST_NAME) files.push(relativePath);
    } else {
      throw new Error(`fixture entry is not a regular file: ${relativePath}`);
    }
  }
}

function validateFixtureRoot(options) {
  const fixtureRoot = path.resolve(options.fixtureRoot);
  const manifestPath = path.resolve(options.manifestPath || path.join(fixtureRoot, MANIFEST_NAME));
  let rootStat;
  try { rootStat = fs.lstatSync(fixtureRoot); }
  catch (error) {
    if (error.code === "ENOENT") throw new Error(`fixture root missing: ${fixtureRoot}`);
    throw error;
  }
  if (!rootStat.isDirectory() || rootStat.isSymbolicLink()) throw new Error(`fixture root is not a real directory: ${fixtureRoot}`);
  const realRoot = fs.realpathSync(fixtureRoot);
  assertRegularFile(manifestPath, "fixture manifest");
  assertInsideRoot(realRoot, manifestPath, "fixture manifest");

  let manifest;
  try { manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8")); }
  catch (error) { throw new Error(`fixture manifest parse error: ${error.message}`); }
  if (!manifest || manifest.schema_version !== 1 || manifest.algorithm !== "sha256" || !Array.isArray(manifest.fixtures)) {
    throw new Error("fixture manifest shape invalid");
  }

  const entries = new Map();
  for (const entry of manifest.fixtures) {
    if (!entry || !/^[a-f0-9]{64}$/.test(entry.sha256 || "")) throw new Error("fixture manifest entry shape invalid");
    const relativePath = normalizedRelative(entry.path, "fixture manifest path");
    if (relativePath === MANIFEST_NAME || entries.has(relativePath)) throw new Error(`fixture manifest path duplicated or reserved: ${relativePath}`);
    const absolutePath = path.join(fixtureRoot, ...relativePath.split("/"));
    assertRegularFile(absolutePath, "fixture entry");
    assertInsideRoot(realRoot, absolutePath, "fixture entry");
    const actualHash = sha256File(absolutePath);
    if (actualHash !== entry.sha256) throw new Error(`fixture SHA-256 mismatch: ${relativePath}`);
    entries.set(relativePath, Object.freeze({ path: relativePath, sha256: actualHash, absolutePath }));
  }

  const actualFiles = [];
  walkFixture(fixtureRoot, fixtureRoot, actualFiles);
  const listedFiles = [...entries.keys()].sort();
  actualFiles.sort();
  if (JSON.stringify(actualFiles) !== JSON.stringify(listedFiles)) {
    throw new Error(`fixture inventory mismatch: listed=${listedFiles.join(",")} actual=${actualFiles.join(",")}`);
  }
  const required = Object.values(REQUIRED_INPUTS).sort();
  if (JSON.stringify(listedFiles) !== JSON.stringify(required)) throw new Error("fixture inventory does not contain the exact required inputs");

  return Object.freeze({
    fixtureRoot,
    manifestPath,
    manifestSha256: sha256File(manifestPath),
    entries,
  });
}

function validateSourceInventory({ sourceInventory, repoRoot }) {
  if (!sourceInventory || sourceInventory.schema_version !== 1 || sourceInventory.algorithm !== "sha256" || !Array.isArray(sourceInventory.sources)) {
    throw new Error("trusted source inventory shape invalid");
  }
  const realRepo = fs.realpathSync(repoRoot);
  const gitRootResult = spawnSync("git", ["rev-parse", "--show-toplevel"], { cwd: repoRoot, encoding: "utf8" });
  const gitRoot = gitRootResult.status === 0 ? gitRootResult.stdout.trim() : null;
  const gitMode = Boolean(gitRoot && fs.realpathSync(gitRoot) === realRepo);
  const sources = new Map();
  for (const entry of sourceInventory.sources) {
    if (!entry || JSON.stringify(Object.keys(entry).sort()) !== JSON.stringify(["path", "sha256", "type"]) ||
        entry.type !== "regular-file" || !/^[a-f0-9]{64}$/.test(entry.sha256 || "")) {
      throw new Error("trusted source inventory entry shape invalid");
    }
    const relativePath = normalizedRelative(entry.path, "trusted source inventory path");
    if (!OWNED_SOURCE_ROOTS.some((prefix) => relativePath.startsWith(prefix))) {
      throw new Error(`trusted source inventory path is outside fixture-owned source roots: ${relativePath}`);
    }
    if (sources.has(relativePath)) throw new Error(`trusted source inventory path duplicated: ${relativePath}`);
    const absolutePath = path.join(repoRoot, ...relativePath.split("/"));
    assertRegularFile(absolutePath, "trusted source inventory path");
    assertInsideRoot(realRepo, absolutePath, "trusted source inventory path");
    if (sha256File(absolutePath) !== entry.sha256) throw new Error(`trusted source inventory SHA-256 mismatch: ${relativePath}`);
    if (gitMode) {
      const tracked = spawnSync("git", ["ls-files", "--error-unmatch", "--", relativePath], { cwd: repoRoot, encoding: "utf8" });
      if (tracked.status !== 0) throw new Error(`trusted source inventory path is not tracked: ${relativePath}`);
    }
    sources.set(relativePath, Object.freeze({ ...entry, absolutePath }));
  }
  return Object.freeze({ gitMode, sources });
}

function validateOwnership({ ownership, planSha256, repoRoot, trustedSources }) {
  if (!ownership || ownership.schema_version !== 1 || !ownership.todos || !ownership.finals) throw new Error("ownership shape invalid");
  const todoKeys = Object.keys(ownership.todos).sort((a, b) => Number(a) - Number(b));
  const finalKeys = Object.keys(ownership.finals).sort();
  const expectedTodos = Array.from({ length: 16 }, (_, index) => String(index));
  if (JSON.stringify(todoKeys) !== JSON.stringify(expectedTodos)) throw new Error("ownership todo inventory invalid");
  if (JSON.stringify(finalKeys) !== JSON.stringify(["F1", "F2", "F3", "F4"])) throw new Error("ownership final inventory invalid");
  if (ownership.plan_sha256 !== planSha256) throw new Error("ownership plan SHA-256 mismatch");

  const realRepo = fs.realpathSync(repoRoot);
  const ownedPaths = [];
  const uniqueOwnedPaths = new Set();
  for (const [group, entries] of [...Object.entries(ownership.todos), ...Object.entries(ownership.finals)]) {
    if (!Array.isArray(entries) || entries.length === 0) throw new Error(`ownership ${group} entries invalid`);
    for (const value of entries) {
      const relativePath = normalizedRelative(value, "ownership path");
      if (!OWNED_SOURCE_ROOTS.some((prefix) => relativePath.startsWith(prefix))) {
        throw new Error(`ownership path is outside fixture-owned source roots: ${relativePath}`);
      }
      const absolutePath = path.join(repoRoot, ...relativePath.split("/"));
      assertRegularFile(absolutePath, "ownership path");
      assertInsideRoot(realRepo, absolutePath, "ownership path");
      if (!trustedSources.sources.has(relativePath)) throw new Error(`ownership path missing from trusted source inventory: ${relativePath}`);
      if (trustedSources.gitMode) {
        const tracked = spawnSync("git", ["ls-files", "--error-unmatch", "--", relativePath], { cwd: repoRoot, encoding: "utf8" });
        if (tracked.status !== 0) throw new Error(`ownership path is not tracked: ${relativePath}`);
      }
      ownedPaths.push(relativePath);
      uniqueOwnedPaths.add(relativePath);
    }
  }
  const inventoryPaths = [...trustedSources.sources.keys()].sort();
  const ownershipPaths = [...uniqueOwnedPaths].sort();
  if (JSON.stringify(inventoryPaths) !== JSON.stringify(ownershipPaths)) {
    throw new Error(`trusted source inventory has missing or extra paths: ownership=${ownershipPaths.join(",")} inventory=${inventoryPaths.join(",")}`);
  }
  return Object.freeze({ ownedPaths: Object.freeze(ownedPaths), sourceMode: trustedSources.gitMode ? "git" : "archive" });
}

function validateAuditInputs({ fixtureRoot, manifestPath, planPath, ownershipPath, baselinePath, repoRoot }) {
  const validated = validateFixtureRoot({ fixtureRoot, manifestPath });
  const requested = {
    plan: path.resolve(planPath),
    ownership: path.resolve(ownershipPath),
    baseline: path.resolve(baselinePath),
  };
  const hashes = { fixture_manifest_sha256: validated.manifestSha256 };
  for (const [name, relativePath] of Object.entries(REQUIRED_INPUTS)) {
    const entry = validated.entries.get(relativePath);
    hashes[`${name}_sha256`] = entry.sha256;
    if (requested[name] && fs.realpathSync(requested[name]) !== fs.realpathSync(entry.absolutePath)) {
      throw new Error(`${name} input is not the manifested fixture`);
    }
  }
  const ownership = JSON.parse(fs.readFileSync(requested.ownership, "utf8"));
  const baseline = JSON.parse(fs.readFileSync(requested.baseline, "utf8"));
  const sourceInventory = JSON.parse(fs.readFileSync(validated.entries.get(REQUIRED_INPUTS.source_inventory).absolutePath, "utf8"));
  const trustedSources = validateSourceInventory({ sourceInventory, repoRoot });
  const ownershipValidation = validateOwnership({ ownership, planSha256: hashes.plan_sha256, repoRoot, trustedSources });
  return Object.freeze({
    ...validated,
    hashes: Object.freeze(hashes),
    ownership,
    baseline,
    sourceInventory,
    ownedPaths: ownershipValidation.ownedPaths,
    sourceMode: ownershipValidation.sourceMode,
  });
}

function validRunId(value) {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(value);
}

module.exports = Object.freeze({
  MANIFEST_NAME,
  OWNED_SOURCE_ROOTS,
  REQUIRED_INPUTS,
  assertRegularFile,
  normalizedRelative,
  sha256File,
  validRunId,
  validateAuditInputs,
  validateFixtureRoot,
  validateOwnership,
  validateSourceInventory,
});
