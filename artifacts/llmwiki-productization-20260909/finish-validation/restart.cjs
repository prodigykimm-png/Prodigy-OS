'use strict';
// Explicit isolated two-process restart proof; no operational Vault is opened.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict'),cp=require('node:child_process');
const ROOT=path.resolve(__dirname,'../../..'),V=path.join(ROOT,'SYSTEM/Views');
const review=require(path.join(V,'llmwiki-document-canonical-review.js')),store=require(path.join(V,'knowledge-candidate-store.js')),hash=require(path.join(V,'llmwiki-hash.js')),jobs=require(path.join(V,'llmwiki-batch-job-store.js'));
const fields={knowledge_kind:'claim',knowledge_domain:'coding',knowledge_topics:'ai',application_trigger:'모형 점검',application_contexts:'coding/ai',conditions:'실내 모형',invalidation_conditions:'원문 변경',relation_status:'resolved',classification:'epistemic',evidence_strength:'sufficient'};
function diskApp(dir){let writes=0,allWrites=0;const full=p=>{const x=path.resolve(dir,p);assert.ok(x.startsWith(dir+path.sep));return x;};
const file=p=>fs.existsSync(full(p))?{path:p,extension:fs.statSync(full(p)).isFile()?path.extname(p).slice(1):undefined,basename:path.basename(p,path.extname(p))}:null;
const list=(p='')=>fs.existsSync(p?full(p):dir)?fs.readdirSync(p?full(p):dir,{withFileTypes:true}).flatMap(e=>{const n=p?`${p}/${e.name}`:e.name;return e.isDirectory()?list(n):[file(n)];}):[];
const vault={getAbstractFileByPath:file,getFiles:()=>list(),read:async f=>fs.readFileSync(full(f.path),'utf8'),createFolder:async p=>fs.mkdirSync(full(p),{recursive:true}),create:async(p,b)=>{fs.mkdirSync(path.dirname(full(p)),{recursive:true});fs.writeFileSync(full(p),b,{flag:'wx'});allWrites++;if(p.startsWith('ZETA/PERMANENT/'))writes++;return file(p);},modify:async(f,b)=>{fs.writeFileSync(full(f.path),b);allWrites++;if(f.path.startsWith('ZETA/PERMANENT/'))writes++;},delete:async f=>fs.unlinkSync(full(f.path))};
return {app:{vault,metadataCache:{getFileCache:f=>{try{return {frontmatter:store.parseLifecycleDocument(fs.readFileSync(full(f.path),'utf8'))};}catch{return {frontmatter:{}};}}}},get writes(){return writes;},get allWrites(){return allWrites;}};}
async function item(app,suffix,text){const p=`ZETA/LITERATURE/restart-${suffix}.md`;await app.vault.create(p,text);return {review_id:`review_restart_${suffix}`,title:'모형 점검',document_body:`## 점검 ${suffix}\n${text}\n`,grounded_claims:[{text,citations:[{source_id:`source_restart_${suffix}`,source_path:p,locator:`${p}#L1`,content_hash:hash.sha256(text),evidence_quote:text}]}]};}
(async()=>{
 const phase=process.argv[2],dir=process.argv[3];
 if(!phase){const vault=fs.mkdtempSync(path.join(os.tmpdir(),'llmwiki-real-process-restart-'));const outputs=[];try{for(const p of ['prepare','resume']){const child=cp.spawnSync(process.execPath,[__filename,p,vault],{encoding:'utf8'});assert.equal(child.status,0,child.stderr+child.stdout);outputs.push(JSON.parse(child.stdout));}fs.writeFileSync(path.join(__dirname,'restart-result.json'),JSON.stringify({command:'node artifacts/llmwiki-productization-20260909/finish-validation/restart.cjs',processes:outputs,provider_calls:0,operational_writes:0},null,2));const result=JSON.parse(fs.readFileSync(path.join(vault,'harness-state.json')));fs.writeFileSync(path.join(__dirname,'restart-final.md'),fs.readFileSync(path.join(vault,result.target)));console.log(JSON.stringify({ok:true,processes:outputs},null,2));}finally{fs.rmSync(vault,{recursive:true,force:true});}return;}
 fs.mkdirSync(path.join(dir,'SYSTEM/CACHE/llmwiki'),{recursive:true});
 const disk=diskApp(dir),jobStore=jobs.createBatchJobStore({storage:jobs.createNodeStorage(path.join(dir,'SYSTEM/CACHE/llmwiki'))});await jobStore.load();
 if(phase==='prepare'){
  const initial=review.create({app:disk.app}),a=await item(disk.app,'aaa','실내 점검은 10분이다.');const p=await initial.prepare({item:a,fields});assert.equal(p.ok,true,JSON.stringify(p));const created=await initial.apply(p.value,{approved:true,claims_accepted:true,packet_hash:p.value.packet_hash});assert.equal(created.ok,true,JSON.stringify(created));
  const b=await item(disk.app,'bbb','경고등은 즉시 중단 조건이다.'),citation=b.grounded_claims[0].citations[0];
  const job=await jobStore.createJob({request_key:hash.sha256('real-process-restart'),sources:[{source_id:citation.source_id,revision_hash:citation.content_hash}]});
  await jobStore.savePlanSnapshot({job_id:job.job_id,source_id:citation.source_id,source_revision:citation.content_hash,inventory_hash:hash.sha256(JSON.stringify(b.grounded_claims)),plan_hash:hash.sha256(b.document_body),plan_revision:1,status:'compiled',plan:{plan_version:'fixture_document_v1',pages:[]}});
  const flow=review.create({app:disk.app,jobStore,jobId:job.job_id}),q=await flow.prepare({item:b,fields,target_path:created.target_path});assert.equal(q.ok,true,JSON.stringify(q));
  const modify=disk.app.vault.modify;let failed=false;disk.app.vault.modify=async(f,bytes)=>{if(!failed&&f.path==='.llmwiki-audit/immutable/head.json'){failed=true;throw Error('isolated_process_exit_after_orphan_entry');}return modify(f,bytes);};
  const outcome=await flow.apply(q.value,{approved:true,claims_accepted:true,packet_hash:q.value.packet_hash});assert.equal(outcome.ok,false);assert.equal(failed,true);assert.equal(disk.writes,2);
  const record=Object.values(jobStore.getPlanSnapshot(job.job_id).canonical_reviews)[0];assert.equal(record.status,'blocked');assert.equal(record.authorization,undefined);
  fs.writeFileSync(path.join(dir,'harness-state.json'),JSON.stringify({item:b,job_id:job.job_id,target:created.target_path,after_hash:hash.sha256(await disk.app.vault.read(disk.app.vault.getAbstractFileByPath(created.target_path)))}));
  console.log(JSON.stringify({phase,pid:process.pid,canonical_writes:disk.writes,outcome,status:record.status,serialized_authorization:false}));
 }else{
  const saved=JSON.parse(fs.readFileSync(path.join(dir,'harness-state.json'))),flow=review.create({app:disk.app,jobStore,jobId:saved.job_id});
  const restored=await flow.restore(saved.item);assert.equal(restored.ok,true,JSON.stringify(restored));assert.equal(restored.status,'review');assert.equal(restored.requires_new_approval,true);assert.equal(disk.allWrites,0,'restore must be read-only');
  const denied=await flow.apply(restored.value,{approved:false});assert.equal(denied.reason,'explicit_exact_approval_required');assert.equal(disk.allWrites,0);
  const completed=await flow.apply(restored.value,{approved:true,claims_accepted:true,packet_hash:restored.value.packet_hash});assert.equal(completed.ok,true,JSON.stringify(completed));assert.equal(disk.writes,0);assert.equal((await flow.targets()).length,1);
  assert.equal(hash.sha256(await disk.app.vault.read(disk.app.vault.getAbstractFileByPath(saved.target))),saved.after_hash);assert.equal(Object.values(jobStore.getPlanSnapshot(saved.job_id).canonical_reviews)[0].status,'resolved');
  console.log(JSON.stringify({phase,pid:process.pid,restore_status:restored.status,automatic_writes:0,new_explicit_decision:true,additional_canonical_writes:disk.writes,verified_reader_count:(await flow.targets()).length,outcome:completed}));
 }
})().catch(e=>{console.error(e.stack);process.exitCode=1;});
