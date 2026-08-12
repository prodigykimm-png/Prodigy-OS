#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { RealObsidianHarness, snapshotProtected } = require("../shared/real_obsidian_harness.js");

const WIDTHS = [390, 834, 1068, 1440];
const THEMES = ["light", "dark"];
const ZOOMS = [1, 2];
const FORCED_COLORS = [false, true];
const HOME = "홈";

function matching(receipt, group, labels) {
  return receipt.offenders[group].filter((item) => labels.has(item.textSentinel));
}

test("real Obsidian Auction context action stays visible, 44px, shadow-free, and navigable across the strict matrix", { timeout: 240000 }, async () => {
  const harness = await RealObsidianHarness.start("auction-context-action", { protectedSnapshot: snapshotProtected() });
  const rows = [];
  const badGeometry = [];
  const targetReceipts = [];
  const zeroReceipts = [];
  const activeGeometry = [];
  try {
    const blockReceipt = await harness.openWorkspace("auction");
    assert.equal(blockReceipt.blocks, 12, "all exact Auction blocks are registered");
    assert.equal(blockReceipt.executions, 12, "all exact Auction blocks reach the real processor boundary");
    const adoptionStyleMoved = await harness.evaluate(`(()=>{const style=document.getElementById('prodigy-auction-hub-adoption-styles');if(!style)return false;document.head.appendChild(style);return document.head.lastElementChild===style})()`);
    assert.equal(adoptionStyleMoved, true, "exercise the verified later Auction adoption cascade");
    for (const width of WIDTHS) for (const theme of THEMES) for (const zoom of ZOOMS) for (const forcedColors of FORCED_COLORS) {
      const receipt = await harness.capture("auction", width, theme, zoom, forcedColors, "normal");
      const actions = await harness.evaluate(`(()=>{const root=document.querySelector('.auction-hub-shell[data-task13a-selected-owner="true"]');const controls=root?[...root.querySelectorAll('button,a[href],[role=button],[role=tab],input,select,textarea')]:[];return root?[...root.querySelectorAll('.prodigy-context-actions > .prodigy-context-action')].map(button=>{const box=button.getBoundingClientRect(),style=getComputedStyle(button);return{text:(button.textContent||'').trim(),connected:button.isConnected,display:style.display,visibility:style.visibility,width:box.width,height:box.height,minInlineSize:style.minInlineSize,tabIndex:button.tabIndex,disabled:button.disabled,focusIndex:controls.indexOf(button),boxShadow:style.boxShadow,overflowX:style.overflowX}}):[]})()`);
      assert.ok(actions.length > 0, `${width}/${theme}/${zoom}/${forcedColors}: context actions exist`);
      const labels = new Set(actions.map((action) => action.text));
      assert.equal(labels.has(HOME), true, `${width}/${theme}/${zoom}/${forcedColors}: Home action exists`);
      for (const action of actions) {
        assert.equal(action.connected, true);
        assert.notEqual(action.display, "none", `${width}/${theme}/${zoom}/${forcedColors}/${action.text}: displayed`);
        assert.equal(action.visibility, "visible");
        assert.equal(action.disabled, false);
        if (action.width < 44 || action.height < 44) badGeometry.push({ width, theme, zoom, forcedColors, text: action.text, minInlineSize: action.minInlineSize, geometry: `${action.width}x${action.height}` });
        assert.ok(action.tabIndex >= 0 && action.focusIndex >= 0, `${width}/${theme}/${zoom}/${forcedColors}/${action.text}: focus order`);
        assert.equal(action.boxShadow, "none", `${width}/${theme}/${zoom}/${forcedColors}/${action.text}: shadow-free`);
        assert.notEqual(action.overflowX, "hidden", `${width}/${theme}/${zoom}/${forcedColors}/${action.text}: no clipped action`);
      }
      targetReceipts.push(...matching(receipt, "targetSize", labels).map((item) => ({ width, theme, zoom, forcedColors, text: item.textSentinel, geometry: item.boundingBox })));
      zeroReceipts.push(...matching(receipt, "zeroInteractive", labels).map((item) => ({ width, theme, zoom, forcedColors, text: item.textSentinel, geometry: item.boundingBox })));
      assert.deepEqual(receipt.offenders.overflow, [], `${width}/${theme}/${zoom}/${forcedColors}: overflow`);
      assert.deepEqual(receipt.offenders.chromeShadow, [], `${width}/${theme}/${zoom}/${forcedColors}: chrome shadows`);
      assert.deepEqual(receipt.keyboard.failures, [], `${width}/${theme}/${zoom}/${forcedColors}: keyboard progression`);
      assert.equal(receipt.shell.count, 1);
      assert.equal(receipt.navigation.matches, true);
      if (width === 390) {
        await harness.issueMediaAuthority("auction", theme, forcedColors, `auction-active:390:${zoom}`);
        const documentNode = await harness.cdp.send("DOM.getDocument", { depth: 0 });
        const selected = await harness.cdp.send("DOM.querySelector", { nodeId: documentNode.root.nodeId, selector: ".auction-hub-shell[data-task13a-selected-owner=\"true\"] .prodigy-context-actions > button.prodigy-context-action" });
        assert.ok(selected.nodeId, `${theme}/${zoom}/${forcedColors}: active context node`);
        await harness.cdp.send("CSS.forcePseudoState", { nodeId: selected.nodeId, forcedPseudoClasses: ["active"] });
        const active = await harness.evaluate(`(()=>{const button=document.querySelector('.auction-hub-shell[data-task13a-selected-owner="true"] .prodigy-context-actions > button.prodigy-context-action');const box=button.getBoundingClientRect(),style=getComputedStyle(button);return{width:box.width,height:box.height,transform:style.transform,boxShadow:style.boxShadow}})()`);
        await harness.cdp.send("CSS.forcePseudoState", { nodeId: selected.nodeId, forcedPseudoClasses: [] });
        if (active.width < 44 || active.height < 44) activeGeometry.push({ theme, zoom, forcedColors, ...active });
      }
      rows.push(receipt.matrix);
    }
    assert.equal(rows.length, 32);
    assert.deepEqual(targetReceipts, [], `strict target receipts: ${JSON.stringify(targetReceipts)}`);
    assert.deepEqual(zeroReceipts, [], `strict zero-size receipts: ${JSON.stringify(zeroReceipts)}`);
    assert.deepEqual(badGeometry, [], `context action geometry: ${JSON.stringify(badGeometry)}`);
    assert.deepEqual(activeGeometry, [], `active context action geometry: ${JSON.stringify(activeGeometry)}`);

    const navigation = await harness.evaluate(`new Promise((resolve,reject)=>{const root=document.querySelector('.auction-hub-shell[data-task13a-selected-owner="true"]');const button=root&&root.querySelector('.prodigy-context-actions > button.prodigy-context-action');if(!button){reject(new Error('AUCTION_HOME_ACTION_MISSING'));return}let settled=false;let guard;const ref=app.workspace.on('file-open',(file)=>{if(!file||file.path!=='HUB/00 Home.md')return;settled=true;clearTimeout(guard);app.workspace.offref(ref);resolve({path:file.path,text:(button.textContent||'').trim()})});guard=setTimeout(()=>{if(settled)return;app.workspace.offref(ref);reject(new Error('AUCTION_HOME_NAVIGATION_TIMEOUT'))},10000);button.click()})`);
    assert.deepEqual(navigation, { path: "HUB/00 Home.md", text: HOME });
  } finally {
    const cleanup = await harness.close();
    assert.equal(cleanup.audit.equal, true);
    assert.equal(cleanup.protectedContinuity.exact, true, cleanup.protectedContinuity.error);
    assert.equal(cleanup.removed, true);
    assert.equal(cleanup.portReusable, true);
  }
});
