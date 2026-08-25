"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");
const { test } = require("node:test");

const ROOT = path.resolve(__dirname, "../../../../../..");
const trust = require(path.join(ROOT, "SYSTEM/Views/llmwiki-canonical-trust.js"));
const store = require(path.join(ROOT, "SYSTEM/Views/knowledge-candidate-store.js"));
const para = require(path.join(ROOT, "SYSTEM/Views/knowledge-para-projection.js"));
const wiki = require(path.join(ROOT, "SYSTEM/Views/llmwiki-wiki-read-adapter.js"));
const query = require(path.join(ROOT, "SYSTEM/Views/llmwiki-query-readonly.js"));
const lifecycle = require(path.join(ROOT, "SYSTEM/Views/llmwiki-knowledge-lifecycle.js"));
const resurfacing = require(path.join(ROOT, "SYSTEM/Views/llmwiki-resurfacing-service.js"));
const resurfacingFeedback = require(path.join(ROOT, "SYSTEM/Views/llmwiki-resurfacing-feedback-store.js"));
const obsidian = require(path.join(ROOT, "SYSTEM/Views/llmwiki-obsidian-adapter.js"));
const canonical = require(path.join(ROOT, "SYSTEM/Views/llmwiki-canonical-packet.js"));
const operations = require(path.join(ROOT, "SYSTEM/Views/llmwiki-operation-contract.js"));
const writer = require(path.join(ROOT, "SYSTEM/Views/llmwiki-operation-writer.js"));
const evidenceContract = require(path.join(ROOT, "SYSTEM/Views/llmwiki-evidence-contract.js"));
const { createTrustedFixture } = require("./fixtures/llmwiki-canonical-v2-trust-fixture.js");

const SNAPSHOT_REVISION = "a".repeat(64);
const UPDATE_NOW = "2026-08-25T13:00:00.000Z";
const ZERO_WRITES = Object.freeze({ canonical: 0, audit: 0, derived: 0, provider: 0, network: 0, git: 0 });
const CONTEXT = Object.freeze({ workspace: "project", tab: null, selection: null });

function stable(value) {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (!value || typeof value !== "object") return JSON.stringify(value);
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stable(value[key])}`).join(",")}}`;
}

function evidenceInput(operationId) {
  return {
    operation_id: operationId,
    claims: [{ claim_id: "claim_update_fixture", text: "The reviewed revision is source-grounded.", changed: true, citation_ids: ["citation_update_fixture"] }],
    citations: [{
      citation_id: "citation_update_fixture",
      source_id: "source_update_fixture",
      source_span: { locator: "ZETA/LITERATURE/update-fixture.md#claim", start: 0, end: 24 },
      source_length: 24,
      source_content_hash: "c".repeat(64),
      extractor_revision: "d".repeat(64),
    }],
    verification: {
      verified_at: UPDATE_NOW,
      owner: { owner_id: "reviewer_fixture", owner_type: "human" },
      validity_conditions: ["source revision remains current"],
      invalidation_conditions: ["source is withdrawn"],
      stale_triggers: [{ trigger_id: "trigger_fixture_revision", kind: "extractor_revision_changed", source_id: "source_update_fixture" }],
    },
    current_source_snapshots: { source_update_fixture: { source_length: 24, content_hash: "c".repeat(64), extractor_revision: "d".repeat(64) } },
    triggered_conditions: [],
  };
}

function updateDocument(genuine, statement) {
  return {
    ...genuine.document,
    statement,
    body: `# Fixture authority\n${statement}\n`,
    updated: UPDATE_NOW,
  };
}

async function assembleApprovedUpdate(genuine, afterDocument, nonce) {
  const operation = operations.parseCanonicalOperation(JSON.stringify({
    operation_id: `operation_${nonce}`,
    proposal_id: `proposal_${nonce}`,
    proposal_kind: "update",
    payload_hash: trust.sha256(stable(afterDocument)),
  }));
  assert.equal(operation.ok, true, JSON.stringify(operation));
  const realAdapter = obsidian.createObsidianAdapter(genuine.app);
  const assembled = await canonical.assembleCanonicalPacket({
    run_id: `run_${nonce}`,
    operation: operation.value,
    target_path: genuine.path,
    canonical_document: afterDocument,
    source_citations: [{ source_id: genuine.source.source_id, content_hash: genuine.source.source_content_hash, locators: ["ZETA/LITERATURE/fixture.md#L1"] }],
    consent_hash: "c".repeat(64),
    expires_at: "2099-01-01T00:00:00.000Z",
    nonce,
  }, { readBytes: async (targetPath) => (await realAdapter.readCanonical(targetPath)).bytes });
  assert.equal(assembled.ok, true, JSON.stringify(assembled));
  const evaluated = evidenceContract.evaluateEvidence(evidenceInput(operation.value.operation_id));
  assert.equal(evaluated.ok, true, JSON.stringify(evaluated));
  const authorized = writer.authorizeCanonicalUpdate({
    packet: assembled.value,
    canonical_id: genuine.document.canonical_id,
    evidence: evaluated.value,
    compensation_plan: {
      strategy: "restore_exact_before_bytes",
      target_path: assembled.value.target_path,
      before_sha256: assembled.value.before_sha256,
    },
  });
  assert.equal(authorized.ok, true, JSON.stringify(authorized));
  const updateAdapter = {
    readCanonical: (targetPath) => realAdapter.readCanonical(targetPath),
    atomicReplace: async (request) => {
      writer.assertAtomicReplaceRequest(request, (await realAdapter.readCanonical(request.target_path)).bytes);
      await genuine.app.vault.modify(genuine.app.vault.getAbstractFileByPath(request.target_path), request.after_bytes);
      return { ok: true, status: "replaced" };
    },
    restoreExact: async (request) => {
      writer.assertRestoreRequest(request, (await realAdapter.readCanonical(request.target_path)).bytes);
      await genuine.app.vault.modify(genuine.app.vault.getAbstractFileByPath(request.target_path), request.restore_bytes);
      return { ok: true, status: "restored" };
    },
    prepareAudit: (mutation) => realAdapter.prepareAudit(mutation),
    finalizeAudit: (prepared, bytes) => realAdapter.finalizeAudit(prepared, bytes),
    appendImmutableAudit: (request) => realAdapter.appendImmutableAudit(request),
    readImmutableAuditContinuity: () => realAdapter.readImmutableAuditContinuity(),
    readImmutableAudit: (hash) => realAdapter.readImmutableAudit(hash),
    readFinalizedCanonicalAuthorities: () => realAdapter.readFinalizedCanonicalAuthorities(),
  };
  return { realAdapter, updateAdapter, packet: assembled.value, authorization: authorized.value };
}

function lifecycleRow(genuine) {
  return trust.bindVerifiedRow(Object.freeze({
    document_id: genuine.document.canonical_id,
    canonical_revision: genuine.revision,
    source_ids: [genuine.source.source_id],
  }), genuine.decision);
}

test("canonical v2 trust requires one finalized immutable decision across every read surface", async () => {
  const genuine = await createTrustedFixture();
  assert.equal(trust.isVerified(genuine.decision), true);
  assert.equal(trust.isVerifiedRow(genuine.row), true);

  const browse = wiki.buildSnapshot({ collection_revision: "finalized-v2", assets: [genuine.row] });
  assert.equal(browse.counts.verified, 1);
  assert.equal(wiki.browseRead({ snapshot: browse }).rows.length, 1);
  const queried = query.queryRead({
    query: "approved v2",
    mode: "verified",
    scope: { types: ["knowledge"] },
    snapshot: { snapshot_revision: SNAPSHOT_REVISION, current_revision: SNAPSHOT_REVISION, documents: browse.rows },
  });
  assert.equal(queried.value.results.length, 1);

  const maintenance = lifecycle.createTrustedMaintenanceSnapshot({
    snapshot_revision: SNAPSHOT_REVISION,
    current_revision: SNAPSHOT_REVISION,
    canonical_documents: [lifecycleRow(genuine)],
    triggers: [],
    feedback: [],
  });
  assert.equal(maintenance.ok, true, JSON.stringify(maintenance));
  const resurfaced = resurfacing.create({ readAdapter: genuine.readAdapter }).resurface({
    context: { workspace: "project", tab: null, selection: null },
    items: [genuine.row],
  });
  assert.equal(resurfaced.count, 1);
  const linked = para.projectParaKnowledge(browse.rows, [{
    path: "PARA/PROJECTS/Trust.md",
    type: "project",
    connections: [`[[${genuine.path.replace(/^.*\//u, "").replace(/\.md$/u, "")}]]`],
  }]);
  assert.equal(linked.total_links, 1);
});

test("exposed finalized authority cannot be mutated to verify unaudited canonical bytes", async () => {
  const genuine = await createTrustedFixture();
  const exposed = obsidian.finalizedCanonicalAuthorityData(genuine.trustReceipt);
  const before = JSON.stringify(exposed);
  const unauditedBytes = store.renderCanonicalDocument({ ...genuine.document, body: "# Unaudited replacement\n" });
  const unauditedRevision = trust.sha256(unauditedBytes);
  try { exposed.canonical_v2_authority.canonical_sha256 = unauditedRevision; } catch (_error) { /* expected after repair */ }
  const forged = trust.decideFinalized({
    bytes: unauditedBytes,
    revision: unauditedRevision,
    receipt: genuine.trustReceipt,
    source_revisions: genuine.source_revisions,
  });
  assert.equal(trust.isVerified(forged), false);
  assert.equal(JSON.stringify(obsidian.finalizedCanonicalAuthorityData(genuine.trustReceipt)), before);
});

test("finalized authority display views are detached and recursively immutable", async () => {
  const genuine = await createTrustedFixture();
  const first = obsidian.finalizedCanonicalAuthorityData(genuine.trustReceipt);
  const second = obsidian.finalizedCanonicalAuthorityData(genuine.trustReceipt);
  const before = JSON.stringify(first);
  assert.notEqual(first, second);
  assert.notEqual(first.canonical_v2_authority, second.canonical_v2_authority);
  const mutations = [
    (view) => { view.revision = "0".repeat(64); },
    (view) => { view.canonical_v2_authority.canonical_sha256 = "1".repeat(64); },
    (view) => { view.canonical_v2_authority.canonical_id = "knowledge_attacker"; },
    (view) => { view.canonical_v2_authority.claim_set_hash = "2".repeat(64); },
    (view) => { view.canonical_v2_authority.claim_set.claim_set_hash = "3".repeat(64); },
    (view) => { view.canonical_v2_authority.claim_set.claims[0].claim_id = "claim_attacker"; },
    (view) => { view.canonical_v2_authority.promotion_receipt_hash = "4".repeat(64); },
    (view) => { view.canonical_v2_authority.promotion_receipt.canonical_write_eligible = false; },
    (view) => { view.canonical_v2_authority.promotion_receipt.input_binding = "attacker"; },
    (view) => { view.canonical_v2_authority.sources.push({ source_id: "source_attacker" }); },
    (view) => { view.canonical_v2_authority.sources[0].source_id = "source_attacker"; },
    (view) => { view.canonical_v2_authority.relations.splice(0, 1); },
    (view) => { view.canonical_v2_authority.relations[0].relation_id = "relation_attacker"; },
    (view) => { view.canonical_v2_authority.claim_set.sources[0].source_revision = "5".repeat(64); },
    (view) => { view.canonical_v2_authority.claim_set.claims[0].citation_ids.push("citation_attacker"); },
    (view) => { view.canonical_v2_authority.claim_set.extra = true; },
    (view) => { Object.setPrototypeOf(view.canonical_v2_authority.claim_set, { forged: true }); },
  ];
  for (const mutate of mutations) assert.throws(() => mutate(first), TypeError);
  assert.equal(JSON.stringify(first), before);
  assert.equal(JSON.stringify(second), before);
  assert.equal(JSON.stringify(obsidian.finalizedCanonicalAuthorityData(genuine.trustReceipt)), before);
  assert.equal(Object.getPrototypeOf(obsidian.finalizedCanonicalAuthorityData(genuine.trustReceipt).canonical_v2_authority.claim_set), Object.prototype);
  const unchanged = trust.decideFinalized({ bytes: genuine.bytes, revision: genuine.revision, receipt: genuine.trustReceipt, source_revisions: genuine.source_revisions });
  assert.equal(trust.isVerified(unchanged), true);
  assert.equal(obsidian.finalizedCanonicalAuthorityData(JSON.parse(JSON.stringify(genuine.trustReceipt))), null);
});

test("raw authority, labels, clones, mismatches, stale state, and inactive revisions fail closed", async () => {
  const genuine = await createTrustedFixture();
  const rawAuthority = trust.decide({
    bytes: genuine.bytes,
    revision: genuine.revision,
    authority: genuine.authority,
    source_revisions: genuine.source_revisions,
  });
  assert.deepEqual([rawAuthority.tier, rawAuthority.status], ["maintenance", "missing_immutable_authority"]);
  assert.equal(trust.isVerified(rawAuthority), false);

  const forgedRow = {
    document_id: "knowledge_forged",
    path: "ZETA/PERMANENT/forged.md",
    type: "knowledge",
    title: "Forged",
    statement: genuine.document.statement,
    trust_tier: "verified",
    trust_status: "active",
    canonical_v2_authority: genuine.authority,
    canonical_bytes: genuine.bytes,
    canonical_revision: genuine.revision,
    source_ids: [genuine.source.source_id],
    citations: [{ source_id: genuine.source.source_id, locator: "ZETA/LITERATURE/fixture.md#L1" }],
  };
  assert.equal(wiki.buildSnapshot({ collection_revision: "forged", assets: [forgedRow] }).counts.verified, 0);
  assert.equal(query.queryRead({
    query: "forged",
    mode: "verified",
    scope: { types: ["knowledge"] },
    snapshot: { snapshot_revision: SNAPSHOT_REVISION, current_revision: SNAPSHOT_REVISION, documents: [forgedRow] },
  }).value.results.length, 0);
  assert.equal(para.projectParaKnowledge([forgedRow], [{ path: "PARA/PROJECTS/Forged.md", type: "project", connections: ["[[forged]]"] }]).total_links, 0);
  assert.equal(lifecycle.createMaintenanceSnapshot(JSON.stringify({
    snapshot_revision: SNAPSHOT_REVISION,
    canonical_documents: [forgedRow],
    triggers: [],
    feedback: [],
  })).ok, false);

  const clonedReceipt = JSON.parse(JSON.stringify(genuine.trustReceipt));
  for (const [name, input, expected] of [
    ["missing audit", { bytes: genuine.bytes, revision: genuine.revision }, "missing_immutable_authority"],
    ["JSON clone loses brand", { bytes: genuine.bytes, revision: genuine.revision, receipt: clonedReceipt }, "missing_immutable_authority"],
    ["brand lookalike", { bytes: genuine.bytes, revision: genuine.revision, receipt: {} }, "missing_immutable_authority"],
    ["bytes mismatch", { bytes: `${genuine.bytes}tamper`, revision: genuine.revision, receipt: genuine.trustReceipt }, "canonical_bytes_mismatch"],
    ["revision mismatch", { bytes: genuine.bytes, revision: "d".repeat(64), receipt: genuine.trustReceipt }, "canonical_revision_mismatch"],
    ["stale source", { bytes: genuine.bytes, revision: genuine.revision, receipt: genuine.trustReceipt, source_revisions: { [genuine.source.source_id]: "f".repeat(64) } }, "stale_source"],
  ]) {
    const decision = trust.decideFinalized(input);
    assert.deepEqual([decision.tier, decision.status], ["maintenance", expected], name);
    assert.equal(trust.isVerified(decision), false, name);
  }

  for (const status of ["superseded", "quarantined"]) {
    const bytes = store.renderCanonicalDocument({ ...genuine.document, status });
    const decision = trust.decideFinalized({ bytes, revision: trust.sha256(bytes), receipt: genuine.trustReceipt });
    assert.deepEqual([decision.tier, decision.status], ["maintenance", status]);
  }

  for (const [document, expected] of [
    [{ type: "knowledge", schema_version: 1 }, ["legacy_review", "legacy_review"]],
    [{ type: "permanent_note" }, ["legacy_readable", "legacy_review"]],
    [{ type: "literature_note" }, ["supporting", "supporting_only"]],
    [{ type: "knowledge_candidate" }, ["excluded", "pending"]],
    [{ type: "fleeting_note" }, ["excluded", "pending"]],
  ]) assert.deepEqual(Object.values(trust.decide({ document })).slice(0, 2), expected);
});

async function mutedFirstRevision() {
  const genuine = await createTrustedFixture();
  const backing = new Map();
  const feedbackStore = resurfacingFeedback.create({
    storage: {
      getItem: (key) => (backing.has(key) ? backing.get(key) : null),
      setItem: (key, value) => void backing.set(key, String(value)),
      removeItem: (key) => void backing.delete(key),
    },
  });
  const service = resurfacing.create({ readAdapter: genuine.readAdapter, feedbackStore });
  const firstRead = await genuine.readAdapter.read({ app: genuine.app });
  assert.equal(firstRead.rows.length, 1);
  const first = service.resurface({ context: CONTEXT, items: firstRead.rows });
  assert.equal(first.count, 1);
  assert.equal(first.items[0].revision_rule, "exact_revision_binding");
  const mute = await service.feedback({
    action: "mute",
    context: CONTEXT,
    action_identity: first.items[0].actions.find((action) => action.type === "mute").identity,
  });
  assert.equal(mute.ok, true, JSON.stringify(mute));
  assert.equal(service.resurface({ context: CONTEXT, items: firstRead.rows }).count, 0, "muted exact revision stays hidden");
  return { genuine, service };
}

async function applyApprovedUpdate(genuine, statement, nonce, adapterOverride) {
  const prepared = await assembleApprovedUpdate(genuine, updateDocument(genuine, statement), nonce);
  const adapter = adapterOverride || prepared.updateAdapter;
  const committed = await writer.commitApprovedUpdate({
    packet: prepared.packet,
    authorization: prepared.authorization,
    adapter,
  }, { now: UPDATE_NOW });
  return { ...prepared, committed };
}

test("approved update finalizes a new canonical v2 revision that resurfaces once while revision 1 stays muted", async () => {
  const { genuine, service } = await mutedFirstRevision();
  const applied = await applyApprovedUpdate(genuine, "The approved v2 item is revised and still source-bound.", "nonce_fixture_update_001");
  assert.equal(applied.committed.status, "committed", JSON.stringify(applied.committed));

  const rev2Bytes = (await applied.realAdapter.readCanonical(genuine.path)).bytes;
  const rev2 = trust.sha256(rev2Bytes);
  assert.notEqual(rev2, genuine.revision);

  const authorities = await applied.realAdapter.readFinalizedCanonicalAuthorities();
  assert.equal(authorities.length, 1);
  const binding = obsidian.finalizedCanonicalAuthorityData(authorities[0]);
  assert.equal(binding.canonical_id, genuine.document.canonical_id);
  assert.equal(binding.revision, rev2);
  assert.equal(binding.canonical_v2_authority.canonical_sha256, rev2);
  assert.equal(binding.canonical_v2_authority.claim_set_hash, genuine.authority.claim_set_hash);
  assert.equal(binding.canonical_v2_authority.promotion_receipt_hash, genuine.authority.promotion_receipt_hash);
  const revived = trust.decideFinalized({ bytes: rev2Bytes, revision: rev2, receipt: authorities[0], source_revisions: genuine.source_revisions });
  assert.equal(trust.isVerified(revived), true, `${revived.tier}:${revived.status}`);
  const retired = trust.decideFinalized({ bytes: genuine.bytes, revision: genuine.revision, receipt: authorities[0], source_revisions: genuine.source_revisions });
  assert.equal(trust.isVerified(retired), false, "superseded revision 1 loses its finalized decision");

  const secondRead = await genuine.readAdapter.read({ app: genuine.app });
  assert.equal(secondRead.rows.length, 1);
  assert.equal(secondRead.rows[0].canonical_revision, rev2);
  assert.equal(secondRead.rows[0].canonical_id, genuine.document.canonical_id);
  assert.equal(trust.isVerifiedRow(secondRead.rows[0]), true);
  const second = service.resurface({ context: CONTEXT, items: secondRead.rows });
  assert.equal(second.count, 1, JSON.stringify(second));
  assert.equal(second.items[0].canonical_revision, rev2);
  assert.equal(second.items[0].item_id, `item_${genuine.document.canonical_id}`);
  assert.equal(second.items[0].revision_rule, "revision_change_resurfaces");

  const replay = await writer.commitApprovedUpdate({
    packet: applied.packet,
    authorization: applied.authorization,
    adapter: applied.updateAdapter,
  }, { now: "2026-08-25T13:01:00.000Z" });
  assert.equal(replay.status, "duplicate");
  assert.deepEqual(replay.write_counts, ZERO_WRITES);

  const forgedSerialized = { ...secondRead.rows[0], trust_receipt: JSON.parse(JSON.stringify(authorities[0])) };
  assert.equal(trust.isVerifiedRow(forgedSerialized), false);
  assert.equal(wiki.buildSnapshot({ collection_revision: rev2, assets: [forgedSerialized] }).counts.verified, 0);

  await genuine.app.vault.modify(genuine.app.vault.getAbstractFileByPath(genuine.path), `${rev2Bytes}unaudited tail`);
  const unaudited = await genuine.readAdapter.read({ app: genuine.app });
  assert.equal(unaudited.rows.length, 0, "unaudited canonical bytes disappear from the trusted surface");
});

test("stale update targets zero-mutate and resurface only after exact restoration", async () => {
  const { genuine, service } = await mutedFirstRevision();
  const applied = await applyApprovedUpdate(genuine, "Second revision through the approved update authority.", "nonce_fixture_update_002");
  assert.equal(applied.committed.status, "committed", JSON.stringify(applied.committed));
  const rev2 = trust.sha256((await applied.realAdapter.readCanonical(genuine.path)).bytes);

  const drifted = await applyApprovedUpdate(genuine, "Third revision blocked by external drift.", "nonce_fixture_update_003", {
    ...applied.updateAdapter,
    readCanonical: (targetPath) => Promise.resolve({ path: targetPath, bytes: "external concurrent revision\n" }),
  });
  assert.equal(drifted.committed.ok, false);
  assert.equal(drifted.committed.reason, "stale_before_write");
  assert.deepEqual(drifted.committed.write_counts, ZERO_WRITES);
  assert.equal(writer.isApprovalConsumed(drifted.authorization), false);
  const unchanged = await applied.realAdapter.readCanonical(genuine.path);
  assert.equal(trust.sha256(unchanged.bytes), rev2, "stale target left canonical bytes untouched");

  const recovered = await applyApprovedUpdate(genuine, "Third revision after exact restoration.", "nonce_fixture_update_003");
  assert.equal(recovered.committed.status, "committed", JSON.stringify(recovered.committed));
  const rev3 = trust.sha256((await recovered.realAdapter.readCanonical(genuine.path)).bytes);
  assert.notEqual(rev3, rev2);
  const thirdRead = await genuine.readAdapter.read({ app: genuine.app });
  assert.equal(thirdRead.rows.length, 1);
  assert.equal(thirdRead.rows[0].canonical_revision, rev3);
  const third = service.resurface({ context: CONTEXT, items: thirdRead.rows });
  assert.equal(third.count, 1);
  assert.equal(third.items[0].canonical_revision, rev3);
  assert.equal(third.items[0].revision_rule, "revision_change_resurfaces");
});

test("failed authority audit leaves the trusted surface on the last finalized revision", async () => {
  const { genuine, service } = await mutedFirstRevision();
  const applied = await applyApprovedUpdate(genuine, "Second finalized revision baseline.", "nonce_fixture_update_004");
  assert.equal(applied.committed.status, "committed", JSON.stringify(applied.committed));
  const rev2 = trust.sha256((await applied.realAdapter.readCanonical(genuine.path)).bytes);

  const sabotaged = await applyApprovedUpdate(genuine, "Third revision whose audit cannot finalize.", "nonce_fixture_update_005", {
    ...applied.updateAdapter,
    finalizeAudit: () => Promise.resolve({ ok: false, status: "rejected", reason: "audit_finalize_failed" }),
  });
  assert.equal(sabotaged.committed.ok, false, JSON.stringify(sabotaged.committed));
  assert.equal(sabotaged.committed.status, "committed_authority_pending");
  assert.equal(writer.isApprovalConsumed(sabotaged.authorization), false);
  const authorities = await applied.realAdapter.readFinalizedCanonicalAuthorities();
  assert.equal(authorities.length, 1);
  assert.equal(obsidian.finalizedCanonicalAuthorityData(authorities[0]).revision, rev2, "chain head stays at the last fully finalized revision");
  const unauditedBytes = await genuine.readAdapter.read({ app: genuine.app });
  assert.equal(unauditedBytes.rows.length, 0, "unaudited post-replace bytes earn no trusted row");

  // Restoring the exact last-finalized bytes recovers the trusted surface without any new authorization.
  await genuine.app.vault.modify(genuine.app.vault.getAbstractFileByPath(genuine.path), applied.packet.after_bytes);
  const stillTrusted = await genuine.readAdapter.read({ app: genuine.app });
  assert.equal(stillTrusted.rows.length, 1);
  assert.equal(stillTrusted.rows[0].canonical_revision, rev2);
  assert.equal(service.resurface({ context: CONTEXT, items: stillTrusted.rows }).items[0].canonical_revision, rev2);
});
