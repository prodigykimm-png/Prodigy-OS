"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "../../../../..");
const DISCOVERY_ROOT = path.join(ROOT, ".opencode/skills");

const adapters = fs.readdirSync(DISCOVERY_ROOT, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort();

assert.ok(adapters.length > 0);
adapters.forEach((skillName) => {
  const adapterPath = path.join(DISCOVERY_ROOT, skillName, "SKILL.md");
  const canonicalPath = path.join(ROOT, "SYSTEM/AI/Skills", skillName, "SKILL.md");
  assert.equal(fs.existsSync(canonicalPath), true, `missing canonical skill: ${skillName}`);
  const adapter = fs.readFileSync(adapterPath, "utf8");
  assert.match(adapter, new RegExp(`SYSTEM/AI/Skills/${skillName}/SKILL\\.md`));
  assert.match(adapter, /only source of truth/i);
  assert.ok(adapter.length < 1600, `discovery adapter contains duplicated rules: ${skillName}`);
});

console.log(`Canonical skill path tests passed (${adapters.length} adapters)`);
