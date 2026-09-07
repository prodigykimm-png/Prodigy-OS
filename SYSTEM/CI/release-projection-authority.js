"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const BASELINE = "e82aebecee1ac0d3b12c288d147216ec6ec939d7";
const MANIFEST_RELATIVE = "SYSTEM/CI/release-gate-manifest.json";
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
const DERIVED_EVIDENCE_EXCLUSIONS = Object.freeze([
  Object.freeze({ path: "SYSTEM/AI/Reports/task16-final-release-receipt.json", identity_type: "file", reason: "post_projection_derived_receipt_self_reference" }),
  Object.freeze({ path: "SYSTEM/AI/Reports/task16-final-evidence", identity_type: "evidence_root", reason: "post_projection_retained_authoritative_evidence" }),
  Object.freeze({ path: "SYSTEM/AI/Reports/final/F4", identity_type: "evidence_root", reason: "post_projection_f4_qualifier_evidence" })
]);

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}
function fileSha256(root, relativePath) {
  return sha256(fs.readFileSync(path.join(root, relativePath)));
}
function gitPaths(root, args) {
  const result = spawnSync("git", args, { cwd: root, encoding: "buffer" });
  assert.equal(result.status, 0, result.stderr.toString());
  return result.stdout.toString("utf8").split("\0").filter(Boolean);
}
function matchesNonDeliveryExclusion(relativePath, exclusion) {
  if (exclusion.startsWith("**/*.")) return relativePath.endsWith(exclusion.slice(4));
  return relativePath === exclusion || relativePath.startsWith(`${exclusion}/`);
}
function matchesEvidenceIdentity(relativePath, identity) {
  assert.ok(identity && ["file", "evidence_root"].includes(identity.identity_type), "invalid generated-evidence identity");
  assert.equal(identity.path.includes("*"), false, "generated-evidence identities must not be globs");
  return identity.identity_type === "file"
    ? relativePath === identity.path
    : relativePath.startsWith(`${identity.path}/`);
}
function deriveTaskOwnedPaths(root) {
  const paths = [...new Set([
    ...gitPaths(root, ["diff", "--name-only", "-z", BASELINE, "--"]),
    ...gitPaths(root, ["ls-files", "--others", "--exclude-standard", "-z"])
  ])];
  return paths.filter((relativePath) => !EXTERNAL_KNOWLEDGE_INBOX.includes(relativePath)).sort();
}
function deriveProjectedPaths(root) {
  return deriveTaskOwnedPaths(root).filter((relativePath) =>
    !NON_DELIVERY_EXCLUSIONS.some((exclusion) => matchesNonDeliveryExclusion(relativePath, exclusion))
    && !DERIVED_EVIDENCE_EXCLUSIONS.some((identity) => matchesEvidenceIdentity(relativePath, identity)));
}
function discoverGateFiles(root) {
  const groups = [
    ["view_syntax_files", "SYSTEM/Views", (name) => name.endsWith(".js")],
    ["javascript_suite_files", "SYSTEM/AI/Skills/prodigy-review/tests", (name) => name.startsWith("test_") && name.endsWith(".js")],
    ["python_suite_files", "SYSTEM/AI/Skills/prodigy-review/tests", (name) => name.startsWith("test_") && name.endsWith(".py")]
  ];
  const result = {};
  function walk(directory, relativeRoot, predicate, output) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const absolute = path.join(directory, entry.name);
      const relative = `${relativeRoot}/${entry.name}`;
      if (entry.isDirectory()) walk(absolute, relative, predicate, output);
      else if (entry.isFile() && predicate(entry.name)) output.push(relative);
    }
  }
  for (const [key, relativeRoot, predicate] of groups) {
    const files = [];
    walk(path.join(root, relativeRoot), relativeRoot, predicate, files);
    result[key] = files;
  }
  return result;
}
function discoveryCounts(discovery) {
  return Object.fromEntries(Object.entries(discovery).map(([key, files]) => [key, files.length]));
}
function freezeUniverse(root) {
  const projectedPaths = deriveProjectedPaths(root);
  const files = projectedPaths.map((relativePath) => ({
    path: relativePath,
    sha256: relativePath === MANIFEST_RELATIVE ? null : fileSha256(root, relativePath)
  }));
  const discovery = discoverGateFiles(root);
  const discoveryFiles = Object.fromEntries(Object.entries(discovery).map(([key, paths]) => [key, paths.map((relativePath) => ({ path: relativePath, sha256: fileSha256(root, relativePath) }))]));
  return { projectedPaths, files, discoveryFiles };
}
function assertFrozenUniverse(expected, actual) {
  assert.deepEqual(actual.projectedPaths, expected.projectedPaths, "projection source path universe changed during generation");
  assert.deepEqual(actual.files, expected.files, "projection source bytes changed during generation");
  assert.deepEqual(actual.discoveryFiles, expected.discoveryFiles, "release discovery universe changed during generation");
}
function normalizedSelfManifest(manifest) {
  const normalized = structuredClone(manifest);
  normalized.delivery.projected_path_manifest_sha256 = ZERO_SHA256;
  const self = normalized.delivery.projected_paths.find((entry) => entry.path === MANIFEST_RELATIVE);
  assert.ok(self, "projection manifest must own itself");
  self.sha256 = ZERO_SHA256;
  return normalized;
}
function canonicalSelfSha256(manifest) {
  return sha256(`${JSON.stringify(normalizedSelfManifest(manifest), null, 2)}\n`);
}
function projectedPathManifestSha256(entries) {
  return sha256(entries.map((entry) => `${entry.path}\0${entry.hash_mode}\0${entry.sha256}\n`).join(""));
}
function buildManifest(currentManifest, universe) {
  const manifest = structuredClone(currentManifest);
  manifest.discovery = discoveryCounts(Object.fromEntries(Object.entries(universe.discoveryFiles).map(([key, entries]) => [key, entries.map((entry) => entry.path)])));
  manifest.total_commands = Object.values(manifest.fixed_commands).reduce((sum, value) => sum + value, 0)
    + Object.values(manifest.discovery).reduce((sum, value) => sum + value, 0);
  const hashes = new Map(universe.files.map((entry) => [entry.path, entry.sha256]));
  manifest.delivery = {
    mode: "projected_worktree",
    head_inclusion: "deferred_to_authorized_final_merge",
    non_delivery_exclusions: [...NON_DELIVERY_EXCLUSIONS],
    derived_delivery_evidence_exclusions: DERIVED_EVIDENCE_EXCLUSIONS.map((entry) => ({ ...entry })),
    projected_path_manifest_sha256: ZERO_SHA256,
    projected_paths: universe.projectedPaths.map((relativePath) => ({
      path: relativePath,
      sha256: relativePath === MANIFEST_RELATIVE ? ZERO_SHA256 : hashes.get(relativePath),
      hash_mode: relativePath === MANIFEST_RELATIVE ? "canonical_self" : "raw"
    }))
  };
  manifest.delivery.projected_paths.find((entry) => entry.path === MANIFEST_RELATIVE).sha256 = canonicalSelfSha256(manifest);
  manifest.delivery.projected_path_manifest_sha256 = projectedPathManifestSha256(manifest.delivery.projected_paths);
  return manifest;
}

module.exports = {
  BASELINE,
  DERIVED_EVIDENCE_EXCLUSIONS,
  EXTERNAL_KNOWLEDGE_INBOX,
  MANIFEST_RELATIVE,
  NON_DELIVERY_EXCLUSIONS,
  ZERO_SHA256,
  assertFrozenUniverse,
  buildManifest,
  canonicalSelfSha256,
  deriveProjectedPaths,
  discoverGateFiles,
  discoveryCounts,
  fileSha256,
  freezeUniverse,
  matchesEvidenceIdentity,
  matchesNonDeliveryExclusion,
  projectedPathManifestSha256,
  sha256
};
