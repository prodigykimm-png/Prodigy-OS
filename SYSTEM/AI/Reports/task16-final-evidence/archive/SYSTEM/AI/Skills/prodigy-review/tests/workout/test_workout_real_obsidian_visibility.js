#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { RealObsidianHarness } = require("../shared/real_obsidian_harness.js");

const EXACT_INACTIVE_SELECTORS = [
  ".workout-toolbar > button.workout-button",
  ".workout-start-path button.workout-button",
  ".workout-inline-actions > button.workout-button",
  "textarea.workout-observation-input",
];

async function waitForWorkout(harness, expression, label) {
  return harness.evaluate(`new Promise((resolve,reject)=>{const test=()=>{try{if(${expression}){observer.disconnect();clearTimeout(guard);resolve(true)}}catch(error){observer.disconnect();clearTimeout(guard);reject(error)}};const observer=new MutationObserver(test);observer.observe(document,{childList:true,subtree:true,attributes:true,attributeFilter:['hidden','aria-selected','aria-busy']});const guard=setTimeout(()=>{observer.disconnect();reject(new Error(${JSON.stringify(`WORKOUT_VISIBILITY_TIMEOUT:${label}`)}))},20000);test()})`);
}

test("real Obsidian detaches every inactive Workout control and restores canonical tab state and focus", { timeout: 240000 }, async () => {
  let harness;
  let cleanup;
  try {
    harness = await RealObsidianHarness.start("workout-inactive-visibility");
    await harness.openWorkspace("workout");
    await harness.evaluate(`(async()=>{for(const [name,path] of [['WorkoutHealthResponsive','SYSTEM/Views/workout-health-responsive.js'],['WorkoutHealthShell','SYSTEM/Views/workout-health-shell.js']]){if(window[name])continue;const file=app.vault.getAbstractFileByPath(path);if(!file)throw new Error('WORKOUT_FIXTURE_MODULE_MISSING:'+path);(new Function(await app.vault.read(file)))()}const body=[...document.querySelectorAll('.prodigy-app-shell-body')].find(element=>{const box=element.getBoundingClientRect();return box.width>0&&box.height>0});if(!body)throw new Error('WORKOUT_FIXTURE_BODY_MISSING');const mount=body.createDiv({attr:{class:'workout-visibility-mount'}});window.__workoutVisibilityMount=mount;window.__workoutVisibilityController=await WorkoutView.renderDashboard(app,mount,{width:390});return true})()`);
    await waitForWorkout(harness, "document.querySelector('.workout-visibility-mount #workout-panel-strength:not([hidden]) textarea.workout-observation-input')", "strength-content");

    const inspect = () => harness.evaluate(`(()=>{const root=document.querySelector('.workout-visibility-mount');if(!root)throw new Error('WORKOUT_ACTIVE_ROOT_MISSING');const hidden=[...root.querySelectorAll('.workout-health-panel[hidden]')];const inactive=hidden.flatMap(panel=>[...panel.querySelectorAll('button,a[href],[role=button],input,select,textarea')]);const visible=[...root.querySelectorAll('button,a[href],[role=button],input,select,textarea')].filter(element=>!element.closest('[hidden]'));const receipt=element=>{const box=element.getBoundingClientRect(),style=getComputedStyle(element);return{selector:element.matches('textarea')?'textarea.'+element.className:element.className,text:(element.getAttribute('aria-label')||element.innerText||'').trim(),width:box.width,height:box.height,clientWidth:element.clientWidth,scrollWidth:element.scrollWidth,shadow:style.boxShadow}};return{active:root.querySelector('.workout-health-tab[aria-selected=\"true\"]')?.dataset.tab,inactive:inactive.map(receipt),visible:visible.map(receipt),exact:Object.fromEntries(${JSON.stringify(EXACT_INACTIVE_SELECTORS)}.map(selector=>[selector,hidden.reduce((sum,panel)=>sum+panel.querySelectorAll(selector).length,0)])),focused:document.activeElement?.dataset?.tab||null}})()`);

    await harness.evaluate(`(()=>{const input=document.querySelector('.workout-visibility-mount #workout-panel-strength textarea.workout-observation-input');if(!input)throw new Error('WORKOUT_OBSERVATION_FIXTURE_MISSING');input.value='아주 긴 한국어 관측 상태 값';input.focus();window.__workoutObservationIdentity=input;window.__workoutVisibilityController.openTab('nutrition');return true})()`);
    await waitForWorkout(harness, "document.querySelector('.workout-visibility-mount #workout-tab-nutrition[aria-selected=\"true\"]') && document.querySelector('.workout-visibility-mount #workout-panel-strength[hidden]')", "nutrition");
    const inactive = await inspect();
    assert.equal(inactive.active, "nutrition");
    assert.deepEqual(inactive.exact, Object.fromEntries(EXACT_INACTIVE_SELECTORS.map((selector) => [selector, 0])));
    assert.deepEqual(inactive.inactive, [], "inactive panels must contain no interactive descendants");
    assert.equal(inactive.focused, "nutrition", "parking focused panel content transfers focus to the selected tab");
    for (const control of inactive.visible) {
      assert.ok(control.width >= 44 && control.height >= 44, JSON.stringify(control));
      assert.ok(control.scrollWidth <= control.clientWidth + 1, JSON.stringify(control));
      assert.equal(control.shadow, "none", JSON.stringify(control));
    }

    await harness.evaluate("window.__workoutVisibilityController.openTab('strength');true");
    await waitForWorkout(harness, "document.querySelector('.workout-visibility-mount #workout-tab-strength[aria-selected=\"true\"]') && window.__workoutObservationIdentity?.isConnected", "strength-restore");
    const restored = await harness.evaluate(`({same:window.__workoutObservationIdentity===document.querySelector('.workout-visibility-mount #workout-panel-strength textarea.workout-observation-input'),value:window.__workoutObservationIdentity?.value,focused:document.activeElement?.dataset?.tab||null})`);
    assert.deepEqual(restored, { same: true, value: "아주 긴 한국어 관측 상태 값", focused: "strength" }, "tab restoration preserves the same controlled node, draft value, and canonical focus");

    await harness.evaluate(`(()=>{const tab=document.querySelector('.workout-visibility-mount #workout-tab-strength');tab.dispatchEvent(new KeyboardEvent('keydown',{key:'End',bubbles:true}));return true})()`);
    await waitForWorkout(harness, "document.querySelector('.workout-visibility-mount #workout-tab-running[aria-selected=\"true\"]') && document.activeElement === document.querySelector('.workout-visibility-mount #workout-tab-running')", "keyboard-running");
    const keyboard = await inspect();
    assert.equal(keyboard.active, "running");
    assert.equal(keyboard.focused, "running");
    assert.deepEqual(keyboard.inactive, []);
    await harness.evaluate(`(()=>{window.__workoutVisibilityController.dispose();window.__workoutVisibilityMount.remove();delete window.__workoutVisibilityController;delete window.__workoutVisibilityMount;return true})()`);

    await harness.openWorkspace("project");
    await harness.openWorkspace("workout");
    await waitForWorkout(harness, "[...document.querySelectorAll('.workout-workspace-content')].some(root=>{const box=root.getBoundingClientRect();return box.width>0&&box.height>0&&root.querySelector('#workout-tab-running[aria-selected=\"true\"]')})", "remount");
    const remount = await harness.evaluate(`(()=>{const root=[...document.querySelectorAll('.workout-workspace-content')].find(element=>{const box=element.getBoundingClientRect();return box.width>0&&box.height>0});if(!root)throw new Error('WORKOUT_REMOUNT_ROOT_MISSING');return{active:root.querySelector('.workout-health-tab[aria-selected="true"]')?.dataset.tab,inactive:[...root.querySelectorAll('.workout-health-panel[hidden]')].flatMap(panel=>[...panel.querySelectorAll('button,a[href],[role=button],input,select,textarea')]).map(element=>element.getAttribute('aria-label')||element.innerText||element.tagName)}})()`);
    assert.equal(remount.active, "running", "session-backed active tab survives remount");
    assert.deepEqual(remount.inactive, []);
  } finally {
    if (harness) cleanup = await harness.close();
  }
  assert.equal(cleanup.audit.equal, true, "real fixture remains byte-read-only");
  assert.equal(cleanup.protectedContinuity.exact, true, cleanup.protectedContinuity.error || "protected process changed");
  assert.equal(cleanup.removed, true);
  assert.equal(cleanup.portReusable, true);
});
