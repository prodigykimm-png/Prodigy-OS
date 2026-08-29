"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { test } = require("node:test");

const ROOT = path.resolve(__dirname, "../../../../../..");
const views = path.join(ROOT, "SYSTEM/Views");
const load = (name) => require(path.join(views, name));
const hash = (value) => crypto.createHash("sha256").update(value).digest("hex");
const A = "a".repeat(64);
const B = "b".repeat(64);
const operationContract = load("llmwiki-operation-contract.js");
globalThis.LLMWikiOperationContract = operationContract;
globalThis.LLMWikiHash = load("llmwiki-hash.js");
const riskPacket = load("llmwiki-risk-approval-packet.js");
const operationState = load("llmwiki-operation-run-state.js");
const migration = load("llmwiki-migration-rollout.js");
const gitGateway = load("llmwiki-git-adapter.js");
const manifest = load("prodigy-workspace-manifest.js").get("knowledge");

function citation() {
  return { source_id: "source_security", content_hash: A, source_url: null, locators: ["INBOX/Knowledge/security.md#claim"], source_archive_id: null, confidence: "explicit" };
}
function operation(kind, destination = "ZETA/PERMANENT/security.md") {
  const common = {
    contract_version: operationContract.CONTRACT_VERSION,
    operation_id: `operation_security_${kind}`,
    kind,
    destination_ids: [destination],
    base_revisions: { [destination]: A },
    before_bytes: { [destination]: "before\n" },
    after_bytes: { [destination]: "after\n" },
    source_citations: [citation()],
    conflicts: [],
    risk_tier: kind === "merge" ? "high" : "low",
    effects: { deprecations: [], supersessions: [] },
  };
  if (kind === "create") return { ...common, base_revisions: {}, before_bytes: {} };
  if (kind === "noop") return { ...common, before_bytes: { [destination]: "same\n" }, after_bytes: { [destination]: "same\n" } };
  if (kind === "merge") return {
    ...common,
    source_ids: ["ZETA/PERMANENT/source-a.md", "ZETA/PERMANENT/source-b.md"],
    base_revisions: { "ZETA/PERMANENT/source-a.md": A, "ZETA/PERMANENT/source-b.md": B, [destination]: A },
    before_bytes: { "ZETA/PERMANENT/source-a.md": "a\n", "ZETA/PERMANENT/source-b.md": "b\n", [destination]: "before\n" },
  };
  return common;
}
function parse(kind, destination) {
  return operationContract.parseOperation(JSON.stringify(operation(kind, destination)));
}
function commandSpy() {
  const calls = [];
  const deps = {
    childProcess: { execFileSync(...args) { calls.push(args); throw new Error("process invocation forbidden by fixture"); } },
    crypto,
    fs: { existsSync() { return false; } },
    os,
    path,
  };
  return { calls, gateway: gitGateway.create({ rootDir: "/f2/not-a-repository", deps }) };
}

const LEGITIMATE_CANONICAL_PATHS = Object.freeze([
  "ZETA/PERMANENT/신뢰 코어 원칙.md", "ZETA/PERMANENT/知識 原則.md",
  "ZETA/PERMANENT/ASCII Knowledge 2.md", "ZETA/PERMANENT/충돌 제목 (2).md",
]);
const AUDIT_HASH_PATH = `.llmwiki-audit/immutable/${A}.json`;
const TRUSTED_SUBJECTS = Object.freeze([
  "LLM Wiki 승인 기록: operation_safe_git", "LLM Wiki security fixture", "안전한 지식 승인: 원칙 2",
]);

const PATH_ATTACKS = Object.freeze([
  "/absolute.md", "../escape.md", "ZETA/PERMANENT/../escape.md", "ZETA/PERMANENT/%2e%2e/escape.md",
  "ZETA/PERMANENT/%252e%252e/escape.md", "ZETA/PERMANENT/．./escape.md", "ZETA/PERMANENT/..／escape.md",
  "ZETA/PERMANENT/nul\0name.md", "ZETA\\PERMANENT\\escape.md", ".git/config", ".llmwiki-audit/../escape.md",
  "ZETA/PERMANENT/a;touch-pwn.md", "ZETA/PERMANENT/a|cat.md", "ZETA/PERMANENT/a>out.md",
  "ZETA/PERMANENT/a&whoami.md", "ZETA/PERMANENT/a`id`.md", "ZETA/PERMANENT/a$(id).md", "--help",
]);
const MESSAGE_ATTACKS = Object.freeze([
  "subject\n\nSigned-off-by: attacker", "--amend", "--", "$(touch pwn)", "`id`", "a|cat", "a>out", "a;id", "a&&id", "a\";id",
]);

test("operation discriminants are derived once and classifier/risk/lifecycle/migration contracts are exhaustive and fail closed", () => {
  assert.deepEqual(operationContract.OPERATION_KINDS, ["create", "update", "merge", "noop"]);
  assert.deepEqual(operationState.KINDS, operationContract.OPERATION_KINDS);
  for (const kind of operationContract.OPERATION_KINDS) {
    const parsed = parse(kind);
    assert.equal(parsed.ok, true, `${kind}: ${JSON.stringify(parsed)}`);
    const transitioned = operationState.transitionOperationRunState(
      { ...operationState.initialOperationRunState(), state: "provider_pending", run_id: "run_security", run_revision: 1 },
      { type: "provider_ready", run_id: "run_security", run_revision: 1, operation_kind: kind, operation_id: parsed.value.operation_id },
    );
    assert.equal(transitioned.ok, true, kind);
    const packet = riskPacket.buildRiskApprovalPacket({ run_id: "run_security", run_revision: 1, packet_revision: 1, operation: parsed.value, summary: kind, provenance: { source_ids: ["source_security"] } });
    assert.equal(packet.ok, true, `${kind}: ${JSON.stringify(packet)}`);
    assert.equal(packet.value.risk.tier, kind === "merge" ? "high" : kind === "update" ? "medium" : "low");
  }
  const unknown = operationContract.parseOperation(JSON.stringify({ ...operation("create"), kind: "delete" }));
  assert.deepEqual(unknown, { ok: false, field: "kind", reason: "unknown_operation_kind" });
  const unknownLifecycle = operationState.transitionOperationRunState(
    { ...operationState.initialOperationRunState(), state: "provider_pending", run_id: "run_security", run_revision: 1 },
    { type: "provider_ready", run_id: "run_security", run_revision: 1, operation_kind: "delete", operation_id: "operation_delete" },
  );
  assert.equal(unknownLifecycle.ok, false);
  assert.equal(migration.enableRolloutPhase(migration.createRolloutState(), "delete", { available: true, status: "green", receipt_id: "fixture" }).reason, "unknown_rollout_phase");
});

test("core -> service -> adapter -> controller/view dependency direction is acyclic and production manifest ordered", () => {
  const required = manifest.required;
  const chain = [
    "llmwiki-operation-contract.js", "llmwiki-operation-classifier.js",
    "llmwiki-operation-writer.js", "llmwiki-git-adapter.js", "llmwiki-git-automation-adapter.js", "llmwiki-run-controller.js", "llmwiki-lifecycle-view.js",
  ].map((name) => required.indexOf(`SYSTEM/Views/${name}`));
  assert.ok(required.indexOf("SYSTEM/Views/llmwiki-batch-provider.js") < required.indexOf("SYSTEM/Views/llmwiki-run-controller.js"));
  assert.equal(chain.every((index) => index >= 0), true, JSON.stringify(chain));
  assert.equal(chain.every((index, position) => position === 0 || index > chain[position - 1]), true, JSON.stringify(chain));
  const lowerLayers = ["llmwiki-operation-contract.js", "llmwiki-operation-classifier.js", "llmwiki-operation-writer.js", "llmwiki-git-adapter.js"];
  for (const name of lowerLayers) {
    const source = fs.readFileSync(path.join(views, name), "utf8");
    assert.doesNotMatch(source, /require\(["']\.\/llmwiki-(?:lifecycle-view|risk-review-controller|run-controller)\.js["']\)/u, name);
  }
});

test("shared write-boundary policy accepts only canonical/audit paths and trusted commit rendering", () => {
  const policyApi = load("llmwiki-write-boundary-policy.js");
  for (const value of LEGITIMATE_CANONICAL_PATHS) {
    assert.deepEqual(policyApi.parseCanonicalWritePath(value), { ok: true, value });
    assert.deepEqual(policyApi.parseGitStagedPath(value), { ok: true, kind: "canonical", value });
  }
  for (const value of [AUDIT_HASH_PATH, ".llmwiki-audit/immutable/head.json"]) {
    assert.deepEqual(policyApi.parseImmutableAuditGitPath(value), { ok: true, value });
    assert.deepEqual(policyApi.parseGitStagedPath(value), { ok: true, kind: "audit", value });
  }
  for (const value of [
    "", "/absolute.md", "ZETA/PERMANENT/.md", "ZETA/PERMANENT/..md", "ZETA/PERMANENT/.hidden.md",
    "ZETA/PERMANENT/-option.md", "ZETA/PERMANENT/%2e%2e.md", "ZETA/PERMANENT/%252e%252e.md",
    "ZETA/PERMANENT/a\\b.md", "ZETA/PERMANENT/nul\0name.md", "ZETA/PERMANENT/control\u0001.md",
    "ZETA/PERMANENT/bidi\u202ename.md", "ZETA/PERMANENT/..／escape.md", "ZETA/PERMANENT/．.md",
    "ZETA/PERMANENT/a;id.md", "ZETA/PERMANENT/a|id.md", "ZETA/PERMANENT/a>out.md",
    "ZETA/PERMANENT/a&whoami.md", "ZETA/PERMANENT/a`id`.md", "ZETA/PERMANENT/a$(id).md",
  ]) assert.equal(policyApi.parseCanonicalWritePath(value).ok, false, JSON.stringify(value));
  for (const value of [
    ".llmwiki-audit/immutable/operation.json", `.llmwiki-audit/immutable/${A.toUpperCase()}.json`,
    ".llmwiki-audit/immutable/../head.json", ".llmwiki-audit/immutable/head.json/extra",
  ]) assert.equal(policyApi.parseImmutableAuditGitPath(value).ok, false, JSON.stringify(value));
  for (const value of TRUSTED_SUBJECTS) assert.deepEqual(policyApi.parseCommitSubject(value), { ok: true, value });
  for (const value of [...MESSAGE_ATTACKS, "e\u0301", "subject\u202ename"]) assert.equal(policyApi.parseCommitSubject(value).ok, false, JSON.stringify(value));
  const rendered = policyApi.renderTrustedCommitMessage({
    subject: TRUSTED_SUBJECTS[0], run_id: "run_safe_git", run_revision: 1,
    operation_id: "operation_safe_git", identity: "run_safe_git:1:operation_safe_git",
    paths: [LEGITIMATE_CANONICAL_PATHS[0], AUDIT_HASH_PATH, ".llmwiki-audit/immutable/head.json"],
  });
  assert.equal(rendered.ok, true, JSON.stringify(rendered));
  assert.equal(rendered.value.split("\n").length, 6);
  assert.match(rendered.value, /^LLM Wiki 승인 기록: operation_safe_git\n\nLLMWiki-Run: run_safe_git#1\nLLMWiki-Operation: operation_safe_git\nLLMWiki-Identity: run_safe_git:1:operation_safe_git\nLLMWiki-Paths: /u);
  assert.deepEqual(policyApi.parseRenderedCommitMessage(rendered.value), {
    ok: true, value: rendered.value, subject: TRUSTED_SUBJECTS[0], run_id: "run_safe_git", run_revision: 1,
    operation_id: "operation_safe_git", identity: "run_safe_git:1:operation_safe_git",
    paths: [LEGITIMATE_CANONICAL_PATHS[0], AUDIT_HASH_PATH, ".llmwiki-audit/immutable/head.json"],
  });
  assert.equal(policyApi.parseRenderedCommitMessage(`${rendered.value}\nInjected: attacker`).ok, false);
});

test("provider-controlled canonical paths are rejected before writer authority", () => {
  for (const attack of PATH_ATTACKS.filter((value) => value.startsWith("ZETA/PERMANENT/") && value.endsWith(".md"))) {
    const parsed = parse("create", attack);
    if (!parsed.ok) continue;
    const packet = riskPacket.buildRiskApprovalPacket({ run_id: "run_security", run_revision: 1, packet_revision: 1, operation: parsed.value, summary: "attack", provenance: { source_ids: ["source_security"] } });
    assert.equal(packet.ok, false, `writer authority accepted ${JSON.stringify(attack)}`);
    assert.match(packet.reason, /canonical_target_required|invalid_identifier/u);
  }
});

test("provider-controlled paths and commit text are typed-rejected before filesystem or Git process invocation", async () => {
  for (const attack of PATH_ATTACKS) {
    const spy = commandSpy();
    const result = await spy.gateway.snapshot({ identity: "run:1:operation", operation_id: "operation_security", run_id: "run_security", run_revision: 1, paths: [attack], expected_hashes: {}, message: "safe", push: false });
    assert.deepEqual(result, { ok: false, reason: "git_snapshot_invalid" }, `path ${JSON.stringify(attack)} => ${JSON.stringify(result)}`);
    assert.equal(spy.calls.length, 0, `path reached Git: ${JSON.stringify(attack)}`);
  }
  for (const attack of MESSAGE_ATTACKS) {
    const spy = commandSpy();
    const result = await spy.gateway.snapshot({ identity: "run:1:operation", operation_id: "operation_security", run_id: "run_security", run_revision: 1, paths: ["ZETA/PERMANENT/safe.md"], expected_hashes: {}, message: attack, push: false });
    assert.deepEqual(result, { ok: false, reason: "git_snapshot_invalid" }, `message ${JSON.stringify(attack)} => ${JSON.stringify(result)}`);
    assert.equal(spy.calls.length, 0, `message reached Git: ${JSON.stringify(attack)}`);
  }
});

test("static runtime scan forbids source deletion, destructive Git and shell execution while allowing bounded temp cleanup", () => {
  const files = fs.readdirSync(views).filter((name) => name.startsWith("llmwiki-") && name.endsWith(".js"));
  const findings = [];
  for (const name of files) {
    const source = fs.readFileSync(path.join(views, name), "utf8");
    for (const [label, pattern] of [
      ["destructive_git", /command\([^\n]+\[\s*["'](?:reset|checkout|clean|push|revert)["']/gu],
      ["shell_exec", /childProcess\.(?:exec|execSync)\s*\(|shell\s*:\s*true/gu],
    ]) for (const match of source.matchAll(pattern)) findings.push({ name, label, token: match[0] });
  }
  for (const name of ["llmwiki-source-adapters.js", "llmwiki-source-registry.js", "llmwiki-inbox-discovery-queue.js"]) {
    const source = fs.readFileSync(path.join(views, name), "utf8");
    assert.doesNotMatch(source, /(?:fs|vault|adapter)\.(?:unlinkSync|unlink|rmSync|rm|delete|trash)\s*\(/u, name);
  }
  assert.deepEqual(findings, []);
  const gatewaySource = fs.readFileSync(path.join(views, "llmwiki-git-adapter.js"), "utf8");
  assert.match(gatewaySource, /GIT_INDEX_FILE/u);
  assert.doesNotMatch(gatewaySource, /command\([^\n]+\[\s*["'](?:reset|checkout|clean|push|revert)["']/u);
  const vaultSafetySource = fs.readFileSync(path.join(views, "llmwiki-vault-safety.js"), "utf8");
  assert.match(vaultSafetySource, /fs\.unlinkSync\(tempPath\)/u, "only the adapter-owned temp file is unlinked on failed atomic replace");
  const transactionSource = fs.readFileSync(path.join(views, "llmwiki-risk-vault-transaction-adapter.js"), "utf8");
  assert.match(transactionSource, /if \((?:prior\.exists === false|!prior\.exists)\)[\s\S]*?vault\.delete\(live, true\)/u, "canonical create compensation may remove only a previously absent exact-set target");
});

test("isolated adapter commits exact paths only, preserves normal index, does not delete sources or push, and cleans temp state", async (t) => {
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), "f2-llmwiki-git-"));
  t.after(() => fs.rmSync(fixtureRoot, { recursive: true, force: true }));
  const git = (args, options = {}) => execFileSync("git", ["-C", fixtureRoot, ...args], { encoding: "utf8", ...options }).trim();
  git(["init", "--quiet"]); git(["config", "user.name", "F2 Fixture"]); git(["config", "user.email", "f2@example.test"]);
  fs.writeFileSync(path.join(fixtureRoot, "source.md"), "preserve source\n"); git(["add", "source.md"]); git(["commit", "--quiet", "-m", "base"]);
  fs.mkdirSync(path.join(fixtureRoot, "ZETA/PERMANENT"), { recursive: true });
  fs.mkdirSync(path.join(fixtureRoot, ".llmwiki-audit/immutable"), { recursive: true });
  fs.writeFileSync(path.join(fixtureRoot, "ZETA/PERMANENT/safe.md"), "approved\n");
  fs.writeFileSync(path.join(fixtureRoot, AUDIT_HASH_PATH), "audit\n");
  fs.writeFileSync(path.join(fixtureRoot, "normal-index.md"), "staged\n"); git(["add", "normal-index.md"]);
  const beforeIndex = git(["write-tree"]); const sourceBefore = hash(fs.readFileSync(path.join(fixtureRoot, "source.md")));
  const paths = ["ZETA/PERMANENT/safe.md", AUDIT_HASH_PATH];
  const result = await gitGateway.create({ rootDir: fixtureRoot }).snapshot({ identity: "run_security:1:operation_security", operation_id: "operation_security", run_id: "run_security", run_revision: 1, paths, expected_hashes: Object.fromEntries(paths.map((name) => [name, hash(fs.readFileSync(path.join(fixtureRoot, name)))])), message: "LLM Wiki security fixture", push: false });
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.deepEqual(git(["show", "--format=", "--name-only", result.receipt.commit_id]).split("\n").filter(Boolean).sort(), paths.slice().sort());
  assert.equal(git(["write-tree"]), beforeIndex);
  assert.equal(hash(fs.readFileSync(path.join(fixtureRoot, "source.md"))), sourceBefore);
  assert.equal(git(["status", "--porcelain"]).includes("A  normal-index.md"), true);
  assert.equal(git(["remote"]), "");
  const duplicate = await gitGateway.create({ rootDir: fixtureRoot }).snapshot({ identity: "run_security:1:operation_security", operation_id: "operation_security", run_id: "run_security", run_revision: 1, paths, expected_hashes: Object.fromEntries(paths.map((name) => [name, hash(fs.readFileSync(path.join(fixtureRoot, name)))])), message: "LLM Wiki security fixture", push: false });
  assert.equal(duplicate.receipt.commit_id, result.receipt.commit_id);
});

test("Git unavailable, lock/drift, malformed response, stale/cancel, duplicate, and interruption fail closed without residue", async () => {
  assert.deepEqual(await gitGateway.create({ runtime: { available: false } }).capability(), { ok: false, reason: "GitUnavailable" });
  const malformed = operationContract.parseOperation("{bad");
  assert.deepEqual(malformed, { ok: false, field: "operation", reason: "malformed_json" });
  const state = operationState.createOperationRunState();
  assert.equal(state.dispatch({ type: "start", run_id: "run_security", run_revision: 1 }).ok, true);
  assert.equal(state.dispatch({ type: "cancel", run_id: "run_security", run_revision: 1 }).ok, true);
  assert.equal(state.dispatch({ type: "provider_ready", run_id: "run_security", run_revision: 1, operation_kind: "create", operation_id: "operation_security" }).reason, "invalid_transition");
  assert.equal(state.dispatch({ type: "cancel", run_id: "run_security", run_revision: 1 }).reason, "invalid_transition");
});
