"use strict";
const test = require("node:test"), assert = require("node:assert/strict"), path = require("node:path");
const V = path.resolve(__dirname, "../../../../../Views");
const review = require(path.join(V, "llmwiki-document-canonical-review.js"));
test("pure helpers behave by contract", () => {
  assert.deepEqual(review.autofillables().sort(), ["application_contexts", "application_trigger", "classification", "conditions", "definition", "exclusions", "invalidation_conditions", "knowledge_domain", "knowledge_kind", "knowledge_topics", "outcome", "rationale", "steps"].sort());
  assert.equal(review.autofillables().includes("relation_status"), false);
  assert.equal(review.autofillables().includes("evidence_strength"), false);
  assert.equal(review.isNovelItem({ related_knowledge: [] }), true);
  assert.equal(review.isNovelItem({}), true);
  assert.equal(review.isNovelItem({ related_knowledge: [{ title: "x" }] }), false);
});
const store = require(path.join(V, "knowledge-candidate-store.js"));
const hash = require(path.join(V, "llmwiki-hash.js"));
const jobs = require(path.join(V, "llmwiki-batch-job-store.js"));
const registry = require(path.join(V, "knowledge-explorer-registry.js"));
async function jobBackedFlow(app, item, keySuffix = "") {
 const disk = new Map();
 const storage = {exists:async k=>disk.has(k),read:async k=>disk.get(k),writeAtomic:async(k,v)=>disk.set(k,v),quarantine:async()=>{throw new Error('unexpected corrupt job');}};
 const jobStore = {...jobs.createBatchJobStore({storage})};await jobStore.load();
 const citation = item.grounded_claims[0].citations[0];
 const job = await jobStore.createJob({request_key:hash.sha256(`no-change-fixture-${item.review_id}${keySuffix}`),sources:[{source_id:citation.source_id,revision_hash:citation.content_hash}]});
 await jobStore.savePlanSnapshot({job_id:job.job_id,source_id:citation.source_id,source_revision:citation.content_hash,inventory_hash:hash.sha256(JSON.stringify(item.grounded_claims)),plan_hash:hash.sha256(item.document_body),plan_revision:1,status:'compiled',plan:{plan_version:'fixture_document_v1',pages:[]}});
 return review.create({app,jobStore,jobId:job.job_id});
}
function vault() {
 const files = new Map();
 const app = { vault: { getAbstractFileByPath: p => files.get(p) || null, getFiles: () => [...files.values()], read: async f => f.bytes, createFolder: async () => {}, create: async (p,b) => { const f={path:p,bytes:b,extension:p.endsWith('.md')?'md':'json',basename:p.split('/').pop().replace(/\.md$/u,'')}; files.set(p,f);return f; },modify:async(f,b)=>{f.bytes=b;},delete:async f=>files.delete(f.path) }, metadataCache:{getFileCache:f=>{try{return {frontmatter:store.parseLifecycleDocument(f.bytes)}}catch(_){return {frontmatter:{}}}}} }; return {app, files};
}
const fields = {knowledge_kind:'claim',knowledge_domain:'coding',knowledge_topics:'ai',application_trigger:'모형 점검',application_contexts:'coding/ai',conditions:'실내 모형',invalidation_conditions:'원문 변경',relation_status:'resolved',classification:'epistemic',evidence_strength:'sufficient'};
async function item(app, suffix, text) { const p=`ZETA/LITERATURE/review-${suffix}.md`; await app.vault.create(p,text);return {review_id:`review_${suffix}`,title:'모형 점검',document_body:`## 점검 ${suffix}\n${text}\n`,grounded_claims:[{text,citations:[{source_id:`source_${suffix}`,source_path:p,locator:`${p}#L1`,content_hash:hash.sha256(text),evidence_quote:text}]}]}; }
test('compiled document creates, updates same Markdown and is read back as trusted', async()=>{
 const {app,files}=vault(); const a=await item(app,'aaa','실내 모형 점검은 10분이다.');const flow=await jobBackedFlow(app,a);
 const p=await flow.prepare({item:a,fields});assert.equal(p.ok,true,JSON.stringify(p));
 assert.equal([...files.keys()].filter(p=>p.startsWith('ZETA/PERMANENT')).length,0);
 const applied=await flow.apply(p.value,{approved:true,claims_accepted:true,packet_hash:p.value.packet_hash});assert.equal(applied.ok,true,JSON.stringify(applied));
 const before=files.get(applied.target_path).bytes;
 const b=await item(app,'bbb','경고등이 켜지면 즉시 중단한다.');
 const q=await flow.prepare({item:b,fields,target_path:applied.target_path});assert.equal(q.ok,true,JSON.stringify(q));
 assert.ok(q.value.after.includes(a.grounded_claims[0].text));assert.ok(q.value.after.includes(b.grounded_claims[0].text));
 const updated=await flow.apply(q.value,{approved:true,claims_accepted:true,packet_hash:q.value.packet_hash});assert.equal(updated.ok,true,JSON.stringify(updated));
 assert.equal((await flow.targets()).length,1);assert.notEqual(before,files.get(applied.target_path).bytes);
 const repeat=await flow.prepare({item:b,fields,target_path:applied.target_path});assert.equal(repeat.status,'no_change',JSON.stringify(repeat));
 assert.equal(files.get(applied.target_path).bytes.split(b.document_body.trim()).length-1,1);
});
test('update against applied derived claims skips identical evidence without crashing',async()=>{
 const {app,files}=vault();const a=await item(app,'dup','실내 모형 점검은 10분이다.');const flow=await jobBackedFlow(app,a);
 const p=await flow.prepare({item:a,fields});assert.equal(p.ok,true,JSON.stringify(p));
 const first=await flow.apply(p.value,{approved:true,claims_accepted:true,packet_hash:p.value.packet_hash});assert.equal(first.ok,true,JSON.stringify(first));
 const q=await flow.prepare({item:a,fields:{...fields,conditions:'실내 모형 보완'},target_path:first.target_path});
 assert.equal(q.ok,true,JSON.stringify(q));
 assert.equal(q.status,'review');
 assert.equal(q.value.target_path,first.target_path);
 assert.equal([...files.keys()].filter(p=>p.startsWith('ZETA/PERMANENT')).length,1);
});
test('compiled update inserts only new sections without draft frontmatter or title duplication',async()=>{
 const {app,files}=vault(),flow=review.create({app});
 const a=await item(app,'base','실내 모형만 점검한다.');
 const p=await flow.prepare({item:a,fields});assert.equal(p.ok,true,JSON.stringify(p));
 const first=await flow.apply(p.value,{approved:true,claims_accepted:true,packet_hash:p.value.packet_hash});assert.equal(first.ok,true,JSON.stringify(first));
 const target=first.target_path;
 const addition='점검 기록에는 장치 식별자를 함께 적는다.';
 const addId='claim_deadbeefdeadbeefdeadbeef';
 const addHash=hash.sha256(addition);
 const b={review_id:'review_add',title:'실내 모형 점검',document_body:'---\ntags:\n  - knowledge/general/reference\n---\n# 실내 모형 점검\n\n## 점검 기록\n\n점검 기록에는 장치 식별자를 함께 적는다.\n',plan_purpose:'보완',related_knowledge:[],
 compiled_sections:[{heading:'점검 기록',paragraphs:[{text:addition,claim_ids:[addId]}]}],
 grounded_claims:[{claim_id:addId,text:addition,citations:[{source_id:'source_add',source_path:'INBOX/add.md',locator:'INBOX/add.md#L1',content_hash:addHash,evidence_quote:addition}]}]};
 await app.vault.create('INBOX/add.md',addition);
 const q=await flow.prepare({item:b,fields,target_path:target});
 assert.equal(q.ok,true,JSON.stringify(q));
 assert.equal(q.status,'review');
 assert.deepEqual(q.value.added_claim_texts,['점검 기록에는 장치 식별자를 함께 적는다.']);
 assert.equal(q.value.before.includes('tags:'),false);
 assert.equal(q.value.after.includes('tags:'),false);
 assert.equal(q.value.after.includes('[!info]'),false);
 assert.equal(q.value.after.split('\n').filter(l=>l.startsWith('# ')).length,0);
 assert.equal(q.value.after.includes(addition),true);
 assert.equal(q.value.after.includes('실내 모형만 점검한다.'),true);
});
test('scope section is replaced in place without duplicating footers',async()=>{
 const {app,files}=vault(),flow=review.create({app});
 const a=await item(app,'scope','실내 모형만 점검한다.');
 const p=await flow.prepare({item:a,fields});assert.equal(p.ok,true,JSON.stringify(p));
 const first=await flow.apply(p.value,{approved:true,claims_accepted:true,packet_hash:p.value.packet_hash});assert.equal(first.ok,true,JSON.stringify(first));
 const target=first.target_path;
 const addition='점검 기록에는 장치 식별자를 함께 적는다.';
 const b={review_id:'review_scope',title:'실내 모형 점검',document_body:`## 기록\n${addition}\n`,plan_purpose:'보완',related_knowledge:[],
 grounded_claims:[{claim_id:'claim_999999999999999999999999',text:addition,citations:[{source_id:'source_scope_b',source_path:'INBOX/scope.md',locator:'INBOX/scope.md#L1',content_hash:hash.sha256(addition),evidence_quote:addition}]}]};
 await app.vault.create('INBOX/scope.md',addition);
 const changed={...fields,conditions:'실내 모형 확대'};
 await app.vault.create('ZETA/LITERATURE/related-scope.md','관련 문헌 본문.');
 const scopedItem={...b,related_knowledge:[{title:'관련',path:'ZETA/LITERATURE/related-scope.md',relation:'overlap'}]};
 const q=await flow.prepare({item:scopedItem,fields:changed,target_path:target});
 assert.equal(q.ok,true,JSON.stringify(q));
 const second=await flow.apply(q.value,{approved:true,claims_accepted:true,packet_hash:q.value.packet_hash});assert.equal(second.ok,true,JSON.stringify(second));
 const after=files.get(target).bytes;
 assert.equal(after.split('## 사용자 검토 범위').length-1,1);
 assert.ok(after.includes('- 적용 조건: 실내 모형 확대'));
 assert.equal(after.includes('- 적용 조건: 실내 모형만\n'),false);
 assert.equal(after.split('## 출처').length-1,1);
 assert.ok(after.includes(addition));
 assert.equal(after.split('[[ZETA/LITERATURE/related-scope]]').length-1,1);
 assert.ok(after.includes('실내 모형만 점검한다.'));
});
test('mixed old/new section merges paragraphs without duplicating the heading',async()=>{
 const {app,files}=vault(),flow=review.create({app});
 const oldText='실내 모형만 점검한다.';
 const a=await item(app,'mix','실내 모형만 점검한다.');
 const p=await flow.prepare({item:a,fields});assert.equal(p.ok,true,JSON.stringify(p));
 const first=await flow.apply(p.value,{approved:true,claims_accepted:true,packet_hash:p.value.packet_hash});assert.equal(first.ok,true,JSON.stringify(first));
 const target=first.target_path;
 const extra='점검 기록에는 장치 식별자를 함께 적는다.';
 const mixed=`실내 모형만 점검한다. ${extra}`;
 const b={review_id:'review_mix',title:'실내 모형 점검',document_body:`## 적용 조건\n${mixed}\n`,plan_purpose:'보완',related_knowledge:[],
 compiled_sections:[{heading:'적용 조건',paragraphs:[{text:mixed,claim_ids:['claim_aabbccddeeff001122334455']}]}],
 grounded_claims:[{claim_id:'claim_aabbccddeeff001122334455',text:'점검 기록에는 장치 식별자를 함께 적는다.',citations:[{source_id:'source_mix_b',source_path:'INBOX/mix.md',locator:'INBOX/mix.md#L1',content_hash:hash.sha256('점검 기록에는 장치 식별자를 함께 적는다.'),evidence_quote:'점검 기록에는 장치 식별자를 함께 적는다.'}]}]};
 await app.vault.create('INBOX/mix.md',extra);
 const before=files.get(target).bytes;
 assert.ok(!before.includes(extra));
 const q=await flow.prepare({item:b,fields,target_path:target});
 assert.equal(q.ok,true,JSON.stringify(q));
 const second=await flow.apply(q.value,{approved:true,claims_accepted:true,packet_hash:q.value.packet_hash});assert.equal(second.ok,true,JSON.stringify(second));
 const after=files.get(target).bytes;
 assert.equal(after.split('## 적용 조건').length-1,1);
 assert.ok(after.includes('점검 기록에는 장치 식별자를 함께 적는다.'));
 assert.ok(after.includes('실내 모형만 점검한다.'));
});
test('identical re-review ignores generated draft metadata but preserves review-scope changes',async()=>{
 const {app,files}=vault();
 const a=await item(app,'eq','실내 모형만 점검한다.');
 const flow=await jobBackedFlow(app,a);
 const reviewed={...fields,exclusions:'실외 적용 금지',rationale:'원문 근거',steps:'1. 원문 확인',outcome:'근거 있는 판단',definition:'재사용 가능한 규칙'};
 const p=await flow.prepare({item:a,fields:reviewed});assert.equal(p.ok,true,JSON.stringify(p));
 const first=await flow.apply(p.value,{approved:true,claims_accepted:true,packet_hash:p.value.packet_hash});assert.equal(first.ok,true,JSON.stringify(first));
 const same=await flow.prepare({item:a,fields:reviewed,target_path:first.target_path});
 assert.equal(same.ok,true,JSON.stringify(same));
 assert.equal(same.status,'no_change',JSON.stringify(same));
 for (const field of ['rationale','steps','outcome','definition','relation_status','classification','evidence_strength']) {
  const generated={...reviewed,[field]:`${reviewed[field]} (generated draft)`};
  const repeated=await flow.prepare({item:a,fields:generated,target_path:first.target_path});
  assert.equal(repeated.ok,true,JSON.stringify(repeated));
  assert.equal(repeated.status,'no_change',field);
  assert.equal(repeated.provider_count,0,field);
  assert.equal(repeated.writes,0,field);
 }
 const dropped=await flow.prepare({item:a,fields,target_path:first.target_path});
 assert.equal(dropped.ok,true,JSON.stringify(dropped));
 assert.equal(dropped.status,'review',JSON.stringify(dropped));
 assert.equal([...files.keys()].filter(path=>path.startsWith('ZETA/PERMANENT')).length,1);
});
test('unresolved conflict and missing explicit approval do not write canonical Markdown',async()=>{
 const {app,files}=vault(),flow=review.create({app});const a=await item(app,'ccc','동일 조건에서 10분과 20분 규정이 상충한다.');
 assert.equal((await flow.prepare({item:a,fields:{...fields,relation_status:'conflict'}})).reason,'promotion_review_required');
 const p=await flow.prepare({item:a,fields});assert.equal(p.ok,true,JSON.stringify(p));
 assert.equal((await flow.apply(p.value,{approved:false})).reason,'explicit_exact_approval_required');
 assert.equal([...files.keys()].filter(p=>p.startsWith('ZETA/PERMANENT')).length,0);
});

test('stale source or target preview rejects without replacing subsequent user edits',async()=>{
 const {app,files}=vault(),flow=review.create({app}); const a=await item(app,'ddd','실내에만 적용한다.');
 const p=await flow.prepare({item:a,fields});assert.equal(p.ok,true,JSON.stringify(p));
 files.get(a.grounded_claims[0].citations[0].source_path).bytes+='\n새 조건';
 assert.equal((await flow.apply(p.value,{approved:true,claims_accepted:true,packet_hash:p.value.packet_hash})).reason,'source_revision_changed');
 assert.equal([...files.keys()].filter(p=>p.startsWith('ZETA/PERMANENT')).length,0);
});
test('post-write audit failure resumes same approved document without a duplicate paragraph',async()=>{
 const {app,files}=vault(),flow=review.create({app}); const a=await item(app,'eee','실내 점검이다.');
 const p=await flow.prepare({item:a,fields});assert.equal(p.ok,true,JSON.stringify(p));
 const first=await flow.apply(p.value,{approved:true,claims_accepted:true,packet_hash:p.value.packet_hash});assert.equal(first.ok,true,JSON.stringify(first));
 const b=await item(app,'fff','경고등은 점검 중단 조건이다.');
 const q=await flow.prepare({item:b,fields,target_path:first.target_path});assert.equal(q.ok,true,JSON.stringify(q));
 const modify=app.vault.modify;let failed=false;
 app.vault.modify=async(f,bytes)=>{ if(!failed && f.path.includes('.llmwiki-audit/') && bytes.includes('"result": "committed"')){failed=true;throw new Error('injected audit failure');} return modify(f,bytes);};
 const decision={approved:true,claims_accepted:true,packet_hash:q.value.packet_hash};
 const pending=await flow.apply(q.value,decision);assert.equal(failed,true);assert.equal(pending.ok,false,JSON.stringify(pending));
 const resumed=await flow.apply(q.value,decision);assert.equal(resumed.ok,true,JSON.stringify(resumed));
 assert.equal(files.get(first.target_path).bytes.split(b.document_body.trim()).length-1,1);
 assert.equal((await flow.targets()).length,1);
});
test('target edit after preview remains untouched and requires a fresh review',async()=>{
 const {app,files}=vault(),flow=review.create({app});const a=await item(app,'ggg','실내 점검은 10분이다.');
 const p=await flow.prepare({item:a,fields});const first=await flow.apply(p.value,{approved:true,claims_accepted:true,packet_hash:p.value.packet_hash});assert.equal(first.ok,true,JSON.stringify(first));
 const b=await item(app,'hhh','경고등이 켜지면 중단한다.');const q=await flow.prepare({item:b,fields,target_path:first.target_path});assert.equal(q.ok,true,JSON.stringify(q));
 const file=files.get(first.target_path);file.bytes+='\n사용자가 작성한 후속 메모\n';const edited=file.bytes;
 const result=await flow.apply(q.value,{approved:true,claims_accepted:true,packet_hash:q.value.packet_hash});assert.equal(result.ok,false);assert.equal(result.reason,'stale_before_write');assert.equal(file.bytes,edited);
});
test('review modal renders exact preview and applies only after explicit checkbox action',async()=>{
 const {FakeElement}=require('./knowledge_explorer_view_fakes.js');
 FakeElement.prototype.setText ||= function(text){this.textContent=String(text);};
 const {app,files}=vault();const a=await item(app,'iii','실내 모형 점검이다.');let opened;
 class Modal {constructor(){this.contentEl=new FakeElement('section');}open(){opened=this.onOpen();}}
 const openedCitations=[];const modal=review.open({app,Modal,item:a,onOpenSource:(locator,citation)=>openedCitations.push({locator,citation})});await opened;
 const find=(node,pred)=>[...(pred(node)?[node]:[]),...(node.children||[]).flatMap(c=>find(c,pred))];
 const labels=find(modal.contentEl,n=>n.tag==='label'||n.tagName==='label'||n.tagName==='LABEL');
 assert.ok(labels.length>0);
 const sourceButton=find(modal.contentEl,n=>n.tag==='button'&&n.attr?.['data-citation-locator']===a.grounded_claims[0].citations[0].locator)[0];sourceButton.onclick();assert.equal(openedCitations[0].locator,a.grounded_claims[0].citations[0].locator);assert.equal(openedCitations[0].citation.evidence_quote,a.grounded_claims[0].citations[0].evidence_quote);
 assert.equal([...files.keys()].filter(p=>p.startsWith('ZETA/PERMANENT')).length,0);
 for(const [key,value] of Object.entries({target_path:'new',...fields})) { const input=find(modal.contentEl,n=>n.attr?.['data-review-field']===key)[0];assert.ok(input,key);input.value=value;await input.oninput(); }
 const prepareButton=find(modal.contentEl,n=>n.attr?.['data-action']==='prepare-document-review')[0];await prepareButton.onclick();
 const preview=find(modal.contentEl,n=>n.tag==='pre');assert.equal(preview.length,2);assert.ok(preview[1].text.includes(a.grounded_claims[0].text));
 const applyButton=find(modal.contentEl,n=>n.attr?.['data-action']==='apply-document-review')[0];
 await applyButton.onclick();assert.equal([...files.keys()].filter(p=>p.startsWith('ZETA/PERMANENT')).length,0);
 const checkbox=find(modal.contentEl,n=>n.attr?.type==='checkbox')[0];checkbox.checked=true;checkbox.onchange();assert.equal(applyButton.disabled,false);
 const condition=find(modal.contentEl,n=>n.attr?.['data-review-field']==='conditions')[0];condition.value='실내 모형만 — 사용자가 정정한 조건';condition.oninput();assert.equal(checkbox.checked,false);assert.equal(applyButton.disabled,true);
 await applyButton.onclick();assert.equal([...files.keys()].filter(p=>p.startsWith('ZETA/PERMANENT')).length,0);
 await prepareButton.onclick();assert.equal(checkbox.checked,false);assert.equal(applyButton.disabled,true);
 await applyButton.onclick();assert.equal([...files.keys()].filter(p=>p.startsWith('ZETA/PERMANENT')).length,0);
 checkbox.checked=true;checkbox.onchange();await applyButton.onclick();
 assert.equal([...files.keys()].filter(p=>p.startsWith('ZETA/PERMANENT')).length,1);
 const kind=find(modal.contentEl,n=>n.attr?.['data-review-field']==='knowledge_kind')[0];
 const currentLabels=find(modal.contentEl,n=>n.tag==='label');
 const rationale=currentLabels.find(label=>label.children.some(n=>n.attr?.['data-review-field']==='rationale'));
 const steps=currentLabels.find(label=>label.children.some(n=>n.attr?.['data-review-field']==='steps'));
 assert.equal(rationale.hidden,true);assert.equal(steps.hidden,true);
 assert.equal(kind.disabled,true);
 kind.value='principle';kind.oninput();assert.equal(rationale.hidden,true);
});

test('approved Wiki text is never recaptured as an independent Source',async()=>{
 const {app}=vault(),flow=review.create({app});const bytes='AI Wiki statement';const p='ZETA/PERMANENT/existing.md';await app.vault.create(p,bytes);
 const item={review_id:'review_wiki',title:'Wiki',document_body:bytes,grounded_claims:[{text:bytes,citations:[{source_id:'source_wiki',source_path:p,locator:`${p}#L1`,content_hash:hash.sha256(bytes),evidence_quote:bytes}]}]};
 assert.equal((await flow.prepare({item,fields})).reason,'canonical_wiki_not_independent_source');
});
test('partial update survives modal close/reopen without another canonical write and protects later user edits',async()=>{
 const {FakeElement}=require('./knowledge_explorer_view_fakes.js');
 const find=(node,pred)=>[...(pred(node)?[node]:[]),...(node.children||[]).flatMap(c=>find(c,pred))];
 class Modal {constructor(){this.contentEl=new FakeElement('section');}open(){this.ready=this.onOpen();}close(){this.onClose?.();this.contentEl.empty();}}
 for(const userEdit of [false,true]) {
  const {app,files}=vault(),flow=review.create({app});const a=await item(app,userEdit?'base_edit':'base_resume','실내 점검은 10분이다.');
  const initial=await flow.prepare({item:a,fields});const created=await flow.apply(initial.value,{approved:true,claims_accepted:true,packet_hash:initial.value.packet_hash});assert.equal(created.ok,true,JSON.stringify(created));
  const b=await item(app,userEdit?'pending_edit':'pending_resume','경고등 점등은 즉시 중단 조건이다.');
  const modal=review.open({app,Modal,item:b});await modal.ready;
  for(const [key,value] of Object.entries({target_path:created.target_path,...fields})){const input=find(modal.contentEl,n=>n.attr?.['data-review-field']===key)[0];input.value=value;await input.oninput();}
  await find(modal.contentEl,n=>n.attr?.['data-action']==='prepare-document-review')[0].onclick();
  const modify=app.vault.modify;let failed=false,canonicalModifications=0;
  app.vault.modify=async(f,bytes)=>{if(f.path===created.target_path)canonicalModifications++;if(!failed&&f.path.includes('.llmwiki-audit/')&&bytes.includes('"result": "committed"')){failed=true;throw new Error('post write interruption');}return modify(f,bytes);};
  let checkbox=find(modal.contentEl,n=>n.attr?.type==='checkbox')[0];checkbox.checked=true;checkbox.onchange();await find(modal.contentEl,n=>n.attr?.['data-action']==='apply-document-review')[0].onclick();
  assert.equal(failed,true);assert.equal(canonicalModifications,1);assert.equal((await flow.targets()).length,0);
  modal.close();
  if(userEdit)files.get(created.target_path).bytes+='\n후속 사용자 메모 — 보존해야 함\n';
  const beforeResume=files.get(created.target_path).bytes;
  const reopened=review.open({app,Modal,item:b});assert.equal(reopened,modal);await reopened.ready;
  assert.equal(find(reopened.contentEl,n=>n.tag==='pre').length,2);
  checkbox=find(reopened.contentEl,n=>n.attr?.type==='checkbox')[0];assert.equal(checkbox.checked,false);
  const retry=find(reopened.contentEl,n=>n.attr?.['data-action']==='apply-document-review')[0];assert.equal(retry.disabled,true);await retry.onclick();assert.equal(canonicalModifications,1);
  checkbox.checked=true;checkbox.onchange();await retry.onclick();assert.equal(canonicalModifications,1);assert.equal(files.get(created.target_path).bytes,beforeResume);
  if(userEdit){assert.equal(retry.disabled,true);assert.equal((await flow.targets()).length,0);}
  else{assert.equal((await flow.targets()).length,1);assert.equal(find(reopened.contentEl,n=>n.attr?.['data-applied-document']===created.target_path).length,1);}
 }
});
test('existing processing plan restores an interrupted apply after runtime restart only with a fresh explicit decision',async()=>{
 const jobs=require(path.join(V,'llmwiki-batch-job-store.js'));
 for(const mode of ['resume','head_gap','resolved_checkpoint','user_edit','source_edit','expired']) {
  const {app,files}=vault(),initialFlow=review.create({app});const a=await item(app,`restart_base_${mode}`,'실내 점검은 10분이다.');
  const p=await initialFlow.prepare({item:a,fields});const created=await initialFlow.apply(p.value,{approved:true,claims_accepted:true,packet_hash:p.value.packet_hash});assert.equal(created.ok,true,JSON.stringify(created));
  const b=await item(app,`restart_new_${mode}`,'경고등은 즉시 중단 조건이다.');const disk=new Map();
  const storage={exists:async key=>disk.has(key),read:async key=>disk.get(key),writeAtomic:async(key,bytes)=>disk.set(key,bytes),quarantine:async()=>{throw new Error('unexpected corrupt job');}};
  const jobStore={...jobs.createBatchJobStore({storage})};await jobStore.load();
  const citation=b.grounded_claims[0].citations[0];const job=await jobStore.createJob({request_key:hash.sha256('document-restart-fixture'),sources:[{source_id:citation.source_id,revision_hash:citation.content_hash}]});
  await jobStore.savePlanSnapshot({job_id:job.job_id,source_id:citation.source_id,source_revision:citation.content_hash,inventory_hash:hash.sha256(JSON.stringify(b.grounded_claims)),plan_hash:hash.sha256(b.document_body),plan_revision:1,status:'compiled',plan:{plan_version:'fixture_document_v1',pages:[]}});
  const flow=review.create({app,jobStore,jobId:job.job_id});const q=await flow.prepare({item:b,fields,target_path:created.target_path});assert.equal(q.ok,true,JSON.stringify(q));
  const modify=app.vault.modify;let failed=false,canonicalWrites=0;
  const saveSnapshot=jobStore.savePlanSnapshot.bind(jobStore);
  if(mode==='resolved_checkpoint') jobStore.savePlanSnapshot=async snapshot=>{if(!failed&&Object.values(snapshot.canonical_reviews||{}).some(r=>r.status==='resolved')){failed=true;throw new Error('checkpoint failure');}return saveSnapshot(snapshot);};
  app.vault.modify=async(f,bytes)=>{if(f.path===created.target_path)canonicalWrites++;if(mode!=='resolved_checkpoint'&&!failed&&(mode==='head_gap'?f.path==='.llmwiki-audit/immutable/head.json':f.path.includes('.llmwiki-audit/')&&bytes.includes('"result": "committed"'))){failed=true;throw new Error('restart after canonical write');}return modify(f,bytes);};
  const failedResult=await flow.apply(q.value,{approved:true,claims_accepted:true,packet_hash:q.value.packet_hash});assert.equal(failedResult.ok,false);assert.equal(failed,true);assert.equal(canonicalWrites,1);
  const stored=Object.values(jobStore.getPlanSnapshot(job.job_id).canonical_reviews)[0];assert.equal(stored.status,mode==='resolved_checkpoint'?'running':'blocked');assert.equal(stored.automatic_approval,false);assert.ok(stored.original_reviewed_at);assert.equal(stored.authorization,undefined);assert.equal(stored.sources.some(s=>s.source_text!==undefined),false);
  if(mode==='resolved_checkpoint') {
   assert.equal(failedResult.reason,'review_checkpoint_failed');
   const retried=await flow.apply(q.value,{approved:true,claims_accepted:true,packet_hash:q.value.packet_hash});
   assert.equal(retried.ok,true,JSON.stringify(retried));assert.equal(canonicalWrites,1);
   assert.equal(Object.values(jobStore.getPlanSnapshot(job.job_id).canonical_reviews)[0].status,'resolved');
   continue;
  }
  if(mode==='user_edit')files.get(created.target_path).bytes+='\n보존할 사용자 메모\n';
  if(mode==='source_edit')files.get(citation.source_path).bytes+='\n바뀐 원문\n';
  const before=files.get(created.target_path).bytes;
  const reloadedStore=jobs.createBatchJobStore({storage});const restarted=review.create({app,jobStore:reloadedStore,jobId:job.job_id,...(mode==='expired'?{now:()=>new Date(Date.parse(stored.packet.expires_at)+1).toISOString()}:{})});
  const restored=await restarted.restore(b);
  if(!['resume','head_gap','resolved_checkpoint'].includes(mode)){assert.equal(restored.ok,false,JSON.stringify(restored));if(mode==='expired'){assert.equal(restored.reason,'approval_expired');assert.equal(restored.already_written,true);assert.equal(restored.retained_preview.after,q.value.after);assert.equal(restored.retained_preview.before,q.value.before);}assert.equal(canonicalWrites,1);assert.equal(files.get(created.target_path).bytes,before);continue;}
  assert.equal(restored.ok,true,JSON.stringify(restored));assert.equal(restored.status,'review');assert.equal(restored.already_written,true);assert.equal(restored.requires_new_approval,true);assert.equal(canonicalWrites,1);
  assert.equal((await restarted.apply(restored.value,{approved:false})).reason,'explicit_exact_approval_required');
  const completed=await restarted.apply(restored.value,{approved:true,claims_accepted:true,packet_hash:restored.value.packet_hash});assert.equal(completed.ok,true,JSON.stringify(completed));assert.equal(canonicalWrites,1);assert.equal(files.get(created.target_path).bytes,before);
  assert.equal((await restarted.targets()).length,1);assert.equal(Object.values(reloadedStore.getPlanSnapshot(job.job_id).canonical_reviews)[0].status,'resolved');
  if(mode==='resume') {
   const completed=await restarted.restore(b);assert.equal(completed.status,'completed');assert.equal(completed.current_verified,true);
   const current=reloadedStore.getPlanSnapshot(job.job_id);const same={...current,plan_revision:current.plan_revision+1};delete same.canonical_reviews;
   await reloadedStore.savePlanSnapshot(same);assert.equal(Object.values(reloadedStore.getPlanSnapshot(job.job_id).canonical_reviews)[0].status,'resolved');
   const later={...reloadedStore.getPlanSnapshot(job.job_id),plan_hash:hash.sha256('new plan for same source'),plan_revision:same.plan_revision+1};delete later.canonical_reviews;
   await reloadedStore.savePlanSnapshot(later);const next=reloadedStore.getPlanSnapshot(job.job_id);assert.equal(next.canonical_reviews,undefined);assert.ok(next.history.some(row=>Object.values(row.canonical_reviews||{}).some(record=>record.status==='resolved')));
   assert.equal((await restarted.restore(b)).current_verified,true);
   files.get(citation.source_path).bytes+='\n승인 이후 원문 변경';
   const changed=await restarted.restore(b);assert.equal(changed.ok,false);assert.equal(changed.reason,'source_revision_changed');assert.ok(changed.retained_preview.after);
  }
 }
});
test('verified target reuses recorded scope while new-target switch clears inherited fields and approval',async()=>{
 const {FakeElement}=require('./knowledge_explorer_view_fakes.js');
 const find=(node,pred)=>[...(pred(node)?[node]:[]),...(node.children||[]).flatMap(c=>find(c,pred))];
 const {app}=vault(),flow=review.create({app});const a=await item(app,'reuse_ui_a','실내 모형만 점검한다.');
 const p=await flow.prepare({item:a,fields:{...fields,exclusions:'실외 금지'}});const made=await flow.apply(p.value,{approved:true,claims_accepted:true,packet_hash:p.value.packet_hash});assert.equal(made.ok,true);
 const b=await item(app,'reuse_ui_b','경고등에서는 중단한다.');
 class Modal{constructor(){this.contentEl=new FakeElement('section');}open(){this.ready=this.onOpen();}}
 const modal=review.open({app,Modal,item:b});await modal.ready;
 const input=name=>find(modal.contentEl,n=>n.attr?.['data-review-field']===name)[0];
 input('target_path').value=made.target_path;await input('target_path').oninput();
 assert.equal(input('knowledge_domain').value,fields.knowledge_domain);assert.equal(input('conditions').value,fields.conditions);assert.equal(input('exclusions').value,'실외 금지');
 // A1 recommendations replace blanks, but never inherit an approval from the target.
 assert.equal(input('relation_status').value,'resolved');assert.equal(input('evidence_strength').value,'sufficient');
 assert.ok(input('relation_status').parentElement.querySelector('[data-decision-suggestion]'));
 assert.equal(modal.contentEl.querySelector('[data-review-acknowledgement]').checked,false);
 const inherited=find(modal.contentEl,n=>n.attr?.['data-review-conditions']!==undefined)[0];assert.ok(inherited);assert.ok(find(inherited,n=>n.attr?.['data-review-field']==='conditions').length);
 const checkbox=find(modal.contentEl,n=>n.attr?.type==='checkbox')[0];checkbox.checked=true;
 input('target_path').value='new';await input('target_path').oninput();
 assert.equal(input('conditions').value,'');assert.equal(input('exclusions').value,'');assert.equal(input('knowledge_domain').value,'');assert.equal(find(modal.contentEl,n=>n.attr?.type==='checkbox')[0].checked,false);
 assert.equal((await flow.targets()).length,1);
});

test('failed conflict preparation keeps the complete proposed document visible',async()=>{
 const {FakeElement}=require('./knowledge_explorer_view_fakes.js');
 const find=(node,pred)=>[...(pred(node)?[node]:[]),...(node.children||[]).flatMap(c=>find(c,pred))];
 const {app,files}=vault();const a=await item(app,'conflict_visible','동일 조건에서 10분과 20분이 상충하며 우선순위는 미확정이다.');
 class Modal{constructor(){this.contentEl=new FakeElement('section');}open(){this.ready=this.onOpen();}}
 const modal=review.open({app,Modal,item:a});await modal.ready;
 for(const [key,value] of Object.entries({target_path:'new',...fields,relation_status:'conflict'})) {const input=find(modal.contentEl,n=>n.attr?.['data-review-field']===key)[0];input.value=value;await input.oninput();}
 await find(modal.contentEl,n=>n.attr?.['data-action']==='prepare-document-review')[0].onclick();
 assert.ok(find(modal.contentEl,n=>n.attr?.['data-document-body']!==undefined).some(n=>require('./knowledge_explorer_view_fakes.js').collectText(n).includes(a.grounded_claims[0].text)));
 assert.equal(find(modal.contentEl,n=>n.attr?.['data-action']==='apply-document-review')[0].disabled,true);
 assert.equal([...files.keys()].filter(p=>p.startsWith('ZETA/PERMANENT')).length,0);
});

test('new review does not invent scope from arbitrary prose and offers registered topics',async()=>{
 const {FakeElement}=require('./knowledge_explorer_view_fakes.js');
 const find=(node,pred)=>[...(pred(node)?[node]:[]),...(node.children||[]).flatMap(c=>find(c,pred))];
 const {app,files}=vault();const a=await item(app,'explicit_reuse','실내 모형에만 적용하며 실외에서는 금지한다.');a.plan_purpose='실내 모형 점검 기준 정리';
 class Modal{constructor(){this.contentEl=new FakeElement('section');}open(){this.ready=this.onOpen();}}
 const modal=review.open({app,Modal,item:a});await modal.ready;
 const input=name=>find(modal.contentEl,n=>n.attr?.['data-review-field']===name)[0];
 assert.equal(input('conditions').value,'');
 assert.equal(input('application_trigger').value,a.plan_purpose);
 // A1 adds the canonical-use suggestion; both descriptive badges remain inspectable.
 assert.deepEqual(find(modal.contentEl,n=>n.attr?.['data-ai-prefilled']==='true').map(n=>n.querySelector('[data-review-field]').getAttribute('data-review-field')).sort(),['application_trigger','classification']);
 const choose=find(modal.contentEl,n=>n.attr?.['data-analysis-reuse']==='conditions')[0];choose.value='0';choose.onchange();assert.equal(input('conditions').value,a.grounded_claims[0].text);
 choose.value='0';choose.onchange();assert.equal(input('conditions').value,a.grounded_claims[0].text);
 find(modal.contentEl,n=>n.tag==='button'&&n.text===`분석된 사용 목적 사용: ${a.plan_purpose}`)[0].onclick();assert.equal(input('application_trigger').value,a.plan_purpose);
 input('application_trigger').value='수정한 사용 계기';input('application_trigger').oninput();
 assert.equal(input('application_trigger').parentElement.querySelector('[data-ai-badge]'),null);
 assert.deepEqual(find(modal.contentEl,n=>n.attr?.['data-ai-prefilled']==='true').map(n=>n.querySelector('[data-review-field]').getAttribute('data-review-field')),['classification']);
 input('knowledge_domain').value='coding';input('knowledge_domain').oninput();
 const topics=find(modal.contentEl,n=>n.attr?.['data-topic-options']==='true')[0];assert.ok(topics.children.some(n=>n.attr?.value==='ai'));
 topics.value='ai';topics.onchange();assert.equal(input('knowledge_topics').value,'ai');
 topics.value='invented';topics.onchange();assert.equal(input('knowledge_topics').value,'ai');
 input('knowledge_domain').value='';input('knowledge_domain').oninput();assert.equal(input('knowledge_topics').value,'ai');
 assert.ok(find(modal.contentEl,n=>n.attr?.['data-topic-error']!==undefined).length,'incompatible explicit topic stays visible and requires correction');
 assert.equal(input('relation_status').value,'resolved');assert.equal(input('evidence_strength').value,'sufficient');assert.equal(input('invalidation_conditions').value,'');
 assert.ok(input('evidence_strength').parentElement.querySelector('[data-decision-suggestion]'));
 assert.equal([...files.keys()].filter(p=>p.startsWith('ZETA/PERMANENT')).length,0);
});
test('new review suggests domain/topic candidates from related documents without auto-filling',async()=>{
 const {FakeElement}=require('./knowledge_explorer_view_fakes.js');
 const find=(node,pred)=>[...(pred(node)?[node]:[]),...(node.children||[]).flatMap(c=>find(c,pred))];
 const {app,files}=vault();
 await app.vault.create('ZETA/PERMANENT/관련.md','---\nknowledge_domain: coding\nknowledge_topics: ["ai"]\n---\n관련 본문\n');
 await app.vault.create('ZETA/PERMANENT/무관.md','---\nknowledge_domain: bogus\nknowledge_topics: ["invented"]\n---\n무관 본문\n');
 const a=await item(app,'cand','후보 문서 내용이다.');
 a.classification='epistemic';
 a.related_knowledge=[{title:'관련',path:'ZETA/PERMANENT/관련.md',relation:'overlap'},{title:'무관',path:'ZETA/PERMANENT/무관.md',relation:'overlap'},{title:'없음',path:'ZETA/PERMANENT/없음.md',relation:'overlap'}];
 class Modal{constructor(){this.contentEl=new FakeElement('section');}open(){this.ready=this.onOpen();}}
 const modal=review.open({app,Modal,item:a});await modal.ready;
 const input=name=>find(modal.contentEl,n=>n.attr?.['data-review-field']===name)[0];
 assert.equal(input('knowledge_domain').value,'');
 assert.equal(input('knowledge_topics').value,'');
 assert.equal(input('classification').value,'epistemic');
 assert.ok(input('classification').parentElement.querySelector('[data-ai-badge]'));
 find(modal.contentEl,n=>n.attr?.['data-field-suggestion']==='classification')[0].onclick();
 assert.equal(input('classification').value,'epistemic');
 const box=find(modal.contentEl,n=>n.attr?.['data-candidates']==='domain-topic')[0];
 assert.ok(box);
 const chip=text=>find(box,n=>n.tag==='button'&&n.text===text)[0];
 assert.equal(find(box,n=>n.attr?.['data-candidate-domain']==='coding'&&!n.attr?.['data-candidate-topic']).length,1);
 assert.equal(find(box,n=>n.attr?.['data-candidate-topic']==='ai').length,1);
 assert.equal(find(box,n=>n.attr?.['data-candidate-domain']==='bogus').length,0);
 chip('주제 ai (1)').onclick();
 assert.equal(input('knowledge_domain').value,'coding');
 assert.equal(input('knowledge_topics').value,'ai');
 chip('주제 ai (1)').onclick();
 assert.equal(input('knowledge_topics').value,'ai');
 assert.equal([...files.keys()].filter(p=>p.startsWith('ZETA/PERMANENT/관련')).length,1);
});

test('compared target revision cannot silently rebase during preparation', async () => {
 const {app,files}=vault(),flow=review.create({app});
 const a=await item(app,'bound_base','Keep the original album alignment.');
 const initial=await flow.prepare({item:a,fields});
 const made=await flow.apply(initial.value,{approved:true,claims_accepted:true,packet_hash:initial.value.packet_hash});
 assert.equal(made.ok,true,JSON.stringify(made));
 const originalRevision=hash.sha256(files.get(made.target_path).bytes);
 const b=await item(app,'bound_new','Check both edges before exporting.');
 const proposal={...b,proposed_target:{path:made.target_path,revision:originalRevision,action:'update'}};
 const update=await flow.prepare({item:b,fields,target_path:made.target_path});
 assert.equal(update.ok,true,JSON.stringify(update));
 assert.equal((await flow.apply(update.value,{approved:true,claims_accepted:true,packet_hash:update.value.packet_hash})).ok,true);
 const before=files.get(made.target_path).bytes;
 const stale=await flow.prepare({item:proposal,fields,target_path:made.target_path});
 assert.equal(stale.reason,'target_revision_changed');
 assert.equal(files.get(made.target_path).bytes,before);
});

test('comparison retains both source authorities without repeating the existing factual paragraph', async () => {
 const {app,files}=vault(),flow=review.create({app});
 const old='Keep both album pages aligned.';
 const a=await item(app,'compare_old',old);
 const initial=await flow.prepare({item:a,fields});
 const made=await flow.apply(initial.value,{approved:true,claims_accepted:true,packet_hash:initial.value.packet_hash});
 assert.equal(made.ok,true);
 const extra='Check the export crop.';
 const sourcePath='INBOX/QA/compare-two.md', bytes=`${old}\n${extra}`;
 await app.vault.create(sourcePath,bytes);
 const b={review_id:'comparison_two',title:a.title,document_body:`## Layout\n\n${old}\n\n${extra}`,
  grounded_claims:[old,extra].map((text,i)=>({claim_id:`claim_compare_${i}`,text,citations:[{source_id:'source_compare_two',source_path:sourcePath,locator:`${sourcePath}#L${i+1}`,content_hash:hash.sha256(bytes),evidence_quote:text}]})),
  compiled_sections:[{heading:'Layout',paragraphs:[old,extra].map((text,i)=>({text,claim_ids:[`claim_compare_${i}`]}))}]};
 const prepared=await flow.prepare({item:b,fields,target_path:made.target_path});
 assert.equal(prepared.ok,true,JSON.stringify(prepared));
 const body=store.parseLifecycleDocument(prepared.value.after).body;
 assert.equal(body.split(old).length-1,1,'existing fact appears once despite a second source citation');
 assert.equal(body.split(extra).length-1,1);
 assert.deepEqual(prepared.value.source_paths.sort(),[a.grounded_claims[0].citations[0].source_path,sourcePath].sort());
 assert.equal((await flow.apply(prepared.value,{approved:true,claims_accepted:true,packet_hash:prepared.value.packet_hash})).ok,true);
 assert.equal(files.get(made.target_path).bytes,prepared.value.after);
});

async function durableFixture(app, proposal) {
 const disk=new Map(), writes=[];
 const storage={exists:async k=>disk.has(k),read:async k=>disk.get(k),writeAtomic:async(k,v)=>{writes.push(v);disk.set(k,v);},quarantine:async()=>{throw new Error('corrupt fixture');}};
 const jobStore={...jobs.createBatchJobStore({storage})};await jobStore.load();
 const c=proposal.grounded_claims[0].citations[0];
 const job=await jobStore.createJob({request_key:hash.sha256(proposal.review_id),sources:[{source_id:c.source_id,revision_hash:c.content_hash}]});
 await jobStore.savePlanSnapshot({job_id:job.job_id,source_id:c.source_id,source_revision:c.content_hash,inventory_hash:hash.sha256('inventory'),plan_hash:hash.sha256(proposal.document_body),plan_revision:1,status:'compiled',plan:{plan_version:'fixture',pages:[]}});
 return {jobStore,jobId:job.job_id,storage,disk,writes};
}
function draftModal() {
 const {FakeElement}=require('./knowledge_explorer_view_fakes.js');
 return class Modal {constructor(){this.contentEl=new FakeElement('section');}open(){this.ready=this.onOpen();}close(){return this.onClose?.();}};
}
test('task 5 preparation-free edits and deliberate clears survive a new store and remount',async()=>{
 const {app,files}=vault(), a=await item(app,'durable_draft','Preserve the album layout.');a.application_trigger='Suggested trigger';a.exclusions='Suggested exclusion';
 const fixture=await durableFixture(app,a), Modal=draftModal();
 const modal=review.open({app,Modal,item:a,...fixture});await modal.ready;
 const input=name=>modal.contentEl.querySelector(`[data-review-field="${name}"]`);
 for(const [name,value] of Object.entries({application_trigger:'Owner correction',exclusions:'',knowledge_topics:'ai'})){input(name).value=value;await input(name).oninput();}
 await modal.close();
 const reopened=review.open({app:{...app},Modal,item:a,jobId:fixture.jobId,jobStore:jobs.createBatchJobStore({storage:fixture.storage})});await reopened.ready;
 assert.equal(reopened.contentEl.querySelector('[data-review-field="application_trigger"]').value,'Owner correction','draft lost on remount before preparation');
 assert.equal(reopened.contentEl.querySelector('[data-review-field="exclusions"]').value,'');
 assert.equal(reopened.contentEl.querySelector('[data-review-acknowledgement]').checked,false);
 assert.equal(reopened.contentEl.querySelector('[data-action="apply-document-review"]').disabled,true);
 const record=Object.values(fixture.jobStore.getPlanSnapshot(fixture.jobId).canonical_reviews)[0];
 assert.equal(record.pending_draft.cleared.exclusions,true);assert.ok(record.pending_draft.edit_revision>0);
 assert.equal(record.pending_draft.fields.exclusions,'');assert.equal(record.authorization,undefined);
 assert.equal([...files.keys()].filter(p=>p.startsWith('ZETA/PERMANENT')).length,0);
});
test('task 5 close and reopen invalidates prepared preview even in the cached modal',async()=>{
 const {app}=vault(), a=await item(app,'durable_preview','Check the crop.');
 const fixture=await durableFixture(app,a),Modal=draftModal();const modal=review.open({app,Modal,item:a,...fixture});await modal.ready;
 for(const [name,value] of Object.entries({target_path:'new',...fields})){const input=modal.contentEl.querySelector(`[data-review-field="${name}"]`);input.value=value;await input.oninput();}
 await modal.contentEl.querySelector('[data-action="prepare-document-review"]').onclick();
 const ack=modal.contentEl.querySelector('[data-review-acknowledgement]');ack.checked=true;ack.onchange();
 await modal.close();review.open({app,Modal,item:a,...fixture});await modal.ready;
 assert.equal(modal.contentEl.querySelector('[data-action="prepare-document-review"]').hidden,false,'reopen must require fresh preparation');
 assert.equal(modal.contentEl.querySelector('[data-action="apply-document-review"]').disabled,true);
});
test('task 5 source and target drift archive corrections without adopting stale values',async()=>{
 for(const drift of ['source','target','plan']) {
  const {app,files}=vault(),base=await item(app,`archive_base_${drift}`,'Original source.'),baseFlow=review.create({app});
  const prepared=await baseFlow.prepare({item:base,fields}),made=await baseFlow.apply(prepared.value,{approved:true,claims_accepted:true,packet_hash:prepared.value.packet_hash});
  const a=await item(app,`archive_${drift}`,'New source.'),fixture=await durableFixture(app,a),Modal=draftModal();
  const modal=review.open({app,Modal,item:a,...fixture});await modal.ready;
  for(const [name,value] of Object.entries({target_path:made.target_path,application_trigger:'Recover this correction',exclusions:''})) {const input=modal.contentEl.querySelector(`[data-review-field="${name}"]`);input.value=value;await input.oninput();}
  await modal.close();
  if(drift==='source')files.get(a.grounded_claims[0].citations[0].source_path).bytes+=' Changed source.';
  if(drift==='target')files.get(made.target_path).bytes+=' Changed target.';
  if(drift==='plan'){const previous=fixture.jobStore.getPlanSnapshot(fixture.jobId),next={...previous,plan_hash:hash.sha256('changed plan'),plan_revision:previous.plan_revision+1};delete next.canonical_reviews;await fixture.jobStore.savePlanSnapshot(next);}
  const before=files.get(made.target_path).bytes;
  const reloaded=jobs.createBatchJobStore({storage:fixture.storage});
  const reopened=review.open({app:{...app},Modal,item:a,jobId:fixture.jobId,jobStore:reloaded});await reopened.ready;
  assert.notEqual(reopened.contentEl.querySelector('[data-review-field="application_trigger"]').value,'Recover this correction',drift);
  assert.ok(reopened.contentEl.querySelector('[data-archived-draft]'),drift);
  assert.ok(JSON.stringify(reloaded.getPlanSnapshot(fixture.jobId)).includes('Recover this correction'));
  assert.equal(reopened.contentEl.querySelector('[data-action="apply-document-review"]').disabled,true);
  assert.equal(files.get(made.target_path).bytes,before);
 }
});
test('task 5 input queue preserves latest edit and visibly retains failed persistence',{timeout:2000},async()=>{
 const {app}=vault(),a=await item(app,'queue_draft','Album source.'),fixture=await durableFixture(app,a),Modal=draftModal();
 const modal=review.open({app,Modal,item:a,...fixture});await modal.ready;
 const input=modal.contentEl.querySelector('[data-review-field="application_trigger"]');
 const original=fixture.storage.writeAtomic;let release,entered;
 const blocked=new Promise(resolve=>{entered=resolve;});
 fixture.storage.writeAtomic=async(k,v)=>{entered();await new Promise(resolve=>{release=resolve;});return original(k,v);};
 input.value='First';const first=input.oninput();await blocked;
 input.value='Last';const last=input.oninput();fixture.storage.writeAtomic=original;release();await Promise.all([first,last]);
 assert.equal(Object.values(fixture.jobStore.getPlanSnapshot(fixture.jobId).canonical_reviews)[0].pending_draft.fields.application_trigger,'Last');
 fixture.storage.writeAtomic=async()=>{throw new Error('disk_full');};input.value='Unsaved correction';await input.oninput();
 assert.match(modal.contentEl.querySelector('[data-decision-status]').textContent,/disk_full/);
 assert.equal(input.value,'Unsaved correction');
 fixture.storage.writeAtomic=original;await modal.close();
 const reopened=review.open({app:{...app},Modal,item:a,jobId:fixture.jobId,jobStore:jobs.createBatchJobStore({storage:fixture.storage})});await reopened.ready;
 assert.equal(reopened.contentEl.querySelector('[data-review-field="application_trigger"]').value,'Unsaved correction');
});

test('task 5 Hub remount lists distinct preparation-free drafts and opens the selected edit',async()=>{
 const {runHub}=require('./knowledge_hub_integration_harness.js');
 const {app}=vault(),a=await item(app,'hub_pending_draft','Album evidence.'),fixture=await durableFixture(app,a),Modal=draftModal();
 for(const suffix of ['one','two']) {
  const proposal={...a,review_id:`draft_${suffix}`,title:`Draft ${suffix}`};
  const modal=review.open({app,Modal,item:proposal,...fixture});await modal.ready;
  const input=modal.contentEl.querySelector('[data-review-field="application_trigger"]');input.value=`Correction ${suffix}`;await input.oninput();await modal.close();
 }
 const source=a.grounded_claims[0].citations[0];let providers=0;
 const runtime=await runHub({pages:[],extraFiles:{'SYSTEM/CACHE/llmwiki/batch-job-state.json':fixture.disk.get(jobs.STATE_FILE),[source.source_path]:source.evidence_quote},llmWikiControllerOptions:{batchProvider:async()=>{providers++;throw new Error('unexpected provider');}}});
 await runtime.window.KnowledgeExplorerHub.whenKnowledgeInboxSettled();
 const panel=runtime.container.querySelector('.llmwiki-pending-document-reviews');assert.ok(panel);
 const buttons=panel.querySelectorAll('button');assert.equal(buttons.length,2,'packet-free records must not deduplicate as undefined packet hashes');
 await buttons[1].onclick();
 assert.equal(runtime.container.querySelector('[data-review-field="application_trigger"]').value,'Correction two');
 assert.equal(runtime.container.querySelector('[data-action="apply-document-review"]').disabled,true);
 assert.equal(providers,0);
});

test('task 6 empty optional target revision cannot override the compared base',async()=>{
 const {app}=vault(),flow=review.create({app}),a=await item(app,'empty_base','Original alignment.');
 const initial=await flow.prepare({item:a,fields}),made=await flow.apply(initial.value,{approved:true,claims_accepted:true,packet_hash:initial.value.packet_hash});
 const b=await item(app,'empty_new','Check export crop.'),proposal={...b,proposed_target:{path:made.target_path,revision:made.revision,action:'update'}};
 const updated=await flow.prepare({item:b,fields,target_path:made.target_path});assert.equal((await flow.apply(updated.value,{approved:true,claims_accepted:true,packet_hash:updated.value.packet_hash})).ok,true);
 const stale=await flow.prepare({item:proposal,fields,target_path:made.target_path,target_revision:''});
 assert.equal(stale.reason,'target_revision_changed','compared base revision was bypassed');
});
test('task 6 readback failure exposes refresh only and replay never re-enters the writer',async t=>{
 const reader=require(path.join(V,'llmwiki-resurfacing-read-adapter.js')),writer=require(path.join(V,'llmwiki-operation-writer.js'));
 let failReadback=false,writerCalls=0;
 global.LLMWikiResurfacingReadAdapter={create:()=>({read:async args=>failReadback?{ok:false,reason:'injected_readback_failure',rows:[]}:reader.create().read(args)})};
 global.LLMWikiOperationWriter={...writer,commitApprovedCanonicalV2:async(...args)=>{writerCalls++;return writer.commitApprovedCanonicalV2(...args);}};
 delete require.cache[require.resolve(path.join(V,'llmwiki-document-canonical-review.js'))];
 const isolated=require(path.join(V,'llmwiki-document-canonical-review.js'));
 t.after(()=>{delete global.LLMWikiResurfacingReadAdapter;delete global.LLMWikiOperationWriter;delete require.cache[require.resolve(path.join(V,'llmwiki-document-canonical-review.js'))];});
 const {app,files}=vault(),a=await item(app,'refresh_only','Review the full album spread.'),fixture=await durableFixture(app,a),Modal=draftModal();
 const modal=isolated.open({app,Modal,item:a,...fixture});await modal.ready;
 for(const [name,value] of Object.entries({target_path:'new',...fields})){const input=modal.contentEl.querySelector(`[data-review-field="${name}"]`);input.value=value;await input.oninput();}
 await modal.contentEl.querySelector('[data-action="prepare-document-review"]').onclick();
 const displayed=modal.contentEl.querySelectorAll('pre')[1].text;
 failReadback=true;
 const ack=modal.contentEl.querySelector('[data-review-acknowledgement]');ack.checked=true;ack.onchange();
 await modal.contentEl.querySelector('[data-action="apply-document-review"]').onclick();
 assert.equal(writerCalls,1);
 const refresh=modal.contentEl.querySelector('[data-action="refresh-document-review"]');
 assert.ok(refresh,'readback failure must expose refresh, not regeneration or re-approval');
 await refresh.onclick();assert.equal(writerCalls,1,'failed refresh never re-applies');
 failReadback=false;await refresh.onclick();assert.equal(writerCalls,1);
 const canonical=[...files.values()].filter(f=>f.path.startsWith('ZETA/PERMANENT'));assert.equal(canonical.length,1);assert.equal(canonical[0].bytes,displayed);
 const before=fixture.writes.length;await modal.contentEl.querySelector('[data-action="apply-document-review"]').onclick();
 assert.equal(writerCalls,1);assert.equal(fixture.writes.length,before);
});
test('task 6 duplicate pending apply does not write a second running checkpoint',async()=>{
 const {app}=vault(),a=await item(app,'checkpoint_replay','Keep exact approved bytes.'),fixture=await durableFixture(app,a);
 const original=fixture.jobStore.savePlanSnapshot;let resolvedFail=true,running=0;
 fixture.jobStore.savePlanSnapshot=async snapshot=>{const status=Object.values(snapshot.canonical_reviews||{})[0]?.status;if(status==='running')running++;if(status==='resolved'&&resolvedFail){resolvedFail=false;throw new Error('injected checkpoint failure');}return original(snapshot);};
 const flow=review.create({app,...fixture}),p=await flow.prepare({item:a,fields}),decision={approved:true,claims_accepted:true,packet_hash:p.value.packet_hash};
 assert.equal((await flow.apply(p.value,decision)).reason,'review_checkpoint_failed');
 assert.equal((await flow.apply(p.value,decision)).ok,true);
 assert.equal(running,1,'duplicate apply wrote a second running checkpoint');
 const writes=fixture.writes.length;assert.equal((await flow.apply(p.value,decision)).ok,true);assert.equal(fixture.writes.length,writes);
});

// A1: exercise the real prepare/writer and mounted controls, not a helper-only model.
const descriptiveNames = ['knowledge_domain','knowledge_topics','classification','application_trigger','application_contexts','conditions','invalidation_conditions','exclusions','rationale','steps','outcome','definition'];
async function reducedReviewFixture() {
 const memory=vault(), a=await item(memory.app,'a1','실내 모형만 점검한다.');
 a.knowledge_domain='coding';
 a.compiled_sections=[{heading:'적용 조건',paragraphs:[{text:a.grounded_claims[0].text,claim_ids:[]}]}];
 const modal=review.open({app:memory.app,Modal:draftModal(),item:a});await modal.ready;
 return {...memory,a,modal,input:name=>modal.contentEl.querySelector(`[data-review-field="${name}"]`)};
}
test('A1 empty descriptive form reaches exact preview with only three decisions and explicit acknowledgement',async()=>{
 const {files,a,modal,input}=await reducedReviewFixture();
 for(const name of descriptiveNames){input(name).value='';await input(name).oninput();}
 for(const [name,value] of Object.entries({knowledge_kind:'claim',relation_status:'resolved',evidence_strength:'sufficient'})){input(name).value=value;await input(name).oninput();}
 await modal.contentEl.querySelector('[data-action="prepare-document-review"]').onclick();
 assert.equal(modal.contentEl.querySelector('[data-proposed-document]').getAttribute('data-exact-preview'),'true','descriptive required() must not prevent preparation from compiled content');
 const apply=modal.contentEl.querySelector('[data-action="apply-document-review"]'),ack=modal.contentEl.querySelector('[data-review-acknowledgement]');
 assert.equal(ack.checked,false);assert.equal(apply.disabled,true);await apply.onclick();
 assert.equal([...files.keys()].some(p=>p.startsWith('ZETA/PERMANENT')),false);
 const bytes=modal.contentEl.querySelectorAll('pre')[1].text;
 assert.ok(bytes.includes(a.grounded_claims[0].text));
 ack.checked=true;ack.onchange();await apply.onclick();
 assert.equal([...files.values()].find(f=>f.path.startsWith('ZETA/PERMANENT'))?.bytes,bytes);
});
test('A1 service accepts empty descriptive fields when analysis and compiled content satisfy frozen gates',async()=>{
 const {app,a}=await reducedReviewFixture();
 const result=await review.create({app}).prepare({item:a,fields:{...Object.fromEntries(descriptiveNames.map(n=>[n,''])),knowledge_kind:'claim',relation_status:'resolved',evidence_strength:'sufficient'}});
 assert.equal(result.ok,true,JSON.stringify(result));
});
test('A1 omitted optional controls serialize valid text without adding empty draft keys',async()=>{
 const {app,a}=await reducedReviewFixture(),fixture=await durableFixture(app,a),flow=review.create({app,...fixture});
 const p=await flow.prepare({item:a,fields:{knowledge_kind:'claim',relation_status:'resolved',evidence_strength:'sufficient'}});
 assert.equal(p.ok,true,JSON.stringify(p));
 const record=Object.values(fixture.jobStore.getPlanSnapshot(fixture.jobId).canonical_reviews)[0];
 for(const name of ['application_trigger','application_contexts','invalidation_conditions','definition','exclusions','outcome','rationale','steps'])assert.equal(Object.hasOwn(record.fields,name),false,name);
 assert.equal((await flow.apply(p.value,{approved:true,claims_accepted:true,packet_hash:p.value.packet_hash})).ok,true);
});
test('A1 initial disclosure contains only descriptive fields and three visible correctable recommendations',async()=>{
 const {modal,input}=await reducedReviewFixture(),root=modal.contentEl;
 const advanced=root.querySelector('[data-review-conditions]');assert.equal(Boolean(advanced.open),false);
 assert.deepEqual(root.querySelector('[data-review-group="human"]').querySelectorAll('[data-review-field]').map(n=>n.getAttribute('data-review-field')),['knowledge_kind','relation_status','evidence_strength']);
 for(const [name,value] of Object.entries({knowledge_kind:'claim',relation_status:'resolved',evidence_strength:'sufficient'})){
  assert.equal(input(name).value,value);
  assert.equal(advanced.querySelector(`[data-review-field="${name}"]`),null);
  assert.ok(input(name).parentElement.querySelector('[data-decision-suggestion]')?.textContent.length);
 }
 // Storage overrides are also advanced; they are not a fourth create-path decision.
 assert.deepEqual(advanced.querySelectorAll('[data-review-field]').map(n=>n.getAttribute('data-review-field')).sort(),[...descriptiveNames,'target_path'].sort());
 assert.equal(input('target_path').value,'new');
 assert.equal(input('classification').value,'epistemic');
 assert.equal(input('conditions').value,'실내 모형만 점검한다.');
 const count=Number(advanced.querySelector('summary').getAttribute('data-ai-filled-count'));
 assert.equal(count,advanced.querySelectorAll('[data-ai-prefilled="true"]').length);assert.ok(count>=3);
 const before=count;input('conditions').value='수정한 조건';await input('conditions').oninput();
 assert.equal(Number(advanced.querySelector('summary').getAttribute('data-ai-filled-count')),before-1);
});
test('A1b undecidable domains become one registered-domain choice rather than a silent preparation failure',async()=>{
 const {app}=vault(),a=await item(app,'a1b_domain','분야를 알 수 없는 점검 내용이다.');
 class Modal{constructor(){this.contentEl=new (require('./knowledge_explorer_view_fakes.js').FakeElement)('section');}open(){this.ready=this.onOpen();}}
 const modal=review.open({app,Modal,item:a});await modal.ready;
 const primary=modal.contentEl.querySelector('[data-review-group="human"]');
 const domain=modal.contentEl.querySelector('[data-review-field="knowledge_domain"]');
 assert.deepEqual(primary.querySelectorAll('[data-review-field]').map(node=>node.getAttribute('data-review-field')),['knowledge_kind','knowledge_domain','relation_status','evidence_strength']);
 assert.deepEqual(domain.children.map(option=>option.getAttribute('value')).filter(Boolean),registry.DOMAIN_ORDER);
 assert.ok(domain.parentElement.querySelector('[data-domain-choice-note]')?.textContent.includes('임의 분류'));
 const result=await review.create({app}).prepare({item:a,fields:{knowledge_kind:'claim',relation_status:'resolved',evidence_strength:'sufficient'}});
 assert.equal(result.reason,'domain_choice_required');assert.equal(result.field,'knowledge_domain');assert.deepEqual(result.candidates,registry.DOMAIN_ORDER);
});
test('A1b updates inherit an existing target invalidation rule and retain an explicit refusal when it is absent',async()=>{
 const {app}=vault(),flow=review.create({app});
 const base=await item(app,'a1b_rule_base','기존 규칙이 있는 점검 내용이다.');
 const seeded=await flow.prepare({item:base,fields:{...fields,invalidation_conditions:'원문 변경'}});
 const target=await flow.apply(seeded.value,{approved:true,claims_accepted:true,packet_hash:seeded.value.packet_hash});assert.equal(target.ok,true,JSON.stringify(target));
 const updateItem=await item(app,'a1b_rule_update','새 점검 내용을 추가한다.');updateItem.compiled_sections=[{heading:'적용 조건',paragraphs:[{text:'새 점검 내용을 추가한다.',claim_ids:[]}]}];
 const inherited=await flow.prepare({item:updateItem,fields:{knowledge_kind:'claim',relation_status:'resolved',evidence_strength:'sufficient'},target_path:target.target_path});
 assert.equal(inherited.ok,true,JSON.stringify(inherited));
 assert.deepEqual(store.parseLifecycleDocument(inherited.value.after).invalidation_conditions,['원문 변경']);
 assert.equal((await flow.apply(inherited.value,{approved:true,claims_accepted:true,packet_hash:inherited.value.packet_hash})).ok,true);
 const emptyBase=await item(app,'a1b_empty_base','재검토 규칙이 없는 기존 내용이다.');emptyBase.title='규칙 없는 모형 점검';
 const emptySeed=await flow.prepare({item:emptyBase,fields:{...fields,invalidation_conditions:''}});
 const emptyTarget=await flow.apply(emptySeed.value,{approved:true,claims_accepted:true,packet_hash:emptySeed.value.packet_hash});assert.equal(emptyTarget.ok,true,JSON.stringify(emptyTarget));
 const emptyUpdate=await item(app,'a1b_empty_update','재검토 규칙이 없는 새 내용이다.');emptyUpdate.title='규칙 없는 모형 점검';emptyUpdate.compiled_sections=[{heading:'적용 조건',paragraphs:[{text:'재검토 규칙이 없는 새 내용이다.',claim_ids:[]}]}];
 const pending=await flow.prepare({item:emptyUpdate,fields:{knowledge_kind:'claim',relation_status:'resolved',evidence_strength:'sufficient'},target_path:emptyTarget.target_path});
 assert.equal(pending.ok,true,JSON.stringify(pending));
 const refused=await flow.apply(pending.value,{approved:true,claims_accepted:true,packet_hash:pending.value.packet_hash});
 assert.equal(refused.reason,'invalidation_conditions_required');assert.equal(refused.writer_count,0);
});
for(const [name,value,reason] of [['classification','operational','operational_unit'],['classification','mixed','mixed_unit'],['relation_status','duplicate','unresolved_duplicate'],['relation_status','conflict','unresolved_conflict'],['relation_status','pending','unresolved_relation'],['evidence_strength','thin','thin_evidence']]){
 test(`A1 ${name}=${value} exposes its promotion consequence before prepare`,async()=>{
  const {app,a,files,input}=await reducedReviewFixture();
  const control=input(name);assert.ok(control.children.some(n=>n.getAttribute('value')===value));
  control.value=value;await control.oninput();
  const consequence=control.parentElement.querySelector('[data-promotion-block]');
  assert.ok(consequence,`${name}=${value} has no in-place consequence`);
  assert.equal(consequence.hidden,false);assert.equal(consequence.getAttribute('data-promotion-block'),reason);assert.ok(consequence.textContent.trim().length);
  const result=await review.create({app}).prepare({item:a,fields:{...fields,[name]:value}});
  assert.equal(result.reason,'promotion_review_required');assert.ok(result.promotion_gaps.some(g=>g.reason_code===reason));
  assert.equal([...files.keys()].some(p=>p.startsWith('ZETA/PERMANENT')),false);
  control.value=fields[name];await control.oninput();assert.equal(control.parentElement.querySelector('[data-promotion-block]'),null);
 });
}
test('A1 procedure content absent everywhere retains the frozen content gap instead of form-required errors',async()=>{
 const {app,a}=await reducedReviewFixture();a.outcome='점검한 모형';
 const result=await review.create({app}).prepare({item:a,fields:{...fields,knowledge_kind:'procedure',conditions:'',steps:'',outcome:''}});
 assert.equal(result.reason,'promotion_review_required',JSON.stringify(result));
 assert.deepEqual(result.promotion_gaps.map(g=>g.reason_code),['procedure_steps_required']);
});

for(const kind of ['claim','principle','procedure','concept']) {
 test(`A1 ${kind} uses named document sections for content gates without requiring duplicate typing`,async()=>{
  const {app,files}=vault();
  const content={application_trigger:['사용할 때','점검이 필요할 때'],application_contexts:['사용 맥락','실내 점검'],conditions:['적용 조건','실내 모형'],invalidation_conditions:['재검토 조건','원문 변경'],exclusions:['예외·금지','실외 적용 금지'],rationale:['원칙의 근거','실내 시험 결과에 근거한다.'],steps:['절차','모형의 상태를 확인한다.'],outcome:['기대 결과','점검 상태를 기록한다.'],definition:['개념 정의','점검은 모형 상태의 확인이다.']};
  const a=await item(app,`a1_sections_${kind}`,Object.values(content).map(([,text])=>text).join('\n'));
  a.knowledge_domain='coding';a.knowledge_topics=['ai'];a.knowledge_kind=kind;
  a.compiled_sections=Object.values(content).map(([heading,text])=>({heading,paragraphs:[{text,claim_ids:[]}]}));
  // Also cover the already-compiled Markdown fallback without a section envelope.
  if(kind==='concept'){a.document_body=a.compiled_sections.map(s=>`## ${s.heading}\n\n${s.paragraphs[0].text}`).join('\n\n');delete a.compiled_sections;}
  const modal=review.open({app,Modal:draftModal(),item:a});await modal.ready;
  for(const [name,[,text]] of Object.entries(content)) assert.equal(modal.contentEl.querySelector(`[data-review-field="${name}"]`).value,text,name);
  assert.equal(modal.contentEl.querySelector('[data-review-field="knowledge_topics"]').value,'ai');
  const flow=review.create({app}),p=await flow.prepare({item:a,fields:{...Object.fromEntries(descriptiveNames.map(n=>[n,''])),knowledge_kind:kind,relation_status:'resolved',evidence_strength:'sufficient'}});
  assert.equal(p.ok,true,JSON.stringify(p));
  for(const decision of [{approved:true,claims_accepted:false,packet_hash:p.value.packet_hash},{approved:true,claims_accepted:true,packet_hash:hash.sha256('not the displayed packet')}]) assert.equal((await flow.apply(p.value,decision)).reason,'explicit_exact_approval_required');
  assert.equal((await flow.apply({...p.value},{approved:true,claims_accepted:true,packet_hash:p.value.packet_hash})).reason,'explicit_exact_approval_required');
  assert.equal([...files.keys()].some(path=>path.startsWith('ZETA/PERMANENT')),false);
  const made=await flow.apply(p.value,{approved:true,claims_accepted:true,packet_hash:p.value.packet_hash});assert.equal(made.ok,true,JSON.stringify(made));
  assert.equal(files.get(made.target_path).bytes,p.value.after);
 });
}
test('A1 corrected blocking decisions survive durable remount without becoming approval',async()=>{
 const {app,a}=await reducedReviewFixture(),fixture=await durableFixture(app,a),Modal=draftModal();
 const modal=review.open({app,Modal,item:a,...fixture});await modal.ready;
 const corrected={knowledge_kind:'principle',relation_status:'conflict',evidence_strength:'thin',classification:'mixed'};
 for(const [name,value] of Object.entries(corrected)){const input=modal.contentEl.querySelector(`[data-review-field="${name}"]`);input.value=value;await input.oninput();}
 await modal.close();
 const reopened=review.open({app:{...app},Modal,item:a,jobId:fixture.jobId,jobStore:jobs.createBatchJobStore({storage:fixture.storage})});await reopened.ready;
 for(const [name,value] of Object.entries(corrected))assert.equal(reopened.contentEl.querySelector(`[data-review-field="${name}"]`).value,value);
 assert.equal(reopened.contentEl.querySelectorAll('[data-promotion-block]').length,3);
 assert.equal(reopened.contentEl.querySelector('[data-review-conditions]').open,true);
 assert.equal(reopened.contentEl.querySelector('[data-review-acknowledgement]').checked,false);
 assert.equal(reopened.contentEl.querySelector('[data-action="apply-document-review"]').disabled,true);
});

test('current-session explicit corrections and clears survive targets while incompatible topics stay editable', async () => {
 const {FakeElement}=require('./knowledge_explorer_view_fakes.js');
 const {app,files}=vault(),flow=review.create({app});
 const a=await item(app,'touched_base','Existing source fact.');
 const initial=await flow.prepare({item:a,fields});
 const made=await flow.apply(initial.value,{approved:true,claims_accepted:true,packet_hash:initial.value.packet_hash});
 const b=await item(app,'touched_new','New source fact.');b.plan_purpose='Suggested purpose';
 class Modal{constructor(){this.contentEl=new FakeElement('section');}open(){this.ready=this.onOpen();}}
 const modal=review.open({app,Modal,item:b});await modal.ready;
 const input=name=>modal.contentEl.querySelector(`[data-review-field="${name}"]`);
 input('application_trigger').value='';input('application_trigger').oninput();
 input('knowledge_topics').value='ai';input('knowledge_topics').oninput();
 input('knowledge_domain').value='wedding';input('knowledge_domain').oninput();
 assert.equal(input('knowledge_topics').value,'ai','domain change must not discard a deliberate topic correction');
 input('target_path').value=made.target_path;await input('target_path').oninput();
 assert.equal(input('application_trigger').value,'','clear outranks intended-target defaults and fresh suggestions');
 assert.equal(input('knowledge_topics').value,'ai');
 assert.equal(input('knowledge_domain').value,'wedding');
 assert.equal(input('application_trigger').parentElement.attr['data-ai-prefilled'],undefined);
 for(const [key,value] of Object.entries({...fields,knowledge_domain:'wedding',application_trigger:'User value'})) {input(key).value=value;await input(key).oninput();}
 await modal.contentEl.querySelector('[data-action="prepare-document-review"]').onclick();
 assert.equal(modal.contentEl.querySelector('[data-action="apply-document-review"]').disabled,true);
 assert.equal(input('knowledge_topics').value,'ai');
 assert.equal(files.get(made.target_path).bytes,initial.value.after);
});
