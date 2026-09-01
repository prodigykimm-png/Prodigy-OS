#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const { test } = require("node:test");
const { RealObsidianHarness } = require("../shared/real_obsidian_harness.js");

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
    observer.observe(document.body,{childList:true,subtree:true,characterData:true});
    const guard=setTimeout(()=>{observer.disconnect();reject(new Error(${JSON.stringify(label)}))},15000);
    finish();
  })`);
}

test("real Obsidian accumulates reviewed Wiki documents and restores the index after remount", {
  timeout: 120000,
}, async () => {
  let harness;
  let qaCreated = false;
  try {
    harness = await RealObsidianHarness.start("prodigy-wiki-reviewed-catalog");
    await harness.openWorkspace("knowledge");
    await harness.renderedClick("#knowledge-tab-llmwiki-browse");
    await harness.waitForSelector('[data-surface="prodigy-wiki-reviewed-index"]');

    const created = await harness.evaluate(`(async()=>{
      window.__task13aProdigyWikiReviewedWrites=true;
      const sourcePath="ZETA/LITERATURE/TASK13A Synthetic Literature.md";
      const sourceFile=app.vault.getAbstractFileByPath(sourcePath);
      const sourceText=await app.vault.cachedRead(sourceFile);
      const sourceRevision=LLMWikiHash.sha256(sourceText);
      const quote="선택한 합성 근거만 검토하며 정본 지식은 쓰지 않는다.";
      const start=sourceText.indexOf(quote);
      if(start<0)throw new Error("CATALOG_QA_QUOTE_MISSING");
      const make=(ordinal,title,tags)=>{
        const citation={
          citation_id:"citation_catalog_"+ordinal,
          source_id:"source_catalog_real",
          source_path:sourcePath,
          content_hash:sourceRevision,
          locators:[sourcePath+"#"+start+"-"+(start+quote.length)],
          evidence_quote:quote,
          confidence:"explicit"
        };
        const claim={claim_id:"claim_catalog_"+ordinal,text:quote,citation_ids:[citation.citation_id]};
        const document={
          document_kind:"topic_article",
          title,
          purpose:title+" 목적",
          tags,
          sections:[{heading:title+" 핵심",paragraphs:[{text:quote,claim_ids:[claim.claim_id]}]}],
          claims:[claim],
          citations:[citation]
        };
        const documentBytes="---\\ntype: wiki-preview\\nstatus: review\\n---\\n\\n# "+title+"\\n\\n"+quote+"\\n";
        const artifact=ProdigyWikiArtifactContract.createPreviewArtifact({
          operation_id:LLMWikiHash.sha256("catalog-operation-"+ordinal),
          orchestrator_version:"llmwiki_golden_wiki_orchestrator_v2",
          gate_receipt_hash:LLMWikiHash.sha256("catalog-gate-"+ordinal),
          source:{source_id:"source_catalog_real",source_path:sourcePath,source_revision:sourceRevision,source_text:sourceText},
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
        return {artifact,receipt};
      };
      const values=[
        make(1,"질문 중심 독서",["reading","personal_growth"]),
        make(2,"근거 중심 독서",["reading"])
      ];
      const ensure=async path=>{
        const parts=path.split("/").slice(0,-1);
        for(let index=1;index<=parts.length;index+=1){
          const folder=parts.slice(0,index).join("/");
          if(folder&&!app.vault.getAbstractFileByPath(folder))await app.vault.createFolder(folder);
        }
      };
      for(const value of values){
        await ensure(value.artifact.document_path);
        await app.vault.create(value.artifact.document_path,value.artifact.document_bytes);
        await app.vault.create(value.artifact.receipt_path,JSON.stringify(value.receipt,null,2)+"\\n");
      }
      window.__prodigyWikiCatalogQa={
        values,
        sourcePath,
        sourceHash:sourceRevision,
        previewRoot:values[0].artifact.document_path.split("/").slice(0,-2).join("/")
      };
      await KnowledgeExplorerHub.refreshGoldenPreviewWorkbench();
      return {artifact_ids:values.map(value=>value.artifact.artifact_id),source_path:sourcePath,source_hash:sourceRevision};
    })()`);
    qaCreated = true;

    const countsSelector = '[data-surface="prodigy-wiki-reviewed-index"] [data-reviewed-wiki-counts]';
    const firstReady = waitForText(harness, countsSelector, "현재 1", "CATALOG_QA_FIRST_REVIEW_TIMEOUT");
    await harness.renderedClick(`[data-preview-id="${created.artifact_ids[0]}"] [data-action="mark-golden-reviewed"]`);
    await firstReady;
    const secondReady = waitForText(harness, countsSelector, "현재 2", "CATALOG_QA_SECOND_REVIEW_TIMEOUT");
    await harness.renderedClick(`[data-preview-id="${created.artifact_ids[1]}"] [data-action="mark-golden-reviewed"]`);
    await secondReady;

    const accumulated = await harness.evaluate(`(()=>{
      const snapshot=KnowledgeExplorerHub.reviewedWikiSnapshot();
      const index=KnowledgeExplorerHub.reviewedWikiIndexSnapshot();
      return {
        entries:snapshot.entries.map(entry=>({artifact_id:entry.artifact_id,path:entry.document_path,trust:entry.trust_tier})),
        counts:index.counts,
        canonical:index.rows.filter(row=>row.document_path.startsWith("PARA/RESOURCES/Knowledge/")).length,
        writes:(window.__task13aWriteAttempts||[]).filter(row=>
          row.path===window.__prodigyWikiCatalogQa.sourcePath
          || String(row.path||"").startsWith("PARA/RESOURCES/Knowledge/")
          || String(row.path||"").startsWith("ZETA/PERMANENT/")
        )
      };
    })()`);
    assert.equal(accumulated.entries.length, 2);
    assert.deepEqual(accumulated.counts, { current: 2, stale: 0, history: 0, total: 2 });
    assert.equal(accumulated.entries.every((entry) => entry.path.startsWith("PARA/RESOURCES/Prodigy Wiki/")), true);
    assert.equal(accumulated.entries.every((entry) => entry.trust === "prodigy_reviewed"), true);
    assert.equal(accumulated.canonical, 0);
    assert.deepEqual(accumulated.writes, []);

    await harness.openWorkspace("home");
    await harness.evaluate(`(()=>{
      KnowledgeExplorerHub._llmWikiSession=null;
      KnowledgeExplorerHub._lastTab="llmwiki-browse";
      return true;
    })()`);
    await harness.openWorkspace("knowledge");
    await harness.waitForSelector('[data-surface="prodigy-wiki-reviewed-index"]');
    await waitForText(harness, countsSelector, "현재 2", "CATALOG_QA_RELOAD_TIMEOUT");
    const restored = await harness.evaluate(`(()=>{
      const marks=[...document.querySelectorAll('[data-action="mark-golden-reviewed"]')];
      const input=document.querySelector('[data-action="search-reviewed-wiki"]');
      input.value="근거 중심";
      input.dispatchEvent(new Event("input",{bubbles:true}));
      return {
        entries:KnowledgeExplorerHub.reviewedWikiSnapshot().entries.length,
        reviewedButtons:marks.filter(button=>button.textContent.includes("확인함")&&button.disabled).length,
        visibleRows:document.querySelectorAll('[data-reviewed-wiki-row]').length
      };
    })()`);
    assert.equal(restored.entries, 2);
    assert.equal(restored.reviewedButtons, 2);
    assert.equal(restored.visibleRows, 1);

    const cleanup = await harness.evaluate(`(async()=>{
      const qa=window.__prodigyWikiCatalogQa;
      const sourceFile=app.vault.getAbstractFileByPath(qa.sourcePath);
      const sourceHash=LLMWikiHash.sha256(await app.vault.cachedRead(sourceFile));
      for(const value of qa.values){
        for(const path of [value.artifact.receipt_path,value.artifact.document_path]){
          const file=app.vault.getAbstractFileByPath(path);
          if(file)await app.vault.delete(file,true);
        }
      }
      for(const rootPath of [qa.previewRoot,"PARA/RESOURCES/Prodigy Wiki"]){
        const folder=app.vault.getAbstractFileByPath(rootPath);
        if(folder)await app.vault.delete(folder,true);
      }
      window.__task13aProdigyWikiReviewedWrites=false;
      delete window.__prodigyWikiCatalogQa;
      const unsafeWrites=(window.__task13aWriteAttempts||[]).filter(row=>
        row.path===qa.sourcePath||String(row.path||"").startsWith("PARA/RESOURCES/Knowledge/")
      );
      return {sourceHash,unsafeWrites};
    })()`);
    qaCreated = false;
    assert.equal(cleanup.sourceHash, created.source_hash);
    assert.deepEqual(cleanup.unsafeWrites, []);
  } finally {
    if (harness) {
      if (qaCreated) {
        await harness.evaluate(`(async()=>{
          const qa=window.__prodigyWikiCatalogQa;
          if(!qa)return true;
          for(const value of qa.values)for(const path of [value.artifact.receipt_path,value.artifact.document_path]){
            const file=app.vault.getAbstractFileByPath(path);
            if(file)await app.vault.delete(file,true);
          }
          for(const rootPath of [qa.previewRoot,"PARA/RESOURCES/Prodigy Wiki"]){
            const folder=app.vault.getAbstractFileByPath(rootPath);
            if(folder)await app.vault.delete(folder,true);
          }
          window.__task13aProdigyWikiReviewedWrites=false;
          delete window.__prodigyWikiCatalogQa;
          return true;
        })()`);
      }
      const closed = await harness.close();
      assert.equal(closed.audit.equal, true);
      assert.equal(closed.protectedContinuity.exact, true);
      assert.equal(closed.removed, true);
    }
  }
});
