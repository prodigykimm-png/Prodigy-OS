# 실제 provider probe 명령

아래 명령은 당시 연결된 `wiki.batch_analysis` provider를 그대로 사용했다. LLM 출력 mock, provider fallback, 설정 변경, Knowledge 승인/저장은 없다. source는 기존 합성 시험 문서다. 요청 전 resolveProvider와 getConsentRequirement가 ready임을 확인했다. 이 명령은 과거 진단 기록이며 재실행하면 실제 provider 요청을 시도한다.

```sh
/Applications/Obsidian.app/Contents/MacOS/Obsidian vault="Dusk" eval code='JSON.stringify((()=>{window.__llmwikiAuditQA={status:"running"};(async()=>{const f=app.vault.getMarkdownFiles().find(f=>f.path.startsWith("INBOX/Prodigy Wiki QA")),text=await app.vault.cachedRead(f),t=performance.now();const result=await LLMWikiBatchProvider.createBatchAnalysisProvider({app})({run_id:"audit_qa_20260909",outbound_allowed:true,chunks:[{key:"canary_qa",text}],candidate_ids:[]},{ownerSessionId:"audit-qa-20260909",operationId:"audit-qa-20260909",attemptId:"attempt-1"});window.__llmwikiAuditQA={status:"done",source:f.path,ms:performance.now()-t,result};})().catch(e=>window.__llmwikiAuditQA={status:"error",code:e.code,error:e.message});return {started:true}})())'
/Applications/Obsidian.app/Contents/MacOS/Obsidian vault="Dusk" eval code='JSON.stringify(window.__llmwikiAuditQA)'
/Applications/Obsidian.app/Contents/MacOS/Obsidian vault="Dusk" eval code='JSON.stringify(app.plugins.plugins["prodigy-ai-runtime"].api.listDiagnostics().filter(d=>d.consumer_id==="wiki.batch_analysis"))'
```

보조 Literature probe는 같은 함수/COMPACT_SCHEMA로 `ZETA/LITERATURE/synthetic-alpha.md`(795 bytes), run_id=`audit_canary_20260909`, chunk key=`canary_alpha`, owner/operation=`audit-canary-20260909`, attempt=`attempt-1`을 사용했다. 결과는 provider-live.txt.

Native 실행 파일 확인:

```sh
/Applications/Obsidian.app/Contents/MacOS/Obsidian vault="Dusk" eval code='JSON.stringify((()=>{const r=require("child_process").spawnSync("agy",["--version"],{encoding:"utf8",timeout:5000});return {status:r.status,error:r.error&&{code:r.error.code,message:r.error.message},path:process.env.PATH}})())'
/Users/prodigykim/.local/bin/agy --version
```

결과: 앱에서 ENOENT, shell 절대 경로에서 1.1.27. model 요청 자체의 성공 검사는 통과하지 않았으므로 절대 경로 수정만으로 end-to-end 복구됐다고 간주할 수 없다.
