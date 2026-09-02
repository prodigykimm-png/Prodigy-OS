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
      trustOnboarding: "required",
    });
    assert.equal(harness.runtime.trustOnboarding.surface, "mod-trust-folder");
    assert.equal(harness.runtime.trustOnboarding.present, true);
    assert.equal(harness.runtime.trustOnboarding.vault_owned, true);
    assert.equal(harness.runtime.trustOnboarding.subscribed_before_trigger, true);
    assert.equal(harness.runtime.trustOnboarding.native_click, true);
    assert.equal(harness.runtime.trustOnboarding.removed, true);
    assert.equal(harness.runtime.trustOnboarding.remaining, 0);
    assert.equal(harness.runtime.trustOnboarding.cancel_click, false);
    assert.ok(harness.runtime.trustOnboarding.sequence.appearance_subscription
      < harness.runtime.trustOnboarding.sequence.app_ready);
    assert.ok(harness.runtime.trustOnboarding.sequence.removal_subscription
      < harness.runtime.trustOnboarding.sequence.native_trigger);
    assert.ok(harness.runtime.trustOnboarding.sequence.native_trigger
      < harness.runtime.trustOnboarding.sequence.click_observed);
    assert.ok(harness.runtime.trustOnboarding.sequence.click_observed
      < harness.runtime.trustOnboarding.sequence.removal_observed);
    assert.ok(Array.isArray(harness.runtime.trustOnboarding.lifecycle_operations));
    assert.equal(harness.runtime.trustOnboarding.lifecycle_operations
      .every((operation) => operation.status === "fulfilled"), true);
    assert.deepEqual(harness.runtime.trustCleanup, {
      clean: true,
      marker_count: 0,
      global_count: 0,
    });
    assert.deepEqual(harness.runtime.fixturePluginReadiness.after, {
      manifest_present: true,
      global_enablement: true,
      enabled_persisted: true,
      plugin_instance_present: true,
    });
    assert.ok(Array.isArray(harness.runtime.fixturePluginReadiness.actions));
    assert.equal(harness.runtime.networkObservation.started_before_onboarding, true);
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
      return {
        handshake,
        status,
        unavailable,
        providers:plugin.api.listProviders(),
        network:(window.__task13aNodeNetworkAttempts||[]).length,
        manifestLoaded:Boolean(app.plugins.manifests["prodigy-ai-runtime"]),
        enabledPersisted:app.plugins.enabledPlugins.has("prodigy-ai-runtime"),
        pluginLoaded:Boolean(app.plugins.plugins["prodigy-ai-runtime"]),
        settingsProfileCount:(await plugin.listSettingsProfiles()).length
      };
    })()`);
    assert.equal(state.handshake.plugin_id, "prodigy-ai-runtime");
    assert.equal(state.handshake.protocol_version, "1.0.0");
    assert.equal(state.handshake.protocol_hash, "e14b93848a72e1b20247701f1f25c5aef6164400785e8c8482b4705d3c99ce51");
    assert.equal(state.handshake.runtime_version, "0.2.0");
    assert.equal(state.status.status, "ready");
    assert.deepEqual(state.providers, []);
    assert.equal(state.unavailable.error_code, "capability_unavailable");
    assert.equal(state.network, 0);
    assert.equal(state.manifestLoaded, true);
    assert.equal(state.enabledPersisted, true);
    assert.equal(state.pluginLoaded, true);
    assert.equal(state.settingsProfileCount, 0);
    const settings = await harness.evaluate(`(async()=>{
      const plugin=app.plugins.getPlugin("prodigy-ai-runtime");
      const signal=new Promise((resolve,reject)=>{
        const cleanup=()=>{observer.disconnect();clearTimeout(timer)};
        const finish=()=>{
          const active=app.setting?.activeTab;
          const root=active?.containerEl;
          if(active?.id!=="prodigy-ai-runtime"||!root?.isConnected)return;
          if(root.getAttribute("data-prodigy-settings-state")!=="ready")return;
          const heading=root.querySelector("h2");
          if(heading?.textContent?.trim()!==plugin.manifest.name||root.children.length<3)return;
          cleanup();
          resolve({
            activeTabId:active.id,
            heading:heading.textContent.trim(),
            manifestName:plugin.manifest.name,
            childCount:root.children.length,
            profileSections:root.querySelectorAll(".prodigy-ai-runtime-profile").length,
            directParagraphs:root.querySelectorAll(":scope > p").length,
            emptyStateText:[...root.querySelectorAll(":scope > p")].at(-1)?.textContent?.trim()||"",
            hasSecretInput:Boolean(root.querySelector('input[type="password"]')),
            routeConnected:root.isConnected,
            trustRemaining:document.querySelectorAll(".modal.mod-trust-folder").length
          });
        };
        const observer=new MutationObserver(finish);
        observer.observe(document,{childList:true,subtree:true,attributes:true});
        const timer=setTimeout(()=>{
          const state=app.setting?.activeTab?.containerEl?.getAttribute("data-prodigy-settings-state")||"missing";
          cleanup();reject(new Error("PRODIGY_SETTINGS_ROUTE_TIMEOUT:"+state));
        },10000);
        try{plugin.api.openSettings();finish()}catch(error){cleanup();reject(error)}
      });
      return signal;
    })()`);
    assert.equal(settings.activeTabId, "prodigy-ai-runtime");
    assert.equal(settings.heading, settings.manifestName);
    assert.ok(settings.childCount >= 3);
    assert.equal(settings.profileSections, 0);
    assert.equal(settings.directParagraphs, 2);
    assert.ok(settings.emptyStateText.length > 0);
    assert.equal(settings.hasSecretInput, false);
    assert.equal(settings.routeConnected, true);
    assert.equal(settings.trustRemaining, 0);
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
