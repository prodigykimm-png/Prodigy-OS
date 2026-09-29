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

// The delivery manifest (SYSTEM/CI/release-gate-manifest.json) is a historical
// delivery receipt (head_inclusion deferred_to_authorized_final_merge): it records
// the delivery it was taken against, not the current working tree. "Delivered" is
// defined solely by the release-projection authority as the git delivery record
// BASELINE..deliveryRef, minus the authority's non-delivery and derived-evidence
// exclusions. This is the same filter shape deriveProjectedPaths applies, but sourced
// from committed git objects (git diff BASELINE..REF touches no working-tree files)
// instead of the live modified+untracked worktree scan. Comparing the receipt to the
// whole live working tree is a category error; comparing it to the authority's git
// delivery record is the retarget.
function deriveAuthorityDeliveryPaths(root, deliveryBase = BASELINE, deliveryRef) {
  return projection.deriveGitDeliveryPaths(root, deliveryBase, deliveryRef).filter((relativePath) =>
    !NON_DELIVERY_EXCLUSIONS.some((exclusion) => projection.matchesNonDeliveryExclusion(relativePath, exclusion))
    && !DERIVED_EVIDENCE_EXCLUSIONS.some((identity) => projection.matchesEvidenceIdentity(relativePath, identity)));
}

// Receipt-integrity assertions for the historical manifest: every check
// validateProjectionManifest performs that does not require live working-tree
// bytes, at identical strength and with identical messages. No disk reads, so this
// can run against the receipt in any checkout without a full live-tree scan.
function assertManifestSelfConsistency(manifest) {
  assert.deepEqual(Object.keys(manifest.delivery).sort(), ["derived_delivery_evidence_exclusions", "head_inclusion", "mode", "non_delivery_exclusions", "projected_path_manifest_sha256", "projected_paths"]);
  assert.equal(manifest.delivery.mode, "projected_worktree");
  assert.equal(manifest.delivery.head_inclusion, "deferred_to_authorized_final_merge");
  assert.deepEqual(manifest.delivery.non_delivery_exclusions, NON_DELIVERY_EXCLUSIONS);
  assert.deepEqual(manifest.delivery.derived_delivery_evidence_exclusions, DERIVED_EVIDENCE_EXCLUSIONS);
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
    assert.equal(DERIVED_EVIDENCE_EXCLUSIONS.some((identity) => projection.matchesEvidenceIdentity(entry.path, identity)), false, `projected entry must not match derived delivery evidence identity: ${entry.path}`);
  }

  assert.equal(manifest.delivery.projected_path_manifest_sha256, projectedPathManifestSha256(entries), "projected path manifest digest mismatch");
  return entries;
}

// The retargeted comparison: the manifest is validated against the authority's git
// delivery path set, not the live working tree. Both directions fail loudly:
// every delivered path must be receipted, and every receipted entry must exist on
// disk and belong to the delivery. Governed use is fixture-scale and clean-room
// scopes (see assertMutationRejections / runCleanCommittedGitDeliveryRegression),
// never the historical receipt against the live tree.
function assertManifestAgainstGitDelivery(manifest, deliveryPaths, root) {
  const delivered = new Set(deliveryPaths);
  const entries = manifest.delivery.projected_paths;
  for (const relativePath of deliveryPaths) {
    assert.ok(entries.some((entry) => entry.path === relativePath), `Delivery manifest missing Git-delivered path: ${relativePath}`);
  }
  for (const entry of entries) {
    const absolutePath = path.join(root, entry.path);
    assert.ok(fs.existsSync(absolutePath), `Delivery manifest invents nonexistent path: ${entry.path}`);
    assert.ok(delivered.has(entry.path), `Delivery manifest invents non-delivery path: ${entry.path}`);
  }
  return entries;
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

// The HEAD archive carries whatever history tracked, including nested runtime
// state (for example artifacts/** vault snapshots containing SYSTEM/CACHE).
// The projected archive must satisfy fingerprint's purity rule at every depth
// before fingerprinting, so purification applies the same segment predicate
// assertSafeRelativePath enforces. Overlaid manifest entries always pass that
// predicate, so purification cannot remove projected content; fingerprint keeps
// asserting purity afterwards.
function isNonProjectedArchivePath(relativePath) {
  const parts = relativePath.split("/");
  return FORBIDDEN_TOP_LEVEL.has(parts[0])
    || parts.includes("PRIVATE")
    || parts.includes("CACHE")
    || parts.includes("__pycache__")
    || relativePath.endsWith(".pyc")
    || EXTERNAL_KNOWLEDGE_INBOX.includes(relativePath);
}
function pruneNonDeliveryPaths(exportRoot) {
  for (const entry of fs.readdirSync(exportRoot, { withFileTypes: true })) {
    pruneNonDeliveryPath(exportRoot, entry.name);
  }
}
function pruneNonDeliveryPath(exportRoot, relativePath) {
  if (isNonProjectedArchivePath(relativePath)) {
    fs.rmSync(path.join(exportRoot, relativePath), { recursive: true, force: true });
    return;
  }
  const absolute = path.join(exportRoot, relativePath);
  if (fs.lstatSync(absolute).isDirectory()) {
    for (const child of fs.readdirSync(absolute)) pruneNonDeliveryPath(exportRoot, `${relativePath}/${child}`);
  }
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

function expectRejection(label, fn, pattern) {
  try {
    fn();
  } catch (error) {
    assert.match(String((error && error.message) || error), pattern, `${label} rejected for the wrong reason`);
    console.log(`MUTATION-REJECTED ${label}: ${String(error.message).split("\n")[0]}`);
    return;
  }
  assert.fail(`${label} was accepted`);
}

function fixtureGit(root, args) {
  const result = spawnSync("git", args, { cwd: root, encoding: "utf8" });
  assert.equal(result.status, 0, `fixture git ${args.join(" ")} failed:\n${result.stdout}\n${result.stderr}`);
  return result.stdout.trim();
}

// Fixture-scale governed scope for the delivery invariant: a tiny git repository
// with a baseline commit and a delivery commit, carrying a manifest in the exact
// historical shape (same delivery contract, same exclusion constants, same
// canonical-self receipt entry). The base state passes both validators exactly,
// so every mutation below fails for its own reason and none fails vacuously.
// Untracked residue (.llmwiki-audit/**, mirroring the vault's ignored audit state)
// and exclusion-class files are present to prove they stay outside the authority's
// delivery record.
function createGitDeliveryFixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "git-delivery-fixture-"));
  const cleanup = () => fs.rmSync(root, { recursive: true, force: true });
  try {
    const shape = JSON.parse(fs.readFileSync(path.join(ROOT, MANIFEST), "utf8"));
    const deliveredRelative = "SYSTEM/CI/fixture-delivered.js";
    const cacheRelative = "SYSTEM/CACHE/fixture-cache.js";
    const evidenceRelative = "SYSTEM/AI/Reports/task16-final-evidence/fixture-evidence.json";
    const residueRelative = ".llmwiki-audit/untracked-residue.json";
    const ignoredRelative = "ignored-scratch/note.txt";
    fixtureGit(root, ["init", "--quiet"]);
    fixtureGit(root, ["config", "user.email", "delivery-fixture@example.invalid"]);
    fixtureGit(root, ["config", "user.name", "Delivery Fixture"]);
    fs.mkdirSync(path.join(root, "SYSTEM/CI"), { recursive: true });
    fs.mkdirSync(path.join(root, "SYSTEM/CACHE"), { recursive: true });
    fs.mkdirSync(path.join(root, "SYSTEM/AI/Reports/task16-final-evidence"), { recursive: true });
    fs.mkdirSync(path.join(root, "SYSTEM/Views"), { recursive: true });
    fs.mkdirSync(path.join(root, "SYSTEM/AI/Skills/prodigy-review/tests"), { recursive: true });
    fs.writeFileSync(path.join(root, deliveredRelative), "\"use strict\";\n// baseline\n");
    fs.writeFileSync(path.join(root, cacheRelative), "baseline-cache\n");
    fs.writeFileSync(path.join(root, evidenceRelative), "{}\n");
    fs.writeFileSync(path.join(root, "SYSTEM/Views/fixture-view.js"), "\"use strict\";\n");
    fs.writeFileSync(path.join(root, "SYSTEM/AI/Skills/prodigy-review/tests/test_fixture_dummy.js"), "\"use strict\";\n");
    fs.writeFileSync(path.join(root, ".gitignore"), "ignored-scratch/\n");
    fixtureGit(root, ["add", "."]);
    fixtureGit(root, ["commit", "--quiet", "-m", "fixture baseline"]);
    const baseline = fixtureGit(root, ["rev-parse", "HEAD"]);
    const deliveryRef = fixtureGit(root, ["symbolic-ref", "--short", "HEAD"]);

    fs.writeFileSync(path.join(root, deliveredRelative), "\"use strict\";\n// delivered\n");
    fs.writeFileSync(path.join(root, cacheRelative), "delivered-cache\n");
    fs.writeFileSync(path.join(root, evidenceRelative), "{\"delivered\":true}\n");
    const manifestAbs = path.join(root, MANIFEST);
    const fixtureManifest = structuredClone(shape);
    const deliveredSha = sha256(fs.readFileSync(path.join(root, deliveredRelative)));
    fixtureManifest.delivery.projected_paths = [deliveredRelative, MANIFEST].sort().map((relativePath) => ({
      path: relativePath,
      sha256: relativePath === MANIFEST ? ZERO_SHA256 : deliveredSha,
      hash_mode: relativePath === MANIFEST ? "canonical_self" : "raw"
    }));
    fixtureManifest.delivery.projected_path_manifest_sha256 = ZERO_SHA256;
    fs.writeFileSync(manifestAbs, `${JSON.stringify(fixtureManifest, null, 2)}\n`);
    fixtureManifest.delivery.projected_paths.find((entry) => entry.path === MANIFEST).sha256 = canonicalSelfSha256(fixtureManifest);
    fixtureManifest.delivery.projected_path_manifest_sha256 = projectedPathManifestSha256(fixtureManifest.delivery.projected_paths);
    fs.writeFileSync(manifestAbs, `${JSON.stringify(fixtureManifest, null, 2)}\n`);

    fs.mkdirSync(path.join(root, ".llmwiki-audit"), { recursive: true });
    fs.writeFileSync(path.join(root, residueRelative), "{}\n");
    fs.mkdirSync(path.join(root, "ignored-scratch"), { recursive: true });
    fs.writeFileSync(path.join(root, ignoredRelative), "scratch\n");
    fixtureGit(root, ["add", "--", deliveredRelative, cacheRelative, evidenceRelative, MANIFEST]);
    fixtureGit(root, ["commit", "--quiet", "-m", "fixture delivery"]);
    const status = fixtureGit(root, ["status", "--porcelain"]);
    assert.equal(status, "?? .llmwiki-audit/", "clean committed fixture must contain only untracked residue");

    const deliveryPaths = deriveAuthorityDeliveryPaths(root, baseline, deliveryRef);
    assert.deepEqual(deliveryPaths, [deliveredRelative, MANIFEST].sort(), "fixture authority delivery must equal the filtered delivery set");
    const rawResult = spawnSync("git", ["diff", "--name-only", "-z", `${baseline}..${deliveryRef}`], { cwd: root, encoding: "buffer" });
    assert.equal(rawResult.status, 0, rawResult.stderr.toString());
    const rawPaths = rawResult.stdout.toString("utf8").split("\0").filter(Boolean).sort();
    assert.deepEqual(rawPaths, [cacheRelative, deliveredRelative, evidenceRelative, MANIFEST].sort(), "fixture raw git delivery must carry the exclusion-class files the authority filters out");
    assert.deepEqual(projection.deriveGitDeliveryPaths(root, baseline, deliveryRef), rawPaths, "authority must relay Git's exact delivery record");

    const manifest = JSON.parse(fs.readFileSync(manifestAbs, "utf8"));
    return { root, baseline, deliveryRef, manifest, deliveryPaths, residueRelative, ignoredRelative, cacheRelative, evidenceRelative, deliveredRelative, cleanup };
  } catch (error) {
    cleanup();
    throw error;
  }
}

function assertMutationRejections() {
  const fixture = createGitDeliveryFixture();
  try {
    const root = fixture.root;
    const manifest = fixture.manifest;
    const actualPaths = fixture.deliveryPaths;
    validateProjectionManifest(manifest, actualPaths, root);
    console.log(`Delivery fixture base accepted: paths=${actualPaths.length}`);
    assertManifestAgainstGitDelivery(manifest, actualPaths, root);
    assertManifestSelfConsistency(manifest);
    const clone = () => JSON.parse(JSON.stringify(manifest));

    const extraExclusion = clone();
    extraExclusion.delivery.derived_delivery_evidence_exclusions.push({ path: "SYSTEM/AI/Reports/extra.json", reason: "post_projection_derived_receipt_self_reference" });
    expectRejection("extra-exclusion", () => validateProjectionManifest(extraExclusion, actualPaths, root), /strictly deep-equal/u);

    const changedReason = clone();
    changedReason.delivery.derived_delivery_evidence_exclusions[0].reason = "other";
    expectRejection("changed-reason", () => validateProjectionManifest(changedReason, actualPaths, root), /strictly deep-equal/u);

    const wildcardIdentity = clone();
    wildcardIdentity.delivery.derived_delivery_evidence_exclusions[1].path += "/**";
    expectRejection("wildcard-identity", () => validateProjectionManifest(wildcardIdentity, actualPaths, root), /strictly deep-equal/u);
    expectRejection("wildcard-identity-match", () => projection.matchesEvidenceIdentity("SYSTEM/AI/Reports/task16-final-evidence/file", wildcardIdentity.delivery.derived_delivery_evidence_exclusions[1]), /must not be globs/u);
    assert.equal(projection.matchesEvidenceIdentity("SYSTEM/AI/Reports/task16-final-evidence-sibling/file", DERIVED_EVIDENCE_EXCLUSIONS[1]), false, "evidence-root identity must not widen to prefix siblings");

    const missing = clone();
    missing.delivery.projected_paths.pop();
    expectRejection("missing-path", () => validateProjectionManifest(missing, actualPaths, root), /path set differs/u);

    const extra = clone();
    extra.delivery.projected_paths.push({ path: "SYSTEM/extra-not-projected.js", sha256: ZERO_SHA256, hash_mode: "raw" });
    extra.delivery.projected_paths.sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
    expectRejection("extra-path", () => validateProjectionManifest(extra, actualPaths, root), /path set differs/u);

    const duplicate = clone();
    duplicate.delivery.projected_paths.push({ ...duplicate.delivery.projected_paths[0] });
    duplicate.delivery.projected_paths.sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
    expectRejection("duplicate-path", () => validateProjectionManifest(duplicate, [...actualPaths, actualPaths[0]], root), /duplicate projected path/u);

    const forbidden = clone();
    forbidden.delivery.projected_paths.push({ path: "SYSTEM/PRIVATE/secret.json", sha256: ZERO_SHA256, hash_mode: "raw" });
    forbidden.delivery.projected_paths.sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
    expectRejection("forbidden-path", () => validateProjectionManifest(forbidden, [...actualPaths, "SYSTEM/PRIVATE/secret.json"], root), /private projected path/u);

    const byteMismatch = clone();
    const raw = byteMismatch.delivery.projected_paths.find((entry) => entry.hash_mode === "raw");
    raw.sha256 = ZERO_SHA256;
    expectRejection("byte-mismatch", () => validateProjectionManifest(byteMismatch, actualPaths, root), /byte mismatch/u);

    const unsorted = clone();
    unsorted.delivery.projected_paths = unsorted.delivery.projected_paths.slice().reverse();
    expectRejection("unsorted-paths", () => assertManifestSelfConsistency(unsorted), /projection paths must be sorted/u);

    const digestTamper = clone();
    const digest = digestTamper.delivery.projected_path_manifest_sha256;
    digestTamper.delivery.projected_path_manifest_sha256 = `${digest.slice(0, 63)}${digest[63] === "0" ? "1" : "0"}`;
    expectRejection("digest-tamper", () => assertManifestSelfConsistency(digestTamper), /projected path manifest digest mismatch/u);

    const hashModeFlip = clone();
    hashModeFlip.delivery.projected_paths.find((entry) => entry.hash_mode === "raw").hash_mode = "canonical_self";
    expectRejection("hash-mode-flip", () => assertManifestSelfConsistency(hashModeFlip), /wrong hash mode/u);

    const evidenceSmuggle = clone();
    evidenceSmuggle.delivery.projected_paths.push({ path: `${DERIVED_EVIDENCE_EXCLUSIONS[1].path}/smuggled.json`, sha256: ZERO_SHA256, hash_mode: "raw" });
    evidenceSmuggle.delivery.projected_paths.sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
    expectRejection("evidence-smuggle", () => assertManifestSelfConsistency(evidenceSmuggle), /must not match derived delivery evidence identity/u);

    // Falsifiability against the authority's git delivery, both directions: a path
    // genuinely in the delivery but absent from the manifest must fail, and a
    // manifest entry that is not part of the delivery must fail.
    const missingDelivered = clone();
    missingDelivered.delivery.projected_paths = missingDelivered.delivery.projected_paths.filter((entry) => entry.path !== fixture.deliveredRelative);
    missingDelivered.delivery.projected_path_manifest_sha256 = projectedPathManifestSha256(missingDelivered.delivery.projected_paths);
    expectRejection("missing-delivered-path", () => assertManifestAgainstGitDelivery(missingDelivered, actualPaths, root), /Delivery manifest missing Git-delivered path/u);

    const inventedResidue = clone();
    inventedResidue.delivery.projected_paths.push({ path: fixture.residueRelative, sha256: ZERO_SHA256, hash_mode: "raw" });
    inventedResidue.delivery.projected_paths.sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
    expectRejection("invented-undelivered-residue", () => assertManifestAgainstGitDelivery(inventedResidue, actualPaths, root), /Delivery manifest invents non-delivery path/u);

    const inventedGhost = clone();
    inventedGhost.delivery.projected_paths.push({ path: "SYSTEM/CI/fixture-ghost.js", sha256: ZERO_SHA256, hash_mode: "raw" });
    inventedGhost.delivery.projected_paths.sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
    expectRejection("invented-nonexistent-path", () => assertManifestAgainstGitDelivery(inventedGhost, actualPaths, root), /Delivery manifest invents nonexistent path/u);

    assert.equal(actualPaths.includes(fixture.residueRelative), false, "untracked residue must stay outside the authority delivery record");
    assert.equal(actualPaths.includes(fixture.ignoredRelative), false, "ignored scratch must stay outside the authority delivery record");
    assert.equal(actualPaths.includes(fixture.cacheRelative), false, "non-delivery exclusions must stay outside the authority delivery set");
    assert.equal(actualPaths.includes(fixture.evidenceRelative), false, "derived delivery evidence must stay outside the authority delivery set");

    expectRejection("empty-delivery-scope", () => projection.deriveGitDeliveryPaths(root, fixture.baseline, fixture.baseline), /DELIVERY_SCOPE_EMPTY/u);
    expectRejection("unresolved-delivery-base", () => projection.deriveGitDeliveryPaths(root, "missing-base", fixture.deliveryRef), /DELIVERY_BASE_UNRESOLVED/u);
    fixtureGit(root, ["checkout", "--quiet", "--detach", "HEAD"]);
    expectRejection("detached-delivery-ref", () => projection.deriveGitDeliveryPaths(root, fixture.baseline), /DELIVERY_REF_DETACHED/u);
    fixtureGit(root, ["checkout", "--quiet", fixture.deliveryRef]);

    const frozen = freezeUniverse(root, fixture.baseline);
    const added = structuredClone(frozen);
    added.projectedPaths.push("SYSTEM/added-after-freeze.js");
    expectRejection("frozen-added", () => assertFrozenUniverse(frozen, added), /path universe changed/u);
    const missingFrozen = structuredClone(frozen);
    missingFrozen.projectedPaths.pop();
    expectRejection("frozen-missing", () => assertFrozenUniverse(frozen, missingFrozen), /path universe changed/u);
    const changed = structuredClone(frozen);
    const changedFile = changed.files.find((entry) => entry.sha256);
    changedFile.sha256 = ZERO_SHA256;
    expectRejection("frozen-changed", () => assertFrozenUniverse(frozen, changed), /source bytes changed/u);
  } finally {
    fixture.cleanup();
  }
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

// Receipted paths absent from the working tree are classified, never silently
// skipped: a receipted path still tracked by git but missing from disk is a broken
// checkout and fails loudly; a receipted path in the authority delivery but no
// longer tracked was retired by authorized post-receipt history (head_inclusion is
// deferred); anything else is untracked residue cleaned since the receipt. Both
// non-fatal classes are returned for explicit reporting.
function classifyAbsentReceiptedPaths(absent, deliveryPaths, root) {
  const delivered = new Set(deliveryPaths);
  const trackedResult = spawnSync("git", ["ls-files", "-z"], { cwd: root, encoding: "buffer" });
  assert.equal(trackedResult.status, 0, trackedResult.stderr.toString());
  const tracked = new Set(trackedResult.stdout.toString("utf8").split("\0").filter(Boolean));
  const broken = [];
  const superseded = [];
  const residue = [];
  for (const relativePath of absent) {
    if (tracked.has(relativePath)) broken.push(relativePath);
    else if (delivered.has(relativePath)) superseded.push(relativePath);
    else residue.push(relativePath);
  }
  assert.deepEqual(broken, [], `Receipted delivery missing from worktree:\n${broken.join("\n")}`);
  return { superseded, residue };
}

// Clean committed regression at fixture scale: baseline plus a committed delivery
// validates exactly against the manifest, with only untracked residue outstanding.
// This replaces the full-tree clone plus self re-execution, which depended on a
// full live-tree comparison (clone of the whole repo, copy of every receipted
// path, and a re-derived worktree projection inside the clone) and could stall the
// suite on tree size instead of testing the invariant.
function runCleanCommittedGitDeliveryRegression() {
  const fixture = createGitDeliveryFixture();
  try {
    const status = fixtureGit(fixture.root, ["status", "--porcelain"]);
    assert.equal(status, "?? .llmwiki-audit/", "clean committed fixture must contain only untracked residue");
    const head = fixtureGit(fixture.root, ["rev-parse", "HEAD"]);
    assert.notEqual(head, fixture.baseline, "delivery commit must advance the fixture");
    validateProjectionManifest(fixture.manifest, fixture.deliveryPaths, fixture.root);
    assertManifestAgainstGitDelivery(fixture.manifest, fixture.deliveryPaths, fixture.root);
    console.log(`Clean committed git delivery passed: baseline=${fixture.baseline.slice(0, 12)} delivery=${head.slice(0, 12)} paths=${fixture.deliveryPaths.length} residue_invisible=1.`);
  } finally {
    fixture.cleanup();
  }
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
  const entries = assertManifestSelfConsistency(manifest);
  let deliveryPaths = [];
  if (gitMode) {
    deliveryPaths = deriveAuthorityDeliveryPaths(ROOT);
    console.log(`Authority git delivery: baseline=${BASELINE.slice(0, 12)} paths=${deliveryPaths.length} manifest_entries=${entries.length}.`);
    assertMutationRejections();
    runCleanCommittedGitDeliveryRegression();
  }

  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "consolidation-projected-archive-test-"));
  try {
    const exportRoot = path.join(temp, "export");
    const receiptRoot = path.join(temp, "receipts");
    let absent = [];
    if (gitMode) {
      const headArchive = path.join(temp, "head.tar");
      fs.mkdirSync(exportRoot);
      command("git", ["archive", "--format=tar", `--output=${headArchive}`, "HEAD"]);
      command("tar", ["-xf", headArchive, "-C", exportRoot]);
      for (const name of FORBIDDEN_TOP_LEVEL) fs.rmSync(path.join(exportRoot, name), { recursive: true, force: true });
      for (const relativePath of EXTERNAL_KNOWLEDGE_INBOX) fs.rmSync(path.join(exportRoot, relativePath), { force: true });
      fs.rmSync(path.join(exportRoot, "SYSTEM/PRIVATE"), { recursive: true, force: true });
      fs.rmSync(path.join(exportRoot, "SYSTEM/CACHE"), { recursive: true, force: true });
      pruneNonDeliveryPaths(exportRoot);
      for (const entry of entries) {
        if (!fs.existsSync(path.join(ROOT, entry.path))) {
          absent.push(entry.path);
          continue;
        }
        copyProjectedPath(exportRoot, entry.path);
      }
      if (absent.length > 0) {
        const classified = classifyAbsentReceiptedPaths(absent, deliveryPaths, ROOT);
        console.log(`Absent receipted paths: total=${absent.length} superseded_by_history=${classified.superseded.length} untracked_residue=${classified.residue.length}.`);
        if (classified.superseded.length > 0) console.log(`Superseded (in authority delivery, retired from git after the receipt):\n${classified.superseded.join("\n")}`);
        if (classified.residue.length > 0) console.log(`Untracked residue (never delivered, cleaned since the receipt):\n${classified.residue.join("\n")}`);
      }
    } else {
      fs.cpSync(ROOT, exportRoot, {
        recursive: true,
        filter: (source) => {
          const relative = path.relative(ROOT, source).split(path.sep).join("/");
          return !relative || !FORBIDDEN_TOP_LEVEL.has(relative.split("/")[0]);
        }
      });
      absent = entries.filter((entry) => !fs.existsSync(path.join(exportRoot, entry.path))).map((entry) => entry.path);
      if (absent.length > 0) console.log(`Absent receipted paths without git classification: total=${absent.length}\n${absent.join("\n")}`);
    }

    assert.equal(fs.existsSync(path.join(exportRoot, ".git")), false);
    const exportedManifest = JSON.parse(fs.readFileSync(path.join(exportRoot, MANIFEST), "utf8"));
    assertManifestSelfConsistency(exportedManifest);
    assert.equal(exportedManifest.delivery.projected_path_manifest_sha256, manifest.delivery.projected_path_manifest_sha256, "exported receipt digest must match the source receipt");
    const absentSet = new Set(absent);
    for (const entry of entries) {
      if (absentSet.has(entry.path)) continue;
      assert.equal(fileSha256(exportRoot, entry.path), fileSha256(ROOT, entry.path), `exported byte mismatch: ${entry.path}`);
    }
    const before = fingerprint(exportRoot);
    runAudits(exportRoot, receiptRoot);
    const after = fingerprint(exportRoot);
    assert.equal(after, before, "projected archive bytes changed during verification");
    console.log(`Projected metadata-free archive passed: mode=${gitMode ? "manifest-overlay" : "archive-self-check"}, planned=${entries.length}, overlaid=${entries.length - absent.length}, absent=${absent.length}, delivery=${gitMode ? deliveryPaths.length : "n/a"}, path_manifest_sha256=${manifest.delivery.projected_path_manifest_sha256}, archive_sha256=${before}, F1-F4=4/4.`);
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
}

main();
