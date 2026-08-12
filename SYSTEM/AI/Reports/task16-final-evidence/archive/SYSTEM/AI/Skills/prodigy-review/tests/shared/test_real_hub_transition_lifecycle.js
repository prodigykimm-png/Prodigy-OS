#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { HUBS, RealObsidianHarness, snapshotProtected } = require("./real_obsidian_harness.js");

const SCENARIOS = Object.freeze(
  [390, 834, 1068, 1440].flatMap((width) =>
    ["light", "dark"].flatMap((theme) =>
      [1, 2].flatMap((zoom) =>
        [false, true].map((forcedColors) => Object.freeze({ width, theme, zoom, forcedColors }))
      )
    )
  )
);

async function activeState(harness, workspaceId) {
  return harness.evaluate(`(()=>{const leafObject=app.workspace.activeLeaf||app.workspace.getMostRecentLeaf();const host=leafObject&&leafObject.containerEl;const leaf=host&&(host.matches&&host.matches('.workspace-leaf-content[data-type="markdown"]')?host:host.querySelector('.workspace-leaf-content[data-type="markdown"]'));const shells=leaf?[...leaf.querySelectorAll('.prodigy-app-shell')]:[];const shell=shells[0]||null;const block=shell&&shell.closest('.block-language-dataviewjs,.block-language-js-engine');const mounted=block&&window.ProdigyHubLoader.currentWorkspace(block);return{shells:shells.length,workspace:shell&&shell.dataset.workspaceId||null,connected:Boolean(shell&&shell.isConnected),visible:Boolean(shell&&getComputedStyle(shell).display!=='none'&&getComputedStyle(shell).visibility!=='hidden'),owned:Boolean(mounted&&mounted.signal&&!mounted.signal.aborted&&block.contains(shell)),activeFile:app.workspace.getActiveFile()&&app.workspace.getActiveFile().path||null,blockConnected:Boolean(block&&block.isConnected)}})()`);
}

async function exactReconnect(harness, kind) {
  return harness.evaluate(`new Promise((resolve,reject)=>{const leafObject=app.workspace.activeLeaf||app.workspace.getMostRecentLeaf();const host=leafObject&&leafObject.containerEl;const leaf=host&&(host.matches&&host.matches('.workspace-leaf-content[data-type="markdown"]')?host:host.querySelector('.workspace-leaf-content[data-type="markdown"]'));const shell=leaf&&leaf.querySelector('.prodigy-app-shell');const block=shell&&shell.closest('.block-language-dataviewjs,.block-language-js-engine');const target=${JSON.stringify(kind)}==='shell'?shell:block;if(!target){reject(new Error('transition target missing'));return}let transfers=0;const finish=()=>{const active=[...leaf.querySelectorAll('.prodigy-app-shell')];const next=active[0]&&active[0].closest('.block-language-dataviewjs,.block-language-js-engine');const mounted=next&&window.ProdigyHubLoader.currentWorkspace(next);if(active.length===1&&active[0].isConnected&&next&&next.isConnected&&mounted&&mounted.signal&&!mounted.signal.aborted&&next.contains(active[0])){observer.disconnect();clearTimeout(guard);resolve({kind:${JSON.stringify(kind)},transfers,shells:active.length,owned:true})}};const observer=new MutationObserver(records=>{transfers+=records.reduce((sum,record)=>sum+[...record.addedNodes].filter(node=>node.nodeType===1&&(node===target||node.contains&&node.contains(target))).length,0);finish()});observer.observe(leaf,{childList:true,subtree:true});const guard=setTimeout(()=>{observer.disconnect();reject(new Error('exact transition reconnect timed out'))},10000);target.remove();finish()})`);
}

async function staleDisposalIsHarmless(harness) {
  return harness.evaluate(`(()=>{const leafObject=app.workspace.activeLeaf||app.workspace.getMostRecentLeaf();const host=leafObject&&leafObject.containerEl;const leaf=host&&(host.matches&&host.matches('.workspace-leaf-content[data-type="markdown"]')?host:host.querySelector('.workspace-leaf-content[data-type="markdown"]'));const currentShell=leaf.querySelector('.prodigy-app-shell');const currentBlock=currentShell.closest('.block-language-dataviewjs,.block-language-js-engine');const stale=[...leaf.querySelectorAll('.block-language-dataviewjs,.block-language-js-engine')].find(block=>block!==currentBlock&&!block.querySelector('.prodigy-app-shell'));const result=stale?window.ProdigyHubLoader.disposeWorkspace(stale):false;return{hadStale:Boolean(stale),staleDisposed:result===true,shells:leaf.querySelectorAll('.prodigy-app-shell').length,current:window.ProdigyHubLoader.currentWorkspace(currentBlock)!==null}})()`);
}

test("all eight real Hub owners survive every strict 32-cell transition and dispose to zero", { timeout: 900000 }, async (t) => {
  const harness = await RealObsidianHarness.start("hub-transition-lifecycle", { protectedSnapshot: snapshotProtected() });
  const counts = {};
  try {
    for (const [workspaceId, hubPath] of HUBS) {
      await harness.openWorkspace(workspaceId);
      assert.deepEqual(await activeState(harness, workspaceId), {
        shells: 1, workspace: workspaceId, connected: true, visible: true, owned: true,
        activeFile: hubPath, blockConnected: true,
      }, `${workspaceId}: initial exact owner`);

      counts[workspaceId] = { initial: 1, transitions: 0, shellReconnects: 0, blockReconnects: 0 };
      for (let index = 0; index < SCENARIOS.length; index += 1) {
        const scenario = SCENARIOS[index];
        const kind = index % 2 === 0 ? "block" : "shell";
        const transfer = await exactReconnect(harness, kind);
        assert.deepEqual({ shells: transfer.shells, owned: transfer.owned }, { shells: 1, owned: true }, `${workspaceId}/${index}: atomic ${kind} transfer`);
        const receipt = await harness.capture(workspaceId, scenario.width, scenario.theme, scenario.zoom, scenario.forcedColors, "normal");
        assert.deepEqual({ shellCount: receipt.shell.count, activeFile: receipt.navigation.activeFile, matches: receipt.navigation.matches },
          { shellCount: 1, activeFile: hubPath, matches: true }, `${workspaceId}/${index}: strict active owner`);
        counts[workspaceId].transitions += 1;
        counts[workspaceId][kind === "block" ? "blockReconnects" : "shellReconnects"] += 1;
      }

      const stale = await staleDisposalIsHarmless(harness);
      assert.deepEqual({ staleDisposed: stale.staleDisposed, shells: stale.shells, current: stale.current }, { staleDisposed: false, shells: 1, current: true }, `${workspaceId}: stale disposal CAS`);
      const disposed = await harness.evaluate(`(()=>{const leafObject=app.workspace.activeLeaf||app.workspace.getMostRecentLeaf();const host=leafObject&&leafObject.containerEl;const leaf=host&&(host.matches&&host.matches('.workspace-leaf-content[data-type="markdown"]')?host:host.querySelector('.workspace-leaf-content[data-type="markdown"]'));const shell=leaf.querySelector('.prodigy-app-shell');const block=shell.closest('.block-language-dataviewjs,.block-language-js-engine');return{result:window.ProdigyHubLoader.disposeWorkspace(block),shells:leaf.querySelectorAll('.prodigy-app-shell').length,current:window.ProdigyHubLoader.currentWorkspace(block)!==null}})()`);
      assert.deepEqual(disposed, { result: true, shells: 0, current: false }, `${workspaceId}: close/dispose zero`);
    }
    assert.equal(Object.values(counts).reduce((sum, item) => sum + item.transitions, 0), 256);
    t.diagnostic(JSON.stringify(counts));
  } finally {
    const cleanup = await harness.close();
    assert.equal(cleanup.audit.equal, true);
    assert.equal(cleanup.protectedContinuity.exact, true, cleanup.protectedContinuity.error || "protected identity changed");
    assert.equal(cleanup.removed, true);
    assert.equal(cleanup.portReusable, true);
  }
});
