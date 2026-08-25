#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { test } = require("node:test");
const { RealObsidianHarness } = require("../shared/real_obsidian_harness.js");

const ROOT = path.resolve(__dirname, "../../../../../..");
const EVIDENCE = path.join(ROOT, ".omo/evidence/llmwiki-inbox-scan-progress-fix");
const SCREENSHOTS = path.join(EVIDENCE, "screenshots");

async function setViewport(harness, width) {
  await harness.cdp.send("Emulation.setDeviceMetricsOverride", { width, height: 900, deviceScaleFactor: 1, scale: 1, mobile: false });
  await harness.evaluate(`new Promise((resolve,reject)=>{const finish=()=>{if(innerWidth!==${width})return;removeEventListener('resize',finish);clearTimeout(timer);requestAnimationFrame(()=>requestAnimationFrame(resolve))},timer=setTimeout(()=>{removeEventListener('resize',finish);reject(new Error('INBOX_QA_VIEWPORT_TIMEOUT'))},5000);addEventListener('resize',finish);finish()})`);
}

async function capture(harness, name, width, expected) {
  await setViewport(harness, width);
  await harness.evaluate(`new Promise((resolve,reject)=>{const node=document.querySelector('#knowledge-panel-llmwiki .llmwiki-lifecycle__status');if(!node)return reject(new Error('INBOX_QA_STATUS_MISSING'));node.scrollIntoView({block:'center',inline:'nearest',behavior:'instant'});for(let parent=node.parentElement;parent;parent=parent.parentElement)if(parent.scrollHeight>parent.clientHeight+1)parent.scrollTop=parent.scrollHeight;requestAnimationFrame(()=>requestAnimationFrame(resolve))})`);
  const metrics = await harness.evaluate(`(()=>{const root=document.querySelector('#knowledge-panel-llmwiki .llmwiki-lifecycle'),visible=node=>{const box=node.getBoundingClientRect(),style=getComputedStyle(node);return node.isConnected&&box.width>0&&box.height>0&&style.display!=='none'&&style.visibility!=='hidden'},all=root?[root,...root.querySelectorAll('*')].filter(visible):[],controls=all.filter(node=>node.matches('button,a[href],input,select,textarea,[role=button]')),target=node=>node.matches('input')?(node.closest('label')||node):node,text=(root&&root.innerText||'').trim();return{text,state:root&&root.dataset.state,ariaBusy:root&&root.getAttribute('aria-busy'),horizontalOverflow:all.filter(node=>node.clientWidth>0&&node.scrollWidth>node.clientWidth+1).map(node=>({tag:node.tagName,className:String(node.className),clientWidth:node.clientWidth,scrollWidth:node.scrollWidth,text:(node.innerText||'').trim().slice(0,100)})),documentOverflow:document.documentElement.scrollWidth>document.documentElement.clientWidth+1,cjkClipping:all.filter(node=>/[\uac00-\ud7af]/u.test(node.textContent||'')&&node.clientWidth>0&&node.scrollWidth>node.clientWidth+1).length,runtimeErrors:(document.body.innerText.match(/TASK13A_ERROR|TypeError:|ReferenceError:/gu)||[]).length,undersized:controls.filter(node=>{const box=target(node).getBoundingClientRect();return box.width<44||box.height<44}).map(node=>({action:node.getAttribute('data-action'),label:(target(node).innerText||node.getAttribute('aria-label')||'').trim(),width:target(node).getBoundingClientRect().width,height:target(node).getBoundingClientRect().height})),focused:document.activeElement&&document.activeElement.getAttribute('data-action'),writes:(window.__task13aWriteAttempts||[]).filter(row=>!String(row.path||'').startsWith('.obsidian/')&&String(row.path||'')!=='SYSTEM/PRIVATE/llmwiki-incremental-analysis-state.json'),metadataWrites:(window.__task13aWriteAttempts||[]).filter(row=>String(row.path||'').startsWith('.obsidian/')),nodeNetwork:(window.__task13aNodeNetworkAttempts||[]).slice()}})()`);
  assert.match(metrics.text, expected, name);
  assert.deepEqual(metrics.horizontalOverflow, [], name);
  assert.equal(metrics.documentOverflow, false, name);
  assert.equal(metrics.cjkClipping, 0, name);
  assert.equal(metrics.runtimeErrors, 0, name);
  assert.deepEqual(metrics.undersized, [], name);
  assert.deepEqual(metrics.writes, [], name);
  assert.deepEqual(metrics.nodeNetwork, [], name);
  const shot = await harness.cdp.send("Page.captureScreenshot", { format: "png", fromSurface: true });
  const bytes = Buffer.from(shot.data, "base64");
  const filename = `${name}-${width}.png`;
  fs.writeFileSync(path.join(SCREENSHOTS, filename), bytes);
  return { name, width, path: `screenshots/${filename}`, sha256: crypto.createHash("sha256").update(bytes).digest("hex"), bytes: bytes.length, metrics };
}

async function openLlmWiki(harness) {
  await harness.mountStructuralWorkspace("knowledge");
  await harness.collapseSidebar("knowledge", "left");
  await harness.collapseSidebar("knowledge", "right");
  await harness.evaluate("window.__task13aWriteAttempts=[];true");
  await harness.evaluate("window.KnowledgeExplorerHub.whenKnowledgeInboxSettled()");
  await harness.evaluate("window.KnowledgeExplorerHub.tabs.select('llmwiki');true");
  await harness.waitForSelector('#knowledge-panel-llmwiki [data-surface="llmwiki-lifecycle"]');
}

async function armAction(harness) {
  await harness.evaluate(`(()=>{const hub=window.KnowledgeExplorerHub;hub.lastLlmWikiAction=null;window.__inboxActionPromise=new Promise((resolve,reject)=>{const finish=()=>{const value=hub.lastLlmWikiAction;if(!value||!value.intent||value.intent.action!=='scan_inbox')return;cleanup();resolve(value)},cleanup=()=>{observer.disconnect();clearTimeout(timer)},observer=new MutationObserver(finish),timer=setTimeout(()=>{cleanup();reject(new Error('INBOX_QA_ACTION_TIMEOUT'))},10000);observer.observe(document.querySelector('#knowledge-panel-llmwiki'),{childList:true,subtree:true,attributes:true});finish()});return true})()`);
}

async function armState(harness, state, processed) {
  await harness.evaluate(`(()=>{window.__inboxStatePromise=new Promise((resolve,reject)=>{const finish=event=>{const value=event.detail;if(value&&value.state===${JSON.stringify(state)}&&value.processed===${processed}){cleanup();resolve(value)}},cleanup=()=>{window.removeEventListener('llmwiki-inbox-progress-qa',finish);clearTimeout(timer)},timer=setTimeout(()=>{cleanup();reject(new Error('INBOX_QA_STATE_TIMEOUT:'+${JSON.stringify(state)}+':'+${processed}))},10000);window.addEventListener('llmwiki-inbox-progress-qa',finish)});return true})()`);
}

test("isolated real Obsidian shows protected counts and barrier-controlled inbox progress", { timeout: 240000 }, async (t) => {
  if (process.env.LLMWIKI_INBOX_PROGRESS_REAL_OBSIDIAN !== "1") return t.skip("isolated real-Obsidian inbox progress QA runs explicitly");
  fs.mkdirSync(SCREENSHOTS, { recursive: true });
  const captures = [];
  const cleanups = [];
  const exceptions = [];
  let harness;
  let expectedIncrementalState = null;
  let incrementalProof = null;
  try {
    harness = await RealObsidianHarness.start("llmwiki-inbox-protected", { fixtureMutation: { llmWikiInboxProgress: "protected" } });
    harness.cdp.on("Runtime.exceptionThrown", (event) => exceptions.push(event.exceptionDetails?.text || "runtime exception"));
    await openLlmWiki(harness);
    await armAction(harness);
    await harness.trustedActivate('#knowledge-panel-llmwiki [data-action="scan-inbox"]', null, " ");
    const action = await harness.evaluate("window.__inboxActionPromise");
    assert.equal(action.response.status, "protected");
    assert.deepEqual({ eligible: action.response.results.length, total: action.response.total }, { eligible: 0, total: 24 });
    for (const width of [390, 1440]) captures.push(await capture(harness, "protected-24", width, /AI 분석 대상이 없습니다.*분석 대상 0개.*보호 유지 24개.*INBOX\/Private\//s));
    assert.deepEqual(harness.osNetworkAttempts, []);
  } finally {
    if (harness) cleanups.push(await harness.close());
  }

  try {
    harness = await RealObsidianHarness.start("llmwiki-inbox-controlled", { fixtureMutation: { llmWikiInboxProgress: "controlled" } });
    harness.cdp.on("Runtime.exceptionThrown", (event) => exceptions.push(event.exceptionDetails?.text || "runtime exception"));
    await harness.installStructuralFixtureRegistry();
    await harness.evaluate(`(()=>{window.__llmwikiInboxProgressQa=true;window.__llmwikiInboxProgressTimeline=[];window.addEventListener('llmwiki-inbox-progress-qa',event=>window.__llmwikiInboxProgressTimeline.push(structuredClone(event.detail)));window.__task13aFixtureRegistry.configure('knowledge','inboxAnalysis',{nonce:'inbox-initial',kind:'resolve',value:{ok:false,reason:'controlled_initial'}});return true})()`);
    await openLlmWiki(harness);
    await harness.evaluate(`window.__task13aFixtureRegistry.configure('knowledge','inboxAnalysis',{nonce:'inbox-controlled',kind:'defer'});window.__llmwikiInboxProgressTimeline=[];true`);
    await armState(harness, "analyzing", 0);
    await armAction(harness);
    await harness.trustedActivate('#knowledge-panel-llmwiki [data-action="scan-inbox"]', null, " ");
    const first = await harness.evaluate("window.__inboxStatePromise");
    assert.equal(first.current_title, "가 합성 지식.md");
    const initialTimeline = await harness.evaluate("window.__llmwikiInboxProgressTimeline");
    assert.ok(initialTimeline.some((state) => state.state === "queued" && state.processed === 0 && state.eligible === 2));
    captures.push(await capture(harness, "controlled-1-of-2", 390, /1\/2 분석 중.*가 합성 지식\.md/s));
    await armState(harness, "analyzing", 1);
    assert.equal(await harness.evaluate("window.__task13aFixtureRegistry.settle('knowledge','inboxAnalysis','resolve',{ok:true})"), true);
    const second = await harness.evaluate("window.__inboxStatePromise");
    assert.equal(second.current_title, "나 합성 지식.md");
    captures.push(await capture(harness, "controlled-2-of-2", 1440, /2\/2 분석 중.*나 합성 지식\.md/s));
    await armState(harness, "complete", 2);
    assert.equal(await harness.evaluate("window.__task13aFixtureRegistry.settle('knowledge','inboxAnalysis','resolve',{ok:true})"), true);
    const terminal = await harness.evaluate("window.__inboxStatePromise");
    const action = await harness.evaluate("window.__inboxActionPromise");
    assert.deepEqual({ scanned_total: terminal.scanned_total, eligible: terminal.eligible, held: terminal.held, processed: terminal.processed, succeeded: terminal.succeeded, failed: terminal.failed }, { scanned_total: 3, eligible: 2, held: 1, processed: 2, succeeded: 2, failed: 0 });
    assert.equal(action.response.status, "complete");
    for (const width of [390, 1440]) captures.push(await capture(harness, "controlled-complete", width, /2\/2 분석 완료.*성공 2개.*실패 0개.*보호 유지 1개/s));

    const beforeRepeatCalls = await harness.evaluate(`window.__task13aFixtureRegistry.consumptions().filter(item=>item.workspaceId==='knowledge'&&item.operation==='inboxAnalysis').length`);
    await harness.evaluate(`window.__task13aFixtureRegistry.configure('knowledge','inboxAnalysis',{nonce:'inbox-unchanged-must-not-call',kind:'reject',error:'UNCHANGED_PROVIDER_CALL'});true`);
    await armAction(harness);
    await harness.trustedActivate('#knowledge-panel-llmwiki [data-action="scan-inbox"]', null, " ");
    const unchangedAction = await harness.evaluate("window.__inboxActionPromise");
    const afterRepeatCalls = await harness.evaluate(`window.__task13aFixtureRegistry.consumptions().filter(item=>item.workspaceId==='knowledge'&&item.operation==='inboxAnalysis').length`);
    const unchangedState = await harness.evaluate("window.KnowledgeExplorerHub.llmWikiLifecycleSnapshot().inbox");
    assert.equal(unchangedAction.response.status, "up_to_date");
    assert.equal(afterRepeatCalls, beforeRepeatCalls);
    assert.deepEqual(
      { pending: unchangedState.pending, unchanged: unchangedState.unchanged, processed: unchangedState.processed },
      { pending: 0, unchanged: 2, processed: 0 },
    );
    const persistedState = await harness.evaluate(`(()=>{const file=app.vault.getAbstractFileByPath('SYSTEM/PRIVATE/llmwiki-incremental-analysis-state.json');return file?app.vault.cachedRead(file):''})()`);
    assert.doesNotMatch(persistedState, /source_text|첫 번째 격리 근거|두 번째 격리 근거|prompt|secret|Bearer/u);
    expectedIncrementalState = JSON.parse(persistedState);
    incrementalProof = {
      provider_calls_before_repeat: beforeRepeatCalls,
      provider_calls_after_repeat: afterRepeatCalls,
      repeat_provider_calls: afterRepeatCalls - beforeRepeatCalls,
      terminal_state: {
        state: unchangedState.state,
        pending: unchangedState.pending,
        unchanged: unchangedState.unchanged,
        processed: unchangedState.processed,
      },
      state_path: "SYSTEM/PRIVATE/llmwiki-incremental-analysis-state.json",
      state_contains_source_text: false,
    };
    for (const width of [390, 1440]) captures.push(await capture(harness, "incremental-up-to-date", width, /지식 INBOX가 최신 상태입니다.*변경 없는 자료 2개.*AI 호출 0회/s));
    assert.deepEqual(harness.osNetworkAttempts, []);
  } finally {
    if (harness) {
      const expectedJson = expectedIncrementalState
        ? { "SYSTEM/PRIVATE/llmwiki-incremental-analysis-state.json": expectedIncrementalState }
        : {};
      for (const relative of ["SYSTEM/PRIVATE/llmwiki-analysis-cache.json", "SYSTEM/PRIVATE/llmwiki-chunk-coverage.json", "SYSTEM/PRIVATE/llmwiki-inbox-proposals.json"]) {
        const absolute = path.join(harness.runtime.vault, relative);
        if (fs.existsSync(absolute)) expectedJson[relative] = JSON.parse(fs.readFileSync(absolute, "utf8"));
      }
      cleanups.push(await harness.close({ expectedJson }));
    }
  }

  assert.deepEqual(exceptions, []);
  for (const cleanup of cleanups) {
    assert.equal(cleanup.audit.equal, true);
    assert.equal(cleanup.protectedContinuity.exact, true);
    assert.equal(cleanup.removed, true);
    assert.equal(cleanup.portReusable, true);
  }
  fs.writeFileSync(path.join(EVIDENCE, "real-obsidian-manifest.json"), `${JSON.stringify({ ok: true, incrementalProof, captures, exceptions, cleanups }, null, 2)}\n`);
});
