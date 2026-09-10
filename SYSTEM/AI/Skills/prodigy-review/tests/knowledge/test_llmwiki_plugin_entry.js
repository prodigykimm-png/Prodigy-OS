'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'../../../../../..');
function fixture({missing=false,dataview=true}={}){
 const calls=[];const leaf={view:{file:{path:'HUB/50 Knowledge.md'}},openFile:async(...args)=>calls.push(['open',...args])};
 class Plugin{addCommand(x){this.command=x;}addRibbonIcon(...x){this.ribbon=x;}}
 const realm={KnowledgeExplorerHub:{tabs:{select:x=>calls.push(['select',x])}}};
 const context={module:{exports:{}},window:realm,require:id=>{assert.equal(id,'obsidian');return {Plugin,Notice:class{constructor(x){calls.push(['notice',x]);}}};}};
 vm.runInNewContext(fs.readFileSync(path.join(root,'SYSTEM/Plugins/prodigy-llm-wiki/main.js'),'utf8'),context);
 const plugin=new context.module.exports();plugin.app={vault:{getAbstractFileByPath:p=>missing?null:{path:p,extension:'md'}},plugins:{getPlugin:()=>dataview?{}:null},workspace:{getLeavesOfType:()=>[leaf],getLeaf:()=>{throw Error('duplicate leaf');},revealLeaf:async()=>calls.push(['reveal'])}};plugin.onload();return {plugin,calls,realm};
}
test('entry reuses existing Hub and coalesces duplicate opens without ingest or write',async()=>{
 const {plugin,calls,realm}=fixture();const first=plugin.openOrganizer();assert.equal(plugin.openOrganizer(),first);
 assert.equal((await first).ok,true);assert.equal(calls.filter(x=>x[0]==='open').length,1);assert.equal(realm.KnowledgeExplorerHub._lastTab,'llmwiki');
 assert.ok(calls.some(x=>x[0]==='select'&&x[1]==='llmwiki'));plugin.onunload();assert.equal(plugin._opening,null);
});
test('entry reports missing required Hub or Dataview rather than claiming mounted',async()=>{
 for(const input of [{missing:true},{dataview:false}]){const {plugin,calls}=fixture(input);assert.equal((await plugin.openOrganizer()).ok,false);assert.equal(calls.some(x=>x[0]==='open'),false);assert.equal(calls.some(x=>x[0]==='notice'),true);}
});
