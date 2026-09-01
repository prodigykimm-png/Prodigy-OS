#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const cp = require("node:child_process");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { test } = require("node:test");
const { RealObsidianHarness } = require("./real_obsidian_harness.js");

const RELEASE_ZIP = path.resolve(String(process.env.PRODIGY_RELEASE_ZIP || ""));
const RELEASE_RECEIPT = path.resolve(String(process.env.PRODIGY_RELEASE_RECEIPT || ""));
const RELEASE_SHA256 = path.resolve(String(process.env.PRODIGY_RELEASE_SHA256 || ""));
const RELEASE_AUDIT = path.resolve(String(process.env.PRODIGY_RELEASE_AUDIT || ""));
const ROLLBACK = path.resolve(String(process.env.PRODIGY_ROLLBACK_PLUGIN_PATH || ""));
const INSTALLER = path.resolve(String(process.env.PRODIGY_INSTALL_SCRIPT
  || path.join(os.homedir(), "Developer/prodigy-ai-runtime/scripts/install.mjs")));
const FILES = ["main.js", "manifest.json", "versions.json"];
const PROMPT_SENTINEL = "PRODIGY_RELEASE_QA_PROMPT_SENTINEL";
const OPERATION_SENTINEL = "prodigy-release-qa-operation-sentinel";
const RESPONSE_SENTINEL = "PRODIGY_RELEASE_QA_RESPONSE_SENTINEL";
const REQUEST_ID = "d".repeat(64);
const FORBIDDEN_RESIDUE = [
  PROMPT_SENTINEL,
  OPERATION_SENTINEL,
  RESPONSE_SENTINEL,
  "PRODIGY_RELEASE_QA_SECRET_VALUE_SENTINEL",
  "PROVIDER_STDOUT_SENTINEL",
  "PROVIDER_STDERR_SENTINEL",
];

function sha256(payload) {
  return crypto.createHash("sha256").update(payload).digest("hex");
}

function requiredPath(value, label) {
  assert.notEqual(value, path.resolve(""), `${label} path is required`);
  return value;
}

function run(command, args, label, env = process.env) {
  const result = cp.spawnSync(command, args, { encoding: "utf8", env, timeout: 30000 });
  if (result.error || result.status !== 0) {
    throw new Error(`${label}: ${(result.error && result.error.message) || result.stderr || result.status}`);
  }
  return result.stdout;
}

function assertReleaseRoot(root, label) {
  requiredPath(root, label);
  for (const name of FILES) {
    const stat = fs.lstatSync(path.join(root, name));
    assert.equal(stat.isFile() && !stat.isSymbolicLink(), true, `${label} ${name}`);
  }
}

function prepareVerifiedCandidate() {
  requiredPath(RELEASE_ZIP, "release ZIP");
  requiredPath(RELEASE_RECEIPT, "release receipt");
  requiredPath(RELEASE_SHA256, "release SHA-256");
  requiredPath(RELEASE_AUDIT, "release audit");
  const receiptBytes = fs.readFileSync(RELEASE_RECEIPT);
  const receipt = JSON.parse(receiptBytes);
  const audit = JSON.parse(fs.readFileSync(RELEASE_AUDIT, "utf8"));
  const archive = fs.readFileSync(RELEASE_ZIP);
  assert.equal(receipt.schema_version, "prodigy_ai_runtime_release_receipt_v1");
  assert.equal(receipt.archive.file, path.basename(RELEASE_ZIP));
  assert.equal(receipt.archive.sha256, sha256(archive));
  assert.equal(receipt.archive.bytes, archive.length);
  assert.equal(audit.release.receipt_sha256, sha256(receiptBytes));
  assert.equal(audit.release.archive.sha256, receipt.archive.sha256);
  assert.equal(audit.release.archive.bytes, receipt.archive.bytes);
  assert.deepEqual(audit.release.file_sha256, receipt.file_sha256);
  assert.equal(fs.readFileSync(RELEASE_SHA256, "utf8"),
    `${receipt.archive.sha256}  ${receipt.archive.file}\n`);
  const entries = run("unzip", ["-Z1", RELEASE_ZIP], "release ZIP entries")
    .split(/\r?\n/u).filter(Boolean);
  assert.deepEqual(entries, FILES);
  assert.deepEqual(receipt.release.files, FILES);
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "prodigy-ai-runtime-verified-release-"));
  run("unzip", ["-oq", RELEASE_ZIP, "-d", root], "release ZIP extraction");
  assertReleaseRoot(root, "verified candidate");
  for (const name of FILES) {
    assert.equal(sha256(fs.readFileSync(path.join(root, name))), receipt.file_sha256[name]);
  }
  return {
    root,
    version: receipt.release.version,
    cleanup() { fs.rmSync(root, { recursive: true, force: true }); },
  };
}

function scanRoot(root, sentinels) {
  if (!fs.existsSync(root)) return [];
  const hits = [];
  const pending = [root];
  while (pending.length) {
    const current = pending.pop();
    const stat = fs.lstatSync(current);
    if (stat.isSymbolicLink()) continue;
    if (stat.isDirectory()) {
      for (const name of fs.readdirSync(current)) pending.push(path.join(current, name));
      continue;
    }
    if (!stat.isFile()) continue;
    const bytes = fs.readFileSync(current);
    for (const sentinel of sentinels) {
      if (bytes.includes(Buffer.from(sentinel))) hits.push({ file: path.relative(root, current), sentinel });
    }
  }
  return hits;
}

function assertNoResidue(harness) {
  const roots = [harness.runtime.vault, harness.runtime.home, harness.runtime.profile, harness.runtime.temp];
  const hits = roots.flatMap((root) => scanRoot(root, FORBIDDEN_RESIDUE)
    .map((hit) => ({ root: path.basename(root), ...hit })));
  assert.deepEqual(hits, []);
  const plugins = path.join(harness.runtime.vault, ".obsidian/plugins");
  assert.equal(fs.readdirSync(plugins).some((name) => name.startsWith(".prodigy-ai-runtime-")), false);
}

async function observeFailurePath(harness) {
  return harness.evaluate(`(async()=>{
    await app.plugins.loadManifests();
    if(!app.plugins.plugins["prodigy-ai-runtime"])await app.plugins.enablePluginAndSave("prodigy-ai-runtime");
    const plugin=app.plugins.getPlugin("prodigy-ai-runtime");
    if(!plugin)throw new Error("PRODIGY_AI_RUNTIME_NOT_LOADED");
    const manifest={
      schema_version:1,consumer_id:"project.workflow_draft",contract_version:1,
      capability:"structured-strict",sensitivity:"private",route_policy:"local-preferred",
      consent_cadence:"standing-grant-with-explicit-action",background_allowed:false,
      max_input_bytes:65536,max_output_bytes:131072,max_schema_bytes:32768,timeout_ms:60000
    };
    const result=await plugin.api.requestStructured({
      protocol_version:"1.0.0",consumer_id:"project.workflow_draft",
      owner_session_id:"release-qa",operation_id:${JSON.stringify(OPERATION_SENTINEL)},
      attempt_id:"attempt-1",request_id:${JSON.stringify(REQUEST_ID)},consumer_manifest:manifest,
      prompt:${JSON.stringify(PROMPT_SENTINEL)},schema:{type:"object"}
    });
    return {
      handshake:plugin.api.getHandshake(),
      status:plugin.api.getStatus(),
      resolution:plugin.api.resolveProvider(manifest),
      result,
      providers:plugin.api.listProviders(),
      diagnostics:plugin.api.listDiagnostics(),
      browserNetwork:(window.__task13aNodeNetworkAttempts||[]).length
    };
  })()`);
}

function installArtifacts(harness, source) {
  const stdout = run(process.execPath, [INSTALLER], "artifact-only installer", {
    ...process.env,
    PRODIGY_VAULT: harness.runtime.vault,
    PRODIGY_PLUGIN_SOURCE: source,
  });
  const result = JSON.parse(stdout);
  assert.deepEqual(result.files, FILES);
  assert.equal(result.plugin_id, "prodigy-ai-runtime");
  assert.equal(Object.hasOwn(result, "target"), false);
}

async function reloadFrom(harness, source, expectedVersion) {
  await harness.evaluate(`app.plugins.disablePlugin("prodigy-ai-runtime")`);
  installArtifacts(harness, source);
  await harness.evaluate(`(async()=>{
    await app.plugins.loadManifests();
    await app.plugins.enablePlugin("prodigy-ai-runtime");
    if(!app.plugins.getPlugin("prodigy-ai-runtime"))throw new Error("PRODIGY_AI_RUNTIME_RELOAD_FAILED");
    return true;
  })()`);
  const state = await observeFailurePath(harness);
  assertSafeState(state, expectedVersion);
  return state;
}

function assertSafeState(state, expectedVersion) {
  assert.equal(state.handshake.plugin_id, "prodigy-ai-runtime");
  assert.equal(state.handshake.runtime_version, expectedVersion);
  assert.equal(state.status.status, "ready");
  assert.equal(state.resolution.status, "unavailable");
  assert.equal(state.result.error_code, "capability_unavailable");
  assert.deepEqual(state.providers, []);
  assert.equal(state.browserNetwork, 0);
  assert.doesNotMatch(JSON.stringify(state.diagnostics),
    new RegExp(FORBIDDEN_RESIDUE.map((value) => value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&")).join("|"), "u"));
}

test("release ZIP loads in a clean disposable Obsidian and fails Project closed", {
  timeout: 120000,
}, async () => {
  const candidate = prepareVerifiedCandidate();
  let harness;
  try {
    harness = await RealObsidianHarness.start("prodigy-ai-runtime-release-install", {
      fixtureMutation: { prodigyAIRuntimePluginPath: candidate.root },
      trustOnboarding: "required",
    });
    assertSafeState(await observeFailurePath(harness), candidate.version);
    assert.deepEqual(harness.osNetworkAttempts, []);
    assertNoResidue(harness);
  } finally {
    candidate.cleanup();
    if (harness) {
      const closed = await harness.close();
      assert.equal(closed.audit.equal, true);
      assert.equal(closed.protectedContinuity.exact, true);
      assert.equal(closed.removed, true);
      assert.equal(fs.existsSync(closed.runtimeRoot), false);
    }
  }
});

test("real Obsidian upgrade and rollback preserve config but never revive stale grants", {
  timeout: 180000,
}, async () => {
  const candidate = prepareVerifiedCandidate();
  assertReleaseRoot(ROLLBACK, "rollback");
  assert.equal(fs.lstatSync(INSTALLER).isFile(), true);
  const rollbackVersion = JSON.parse(fs.readFileSync(path.join(ROLLBACK, "manifest.json"), "utf8")).version;
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), "prodigy-ai-runtime-release-data-"));
  const dataPath = path.join(fixtureRoot, "data.json");
  const durable = `${JSON.stringify({
    schema_version: 1,
    default_profile_id: "gemini",
    profiles: [{
      profile_id: "gemini",
      adapter: "gemini",
      name: "QA Gemini",
      model: "qa-model",
      api_key_secret_id: "qa-secret-storage-id",
      relay_token_secret_id: null,
      certification_hash: null,
    }],
    bindings: { "project.workflow_draft": "gemini" },
    grants: {
      "project.workflow_draft": {
        profile_id: "gemini",
        profile_revision_hash: "a".repeat(64),
        granted_at: "2026-09-01T00:00:00.000Z",
      },
    },
    migrated_from_hash: null,
  }, null, 2)}\n`;
  fs.writeFileSync(dataPath, durable);
  let harness;
  try {
    harness = await RealObsidianHarness.start("prodigy-ai-runtime-release-lifecycle", {
      fixtureMutation: {
        prodigyAIRuntimePluginPath: ROLLBACK,
        prodigyAIRuntimeDataPath: dataPath,
      },
      trustOnboarding: "required",
    });
    const installedData = path.join(harness.runtime.vault, ".obsidian/plugins/prodigy-ai-runtime/data.json");
    assertSafeState(await observeFailurePath(harness), rollbackVersion);
    assert.equal(fs.readFileSync(installedData, "utf8"), durable);
    await reloadFrom(harness, candidate.root, candidate.version);
    assert.equal(fs.readFileSync(installedData, "utf8"), durable);
    await reloadFrom(harness, ROLLBACK, rollbackVersion);
    assert.equal(fs.readFileSync(installedData, "utf8"), durable);
    await reloadFrom(harness, candidate.root, candidate.version);
    assert.equal(fs.readFileSync(installedData, "utf8"), durable);
    assert.deepEqual(harness.osNetworkAttempts, []);
    const serializedArtifacts = FILES.map((name) =>
      fs.readFileSync(path.join(harness.runtime.vault, ".obsidian/plugins/prodigy-ai-runtime", name), "utf8")).join("\n");
    assert.doesNotMatch(serializedArtifacts, /qa-secret-storage-id|SECRET_VALUE/u);
    await reloadFrom(harness, ROLLBACK, rollbackVersion);
    assert.equal(fs.readFileSync(installedData, "utf8"), durable);
    assertNoResidue(harness);
  } finally {
    candidate.cleanup();
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
    if (harness) {
      const closed = await harness.close();
      assert.equal(closed.audit.equal, true);
      assert.equal(closed.protectedContinuity.exact, true);
      assert.equal(closed.removed, true);
      assert.equal(fs.existsSync(closed.runtimeRoot), false);
    }
  }
});
