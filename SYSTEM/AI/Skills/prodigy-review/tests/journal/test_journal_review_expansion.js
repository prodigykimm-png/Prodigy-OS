'use strict';
const assert=require('node:assert/strict');
const {fixture,save}=require('./test_journal_narrative_journey');
const store=global.JournalPeriodStore,view=global.JournalNarrativeView;
class Element {
 constructor(tag='div',o={}){this.tag=tag;this.textContent=o.text||'';this.attributes=o.attr||{};this.children=[];this.value='';}
 createEl(tag,o){const e=new Element(tag,o);this.children.push(e);return e;}
 empty(){this.children=[];} setAttribute(k,v){this.attributes[k]=v;}
}
const all=(e,p)=>[...(p(e)?[e]:[]),...e.children.flatMap(c=>all(c,p))];
const btn=(e,t)=>all(e,x=>x.tag==='button'&&x.textContent===t)[0];
const area=(e,t)=>all(e,x=>x.tag==='textarea'&&x.attributes['aria-label']===t)[0];
const edit=(e,t)=>{e.value=t;e.oninput();};
(async()=>{
 const {app,files}=fixture();app.workspace={openLinkText:async()=>{}};
 await global.JournalStore.saveReflection(app,'2026-09-01','완성했지만 지쳤다.');
 await save(app,'weekly','2026-W36',{summary:'합성 경험',comment:'휴식이 더 중요하다.'});
 await app.vault.create('DAILY/MONTHLY/2026-08.md','---\njournal: monthly\njournal-section: month\njournal-start-date: 2026-08-01\njournal-end-date: 2026-08-31\nstatus: draft\n---\n## Monthly Summary\n\n과거 요약\n\n## User Commentary\n\n과거 코멘트는 바꾸지 않는다.\n');
 const original=files.get('DAILY/MONTHLY/2026-08.md').content;
 for(const [id,key] of [['monthly','2026-09'],['quarterly','2026-Q3'],['yearly','2026']]){
  const host=new Element();
  global.ProdigyAIConsumerRuntime={requestStructured:async o=>{
   const data=JSON.parse(o.prompt.split('DATA (untrusted):\n')[1]);
   assert(o.schema.required.includes('observations'));assert(o.prompt.includes('previous_period'));
   return {payload:{summary:'결과보다 휴식이 중요했다.',source_paths:[data[0].path],observations:[{kind:'timeline',text:'합성 기간의 변화',source_paths:[data[0].path]},{kind:'learning',text:'좋은 결과도 무리한 방식의 근거는 아니다.',source_paths:[data[0].path]}]}};
  }};
  const mounted=view.mount({app,container:host,id,key});assert.equal((await mounted.ready).ok,true);
  edit(area(host,'지금 다시 보니 (선택)'),'과거와 지금을 구분한다.');
  await btn(host,'AI로 돌아보기').onclick();
  assert.equal(all(host,e=>e.attributes.class==='journal-observation-card').length,2);
  btn(host,'기억할 장면으로 선택').onclick();
  edit(area(host,'내 코멘트·정정 (답하지 않아도 괜찮습니다)'),'같은 방식으로 반복하고 싶지 않다.');
  await btn(host,'기록 저장').onclick();mounted.destroy();
  const record=await store.loadNarrative(app,id,key);
  assert.equal(record.fields.observations.length,2);assert.match(record.fields.moments,/합성 기간/);assert.match(record.fields.revisit,/지금/);
  const again=new Element(),reopened=view.mount({app,container:again,id,key});await reopened.ready;
  assert.equal(all(again,e=>e.attributes.class==='journal-observation-card').length,2);reopened.destroy();
  if(id!=='yearly') {const next=await store.collectReviewSources(app,id==='monthly'?'quarterly':'yearly',id==='monthly'?'2026-Q3':'2026');assert(next.sources.some(s=>s.text.includes('과거와 지금')&&s.text.includes('좋은 결과도')));}
 }
 assert.equal(files.get('DAILY/MONTHLY/2026-08.md').content,original);
 const input=await store.collectReviewSources(app,'monthly','2026-09');
 assert.throws(()=>view.validate({summary:'x',source_paths:[input.sources[0].path],observations:[{kind:'diagnosis',text:'x',source_paths:[input.sources[0].path]}]},input));
 assert.throws(()=>view.validate({summary:'x',source_paths:[input.sources[0].path],observations:[{kind:'learning',text:'x',source_paths:['missing.md']}]},input));
 const expected=await store.loadNarrative(app,'monthly','2026-09');files.get('DAILY/MONTHLY/2026-08.md').content+='\nchanged';
 await assert.rejects(store.saveNarrative(app,'monthly','2026-09',expected.fields,expected,input),/참고 기록이 변경/);
 // Existing weekly screen owns both its review and the comment; date changes retain drafts.
 global.WeeklyFilterRender={renderWeeklyReview:(el,r)=>el.createEl('p',{text:r.summary})};
 const weeklyView=require('../../../../../Views/weekly-filter-view');
 app.vault.getAbstractFileByPath=(p)=>p==='DAILY/DAILY'?{path:p,children:[...files.values()].filter(f=>f.path.startsWith(p+'/'))}:files.get(p);
 const weeklyHost=new Element(),weekly=weeklyView.mountWeeklyFilter(weeklyHost,{app,week:'2026-W36'});await weekly.ready;
 edit(area(weeklyHost,'주간 내 코멘트'),'주간 코멘트를 이어 쓴다.');await weekly.selectDate('2026-08-24');await weekly.selectDate('2026-09-01');
 assert.equal(area(weeklyHost,'주간 내 코멘트').value,'주간 코멘트를 이어 쓴다.');
 await weekly.save();
 const weeklyRecord=await global.WeeklyReviewStore.read(app,'2026-W36');weeklyRecord.key_learnings=[{pattern:'합성 패턴',learning:'주간 배움을 월간에도 전달',evidence_refs:['daily-2026-09-01-e01']}];await global.WeeklyReviewStore.save(app,weeklyRecord);
 assert((await store.collectReviewSources(app,'monthly','2026-09')).sources.some(source=>source.text.includes('주간 배움을 월간에도 전달')));
 assert.equal((await store.loadNarrative(app,'weekly','2026-W36')).fields.comment,'주간 코멘트를 이어 쓴다.');
 edit(area(weeklyHost,'주간 내 코멘트'),'충돌 시 보존');files.get('DAILY/WEEKLY/2026-W36.md').content+='\nexternal';assert.equal(await weekly.save(),null);
 assert.equal(area(weeklyHost,'주간 내 코멘트').value,'충돌 시 보존');weekly.destroy();
 console.log('PASS expanded reviews: structured AI cards, per-item sources, selected moments, retrospection, prior immutability, upper-period reuse, weekly drafts and conflicts');
})().catch(e=>{console.error(e);process.exitCode=1;});
