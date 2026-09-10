"use strict";
const assert = require('node:assert/strict');
const path = require('node:path');
const root = path.resolve(__dirname, '../../../../../..');
const load = name => require(path.join(root, 'SYSTEM/Views/', name + '.js'));
load('journal-core'); load('journal-store'); load('weekly-filter-core'); load('weekly-review-store'); load('monthly-validation-core'); load('journal-period-core');
const store = load('journal-period-store'), view = load('journal-narrative-view');
function fixture() {
  const files = new Map(); const writes = [];
  const app = { vault: {
    getMarkdownFiles: () => [...files.values()].filter(f => f.extension === 'md'),
    getAbstractFileByPath: p => files.get(p),
    read: async f => { if (f.fail) throw Error('synthetic read failure'); return f.content; },
    createFolder: async p => { files.set(p, { path:p }); },
    create: async (p,c) => { if(files.has(p)) throw Error('exists'); const f={path:p,name:p.split('/').pop(),extension:'md',content:c}; files.set(p,f);writes.push(p);return f; },
    process: async (f,fn) => { f.content=fn(f.content); writes.push(f.path); },
    modify: async (f,c) => {f.content=c;writes.push(f.path);}
  }};
  return { app, files, writes };
}
async function save(app,id,key,fields) {const expected=await store.loadNarrative(app,id,key),input=await store.collectReviewSources(app,id,key);return store.saveNarrative(app,id,key,fields,expected,input);}
async function main() {
 const {app,files,writes}=fixture();
 await global.JournalStore.saveReflection(app,'2026-09-01','산책해서 기분이 좋았다.');
 await global.JournalStore.saveReflection(app,'2026-09-01','산책해서 기분이 좋았다. 저녁에는 쉬었다.',{expectedReflection:'산책해서 기분이 좋았다.'});
 const day=await global.JournalStore.loadReview(app,'2026-09-01');
 assert.equal(day.fields.change,'');assert.equal(day.fields.next_experiment,'');
 await assert.rejects(global.JournalStore.saveReflection(app,'2026-09-01','잃을 기록',{expectedReflection:'오래된 입력'}));
 let input=await store.collectReviewSources(app,'weekly','2026-W36');assert.match(input.sources[0].text,/저녁에는/);
 const weekly=await save(app,'weekly','2026-W36',{summary:'결과물이 나왔다.',comment:'너무 지쳐서 같은 방식으로 하고 싶지 않다.',direction:'다음에는 쉬어가자.'});
 assert.match(weekly.fields.comment,/너무 지쳐/);
 for(const week of ['2026-W37','2026-W38']) await app.vault.create('DAILY/WEEKLY/'+week+'.md',global.WeeklyReviewStore.renderReview({period:{week,start:week==='2026-W37'?'2026-09-07':'2026-09-14',end:week==='2026-W37'?'2026-09-13':'2026-09-20'},summary:'합성 주간 기록'}));
 input=await store.collectReviewSources(app,'monthly','2026-09');assert.equal(input.mode,'question_only');assert.equal(input.model.readiness.weekly_count,3);assert.equal(input.model.principles.length,0);assert.match(input.sources[0].text,/너무 지쳐/);
 const monthly=await save(app,'monthly','2026-09',{summary:'휴식이 필요했다.',comment:'빨리 끝내는 방식은 맞지 않았다.',direction:'속도를 낮춘다.'});
 assert.match(monthly.content,/status: draft/);assert.equal(global.MonthlyValidationCore.parseMonthlyNoteContent(monthly.content).format,'canonical');
 files.get(monthly.path).content=monthly.content.replace('status: draft','status: completed');
 assert.equal((await store.collectReviewSources(app,'quarterly','2026-Q3')).completeCount,0,'status alone cannot certify monthly validation');
 files.get(monthly.path).content=monthly.content;
 input=await store.collectReviewSources(app,'quarterly','2026-Q3');assert.equal(input.mode,'partial');assert.equal(input.completeCount,0);assert.match(input.sources[0].text,/맞지 않았다/);
 await save(app,'quarterly','2026-Q3',{summary:'일하는 방식을 돌아봤다.',comment:'휴식도 중요한 방향이다.',direction:'현재 방향 유지'});
 input=await store.collectReviewSources(app,'yearly','2026');assert.match(input.sources[0].text,/휴식도 중요한/);assert.equal(input.completeCount,0);
 const annual=await save(app,'yearly','2026',{summary:'일부 기간만 기록했다.',comment:'이 해에는 쉬는 법을 배웠다.',direction:'무리하지 않기'});
 assert.equal((await store.loadNarrative(app,'yearly','2026')).fields.comment,annual.fields.comment);
 const empty=await store.collectReviewSources(app,'monthly','2025-01');assert.equal(empty.mode,'blocked');assert.equal(empty.canSave,false);
 await assert.rejects(save(app,'monthly','2025-01',{comment:'저장 금지'}));
 assert.equal((await store.collectReviewSources(app,'quarterly','2025-Q1')).mode,'empty');
 const exp=await store.loadNarrative(app,'yearly','2026'), inp=await store.collectReviewSources(app,'yearly','2026');
 files.get(exp.path).content+='외부 수정';await assert.rejects(store.saveNarrative(app,'yearly','2026',{comment:'충돌'},exp,inp));
 files.get('DAILY/QUARTERLY/2026-Q3.md').fail=true;assert.equal((await store.collectReviewSources(app,'yearly','2026')).mode,'blocked');files.get('DAILY/QUARTERLY/2026-Q3.md').fail=false;
 assert.throws(()=>view.validate({summary:'허구',source_paths:['missing']},input));
 assert.throws(()=>view.validate({summary:'daily-2026-09-01-e99',source_paths:[input.sources[0].path]},input));
 global.ProdigyAIConsumerRuntime={requestStructured:async options=>{assert(!options.prompt.includes('비밀키 fixture'));return{payload:{observations:[],summary:'합성 AI 요약',source_paths:[input.sources[0].path]}};}};
 assert.equal((await view.generate({app,input})).summary,'합성 AI 요약');
 global.ProdigyAIConsumerRuntime={requestStructured:async()=>{throw Error('provider offline');}};await assert.rejects(view.generate({app,input}));
 assert.deepEqual(store.boundsFor('weekly','2026-W01'),{start:'2025-12-29',end:'2026-01-04'});
 assert.deepEqual(store.boundsFor('quarterly','2026-Q4'),{start:'2026-10-01',end:'2026-12-31'});
 assert.equal(global.JournalPeriodCore.isCompletedRecord({frontmatter:{}}),false);
 const monthlyStore = load('monthly-validation-store');
 global.KnowledgeCandidateCore = load('knowledge-candidate-core');
 const delivered = new Map(); let failCandidate = true, attempts = [];
 global.KnowledgeCandidateStore = { saveCandidate: async (_app, raw) => {
   const value = global.KnowledgeCandidateCore.createCandidate({...raw,created:'2026-09-08',updated:'2026-09-08'}); attempts.push(value.title);
   if (value.title === '휴식도 필요' && failCandidate) throw Error('합성 후보 실패');
   if (!delivered.has(value.candidate_id)) delivered.set(value.candidate_id,value);
   return delivered.get(value.candidate_id);
 }};
 const model = {month:'2026-09',readiness:{ready:true},principles:[{title:'속도를 줄이기',eligible:true,evidence_refs:['daily-2026-09-01-e01']},{title:'휴식도 필요',eligible:true,evidence_refs:['daily-2026-09-02-e01']}]};
 const decisions = {reviewMode:'validation',p0:{action:'validated',create_candidate:true,validation_reason:'합성 검증'},p1:{action:'validated',create_candidate:true,validation_reason:'합성 검증'}};
 const handoff = await monthlyStore.createCandidatesFromDecisions(app,model,decisions);
 assert.equal(handoff.length,1);assert.equal(handoff.failures.length,1);assert.equal(handoff[0].suggested_domain,'');
 failCandidate=false;attempts=[];const retried=await monthlyStore.retryCandidateFailures(app,handoff.failures);
 assert.equal(retried.length,1);assert.deepEqual(attempts,['휴식도 필요']);
 await monthlyStore.retryCandidateFailures(app,handoff.failures);assert.equal(delivered.size,2);
 assert.equal((await monthlyStore.createCandidatesFromDecisions(app,model,{...decisions,reviewMode:'question_only'})).length,0);
 assert.equal((await monthlyStore.createCandidatesFromDecisions(app,{...model,readiness:{ready:false}},decisions)).length,0);
 global.ProdigyAIConsumerRuntime = load('prodigy-ai-consumer-runtime');
 let request;
 const client = {getConsentRequirement:()=>({status:'ready'}),requestStructured:async r=>{request=r;return{ok:true,payload:{observations:[],summary:'Runtime Mock Provider 결과',source_paths:[input.sources[0].path]}};}};
 await app.vault.create('CONTACTS/private-fixture.md','비밀키 fixture'); writes.pop(); // Fixture seeding is not a product mutation.
 input = await store.collectReviewSources(app,'yearly','2026');
 assert.equal((await view.generate({app,input,client})).summary,'Runtime Mock Provider 결과');
 assert.equal(request.consumer_id,'journal.period_summary');assert(request.operation_id);assert(request.owner_session_id);
 assert(!request.prompt.includes('비밀키 fixture'));
 assert.equal(global.JournalCore.todayIsoDate(new Date('2026-12-31T15:01:00Z')),'2027-01-01');
 assert.equal(global.JournalPeriodCore.periodKey('quarterly',new Date('2026-09-30T15:01:00Z')),'2026-Q4');
 await assert.rejects(save(app,'monthly','2026-13',{comment:'invalid'}));
 assert(writes.every(p=>p.startsWith('DAILY/')));
 console.log('PASS synthetic narrative journey: daily → weekly → monthly → quarterly → yearly; partial gates, errors, conflicts, mock AI, source validation; no operational Vault access');
}
module.exports = { fixture, save };
if (require.main === module) main().catch(e=>{console.error(e);process.exitCode=1;});
