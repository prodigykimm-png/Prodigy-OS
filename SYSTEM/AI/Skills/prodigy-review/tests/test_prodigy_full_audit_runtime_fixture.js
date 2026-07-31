"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const ROOT = path.resolve(__dirname, "../../../../..");
const runtime = require(path.join(ROOT, "SYSTEM/SCRIPTS/prodigy-full-audit-runtime-fixture.js"));

test("tracked-only runtime fixture contains synthetic data and isolated Dataview settings", () => {
  const result = runtime.prepare({ repoRoot: ROOT });
  try {
    assert.match(result.head_sha, /^[a-f0-9]{40}$/);
    assert.ok(result.vault_root.startsWith(fs.realpathSync(os.tmpdir())));
    assert.ok(result.profile_root.startsWith(result.temp_root));
    assert.deepEqual(result.private_source_paths_copied, []);
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(result.vault_root, ".obsidian/community-plugins.json"))), ["dataview"]);
    assert.deepEqual(
      JSON.parse(fs.readFileSync(path.join(result.vault_root, ".obsidian/app.json"))),
      { showUnsupportedFiles: true }
    );
    const settings = JSON.parse(fs.readFileSync(path.join(result.vault_root, ".obsidian/plugins/dataview/data.json")));
    assert.equal(settings.enableDataviewJs, true);
    assert.equal(settings.refreshInterval, 2500);
    assert.ok(fs.existsSync(path.join(result.vault_root, "DAILY/2026-08-01.md")));
    assert.equal(fs.existsSync(path.join(result.vault_root, "SYSTEM/CACHE")), false);
    assert.equal(fs.existsSync(path.join(result.vault_root, ".obsidian/plugins/homepage")), false);
    const profile = JSON.parse(fs.readFileSync(path.join(result.profile_root, "obsidian.json")));
    assert.deepEqual(Object.keys(profile.vaults), ["audit"]);
    assert.equal(profile.vaults.audit.path, result.vault_root);
  } finally {
    runtime.cleanup(result.temp_root);
  }
  assert.equal(fs.existsSync(result.temp_root), false);
});

test("cleanup refuses an unrelated path", () => {
  const unrelated = fs.mkdtempSync(path.join(os.tmpdir(), "not-prodigy-audit-"));
  try { assert.throws(() => runtime.cleanup(unrelated), /refusing/); }
  finally { fs.rmSync(unrelated, { recursive: true, force: true }); }
});
