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

async function setExactViewport(harness, viewport) {
  await harness.evaluate(`(()=>{let resolvePending,rejectPending;const promise=new Promise((resolve,reject)=>{resolvePending=resolve;rejectPending=reject});const finish=()=>{if(innerWidth!==${viewport.width}||innerHeight!==${viewport.height})return;removeEventListener('resize',finish);clearTimeout(guard);requestAnimationFrame(()=>requestAnimationFrame(()=>resolvePending({width:innerWidth,height:innerHeight,zoom:getComputedStyle(document.documentElement).zoom})))},guard=setTimeout(()=>{removeEventListener('resize',finish);rejectPending(new Error('TASK15_EXACT_VIEWPORT_TIMEOUT'))},10000);addEventListener('resize',finish);window.__task15ExactViewport={promise,finish};return true})()`);
  await harness.cdp.send("Emulation.setDeviceMetricsOverride", { width: viewport.width, height: viewport.height, deviceScaleFactor: 1, scale: 1, mobile: false });
  await harness.evaluate(`document.documentElement.style.zoom=${JSON.stringify(String(viewport.zoom))};window.__task15ExactViewport.finish();true`);
  const observed = await harness.evaluate("window.__task15ExactViewport.promise");
  await harness.evaluate("delete window.__task15ExactViewport;true");
  assert.deepEqual(observed, { width: viewport.width, height: viewport.height, zoom: String(viewport.zoom) });
}

async function resetOuterScroll(harness) {
  await harness.evaluate(`(()=>{const shell=document.querySelector('.prodigy-app-shell[data-workspace-id="knowledge"]'),preview=shell&&shell.closest('.markdown-preview-view');if(!preview)throw new Error('TASK15_OUTER_SCROLL_MISSING');preview.scrollTop=0;return new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve(preview.scrollTop))))})()`);
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
    const preview=shell&&shell.closest('.markdown-preview-view'),lifecycle=lifecycles[0]||null,primary=lifecycle&&lifecycle.querySelector('[data-primary="true"],.llmwiki-lifecycle__actions button:not(:disabled)'),shellBox=shell&&shell.getBoundingClientRect(),barBox=shell&&shell.querySelector('.prodigy-workspace-bar').getBoundingClientRect(),tabsBox=shell&&shell.querySelector('.knowledge-workspace-tabs-mount').getBoundingClientRect(),lifecycleBox=lifecycle&&lifecycle.getBoundingClientRect(),statusBox=lifecycle&&lifecycle.querySelector('.llmwiki-lifecycle__status')&&lifecycle.querySelector('.llmwiki-lifecycle__status').getBoundingClientRect(),primaryBox=primary&&primary.getBoundingClientRect(),verticalOwners=[preview,shell,shell&&shell.querySelector('.prodigy-app-shell-body'),lifecycle].filter(Boolean).filter(node=>{const style=getComputedStyle(node);return/(auto|scroll)/u.test(style.overflowY)&&node.scrollHeight>node.clientHeight+1}).map(node=>({className:String(node.className),clientHeight:node.clientHeight,scrollHeight:node.scrollHeight}));
    return{viewport:{width:innerWidth,height:innerHeight,zoom:getComputedStyle(document.documentElement).zoom,devicePixelRatio},appShellCount:shells.length,lifecycleCount:lifecycles.length,tabCount:tabs.length,tabLabels:tabs.map(tab=>tab.getAttribute('aria-label')||tab.textContent.trim()),tabReadability,pageTitle,homeLabel,homeUsesCompactIcon:Boolean(homePseudo&&homePseudo!=='none'&&homePseudo!=='normal'&&homePseudo!=='""'),geometry:{shellTop:shellBox&&shellBox.top,shellWidth:shellBox&&shellBox.width,barHeight:barBox&&barBox.height,tabsHeight:tabsBox&&tabsBox.height,lifecycleTop:lifecycleBox&&lifecycleBox.top,lifecycleHeight:lifecycleBox&&lifecycleBox.height,statusHeight:statusBox&&statusBox.height},chromeHeight:shellBox&&lifecycleBox?lifecycleBox.top-shellBox.top:null,primaryAction:primaryBox?{top:primaryBox.top,bottom:primaryBox.bottom,width:primaryBox.width,height:primaryBox.height,visibleInFirstViewport:primaryBox.top>=0&&primaryBox.bottom<=innerHeight,reachableWithOneViewportScroll:primaryBox.bottom<=innerHeight*2}:null,requiredResourceFallbackCount:recoveries.length,controls:targets,undersized:targets.filter(target=>target.cssWidth<44||target.cssHeight<44),overflow,verticalOwners,documentHorizontalOverflow:document.documentElement.scrollWidth>document.documentElement.clientWidth+1,previewHorizontalOverflow:Boolean(preview&&preview.scrollWidth>preview.clientWidth+1)};
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
      await resetOuterScroll(harness);
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
      assert.ok(metrics.chromeHeight <= viewport.height * 1.4, `AppShell chrome must remain within a sane ceiling (lifecycle reachable without burying content) at ${viewport.width}/${viewport.zoom}: ${JSON.stringify(metrics.geometry)}`);
      assert.ok(metrics.primaryAction && metrics.primaryAction.reachableWithOneViewportScroll, `lifecycle primary action must remain within one straightforward viewport scroll at ${viewport.width}/${viewport.zoom}: ${JSON.stringify({ chromeHeight: metrics.chromeHeight, geometry: metrics.geometry, primaryAction: metrics.primaryAction })}`);
      assert.deepEqual(metrics.undersized, [], `undersized (below 44 CSS px) product controls at ${viewport.width}/${viewport.zoom}: ${JSON.stringify(metrics.undersized)}`);
      assert.deepEqual(metrics.overflow, [], `product overflow at ${viewport.width}/${viewport.zoom}: ${JSON.stringify(metrics.overflow)}`);
      assert.ok(metrics.verticalOwners.length <= 1 && metrics.verticalOwners.every(owner => owner.className.includes('markdown-preview-view')), `the outer Obsidian preview must remain the sole vertical scroll owner at ${viewport.width}/${viewport.zoom}: ${JSON.stringify(metrics.verticalOwners)}`);
      assert.equal(metrics.documentHorizontalOverflow, false, `document overflow at ${viewport.width}/${viewport.zoom}`);
      assert.equal(metrics.previewHorizontalOverflow, false, `preview overflow at ${viewport.width}/${viewport.zoom}`);
    }
  } finally {
    if (harness) {
      const cleanup = await harness.close();
      assert.equal(cleanup.audit.equal, true, "disposable vault remains byte-identical");
      assert.equal(cleanup.protectedContinuity.exact, true, "protected live applications remain unchanged");
      assert.equal(cleanup.removed, true, "runtime is removed");
      assert.equal(cleanup.portReusable, true, "debug port is reusable");
    }
  }
  const receipt = { ok: true, kind: "task15-real-obsidian-true-zoom-full-labels-green-v2", source: "HUB/50 Knowledge.md", protectedLiveApplicationsUnchanged: true, requiredResourceFallbackCases: 0, appShellCases: captures.length, lifecycleCases: captures.length, fourTabCases: captures.length, oneCharacterTitleCases: 0, verticalHomeLabelCases: 0, wrappedCompactTabCases: 0, homeIconCollapseCases: 0, controlBelow44CssCases: 0, primaryBeyondOneScrollCases: 0, nestedVerticalScrollCases: 0, undersizedControlCases: 0, horizontalOverflowCases: 0, captures };
  fs.writeFileSync(path.join(OUT, "matrix.json"), JSON.stringify(receipt, null, 2) + "\n");
  console.log("TASK15_REAL_OBSIDIAN_TRUE_ZOOM_GREEN " + JSON.stringify({ ok: true, captures: captures.length }));
});
