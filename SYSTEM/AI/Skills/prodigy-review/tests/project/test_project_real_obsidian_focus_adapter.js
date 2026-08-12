#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const {
  RealObsidianHarness,
  snapshotProtected,
} = require("../shared/real_obsidian_harness.js");

const PROJECT_PATH = "HUB/40 Project.md";

function installProjectFocusAdapter(harness) {
  const sourceHash = harness.runtime.manifest[PROJECT_PATH][0].sha256;
  return harness.evaluate(`(()=>{
    const expected={workspaceId:"project",sourceFile:${JSON.stringify(PROJECT_PATH)},sourceHash:${JSON.stringify(sourceHash)}};
    const select=()=>{
      const active=app.workspace.activeLeaf||app.workspace.getMostRecentLeaf();
      const activeContainer=active&&active.containerEl;
      const candidates=[...document.querySelectorAll('.prodigy-app-shell[data-workspace-id="project"]')].filter(shell=>{
        const leaf=shell.closest('.workspace-leaf-content[data-type="markdown"]');
        const block=shell.closest('.block-language-dataviewjs,.block-language-js-engine');
        const mount=block&&window.ProdigyHubLoader&&window.ProdigyHubLoader.currentWorkspace(block);
        const box=shell.getBoundingClientRect();
        const style=getComputedStyle(shell);
        return shell.isConnected&&leaf&&activeContainer&&(activeContainer===leaf||activeContainer.contains(leaf))&&
          block&&block.dataset.task13aSourceFile===expected.sourceFile&&block.dataset.task13aSourceHash===expected.sourceHash&&
          mount&&mount.signal&&!mount.signal.aborted&&box.width>0&&box.height>0&&style.display!=='none'&&style.visibility!=='hidden';
      });
      if(candidates.length!==1)throw new Error('PROJECT_FOCUS_OWNER_CARDINALITY:'+candidates.length);
      return candidates[0];
    };
    window.__projectFocusAdapter=Object.freeze({
      select,
      focusFirst(){
        const owner=select();
        const control=[...owner.querySelectorAll('button,a[href],[role=button],[role=tab],input,select,textarea')]
          .find(element=>{const box=element.getBoundingClientRect();return!element.disabled&&element.tabIndex>=0&&box.width>0&&box.height>0});
        if(!control)throw new Error('PROJECT_FOCUS_CONTROL_MISSING');
        control.focus();
        return {tag:control.tagName,text:(control.innerText||control.getAttribute('aria-label')||'').trim()};
      },
      subscribeNextFocus(label){
        const owner=select();
        const controls=[...owner.querySelectorAll('button,a[href],[role=button],[role=tab],input,select,textarea')]
          .filter(element=>{const box=element.getBoundingClientRect(),style=getComputedStyle(element);return!element.disabled&&element.tabIndex>=0&&box.width>0&&box.height>0&&style.display!=='none'&&style.visibility!=='hidden'});
        const current=controls.indexOf(document.activeElement);
        const expectedControl=controls[current>=0?(current+1)%controls.length:0];
        let resolvePending,rejectPending;
        const promise=new Promise((resolve,reject)=>{resolvePending=resolve;rejectPending=reject});
        const listener=event=>{
          if(event.target!==expectedControl)return;
          document.removeEventListener('focusin',listener,true);clearTimeout(timer);
          resolvePending({label,ownerReacquired:owner===select(),tag:event.target.tagName,text:(event.target.innerText||event.target.getAttribute('aria-label')||'').trim()});
        };
        document.addEventListener('focusin',listener,true);
        const timer=setTimeout(()=>{document.removeEventListener('focusin',listener,true);rejectPending(new Error('PROJECT_FOCUS_SIGNAL_TIMEOUT:'+label))},5000);
        return promise;
      }
    });
    return true;
  })()`);
}

async function dispatchKey(harness, key, code, windowsVirtualKeyCode) {
  await harness.cdp.send("Input.dispatchKeyEvent", { type: "keyDown", key, code, windowsVirtualKeyCode });
  await harness.cdp.send("Input.dispatchKeyEvent", { type: "keyUp", key, code, windowsVirtualKeyCode });
}

test("Project shared diagnostic reacquires the exact production owner after an Obsidian remount before every keyboard trigger", { timeout: 240000 }, async () => {
  const protectedSnapshot = snapshotProtected();
  const harness = await RealObsidianHarness.start("project-focus-adapter", { protectedSnapshot });
  let cleanup;
  try {
    await harness.openWorkspace("workout");
    await harness.capture("workout", 1440, "dark", 2, true, "normal");
    await harness.openWorkspace("project");
    const sharedReceipt = await harness.capture("project", 390, "light", 1, false, "normal");
    assert.deepEqual(sharedReceipt.keyboard.failures, [], "the shared diagnostic must not retain a disconnected pre-remount owner");
    assert.deepEqual(sharedReceipt.keyboard.owners.map(({ action, workspaceId, sourceFile, registryLive }) => ({ action, workspaceId, sourceFile, registryLive })), [
      { action: "seed", workspaceId: "project", sourceFile: PROJECT_PATH, registryLive: true },
      { action: "enter", workspaceId: "project", sourceFile: PROJECT_PATH, registryLive: true },
      { action: "escape-before-tab", workspaceId: "project", sourceFile: PROJECT_PATH, registryLive: true },
      { action: "tab", workspaceId: "project", sourceFile: PROJECT_PATH, registryLive: true },
      { action: "escape-after-tab", workspaceId: "project", sourceFile: PROJECT_PATH, registryLive: true },
    ], "every action reacquires the active leaf, exact source, and live registry owner");

    await installProjectFocusAdapter(harness);
    const seeded = await harness.evaluate("window.__projectFocusAdapter.focusFirst()");
    assert.equal(seeded.tag, "SELECT");
    await harness.evaluate("window.__projectTabSignal=window.__projectFocusAdapter.subscribeNextFocus('tab');true");
    await dispatchKey(harness, "Tab", "Tab", 9);
    const afterTab = await harness.evaluate("window.__projectTabSignal");
    assert.deepEqual(afterTab, { label: "tab", ownerReacquired: true, tag: "BUTTON", text: "홈" });

    const escapeBefore = await harness.evaluate(`(()=>{const owner=window.__projectFocusAdapter.select(),active=document.activeElement;let resolvePending,rejectPending;window.__projectEscapeSignal=new Promise((resolve,reject)=>{resolvePending=resolve;rejectPending=reject});const listener=event=>{if(event.key!=='Escape')return;document.removeEventListener('keyup',listener,true);clearTimeout(timer);resolvePending({sameOwner:owner===window.__projectFocusAdapter.select(),sameFocus:active===document.activeElement,text:(active.innerText||active.getAttribute('aria-label')||'').trim()})};document.addEventListener('keyup',listener,true);const timer=setTimeout(()=>{document.removeEventListener('keyup',listener,true);rejectPending(new Error('PROJECT_ESCAPE_SIGNAL_TIMEOUT'))},5000);return{tag:active.tagName,text:(active.innerText||active.getAttribute('aria-label')||'').trim()}})()`);
    assert.deepEqual(escapeBefore, { tag: "BUTTON", text: "홈" });
    await dispatchKey(harness, "Escape", "Escape", 27);
    const afterEscape = await harness.evaluate("window.__projectEscapeSignal");
    assert.deepEqual(afterEscape, { sameOwner: true, sameFocus: true, text: "홈" });

    assert.deepEqual(harness.osNetworkAttempts, [], "Project focus diagnostics dispatch no network request");
  } finally {
    cleanup = await harness.close();
  }
  assert.equal(cleanup.audit.equal, true, "Project focus verification writes no vault bytes");
  assert.equal(cleanup.protectedContinuity.exact, true, cleanup.protectedContinuity.error || "protected identity changed");
  assert.equal(cleanup.removed, true, "Project focus runtime root residue");
  assert.equal(cleanup.portReusable, true, "Project focus CDP port residue");
});
