"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const fx = require("./fixtures/llmwiki_review_fixtures.js");

const REVIEW_PATH = path.join(fx.V, "llmwiki-document-canonical-review.js");
const realObsidian = require(path.join(fx.V, "llmwiki-obsidian-adapter.js"));

test("깨진 기존 claim graph는 예외 대신 typed refusal로 닫힌다", async () => {
  const seed = await fx.openReview({ item: fx.makeItem({ reviewId: "plan_compiled_prior_seed" }), seedLegacy: false });
  const created = await seed.flow.prepare({ item: seed.item, fields: fx.REVIEW_FIELDS, target_path: "" });
  assert.equal(created.ok, true, JSON.stringify(created));

  const targetPath = created.value.target_path;
  const targetBytes = created.value.after;
  const targetRevision = fx.hash.sha256(targetBytes);
  const target = {
    path: targetPath,
    canonical_bytes: targetBytes,
    canonical_revision: targetRevision,
    citations: [{ source_id: fx.SOURCE_ID, locator: `${fx.SOURCE_PATH}#L3` }],
  };
  const authority = {
    path: targetPath,
    revision: targetRevision,
    canonical_v2_authority: {
      claim_set: {
        sources: [{
          source_id: fx.SOURCE_ID,
          source_content_hash: fx.SOURCE_REVISION,
          provider_window: { start: 0, end: fx.SOURCE_BYTES.length },
        }],
        claims: [{
          claim_id: "claim_broken_prior",
          origin: "ai_interpretation",
          text: fx.CLAIM_ONE,
          citation_ids: ["citation_missing"],
          derived_from_claim_ids: [],
        }],
        citations: [],
      },
    },
  };
  const state = fx.memoryVault({ [fx.SOURCE_PATH]: fx.SOURCE_BYTES, [targetPath]: targetBytes });
  const previousReader = globalThis.LLMWikiResurfacingReadAdapter;
  const previousObsidian = globalThis.LLMWikiObsidianAdapter;
  const previousReview = globalThis.LLMWikiDocumentCanonicalReview;

  try {
    globalThis.LLMWikiResurfacingReadAdapter = Object.freeze({
      create: () => ({ read: async () => ({ ok: true, rows: [target] }) }),
    });
    globalThis.LLMWikiObsidianAdapter = Object.freeze({
      ...realObsidian,
      createObsidianAdapter(app) {
        const adapter = realObsidian.createObsidianAdapter(app);
        return { ...adapter, readFinalizedCanonicalAuthorities: async () => [authority] };
      },
      finalizedCanonicalAuthorityData: (value) => value,
    });
    delete require.cache[require.resolve(REVIEW_PATH)];
    const review = require(REVIEW_PATH);
    const item = fx.makeItem({ reviewId: "plan_compiled_prior_broken", targetPath });
    item.proposed_target.revision = targetRevision;

    const result = await review.create({ app: state.app }).prepare({
      item,
      fields: fx.REVIEW_FIELDS,
      target_path: targetPath,
      target_revision: targetRevision,
    });

    assert.equal(result.ok, false, JSON.stringify(result));
    assert.equal(result.reason, "prior_claim_graph_broken", JSON.stringify(result));
    assert.equal(state.writes.length, 0, "깨진 기존 그래프는 어떤 문서도 쓰지 않는다");
  } finally {
    if (previousReader === undefined) delete globalThis.LLMWikiResurfacingReadAdapter;
    else globalThis.LLMWikiResurfacingReadAdapter = previousReader;
    if (previousObsidian === undefined) delete globalThis.LLMWikiObsidianAdapter;
    else globalThis.LLMWikiObsidianAdapter = previousObsidian;
    if (previousReview === undefined) delete globalThis.LLMWikiDocumentCanonicalReview;
    else globalThis.LLMWikiDocumentCanonicalReview = previousReview;
    delete require.cache[require.resolve(REVIEW_PATH)];
  }
});
