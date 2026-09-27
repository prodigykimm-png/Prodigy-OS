'use strict';
// Read-only runtime probes. No provider stubs and no canonical/store writes.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),{performance}=require('node:perf_hooks');
const root=process.cwd(),v=n=>require(path.join(root,'SYSTEM/Views',n));
const sha=s=>crypto.createHash('sha256').update(s).digest('hex');
const sourcePath=fs.readdirSync('INBOX').filter(n=>n.startsWith('Prodigy Wiki QA')).map(n=>'INBOX/'+n)[0];
const sourceText=fs.readFileSync(sourcePath,'utf8');
const stages=[];function step(stage,fn){const t=performance.now();try{const output=fn();stages.push({stage,status:output.ok===false?'FAIL':'PASS',ms:performance.now()-t,output,retry:0,fallback:0,artifacts:[],error:null});return output;}catch(e){stages.push({stage,status:'FAIL',ms:performance.now()-t,error:e.message,stack:e.stack,retry:0,fallback:0,artifacts:[]});}}
const selection=step('source intake eligibility',()=>({ok:v('llmwiki-user-source-selector.js').eligibleInboxPath(sourcePath,sourceText),path:sourcePath,bytes:Buffer.byteLength(sourceText),hash:sha(sourceText)}));
const scope=step('analysis scope',()=>v('llmwiki-analysis-scope.js').createAnalysisScope({source_id:'source_audit_canary',source_path:sourcePath,content_hash:sha(sourceText),source_text:sourceText}));
const manifest=step('chunk projection',()=>v('llmwiki-chunk-manifest.js').createChunkManifest(scope));
const snapshot=step('query corpus projection',()=>v('llmwiki-wiki-read-adapter.js').buildSnapshot({assets:[{path:sourcePath,type:'literature_note',title:'Prodigy Wiki QA',body:sourceText}]}));
step('canary searchable as source',()=>{const r=v('llmwiki-wiki-read-adapter.js').browseRead({snapshot,mode:'literature',query:'Prodigy Wiki QA',queryRead:v('llmwiki-query-readonly.js')});return {...r,ok:r.ok&&r.total>0,assertion:'eligible INBOX source must be discoverable as supporting evidence; not verified Knowledge'};});
const modes=['direct','omniroute'].map(provider_mode=>({provider_mode,result:v('llmwiki-provider-contract.js').selectProviderProfile({feature:'llmwiki',provider_mode,timeout_ms:120000})}));
const errors=['transport_error','rate_limited','secret_missing','timeout','schema_invalid','malformed_transport_response'].map(code=>({code,mapped:v('llmwiki-batch-provider-input.js').mapTransportError({code})}));
const jobs=JSON.parse(fs.readFileSync('SYSTEM/CACHE/llmwiki/batch-job-state.json','utf8'));
const blocked=jobs.jobs['28e6a4f3cc88ec671d51d366918be01f195db3dafc985c6fe72ae7510efe52cb'];
const counts=Object.values(jobs.jobs).reduce((a,j)=>(a[j.status]=(a[j.status]||0)+1,a),{});
const result={generated_at:new Date().toISOString(),command:'node artifacts/llmwiki-runtime-audit-20260909/canary.cjs',source:selection,stages,modes,transport_error_mapping:errors,canonical_files:fs.readdirSync('ZETA/PERMANENT').filter(x=>x.endsWith('.md')).length,immutable_head_exists:fs.existsSync('.llmwiki-audit/immutable/head.json'),job_counts:counts,blocked_job:blocked,canonical_writes:0,persistent_runtime_writes:0};
fs.writeFileSync(path.join(__dirname,'canary-node.json'),JSON.stringify(result,null,2));
console.log(JSON.stringify({stages:stages.map(s=>({stage:s.stage,status:s.status,ms:s.ms})),modes,errors,counts},null,2));
