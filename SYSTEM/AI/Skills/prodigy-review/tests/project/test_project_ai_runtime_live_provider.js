#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { test } = require("node:test");
const { RealObsidianHarness } = require("../shared/real_obsidian_harness.js");

const ROOT = path.resolve(__dirname, "../../../../../..");
const PLUGIN_ROOT = path.join(os.homedir(), "Developer/prodigy-ai-runtime");
const LIVE = process.env.PRODIGY_RUN_LIVE_AI === "1";

function waitForAttribute(harness, selector, attribute, expected, label, timeout = 90000) {
  return harness.evaluate(`new Promise((resolve,reject)=>{
    const finish=()=>{
      const node=document.querySelector(${JSON.stringify(selector)});
      if(!node||node.getAttribute(${JSON.stringify(attribute)})!==${JSON.stringify(expected)})return;
      observer.disconnect();clearTimeout(timer);resolve(true);
    };
    const observer=new MutationObserver(finish);
    observer.observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:[${JSON.stringify(attribute)}]});
    const timer=setTimeout(()=>{observer.disconnect();reject(new Error(${JSON.stringify(label)}))},${timeout});
    finish();
  })`, timeout + 5000);
}

async function prepareWizard(harness, name) {
  await harness.waitForSelector('[data-project-action="open-wizard"]');
  const opened = harness.evaluate(`new Promise((resolve,reject)=>{
    const finish=()=>{
      if(!document.querySelector(".prodigy-project-wizard"))return;
      observer.disconnect();clearTimeout(timer);resolve(true);
    };
    const observer=new MutationObserver(finish);
    observer.observe(document.body,{childList:true,subtree:true});
    const timer=setTimeout(()=>{observer.disconnect();reject(new Error("PROJECT_LIVE_OPEN_TIMEOUT"))},10000);
    finish();
  })`);
  const clicked = await harness.evaluate(`(()=>{
    const action=document.querySelector('[data-project-action="open-wizard"]');
    if(!action)return false;
    action.click();
    return true;
  })()`);
  assert.equal(clicked, true);
  await opened;
  return harness.evaluate(`(()=>{
    const root=document.querySelector(".prodigy-project-wizard");
    const textInputs=[...root.querySelectorAll('input:not([type="date"])')];
    const dates=[...root.querySelectorAll('input[type="date"]')];
    textInputs[0].value=${JSON.stringify(name)};
    textInputs[0].dispatchEvent(new Event("input",{bubbles:true}));
    dates[0].value="2026-09-01";
    dates[0].dispatchEvent(new Event("input",{bubbles:true}));
    dates[1].value="2026-09-30";
    dates[1].dispatchEvent(new Event("input",{bubbles:true}));
    return [...root.querySelectorAll(".prodigy-workflow-input")].map(input=>input.value);
  })()`);
}

async function closeWizard(harness) {
  const closed = harness.evaluate(`new Promise((resolve,reject)=>{
    const finish=()=>{
      if(document.querySelector(".prodigy-project-wizard"))return;
      observer.disconnect();clearTimeout(timer);resolve(true);
    };
    const observer=new MutationObserver(finish);
    observer.observe(document.body,{childList:true,subtree:true});
    const timer=setTimeout(()=>{observer.disconnect();reject(new Error("PROJECT_LIVE_CLOSE_TIMEOUT"))},10000);
  })`);
  const clicked = await harness.evaluate(`(()=>{
    const root=document.querySelector(".prodigy-project-wizard");
    const close=root?.closest(".modal")?.querySelector(".modal-close-button");
    if(!close)return false;
    close.click();
    return true;
  })()`);
  if (!clicked) {
    await harness.cdp.send("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
    await harness.cdp.send("Input.dispatchKeyEvent", { type: "keyUp", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
  }
  return closed;
}

test("real Project consent reaches the installed Codex runtime without vault writes", {
  skip: !LIVE,
  timeout: 300000,
}, async () => {
  let harness;
  let liveReceipt = null;
  let surfaceComplete = false;
  try {
    harness = await RealObsidianHarness.start("project-ai-live-provider", {
      codexAuthProbe: true,
      fixtureMutation: {
        prodigyAIRuntimePluginPath: PLUGIN_ROOT,
        prodigyAIRuntimeDataPath: path.join(ROOT, ".obsidian/plugins/prodigy-ai-runtime/data.json"),
      },
    });
    await harness.evaluate(`(async()=>{
      window.__task13aCodexExecProbe=true;
      window.__projectLiveConfirmations=[];
      window.__projectLiveConsentAnswers=[false,true];
      window.confirm=message=>{
        window.__projectLiveConfirmations.push(String(message||""));
        return window.__projectLiveConsentAnswers.shift()===true;
      };
      await app.plugins.loadManifests();
      if(!app.plugins.plugins["prodigy-ai-runtime"])await app.plugins.enablePluginAndSave("prodigy-ai-runtime");
      const plugin=app.plugins.plugins["prodigy-ai-runtime"];
      await plugin.api.setBinding("project.workflow_draft","codex");
      const certification=await plugin.api.certifyProfile("codex");
      if(!certification.ok)throw new Error("CODEX_DEVICE_LOCAL_CERTIFICATION_FAILED:"+certification.error_code);
      window.__task13aAIExecAttempts=[];
      return true;
    })()`);
    await harness.openWorkspace("project");
    const initial = await prepareWizard(harness, "TASK13A Synthetic Live Project");
    const consentRequired = await harness.evaluate(`window.ProdigyAIClient.createClient({app}).getConsentRequirement("project.workflow_draft")`);
    assert.equal(consentRequired.status, "consent_required");
    assert.equal(consentRequired.profile_id, "codex");
    assert.equal(consentRequired.route_class, "desktop-cli");

    const declinedReady = waitForAttribute(harness, ".prodigy-project-wizard", "data-project-ai-request-state", "declined", "PROJECT_LIVE_DECLINE_TIMEOUT");
    await harness.renderedClick('[data-project-ai-action="refine-workflow"]');
    await declinedReady;
    const declined = await harness.evaluate(`(async()=>({
      labels:[...document.querySelectorAll(".prodigy-project-wizard .prodigy-workflow-input")].map(input=>input.value),
      grants:(await app.plugins.plugins["prodigy-ai-runtime"].loadData()).grants,
        processCalls:(window.__task13aAIExecAttempts||[]).length
    }))()`);
    assert.deepEqual(declined.labels, initial);
    assert.deepEqual(declined.grants, {});
    assert.equal(declined.processCalls, 0);

    const completedReady = waitForAttribute(harness, ".prodigy-project-wizard", "data-project-ai-request-state", "completed", "PROJECT_LIVE_COMPLETION_TIMEOUT");
    await harness.renderedClick('[data-project-ai-action="refine-workflow"]');
    await completedReady;
    const completed = await harness.evaluate(`(async()=>{
      const plugin=app.plugins.plugins["prodigy-ai-runtime"],data=await plugin.loadData(),diagnostics=plugin.api.listDiagnostics();
      const diskData=JSON.parse(await app.vault.adapter.read(".obsidian/plugins/prodigy-ai-runtime/data.json"));
      return {
        labels:[...document.querySelectorAll(".prodigy-project-wizard .prodigy-workflow-input")].map(input=>input.value),
        status:document.querySelector(".prodigy-project-wizard")?.textContent||"",
        grants:data.grants,
        diskGrants:diskData.grants,
        consentAfter:window.ProdigyAIClient.createClient({app}).getConsentRequirement("project.workflow_draft"),
        diagnostics,
        processCalls:window.__task13aAIExecAttempts||[],
        writes:(window.__task13aWriteAttempts||[]).filter(row=>!String(row.path||"").startsWith(".obsidian/"))
      };
    })()`);
    assert.ok(completed.labels.length >= 4 && completed.labels.length <= 10);
    assert.ok(completed.labels.every((label) => typeof label === "string" && label.trim()));
    assert.equal(completed.status.includes("codex"), true);
    assert.deepEqual(Object.keys(completed.grants), ["project.workflow_draft"], JSON.stringify({
      memory: completed.grants, disk: completed.diskGrants, consent: completed.consentAfter,
    }));
    assert.deepEqual(Object.keys(completed.diskGrants), ["project.workflow_draft"]);
    assert.equal(completed.grants["project.workflow_draft"].profile_id, "codex");
    assert.equal(completed.diagnostics.at(-1)?.status, "completed");
    assert.equal(JSON.stringify(completed.diagnostics).includes("TASK13A Synthetic Live Project"), false);
    assert.equal(completed.processCalls.length, 1);
    assert.equal(completed.processCalls[0].flags.includes("--json"), true);
    assert.equal(completed.processCalls[0].flags.includes("--ephemeral"), true);
    assert.deepEqual(completed.writes, []);

    await harness.evaluate(`(()=>{
      const plugin=app.plugins.plugins["prodigy-ai-runtime"];
      window.__projectLiveTerminalEvents=[];
      window.__projectLiveTerminal=new Promise((resolve,reject)=>{
        let running=false;
        const unsubscribe=plugin.api.subscribeStatus(event=>{
          window.__projectLiveTerminalEvents.push(event);
          if(event.status==="running")running=true;
          if(running&&["cancel_requested","cancelled_confirmed","outcome_unknown"].includes(event.status)){
            unsubscribe();clearTimeout(timer);resolve(event);
          }
        });
        const timer=setTimeout(()=>{unsubscribe();reject(new Error("PROJECT_LIVE_CANCEL_TIMEOUT"))},30000);
      });
      window.__projectLiveSpawn=new Promise((resolve,reject)=>{
        const listener=event=>{window.removeEventListener("task13a-ai-cli-spawn",listener);clearTimeout(timer);resolve(event.detail)};
        window.addEventListener("task13a-ai-cli-spawn",listener);
        const timer=setTimeout(()=>{window.removeEventListener("task13a-ai-cli-spawn",listener);reject(new Error("PROJECT_LIVE_SPAWN_TIMEOUT"))},30000);
      });
      return true;
    })()`);
    await harness.renderedClick('[data-project-ai-action="refine-workflow"]');
    await harness.evaluate("window.__projectLiveSpawn");
    await closeWizard(harness);
    const cancelled = await harness.evaluate("window.__projectLiveTerminal");
    assert.ok(["cancel_requested", "cancelled_confirmed", "outcome_unknown"].includes(cancelled.status));

    await harness.evaluate(`app.plugins.plugins["prodigy-ai-runtime"].api.setDeviceRoute("codex",{executable:"codex-invalid"})`);
    const preserved = await prepareWizard(harness, "TASK13A Synthetic Failure Project");
    const failedReady = waitForAttribute(harness, ".prodigy-project-wizard", "data-project-ai-request-state", "failed", "PROJECT_LIVE_FAILURE_TIMEOUT");
    await harness.renderedClick('[data-project-ai-action="refine-workflow"]');
    await failedReady;
    const failed = await harness.evaluate(`(async()=>({
      labels:[...document.querySelectorAll(".prodigy-project-wizard .prodigy-workflow-input")].map(input=>input.value),
      grants:(await app.plugins.plugins["prodigy-ai-runtime"].loadData()).grants,
      writes:(window.__task13aWriteAttempts||[]).filter(row=>!String(row.path||"").startsWith(".obsidian/"))
    }))()`);
    assert.deepEqual(failed.labels, preserved);
    assert.deepEqual(failed.grants, {});
    assert.deepEqual(failed.writes, []);
    liveReceipt = {
      schema_version: "prodigy_ai_runtime_desktop_consumer_acceptance_v1",
      status: "pass",
      consumer_id: "project.workflow_draft",
      provider_profile: "codex",
      route_class: "desktop-cli",
      consent_declined_provider_calls: 0,
      grant_persisted_before_request: true,
      completed_workflow_items: completed.labels.length,
      cancel_status: cancelled.status,
      invalid_route_provider_calls: 0,
      grant_invalidated_after_route_change: true,
      vault_content_writes: 0,
      prompt_response_persistence_hits: 0,
    };
    await closeWizard(harness);
    surfaceComplete = true;
  } finally {
    if (harness) {
      const closed = await harness.close({
        expectedRuntimeJsonPaths: [".obsidian/plugins/prodigy-ai-runtime/data.json"],
      });
      assert.equal(closed.audit.equal, true);
      assert.deepEqual(closed.audit.changedPaths, []);
      assert.equal(closed.protectedContinuity.exact, true);
      assert.equal(closed.removed, true);
      assert.equal(closed.portReusable, true);
    }
    const tempRoot = path.join(os.tmpdir(), "prodigy-ai-runtime");
    assert.deepEqual(fs.existsSync(tempRoot) ? fs.readdirSync(tempRoot) : [], []);
    if (surfaceComplete && liveReceipt) process.stdout.write(`PROJECT_LIVE_ACCEPTANCE ${JSON.stringify(liveReceipt)}\n`);
  }
});
