'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const ROOT=path.resolve(__dirname,'../../../../../..');
const hash=require(path.join(ROOT,'SYSTEM/Views/llmwiki-hash.js'));
const adapter=require(path.join(ROOT,'SYSTEM/Views/llmwiki-wiki-read-adapter.js'));
const query=require(path.join(ROOT,'SYSTEM/Views/llmwiki-query-readonly.js'));
const source={source_id:'source_recovery_canary',source_path:'INBOX/LLM Wiki Recovery Canary.md',source_text:'# 복구 시험\n\n청록등대-731 검토 원칙: 결정을 저장하기 전에 원문 근거와 변경 내용을 함께 확인한다.\n',title:'복구 시험'};
source.content_hash=hash.sha256(source.source_text);
test('explicit selected source is searchable with body and locator, never verified or ambient INBOX',()=>{
 const s=adapter.buildSelectedSourceSnapshot(source);assert.equal(s.ok,true);assert.equal(s.counts.verified,0);assert.equal(s.counts.literature,1);
 const r=adapter.browseRead({snapshot:s,mode:'literature',query:'청록등대-731',queryRead:query});assert.equal(r.total,1);assert.ok(r.rows[0].statement.includes('원문 근거'));assert.equal(r.rows[0].path,source.source_path);assert.match(r.rows[0].citations[0].locator,/#L1-L/);
 assert.equal(adapter.browseRead({snapshot:s,mode:'verified'}).total,0);
 assert.equal(adapter.buildSnapshot({assets:[{path:source.source_path,type:'literature_note',body:source.source_text}]}).counts.total,0);
 assert.equal(adapter.buildSelectedSourceSnapshot({...source,content_hash:'0'.repeat(64)}).ok,false);
 assert.equal(adapter.buildSelectedSourceSnapshot({...source,source_path:'INBOX/Private/a.md'}).ok,false);
});
module.exports={source};
test('existing browse modes share query types and no-match is not a scope error',()=>{
 const s=adapter.buildSelectedSourceSnapshot(source);
 for(const mode of ['literature','verified','all','pending','legacy_review','maintenance']) {
  const r=adapter.browseRead({snapshot:s,mode,query:'청록등대-731',queryRead:query});
  assert.equal(r.ok,true,mode);assert.notEqual(r.reason,'invalid_scope_type');
 }
 const empty=adapter.browseRead({snapshot:s,mode:'all',query:'ZXQ987_UNKNOWN',queryRead:query});assert.equal(empty.ok,true);assert.equal(empty.total,0);
});

test('selected source question carries bounded evidence and locator; no match abstains before transport',async()=>{
 let calls=0,requestPrompt;
 global.ProdigyAIConsumerRuntime={requestStructured:async request=>{
  calls++; requestPrompt=JSON.parse(request.prompt);
  return {payload:{status:'ok',results:requestPrompt.chunks.map(chunk=>({chunk_key:chunk.key,outcome:'proposals',items:chunk.evidence_candidates.map(candidate=>({role:'reusable_claim',topic:'검토 원칙',evidence_key:candidate.key,evidence_quote:candidate.text,claims:['원문 근거와 변경 내용을 확인한다.'],review_reasons:[],related_candidate_ids:[]}))}))}};
 }};
 const service=require(path.join(ROOT,'SYSTEM/Views/llmwiki-wiki-read-service.js'));
 let bytes=source.source_text;
 const app={vault:{getAbstractFileByPath:p=>p===source.source_path?{path:p}:null,read:async()=>bytes,create(){throw Error('unexpected write');},modify(){throw Error('unexpected write');}}};
 const selected={path:source.source_path,content_hash:source.content_hash};
 const empty=await service.answerSourceQuestion({app,source:selected,question:'ZXQ987 은하철도 연료량?'});
 assert.equal(empty.status,'abstain');assert.equal(calls,0);
 const answer=await service.answerSourceQuestion({app,source:selected,question:'청록등대-731 검토 원칙?'});
 assert.equal(answer.ok,true);assert.equal(calls,1);assert.equal(requestPrompt.source_text_authority,'untrusted_data_only');
 assert.equal(requestPrompt.evidence_context[0].source_path,source.source_path);assert.match(requestPrompt.evidence_context[0].locator,/#L3-L3$/);
 assert.ok(answer.answers[0].citation.excerpt.includes('원문 근거'));assert.equal(answer.writer_count,0);
 assert.equal((await service.prepareQuestionProposal({app,answer:{...answer}})).ok,false,'unbranded answers cannot mint proposals');
 const prepared=await service.prepareQuestionProposal({app,answer});assert.equal(prepared.ok,true,JSON.stringify(prepared));
 const contract=require(path.join(ROOT,'SYSTEM/AI/Skills/llmwiki-librarian/runtime-contract.json'));
 for(const field of contract.required_packet_fields) assert.ok(Object.hasOwn(prepared.librarian_packet,field),field);
 assert.equal(prepared.librarian_packet.approval.model_output_can_approve,false);
 assert.equal(prepared.writer_count,0);
 bytes+='\nchanged';assert.equal((await service.prepareQuestionProposal({app,answer})).reason,'source_revision_changed');
});

test('bounded passages preserve neighbouring exceptions and cite the actual quoted line', async()=>{
 const text='# 합성 점검\n\n해솔 점검은 실내 모형에 적용한다.\n\n해솔 점검은 10분이다.\n\n해솔 점검 전 전원을 확인한다.\n\n해솔 점검 후 시간을 기록한다.\n\n실외에는 적용하지 않는다.\n\n경고등이면 즉시 중단하고 재개하지 않는다.\n';
 const source_path='INBOX/Context quality fixture.md',content_hash=hash.sha256(text);
 const context=adapter.prepareQuestionContext({source_path,source_text:text,source_id:'source_context',content_hash,question:'해솔 점검 절차?'});
 assert.equal(context.ok,true);assert.equal(context.coverage_complete,true);assert.equal(context.evidence.length,1);
 assert.ok(context.evidence[0].excerpt.includes('실외에는'));assert.ok(context.evidence[0].excerpt.includes('재개하지 않는다'));
 assert.ok(Buffer.byteLength(context.evidence[0].excerpt)<=2048);
 global.ProdigyAIConsumerRuntime=global.ProdigyAIConsumerRuntime||{};
 global.ProdigyAIConsumerRuntime.requestStructured=async request=>{
  const p=JSON.parse(request.prompt);return {payload:{status:'ok',results:p.chunks.map(c=>({chunk_key:c.key,outcome:'hold',items:c.evidence_candidates.map((e,i)=>({role:i===1?'reusable_claim':'hold',topic:'시간',evidence_key:e.key,evidence_quote:e.text,claims:i===1?['해솔 점검은 10분이다.']:[],review_reasons:[],related_candidate_ids:[]}))}))}};
 };
 const service=require(path.join(ROOT,'SYSTEM/Views/llmwiki-wiki-read-service.js'));
 const result=await service.answerSourceQuestion({app:{vault:{getAbstractFileByPath:p=>({path:p}),read:async()=>text}},source:{path:source_path,content_hash},question:'해솔 점검 시간?'});
 assert.equal(result.ok,true);assert.equal(result.answers.length,1);assert.equal(result.answers[0].citation.locator,source_path+'#L5-L5');
 assert.equal(text.slice(result.answers[0].citation.start,result.answers[0].citation.start+result.answers[0].citation.excerpt.length),result.answers[0].citation.excerpt);
});

test('proposal and review document preserve every grounded condition and unresolved review note',async()=>{
 const text='# 조건 시험\n\n해솔 점검은 실내에만 적용한다.\n\n해솔 점검은 실외 금지다.\n\n해솔 규정 A는 10분이다.\n\n해솔 규정 B는 20분이다.\n';
 const sourcePath='INBOX/Proposal preservation fixture.md';let calls=0;
 global.ProdigyAIConsumerRuntime=global.ProdigyAIConsumerRuntime||{};
 global.ProdigyAIConsumerRuntime.requestStructured=async request=>{
  calls++;const p=JSON.parse(request.prompt);return {payload:{status:'ok',results:p.chunks.map(c=>({chunk_key:c.key,outcome:'proposals',items:c.evidence_candidates.map(e=>({role:'reusable_claim',topic:'해솔',evidence_key:e.key,evidence_quote:e.text,claims:[e.text],review_reasons:['규정 간 우선순위가 확인되지 않았다.'],related_candidate_ids:[]}))}))}};
 };
 const app={vault:{getAbstractFileByPath:p=>({path:p}),read:async()=>text}};
 const service=require(path.join(ROOT,'SYSTEM/Views/llmwiki-wiki-read-service.js'));
 const answer=await service.answerSourceQuestion({app,source:{path:sourcePath,content_hash:hash.sha256(text)},question:'해솔 조건은?'});
 const prepared=await service.prepareQuestionProposal({app,answer});assert.equal(prepared.ok,true);
 assert.equal(prepared.proposal_bundle.proposals[0].claims.length,4);
 const materializer=require(path.join(ROOT,'SYSTEM/Views/llmwiki-inbox-proposal-materializer.js')).createInboxProposalMaterializer();
 let proposals=[];const controller={getSnapshot:()=>({risk_packets:proposals}),openPreparedRiskReview(input){proposals=input.proposals;return {ok:true};}};
 const handoff=await service.handoffQuestionProposal({app,proposal:prepared,materializer,controller});
 assert.equal(handoff.ok,true,JSON.stringify(handoff));assert.equal(proposals.length,1);
 const body=proposals[0].document.body;
 for(const item of answer.answers) assert.ok(body.includes(item.text),item.text);
 assert.match(body,/## 확인 필요/);assert.match(body,/우선순위가 확인되지/);
 assert.equal(calls,1,'proposal and handoff reuse the answer evidence');
 assert.equal(handoff.writer_count,0);
});

test('conversation forwards history as context with explicit source scope and no invented evidence',async()=>{
 const texts={'INBOX/Conversation A.md':'# 해솔 자료 A\n\n해솔 절차: 실내는 10분이다.\n\n해솔 절차: 실외 적용 금지다.\n','INBOX/Conversation B.md':'# 해솔 자료 B\n\n해솔 절차: 야외 시험은 20분이다.\n'};
 const prompts=[];global.ProdigyAIConsumerRuntime.requestStructured=async request=>{
  const p=JSON.parse(request.prompt);prompts.push(p);return {payload:{status:'ok',results:p.chunks.map(c=>({chunk_key:c.key,outcome:'proposals',items:c.evidence_candidates.map(e=>({role:'reusable_claim',topic:'해솔',evidence_key:e.key,evidence_quote:e.text,claims:[e.text],review_reasons:[],related_candidate_ids:[]}))}))}};
 };
 const app={vault:{getAbstractFileByPath:p=>texts[p]?{path:p}:null,read:async f=>texts[f.path]}};
 const service=require(path.join(ROOT,'SYSTEM/Views/llmwiki-wiki-read-service.js'));
 const sources=Object.entries(texts).map(([path,body])=>({path,content_hash:hash.sha256(body)}));
 const history=[{role:'user',body:'해솔 절차를 정리해줘.'},{role:'assistant',body:'1. 실내 10분\n2. 실외 금지'},{role:'user',body:'내 조건은 실내가 아니라 실외야.'}];
 const answer=await service.answerSourceQuestion({app,sources,history,question:'두 번째 조건과 B의 차이는?'});
 assert.equal(answer.ok,true,JSON.stringify(answer));assert.deepEqual(prompts[0].conversation_history,history);
 assert.equal(new Set(prompts[0].evidence_context.map(row=>row.source_path)).size,2);
 assert.match(prompts[0].history_authority,/never independent evidence/);
 assert.ok(answer.answers.some(row=>row.citation.source_path===sources[1].path));
 const reduced=await service.answerSourceQuestion({app,sources:[sources[0]],history:[],question:'해솔 절차는?'});
 assert.equal(reduced.ok,true);assert.equal(prompts[1].evidence_context.some(row=>row.source_path===sources[1].path),false);
 assert.deepEqual(prompts[1].conversation_history,[]);
 const proposal=await service.prepareQuestionProposal({app,answer});assert.equal(proposal.ok,true);assert.equal(proposal.proposal_bundle.proposals[0].source_citations.length,2);
 const limited=await service.answerSourceQuestion({app,sources,history:[{role:'user',body:'x'.repeat(70000)}],question:'해솔?'});assert.equal(limited.reason,'context_limit');assert.equal(prompts.length,2);
});

test('verified Wiki context requires actual finalized reader authority and exact current bytes',async()=>{
 const {createTrustedFixture}=require('./fixtures/llmwiki-canonical-v2-trust-fixture.js');const genuine=await createTrustedFixture();
 const input={source_path:genuine.path,source_text:genuine.bytes,source_id:'source_verified_question',content_hash:genuine.revision,question:genuine.document.statement,verified_row:genuine.row};
 const context=adapter.prepareQuestionContext(input);assert.equal(context.ok,true,JSON.stringify(context));assert.ok(context.evidence.length);assert.equal(context.evidence[0].trust,'verified');assert.ok(context.evidence[0].provenance.length);
 assert.equal(adapter.prepareQuestionContext({...input,verified_row:{...genuine.row}}).reason,'verified_source_required');
 assert.equal(adapter.prepareQuestionContext({...input,source_text:genuine.bytes+'changed'}).reason,'verified_source_required');
});

test('verified answer proposal restores accepted claim lineage to original source, never Wiki-as-source',async()=>{
 const {createTrustedFixture}=require('./fixtures/llmwiki-canonical-v2-trust-fixture.js');const genuine=await createTrustedFixture();
 await genuine.app.vault.create('ZETA/LITERATURE/fixture.md',genuine.source.source_text);
 global.ProdigyAIConsumerRuntime=global.ProdigyAIConsumerRuntime||{};
 global.ProdigyAIConsumerRuntime.requestStructured=async request=>{
  const p=JSON.parse(request.prompt);return {payload:{status:'ok',results:p.chunks.map(c=>({chunk_key:c.key,outcome:'hold',items:c.evidence_candidates.map(e=>({role:e.text.includes(genuine.document.statement)?'reusable_claim':'hold',topic:'Approved statement',evidence_key:e.key,evidence_quote:e.text,claims:e.text.includes(genuine.document.statement)?[genuine.document.statement]:[],review_reasons:[],related_candidate_ids:[]}))}))}};
 };
 const service=require(path.join(ROOT,'SYSTEM/Views/llmwiki-wiki-read-service.js'));
 const answer=await service.answerSourceQuestion({app:genuine.app,includeVerified:true,question:'source-bound active?'});assert.equal(answer.ok,true,JSON.stringify(answer));assert.equal(answer.answers.length,1);
 const prepared=await service.prepareQuestionProposal({app:genuine.app,answer});assert.equal(prepared.ok,true,JSON.stringify(prepared));assert.equal(prepared.uses_canonical_provenance,true);
 assert.equal(prepared.grounded_claims[0].citations[0].source_path,'ZETA/LITERATURE/fixture.md');assert.equal(prepared.grounded_claims[0].citations[0].content_hash,hash.sha256(genuine.source.source_text));
 assert.equal(prepared.grounded_claims[0].citations[0].evidence_quote,genuine.source.source_text);
 await genuine.app.vault.modify(genuine.app.vault.getAbstractFileByPath('ZETA/LITERATURE/fixture.md'),'changed');
 assert.equal((await service.prepareQuestionProposal({app:genuine.app,answer})).reason,'source_revision_changed');
});

test('populated verified Wiki context excludes frontmatter hashes without losing exact body locators',async()=>{
 const {createTrustedFixture}=require('./fixtures/llmwiki-canonical-v2-trust-fixture.js');
 const body='# Fixture authority\n\nThe approved v2 item is source-bound and active.\n';
 const genuine=await createTrustedFixture({body});
 const context=adapter.prepareQuestionContext({source_path:genuine.path,source_text:genuine.bytes,source_id:'source_verified_body',content_hash:genuine.revision,question:'source-bound active?',verified_row:genuine.row});
 assert.equal(context.ok,true);assert.equal(context.evidence.length,1);
 const c=context.evidence[0];assert.equal(c.excerpt,'The approved v2 item is source-bound and active.');assert.equal(genuine.bytes.slice(c.start,c.start+c.excerpt.length),c.excerpt);
 assert.equal(c.excerpt.includes('claim_set_hash'),false);assert.equal(c.excerpt.includes('schema_version'),false);assert.match(c.locator,/#L\d+-L\d+$/);
});

function currentRuntimeFixture(t, payloadFor) {
 const consumerPath=path.join(ROOT,'SYSTEM/Views/prodigy-ai-consumer-runtime.js'),providerPath=path.join(ROOT,'SYSTEM/Views/llmwiki-batch-provider.js');
 const previous={consumer:global.ProdigyAIConsumerRuntime,provider:global.LLMWikiBatchProvider};
 require(path.join(ROOT,'SYSTEM/Views/prodigy-ai-consumer-manifests.js'));
 const client=require(path.join(ROOT,'SYSTEM/Views/prodigy-ai-client.js'));
 delete require.cache[require.resolve(consumerPath)];delete require.cache[require.resolve(providerPath)];
 require(consumerPath);require(providerPath);
 t.after(()=>{global.ProdigyAIConsumerRuntime=previous.consumer;global.LLMWikiBatchProvider=previous.provider;});
 const calls=[];let grants=0,writes=0;
 const runtime={api:{getHandshake:()=>({plugin_id:'prodigy-ai-runtime',protocol_version:client.PROTOCOL_VERSION,protocol_hash:client.PROTOCOL_HASH,runtime_epoch:'synthetic-current-epoch',consumer_manifest_range:'>=1 <2',capabilities:['structured-strict','chat-text']}),getStatus:()=>({status:'ready'}),listProviders:()=>[],listModels:()=>[],resolveProvider:()=>({status:'ready',profile_id:'synthetic-current-profile'}),getConsentRequirement:()=>({status:'ready'}),grantConsumer:()=>{grants++;throw Error('test must not grant consent');},requestStructured:async request=>{calls.push(request);return {protocol_version:client.PROTOCOL_VERSION,runtime_epoch:'synthetic-current-epoch',request_id:request.request_id,status:'completed',payload:payloadFor(request),receipt:{consumer_id:request.consumer_id,attempt_id:request.attempt_id}};},requestChat:async()=>{throw Error('unexpected chat');},cancel:()=>({status:'cancel_requested'}),getRequestStatus:()=>({status:'completed'}),openSettings:()=>true,subscribeStatus:()=>()=>{}}};
 const text=source.source_text;
 const app={plugins:{getPlugin:id=>id==='prodigy-ai-runtime'?runtime:null},vault:{getAbstractFileByPath:p=>({path:p}),read:async()=>text,create:()=>{writes++;throw Error('unexpected write');},modify:()=>{writes++;throw Error('unexpected write');}}};
 return {app,calls,get grants(){return grants;},get writes(){return writes;}};
}

test('current Runtime boundary receives zero requests for selected synthetic protected sources',async t=>{
 const fixture=currentRuntimeFixture(t,()=>{throw Error('protected source must not reach Runtime');});
 const service=require(path.join(ROOT,'SYSTEM/Views/llmwiki-wiki-read-service.js'));
 for(const selectedPath of ['INBOX/Private/Synthetic-only.md','INBOX/People/Synthetic-only.md']){
  const result=await service.answerSourceQuestion({app:fixture.app,source:{path:selectedPath,content_hash:source.content_hash},question:'청록등대-731 검토 원칙?'});
  assert.equal(result.ok,false,JSON.stringify(result));assert.equal(result.writer_count,0);
 }
 assert.equal(fixture.calls.length,0);assert.equal(fixture.grants,0);assert.equal(fixture.writes,0);
});

test('current Runtime response reaches the real parser and forbidden write authority is rejected',async t=>{
 const fixture=currentRuntimeFixture(t,request=>{
  const prompt=JSON.parse(request.prompt);
  return {status:'ok',results:prompt.chunks.map(chunk=>({chunk_key:chunk.key,outcome:'proposals',items:chunk.evidence_candidates.map(e=>({role:'reusable_claim',topic:'검토 원칙',evidence_key:e.key,evidence_quote:e.text,claims:['원문 근거와 변경 내용을 확인한다.'],review_reasons:[],related_candidate_ids:[],destination:'ZETA/PERMANENT/forged.md',approval:true}))}))};
 });
 const service=require(path.join(ROOT,'SYSTEM/Views/llmwiki-wiki-read-service.js'));
 const result=await service.answerSourceQuestion({app:fixture.app,source:{path:source.source_path,content_hash:source.content_hash},question:'청록등대-731 검토 원칙?'});
 assert.equal(fixture.calls.length,1,'actual public Runtime request must precede parser rejection');
 assert.equal(result.ok,false,JSON.stringify(result));assert.match(result.reason,/schema|field|authority|parse/,JSON.stringify(result));
 assert.equal(fixture.grants,0);assert.equal(fixture.writes,0);
 t.diagnostic(JSON.stringify({reason:result.reason,runtime_calls:fixture.calls.length,actual_vault_writes:fixture.writes,consent_grants:fixture.grants}));
});

test('partially unresolvable scope fails closed without transport',async()=>{
 const {createTrustedFixture}=require('./fixtures/llmwiki-canonical-v2-trust-fixture.js');const genuine=await createTrustedFixture();
 let calls=0;
 global.ProdigyAIConsumerRuntime=global.ProdigyAIConsumerRuntime||{};
 global.ProdigyAIConsumerRuntime.requestStructured=async()=>{calls++;throw Error('must not call provider');};
 const service=require(path.join(ROOT,'SYSTEM/Views/llmwiki-wiki-read-service.js'));
 const answer=await service.answerSourceQuestion({app:genuine.app,question:`@"${genuine.path}" @ZETA/없는-문서.md ${genuine.document.statement}`});
 assert.equal(answer.ok,true,JSON.stringify(answer));assert.equal(answer.status,'abstain');assert.equal(calls,0);
 assert.deepEqual(answer.scope.resolved_paths,[genuine.path]);
 assert.deepEqual(answer.scope.unresolved_paths,['ZETA/없는-문서.md']);
});
test('canonical privacy markers are never readable as Wiki scope',()=>{
 const service=require(path.join(ROOT,'SYSTEM/Views/llmwiki-wiki-read-service.js'));
 const adapter=require(path.join(ROOT,'SYSTEM/Views/llmwiki-wiki-read-adapter.js'));
 assert.equal(adapter.isPrivacyHeldCanonical({path:'ZETA/PERMANENT/notes.md',privacy:'private'}),true);
 assert.equal(adapter.isPrivacyHeldCanonical({path:'ZETA/PERMANENT/notes.md',private:true}),true);
 assert.equal(adapter.isPrivacyHeldCanonical({path:'ZETA/Private/notes.md'}),true);
 assert.equal(adapter.isPrivacyHeldCanonical({path:'CONTACTS/someone.md'}),true);
 assert.equal(adapter.isPrivacyHeldCanonical({path:'ZETA/PERMANENT/notes.md',type:'person'}),true);
 assert.equal(adapter.isPrivacyHeldCanonical({path:'ZETA/PERMANENT/notes.md',type:'person',llmwiki_outbound:'allow'}),false);
 assert.equal(adapter.isPrivacyHeldCanonical({path:'ZETA/PERMANENT/notes.md',knowledge_domain:'coding'}),false);
 assert.equal(service.parseDocMentions('x').length,0);
});
test('privacy-held verified rows resolve to neither readable nor reported scope',async()=>{
 const realApi=require(path.join(ROOT,'SYSTEM/Views/llmwiki-resurfacing-read-adapter.js'));
 const realCreate=realApi.create.bind(realApi);
 const held={path:'ZETA/PERMANENT/비공개.md',canonical_revision:'h'.repeat(64),privacy:'private',sources:[],canonical_bytes:'x'};
 global.LLMWikiResurfacingReadAdapter={create:()=>{const svc=realCreate();return {...svc,read:async()=>({ok:true,rows:[held]})};}};
 try{
  const service=require(path.join(ROOT,'SYSTEM/Views/llmwiki-wiki-read-service.js'));
  const app={vault:{getAbstractFileByPath:()=>null}};
  const scoped=await service.resolveReadableWikiScope({app,verified_paths:['ZETA/PERMANENT/비공개.md','ZETA/없는-문서.md']});
  assert.equal(scoped.ok,true);
  assert.equal(scoped.status,'empty');
  assert.deepEqual(scoped.rows,[]);
  assert.deepEqual(scoped.unresolved,['ZETA/없는-문서.md']);
 }finally{delete global.LLMWikiResurfacingReadAdapter;}
});
test('finalized authority changing mid-request fails publication without history',async()=>{
 const {createTrustedFixture}=require('./fixtures/llmwiki-canonical-v2-trust-fixture.js');const genuine=await createTrustedFixture();
 await genuine.app.vault.create('ZETA/LITERATURE/fixture.md',genuine.source.source_text);
 const realApi=require(path.join(ROOT,'SYSTEM/Views/llmwiki-resurfacing-read-adapter.js'));
 const realCreate=realApi.create.bind(realApi);
 let release=null;
 const readCounter={count:0};
 global.LLMWikiResurfacingReadAdapter={create:()=>{const svc=realCreate();const origRead=svc.read.bind(svc);return {...svc,read:async(opts)=>{readCounter.count++;const res=await origRead(opts);if(readCounter.count>=2&&res.ok)return {...res,rows:res.rows.map(r=>({...r,canonical_revision:'e'.repeat(64)}))};return res;}};}};
 try{
  global.ProdigyAIConsumerRuntime=global.ProdigyAIConsumerRuntime||{};
  global.ProdigyAIConsumerRuntime.requestStructured=(request)=>new Promise((resolve)=>{release=()=>resolve({payload:{status:'ok',results:JSON.parse(request.prompt).chunks.map(c=>({chunk_key:c.key,outcome:'hold',items:c.evidence_candidates.map(e=>({role:'reusable_claim',topic:'t',evidence_key:e.key,evidence_quote:e.text,claims:[genuine.document.statement],review_reasons:[],related_candidate_ids:[]}))}))}});});
  const service=require(path.join(ROOT,'SYSTEM/Views/llmwiki-wiki-read-service.js'));
  const pending=service.answerSourceQuestion({app:genuine.app,includeVerified:true,verified_paths:[genuine.path],question:genuine.document.statement});
  await new Promise((resolve)=>setTimeout(resolve,50));
  console.log("READS:", global.__reads);
  release();
  const answer=await pending;
  assert.equal(answer.ok,false,JSON.stringify(answer));
  assert.equal(answer.reason,'source_revision_changed');
 }finally{delete global.LLMWikiResurfacingReadAdapter;}
});
test('verified_paths narrows Wiki scope to the exact row only',async()=>{
 const {createTrustedFixture}=require('./fixtures/llmwiki-canonical-v2-trust-fixture.js');const genuine=await createTrustedFixture();
 await genuine.app.vault.create('ZETA/LITERATURE/fixture.md',genuine.source.source_text);
 let calls=0;
 global.ProdigyAIConsumerRuntime=global.ProdigyAIConsumerRuntime||{};
 global.ProdigyAIConsumerRuntime.requestStructured=async request=>{
  calls++;const p=JSON.parse(request.prompt);return {payload:{status:'ok',results:p.chunks.map(c=>({chunk_key:c.key,outcome:'hold',items:c.evidence_candidates.map(e=>({role:'reusable_claim',topic:'Approved statement',evidence_key:e.key,evidence_quote:e.text,claims:[genuine.document.statement],review_reasons:[],related_candidate_ids:[]}))}))}};
 };
 const service=require(path.join(ROOT,'SYSTEM/Views/llmwiki-wiki-read-service.js'));
 const answer=await service.answerSourceQuestion({app:genuine.app,includeVerified:true,verified_paths:[genuine.path],question:genuine.document.statement});
 assert.equal(answer.ok,true,JSON.stringify(answer));assert.equal(calls,1);
 assert.deepEqual(answer.scope.resolved_paths,[genuine.path]);assert.deepEqual(answer.scope.unresolved_paths,[]);
 assert.ok(answer.answers.length);
});
test('unresolvable verified scope abstains explicitly without transport',async()=>{
 const {createTrustedFixture}=require('./fixtures/llmwiki-canonical-v2-trust-fixture.js');const genuine=await createTrustedFixture();
 let calls=0;
 global.ProdigyAIConsumerRuntime=global.ProdigyAIConsumerRuntime||{};
 global.ProdigyAIConsumerRuntime.requestStructured=async()=>{calls++;throw Error('must not call provider');};
 const service=require(path.join(ROOT,'SYSTEM/Views/llmwiki-wiki-read-service.js'));
 const answer=await service.answerSourceQuestion({app:genuine.app,question:'어떤 내용인가? @ZETA/없는-문서.md @../vault-secret.md',verified_paths:['ZETA/없는-문서.md']});
 assert.equal(answer.ok,true,JSON.stringify(answer));assert.equal(answer.status,'abstain');assert.equal(calls,0);
 assert.deepEqual(answer.scope.unresolved_paths,['ZETA/없는-문서.md','../vault-secret.md']);
 assert.deepEqual(answer.scope.resolved_paths,[]);
});
test('at-doc mention scopes the question to that verified row without the toggle',async()=>{
 const {createTrustedFixture}=require('./fixtures/llmwiki-canonical-v2-trust-fixture.js');const genuine=await createTrustedFixture();
 await genuine.app.vault.create('ZETA/LITERATURE/fixture.md',genuine.source.source_text);
 let calls=0;
 global.ProdigyAIConsumerRuntime=global.ProdigyAIConsumerRuntime||{};
 global.ProdigyAIConsumerRuntime.requestStructured=async request=>{
  calls++;const p=JSON.parse(request.prompt);return {payload:{status:'ok',results:p.chunks.map(c=>({chunk_key:c.key,outcome:'hold',items:c.evidence_candidates.map(e=>({role:'reusable_claim',topic:'Approved statement',evidence_key:e.key,evidence_quote:e.text,claims:[genuine.document.statement],review_reasons:[],related_candidate_ids:[]}))}))}};
 };
 const service=require(path.join(ROOT,'SYSTEM/Views/llmwiki-wiki-read-service.js'));
 const answer=await service.answerSourceQuestion({app:genuine.app,question:`@"${genuine.path}" ${genuine.document.statement}`});
 assert.equal(answer.ok,true,JSON.stringify(answer));assert.equal(calls,1);
 assert.deepEqual(answer.scope.resolved_paths,[genuine.path]);
});
test('canonical path in the untrusted source slot stays blocked',async()=>{
 const {createTrustedFixture}=require('./fixtures/llmwiki-canonical-v2-trust-fixture.js');const genuine=await createTrustedFixture();
 let calls=0;
 global.ProdigyAIConsumerRuntime=global.ProdigyAIConsumerRuntime||{};
 global.ProdigyAIConsumerRuntime.requestStructured=async()=>{calls++;throw Error('must not call provider');};
 const service=require(path.join(ROOT,'SYSTEM/Views/llmwiki-wiki-read-service.js'));
 const blocked=await service.answerSourceQuestion({app:genuine.app,source:{path:genuine.path,content_hash:genuine.revision},question:genuine.document.statement});
 assert.equal(blocked.ok,false);assert.equal(blocked.reason,'source_privacy_blocked');assert.equal(calls,0);
});
test('parseDocMentions extracts exact paths once and strips trailing punctuation',()=>{
 const service=require(path.join(ROOT,'SYSTEM/Views/llmwiki-wiki-read-service.js'));
 assert.deepEqual(service.parseDocMentions('@ZETA/A.md 무엇인가?'),['ZETA/A.md']);
 assert.deepEqual(service.parseDocMentions('비교해줘 @ZETA/A.md, @ZETA/B.md.'),['ZETA/A.md','ZETA/B.md']);
 assert.deepEqual(service.parseDocMentions('@ZETA/A.md @ZETA/A.md'),['ZETA/A.md']);
 assert.deepEqual(service.parseDocMentions('@"ZETA/My Doc.md" 무엇인가?'),['ZETA/My Doc.md']);
 assert.deepEqual(service.parseDocMentions('멘션 없이 질문'),[]);
});

test('verified evidence bearing secrets is withheld before transport',async()=>{
 const {createTrustedFixture}=require('./fixtures/llmwiki-canonical-v2-trust-fixture.js');
 const genuine=await createTrustedFixture({body:'# Fixture authority\n\nThe approved item is active.\n\n임시 키 기록: api_key = "abcdefgh12345678"\n'});
 const context=adapter.prepareQuestionContext({source_path:genuine.path,source_text:genuine.bytes,source_id:'source_secret_probe',content_hash:genuine.revision,question:'임시 키 기록은?',verified_row:genuine.row});
 assert.equal(context.ok,true,JSON.stringify(context));
 assert.equal(context.status,'abstain');
 assert.equal(context.evidence.length,0);
});
test('changed finalized authority between analysis and publication fails the answer',async()=>{
 const {createTrustedFixture}=require('./fixtures/llmwiki-canonical-v2-trust-fixture.js');const genuine=await createTrustedFixture();
 await genuine.app.vault.create('ZETA/LITERATURE/fixture.md',genuine.source.source_text);
 const realApi=require(path.join(ROOT,'SYSTEM/Views/llmwiki-resurfacing-read-adapter.js'));
 const realCreate=realApi.create.bind(realApi);
 let reads=0;
 global.LLMWikiResurfacingReadAdapter={create:()=>{const svc=realCreate();const origRead=svc.read.bind(svc);return {...svc,read:async(opts)=>{reads++;const res=await origRead(opts);if(reads>=2&&res.ok)return {...res,rows:res.rows.map(r=>({...r,canonical_revision:'f'.repeat(64)}))};return res;}};}};
 try{
  global.ProdigyAIConsumerRuntime=global.ProdigyAIConsumerRuntime||{};
  global.ProdigyAIConsumerRuntime.requestStructured=async request=>{
   const p=JSON.parse(request.prompt);return {payload:{status:'ok',results:p.chunks.map(c=>({chunk_key:c.key,outcome:'hold',items:c.evidence_candidates.map(e=>({role:'reusable_claim',topic:'t',evidence_key:e.key,evidence_quote:e.text,claims:[genuine.document.statement],review_reasons:[],related_candidate_ids:[]}))}))}};
  };
  const service=require(path.join(ROOT,'SYSTEM/Views/llmwiki-wiki-read-service.js'));
  const answer=await service.answerSourceQuestion({app:genuine.app,includeVerified:true,verified_paths:[genuine.path],question:genuine.document.statement});
  assert.equal(answer.ok,false,JSON.stringify(answer));
  assert.equal(answer.reason,'source_revision_changed');
 }finally{delete global.LLMWikiResurfacingReadAdapter;}
});
