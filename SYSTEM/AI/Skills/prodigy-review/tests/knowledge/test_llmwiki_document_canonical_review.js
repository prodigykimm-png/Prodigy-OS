"use strict";
const test = require("node:test"), assert = require("node:assert/strict"), path = require("node:path");
const V = path.resolve(__dirname, "../../../../../Views");
const review = require(path.join(V, "llmwiki-document-canonical-review.js"));
const store = require(path.join(V, "knowledge-candidate-store.js"));
const hash = require(path.join(V, "llmwiki-hash.js"));
const jobs = require(path.join(V, "llmwiki-batch-job-store.js"));
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
test('identical re-review with removed exclusions or conflict relation is not no_change',async()=>{
 const {app,files}=vault();
 const a=await item(app,'eq','실내 모형만 점검한다.');
 const flow=await jobBackedFlow(app,a);
 const withExclusions={...fields,exclusions:'실외 적용 금지'};
 const p=await flow.prepare({item:a,fields:withExclusions});assert.equal(p.ok,true,JSON.stringify(p));
 const first=await flow.apply(p.value,{approved:true,claims_accepted:true,packet_hash:p.value.packet_hash});assert.equal(first.ok,true,JSON.stringify(first));
 const same=await flow.prepare({item:a,fields:withExclusions,target_path:first.target_path});
 assert.equal(same.ok,true,JSON.stringify(same));
 assert.equal(same.status,'no_change',JSON.stringify(same));
 const dropped=await flow.prepare({item:a,fields,target_path:first.target_path});
 assert.equal(dropped.ok,true,JSON.stringify(dropped));
 assert.equal(dropped.status,'review',JSON.stringify(dropped));
 const conflicted=await flow.prepare({item:a,fields:{...withExclusions,relation_status:'conflict'},target_path:first.target_path});
 assert.equal(conflicted.ok,false);
 assert.equal(conflicted.reason,'promotion_review_required',JSON.stringify(conflicted));
 const rationale=await flow.prepare({item:a,fields:{...withExclusions,knowledge_kind:'principle',rationale:'왜냐하면 그렇다.'},target_path:first.target_path});
 assert.equal(rationale.ok,true,JSON.stringify(rationale));
 assert.equal(rationale.status,'review',JSON.stringify(rationale));
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
 const sourceButton=find(modal.contentEl,n=>n.tag==='button'&&n.text===a.grounded_claims[0].citations[0].locator)[0];sourceButton.onclick();assert.equal(openedCitations[0].locator,a.grounded_claims[0].citations[0].locator);assert.equal(openedCitations[0].citation.evidence_quote,a.grounded_claims[0].citations[0].evidence_quote);
 assert.equal([...files.keys()].filter(p=>p.startsWith('ZETA/PERMANENT')).length,0);
 for(const [key,value] of Object.entries({target_path:'new',...fields})) { const input=find(modal.contentEl,n=>n.attr?.['data-review-field']===key)[0];assert.ok(input,key);input.value=value;await input.oninput(); }
 const prepareButton=find(modal.contentEl,n=>n.tag==='button'&&n.text==='변경 미리보기')[0];await prepareButton.onclick();
 const preview=find(modal.contentEl,n=>n.tag==='pre');assert.equal(preview.length,2);assert.ok(preview[1].text.includes(a.grounded_claims[0].text));
 const applyButton=find(modal.contentEl,n=>n.tag==='button'&&n.text==='승인한 변경 적용')[0];
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
 assert.equal(rationale.hidden,true);assert.equal(steps.hidden,true);kind.value='procedure';kind.oninput();assert.equal(steps.hidden,false);assert.equal(rationale.hidden,true);
 kind.value='principle';kind.oninput();assert.equal(steps.hidden,true);assert.equal(rationale.hidden,false);
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
  await find(modal.contentEl,n=>n.tag==='button'&&n.text==='변경 미리보기')[0].onclick();
  const modify=app.vault.modify;let failed=false,canonicalModifications=0;
  app.vault.modify=async(f,bytes)=>{if(f.path===created.target_path)canonicalModifications++;if(!failed&&f.path.includes('.llmwiki-audit/')&&bytes.includes('"result": "committed"')){failed=true;throw new Error('post write interruption');}return modify(f,bytes);};
  let checkbox=find(modal.contentEl,n=>n.attr?.type==='checkbox')[0];checkbox.checked=true;checkbox.onchange();await find(modal.contentEl,n=>n.tag==='button'&&n.text==='승인한 변경 적용')[0].onclick();
  assert.equal(failed,true);assert.equal(canonicalModifications,1);assert.equal((await flow.targets()).length,0);
  modal.close();
  if(userEdit)files.get(created.target_path).bytes+='\n후속 사용자 메모 — 보존해야 함\n';
  const beforeResume=files.get(created.target_path).bytes;
  const reopened=review.open({app,Modal,item:b});assert.equal(reopened,modal);await reopened.ready;
  assert.equal(find(reopened.contentEl,n=>n.tag==='pre').length,2);
  checkbox=find(reopened.contentEl,n=>n.attr?.type==='checkbox')[0];assert.equal(checkbox.checked,false);
  const retry=find(reopened.contentEl,n=>n.tag==='button'&&n.text==='같은 승인 변경 재시도')[0];assert.equal(retry.disabled,true);await retry.onclick();assert.equal(canonicalModifications,1);
  checkbox.checked=true;checkbox.onchange();await retry.onclick();assert.equal(canonicalModifications,1);assert.equal(files.get(created.target_path).bytes,beforeResume);
  if(userEdit){assert.ok(find(reopened.contentEl,n=>n.attr?.role==='status')[0].text.includes('검토'));assert.equal((await flow.targets()).length,0);}
  else{assert.equal((await flow.targets()).length,1);assert.ok(find(reopened.contentEl,n=>n.attr?.role==='status')[0].text.includes('완료'));}
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
 assert.equal(input('relation_status').value,'');assert.equal(input('evidence_strength').value,'');
 const inherited=find(modal.contentEl,n=>n.tag==='details'&&n.children.some(c=>c.text==='기존 분류·적용 조건 확인 및 수정'))[0];assert.ok(inherited);assert.ok(find(inherited,n=>n.attr?.['data-review-field']==='conditions').length);
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
 await find(modal.contentEl,n=>n.tag==='button'&&n.text==='변경 미리보기')[0].onclick();
 assert.ok(find(modal.contentEl,n=>n.tag==='pre').some(n=>n.text===a.document_body));
 assert.equal(find(modal.contentEl,n=>n.tag==='button'&&n.text==='승인한 변경 적용')[0].disabled,true);
 assert.equal([...files.keys()].filter(p=>p.startsWith('ZETA/PERMANENT')).length,0);
});

test('new review reuses actual analysis text only after selection and offers registered topics',async()=>{
 const {FakeElement}=require('./knowledge_explorer_view_fakes.js');
 const find=(node,pred)=>[...(pred(node)?[node]:[]),...(node.children||[]).flatMap(c=>find(c,pred))];
 const {app,files}=vault();const a=await item(app,'explicit_reuse','실내 모형에만 적용하며 실외에서는 금지한다.');a.plan_purpose='실내 모형 점검 기준 정리';
 class Modal{constructor(){this.contentEl=new FakeElement('section');}open(){this.ready=this.onOpen();}}
 const modal=review.open({app,Modal,item:a});await modal.ready;
 const input=name=>find(modal.contentEl,n=>n.attr?.['data-review-field']===name)[0];
 assert.equal(input('conditions').value,'');assert.equal(input('application_trigger').value,'');
 const choose=find(modal.contentEl,n=>n.attr?.['data-analysis-reuse']==='conditions')[0];choose.value='0';choose.onchange();assert.equal(input('conditions').value,a.grounded_claims[0].text);
 choose.value='0';choose.onchange();assert.equal(input('conditions').value,a.grounded_claims[0].text);
 find(modal.contentEl,n=>n.tag==='button'&&n.text===`분석된 사용 목적 사용: ${a.plan_purpose}`)[0].onclick();assert.equal(input('application_trigger').value,a.plan_purpose);
 input('knowledge_domain').value='coding';input('knowledge_domain').oninput();
 const topics=find(modal.contentEl,n=>n.attr?.['data-topic-options']==='true')[0];assert.ok(topics.children.some(n=>n.attr?.value==='ai'));
 topics.value='ai';topics.onchange();assert.equal(input('knowledge_topics').value,'ai');
 topics.value='invented';topics.onchange();assert.equal(input('knowledge_topics').value,'ai');
 input('knowledge_domain').value='';input('knowledge_domain').oninput();assert.equal(input('knowledge_topics').value,'');
 assert.equal(input('relation_status').value,'');assert.equal(input('evidence_strength').value,'');assert.equal(input('invalidation_conditions').value,'');
 assert.equal([...files.keys()].filter(p=>p.startsWith('ZETA/PERMANENT')).length,0);
});
test('new review suggests domain/topic candidates from related documents without auto-filling',async()=>{
 const {FakeElement}=require('./knowledge_explorer_view_fakes.js');
 const find=(node,pred)=>[...(pred(node)?[node]:[]),...(node.children||[]).flatMap(c=>find(c,pred))];
 const {app,files}=vault();
 await app.vault.create('ZETA/PERMANENT/관련.md','---\nknowledge_domain: coding\nknowledge_topics: ["ai"]\n---\n관련 본문\n');
 await app.vault.create('ZETA/PERMANENT/무관.md','---\nknowledge_domain: bogus\nknowledge_topics: ["invented"]\n---\n무관 본문\n');
 const a=await item(app,'cand','후보 문서 내용이다.');
 a.related_knowledge=[{title:'관련',path:'ZETA/PERMANENT/관련.md',relation:'overlap'},{title:'무관',path:'ZETA/PERMANENT/무관.md',relation:'overlap'},{title:'없음',path:'ZETA/PERMANENT/없음.md',relation:'overlap'}];
 class Modal{constructor(){this.contentEl=new FakeElement('section');}open(){this.ready=this.onOpen();}}
 const modal=review.open({app,Modal,item:a});await modal.ready;
 const input=name=>find(modal.contentEl,n=>n.attr?.['data-review-field']===name)[0];
 assert.equal(input('knowledge_domain').value,'');
 assert.equal(input('knowledge_topics').value,'');
 const box=find(modal.contentEl,n=>n.attr?.['data-candidates']==='domain-topic')[0];
 assert.ok(box);
 const chip=text=>find(box,n=>n.tag==='button'&&n.text===text)[0];
 assert.ok(chip('도메인 coding (1)'));
 assert.ok(chip('주제 ai (1)'));
 assert.equal(chip('도메인 bogus (1)'),undefined);
 chip('주제 ai (1)').onclick();
 assert.equal(input('knowledge_domain').value,'coding');
 assert.equal(input('knowledge_topics').value,'ai');
 chip('주제 ai (1)').onclick();
 assert.equal(input('knowledge_topics').value,'ai');
 assert.equal([...files.keys()].filter(p=>p.startsWith('ZETA/PERMANENT/관련')).length,1);
});
