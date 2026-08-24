"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { test } = require("node:test");
const { RealObsidianHarness } = require("../shared/real_obsidian_harness.js");

const ROOT = path.resolve(__dirname, "../../../../../..");
const PLUGIN_ID = "obsidian-git";
const PLUGIN_ROOT = path.join(ROOT, ".obsidian/plugins", PLUGIN_ID);
const FILES = Object.freeze(["main.js", "manifest.json"]);
const sources = Object.freeze(Object.fromEntries(FILES.map((file) => [
  file,
  fs.readFileSync(path.join(PLUGIN_ROOT, file), "utf8"),
])));
const approvedSettings = Object.freeze((({
  autoSaveInterval,
  autoPushInterval,
  autoPullInterval,
  autoPullOnBoot,
  autoBackupAfterFileChange,
}) => ({
  autoSaveInterval,
  autoPushInterval,
  autoPullInterval,
  autoPullOnBoot,
  autoBackupAfterFileChange,
}))(JSON.parse(fs.readFileSync(path.join(PLUGIN_ROOT, "data.json"), "utf8"))));

function payload(value) {
  return JSON.stringify(value).replace(/</gu, "\\u003c");
}

function removeAbandonedRuntimeRoots() {
  const prefix = "task18-obsidian-git-reload-obsidian-";
  for (const entry of fs.readdirSync(os.tmpdir(), { withFileTypes: true })) {
    if (entry.isDirectory() && entry.name.startsWith(prefix)) fs.rmSync(path.join(os.tmpdir(), entry.name), { recursive: true, force: true });
  }
}

test("Task 18 initializes and reloads Obsidian Git through one live app without automatic timers", { timeout: 240000 }, async () => {
  removeAbandonedRuntimeRoots();
  let harness;
  try {
    harness = await RealObsidianHarness.start("task18-obsidian-git-reload");
    const receipt = await harness.evaluate(`(async () => {
      const fs = require("node:fs");
      const path = require("node:path");
      const pluginId = ${payload(PLUGIN_ID)};
      const sources = ${payload(sources)};
      const vault = app.vault.adapter.basePath;
      const communityPath = path.join(vault, ".obsidian", "community-plugins.json");
      const pluginPath = path.join(vault, ".obsidian", "plugins", pluginId);
      const dataPath = path.join(pluginPath, "data.json");
      const registrationBefore = fs.existsSync(communityPath)
        ? JSON.parse(fs.readFileSync(communityPath, "utf8")).filter((id) => id === pluginId).length
        : 0;
      fs.mkdirSync(pluginPath, { recursive: true });
      for (const [file, source] of Object.entries(sources)) fs.writeFileSync(path.join(pluginPath, file), source);
      if (fs.existsSync(dataPath)) throw new Error("TASK18_GIT_PLUGIN_DATA_PREEXISTED");

      await app.plugins.loadManifests();
      await app.plugins.enablePluginAndSave(pluginId);
      await app.plugins.saveConfig();
      const before = app.plugins.plugins[pluginId];
      if (!before) throw new Error("TASK18_GIT_PLUGIN_INITIAL_LOAD_FAILED");
      Object.assign(before.settings, ${payload(approvedSettings)});
      await before.saveSettings();
      if (!fs.existsSync(dataPath)) throw new Error("TASK18_GIT_PLUGIN_DATA_NOT_RUNTIME_CREATED");

      await app.plugins.disablePluginAndSave(pluginId);
      if (app.plugins.plugins[pluginId]) throw new Error("TASK18_GIT_PLUGIN_DISABLE_FAILED");
      await app.plugins.enablePluginAndSave(pluginId);
      const after = app.plugins.plugins[pluginId];
      if (!after || after === before) throw new Error("TASK18_GIT_PLUGIN_RELOAD_FAILED");

      const settings = JSON.parse(fs.readFileSync(path.join(pluginPath, "data.json"), "utf8"));
      const registered = JSON.parse(fs.readFileSync(communityPath, "utf8"));
      const manifestCount = Object.keys(app.plugins.manifests).filter((id) => id === pluginId).length;
      const registeredCount = registered.filter((id) => id === pluginId).length;
      const timers = {
        timeoutIDCommitAndSync: after.timeoutIDCommitAndSync ?? null,
        timeoutIDPush: after.timeoutIDPush ?? null,
        timeoutIDPull: after.timeoutIDPull ?? null,
      };
      const processIdBeforeEnable = process.pid;

      await app.plugins.disablePluginAndSave(pluginId);
      await app.plugins.saveConfig();
      fs.rmSync(pluginPath, { recursive: true, force: true });

      return {
        processIdBeforeEnable,
        processIdAfterReload: process.pid,
        pluginId,
        manifestCount,
        registrationBefore,
        registeredCount,
        dataCreatedByRuntime: true,
        settings: {
          autoSaveInterval: settings.autoSaveInterval,
          autoPushInterval: settings.autoPushInterval,
          autoPullInterval: settings.autoPullInterval,
          autoPullOnBoot: settings.autoPullOnBoot,
          autoBackupAfterFileChange: settings.autoBackupAfterFileChange,
        },
        timers,
        automaticTimerCount: Object.values(timers).filter((value) => value !== null).length,
        reloadedWithoutApplicationRestart: true,
      };
    })()`);

    assert.equal(receipt.pluginId, PLUGIN_ID);
    assert.equal(receipt.manifestCount, 1);
    assert.equal(receipt.registrationBefore, 0);
    assert.equal(receipt.registeredCount, 1);
    assert.equal(receipt.dataCreatedByRuntime, true);
    assert.deepEqual(receipt.settings, {
      autoSaveInterval: 0,
      autoPushInterval: 0,
      autoPullInterval: 0,
      autoPullOnBoot: false,
      autoBackupAfterFileChange: false,
    });
    assert.deepEqual(receipt.timers, {
      timeoutIDCommitAndSync: null,
      timeoutIDPush: null,
      timeoutIDPull: null,
    });
    assert.equal(receipt.automaticTimerCount, 0);
    assert.equal(receipt.processIdBeforeEnable, receipt.processIdAfterReload);
    assert.equal(receipt.reloadedWithoutApplicationRestart, true);
    console.log("TASK18_OBSIDIAN_GIT_RELOAD_GREEN " + JSON.stringify(receipt));
  } finally {
    if (harness) {
      const cleanup = await harness.close({
        expectedJson: {
          ".obsidian/community-plugins.json": ["task13a-local-dv"],
        },
      });
      assert.equal(cleanup.audit.equal, true, "temporary vault must be restored before disposal");
      assert.equal(cleanup.protectedContinuity.exact, true, "live Obsidian must remain untouched");
      assert.equal(cleanup.removed, true, "temporary runtime must be removed");
    }
  }
});
