#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { RealObsidianHarness, snapshotProtected } = require("../shared/real_obsidian_harness.js");

const WIDTHS = [390, 834, 1068, 1440];
const THEMES = ["light", "dark"];
const ZOOMS = [1, 2];
const FORCED = [false, true];
const MANUAL = "수동 등록";

function exactManual(receipt) {
  const all = [...receipt.offenders.targetSize, ...receipt.offenders.zeroInteractive];
  return all.filter((item) => item.textSentinel === MANUAL);
}

test("real Obsidian Reading registration controls remain visible, 44px, and overflow-free across the strict matrix", { timeout: 240000 }, async () => {
  const harness = await RealObsidianHarness.start("reading-controls", { protectedSnapshot: snapshotProtected() });
  const rows = [];
  try {
    await harness.openWorkspace("reading");
    await harness.evaluate(`new Promise((resolve,reject)=>{const ready=()=>{const controller=window.__prodigyReadingDashboard,state=controller&&controller.getState&&controller.getState();if(!state||state.status==='loading')return false;observer.disconnect();clearTimeout(guard);resolve(state);return true},observer=new MutationObserver(ready),guard=setTimeout(()=>{observer.disconnect();reject(new Error('TASK13A_READING_READY_TIMEOUT'))},30000);observer.observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['data-state','aria-busy']});ready()})`);
    for (const width of WIDTHS) for (const theme of THEMES) for (const zoom of ZOOMS) for (const forcedColors of FORCED) {
      const receipt = await harness.capture("reading", width, theme, zoom, forcedColors, "normal");
      const manual = await harness.evaluate(`(()=>{const buttons=[...document.querySelectorAll('.prodigy-app-shell[data-workspace-id="reading"] button')].filter((button)=>(button.textContent||'').trim()===${JSON.stringify(MANUAL)});return buttons.map((button)=>{const box=button.getBoundingClientRect(),style=getComputedStyle(button);return{connected:button.isConnected,display:style.display,visibility:style.visibility,disabled:button.disabled,tabIndex:button.tabIndex,width:box.width,height:box.height}})})()`);
      assert.equal(manual.length, 1, `${width}/${theme}/${zoom}/${forcedColors}: inactive sheet copy stays detached`);
      const active = manual.filter((item) => item.connected && item.display !== "none" && item.visibility !== "hidden" && item.width > 0 && item.height > 0);
      assert.equal(active.length, 1, `${width}/${theme}/${zoom}/${forcedColors}: exactly one manual action is physically active`);
      assert.ok(active[0].width >= 44 && active[0].height >= 44, `${width}/${theme}/${zoom}/${forcedColors}: manual action geometry`);
      assert.equal(active[0].disabled, false);
      assert.ok(active[0].tabIndex >= 0, `${width}/${theme}/${zoom}/${forcedColors}: manual action keyboard order`);
      assert.deepEqual(exactManual(receipt), [], `${width}/${theme}/${zoom}/${forcedColors}: strict manual receipt`);
      assert.deepEqual(receipt.offenders.overflow, [], `${width}/${theme}/${zoom}/${forcedColors}: overflow`);
      assert.deepEqual(receipt.offenders.zeroInteractive, [], `${width}/${theme}/${zoom}/${forcedColors}: zero-size controls`);
      assert.deepEqual(receipt.offenders.targetSize, [], `${width}/${theme}/${zoom}/${forcedColors}: undersized controls`);
      assert.deepEqual(receipt.offenders.chromeShadow, [], `${width}/${theme}/${zoom}/${forcedColors}: chrome shadows`);
      assert.equal(receipt.shell.count, 1);
      assert.equal(receipt.navigation.matches, true);
      assert.deepEqual(receipt.keyboard.failures, [], `${width}/${theme}/${zoom}/${forcedColors}: keyboard progression`);
      rows.push({ width, theme, zoom, forcedColors, active: active.length });
    }
    assert.equal(rows.length, 32);
  } finally {
    const cleanup = await harness.close();
    assert.equal(cleanup.audit.equal, true);
    assert.equal(cleanup.protectedContinuity.exact, true, cleanup.protectedContinuity.error);
    assert.equal(cleanup.removed, true);
    assert.equal(cleanup.portReusable, true);
  }
});
