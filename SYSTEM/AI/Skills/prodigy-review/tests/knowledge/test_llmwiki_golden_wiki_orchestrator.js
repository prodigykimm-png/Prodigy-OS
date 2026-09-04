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
test("selected source becomes a gated immutable preview and self-verifying receipt without canonical writes",async()=>{const f=fixture(),result=await f.orchestrator.run({source_path:"INBOX/자료.md",expected_content_hash:hash.sha256("# 자료\n원문 수치 126%"),operation_id:"c".repeat(64)});assert.equal(result.ok,true);assert.equal(result.status,"publishable_preview");assert.equal(result.canonical_writes,0);assert.equal(result.source_writes,0);assert.equal(result.previews.length,1);const row=result.previews[0];assert.match(row.artifact_id,/^prodigy_artifact_[0-9a-f]{24}$/u);assert.match(row.document_path,/^SYSTEM\/CACHE\/llmwiki\/previews\//u);assert.match(f.writes.get(row.document_path),/## 실전 체크리스트/u);const receipt=JSON.parse(f.writes.get(row.receipt_path));assert.equal(receipt.status,"publishable_preview");assert.equal(receipt.source_revision,hash.sha256("# 자료\n원문 수치 126%"));assert.equal(receipt.artifact_id,row.artifact_id);assert.match(receipt.navigation_hash,/^[0-9a-f]{64}$/u);assert.match(receipt.source_outline_hash,/^[0-9a-f]{64}$/u);assert.deepEqual(f.calls(),{planCalls:1,compileCalls:1})});
test("Golden Gate failure writes no preview",async()=>{const f=fixture({gateOk:false}),result=await f.orchestrator.run({source_path:"INBOX/자료.md"});assert.equal(result.ok,false);assert.equal(result.reason,"golden_gate_failed");assert.equal([...f.writes.keys()].some(path=>path.endsWith(".md")),false)});
test("large source is blocked before provider calls and returns meaningful heading scopes",async()=>{const source=Array.from({length:32},(_,i)=>`## 구간 ${i}\n${"충분한 본문 내용 ".repeat(20)}`).join("\n"),files=new Map([["INBOX/자료.md",source]]),vault={getAbstractFileByPath:path=>files.has(path)?{path}:null,cachedRead:file=>Promise.resolve(files.get(file.path))},orchestrator=api.create({vault,hash,analysisScope:{createAnalysisScope:x=>x},chunkManifest:{createChunkManifest:()=>({chunks:Array.from({length:124},(_,i)=>({text:`chunk ${i}`}))})},limits:{max_chunks:4,max_bytes:24576},gate:{evaluate:()=>{throw new Error("gate_not_expected")}},runPlan:async()=>{throw new Error("provider_not_expected")},compilePlan:async()=>{throw new Error("compile_not_expected")},getDocuments:()=>[]}),result=await orchestrator.run({source_path:"INBOX/자료.md"});assert.equal(result.ok,false);assert.equal(result.status,"scope_required");assert.equal(result.packs,31);assert.ok(result.scopes.length>0);assert.equal(result.provider_calls,0)});
test("explicit heading scope is revision-bound and passed to the document plan",async()=>{const source=`## 첫 구간\n${"충분한 첫 구간 내용 ".repeat(20)}\n## 둘째 구간\n${"충분한 둘째 구간 내용 ".repeat(20)}`,files=new Map([["INBOX/자료.md",source]]),writes=new Map(),vault={getAbstractFileByPath:path=>files.has(path)||writes.has(path)?{path}:null,cachedRead:file=>Promise.resolve(files.get(file.path)||writes.get(file.path)),createFolder:async path=>writes.set(path,""),create:async(path,bytes)=>writes.set(path,bytes),modify:async(file,bytes)=>writes.set(file.path,bytes)},citation={citation_id:"citation_scope_1",source_id:"source_scope",source_path:"INBOX/자료.md",content_hash:hash.sha256(source),locators:[`INBOX/자료.md#${source.indexOf("첫 구간")}-${source.indexOf("첫 구간")+"첫 구간".length}`],evidence_quote:"첫 구간"},document={document_kind:"topic_article",title:"구간 Wiki",purpose:"선택 구간",sections:[{heading:"내용",paragraphs:[{text:"내용",claim_ids:["claim_scope_1"]}]}],claims:[{claim_id:"claim_scope_1",text:"내용",citation_ids:[citation.citation_id]}],citations:[citation]},calls=[];const orchestrator=api.create({vault,hash,analysisScope:{createAnalysisScope:x=>x},chunkManifest:{createChunkManifest:scope=>({chunks:[{text:scope.source_text}]})},limits:{max_chunks:4,max_bytes:24576},gate:{evaluate:({document_text})=>({ok:true,status:"publishable_preview",issues:[],metrics:{structure_score:1,critical_token_recall:1,style_score:1},receipt:{document_hash:hash.sha256(document_text),source_path:"INBOX/자료.md",receipt_hash:"b".repeat(64)}})},runPlan:async(path,options)=>{calls.push({path,options});return{ok:true,pages:1}},compilePlan:async()=>({ok:true}),getDocuments:()=>[document]});const scope=api.headingScopes(source)[0],result=await orchestrator.run({source_path:"INBOX/자료.md",expected_content_hash:hash.sha256(source),scope});assert.equal(result.ok,true);assert.equal(calls[0].options.scope.scope_id,scope.scope_id);assert.equal(calls[0].options.expected_source_hash,hash.sha256(source))});
test("publication rendering removes source jargon from titles headings and prose",()=>{const rendered=api.renderDocument({title:"공동주택공시가격(공주가)의 활용",purpose:"공주가 확인",sections:[{heading:"공주가 기준",paragraphs:[{text:"물건 선주의 시 공동주택공시가격(공동주택 공시가격)을 확인한다."}]}]},"INBOX/자료.md");assert.doesNotMatch(rendered,/공주가|물건 선주의|공동주택공시가격\s*\(공동주택/u);assert.match(rendered,/공동주택공시가격의 활용/u);assert.match(rendered,/물건 선정 시/u)});
test("multiple narrow topic pages become one source-wide practical Wiki",()=>{const merged=api.mergeTopicDocuments([{title:"권리 확인",sections:[{paragraphs:[{text:"권리를 확인한다.",claim_ids:["c1"]}]}],claims:[{claim_id:"c1",text:"권리를 확인한다."}]},{title:"자금 계획",sections:[{paragraphs:[{text:"자금을 계산한다.",claim_ids:["c2"]}]}],claims:[{claim_id:"c2",text:"자금을 계산한다."}]}],"INBOX/서울투자반.md");assert.equal(merged.title,"서울투자반 실전 Wiki");assert.deepEqual(merged.sections.map(row=>row.heading),["권리 확인","자금 계획"]);assert.deepEqual(merged.claims.map(row=>row.claim_id),["c1","c2"]);const rendered=api.renderDocument(merged,"INBOX/서울투자반.md");assert.match(rendered,/## 권리 확인/u);assert.match(rendered,/## 자금 계획/u);assert.match(rendered,/권리 확인의 조건과 예외/u)});

function compositionFixture({ sourceOnly = false, missingGuideParagraph = false, omit18mmFromRenderedClaim = false } = {}) {
  const sourceClaims = [
    "18mm 렌즈로 넓은 장면을 확보한다.",
    "수평과 수직 정렬을 먼저 맞춘다.",
    "뷰파인더로 가장자리 간격을 확인한다.",
    "신부는 부케를 허리 아래에서 가볍게 든다.",
    "신랑은 부케 손을 가리지 않게 선다.",
    "앉은 자세에서는 어깨선을 편하게 정리한다.",
    "시선은 카메라 옆으로 자연스럽게 둔다.",
    "배경의 밝은 부분을 피해서 선다.",
    "두 사람의 발끝 방향을 맞춘다.",
    "손가락은 힘을 빼고 모은다.",
    "얼굴 높이를 비슷하게 조정한다.",
    "마지막으로 표정과 옷매무새를 확인한다.",
  ];
  const sourceText = ["# 촬영 복기", ...sourceClaims.map((claim, index) => `${index + 1}. ${claim}`)].join("\n");
  const claims = sourceClaims.map((claim, index) => ({
    claim_id: `claim_${index.toString(16).padStart(24, "0")}`,
    text: omit18mmFromRenderedClaim && index === 0 ? claim.replace("18mm ", "") : claim,
    citation_ids: [`citation_${index.toString(16).padStart(24, "0")}`],
  }));
  const citations = sourceClaims.map((claim, index) => {
    const start = sourceText.indexOf(claim);
    return { citation_id: `citation_${index.toString(16).padStart(24, "0")}`, source_id: "source_fixture", source_path: "INBOX/촬영 복기.md", content_hash: hash.sha256(sourceText), locators: [`INBOX/촬영 복기.md#${start}-${start + claim.length}`], evidence_quote: claim, confidence: "explicit" };
  });
  const guideParagraphs = claims.filter((_claim, index) => !missingGuideParagraph || index !== claims.length - 1)
    .map((claim) => ({ text: claim.text, claim_ids: [claim.claim_id], citation_ids: claim.citation_ids }));
  const guide = { document_kind: "source_guide", title: "촬영 복기 자료 안내", purpose: "원문 촬영 지침", sections: [{ heading: "촬영 지침", claim_ids: claims.map((claim) => claim.claim_id), citation_ids: citations.map((citation) => citation.citation_id), paragraphs: guideParagraphs }], claims, citations };
  const topic = { document_kind: "topic_article", title: "렌즈와 구도", purpose: "장비와 구도 기준", sections: [{ heading: "장비와 구도", paragraphs: claims.slice(0, 2).map((claim) => ({ text: claim.text, claim_ids: [claim.claim_id] })) }], claims: claims.slice(0, 2), citations: citations.slice(0, 2) };
  const files = new Map([["INBOX/촬영 복기.md", sourceText]]);
  const writes = new Map(), creates = [];
  const vault = {
    getAbstractFileByPath: (path) => files.has(path) || writes.has(path) ? { path } : null,
    cachedRead: (file) => Promise.resolve(files.get(file.path) || writes.get(file.path)),
    createFolder: async (path) => writes.set(path, ""),
    create: async (path, bytes) => { creates.push(path); writes.set(path, bytes); },
  };
  let gateCalls = 0, gatedSource = "";
  const orchestrator = api.create({
    vault, hash, analysisScope: { createAnalysisScope: (value) => value },
    chunkManifest: { createChunkManifest: () => ({ chunks: [{ text: sourceText }] }) }, limits: { max_chunks: 4, max_bytes: 24576 },
    gate: { evaluate: (input) => {
      gatedSource = input.source_text;
      return require("../../../../../Views/llmwiki-golden-quality-gate.js").evaluate(input);
    } },
    runPlan: async () => ({ ok: true, pages: sourceOnly ? 0 : 1, map_provider_calls: 1, plan_provider_calls: 0 }),
    compilePlan: async () => ({ ok: true, provider_calls: 0 }),
    getDocuments: () => sourceOnly ? [guide] : [guide, topic],
    onProgress: (progress) => { if (progress.stage === "gating") gateCalls += 1; },
  });
  return { orchestrator, sourceText, sourceClaims, claims, writes, creates, gateCalls: () => gateCalls, gatedSource: () => gatedSource };
}

test("Golden composition keeps topic sections, appends only residual source claims, and gates the full selected source", async () => {
  const f = compositionFixture();
  const result = await f.orchestrator.run({ source_path: "INBOX/촬영 복기.md", expected_content_hash: hash.sha256(f.sourceText) });
  assert.equal(result.ok, true, result.reason);
  assert.equal(result.status, "publishable_preview");
  assert.equal(result.previews.length, 1);
  const receipt = JSON.parse(f.writes.get(result.previews[0].receipt_path));
  assert.deepEqual(receipt.scoped_claim_ids, f.claims.map((claim) => claim.claim_id));
  const preview = f.writes.get(result.previews[0].document_path);
  assert.match(preview, /## 장비와 구도/u);
  assert.match(preview, /## 원문 전용: 촬영 지침/u);
  assert.equal(f.gatedSource(), f.sourceText);
  assert.equal((preview.match(/18mm 렌즈/g) || []).length, 1);
  assert.equal(f.creates.length, 2);
});

test("source-only Golden composition renders all twelve claim-backed guide rows", async () => {
  const f = compositionFixture({ sourceOnly: true });
  const result = await f.orchestrator.run({ source_path: "INBOX/촬영 복기.md" });
  assert.equal(result.ok, true, result.reason);
  const preview = f.writes.get(result.previews[0].document_path);
  assert.equal(f.sourceClaims.every((claim) => preview.includes(claim)), true);
  assert.equal(result.previews.length, 1);
  assert.equal(f.creates.length, 2);
});

test("a missing nonnumeric guide row fails the claim partition before Golden Gate and writes nothing", async () => {
  const f = compositionFixture({ missingGuideParagraph: true });
  const result = await f.orchestrator.run({ source_path: "INBOX/촬영 복기.md" });
  assert.equal(result.ok, false);
  assert.equal(result.status, "review_required");
  assert.equal(result.reason, "claim_partition_incomplete");
  assert.equal(result.gate_calls, 0);
  assert.equal(result.preview_writes, 0);
  assert.equal(result.receipt_writes, 0);
  assert.equal(result.canonical_writes, 0);
  assert.equal(result.source_writes, 0);
  assert.deepEqual(f.creates, []);
});

test("an 18mm omission reaches Golden Gate, fails critical recall, and writes nothing", async () => {
  const f = compositionFixture({ omit18mmFromRenderedClaim: true });
  const result = await f.orchestrator.run({ source_path: "INBOX/촬영 복기.md" });
  assert.equal(result.ok, false);
  assert.equal(result.reason, "golden_gate_failed");
  assert.equal(result.issues.includes("critical_token_missing"), true);
  assert.equal(result.metrics.missing_critical_tokens.includes("18mm"), true);
  assert.equal(result.preview_writes, 0);
  assert.equal(result.receipt_writes, 0);
  assert.equal(result.canonical_writes, 0);
  assert.equal(result.source_writes, 0);
  assert.deepEqual(f.creates, []);
});

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
