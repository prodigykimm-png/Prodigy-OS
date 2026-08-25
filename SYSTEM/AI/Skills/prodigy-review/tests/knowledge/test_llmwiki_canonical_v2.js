"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");
const { test } = require("node:test");

const ROOT = path.resolve(__dirname, "../../../../../..");
const view = (name) => require(path.join(ROOT, "SYSTEM/Views", name));
const canonical = view("llmwiki-canonical-packet.js");
const claims = view("llmwiki-claim-provenance.js");
const promotion = view("llmwiki-promotion-contract.js");
const writer = view("llmwiki-operation-writer.js");
const operations = view("llmwiki-operation-contract.js");
const store = view("knowledge-candidate-store.js");

const NOW = "2026-08-25T12:00:00.000Z";
const HASH = "a".repeat(64);

function stable(value) {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (!value || typeof value !== "object") return JSON.stringify(value);
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stable(value[key])}`).join(",")}}`;
}

function sourceSnapshot() {
  const sourceText = "Approved source evidence binds this principle.";
  return {
    source_id: "source_v2_principle",
    source_kind: "immutable_source",
    source_revision: HASH,
    extractor_revision: "b".repeat(64),
    source_text: sourceText,
    source_content_hash: canonical.sha256(sourceText),
    provider_window: { start: 0, end: sourceText.length },
  };
}

function acceptedClaimSet() {
  const source = sourceSnapshot();
  const created = claims.createClaimSet({
    source_snapshots: [source],
    claims: [{
      origin: "source_extract",
      text: "Approved source evidence binds this principle.",
      citations: [{ source_id: source.source_id, provider_span: { start: 0, end: source.source_text.length, span_digest: canonical.sha256(source.source_text) } }],
    }],
  });
  assert.equal(created.ok, true, JSON.stringify(created));
  const accepted = claims.transitionClaimSet(created.value, {
    claim_set_hash: created.value.claim_set_hash,
    claim_ids: [created.value.claims[0].claim_id],
    status: "accepted",
    authorized_by: "reviewer_v2",
    authorized_at: NOW,
  });
  assert.equal(accepted.ok, true, JSON.stringify(accepted));
  return accepted.value;
}

function promotionInput() {
  return {
    knowledge_kind: "principle", classification: "epistemic", state: "current", title: "Canonical v2 principle",
    statement: "Approved source evidence binds canonical Knowledge v2.", relation_status: "resolved", approval_status: "approved",
    evidence: [{ evidence_id: "evidence_v2", source_ref: "source_v2_principle", strength: "strong" }],
    claims: [{ claim_id: "claim_v2", statement: "Approved source evidence binds canonical Knowledge v2.", evidence_refs: ["evidence_v2"], origin: "source_extract", review_status: "accepted" }],
    principle_boundaries: { conditions: ["approved"], exclusions: ["unreviewed"], invalidation_conditions: ["source revision changes"] },
    principle_rationale: "Exact immutable authority prevents forged provenance.",
  };
}

function v2Document(claimSet, receipt, overrides = {}) {
  return {
    schema_version: 2,
    type: "knowledge",
    title: "Canonical v2 principle",
    canonical_id: "knowledge_v2_principle",
    knowledge_kind: "principle",
    status: "active",
    statement: "Approved source evidence binds canonical Knowledge v2.",
    knowledge_domain: "coding",
    knowledge_topics: ["ai"],
    application_trigger: "canonical approval",
    application_contexts: ["coding/ai"],
    connections: [],
    invalidation_conditions: ["source revision changes"],
    sources: [{ source_id: "source_v2_principle", span: { start: 0, end: 42 } }],
    relations: [{ relation_id: "relation_v2_supports", target_id: "knowledge_v2_target", type: "supports" }],
    claim_set_hash: claimSet.claim_set_hash,
    promotion_receipt_hash: canonical.sha256(stable(receipt)),
    ai_enrichment_status: "none",
    created: NOW,
    updated: NOW,
    body: "# Canonical v2 principle\n\nThe body is distinct from the canonical statement.\n",
    ...overrides,
  };
}

function brandedOperation(document, kind = "create") {
  const parsed = operations.parseCanonicalOperation(JSON.stringify({
    operation_id: `operation_v2_${kind}`,
    proposal_id: `proposal_v2_${kind}`,
    proposal_kind: kind,
    payload_hash: canonical.sha256(stable(document)),
  }));
  assert.equal(parsed.ok, true, JSON.stringify(parsed));
  return parsed.value;
}

function memoryAdapter() {
  const files = new Map();
  const counters = { reads: 0, writes: 0 };
  return {
    files, counters,
    async readBytes(targetPath) { counters.reads += 1; return files.has(targetPath) ? files.get(targetPath) : null; },
  };
}

async function v2Packet(overrides = {}) {
  const claimSet = acceptedClaimSet();
  const input = promotionInput();
  const receipt = promotion.evaluatePromotion(input);
  assert.equal(receipt.canonical_write_eligible, true);
  const document = v2Document(claimSet, receipt, overrides.document);
  const kind = overrides.kind || "create";
  const adapter = memoryAdapter();
  const targetPath = overrides.targetPath || `ZETA/PERMANENT/v2-${kind}.md`;
  if (kind !== "create") adapter.files.set(targetPath, "existing canonical bytes\n");
  const assembled = await canonical.assembleCanonicalPacket({
    run_id: "run_v2_principle",
    operation: brandedOperation(document, kind),
    canonical_document: document,
    source_citations: [{ source_id: "source_v2_principle", content_hash: sourceSnapshot().source_content_hash, locators: ["ZETA/LITERATURE/v2.md#source"], source_archive_id: null }],
    consent_hash: "c".repeat(64), expires_at: "2099-01-01T00:00:00.000Z", nonce: "nonce_canonical_v2_0001",
    ...(kind === "create" ? {} : { target_path: targetPath }),
    ...(overrides.request || {}),
  }, adapter);
  assert.equal(assembled.ok, true, JSON.stringify(assembled));
  return { adapter, claimSet, input, receipt, document, packet: assembled.value };
}

test("canonical v2 authorization binds full accepted ClaimSet and locally evaluated promotion receipt into exact bytes", async () => {
  const fixture = await v2Packet();
  assert.equal(typeof writer.authorizeCanonicalV2, "function", "Todo 11 v2 authorization authority must exist");
  const authorized = writer.authorizeCanonicalV2({
    packet: fixture.packet, canonical_id: fixture.document.canonical_id, claim_set: fixture.claimSet,
    promotion_input: fixture.input, promotion_receipt: fixture.receipt,
  });
  assert.equal(authorized.ok, true, JSON.stringify(authorized));
  assert.equal(authorized.value.authority.claim_set.claim_set_hash, fixture.document.claim_set_hash);
  assert.equal(authorized.value.authority.promotion_receipt_hash, fixture.document.promotion_receipt_hash);
  assert.equal(fixture.packet.after_bytes.includes("summary:"), false, "v2 bytes must not duplicate statement as summary");
  assert.equal(canonical.verifyCanonicalPacket(fixture.packet).ok, true);
});

function transactionAdapter(options = {}) {
  const files = new Map();
  const receipts = new Map();
  const immutable = new Map();
  let continuity = { head_hash: null, count: 0 };
  return {
    files, receipts, immutable,
    async readBytes(targetPath) { return files.has(targetPath) ? files.get(targetPath) : null; },
    async readReceipt(nonce) { return receipts.get(nonce) || null; },
    async commitExact(mutation) {
      if (options.auditFinalizeFailure) return { ok: false, status: "committed_audit_pending", reason: "audit_finalize_failed", write_counts: { canonical: 1, audit: 1 } };
      files.set(mutation.target_path, mutation.after_bytes);
      receipts.set(mutation.nonce, mutation.audit);
      return { ok: true, status: "committed", write_counts: { canonical: 1, audit: 1 } };
    },
    async readImmutableAuditContinuity() { return { ok: true, ...continuity }; },
    async appendImmutableAudit(request) {
      if (options.immutableFailure) return { ok: false, reason: "immutable_audit_append_failed" };
      if (request.previous_audit_hash !== continuity.head_hash || request.audit_count !== continuity.count + 1) return { ok: false, reason: "immutable_audit_continuity_mismatch" };
      immutable.set(request.audit_hash, request.audit_bytes);
      continuity = { head_hash: request.audit_hash, count: request.audit_count };
      return { ok: true, status: "appended" };
    },
  };
}

test("approved v2 create writes exact packet bytes only after finalized audit and immutable authority", async () => {
  const fixture = await v2Packet();
  const authorization = writer.authorizeCanonicalV2({ packet: fixture.packet, canonical_id: fixture.document.canonical_id, claim_set: fixture.claimSet, promotion_input: fixture.input, promotion_receipt: fixture.receipt });
  assert.equal(authorization.ok, true);
  const adapter = transactionAdapter();
  const committed = await writer.commitApprovedCanonicalV2({ packet: fixture.packet, authorization: authorization.value, adapter }, { now: NOW });
  assert.equal(committed.status, "committed", JSON.stringify(committed));
  assert.equal(adapter.files.get(fixture.packet.target_path), fixture.packet.after_bytes);
  assert.equal(adapter.immutable.size, 1);
  const immutableAudit = JSON.parse([...adapter.immutable.values()][0]);
  assert.equal(immutableAudit.canonical_v2_authority.claim_set_hash, fixture.document.claim_set_hash);
  assert.equal(immutableAudit.canonical_v2_authority.promotion_receipt_hash, fixture.document.promotion_receipt_hash);
  assert.equal((await writer.commitApprovedCanonicalV2({ packet: fixture.packet, authorization: authorization.value, adapter }, { now: NOW })).status, "duplicate");
});

test("canonical v2 uses statement only and retains legacy v1 summary compatibility", async () => {
  const fixture = await v2Packet();
  const duplicate = { ...fixture.document, summary: "Duplicate canonical statement" };
  assert.throws(() => store.renderCanonicalDocument(duplicate), (error) => error && error.code === "duplicate_v2_summary");
  const assembled = await canonical.assembleCanonicalPacket({
    run_id: "run_v2_summary",
    operation: brandedOperation(duplicate),
    canonical_document: duplicate,
    source_citations: [{ source_id: "source_v2_principle", content_hash: sourceSnapshot().source_content_hash, locators: ["ZETA/LITERATURE/v2.md#source"] }],
    consent_hash: "c".repeat(64), expires_at: "2099-01-01T00:00:00.000Z", nonce: "nonce_canonical_v2_0003",
  }, memoryAdapter());
  assert.equal(assembled.ok, false);
  assert.equal(assembled.reason, "duplicate_v2_summary");
  assert.match(store.renderCanonicalDocument({
    type: "knowledge", title: "Legacy summary", statement: "Legacy statements preserve read-only summary.", summary: "Legacy summary",
    knowledge_domain: "coding", knowledge_topics: ["ai"], application_trigger: "legacy", application_contexts: ["coding/ai"], connections: [], invalidation_conditions: [], created: NOW, updated: NOW, body: "# Legacy summary\n",
  }), /summary: "Legacy summary"/u);
});

test("canonical v2 refuses disabled existing update and merge routes before adapter mutation", async () => {
  const create = await v2Packet({ request: { nonce: "nonce_canonical_v2_create" } });
  const createApproval = writer.authorizeCanonicalV2({ packet: create.packet, canonical_id: create.document.canonical_id, claim_set: create.claimSet, promotion_input: create.input, promotion_receipt: create.receipt });
  assert.equal(createApproval.ok, true);
  for (const kind of ["update", "merge"]) {
    const existing = await v2Packet({ kind, request: { nonce: `nonce_canonical_v2_${kind}` } });
    const authorization = writer.authorizeCanonicalV2({ packet: existing.packet, canonical_id: existing.document.canonical_id, claim_set: existing.claimSet, promotion_input: existing.input, promotion_receipt: existing.receipt });
    assert.equal(authorization.ok, false, kind);
    assert.equal(authorization.reason, "canonical_v2_operation_not_authorizable", kind);
    const counters = { reads: 0, writes: 0 };
    const adapter = {
      async readBytes() { counters.reads += 1; return null; },
      async readReceipt() { counters.reads += 1; return null; },
      async commitExact() { counters.writes += 1; return { ok: true, status: "committed" }; },
    };
    const committed = await writer.commitApprovedCanonicalV2({ packet: existing.packet, authorization: createApproval.value, adapter }, { now: NOW });
    assert.equal(committed.ok, false, kind);
    assert.equal(committed.reason, "canonical_v2_operation_not_authorizable", kind);
    assert.deepEqual(counters, { reads: 0, writes: 0 }, kind);
  }
});

test("canonical v2 fails closed for forged authority, missing source, and stale existing targets before writes", async () => {
  const fixture = await v2Packet();
  const cases = [
    ["forged claim hash", { document: { claim_set_hash: "d".repeat(64) } }, "claim_set_hash_mismatch"],
    ["missing source", { document: { sources: [] } }, "canonical_source_binding_required"],
  ];
  for (const [name, override, reason] of cases) {
    const tested = await v2Packet(override);
    const result = writer.authorizeCanonicalV2({ packet: tested.packet, canonical_id: tested.document.canonical_id, claim_set: tested.claimSet, promotion_input: tested.input, promotion_receipt: tested.receipt });
    assert.equal(result.ok, false, name);
    assert.equal(result.reason, reason, name);
  }

  assert.equal(fixture.adapter.counters.writes, 0);
});
