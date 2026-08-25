"use strict";

const assert = require("node:assert/strict");
const { test } = require("node:test");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "../../../../../..");
const review = require(path.join(ROOT, "SYSTEM/Views/knowledge-explorer-controller.js"));

function item(review_id, destination, extra = {}) {
  return {
    review_id,
    destination,
    review_state: "pending",
    analysis_state: "complete",
    title: review_id,
    ...extra,
  };
}

test("groups lifecycle review items in a stable order with exact pending and all counters", () => {
  const items = [
    item("queue_001", "none", { analysis_state: "queued" }),
    item("literature_001", "literature"),
    item("fleeting_001", "fleeting"),
    item("candidate_001", "knowledge_candidate", { promotion_gaps: [{ gate_id: "claim_support", reason_code: "unsupported_claim" }] }),
    item("canonical_001", "canonical_knowledge", { operation: "create" }),
    item("object_001", "para_object", { object_handoff: { handoff_id: "handoff_001", target_path: "PARA/PROJECTS/alpha.md", before_bytes: "before\n", after_bytes: "before\nafter\n" } }),
    item("hold_001", "none", { review_state: "hold", analysis_state: "blocked" }),
  ];
  const groups = review.buildReviewGroups(items);

  assert.deepEqual(groups.map((group) => group.id), ["queue", "literature", "fleeting", "candidate", "canonical_review", "para_handoff", "holds"]);
  assert.deepEqual(groups.map((group) => group.total), [1, 1, 1, 1, 1, 1, 1]);
  assert.deepEqual(groups.map((group) => group.pending), [1, 1, 1, 1, 1, 1, 0]);
  assert.deepEqual(groups.map((group) => group.visible), [1, 1, 1, 1, 1, 1, 0]);

  const all = review.buildReviewGroups(items, { filter: "all" });
  assert.deepEqual(all.map((group) => group.visible), [1, 1, 1, 1, 1, 1, 1]);
  assert.equal(all.find((group) => group.id === "candidate").items[0].promotion_gaps.length, 1);
});

test("keeps update, merge, noop, stale, and recovery states explicit without granting approval", () => {
  const groups = review.buildReviewGroups([
    item("update_001", "canonical_knowledge", { operation: "update" }),
    item("merge_001", "canonical_knowledge", { operation: "merge" }),
    item("noop_001", "canonical_knowledge", { operation: "noop" }),
    item("stale_001", "canonical_knowledge", { review_state: "stale" }),
    item("recovery_001", "none", { review_state: "recovery" }),
  ], { filter: "all" });
  assert.equal(groups.find((group) => group.id === "canonical_review").total, 3);
  assert.equal(groups.find((group) => group.id === "holds").total, 2);
  assert.deepEqual([review.operationLabel({ operation: "update" }), review.operationLabel({ operation: "merge" }), review.operationLabel({ operation: "noop" }), review.operationLabel({ review_state: "stale" }), review.operationLabel({ review_state: "recovery" })], ["업데이트", "병합", "변경 없음", "오래된 검토", "복구 필요"]);
});

test("rejects malformed and duplicate review identities before counters can drift", () => {
  assert.throws(() => review.buildReviewGroups([item("queue_001", "none"), item("queue_001", "literature")]), /duplicate_review_id/u);
  assert.throws(() => review.buildReviewGroups([{ review_id: "x", destination: "canonical_knowledge", review_state: "pending" }]), /invalid_review_item/u);
});
