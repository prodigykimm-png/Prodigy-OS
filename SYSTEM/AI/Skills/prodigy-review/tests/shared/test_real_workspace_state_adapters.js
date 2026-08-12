#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { RealObsidianHarness, snapshotProtected } = require("./real_obsidian_harness.js");

const HUB_PATHS = { home: "HUB/00 Home.md", auction: "HUB/10 Auction.md" };

async function runWorkspace(workspaceId, protectedSnapshot) {
  const harness = await RealObsidianHarness.start(`workspace-state-${workspaceId}`, { protectedSnapshot });
  let cleanup;
  try {
    await harness.evaluate(`(async()=>{const file=app.vault.getAbstractFileByPath('SYSTEM/Views/prodigy-workspace-state-adapters.js');if(!file)throw new Error('state adapter module missing');(new Function(await app.vault.read(file)))();const adapter=window.ProdigyWorkspaceStateAdapters.createAdapter({workspaceId:${JSON.stringify(workspaceId)},generation:11,nonce:'mount-normal'});window.ProdigyWorkspaceStateAdapters.register(${JSON.stringify(workspaceId)},adapter);window.__prodigyStateTestAdapter=adapter;return true})()`);
    const receipt = await harness.openWorkspace(workspaceId);
    assert.equal(receipt.executions, receipt.blocks, `${workspaceId}: one exact Hub execution per block`);

    const initial = await harness.evaluate(`(()=>{const shell=document.querySelector('.prodigy-app-shell[data-workspace-id=${JSON.stringify(workspaceId)}]');const body=shell&&shell.querySelector('.prodigy-app-shell-body');const stable=()=>[...body.children].filter(node=>!node.hasAttribute('data-prodigy-state-owner')).map(node=>node.outerHTML).join('');window.__prodigyStateStableDom=stable();const attempts=[];const restore=[];const guard=(owner,label,names)=>{if(!owner)return;for(const name of names){if(typeof owner[name]!=='function')continue;const original=owner[name];owner[name]=function(){attempts.push(label+'.'+name);throw new Error('forbidden state seam call: '+label+'.'+name)};restore.push(()=>owner[name]=original)}};guard(app.vault,'vault',['create','createBinary','modify','modifyBinary','delete','trash','rename','copy','append','read','cachedRead','getFiles','getMarkdownFiles','getAbstractFileByPath']);guard(app.vault&&app.vault.adapter,'adapter',['write','writeBinary','append','mkdir','remove','rmdir','rename','copy','read']);guard(app.workspace,'navigation',['openLinkText','getLeaf','getMostRecentLeaf']);guard(app.metadataCache,'cache',['getFileCache','getCache','getFirstLinkpathDest']);guard(window,'network',['fetch']);window.__prodigyStateAttempts=attempts;window.__prodigyStateRestore=()=>restore.reverse().forEach(fn=>fn());return{owners:body.querySelectorAll('[data-prodigy-state-owner=${workspaceId}]').length,state:window.__prodigyStateTestAdapter.current().state,stable:window.__prodigyStateStableDom}})()`);
    assert.deepEqual({ owners: initial.owners, state: initial.state }, { owners: 1, state: "normal" }, JSON.stringify({ initial, receipt }));

    async function transition(state, nonce, extra) {
      return harness.evaluate(`(async()=>{const adapter=window.__prodigyStateTestAdapter;window.__prodigyStateAttempts.length=0;const expected=${JSON.stringify(state)};const signal=new Promise(resolve=>{const off=adapter.subscribe(fixture=>{if(fixture.state!==expected)return;off();resolve(fixture)})});const fixture=Object.assign({workspaceId:${JSON.stringify(workspaceId)},generation:11,nonce:${JSON.stringify(nonce)},state:expected},${JSON.stringify(extra || {})});const frozen=adapter.transition(fixture);const detail=await signal;const shell=document.querySelector('.prodigy-app-shell[data-workspace-id=${workspaceId}]');const body=shell.querySelector('.prodigy-app-shell-body');const owner=body.querySelector('[data-prodigy-state-owner=${workspaceId}]');const selectors={normal:'[data-state=success]',empty:'[data-state=empty]',loading:'[data-state=loading][aria-busy=true]',error:'[data-state=error].prodigy-required-recovery',selected:'[data-state=selected][aria-selected=true]',disabled:'[data-state=disabled][aria-disabled=true]:disabled'};const counts={};for(const [key,selector] of Object.entries(selectors))counts[key]=owner&&owner.matches(selector)?1:0;return{detail:{workspaceId:detail.workspaceId,state:detail.state,nonce:detail.nonce,generation:detail.generation},deepFrozen:Object.isFrozen(frozen)&&Object.keys(frozen).filter(key=>frozen[key]&&typeof frozen[key]==='object').every(key=>Object.isFrozen(frozen[key])),owners:body.querySelectorAll('[data-prodigy-state-owner=${workspaceId}]').length,counts,tag:owner&&owner.tagName,disabled:owner&&owner.disabled,stable:[...body.children].filter(node=>!node.hasAttribute('data-prodigy-state-owner')).map(node=>node.outerHTML).join(''),attempts:window.__prodigyStateAttempts.slice()}})()`);
    }
    async function assertState(state, nonce, extra) {
      const result = await transition(state, nonce, extra);
      assert.deepEqual(result.detail, { workspaceId, state, nonce, generation: 11 });
      assert.equal(result.deepFrozen, true);
      assert.equal(result.owners, 1);
      assert.equal(result.counts[state], 1);
      assert.equal(Object.entries(result.counts).filter(([key]) => key !== state).every(([, count]) => count === 0), true);
      assert.deepEqual(result.attempts, []);
      assert.equal(result.stable, initial.stable, `${workspaceId}: normal DOM outside canonical owner stays byte-equivalent`);
      if (state === "selected") assert.equal(result.tag, "BUTTON");
      if (state === "disabled") assert.deepEqual({ tag: result.tag, disabled: result.disabled }, { tag: "BUTTON", disabled: true });
    }

    await assertState("selected", "selected", { selection: { label: "Selected fixture" } });
    await assertState("normal", "normal-1");
    await assertState("disabled", "disabled", { disabled: { reason: "Disabled fixture" } });
    await assertState("normal", "normal-2");
    await assertState("loading", "loading");
    await assertState("normal", "normal-3");
    await assertState("error", "error", { error: { message: "Synthetic failure" }, recovery: { nonce: "retry-normal" } });
    const recovered = await harness.evaluate(`(async()=>{const adapter=window.__prodigyStateTestAdapter;window.__prodigyStateAttempts.length=0;const signal=new Promise(resolve=>{const off=adapter.subscribe(detail=>{if(detail.nonce!=='retry-normal')return;off();resolve(detail)})});document.querySelector('[data-prodigy-state-owner=${workspaceId}] button').click();const detail=await signal;return{state:detail.state,nonce:detail.nonce,attempts:window.__prodigyStateAttempts.slice()}})()`);
    assert.deepEqual(recovered, { state: "normal", nonce: "retry-normal", attempts: [] });
    await assertState("empty", "empty");
    await assertState("normal", "final-normal");

    const final = await harness.evaluate(`(async()=>{window.__prodigyStateRestore();const leaf=document.querySelector('.workspace-leaf-content[data-type="markdown"]');const shell=leaf.querySelector('.prodigy-app-shell');const block=shell.closest('.block-language-dataviewjs,.block-language-js-engine');const current=window.ProdigyHubLoader.currentWorkspace(block);const generation=Number(block.getAttribute('data-task13a-generation'));const result=window.ProdigyHubLoader.disposeWorkspace(block);await Promise.resolve();return{result,executions:${receipt.executions},blocks:${receipt.blocks},generation,subscribers:window.__prodigyStateTestAdapter.stats().subscribers,owners:leaf.querySelectorAll('[data-prodigy-state-owner=${workspaceId}]').length,shells:leaf.querySelectorAll('.prodigy-app-shell').length,current:Boolean(window.ProdigyHubLoader.currentWorkspace(block)),hadCurrent:Boolean(current)}})()`);
    assert.deepEqual({ result: final.result, executions: final.executions, blocks: final.blocks, subscribers: final.subscribers, owners: final.owners, shells: final.shells, current: final.current, hadCurrent: final.hadCurrent }, { result: true, executions: receipt.blocks, blocks: receipt.blocks, subscribers: 0, owners: 0, shells: 0, current: false, hadCurrent: true });
    assert.ok(Number.isSafeInteger(final.generation) && final.generation >= 1);
    return { workspaceId, receipt, final };
  } finally {
    cleanup = await harness.close();
    assert.equal(cleanup.audit.equal, true);
    assert.equal(cleanup.removed, true);
    assert.equal(cleanup.portReusable, true);
  }
}

test("Home and Auction each retain one real mount through the ordered state sequence in two isolated Obsidian sessions", { timeout: 600000 }, async () => {
  const protectedSnapshot = snapshotProtected();
  const home = await runWorkspace("home", protectedSnapshot);
  const auction = await runWorkspace("auction", protectedSnapshot);
  assert.deepEqual([home.workspaceId, auction.workspaceId], ["home", "auction"]);
  assert.deepEqual([HUB_PATHS.home, HUB_PATHS.auction], ["HUB/00 Home.md", "HUB/10 Auction.md"]);
});
