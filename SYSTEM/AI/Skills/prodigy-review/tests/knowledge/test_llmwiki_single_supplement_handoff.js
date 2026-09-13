"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");
const test = require("node:test");
const ROOT = path.resolve(__dirname, "../../../../../..");
const reducer = require(path.join(ROOT, "SYSTEM/Views/llmwiki-document-reducer.js"));
const compiler = require(path.join(ROOT, "SYSTEM/Views/llmwiki-document-compiler.js"));
const review = require(path.join(ROOT, "SYSTEM/Views/llmwiki-page-plan-review-state.js"));
const { firstElement, runHub } = require("./knowledge_hub_integration_harness.js");

const supplements = ["철골조는 공사 기간을 단축한다.", "임대수익이 이자를 감당하지 못하면 장기 보유하지 않는다."];
function inventoryFor(texts, role = "reusable_claim", targets = []) {
  const source = { source_id: "task4", source_path: "INBOX/supplement.md", content_hash: "a".repeat(64) };
  return reducer.createClaimInventory({ source, documents: [{
    role, title: "Supplement", claims: texts.map(text => ({ text })),
    sections: [{ heading: "Supplement", claims: texts.map(text => ({ text })) }],
    citations: texts.map(text => ({ ...source, locators: [`${source.source_path}#1`], evidence_quote: text, confidence: "explicit" })),
    matched_candidate_ids: targets,
  }] }).value;
}
function sourceOnly(request) {
  const ids = request.claims.map(claim => claim.claim_id);
  return { source_guide: { overview: "자료", sections: [{ heading: "자료", summary: "자료", claim_ids: ids }], key_questions: [] },
    topic_pages: [], source_only_claim_ids: ids };
}
function articles(request) {
  return { articles: request.pages.map(page => ({ page_id: page.page_id,
    sections: [{ heading: page.title, paragraphs: page.claims.map(claim => ({ text: claim.text, claim_ids: [claim.claim_id] })) }] })) };
}

for (const text of supplements) {
  test(`task4 singleton partition reaches review: ${text}`, async () => {
    const inventory = inventoryFor([text]);
    const result = await reducer.createPagePlanner({ requestPlan: async request => sourceOnly(request) }).plan({ inventory });
    assert.equal(result.ok, true, result.reason);
    assert.equal(inventory.claims[0].role, "reusable_claim");
    assert.equal(result.value.pages.length, 1, "one reusable supplement must not disappear into source-only");
    assert.deepEqual(result.value.source_only_claim_ids, []);
    assert.deepEqual(result.value.pages[0].claim_ids, [inventory.claims[0].claim_id]);
    assert.equal(result.value.status, "pending_review");
    const state = review.createPagePlanReviewState({ plan: result.value });
    const stale = state.dispatch({ action: "toggle_page", page_id: result.value.pages[0].page_id, expected_plan_hash: "b".repeat(64) });
    assert.equal(stale.reason, "stale_page_plan_action");
    let compileCalls = 0;
    const compile = compiler.createDocumentCompiler({ requestArticles: async request => { compileCalls++; return articles(request); } });
    assert.equal((await compile.compile({ inventory, approved_plan: result.value })).reason, "approved_page_plan_required");
    assert.equal(compileCalls, 0);
    const approved = state.dispatch({ action: "approve_plan", expected_plan_hash: state.getSnapshot().plan_hash });
    const compiled = await compile.compile({ inventory, approved_plan: approved.snapshot });
    assert.equal(compiled.ok, true, compiled.reason);
    assert.equal(compileCalls, 1);
    assert.deepEqual(compiled.documents.map(document => [document.document_kind, document.role]),
      [["source_guide", "source_summary"], ["topic_article", "reusable_claim"]]);
    assert.equal(compiled.documents[1].claims.length, 1);
    assert.equal(compiled.documents[1].citations[0].source_path, inventory.source.source_path);
    assert.equal(compiled.quality_status, "draft");
  });
}

test("singleton repair preserves source-only taxonomy, existing pages, and candidate allowlists", async () => {
  const summary = inventoryFor(["서재 사다리 제작 참고 사이트가 기록되어 있다."], "source_summary");
  const multi = inventoryFor(supplements);
  for (const inventory of [summary, multi]) {
    const planned = await reducer.createPagePlanner({ requestPlan: async request => sourceOnly(request) }).plan({ inventory });
    assert.equal(planned.ok, true, planned.reason);
    assert.equal(planned.value.pages.length, 0);
    assert.deepEqual(planned.value.source_only_claim_ids, inventory.claims.map(claim => claim.claim_id));
  }
  const inventory = inventoryFor([supplements[0]], "reusable_claim", ["cand_allowed", "cand_forged"]);
  const options = { allowedCandidateIds: ["cand_allowed"], requestPlan: async request => sourceOnly(request) };
  const planned = await reducer.createPagePlanner(options).plan({ inventory });
  assert.equal(planned.value.pages.length, 1);
  assert.deepEqual(planned.value.pages[0].target_candidate_ids, ["cand_allowed"]);
  assert.equal(planned.value.pages[0].operation_hint, "update");
  const existing = await reducer.createPagePlanner({ ...options, requestPlan: async request => ({
    ...sourceOnly(request), topic_pages: [{ title: "Existing", purpose: "Supplement", claim_ids: [inventory.claims[0].claim_id], target_candidate_ids: [] }], source_only_claim_ids: [],
  }) }).plan({ inventory });
  assert.equal(existing.value.pages.length, 1);
  assert.equal(existing.value.pages[0].title, "Existing");
});

test("singleton repair cannot hide malformed partitions or stale inventory", async () => {
  const inventory = inventoryFor([supplements[0]]);
  for (const ids of [[], [inventory.claims[0].claim_id, inventory.claims[0].claim_id], ["claim_forged"]]) {
    const result = await reducer.createPagePlanner({ requestPlan: async request => ({ ...sourceOnly(request), source_only_claim_ids: ids }) }).plan({ inventory });
    assert.equal(result.ok, false);
    assert.equal(result.reason, "invalid_page_plan_coverage");
  }
  let calls = 0;
  const result = await reducer.createPagePlanner({ requestPlan: async request => { calls++; return sourceOnly(request); } })
    .plan({ inventory: { ...inventory, inventory_hash: "b".repeat(64) } });
  assert.equal(result.reason, "invalid_claim_inventory");
  assert.equal(calls, 0);
});

function elements(root, predicate) {
  return [ ...(predicate(root) ? [root] : []), ...(root.children || []).flatMap(child => elements(child, predicate)) ];
}

test("Hub singleton opens one source-linked whole-document review selectable for apply without writes", { timeout: 15000 }, async t => {
  const sourcePath = "INBOX/supplement.md";
  const quote = supplements[0];
  const sourceBytes = `# Supplement\n\n${quote}\n`;
  const calls = { map: 0, plan: 0, compile: 0, transport: 0 };
  const runtime = await runHub({ pages: [], extraFiles: { [sourcePath]: sourceBytes }, llmWikiControllerOptions: {
    batchIdentity: { provider_key: "openrouter", model: "local-fixture", structured_mode: "json_schema", schema_id: "llmwiki_compact_v2", prompt_version: "llmwiki_batch_compact_v2" },
    batchProvider: async request => {
      calls.map++;
      return { ok: true, provider_call_count: 0, artifacts: request.chunks.map(chunk => ({ chunk_key: chunk.key, outcome: "proposals",
        items: [{ role: "reusable_claim", topic: "Supplement", evidence_quote: quote, claims: [{ text: quote }], review_reasons: [], related_candidate_ids: [],
          span: { start: chunk.text.indexOf(quote), end: chunk.text.indexOf(quote) + quote.length, alias: "span_supplement" } }] })) };
    },
    documentPagePlan: async request => { calls.plan++; return sourceOnly(request); },
    documentArticleCompiler: async request => { calls.compile++; return articles(request); },
  } });
  runtime.window.ProdigyAIConsumerRuntime = { requestStructured: async () => { calls.transport++; throw new Error("unexpected_provider_call"); } };
  await runtime.window.KnowledgeExplorerHub.whenKnowledgeInboxSettled();
  const hub = runtime.window.KnowledgeExplorerHub;
  const planned = await hub.runDocumentPlan(sourcePath);
  assert.equal(planned.ok, true, JSON.stringify(planned));
  assert.equal(planned.status, "pending_review");
  assert.equal(planned.pages, 1);
  assert.equal((await hub.compileDocumentPlan()).ok, true);
  const compiled = hub.documentPlanCompileSnapshot();
  assert.deepEqual(Array.from(compiled.documents, document => document.role), ["source_summary", "reusable_claim"]);
  const reviewButtons = () => elements(runtime.container, node => node.attr?.["data-action"] === "review-canonical-document");
  assert.equal(reviewButtons().length, 1, "the source guide is context, not a duplicate review item");
  // The Hub awaits inlineWikiReview.ready; no Modal.open event is emitted.
  await reviewButtons()[0].onclick();
  const reviewRoot = () => elements(runtime.container, node => node.classNames?.includes("llmwiki-document-review"))[0];
  assert.ok(reviewRoot());
  const sourceButtons = elements(reviewRoot(), node => node.tag === "button" && node.attr?.["data-citation-locator"]?.startsWith(`${sourcePath}#`));
  assert.equal(sourceButtons.length, 1);
  const field = name => elements(reviewRoot(), node => node.attr?.["data-review-field"] === name)[0];
  field("target_path").value = "new";
  await field("target_path").oninput();
  // Synthetic whole-document review choices; no claim-by-claim procedure.
  const fields = { knowledge_kind: "claim", knowledge_domain: "coding", knowledge_topics: "ai", application_trigger: "fixture review",
    application_contexts: "coding/ai", conditions: "fixture scope", invalidation_conditions: "source changed", relation_status: "resolved", classification: "epistemic", evidence_strength: "sufficient" };
  for (const [name, value] of Object.entries(fields)) { field(name).value = value; await field(name).oninput(); }
  const action = name => firstElement(runtime.container, "button", node => node.attr?.["data-action"] === name);
  const prepare = action("prepare-document-review"), apply = action("apply-document-review");
  const accepted = firstElement(runtime.container, "input", node => Object.hasOwn(node.attr || {}, "data-review-acknowledgement"));
  assert.equal(accepted.checked, false);
  assert.equal(apply.disabled, true);
  await apply.onclick();
  await prepare.onclick();
  assert.equal(accepted.checked, false, "preparing the document must not approve it");
  assert.equal(apply.disabled, true);
  accepted.checked = true;
  accepted.onchange();
  assert.equal(apply.disabled, false, "the source-linked document can be selected for apply");
  accepted.checked = false;
  accepted.onchange();
  assert.equal(apply.disabled, true);
  await apply.onclick();
  await reviewButtons()[0].onclick();
  assert.equal(elements(runtime.container, node => node.classNames?.includes("llmwiki-document-review")).length, 1, "reopening replaces the inline view, not the document review identity");
  for (const [name, value] of Object.entries(fields)) assert.equal(field(name).value, value);
  assert.equal(firstElement(runtime.container, "input", node => Object.hasOwn(node.attr || {}, "data-review-acknowledgement")).checked, false);
  assert.equal(runtime.openedModals.length, 0, "the default Hub handoff is inline");
  assert.equal(reviewButtons().length, 1);
  assert.equal(hub.reviewedWikiSnapshot().entries.length, 0);
  const canonicalWrites = runtime.app.vault.touched.filter(row => row.slice(1).some(value => String(value).startsWith("ZETA/"))).length;
  assert.equal(canonicalWrites, 0);
  assert.equal(await runtime.app.vault.read(runtime.app.vault.getAbstractFileByPath(sourcePath)), sourceBytes);
  assert.deepEqual(calls, { map: 1, plan: 1, compile: 1, transport: 0 });
  t.diagnostic(JSON.stringify({ review_items: reviewButtons().length, review_modals: runtime.openedModals.length,
    source_links: sourceButtons.length, selectable_for_apply: true, automatic_approval: false, canonical_writes: canonicalWrites,
    source_writes: 0, orphan_guides_written: 0, provider_calls: calls.transport, local_fixture_calls: calls }));
});
