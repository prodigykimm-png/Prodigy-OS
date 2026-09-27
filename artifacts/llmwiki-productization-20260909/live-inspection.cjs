// Phase A explicit synthetic-only harness. No runtime/config/global module replacement.
module.exports = async function(app) {
 const fs=require('fs'),path=require('path');const base=app.vault.adapter.basePath;
 const dir=path.join(base,'artifacts/llmwiki-productization-20260909');
 const spec=JSON.parse(fs.readFileSync(path.join(dir,'expectations.json'),'utf8'));
 const out={kind:'real_provider_with_isolated_synthetic_vault_adapter',results:[],loaded_code_match:{}};
 for(const name of ['answerSourceQuestion','prepareQuestionProposal','handoffQuestionProposal']) out.loaded_code_match[name]=fs.readFileSync(path.join(base,'SYSTEM/Views/llmwiki-wiki-read-service.js'),'utf8').includes(globalThis.LLMWikiWikiReadService[name].toString());
 for(const c of spec.cases){
  const payloads=[],requests=[],reads=[],pluginCache=new Map();let writes=0;
  const isolated={plugins:{getPlugin(id){if(pluginCache.has(id))return pluginCache.get(id);const plugin=app.plugins.getPlugin(id);if(!plugin)return plugin;const observed=Object.fromEntries(Object.entries(plugin.api).map(([key,value])=>[key,typeof value==='function'?value.bind(plugin.api):value]));observed.requestStructured=async req=>{requests.push({consumer_id:req.consumer_id,prompt:req.prompt,messages:req.messages});try{const result=await plugin.api.requestStructured(req);payloads.push(result);return result;}catch(e){payloads.push({error:{name:e.name,code:e.code,message:e.message}});throw e;}};const wrapped={...plugin,api:observed};pluginCache.set(id,wrapped);return wrapped;}},metadataCache:{getFileCache(){return {frontmatter:{}};}},vault:{getAbstractFileByPath(p){if(p!==c.virtual_path)throw Error('scope escape '+p);return {path:p};},async read(f){if(f.path!==c.virtual_path)throw Error('scope escape');reads.push(f.path);return c.text;},create(){writes++;throw Error('forbidden write');},modify(){writes++;throw Error('forbidden write');}}};
  const progress=[];
  const result=await globalThis.LLMWikiWikiReadService.answerSourceQuestion({app:isolated,source:{path:c.virtual_path,content_hash:c.sha256},question:c.question,confirmConsent:async()=>false,onProgress:s=>progress.push(s)});
  const proposal=result.ok&&result.answers?.length?await globalThis.LLMWikiWikiReadService.prepareQuestionProposal({app:isolated,answer:result}):null;
  out.results.push({id:c.id,question:c.question,expected:c.must_include,result,proposal,provider_payloads:payloads,provider_requests:requests,progress,reads,writes,actual_ui:false});
  fs.writeFileSync(path.join(dir,'live-inspection.json'),JSON.stringify(out,null,2));
 }
 return out.results.map(r=>({id:r.id,ok:r.result.ok,status:r.result.status,reason:r.result.reason,answers:r.result.answers,provider_payloads:r.provider_payloads.length}));
};
