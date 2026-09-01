#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const { test } = require("node:test");
const { RealObsidianHarness } = require("../shared/real_obsidian_harness.js");

async function setViewport(harness, width) {
  await harness.cdp.send("Emulation.setDeviceMetricsOverride", {
    width,
    height: 900,
    deviceScaleFactor: 1,
    scale: 1,
    mobile: false,
  });
  await harness.evaluate(`new Promise((resolve,reject)=>{const finish=()=>{if(innerWidth!==${width})return;removeEventListener('resize',finish);clearTimeout(timer);requestAnimationFrame(()=>requestAnimationFrame(resolve))},timer=setTimeout(()=>{removeEventListener('resize',finish);reject(new Error('HOME_REMOVAL_VIEWPORT_TIMEOUT'))},5000);addEventListener('resize',finish);finish()})`);
}

test("real Home mounts with zero provider calls and no Morning Brief surface", { timeout: 180000 }, async (t) => {
  if (process.env.HOME_MORNING_REMOVAL_REAL_OBSIDIAN !== "1") {
    return t.skip("Home Morning removal real-Obsidian QA runs explicitly");
  }

  let harness;
  let cleanup;
  try {
    harness = await RealObsidianHarness.start("home-morning-removed");
    await harness.evaluate(`(()=>{
      window.__homeProviderCalls=0;
      const methods=new Set(['requestStructuredJson','requestStructuredJsonOnce','requestStructuredJsonNoRetry','requestChatText']);
      const wrap=value=>new Proxy(value,{get(target,key,receiver){const member=Reflect.get(target,key,receiver);if(!methods.has(key)||typeof member!=='function')return member;return function(){window.__homeProviderCalls+=1;return member.apply(target,arguments)}}});
      if(window.AIProviderService){
        window.AIProviderService=wrap(window.AIProviderService);
      }else{
        Object.defineProperty(window,'AIProviderService',{configurable:true,get(){return undefined},set(value){Object.defineProperty(window,'AIProviderService',{value:wrap(value),writable:true,configurable:true})}});
      }
      return true;
    })()`);
    await harness.mountStructuralWorkspace("home");
    await harness.collapseSidebar("home", "left");
    await harness.collapseSidebar("home", "right");
    await harness.waitForSelector('.prodigy-app-shell[data-workspace-id="home"] .home-action-queue');

    for (const width of [390, 1440]) {
      await setViewport(harness, width);
      const state = await harness.evaluate(`(()=>{
        const shell=document.querySelector('.prodigy-app-shell[data-workspace-id="home"]');
        const queue=shell&&shell.querySelector('.home-action-queue');
        const rows=queue?[...queue.querySelectorAll('.home-action-row')]:[];
        const manifest=window.ProdigyWorkspaceManifest&&window.ProdigyWorkspaceManifest.get('home');
        return {
          shell:Boolean(shell),
          queue:Boolean(queue),
          rows:rows.length,
          primary:rows.filter(row=>row.classList.contains('is-primary')).length,
          proposalRows:rows.filter(row=>row.dataset.actionKind==='focus_proposal').length,
          briefNodes:shell?shell.querySelectorAll('.home-brief,.home-brief-text,.home-stale-badge').length:0,
          providerCalls:Number(window.__homeProviderCalls||0),
          serviceLoaded:typeof window.MorningBriefService!=='undefined',
          manifestLoadsService:Boolean(manifest&&[...manifest.required,...manifest.optional].includes('SYSTEM/Views/morning-brief-service.js')),
          horizontalOverflow:Boolean(shell&&shell.scrollWidth>shell.clientWidth+1)
        };
      })()`);
      assert.equal(state.shell, true, `Home shell at ${width}px`);
      assert.equal(state.queue, true, `Home queue at ${width}px`);
      assert.ok(state.rows > 0 && state.rows <= 5, `bounded queue at ${width}px`);
      assert.equal(state.primary, 1, `one primary action at ${width}px`);
      assert.equal(state.proposalRows, 0, `no generated focus proposal at ${width}px`);
      assert.equal(state.briefNodes, 0, `no Morning Brief surface at ${width}px`);
      assert.equal(state.providerCalls, 0, `no provider calls at ${width}px`);
      assert.equal(state.serviceLoaded, false, `removed service is not loaded at ${width}px`);
      assert.equal(state.manifestLoadsService, false, `manifest excludes removed service at ${width}px`);
      assert.equal(state.horizontalOverflow, false, `Home fits at ${width}px`);
    }
    assert.deepEqual(harness.osNetworkAttempts, []);
  } finally {
    if (harness) cleanup = await harness.close();
  }

  assert.ok(cleanup);
  const cleanupEvidence = JSON.stringify(cleanup);
  assert.equal(cleanup.audit.equal, true, cleanupEvidence);
  assert.equal(cleanup.protectedContinuity.exact, true, cleanupEvidence);
  assert.equal(cleanup.removed, true, cleanupEvidence);
  assert.equal(cleanup.portReusable, true, cleanupEvidence);
});
