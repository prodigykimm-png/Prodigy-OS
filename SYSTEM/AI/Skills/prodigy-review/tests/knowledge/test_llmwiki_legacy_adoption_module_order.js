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

test("reader가 검토 모듈보다 늦게 등록돼도 최신 신뢰 목록을 읽는다", async () => {
  const saved = { review: globalThis.LLMWikiDocumentCanonicalReview, reader: globalThis.LLMWikiResurfacingReadAdapter };
  try {
    delete globalThis.LLMWikiResurfacingReadAdapter;
    delete globalThis.LLMWikiDocumentCanonicalReview;
    (new Function(fs.readFileSync(path.join(fx.V, "llmwiki-document-canonical-review.js"), "utf8")))();
    const review = globalThis.LLMWikiDocumentCanonicalReview;
    assert.ok(review, "검토 모듈이 전역으로 등록되어야 한다");
    assert.equal(globalThis.LLMWikiResurfacingReadAdapter, undefined, "이 시나리오에서는 reader가 아직 없다");

    const expected = [{ path: "ZETA/PERMANENT/late-reader.md" }];
    globalThis.LLMWikiResurfacingReadAdapter = Object.freeze({
      create: () => ({ read: async () => ({ ok: true, rows: expected }) }),
    });
    const state = fx.memoryVault();

    const rows = await review.create({ app: state.app }).targets();

    assert.deepEqual(rows, expected);
  } finally {
    if (saved.review === undefined) delete globalThis.LLMWikiDocumentCanonicalReview; else globalThis.LLMWikiDocumentCanonicalReview = saved.review;
    if (saved.reader === undefined) delete globalThis.LLMWikiResurfacingReadAdapter; else globalThis.LLMWikiResurfacingReadAdapter = saved.reader;
  }
});

test("canonical packet이 검토 모듈보다 늦게 등록돼도 prepare가 최신 packet을 사용한다", async () => {
  const saved = {
    review: globalThis.LLMWikiDocumentCanonicalReview,
    packet: globalThis.LLMWikiCanonicalPacket,
    operation: globalThis.LLMWikiOperationContract,
  };
  try {
    delete globalThis.LLMWikiCanonicalPacket;
    delete globalThis.LLMWikiOperationContract;
    delete globalThis.LLMWikiDocumentCanonicalReview;
    (new Function(fs.readFileSync(path.join(fx.V, "llmwiki-document-canonical-review.js"), "utf8")))();
    const review = globalThis.LLMWikiDocumentCanonicalReview;
    assert.ok(review, "검토 모듈이 전역으로 등록되어야 한다");
    assert.equal(globalThis.LLMWikiCanonicalPacket, undefined, "이 시나리오에서는 packet이 아직 없다");

    globalThis.LLMWikiOperationContract = require(path.join(fx.V, "llmwiki-operation-contract.js"));
    globalThis.LLMWikiCanonicalPacket = Object.freeze({
      assembleCanonicalPacket: async () => ({ ok: false, reason: "stub_packet_reached" }),
    });
    const item = fx.makeItem({ reviewId: "plan_compiled_synthetic_packet_order" });
    const harness = await fx.openReview({ item, review });

    const prepared = await harness.flow.prepare({
      item,
      fields: fx.REVIEW_FIELDS,
      target_path: fx.LEGACY_PATH,
      target_revision: fx.LEGACY_REVISION,
    });

    assert.equal(prepared.reason, "stub_packet_reached", JSON.stringify(prepared));
  } finally {
    if (saved.review === undefined) delete globalThis.LLMWikiDocumentCanonicalReview; else globalThis.LLMWikiDocumentCanonicalReview = saved.review;
    if (saved.packet === undefined) delete globalThis.LLMWikiCanonicalPacket; else globalThis.LLMWikiCanonicalPacket = saved.packet;
    if (saved.operation === undefined) delete globalThis.LLMWikiOperationContract; else globalThis.LLMWikiOperationContract = saved.operation;
  }
});

test("operation writer는 재로드된 authority 모듈을 호출 시점에 사용한다", () => {
  const names = [
    "LLMWikiOperationWriter",
    "LLMWikiOperationWriterCore",
    "LLMWikiUpdateAuthority",
    "LLMWikiCanonicalV2Authority",
    "LLMWikiLifecycleMigrationAuthority",
  ];
  const saved = Object.fromEntries(names.map((name) => [name, globalThis[name]]));
  const result = (version) => ({ version });
  try {
    globalThis.LLMWikiOperationWriterCore = Object.freeze({
      APPROVAL_VERSION: "approval",
      RECEIPT_VERSION: "receipt",
      COMPENSATION_VERSION: "compensation",
      MAX_CANONICAL_BYTES: 1,
      isUpdateApproval: () => false,
      isCanonicalV2Approval: () => false,
      isLifecycleMigrationApproval: () => false,
      isApprovalConsumed: () => false,
      assertAtomicReplaceRequest: () => true,
      assertRestoreRequest: () => true,
    });
    globalThis.LLMWikiUpdateAuthority = Object.freeze({
      authorizeCanonicalUpdate: () => result("old"),
      commitApprovedUpdate: () => result("old"),
    });
    globalThis.LLMWikiCanonicalV2Authority = Object.freeze({
      authorizeCanonicalV2: () => result("old"),
      commitApprovedCanonicalV2: () => result("old"),
    });
    globalThis.LLMWikiLifecycleMigrationAuthority = Object.freeze({
      authorizeLifecycleMigration: () => result("old"),
      verifyLifecycleMigrationApproval: () => result("old"),
    });
    delete globalThis.LLMWikiOperationWriter;
    (new Function(fs.readFileSync(path.join(fx.V, "llmwiki-operation-writer.js"), "utf8")))();
    const writer = globalThis.LLMWikiOperationWriter;

    globalThis.LLMWikiUpdateAuthority = Object.freeze({
      authorizeCanonicalUpdate: () => result("new"),
      commitApprovedUpdate: () => result("new"),
    });
    globalThis.LLMWikiCanonicalV2Authority = Object.freeze({
      authorizeCanonicalV2: () => result("new"),
      commitApprovedCanonicalV2: () => result("new"),
    });
    globalThis.LLMWikiLifecycleMigrationAuthority = Object.freeze({
      authorizeLifecycleMigration: () => result("new"),
      verifyLifecycleMigrationApproval: () => result("new"),
    });

    for (const method of [
      "authorizeCanonicalUpdate",
      "commitApprovedUpdate",
      "authorizeCanonicalV2",
      "commitApprovedCanonicalV2",
      "authorizeLifecycleMigration",
      "verifyLifecycleMigrationApproval",
    ]) {
      assert.equal(writer[method]().version, "new", method);
    }
  } finally {
    for (const name of names) {
      if (saved[name] === undefined) delete globalThis[name];
      else globalThis[name] = saved[name];
    }
  }
});

test("canonical authority 모듈은 재로드된 packet 검증기를 호출 시점에 사용한다", () => {
  const names = [
    "LLMWikiCanonicalPacket",
    "LLMWikiClaimProvenance",
    "LLMWikiPromotionContract",
    "LLMWikiCompensationService",
    "LLMWikiOperationWriterCore",
    "LLMWikiCanonicalV2Authority",
    "LLMWikiUpdateAuthority",
  ];
  const saved = Object.fromEntries(names.map((name) => [name, globalThis[name]]));
  const reject = (reason) => ({ ok: false, reason });
  try {
    globalThis.LLMWikiOperationWriterCore = Object.freeze({
      plain: (value) => Boolean(value) && typeof value === "object" && !Array.isArray(value),
      proxy: () => false,
      safelyInspectable: () => true,
      reject,
      MAX_CANONICAL_BYTES: 1024,
    });
    globalThis.LLMWikiClaimProvenance = Object.freeze({});
    globalThis.LLMWikiPromotionContract = Object.freeze({});
    globalThis.LLMWikiCompensationService = Object.freeze({});
    globalThis.LLMWikiCanonicalPacket = Object.freeze({
      verifyCanonicalPacket: () => reject("old_packet"),
    });
    delete globalThis.LLMWikiCanonicalV2Authority;
    delete globalThis.LLMWikiUpdateAuthority;
    (new Function(fs.readFileSync(path.join(fx.V, "llmwiki-canonical-v2-authority.js"), "utf8")))();
    (new Function(fs.readFileSync(path.join(fx.V, "llmwiki-update-authority.js"), "utf8")))();
    const canonicalAuthority = globalThis.LLMWikiCanonicalV2Authority;
    const updateAuthority = globalThis.LLMWikiUpdateAuthority;

    globalThis.LLMWikiCanonicalPacket = Object.freeze({
      verifyCanonicalPacket: () => reject("new_packet"),
    });

    const canonical = canonicalAuthority.authorizeCanonicalV2({
      packet: {},
      canonical_id: "knowledge_reload",
      claim_set: {},
      promotion_input: {},
      promotion_receipt: {},
    });
    const update = updateAuthority.authorizeCanonicalUpdate({
      packet: {},
      canonical_id: "knowledge_reload",
      evidence: {},
      compensation_plan: {},
    });

    assert.equal(canonical.reason, "new_packet");
    assert.equal(update.reason, "new_packet");
  } finally {
    for (const name of names) {
      if (saved[name] === undefined) delete globalThis[name];
      else globalThis[name] = saved[name];
    }
  }
});

test("review apply는 검토 모듈보다 늦게 등록된 writer를 사용한다", async () => {
  const saved = { review: globalThis.LLMWikiDocumentCanonicalReview, writer: globalThis.LLMWikiOperationWriter };
  try {
    delete globalThis.LLMWikiOperationWriter;
    delete globalThis.LLMWikiDocumentCanonicalReview;
    (new Function(fs.readFileSync(path.join(fx.V, "llmwiki-document-canonical-review.js"), "utf8")))();
    const review = globalThis.LLMWikiDocumentCanonicalReview;
    assert.ok(review, "검토 모듈이 전역으로 등록되어야 한다");
    assert.equal(globalThis.LLMWikiOperationWriter, undefined, "이 시나리오에서는 writer가 아직 없다");

    globalThis.LLMWikiOperationWriter = Object.freeze({
      authorizeCanonicalV2: () => ({ ok: false, reason: "stub_writer_reached" }),
    });
    const item = fx.makeItem({ reviewId: "plan_compiled_synthetic_writer_order" });
    const harness = await fx.openReview({ item, review });
    const prepared = await harness.flow.prepare({
      item,
      fields: fx.REVIEW_FIELDS,
      target_path: fx.LEGACY_PATH,
      target_revision: fx.LEGACY_REVISION,
    });
    assert.equal(prepared.ok, true, JSON.stringify(prepared));

    const applied = await harness.flow.apply(prepared.value, {
      approved: true,
      claims_accepted: true,
      packet_hash: prepared.value.packet_hash,
    });

    assert.equal(applied.reason, "stub_writer_reached", JSON.stringify(applied));
  } finally {
    if (saved.review === undefined) delete globalThis.LLMWikiDocumentCanonicalReview; else globalThis.LLMWikiDocumentCanonicalReview = saved.review;
    if (saved.writer === undefined) delete globalThis.LLMWikiOperationWriter; else globalThis.LLMWikiOperationWriter = saved.writer;
  }
});
