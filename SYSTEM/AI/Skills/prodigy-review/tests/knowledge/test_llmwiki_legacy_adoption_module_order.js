"use strict";
// 지식 허브는 모듈을 new Function으로 평가하므로 require 폴백이 없다. 의존성은 전역
// 등록 순서로만 해석되고, 검토 모듈이 마이그레이션 flows보다 먼저 로드되면 flows는
// null로 고정된다(실제로 라이브에서 lifecycle_migration_flows_required로 거부됐다).
// 늦게 도착한 flows로도 채택 적용이 그 가드에서 막히지 않는지 확인한다.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const fx = require("./fixtures/llmwiki_review_fixtures.js");

test("flows가 검토 모듈보다 늦게 등록돼도 채택 적용이 flows 부재로 거부되지 않는다", async () => {
  const saved = { review: globalThis.LLMWikiDocumentCanonicalReview, flows: globalThis.LLMWikiLifecycleMigrationFlows };
  try {
    delete globalThis.LLMWikiLifecycleMigrationFlows;
    delete globalThis.LLMWikiDocumentCanonicalReview;
    (new Function(fs.readFileSync(path.join(fx.V, "llmwiki-document-canonical-review.js"), "utf8")))();
    const review = globalThis.LLMWikiDocumentCanonicalReview;
    assert.ok(review, "검토 모듈이 전역으로 등록되어야 한다");
    assert.equal(globalThis.LLMWikiLifecycleMigrationFlows, undefined, "이 시나리오에서는 flows가 아직 없다");
    globalThis.LLMWikiLifecycleMigrationFlows = Object.freeze({
      buildPlan: async () => ({ ok: false, reason: "stub_plan_reached" }),
      authorizePlan: () => ({ ok: false, reason: "stub_authorize_reached" }),
      executePlan: async () => ({ ok: false, reason: "stub_execute_reached" }),
    });
    const item = fx.makeItem({ reviewId: "plan_compiled_synthetic_order" });
    const harness = await fx.openReview({ item, review });
    const prepared = await harness.flow.prepare({ item, fields: fx.REVIEW_FIELDS, target_path: fx.LEGACY_PATH, target_revision: fx.LEGACY_REVISION });
    assert.equal(prepared.ok, true, `prepare: ${prepared.reason || ""}`);
    const applied = await harness.flow.apply(prepared.value, { approved: true, claims_accepted: true, packet_hash: prepared.value.packet_hash });
    assert.notEqual(applied.reason, "lifecycle_migration_flows_required", "늦게 도착한 flows를 적용 시점에 해석해야 한다");
    assert.equal(applied.reason, "stub_plan_reached", JSON.stringify(applied));
  } finally {
    if (saved.review === undefined) delete globalThis.LLMWikiDocumentCanonicalReview; else globalThis.LLMWikiDocumentCanonicalReview = saved.review;
    if (saved.flows === undefined) delete globalThis.LLMWikiLifecycleMigrationFlows; else globalThis.LLMWikiLifecycleMigrationFlows = saved.flows;
  }
});
