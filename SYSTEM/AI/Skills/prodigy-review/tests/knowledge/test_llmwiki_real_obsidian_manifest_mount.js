#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const { RealObsidianHarness } = require("../shared/real_obsidian_harness.js");

const ROOT = path.resolve(__dirname, "../../../../../..");
const OUT = path.resolve(process.env.TASK15_REAL_OBSIDIAN_OUT || path.join(ROOT, ".omo/evidence/prodigy-llmwiki-autonomous-knowledge-git/task-15/manifest-order/real-obsidian"));
const VIEWPORTS = Object.freeze([
  Object.freeze({ width: 390, height: 900, zoom: 1 }),
  Object.freeze({ width: 820, height: 1000, zoom: 1 }),
  Object.freeze({ width: 1440, height: 1100, zoom: 1 }),
  Object.freeze({ width: 375, height: 812, zoom: 2 }),
]);
const OUTER_SCROLL_OWNER_RESOLVER = `()=>{const visible=node=>{const box=node.getBoundingClientRect(),style=getComputedStyle(node);return node.isConnected&&box.width>0&&box.height>0&&style.display!=='none'&&style.visibility!=='hidden'},describe=node=>{const style=getComputedStyle(node);return{tag:node.tagName.toLowerCase(),className:String(node.className),overflowY:style.overflowY,clientHeight:node.clientHeight,scrollHeight:node.scrollHeight,scrollTop:node.scrollTop}},shells=[...document.querySelectorAll('.prodigy-app-shell[data-workspace-id="knowledge"]')].filter(visible);if(shells.length!==1)throw new Error('TASK15_OUTER_SCROLL_SHELL_COUNT:'+shells.length);const shell=shells[0],candidates=[shell,shell.querySelector(':scope > .prodigy-app-shell-body')];for(let node=shell.parentElement;node&&node!==document.body&&node!==document.documentElement;node=node.parentElement)candidates.push(node);const unique=[...new Set(candidates.filter(Boolean))],owners=unique.filter(node=>{const style=getComputedStyle(node);return visible(node)&&/(auto|scroll)/u.test(style.overflowY)&&node.scrollHeight>node.clientHeight+1});if(owners.length===0)throw new Error('TASK15_OUTER_SCROLL_ZERO:'+JSON.stringify(unique.map(describe)));if(owners.length!==1)throw new Error('TASK15_OUTER_SCROLL_AMBIGUOUS:'+JSON.stringify(owners.map(describe)));return owners[0]}`;

async function setExactViewport(harness, viewport) {
  await harness.evaluate(`(()=>{let resolvePending,rejectPending;const promise=new Promise((resolve,reject)=>{resolvePending=resolve;rejectPending=reject});const finish=()=>{if(innerWidth!==${viewport.width}||innerHeight!==${viewport.height})return;removeEventListener('resize',finish);clearTimeout(guard);requestAnimationFrame(()=>requestAnimationFrame(()=>resolvePending({width:innerWidth,height:innerHeight,zoom:getComputedStyle(document.documentElement).zoom})))},guard=setTimeout(()=>{removeEventListener('resize',finish);rejectPending(new Error('TASK15_EXACT_VIEWPORT_TIMEOUT'))},10000);addEventListener('resize',finish);window.__task15ExactViewport={promise,finish};return true})()`);
  await harness.cdp.send("Emulation.setDeviceMetricsOverride", { width: viewport.width, height: viewport.height, deviceScaleFactor: 1, scale: 1, mobile: false });
  await harness.evaluate(`document.documentElement.style.zoom=${JSON.stringify(String(viewport.zoom))};window.__task15ExactViewport.finish();true`);
  const observed = await harness.evaluate("window.__task15ExactViewport.promise");
  await harness.evaluate("delete window.__task15ExactViewport;true");
  assert.deepEqual(observed, { width: viewport.width, height: viewport.height, zoom: String(viewport.zoom) });
}

async function resetOuterScroll(harness) {
  const result = await harness.evaluate(`(()=>{const resolveOuterScrollOwner=${OUTER_SCROLL_OWNER_RESOLVER},owner=resolveOuterScrollOwner();owner.scrollTop=0;return new Promise((resolve,reject)=>requestAnimationFrame(()=>requestAnimationFrame(()=>owner.scrollTop===0?resolve({className:String(owner.className),scrollTop:owner.scrollTop}):reject(new Error('TASK15_OUTER_SCROLL_RESET_FAILED:'+owner.scrollTop)))))})()`);
  assert.equal(result.scrollTop, 0, `outer scroll owner must reset to zero: ${JSON.stringify(result)}`);
  return result;
}

async function assertOuterScrollResolverMutationSensitive(harness) {
  const result = await harness.evaluate(`(()=>{const resolveOuterScrollOwner=${OUTER_SCROLL_OWNER_RESOLVER},owner=resolveOuterScrollOwner(),shell=document.querySelectorAll('.prodigy-app-shell[data-workspace-id="knowledge"]');const activeShell=[...shell].find(node=>{const box=node.getBoundingClientRect(),style=getComputedStyle(node);return node.isConnected&&box.width>0&&box.height>0&&style.display!=='none'&&style.visibility!=='hidden'}),body=activeShell.querySelector(':scope > .prodigy-app-shell-body'),ownerStyle=owner.getAttribute('style'),bodyStyle=body.getAttribute('style'),spacer=document.createElement('div'),messages=[];try{owner.style.setProperty('overflow-y','hidden','important');try{resolveOuterScrollOwner()}catch(error){messages.push(String(error.message))}if(ownerStyle===null)owner.removeAttribute('style');else owner.setAttribute('style',ownerStyle);spacer.style.height='3000px';activeShell.parentElement.append(spacer);body.style.setProperty('block-size','100px','important');body.style.setProperty('min-block-size','0','important');body.style.setProperty('max-block-size','100px','important');body.style.setProperty('overflow-y','auto','important');try{resolveOuterScrollOwner()}catch(error){messages.push(String(error.message))}return messages}finally{spacer.remove();if(ownerStyle===null)owner.removeAttribute('style');else owner.setAttribute('style',ownerStyle);if(bodyStyle===null)body.removeAttribute('style');else body.setAttribute('style',bodyStyle)}})()`);
  assert.match(result[0] || "", /^TASK15_OUTER_SCROLL_ZERO:/u, `removing ownership must fail explicitly: ${JSON.stringify(result)}`);
  assert.match(result[1] || "", /^TASK15_OUTER_SCROLL_AMBIGUOUS:/u, `adding a second owner must fail explicitly: ${JSON.stringify(result)}`);
}

async function inspectProductionMount(harness) {
  return harness.evaluate(`(()=>{
    const visible=node=>{const box=node.getBoundingClientRect(),style=getComputedStyle(node);return node.isConnected&&box.width>0&&box.height>0&&style.display!=='none'&&style.visibility!=='hidden'};
    const textLayout=node=>{if(!node)return{lineCount:0,maxGlyphsPerLine:0,text:''};const lines=new Map();for(const textNode of [...node.childNodes].filter(child=>child.nodeType===Node.TEXT_NODE||child.nodeType===Node.ELEMENT_NODE&&visible(child)).flatMap(child=>child.nodeType===Node.TEXT_NODE?[child]:[...child.childNodes].filter(item=>item.nodeType===Node.TEXT_NODE)))for(const item of new Intl.Segmenter('ko',{granularity:'grapheme'}).segment(textNode.textContent||'')){if(!item.segment.trim())continue;const range=document.createRange();range.setStart(textNode,item.index);range.setEnd(textNode,item.index+item.segment.length);const rect=range.getBoundingClientRect(),key=Math.round(rect.top*2)/2;lines.set(key,(lines.get(key)||0)+1)}return{text:node.textContent.trim(),lineCount:lines.size,maxGlyphsPerLine:Math.max(0,...lines.values())}};
    const shells=[...document.querySelectorAll('.prodigy-app-shell[data-workspace-id="knowledge"]')].filter(visible);
    const shell=shells[0]||null;
    const lifecycles=shell?[...shell.querySelectorAll('.llmwiki-lifecycle')].filter(visible):[];
    const tabs=shell?[...shell.querySelectorAll('.knowledge-workspace-tab')].filter(visible):[];
    const tabReadability=tabs.map(tab=>{const full=tab.querySelector('.knowledge-workspace-tab-label--full'),compact=tab.querySelector('.knowledge-workspace-tab-label--compact');return{...textLayout([...tab.querySelectorAll('.knowledge-workspace-tab-label')].find(visible)||tab),fullLabelVisible:Boolean(full&&visible(full)),compactLabelVisible:Boolean(compact&&visible(compact))}});
    const pageTitle=textLayout(shell&&shell.querySelector('.prodigy-workspace-title'));
    const homeAction=shell&&shell.querySelector('.prodigy-context-action'),homeLabel=textLayout(homeAction),homePseudo=homeAction&&getComputedStyle(homeAction,'::before').content;
    const activeBlock=shell&&shell.closest('.block-language-dataviewjs,.block-language-js-engine');
    const recoveryText=/필수 워크스페이스 리소스를 불러오지 못했습니다|모듈 실행 실패/u;
    const recoveries=activeBlock?[...activeBlock.querySelectorAll('*')].filter(node=>visible(node)&&recoveryText.test(node.innerText||node.textContent||'')):[];
    const controls=shell?[...shell.querySelectorAll('button,a[href],[role="button"],[role="tab"],input,select,textarea')].filter(node=>visible(node)&&!node.disabled&&node.getAttribute('aria-hidden')!=='true'):[];
    const zoomFactor=Number(getComputedStyle(document.documentElement).zoom)||1,targets=controls.map(control=>{const target=control.matches('input[type="checkbox"]')?(control.closest('.llmwiki-approval-review__selection-target,label')||control):control,box=target.getBoundingClientRect();return{tag:control.tagName.toLowerCase(),type:control.getAttribute('type'),text:(target.innerText||target.getAttribute('aria-label')||'').trim().slice(0,80),width:box.width,height:box.height,cssWidth:box.width/zoomFactor,cssHeight:box.height/zoomFactor}});
    const all=shell?[shell,...shell.querySelectorAll('*')].filter(visible):[];
    const overflow=all.filter(node=>node.clientWidth>0&&node.scrollWidth>node.clientWidth+1).map(node=>({tag:node.tagName.toLowerCase(),className:String(node.className).slice(0,120),clientWidth:node.clientWidth,scrollWidth:node.scrollWidth,text:(node.innerText||node.textContent||'').replace(/\s+/g,' ').trim().slice(0,80)}));
    const resolveOuterScrollOwner=${OUTER_SCROLL_OWNER_RESOLVER},outerScrollOwner=resolveOuterScrollOwner(),lifecycle=lifecycles[0]||null,primary=lifecycle&&lifecycle.querySelector('[data-primary="true"],.llmwiki-lifecycle__actions button:not(:disabled)'),shellBox=shell&&shell.getBoundingClientRect(),barBox=shell&&shell.querySelector('.prodigy-workspace-bar').getBoundingClientRect(),tabsBox=shell&&shell.querySelector('.knowledge-workspace-tabs-mount').getBoundingClientRect(),lifecycleBox=lifecycle&&lifecycle.getBoundingClientRect(),statusBox=lifecycle&&lifecycle.querySelector('.llmwiki-lifecycle__status')&&lifecycle.querySelector('.llmwiki-lifecycle__status').getBoundingClientRect(),primaryBox=primary&&primary.getBoundingClientRect(),ownerStyle=getComputedStyle(outerScrollOwner),verticalOwners=[{tag:outerScrollOwner.tagName.toLowerCase(),className:String(outerScrollOwner.className),overflowY:ownerStyle.overflowY,clientWidth:outerScrollOwner.clientWidth,scrollWidth:outerScrollOwner.scrollWidth,clientHeight:outerScrollOwner.clientHeight,scrollHeight:outerScrollOwner.scrollHeight,scrollTop:outerScrollOwner.scrollTop}];
    return{viewport:{width:innerWidth,height:innerHeight,zoom:getComputedStyle(document.documentElement).zoom,devicePixelRatio},appShellCount:shells.length,lifecycleCount:lifecycles.length,tabCount:tabs.length,tabLabels:tabs.map(tab=>tab.getAttribute('aria-label')||tab.textContent.trim()),tabReadability,pageTitle,homeLabel,homeUsesCompactIcon:Boolean(homePseudo&&homePseudo!=='none'&&homePseudo!=='normal'&&homePseudo!=='""'),geometry:{shellTop:shellBox&&shellBox.top,shellWidth:shellBox&&shellBox.width,barHeight:barBox&&barBox.height,tabsHeight:tabsBox&&tabsBox.height,lifecycleTop:lifecycleBox&&lifecycleBox.top,lifecycleHeight:lifecycleBox&&lifecycleBox.height,statusHeight:statusBox&&statusBox.height},chromeHeight:shellBox&&lifecycleBox?lifecycleBox.top-shellBox.top:null,primaryAction:primaryBox?{top:primaryBox.top,bottom:primaryBox.bottom,width:primaryBox.width,height:primaryBox.height,visibleInFirstViewport:primaryBox.top>=0&&primaryBox.bottom<=innerHeight,reachableWithOneViewportScroll:primaryBox.bottom<=innerHeight*2}:null,requiredResourceFallbackCount:recoveries.length,controls:targets,undersized:targets.filter(target=>target.cssWidth<44||target.cssHeight<44),overflow,verticalOwners,documentHorizontalOverflow:document.documentElement.scrollWidth>document.documentElement.clientWidth+1,shellHorizontalOverflow:shell.scrollWidth>shell.clientWidth+1};
  })()`);
}

test("protected real Obsidian mounts Knowledge with true 200% compact AppShell reflow",  { timeout: 240000 }, async () => {
  fs.mkdirSync(OUT, { recursive: true });
  let harness;
  const captures = [];
  try {
    harness = await RealObsidianHarness.start("task15-recovery-manifest-order");
    await harness.openWorkspace("knowledge");
    await harness.renderedClick("#knowledge-tab-llmwiki");
    await harness.waitForSelector("#knowledge-panel-llmwiki .llmwiki-lifecycle");
    for (const viewport of VIEWPORTS) {
      await harness.capture("knowledge", viewport.width, "light", viewport.zoom, false, "normal");
      await setExactViewport(harness, viewport);
      const resetOwner = await resetOuterScroll(harness);
      const metrics = await inspectProductionMount(harness);
      const shot = await harness.cdp.send("Page.captureScreenshot", { format: "png", fromSurface: true });
      const bytes = Buffer.from(shot.data, "base64");
      const suffix = viewport.zoom === 2 ? `${viewport.width}x${viewport.height}-zoom200` : `${viewport.width}x${viewport.height}`;
      const filename = `knowledge-${suffix}.png`;
      fs.writeFileSync(path.join(OUT, filename), bytes);
      captures.push({ ...viewport, file: filename, sha256: crypto.createHash("sha256").update(bytes).digest("hex"), metrics });
      assert.equal(metrics.requiredResourceFallbackCount, 0, "required-resource fallback must be absent");
      assert.equal(metrics.appShellCount, 1, "one production AppShell must mount");
      assert.equal(metrics.lifecycleCount, 1, "one lifecycle must mount");
      assert.equal(metrics.tabCount, 4, "exactly four Knowledge tabs must mount");
      assert.ok(metrics.pageTitle.maxGlyphsPerLine >= 2, `page title must not become a one-character column at ${viewport.width}/${viewport.zoom}: ${JSON.stringify(metrics.pageTitle)}`);
      assert.equal(metrics.homeLabel.lineCount, 1, `Home label must not become a vertical column at ${viewport.width}/${viewport.zoom}: ${JSON.stringify(metrics.homeLabel)}`);
      assert.equal(metrics.homeUsesCompactIcon, false, `Home must remain labelled text, not an icon-only glyph, at ${viewport.width}/${viewport.zoom}: ${JSON.stringify(metrics.homeLabel)}`);
      assert.deepEqual(metrics.tabReadability.filter(tab => !tab.fullLabelVisible || tab.maxGlyphsPerLine < 3), [], `every Knowledge tab must render its full readable label (no two-glyph compact collapse) at ${viewport.width}/${viewport.zoom}: ${JSON.stringify(metrics.tabReadability)}`);
      assert.deepEqual(metrics.tabReadability.filter(tab => tab.lineCount > 2 || tab.maxGlyphsPerLine < 5), [], `Knowledge labels must keep semantic words intact within two lines at ${viewport.width}/${viewport.zoom}: ${JSON.stringify(metrics.tabReadability)}`);
      assert.ok(metrics.chromeHeight <= viewport.height * 1.4, `AppShell chrome must remain within a sane ceiling (lifecycle reachable without burying content) at ${viewport.width}/${viewport.zoom}: ${JSON.stringify(metrics.geometry)}`);
      assert.ok(metrics.primaryAction && metrics.primaryAction.reachableWithOneViewportScroll, `lifecycle primary action must remain within one straightforward viewport scroll at ${viewport.width}/${viewport.zoom}: ${JSON.stringify({ chromeHeight: metrics.chromeHeight, geometry: metrics.geometry, primaryAction: metrics.primaryAction })}`);
      assert.deepEqual(metrics.undersized, [], `undersized (below 44 CSS px) product controls at ${viewport.width}/${viewport.zoom}: ${JSON.stringify(metrics.undersized)}`);
      assert.deepEqual(metrics.overflow, [], `product overflow at ${viewport.width}/${viewport.zoom}: ${JSON.stringify(metrics.overflow)}`);
      assert.equal(metrics.verticalOwners.length, 1, `exactly one visible vertical scroll owner must resolve at ${viewport.width}/${viewport.zoom}: ${JSON.stringify(metrics.verticalOwners)}`);
      assert.equal(metrics.verticalOwners[0].className, resetOwner.className, `scroll reset and geometry inspection must resolve the same owner at ${viewport.width}/${viewport.zoom}`);
      assert.equal(metrics.verticalOwners[0].scrollTop, 0, `resolved vertical scroll owner must remain reset at ${viewport.width}/${viewport.zoom}`);
      assert.equal(metrics.documentHorizontalOverflow, false, `document overflow at ${viewport.width}/${viewport.zoom}`);
      assert.equal(metrics.shellHorizontalOverflow, false, `Knowledge shell overflow at ${viewport.width}/${viewport.zoom}`);
    }
    await assertOuterScrollResolverMutationSensitive(harness);
  } finally {
    if (harness) {
      const cleanup = await harness.close();
      assert.equal(cleanup.audit.equal, true, "disposable vault remains byte-identical");
      assert.equal(cleanup.protectedContinuity.exact, true, "protected live applications remain unchanged");
      assert.equal(cleanup.removed, true, "runtime is removed");
      assert.equal(cleanup.portReusable, true, "debug port is reusable");
    }
  }
  const ownerClasses = [...new Set(captures.map(capture => capture.metrics.verticalOwners[0].className))];
  assert.ok(ownerClasses.some(className => className.includes("prodigy-app-shell-body")), `current AppShell-body scroll ownership must be covered: ${JSON.stringify(ownerClasses)}`);
  assert.ok(ownerClasses.some(className => className.includes("markdown-preview-view")), `legacy markdown-preview scroll ownership must remain covered: ${JSON.stringify(ownerClasses)}`);
  const receipt = { ok: true, kind: "task15-real-obsidian-true-zoom-full-labels-green-v2", source: "HUB/50 Knowledge.md", protectedLiveApplicationsUnchanged: true, requiredResourceFallbackCases: 0, appShellCases: captures.length, lifecycleCases: captures.length, fourTabCases: captures.length, oneCharacterTitleCases: 0, verticalHomeLabelCases: 0, wrappedCompactTabCases: 0, homeIconCollapseCases: 0, controlBelow44CssCases: 0, primaryBeyondOneScrollCases: 0, nestedVerticalScrollCases: 0, undersizedControlCases: 0, horizontalOverflowCases: 0, outerScrollOwnerClasses: ownerClasses, captures };
  fs.writeFileSync(path.join(OUT, "matrix.json"), JSON.stringify(receipt, null, 2) + "\n");
  console.log("TASK15_REAL_OBSIDIAN_TRUE_ZOOM_GREEN " + JSON.stringify({ ok: true, captures: captures.length }));
});
