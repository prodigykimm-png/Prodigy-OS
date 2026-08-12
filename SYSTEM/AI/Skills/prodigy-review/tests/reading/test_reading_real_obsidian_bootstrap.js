#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const { RealObsidianHarness, extractBlocks, snapshotProtected } = require("../shared/real_obsidian_harness.js");

const ROOT = path.resolve(__dirname, "../../../../../..");
const HUB_PATH = "HUB/20 Reading.md";

async function executeIsolatedReadingSession(label, protectedSnapshot) {
  const harness = await RealObsidianHarness.start(label, { protectedSnapshot });
  try {
    const receipt = await harness.openWorkspace("reading");
    const runtime = await harness.evaluate(`(()=>{
      const leaf = document.querySelector('.workspace-leaf-content[data-type="markdown"]');
      const shells = leaf ? [...leaf.querySelectorAll('.prodigy-app-shell')] : [];
      return {
        recoveries: leaf ? leaf.querySelectorAll('.prodigy-required-recovery').length : -1,
        shells: shells.map((shell) => shell.getAttribute('data-workspace-id')),
        performancePublished: Object.prototype.hasOwnProperty.call(window, '__readingWorkspacePerformance'),
        measurementPublished: Boolean(window.__readingWorkspaceMeasurement),
        candidateStorePublished: Boolean(window.KnowledgeCandidateStore),
        memoryPublished: Boolean(window.ReadingMemoryStore),
        knowledgeRoutePublished: Boolean(window.KnowledgeWorkspaceRoute)
      };
    })()`);
    return { receipt, runtime };
  } finally {
    const cleanup = await harness.close();
    assert.equal(cleanup.audit.equal, true, `${label}: fixture bytes must remain read-only`);
    assert.equal(cleanup.protectedContinuity.exact, true, cleanup.protectedContinuity.error || `${label}: protected identity changed`);
    assert.equal(cleanup.removed, true, `${label}: runtime root residue`);
    assert.equal(cleanup.portReusable, true, `${label}: listener residue`);
  }
}

test("real Obsidian Reading bootstrap executes all exact blocks without lexical ReferenceError in two isolated sessions", { timeout: 240000 }, async () => {
  const expectedBlocks = extractBlocks(fs.readFileSync(path.join(ROOT, HUB_PATH), "utf8"));
  assert.equal(expectedBlocks.length, 9, "Reading must retain all nine exact executable blocks");
  const protectedSnapshot = snapshotProtected();

  for (const session of ["first", "second"]) {
    const { receipt, runtime } = await executeIsolatedReadingSession(`reading-bootstrap-${session}`, protectedSnapshot);
    assert.equal(receipt.blocks, 9, `${session}: registered block count`);
    assert.equal(receipt.executions, 9, `${session}: executed block count`);
    assert.equal(receipt.status, "rendered", `${session}: ${JSON.stringify(receipt.errors || [])}`);
    assert.deepEqual(receipt.errors || [], [], `${session}: no exact-block processor errors`);
    assert.equal((receipt.errors || []).some((message) => /ReferenceError|readingPerformance is not defined/u.test(message)), false, `${session}: no lexical ReferenceError`);
    assert.deepEqual(runtime, {
      recoveries: 0,
      shells: ["reading"],
      performancePublished: true,
      measurementPublished: true,
      candidateStorePublished: true,
      memoryPublished: true,
      knowledgeRoutePublished: true
    }, `${session}: progressive Reading dependencies and single shell remain published`);
  }
});
