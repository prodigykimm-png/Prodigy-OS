#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const { RealObsidianHarness } = require("../shared/real_obsidian_harness.js");

const ROOT = path.resolve(__dirname, "../../../../../..");
const EVIDENCE = path.join(ROOT, ".omo/evidence/llmwiki-live-onboarding-fix");
const SCREENSHOTS = path.join(EVIDENCE, "screenshots");

async function openLifecycle(harness) {
  await harness.openWorkspace("knowledge");
  await harness.collapseSidebar("knowledge", "left");
  await harness.collapseSidebar("knowledge", "right");
  await harness.evaluate("window.KnowledgeExplorerHub.whenKnowledgeInboxSettled()");
  await harness.renderedClick("#knowledge-tab-llmwiki");
  await harness.waitForSelector('#knowledge-panel-llmwiki [data-action="enable-rollout-phase"]');
}

async function capture(harness, captureOptions) {
  const { name, width, expected } = captureOptions;
  await harness.cdp.send("Emulation.setDeviceMetricsOverride", { width, height: 900, deviceScaleFactor: 1, scale: 1, mobile: false });
  await harness.evaluate(`new Promise((resolve,reject)=>{const root=document.querySelector('#knowledge-panel-llmwiki .llmwiki-lifecycle');let prior='',stable=0;const finish=()=>{const box=root&&root.getBoundingClientRect(),value=box&&[box.x,box.y,box.width,box.height,root.innerText.length].join(':');stable=value===prior?stable+1:0;prior=value;if(stable>=2){clearTimeout(timer);resolve(true);return}requestAnimationFrame(finish)};const timer=setTimeout(()=>reject(new Error('ONBOARDING_LAYOUT_TIMEOUT')),5000);finish()})`);
  const metrics = await harness.evaluate(`(()=>{const root=document.querySelector('#knowledge-panel-llmwiki .llmwiki-lifecycle'),visible=node=>{const box=node.getBoundingClientRect(),style=getComputedStyle(node);return box.width>0&&box.height>0&&style.display!=='none'&&style.visibility!=='hidden'},all=[root,...root.querySelectorAll('*')].filter(visible),controls=all.filter(node=>node.matches('button,a[href],input,select,textarea,[role=button]')),literature=root.querySelector('[data-action="select-source"]'),rollout=root.querySelector('[data-action="enable-rollout-phase"]'),text=root.innerText;literature.focus({preventScroll:true});return{text,rolloutIntent:rollout&&rollout.getAttribute('data-intent-action'),literatureIntent:literature&&literature.getAttribute('data-intent-action'),literatureFocused:document.activeElement===literature,horizontalOverflow:all.filter(node=>node.clientWidth>0&&node.scrollWidth>node.clientWidth+1).length,overflowDetails:all.filter(node=>node.clientWidth>0&&node.scrollWidth>node.clientWidth+1).map(node=>({tag:node.tagName,className:String(node.className),clientWidth:node.clientWidth,scrollWidth:node.scrollWidth,text:(node.innerText||'').trim().slice(0,120)})),documentOverflow:document.documentElement.scrollWidth>document.documentElement.clientWidth+1,cjkClipping:all.filter(node=>/[\uac00-\ud7af]/u.test(node.textContent||'')&&node.clientWidth>0&&node.scrollWidth>node.clientWidth+1).length,undersized:controls.filter(node=>{const box=node.getBoundingClientRect();return box.width<44||box.height<44}).map(node=>{const box=node.getBoundingClientRect();return{action:node.getAttribute('data-action'),label:(node.innerText||node.getAttribute('aria-label')||'').trim(),width:box.width,height:box.height}}),runtimeDomErrors:(document.body.innerText.match(/TASK13A_ERROR|TypeError:|ReferenceError:/gu)||[]).length,rollout:window.KnowledgeExplorerHub.llmWikiLifecycleSnapshot().rollout,stored:localStorage.getItem('prodigy.llmwiki.rollout-state.v1')}})()`);
  assert.match(metrics.text, expected.copy, name);
  assert.equal(metrics.rolloutIntent, "enable_rollout_phase", name);
  assert.equal(metrics.literatureIntent, "select_source", name);
  assert.equal(metrics.literatureFocused, true, name);
  assert.equal(metrics.horizontalOverflow, 0, `${name}: ${JSON.stringify(metrics.overflowDetails)}`);
  assert.equal(metrics.documentOverflow, false, name);
  assert.equal(metrics.cjkClipping, 0, name);
  assert.deepEqual(metrics.undersized, [], name);
  assert.equal(metrics.runtimeDomErrors, 0, name);
  if (expected.frameLiterature) await harness.evaluate(`new Promise((resolve,reject)=>{const action=document.querySelector('#knowledge-panel-llmwiki [data-action="select-source"]');if(!action)return reject(new Error('ONBOARDING_LITERATURE_ACTION_MISSING'));action.scrollIntoView({block:'center',inline:'nearest',behavior:'instant'});requestAnimationFrame(()=>requestAnimationFrame(()=>resolve(true)))})`);
  const shot = await harness.cdp.send("Page.captureScreenshot", { format: "png", fromSurface: true });
  const bytes = Buffer.from(shot.data, "base64");
  const filename = `${name}-${width}.png`;
  fs.writeFileSync(path.join(SCREENSHOTS, filename), bytes);
  return { name, width, path: `screenshots/${filename}`, sha256: crypto.createHash("sha256").update(bytes).digest("hex"), bytes: bytes.length, image_inspected: false, metrics };
}

async function activateCreate(harness, expectedOk) {
  await harness.evaluate(`(()=>{const hub=window.KnowledgeExplorerHub;window.__onboardingActivation=new Promise((resolve,reject)=>{const finish=()=>{const action=hub.lastLlmWikiAction;if(!action||action.intent.action!=='enable_rollout_phase')return;observer.disconnect();clearTimeout(timer);resolve({action,snapshot:hub.llmWikiLifecycleSnapshot(),stored:localStorage.getItem('prodigy.llmwiki.rollout-state.v1')})};const observer=new MutationObserver(finish),timer=setTimeout(()=>{observer.disconnect();reject(new Error('ONBOARDING_ACTION_TIMEOUT'))},10000);observer.observe(document.querySelector('#knowledge-panel-llmwiki'),{childList:true,subtree:true,attributes:true});finish()});return true})()`);
  await harness.trustedClick('#knowledge-panel-llmwiki [data-action="enable-rollout-phase"]');
  const receipt = await harness.evaluate("window.__onboardingActivation");
  assert.equal(receipt.action.response.ok, expectedOk);
  return receipt;
}

test("real Obsidian onboarding uses closure-backed create activation and visible fail-closed recovery", { timeout: 180000 }, async (t) => {
  if (process.env.LLMWIKI_ONBOARDING_REAL_OBSIDIAN !== "1") return t.skip("isolated real-Obsidian onboarding QA runs explicitly");
  fs.mkdirSync(SCREENSHOTS, { recursive: true });
  const captures = [];
  const cleanups = [];
  const exceptions = [];
  let harness;
  try {
    harness = await RealObsidianHarness.start("llmwiki-onboarding-valid", { fixtureMutation: { llmWikiOnboarding: "valid" } });
    harness.cdp.on("Runtime.exceptionThrown", (event) => exceptions.push(event.exceptionDetails?.text || "runtime exception"));
    await openLifecycle(harness);
    for (const width of [1440, 390]) captures.push(await capture(harness, { name: "initial", width, expected: { copy: /보호된 자료는 기기 안에서만 읽고 외부 AI에는 보내지 않았습니다/ } }));
    captures.push(await capture(harness, { name: "initial-literature", width: 390, expected: { copy: /아직 쓰기 단계가 활성화되지 않았습니다/, frameLiterature: true } }));
    const enabled = await activateCreate(harness, true);
    assert.deepEqual(enabled.snapshot.rollout.enabled_phases, ["create"]);
    assert.match(enabled.snapshot.rollout.gate_receipts.create.receipt_id, /^llmwiki-rollout:create:397d1eda/u);
    for (const width of [1440, 390]) captures.push(await capture(harness, { name: "create-enabled", width, expected: { copy: /활성화됨: 새 지식\(create\)/ } }));
    captures.push(await capture(harness, { name: "create-enabled-literature", width: 390, expected: { copy: /활성화됨: 새 지식\(create\)/, frameLiterature: true } }));
  } finally {
    if (harness) cleanups.push(await harness.close());
  }

  try {
    harness = await RealObsidianHarness.start("llmwiki-onboarding-missing", { fixtureMutation: { llmWikiOnboarding: "missing" } });
    harness.cdp.on("Runtime.exceptionThrown", (event) => exceptions.push(event.exceptionDetails?.text || "runtime exception"));
    await openLifecycle(harness);
    const rejected = await activateCreate(harness, false);
    assert.deepEqual(rejected.snapshot.rollout.enabled_phases, []);
    assert.equal(rejected.stored, null);
    captures.push(await capture(harness, { name: "missing-closure", width: 390, expected: { copy: /활성화 확인 자료를 검증하지 못했습니다/ } }));
  } finally {
    if (harness) cleanups.push(await harness.close());
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
