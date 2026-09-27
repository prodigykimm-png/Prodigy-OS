import json,subprocess,shlex,pathlib,time
queries=[('literature','Einstein'),('literature','creative thinking'),('literature','Imagination as a Foundation of Discovery'),('literature','imagination sufficient grounding'),('literature','ZXQ987_UNRELATED'),('all','synthetic-alpha')]
rows=[]
for mode,q in queries:
 code='JSON.stringify((()=>{const b=KnowledgeExplorerHub.llmWikiBrowse;b.setMode('+json.dumps(mode)+');b.setQuery('+json.dumps(q)+');const s=b.getState();return {status:s.status,error:s.error,total:s.result?.total,rows:s.result?.rows?.map(r=>({path:r.path,title:r.title,citations:r.citations}))}})())'
 cmd=' '.join(shlex.quote(x) for x in ['/Applications/Obsidian.app/Contents/MacOS/Obsidian','vault=Dusk','eval','code='+code]);t=time.perf_counter();p=subprocess.run(cmd,shell=True,capture_output=True,text=True)
 rows.append({'query':q,'mode':mode,'command':cmd,'wall_ms':(time.perf_counter()-t)*1000,'stdout':p.stdout,'stderr':p.stderr})
 print(q,p.stdout[:400])
pathlib.Path('artifacts/llmwiki-runtime-audit-20260909/ui-queries.json').write_text(json.dumps(rows,ensure_ascii=False,indent=2))

restore = 'JSON.stringify((()=>{const b=KnowledgeExplorerHub.llmWikiBrowse;b.setQuery("");b.setMode("verified");return {status:b.getState().status}})())'
subprocess.run(" ".join(shlex.quote(x) for x in ["/Applications/Obsidian.app/Contents/MacOS/Obsidian", "vault=Dusk", "eval", "code="+restore]), shell=True, check=True)
