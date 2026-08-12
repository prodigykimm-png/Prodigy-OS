#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { RealObsidianHarness, snapshotProtected } = require("../shared/real_obsidian_harness.js");

const WIDTHS = [390, 834, 1068, 1440];
const THEMES = ["light", "dark"];
const ZOOMS = [1, 2];
const FORCED_COLORS = [false, true];

async function captureStrictMatrix(harness, workspaceId) {
  const rows = [];
  for (const width of WIDTHS) for (const theme of THEMES) for (const zoom of ZOOMS) for (const forcedColors of FORCED_COLORS) {
    rows.push(await harness.capture(workspaceId, width, theme, zoom, forcedColors, "normal"));
  }
  return rows;
}

test("real Obsidian Workout controls stay at least 44px without overflow across the strict matrix", { timeout: 240000 }, async () => {
  const harness = await RealObsidianHarness.start("workout-context-action-390", { protectedSnapshot: snapshotProtected() });
  const receipts = [];
  try {
    await harness.openWorkspace("workout");
    for (const width of WIDTHS) for (const theme of THEMES) for (const zoom of ZOOMS) for (const forcedColors of FORCED_COLORS) {
      const diagnostic = await harness.capture("workout", width, theme, zoom, forcedColors, "normal");
      const action = await harness.evaluate(`(()=>{const root=document.querySelector('.workout-hub-shell[data-task13a-selected-owner="true"]');const button=root&&[...root.querySelectorAll('.prodigy-context-actions > .prodigy-context-action')].find(element=>(element.textContent||'').trim()==='홈');if(!button)return null;const box=button.getBoundingClientRect(),style=getComputedStyle(button);return{text:(button.textContent||'').trim(),width:box.width,height:box.height,minInlineSize:style.minInlineSize,boxShadow:style.boxShadow,overflowX:style.overflowX}})()`);
      const cascade = await harness.evaluate(`(()=>{const nodes=[...document.head.children],styles=nodes.filter(node=>node.id==='prodigy-workout-hub-adoption-styles');return{count:styles.length,headIndex:styles[0]?nodes.indexOf(styles[0]):-1}})()`);
      receipts.push({
        width, theme, zoom, forcedColors, action, cascade,
        layoutStyleOrderUnchanged: diagnostic.layoutSettlement.styleOrderUnchanged,
        overflow: diagnostic.offenders.overflow,
        targetSize: diagnostic.offenders.targetSize,
        zeroInteractive: diagnostic.offenders.zeroInteractive,
        chromeShadow: diagnostic.offenders.chromeShadow,
        keyboardFailures: diagnostic.keyboard.failures,
        shellCount: diagnostic.shell.count,
        navigationMatches: diagnostic.navigation.matches,
        screenshot: diagnostic.screenshot,
      });
    }
    const badGeometry = receipts.filter((receipt) => !receipt.action || receipt.action.width < 44 || receipt.action.height < 44);
    const offenders = (group) => receipts.flatMap((receipt) => receipt[group].map((offender) => ({ matrix: { width: receipt.width, theme: receipt.theme, zoom: receipt.zoom, forcedColors: receipt.forcedColors }, offender })));
    for (const receipt of receipts) {
      assert.equal(receipt.action && receipt.action.boxShadow, "none", JSON.stringify(receipt));
      assert.notEqual(receipt.action && receipt.action.overflowX, "hidden", JSON.stringify(receipt));
      assert.deepEqual(receipt.keyboardFailures, [], JSON.stringify(receipt));
      assert.equal(receipt.shellCount, 1, JSON.stringify(receipt));
      assert.equal(receipt.navigationMatches, true, JSON.stringify(receipt));
      assert.equal(receipt.layoutStyleOrderUnchanged, true, "capture must not relocate any production style node");
      assert.equal(receipt.cascade.count, 1, "exactly one production Workout adoption style node");
      assert.match(receipt.screenshot.sha256, /^[a-f0-9]{64}$/u);
      assert.ok(receipt.screenshot.bytes > 0);
    }
    assert.equal(receipts.length, 32, "strict Workout matrix cardinality");
    assert.equal(new Set(receipts.map((receipt) => receipt.cascade.headIndex)).size, 1, "Workout adoption style retains its production head position across every capture");
    assert.deepEqual(badGeometry, [], `Workout Home geometry: ${JSON.stringify(badGeometry)}`);
    assert.deepEqual(offenders("overflow"), [], `Workout overflow: ${JSON.stringify(offenders("overflow"))}`);
    assert.deepEqual(offenders("targetSize"), [], `Workout target size: ${JSON.stringify(offenders("targetSize"))}`);
    assert.deepEqual(offenders("zeroInteractive"), [], `Workout zero geometry: ${JSON.stringify(offenders("zeroInteractive"))}`);
    assert.deepEqual(offenders("chromeShadow"), [], `Workout chrome shadow: ${JSON.stringify(offenders("chromeShadow"))}`);
  } finally {
    const cleanup = await harness.close();
    assert.equal(cleanup.audit.equal, true, "real fixture remains byte-read-only");
    assert.equal(cleanup.protectedContinuity.exact, true, cleanup.protectedContinuity.error || "protected process changed");
    assert.equal(cleanup.removed, true, "disposable runtime residue");
    assert.equal(cleanup.portReusable, true, "CDP port residue");
  }
});

test("shared diagnostic order cannot contaminate Workout responsive geometry", { timeout: 300000 }, async () => {
  const harness = await RealObsidianHarness.start("workout-shared-order", { protectedSnapshot: snapshotProtected() });
  try {
    for (const workspaceId of ["home", "auction", "reading"]) {
      await harness.openWorkspace(workspaceId);
      await captureStrictMatrix(harness, workspaceId);
    }
    await harness.openWorkspace("workout");
    const rows = await captureStrictMatrix(harness, "workout");
    const overflow = rows.flatMap((row) => row.offenders.overflow.map((offender) => ({ matrix: row.matrix, offender })));
    assert.deepEqual(overflow, [], `shared-order Workout overflow: ${JSON.stringify(overflow)}`);
  } finally {
    const cleanup = await harness.close();
    assert.equal(cleanup.audit.equal, true, "real fixture remains byte-read-only");
    assert.equal(cleanup.protectedContinuity.exact, true, cleanup.protectedContinuity.error || "protected process changed");
    assert.equal(cleanup.removed, true, "disposable runtime residue");
    assert.equal(cleanup.portReusable, true, "CDP port residue");
  }
});
