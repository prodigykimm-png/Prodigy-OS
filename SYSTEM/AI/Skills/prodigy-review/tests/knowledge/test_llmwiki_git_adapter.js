"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { test } = require("node:test");

const ROOT = path.resolve(__dirname, "../../../../../..");
const MODULE_PATH = path.join(ROOT, "SYSTEM/Views/llmwiki-git-adapter.js");
const hash = (bytes) => crypto.createHash("sha256").update(bytes, "utf8").digest("hex");
const boundaryPolicy = require(path.join(ROOT, "SYSTEM/Views/llmwiki-write-boundary-policy.js"));

function git(root, args, options = {}) {
  return execFileSync("git", ["-C", root, ...args], { encoding: "utf8", ...options }).trim();
}

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "llmwiki-git-adapter-"));
  git(root, ["init", "--quiet"]);
  git(root, ["config", "user.name", "LLMWiki Fixture"]);
  git(root, ["config", "user.email", "fixture@example.test"]);
  fs.writeFileSync(path.join(root, "README.md"), "fixture\n", "utf8");
  git(root, ["add", "README.md"]);
  git(root, ["commit", "--quiet", "-m", "fixture base"]);
  return root;
}

function write(root, relative, bytes) {
  const target = path.join(root, relative);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, bytes, "utf8");
}

function receipt(root, identity = "run_fixture:1:operation_fixture") {
  const canonical = "ZETA/PERMANENT/fixture.md";
  const audit = `.llmwiki-audit/immutable/${"a".repeat(64)}.json`;
  write(root, canonical, "approved canonical bytes\n");
  write(root, audit, "immutable audit bytes\n");
  return {
    identity,
    operation_id: "operation_fixture",
    run_id: "run_fixture",
    run_revision: 1,
    paths: [canonical, audit],
    expected_hashes: {
      [canonical]: hash("approved canonical bytes\n"),
      [audit]: hash("immutable audit bytes\n"),
    },
  };
}

function gateway(options) {
  delete require.cache[MODULE_PATH];
  return require(MODULE_PATH).create(options);
}

test("temporary index snapshot commits exact approved paths without normal-index leakage", async (t) => {
  const root = fixture();
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  write(root, "unrelated-staged.md", "staged\n");
  git(root, ["add", "unrelated-staged.md"]);
  write(root, "unrelated-dirty.md", "dirty\n");
  const before = { index: git(root, ["write-tree"]) };
  const item = receipt(root);
  const api = gateway({ rootDir: root });

  assert.equal((await api.capability()).ok, true);
  assert.equal((await api.verifySafeSync()).ok, true);
  const snapshot = await api.snapshot({ ...item, message: "LLM Wiki 승인 기록: operation_fixture", push: false });
  assert.equal(snapshot.ok, true, JSON.stringify(snapshot));
  assert.equal(snapshot.receipt.pushed, false);
  assert.deepEqual(snapshot.receipt.paths, item.paths);
  assert.equal(git(root, ["write-tree"]), before.index);
  const preserved = git(root, ["status", "--porcelain"]);
  assert.equal(preserved.includes("A  unrelated-staged.md"), true);
  assert.equal(preserved.includes("?? unrelated-dirty.md"), true);
  assert.deepEqual(git(root, ["show", "--format=", "--name-only", snapshot.receipt.commit_id]).split("\n").filter(Boolean).sort(), item.paths.slice().sort());
  assert.equal(git(root, ["log", "-1", "--format=%B", snapshot.receipt.commit_id]).includes("LLMWiki-Run: run_fixture#1"), true);
  assert.equal(git(root, ["log", "-1", "--format=%B", snapshot.receipt.commit_id]).includes("LLMWiki-Identity: run_fixture:1:operation_fixture"), true);
  const retry = await api.snapshot({ ...item, message: "LLM Wiki 승인 기록: operation_fixture", push: false });
  assert.equal(retry.receipt.commit_id, snapshot.receipt.commit_id);
});

test("existing-commit lookup rejects spoofed or malformed identity trailers and accepts only the exact rendered block", async (t) => {
  const root = fixture();
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const api = gateway({ rootDir: root });
  const canonical = "ZETA/PERMANENT/정확한 조회 원칙 (2).md";
  const audit = `.llmwiki-audit/immutable/${"b".repeat(64)}.json`;
  const cases = [
    ["run_spoof:1:operation_spoof", "spoof\n\nLLMWiki-Run: run_spoof#1\nLLMWiki-Operation: operation_spoof\nX-LLMWiki-Identity: run_spoof:1:operation_spoof\nLLMWiki-Paths: ZETA/PERMANENT/spoof.md"],
    ["run_duplicate:1:operation_duplicate", "duplicate\n\nLLMWiki-Run: run_duplicate#1\nLLMWiki-Operation: operation_duplicate\nLLMWiki-Identity: run_duplicate:1:operation_duplicate\nLLMWiki-Identity: run_duplicate:1:operation_duplicate\nLLMWiki-Paths: ZETA/PERMANENT/duplicate.md"],
    ["run_extra:1:operation_extra", "extra\n\nLLMWiki-Run: run_extra#1\nLLMWiki-Operation: operation_extra\nLLMWiki-Identity: run_extra:1:operation_extra\nLLMWiki-Paths: ZETA/PERMANENT/extra.md\nUntrusted-Trailer: attacker"],
    ["run_missing:1:operation_missing", "missing\n\nLLMWiki-Run: run_missing#1\nLLMWiki-Operation: operation_missing\nLLMWiki-Identity: run_missing:1:operation_missing"],
    ["run_reordered:1:operation_reordered", "reordered\n\nLLMWiki-Operation: operation_reordered\nLLMWiki-Run: run_reordered#1\nLLMWiki-Identity: run_reordered:1:operation_reordered\nLLMWiki-Paths: ZETA/PERMANENT/reordered.md"],
  ];
  const malformedCommitIds = new Map();
  for (const [identity, message] of cases) {
    git(root, ["commit", "--quiet", "--allow-empty", "-m", message]);
    malformedCommitIds.set(identity, git(root, ["rev-parse", "HEAD"]));
    assert.equal(await api.lookup(identity), null, identity);
  }

  write(root, canonical, "lookup canonical\n");
  write(root, audit, "lookup audit\n");
  git(root, ["add", "--", canonical, audit]);
  const rendered = boundaryPolicy.renderTrustedCommitMessage({
    subject: "LLM Wiki 승인 기록: 정확한 조회", run_id: "run_lookup", run_revision: 1,
    operation_id: "operation_lookup", identity: "run_lookup:1:operation_lookup", paths: [canonical, audit],
  });
  assert.equal(rendered.ok, true, JSON.stringify(rendered));
  git(root, ["commit", "--quiet", "-m", rendered.value]);
  const validCommitId = git(root, ["rev-parse", "HEAD"]);
  assert.deepEqual(await api.lookup("run_lookup:1:operation_lookup"), { commit_id: validCommitId, paths: [audit, canonical], pushed: false });
  const replay = await api.snapshot({
    identity: "run_lookup:1:operation_lookup", run_id: "run_lookup", run_revision: 1,
    operation_id: "operation_lookup", paths: [canonical, audit],
    expected_hashes: { [canonical]: hash("lookup canonical\n"), [audit]: hash("lookup audit\n") },
    message: "LLM Wiki 승인 기록: 정확한 조회", push: false,
  });
  assert.equal(replay.ok, true, JSON.stringify(replay));
  assert.equal(replay.receipt.commit_id, validCommitId);

  const spoofSnapshot = await gateway({ rootDir: root }).snapshot({
    identity: "run_spoof:1:operation_spoof", run_id: "run_spoof", run_revision: 1,
    operation_id: "operation_spoof", paths: ["ZETA/PERMANENT/spoof.md"], expected_hashes: {},
    message: "spoof", push: false,
  });
  assert.deepEqual(spoofSnapshot, { ok: false, reason: "git_backup_pending" });
  assert.notEqual(spoofSnapshot.receipt?.commit_id, malformedCommitIds.get("run_spoof:1:operation_spoof"));
});

test("same-path drift returns git_backup_pending without a commit", async (t) => {
  const root = fixture();
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const item = receipt(root);
  write(root, item.paths[0], "unapproved same-path edit\n");
  const before = git(root, ["rev-parse", "HEAD"]);
  const result = await gateway({ rootDir: root }).snapshot({ ...item, message: "LLM Wiki 승인 기록: operation_fixture", push: false });
  assert.deepEqual(result, { ok: false, reason: "git_backup_pending" });
  assert.equal(git(root, ["rev-parse", "HEAD"]), before);
});

test("capability reports unavailable runtime, lock, root, iCloud, and head drift", async (t) => {
  const root = fixture();
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  assert.deepEqual(await gateway({ runtime: { available: false } }).capability(), { ok: false, reason: "GitUnavailable" });
  assert.equal((await gateway({ rootDir: path.join(root, "missing") }).capability()).reason, "git_root_unavailable");
  assert.deepEqual(await gateway({ rootDir: root, runtime: { iCloudAvailable: false } }).capability(), { ok: false, reason: "iCloudUnavailable" });
  const locked = gateway({ rootDir: root });
  const gitDir = git(root, ["rev-parse", "--git-dir"]);
  fs.closeSync(fs.openSync(path.join(root, gitDir, "index.lock"), "w"));
  assert.equal((await locked.capability()).reason, "git_locked");
  fs.rmSync(path.join(root, gitDir, "index.lock"));
  const drift = gateway({ rootDir: root });
  assert.equal((await drift.capability()).ok, true);
  write(root, "head-drift.md", "drift\n");
  git(root, ["add", "head-drift.md"]);
  git(root, ["commit", "--quiet", "-m", "head drift"]);
  assert.deepEqual(await drift.verifySafeSync(), { ok: false, reason: "git_head_drift" });
});
