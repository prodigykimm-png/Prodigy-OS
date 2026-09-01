#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const cp = require("node:child_process");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { test } = require("node:test");

const DUSK_ROOT = path.resolve(__dirname, "../../../../../..");
const RUNTIME_ROOT = path.resolve(String(process.env.PRODIGY_RUNTIME_ROOT
  || path.join(os.homedir(), "Developer/prodigy-ai-runtime")));
const AUDIT_PATH = path.join(DUSK_ROOT, "SYSTEM/docs/Prodigy_AI_Runtime_Local_Release_Audit_v0.1.json");
const DIST = path.join(RUNTIME_ROOT, "dist");

function run(command, args, options = {}) {
  const result = cp.spawnSync(command, args, { encoding: "utf8", timeout: 30000, ...options });
  if (result.error || result.status !== 0) {
    throw new Error((result.error && result.error.message) || result.stderr || String(result.status));
  }
  return result.stdout.trim();
}

function sha256(file) {
  return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}

test("local release audit is bound to final Git and artifact source truth", () => {
  const audit = JSON.parse(fs.readFileSync(AUDIT_PATH, "utf8"));
  const receiptPath = path.join(DIST, "prodigy-ai-runtime-0.1.0.json");
  const archivePath = path.join(DIST, audit.release.archive.file);
  const sidecarPath = `${archivePath}.sha256`;
  const receipt = JSON.parse(fs.readFileSync(receiptPath, "utf8"));
  assert.equal(audit.status, "pass");
  assert.equal(run("git", ["-C", RUNTIME_ROOT, "rev-parse", "HEAD"]),
    audit.source_truth.plugin_closure_commit);
  assert.equal(run("git", ["-C", RUNTIME_ROOT, "status", "--porcelain"]), "");
  run("git", ["-C", RUNTIME_ROOT, "cat-file", "-e", `${audit.source_truth.plugin_release_commit}^{commit}`]);
  run("git", ["-C", DUSK_ROOT, "cat-file", "-e", `${audit.source_truth.dusk_release_acceptance_commit}^{commit}`]);
  assert.equal(audit.release.receipt_sha256, sha256(receiptPath));
  assert.equal(audit.release.archive.sha256, sha256(archivePath));
  assert.equal(audit.release.archive.bytes, fs.statSync(archivePath).size);
  assert.equal(fs.readFileSync(sidecarPath, "utf8"),
    `${audit.release.archive.sha256}  ${audit.release.archive.file}\n`);
  assert.deepEqual(run("unzip", ["-Z1", archivePath]).split(/\r?\n/u), receipt.release.files);
  assert.deepEqual(audit.release.file_sha256, receipt.file_sha256);
  assert.equal(audit.verification.plugin_and_release_tests.passed, 35);
  assert.equal(audit.verification.plugin_and_release_tests.failed, 0);
  assert.equal(audit.verification.real_obsidian_tests.passed, 2);
  assert.equal(audit.verification.real_obsidian_tests.failed, 0);
  assert.equal(audit.verification.source_canonical_writes, 0);
  assert.equal(audit.verification.secret_value_artifact_hits, 0);
  assert.equal(audit.verification.prompt_response_diagnostic_hits, 0);
  assert.equal(audit.verification.temporary_artifact_residue, 0);
  assert.equal(audit.verification.synthetic_residue_hits, 0);
  assert.equal(audit.verification.installer_transaction_residue, 0);
  assert.equal(audit.verification.main_vault_grants, 0);
});
