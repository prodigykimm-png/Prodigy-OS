"use strict";
// 중복이라고 말하면 무엇과 겹치는지 보여 줘야 한다: 상대 문서·문장·원문 보기, 그리고
// 원시 코드 대신 상대 문서를 밝힌 한국어 차단 문구. 합성 픽스처만 사용한다.
const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const jobs = require(path.resolve(__dirname, "../../../../../Views/llmwiki-batch-job-store.js"));
const fx = require("./fixtures/llmwiki_review_fixtures.js");

function duplicateItem(reviewId, { withSentences = true } = {}) {
  const row = { title: fx.LEGACY_TITLE, path: fx.LEGACY_PATH, relation: "duplicate", covered_claim_count: 1 };
  if (withSentences) row.covered_claims = [fx.OVERLAP_SENTENCE];
  return fx.makeItem({ reviewId, related: [row] });
}

test("중복 추천이면 겹치는 문서와 문장을 검토 화면에서 볼 수 있다", async () => {
  const { modal, item } = await fx.openReview({ item: duplicateItem("plan_compiled_synthetic_dup_1") });
  assert.ok(fx.byAttr(modal.contentEl, "data-knowledge-overlap")[0], "겹치는 기존 지식 블록이 있어야 한다");
  const documents = fx.byAttr(modal.contentEl, "data-overlap-document");
  assert.equal(documents.length, 1);
  assert.equal(documents[0].attr["data-overlap-document"], fx.LEGACY_PATH);
  const sentences = fx.byAttr(modal.contentEl, "data-overlap-claim");
  assert.equal(sentences.length, 1);
  assert.equal(sentences[0].textContent, fx.OVERLAP_SENTENCE);
  assert.equal(fx.field(modal.contentEl, "relation_status").value, "duplicate", "겹치는 문서가 있으면 중복이 추천된다");
});

test("겹치는 문장이 없어도 상대 문서 원문을 열어 판단할 수 있다", async () => {
  const { modal } = await fx.openReview({ item: duplicateItem("plan_compiled_synthetic_dup_2", { withSentences: false }) });
  const button = fx.byAttr(modal.contentEl, "data-overlap-view")[0];
  assert.ok(button, "원문 보기 조작이 있어야 한다");
  const preview = fx.byAttr(modal.contentEl, "data-overlap-body")[0];
  assert.equal(preview.hidden, true, "처음에는 접혀 있어야 한다");
  await button.onclick();
  assert.equal(preview.hidden, false);
  assert.ok(preview.textContent.includes("# 합성 레거시 가이드"), preview.textContent.slice(0, 80));
});

test("중복으로 막힐 때 원시 코드 대신 상대 문서와 실제 조작을 알린다", async () => {
  const { modal } = await fx.openReview({ item: duplicateItem("plan_compiled_synthetic_dup_3") });
  const prepareButton = fx.byAction(modal.contentEl, "prepare-document-review");
  await prepareButton.onclick();
  const text = fx.statusText(modal.contentEl);
  assert.equal(text.includes("unresolved_duplicate"), false, `원시 코드가 노출됐다: ${text}`);
  assert.ok(text.includes(fx.LEGACY_TITLE), `상대 문서를 밝혀야 한다: ${text}`);
  const labels = ["review-later", "reject-document-review"].map((action) => {
    const button = fx.byAction(modal.contentEl, action);
    assert.ok(button, action + " 조작이 결정 바에 있어야 한다");
    return (button.textContent || "").trim();
  });
  assert.deepEqual(labels, ["나중에 보기", "겹쳐서 버리기"], "문구가 부르는 이름과 버튼 이름이 같아야 한다");
  assert.ok(text.includes("나중에 보기") && text.includes("겹쳐서 버리기"), text);
  assert.equal((fx.byAction(modal.contentEl, "apply-document-review").textContent || "").trim(), "기존 문서에 반영", "기존 대상에는 반영이라는 말을 써야 한다");
});

test("버리기는 제안을 닫고 초안을 보존한다", async () => {
  const harness = await fx.openReview({ item: duplicateItem("plan_compiled_synthetic_dup_4") });
  const rejectButton = fx.byAction(harness.modal.contentEl, "reject-document-review");
  await rejectButton.onclick();
  const record = Object.values((await harness.jobStore.getPlanSnapshot(harness.jobId)).canonical_reviews || {})[0];
  assert.equal(record.status, "rejected");
  assert.equal(record.rejection.reason, "user_rejected");
  assert.ok(record.pending_draft, "반려해도 초안은 보존한다");
  const attempts = (harness.jobStore.getJob(harness.jobId).attempts || []).map((row) => row.observation);
  assert.ok(attempts.includes("user_rejected"), JSON.stringify(attempts.slice(-3)));
  assert.equal(harness.modal.closed, true, "버리면 검토가 닫힌다");
});

test("버리기 이름은 겹침 근거와 관계 선택을 함께 본다", async () => {
  const dup = await fx.openReview({ item: duplicateItem("plan_compiled_synthetic_dup_5") });
  const dupReject = () => fx.byAction(dup.modal.contentEl, "reject-document-review");
  assert.equal((dupReject().textContent || "").trim(), "겹쳐서 버리기", "겹침 근거가 있으면 관계와 무관하게 이유가 보여야 한다");
  const dupRelation = fx.field(dup.modal.contentEl, "relation_status");
  dupRelation.value = "resolved";
  await dupRelation.onchange();
  assert.equal((dupReject().textContent || "").trim(), "겹쳐서 버리기", "겹침 근거가 있으면 관계가 달라도 이유가 보여야 한다");
  const plain = await fx.openReview({ item: fx.makeItem({ reviewId: "plan_compiled_synthetic_plain_5" }) });
  const plainReject = () => fx.byAction(plain.modal.contentEl, "reject-document-review");
  assert.equal((plainReject().textContent || "").trim(), "제안 버리기");
  const plainRelation = fx.field(plain.modal.contentEl, "relation_status");
  plainRelation.value = "duplicate";
  await plainRelation.onchange();
  assert.equal((plainReject().textContent || "").trim(), "겹쳐서 버리기");
  plainRelation.value = "resolved";
  await plainRelation.onchange();
  assert.equal((plainReject().textContent || "").trim(), "제안 버리기");
});

test("새 문서 대상에는 저장이라는 말을 쓴다", async () => {
  const { modal } = await fx.openReview({ item: duplicateItem("plan_compiled_synthetic_dup_6") });
  const apply = () => fx.byAction(modal.contentEl, "apply-document-review");
  assert.equal((apply().textContent || "").trim(), "기존 문서에 반영");
  const newMode = fx.byAttr(modal.contentEl, "data-storage-mode").find((node) => node.attr["data-storage-mode"] === "new");
  assert.ok(newMode, "새 문서 모드가 있어야 한다");
  newMode.checked = true;
  await newMode.onchange();
  assert.equal((fx.byAction(modal.contentEl, "apply-document-review").textContent || "").trim(), "새 문서로 저장");
});

test("그만 보기는 자동 넘김을 끄고 닫는다", async () => {
  let stopped = 0;
  const harness = await fx.openReview({ item: duplicateItem("plan_compiled_synthetic_stop_1"),
    onStopAutoAdvance: () => { stopped += 1; } });
  const stop = fx.byAction(harness.modal.contentEl, "stop-auto-advance");
  assert.ok(stop, "그만 보기가 있어야 한다");
  assert.equal((stop.textContent || "").trim(), "그만 보기");
  await stop.onclick();
  assert.equal(stopped, 1, "종료 콜백이 한 번 불려야 한다");
  assert.equal(harness.modal.closed, true, "닫혀야 한다");
  const plain = await fx.openReview({ item: duplicateItem("plan_compiled_synthetic_stop_2") });
  assert.equal(fx.byAction(plain.modal.contentEl, "stop-auto-advance"), null, "콜백이 없으면 버튼도 없다");
});

test("이미 반영된 검토는 버리기를 막고 닫기를 안내한다", async () => {
  const { buildPages, runHub } = require("./knowledge_hub_integration_harness.js");
  const disk = new Map();
  const storage = {
    async exists(key) { return disk.has(key); },
    async read(key) { return disk.get(key); },
    async writeAtomic(key, value) { disk.set(key, value); },
    async quarantine() { throw new Error("unexpected corrupt job"); },
  };
  const jobStore = jobs.createBatchJobStore({ storage });
  await jobStore.load();
  const job = await jobStore.createJob({ request_key: fx.hash.sha256("closed-reject-fixture"),
    sources: [{ source_id: fx.SOURCE_ID, revision_hash: fx.SOURCE_REVISION }] });
  const reviewId = "plan_compiled_closed_reject";
  const item = { review_id: reviewId, title: "마감 픽스처 검토", plan_kind: "compiled_document", plan_page_id: "page_closed_fixture",
    document_body: "# 마감 픽스처\n", grounded_claims: [], related_knowledge: [],
    proposed_target: { path: fx.LEGACY_PATH, revision: fx.LEGACY_REVISION } };
  await jobStore.savePlanSnapshot({ job_id: job.job_id, source_id: fx.SOURCE_ID, source_revision: fx.SOURCE_REVISION,
    inventory_hash: fx.hash.sha256("closed inventory"), plan_hash: fx.PLAN_HASH, plan_revision: 1, status: "compiled",
    plan: { plan_version: "fixture_document_v1", pages: [] },
    canonical_reviews: { [fx.hash.sha256(reviewId)]: { item, status: "resolved" } } });
  const runtime = await runHub({ pages: buildPages(), extraFiles: { [fx.LEGACY_PATH]: fx.LEGACY_BYTES },
    llmWikiControllerOptions: { batchJobStore: jobStore } });
  const hub = runtime.window.KnowledgeExplorerHub;
  await hub.dispatchLlmWikiAction({ action: "scan_migration" });
  const decision = hub.llmWikiLifecycleSnapshot().migration.decisions.find((row) => row.path === fx.LEGACY_PATH);
  assert.ok(decision, "레거시 문서가 decisions에 있어야 한다");
  const opened = await hub.dispatchLlmWikiAction({ action: "review_migration", decision_id: decision.decision_id });
  assert.equal(opened.ok, true, JSON.stringify(opened));
  const modal = runtime.openedModals.at(-1);
  assert.ok(modal, "검토 모달이 열려야 한다");
  await modal.onOpen();
  const rejectButton = fx.byAction(modal.contentEl, "reject-document-review");
  assert.ok(rejectButton, "버리기 조작이 있어야 한다");
  await rejectButton.onclick();
  const joined = fx.statusText(modal.contentEl);
  assert.ok(joined.includes("이미 반영된 내용"), `반영済み를 밝혀야 한다: ${joined}`);
  assert.ok(!joined.includes("review_already_closed"), `원시 코드가 노출되면 안 된다: ${joined}`);
  assert.deepEqual(runtime.app.vault.touched, [], "막힌 버리기는 볼트에 쓰면 안 된다");
  const record = Object.values((await jobStore.getPlanSnapshot(job.job_id)).canonical_reviews || {})[0];
  assert.equal(record.status, "resolved", "기록은 그대로 resolved여야 한다");
});
