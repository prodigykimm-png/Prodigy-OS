#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const { RealObsidianHarness, extractBlocks } = require("../shared/real_obsidian_harness.js");

const ROOT = path.resolve(__dirname, "../../../../../..");
const STORE_PATH = "SYSTEM/Views/knowledge-candidate-store.js";
const WORKSPACES = [
  ["reading", "HUB/20 Reading.md"],
  ["knowledge", "HUB/50 Knowledge.md"],
  ["journal", "HUB/70 Journal.md"],
];
const sha256 = (value) => crypto.createHash("sha256").update(value).digest("hex");

// This is intentionally a real-app boundary test: the leaked Electron CommonJS
// globals and exact Hub execution semantics do not exist in the Node VM harness.
test("real Obsidian executes the exact Reading, Knowledge, and Journal Hub blocks through the candidate-store boundary", { timeout: 180000 }, async () => {
  const expectedStoreHash = sha256(fs.readFileSync(path.join(ROOT, STORE_PATH)));
  const expectedHubBlocks = new Map(WORKSPACES.map(([workspaceId, hubPath]) => [
    workspaceId,
    extractBlocks(fs.readFileSync(path.join(ROOT, hubPath), "utf8")).map((block) => block.sha256),
  ]));
  let harness;
  try {
    harness = await RealObsidianHarness.start("candidate-store-boundary");
    assert.equal(sha256(fs.readFileSync(path.join(harness.runtime.vault, STORE_PATH))), expectedStoreHash, "fixture must execute the current candidate-store bytes");

    for (const [workspaceId, hubPath] of WORKSPACES) {
      const receipt = await harness.openWorkspace(workspaceId);
      const actualHubHashes = harness.runtime.manifest[hubPath].map((block) => block.sha256);
      assert.deepEqual(actualHubHashes, expectedHubBlocks.get(workspaceId), `${workspaceId} must execute every exact current Hub block`);
      assert.equal(receipt.executions, receipt.blocks, `${workspaceId} must complete every registered exact block`);
      const runtime = await harness.evaluate(`(()=>{const leaf=document.querySelector('.workspace-leaf-content[data-type="markdown"]');const shells=leaf?[...leaf.querySelectorAll('.prodigy-app-shell')]:[];return{candidateStore:!!window.KnowledgeCandidateStore,recoveries:leaf?leaf.querySelectorAll('.prodigy-required-recovery').length:-1,shells:shells.map((shell)=>shell.getAttribute('data-workspace-id'))}})()`);
      assert.equal(runtime.candidateStore, true, `${workspaceId} must publish KnowledgeCandidateStore`);
      assert.equal(runtime.recoveries, 0, `${workspaceId} must leave required-resource recovery`);
      assert.deepEqual(runtime.shells, [workspaceId], `${workspaceId} must produce one correct AppShell candidate`);
    }
  } finally {
    if (harness) {
      const receipt = await harness.close();
      assert.equal(receipt.audit.equal, true, "real Obsidian fixture stays byte-for-byte read-only");
      assert.equal(receipt.removed, true, "real Obsidian fixture leaves no residue");
      assert.equal(receipt.portReusable, true, "real Obsidian listener leaves no residue");
    }
  }
});
