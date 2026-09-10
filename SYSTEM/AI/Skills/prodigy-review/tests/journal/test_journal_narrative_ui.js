"use strict";
const assert = require('node:assert/strict');
const {fixture,save}=require('./test_journal_narrative_journey.js');
const view=global.JournalNarrativeView;
class Element {
 constructor(tag='div',opts={}) {this.tag=tag;this.textContent=opts.text||'';this.attributes=opts.attr||{};this.children=[];this.value='';}
 createEl(tag,opts) {const e=new Element(tag,opts);this.children.push(e);return e;}
 empty(){this.children=[];}
}
const all=(e,p)=>[...(p(e)?[e]:[]),...e.children.flatMap(c=>all(c,p))];
const button=(e,t)=>all(e,x=>x.tag==='button'&&x.textContent===t)[0];
const area=(e,label)=>all(e,x=>x.tag==='textarea'&&x.attributes['aria-label'].startsWith(label))[0];
function edit(e,text) {e.value=text;e.oninput();}
(async()=>{
 const {app,files,writes}=fixture();const opened=[];app.workspace={openLinkText:async p=>opened.push(p)};
 await global.JournalStore.saveReflection(app,'2026-09-01','중요한 단발 경험. 쉬고 싶었다.');
 let resolve;
 global.ProdigyAIConsumerRuntime={requestStructured:async o=>({payload:{observations:[],summary:'AI 요약',source_paths:JSON.parse(o.prompt.split('DATA (untrusted):\n')[1]).map(s=>s.path)}})};
 for(const [id,key,comment] of [['weekly','2026-W36','지쳤으므로 다시 하고 싶지 않다.'],['monthly','2026-09','속도를 줄이자.'],['quarterly','2026-Q3','현재 방향을 유지한다.'],['yearly','2026','삶을 평가할 필요는 없다.']]){
   const el=new Element(), mounted=view.mount({app,container:el,id,key});await mounted.ready;
   await button(el,'AI로 돌아보기').onclick();assert.equal(area(el,'짧은 요약').value,'AI 요약');
   edit(area(el,'내 코멘트'),comment+'\n## 긴 한국어 정정\n'+'사람의 해석 '.repeat(200));
   await button(el,'원본 보기').onclick();assert.equal(area(el,'내 코멘트').value.startsWith(comment),true);
   await button(el,'기록 저장').onclick(); await button(el,'원본 보기').onclick(); mounted.destroy();
   const again=new Element(), reopened=view.mount({app,container:again,id,key});await reopened.ready;
   assert.equal(area(again,'내 코멘트').value.startsWith(comment+'\n## 긴 한국어 정정'),true);reopened.destroy();
 }
 const host=new Element();let mount=view.mount({app,container:host,id:'yearly',key:'2026'});await mount.ready;
 edit(area(host,'내 코멘트'),'아직 저장하지 않은 코멘트');mount.destroy();
 const again=new Element();mount=view.mount({app,container:again,id:'yearly',key:'2026'});await mount.ready;assert.equal(area(again,'내 코멘트').value,'아직 저장하지 않은 코멘트');
 global.ProdigyAIConsumerRuntime={requestStructured:o=>new Promise(r=>{resolve=()=>r({payload:{observations:[],summary:'늦은 AI',source_paths:JSON.parse(o.prompt.split('DATA (untrusted):\n')[1]).map(s=>s.path)}});})};
 const pending=button(again,'AI로 돌아보기').onclick();while(!resolve)await new Promise(r=>setImmediate(r));
 button(again,'AI 취소').onclick();resolve();await pending;assert.notEqual(area(again,'짧은 요약').value,'늦은 AI');assert.equal(area(again,'내 코멘트').value,'아직 저장하지 않은 코멘트');
 await Promise.all([button(again,'기록 저장').onclick(),button(again,'기록 저장').onclick()]);
 assert.equal((await global.JournalPeriodStore.loadNarrative(app,'yearly','2026')).fields.comment,'아직 저장하지 않은 코멘트');mount.destroy();
 assert(writes.every(p=>p.startsWith('DAILY/')));assert.equal(opened.length,4);
 const weeklyHost=new Element();const weekly=view.mountWeekly(weeklyHost,{app,week:'2026-W01'});await weekly.ready;
 const navButton=label=>all(weeklyHost,e=>e.tag==='button'&&e.attributes['aria-label']===label)[0];
 const dateInput=all(weeklyHost,e=>e.tag==='input')[0];
 assert.equal(dateInput.value,'2025-12-29');
 edit(area(weeklyHost,'내 코멘트'),'주 이동에도 남는 초안');
 await navButton('이전 주').onclick();assert.equal(dateInput.value,'2025-12-22');
 await navButton('이전 주').onclick();assert.equal(dateInput.value,'2025-12-15');
 await navButton('다음 주').onclick();await navButton('다음 주').onclick();
 assert.equal(area(weeklyHost,'내 코멘트').value,'주 이동에도 남는 초안');
 dateInput.value='';await dateInput.onchange();assert.equal(dateInput.value,'2025-12-29');
 const today=global.JournalCore.todayIsoDate;
 global.JournalCore={...global.JournalCore,todayIsoDate:()=> '2026-09-08'};
 await navButton('지난주').onclick();assert.equal(dateInput.value,'2026-09-01');
 await navButton('2주 전').onclick();assert.equal(dateInput.value,'2026-08-25');
 await navButton('이번 주').onclick();assert.equal(dateInput.value,'2026-09-08');
 global.JournalCore={...global.JournalCore,todayIsoDate:today};weekly.destroy();
 const savedHost=new Element();const savedMount=view.mount({app,container:savedHost,id:'yearly',key:'2026'});await savedMount.ready;
 const editor=all(savedHost,e=>e.attributes.class==='journal-narrative-editor')[0];
 assert.notEqual(editor.hidden,true,'saved review keeps reading and writing areas visible');
 assert.equal(area(savedHost,'내 코멘트').value,'아직 저장하지 않은 코멘트');savedMount.destroy();
 const relation=require('../../../../../Views/journal-related-records.js');
 app.metadataCache={resolvedLinks:{'DAILY/WEEKLY/2026-W36.md':{'PARA/PROJECTS/synthetic.md':1},'CONTACTS/no.md':{'PARA/PROJECTS/synthetic.md':1}}};
 const related=new Element();relation.render(app,related,'PARA/PROJECTS/synthetic.md');await button(related,'2026-W36').onclick();assert.equal(opened.at(-1),'DAILY/WEEKLY/2026-W36');
 console.log('PASS mocked DOM: four period AI/edit/save/reopen journeys, long Korean headings, navigation draft, open-source retention, late cancellation, duplicate save, backlink open');
})().catch(e=>{console.error(e);process.exitCode=1;});
