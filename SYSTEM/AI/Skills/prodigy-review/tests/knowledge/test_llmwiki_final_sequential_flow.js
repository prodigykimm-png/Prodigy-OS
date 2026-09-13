"use strict";
const test = require("node:test"), assert = require("node:assert/strict"), path = require("node:path");
const V = path.resolve(__dirname, "../../../../../Views");
const analyzerApi = require(path.join(V, "llmwiki-batch-analyzer.js"));
const jobs = require(path.join(V, "llmwiki-batch-job-store.js"));
const hash = require(path.join(V, "llmwiki-hash.js"));
function storage() {
  const disk = new Map();
  return { disk, exists: async p => disk.has(p), read: async p => disk.get(p), writeAtomic: async (p, v) => disk.set(p, v), quarantine: async () => { throw new Error("unexpected quarantine"); } };
}
function source(id) { return { source_id: `source_${id.toLowerCase()}`, source_path: `INBOX/${id}.md`, extracted_text: `Independent ${id} evidence.` }; }
function harness(onRequest) {
  const disk = storage(), jobStore = jobs.createBatchJobStore({ storage: disk }), files = new Map(), requests = [];
  const vault = { getAbstractFileByPath: p => files.has(p) ? { path: p } : null, cachedRead: async f => files.get(f.path), createFolder: async () => {}, create: async (p, v) => files.set(p, v), modify: async (f, v) => files.set(f.path, v) };
  const identity = { provider_key: "mock", model: "mock/frozen", structured_mode: "json_schema", schema_id: "compact", prompt_version: "test" };
  const options = { jobStore, vault, identity, provider: async request => {
    requests.push(request);
    const failure = await onRequest?.(request, requests.length);
    if (failure) return failure;
    return { ok: true, artifacts: request.chunks.map(chunk => ({ chunk_key: chunk.key, outcome: "proposals", items: [{ role: "reusable_claim", topic: "Independent", evidence_quote: chunk.text, claims: [{ text: chunk.text }], span: { start: 0, end: chunk.text.length, alias: "span_mock" }, related_candidate_ids: [], review_reasons: [] }] })) };
  } };
  return { disk, jobStore, requests, identity, options, analyzer: analyzerApi.createBatchAnalyzer(options) };
}
test("task7 mock: A waits for review, local B fails, independent C still reaches review", async () => {
  const h = harness(request => request.chunks.some(c => c.text.includes(" B ")) ? { ok: false, reason: "article_quality_review_required" } : null);
  const result = await h.analyzer.analyze({ sources: [source("A"), source("B"), source("C")], independent_sources: true });
  const state = await h.jobStore.load();
  assert.equal(Object.values(state.jobs).filter(j => j.status === "review_ready" && Object.keys(j.sources).length === 1).length, 2, "A and C have independent durable review-ready jobs");
  assert.equal(result.source_results[1].reason, "article_quality_review_required");
  assert.equal(result.source_results[2].state, "review_ready");
  const before = JSON.stringify(state.jobs[result.source_results[0].job_id]);
  const replay = await h.analyzer.analyze({ sources: [source("A"), source("B"), source("C")], independent_sources: true });
  assert.equal(replay.metrics.provider_calls, 0);
  assert.equal(JSON.stringify(state.jobs[result.source_results[0].job_id]), before);
});
for (const reason of ["provider_auth_required", "provider_transport_error", "provider_outcome_unknown"]) test(`task7 mock: ${reason} spends no later provider-bound item`, async () => {
  const h = harness(() => ({ ok: false, reason }));
  const result = await h.analyzer.analyze({ sources: [source("A"), source("B"), source("C")], independent_sources: true });
  assert.equal(h.requests.flatMap(r => r.chunks).length, 1, "B and C must not be dequeued into a provider request");
  assert.equal(result.reason, reason);
  const calls = h.requests.length;
  await h.analyzer.analyze({ sources: [source("A"), source("B"), source("C")], independent_sources: true });
  assert.equal(h.requests.length, calls, "normal resume never retries shared/unknown failure");
});
test("task7 mock: batch, provider function and identity freeze before the first await", async () => {
  const selected = [source("A"), source("B")];
  let h;
  h = harness((_request, count) => {
    if (count === 1) { selected.push(source("C")); selected[1].extracted_text = "Changed input"; h.identity.model = "changed"; h.options.provider = async () => { throw new Error("provider switched"); }; }
  });
  const result = await h.analyzer.analyze({ sources: selected, independent_sources: true });
  assert.equal(result.ok, true, result.reason);
  assert.deepEqual(h.requests.flatMap(r => r.chunks.map(c => c.text)), ["Independent A evidence.", "Independent B evidence."]);
  assert.ok(Object.values((await h.jobStore.load()).jobs).every(j => j.frozen_identity.model === "mock/frozen"));
});
const assembler = require(path.join(V, "llmwiki-document-assembler.js"));
const materializer = require(path.join(V, "llmwiki-inbox-proposal-materializer.js"));
const review = require(path.join(V, "llmwiki-document-canonical-review.js"));
const candidateStore = require(path.join(V, "knowledge-candidate-store.js"));
function reviewVault() {
  const files = new Map();
  const app = { vault: { getAbstractFileByPath: p => files.get(p) || null, getFiles: () => [...files.values()], read: async f => f.bytes,
    createFolder: async () => {}, create: async (p, bytes) => { const f = { path: p, bytes, extension: p.endsWith('.md') ? 'md' : 'json', basename: p.split('/').pop().replace(/\.md$/u, '') }; files.set(p, f); return f; },
    modify: async (f, bytes) => { f.bytes = bytes; }, delete: async f => files.delete(f.path) },
    metadataCache: { getFileCache: f => ({ frontmatter: candidateStore.parseLifecycleDocument(f.bytes) }) } };
  return { app, files };
}
const fields = { knowledge_kind: 'claim', knowledge_domain: 'coding', knowledge_topics: 'ai', application_trigger: 'Review models', application_contexts: 'coding/ai', conditions: 'Indoor models', invalidation_conditions: 'Source changes', relation_status: 'resolved', classification: 'epistemic', evidence_strength: 'sufficient' };
function documentFor(s, candidateId) {
  return assembler.createDocumentAssembler({ candidateDocuments: [{ candidate_id: candidateId }] }).assemble({ source: { ...s, content_hash: hash.sha256(s.extracted_text) }, artifacts: [{ chunk_key: `chunk_${s.source_id}`, outcome: 'proposals', items: [{ role: 'reusable_claim', topic: 'Shared target', evidence_quote: s.extracted_text, claims: [{ text: s.extracted_text }], related_candidate_ids: [candidateId], span: { start: 0, end: s.extracted_text.length } }] }] }).documents[0];
}
test('task8 mock: two permitted sources combine into one exact target and retain both versions', async () => {
  const sources = [source('A'), source('B')].map(s => ({ ...s, content_hash: hash.sha256(s.extracted_text) }));
  const candidateId = 'cand_shared', pageId = 'page_0123456789abcdef01234567';
  const target = 'ZETA/CANDIDATES/shared.md';
  const before = `# Shared\n\n<!-- llmwiki-managed:start ${pageId} -->\nold\n<!-- llmwiki-managed:end ${pageId} -->\n`;
  const documents = sources.map(s => ({ ...documentFor(s, candidateId), document_kind: 'topic_article', page_id: pageId }));
  const mapper = materializer.createInboxProposalMaterializer({ relatedCandidates: [{ candidate_id: candidateId, path: target, content_hash: hash.sha256(before), revision: hash.sha256(before), before_bytes: before }], allowedCandidateIds: [candidateId] });
  const result = mapper.materializeDocuments({ source: sources[0], sources, documents });
  assert.equal(result.ok, true, result.reason);
  assert.equal(result.proposals.length, 1, 'one proposal per exact target before review');
  const op = result.proposals[0].operation;
  assert.deepEqual(op.source_citations.map(c => [c.source_id, c.content_hash]), sources.map(s => [s.source_id, s.content_hash]));
  assert.deepEqual(op.destination_ids, [target]);
  for (const s of sources) assert.ok(op.after_bytes[target].includes(s.extracted_text));
  assert.deepEqual(op.effects, { deprecations: [], supersessions: [] });
  const forged = mapper.materializeDocuments({ source: sources[0], sources: [sources[0]], documents });
  assert.equal(forged.ok, false, 'unselected source cannot join the target');
  const reducer = require(path.join(V, 'llmwiki-document-reducer.js'));
  const compiler = require(path.join(V, 'llmwiki-document-compiler.js'));
  const stable = v => Array.isArray(v) ? `[${v.map(stable).join(',')}]` : v && typeof v === 'object' ? `{${Object.keys(v).sort().map(k => `${JSON.stringify(k)}:${stable(v[k])}`).join(',')}}` : JSON.stringify(v);
  const inventoryResult = reducer.createClaimInventory({ source: sources[0], documents });
  assert.equal(inventoryResult.ok, true, inventoryResult.reason);
  const inventory = inventoryResult.value, ids = inventory.claims.map(c => c.claim_id);
  const body = { plan_version: 'llmwiki_page_plan_v1', inventory_hash: inventory.inventory_hash, source: inventory.source,
    source_guide: { title: 'Guide', overview: 'Model evidence', sections: [{ heading: 'Evidence', claim_ids: ids }], key_questions: [] },
    pages: [{ page_id: pageId, title: 'Shared model evidence', purpose: 'Review both sources', claim_ids: ids, target_candidate_ids: [], operation_hint: 'create' }],
    source_only_claim_ids: [], status: 'approved', plan_revision: 1 };
  const compiled = await compiler.createDocumentCompiler({ requestArticles: async request => ({ articles: request.pages.map(p => ({ page_id: p.page_id,
    sections: [{ heading: 'Model evidence', paragraphs: [{ text: p.claims.map(c => c.text).join(' '), claim_ids: p.claim_ids }] }] })) }) }).compile({ inventory, approved_plan: { ...body, plan_hash: hash.sha256(stable(body)) } });
  assert.equal(compiled.ok, true, compiled.reason);
  const article = compiled.documents.find(d => d.document_kind === 'topic_article');
  assert.equal(article.citations.length, 2);
  const { app, files } = reviewVault();
  for (const s of sources) await app.vault.create(s.source_path, s.extracted_text);
  const item = { review_id: 'review_combined', title: article.title, document_body: article.body, compiled_sections: article.sections,
    grounded_claims: article.claims.map(c => ({ ...c, citations: c.citation_ids.map(id => {
      const citation = article.citations.find(row => row.citation_id === id);
      return { ...citation, locator: `${citation.source_path}#L1` };
    }) })) };
  const flow = review.create({ app });
  const prepared = await flow.prepare({ item, fields });
  assert.equal(prepared.ok, true, JSON.stringify(prepared));
  assert.deepEqual(prepared.value.source_paths, sources.map(s => s.source_path));
  const applied = await flow.apply(prepared.value, { approved: true, claims_accepted: true, packet_hash: prepared.value.packet_hash });
  assert.equal(applied.ok, true, JSON.stringify(applied));
  const readback = (await flow.targets())[0];
  assert.deepEqual(readback.sources.map(s => [s.source_id, s.source_revision]), sources.map(s => [s.source_id, s.content_hash]));
  assert.equal([...files.keys()].filter(p => p.startsWith('ZETA/PERMANENT')).length, 1);
});
test('task8 mock: a second pending exact target is blocked after restart without consuming first edits', async () => {
  const { app, files } = reviewVault(), disk = storage();
  let jobStore = jobs.createBatchJobStore({ storage: disk });
  async function setup(suffix) {
    const s = source(suffix); await app.vault.create(s.source_path, s.extracted_text);
    const citation = { source_id: s.source_id, source_path: s.source_path, locator: `${s.source_path}#L1`, content_hash: hash.sha256(s.extracted_text), evidence_quote: s.extracted_text };
    const item = { review_id: `review_${suffix}`, title: 'Shared model review', document_body: `## Model\n${s.extracted_text}\n`, grounded_claims: [{ text: s.extracted_text, citations: [citation] }] };
    const job = await jobStore.createJob({ request_key: hash.sha256(suffix), sources: [{ source_id: s.source_id, revision_hash: citation.content_hash }] });
    await jobStore.savePlanSnapshot({ job_id: job.job_id, source_id: s.source_id, source_revision: citation.content_hash, inventory_hash: hash.sha256('inventory'), plan_hash: hash.sha256(suffix), plan_revision: 1, status: 'compiled', plan: { pages: [] } });
    return { item, job, flow: review.create({ app, jobStore, jobId: job.job_id }) };
  }
  const first = await setup('A');
  const p = await first.flow.prepare({ item: first.item, fields: { ...fields, application_trigger: 'Owner edited trigger' } });
  assert.equal(p.ok, true, JSON.stringify(p));
  const saved = JSON.stringify(jobStore.getPlanSnapshot(first.job.job_id));
  jobStore = jobs.createBatchJobStore({ storage: disk }); await jobStore.load();
  const second = await setup('B');
  const q = await second.flow.prepare({ item: second.item, fields });
  assert.equal(q.ok, false, 'second pending proposal must not silently proceed');
  assert.equal(q.reason, 'pending_target_conflict');
  assert.equal(JSON.stringify(jobStore.getPlanSnapshot(first.job.job_id)), saved);
  assert.equal([...files.keys()].filter(p => p.startsWith('ZETA/PERMANENT')).length, 0);
  const approved = await first.flow.apply(p.value, { approved: true, claims_accepted: true, packet_hash: p.value.packet_hash });
  assert.equal(approved.ok, true, JSON.stringify(approved));
  const again = await first.flow.apply(p.value, { approved: true, claims_accepted: true, packet_hash: p.value.packet_hash });
  assert.equal(again.ok, true);
  assert.equal([...files.keys()].filter(p => p.startsWith('ZETA/PERMANENT')).length, 1);
});
test('task7 mock Hub entry: local failure keeps independent source reviews and reports partial progress', async () => {
  const { runHub } = require('./knowledge_hub_integration_harness.js');
  const h = harness(request => request.chunks.some(c => c.text.includes(' B ')) ? { ok: false, reason: 'article_quality_review_required' } : null);
  const runtime = await runHub({ pages: [], extraFiles: Object.fromEntries(['A', 'B', 'C'].map(id => [`INBOX/${id}.md`, `# ${id}\n\nIndependent ${id} evidence.\n`])),
    llmWikiControllerOptions: { batchIdentity: h.identity, batchProvider: h.options.provider } });
  const hub = runtime.window.KnowledgeExplorerHub;
  await hub.whenKnowledgeInboxSettled();
  const outcome = await hub.dispatchLlmWikiAction({ action: 'analyze_inbox' });
  assert.equal(outcome.ok, true, outcome.reason);
  const snapshot = hub.llmWikiLifecycleSnapshot();
  assert.equal(snapshot.inbox.state, 'partial');
  assert.equal(snapshot.inbox.succeeded, 2);
  assert.equal(snapshot.inbox.failed, 1);
  assert.equal(snapshot.risk_packets.length, 2);
  assert.equal(h.requests.length, 3);
  assert.equal(h.requests.every(request => request.chunks.length === 1), true);
});
test('task7 mock: explicit retry uses current identity only for incomplete work and preserves completed edits', async () => {
  const h = harness((_request, count) => count === 2 ? { ok: false, reason: 'provider_auth_required' } : null);
  const sources = [source('A'), source('B'), source('C')];
  const result = await h.analyzer.analyze({ sources, independent_sources: true });
  const first = result.source_results[0], s = sources[0];
  const plan = await h.jobStore.savePlanSnapshot({ job_id: first.job_id, source_id: s.source_id, source_revision: hash.sha256(s.extracted_text), inventory_hash: hash.sha256('inventory'), plan_hash: hash.sha256('plan'), plan_revision: 1, status: 'compiled', plan: { pages: [] }, canonical_reviews: { [hash.sha256('review')]: { status: 'resolved', fields: { application_trigger: 'User edit retained' } } } });
  await h.jobStore.setJobState(first.job_id, 'resolved');
  const fresh = analyzerApi.createBatchAnalyzer({ ...h.options, identity: { ...h.identity, model: 'mock/current' } });
  const retry = await fresh.analyze({ sources, independent_sources: true, explicit_retry: true, retry_intent_id: 'retry-current' });
  assert.equal(retry.ok, true, retry.reason);
  assert.equal(retry.source_results[0].state, 'resolved');
  assert.equal(retry.source_results[0].metrics.provider_calls, 0);
  assert.equal(retry.metrics.provider_calls, 2);
  const child = h.jobStore.getJob(retry.source_results[1].job_id);
  assert.equal(child.retry_parent_job_id, result.source_results[1].job_id);
  assert.equal(child.frozen_identity.model, 'mock/current');
  assert.deepEqual(h.jobStore.getPlanSnapshot(first.job_id), plan);
  const replay = await fresh.analyze({ sources, independent_sources: true, explicit_retry: true, retry_intent_id: 'retry-current' });
  assert.equal(replay.metrics.provider_calls, 0);
});
test('task7 mock: same-settings retry retains the shared-failure parent attempt', async () => {
  const h = harness((_request, count) => count === 2 ? { ok: false, reason: 'provider_transport_error' } : null);
  const sources = [source('A'), source('B'), source('C')];
  const first = await h.analyzer.analyze({ sources, independent_sources: true });
  const retried = await h.analyzer.analyze({ sources, independent_sources: true, explicit_retry: true, retry_intent_id: 'retry-same-settings' });
  assert.equal(retried.ok, true, retried.reason);
  assert.equal(h.jobStore.getJob(first.job_id).status, 'blocked', 'failed parent attempt is history, not a mutable success');
  assert.equal(h.jobStore.getJob(retried.job_id).retry_parent_job_id, first.job_id);
  assert.equal(retried.metrics.provider_calls, 2);
});
test('task7 mock runtime: settings drift stops before another provider-bound dequeue', async () => {
  let epoch = 'frozen-epoch';
  const h = harness(() => { epoch = 'changed-epoch'; });
  h.options.client = { resolveProvider: () => ({ status: 'ready', profile_id: 'profile-mock' }),
    listProviders: () => [{ profile_id: 'profile-mock', provider_key: 'mock', certification_hash: hash.sha256('settings') }],
    listModels: () => [{ profile_id: 'profile-mock', model: 'mock/actual' }],
    getHandshake: () => ({ runtime_epoch: epoch }), requestStructured: async () => { throw new Error('not used by direct mock'); } };
  const result = await h.analyzer.analyze({ sources: [source('A'), source('B'), source('C')], independent_sources: true });
  assert.equal(h.requests.length, 1, 'changed runtime settings must not spend B or C');
  assert.equal(result.reason, 'provider_settings_changed');
  assert.equal(result.metrics.provider_calls, 1);
  assert.equal(h.jobStore.getJob(result.source_results[0].job_id).frozen_identity.model, 'mock/actual');
});
for (const reason of ['provider_auth_required', 'provider_transport_error']) test(`task7 mock Hub shared stop: ${reason} leaves the rest pending`, async () => {
  const { runHub } = require('./knowledge_hub_integration_harness.js');
  const h = harness(() => ({ ok: false, reason }));
  const runtime = await runHub({ pages: [], extraFiles: Object.fromEntries(['A', 'B', 'C'].map(id => [`INBOX/${id}.md`, `# ${id}\n\nIndependent ${id} evidence.\n`])),
    llmWikiControllerOptions: { batchIdentity: h.identity, batchProvider: h.options.provider } });
  const hub = runtime.window.KnowledgeExplorerHub;
  await hub.whenKnowledgeInboxSettled();
  const outcome = await hub.dispatchLlmWikiAction({ action: 'analyze_inbox' });
  assert.equal(outcome.ok, false);
  assert.equal(outcome.reason, reason);
  assert.equal(h.requests.length, 1);
  assert.equal(h.requests[0].chunks.length, 1);
  const snapshot = hub.llmWikiLifecycleSnapshot();
  assert.equal(snapshot.inbox.failed, 1, 'only the dequeued source failed');
  assert.equal(snapshot.inbox.pending, 2);
  assert.equal(snapshot.inbox.remaining_source_ids.length, 2);
});
