#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const { test } = require("node:test");
const { RealObsidianHarness } = require("../shared/real_obsidian_harness.js");

function waitForController(harness, status, label) {
  return harness.evaluate(`new Promise((resolve,reject)=>{
    const controller=KnowledgeExplorerHub._prodigyWikiController;
    let unsubscribe=()=>{};
    const guard=setTimeout(()=>{unsubscribe();reject(new Error(${JSON.stringify(label)}))},15000);
    unsubscribe=controller.subscribe(snapshot=>{
      if(snapshot.status!==${JSON.stringify(status)})return;
      clearTimeout(guard);
      unsubscribe();
      resolve(snapshot);
    });
  })`);
}
function waitForText(harness, selector, expected, label) {
  return harness.evaluate(`new Promise((resolve,reject)=>{
    const finish=()=>{
      const node=document.querySelector(${JSON.stringify(selector)});
      if(!node||!String(node.textContent||"").includes(${JSON.stringify(expected)}))return;
      observer.disconnect();
      clearTimeout(guard);
      resolve(String(node.textContent||""));
    };
    const observer=new MutationObserver(finish);
    observer.observe(document.body,{childList:true,subtree:true,characterData:true,attributes:true});
    const guard=setTimeout(()=>{observer.disconnect();reject(new Error(${JSON.stringify(label)}))},15000);
    finish();
  })`);
}

test("real Obsidian detects one source edit locally and replaces only its reviewed artifact after review", {
  timeout: 120000,
}, async () => {
  let harness;
  let qaCreated = false;
  try {
    harness = await RealObsidianHarness.start("prodigy-wiki-incremental", {
      fixtureMutation: { prodigyWikiIncremental: true },
    });
    await harness.openWorkspace("knowledge");
    await harness.renderedClick("#knowledge-tab-llmwiki-browse");
    await harness.waitForSelector('[data-surface="prodigy-wiki-reviewed-index"]');
    const created = await harness.evaluate(`(async()=>{
      window.__task13aProdigyWikiReviewedWrites=true;
      const baselinePaths=app.vault.getAllLoadedFiles().map(file=>file.path);
      const sourcePath="INBOX/Prodigy Wiki Incremental QA.md";
      const sourceFile=app.vault.getAbstractFileByPath(sourcePath);
      const originalText=await app.vault.cachedRead(sourceFile);
      const originalRevision=LLMWikiHash.sha256(originalText);
      const quote="Original changed-range evidence.";
      const start=originalText.indexOf(quote);
      const citation={
        citation_id:"citation_incremental_initial",
        source_id:"source_incremental_full",
        source_path:sourcePath,
        content_hash:originalRevision,
        locators:[sourcePath+"#"+start+"-"+(start+quote.length)],
        evidence_quote:quote,
        confidence:"explicit"
      };
      const claim={claim_id:"claim_incremental_initial",text:quote,citation_ids:[citation.citation_id]};
      const document={
        document_kind:"topic_article",
        title:"Incremental Changed Range Wiki",
        purpose:"변경 범위만 다시 정리한다.",
        tags:["incremental"],
        sections:[{heading:"Changed Range",paragraphs:[{text:quote,claim_ids:[claim.claim_id]}]}],
        claims:[claim],
        citations:[citation]
      };
      const documentBytes="---\\ntype: wiki-preview\\nstatus: review\\n---\\n\\n# Incremental Changed Range Wiki\\n\\n"+quote+"\\n";
      const artifact=ProdigyWikiArtifactContract.createPreviewArtifact({
        operation_id:LLMWikiHash.sha256("incremental-initial-operation"),
        orchestrator_version:"llmwiki_golden_wiki_orchestrator_v2",
        gate_receipt_hash:LLMWikiHash.sha256("incremental-initial-gate"),
        source:{source_id:"source_incremental_full",source_path:sourcePath,source_revision:originalRevision,source_text:originalText},
        scope:null,
        document,
        document_bytes:documentBytes
      });
      const receipt={
        ok:true,status:"publishable_preview",issues:[],
        metrics:{structure_score:1,critical_token_recall:1,style_score:1},
        receipt:{source_path:sourcePath,document_hash:LLMWikiHash.sha256(documentBytes),receipt_hash:artifact.receipt.gate_receipt_hash},
        ...artifact.receipt,
        artifact_receipt_hash:artifact.receipt.receipt_hash
      };
      const ensure=async path=>{
        const parts=path.split("/").slice(0,-1);
        for(let index=1;index<=parts.length;index+=1){
          const folder=parts.slice(0,index).join("/");
          if(folder&&!app.vault.getAbstractFileByPath(folder)){
            try{await app.vault.createFolder(folder)}
            catch(error){if(!/Folder already exists/u.test(String(error?.message||error)))throw error}
          }
        }
      };
      await ensure(artifact.document_path);
      await app.vault.create(artifact.document_path,documentBytes);
      await app.vault.create(artifact.receipt_path,JSON.stringify(receipt,null,2)+"\\n");
      window.__prodigyWikiIncrementalQa={
        sourcePath,sourceFile,originalText,originalRevision,initial:{artifact,receipt},
        previewRoot:artifact.document_path.split("/").slice(0,-2).join("/"),
        baselinePaths
      };
      await KnowledgeExplorerHub.refreshGoldenPreviewWorkbench();
      return {artifact_id:artifact.artifact_id,source_path:sourcePath,source_revision:originalRevision};
    })()`);
    qaCreated = true;

    const counts = '[data-surface="prodigy-wiki-reviewed-index"] [data-reviewed-wiki-counts]';
    const reviewedReady = waitForText(harness, counts, "현재 1", "INCREMENTAL_INITIAL_REVIEW_TIMEOUT");
    await harness.renderedClick(`[data-preview-id="${created.artifact_id}"] [data-action="mark-golden-reviewed"]`);
    await reviewedReady;

    await harness.evaluate(`(async()=>{
      const qa=window.__prodigyWikiIncrementalQa;
      const changed=qa.originalText.replace("Original changed-range evidence.","Updated changed-range evidence.");
      qa.batchStateReady=new Promise((resolve,reject)=>{
        const path="SYSTEM/CACHE/llmwiki/batch-job-state.json";
        if(app.vault.getAbstractFileByPath(path)){resolve(true);return}
        let ref;
        const guard=setTimeout(()=>{app.vault.offref(ref);reject(new Error("INCREMENTAL_BATCH_STATE_TIMEOUT"))},30000);
        ref=app.vault.on("create",file=>{
          if(file.path!==path)return;
          clearTimeout(guard);
          app.vault.offref(ref);
          resolve(true);
        });
      });
      window.__task13aProdigyWikiSourceWrites=true;
      await app.vault.modify(qa.sourceFile,changed);
      window.__task13aProdigyWikiSourceWrites=false;
      qa.changedText=changed;
      qa.changedRevision=LLMWikiHash.sha256(changed);
      qa.networkBefore=(window.__task13aNodeNetworkAttempts||[]).length;
      await KnowledgeExplorerHub.refreshReviewedWikiIndex();
      return true;
    })()`);
    await waitForText(harness, counts, "갱신 필요 1", "INCREMENTAL_STALE_INDEX_TIMEOUT");
    await harness.renderedClick('[data-action="filter-reviewed-wiki-mode"][data-mode="stale"]');
    const changesReady = waitForController(harness, "change_range_required", "INCREMENTAL_CHANGE_RANGE_TIMEOUT");
    await harness.renderedClick('[data-action="inspect-reviewed-changes"]');
    await changesReady;
    const inspected = await harness.evaluate(`(()=>{
      const snapshot=KnowledgeExplorerHub.prodigyWikiSnapshot();
      const result=snapshot.result;
      const scope=result.scopes[0];
      const qa=window.__prodigyWikiIncrementalQa;
      return {
        status:snapshot.status,
        summary:result.summary,
        scopes:result.scopes.length,
        selectedText:qa.changedText.slice(scope.start,scope.end),
        refreshIds:result.refresh_context.refresh_artifact_ids,
        providerCount:result.provider_count,
        networkDelta:(window.__task13aNodeNetworkAttempts||[]).length-qa.networkBefore
      };
    })()`);
    assert.equal(inspected.status, "change_range_required");
    assert.deepEqual(inspected.summary, { added: 0, modified: 1, removed: 0, moved: 1, total: 2 });
    assert.equal(inspected.scopes, 1);
    assert.match(inspected.selectedText, /Updated changed-range evidence/u);
    assert.doesNotMatch(inspected.selectedText, /BEFORE_SENTINEL|AFTER_SENTINEL/u);
    assert.deepEqual(inspected.refreshIds, [created.artifact_id]);
    assert.equal(inspected.providerCount, 0);
    assert.equal(inspected.networkDelta, 0);

    const selectedReady = waitForController(harness, "source_selected", "INCREMENTAL_RANGE_SELECT_TIMEOUT");
    await harness.renderedClick('[data-action="select-golden-scope"]');
    await selectedReady;
    const selected = await harness.evaluate(`(()=>{
      const snapshot=KnowledgeExplorerHub.prodigyWikiSnapshot();
      return {
        status:snapshot.status,
        range:snapshot.range,
        refreshContext:snapshot.result.refresh_context,
        providerCount:snapshot.result.provider_calls||0
      };
    })()`);
    assert.equal(selected.status, "source_selected");
    assert.equal(selected.range.range_key, selected.range.scope_id);
    assert.deepEqual(selected.refreshContext.refresh_artifact_ids, [created.artifact_id]);
    assert.equal(selected.providerCount, 0);

    const replacement = await harness.evaluate(`(async()=>{
      const qa=window.__prodigyWikiIncrementalQa;
      const snapshot=KnowledgeExplorerHub.prodigyWikiSnapshot();
      const quote="Updated changed-range evidence.";
      const start=qa.changedText.indexOf(quote);
      const citation={
        citation_id:"citation_incremental_replacement",
        source_id:"source_incremental_changed_scope",
        source_path:qa.sourcePath,
        content_hash:qa.changedRevision,
        locators:[qa.sourcePath+"#"+start+"-"+(start+quote.length)],
        evidence_quote:quote,
        confidence:"explicit"
      };
      const claim={claim_id:"claim_incremental_replacement",text:quote,citation_ids:[citation.citation_id]};
      const document={
        document_kind:"topic_article",title:"Incremental Changed Range Wiki",purpose:"변경 범위만 다시 정리한다.",tags:["incremental"],
        sections:[{heading:"Changed Range",paragraphs:[{text:quote,claim_ids:[claim.claim_id]}]}],claims:[claim],citations:[citation]
      };
      const documentBytes="---\\ntype: wiki-preview\\nstatus: review\\n---\\n\\n# Incremental Changed Range Wiki\\n\\n"+quote+"\\n";
      const artifact=ProdigyWikiArtifactContract.createPreviewArtifact({
        operation_id:LLMWikiHash.sha256("incremental-replacement-operation"),
        orchestrator_version:"llmwiki_golden_wiki_orchestrator_v2",
        gate_receipt_hash:LLMWikiHash.sha256("incremental-replacement-gate"),
        source:{source_id:"source_incremental_changed_scope",source_path:qa.sourcePath,source_revision:qa.changedRevision,source_text:qa.changedText},
        scope:snapshot.range,
        document,
        document_bytes:documentBytes,
        refresh_context:snapshot.result.refresh_context
      });
      const receipt={
        ok:true,status:"publishable_preview",issues:[],metrics:{structure_score:1,critical_token_recall:1,style_score:1},
        receipt:{source_path:qa.sourcePath,document_hash:LLMWikiHash.sha256(documentBytes),receipt_hash:artifact.receipt.gate_receipt_hash},
        ...artifact.receipt,artifact_receipt_hash:artifact.receipt.receipt_hash
      };
      const ensure=async path=>{
        const parts=path.split("/").slice(0,-1);
        for(let index=1;index<=parts.length;index+=1){
          const folder=parts.slice(0,index).join("/");
          if(folder&&!app.vault.getAbstractFileByPath(folder)){
            try{await app.vault.createFolder(folder)}
            catch(error){if(!/Folder already exists/u.test(String(error?.message||error)))throw error}
          }
        }
      };
      await ensure(artifact.document_path);
      await app.vault.create(artifact.document_path,documentBytes);
      await app.vault.create(artifact.receipt_path,JSON.stringify(receipt,null,2)+"\\n");
      qa.replacement={artifact,receipt};
      await KnowledgeExplorerHub.refreshGoldenPreviewWorkbench();
      return {artifact_id:artifact.artifact_id};
    })()`);
    await harness.renderedClick("#knowledge-tab-llmwiki-browse");
    await harness.waitForSelector(`[data-preview-id="${replacement.artifact_id}"] [data-action="mark-golden-reviewed"]`);
    const replacementReady = waitForText(harness, counts, "이전 버전 1", "INCREMENTAL_REPLACEMENT_REVIEW_TIMEOUT");
    await harness.renderedClick(`[data-preview-id="${replacement.artifact_id}"] [data-action="mark-golden-reviewed"]`);
    await replacementReady;
    const history = await harness.evaluate(`(()=>{
      const snapshot=KnowledgeExplorerHub.reviewedWikiSnapshot();
      const index=KnowledgeExplorerHub.reviewedWikiIndexSnapshot();
      return {
        entries:snapshot.entries.map(entry=>({id:entry.artifact_id,status:entry.status})),
        counts:index.counts
      };
    })()`);
    assert.deepEqual(history.counts, { current: 1, stale: 0, history: 1, total: 2 });
    assert.equal(history.entries.find((entry) => entry.id === created.artifact_id).status, "superseded");
    assert.equal(history.entries.find((entry) => entry.id === replacement.artifact_id).status, "current");

    await harness.evaluate(`(async()=>{
      const qa=window.__prodigyWikiIncrementalQa;
      if(qa.batchStateReady)await qa.batchStateReady;
      const settled=KnowledgeExplorerHub._llmWikiSession?.inboxSettled;
      if(settled&&typeof settled.then==="function")await settled;
      return true;
    })()`);
    await harness.openWorkspace("home");
    const cleanup = await harness.evaluate(`(async()=>{
      const qa=window.__prodigyWikiIncrementalQa;
      window.__task13aProdigyWikiSourceWrites=true;
      await app.vault.modify(qa.sourceFile,qa.originalText);
      window.__task13aProdigyWikiSourceWrites=false;
      for(const value of [qa.initial,qa.replacement])for(const path of [value.artifact.receipt_path,value.artifact.document_path]){
        const file=app.vault.getAbstractFileByPath(path);
        if(file)await app.vault.delete(file,true);
      }
      for(const rootPath of [qa.previewRoot,"PARA/RESOURCES/Prodigy Wiki"]){
        const folder=app.vault.getAbstractFileByPath(rootPath);
        if(folder)await app.vault.delete(folder,true);
      }
      const baseline=new Set(qa.baselinePaths);
      const extras=app.vault.getAllLoadedFiles()
        .filter(file=>!baseline.has(file.path)&&(
          file.path.startsWith("SYSTEM/CACHE/")||file.path.startsWith("PARA/RESOURCES/Prodigy Wiki")
        ))
        .sort((left,right)=>right.path.length-left.path.length);
      for(const file of extras)if(app.vault.getAbstractFileByPath(file.path))await app.vault.delete(file,true);
      const restoredHash=LLMWikiHash.sha256(await app.vault.cachedRead(qa.sourceFile));
      const unsafe=(window.__task13aWriteAttempts||[]).filter(row=>
        String(row.path||"").startsWith("PARA/RESOURCES/Knowledge/")
        || row.path===qa.sourcePath
      );
      window.__task13aProdigyWikiReviewedWrites=false;
      delete window.__prodigyWikiIncrementalQa;
      return {restoredHash,unsafe};
    })()`);
    qaCreated = false;
    assert.equal(cleanup.restoredHash, created.source_revision);
    assert.deepEqual(cleanup.unsafe, []);
  } finally {
    if (harness) {
      if (qaCreated) {
        await harness.evaluate(`(async()=>{
          const qa=window.__prodigyWikiIncrementalQa;
          if(qa?.batchStateReady)await qa.batchStateReady.catch(()=>false);
          const settled=KnowledgeExplorerHub._llmWikiSession?.inboxSettled;
          if(settled&&typeof settled.then==="function")await settled;
          return true;
        })()`).catch(() => true);
        await harness.openWorkspace("home").catch(() => null);
        await harness.evaluate(`(async()=>{
          const qa=window.__prodigyWikiIncrementalQa;
          if(!qa)return true;
          window.__task13aProdigyWikiSourceWrites=true;
          await app.vault.modify(qa.sourceFile,qa.originalText);
          window.__task13aProdigyWikiSourceWrites=false;
          for(const value of [qa.initial,qa.replacement].filter(Boolean))for(const path of [value.artifact.receipt_path,value.artifact.document_path]){
            const file=app.vault.getAbstractFileByPath(path);
            if(file)await app.vault.delete(file,true);
          }
          for(const rootPath of [qa.previewRoot,"PARA/RESOURCES/Prodigy Wiki"]){
            const folder=app.vault.getAbstractFileByPath(rootPath);
            if(folder)await app.vault.delete(folder,true);
          }
          const baseline=new Set(qa.baselinePaths);
          const extras=app.vault.getAllLoadedFiles()
            .filter(file=>!baseline.has(file.path)&&(
              file.path.startsWith("SYSTEM/CACHE/")||file.path.startsWith("PARA/RESOURCES/Prodigy Wiki")
            ))
            .sort((left,right)=>right.path.length-left.path.length);
          for(const file of extras)if(app.vault.getAbstractFileByPath(file.path))await app.vault.delete(file,true);
          window.__task13aProdigyWikiReviewedWrites=false;
          delete window.__prodigyWikiIncrementalQa;
          return true;
        })()`);
      }
      const closed = await harness.close({
        expectedRuntimeJsonPaths: ["SYSTEM/CACHE/llmwiki/batch-job-state.json"],
      });
      assert.equal(closed.audit.equal, true);
      assert.equal(closed.protectedContinuity.exact, true);
      assert.equal(closed.removed, true);
    }
  }
});
