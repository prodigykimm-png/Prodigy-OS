"use strict";
const assert=require("node:assert/strict"),test=require("node:test");
const hash=require("../../../../../Views/llmwiki-hash.js");
const api=require("../../../../../Views/llmwiki-golden-wiki-orchestrator.js");
function fixture({chunks=3,gateOk=true}={}){
  const sourceText="# 자료\n원문 수치 126%",quote="원문 수치 126%",start=sourceText.indexOf(quote),files=new Map([["INBOX/자료.md",sourceText]]),writes=new Map();
  const vault={getAbstractFileByPath:path=>files.has(path)||writes.has(path)?{path}:null,cachedRead:file=>Promise.resolve(files.get(file.path)||writes.get(file.path)),createFolder:async path=>writes.set(path,""),create:async(path,bytes)=>writes.set(path,bytes),modify:async(file,bytes)=>writes.set(file.path,bytes)};
  const citation={citation_id:"citation_fixture_001",source_id:"source_fixture",source_path:"INBOX/자료.md",content_hash:hash.sha256(sourceText),locators:[`INBOX/자료.md#${start}-${start+quote.length}`],evidence_quote:quote,confidence:"explicit"};
  const documents=[{document_kind:"topic_article",title:"자료 판단 가이드",purpose:"핵심 판단을 정리합니다.",sections:[{heading:"판단 기준",paragraphs:[{text:"원문 수치 126%를 확인합니다.",claim_ids:["claim_fixture_001"]}]}],claims:[{claim_id:"claim_fixture_001",text:"원문 수치 126%를 확인합니다.",citation_ids:[citation.citation_id]}],citations:[citation]}];
  let planCalls=0,compileCalls=0;
  const orchestrator=api.create({vault,hash,analysisScope:{createAnalysisScope:x=>x},chunkManifest:{createChunkManifest:()=>({chunks:Array.from({length:chunks},(_,i)=>({text:`chunk ${i}`}))})},limits:{max_chunks:4,max_bytes:24576},gate:{evaluate:({document_text})=>gateOk?{ok:true,status:"publishable_preview",issues:[],metrics:{structure_score:1,critical_token_recall:1,style_score:1},receipt:{document_hash:hash.sha256(document_text),source_path:"INBOX/자료.md",receipt_hash:"a".repeat(64)}}:{ok:false,status:"review_required",issues:["source_jargon_exposed"],metrics:{structure_score:1,critical_token_recall:1,style_score:0}}},runPlan:async()=>{planCalls++;return{ok:true,pages:1,map_provider_calls:1,plan_provider_calls:1}},compilePlan:async()=>{compileCalls++;return{ok:true,provider_calls:1}},getDocuments:()=>documents});
  return{orchestrator,writes,calls:()=>({planCalls,compileCalls})};
}
test("selected source becomes a gated immutable preview and self-verifying receipt without canonical writes",async()=>{const f=fixture(),result=await f.orchestrator.run({source_path:"INBOX/자료.md",expected_content_hash:hash.sha256("# 자료\n원문 수치 126%"),operation_id:"c".repeat(64)});assert.equal(result.ok,true);assert.equal(result.status,"golden_complete");assert.equal(result.canonical_writes,0);assert.equal(result.source_writes,0);assert.equal(result.previews.length,1);const row=result.previews[0];assert.match(row.artifact_id,/^prodigy_artifact_[0-9a-f]{24}$/u);assert.match(row.document_path,/^SYSTEM\/CACHE\/llmwiki\/previews\//u);assert.match(f.writes.get(row.document_path),/## 실전 체크리스트/u);const receipt=JSON.parse(f.writes.get(row.receipt_path));assert.equal(receipt.status,"publishable_preview");assert.equal(receipt.source_revision,hash.sha256("# 자료\n원문 수치 126%"));assert.equal(receipt.artifact_id,row.artifact_id);assert.match(receipt.navigation_hash,/^[0-9a-f]{64}$/u);assert.match(receipt.source_outline_hash,/^[0-9a-f]{64}$/u);assert.deepEqual(f.calls(),{planCalls:1,compileCalls:1})});
test("Golden Gate failure writes no preview",async()=>{const f=fixture({gateOk:false}),result=await f.orchestrator.run({source_path:"INBOX/자료.md"});assert.equal(result.ok,false);assert.equal(result.reason,"golden_gate_failed");assert.equal([...f.writes.keys()].some(path=>path.endsWith(".md")),false)});
test("large source is blocked before provider calls and returns meaningful heading scopes",async()=>{const source=Array.from({length:32},(_,i)=>`## 구간 ${i}\n${"충분한 본문 내용 ".repeat(20)}`).join("\n"),files=new Map([["INBOX/자료.md",source]]),vault={getAbstractFileByPath:path=>files.has(path)?{path}:null,cachedRead:file=>Promise.resolve(files.get(file.path))},orchestrator=api.create({vault,hash,analysisScope:{createAnalysisScope:x=>x},chunkManifest:{createChunkManifest:()=>({chunks:Array.from({length:124},(_,i)=>({text:`chunk ${i}`}))})},limits:{max_chunks:4,max_bytes:24576},gate:{evaluate:()=>{throw new Error("gate_not_expected")}},runPlan:async()=>{throw new Error("provider_not_expected")},compilePlan:async()=>{throw new Error("compile_not_expected")},getDocuments:()=>[]}),result=await orchestrator.run({source_path:"INBOX/자료.md"});assert.equal(result.ok,false);assert.equal(result.status,"scope_required");assert.equal(result.packs,31);assert.ok(result.scopes.length>0);assert.equal(result.provider_calls,0)});
test("explicit heading scope is revision-bound and passed to the document plan",async()=>{const source=`## 첫 구간\n${"충분한 첫 구간 내용 ".repeat(20)}\n## 둘째 구간\n${"충분한 둘째 구간 내용 ".repeat(20)}`,files=new Map([["INBOX/자료.md",source]]),writes=new Map(),vault={getAbstractFileByPath:path=>files.has(path)||writes.has(path)?{path}:null,cachedRead:file=>Promise.resolve(files.get(file.path)||writes.get(file.path)),createFolder:async path=>writes.set(path,""),create:async(path,bytes)=>writes.set(path,bytes),modify:async(file,bytes)=>writes.set(file.path,bytes)},citation={citation_id:"citation_scope_1",source_id:"source_scope",source_path:"INBOX/자료.md",content_hash:hash.sha256(source),locators:[`INBOX/자료.md#${source.indexOf("첫 구간")}-${source.indexOf("첫 구간")+"첫 구간".length}`],evidence_quote:"첫 구간"},document={document_kind:"topic_article",title:"구간 Wiki",purpose:"선택 구간",sections:[{heading:"내용",paragraphs:[{text:"내용",claim_ids:["claim_scope_1"]}]}],claims:[{claim_id:"claim_scope_1",text:"내용",citation_ids:[citation.citation_id]}],citations:[citation]},calls=[];const orchestrator=api.create({vault,hash,analysisScope:{createAnalysisScope:x=>x},chunkManifest:{createChunkManifest:scope=>({chunks:[{text:scope.source_text}]})},limits:{max_chunks:4,max_bytes:24576},gate:{evaluate:({document_text})=>({ok:true,status:"publishable_preview",issues:[],metrics:{structure_score:1,critical_token_recall:1,style_score:1},receipt:{document_hash:hash.sha256(document_text),source_path:"INBOX/자료.md",receipt_hash:"b".repeat(64)}})},runPlan:async(path,options)=>{calls.push({path,options});return{ok:true,pages:1}},compilePlan:async()=>({ok:true}),getDocuments:()=>[document]});const scope=api.headingScopes(source)[0],result=await orchestrator.run({source_path:"INBOX/자료.md",expected_content_hash:hash.sha256(source),scope});assert.equal(result.ok,true);assert.equal(calls[0].options.scope.scope_id,scope.scope_id);assert.equal(calls[0].options.expected_source_hash,hash.sha256(source))});
test("publication rendering removes source jargon from titles headings and prose",()=>{const rendered=api.renderDocument({title:"공동주택공시가격(공주가)의 활용",purpose:"공주가 확인",sections:[{heading:"공주가 기준",paragraphs:[{text:"물건 선주의 시 공동주택공시가격(공동주택 공시가격)을 확인한다."}]}]},"INBOX/자료.md");assert.doesNotMatch(rendered,/공주가|물건 선주의|공동주택공시가격\s*\(공동주택/u);assert.match(rendered,/공동주택공시가격의 활용/u);assert.match(rendered,/물건 선정 시/u)});
test("multiple narrow topic pages become one source-wide practical Wiki",()=>{const merged=api.mergeTopicDocuments([{title:"권리 확인",sections:[{paragraphs:[{text:"권리를 확인한다.",claim_ids:["c1"]}]}],claims:[{claim_id:"c1",text:"권리를 확인한다."}]},{title:"자금 계획",sections:[{paragraphs:[{text:"자금을 계산한다.",claim_ids:["c2"]}]}],claims:[{claim_id:"c2",text:"자금을 계산한다."}]}],"INBOX/서울투자반.md");assert.equal(merged.title,"서울투자반 실전 Wiki");assert.deepEqual(merged.sections.map(row=>row.heading),["권리 확인","자금 계획"]);assert.deepEqual(merged.claims.map(row=>row.claim_id),["c1","c2"]);const rendered=api.renderDocument(merged,"INBOX/서울투자반.md");assert.match(rendered,/## 권리 확인/u);assert.match(rendered,/## 자금 계획/u);assert.match(rendered,/권리 확인의 조건과 예외/u)});

test("stable changed range preflight excludes every unchanged sibling before provider planning", async () => {
  const source = [
    "## Unchanged Before",
    "BEFORE_SENTINEL ".repeat(30),
    "## Changed Range",
    "CHANGED_PAYLOAD ".repeat(30),
    "## Unchanged After",
    "AFTER_SENTINEL ".repeat(30),
  ].join("\n");
  const files = new Map([["INBOX/자료.md", source]]);
  let providerCalls = 0;
  const orchestrator = api.create({
    vault: {
      getAbstractFileByPath: (filePath) => files.has(filePath) ? { path: filePath } : null,
      cachedRead: (file) => Promise.resolve(files.get(file.path)),
    },
    hash,
    analysisScope: { createAnalysisScope: (value) => value },
    chunkManifest: { createChunkManifest: (scope) => ({ chunks: [{ text: scope.source_text }] }) },
    limits: { max_chunks: 4, max_bytes: 24576 },
    gate: { evaluate() { throw new Error("gate_not_expected"); } },
    runPlan: async () => { providerCalls += 1; throw new Error("provider_not_expected"); },
    compilePlan: async () => { providerCalls += 1; throw new Error("provider_not_expected"); },
    getDocuments: () => [],
  });
  const selected = api.headingScopes(source).find((row) => row.title === "Changed Range");
  const scope = { ...selected, scope_id: "range_stable_changed", range_key: "range_stable_changed" };
  const prepared = await orchestrator.preflight({
    source_path: "INBOX/자료.md",
    expected_content_hash: hash.sha256(source),
    scope,
  });

  assert.equal(prepared.ok, true);
  assert.match(prepared.source_text, /CHANGED_PAYLOAD/u);
  assert.doesNotMatch(prepared.source_text, /BEFORE_SENTINEL|AFTER_SENTINEL/u);
  assert.equal(providerCalls, 0);
});
