"use strict";
// 대기열 한눈: 미완료 항목마다 이유가 보이고 다음 행동이 하나로 모인다.
// 실제 Hub 마운트만 사용한다.
const assert = require("node:assert/strict");
const { test } = require("node:test");
const path = require("node:path");

const V = path.resolve(__dirname, "../../../../../Views");
const jobs = require(path.join(V, "llmwiki-batch-job-store.js"));
const hash = require(path.join(V, "llmwiki-hash.js"));
const { buildPages, runHub } = require("./knowledge_hub_integration_harness.js");

const SOURCE_ID = "source_pending_queue_fixture";
const SOURCE_PATH = "INBOX/queue fixture.md";
const SOURCE_REVISION = hash.sha256("fixture queue source bytes");
const PLAN_HASH = hash.sha256("fixture queue plan");

function seedItem(reviewId, overrides = {}) {
  return { review_id: reviewId, title: "대기 픽스처 검토", plan_kind: "compiled_document", plan_page_id: "page_queue_fixture",
    document_body: "# 대기 픽스처\n", grounded_claims: [], related_knowledge: [], proposed_target: null, ...overrides };
}

function seedDraft() {
  return { fields: { knowledge_kind: "claim", target_path: "new" }, touched: {}, cleared: {},
    target_path: "new", target_revision: null, source_revision: SOURCE_REVISION, plan_hash: PLAN_HASH,
    item_hash: hash.sha256("fixture queue item"), sources: [{ source_id: SOURCE_ID, source_path: SOURCE_PATH, content_hash: SOURCE_REVISION }], edit_revision: 1 };
}

async function hubWithReview({ reviewId, itemOverrides = {}, attempts = [] }) {
  const disk = new Map();
  const storage = {
    async exists(key) { return disk.has(key); },
    async read(key) { return disk.get(key); },
    async writeAtomic(key, value) { disk.set(key, value); },
    async quarantine() { throw new Error("unexpected corrupt job"); },
  };
  const store = jobs.createBatchJobStore({ storage });
  await store.load();
  const job = await store.createJob({ request_key: hash.sha256(`queue-fixture-${reviewId}`),
    sources: [{ source_id: SOURCE_ID, revision_hash: SOURCE_REVISION }] });
  await store.savePlanSnapshot({ job_id: job.job_id, source_id: SOURCE_ID, source_revision: SOURCE_REVISION,
    inventory_hash: hash.sha256("fixture queue inventory"), plan_hash: PLAN_HASH, plan_revision: 1, status: "compiled",
    plan: { plan_version: "fixture_document_v1", pages: [] } });
  const item = seedItem(reviewId, itemOverrides);
  const reviewKey = hash.sha256(String(reviewId));
  await store.saveCanonicalReviewDraft({ job_id: job.job_id, review_key: reviewKey, item, draft: seedDraft() });
  for (const attempt of attempts) {
    await store.recordAttempt({ job_id: job.job_id, review_key: reviewKey, review_id: reviewId,
      stage: "review", observation: attempt.observation, disposition: attempt.disposition });
  }
  const runtime = await runHub({ pages: buildPages(), llmWikiControllerOptions: { batchJobStore: store } });
  return { runtime, jobId: job.job_id };
}

function queueText(runtime) {
  const texts = [];
  const walk = (node) => {
    if (!node) return;
    if (typeof node.textContent === "string" && node.textContent) texts.push(node.textContent);
    for (const child of node.children || []) walk(child);
  };
  walk(runtime.container);
  return texts.join("\n");
}

function reopenButtons(runtime) {
  const hits = [];
  const walk = (node) => {
    if (!node) return;
    if (node.tag === "button" && (node.textContent || "").trim() === "다시 열기") hits.push(node);
    for (const child of node.children || []) walk(child);
  };
  walk(runtime.container);
  return hits;
}

test("손댄 적 없는 항목은 첫 검토 대기로 보인다", async () => {
  const { runtime } = await hubWithReview({ reviewId: "plan_compiled_queue_fresh" });
  const joined = queueText(runtime);
  assert.ok(joined.includes("미완료 지식 반영"), "대기열이 있어야 한다");
  assert.ok(joined.includes("첫 검토 대기"), `이유가 보여야 한다: ${joined.slice(0, 300)}`);
  assert.equal(reopenButtons(runtime).length, 1, "다음 행동이 하나여야 한다");
});

test("버렸던 항목은 버림 사유로 보인다", async () => {
  const { runtime } = await hubWithReview({ reviewId: "plan_compiled_queue_rejected",
    attempts: [{ observation: "user_rejected", disposition: "rejected" }] });
  assert.ok(queueText(runtime).includes("지난번에 버림 — 다시 보기"), "버림 이유가 보여야 한다");
});

test("보류한 항목은 보류 중으로 보인다", async () => {
  const { runtime } = await hubWithReview({ reviewId: "plan_compiled_queue_held",
    attempts: [{ observation: "held", disposition: "held/no-change" }] });
  assert.ok(queueText(runtime).includes("보류 중 — 이어서 보기"), "보류 이유가 보여야 한다");
});

test("충돌 항목은 충돌 확인으로 보인다", async () => {
  const { runtime } = await hubWithReview({ reviewId: "plan_compiled_queue_blocked", itemOverrides: { review_blocked: true } });
  assert.ok(queueText(runtime).includes("충돌 확인 필요"), "충돌 이유가 보여야 한다");
});

async function hubWithClosed() {
  const disk = new Map();
  const storage = {
    async exists(key) { return disk.has(key); },
    async read(key) { return disk.get(key); },
    async writeAtomic(key, value) { disk.set(key, value); },
    async quarantine() { throw new Error("unexpected corrupt job"); },
  };
  const store = jobs.createBatchJobStore({ storage });
  await store.load();
  const seedJob = async (suffix, status, withRejection) => {
    const job = await store.createJob({ request_key: hash.sha256(`queue-closed-${suffix}`),
      sources: [{ source_id: SOURCE_ID, revision_hash: SOURCE_REVISION }] });
    await store.savePlanSnapshot({ job_id: job.job_id, source_id: SOURCE_ID, source_revision: SOURCE_REVISION,
      inventory_hash: hash.sha256("fixture queue inventory"), plan_hash: PLAN_HASH, plan_revision: 1, status: "compiled",
      plan: { plan_version: "fixture_document_v1", pages: [] } });
    if (withRejection) {
      const item = seedItem(`plan_compiled_queue_done_${suffix}`);
      const reviewKey = hash.sha256(String(item.review_id));
      await store.saveCanonicalReviewDraft({ job_id: job.job_id, review_key: reviewKey, item, draft: seedDraft() });
      await store.rejectCanonicalReview({ job_id: job.job_id, review_key: reviewKey, review_id: item.review_id });
    } else {
      const item = seedItem(`plan_compiled_queue_done_${suffix}`,
        { proposed_target: { path: "ZETA/PERMANENT/done guide.md", revision: hash.sha256("done") } });
      const snapshot = store.getPlanSnapshot(job.job_id);
      await store.savePlanSnapshot({ ...snapshot, plan_revision: snapshot.plan_revision + 1,
        canonical_reviews: { [hash.sha256(String(item.review_id))]: { item, status } } });
    }
    return job.job_id;
  };
  await seedJob("applied", "resolved", false);
  await seedJob("dropped", "rejected", true);
  const runtime = await runHub({ pages: buildPages(), llmWikiControllerOptions: { batchJobStore: store } });
  return runtime;
}

test("끝난 항목은 결과와 대상으로 보인다", async () => {
  const runtime = await hubWithClosed();
  const joined = queueText(runtime);
  assert.ok(joined.includes("완료 기록"), "완료 기록이 있어야 한다");
  assert.ok(joined.includes("반영됨"), "반영 결과가 보여야 한다");
  assert.ok(joined.includes("ZETA/PERMANENT/done guide.md"), "대상이 보여야 한다");
  assert.ok(joined.includes("버려짐"), "버림 결과가 보여야 한다");
  assert.ok(joined.includes("새 분석 실행"), "다시 제안 안내가 있어야 한다");
});

test("닫힌 항목을 빼고 다음 열린 항목을 고른다", async () => {
  const disk = new Map();
  const storage = {
    async exists(key) { return disk.has(key); },
    async read(key) { return disk.get(key); },
    async writeAtomic(key, value) { disk.set(key, value); },
    async quarantine() { throw new Error("unexpected corrupt job"); },
  };
  const store = jobs.createBatchJobStore({ storage });
  await store.load();
  for (const suffix of ["one", "two"]) {
    const reviewId = `plan_compiled_queue_advance_${suffix}`;
    const job = await store.createJob({ request_key: hash.sha256(`queue-advance-${suffix}`),
      sources: [{ source_id: SOURCE_ID, revision_hash: SOURCE_REVISION }] });
    await store.savePlanSnapshot({ job_id: job.job_id, source_id: SOURCE_ID, source_revision: SOURCE_REVISION,
      inventory_hash: hash.sha256("fixture queue inventory"), plan_hash: PLAN_HASH, plan_revision: 1, status: "compiled",
      plan: { plan_version: "fixture_document_v1", pages: [] } });
    await store.saveCanonicalReviewDraft({ job_id: job.job_id, review_key: hash.sha256(reviewId),
      item: seedItem(reviewId, { title: `넘김 픽스처 ${suffix}` }), draft: seedDraft() });
  }
  const runtime = await runHub({ pages: buildPages(), llmWikiControllerOptions: { batchJobStore: store } });
  const hub = runtime.window.KnowledgeExplorerHub;
  const next = hub.nextAutoAdvanceItem("plan_compiled_queue_advance_one");
  assert.ok(next, "다음 항목이 있어야 한다");
  assert.equal(next.review_id, "plan_compiled_queue_advance_two");
  const first = hub.nextAutoAdvanceItem("plan_compiled_queue_advance_unknown");
  assert.ok(first, "모르는 항목을 닫아도 열린 항목이 나와야 한다");
  assert.ok(["plan_compiled_queue_advance_one", "plan_compiled_queue_advance_two"].includes(first.review_id), `열린 항목 중 하나: ${first.review_id}`);
  await hub.openCanonicalDocumentReview(next);
  assert.ok(queueText(runtime).includes("넘김 픽스처 two"), "다음 검토가 열려야 한다");
});
