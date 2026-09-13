"use strict";
// 반려는 종결이다: 대상을 예약하지 않고, 의도한 검토만 닫으며, 이미 종결된 검토는 재기록하지 않는다.
const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const fx = require("./fixtures/llmwiki_review_fixtures.js");

const TARGET = "ZETA/PERMANENT/합성 대상.md";

async function store() {
  const disk = new Map();
  const storage = { exists: async (k) => disk.has(k), read: async (k) => disk.get(k), writeAtomic: async (k, v) => disk.set(k, v), quarantine: async () => { throw new Error("unexpected corrupt job"); } };
  const jobs = require(path.join(fx.V, "llmwiki-batch-job-store.js"));
  const instance = jobs.createBatchJobStore({ storage });
  await instance.load();
  return { instance, storage, jobs };
}

async function planWithReview(instance, { key, reviewId, status = "review_ready", title = "합성 검토" }) {
  const job = await instance.createJob({ request_key: fx.hash.sha256("job-" + reviewId), sources: [{ source_id: fx.SOURCE_ID, revision_hash: fx.SOURCE_REVISION }] });
  await instance.savePlanSnapshot({ job_id: job.job_id, source_id: fx.SOURCE_ID, source_revision: fx.SOURCE_REVISION,
    inventory_hash: fx.hash.sha256("inv"), plan_hash: fx.hash.sha256("plan-" + reviewId), plan_revision: 1, status: "compiled",
    plan: { plan_version: "synthetic_fixture_v1", pages: [] } });
  const item = { review_id: reviewId, title, plan_kind: "compiled_document", grounded_claims: [], document_body: "# " + title + "\n", proposed_target: { path: TARGET, revision: fx.LEGACY_REVISION } };
  const draft = { fields: { knowledge_kind: "claim", target_path: TARGET }, touched: { knowledge_kind: true }, cleared: {},
    target_path: TARGET, target_revision: fx.LEGACY_REVISION, source_revision: fx.SOURCE_REVISION, plan_hash: fx.hash.sha256("plan-" + reviewId),
    item_hash: fx.hash.sha256(reviewId), sources: [{ source_id: fx.SOURCE_ID, source_path: fx.SOURCE_PATH, content_hash: fx.SOURCE_REVISION }], edit_revision: 1 };
  await instance.saveCanonicalReviewDraft({ job_id: job.job_id, review_key: key, item, draft });
  if (status === "rejected") await instance.rejectCanonicalReview({ job_id: job.job_id, review_key: key, review_id: reviewId });
  return { jobId: job.job_id, item };
}

async function nextPlan(instance, suffix) {
  const job = await instance.createJob({ request_key: fx.hash.sha256("next-job-" + suffix), sources: [{ source_id: fx.SOURCE_ID, revision_hash: fx.SOURCE_REVISION }] });
  return { job_id: job.job_id, source_id: fx.SOURCE_ID, source_revision: fx.SOURCE_REVISION, inventory_hash: fx.hash.sha256("inv-next-" + suffix),
    plan_hash: fx.hash.sha256("plan-next-" + suffix), plan_revision: 1, status: "compiled", plan: { plan_version: "synthetic_fixture_v1", pages: [] },
    canonical_reviews: { [fx.hash.sha256("review-next-" + suffix)]: { item: { review_id: "review_next_" + suffix, title: "다음 제안" }, status: "review_ready", packet: { target_path: TARGET } } } };
}

test("반려된 검토는 대상을 예약하지 않아 다음 제안이 충돌하지 않는다", async () => {
  const { instance } = await store();
  await planWithReview(instance, { key: fx.hash.sha256("review-rejected"), reviewId: "review_rejected_fixture", status: "rejected" });
  const saved = await instance.savePlanSnapshot(await nextPlan(instance, "a"));
  assert.ok(saved.job_id, "반려된 검토는 대상 예약으로 남지 않아야 한다");
});

test("반려되지 않은 검토는 여전히 대상을 예약한다(대조군)", async () => {
  const { instance } = await store();
  await planWithReview(instance, { key: fx.hash.sha256("review-live"), reviewId: "review_live_fixture", status: "review_ready" });
  const planB = await nextPlan(instance, "b"); await assert.rejects(() => instance.savePlanSnapshot(planB), (error) => error.message === "pending_target_conflict");
});

test("종결된 검토는 어떤 상태로도 전이되지 않는다(세탁 차단)", async () => {
  const { instance } = await store();
  const key = fx.hash.sha256("review-cas");
  const { jobId, item } = await planWithReview(instance, { key, reviewId: "review_cas_fixture" });
  await instance.rejectCanonicalReview({ job_id: jobId, review_key: key, review_id: item.review_id });
  const base = await instance.getPlanSnapshot(jobId);
  const withStatus = (status) => ({ ...base, plan_revision: base.plan_revision + 1, plan_identity: undefined,
    canonical_reviews: { ...base.canonical_reviews, [key]: { ...base.canonical_reviews[key], status } } });
  for (const status of ["review_ready", "running", "blocked", "resolved", "outcome_unknown"]) {
    await assert.rejects(() => instance.savePlanSnapshot(withStatus(status)), (error) => error.message === "invalid_review_transition", status + " 전이가 허용됐다");
  }
});

test("허용되지 않는 전이는 저장 큐가 거부한다(전이표)", async () => {
  const { instance } = await store();
  const key = fx.hash.sha256("review-table");
  const { jobId } = await planWithReview(instance, { key, reviewId: "review_table_fixture" });
  const base = await instance.getPlanSnapshot(jobId);
  const withStatus = (status) => ({ ...base, plan_revision: base.plan_revision + 1, plan_identity: undefined,
    canonical_reviews: { ...base.canonical_reviews, [key]: { ...base.canonical_reviews[key], status } } });
  // 쓰기 없이 resolved로 건너뛸 수 없다.
  await assert.rejects(() => instance.savePlanSnapshot(withStatus("resolved")), (error) => error.message === "invalid_review_transition");
  // resolved에서 다시 running으로 되돌릴 수 없다(재검증은 review_ready를 거친다).
  await instance.savePlanSnapshot(withStatus("running"));
  const running = await instance.getPlanSnapshot(jobId);
  const resolved = await instance.savePlanSnapshot({ ...running, plan_revision: running.plan_revision + 1, plan_identity: undefined,
    canonical_reviews: { ...running.canonical_reviews, [key]: { ...running.canonical_reviews[key], status: "resolved" } } });
  assert.equal(resolved.canonical_reviews[key].status, "resolved");
  await assert.rejects(() => instance.savePlanSnapshot({ ...resolved, plan_revision: resolved.plan_revision + 1, plan_identity: undefined,
    canonical_reviews: { ...resolved.canonical_reviews, [key]: { ...resolved.canonical_reviews[key], status: "running" } } }), (error) => error.message === "invalid_review_transition");
});

test("쓰기 중인 검토는 정상적으로 resolved로 마감되고 임차가 해제된다", async () => {
  const { instance } = await store();
  const key = fx.hash.sha256("review-readback");
  const { jobId, item } = await planWithReview(instance, { key, reviewId: "review_readback_fixture" });
  const authority = await instance.beginCanonicalWrite({ job_id: jobId, review_key: key, review_id: item.review_id });
  const base = await instance.getPlanSnapshot(jobId);
  const resolved = await instance.savePlanSnapshot({ ...base, plan_revision: base.plan_revision + 1, plan_identity: undefined,
    canonical_reviews: { ...base.canonical_reviews, [key]: { ...base.canonical_reviews[key], status: "resolved" } } });
  assert.equal(resolved.canonical_reviews[key].status, "resolved");
  assert.equal(resolved.canonical_reviews[key].write_lease.lease_id, authority.write_lease.lease_id, "임차는 스토어 소유 값 그대로 유지된다");
  const released = await instance.releaseCanonicalWrite({ job_id: jobId, review_key: key, lease_id: authority.write_lease.lease_id });
  assert.ok(released, "소유자는 해제할 수 있다");
  assert.equal((await instance.getPlanSnapshot(jobId)).canonical_reviews[key].write_lease, undefined);
});

test("적용 완료(resolved) 검토는 재검증을 위해 다시 준비될 수 있다", async () => {
  const { instance } = await store();
  const key = fx.hash.sha256("review-resolved");
  const { jobId, item } = await planWithReview(instance, { key, reviewId: "review_resolved_fixture" });
  const authority = await instance.beginCanonicalWrite({ job_id: jobId, review_key: key, review_id: item.review_id });
  await instance.releaseCanonicalWrite({ job_id: jobId, review_key: key, lease_id: authority.write_lease.lease_id });
  const base = await instance.getPlanSnapshot(jobId);
  const closed = await instance.savePlanSnapshot({ ...base, plan_revision: base.plan_revision + 1, plan_identity: undefined,
    canonical_reviews: { ...base.canonical_reviews, [key]: { ...base.canonical_reviews[key], status: "resolved" } } });
  const again = await instance.savePlanSnapshot({ ...closed, plan_revision: closed.plan_revision + 1, plan_identity: undefined,
    canonical_reviews: { ...closed.canonical_reviews, [key]: { ...closed.canonical_reviews[key], status: "review_ready" } } });
  assert.equal(again.canonical_reviews[key].status, "review_ready", "resolved는 재검증 경로를 위해 다시 열 수 있다");
});

test("반려는 의도한 검토만 닫고 이미 종결된 검토는 재기록하지 않는다", async () => {
  const { instance } = await store();
  const key = fx.hash.sha256("review-identity");
  const { jobId, item } = await planWithReview(instance, { key, reviewId: "review_identity_fixture" });
  await assert.rejects(() => instance.rejectCanonicalReview({ job_id: jobId, review_key: key, review_id: "different_review_id" }), (error) => error.message === "review_identity_mismatch");
  await assert.rejects(() => instance.rejectCanonicalReview({ job_id: jobId, review_key: fx.hash.sha256("review-unknown"), review_id: item.review_id }), (error) => error.message === "unknown_review");
  const first = await instance.rejectCanonicalReview({ job_id: jobId, review_key: key, review_id: item.review_id });
  const again = await instance.rejectCanonicalReview({ job_id: jobId, review_key: key, review_id: item.review_id });
  assert.equal(again.status, "rejected");
  assert.equal(again.rejection.rejected_at, first.rejection.rejected_at);
});

test("종결 기록은 스냅샷에서 빠져도(빈 맵 포함) 사라지지 않는다", async () => {
  const { instance } = await store();
  const key = fx.hash.sha256("review-omission");
  const { jobId, item } = await planWithReview(instance, { key, reviewId: "review_omission_fixture" });
  await instance.rejectCanonicalReview({ job_id: jobId, review_key: key, review_id: item.review_id });
  const base = await instance.getPlanSnapshot(jobId);
  const emptied = await instance.savePlanSnapshot({ ...base, plan_revision: base.plan_revision + 1, plan_identity: undefined, canonical_reviews: {} });
  assert.equal(emptied.canonical_reviews[key].status, "rejected", "빈 맵으로도 종결 기록은 지워지면 안 된다");
  await assert.rejects(() => instance.savePlanSnapshot({ ...emptied, plan_revision: emptied.plan_revision + 1, plan_identity: undefined,
    canonical_reviews: { ...emptied.canonical_reviews, [key]: { ...emptied.canonical_reviews[key], status: "running" } } }), (error) => error.message === "invalid_review_transition");
});

test("임차는 배타적이고, 스냅샷으로 위조·삭제할 수 없다", async () => {
  const { instance } = await store();
  const key = fx.hash.sha256("review-lease");
  const { jobId, item } = await planWithReview(instance, { key, reviewId: "review_lease_fixture" });
  const authority = await instance.beginCanonicalWrite({ job_id: jobId, review_key: key, review_id: item.review_id });
  assert.ok(authority.write_lease.lease_id && authority.write_lease.generation, "임차에는 식별자와 세대가 있다");
  await assert.rejects(() => instance.beginCanonicalWrite({ job_id: jobId, review_key: key, review_id: item.review_id }), (error) => error.message === "review_write_in_progress");
  await assert.rejects(() => instance.rejectCanonicalReview({ job_id: jobId, review_key: key, review_id: item.review_id }), (error) => error.message === "review_write_in_progress");
  const base = await instance.getPlanSnapshot(jobId);
  const forged = await instance.savePlanSnapshot({ ...base, plan_revision: base.plan_revision + 1, plan_identity: undefined,
    canonical_reviews: { ...base.canonical_reviews, [key]: { ...base.canonical_reviews[key], write_lease: { lease_id: fx.hash.sha256("forged"), granted_at: new Date().toISOString() } } } });
  assert.equal(forged.canonical_reviews[key].write_lease.lease_id, authority.write_lease.lease_id, "스냅샷이 임차 값을 바꾸면 안 된다");
  const stripped = await instance.savePlanSnapshot({ ...forged, plan_revision: forged.plan_revision + 1, plan_identity: undefined,
    canonical_reviews: { ...forged.canonical_reviews, [key]: (() => { const row = { ...forged.canonical_reviews[key] }; delete row.write_lease; return row; })() } });
  assert.equal(stripped.canonical_reviews[key].write_lease.lease_id, authority.write_lease.lease_id, "스냅샷이 임차를 지울 수도 없다");
  await assert.rejects(() => instance.releaseCanonicalWrite({ job_id: jobId, review_key: key }), (error) => error.message === "invalid_write_authority");
  const foreign = await instance.releaseCanonicalWrite({ job_id: jobId, review_key: key, lease_id: fx.hash.sha256("other") });
  assert.equal(foreign, null, "다른 식별자로는 해제되지 않는다");
  assert.equal((await instance.getPlanSnapshot(jobId)).canonical_reviews[key].write_lease.lease_id, authority.write_lease.lease_id, "임차는 그대로 남아야 한다");
  const released = await instance.releaseCanonicalWrite({ job_id: jobId, review_key: key, lease_id: authority.write_lease.lease_id });
  assert.ok(released);
  const rejected = await instance.rejectCanonicalReview({ job_id: jobId, review_key: key, review_id: item.review_id });
  assert.equal(rejected.status, "rejected");
  await assert.rejects(() => instance.beginCanonicalWrite({ job_id: jobId, review_key: key, review_id: item.review_id }), (error) => error.message === "review_closed");
});

test("임차 인수는 다른 런타임(재시작)의 중단된 쓰기에만 허용된다", async () => {
  const { instance, storage, jobs } = await store();
  const key = fx.hash.sha256("review-takeover");
  const { jobId, item } = await planWithReview(instance, { key, reviewId: "review_takeover_fixture" });
  const before = await instance.beginCanonicalWrite({ job_id: jobId, review_key: key, review_id: item.review_id });
  // 같은 프로세스의 두 번째 스토어는 같은 세대다 → 살아 있는 writer를 인수할 수 없다.
  const sameProcess = jobs.createBatchJobStore({ storage });
  await sameProcess.load();
  await assert.rejects(() => sameProcess.beginCanonicalWrite({ job_id: jobId, review_key: key, review_id: item.review_id }),
    (error) => error.message === "review_write_in_progress");
  // 실제 재시작(다른 세대)은 중단된 쓰기(running)를 인수할 수 있다.
  const restarted = jobs.createBatchJobStore({ storage, generation: fx.hash.sha256("other-runtime-generation") });
  await restarted.load();
  const taken = await restarted.beginCanonicalWrite({ job_id: jobId, review_key: key, review_id: item.review_id });
  assert.notEqual(taken.write_lease.lease_id, before.write_lease.lease_id, "인수하면 임차 식별자가 바뀐다");
  // 이전 소유자가 자기 인스턴스로 해제를 시도해도 새 임차는 살아 있어야 한다.
  const staleRelease = await instance.releaseCanonicalWrite({ job_id: jobId, review_key: key, lease_id: before.write_lease.lease_id });
  assert.equal(staleRelease, null, "이전 소유자의 해제는 no-op이어야 한다");
  const persisted = JSON.parse(await storage.read(jobs.STATE_FILE));
  assert.equal(persisted.plans[jobId].canonical_reviews[key].write_lease.lease_id, taken.write_lease.lease_id, "이전 소유자의 쓰기가 새 임차를 덮어쓰면 안 된다");
  const done = await restarted.releaseCanonicalWrite({ job_id: jobId, review_key: key, lease_id: taken.write_lease.lease_id });
  assert.ok(done, "새 소유자는 해제할 수 있다");
  const idle = await restarted.getPlanSnapshot(jobId);
  assert.equal(idle.canonical_reviews[key].write_lease, undefined);
  const again = await restarted.beginCanonicalWrite({ job_id: jobId, review_key: key, review_id: item.review_id });
  assert.ok(again.write_lease.lease_id, "임차가 없으면 정상 획득된다");
  // 임차가 있는 비중단 상태(blocked)는 다른 세대라도 인수할 수 없다.
  const blockedBase = await restarted.getPlanSnapshot(jobId);
  await restarted.savePlanSnapshot({ ...blockedBase, plan_revision: blockedBase.plan_revision + 1, plan_identity: undefined,
    canonical_reviews: { ...blockedBase.canonical_reviews, [key]: { ...blockedBase.canonical_reviews[key], status: "blocked" } } });
  const thirdRuntime = jobs.createBatchJobStore({ storage, generation: fx.hash.sha256("third-runtime-generation") });
  await thirdRuntime.load();
  await assert.rejects(() => thirdRuntime.beginCanonicalWrite({ job_id: jobId, review_key: key, review_id: item.review_id }),
    (error) => error.message === "review_write_in_progress");
});
