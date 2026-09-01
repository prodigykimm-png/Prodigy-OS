#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const os = require("node:os");
const path = require("node:path");
const { test } = require("node:test");
const { RealObsidianHarness } = require("./real_obsidian_harness.js");

const PLUGIN_ROOT = path.join(os.homedir(), "Developer/prodigy-ai-runtime");

test("real Obsidian workspace settings delegates AI configuration to the external plugin", {
  timeout: 120000,
}, async () => {
  let harness;
  try {
    harness = await RealObsidianHarness.start("workspace-settings-runtime", {
      fixtureMutation: { prodigyAIRuntimePluginPath: PLUGIN_ROOT },
    });
    await harness.evaluate(`(async()=>{
      await app.plugins.loadManifests();
      if(!app.plugins.plugins["prodigy-ai-runtime"])await app.plugins.enablePluginAndSave("prodigy-ai-runtime");
      return true;
    })()`);
    await harness.mountStructuralWorkspace("home");
    await harness.evaluate(`(()=>{const modal=ProdigyWorkspaceSettingsModal.open(app);if(!modal)throw new Error("WORKSPACE_SETTINGS_MISSING");return true})()`);
    await harness.waitForSelector('[data-settings-action="open-ai-runtime"]');
    const state = await harness.evaluate(`(()=>({
      aiActions:document.querySelectorAll('[data-settings-action="open-ai-runtime"]').length,
      saveActions:document.querySelectorAll('[data-settings-action="save-integrations"]').length,
      secretInputs:document.querySelectorAll('.modal-container input[data-secret-id]').length,
      providerSelectors:document.querySelectorAll('.modal-container [data-provider-selector],.modal-container select[name*="provider"]').length,
      network:(window.__task13aNodeNetworkAttempts||[]).length
    }))()`);
    assert.equal(state.aiActions, 1);
    assert.equal(state.saveActions, 1);
    assert.ok(state.secretInputs >= 9);
    assert.equal(state.providerSelectors, 0);
    assert.equal(state.network, 0);
    await harness.renderedClick('[data-settings-action="open-ai-runtime"]');
    const pluginSettings = await harness.evaluate(`Boolean([...document.querySelectorAll('.vertical-tab-header-group-title,.setting-item-name,h2')].find(node=>String(node.textContent||"").includes("Prodigy AI Runtime")))`);
    assert.equal(pluginSettings, true);
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
