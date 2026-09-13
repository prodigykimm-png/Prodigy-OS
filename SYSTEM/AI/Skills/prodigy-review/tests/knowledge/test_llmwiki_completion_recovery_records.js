"use strict";
const test = require('node:test'), assert = require('node:assert/strict'), path = require('node:path');
const V = path.resolve(__dirname, '../../../../../Views');
const hash = require(path.join(V, 'llmwiki-hash.js'));
const jobs = require(path.join(V, 'llmwiki-batch-job-store.js'));
const writer = require(path.join(V, 'llmwiki-operation-writer.js'));
const reader = require(path.join(V, 'llmwiki-resurfacing-read-adapter.js'));
const candidate = require(path.join(V, 'knowledge-candidate-store.js'));
const fields = {knowledge_kind:'claim',knowledge_domain:'coding',knowledge_topics:'ai',application_trigger:'Review',application_contexts:'coding/ai',conditions:'Indoor',invalidation_conditions:'Source change',relation_status:'resolved',classification:'epistemic',evidence_strength:'sufficient'};
const identity = {provider_key:'mock',model:'mock/frozen-model',structured_mode:'json_schema',schema_id:'compact',prompt_version:'mock_prompt_v1',candidate_context_hash:hash.sha256('context')};
async function fixture(t) {
  const files = new Map(), disk = new Map(), counters = {writer:0,canonical:0,provider:0,checkpoint:0,readback:0};
  const app = {vault:{getAbstractFileByPath:p=>files.get(p)||null,getFiles:()=>[...files.values()],createFolder:async()=>{},read:async f=>f.bytes,
    create:async(p,bytes)=>{if(p.startsWith('ZETA/PERMANENT/'))counters.canonical++;const f={path:p,bytes,extension:p.endsWith('.md')?'md':'json',basename:path.basename(p,'.md')};files.set(p,f);return f;},
    modify:async(f,bytes)=>{if(f.path.startsWith('ZETA/PERMANENT/'))counters.canonical++;f.bytes=bytes;}},metadataCache:{getFileCache:f=>({frontmatter:candidate.parseLifecycleDocument(f.bytes)})}};
  const storage={exists:async k=>disk.has(k),read:async k=>disk.get(k),writeAtomic:async(k,v)=>{counters.checkpoint++;disk.set(k,v);},quarantine:async()=>{throw Error('unexpected_quarantine');}};
  const sourcePath='INBOX/QA/recovery.md',body='Selected evidence.\nRAW_SOURCE_BODY_SENTINEL not needed for the claim.';
  await app.vault.create(sourcePath,body);
  const item={review_id:'review_completion',title:'Recovery fixture',document_body:'## Rule\nSelected evidence.',grounded_claims:[{text:'Selected evidence.',citations:[{source_id:'source_completion',source_path:sourcePath,locator:sourcePath+'#L1',content_hash:hash.sha256(body),evidence_quote:'Selected evidence.'}]}]};
  const jobStore={...jobs.createBatchJobStore({storage})};await jobStore.load();
  const job=await jobStore.createJob({request_key:hash.sha256('completion'),sources:[{source_id:'source_completion',revision_hash:hash.sha256(body)}],frozen_identity:identity});
  await jobStore.savePlanSnapshot({job_id:job.job_id,source_id:'source_completion',source_revision:hash.sha256(body),inventory_hash:hash.sha256('inventory'),plan_hash:hash.sha256('plan'),plan_revision:1,status:'compiled',plan:{plan_version:'fixture_plan_v1',pages:[]}});
  const seam={cut:'',cutReached:false};
  const priorWriter=global.LLMWikiOperationWriter,priorReader=global.LLMWikiResurfacingReadAdapter;
  global.LLMWikiOperationWriter={...writer,...Object.fromEntries(['commitApprovedCanonicalV2','commitApprovedUpdate'].map(method=>[method,async(...args)=>{
    counters.writer++;
    if(seam.cut==='R1'){seam.cutReached=true;throw Error('mock_interrupt_before_writer');}
    const result=await writer[method](...args);
    if(seam.cut==='R2'&&result.status==='committed'){seam.cutReached=true;throw Error('mock_interrupt_after_committed');}
    return result;
  }]))};
  global.LLMWikiResurfacingReadAdapter={create:()=>({read:async args=>{counters.readback++;return reader.create().read(args);}})};
  const file=path.join(V,'llmwiki-document-canonical-review.js');
  delete require.cache[require.resolve(file)];
  let review;
  if(process.env.TASK9_MUTATION==='reenter') {
    const Module=require('node:module'),m=new Module(file,module);m.filename=file;m.paths=module.paths;
    const original=require('node:fs').readFileSync(file,'utf8');
    assert.ok(original.includes('committed: finalized ? { status: "committed" } : null'));
    m._compile(original.replace('committed: finalized ? { status: "committed" } : null','committed: null'),file);review=m.exports;
  } else review=require(file);
  t.after(()=>{global.LLMWikiOperationWriter=priorWriter;global.LLMWikiResurfacingReadAdapter=priorReader;delete require.cache[require.resolve(file)];});
  const options={app,jobStore,jobId:job.job_id};
  return {app,files,storage,disk,counters,item,jobStore,jobId:job.job_id,review,seam,options,flow:review.create(options),record:()=>Object.values(jobStore.getPlanSnapshot(job.job_id).canonical_reviews||{})[0]};
}
const decision=p=>({approved:true,claims_accepted:true,packet_hash:p.packet_hash});
test('task10 mock durable attempt joins source target frozen model versions and excludes raw bodies',async t=>{
  const h=await fixture(t),p=await h.flow.prepare({item:h.item,fields});
  assert.equal((await h.flow.apply(p.value,decision(p.value))).ok,true);
  const reloaded=jobs.createBatchJobStore({storage:h.storage});await reloaded.load();
  const attempts=reloaded.getJob(h.jobId).attempts;
  assert.ok(Array.isArray(attempts)&&attempts.length,'persisted record missing joined attempt');
  const committed=attempts.findLast(a=>a.disposition==='committed');assert.ok(committed);
  assert.equal(committed.run_id,h.jobId);assert.ok(committed.attempt_id);assert.ok(committed.previous_attempt_id);
  assert.deepEqual(committed.sources,[{source_id:'source_completion',version:h.item.grounded_claims[0].citations[0].content_hash}]);
  assert.equal(committed.target.path,p.value.target_path);assert.equal(committed.target.base_revision,hash.sha256(''));
  assert.equal(committed.references.review_id,h.item.review_id);assert.equal(committed.references.packet_hash,p.value.packet_hash);assert.ok(committed.references.proposal_id);
  assert.equal(committed.provider.provider_key,identity.provider_key);assert.equal(committed.provider.model,identity.model);assert.equal(committed.versions.prompt,identity.prompt_version);
  assert.ok(committed.versions.modules.batch_job_store);assert.ok(committed.versions.modules.document_review);
  assert.ok(Number.isFinite(Date.parse(committed.time)));assert.equal(committed.stage,'checkpoint');
  assert.doesNotMatch(JSON.stringify(attempts),/RAW_SOURCE_BODY_SENTINEL|Selected evidence\.|api_key|raw_prompt/);
});
test('task10 mock correction failure and held disposition remain distinct across durable retry',async t=>{
  const h=await fixture(t),p=await h.flow.prepare({item:h.item,fields});
  const next=await h.flow.prepare({item:h.item,fields:{...fields,conditions:'Owner correction'}});assert.equal(next.ok,true,next.reason);
  await h.jobStore.setJobState(h.jobId,'blocked','provider_transport_error');
  await h.jobStore.setPlanStatus(h.jobId,hash.sha256('plan'),'cancelled');
  const child=await h.jobStore.claimExplicitRetry({retry_parent_job_id:h.jobId,retry_intent_id:'explicit_retry',request_key:hash.sha256('new model'),sources:[{source_id:'source_completion',revision_hash:h.item.grounded_claims[0].citations[0].content_hash}],frozen_identity:{...identity,model:'mock/new-model'}});
  const reloaded=jobs.createBatchJobStore({storage:h.storage});await reloaded.load();
  const attempts=reloaded.getJob(h.jobId).attempts||[];
  const correction=attempts.find(a=>a.kind==='correction');assert.ok(correction,'correction collapsed or absent');
  assert.ok(correction.correction_delta.some(d=>d.field==='conditions'&&d.before_hash===hash.sha256(JSON.stringify(fields.conditions))&&d.after_hash===hash.sha256(JSON.stringify('Owner correction'))));
  const delta=correction.correction_delta.find(d=>d.field==='conditions');
  assert.equal(delta.before,fields.conditions,'correction must retain the before value, not only a digest');assert.equal(delta.after,'Owner correction');
  assert.equal(correction.disposition,null);assert.equal(correction.applies_automatically,false);
  assert.ok(attempts.some(a=>a.kind==='failure'&&a.disposition==='failed'&&a.observation==='provider_transport_error'),'failure collapsed or absent');
  assert.ok(attempts.some(a=>a.disposition==='held/no-change'),'hold collapsed or absent');
  const retry=reloaded.getJob(child.job_id).attempts[0];assert.equal(retry.previous_attempt_id,attempts.at(-1).attempt_id);assert.equal(retry.provider.model,'mock/new-model');
  assert.equal(p.value.after.includes('Owner correction'),false);
});
test('task10 mock generated plan changes are observations; explicit plan corrections retain deltas',async t=>{
  const h=await fixture(t),prior=h.jobStore.getPlanSnapshot(h.jobId);
  const seed={...prior,plan_revision:2,plan:{...prior.plan,pages:[{page_id:'page_test',title:'Generated title',purpose:'Review',selected:true,claim_ids:[],target_candidate_ids:[],operation_hint:'create'}]}};
  await h.jobStore.savePlanSnapshot(seed);
  assert.equal(h.jobStore.getJob(h.jobId).attempts.at(-1).kind,'observation','machine plan change mislabelled as user correction');
  await h.jobStore.savePlanSnapshot({...seed,plan_revision:3,plan:{...seed.plan,pages:[{...seed.plan.pages[0],title:'Owner title'}]},review_event:{action:'retitle_page',taxonomy_tags:['coding/ai'],reason:'Match my scope'}});
  const last=h.jobStore.getJob(h.jobId).attempts.at(-1);assert.equal(last.kind,'correction');
  assert.equal(last.correction_action,'retitle_page');assert.deepEqual(last.taxonomy_tags,['coding/ai']);assert.equal(last.correction_reason,'Match my scope');
  assert.ok(last.correction_delta.some(d=>d.field==='page_test:title'&&d.before==='Generated title'&&d.after==='Owner title'));
});
test('task10 mock first preparation-free correction is an explicit delta',async t=>{
  const h=await fixture(t),plan=h.jobStore.getPlanSnapshot(h.jobId);
  await h.flow.saveDraft(h.item,{fields:{application_trigger:'Owner first edit'},touched:{application_trigger:true},cleared:{},target_path:'',target_revision:null,source_revision:plan.source_revision,plan_hash:plan.plan_hash,item_hash:hash.sha256('item'),sources:[{source_id:'source_completion',source_path:'INBOX/QA/recovery.md',content_hash:plan.source_revision}],edit_revision:1});
  const last=h.jobStore.getJob(h.jobId).attempts.at(-1);assert.equal(last.kind,'correction','first correction missing');assert.equal(last.correction_delta[0].after,'Owner first edit');
});
test('task10 mock explicit hold retains optional user reason without capturing provider secrets',async t=>{
  const h=await fixture(t);await h.flow.prepare({item:h.item,fields});
  assert.equal((await h.flow.hold(h.item,'Not relevant to this album')).ok,true);
  const reloaded=jobs.createBatchJobStore({storage:h.storage});await reloaded.load();
  const held=reloaded.getJob(h.jobId).attempts.at(-1);assert.equal(held.disposition,'held/no-change');assert.equal(held.correction_reason,'Not relevant to this album');
  const other=await h.jobStore.createJob({request_key:hash.sha256('secret fixture'),sources:[{source_id:'source_private',revision_hash:hash.sha256('body')}],frozen_identity:{...identity,api_key:'CREDENTIAL_SENTINEL',raw_prompt:'RAW_PROMPT_SENTINEL'}});
  assert.doesNotMatch(JSON.stringify(h.jobStore.getJob(other.job_id)),/CREDENTIAL_SENTINEL|RAW_PROMPT_SENTINEL/);
});
test('task10 mock optional attempt fields reject invalid records while legacy remains readable',async t=>{
  const h=await fixture(t),state=JSON.parse(h.disk.get(jobs.STATE_FILE));
  state.jobs[h.jobId].attempts=[{raw_prompt:'RAW_PROMPT_SENTINEL',disposition:'success'}];h.disk.set(jobs.STATE_FILE,JSON.stringify(state));
  let quarantines=0;const storage={...h.storage,quarantine:async()=>{quarantines++;}};
  await jobs.createBatchJobStore({storage}).load();assert.equal(quarantines,1,'invalid optional attempt was accepted');
  delete state.jobs[h.jobId].attempts;h.disk.set(jobs.STATE_FILE,JSON.stringify(state));
  const legacy=jobs.createBatchJobStore({storage});await legacy.load();assert.ok(legacy.getJob(h.jobId));assert.equal(quarantines,1);
});
test('task10 mock existing recovery outcomes join the durable job without copying operation bodies',async t=>{
  const h=await fixture(t),target='ZETA/PERMANENT/recovery-outcome.md';
  const recovery={active_tab:'llmwiki',selected_batch_id:h.jobId,review:{run_id:'run_existing_recovery',selected_operation_ids:[],proposals:[{operation_id:'operation_existing',packet_id:'packet_existing',serialized_operation:JSON.stringify({destination_ids:[target],base_revisions:{[target]:hash.sha256('base')},after_bytes:{[target]:'RAW_OPERATION_BODY_SENTINEL'}})}]},operation_outcomes:[{operation_id:'operation_existing',status:'committed'}]};
  await h.jobStore.saveRecoverySnapshot(recovery);
  const attempts=h.jobStore.getJob(h.jobId).attempts,last=attempts.at(-1);
  assert.equal(last.disposition,'committed','existing recovery outcome missing from joined attempts');assert.equal(last.target.path,target);assert.equal(last.references.review_id,'packet_existing');assert.equal(last.run_id,'run_existing_recovery');
  assert.doesNotMatch(JSON.stringify(attempts),/RAW_OPERATION_BODY_SENTINEL/);
  const writes=h.counters.checkpoint;await h.jobStore.saveRecoverySnapshot(recovery);assert.equal(h.counters.checkpoint,writes);
});
test('task10 mock operation outcome replay does not persist a duplicate checkpoint',async()=>{
  const api=require(path.join(V,'llmwiki-operation-outcome-persistence.js'));const disk=new Map();let writes=0;
  const store={save:async value=>{writes++;disk.set(value.run_id,value);},load:async id=>disk.get(id)||null};
  const value={outcome_version:'llmwiki_operation_run_outcome_v1',run_id:'run_record',run_revision:1,status:'no_change'};
  const a=api.create(store);await a.persist(value);const b=api.create(store);await b.load(value.run_id);await b.persist(value);
  assert.equal(writes,1,'duplicate outcome checkpoint write on replay');
});
for(const cut of ['R1','R2','R3']) test(`task9 mock ${cut}: restart retains exact draft and distinct recovery authority`,{timeout:5000},async t=>{
  const h=await fixture(t),p=await h.flow.prepare({item:h.item,fields});assert.equal(p.ok,true,p.reason);
  h.seam.cut=cut;
  const save=h.jobStore.savePlanSnapshot;
  if(cut==='R3')h.jobStore.savePlanSnapshot=async s=>{if(Object.values(s.canonical_reviews||{}).some(r=>r.status==='resolved')){h.seam.cutReached=true;throw Error('mock_resolved_checkpoint_failure');}return save(s);};
  const interrupted=await h.flow.apply(p.value,decision(p.value));assert.equal(interrupted.ok,false);assert.equal(h.seam.cutReached,true);
  assert.equal(h.counters.canonical,cut==='R1'?0:1);assert.equal(h.record().status,'running');assert.deepEqual(h.record().fields,fields);
  const adapter=require(path.join(V,'llmwiki-obsidian-adapter.js')).createObsidianAdapter(h.app);
  assert.equal((await adapter.readFinalizedCanonicalAuthorities()).length,cut==='R1'?0:1);
  assert.equal(h.counters.readback,cut==='R3'?1:0,'exact reader cut');
  if(cut==='R3')assert.ok(h.jobStore.getJob(h.jobId).attempts.some(a=>a.disposition==='committed-refresh-pending'));
  else assert.equal(h.jobStore.getJob(h.jobId).attempts.at(-1).disposition,'outcome_unknown','an interrupted writer is not proof of a failed write');
  h.seam.cut='';const reloaded=jobs.createBatchJobStore({storage:h.storage}),flow=h.review.create({...h.options,jobStore:reloaded});
  const restored=await flow.restore(h.item);assert.equal(restored.ok,true,restored.reason);
  const before={...h.counters};
  if(cut==='R1') {
    assert.equal(restored.requires_new_approval,true);assert.equal((await flow.apply(restored.value,{approved:false})).ok,false);
    assert.equal(h.counters.canonical,0);assert.equal((await flow.apply(restored.value,decision(restored.value))).ok,true);
  } else {
    assert.equal(restored.refresh_only,true);
    assert.equal((await flow.apply(restored.value,decision(restored.value))).ok,true);
    assert.equal(h.counters.writer,before.writer,`${cut} re-entered canonical writer`);
  }
  assert.equal(h.counters.canonical,1);assert.equal(h.counters.provider,0);
  const checkpoint=h.counters.checkpoint;
  assert.equal((await flow.refresh(restored.value)).ok,true);
  assert.equal((await flow.restore(h.item)).status,'completed');
  assert.equal(h.counters.checkpoint,checkpoint,'duplicate resume writes nothing');
});
for(const mode of ['equal_without_audit','missing_audit','tampered_audit']) test(`task9 mock R4 ${mode}: equal bytes are not operation evidence`,async t=>{
  const h=await fixture(t);
  // Update is essential: the old update bridge manufactured an audit from equal bytes.
  const first=await h.flow.prepare({item:h.item,fields});assert.equal((await h.flow.apply(first.value,decision(first.value))).ok,true);
  const p=await h.flow.prepare({item:h.item,fields:{...fields,conditions:'Owner correction'},target_path:first.value.target_path});assert.equal(p.ok,true,p.reason);
  if(mode==='equal_without_audit')h.files.get(p.value.target_path).bytes=p.value.after;
  else {
    h.seam.cut='R2';assert.equal((await h.flow.apply(p.value,decision(p.value))).ok,false);h.seam.cut='';
    const audit=[...h.files.values()].find(f=>f.path.startsWith('.llmwiki-audit/immutable/')&&f.path.endsWith('.json')&&f.bytes.includes(p.value.packet_hash));assert.ok(audit);
    if(mode==='missing_audit')h.files.delete(audit.path);else audit.bytes=audit.bytes.replace('canonical_committed','tampered_committed');
  }
  const before={...h.counters},flow=h.review.create({...h.options,jobStore:jobs.createBatchJobStore({storage:h.storage})});
  const restored=await flow.restore(h.item);
  const observed=restored.ok&&restored.value?await flow.apply(restored.value,decision(restored.value)):restored;
  assert.equal(observed.ok,false,'R4 reported as success');
  assert.equal(restored.reason,'outcome_unknown','R4 must stop before offering re-approval');
  assert.equal(h.counters.writer,before.writer,'R4 must not enter the writer');assert.equal(h.counters.canonical,before.canonical);assert.equal(h.counters.provider,0);
  assert.equal(h.files.get(p.value.target_path).bytes,p.value.after);
  assert.equal((await flow.restore(h.item)).reason,'outcome_unknown');
});
for(const corrupt of [false,true]) test(`task9 mock R4 ${corrupt?'malformed':'missing'} write-ahead audit cannot use a persisted pending label as authority`,async t=>{
  const h=await fixture(t),p=await h.flow.prepare({item:h.item,fields});
  const modify=h.app.vault.modify;h.app.vault.modify=async(f,bytes)=>{if(f.path.startsWith('.llmwiki-audit/'))throw Error('mock_finalize_failure');return modify(f,bytes);};
  const applied=await h.flow.apply(p.value,decision(p.value));assert.equal(applied.ok,false);assert.equal(h.record().status,'blocked');assert.ok(h.record().outcome.repair);
  if(corrupt)h.files.get(h.record().outcome.repair.audit_path).bytes='{tampered';else h.files.delete(h.record().outcome.repair.audit_path);h.app.vault.modify=modify;
  const restored=await h.review.create({...h.options,jobStore:jobs.createBatchJobStore({storage:h.storage})}).restore(h.item);
  assert.equal(restored.reason,'outcome_unknown','pending label cannot replace missing operation evidence');assert.equal(h.counters.writer,1);assert.equal(h.counters.canonical,1);
});
test('task9 mock concurrent refresh replay writes one resolved checkpoint',{timeout:5000},async t=>{
  const h=await fixture(t),p=await h.flow.prepare({item:h.item,fields});h.seam.cut='R2';await h.flow.apply(p.value,decision(p.value));h.seam.cut='';
  const flow=h.review.create(h.options),r=await flow.restore(h.item);assert.equal(r.ok,true,r.reason);
  const save=h.jobStore.savePlanSnapshot;let checkpoints=0;
  h.jobStore.savePlanSnapshot=async s=>{if(Object.values(s.canonical_reviews||{}).some(r=>r.status==='resolved'))checkpoints++;return save(s);};
  const results=await Promise.all([flow.refresh(r.value),flow.refresh(r.value)]);assert.equal(results.every(r=>r.ok),true,JSON.stringify(results));
  assert.equal(checkpoints,1,'duplicate checkpoint write on concurrent replay');
});
