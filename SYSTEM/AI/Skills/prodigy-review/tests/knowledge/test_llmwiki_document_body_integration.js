"use strict";
const test = require("node:test"), assert = require("node:assert/strict"), path = require("node:path");
const V = path.resolve(__dirname, "../../../../../Views");
const review = require(path.join(V, "llmwiki-document-canonical-review.js"));
const hash = require(path.join(V, "llmwiki-hash.js"));
const store = require(path.join(V, "knowledge-candidate-store.js"));
const jobs = require(path.join(V, "llmwiki-batch-job-store.js"));

test("successive supplements stay in the article with one provenance footer and unchanged human notes", async () => {
  const files = new Map();
  const app = { vault: {
    getAbstractFileByPath: p => files.get(p) || null, getFiles: () => [...files.values()],
    read: async f => f.bytes, createFolder: async () => {},
    create: async (p, bytes) => { const f = {path:p,bytes,extension:p.endsWith('.md')?'md':'json',basename:path.basename(p,'.md')}; files.set(p,f); return f; },
    modify: async (f,bytes) => { f.bytes=bytes; }
  }, metadataCache: { getFileCache: f => { try { return {frontmatter:store.parseLifecycleDocument(f.bytes)}; } catch (_) { return {frontmatter:{}}; } } } };
  const fields = {knowledge_kind:'claim',knowledge_domain:'coding',knowledge_topics:'ai',application_trigger:'모형 점검',application_contexts:'coding/ai',conditions:'실내 모형만',exclusions:'실외 적용 금지',invalidation_conditions:'원문 변경',relation_status:'resolved',classification:'epistemic',evidence_strength:'sufficient'};
  const human = '## 사용자 메모\n이 표현과 경험은 그대로 보존한다.\n';
  const make = async (id, title, text) => {
    const source_path = `INBOX/${id}.md`; await app.vault.create(source_path,text);
    return {review_id:`review_${id}`,title:'실내 모형 점검',document_body:`## ${title}\n${text}\n`,grounded_claims:[{text,citations:[{source_id:`source_${id}`,source_path,locator:`${source_path}#L1`,content_hash:hash.sha256(text),evidence_quote:text}]}]};
  };
  const a = await make('aaa','적용 조건','실내 모형만 점검하며 실외에서는 적용하지 않는다.'); a.document_body += '\n'+human;
  const b = await make('bbb','점검 기록','점검 기록에 장치 식별자를 함께 적는다.');
  const c = await make('ccc','중단 조건','경고등이 켜지면 즉시 중단하고 재개하지 않는다.');
  const disk=new Map();
  const storage={exists:async k=>disk.has(k),read:async k=>disk.get(k),writeAtomic:async(k,v)=>disk.set(k,v),quarantine:async()=>{throw new Error('unexpected corrupt job');}};
  const jobStore={...jobs.createBatchJobStore({storage})};await jobStore.load();
  const seedCitation=a.grounded_claims[0].citations[0];
  const job=await jobStore.createJob({request_key:hash.sha256('body-integration-no-change'),sources:[{source_id:seedCitation.source_id,revision_hash:seedCitation.content_hash}]});
  await jobStore.savePlanSnapshot({job_id:job.job_id,source_id:seedCitation.source_id,source_revision:seedCitation.content_hash,inventory_hash:hash.sha256(JSON.stringify(a.grounded_claims)),plan_hash:hash.sha256(a.document_body),plan_revision:1,status:'compiled',plan:{plan_version:'fixture_document_v1',pages:[]}});
  const flow=review.create({app,jobStore,jobId:job.job_id}); let target_path;
  for (const item of [a,b,c]) {
    const prepared=await flow.prepare({item,fields,...(target_path?{target_path}:{})});assert.equal(prepared.ok,true,JSON.stringify(prepared));
    const result=await flow.apply(prepared.value,{approved:true,claims_accepted:true,packet_hash:prepared.value.packet_hash}); assert.equal(result.ok,true,JSON.stringify(result));target_path=result.target_path;
  }
  const after=files.get(target_path).bytes;
  assert.equal((after.match(/^## 출처$/gmu)||[]).length,1);
  for(const item of [a,b,c]) assert.ok(after.includes(item.grounded_claims[0].text));
  assert.ok(after.indexOf('## 점검 기록') < after.indexOf('## 사용자 메모'));
  assert.ok(after.indexOf('## 중단 조건') < after.indexOf('## 사용자 메모'));
  assert.ok(after.includes(human));
  assert.equal((await flow.targets()).length,1);
  assert.equal((await flow.prepare({item:c,fields,target_path})).status,'no_change');
  assert.equal(files.get(target_path).bytes,after);
});
