"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const path = require("node:path");
const ROOT = path.resolve(__dirname, "../../../../../..");
const views = name => require(path.join(ROOT, "SYSTEM/Views", name));
const service = views("llmwiki-wiki-read-service.js");
const adapter = views("llmwiki-wiki-read-adapter.js");
const surfaceApi = views("llmwiki-wiki-surface.js");
const selector = views("llmwiki-user-source-selector.js");
const hash = views("llmwiki-hash.js");
const provider = views("llmwiki-batch-provider.js");
const { createTrustedFixture } = require("./fixtures/llmwiki-canonical-v2-trust-fixture.js");
const { FakeElement } = require("./knowledge_explorer_view_fakes.js");
const descendants = node => [node, ...node.children.flatMap(descendants)];

async function withSurface(run, configure = async () => {}) {
  const genuine = await createTrustedFixture(); // Same in-memory authority as todo-2.
  const counters = { provider_calls: 0, fixture_provider_calls: 0, writer_count: 0 };
  const selected = { source: { path: genuine.path, content_hash: genuine.revision } };
  await configure(genuine, selected);
  for (const method of ["create", "modify", "delete", "createFolder"]) genuine.app.vault[method] = () => {
    counters.writer_count++;
    throw new Error("query must not write");
  };
  const priorService = global.LLMWikiWikiReadService;
  const priorProvider = global.LLMWikiBatchProvider;
  const requests = [];
  global.LLMWikiWikiReadService = { ...service, answerSourceQuestion(input) {
    requests.push(input);
    return service.answerSourceQuestion(input);
  } };
  // Deterministic provider boundary only: real retrieval, schema and citation validation.
  const fixtureRuntime = { async requestStructured(request) {
    counters.fixture_provider_calls++;
    const input = JSON.parse(request.prompt);
    return { payload: { status: "ok", results: input.chunks.map(chunk => ({
      chunk_key: chunk.key, outcome: "proposals", items: chunk.evidence_candidates.map(evidence => ({
        role: "reusable_claim", topic: "Fixture", evidence_key: evidence.key,
        evidence_quote: evidence.text, claims: [evidence.text], review_reasons: [], related_candidate_ids: []
      }))
    })) } };
  } };
  global.LLMWikiBatchProvider = { ...provider, createBatchAnalysisProvider(options) {
    return provider.createBatchAnalysisProvider({ ...options, consumerRuntime: fixtureRuntime });
  } };
  const container = new FakeElement();
  let surface;
  try {
    surface = surfaceApi.mountLlmWikiWikiSurface({ app: genuine.app, container,
      snapshot: adapter.buildSnapshot({ assets: [genuine.row], collection_revision: genuine.revision }),
      readAdapter: adapter, getSelectedSource: () => selected.source });
    await run({ genuine, selected, counters, requests, surface, container });
    assert.equal(counters.writer_count, 0);
  } finally {
    surface?.destroy();
    global.LLMWikiWikiReadService = priorService;
    global.LLMWikiBatchProvider = priorProvider;
    // Fixture vaults are memory-only and become unreachable with this harness.
  }
}

function assertAnswer(answer, expectedPath, revision) {
  assert.equal(answer.ok, true, JSON.stringify(answer));
  assert.equal(answer.status, "proposed");
  assert.equal(answer.source_path, expectedPath);
  assert.ok(answer.answers.length > 0);
  for (const row of answer.answers) {
    assert.equal(row.citation.source_path, expectedPath);
    assert.equal(row.citation.content_hash, revision);
    assert.ok(row.citation.locator.startsWith(`${expectedPath}#L`));
  }
  assert.equal(answer.writer_count, 0);
}

function assertAbstain(answer, counters) {
  assert.equal(answer.ok, true, JSON.stringify(answer));
  assert.equal(answer.status, "abstain");
  assert.deepEqual(answer.answers, []);
  assert.equal(answer.provider_count, 0);
  assert.equal(answer.writer_count, 0);
  assert.equal(counters.fixture_provider_calls, 0);
}

test("todo-2 isolated Hub question answers canonical selection with current citation", async () => {
  await withSurface(async ({ genuine, surface, container, counters, requests }) => {
    const listed = await selector.listInboxSources({
      vault: { getMarkdownFiles: () => [{ path: genuine.path }], cachedRead: async () => genuine.bytes },
      metadataCache: { getFileCache: () => ({ frontmatter: {} }) }, hash, privacy: {}
    });
    assert.deepEqual(listed, []);
    surface.setQuery(genuine.document.statement);
    const input = descendants(container).find(node => node.tag === "input");
    input.value = genuine.document.statement;
    const ask = descendants(container).find(node => node.attr["data-action"] === "ask-source-question");
    const answer = await ask.onclick(); // Await the actual Hub surface button, not a reconstructed request.
    console.log(JSON.stringify({ manual_qa: "task-2 Hub selected-source question", canonicalPath: genuine.path, listed,
      result: { ok: answer.ok, status: answer.status, reason: answer.reason, source_path: answer.source_path,
        citation: answer.answers?.[0]?.citation, writer_count: answer.writer_count, provider_count: answer.provider_count },
      binding: { sources: requests[0].sources, verified_paths: requests[0].verified_paths, includeVerified: requests[0].includeVerified }, counters }));
    assertAnswer(answer, genuine.path, genuine.revision);
    assert.deepEqual(requests[0].sources, []);
    assert.deepEqual(requests[0].verified_paths, [genuine.path]);
    assert.equal(requests[0].includeVerified, false);
    assert.equal((await service.validateQuestionCitation({ app: genuine.app, citation: answer.answers[0].citation })).ok, true);
    assert.equal(counters.fixture_provider_calls, 1);
    assert.equal(surface.getConversation().turns[0].result, answer);
    assert.equal(await genuine.app.vault.read(genuine.app.vault.getAbstractFileByPath(genuine.path)), genuine.bytes);
  });
});

test("unknown evidence abstains without a provider; empty input is rejected", async () => {
  await withSurface(async ({ surface, counters }) => {
    assert.equal((await surface.askQuestion("   ")).reason, "invalid_query");
    const answer = await surface.askQuestion("quuxorbitalxylophone987654321");
    console.log(JSON.stringify({ malformed_input: "unknown evidence", status: answer.status, provider_count: answer.provider_count, counters }));
    assertAbstain(answer, counters);
  });
});

test("unknown canonical path is unresolved, never promoted to trusted evidence", async () => {
  await withSurface(async ({ surface, counters }) => {
    assertAbstain(await surface.askQuestion("approved"), counters);
  }, async (_genuine, selected) => { selected.source = { path: "ZETA/PERMANENT/Unknown.md", content_hash: "a".repeat(64) }; });
});

test("INBOX-only question keeps the pinned unverified source binding", async () => {
  await withSurface(async ({ surface, selected, requests, counters }) => {
    const answer = await surface.askQuestion("cobaltfixture951");
    assertAnswer(answer, selected.source.path, selected.source.content_hash);
    assert.deepEqual(requests[0].sources, [selected.source]);
    assert.deepEqual(requests[0].verified_paths, []);
    assert.equal(requests[0].includeVerified, false);
    assert.equal(answer.source_scope[0].trust, "literature");
    assert.equal(counters.fixture_provider_calls, 1);
  }, async (genuine, selected) => {
    const bytes = "# Evidence\n\ncobaltfixture951 stays inside for ten minutes.\n";
    selected.source = { path: "INBOX/Question fixture.md", content_hash: hash.sha256(bytes) };
    await genuine.app.vault.create(selected.source.path, bytes);
  });
});

test("protected sources still stop before provider transport", async () => {
  for (const sourcePath of ["CONTACTS/Person.md", "INBOX/private/Secret.md"]) {
    await withSurface(async ({ surface, counters }) => {
      const answer = await surface.askQuestion("cobaltfixture951");
      assert.equal(answer.reason, "source_privacy_blocked");
      assert.equal(counters.fixture_provider_calls, 0);
    }, async (genuine, selected) => {
      const bytes = "cobaltfixture951 stays inside for ten minutes.";
      selected.source = { path: sourcePath, content_hash: hash.sha256(bytes) };
      await genuine.app.vault.create(sourcePath, bytes);
    });
  }
  await withSurface(async ({ surface, counters, genuine }) => {
    const answer = await surface.askQuestion(genuine.document.statement);
    assertAbstain(answer, counters);
    assert.equal(answer.reason, "verified_scope_unreadable");
  }, async genuine => {
    const getCache = genuine.app.metadataCache.getFileCache;
    genuine.app.metadataCache.getFileCache = file => ({ frontmatter: { ...getCache(file).frontmatter, private: true } });
  });
});

test("stale canonical state cannot reuse the old citation or finalized authority", async () => {
  await withSurface(async ({ surface, counters, genuine }) => {
    const answer = await surface.askQuestion(genuine.document.statement);
    assertAnswer(answer, genuine.path, genuine.revision);
    genuine.app.vault.getAbstractFileByPath(genuine.path).bytes += "\nUnfinalized change.\n";
    assert.equal((await service.validateQuestionCitation({ app: genuine.app, citation: answer.answers[0].citation })).reason, "source_revision_changed");
    const stale = await surface.askQuestion(genuine.document.statement);
    assert.equal(stale.status, "abstain", JSON.stringify(stale));
    assert.equal(stale.provider_count, 0);
    assert.equal(counters.fixture_provider_calls, 1);
    assert.equal(stale.writer_count, 0);
  });
});
