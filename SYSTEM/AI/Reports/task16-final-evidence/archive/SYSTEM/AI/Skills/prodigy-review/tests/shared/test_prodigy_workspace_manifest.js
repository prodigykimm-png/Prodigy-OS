"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");
const test = require("node:test");

const ROOT = path.resolve(__dirname, "../../../../../..");
const EXPECTED = require("./fixtures/workspace-manifest-v1.json");
const MANIFEST_PATH = path.join(ROOT, "SYSTEM/Views/prodigy-workspace-manifest.js");

function freshManifest() {
  delete require.cache[require.resolve(MANIFEST_PATH)];
  delete global.ProdigyWorkspaceManifest;
  return require(MANIFEST_PATH);
}

test("the closed registry exactly matches the frozen pre-Task6 workspace contracts", () => {
  const api = freshManifest();
  assert.equal(EXPECTED.schema_version, 1);
  assert.deepEqual(api.all().map((entry) => entry.workspaceId), Object.keys(EXPECTED.entries));
  for (const [workspaceId, expected] of Object.entries(EXPECTED.entries)) {
    const actual = api.get(workspaceId);
    assert.deepEqual(Object.keys(actual), ["workspaceId", "host", "required", "optional", "renderer"]);
    assert.deepEqual(JSON.parse(JSON.stringify(actual)), expected, workspaceId);
    assert.equal(Object.isFrozen(actual), true);
    assert.equal(Object.isFrozen(actual.required), true);
    assert.equal(Object.isFrozen(actual.optional), true);
  }
});

test("registry validation rejects clones, unknown identities, and renderer drift", () => {
  const api = freshManifest();
  const home = api.get("home");
  assert.throws(() => api.validate({ ...home }, { home() {} }), /identity/);
  assert.throws(() => api.validate(home, Object.create({ home() {} })), /renderer/);
  assert.throws(() => api.validate(home, { home: null }), /renderer/);
  assert.throws(() => api.get("region"), /unknown workspaceId/);
});
