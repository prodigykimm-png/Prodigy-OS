#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { test } = require("node:test");
const { RealObsidianHarness } = require("./real_obsidian_harness.js");

const CANDIDATE = path.resolve(String(process.env.PRODIGY_RELEASE_PLUGIN_PATH || ""));
const ROLLBACK = path.resolve(String(process.env.PRODIGY_ROLLBACK_PLUGIN_PATH || ""));
const FILES = ["main.js", "manifest.json", "versions.json"];

function assertReleaseRoot(root, label) {
  assert.notEqual(root, path.resolve(""), `${label} path is required`);
  for (const name of FILES) assert.equal(fs.lstatSync(path.join(root, name)).isFile(), true, `${label} ${name}`);
}

function replaceArtifacts(source, target) {
  for (const name of FILES) fs.copyFileSync(path.join(source, name), path.join(target, name));
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
      owner_session_id:"release-qa",operation_id:"deterministic-failure",
      attempt_id:"attempt-1",request_id:"d".repeat(64),consumer_manifest:manifest,
      prompt:"No provider call expected.",schema:{type:"object"}
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

async function reloadFrom(harness, source) {
  await harness.evaluate(`app.plugins.disablePlugin("prodigy-ai-runtime")`);
  replaceArtifacts(source, path.join(harness.runtime.vault, ".obsidian/plugins/prodigy-ai-runtime"));
  await harness.evaluate(`(async()=>{
    await app.plugins.loadManifests();
    await app.plugins.enablePlugin("prodigy-ai-runtime");
    if(!app.plugins.getPlugin("prodigy-ai-runtime"))throw new Error("PRODIGY_AI_RUNTIME_RELOAD_FAILED");
    return true;
  })()`);
  return observeFailurePath(harness);
}

function assertSafeState(state) {
  assert.equal(state.handshake.plugin_id, "prodigy-ai-runtime");
  assert.equal(state.handshake.runtime_version, "0.1.0");
  assert.equal(state.status.status, "ready");
  assert.equal(state.resolution.status, "unavailable");
  assert.equal(state.result.error_code, "capability_unavailable");
  assert.deepEqual(state.providers, []);
  assert.equal(state.browserNetwork, 0);
  assert.doesNotMatch(JSON.stringify(state.diagnostics), /No provider call expected|SECRET_VALUE/u);
}

test("release ZIP loads in a clean disposable Obsidian and fails Project closed", {
  timeout: 120000,
}, async () => {
  assertReleaseRoot(CANDIDATE, "candidate");
  let harness;
  try {
    harness = await RealObsidianHarness.start("prodigy-ai-runtime-release-install", {
      fixtureMutation: { prodigyAIRuntimePluginPath: CANDIDATE },
    });
    assertSafeState(await observeFailurePath(harness));
    assert.deepEqual(harness.osNetworkAttempts, []);
  } finally {
    if (harness) {
      const closed = await harness.close();
      assert.equal(closed.audit.equal, true);
      assert.equal(closed.protectedContinuity.exact, true);
      assert.equal(closed.removed, true);
    }
  }
});

test("real Obsidian upgrade and rollback preserve config but never revive stale grants", {
  timeout: 180000,
}, async () => {
  assertReleaseRoot(CANDIDATE, "candidate");
  assertReleaseRoot(ROLLBACK, "rollback");
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
    });
    const installedData = path.join(harness.runtime.vault, ".obsidian/plugins/prodigy-ai-runtime/data.json");
    assertSafeState(await observeFailurePath(harness));
    assert.equal(fs.readFileSync(installedData, "utf8"), durable);
    assertSafeState(await reloadFrom(harness, CANDIDATE));
    assert.equal(fs.readFileSync(installedData, "utf8"), durable);
    assertSafeState(await reloadFrom(harness, ROLLBACK));
    assert.equal(fs.readFileSync(installedData, "utf8"), durable);
    assertSafeState(await reloadFrom(harness, CANDIDATE));
    assert.equal(fs.readFileSync(installedData, "utf8"), durable);
    assert.deepEqual(harness.osNetworkAttempts, []);
    const serializedArtifacts = FILES.map((name) =>
      fs.readFileSync(path.join(harness.runtime.vault, ".obsidian/plugins/prodigy-ai-runtime", name), "utf8")).join("\n");
    assert.doesNotMatch(serializedArtifacts, /qa-secret-storage-id|SECRET_VALUE/u);
    assertSafeState(await reloadFrom(harness, ROLLBACK));
    assert.equal(fs.readFileSync(installedData, "utf8"), durable);
  } finally {
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
    if (harness) {
      const closed = await harness.close();
      assert.equal(closed.audit.equal, true);
      assert.equal(closed.protectedContinuity.exact, true);
      assert.equal(closed.removed, true);
    }
  }
});
