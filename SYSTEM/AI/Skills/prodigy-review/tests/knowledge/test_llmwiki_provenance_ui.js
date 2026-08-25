"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const { test } = require("node:test");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "../../../../../..");
const commands = require(path.join(ROOT, "SYSTEM/Views/knowledge-command-controller.js"));
const promotion = require(path.join(ROOT, "SYSTEM/Views/llmwiki-promotion-contract.js"));
const provenance = require(path.join(ROOT, "SYSTEM/Views/llmwiki-claim-provenance.js"));

function stable(value) {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (!value || typeof value !== "object") return JSON.stringify(value);
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stable(value[key])}`).join(",")}}`;
}
function sha(value) { return crypto.createHash("sha256").update(stable(value), "utf8").digest("hex"); }
function shaText(value) { return crypto.createHash("sha256").update(value, "utf8").digest("hex"); }

const sourceText = "source evidence";
const createdClaimSet = provenance.createClaimSet({
  source_snapshots: [{ source_id: "source_001", source_revision: "a".repeat(64), extractor_revision: "b".repeat(64), source_content_hash: shaText(sourceText), source_text: sourceText, provider_window: { start: 0, end: sourceText.length }, source_kind: "immutable_source" }],
  claims: [{ origin: "source_extract", text: sourceText, citations: [{ source_id: "source_001", provider_span: { start: 0, end: sourceText.length, span_digest: shaText(sourceText) } }] }],
});
assert.equal(createdClaimSet.ok, true);
const accepted = provenance.transitionClaimSet(createdClaimSet.value, { claim_set_hash: createdClaimSet.value.claim_set_hash, claim_ids: [createdClaimSet.value.claims[0].claim_id], status: "accepted", authorized_by: "reviewer_001", authorized_at: "2026-08-25T00:00:00.000Z" });
assert.equal(accepted.ok, true);
const acceptedClaimSet = accepted.value;

function canonicalReviewFixture(reviewId = "canonical_001") {
  const sourceBytes = "source evidence";
  const promotionInput = {
    knowledge_kind: "claim", classification: "epistemic", title: "Bound claim", statement: sourceBytes,
    evidence: [{ evidence_id: "evidence-claim-001", source_ref: "INBOX/source.md#claim", strength: "sufficient" }],
    claims: [{ claim_id: "claim-claim-001", statement: sourceBytes, evidence_refs: ["evidence-claim-001"], origin: "source_extract", review_status: "accepted" }],
    relation_status: "resolved", approval_status: "approved", claim_scope: "The accepted source span.",
    claim_set_hash: acceptedClaimSet.claim_set_hash,
  };
  const promotionReceipt = promotion.evaluatePromotion(promotionInput);
  const review = {
    review_id: reviewId, review_revision: "review-r1", destination: "canonical_knowledge", review_state: "pending",
    operation: "create", source_revision: shaText(sourceBytes), source_bytes: sourceBytes,
    claim_set_hash: acceptedClaimSet.claim_set_hash,
  };
  const canonicalApproval = promotion.createCanonicalApprovalPacket({
    ...review, claim_set: acceptedClaimSet, promotion_input: promotionInput, promotion_receipt: promotionReceipt,
  });
  return { ...review, canonical_approval: canonicalApproval, promotionInput, promotionReceipt };
}

test("Given forged promotion authority When canonical approval executes Then no handler is called", async () => {
  const calls = [];
  const command = commands.createKnowledgeCommandController({ onApproveCanonical: async (payload) => { calls.push(payload); return { ok: true }; } });
  const item = canonicalReviewFixture();
  const forgedReceipts = [
    { canonical_write_eligible: true },
    { canonical_write_eligible: true, input_binding: "caller" },
  ];

  for (const promotionReceipt of forgedReceipts) {
    const canonicalApproval = {
      review_id: item.review_id, review_revision: item.review_revision, operation: item.operation,
      source_revision: item.source_revision, source_bytes: item.source_bytes,
      claim_set: acceptedClaimSet, claim_set_hash: acceptedClaimSet.claim_set_hash,
      promotion_receipt: promotionReceipt, promotion_receipt_hash: sha(promotionReceipt),
    };
    const result = await command.execute({ type: "approve_canonical", item: { ...item, canonical_approval: canonicalApproval } });
    assert.equal(result.ok, false);
  }
  const crossClaimInput = { ...item.promotionInput, claim_set_hash: "f".repeat(64) };
  const crossClaimReceipt = promotion.evaluatePromotion(crossClaimInput);
  const crossClaimPacket = {
    ...item.canonical_approval, claim_set_hash: acceptedClaimSet.claim_set_hash,
    promotion_input: crossClaimInput, promotion_receipt: crossClaimReceipt, promotion_receipt_hash: sha(crossClaimReceipt),
  };
  assert.equal((await command.execute({ type: "approve_canonical", item: { ...item, canonical_approval: crossClaimPacket } })).ok, false);
  const jsonClonedItem = JSON.parse(JSON.stringify(item));
  assert.equal((await command.execute({ type: "approve_canonical", item: jsonClonedItem })).ok, false);
  assert.equal(calls.length, 0);
});

test("Given exact branded promotion authority When canonical approval executes Then handler is called once and replay stays closed", async () => {
  const calls = [];
  const command = commands.createKnowledgeCommandController({ onApproveCanonical: async (payload) => { calls.push(payload); return { ok: true }; } });
  const item = canonicalReviewFixture();

  const first = await command.execute({ type: "approve_canonical", item });
  const replay = await command.execute({ type: "approve_canonical", item });

  assert.equal(first.ok, true);
  assert.deepEqual(replay, { ok: false, reason: "replayed_command", writer_count: 0, provider_count: 0 });
  assert.equal(calls.length, 1);
  assert.equal(calls[0], item.canonical_approval);
});

test("Given cross-ClaimSet or stale branded authority When canonical approval executes Then no handler is called", async () => {
  let calls = 0;
  const command = commands.createKnowledgeCommandController({ onApproveCanonical: async () => { calls += 1; return { ok: true }; } });
  const item = canonicalReviewFixture("canonical_exact_002");
  const staleCases = [
    { ...item, source_bytes: `${item.source_bytes} changed` },
    { ...item, source_revision: "e".repeat(64) },
    { ...item, review_revision: "review-r2" },
    { ...item, operation: "update" },
    { ...item, claim_set_hash: "f".repeat(64) },
  ];

  for (const stale of staleCases) {
    const result = await command.execute({ type: "approve_canonical", item: stale });
    assert.equal(result.ok, false);
  }
  assert.equal(calls, 0);
});

test("stale PARA handoff cannot be replayed without a new review revision", async () => {
  let attempts = 0;
  const command = commands.createKnowledgeCommandController({ onApproveObject: async () => { attempts += 1; return { ok: false, reason: "before_mismatch" }; } });
  const item = { review_id: "object_stale_001", destination: "para_object", review_state: "pending", object_handoff: { handoff_id: "handoff_stale_001", target_path: "PARA/PROJECTS/alpha.md", before_bytes: "one\n", after_bytes: "one\ntwo\n", target_revision: "r1" } };
  const first = await command.execute({ type: "approve_object", item });
  const replay = await command.execute({ type: "approve_object", item });
  assert.equal(first.reason, "before_mismatch");
  assert.deepEqual(replay, { ok: false, reason: "replayed_command", writer_count: 0, provider_count: 0 });
  assert.equal(attempts, 1);
});

test("retry is limited to explicit stale or recovery review states", async () => {
  let retries = 0;
  const command = commands.createKnowledgeCommandController({ onRetryReview: async () => { retries += 1; return { ok: true }; } });
  assert.deepEqual(await command.execute({ type: "retry_review", item: { review_id: "pending_001", destination: "none", review_state: "pending" } }), { ok: false, reason: "retry_state_required", writer_count: 0, provider_count: 0 });
  assert.equal((await command.execute({ type: "retry_review", item: { review_id: "stale_001", destination: "none", review_state: "stale", review_revision: "r1" } })).ok, true);
  assert.equal(retries, 1);
});

test("cache completion and PARA approval expose exact local scope without provider authority", async () => {
  const calls = { cache: 0, object: [] };
  const command = commands.createKnowledgeCommandController({
    onCompleteFromCache: async () => { calls.cache += 1; return { ok: true, provider_count: 0 }; },
    onApproveObject: async (payload) => { calls.object.push(payload); return { ok: true }; },
  });
  const cached = await command.execute({ type: "complete_from_cache", item: { review_id: "queue_001", destination: "none", review_state: "pending", analysis_state: "cache_complete" } });
  assert.equal(cached.ok, true);
  const object = await command.execute({ type: "approve_object", item: { review_id: "object_001", destination: "para_object", review_state: "pending", object_handoff: { handoff_id: "handoff_001", target_path: "PARA/PROJECTS/alpha.md", before_bytes: "one\n", after_bytes: "one\ntwo\n", target_revision: "r1" } } });
  assert.equal(object.ok, true);
  assert.equal(calls.cache, 1);
  assert.deepEqual(calls.object[0].target, { path: "PARA/PROJECTS/alpha.md", revision: "r1", before_diff: [{ kind: "add", line: "two" }] });
});
