"use strict";
// 게이트 리뷰 BLOCKER: 준비된 패킷은 반려 뒤에도 적용 가능했다. 반려는 종결 결정이므로
// 준비된 상태와 무관하게 적용이 거부되어야 하고, 정본에 아무 것도 쓰이면 안 된다.
const test = require("node:test");
const assert = require("node:assert/strict");
const fx = require("./fixtures/llmwiki_review_fixtures.js");

async function preparedLegacyAdoption(reviewId) {
  const item = fx.makeItem({ reviewId });
  const harness = await fx.openReview({ item });
  const prepared = await harness.flow.prepare({ item, fields: fx.REVIEW_FIELDS, target_path: fx.LEGACY_PATH, target_revision: fx.LEGACY_REVISION });
  assert.equal(prepared.ok, true, `prepare: ${prepared.reason || ""}`);
  return { ...harness, prepared };
}

test("반려한 제안은 준비된 패킷으로도 적용되지 않고 정본에 쓰지 않는다", async () => {
  const harness = await preparedLegacyAdoption("plan_compiled_synthetic_adv_1");
  const before = harness.bytes(fx.LEGACY_PATH);
  const rejected = await harness.flow.reject(harness.item);
  assert.equal(rejected.ok, true, JSON.stringify(rejected));
  const applied = await harness.flow.apply(harness.prepared.value, { approved: true, claims_accepted: true, packet_hash: harness.prepared.value.packet_hash });
  assert.equal(applied.ok, false, "반려 뒤에는 적용이 성공하면 안 된다");
  assert.equal(applied.reason, "review_closed", JSON.stringify(applied));
  assert.equal(harness.bytes(fx.LEGACY_PATH), before, "대상 문서가 바뀌면 안 된다");
  assert.deepEqual(harness.writes, [], `정본 쓰기가 발생했다: ${JSON.stringify(harness.writes)}`);
});

test("반려 기록은 재마운트 뒤에도 준비·적용을 막는다", async () => {
  const first = await preparedLegacyAdoption("plan_compiled_synthetic_adv_2");
  await first.flow.reject(first.item);
  const snapshot = await first.jobStore.getPlanSnapshot(first.jobId);
  assert.equal(Object.values(snapshot.canonical_reviews)[0].status, "rejected");
  // 저장소에서 상태를 다시 읽는 진짜 재마운트.
  const remounted = await fx.remount(first);
  const fresh = remounted.flow;
  const revived = await fresh.prepare({ item: first.item, fields: fx.REVIEW_FIELDS, target_path: fx.LEGACY_PATH, target_revision: fx.LEGACY_REVISION });
  assert.equal(revived.ok, false, "반려된 검토는 다시 준비되면 안 된다");
  assert.equal(revived.reason, "review_closed", JSON.stringify(revived));
  assert.equal(revived.review_status, "rejected", JSON.stringify(revived));
  assert.deepEqual(first.writes, [], `정본 쓰기가 발생했다: ${JSON.stringify(first.writes)}`);
});

test("반려가 쓰기 권한 획득 직전에 도착하면 적용이 중단되고 정본에 쓰지 않는다", async () => {
  const harness = await preparedLegacyAdoption("plan_compiled_synthetic_adv_3");
  let attempted = false;
  const hook = {
    ...harness.jobStore,
    beginCanonicalWrite: async (input) => {
      if (!attempted) { attempted = true; await harness.flow.reject(harness.item); }
      return harness.jobStore.beginCanonicalWrite(input);
    },
  };
  const racy = fx.reviewModule.create({ app: harness.app, jobStore: hook, jobId: harness.jobId });
  const prepared = await racy.prepare({ item: harness.item, fields: fx.REVIEW_FIELDS, target_path: fx.LEGACY_PATH, target_revision: fx.LEGACY_REVISION });
  assert.equal(prepared.ok, true, `prepare: ${prepared.reason || ""}`);
  const before = harness.bytes(fx.LEGACY_PATH);
  const applied = await racy.apply(prepared.value, { approved: true, claims_accepted: true, packet_hash: prepared.value.packet_hash });
  assert.equal(applied.ok, false, "반려가 먼저면 적용은 실패해야 한다");
  assert.equal(applied.reason, "review_closed", JSON.stringify(applied));
  assert.equal(attempted, true, "경합 시나리오가 실제로 발생해야 한다");
  assert.equal(harness.bytes(fx.LEGACY_PATH), before, "대상 문서가 바뀌면 안 된다");
  assert.deepEqual(harness.writes, [], `정본 쓰기가 발생했다: ${JSON.stringify(harness.writes)}`);
});

test("쓰기 권한을 쥔 동안에는 반려가 거부된다(양쪽이 동시에 성립하지 않는다)", async () => {
  const harness = await preparedLegacyAdoption("plan_compiled_synthetic_adv_4");
  let rejection = null;
  let sawLease = false;
  const hook = {
    ...harness.jobStore,
    beginCanonicalWrite: async (input) => {
      const record = await harness.jobStore.beginCanonicalWrite(input);
      sawLease = Boolean(record && record.write_lease);
      rejection = await harness.flow.reject(harness.item);
      return record;
    },
  };
  const racy = fx.reviewModule.create({ app: harness.app, jobStore: hook, jobId: harness.jobId });
  const prepared = await racy.prepare({ item: harness.item, fields: fx.REVIEW_FIELDS, target_path: fx.LEGACY_PATH, target_revision: fx.LEGACY_REVISION });
  assert.equal(prepared.ok, true, `prepare: ${prepared.reason || ""}`);
  const applied = await racy.apply(prepared.value, { approved: true, claims_accepted: true, packet_hash: prepared.value.packet_hash });
  assert.equal(sawLease, true, "적용이 쓰기 임차를 얻어야 한다");
  assert.equal(rejection.ok, false, "임차 중에는 반려가 통과하면 안 된다");
  assert.equal(rejection.reason, "review_write_in_progress", JSON.stringify(rejection));
  assert.notEqual(applied.reason, "review_closed", `승인된 쓰기가 반려로 취소되면 안 된다: ${JSON.stringify(applied)}`);
  assert.ok(harness.writes.length >= 1, "승인된 쓰기는 그대로 진행돼야 한다");
  const stored = Object.values((await harness.jobStore.getPlanSnapshot(harness.jobId)).canonical_reviews || {})[0];
  assert.notEqual(stored.status, "rejected", `반려가 이기면 안 된다: ${stored.status}`);
  assert.equal(stored.write_lease, undefined, "쓰기 임차는 해제돼야 한다");
});

test("중단된(outcome_unknown) 검토는 재시작 뒤 복구 경로로 열린다", async () => {
  const harness = await preparedLegacyAdoption("plan_compiled_synthetic_adv_5");
  // 쓰기 도중 중단된 상태를 만든다: 임차 보유 + outcome_unknown.
  await harness.jobStore.beginCanonicalWrite({ job_id: harness.jobId, review_key: fx.hash.sha256(String(harness.item.review_id)), review_id: harness.item.review_id });
  const base = await harness.jobStore.getPlanSnapshot(harness.jobId);
  const key = fx.hash.sha256(String(harness.item.review_id));
  await harness.jobStore.savePlanSnapshot({ ...base, plan_revision: base.plan_revision + 1, plan_identity: undefined,
    canonical_reviews: { ...base.canonical_reviews, [key]: { ...base.canonical_reviews[key], status: "outcome_unknown" } } });
  const stuck = await harness.jobStore.getPlanSnapshot(harness.jobId);
  assert.equal(stuck.canonical_reviews[key].status, "outcome_unknown");
  assert.ok(stuck.canonical_reviews[key].write_lease, "중단된 쓰기는 임차를 남긴다");
  // 복구 경로: 재시작 세대의 흐름이 이 기록을 열 수 있어야 한다(막히면 영구 잠금).
  const restarted = await fx.remount(harness);
  const restored = await restarted.flow.restore(harness.item);
  assert.equal(restored.ok, true, `중단된 검토가 복구 불가로 막혔다: ${JSON.stringify(restored)}`);
  assert.notEqual(restored.status, "invalid_review_state", JSON.stringify(restored));
});
