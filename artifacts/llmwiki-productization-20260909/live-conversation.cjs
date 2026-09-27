module.exports = async function(app,resumePath) {
 const fs=require('fs'),path=require('path');const base=app.vault.adapter.basePath,dir=path.join(base,'artifacts/llmwiki-productization-20260909');
 const spec=JSON.parse(fs.readFileSync(path.join(dir,'expectations.json'),'utf8')), fixtures=spec.cases;
 const questions=['해솔-842 자료의 핵심을 세 가지로 정리해줘.','두 번째를 더 쉽게 설명해줘.','내가 적용하려는 조건은 실내가 아니라 실외야. 이 정정을 반영해줘.','방금 추가한 은빛-593 자료와는 어떤 차이가 있어?','지금 자료만으로는 알 수 없는 점도 구분해줘.','이번 대화에서 확인된 내용만 지식 초안으로 만들 수 있게 정리해줘. 실외라는 내 조건과 두 규정의 우선순위 미확정도 보존해줘.'];
 const expected=['실내·10분·전원확인·기록·실외금지·경고중단 조건을 3항목으로 보존','직전 두번째 항목을 정확히 설명','사용자 조건은 실외; 해솔규정 실외 적용금지와 구분','A 해솔과 명시추가 B 은빛 자료 둘다 사용; B10/20상충','시행일·우선순위 불명; 실외적용을 승인하지 않음','원source 조건·상충·사용자정정 보존한 초안; 승인/쓰기없음'];
 let out={kind:'real_provider_synthetic_sources_six_turn',expected_defined_before_calls:expected,actual_ui:'NOT RUN',turns:[],provider_requests:[],provider_responses:[],writes:0};
 const pluginCache=new Map(),history=[],sources=[{path:fixtures[0].virtual_path,content_hash:fixtures[0].sha256}];
 const isolated={plugins:{getPlugin(id){if(pluginCache.has(id))return pluginCache.get(id);const plugin=app.plugins.getPlugin(id);if(!plugin)return plugin;const api=Object.fromEntries(Object.entries(plugin.api).map(([key,value])=>[key,typeof value==='function'?value.bind(plugin.api):value]));api.requestStructured=async request=>{out.provider_requests.push({consumer_id:request.consumer_id,prompt:request.prompt});const response=await plugin.api.requestStructured(request);out.provider_responses.push(response);return response;};const observed={...plugin,api};pluginCache.set(id,observed);return observed;}},metadataCache:{getFileCache(){return {frontmatter:{}};}},vault:{getAbstractFileByPath(p){const f=fixtures.find(row=>row.virtual_path===p);if(!f)throw Error('scope escape '+p);return {path:p};},async read(f){const source=fixtures.find(row=>row.virtual_path===f.path);if(!source)throw Error('scope escape');return source.text;},create(){out.writes++;throw Error('forbidden write');},modify(){out.writes++;throw Error('forbidden write');}}};
 const paths=['SYSTEM/Views/llmwiki-wiki-read-adapter.js','SYSTEM/Views/llmwiki-batch-provider-input.js','SYSTEM/Views/llmwiki-batch-provider.js','SYSTEM/Views/llmwiki-wiki-read-service.js'];
 globalThis.ProdigyHubLoader.retry(paths,{app,rerun_loaded:true});await globalThis.ProdigyHubLoader.loadScripts(app,paths);
 let last,start=0;
 if(resumePath){const prior=JSON.parse(fs.readFileSync(path.join(dir,resumePath),'utf8'));out={...prior,turns:prior.turns.filter(row=>row.result.ok),resumed_from:resumePath,explicit_retry:true};delete out.stopped_reason;start=out.turns.length;for(const turn of out.turns){const result=turn.result;history.push({role:'user',body:turn.question},{role:'assistant',body:(result.conversation_text||(result.answers||[]).map((row,index)=>`${index+1}. ${row.text}`).join('\n'))+(result.review_notes||[]).map(note=>'\n확인 필요: '+note).join('')});last=result;}if(start>3)sources.push({path:fixtures[1].virtual_path,content_hash:fixtures[1].sha256});}
 for(let i=start;i<questions.length;i++){
  if(i===3)sources.push({path:fixtures[1].virtual_path,content_hash:fixtures[1].sha256});
  const progress=[],inputHistory=structuredClone(history);const result=await globalThis.LLMWikiWikiReadService.answerSourceQuestion({app:isolated,sources,question:questions[i],history:inputHistory,confirmConsent:async()=>false,onProgress:s=>progress.push(s)});
  out.turns.push({turn:i+1,question:questions[i],source_scope:structuredClone(sources),history:inputHistory,result,progress});
  if(result.ok){history.push({role:'user',body:questions[i]},{role:'assistant',body:(result.conversation_text||(result.answers||[]).map((row,index)=>`${index+1}. ${row.text}`).join('\n'))+(result.review_notes||[]).map(note=>'\n확인 필요: '+note).join('')});last=result;}
  fs.writeFileSync(path.join(dir,'live-conversation.json'),JSON.stringify(out,null,2));
  if(!result.ok){out.stopped_reason=result.reason;break;}
 }
 if(out.turns.length===6&&last?.answers?.length)out.proposal=await globalThis.LLMWikiWikiReadService.prepareQuestionProposal({app:isolated,answer:last});
 fs.writeFileSync(path.join(dir,'live-conversation.json'),JSON.stringify(out,null,2));return out.turns.map(row=>({turn:row.turn,ok:row.result.ok,status:row.result.status,reason:row.result.reason,answers:row.result.answers?.length}));
};
