#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const { RealObsidianHarness } = require("../shared/real_obsidian_harness.js");

const ROOT = path.resolve(__dirname, "../../../../../..");
const OUT = path.join(ROOT, ".omo/evidence/llmwiki-knowledge-lifecycle-routing/task-15-product");
const SHOTS = path.join(OUT, "captures/actual-obsidian");
const MANIFEST = path.join(OUT, "capture-manifest.json");
const RETIRED = "captures/chrome/committed-375x812-2x.png";
const SOURCE_FILES = [
  "HUB/00 Home.md", "HUB/50 Knowledge.md", "SYSTEM/Views/prodigy-workspace-manifest.js",
  "SYSTEM/Views/quick-capture-view.js", "SYSTEM/Views/home-view.js", "SYSTEM/Views/knowledge-explorer-controller.js",
  "SYSTEM/Views/knowledge-explorer-detail-modal.js", "SYSTEM/Views/knowledge-fleeting-review-state.js",
  "SYSTEM/Views/llmwiki-lifecycle-view.js", "SYSTEM/Views/knowledge-styles.js",
];
const SOURCE_MTIME = Math.max(...SOURCE_FILES.map((relative) => fs.statSync(path.join(ROOT, relative)).mtimeMs));
const VIEWPORTS = Object.freeze([
  Object.freeze({ width: 390, height: 900, zoom: 1 }),
  Object.freeze({ width: 820, height: 1000, zoom: 1 }),
  Object.freeze({ width: 1440, height: 1100, zoom: 1 }),
]);

function pngIdentity(bytes) {
  assert.equal(bytes.subarray(0, 8).toString("hex"), "89504e470d0a1a0a");
  return { signature: "89504e470d0a1a0a", width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

async function setViewport(harness, viewport) {
  await harness.evaluate(`(()=>{let resolvePending,rejectPending;const promise=new Promise((resolve,reject)=>{resolvePending=resolve;rejectPending=reject});const finish=()=>{if(innerWidth!==${viewport.width}||innerHeight!==${viewport.height})return;removeEventListener('resize',finish);clearTimeout(guard);requestAnimationFrame(()=>requestAnimationFrame(()=>resolvePending({width:innerWidth,height:innerHeight,zoom:getComputedStyle(document.documentElement).zoom})))},guard=setTimeout(()=>{removeEventListener('resize',finish);rejectPending(new Error('TASK15_EVIDENCE_VIEWPORT_TIMEOUT'))},10000);addEventListener('resize',finish);window.__task15EvidenceViewport={promise,finish};return true})()`);
  await harness.cdp.send("Emulation.setDeviceMetricsOverride", { width: viewport.width, height: viewport.height, deviceScaleFactor: 1, scale: 1, mobile: false });
  await harness.evaluate(`document.documentElement.style.zoom=${JSON.stringify(String(viewport.zoom))};window.__task15EvidenceViewport.finish();true`);
  const observed = await harness.evaluate("window.__task15EvidenceViewport.promise");
  assert.deepEqual(observed, { width: viewport.width, height: viewport.height, zoom: String(viewport.zoom) });
}

async function capture(harness, input, exceptions) {
  const viewport = input.viewport;
  await setViewport(harness, viewport);
  await harness.evaluate(`(()=>{const root=document.querySelector(${JSON.stringify(input.root)}),focus=document.querySelector(${JSON.stringify(input.focus)}),visible=node=>{const box=node.getBoundingClientRect(),style=getComputedStyle(node);return!node.disabled&&node.tabIndex>=0&&box.width>0&&box.height>0&&style.display!=='none'&&style.visibility!=='hidden'};if(!root||!focus)throw new Error('TASK15_EVIDENCE_SURFACE_MISSING:${input.state_id}');root.scrollIntoView({block:'center',inline:'nearest',behavior:'instant'});const controls=[...document.querySelectorAll('button,a[href],input,select,textarea,summary,[tabindex]')].filter(visible),index=controls.indexOf(focus);if(index<1)throw new Error('TASK15_EVIDENCE_KEYBOARD_PREDECESSOR_MISSING:${input.state_id}');controls[index-1].focus({preventScroll:true});return true})()`);
  await harness.cdp.send("Input.dispatchKeyEvent", { type: "keyDown", key: "Tab", code: "Tab", windowsVirtualKeyCode: 9 });
  await harness.cdp.send("Input.dispatchKeyEvent", { type: "keyUp", key: "Tab", code: "Tab", windowsVirtualKeyCode: 9 });
  await harness.evaluate(`new Promise((resolve,reject)=>requestAnimationFrame(()=>requestAnimationFrame(()=>{const focus=document.querySelector(${JSON.stringify(input.focus)});if(document.activeElement!==focus)return reject(new Error('TASK15_EVIDENCE_FOCUS_FAILED:${input.state_id}'));resolve(true)})))`);
  const metrics = await harness.evaluate(`(()=>{
    const root=document.querySelector(${JSON.stringify(input.root)}),focus=document.querySelector(${JSON.stringify(input.focus)}),zoom=Number(getComputedStyle(document.documentElement).zoom)||1;
    const visible=node=>{const box=node.getBoundingClientRect(),style=getComputedStyle(node);return node.isConnected&&box.width>0&&box.height>0&&style.display!=='none'&&style.visibility!=='hidden'};
    const all=[root,...root.querySelectorAll('*')].filter(visible),controls=all.filter(node=>node.matches('button,a[href],input,select,textarea,[role="button"],[role="tab"]')&&!node.disabled&&node.getAttribute('aria-disabled')!=='true');
    const target=node=>node.matches('input[type="checkbox"]')?(node.closest('label')||node):node;
    const boxes=controls.map(node=>{const box=target(node).getBoundingClientRect();return{action:node.getAttribute('data-action')||node.getAttribute('data-quick-capture-action')||'',label:(node.innerText||node.getAttribute('aria-label')||'').trim(),width:box.width/zoom,height:box.height/zoom,right:box.right,left:box.left}});
    const rootBox=root.getBoundingClientRect(),shell=document.querySelector('.prodigy-app-shell'),preview=shell&&shell.closest('.markdown-preview-view'),modal=root.closest('.modal-container');
    const owners=[preview,shell,...document.querySelectorAll('.knowledge-review-detail-modal__scroll')].filter(Boolean).filter(node=>visible(node)&&/(auto|scroll)/u.test(getComputedStyle(node).overflowY)&&node.scrollHeight>node.clientHeight+1);
    const headings=[...root.querySelectorAll('h1,h2')].filter(visible).map(node=>node.textContent.trim()).filter(Boolean),counts=new Map();headings.forEach(value=>counts.set(value,(counts.get(value)||0)+1));
    const labels=${JSON.stringify(input.labels)};
    const focusStyle=getComputedStyle(focus);
    return{
      labels,full_labels_visible:labels.every(label=>(root.innerText||root.textContent||'').includes(label)),
      focused:document.activeElement===focus,focus_visible:focus.matches(':focus-visible'),focus_outline:{style:focusStyle.outlineStyle,width:focusStyle.outlineWidth},
      horizontal_overflow:all.filter(node=>node.clientWidth>0&&node.scrollWidth>node.clientWidth+1).length,
      overflow_nodes:all.filter(node=>node.clientWidth>0&&node.scrollWidth>node.clientWidth+1).slice(0,8).map(node=>({tag:node.tagName,cls:String(node.className),scroll:node.scrollWidth,client:node.clientWidth,text:(node.textContent||'').trim().slice(0,80)})),
      document_horizontal_overflow:document.documentElement.scrollWidth>document.documentElement.clientWidth+1,
      cjk_clipping:all.filter(node=>/[\uac00-\ud7af]/u.test(node.textContent||'')&&node.clientWidth>0&&node.scrollWidth>node.clientWidth+1).length,
      undersized_controls:boxes.filter(row=>row.width<44||row.height<44),controls:boxes,
      geometry:{left:rootBox.left,right:rootBox.right,width:rootBox.width,right_margin:innerWidth-rootBox.right,viewport_width:innerWidth},
      right_margin_ok:rootBox.left>=-1&&rootBox.right<=innerWidth+1,
      scroll_owner_count:owners.length,scroll_owners:owners.map(node=>String(node.className)),
      modal_contained:!modal||(rootBox.left>=0&&rootBox.right<=innerWidth&&rootBox.top>=0&&rootBox.bottom<=innerHeight),
      action_contained:boxes.every(row=>row.left>=-1&&row.right<=innerWidth+1),
      duplicate_title_count:[...counts.values()].filter(count=>count>1).length,
      runtime_dom_errors:(document.body.innerText.match(/TypeError:|ReferenceError:|TASK13A_ERROR/gu)||[]).length,
      root_text:(root.innerText||root.textContent||'').slice(0,4000),
    };
  })()`);
  assert.equal(metrics.full_labels_visible, true, `${input.state_id}: full labels ${JSON.stringify(metrics.labels.filter((label) => !metrics.root_text.includes(label)))}`);
  assert.equal(metrics.focused, true, `${input.state_id}: focus`);
  assert.equal(metrics.focus_visible, true, `${input.state_id}: focus-visible`);
  assert.equal(metrics.horizontal_overflow, 0, `${input.state_id}: horizontal overflow ${JSON.stringify(metrics.overflow_nodes)}`);
  assert.equal(metrics.document_horizontal_overflow, false, `${input.state_id}: document overflow`);
  assert.equal(metrics.cjk_clipping, 0, `${input.state_id}: CJK clipping`);
  assert.deepEqual(metrics.undersized_controls, [], `${input.state_id}: 44px controls`);
  assert.equal(metrics.right_margin_ok, true, `${input.state_id}: right margin`);
  assert.equal(metrics.action_contained, true, `${input.state_id}: action containment`);
  assert.equal(metrics.modal_contained, true, `${input.state_id}: modal containment`);
  assert.ok(metrics.scroll_owner_count <= (input.modal ? 2 : 1), `${input.state_id}: scroll owner count ${metrics.scroll_owner_count}`);
  assert.equal(metrics.duplicate_title_count, 0, `${input.state_id}: duplicate titles`);
  assert.equal(metrics.runtime_dom_errors, 0, `${input.state_id}: runtime DOM errors`);
  assert.deepEqual(exceptions, [], `${input.state_id}: runtime exceptions`);
  const shot = await harness.cdp.send("Page.captureScreenshot", { format: "png", fromSurface: true });
  const bytes = Buffer.from(shot.data, "base64"), identity = pngIdentity(bytes);
  assert.equal(identity.width, viewport.width); assert.equal(identity.height, viewport.height);
  const filename = `${input.state_id}-${viewport.width}x${viewport.height}${viewport.zoom === 2 ? "-zoom2" : ""}.png`;
  const target = path.join(SHOTS, filename); fs.writeFileSync(target, bytes);
  const imageMtime = fs.statSync(target).mtimeMs;
  assert.ok(imageMtime >= SOURCE_MTIME, `${input.state_id}: screenshot predates source`);
  return {
    state_id: input.state_id, viewport_width: viewport.width, viewport_height: viewport.height, zoom: viewport.zoom,
    path: `captures/actual-obsidian/${filename}`, source_mtime_ms: SOURCE_MTIME, image_mtime_ms: imageMtime,
    sha256: crypto.createHash("sha256").update(bytes).digest("hex"), bytes: bytes.length, ...identity, metrics,
    actual_obsidian: true, current_build: true, focus_restore: input.focus_restore !== false,
  };
}

function reviewItems() {
  return [
    { review_id: "literature_evidence", destination: "literature", review_state: "pending", analysis_state: "complete", title: "문헌 근거 검토" },
    {
      review_id: "candidate_hard_gaps", destination: "knowledge_candidate", review_state: "pending", analysis_state: "complete", title: "승격 조건이 남은 후보",
      promotion_gaps: [
        { gate_id: "claim_support", reason_code: "unsupported_claim" },
        { gate_id: "relation", reason_code: "missing_relation" },
        { gate_id: "approval", reason_code: "approval_required" },
      ],
      sources: [{ locator: "ZETA/LITERATURE/TASK13A Synthetic Literature.md#근거" }], acceptance_state: "pending",
    },
    {
      review_id: "canonical_provenance", destination: "canonical_knowledge", review_state: "pending", analysis_state: "complete", title: "출처가 연결된 정본 검토",
      sources: [{ locator: "ZETA/LITERATURE/TASK13A Synthetic Literature.md#근거" }], acceptance_state: "pending",
      coverage: { status: "완료", receipt_id: "coverage_task15_actual" }, accepted_ai_labels: ["citation-bound"], review_history: [{ state: "pending", at: "2026-08-25T00:00:00.000Z" }],
      claim_set: { citations: [{ citation_id: "citation_task15_actual" }], claims: [{ claim_id: "claim_task15_actual", origin: "source_extract", citation_ids: ["citation_task15_actual"] }], disputes: [] },
    },
    {
      review_id: "para_local_handoff", destination: "para_object", review_state: "pending", analysis_state: "complete", title: "로컬 프로젝트 진행 메모",
      object_handoff: { handoff_id: "handoff_task15_actual", target_path: "PARA/PROJECTS/Synthetic.md", target_revision: "revision_task15_actual", before_bytes: "# Synthetic\n", before_diff: [{ kind: "add", line: "진행 메모: 근거 검토 완료" }] },
    },
    { review_id: "hold_evidence", destination: "none", review_state: "hold", analysis_state: "complete", title: "보호된 자료" },
  ];
}

async function configureWorkbench(harness) {
  await harness.evaluate(`(async()=>{const hub=window.KnowledgeExplorerHub,state=await hub.refreshFleetingReview(),configured=${JSON.stringify(reviewItems())},fleeting=(state.reviews||[]).map(review=>({review_id:review.review_id,destination:review.destination,review_state:'pending',analysis_state:'complete',title:review.title})),panel=document.querySelector('#knowledge-panel-llmwiki'),mount=panel&&(panel.querySelector('.knowledge-review-workbench-mount')||panel.createDiv({cls:'knowledge-review-workbench-mount'})),Modal=class{constructor(){this.containerEl=null;this.modalEl=null;this.contentEl=null}open(){const container=document.body.createDiv({cls:'modal-container'}),modal=container.createDiv({cls:'modal'}),content=modal.createDiv({cls:'modal-content'});this.containerEl=container;this.modalEl=modal;this.contentEl=content;if(typeof this.onOpen==='function')this.onOpen()}close(){if(typeof this.onClose==='function')this.onClose();if(this.containerEl)this.containerEl.remove()}};if(!mount)throw new Error('TASK15_EVIDENCE_WORKBENCH_RUNTIME_MISSING');if(hub.__task15EvidenceWorkbench)hub.__task15EvidenceWorkbench.destroy();hub.__task15EvidenceWorkbench=window.KnowledgeExplorerController.mountKnowledgeReviewWorkbench({app,Modal,container:mount,items:[...configured,...fleeting],actions:{onSaveThought:()=>({ok:false}),onCompleteFromCache:()=>({ok:true,provider_count:0}),onApproveCanonical:()=>({ok:false}),onApproveObject:()=>({ok:false}),onRetryReview:()=>({ok:false})}});hub.llmWikiLifecycle.update(hub.llmWikiLifecycleSnapshot());const canonical=mount.querySelector('[data-review-id="canonical_provenance"]');if(!canonical)throw new Error('TASK15_EVIDENCE_CONFIGURED_ROWS_MISSING:'+JSON.stringify({html:mount.innerHTML.slice(0,1000),groups:[...mount.querySelectorAll('[data-review-group]')].map(node=>({id:node.dataset.reviewGroup,total:node.dataset.total,visible:node.dataset.visible}))}));return{fleeting:state,groups:[...mount.querySelectorAll('[data-review-group]')].map(node=>({id:node.dataset.reviewGroup,total:node.dataset.total,visible:node.dataset.visible}))}})()`);
}

async function cleanupRuntimeFiles(harness, paths) {
  await harness.evaluate(`(async()=>{for(const path of ${JSON.stringify(paths)}){const file=app.vault.getAbstractFileByPath(path);if(file)await app.vault.delete(file,true)}window.__task13aQuickCaptureWrites=false;return true})()`);
}

test("current actual Obsidian captures the complete Todo15 evidence journey", { timeout: 240000 }, async (t) => {
  if (process.env.TASK15_ACTUAL_EVIDENCE !== "1") return t.skip("actual Todo15 evidence capture runs explicitly");
  fs.rmSync(SHOTS, { recursive: true, force: true }); fs.mkdirSync(SHOTS, { recursive: true });
  const captures = [], exceptions = []; let harness; let cleanup = null;
  const fleetingPath = "ZETA/FLEETING/2026-08-25.md", statePath = "SYSTEM/PRIVATE/llmwiki-fleeting-review-state.json";
  const analysisPaths = [statePath, "SYSTEM/PRIVATE/llmwiki-incremental-analysis-state.json", "SYSTEM/PRIVATE/llmwiki-analysis-cache.json", "SYSTEM/PRIVATE/llmwiki-chunk-coverage.json", "SYSTEM/PRIVATE/llmwiki-inbox-proposals.json"];
  try {
    harness = await RealObsidianHarness.start("task15-actual-evidence", { fixtureMutation: { task21Stateful: true } });
    harness.cdp.on("Runtime.exceptionThrown", (event) => exceptions.push(event.exceptionDetails?.text || "runtime exception"));
    await harness.mountStructuralWorkspace("home"); await harness.collapseSidebar("home", "left"); await harness.collapseSidebar("home", "right");
    await harness.waitForSelector('.prodigy-app-shell[data-workspace-id="home"] .quick-capture-row');
    for (const viewport of VIEWPORTS) captures.push(await capture(harness, { state_id: "home_quick_capture", viewport, root: '.prodigy-app-shell[data-workspace-id="home"] .quick-capture-row', focus: '.prodigy-app-shell[data-workspace-id="home"] [data-quick-capture-action="thought"]', labels: ["자료 넣기", "생각 저장"] }, exceptions));

    const fleetingBytes = "<!-- fleeting-block-id: fleeting_restored -->\n## 생각 저장\n\n복원된 검토 생각\n\n<!-- fleeting-block-id: fleeting_pending -->\n## 생각 저장\n\n아직 정리할 생각\n";
    const completedText = "## 생각 저장\n\n복원된 검토 생각";
    await harness.evaluate(`(async()=>{window.__task13aQuickCaptureWrites=true;const bytes=${JSON.stringify(fleetingBytes)},fleetingPath=${JSON.stringify(fleetingPath)},statePath=${JSON.stringify(statePath)};const folder=app.vault.getAbstractFileByPath('ZETA/FLEETING');if(!folder)await app.vault.createFolder('ZETA/FLEETING');await app.vault.create(fleetingPath,bytes);const state={version:'knowledge_fleeting_review_state_v1',completed:{fleeting_restored:window.LLMWikiHash.sha256(${JSON.stringify(completedText)})},reviews:[{review_id:'fleeting_review_restored',destination:'fleeting',title:'복원된 생각 검토'}]},serialized=JSON.stringify(state,null,2)+'\\n',prior=app.vault.getAbstractFileByPath(statePath);if(prior)await app.vault.modify(prior,serialized);else await app.vault.create(statePath,serialized);return true})()`);

    await harness.mountStructuralWorkspace("knowledge"); await harness.collapseSidebar("knowledge", "left"); await harness.collapseSidebar("knowledge", "right");
    await harness.renderedClick("#knowledge-tab-llmwiki");
    const initial = await harness.evaluate("window.KnowledgeExplorerHub.whenKnowledgeInboxSettled().then(()=>window.KnowledgeExplorerHub.llmWikiLifecycleSnapshot())");
    assert.equal(initial.status, "review"); await harness.waitForSelector('#knowledge-panel-llmwiki [data-action="approve"]');
    await harness.evaluate(`(()=>{window.__task15Committed=new Promise((resolve,reject)=>{const finish=event=>{const state=event.detail&&event.detail.state;if(!state||state.status!=='committed')return;cleanup();resolve(state)},cleanup=()=>{removeEventListener('task21-lifecycle-action',finish);clearTimeout(timer)},timer=setTimeout(()=>{cleanup();reject(new Error('TASK15_COMMITTED_TIMEOUT'))},15000);addEventListener('task21-lifecycle-action',finish)});return true})()`);
    await harness.trustedActivate('#knowledge-panel-llmwiki [data-action="approve"]', null, " "); await harness.evaluate("window.__task15Committed");
    captures.push(await capture(harness, { state_id: "committed_primary_actual", viewport: { width: 375, height: 812, zoom: 2 }, root: "#knowledge-panel-llmwiki .llmwiki-lifecycle", focus: '#knowledge-panel-llmwiki [data-action="select-source"]', labels: ["LLM Wiki", "지식 반영 완료"] }, exceptions));

    await configureWorkbench(harness);
    const restored = await harness.evaluate(`(()=>{const hub=window.KnowledgeExplorerHub,s=hub.llmWikiLifecycleSnapshot().fleeting;return{pending:s.pending_count,reviews:s.reviews.map(row=>row.review_id),button:!!document.querySelector('[data-action="review-fleeting"]')}})()`);
    assert.deepEqual(restored, { pending: 1, reviews: ["fleeting_review_restored"], button: true });
    for (const viewport of VIEWPORTS) {
      const row = await capture(harness, { state_id: "fleeting_restored_after_reload", viewport, root: "#knowledge-panel-llmwiki", focus: '#knowledge-panel-llmwiki [data-action="review-fleeting"]', labels: ["미정리 생각 1개", "생각 정리"] }, exceptions);
      row.restored_state = restored;
      captures.push(row);
    }

    for (const viewport of VIEWPORTS) {
      const invoker = '#knowledge-panel-llmwiki [data-review-id="canonical_provenance"] [data-action="open-review-detail"]';
      await setViewport(harness, viewport); await harness.evaluate(`document.querySelector(${JSON.stringify(invoker)}).scrollIntoView({block:'center',behavior:'instant'});true`); await harness.trustedClick(invoker);
      await harness.waitForSelector('.modal-container [data-surface="knowledge-review-detail-modal"]');
      const row = await capture(harness, { state_id: "grouped_workbench_provenance_modal", viewport, root: '.modal-container [data-surface="knowledge-review-detail-modal"]', focus: '.modal-container [data-action="close-review-detail"]', labels: ["출처 앵커", "근거", "기원", "분석 범위", "닫기"], modal: true }, exceptions);
      await harness.trustedClick('.modal-container [data-action="close-review-detail"]');
      row.focus_restore = await harness.evaluate(`document.activeElement===document.querySelector(${JSON.stringify(invoker)})`); assert.equal(row.focus_restore, true);
      captures.push(row);
    }

    await harness.evaluate(`document.querySelector('[data-candidate-gaps="candidate_hard_gaps"]').open=true;true`);
    for (const viewport of VIEWPORTS) captures.push(await capture(harness, { state_id: "candidate_hard_promotion_gaps", viewport, root: '#knowledge-panel-llmwiki [data-review-id="candidate_hard_gaps"]', focus: '#knowledge-panel-llmwiki [data-candidate-gaps="candidate_hard_gaps"] summary', labels: ["승격 조건이 남은 후보", "unsupported_claim", "missing_relation", "approval_required"] }, exceptions));
    for (const viewport of VIEWPORTS) captures.push(await capture(harness, { state_id: "para_local_handoff_diff", viewport, root: '#knowledge-panel-llmwiki [data-review-id="para_local_handoff"]', focus: '#knowledge-panel-llmwiki [data-review-id="para_local_handoff"] [data-action="approve-object"]', labels: ["PARA/PROJECTS/Synthetic.md", "add:진행 메모: 근거 검토 완료", "대상 반영"] }, exceptions));

    assert.equal(captures.length, 16); assert.equal(new Set(captures.map((row) => `${row.state_id}:${row.viewport_width}:${row.zoom}`)).size, 16);
    const manifest = { schema: "Task15ActualObsidianEvidence/v1", ok: true, current_build: true, actual_obsidian: true, source_files: SOURCE_FILES, source_mtime_ms: SOURCE_MTIME, required_states: ["home_quick_capture", "fleeting_restored_after_reload", "grouped_workbench_provenance_modal", "candidate_hard_promotion_gaps", "para_local_handoff_diff", "committed_primary_actual"], standard_viewports: [390, 820, 1440], true_zoom: { width: 375, height: 812, zoom: 2, state_id: "committed_primary_actual" }, retired_artifacts: [{ path: RETIRED, reason: "mock_only_geometry_replaced_by_current_actual_obsidian", replacement: captures.find((row) => row.state_id === "committed_primary_actual").path }], captures, validator: { rows: captures.length, unique: true, all_green: captures.every((row) => row.metrics.full_labels_visible && row.metrics.focus_visible && row.metrics.horizontal_overflow === 0 && row.metrics.cjk_clipping === 0 && row.metrics.undersized_controls.length === 0 && row.metrics.right_margin_ok && row.metrics.action_contained && row.metrics.modal_contained && row.metrics.runtime_dom_errors === 0 && row.focus_restore), runtime_exceptions: exceptions } };
    assert.equal(manifest.validator.all_green, true); fs.writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2) + "\n");
    const retiredTarget = path.join(OUT, RETIRED); if (fs.existsSync(retiredTarget)) fs.rmSync(retiredTarget);
  } finally {
    if (harness) {
      await cleanupRuntimeFiles(harness, [fleetingPath, ...analysisPaths]).catch(() => false);
      cleanup = await harness.close();
      assert.equal(cleanup.audit.equal, true); assert.equal(cleanup.protectedContinuity.exact, true); assert.equal(cleanup.removed, true); assert.equal(cleanup.portReusable, true);
    }
  }
  const manifest = JSON.parse(fs.readFileSync(MANIFEST, "utf8")); manifest.cleanup = cleanup; fs.writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2) + "\n");
});
