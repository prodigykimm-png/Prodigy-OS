#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const { test } = require("node:test");
const { RealObsidianHarness } = require("../shared/real_obsidian_harness.js");

test("real Obsidian opens a reviewed Wiki paragraph at its exact current source position", {
  timeout: 120000,
}, async () => {
  let harness;
  let cleanupPath = "";
  try {
    harness = await RealObsidianHarness.start("prodigy-wiki-source-navigation");
    await harness.openWorkspace("knowledge");
    await harness.renderedClick("#knowledge-tab-llmwiki-browse");
    await harness.waitForSelector("#knowledge-panel-llmwiki-browse [data-surface='llmwiki-golden-preview-workbench']");

    const created = await harness.evaluate(`(async()=>{
      const sourcePath="ZETA/LITERATURE/TASK13A Synthetic Literature.md";
      const sourceFile=app.vault.getAbstractFileByPath(sourcePath);
      const sourceText=await app.vault.cachedRead(sourceFile);
      const quote="선택한 합성 근거만 검토하며 정본 지식은 쓰지 않는다.";
      const start=sourceText.indexOf(quote);
      if(start<0)throw new Error("NAV_QA_QUOTE_MISSING");
      const sourceRevision=LLMWikiHash.sha256(sourceText);
      const citation={
        citation_id:"citation_real_obsidian_navigation",
        source_id:"source_real_obsidian_navigation",
        source_path:sourcePath,
        content_hash:sourceRevision,
        locators:[sourcePath+"#"+start+"-"+(start+quote.length)],
        evidence_quote:quote,
        confidence:"explicit"
      };
      const claim={
        claim_id:"claim_real_obsidian_navigation",
        text:quote,
        citation_ids:[citation.citation_id]
      };
      const document={
        document_kind:"topic_article",
        title:"실제 Obsidian 원문 이동 QA",
        purpose:"검토 문서에서 정확한 원문 위치로 이동한다.",
        tags:["reading"],
        sections:[{heading:"원문 이동",paragraphs:[{text:quote,claim_ids:[claim.claim_id]}]}],
        claims:[claim],
        citations:[citation]
      };
      const documentBytes="# 실제 Obsidian 원문 이동 QA\\n\\n"+quote+"\\n";
      const artifact=ProdigyWikiArtifactContract.createPreviewArtifact({
        operation_id:"e".repeat(64),
        orchestrator_version:"llmwiki_golden_wiki_orchestrator_v2",
        gate_receipt_hash:"f".repeat(64),
        source:{
          source_id:"source_real_obsidian_navigation",
          source_path:sourcePath,
          source_revision:sourceRevision,
          source_text:sourceText
        },
        scope:null,
        document,
        document_bytes:documentBytes
      });
      const receipt={
        ok:true,
        status:"publishable_preview",
        issues:[],
        metrics:{structure_score:1,critical_token_recall:1,style_score:1},
        receipt:{source_path:sourcePath,document_hash:LLMWikiHash.sha256(documentBytes),receipt_hash:"f".repeat(64)},
        ...artifact.receipt,
        artifact_receipt_hash:artifact.receipt.receipt_hash
      };
      const ensure=async path=>{
        const parts=path.split("/").slice(0,-1);
        for(let index=1;index<=parts.length;index+=1){
          const folder=parts.slice(0,index).join("/");
          if(folder&&!app.vault.getAbstractFileByPath(folder))await app.vault.createFolder(folder);
        }
      };
      await ensure(artifact.document_path);
      await app.vault.create(artifact.document_path,documentBytes);
      await app.vault.create(artifact.receipt_path,JSON.stringify(receipt,null,2)+"\\n");
      window.__prodigyWikiNavigationQa={artifact,citation,sourcePath,start,sourceRoot:artifact.document_path.split("/").slice(0,-2).join("/")};
      await KnowledgeExplorerHub.refreshGoldenPreviewWorkbench();
      return {artifact_id:artifact.artifact_id,document_path:artifact.document_path,source_path:sourcePath,start};
    })()`);
    cleanupPath = created.document_path;

    const paragraphSelector = `[data-preview-id="${created.artifact_id}"] [data-action="open-golden-paragraph-source"]`;
    await harness.waitForSelector(paragraphSelector);
    const currentReady = harness.evaluate(`new Promise((resolve,reject)=>{
      const finish=()=>{
        const node=document.querySelector('.modal-container [data-source-freshness="current"]');
        if(!node)return;
        observer.disconnect();
        clearTimeout(guard);
        resolve(true);
      };
      const observer=new MutationObserver(finish);
      observer.observe(document.body,{childList:true,subtree:true,attributes:true});
      const guard=setTimeout(()=>{observer.disconnect();reject(new Error("NAV_QA_CURRENT_TIMEOUT"))},10000);
      finish();
    })`);
    await harness.renderedClick(paragraphSelector);
    await currentReady;
    const current = await harness.evaluate(`(()=>{
      const modal=document.querySelector('.modal-container [data-surface="llmwiki-source-preview"]');
      return {
        text:modal?.textContent||"",
        freshness:modal?.querySelector("[data-source-freshness]")?.getAttribute("data-source-freshness")||"",
        edit:Boolean(modal?.querySelector('[data-action="edit-source-file"]'))
      };
    })()`);
    assert.equal(current.freshness, "current");
    assert.match(current.text, /현재 원문과 일치/u);
    assert.equal(current.edit, true);

    await harness.renderedClick('.modal-container [data-action="edit-source-file"]');
    const opened = await harness.evaluate(`(()=>{
      const editor=app.workspace.activeLeaf?.view?.editor;
      return {
        path:app.workspace.getActiveFile()?.path||"",
        cursor:editor&&typeof editor.getCursor==="function"?editor.getCursor():null
      };
    })()`);
    assert.equal(opened.path, created.source_path);
    assert.ok(opened.cursor && Number.isSafeInteger(opened.cursor.line));

    await harness.renderedClick('.modal-container [data-action="close-source-preview"]');
    const staleReady = harness.evaluate(`new Promise((resolve,reject)=>{
      const finish=()=>{
        const node=document.querySelector('.modal-container [data-source-freshness="stale"]');
        if(!node)return;
        observer.disconnect();
        clearTimeout(guard);
        resolve(true);
      };
      const observer=new MutationObserver(finish);
      observer.observe(document.body,{childList:true,subtree:true,attributes:true});
      const guard=setTimeout(()=>{observer.disconnect();reject(new Error("NAV_QA_STALE_TIMEOUT"))},10000);
      finish();
    })`);
    await harness.evaluate(`(()=>{
      const stale={...window.__prodigyWikiNavigationQa.citation,content_hash:"0".repeat(64)};
      return KnowledgeExplorerHub.openGoldenCitation(stale);
    })()`);
    await staleReady;
    const stale = await harness.evaluate(`(()=>{
      const modal=document.querySelector('.modal-container [data-surface="llmwiki-source-preview"]');
      return {
        text:modal?.textContent||"",
        freshness:modal?.querySelector("[data-source-freshness]")?.getAttribute("data-source-freshness")||"",
        edit:Boolean(modal?.querySelector('[data-action="edit-source-file"]'))
      };
    })()`);
    assert.equal(stale.freshness, "stale");
    assert.match(stale.text, /원문이 변경됨/u);
    assert.equal(stale.edit, false);
    await harness.renderedClick('.modal-container [data-action="close-source-preview"]');

    await harness.evaluate(`(async()=>{
      const qa=window.__prodigyWikiNavigationQa;
      for(const path of [qa.artifact.receipt_path,qa.artifact.document_path]){
        const file=app.vault.getAbstractFileByPath(path);
        if(file)await app.vault.delete(file,true);
      }
      const folder=app.vault.getAbstractFileByPath(qa.sourceRoot);
      if(folder)await app.vault.delete(folder,true);
      delete window.__prodigyWikiNavigationQa;
      await KnowledgeExplorerHub.refreshGoldenPreviewWorkbench();
      return true;
    })()`);
    cleanupPath = "";
  } finally {
    if (harness) {
      if (cleanupPath) {
        await harness.evaluate(`(async()=>{
          const qa=window.__prodigyWikiNavigationQa;
          if(!qa)return true;
          for(const path of [qa.artifact.receipt_path,qa.artifact.document_path]){
            const file=app.vault.getAbstractFileByPath(path);
            if(file)await app.vault.delete(file,true);
          }
          const folder=app.vault.getAbstractFileByPath(qa.sourceRoot);
          if(folder)await app.vault.delete(folder,true);
          delete window.__prodigyWikiNavigationQa;
          return true;
        })()`);
      }
      const cleanup = await harness.close();
      assert.equal(cleanup.audit.equal, true);
      assert.equal(cleanup.protectedContinuity.exact, true);
      assert.equal(cleanup.removed, true);
    }
  }
});
