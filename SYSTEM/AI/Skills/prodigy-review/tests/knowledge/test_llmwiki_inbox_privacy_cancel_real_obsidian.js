#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { test } = require("node:test");
const { RealObsidianHarness } = require("../shared/real_obsidian_harness.js");

const ROOT = path.resolve(__dirname, "../../../../../..");
const EVIDENCE = path.join(ROOT, ".omo/evidence/llmwiki-inbox-scan-progress-fix/repairs/privacy-cancel");
const SCREENSHOTS = path.join(EVIDENCE, "screenshots");

async function setViewport(harness, width) {
  await harness.cdp.send("Emulation.setDeviceMetricsOverride", { width, height: 900, deviceScaleFactor: 1, scale: 1, mobile: false });
  await harness.evaluate(`new Promise((resolve,reject)=>{const finish=()=>{if(innerWidth!==${width})return;removeEventListener('resize',finish);clearTimeout(timer);requestAnimationFrame(()=>requestAnimationFrame(resolve))},timer=setTimeout(()=>{removeEventListener('resize',finish);reject(new Error('PRIVACY_CANCEL_VIEWPORT_TIMEOUT'))},5000);addEventListener('resize',finish);finish()})`);
}

async function capture(harness, name, width, expected) {
  await setViewport(harness, width);
  await harness.evaluate(`new Promise((resolve,reject)=>{const node=document.querySelector('#knowledge-panel-llmwiki .llmwiki-lifecycle__status');if(!node)return reject(new Error('PRIVACY_CANCEL_STATUS_MISSING'));node.scrollIntoView({block:'center',inline:'nearest',behavior:'instant'});requestAnimationFrame(()=>requestAnimationFrame(resolve))})`);
  const metrics = await harness.evaluate(`(()=>{const root=document.querySelector('#knowledge-panel-llmwiki .llmwiki-lifecycle'),visible=node=>{const box=node.getBoundingClientRect(),style=getComputedStyle(node);return node.isConnected&&box.width>0&&box.height>0&&style.display!=='none'&&style.visibility!=='hidden'},all=root?[root,...root.querySelectorAll('*')].filter(visible):[],controls=all.filter(node=>node.matches('button,a[href],input,select,textarea,[role=button]')),text=(root&&root.innerText||'').trim(),target=node=>node.matches('input')?(node.closest('label')||node):node;return{text,state:root&&root.dataset.state,ariaBusy:root&&root.getAttribute('aria-busy'),horizontalOverflow:all.filter(node=>node.clientWidth>0&&node.scrollWidth>node.clientWidth+1).length,documentOverflow:document.documentElement.scrollWidth>document.documentElement.clientWidth+1,cjkClipping:all.filter(node=>/[\uac00-\ud7af]/u.test(node.textContent||'')&&node.clientWidth>0&&node.scrollWidth>node.clientWidth+1).length,runtimeErrors:(document.body.innerText.match(/TASK13A_ERROR|TypeError:|ReferenceError:/gu)||[]).length,undersized:controls.filter(node=>{const box=target(node).getBoundingClientRect();return box.width<44||box.height<44}).length,productWrites:(window.__task13aWriteAttempts||[]).filter(row=>!String(row.path||'').startsWith('.obsidian/')),nodeNetwork:(window.__task13aNodeNetworkAttempts||[]).slice()}})()`);
  assert.match(metrics.text, expected, name);
  assert.deepEqual({ horizontalOverflow: metrics.horizontalOverflow, documentOverflow: metrics.documentOverflow, cjkClipping: metrics.cjkClipping, runtimeErrors: metrics.runtimeErrors, undersized: metrics.undersized }, { horizontalOverflow: 0, documentOverflow: false, cjkClipping: 0, runtimeErrors: 0, undersized: 0 }, name);
  assert.deepEqual(metrics.productWrites, [], name);
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

async function armState(harness, state, processed) {
  await harness.evaluate(`(()=>{window.__privacyCancelState=new Promise((resolve,reject)=>{const finish=event=>{const value=event.detail;if(value&&value.state===${JSON.stringify(state)}&&value.processed===${processed}){cleanup();resolve(value)}},cleanup=()=>{window.removeEventListener('llmwiki-inbox-progress-qa',finish);clearTimeout(timer)},timer=setTimeout(()=>{cleanup();reject(new Error('PRIVACY_CANCEL_STATE_TIMEOUT'))},10000);window.addEventListener('llmwiki-inbox-progress-qa',finish)});return true})()`);
}

async function armTransportSettlement(harness) {
  await harness.evaluate(`(()=>{window.__privacyCancelTransportSettled=new Promise((resolve,reject)=>{const finish=event=>{cleanup();resolve(event.detail)},cleanup=()=>{window.removeEventListener('llmwiki-inbox-transport-settled',finish);clearTimeout(timer)},timer=setTimeout(()=>{cleanup();reject(new Error('PRIVACY_CANCEL_TRANSPORT_TIMEOUT'))},10000);window.addEventListener('llmwiki-inbox-transport-settled',finish)});return true})()`);
}

test("isolated Obsidian holds malformed paths and cancels an uncooperative inbox transport promptly", { timeout: 240000 }, async (t) => {
  if (process.env.LLMWIKI_PRIVACY_CANCEL_REAL_OBSIDIAN !== "1") return t.skip("isolated privacy/cancel QA runs explicitly");
  fs.mkdirSync(SCREENSHOTS, { recursive: true });
  const captures = [];
  const cleanups = [];
  const exceptions = [];
  let harness;
  try {
    harness = await RealObsidianHarness.start("llmwiki-malformed-held", { fixtureMutation: { llmWikiInboxProgress: "malformed" } });
    harness.cdp.on("Runtime.exceptionThrown", (event) => exceptions.push(event.exceptionDetails?.text || "runtime exception"));
    await harness.installStructuralFixtureRegistry();
    await harness.evaluate("window.__llmwikiInboxProgressQa=true;true");
    await openLlmWiki(harness);
    await harness.trustedActivate('#knowledge-panel-llmwiki [data-action="scan-inbox"]', null, " ");
    const malformed = await harness.evaluate("window.KnowledgeExplorerHub.whenKnowledgeInboxSettled()");
    assert.deepEqual({ state: malformed.state, eligible: malformed.eligible, held: malformed.held }, { state: "protected", eligible: 0, held: 1 });
    assert.equal((await harness.evaluate("window.__task13aFixtureRegistry.consumptions().filter(row=>row.operation==='inboxAnalysis').length")), 0);
    for (const width of [390, 1440]) captures.push(await capture(harness, "malformed-held", width, /AI 분석 대상이 없습니다.*분석 대상 0개.*보호 유지 1개/s));
    assert.deepEqual(harness.osNetworkAttempts, []);
  } finally {
    if (harness) cleanups.push(await harness.close());
  }

  try {
    harness = await RealObsidianHarness.start("llmwiki-prompt-cancel", { fixtureMutation: { llmWikiInboxProgress: "controlled" } });
    harness.cdp.on("Runtime.exceptionThrown", (event) => exceptions.push(event.exceptionDetails?.text || "runtime exception"));
    await harness.installStructuralFixtureRegistry();
    await harness.evaluate(`window.__llmwikiInboxProgressQa=true;window.__task13aFixtureRegistry.configure('knowledge','inboxAnalysis',{nonce:'cancel-initial',kind:'resolve',value:{ok:false,reason:'initial'}});true`);
    await openLlmWiki(harness);
    await harness.evaluate(`window.__task13aFixtureRegistry.configure('knowledge','inboxAnalysis',{nonce:'cancel-deferred',kind:'defer'});true`);
    await armState(harness, "analyzing", 0);
    await harness.trustedActivate('#knowledge-panel-llmwiki [data-action="scan-inbox"]', null, " ");
    await harness.evaluate("window.__privacyCancelState");
    assert.deepEqual(await harness.evaluate("window.__task13aFixtureRegistry.pending()"), [{ key: "knowledge:inboxAnalysis", nonce: "cancel-deferred" }]);
    captures.push(await capture(harness, "active-before-cancel", 390, /1\/2 분석 중.*가 합성 지식\.md/s));

    await armState(harness, "cancelled", 0);
    await harness.trustedActivate('#knowledge-panel-llmwiki [data-action="cancel-inbox"]', null, " ");
    const cancelled = await harness.evaluate("window.__privacyCancelState");
    assert.deepEqual({ state: cancelled.state, processed: cancelled.processed, succeeded: cancelled.succeeded, failed: cancelled.failed }, { state: "cancelled", processed: 0, succeeded: 0, failed: 0 });
    assert.deepEqual(await harness.evaluate("window.__task13aFixtureRegistry.pending()"), [{ key: "knowledge:inboxAnalysis", nonce: "cancel-deferred" }]);
    for (const width of [390, 1440]) captures.push(await capture(harness, "cancelled-before-release", width, /자료 분석을 취소했습니다.*처리 0\/2.*보호 유지 1개/s));

    await armTransportSettlement(harness);
    assert.equal(await harness.evaluate("window.__task13aFixtureRegistry.settle('knowledge','inboxAnalysis','resolve',{ok:true})"), true);
    await harness.evaluate("window.__privacyCancelTransportSettled");
    assert.equal((await harness.evaluate("window.KnowledgeExplorerHub.llmWikiLifecycleSnapshot().inbox.state")), "cancelled");

    await harness.evaluate(`window.__task13aFixtureRegistry.configure('knowledge','inboxAnalysis',{nonce:'cancel-fresh',kind:'resolve',value:{ok:true}});true`);
    await armState(harness, "complete", 2);
    await harness.trustedActivate('#knowledge-panel-llmwiki [data-action="scan-inbox"]', null, " ");
    const restarted = await harness.evaluate("window.__privacyCancelState");
    assert.deepEqual({ processed: restarted.processed, succeeded: restarted.succeeded, failed: restarted.failed }, { processed: 2, succeeded: 2, failed: 0 });
    for (const width of [390, 1440]) captures.push(await capture(harness, "fresh-rescan-complete", width, /2\/2 분석 완료.*성공 2개.*실패 0개/s));
    assert.deepEqual(harness.osNetworkAttempts, []);
  } finally {
    if (harness) {
      const expectedJson = {};
      for (const relative of ["SYSTEM/PRIVATE/llmwiki-incremental-analysis-state.json", "SYSTEM/PRIVATE/llmwiki-analysis-cache.json", "SYSTEM/PRIVATE/llmwiki-chunk-coverage.json", "SYSTEM/PRIVATE/llmwiki-inbox-proposals.json"]) {
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
  fs.writeFileSync(path.join(EVIDENCE, "real-obsidian-manifest.json"), `${JSON.stringify({ ok: true, captures, exceptions, cleanups }, null, 2)}\n`);
});
