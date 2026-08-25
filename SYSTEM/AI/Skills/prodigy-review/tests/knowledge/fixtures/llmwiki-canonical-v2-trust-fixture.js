"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const path = require("node:path");

const VIEWS = path.resolve(__dirname, "../../../../../../Views");
const store = require(path.join(VIEWS, "knowledge-candidate-store.js"));
const claims = require(path.join(VIEWS, "llmwiki-claim-provenance.js"));
const promotion = require(path.join(VIEWS, "llmwiki-promotion-contract.js"));
const canonical = require(path.join(VIEWS, "llmwiki-canonical-packet.js"));
const operations = require(path.join(VIEWS, "llmwiki-operation-contract.js"));
const writer = require(path.join(VIEWS, "llmwiki-operation-writer.js"));
const obsidian = require(path.join(VIEWS, "llmwiki-obsidian-adapter.js"));
const trust = require(path.join(VIEWS, "llmwiki-canonical-trust.js"));
const resurfacingRead = require(path.join(VIEWS, "llmwiki-resurfacing-read-adapter.js"));
const wikiRead = require(path.join(VIEWS, "llmwiki-wiki-read-adapter.js"));

const NOW = "2026-08-25T12:00:00.000Z";
const sha = (value) => crypto.createHash("sha256").update(String(value), "utf8").digest("hex");
const stable = (value) => Array.isArray(value)
  ? `[${value.map(stable).join(",")}]`
  : value && typeof value === "object"
    ? `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stable(value[key])}`).join(",")}}`
    : JSON.stringify(value);

function createVault() {
  const files = new Map();
  const vault = {
    getAbstractFileByPath: (filePath) => files.get(filePath) || null,
    getFiles: () => [...files.values()].filter((file) => file.extension),
    async read(file) { return file.bytes; },
    async create(filePath, bytes) {
      const file = {
        path: filePath,
        basename: filePath.split("/").pop().replace(/\.md$/u, ""),
        extension: filePath.endsWith(".md") ? "md" : "json",
        bytes,
      };
      files.set(filePath, file);
      return file;
    },
    async modify(file, bytes) { file.bytes = bytes; },
    async delete(file) { files.delete(file.path); },
    async createFolder() {},
  };
  const app = {
    vault,
    metadataCache: {
      getFileCache(file) {
        try {
          return { frontmatter: {
            ...store.parseLifecycleDocument(files.get(file.path)?.bytes || ""),
            deadline: null,
            stale_state: "current",
            unresolved_judgement: false,
            rank: 1,
            source_ids: ["source_fixture_v2"],
            source_revisions: { source_fixture_v2: "a".repeat(64) },
            citations: [{ source_id: "source_fixture_v2", locator: "ZETA/LITERATURE/fixture.md#L1" }],
          } };
        }
        catch (_error) { return { frontmatter: {} }; }
      },
    },
  };
  return { app, files };
}

async function createTrustedFixture(options = {}) {
  const title = options.title || "Fixture authority";
  const sourceText = "The approved v2 item is source-bound and active.";
  const source = {
    source_id: "source_fixture_v2",
    source_kind: "immutable_source",
    source_revision: "a".repeat(64),
    extractor_revision: "b".repeat(64),
    source_text: sourceText,
    source_content_hash: sha(sourceText),
    provider_window: { start: 0, end: sourceText.length },
  };
  const created = claims.createClaimSet({
    source_snapshots: [source],
    claims: [{
      origin: "source_extract",
      text: sourceText,
      citations: [{
        source_id: source.source_id,
        provider_span: { start: 0, end: sourceText.length, span_digest: sha(sourceText) },
      }],
    }],
  });
  assert.equal(created.ok, true, JSON.stringify(created));
  const accepted = claims.transitionClaimSet(created.value, {
    claim_set_hash: created.value.claim_set_hash,
    claim_ids: [created.value.claims[0].claim_id],
    status: "accepted",
    authorized_by: "fixture_reviewer",
    authorized_at: NOW,
  });
  assert.equal(accepted.ok, true, JSON.stringify(accepted));

  const promotionInput = {
    knowledge_kind: "principle",
    classification: "epistemic",
    state: "current",
    title,
    statement: sourceText,
    relation_status: "resolved",
    approval_status: "approved",
    evidence: [{ evidence_id: "fixture_evidence", source_ref: source.source_id, strength: "strong" }],
    claims: [{
      claim_id: "claim_fixture_v2",
      statement: sourceText,
      evidence_refs: ["fixture_evidence"],
      origin: "source_extract",
      review_status: "accepted",
    }],
    principle_boundaries: {
      conditions: ["approved"],
      exclusions: ["unreviewed"],
      invalidation_conditions: ["source revision changes"],
    },
    principle_rationale: "Immutable authority prevents forged provenance.",
  };
  const promotionReceipt = promotion.evaluatePromotion(promotionInput);
  assert.equal(promotionReceipt.canonical_write_eligible, true, JSON.stringify(promotionReceipt));

  const document = {
    schema_version: 2,
    type: "knowledge",
    canonical_id: "knowledge_fixture_v2",
    knowledge_kind: "principle",
    status: "active",
    title,
    statement: sourceText,
    knowledge_domain: "coding",
    knowledge_topics: ["ai"],
    application_trigger: "fixture",
    application_contexts: ["coding/ai"],
    connections: [],
    invalidation_conditions: ["source revision changes"],
    sources: [{ source_id: source.source_id, span: { start: 0, end: sourceText.length } }],
    relations: [{ relation_id: "relation_fixture", target_id: "project_fixture", type: "supports" }],
    claim_set_hash: accepted.value.claim_set_hash,
    promotion_receipt_hash: sha(stable(promotionReceipt)),
    ai_enrichment_status: "none",
    created: NOW,
    updated: NOW,
    body: `# ${title}\n`,
  };
  const operation = operations.parseCanonicalOperation(JSON.stringify({
    operation_id: "operation_fixture_v2",
    proposal_id: "proposal_fixture_v2",
    proposal_kind: "create",
    payload_hash: sha(stable(document)),
  }));
  assert.equal(operation.ok, true, JSON.stringify(operation));

  const disposable = createVault();
  const adapter = obsidian.createObsidianAdapter(disposable.app);
  const packet = await canonical.assembleCanonicalPacket({
    run_id: "run_fixture_v2",
    operation: operation.value,
    canonical_document: document,
    source_citations: [{
      source_id: source.source_id,
      content_hash: source.source_content_hash,
      locators: ["ZETA/LITERATURE/fixture.md#L1"],
    }],
    consent_hash: "c".repeat(64),
    expires_at: "2099-01-01T00:00:00.000Z",
    nonce: "nonce_fixture_v2_0001",
  }, adapter);
  assert.equal(packet.ok, true, JSON.stringify(packet));
  const authorization = writer.authorizeCanonicalV2({
    packet: packet.value,
    canonical_id: document.canonical_id,
    claim_set: accepted.value,
    promotion_input: promotionInput,
    promotion_receipt: promotionReceipt,
  });
  assert.equal(authorization.ok, true, JSON.stringify(authorization));
  if (options.authorizedOnly === true) {
    return Object.freeze({
      document, source, claim_set: accepted.value, promotion_input: promotionInput, promotion_receipt: promotionReceipt,
      packet: packet.value, authorization: authorization.value, adapter, app: disposable.app, files: disposable.files,
    });
  }
  const committed = await writer.commitApprovedCanonicalV2({
    packet: packet.value,
    authorization: authorization.value,
    adapter,
  }, { now: NOW });
  assert.equal(committed.status, "committed", JSON.stringify(committed));

  const canonicalRead = await adapter.readCanonical(packet.value.target_path);
  assert.equal(canonicalRead.bytes, packet.value.after_bytes);
  assert.equal(canonicalRead.revision, packet.value.after_sha256);
  const receipts = await adapter.readFinalizedCanonicalAuthorities();
  assert.equal(receipts.length, 1);
  const trustReceipt = receipts[0];
  assert.equal(obsidian.isFinalizedCanonicalAuthority(trustReceipt), true);
  const binding = obsidian.finalizedCanonicalAuthorityData(trustReceipt);
  assert.equal(binding.canonical_id, document.canonical_id);
  assert.equal(binding.path, packet.value.target_path);
  assert.equal(binding.revision, canonicalRead.revision);
  assert.equal(binding.canonical_v2_authority.canonical_sha256, canonicalRead.revision);
  assert.equal(binding.canonical_v2_authority.claim_set_hash, document.claim_set_hash);
  assert.equal(binding.canonical_v2_authority.promotion_receipt_hash, document.promotion_receipt_hash);

  const sourceRevisions = { [source.source_id]: source.source_revision };
  const decision = trust.decideFinalized({
    bytes: canonicalRead.bytes,
    revision: canonicalRead.revision,
    receipt: trustReceipt,
    source_revisions: sourceRevisions,
  });
  assert.equal(trust.isVerified(decision), true, `${decision.tier}:${decision.status}`);
  const readAdapter = resurfacingRead.create();
  const durable = await readAdapter.read({ app: disposable.app });
  assert.equal(durable.ok, true, JSON.stringify(durable));
  assert.equal(durable.rows.length, 1);
  assert.equal(trust.isVerifiedRow(durable.rows[0]), true);
  assert.equal(durable.rows[0].canonical_id, document.canonical_id);
  assert.equal(durable.rows[0].canonical_revision, canonicalRead.revision);
  assert.equal(durable.rows[0].canonical_bytes, canonicalRead.bytes);
  const wikiSnapshot = wikiRead.buildSnapshot({ collection_revision: canonicalRead.revision, assets: [durable.rows[0]] });
  assert.equal(wikiSnapshot.counts.verified, 1);
  const wikiRow = wikiSnapshot.rows[0];
  assert.equal(trust.isVerifiedRow(wikiRow), true);

  return Object.freeze({
    document,
    source,
    bytes: canonicalRead.bytes,
    revision: canonicalRead.revision,
    authority: binding.canonical_v2_authority,
    trustReceipt,
    decision,
    row: durable.rows[0],
    wikiRow,
    readAdapter,
    source_revisions: sourceRevisions,
    path: packet.value.target_path,
    app: disposable.app,
  });
}

module.exports = { createTrustedFixture };
