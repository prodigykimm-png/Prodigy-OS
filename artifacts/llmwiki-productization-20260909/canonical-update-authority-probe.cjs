"use strict";
// Explicit synthetic harness. All Vault writes occur in the existing in-memory
// test fixture; this file never opens or mutates operational Vault documents.
const assert = require("node:assert/strict");
const path = require("node:path");
const ROOT = path.resolve(__dirname, "../..");
const load = name => require(path.join(ROOT, "SYSTEM/Views", name));
const { createTrustedFixture } = require(path.join(ROOT, "SYSTEM/AI/Skills/prodigy-review/tests/knowledge/fixtures/llmwiki-canonical-v2-trust-fixture.js"));
const trust = load("llmwiki-canonical-trust.js"), obsidian = load("llmwiki-obsidian-adapter.js");
const canonical = load("llmwiki-canonical-packet.js"), operations = load("llmwiki-operation-contract.js");
const writer = load("llmwiki-operation-writer.js"), evidence = load("llmwiki-evidence-contract.js");
const claims = load("llmwiki-claim-provenance.js");
const stable = v => Array.isArray(v) ? `[${v.map(stable).join(",")}]` : v && typeof v === "object" ? `{${Object.keys(v).sort().map(k => `${JSON.stringify(k)}:${stable(v[k])}`).join(",")}}` : JSON.stringify(v);
const NOW = "2026-09-09T12:00:00.000Z";
async function run(changeClaimHash) {
  const a = await createTrustedFixture();
  const sourceText = "Apply the approved item only to an indoor synthetic model.";
  const sourceId = "source_added_b", sourceHash = trust.sha256(sourceText);
  await a.app.vault.create("ZETA/LITERATURE/probe-b.md", sourceText);
  const b = { source_id: sourceId, source_kind: "immutable_source", source_revision: sourceHash,
    extractor_revision: trust.sha256("probe-extractor-v1"), source_text: sourceText,
    source_content_hash: sourceHash, provider_window: { start: 0, end: sourceText.length } };
  const combined = claims.createClaimSet({ source_snapshots: [a.source, b], claims: [a.source, b].map(s => ({
    origin: "source_extract", text: s.source_text, citations: [{ source_id: s.source_id,
      provider_span: { start: 0, end: s.source_text.length, span_digest: s.source_content_hash } }] })) });
  assert.equal(combined.ok, true, JSON.stringify(combined));
  const accepted = claims.transitionClaimSet(combined.value, { claim_set_hash: combined.value.claim_set_hash,
    claim_ids: combined.value.claims.map(c => c.claim_id), status: "accepted", authorized_by: "fixture_reviewer", authorized_at: NOW });
  assert.equal(accepted.ok, true, JSON.stringify(accepted));
  const document = { ...a.document, body: `${a.document.body}\n## Additional condition\n${sourceText}\n`,
    updated: NOW, sources: [...a.document.sources, { source_id: sourceId, span: { start: 0, end: sourceText.length } }],
    ...(changeClaimHash ? { claim_set_hash: accepted.value.claim_set_hash } : {}) };
  const op = operations.parseCanonicalOperation(JSON.stringify({ operation_id: "operation_probe_b", proposal_id: "proposal_probe_b", proposal_kind: "update", payload_hash: trust.sha256(stable(document)) }));
  assert.equal(op.ok, true, JSON.stringify(op));
  const adapter = obsidian.createObsidianAdapter(a.app);
  const assembled = await canonical.assembleCanonicalPacket({ run_id: "run_probe_b", operation: op.value,
    target_path: a.path, canonical_document: document,
    source_citations: [{ source_id: a.source.source_id, content_hash: a.source.source_content_hash, locators: ["ZETA/LITERATURE/fixture.md#L1"] },
      { source_id: sourceId, content_hash: sourceHash, locators: ["ZETA/LITERATURE/probe-b.md#L1"] }],
    consent_hash: "c".repeat(64), expires_at: "2099-01-01T00:00:00.000Z", nonce: "nonce_probe_update_b_0001" }, adapter);
  assert.equal(assembled.ok, true, JSON.stringify(assembled));
  const assessed = evidence.evaluateEvidence({ operation_id: op.value.operation_id,
    claims: [{ claim_id: "claim_probe_b", text: sourceText, changed: true, citation_ids: ["citation_probe_b"] }],
    citations: [{ citation_id: "citation_probe_b", source_id: sourceId, source_span: { locator: "ZETA/LITERATURE/probe-b.md#L1", start: 0, end: sourceText.length },
      source_length: sourceText.length, source_content_hash: sourceHash, extractor_revision: b.extractor_revision }],
    verification: { verified_at: NOW, owner: { owner_id: "fixture_reviewer", owner_type: "human" },
      validity_conditions: ["source remains current"], invalidation_conditions: ["source withdrawn"],
      stale_triggers: [{ trigger_id: "trigger_probe_b", kind: "extractor_revision_changed", source_id: sourceId }] },
    current_source_snapshots: { [sourceId]: { source_length: sourceText.length, content_hash: sourceHash, extractor_revision: b.extractor_revision } }, triggered_conditions: [] });
  assert.equal(assessed.ok, true, JSON.stringify(assessed));
  const approvalInput = { packet: assembled.value, canonical_id: a.document.canonical_id, evidence: assessed.value,
    compensation_plan: { strategy: "restore_exact_before_bytes", target_path: a.path, before_sha256: assembled.value.before_sha256 } };
  const approved = writer.authorizeCanonicalUpdate(approvalInput);
  assert.equal(approved.ok, true, JSON.stringify(approved));
  const extraClaimSet = writer.authorizeCanonicalUpdate({ ...approvalInput, claim_set: accepted.value });
  // Use the existing update test's branded adapter seam. The production
  // Obsidian adapter atomicReplace is branded for merge, not update.
  const updateAdapter = { ...adapter,
    atomicReplace: async request => { writer.assertAtomicReplaceRequest(request, (await adapter.readCanonical(request.target_path)).bytes);
      await a.app.vault.modify(a.app.vault.getAbstractFileByPath(request.target_path), request.after_bytes); return { ok: true, status: "replaced" }; },
    restoreExact: async request => { writer.assertRestoreRequest(request, (await adapter.readCanonical(request.target_path)).bytes);
      await a.app.vault.modify(a.app.vault.getAbstractFileByPath(request.target_path), request.restore_bytes); return { ok: true, status: "restored" }; } };
  const committed = await writer.commitApprovedUpdate({ packet: assembled.value, authorization: approved.value, adapter: updateAdapter }, { now: NOW });
  const live = await adapter.readCanonical(a.path);
  const authorities = await adapter.readFinalizedCanonicalAuthorities();
  const decisions = authorities.map(receipt => trust.decideFinalized({ bytes: live.bytes, revision: live.revision,
    receipt, source_revisions: { ...a.source_revisions, [sourceId]: sourceHash } }));
  const read = await a.readAdapter.read({ app: a.app });
  return { variant: changeClaimHash ? "new_source_and_real_accepted_claim_set_hash" : "new_source_old_claim_set_hash_negative_control",
    fixture_type: "existing_in_memory_vault", provider_calls: 0, operational_writes: 0,
    source_b: { text: sourceText, hash: sourceHash }, create_verified: trust.isVerified(a.decision),
    update_evidence_eligible: assessed.value.approval_eligible, update_commit: committed,
    approval_claim_set_extension: extraClaimSet, final_authority_count: authorities.length,
    trust_decisions: decisions, verified_reader_count: read.rows.filter(trust.isVerifiedRow).length,
    markdown_after: live.bytes };
}
(async () => console.log(JSON.stringify({ results: [await run(true), await run(false)] }, null, 2)))()
  .catch(error => { console.error(error); process.exitCode = 1; });
