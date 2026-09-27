// Explicit canary-only retry probe. All durable test state is isolated in /tmp.
module.exports = async function(app) {
  const fs = require('fs'), path = require('path'), os = require('os');
  const base = app.vault.adapter.basePath;
  const hash = globalThis.LLMWikiHash, storeApi = globalThis.LLMWikiBatchJobStore;
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'llmwiki-live-retry-'));
  const vault = {
    getAbstractFileByPath(name) { return fs.existsSync(path.join(directory, name)) ? { path: name } : null; },
    async cachedRead(file) { return fs.readFileSync(path.join(directory, file.path), 'utf8'); },
    async createFolder(name) { fs.mkdirSync(path.join(directory, name), { recursive: true }); },
    async create(name, text) { const target=path.join(directory,name);fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,text); },
    async modify(file, text) { fs.writeFileSync(path.join(directory,file.path),text); },
  };
  try {
    const source_path = 'INBOX/LLM Wiki Recovery Canary.md';
    const extracted_text = await app.vault.read(app.vault.getAbstractFileByPath(source_path));
    const sources = [{ source_id: 'source_retry_canary', source_path, extracted_text }];
    const identity = { provider_key: 'antigravity', model: 'gemini-3.8-flash-low', structured_mode: 'json_schema', schema_id: 'llmwiki_compact_v1', prompt_version: 'recovery_retry_v1', candidate_context_hash: hash.sha256('[]') };
    const storage = {
      async exists(name) { return fs.existsSync(path.join(directory, name)); },
      async read(name) { return fs.readFileSync(path.join(directory, name), 'utf8'); },
      async writeAtomic(name, text) { const target=path.join(directory,name);fs.writeFileSync(target+'.tmp',text);fs.renameSync(target+'.tmp',target); },
      async quarantine(name) { fs.renameSync(path.join(directory,name),path.join(directory,name+'.quarantine')); },
    };
    const store = storeApi.createBatchJobStore({ storage });
    await store.load();
    const parent = await store.createJob({ request_key: storeApi.requestKey(identity), sources: [{source_id:sources[0].source_id,revision_hash:hash.sha256(extracted_text)}], frozen_identity:identity });
    await store.setJobState(parent.job_id, 'blocked');
    const provider = globalThis.LLMWikiBatchProvider.createBatchAnalysisProvider({ app });
    const analyzer = globalThis.LLMWikiBatchAnalyzer.createBatchAnalyzer({ jobStore:store, provider, identity, vault, cachePath:'cache.json', coveragePath:'coverage.json' });
    const normal = await analyzer.analyze({ sources });
    const start=performance.now();
    const retried = await analyzer.analyze({ sources, explicit_retry:true, retry_intent_id:'recovery-explicit-canary-1' });
    return { normal:{state:normal.state,calls:normal.metrics.provider_calls}, explicit:{ok:retried.ok,reason:retried.reason,state:retried.state,calls:retried.metrics.provider_calls,parent:store.getJob(retried.job_id)?.retry_parent_job_id===parent.job_id,ms:performance.now()-start}, real_provider:true, isolated_state:true };
  } finally { fs.rmSync(directory,{recursive:true,force:true}); }
};
