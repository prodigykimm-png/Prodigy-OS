"use strict";
// 분야 차단 라우팅: 다시 열 때 대상의 등록 분야를 물려받고,
// 그래도 막히면 분야 행을 펼치고 짚는다. 실제 Hub 마운트만 사용한다.
const assert = require("node:assert/strict");
const { test } = require("node:test");
const path = require("node:path");

const V = path.resolve(__dirname, "../../../../../Views");
const jobs = require(path.join(V, "llmwiki-batch-job-store.js"));
const hash = require(path.join(V, "llmwiki-hash.js"));
const { buildPages, runHub } = require("./knowledge_hub_integration_harness.js");

const LEGACY_PATH = "ZETA/PERMANENT/legacy album guide.md";
const legacyBody = (domain) => [
  "---",
  'type: knowledge',
  'title: "legacy album guide"',
  `knowledge_domain: "${domain}"`,
  "---",
  "",
  "# legacy album guide",
  "",
  "가족사진은 신랑측 우선으로 배치한다.",
  "",
].join("\n");

const SOURCE_ID = "source_domain_routing_fixture";
const SOURCE_PATH = "INBOX/domain fixture.md";
const CLAIM = "앨범은 식순을 따르되 보기 편하게 배치한다.";
const SOURCE_BYTES = `분야 픽스처 원문.\n${CLAIM}\n`;
const SOURCE_REVISION = hash.sha256(SOURCE_BYTES);
const PLAN_HASH = hash.sha256("domain routing fixture plan");
// Mirrors the review module's draft identity: restore archives any draft whose
// item_hash was not computed from the actual item. Keep in sync with
// itemHash() in llmwiki-document-canonical-review.js.
const stable = value => Array.isArray(value) ? `[${value.map(stable).join(",")}]` : value && typeof value === "object" ? `{${Object.keys(value).sort().map(k => `${JSON.stringify(k)}:${stable(value[k])}`).join(",")}}` : JSON.stringify(value);
const itemHash = (item) => hash.sha256(stable([item.review_id, item.document_body, item.grounded_claims, item.proposed_target || null]));

function walk(node, predicate, hits = []) {
  if (!node) return hits;
  if (predicate(node)) hits.push(node);
  for (const child of node.children || []) walk(child, predicate, hits);
  return hits;
}

function byAction(root, action) {
  return walk(root, (node) => node.attr && node.attr["data-action"] === action);
}

function domainSelect(root) {
  return walk(root, (node) => node.tag === "select" && node.attr && node.attr["data-review-field"] === "knowledge_domain")[0] || null;
}

function conditionsDetails(root) {
  return walk(root, (node) => node.attr && node.attr["data-review-conditions"] !== undefined)[0] || null;
}

function allTexts(root) {
  const texts = [];
  walk(root, (node) => {
    if (typeof node.textContent === "string" && node.textContent) texts.push(node.textContent);
  });
  return texts.join("\n");
}

async function hubWithDraft({ domainValue, touchedDomain, topicsValue, legacyDomain, reviewId }) {
  const legacyBytes = legacyBody(legacyDomain);
  const disk = new Map();
  const storage = {
    async exists(key) { return disk.has(key); },
    async read(key) { return disk.get(key); },
    async writeAtomic(key, value) { disk.set(key, value); },
    async quarantine() { throw new Error("unexpected corrupt job"); },
  };
  const store = jobs.createBatchJobStore({ storage });
  await store.load();
  const job = await store.createJob({ request_key: hash.sha256(`domain-routing-${reviewId}`),
    sources: [{ source_id: SOURCE_ID, revision_hash: SOURCE_REVISION }] });
  await store.savePlanSnapshot({ job_id: job.job_id, source_id: SOURCE_ID, source_revision: SOURCE_REVISION,
    inventory_hash: hash.sha256("domain routing inventory"), plan_hash: PLAN_HASH, plan_revision: 1, status: "compiled",
    plan: { plan_version: "fixture_document_v1", pages: [] } });
  const item = { review_id: reviewId, title: "분야 픽스처 검토", plan_kind: "compiled_document", plan_page_id: "page_domain_fixture",
    document_body: `## 분야 픽스처\n${CLAIM}\n`,
    grounded_claims: [{ text: CLAIM, citations: [{ source_id: SOURCE_ID, source_path: SOURCE_PATH, locator: `${SOURCE_PATH}#L2`, content_hash: SOURCE_REVISION, evidence_quote: CLAIM }] }],
    related_knowledge: [],
    proposed_target: { path: LEGACY_PATH, revision: hash.sha256(legacyBytes) } };
  const draft = { fields: { knowledge_kind: "claim", knowledge_domain: domainValue, knowledge_topics: topicsValue,
      relation_status: "resolved", classification: "epistemic", evidence_strength: "sufficient", target_path: LEGACY_PATH },
    touched: touchedDomain ? { knowledge_domain: true } : {}, cleared: {},
    target_path: LEGACY_PATH, target_revision: hash.sha256(legacyBytes), source_revision: SOURCE_REVISION, plan_hash: PLAN_HASH,
    item_hash: itemHash(item),
    sources: [{ source_id: SOURCE_ID, source_path: SOURCE_PATH, content_hash: SOURCE_REVISION }], edit_revision: 1 };
  await store.saveCanonicalReviewDraft({ job_id: job.job_id, review_key: hash.sha256(String(reviewId)), item, draft });
  const runtime = await runHub({ pages: buildPages(), extraFiles: { [LEGACY_PATH]: legacyBytes, [SOURCE_PATH]: SOURCE_BYTES },
    llmWikiControllerOptions: { batchJobStore: store } });
  const hub = runtime.window.KnowledgeExplorerHub;
  await hub.dispatchLlmWikiAction({ action: "scan_migration" });
  const decision = hub.llmWikiLifecycleSnapshot().migration.decisions.find((row) => row.path === LEGACY_PATH);
  assert.ok(decision, "the legacy note must be listed as a migration decision");
  const opened = await hub.dispatchLlmWikiAction({ action: "review_migration", decision_id: decision.decision_id });
  assert.equal(opened.ok, true, JSON.stringify(opened));
  const modal = runtime.openedModals.at(-1);
  assert.ok(modal, "the covering review must open as a modal");
  assert.equal(typeof modal.onOpen, "function", "the review modal must be openable");
  await modal.onOpen();
  return { runtime, hub, modal };
}

test("다시 열 때 대상의 등록 분야를 물려받는다", async () => {
  const { modal } = await hubWithDraft({ domainValue: "", touchedDomain: false, topicsValue: "",
    legacyDomain: "wedding", reviewId: "plan_compiled_domain_inherit" });
  const select = domainSelect(modal.contentEl);
  assert.ok(select, "분야 선택기가 있어야 한다");
  assert.equal(select.value, "wedding", "대상의 등록 분야를 물려받아야 한다");
  assert.ok(!allTexts(modal.contentEl).includes("등록된 분야를 하나 고르지 않으면"), "물려받으면 분야 선택 요구가 사라져야 한다");
});

test("소유자가 고른 등록 분야는 덮지 않는다", async () => {
  const { modal } = await hubWithDraft({ domainValue: "reading", touchedDomain: true, topicsValue: "",
    legacyDomain: "wedding", reviewId: "plan_compiled_domain_preserve" });
  assert.equal(domainSelect(modal.contentEl).value, "reading", "소유자 선택이 우선해야 한다");
});

test("분야가 비면 막힐 때 분야 행을 드러내고 짚는다", async () => {
  const { runtime, modal } = await hubWithDraft({ domainValue: "", touchedDomain: false, topicsValue: "",
    legacyDomain: "misc", reviewId: "plan_compiled_domain_empty" });
  assert.equal(domainSelect(modal.contentEl).value, "", "등록되지 않은 대상 분야는 물려받지 않는다");
  const prepareButton = byAction(modal.contentEl, "prepare-document-review")[0];
  assert.ok(prepareButton, "변경안 확인 조작이 있어야 한다");
  await prepareButton.onclick();
  const joined = allTexts(modal.contentEl);
  assert.ok(joined.includes("등록된 분야"), `분야 차단 문구가 있어야 한다: ${joined.slice(0, 300)}`);
  const errors = walk(modal.contentEl, (node) => node.attr && node.attr["data-field-error"] === "knowledge_domain");
  assert.equal(errors.length, 1, "분야 행에 차단 표시가 있어야 한다");
  assert.equal(conditionsDetails(modal.contentEl).open, true, "분야가 든 접힘이 열려야 한다");
  assert.equal(domainSelect(modal.contentEl).focused, true, "분야 선택기로 포커스가 가야 한다");
  assert.deepEqual(runtime.app.vault.touched, [], "막힌 준비는 볼트에 쓰면 안 된다");
});

test("미등록 주제도 같은 분야 행으로 안내한다", async () => {
  const { modal } = await hubWithDraft({ domainValue: "", touchedDomain: false, topicsValue: "unregistered-topic",
    legacyDomain: "wedding", reviewId: "plan_compiled_domain_topics" });
  assert.equal(domainSelect(modal.contentEl).value, "wedding", "대상 분야는 먼저 물려받아야 한다");
  await byAction(modal.contentEl, "prepare-document-review")[0].onclick();
  const errors = walk(modal.contentEl, (node) => node.attr && node.attr["data-field-error"] === "knowledge_domain");
  assert.equal(errors.length, 1, "주제 미등록도 분야 행으로 안내해야 한다");
  assert.equal(conditionsDetails(modal.contentEl).open, true, "분야가 든 접힘이 열려야 한다");
  assert.equal(domainSelect(modal.contentEl).focused, true, "분야 선택기로 포커스가 가야 한다");
});
