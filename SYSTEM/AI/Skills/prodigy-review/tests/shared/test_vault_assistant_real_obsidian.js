#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const { RealObsidianHarness, snapshotProtected, treeHash } = require("./real_obsidian_harness.js");
const ROOT = path.resolve(__dirname, "../../../../../..");
const PLUGIN_ID = "prodigy-vault-assistant";
const PRODUCT = path.join(ROOT, ".obsidian/plugins", PLUGIN_ID);
const ICLOUD_FIXTURE = Object.freeze({ path: "iCloud-offloaded.md", content: "# iCloud\n\nICLOUD_PARTIAL_SENTINEL 원격 보관 근거.\n" });
let harnessPluginBackup = null;
const FIXTURES = Object.freeze({
  "OO홀.md": "# OO홀\n\nOO홀은 자연광이 좋은 촬영 장소이며 남향 창과 흰 벽이 있다.\n",
  "촬영법.md": "# 촬영법\n\nOO홀 촬영은 오전 역광을 피하고 50mm 렌즈와 확산광을 사용한다.\n",
  "People 민수.md": "# 민수\n\n민수는 금요일 촬영 준비를 맡고 조명 장비를 확인한다.\n",
  "Daily 2026-09-04.md": "# 2026-09-04\n\n민수와 OO홀 촬영 일정을 금요일 오전으로 확정했다.\n",
  "SYSTEM/PRIVATE/excluded-machine.md": "# excluded\n\nEXCLUDED_MACHINE_SENTINEL must never enter a request.\n",
  "empty-corpus-blank.md": "",
  "stale-source.md": "# 변경 근거\n\nSTALE_SOURCE_SENTINEL 최초 본문.\n",
  "large-multi-mib.md": `# 대형 문서\n\n${"대형합성본문 ".repeat(220000)}`,
});

function sha(bytes) {
  return crypto.createHash("sha256").update(bytes).digest("hex");
}
function installProduct(vault) {
  const target = path.join(vault, ".obsidian/plugins/task13a-local-dv");
  harnessPluginBackup = {
    main: fs.readFileSync(path.join(target, "main.js")),
    styles: fs.existsSync(path.join(target, "styles.css")) ? fs.readFileSync(path.join(target, "styles.css")) : null,
  };
  fs.copyFileSync(path.join(PRODUCT, "main.js"), path.join(target, "main.js"));
  fs.copyFileSync(path.join(PRODUCT, "styles.css"), path.join(target, "styles.css"));
  return target;
}
function removeProduct(vault) {
  const target = path.join(vault, ".obsidian/plugins/task13a-local-dv");
  if (harnessPluginBackup === null) return;
  fs.writeFileSync(path.join(target, "main.js"), harnessPluginBackup.main);
  if (harnessPluginBackup.styles === null) fs.rmSync(path.join(target, "styles.css"), { force: true });
  else fs.writeFileSync(path.join(target, "styles.css"), harnessPluginBackup.styles);
  harnessPluginBackup = null;
}
function fixtureHashes() {
  return Object.fromEntries([...Object.entries(FIXTURES), [ICLOUD_FIXTURE.path, ICLOUD_FIXTURE.content]].map(([name, body]) => [name, sha(body)]));
}
function pngReceipt(bytes) {
  return {
    signature: bytes.subarray(0, 8).toString("hex"),
    width: bytes.readUInt32BE(16),
    height: bytes.readUInt32BE(20),
    bytes: bytes.length,
    sha256: sha(bytes),
  };
}
async function createFixtures(harness) {
  await harness.evaluate(`(async()=>{const fixtures=${JSON.stringify(FIXTURES)},created=[];for(const [pathname,content] of Object.entries(fixtures)){const segments=pathname.split('/');for(let i=1;i<segments.length;i++){const folder=segments.slice(0,i).join('/');if(!app.vault.getAbstractFileByPath(folder))await app.vault.createFolder(folder)}if(app.vault.getAbstractFileByPath(pathname))throw new Error('PVA_FIXTURE_COLLISION:'+pathname);await app.vault.create(pathname,content);created.push(pathname)}window.__pvaFixturePaths=created;return created})()`);
}
async function removeFixtures(harness) {
  await harness.evaluate(`(async()=>{for(const pathname of window.__pvaFixturePaths||[]){const file=app.vault.getFileByPath(pathname);if(file)await app.vault.delete(file,true)}delete window.__pvaFixturePaths;return true})()`);
  for (const pathname of [...Object.keys(FIXTURES), ICLOUD_FIXTURE.path]) fs.rmSync(path.join(harness.runtime.vault, pathname), { force: true });
}
async function installFakeRuntime(harness) {
  await harness.evaluate(`(()=>{const original=app.plugins.getPlugin.bind(app.plugins),state={mode:'success',requests:[],cancels:[],settings:0,listeners:[],deferred:null,status:{status:'ready',adapters:1,in_flight:0,provider_label:'Deterministic QA',model_label:'fixture-v1'}},complete=(request,blocks)=>({protocol_version:'1.0.0',runtime_epoch:'qa-epoch-1',request_id:request.request_id,status:'completed',payload:{blocks},receipt:{consumer_id:'vault.assistant',attempt_id:request.attempt_id,provider_key:'Deterministic QA',model:'fixture-v1',route_class:'isolated-fixture'}}),api={getHandshake:()=>({plugin_id:'prodigy-ai-runtime',protocol_version:'1.0.0',consumer_manifest_range:'>=1 <2',runtime_epoch:'qa-epoch-1',capabilities:['structured-strict']}),getStatus:()=>state.status,subscribeStatus(listener){state.listeners.push(listener);return()=>{state.listeners=state.listeners.filter(item=>item!==listener)}},openSettings(){state.settings+=1},cancel(id){state.cancels.push(id);return{status:'cancel_requested'}},requestStructured(request){state.requests.push(structuredClone(request));const ids=request.schema.properties.blocks.items.properties.citationIds.items.enum;if(state.mode==='provider-unavailable')return Promise.resolve({...complete(request,[]),status:'failed',error_code:'configuration_missing',payload:null});if(state.mode==='malformed')return Promise.resolve({...complete(request,[]),payload:{blocks:[{kind:'paragraph',text:'malformed',citationIds:[]}]}});if(state.mode==='unknown-citation')return Promise.resolve({...complete(request,[]),payload:{blocks:[{kind:'paragraph',text:'unknown',citationIds:['cite-unknown']}]}});if(state.mode==='defer')return new Promise(resolve=>{state.deferred={request,resolve,ids}});const prompt=JSON.parse(request.prompt),question=prompt.question,text=question.includes('현재 초안')?'UNSAVED_DRAFT_SENTINEL을 확인했습니다.':question.includes('민수')?'민수의 금요일 일정과 Daily 기록을 확인했습니다.':'OO홀 장소와 촬영법을 함께 확인했습니다.';return Promise.resolve(complete(request,[{kind:'paragraph',text,citationIds:ids.slice(0,Math.min(2,ids.length))}]))}},plugin={api};app.plugins.getPlugin=id=>id==='prodigy-ai-runtime'?plugin:original(id);state.finishLate=()=>{const item=state.deferred;if(!item)return false;state.deferred=null;item.resolve(complete(item.request,[{kind:'paragraph',text:'LATE_RESPONSE_MUST_NOT_RENDER',citationIds:item.ids.slice(0,1)}]));return true};state.setStatus=status=>{state.status=status;for(const listener of state.listeners)listener(status)};window.__pvaQa=state;window.__pvaOriginalGetPlugin=original;return true})()`);
}
async function enableProduct(harness) {
  await harness.evaluate(`(async()=>{await app.plugins.disablePlugin('task13a-local-dv');delete require.cache[require.resolve(app.vault.adapter.getFullPath('.obsidian/plugins/task13a-local-dv/main.js'))];await app.plugins.loadPlugin('task13a-local-dv');await app.plugins.enablePlugin('task13a-local-dv');return Boolean(app.plugins.plugins['task13a-local-dv'])})()`);
}
async function disableProduct(harness) {
  await harness.evaluate(`(async()=>{app.workspace.detachLeavesOfType('${PLUGIN_ID}');await app.plugins.disablePlugin('task13a-local-dv');if(window.__pvaOriginalGetPlugin)app.plugins.getPlugin=window.__pvaOriginalGetPlugin;delete window.__pvaOriginalGetPlugin;delete window.__pvaQa;return true})()`);
  fs.writeFileSync(path.join(harness.runtime.vault, '.obsidian/community-plugins.json'), JSON.stringify(['task13a-local-dv']));
}
const EVIDENCE = path.join(ROOT, ".omo/evidence/prodigy-vault-assistant/task-11");
const SHOTS = path.join(EVIDENCE, "screenshots");
const DOM = path.join(EVIDENCE, "dom");
const RECEIPTS = path.join(EVIDENCE, "runtime-receipts");
const scenarios = [];
const artifacts = [];

function save(relative, value) {
  const target = path.join(EVIDENCE, relative);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, typeof value === "string" ? value : `${JSON.stringify(value, null, 2)}\n`);
  artifacts.push(path.relative(ROOT, target));
  return path.relative(ROOT, target);
}
function record(id, criterion, surface, invocation, expected, observed, pass, refs) {
  scenarios.push({ id, criterion, surface, invocation, expected, observed, verdict: pass ? "PASS" : "FAIL", artifactRefs: refs });
}
async function waitTerminal(harness) {
  return harness.evaluate(`new Promise((resolve,reject)=>{const root=document.querySelector('.prodigy-vault-assistant');let started=false;const finish=()=>{const state=root&&root.dataset.state;started=started||state==='retrieving'||state==='answering';if(started&&!['retrieving','answering'].includes(state)){observer.disconnect();clearTimeout(timer);resolve(state)}};const observer=new MutationObserver(finish);observer.observe(root,{attributes:true,subtree:true,childList:true});const timer=setTimeout(()=>{observer.disconnect();reject(new Error('PVA_TERMINAL_TIMEOUT:'+root?.dataset.state))},60000);finish()})`, 65000);
}
async function submit(harness, question) {
  await harness.evaluate(`(()=>{const input=document.querySelector('#pva-question');input.value=${JSON.stringify(question)};input.dispatchEvent(new Event('input',{bubbles:true}));return true})()`);
  const pending = waitTerminal(harness);
  await harness.trustedClick('.prodigy-vault-assistant [data-action="submit"]');
  return pending;
}
async function clearSelections(harness, clearHistory) {
  await harness.evaluate(`(()=>{window.__pvaCleared=new Promise((resolve,reject)=>{const root=document.querySelector('.prodigy-vault-assistant'),finish=()=>{if(!root.querySelector('[data-mention-remove]')&&(!${clearHistory}||!root.querySelector('[data-history-id]'))){observer.disconnect();clearTimeout(timer);resolve(true)}};const observer=new MutationObserver(finish);observer.observe(root,{childList:true,subtree:true});const timer=setTimeout(()=>{observer.disconnect();reject(new Error('PVA_CLEAR_TIMEOUT'))},30000);finish()});return true})()`);
  await harness.evaluate("[...document.querySelectorAll('[data-mention-remove]')].forEach(node=>node.click());true");
  if (clearHistory && await harness.evaluate("Boolean(document.querySelector('[data-action=\"clear-history\"]'))")) await harness.trustedClick("[data-action=\"clear-history\"]");
  await harness.evaluate("window.__pvaCleared.finally(()=>{delete window.__pvaCleared})");
}
async function surface(harness) {
  return harness.evaluate(`(()=>{const root=document.querySelector('.prodigy-vault-assistant');const box=node=>{const r=node.getBoundingClientRect();return{x:r.x,y:r.y,width:r.width,height:r.height}};const controls=[...root.querySelectorAll('button,textarea')].map(node=>({text:(node.innerText||node.value||'').slice(0,80),...box(node),outline:getComputedStyle(node).outlineStyle}));const over=[root,...root.querySelectorAll('*')].filter(node=>node.scrollHeight>node.clientHeight+1||node.scrollWidth>node.clientWidth+1).map(node=>({className:node.className,owner:node.dataset.scrollOwner||null,scrollHeight:node.scrollHeight,clientHeight:node.clientHeight}));const textNode=root.querySelector('.pva-answers > *, .pva-status');return{state:root.dataset.state,errorCode:root.dataset.errorCode,evidenceMode:root.dataset.evidenceMode,ariaBusy:root.getAttribute('aria-busy'),text:root.innerText,html:root.outerHTML,box:box(root),controls,undersized:controls.filter(item=>item.width<44||item.height<44),scrolling:over,cjk:getComputedStyle(textNode).wordBreak,activeTag:document.activeElement?.tagName||null,leafType:root.closest('.workspace-leaf-content')?.dataset.type||null}})()`);
}
async function switchSourceInSameLeaf(harness, from, to) {
  await harness.evaluate(`(()=>{const target=${JSON.stringify(to)};window.__pvaSourceChanged=new Promise((resolve,reject)=>{const observer=new MutationObserver(check);let timer;function check(){if(document.querySelector('.pva-current-document')?.textContent===target){observer.disconnect();clearTimeout(timer);resolve(true)}}observer.observe(document.body,{subtree:true,childList:true,characterData:true});timer=setTimeout(()=>{observer.disconnect();reject(new Error('PVA_SOURCE_LABEL_NOT_UPDATED'))},5000);check()});return true})()`);
  await harness.evaluate(`(async()=>{const leaf=app.workspace.getLeavesOfType('markdown').find(item=>item.view.file?.path===${JSON.stringify(from)});if(!leaf)throw new Error('SOURCE_LEAF_MISSING');await app.workspace.revealLeaf(leaf);app.workspace.setActiveLeaf(leaf,{focus:true});await leaf.openFile(app.vault.getFileByPath(${JSON.stringify(to)}));return true})()`);
  await harness.evaluate("window.__pvaSourceChanged.finally(()=>{delete window.__pvaSourceChanged})");
}
async function shot(harness, id, width, height, mobile, zoom = 1) {
  await harness.cdp.send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile, scale: 1 });
  await harness.evaluate(`document.documentElement.style.zoom=${JSON.stringify(String(zoom))};true`);
  const response = await harness.cdp.send("Page.captureScreenshot", { format: "png", fromSurface: true });
  const bytes = Buffer.from(response.data, "base64");
  const target = path.join(SHOTS, `${id}.png`); fs.writeFileSync(target, bytes);
  const receipt = { id, requested: { width, height, mobile, zoom }, ...pngReceipt(bytes), path: path.relative(ROOT, target) };
  artifacts.push(receipt.path); save(`screenshots/${id}.json`, receipt); return receipt;
}

async function exerciseS11(harness) {
  await clearSelections(harness, true); assert.deepEqual(await harness.evaluate("({history:document.querySelectorAll('[data-history-id]').length,mentions:document.querySelectorAll('[data-mention-remove]').length})"), { history: 0, mentions: 0 });
  if (!await harness.evaluate("document.querySelector('[data-mode=\"current_document\"]')?.getAttribute('aria-selected')==='true'")) await harness.trustedClick('[data-mode="current_document"]');
  await harness.evaluate(`(()=>{const input=document.querySelector('#pva-question');input.value='@stale';input.dispatchEvent(new Event('input',{bubbles:true}));return true})()`); await harness.waitForSelector('[data-mention-suggestion="stale-source.md"]'); await harness.trustedClick('[data-mention-suggestion="stale-source.md"]'); await submit(harness, "STALE_SOURCE_SENTINEL 근거");
  const active = await harness.evaluate("(()=>{const buttons=[...document.querySelectorAll('[data-history-id]')];return{count:buttons.length,id:buttons[0]?.dataset.historyId??null,label:buttons[0]?.textContent??null}})()"); assert.equal(active.count, 1); assert.equal(typeof active.id, "string"); assert.equal(active.label, "STALE_SOURCE_SENTINEL 근거");
  await harness.evaluate(`(async()=>{const f=app.vault.getFileByPath('stale-source.md');await app.vault.modify(f,'# 변경 근거\\n\\n수정된 본문.');return true})()`); await harness.trustedClick(`[data-history-id=${JSON.stringify(active.id)}]`); await harness.waitForSelector('[data-source-status="stale"]'); const stale = await surface(harness);
  fs.rmSync(path.join(harness.runtime.vault, "stale-source.md")); await harness.evaluate("delete app.vault.fileMap['stale-source.md'];true"); await harness.trustedClick(`[data-history-id=${JSON.stringify(active.id)}]`); await harness.waitForSelector('[data-source-status="missing"]'); const missing = await surface(harness);
  await clearSelections(harness, true); const cleared = await surface(harness); const ref = save("dom/history-stale-deleted-clear.json", { active, stale, missing, cleared });
  record("S11", "stale/deleted source and history reopen/clear", "real Obsidian persisted history", "clear rendered state; assert one new history id; mutate/delete source; reopen exact id; clear", "one active entry, stale enabled, deleted disabled, history cleared", { active, stale: stale.text.includes("변경됨"), missing: missing.text.includes("삭제됨"), clear: !cleared.html.includes("data-history-id") }, stale.text.includes("변경됨") && missing.text.includes("삭제됨") && !cleared.html.includes("data-history-id"), [ref]);
}
async function runFocusedS11(harness) {
  await harness.evaluate(`(async()=>{const f=app.vault.getFileByPath('OO홀.md'),leaf=app.workspace.getLeaf('tab');await leaf.openFile(f);await leaf.setViewState({type:'markdown',state:{file:'OO홀.md',mode:'source',source:true}});return true})()`);
  await harness.evaluate(`(async()=>{const leaf=app.workspace.getRightLeaf(false);await leaf.setViewState({type:'${PLUGIN_ID}',active:true});await app.workspace.revealLeaf(leaf);return true})()`); await harness.waitForSelector('.prodigy-vault-assistant'); await exerciseS11(harness);
}

async function runJourneys(harness) {
  const beforeRequests = () => harness.evaluate("window.__pvaQa.requests.length");
  await harness.evaluate(`(async()=>{const f=app.vault.getFileByPath('OO홀.md'),leaf=app.workspace.getLeaf('tab');await leaf.openFile(f);await leaf.setViewState({type:'markdown',state:{file:'OO홀.md',mode:'source',source:true}});leaf.view.editor.setValue('# OO홀\\n\\nUNSAVED_DRAFT_SENTINEL 현재 초안 촬영 계획.');return true})()`);
  await harness.evaluate(`(async()=>{const id=Object.keys(app.commands.commands).find(value=>value.endsWith(':open-vault-assistant')),commandAccepted=Boolean(id);let leaf=app.workspace.getRightLeaf(false);if(!leaf)throw new Error('PVA_RIGHT_LEAF_UNAVAILABLE');const beforeView=leaf.view,beforeViewType=beforeView?.getViewType?.();const mounted=new Promise((resolve,reject)=>{const finish=()=>{if(document.querySelector('.prodigy-vault-assistant')){observer.disconnect();clearTimeout(timer);resolve(true)}};const observer=new MutationObserver(finish);observer.observe(document.body,{childList:true,subtree:true});const timer=setTimeout(()=>{observer.disconnect();reject(new Error('PVA_NATIVE_MOUNT_TIMEOUT:'+JSON.stringify({beforeViewType,sameView:leaf.view===beforeView,afterViewType:leaf.view?.getViewType?.(),beforeConstructor:beforeView?.constructor?.name,afterConstructor:leaf.view?.constructor?.name,driver:Boolean(leaf.view?.driver),hasOwnDriver:Object.prototype.hasOwnProperty.call(leaf.view||{},'driver'),loaded:leaf.view?._loaded,contentChildren:leaf.view?.contentEl?.childElementCount})))},30000);finish()});await leaf.setViewState({type:'${PLUGIN_ID}',active:true});await app.workspace.revealLeaf(leaf);await mounted;const lifecycleAutoMounted=Boolean(document.querySelector('.prodigy-vault-assistant'));window.__pvaOpenReceipt={id,commandAccepted,rightSidebar:Boolean(leaf&&leaf.getRoot&&leaf.getRoot()!==app.workspace.rootSplit),viewType:leaf.view?.getViewType?.(),plugin:Boolean(app.plugins.plugins['task13a-local-dv']),lifecycleAutoMounted,manualOnOpenFallback:false,driver:Boolean(leaf.view?.driver),constructor:leaf.view?.constructor?.name,registryKeys:Object.keys(app.viewRegistry||{}),registryTypes:Object.keys(app.viewRegistry?.viewByType||{})};if(!document.querySelector('.prodigy-vault-assistant'))throw new Error('PVA_VIEW_MOUNT_FAILED:'+JSON.stringify(window.__pvaOpenReceipt));return true})()`);
  const openReceipt=await harness.evaluate('structuredClone(window.__pvaOpenReceipt)'); const openRef=save('dom/open-lifecycle.json',openReceipt); record('S00','registered view lifecycle','real Obsidian right sidebar','setViewState production view','view mounts through Obsidian lifecycle without direct onOpen call',openReceipt,openReceipt.lifecycleAutoMounted,[openRef]);
  let state = await submit(harness, "현재 초안 내용을 확인해 줘");
  let request = await harness.evaluate("structuredClone(window.__pvaQa.requests.at(-1))");
  let view = await surface(harness); let ref = save("runtime-receipts/current-unsaved.json", request);
  record("S01", "Current Document unsaved text", "real Obsidian desktop view", "trusted ribbon click; type question; click 질문 보내기", "request contains unsaved editor bytes", { state, containsUnsaved: request.prompt.includes("UNSAVED_DRAFT_SENTINEL") }, state === "answered" && request.prompt.includes("UNSAVED_DRAFT_SENTINEL"), [ref]);

  await switchSourceInSameLeaf(harness, "OO홀.md", "촬영법.md");
  state = await submit(harness, "현재 문서의 촬영 안내는?");
  request = await harness.evaluate("structuredClone(window.__pvaQa.requests.at(-1))");
  const switchedEvidence = JSON.parse(request.prompt).context.filter(item => item.kind === "vault_evidence").flatMap(item => item.chunks.map(chunk => chunk.text));
  ref = save("runtime-receipts/same-leaf-source-switch.json", { state, switchedEvidence });
  record("S01b", "same-leaf current document switch", "real Obsidian Markdown tab", "open another document in the existing leaf and submit", "new file label and only new file evidence", { state, switchedEvidence }, state === "answered" && switchedEvidence.some(text => text.includes("50mm")) && switchedEvidence.every(text => !text.includes("UNSAVED_DRAFT_SENTINEL")), [ref]);
  await switchSourceInSameLeaf(harness, "촬영법.md", "OO홀.md");

  await harness.evaluate(`(()=>{const input=document.querySelector('#pva-question');input.value='@촬영';input.dispatchEvent(new Event('input',{bubbles:true}));return true})()`); await harness.waitForSelector('[data-mention-suggestion="촬영법.md"]'); await harness.trustedClick('[data-mention-suggestion="촬영법.md"]');
  state = await submit(harness, "OO홀 촬영 방법은?"); request = await harness.evaluate("structuredClone(window.__pvaQa.requests.at(-1))"); ref = save("runtime-receipts/mention.json", request);
  record("S02", "structured @mention", "real Obsidian composer", "type @촬영; choose 촬영법.md; submit", "structured selected file enters evidence", { state, mentionVisible: (await surface(harness)).text.includes("@촬영법"), evidence: request.prompt.includes("촬영법") }, state === "answered" && request.prompt.includes("촬영법"), [ref]);

  await harness.trustedClick('[role="tab"][data-mode="whole_vault"]');
  state = await submit(harness, "OO홀 장소와 촬영법을 함께 요약해 줘"); request = await harness.evaluate("structuredClone(window.__pvaQa.requests.at(-1))"); ref = save("runtime-receipts/whole-venue-shooting.json", request);
  record("S03", "Whole Vault venue+shooting synthesis", "real Obsidian whole-vault tab", "select 전체 Vault; submit venue query", "both fixture facts sent and cited", { state, hasVenue: request.prompt.includes("OO홀"), hasShooting: request.prompt.includes("50mm") }, state === "answered" && request.prompt.includes("50mm"), [ref]);
  state = await submit(harness, "민수의 금요일 촬영 일정은?"); request = await harness.evaluate("structuredClone(window.__pvaQa.requests.at(-1))"); ref = save("runtime-receipts/whole-people-daily.json", request);
  const vaultEvidence = JSON.parse(request.prompt).context.filter(item => item.kind === "vault_evidence").flatMap(item => item.chunks.map(chunk => chunk.text)); const people = vaultEvidence.some(text => text.includes("민수는 금요일 촬영 준비")); const daily = vaultEvidence.some(text => text.includes("민수와 OO홀 촬영 일정을 금요일 오전으로 확정했다"));
  record("S04", "Whole Vault People+Daily synthesis", "real Obsidian whole-vault tab", "submit People and Daily query; inspect parsed vault_evidence chunks", "People and Daily evidence reaches runtime", { state, people, daily }, state === "answered" && people && daily, [ref]);

  await clearSelections(harness, true); const calls = await beforeRequests();
  state = await submit(harness, "퀀텀해파리비존재어"); const callsAfter = await beforeRequests(); view = await surface(harness); ref = save("dom/no-evidence.json", view);
  record("S05", "no-evidence zero-call", "real Obsidian empty retrieval result", "remove mentions; clear history; await no chips/history; submit unmatched token", "no_evidence and runtime call count unchanged", { state, calls, callsAfter }, state === "no_evidence" && callsAfter === calls, [ref]);

  const excludedCalls = await beforeRequests(); state = await submit(harness, "EXCLUDED_MACHINE_SENTINEL"); const excludedCallsAfter = await beforeRequests();
  const evidenceChunks = await harness.evaluate(`window.__pvaQa.requests.slice(${excludedCalls}).flatMap(request=>JSON.parse(request.prompt).context.filter(item=>item.kind==='vault_evidence').flatMap(item=>item.chunks.map(chunk=>chunk.text)))`); view = await surface(harness); ref = save("dom/exclusion.json", { state, calls: excludedCalls, callsAfter: excludedCallsAfter, evidenceChunks, text: view.text });
  record("S06", "excluded machine path", "real Obsidian retrieval", "record call count; submit exact excluded sentinel; parse only vault_evidence chunks", "excluded content never sent; zero runtime call", { state, calls: excludedCalls, callsAfter: excludedCallsAfter, evidenceLeak: evidenceChunks.some(text=>text.includes("EXCLUDED_MACHINE_SENTINEL")) }, state === "no_evidence" && excludedCallsAfter === excludedCalls && evidenceChunks.every(text=>!text.includes("EXCLUDED_MACHINE_SENTINEL")), [ref]);

  await harness.evaluate(`new Promise((resolve,reject)=>{const pathname=${JSON.stringify(ICLOUD_FIXTURE.path)},ref=app.vault.on('create',file=>{if(file.path!==pathname)return;app.vault.offref(ref);clearTimeout(timer);window.__pvaFixturePaths.push(pathname);resolve(file.path)}),timer=setTimeout(()=>{app.vault.offref(ref);reject(new Error('PVA_ICLOUD_CREATE_TIMEOUT'))},30000);app.vault.create(pathname,${JSON.stringify(ICLOUD_FIXTURE.content)}).catch(error=>{app.vault.offref(ref);clearTimeout(timer);reject(error)})})`);
  await harness.evaluate(`(()=>{window.__pvaCachedRead=app.vault.cachedRead;app.vault.cachedRead=file=>file.path===${JSON.stringify(ICLOUD_FIXTURE.path)}?Promise.reject(new Error('offline')):window.__pvaCachedRead.call(app.vault,file);return true})()`);
  try { state = await submit(harness, "ICLOUD_PARTIAL_SENTINEL OO홀"); } finally { await harness.evaluate("app.vault.cachedRead=window.__pvaCachedRead;delete window.__pvaCachedRead;true"); } view = await surface(harness); ref = save("dom/partial-icloud.json", view);
  record("S07", "partial iCloud", "real Obsidian cachedRead boundary", "inject one deterministic read rejection; submit", "partial answer names omitted document count", { state, text: view.text }, state === "partial" && /개 누락/u.test(view.text), [ref]);

  await harness.evaluate("window.__pvaQa.mode='malformed';true"); state = await submit(harness, "malformed 응답"); view = await surface(harness); ref = save("dom/malformed.json", view);
  record("S08a", "malformed citation", "real Obsidian runtime boundary", "fake runtime malformed; submit", "invalid response with explicit retry and no ungrounded answer", { state, text: view.text }, state === "error" && view.errorCode === "invalid_response", [ref]);
  await harness.evaluate("window.__pvaQa.mode='unknown-citation';true"); const unknownTerminal = waitTerminal(harness); await harness.trustedClick('[data-action="retry"]'); state = await unknownTerminal; view = await surface(harness); ref = save("dom/unknown-citation.json", view);
  record("S08b", "unknown citation", "real Obsidian runtime boundary", "set unknown-citation mode; click retry", "invalid response and no ungrounded answer", { state, text: view.text }, state === "error" && view.errorCode === "invalid_response" && !view.text.includes("unknown\n"), [ref]);
  await harness.evaluate("window.__pvaQa.mode='success';true"); const recovered = waitTerminal(harness); await harness.trustedClick('[data-action="retry"]'); await recovered;

  await clearSelections(harness, false); await harness.trustedClick('[role="tab"][data-mode="current_document"]'); await harness.waitForSelector('[role="tab"][data-mode="current_document"][aria-selected="true"]');
  await harness.evaluate("window.__pvaQa.mode='provider-unavailable';true"); state = await submit(harness, "OO홀"); view = await surface(harness); const errorActions = await harness.evaluate("[...document.querySelectorAll('.pva-actions [data-action]')].map(node=>node.dataset.action)"); ref = save("dom/provider-unavailable.json", { state, text: view.text, errorActions });
  record("S09", "unavailable provider", "real Obsidian Current Document runtime boundary", "clear mentions; select Current Document; submit small OO홀 evidence with configuration_missing runtime", "runtime_unavailable with settings as the only recovery action", { state, text: view.text, errorActions }, state === "error" && view.errorCode === "runtime_unavailable" && JSON.stringify(errorActions) === JSON.stringify(["settings"]), [ref]);
  await harness.evaluate("window.__pvaQa.mode='success';true"); await harness.evaluate(`(async()=>{const current=app.workspace.getLeavesOfType('${PLUGIN_ID}')[0];current.detach();const leaf=app.workspace.getRightLeaf(false);await leaf.setViewState({type:'${PLUGIN_ID}',active:true});await app.workspace.revealLeaf(leaf);return true})()`); await harness.waitForSelector('.prodigy-vault-assistant');

  await submit(harness, "OO홀 기준 답변"); const retained = (await surface(harness)).text.includes("OO홀 장소");
  await harness.evaluate(`(()=>{window.__pvaQa.mode='defer';const api=app.plugins.getPlugin('prodigy-ai-runtime').api,requestStructured=api.requestStructured.bind(api);api.requestStructured=request=>{window.dispatchEvent(new CustomEvent('pva-qa-runtime-deferred'));return requestStructured(request)};window.__pvaDeferred=new Promise((resolve,reject)=>{const finish=()=>{clearTimeout(timer);resolve(true)};window.addEventListener('pva-qa-runtime-deferred',finish,{once:true});const timer=setTimeout(()=>{window.removeEventListener('pva-qa-runtime-deferred',finish);reject(new Error('PVA_DEFERRED_TIMEOUT'))},30000)});const input=document.querySelector('#pva-question');input.value='OO홀 late response';input.dispatchEvent(new Event('input',{bubbles:true}));return true})()`); await harness.trustedClick('[data-action="submit"]'); await harness.evaluate("window.__pvaDeferred"); const cancelled = waitTerminal(harness); await harness.trustedClick('[data-action="cancel"]'); state = await cancelled; await harness.evaluate("window.__pvaQa.finishLate();Promise.resolve().then(()=>Promise.resolve())"); view = await surface(harness); ref = save("runtime-receipts/cancel-late.json", { state, view, qa: await harness.evaluate("({cancels:window.__pvaQa.cancels,requests:window.__pvaQa.requests.length})") });
  record("S10", "cancel/late response", "real Obsidian cancel control", "defer runtime; click 취소; release late result", "cancelled, prior answer retained, late text absent", { state, retainedBefore: retained, retainedAfter: view.text.includes("OO홀 장소"), late: view.text.includes("LATE_RESPONSE") }, state === "cancelled" && retained && view.text.includes("OO홀 장소") && !view.text.includes("LATE_RESPONSE"), [ref]);

  await harness.evaluate("window.__pvaQa.mode='success';true"); const cancelledRecovery = waitTerminal(harness); await harness.trustedClick('[data-action="retry"]'); await cancelledRecovery; await exerciseS11(harness);
}

test("Todo 11 complete real Obsidian Vault Assistant journeys", { timeout: 1200000 }, async () => {
  fs.mkdirSync(SHOTS, { recursive: true }); fs.mkdirSync(DOM, { recursive: true }); fs.mkdirSync(RECEIPTS, { recursive: true });
  const protectedSnapshot = snapshotProtected(); const harness = await RealObsidianHarness.start("pva-task11", { protectedSnapshot, trustOnboarding: "required" }); let cleanup; const runtimeEvents = []; harness.cdp.on("Runtime.exceptionThrown", event => runtimeEvents.push(event)); harness.cdp.on("Log.entryAdded", event => runtimeEvents.push(event)); await harness.cdp.send("Log.enable");
  try {
    installProduct(harness.runtime.vault); await createFixtures(harness); await installFakeRuntime(harness); await enableProduct(harness); if (process.env.PVA_FOCUS_S11 === "1") await runFocusedS11(harness); else await runJourneys(harness);
    if (process.env.PVA_FOCUS_S11 !== "1") { const mac = await shot(harness, "mac-sidebar", 1280, 900, false); let view = await surface(harness); let ref = save("dom/mac-sidebar.json", view); record("S12", "Mac sidebar", "real Obsidian desktop sidebar", "CDP viewport 1280x900 capture", "assistant is sidebar with valid PNG", { leafType: view.leafType, screenshot: mac }, view.leafType === PLUGIN_ID && mac.signature === "89504e470d0a1a0a", [mac.path, ref]);
    const ipad = await shot(harness, "ipad-logical-sidebar", 834, 1112, false); view = await surface(harness); ref = save("dom/ipad-logical.json", view); record("S13", "logical iPad sidebar", "real Obsidian logical viewport", "CDP 834x1112, desktop/tablet sidebar contract", "sidebar remains usable; physical not claimed", { box: view.box, undersized: view.undersized }, view.box.width > 0 && view.undersized.length === 0, [ipad.path, ref]);
    await harness.cdp.send("Emulation.setDeviceMetricsOverride", { width: 430, height: 932, deviceScaleFactor: 1, mobile: true, scale: 1 });
    await harness.evaluate("Promise.all([app.workspace.leftSplit?.collapse?.(),app.workspace.rightSplit?.collapse?.()])");
    await harness.evaluate(`(()=>{window.__pvaEditorSized=new Promise((resolve,reject)=>{let observedRoot=null,resizeSeen=false;const finish=()=>{const leaf=app.workspace.getLeavesOfType('${PLUGIN_ID}').find(item=>item.getRoot()===app.workspace.rootSplit),root=leaf?.view?.containerEl?.querySelector('.prodigy-vault-assistant'),host=root?.closest('.workspace-leaf-content');if(root&&host&&root!==observedRoot){observedRoot=root;resizeSeen=false;resize.observe(root);resize.observe(host)}if(resizeSeen&&root?.getBoundingClientRect().width>0&&host?.getBoundingClientRect().width>0){resize.disconnect();mutations.disconnect();clearTimeout(timer);resolve({root:root.getBoundingClientRect().width,host:host.getBoundingClientRect().width})}};const resize=new ResizeObserver(()=>{resizeSeen=true;finish()}),mutations=new MutationObserver(finish),timer=setTimeout(()=>{resize.disconnect();mutations.disconnect();reject(new Error('PVA_EDITOR_SIZE_TIMEOUT'))},30000);mutations.observe(document.body,{childList:true,subtree:true});finish()});return true})()`);
    await harness.evaluate(`(async()=>{const current=app.workspace.getLeavesOfType('${PLUGIN_ID}')[0];current.detach();const leaf=app.workspace.getLeaf('tab');await leaf.setViewState({type:'${PLUGIN_ID}',active:true});await app.workspace.revealLeaf(leaf);return window.__pvaEditorSized.finally(()=>{delete window.__pvaEditorSized})})()`);
    await harness.cdp.send("Emulation.setEmulatedMedia", { media: "screen", features: [{ name: "prefers-reduced-motion", value: "reduce" }, { name: "forced-colors", value: "active" }] }); const phone = await shot(harness, "iphone-logical-editor-forced", 430, 932, true); await harness.evaluate("document.querySelector('.prodigy-vault-assistant [role=tab]').focus();true"); await harness.cdp.send("Input.dispatchKeyEvent", { type: "keyDown", key: "Tab", code: "Tab", windowsVirtualKeyCode: 9 }); await harness.cdp.send("Input.dispatchKeyEvent", { type: "keyUp", key: "Tab", code: "Tab", windowsVirtualKeyCode: 9 }); view = await surface(harness); ref = save("dom/iphone-logical-a11y.json", view); const owners = view.scrolling.filter(item => item.owner === "assistant-transcript"); record("S14", "logical iPhone editor + a11y", "real Obsidian logical phone viewport", "move production view to editor tab; 430x932; reduced-motion+forced-color; keyboard Tab", "editor view, 44px controls, focus, CJK, one scroll owner", { leafType: view.leafType, undersized: view.undersized, activeTag: view.activeTag, cjk: view.cjk, owners: owners.length }, view.leafType === PLUGIN_ID && view.undersized.length === 0 && view.activeTag !== "BODY" && view.cjk === "keep-all" && owners.length <= 1, [phone.path, ref]);
    const zoom = await shot(harness, "iphone-logical-200pct", 430, 932, true, 2); record("S15", "200% zoom", "real Obsidian logical phone viewport", "CSS zoom 200%; capture 430x932", "valid full viewport PNG", zoom, zoom.width === 430 && zoom.height === 932 && zoom.signature === "89504e470d0a1a0a", [zoom.path]);
    save("source-hashes.json", { product: Object.fromEntries(["main.js","manifest.json","styles.css"].map(name=>[name,sha(fs.readFileSync(path.join(PRODUCT,name)))])), fixtures: fixtureHashes(), beforeVault: harness.runtime.before.hash, currentVault: treeHash(harness.runtime.vault).hash });
    save("physical-device-status.json", { iphone: "not_proven", ipad: "not_proven", reason: "No connected physical device automation receipt; logical CDP layouts are not physical proof." }); }
  } catch (error) {
    save("runtime-exceptions.json", runtimeEvents); throw error;
  } finally {
    try { await disableProduct(harness); } catch {} removeProduct(harness.runtime.vault); await removeFixtures(harness); cleanup = await harness.close(); save("cleanup.json", cleanup);
  }
  const failed = scenarios.filter(item => item.verdict !== "PASS"); const manifest = { schemaVersion: 1, task: 11, generatedAt: new Date().toISOString(), physical_claim_status: "not_proven", scenarios, artifacts, cleanup, summary: { total: scenarios.length, passed: scenarios.length - failed.length, failed: failed.length } }; save(process.env.PVA_FOCUS_S11 === "1" ? "focused-s11/manifest.json" : "manifest.json", manifest);
  assert.deepEqual(failed, [], `Todo 11 journey failures: ${failed.map(item => item.id).join(",")}`);
});
