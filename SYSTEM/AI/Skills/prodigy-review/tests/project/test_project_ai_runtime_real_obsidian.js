#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const os = require("node:os");
const path = require("node:path");
const { test } = require("node:test");
const { RealObsidianHarness } = require("../shared/real_obsidian_harness.js");

const PLUGIN_ROOT = path.join(os.homedir(), "Developer/prodigy-ai-runtime");

function waitForText(harness, selector, expected, label) {
  return harness.evaluate(`new Promise((resolve,reject)=>{
    const finish=()=>{
      const node=document.querySelector(${JSON.stringify(selector)});
      if(!node||!String(node.textContent||"").includes(${JSON.stringify(expected)}))return;
      observer.disconnect();clearTimeout(timer);resolve(String(node.textContent||""));
    };
    const observer=new MutationObserver(finish);
    observer.observe(document.body,{childList:true,subtree:true,characterData:true});
    const timer=setTimeout(()=>{observer.disconnect();const node=document.querySelector(${JSON.stringify(selector)});reject(new Error(${JSON.stringify(label)}+":"+String(node?.textContent||"").slice(0,1000)))},10000);
    finish();
  })`);
}

function waitForAttribute(harness, selector, attribute, expected, label) {
  return harness.evaluate(`new Promise((resolve,reject)=>{
    const finish=()=>{
      const node=document.querySelector(${JSON.stringify(selector)});
      if(!node||node.getAttribute(${JSON.stringify(attribute)})!==${JSON.stringify(expected)})return;
      observer.disconnect();clearTimeout(timer);resolve(true);
    };
    const observer=new MutationObserver(finish);
    observer.observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:[${JSON.stringify(attribute)}]});
    const timer=setTimeout(()=>{observer.disconnect();reject(new Error(${JSON.stringify(label)}))},10000);
    finish();
  })`);
}

test("real Project Wizard uses only ProdigyAIClient and preserves its draft on runtime failure", {
  timeout: 120000,
}, async () => {
  let harness;
  try {
    harness = await RealObsidianHarness.start("project-ai-runtime", {
      fixtureMutation: { prodigyAIRuntimePluginPath: PLUGIN_ROOT },
    });
    await harness.evaluate(`(async()=>{
      await app.plugins.loadManifests();
      if(!app.plugins.plugins["prodigy-ai-runtime"])await app.plugins.enablePluginAndSave("prodigy-ai-runtime");
      return true;
    })()`);
    await harness.openWorkspace("project");
    await harness.capture("project", 1440, "light", 1, false, "normal");
    const receipt = await harness.evaluate(`window.__task13aReceipts?.["HUB/40 Project.md"]||null`);
    assert.equal(receipt && receipt.status, "rendered", JSON.stringify(receipt));
    await harness.waitForSelector('[data-project-action="open-wizard"]');
    await harness.renderedClick('[data-project-action="open-wizard"]');
    await harness.waitForSelector(".prodigy-project-wizard");
    const prepared = await harness.evaluate(`(()=>{
      const root=document.querySelector(".prodigy-project-wizard");
      const textInputs=[...root.querySelectorAll('input:not([type="date"])')];
      const dates=[...root.querySelectorAll('input[type="date"]')];
      textInputs[0].value="AI Runtime QA";
      textInputs[0].dispatchEvent(new Event("input",{bubbles:true}));
      dates[0].value="2026-09-01";
      dates[0].dispatchEvent(new Event("input",{bubbles:true}));
      dates[1].value="2026-09-30";
      dates[1].dispatchEvent(new Event("input",{bubbles:true}));
      const labels=[...root.querySelectorAll(".prodigy-workflow-input")].map(input=>input.value);
      return {labels,runtimeText:root.querySelector(".prodigy-project-provider")?.textContent||""};
    })()`);
    assert.equal(await harness.evaluate(`document.querySelector(".prodigy-project-provider")?.getAttribute("data-project-ai-runtime-status")`), "connection");
    const failedReady = waitForAttribute(harness, ".prodigy-project-wizard", "data-project-ai-request-state", "failed", "PROJECT_RUNTIME_FAILURE_TIMEOUT");
    await harness.renderedClick('[data-project-ai-action="refine-workflow"]');
    await failedReady;
    const failed = await harness.evaluate(`(()=>({
      labels:[...document.querySelectorAll(".prodigy-project-wizard .prodigy-workflow-input")].map(input=>input.value),
      writes:(window.__task13aWriteAttempts||[]).filter(row=>String(row.path||"").startsWith("PARA/PROJECTS/")),
      network:(window.__task13aNodeNetworkAttempts||[]).length
    }))()`);
    assert.deepEqual(failed.labels, prepared.labels);
    assert.deepEqual(failed.writes, []);
    assert.equal(failed.network, 0);

    await harness.evaluate(`(()=>{
      const original=window.ProdigyAIClient;
      window.__projectOriginalClient=original;
      window.ProdigyAIClient=Object.freeze({...original,createClient:()=>({
        getStatus:()=>({ok:true,status:"ready"}),
        getConsentRequirement:()=>({status:"ready"}),
        openSettings:()=>true,
        requestStructured:async request=>({
          ok:true,status:"completed",
          payload:{workflow:[
            {label:"범위 확정"},{label:"구현"},{label:"검증"},{label:"회고"}
          ]},
          receipt:{provider_key:"fake-runtime",model:"fake-model",consumer_id:request.consumer_id,attempt_id:request.attempt_id}
        })
      })});
      return true;
    })()`);
    const successReady = waitForAttribute(harness, ".prodigy-project-wizard", "data-project-ai-request-state", "completed", "PROJECT_RUNTIME_SUCCESS_TIMEOUT");
    await harness.renderedClick('[data-project-ai-action="refine-workflow"]');
    await successReady;
    const success = await harness.evaluate(`(()=>({
      labels:[...document.querySelectorAll(".prodigy-project-wizard .prodigy-workflow-input")].map(input=>input.value),
      writes:(window.__task13aWriteAttempts||[]).filter(row=>String(row.path||"").startsWith("PARA/PROJECTS/")),
      network:(window.__task13aNodeNetworkAttempts||[]).length
    }))()`);
    assert.deepEqual(success.labels, ["범위 확정", "구현", "검증", "회고"]);
    assert.deepEqual(success.writes, []);
    assert.equal(success.network, 0);
    assert.deepEqual(harness.osNetworkAttempts, []);
    await harness.evaluate(`(()=>{window.ProdigyAIClient=window.__projectOriginalClient;delete window.__projectOriginalClient;document.querySelector(".modal-close-button")?.click();return true})()`);
  } finally {
    if (harness) {
      const closed = await harness.close();
      assert.equal(closed.audit.equal, true);
      assert.equal(closed.protectedContinuity.exact, true);
      assert.equal(closed.removed, true);
      assert.equal(closed.portReusable, true);
    }
  }
});
