"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "../../../../../..");
const sourceStore = require(path.join(ROOT, "SYSTEM/Views/knowledge-source-store.js"));
const candidateStore = require(path.join(ROOT, "SYSTEM/Views/knowledge-candidate-store.js"));

const TEMPLATE_PATHS = Object.freeze([
  "SYSTEM/TEMPLATE/FORMAT/template_fleeting_note.md",
  "SYSTEM/TEMPLATE/FORMAT/template_literature_note.md",
  "SYSTEM/TEMPLATE/FORMAT/template_knowledge_candidate.md",
  "SYSTEM/TEMPLATE/FORMAT/template_knowledge.md",
  "SYSTEM/TEMPLATE/FORMAT/template_permanent_note.md",
]);

function bytes(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), "utf8");
}

function sha256(value) {
  return crypto.createHash("sha256").update(value, "utf8").digest("hex");
}

function canonicalFixture() {
  return {
    title: "직렬화 경계",
    statement: "구조화 메타데이터는 결정적으로 기록한다.",
    knowledge_domain: "coding",
    knowledge_topics: ["ai"],
    application_trigger: "승인 전",
    application_contexts: ["coding/ai"],
    connections: [],
    invalidation_conditions: [],
    summary: "",
    created: "2026-08-25T00:00:00.000Z",
    updated: "2026-08-25T00:00:00.000Z",
    body: "# 직렬화 경계\n",
  };
}

function canonicalV2Fixture() {
  const { summary: _summary, ...document } = canonicalFixture();
  return document;
}

function testLegacyCharacterization() {
  // permanent_note remains byte-for-byte legacy-only; v1 serializers remain readable.
  assert.equal(sha256(bytes("SYSTEM/TEMPLATE/FORMAT/template_permanent_note.md")), "d261412ddfa0cb736562c12e6adf945f5b3404c44b8bedbdf411427e2c5f3d48");

  const source = sourceStore.renderSourceDocument(sourceStore.normalizeSourceInput({
    source_kind: "article", source_url: "https://example.com/lifecycle", source_title: "문헌 경계",
    my_interpretation: "기존 문헌 직렬화를 확인한다.", knowledge_domain: "coding", knowledge_topics: ["ai"],
  }), { now: "2026-08-25T00:00:00.000Z" });
  assert.equal(sourceStore.renderSourceDocument({ ...sourceStore.parseFrontmatter(source).data, my_interpretation: "기존 문헌 직렬화를 확인한다.", source_claim: "", reusable_knowledge: "", ai_summary: "", ai_uncertainty: "" }, { now: "2026-08-25T00:00:00.000Z" }), source);

  const canonical = candidateStore.renderCanonicalDocument(canonicalFixture());
  const parsed = candidateStore.parseFrontmatter(canonical);
  assert.equal(candidateStore.renderCanonicalDocument({ ...parsed.data, body: parsed.body }), canonical);
}

function testV2TemplateBytes() {
  const templateHashes = Object.fromEntries(TEMPLATE_PATHS.slice(0, -1).map((templatePath) => [templatePath, sha256(bytes(templatePath))]));
  assert.deepEqual(templateHashes, {
    "SYSTEM/TEMPLATE/FORMAT/template_fleeting_note.md": "df71edd2c334a7b0ea8a6e0cccf8f5abc75d3168d5e641e5fa56973f6ff97c9a",
    "SYSTEM/TEMPLATE/FORMAT/template_literature_note.md": "6523b83b148c6ac6a2d617929d492c58d015be196c3ccaee2b1396d4a3b8d603",
    "SYSTEM/TEMPLATE/FORMAT/template_knowledge_candidate.md": "cf338108d2038fdc81d915bf78bba4bd17ac9b9e5a1dd431707d80c9db28ae17",
    "SYSTEM/TEMPLATE/FORMAT/template_knowledge.md": "1dea19ae791471a7f040d42f4f51b01e3f058f6cc344cd53d18c376b406498bd",
  });
}

function testV2LifecycleRoundTrips() {
  const literature = sourceStore.renderLifecycleSourceDocument({
    schema_version: 2,
    source_kind: "article", source_url: "https://example.com/lifecycle", source_title: "문헌 경계",
    source_id: "source-lifecycle-alpha", source_batch_id: "batch-lifecycle-alpha",
    my_interpretation: "출처와 해석을 분리한다.", knowledge_domain: "coding", knowledge_topics: ["ai"],
    sources: [{ locator: { end: 12, start: 0 }, source_id: "source-lifecycle-alpha" }],
    relations: [{ relation_id: "relation-literature-alpha", target_id: "candidate-lifecycle-alpha", type: "supports" }],
  }, { now: "2026-08-25T00:00:00.000Z" });
  assert.equal(sourceStore.renderLifecycleSourceDocument(sourceStore.parseLifecycleDocument(literature)), literature);

  const fleeting = candidateStore.renderFleetingDocument({
    schema_version: 2, fleeting_id: "fleeting-lifecycle-alpha", created: "2026-08-25T00:00:00.000Z",
    blocks: [{ block_id: "fleeting-block-alpha", sources: [{ source_id: "source-lifecycle-alpha", span: { end: 12, start: 0 } }], text: "짧은 생각" }],
  });
  assert.equal(candidateStore.renderFleetingDocument(candidateStore.parseLifecycleDocument(fleeting)), fleeting);

  const candidate = candidateStore.renderLifecycleCandidateDocument({
    schema_version: 2, candidate_id: "candidate-lifecycle-alpha", status: "needs_more_evidence",
    title: "후보 경계", statement: "승격 공백을 구조적으로 기록한다.", created: "2026-08-25T00:00:00.000Z", updated: "2026-08-25T00:00:00.000Z",
    promotion_gaps: [{ gate_id: "relation", phase: "relation", state: "fail", reason_code: "missing_relation", evidence_refs: ["source-lifecycle-alpha"] }],
    sources: [{ source_id: "source-lifecycle-alpha", span: { end: 12, start: 0 } }],
    relations: [{ relation_id: "relation-candidate-alpha", target_id: "canonical-lifecycle-alpha", type: "related" }],
    body: "# 후보 경계\n",
  });
  assert.equal(candidateStore.renderLifecycleCandidateDocument(candidateStore.parseLifecycleDocument(candidate)), candidate);

  const canonical = candidateStore.renderCanonicalDocument({
    ...canonicalV2Fixture(), schema_version: 2, canonical_id: "canonical-lifecycle-alpha", knowledge_kind: "principle",
    sources: [{ source_id: "source-lifecycle-alpha", span: { end: 12, start: 0 } }],
    relations: [{ relation_id: "relation-canonical-alpha", target_id: "canonical-lifecycle-beta", type: "extends" }],
    claim_set_hash: "a".repeat(64), promotion_receipt_hash: "b".repeat(64), ai_enrichment_status: "accepted", status: "active",
  });
  assert.equal(candidateStore.renderCanonicalDocument({ ...candidateStore.parseLifecycleDocument(canonical) }), canonical);

  for (const document of [literature, fleeting, candidate, canonical]) {
    assert.doesNotMatch(document, /(?:summary|statement|title): .*\n[\s\S]*# .*\n\n\1/m);
    assert.doesNotMatch(document, /^\w+: (?:""|\[\])$/m);
  }
}

async function testInboxBoundaryIsReadOnly() {
  const files = new Map();
  const writes = [];
  const app = { vault: {
    getAbstractFileByPath(entryPath) { return files.has(entryPath) ? { path: entryPath, extension: "md" } : null; },
    async read(file) { return files.get(file.path); },
    async createFolder() {},
    async create(entryPath, content) { files.set(entryPath, content); writes.push(entryPath); return { path: entryPath, extension: "md" }; },
  } };
  const saved = await sourceStore.saveSource(app, {
    source_path: "INBOX/raw.md", source_kind: "article", source_url: "https://example.com/inbox", source_title: "INBOX 경계",
    my_interpretation: "출력은 별도 문헌에만 쓴다.", knowledge_domain: "coding", knowledge_topics: ["ai"],
  }, { now: "2026-08-25T00:00:00.000Z" });
  assert.match(saved.path, /^ZETA\/LITERATURE\//);
  assert.equal(writes.some((entryPath) => entryPath.startsWith("INBOX/")), false);
  assert.equal(TEMPLATE_PATHS.some((templatePath) => /INBOX/.test(bytes(templatePath))), false);
}

function testV2RejectsUnsafeOrMalformedLifecycleDocuments() {
  const malformed = "---\nschema_version: 2\ntype: knowledge\nsources: [{not-json}]\n---\n# x\n";
  assert.throws(() => candidateStore.parseLifecycleDocument(malformed), (error) => error.code === "malformed_structured_value");
  assert.throws(() => candidateStore.parseLifecycleDocument("---\nschema_version: 3\ntype: knowledge\n---\n# x\n"), (error) => error.code === "unknown_schema_version");
  assert.throws(() => candidateStore.renderCanonicalDocument({ ...canonicalV2Fixture(), schema_version: 2, canonical_id: "canonical-lifecycle-alpha", status: "active", claim_set_hash: "a".repeat(64), promotion_receipt_hash: "b".repeat(64), ai_enrichment_status: "accepted", sources: [{ source_id: "source-alpha", span: { start: 0, end: 1 } }, { source_id: "source-alpha", span: { start: 1, end: 2 } }], relations: [] }), (error) => error.code === "duplicate_stable_id");
  assert.throws(() => candidateStore.renderCanonicalDocument({ ...canonicalV2Fixture(), type: "permanent_note", schema_version: 2 }), /canonical_type_required/);
}

async function main() {
  testLegacyCharacterization();
  testV2TemplateBytes();
  testV2LifecycleRoundTrips();
  await testInboxBoundaryIsReadOnly();
  testV2RejectsUnsafeOrMalformedLifecycleDocuments();
  console.log("Knowledge lifecycle template tests passed");
}

main().catch((error) => { console.error(error.stack || error.message); process.exitCode = 1; });
