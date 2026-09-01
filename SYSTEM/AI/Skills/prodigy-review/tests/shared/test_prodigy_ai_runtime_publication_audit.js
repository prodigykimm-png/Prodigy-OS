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
const RECEIPT_PATH = path.join(
  DUSK_ROOT,
  "SYSTEM/docs/Prodigy_AI_Runtime_Publication_Receipt_v1.json",
);
const DIST = path.join(RUNTIME_ROOT, "dist");

function run(command, args, options = {}) {
  const result = cp.spawnSync(command, args, {
    encoding: "utf8",
    timeout: 60000,
    ...options,
  });
  if (result.error || result.status !== 0) {
    throw new Error((result.error && result.error.message) || result.stderr || String(result.status));
  }
  return result.stdout.trim();
}

function sha256(file) {
  return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

test("published v0.1.0 is bound to GitHub, hosted CI, and byte-identical assets", {
  timeout: 120000,
}, () => {
  assert.equal(fs.existsSync(RECEIPT_PATH), true, "publication receipt must exist");
  const receipt = readJson(RECEIPT_PATH);
  assert.equal(receipt.schema_version, "prodigy_ai_runtime_publication_receipt_v1");
  assert.equal(receipt.status, "pass");
  assert.equal(receipt.approval, "administrator_approved");
  assert.equal(receipt.repository.name_with_owner, "prodigykimm-png/prodigy-ai-runtime");
  assert.equal(receipt.repository.visibility, "PRIVATE");
  assert.equal(receipt.repository.default_branch, "main");
  assert.equal(receipt.repository.license, null);
  assert.equal(receipt.repository.history_commits, 7);
  assert.equal(receipt.repository.published_commit,
    "d4380537a4a1766b21cc7540a57ba9ee270ef635");
  if (receipt.repository.published_author_email.endsWith(".local")) {
    assert.equal(receipt.repository.visibility, "PRIVATE");
  }
  assert.equal(receipt.publication.tag, "v0.1.0");
  assert.equal(receipt.publication.tag_kind, "annotated");
  assert.equal(receipt.publication.tag_signed, false);
  assert.equal(receipt.publication.platform_immutable, false);
  assert.equal(receipt.publication.replacement_policy, "forbidden_new_version_required");
  assert.equal(receipt.hosted_ci.workflow, "Verify release");
  assert.equal(receipt.hosted_ci.conclusion, "success");
  assert.equal(receipt.hosted_ci.head_sha, receipt.repository.published_commit);
  assert.equal(receipt.hosted_ci.event, "push");
  assert.equal(receipt.hosted_ci.head_branch, receipt.repository.default_branch);
  assert.equal(receipt.hosted_ci.attempt, 1);
  assert.equal(receipt.verification.downloaded_asset_byte_identity, true);
  assert.equal(receipt.verification.real_obsidian_tests.passed, 2);
  assert.equal(receipt.verification.real_obsidian_tests.failed, 0);
  assert.equal(receipt.verification.project_fail_closed, true);
  assert.equal(receipt.verification.download_root_removed, true);
  assert.deepEqual(receipt.security, {
    secret_value_hits: 0,
    prompt_response_hits: 0,
    raw_stdout_stderr_hits: 0,
    source_canonical_writes: 0,
    browser_network_attempts: 0,
    os_network_attempts: 0,
    temporary_artifact_residue: 0,
    synthetic_residue_hits: 0,
  });
  assert.deepEqual(receipt.revocation, {
    replace_published_assets: false,
    delete_release_requires_new_approval: true,
    delete_tag_requires_new_approval: true,
    delete_repository_requires_new_approval: true,
    remediation: "publish_new_version_and_deprecate_v0.1.0",
  });

  assert.equal(run("git", ["-C", RUNTIME_ROOT, "rev-parse", "HEAD"]),
    receipt.repository.published_commit);
  assert.equal(run("git", ["-C", RUNTIME_ROOT, "status", "--porcelain"]), "");
  assert.equal(run("git", ["-C", RUNTIME_ROOT, "remote", "get-url", "origin"]),
    receipt.repository.remote_url);
  assert.equal(run("git", ["-C", RUNTIME_ROOT, "rev-list", "--count", "HEAD"]),
    String(receipt.repository.history_commits));

  const repository = readJsonFromCommand("gh", [
    "repo", "view", receipt.repository.name_with_owner,
    "--json", "nameWithOwner,visibility,defaultBranchRef,licenseInfo,url",
  ]);
  assert.equal(repository.nameWithOwner, receipt.repository.name_with_owner);
  assert.equal(repository.visibility, receipt.repository.visibility);
  assert.equal(repository.defaultBranchRef.name, receipt.repository.default_branch);
  assert.equal(repository.licenseInfo, null);
  assert.equal(repository.url, receipt.repository.url);
  assert.equal(run("gh", [
    "api",
    `repos/${receipt.repository.name_with_owner}/commits/${receipt.repository.default_branch}`,
    "--jq",
    ".sha",
  ]), receipt.repository.published_commit);

  const tagRef = readJsonFromCommand("gh", [
    "api",
    `repos/${receipt.repository.name_with_owner}/git/ref/tags/${receipt.publication.tag}`,
  ]);
  assert.equal(tagRef.object.type, "tag");
  assert.equal(tagRef.object.sha, receipt.publication.tag_object);
  const annotatedTag = readJsonFromCommand("gh", [
    "api",
    `repos/${receipt.repository.name_with_owner}/git/tags/${tagRef.object.sha}`,
  ]);
  assert.equal(annotatedTag.object.type, "commit");
  assert.equal(annotatedTag.object.sha, receipt.repository.published_commit);

  const workflow = readJsonFromCommand("gh", [
    "run", "view", String(receipt.hosted_ci.run_id),
    "--repo", receipt.repository.name_with_owner,
    "--json",
    "attempt,conclusion,databaseId,event,headBranch,headSha,name,status,url,workflowDatabaseId",
  ]);
  assert.equal(workflow.databaseId, receipt.hosted_ci.run_id);
  assert.equal(workflow.name, receipt.hosted_ci.workflow);
  assert.equal(workflow.status, "completed");
  assert.equal(workflow.conclusion, receipt.hosted_ci.conclusion);
  assert.equal(workflow.event, receipt.hosted_ci.event);
  assert.equal(workflow.headBranch, receipt.hosted_ci.head_branch);
  assert.equal(workflow.headSha, receipt.hosted_ci.head_sha);
  assert.equal(workflow.attempt, receipt.hosted_ci.attempt);
  assert.equal(workflow.workflowDatabaseId, receipt.hosted_ci.workflow_database_id);
  assert.equal(workflow.url, receipt.hosted_ci.url);

  const release = readJsonFromCommand("gh", [
    "release", "view", receipt.publication.tag,
    "--repo", receipt.repository.name_with_owner,
    "--json", "assets,isDraft,isPrerelease,tagName,url",
  ]);
  assert.equal(release.tagName, receipt.publication.tag);
  assert.equal(release.isDraft, false);
  assert.equal(release.isPrerelease, false);
  assert.equal(release.url, receipt.publication.release_url);
  assert.deepEqual(release.assets.map((asset) => asset.name).sort(),
    receipt.publication.assets.map((asset) => asset.name).sort());
  for (const asset of receipt.publication.assets) {
    const hosted = release.assets.find((candidate) => candidate.name === asset.name);
    assert.equal(hosted.size, asset.bytes, `${asset.name} hosted size`);
    assert.equal(hosted.digest, `sha256:${asset.sha256}`, `${asset.name} hosted digest`);
  }
  const releaseRecord = readJsonFromCommand("gh", [
    "api",
    `repos/${receipt.repository.name_with_owner}/releases/tags/${receipt.publication.tag}`,
  ]);
  assert.equal(releaseRecord.id, receipt.publication.release_id);
  assert.equal(releaseRecord.node_id, receipt.publication.release_node_id);
  assert.equal(releaseRecord.created_at, receipt.publication.created_at);
  assert.equal(releaseRecord.published_at, receipt.publication.published_at);
  assert.equal(releaseRecord.updated_at, receipt.publication.updated_at);
  assert.equal(releaseRecord.immutable, receipt.publication.platform_immutable);

  const downloadRoot = fs.mkdtempSync(path.join(os.tmpdir(), "prodigy-publication-assets-"));
  try {
    run("gh", [
      "release", "download", receipt.publication.tag,
      "--repo", receipt.repository.name_with_owner,
      "--dir", downloadRoot,
    ]);
    assert.deepEqual(
      fs.readdirSync(downloadRoot).sort(),
      receipt.publication.assets.map((asset) => asset.name).sort(),
    );
    for (const asset of receipt.publication.assets) {
      const downloaded = path.join(downloadRoot, asset.name);
      const local = path.join(DIST, asset.name);
      assert.equal(fs.readFileSync(downloaded).equals(fs.readFileSync(local)), true, asset.name);
      assert.equal(sha256(downloaded), asset.sha256);
      assert.equal(fs.statSync(downloaded).size, asset.bytes);
    }
  } finally {
    fs.rmSync(downloadRoot, { recursive: true, force: true });
    assert.equal(fs.existsSync(downloadRoot), false, "download root must be removed");
  }
});

function readJsonFromCommand(command, args) {
  return JSON.parse(run(command, args));
}
