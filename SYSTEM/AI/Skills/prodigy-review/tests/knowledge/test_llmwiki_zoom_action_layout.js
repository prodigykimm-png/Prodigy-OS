"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { test } = require("node:test");
const { RealObsidianHarness } = require("../shared/real_obsidian_harness.js");
const { operation, hash } = require("./llmwiki_real_product_fixtures.js");

const ROOT = path.resolve(__dirname, "../../../../../..");
const RECEIPT_PATH = process.env.ZOOM_ACTION_LAYOUT_RECEIPT || "";
const MUTATION_RECEIPT_PATH = process.env.ZOOM_ACTION_LAYOUT_MUTATION_RECEIPT || "";
const SCREENSHOT_DIR = process.env.ZOOM_ACTION_LAYOUT_SCREENSHOTS || "";
const ACTION_CONTRACTS = Object.freeze([
  Object.freeze({ action: "approve", label: "승인", required: true }),
  Object.freeze({ action: "reject", label: "거절", required: true }),
  Object.freeze({ action: "request-revision", label: "수정 요청", required: true }),
  Object.freeze({ action: "approve-batch", label: "안전한 묶음 승인", required: false }),
]);

async function openLongReview(harness) {
  await harness.mountStructuralWorkspace("knowledge");
  await harness.collapseSidebar("knowledge", "left");
  await harness.collapseSidebar("knowledge", "right");
  await harness.renderedClick("#knowledge-tab-llmwiki");
  await harness.evaluate("window.KnowledgeExplorerHub.whenKnowledgeInboxSettled()");
  await harness.evaluate(`(()=>{const hub=window.KnowledgeExplorerHub;window.__zoomRepairReject=new Promise((resolve,reject)=>{let settled=false;const cleanup=()=>{observer.disconnect();window.removeEventListener('task21-lifecycle-action',finish);clearTimeout(timer)},finish=()=>{if(settled||hub.llmWikiLifecycleSnapshot().status!=='cancelled')return;settled=true;cleanup();resolve(true)},observer=new MutationObserver(finish),timer=setTimeout(()=>{cleanup();reject(new Error('ZOOM_REPAIR_INITIAL_REJECT_TIMEOUT'))},10000);window.addEventListener('task21-lifecycle-action',finish);observer.observe(document.querySelector('#knowledge-panel-llmwiki'),{childList:true,subtree:true,attributes:true});finish()});return true})()`);
  await harness.renderedClick('#knowledge-panel-llmwiki [data-action="reject"]');
  await harness.evaluate("window.__zoomRepairReject");

  const target = "ZETA/PERMANENT/task21-zoom-action-layout.md";
  const longCjk = "긴 한글 검토 문장은 조사와 서술어가 자연스럽게 이어져야 하며 좁은 화면과 이백 퍼센트 확대에서도 한 글자 고립이나 잘림 없이 읽혀야 합니다. ".repeat(4);
  const longUrl = `https://example.invalid/knowledge/${"very-long-unbroken-segment-".repeat(8)}끝`;
  const raw = operation("create", "zoom-action-layout", {
    after_bytes: { [target]: `# 긴 한글과 URL 확대 검증\n\n${longCjk}\n\n${longUrl}\n` },
    source_citations: [{ source_id: "source_zoom_action_layout", content_hash: hash(longCjk + longUrl), source_url: longUrl, locators: ["INBOX/Knowledge/TASK21 Stateful.md"], source_archive_id: null, confidence: "explicit" }],
  });
  const opened = await harness.evaluate(`(()=>{const raw=${JSON.stringify(raw)},parsed=window.LLMWikiOperationContract.parseOperation(JSON.stringify(raw));if(!parsed.ok)throw new Error('ZOOM_REPAIR_OPERATION:'+parsed.reason);const hub=window.KnowledgeExplorerHub;window.__task21Stateful.nextOperation=raw;const result=hub.llmWikiRunController.openPreparedRiskReview({run_id:'run_zoom_action_layout',proposals:[{operation:parsed.value,title:'긴 한글과 URL 확대 검증'}]});hub.llmWikiLifecycle.update(hub.llmWikiLifecycleSnapshot());return{ok:result.ok,reason:result.reason}})()`);
  assert.equal(opened.ok, true, JSON.stringify(opened));
  await harness.waitForSelector('#knowledge-panel-llmwiki [data-action="approve"]');
}

async function settleReview(harness) {
  await harness.evaluate(`new Promise((resolve,reject)=>{const root=document.querySelector('#knowledge-panel-llmwiki .llmwiki-lifecycle'),action=root&&root.querySelector('[data-action="approve"]');if(!root||!action)return reject(new Error('ZOOM_REPAIR_TARGET_MISSING'));let stable=0,last='',done=false;const cleanup=()=>{observer.disconnect();resize.disconnect();clearTimeout(timer)},finish=()=>{if(done)return;action.scrollIntoView({block:'center',inline:'nearest',behavior:'instant'});action.focus({preventScroll:true});const a=action.getBoundingClientRect(),r=root.getBoundingClientRect(),sig=[a.x,a.y,a.width,a.height,r.x,r.y,r.width,r.height,document.documentElement.style.zoom].join(':');stable=sig===last?stable+1:0;last=sig;if(stable>=2){done=true;cleanup();resolve(true);return}requestAnimationFrame(finish)},observer=new MutationObserver(finish),resize=new ResizeObserver(finish),timer=setTimeout(()=>{cleanup();reject(new Error('ZOOM_REPAIR_FRAME_TIMEOUT'))},5000);observer.observe(root,{childList:true,subtree:true,attributes:true});resize.observe(root);resize.observe(action);requestAnimationFrame(finish)})`);
}

async function measure(harness) {
  return harness.evaluate(`(()=>{const required=${JSON.stringify(ACTION_CONTRACTS)},root=document.querySelector('#knowledge-panel-llmwiki .llmwiki-lifecycle'),review=root.querySelector('.llmwiki-approval-review'),strip=review.querySelector('.llmwiki-approval-review__decision-strip'),head=review.querySelector('.llmwiki-approval-review__operation-head'),selection=head.querySelector('.llmwiki-approval-review__selection-target'),heading=head.querySelector('h3'),visible=node=>{const r=node.getBoundingClientRect(),s=getComputedStyle(node);return r.width>0&&r.height>0&&s.display!=='none'&&s.visibility!=='hidden'&&s.visibility!=='collapse'&&parseFloat(s.opacity)>0},rect=node=>{const r=node.getBoundingClientRect();return{x:r.x,y:r.y,width:r.width,height:r.height,right:r.right,bottom:r.bottom}},directTextRects=node=>{const range=document.createRange(),rows=[];for(const child of node.childNodes){if(child.nodeType!==Node.TEXT_NODE||!child.textContent.trim())continue;range.selectNodeContents(child);for(const r of range.getClientRects())rows.push({x:r.x,y:r.y,width:r.width,height:r.height,right:r.right,bottom:r.bottom})}return rows},stripRect=rect(strip),actions=required.map(spec=>{const matches=[...strip.querySelectorAll('[data-action="'+spec.action+'"]')],node=matches[0]||null;if(!node)return{...spec,count:0};const r=rect(node),style=getComputedStyle(node),lines=directTextRects(node),fontSize=parseFloat(style.fontSize),zoom=parseFloat(getComputedStyle(document.documentElement).zoom||'1');return{...spec,count:matches.length,text:node.textContent.trim(),visible:visible(node),focusable:node.matches('button:not(:disabled)')&&node.tabIndex>=0,disabled:node.disabled,rect:r,fullyContained:r.x>=stripRect.x-1&&r.y>=stripRect.y-1&&r.right<=stripRect.right+1&&r.bottom<=stripRect.bottom+1,clipped:node.scrollWidth>node.clientWidth+1||node.scrollHeight>node.clientHeight+1||lines.some(line=>line.x<r.x-1||line.y<r.y-1||line.right>r.right+1||line.bottom>r.bottom+1),lines,orphanLines:lines.filter(line=>spec.label.length>1&&line.width<fontSize*zoom*1.5)};}),all=[root,...root.querySelectorAll('*')].filter(visible),cjk=all.filter(node=>/[\\u3040-\\u30ff\\u3400-\\u9fff\\uac00-\\ud7af]/u.test(node.textContent||'')),clipped=cjk.filter(node=>node.scrollWidth>node.clientWidth+1||node.scrollHeight>node.clientHeight+1),lineOverlaps=[];for(let i=0;i<actions.length;i+=1)for(let j=i+1;j<actions.length;j+=1)for(const a of actions[i].lines||[])for(const b of actions[j].lines||[])if(Math.min(a.right,b.right)-Math.max(a.x,b.x)>0&&Math.min(a.bottom,b.bottom)-Math.max(a.y,b.y)>0)lineOverlaps.push([actions[i].action,actions[j].action]);const sr=rect(selection),hr=rect(heading),sameLine=Math.min(sr.bottom,hr.bottom)-Math.max(sr.y,hr.y)>0,separation=sameLine?hr.x-sr.right:hr.y-sr.bottom,headStyle=getComputedStyle(head),trusted=root.querySelector('[data-action="approve"]'),actionRect=rect(trusted),actionStyle=getComputedStyle(trusted),body=document.querySelector('.prodigy-app-shell[data-workspace-id="knowledge"] .prodigy-app-shell-body'),bodyRect=body?rect(body):null;return{zoom:getComputedStyle(document.documentElement).zoom,shellWidth:document.querySelector('.prodigy-app-shell[data-workspace-id="knowledge"]').clientWidth,reviewWidth:review.clientWidth,strip:{rect:stripRect,display:getComputedStyle(strip).display,columns:getComputedStyle(strip).gridTemplateColumns,gap:getComputedStyle(strip).gap},head:{rect:rect(head),display:headStyle.display,gap:headStyle.gap,computedGapCss:parseFloat(headStyle.columnGap),selection:sr,selectionLines:directTextRects(selection.querySelector('span')),heading:hr,headingLines:directTextRects(heading),separation,sameLine},actions,cjkClipping:clipped.length,lineOverlaps,horizontalOverflow:all.filter(node=>node.clientWidth>0&&node.scrollWidth>node.clientWidth+1).length,documentOverflow:document.documentElement.scrollWidth>document.documentElement.clientWidth+1,runtimeErrors:/TASK13A_ERROR|TypeError:|ReferenceError:/u.test(root.innerText||'')?1:0,trustedAction:{focused:document.activeElement===trusted,width:actionRect.width,height:actionRect.height,outlineStyle:actionStyle.outlineStyle,outlineWidth:actionStyle.outlineWidth},outerScrollClearance:bodyRect?document.documentElement.clientWidth-bodyRect.right:null}})()`);
}

function assertRow(row) {
  assert.ok(row.metrics.head.computedGapCss >= 12, `${row.id}: computed operation-header gap ${row.metrics.head.computedGapCss}px`);
  assert.deepEqual(row.metrics.lineOverlaps, [], `${row.id}: action label lines overlap`);
  for (const contract of ACTION_CONTRACTS) {
    const action = row.metrics.actions.find((item) => item.action === contract.action);
    assert.ok(action, `${row.id}: ${contract.action} measurement missing`);
    assert.equal(action.count, 1, `${row.id}: ${contract.action} must exist exactly once`);
    assert.equal(action.text, contract.label, `${row.id}: ${contract.action} semantic label`);
    if (contract.required) assert.equal(action.visible, true, `${row.id}: ${contract.action} rendered and visible`);
    if (!action.visible) continue;
    assert.ok(action.rect.width >= 44 && action.rect.height >= 44, `${row.id}: ${contract.action} actionable target ${action.rect.width}x${action.rect.height}`);
    assert.equal(action.fullyContained, true, `${row.id}: ${contract.action} fully contained`);
    assert.equal(action.clipped, false, `${row.id}: ${contract.action} clipped`);
    assert.deepEqual(action.orphanLines, [], `${row.id}: ${contract.action} orphaned label line`);
    if (!action.disabled) assert.equal(action.focusable, true, `${row.id}: ${contract.action} focusable`);
  }
  assert.equal(row.metrics.cjkClipping, 0, `${row.id}: clipped Korean nodes`);
  assert.equal(row.metrics.trustedAction.focused, true, `${row.id}: trusted action focus`);
  assert.notEqual(row.metrics.trustedAction.outlineStyle, "none", `${row.id}: focus outline style`);
  assert.ok(parseFloat(row.metrics.trustedAction.outlineWidth) >= 2, `${row.id}: focus outline width`);
  assert.equal(row.metrics.horizontalOverflow, 0, `${row.id}: horizontal overflow`);
  assert.equal(row.metrics.documentOverflow, false, `${row.id}: document overflow`);
  assert.equal(row.metrics.runtimeErrors, 0, `${row.id}: runtime error`);
}

async function setMutationState(harness, mutation, restoring, priorStyle) {
  return harness.evaluate(`new Promise((resolve,reject)=>{const mutation=${JSON.stringify(mutation)},restoring=${JSON.stringify(restoring)},priorStyle=${JSON.stringify(priorStyle)},matches=[...document.querySelectorAll(mutation.selector)];if(matches.length!==1)return reject(new Error('ZOOM_MUTATION_TARGET_COUNT:'+mutation.name+':'+matches.length));const target=matches[0],beforeStyle=target.getAttribute('style'),observable=()=>{const style=getComputedStyle(target),rect=target.getBoundingClientRect();if(mutation.kind==='gap')return{matches:restoring?parseFloat(style.columnGap)>=12:parseFloat(style.columnGap)===8,columnGap:style.columnGap,width:rect.width,height:rect.height};const visible=rect.width>0&&rect.height>0&&style.display!=='none'&&style.visibility!=='hidden'&&parseFloat(style.opacity)>0;return{matches:restoring?(visible&&rect.width>=44&&rect.height>=44):(mutation.kind==='hidden'?!visible:rect.width<44||rect.height<44),visible,width:rect.width,height:rect.height}},cleanup=()=>{attributes.disconnect();resize.disconnect();clearTimeout(timer)},finish=()=>{const result=observable();if(!result.matches)return;cleanup();resolve({priorStyle:beforeStyle,observable:result})},attributes=new MutationObserver(finish),resize=new ResizeObserver(finish),timer=setTimeout(()=>{const result=observable();cleanup();reject(new Error('ZOOM_MUTATION_STATE_TIMEOUT:'+mutation.name+':'+JSON.stringify(result)))},5000);attributes.observe(target,{attributes:true,attributeFilter:['style','class','hidden']});resize.observe(target);if(target.parentElement)resize.observe(target.parentElement);if(restoring){if(priorStyle===null)target.removeAttribute('style');else target.setAttribute('style',priorStyle)}else Object.assign(target.style,mutation.styles);finish()})`);
}

test("Given the real Knowledge review, When zoom reaches 200% and recovers, Then Korean actions reflow without clipping or collisions", { timeout: 240000 }, async () => {
  let harness;
  let cleanup = null;
  const rows = [];
  const mutationResults = [];
  try {
    harness = await RealObsidianHarness.start("zoom-action-layout", { fixtureMutation: { task21Stateful: true } });
    await openLongReview(harness);
    for (const width of [390, 820, 1440]) for (const theme of ["light", "dark"]) for (const phase of [{ zoom: 2, name: "zoom-200" }, { zoom: 1, name: "recovered-100" }]) {
      const settlement = await harness.setMetricsAndAwaitResize("knowledge", width, phase.zoom);
      await harness.issueMediaAuthority("knowledge", theme, false, `zoom-action-layout:${width}:${phase.name}`);
      await harness.evaluate(`document.body.classList.toggle('theme-dark',${theme === "dark"});document.body.classList.toggle('theme-light',${theme !== "dark"});true`);
      await settleReview(harness);
      await harness.cdp.send("Input.dispatchKeyEvent", { type: "keyDown", key: "Tab", code: "Tab", windowsVirtualKeyCode: 9 });
      await harness.cdp.send("Input.dispatchKeyEvent", { type: "keyUp", key: "Tab", code: "Tab", windowsVirtualKeyCode: 9 });
      await harness.evaluate(`document.querySelector('#knowledge-panel-llmwiki [data-action="approve"]').focus({preventScroll:true});true`);
      const metrics = await measure(harness);
      const id = `${width}-${theme}-${phase.name}`;
      if (SCREENSHOT_DIR) {
        fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
        const shot = await harness.cdp.send("Page.captureScreenshot", { format: "png", fromSurface: true });
        const bytes = Buffer.from(shot.data, "base64");
        const screenshot = path.join(SCREENSHOT_DIR, `${id}.png`);
        fs.writeFileSync(screenshot, bytes);
        rows.push({ id, width, theme, phase: phase.name, settlement, metrics, screenshot, sha256: crypto.createHash("sha256").update(bytes).digest("hex"), bytes: bytes.length, pngSignature: bytes.subarray(0, 8).toString("hex") });
      } else rows.push({ id, width, theme, phase: phase.name, settlement, metrics });
    }
    for (const row of rows) assertRow(row);

    const mutations = [
      { name: "hidden-reject", width: 390, zoom: 2, kind: "hidden", selector: '#knowledge-panel-llmwiki [data-action="reject"]', styles: { display: "none" }, expected: /reject rendered and visible/u },
      { name: "hidden-request-revision", width: 390, zoom: 2, kind: "hidden", selector: '#knowledge-panel-llmwiki [data-action="request-revision"]', styles: { display: "none" }, expected: /request-revision rendered and visible/u },
      { name: "undersized-reject", width: 390, zoom: 2, kind: "undersized", selector: '#knowledge-panel-llmwiki [data-action="reject"]', styles: { inlineSize: "20px", blockSize: "20px", minInlineSize: "0", minBlockSize: "0", padding: "0", alignSelf: "start", justifySelf: "start" }, expected: /reject actionable target/u },
      { name: "undersized-request-revision", width: 390, zoom: 2, kind: "undersized", selector: '#knowledge-panel-llmwiki [data-action="request-revision"]', styles: { inlineSize: "20px", blockSize: "20px", minInlineSize: "0", minBlockSize: "0", padding: "0", alignSelf: "start", justifySelf: "start" }, expected: /request-revision actionable target/u },
      { name: "old-8px-gap-at-zoom-100", width: 1440, zoom: 1, kind: "gap", selector: "#knowledge-panel-llmwiki .llmwiki-approval-review__operation-head", styles: { gap: "8px" }, expected: /computed operation-header gap 8px/u },
      { name: "old-8px-gap-at-zoom-200", width: 1440, zoom: 2, kind: "gap", selector: "#knowledge-panel-llmwiki .llmwiki-approval-review__operation-head", styles: { gap: "8px" }, expected: /computed operation-header gap 8px/u },
    ];
    for (const mutation of mutations) {
      await harness.setMetricsAndAwaitResize("knowledge", mutation.width, mutation.zoom);
      await settleReview(harness);
      await harness.evaluate(`document.querySelector('#knowledge-panel-llmwiki [data-action="approve"]').focus({preventScroll:true});true`);
      const applied = await setMutationState(harness, mutation, false, null);
      const result = { name: mutation.name, zoom: mutation.zoom, caught: false, restored: false, detector: null, observable: applied.observable };
      try {
        const metrics = await measure(harness);
        const row = { id: `mutation-${mutation.name}`, metrics };
        try {
          assertRow(row);
        } catch (error) {
          assert.match(error.message, mutation.expected);
          result.caught = true;
          result.detector = error.message;
        }
        assert.equal(result.caught, true, `${mutation.name} escaped hardened detector`);
      } finally {
        const restored = await setMutationState(harness, mutation, true, applied.priorStyle);
        await harness.evaluate(`document.querySelector('#knowledge-panel-llmwiki [data-action="approve"]').focus({preventScroll:true});true`);
        assertRow({ id: `restored-${mutation.name}`, metrics: await measure(harness) });
        result.restored = restored.observable.matches;
        mutationResults.push(result);
      }
    }
  } finally {
    if (harness) {
      const expectedJson = {};
      for (const relative of ["SYSTEM/PRIVATE/llmwiki-incremental-analysis-state.json", "SYSTEM/PRIVATE/llmwiki-analysis-cache.json", "SYSTEM/PRIVATE/llmwiki-chunk-coverage.json", "SYSTEM/PRIVATE/llmwiki-inbox-proposals.json"]) {
        const absolute = path.join(harness.runtime.vault, relative);
        if (fs.existsSync(absolute)) expectedJson[relative] = JSON.parse(fs.readFileSync(absolute, "utf8"));
      }
      cleanup = await harness.close({ expectedJson });
    }
    if (RECEIPT_PATH) {
      fs.mkdirSync(path.dirname(RECEIPT_PATH), { recursive: true });
      fs.writeFileSync(RECEIPT_PATH, `${JSON.stringify({ schema: "ZoomActionLayout/v1", pass: rows.length === 12 && rows.every((row) => { try { assertRow(row); return true; } catch { return false; } }), rows, cleanup }, null, 2)}\n`);
    }
    if (MUTATION_RECEIPT_PATH) {
      fs.mkdirSync(path.dirname(MUTATION_RECEIPT_PATH), { recursive: true });
      fs.writeFileSync(MUTATION_RECEIPT_PATH, `${JSON.stringify({ schema: "ZoomActionLayoutMutationSensitivity/v1", pass: mutationResults.length === 6 && mutationResults.every((result) => result.caught && result.restored), productionMatrixRows: rows.length, results: mutationResults }, null, 2)}\n`);
    }
  }
  assert.equal(mutationResults.length, 6);
  assert.equal(mutationResults.every((result) => result.caught && result.restored), true);
  assert.equal(cleanup.audit.equal, true);
  assert.equal(cleanup.protectedContinuity.exact, true);
  assert.equal(cleanup.removed, true);
});
