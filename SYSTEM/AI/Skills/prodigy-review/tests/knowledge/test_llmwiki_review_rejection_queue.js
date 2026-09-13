"use strict";
// 반려한 제안은 승인 대기에 남지 않는다. 허브는 기록 상태가 resolved이거나 rejected인
// 검토를 닫힌 것으로 보고 대기 수/제안 목록에서 제외한다.
const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

const V = path.resolve(__dirname, "../../../../../Views");
const jobs = require(path.join(V, "llmwiki-batch-job-store.js"));
const hash = require(path.join(V, "llmwiki-hash.js"));
const { buildPages, runHub } = require("./knowledge_hub_integration_harness.js");

const SOURCE_ID = "source_plan_reject_fixture";
const SOURCE_PATH = "INBOX/reject fixture.md";
const SOURCE_REVISION = hash.sha256("fixture source bytes");
const PLAN_HASH = hash.sha256("fixture plan");
const REVIEW_ID = "plan_compiled_reject_fixture";

async function seededStore(status) {
  const disk = new Map();
  const storage = {
    async exists(key) { return disk.has(key); },
    async read(key) { return disk.get(key); },
    async writeAtomic(key, value) { disk.set(key, value); },
    async quarantine() { throw new Error("unexpected corrupt job"); },
  };
  const store = jobs.createBatchJobStore({ storage });
  await store.load();
  const job = await store.createJob({ request_key: hash.sha256(`reject-fixture-${status}`), sources: [{ source_id: SOURCE_ID, revision_hash: SOURCE_REVISION }] });
  await store.savePlanSnapshot({ job_id: job.job_id, source_id: SOURCE_ID, source_revision: SOURCE_REVISION,
    inventory_hash: hash.sha256("fixture inventory"), plan_hash: PLAN_HASH, plan_revision: 1, status: "compiled",
    plan: { plan_version: "fixture_document_v1", pages: [] } });
  const item = { review_id: REVIEW_ID, title: "반려 픽스처 검토", plan_kind: "compiled_document", plan_page_id: "page_reject_fixture",
    document_body: "# 반려 픽스처\n", grounded_claims: [], related_knowledge: [], proposed_target: null };
  const draft = { fields: { knowledge_kind: "claim", target_path: "new" }, touched: { knowledge_kind: true }, cleared: {},
    target_path: "new", target_revision: null, source_revision: SOURCE_REVISION, plan_hash: PLAN_HASH,
    item_hash: hash.sha256("fixture item"), sources: [{ source_id: SOURCE_ID, source_path: SOURCE_PATH, content_hash: SOURCE_REVISION }], edit_revision: 1 };
  const reviewKey = hash.sha256(String(REVIEW_ID));
  await store.saveCanonicalReviewDraft({ job_id: job.job_id, review_key: reviewKey, item, draft });
  if (status === "rejected") await store.rejectCanonicalReview({ job_id: job.job_id, review_key: reviewKey, review_id: REVIEW_ID });
  return { store, jobId: job.job_id, reviewKey };
}

const proposals = (container) => {
  const hits = [];
  const walk = (node) => { if (!node) return; if (node.attr?.["data-action"] === "select-proposal") hits.push(node); for (const child of node.children || []) walk(child); };
  walk(container);
  return hits;
};

test("review_ready 검토는 승인 대기에 세고, 반려한 검토는 세지 않는다", async () => {
  const report = {};
  for (const [status, expected] of [["review_ready", 1], ["rejected", 0]]) {
    const { store } = await seededStore(status);
    const result = await runHub({ pages: buildPages(), llmWikiControllerOptions: { batchJobStore: store } });
    const hub = result.window.KnowledgeExplorerHub;
    assert.equal(typeof hub.llmWikiLifecycleSnapshot, "function", "hub snapshot entry point missing");
    const snapshot = hub.llmWikiLifecycleSnapshot();
    report[status] = { pending: snapshot.inbox?.proposal_pending ?? 0, status: snapshot.status, rows: proposals(result.container).length };
    assert.equal(report[status].pending, expected, `${status} 대기 수: ${JSON.stringify(report[status])}`);
    assert.equal(report[status].rows, expected, `${status} 제안 행 수: ${JSON.stringify(report[status])}`);
  }
  assert.equal(report.review_ready.pending, 1, JSON.stringify(report));
  assert.equal(report.rejected.pending, 0, JSON.stringify(report));
});
