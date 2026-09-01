#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { test } = require("node:test");
const { RealObsidianHarness } = require("../shared/real_obsidian_harness.js");

const ROOT = path.resolve(__dirname, "../../../../../..");
const EVIDENCE = path.join(ROOT, ".omo/evidence/home-capture-phase1");
const SCREENSHOTS = path.join(EVIDENCE, "screenshots");

async function setViewport(harness, width) {
  await harness.cdp.send("Emulation.setDeviceMetricsOverride", { width, height: 900, deviceScaleFactor: 1, scale: 1, mobile: false });
  await harness.evaluate(`new Promise((resolve,reject)=>{const finish=()=>{if(innerWidth!==${width})return;removeEventListener('resize',finish);clearTimeout(timer);requestAnimationFrame(()=>requestAnimationFrame(resolve))},timer=setTimeout(()=>{removeEventListener('resize',finish);reject(new Error('QUICK_CAPTURE_VIEWPORT_TIMEOUT'))},5000);addEventListener('resize',finish);finish()})`);
}

async function capture(harness, name, width, selector) {
  await setViewport(harness, width);
  await harness.evaluate(`new Promise((resolve,reject)=>{const node=document.querySelector(${JSON.stringify(selector)});if(!node)return reject(new Error('QUICK_CAPTURE_SURFACE_MISSING'));node.scrollIntoView({block:'center',inline:'nearest',behavior:'instant'});requestAnimationFrame(()=>requestAnimationFrame(resolve))})`);
  const metrics = await harness.evaluate(`(()=>{const root=document.querySelector(${JSON.stringify(selector)}),visible=node=>{const box=node.getBoundingClientRect(),style=getComputedStyle(node);return node.isConnected&&box.width>0&&box.height>0&&style.display!=='none'&&style.visibility!=='hidden'},all=root?[root,...root.querySelectorAll('*')].filter(visible):[],controls=all.filter(node=>node.matches('button,input,textarea')),target=node=>node.matches('input,textarea')?(node.closest('label')||node):node,text=(root&&root.innerText||'').trim();return{text,horizontalOverflow:all.filter(node=>node.clientWidth>0&&node.scrollWidth>node.clientWidth+1).length,documentOverflow:document.documentElement.scrollWidth>document.documentElement.clientWidth+1,cjkClipping:all.filter(node=>/[\uac00-\ud7af]/u.test(node.textContent||'')&&node.clientWidth>0&&node.scrollWidth>node.clientWidth+1).length,runtimeErrors:(document.body.innerText.match(/TypeError:|ReferenceError:|TASK13A_ERROR/gu)||[]).length,undersized:controls.filter(node=>{const box=target(node).getBoundingClientRect();return box.width<44||box.height<44}).length,nodeNetwork:(window.__task13aNodeNetworkAttempts||[]).slice()}})()`);
  assert.deepEqual({ horizontalOverflow: metrics.horizontalOverflow, documentOverflow: metrics.documentOverflow, cjkClipping: metrics.cjkClipping, runtimeErrors: metrics.runtimeErrors, undersized: metrics.undersized }, { horizontalOverflow: 0, documentOverflow: false, cjkClipping: 0, runtimeErrors: 0, undersized: 0 }, name);
  assert.deepEqual(metrics.nodeNetwork, [], name);
  const shot = await harness.cdp.send("Page.captureScreenshot", { format: "png", fromSurface: true });
  const bytes = Buffer.from(shot.data, "base64");
  const filename = `${name}-${width}.png`;
  fs.writeFileSync(path.join(SCREENSHOTS, filename), bytes);
  return { name, width, path: `screenshots/${filename}`, sha256: crypto.createHash("sha256").update(bytes).digest("hex"), bytes: bytes.length, metrics };
}

async function armCreate(harness, prefix) {
  await harness.evaluate(`(()=>{window.__quickCaptureCreated=new Promise((resolve,reject)=>{const ref=app.vault.on('create',file=>{if(!file||!String(file.path||'').startsWith(${JSON.stringify(prefix)}))return;cleanup();resolve(file.path)}),cleanup=()=>{app.vault.offref(ref);clearTimeout(timer)},timer=setTimeout(()=>{cleanup();reject(new Error('QUICK_CAPTURE_CREATE_TIMEOUT'))},10000)});return true})()`);
}

test("isolated Obsidian saves a local thought and an analyzed inbox material from real UI", { timeout: 240000 }, async (t) => {
  if (process.env.QUICK_CAPTURE_REAL_OBSIDIAN !== "1") return t.skip("quick capture real-Obsidian QA runs explicitly");
  fs.mkdirSync(SCREENSHOTS, { recursive: true });
  const captures = [];
  const cleanups = [];
  const exceptions = [];
  let harness;
  let thoughtPath = "";

  try {
    harness = await RealObsidianHarness.start("quick-capture-home");
    harness.cdp.on("Runtime.exceptionThrown", (event) => exceptions.push(event.exceptionDetails?.text || "runtime exception"));
    await harness.evaluate(`(()=>{window.__homeProviderCalls=0;Object.defineProperty(window,'AIProviderService',{configurable:true,get(){return undefined},set(value){const methods=new Set(['requestStructuredJson','requestStructuredJsonOnce','requestStructuredJsonNoRetry','requestChatText']),wrapped=new Proxy(value,{get(target,key,receiver){const member=Reflect.get(target,key,receiver);if(!methods.has(key)||typeof member!=='function')return member;return function(){window.__homeProviderCalls+=1;return member.apply(target,arguments)}}});Object.defineProperty(window,'AIProviderService',{value:wrapped,writable:true,configurable:true})}});return true})()`);
    await harness.mountStructuralWorkspace("home");
    await harness.collapseSidebar("home", "left");
    await harness.collapseSidebar("home", "right");
    await harness.evaluate("window.__task13aQuickCaptureWrites=true;true");
    await setViewport(harness, 390);
    await harness.waitForSelector('.prodigy-app-shell[data-workspace-id="home"] .quick-capture-row');
    await harness.trustedActivate('.prodigy-app-shell[data-workspace-id="home"] [data-quick-capture-action="thought"]', null, " ");
    await harness.evaluate(`(()=>{const input=document.querySelector('.prodigy-app-shell[data-workspace-id="home"] .quick-capture-input');input.value='플리팅 실제 QA';input.dispatchEvent(new Event('input',{bubbles:true}));return true})()`);
    await armCreate(harness, "ZETA/FLEETING/");
    await harness.trustedActivate('.prodigy-app-shell[data-workspace-id="home"] .quick-capture-input');
    try {
      thoughtPath = await harness.evaluate("window.__quickCaptureCreated");
    } catch (error) {
      const diagnostic = await harness.evaluate(`(()=>{const root=document.querySelector('.prodigy-app-shell[data-workspace-id="home"] .quick-capture-row'),save=root&&root.querySelector('.quick-capture-save'),input=root&&root.querySelector('.quick-capture-input'),status=root&&root.querySelector('.quick-capture-status');return{saveDisabled:save&&save.disabled,inputValue:input&&input.value,status:status&&(status.textContent||status.innerText),editorHidden:root&&root.querySelector('.quick-capture-editor')&&root.querySelector('.quick-capture-editor').hidden}})()`);
      throw new Error(`${error.message}:${JSON.stringify(diagnostic)}`);
    }
    const thoughtBytes = await harness.evaluate(`(async()=>{const file=app.vault.getAbstractFileByPath(${JSON.stringify(thoughtPath)});return app.vault.read(file)})()`);
    assert.match(thoughtPath, /^ZETA\/FLEETING\/\d{4}-\d{2}-\d{2}\.md$/u);
    assert.match(thoughtBytes, /^- \d{2}:\d{2} 플리팅 실제 QA\n$/u);
    captures.push(await capture(harness, "home-thought-saved", 390, '.prodigy-app-shell[data-workspace-id="home"] .quick-capture-row'));
    const actionState = await harness.evaluate(`(()=>{const shell=document.querySelector('.prodigy-app-shell[data-workspace-id="home"]'),queue=shell&&shell.querySelector('.home-action-queue'),rows=queue?[...queue.querySelectorAll('.home-action-row')]:[],details=shell&&shell.querySelector('.home-context-details'),visible=node=>{const box=node.getBoundingClientRect(),style=getComputedStyle(node);return box.width>0&&box.height>0&&style.display!=='none'&&style.visibility!=='hidden'},legacy=shell?[...shell.querySelectorAll('.home-focus-card,.home-continue-section')].filter(visible):[];return{queue:!!queue,rows:rows.length,buttons:rows.filter(row=>row.querySelectorAll('button').length===1).length,primary:rows.filter(row=>row.classList.contains('is-primary')).length,detailsOpen:Boolean(details&&details.open),visibleLegacy:legacy.length,briefCount:shell?shell.querySelectorAll('.home-brief,.home-brief-text').length:0,providerCalls:Number(window.__homeProviderCalls||0),toolbar:!!(shell&&shell.querySelector('.home-toolbar'))}})()`);
    assert.equal(actionState.queue, true);
    assert.ok(actionState.rows > 0 && actionState.rows <= 5);
    assert.equal(actionState.buttons, actionState.rows);
    assert.equal(actionState.primary, 1);
    assert.equal(actionState.detailsOpen, false);
    assert.equal(actionState.visibleLegacy, 0);
    assert.equal(actionState.briefCount, 0);
    assert.equal(actionState.providerCalls, 0);
    assert.equal(actionState.toolbar, true);
    for (const width of [390, 1440]) captures.push(await capture(harness, "home-action-queue", width, '.prodigy-app-shell[data-workspace-id="home"] .home-action-queue'));
    assert.deepEqual(harness.osNetworkAttempts, []);
  } finally {
    if (harness) {
      await harness.evaluate(`(async()=>{const file=app.vault.getAbstractFileByPath(${JSON.stringify(thoughtPath)});if(file)await app.vault.delete(file,true);window.__task13aQuickCaptureWrites=false;return true})()`).catch(() => {});
      cleanups.push(await harness.close());
    }
  }

  let incrementalStateBefore = null;
  try {
    harness = await RealObsidianHarness.start("quick-capture-knowledge");
    harness.cdp.on("Runtime.exceptionThrown", (event) => exceptions.push(event.exceptionDetails?.text || "runtime exception"));
    await harness.installStructuralFixtureRegistry();
    await harness.evaluate(`(()=>{window.__llmwikiInboxProgressQa=true;window.__task13aFixtureRegistry.configure('knowledge','inboxAnalysis',{nonce:'quick-capture-inbox',kind:'resolve',value:{ok:true}});return true})()`);
    await harness.mountStructuralWorkspace("knowledge");
    await harness.collapseSidebar("knowledge", "left");
    await harness.collapseSidebar("knowledge", "right");
    await harness.evaluate("window.__task13aQuickCaptureWrites=true;true");
    incrementalStateBefore = await harness.evaluate(`(async()=>{const file=app.vault.getAbstractFileByPath('SYSTEM/PRIVATE/llmwiki-incremental-analysis-state.json');return file?app.vault.read(file):null})()`);
    await setViewport(harness, 1440);
    const surface = '#knowledge-panel-zettelkasten .quick-capture-row';
    await harness.waitForSelector(surface);
    await harness.trustedActivate(`${surface} [data-quick-capture-action="material"]`, null, " ");
    await harness.evaluate(`(()=>{const root=document.querySelector(${JSON.stringify(surface)}),title=root.querySelector('.quick-capture-title'),input=root.querySelector('.quick-capture-input');title.value='빠른 입력 실제 QA';title.dispatchEvent(new Event('input',{bubbles:true}));input.value='자동 분석 연결을 확인하는 격리 자료';input.dispatchEvent(new Event('input',{bubbles:true}));window.__quickCaptureProvider=new Promise((resolve,reject)=>{const finish=event=>{const detail=event.detail||{};if(detail.workspaceId==='knowledge'&&detail.operation==='inboxAnalysis'){cleanup();resolve(detail)}},cleanup=()=>{window.removeEventListener('task13a-provider-consumed',finish);clearTimeout(timer)},timer=setTimeout(()=>{cleanup();reject(new Error('QUICK_CAPTURE_PROVIDER_TIMEOUT'))},10000);window.addEventListener('task13a-provider-consumed',finish)});return true})()`);
    await armCreate(harness, "INBOX/빠른 입력 실제 QA");
    await harness.trustedClick(`${surface} .quick-capture-save`);
    const materialPath = await harness.evaluate("window.__quickCaptureCreated");
    const providerEvent = await harness.evaluate("window.__quickCaptureProvider");
    const materialBytes = await harness.evaluate(`(async()=>{const file=app.vault.getAbstractFileByPath(${JSON.stringify(materialPath)});return app.vault.read(file)})()`);
    assert.equal(materialPath, "INBOX/빠른 입력 실제 QA.md");
    assert.equal(materialBytes, "# 빠른 입력 실제 QA\n\n자동 분석 연결을 확인하는 격리 자료\n");
    assert.equal(providerEvent.operation, "inboxAnalysis");
    assert.equal((await harness.evaluate(`window.__task13aFixtureRegistry.consumptions().filter(row=>row.operation==='inboxAnalysis'&&row.detail&&row.detail.path===${JSON.stringify(materialPath)}).length`)), 1);
    captures.push(await capture(harness, "knowledge-material-saved", 1440, surface));
    assert.deepEqual(harness.osNetworkAttempts, []);
  } finally {
    if (harness) {
      await harness.evaluate(`(async()=>{const file=app.vault.getAbstractFileByPath('INBOX/빠른 입력 실제 QA.md');if(file)await app.vault.delete(file,true);const folder=app.vault.getAbstractFileByPath('INBOX');if(folder&&Array.isArray(folder.children)&&folder.children.length===0)await app.vault.delete(folder,true);const statePath='SYSTEM/PRIVATE/llmwiki-incremental-analysis-state.json',stateFile=app.vault.getAbstractFileByPath(statePath),original=${JSON.stringify(incrementalStateBefore)};if(original==null){if(stateFile)await app.vault.delete(stateFile,true)}else if(stateFile)await app.vault.modify(stateFile,original);else await app.vault.create(statePath,original);window.__task13aQuickCaptureWrites=false;return true})()`).catch(() => {});
      cleanups.push(await harness.close());
    }
  }

  assert.deepEqual(exceptions, []);
  for (const cleanup of cleanups) {
    assert.equal(cleanup.audit.equal, true);
    assert.equal(cleanup.protectedContinuity.exact, true);
    assert.equal(cleanup.removed, true);
    assert.equal(cleanup.portReusable, true);
  }
  fs.writeFileSync(path.join(EVIDENCE, "real-obsidian-manifest.json"), `${JSON.stringify({ ok: true, captures, exceptions, cleanups }, null, 2)}\n`);
});
