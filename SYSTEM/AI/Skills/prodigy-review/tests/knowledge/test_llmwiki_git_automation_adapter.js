"use strict";

const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { test } = require("node:test");

const ROOT = path.resolve(__dirname, "../../../../../..");
const MODULE_PATH = path.join(ROOT, "SYSTEM/Views/llmwiki-git-automation-adapter.js");
const OPERATION_RUN_PATH = path.join(ROOT, "SYSTEM/Views/llmwiki-operation-run-service.js");
const GIT_GATEWAY_PATH = path.join(ROOT, "SYSTEM/Views/llmwiki-git-adapter.js");
const source = (file) => fs.readFileSync(path.join(ROOT, file), "utf8");
const sha256 = (value) => require(path.join(ROOT, "SYSTEM/Views/llmwiki-hash.js")).sha256(value);
function stable(value) {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (!value || typeof value !== "object") return JSON.stringify(value);
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stable(value[key])}`).join(",")}}`;
}

function outcome(overrides = {}) {
  return {
    run_id: "run_safe_git",
    run_revision: 1,
    operation_id: "operation_safe_git",
    canonical_outcome: {
      status: "committed",
      receipt: {
        target_path: "ZETA/PERMANENT/safe-git.md",
        audit_path: ".llmwiki-audit/operation_safe_git.json",
        immutable_audit_path: ".llmwiki-audit/immutable/operation_safe_git.json",
        compensation: {
          eligible: true,
          audit_path: ".llmwiki-audit/immutable/compensation_safe_git.json",
        },
      },
    },
    ...overrides,
  };
}

function gateway(overrides = {}) {
  const calls = { capability: 0, verify: 0, lookup: 0, snapshot: 0 };
  const receipts = new Map();
  return {
    calls,
    receipts,
    async capability() {
      calls.capability += 1;
      return overrides.capability || { ok: true, status: "available" };
    },
    async verifySafeSync() {
      calls.verify += 1;
      return overrides.sync || { ok: true, status: "clean" };
    },
    async lookup(identity) {
      calls.lookup += 1;
      return receipts.get(identity) || null;
    },
    async snapshot(input) {
      calls.snapshot += 1;
      assert.deepEqual(input.paths, [
        "ZETA/PERMANENT/safe-git.md",
        `.llmwiki-audit/immutable/${input.immutable_audit_hash}.json`,
        ".llmwiki-audit/immutable/head.json",
      ]);
      assert.equal(input.push, false);
      const receipt = {
        commit_id: "snapshot-safe-git",
        paths: input.paths,
        pushed: false,
      };
      receipts.set(input.identity, receipt);
      return { ok: true, receipt };
    },
  };
}

function api() {
  delete require.cache[MODULE_PATH];
  return require(MODULE_PATH);
}

function trustedReceipt(options = {}) {
  delete require.cache[OPERATION_RUN_PATH];
  const authority = require(OPERATION_RUN_PATH).createPostEligibilityGitReceiptAuthority();
  const immutable_audit = {
    audit_version: "llmwiki_immutable_compensation_audit_v1",
    audit_type: "canonical_committed",
    run_id: "run_safe_git",
    write_outcome: "committed",
    user_action: { type: "approved_commit" },
    canonical_post_commit_revisions: {
      [options.canonical || "ZETA/PERMANENT/safe-git.md"]: options.canonical_bytes === undefined ? "b".repeat(64) : sha256(options.canonical_bytes),
    },
  };
  immutable_audit.audit_hash = sha256(stable(immutable_audit));
  const receipt = authority.mint({
    run_id: "run_safe_git",
    run_revision: 1,
    operation_id: "operation_safe_git",
    canonical_outcome: { ...outcome().canonical_outcome, operation_id: "operation_safe_git" },
    immutable_audit,
  });
  assert.ok(receipt);
  return { authority, receipt };
}

test("exact approved canonical and audit paths produce one local snapshot without push", async () => {
  const injected = gateway();
  const trusted = trustedReceipt();
  const result = await api().create({ gateway: injected, receiptAuthority: trusted.authority }).recordEligibleReceipt({ receipt: trusted.receipt });

  assert.deepEqual(result, {
    ok: true,
    status: "git_recorded",
    reason: null,
    receipt: {
      commit_id: "snapshot-safe-git",
      paths: trusted.receipt.paths,
      pushed: false,
    },
  });
  assert.equal(injected.calls.snapshot, 1);
  assert.equal("push" in injected, false);
});

test("GitUnavailable and unsafe preconditions are typed non-blocking pending results", async () => {
  const trusted = trustedReceipt();
  const unavailable = await api().create({ receiptAuthority: trusted.authority }).recordEligibleReceipt({ receipt: trusted.receipt });
  assert.deepEqual(unavailable, { ok: false, status: "git_pending", reason: "GitUnavailable", receipt: null });

  const divergedGateway = gateway({ sync: { ok: false, reason: "git_diverged" } });
  const diverged = await api().create({ gateway: divergedGateway, receiptAuthority: trusted.authority }).recordEligibleReceipt({ receipt: trusted.receipt });
  assert.deepEqual(diverged, { ok: false, status: "git_pending", reason: "git_diverged", receipt: null });
  assert.equal(divergedGateway.calls.snapshot, 0);
});

test("forged direct outcomes and untrusted receipts never stage or snapshot", async () => {
  const injected = gateway();
  const adapter = api().create({ gateway: injected });
  const forged = await adapter.recordOutcome({
    outcome: outcome({
      canonical_outcome: {
        status: "committed",
        receipt: {
          target_path: "ZETA/PERMANENT/unapproved.md",
          audit_path: ".llmwiki-audit/attacker-controlled.json",
          immutable_audit_path: ".llmwiki-audit/immutable/attacker-controlled.json",
          compensation: { eligible: true, audit_path: ".llmwiki-audit/immutable/forged-compensation.json" },
        },
      },
    }),
  });
  assert.deepEqual(forged, { ok: false, status: "git_pending", reason: "untrusted_git_receipt", receipt: null });
  assert.equal(injected.calls.snapshot, 0);
});

test("a restarted adapter reuses the verified receipt rather than creating another commit", async () => {
  const injected = gateway();
  const trusted = trustedReceipt();
  const first = await api().create({ gateway: injected, receiptAuthority: trusted.authority }).recordEligibleReceipt({ receipt: trusted.receipt });
  assert.equal(first.status, "git_recorded");

  const restarted = await api().create({ gateway: injected, receiptAuthority: trusted.authority }).recordEligibleReceipt({ receipt: trusted.receipt });
  assert.equal(restarted.ok, true);
  assert.equal(restarted.status, "git_recorded");
  assert.equal(restarted.receipt.commit_id, "snapshot-safe-git");
  assert.equal(injected.calls.snapshot, 1);
});

test("restart reuses one real CJK canonical plus immutable audit Git commit without index leakage", async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "llmwiki-git-restart-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const git = (args) => execFileSync("git", ["-C", root, ...args], { encoding: "utf8" }).trim();
  git(["init", "--quiet"]); git(["config", "user.name", "Restart Fixture"]); git(["config", "user.email", "restart@example.test"]);
  fs.writeFileSync(path.join(root, "source.md"), "source unchanged\n"); git(["add", "--", "source.md"]); git(["commit", "--quiet", "-m", "base"]);
  fs.writeFileSync(path.join(root, "normal-index.md"), "normal staged\n"); git(["add", "--", "normal-index.md"]);
  const canonical = "ZETA/PERMANENT/재시작 조회 원칙.md";
  const canonicalBytes = "재시작 후에도 같은 지식\n";
  const trusted = trustedReceipt({ canonical, canonical_bytes: canonicalBytes });
  const auditHash = trusted.receipt.immutable_audit_hash;
  const files = {
    [canonical]: canonicalBytes,
    [`.llmwiki-audit/immutable/${auditHash}.json`]: JSON.stringify({ audit_hash: auditHash }),
    ".llmwiki-audit/immutable/head.json": JSON.stringify({ head_hash: auditHash }),
  };
  for (const [relative, bytes] of Object.entries(files)) {
    const target = path.join(root, relative); fs.mkdirSync(path.dirname(target), { recursive: true }); fs.writeFileSync(target, bytes);
  }
  const before = { index: git(["write-tree"]), source: sha256(fs.readFileSync(path.join(root, "source.md"))), commits: Number(git(["rev-list", "--count", "HEAD"])) };
  delete require.cache[GIT_GATEWAY_PATH];
  const firstGateway = require(GIT_GATEWAY_PATH).create({ rootDir: root });
  const first = await api().create({ gateway: firstGateway, receiptAuthority: trusted.authority }).recordEligibleReceipt({ receipt: trusted.receipt });
  assert.equal(first.status, "git_recorded", JSON.stringify(first));
  const afterFirstCount = Number(git(["rev-list", "--count", "HEAD"]));
  delete require.cache[GIT_GATEWAY_PATH];
  const restartedGateway = require(GIT_GATEWAY_PATH).create({ rootDir: root });
  const restarted = await api().create({ gateway: restartedGateway, receiptAuthority: trusted.authority }).recordEligibleReceipt({ receipt: trusted.receipt });
  assert.equal(restarted.status, "git_recorded", JSON.stringify(restarted));
  assert.equal(restarted.receipt.commit_id, first.receipt.commit_id);
  assert.equal(Number(git(["rev-list", "--count", "HEAD"])), afterFirstCount);
  assert.equal(afterFirstCount, before.commits + 1);
  assert.equal(git(["write-tree"]), before.index);
  assert.equal(sha256(fs.readFileSync(path.join(root, "source.md"))), before.source);
  assert.equal(git(["status", "--porcelain"]).includes("A  normal-index.md"), true);
  assert.equal(git(["remote"]), "");
});

test("existing receipt comparison is duplicate-safe exact set equality", async () => {
  const trusted = trustedReceipt();
  const expected = trusted.receipt.paths;
  const variants = [
    { name: "different order", paths: expected.slice().reverse(), accepted: true },
    { name: "missing", paths: expected.slice(0, -1), accepted: false },
    { name: "extra", paths: [...expected, `.llmwiki-audit/immutable/${"d".repeat(64)}.json`], accepted: false },
    { name: "duplicate", paths: [...expected.slice(0, -1), expected[0]], accepted: false },
    { name: "changed", paths: ["ZETA/PERMANENT/changed.md", ...expected.slice(1)], accepted: false },
  ];
  for (const variant of variants) {
    let snapshots = 0;
    const injected = {
      async capability() { return { ok: true }; }, async verifySafeSync() { return { ok: true }; },
      async lookup() { return { commit_id: `commit-${variant.name}`, paths: variant.paths, pushed: false }; },
      async snapshot() { snapshots += 1; return { ok: false, reason: "git_snapshot_failed" }; },
    };
    const result = await api().create({ gateway: injected, receiptAuthority: trusted.authority }).recordEligibleReceipt({ receipt: trusted.receipt });
    if (variant.accepted) {
      assert.equal(result.status, "git_recorded", variant.name);
      assert.equal(result.receipt.commit_id, `commit-${variant.name}`);
      assert.equal(snapshots, 0, variant.name);
    } else {
      assert.deepEqual(result, { ok: false, status: "git_pending", reason: "git_snapshot_failed", receipt: null }, variant.name);
      assert.equal(snapshots, 1, variant.name);
    }
  }
});

test("immutable audit descendants outside the minted exact allowlist are rejected", async () => {
  const injected = gateway();
  const trusted = trustedReceipt();
  const widened = Object.freeze({
    ...trusted.receipt,
    paths: Object.freeze([...trusted.receipt.paths, ".llmwiki-audit/immutable/attacker-controlled.json"]),
  });
  assert.equal(trusted.authority.verify(widened), false);

  const result = await api().create({ gateway: injected, receiptAuthority: trusted.authority }).recordEligibleReceipt({ receipt: widened });
  assert.deepEqual(result, { ok: false, status: "git_pending", reason: "untrusted_git_receipt", receipt: null });
  assert.equal(injected.calls.snapshot, 0);
});

test("Knowledge production loads the adapter before its runner and reports GitUnavailable visibly", () => {
  const manifest = source("SYSTEM/Views/prodigy-workspace-manifest.js");
  const fixture = source("SYSTEM/AI/Skills/prodigy-review/tests/shared/fixtures/workspace-manifest-v1.json");
  const hub = source("HUB/50 Knowledge.md");
  const lifecycle = source("SYSTEM/Views/llmwiki-lifecycle-view.js");
  const adapterPath = "SYSTEM/Views/llmwiki-git-automation-adapter.js";
  const gatewayPath = "SYSTEM/Views/llmwiki-git-adapter.js";

  assert.ok(manifest.indexOf(gatewayPath) >= 0);
  assert.ok(manifest.indexOf(gatewayPath) < manifest.indexOf(adapterPath));
  assert.ok(manifest.indexOf(adapterPath) >= 0);
  assert.ok(manifest.indexOf(adapterPath) < manifest.indexOf("SYSTEM/Views/llmwiki-operation-run-service.js"));
  assert.match(fixture, /llmwiki-git-adapter\.js/);
  assert.match(fixture, /llmwiki-git-automation-adapter\.js/);
  assert.match(hub, /LLMWikiGitGateway/);
  assert.match(hub, /LLMWikiGitAutomationAdapter\.create/);
  assert.match(hub, /llmWikiGitService\.recordEligibleReceipt/);
  assert.match(lifecycle, /지식 반영 완료 · Git 백업 보류/);
});
