#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const os = require("node:os");
const path = require("node:path");
const { test } = require("node:test");
const { RealObsidianHarness } = require("./real_obsidian_harness.js");

const PLUGIN_ROOT = path.join(os.homedir(), "Developer/prodigy-ai-runtime");

test("real Obsidian loads the external Prodigy AI Runtime and exposes its settings", {
  timeout: 120000,
}, async () => {
  let harness;
  try {
    harness = await RealObsidianHarness.start("prodigy-ai-runtime", {
      fixtureMutation: { prodigyAIRuntimePluginPath: PLUGIN_ROOT },
    });
    const state = await harness.evaluate(`(async()=>{
      await app.plugins.loadManifests();
      if(!app.plugins.plugins["prodigy-ai-runtime"])await app.plugins.enablePluginAndSave("prodigy-ai-runtime");
      const plugin=app.plugins.getPlugin("prodigy-ai-runtime");
      if(!plugin)throw new Error("PRODIGY_AI_RUNTIME_NOT_LOADED");
      const handshake=plugin.api.getHandshake();
      const status=plugin.api.getStatus();
      const unavailable=await plugin.api.requestStructured({
        protocol_version:"1.0.0",
        consumer_id:"project.workflow_draft",
        owner_session_id:"real-obsidian",
        operation_id:"real-obsidian-unavailable",
        attempt_id:"attempt-1",
        request_id:"a".repeat(64),
        consumer_manifest:{
          schema_version:1,consumer_id:"project.workflow_draft",contract_version:1,
          capability:"structured-strict",sensitivity:"private",route_policy:"local-preferred",
          consent_cadence:"standing-grant-with-explicit-action",background_allowed:false,
          max_input_bytes:65536,max_output_bytes:131072,max_schema_bytes:32768,timeout_ms:60000
        },
        prompt:"no provider call expected",
        schema:{type:"object"}
      });
      plugin.api.openSettings();
      return {
        handshake,
        status,
        unavailable,
        providers:plugin.api.listProviders(),
        network:(window.__task13aNodeNetworkAttempts||[]).length
      };
    })()`);
    assert.equal(state.handshake.plugin_id, "prodigy-ai-runtime");
    assert.equal(state.handshake.protocol_hash, "e14b93848a72e1b20247701f1f25c5aef6164400785e8c8482b4705d3c99ce51");
    assert.equal(state.status.status, "ready");
    assert.deepEqual(state.providers, []);
    assert.equal(state.unavailable.error_code, "capability_unavailable");
    assert.equal(state.network, 0);
    const settings = await harness.evaluate(`(()=>{
      const modal=document.querySelector(".modal-container");
      return {text:modal?.textContent||"",hasSecretInput:Boolean(modal?.querySelector('input[type="password"]'))};
    })()`);
    assert.match(settings.text, /Prodigy AI Runtime/u);
    assert.match(settings.text, /provider profile이 없습니다/u);
    assert.equal(settings.hasSecretInput, false);
    assert.deepEqual(harness.osNetworkAttempts, []);
  } finally {
    if (harness) {
      const closed = await harness.close();
      assert.equal(closed.audit.equal, true);
      assert.equal(closed.protectedContinuity.exact, true);
      assert.equal(closed.removed, true);
      assert.equal(closed.portReusable, true);
    }
  }
});
