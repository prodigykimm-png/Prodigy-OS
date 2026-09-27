"use strict";
// 열린 관련 검토가 없는 마이그레이션 행은 막다른 "변경안 검토" 버튼을 그리지 않는다.
// 대신 이유 문구와 목록 지우기를 제공하고, 차단된 문서 패널은 닫기를 제공한다.
// 합성 픽스처 + 실제 Hub 마운트만 사용한다.
const assert = require("node:assert/strict");
const { test } = require("node:test");
const path = require("node:path");

const V = path.resolve(__dirname, "../../../../../Views");
const jobs = require(path.join(V, "llmwiki-batch-job-store.js"));
const hash = require(path.join(V, "llmwiki-hash.js"));
const { buildPages, runHub } = require("./knowledge_hub_integration_harness.js");

const LEGACY_PATH = "ZETA/PERMANENT/legacy album guide.md";
const LEGACY_BODY = [
  "---",
  'type: knowledge',
  'title: "legacy album guide"',
  'knowledge_domain: "wedding"',
  'knowledge_topics:',
  '  - "editing"',
  "---",
  "",
  "# legacy album guide",
  "",
  "가족사진은 신랑측 우선으로 배치한다.",
  "",
].join("\n");

const SOURCE_ID = "source_migration_availability_fixture";
const SOURCE_PATH = "INBOX/availability fixture.md";
const SOURCE_REVISION = hash.sha256("availability fixture source bytes");
const PLAN_HASH = hash.sha256("availability fixture plan");

function byAction(container, action) {
  const hits = [];
  const walk = (node) => {
    if (!node) return;
    if (node.attr && node.attr["data-action"] === action) hits.push(node);
    for (const child of node.children || []) walk(child);
  };
  walk(container);
  return hits;
}

function allTexts(container) {
  const texts = [];
  const walk = (node) => {
    if (!node) return;
    if (typeof node.textContent === "string" && node.textContent) texts.push(node.textContent);
    for (const child of node.children || []) walk(child);
  };
  walk(container);
  return texts.join("\n");
}

async function seededStore({ reviewStatus = null, reviewBlocked = false } = {}) {
  const disk = new Map();
  const storage = {
    async exists(key) { return disk.has(key); },
    async read(key) { return disk.get(key); },
    async writeAtomic(key, value) { disk.set(key, value); },
    async quarantine() { throw new Error("unexpected corrupt job"); },
  };
  const store = jobs.createBatchJobStore({ storage });
  await store.load();
  const job = await store.createJob({ request_key: hash.sha256(`availability-fixture-${reviewStatus || "none"}-${reviewBlocked}`),
    sources: [{ source_id: SOURCE_ID, revision_hash: SOURCE_REVISION }] });
  await store.savePlanSnapshot({ job_id: job.job_id, source_id: SOURCE_ID, source_revision: SOURCE_REVISION,
    inventory_hash: hash.sha256("availability fixture inventory"), plan_hash: PLAN_HASH, plan_revision: 1, status: "compiled",
    plan: { plan_version: "fixture_document_v1", pages: [] } });
  let reviewKey = null;
  if (reviewStatus) {
    const reviewId = `plan_compiled_availability_${reviewStatus}${reviewBlocked ? "_blocked" : ""}`;
    const item = { review_id: reviewId, title: "가용성 픽스처 검토", plan_kind: "compiled_document", plan_page_id: "page_availability_fixture",
      document_body: "# 가용성 픽스처\n", grounded_claims: [], related_knowledge: [],
      proposed_target: { path: LEGACY_PATH }, review_blocked: reviewBlocked };
    const draft = { fields: { knowledge_kind: "claim", target_path: "existing" }, touched: {}, cleared: {},
      target_path: "existing", target_revision: null, source_revision: SOURCE_REVISION, plan_hash: PLAN_HASH,
      item_hash: hash.sha256("availability fixture item"), sources: [{ source_id: SOURCE_ID, source_path: SOURCE_PATH, content_hash: SOURCE_REVISION }], edit_revision: 1 };
    reviewKey = hash.sha256(String(reviewId));
    await store.saveCanonicalReviewDraft({ job_id: job.job_id, review_key: reviewKey, item, draft });
    if (reviewStatus === "rejected") await store.rejectCanonicalReview({ job_id: job.job_id, review_key: reviewKey, review_id: reviewId });
  }
  return { store, jobId: job.job_id, reviewKey };
}

test("관련 검토가 없는 결정은 스냅샷에 none으로 적힌다", async () => {
  const result = await runHub({ pages: buildPages(), extraFiles: { [LEGACY_PATH]: LEGACY_BODY } });
  const hub = result.window.KnowledgeExplorerHub;
  await hub.dispatchLlmWikiAction({ action: "scan_migration" });
  const decisions = hub.llmWikiLifecycleSnapshot().migration.decisions;
  assert.equal(decisions.length, 1);
  assert.equal(decisions[0].covering_review_status, "none");
});

test("관련 검토가 없는 행은 변경안 검토 버튼 없이 이유와 지우기를 그린다", async () => {
  const result = await runHub({ pages: buildPages(), extraFiles: { [LEGACY_PATH]: LEGACY_BODY } });
  const hub = result.window.KnowledgeExplorerHub;
  await hub.dispatchLlmWikiAction({ action: "scan_migration" });
  assert.equal(byAction(result.container, "review-migration").length, 0, "열 수 없는 행에 검토 버튼이 있으면 안 된다");
  assert.equal(byAction(result.container, "dismiss-migration").length, 1, "목록에서 지우기가 있어야 한다");
  assert.ok(allTexts(result.container).includes("열린 관련 검토가 없어"), "막힌 이유를 한국어로 밝혀야 한다");
});

test("지우기는 쓰기 없이 결정을 지우고 마지막이면 장면이 사라진다", async () => {
  const result = await runHub({ pages: buildPages(), extraFiles: { [LEGACY_PATH]: LEGACY_BODY } });
  const hub = result.window.KnowledgeExplorerHub;
  const scanned = await hub.dispatchLlmWikiAction({ action: "scan_migration" });
  const decisionId = scanned.migration.decisions[0].decision_id;
  const dismissed = await hub.dispatchLlmWikiAction({ action: "dismiss_migration", decision_id: decisionId });
  assert.equal(dismissed.ok, true, JSON.stringify(dismissed));
  assert.equal(dismissed.provider_calls, 0);
  assert.equal(dismissed.write_counts.canonical, 0);
  assert.equal(dismissed.write_counts.audit, 0);
  assert.equal(dismissed.write_counts.refresh, 0);
  assert.equal(dismissed.write_counts.git, 0);
  assert.ok(!hub.llmWikiLifecycleSnapshot().migration, "마지막 결정을 지우면 마이그레이션 장면이 사라져야 한다");
  assert.deepEqual(result.app.vault.touched, [], "지우기는 볼트에 쓰면 안 된다");
});

test("열린 관련 검토가 있으면 변경안 검토 버튼을 그린다", async () => {
  const { store } = await seededStore({ reviewStatus: "review_ready" });
  const result = await runHub({ pages: buildPages(), extraFiles: { [LEGACY_PATH]: LEGACY_BODY },
    llmWikiControllerOptions: { batchJobStore: store } });
  const hub = result.window.KnowledgeExplorerHub;
  await hub.dispatchLlmWikiAction({ action: "scan_migration" });
  assert.equal(hub.llmWikiLifecycleSnapshot().migration.decisions[0].covering_review_status, "open");
  const buttons = byAction(result.container, "review-migration");
  assert.equal(buttons.length, 1);
  assert.equal((buttons[0].textContent || "").trim(), "변경안 검토");
  assert.equal(byAction(result.container, "dismiss-migration").length, 0);
});

test("닫힌 검토만 있으면 검토 결과 보기를 그린다", async () => {
  const { store } = await seededStore({ reviewStatus: "rejected" });
  const result = await runHub({ pages: buildPages(), extraFiles: { [LEGACY_PATH]: LEGACY_BODY },
    llmWikiControllerOptions: { batchJobStore: store } });
  const hub = result.window.KnowledgeExplorerHub;
  await hub.dispatchLlmWikiAction({ action: "scan_migration" });
  assert.equal(hub.llmWikiLifecycleSnapshot().migration.decisions[0].covering_review_status, "closed");
  const buttons = byAction(result.container, "review-migration");
  assert.equal(buttons.length, 1);
  assert.equal((buttons[0].textContent || "").trim(), "검토 결과 보기");
});

test("차단된 문서 패널은 확인과 함께 닫기를 제공한다", async () => {
  const { store } = await seededStore({ reviewStatus: "review_ready", reviewBlocked: true });
  const result = await runHub({ pages: buildPages(), llmWikiControllerOptions: { batchJobStore: store } });
  assert.equal(byAction(result.container, "inspect-review-block").length, 1, "기존 확인 조작이 있어야 한다");
  const closers = byAction(result.container, "close-review-block");
  assert.equal(closers.length, 1, "닫기 조작이 있어야 한다");
  assert.equal((closers[0].textContent || "").trim(), "닫기");
  await closers[0].onclick();
  assert.deepEqual(result.app.vault.touched, [], "닫기는 볼트에 쓰면 안 된다");
});
