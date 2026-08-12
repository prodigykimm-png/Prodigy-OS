#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { RealObsidianHarness } = require("../shared/real_obsidian_harness.js");

test("production Workout mount publishes and disposes its actual single dashboard controller", { timeout: 240000 }, async () => {
  let harness;
  let cleanup;
  try {
    harness = await RealObsidianHarness.start("workout-controller-publication");
    await harness.openWorkspace("workout");
    await harness.evaluate(`new Promise((resolve,reject)=>{const finish=()=>{const root=[...document.querySelectorAll('.workout-workspace-content')].find(element=>{const box=element.getBoundingClientRect();return box.width>0&&box.height>0});if(!root?.querySelector('.workout-health-tab[aria-selected="true"]')||!window.__prodigyWorkoutController)return;observer.disconnect();clearTimeout(guard);resolve(true)};const observer=new MutationObserver(finish);observer.observe(document,{subtree:true,childList:true,attributes:true,attributeFilter:['aria-selected']});const guard=setTimeout(()=>{observer.disconnect();reject(new Error('WORKOUT_PUBLISHED_READY_TIMEOUT'))},20000);finish()})`);
    const mounted = await harness.evaluate(`(()=>{const roots=[...document.querySelectorAll('.workout-workspace-content')].filter(root=>{const box=root.getBoundingClientRect();return box.width>0&&box.height>0});const controller=window.__prodigyWorkoutController;return{roots:roots.length,published:Boolean(controller),openTab:typeof controller?.openTab,dispose:typeof controller?.dispose,active:roots[0]?.querySelector('.workout-health-tab[aria-selected="true"]')?.dataset.tab||null}})()`);
    assert.deepEqual(mounted, { roots: 1, published: true, openTab: "function", dispose: "function", active: "strength" });

    const switched = await harness.evaluate(`new Promise((resolve,reject)=>{const root=[...document.querySelectorAll('.workout-workspace-content')].find(element=>{const box=element.getBoundingClientRect();return box.width>0&&box.height>0});const controller=window.__prodigyWorkoutController;if(!root||!controller){reject(new Error('WORKOUT_PUBLISHED_OWNER_MISSING'));return}const finish=()=>{const tab=root.querySelector('#workout-tab-nutrition[aria-selected="true"]');if(!tab)return;observer.disconnect();clearTimeout(guard);resolve({roots:[...document.querySelectorAll('.workout-workspace-content')].filter(element=>{const box=element.getBoundingClientRect();return box.width>0&&box.height>0}).length,active:tab.dataset.tab})};const observer=new MutationObserver(finish);observer.observe(root,{subtree:true,attributes:true,attributeFilter:['aria-selected','hidden','aria-busy']});const guard=setTimeout(()=>{observer.disconnect();reject(new Error('WORKOUT_PUBLISHED_SWITCH_TIMEOUT'))},20000);controller.openTab('nutrition');finish()})`);
    assert.deepEqual(switched, { roots: 1, active: "nutrition" }, "published controller drives the one production dashboard");

    const disposed = await harness.evaluate(`(()=>{const shell=document.querySelector('.prodigy-app-shell[data-workspace-id="workout"]');const block=shell&&shell.closest('.block-language-js-engine');const result=block&&ProdigyHubLoader.disposeWorkspace(block);return{result:result===true,published:Object.hasOwn(window,'__prodigyWorkoutController'),roots:document.querySelectorAll('.workout-workspace-content').length}})()`);
    assert.deepEqual(disposed, { result: true, published: false, roots: 0 });
  } finally {
    if (harness) cleanup = await harness.close();
  }
  assert.equal(cleanup.audit.equal, true, "fixture Vault remains byte-read-only");
  assert.equal(cleanup.protectedContinuity.exact, true, cleanup.protectedContinuity.error || "protected process changed");
  assert.equal(cleanup.removed, true);
  assert.equal(cleanup.portReusable, true);
});
