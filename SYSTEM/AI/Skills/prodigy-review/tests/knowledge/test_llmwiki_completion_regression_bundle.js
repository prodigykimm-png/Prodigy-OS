"use strict";

const test = require("node:test"), assert = require("node:assert/strict");
const fs = require("node:fs"), os = require("node:os"), path = require("node:path");
const V = path.resolve(__dirname, "../../../../../Views");
const review = require(path.join(V, "llmwiki-document-canonical-review.js"));
const jobs = require(path.join(V, "llmwiki-batch-job-store.js"));
const hash = require(path.join(V, "llmwiki-hash.js"));
const store = require(path.join(V, "knowledge-candidate-store.js"));
const reader = require(path.join(V, "llmwiki-resurfacing-read-adapter.js"));
const obsidian = require(path.join(V, "llmwiki-obsidian-adapter.js"));
const { FakeElement } = require("./knowledge_explorer_view_fakes.js");
const fixture = require("./fixtures/llmwiki-completion-regression.json");
const fields = { knowledge_kind: "claim", knowledge_domain: "coding", knowledge_topics: "ai",
  application_trigger: "실내 합성 모형 점검", application_contexts: "coding/ai", conditions: "실내 모형에만 적용",
  exclusions: "실외 적용 금지. 경고등 점등 시 즉시 중단하고 재개 금지.", invalidation_conditions: "원문 또는 적용 조건 변경",
  relation_status: "resolved", classification: "epistemic", evidence_strength: "sufficient" };
const elements = (node, predicate) => [...(predicate(node) ? [node] : []), ...node.children.flatMap(child => elements(child, predicate))];
const occurrence = (text, part) => text.split(part).length - 1;

function diskVault(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "llmwiki-task11-"));
  t.after(() => { fs.rmSync(root, { recursive: true }); assert.equal(fs.existsSync(root), false); });
  const files = new Map(), writes = [];
  const resolve = p => { const value = path.resolve(root, p); assert.ok(value.startsWith(root + path.sep)); return value; };
  const vault = {
    getAbstractFileByPath: p => files.get(p) || null, getFiles: () => [...files.values()],
    getMarkdownFiles: () => [...files.values()].filter(file => file.extension === "md"),
    read: async file => fs.readFileSync(resolve(file.path), "utf8"),
    cachedRead: async file => vault.read(file),
    createFolder: async p => fs.mkdirSync(resolve(p), { recursive: true }),
    async create(p, bytes) {
      fs.mkdirSync(path.dirname(resolve(p)), { recursive: true }); fs.writeFileSync(resolve(p), bytes, { flag: "wx" });
      const file = { path: p, extension: p.endsWith(".md") ? "md" : "json", basename: path.basename(p, ".md") };
      files.set(p, file); writes.push(["create", p]); return file;
    },
    async modify(file, bytes) { fs.writeFileSync(resolve(file.path), bytes); writes.push(["modify", file.path]); },
    async delete(file) { fs.unlinkSync(resolve(file.path)); files.delete(file.path); writes.push(["delete", file.path]); }
  };
  const app = { vault, metadataCache: { getFileCache: file => ({ frontmatter: store.parseLifecycleDocument(fs.readFileSync(resolve(file.path), "utf8")) }) } };
  const storage = {
    exists: async key => Boolean(vault.getAbstractFileByPath(`SYSTEM/CACHE/llmwiki/${key}`)),
    read: async key => vault.read(vault.getAbstractFileByPath(`SYSTEM/CACHE/llmwiki/${key}`)),
    async writeAtomic(key, bytes) {
      const p = `SYSTEM/CACHE/llmwiki/${key}`, file = vault.getAbstractFileByPath(p);
      if (file) await vault.modify(file, bytes); else await vault.create(p, bytes);
    },
    quarantine: async () => { throw new Error("unexpected_corrupt_test_store"); }
  };
  return { app, writes, storage, canonicalWrites: () => writes.filter(row => row[1].startsWith("ZETA/PERMANENT/")).length };
}

function fromFixture(key) {
  const source = fixture[key], lines = source.text.split("\n");
  if (source.sha256) assert.equal(hash.sha256(source.text), source.sha256);
  const quotes = source.answers ? lines.filter(line => line && !line.startsWith("#")).slice(0, source.answers.length) : [source.text];
  const claims = quotes.map((quote, i) => ({ claim_id: `claim_${hash.sha256(`${key}:${i}`).slice(0, 24)}`,
    text: source.answers?.[i] || quote, citations: [{ source_id: source.source_id, source_path: source.path,
      locator: `${source.path}#L${lines.indexOf(quote) + 1}`, content_hash: hash.sha256(source.text), evidence_quote: quote }] }));
  return { review_id: `review_task11_${key}`, title: source.title, grounded_claims: claims,
    document_body: `# ${source.title}\n\n${claims.map(c => `${c.text} [원문](${encodeURI(c.citations[0].locator)})`).join("\n\n")}\n`
      + (source.user_note ? `\n## 사용자 메모\n${source.user_note}\n` : "")
      + (source.reason ? `\n> ${source.reason}\n` : "") };
}

async function jobFor(jobStore, item) {
  const citation = item.grounded_claims[0].citations[0];
  const job = await jobStore.createJob({ request_key: hash.sha256(item.review_id), sources: [{ source_id: citation.source_id, revision_hash: citation.content_hash }] });
  await jobStore.savePlanSnapshot({ job_id: job.job_id, source_id: citation.source_id, source_revision: citation.content_hash,
    inventory_hash: hash.sha256(JSON.stringify(item.grounded_claims)), plan_hash: hash.sha256(item.document_body),
    plan_revision: 1, status: "compiled", plan: { pages: [] } });
  return job.job_id;
}

async function applyThroughReview(app, jobStore, item, target = "new") {
  const jobId = await jobFor(jobStore, item), container = new FakeElement("section");
  let outcome;
  const opened = review.open({ app, item, jobStore, jobId, container, onComplete: result => { outcome = result; } });
  await opened.ready;
  const find = predicate => elements(container, predicate)[0];
  for (const [key, value] of Object.entries({ target_path: target, ...fields })) {
    const input = find(node => node.attr?.["data-review-field"] === key);
    assert.ok(input, key); input.value = value; await input.oninput();
  }
  const action = name => find(node => node.attr?.["data-action"] === name);
  await action("prepare-document-review").onclick();
  const after = find(node => node.attr?.["data-raw-markdown"] === "after")?.text;
  assert.equal(typeof after, "string", JSON.stringify(container.textContent));
  const acknowledgement = find(node => Object.hasOwn(node.attr, "data-review-acknowledgement"));
  assert.equal(acknowledgement.checked, false);
  assert.equal(action("apply-document-review").disabled, true);
  acknowledgement.checked = true; acknowledgement.onchange();
  await action("apply-document-review").onclick();
  assert.equal(outcome?.ok, true, JSON.stringify(outcome || container.textContent));
  assert.equal(await app.vault.read(app.vault.getAbstractFileByPath(outcome.target_path)), after);
  return { outcome, after, jobId };
}

async function inspectLinks(app, bytes) {
  const wikiLinks = [...bytes.matchAll(/\[\[([^\]]+)\]\]/gu)].map(match => match[1].split("|")[0].split("#")[0]);
  for (const locator of wikiLinks) assert.ok(app.vault.getAbstractFileByPath(locator.endsWith(".md") ? locator : `${locator}.md`), locator);
  const citations = [...bytes.matchAll(/(?<!!)\[[^\]]*\]\(([^)]+)\)/gu)].map(match => decodeURI(match[1]));
  for (const locator of citations) {
    const [p, fragment] = locator.split("#"), file = app.vault.getAbstractFileByPath(p);
    assert.ok(file, locator);
    const sourceLines = (await app.vault.read(file)).split("\n");
    const line = /^L(\d+)(?:-L?(\d+))?$/u.exec(fragment || "");
    assert.ok(line, locator); assert.ok(Number(line[1]) >= 1 && Number(line[2] || line[1]) <= sourceLines.length, locator);
  }
  return { wiki_links: wikiLinks.length, citations: citations.length };
}

test("task11 current disk + review DOM: A create, B same-target, C attributed hold, three related readbacks", async t => {
  const h = diskVault(t), { app } = h;
  for (const key of ["A", "B", "C", "reference", "third"]) await app.vault.create(fixture[key].path, fixture[key].text);
  let jobStore = jobs.createBatchJobStore({ storage: h.storage }); await jobStore.load();
  const A = fromFixture("A"), a = await applyThroughReview(app, jobStore, A);
  const reference = await applyThroughReview(app, jobStore, fromFixture("reference"));
  const B = fromFixture("B"); B.related_knowledge = [{ path: reference.outcome.target_path, title: fixture.reference.title }];
  const b = await applyThroughReview(app, jobStore, B, a.outcome.target_path);
  assert.equal(b.outcome.target_path, a.outcome.target_path);
  const body = store.parseLifecycleDocument(b.after).body;
  for (const claim of [...A.grounded_claims, ...B.grounded_claims]) assert.equal(occurrence(body, claim.text), 1, claim.claim_id);
  assert.equal(occurrence(body, fixture.A.user_note), 1);
  assert.equal(occurrence(body, B.document_body.trim()), 1);
  const third = fromFixture("third"); third.related_knowledge = [a.outcome, reference.outcome].map(row => ({ path: row.target_path }));
  const d = await applyThroughReview(app, jobStore, third);
  const beforeReplay = h.canonicalWrites();
  const repeated = await review.create({ app, jobStore, jobId: b.jobId }).prepare({ item: B, fields, target_path: a.outcome.target_path });
  assert.equal(repeated.status, "no_change", JSON.stringify(repeated));
  assert.equal(h.canonicalWrites(), beforeReplay);

  const C = fromFixture("C"), conflictJob = await jobFor(jobStore, C), conflictFlow = review.create({ app, jobStore, jobId: conflictJob });
  const draftIdentity = (await conflictFlow.restoreDraft(C)).identity;
  await conflictFlow.saveDraft(C, { ...draftIdentity, fields: { ...fields, relation_status: "conflict" },
    touched: { relation_status: true }, cleared: {}, target_path: "", target_revision: null, edit_revision: 1 });
  const held = await conflictFlow.prepare({ item: C, fields: { ...fields, relation_status: "conflict" } });
  assert.equal(held.reason, "promotion_review_required");
  await conflictFlow.hold(C, fixture.C.reason);
  jobStore = jobs.createBatchJobStore({ storage: h.storage }); await jobStore.load();
  const restored = jobStore.getPlanSnapshot(conflictJob);
  const retained = Object.values(restored.canonical_reviews)[0];
  assert.equal(retained.item.document_body, C.document_body);
  assert.deepEqual(retained.item.grounded_claims, C.grounded_claims);
  assert.notEqual(C.grounded_claims[0].citations[0].locator, C.grounded_claims[1].citations[0].locator);
  assert.equal(retained.pending_draft.fields.relation_status, "conflict");
  const heldAttempt = jobStore.getJob(conflictJob).attempts.find(row => row.observation === "held");
  assert.equal(heldAttempt.correction_reason, fixture.C.reason);
  assert.equal(heldAttempt.disposition, "held/no-change");
  assert.equal(h.canonicalWrites(), beforeReplay);

  const readback = await reader.create().read({ app }); assert.equal(readback.ok, true);
  assert.equal(readback.rows.length, 3);
  const authorities = (await obsidian.createObsidianAdapter(app).readFinalizedCanonicalAuthorities()).map(obsidian.finalizedCanonicalAuthorityData);
  const reports = [];
  for (const result of [b, reference, d]) {
    const row = readback.rows.find(row => row.path === result.outcome.target_path); assert.ok(row);
    assert.equal(row.canonical_bytes, result.after); assert.equal(row.canonical_revision, hash.sha256(result.after));
    const authority = authorities.find(authority => authority.path === row.path);
    assert.equal(authority.revision, row.canonical_revision);
    for (const source of authority.canonical_v2_authority.claim_set.sources) {
      const f = Object.values(fixture).find(f => f.source_id === source.source_id);
      assert.ok(f); assert.equal(source.source_content_hash, hash.sha256(await app.vault.read(app.vault.getAbstractFileByPath(f.path))));
    }
    for (const citation of authority.canonical_v2_authority.claim_set.citations) {
      const f = Object.values(fixture).find(f => f.source_id === citation.source_id);
      assert.equal(hash.sha256(f.text.slice(citation.source_span.start, citation.source_span.end)), citation.span_digest);
    }
    reports.push({ path: row.path, revision: row.canonical_revision, ...await inspectLinks(app, row.canonical_bytes), canonical_bytes: row.canonical_bytes });
  }
  assert.deepEqual(authorities.find(row => row.path === b.outcome.target_path).canonical_v2_authority.claim_set.sources.map(row => row.source_id).sort(), [fixture.A.source_id, fixture.B.source_id].sort());
  await inspectLinks(app, retained.item.document_body);
  for (const key of ["A", "B", "C", "reference", "third"]) assert.equal(await app.vault.read(app.vault.getAbstractFileByPath(fixture[key].path)), fixture[key].text);
  t.diagnostic(JSON.stringify({ current_code: true, historical_inputs_only: true, mock_provider_calls: 0, external_provider_calls: 0,
    native: "NOT RUN", approval: "synthetic review DOM actions", canonical_writes: h.canonicalWrites(), readbacks: reports,
    conflict: { reason: held.reason, disposition: heldAttempt.disposition, attributed_claims: retained.item.grounded_claims.length, retained_proposal: retained.item.document_body } }));
});
