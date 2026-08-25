"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { test } = require("node:test");

const ROOT = path.resolve(__dirname, "../../../../../..");
const VIEWS = path.join(ROOT, "SYSTEM/Views");
const MODULES = Object.freeze({
  "llmwiki-operation-writer-core.js": null,
  "llmwiki-update-authority.js": ["authorizeCanonicalUpdate", "commitApprovedUpdate"],
  "llmwiki-canonical-v2-authority.js": ["authorizeCanonicalV2", "commitApprovedCanonicalV2"],
  "llmwiki-finalized-revision-bridge.js": ["bridgeFinalizedRevision"],
  "llmwiki-lifecycle-migration-authority.js": ["authorizeLifecycleMigration", "verifyLifecycleMigrationApproval"],
});
const PUBLIC_KEYS = Object.freeze([
  "APPROVAL_VERSION", "COMPENSATION_VERSION", "MAX_CANONICAL_BYTES", "RECEIPT_VERSION",
  "assertAtomicReplaceRequest", "assertRestoreRequest", "authorizeCanonicalUpdate", "authorizeCanonicalV2",
  "authorizeLifecycleMigration", "commitApprovedCanonicalV2", "commitApprovedUpdate", "isApprovalConsumed",
  "isCanonicalV2Approval", "isLifecycleMigrationApproval", "isUpdateApproval", "verifyLifecycleMigrationApproval",
]);

function pureLoc(source) {
  return source.split("\n").filter((line) => line.trim() && !line.trim().startsWith("//")).length;
}

test("Given the operation writer modules, When their boundaries are inspected, Then each authority has one specific role under 250 pure LOC", () => {
  for (const [name, expectedKeys] of Object.entries(MODULES)) {
    const modulePath = path.join(VIEWS, name);
    assert.equal(fs.existsSync(modulePath), true, name);
    const source = fs.readFileSync(modulePath, "utf8");
    assert.equal(pureLoc(source) <= 250, true, `${name}: ${pureLoc(source)} pure LOC`);
    assert.equal(source.includes("SIZE_OK"), false, name);
    const api = require(modulePath);
    if (expectedKeys) assert.deepEqual(Object.keys(api).sort(), [...expectedKeys].sort(), name);
  }
  const facadeSource = fs.readFileSync(path.join(VIEWS, "llmwiki-operation-writer.js"), "utf8");
  assert.equal(pureLoc(facadeSource) <= 250, true, `facade: ${pureLoc(facadeSource)} pure LOC`);
  assert.equal(facadeSource.includes("SIZE_OK"), false);
});

test("Given the stable writer facade, When its public surface is enumerated, Then no generic mutation seam is exposed", () => {
  const writer = require(path.join(VIEWS, "llmwiki-operation-writer.js"));
  assert.deepEqual(Object.keys(writer).sort(), [...PUBLIC_KEYS].sort());
  assert.equal(Object.keys(writer).some((key) => /create.*transaction|execute.*transaction|generic|mutate|writer/iu.test(key)), false);
});
