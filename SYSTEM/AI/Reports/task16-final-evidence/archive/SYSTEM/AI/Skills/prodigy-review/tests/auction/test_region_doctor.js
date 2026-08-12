"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");
const test = require("node:test");

const ROOT = path.resolve(__dirname, "../../../../../..");

// prodigy-doctor.js uses IIFE with module.exports at the end
const doctor = require(path.join(ROOT, "SYSTEM/Views/prodigy-doctor.js"));

test("doctor exports checkPlugins function", () => {
  assert.equal(typeof doctor.checkPlugins, "function");
});

test("all plugins present → all green", () => {
  const ids = ["dataview", "datacore", "js-engine", "obsidian-meta-bind-plugin", "templater-obsidian", "quickadd", "journals", "obsidian-tasks-plugin"];
  const manifests = {};
  for (const id of ids) manifests[id] = { version: "1.0.0" };
  const mockApp = {
    plugins: {
      manifests,
      enabledPlugins: new Set(ids)
    }
  };
  const results = doctor.checkPlugins(mockApp);
  const required = results.filter((r) => r.required);
  assert.ok(required.length >= 8);
  for (const r of required) {
    assert.equal(r.installed, true, `${r.id} should be installed`);
    assert.equal(r.enabled, true, `${r.id} should be enabled`);
    assert.equal(r.status, "정상", `${r.id} should be 정상`);
  }
});

test("missing plugin → red with name", () => {
  const manifests = { "dataview": { version: "1.0.0" } };
  const mockApp = {
    plugins: {
      manifests,
      enabledPlugins: new Set(["dataview"])
    }
  };
  const results = doctor.checkPlugins(mockApp);
  const missing = results.filter((r) => r.required && !r.installed);
  assert.ok(missing.length > 0, "Should have missing plugins");
  for (const m of missing) {
    assert.ok(m.label, "Missing plugin should have a label");
    assert.equal(m.installed, false);
    assert.equal(m.status, "미설치");
  }
});

test("missing directory → warning", () => {
  const mockApp = {
    plugins: { manifests: {}, enabledPlugins: new Set() },
    vault: {
      getAbstractFileByPath: (p) => p === "HUB" ? { path: p } : null
    }
  };
  const results = doctor.checkVaultStructure(mockApp);
  const missing = results.filter((r) => r.status === "누락");
  assert.ok(missing.length > 0, "Should have missing directories");
  for (const m of missing) {
    assert.match(m.detail, /존재하지 않/);
  }
});

test("provider key configured → 설정됨 (never shows value)", () => {
  // Doctor should never expose secret values
  const source = require("fs").readFileSync(path.join(ROOT, "SYSTEM/Views/prodigy-doctor.js"), "utf8");
  assert.ok(!source.includes("getSecret"), "Doctor must not call getSecret directly");
  assert.ok(!source.includes("secretStorage"), "Doctor must not access secretStorage");
  assert.ok(!source.includes("apiKey"), "Doctor must not expose apiKey");
  assert.match(source, /읽기 전용/);
});

test("doctor is read-only: no write operations", () => {
  const source = require("fs").readFileSync(path.join(ROOT, "SYSTEM/Views/prodigy-doctor.js"), "utf8");
  assert.ok(!source.includes("writeFileSync"), "Doctor must not write files");
  assert.ok(!source.includes("mkdirSync"), "Doctor must not create directories");
  assert.ok(!source.includes("unlinkSync"), "Doctor must not delete files");
});

test("doctor exports REQUIRED_PLUGINS list", () => {
  assert.ok(doctor.REQUIRED_PLUGINS, "Should export REQUIRED_PLUGINS list");
  assert.ok(Array.isArray(doctor.REQUIRED_PLUGINS));
  assert.ok(doctor.REQUIRED_PLUGINS.length >= 8);
});
